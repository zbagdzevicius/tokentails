import { Toast } from "@/components/shared/Toast";
import * as React from "react";
import { useCallback } from "react";

type ContextState = {
  setToast: (toast: IToastMessage) => void;
};

export type ICollectibleProperty = "tails";

export interface IToastMessage {
  message?: string;
  isError?: boolean;
  symbol?: ICollectibleProperty;
  img?: string;
}

/**
 * In-game notification banner (`Notification.tsx`, fed by GameContext), which
 * shares the toast fields and adds an image. Toasts themselves take
 * `IToastMessage`; their old `icon` prop was never rendered (plan F3.6).
 */
export interface IToast extends IToastMessage {
  icon?: string;
}

export const TOAST_DURATION_MS = 2500;

const ToastContext = React.createContext<ContextState | undefined>(undefined);

/**
 * Holding (plan F3.3, G9): while the AuthSheet is open no toast renders. Toasts fired meanwhile
 * stay queued and their text is shown in the sheet's single `role="alert"` region. When the hold
 * ends, the toasts the sheet already showed are dropped; only the ones it never displayed (for
 * example one fired in the same tick the sheet closed) play afterwards, so nothing is shown twice.
 * A separate context, so the toast function above stays stable while the queue changes.
 */
type HoldState = {
  /**
   * Starts a hold; call the returned function to end it, passing the toasts the holder already
   * displayed so they are not played again. Holds nest.
   */
  hold: () => (shown?: ReadonlySet<IToastMessage>) => void;
  /** Toasts waiting while held, oldest first. Empty when not held. */
  held: IToastMessage[];
};

const ToastHoldContext = React.createContext<HoldState | undefined>(undefined);

const ToastProvider = ({ children }: React.PropsWithChildren) => {
  const [currentToast, setCurrentToast] =
    React.useState<IToastMessage | null>(null);
  const [toastQueue, setToastQueue] = React.useState<IToastMessage[]>([]);
  const [holds, setHolds] = React.useState(0);
  const isHeld = holds > 0;

  const setToast = React.useCallback((toast: IToastMessage) => {
    setToastQueue((prevQueue) => [...prevQueue, toast]);
  }, []);

  // Stable across renders, so a caller that lists the toast function in an
  // effect's dependencies does not re-run that effect on every toast.
  const value = React.useMemo(() => ({ setToast }), [setToast]);

  const hold = React.useCallback(() => {
    setHolds((count) => count + 1);
    let released = false;
    return (shown?: ReadonlySet<IToastMessage>) => {
      if (released) return;
      released = true;
      if (shown && shown.size > 0) {
        setToastQueue((prevQueue) => prevQueue.filter((toast) => !shown.has(toast)));
      }
      setHolds((count) => Math.max(0, count - 1));
    };
  }, []);

  // A toast on screen when a hold starts goes back to the front of the queue,
  // so it is shown in the sheet's alert region (and dropped once shown there).
  React.useEffect(() => {
    if (isHeld && currentToast) {
      setToastQueue((prevQueue) => [currentToast, ...prevQueue]);
      setCurrentToast(null);
    }
  }, [isHeld, currentToast]);

  const holdValue = React.useMemo(
    () => ({ hold, held: isHeld ? toastQueue : [] }),
    [hold, isHeld, toastQueue]
  );

  React.useEffect(() => {
    if (!isHeld && toastQueue.length > 0 && !currentToast) {
      // Display the first toast in the queue
      setCurrentToast(toastQueue[0]);
      setToastQueue((prevQueue) => prevQueue.slice(1));
    }
  }, [toastQueue, currentToast, isHeld]);

  React.useEffect(() => {
    if (currentToast) {
      const timer = setTimeout(() => {
        setCurrentToast(null);
      }, TOAST_DURATION_MS);

      return () => clearTimeout(timer);
    }
  }, [currentToast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastHoldContext.Provider value={holdValue}>
        {currentToast && !isHeld && <Toast {...currentToast} />}
        {/* Always mounted so screen readers announce each new toast. aria-live
            regions are exempt from the aria-hidden a modal puts on the rest of
            the page, so the text is read even while sign-in is open. While the
            sheet holds toasts, its own alert region reads them instead. */}
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="toast-live-region"
        >
          {isHeld ? "" : currentToast?.message ?? ""}
        </div>
        {children}
      </ToastHoldContext.Provider>
    </ToastContext.Provider>
  );
};

function useToast() {
  const context = React.useContext(ToastContext);

  const showToast = useCallback(
    (toast: IToastMessage) => {
      context?.setToast(toast);
    },
    [context]
  );
  return showToast;
}

/**
 * Holds toasts while `active` (the AuthSheet passes its `open`). Returns the toasts waiting, so the
 * sheet can show their text in its alert region, and `markShown`, which the sheet calls with the
 * held toast its region displays: every toast marked shown is dropped when the hold ends instead
 * of playing a second time.
 */
function useToastHold(active: boolean): { held: IToastMessage[]; markShown: (toast: IToastMessage) => void } {
  const context = React.useContext(ToastHoldContext);
  const hold = context?.hold;
  const shownRef = React.useRef<Set<IToastMessage>>(new Set());
  const markShown = React.useCallback((toast: IToastMessage) => {
    shownRef.current.add(toast);
  }, []);

  React.useEffect(() => {
    if (!active || !hold) return;
    const release = hold();
    return () => {
      const shown = shownRef.current;
      shownRef.current = new Set();
      release(shown);
    };
  }, [active, hold]);
  return { held: active ? context?.held ?? [] : [], markShown };
}

export { ToastProvider, useToast, useToastHold };
