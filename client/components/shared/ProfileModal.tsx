import { ApiError } from "@/api/api";
import { USER_API } from "@/api/user-api";
import { analytics, openConsentSettings } from "@/analytics";
import { CatnipIcon } from "@/components/shared/CatnipIcon";
import { GameModal as GameDialog } from "@/components/ui/GameModal";
import {
  ActionRow,
  ConfirmAction,
  DangerZone,
  KeyValueList,
  KeyValueRow,
  ModalButton,
  ModalSection,
  StatGrid,
  StatTile,
} from "@/components/ui/modal";
import { cdnFile } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useOptionalFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useAccountAction } from "@/hooks/useAccountAction";
import { ICat } from "@/models/cats";
import { GameModal } from "@/models/game";
import { IProfile } from "@/models/profile";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { useMutation } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useId, useState, type ReactNode } from "react";
import {
  getCatnipBreakdown,
  TOTAL_CATNIP_CAP,
} from "@/constants/catnip-accounting";
import { GameMusicToggle } from "./GameMusicToggler";
import { MyImpactSummary } from "@/components/impact/MyImpactSummary";
import { openProgress } from "@/components/impact/progressTab";

// RenameSheet belongs to the onboarding flow (task 4a, G3 "Names", decision #22). Loaded on
// demand: the profile opens far more often than anyone renames a cat.
const RenameSheet = dynamic(
  () => import("@/components/onboarding/RenameSheet").then((module) => module.RenameSheet),
  { ssr: false }
);

/** Night input used by the profile forms. */
const INPUT_CLASSES =
  "min-h-[44px] w-full rounded-none border-2 border-tt-gold-500/80 bg-tt-night-950 px-3 py-2 font-sans text-p5 font-bold text-tt-cream placeholder:font-semibold placeholder:text-tt-muted outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400";

const NUMBER = new Intl.NumberFormat("en-US");

/** A social network logo for a KeyValueRow icon slot. */
const SocialLogo = ({ file }: { file: string }) => (
  <img className="h-5 w-5 pixelated" src={cdnFile(file)} alt="" aria-hidden="true" draggable={false} />
);

// ---- hero: the player's cat ------------------------------------------------------------------

/** The player's cat on a soft pedestal glow, the greeting and the Rename action. */
const ProfileHero = ({
  profile,
  canRename,
  onRename,
}: {
  profile: IProfile;
  canRename: boolean;
  onRename: () => void;
}) => {
  const cat = profile.cat ?? null;
  return (
    <section
      aria-label="Your cat"
      data-testid="profile-hero"
      className="tt-card relative flex flex-row items-center gap-4 overflow-hidden px-3 py-3 text-left md:gap-5 md:px-4 short:gap-4 short:py-2"
    >
      <div className="relative flex shrink-0 items-end justify-center">
        {/* Pedestal: a gold glow and a dusk ellipse the cat stands on. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/2 h-5 w-24 -translate-x-1/2 rounded-[50%] md:h-6 md:w-28 bg-[radial-gradient(ellipse_at_center,rgb(var(--tt-gold-400)/0.45),rgb(var(--tt-lilac)/0.18)_55%,transparent_72%)] short:h-5 short:w-20"
        />
        <img
          draggable={false}
          className="relative z-10 mb-1 w-16 pixelated animate-hover motion-reduce:animate-none md:mb-1.5 md:w-24 short:mb-1 short:w-16"
          src={cat?.catImg || "/logo/logo.webp"}
          alt={cat?.name ? `${cat.name}, your cat` : ""}
        />
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <p className="font-paws text-p3 leading-tight text-tt-cream">
          Hello, {profile.name}
        </p>
        {cat?.name && (
          <p className="font-sans text-p5 font-semibold text-tt-muted">
            Your cat is <span className="font-extrabold text-tt-cream">{cat.name}</span>
          </p>
        )}
        {canRename && (
          <ModalButton variant="ghost" size="sm" icon="pencil" onClick={onRename}>
            {`Rename ${cat?.name || "your cat"}`}
          </ModalButton>
        )}
      </div>
    </section>
  );
};

// ---- linked accounts -------------------------------------------------------------------------

type Network = "twitter" | "discord";

/** Longest handle each network allows (X: 15, Discord: 32; X keeps its old, looser 24). */
const HANDLE_MAX: Record<Network, number> = { twitter: 24, discord: 32 };

/** "@Name " or a pasted profile link → "name". */
const cleanHandle = (raw: string): string => raw.trim().replace(/^@+/, "").toLowerCase();

/** One handle row: the saved handle, or an input while editing. */
const HandleRow = ({
  network,
  label,
  logo,
  saved,
  draft,
  onChange,
  editing,
  saving,
  locked,
  error,
  onEdit,
  onSave,
  onCancel,
}: {
  network: Network;
  label: string;
  logo: ReactNode;
  saved?: string;
  draft: string;
  onChange: (value: string) => void;
  editing: boolean;
  saving: boolean;
  /** Another row is being edited: one form at a time. */
  locked: boolean;
  error: string | null;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) => {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const testId = `profile-${label.toLowerCase()}`;
  if (!editing) {
    return (
      <KeyValueRow
        label={label}
        icon={logo}
        value={saved ? `@${saved}` : undefined}
        emptyValue="Not linked"
        data-testid={testId}
        action={
          <ModalButton
            variant="secondary"
            size="sm"
            icon={saved ? "pencil" : undefined}
            disabled={locked}
            aria-label={saved ? `Edit ${label} handle` : `Connect ${label}`}
            onClick={onEdit}
          >
            {saved ? "Edit" : "Connect"}
          </ModalButton>
        }
      />
    );
  }
  const ready = !!cleanHandle(draft);
  return (
    <form
      className="flex flex-col gap-2 py-2"
      data-testid={testId}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !saving) onSave();
      }}
    >
      <label htmlFor={inputId} className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">
        Your {label} handle
      </label>
      <div className="flex items-stretch focus-within:ring-4 focus-within:ring-tt-gold-400">
        <span
          aria-hidden="true"
          className="flex items-center border-2 border-r-0 border-tt-gold-500/80 bg-tt-night-950 pl-3 font-sans text-p5 font-bold text-tt-muted"
        >
          @
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="text"
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={draft}
          maxLength={HANDLE_MAX[network] + 1}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onChange(e.target.value.replace(/^@+/, "").slice(0, HANDLE_MAX[network]))}
          className={`${INPUT_CLASSES} border-l-0 !pl-1 focus-visible:!ring-0`}
          placeholder="yourname"
          autoFocus
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="font-sans text-p6 font-semibold text-tt-rust">
          {error}
        </p>
      )}
      <ActionRow inline>
        <ModalButton
          type="submit"
          variant={ready ? "primary" : "secondary"}
          size="sm"
          busy={saving}
          disabled={!ready}
        >
          {saving ? "Saving..." : "Save"}
        </ModalButton>
        <ModalButton variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </ModalButton>
      </ActionRow>
    </form>
  );
};

export const HANDLE_SAVE_ERROR = "We couldn't save that handle. Try again.";

const ProfileUpdate = ({ isGuest }: { isGuest: boolean }) => {
  const { profile, setProfileUpdate } = useProfile();
  // One form open at a time; its draft and its error are the only per-row state.
  const [editing, setEditing] = useState<Network | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // Linking X or Discord writes to the account (decision #9): a guest gets the AuthSheet first.
  const { runWithAccount } = useAccountAction();
  const { mutate, isPending } = useMutation({
    mutationFn: USER_API.saveProfileTwitter,
    onSuccess: (_data, saved) => {
      const patch: Partial<IProfile> = {};
      if (saved.twitter !== undefined) patch.twitter = saved.twitter;
      if (saved.discord !== undefined) patch.discord = saved.discord;
      setProfileUpdate(patch);
      toast({ message: "Saved" });
      setEditing(null);
      setError(null);
    },
    // Said once, under the field it is about (role="alert"), not again in a toast.
    onError: () => setError(HANDLE_SAVE_ERROR),
  });
  const startEdit = (network: Network) =>
    void runWithAccount("sign-in", () => {
      setDraft(profile?.[network] ?? "");
      setError(null);
      setEditing(network);
    });
  const save = (network: Network) => {
    const handle = cleanHandle(draft);
    if (!handle) return;
    setError(null);
    mutate({ [network]: handle, _id: profile?._id });
  };
  const cancel = () => {
    setEditing(null);
    setError(null);
  };

  const row = (network: Network, label: string, file: string) => (
    <HandleRow
      network={network}
      label={label}
      logo={<SocialLogo file={file} />}
      saved={profile?.[network]}
      draft={editing === network ? draft : ""}
      onChange={setDraft}
      editing={editing === network}
      saving={isPending && editing === network}
      locked={editing !== null && editing !== network}
      error={editing === network ? error : null}
      onEdit={() => startEdit(network)}
      onSave={() => save(network)}
      onCancel={cancel}
    />
  );

  return (
    <ModalSection
      title="Linked accounts"
      icon="share"
      helper={
        isGuest
          ? "Save your progress first. Then you can add your X and Discord handles here."
          : "Show your X and Discord handles on your profile."
      }
      data-testid="profile-socials"
      className={isGuest ? "[&>header]:!mb-0" : undefined}
      bodyClassName={isGuest ? "hidden" : undefined}
    >
      {/* A guest saves first (the one primary, above): no second sign-up button here. */}
      {!isGuest && (
        <KeyValueList>
          {row("twitter", "X", "icons/social/x.webp")}
          {row("discord", "Discord", "icons/social/discord.webp")}
        </KeyValueList>
      )}
    </ModalSection>
  );
};

// ---- help and settings -----------------------------------------------------------------------

/** Sound (a summary and a way into Settings), help and, when analytics run, consent. */
const HelpSection = ({ onSupport }: { onSupport: () => void }) => (
  <ModalSection title="Help and settings" icon="sliders" helper="Sound, graphics and support.">
    <KeyValueList>
      <GameMusicToggle />
      <KeyValueRow
        label="Help"
        icon="message"
        value="Questions or bugs? Ask us."
        wrapValue
        data-testid="profile-help"
        action={
          <ModalButton variant="secondary" size="sm" aria-label="Contact support" onClick={onSupport}>
            Contact
          </ModalButton>
        }
      />
      {analytics.enabled && (
        <KeyValueRow
          label="Analytics"
          icon="chart"
          value="Choose what we measure."
          wrapValue
          action={
            <ModalButton variant="secondary" size="sm" aria-label="Change analytics choice" onClick={openConsentSettings}>
              Change
            </ModalButton>
          }
        />
      )}
    </KeyValueList>
  </ModalSection>
);

// ---- account deletion (G9, decision #4) ------------------------------------------------------

export type AccountDeletionResult =
  | { status: "deleted" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export interface AccountDeletionDeps {
  /** iOS native with a Sign in with Apple provider on the account. */
  needsAppleCode: boolean;
  /** A fresh Sign in with Apple authorization code (the backend revokes the Apple token with it). */
  getAppleCode: () => Promise<string | undefined>;
  deleteMe: (appleAuthorizationCode?: string) => Promise<unknown>;
  signOut: () => Promise<void>;
}

export const DELETE_ACCOUNT_ERROR =
  "We couldn't delete your account just now. Try again, or contact support.";

/**
 * `DELETE /user/me`, then sign out (on `/game` the provider starts a fresh guest). On iOS with
 * Sign in with Apple a fresh authorization code is fetched first; cancelling that prompt cancels
 * the deletion, so nothing irreversible happens without the player's last confirmation.
 */
export async function requestAccountDeletion(deps: AccountDeletionDeps): Promise<AccountDeletionResult> {
  let appleCode: string | undefined;
  if (deps.needsAppleCode) {
    try {
      appleCode = await deps.getAppleCode();
    } catch {
      return { status: "cancelled" };
    }
    if (!appleCode) return { status: "cancelled" };
  }
  try {
    await deps.deleteMe(appleCode);
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 429
        ? "Too many tries. Wait a minute, then try again."
        : DELETE_ACCOUNT_ERROR;
    return { status: "error", message };
  }
  try {
    await deps.signOut();
  } catch {
    // The account is gone either way; the next token refresh fails and signs out.
  }
  return { status: "deleted" };
}

const appleAuthorizationCode = async (): Promise<string | undefined> => {
  const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
  return result?.credential?.authorizationCode;
};

/** A guest's first job: save the progress (G1). Shown near the top, as the one primary action. */
const GuestSaveCard = () => {
  const auth = useOptionalFirebaseAuth();
  if (!auth || auth.authStatus !== "guest") return null;
  return (
    <ModalSection
      tone="highlight"
      title="Save your progress"
      icon="bookmark"
      helper="You are playing as a guest. Save to keep your cat and Tails, and to play on other devices."
      data-testid="guest-save"
    >
      <ActionRow>
        <ModalButton variant="primary" icon="bookmark" onClick={() => void auth.requireAccount("save-progress")}>
          SAVE PROGRESS
        </ModalButton>
      </ActionRow>
    </ModalSection>
  );
};

const PROVIDER_NAMES: Record<string, string> = {
  "google.com": "Google",
  "apple.com": "Apple",
  password: "email",
};

/** "With Google", "With Apple and email"; null when the providers are unknown. */
export const signedInWith = (providers?: string[]): string | null => {
  const names = Array.from(new Set((providers ?? []).map((id) => PROVIDER_NAMES[id]).filter(Boolean)));
  return names.length ? `With ${names.join(" and ")}` : null;
};

/** Which account this is ("Signed in, with Google"), and the way out. */
const SignedInRow = ({ providers, onLogout }: { providers?: string[]; onLogout: () => void }) => (
  <KeyValueRow
    label="Signed in"
    icon="check"
    value={signedInWith(providers) ?? "Progress saved"}
    data-testid="profile-signed-in"
    action={
      <ModalButton variant="secondary" size="sm" icon="logout" onClick={onLogout}>
        LOG OUT
      </ModalButton>
    }
  />
);

/**
 * The account block at the end of the profile.
 * - Guest (G1): "Erase guest progress" (`DELETE /user/guest`, with a confirm step) starts a fresh
 *   guest. "Save progress" sits higher up (GuestSaveCard).
 * - Account (G9): Log out, and "Delete account" (`DELETE /user/me`, with a confirm step) replacing
 *   the old "email support" request, set apart in a danger zone.
 */
const AccountSection = ({ close }: { close?: () => void }) => {
  const auth = useOptionalFirebaseAuth();
  const { logout, isFB } = useProfile();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!auth) {
    // No auth runtime on this page: keep the old logout only.
    return isFB ? (
      <ModalSection title="Account" icon="user" data-testid="account-menu">
        <SignedInRow onLogout={logout} />
      </ModalSection>
    ) : null;
  }

  const isGuest = auth.authStatus === "guest";
  const isRegistered = auth.authStatus === "ready";
  // Any signed-in, non-anonymous user can log out, also while the profile loads, failed to load
  // or waits on an email verification; deleting the account needs the loaded profile.
  const canLogout = !isGuest && !!auth.user && !auth.user.isAnonymous;
  if (!isGuest && !canLogout) return null;

  const eraseGuest = async () => {
    setBusy(true);
    setError(null);
    const ok = await auth.eraseGuest();
    setBusy(false);
    if (!ok) {
      setError("We couldn't erase your guest progress just now. Try again.");
      return;
    }
    toast({ message: "Guest progress erased. A fresh guest game starts now." });
    close?.();
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError(null);
    const result = await requestAccountDeletion({
      needsAppleCode:
        Capacitor.getPlatform() === "ios" && !!auth.user?.providers.includes("apple.com"),
      getAppleCode: appleAuthorizationCode,
      deleteMe: USER_API.deleteMe,
      signOut: auth.signOut,
    });
    setBusy(false);
    if (result.status === "cancelled") {
      setError("Apple sign-in was cancelled, so your account was not deleted.");
      return;
    }
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    toast({ message: "Your account was deleted." });
    close?.();
  };

  const errorLine = error ? (
    <p role="alert" className="border-2 border-tt-rust/70 bg-tt-night-950/60 px-3 py-2 font-sans text-p5 font-semibold text-tt-cream">
      {error}
    </p>
  ) : null;

  if (isGuest) {
    return (
      <div data-testid="guest-menu">
        <DangerZone title="Start over" description="Erase this guest game and start a fresh one.">
          {errorLine}
          <ConfirmAction
            label="ERASE GUEST PROGRESS"
            icon="trash"
            message="Your guest cat, runs and pending Tails are removed from this device. This cannot be undone."
            confirmLabel="ERASE"
            cancelLabel="KEEP PLAYING"
            busy={busy}
            confirmTestId="confirm-erase-guest"
            onCancel={() => setError(null)}
            onConfirm={eraseGuest}
          />
        </DangerZone>
      </div>
    );
  }

  return (
    <div data-testid="account-menu" className="flex flex-col gap-4 short:gap-3">
      <ModalSection title="Account" icon="user">
        <SignedInRow providers={auth.user?.providers} onLogout={() => void auth.signOut()} />
      </ModalSection>
      {isRegistered && (
        <DangerZone description="Removes your account. Your cats go back to the shelter pool.">
          {errorLine}
          <ConfirmAction
            label="DELETE ACCOUNT"
            icon="trash"
            message="Your sign-in is deleted, your profile is anonymised and your cats go back to the shelter pool. This cannot be undone."
            confirmLabel="DELETE FOREVER"
            cancelLabel="KEEP MY ACCOUNT"
            busy={busy}
            confirmTestId="confirm-delete-account"
            onCancel={() => setError(null)}
            onConfirm={deleteAccount}
          />
        </DangerZone>
      )}
    </div>
  );
};

// ---- stats -----------------------------------------------------------------------------------

const ProfileStats = ({ profile }: { profile: IProfile }) => {
  const catnip = getCatnipBreakdown({ catnipChaos: profile.catnipChaos, match3: profile.match3 });
  return (
    <ModalSection title="Stats" icon="chart">
      <StatGrid cols={2}>
        <StatTile
          label="Tails"
          // The Token Tails coin, as in the toasts and Match 3.
          icon={<img draggable={false} className="block h-4 w-4 object-contain" alt="" src={cdnFile("logo/logo.webp")} />}
          value={NUMBER.format(Math.round(profile.tails || 0))}
          helper="Rescue points you earn by playing."
          data-testid="stat-tails"
        />
        <StatTile
          label="Catnip"
          icon={<CatnipIcon size={16} alt="" className="block" />}
          tone="mint"
          value={NUMBER.format(catnip.totalCount)}
          unit={`/ ${NUMBER.format(TOTAL_CATNIP_CAP)}`}
          progress={{ value: catnip.totalCount, max: TOTAL_CATNIP_CAP, label: "Catnip found in all levels" }}
          helper="Found across all levels."
          data-testid="stat-catnip"
        />
        <StatTile
          label="Days spun"
          icon="calendar"
          tone="sky"
          value={NUMBER.format(profile.streak || 0)}
          helper="Days you spun the daily wheel."
          data-testid="stat-spins"
        />
        <StatTile
          label="Friends"
          icon="users"
          tone="pink"
          value={NUMBER.format(profile.referralsCount || 0)}
          helper="Joined with your invite link."
          data-testid="stat-friends"
        />
      </StatGrid>
    </ModalSection>
  );
};

const isStarterCat = (cat: ICat | null | undefined): boolean =>
  !!(cat as (ICat & { isStarter?: boolean }) | null | undefined)?.isStarter;

export const ProfileModalContent = ({ close }: { close?: () => void }) => {
  const { profile, setProfileUpdate } = useProfile();
  const auth = useOptionalFirebaseAuth();
  const [renameOpen, setRenameOpen] = useState(false);
  const { setOpenedModal } = useGame();
  const toast = useToast();
  const cat = profile?.cat ?? null;
  const isGuest = auth?.authStatus === "guest";
  // The template starter ("guest-starter") has no document yet: nothing to rename until the
  // guest session exists.
  const canRename = !!cat && isStarterCat(cat) && !!cat._id && cat._id !== "guest-starter" && !!auth;

  const impact = <MyImpactSummary onOpenImpact={() => openProgress(setOpenedModal, "impact")} />;

  return (
    <div
      data-testid="profile-content"
      // Two columns from md up, and on short landscape phones (844x390) too: one column there
      // meant five screens of scrolling with half the width empty.
      className="grid grid-cols-1 items-start gap-4 text-tt-cream animate-appear motion-reduce:animate-none md:grid-cols-2 md:gap-5 short:grid-cols-2 short:gap-3"
    >
      <div className="flex min-w-0 flex-col gap-4 short:gap-3">
        {profile && (
          <ProfileHero profile={profile} canRename={canRename} onRename={() => setRenameOpen(true)} />
        )}
        <GuestSaveCard />
        {profile && <ProfileStats profile={profile} />}
        {/* MY IMPACT: the one summary, under the stats (plan G4, 2.13 row 29). A guest's left
            column already holds Save progress, so theirs opens the right column instead. */}
        {profile && !isGuest && impact}
      </div>
      <div className="flex min-w-0 flex-col gap-4 short:gap-3">
        {profile && isGuest && impact}
        <ProfileUpdate isGuest={isGuest} />
        <HelpSection onSupport={() => setOpenedModal(GameModal.SUPPORT)} />
        <AccountSection close={close} />
      </div>
      {canRename && renameOpen && cat?._id && (
        <RenameSheet
          open={renameOpen}
          onOpenChange={setRenameOpen}
          cat={{ _id: cat._id, name: cat.name }}
          onRenamed={(renamed) => {
            if (profile?.cat?._id === renamed._id) {
              setProfileUpdate({ cat: { ...profile.cat, name: renamed.name } });
            }
            toast({ message: `Meet ${renamed.name}!` });
          }}
        />
      )}
    </div>
  );
};

export const ProfileModal = ({ close }: { close: () => void }) => {
  return (
    <GameDialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="ABOUT ME"
      icon="user"
      description="Your cat, your progress and your account."
      name="profile"
      size="xl"
      // The sheet holds a mute toggle and opens Settings (GameMusicToggle): keep the music audible.
      keepAudio
    >
      <ProfileModalContent close={close} />
    </GameDialog>
  );
};
