import { describe, expect, it } from 'vitest';
import { TRACKS } from '../core/track/tracks';
import { decodeTrackCode, encodeTrack } from '../ugc/codec/track-code';
import { remixOf } from '../ugc/actions';
import { trackKey } from './codec/ghost-codec';
import { encodeGhostSync } from './codec/ghost-codec';
import { dareUrl, parseRoute } from './links/link';
import { SIM_VERSION } from '../types';
import { dareRace } from './links/dare-flow';
import { shadowConfig } from './links/duel';

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

  // iteration 4 (F9, F10): duels and the maker's lap ride on the same links
  const doodle = () => {
    const d = decodeTrackCode(encodeTrack({ ...remixOf(TRACKS[0]), name: 'Dare Loop' }));
    if (!d.ok) throw new Error('decode');
    return d.track;
  };
  const loc = { pathname: '/', search: '', hash: '', origin: 'http://localhost', hostname: 'localhost' };
  const open = (ghost: string, trackCode: string) => {
    const url = new URL(dareUrl(loc, { ghost, name: 'Zyg', trackCode }));
    const r = parseRoute({ pathname: url.pathname, search: url.search, hash: url.hash });
    if (r.kind !== 'dare') throw new Error(r.kind);
    return r;
  };

  it('a time-trial dare on a doodle opens as a time-trial duel; a race dare as a 1v1 (or the pack)', () => {
    const tr = doodle();
    const code = encodeTrack(tr);
    const tt = open(encodeGhostSync({ trackKey: trackKey(tr.id), seed: 3, cls: 0, modifiers: 0, forgiving: false, slot: 0, mode: 'tt' }, [0, 1]), code);
    expect(tt.header).toMatchObject({ mode: 'tt', simVersion: SIM_VERSION });
    expect(dareRace(tt.header, false)).toEqual({ mode: 'tt', solo: true });
    expect(dareRace(tt.header, true)).toEqual({ mode: 'tt', solo: true });
    const race = open(encodeGhostSync({ trackKey: trackKey(tr.id), seed: 3, cls: 0, modifiers: 0, forgiving: false, slot: 7, mode: 'race' }, [0, 1]), code);
    expect(dareRace(race.header, false)).toEqual({ mode: 'dare', solo: true });
    expect(dareRace(race.header, true)).toEqual({ mode: 'dare', solo: false });
    // a duel run sent back keeps its lone shadow race
    const back = open(encodeGhostSync({ trackKey: trackKey(tr.id), seed: 3, cls: 0, modifiers: 0, forgiving: false, slot: 0, mode: 'dare', solo: true }, [0, 1]), code);
    expect(back.header.solo).toBe(true);
    expect(shadowConfig(back.header, tr, 'Zyg', null).racers).toHaveLength(1);
  });

  it('a dare stamped SIM_VERSION 10 on a doodle stays a target-time race', () => {
    const tr = doodle();
    const old = open(encodeGhostSync({ trackKey: trackKey(tr.id), seed: 3, cls: 0, modifiers: 0, forgiving: false, slot: 7, mode: 'race', simVersion: 10 }, [0, 1]), encodeTrack(tr));
    expect(old.header.simVersion).toBe(10);
    expect(dareRace(old.header, false)).toEqual({ mode: 'dare', solo: false });
  });

  it("a track code with the maker's lap still gives the dare's track key (the lap is not part of the track)", () => {
    const tr = doodle();
    const withLap = decodeTrackCode(encodeTrack(tr, { creatorLapCs: 2431 }));
    expect(withLap.ok).toBe(true);
    if (!withLap.ok) return;
    expect(withLap.creatorLapCs).toBe(2431);
    expect(trackKey(withLap.track.id)).toBe(trackKey(tr.id));
  });
});
