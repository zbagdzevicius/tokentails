// copy-lint: web-only rendered only inside WalletDonate (web builds)
import { useId } from "react";
import { GiveRail, isExtraCoinRail, railCoinLine, railFeeLine, railKey } from "./giveRails";

/**
 * The network picker of the wallet block: one radio card per chain with its name, the coin it takes
 * and how its network fee is covered. Native radios, so arrow keys and screen readers work as usual.
 * A chain with a second coin's router (EURC) gets a second card; options are keyed by railKey.
 */
export const ChainPicker = ({
  rails,
  value,
  onChange,
  relayLive,
  disabled = false,
}: {
  rails: GiveRail[];
  /** railKey of the picked rail. */
  value: string;
  onChange: (key: string) => void;
  /** Whether the Token Tails relay serves that chain right now (known for the picked chain only). */
  relayLive: (chainId: number) => boolean;
  disabled?: boolean;
}) => {
  const name = useId();
  return (
    <fieldset className="mt-1 flex flex-col gap-2" disabled={disabled} data-testid="wallet-network">
      <legend className="mb-2 text-tt-cream/85">Pick a network</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rails.map((r) => {
          const key = railKey(r);
          const checked = key === value;
          return (
            <label
              key={key}
              className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border-2 px-3 py-2 transition-colors ${
                checked ? "border-tt-gold-400 bg-tt-night-950" : "border-tt-cream/40 hover:border-tt-cream/80"
              }`}
              data-testid={`wallet-network-${key}`}
            >
              <input
                type="radio"
                name={name}
                value={key}
                checked={checked}
                onChange={() => onChange(key)}
                className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--tt-gold-400))]"
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-primary uppercase leading-tight text-tt-cream">{r.chain.name}</span>
                <span className="text-tt-cream/90">{railCoinLine(r)}</span>
                <span className="text-p6 text-tt-cream/75 md:text-p5">{railFeeLine(r, relayLive(r.chainId) && !isExtraCoinRail(r))}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};

export default ChainPicker;
