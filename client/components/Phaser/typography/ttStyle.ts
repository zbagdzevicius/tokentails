/**
 * `ttStyle(role, opts)`: a Phaser Text style for a type role (plan F4), and the resolution and
 * size helpers the factory, `ttFit` and font healing share.
 *
 * No Phaser runtime import (types only), so Jest can exercise it without a canvas.
 */
import type { Types } from "phaser";
import { GOLD, INK } from "@/design/tokens";
import { roleSize, TYPE_ROLES, type TypeRole } from "@/components/typography/roles";
import { getCanvasPixelRatio } from "@/components/Phaser/look/registry";
import { MAX_TEXT_RESOLUTION, textResolutionFor } from "@/components/Phaser/look/text";

export { MAX_TEXT_RESOLUTION };

/** Default fill per role, on the night surfaces. */
export const ROLE_COLORS: Readonly<Record<TypeRole, string>> = {
  title: GOLD[400],
  hud: INK.cream,
  label: INK.cream,
  caption: INK.cream,
  hint: INK.cream,
  burst: GOLD[400],
  code: INK.cream,
};

export interface TTStyleOptions {
  /** CSS px. Clamped to the role minimum. Defaults to the role's default size. */
  size?: number;
  color?: string;
  align?: "left" | "center" | "right" | "justify";
  /** Wrap at this width (world units). Uses the advanced (word-aware) wrap. */
  wordWrapWidth?: number;
  /** Outline colour. `false` removes the role outline (`burst` has one by default). */
  stroke?: string | false;
  /** Outline thickness in px. Defaults to the role's `widthEm x size`. */
  strokeThickness?: number;
  /** Text texture resolution. `ttText` passes `ttResolution(scene)`. */
  resolution?: number;
  italic?: boolean;
  /** Override the role weight. */
  weight?: number;
  fixedWidth?: number;
  fixedHeight?: number;
  shadow?: Types.GameObjects.Text.TextShadow;
  padding?: Types.GameObjects.Text.TextPadding;
  /** Anything else Phaser accepts; applied last. */
  extra?: Types.GameObjects.Text.TextStyle;
}

/** The size-dependent parts of a role, used when `ttFit` shrinks a text. */
export function roleMetrics(role: TypeRole, size: number, strokeThickness?: number) {
  const spec = TYPE_ROLES[role];
  const px = roleSize(role, size);
  return {
    px,
    letterSpacing: Math.round(spec.letterSpacingEm * px * 100) / 100,
    lineSpacing: Math.max(0, Math.round((spec.lineHeight - 1) * px)),
    strokeThickness:
      strokeThickness ?? (spec.stroke ? Math.max(2, Math.round(spec.stroke.widthEm * px)) : 0),
  };
}

export function ttStyle(role: TypeRole, opts: TTStyleOptions = {}): Types.GameObjects.Text.TextStyle {
  const spec = TYPE_ROLES[role];
  const metrics = roleMetrics(role, opts.size ?? spec.defaultPx, opts.strokeThickness);
  const weight = opts.weight ?? spec.weight;
  const style: Types.GameObjects.Text.TextStyle = {
    fontFamily: spec.stack,
    fontSize: `${metrics.px}px`,
    fontStyle: opts.italic ? `italic ${weight}` : String(weight),
    color: opts.color ?? ROLE_COLORS[role],
    align: opts.align ?? "left",
    lineSpacing: metrics.lineSpacing,
    letterSpacing: metrics.letterSpacing,
  };
  const strokeColor = opts.stroke === false ? undefined : (opts.stroke ?? spec.stroke?.color);
  if (strokeColor) {
    style.stroke = strokeColor;
    style.strokeThickness = metrics.strokeThickness || Math.max(2, Math.round(0.12 * metrics.px));
  }
  if (opts.resolution !== undefined) style.resolution = opts.resolution;
  if (opts.wordWrapWidth !== undefined) {
    style.wordWrap = { width: opts.wordWrapWidth, useAdvancedWrap: true };
  }
  if (opts.fixedWidth !== undefined) style.fixedWidth = opts.fixedWidth;
  if (opts.fixedHeight !== undefined) style.fixedHeight = opts.fixedHeight;
  if (opts.shadow) style.shadow = opts.shadow;
  if (opts.padding) style.padding = opts.padding;
  return opts.extra ? { ...style, ...opts.extra } : style;
}

interface ResolutionSceneLike {
  cameras?: { main?: { zoom: number } | null } | null;
  registry?: { get(key: string): unknown } | null;
  game?: { registry?: { get(key: string): unknown } | null } | null;
}

/**
 * Text texture resolution for a scene (plan F4 with F10): `camera.zoom x canvasPixelRatio` in CSS
 * terms, capped at 3. Under F10's backing store the camera zoom is already in backing pixels
 * (`setCssZoom` multiplies by the ratio), so this is `max(camera zoom, ratio)`, the same function
 * task 2e's `installTextCrispness` uses, so the two never disagree.
 */
export function ttResolution(scene: ResolutionSceneLike): number {
  const zoom = scene.cameras?.main?.zoom ?? 1;
  return textResolutionFor(zoom, getCanvasPixelRatio(scene));
}
