import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import { SignIn } from '@/components/shared/SignIn';
import { Verify } from '@/components/shared/Verify';
import { IProfile } from '@/models/profile';
import { useQuery } from '@tanstack/react-query';
import { deleteProfileRequest, profileFetch } from '@/constants/api';
import { initializeApp } from 'firebase/app';
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
} from 'firebase/auth';
import * as React from 'react';
import { useCallback, useEffect } from 'react';
import { useToast } from './ToastContext';

const firebaseConfig = {
    apiKey: 'AIzaSyCfitm6sU-lOunY3JpGdn8D4Ng7Dz5m3yk',
    authDomain: 'news-ccd33.firebaseapp.com',
    projectId: 'news-ccd33',
    storageBucket: 'news-ccd33.appspot.com',
    messagingSenderId: '158850509760',
    appId: '1:158850509760:web:446ea8a11bdddeb616f625',
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
const appleAuth = new OAuthProvider('apple.com');

const providers = {
    google: googleAuth,
    apple: appleAuth,
};

type User = FirebaseUser | null;
type ContextState = {
    user: User;
    profile?: IProfile | null;
    setProfile: (profile: IProfile | null) => void;
    isLoginModalDisplayed: boolean;
    setIsLoginModalDisplayed: (isDisplayed: boolean) => void;
    isVerifiedModalDisplayed: boolean;
    setIsVerifiedModalDisplayed: (isDisplayed: boolean) => void;
};

const FirebaseAuthContext = React.createContext<ContextState | undefined>(undefined);

const FirebaseAuthProvider = ({ children }: React.PropsWithChildren<{}>) => {
    const [user, setUser] = React.useState<User>(null);
    const [profile, setProfile] = React.useState<IProfile | null | undefined>(null);
    const [isLoginModalDisplayed, setIsLoginModalDisplayed] = React.useState(false);
    const [isVerifiedModalDisplayed, setIsVerifiedModalDisplayed] = React.useState(false);

    const { data: profileResponse, isFetching } = useQuery({
        queryKey: ['profile-details', user],
        queryFn: () => (user ? profileFetch() : null),
    });
    useEffect(() => {
        setProfile(profileResponse);
    }, [profileResponse]);
    const onUserChange = useCallback(
        async (u: User) => {
            if (!u) {
                setUser(null);
                localStorage.removeItem('accesstoken');
                // } else if (u && !u?.emailVerified) {
                //     sendEmailVerification(u);
                //     signOut(auth);
                //     setIsVerifiedModalDisplayed(true);
            } else {
                // setIsVerifiedModalDisplayed(false);
                await u.getIdToken(true).then((token) => {
                    localStorage.setItem('accesstoken', token);
                    setIsLoginModalDisplayed(false);
                    setUser(u);
                });
            }
        },
        [setIsLoginModalDisplayed, setIsVerifiedModalDisplayed],
    );
    const value = {
        profile,
        setProfile,
        user,
        isLoginModalDisplayed,
        setIsLoginModalDisplayed,
        isVerifiedModalDisplayed,
        setIsVerifiedModalDisplayed,
    };

    React.useEffect(() => {
        onAuthStateChanged(auth, onUserChange);
        setInterval(() => {
            onUserChange(user);
        }, 30 * 60 * 1000);
    }, []);

    return (
        <FirebaseAuthContext.Provider value={value}>
            {isLoginModalDisplayed && <SignIn close={() => setIsLoginModalDisplayed(false)} />}
            {isVerifiedModalDisplayed && <Verify close={() => setIsVerifiedModalDisplayed(false)} />}
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
    const signIn = useCallback((provider: 'google' | 'apple' | string, password?: string) => {
        if (password) {
            signInWithEmailAndPassword(auth, provider, password).catch((error) => {
                const code = error?.code;
                const isUserNotFound = code === 'auth/user-not-found';
                const isWrongPassword = code === 'auth/wrong-password';

                if (isWrongPassword) {
                    toast({ message: 'Neteisingas slaptažodis', icon: 'bx-x-circle', isError: true });
                }

                return isUserNotFound ? createUserWithEmailAndPassword(auth, provider, password) : null;
            });
            return;
        }

        if (!Capacitor.isNativePlatform()) {
            signInWithPopup(auth, providers[provider as keyof typeof providers]);
            return;
        }
        const isGoogle = provider === 'google';

        if (isGoogle) {
            nativeGoogleSignIn();
        } else {
            nativeAppleSignIn();
        }
    }, []);
    const deleteProfile = useCallback(async () => {
        await deleteProfileRequest();
        if (Capacitor.isNativePlatform()) {
            FirebaseAuthentication.signOut();
        }
        signOut(auth);
    }, []);
    const logout = useCallback(() => {
        if (Capacitor.isNativePlatform()) {
            FirebaseAuthentication.signOut();
        }
        signOut(auth);
    }, []);
    const showSignInPopup = useCallback(() => {
        if (!context?.user) {
            context?.setIsVerifiedModalDisplayed(false);
            context?.setIsLoginModalDisplayed(true);
        }
    }, [context]);
    if (context === undefined) {
        throw new Error('useFirebaseAuth must be used within a FirebaseAuthProvider');
    }
    return {
        user: context.user,
        profile: context.profile,
        setProfile: context.setProfile,
        deleteProfile,
        signIn,
        logout,
        showSignInPopup,
    };
}

export { FirebaseAuthProvider, useFirebaseAuth };
