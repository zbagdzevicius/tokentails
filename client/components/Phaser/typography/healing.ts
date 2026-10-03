/**
 * Font healing (plan F4, G12). The preload gate means Text is normally created after the brand
 * faces load, but a face can still land late: a gate that hit its 3 s timeout, or the latin-ext
 * file that the browser fetches only when a Lithuanian shelter name first appears. When
 * `document.fonts` fires `loadingdone` for a brand or fallback face (other page fonts are ignored), every registered `ttText` of that game re-measures with the
 * real face, re-runs its `ttFit` spec (`refitText`: a text the scene has changed since is fitted as
 * it reads now, never reverted), picks up the current text resolution (camera zoom x canvas pixel
 * ratio, for texts created before the scene set its zoom), and the game emits `TT_FONTS_HEALED` so
 * scenes can lay out their HUD again (G12 `layoutHud()`).
 *
 * A hidden or pooled text (`setActive(false)`) stays registered and is skipped for that pass only;
 * a text leaves the list when it is destroyed (Phaser clears `scene`) or fires `destroy`.
 *
 * No Phaser runtime import.
 */
import { FALLBACK_FAMILIES } from "@/components/typography/fonts.generated";
import { roleFaces } from "@/components/typography/roles";
import { refitText, type TTFitTarget } from "./ttFit";
import { ttResolution } from "./ttStyle";

/** Emitted on `game.events` after a healing pass, with the number of texts re-measured. */
export const TT_FONTS_HEALED = "tt:fonts-healed";

/** `Phaser.Textures.FilterMode.LINEAR`. */
export const FILTER_LINEAR = 0;

export interface HealableText extends TTFitTarget {
  active?: boolean;
  scene?: unknown;
  style: TTFitTarget["style"] & { update?(recalculateMetrics: boolean): unknown; resolution?: number };
  setResolution?(value: number): unknown;
  once?(event: string, fn: () => void): unknown;
  texture?: { setFilter?(mode: number): unknown };
}

interface GameLike {
  events?: {
    emit(event: string, ...args: unknown[]): unknown;
    once(event: string, fn: () => void): unknown;
  } | null;
}

/** The part of `FontFaceSetLoadEvent` healing reads. */
export interface FontLoadEventLike {
  fontfaces?: ReadonlyArray<{ family?: string }> | null;
}

type LoadingDoneListener = (event?: FontLoadEventLike) => void;

interface FontEventTarget {
  addEventListener(type: "loadingdone", fn: LoadingDoneListener): void;
  removeEventListener(type: "loadingdone", fn: LoadingDoneListener): void;
}

const unquote = (family: string) => family.trim().replace(/^(["'])(.*)\1$/, "$2");

let gameFamilies: ReadonlySet<string> | null = null;

/** The brand families the type roles use plus their metric-matched fallback faces. */
export function gameFontFamilies(): ReadonlySet<string> {
  if (!gameFamilies) {
    const families = new Set<string>();
    for (const face of roleFaces()) {
      families.add(face.family);
      for (const fallback of FALLBACK_FAMILIES[face.family] ?? []) families.add(fallback);
    }
    gameFamilies = families;
  }
  return gameFamilies;
}

/**
 * Whether a `loadingdone` event concerns a game face. Icon fonts and other page faces (`paws`,
 * `Cat Paw`) finish loading too, and re-measuring every text for them is wasted work on low-end
 * devices. An event without a `fontfaces` list (old engines, synthetic events) counts as relevant.
 */
export function isGameFontEvent(event?: FontLoadEventLike | null): boolean {
  const faces = event?.fontfaces;
  if (!faces || typeof (faces as { length?: unknown }).length !== "number") return true;
  const families = gameFontFamilies();
  return Array.from(faces).some((face) => typeof face?.family === "string" && families.has(unquote(face.family)));
}

const textsByGame = new WeakMap<object, Set<HealableText>>();
/** Texts whose resolution `ttText` chose (no explicit `resolution`), so healing may update it. */
const autoResolution = new WeakSet<object>();
const installed = new WeakMap<object, () => void>();

/** Registers a text for healing. `ttText` calls this; it unregisters itself on destroy. */
export function trackTTText(
  game: object | null | undefined,
  text: HealableText,
  options: { autoResolution?: boolean } = {},
): void {
  if (!game) return;
  if (options.autoResolution) autoResolution.add(text);
  let set = textsByGame.get(game);
  if (!set) {
    set = new Set();
    textsByGame.set(game, set);
  }
  set.add(text);
  const owned = set;
  text.once?.("destroy", () => owned.delete(text));
}

/** How many texts are registered for `game` (tests and debugging). */
export function trackedTextCount(game: object): number {
  return textsByGame.get(game)?.size ?? 0;
}

/** Re-measures every registered text of `game`. Returns how many were healed. */
export function healTexts(game: GameLike & object): number {
  const set = textsByGame.get(game);
  let healed = 0;
  if (set) {
    for (const text of Array.from(set)) {
      if (text.scene === undefined || text.scene === null) {
        set.delete(text);
        continue;
      }
      // Hidden or pooled, still alive: skip this pass, keep it for the next.
      if (text.active === false) continue;
      try {
        refreshTTResolution(text);
        text.style?.update?.(true);
        refitText(text);
        text.texture?.setFilter?.(FILTER_LINEAR);
        healed++;
      } catch {
        // A text torn down mid-pass: skip it.
      }
    }
  }
  game.events?.emit(TT_FONTS_HEALED, healed);
  return healed;
}

/**
 * Sets `text`'s resolution to the scene's current `ttResolution` when `ttText` chose it (not an
 * explicit `resolution`). Healing calls it; a scene's resize or zoom handler can call it too.
 * Returns true when the resolution changed.
 */
export function refreshTTResolution(text: HealableText): boolean {
  if (!autoResolution.has(text) || !text.scene || typeof text.setResolution !== "function") return false;
  const next = ttResolution(text.scene as Parameters<typeof ttResolution>[0]);
  if (text.style?.resolution === next) return false;
  text.setResolution(next);
  return true;
}

const defaultFontEvents = (): FontEventTarget | undefined =>
  typeof document !== "undefined" && document.fonts && typeof document.fonts.addEventListener === "function"
    ? (document.fonts as unknown as FontEventTarget)
    : undefined;

export interface FontHealingOptions {
  fontEvents?: FontEventTarget;
  /** Coalesces bursts of `loadingdone`. Defaults to one macrotask. */
  schedule?: (fn: () => void) => void;
}

/**
 * Heals `game`'s texts whenever the document finishes loading fonts. Idempotent per game; removed
 * automatically when the game is destroyed. Returns the uninstall function.
 */
export function installFontHealing(game: GameLike & object, options: FontHealingOptions = {}): () => void {
  const existing = installed.get(game);
  if (existing) return existing;
  const fontEvents = options.fontEvents ?? defaultFontEvents();
  if (!fontEvents) return () => {};
  const schedule = options.schedule ?? ((fn: () => void) => void setTimeout(fn, 0));

  let queued = false;
  let live = true;
  const onLoadingDone: LoadingDoneListener = (event) => {
    if (queued || !live || !isGameFontEvent(event)) return;
    queued = true;
    schedule(() => {
      queued = false;
      if (live) healTexts(game);
    });
  };
  fontEvents.addEventListener("loadingdone", onLoadingDone);
  const uninstall = () => {
    if (!live) return;
    live = false;
    fontEvents.removeEventListener("loadingdone", onLoadingDone);
    installed.delete(game);
  };
  installed.set(game, uninstall);
  game.events?.once("destroy", uninstall);
  return uninstall;
}
