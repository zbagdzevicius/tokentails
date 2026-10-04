# Donate rail, 2026-10-04: what changed for Monad Metropolis

Additive note. Consumer Products & Payments track; submit Oct 13 (time zone unverified; rules are
behind the hackathon.monad.xyz login). Monad is not deployed yet: everything below is conditional on
a Monad testnet or mainnet deploy of ShelterSplit (chains.json lists Monad testnet 10143).

## New mechanics, mapped to the track brief

C1 brief: "Onchain rails can make financial products feel instant, programmable, and invisible to
the end user."

| Brief word | What fits |
|---|---|
| instant | One transaction pays the shelter: router → ShelterSplit → shelter wallet, no holding period. |
| programmable | CappedSpender: an agent spends inside caps a contract enforces; matching rules are memos anyone can read (`tt:agent:match-<tx>`, `tt:match:<tx>`). |
| invisible | A donor signs one message, no approve, no gas token, **only where Monad's USDC supports EIP-3009** — verify on the Monad USDC contract (`authorizationState`, EIP-712 name/version) before saying so. If it does not, the donor beat uses the ERC-20 path (approve, then `disburse` on the split) and says so. No native fallback: Monad's native coin is MON, not USDC. |

## 3-beat demo

1. **Play → give.** Win a Catnip Heist level, tap the treat: Token Tails' own money pays the shelter
   ([C-004], [C-005]).
2. **Donor.** One signature to the router (or approve + `disburse` in USDC) on Monad; the explorer shows
   the shelter paid in the same transaction.
3. **Agent.** The treat agent matches the donor's gift 1:1 inside CappedSpender's caps; an over-cap
   proposal reverts. On Monad the spender must run in **ERC-20 mode** (`CAPPED_NATIVE=0`, USDC units,
   6 decimals): native mode would hand out MON, and both the deploy script and `observe.mjs` refuse
   native mode off Arc. `fork-demo.sh` deploys a native-mode spender, so it is Arc-only as written;
   a Monad recording needs an ERC-20 variant of the script (not built).

## Live, testnet, pending

| Item | State on 2026-10-04 |
|---|---|
| ShelterSplit on Monad | not deployed; Monad must be deployed (and the rules read) before this entry is real |
| DonateRouter, CappedSpender, agent | built and tested, chain-agnostic; not deployed anywhere |
| Public mainnet giving | pending the Pink Paw handover |

## Numbers and their keys

[C-004], [C-005], [C-001]; live totals only from [L-disbursed]. [P-002], [P-003], [C-008] are
unverified. No Monad number exists yet: cite none.
