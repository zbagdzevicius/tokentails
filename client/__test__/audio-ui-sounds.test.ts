/**
 * @jest-environment jsdom
 */
import {
  __resetAudioSettingsForTests,
  DEFAULT_AUDIO_SETTINGS,
  effectsGain,
  setAudioSettings,
  setMuted,
} from "@/components/audio/settings";
import {
  __resetUiSoundsForTests,
  BUTTON_SOUND_BASE,
  playUiSound,
  PRE_G14_UI_VOLUME,
  systemAudioAllowed,
} from "@/components/audio/uiSounds";

const created: Array<{ src: string; volume: number; plays: number }> = [];

class FakeAudio {
  volume = 1;
  currentTime = 0;
  plays = 0;
  constructor(public src: string) {
    created.push(this);
  }
  play() {
    this.plays += 1;
    return Promise.resolve();
  }
}

const g = globalThis as { Capacitor?: unknown; Audio?: unknown };
const realAudio = g.Audio;

beforeEach(() => {
  window.localStorage.clear();
  __resetAudioSettingsForTests();
  __resetUiSoundsForTests();
  created.length = 0;
  g.Audio = FakeAudio;
  delete g.Capacitor;
  delete (navigator as { audioSession?: unknown }).audioSession;
});
afterAll(() => {
  g.Audio = realAudio;
  delete g.Capacitor;
});

describe("interface sounds (plan G14 Audio)", () => {
  it("plays the pre-G14 volumes at the default effects volume", () => {
    (["click", "hover"] as const).forEach((kind) =>
      expect(effectsGain(BUTTON_SOUND_BASE[kind], DEFAULT_AUDIO_SETTINGS)).toBeCloseTo(PRE_G14_UI_VOLUME[kind])
    );
    playUiSound("click");
    const click = created.find((a) => a.src.includes("click-close"))!;
    expect(click.plays).toBe(1);
    expect(click.volume).toBeCloseTo(0.04);
  });

  it("scales with the effects volume, louder than before at 100 %, capped at 1", () => {
    setAudioSettings({ effectsVolume: 0.3 });
    playUiSound("click");
    expect(created.find((a) => a.src.includes("click-close"))!.volume).toBeCloseTo(0.02);
    setAudioSettings({ effectsVolume: 1 });
    playUiSound("click");
    playUiSound("hover");
    expect(created.find((a) => a.src.includes("click-close"))!.volume).toBeCloseTo(0.04 / 0.6);
    expect(created.find((a) => a.src.includes("modern-mix"))!.volume).toBeLessThanOrEqual(1);
  });

  it("is silent, and creates nothing, when muted", () => {
    setMuted(true);
    playUiSound("click");
    expect(created).toHaveLength(0);
  });

  it("stays silent on an iOS WebView without the Audio Session API", () => {
    g.Capacitor = { getPlatform: () => "ios" };
    expect(systemAudioAllowed()).toBe(false);
    playUiSound("hover");
    expect(created).toHaveLength(0);
  });

  it("plays on iOS 16.4+ once the session follows the silent switch", () => {
    g.Capacitor = { getPlatform: () => "ios" };
    const session = { type: "auto" };
    Object.defineProperty(navigator, "audioSession", { configurable: true, value: session });
    playUiSound("click");
    expect(session.type).toBe("ambient");
    expect(created.some((a) => a.plays === 1)).toBe(true);
  });
});
