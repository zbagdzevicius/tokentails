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
  const label = `${shelter?.slug ?? ''} ${shelter?.name ?? ''}`.toLowerCase();
  return /pink[\s-]*paw/.test(label) ? PINK_PAW_WALLET : '';
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

  return (
    <div className="flex flex-col gap-3 bg-white rounded-lg border border-black p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-lg font-bold font-primary">WALLET (mainnet, read only)</div>
        <Button
          variant="outline"
          disabled={!wallet || busy}
          onClick={() => {
            balances.refetch();
            payouts.refetch();
          }}
        >
          {busy ? 'Loading' : 'Refresh'}
        </Button>
      </div>
      <Input
        placeholder="0x wallet address"
        className="w-full rounded-lg bg-background font-mono text-sm"
        value={input}
        onChange={(e) => setTyped(e.target.value)}
      />
      {!wallet && (
        <div className="text-sm text-gray-500">
          {input ? 'Not a valid 0x address.' : 'No wallet set. Paste an address.'}
        </div>
      )}

      {wallet && (
        <>
          <div className="flex gap-6 text-sm">
            <div>
              <div className="text-gray-500">Total USD</div>
              <div className="text-xl font-bold">
                {balances.data ? `$${totalIn(rows, 'USD').toFixed(2)}` : '…'}
              </div>
            </div>
            <div>
              <div className="text-gray-500">EURC</div>
              <div className="text-xl font-bold">
                {balances.data ? `€${totalIn(rows, 'EUR').toFixed(2)}` : '…'}
              </div>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1">Chain</th>
                <th>Stablecoins</th>
                <th>Gas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(balances.data ? rows : WALLET_CHAINS.map((chain) => ({ chain }))).map(
                (r) => {
                  const b = r as ChainBalance;
                  const native = b.chain.native;
                  return (
                    <tr key={b.chain.key} className="border-t">
                      <td className="py-1 font-medium">{b.chain.name}</td>
                      {!balances.data ? (
                        <td colSpan={2}>
                          <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                        </td>
                      ) : b.error ? (
                        <td colSpan={2} className="text-red-600">
                          Could not read: {b.error}
                        </td>
                      ) : (
                        <>
                          <td>
                            {[
                              ...(native?.currency && b.native ? [b.native] : []),
                              ...b.tokens
                            ]
                              .map(fmt)
                              .join(', ')}
                          </td>
                          <td className="text-gray-500">
                            {native && !native.currency && b.native ? fmt(b.native) : '-'}
                          </td>
                        </>
                      )}
                      <td className="text-right">
                        <a
                          className="underline"
                          href={`${b.chain.explorer}/address/${wallet}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Explorer
                        </a>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>

          {payouts.isError && (
            <div className="text-xs text-gray-500">Recent Arc payouts unavailable (RPC limit).</div>
          )}
          {payouts.data && payouts.data.length > 0 && (
            <div className="text-sm">
              <div className="font-bold">Recent Arc payouts</div>
              {(() => {
                const { motored, motoredUsd } = splitMotored(payouts.data);
                return motored.length > 0 ? (
                  <div className="text-xs text-gray-600 py-1" data-testid="motored-summary">
                    {MOTORED_LABEL} in this list: ${motoredUsd.toFixed(2)} in {motored.length} gift
                    {motored.length === 1 ? '' : 's'}. Sponsor money from Motored, never separate
                    donors. {MOTORED_DISCLOSURE}
                  </div>
                ) : null;
              })()}
              {payouts.data.map((p: Payout) => (
                <div key={p.txHash} className="flex justify-between gap-2 border-t py-1">
                  <a
                    className="underline font-mono"
                    href={`${WALLET_CHAINS[0].explorer}/tx/${p.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(p.txHash)}
                  </a>
                  <span className="truncate text-gray-500">
                    {isMotoredMemo(p.memo) && (
                      <span className="mr-1 rounded bg-yellow-100 px-1 text-yellow-900">
                        {MOTORED_LABEL}
                      </span>
                    )}
                    {p.memo}
                  </span>
                  <span>{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
