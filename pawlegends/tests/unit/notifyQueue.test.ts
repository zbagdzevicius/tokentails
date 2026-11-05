/**
 * LoL pass (lane A): the top notification rail's queue (ui/notifyQueue.ts). Priority order, preemption with requeue,
 * dedupe and ×N counting, per-key cooldowns, stale drops, the cap, supersede rules, the resting line order and the
 * talent hold. Pure logic: time is passed in.
 */
import { describe, expect, it } from 'vitest';
import { NOTE_STALE, NOTE_TTL, NoteQueue, QUEUE_CAP, type Note } from '../../src/ui/notifyQueue';
import { bannerNote, calloutNote } from '../../src/render/juice';

const n = (title: string, prio: Note['prio'], extra: Partial<Note> = {}): Note => ({ title, prio, ...extra });

describe('notify queue', () => {
  it('shows the most important first, then by push time', () => {
    const q = new NoteQueue();
    q.push(n('info', 4), 0);
    q.push(n('announce', 2), 1);
    q.push(n('critical', 0), 2);
    q.push(n('announce 2', 2), 3);
    expect(q.tick(4).main?.title).toBe('critical');
    expect(q.waiting).toEqual(['announce', 'announce 2', 'info']);
  });

  it('preempts after 400 ms (or at once 2+ levels up) and requeues the replaced note at the front of its group', () => {
    const q = new NoteQueue();
    q.push(n('Level 5', 3), 0);
    q.tick(0);
    q.push(n('First Blood!', 2), 100);
    // one level up, up for only 100 ms: it waits
    expect(q.tick(100).main?.title).toBe('Level 5');
    expect(q.tick(400).main?.title).toBe('First Blood!');
    // Level 5 had 800 ms left: not more than 800, so it is gone
    expect(q.waiting).toEqual([]);

    const r = new NoteQueue();
    r.push(n('tip', 4, { ttl: 5000 }), 0);
    r.tick(0);
    r.push(n('older tip', 4), 50);
    r.push(n('Core under attack', 0), 100);
    // 4 levels up: at once
    expect(r.tick(100).main?.title).toBe('Core under attack');
    // the tip had 4.9 s left: back at the front of the prio 4 group, with its time left
    expect(r.waiting).toEqual(['tip', 'older tip']);
    expect(r.tick(100 + NOTE_TTL[0]).main?.title).toBe('tip');
    expect(r.tick(100 + NOTE_TTL[0] + 4800).main?.title).toBe('tip');
    expect(r.tick(100 + NOTE_TTL[0] + 4950).main?.title).not.toBe('tip');
  });

  it('dedupes by key: a showing note refreshes and counts ×N, a queued one is replaced by the newer', () => {
    const q = new NoteQueue();
    q.push(n('Takedown!', 3, { count: true }), 0);
    const a = q.tick(0).main!;
    q.push(n('Takedown!', 3, { count: true }), 500);
    const b = q.tick(500).main!;
    expect(b.id).toBe(a.id); // no re-show
    expect(b.n).toBe(2);
    // the TTL was refreshed from the second push
    expect(q.tick(1600).main?.title).toBe('Takedown!');
    q.push(n('x', 2, { key: 'k' }), 1700);
    q.push(n('y', 2, { key: 'k' }), 1710);
    expect(q.waiting).toEqual(['k']);
    expect(q.tick(3000).main?.title).toBe('y');
  });

  it('a cooldown blocks a re-push of the same key within 8000 ms (the lane help spam)', () => {
    const q = new NoteQueue();
    const lane = n('Your team needs you in Sunny Lane', 4, { key: 'lane-help', cooldown: 8000 });
    expect(q.push(lane, 0)).toBe(true);
    q.tick(0);
    expect(q.push(lane, 1000)).toBe(false);
    expect(q.push(lane, 5000)).toBe(false);
    expect(q.tick(5000).main).toBeNull();
    expect(q.push(lane, 8001)).toBe(true);
  });

  it('drops a queued note once it is stale for its priority', () => {
    const q = new NoteQueue();
    q.push(n('critical', 0, { ttl: 60_000 }), 0);
    q.tick(0);
    q.push(n('danger', 1), 0);
    q.push(n('announce', 2), 0);
    q.push(n('info', 4), 0);
    q.tick(NOTE_STALE[1] + 1);
    expect(q.waiting).toEqual(['announce', 'info']);
    q.tick(NOTE_STALE[2] + 1);
    expect(q.waiting).toEqual(['info']);
    q.tick(NOTE_STALE[4] + 1);
    expect(q.waiting).toEqual([]);
    // the match speed shortens it
    const fast = new NoteQueue();
    fast.speed = 3;
    fast.push(n('critical', 0, { ttl: 60_000 }), 0);
    fast.tick(0);
    fast.push(n('announce', 2), 0);
    fast.tick(NOTE_STALE[2] / 3 + 1);
    expect(fast.waiting).toEqual([]);
  });

  it('caps the queue at QUEUE_CAP, dropping the least important first: a plain note before a big one, then the oldest', () => {
    const q = new NoteQueue();
    expect(QUEUE_CAP).toBe(5);
    q.push(n('info old', 4), 0);
    q.push(n('info new', 4), 1);
    q.push(n('a', 2), 2);
    q.push(n('b', 2), 3);
    q.push(n('ACE!', 2, { big: true }), 4);
    expect(q.push(n('c', 1), 5)).toBe(true);
    expect(q.waiting).toEqual(['c', 'a', 'b', 'ACE!', 'info new']);
    q.push(n('d', 2), 6);
    expect(q.waiting).toEqual(['c', 'a', 'b', 'ACE!', 'd']);
    q.push(n('e', 2), 7);
    // the oldest plain prio 2 note goes; the big ACE stays
    expect(q.waiting).toEqual(['c', 'b', 'ACE!', 'd', 'e']);
  });

  it('a burst of announcer notes: the big ones outlive the plain stale time and all show on one line (QA v2 #8)', () => {
    const q = new NoteQueue();
    q.push(n('Enemy tower down!', 0, { big: true }), 0);
    q.push(n('Tower is hitting you!', 1), 0);
    q.push(n('ACE!', 2, { big: true }), 0);
    q.push(n('An ally has been slain', 2), 0);
    const seen: string[] = [];
    for (let t = 0; t <= 8000; t += 50) {
      const m = q.tick(t).main?.title;
      if (m && seen[seen.length - 1] !== m) seen.push(m);
    }
    // the tower alert is old news after 1.5 s (danger notes go stale fast); the ACE waits up to NOTE_STALE_BIG
    expect(seen.slice(0, 2)).toEqual(['Enemy tower down!', 'ACE!']);
  });

  it('a multikill drops a queued Takedown from the last 1.5 s; a new Level N drops the older Level note', () => {
    const q = new NoteQueue();
    q.push(n('hold', 0, { ttl: 2500 }), 0);
    q.tick(0);
    q.push(calloutNote('Takedown!'), 1000);
    q.push(calloutNote('Level 4'), 1000);
    q.push(bannerNote({ title: 'Double Pounce', tone: 'gold' }), 2000);
    expect(q.waiting).toEqual(['Double Pounce', 'level']);
    q.push(calloutNote('Level 5'), 2100);
    expect(q.tick(2600).main?.title).toBe('Double Pounce');
    expect(q.waiting).toEqual(['level']);
    expect(q.tick(4000).main?.title).toBe('Level 5');
  });

  it('resting line: respawn > countdown > gate > goal; phones show it only while no note is up', () => {
    const q = new NoteQueue();
    q.rest('goal', 'Push with your minions');
    q.rest('gate', 'Gates open in 3');
    expect(q.tick(0).rest?.kind).toBe('gate');
    q.rest('countdown', '2');
    expect(q.tick(0).rest?.text).toBe('2');
    q.rest('respawn', 'Back in 7 · 8 of 9 lives', 'bad');
    expect(q.tick(0).rest?.kind).toBe('respawn');
    q.rest('respawn', null);
    q.rest('countdown', null);
    q.rest('gate', null);
    expect(q.tick(0).rest?.text).toBe('Push with your minions');
    q.push(n('First Blood!', 2), 0);
    expect(q.tick(1).rest).toBeNull();
    q.slots = 2;
    expect(q.tick(2).rest?.kind).toBe('goal');
  });

  it('desktop: a second line takes prio 3-4 while the main line holds prio 0-2; phones show one line', () => {
    const q = new NoteQueue();
    q.slots = 2;
    q.push(n('First Blood!', 2), 0);
    q.push(n('Takedown!', 3), 0);
    q.push(n('Shut down!', 2), 0);
    const s = q.tick(0);
    expect([s.main?.title, s.second?.title]).toEqual(['First Blood!', 'Takedown!']);
    q.slots = 1;
    expect(q.tick(1).second).toBeNull();
  });

  it('while the talent card is open only prio 0-1 notes show', () => {
    const q = new NoteQueue();
    q.hold = true;
    q.push(n('Level 6', 3), 0);
    q.push(n('First Blood!', 2), 0);
    expect(q.tick(0).main).toBeNull();
    q.push(n('Tower aiming at you!', 1), 10);
    expect(q.tick(10).main?.title).toBe('Tower aiming at you!');
    q.hold = false;
    expect(q.tick(10 + NOTE_TTL[1]).main?.title).toBe('First Blood!');
  });

  it('the Juice adapter: lane help and the trackpad toast are prio 4 with cooldowns, urgent is prio 0', () => {
    expect(bannerNote({ title: 'Help in Sunny Lane!' })).toMatchObject({ prio: 4, key: 'lane-help', cooldown: 20000 });
    expect(bannerNote({ title: "Can't go that way" })).toMatchObject({ prio: 4, key: 'cant-go' });
    expect(bannerNote({ title: 'Trackpad mode: click to move' })).toMatchObject({ prio: 4, cooldown: 60000 });
    expect(bannerNote({ title: 'Our core is under attack!', urgent: true }).prio).toBe(0);
    expect(bannerNote({ title: 'First Blood!' })).toMatchObject({ prio: 2, big: true });
    expect(calloutNote('Takedown!')).toMatchObject({ prio: 3, count: true, tag: 'takedown' });
  });
});
