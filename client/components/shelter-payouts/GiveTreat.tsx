import { DonateIneligibleReason, DonateReceipt, DonateSource, DonateStatus, SHELTER_API } from "@/api/shelter-api";
import { isAppBuild } from "@/components/claims/build";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CampaignMeter } from "./CampaignMeter";
import { Celebration } from "./Celebration";
import { GOAL_REFRESH_EVENT, useCampaignGoal } from "./goal";
import { headingName, isPinkPawWallet } from "./pinkPaw";
import { Sym } from "./payoutSections";
import { PinkPawLogo, PinkPawStrip } from "./PinkPawShowcase";
import { custodyDisclosure } from "./ShelterProfile";
import { TreatChip, initialTreatChain, parseChainParam, treatAmount, treatChips, treatsLeft as chainTreatsLeft } from "./treatChains";
import { FIGURE, GOLD_BUTTON, Kicker, NightStage, PANEL, PILL, PinkCat } from "./ui";

const SHOWCASE_NAME = "Pink Paw (Rožinė pėdutė)";

type Send =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; receipt: DonateReceipt }
  | { status: "already-sent" }
  | { status: "not-eligible"; reason: DonateIneligibleReason; eligibleAt: string | null }
  | { status: "disabled"; message?: string }
  | { status: "error"; message: string };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

// Cat names come from the Heist link; keep them short and plain.
export const cleanCatName = (v: string) =>
  v.replace(/[\u0000-\u001f<>{}[\]\\/"`]/g, "").trim().slice(0, 32);

/**
 * The network chips (web builds only): one per chain, the coin it pays in, greyed out with a short
 * reason when the backend does not serve treats there right now.
 */
export const TreatChainChips = ({
  chips,
  value,
  onPick,
  locked,
}: {
  chips: TreatChip[];
  value: number;
  onPick: (chainId: number) => void;
  /** While a treat is on its way the network cannot change. */
  locked: boolean;
}) => (
  <div className="flex w-full flex-col items-center gap-2">
    <p id="treat-network-label" className="text-tt-cream/85">
      Pick a network
    </p>
    <div
      role="radiogroup"
      aria-labelledby="treat-network-label"
      className="flex flex-wrap justify-center gap-2"
      data-testid="treat-networks"
    >
      {chips.map((c) => {
        const checked = c.chainId === value;
        return (
          <button
            key={c.chainId}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={!c.enabled || locked}
            onClick={() => onPick(c.chainId)}
            title={c.detail || c.reason || undefined}
            data-testid={`treat-chain-${c.chainId}`}
            className={`flex min-h-11 flex-col items-center justify-center rounded-full border-2 px-4 py-1 leading-tight transition-colors ${
              checked
                ? "border-tt-gold-400 bg-tt-night-950 text-tt-cream"
                : c.enabled
                ? "border-tt-cream/50 text-tt-cream hover:border-tt-cream"
                : "cursor-not-allowed border-dashed border-tt-cream/30 text-tt-cream/50"
            }`}
          >
            <span className="font-primary uppercase">{c.name}</span>
            <span className="text-p6 md:text-p5">
              {c.coin}
              {c.reason ? ` · ${c.reason}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

// What a signed-in account still needs before the backend's treat policy (F7.5) lets it send.
export const notEligibleMessage = (reason: DonateIneligibleReason, eligibleAt: string | null) => {
  if (reason === "email-unverified") return "Verify your email to send a treat. Check your inbox for the link.";
  if (reason === "account-too-new") {
    const at = eligibleAt ? new Date(eligibleAt) : null;
    return at && !Number.isNaN(at.getTime())
      ? `Treats open a day after you join. Yours opens ${at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`
      : "Treats open a day after you join. Come back tomorrow!";
  }
  return "Play a game with your cat first, then come back to send a treat.";
};

const safeHttps = (url: string) => (/^https:\/\//.test(url) ? url : null);

// /shelter-payouts/give?from=heist&cat=<name>: one tap and Token Tails sends a small stablecoin treat
// (the picked network's coin) through ShelterSplit from its own wallet. No wallet, no gas, no crypto knowledge needed.
export const GiveTreat = () => {
  const router = useRouter();
  // App builds (store copy rule, F7.2): no token names, chain wording or explorer links; the
  // receipt and payout pages show the web proof notice there.
  const isApp = isAppBuild();
  const { authStatus, requireAccount } = useFirebaseAuth();
  // Treats are sent from an account (guests are refused by the backend), so a guest or a
  // signed-out visitor gets the AuthSheet, never a wall (G1).
  const signedIn = authStatus === "ready";
  const [status, setStatus] = useState<DonateStatus | null | undefined>(undefined);
  // The campaign and its live goal meter (fact C-001), read from the shelter wallet.
  const goal = useCampaignGoal();
  const campaign = goal.campaign;
  const [send, setSend] = useState<Send>({ status: "idle" });
  // The picked network (web only; app builds always use the backend's main chain). Null until the
  // status is known, then `?chain=<id>` when that chain is open, else the main chain (Arc).
  const [picked, setPicked] = useState<number | null>(null);
  const [wantedClosed, setWantedClosed] = useState(false);

  const source: DonateSource = first(router.query.from) === "heist" ? "heist" : "page";
  const cat = cleanCatName(first(router.query.cat));
  const shelterName = campaign?.shelter.name || SHOWCASE_NAME;
  // Pink Paw's logo and cats only when the campaign is Pink Paw's (the default name is Pink Paw's
  // until campaign.json loads). Under another shelter's name they would be an untrue claim.
  const pinkPaw = campaign ? isPinkPawWallet(campaign.shelter.wallet) : true;

  const loadStatus = useCallback(() => {
    SHELTER_API.getDonateStatus().then(setStatus);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const chips = useMemo(() => treatChips(status), [status]);
  const wantedChain = isApp ? null : parseChainParam(first(router.query.chain));
  useEffect(() => {
    if (status === undefined || picked !== null) return;
    const mainId = status?.chainId || 5042;
    const initial = isApp ? mainId : initialTreatChain(chips, wantedChain, mainId);
    setPicked(initial);
    setWantedClosed(wantedChain !== null && wantedChain !== initial);
  }, [status, chips, picked, isApp, wantedChain]);

  const give = async () => {
    if (!signedIn && (await requireAccount("give-treat")) !== "signed-in") return;
    setSend({ status: "sending" });
    // The main chain is sent exactly as before (no chainId); another network names its chain.
    const pickedChain = mainChain ? undefined : chainId;
    let result = await SHELTER_API.donate(source, pickedChain);
    if (result.status === "signed-out") {
      // The session lapsed between the check and the send: ask once more, then retry once.
      setSend({ status: "idle" });
      if ((await requireAccount("give-treat")) !== "signed-in") return;
      setSend({ status: "sending" });
      result = await SHELTER_API.donate(source, pickedChain);
      if (result.status === "signed-out") {
        setSend({ status: "error", message: "Please sign in again to send the treat." });
        return;
      }
    }
    if (result.status === "not-eligible") {
      setSend({ status: "not-eligible", reason: result.reason, eligibleAt: result.eligibleAt });
      return;
    }
    setSend(result.status === "sent" ? { status: "sent", receipt: result.receipt } : result);
    if (result.status === "sent") {
      loadStatus();
      // The treat lands in the shelter wallet: read the goal meter again once the chain has it.
      window.setTimeout(() => window.dispatchEvent(new Event(GOAL_REFRESH_EVENT)), 4000);
    }
  };

  const mainChainId = status?.chainId || 5042;
  const chainId = picked ?? mainChainId;
  const mainChain = chainId === mainChainId;
  const chip = chips.find((c) => c.chainId === chainId) || null;
  const chainStatus = chip?.status || null;
  const treatsLeft = chainStatus ? chainTreatsLeft(chainStatus) : BigInt(0);
  const available = !!chip?.enabled && treatsLeft > BigInt(0);
  // Once the status is known and the jar is closed (backend unreachable, rail paused, or today's
  // budget spent), nobody is asked to sign in for a treat that cannot be sent.
  const closed = status !== undefined && !available;

  return (
    <NightStage className="min-h-screen">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 px-4 pt-24 pb-16 text-center text-p5 md:pt-32 md:text-p4">
        <Kicker>{cat ? "Rescue complete" : "Rescue treat"}</Kicker>
        {pinkPaw ? (
          // The shelter's real logo, with the landing's pixel cat sitting beside it.
          <div className="relative">
            <PinkPawLogo className="h-36 w-36 md:h-44 md:w-44" />
            <PinkCat
              lick={send.status === "sent"}
              className="pointer-events-none absolute bottom-0 -right-6 h-24 w-24 max-w-none translate-x-1/2 md:h-28 md:w-28"
            />
          </div>
        ) : (
          <div className="flex h-36 w-36 items-end justify-center overflow-hidden rounded-2xl border-4 border-tt-cream bg-gradient-to-b from-tt-dusk-top via-tt-dusk-mid to-tt-dusk-horizon shadow-[0_0_30px_rgb(var(--tt-gold-400)/.35)] md:h-44 md:w-44">
            <PinkCat lick={send.status === "sent"} className="-mb-8 h-52 w-52 max-w-none shrink-0 md:h-64 md:w-64 md:-mb-10" />
          </div>
        )}
        <h1 className="font-primary uppercase leading-none tracking-tight text-h5 md:text-h3 text-white drop-shadow-lg text-balance">
          {/* The kicker already says "Rescue treat"; the bare "Rescue" line above this was a repeat. */}
          {cat && <span className="block">{cat} is safe!</span>}
          <span className={`glow block text-tt-cream ${cat ? "mt-2" : ""}`}>Send a treat to {headingName(shelterName)}</span>
        </h1>

        <p className="max-w-md text-tt-cream/90">
          {isApp
            ? // claim: C-004, L-rail (the treat size setting; the button is live only with the rail)
              "One tap and Token Tails sends a small treat to the shelter. It's on us, and every payout is listed on our website."
            : // claim: C-004, L-rail (the coin follows the picked network: USDC, USDC.e on Tempo, USDG on Robinhood Chain)
              `One tap and Token Tails sends a small ${chip?.coin || "stablecoin"} treat to the shelter through the ShelterSplit contract. It's on us, and it's public on the chain.`}
        </p>

        <section className={`${PANEL} flex flex-col items-center gap-4`}>
          {status === undefined && <p className="motion-safe:animate-pulse">Checking today&apos;s treat jar…</p>}
          {status === null && <p>Treats are resting right now. Come back a bit later.</p>}
          {!isApp && status !== undefined && (
            <TreatChainChips
              chips={chips}
              value={chainId}
              onPick={(id) => {
                setPicked(id);
                setWantedClosed(false);
              }}
              locked={send.status === "sending" || send.status === "sent"}
            />
          )}
          {!isApp && wantedClosed && (
            <p className="text-p6 md:text-p5 text-tt-cream/80" data-testid="treat-chain-fallback">
              That network is not sending treats right now, so {chip?.name || "the main network"} is picked.
            </p>
          )}
          {status && chip && (
            <p data-testid="treat-amount" className="font-primary uppercase tracking-wide text-p4 md:text-p3">
              {isApp ? (
                "Token Tails pays for every treat"
              ) : (
                <>
                  Each treat:{" "}
                  <strong className="text-tt-gold-400">
                    {treatAmount(chainStatus?.amountWei || status.amountWei)} <Sym>{chip.coin}</Sym>
                  </strong>{" "}
                  on {chip.name}
                </>
              )}
              {chainStatus?.enabled && ` · ${treatsLeft.toString()} left in today's jar`}
            </p>
          )}

          {send.status !== "sent" && (
            // A closed jar shows a flat outline chip, not a dimmed gold button that still looks tappable.
            <button
              type="button"
              onClick={give}
              disabled={send.status === "sending" || closed}
              aria-disabled={closed || undefined}
              className={
                closed
                  ? "inline-flex min-h-12 cursor-not-allowed items-center justify-center whitespace-nowrap rounded-full border-2 border-dashed border-tt-cream/50 px-5 py-2 font-primary text-p4 uppercase tracking-wide text-tt-cream/75 md:text-p3"
                  : `${GOLD_BUTTON} min-h-14 whitespace-nowrap px-6 py-3 text-p3 md:text-p2`
              }
              data-testid="send-treat"
            >
              {closed
                ? "Treat jar opens soon"
                : send.status === "sending"
                ? "Sending… 🐾"
                : signedIn
                ? "Send a treat 🐾"
                : "Sign in to send a treat 🐾"}
            </button>
          )}

          {/* A paused rail says so in the chip above ("Treat jar opens soon"); no second line. */}
          {chainStatus?.enabled && treatsLeft === BigInt(0) && send.status === "idle" && (
            <p className="text-tt-cream/85">Today&apos;s treat jar is empty. It refills at midnight UTC.</p>
          )}

          {send.status === "sent" && (
            <div className="flex w-full flex-col items-center gap-2" role="status">
              <Celebration />
              <p className={`${FIGURE} text-h5 md:text-h4 uppercase`}>Treat sent!</p>
              <p data-testid="treat-sent-line">
                {isApp
                  ? `Token Tails is sending your treat to ${shelterName}.`
                  : `${treatAmount(send.receipt.amountWei)} ${send.receipt.coin || chip?.coin || "USDC"} is on its way to ${shelterName} on ${
                      chips.find((c) => c.chainId === send.receipt.chainId)?.name || chip?.name || `chain ${send.receipt.chainId}`
                    }.`}
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                <Link
                  href={`/shelter-payouts/receipt?chain=${send.receipt.chainId}&tx=${send.receipt.txHash}`}
                  className={GOLD_BUTTON}
                >
                  See your receipt
                </Link>
                {!isApp && safeHttps(send.receipt.explorerUrl) && (
                  <a
                    href={safeHttps(send.receipt.explorerUrl) as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={PILL}
                  >
                    View on explorer
                  </a>
                )}
              </div>
            </div>
          )}
          {send.status === "already-sent" && (
            <p role="status">Token Tails already sent your treat today. Come back tomorrow for another one! 🐾</p>
          )}
          {send.status === "not-eligible" && (
            <p role="status" data-testid="treat-not-eligible">
              {notEligibleMessage(send.reason, send.eligibleAt)}
            </p>
          )}
          {send.status === "disabled" && (
            <p role="status">The treat jar is closed right now{send.message ? `: ${send.message}` : "."}</p>
          )}
          {send.status === "error" && (
            <p className="text-tt-rust" role="alert">
              {send.message}
            </p>
          )}
        </section>

        <p
          className="max-w-md rounded-xl border-2 border-tt-cream/70 bg-tt-night-900/80 px-4 py-2 text-p6 md:text-p5 text-tt-cream"
          data-testid="custody-disclosure"
        >
          {custodyDisclosure(isApp, campaign?.shelter.handover)}
        </p>
        {/* The goal meter: web only (USDC and chain words never reach app builds). */}
        {!isApp && campaign && goal.progress && (
          <CampaignMeter campaign={campaign} progress={goal.progress} state={goal.state} compact className="w-full text-left" />
        )}
        <Link href="/shelter-payouts" className={PILL}>
          {isApp ? "See every payout ›" : "See every payout on the chain ›"}
        </Link>

        {pinkPaw && (
          <div className="mt-6 w-full">
            <PinkPawStrip name={shelterName} title="Who your treat helps" showLogo={false} />
          </div>
        )}
      </div>
    </NightStage>
  );
};

export default GiveTreat;
