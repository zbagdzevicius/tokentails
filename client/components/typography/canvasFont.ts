/**
 * `ttCanvasFont(role, size)`: the CSS `font` shorthand for a 2D canvas (`ctx.font = ...`), for
 * share cards, the Wheel and any other non-Phaser canvas (plan F4). Await `loadGameFonts()` before
 * drawing, or the canvas bakes in the fallback face.
 *
 * Pure string building; no DOM, no Phaser.
 */
import { roleSize, TYPE_ROLES, type TypeRole } from "./roles";

export interface CanvasFontOptions {
  italic?: boolean;
  /** Override the role weight (for example 800 for an emphasised caption). */
  weight?: number;
}

export function ttCanvasFont(role: TypeRole, size?: number, options: CanvasFontOptions = {}): string {
  const spec = TYPE_ROLES[role];
  const style = options.italic ? "italic " : "";
  const weight = options.weight ?? spec.weight;
  return `${style}${weight} ${roleSize(role, size)}px ${spec.stack}`;
}
