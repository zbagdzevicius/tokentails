/**
 * The app's sign-in sheet (sign-in): a small DOM dialog in the game's style, over the game, owned by the in-page host
 * (no React, no framework). The web host uses the Token Tails AuthSheet; this one covers the same flows natively:
 *
 * - choose: Apple first on iPhone and Mac, Google first on Android, then email. A provider this build cannot use says
 *   so ("isn't set up in this build") instead of a button that would fail or crash;
 * - email: Sign in / Create account, Forgot password, the verify step ("I've verified", Resend);
 * - link-account: the email already signs in another way;
 * - prompts: the guest-progress merge, "Add N matches played on this device to your account?", the account
 *   deletion's last confirmation, a short toast.
 *
 * Error copy is the client's (`client/context/auth/authErrors.ts`), so both apps say the same thing.
 */
import { AUTH_COPY, mapAuthError, mapNativeAuthError, withLastMethodHint } from "@/context/auth/authErrors";
import { LAST_METHOD_LABEL, readLastMethod } from "@/context/auth/lastMethod";
import type { NativeCaps, OAuthProviderName, ShellPlatform } from "./auth";

export interface SheetActions {
  oauth(name: OAuthProviderName): void;
  email(tab: "sign-in" | "create", email: string, password: string): void;
  reset(email: string): Promise<void>;
  resend(): Promise<void>;
  checkVerified(): Promise<boolean>;
  /** The player closed the sheet. */
  closed(): void;
}

export interface AskOptions {
  title: string;
  text: string;
  yes: string;
  no: string;
  /** A destructive action (red). */
  danger?: boolean;
  /** Smaller print under the text. */
  fine?: string;
  testid?: string;
}

/** What the host shows (tests pass a fake). */
export interface HostUi {
  openSignIn(reason: string, actions: SheetActions): void;
  busy(label: string): void;
  error(error: unknown, native?: boolean): void;
  message(text: string): void;
  verify(email: string | null, justSent: boolean): void;
  linkAccount(provider: OAuthProviderName, email: string | null): void;
  closeSheet(): void;
  ask(options: AskOptions): Promise<boolean>;
  toast(text: string): void;
}

export const NOT_SET_UP = (name: "Apple" | "Google"): string => `${name} sign-in isn't set up in this build yet. Use email for now.`;

/** Firebase could not start in this WebView (main.ts NoAuth): no sign-in at all, the game plays on. */
export const UNAVAILABLE_CODE = "pl/sign-in-unavailable";
export const UNAVAILABLE = "Sign-in isn't available on this device right now. Everything still plays without an account.";

/**
 * Apple or Google said yes but Firebase refused the token (`auth/invalid-credential` and friends: the app's bundle id
 * or SHA keys not registered in the Firebase project, the provider off there). The client copy for those codes talks
 * about an email and password, which the player never typed.
 */
export const PROVIDER_REFUSED = (name: "Apple" | "Google"): string => `${name} sign-in didn't go through. Try again, or use email.`;

const TITLES: Record<string, string> = {
  "save-progress": "Save your wins",
  "claim-rewards": "Sign in to claim",
  "sign-in": "Sign in",
};

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const APPLE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path fill="currentColor" d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM14 5.1c.7-.9 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/></svg>';
const GOOGLE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6z"/></svg>';

const CSS = `
.plh-veil{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:rgba(20,12,22,.72);font:600 15px/1.35 'Fredoka',ui-rounded,system-ui,sans-serif;color:#fff3dc;-webkit-user-select:none;user-select:none}
.plh-card{position:relative;width:min(420px,100%);max-height:100%;overflow:auto;-webkit-overflow-scrolling:touch;padding:18px 18px 16px;border-radius:18px;background:#2b1d2e;box-shadow:inset 0 0 0 1px rgba(255,243,220,.16),0 16px 40px rgba(0,0,0,.5)}
.plh-card h2{margin:0 36px 6px 0;font-size:22px;line-height:1.15}
.plh-card p{margin:0 0 12px;opacity:.9}
.plh-card .plh-fine{font-size:13px;opacity:.75}
.plh-x{position:absolute;top:8px;right:8px;width:44px;height:44px;border:0;border-radius:999px;background:transparent;color:inherit;font-size:20px}
.plh-col{display:grid;gap:10px}
.plh-btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 16px;border:0;border-radius:12px;font:700 16px/1 inherit;font-family:inherit;color:#2b1d2e;background:#ffd34d;box-shadow:0 3px 0 rgba(0,0,0,.35)}
.plh-btn[disabled]{opacity:.6}
.plh-btn.ghost{color:#fff3dc;background:rgba(255,243,220,.1);box-shadow:inset 0 0 0 1px rgba(255,243,220,.22)}
.plh-btn.apple{color:#fff;background:#000;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.plh-btn.google{color:#1f1f1f;background:#fff}
.plh-btn.danger{color:#fff;background:#c8323c}
.plh-link{border:0;background:none;color:#ffd34d;font:700 14px/1.2 inherit;font-family:inherit;text-decoration:underline;padding:8px 0;min-height:44px}
.plh-tabs{display:flex;gap:6px;margin:0 0 12px}
.plh-tabs button{flex:1;min-height:40px;border:0;border-radius:10px;font:700 14px inherit;font-family:inherit;color:#fff3dc;background:rgba(255,243,220,.08)}
.plh-tabs button[aria-selected=true]{color:#2b1d2e;background:#fff3dc}
.plh-field{display:grid;gap:4px;font-size:13px}
.plh-field input{min-height:46px;padding:0 12px;border:0;border-radius:10px;font:500 16px inherit;font-family:inherit;color:#2b1d2e;background:#fff3dc;-webkit-user-select:text;user-select:text}
.plh-msg{margin:0 0 10px;padding:8px 10px;border-radius:10px;background:rgba(255,79,88,.18);box-shadow:inset 0 0 0 1px rgba(255,79,88,.45)}
.plh-msg.ok{background:rgba(77,160,255,.16);box-shadow:inset 0 0 0 1px rgba(77,160,255,.45)}
.plh-note{font-size:13px;opacity:.75;margin:2px 0 0}
.plh-hint{font-size:13px;color:#ffd34d;margin:0 0 8px}
.plh-row{display:flex;flex-wrap:wrap;gap:10px}
.plh-row .plh-btn{flex:1 1 140px}
.plh-toast{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));z-index:2001;transform:translateX(-50%);max-width:calc(100% - 32px);padding:10px 14px;border-radius:12px;background:rgba(43,29,46,.95);box-shadow:inset 0 0 0 1px rgba(255,243,220,.2);color:#fff3dc;font:700 14px/1.3 'Fredoka',ui-rounded,system-ui,sans-serif;pointer-events:none}
@media (max-height:480px){.plh-card{padding:12px 14px}.plh-card h2{font-size:19px}.plh-btn{min-height:44px}.plh-col{gap:8px}}
`;

type View =
  | { name: "choose"; message?: string }
  | { name: "email"; tab: "sign-in" | "create"; email: string; message?: string; field?: "email" | "password" | null; ok?: boolean }
  | { name: "reset"; email: string; message?: string; ok?: boolean }
  | { name: "verify"; email: string | null; message?: string; ok?: boolean }
  | { name: "link"; provider: OAuthProviderName; email: string | null }
  | { name: "busy"; label: string };

export class DomHostUi implements HostUi {
  private veil: HTMLElement | null = null;
  private actions: SheetActions | null = null;
  private reason = "sign-in";
  private view: View = { name: "choose" };
  /** The last view that was not `busy`: an error or a cancel goes back to it. */
  private back: View = { name: "choose" };
  private lastEmail = "";
  /** The Apple or Google tap waiting for its answer (an error then names that provider). */
  private oauthName: OAuthProviderName | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly doc: Document,
    private readonly platform: ShellPlatform,
    private readonly caps: NativeCaps
  ) {}

  private style(): void {
    if (this.doc.getElementById("plh-style")) return;
    const s = this.doc.createElement("style");
    s.id = "plh-style";
    s.textContent = CSS;
    this.doc.head.appendChild(s);
  }

  openSignIn(reason: string, actions: SheetActions): void {
    this.reason = reason;
    this.actions = actions;
    this.show({ name: "choose" });
  }

  busy(label: string): void {
    if (this.veil) this.show({ name: "busy", label });
  }

  error(error: unknown, native = false): void {
    const code = (error as { code?: unknown } | null)?.code;
    let message: string;
    let field: "email" | "password" | null = null;
    const oauth = this.oauthName;
    this.oauthName = null;
    if (code === "pl/google-not-configured") message = NOT_SET_UP("Google");
    else if (code === "pl/apple-not-configured") message = NOT_SET_UP("Apple");
    else if (code === UNAVAILABLE_CODE) message = UNAVAILABLE;
    else {
      const copy = native ? mapNativeAuthError(error) : withLastMethodHint(mapAuthError(error), error, readLastMethod());
      if (!copy) {
        // a cancel: back where the player was, quietly
        if (this.veil) this.show(this.back);
        return;
      }
      message = copy.message;
      field = copy.field;
      // a password message after an Apple or Google tap: say which sign-in failed instead
      if (native && oauth && copy.field === "password") {
        message = PROVIDER_REFUSED(oauth === "apple" ? "Apple" : "Google");
        field = null;
      }
    }
    if (!this.veil) return this.toast(message);
    const back = this.back;
    if (back.name === "email") this.show({ ...back, message, field, ok: false });
    else if (back.name === "reset" || back.name === "verify") this.show({ ...back, message, ok: false });
    else this.show({ name: "choose", message });
  }

  message(text: string): void {
    if (!this.veil) return this.toast(text);
    this.show({ name: "choose", message: text });
  }

  verify(email: string | null, justSent: boolean): void {
    this.show({ name: "verify", email, ...(justSent ? { message: `We sent a link to ${email ?? "your email"}.`, ok: true } : {}) });
  }

  linkAccount(provider: OAuthProviderName, email: string | null): void {
    this.show({ name: "link", provider, email });
  }

  closeSheet(): void {
    this.veil?.remove();
    this.veil = null;
    this.actions = null;
  }

  private show(view: View): void {
    this.style();
    this.view = view;
    if (view.name !== "busy") this.back = view;
    if (!this.veil) {
      this.veil = this.doc.createElement("div");
      this.veil.className = "plh-veil";
      this.veil.setAttribute("role", "dialog");
      this.veil.setAttribute("aria-modal", "true");
      this.veil.dataset.testid = "native-auth-sheet";
      this.veil.addEventListener("click", (e) => this.onClick(e));
      this.veil.addEventListener("submit", (e) => this.onSubmit(e));
      this.veil.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          this.close();
        }
      });
      this.doc.body.appendChild(this.veil);
    }
    this.veil.dataset.view = view.name;
    this.veil.innerHTML = `<div class="plh-card">${view.name === "busy" ? "" : '<button type="button" class="plh-x" data-h="close" aria-label="Close">✕</button>'}${this.body(view)}</div>`;
    this.veil.setAttribute("aria-label", TITLES[this.reason] ?? "Sign in");
    const focus = this.veil.querySelector<HTMLElement>(view.name === "email" || view.name === "reset" ? "input" : ".plh-btn, .plh-x");
    focus?.focus({ preventScroll: true });
  }

  private msg(text?: string, ok?: boolean): string {
    return text ? `<p class="plh-msg${ok ? " ok" : ""}" role="${ok ? "status" : "alert"}" data-testid="native-auth-message">${esc(text)}</p>` : "";
  }

  private body(view: View): string {
    switch (view.name) {
      case "busy":
        return `<h2>${esc(view.label)}</h2><p class="plh-fine">One moment…</p>`;
      case "choose": {
        const last = readLastMethod();
        const apple = this.platform !== "android";
        const google = this.platform !== "mac";
        const btn = (name: OAuthProviderName): string => {
          if (name === "apple")
            return this.caps.apple
              ? `<button type="button" class="plh-btn apple" data-h="apple" data-testid="native-auth-apple">${APPLE_SVG}Continue with Apple</button>`
              : `<p class="plh-note" data-testid="native-auth-apple-missing">${esc(NOT_SET_UP("Apple"))}</p>`;
          return this.caps.google
            ? `<button type="button" class="plh-btn google" data-h="google" data-testid="native-auth-google">${GOOGLE_SVG}Continue with Google</button>`
            : `<p class="plh-note" data-testid="native-auth-google-missing">${esc(NOT_SET_UP("Google"))}</p>`;
        };
        const order: OAuthProviderName[] = this.platform === "android" ? ["google", "apple"] : ["apple", "google"];
        const social = order.filter((n) => (n === "apple" ? apple : google)).map(btn).join("");
        const hint = last ? `<p class="plh-hint">Last time on this phone you used ${esc(LAST_METHOD_LABEL[last.provider])}${last.emailHint ? ` (${esc(last.emailHint)})` : ""}.</p>` : "";
        return `<h2>${esc(TITLES[this.reason] ?? "Sign in")}</h2>
          <p>Keep your wins, unlocks and Treat Track on every device. Playing never needs an account.</p>
          ${this.msg(view.message)}${hint}
          <div class="plh-col">${social}
            <button type="button" class="plh-btn ghost" data-h="email" data-testid="native-auth-email">Continue with email</button>
          </div>
          <p class="plh-fine" style="margin-top:12px">By signing in you agree to the Pawlegends terms. Privacy: pawlegends.app/privacy</p>`;
      }
      case "email": {
        const create = view.tab === "create";
        return `<h2>${create ? "Create an account" : "Sign in with email"}</h2>
          <div class="plh-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="${!create}" data-h="tab-sign-in">Sign in</button>
            <button type="button" role="tab" aria-selected="${create}" data-h="tab-create">Create account</button>
          </div>
          ${this.msg(view.message, view.ok)}
          <form class="plh-col" data-form="email" novalidate>
            <label class="plh-field">Email<input name="email" type="email" inputmode="email" autocomplete="${create ? "email" : "username"}" autocapitalize="off" spellcheck="false" value="${esc(view.email)}" ${view.field === "email" ? 'aria-invalid="true"' : ""} data-testid="native-auth-email-input"></label>
            <label class="plh-field">Password<input name="password" type="password" autocomplete="${create ? "new-password" : "current-password"}" ${view.field === "password" ? 'aria-invalid="true"' : ""} data-testid="native-auth-password-input"></label>
            <button type="submit" class="plh-btn" data-testid="native-auth-email-submit">${create ? "Create account" : "Sign in"}</button>
          </form>
          <div class="plh-row">${create ? "" : '<button type="button" class="plh-link" data-h="forgot">Forgot password?</button>'}<button type="button" class="plh-link" data-h="back">Other ways to sign in</button></div>
          ${create ? '<p class="plh-fine">We send a link to confirm the address. At least 6 characters for the password.</p>' : ""}`;
      }
      case "reset":
        return `<h2>Choose a new password</h2>
          <p>We email you a link to set a new password.</p>
          ${this.msg(view.message, view.ok)}
          <form class="plh-col" data-form="reset" novalidate>
            <label class="plh-field">Email<input name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(view.email)}"></label>
            <button type="submit" class="plh-btn">Send the link</button>
          </form>
          <button type="button" class="plh-link" data-h="email">Back to sign in</button>`;
      case "verify":
        return `<h2>Check your email</h2>
          <p>Tap the link we sent${view.email ? ` to <b>${esc(view.email)}</b>` : ""}, then come back here.</p>
          ${this.msg(view.message, view.ok)}
          <div class="plh-col">
            <button type="button" class="plh-btn" data-h="verified" data-testid="native-auth-verified">I've confirmed it</button>
            <button type="button" class="plh-btn ghost" data-h="resend">Send it again</button>
          </div>
          <button type="button" class="plh-link" data-h="back">Use another way</button>`;
      case "link": {
        const name = view.provider === "google" ? "Google" : "Apple";
        return `<h2>Sign in the way you used before</h2>
          <p>${view.email ? `<b>${esc(view.email)}</b> already` : "This email already"} signs in another way. Sign in with it once, and ${name} is added to the same account.</p>
          <div class="plh-col">
            <button type="button" class="plh-btn ghost" data-h="email" data-testid="native-auth-email">Continue with email</button>
            ${view.provider === "apple" && this.caps.google ? `<button type="button" class="plh-btn google" data-h="google">${GOOGLE_SVG}Continue with Google</button>` : ""}
            ${view.provider === "google" && this.caps.apple ? `<button type="button" class="plh-btn apple" data-h="apple">${APPLE_SVG}Continue with Apple</button>` : ""}
          </div>`;
      }
    }
  }

  private close(): void {
    const actions = this.actions;
    this.closeSheet();
    actions?.closed();
  }

  private onClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (target === this.veil && this.view.name !== "busy") return this.close();
    const h = target.closest<HTMLElement>("[data-h]")?.dataset.h;
    const a = this.actions;
    if (!h || !a) return;
    const email = this.view.name === "email" || this.view.name === "reset" ? this.readEmail() : this.lastEmail;
    switch (h) {
      case "close":
        return this.close();
      case "apple":
      case "google":
        this.show({ name: "busy", label: `Signing in with ${h === "apple" ? "Apple" : "Google"}` });
        this.oauthName = h;
        return a.oauth(h);
      case "email":
        return this.show({ name: "email", tab: "sign-in", email });
      case "tab-sign-in":
        return this.show({ name: "email", tab: "sign-in", email });
      case "tab-create":
        return this.show({ name: "email", tab: "create", email });
      case "forgot":
        return this.show({ name: "reset", email });
      case "back":
        return this.show({ name: "choose" });
      case "resend":
        void a.resend().then(
          () => this.veil && this.view.name === "verify" && this.show({ ...this.view, message: "Sent. Check your inbox and spam folder.", ok: true }),
          (err: unknown) => this.error(err)
        );
        return;
      case "verified": {
        const back = this.view;
        void a.checkVerified().then(
          (ok) => !ok && this.veil && back.name === "verify" && this.show({ ...back, message: "Not confirmed yet. Tap the link in the email first.", ok: false }),
          (err: unknown) => this.error(err)
        );
        return;
      }
    }
  }

  private readEmail(): string {
    const v = this.veil?.querySelector<HTMLInputElement>('input[name="email"]')?.value ?? "";
    return v.trim();
  }

  private onSubmit(e: Event): void {
    e.preventDefault();
    const form = (e.target as HTMLElement).closest<HTMLFormElement>("form");
    const a = this.actions;
    if (!form || !a) return;
    const email = this.readEmail();
    this.lastEmail = email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const v = this.view;
      if (v.name === "email") return this.show({ ...v, email, message: AUTH_COPY.invalidEmail, field: "email", ok: false });
      if (v.name === "reset") return this.show({ ...v, email, message: AUTH_COPY.invalidEmail, ok: false });
      return;
    }
    if (form.dataset.form === "reset") {
      const v = this.view;
      void a.reset(email).then(
        // the same answer whether or not an account exists (email enumeration)
        () => this.veil && this.show({ name: "reset", email, message: "If that email has an account, a link is on its way.", ok: true }),
        (err: unknown) => (v.name === "reset" ? this.error(err) : undefined)
      );
      return;
    }
    const password = this.veil?.querySelector<HTMLInputElement>('input[name="password"]')?.value ?? "";
    const tab = this.view.name === "email" ? this.view.tab : "sign-in";
    if (password.length < 6) {
      return this.show({ name: "email", tab, email, message: tab === "create" ? AUTH_COPY.weakPassword : AUTH_COPY.credentials, field: "password" });
    }
    this.back = { name: "email", tab, email };
    this.show({ name: "busy", label: tab === "create" ? "Creating your account" : "Signing in" });
    a.email(tab, email, password);
  }

  ask(o: AskOptions): Promise<boolean> {
    this.style();
    return new Promise((resolve) => {
      const veil = this.doc.createElement("div");
      veil.className = "plh-veil";
      veil.setAttribute("role", "alertdialog");
      veil.setAttribute("aria-modal", "true");
      veil.setAttribute("aria-label", o.title);
      veil.dataset.testid = o.testid ?? "native-host-ask";
      veil.innerHTML = `<div class="plh-card"><h2>${esc(o.title)}</h2><p>${esc(o.text)}</p>${o.fine ? `<p class="plh-fine">${esc(o.fine)}</p>` : ""}
        <div class="plh-row"><button type="button" class="plh-btn${o.danger ? " danger" : ""}" data-a="yes" data-testid="native-host-yes">${esc(o.yes)}</button><button type="button" class="plh-btn ghost" data-a="no" data-testid="native-host-no">${esc(o.no)}</button></div></div>`;
      const done = (yes: boolean): void => {
        veil.remove();
        resolve(yes);
      };
      veil.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
        if (a === "yes") done(true);
        else if (a === "no" || e.target === veil) done(false);
      });
      veil.addEventListener("keydown", (e) => {
        if (e.key === "Escape") done(false);
      });
      this.doc.body.appendChild(veil);
      // the safe choice has the focus (a stray Enter never deletes anything)
      veil.querySelector<HTMLElement>('[data-a="no"]')?.focus({ preventScroll: true });
    });
  }

  toast(text: string): void {
    this.style();
    this.doc.querySelector(".plh-toast")?.remove();
    const t = this.doc.createElement("div");
    t.className = "plh-toast";
    t.setAttribute("role", "status");
    t.dataset.testid = "native-host-toast";
    t.textContent = text;
    this.doc.body.appendChild(t);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.remove(), 4000);
  }
}
