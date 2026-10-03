import { PixelButton } from "@/components/shared/PixelButton";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { GameModal } from "@/components/ui/GameModal";
import type { AuthSheetController, SheetView } from "@/context/FirebaseAuthContext";
import type { AccountReason } from "@/context/auth/types";
import { useProfile } from "@/context/ProfileContext";
import { useToastHold } from "@/context/ToastContext";
import clsx from "clsx";
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { BrandSignInButton, type BrandProvider } from "./BrandSignInButton";

export const TERMS_URL = "https://docs.tokentails.com/community-and-social-impact/terms-and-conditions";
export const PRIVACY_URL = "https://docs.tokentails.com/community-and-social-impact/privacy-policy";
export const SUPPORT_URL = "mailto:hello@tokentails.com?subject=Token%20Tails%20account";

/**
 * The support link with a reference support can act on: the signed-in Firebase uid (the guest
 * on the conflict path). Not personal data on its own; it lets support find both documents.
 */
export const supportUrl = (reference?: string | null): string =>
  reference ? `${SUPPORT_URL}&body=${encodeURIComponent(`Reference: ${reference}`)}` : SUPPORT_URL;

/** Where focus goes when a sheet that opened by itself closes (no opener to return to). */
export const FOCUS_FALLBACK_SELECTOR = '[data-testid="guest-pill"] button';
export const HEIST_URL = "/heist";

/** Decision #64: the sheet is named by why it opened. */
export const SHEET_TITLES: Record<AccountReason, string> = {
  "save-progress": "SAVE YOUR CAT",
  "claim-rewards": "CLAIM YOUR REWARDS",
  purchase: "WELCOME TO TOKEN TAILS",
  adopt: "WELCOME TO TOKEN TAILS",
  "give-treat": "WELCOME TO TOKEN TAILS",
  share: "WELCOME TO TOKEN TAILS",
  support: "WELCOME TO TOKEN TAILS",
  "sign-in": "WELCOME TO TOKEN TAILS",
};

/**
 * The subtitle under the title. Views that are not about the reason (a failure, a conflict) get
 * none, so it never contradicts their body; the cat is named only when there is a user to own it.
 */
export const reasonLine = (reason: AccountReason, catName?: string, view?: SheetView["name"]): string => {
  if (view === "fallback" || view === "profile-error" || view === "conflict") return "";
  switch (reason) {
    case "save-progress":
      return `Keep ${catName || "your cat"}, your runs and your Tails on every device.`;
    case "claim-rewards":
      return "Rewards are tied to an account. It takes a few seconds, and your progress comes with you.";
    case "give-treat":
      return "Treats are given from an account, one a day, so each one counts once.";
    case "purchase":
      return "An account keeps what you buy safe on every device.";
    case "adopt":
      return "An account keeps your adopted cat yours on every device.";
    case "share":
      return "Invites are linked to your account, so your friends find you.";
    case "support":
      return "Sign in so we can answer you.";
    default:
      return "Sign in to keep your progress on every device.";
  }
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 6;
export const RESEND_COOLDOWN_S = 60;
export const VERIFY_POLL_MS = 5000;

const textButton =
  "inline-flex min-h-[44px] items-center justify-center px-3 font-sans text-p5 text-tt-lilac underline underline-offset-4 decoration-tt-lilac/50 hover:text-tt-cream hover:decoration-tt-cream rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400 disabled:no-underline disabled:opacity-60";

/** PixelButton is 3rem tall, under 44 px when the root font shrinks on small phones. */
const CTA_CLASS = "max-w-full min-h-[44px]";

const bodyText = "font-sans text-p5 leading-snug text-tt-cream";

const inputClass = (invalid: boolean) =>
  clsx(
    "h-[44px] w-full rounded-[4px] border-2 bg-tt-night-600 px-3 font-sans text-[16px] text-tt-cream",
    "placeholder:text-tt-muted focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
    invalid ? "border-tt-rust" : "border-tt-gold-500/70 focus:border-tt-gold-400"
  );

const Divider = () => (
  <div className="flex items-center gap-3 py-1" aria-hidden="true">
    <span className="h-px flex-1 bg-tt-gold-500/40" />
    <span className="font-secondary text-p5 uppercase tracking-widest text-tt-muted">or</span>
    <span className="h-px flex-1 bg-tt-gold-500/40" />
  </div>
);

const Spinner = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center gap-3 py-6 text-center" aria-busy="true">
    <PixelIcon name="loader" className="animate-spin text-[32px] text-tt-gold-400 motion-reduce:animate-none" />
    <p className={bodyText}>{label}</p>
  </div>
);

const Heading = ({ children }: { children: ReactNode }) => (
  <h3 className="font-primary text-p4 uppercase leading-tight tracking-wide text-tt-cream">{children}</h3>
);

/**
 * The one sign-in surface (plan G1 + G9, section 2.13 #6): a night bottom sheet on phones, a
 * centred panel from `md` up, built on GameModal. Rendered by FirebaseAuthProvider; features open
 * it with `requireAccount(reason)`.
 */
export const AuthSheet = ({ controller }: { controller: AuthSheetController }) => {
  const { sheet, message, dismissible } = controller;
  const { profile } = useProfile();
  const { held, markShown } = useToastHold(sheet.open);
  // A form's own validation message. It belongs to the view and the controller message it was
  // raised under: a new view or a new controller message hides it without an effect.
  const [local, setLocal] = useState<{
    text: string;
    field: "email" | "password" | null;
    view: SheetView;
    message: string | null;
  } | null>(null);
  const localError = local && local.view === sheet.view && local.message === message && sheet.open ? local : null;
  const setLocalError = (error: { text: string; field: "email" | "password" | null } | null) =>
    setLocal(error ? { ...error, view: sheet.view, message } : null);
  const alertId = useId();

  const latestHeld = held.length > 0 ? held[held.length - 1] : null;
  // The region shows the latest held toast only when no form error or controller message wins.
  const showsHeld = !localError?.text && !message && !!latestHeld?.message;
  const alertText = localError?.text ?? message ?? latestHeld?.message ?? "";
  // A held toast keeps its own tone: news reads as a neutral notice, an error toast as an error.
  const alertIsNotice = showsHeld && !latestHeld?.isError;
  // Once displayed here, a held toast is not played again after the sheet closes.
  useEffect(() => {
    if (showsHeld && latestHeld) markShown(latestHeld);
  }, [showsHeld, latestHeld, markShown]);
  const errorField = localError?.field ?? controller.messageField;
  // The template profile (Scout) shows before any Firebase user exists: no cat to name yet.
  const catName = controller.user ? profile?.cat?.name : undefined;
  const description = reasonLine(sheet.reason, catName, sheet.view.name);

  // GameModal returns focus to the element that opened the sheet. A sheet that opened by itself
  // (fallback, verify, conflict, profile error) has none, so focus would land on <body>: move it
  // to the guest pill once the dialog is gone.
  const wasOpen = useRef(sheet.open);
  useEffect(() => {
    const closing = wasOpen.current && !sheet.open;
    wasOpen.current = sheet.open;
    if (!closing) return;
    let frame = 0;
    let tries = 0;
    const settle = () => {
      tries += 1;
      const stillMounted = !!document.querySelector("[data-auth-view]");
      if (stillMounted && tries < 60) {
        frame = requestAnimationFrame(settle);
        return;
      }
      const active = document.activeElement;
      if (!active || active === document.body) {
        document.querySelector<HTMLElement>(FOCUS_FALLBACK_SELECTOR)?.focus({ preventScroll: true });
      }
    };
    frame = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(frame);
  }, [sheet.open]);

  return (
    <GameModal
      open={sheet.open}
      onOpenChange={(next) => {
        if (!next) controller.close();
      }}
      title={SHEET_TITLES[sheet.reason]}
      description={description || undefined}
      surface="sheet"
      size="sm"
      layer="auth"
      name="auth-sheet"
      dismissible={dismissible}
      bodyClassName="!p-0 md:!p-0"
      className="md:max-w-[26rem]"
    >
      {/* One static hero cat (decision #65), perched on the top rim. Its containing block is the
          frame, not the scrolling body, so it is never clipped. */}
      <img
        src="/brand/hero-cat-peek.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        width={76}
        height={77}
        className="pointer-events-none absolute -top-[66px] left-5 h-[72px] w-auto select-none md:-top-[70px] md:h-[76px] [@media(max-height:560px)]:hidden"
        data-testid="auth-hero-cat"
      />
      <div className="relative px-4 pb-5 pt-3 md:px-6 md:pb-6" data-auth-view={sheet.view.name}>
        {/* The landing sky, pre-dimmed (no live backdrop-filter): fades in under the title. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src="/brand/hero-bg-dim.webp"
            alt=""
            className="h-full w-full object-cover object-[50%_38%] opacity-90"
            draggable={false}
          />
          <span className="absolute inset-0 bg-gradient-to-b from-tt-night-700 via-tt-night-700/10 to-tt-night-800/80" />
        </div>
        <div className="relative flex flex-col gap-4">
          <div
            id={alertId}
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            data-testid="auth-alert"
            data-tone={alertText ? (alertIsNotice ? "notice" : "error") : undefined}
            className={clsx(
              "font-sans text-p5 leading-snug",
              !alertText && "sr-only",
              alertText && "rounded-[4px] border-2 bg-tt-night-900/80 px-3 py-2 text-tt-cream",
              alertText && (alertIsNotice ? "border-tt-gold-500/60" : "border-tt-rust/70")
            )}
          >
            {alertText}
          </div>
          <SheetBody
            controller={controller}
            alertId={alertId}
            errorField={alertText && !alertIsNotice ? errorField : null}
            setLocalError={setLocalError}
          />
        </div>
      </div>
    </GameModal>
  );
};

interface BodyProps {
  controller: AuthSheetController;
  alertId: string;
  errorField: "email" | "password" | null;
  setLocalError: (error: { text: string; field: "email" | "password" | null } | null) => void;
}

const SheetBody = (props: BodyProps) => {
  const { view } = props.controller.sheet;
  switch (view.name) {
    case "choose":
      return <ChooseView {...props} />;
    case "email":
      // Remounts when the view brings a new email or notice (after a reset), not on a tab switch.
      return <EmailView key={`${view.email ?? ""}|${view.notice ?? ""}`} {...props} view={view} />;
    case "verify-email":
      return <VerifyView {...props} view={view} />;
    case "reset":
      return <ResetView {...props} view={view} />;
    case "link-account":
      return <LinkAccountView {...props} view={view} />;
    case "linking":
    case "busy":
      return <Spinner label={view.label} />;
    case "profile-error":
      return <ProfileErrorView {...props} view={view} />;
    case "conflict":
      return <ConflictView {...props} />;
    case "merged":
      return <MergedView {...props} view={view} />;
    case "fallback":
      return <FallbackView {...props} />;
    default:
      return null;
  }
};

const LegalFooter = () => (
  <p className="text-center font-sans text-p6 leading-relaxed text-tt-muted">
    By continuing you accept the{" "}
    <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-tt-lilac underline underline-offset-2">
      Terms
    </a>{" "}
    and the{" "}
    <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-tt-lilac underline underline-offset-2">
      Privacy Policy
    </a>
    .
  </p>
);

/** Google and Apple in the right order, or the in-app browser notice instead of them. */
const ProviderButtons = ({
  controller,
  exclude,
}: {
  controller: AuthSheetController;
  exclude?: BrandProvider;
}) => {
  const [copied, setCopied] = useState(false);
  if (controller.inAppBrowser) {
    const openOutside = () => {
      const url = typeof window !== "undefined" ? window.location.href : "";
      void navigator.clipboard?.writeText(url).then(
        () => setCopied(true),
        () => setCopied(false)
      );
      window.open(url, "_blank", "noopener");
    };
    return (
      <div className="rounded-[4px] border-2 border-tt-gold-500/50 bg-tt-night-900/70 p-3" data-testid="in-app-notice">
        <p className={bodyText}>
          Google and Apple sign-in don&apos;t work inside this app&apos;s browser. Open Token Tails in Safari or Chrome, or
          use your email below.
        </p>
        <button type="button" className={clsx(textButton, "mt-1 px-0")} onClick={openOutside}>
          {copied ? "Link copied. Paste it in your browser" : "Open in your browser"}
        </button>
      </div>
    );
  }
  const order: BrandProvider[] = controller.appleFirst ? ["apple", "google"] : ["google", "apple"];
  return (
    <div className="flex flex-col gap-4 pb-1 pr-1">
      {order
        .filter((provider) => provider !== exclude)
        .map((provider) => (
          <BrandSignInButton
            key={provider}
            provider={provider}
            // Synchronous: the popup must open inside this click (G9).
            onClick={() => controller.oauth(provider)}
          />
        ))}
    </div>
  );
};

const KeepPlaying = ({ controller }: { controller: AuthSheetController }) => {
  if (!controller.dismissible) return null;
  // Only when there is a guest to keep playing as (not after a failed anonymous sign-in).
  const isGuest = !!controller.user?.isAnonymous;
  return (
    <button type="button" className={textButton} onClick={controller.close}>
      {isGuest ? "Keep playing as guest" : "Not now"}
    </button>
  );
};

const ChooseView = ({ controller }: BodyProps) => {
  // A guest saving its cat creates an account; anyone else (including a returning player on the
  // fallback sheet, where no Firebase user exists) most likely signs in.
  const emailTab = controller.user?.isAnonymous ? "create" : "sign-in";
  return (
    <>
      <ProviderButtons controller={controller} />
      {!controller.inAppBrowser && <Divider />}
      <PixelButton
        text="CONTINUE WITH EMAIL"
        icon="mail"
        fullWidth
        className={CTA_CLASS}
        onClick={() => controller.setView({ name: "email", tab: emailTab })}
      />
      <div className="flex flex-col items-center">
        <KeepPlaying controller={controller} />
      </div>
      <LegalFooter />
    </>
  );
};

const EmailView = ({
  controller,
  view,
  alertId,
  errorField,
  setLocalError,
}: BodyProps & { view: Extract<SheetView, { name: "email" }> }) => {
  const tab = view.tab;
  const [email, setEmail] = useState(view.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const ids = { email: useId(), password: useId(), hint: useId(), tabs: useId() };
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus({ preventScroll: true });
  }, [tab]);

  const switchTab = (next: "sign-in" | "create") =>
    controller.setView({ name: "email", tab: next, email });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setLocalError({ text: "Enter a valid email address.", field: "email" });
      emailRef.current?.focus();
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setLocalError({
        text:
          tab === "create"
            ? `Use at least ${MIN_PASSWORD} characters for your password.`
            : password.length === 0
              ? "Enter your password."
              : "That password looks too short. Check it and try again.",
        field: "password",
      });
      passwordRef.current?.focus();
      return;
    }
    setLocalError(null);
    controller.emailSubmit(tab, trimmed, password);
  };

  const TAB_ORDER = ["sign-in", "create"] as const;
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TAB_ORDER.indexOf(tab);
    let next: (typeof TAB_ORDER)[number] | null = null;
    if (event.key === "ArrowRight") next = TAB_ORDER[(index + 1) % TAB_ORDER.length];
    else if (event.key === "ArrowLeft") next = TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length];
    else if (event.key === "Home") next = TAB_ORDER[0];
    else if (event.key === "End") next = TAB_ORDER[TAB_ORDER.length - 1];
    if (!next) return;
    event.preventDefault();
    if (next !== tab) switchTab(next);
    document.getElementById(`${ids.tabs}-${next}`)?.focus();
  };

  const tabButton = (value: "sign-in" | "create", label: string) => (
    <button
      type="button"
      role="tab"
      id={`${ids.tabs}-${value}`}
      aria-selected={tab === value}
      aria-controls={`${ids.tabs}-panel`}
      // ARIA tabs pattern: one Tab stop for the list, arrows/Home/End move between tabs.
      tabIndex={tab === value ? 0 : -1}
      onClick={() => switchTab(value)}
      onKeyDown={onTabKeyDown}
      className={clsx(
        "min-h-[44px] flex-1 rounded-[4px] font-primary text-p5 uppercase tracking-wide transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
        tab === value ? "bg-tt-gold-400 text-tt-gold-ink" : "text-tt-lilac hover:text-tt-cream"
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <div role="tablist" aria-label="Sign in or create an account" className="flex gap-1 rounded-[6px] border-2 border-tt-gold-500/50 bg-tt-night-900/70 p-1">
        {tabButton("sign-in", "Sign in")}
        {tabButton("create", "Create account")}
      </div>
      <form
        id={`${ids.tabs}-panel`}
        role="tabpanel"
        aria-labelledby={`${ids.tabs}-${tab}`}
        className="flex flex-col gap-3"
        onSubmit={submit}
        noValidate
      >
        {view.notice && <p className={clsx(bodyText, "text-tt-mint")}>{view.notice}</p>}
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.email} className="font-secondary text-p5 uppercase tracking-wider text-tt-lilac">
            Email
          </label>
          <input
            ref={emailRef}
            id={ids.email}
            name="email"
            type="email"
            inputMode="email"
            autoComplete={tab === "create" ? "email" : "username"}
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errorField === "email" || undefined}
            aria-describedby={errorField === "email" ? alertId : undefined}
            className={inputClass(errorField === "email")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.password} className="font-secondary text-p5 uppercase tracking-wider text-tt-lilac">
            Password
          </label>
          <div className="relative">
            <input
              ref={passwordRef}
              id={ids.password}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={tab === "create" ? "new-password" : "current-password"}
              minLength={tab === "create" ? MIN_PASSWORD : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errorField === "password" || undefined}
              aria-describedby={
                [tab === "create" ? ids.hint : "", errorField === "password" ? alertId : ""].filter(Boolean).join(" ") ||
                undefined
              }
              className={clsx(inputClass(errorField === "password"), "pr-[52px]")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-0 top-0 grid h-[44px] w-[48px] place-items-center rounded-[4px] text-tt-lilac hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tt-gold-400"
            >
              <PixelIcon name={showPassword ? "eye-off" : "eye"} className="text-[22px]" />
            </button>
          </div>
          {tab === "create" && (
            <p id={ids.hint} className="font-sans text-p6 text-tt-muted">
              At least {MIN_PASSWORD} characters. We&apos;ll send a link to confirm your email.
            </p>
          )}
        </div>
        <PixelButton type="submit" text={tab === "create" ? "CREATE ACCOUNT" : "SIGN IN"} fullWidth className={clsx(CTA_CLASS, "mt-1")} />
      </form>
      <div className="flex flex-wrap items-center justify-center gap-x-2">
        {tab === "sign-in" && (
          <button type="button" className={textButton} onClick={() => controller.setView({ name: "reset", email })}>
            Forgot password?
          </button>
        )}
        <button type="button" className={textButton} onClick={() => controller.setView({ name: "choose" })}>
          Other ways to sign in
        </button>
      </div>
    </>
  );
};

const ResetView = ({
  controller,
  view,
  alertId,
  errorField,
  setLocalError,
}: BodyProps & { view: Extract<SheetView, { name: "reset" }> }) => {
  const [email, setEmail] = useState(view.email ?? "");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setLocalError({ text: "Enter a valid email address.", field: "email" });
      return;
    }
    setBusy(true);
    try {
      await controller.sendPasswordReset(email.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
      <Heading>Reset your password</Heading>
      <p className={bodyText}>Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="font-secondary text-p5 uppercase tracking-wider text-tt-lilac">
          Email
        </label>
        <input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={errorField === "email" || undefined}
          aria-describedby={errorField === "email" ? alertId : undefined}
          className={inputClass(errorField === "email")}
        />
      </div>
      <PixelButton type="submit" text="SEND RESET LINK" busy={busy} fullWidth className={CTA_CLASS} />
      <div className="flex justify-center">
        <button type="button" className={textButton} onClick={() => controller.setView({ name: "email", tab: "sign-in", email })}>
          Back to sign in
        </button>
      </div>
    </form>
  );
};

const VerifyView = ({ controller, view }: BodyProps & { view: Extract<SheetView, { name: "verify-email" }> }) => {
  // On the cooldown only when an email went out just now; a returning unverified account, or a
  // first send that failed, can resend at once.
  const [cooldown, setCooldown] = useState(view.justSent ? RESEND_COOLDOWN_S : 0);
  const [checking, setChecking] = useState(false);
  const { checkVerified } = controller;

  // True once a running cooldown has reached zero, so the polite region announces it once.
  const [cooldownEnded, setCooldownEnded] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => {
      setCooldown((value) => value - 1);
      if (cooldown === 1) setCooldownEnded(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Poll every 5 s: the player may confirm on another device.
  useEffect(() => {
    const timer = setInterval(() => void checkVerified(true), VERIFY_POLL_MS);
    return () => clearInterval(timer);
  }, [checkVerified]);

  const resend = async () => {
    if (cooldown > 0) return;
    if (await controller.resend()) {
      setCooldownEnded(false);
      setCooldown(RESEND_COOLDOWN_S);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      await checkVerified(false);
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <Heading>Check your email</Heading>
      {view.justSent ? (
        <p className={bodyText}>
          We sent a link to <strong className="font-bold text-tt-gold-400">{view.email || "your email"}</strong>. Open it
          to confirm it&apos;s you, then come back here. Your cat waits for you.
        </p>
      ) : (
        <p className={bodyText}>
          Confirm <strong className="font-bold text-tt-gold-400">{view.email || "your email"}</strong> to keep playing.
          Tap &ldquo;Resend email&rdquo; for a new link, open it, then come back here.
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite" data-testid="resend-ready">
        {cooldownEnded ? "You can resend the email now." : ""}
      </p>
      <PixelButton text="I'VE VERIFIED, CONTINUE" busy={checking} fullWidth className={CTA_CLASS} onClick={check} />
      <div className="flex flex-wrap items-center justify-center gap-x-2">
        {/* No live region on the button: its label ticks every second. The one announcement
            comes when the cooldown ends. */}
        <button type="button" className={textButton} onClick={resend} disabled={cooldown > 0}>
          {cooldown > 0 ? `Resend email in ${cooldown} s` : "Resend email"}
        </button>
        <button type="button" className={textButton} onClick={() => void controller.signOut()}>
          Use a different account
        </button>
      </div>
    </>
  );
};

const LinkAccountView = ({
  controller,
  view,
}: BodyProps & { view: Extract<SheetView, { name: "link-account" }> }) => {
  const tried = view.provider === "google" ? "Google" : "Apple";
  return (
    <>
      <Heading>You already have an account</Heading>
      <p className={bodyText}>
        {view.email ? (
          <>
            <strong className="font-bold text-tt-gold-400">{view.email}</strong> already signs in another way.
          </>
        ) : (
          "This email already signs in another way."
        )}{" "}
        Sign in the way you did before, and we&apos;ll connect {tried} to it.
      </p>
      <ProviderButtons controller={controller} exclude={view.provider} />
      <Divider />
      <PixelButton
        text="SIGN IN WITH EMAIL"
        fullWidth
        className={CTA_CLASS}
        onClick={() => controller.setView({ name: "email", tab: "sign-in", email: view.email ?? undefined })}
      />
      <div className="flex justify-center">
        <KeepPlaying controller={controller} />
      </div>
    </>
  );
};

const ProfileErrorView = ({
  controller,
  view,
}: BodyProps & { view: Extract<SheetView, { name: "profile-error" }> }) => (
  <>
    <Heading>{view.timeout ? "This is taking too long" : "We couldn't load your account"}</Heading>
    <p className={bodyText}>
      {view.timeout
        ? "Your account didn't load in time. Check your connection, then try again."
        : "Something went wrong on our side. Your cat and your progress are safe. Try again in a moment."}
    </p>
    <PixelButton text="TRY AGAIN" fullWidth className={CTA_CLASS} onClick={controller.retryProfile} />
    <div className="flex flex-wrap items-center justify-center gap-x-2">
      <button type="button" className={textButton} onClick={() => void controller.signOut()}>
        Sign out
      </button>
    </div>
  </>
);

const ConflictView = ({ controller }: BodyProps) => {
  // This guest's uid, so support can move its progress after the player signs in elsewhere.
  const reference = controller.user?.uid ?? null;
  return (
    <>
      <Heading>This email already has an account</Heading>
      <p className={bodyText}>
        Sign in to that account to keep playing. Write to us first and we&apos;ll move this guest&apos;s progress over
        for you{reference ? ", quoting this reference:" : "."}
      </p>
      {reference && (
        <p
          className="select-all break-all rounded-[4px] border-2 border-tt-gold-500/60 bg-tt-night-900/80 px-3 py-2 font-sans text-p5 font-semibold text-tt-cream"
          data-testid="conflict-reference"
        >
          {reference}
        </p>
      )}
      <PixelButton text="SIGN IN TO MY ACCOUNT" fullWidth className={CTA_CLASS} onClick={() => void controller.signOut()} />
      <div className="flex flex-wrap items-center justify-center gap-x-2">
        <a className={textButton} href={supportUrl(reference)}>
          Contact support
        </a>
        <KeepPlaying controller={controller} />
      </div>
    </>
  );
};

const MergedView = ({ controller, view }: BodyProps & { view: Extract<SheetView, { name: "merged" }> }) => (
  <>
    <Heading>{view.note ? "You're signed in" : "Welcome back!"}</Heading>
    {view.note ? (
      <p className={bodyText}>{view.note}</p>
    ) : (
      <p className={bodyText}>
        Your guest progress is in your account now
        {view.gamesMoved > 0 || view.tailsCredited > 0 ? ":" : "."}
      </p>
    )}
    {!view.note && (view.gamesMoved > 0 || view.tailsCredited > 0) && (
      <ul className="flex flex-wrap gap-2" aria-label="What moved">
        {view.gamesMoved > 0 && (
          <li className="rounded-[4px] border-2 border-tt-gold-500/60 bg-tt-night-900/70 px-3 py-1 font-secondary text-p4 uppercase tracking-wide text-tt-cream">
            {view.gamesMoved} {view.gamesMoved === 1 ? "run" : "runs"}
          </li>
        )}
        {view.tailsCredited > 0 && (
          <li className="rounded-[4px] border-2 border-tt-gold-500/60 bg-tt-night-900/70 px-3 py-1 font-secondary text-p4 uppercase tracking-wide text-tt-gold-400">
            +{view.tailsCredited} Tails
          </li>
        )}
      </ul>
    )}
    <PixelButton text="CONTINUE" fullWidth className={CTA_CLASS} onClick={controller.close} />
  </>
);

const FallbackView = ({ controller }: BodyProps) => (
  <>
    <Heading>We couldn&apos;t start a guest game</Heading>
    <p className={bodyText}>
      Guest play isn&apos;t available right now. You can still look around, try again, sign in, or play Catnip Heist right
      now with no sign-up.
    </p>
    <PixelButton text="TRY AGAIN" fullWidth className={CTA_CLASS} onClick={controller.retryGuest} />
    <div className="flex flex-col items-center">
      <button type="button" className={textButton} onClick={() => controller.setView({ name: "choose" })}>
        Sign in instead
      </button>
      {/* Full load on purpose: /heist is its own page. */}
      <a className={textButton} href={HEIST_URL}>
        Play Catnip Heist now, no sign-up
      </a>
    </div>
  </>
);

export default AuthSheet;
