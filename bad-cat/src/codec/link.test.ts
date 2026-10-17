import { describe, expect, it } from 'vitest';
import { DEFAULT_CAT, RUN_TICKS, SIM_VERSION, type LinkState, type RoomDef, type TickInput } from '../types';
import { encodeCat } from './cat-codec';
import { encodeGhost, encodeGhostSync } from './ghost-codec';
import { buildLink, buildLinkAsync, parseLink, parseLinkFull, type LinkStateX } from './link';

const BASE = 'https://tokentails.com/badcat';
const MOCHI = { ...DEFAULT_CAT, pattern: 'solid' as const, name: 'Mochi', eyes: 2 };
const INPUTS: TickInput[] = Array.from({ length: 400 }, (_, i) => ({ dir: (i < 200 ? 3 : 0) as TickInput['dir'], speed: (i < 200 ? 2 : 0) as TickInput['speed'], buttons: i === 210 ? 1 : 0 }));

const rt = (s: LinkStateX, base = BASE): LinkStateX => parseLink(new URL(buildLink(s, base)));

describe('link round trips (GDD 6.6 rows used in M0)', () => {
  it('daily room', () => {
    expect(buildLink({ dayNo: 18, ghosts: [] }, BASE)).toBe(`${BASE}/d/18`);
    expect(rt({ dayNo: 18, ghosts: [] })).toEqual({ dayNo: 18, ghosts: [] });
  });
  it('pre-launch preview day (negative dayNo)', () => {
    expect(rt({ dayNo: -25, ghosts: [] })).toEqual({ dayNo: -25, ghosts: [] });
    // round 3: no negative number in a pasted URL; old "/d/-25" links still parse
    expect(buildLink({ dayNo: -25, ghosts: [] }, BASE)).toBe(`${BASE}/d/p25`);
    expect(buildLink({ dayNo: 0, ghosts: [] }, BASE)).toBe(`${BASE}/d/p0`);
    expect(rt({ dayNo: 0, ghosts: [] })).toEqual({ dayNo: 0, ghosts: [] });
    expect(parseLink(new URL(`${BASE}/d/-25`)).dayNo).toBe(-25);
  });
  it('the glass', () => {
    expect(buildLink({ glass: true, ghosts: [] }, BASE)).toBe(`${BASE}/glass`);
    expect(rt({ glass: true, ghosts: [] })).toEqual({ glass: true, ghosts: [] });
  });
  it('picker for typed arrivals (e=t)', () => {
    expect(buildLink({ pick: true, entry: 'typed', ghosts: [] }, BASE)).toBe(`${BASE}/pick?e=t`);
    expect(rt({ pick: true, entry: 'typed', ghosts: [] })).toEqual({ pick: true, entry: 'typed', ghosts: [] });
  });
  it('cat card with a name', () => {
    const code = encodeCat(MOCHI);
    const s: LinkStateX = { catCode: code, catName: 'Mochi', ghosts: [] };
    expect(buildLink(s, BASE)).toBe(`${BASE}/c/${code}?n=Mochi`);
    expect(rt(s)).toEqual(s);
  });
  it('creator code (via) on any link', () => {
    expect(rt({ dayNo: 18, via: 'catmemes', ghosts: [] })).toEqual({ dayNo: 18, via: 'catmemes', ghosts: [] });
    expect(parseLink(new URL(`${BASE}/d/18?via=<script>`)).via).toBeUndefined();
  });
  it('clip handoff: rp + cat + name + clip=1, sync replay decode', () => {
    const s: LinkStateX = { dayNo: 18, replay: { inputs: INPUTS, cat: MOCHI, name: 'Mochi' }, clip: true, ghosts: [] };
    const url = buildLink(s, BASE);
    expect(url).toContain('/d/18?rp=');
    expect(url).toContain('clip=1');
    const back = parseLink(new URL(url));
    expect(back.clip).toBe(true);
    expect(back.replay?.inputs).toEqual(INPUTS);
    expect(back.replay?.cat).toEqual(MOCHI);
    expect(back.replay?.name).toBe('Mochi');
  });
  it('studio flag', () => {
    expect(rt({ glass: true, studio: true, ghosts: [] })).toEqual({ glass: true, studio: true, ghosts: [] });
  });
});

describe('ghost links (M1a): parseLink leaves ghosts empty, parseLinkFull decodes them', () => {
  it('dare + chained dare', async () => {
    const s: LinkStateX = {
      dayNo: 18,
      ghosts: [
        { inputs: INPUTS, cat: MOCHI, name: 'Mochi' },
        { inputs: INPUTS.slice(0, 100), cat: { ...DEFAULT_CAT, name: 'Tofu' }, name: 'Tofu' },
      ],
    };
    const url = buildLink(s, BASE);
    expect(parseLink(new URL(url)).ghosts).toEqual([]);
    const full = await parseLinkFull(new URL(url));
    const want = s.ghosts.map((g) => ({ ...g, simVersion: SIM_VERSION, replayOnly: false }));
    expect(full.ghosts).toEqual(want);
    const zurl = await buildLinkAsync(s, BASE);
    expect((await parseLinkFull(new URL(zurl))).ghosts).toEqual(want);
    expect(zurl.length).toBeLessThan(1600);
  });
  it('deflated rp decodes only in parseLinkFull', async () => {
    const rp = await encodeGhost(INPUTS, 'daily-018');
    const url = new URL(`${BASE}/d/18?rp=${rp}&c=${encodeCat(MOCHI)}&n=Mochi&clip=1`);
    expect((await parseLinkFull(url)).replay?.inputs).toEqual(INPUTS);
  });
  it('a broken cat code falls back to the house cat', async () => {
    const g = encodeGhostSync(INPUTS, 'daily-018');
    const full = await parseLinkFull(new URL(`${BASE}/d/18?g=${g}&c=garbage&n=Mochi`));
    expect(full.ghosts[0].cat.pattern).toBe(DEFAULT_CAT.pattern);
    expect(full.ghosts[0].cat.name).toBe('Mochi');
  });
});

describe('player room link (M2 format)', () => {
  it('round trips the room, title and author', () => {
    const room: RoomDef = {
      id: 'x', shell: 0, routine: 1, event: 2, width: 12, depth: 10, spawn: { x: 1, z: 8 }, seed: 1, ticks: RUN_TICKS,
      props: [{ kind: 1, x: 7, z: 1, level: 2, rot: 0, target: true }], title: "Zyg's Kitchen", author: 'Zyg',
    };
    const back = rt({ room, ghosts: [] });
    expect(back.room?.props).toEqual(room.props);
    expect(back.room?.title).toBe("Zyg's Kitchen");
    expect(back.room?.author).toBe('Zyg');
    expect(back.room?.id).toMatch(/^ugc-/);
  });
  it('clip handoff from a player room: the room code and the replay travel together, keyed to that room', () => {
    const room: RoomDef = {
      id: 'x', shell: 0, routine: 1, event: 2, width: 12, depth: 10, spawn: { x: 1, z: 8 }, seed: 1, ticks: RUN_TICKS,
      props: [{ kind: 1, x: 7, z: 1, level: 2, rot: 0, target: true }], title: 'QA Kitchen', author: 'Zyg',
    };
    const first = rt({ room, ghosts: [] });
    const url = buildLink({ room: first.room, roomCode: first.roomCode, clip: true, ghosts: [], replay: { inputs: INPUTS, cat: MOCHI, name: 'Mochi' } }, BASE);
    expect(url).toContain('/r?r=');
    expect(url).toContain('clip=1');
    const back = parseLink(new URL(url));
    expect(back.clip).toBe(true);
    expect(back.room?.id).toBe(first.room?.id);
    expect(back.replay?.inputs).toEqual(INPUTS);
  });
});

describe('parse variants', () => {
  it('pre-rendered shells and nested bases', () => {
    expect(parseLink(new URL('https://tokentails.com/badcat-game/d/18.html')).dayNo).toBe(18);
    expect(parseLink(new URL('https://tokentails.com/badcat/pick.html?e=t'))).toEqual({ pick: true, entry: 'typed', ghosts: [] });
    expect(parseLink(new URL('http://localhost:5174/'))).toEqual({ ghosts: [] });
  });
  it('standalone hash form', () => {
    const s: LinkState = { dayNo: 18, via: 'catmemes', ghosts: [] };
    const url = buildLink(s, 'https://example.com/badcat/index.html#');
    expect(url).toBe('https://example.com/badcat/index.html#d=18&via=catmemes');
    expect(parseLink(new URL(url))).toEqual(s);
    expect(parseLink(new URL('https://example.com/#glass'))).toEqual({ glass: true, ghosts: [] });
  });
  it('never throws on junk', () => {
    expect(parseLink(new URL('https://x.y/d/abc/c/%E0%A4%A?n=%00&rp=@@'))).toEqual({ ghosts: [] });
    expect(parseLink(new URL('https://x.y/c/AAAA?n=fuck')).catName).toBeUndefined();
  });
});

describe('link: first-heist flag on clip handoff (m=f)', () => {
  it('round-trips ftue and keeps the replay', () => {
    const url = buildLink({ dayNo: 18, ghosts: [], clip: true, ftue: true, replay: { inputs: INPUTS, cat: MOCHI, name: 'Mochi' } }, BASE);
    expect(url).toContain('m=f');
    const back = parseLink(new URL(url));
    expect(back.ftue).toBe(true);
    expect(back.clip).toBe(true);
    expect(back.replay?.inputs.length).toBe(INPUTS.length);
    expect(parseLink(new URL(`${BASE}/d/18`)).ftue).toBeUndefined();
  });

  it('a dare link decodes its ghost with parseLinkFull', async () => {
    const url = buildLink({ dayNo: 18, ghosts: [{ inputs: INPUTS, cat: MOCHI, name: 'Mochi' }] }, BASE);
    const s = await parseLinkFull(new URL(url));
    expect(s.ghosts).toHaveLength(1);
    expect(s.ghosts[0].name).toBe('Mochi');
    expect(s.ghosts[0].inputs).toEqual(INPUTS);
  });
});

describe('link hardening', () => {
  it('a ghost recorded for another room or sim version is dropped', async () => {
    const good = await buildLinkAsync({ dayNo: 19, ghosts: [{ inputs: INPUTS, cat: MOCHI, name: 'Mochi' }] }, BASE);
    expect((await parseLinkFull(new URL(good))).ghosts.length).toBe(1);
    // day-18 ghost pasted into a day-19 link
    const g18 = encodeGhostSync(INPUTS, 'daily-018');
    const moved = `${BASE}/d/19?g=${g18}&c=${encodeCat(MOCHI)}&n=Mochi`;
    expect((await parseLinkFull(new URL(moved))).ghosts).toEqual([]);
    // old sim version
    const old = encodeGhostSync(INPUTS, 'daily-019', 1);
    expect((await parseLinkFull(new URL(`${BASE}/d/19?g=${old}`))).ghosts).toEqual([]);
  });
  it('a huge crafted name is filtered quickly', () => {
    const evil = 'a.'.repeat(20_000) + 'com';
    const t0 = performance.now();
    parseLink(new URL(`${BASE}/c/${encodeCat(MOCHI)}?n=${encodeURIComponent(evil)}`));
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('integrator: chained ghosts keep their rule set', () => {
  it('a v4 ghost re-shared as g2 stays replay-only (sync and deflated)', async () => {
    const s: LinkState = {
      dayNo: 18,
      ghosts: [
        { inputs: INPUTS, cat: MOCHI, name: 'Mochi' },
        { inputs: INPUTS.slice(0, 200), cat: DEFAULT_CAT, name: 'Old', simVersion: 4, replayOnly: true },
      ],
    };
    for (const url of [buildLink(s, BASE), await buildLinkAsync(s, BASE)]) {
      const back = await parseLinkFull(new URL(url));
      expect(back.ghosts.map((g) => [g.simVersion, g.replayOnly])).toEqual([
        [SIM_VERSION, false],
        [4, true],
      ]);
    }
  });
});
