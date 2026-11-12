import clsx from "clsx";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { ModalButton } from "./ModalButton";
import { type ModalIcon } from "./IconSlot";

export interface DangerZoneProps {
  /** Defaults to "Danger zone". */
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Destructive actions, set apart: a dim card with a rust edge at the end of a modal. Put
 * ConfirmAction buttons inside so nothing destructive happens on one tap.
 */
export const DangerZone = ({ title = "Danger zone", description, className, children }: DangerZoneProps) => {
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-tone="danger"
      className={clsx("tt-card flex flex-col gap-3 p-3 md:p-4 short:!p-2.5", className)}
    >
      <header className="flex items-start gap-2">
        <PixelIcon name="warning-diamond" size={20} className="mt-[2px] text-tt-rust" />
        <div className="flex flex-col gap-0.5">
          <h3
            id={`${id}-title`}
            className="font-primary text-p4 uppercase leading-none tracking-wide text-tt-rust"
          >
            {title}
          </h3>
          {description != null && (
            // Same sizes as a ModalSection heading and helper, so the cards read as one set.
            <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5">{description}</p>
          )}
        </div>
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
};

export interface ConfirmActionProps {
  /** The first, outlined button ("Delete account"). */
  label: ReactNode;
  /** What will happen, shown with the confirm step ("This deletes your cats and Tails for good."). */
  message: ReactNode;
  /** The final, solid button ("Delete forever"). */
  confirmLabel: ReactNode;
  /** Defaults to "Keep it". */
  cancelLabel?: ReactNode;
  onConfirm: () => void | Promise<unknown>;
  /** Called when the player backs out. */
  onCancel?: () => void;
  icon?: ModalIcon;
  /** `danger` (default) or `secondary` for a reversible action such as Log out. */
  variant?: "danger" | "secondary";
  /** Skip the confirm step (a reversible action that still belongs here). */
  immediate?: boolean;
  busy?: boolean;
  testId?: string;
  confirmTestId?: string;
  cancelTestId?: string;
}

/**
 * A two-step destructive button. The first tap reveals the message with a solid confirm and a
 * cancel; focus moves to cancel, the safe choice, and returns to the trigger on cancel.
 */
export const ConfirmAction = ({
  label,
  message,
  confirmLabel,
  cancelLabel = "Keep it",
  onConfirm,
  onCancel,
  icon,
  variant = "danger",
  immediate,
  busy,
  testId,
  confirmTestId,
  cancelTestId,
}: ConfirmActionProps) => {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const id = useId();

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus({ preventScroll: true });
      // The confirm step is taller than the trigger and usually sits at the end of a scrolling
      // modal: bring both buttons into view, or the last step opens below the fold.
      const reduced =
        typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      groupRef.current?.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    }
    else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [confirming]);

  const run = async () => {
    setRunning(true);
    try {
      await onConfirm();
    } finally {
      setRunning(false);
    }
  };

  if (!confirming) {
    return (
      <ModalButton
        ref={triggerRef}
        variant={variant}
        size="sm"
        icon={icon}
        busy={busy || running}
        data-testid={testId}
        onClick={() => (immediate ? void run() : setConfirming(true))}
        className="self-start"
      >
        {label}
      </ModalButton>
    );
  }

  return (
    <div ref={groupRef} role="group" aria-labelledby={`${id}-msg`} className="flex flex-col gap-3">
      <p id={`${id}-msg`} aria-live="polite" className="font-sans text-p5 font-semibold leading-snug text-tt-cream">
        {message}
      </p>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <ModalButton
          ref={cancelRef}
          variant="secondary"
          size="sm"
          data-testid={cancelTestId}
          onClick={() => {
            returnFocus.current = true;
            setConfirming(false);
            onCancel?.();
          }}
        >
          {cancelLabel}
        </ModalButton>
        <ModalButton
          variant="danger-solid"
          size="sm"
          busy={busy || running}
          data-testid={confirmTestId}
          onClick={() => void run()}
        >
          {confirmLabel}
        </ModalButton>
      </div>
    </div>
  );
};

export default DangerZone;
