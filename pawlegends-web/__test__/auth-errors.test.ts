/**
 * Sign-in error copy (context/auth/authErrors.ts, shared with the app host): neutral copy, silent cancels, and an
 * unknown error that names its code so a "something went wrong" report says what failed.
 */
import {
  AUTH_COPY,
  isAuthCancel,
  mapAuthError,
  mapNativeAuthError,
  nativeRef,
  unknownCopy,
  withLastMethodHint,
} from "@/context/auth/authErrors";

const err = (code: string) => ({ code });
const appleError = (n: number) => ({
  message: `The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error ${n}.)`,
});

describe("mapAuthError (web SDK)", () => {
  it("never tells whether an account exists for an email", () => {
    const copies = ["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential"].map((c) => mapAuthError(err(c)));
    expect(copies[0]).toEqual(copies[1]);
    expect(copies[1]).toEqual(copies[2]);
    copies.forEach((copy) => expect(copy?.message).not.toMatch(/no (such )?account|not found|does(n't| not) exist/i));
  });

  it("is silent for a closed or cancelled popup", () => {
    for (const code of ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]) {
      expect(mapAuthError(err(code))).toBeNull();
      expect(isAuthCancel(err(code))).toBe(true);
    }
  });

  it("maps known codes to their copy and input", () => {
    expect(mapAuthError(err("auth/invalid-email"))).toEqual({ message: AUTH_COPY.invalidEmail, field: "email" });
    expect(mapAuthError(err("auth/popup-blocked"))?.message).toBe(AUTH_COPY.popupBlocked);
    expect(mapAuthError(err("auth/unauthorized-domain"))?.message).toBe(AUTH_COPY.disabled);
    expect(mapAuthError(err("auth/network-request-failed"))?.message).toBe(AUTH_COPY.network);
  });

  it("an unknown code shows the generic copy with the code, a codeless error the plain copy", () => {
    expect(mapAuthError(err("auth/missing-or-invalid-nonce"))).toEqual({
      message: `${AUTH_COPY.unknown} (auth/missing-or-invalid-nonce)`,
      field: null,
    });
    expect(mapAuthError(err("auth/internal-error"))?.message).toMatch(/\(auth\/internal-error\)$/);
    expect(mapAuthError(new Error("boom"))).toEqual({ message: AUTH_COPY.unknown, field: null });
  });

  it("the reference never carries free text", () => {
    expect(unknownCopy("p@x.test <script>").message).toBe(`${AUTH_COPY.unknown} (px.testscript)`);
    expect(unknownCopy("x".repeat(200)).message.length).toBeLessThanOrEqual(AUTH_COPY.unknown.length + 63);
  });
});

describe("mapNativeAuthError (Capacitor Google and Apple)", () => {
  it("keeps cancels silent on Android and iOS", () => {
    expect(mapNativeAuthError({ code: "12501", message: "Sign in canceled" })).toBeNull();
    expect(mapNativeAuthError(appleError(1001))).toBeNull();
    expect(mapNativeAuthError(new Error("User cancelled the sign-in flow"))).toBeNull();
  });

  it("uses the web copy for Firebase codes and the network copy for offline", () => {
    expect(mapNativeAuthError(err("auth/network-request-failed"))?.message).toBe(AUTH_COPY.network);
    expect(mapNativeAuthError(err("auth/invalid-credential"))?.field).toBe("password");
    expect(mapNativeAuthError(new Error("7: NETWORK_ERROR"))?.message).toBe(AUTH_COPY.network);
  });

  it("Apple 1000 says how to fix it; other Apple failures name their number", () => {
    expect(mapNativeAuthError(appleError(1000))).toEqual({
      message: `${AUTH_COPY.appleUnavailable} (apple-1000)`,
      field: null,
    });
    expect(mapNativeAuthError(appleError(1004))?.message).toBe(`${AUTH_COPY.unknown} (apple-1004)`);
  });

  it("Android Google errors without a code get a fixed reference, never their message", () => {
    expect(nativeRef("", " [28444] developer console is not set up correctly.")).toBe("google-config");
    expect(nativeRef("", " 10: ")).toBe("google-config");
    expect(nativeRef("", " no credentials available")).toBe("google-no-credential");
    expect(mapNativeAuthError(new Error("No credentials available for p@x.test"))?.message).toBe(
      `${AUTH_COPY.unknown} (google-no-credential)`
    );
    expect(mapNativeAuthError(new Error("something else"))?.message).toBe(AUTH_COPY.unknown);
    expect(mapNativeAuthError({ code: "UNIMPLEMENTED", message: "x" })?.message).toBe(`${AUTH_COPY.unknown} (UNIMPLEMENTED)`);
  });
});

describe("withLastMethodHint", () => {
  it("names the provider used last on this device only for a credential error", () => {
    const copy = mapAuthError(err("auth/invalid-credential"));
    expect(withLastMethodHint(copy, err("auth/invalid-credential"), { provider: "apple" })?.message).toMatch(
      /Continue with Apple/
    );
    expect(withLastMethodHint(copy, err("auth/too-many-requests"), { provider: "apple" })).toBe(copy);
    expect(withLastMethodHint(copy, err("auth/invalid-credential"), { provider: "email" })).toBe(copy);
    expect(withLastMethodHint(null, err("auth/invalid-credential"), { provider: "google" })).toBeNull();
  });
});
