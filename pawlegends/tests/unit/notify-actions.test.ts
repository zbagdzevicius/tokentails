// @vitest-environment happy-dom
/**
 * Party play M5 (MULTIPLAYER.md §7): rail notes with action chips ("Surrender? 1/2 · Yes · No"). The queue keeps an
 * action note sticky (never stale, dropped last by the cap) until it is resolved (drop) or its ttl runs out; the DOM
 * draws each action as a ≥ 40 px button and a tap dispatches `onAction(id, key)`.
 */
import { describe, expect, it } from 'vitest';
import { NOTE_STALE, NoteQueue, QUEUE_CAP, type Note } from '../../src/ui/notifyQueue';
import { Notify } from '../../src/ui/notify';
import { pausedNote, voteNote } from '../../src/app/mpHud';

const vote: Note = { key: 'mp-vote-surrender', title: 'Surrender? 1/2', prio: 1, ttl: 20_000, actions: [{ id: 'vote-surrender-yes', label: 'Yes' }, { id: 'vote-surrender-no', label: 'No' }] };

describe('rail action notes (M5)', () => {
  it('an action note never goes stale while it waits, and the cap drops it last', () => {
    const q = new NoteQueue();
    q.push({ title: 'Core under attack', prio: 0, ttl: 60_000 }, 0);
    q.tick(0);
    q.push(vote, 10);
    // far beyond a prio 1 note's stale time, it still waits behind the prio 0 note
    q.tick(NOTE_STALE[1] * 10);
    expect(q.waiting).toContain('mp-vote-surrender');
    for (let i = 0; i < QUEUE_CAP + 3; i++) q.push({ title: `tip ${i}`, prio: 1 }, 20 + i);
    expect(q.waiting).toContain('mp-vote-surrender');
    expect(q.waiting.length).toBe(QUEUE_CAP);
  });

  it('it stays up for its ttl, a refresh with the same key updates it without a re-show, and drop resolves it', () => {
    const q = new NoteQueue();
    q.push(vote, 0);
    const a = q.tick(0).main!;
    expect(a.actions?.map((x) => x.label)).toEqual(['Yes', 'No']);
    q.push({ ...vote, title: 'Surrender? 2/2', actions: undefined }, 500);
    const b = q.tick(600).main!;
    expect(b.id).toBe(a.id);
    expect(b.title).toBe('Surrender? 2/2');
    expect(b.actions).toBeUndefined();
    expect(q.tick(15_000).main?.key).toBe('mp-vote-surrender');
    q.drop('mp-vote-surrender');
    expect(q.tick(15_001).main).toBeNull();
    // expired: gone after its ttl
    q.push(vote, 20_000);
    q.tick(20_000);
    expect(q.tick(40_001).main).toBeNull();
  });

  it('draws the chips as buttons and dispatches onAction(id, key) on a tap', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const n = new Notify(root);
    const got: string[] = [];
    n.onAction = (id, key) => got.push(`${id}@${key}`);
    n.push(vote);
    n.update(0.016);
    const chips = [...root.querySelectorAll<HTMLButtonElement>('.pl-rail-act')];
    expect(chips.map((c) => c.textContent)).toEqual(['Yes', 'No']);
    expect(root.querySelector('.pl-rail-main')?.classList.contains('has-act')).toBe(true);
    chips[0].dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(got).toEqual(['vote-surrender-yes@mp-vote-surrender']);
    // the chips go once the note has none
    n.push({ ...vote, actions: undefined });
    n.update(0.016);
    expect(root.querySelectorAll('.pl-rail-act')).toHaveLength(0);
    n.dispose();
  });

  it('voteNote: chips until this player voted; results replace the line; pausedNote counts down with Resume', () => {
    const v = { kind: 'surrender' as const, yes: [1], need: 2, leftMs: 18_000 };
    expect(voteNote(v, 0)).toMatchObject({ title: 'Surrender? 1/2', actions: [{ id: 'vote-surrender-yes' }, { id: 'vote-surrender-no' }] });
    expect(voteNote(v, 1)!.actions).toBeUndefined();
    expect(voteNote({ kind: 'pause', yes: [0], need: 3, leftMs: 9000 }, 1)).toMatchObject({ title: 'Pause? 1/3', actions: [{ id: 'vote-pause-yes', label: 'Yes' }] });
    expect(voteNote({ ...v, result: 'fail' }, 0)).toMatchObject({ title: 'Surrender vote failed' });
    expect(voteNote({ kind: 'rematch', yes: [], need: 0, leftMs: 0 }, 0)).toBeNull();
    expect(pausedNote({ paused: true }, 47_000)).toMatchObject({ title: 'Paused 0:47', actions: [{ id: 'vote-resume', label: 'Resume' }] });
    expect(pausedNote({ paused: true, resuming: true }, 2_100)).toMatchObject({ title: 'Resuming in 3' });
    expect(pausedNote({ paused: false }, 0)).toBeNull();
    // phone rail: every vote line fits 28 characters
    for (const n of [voteNote(v, 0)!, pausedNote({ paused: true }, 60_000)!]) expect(n.title.length).toBeLessThanOrEqual(28);
  });
});
