/**
 * The game font gate (plan F4). Resolves once the brand faces the type roles need are usable, so
 * no Phaser Text or canvas label bakes a fallback face into its texture.
 *
 * - SSR-safe: without `document.fonts` it resolves at once with `status: "unsupported"` and
 *   memoises nothing, so a server render never pins a result.
 * - Memoised in the browser: every scene, canvas and component shares one promise.
 * - Uses `document.fonts.load(face, sample)` per face, with a latin and a latin-ext (Lithuanian)
 *   sample, so both subset files are in before `create()`. Never `document.fonts.check`, which
 *   answers true for a family that has no `@font-face` at all. `load` resolves with the matching faces, so an empty
 *   list means the face is not declared (a missing or renamed `@font-face`).
 * - Never rejects and never waits more than `GAME_FONT_TIMEOUT_MS`: at the deadline, faces still
 *   loading count as missing and the game starts on the metric-matched fallbacks. Late faces are
 *   picked up by `installFontHealing` (components/Phaser/typography).
 * - Retries a fallback: after a `"fallback"` result settles, the next `load()` (a scene restart's
 *   `preloadTTFonts`) tries the missing faces again, at most `GAME_FONT_RETRIES` times per page, so
 *   one network error does not pin the fallbacks for the session and a dead network does not add
 *   the timeout to every scene start. Faces that loaded are not loaded again.
 * - Sends at most one `game_font_fallback` per page session through the consent-gated analytics
 *   client (nothing leaves the browser without consent).
 *
 * No Phaser here (ESLint enforces it): the landing imports this module too.
 */
import { analytics, buildEvent, type AnalyticsEvent } from "@/analytics";
import { roleFaces, type TypeRole } from "./roles";

export const GAME_FONT_TIMEOUT_MS = 3000;

/** How many times a `"fallback"` result is retried by later `load()` calls. */
export const GAME_FONT_RETRIES = 2;

/** Latin sample: `load` fetches the latin subset file, and its result decides the face's verdict. */
export const LATIN_SAMPLE = "BESbswy";

/**
 * Lithuanian letters (latin-ext). Loaded alongside the latin sample so shelter and cat names such as
 * "Šiaulių" never bake fallback glyphs into a Phaser texture: Chromium starts a font download when
 * canvas text needs it (and healing repaints), but WebKit, the iOS Capacitor WebView, is not known
 * to. The three upright latin-ext files the roles use total about 45 KB. A latin-ext failure only
 * leaves those letters on the fallback; it does not mark the face missing.
 */
export const LATIN_EXT_SAMPLE = "ĄČĘĖĮŠŲŪŽąčęėįšųūž";

export type GameFontStatus = "ready" | "fallback" | "unsupported";

export interface GameFontLoadResult {
  status: GameFontStatus;
  /** Faces as `"<weight> <family>"`, for example `"900 Passion One"`. */
  loaded: string[];
  missing: string[];
  timedOut: boolean;
  durationMs: number;
}

/** The part of `FontFaceSet` the loader uses. */
export interface FontSetLike {
  load(font: string, text?: string): Promise<ReadonlyArray<unknown>>;
}

export interface GameFontLoaderOptions {
  /** Defaults to `document.fonts`; return undefined where there is none (SSR, old WebViews). */
  fontSet?: () => FontSetLike | undefined;
  /** Consent-gated sink for the one fallback event. Defaults to the app analytics client. */
  track?: (event: AnalyticsEvent) => void;
  timeoutMs?: number;
  now?: () => number;
  /** Defaults to `GAME_FONT_RETRIES`. */
  retries?: number;
}

export interface GameFontLoader {
  load(): Promise<GameFontLoadResult>;
  /** The settled result, or null while loading or before the first call. */
  result(): GameFontLoadResult | null;
}

/** The CSS `font` shorthand `document.fonts.load` needs for one face. */
export const faceDescriptor = (family: string, weight: number | string, sizePx = 16) =>
  `${weight} ${sizePx}px "${family}"`;

const faceName = (family: string, weight: number | string) => `${weight} ${family}`;

const defaultFontSet = (): FontSetLike | undefined =>
  typeof document !== "undefined" && document.fonts && typeof document.fonts.load === "function"
    ? (document.fonts as unknown as FontSetLike)
    : undefined;

const defaultNow = () =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

export function createGameFontLoader(options: GameFontLoaderOptions = {}): GameFontLoader {
  const getFontSet = options.fontSet ?? defaultFontSet;
  const track = options.track ?? ((event: AnalyticsEvent) => analytics.track(event));
  const timeoutMs = options.timeoutMs ?? GAME_FONT_TIMEOUT_MS;
  const now = options.now ?? defaultNow;
  const maxRetries = options.retries ?? GAME_FONT_RETRIES;

  let pending: Promise<GameFontLoadResult> | null = null;
  let settled: GameFontLoadResult | null = null;
  let reported = false;
  let retriesLeft = maxRetries;
  /** Faces that loaded in an earlier run; a retry does not ask for them again. */
  const loadedFaces = new Set<string>();

  const report = (missing: ReadonlyArray<{ name: string; role: TypeRole }>) => {
    if (reported || missing.length === 0) return;
    reported = true;
    try {
      track(
        buildEvent("game_font_fallback", {
          font: missing.map((m) => m.name).join(", "),
          role: missing[0].role,
        }),
      );
    } catch {
      // Telemetry never breaks the game.
    }
  };

  const run = (fontSet: FontSetLike): Promise<GameFontLoadResult> => {
    const started = now();
    const faces = roleFaces();
    const state = new Map<string, "pending" | "loaded" | "missing">();
    faces.forEach((face) => state.set(faceName(face.family, face.weight), "pending"));

    faces.forEach((face) => {
      const name = faceName(face.family, face.weight);
      if (loadedFaces.has(name)) state.set(name, "loaded");
    });

    const attempts = faces.map((face) => {
      const name = faceName(face.family, face.weight);
      if (state.get(name) === "loaded") return Promise.resolve();
      const descriptor = faceDescriptor(face.family, face.weight);
      const attempt = (text: string): Promise<ReadonlyArray<unknown>> => {
        try {
          return Promise.resolve(fontSet.load(descriptor, text));
        } catch (error) {
          return Promise.reject(error);
        }
      };
      const latin = attempt(LATIN_SAMPLE).then(
        (matched) => {
          if (state.get(name) === "pending") state.set(name, matched && matched.length > 0 ? "loaded" : "missing");
        },
        () => {
          if (state.get(name) === "pending") state.set(name, "missing");
        },
      );
      const latinExt = attempt(LATIN_EXT_SAMPLE).then(
        () => undefined,
        () => undefined,
      );
      return Promise.all([latin, latinExt]);
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });

    return Promise.race([Promise.all(attempts).then(() => "done" as const), deadline]).then((outcome) => {
      if (timer !== undefined) clearTimeout(timer);
      const timedOut = outcome === "timeout";
      const loaded: string[] = [];
      const missing: Array<{ name: string; role: TypeRole }> = [];
      for (const face of faces) {
        const name = faceName(face.family, face.weight);
        if (state.get(name) === "loaded") {
          loaded.push(name);
          loadedFaces.add(name);
        } else {
          // Freeze the verdict: a face that arrives after the deadline is healed, not re-reported.
          state.set(name, "missing");
          missing.push({ name, role: face.role });
        }
      }
      report(missing);
      const result: GameFontLoadResult = {
        status: missing.length ? "fallback" : "ready",
        loaded,
        missing: missing.map((m) => m.name),
        timedOut,
        durationMs: Math.max(0, Math.round(now() - started)),
      };
      settled = result;
      // Let a later load() try the missing faces again. `reported` stays set: one event per page.
      if (result.status === "fallback" && retriesLeft > 0) {
        retriesLeft--;
        pending = null;
      }
      return result;
    });
  };

  return {
    load() {
      if (pending) return pending;
      const fontSet = getFontSet();
      if (!fontSet) {
        return Promise.resolve({ status: "unsupported", loaded: [], missing: [], timedOut: false, durationMs: 0 });
      }
      pending = run(fontSet);
      return pending;
    },
    result: () => settled,
  };
}

const sharedLoader = createGameFontLoader();

/**
 * Loads the brand faces every type role needs. Memoised per page; safe to call during SSR, from
 * React effects and from Phaser preload (through `preloadTTFonts`). Never rejects.
 */
export function loadGameFonts(): Promise<GameFontLoadResult> {
  return sharedLoader.load();
}

/** The settled result of `loadGameFonts`, or null while it is still loading. */
export function gameFontsResult(): GameFontLoadResult | null {
  return sharedLoader.result();
}
