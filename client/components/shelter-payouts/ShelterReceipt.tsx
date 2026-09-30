import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Campaign, fetchCampaign } from "./campaign";
import { ChainInfo, explorerAddress, explorerTx } from "./chains";
import { formatUnits, payoutUnit } from "./logs";
import { DecodedReceipt, TX_HASH, fetchReceipt, receiptChain } from "./receipt";
import { ShelterDeployment, fetchDeployments } from "./rpc";
import { downloadShareCard } from "./shareCard";

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
export const ShelterReceipt = () => {
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

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-4 px-4 pb-16 font-secondary text-p5">
      <h2 className="text-center font-primary uppercase tracking-tight text-h6 md:text-h2">
        Rescue
        <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] ml-3">Receipt</span>
      </h2>

      {badLink && <p role="alert">This receipt link is missing a chain or transaction hash.</p>}
      {!badLink && state.status === "loading" && (
        <p className="animate-pulse">Reading the receipt from the chain…</p>
      )}
      {state.status === "invalid" && <p role="alert">{state.message}</p>}
      {state.status === "pending" && (
        <p>The transaction is not on the chain yet. Give it a few seconds, then refresh.</p>
      )}
      {state.status === "error" && (
        <p className="text-red-300" role="alert">
          Could not read the receipt: {state.message}
        </p>
      )}

      {state.status === "done" && (
        <section className="w-full rounded-xl border-2 border-yellow-900 bg-black/60 p-4">
          <p>
            {state.receipt.success ? "✅ Confirmed" : "❌ Failed"} on {state.chain.name}, block{" "}
            <strong>{state.receipt.blockNumber}</strong>
          </p>
          {state.receipt.payouts.length === 0 && (
            <p className="mt-2">This transaction has no shelter payouts.</p>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {state.receipt.payouts.map((p) => {
              const unit = payoutUnit(p.kind, state.chain);
              const name = shelterName(p.shelter);
              return (
                <li key={p.logIndex} className="rounded-lg border border-white/20 p-3">
                  <p className="font-primary uppercase text-p4">
                    {formatUnits(p.amount, unit.decimals)} {unit.symbol} to {name || short(p.shelter)}
                  </p>
                  <p>
                    Shelter wallet:{" "}
                    <a
                      href={explorerAddress(state.chain.explorer, p.shelter)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono underline decoration-dotted"
                    >
                      {short(p.shelter)}
                    </a>
                  </p>
                  <p className="break-words">Memo: {p.memo || "—"}</p>
                  {!p.listed && (
                    <p className="text-red-300">
                      Warning: this log did not come from a listed ShelterSplit contract.
                    </p>
                  )}
                  {name && (
                    <p className="opacity-80">
                      Wallet held by Token Tails on the shelter&apos;s behalf until handover.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={explorerTx(state.chain.explorer, state.receipt.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border-2 border-yellow-900 bg-yellow-300 px-4 py-1 font-primary uppercase text-black"
            >
              Verify on explorer
            </a>
            {state.receipt.success && state.receipt.payouts.some((p) => p.listed) && (
              <button
                type="button"
                className="rounded-full border-2 border-yellow-900 bg-pink-400 px-4 py-1 font-primary uppercase text-black"
                onClick={() => {
                  const listed = state.receipt.payouts.filter((p) => p.listed);
                  const p = listed.find((x) => shelterName(x.shelter)) || listed[0];
                  const unit = payoutUnit(p.kind, state.chain);
                  downloadShareCard({
                    shelterName: shelterName(p.shelter) || "a cat shelter",
                    amount: `${formatUnits(p.amount, unit.decimals)} ${unit.symbol}`,
                    chainName: state.chain.name,
                    blockNumber: state.receipt.blockNumber,
                    txHash: state.receipt.txHash,
                  });
                }}
              >
                Download share card
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default ShelterReceipt;
