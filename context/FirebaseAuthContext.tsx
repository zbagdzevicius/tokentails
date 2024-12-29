import { SignIn } from "@/components/shared/SignIn";
import { Verify } from "@/components/shared/Verify";
import { profileFetch } from "@/constants/api";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { Capacitor } from "@capacitor/core";
import { useQuery } from "@tanstack/react-query";
import { initializeApp } from "firebase/app";
import {
  User as FirebaseUser,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import * as React from "react";
import { useCallback } from "react";
import { useProfile } from "./ProfileContext";
import { useToast } from "./ToastContext";
import { TPostReferral } from "@/constants/telegram-api";

let reauthInterval: any;

const firebaseConfig = {
  apiKey: "AIzaSyCfitm6sU-lOunY3JpGdn8D4Ng7Dz5m3yk",
  authDomain: "news-ccd33.firebaseapp.com",
  projectId: "news-ccd33",
  storageBucket: "news-ccd33.appspot.com",
  messagingSenderId: "158850509760",
  appId: "1:158850509760:web:446ea8a11bdddeb616f625",
};

const app = initializeApp(firebaseConfig);
const getFirebaseAuth = () => {
  if (Capacitor.isNativePlatform()) {
    return initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
    });
  } else {
    return getAuth(app);
  }
};
const auth = getFirebaseAuth();

const googleAuth = new GoogleAuthProvider();
const appleAuth = new OAuthProvider("apple.com");

const providers = {
  google: googleAuth,
  apple: appleAuth,
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
  const toast = useToast();
  const [isLoginModalDisplayed, setIsLoginModalDisplayed] =
    React.useState(true);
  const [isVerifiedModalDisplayed, setIsVerifiedModalDisplayed] =
    React.useState(false);
  const { setProfile, setUtils, setShareUrl, setLogout, setIsFB } = useProfile();

  const { data: profileResponse, refetch: refetchProfile } = useQuery({
    queryKey: ["profile-details", user],
    queryFn: () => (user ? profileFetch() : null),
  });

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          toast({ message: "Invite link is coppied to your clipboard, share it with your friend to earn commissions" });
        })
        .catch((err) => {
          throw err;
        });
    },
    [toast]
  );

  React.useEffect(() => {
    if (!!profileResponse?.cat) {
      setIsLoginModalDisplayed(false);
    }
  }, [profileResponse]);

  React.useEffect(() => {
    if (profileResponse) {
      setProfile(profileResponse);
      TPostReferral(profileResponse?._id);
      setShareUrl(`https://tokentails.com/game?ref=${profileResponse._id}`);
    }
  }, [profileResponse]);
  React.useEffect(() => {
    setUtils({
      openLink: (url: string, options: any) =>
        window.open(url, "_blank")?.focus?.(),
      openTelegramLink: (url: string) => window.open(url, "_blank")?.focus?.(),
      shareURL: (url: string, text?: string) => {
        copy(url);
        toast({
          message:
            "Your gift url is coppied to your clipboard, share it with your friend",
        });
      },
    });
    setLogout(() => () => {
      if (Capacitor.isNativePlatform()) {
        FirebaseAuthentication.signOut();
      } else {
        signOut(auth);
      }
      setUser(null);
      setProfile(null);
      setIsLoginModalDisplayed(true);
    });
    setIsFB?.(true);
  }, []);
  const onUserChange = useCallback(
    async (u: User) => {
      if (!u) {
        setUser(null);
        setProfile(null);
        sessionStorage.removeItem("accesstoken");
      } else {
        await u.getIdToken(true).then((token) => {
          sessionStorage.setItem("accesstoken", `fb${token}`);
          setIsLoginModalDisplayed(false);
          setUser(u);
        });

        if (reauthInterval) {
          clearInterval(reauthInterval);
        }
        reauthInterval = setInterval(async () => {
          if (auth.currentUser) {
            try {
              const refreshedToken = await auth.currentUser.getIdToken(true);
              sessionStorage.setItem("accesstoken", `fb${refreshedToken}`);
            } catch (error) {
              console.error("Error refreshing token:", error);
            }
          }
        }, 29 * 60 * 1000);
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
    refetchProfile,
  };

  React.useEffect(() => {
    onAuthStateChanged(auth, onUserChange);
  }, []);

  return (
    <FirebaseAuthContext.Provider value={value}>
      {isLoginModalDisplayed && <SignIn close={() => {}} />}
      {isVerifiedModalDisplayed && (
        <Verify close={() => setIsVerifiedModalDisplayed(false)} />
      )}
      {children}
    </FirebaseAuthContext.Provider>
  );
};

const nativeGoogleSignIn = async () => {
  const result = await FirebaseAuthentication.signInWithGoogle({
    skipNativeAuth: true,
  });
  const credential = GoogleAuthProvider.credential(result?.credential?.idToken);
  await signInWithCredential(auth, credential);
};

const nativeAppleSignIn = async () => {
  const result = await FirebaseAuthentication.signInWithApple({
    skipNativeAuth: true,
  });
  const credential = providers.apple.credential({
    idToken: result?.credential?.idToken,
    rawNonce: result?.credential?.nonce,
  });
  await signInWithCredential(auth, credential);
};

function useFirebaseAuth() {
  const context = React.useContext(FirebaseAuthContext);
  const toast = useToast();
  const signIn = useCallback(
    (provider: "google" | "apple" | string, password?: string) => {
      if (password) {
        signInWithEmailAndPassword(auth, provider, password).catch((error) => {
          const code = error?.code;
          const isUserNotFound = code === "auth/user-not-found";
          const isWrongPassword = code === "auth/wrong-password";

          if (isWrongPassword) {
            toast({
              message: "Wrong password",
              icon: "bx-x-circle",
              isError: true,
            });
          }

          return isUserNotFound
            ? createUserWithEmailAndPassword(auth, provider, password)
            : null;
        });
        return;
      }

      if (!Capacitor.isNativePlatform()) {
        signInWithPopup(auth, providers[provider as keyof typeof providers]);
        return;
      }
      const isGoogle = provider === "google";

      if (isGoogle) {
        nativeGoogleSignIn();
      } else {
        nativeAppleSignIn();
      }
    },
    []
  );
  const showSignInPopup = useCallback(() => {
    if (!context?.user) {
      context?.setIsVerifiedModalDisplayed(false);
      context?.setIsLoginModalDisplayed(true);
    }
  }, [context]);
  if (context === undefined) {
    throw new Error(
      "useFirebaseAuth must be used within a FirebaseAuthProvider"
    );
  }
  return {
    user: context.user,
    signIn,
    showSignInPopup,
  };
}

export { FirebaseAuthProvider, useFirebaseAuth };
