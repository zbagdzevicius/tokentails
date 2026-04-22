import { useQuery } from '@tanstack/react-query';
import { initializeApp } from 'firebase/app';
import {
  User as FirebaseUser,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import * as React from 'react';
import { useCallback } from 'react';
import { SignIn } from '../components/SignIn';
import { useProfile } from './ProfileContext';
import { USER_API } from '@/api/user-api';

let reauthInterval: any;
const firebaseConfig = {
  apiKey: 'AIzaSyCfitm6sU-lOunY3JpGdn8D4Ng7Dz5m3yk',
  authDomain: 'news-ccd33.firebaseapp.com',
  projectId: 'news-ccd33',
  storageBucket: 'news-ccd33.appspot.com',
  messagingSenderId: '158850509760',
  appId: '1:158850509760:web:446ea8a11bdddeb616f625'
};

const app = initializeApp(firebaseConfig);
const getFirebaseAuth = () => {
  return getAuth(app);
};
const auth = getFirebaseAuth();

const googleAuth = new GoogleAuthProvider();
const appleAuth = new OAuthProvider('apple.com');

const providers = {
  google: googleAuth,
  apple: appleAuth
};

type User = FirebaseUser | null;
type ContextState = {
  user: User;
  isLoginModalDisplayed: boolean;
  setIsLoginModalDisplayed: (isDisplayed: boolean) => void;
  isVerifiedModalDisplayed: boolean;
  setIsVerifiedModalDisplayed: (isDisplayed: boolean) => void;
};

const FirebaseAuthContext = React.createContext<ContextState | undefined>(
  undefined
);

const FirebaseAuthProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [user, setUser] = React.useState<User>(null);
  const [isLoginModalDisplayed, setIsLoginModalDisplayed] =
    React.useState(true);
  const [isVerifiedModalDisplayed, setIsVerifiedModalDisplayed] =
    React.useState(false);
  const { setProfile, setUtils } = useProfile();

  const { data: profileResponse, refetch: refetchProfile } = useQuery({
    queryKey: ['profile-details', user],
    queryFn: () => (user ? USER_API.profileFetch() : null)
  });

  React.useEffect(() => {
    if (!!profileResponse?.name) {
      setIsLoginModalDisplayed(false);
    }
  }, [profileResponse]);

  React.useEffect(() => {
    if (profileResponse) {
      setProfile(profileResponse);
    }
  }, [profileResponse]);
  const onUserChange = useCallback(
    async (u: User) => {
      if (!u) {
        setUser(null);
        setProfile(null);
        sessionStorage.removeItem('accesstoken');
      } else {
        await u.getIdToken(true).then((token) => {
          sessionStorage.setItem('accesstoken', `fb${token}`);
          setIsLoginModalDisplayed(false);
          setUser(u);
        });

        if (reauthInterval) {
          clearInterval(reauthInterval);
        }
        reauthInterval = setInterval(
          async () => {
            if (auth.currentUser) {
              try {
                const refreshedToken = await auth.currentUser.getIdToken(true);
                console.log('Firebase token refreshed:', refreshedToken);
              } catch (error) {
                console.error('Error refreshing token:', error);
              }
            }
          },
          29 * 60 * 1000
        );
      }
    },
    [setIsLoginModalDisplayed, setIsVerifiedModalDisplayed]
  );
  const value = {
    user,
    isLoginModalDisplayed,
    setIsLoginModalDisplayed,
    isVerifiedModalDisplayed,
    setIsVerifiedModalDisplayed,
    refetchProfile
  };

  React.useEffect(() => {
    onAuthStateChanged(auth, onUserChange);
  }, []);

  return (
    <FirebaseAuthContext.Provider value={value}>
      {isLoginModalDisplayed ? <SignIn close={() => {}} /> : children}
    </FirebaseAuthContext.Provider>
  );
};

function useFirebaseAuth() {
  const context = React.useContext(FirebaseAuthContext);
  const signIn = useCallback(
    (provider: 'google' | 'apple' | string, password?: string) => {
      if (password) {
        signInWithEmailAndPassword(auth, provider, password).catch((error) => {
          const code = error?.code;
          const isUserNotFound = code === 'auth/user-not-found';
          return isUserNotFound
            ? createUserWithEmailAndPassword(auth, provider, password)
            : null;
        });
        return;
      }
      signInWithPopup(auth, providers[provider as keyof typeof providers]);
    },
    []
  );
  const logout = useCallback(() => {
    signOut(auth);
  }, []);
  const showSignInPopup = useCallback(() => {
    if (!context?.user) {
      context?.setIsVerifiedModalDisplayed(false);
      context?.setIsLoginModalDisplayed(true);
    }
  }, [context]);
  if (context === undefined) {
    throw new Error(
      'useFirebaseAuth must be used within a FirebaseAuthProvider'
    );
  }
  return {
    user: context.user,
    signIn,
    logout,
    showSignInPopup
  };
}

export { FirebaseAuthProvider, useFirebaseAuth };
