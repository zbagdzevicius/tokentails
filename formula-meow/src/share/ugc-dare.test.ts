import { describe, expect, it } from 'vitest';
import { TRACKS } from '../core/track/tracks';
import { decodeTrackCode, encodeTrack } from '../ugc/codec/track-code';
import { remixOf } from '../ugc/actions';
import { trackKey } from './codec/ghost-codec';
import { encodeGhostSync } from './codec/ghost-codec';
import { dareUrl, parseRoute } from './links/link';

describe('dares on UGC tracks (share x ugc)', () => {
  it('a shared track re-encoded for a dare link decodes to the same track key the ghost carries', () => {
    const first = decodeTrackCode(encodeTrack({ ...remixOf(TRACKS[0]), name: 'Dare Loop' }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = decodeTrackCode(encodeTrack(first.track));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(trackKey(again.track.id)).toBe(trackKey(first.track.id));
  });

  it('the dare link carries the track code and parseRoute reads it back', () => {
    const d = decodeTrackCode(encodeTrack({ ...remixOf(TRACKS[0]), name: 'Dare Loop' }));
    if (!d.ok) throw new Error('decode');
    const code = encodeTrack(d.track);
    const ghost = encodeGhostSync({ trackKey: trackKey(d.track.id), seed: 7, cls: 1, modifiers: 0, forgiving: false, slot: 7 }, [0, 0, 1]);
    const url = new URL(dareUrl({ pathname: '/', search: '', hash: '', origin: 'http://localhost', hostname: 'localhost' }, { ghost, name: 'Mochi', trackCode: code }));
    const r = parseRoute({ pathname: url.pathname, search: url.search, hash: url.hash });
    expect(r.kind).toBe('dare');
    if (r.kind !== 'dare') return;
    expect(r.trackCode).toBe(code);
    expect(r.header.trackKey).toBe(trackKey(d.track.id));
  });
});
