import { useToast } from "@/context/ToastContext";
import { forwardRef } from "react";
import { BODY, HEADLINE, NIGHT_PILL, PANEL, PrimaryAction } from "./brand";
import { S3, STATUS_COPY } from "./copy";
import { copyShareText } from "./share";

/**
 * The app build (`isApp`): no upload, no stage and no prices (store rules, docs/CLIENT.md; App Check
 * has no native token; the app privacy labels do not cover photo upload). In the landing language
 * (polish spec "App build"): the headline, then a panel that points to the web page, with the game
 * itself as the one primary action, since it works here.
 */
export const AppOnlyNotice = forwardRef<HTMLHeadingElement>((_props, ref) => {
  const toast = useToast();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 text-center" data-testid="yourcat-app-notice">
      <h1 ref={ref} tabIndex={-1} className={HEADLINE}>
        {STATUS_COPY.appTitle}
      </h1>
      <section className={`${PANEL} flex flex-col items-center gap-4`}>
        <p className={BODY}>{STATUS_COPY.appBody}</p>
        <PrimaryAction href="/game" text={STATUS_COPY.playNow} />
        <button
          type="button"
          className={NIGHT_PILL}
          onClick={async () => {
            if ((await copyShareText(STATUS_COPY.appLink)) === "copy-link") toast({ message: S3.copied });
          }}
        >
          {STATUS_COPY.copyLink}
        </button>
      </section>
    </div>
  );
});

AppOnlyNotice.displayName = "AppOnlyNotice";

