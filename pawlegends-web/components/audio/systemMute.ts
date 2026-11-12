/**
 * System mute on native (plan G14 "Audio": music never plays under a system mute on native).
 *
 * - iOS: an HTML `<audio>` element in WKWebView ignores the ring/silent switch by default. The
 *   Audio Session API (`navigator.audioSession`, iOS 16.4+) set to `"ambient"` makes all page audio
 *   follow the switch and mix with other apps' audio instead of stopping it. On an iOS WebView
 *   without that API the switch cannot be honoured or read, so music stays off there; effects
 *   (Phaser's Web Audio, which already follows the switch) are unaffected.
 * - Android: there is no silent switch for media. Media volume 0 is the system mute and silences
 *   the element by itself; backgrounding the app fires `visibilitychange`, which pauses music.
 * - Web: the browser's own tab and device mute apply; nothing to do.
 */

interface AudioSessionLike {
  type: string;
}

export interface SystemMuteEnv {
  /** `Capacitor.getPlatform()`: "ios", "android" or "web". */
  platform: string;
  audioSession?: AudioSessionLike | null;
}

/** Reads the environment without importing Capacitor at module load (SSR and tests). */
export function readSystemMuteEnv(): SystemMuteEnv {
  let platform = "web";
  try {
    const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    platform = cap?.getPlatform?.() || "web";
  } catch {
    platform = "web";
  }
  let audioSession: AudioSessionLike | null = null;
  try {
    const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { audioSession?: AudioSessionLike });
    audioSession = nav?.audioSession ?? null;
  } catch {
    audioSession = null;
  }
  return { platform, audioSession };
}

/**
 * Asks the platform to apply its system mute to page audio. Returns false when music must not
 * play because the system mute can be neither honoured nor read (an iOS WebView without the Audio
 * Session API).
 */
export function applySystemMutePolicy(env: SystemMuteEnv = readSystemMuteEnv()): boolean {
  if (env.audioSession) {
    try {
      // "ambient": follows the silent switch, mixes with other audio, never takes over playback.
      if (env.audioSession.type !== "ambient") env.audioSession.type = "ambient";
      return true;
    } catch {
      // Fall through to the platform rule.
    }
  }
  return env.platform !== "ios";
}
