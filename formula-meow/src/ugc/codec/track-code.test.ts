import { describe, expect, it } from 'vitest';
import type { SetPiece, TrackDef } from '../../types';
import { TRACKS as ALL } from '../../core/track/tracks';
import { cleanName, decodeTrackCode, encodeTrack, PIECES_MAX, trackCodecV1, trackKey, ugcId } from './track-code';
import { stuntLab } from '../../test/fixtures';

/**
 * The authored tracks without their set pieces: the tests below are about the v1/v2 fields (set pieces travel in v3
 * and are checked on their own; an authored track's pieces follow the authored spacing, not the doodle rules the
 * decoder applies, so its code may be refused until a remix spreads them out).
 */
const TRACKS: TrackDef[] = ALL.map(({ setPieces, ...d }) => (void setPieces, d));

/** A set piece as the code carries it (defaults filled in, empty fields dropped). */
function normPiece(p: SetPiece): SetPiece {
  const o: SetPiece = { kind: p.kind, s: p.s };
  if (p.kind === 'wall' && p.side != null) o.side = p.side;
  if (p.kind === 'wall' || p.kind === 'tunnel') o.len = p.len;
  if (p.kind === 'jump') {
    o.gap = p.gap ?? 10;
    if (p.drop) o.drop = p.drop;
  }
  if (p.skin) o.skin = p.skin;
  return o;
}
import { fromBase64url, toBase64url } from './base64url';
import { extractCode, extractLapClass, readLapClass, readTrackCode, trackLink, wantsEditor } from './link';
import { setTrackCodec, trackFromLocation } from './track-codec';
import { fmtLap, liveLapDelta, makerLine, myLapCs, recordLap, setTarget, shareLap, shareLapCs, targetClass, targetCs } from '../maker-lap';

/**
 * Drop the fields the code does not carry the same way (id, sides the decoder fills in) or at all (the iteration-2
 * authored extras: branches, hazards, coins, flyover, music; authored tracks travel by id, UGC by code).
 */
function norm(def: TrackDef): unknown {
  // SIM_VERSION 8: set pieces travel in track code v3 (defaults filled in)
  const { branches, hazards, coins, flyover, music, kind, setPieces, ...rest } = def;
  void branches;
  void hazards;
  void coins;
  void flyover;
  void music;
  void kind;
  return {
    ...rest,
    id: '',
    features: def.features.map((f) => ({ s: f.s, kind: f.kind, side: f.side ?? 0 })),
    setPieces: setPieces?.length ? setPieces.map(normPiece) : undefined,
  };
}

/** A 24-point ring with 12 stickers, both names, parent and lap: the GDD size case. */
function bigTrack(): TrackDef {
  const points: TrackDef['points'] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    points.push({ x: Math.round((Math.cos(a) * 100) / 4) * 4 || 0, z: Math.round((Math.sin(a) * 100) / 4) * 4 || 0, h: 0, w: 2 });
  }
  const kinds = ['start', 'items', 'pad', 'items', 'ramp', 'lowgrip', 'items', 'offroad', 'pad', 'items', 'pad', 'hazard'] as const;
  return {
    v: 1,
    id: 'x',
    name: 'Zoomies Ring 26',
    creator: 'MochiMochi',
    parent: 0xdeadbeef,
    theme: 3,
    timeOfDay: 1,
    laps: 3,
    points,
    features: kinds.map((kind, i) => ({ s: i * 21, kind, side: kind === 'offroad' ? 1 : kind === 'pad' || kind === 'ramp' ? 0 : undefined })),
  };
}

describe('track share code (GDD 6.3)', () => {
  it('round-trips every authored track exactly (gameplay data, names)', () => {
    for (const def of TRACKS) {
      const code = encodeTrack(def);
      const back = decodeTrackCode(code);
      expect(back.ok, def.id).toBe(true);
      if (!back.ok) continue;
      // names travel in the 6-bit charset, accents folded and cut at 16 (Cat Café Chaos → Cat Cafe Chaos)
      expect(norm(back.track)).toEqual(norm({ ...def, name: cleanName(def.name, 16) }));
      expect(back.track.id).toBe(ugcId(def));
      expect(back.track.id.startsWith('u-')).toBe(true);
    }
  });

  it('round-trips names, creator, parent, props and the creator lap; the code is URL-safe and ≤ 140 chars', () => {
    const def = { ...bigTrack(), props: [3, 15] };
    const code = encodeTrack(def, { creatorLapCs: 4321 });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThanOrEqual(140);
    const back = decodeTrackCode(code, { validate: false });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.track.name).toBe('Zoomies Ring 26');
    expect(back.track.creator).toBe('MochiMochi');
    expect(back.track.parent).toBe(0xdeadbeef);
    expect(back.track.props).toEqual([3, 15]);
    expect(back.track.theme).toBe(3);
    expect(back.track.timeOfDay).toBe(1);
    expect(back.creatorLapCs).toBe(4321);
    expect(norm(back.track)).toEqual(norm({ ...def }));
  });

  it('the track key ignores the lap time but follows the layout and the name', () => {
    const def = TRACKS[0];
    expect(decodeTrackCode(encodeTrack(def, { creatorLapCs: 999 })).ok).toBe(true);
    const a = decodeTrackCode(encodeTrack(def, { creatorLapCs: 999 }));
    const b = decodeTrackCode(encodeTrack(def));
    expect(a.ok && b.ok && a.track.id === b.track.id).toBe(true);
    const moved = { ...def, points: def.points.map((p, i) => (i === 3 ? { ...p, x: p.x + 4 } : p)) };
    expect(trackKey(moved)).not.toBe(trackKey(def));
    expect(trackKey({ ...def, name: 'Other' })).not.toBe(trackKey(def));
  });

  it('rejects a flipped bit (CRC), another version, junk and trailing bytes', () => {
    const code = encodeTrack(TRACKS[0]);
    const bytes = fromBase64url(code)!;
    for (const at of [0, 5, bytes.length - 3, bytes.length - 1]) {
      const bad = bytes.slice();
      bad[at] ^= 0x10;
      expect(decodeTrackCode(toBase64url(bad))).toEqual({ ok: false, reason: 'crc' });
    }
    expect(decodeTrackCode('')).toEqual({ ok: false, reason: 'crc' });
    expect(decodeTrackCode('not a code!')).toEqual({ ok: false, reason: 'crc' });
    expect(decodeTrackCode('AAAA').ok).toBe(false);
    // an unknown version (4) with a valid CRC (v2 is the iteration-2 theme field, v3 the set pieces)
    const v2 = bytes.slice(0, bytes.length - 2);
    v2[0] = (v2[0] & 0x0f) | 0x40;
    const { withCrc16 } = (() => {
      let crc = 0xffff;
      for (const b of v2) {
        crc ^= b << 8;
        for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
      return { withCrc16: new Uint8Array([...v2, crc >> 8, crc & 0xff]) };
    })();
    expect(decodeTrackCode(toBase64url(withCrc16))).toEqual({ ok: false, reason: 'version' });
  });

  it('refuses a well-formed code for an undrivable track (the decoder runs the validator)', () => {
    const def = { ...TRACKS[0], features: TRACKS[0].features.filter((f) => f.kind !== 'items') };
    expect(decodeTrackCode(encodeTrack(def))).toEqual({ ok: false, reason: 'invalid' });
    const tiny: TrackDef = { ...TRACKS[0], points: TRACKS[0].points.map((p) => ({ ...p, x: Math.round(p.x / 16) * 4, z: Math.round(p.z / 16) * 4 })) };
    expect(decodeTrackCode(encodeTrack(tiny)).ok).toBe(false);
  });

  it('filters names on encode and on decode', () => {
    expect(cleanName('Žalgiris Ring!!', 16)).toBe('Zalgiris Ring');
    expect(cleanName('fuck this', 16)).toBe('');
    expect(cleanName('visit www.spam.com', 16)).toBe('visit');
    expect(cleanName('a very long track name indeed', 16).length).toBeLessThanOrEqual(16);
    const def = { ...TRACKS[0], name: 'sh1t track', creator: 'kurva' };
    const back = decodeTrackCode(encodeTrack(def));
    expect(back.ok && back.track.name).toBe('');
    expect(back.ok && back.track.creator).toBeUndefined();
    // a hand-made code with a blocked name in the 6-bit charset is cleaned when it is read
    const raw = encodeTrack({ ...TRACKS[0], name: 'Nice' });
    const hacked = decodeTrackCode(raw);
    expect(hacked.ok && hacked.track.name).toBe('Nice');
  });

  it('registers as the core TrackCodec and reads ?t= and #t= links', () => {
    setTrackCodec(trackCodecV1);
    const code = encodeTrack(TRACKS.find((d) => d.id === 'rooftops')!);
    const a = trackFromLocation({ search: `?t=${code}`, hash: '' });
    const b = trackFromLocation({ search: '', hash: `#t=${code}` });
    expect(a?.ok && a.track.name).toBe('Neon Rooftops');
    expect(b?.ok && b.track.name).toBe('Neon Rooftops');
    expect(trackFromLocation({ search: '?track=kitchen', hash: '' })).toBeNull();
    expect(trackFromLocation({ search: '?t=broken', hash: '' })).toEqual({ ok: false, reason: 'crc' });
  });
});

describe('track share code v2 (iteration 2)', () => {
  it('themes 0–3 still encode as v1, byte for byte; themes 4–6 as v2, and both decode', () => {
    const base = bigTrack();
    const v1 = fromBase64url(encodeTrack(base))!;
    expect(v1[0] >> 4).toBe(1);
    for (const theme of [4, 5, 6] as const) {
      const code = encodeTrack({ ...base, theme });
      expect(fromBase64url(code)![0] >> 4).toBe(2);
      const back = decodeTrackCode(code, { validate: false });
      expect(back.ok && back.track.theme).toBe(theme);
      expect(back.ok && norm(back.track)).toEqual(norm({ ...base, theme }));
    }
  });

  it('a hazard sticker and a shortcut sticker keep their kind and side', () => {
    const base = bigTrack();
    const def: TrackDef = {
      ...base,
      features: [...base.features.slice(0, 10), { s: 230, kind: 'hazard', side: -1 }, { s: 240, kind: 'shortcut', side: 0 }, { s: 250, kind: 'hazard', side: 0 }],
    };
    const back = decodeTrackCode(encodeTrack(def), { validate: false });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.track.features.slice(-3)).toEqual([
      { s: 230, kind: 'hazard', side: -1 },
      { s: 240, kind: 'shortcut', side: 0 },
      { s: 250, kind: 'hazard', side: 0 },
    ]);
  });
});

describe('track links', () => {
  it('builds play links on the same game path', () => {
    expect(trackLink('ABC', { origin: 'https://tokentails.com', pathname: '/meow-race' })).toBe('https://tokentails.com/meow-race?t=ABC');
    expect(trackLink('ABC', { origin: 'https://tokentails.com', pathname: '/meow-race/make' })).toBe('https://tokentails.com/meow-race?t=ABC');
    expect(trackLink('ABC', { origin: 'http://127.0.0.1:5175', pathname: '/' })).toBe('http://127.0.0.1:5175/?t=ABC');
    expect(trackLink('ABC', { origin: 'http://x', pathname: '/formula-meow-game/index.html' })).toBe('http://x/formula-meow-game/?t=ABC');
    // a track shared from a dare or a Daily Cup page must not carry that page's OG card
    expect(trackLink('ABC', { origin: 'https://tokentails.com', pathname: '/meow-race/r' })).toBe('https://tokentails.com/meow-race?t=ABC');
    expect(trackLink('ABC', { origin: 'https://tokentails.com', pathname: '/meow-race/d/42' })).toBe('https://tokentails.com/meow-race?t=ABC');
    expect(trackLink('ABC', { origin: 'https://tokentails.com', pathname: '/meow-race/d/42/' })).toBe('https://tokentails.com/meow-race?t=ABC');
  });

  it('reads codes from links, params and bare codes', () => {
    const code = encodeTrack(TRACKS[0]);
    expect(readTrackCode(`?cls=1&t=${code}`, '')).toBe(code);
    expect(extractCode(`https://tokentails.com/meow-race?t=${code}`)).toBe(code);
    expect(extractCode(`https://tokentails.com/meow-race/t#t=${code}`)).toBe(code);
    expect(extractCode(`  ${code} `)).toBe(code);
    expect(extractCode('hello')).toBeNull();
    expect(wantsEditor('?make', '', '/')).toBe(true);
    expect(wantsEditor('', '#make', '/')).toBe(true);
    expect(wantsEditor('', '', '/meow-race/make')).toBe(true);
    expect(wantsEditor('?t=x', '', '/meow-race')).toBe(false);
  });
});

describe('track share code v3 (iteration 3: set pieces)', () => {
  const lab = (): TrackDef => {
    // the stunt lab, spread out for the doodle rules: a jump and a tunnel on the first straight, a wall ride on the
    // first bend's outside, a loop on the back straight
    const d = stuntLab({ setPieces: [{ kind: 'jump', s: 30, gap: 10, drop: 1.5 }, { kind: 'wall', s: 92, len: 18 }, { kind: 'loop', s: 150 }] });
    return { ...d, id: 'x', name: 'Stunt Lab' };
  };

  it('v1 and v2 codes stay byte-identical without set pieces; a track with pieces is v3 and keeps them', () => {
    const base = bigTrack();
    const plain = encodeTrack(base);
    expect(encodeTrack({ ...base, setPieces: [] })).toBe(plain);
    expect(fromBase64url(plain)![0] >> 4).toBe(1);
    expect(fromBase64url(encodeTrack({ ...base, theme: 5 }))![0] >> 4).toBe(2);
    const pieces: SetPiece[] = [
      { kind: 'loop', s: 10 },
      { kind: 'wall', s: 40, len: 18, side: -1 },
      { kind: 'wall', s: 70, len: 9, side: 0 },
      { kind: 'wall', s: 100, len: 20 },
      { kind: 'jump', s: 130, gap: 12, drop: 2.5, skin: 3 },
      { kind: 'tunnel', s: 160, len: 26, skin: 15 },
      { kind: 'jump', s: 200, gap: 6 },
    ];
    for (const theme of [0, 3, 4, 6] as const) {
      const def = { ...base, theme, setPieces: pieces };
      const code = encodeTrack(def, { creatorLapCs: 1234 });
      expect(fromBase64url(code)![0] >> 4).toBe(3);
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      // 7 pieces add 21 bytes at most: the GDD size case still fits a short link
      expect(code.length).toBeLessThanOrEqual(140 + 28);
      const back = decodeTrackCode(code, { validate: false });
      expect(back.ok).toBe(true);
      if (!back.ok) continue;
      expect(back.track.theme).toBe(theme);
      expect(back.creatorLapCs).toBe(1234);
      expect(back.track.setPieces).toEqual(pieces.map(normPiece));
      expect(norm(back.track)).toEqual(norm(def));
    }
    expect(PIECES_MAX).toBe(7);
  });

  it('every authored track with its set pieces round-trips (decoded without the doodle rules)', () => {
    for (const def of ALL) {
      const back = decodeTrackCode(encodeTrack(def), { validate: false });
      expect(back.ok, def.id).toBe(true);
      if (!back.ok) continue;
      expect(norm(back.track)).toEqual(norm({ ...def, name: cleanName(def.name, 16) }));
    }
  });

  it('a doodled track with set pieces decodes through the validator; a broken piece section is refused', () => {
    const def = lab();
    const code = encodeTrack(def);
    const back = decodeTrackCode(code);
    expect(back.ok).toBe(true);
    expect(back.ok && back.track.setPieces).toEqual(def.setPieces!.map(normPiece));
    // a piece moved onto the bend (a loop needs a straight) is refused by the validator
    const bent = { ...def, setPieces: [{ kind: 'loop' as const, s: 100 }] };
    expect(decodeTrackCode(encodeTrack(bent))).toEqual({ ok: false, reason: 'invalid' });
    // non-canonical piece fields (a side on a loop, a loop param) are refused before the validator
    const bytes = fromBase64url(encodeTrack({ ...bigTrack(), setPieces: [{ kind: 'loop', s: 10 }] }))!;
    const body = bytes.slice(0, bytes.length - 2);
    // flip the last bit of the piece's param byte region: find it by re-encoding with a set bit and checking refusal
    let refused = 0;
    for (let bit = 0; bit < 8 * 3; bit++) {
      const b = body.slice();
      const at = b.length - 1 - (bit >> 3);
      b[at] ^= 1 << (bit & 7);
      const raw = crc(b);
      const d = decodeTrackCode(toBase64url(raw), { validate: false });
      if (!d.ok) refused++;
    }
    expect(refused).toBeGreaterThan(0);
  });
});

/** Append the CRC-16 the codec uses (CCITT, 0xffff). */
function crc(body: Uint8Array): Uint8Array {
  let c = 0xffff;
  for (const b of body) {
    c ^= b << 8;
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return new Uint8Array([...body, c >> 8, c & 0xff]);
}

describe('Beat the maker (iteration 4, F10)', () => {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: Pick<Storage, 'getItem' | 'setItem'> }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };

  it('a completed lap is kept per track (only a better one replaces it); a code carries it and a code without one has no target', () => {
    const def = { ...bigTrack(), props: [3, 15] };
    const id = ugcId(def);
    expect(myLapCs(id)).toBeNull();
    expect(recordLap(id, null)).toBe(false);
    expect(recordLap('kitchen', 30)).toBe(false);
    expect(recordLap(id, 25.314)).toBe(true);
    expect(myLapCs(id)).toBe(2531);
    expect(recordLap(id, 26)).toBe(false);
    expect(recordLap(id, 24.5)).toBe(true);
    expect(shareLapCs(id)).toBe(2450);
    const back = decodeTrackCode(encodeTrack(def, { creatorLapCs: shareLapCs(id) }), { validate: false });
    expect(back.ok && back.creatorLapCs).toBe(2450);
    // the lap never changes the track's identity
    expect(back.ok && back.track.id).toBe(id);
    const none = decodeTrackCode(encodeTrack(def), { validate: false });
    expect(none.ok && none.creatorLapCs).toBeUndefined();
    expect(targetCs(id)).toBeNull();
  });

  it("a friend's link sets the target; re-sharing carries your own lap once you have one", () => {
    const def = { ...bigTrack(), name: 'Friend Loop' };
    const id = ugcId(def);
    setTarget(id, 2431, 0);
    expect(targetCs(id)).toBe(2431);
    expect(shareLapCs(id)).toBe(2431);
    recordLap(id, 23.9);
    expect(shareLapCs(id)).toBe(2390);
  });

  it("the maker's lap carries its class: a 100cc lap is never the target of a 50cc race (playtest)", () => {
    const def = { ...bigTrack(), name: 'Class Loop' };
    const id = ugcId(def);
    // the maker test-drives at Alley Cat 100cc
    recordLap(id, 21.75, 1);
    expect(myLapCs(id, 1)).toBe(2175);
    expect(myLapCs(id, 0)).toBeNull();
    expect(shareLap(id)).toEqual({ cs: 2175, cls: 1 });
    const link = trackLink(encodeTrack(def, { creatorLapCs: shareLap(id)!.cs }), { origin: 'https://x.test', pathname: '/meow-race/make' }, shareLap(id)!.cls!);
    const u = new URL(link);
    expect(u.searchParams.get('cls')).toBe('1');
    expect(readLapClass(u.search, '')).toBe(1);
    expect(extractLapClass(link)).toBe(1);
    // the friend: a target at 100cc only
    const other = { ...bigTrack(), name: 'Class Loop 2' };
    const oid = ugcId(other);
    setTarget(oid, 2175, 1);
    expect(targetCs(oid, 1)).toBe(2175);
    expect(targetCs(oid, 0)).toBeNull();
    expect(targetClass(oid)).toBe(1);
    // a lap with no class (a bare pasted code) is no target at any class
    const bare = { ...bigTrack(), name: 'Bare Loop' };
    setTarget(ugcId(bare), 2000, null);
    expect(targetCs(ugcId(bare), 0)).toBeNull();
    expect(shareLap(ugcId(bare))).toBeUndefined();
    // a bad class in a link is ignored
    expect(readLapClass('?cls=7', '')).toBeNull();
    expect(readLapClass('', '#cls=2')).toBe(2);
  });

  it('the banner time, the result line and the live delta use only measured laps', () => {
    expect(fmtLap(2431)).toBe('0:24.31');
    expect(fmtLap(6512)).toBe('1:05.12');
    expect(makerLine(2431, 23.71)).toBe("⏱ You beat the sender's lap by 0.60 s!");
    expect(makerLine(2431, 24.71)).toBe("⏱ The sender's lap is 0.40 s faster. Again?");
    expect(makerLine(2431, null)).toBeNull();
    // halfway round a 24.31 s lap after 12.0 s: 0.155 s ahead
    expect(liveLapDelta(2431, 12, 0.5)).toBeCloseTo(-0.155, 3);
    expect(liveLapDelta(2431, 0.5, 0.02)).toBeNull();
  });
});
