# Pawlegends POC: launch kit (Thu 2026-11-12)

Launch readiness for Phase 1 "First Blood" of [`GDD.md`](GDD.md), built per [`POC.md`](POC.md). Written 2026-10-17.
Three parts: (a) the founder checklist in order, (b) the distribution plan for the €1,500 budget and the 4-week
measurement window (to Thu 2026-12-10), (c) launch copy.

**Changed since this kit was written (rewritten 2026-10-22).** The game no longer sells the `pl_*` SKUs (Starter,
Founder, Founder Legend, upgrade): it sends no `purchase-intent`, has no store button, and the routes stay only so a
`pl_*` purchase could restore (production never sold one). The one thing on sale from the game is a Token Tails cat
($5) from the session's single "Meet <cat>" card (never in session 1, at most one a session), through the host's cat
sheet and the Token Tails checkout with the Pawlegends age band and spend caps (BACKEND.md, "Pawlegends"). §a.3, §a.5,
§a.7, §b and §c below describe that game. `origin/main` is merged into `feat/pawlegends` (2026-10-22). The go/no-go
table, the ordered deploy commands and the open items are in [`LAUNCH-READY.md`](LAUNCH-READY.md).

Times: Vilnius is EET (UTC+2) from Oct 25, so the whole launch window is UTC+2.

Where results go:

| What | Where |
|---|---|
| Stripe test-mode run (one $5 cat from the Meet card, one restore) | [`pawlegends/README.md`](../../../pawlegends/README.md), "Stripe test mode" |
| Device gate numbers (iPhone 11, Pixel 6a, Iris Xe) | [`pawlegends/README.md`](../../../pawlegends/README.md), "Device performance results" |
| Trademark search results | This file, §a.1 table |
| Playtest results | This file, §a.5 table |
| Weekly metrics and spend | This file, §b.4 table |

---

## (a) Founder checklist, in order

| # | Step | By | Blocks |
|---|---|---|---|
| 1 | Trademark searches for "Pawlegends" | Mon Nov 9 | Every public use: the launch post, removing `noindex`, any portal page |
| 2 | Accountant answer on EU VAT for digital sales (GDD §12 #17) | Mon Nov 9 | Stripe live mode |
| 3 | Stripe test-mode run: one $5 cat from the Meet card (card), one restore (G-Pay) | Mon Nov 9 | Paid traffic |
| 4 | Device gate on iPhone 11, Pixel 6a, Iris Xe | Tue Nov 10 | Launch (POC proof 3) |
| 5 | 10-person playtest | Tue Nov 10 | Tuning pass on Nov 11 |
| 6 | Push, PR, merge, deploy | Wed Nov 11 | Live mode, launch |
| 7 | Live check: one real $5 cat on production | Wed Nov 11 | Paid traffic |
| 8 | Remove `noindex`, launch posts, tranche 1 | Thu Nov 12 | – |

### a.1 Trademark searches (start now; result by Nov 9)

GDD §1: run every search before any public use. Search the exact word and the close variants **Pawlegends**,
**Paw Legends**, **Pawlegend**, **Paw Legend**. Classes to read: 9 (game software), 28 (games), 41 (online game
services). This is a market check, not legal clearance; a hit on a live mark in class 9 or 41 means the fallback
name (Meowba, then Nine Lives Arena, GDD §1) and a new search.

| Register | Link | Result (date, hits, verdict) |
|---|---|---|
| EUIPO TMview (EU, national offices incl. Lithuania, UK) | https://www.tmdn.org/tmview/ | |
| EUIPO eSearch plus (EU marks, with goods and services text) | https://euipo.europa.eu/eSearch/ | |
| USPTO Trademark Search | https://tmsearch.uspto.gov/ | |
| WIPO Global Brand Database (international marks) | https://branddb.wipo.int/ | |
| Apple App Store (API query; also search the App Store app on a phone) | https://itunes.apple.com/search?term=pawlegends&entity=software | |
| Google Play | https://play.google.com/store/search?q=pawlegends&c=apps | |
| Steam | https://store.steampowered.com/search/?term=pawlegends | |
| itch.io | https://itch.io/search?q=pawlegends | |

Repeat the two app-store rows with "paw legends". Pass = no live mark or published game with the same or a confusingly
similar name in those classes. Then, and only then, step 8 removes `noindex`.

### a.2 VAT answer (by Nov 9)

Prices are VAT-inclusive (`tax_behavior: 'inclusive'`). Ask the accountant: Lithuanian VAT below the €10,000 EU
cross-border threshold, or OSS, and whether to turn on Stripe Tax (`automatic_tax`, not set by any checkout today,
GDD §13). Live mode waits for the answer (POC.md §8.1). Record the answer and the date here:

> VAT answer: (pending)

### a.3 Stripe test-mode run: one $5 cat from the Meet card, one restore (G-Pay)

The game sells one thing: a Token Tails cat for $5 from the "Meet <cat>" card, paid in the host's cat sheet
(`client/components/pawlegends/PawlegendsCatSheet.tsx`) through the Token Tails checkout (`<Payment
entityType={EntityType.CAT}>`, Stripe PaymentIntents through `POST /web3/create-payment` and `confirm-payment`, with
`context: 'pawlegends'` so `PawlegendsCheckoutGuard` checks the age band and the 30-day spend cap). It does not use the
`pl_*` Checkout Sessions or `PAWLEGENDS_STRIPE_WEBHOOK_SECRET`; those routes stay only so earlier `pl_*` purchases
restore, and production never sold one (the backend has no `/pawlegends/*` routes before this deploy), so there is no
old `pl_*` token to restore.

Env var names only (values live in the local env files; never read, paste or commit `.env*`):

| Name | Where | Local test value |
|---|---|---|
| `STRIPE_SECRET_KEY` | backend | a Stripe **test** secret key (`sk_test_…`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client | the matching test publishable key (`pk_test_…`) |
| `NEXT_PUBLIC_BE_URL` | client | `http://localhost:3005` |
| `SENDGRID_API_KEY` | backend | optional; without it the notify-me button hides (`status.email: false`) |

**Terminal 1, backend:** `cd backend && npm run dev` (port 3005), then
`curl -s localhost:3005/pawlegends/sim | jq '{simVersion, simVersions}'` → `{"simVersion": 10, "simVersions": [9, 10]}`.

**Terminal 2, client:** `cd client && npm run dev` (port 3000; it serves the committed
`client/public/pawlegends-game` build), then open `http://localhost:3000/pawlegends` and sign in with a test account.

**Run 1, the $5 cat (card).**

1. The Meet card never shows in session 1. Reload `/pawlegends` once (each page load is a session; the counter is
   `tt.pawlegends.sessions.v1` in browser storage). Finish one match or stay in the lobby: the "Meet <cat>" card shows
   on the lobby or the results screen when the local database has a featured cat that the shelter cat sale sells.
2. Tap the card. The sheet opens: "Meet <cat>", the three lines ("Trots at your heels as a Companion Kitten", "Its
   element chroma for every hero", "Its card skin for every hero"), the age question once (pick "18 or older").
3. Pay with `4242 4242 4242 4242` (any future date, any CVC). Repeat once with `4000 0027 6000 3184` (3-D Secure) on a
   second featured cat if one is offered, else skip.
4. The sheet says "<cat> joined your squad". Back in the lobby the cat is in the squad; start a match: the Companion
   Kitten walks in your wave and the hero wears the element chroma (POC proof 2).
5. In the Stripe test Dashboard → Payments, copy the `pi_…` id; check the order in your local database is `COMPLETE`.
6. Write the `pi_…` id, the date and "seen in match: yes/no" into the `pawlegends/README.md` "Stripe test mode" table.

**Run 2, the restore.** The cat lives on the account, not the device. Open a second browser profile (a new device
id), sign in with the same account, open `/pawlegends`: the cat must be in the roster and dress the hero in the first
match. Record it in the same README table.

**Once-only checks (signed in):**

- Under 16: in a third browser profile (a new device id; the card shows once a day per device), reload once, open the
  Meet card and pick "Under 16": the sheet shows "Ask a parent or guardian to buy this on their own device." and no
  payment form, and no Meet card shows on that device again.
- 16 to 17: €30 a rolling 30 days (`SPEND_CAP_CENTS` in `backend/src/pawlegends/pawlegends.contracts.ts`). The card
  shows at most once a day, so check the cap with the specs (`npx jest src/pawlegends`), not by hand.
- A declined card (`4000 0000 0000 0002`) leaves no cat and no `COMPLETE` order.

Backend specs for the same flow: `cd backend && npx jest src/pawlegends src/web3`.

### a.4 Device gate (Tue Nov 10)

Pass: iPhone 11 and Pixel 6a, landscape, Low tier, a full teamfight with a wave on screen: p95 frame ≤ 33 ms, draw
calls ≤ 90 (the §6.9 fallback limit), heap ≤ 150 MB. Iris Xe laptop at 1280×720, Med: p95 ≤ 16.7 ms (POC.md §10,
§15 item 27). Kill gate: mobile p95 over 50 ms after one optimisation pass → desktop-first for Phase 2 (GDD §10.1).

1. Charge the phone above 50%, close other apps, turn off low-power mode, landscape.
2. Open the game build directly (no host page), forced tier, perf overlay:
   - Phones: `https://tokentails.com/pawlegends-game/index.html?quality=low&perf=1`
   - Iris Xe: `https://tokentails.com/pawlegends-game/index.html?quality=med&perf=1`, window at 1280×720
   - Before the deploy, use a Vercel preview URL with the same path.
3. Play Normal. At the first big fight (usually the 2:30 Pudding fight, or a tower dive after 3:00 with siege on
   screen), hold the camera on it for 20 s. Read p95, draw calls and heap off the overlay. Do it twice; record the
   worse run.
4. Record in `pawlegends/README.md`, "Device performance results": device, OS and browser version, tier, p95 frame,
   draw calls, heap, date.

`?quality=` is read by `src/render/quality.ts` and `?perf=1` by `src/ui/perfReadout.ts` (a small top-left readout).
If the readout is hard to read on a phone, measure this way instead:

- iPhone: Safari → Settings → Advanced → Web Inspector on; on the Mac, Safari → Develop → (phone) → the page →
  Timelines, record "Rendering Frames" and "Memory" over the 20 s fight; p95 from the frame list.
- Pixel: `chrome://inspect` on the laptop → Inspect → Performance (record 20 s, frames) and Memory (heap).
- Draw calls per tier do not depend on the device; take them from `npm run e2e -- tests/e2e/perf.spec.ts`
  (README "Automated" table) and say so in the row.
- The game also sends `perf_sample {p95, tier}` to PostHog at the end of every match (embedded through the host;
  standalone after consent); use those
  numbers for the field view after launch, not for the gate.

### a.5 10-person playtest (Tue Nov 10)

Who: 10 adults (18+): 4 on their own phones (at least 1 iPhone, 1 Android), 6 on laptops; about 3 who play MOBAs, 4
who do not, 3 who own Token Tails cats. Book them now (POC.md §17 step 8). One observer per tester, 30 minutes each,
on the production URL (or the preview before the deploy). Ask consent for notes; no recordings of faces; no personal
data in the results beyond a tester number.

What they play (SIM_VERSION 10): eight heroes (Clem, Sage, Sir Brutus, Cacklejaw, Lambo, Avietė, Bengas, Gabė), the
tester plus two bot allies against three bots, Rookie bots in the first match and then Easy, Normal or Hard. The first
matches show ghost-paw tips. There is no store: the only thing on sale is a Token Tails
cat ($5) from a "Meet <cat>" card, which never shows in a player's first visit.

**Script (observer reads only the bold lines):**

1. **"Here is a link. Play it however you like. I will stay quiet; think out loud if you want."** Send
   `https://tokentails.com/pawlegends`.
2. Observe silently. Note on the sheet: seconds to the first move, every moment stuck for more than 10 s, which
   ghost-paw tips completed (move, attack a minion, Q a hero, Tumble a telegraph, R), and whether they used a ping
   (ping wheel or the minimap) or the scoreboard.
3. Do not help unless the tester is stuck for 60 s; then note "helped" and what.
4. At the results screen, wait 30 s. Note whether the tester starts a second match **unprompted** ("Run it back" or
   "Switch cat"), and whether they look at the grade, the dare link or the Treat Track.
5. **"Reload the page and play one more match. Tell me about anything new you see."** The reload is the second visit,
   so a "Meet <cat>" card may show on the lobby or results screen (one a visit, and only when a featured cat is for
   sale). If it shows: **"What do you think you would get with this cat?"** Note their words. Nobody pays during the
   test; if a tester wants to, they close the sheet with "NOT NOW". If no card shows, skip Q8 and Q9.
6. Survey (below), 5 minutes.

**Observer sheet per tester:** device, first match finished (Y/N), match length, difficulty, outcome, tips done (0 to
5), pings used (Y/N), second match unprompted (Y/N), stuck moments, helped (Y/N), Meet card shown (Y/N), visible
stutter (Y/N), HUD overlap seen on a phone (Y/N and where).

**Survey (each question names the GDD §10.1 metric it predicts):**

| # | Question | Answer | Metric |
|---|---|---|---|
| 1 | How fun was that match? | 1 to 5 | Fun gate |
| 2 | Would you play another match right now? | Yes / No | 2nd match within 24 h (≥ 35%) |
| 3 | Would you come back to play tomorrow? | 1 to 5 | D1 (≥ 25%), D7 (≥ 8%) |
| 4 | The match felt: too short / about right / too long | choice | Median length 7:00 to 9:00 (b.1) |
| 5 | What was the hardest thing about the controls? | free text | First sessions that finish (≥ 60%) |
| 6 | Which hero did you play, and did anything feel unfair? | free text | Hero balance |
| 7 | Did the game run smoothly on your device? | 1 to 5 + device | Mobile p95 ≤ 33 ms |
| 8 | (If the Meet card showed) Would you add that cat for $5? Yes / Maybe / No | choice | Cat purchases ≥ 2% of finishers |
| 9 | (If the Meet card showed) In your words: what does the cat change in the game? | free text | Offer understood: looks only, no stats |
| 10 | Would you leave your email to hear when the Legends Pass and PvP arrive? | Yes / No | Notify-me ≥ 10% |
| 11 | (Token Tails cat owners) Did you notice your own cats in the match? | Yes / No / Not signed in | Cross-sell (GDD §7.2) |
| 12 | One thing you would change? | free text | Tuning pass |

**Read-out (10 people is a signal, not a measurement):**

| Signal | Pass | If it fails (Nov 11 tuning pass) |
|---|---|---|
| First match finished | ≥ 7 of 10 | Fix the stuck moments from the sheet first |
| Second match unprompted | ≥ 4 of 10 | "Run it back" first on the results screen, shorter reveal |
| Median fun | ≥ 3.5 | Read Q6 and Q12 |
| Match length | median 7:00 to 9:00 (the 2,000-seed sim median is 7:01) | Timeline numbers in `src/data/timeline.ts` (a sim change: SIM_VERSION and the backend first) |
| Meet card understood (Q9) | every answer says looks only, or names the kitten, chroma or card skin; nobody says "stronger" | Reword the card line (`meetCard` in `pawlegends/src/ui/cards.ts`) and `MEET_PERKS` in the cat sheet together |
| Phone HUD | no overlap that hides the pause button, score or minimap | `pawlegends/src/ui/ui.css` (see LAUNCH-READY.md, user item U2) |

| Tester | Device | Finished | Length | 2nd match | Fun | Meet card shown, Q8 | Notes |
|---|---|---|---|---|---|---|---|

### a.6 Push, PR and deploy (Wed Nov 11)

Run the package checks first (root `CLAUDE.md` row for `pawlegends/`, plus the touched packages). The CI workflow has
no `pawlegends` job, so these run on your machine; CI does run copy-lint over `pawlegends/src` and the backend and
client jobs.

```bash
cd pawlegends && npx tsc --noEmit && npx vitest run && npm run lint:sim && npm run lift -- --check \
  && npm run build && npm run budget && npx playwright test --workers=2 && npm run vendor-sim:check \
  && npm run determinism && npm run match -- --gate balance --seeds 2000 \
  && npm run match -- --gate fun1 && npm run match -- --gate fun2 && npm run match -- --gate novice \
  && npm run match -- --gate parked \
  && VITE_PAWLEGENDS_POSTHOG_KEY=phc_… npm run build:client   # writes client/public/pawlegends-game (commit it)
cd ../backend && rtk proxy npm run lint && npm run build && npm test   # 2 suites need OPENAI_API_KEY and INVALIDATE_CACHE_SECRET set to any value
cd ../client && npm install && npx tsc --noEmit && npx eslint . && npm test   # npm install: main added markdown-it and yaml
cd ../tools/copy-lint && node bin/copy-lint.mjs --target pawlegends,client,backend   # 2 findings come from main (GameSelectModal Swordcat line, shelter-payouts), not this branch
cd ../.. && node scripts/sync-contracts.mjs --check
git status --short                                # only our paths; client/public/pawlegends-game included
grep -l 'phc_' client/public/pawlegends-game/build/index-*.js   # prints the bundle when the standalone key is in
```

**Two keys, two routes.** On `/pawlegends` (embedded, where the traffic lands) the game has no PostHog of its own:
it relays every event over the bridge and the host sends it with `NEXT_PUBLIC_POSTHOG_KEY` (Vercel), so those rows need
only the site key (launch finding PUB-02). The game key matters only for the standalone build:
`VITE_PAWLEGENDS_POSTHOG_KEY` is inlined when `build:client` runs on your machine, and Vercel serves the committed
`client/public/pawlegends-game/` as is, so a Vercel env var does nothing for it. Use the same public project key (a
`phc_…` project key is public, it only writes events). Without it only standalone events are missing; the committed
build has no key (on purpose: no dev or e2e traffic reaches the project).

**`main` is merged.** `origin/main` (bd21a299) was merged into `feat/pawlegends` on 2026-10-22 with the checked
resolutions for the game picker, its tests, the landing routing test, the sitemap and `next.config.js`; the merge
helper is gone. If `main` moves again before the PR, run `git fetch origin && git merge origin/main`, then the client
checks above. The picker shows Moon Rave, Cupid Cat (in season), Purrsuit, Paw Match, Catnip Heist, Swordcat, Bad Cat
Daily, Pawlegends. The sitemap keeps main's `/feed` rows and still leaves out `/pawlegends` and `/pawlegends/terms`.

Then push the branch and open the PR. Do not merge yet:

```bash
git push -u origin feat/pawlegends
gh pr create --base main --head feat/pawlegends --title "feat(pawlegends): Phase 1 POC" --body-file <notes.md>
gh pr checks --watch                              # contracts, backend, client, copy-lint, bundle-guards green
```

**Deploy order: backend first, then the page.** One push to `main` redeploys Vercel and the backend at the same
time, and the PLAY picker card is on by default. Today's production backend has no `PAWLEGENDS` GameType and no
`/pawlegends/*` routes. If Vercel finishes first, players see the card, `/pawlegends/status` and checkout return 404,
and every save gets a plain 400 that the game marks `dropped` (never retried, so that match is lost). So the page
stays closed until the backend is live:

1. **Before the merge, close the page on Vercel.** Project → Settings → Environment Variables → Production:
   `NEXT_PUBLIC_PAWLEGENDS=0` (or `cd client && vercel env add NEXT_PUBLIC_PAWLEGENDS production`, value `0`). The
   build that the merge starts inlines it, so `/pawlegends` sends players to `/game` and the picker card is hidden
   (the card is off whenever the page is off, `client/components/pawlegends/flags.ts`).
2. **Merge:** `gh pr merge --merge` (or fast-forward `main`, as for the Oct releases).
3. **Wait for the backend deploy to finish**, then check it serves the v10 sim:

```bash
curl -s https://api.tokentails.com/pawlegends/sim | jq '{simVersion, simVersions, placeholder}'
#   expect {"simVersion": 10, "simVersions": [9, 10], "placeholder": false}
cd pawlegends && npm run vendor-sim:check-remote -- https://api.tokentails.com   # backend sim = game sim
curl -s https://api.tokentails.com/pawlegends/status | jq '{store, email, termsVersion}'   # 200, not 404
```

   If any of these fails, the page stays closed: fix forward (below) and repeat step 3. Do not reopen the page.
4. **Open the page:** delete `NEXT_PUBLIC_PAWLEGENDS` from the Production env (`vercel env rm NEXT_PUBLIC_PAWLEGENDS
   production`; unset means on), then redeploy the latest production deployment (Deployments → ⋯ → Redeploy, or
   `cd client && vercel --prod`). `NEXT_PUBLIC_*` values are inlined at build, so it takes the redeploy.

What deploys on the push to `main`:

- **Client:** Vercel builds `client/` and serves `/pawlegends`, `/pawlegends/terms` and the committed
  `client/public/pawlegends-game/`. `NEXT_PUBLIC_*` values are inlined at build, so an env change needs a redeploy.
  The static build under `/pawlegends-game/` is served even while the page is closed; nothing links to it then.
- **Backend:** redeploys itself from `main`. It must be live before the page opens (BACKEND.md: "Deploy the backend
  before a client build with a new sim"; GAPS.md §3 Wave B step 4). Steps 1 to 4 above enforce that order.

After step 4, play one match on `https://tokentails.com/pawlegends` signed in and confirm the save (the results save
chip says "Saved to your account"; saves go only through `POST /user/catbassadors/live`).

Then check that game events arrive (before Nov 12; LAUNCH b.1 reads them). In a private window open
`https://tokentails.com/pawlegends` and finish one match (embedded there is no stats prompt). Within a minute PostHog →
Activity shows `title_view`, `match_start` and `match_end` from that session with `embed = true` (filter `human =
true`), next to the host's `pawlegends_open` under the same anonymous id. No game events but a `pawlegends_open` means
the frame's `analytics` messages are not arriving (browser console: the game must be the committed build of this
change); no events at all means `NEXT_PUBLIC_POSTHOG_KEY` is unset on Vercel or the capture call is blocked
(`eu.i.posthog.com`).

**Rollback = fix forward.** Never revert. If production breaks: fix on a branch, run the checks above, push to `main`.
Fix-forward triggers (any one): the page or checkout errors; `vendor-sim:check-remote` fails; the PostHog alert
"Pawlegends rejected or failed saves" fires (a.8 step 4: over 5% of `pawlegends_save` in an hour are `rejected` or
`failed`); or the backend logs a run of `pawlegends save rejected` lines with `code=PAWLEGENDS_OUTCOME_MISMATCH`, a
hash mismatch or `code=PAWLEGENDS_SIM_VERSION` (sim drift: every save of that build is lost until the fix is live).
While the fix is on its way: `NEXT_PUBLIC_PAWLEGENDS=0` on Vercel plus a redeploy closes the page (the one kill
switch, it sends players to `/game` and hides the picker card). The $5 cat checkout is the shared Token Tails one, so
there is no Pawlegends-only switch for it; closing the page is the way to stop offers from the game. If the fix
touches the backend or the sim, the same order applies as on launch day: keep the page closed until the backend fix is
live and step 3 passes, then put the flag back to unset and redeploy Vercel (step 4).

### a.7 Live check: one real $5 cat (Wed Nov 11, after a.2, a.3 and the deploy)

The $5 cat is sold through the shared Token Tails checkout (`STRIPE_SECRET_KEY` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, already live in production for the shelter cats), so there is no Pawlegends
webhook or live key to add. `PAWLEGENDS_STRIPE_WEBHOOK_SECRET` stays unset: `/pawlegends/status` then reports
`store: false`, which only hides the retired `pl_*` store.

Preconditions: VAT answer recorded (a.2); the a.3 run recorded in the README; the cat sheet shows the terms, privacy
and EU withdrawal lines (LAUNCH-READY.md U4, U5); trademark search passed (a.1).

1. On production, in a browser profile that has opened `/pawlegends` once before, signed in with your own account,
   open the Meet card and buy the cat with your own card ($5).
2. Check the cat is in the squad and walks in the next match; PostHog shows `pawlegends_cat_purchase {ok: true}`.
3. Refund it in the Stripe Dashboard if you want the money back (the cat stays on the account: there is no clawback).

### a.8 Launch day (Thu Nov 12)

1. Once a.1 passed, in one commit (launch finding PUB-08): remove `noindex` from `client/pages/pawlegends/index.tsx`
   (`<SeoHead … noindex />`) and remove `'/pawlegends'` from the `exclude` list in `client/next-sitemap.config.js`, so
   the page is in the sitemap the moment it can be indexed. `'/pawlegends/terms'` stays excluded (its page stays
   `noindex`). Then flip the two guards in `client/__test__/pawlegends-host.test.tsx` (`noindex: true` and the sitemap
   check), run `npm test` in `client/`, and push to `main`. Ready diff:

   ```diff
   --- a/client/pages/pawlegends/index.tsx
   -      <SeoHead {...PAWLEGENDS_SEO} noindex />
   +      <SeoHead {...PAWLEGENDS_SEO} />
   --- a/client/next-sitemap.config.js
   -    exclude: ['/gaming', '/cats/view', '/feed/article', '/swordcat', '/yourcat', '/pawlegends', '/pawlegends/terms'],
   +    exclude: ['/gaming', '/cats/view', '/feed/article', '/swordcat', '/yourcat', '/pawlegends/terms'],
   ```
2. 16:00 UTC (18:00 Vilnius, 11:00 New York): X thread, Reddit posts, email to the opted-in Token Tails list
   (copy in §c).
3. Start tranche 1 (§b.2).
4. Check the PostHog dashboard at 20:00 UTC and on Fri morning: `match_end` from human sessions, errors, `perf_sample`,
   and the **`pawlegends_save` rejected/failed ratio** (rejected + failed over all `pawlegends_save` events; `saving`
   is never sent). Break it down by `code`: `PAWLEGENDS_OUTCOME_MISMATCH`, `PAWLEGENDS_HASH_MISMATCH` or
   `PAWLEGENDS_SIM_VERSION` mean the game and backend sims drifted apart (fix forward, a.6); `httpStatus` 429 or 503
   is load on the replay worker. The backend side is the `PawlegendsLive` log (`pawlegends save rejected: code=…
   simVersion=… difficulty=…`, docs/BACKEND.md) in the DigitalOcean runtime logs.

   Set up the alert once, before step 2: PostHog → new Trends insight "Pawlegends rejected or failed saves", series
   A = `pawlegends_save` where `status` is `rejected` or `failed`, series B = `pawlegends_save` (all), formula
   `A / B * 100`, interval hour; save it, then Alerts → New alert: value above 5, check hourly, notify your email.
   Host events wait for no prompt, so the ratio covers every signed-in save. With fewer than
   ~20 saves an hour one bad save trips it: read the count before acting.

   **Errors** (launch finding R1) are one event, `app_error`, on the same dashboard: PostHog → new Trends insight
   "Pawlegends crashes", series `app_error` where `code` starts with `pawlegends_` (a game crash the iframe sent to the
   host: `pawlegends_window`, `pawlegends_rejection`, `pawlegends_worker`; context `screen`, `tier`, `sim`) plus
   `app_error` where `$lib` = `pawlegends` (the game opened on its own, not embedded), broken down by `code` and
   `message`; plus a second series `pawlegends_bridge_timeout` (the frame never answered in 120 s, the "taking too long
   to load" panel; `reloads` = Reload presses before it). Host-page crashes are `app_error` with other codes
   (`window_error`, `unhandled_rejection`). Messages are cut to lower-case `[a-z0-9_ ]`, at most 80 characters, no
   stack or URL; the host sends at most 5 a session and one per code, the game at most 5 a page, none after the
   player turned stats off in the game's Settings. Pin the insight; a run of `pawlegends_worker` after a deploy is a fix-forward
   trigger (a.6), like the save alert. This is the "crashes" check of the week-1 row in §b.2.

---

## (b) Distribution plan: €1,500, Nov 12 to Dec 10

### b.1 Gate metrics and kill criteria (GDD §10.1)

All metrics count **human sessions only**: at least 20 real pointer, touch or key events, a match of at least 60 s
and a non-headless user agent (`analytics/human.ts`).

**Consent (launch finding PUB-02, Oct 21: the game follows the site's policy; legal and product call stays yours).**
tokentails.com removed its consent card on Oct 16 and now sends analytics for everyone. Embedded on /pawlegends the
game shows no prompt: it relays its events over the bridge (`analytics {event, props}`) and the host sends them with
its own `analytics.track`, under the site's key (`NEXT_PUBLIC_POSTHOG_KEY` on Vercel) and anonymous id, so game rows and
host rows (`pawlegends_open`, `pawlegends_save`, `pawlegends_meet_open`, `pawlegends_cat_purchase`) join on one id.
Relayed rows carry `embed = true`; the host drops any unknown event or a prop that is not a number, boolean or short
token string, and sends at most 1,000 a page. The game's Settings row "Share anonymous play stats" still turns it off
for that player. Standalone (the bare game URL) keeps the old rule: its own PostHog call with
`VITE_PAWLEGENDS_POSTHOG_KEY`, inlined at `npm run build:client`, after a yes to the prompt from the second session.
The committed build has no game key, so the standalone URL sends nothing; every row below comes from the embedded page
and needs only `NEXT_PUBLIC_POSTHOG_KEY`. Check it once before Nov 12 (a.6, "check that game events arrive").

What is on sale: one Token Tails cat for $5 from the "Meet <cat>" card (never in a player's first visit, at most one
card a visit and one a day, never under 16; GAPS.md "Revenue"). The retired `pl_*` packs (Starter, Founder, Founder
Legend) are not sold, so no presale refund promise applies.

| Metric | Target | Source |
|---|---|---|
| Human players who finish ≥ 1 match | ≥ 300 | `match_end` |
| First sessions that finish a match | ≥ 60% | `title_view` → `match_end`, session 1 |
| Start a 2nd match within 24 h | ≥ 35% | `second_match` |
| D1 / D7 retention | ≥ 25% / ≥ 8% | returning `title_view`; backend `pawlegendsMatches` for signed-in players |
| Median match length | 7:00 to 9:00 | `match_end.length` (2,000-seed sim median 7:01) |
| Meet card funnel | card seen → sheet opened → paid, read weekly | `offer_shown` and `offer_click` (game), `pawlegends_meet_open`, `pawlegends_cat_purchase {ok: true}` |
| $5 cat purchases from the game | ≥ 15, or ≥ 2% of finishers | `pawlegends_cat_purchase {ok: true}`, checked against the Stripe Dashboard (PaymentIntents, $5) |
| Buyers who play a match with the cat within 24 h | ≥ 70% | `match_start` within 24 h after `pawlegends_cat_purchase {ok: true}` (same id) |
| Mobile p95 frame time | ≤ 33 ms | `perf_sample` + the a.4 gate |
| "Notify me" signups (Legends Pass and PvP) | ≥ 10% of finishers | `pawlegendsnotify` confirmed rows |
| Forfeit rate on Normal | < 15% | the save's `reason: 'forfeit'` in the backend (GAPS.md §7, B2) |

| Kill gate | Condition (read on Thu Dec 10) | Action |
|---|---|---|
| Acquisition failure | < 300 human finishers after 4 weeks and the full €1,500 | **Pause.** No Phase 2. Re-test only with a new channel |
| Monetization failure | ≥ 300 finishers but < 5 cat purchases from the game | **Stop the MOBA.** Keep the sim and heroes as Kibble Swarm PvE, or fold the kits into PPK |
| Fun failure | D1 < 15%, or < 35% start a 2nd match, after two tuning passes | Stop, or pivot to Litterbox Rumble or Swarm on the same sim |
| Length failure | Median < 5:00 or > 10:00 after two tuning passes | Rework map and timeline before any Phase 2 decision |
| Performance failure | Mobile p95 > 50 ms after one optimisation pass | Desktop-first for Phase 2 |

A cat bought from the game stays the buyer's Token Tails cat whatever the kill gate says (it lives on the account).

### b.2 Channels and money (GDD §11.1)

| Channel | Budget | Target finishers |
|---|---|---|
| Token Tails email list (opted-in only) and the `/game` lobby card | €0 | 150 |
| Short-video paid test: TikTok, Instagram Reels, YouTube Shorts, screen-captured match moments, landing `/pawlegends` | €1,000 | 500 at ≤ €2 each |
| 20 small cat and mobile-gaming creators, €25 each, posts labelled `#ad` | €500 | 100 |
| Dare links, X, Reddit (r/WebGames; r/MobaGames if its rules allow), itch.io page | €0 | 50 |
| **Total** | **€1,500** | **800 planned, 300 needed** |

Two tranches: **€500 in week 1**, the remaining **€1,000 only if cost per finisher is under €4**.

**Before the first euro of paid EU traffic:** the cat sheet needs the terms, privacy and EU withdrawal lines
(LAUNCH-READY.md, user items U4 and U5). Until then spend only on the €0 channels.

Paid targeting: 18+ (the cat checkout asks the age band; under 16 is blocked and 16 to 17 is capped at €30 a month),
EU, UK, US, Canada, Australia; interests cats, dogs, mobile games, MOBA. Landing URL with UTM per channel, for example
`https://tokentails.com/pawlegends?utm_source=tiktok&utm_campaign=pl-launch&utm_content=teamfight`.

### b.3 Week by week

| Week | Dates | Spend | Work | Decision at the end |
|---|---|---|---|---|
| 0 | Nov 9 to 11 | €0 | Cut 6 clips of 15 to 25 s from real matches (teamfight, parry, Pudding race, bush ambush, tether arena, dare result); write to 20 creators with the §c.4 brief; email draft ready; PostHog dashboard with every b.1 metric | – |
| 1 | Thu Nov 12 to Wed Nov 18 | **€500**: paid €350 (≈ €115 each on TikTok, Reels, Shorts, 2 clips each), creators €150 (first 6) | Launch posts, email, Reddit, itch page; check comments and crashes daily (the "Pawlegends crashes" insight, a.8 step 4) | Cost per finisher = paid and creator spend ÷ human finishers in the week (email and organic finishers counted apart). **< €4: release tranche 2.** ≥ €4: no more paid spend; email and organic only; swap clips once and retest with the €0 left |
| 2 | Nov 19 to 25 | tranche 2 part 1: paid €350 on the best 1 or 2 channels, creators €175 (7) | First tuning pass from week-1 data (length, bots, controls); v11 Weekly Twist (GAPS.md N0) only if the week-1 numbers hold | Cost per finisher still < €4? Keep going. Else stop paid spend |
| 3 | Nov 26 to Dec 2 | tranche 2 part 2: paid €300, creators €175 (7) | Second tuning pass if fun or length gates miss | – |
| 4 | Dec 3 to 10 | €0 new spend | Measure only; Dec 10 read every b.1 gate | Phase 2 go, pause or stop (b.1) |

Totals: paid €350 + €350 + €300 = €1,000; creators €150 + €175 + €175 = €500.

### b.4 Weekly log (every Thursday)

| Week | Spend to date | Human finishers | Cost per finisher | 1st-session finish | 2nd match 24 h | D1 | D7 | Median length | Meet seen / opened / paid | Cat seen in 24 h | Notify | Mobile p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | | |
| 2 | | | | | | | | | | | | |
| 3 | | | | | | | | | | | | |
| 4 | | | | | | | | | | | | |

### b.5 Your call (defaults apply)

| # | Question | Default |
|---|---|---|
| 1 | Creators: GDD §11.1 gave each a Founder Legend code; the packs are retired and the backend has no comp grant for a Token Tails cat | Creators get €25 only, no free cat. A comp cat is a separate backend task |
| 2 | Channel attribution: UTMs land on the host page, but the game's events carry no UTM | Read cost per finisher from total spend ÷ human finishers per week, and the ad platforms' landing-page views per channel; host-side UTM capture is a separate client task |
| 3 | Portals (CrazyGames, Poki) need their SDKs and forbid outside purchases | Not in the 4 weeks. Copy in §c.3 is ready for later |
| 4 | Paid ads age targeting | 18+ |
| 5 | Paid EU traffic before the cat sheet shows the withdrawal notice (U5) | No: week-1 paid spend waits for U4 and U5; email, dare links, X and Reddit go ahead |

---

## (c) Launch copy

Checked against [`docs/CLAIMS.md`](../../CLAIMS.md). `tools/copy-lint` does not read Markdown, so every copy block
below was linted as strings through `lintSource` with the `pawlegends` target: game blocks as game copy (R13 on: no
shelter, impact or money words), the cat-offer block as a store file (prices allowed; R9 and R10 still on). Result in
§c.6. Rules kept by hand as well:

- No shelter, donation, charity, impact or "real-world" words anywhere in game marketing; no prices outside the
  store copy; no money verbs with players as the subject (R2, R3, R13).
- No platform numbers (registered users, followers, cats): R1 needs a fact id and game marketing does not cite one.
- No token, chain, wallet or USDC words (R9, R10); no "Pink Paw" in names (GDD §1); no LoL terms (Summoner, Rift,
  Nexus, Hextech); no fake scarcity or countdowns: nothing in the game is limited.
- Nothing sold changes a hero's stats: a Token Tails cat brings a Companion Kitten, an element chroma and a card skin,
  looks only. Never write that a cat makes a hero stronger.
- Creator posts carry `#ad` and the platform's paid-partnership label.
- Replace `[clip]` and `[time]` with the real capture before posting; never describe a moment the clip does not show.

### c.1 X (launch thread, Thu Nov 12, 16:00 UTC)

<!-- copy:game -->
```text
Pawlegends is out. Cats vs dogs, 3v3, right in your browser. Seven-minute matches, eight heroes, no download, no account. Pick a hero and pop the Bone Throne. tokentails.com/pawlegends

Eight heroes, all free to play: Clem, Sage, Sir Brutus, Cacklejaw, Lambo, Avietė, Bengas and Gabė. Fighter, marksman, tanks, assassins, a mage and a support.

On a laptop: right-click to move, QWER to cast. On a phone: joystick and drag-to-aim, in landscape. You play with two bot allies against three bots: Rookie bots in your first match, then Easy, Normal or Hard.

Every finished match makes a dare link: same map seed, same picks, same bots. "Beat my [time] vs Easy bots." Your move.

Own Token Tails cats? Sign in and they join your matches as element colours, tier frames and up to two Companion Kittens marching in your wave. Looks only, no stats.

You lead the bots: ping Go here, Group on me, Take Pudding, Push a lane, Defend base, Fall back or Focus hero, and your two allies follow the call.
```

Single posts for the following days (one a day, each with a clip):

<!-- copy:game -->
```text
Clem holds The Stand and the shot flies straight back. Purrfect. [clip] Cats vs dogs in your browser: tokentails.com/pawlegends

2:30 on the clock. Pudding, a giant dragon scared of everything, wakes up in the river. Calm him first and he escorts your next wave. [clip]

Cacklejaw slinks into the catnip bush. Nobody sees him. Then Pack Hunt. [clip] tokentails.com/pawlegends

Sir Brutus throws down Champion's Challenge: a ring, two heroes, no way out for three seconds. [clip]

Team Cat or Team Dog? Eight heroes to pick from. Seven-minute matches, no download. tokentails.com/pawlegends
```

### c.2 Reddit

r/WebGames (read the sidebar first; post once, answer every comment for the first hours):

<!-- copy:game -->
```text
Pawlegends: a cats vs dogs 3v3 MOBA that runs in a browser tab (seven-minute matches vs bots, laptop and phone)

Hi r/WebGames. We made a small MOBA where cats and dogs settle their disputes on a neutral crossing: two lanes, towers, a rat camp and Pudding, a giant dragon who is scared of everything. You pick one of eight heroes and play with two bot allies against three bots. No download, no account.

Laptop: right-click to move, QWER to cast. Phone: landscape, joystick and drag-to-aim.

Two things we would love feedback on: does the first match make sense without a tutorial, and is seven minutes the right length? You can ping your two bot allies (group, push, defend, take Pudding, focus a hero). Every hero is free and nothing you can own changes stats.

tokentails.com/pawlegends
```

r/MobaGames (only if its rules allow self-posts about your own game; otherwise skip):

<!-- copy:game -->
```text
We built a 3v3 MOBA for the browser with talents instead of items. Looking for design feedback.

Pawlegends is cats vs dogs on a two-lane map. No gold and no items: you pick a talent at levels 3, 6 and 9, and for Sage and Sir Brutus the level-6 pick changes an ability's shape (Sage's Volley becomes one piercing line; Sir Brutus plants a dome that blocks shots). Matches are built to end in about seven minutes: on Normal and Hard, Sunset at 6:00 makes towers and cores take double damage and lets each takedown chip the victim's core, Sudden Death at 7:45 drains both cores, and 11:00 is a hard end (Easy runs a little faster: Sunset 5:00, Sudden Death 7:00). Towers take half damage from heroes when none of your minions is near (backdoor protection).

Eight heroes in this first build: Clem (fighter, a parry that sends shots back), Sage (marksman, a map-long Moonshot), Sir Brutus (tank, a tether ring), Cacklejaw (assassin, stealth in the bushes), Lambo (tank, a pull that ties enemy heroes up), Avietė (assassin, a blink you can recast to blink back), Bengas (mage, a burning stage that slows) and Gabė (support, a charm that walks enemies to her). Bots only for now: Rookie in the first match, then Easy, Normal or Hard.

What would you change first? tokentails.com/pawlegends
```

### c.3 Game page text (itch.io now; CrazyGames and Poki style for later)

On itch.io, use a page that links to `tokentails.com/pawlegends`. Upload the HTML5 build there only after checking
that the standalone build (no host page) shows no Meet card (it has no host, so it gets no offer).

<!-- copy:game -->
```text
Pawlegends

Cats vs dogs 3v3 battles. Seven-minute matches, eight heroes, play with bots in your browser.

The Truce Games have begun. Cats and dogs no longer fight over the best sunbeam: they settle it on the Crossing, three heroes a side. Push your lane, take the rat camp, calm Pudding before the other team does, and knock over the Bone Throne.

Features: eight heroes with their own abilities and talents (Clem, Sage, Sir Brutus, Cacklejaw, Lambo, Avietė, Bengas, Gabė), all free to play. Pings to lead your two bot allies. Two lanes, towers, a jungle camp and a giant neutral dragon. Matches end by 11:00 at the latest. Paw Tricks: Pounce, Snack Break, Hiss or Purr-ify. Rookie bots for your first match, then Easy, Normal or Hard. Dare links to send a friend the exact same match. Plays on laptops and on phones in landscape.

Controls (laptop): right-click to move and attack, A then left-click to attack-move, Q W E R abilities, D Paw Trick, B nap back to base, Space centres the camera, Tab scoreboard.

Controls (phone): joystick to move, Attack button, tap an ability to cast or drag to aim, drag onto the cross to cancel.

Tags: moba, cats, dogs, 3v3, strategy, action, cartoon, browser, mobile
```

### c.4 Short video (TikTok, Reels, Shorts) and the creator brief

<!-- copy:game -->
```text
Clip A, teamfight. On screen 0 to 2 s: "cats vs dogs, but it's a MOBA". 2 to 13 s: the fight. End card: "Play in your browser, link in bio". Caption: Team Cat or Team Dog? Seven-minute matches, no download. #catsvsdogs #moba #indiegame #browsergame

Clip B, parry. On screen: "he sent it back". Clem's Stand sends the shot back, "Purrfect!" pops. Caption: Timing is everything. #moba #gaming #cats

Clip C, Pudding race. On screen: "2:30. The dragon wakes up." Both teams race to calm Pudding. Caption: Calm the dragon, win the lane. #moba #indiegame

Clip D, bush ambush. On screen: "where did he go". Cacklejaw stealth, then Pack Hunt. Caption: Never trust a quiet bush. #moba #dogs

Creator brief: play one match of Pawlegends at tokentails.com/pawlegends and post 15 to 30 seconds of it, in your own words. Label the post #ad and turn on the paid-partnership label. Show the game as it plays; no claims about what it does beyond the match. Link: tokentails.com/pawlegends with your own utm_source.
```

Email to the opted-in Token Tails list (Thu Nov 12):

<!-- copy:game -->
```text
Subject: Your cats just joined a cats vs dogs battle

Pawlegends is live on Token Tails: three heroes a side, cats vs dogs, about seven minutes a match, right in your browser.

Sign in and your own cats come along: their element colours on your hero, their tier frames, and up to two of them marching in your wave as Companion Kittens. Looks only, no stats.

Play now: tokentails.com/pawlegends
```

### c.5 Cat offer copy (the Meet card and the host cat sheet)

The game has no store. The one offer is the "Meet <cat>" card (`meetCard` in `pawlegends/src/ui/cards.ts`) that opens
the host cat sheet (`client/components/pawlegends/PawlegendsCatSheet.tsx`, `MEET_PERKS`); the price comes from the
Token Tails price table (`Prices.shelterCat`, $5). The code wins over this file. `<Element>` is the cat's element
name. The retired `pl_*` lines (Starter, Founder, Founder Legend, upgrade) stay in
`backend/src/pawlegends/pawlegends.contracts.ts` only so an earlier purchase could restore; they are not shown or
posted anywhere.

<!-- copy:store -->
```text
A new squad mate?

<Element> cat. Trots at your heels, cheers your takedowns and unlocks the <Element> chroma and its card skin for every hero.

Trots at your heels as a Companion Kitten. Its element chroma for every hero. Its card skin for every hero.

How old are you? Under 16, 16 or 17, 18 or older.

Ask a parent or guardian to buy this on their own device.

$5. Looks only: no cat changes a hero's stats.
```

Still missing from the sheet (LAUNCH-READY.md U4, U5; legal wording is yours): a terms link and a privacy link next to
the payment form, the EU 14-day withdrawal notice, and the "deliver now, I lose my withdrawal right" consent box.

### c.6 Copy-lint result

Run 2026-10-22 after the §c rewrite for the current game (no store; the Founder lines in c.1 and the store block in c.5
replaced by pings, the level-6 branches and the cat offer) on this file's `copy:game` and `copy:store` blocks: each
paragraph one string, linted with `lintSource` from `tools/copy-lint/lib/lint.mjs`, target `pawlegends`; game blocks as
`pawlegends/src/launch-copy.ts`, the offer block as `pawlegends/src/money/launch-copy.ts`. A negative control in the
same harness (a game string with a price, "shelter", "tokens" and "wallet") must come back with findings.

```
game: 36 strings, 0 finding(s)
store: 6 strings, 0 finding(s)
negative control: 4 finding(s) (R9, R10, R13, R2)
copy-lint (pawlegends target, lintSource): 0 finding(s)
```

Re-run after any edit to a copy block: the harness is a short Node script that pulls each `<!-- copy:game -->` /
`<!-- copy:store -->` block out of this file and calls `lintSource(file, src, {facts, target})` with
`TARGETS.find(t => t.name === 'pawlegends')` and `loadFacts(root)`. It is not checked in; adding Markdown blocks to
copy-lint itself is a tools task.
