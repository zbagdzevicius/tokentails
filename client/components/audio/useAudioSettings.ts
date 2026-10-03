import { useSyncExternalStore } from "react";
import { DEFAULT_AUDIO_SETTINGS, getAudioSettings, subscribeAudioSettings, type AudioSettings } from "./settings";

const serverSnapshot = (): AudioSettings => DEFAULT_AUDIO_SETTINGS;

/** The audio settings, live. The server render and the first client render use the defaults. */
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribeAudioSettings, getAudioSettings, serverSnapshot);
}
