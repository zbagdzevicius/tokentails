# Landing–game alignment: status

Plan: `docs/plans/landing-game-alignment.md`. Per-task logs: `docs/plans/alignment-log/`.
Nothing in this file is committed or pushed; the founder commits by explicit path list.

## 3 Oct 2026: founder polish pass and QA fixes

Source: the founder's request (footer on `/shelter-payouts/give`, Pink Paw logo, cards and photos,
the Heist modal, the "waiting" line on the landing, the My Pets cards, $40K+ on `/impact`, the
funding run) and two QA reports (journey QA and visual QA, both at 1440x900 and 390x844).

### Done today

| Area | What changed | Key files |
|---|---|---|
| Footer | One night footer on every night page: the landing and `/impact` now render it too. No flat band and no second row of socials; a gold divider, gold pill links (BLOG, CATS, IMPACT, PAYOUTS) in a 2x2 grid on phones, legal links on one line. `tailwind.config.ts` gains `sans` (Nunito): `font-sans` was a no-op before. | `client/layouts/Footer.tsx`, `client/pages/index.tsx`, `client/pages/impact.tsx`, `client/tailwind.config.ts` |
| Pink Paw logo, cards, photos | Logo, real cards and photos on `/shelter-payouts`, `/give`, the receipt and the Heist modal (earlier tasks). Today: the "Straight from the shelter" photos are of the same cats as the cards above them. Lithuanian names leave the display face (`lib/glyphs.ts`); the landing shelter list shows "Pink Paw" with "Rožinė pėdutė" under it. | `client/components/shelter-payouts/PinkPawShowcase.tsx`, `client/lib/glyphs.ts`, `client/components/landing/ImpactGlobeSection.tsx` |
| `/give` | No bare "Rescue" line; a closed jar shows an outline "Treat jar opens soon" chip, not a dimmed gold button; button label fits one line; mascot no longer sits on the logo rim. `/shelter-payouts` CTAs say PLAY CATNIP HEIST while the jar is closed. | `GiveTreat.tsx`, `ShelterPayouts.tsx` |
| Payout reads | Heist modal: refused full-range `eth_getLogs` is re-read in 10,000-block windows, one at a time, with 429/-32005 backoff (was always "Can't reach the chain" on Tempo and Arc). Client: one request in flight per RPC URL, results cached 5 min in sessionStorage, plain-language errors, never "0 USDC" for an unread chain. Bundle rebuilt into `client/public/heist-game/`. | `catnip-heist/src/ui/payouts.ts`, `client/components/shelter-payouts/rpc.ts` |
| Heist modal | Shelter card sticky on desktop, logo 76 px, close button on a solid disc, headline matches the web page ("First payouts land soon"). | `catnip-heist/src/ui/shelter-payouts.ts`, `catnip-heist/src/ui/pink-paw.ts` |
| Landing | Globe: phones stack globe, stats and link in normal flow; desktop heading no longer on the globe ring. Phone hero: the store badge sits under PLAY GAME, not on the cat. ("…and ONE more cat on the team" / BACK TO YOUR CAT landed earlier today.) | `ImpactGlobeSection.tsx`, `client/pages/index.tsx` |
| My Pets | Tiers you own first; empty tiers are one-line rows. Card footer in white with a dark halo, tier label hidden under 260 px. Names capitalised like the payout pages; a starter cat without card art shows its pixel sprite. | `CatsModal.tsx`, `CardWrapper.tsx`, `TailsCardMini.tsx`, `CardFront.tsx` |
| Card text safety | Card descriptions are plain text (`lib/plainText.ts`), not `dangerouslySetInnerHTML`; 21 Pink Paw descriptions carry pasted ChatGPT markup. | `CardFront.tsx`, `client/lib/plainText.ts` |
| Meet your cat | Body line no longer repeats "waiting"; the shelter-cats step shows real photos first and "Rožinė pėdutė" for Pink Paw. | `MeetYourCat.tsx`, `MeetPanels.tsx` |
| `/impact` | Site header and footer; order is $40K+ (F-026), Rescue cats, Reach; the six empty rail sections fold into one "Opening soon" card (links into them open it); gold frames on every card; larger anchor chips; Reach drops the April 540K+ line when the live player count is shown. | `client/pages/impact.tsx` |
| Campaign meter | One value line plus the bar (was three statements), a visible stub at 0%, "since 2 October 2026". | `CampaignMeter.tsx`, `campaign.ts` |
| Docs | Known issues: guest sign-in off on production, shelter markup, the CDN `impact.json` 403, the font coverage. | `docs/CLIENT.md` |

### Checks (3 Oct)

- client: `tsc --noEmit` clean; eslint on changed files 0 errors (1 old warning in `CardWrapper.tsx`); jest 147 suites, 2321 tests pass; `palette:check` 0 findings; Playwright `tails-card-fit` and `landing-cta` 16/16 at 390 and 1440.
- catnip-heist: `tsc --noEmit` clean; vitest 31 files, 506 tests pass; `build:client` rebuilt.
- tools/copy-lint: 0 findings in 732 files; its tests 82/82.
- backend: not touched.

### Open (not fixed today)

- Production guest sign-in is off (Firebase Anonymous provider): the judge path stops at "We couldn't start a guest game". Founder, Firebase console.
- The CDN copy of `impact.json` answers 403.
- `/impact` "Every claim" still lists live rows with no value ("Not measured yet"); a test pins that on purpose.
- F-026 wording: "$40K+ donated in crypto and goods" everywhere (founder decision 2026-10-03). Pink Paw granted written permission to use its logo and cats (founder, 2026-10-03).
- Heist modal and the web pages show different Pink Paw cats (the Heist ships four fixed cats).
- Landing team section spacing (QA P2 #12) and the payouts hero font (P3) are unchanged.
