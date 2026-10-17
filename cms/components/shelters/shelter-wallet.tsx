'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Amount,
  ChainBalance,
  fetchArcPayouts,
  fetchWalletBalances,
  formatUnits,
  isAddress,
  isMotoredMemo,
  MOTORED_DISCLOSURE,
  MOTORED_LABEL,
  Payout,
  splitMotored,
  totalIn
} from '@/lib/shelter-wallet/balances';
import { PINK_PAW_WALLET, WALLET_CHAINS } from '@/lib/shelter-wallet/chains';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

/** The shelter's saved wallet, else Pink Paw's for the Pink Paw shelter. */
export function defaultShelterWallet(shelter?: {
  publicWallet?: string;
  name?: string;
  slug?: string;
}): string {
  if (shelter?.publicWallet && isAddress(shelter.publicWallet)) return shelter.publicWallet;
  const label = `${shelter?.slug ?? ''} ${shelter?.name ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  // Pink Paw is "Rožinė pėdutė" (slug rozine-pedute) in the shelter records.
  return /pink[\s-]*paw|rozine[\s-]*pedute/.test(label) ? PINK_PAW_WALLET : '';
}

const fmt = (a: Amount) => `${formatUnits(a.raw, a.decimals, 4)} ${a.symbol}`;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export function ShelterWallet({ initial }: { initial: string }) {
  const [typed, setTyped] = useState<string | null>(null);
  const input = typed ?? initial;
  const wallet = isAddress(input) ? input.trim() : '';

  const balances = useQuery({
    queryKey: ['shelter-wallet', wallet],
    queryFn: () => fetchWalletBalances(wallet),
    enabled: !!wallet,
    staleTime: 60_000
  });
  const payouts = useQuery({
    queryKey: ['shelter-wallet-payouts', wallet],
    queryFn: () => fetchArcPayouts(wallet),
    // After the balances, so the log scan cannot rate-limit the Arc balance read.
    enabled: !!wallet && balances.isSuccess,
    retry: false,
    staleTime: 60_000
  });

  const rows: ChainBalance[] = balances.data ?? [];
  const busy = balances.isFetching;

  const coins = (b: ChainBalance) =>
    [...(b.chain.native?.currency && b.native ? [b.native] : []), ...b.tokens];
  const hasMoney = (b: ChainBalance) => coins(b).some((a) => a.raw > BigInt(0));

  return (
    <section
      className="relative overflow-hidden rounded-3xl border-2 border-pink-300 bg-gradient-to-br from-pink-50 via-white to-amber-50 p-5 shadow-[0_6px_0_0_#f9a8d4]"
      aria-label="Shelter wallet"
    >
      <PawTrail />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CatBadge />
          <div>
            <div className="font-primary text-xl font-bold text-pink-900">Treat jar</div>
            <div className="text-xs text-pink-700">Live from 7 mainnets · read only</div>
          </div>
        </div>
        <Button
          className="w-auto shrink-0 rounded-full bg-pink-500 px-4 text-white hover:bg-pink-600"
          disabled={!wallet || busy}
          onClick={() => {
            balances.refetch();
            payouts.refetch();
          }}
        >
          <Paw className="mr-1 h-4 w-4" /> {busy ? 'Sniffing…' : 'Refresh'}
        </Button>
      </div>

      <label className="relative mt-4 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-pink-700">
          Wallet
        </span>
        <Input
          placeholder="0x wallet address"
          className="w-full rounded-full border-pink-200 bg-white font-mono text-sm focus-visible:ring-pink-400"
          value={input}
          onChange={(e) => setTyped(e.target.value)}
        />
      </label>
      {!wallet && (
        <div className="relative mt-3 flex items-center gap-2 rounded-2xl bg-white/80 p-3 text-sm text-pink-800">
          <Paw className="h-4 w-4 shrink-0" />
          {input ? 'That is not a valid 0x address.' : 'No wallet yet. Paste an address to peek inside.'}
        </div>
      )}

      {wallet && (
        <>
          <div className="relative mt-4 grid grid-cols-2 gap-3">
            <TotalCard label="In US dollars" value={balances.data ? `$${totalIn(rows, 'USD').toFixed(2)}` : null} />
            <TotalCard label="In euros (EURC)" value={balances.data ? `€${totalIn(rows, 'EUR').toFixed(2)}` : null} />
          </div>

          <ul className="relative mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(balances.data ? rows : WALLET_CHAINS.map((chain) => ({ chain }) as ChainBalance)).map((b) => {
              const native = b.chain.native;
              return (
                <li
                  key={b.chain.key}
                  className="flex items-start gap-3 rounded-2xl border border-pink-200 bg-white/90 p-3"
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      balances.data && !b.error && hasMoney(b) ? 'bg-pink-500 text-white' : 'bg-pink-100 text-pink-400'
                    }`}
                  >
                    <Paw className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-pink-950">{b.chain.name}</span>
                      <a
                        className="text-xs font-medium text-pink-600 underline-offset-2 hover:underline"
                        href={`${b.chain.explorer}/address/${wallet}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Explorer ↗
                      </a>
                    </div>
                    {!balances.data ? (
                      <div className="mt-1 h-4 w-28 animate-pulse rounded-full bg-pink-100" />
                    ) : b.error ? (
                      <div className="mt-1 text-xs text-red-600">Could not read: {b.error}</div>
                    ) : (
                      <>
                        <div className="mt-0.5 font-mono text-sm tabular-nums text-pink-900">
                          {coins(b).map(fmt).join(' · ') || '0'}
                        </div>
                        <div className="text-xs text-gray-500">
                          Gas: {native && !native.currency && b.native ? fmt(b.native) : 'paid in stablecoin'}
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {payouts.isError && (
            <div className="relative mt-3 text-xs text-gray-500">
              Recent Arc payouts unavailable right now (the public RPC limits log reads).
            </div>
          )}
          {payouts.data && payouts.data.length > 0 && (
            <div className="relative mt-4 rounded-2xl border border-pink-200 bg-white/90 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-semibold text-pink-950">
                <Paw className="h-4 w-4 text-pink-500" /> Recent treats on Arc
              </div>
              {(() => {
                const { motored, motoredUsd } = splitMotored(payouts.data);
                return motored.length > 0 ? (
                  <div className="mb-1 rounded-xl bg-amber-50 p-2 text-xs text-amber-900" data-testid="motored-summary">
                    {MOTORED_LABEL} in this list: ${motoredUsd.toFixed(2)} in {motored.length} gift
                    {motored.length === 1 ? '' : 's'}. Sponsor money from Motored, never separate donors.{' '}
                    {MOTORED_DISCLOSURE}
                  </div>
                ) : null;
              })()}
              {payouts.data.map((p: Payout) => (
                <div key={p.txHash} className="flex items-center justify-between gap-2 border-t border-pink-100 py-1.5">
                  <a
                    className="font-mono text-xs text-pink-700 underline-offset-2 hover:underline"
                    href={`${WALLET_CHAINS[0].explorer}/tx/${p.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(p.txHash)}
                  </a>
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                    {isMotoredMemo(p.memo) && (
                      <span className="mr-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{MOTORED_LABEL}</span>
                    )}
                    {p.memo}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-pink-900">{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TotalCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-2xl bg-white/90 p-3 ring-1 ring-pink-200">
      <div className="text-xs font-semibold uppercase tracking-wider text-pink-700">{label}</div>
      {value === null ? (
        <div className="mt-1 h-7 w-20 animate-pulse rounded-full bg-pink-100" />
      ) : (
        <div className="font-primary text-2xl font-bold tabular-nums text-pink-950">{value}</div>
      )}
    </div>
  );
}

/** A cat paw print: one pad and four toe beans. */
function Paw({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <ellipse cx="12" cy="16" rx="5" ry="4.2" />
      <ellipse cx="5.5" cy="10" rx="2.1" ry="2.6" />
      <ellipse cx="9.5" cy="6.2" rx="2.1" ry="2.7" />
      <ellipse cx="14.5" cy="6.2" rx="2.1" ry="2.7" />
      <ellipse cx="18.5" cy="10" rx="2.1" ry="2.6" />
    </svg>
  );
}

/** Round cat face with ears, used as the panel badge. */
function CatBadge() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden="true">
      <path d="M9 20 L11 5 L21 14 Z" fill="#f472b6" />
      <path d="M39 20 L37 5 L27 14 Z" fill="#f472b6" />
      <path d="M12 17 L13 9 L18 14 Z" fill="#fce7f3" />
      <path d="M36 17 L35 9 L30 14 Z" fill="#fce7f3" />
      <circle cx="24" cy="27" r="16" fill="#fff" stroke="#f472b6" strokeWidth="2" />
      <circle cx="18" cy="25" r="2" fill="#831843" />
      <circle cx="30" cy="25" r="2" fill="#831843" />
      <path d="M22 30 L26 30 L24 32.5 Z" fill="#f472b6" />
      <path d="M24 32.5 Q21 35 19 33 M24 32.5 Q27 35 29 33" stroke="#831843" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <circle cx="14" cy="31" r="2.2" fill="#fbcfe8" />
      <circle cx="34" cy="31" r="2.2" fill="#fbcfe8" />
    </svg>
  );
}

/** Faint paw prints walking across the panel background. */
function PawTrail() {
  const steps = [
    [6, 78, -20], [14, 62, -10], [24, 80, -20], [34, 64, -10], [62, 18, 15], [72, 6, 25], [84, 20, 15], [93, 8, 25]
  ];
  return (
    <div className="pointer-events-none absolute inset-0 text-pink-200/60" aria-hidden="true">
      {steps.map(([x, y, r], i) => (
        <span
          key={i}
          className="absolute"
          style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${r}deg)` }}
        >
          <Paw className="h-5 w-5" />
        </span>
      ))}
    </div>
  );
}
