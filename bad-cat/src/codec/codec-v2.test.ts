import { describe, expect, it } from 'vitest';
import { GHOST_MAX_BODY_BYTES, GHOST_VERSION, decodeGhost as decodeGhostCapped } from './ghost-codec';
import { toBase64url } from './base64url';
import { withCrc16 } from './crc16';
import {
  BADCAT_SKUS,
  BOSS_TICKS,
  DEFAULT_CAT,
  MIN_REPLAY_SIM_VERSION,
  RUN_TICKS,
  SIM_VERSION,
  type LinkRoute,
  type LinkState,
  type RoomDef,
  type TickInput,
} from '../types';
import { fromBase64url } from './base64url';
import { encodeCat } from './cat-codec';
import { creatorCode, payloadHash } from './creator-code';
import { encodeGhost, encodeGhostSync } from './ghost-codec';
import { codec } from './index';
import { buildLink, buildLinkAsync, parseLink, parseLinkFull, type LinkStateX } from './link';
import { decodeRoom, encodeRoom, ROOM_CODE_VERSION, ROOM_THEMES } from './room-codec';
import { ROOM_V1_FIXTURES } from './room-v1.fixtures';

const BASE = 'https://tokentails.com/badcat';
const HASH_BASE = 'https://example.com/badcat/index.html#';
const MOCHI = { ...DEFAULT_CAT, pattern: 'solid' as const, name: 'Mochi', eyes: 2 };
const TOFU = { ...DEFAULT_CAT, pattern: 'tabby' as const, name: 'Tofu', eyes: 4 };
const INPUTS: TickInput[] = Array.from({ length: 400 }, (_, i) => ({ dir: (i < 200 ? 3 : 0) as TickInput['dir'], speed: (i < 200 ? 2 : 0) as TickInput['speed'], buttons: i === 210 ? 1 : 0 }));

function recordedLikeRun(seed: number, ticks = 2250): TickInput[] {
  let s = seed >>> 0 || 1;
  const rnd = (n: number): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s >>> 8) % n;
  };
  const out: TickInput[] = [];
  let dir = 3;
  while (out.length < ticks) {
    const idle = rnd(5) === 0;
    const len = idle ? 10 + rnd(50) : 8 + rnd(40);
    if (!idle && rnd(3) > 0) dir = ((dir - 1 + (rnd(3) - 1) + 8) % 8) + 1;
    else if (!idle) dir = 1 + rnd(8);
    const speed = idle ? 0 : rnd(4) === 0 ? 1 : 2;
    for (let i = 0; i < len && out.length < ticks; i++) {
      let buttons = 0;
      if (i === len - 1 && rnd(3) === 0) buttons = 1;
      if (i === 0 && rnd(6) === 0) buttons = 2;
      out.push({ dir: (idle ? 0 : dir) as TickInput['dir'], speed: speed as TickInput['speed'], buttons });
    }
  }
  return out;
}

/** 14x12 boss room, 60 props with cloth extents, cables, routine2, theme and telegraph, worst-case text. */
function bossV2(): RoomDef {
  const props: RoomDef['props'] = [];
  for (let i = 0; i < 60; i++) {
    const x = i % 14;
    const z = Math.floor(i / 14) * 2 + 1;
    const p: RoomDef['props'][number] = { kind: [1, 2, 3, 6, 11, 14, 15, 18, 40, 62][i % 10], x, z, level: (i % 4) as 0 | 1 | 2 | 3, rot: (i % 4) as 0 | 1 | 2 | 3 };
    if (i < 3) p.target = true;
    if (i % 10 === 5) {
      p.w = Math.min(1 + (i % 3), 14 - x);
      p.d = 2;
    }
    if (i % 4 === 1) p.cable = { x: (x + 1) % 14, z: (z + 1) % 12 };
    props.push(p);
  }
  return {
    id: 'boss',
    shell: 5,
    routine: 3,
    routine2: 7,
    event: 11,
    theme: 'xmas',
    boss: true,
    telegraph: 15,
    width: 14,
    depth: 12,
    spawn: { x: 13, z: 11 },
    props,
    seed: 1,
    ticks: BOSS_TICKS,
    title: 'Grandma’s Xmas Disaster🎀',
    author: 'Žygimantasss',
    ancestors: ['Mia', 'Zyg', 'Kęstutis', 'Fourth'],
  };
}

describe('room codec v1 fixtures (old shared links)', () => {
  it('every v1 fixture decodes exactly as the v1 decoder did', () => {
    expect(ROOM_V1_FIXTURES.length).toBeGreaterThanOrEqual(5);
    for (const f of ROOM_V1_FIXTURES) {
      expect(fromBase64url(f.code)![0] >> 4).toBe(1);
      expect(decodeRoom(f.code)).toEqual(f.decoded);
    }
  });
  it('an old /r link with n and a still parses (title/author from params)', () => {
    const f = ROOM_V1_FIXTURES.find((x) => x.name === 'small')!;
    const s = parseLink(new URL(`${BASE}/r?r=${f.code}&n=Zyg%27s%20Kitchen&a=Zyg`));
    expect(s.room?.id).toBe(f.decoded.id);
    expect(s.room?.title).toBe("Zyg's Kitchen");
    expect(s.room?.author).toBe('Zyg');
    expect(s.roomCode).toBe(f.code);
  });
  it('re-sharing a v1 room reuses its payload (same id, so its ghosts keep working)', async () => {
    const f = ROOM_V1_FIXTURES.find((x) => x.name === 'small')!;
    const s = parseLink(new URL(`${BASE}/r?r=${f.code}&n=Zyg%27s%20Kitchen&a=Zyg`));
    s.ghosts.push({ inputs: INPUTS, cat: MOCHI, name: 'Mochi', score: 1240 });
    const url = buildLink(s, BASE);
    expect(url).toContain(`r=${f.code}`);
    const back = await parseLinkFull(new URL(url));
    expect(back.room?.id).toBe(f.decoded.id);
    expect(back.room?.title).toBe("Zyg's Kitchen");
    expect(back.ghosts).toHaveLength(1);
    expect(back.ghosts[0].name).toBe('Mochi');
    expect(back.ghosts[0].score).toBe(1240);
  });
});

describe('room codec v2', () => {
  it('writes version 2', () => {
    expect(ROOM_CODE_VERSION).toBe(2);
    expect(fromBase64url(encodeRoom(bossV2()))![0] >> 4).toBe(2);
    expect(ROOM_THEMES).toEqual(['default', 'xmas', 'birthday', 'wedding', 'nye', 'valentine', 'thanksgiving', 'spring']);
  });
  it('round trips a 14x12 boss room with 60 props, cloth extents, cables, routine2, theme, telegraph', () => {
    const r = bossV2();
    const d = decodeRoom(encodeRoom(r))!;
    expect(d).not.toBeNull();
    expect([d.shell, d.routine, d.routine2, d.event, d.theme, d.boss, d.telegraph]).toEqual([5, 3, 7, 11, 'xmas', true, 15]);
    expect([d.width, d.depth, d.ticks]).toEqual([14, 12, BOSS_TICKS]);
    expect(d.spawn).toEqual(r.spawn);
    // ext writes both extents (a missing one is 1)
    expect(d.props).toEqual(r.props.map((p) => (p.w !== undefined || p.d !== undefined ? { ...p, w: p.w ?? 1, d: p.d ?? 1 } : p)));
    expect(d.title).toBe('Grandma’s Xmas Disaster🎀'.replace('’', ''));
    expect(d.author).toBe('Žygimantasss');
    expect(d.ancestors).toEqual(['Zyg', 'Kęstutis', 'Fourth']); // nearest 3
    expect(d.id).toMatch(/^ugc-[0-9a-f]{8}$/);
    expect(d.seed).toBe(parseInt(d.id.slice(4), 16));
    // stable: re-encoding the decoded room gives the same code
    expect(encodeRoom(d)).toBe(encodeRoom({ ...r, ancestors: d.ancestors, title: d.title }));
  });
  it('a small room keeps optional fields absent', () => {
    const r: RoomDef = { id: 'x', shell: 0, routine: 1, event: 2, width: 12, depth: 10, spawn: { x: 1, z: 8 }, seed: 1, ticks: RUN_TICKS, props: [{ kind: 1, x: 7, z: 1, level: 2, rot: 0, target: true }] };
    const d = decodeRoom(encodeRoom(r))!;
    expect(d).toEqual({ ...r, id: d.id, seed: d.seed });
  });
  it('the id and seed depend on gameplay only (a rename keeps ghosts)', () => {
    const a = decodeRoom(encodeRoom(bossV2()))!;
    const b = decodeRoom(encodeRoom({ ...bossV2(), title: 'Other', author: 'Mia', ancestors: [] }))!;
    expect(a.id).toBe(b.id);
    expect(a.seed).toBe(b.seed);
    const c = decodeRoom(encodeRoom({ ...bossV2(), telegraph: 16 }))!;
    expect(c.id).not.toBe(a.id);
  });
  it('filters text on encode and decode', () => {
    const d = decodeRoom(encodeRoom({ ...bossV2(), title: 'visit evil.com now', author: '@spammer', ancestors: ['fuck', 'a@b.co', 'Mia'] }))!;
    expect(d.title).toBe('visit now');
    expect(d.author).toBeUndefined();
    expect(d.ancestors).toEqual(['Mia']);
  });
  it('rejects too many props, a bad size, a flipped bit and out-of-room cells', () => {
    const r = bossV2();
    expect(() => encodeRoom({ ...r, props: [...r.props, ...r.props.slice(0, 4)] })).toThrow();
    expect(() => encodeRoom({ ...r, width: 13 })).toThrow();
    const code = encodeRoom(r);
    const ch = code[20] === 'A' ? 'B' : 'A';
    expect(decodeRoom(code.slice(0, 20) + ch + code.slice(21))).toBeNull();
    // cloth extent past the room edge
    const bad = encodeRoom({ ...r, props: [{ kind: 14, x: 12, z: 0, level: 1, rot: 0, w: 4, d: 1 }] });
    expect(decodeRoom(bad)).toBeNull();
    expect(decodeRoom('x'.repeat(10_000))).toBeNull();
  });
});

describe('link sizes', () => {
  it('worst case: v2 boss room + 2 ghosts + 2 cats + names + scores + via stays under 1,600 characters', async () => {
    const room = bossV2();
    const s: LinkState = {
      room,
      ghosts: [
        { inputs: recordedLikeRun(11, BOSS_TICKS), cat: MOCHI, name: 'Mochikitty🐾', score: 123456 },
        { inputs: recordedLikeRun(22, BOSS_TICKS), cat: TOFU, name: 'Tofu Tofu 12', score: 99999 },
      ],
      via: 'catmemes_123',
    };
    const url = buildLink(s, BASE);
    const zurl = await buildLinkAsync(s, BASE);
    expect(url.length).toBeLessThan(1600);
    expect(zurl.length).toBeLessThan(1600);
    const back = await parseLinkFull(new URL(url));
    expect(back.ghosts).toHaveLength(2);
    expect(back.ghosts.map((g) => [g.name, g.score])).toEqual([['Mochikitty🐾', 123456], ['Tofu Tofu 12', 99999]]);
    expect(back.via).toBe('catmemes_123');
    expect(back.room?.title).toBe(decodeRoom(encodeRoom(room))!.title);
  });
  it('recorded-like ghosts stay at or under 600 characters (75 s and 90 s)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      expect(encodeGhostSync(recordedLikeRun(seed * 31), 'daily-018').length).toBeLessThanOrEqual(600);
      expect(encodeGhostSync(recordedLikeRun(seed * 31, BOSS_TICKS), 'ugc-00000000').length).toBeLessThanOrEqual(600);
    }
  });
});

describe('ghost sim versions in links', () => {
  it(`a v${MIN_REPLAY_SIM_VERSION} ghost parses as replay only; a v${MIN_REPLAY_SIM_VERSION - 1} one is dropped`, async () => {
    const c = encodeCat(MOCHI);
    const v4 = encodeGhostSync(INPUTS, 'daily-018', MIN_REPLAY_SIM_VERSION);
    const s4 = await parseLinkFull(new URL(`${BASE}/d/18?g=${v4}&c=${c}&n=Mochi&s=777`));
    expect(s4.ghosts).toHaveLength(1);
    expect(s4.ghosts[0]).toMatchObject({ simVersion: MIN_REPLAY_SIM_VERSION, replayOnly: true, score: 777, name: 'Mochi' });
    const v3 = encodeGhostSync(INPUTS, 'daily-018', MIN_REPLAY_SIM_VERSION - 1);
    expect((await parseLinkFull(new URL(`${BASE}/d/18?g=${v3}&c=${c}&n=Mochi`))).ghosts).toEqual([]);
    const future = encodeGhostSync(INPUTS, 'daily-018', SIM_VERSION + 1);
    expect((await parseLinkFull(new URL(`${BASE}/d/18?g=${future}`))).ghosts).toEqual([]);
  });
  it('a current ghost is not replay only; the deflated form works too', async () => {
    const g = await encodeGhost(INPUTS, 'daily-018');
    const s = await parseLinkFull(new URL(`${BASE}/d/18?g=${g}&s=12`));
    expect(s.ghosts[0]).toMatchObject({ simVersion: SIM_VERSION, replayOnly: false, score: 12 });
  });
  it('a v4 sync rp (clip handoff) parses as replay only', () => {
    const rp = encodeGhostSync(INPUTS, 'daily-018', MIN_REPLAY_SIM_VERSION);
    const s = parseLink(new URL(`${BASE}/d/18?rp=${rp}&clip=1`));
    expect(s.replay?.replayOnly).toBe(true);
    expect(s.replay?.inputs).toEqual(INPUTS);
  });
  it('bad score hints are ignored', async () => {
    const g = encodeGhostSync(INPUTS, 'daily-018');
    for (const bad of ['-5', '1.5', '1e9', 'abc', '9'.repeat(10_000)]) {
      const s = await parseLinkFull(new URL(`${BASE}/d/18?g=${g}&s=${encodeURIComponent(bad)}`));
      expect(s.ghosts[0].score).toBeUndefined();
    }
  });
});

describe('room links', () => {
  const room = (): RoomDef => ({ ...bossV2(), props: bossV2().props.slice(0, 10) });
  it('round trip with two named ghosts (gn / gn2), scores and remix=1', async () => {
    const s: LinkState = {
      room: room(),
      remix: true,
      ghosts: [
        { inputs: INPUTS, cat: MOCHI, name: 'Mochi', score: 5 },
        { inputs: INPUTS.slice(0, 50), cat: TOFU, name: 'Tofu' },
      ],
    };
    const url = buildLink(s, BASE);
    expect(url).toMatch(/\/badcat\/r\?r=/);
    expect(url).toContain('gn=Mochi');
    expect(url).toContain('gn2=Tofu');
    expect(url).toContain('remix=1');
    expect(url).not.toMatch(/[?&]n=/); // the v2 payload carries the title
    const back = await parseLinkFull(new URL(url));
    expect(back.remix).toBe(true);
    expect(back.room?.title).toBe(decodeRoom(encodeRoom(s.room!))!.title);
    expect(back.roomCode).toBe(new URL(url).searchParams.get('r'));
    expect(back.ghosts.map((g) => [g.name, g.cat.pattern, g.score])).toEqual([['Mochi', 'solid', 5], ['Tofu', 'tabby', undefined]]);
  });
  it('hash form', async () => {
    const s: LinkState = { room: room(), ghosts: [{ inputs: INPUTS, cat: MOCHI, name: 'Mochi' }] };
    const url = buildLink(s, HASH_BASE);
    expect(url.startsWith(`${HASH_BASE}r=`)).toBe(true);
    const back = await parseLinkFull(new URL(url));
    expect(back.room?.id).toBe(decodeRoom(encodeRoom(s.room!))!.id);
    expect(back.ghosts[0].name).toBe('Mochi');
  });
  it('maker?r= opens a remix', () => {
    const code = encodeRoom(room());
    const s = parseLink(new URL(`${BASE}/maker?r=${code}`));
    expect(s.route).toBe('maker');
    expect(s.remix).toBe(true);
    expect(s.room?.id).toBe(decodeRoom(code)!.id);
    expect(s.roomCode).toBe(code);
    const again = parseLink(new URL(buildLink(s, BASE)));
    expect(again).toMatchObject({ route: 'maker', remix: true, roomCode: code });
    expect(parseLink(new URL(buildLink(s, HASH_BASE)))).toMatchObject({ route: 'maker', remix: true, roomCode: code });
  });
  it('n / a never override a v2 payload title', () => {
    const code = encodeRoom(room());
    const s = parseLink(new URL(`${BASE}/r?r=${code}&n=Hacked&a=Evil`));
    expect(s.room?.title).toBe(decodeRoom(code)!.title);
    expect(s.room?.author).toBe(decodeRoom(code)!.author);
  });
});

describe('routes', () => {
  const cases: LinkStateX[] = [
    { route: 'thanks', params: { session_id: 'cs_test_a1B2c3D4e5F6g7H8' }, ghosts: [] },
    { route: 'thanks', params: { session_id: 'cs_live_ZZZZZZZZ' }, ghosts: [] },
    { route: 'redeem', params: { code: 'GIFT2026AB' }, ghosts: [] },
    { route: 'restore', params: { t: 'abc-DEF_123' }, ghosts: [] },
    { route: 'maker', ghosts: [] },
    { route: 'club', ghosts: [] },
    ...(Object.keys(BADCAT_SKUS) as (keyof typeof BADCAT_SKUS)[]).map((sku): LinkStateX => ({ route: 'club', params: { sku }, ghosts: [] })),
    { route: 'archive', ghosts: [] },
    { route: 'rapsheet', ghosts: [] },
    { route: 'brand', ghosts: [] },
    { route: 'cameo', params: { sku: 'cameo' }, ghosts: [] },
    { route: 'cameo', params: { sku: 'guest_star' }, ghosts: [] },
    { route: 'settings', ghosts: [] },
    { route: 'archive', via: 'catmemes', ghosts: [] },
  ];
  it.each(cases.map((c) => [c.route, JSON.stringify(c.params ?? {}), c] as const))('%s %s round trips in path and hash forms', (_r, _p, c) => {
    const path = buildLink(c, BASE);
    expect(path.startsWith(`${BASE}/${c.route}`)).toBe(true);
    expect(parseLink(new URL(path))).toEqual(c);
    const hash = buildLink(c, HASH_BASE);
    expect(hash.startsWith(`${HASH_BASE}route=${c.route}`)).toBe(true);
    expect(parseLink(new URL(hash))).toEqual(c);
  });
  it('pre-rendered shells, bare #route and the documented thanks hash', () => {
    expect(parseLink(new URL('https://tokentails.com/badcat-game/settings.html'))).toEqual({ route: 'settings', ghosts: [] });
    expect(parseLink(new URL('https://example.com/#archive'))).toEqual({ route: 'archive', ghosts: [] });
    expect(parseLink(new URL('https://example.com/badcat/#route=thanks&session_id=cs_test_12345678'))).toEqual({
      route: 'thanks',
      params: { session_id: 'cs_test_12345678' },
      ghosts: [],
    });
  });
  it('redeem codes are upper-cased; unknown params and bad values are dropped', () => {
    expect(parseLink(new URL(`${BASE}/redeem?code=gift2026ab&evil=1`))).toEqual({ route: 'redeem', params: { code: 'GIFT2026AB' }, ghosts: [] });
    expect(parseLink(new URL(`${BASE}/thanks?session_id=pi_123456789`))).toEqual({ route: 'thanks', ghosts: [] });
    expect(parseLink(new URL(`${BASE}/thanks?session_id=cs_test_short`))).toEqual({ route: 'thanks', ghosts: [] });
    expect(parseLink(new URL(`${BASE}/club?sku=__proto__`))).toEqual({ route: 'club', ghosts: [] });
    expect(parseLink(new URL(`${BASE}/club?sku=toString`))).toEqual({ route: 'club', ghosts: [] });
    expect(parseLink(new URL(`${BASE}/cameo?sku=club_monthly`))).toEqual({ route: 'cameo', ghosts: [] });
    expect(parseLink(new URL(`${BASE}/restore?t=${'a'.repeat(129)}`))).toEqual({ route: 'restore', ghosts: [] });
    expect(parseLink(new URL(`${BASE}/nope?x=1`))).toEqual({ ghosts: [] });
    // build filters params too
    const built = buildLink({ route: 'redeem', params: { code: 'ab', other: 'x' }, ghosts: [] } as LinkState, BASE);
    expect(built).toBe(`${BASE}/redeem`);
    const route: LinkRoute = 'brand';
    expect(buildLink({ route, params: { sku: 'brand_shelf' }, ghosts: [] }, BASE)).toBe(`${BASE}/brand`);
  });
});

describe('malicious params', () => {
  const huge = 'A'.repeat(10_000);
  const evil = [
    'https://evil.example.com/x',
    'www.scam.io',
    'buy at shop.xyz',
    '@spammer',
    'me@mail.com',
    '+370 612 34567',
    '<script>alert(1)</script>',
    huge,
    'x'.repeat(10_000) + '.com',
  ];
  it('names, titles and authors are filtered or dropped', async () => {
    const g = encodeGhostSync(INPUTS, 'daily-018');
    for (const v of evil) {
      const e = encodeURIComponent(v);
      const t0 = performance.now();
      const cat = parseLink(new URL(`${BASE}/c/${encodeCat(MOCHI)}?n=${e}`));
      const dare = await parseLinkFull(new URL(`${BASE}/d/18?g=${g}&n=${e}`));
      const r = parseLink(new URL(`${BASE}/r?r=${ROOM_V1_FIXTURES[0].code}&n=${e}&a=${e}`));
      expect(performance.now() - t0).toBeLessThan(300);
      for (const text of [cat.catName, dare.ghosts[0]?.name, r.room?.title, r.room?.author]) {
        if (text === undefined) continue;
        expect(text).not.toMatch(/https?:|www\.|\.com|\.io|\.xyz|@|<|>|\d{5,}/);
        expect(Array.from(text).length).toBeLessThanOrEqual(24);
      }
    }
  });
  it('route params, via and codes with 10 kB strings are dropped', () => {
    for (const v of evil) {
      const e = encodeURIComponent(v);
      expect(parseLink(new URL(`${BASE}/thanks?session_id=${e}`)).params).toBeUndefined();
      expect(parseLink(new URL(`${BASE}/redeem?code=${e}`)).params).toBeUndefined();
      expect(parseLink(new URL(`${BASE}/restore?t=${e}`)).params).toBeUndefined();
      expect(parseLink(new URL(`${BASE}/club?sku=${e}`)).params).toBeUndefined();
      expect(parseLink(new URL(`${BASE}/d/18?via=${e}`)).via).toBeUndefined();
      expect(parseLink(new URL(`${BASE}/r?r=${e}`)).room).toBeUndefined();
    }
    expect(parseLink(new URL(`${BASE}/thanks?session_id=cs_test_${huge}`)).params).toBeUndefined();
  });
});

describe('creatorCode', () => {
  it.each([
    ['catmemes', 'catmemes'],
    ['CatMemes', 'catmemes'],
    ['  zyg_123 ', 'zyg_123'],
    ['abcdef', 'abcdef'],
    ['abcdefghijkl', 'abcdefghijkl'],
    ['abcde', null],
    ['abcdefghijklm', null],
    ['cat-memes', null],
    ['cat memes', null],
    ['katė123', null],
    ['fuckcats', null],
    ['kurwa_cat', null],
    ['', null],
    ['x'.repeat(10_000), null],
  ])('%s -> %s', (raw, want) => {
    expect(creatorCode(raw)).toBe(want);
  });
  it('the via param uses it', () => {
    expect(parseLink(new URL(`${BASE}/d/18?via=CatMemes`)).via).toBe('catmemes');
    expect(parseLink(new URL(`${BASE}/d/18?via=ab`)).via).toBeUndefined();
    expect(buildLink({ dayNo: 18, via: 'CatMemes', ghosts: [] }, BASE)).toBe(`${BASE}/d/18?via=catmemes`);
    expect(buildLink({ dayNo: 18, via: 'no', ghosts: [] }, BASE)).toBe(`${BASE}/d/18`);
  });
});

describe('payloadHash', () => {
  it('is stable, 8 base36 chars, and differs for different payloads', () => {
    expect(payloadHash('123456789')).toBe((0xcbf43926).toString(36).padStart(8, '0'));
    expect(payloadHash('')).toBe('00000000');
    const code = ROOM_V1_FIXTURES[2].code;
    expect(payloadHash(code)).toMatch(/^[0-9a-z]{8}$/);
    expect(payloadHash(code)).toBe(payloadHash(code));
    expect(payloadHash(code)).not.toBe(payloadHash(code + 'A'));
  });
});

describe('codec api object (FULL)', () => {
  it('exposes encodeRoom, decodeRoom, payloadHash, creatorCode', () => {
    expect(codec.encodeRoom).toBe(encodeRoom);
    expect(codec.decodeRoom).toBe(decodeRoom);
    expect(codec.payloadHash?.('x')).toMatch(/^[0-9a-z]{8}$/);
    expect(codec.creatorCode?.('CatMemes')).toBe('catmemes');
  });
});

describe('ghost inflate cap (review round 1)', () => {
  it('refuses a deflated payload that inflates past GHOST_MAX_BODY_BYTES', async () => {
    if (typeof CompressionStream === 'undefined') return;
    const zeros = new Uint8Array(200_000);
    const z = new Uint8Array(await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const framed = new Uint8Array(z.length + 1);
    framed[0] = (GHOST_VERSION << 4) | 1;
    framed.set(z, 1);
    const payload = toBase64url(withCrc16(framed));
    expect(payload.length).toBeLessThan(4000);
    expect(await decodeGhostCapped(payload)).toBeNull();
    expect(GHOST_MAX_BODY_BYTES).toBeLessThan(16_000);
  });
});
