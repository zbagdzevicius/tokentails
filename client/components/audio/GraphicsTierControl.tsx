import {
  getReducedMotionOverride,
  getRenderTierSetting,
  LOOK_SETTINGS_EVENT,
  setReducedMotionOverride,
  setRenderTierSetting,
  type ReducedMotionOverride,
  type RenderSetting,
} from "@/components/Phaser/look/settings";
import clsx from "clsx";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

/**
 * Graphics settings (plan G7 "Render tiers", task 6e's `look/settings.ts`): the render tier (Auto,
 * High, Low) and the separate reduced-motion flag (System, On, Off). Both are read when a game
 * mounts, so a change applies the next time a game opens. With storage blocked, look/settings
 * keeps the choice in memory for this visit, and the hint says so.
 */
interface Option<T extends string> {
  value: T;
  label: string;
  hint: string;
}

const TIER_OPTIONS: Array<Option<RenderSetting>> = [
  { value: "auto", label: "Auto", hint: "Picks the best look for this device" },
  { value: "high", label: "High", hint: "Sharpest look, glow and the most fireflies" },
  { value: "low", label: "Low", hint: "Lighter on battery and older phones" },
];

const MOTION_OPTIONS: Array<Option<ReducedMotionOverride>> = [
  { value: "system", label: "System", hint: "Follows your device's reduced motion setting" },
  { value: "on", label: "On", hint: "Parallax, fireflies and camera drift hold still" },
  { value: "off", label: "Off", hint: "Full motion" },
];

/**
 * A radio group of 44 px segments. Arrow keys move and select, as in a native radio group; only
 * the checked segment is in the tab order.
 */
function SegmentedRadio<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
  note,
}: {
  label: string;
  options: Array<Option<T>>;
  value: T;
  onChange: (value: T) => void;
  testId: string;
  note?: string;
}) {
  const id = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const select = (next: number, focus: boolean) => {
    onChange(options[next].value);
    if (focus) buttons.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    select((index + step + options.length) % options.length, true);
  };

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <h3 id={`${id}-label`} className="font-primary text-p4 uppercase tracking-wide text-tt-gold-400">
        {label}
      </h3>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 border-2 border-tt-gold-500/60 bg-tt-night-950"
      >
        {options.map((option, i) => {
          const checked = i === index;
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              data-testid={`${testId}-${option.value}`}
              onClick={() => select(i, false)}
              className={clsx(
                "min-h-[44px] px-2 font-secondary text-p5 uppercase tracking-wider focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-tt-gold-400",
                checked
                  ? "bg-tt-gold-400 text-tt-gold-ink shadow-[inset_0_-3px_0_rgb(var(--tt-gold-500))]"
                  : "text-tt-cream hover:bg-tt-night-700"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p id={`${id}-hint`} className="font-sans text-p6 text-tt-muted">
        {options[index].hint}. Applies the next time a game opens.
        {note && ` ${note}`}
      </p>
    </div>
  );
}

const MEMORY_ONLY = "Saved for this visit only: this browser blocks storage.";

export const GraphicsTierControl = () => {
  // Mounted only inside an open (client-side) modal, so the settings can be read on first render.
  const [tier, setTier] = useState<RenderSetting>(() => getRenderTierSetting());
  const [motion, setMotion] = useState<ReducedMotionOverride>(() => getReducedMotionOverride());
  const [tierMemoryOnly, setTierMemoryOnly] = useState(false);
  const [motionMemoryOnly, setMotionMemoryOnly] = useState(false);

  // Another tab or a dev override changed a look setting: show it.
  useEffect(() => {
    const reread = () => {
      setTier(getRenderTierSetting());
      setMotion(getReducedMotionOverride());
    };
    window.addEventListener(LOOK_SETTINGS_EVENT, reread);
    return () => window.removeEventListener(LOOK_SETTINGS_EVENT, reread);
  }, []);

  return (
    <div className="flex flex-col gap-4" data-testid="graphics-settings">
      <SegmentedRadio
        label="Graphics"
        testId="graphics"
        options={TIER_OPTIONS}
        value={tier}
        note={tierMemoryOnly ? MEMORY_ONLY : undefined}
        onChange={(value) => {
          setTierMemoryOnly(!setRenderTierSetting(value));
          setTier(value);
        }}
      />
      <SegmentedRadio
        label="Reduce motion"
        testId="motion"
        options={MOTION_OPTIONS}
        value={motion}
        note={motionMemoryOnly ? MEMORY_ONLY : undefined}
        onChange={(value) => {
          setMotionMemoryOnly(!setReducedMotionOverride(value));
          setMotion(value);
        }}
      />
    </div>
  );
};
