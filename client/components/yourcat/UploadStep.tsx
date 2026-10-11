import type { YourcatStatusView } from "@/models/yourcat";
import { forwardRef, useCallback, useRef, useState, type DragEvent } from "react";
import { s1Body, S1, STATUS_COPY } from "./copy";
import { PrivacyPanel } from "./PrivacyPanel";
import { ACCEPT_ATTRIBUTE } from "./prepareUpload";
import { ALERT, BODY, CAPTION, EYEBROW, FadeUp, GOLD_BUTTON, ScreenHeading, TEXT_LINK } from "./ui";

export interface UploadStepProps {
  status: YourcatStatusView | null;
  statusFailed: boolean;
  /** The identity or the visitor's record is still loading. */
  getting: boolean;
  fileError: string | null;
  onFile: (file: File, source: "picker" | "drop") => void;
  onManual: () => void;
}

/**
 * S1 "Hero and upload" with the states before upload (§1.0): loading, paused, budget spent. The
 * upload control is a real button that is also the drop zone; the file input has no `capture`.
 */
export const UploadStep = forwardRef<HTMLHeadingElement, UploadStepProps>(
  ({ status, statusFailed, getting, fileError, onFile, onManual }, ref) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [dragging, setDragging] = useState(false);
    const [privacyOpen, setPrivacyOpen] = useState(false);

    const loading = getting || (!status && !statusFailed);
    const paused = !!status && !status.enabled;
    const spent = !!status && status.enabled && !status.uploadsOpen;

    const onDrop = useCallback(
      (event: DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer?.files?.[0];
        if (file && !loading) onFile(file, "drop");
      },
      [loading, onFile],
    );

    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <FadeUp>
          <p className={EYEBROW}>{S1.eyebrow}</p>
        </FadeUp>
        <FadeUp delay={0}>
          <ScreenHeading ref={ref}>{S1.title}</ScreenHeading>
        </FadeUp>
        <FadeUp delay={60}>
          <p className={`${BODY} max-w-xl`}>{paused ? STATUS_COPY.disabled : s1Body()}</p>
        </FadeUp>

        {spent && (
          <div className="flex flex-col items-center gap-3">
            <p className={BODY} role="status">
              {STATUS_COPY.budgetSpent}
            </p>
            <button type="button" className={GOLD_BUTTON} onClick={onManual}>
              {STATUS_COPY.pickYourself}
            </button>
          </div>
        )}

        {!paused && !spent && (
          <div className="flex w-full max-w-md flex-col items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="yourcat-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onFile(file, "picker");
              }}
            />
            <button
              type="button"
              className={`${GOLD_BUTTON} w-full min-h-[88px] flex-col ${dragging ? "outline outline-4 outline-offset-4 outline-tt-cream" : ""}`}
              disabled={loading}
              aria-describedby="yourcat-confirm"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                if (!loading) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <span>{loading ? STATUS_COPY.loading : S1.choose}</span>
              {!loading && <span className="hidden font-sans text-p6 normal-case tracking-normal md:block">{S1.dropHint}</span>}
            </button>
            {fileError && (
              <p className={ALERT} role="alert">
                {fileError}
              </p>
            )}
            <p id="yourcat-confirm" className={CAPTION}>
              {S1.confirm}
            </p>
            <p className={CAPTION}>
              {S1.privacy}{" "}
              <button
                type="button"
                className={TEXT_LINK}
                aria-expanded={privacyOpen}
                aria-controls="yourcat-privacy"
                onClick={() => setPrivacyOpen((open) => !open)}
              >
                {S1.privacyLink}
              </button>
            </p>
            <PrivacyPanel open={privacyOpen} id="yourcat-privacy" />
          </div>
        )}
      </div>
    );
  },
);
