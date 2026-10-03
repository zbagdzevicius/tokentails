/**
 * @jest-environment jsdom
 */
import {
  __resetAudioSettingsForTests,
  DEFAULT_AUDIO_SETTINGS,
  effectsGain,
  getAudioSettings,
  LEGACY_MUSIC_KEY,
  musicGain,
  normalizeAudioSettings,
  setAudioSettings,
  STORAGE_KEY,
  subscribeAudioSettings,
  toggleMuted,
} from "@/components/audio/settings";

/** Makes every localStorage access throw, as in a private window or with site data blocked. */
function blockStorage() {
  const spies = [
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    }),
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    }),
  ];
  return () => spies.forEach((spy) => spy.mockRestore());
}

beforeEach(() => {
  window.localStorage.clear();
  __resetAudioSettingsForTests();
});

describe("audio settings store (plan G14 Audio)", () => {
  it("defaults to music 0.4, effects 0.6, not muted (replacing the old 0.05)", () => {
    expect(DEFAULT_AUDIO_SETTINGS).toEqual({ musicVolume: 0.4, effectsVolume: 0.6, muted: false });
    expect(getAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(musicGain()).toBe(0.4);
  });

  it("persists changes and reads them back after a reload", () => {
    setAudioSettings({ musicVolume: 0.25, muted: true });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({
      musicVolume: 0.25,
      effectsVolume: 0.6,
      muted: true,
    });
    __resetAudioSettingsForTests(); // a new page
    expect(getAudioSettings()).toEqual({ musicVolume: 0.25, effectsVolume: 0.6, muted: true });
  });

  it("falls back to the defaults when storage throws on read, and keeps changes in memory", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ musicVolume: 0.1, effectsVolume: 0.1, muted: true }));
    const restore = blockStorage();
    try {
      expect(getAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS);
      expect(() => toggleMuted()).not.toThrow();
      expect(getAudioSettings().muted).toBe(true);
      expect(musicGain()).toBe(0);
    } finally {
      restore();
    }
  });

  it("works when localStorage itself is unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
    try {
      expect(getAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS);
      expect(setAudioSettings({ effectsVolume: 0.3 }).effectsVolume).toBe(0.3);
    } finally {
      Object.defineProperty(window, "localStorage", descriptor);
    }
  });

  it("ignores corrupt or out-of-range stored values", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(getAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(normalizeAudioSettings({ musicVolume: 3, effectsVolume: -1, muted: "yes" })).toEqual({
      musicVolume: 1,
      effectsVolume: 0,
      muted: false,
    });
    expect(normalizeAudioSettings({ musicVolume: 0.30000000000000004 }).musicVolume).toBe(0.3);
    expect(normalizeAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it("honours the pre-G14 music toggle once as a mute", () => {
    window.localStorage.setItem(LEGACY_MUSIC_KEY, "false");
    expect(getAudioSettings().muted).toBe(true);
    __resetAudioSettingsForTests();
    window.localStorage.setItem(LEGACY_MUSIC_KEY, "true");
    expect(getAudioSettings().muted).toBe(false);
  });

  it("notifies subscribers on change only, and survives a throwing subscriber", () => {
    const seen: boolean[] = [];
    subscribeAudioSettings(() => {
      throw new Error("broken");
    });
    const unsubscribe = subscribeAudioSettings((s) => seen.push(s.muted));
    setAudioSettings({ muted: true });
    setAudioSettings({ muted: true }); // no change, no event
    toggleMuted();
    unsubscribe();
    toggleMuted();
    expect(seen).toEqual([true, false]);
  });

  it("follows other tabs through the storage event", () => {
    const seen: number[] = [];
    subscribeAudioSettings((s) => seen.push(s.musicVolume));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ musicVolume: 0.8, effectsVolume: 0.6, muted: false }));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    expect(getAudioSettings().musicVolume).toBe(0.8);
    expect(seen).toEqual([0.8]);
  });

  it("scales authored effect levels by the effects volume, 0 when muted", () => {
    expect(effectsGain(0.5)).toBeCloseTo(0.3);
    expect(effectsGain(2)).toBe(1);
    setAudioSettings({ muted: true });
    expect(effectsGain(0.5)).toBe(0);
  });
});
