import { playUiSound } from "@/components/audio/uiSounds";
import { PixelIcon } from "@/components/shared/PixelIcon";
import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { IconSlot, type ModalIcon } from "./IconSlot";

/**
 * - `primary`: gold CTA (gold-400 fill, gold-ink text, 9.5:1). One per area.
 * - `secondary`: night fill, gold edge, cream text. Supporting actions.
 * - `ghost`: text only, for "Not now", "Back", links.
 * - `danger`: rust outline, for the first step of a destructive action.
 * - `danger-solid`: ember fill, only for the final confirm of a destructive action.
 */
export type ModalButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
/** Real sizes (no scale transform): both keep a 44 px minimum target. */
export type ModalButtonSize = "sm" | "md";

export interface ModalButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  variant?: ModalButtonVariant;
  size?: ModalButtonSize;
  icon?: ModalIcon;
  /** Shown after the label, smaller (a price, a count). */
  trailing?: ReactNode;
  fullWidth?: boolean;
  /** Spinner, aria-busy, clicks ignored (the button stays focusable). */
  busy?: boolean;
  /** Plays the UI click sound. Default true. */
  sound?: boolean;
}

const VARIANT_CLASSES: Record<ModalButtonVariant, string> = {
  primary: "tt-btn bg-tt-gold-400 text-tt-gold-ink hover:brightness-110",
  secondary: "tt-btn bg-tt-night-600 text-tt-cream hover:bg-tt-night-500",
  ghost:
    "tt-btn text-tt-gold-400 underline-offset-4 hover:underline hover:text-tt-cream",
  danger: "tt-btn bg-tt-night-950/40 text-tt-rust hover:bg-tt-ember/20",
  "danger-solid": "tt-btn bg-tt-ember text-tt-cream hover:brightness-110",
};

const SIZE_CLASSES: Record<ModalButtonSize, string> = {
  sm: "min-h-[44px] px-3 text-p5 gap-1.5",
  md: "min-h-[48px] px-5 text-p4 gap-2",
};

/**
 * The button's classes, for an element that cannot be a ModalButton (a Next `<Link>`, which
 * cannot hold a button): it looks and focuses the same and never drifts from the real one.
 */
export function modalButtonClass({
  variant = "secondary",
  size = "md",
  fullWidth,
  busy,
  className,
}: {
  variant?: ModalButtonVariant;
  size?: ModalButtonSize;
  fullWidth?: boolean;
  busy?: boolean;
  className?: string;
} = {}): string {
  return clsx(
    "relative inline-flex select-none items-center justify-center font-primary uppercase leading-none tracking-wide",
    "transition-[filter,background-color,color,transform] duration-150 active:translate-y-[2px] motion-reduce:transition-none motion-reduce:active:translate-y-0",
    "outline-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[4px] focus-visible:outline-tt-gold-400",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:saturate-50",
    busy ? "cursor-wait" : "cursor-pointer",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && "w-full",
    className
  );
}

export const ModalButton = forwardRef<HTMLButtonElement, ModalButtonProps>(function ModalButton(
  {
    children,
    variant = "secondary",
    size = "md",
    icon,
    trailing,
    fullWidth,
    busy,
    sound = true,
    disabled,
    type = "button",
    className,
    onClick,
    ...rest
  },
  ref
) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
    if (sound) playUiSound("click");
  };
  return (
    <button
      ref={ref}
      type={type}
      data-variant={variant}
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={handleClick}
      className={modalButtonClass({ variant, size, fullWidth, busy, className })}
      {...rest}
    >
      {busy ? (
        <PixelIcon name="loader" size="1.1em" className="animate-spin motion-reduce:animate-none" />
      ) : (
        icon != null && <IconSlot icon={icon} size="1.1em" />
      )}
      <span className="whitespace-nowrap">{children}</span>
      {trailing != null && (
        <span className="font-sans text-[0.8em] font-bold normal-case tracking-normal opacity-80">
          {trailing}
        </span>
      )}
    </button>
  );
});

export default ModalButton;
