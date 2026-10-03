/**
 * @jest-environment jsdom
 */
import { MusicEngine, type MusicElement } from "@/components/audio/musicEngine";
import { __resetAudioSettingsForTests, setAudioSettings, setMuted } from "@/components/audio/settings";
import { applySystemMutePolicy } from "@/components/audio/systemMute";
import { LOBBY_MUSIC_TRACK, trackFor } from "@/components/audio/tracks";
import {
  __resetGameRegistryForTests,
  acquireGameSuspension,
  exemptAudioFromSuspension,
  registerGame,
  registerMediaElement,
  type RegistrableGame,
} from "@/lib/game/gameRegistry";
import { GameType } from "@/models/game";

class FakeAudio implements MusicElement {
  src = "";
  loop = false;
  volume = 1;
  preload = "";
  currentTime = 0;
  paused = true;
  plays = 0;
  refuse = false;
  play = () => {
    this.plays += 1;
    if (this.refuse) return Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    this.paused = false;
    return Promise.resolve();
  };
  pause = () => {
    this.paused = true;
  };
  load = () => {};
  removeAttribute = () => {
    this.src = "";
  };
}

function setup(options: { active?: boolean; systemAllows?: boolean } = {}) {
  const created: FakeAudio[] = [];
  const engine = new MusicEngine({
    createElement: () => {
      const el = new FakeAudio();
      created.push(el);
      return el;
    },
    doc: document,
    win: window,
    hasBeenActive: () => !!options.active,
    systemMuteAllows: () => options.systemAllows ?? true,
  });
  engine.start();
  return { engine, created, el: () => created[0] };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

const tap = () => window.dispatchEvent(new Event("pointerdown"));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let engines: MusicEngine[] = [];
beforeEach(() => {
  window.localStorage.clear();
  __resetAudioSettingsForTests();
  __resetGameRegistryForTests();
  setHidden(false);
  engines = [];
});
afterEach(() => engines.forEach((e) => e.stop()));

function make(options?: Parameters<typeof setup>[0]) {
  const result = setup(options);
  engines.push(result.engine);
  return result;
}

describe("music engine (plan G14 Audio)", () => {
  it("creates no element and fetches nothing before the first input", () => {
    const { engine, created } = make();
    engine.setTrack(LOBBY_MUSIC_TRACK);
    expect(created).toHaveLength(0);
    expect(engine.shouldPlay()).toBe(false);
  });

  it("starts the looping track at the music volume after the first input", () => {
    const { engine, el } = make();
    engine.setTrack(LOBBY_MUSIC_TRACK);
    tap();
    expect(el().src).toBe(LOBBY_MUSIC_TRACK);
    expect(el().loop).toBe(true);
    expect(el().volume).toBe(0.4);
    expect(el().paused).toBe(false);
  });

  it("a first input on a sound control unlocks without creating the element", () => {
    const { engine, created, el } = make();
    engine.setTrack(LOBBY_MUSIC_TRACK);
    const button = document.createElement("button");
    button.setAttribute("data-audio-control", "");
    const icon = document.createElement("span");
    button.appendChild(icon);
    document.body.appendChild(button);
    try {
      // The tap lands on the icon inside the mute toggle; its click then mutes.
      icon.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect(engine.isUnlocked).toBe(true);
      expect(created).toHaveLength(0);
      setMuted(true);
      expect(created).toHaveLength(0);
      // Unmuting through the control starts the track: the input already unlocked.
      setMuted(false);
      expect(el().paused).toBe(false);
    } finally {
      button.remove();
    }
  });

  it("reports music as unavailable when the system mute cannot be honoured", () => {
    expect(make({ systemAllows: false }).engine.musicAvailable).toBe(false);
    expect(make().engine.musicAvailable).toBe(true);
  });

  it("plays at once when the page already had user activation", () => {
    const { engine, el } = make({ active: true });
    engine.setTrack(LOBBY_MUSIC_TRACK);
    expect(el().paused).toBe(false);
  });

  it("mute pauses, unmute resumes, and volume follows the setting", () => {
    const { engine, el } = make({ active: true });
    engine.setTrack(LOBBY_MUSIC_TRACK);
    setMuted(true);
    expect(el().paused).toBe(true);
    setMuted(false);
    expect(el().paused).toBe(false);
    setAudioSettings({ musicVolume: 0.7 });
    expect(el().volume).toBe(0.7);
    setAudioSettings({ musicVolume: 0 });
    expect(el().paused).toBe(true);
  });

  it("never creates the element while muted", () => {
    setMuted(true);
    const { engine, created } = make({ active: true });
    engine.setTrack(LOBBY_MUSIC_TRACK);
    tap();
    expect(created).toHaveLength(0);
  });

  it("pauses while the tab is hidden and resumes when it is visible again", () => {
    const { engine, el } = make({ active: true });
    engine.setTrack(LOBBY_MUSIC_TRACK);
    setHidden(true);
    expect(el().paused).toBe(true);
    setHidden(false);
    expect(el().paused).toBe(false);
  });

  it("pauses through a GameModal suspension and resumes after it", () => {
    const { engine, el } = make({ active: true });
    engine.setTrack(LOBBY_MUSIC_TRACK);
    const release = acquireGameSuspension();
    expect(el().paused).toBe(true);
    tap(); // input inside the modal does not restart it
    expect(el().paused).toBe(true);
    release();
    expect(el().paused).toBe(false);
  });

  it("does not resume after a suspension if the player muted meanwhile", () => {
    const { engine, el } = make({ active: true });
    engine.setTrack(LOBBY_MUSIC_TRACK);
    const release = acquireGameSuspension();
    setMuted(true);
    release();
    expect(el().paused).toBe(true);
  });

  it("keeps playing through a suspension while an audio exemption is held (Settings)", () => {
    const { engine, el } = make({ active: true });
    engine.setTrack(LOBBY_MUSIC_TRACK);
    const exempt = exemptAudioFromSuspension();
    const release = acquireGameSuspension();
    expect(el().paused).toBe(false);
    exempt();
    expect(el().paused).toBe(true);
    release();
    expect(el().paused).toBe(false);
  });

  it("stays silent when the system mute cannot be honoured (iOS WebView without Audio Session)", () => {
    const { engine, created } = make({ active: true, systemAllows: false });
    engine.setTrack(LOBBY_MUSIC_TRACK);
    tap();
    expect(created).toHaveLength(0);
  });

  it("retries on the next input after the browser refused playback", async () => {
    const { engine, el } = make();
    engine.setTrack(LOBBY_MUSIC_TRACK);
    // First element refuses.
    tap();
    el().paused = true;
    el().refuse = true;
    engine.update();
    await flush();
    expect(engine.isUnlocked).toBe(false);
    el().refuse = false;
    tap();
    expect(el().paused).toBe(false);
  });

  it("switches tracks in place and goes silent for a null track", () => {
    const { engine, el, created } = make({ active: true });
    engine.setTrack(LOBBY_MUSIC_TRACK);
    engine.setTrack("/other.mp3");
    expect(created).toHaveLength(1);
    expect(el().src).toBe("/other.mp3");
    expect(el().paused).toBe(false);
    engine.setTrack(null);
    expect(el().paused).toBe(true);
  });

  it("pushes the effects volume and mute to every Phaser sound manager", () => {
    const sound = { volume: 1, mute: false };
    const game = {
      loop: { running: true, sleep: () => {}, wake: () => {} },
      events: { once: () => {} },
      destroy: () => {},
      sound,
    } as unknown as RegistrableGame;
    registerGame(game);
    make();
    expect(sound).toEqual({ volume: 0.6, mute: false });
    setMuted(true);
    expect(sound.mute).toBe(true);
    setAudioSettings({ effectsVolume: 0.2 });
    expect(sound.volume).toBe(0.2);
  });
});

describe("registerMediaElement", () => {
  it("pauses a playing element registered during a suspension and resumes it on release", () => {
    const el = new FakeAudio();
    el.paused = false;
    const release = acquireGameSuspension();
    registerMediaElement(el);
    expect(el.paused).toBe(true);
    release();
    expect(el.paused).toBe(false);
  });

  it("leaves an element the player had paused paused", () => {
    const el = new FakeAudio();
    registerMediaElement(el);
    const release = acquireGameSuspension();
    release();
    expect(el.plays).toBe(0);
  });
});

describe("tracks", () => {
  it("loops the lobby theme with no mode, mutes the shell for the Heist, and picks a Purrsuit song", () => {
    expect(trackFor(null)).toBe(LOBBY_MUSIC_TRACK);
    expect(LOBBY_MUSIC_TRACK).toMatch(/^\/music\/.+\.mp3$/);
    expect(LOBBY_MUSIC_TRACK).not.toContain(" ");
    expect(trackFor(GameType.CATNIP_HEIST)).toBeNull();
    expect(trackFor(GameType.CATNIP_CHAOS, () => 0)).toMatch(/song1\.mp3$/);
    expect(trackFor(GameType.CATNIP_CHAOS, () => 0.9999)).toMatch(/song45\.mp3$/);
    expect(trackFor(GameType.HOME)).toMatch(/music\.mp3$/);
  });
});

describe("system mute policy", () => {
  it("sets the iOS Audio Session to ambient so the silent switch applies", () => {
    const audioSession = { type: "auto" };
    expect(applySystemMutePolicy({ platform: "ios", audioSession })).toBe(true);
    expect(audioSession.type).toBe("ambient");
  });

  it("keeps music off on an iOS WebView without the Audio Session API, allows web and Android", () => {
    expect(applySystemMutePolicy({ platform: "ios", audioSession: null })).toBe(false);
    expect(applySystemMutePolicy({ platform: "android", audioSession: null })).toBe(true);
    expect(applySystemMutePolicy({ platform: "web", audioSession: null })).toBe(true);
  });
});
