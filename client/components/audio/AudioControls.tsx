import clsx from "clsx";
import { exemptAudioFromSuspension } from "@/lib/game/gameRegistry";
import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore, type ChangeEvent } from "react";
import { AudioIcon } from "./icons";
import { setAudioSettings, toggleMuted } from "./settings";
import { playUiSound, systemAudioAllowed } from "./uiSounds";
import { useAudioSettings } from "./useAudioSettings";

/**
 * Sound controls (plan G14 "Audio"): one mute toggle and two volume sliders over the shared
 * settings store, on the night palette, with 44 px targets and accessible names.
 */

/** Night HUD plate, the same recipe as the lobby's plates (GameSelect `NIGHT_PLATE`). */
const HUD_BUTTON =
  "flex h-[44px] w-[44px] items-center justify-center bg-tt-night-800/85 border-2 border-tt-gold-500/60 text-tt-gold-400 shadow-[0_4px_0_rgb(var(--tt-night-950)),0_0_24px_rgb(var(--tt-gold-400)/0.12)] lowfx:shadow-[0_4px_0_rgb(var(--tt-night-950))] transition hover:brightness-125 active:translate-y-[2px] active:shadow-[0_2px_0_rgb(var(--tt-night-950))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400";

export const HUD_BUTTON_CLASSES = HUD_BUTTON;

/**
 * A pixel range input: square gold thumb on a stepped night track, gold up to the value. The
 * input itself is 44 px tall (the touch target); the visible track is 8 px.
 */
// Written out in full: Tailwind only generates classes it finds as literal strings.
const PIXEL_RANGE = [
  "h-[44px] w-full cursor-pointer appearance-none bg-transparent",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
  "[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:border-2 [&::-webkit-slider-runnable-track]:border-tt-night-500 [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,rgb(var(--tt-gold-400))_var(--tt-range-fill),rgb(var(--tt-night-950))_var(--tt-range-fill))]",
  "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-tt-gold-ink [&::-webkit-slider-thumb]:bg-tt-gold-400 [&::-webkit-slider-thumb]:shadow-[0_3px_0_rgb(var(--tt-gold-shadow))] [&::-webkit-slider-thumb]:-mt-[8px]",
  "[&::-moz-range-track]:h-2 [&::-moz-range-track]:border-2 [&::-moz-range-track]:border-tt-night-500 [&::-moz-range-track]:bg-[linear-gradient(to_right,rgb(var(--tt-gold-400))_var(--tt-range-fill),rgb(var(--tt-night-950))_var(--tt-range-fill))]",
  "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-tt-gold-ink [&::-moz-range-thumb]:bg-tt-gold-400 [&::-moz-range-thumb]:shadow-[0_3px_0_rgb(var(--tt-gold-shadow))]",
].join(" ");

/**
 * Mute toggle. A toggle button with a stable name ("Mute sound") and `aria-pressed` for the state,
 * so assistive technology reads "Mute sound, pressed" when sound is off.
 */
export const MuteToggle = ({
  variant = "hud",
  className,
  testId = "mute-toggle",
}: {
  /** `hud`: a 44 px icon plate for the lobby HUD. `panel`: a labelled row button for Settings. */
  variant?: "hud" | "panel";
  className?: string;
  testId?: string;
}) => {
  const { muted } = useAudioSettings();
  const icon = <AudioIcon name={muted ? "sound-off" : "sound-on"} size={variant === "hud" ? 24 : 20} />;
  if (variant === "hud") {
    return (
      <button
        type="button"
        aria-label="Mute sound"
        aria-pressed={muted}
        title={muted ? "Sound off" : "Sound on"}
        data-testid={testId}
        data-muted={muted}
        data-audio-control=""
        onClick={() => toggleMuted()}
        className={clsx(HUD_BUTTON, muted && "text-tt-muted", className)}
      >
        {icon}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={muted}
      data-testid={testId}
      data-muted={muted}
      data-audio-control=""
      onClick={() => toggleMuted()}
      className={clsx(
        "flex min-h-[44px] w-full items-center justify-between gap-3 border-2 px-3 py-2 font-secondary text-p5 uppercase tracking-wider transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
        muted
          ? "border-tt-night-500 bg-tt-night-900 text-tt-muted"
          : "border-tt-gold-500/60 bg-tt-night-800 text-tt-cream hover:brightness-125",
        className
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span>Mute sound</span>
      </span>
      <span
        aria-hidden="true"
        className={clsx(
          "relative h-6 w-11 shrink-0 border-2",
          muted ? "border-tt-gold-500 bg-tt-gold-400" : "border-tt-night-500 bg-tt-night-950"
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-4 w-4 transition-[left] motion-reduce:transition-none",
            muted ? "left-[22px] bg-tt-gold-ink" : "left-0.5 bg-tt-muted"
          )}
        />
      </span>
    </button>
  );
};

const SLIDER_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/** One volume slider, 0 to 100 %, stored as 0..1 with two decimals. */
export const VolumeSlider = ({
  label,
  value,
  onChange,
  disabled,
  testId,
  note,
  onCommit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  testId?: string;
  /** A line under the slider, linked with aria-describedby. */
  note?: string;
  /** Called when the player lets go of the slider (pointer up, or a key released). */
  onCommit?: () => void;
}) => {
  const id = useId();
  const noteId = `${id}-note`;
  const percent = Math.round(value * 100);
  return (
    <div className={clsx("flex flex-col gap-1", disabled && "opacity-60")}>
      <div className="flex items-baseline justify-between font-secondary text-p5 uppercase tracking-wider">
        <label htmlFor={id} className="text-tt-cream">
          {label}
        </label>
        <output htmlFor={id} className="tabular-nums text-tt-gold-400" aria-hidden="true">
          {percent}%
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        aria-valuetext={`${percent}%${disabled ? ", muted" : ""}`}
        data-testid={testId}
        aria-describedby={note ? noteId : undefined}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value) / 100)}
        onPointerUp={onCommit}
        onKeyUp={(event) => {
          // Only keys that move the slider; Tab's keyup lands on the slider it just focused.
          if (onCommit && SLIDER_KEYS.has(event.key)) onCommit();
        }}
        className={PIXEL_RANGE}
        style={{
          // The filled part of the track, in gold; the rest in night.
          ["--tt-range-fill" as string]: `${percent}%`,
        }}
      />
      {note && (
        <p id={noteId} className="font-secondary text-p6 text-tt-muted" data-testid={testId ? `${testId}-note` : undefined}>
          {note}
        </p>
      )}
    </div>
  );
};

/** Mute plus the music and effects sliders. Used by Settings and by the profile sheet. */
/** The system mute rule is fixed for the page's life, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};

export const MUSIC_UNAVAILABLE_NOTE = "Music needs iOS 16.4 or later on this device.";

/** How long the effects slider waits after the last release before playing its preview click. */
export const EFFECTS_PREVIEW_DELAY_MS = 120;

export const AudioSettingsPanel = ({ className }: { className?: string }) => {
  const settings = useAudioSettings();
  // Wherever the panel is shown, the music stays audible so the Music slider can be heard. The
  // modals that hold it (Settings, the profile sheet) also pass `keepAudio`, which is taken in the
  // same commit as the modal's suspension; this one mounts a commit later (inside the portal), so
  // on its own it would let the music pause for a moment first.
  useLayoutEffect(() => exemptAudioFromSuspension(), []);
  // The server has no platform and says "available", so hydration matches; the client then reads it.
  const musicAvailable = useSyncExternalStore(noSubscribe, systemAudioAllowed, () => true);

  // Effects make no sound while Settings is open, so play one click at the chosen level.
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
  }, []);
  const previewEffects = () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      previewTimer.current = null;
      playUiSound("click");
    }, EFFECTS_PREVIEW_DELAY_MS);
  };
  return (
    <section aria-label="Sound" className={clsx("flex w-full flex-col gap-3", className)} data-testid="audio-settings">
      <MuteToggle variant="panel" testId="settings-mute" />
      <VolumeSlider
        label="Music volume"
        value={settings.musicVolume}
        disabled={settings.muted}
        testId="music-volume"
        note={musicAvailable ? undefined : MUSIC_UNAVAILABLE_NOTE}
        onChange={(musicVolume) => setAudioSettings({ musicVolume })}
      />
      <VolumeSlider
        label="Effects volume"
        value={settings.effectsVolume}
        disabled={settings.muted}
        testId="effects-volume"
        onCommit={previewEffects}
        onChange={(effectsVolume) => setAudioSettings({ effectsVolume })}
      />
    </section>
  );
};
