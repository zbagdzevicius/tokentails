import { QUEST_API } from "@/api/quest-api";
import { useQuery } from "@tanstack/react-query";
import {
  User,
  useLaunchParams,
  useRawInitData,
  useSignal,
  initData,
  openLink,
  openTelegramLink,
  shareURL,
  initDataHash,
  initDataQueryId,
  initDataChatType,
  initDataChatInstance,
  initDataAuthDate,
  initDataStartParam,
  initDataCanSendAfterDate,
  initDataUser,
} from "@telegram-apps/sdk-react";
import * as React from "react";
import { useCallback, useEffect } from "react";
import { useProfile } from "./ProfileContext";
import { useToast } from "./ToastContext";
import { USER_API } from "@/api/user-api";

interface ITelegramUserData {
  raw: string;
  authDate: Date;
  canSendAfterDate: Date | undefined;
  hash: string;
  chatType: string | undefined;
  queryId: string | undefined;
  startParam: string | undefined;
  chatInstance: string | undefined;
  user: User;
}

type ContextState = {
  user?: ITelegramUserData | null;
  redeemLives: () => void;
};

const TelegramAuthContext = React.createContext<ContextState | undefined>(
  undefined
);

const TelegramAuthProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const launchParams = useLaunchParams(true);
  const parsedInitData = useSignal(initData.state);
  const rawInitData = useRawInitData();
  const hash = useSignal(initDataHash);
  const queryId = useSignal(initDataQueryId);
  const chatType = useSignal(initDataChatType);
  const chatInstance = useSignal(initDataChatInstance);
  const authDate = useSignal(initDataAuthDate);
  const startParam = useSignal(initDataStartParam);
  const canSendAfterDate = useSignal(initDataCanSendAfterDate);
  const user = useSignal(initDataUser);
  const { setUtils } = useProfile();
  const toast = useToast();

  useEffect(() => {
    setUtils({
      openLink: (url: string, options?: any) => {
        openLink(url, options);
      },
      openTelegramLink: (url: string) => {
        openTelegramLink(url);
      },
      shareURL: (url: string, text?: string) => {
        shareURL(url, text);
      },
    });
  }, [setUtils]);

  const telegramUserData = React.useMemo<ITelegramUserData | null>(() => {
    if (!parsedInitData || !rawInitData || !user) {
      return null;
    }

    sessionStorage.setItem("accesstoken", rawInitData);

    return {
      raw: rawInitData,
      authDate: authDate!,
      canSendAfterDate,
      hash: hash!,
      chatType,
      queryId,
      startParam,
      chatInstance,
      user: user!,
    };
  }, [
    parsedInitData,
    rawInitData,
    hash,
    queryId,
    chatType,
    chatInstance,
    authDate,
    startParam,
    canSendAfterDate,
    user,
  ]);

  const { setProfile, setShareUrl } = useProfile();
  const { data: profileResponse, refetch: refetchProfile } = useQuery({
    queryKey: ["t-profile-details", telegramUserData?.raw],
    queryFn: () => (telegramUserData?.raw ? USER_API.profile() : null),
  });
  const redeemLives = useCallback(async () => {
    await USER_API.redeem();
    refetchProfile();
    toast({ message: "Come back tomorrow for More !" });
  }, [refetchProfile, toast]);
  useEffect(() => {
    if (profileResponse) {
      setProfile(profileResponse);
    }
  }, [profileResponse, setProfile]);
  useEffect(() => {
    if (telegramUserData?.startParam && profileResponse) {
      QUEST_API.setReferralTelegram(telegramUserData?.startParam);
      setShareUrl(
        `https://t.me/CatbassadorsBot/app?startapp=${telegramUserData?.user.id}&startApp=${telegramUserData?.user.id}`
      );
    }
  }, [telegramUserData?.startParam, profileResponse, setShareUrl]);

  const value = {
    user: telegramUserData,
    redeemLives,
  };

  return (
    <TelegramAuthContext.Provider value={value}>
      {children}
    </TelegramAuthContext.Provider>
  );
};

function useTelegramAuth() {
  const context = React.useContext(TelegramAuthContext);

  if (context === undefined) {
    throw new Error(
      "useTelegramAuth must be used within a TelegramAuthProvider"
    );
  }
  return {
    user: context.user,
    redeemLives: context.redeemLives,
  };
}

export { TelegramAuthProvider, useTelegramAuth };
