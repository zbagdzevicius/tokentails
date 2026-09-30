import NextLink from "next/link";
import { useEffect, useState } from "react";
import { CampaignMeter } from "./CampaignMeter";
import { Campaign, campaignProgress, fetchCampaign } from "./campaign";
import { explorerAddress, explorerTx } from "./chains";
import { Disbursement, formatUnits, payoutUnit, to18 } from "./logs";
import {
  ShelterDeployment,
  fetchDeployments,
  fetchDisbursements,
  fetchNativeBalance,
  resolveChain,
} from "./rpc";
import { ShelterProfile } from "./ShelterProfile";
import { WalletDonate } from "./WalletDonate";

export const GIVE_URL = "/shelter-payouts/give";

// Static Catnip Heist build in public/heist (catnip-heist: npm run build:client). Next.js does
// not serve index.html for a directory, so the link names the file.
export const HEIST_URL = "/heist/index.html";

export const DISCLOSURE =
  "Shelter wallet held by Token Tails on behalf of the shelter until handover";

type Result =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; items: Disbursement[] };

type Page =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; deployments: ShelterDeployment[] };

// Sum per symbol, in 18-decimal units, so Arc's native USDC (18 decimals) and ERC-20 USDC (6)
// add up while different coins never mix.
function totalsBySymbol(
  items: Disbursement[],
  chain: ReturnType<typeof resolveChain>
): { symbol: string; amount: bigint; count: number }[] {
  const out: Record<string, { symbol: string; amount: bigint; count: number }> = {};
  for (const d of items) {
    const u = chain ? payoutUnit(d.kind, chain) : { decimals: 6, symbol: "?" };
    const t = out[u.symbol] || { symbol: u.symbol, amount: BigInt(0), count: 0 };
    t.amount += to18(d.amount, u.decimals);
    t.count += 1;
    out[u.symbol] = t;
  }
  return Object.values(out);
}

const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;

const Link = ({ href, text }: { href: string; text: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="underline decoration-dotted hover:text-yellow-300 font-mono"
  >
    {text}
  </a>
);

type Balance = { status: "loading" } | { status: "error" } | { status: "done"; wei: bigint };

// ShelterSplit forwards every donation in the same transaction, so this should read 0.
const BalanceLine = ({
  balance,
  symbol,
  decimals,
}: {
  balance: Balance;
  symbol: string;
  decimals: number;
}) => (
  <p className="mt-1 opacity-90" data-testid="contract-balance">
    Contract balance:{" "}
    {balance.status === "loading" && <span className="animate-pulse">…</span>}
    {balance.status === "error" && <span>unavailable</span>}
    {balance.status === "done" && (
      <strong>
        {formatUnits(balance.wei, decimals)} {symbol}
      </strong>
    )}{" "}
    (pass-through: donations are split out in the same transaction)
  </p>
);

const DeploymentCard = ({
  deployment,
  result,
  balance,
}: {
  deployment: ShelterDeployment;
  result: Result;
  balance: Balance;
}) => {
  const chain = resolveChain(deployment);
  const explorer = chain?.explorer;
  const unit = (d: Disbursement) =>
    chain ? payoutUnit(d.kind, chain) : { decimals: 6, symbol: "" };
  const cardTotals = result.status === "done" ? totalsBySymbol(result.items, chain) : [];

  return (
    <section className="w-full rounded-xl border-2 border-yellow-900 bg-black/60 p-4 text-p5 font-secondary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-primary uppercase text-p3">
          {chain?.name || `Chain ${deployment.chainId}`}
          {deployment.network ? ` ${deployment.network}` : ""}
        </h3>
        <div>
          Contract{" "}
          {explorer ? (
            <Link
              href={explorerAddress(explorer, deployment.address)}
              text={short(deployment.address)}
            />
          ) : (
            <span className="font-mono">{short(deployment.address)}</span>
          )}
        </div>
      </div>
      <BalanceLine
        balance={balance}
        symbol={chain?.nativeSymbol || ""}
        decimals={chain?.nativeDecimals ?? 18}
      />

      {result.status === "loading" && (
        <p className="mt-3 animate-pulse">Reading payouts from the chain…</p>
      )}
      {result.status === "error" && (
        <p className="mt-3 text-red-300" role="alert">
          Could not read payouts: {result.error}
        </p>
      )}
      {result.status === "done" && result.items.length === 0 && (
        <p className="mt-3">No payouts yet on this deployment.</p>
      )}
      {result.status === "done" && result.items.length > 0 && (
        <>
          <p className="mt-2">
            Total paid:{" "}
            <strong>
              {cardTotals.map((t) => `${formatUnits(t.amount, 18)} ${t.symbol}`).join(" + ")}
            </strong>{" "}
            in {result.items.length} payout
            {result.items.length === 1 ? "" : "s"}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="uppercase">
                  <th className="pr-4 py-1">Shelter</th>
                  <th className="pr-4 py-1">Amount</th>
                  <th className="pr-4 py-1">Memo</th>
                  <th className="py-1">Tx</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((d) => (
                  <tr key={`${d.txHash}-${d.logIndex}`} className="border-t border-white/20">
                    <td className="pr-4 py-1">
                      {explorer ? (
                        <Link href={explorerAddress(explorer, d.shelter)} text={short(d.shelter)} />
                      ) : (
                        short(d.shelter)
                      )}
                    </td>
                    <td className="pr-4 py-1 whitespace-nowrap">
                      {formatUnits(d.amount, unit(d).decimals)} {unit(d).symbol}
                    </td>
                    <td className="pr-4 py-1 break-words">{d.memo || "—"}</td>
                    <td className="py-1">
                      {explorer ? (
                        <Link href={explorerTx(explorer, d.txHash)} text={short(d.txHash)} />
                      ) : (
                        short(d.txHash)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};

export const ShelterPayouts = () => {
  const [page, setPage] = useState<Page>({ status: "loading" });
  const [results, setResults] = useState<Record<number, Result>>({});
  const [balances, setBalances] = useState<Record<number, Balance>>({});
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCampaign()
      .then((c) => !cancelled && setCampaign(c))
      .catch(() => undefined); // the campaign block is optional; the payouts still render
    fetchDeployments()
      .then((deployments) => {
        if (cancelled) return;
        setPage({ status: "done", deployments });
        deployments.forEach((d, i) => {
          setResults((r) => ({ ...r, [i]: { status: "loading" } }));
          fetchNativeBalance(d)
            .then((wei) => !cancelled && setBalances((b) => ({ ...b, [i]: { status: "done", wei } })))
            .catch(() => !cancelled && setBalances((b) => ({ ...b, [i]: { status: "error" } })));
          fetchDisbursements(d)
            .then((items) => {
              if (!cancelled) setResults((r) => ({ ...r, [i]: { status: "done", items } }));
            })
            .catch((err: Error) => {
              if (!cancelled) setResults((r) => ({ ...r, [i]: { status: "error", error: err.message } }));
            });
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setPage({ status: "error", error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Totals per symbol: amounts of different coins are never added together.
  const totals: Record<string, { amount: bigint; count: number }> = {};
  if (page.status === "done") {
    page.deployments.forEach((d, i) => {
      const r = results[i];
      if (r?.status !== "done") return;
      for (const t of totalsBySymbol(r.items, resolveChain(d))) {
        const acc = totals[t.symbol] || { amount: BigInt(0), count: 0 };
        acc.amount += t.amount;
        acc.count += t.count;
        totals[t.symbol] = acc;
      }
    });
  }
  const pending =
    page.status === "done" &&
    page.deployments.some((_, i) => results[i]?.status !== "done" && results[i]?.status !== "error");

  const deployments = page.status === "done" ? page.deployments : [];
  const progress = campaign
    ? campaignProgress(
        campaign,
        deployments.flatMap((d, i) => {
          const r = results[i];
          return r?.status === "done" ? [{ chainId: d.chainId, items: r.items }] : [];
        })
      )
    : null;
  const campaignDeployment = campaign
    ? deployments.find((d) => d.chainId === campaign.chainId)
    : undefined;
  const campaignChain = campaignDeployment ? resolveChain(campaignDeployment) : null;

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-4 px-4 pb-16">
      <h2 className="text-center font-primary uppercase tracking-tight text-h6 md:text-h2 text-balance">
        Shelter
        <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] ml-3">
          Payouts
        </span>
      </h2>
      <p className="text-center font-secondary text-p5 max-w-2xl">
        Every payout from the ShelterSplit contract is read live from the chain.
        Nothing on this page comes from our servers.
      </p>
      <NextLink
        href={GIVE_URL}
        className="rounded-xl border-2 border-yellow-900 bg-pink-400 px-4 py-2 font-primary uppercase text-p4 text-black hover:brightness-105"
        data-testid="give-treat"
      >
        Send Pink Paw a rescue treat 🐾
      </NextLink>
      <a
        href={HEIST_URL}
        className="rounded-xl border-2 border-yellow-900 bg-black/60 px-4 py-2 font-primary uppercase text-p4 hover:text-yellow-300"
        data-testid="play-heist"
      >
        Play Catnip Heist: rescue a shelter cat
      </a>
      <p
        className="w-full rounded-xl border-2 border-yellow-900 bg-yellow-300 px-4 py-2 text-center font-secondary text-p5 text-black"
        data-testid="shelter-disclosure"
      >
        {DISCLOSURE}
      </p>

      {campaign && (
        <ShelterProfile campaign={campaign} explorer={campaignChain?.explorer} />
      )}
      {campaign && progress && (
        <CampaignMeter campaign={campaign} progress={progress} loading={pending} />
      )}
      {campaign && campaignDeployment && campaignChain && (
        <WalletDonate
          chainId={campaignDeployment.chainId}
          chain={campaignChain}
          splitAddress={campaignDeployment.address}
          shelterName={campaign.shelter.name}
        />
      )}

      {page.status === "loading" && (
        <p className="font-secondary text-p5 animate-pulse">Loading deployments…</p>
      )}
      {page.status === "error" && (
        <p className="font-secondary text-p5 text-red-300" role="alert">
          Could not load the deployment list: {page.error}
        </p>
      )}
      {page.status === "done" && page.deployments.length === 0 && (
        <p className="font-secondary text-p5">
          No ShelterSplit deployments are published yet. Payouts appear here as soon as the first
          contract goes live.
        </p>
      )}

      {page.status === "done" && page.deployments.length > 0 && (
        <>
          <div className="w-full rounded-xl border-2 border-yellow-900 bg-black/60 p-4 font-secondary text-p5">
            <h3 className="font-primary uppercase text-p3">Totals</h3>
            {Object.keys(totals).length === 0 && pending && <p className="animate-pulse">Counting…</p>}
            {Object.entries(totals).map(([symbol, t]) => (
              <p key={symbol}>
                {formatUnits(t.amount, 18)} {symbol} across {t.count} payout
                {t.count === 1 ? "" : "s"}
              </p>
            ))}
            {pending && Object.keys(totals).length > 0 && (
              <p className="opacity-70">Some chains are still loading.</p>
            )}
          </div>
          {page.deployments.map((d, i) => (
            <DeploymentCard
              key={`${d.chainId}-${d.address}`}
              deployment={d}
              result={results[i] || { status: "loading" }}
              balance={balances[i] || { status: "loading" }}
            />
          ))}
        </>
      )}
    </div>
  );
};

export default ShelterPayouts;
