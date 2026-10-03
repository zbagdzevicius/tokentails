/**
 * `ttText(scene, x, y, text, role, opts)`: the one way scenes create text (plan F4, G12).
 *
 * - Family, weight, size floor, case, spacing and outline come from the role.
 * - Resolution is `ttResolution(scene)` (camera zoom with the F10 canvas pixel ratio, capped at 3),
 *   read at creation and again on every healing pass; after a zoom or resize, call
 *   `refreshTTResolution(text)` (or `healTexts(game)`) to pick up the new value.
 * - The texture uses a LINEAR filter. Phaser re-uploads a Text texture on every `updateText` with
 *   the game's filter (NEAREST under `pixelArt`), which silently undoes a one-time `setFilter`;
 *   the factory re-applies LINEAR after each update.
 * - `fit` runs `ttFit` right away and is remembered for font healing.
 * - The text registers with `installFontHealing` so a late face re-measures it.
 *
 * No Phaser runtime import: `scene.add.text` is the only engine call.
 */
import type { GameObjects, Scene } from "phaser";
import { applyRoleCase, type TypeRole } from "@/components/typography/roles";
import { FILTER_LINEAR, trackTTText, type HealableText } from "./healing";
import { ttFit, type TTFitOptions, type TTFitResult } from "./ttFit";
import { ttResolution, ttStyle, type TTStyleOptions } from "./ttStyle";

export interface TTTextOptions extends TTStyleOptions {
  /** A number for both axes, or `[x, y]`. Phaser's default is 0. */
  origin?: number | readonly [number, number];
  /** Fit the text into a box right away (and again after late fonts). */
  fit?: Omit<TTFitOptions, "role"> & { role?: TypeRole };
  /**
   * Keep the text as written instead of the role case. Use it for a `hint` that carries names
   * (cats, shelters): sentence case lowercases SHOUTED copy wholesale, so write such hints in
   * sentence case at the source, or pass `keepCase`.
   */
  keepCase?: boolean;
  scrollFactor?: number;
  depth?: number;
}

export interface TTText extends GameObjects.Text {
  /** The result of the last `fit`, when one was requested. */
  ttFitResult?: TTFitResult;
  ttRole?: TypeRole;
}

type SceneLike = Pick<Scene, "add" | "cameras" | "registry"> & { game?: object; sys?: { game?: object } };

const PATCHED = Symbol.for("tt.linearFilterPatched");

/** Re-applies LINEAR after every re-rasterisation (see the module comment). */
export function keepLinearFilter(text: GameObjects.Text): void {
  const target = text as GameObjects.Text & { [PATCHED]?: boolean };
  const apply = () => {
    try {
      text.texture?.setFilter?.(FILTER_LINEAR as never);
    } catch {
      // Canvas renderer or a destroyed texture: nothing to filter.
    }
  };
  apply();
  if (target[PATCHED]) return;
  target[PATCHED] = true;
  const original = text.updateText;
  text.updateText = function patchedUpdateText(this: GameObjects.Text) {
    const result = original.call(this);
    apply();
    return result;
  };
}

export function ttText(
  scene: SceneLike,
  x: number,
  y: number,
  text: string | readonly string[],
  role: TypeRole,
  opts: TTTextOptions = {},
): TTText {
  const style = ttStyle(role, { ...opts, resolution: opts.resolution ?? ttResolution(scene) });
  const lines = typeof text === "string" ? [text] : Array.from(text);
  const content = opts.keepCase ? lines : lines.map((line) => applyRoleCase(line, role));
  const object = scene.add.text(x, y, content.length === 1 ? content[0] : content, style) as TTText;
  object.ttRole = role;

  if (opts.origin !== undefined) {
    if (typeof opts.origin === "number") object.setOrigin(opts.origin);
    else object.setOrigin(opts.origin[0], opts.origin[1]);
  }
  if (opts.scrollFactor !== undefined) object.setScrollFactor(opts.scrollFactor);
  if (opts.depth !== undefined) object.setDepth(opts.depth);

  keepLinearFilter(object);

  if (opts.fit) {
    const fitRole = opts.fit.role ?? role;
    object.ttFitResult = ttFit(object as unknown as HealableText, {
      ...opts.fit,
      role: fitRole,
      size: opts.fit.size ?? opts.size,
      applyCase: opts.fit.applyCase ?? !opts.keepCase,
    });
  }

  trackTTText(scene.sys?.game ?? scene.game, object as unknown as HealableText, {
    autoResolution: opts.resolution === undefined,
  });
  return object;
}
