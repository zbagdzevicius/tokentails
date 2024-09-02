import { Profile } from "@/components/shared/Profile";
import { getLeaderboardPosition } from "@/constants/api";
import { IProfile } from "@/models/profile";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useCallback } from "react";

type ContextState = {
  profile?: IProfile | null;
  position?: number | null;
  setProfile: (profile: IProfile | null) => void;
  setProfileUpdate: (profile: Partial<IProfile>) => void;
  isProfileModalDisplayed: boolean;
  setIsProfileModalDisplayed: (isDisplayed: boolean) => void;
};

const ProfileContext = React.createContext<ContextState | undefined>(undefined);

const ProfileProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [profile, setProfile] = React.useState<IProfile | null | undefined>(
    null
  );
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
  };

  return (
    <ProfileContext.Provider value={value}>
      {isProfileModalDisplayed && (
        <Profile close={() => setIsProfileModalDisplayed(false)} />
      )}
      {children}
    </ProfileContext.Provider>
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
    setProfile: context.setProfile,
    setProfileUpdate: context.setProfileUpdate,
    showProfilePopup,
  };
}

export { ProfileProvider, useProfile };
