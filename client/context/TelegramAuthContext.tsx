"use client";

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

  // Try to get raw init data from launchParams as fallback
  const rawInitDataFromParams = React.useMemo(() => {
    if (rawInitData) return rawInitData;
    if (launchParams?.initData) return launchParams.initData;
    if (typeof window !== "undefined") {
      // Try to get from URL or window object as last resort
      const urlParams = new URLSearchParams(window.location.search);
      const initDataParam =
        urlParams.get("tgWebAppData") || urlParams.get("_auth");
      if (initDataParam) return decodeURIComponent(initDataParam);
    }
    return null;
  }, [rawInitData, launchParams]);

  // Debug: Log SDK state
  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("Telegram SDK State:", {
        hasLaunchParams: !!launchParams,
        launchParamsInitData: launchParams?.initData,
        hasParsedInitData: !!parsedInitData,
        hasRawInitData: !!rawInitData,
        rawInitDataValue: rawInitData,
        rawInitDataFromParams: rawInitDataFromParams,
        hasUser: !!user,
        hasHash: !!hash,
        hasAuthDate: !!authDate,
      });
    }
  }, [
    launchParams,
    parsedInitData,
    rawInitData,
    rawInitDataFromParams,
    user,
    hash,
    authDate,
  ]);

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
    // Use rawInitDataFromParams which includes fallbacks
    const effectiveRawInitData = rawInitDataFromParams;

    // Check if we have the minimum required data - we need rawInitData as a string
    if (!effectiveRawInitData || typeof effectiveRawInitData !== "string") {
      return null;
    }

    // If we don't have user yet, we can still create the data object with raw data
    // This allows the query to run even if user hasn't loaded yet
    if (!user) {
      // Still return data with raw init data so the query can run
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("accesstoken", effectiveRawInitData);
        } catch (e) {
          console.warn("Failed to set accesstoken in sessionStorage:", e);
        }
      }

      return {
        raw: effectiveRawInitData,
        authDate: authDate || new Date(),
        canSendAfterDate,
        hash: hash || "",
        chatType,
        queryId,
        startParam,
        chatInstance,
        user: {} as User, // Temporary empty user until it loads
      };
    }

    // hash and authDate might be optional in some cases, but let's be more lenient
    // Only require them if we're in a strict validation scenario
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("accesstoken", effectiveRawInitData);
      } catch (e) {
        console.warn("Failed to set accesstoken in sessionStorage:", e);
      }
    }

    return {
      raw: effectiveRawInitData,
      authDate: authDate || new Date(),
      canSendAfterDate,
      hash: hash || "",
      chatType,
      queryId,
      startParam,
      chatInstance,
      user,
    };
  }, [
    parsedInitData,
    rawInitDataFromParams,
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
  const {
    data: profileResponse,
    refetch: refetchProfile,
    error: profileError,
    isLoading: profileLoading,
  } = useQuery({
    queryKey: ["t-profile-details", telegramUserData?.raw],
    queryFn: async () => {
      if (!telegramUserData?.raw) {
        return null;
      }
      try {
        return await USER_API.profile();
      } catch (error) {
        console.error("Failed to fetch profile:", error);
        throw error;
      }
    },
    enabled: !!telegramUserData?.raw,
    retry: 1,
  });

  // Debug: Log query state
  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("Profile Query State:", {
        hasTelegramUserData: !!telegramUserData,
        hasRawData: !!telegramUserData?.raw,
        isEnabled: !!telegramUserData?.raw,
        isLoading: profileLoading,
        hasError: !!profileError,
        hasProfileResponse: !!profileResponse,
      });
    }
  }, [telegramUserData, profileLoading, profileError, profileResponse]);
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
