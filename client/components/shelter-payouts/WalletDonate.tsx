import Link from "next/link";
import { useState } from "react";
import { Celebration } from "./Celebration";
import { ChainInfo, explorerTx } from "./chains";
import { WALLET_DONATE_ENABLED, getInjectedProvider, walletDonate, walletErrorMessage } from "./wallet";

const AMOUNTS = ["1", "5", "10"];

type State =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; hash: string }
  | { status: "error"; message: string };

// Optional donate-from-your-own-wallet button. Hidden unless NEXT_PUBLIC_WALLET_DONATE === "true".
export const WalletDonate = ({
  chainId,
  chain,
  splitAddress,
  shelterName,
}: {
  chainId: number;
  chain: ChainInfo;
  splitAddress: string;
  shelterName: string;
}) => {
  const [amount, setAmount] = useState(AMOUNTS[0]);
  const [state, setState] = useState<State>({ status: "idle" });
  if (!WALLET_DONATE_ENABLED) return null;

  const symbol = chain.nativeSymbol || "native";
  const send = async () => {
    const eth = getInjectedProvider();
    if (!eth) {
      setState({ status: "error", message: "No browser wallet found. Try one with Arc support." });
      return;
    }
    setState({ status: "sending" });
    try {
      const hash = await walletDonate(eth, { chainId, chain, splitAddress, amount });
      setState({ status: "sent", hash });
    } catch (err) {
      setState({ status: "error", message: walletErrorMessage(err) });
    }
  };

  return (
    <section
      className="w-full rounded-xl border-2 border-yellow-900 bg-black/60 p-4 font-secondary text-p5"
      data-testid="wallet-donate"
    >
      <h3 className="font-primary uppercase text-p3">Give from your wallet</h3>
      <p className="opacity-80">
        Goes straight to ShelterSplit on {chain.name}, which splits it to the shelters in the same
        transaction. You pay a small gas fee in {symbol}.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAmount(a)}
            aria-pressed={amount === a}
            className={`rounded-full border-2 border-yellow-900 px-3 py-1 font-primary ${
              amount === a ? "bg-yellow-300 text-black" : "bg-black/40"
            }`}
          >
            {a} {symbol}
          </button>
        ))}
        <button
          type="button"
          onClick={send}
          disabled={state.status === "sending"}
          className="rounded-full border-2 border-yellow-900 bg-pink-400 px-4 py-1 font-primary uppercase text-black disabled:opacity-60"
        >
          {state.status === "sending" ? "Check your wallet…" : `Give ${amount} ${symbol}`}
        </button>
      </div>
      {state.status === "sent" && (
        <>
          <Celebration />
          <p className="mt-3">
            Thank you! {shelterName} gets its share as soon as the block lands.{" "}
            <a
              href={explorerTx(chain.explorer, state.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              View on explorer
            </a>{" "}
            ·{" "}
            <Link
              href={`/shelter-payouts/receipt?chain=${chainId}&tx=${state.hash}`}
              className="underline"
            >
              Your receipt
            </Link>
          </p>
        </>
      )}
      {state.status === "error" && (
        <p className="mt-3 text-red-300" role="alert">
          {state.message}
        </p>
      )}
    </section>
  );
};

export default WalletDonate;
