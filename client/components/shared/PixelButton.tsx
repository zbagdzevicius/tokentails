import { playUiSound } from "@/components/audio/uiSounds";
import { cdnFile } from "@/constants/utils";
import clsx from "clsx";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { PixelIcon, PixelIconName } from "./PixelIcon";

export type PixelButtonSize = "sm" | "md" | "lg";

interface ICommonProps {
  text: ReactNode;
  subtext?: string | number;
  /** Pressed look (no bottom shadow row), for tabs and toggles. */
  active?: boolean;
  /** Defaults to "md". */
  size?: PixelButtonSize;
  fullWidth?: boolean;
  /** Icon shown before the text. */
  icon?: PixelIconName;
  id?: string;
  className?: string;
  /**
   * Called without arguments, as before the rebuild: several call sites pass
   * handlers whose first parameter means something else (a level id, say).
   */
  onClick?: () => void;
}

interface IButtonProps extends ICommonProps {
  as?: "button";
  /** Sets aria-pressed, for a tab or toggle whose chosen state assistive tech must hear. */
  pressed?: boolean;
  /** Defaults to "button", so a PixelButton inside a form never submits it by accident. */
  type?: "button" | "submit" | "reset";
  /** Shows an inline spinner, sets aria-busy and ignores clicks. */
  busy?: boolean;
  disabled?: boolean;
}

interface ISpanProps extends ICommonProps {
  /**
   * "span" renders the same visuals without a button element, for use inside
   * a link (`<Link><PixelButton as="span" /></Link>`): one tab stop, valid HTML.
   *
   * The link owns focus and keyboard activation, so a span cannot make it
   * inert: Enter on a focused link fires the anchor's click, never the span's,
   * and aria-disabled on the span never reaches assistive tech. `busy`,
   * `disabled` and `type` are therefore not accepted here. To show an inert
   * call to action, render a plain `<PixelButton disabled />` instead of the
   * link.
   */
  as: "span";
  type?: never;
  busy?: never;
  disabled?: never;
  pressed?: never;
}

type IProps = IButtonProps | ISpanProps;

// Visual scale per size. The pixel frame is drawn at one size and scaled, as
// before, so call sites that compensate with margins keep their layout.
const SIZE_CLASSES: Record<PixelButtonSize, string> = {
  sm: "scale-[0.675] hover:scale-75",
  md: "hover:scale-105",
  lg: "glow-box scale-125 md:scale-[2] hover:scale-150 md:hover:scale-[2.5]",
};

export const PixelButton = (props: IProps) => {
  const {
    text,
    subtext,
    active,
    size = "md",
    fullWidth,
    icon,
    id,
    className,
    onClick,
  } = props;
  const isSpan = props.as === "span";
  const type = (!isSpan && props.type) || "button";
  const busy = !isSpan && !!props.busy;
  const disabled = !isSpan && !!props.disabled;
  const inert = disabled || busy;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (inert) {
      // A busy submit button is not natively disabled and would submit its
      // form again. (Spans are never inert: see ISpanProps.)
      event.preventDefault();
      return;
    }
    onClick?.();
    playUiSound("click");
  };

  // Hover sound for mouse only: pointerenter also fires on every touch tap,
  // which would play the louder hover sound on top of the click sound.
  const handlePointerEnter = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && !inert) playUiSound("hover");
  };

  const rootClassName = clsx(
    "flex justify-center relative items-center m-auto h-12",
    className,
    fullWidth && "w-full",
    SIZE_CLASSES[size],
    !active && !inert && "hover:brightness-125 hover:pb-1 transition-all",
    disabled && "brightness-[0.7] cursor-not-allowed",
    busy && !disabled && "cursor-wait",
    !inert && "cursor-pointer"
  );

  const content = (
    <>
      <img
        src={cdnFile("landing/button-bg.webp")}
        draggable={false}
        alt=""
        className="absolute inset-0 h-full w-full object-cover mix-blend-darken brightness-125 rounded-xl animate-pulseWeak"
      />
      <span className="block h-8 w-1 bg-yellow-900"></span>
      <span className="h-10 w-1 flex flex-col bg-tt-cream border-y-4 border-yellow-900">
        <span className="block h-6 bg-tt-cream"></span>
        <span className="block h-1 bg-yellow-900"></span>
        {!active && <span className="block h-2 bg-[#e2c05a]"></span>}
      </span>
      <span className={clsx("block", fullWidth && "w-full")}>
        <span
          className={clsx(
            "h-12 flex flex-col border-y-4 border-yellow-900 bg-tt-cream",
            fullWidth && "w-full"
          )}
        >
          <span
            className={clsx(
              "h-9 bg-tt-cream px-4 font-primary font-normal uppercase flex items-center gap-2",
              fullWidth && "w-full justify-center",
              size === "lg" ? "text-p3" : "text-p4"
            )}
          >
            {busy ? (
              <PixelIcon
                name="loader"
                className="text-tt-gold-ink animate-spin motion-reduce:animate-none"
              />
            ) : (
              icon && <PixelIcon name={icon} className="text-tt-gold-ink" />
            )}
            <span className="text-tt-gold-ink whitespace-nowrap">{text}</span>
            {subtext !== undefined && subtext !== "" && (
              <span className="text-yellow-800">{subtext}</span>
            )}
          </span>
          <span className="block h-1 bg-yellow-900"></span>
          {!active && <span className="block h-2 bg-[#e2c05a]"></span>}
        </span>
      </span>
      <span className="h-10 w-1 flex flex-col bg-tt-cream border-y-4 border-yellow-800">
        <span className="block h-8 bg-yellow-900"></span>
        {!active && <span className="block h-2 bg-[#e2c05a]"></span>}
      </span>
      <span className="block h-8 w-1 bg-yellow-900"></span>
    </>
  );

  if (isSpan) {
    return (
      <span
        id={id}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        className={rootClassName}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      id={id}
      type={type}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-pressed={props.pressed}
      className={rootClassName}
    >
      {content}
    </button>
  );
};
