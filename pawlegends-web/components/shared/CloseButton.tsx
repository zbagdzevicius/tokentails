import { cdnFile } from "@/constants/utils";
import clsx from "clsx";
import type { CSSProperties, MouseEvent } from "react";

/**
 * Where the button sits (plan F3.4):
 * - `inside` (the default): top-right corner inside the panel, so it sits inside an
 *   `overflow-hidden` panel's clip rect. GameModal's panel and sheet surfaces use it.
 * - `outside`: hangs off the panel's top-right corner, for art frames that do not clip.
 * - `viewport`: fixed to the viewport's top-right, inset by the safe area (notch, status bar).
 * - `sticky`: sticks to the top of a scrolling panel (the pre-F3.4 look). Opt-in only.
 */
export type CloseButtonPlacement = "inside" | "outside" | "viewport" | "sticky";

interface ICloseButton {
  onClick: () => void;
  /** Accessible name. Defaults to "Close". */
  label?: string;
  placement?: CloseButtonPlacement;
  /**
   * Visible but inert, announced as disabled (for example while a Wheel spin runs, so a tap cannot
   * kill the reveal). Clicks are ignored.
   */
  disabled?: boolean;
  className?: string;
}

// Panel-local art in the current modals stacks up to z-[60]; the button sits just above it. The
// viewport placement escapes the panel, so it takes the nested-modal layer.
const PLACEMENT_CLASSES: Record<CloseButtonPlacement, string> = {
  inside: "absolute right-2 top-2 z-[70]",
  // Phone dialogs pad the viewport by only 0.75rem, so the overhang is smaller there.
  outside: "absolute -right-2 -top-2 md:-right-4 md:-top-4 z-[70]",
  viewport: "fixed z-modal-nested",
  sticky: "sticky top-2 -mb-9 lg:-mb-10 ml-auto mr-2 z-[90] mt-2",
};

// Safe-area insets apply to the viewport placement only: inside a panel they would push the
// button off the frame on notched phones.
const VIEWPORT_STYLE: CSSProperties = {
  top: "max(0.5rem, env(safe-area-inset-top))",
  right: "max(0.5rem, env(safe-area-inset-right))",
};

export const CloseButton = ({
  onClick,
  label = "Close",
  placement = "inside",
  disabled,
  className,
}: ICloseButton) => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick();
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-placement={placement}
      onClick={handleClick}
      style={placement === "viewport" ? VIEWPORT_STYLE : undefined}
      className={clsx(
        // At least 44x44 CSS px whatever the icon size; no scale transforms on the button itself.
        // Sizes are in px, not rem: on phones globals.scss sets `html { font-size: 100vw / 25 }`,
        // which would shrink `h-11` to 35 px at 320 wide (arbitrary px values stay px).
        "group inline-flex h-[44px] min-h-[44px] w-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md lg:h-[64px] lg:w-[64px]",
        "outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-tt-night-900",
        PLACEMENT_CLASSES[placement],
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className
      )}
    >
      <img
        draggable={false}
        src={cdnFile("icons/close.webp")}
        alt=""
        aria-hidden="true"
        className={clsx(
          "pointer-events-none h-auto w-full transition-all duration-300",
          disabled
            ? "opacity-40 grayscale"
            : "opacity-70 group-hover:brightness-150 group-hover:opacity-100 group-hover:scale-125 group-focus-visible:opacity-100 group-focus-visible:brightness-125 motion-reduce:group-hover:scale-100"
        )}
      />
    </button>
  );
};

export default CloseButton;
