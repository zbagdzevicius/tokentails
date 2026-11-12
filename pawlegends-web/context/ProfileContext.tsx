import { IProfile } from "@/models/profile";
import * as React from "react";
import { useCallback } from "react";

export interface IUtils {
  openLink: (url: string) => void;
  shareURL: (url: string, text?: string) => void;
}

type ContextState = {
  profile?: IProfile | null;
  isFB?: boolean;
  setIsFB?: (isFB: boolean) => void;
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

/**
 * The signed-in (or guest) profile, filled by FirebaseAuthContext. Paw Legends reads no leaderboard positions and
 * has no referral program, so this is only the profile and its helpers.
 */
const ProfileProvider = ({ children }: React.PropsWithChildren) => {
  const [profile, setProfile] = React.useState<IProfile | null | undefined>(null);
  const [isFB, setIsFB] = React.useState<boolean>(false);
  const [utils, setUtils] = React.useState<IUtils | null>(null);
  const [logout, setLogout] = React.useState<() => void>(() => {});
  const [isProfileModalDisplayed, setIsProfileModalDisplayed] = React.useState(false);

  const setProfileUpdate = (update: Partial<IProfile>) => {
    if (profile) {
      setProfile({ ...profile, ...update });
    }
  };

  const value = {
    profile,
    setProfile,
    setProfileUpdate,
    isProfileModalDisplayed,
    setIsProfileModalDisplayed,
    utils,
    setUtils,
    logout,
    setLogout,
    isFB,
    setIsFB,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
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
    utils: context.utils,
    isFB: context.isFB,
    setIsFB: context.setIsFB,
    logout: context.logout,
    setLogout: context.setLogout,
    setUtils: context.setUtils,
    setProfile: context.setProfile,
    setProfileUpdate: context.setProfileUpdate,
    showProfilePopup,
  };
}

export { ProfileProvider, useProfile };
