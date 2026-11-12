/**
 * A fixed demo roster for the dormant card-skin render kit (render/skins/registry.ts): unit tests and the trailer
 * harness only. The game itself never reads a roster any more (docs/plans/moba/NO-TOKENTAILS.md, 2026-11-12); the
 * `?skins=demo` page hook that used this was removed with the cats-become-skins feature.
 */
const CDN = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com';

export const DEMO_ROSTER: readonly Record<string, unknown>[] = Object.freeze([
  { id: 'demo-ficus', name: 'Ficus', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'adopt', sprite: `${CDN}/assets/FICUS/base.png` },
  { id: 'demo-pinkie', name: 'Pinkie', type: 'STELLAR', tier: 'EPIC', isStarter: false, origin: 'adopt', sprite: `${CDN}/assets/PINKIE/base.png` },
  { id: 'demo-rascal', name: 'Rascal', type: 'WATER', tier: 'RARE', isStarter: false, origin: 'redeem', sprite: `${CDN}/assets/RASCAL/base.png` },
  { id: 'demo-pickles', name: 'Pickles', type: 'GRASS', tier: 'COMMON', isStarter: false, origin: 'adopt', sprite: `${CDN}/assets/PICKLES/base.png` },
  { id: 'demo-grey', name: 'Grey', type: 'ICE', tier: 'EPIC', isStarter: false, origin: 'pack', sprite: `${CDN}/assets/GREY/base.png` },
]);
