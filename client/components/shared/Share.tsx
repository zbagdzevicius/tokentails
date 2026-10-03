import { PixelIcon } from "@/components/shared/PixelIcon";
import { webPath } from "@/api/routing";
import { useToast } from "@/context/ToastContext";
import { FacebookMessengerShareButton, FacebookShareButton } from "next-share";
import { PropsWithChildren, useCallback, useMemo } from "react";

interface IProps {
  url: string;
}

const SharedButtonWrapper = ({ children }: PropsWithChildren) => {
  return (
    <span className="flex px-4 py-2 hover:bg-gray-100 gap-2 items-center text-p3">
      {children}
    </span>
  );
};

export const Share = ({ url }: IProps) => {
  const toast = useToast();
  const absoluteUrl = useMemo(
    () => process.env.NEXT_PUBLIC_DOMAIN + webPath(url),
    [url]
  );

  const copy = useCallback(() => {
    navigator.clipboard.writeText(absoluteUrl);
    toast({ message: "Link has been coppied to your clipboard" });
  }, [absoluteUrl, toast]);

  return (
    <div className="z-50 overflow-hidden rem:top-[38px] absolute hidden group-hover:md:flex bg-white rounded-lg shadow w-full text-yellow-900 flex-col">
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
        className="bg-accent"
        url={absoluteUrl}
        appId="722737458784658"
      >
        <SharedButtonWrapper>
          <PixelIcon name="messenger" className="text-h6" />
          <div>Messenger</div>
        </SharedButtonWrapper>
      </FacebookMessengerShareButton>
      <div aria-label="copy link" className="cursor-pointer" onClick={copy}>
        <SharedButtonWrapper>
          <PixelIcon name="copy" className="text-h6" />
          <div>Copy a link</div>
        </SharedButtonWrapper>
      </div>
    </div>
  );
};
