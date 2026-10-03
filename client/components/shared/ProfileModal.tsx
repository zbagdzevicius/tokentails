import { ApiError } from "@/api/api";
import { USER_API } from "@/api/user-api";
import { CatnipIcon } from "@/components/shared/CatnipIcon";
import { GameModal as GameDialog } from "@/components/ui/GameModal";
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
import clsx from "clsx";
import dynamic from "next/dynamic";
import { useId, useState, type ReactNode } from "react";
import {
  getCatnipBreakdown,
  TOTAL_CATNIP_CAP,
} from "@/constants/catnip-accounting";
import { GameMusicToggle } from "./GameMusicToggler";
import { AnalyticsSettingsButton } from "./AnalyticsConsentBanner";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { MyImpactSummary } from "@/components/impact/MyImpactSummary";
import { openProgress } from "@/components/impact/progressTab";

const Cat = ({ profile }: { profile?: IProfile | null }) => {
  return (
    <div className="relative">
      <img
        draggable={false}
        className="w-24 m-auto pixelated -mt-2 mb-1 relative z-10"
        src={profile?.cat?.catImg || "/logo/logo.webp"}
        alt={profile?.cat?.name ? `${profile.cat.name}, your cat` : ""}
      />
    </div>
  );
};

// RenameSheet belongs to the onboarding flow (task 4a, G3 "Names", decision #22). Loaded on
// demand: the profile opens far more often than anyone renames a cat.
const RenameSheet = dynamic(
  () => import("@/components/onboarding/RenameSheet").then((module) => module.RenameSheet),
  { ssr: false }
);

/** Night input used by the profile forms. */
const INPUT_CLASSES =
  "min-h-[44px] w-full rounded-[4px] border-2 border-tt-gold-500 bg-tt-night-900 px-3 py-2 font-secondary text-p5 text-tt-cream placeholder:text-tt-muted outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400";

const StatPlate = ({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) => (
  <div className="flex flex-col items-center gap-1">
    <div className="text-p5 flex items-center gap-1 text-tt-cream">
      {icon}
      <div>{label}</div>
    </div>
    <div className="flex min-w-[4.5rem] items-center justify-center rounded-[4px] border-2 border-tt-gold-500/70 bg-tt-night-900/80 px-2 text-p6 text-tt-cream">
      {children}
    </div>
  </div>
);

const ProfileUpdate = () => {
  const { profile } = useProfile();
  const [twitter, setTwitter] = useState(profile?.twitter);
  const [discord, setDiscord] = useState(profile?.discord);
  const [twitterEditMode, setTwitterEditMode] = useState(false);
  const [discordEditMode, setDiscordEditMode] = useState(false);
  const toast = useToast();
  // Linking X or Discord writes to the account (decision #9): a guest gets the AuthSheet first.
  const { runWithAccount } = useAccountAction();
  const twitterId = useId();
  const discordId = useId();
  const { mutate, isPending } = useMutation({
    mutationFn: USER_API.saveProfileTwitter,
    onSuccess: () => {
      toast({ message: "Successfully connected" });
      setTwitterEditMode(false);
      setDiscordEditMode(false);
    },
  });
  const twitterButtonText = twitterEditMode
    ? isPending
      ? "Saving..."
      : "Save"
    : twitter
    ? "Edit"
    : "Connect";
  const onTwitterButtonClick = () => {
    if (!twitterEditMode) {
      void runWithAccount("sign-in", () => setTwitterEditMode(true));
    } else if (twitter?.length) {
      mutate({
        twitter: twitter.trim().replace("@", "").toLowerCase(),
        _id: profile?._id,
      });
    }
  };
  const discordButtonText = discordEditMode
    ? isPending
      ? "Saving..."
      : "Save"
    : discord
    ? "Edit"
    : "Connect";
  const onDiscordButtonClick = () => {
    if (!discordEditMode) {
      void runWithAccount("sign-in", () => setDiscordEditMode(true));
    } else if (discord?.length) {
      mutate({
        discord: discord.trim().replace("@", "").toLowerCase(),
        _id: profile?._id,
      });
    }
  };

  return (
    <div className="flex items-center flex-col justify-center mt-2 mb-2 gap-1">
      <img
        className="w-8 -mb-3"
        src={cdnFile("icons/social/x.webp")}
        alt=""
        aria-hidden="true"
        draggable="false"
      />
      {!twitterEditMode ? (
        <Tag size="sm">{twitter ? `X: ${twitter}` : "X is not connected"}</Tag>
      ) : (
        <>
          <label htmlFor={twitterId} className="sr-only">
            Your X handle
          </label>
          <input
            id={twitterId}
            type="text"
            autoComplete="off"
            value={twitter}
            onChange={(e) => setTwitter(e.target.value?.slice(0, 24))}
            className={INPUT_CLASSES}
            placeholder="Your X Handle"
            autoFocus
          />
        </>
      )}
      <span className="-mt-2">
        <PixelButton
          disabled={isPending}
          size="sm"
          text={twitterButtonText}
          onClick={onTwitterButtonClick}
        />
      </span>
      <img
        className="w-8 -mb-3"
        src={cdnFile("icons/social/discord.webp")}
        alt=""
        aria-hidden="true"
        draggable="false"
      />
      {!discordEditMode ? (
        <Tag size="sm">
          {discord ? `Discord: ${discord}` : "Discord is not connected"}
        </Tag>
      ) : (
        <>
          <label htmlFor={discordId} className="sr-only">
            Your Discord handle
          </label>
          <input
            id={discordId}
            type="text"
            autoComplete="off"
            value={discord}
            onChange={(e) => setDiscord(e.target.value?.slice(0, 24))}
            className={INPUT_CLASSES}
            placeholder="Your Discord Handle"
            autoFocus
          />
        </>
      )}
      <span className="-mt-2">
        <PixelButton
          disabled={isPending}
          size="sm"
          text={discordButtonText}
          onClick={onDiscordButtonClick}
        />
      </span>
    </div>
  );
};

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

type AccountStep = "menu" | "confirm-erase" | "confirm-delete";

/**
 * The account block at the bottom of the profile.
 * - Guest (G1): "Save progress" opens the AuthSheet; "Erase guest progress" (`DELETE /user/guest`,
 *   with a confirm step) starts a fresh guest.
 * - Account (G9): Logout, and "Delete account" (`DELETE /user/me`, with a confirm step) replacing
 *   the old "email support" request.
 */
const AccountSection = ({ close }: { close?: () => void }) => {
  const auth = useOptionalFirebaseAuth();
  const { logout, isFB } = useProfile();
  const toast = useToast();
  const [step, setStep] = useState<AccountStep>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  if (!auth) {
    // No auth runtime on this page: keep the old logout only.
    return isFB ? (
      <div className="mt-2 flex justify-center">
        <PixelButton size="sm" text="Logout :(" onClick={logout} />
      </div>
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
    <p id={errorId} role="alert" className="rounded-[4px] border-2 border-tt-rust/70 bg-tt-night-900/80 px-3 py-2 text-center font-secondary text-p5 text-tt-cream">
      {error}
    </p>
  ) : null;

  if (step === "confirm-erase" || step === "confirm-delete") {
    const erase = step === "confirm-erase";
    return (
      <section
        aria-labelledby={`${errorId}-confirm`}
        data-testid={erase ? "confirm-erase-guest" : "confirm-delete-account"}
        className="mt-3 flex w-full max-w-sm flex-col items-center gap-2 rounded-[4px] border-2 border-tt-rust/70 bg-tt-night-900/80 p-3 text-center"
      >
        <h3 id={`${errorId}-confirm`} className="font-primary text-p4 uppercase text-tt-cream">
          {erase ? "Erase guest progress?" : "Delete your account?"}
        </h3>
        <p className="font-secondary text-p5 text-tt-cream">
          {erase
            ? "Your guest cat, runs and pending Tails are removed from this device. This cannot be undone."
            : "Your sign-in is deleted, your profile is anonymised and your cats go back to the shelter pool. This cannot be undone."}
        </p>
        {errorLine}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <PixelButton
            size="sm"
            text={erase ? "ERASE" : "DELETE FOREVER"}
            busy={busy}
            onClick={erase ? eraseGuest : deleteAccount}
          />
          <PixelButton
            size="sm"
            text={erase ? "KEEP PLAYING" : "KEEP MY ACCOUNT"}
            disabled={busy}
            onClick={() => {
              setError(null);
              setStep("menu");
            }}
          />
        </div>
      </section>
    );
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-1" data-testid={isGuest ? "guest-menu" : "account-menu"}>
      {errorLine}
      {isGuest ? (
        <>
          <PixelButton
            size="sm"
            text="SAVE PROGRESS"
            onClick={() => void auth.requireAccount("save-progress")}
          />
          <PixelButton size="sm" text="ERASE GUEST PROGRESS" onClick={() => setStep("confirm-erase")} />
        </>
      ) : (
        <>
          <PixelButton size="sm" text="Logout :(" onClick={() => void auth.signOut()} />
          {isRegistered && (
            <PixelButton size="sm" text="DELETE ACCOUNT" onClick={() => setStep("confirm-delete")} />
          )}
        </>
      )}
    </div>
  );
};

const isStarterCat = (cat: ICat | null | undefined): boolean =>
  !!(cat as (ICat & { isStarter?: boolean }) | null | undefined)?.isStarter;

export const ProfileModalContent = ({ close }: { close?: () => void }) => {
  const { profile, setProfileUpdate } = useProfile();
  const auth = useOptionalFirebaseAuth();
  const catnipBreakdown = getCatnipBreakdown({
    catnipChaos: profile?.catnipChaos,
    match3: profile?.match3,
  });
  const [renameOpen, setRenameOpen] = useState(false);
  const { setOpenedModal } = useGame();
  const toast = useToast();
  const cat = profile?.cat ?? null;
  // The template starter ("guest-starter") has no document yet: nothing to rename until the
  // guest session exists.
  const canRename = !!cat && isStarterCat(cat) && !!cat._id && cat._id !== "guest-starter" && !!auth;

  return (
    <div className="pt-2 pb-4 px-1 md:px-2 text-tt-cream flex flex-col md:flex-row md:gap-6 justify-between items-center animate-appear">
      {profile && (
        <div className="m-auto font-primary">
          {cat && (
            <span className="relative z-0">
              <Cat profile={profile} />
            </span>
          )}
          <div className="relative z-10">
            <div className="font-paws text-p3 text-center">
              Hello, {profile.name}
            </div>
            {canRename && (
              <div className="flex justify-center -mt-2">
                <PixelButton size="sm" text={`RENAME ${cat?.name || "YOUR CAT"}`} onClick={() => setRenameOpen(true)} />
              </div>
            )}
          </div>
          <div className="flex justify-center -mb-4" role="group" aria-label="Profile sections">
            <PixelButton
              size="sm"
              text="MY IMPACT"
              onClick={() => openProgress(setOpenedModal, "impact")}
            />
            <PixelButton
              size="sm"
              text="SUPPORT"
              onClick={() => setOpenedModal(GameModal.SUPPORT)}
            />
          </div>
          <section className="flex justify-between gap-2 mt-4" aria-label="Stats">
            <StatPlate label="CATNIP" icon={<CatnipIcon size={16} alt="" />}>
              {catnipBreakdown.totalCount} / {TOTAL_CATNIP_CAP}
            </StatPlate>
            <StatPlate
              label="TAILS"
              icon={<img draggable={false} className="h-4" alt="" aria-hidden="true" src={cdnFile("logo/logo.webp")} />}
            >
              {profile?.tails?.toFixed(0) || 0}
            </StatPlate>
            <StatPlate
              label="CHECKS"
              icon={<img draggable={false} className="w-5" alt="" aria-hidden="true" src={cdnFile("logo/rocket.png")} />}
            >
              {profile?.streak || 0}
            </StatPlate>
            <StatPlate
              label="INVITES"
              icon={<img draggable={false} className="w-4 h-4" alt="" aria-hidden="true" src={cdnFile("logo/friends.png")} />}
            >
              {profile?.referralsCount || 0}
            </StatPlate>
          </section>

          {/* MY IMPACT: the one-row summary, always under the stats (plan G4, 2.13 row 29). */}
          <MyImpactSummary onOpenImpact={() => openProgress(setOpenedModal, "impact")} />
        </div>
      )}
      <div className={clsx("flex flex-col items-center justify-center", "mt-4 md:mt-0")}>
        <ProfileUpdate />
        <GameMusicToggle />
        <AnalyticsSettingsButton />
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
      name="profile"
      size="lg"
      // The sheet holds the sound controls (GameMusicToggle): keep the music audible while they move.
      keepAudio
    >
      <ProfileModalContent close={close} />
    </GameDialog>
  );
};
