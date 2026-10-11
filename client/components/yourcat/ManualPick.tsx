import type { YourcatFamilyOption } from "@/models/yourcat";
import { forwardRef, useState } from "react";
import { ERROR_TEXT, MANUAL, NAME_MAX, S2, type RequestFailure } from "./copy";
import { ALERT, GHOST_BUTTON, GOLD_BUTTON, INPUT, ScreenHeading, SpriteStill, SUBTITLE } from "./ui";

export interface ManualPickProps {
  families: YourcatFamilyOption[];
  busy: boolean;
  /** Resolves with the failure, or null when the cat was made. */
  onMake: (family: string, name: string) => Promise<RequestFailure | null>;
  onBack?: () => void;
  /** Uploads are open: "Back" then returns to a photo. While they are closed it is a plain "Back". */
  uploadsOpen?: boolean;
}

function manualErrorText(failure: RequestFailure): string {
  if (failure.kind === "rate-limited") return ERROR_TEXT.burst;
  if (failure.kind !== "code") return ERROR_TEXT.generic;
  if (failure.code === "YOURCAT_USER_DAILY_CAP") return ERROR_TEXT.manualCap;
  if (failure.code === "YOURCAT_FAMILY_INVALID") return ERROR_TEXT.pickLook;
  if (failure.code === "YOURCAT_NAME_INVALID") return failure.message || ERROR_TEXT.generic;
  if (failure.code === "YOURCAT_DISABLED") return ERROR_TEXT.disabled;
  return ERROR_TEXT.generic;
}

/**
 * §1.5 "Pick your cat's look yourself": no photo, no AI, no cost. A radio group of the families
 * (frame 0 of each sprite at 2x, the label under it), the name field and "Make my cat".
 */
export const ManualPick = forwardRef<HTMLHeadingElement, ManualPickProps>(({ families, busy, onMake, onBack, uploadsOpen = true }, ref) => {
  const [family, setFamily] = useState<string>("");
  const [name, setName] = useState("");
  const [error, setError] = useState<{ text: string; field: "name" | "form" } | null>(null);

  const submit = async () => {
    if (!family) {
      setError({ text: ERROR_TEXT.pickLook, field: "form" });
      return;
    }
    setError(null);
    const failure = await onMake(family, name.trim());
    if (failure) {
      const field = failure.kind === "code" && failure.code === "YOURCAT_NAME_INVALID" ? "name" : "form";
      setError({ text: manualErrorText(failure), field });
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <ScreenHeading ref={ref} className={SUBTITLE}>
        {MANUAL.title}
      </ScreenHeading>
      <fieldset className="w-full">
        <legend className="mb-3 text-p5 md:text-p4 text-tt-cream">{MANUAL.legend}</legend>
        <div role="radiogroup" aria-label={MANUAL.legend} className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
          {families.map((option) => {
            const checked = option.family === family;
            return (
              <label
                key={option.family}
                className={`flex min-h-11 cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-2 text-p6 md:text-p5 text-tt-cream focus-within:outline focus-within:outline-2 focus-within:outline-tt-gold-400 ${
                  checked ? "border-tt-gold-400 bg-tt-night-600" : "border-tt-cream/30 bg-tt-night-800/70"
                }`}
              >
                <input
                  type="radio"
                  name="yourcat-family"
                  value={option.family}
                  checked={checked}
                  onChange={() => setFamily(option.family)}
                  className="sr-only"
                />
                <SpriteStill spriteImg={option.spriteImg} scale={2} />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex w-full max-w-md flex-col gap-1">
        <label className="text-p5 md:text-p4 text-tt-cream" htmlFor="yourcat-manual-name">
          {S2.nameLabel}
        </label>
        <input
          id="yourcat-manual-name"
          className={INPUT}
          type="text"
          autoComplete="off"
          maxLength={NAME_MAX}
          placeholder={S2.namePlaceholder}
          value={name}
          aria-describedby={error?.field === "name" ? "yourcat-manual-error" : undefined}
          aria-invalid={error?.field === "name" ? true : undefined}
          onChange={(event) => setName(event.target.value.slice(0, NAME_MAX))}
        />
      </div>
      {error && (
        <p id="yourcat-manual-error" className={ALERT} role="alert">
          {error.text}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className={GOLD_BUTTON} disabled={busy} onClick={submit}>
          {busy ? MANUAL.making : MANUAL.make}
        </button>
        {onBack && (
          <button type="button" className={GHOST_BUTTON} onClick={onBack}>
            {uploadsOpen ? MANUAL.back : MANUAL.backPlain}
          </button>
        )}
      </div>
    </div>
  );
});
