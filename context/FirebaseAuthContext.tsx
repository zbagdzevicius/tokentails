import { QUEST_API } from "@/api/quest-api";
import { SignIn } from "@/components/shared/SignIn";
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
  sendPasswordResetEmail,
} from "firebase/auth";
import { useRouter } from "next/router";
import * as React from "react";
import { useCallback } from "react";
import { useProfile } from "./ProfileContext";
import { useToast } from "./ToastContext";
import { USER_API } from "@/api/user-api";

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
  resetPassword: (email: string) => void;
};

const FirebaseAuthContext = React.createContext<ContextState | undefined>(
  undefined
);

const FirebaseAuthProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const [user, setUser] = React.useState<User>(null);
  const [userLoaded, setUserLoaded] = React.useState(false);
  const toast = useToast();
  const [isLoginModalDisplayed, setIsLoginModalDisplayed] =
    React.useState(false);
  const { setProfile, setUtils, setShareUrl, setLogout, setIsFB } =
    useProfile();

  const {
    data: profileResponse,
    refetch: refetchProfile,
    isLoading,
  } = useQuery({
    queryKey: ["profile-details", user],
    queryFn: () => (user ? USER_API.profile() : null),
  });

  const router = useRouter();
  const { query } = router;

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          toast({
            message:
              "Invite link is coppied to your clipboard, share it with your friends to earn",
          });
        })
        .catch((err) => {
          throw err;
        });
    },
    [toast]
  );
  const resetPassword = useCallback(
    (email: string) => {
      sendPasswordResetEmail(auth, email);
    },
    [auth]
  );

  React.useEffect(() => {
    if (!!profileResponse?.cat && !isLoading && userLoaded) {
      setIsLoginModalDisplayed(false);
    }
    if (!isLoading && !profileResponse?.cat && userLoaded) {
      setIsLoginModalDisplayed(true);
    }
  }, [profileResponse, isLoading, userLoaded]);

  React.useEffect(() => {
    if (profileResponse) {
      setProfile(profileResponse);
      setShareUrl(`https://tokentails.com/game?ref=${profileResponse._id}`);
      if (query?.ref) {
        QUEST_API.setReferralWeb(query?.ref as string);
      }
    }
  }, [profileResponse, query]);
  React.useEffect(() => {
    setUtils({
      openLink: (url: string, options: any) =>
        window.open(url, "_blank")?.focus?.(),
      openTelegramLink: (url: string) => window.open(url, "_blank")?.focus?.(),
      shareURL: (url: string, text?: string) => {
        copy(url);
        toast({
          message:
            "Your invite url is coppied to your clipboard, share it with your friend",
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
      setUserLoaded(true);
    },
    [setIsLoginModalDisplayed]
  );
  const value = {
    user,
    isLoginModalDisplayed,
    setIsLoginModalDisplayed,
    refetchProfile,
    resetPassword,
  };

  React.useEffect(() => {
    onAuthStateChanged(auth, onUserChange);
  }, []);

  return (
    <FirebaseAuthContext.Provider value={value}>
      {isLoginModalDisplayed && <SignIn close={() => {}} />}
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
    resetPassword: context?.resetPassword,
  };
}

export { FirebaseAuthProvider, useFirebaseAuth };
