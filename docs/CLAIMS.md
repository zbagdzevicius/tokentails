# Public Claims

Every number, impact statement and money goal that the public can read must trace back to one
entry in `funding/framework/facts/facts.json`. This page has two parts: the registry that holds those
entries, and the wording rules R1 to R12 that `tools/copy-lint/` enforces. Plan references: F7.1,
F7.2, F11, G5 and G11 in `docs/plans/landing-game-alignment.md`.

## The registry

`funding/framework/facts/facts.json` is the only place a public claim is written down (decision
#77: JSON). It is in the private funding checkout (DEVELOPMENT.md, "The private funding checkout");
this repo holds the generated public copy `client/public/facts/facts.json`, which is what
`tools/copy-lint` reads when the checkout is absent. Edit the registry, then regenerate:

```
node funding/framework/bin/fund.mjs facts build          # write every generated copy
node funding/framework/bin/fund.mjs facts build --check  # CI: fail on schema problems, unreachable goals or drift
```

`fund refresh --write` still edits FACTS.md rows. FACTS.md ends with a hash of the rows it was
generated with, so the build can tell an edited FACTS.md from one that is only behind facts.json.
When rows were edited since the last build, `fund facts build` refuses to overwrite them: run
`fund facts absorb` first to move the value, date and status edits into facts.json, or pass
`--discard-md` to throw them away.

The build writes these files. Never edit them by hand:

| File | Holds | Read by |
|---|---|---|
| `funding/framework/facts/FACTS.md` | Every `F-` entry in the old table format | `fund check`, `verify.mjs`, `facts-refresh.mjs`, AI prompts |
| `client/public/facts/facts.json` | The public subset | Web, app export, and the Heist at runtime (`HEIST_FACTS_URL`) |
| `client/lib/facts.generated.ts` | `FactId` union, `FACTS` data | Client `Claim` component |
| `backend/src/impact/facts.generated.ts` | The same (TypeScript 4.8 safe) | Impact module |
| `catnip-heist/src/facts.generated.ts` | The same | The Heist's offline fallback |
| `client/public/shelter-payouts/campaign.json` | The campaign goal (the `C-` entry with `campaign`) | `/shelter-payouts`, Heist payouts |

The public subset contains only entries with a public status and at least one surface. Repo-path
sources, notes and internal claim text stay in the repo. The build refuses email, phone and IBAN
patterns anywhere in the registry, because FACTS.md is pasted into AI prompts.

### Entry fields

| Field | Meaning |
|---|---|
| `id` | `F-###` fact, `P-###` product claim, `C-###` campaign or config, `L-<slug>` live metric |
| `claim` | Internal wording: exactly what is claimed, with its qualifiers |
| `value`, `unit` | The number or text, and what it counts. `null` for live metrics |
| `display` | Public wording. Live entries use `{n}`, `{amount}` or `{state}` placeholders |
| `appDisplay` | Wording for the app surfaces (`game`, `heist`, `store`) when `display` has a money or chain word (R10). The build fails when an app-surface entry shows such a word without one |
| `source` | Where a person can check it. A URL when one exists |
| `asOf` | The date the figure describes |
| `checkedAt` | The date someone last checked it at the source |
| `status` | See below |
| `maxAgeDays` | Days after `checkedAt` before the weekly job flags it as stale. `null` only for SEI-era history and entries without surfaces |
| `surfaces` | Where it may be shown: `landing`, `game`, `heist`, `impact`, `shelter-payouts`, `store` |
| `tense` | `past`, `present` or `future`. Future means the money does not move yet. Config amounts (C-004 treat size, C-005 daily budget) are `present`: they state the setting, not that the rail is live. Rail state is the live entry `L-rail` (`railState` from `GET /shelter/donate/status`) |
| `chain` | `sei`, `stellar`, `arc` or `skale`, when the claim is about a chain |
| `live` | `{ endpoint, path }` for `L-` entries: where the current value is read |
| `key` | Optional stable name (the G4 keys: `strays_saved`, `partner_countries`, `purchase_share`, `paw`, `campaign`) |
| `goal`, `campaign` | For goals: dates, `progress` (`shelter-wallet`), `sources` (every source that lands in the wallet), `tokenTails` (Token Tails' own capped streams: config constant, optional lifetime cap and `shareBps`), `donorDependent`, and the campaign.json fields (chain, `fromBlock`, `token`, `startBalance`, shelter) |
| `config` | For `C-` entries that mirror a code constant. The build fails when they differ |
| `evidence` | For `P-` entries: the spec that proves the claim. Today the build checks only that the spec file exists (see the note below the statuses) |

### Statuses

| Status | Public | Meaning |
|---|---|---|
| `verified` | yes | Checked at a public source on `checkedAt` |
| `company-reported` | yes, labelled | The company's own figure. The display must say "company-reported" (decision #73) |
| `sei-era` | yes, labelled | True, but from the retired SEI deployment. The display must name SEI and use the past tense |
| `live` | yes | Read from a live endpoint (`L-` entries only) |
| `unverified` | never | No surfaces allowed. Fine in an application draft with a caveat |
| `retired` | never | Kept so old copy and drafts fail loudly |

**Known gap: evidence is checked by file existence.** A `P-` entry can become `verified` once its
`evidence.spec` file exists, so a skipped or failing spec would still let it through. Set a `P-`
entry `verified` only after reading a green CI run of its spec; the gate should eventually require
the spec's passing CI result (a test-report artifact), not the file.

P-001 ("3 taps from reel to on-chain", decision #75) is `retired` with no surfaces (task 7b):
nothing goes on-chain in 3 taps (saves go through `/live`, and app builds may not say on-chain).
The measured path, the `/game` lobby to a playable Heist level 1 in 3 taps (`heist-host.spec.ts`),
is a G2 acceptance, not a public claim. If the landing Heist pill ships, a new claim needs a new id,
a spec run with the pill on, and a landing surface shown only while the flag is on.

F-026 (`donated_direct_total`, "$40K+ donated directly in crypto and goods") is the founders'
statement of 2026-10-03, worded no wider than it was said: no recipients, no start date, no split.
It is `company-reported`, never on-chain verified. It is shown as the /impact headline
(`<Claim variant="hero">` in `components/impact/GivenDirectly.tsx`), as a stat in the landing globe
section (web only) and in the lobby strip through its registry `short` wording ("$40K+ given
directly"), followed there by an "On the treat rail:" label. It is never added to `L-disbursed` or
`L-treats`. App builds use its `appDisplay` ("money and goods", no "crypto").

Two optional registry fields came with it. `short` is a tighter wording for small spaces; the drawer
still shows `display`. `recordsOnRequest: true` opts an entry into the ProofDrawer "How to check"
row and the /impact "Ask for the receipts" button (`components/claims/records.ts`, the
`SUPPORT_EMAIL` inbox in `lib/support.ts`). No entry sets it yet: it waits for the founders to
confirm that inbox answers receipt requests.

Funding drafts cannot cite F-026 as it stands: FACTS.md lists company-reported entries as
`unverified`, and `fund check` fails those at review. The plan is to split it once the founders send
the crypto transfers (date, amount, explorer link): F-026a (crypto) `verified` with its source a
public receipts list, F-026b (goods) `company-reported`, and `$40K+` kept as the combined figure.
Still open for the founders: the start year (then "since <year>"), the recipients (then "to
shelters" may come back) and the goods valuation.

### Goals are claims

A money goal is a `C-` entry with a `goal`. Since 2026-10-04 (founder: "goal: 50000 USDC for Pink
Paw") a goal's progress is **the USDC that comes in to the campaign wallets** (`goal.progress:
"shelter-wallet"`). `goal.sources` lists the five ways money can reach a shelter wallet (public
gifts through DonateRouter, Token Tails' match, sponsored treats, x402 `exact` payments and the
shelter's share of its cats' purchases), but a page names a source as counting only when it can
reach the open wallet today (below).

**Counted from transfers, not the balance (review fix, 2026-10-04).** The backend
(`GET /shelter/goal/C-001`, `backend/src/shelter/goal/`) sums the Transfer logs to the wallets in
`campaign.wallets`, each only inside its own `fromBlock`..`toBlock` range, and skips a transfer
whose sender is another campaign wallet. So spending never lowers the bar, and a handover (a new
wallet the shelter owns) keeps counting without counting its sweep twice. On Arc it reads the
system Transfer log `campaign.inflowLog` (`0xff…fe`, 18 decimals), which Arc emits for every USDC
move, native or through the ERC-20 view at `0x3600…` (checked read-only on rpc.mainnet.arc.io).
The public RPC refuses `eth_getLogs` spans of 10,000 blocks or more, so the scan goes in 9,999-block
windows with a cursor in `sheltergoalcursors`. The meter (`CampaignMeter` on /shelter-payouts,
/give and /impact, and the Heist's payouts modal) reads that count; it says "at least" while the
scan has not reached the chain head. Without the backend it falls back to the wallet's balance
growth only while that is exact (one wallet that has never sent a transaction); otherwise it says
it cannot read the count. EURC or other tokens do not count.

**Every mainnet counts (2026-10-04).** Besides the campaign chain, the backend counts the US dollar
stablecoins that come in to the same campaign wallets on every other mainnet of the checkout's chain
table (`CRYPTO_PAY_CHAINS`: Tempo USDC.e, Arbitrum, Avalanche, Base and Monad USDC, Robinhood Chain
USDG; never EURC, never a test-only coin, and none at all for a testnet campaign). Each chain has its
own cursor (`C-001@<chainId>`), starts at its first block of `goal.startDate` (found once by binary
search, or `SHELTER_GOAL_FROM_BLOCK_<chainId>`), and reads in windows its public RPC accepts (2,000
blocks on Base, 100 on Monad). The view's `raised` is the sum, `chains` the breakdown the meters
show, and the figure stays "at least" until every chain is up to date. The balance fallback reads
the campaign chain only, so it is always shown as "at least". `SHELTER_GOAL_CHAINS=off` counts the
campaign chain alone; `SHELTER_GOAL_RPC_URL_<chainId>` overrides a chain's RPC.

**Only today's sources are named.** While Token Tails holds the wallet (`handover:
"held-by-token-tails"`), the custody rules keep public gifts, the match and x402 payments away from
it, so only sponsored treats can arrive (plus the shop share, and only while the backend settles a
cat checkout through the split on the campaign chain: crypto pay on and a split route). The backend
reports these as `liveSources`, and the copy lists only them: "today, sponsored treats. Gifts, the
match and x402 payments count once Pink Paw holds its own wallet."

**Rotation plan.** While Token Tails holds the wallet, the entry must carry `campaign.rotation`
(the build refuses it otherwise): at handover, set the held wallet's `toBlock`, append the
shelter's own wallet (`holder: "shelter"`), point `shelter.wallet` at it, set `handover:
"handed-over"`, run `fund facts build` and deploy the client and the backend. The web meter reads
`campaign.json` at run time and the Heist reads the runtime facts (`/facts/facts.json`), so neither
needs a Heist rebuild for the change.

Donor money cannot be promised by any config, so the build no longer proves reachability. It
checks honesty instead (decision #76, redefined): `goal.tokenTails` lists Token Tails' own capped
streams (for C-001 the treat budget `DEFAULT_DAILY_BUDGET_WEI` and the match budget
`DEFAULT_MATCH_DAILY` capped by `DEFAULT_MATCH_POOL`); the build sums what they can add over the
goal's days. When the goal is larger, the rest has to come from donors and the entry must say
`goal.donorDependent: true`; the build then refuses "reachable", "guaranteed" and similar words in
its display, appDisplay or claim. C-001 is 50,000 USDC from 2026-10-02 to 2027-09-30: Token Tails'
own streams add at most 374 USDC at the **code defaults** (the build cannot read the production
environment; a raised treat budget or match pool makes that figure wrong until the entry is
updated), so about 136 USDC a day must come from donors. The end date is
one year from launch because public giving stays off until Pink Paw holds its own key (handover
planned before 5 Dec 2026).

The weekly job (`fund facts report`) reports goals that have ended, goals that are running but not
counting (no shelter wallet or `fromBlock`), and, while a goal runs, the pace it would need from
zero. Online, it also checks that `fromBlock` is the first block on or after `startDate` (00:00
UTC) on the campaign chain.

**A wallet needs a `fromBlock`, `wallets` and an `inflowLog`.** The count starts at `fromBlock`,
not at `startDate`. A wallet with `fromBlock: null` would count money that arrived before the goal,
so the build refuses it. It also refuses a wallet without `campaign.wallets` (ordered, ranges that
never overlap, only the last one open, the open one equal to `shelter.wallet`, `wallets[0].fromBlock`
equal to `fromBlock`) or without `campaign.inflowLog`, a wallet that is not `0x` plus 40 hex digits,
and a missing `campaign.token` (the balance fallback reads it). C-001 counts the held Pink Paw
wallet from block 23790973, the first Arc block of 2026-10-02 UTC.

`client/public/shelter-payouts/campaign.json` is generated from C-001: edit `facts.json`, never the
JSON. It carries `endDate`, `counts`, `sources`, `token`, `startBalance`, `wallets` and `inflowLog`.
The public facts copy carries the meter inputs too (`C-001.campaign`: chain, `fromBlock`, wallet,
handover, wallets, inflow log, token, start balance); the Heist reads them at run time from
`/facts/facts.json` and keeps the baked copy only as a fallback.

C-001 has `maxAgeDays: 125`, so it goes stale around 6 Feb 2027, long before the 30 Sep 2027 end.
That is the review cadence (re-check wallets, caps and dates), not an error.

### Rail state, test money and the mainnet gate

- **On by default is not live.** Treats and the x402 agent card are on by default in the backend
  (since 2026-10-04), but they need a recorded split, a key and a funded hot wallet. No mainnet split
  is recorded yet (`wallet.config.ts`), so copy still reads the rail state from `L-rail`, never from
  the config entries C-004 and C-005.
- **Test money stays apart.** The testnet deployments (seven chains) are shown only in their own
  "Testnet proof" section: the Heist payouts modal and `/shelter-payouts` read a separate list
  (`testnet-deployments.json`) with its own totals. The impact indexer sums only chains of the main
  chain's network class, and the goal meter never counts a test coin. A testnet figure is never
  added to a mainnet number.
- **The claim gate backs the custody copy.** On a mainnet, the relay, the match and the
  `onchain-receipt` x402 open per chain only after the shelter's claim is verified on chain, and a
  wallet Token Tails holds is never accepted as a claim. That is what keeps "Gifts, the match and x402
  payments count once Pink Paw holds its own wallet" true.

## Wording rules

`tools/copy-lint/` checks these rules. It reads string literals, template literals, JSX text and
text-bearing attributes through the TypeScript AST, so comments, class names and imports are
never treated as copy.

**R1. Real-world numbers cite a fact id.** A magnitude about the real world ("540K+ players",
"181,010 followers", "800+ strays") needs an `F-`, `L-` or `C-` id within 3 lines whose `unit`
counts the same thing. Players, users, members and people count alike; so do cats, strays,
animals and rescues. Citing F-011 (followers) next to "800+ strays" still fails, and a
`claim:fiction` marker never covers a number. Game numbers ("Top 100 players this season", "+50")
are not claims.

**R2. Real-world impact claims cite a claim id or are marked fiction.** A real-world noun (real,
shelter, stray, vet, donation, charity, "cats in need") next to an impact verb (fund, pay, send,
feed, save, help, support, give, rescue, "goes to") needs an id within 3 lines, or
`// claim:fiction <reason>`. The reason is required and must say why the line is fiction in at
least 3 words and 10 characters: "in-game rescue, no money moves" is fine, but `// claim:fiction x`
covers nothing and is reported.

**R3. Token Tails is the subject of money verbs.** "Token Tails sends Pink Paw a treat", never
"Every heist funds a shelter", "Your purchase pays for food" or "Each card helps fund rescue
operations". Players play; Token Tails pays. The real-world noun can be anywhere in the copy:
"Shelter treats: every heist funds them." fails.

**R4. Tense matches the claim.** A claim whose entry is `future` must not say money moves now or
has moved. Say "Real shelter treats open soon" until the rail is live.

**R5. Cited ids exist, may be shown, and list the surface.** An id must be in the registry, must
not be `unverified` or `retired`, and must list the surface of the file that shows it.

**R6. No giver counts.** Show what Token Tails sent, never how many people gave ("1,200 donors",
"300 players have donated").

**R7. Goals cite their C- entry.** Any goal with a money amount cites the `C-` goal entry, whose
honesty the build checks (donor-dependent goals are marked and never called reachable).

**R8. No Tails-to-money rate.** `/Tails per/i` and any Tails-to-money rate ("100 Tails = $1",
"1 USDC = 100 Tails") are banned everywhere, legacy files included, in strings of any length. Tails have no cash value. The internal budgeting ratio in decision #37
never appears in public copy.

**R9. Rescue tone.** Outside `client/components/legacy/**` and the Vault, no `$TAILS`, airdrop,
TGE, listing, MNT, allocation or token(s). Tails are rescue points (G5, `shared/copy.ts`). Sign-in
tokens ("App Check token") and the brand name are not flagged. The backend rule set reads only
`message`, `label`, `name`, `description` and `revealTitle` values, exception messages and HTML
templates.

**R10. App builds show no chain words.** App strings contain no USDC, `0x` hashes, explorers,
wallets, chain names or "ON-CHAIN". Money renders as a USD equivalent with its FX date, and the
on-chain tiers read "HELD BY TOKEN TAILS" and "HELD BY SHELTER" (F7.2). Text in the web branch of
an `isApp` condition is exempt, and so is a file marked `// copy-lint: web-only <reason>` in its
first 30 lines.

The Heist ships inside the app export (`client/public/heist-game`), so it is an app surface too.
It has no `isApp`: web-only Heist copy branches on `isWebHost` or `HEIST_WEB` (or their inverse,
`isAppHost` / `HEIST_APP`), which task 3e provides at runtime. The plan's live-rail line is written
`isWebHost ? 'Tap and Token Tails sends Pink Paw a treat on Arc' : 'Tap and Token Tails sends Pink
Paw a treat'`, cited to `C-004, L-rail`. Registry wording on app surfaces uses `appDisplay`.

Short strings that do not read as prose but contain a space ("0.01 USDC", "1 USDC = 100 Tails")
get R8, R9 and R10. One-word strings are treated as keys and symbols, and no claim rules run on
short strings.

**R11. SEI-era figures say SEI.** Copy citing a `sei-era` entry names SEI.

**R12. Labels and dates travel with the number.** Copy citing a `company-reported` entry says
"company-reported". Copy citing an `F-` entry shows its as-of date ("180K+ on X (Sep 2026)").

## Citing a claim in code

| Form | Example |
|---|---|
| Attribute | `<span data-claim="F-011">180K+ on X (Sep 2026)</span>` |
| Component | `<Claim id="F-011" />` |
| Data | `FACTS['F-011'].display`, `{ claim: 'F-011', ... }` |
| Comment | `// claim: F-003, F-004` or `{/* claim: F-011 */}` |
| JSON copy | a `"claim": "F-011"` field on the object that holds the text |
| Fiction | `// claim:fiction in-game rescue, no money moves` |
| Exception | `// copy-lint-ignore R10 <reason>`, on the line or the line above; the reason is required |

An id counts for copy within 3 lines above or below it.

## Running the lint

```
cd tools/copy-lint && npm ci
node bin/copy-lint.mjs                          # whole repo, exit 1 on findings
node bin/copy-lint.mjs --warn                   # report only, exit 0
node bin/copy-lint.mjs client/pages/index.tsx   # some files
node bin/copy-lint.mjs --target heist --rule R2,R3 --format markdown --out report.md
npm test
```

Scanned: client components, pages, features and layouts; `client/public/**/*.json` (not the Heist
build, generated facts or level data); `catnip-heist/src/**` (not the sim); the Heist level files
`catnip-heist/src/levels/*.json` (only `meta.title`, `meta.objectives[]` and `meta.hints[].text`;
not `*.solution.json`); backend
sources (the backend rule set); CMS model defaults and the public card preview. This static scan
cannot see copy that the backend sends at runtime or text managers type into the CMS. The F11
runtime copy scan covers that: `client/e2e/fixtures/copy-scan.ts` reads the visible text and
accessible names on screen and applies R9 (tone), R8 (rate) and, with `E2E_APP_BUILD=1`, R10. It runs
at every step of `client/e2e/golden-path.spec.ts` and over every lobby modal.

CI runs the lint as a failing check (`copy-lint` job, since task 7b): any finding fails the job and
is printed as an error annotation; the job summary and the uploaded report hold the full list.

## Weekly checks

Date-dependent checks never run on pull requests. `.github/workflows/facts-weekly.yml` runs
`fund facts report` each Monday. The report covers stale facts, goals that have ended, product
claims whose spec now exists, the chain and store probes in `facts/sources.json`, and the impact
snapshot when `FACTS_IMPACT_URL` is set. It opens or updates one GitHub issue.
`fund facts gate` is the offline release gate for the CDN sync and app builds: generated copies in
sync, and no surfaced fact stale.
