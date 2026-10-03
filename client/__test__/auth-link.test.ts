/**
 * Sign-in and linking (plan G1, G9): linking keeps the uid, popups open synchronously, an identity
 * that already has an account leads to a merge, and signing in never creates an account.
 */
const firebase = {
  linkWithPopup: jest.fn(),
  signInWithPopup: jest.fn(),
  linkWithCredential: jest.fn(),
  signInWithCredential: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  googleFromError: jest.fn(),
  appleFromError: jest.fn(),
};

jest.mock("firebase/auth", () => {
  class GoogleAuthProvider {
    static credential = (idToken: string) => ({ providerId: "google.com", idToken });
    static credentialFromError = (error: unknown) => firebase.googleFromError(error);
  }
  class OAuthProvider {
    constructor(readonly providerId: string) {}
    addScope() {
      return this;
    }
    credential(options: unknown) {
      return { providerId: this.providerId, ...(options as object) };
    }
    static credentialFromError = (error: unknown) => firebase.appleFromError(error);
  }
  return {
    GoogleAuthProvider,
    OAuthProvider,
    EmailAuthProvider: { credential: (email: string, password: string) => ({ providerId: "password", email, password }) },
    linkWithPopup: (...args: unknown[]) => firebase.linkWithPopup(...args),
    signInWithPopup: (...args: unknown[]) => firebase.signInWithPopup(...args),
    linkWithCredential: (...args: unknown[]) => firebase.linkWithCredential(...args),
    signInWithCredential: (...args: unknown[]) => firebase.signInWithCredential(...args),
    signInWithEmailAndPassword: (...args: unknown[]) => firebase.signInWithEmailAndPassword(...args),
    createUserWithEmailAndPassword: (...args: unknown[]) => firebase.createUserWithEmailAndPassword(...args),
    sendEmailVerification: (...args: unknown[]) => firebase.sendEmailVerification(...args),
    sendPasswordResetEmail: (...args: unknown[]) => firebase.sendPasswordResetEmail(...args),
  };
});

const native = { signInWithGoogle: jest.fn(), signInWithApple: jest.fn() };
jest.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    signInWithGoogle: (...args: unknown[]) => native.signInWithGoogle(...args),
    signInWithApple: (...args: unknown[]) => native.signInWithApple(...args),
  },
}));

import { createEmailAccount, signInWithEmail, startOAuth } from "@/context/auth/link";

const anonymous = () => ({ uid: "guest-uid", isAnonymous: true, getIdToken: jest.fn(async () => "GUEST_TOKEN") });
const authWith = (currentUser: unknown) => ({ currentUser }) as never;

beforeEach(() => {
  Object.values(firebase).forEach((fn) => fn.mockReset());
  Object.values(native).forEach((fn) => fn.mockReset());
});

describe("startOAuth on the web", () => {
  it("opens linkWithPopup for a guest synchronously, before anything is awaited", () => {
    const guest = anonymous();
    firebase.linkWithPopup.mockReturnValue(new Promise(() => undefined));
    void startOAuth(authWith(guest), "google", false);
    // Called during the same tick as the click: no microtask ran in between.
    expect(firebase.linkWithPopup).toHaveBeenCalledTimes(1);
    expect(firebase.linkWithPopup.mock.calls[0][0]).toBe(guest);
    expect(firebase.signInWithPopup).not.toHaveBeenCalled();
    expect(guest.getIdToken).not.toHaveBeenCalled();
  });

  it("signs in with a popup when there is no guest (optional pages)", async () => {
    firebase.signInWithPopup.mockResolvedValue({});
    const outcome = startOAuth(authWith(null), "apple", false);
    expect(firebase.signInWithPopup).toHaveBeenCalledTimes(1);
    await expect(outcome).resolves.toEqual({ kind: "done", linked: false, provider: "apple" });
  });

  it("linking keeps the uid: the outcome says linked", async () => {
    firebase.linkWithPopup.mockResolvedValue({});
    await expect(startOAuth(authWith(anonymous()), "google", false)).resolves.toEqual({
      kind: "done",
      linked: true,
      provider: "google",
    });
  });

  it("credential-already-in-use: captures the guest token, signs in to that account, asks for a merge", async () => {
    const guest = anonymous();
    const credential = { providerId: "google.com", idToken: "abc" };
    firebase.linkWithPopup.mockRejectedValue({ code: "auth/credential-already-in-use" });
    firebase.googleFromError.mockReturnValue(credential);
    firebase.signInWithCredential.mockResolvedValue({});
    const outcome = await startOAuth(authWith(guest), "google", false);
    expect(guest.getIdToken).toHaveBeenCalled();
    expect(firebase.signInWithCredential.mock.calls[0][1]).toBe(credential);
    expect(outcome).toEqual({ kind: "merge", guestToken: "GUEST_TOKEN", provider: "google" });
  });

  it("account-exists-with-different-credential: keeps the pending credential in memory", async () => {
    const pending = { providerId: "google.com" };
    firebase.signInWithPopup.mockRejectedValue({
      code: "auth/account-exists-with-different-credential",
      customData: { email: "p@x.test" },
    });
    firebase.googleFromError.mockReturnValue(pending);
    await expect(startOAuth(authWith(null), "google", false)).resolves.toEqual({
      kind: "link-account",
      pending,
      provider: "google",
      email: "p@x.test",
      guestToken: null,
    });
  });

  it("a closed popup is a silent cancel", async () => {
    firebase.signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    await expect(startOAuth(authWith(null), "google", false)).resolves.toEqual({ kind: "cancelled" });
  });
});

describe("startOAuth on native", () => {
  it("builds the credential with skipNativeAuth and links it to the guest", async () => {
    const guest = anonymous();
    native.signInWithGoogle.mockResolvedValue({ credential: { idToken: "native-id" } });
    firebase.linkWithCredential.mockResolvedValue({});
    const outcome = await startOAuth(authWith(guest), "google", true);
    expect(native.signInWithGoogle).toHaveBeenCalledWith({ skipNativeAuth: true });
    expect(firebase.linkWithCredential).toHaveBeenCalledWith(guest, { providerId: "google.com", idToken: "native-id" });
    expect(outcome).toEqual({ kind: "done", linked: true, provider: "google" });
  });

  it("Apple passes the raw nonce, exactly like the old nativeAppleSignIn", async () => {
    native.signInWithApple.mockResolvedValue({ credential: { idToken: "apple-id", nonce: "n0nce" } });
    firebase.signInWithCredential.mockResolvedValue({});
    await startOAuth(authWith(null), "apple", true);
    expect(native.signInWithApple).toHaveBeenCalledWith({ skipNativeAuth: true });
    expect(firebase.signInWithCredential.mock.calls[0][1]).toEqual({
      providerId: "apple.com",
      idToken: "apple-id",
      rawNonce: "n0nce",
    });
  });

  it("a native cancel is silent", async () => {
    native.signInWithGoogle.mockRejectedValue({ code: "12501", message: "Sign in canceled" });
    await expect(startOAuth(authWith(anonymous()), "google", true)).resolves.toEqual({ kind: "cancelled" });
  });
});

describe("email", () => {
  it("create account links the guest's email credential, then sends the verification email", async () => {
    const guest = anonymous();
    const linked = { uid: "guest-uid" };
    firebase.linkWithCredential.mockResolvedValue({ user: linked });
    firebase.sendEmailVerification.mockResolvedValue(undefined);
    const outcome = await createEmailAccount(authWith(guest), "p@x.test", "secret1");
    expect(firebase.linkWithCredential).toHaveBeenCalledWith(guest, {
      providerId: "password",
      email: "p@x.test",
      password: "secret1",
    });
    expect(firebase.sendEmailVerification).toHaveBeenCalledWith(linked);
    expect(firebase.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "verify", email: "p@x.test", justSent: true });
  });

  it("create account reports justSent false when the verification email failed (resend at once)", async () => {
    firebase.linkWithCredential.mockResolvedValue({ user: { uid: "guest-uid" } });
    firebase.sendEmailVerification.mockRejectedValue({ code: "auth/too-many-requests" });
    await expect(createEmailAccount(authWith(anonymous()), "p@x.test", "secret1")).resolves.toEqual({
      kind: "verify",
      email: "p@x.test",
      justSent: false,
    });
  });

  it("create account with an email in use tries the same credentials once, then merges", async () => {
    firebase.linkWithCredential.mockRejectedValue({ code: "auth/email-already-in-use" });
    firebase.signInWithEmailAndPassword.mockResolvedValue({});
    await expect(createEmailAccount(authWith(anonymous()), "p@x.test", "secret1")).resolves.toEqual({
      kind: "merge",
      guestToken: "GUEST_TOKEN",
      provider: "email",
    });
    firebase.signInWithEmailAndPassword.mockRejectedValue({ code: "auth/wrong-password" });
    await expect(createEmailAccount(authWith(anonymous()), "p@x.test", "secret1")).resolves.toEqual({
      kind: "error",
      error: { code: "auth/email-already-in-use" },
    });
  });

  it("signing in never creates an account (the auto-create on user-not-found is gone)", async () => {
    firebase.signInWithEmailAndPassword.mockRejectedValue({ code: "auth/user-not-found" });
    const outcome = await signInWithEmail(authWith(null), "new@x.test", "secret1");
    expect(outcome).toEqual({ kind: "error", error: { code: "auth/user-not-found" } });
    expect(firebase.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(firebase.linkWithCredential).not.toHaveBeenCalled();
  });

  it("signing in from a guest captures its token first, for the merge", async () => {
    const guest = anonymous();
    firebase.signInWithEmailAndPassword.mockResolvedValue({});
    await expect(signInWithEmail(authWith(guest), "p@x.test", "secret1")).resolves.toEqual({
      kind: "merge",
      guestToken: "GUEST_TOKEN",
      provider: "email",
    });
    expect(guest.getIdToken.mock.invocationCallOrder[0]).toBeLessThan(
      firebase.signInWithEmailAndPassword.mock.invocationCallOrder[0]
    );
  });
});
