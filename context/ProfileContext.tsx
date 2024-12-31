import { getLeaderboardPosition } from "@/constants/api";
import { IProfile } from "@/models/profile";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useCallback } from "react";

export interface IUtils {
  openLink: (url: string, options?: any) => void;
  openTelegramLink: (url: string) => void;
  shareURL: (url: string, text?: string) => void;
}

type ContextState = {
  profile?: IProfile | null;
  position?: number | null;
  shareUrl?: string;
  isFB?: boolean;
  setIsFB?: (isFB: boolean) => void;
  setShareUrl: (url: string) => void;
  logout: () => void;
  setLogout: (logout: () => void) => void;
  setProfile: (profile: IProfile | null) => void;
  setProfileUpdate: (profile: Partial<IProfile>) => void;
  isProfileModalDisplayed: boolean;
  setIsProfileModalDisplayed: (isDisplayed: boolean) => void;
  setUtils: (utils: IUtils) => void;
  utils: IUtils | null;
};

const ProfileContext = React.createContext<ContextState | undefined>(undefined);

const ProfileProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [profile, setProfile] = React.useState<IProfile | null | undefined>(
    null
  );
  const [shareUrl, setShareUrl] = React.useState<string>(
    "https://tokentails.com"
  );
  const [isFB, setIsFB] = React.useState<boolean>(false);
  const [utils, setUtils] = React.useState<IUtils | null>(null);
  const [logout, setLogout] = React.useState<() => void>(() => {});
  const [isProfileModalDisplayed, setIsProfileModalDisplayed] =
    React.useState(false);

  const { data: position } = useQuery({
    queryKey: ["profile-details", profile],
    queryFn: () => (profile ? getLeaderboardPosition() : null),
  });

  const setProfileUpdate = (update: Partial<IProfile>) => {
    if (profile) {
      setProfile({ ...profile, ...update });
    }
  };

  const value = {
    profile,
    setProfile,
    setProfileUpdate,
    position,
    isProfileModalDisplayed,
    setIsProfileModalDisplayed,
    utils,
    setUtils,
    shareUrl,
    setShareUrl,
    logout,
    setLogout,
    isFB,
    setIsFB,
  };

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
};

function useProfile() {
  const context = React.useContext(ProfileContext);
  const showProfilePopup = useCallback(() => {
    if (context?.profile) {
      context?.setIsProfileModalDisplayed(true);
    }
  }, [context]);
  if (context === undefined) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return {
    profile: context.profile,
    position: context.position,
    utils: context.utils,
    shareUrl: context.shareUrl,
    isFB: context.isFB,
    setIsFB: context.setIsFB,
    logout: context.logout,
    setLogout: context.setLogout,
    setShareUrl: context.setShareUrl,
    setUtils: context.setUtils,
    setProfile: context.setProfile,
    setProfileUpdate: context.setProfileUpdate,
    showProfilePopup,
  };
}

export { ProfileProvider, useProfile };
