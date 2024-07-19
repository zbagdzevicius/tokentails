import { TelegramProfile } from "@/components/shared/TelegramProfile";
import {
  TGetLeaderboardPosition,
  TGetProfile,
  TPostReferral,
  TRedeemLives,
} from "@/constants/telegram-api";
import { IProfile } from "@/models/profile";
import { useQuery } from "@tanstack/react-query";
import { User, useInitData, useLaunchParams } from "@telegram-apps/sdk-react";
import * as React from "react";
import { useCallback, useEffect } from "react";
import { useToast } from "./ToastContext";

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
  profile?: IProfile | null;
  position?: number | null;
  refetchProfile: () => void;
  redeemLives: () => void;
  setProfile: (profile: IProfile | null) => void;
  isProfileModalDisplayed: boolean;
  setIsProfileModalDisplayed: (isDisplayed: boolean) => void;
};

const TelegramAuthContext = React.createContext<ContextState | undefined>(
  undefined
);

const TelegramAuthProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const launchParams = useLaunchParams(true);
  const initData = useInitData(true);
  const [profile, setProfile] = React.useState<IProfile | null | undefined>(
    null
  );
  const toast = useToast();
  const [isProfileModalDisplayed, setIsProfileModalDisplayed] =
    React.useState(false);

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

  const { data: profileResponse, refetch: refetchProfile } = useQuery({
    queryKey: ["t-profile-details", telegramUserData?.raw],
    queryFn: () => (telegramUserData?.raw ? TGetProfile() : null),
  });
  const redeemLives = useCallback(async () => {
    await TRedeemLives();
    refetchProfile();
  }, []);
  const { data: position } = useQuery({
    queryKey: ["t-profile-position", profileResponse],
    queryFn: () => (profileResponse ? TGetLeaderboardPosition() : null),
  });
  useEffect(() => {
    setProfile(profileResponse);
  }, [profileResponse]);
  useEffect(() => {
    if (telegramUserData?.startParam && profileResponse) {
      TPostReferral(telegramUserData?.startParam);
    }
  }, [telegramUserData?.startParam, profileResponse]);

  const value = {
    user: telegramUserData,
    profile,
    setProfile,
    position,
    redeemLives,
    isProfileModalDisplayed,
    setIsProfileModalDisplayed,
    refetchProfile,
  };

  return (
    <TelegramAuthContext.Provider value={value}>
      {isProfileModalDisplayed && (
        <TelegramProfile close={() => setIsProfileModalDisplayed(false)} />
      )}
      {children}
    </TelegramAuthContext.Provider>
  );
};

function useTelegramAuth() {
  const context = React.useContext(TelegramAuthContext);

  const showProfilePopup = useCallback(() => {
    if (context?.user) {
      context?.setIsProfileModalDisplayed(true);
    }
  }, [context]);
  if (context === undefined) {
    throw new Error(
      "useTelegramAuth must be used within a TelegramAuthProvider"
    );
  }
  return {
    user: context.user,
    profile: context.profile,
    position: context.position,
    redeemLives: context.redeemLives,
    setProfile: context.setProfile,
    refetchProfile: context.refetchProfile,
    showProfilePopup,
  };
}

export { TelegramAuthProvider, useTelegramAuth };
