import { profileFetch } from "@/constants/api";
import { TPostReferral, TRedeemLives } from "@/constants/telegram-api";
import { useQuery } from "@tanstack/react-query";
import {
  User,
  useInitData,
  useLaunchParams,
  useUtils,
} from "@telegram-apps/sdk-react";
import * as React from "react";
import { useCallback, useEffect } from "react";
import { useProfile } from "./ProfileContext";

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
  const initData = useInitData(true);
  const { setUtils } = useProfile();

  const utils = useUtils(true);

  utils?.openLink;
  useEffect(() => {
    if (utils) {
      setUtils(utils);
    }
  }, [utils]);

  const telegramUserData = React.useMemo<ITelegramUserData | null>(() => {
    if (!initData || !launchParams?.initDataRaw) {
      return null;
    }

    sessionStorage.setItem("accesstoken", launchParams.initDataRaw);

    const {
      hash,
      queryId,
      chatType,
      chatInstance,
      authDate,
      startParam,
      canSendAfterDate,
      user,
    } = initData;
    return {
      raw: launchParams.initDataRaw!,
      authDate,
      canSendAfterDate,
      hash,
      chatType,
      queryId,
      startParam,
      chatInstance,
      user: user!,
    };
  }, [initData, launchParams]);

  const { setProfile } = useProfile();
  const { data: profileResponse, refetch: refetchProfile } = useQuery({
    queryKey: ["t-profile-details", telegramUserData?.raw],
    queryFn: () => (telegramUserData?.raw ? profileFetch() : null),
  });
  const redeemLives = useCallback(async () => {
    await TRedeemLives();
    refetchProfile();
  }, []);
  useEffect(() => {
    if (profileResponse) {
      setProfile(profileResponse);
    }
  }, [profileResponse]);
  useEffect(() => {
    if (telegramUserData?.startParam && profileResponse) {
      TPostReferral(telegramUserData?.startParam);
    }
  }, [telegramUserData?.startParam, profileResponse]);

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
