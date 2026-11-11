/**
 * The public Firebase web config of the Token Tails project (news-ccd33). Not a secret: it ships in every web page
 * and app build and only identifies the project; access is enforced by Firebase Auth and the backend. Shared by the
 * Next client (FirebaseAuthContext) and the Paw Legends app's in-page host (pawlegends-app/src/host/auth.ts).
 */
export const FIREBASE_DEFAULT_AUTH_DOMAIN = "news-ccd33.firebaseapp.com";

export const FIREBASE_WEB_CONFIG = Object.freeze({
  apiKey: "AIzaSyCfitm6sU-lOunY3JpGdn8D4Ng7Dz5m3yk",
  projectId: "news-ccd33",
  storageBucket: "news-ccd33.appspot.com",
  messagingSenderId: "158850509760",
  appId: "1:158850509760:web:446ea8a11bdddeb616f625",
  authDomain: FIREBASE_DEFAULT_AUTH_DOMAIN,
});
