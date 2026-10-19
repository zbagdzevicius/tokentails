/**
 * `?skins=demo`: a local-only preview of card skins for the standalone game (no Token Tails host, so no owned cats).
 * It feeds a fixed demo roster through the normal roster path (parseRoster, then the skin registry), one cat per
 * rung of the rarity ladder plus a pack cat that stays Common. Render only: nothing is sent, saved server-side or
 * granted, no featured cats or offers are seeded, and it never runs inside a host frame, in an app build, or on any
 * host name other than localhost / 127.0.0.1 / ::1 / a file:// page.
 */
const CDN = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com';

export const DEMO_ROSTER: readonly Record<string, unknown>[] = Object.freeze([
  { id: 'demo-ficus', name: 'Ficus', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'adopt', sprite: `${CDN}/assets/FICUS/base.png` },
  { id: 'demo-pinkie', name: 'Pinkie', type: 'STELLAR', tier: 'EPIC', isStarter: false, origin: 'adopt', sprite: `${CDN}/assets/PINKIE/base.png` },
  { id: 'demo-rascal', name: 'Rascal', type: 'WATER', tier: 'RARE', isStarter: false, origin: 'redeem', sprite: `${CDN}/assets/RASCAL/base.png` },
  { id: 'demo-pickles', name: 'Pickles', type: 'GRASS', tier: 'COMMON', isStarter: false, origin: 'adopt', sprite: `${CDN}/assets/PICKLES/base.png` },
  { id: 'demo-grey', name: 'Grey', type: 'ICE', tier: 'EPIC', isStarter: false, origin: 'pack', sprite: `${CDN}/assets/GREY/base.png` },
]);

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** True when `?skins=demo` is set on a local, unframed, non-app page. */
export function skinDemoOn(o: { search: string; protocol: string; hostname: string; framed: boolean; isApp: boolean }): boolean {
  if (o.framed || o.isApp) return false;
  if (o.protocol !== 'file:' && !LOCAL_HOSTS.has(o.hostname)) return false;
  try {
    return new URLSearchParams(o.search).get('skins') === 'demo';
  } catch {
    return false;
  }
}
