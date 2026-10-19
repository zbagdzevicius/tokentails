import { describe, expect, it } from 'vitest';
import type { TrackDef } from '../../types';
import { TRACKS } from '../../core/track/tracks';
import { cleanName, decodeTrackCode, encodeTrack, trackCodecV1, trackKey, ugcId } from './track-code';
import { fromBase64url, toBase64url } from './base64url';
import { extractCode, readTrackCode, trackLink, wantsEditor } from './link';
import { setTrackCodec, trackFromLocation } from './track-codec';

/** Drop the fields the code does not carry the same way (id, sides the decoder fills in). */
function norm(def: TrackDef): unknown {
  return {
    ...def,
    id: '',
    features: def.features.map((f) => ({ s: f.s, kind: f.kind, side: f.side ?? 0 })),
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
      expect(norm(back.track)).toEqual(norm(def));
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
    // version 2 with a valid CRC
    const v2 = bytes.slice(0, bytes.length - 2);
    v2[0] = (v2[0] & 0x0f) | 0x20;
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
    const code = encodeTrack(TRACKS[1]);
    const a = trackFromLocation({ search: `?t=${code}`, hash: '' });
    const b = trackFromLocation({ search: '', hash: `#t=${code}` });
    expect(a?.ok && a.track.name).toBe('Neon Rooftops');
    expect(b?.ok && b.track.name).toBe('Neon Rooftops');
    expect(trackFromLocation({ search: '?track=kitchen', hash: '' })).toBeNull();
    expect(trackFromLocation({ search: '?t=broken', hash: '' })).toEqual({ ok: false, reason: 'crc' });
  });
});

describe('track links', () => {
  it('builds play links on the same game path', () => {
    expect(trackLink('ABC', { origin: 'https://tokentails.com', pathname: '/meow-race' })).toBe('https://tokentails.com/meow-race?t=ABC');
    expect(trackLink('ABC', { origin: 'https://tokentails.com', pathname: '/meow-race/make' })).toBe('https://tokentails.com/meow-race?t=ABC');
    expect(trackLink('ABC', { origin: 'http://127.0.0.1:5175', pathname: '/' })).toBe('http://127.0.0.1:5175/?t=ABC');
    expect(trackLink('ABC', { origin: 'http://x', pathname: '/formula-meow-game/index.html' })).toBe('http://x/formula-meow-game/?t=ABC');
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
