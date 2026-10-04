// copy-lint: web-only app builds render AppProofNotice instead (the isAppBuild gate in ShelterOnboard)
// /shelter-payouts/onboard: the shelter takes its own payout wallet. The shelter connects any wallet
// it controls, signs the claim message, and Token Tails records the claim; the ShelterSplit owner then
// re-points the shelter's entry on-chain. Token Tails never sees or stores the shelter's key.
import { isAppBuild } from "@/components/claims/build";
import NextLink from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppProofNotice } from "./AppProofNotice";
import { Campaign, fetchCampaign } from "./campaign";
import { claimMessage, utf8ToHex } from "./claim";
import { SHELTER_CHAINS } from "./chains";
import { shortShelterName } from "./giveMode";
import { toChecksumAddress } from "./keccak";
import { ClaimView, getClaim, getMatchStatus, postClaim } from "./relayApi";
import { CARD, CHIP, GOLD_BUTTON, Kicker, NightStage, PANEL, PILL, PinkCat } from "./ui";
import { getInjectedProvider, walletErrorMessage } from "./wallet";

/** The ShelterSplit chains besides the campaign's: a handover re-points the entry on each one. */
const OTHER_CHAINS = ["Arc", "Tempo", "Arbitrum One", "Avalanche C-Chain", "Base", "Robinhood Chain", "Monad"];

type Step =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "connected"; wallet: string }
  | { status: "signing"; wallet: string }
  | { status: "sent"; wallet: string }
  | { status: "error"; message: string; wallet?: string };

/** Said right after the claim is sent: the public status only shows a claim once Token Tails confirmed it. */
export const CLAIM_RECEIVED =
  "Claim received. Token Tails will confirm it with the shelter by a separate channel, then register it on-chain.";

/**
 * The plain-language status of the latest claim. `justSent`: this page sent a claim a moment ago (the
 * backend keeps an unconfirmed claim private, so the public status still reads as no claim).
 */
export function claimStatusCopy(claim: ClaimView | null | undefined, justSent = false): string {
  if (claim === undefined) return "Could not reach Token Tails to read the claim status. Try again in a minute.";
  if (claim === null) return justSent ? CLAIM_RECEIVED : "No wallet has been claimed yet.";
  if (claim.status === "rotated") return "Registered: payouts now go to this wallet.";
  if (claim.status === "rejected") return "Not accepted. Write to Token Tails and we will sort it out together.";
  return "Waiting for Token Tails to register this wallet on-chain.";
}

const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;

export const ShelterOnboard = () => (isAppBuild() ? <AppProofNotice title="Shelter wallet" /> : <WebShelterOnboard />);

const StepCard = ({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) => (
  <li className={`${CARD} flex flex-col gap-3`}>
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-primary text-p3 ${
          done ? "border-tt-mint bg-tt-mint/20 text-tt-mint" : "border-tt-gold-400 text-tt-gold-400"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <h2 className="font-primary text-p2 md:text-p1 uppercase leading-none text-tt-cream">
        <span className="sr-only">Step {n}: </span>
        {title}
        {done && <span className="sr-only"> (done)</span>}
      </h2>
    </div>
    <div className="flex flex-col gap-2 text-p5 md:text-p4 text-tt-cream/90">{children}</div>
  </li>
);

const WebShelterOnboard = () => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [step, setStep] = useState<Step>({ status: "idle" });
  const [claim, setClaim] = useState<ClaimView | null | undefined>(undefined);
  const [claimLoaded, setClaimLoaded] = useState(false);
  // The chain the backend takes claims for (its main chain). Null until read: then the campaign's.
  const [backendChainId, setBackendChainId] = useState<number | null>(null);

  const refreshClaim = useCallback(async () => {
    const c = await getClaim();
    setClaim(c);
    setClaimLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCampaign().then((c) => !cancelled && setCampaign(c)).catch(() => undefined);
    getMatchStatus().then((m) => !cancelled && m?.chainId && setBackendChainId(m.chainId));
    getClaim().then((c) => {
      if (cancelled) return;
      setClaim(c);
      setClaimLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shelter = campaign ? shortShelterName(campaign.shelter.name) : "The shelter";
  // The claim names the chain the backend registers wallets on; the campaign's chain is the fallback.
  const chainId = backendChainId ?? campaign?.chainId ?? 5042;
  const chainName = SHELTER_CHAINS[chainId]?.name || `chain ${chainId}`;
  const wallet = "wallet" in step && step.wallet ? step.wallet : null;
  const handedOver = campaign?.shelter.handover === "handed-over";

  const connect = async () => {
    const eth = getInjectedProvider();
    if (!eth) {
      setStep({ status: "error", message: "No browser wallet found. Open this page in your wallet app's browser." });
      return;
    }
    setStep({ status: "connecting" });
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.[0]) throw new Error("No wallet account was shared.");
      setStep({ status: "connected", wallet: toChecksumAddress(accounts[0]) });
    } catch (err) {
      setStep({ status: "error", message: walletErrorMessage(err) });
    }
  };

  const sign = async () => {
    const eth = getInjectedProvider();
    if (!eth || !wallet) return;
    setStep({ status: "signing", wallet });
    try {
      const message = claimMessage({ wallet, chainId, issued: new Date() });
      const signature = await eth.request({ method: "personal_sign", params: [utf8ToHex(message), wallet] });
      if (typeof signature !== "string") throw new Error("The wallet did not return a signature.");
      const res = await postClaim({ chainId, wallet, signature });
      if (!res.ok) {
        setStep({ status: "error", message: res.message, wallet });
        return;
      }
      setStep({ status: "sent", wallet });
      await refreshClaim();
    } catch (err) {
      setStep({ status: "error", message: walletErrorMessage(err), wallet });
    }
  };

  const preview = wallet ? claimMessage({ wallet, chainId, issued: new Date() }) : null;

  return (
    <NightStage className="min-h-screen">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-24 pb-16 md:pt-32">
        <div className="flex flex-col items-center gap-3 text-center">
          <Kicker>For the shelter</Kicker>
          <h1 className="font-primary text-h5 md:text-h2 font-bold uppercase leading-none text-white drop-shadow-lg text-balance">
            Your wallet, <span className="glow text-tt-cream">your key.</span>
          </h1>
          <p className="max-w-xl text-p5 md:text-p4 text-tt-cream/90">
            Four steps for {shelter} to take its payout wallet over from Token Tails. About two minutes.
          </p>
        </div>

        {handedOver && (
          <p className={`${PANEL} text-center`} data-testid="onboard-handed-over">
            {shelter} already holds its own key. Nothing to do here.
          </p>
        )}

        <ol className="flex flex-col gap-4" data-testid="onboard-steps">
          {/* claim: fiction how custody works, not an impact figure */}
          <StepCard n={1} title="Why hold your own key" done={!!wallet}>
            <p>
              Today Token Tails holds {shelter}&apos;s payout wallet on its behalf. That works for treats Token Tails
              pays for, but a gift from someone&apos;s own wallet should land in a wallet only the shelter controls.
            </p>
            <p>
              Once {shelter} holds its own key, the &ldquo;Give from your wallet&rdquo; button opens on the payouts page,
              and nobody at Token Tails can move what arrives.
            </p>
          </StepCard>

          <StepCard n={2} title="Connect your wallet" done={!!wallet}>
            <p>
              Use any wallet the shelter controls. Write its recovery phrase down offline: Token Tails never sees
              it and cannot recover it.
            </p>
            <p data-testid="onboard-tell-first">
              First tell Token Tails the wallet address through a channel you already use with us (email or a
              call). A claim from an address we have not heard about is refused, so a stranger cannot claim
              {" "}{shelter}&apos;s payouts.
            </p>
            <p className="text-tt-cream/75">
              Passkey and smart-contract wallets: the claim check reads a plain signature (EIP-191) today, so use a
              regular account for this step. Smart-wallet signatures (ERC-1271) are not checked yet.
            </p>
            {wallet ? (
              <p className={`${CHIP} self-start !normal-case`} data-testid="onboard-wallet">
                Connected:{" "}
                {/* The `code` role: an address (plan F4, G14). */}
                {/* eslint-disable-next-line tt/no-raw-font */}
                <span className="font-mono">{short(wallet)}</span>
              </p>
            ) : (
              <button
                type="button"
                className={`${GOLD_BUTTON} self-start`}
                onClick={connect}
                disabled={step.status === "connecting"}
                data-testid="onboard-connect"
              >
                {step.status === "connecting" ? "Check your wallet…" : "Connect wallet"}
              </button>
            )}
          </StepCard>

          {/* claim: fiction what signing does, not an impact figure */}
          <StepCard n={3} title="Sign the claim" done={step.status === "sent"}>
            <p>
              Signing proves the shelter controls this wallet. It is free, sends no transaction and moves no money.
            </p>
            {preview && (
              <pre
                // The `code` role: the exact text the wallet shows (plan F4, G14).
                // eslint-disable-next-line tt/no-raw-font
                className="whitespace-pre-wrap break-all rounded-xl border-2 border-tt-cream/40 bg-black/40 p-3 font-mono text-p6 md:text-p5 text-tt-cream"
                data-testid="onboard-message"
              >
                {preview}
              </pre>
            )}
            <button
              type="button"
              className={`${GOLD_BUTTON} self-start`}
              onClick={sign}
              disabled={!wallet || step.status === "signing" || step.status === "sent"}
              data-testid="onboard-sign"
            >
              {step.status === "signing" ? "Sign in your wallet…" : step.status === "sent" ? "Claim sent" : "Sign the claim"}
            </button>
          </StepCard>

          <StepCard n={4} title="Token Tails registers it" done={claim?.status === "rotated"}>
            <p>
              Token Tails checks the signature and confirms the wallet with {shelter} by a separate channel, then
              points {shelter}&apos;s entry in the payout contract on {chainName} to this wallet. The change is a public
              event anyone can check.
            </p>
            <p className="text-tt-cream/80" data-testid="onboard-other-chains">
              {chainName} is where the campaign runs. Where {shelter} is also listed in the payout contract on another
              chain ({OTHER_CHAINS.filter((c) => c !== chainName).join(", ")}), the same wallet is set there too, each
              change its own public event.
            </p>
            <p className="text-tt-cream" role="status" data-testid="onboard-status">
              {claimLoaded ? claimStatusCopy(claim, step.status === "sent") : "Reading the claim status…"}
              {claim && claim.wallet && (
                <>
                  {" "}
                  (wallet{" "}
                  {/* eslint-disable-next-line tt/no-raw-font */}
                  <span className="font-mono">{short(claim.wallet)}</span>)
                </>
              )}
            </p>
            <button type="button" className={`${PILL} self-start`} onClick={() => void refreshClaim()}>
              Check again
            </button>
          </StepCard>
        </ol>

        {step.status === "error" && (
          <p className={`${PANEL} text-tt-rust`} role="alert" data-testid="onboard-error">
            {step.message}
          </p>
        )}

        <div className="flex flex-col items-center gap-3 text-center">
          <PinkCat className="h-28 w-28 -my-4" />
          <NextLink href="/shelter-payouts" className={PILL}>
            Back to shelter payouts ›
          </NextLink>
        </div>
      </div>
    </NightStage>
  );
};

export default ShelterOnboard;
