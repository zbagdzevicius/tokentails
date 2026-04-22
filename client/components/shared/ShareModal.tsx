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
import { urlPrefix } from "@/api/routing";

interface IProps {
  url: string;
  close: () => void;
}

const SharedButtonWrapper = ({ children }: PropsWithChildren<{}>) => {
  return (
    <span className="flex px-6 py-2 hover:bg-gray-100 gap-4 items-center text-p3">
      {children}
    </span>
  );
};

export const ShareModal = ({ url, close }: IProps) => {
  const toast = useToast();
  const [isClipboardAllowed, setIsClipboardAllowed] = useState(false);
  const absoluteUrl = useMemo(
    () => process.env.NEXT_PUBLIC_DOMAIN + url.replace(urlPrefix, ""),
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
      setIsClipboardAllowed(true);
    } else {
      navigator.permissions
        .query({ name: "clipboard-write" as PermissionName })
        .then((permissionStatus) => {
          if (permissionStatus.state === "granted") {
            setIsClipboardAllowed(true);
          } else {
            console.error("Clipboard write permission denied.");
            close();
          }
        });
    }
  }, []);

  return (
    <div className="fixed inset-0 w-full z-50 flex justify-center h-full md:hidden">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-white/75 md:backdrop-blur-md animate-in fade-in duration-300"
      ></div>
      <div className="z-50 w-full md:w-[480px] max-w-full bg-white absolute bottom-0 md:rounded-t-[22px] overflow-hidden shadow h-fit flex flex-col pb-8 pt-6 md:border-4 border-yellow-300 glow-box">
        <FacebookShareButton
          url={absoluteUrl}
          hashtag={process.env.NEXT_PUBLIC_SITE_NAME}
        >
          <SharedButtonWrapper>
            <i className="bx bxl-facebook-circle text-h6"></i>
            <div>Facebook</div>
          </SharedButtonWrapper>
        </FacebookShareButton>
        <FacebookMessengerShareButton
          className="bg-accent"
          url={absoluteUrl}
          appId="722737458784658"
        >
          <SharedButtonWrapper>
            <i className="bx bxl-messenger text-h6"></i>
            <div>Messenger</div>
          </SharedButtonWrapper>
        </FacebookMessengerShareButton>
        {isClipboardAllowed && (
          <div aria-label="copy link" className="cursor-pointer" onClick={copy}>
            <SharedButtonWrapper>
              <i className="bx bxs-copy text-h6"></i>
              <div>Copy a link</div>
            </SharedButtonWrapper>
          </div>
        )}
        <div className="pb-safe"></div>
        <button onClick={close} className="absolute right-3 top-2 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
