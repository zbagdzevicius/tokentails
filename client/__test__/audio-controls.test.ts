/**
 * @jest-environment jsdom
 */
import {
  AudioSettingsPanel,
  EFFECTS_PREVIEW_DELAY_MS,
  MUSIC_UNAVAILABLE_NOTE,
  MuteToggle,
} from "@/components/audio/AudioControls";
import * as uiSounds from "@/components/audio/uiSounds";
import { GraphicsTierControl } from "@/components/audio/GraphicsTierControl";
import { __resetAudioSettingsForTests, getAudioSettings, STORAGE_KEY } from "@/components/audio/settings";
import { REDUCED_MOTION_KEY } from "@/components/Phaser/look/settings";
import { resetMemorySettings } from "@/components/Phaser/look/storage";
import { RENDER_SETTING_KEY } from "@/components/Phaser/look/tier";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { createElement } from "react";

beforeEach(() => {
  window.localStorage.clear();
  __resetAudioSettingsForTests();
  uiSounds.__resetUiSoundsForTests();
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
  resetMemorySettings();
});

describe("sound controls (plan G14 Audio)", () => {
  it("the HUD mute toggle has a stable name, reports its state and persists it", () => {
    render(createElement(MuteToggle));
    const button = screen.getByRole("button", { name: "Mute sound" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).muted).toBe(true);
    // 44 px target, in px (phones scale rem with the viewport).
    expect(button.className).toContain("h-[44px]");
    expect(button.className).toContain("w-[44px]");
  });

  it("the panel's sliders are labelled, show percent and write the store", () => {
    render(createElement(AudioSettingsPanel));
    const music = screen.getByRole("slider", { name: "Music volume" });
    const effects = screen.getByRole("slider", { name: "Effects volume" });
    expect(music).toHaveValue("40");
    expect(effects).toHaveValue("60");
    fireEvent.change(music, { target: { value: "75" } });
    expect(getAudioSettings().musicVolume).toBe(0.75);
    expect(music).toHaveAttribute("aria-valuetext", "75%");
  });

  it("mute in the panel and in the HUD are the same setting", () => {
    render(createElement("div", null, createElement(MuteToggle), createElement(AudioSettingsPanel)));
    const [hud, panel] = screen.getAllByRole("button", { name: /Mute sound/ });
    fireEvent.click(panel);
    expect(hud).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: "Music volume" })).toHaveAttribute("aria-valuetext", "40%, muted");
    act(() => {
      fireEvent.click(hud);
    });
    expect(panel).toHaveAttribute("aria-pressed", "false");
  });
});

describe("graphics tier control (plan G7 render tiers)", () => {
  it("is a radio group of Auto, High and Low that saves the choice", () => {
    render(createElement(GraphicsTierControl));
    const group = screen.getByRole("radiogroup", { name: "Graphics" });
    expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Low" }));
    expect(window.localStorage.getItem(RENDER_SETTING_KEY)).toBe("low");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem(RENDER_SETTING_KEY)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Auto" }));
  });

  it("reads a stored choice and says so when storage refuses a write", () => {
    window.localStorage.setItem(RENDER_SETTING_KEY, "high");
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      render(createElement(GraphicsTierControl));
      expect(screen.getByRole("radio", { name: "High" })).toHaveAttribute("aria-checked", "true");
      fireEvent.click(screen.getByRole("radio", { name: "Low" }));
      expect(screen.getByText(/Saved for this visit only/)).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Low" })).toHaveAttribute("aria-checked", "true");
    } finally {
      spy.mockRestore();
    }
  });

  it("has a separate reduced-motion group (System, On, Off)", () => {
    render(createElement(GraphicsTierControl));
    screen.getByRole("radiogroup", { name: "Reduce motion" });
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "On" }));
    expect(window.localStorage.getItem(REDUCED_MOTION_KEY)).toBe("on");
    expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
  });

  it("marks both mute toggles as sound controls (the music engine skips their first tap)", () => {
    render(createElement(MuteToggle));
    render(createElement(AudioSettingsPanel));
    expect(screen.getByTestId("mute-toggle")).toHaveAttribute("data-audio-control");
    expect(screen.getByTestId("settings-mute")).toHaveAttribute("data-audio-control");
  });

  it("says when music cannot play on this device, linked to the slider", () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = { getPlatform: () => "ios" };
    try {
      render(createElement(AudioSettingsPanel));
      const note = screen.getByText(MUSIC_UNAVAILABLE_NOTE);
      expect(screen.getByRole("slider", { name: "Music volume" })).toHaveAttribute("aria-describedby", note.id);
      expect(screen.getByRole("slider", { name: "Effects volume" })).not.toHaveAttribute("aria-describedby");
    } finally {
      delete (globalThis as { Capacitor?: unknown }).Capacitor;
    }
  });

  it("shows no music note on the web", () => {
    render(createElement(AudioSettingsPanel));
    expect(screen.queryByText(MUSIC_UNAVAILABLE_NOTE)).toBeNull();
    expect(screen.getByRole("slider", { name: "Music volume" })).not.toHaveAttribute("aria-describedby");
  });

  it("previews the effects level once, after the player lets go", () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(uiSounds, "playUiSound").mockImplementation(() => {});
    try {
      render(createElement(AudioSettingsPanel));
      const effects = screen.getByRole("slider", { name: "Effects volume" });
      fireEvent.keyUp(effects, { key: "Tab" });
      fireEvent.keyUp(effects, { key: "ArrowRight" });
      fireEvent.keyUp(effects, { key: "ArrowRight" });
      fireEvent.pointerUp(effects);
      expect(spy).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(EFFECTS_PREVIEW_DELAY_MS);
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("click");
      // The music slider makes no preview: music itself is the preview.
      fireEvent.pointerUp(screen.getByRole("slider", { name: "Music volume" }));
      act(() => {
        jest.advanceTimersByTime(EFFECTS_PREVIEW_DELAY_MS);
      });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      jest.useRealTimers();
    }
  });
});
