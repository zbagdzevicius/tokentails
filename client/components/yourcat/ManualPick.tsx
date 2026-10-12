import type { YourcatFamilyOption } from "@/models/yourcat";
import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BODY, Headline, NIGHT_PILL, PANEL, PrimaryAction } from "./brand";
import { ERROR_TEXT, MANUAL, NAME_MAX, S2, type RequestFailure } from "./copy";
import { EASE } from "./motion";
import { framePosition, SHEET } from "./spriteSheet";
import { HeadingBlock } from "./studio";
import { ALERT, INPUT } from "./ui";

/**
 * The base six families, shown first in this order (docs/plans/yourcat-polish.md "Manual pick",
 * UX-08): Black, Grey, Pinkie, Siamese, Ginger, White. The other families follow behind "More looks"
 * in the order the status lists them.
 */
export const BASE_FAMILIES: readonly string[] = ["BLACK", "GREY", "PINKIE", "SIAMESE", "YELLOW", "WHITE"];

/** The tiles' entrance rhythm and the selected tile's lift (§4 "Manual pick"). */
export const TILE_STAGGER_MS = 50;
export const TILE_LIFT_MS = 160;

/** The base six first (in `BASE_FAMILIES` order), then every other family as the status lists it. */
export function orderFamilies(families: YourcatFamilyOption[]): { base: YourcatFamilyOption[]; more: YourcatFamilyOption[] } {
  const base = BASE_FAMILIES.map((key) => families.find((option) => option.family === key)).filter(
    (option): option is YourcatFamilyOption => !!option,
  );
  const more = families.filter((option) => !BASE_FAMILIES.includes(option.family));
  // A status without any base family (an old backend) still starts with something selected.
  if (base.length === 0) return { base: more.slice(0, 6), more: more.slice(6) };
  return { base, more };
}

export interface ManualPickProps {
  families: YourcatFamilyOption[];
  busy: boolean;
  /** Resolves with the failure, or null when the cat was made. */
  onMake: (family: string, name: string) => Promise<RequestFailure | null>;
  onBack?: () => void;
  /** Uploads are open: "Back" then returns to a photo. While they are closed it is a plain "Back". */
  uploadsOpen?: boolean;
  /** The selected family (the first one on mount), so the page can preview it on the stage companion. */
  onSelect?: (option: YourcatFamilyOption) => void;
  reducedMotion?: boolean;
  /**
   * The panel carries its own H2 (the default, for a panel shown on its own). The page passes false
   * and renders `ManualPickHeading` (the H1) in the heading block instead, so on md+ the panel sits
   * straight under it in column 2 and "Make my cat" stays in the first viewport.
   */
  titled?: boolean;
}

/**
 * The manual pick's H1 in the page's heading block (column 2, row 1 on md+; above the stage on
 * phones, where every screen's heading sits). The page moves focus to it when the screen opens.
 */
export const ManualPickHeading = forwardRef<HTMLHeadingElement>((_props, ref) => (
  <HeadingBlock>
    <Headline ref={ref} parts={MANUAL.titleParts} />
  </HeadingBlock>
));
ManualPickHeading.displayName = "ManualPickHeading";

function manualErrorText(failure: RequestFailure): string {
  if (failure.kind === "rate-limited") return ERROR_TEXT.burst;
  if (failure.kind !== "code") return ERROR_TEXT.generic;
  if (failure.code === "YOURCAT_USER_DAILY_CAP") return ERROR_TEXT.manualCap;
  if (failure.code === "YOURCAT_FAMILY_INVALID") return ERROR_TEXT.pickLook;
  if (failure.code === "YOURCAT_NAME_INVALID") return failure.message || ERROR_TEXT.generic;
  if (failure.code === "YOURCAT_DISABLED") return ERROR_TEXT.disabled;
  return ERROR_TEXT.generic;
}

/** Idle frame 0 of a family's sheet at 2x (96 px), pixel-exact. */
function TileSprite({ spriteImg }: { spriteImg: string }) {
  const scale = 2;
  const style: CSSProperties = {
    width: SHEET.cell * scale,
    height: SHEET.cell * scale,
    backgroundImage: `url("${spriteImg}")`,
    backgroundSize: `${SHEET.width * scale}px ${SHEET.height * scale}px`,
    backgroundPosition: framePosition("idle", 0, scale),
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
  };
  return <span aria-hidden="true" className="pixelated block shrink-0" style={style} data-testid="yourcat-tile-sprite" />;
}

/**
 * One family tile: a radio inside a label. It staggers in at `index` x 50 ms (WAAPI, opacity and an
 * 8 px rise) and lifts 4 px with a shadow when selected (160 ms). Reduced motion: neither.
 */
function FamilyTile({
  option,
  index,
  checked,
  reducedMotion,
  onChoose,
  inputRef,
}: {
  option: YourcatFamilyOption;
  index: number;
  checked: boolean;
  reducedMotion: boolean;
  onChoose: () => void;
  inputRef?: (node: HTMLInputElement | null) => void;
}) {
  const labelRef = useRef<HTMLLabelElement | null>(null);
  useEffect(() => {
    const node = labelRef.current;
    if (!node || reducedMotion || typeof node.animate !== "function") return;
    const animation = node.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 240, delay: index * TILE_STAGGER_MS, easing: EASE.out, fill: "backwards" },
    );
    return () => animation.cancel();
    // Mount only: the stagger plays once per tile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lift = checked && !reducedMotion;
  return (
    <label
      ref={labelRef}
      data-testid="yourcat-family-tile"
      data-family={option.family}
      data-selected={checked ? "true" : "false"}
      data-lift={lift ? "true" : "false"}
      style={reducedMotion ? undefined : { transitionDuration: `${TILE_LIFT_MS}ms`, transitionTimingFunction: EASE.out }}
      className={`flex min-h-11 cursor-pointer flex-col items-center gap-1 rounded-xl border-2 px-1 pb-2 text-center text-p6 md:text-p5 text-tt-cream focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-tt-cream ${
        reducedMotion ? "" : "transition-[transform,box-shadow,border-color,background-color] motion-reduce:transition-none"
      } ${
        checked
          ? "border-tt-gold-400 bg-tt-night-700/90 shadow-[0_4px_0_rgb(var(--tt-night-950)),0_0_16px_rgb(var(--tt-gold-400)/.35)]"
          : "border-tt-cream/30 bg-tt-night-900/70 hover:border-tt-gold-400/60"
      } ${lift ? "-translate-y-1 motion-reduce:translate-y-0" : ""}`}
    >
      <input
        ref={inputRef}
        type="radio"
        name="yourcat-family"
        value={option.family}
        checked={checked}
        onChange={onChoose}
        className="sr-only"
      />
      <TileSprite spriteImg={option.spriteImg} />
      <span className="-mt-3 leading-tight">{option.label}</span>
    </label>
  );
}

/**
 * §1.5 "Pick your cat's look yourself" (no photo, no AI, no cost), restyled (polish spec "Manual
 * pick"): a panel with the H2 (or, on the page, under `ManualPickHeading`'s H1), a centred radio grid with the base six first and the other families
 * behind "More looks", the first family preselected, the name field, the sticky "Make my cat" on
 * phones and a Back pill. The stage stays mounted around it; the page previews `onSelect`'s family.
 */
export const ManualPick = forwardRef<HTMLHeadingElement, ManualPickProps>(
  ({ families, busy, onMake, onBack, uploadsOpen = true, onSelect, reducedMotion = false, titled = true }, ref) => {
    const { base, more } = useMemo(() => orderFamilies(families), [families]);
    const ordered = useMemo(() => [...base, ...more], [base, more]);
    const [family, setFamily] = useState<string>(() => ordered[0]?.family ?? "");
    const [expanded, setExpanded] = useState(false);
    const [name, setName] = useState("");
    const [error, setError] = useState<{ text: string; field: "name" | "form" } | null>(null);
    const firstMoreRef = useRef<HTMLInputElement | null>(null);
    const focusMore = useRef(false);

    // Keep a valid selection when the families arrive or change (first family preselected).
    const selected = ordered.find((option) => option.family === family) ?? ordered[0];
    const selectedFamily = selected?.family ?? "";

    const onSelectRef = useRef(onSelect);
    useEffect(() => {
      onSelectRef.current = onSelect;
    });
    useEffect(() => {
      if (selected) onSelectRef.current?.(selected);
    }, [selected]);

    // "More looks" moves focus to the first newly shown look, so keyboard users land on them.
    useEffect(() => {
      if (expanded && focusMore.current) {
        focusMore.current = false;
        firstMoreRef.current?.focus();
      }
    }, [expanded]);

    const submit = async () => {
      if (!selectedFamily) {
        setError({ text: ERROR_TEXT.pickLook, field: "form" });
        return;
      }
      setError(null);
      const failure = await onMake(selectedFamily, name.trim());
      if (failure) {
        const field = failure.kind === "code" && failure.code === "YOURCAT_NAME_INVALID" ? "name" : "form";
        setError({ text: manualErrorText(failure), field });
      }
    };

    // A selected look from the hidden set keeps the set open.
    const showMore = expanded || more.some((option) => option.family === selectedFamily);
    const shown = showMore ? ordered : base;

    return (
      <section className={`${PANEL} flex flex-col items-center gap-5`} data-testid="yourcat-manual" data-titled={titled ? "true" : "false"}>
        {titled && <Headline ref={ref} level={2} parts={MANUAL.titleParts} />}
        <fieldset className="w-full">
          {/* The heading already says it; the legend names the group for screen readers. */}
          <legend className="sr-only">{MANUAL.legend}</legend>
          <div
            role="radiogroup"
            aria-label={MANUAL.legend}
            id="yourcat-family-grid"
            className="grid grid-cols-[repeat(3,minmax(0,112px))] justify-center gap-2 sm:gap-3"
          >
            {shown.map((option, index) => (
              <FamilyTile
                key={option.family}
                option={option}
                // The base six stagger from 0; the expanded looks stagger from their own first tile.
                index={index < base.length ? index : index - base.length}
                checked={option.family === selectedFamily}
                reducedMotion={reducedMotion}
                onChoose={() => setFamily(option.family)}
                inputRef={index === base.length ? (node) => (firstMoreRef.current = node) : undefined}
              />
            ))}
          </div>
          {more.length > 0 && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                className={NIGHT_PILL}
                aria-expanded={showMore}
                aria-controls="yourcat-family-grid"
                onClick={() => {
                  if (!showMore) focusMore.current = true;
                  setExpanded(!showMore);
                }}
              >
                {showMore ? MANUAL.fewerLooks : MANUAL.moreLooks}
              </button>
            </div>
          )}
        </fieldset>
        <div className="flex w-full max-w-md flex-col gap-1">
          <label className={BODY} htmlFor="yourcat-manual-name">
            {MANUAL.nameLabel}
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
            onKeyDown={(event) => {
              if (event.key === "Enter" && !busy) {
                event.preventDefault();
                void submit();
              }
            }}
          />
        </div>
        {error && (
          <p id="yourcat-manual-error" className={`${ALERT} w-full max-w-md`} role="alert">
            {error.text}
          </p>
        )}
        {onBack && (
          <button type="button" className={`${NIGHT_PILL} md:order-last`} onClick={onBack}>
            {uploadsOpen ? MANUAL.back : MANUAL.backPlain}
          </button>
        )}
        {/* Phones: the one action sticks to the bottom of the viewport while the panel is on screen. */}
        <div
          data-testid="yourcat-manual-make"
          className="sticky bottom-0 z-20 -mx-4 -mb-4 w-[calc(100%+2rem)] rounded-b-xl border-t-2 border-tt-gold-400/30 bg-tt-night-900/95 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:static md:mx-0 md:mb-0 md:w-full md:border-0 md:bg-transparent md:p-0"
        >
          <PrimaryAction text={busy ? MANUAL.making : MANUAL.make} busy={busy} onClick={() => void submit()} />
        </div>
      </section>
    );
  },
);

ManualPick.displayName = "ManualPick";
