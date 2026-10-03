import { useState, type ReactNode } from "react";
import { CrashPanel } from "./CrashPanel";
import { FALLBACK_COPY } from "./copy";
import { CrashProbe, markCrashRecovered } from "./crash-probe";
import { ErrorBoundary } from "./ErrorBoundary";

interface ModalBoundaryProps {
  children?: ReactNode;
  /** Stable modal name for telemetry, e.g. `profile`, `wheel`. */
  name: string;
  /** Shows CLOSE in the fallback. Without it only TRY AGAIN is offered. */
  onClose?: () => void;
}

/**
 * Isolates one modal's content (F3, F9): a crash inside it shows the
 * fallback inside the modal frame while the game behind keeps running.
 * TRY AGAIN remounts the content.
 */
export const ModalBoundary = ({ children, name, onClose }: ModalBoundaryProps) => {
  const [attempt, setAttempt] = useState(0);

  return (
    <ErrorBoundary
      name={name}
      level="modal"
      onReset={() => markCrashRecovered("modal")}
      fallback={({ reset }) => (
        <CrashPanel
          variant="inline"
          testId="modal-fallback"
          body={FALLBACK_COPY.modal}
          actions={[
            {
              label: FALLBACK_COPY.tryAgain,
              primary: !onClose,
              testId: "modal-fallback-retry",
              onClick: () => {
                setAttempt((n) => n + 1);
                reset();
              },
            },
            ...(onClose
              ? [
                  {
                    label: FALLBACK_COPY.close,
                    primary: true,
                    testId: "modal-fallback-close",
                    onClick: onClose,
                  },
                ]
              : []),
          ]}
        />
      )}
    >
      <CrashProbe target="modal" />
      <ModalAttempt key={attempt}>{children}</ModalAttempt>
    </ErrorBoundary>
  );
};

const ModalAttempt = ({ children }: { children?: ReactNode }) => <>{children}</>;

export default ModalBoundary;
