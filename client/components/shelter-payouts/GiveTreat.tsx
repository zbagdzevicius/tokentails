import { DonateReceipt, DonateSource, DonateStatus, SHELTER_API } from "@/api/shelter-api";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { Campaign, fetchCampaign } from "./campaign";
import { Celebration } from "./Celebration";
import { SHELTER_CHAINS } from "./chains";
import { formatUnits } from "./logs";
import { CUSTODY_DISCLOSURE } from "./ShelterProfile";

const SHOWCASE_NAME = "Pink Paw (Rožinė pėdutė)";

type Send =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; receipt: DonateReceipt }
  | { status: "already-sent" }
  | { status: "disabled"; message?: string }
  | { status: "error"; message: string };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

// Cat names come from the Heist link; keep them short and plain.
export const cleanCatName = (v: string) =>
  v.replace(/[\u0000-\u001f<>{}[\]\\/"`]/g, "").trim().slice(0, 32);

const usdc = (wei: string | bigint, chainId: number) => {
  const decimals = SHELTER_CHAINS[chainId]?.nativeDecimals ?? 18;
  return formatUnits(typeof wei === "bigint" ? wei : BigInt(wei || "0"), decimals);
};

const safeHttps = (url: string) => (/^https:\/\//.test(url) ? url : null);

// /shelter-payouts/give?from=heist&cat=<name>: one tap and Token Tails sends a small USDC treat
// through ShelterSplit from its own wallet. No wallet, no gas, no crypto knowledge needed.
export const GiveTreat = () => {
  const router = useRouter();
  const { user, showSignInPopup } = useFirebaseAuth();
  const [status, setStatus] = useState<DonateStatus | null | undefined>(undefined);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [send, setSend] = useState<Send>({ status: "idle" });

  const source: DonateSource = first(router.query.from) === "heist" ? "heist" : "page";
  const cat = cleanCatName(first(router.query.cat));
  const shelterName = campaign?.shelter.name || SHOWCASE_NAME;

  const loadStatus = useCallback(() => {
    SHELTER_API.getDonateStatus().then(setStatus);
  }, []);

  useEffect(() => {
    loadStatus();
    fetchCampaign().then(setCampaign).catch(() => undefined);
  }, [loadStatus]);

  const give = async () => {
    if (!user) {
      showSignInPopup();
      return;
    }
    setSend({ status: "sending" });
    const result = await SHELTER_API.donate(source);
    if (result.status === "signed-out") {
      setSend({ status: "idle" });
      showSignInPopup();
      return;
    }
    setSend(result.status === "sent" ? { status: "sent", receipt: result.receipt } : result);
    if (result.status === "sent") loadStatus();
  };

  const chainId = status?.chainId || 5042;
  const amountWei = status ? BigInt(status.amountWei || "0") : BigInt(0);
  const treatsLeft =
    status && amountWei > BigInt(0) ? BigInt(status.remainingTodayWei || "0") / amountWei : BigInt(0);
  const available = !!status?.enabled && treatsLeft > BigInt(0);

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-4 px-4 pb-16 text-center font-secondary text-p5">
      <h2 className="font-primary uppercase tracking-tight text-h6 md:text-h3 text-balance">
        {cat ? `${cat} is safe!` : "Rescue"}
        <span className="block text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)]">
          Send a treat to {shelterName}
        </span>
      </h2>

      <p className="max-w-md">
        One tap and Token Tails sends a small USDC treat to the shelter through the ShelterSplit
        contract. It&apos;s on us, and it&apos;s public on the chain.
      </p>

      {status === undefined && <p className="animate-pulse">Checking today&apos;s treat jar…</p>}
      {status === null && <p>Treats are resting right now. Come back a bit later.</p>}
      {status && (
        <p data-testid="treat-amount">
          Each treat: <strong>{usdc(status.amountWei, chainId)} USDC</strong>
          {status.enabled && ` · ${treatsLeft.toString()} left in today's jar`}
        </p>
      )}

      {send.status !== "sent" && (
        <button
          type="button"
          onClick={give}
          disabled={send.status === "sending" || (!!user && !available)}
          className="rounded-2xl border-4 border-yellow-900 bg-pink-400 px-6 py-4 font-primary uppercase text-p2 text-black shadow-lg transition hover:scale-105 disabled:opacity-60 disabled:hover:scale-100"
          data-testid="send-treat"
        >
          {send.status === "sending"
            ? "Sending… 🐾"
            : user
            ? "Send Pink Paw a rescue treat 🐾"
            : "Sign in to send a treat 🐾"}
        </button>
      )}

      {status && !status.enabled && send.status === "idle" && (
        <p>The treat jar is closed for now. Check back soon.</p>
      )}
      {status?.enabled && treatsLeft === BigInt(0) && send.status === "idle" && (
        <p>Today&apos;s treat jar is empty. It refills at midnight UTC.</p>
      )}

      {send.status === "sent" && (
        <div className="w-full rounded-xl border-2 border-yellow-900 bg-black/60 p-4" role="status">
          <Celebration />
          <p className="font-primary uppercase text-p3">Treat sent! 🎉</p>
          <p className="mt-1">
            {usdc(send.receipt.amountWei, send.receipt.chainId)} USDC is on its way to {shelterName}.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            <Link
              href={`/shelter-payouts/receipt?chain=${send.receipt.chainId}&tx=${send.receipt.txHash}`}
              className="rounded-full border-2 border-yellow-900 bg-yellow-300 px-4 py-1 font-primary uppercase text-black"
            >
              See your receipt
            </Link>
            {safeHttps(send.receipt.explorerUrl) && (
              <a
                href={safeHttps(send.receipt.explorerUrl) as string}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border-2 border-yellow-900 px-4 py-1 font-primary uppercase"
              >
                View on explorer
              </a>
            )}
          </div>
        </div>
      )}
      {send.status === "already-sent" && (
        <p role="status">You already sent a treat today. Come back tomorrow for another one! 🐾</p>
      )}
      {send.status === "disabled" && (
        <p role="status">The treat jar is closed right now{send.message ? `: ${send.message}` : "."}</p>
      )}
      {send.status === "error" && (
        <p className="text-red-300" role="alert">
          {send.message}
        </p>
      )}

      <p className="max-w-md rounded-xl bg-yellow-300 px-4 py-2 text-black" data-testid="custody-disclosure">
        {CUSTODY_DISCLOSURE}
      </p>
      <Link href="/shelter-payouts" className="underline">
        See every payout on the chain
      </Link>
    </div>
  );
};

export default GiveTreat;
