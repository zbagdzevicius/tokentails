/**
 * Home's map backdrops (founder, Nov 20: "implement Real map backdrops that rotates", from the lobby concepts' 18 views):
 * Home shows the selected champion standing in a real spot of one of the 3v3 rotation's maps (and Hearthwood), and moves
 * on to the next spot every ROTATE_S seconds with a FADE_S crossfade. Docs: docs/plans/moba/HOME-MAP-BACKDROPS.md.
 *
 * Hybrid (measured, Nov 20): the map is a picture, the champion is live 3D.
 * - The 18 pictures are the empty spots drawn by the real renderer (tools/bake-lobby-maps.mjs), 2.164:1 (the 844x390
 *   phone frame), 1920 or 1280 px wide WebP, 41–75 KB each. pawlegends.app serves them beside the skin art
 *   (`pawlegends-art/lobby-maps/`), outside the 10 MB game budget, and Home asks for one at a time.
 * - The champion is the lobby's own 3D model, drawn with the camera the picture was shot with, so it stands on the spot.
 *   Every view is kept in a champion-centred frame: the feet at the origin, the camera at (0, h, gd), the champion turned
 *   REL_DEG toward screen right (toward PLAY), the sun from `sunDir`. Between two views only the camera's distance,
 *   height, target and the light change, so a crossfade eases them and the champion never jumps.
 * - A live 3D map was rejected: 35–60 draw calls on a menu (Home draws ~4), a map rebuild (seconds on a phone) on every
 *   rotation, and the match code loaded before PLAY.
 *
 * Pure: data and maths only (unit-tested in tests/unit/home-map-bg.test.ts).
 */

/** One spot: where the camera stands (m, champion-centred frame), what it looks at, and the map's light there. */
export interface MapView {
  readonly id: string;
  readonly map: 'crossing' | 'ridge' | 'thicket' | 'quarry' | 'pitch' | 'hearthwood';
  /** What the spot is called on the map (e2e, alt text). */
  readonly spot: string;
  /** Camera height (m) and ground distance (m) from the feet. */
  readonly h: number;
  readonly gd: number;
  /** The camera's look point (m): solved so the feet land at FEET on a PIC_ASPECT frame (tools/clips/stills-frame.mjs). */
  readonly target: readonly [number, number, number];
  /** Toward the sun (unit), its sRGB colour and intensity; the sky and ground of the hemisphere light, its intensity. */
  readonly sunDir: readonly [number, number, number];
  readonly sun: string;
  readonly sunI: number;
  readonly sky: string;
  readonly ground: string;
  readonly hemiI: number;
}

/** The pictures' frame: 1266x585 (an 844x390 phone at 1.5x), vertical FOV 32°, the feet at (0.42, 0.8) from the top left. */
export const PIC_ASPECT = 1266 / 585;
export const PIC_FOV = 32;
export const FEET: readonly [number, number] = [0.42, 0.8];
/** The champion turns this far from facing the lens toward screen right (toward PLAY), in every view. */
export const REL_DEG = 45;
/** Each spot stays this long (s) before the next fades in over FADE_S. */
export const ROTATE_S = 12;
export const FADE_S = 1.2;

/**
 * The 18 spots of the lobby concepts (Nov 20), each map's day light at second 60 plus its colour scheme's nudge.
 * Keep in step with tools/clips/lobby-maps.shots.json (the pictures are baked from it).
 */
export const MAP_VIEWS: readonly MapView[] = [
  { id: 'crossing-01-doghouse', map: 'crossing', spot: 'Doghouse', h: 2.2, gd: 10, target: [1.02, 1.717, -0.177], sunDir: [-0.433, 0.829, 0.354], sun: '#fff6e6', sunI: 2.25, sky: '#fff3e3', ground: '#7b7792', hemiI: 1.6 },
  { id: 'crossing-02-bridge', map: 'crossing', spot: 'North bridge', h: 3.2, gd: 15, target: [1.526, 2.574, -0.249], sunDir: [0.23, 0.829, 0.51], sun: '#fff6e6', sunI: 2.25, sky: '#fff2e6', ground: '#7b7792', hemiI: 1.6 },
  { id: 'crossing-03-lane-tower', map: 'crossing', spot: 'Lane and tower', h: 2.8, gd: 13, target: [1.324, 2.231, -0.22], sunDir: [-0.103, 0.829, 0.55], sun: '#fdf6e9', sunI: 2.25, sky: '#fbf3e9', ground: '#7b7c98', hemiI: 1.6 },
  { id: 'ridge-01-fish-mill', map: 'ridge', spot: 'Fish Mill', h: 2.2, gd: 10, target: [1.02, 1.717, -0.176], sunDir: [0.195, 0.719, 0.667], sun: '#ffeacc', sunI: 2.2, sky: '#fdedd8', ground: '#7a7298', hemiI: 1.56 },
  { id: 'ridge-02-outer-tower', map: 'ridge', spot: 'Outer tower', h: 2.6, gd: 12, target: [1.223, 2.06, -0.205], sunDir: [-0.503, 0.719, -0.48], sun: '#ffeccf', sunI: 2.2, sky: '#fdeedb', ground: '#7a7298', hemiI: 1.56 },
  { id: 'ridge-03-ridge-road', map: 'ridge', spot: 'Ridge Road', h: 2.4, gd: 11, target: [1.121, 1.888, -0.191], sunDir: [0.503, 0.719, 0.48], sun: '#fdedd5', sunI: 2.2, sky: '#faefe3', ground: '#7b799c', hemiI: 1.56 },
  { id: 'thicket-01-paw-shrine', map: 'thicket', spot: 'Paw Shrine', h: 2.2, gd: 10, target: [1.02, 1.717, -0.177], sunDir: [-0.252, 0.616, 0.747], sun: '#f1f6ff', sunI: 2.05, sky: '#eef3fa', ground: '#6f8a86', hemiI: 1.7 },
  { id: 'thicket-02-south-tower', map: 'thicket', spot: 'South tower', h: 2.8, gd: 13, target: [1.323, 2.231, -0.22], sunDir: [0.632, 0.616, 0.47], sun: '#f2f3f7', sunI: 2.05, sky: '#edf2f3', ground: '#6f8a86', hemiI: 1.7 },
  { id: 'thicket-03-centre-glade', map: 'thicket', spot: 'Centre glade', h: 2.4, gd: 11, target: [1.121, 1.888, -0.192], sunDir: [0.788, 0.616, -0.018], sun: '#f1f6ff', sunI: 2.05, sky: '#ebf4fc', ground: '#738990', hemiI: 1.7 },
  { id: 'quarry-01-geode', map: 'quarry', spot: 'Geode', h: 2.2, gd: 10, target: [1.02, 1.717, -0.177], sunDir: [0.041, 0.927, 0.372], sun: '#fffaf0', sunI: 2.4, sky: '#fff8ec', ground: '#8a7b82', hemiI: 1.5 },
  { id: 'quarry-02-north-tower', map: 'quarry', spot: 'North tower', h: 2.6, gd: 12, target: [1.222, 2.06, -0.205], sunDir: [0.329, 0.927, 0.18], sun: '#fdfaf2', sunI: 2.4, sky: '#fbf7f0', ground: '#867f8d', hemiI: 1.5 },
  { id: 'quarry-03-cat-gate', map: 'quarry', spot: 'Cat gate', h: 2.4, gd: 11, target: [1.121, 1.888, -0.191], sunDir: [0.292, 0.927, 0.234], sun: '#fffaf0', sunI: 2.4, sky: '#fef8ec', ground: '#8a7b82', hemiI: 1.5 },
  { id: 'pitch-01-centre-spot', map: 'pitch', spot: 'Centre spot', h: 2.2, gd: 10, target: [1.02, 1.717, -0.177], sunDir: [-0.071, 0.883, 0.464], sun: '#fffdf6', sunI: 2.3, sky: '#f5faff', ground: '#7d8a98', hemiI: 1.66 },
  { id: 'pitch-02-goal-mouth', map: 'pitch', spot: 'Goal mouth', h: 2.6, gd: 12, target: [1.222, 2.06, -0.205], sunDir: [-0.464, 0.883, -0.071], sun: '#fdfcf7', sunI: 2.3, sky: '#f3f9ff', ground: '#7d899c', hemiI: 1.66 },
  { id: 'pitch-03-south-tower', map: 'pitch', spot: 'South tower', h: 2.4, gd: 11, target: [1.121, 1.888, -0.191], sunDir: [0.208, 0.883, 0.421], sun: '#fffdf6', sunI: 2.3, sky: '#f7f8fd', ground: '#7d8a98', hemiI: 1.66 },
  { id: 'hearthwood-01-grizzlechop-pit', map: 'hearthwood', spot: 'Grizzlechop pit', h: 2.2, gd: 10, target: [1.02, 1.717, -0.177], sunDir: [-0.073, 0.669, 0.739], sun: '#ffecd2', sunI: 2.2, sky: '#fff2e2', ground: '#7d6c88', hemiI: 1.55 },
  { id: 'hearthwood-02-river-road', map: 'hearthwood', spot: 'River road', h: 2.0, gd: 9, target: [0.919, 1.545, -0.162], sunDir: [-0.073, 0.669, 0.739], sun: '#ffecd2', sunI: 2.2, sky: '#fef3e3', ground: '#7d6c88', hemiI: 1.55 },
  { id: 'hearthwood-03-hearth-base', map: 'hearthwood', spot: 'Hearth base', h: 3.2, gd: 15, target: [1.526, 2.574, -0.249], sunDir: [-0.739, 0.669, -0.073], sun: '#fdedd7', sunI: 2.2, sky: '#fbf2e8', ground: '#7d7491', hemiI: 1.55 },
];

/**
 * The rotation order: one spot of each map in turn (the first spots of all six maps, then the second, then the third),
 * so two spots of the same map never follow each other. Indices into MAP_VIEWS.
 */
export function mapViewOrder(views: readonly MapView[] = MAP_VIEWS): number[] {
  const byMap = new Map<string, number[]>();
  views.forEach((v, i) => byMap.set(v.map, [...(byMap.get(v.map) ?? []), i]));
  const lists = [...byMap.values()];
  const out: number[] = [];
  for (let k = 0; out.length < views.length; k++) for (const l of lists) if (k < l.length) out.push(l[k]);
  return out;
}

/** The picture of a spot: 1920 px wide on a wide, not-Low screen, else 1280 (the 844x390 phone at 3x gets 1280 too). */
export function mapViewUrl(id: string, o: { root: string; rev?: string; bufferWidth: number; low: boolean }): string {
  const w = !o.low && o.bufferWidth > 1400 ? 1920 : 1280;
  return `${o.root}lobby-maps/${id}-${w}.webp${o.rev ?? ''}`;
}

/** `?mapbg=<id>` (e2e, screenshots): that spot, kept (no rotation). Unknown ids are ignored. */
export function mapViewOverride(search: string, views: readonly MapView[] = MAP_VIEWS): number | null {
  const v = new URLSearchParams(search).get('mapbg');
  const i = views.findIndex((m) => m.id === v);
  return i >= 0 ? i : null;
}

/** `?mapbg=off` (e2e of the fallback): Home shows the poster, as when the pictures cannot load. */
export function mapViewOff(search: string): boolean {
  return new URLSearchParams(search).get('mapbg') === 'off';
}

/** `?mapbgEvery=<s>` (e2e): a shorter stay, at least 1 s. */
export function mapViewEvery(search: string): number {
  const n = Number(new URLSearchParams(search).get('mapbgEvery'));
  return Number.isFinite(n) && n >= 1 ? n : ROTATE_S;
}

/**
 * The part of the picture a screen of `screenAspect` shows (picture units 0..1 from the top left): cover fit, cropped so
 * the feet stay at FEET on screen too (a wider screen loses sky and foreground, a narrower one the sides). The 3D camera
 * takes the same rectangle as its view offset, so the champion stays on the spot.
 */
export function coverCrop(screenAspect: number, picAspect = PIC_ASPECT, feet: readonly [number, number] = FEET): { x: number; y: number; w: number; h: number } {
  const a = Number.isFinite(screenAspect) && screenAspect > 0 ? screenAspect : picAspect;
  if (a >= picAspect) {
    const h = picAspect / a;
    return { x: 0, y: feet[1] * (1 - h), w: 1, h };
  }
  const w = a / picAspect;
  return { x: feet[0] * (1 - w), y: 0, w, h: 1 };
}

/** What the rotation shows: spot `from`, fading to `to` by `k` (0..1; `to === from` and k 0 when no fade runs). */
export interface RotationFrame {
  from: number;
  to: number;
  k: number;
}

/**
 * The rotation clock (pure). Each spot stays `every` s, then the next one fades in over `fade` s, but only once its
 * picture is in (`ready`): a slow network holds the spot rather than fading to nothing. `paused` (the tab hidden, a
 * panel over Home, reduced motion, not on Home) stops the clock; a fade already running finishes so the picture is never
 * left half way. `hold` keeps one spot for good (reduced motion, `?mapbg=`).
 */
export class MapRotation {
  private pos: number;
  private t = 0;
  private fadeT = -1;
  constructor(
    private readonly order: readonly number[],
    start: number,
    private readonly every = ROTATE_S,
    private readonly fade = FADE_S,
  ) {
    const i = order.indexOf(start);
    this.pos = i >= 0 ? i : 0;
  }

  /** The spot shown now (index into MAP_VIEWS). */
  get current(): number {
    return this.order[this.pos];
  }

  /** The spot that comes next (its picture should be loading). */
  get upcoming(): number {
    return this.order[(this.pos + 1) % this.order.length];
  }

  /** Seconds the current spot has been up (e2e). */
  get age(): number {
    return this.t;
  }

  /** Moves on to the next spot at once, no fade (the shown spot's picture failed). */
  skip(): void {
    this.pos = (this.pos + 1) % this.order.length;
    this.fadeT = -1;
    this.t = 0;
  }

  tick(dt: number, o: { paused: boolean; hold?: boolean; ready: (i: number) => boolean }): RotationFrame {
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (this.fadeT >= 0) {
      // a running fade always finishes (paused or not)
      this.fadeT += this.fade > 0 ? step / this.fade : 1;
      if (this.fadeT >= 1) {
        this.pos = (this.pos + 1) % this.order.length;
        this.fadeT = -1;
        this.t = 0;
      }
    } else if (!o.paused && !o.hold && this.order.length > 1) {
      this.t += step;
      if (this.t >= this.every && o.ready(this.upcoming)) this.fadeT = 0;
    }
    if (this.fadeT < 0) return { from: this.current, to: this.current, k: 0 };
    return { from: this.current, to: this.upcoming, k: smooth(this.fadeT) };
  }
}

const smooth = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
