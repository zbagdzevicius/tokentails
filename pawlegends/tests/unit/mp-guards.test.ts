// @vitest-environment happy-dom
/**
 * Party play M5, M7 (MULTIPLAYER.md §4.6): in a party match one client can never stop the sim. Esc, the host's pause
 * and the portrait prompt open a local menu (NetHost.pause is a no-op); a speed is refused; Forfeit is a surrender
 * vote and Pause a pause vote (Esc menu and rail chips); a player with 0 matches gets 3 control hints on the rail in
 * the first 20 s instead of the tutorial.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchSpeedFor } from '../../src/app/mpTypes';
import { NetHost } from '../../src/net/net-host';
import { menuScreen } from '../../src/ui/screens';
import { MpHud, hintsFor } from '../../src/app/mpHud';
import { Op } from '../../src/sim/api';
import type { MatchMsg } from '../../src/net/proto';
import { FakeLink, fakeHost } from './mp-helpers';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const match = { t: 'match', room: 'r', config: { seed: 5, picks: ['clem', 'sage', 'lambo', 'gabe', 'pixel', 'stilts'], tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'easy', humans: [0, 1] }, cosmetics: { heroSkins: [] }, you: { slot: 1 }, names: ['A', 'B', null, null, null, null], turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 0, simVersion: 11 } as unknown as MatchMsg;

describe('party guards (§4.6, M7)', () => {
  it('a speed is refused in a party match (solo keeps it)', () => {
    expect(matchSpeedFor(true, 8)).toBe(1);
    expect(matchSpeedFor(false, 8)).toBe(8);
    expect(matchSpeedFor(false, 500)).toBe(64);
  });

  it("pause (Esc, the host's pause, the portrait prompt) never reaches the sim; Forfeit sends a vote", () => {
    const posts: { t: string }[] = [];
    const json: object[] = [];
    const socket = { listen: () => undefined, sendCmd: () => undefined, sendJson: (m: object) => json.push(m), sendHash: () => undefined, beatNow: () => undefined, rttMs: 50, lastTurn: 0 };
    const h = new NetHost(socket as never, match, { visibility: false, makeWorker: () => ({ post: (m) => void posts.push(m), close: () => undefined }) });
    h.join();
    const before = posts.length;
    h.pause(true);
    h.pause(false);
    expect(posts.slice(before)).toEqual([]);
    h.send({ op: Op.Forfeit });
    expect(json).toContainEqual({ t: 'vote', kind: 'surrender', yes: true });
    h.vote('pause', true);
    expect(json).toContainEqual({ t: 'vote', kind: 'pause', yes: true });
    h.dispose();
  });

  it('the Esc menu in a party match: Menu, Back to match, Vote pause, Vote surrender (no confirm step)', () => {
    const calls: string[] = [];
    const root = menuScreen(document.body, {
      muted: false,
      onResume: () => calls.push('resume'),
      onMute: () => undefined,
      onLeave: () => calls.push('leave'),
      forfeit: { from: 100, tick: 200 },
      onForfeit: () => calls.push('surrender'),
      party: { onVotePause: () => calls.push('pause') },
    });
    expect(root.querySelector('h2')?.textContent).toBe('Menu');
    expect(root.querySelector('[data-a="resume"]')?.textContent).toBe('Back to match');
    expect(root.querySelector('[data-a="forfeit"]')?.textContent).toBe('Vote surrender');
    (root.querySelector('[data-a="vote-pause"]') as HTMLElement).click();
    (root.querySelector('[data-a="forfeit"]') as HTMLElement).click();
    expect(calls).toEqual(['pause', 'surrender']);
    expect(root.querySelector('[data-a="forfeit-yes"]')).toBeNull();
    // before the forfeit time the button names it
    const early = menuScreen(document.body, { muted: false, onResume: () => undefined, onMute: () => undefined, onLeave: () => undefined, forfeit: { from: 5400, tick: 10 }, onForfeit: () => undefined, party: { onVotePause: () => undefined } });
    expect(early.querySelector('[data-a="forfeit"]')?.textContent).toBe('Vote surrender from 3:00');
    // solo keeps Paused / Forfeit with its confirm
    const solo = menuScreen(document.body, { muted: false, onResume: () => undefined, onMute: () => undefined, onLeave: () => undefined, forfeit: { from: 1, tick: 2 }, onForfeit: () => undefined });
    expect(solo.querySelector('h2')?.textContent).toBe('Paused');
    expect(solo.querySelector('[data-a="vote-pause"]')).toBeNull();
  });

  it('rail chips answer the votes: Yes, No, Resume', () => {
    const link = new FakeLink(0, ['A', 'B', null, null, null, null]);
    const f = fakeHost(['A', 'B', 'C', 'D', 'E', 'F']);
    const hud = new MpHud(f.host, link, { hideNames: false });
    link.emit('vote', { kind: 'surrender', yes: [1], need: 2, leftMs: 20_000 });
    f.rail.update(0.016);
    const yes = document.querySelector<HTMLElement>('[data-act="vote-surrender-yes"]')!;
    yes.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(link.votes).toEqual([{ kind: 'surrender', yes: true }]);
    f.rail.update(0.016);
    expect(document.querySelector('[data-act="vote-surrender-yes"]')).toBeNull(); // voted: the chips go
    link.emit('vote', { kind: 'surrender', yes: [], need: 0, leftMs: 0, result: 'pass' });
    expect(f.tracked.find((t) => t.event === 'mp_vote')?.props).toEqual({ kind: 'surrender', result: 'pass', yes: 1, need: 2 });
    f.rail.update(3); // the result line runs out
    link.emit('paused', { paused: true, leftMs: 60_000 });
    f.rail.update(0.016);
    expect(document.querySelector('.pl-rail-main .tt')?.textContent).toMatch(/^Paused [01]:\d\d$/);
    document.querySelector<HTMLElement>('[data-act="vote-resume"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(link.votes.at(-1)).toEqual({ kind: 'resume', yes: true });
    hud.dispose();
  });

  it('a player with 0 matches gets 3 control hints in the first 20 s; others none', () => {
    vi.useFakeTimers();
    expect(hintsFor(true)).toHaveLength(3);
    expect(hintsFor(false).map((h) => h.at)).toEqual([3, 9, 15]);
    for (const h of [...hintsFor(true), ...hintsFor(false)]) expect(h.title.length).toBeLessThanOrEqual(28);
    const link = new FakeLink(0, ['A', null, null, null, null, null]);
    const f = fakeHost(['A', 'B', 'C', 'D', 'E', 'F'], { newbie: true });
    const hud = new MpHud(f.host, link, { hideNames: false });
    hud.start();
    for (let s = 0; s <= 20; s++) {
      f.setTick(s * 30);
      vi.advanceTimersByTime(1000);
    }
    expect(f.rail.said.filter((t) => hintsFor(true).some((h) => h.title === t))).toHaveLength(3);
    hud.dispose();
    const g = fakeHost(['A', 'B', 'C', 'D', 'E', 'F'], { newbie: false });
    const hud2 = new MpHud(g.host, link, { hideNames: false });
    hud2.start();
    for (let s = 0; s <= 20; s++) {
      g.setTick(s * 30);
      vi.advanceTimersByTime(1000);
    }
    expect(g.rail.said.some((t) => hintsFor(true).some((h) => h.title === t))).toBe(false);
    hud2.dispose();
  });
});
