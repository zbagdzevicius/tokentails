/**
 * The Phaser font gate (plan F4). A loader "file" that completes when `loadGameFonts()` settles,
 * so a scene's `create()` (and every `ttText` in it) never runs before the brand faces are usable.
 *
 *   preload() {
 *     preloadTTFonts(this); // first line of every scene's preload
 *     ...
 *   }
 *
 * `loadGameFonts` never rejects and gives up after 3 s, so the gate can delay a scene but never
 * stall it. React mount effects stay synchronous (`new Phaser.Game` as before): the wait happens
 * inside the Phaser loader, so there is no StrictMode race and no orphaned Game.
 *
 * This is the only module in the typography runtime that imports Phaser at runtime. Import it from
 * scenes only (they already load Phaser through `next/dynamic` with `ssr: false`).
 */
import Phaser from "phaser";
import { loadGameFonts, type GameFontLoadResult } from "@/components/typography/loadGameFonts";
import { installFontHealing } from "./healing";

export const TT_FONTS_FILE_TYPE = "ttfonts";
export const TT_FONTS_FILE_KEY = "tt-brand-fonts";
/** Registry key holding the last `GameFontLoadResult` (`status`, `missing`, `timedOut`). */
export const TT_FONTS_RESULT_KEY = "ttFontsResult";

type FontsLoader = () => Promise<GameFontLoadResult>;

export class TTFontsFile extends Phaser.Loader.File {
  private readonly loadFonts: FontsLoader;
  result: GameFontLoadResult | null = null;

  constructor(loader: Phaser.Loader.LoaderPlugin, key = TT_FONTS_FILE_KEY, loadFonts: FontsLoader = loadGameFonts) {
    // No url (`load()` below replaces the XHR) and no cache: the result goes to the registry.
    const config = { type: TT_FONTS_FILE_TYPE, key, url: "", cache: false };
    super(loader, config as unknown as Phaser.Types.Loader.FileConfig);
    this.loadFonts = loadFonts;
  }

  /** Nothing to cache; the result is on `this.result` and in the registry. */
  addToCache(): void {}

  load(): void {
    this.state = Phaser.Loader.FILE_LOADING;
    let settled = false;
    const finish = (result: GameFontLoadResult | null) => {
      if (settled) return;
      settled = true;
      this.result = result;
      this.data = result;
      try {
        this.loader?.systems?.registry?.set(TT_FONTS_RESULT_KEY, result);
      } catch {
        // Registry gone with a destroyed game: nothing to record.
      }
      // Always a success: a font fallback is not a reason to fail the scene's load.
      this.loader?.nextFile(this, true);
    };
    this.loadFonts().then(finish, () => finish(null));
  }
}

/**
 * Queues the font gate in `scene`'s loader and installs font healing for its game. Call it first
 * in `preload`. Safe to call on every scene restart.
 */
export function preloadTTFonts(scene: Phaser.Scene): void {
  const loader = scene.load;
  installFontHealing(scene.sys.game);
  const file = new TTFontsFile(loader);
  if (loader.keyExists(file)) return;
  loader.addFile(file);
}
