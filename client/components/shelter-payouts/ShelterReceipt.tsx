// copy-lint: web-only app builds render AppProofNotice instead (the isAppBuild gate in ShelterReceipt)
import { isAppBuild } from "@/components/claims/build";
import NextLink from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Campaign, fetchCampaign } from "./campaign";
import { ChainInfo, explorerAddress, explorerTx } from "./chains";
import { displayMemo, formatUnits, payoutUnit } from "./logs";
import { DecodedReceipt, TX_HASH, fetchReceipt, receiptChain } from "./receipt";
import { AppProofNotice } from "./AppProofNotice";
import { isPinkPawWallet } from "./pinkPaw";
import { PinkPawStrip } from "./PinkPawShowcase";
import { ShelterDeployment, fetchDeployments } from "./rpc";
import { downloadShareCard } from "./shareCard";
import { CARD, CHIP, FIGURE, MEMO, GOLD_BUTTON, Kicker, NightStage, PANEL, PILL } from "./ui";

type State =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "done"; receipt: DecodedReceipt; chain: ChainInfo; chainId: number };

const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

// /shelter-payouts/receipt?chain=<id>&tx=<hash>: reads the transaction straight from the chain's
// public RPC. Nothing here comes from Token Tails' servers.
export const ShelterReceipt = () =>
  isAppBuild() ? <AppProofNotice title="Rescue receipt" /> : <WebShelterReceipt />;

const WebShelterReceipt = () => {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  const chainId = Number(first(router.query.chain));
  const tx = first(router.query.tx);
  const badLink = router.isReady && (!Number.isInteger(chainId) || chainId <= 0 || !TX_HASH.test(tx));

  useEffect(() => {
    if (!router.isReady || badLink) return;
    let cancelled = false;
    fetchCampaign().then((c) => !cancelled && setCampaign(c)).catch(() => undefined);
    (async () => {
      let deployments: ShelterDeployment[] = [];
      try {
        deployments = await fetchDeployments();
      } catch {
        // Unlisted is shown per payout below; the receipt itself still loads.
      }
      const chain = receiptChain(chainId, deployments);
      if (!chain) {
        if (!cancelled) setState({ status: "invalid", message: `Chain ${chainId} is not supported here.` });
        return;
      }
      try {
        const receipt = await fetchReceipt(chain, tx, deployments, chainId);
        if (cancelled) return;
        setState(receipt ? { status: "done", receipt, chain, chainId } : { status: "pending" });
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, badLink, chainId, tx]);

  const shelterName = (addr: string) =>
    campaign?.shelter.wallet && campaign.shelter.wallet === addr.toLowerCase()
      ? campaign.shelter.name
      : null;

  const done = state.status === "done" ? state : null;

  return (
    <NightStage className="min-h-screen">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 pt-24 pb-16 text-p5 md:pt-32 md:text-p4">
        <Kicker>Read from the chain</Kicker>
        <h1 className="text-center font-primary uppercase leading-none tracking-tight text-h5 md:text-h2 text-white drop-shadow-lg">
          Rescue <span className="glow text-tt-cream">Receipt</span>
        </h1>

        {badLink && (
          <p className={`${PANEL} text-center`} role="alert">
            This receipt link is missing a chain or transaction hash.
          </p>
        )}
        {!badLink && state.status === "loading" && (
          <p className="motion-safe:animate-pulse">Reading the receipt from the chain…</p>
        )}
        {state.status === "invalid" && (
          <p className={`${PANEL} text-center`} role="alert">
            {state.message}
          </p>
        )}
        {state.status === "pending" && (
          <p className={`${PANEL} text-center`}>
            The transaction is not on the chain yet. Give it a few seconds, then refresh.
          </p>
        )}
        {state.status === "error" && (
          <p className={`${PANEL} text-center text-tt-rust`} role="alert">
            Could not read the receipt: {state.message}
          </p>
        )}

        {done && (
          <section className={`${PANEL} flex flex-col gap-4`} data-testid="receipt-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`${CHIP} ${done.receipt.success ? "!border-tt-mint !text-tt-mint" : "!border-tt-rust !text-tt-rust"}`}>
                {done.receipt.success ? "✓ Confirmed" : "✕ Failed"}
              </span>
              <span className="text-p6 md:text-p5 text-tt-cream/80">
                {done.chain.name} · block <strong className="text-tt-cream">{done.receipt.blockNumber}</strong>
              </span>
            </div>
            {done.receipt.payouts.length === 0 && <p>This transaction has no shelter payouts.</p>}
            <ul className="flex flex-col gap-3">
              {done.receipt.payouts.map((p) => {
                const unit = payoutUnit(p.kind, p.tokenSymbol ? { ...done.chain, symbol: p.tokenSymbol } : done.chain);
                const name = shelterName(p.shelter);
                return (
                  <li key={p.logIndex} className={`${CARD} flex flex-col gap-2`}>
                    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className={`${FIGURE} text-h5 md:text-h4`}>
                        {formatUnits(p.amount, unit.decimals)} {unit.symbol}
                      </span>
                      <span className="font-primary uppercase text-p4 md:text-p3 text-tt-cream">
                        to{" "}
                        {name || (
                          // The `code` role: a shelter address, kept lowercase (plan F4, G14).
                          // eslint-disable-next-line tt/no-raw-font
                          <span className="font-mono normal-case">{short(p.shelter)}</span>
                        )}
                      </span>
                    </p>
                    <p className="text-tt-cream/85">
                      Shelter wallet:{" "}
                      <a
                        href={explorerAddress(done.chain.explorer, p.shelter)}
                        target="_blank"
                        rel="noopener noreferrer"
                        // The `code` role: a shelter address (plan F4, G14).
                        // eslint-disable-next-line tt/no-raw-font
                        className="font-mono underline decoration-dotted underline-offset-2 hover:text-tt-gold-400"
                      >
                        {short(p.shelter)}
                      </a>
                    </p>
                    <p className="flex flex-wrap items-center gap-2 break-words">
                      Memo: <span className={MEMO}>{displayMemo(p.memo) || "—"}</span>
                    </p>
                    {!p.listed && (
                      <p className="text-tt-rust">Warning: this log did not come from a listed ShelterSplit contract.</p>
                    )}
                    {name && (
                      <p className="text-p6 md:text-p5 text-tt-cream/75">
                        Wallet held by Token Tails on the shelter&apos;s behalf until handover.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
              {done.receipt.success && done.receipt.payouts.some((p) => p.listed) && (
                <button
                  type="button"
                  className={GOLD_BUTTON}
                  onClick={() => {
                    const listed = done.receipt.payouts.filter((p) => p.listed);
                    const p = listed.find((x) => shelterName(x.shelter)) || listed[0];
                    const unit = payoutUnit(p.kind, p.tokenSymbol ? { ...done.chain, symbol: p.tokenSymbol } : done.chain);
                    downloadShareCard({
                      shelterName: shelterName(p.shelter) || "a cat shelter",
                      amount: `${formatUnits(p.amount, unit.decimals)} ${unit.symbol}`,
                      chainName: done.chain.name,
                      blockNumber: done.receipt.blockNumber,
                      txHash: done.receipt.txHash,
                    });
                  }}
                >
                  Download share card
                </button>
              )}
              <a
                href={explorerTx(done.chain.explorer, done.receipt.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className={PILL}
              >
                Verify on explorer ›
              </a>
            </div>
          </section>
        )}

        <NextLink href="/shelter-payouts" className={PILL}>
          See every payout ›
        </NextLink>

        {/* Only when a payout in this receipt went to Pink Paw's own wallet: its logo and cats. */}
        {done && campaign && done.receipt.payouts.some((p) => isPinkPawWallet(p.shelter)) && (
          <div className="mt-6 w-full">
            <PinkPawStrip name={campaign.shelter.name} title="The cats behind this receipt" />
          </div>
        )}
      </div>
    </NightStage>
  );
};

export default ShelterReceipt;
