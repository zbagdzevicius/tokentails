/** L-UI: URL parameters (SPEC.md "URL parameters"). */
import { SHOTS } from '../config';
import type { RaveParams, ShotId, TrackId } from '../types';

export function parseParams(search: string, host: string): RaveParams {
  const q = new URLSearchParams(search);
  const flag = (k: string) => ['1', 'true', 'yes'].includes((q.get(k) || '').toLowerCase());
  const catsRaw = q.get('cats');
  const cats = catsRaw !== null && /^\d{1,6}$/.test(catsRaw) ? Math.min(Number(catsRaw), 100000) : null;
  const shot = q.get('shot') as ShotId | null;
  const quality = q.get('quality');
  const api = q.get('api');
  const track = q.get('track');
  const mixBase = q.get('mixBase');
  const isProd = /(^|\.)tokentails\.com$/i.test(host.split(':')[0]);
  return {
    cats,
    shot: shot && SHOTS.includes(shot) ? shot : null,
    mute: flag('mute'),
    cat: q.get('cat') || q.get('tx'),
    quality: quality === 'low' || quality === 'mid' || quality === 'high' ? quality : null,
    auto: q.get('auto') !== '0',
    embed: flag('embed'),
    debug: flag('debug'),
    api: !isProd && api && /^https?:\/\//.test(api) ? api.replace(/\/+$/, '') : null,
    // Only present when set (older callers compare the whole object).
    ...(track === 'synth' || track === 'mix' ? { track } : {}),
    // An absolute http(s) URL or a same-origin path; never javascript: or a protocol-relative host.
    ...(mixBase && (/^https?:\/\/[^\s]+$/.test(mixBase) || /^\/(?!\/)[^\s]*$/.test(mixBase)) ? { mixBase } : {}),
  };
}

/**
 * The track a visit starts on: og and embed always play the synth (they never fetch the mix);
 * otherwise `?track=`, then the viewer's stored choice (`rave:track`), then the synth.
 */
export function initialTrack(o: { og: boolean; embed: boolean; param?: TrackId | null; stored: string | null }): TrackId {
  if (o.og || o.embed) return 'synth';
  if (o.param) return o.param;
  return o.stored === 'mix' ? 'mix' : 'synth';
}
