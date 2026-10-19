/**
 * Card skins (GDD §7.2): the palette and coat pattern of a Token Tails cat, read from its 48 px pixel-art sprite.
 * One pure function, shared by the build-time generator (tools/gen-cat-skins.mjs, which imports this file directly
 * through Node's type stripping, so it has no imports and only erasable TypeScript) and the runtime sprite probe
 * (render/skins/spriteProbe.ts). Render only.
 *
 * Sprite layout (every sheet, 720×480, 15 × 10 frames of 48 px, facing right): IDLE is row 4, SITTING row 8. In the
 * IDLE frames the head sits at x 22–36, y 12–23, the torso at x 13–29, y 23–31, the paws at y 33–36 and the tail at
 * x 10–18, y 10–24. The inner ears are `#d58971` at (24, 14) and (34, 14), the eyes two-pixel columns at x 28 and
 * 32, y 19–20, and the nose one pixel at (30, 21).
 *
 * Steps: an exact-colour histogram of opaque pixels, merged at ΔE76 < 8; a cluster is outline when ≥ 60 % of its
 * pixels touch a transparent pixel; slots by size (fur, white, secondary, patch) and by position (eyes, nose, inner
 * ear); the pattern by the first matching rule (calico, points, tuxedo, tabby, spots, solid), voted by the IDLE frames.
 */

export type SkinPattern = 'solid' | 'tabby' | 'points' | 'spots' | 'tuxedo' | 'calico';

/** One 48 × 48 RGBA frame. `kind` says which layout the boxes assume ('sit' frames only add colour counts). */
export interface SpriteFrame {
  data: ArrayLike<number>;
  width: number;
  height: number;
  kind: 'idle' | 'sit';
}

/** Raw slots (0xRRGGBB) as read from the sprite. */
export interface Classified {
  pattern: SkinPattern;
  fur: number;
  secondary: number | null;
  white: number | null;
  patch: number | null;
  /** Calico only: the orange and dark clusters. */
  orange: number | null;
  dark: number | null;
  eyes: number | null;
  nose: number | null;
  earInner: number | null;
  /** 0..1: how much the IDLE frames agree and how much of the cat the fur covers. */
  confidence: number;
  /** Distinct exact colours in the first frame. */
  colours: number;
}

/** The chibi palette row (render/skins/families.gen.ts): CoatSpec colours plus the face. */
export interface SkinRow {
  pattern: SkinPattern;
  base: number;
  deep: number;
  light: number;
  cream: number;
  patch?: number;
  eyes: number;
  nose: number;
  earInner: number;
  confidence: number;
}

export const AMBER_EYES = 0xf2b84b;
const EAR_PINK = 0xd58971;
const WHITE = 0xffffff;

// ------------------------------------------------------------------------------------------------- colour maths

const R = (c: number): number => (c >> 16) & 255;
const G = (c: number): number => (c >> 8) & 255;
const B = (c: number): number => c & 255;

export function mixHex(a: number, b: number, t: number): number {
  const ch = (sh: number): number => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t) << sh;
  return ch(16) | ch(8) | ch(0);
}

export const shadeHex = (c: number, k: number): number => mixHex(c, 0, k);

/** HSL of a hex: hue in degrees, saturation and lightness 0..1. */
export function hsl(c: number): [number, number, number] {
  const r = R(c) / 255;
  const g = G(c) / 255;
  const b = B(c) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

export function hslToHex(h: number, s: number, l: number): number {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    const v = x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  const hh = (((h % 360) + 360) % 360) / 360;
  return s === 0 ? (Math.round(l * 255) * 0x010101) : (f(hh + 1 / 3) << 16) | (f(hh) << 8) | f(hh - 1 / 3);
}

function lab(c: number): [number, number, number] {
  const lin = (v: number): number => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const r = lin(R(c));
  const g = lin(G(c));
  const b = lin(B(c));
  const fx = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = fx((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = fx(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = fx((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 colour difference. */
export function deltaE(a: number, b: number): number {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Lighten by `k` (×1.08: pixel art reads darker under the 3D lights), each channel clamped. */
export const liftHex = (c: number, k = 1.08): number =>
  (Math.min(255, Math.round(R(c) * k)) << 16) | (Math.min(255, Math.round(G(c) * k)) << 8) | Math.min(255, Math.round(B(c) * k));

// ------------------------------------------------------------------------------------------------ boxes (IDLE)

type Box = readonly [number, number, number, number]; // x0, y0, x1, y1 inclusive
const inBox = (b: Box, x: number, y: number): boolean => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const TORSO: Box = [13, 23, 29, 31];
const CHEST: Box = [27, 21, 34, 31];
const MUZZLE: Box = [26, 19, 34, 24];
const PAWS: Box = [10, 33, 37, 37];
const EARS: Box = [22, 10, 37, 16];
const TAIL: Box = [8, 8, 18, 24];
const EXTREMITIES: readonly Box[] = [EARS, TAIL, PAWS, MUZZLE];
const isExtremity = (x: number, y: number): boolean => EXTREMITIES.some((b) => inBox(b, x, y));

// --------------------------------------------------------------------------------------------------- clusters

interface Cluster {
  rgb: number;
  n: number;
  edge: number;
  members: Set<number>;
}

const at = (f: SpriteFrame, x: number, y: number): number => (y * f.width + x) * 4;
const opaque = (f: SpriteFrame, x: number, y: number): boolean => x >= 0 && y >= 0 && x < f.width && y < f.height && f.data[at(f, x, y) + 3] >= 128;
const rgbAt = (f: SpriteFrame, x: number, y: number): number => {
  const i = at(f, x, y);
  return (f.data[i] << 16) | (f.data[i + 1] << 8) | f.data[i + 2];
};

function histogram(frames: readonly SpriteFrame[]): Map<number, { n: number; edge: number }> {
  const m = new Map<number, { n: number; edge: number }>();
  for (const f of frames) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        if (!opaque(f, x, y)) continue;
        const k = rgbAt(f, x, y);
        const e = !opaque(f, x - 1, y) || !opaque(f, x + 1, y) || !opaque(f, x, y - 1) || !opaque(f, x, y + 1) ? 1 : 0;
        const v = m.get(k);
        if (v) {
          v.n++;
          v.edge += e;
        } else m.set(k, { n: 1, edge: e });
      }
    }
  }
  return m;
}

function clusterize(hist: Map<number, { n: number; edge: number }>): Cluster[] {
  const out: Cluster[] = [];
  const sorted = [...hist.entries()].sort((a, b) => b[1].n - a[1].n || a[0] - b[0]);
  for (const [rgb, v] of sorted) {
    const c = out.find((k) => deltaE(k.rgb, rgb) < 8);
    if (c) {
      c.n += v.n;
      c.edge += v.edge;
      c.members.add(rgb);
    } else out.push({ rgb, n: v.n, edge: v.edge, members: new Set([rgb]) });
  }
  return out;
}

// --------------------------------------------------------------------------------------------------- classify

/**
 * Read a cat sprite. `frames[0]` is IDLE frame 0 (ties and positional slots use it). `opts.outlier` (non-cat
 * animals, art the classifier is known to misread) forces a solid coat from the extracted colours.
 */
export function classifySprite(frames: readonly SpriteFrame[], opts: { outlier?: boolean } = {}): Classified {
  const f0 = frames[0];
  const colours = histogram([f0]).size;
  const clusters = clusterize(histogram(frames));
  const total = clusters.reduce((s, c) => s + c.n, 0) || 1;
  const interior = clusters.filter((c) => c.edge / c.n < 0.6);
  const inTotal = interior.reduce((s, c) => s + c.n, 0) || 1;
  const share = (c: Cluster | null | undefined): number => (c ? c.n / inTotal : 0);
  const L = (c: number): number => hsl(c)[2];
  // fur: the cluster that fills the torso (a points cat's dark face can outweigh its body in a plain count)
  const torso = new Map<Cluster, number>();
  for (const f of frames) {
    if (f.kind !== 'idle') continue;
    for (let y = TORSO[1]; y <= TORSO[3]; y++)
      for (let x = TORSO[0]; x <= TORSO[2]; x++) {
        if (!opaque(f, x, y)) continue;
        const c = rgbAt(f, x, y);
        const k = clusters.find((q) => q.members.has(c));
        if (k) torso.set(k, (torso.get(k) ?? 0) + 1);
      }
  }
  const pool = interior.length ? interior : clusters;
  const byTorso = [...torso.entries()].filter(([c]) => pool.includes(c)).sort((a, b) => b[1] - a[1]);
  const furC = byTorso[0]?.[0] ?? pool[0];
  const fur = furC?.rgb ?? 0x808080;
  const isWhite = (c: Cluster): boolean => L(c.rgb) > 0.85;
  const whiteC = isWhite(furC) ? furC : (interior.find((c) => c !== furC && isWhite(c) && share(c) >= 0.03) ?? null);
  const rest = interior.filter((c) => c !== furC && !isWhite(c) && share(c) >= 0.06);
  const secC = rest[0] ?? null;
  const patchC = rest[1] ?? null;

  // positional slots on IDLE frame 0
  const pick = (pts: readonly (readonly [number, number])[]): number[] => pts.filter(([x, y]) => opaque(f0, x, y)).map(([x, y]) => rgbAt(f0, x, y));
  const furOf = (c: number): boolean => !!furC && furC.members.has(c);
  const ears = pick([[24, 14], [34, 14], [24, 15], [34, 15], [24, 13], [34, 13]]).filter((c) => !furOf(c));
  const earInner = ears.find((c) => deltaE(c, EAR_PINK) < 12) ?? ears.find((c) => hsl(c)[1] > 0.25 && L(c) > 0.35) ?? null;
  const eyeCands = pick([[28, 19], [28, 20], [32, 19], [32, 20]]).filter((c) => !furOf(c));
  const eyesSat = eyeCands.filter((c) => L(c) > 0.12 && L(c) < 0.96 && hsl(c)[1] > 0.15).sort((a, b) => hsl(b)[1] - hsl(a)[1]);
  const eyes = eyesSat[0] ?? null;
  const noseCands = pick([[30, 21], [30, 22], [29, 21]]).filter((c) => !furOf(c));
  const nose = noseCands[0] ?? null;

  // pattern votes (IDLE frames)
  const idle = frames.filter((f) => f.kind === 'idle');
  const votes: SkinPattern[] = [];
  const whiteRGB = whiteC && whiteC !== furC ? whiteC : null;
  const orangeC = interior.find((c) => {
    const [h, s] = hsl(c.rgb);
    return h >= 15 && h <= 45 && s > 0.4 && share(c) >= 0.08;
  });
  const darkC = clusters.find((c) => L(c.rgb) < 0.25 && c.n / total >= 0.08 && (c.edge / c.n < 0.6 || c === furC));
  const calico = !opts.outlier && !!orangeC && !!darkC && !!whiteRGB && share(whiteRGB) >= 0.08;
  for (const f of idle) {
    if (opts.outlier) {
      votes.push('solid');
      continue;
    }
    if (calico) {
      votes.push('calico');
      continue;
    }
    // per-pixel labels: f = fur, s = secondary, w = white, o = other / outline
    const label = (x: number, y: number): 'f' | 's' | 'w' | 'o' | '' => {
      if (!opaque(f, x, y)) return '';
      const c = rgbAt(f, x, y);
      if (furC?.members.has(c)) return 'f';
      if (secC?.members.has(c)) return 's';
      if (whiteRGB?.members.has(c)) return 'w';
      return 'o';
    };
    let bodyL = 0;
    let bodyN = 0;
    let extL = 0;
    let extN = 0;
    let whiteAll = 0;
    let whiteMarked = 0;
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const k = label(x, y);
        if (!k || k === 'o') continue;
        const l = L(rgbAt(f, x, y));
        if (inBox(TORSO, x, y)) {
          bodyL += l;
          bodyN++;
        } else if (isExtremity(x, y) && !inBox(MUZZLE, x, y)) {
          extL += l;
          extN++;
        }
        if (k === 'w') {
          whiteAll++;
          if (inBox(CHEST, x, y) || inBox(MUZZLE, x, y) || inBox(PAWS, x, y)) whiteMarked++;
        }
      }
    }
    const furL = L(fur);
    if (furL > 0.6 && bodyN > 0 && extN > 0 && extL / extN <= bodyL / bodyN - 0.25) {
      votes.push('points');
      continue;
    }
    if (furL < 0.3 && whiteRGB && share(whiteRGB) >= 0.12 && whiteAll > 0 && whiteMarked / whiteAll >= 0.6) {
      votes.push('tuxedo');
      continue;
    }
    if (secC && share(secC) >= 0.1) {
      let changes = 0;
      let rows = 0;
      let striped = 0;
      for (let y = TORSO[1]; y <= TORSO[3]; y++) {
        let prev = '';
        let n = 0;
        let ch = 0;
        for (let x = TORSO[0]; x <= TORSO[2]; x++) {
          const k = label(x, y);
          if (k !== 'f' && k !== 's') continue;
          n++;
          if (prev && k !== prev) ch++;
          prev = k;
        }
        if (n >= 4) {
          rows++;
          changes += ch;
          if (ch >= 4) striped++;
        }
      }
      if (striped >= 3 || (rows > 0 && changes / rows >= 4)) {
        votes.push('tabby');
        continue;
      }
    }
    if (secC && share(secC) >= 0.08) {
      // connected parts of secondary that touch no extremity box
      const seen = new Set<number>();
      let parts = 0;
      for (let y = 0; y < f.height; y++) {
        for (let x = 0; x < f.width; x++) {
          if (seen.has(y * 64 + x) || label(x, y) !== 's') continue;
          const stack = [[x, y]];
          seen.add(y * 64 + x);
          let touches = false;
          let size = 0;
          while (stack.length) {
            const [px, py] = stack.pop() as number[];
            size++;
            if (isExtremity(px, py)) touches = true;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = px + dx;
              const ny = py + dy;
              if (seen.has(ny * 64 + nx) || label(nx, ny) !== 's') continue;
              seen.add(ny * 64 + nx);
              stack.push([nx, ny]);
            }
          }
          if (!touches && size >= 2) parts++;
        }
      }
      // patches: three body spots, or a high-contrast second colour (white cats with patches, torties)
      if (parts >= 3 || deltaE(fur, secC.rgb) >= 35) {
        votes.push('spots');
        continue;
      }
    }
    votes.push('solid');
  }
  const tally = new Map<SkinPattern, number>();
  for (const v of votes) tally.set(v, (tally.get(v) ?? 0) + 1);
  let pattern: SkinPattern = votes[0] ?? 'solid';
  for (const [p, n] of tally) if (n > (tally.get(pattern) ?? 0)) pattern = p;
  const agree = votes.length ? (tally.get(pattern) ?? 0) / votes.length : 0.5;
  let confidence = Math.round(agree * Math.min(1, share(furC) / 0.25) * 100) / 100;
  if (opts.outlier || colours > 64) {
    pattern = 'solid';
    confidence = Math.min(confidence, 0.45);
  } else if (confidence < 0.5 && pattern !== 'solid') pattern = 'solid';
  return {
    pattern,
    fur,
    secondary: secC?.rgb ?? null,
    white: whiteC?.rgb ?? null,
    patch: patchC?.rgb ?? null,
    orange: orangeC?.rgb ?? null,
    dark: darkC?.rgb ?? null,
    eyes,
    nose,
    earInner,
    confidence,
    colours,
  };
}

/**
 * GDD §7.2 mapping of the raw slots onto the chibi coat (vertex colour only): base = fur, deep = secondary (else the
 * fur 35 % darker), light = fur halfway to white, cream = white (else light), each lifted ×1.08. Calico: a cream base
 * with orange patches and dark ones. The inner ear is the sprite's own (else the nose 20 % toward white); eyes fall
 * back to `fallbackEyes`, then amber.
 */
export function rowOf(c: Classified, fallbackEyes: number | null = null): SkinRow {
  const L = (x: number): number => hsl(x)[2];
  const lift = (x: number): number => liftHex(x);
  const lightRaw = mixHex(c.fur, WHITE, 0.5);
  let base = c.fur;
  let deep = c.secondary ?? shadeHex(c.fur, 0.35);
  let patch = c.patch ?? undefined;
  const cream = c.white ?? lightRaw;
  if (c.pattern === 'calico') {
    base = c.white ?? lightRaw;
    patch = c.orange ?? c.fur;
    deep = c.dark ?? shadeHex(c.fur, 0.6);
  } else if (c.pattern === 'tuxedo') {
    deep = c.secondary && L(c.secondary) < 0.35 ? c.secondary : shadeHex(c.fur, 0.35);
  } else if (c.pattern === 'points') {
    deep = c.secondary && L(c.secondary) < L(c.fur) ? c.secondary : shadeHex(c.fur, 0.55);
  }
  const nose = c.nose ?? 0x6a4438;
  const row: SkinRow = {
    pattern: c.pattern,
    base: lift(base),
    deep: lift(deep),
    light: lift(c.pattern === 'calico' ? mixHex(base, WHITE, 0.4) : lightRaw),
    cream: lift(cream),
    eyes: c.eyes ?? fallbackEyes ?? AMBER_EYES,
    nose,
    earInner: c.earInner ?? mixHex(nose, WHITE, 0.2),
    confidence: c.confidence,
  };
  if (patch !== undefined && c.pattern === 'calico') row.patch = lift(patch);
  return row;
}

/**
 * A variant sprite's accent (a hat, a bow tie, wings): the largest cluster at least ΔE 20 from every family colour,
 * or null. Used for Clem's bow.
 */
export function accentOf(frames: readonly SpriteFrame[], family: readonly number[]): number | null {
  const clusters = clusterize(histogram(frames));
  const total = clusters.reduce((s, c) => s + c.n, 0) || 1;
  // family rows are stored lifted ×1.08: compare against the sprite's own (unlifted) colours too
  const ref = family.flatMap((f) => [f, liftHex(f, 1 / 1.08)]);
  // an accessory is an interior, saturated colour (never the outline or a grey)
  const c = clusters.find((k) => k.n / total >= 0.02 && k.edge / k.n < 0.6 && hsl(k.rgb)[1] > 0.25 && hsl(k.rgb)[2] > 0.12 && ref.every((f) => deltaE(f, k.rgb) >= 20));
  return c?.rgb ?? null;
}

/** Copy a 48 px frame out of a whole sheet (RGBA bytes). Rows: IDLE 4, SITTING 8. */
export function frameOf(sheet: { data: ArrayLike<number>; width: number }, col: number, row: number, kind: SpriteFrame['kind']): SpriteFrame {
  const F = 48;
  const out = new Uint8Array(F * F * 4);
  for (let y = 0; y < F; y++) {
    for (let x = 0; x < F; x++) {
      const i = ((row * F + y) * sheet.width + col * F + x) * 4;
      const o = (y * F + x) * 4;
      out[o] = sheet.data[i];
      out[o + 1] = sheet.data[i + 1];
      out[o + 2] = sheet.data[i + 2];
      out[o + 3] = sheet.data[i + 3];
    }
  }
  return { data: out, width: F, height: F, kind };
}

/** The voting frames of a whole sheet: IDLE 0, 3 and 6, then SITTING 0. */
export const sheetFrames = (sheet: { data: ArrayLike<number>; width: number }): SpriteFrame[] => [
  frameOf(sheet, 0, 4, 'idle'),
  frameOf(sheet, 3, 4, 'idle'),
  frameOf(sheet, 6, 4, 'idle'),
  frameOf(sheet, 0, 8, 'sit'),
];
