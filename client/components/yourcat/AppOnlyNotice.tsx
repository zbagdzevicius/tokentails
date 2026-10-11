import { useToast } from "@/context/ToastContext";
import Link from "next/link";
import { forwardRef } from "react";
import { S1, S3, STATUS_COPY } from "./copy";
import { copyShareText } from "./share";
import { BODY, EYEBROW, GHOST_BUTTON, GOLD_BUTTON, ScreenHeading } from "./ui";

/**
 * The app build (`isApp`): no upload and no prices (store rules, docs/CLIENT.md; App Check has no
 * native token; the app privacy labels do not cover photo upload). It points to the web page, and
 * its main action is the game itself, which works here.
 */
export const AppOnlyNotice = forwardRef<HTMLHeadingElement>((_props, ref) => {
  const toast = useToast();
  return (
    <div className="flex flex-col items-center gap-4 text-center" data-testid="yourcat-app-notice">
      <p className={EYEBROW}>{S1.eyebrow}</p>
      <ScreenHeading ref={ref}>{STATUS_COPY.appTitle}</ScreenHeading>
      <p className={BODY}>{STATUS_COPY.appBody}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/game" className={GOLD_BUTTON}>
          {STATUS_COPY.playNow}
        </Link>
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
    </div>
  );
});
