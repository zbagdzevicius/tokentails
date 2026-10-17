/** L-UI: URL parameters (SPEC.md "URL parameters"). */
import { SHOTS } from '../config';
import type { RaveParams, ShotId } from '../types';

export function parseParams(search: string, host: string): RaveParams {
  const q = new URLSearchParams(search);
  const flag = (k: string) => ['1', 'true', 'yes'].includes((q.get(k) || '').toLowerCase());
  const catsRaw = q.get('cats');
  const cats = catsRaw !== null && /^\d{1,6}$/.test(catsRaw) ? Math.min(Number(catsRaw), 100000) : null;
  const shot = q.get('shot') as ShotId | null;
  const quality = q.get('quality');
  const api = q.get('api');
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
  };
}
