/**
 * Room Maker palette (GDD 6.4 step 2): 6 tabs, every placeable prop kind in exactly one of them. The Roomba (an
 * actor on a fixed loop) and the sponsor product (needs RoomDef.sponsor) are never offered.
 */
import { PROP_KINDS, propKind, type PropKindDef } from '../types';
import { AREA_KINDS, KITS } from '../content/kits';

export type PaletteTab = 'fragile' | 'food' | 'fabric' | 'tech' | 'plants' | 'party';
export const PALETTE_TABS: readonly { id: PaletteTab; label: string; icon: string }[] = [
  { id: 'fragile', label: 'Fragile', icon: '🍷' },
  { id: 'food', label: 'Food', icon: '🎂' },
  { id: 'fabric', label: 'Fabric', icon: '🧶' },
  { id: 'tech', label: 'Tech', icon: '💻' },
  { id: 'plants', label: 'Plants', icon: '🪴' },
  { id: 'party', label: 'Party', icon: '🎈' },
];

/** Kinds the Room Maker never offers. */
export const EXCLUDED_KINDS: readonly number[] = [20, 63];

const TAB_BY_ID: Readonly<Record<string, PaletteTab>> = {
  // Fragile: glass and china, the good stuff
  'wine-glass': 'fragile', mug: 'fragile', 'plate-stack': 'fragile', 'fruit-bowl': 'fragile', perfume: 'fragile',
  ornament: 'fragile', 'toothbrush-cup': 'fragile', 'pen-cup': 'fragile', 'jewellery-dish': 'fragile',
  'mixer-bowl': 'fragile', 'scented-candle': 'fragile', 'face-mask-jar': 'fragile', 'water-glass': 'fragile',
  'snow-globe': 'fragile', 'champagne-bottle': 'fragile', 'gravy-boat': 'fragile', 'turkey-platter': 'fragile',
  'punch-bowl': 'fragile', 'perfume-tray': 'fragile',
  // Food
  'egg-carton': 'food', cake: 'food', 'tuna-can': 'food', 'popcorn-bowl': 'food', 'cookie-tray': 'food',
  'flour-bag': 'food', butter: 'food', 'snack-tower': 'food', pie: 'food', 'turkey-leg': 'food',
  // Fabric (tablecloth with a w x d resize)
  tablecloth: 'fabric', slipper: 'fabric', sock: 'fabric', 'yarn-ball': 'fabric', 'laundry-basket': 'fabric',
  'towel-stack': 'fabric', blanket: 'fabric',
  // Tech (and the desk clutter around it)
  lamp: 'tech', 'tv-remote': 'tech', laptop: 'tech', 'alarm-clock': 'tech', controller: 'tech', phone: 'tech',
  'book-stack': 'tech',
  // Plants
  vase: 'plants', 'potted-plant': 'plants', 'christmas-tree': 'plants', bouquet: 'plants',
  // Party
  'cups-tower': 'party', balloon: 'party', ribbon: 'party', 'gift-stack': 'party', 'birthday-candles': 'party',
  'board-game': 'party', dice: 'party', 'champagne-tower': 'party', 'gift-wrap': 'party', 'box-tower': 'party',
  'bubble-wrap': 'party', 'receipt-pile': 'party', 'cardboard-box': 'party', 'rubber-duck': 'party',
  'toilet-roll': 'party',
};

/** Material fallback for kinds added later without a tab entry. */
function tabByMaterial(k: PropKindDef): PaletteTab {
  switch (k.material) {
    case 'glass':
    case 'ceramic':
      return 'fragile';
    case 'food':
      return 'food';
    case 'fabric':
      return 'fabric';
    case 'tech':
    case 'metal':
      return 'tech';
    default:
      return 'party';
  }
}

export function isPlaceable(kind: number): boolean {
  return !!propKind(kind) && !EXCLUDED_KINDS.includes(kind);
}

/** Tab of a kind, null when the kind is never offered. */
export function tabOf(kind: number): PaletteTab | null {
  const k = propKind(kind);
  if (!k || EXCLUDED_KINDS.includes(kind)) return null;
  return TAB_BY_ID[k.id] ?? tabByMaterial(k);
}

/** Kinds every room offers (floor grabbables, the tablecloth, the lamp, a box to sit in). */
const EVERY_ROOM: readonly string[] = ['sock', 'slipper', 'tablecloth', 'lamp', 'cardboard-box', 'yarn-ball'];

/**
 * Round 3 (QA): the props a room "owns": the kinds its daily kit puts on its surfaces and floor, plus EVERY_ROOM
 * (the Kitchen listed 21 fragile kinds including a Christmas ornament and a face-mask jar). Admin gets everything.
 * `undefined` = no filter (an unknown shell).
 */
export function shellKinds(shellIndex: number): ReadonlySet<number> | undefined {
  const kit = KITS.find((k) => k.shell === shellIndex);
  if (!kit) return undefined;
  const out = new Set<number>();
  for (const sl of kit.slots) for (const k of AREA_KINDS[sl.area] ?? []) out.add(k);
  for (const k of kit.extraKinds ?? []) out.add(k);
  for (const k of kit.grabbables ?? []) out.add(k);
  for (const d of kit.decor ?? []) out.add(d.kind);
  if (kit.hero) out.add(kit.hero.kind);
  for (const k of PROP_KINDS) if (EVERY_ROOM.includes(k.id)) out.add(k.kind);
  return out;
}

/** Kinds of a tab, in catalog order; with `only`, just the room's own kinds (shellKinds). */
export function kindsForTab(tab: PaletteTab, only?: ReadonlySet<number>): PropKindDef[] {
  return PROP_KINDS.filter((k) => tabOf(k.kind) === tab && (!only || only.has(k.kind)));
}

/** Every placeable kind. */
export function placeableKinds(): PropKindDef[] {
  return PROP_KINDS.filter((k) => isPlaceable(k.kind));
}

const ICON: Readonly<Record<string, string>> = {
  'wine-glass': '🍷', mug: '☕', 'plate-stack': '🍽️', 'fruit-bowl': '🍎', 'egg-carton': '🥚', cake: '🎂', vase: '💐',
  'potted-plant': '🪴', lamp: '💡', 'tv-remote': '📺', laptop: '💻', 'toilet-roll': '🧻', perfume: '🌸',
  tablecloth: '🟥', 'book-stack': '📚', ornament: '🔴', 'christmas-tree': '🎄', slipper: '🥿', sock: '🧦',
  roomba: '🤖', 'tuna-can': '🐟', 'popcorn-bowl': '🍿', 'yarn-ball': '🧶', 'rubber-duck': '🦆', 'toothbrush-cup': '🪥',
  'pen-cup': '🖊️', 'cups-tower': '🥤', balloon: '🎈', ribbon: '🎀', 'gift-stack': '🎁', 'punch-bowl': '🍹',
  'birthday-candles': '🕯️', 'laundry-basket': '🧺', 'alarm-clock': '⏰', 'jewellery-dish': '💍', 'cookie-tray': '🍪',
  'flour-bag': '🥡', 'mixer-bowl': '🥣', butter: '🧈', 'board-game': '🎲', 'snack-tower': '🥨', controller: '🎮',
  dice: '🎲', 'scented-candle': '🕯️', 'face-mask-jar': '🫙', 'towel-stack': '🛁', 'gravy-boat': '🫖', pie: '🥧',
  'turkey-platter': '🦃', 'turkey-leg': '🍗', 'box-tower': '📦', 'bubble-wrap': '🫧', 'receipt-pile': '🧾',
  'cardboard-box': '📦', 'champagne-tower': '🥂', bouquet: '💐', phone: '📱', 'water-glass': '🥛', blanket: '🛏️',
  'snow-globe': '🔮', 'gift-wrap': '🎁', 'champagne-bottle': '🍾', 'sponsor-product': '⭐',
  // round 3: the Perfume tray fell back to 🎁
  'perfume-tray': '🧴',
};

export function kindIcon(kind: number): string {
  const k = propKind(kind);
  return (k && ICON[k.id]) || '🎁';
}

/** Short hint on a chip: what the prop does in a run. */
export function kindHint(k: PropKindDef): string {
  if (k.pull === 'cloth') return 'pull it';
  if (k.pull === 'cable') return 'yank the cable';
  if (k.tall) return 'TIMBER';
  if (k.enterable) return 'sit in it';
  if (k.grabbable) return 'steal it';
  if (k.stack) return `stack x${k.stack.items}`;
  if (k.puddle === 'slip') return 'slippery';
  return k.fragile ? 'smash' : 'knock';
}
