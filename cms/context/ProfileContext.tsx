import * as React from 'react';
import { useCallback } from 'react';
import { IProfile } from '../models/profile';
import { useToast } from './ToastContext';

export interface IUtils {
  openLink: (url: string, options?: any) => void;
  openTelegramLink: (url: string) => void;
  shareURL: (url: string, text?: string) => void;
}

type ContextState = {
  profile?: IProfile | null;
  setProfile: (profile: IProfile | null) => void;
  setProfileUpdate: (profile: Partial<IProfile>) => void;
  isProfileModalDisplayed: boolean;
  setIsProfileModalDisplayed: (isDisplayed: boolean) => void;
  setUtils: (utils: IUtils) => void;
  utils: IUtils | null;
  copy: (text: string) => void;
};

const ProfileContext = React.createContext<ContextState | undefined>(undefined);

const ProfileProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [profile, setProfile] = React.useState<IProfile | null | undefined>(
    null
  );
  const toast = useToast();
  const [utils, setUtils] = React.useState<IUtils | null>(null);
  const [isProfileModalDisplayed, setIsProfileModalDisplayed] =
    React.useState(false);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          toast({ message: 'Invite link is coppied to your clipboard' });
        })
        .catch((err) => {
          throw err;
        });
    },
    [toast]
  );

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
    copy
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
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return {
    profile: context.profile,
    utils: context.utils,
    setUtils: context.setUtils,
    setProfile: context.setProfile,
    setProfileUpdate: context.setProfileUpdate,
    copy: context.copy,
    showProfilePopup
  };
}

export { ProfileProvider, useProfile };
