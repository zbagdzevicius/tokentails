/**
 * `ttFit(text, opts)`: makes a text fit a box (plan F4, G12).
 *
 * Order of concessions, so a HUD line stays readable:
 * 1. drop low-priority segments, lowest priority first (the streak line drops "BEST 12", then
 *    "W3", before the score shrinks);
 * 2. then shrink one px at a time, never below the role minimum;
 * 3. only then, at the minimum size, truncate with an ellipsis (or report `fits: false` when
 *    `ellipsis` is off).
 *
 * The spec and the fitted output are remembered, so `installFontHealing` can fit the text again
 * when a late face lands (`refitText`). A text the scene has changed since (`setText("SCORE 500")`)
 * is refitted from what it shows now, never put back to the fitted copy.
 * No Phaser runtime import: `text` is anything Text-shaped, which keeps this testable in Jest.
 */
import { applyRoleCase, roleSize, TYPE_ROLES, type TypeRole } from "@/components/typography/roles";
import { roleMetrics } from "./ttStyle";

export interface TTFitSegment {
  text: string;
  /** Higher survives longer. `Infinity` (the default) is never dropped. */
  priority?: number;
}

export interface TTFitOptions {
  role: TypeRole;
  maxWidth: number;
  maxHeight?: number;
  /** Starting size in CSS px (defaults to the role default). */
  size?: number;
  /**
   * The content as prioritised segments. Defaults to the text's current content, kept whole.
   * Segments describe one moment: after changing the content, call `ttFit` again with the new
   * segments (healing refits a changed text whole, without priorities).
   */
  segments?: ReadonlyArray<TTFitSegment | string>;
  /** Joins segments. Default two spaces. */
  separator?: string;
  /** Truncate with "…" when even the minimum size is too wide. Default true. */
  ellipsis?: boolean;
  /** Apply the role case to the joined text. Default true. */
  applyCase?: boolean;
}

export interface TTFitResult {
  text: string;
  size: number;
  dropped: string[];
  truncated: boolean;
  fits: boolean;
}

/** The part of a Phaser Text that fitting needs. */
export interface TTFitTarget {
  text: string;
  width: number;
  height: number;
  setText(value: string): unknown;
  setFontSize(size: number | string): unknown;
  setLetterSpacing?(value: number): unknown;
  setLineSpacing?(value: number): unknown;
  setStroke?(color: string, thickness: number): unknown;
  style?: { stroke?: string; strokeThickness?: number };
}

interface FitMemory {
  /** The options as passed, segments normalised; `segments` only when the caller passed them. */
  spec: TTFitOptions;
  /** The content before fitting (the caller's segments, or the text as it was). */
  source: ReadonlyArray<TTFitSegment>;
  /** What `ttFit` left on the text. If the text differs at heal time, the scene changed it. */
  output: string;
}

const fitMemory = new WeakMap<object, FitMemory>();

/**
 * The spec `ttFit` last applied to `text`. `segments` is present only when the caller passed them;
 * without it, a refit uses the text's current content.
 */
export function fitSpecOf(text: object): TTFitOptions | undefined {
  return fitMemory.get(text)?.spec;
}

/**
 * Fits `text` again with its remembered spec (font healing). If the text still shows the fitted
 * output, the fit restarts from the original content, so dropped segments and truncated letters
 * come back when the real face is narrower. If the scene has changed the text since, the current
 * content is fitted whole. Returns `undefined` for a text that was never fitted.
 */
export function refitText(target: TTFitTarget): TTFitResult | undefined {
  const memory = fitMemory.get(target);
  if (!memory) return undefined;
  if (target.text === memory.output) return fitAndRemember(target, memory.spec, memory.source);
  return fitAndRemember(target, withoutSegments(memory.spec));
}

const ELLIPSIS = "…";

function applySize(target: TTFitTarget, role: TypeRole, size: number) {
  const metrics = roleMetrics(role, size);
  target.setFontSize(metrics.px);
  target.setLetterSpacing?.(metrics.letterSpacing);
  target.setLineSpacing?.(metrics.lineSpacing);
  const stroke = target.style?.stroke;
  if (TYPE_ROLES[role].stroke && stroke && (target.style?.strokeThickness ?? 0) > 0) {
    target.setStroke?.(stroke, metrics.strokeThickness);
  }
}

export function ttFit(target: TTFitTarget, opts: TTFitOptions): TTFitResult {
  return fitAndRemember(target, opts);
}

/**
 * Fits and records the memory. `source` restarts a remembered fit from its original content
 * without turning an implicit (whole-text) spec into an explicit one.
 */
function fitAndRemember(
  target: TTFitTarget,
  opts: TTFitOptions,
  source?: ReadonlyArray<TTFitSegment>,
): TTFitResult {
  // Without explicit segments the source is the text as it was before fitting.
  const content = (source ?? opts.segments ?? [target.text]).map((segment) =>
    typeof segment === "string" ? { text: segment } : { text: segment.text, priority: segment.priority },
  );
  const result = fitInto(target, { ...opts, segments: content });
  fitMemory.set(target, {
    spec: opts.segments ? { ...opts, segments: content } : withoutSegments(opts),
    source: content,
    output: target.text,
  });
  return result;
}

function withoutSegments(opts: TTFitOptions): TTFitOptions {
  const rest = { ...opts };
  delete rest.segments;
  return rest;
}

function fitInto(target: TTFitTarget, opts: TTFitOptions): TTFitResult {
  const role = opts.role;
  const minPx = TYPE_ROLES[role].minPx;
  const startPx = roleSize(role, opts.size);
  const separator = opts.separator ?? "  ";
  const useCase = opts.applyCase !== false;
  const ellipsis = opts.ellipsis !== false;

  const segments = (opts.segments ?? [target.text]).map((segment, index) => ({
    text: typeof segment === "string" ? segment : segment.text,
    priority: typeof segment === "string" ? Infinity : (segment.priority ?? Infinity),
    index,
  }));

  const compose = (kept: typeof segments) => {
    const joined = kept.map((s) => s.text).filter((t) => t.length > 0).join(separator);
    return useCase ? applyRoleCase(joined, role) : joined;
  };
  const fitsNow = () =>
    target.width <= opts.maxWidth + 0.5 && (opts.maxHeight === undefined || target.height <= opts.maxHeight + 0.5);
  const tryText = (value: string, size: number) => {
    if (target.text !== value) target.setText(value);
    applySize(target, role, size);
    return fitsNow();
  };

  // Drop order: lowest priority first; among equals, the later segment first.
  const dropOrder = segments
    .filter((s) => s.priority !== Infinity)
    .sort((a, b) => a.priority - b.priority || b.index - a.index);

  let kept = segments.slice();
  const dropped: string[] = [];
  let text = compose(kept);
  if (tryText(text, startPx)) return { text, size: startPx, dropped, truncated: false, fits: true };

  for (const victim of dropOrder) {
    if (kept.length <= 1) break;
    kept = kept.filter((s) => s !== victim);
    dropped.push(victim.text);
    text = compose(kept);
    if (tryText(text, startPx)) return { text, size: startPx, dropped, truncated: false, fits: true };
  }

  for (let size = startPx - 1; size >= minPx; size--) {
    if (tryText(text, size)) return { text, size, dropped, truncated: false, fits: true };
  }

  if (!ellipsis) return { text, size: minPx, dropped, truncated: false, fits: false };

  // Truncate at the minimum size: binary search the longest prefix that fits with an ellipsis.
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length - 1;
  let best: string | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = chars.slice(0, mid).join("").trimEnd() + ELLIPSIS;
    if (tryText(candidate, minPx)) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const final = best ?? ELLIPSIS;
  const fits = tryText(final, minPx);
  return { text: final, size: minPx, dropped, truncated: true, fits };
}
