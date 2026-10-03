import { PINK_PAW_LOCAL_NAME, PINK_PAW_SLUG } from "@/components/shelter-payouts/pinkPaw";
import { nameFont } from "@/lib/glyphs";
import type { IFeaturedCat } from "@/api/starter-api";
import { PixelButton } from "@/components/shared/PixelButton";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { PixelFrame } from "@/components/ui/PixelFrame";
import type { StarterBreed } from "@/shared-contracts/enums";
import clsx from "clsx";
import { forwardRef, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { CAT_NAME_MAX_LENGTH } from "./names";
import { STARTER_ORDER, STARTERS } from "./starters";

/*
 * The bottom panels of Meet your cat. Night PixelFrame, Passion One title in gold-400, Nunito
 * body in cream (plan F3, G6). Every control is at least 44 px tall.
 */

export const TITLE_CLASSES =
  "font-primary uppercase leading-none tracking-wide text-tt-gold-400 text-p3 md:text-p2 [text-shadow:0_3px_0_rgb(var(--tt-gold-shadow))] outline-none";
const BODY_CLASSES = "font-sans text-p5 leading-snug text-tt-cream";

export const MeetPanel = ({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) => (
  <PixelFrame
    className={clsx("mx-auto w-full max-w-[600px]", className)}
    shadowClassName="[filter:drop-shadow(0_6px_0_rgb(var(--tt-night-950)))_drop-shadow(0_0_28px_rgb(var(--tt-gold-400)/0.16))] lowfx:[filter:none]"
  >
    {/* Padding here, not on the frame's content box: PixelFrame sets that one inline. */}
    <div data-testid={testId} className="flex flex-col gap-3 px-3 pb-3 pt-3 md:gap-4 md:px-5 md:pb-4 md:pt-4">
      {children}
    </div>
  </PixelFrame>
);

export const StepHeading = forwardRef<HTMLHeadingElement, { children: ReactNode; id?: string }>(
  function StepHeading({ children, id }, ref) {
    return (
      <h2 ref={ref} id={id} tabIndex={-1} className={TITLE_CLASSES}>
        {children}
      </h2>
    );
  },
);

export const StepText = ({ children, id }: { children: ReactNode; id?: string }) => (
  <p id={id} className={BODY_CLASSES}>
    {children}
  </p>
);

/** Plain text button for secondary actions (Back, Surprise me, Not now): 44 px, gold ring. */
export const TextButton = ({
  children,
  onClick,
  className,
  testId,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  testId?: string;
  type?: "button" | "submit";
}) => (
  <button
    type={type}
    onClick={onClick}
    data-testid={testId}
    className={clsx(
      "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 px-3 font-secondary text-p4 uppercase tracking-wider text-tt-lilac",
      "underline-offset-4 hover:text-tt-cream hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
      className,
    )}
  >
    {children}
  </button>
);

/* ------------------------------------------------------------------ choose */

/** Crops the empty rows of a 48 px cat frame so cards stay compact; integer scale only. */
export const CroppedCat = ({
  src,
  scale,
  top = 6,
  rows = 34,
  alt = "",
}: {
  src: string;
  scale: number;
  top?: number;
  rows?: number;
  alt?: string;
}) => {
  const size = 48 * scale;
  return (
    <span className="relative block overflow-hidden" style={{ width: size, height: rows * scale }}>
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        draggable={false}
        className="pixelated absolute left-0 max-w-none select-none"
        style={{ width: size, height: size, top: -top * scale, imageRendering: "pixelated" }}
      />
    </span>
  );
};

interface ChoosePanelProps {
  selected: StarterBreed;
  onSelect: (breed: StarterBreed) => void;
  onContinue: () => void;
  onBack: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  reducedMotion: boolean;
  cardScale: number;
}

export const ChoosePanel = ({
  selected,
  onSelect,
  onContinue,
  onBack,
  headingRef,
  reducedMotion,
  cardScale,
}: ChoosePanelProps) => {
  const cards = useRef<Array<HTMLButtonElement | null>>([]);

  // Roving focus for the radio group: arrows move and select, Home and End jump.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // From the focused card, not `selected`: fast key repeats arrive before React re-renders.
    const focused = cards.current.findIndex((card) => card === event.target);
    const index = focused >= 0 ? focused : STARTER_ORDER.indexOf(selected);
    const last = STARTER_ORDER.length - 1;
    const keyTo: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = keyTo[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onSelect(STARTER_ORDER[next]);
    cards.current[next]?.focus();
  };

  return (
    <MeetPanel testId="meet-choose">
      <div className="flex flex-col gap-1">
        <StepHeading ref={headingRef} id="meet-choose-title">
          Choose your companion
        </StepHeading>
        <StepText id="meet-choose-desc">All starters play the same. Pick the one you love.</StepText>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="meet-choose-title"
        aria-describedby="meet-choose-desc"
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 gap-2 md:grid-cols-5 md:gap-3"
      >
        {STARTER_ORDER.map((breed, index) => {
          const look = STARTERS[breed];
          const checked = breed === selected;
          return (
            <button
              key={breed}
              ref={(element) => {
                cards.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={look.badge ? `${look.name}, ${look.badge}` : `${look.name}, ${look.tagline}`}
              tabIndex={checked ? 0 : -1}
              data-testid={`starter-${breed}`}
              onClick={() => onSelect(breed)}
              className={clsx(
                "group relative flex min-h-[44px] flex-col items-center gap-1 border-[3px] px-1 pb-2 pt-2 text-center transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
                checked
                  ? "border-tt-gold-400 bg-tt-night-600 shadow-[inset_0_0_0_2px_rgb(var(--tt-night-950)),0_0_18px_rgb(var(--tt-gold-400)/0.35)]"
                  : "border-tt-night-500 bg-tt-night-800 hover:border-tt-gold-500/70 hover:bg-tt-night-700",
              )}
            >
              <span
                aria-hidden="true"
                className="flex items-end justify-center rounded-full"
                style={{
                  background:
                    "radial-gradient(closest-side, rgb(var(--tt-gold-400) / 0.22), transparent 75%)",
                }}
              >
                <CroppedCat src={reducedMotion ? look.still : look.idle} scale={cardScale} />
              </span>
              <span className="font-primary text-p4 uppercase leading-none text-tt-cream">{look.name}</span>
              <span
                aria-hidden="true"
                className={clsx(
                  "leading-tight",
                  look.badge
                    ? "font-secondary text-p6 uppercase tracking-wide text-tt-gold-400"
                    : "font-sans text-p6 text-tt-muted",
                )}
              >
                {look.badge || look.tagline}
              </span>
              {checked && (
                <span
                  aria-hidden="true"
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center bg-tt-gold-400 text-tt-gold-ink shadow-[0_2px_0_rgb(var(--tt-gold-shadow))]"
                >
                  <PixelIcon name="check" size={16} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <TextButton onClick={onBack} testId="meet-back">
          <PixelIcon name="chevron-left" size={18} />
          Back
        </TextButton>
        <div className="ml-auto">
          <PixelButton text="CONTINUE" onClick={onContinue} id="meet-choose-continue" />
        </div>
      </div>
    </MeetPanel>
  );
};

/* -------------------------------------------------------------------- name */

interface NamePanelProps {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSurprise: () => void;
  onBack: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  submitLabel: string;
  busy?: boolean;
}

export const NamePanel = ({
  value,
  error,
  onChange,
  onSubmit,
  onSurprise,
  onBack,
  headingRef,
  inputRef,
  submitLabel,
  busy,
}: NamePanelProps) => (
  <MeetPanel testId="meet-name">
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-3 md:gap-4"
    >
      <StepHeading ref={headingRef} id="meet-name-title">
        Name your cat
      </StepHeading>
      <div className="flex flex-col gap-1">
        <label htmlFor="meet-name-input" className="sr-only">
          Your cat&apos;s name
        </label>
        {/* The nameplate: a gold plate with the name in Passion One. */}
        <div className="relative">
          <input
            ref={inputRef}
            id="meet-name-input"
            data-testid="meet-name-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={CAT_NAME_MAX_LENGTH + 8}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "meet-name-error meet-name-hint" : "meet-name-hint"}
            onChange={(event) => onChange(event.target.value)}
            className={clsx(
              "block h-14 w-full border-4 bg-tt-gold-400 px-4 text-center font-primary text-p2 uppercase leading-none text-tt-gold-ink",
              "shadow-[inset_0_-4px_0_rgb(var(--tt-gold-500)),0_4px_0_rgb(var(--tt-gold-shadow))] placeholder:text-tt-gold-ink/50",
              "focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-tt-cream",
              error ? "border-tt-rust" : "border-tt-gold-shadow",
            )}
          />
        </div>
        <p
          id="meet-name-error"
          role="alert"
          data-testid="meet-name-error"
          className={clsx("min-h-[1.375em] font-sans text-p5 font-bold text-tt-rust", !error && "sr-only")}
        >
          {error || ""}
        </p>
        <p id="meet-name-hint" className="font-sans text-p6 text-tt-muted">
          2 to {CAT_NAME_MAX_LENGTH} letters or numbers. Spaces, &apos; and - are fine.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <TextButton onClick={onBack} testId="meet-back">
            <PixelIcon name="chevron-left" size={18} />
            Back
          </TextButton>
          <TextButton onClick={onSurprise} testId="meet-surprise">
            Surprise me
          </TextButton>
        </div>
        <div className="ml-auto">
          <PixelButton type="submit" text={submitLabel} busy={busy} id="meet-name-submit" />
        </div>
      </div>
    </form>
  </MeetPanel>
);

/* ---------------------------------------------------------------- featured */

export function displayCatName(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1) : trimmed;
}

interface FeaturedPanelProps {
  cats: IFeaturedCat[] | null;
  following: ReadonlySet<string>;
  pending: ReadonlySet<string>;
  message: string | null;
  onToggle: (cat: IFeaturedCat) => void;
  onStart: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

export const FeaturedPanel = ({
  cats,
  following,
  pending,
  message,
  onToggle,
  onStart,
  headingRef,
}: FeaturedPanelProps) => (
  <MeetPanel testId="meet-featured">
    <div className="flex flex-col gap-1">
      <StepHeading ref={headingRef} id="meet-featured-title">
        Real cats are waiting too
      </StepHeading>
      <StepText>Say hello to a few shelter cats.</StepText>
    </div>
    {cats === null ? (
      <p className="font-sans text-p5 text-tt-muted" role="status">
        Finding cats…
      </p>
    ) : (
      <ul className="flex flex-col gap-2" aria-labelledby="meet-featured-title">
        {cats.map((cat) => {
          const name = displayCatName(cat.name);
          const isFollowing = following.has(cat._id);
          // The shelter's real photo first; the card art only when there is no photo.
          const photo = cat.image || cat.catAvatar;
          return (
            <li
              key={cat._id}
              data-testid={`featured-${cat._id}`}
              className="flex items-center gap-3 border-[3px] border-tt-night-500 bg-tt-night-800 p-2"
            >
              {photo ? (
                <img
                  src={photo}
                  alt={`${name}, a cat in rescue`}
                  width={56}
                  height={56}
                  loading="lazy"
                  className="h-14 w-14 shrink-0 border-2 border-tt-gold-500 object-cover"
                />
              ) : (
                <span aria-hidden="true" className="h-14 w-14 shrink-0 border-2 border-tt-gold-500 bg-tt-night-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`${nameFont(name)} text-p4 uppercase leading-none text-tt-cream`}>{name}</p>
                {cat.shelter?.name && (
                  <p className="truncate font-sans text-p6 text-tt-muted">
                    {cat.shelter.slug === PINK_PAW_SLUG ? PINK_PAW_LOCAL_NAME : cat.shelter.name}
                  </p>
                )}
                {cat.excerpt && (
                  <p className="line-clamp-2 font-sans text-p6 leading-snug text-tt-cream/85 max-md:hidden">
                    {cat.excerpt}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-pressed={isFollowing}
                aria-busy={pending.has(cat._id) || undefined}
                data-testid={`follow-${cat._id}`}
                onClick={() => onToggle(cat)}
                className={clsx(
                  "inline-flex min-h-[44px] shrink-0 items-center gap-1 border-[3px] px-3 font-secondary text-p5 uppercase tracking-wide",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
                  isFollowing
                    ? "border-tt-gold-400 bg-tt-gold-400 text-tt-gold-ink"
                    : "border-tt-gold-500 bg-transparent text-tt-gold-400 hover:bg-tt-night-600",
                )}
              >
                <PixelIcon name={isFollowing ? "check" : "heart"} size={16} />
                {isFollowing ? `Following ${name}` : `Follow ${name}`}
              </button>
            </li>
          );
        })}
      </ul>
    )}
    {message && (
      <p role="alert" className="font-sans text-p6 text-tt-rust">
        {message}
      </p>
    )}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-sans text-p6 text-tt-muted" data-testid="meet-featured-footer">
        These cats are also in rescue packs
      </p>
      <div className="ml-auto">
        <PixelButton text="START PLAYING" onClick={onStart} id="meet-start" />
      </div>
    </div>
  </MeetPanel>
);
