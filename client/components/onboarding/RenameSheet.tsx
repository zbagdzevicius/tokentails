import { STARTER_API, type RenameResult } from "@/api/starter-api";
import { PixelButton } from "@/components/shared/PixelButton";
import { GameModal } from "@/components/ui/GameModal";
import { CAT_RENAME_COOLDOWN_DAYS } from "@/shared-contracts/name";
import clsx from "clsx";
import { useRef, useState } from "react";
import { CAT_NAME_MAX_LENGTH, checkName, nameMessage, surpriseName } from "./names";

/**
 * Rename your starter (plan G3 "Names", decision #22): one free rename per 30 days, frozen once
 * the cat is minted. Validation is the shared `normalizeCatName`; the server has the last word
 * (`PUT /cat/:id/name`). Task 4c opens this from ProfileModal and CatsModal.
 */
export interface RenameSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cat: { _id: string; name: string };
  /** Names the starter may not take (featured real cats), when the caller has them. */
  reserved?: ReadonlyArray<string>;
  onRenamed?: (cat: { _id: string; name: string; nextRenameAt?: string }) => void;
}

/** The player-facing line for a refused rename. */
export function renameFailureMessage(result: Exclude<RenameResult, { status: "renamed" }>): string {
  switch (result.status) {
    case "invalid":
      return nameMessage(result.code);
    case "cooldown": {
      const when = result.nextRenameAt ? formatDate(result.nextRenameAt) : null;
      return when
        ? `You can rename your cat again on ${when}.`
        : `You can rename your cat once every ${CAT_RENAME_COOLDOWN_DAYS} days.`;
    }
    case "frozen":
      return "This cat's name can't be changed any more.";
    default:
      return "We couldn't save the name. Check your connection and try again.";
  }
}

function formatDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export const RenameSheet = ({ open, onOpenChange, cat, reserved = [], onRenamed }: RenameSheetProps) => {
  const [value, setValue] = useState(cat.name);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when the sheet opens (adjusting state while rendering, not in an effect).
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const openKey = open ? `${cat._id}:${cat.name}` : null;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    if (openKey) {
      setValue(cat.name);
      setError(null);
      setTouched(false);
      setBusy(false);
    }
  }

  const onChange = (next: string) => {
    setValue(next);
    if (touched) {
      const check = checkName(next, reserved);
      setError(check.ok ? null : check.message);
    }
  };

  const submit = async () => {
    setTouched(true);
    const check = checkName(value, reserved);
    if (!check.ok) {
      setError(check.message);
      inputRef.current?.focus();
      return;
    }
    if (check.name === cat.name) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    const result = await STARTER_API.renameCat(cat._id, check.name);
    setBusy(false);
    if (result.status === "renamed") {
      onRenamed?.(result.cat);
      onOpenChange(false);
      return;
    }
    setError(renameFailureMessage(result));
  };

  return (
    <GameModal
      open={open}
      onOpenChange={onOpenChange}
      title="Rename your cat"
      description={`One free rename every ${CAT_RENAME_COOLDOWN_DAYS} days.`}
      surface="sheet"
      size="sm"
      layer="modal-nested"
      name="rename-sheet"
      initialFocus={inputRef}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="rename-input" className="sr-only">
          New name
        </label>
        <input
          ref={inputRef}
          id="rename-input"
          data-testid="rename-input"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          maxLength={CAT_NAME_MAX_LENGTH + 8}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby="rename-error"
          onChange={(event) => onChange(event.target.value)}
          className={clsx(
            "block h-14 w-full border-4 bg-tt-gold-400 px-4 text-center font-primary text-p2 uppercase leading-none text-tt-gold-ink",
            "shadow-[inset_0_-4px_0_rgb(var(--tt-gold-500)),0_4px_0_rgb(var(--tt-gold-shadow))]",
            "focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-tt-cream",
            error ? "border-tt-rust" : "border-tt-gold-shadow",
          )}
        />
        <p
          id="rename-error"
          role="alert"
          data-testid="rename-error"
          className={clsx("min-h-[1.375em] font-sans text-p5 font-bold text-tt-rust", !error && "sr-only")}
        >
          {error || ""}
        </p>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onChange(surpriseName(value, reserved))}
            className="inline-flex min-h-[44px] items-center px-2 font-secondary text-p4 uppercase tracking-wider text-tt-lilac hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400"
          >
            Surprise me
          </button>
          <PixelButton type="submit" text="SAVE NAME" busy={busy} />
        </div>
      </form>
    </GameModal>
  );
};

export default RenameSheet;
