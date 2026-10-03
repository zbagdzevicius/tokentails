import { PixelIcon } from "@/components/shared/PixelIcon";
import { Capacitor } from "@capacitor/core";
import { useToast } from "@/context/ToastContext";
import { FacebookMessengerShareButton, FacebookShareButton } from "next-share";
import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Clipboard } from "@capacitor/clipboard";
import { webPath } from "@/api/routing";
import { GameModal } from "@/components/ui/GameModal";

/** The share sheet is the phone UI; from `md` up the Share hover menu covers it. */
const PHONE_QUERY = "(max-width: 767px)";

interface IProps {
  url: string;
  close: () => void;
}

const SharedButtonWrapper = ({ children }: PropsWithChildren) => {
  return (
    <span className="flex min-h-[44px] w-full px-4 py-2 hover:bg-tt-night-600 gap-4 items-center text-p3 text-tt-cream rounded-[4px]">
      {children}
    </span>
  );
};

export const ShareModal = ({ url, close }: IProps) => {
  const toast = useToast();
  const [isClipboardAllowed, setIsClipboardAllowed] = useState(false);
  // null until mounted (SSR-safe). Wider screens never open the sheet (it was `md:hidden`).
  const [isPhone, setIsPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const phone = typeof window.matchMedia !== "function" || window.matchMedia(PHONE_QUERY).matches;
    // The viewport is read after mount to keep SSR output hydration-safe.
    setIsPhone(phone);
    if (!phone) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const absoluteUrl = useMemo(
    () => process.env.NEXT_PUBLIC_DOMAIN + webPath(url),
    [url]
  );

  const copy = useCallback(() => {
    if (Capacitor.isNativePlatform()) {
      Clipboard.write({
        string: absoluteUrl,
      })
        .then(() => {
          toast({ message: "Link coppied successfully" });
          close();
        })
        .catch((err) => {
          close();
          throw err;
        });
    } else {
      navigator.clipboard
        .writeText(absoluteUrl)
        .then(() => {
          toast({ message: "Link coppied successfully" });
          close();
        })
        .catch((err) => {
          close();
          throw err;
        });
    }
  }, [absoluteUrl, toast, close]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Platform must be read after mount to keep SSR output hydration-safe.
      setIsClipboardAllowed(true);
    } else {
      navigator.permissions
        .query({ name: "clipboard-write" as PermissionName })
        .then((permissionStatus) => {
          // Without the permission the sheet still offers the other ways to share; it used to
          // close the whole sheet (and Safari, which rejects this query, threw).
          setIsClipboardAllowed(permissionStatus.state === "granted");
        })
        .catch(() => setIsClipboardAllowed(false));
    }
  }, []);

  if (!isPhone) return null;

  return (
    <GameModal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="SHARE"
      name="share"
      surface="sheet"
      size="sm"
      suspendGame={false}
    >
      <div className="flex flex-col pb-2">
        <FacebookShareButton
          url={absoluteUrl}
          hashtag={process.env.NEXT_PUBLIC_SITE_NAME}
        >
          <SharedButtonWrapper>
            <PixelIcon name="facebook" className="text-h6" />
            <div>Facebook</div>
          </SharedButtonWrapper>
        </FacebookShareButton>
        <FacebookMessengerShareButton
          url={absoluteUrl}
          appId="722737458784658"
        >
          <SharedButtonWrapper>
            <PixelIcon name="messenger" className="text-h6" />
            <div>Messenger</div>
          </SharedButtonWrapper>
        </FacebookMessengerShareButton>
        {isClipboardAllowed && (
          <button type="button" className="cursor-pointer text-left" onClick={copy}>
            <SharedButtonWrapper>
              <PixelIcon name="copy" className="text-h6" />
              <div>Copy a link</div>
            </SharedButtonWrapper>
          </button>
        )}
      </div>
    </GameModal>
  );
};
