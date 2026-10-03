/**
 * Embed mode: Catnip Heist inside the `/heist` host page of the core app (plan G2 layer 1).
 *
 * The host loads `/heist-game/index.html?embed=1` in a full-bleed same-origin iframe. In embed mode:
 *
 * - the seed is always the campaign seed (1), whatever the URL says, because the backend replays
 *   every saved run with seed 1;
 * - `?replay=` is ignored unless `qa=1` is set too (a link must not start a watched replay);
 * - the host's safe-area insets become CSS variables, because `env(safe-area-inset-*)` is 0 inside
 *   an iframe;
 * - the account's server progress (from the host's `session`) is merged into local progress;
 * - finished runs go to the host (`run-complete`), which saves won runs through
 *   `POST /user/catbassadors/live`; the Heist itself never calls the backend for scores;
 * - the shell's sound settings (`audio`) override the Heist's own mute and volumes for the visit, so
 *   the lobby's one mute covers the Heist too. They are not written to the standalone preference.
 *
 * Standalone loads (no `embed=1`, or no parent window) behave exactly as before.
 */
import { HEIST_MUSIC_VOLUME, HEIST_SFX_VOLUME } from '../audio/audio';
import type { HeistInsets } from '../shared-contracts/heist-bridge';
import { createHeistBridgeClient, type BridgeTarget, type BridgeWindow, type HeistBridgeClient, type HostAudioSettings } from './bridge';

export { createHeistBridgeClient, hostOrigin } from './bridge';
export type { HeistBridgeClient, HeistBridgeHandlers, HeistSession, HostAudioSettings } from './bridge';

/** The campaign seed the backend replays with (`CAMPAIGN_SEED` in the vendored sim). */
export const EMBED_SEED = 1;

export interface LaunchParams {
  embed: boolean;
  qa: boolean;
  seed: number;
  /** Replay to start with: only outside embed mode, or with `qa=1`. */
  replay: 'solution' | 'last' | null;
}

/** Reads the launch query. `framed`: the page runs inside another window (`window.parent !== window`). */
export function readLaunchParams(search: string, framed: boolean): LaunchParams {
  const q = new URLSearchParams(search);
  const embed = framed && q.get('embed') === '1';
  const qa = q.get('qa') === '1';
  const seedParam = Number(q.get('seed'));
  const seed = embed ? EMBED_SEED : Number.isInteger(seedParam) && seedParam > 0 ? seedParam >>> 0 : 1;
  const raw = q.get('replay');
  const wanted = raw === 'solution' || raw === 'last' ? raw : null;
  return { embed, qa, seed, replay: embed && !qa ? null : wanted };
}

/** Largest inset accepted from the host, in CSS px (a hostile or buggy value cannot hide the HUD). */
export const MAX_INSET_PX = 160;

const clampInset = (value: number) => (Number.isFinite(value) ? Math.min(MAX_INSET_PX, Math.max(0, Math.round(value))) : 0);

/** The four insets, clamped to `0..MAX_INSET_PX`. */
export function clampInsets(insets: HeistInsets): HeistInsets {
  return { top: clampInset(insets.top), right: clampInset(insets.right), bottom: clampInset(insets.bottom), left: clampInset(insets.left) };
}

type StyleTarget = { style: Pick<CSSStyleDeclaration, 'setProperty'> };

/**
 * Applies the host's insets: `--ch-sat/--ch-sar/--ch-sab/--ch-sal` on the UI root (the overlay
 * stylesheet reads them; an inline value wins over its `env()` default) and `--tt-inset-*` on the
 * document element for anything else.
 */
export function applyInsets(uiRoot: StyleTarget | null, docRoot: StyleTarget | null, insets: HeistInsets): HeistInsets {
  const v = clampInsets(insets);
  const px = (n: number) => `${n}px`;
  uiRoot?.style.setProperty('--ch-sat', px(v.top));
  uiRoot?.style.setProperty('--ch-sar', px(v.right));
  uiRoot?.style.setProperty('--ch-sab', px(v.bottom));
  uiRoot?.style.setProperty('--ch-sal', px(v.left));
  docRoot?.style.setProperty('--tt-inset-top', px(v.top));
  docRoot?.style.setProperty('--tt-inset-right', px(v.right));
  docRoot?.style.setProperty('--tt-inset-bottom', px(v.bottom));
  docRoot?.style.setProperty('--tt-inset-left', px(v.left));
  return v;
}

/**
 * The shell's default volumes (`DEFAULT_AUDIO_SETTINGS` in `client/components/audio/settings.ts`).
 * At these the Heist plays its authored mix; the shell's sliders scale it from there.
 */
export const HOST_DEFAULT_MUSIC_VOLUME = 0.4;
export const HOST_DEFAULT_EFFECTS_VOLUME = 0.6;

/** Maps the shell's 0..1 volumes onto the Heist's bus gains, capped at 1. */
export function heistVolumesFor(audio: Pick<HostAudioSettings, 'musicVolume' | 'effectsVolume'>): { sfx: number; music: number } {
  const scale = (value: number, hostDefault: number, authored: number) =>
    Number.isFinite(value) ? Math.min(1, Math.max(0, (value / hostDefault) * authored)) : authored;
  return {
    sfx: scale(audio.effectsVolume, HOST_DEFAULT_EFFECTS_VOLUME, HEIST_SFX_VOLUME),
    music: scale(audio.musicVolume, HOST_DEFAULT_MUSIC_VOLUME, HEIST_MUSIC_VOLUME),
  };
}

/** A client run id (the backend dedupes on the replay digest, this only pairs save results). */
export function newRunId(now: number = Date.now(), random: () => number = Math.random): string {
  return `run-${now.toString(36)}-${Math.floor(random() * 0xffffffff).toString(36)}`;
}

/** What the embed needs from the app (App satisfies it). */
export interface EmbeddableApp {
  readonly ui: { readonly root: StyleTarget; setSignedIn(signedIn: boolean): void };
  readonly progress: { mergeServer(levels: Record<string, { won: boolean; bestScore: number; stars: number }> | null | undefined): boolean };
  hostPause(): void;
  refreshLevels(): void;
  /** The shell's sound settings, applied for this visit only. */
  hostAudio(audio: HostAudioSettings): void;
}

export interface EmbedController {
  readonly bridge: HeistBridgeClient;
  /** Forward a finished run to the host. */
  runComplete(run: { won: boolean; levelId: string; log: Parameters<HeistBridgeClient['runComplete']>[0]['log'] }): string;
  /** Ask the host to open its sign-in sheet. */
  requestSignIn(): void;
  /** Leave the Heist (the host navigates back into Token Tails). */
  exit(): void;
  dispose(): void;
}

/**
 * Connects the app to the host. Call once after the app exists; `getApp` may return null until it
 * does (messages that arrive earlier are applied when the app is attached).
 */
export function installEmbed(
  win: BridgeWindow,
  parent: BridgeTarget | null,
  doc: { documentElement: StyleTarget } | null,
  getApp: () => EmbeddableApp | null,
  /** Called once, after the first `session` is applied (its server progress merged). */
  onFirstSession?: () => void
): EmbedController {
  let sawSession = false;
  const bridge = createHeistBridgeClient(win, parent, {
    onSession(session) {
      const app = getApp();
      if (!app) return;
      applyInsets(app.ui.root, doc?.documentElement ?? null, session.insets);
      app.ui.setSignedIn(session.signedIn);
      if (session.progress && app.progress.mergeServer(session.progress.levels)) app.refreshLevels();
      if (!sawSession) {
        sawSession = true;
        onFirstSession?.();
      }
    },
    // Save results are shown by the host's save chip (role="status"), not repeated in the Heist.
    onPause() {
      getApp()?.hostPause();
    },
    // Resume is the player's call: the pause menu stays until they press Resume.
    onAudio(audio) {
      getApp()?.hostAudio(audio);
    },
  });
  return {
    bridge,
    runComplete(run) {
      const runId = newRunId();
      bridge.runComplete({ runId, won: run.won, levelId: run.levelId, log: run.log });
      return runId;
    },
    requestSignIn: () => bridge.requestSignIn(),
    exit: () => bridge.exit(),
    dispose: () => bridge.dispose(),
  };
}
