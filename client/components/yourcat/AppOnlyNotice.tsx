import { useToast } from "@/context/ToastContext";
import { forwardRef } from "react";
import { S1, S3, STATUS_COPY } from "./copy";
import { copyShareText } from "./share";
import { BODY, EYEBROW, GHOST_BUTTON, ScreenHeading } from "./ui";

/**
 * The app build (`isApp`): no upload and no prices (store rules, docs/CLIENT.md; App Check has no
 * native token; the app privacy labels do not cover photo upload). It points to the web page.
 */
export const AppOnlyNotice = forwardRef<HTMLHeadingElement>((_props, ref) => {
  const toast = useToast();
  return (
    <div className="flex flex-col items-center gap-4 text-center" data-testid="yourcat-app-notice">
      <p className={EYEBROW}>{S1.eyebrow}</p>
      <ScreenHeading ref={ref}>{S1.title}</ScreenHeading>
      <p className={BODY}>{STATUS_COPY.appBody}</p>
      <button
        type="button"
        className={GHOST_BUTTON}
        onClick={async () => {
          if ((await copyShareText(STATUS_COPY.appLink)) === "copy-link") toast({ message: S3.copied });
        }}
      >
        {STATUS_COPY.copyLink}
      </button>
    </div>
  );
});
