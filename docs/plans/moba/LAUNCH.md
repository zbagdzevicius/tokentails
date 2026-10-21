# Pawlegends POC: launch kit (Thu 2026-11-12)

Launch readiness for Phase 1 "First Blood" of [`GDD.md`](GDD.md), built per [`POC.md`](POC.md). Written 2026-10-17.
Three parts: (a) the founder checklist in order, (b) the distribution plan for the €1,500 budget and the 4-week
measurement window (to Thu 2026-12-10), (c) launch copy.

**Changed since this kit was written (2026-10-18).** The game no longer sells the `pl_*` SKUs (Starter, Founder,
Founder Legend, upgrade): it sends no `purchase-intent`, and the routes stay only so earlier purchases restore. The one
thing on sale from the game is a direct-purchase Token Tails cat ($5) from the session's single "Meet <cat>" card
(never in session 1, at most one a session), through the host's cat sheet and the Token Tails checkout with the
Pawlegends age band and spend caps (BACKEND.md, "Pawlegends"). So §a.3 becomes one test-mode $5 cat purchase from the
Meet card plus one restore of an old token, §a.7 step 5 one real $5 cat, and the store copy in §c.5 and the Founder
lines in §b and §c are not used until the founder decides to sell packs again. Rows 3 and 7 of the checklist keep
their dates.

Times: Vilnius is EET (UTC+2) from Oct 25, so the whole launch window is UTC+2.

Where results go:

| What | Where |
|---|---|
| Stripe test-mode session ids (8 runs) | [`pawlegends/README.md`](../../../pawlegends/README.md), "Stripe test mode" |
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
| 3 | Stripe test-mode run: one $5 cat from the Meet card (card), one restore (was: 4 SKUs × USD and EUR) | Mon Nov 9 (M3 done) | Stripe live mode |
| 4 | Device gate on iPhone 11, Pixel 6a, Iris Xe | Tue Nov 10 | Launch (POC proof 3) |
| 5 | 10-person playtest | Tue Nov 10 | Tuning pass on Nov 11 |
| 6 | Push, PR, merge, deploy | Wed Nov 11 | Live mode, launch |
| 7 | Stripe live mode switch | Wed Nov 11 | Taking money |
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

### a.3 Stripe test-mode run, per SKU in USD and EUR

Env var names only (values live in the local backend env; never read, paste or commit `.env*`). From
[`docs/BACKEND.md`](../../BACKEND.md), "Pawlegends":

| Name | Local test value |
|---|---|
| `PAWLEGENDS_STRIPE_SECRET_KEY` | a test secret key; unset falls back to `STRIPE_SECRET_KEY` (test keys only outside production) |
| `PAWLEGENDS_STRIPE_WEBHOOK_SECRET` | the signing secret that `stripe listen` prints (required; unset: `store: false`, 503) |
| `PAWLEGENDS_ENTITLEMENT_SECRET` | any long random string; unset falls back to an HMAC of `INVALIDATE_CACHE_SECRET` |
| `PAWLEGENDS_PUBLIC_URL` | `http://localhost:3000` (Stripe return URLs and email links) |
| `PAWLEGENDS_DEV_LINKS` | `true` locally only (restore and notify links come back in the answer) |
| `NEXT_PUBLIC_BE_URL` (client) | `http://localhost:3005` |

**Terminal 1, Stripe CLI** (install once: `brew install stripe/stripe-cli/stripe`):

```bash
stripe login
stripe listen \
  --forward-to localhost:3005/pawlegends/stripe/webhook \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,charge.refunded
```

It prints `Your webhook signing secret is whsec_…`. Put that value in `PAWLEGENDS_STRIPE_WEBHOOK_SECRET` in the local
backend env by hand. These four events are the ones `pawlegends-webhook.service.ts` handles.

**Terminal 2, backend:**

```bash
cd backend && npm run dev            # port 3005
curl -s localhost:3005/pawlegends/status | jq '{store, email, termsVersion}'
# expect "store": true. false = a key, the webhook secret or the entitlement key is missing
```

**Terminal 3, client:**

```bash
cd client && npm run dev             # port 3000; uses the committed client/public/pawlegends-game build
open http://localhost:3000/pawlegends
```

**The 8 runs.** The starter and the upgrade are once per email and per device, and the upgrade needs a Founder, so use
two browser profiles (a profile is a device: the host keeps the device id in browser storage) and one new email per
profile and currency. Currency follows the browser time zone (EUR in Europe). For USD, open DevTools → More tools →
Sensors → Location, pick a US city (time zone `America/New_York`), reload.

| Run | Profile, email | Currency | SKU | Card |
|---|---|---|---|---|
| 1 | A, `you+pl-usd-a@…` | USD | `pl_starter` | 4242 4242 4242 4242 |
| 2 | A, same | USD | `pl_founder` | 4242 4242 4242 4242 |
| 3 | A, same | USD | `pl_founder_legend_upgrade` (needs run 2) | 4000 0027 6000 3184 (3-D Secure) |
| 4 | B, `you+pl-usd-b@…` | USD | `pl_founder_legend` | 4242 4242 4242 4242 |
| 5 to 8 | C and D, new emails | EUR | same four, same order | same |

Any future expiry date, any CVC. For each run:

1. In the game lobby tap Store, pick the SKU, answer the age band (18+) and tick the consent box, pay on Stripe.
2. Copy the `cs_test_…` id from the return URL (`/pawlegends?checkout=ok&session_id=…`) or from the
   `stripe listen` log line.
3. Check the grant:
   ```bash
   curl -s "localhost:3005/pawlegends/entitlements?sessionId=cs_test_…" | jq '{skus, items}'
   ```
4. Start a match: the bought item shows on the hero in the lobby and in the match (POC proof 2).
5. Write the session id, currency, date and "item seen: yes/no" into the README "Stripe test mode" table.

Also check once (any profile): a second starter on the same email is refused; the under-16 band shows "Ask a parent
or guardian to buy this on their own device."; a refund removes the item:

```bash
stripe refunds create --payment-intent pi_…     # from the session in the Stripe test dashboard
curl -s "localhost:3005/pawlegends/entitlements?sessionId=cs_test_…" | jq '.skus'   # item gone
```

If a SKU is missing from the store panel, the request can be made by hand (same rules, no UI proof):

```bash
curl -s -X POST localhost:3005/pawlegends/checkout -H 'content-type: application/json' \
  -d '{"sku":"pl_founder","currency":"eur","email":"you+pl-eur-c@example.com","ageBand":"18+","consentVersion":"2026-10-17","deviceId":"launchtest-c-0001"}' \
  | jq '{url, sessionId}'
```

Backend specs for the same flow: `cd backend && npx jest src/pawlegends`.

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

`?quality=` is read by `src/render/quality.ts`. **`?perf=1` is not read by the game at commit `c346bc8e`**: if the
overlay is not in the build, measure this way instead:

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

**Script (observer reads only the bold lines):**

1. **"Here is a link. Play it however you like. I will stay quiet; think out loud if you want."** Send
   `https://tokentails.com/pawlegends`.
2. Observe silently. Note on the sheet: seconds to the first move, every moment stuck for more than 10 s, which
   ghost-paw tips completed (move, attack a minion, Q a hero, Tumble a telegraph, R).
3. Do not help unless the tester is stuck for 60 s; then note "helped" and what.
4. At the results screen, wait 30 s. Note whether the tester starts a second match **unprompted**.
5. **"Open the store and tell me what you see. You don't have to buy anything."** Note whether they find it and what
   they say about "Delivered now" and "Delivered at MVP launch".
6. Survey (below), 5 minutes.

**Observer sheet per tester:** device, first match finished (Y/N), match length, outcome, tips done (0 to 5),
second match unprompted (Y/N), stuck moments, helped (Y/N), store found (Y/N), visible stutter (Y/N).

**Survey (each question names the GDD §10.1 metric it predicts):**

| # | Question | Answer | Metric |
|---|---|---|---|
| 1 | How fun was that match? | 1 to 5 | Fun gate |
| 2 | Would you play another match right now? | Yes / No | 2nd match within 24 h (≥ 35%) |
| 3 | Would you come back to play tomorrow? | 1 to 5 | D1 (≥ 25%), D7 (≥ 8%) |
| 4 | The match felt: too short / about right / too long | choice | Median length 7:00 to 9:00 |
| 5 | What was the hardest thing about the controls? | free text | First sessions that finish (≥ 60%) |
| 6 | Which hero did you play, and did anything feel unfair? | free text | Hero balance |
| 7 | Did the game run smoothly on your device? | 1 to 5 + device | Mobile p95 ≤ 33 ms |
| 8 | After the store tour: which, if any, would you buy? None / Starter / Founder / Founder Legend | choice | Purchases ≥ 2% of finishers; Founder + Legend ≥ 10 |
| 9 | In your words: what do you get now, and what comes later? | free text | Presale terms are understood (GDD §8.3) |
| 10 | Would you leave your email to hear when the Legends Pass and PvP arrive? | Yes / No | Notify-me ≥ 10% |
| 11 | (Token Tails cat owners) Did you notice your own cats in the match? | Yes / No / Not signed in | Cross-sell (GDD §7.2) |
| 12 | One thing you would change? | free text | Tuning pass |

**Read-out (10 people is a signal, not a measurement):**

| Signal | Pass | If it fails (Nov 11 tuning pass, Dev A) |
|---|---|---|
| First match finished | ≥ 7 of 10 | Fix the stuck moments from the sheet first |
| Second match unprompted | ≥ 4 of 10 | Shorter results screen, "Play again" first |
| Median fun | ≥ 3.5 | Read Q6 and Q12 |
| Match length | median 7:00 to 9:00 | Timeline numbers in `src/data/timeline.ts` |
| Store terms understood (Q9) | ≥ 8 of 10 | Reword the sheet lines (backend `pawlegends.contracts.ts` and the host sheet) |

| Tester | Device | Finished | Length | 2nd match | Fun | Q8 | Notes |
|---|---|---|---|---|---|---|---|

### a.6 Push, PR and deploy (Wed Nov 11)

Run the package checks first (root `CLAUDE.md` row for `pawlegends/`, plus the touched packages). The CI workflow has
no `pawlegends` job, so these run on your machine; CI does run copy-lint over `pawlegends/src` and the backend and
client jobs.

```bash
cd pawlegends && npx tsc --noEmit && npx vitest run && npm run lint:sim && npm run lift -- --check \
  && npm run build && npm run budget && npx playwright test --workers=2 && npm run vendor-sim:check \
  && npm run match -- --seeds 400 --balance --check-determinism && npm run determinism -- --seeds 200 \
  && VITE_PAWLEGENDS_POSTHOG_KEY=phc_… npm run build:client   # writes client/public/pawlegends-game (commit it)
cd ../backend && npm run lint && npm run build && npm test
cd ../client && npx tsc --noEmit && npx eslint . && npm test
cd ../tools/copy-lint && node bin/copy-lint.mjs --target pawlegends,client,backend
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

**Merge `main` into the branch first.** `main` moved on (Moon Rave and Bad Cat Daily cards, the blog rebuild), so
the PR would conflict in the game picker, its tests, the sitemap and `next.config.js`. With everything committed:

```bash
git fetch origin && tools/merge-main/merge-main.sh   # merges origin/main, puts the checked resolutions in place, stops before the commit
(cd client && npm install && npx tsc --noEmit && npx eslint . && npm test)
git commit --no-edit
```

The script uses its saved resolutions only while both sides of a file are still the versions it was resolved
from (origin/main bd21a299). Anything else it leaves conflicted and names. The picker then shows Moon Rave, Cupid Cat
(in season), Purrsuit, Paw Match, Catnip Heist, Swordcat, Bad Cat Daily, Pawlegends. The sitemap keeps main's `/feed`
rows and still leaves out `/pawlegends` and `/pawlegends/terms`. The script removes `tools/merge-main/` in the
merge commit.

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
switch, it sends players to `/game` and hides the picker card); removing `PAWLEGENDS_STRIPE_WEBHOOK_SECRET` on the
backend stops new checkouts (503, the store button hides, the game still plays). If the fix touches the backend or
the sim, the same order applies as on launch day: keep the page closed until the backend fix is live and step 3
passes, then put the flag back to unset and redeploy Vercel (step 4). Put the webhook secret back once the fix is
live.

### a.7 Stripe live mode switch (Wed Nov 11, after a.2 and a.3)

Preconditions: VAT answer recorded (a.2); all 8 test runs recorded in the README (a.3); `/pawlegends/terms` live on
production with the GDD §8.3 text; trademark search passed (a.1).

1. Stripe Dashboard (live mode) → Developers → Webhooks → Add endpoint:
   `https://api.tokentails.com/pawlegends/stripe/webhook`, events `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`.
2. On the backend host set `PAWLEGENDS_STRIPE_WEBHOOK_SECRET` to that endpoint's signing secret; set
   `PAWLEGENDS_STRIPE_SECRET_KEY` to a live key only if Pawlegends should not use the shared live
   `STRIPE_SECRET_KEY`; set `PAWLEGENDS_ENTITLEMENT_SECRET` (or rely on the `INVALIDATE_CACHE_SECRET` fallback);
   confirm `PAWLEGENDS_PUBLIC_URL` is unset (default `https://tokentails.com`) and `PAWLEGENDS_DEV_LINKS` is unset.
   With `NODE_ENV=production` a test key is skipped and test events are ignored.
3. If the accountant said Stripe Tax: that is a code change (`automatic_tax` on the session), not an env var. Do it
   before this step.
4. `curl -s https://api.tokentails.com/pawlegends/status | jq .store` → `true`.
5. One real purchase: `pl_starter` (€0.99) with your own card on production; check the item shows in the next
   match; then refund it in the Dashboard (the item goes away) and check `/pawlegends/founders` still says
   `{"left": 500, "cap": 500}`.

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
its own `analytics.track`, under the site's key and anonymous id, so game rows and host rows (`pawlegends_open`,
`pawlegends_save`) join on one id. Relayed rows carry `embed = true`; the host drops any unknown event or a prop that is
not a number, boolean or short token string, and sends at most 1,000 a page. The game's Settings row "Share anonymous
play stats" still turns it off for that player. Standalone (the bare game URL) keeps the old rule: its own PostHog
call, after a yes to the prompt from the second session. So the rows below cover every embedded human player; the
other options were (a) the game's own prompt embedded too (a small, self-selected sample) or (c) gate metrics from
host events and the backend only.

| Metric | Target | PostHog source |
|---|---|---|
| Human players who finish ≥ 1 match | ≥ 300 | `match_end` |
| First sessions that finish a match | ≥ 60% | `title_view` → `match_end`, session 1 |
| Start a 2nd match within 24 h | ≥ 35% | `second_match` |
| D1 / D7 retention | ≥ 25% / ≥ 8% | returning `title_view` |
| Median match length | 7:00 to 9:00 | `match_end.length` |
| Purchases (any SKU) | ≥ 15, or ≥ 2% of finishers | Stripe Dashboard (the webhook sends no `purchase` event yet) |
| Founder + Founder Legend purchases | ≥ 10 | Stripe Dashboard |
| Buyers who play a match with the item within 24 h | ≥ 70% | `item_seen_in_match` |
| Mobile p95 frame time | ≤ 33 ms | `perf_sample` + the a.4 gate |
| "Notify me" signups | ≥ 10% of finishers | `pawlegendsnotify` confirmed rows |

| Kill gate | Condition (read on Thu Dec 10) | Action |
|---|---|---|
| Acquisition failure | < 300 human finishers after 4 weeks and the full €1,500 | **Pause.** No Phase 2. Re-test only with a new channel |
| Monetization failure | ≥ 300 finishers but < 5 purchases | **Stop the MOBA.** Keep the sim and heroes as Kibble Swarm PvE, or fold the kits into PPK |
| Fun failure | D1 < 15%, or < 35% start a 2nd match, after two tuning passes | Stop, or pivot to Litterbox Rumble or Swarm on the same sim |
| Length failure | Median < 5:00 or > 10:00 after two tuning passes | Rework map and timeline before any Phase 2 decision |
| Performance failure | Mobile p95 > 50 ms after one optimisation pass | Desktop-first for Phase 2 |

If a kill gate fires, the presale refund promise (GDD §8.3) applies: every Founder buyer is emailed within 7 days.

### b.2 Channels and money (GDD §11.1)

| Channel | Budget | Target finishers |
|---|---|---|
| Token Tails email list (opted-in only) and the `/game` lobby card | €0 | 150 |
| Short-video paid test: TikTok, Instagram Reels, YouTube Shorts, screen-captured match moments, landing `/pawlegends` | €1,000 | 500 at ≤ €2 each |
| 20 small cat and mobile-gaming creators, €25 each, posts labelled `#ad` | €500 | 100 |
| Dare links, X, Reddit (r/WebGames; r/MobaGames if its rules allow), itch.io page | €0 | 50 |
| **Total** | **€1,500** | **800 planned, 300 needed** |

Two tranches: **€500 in week 1**, the remaining **€1,000 only if cost per finisher is under €4**.

Paid targeting: 18+ (the store is for adults by default; under-16 checkout is blocked anyway), EU, UK, US, Canada,
Australia; interests cats, dogs, mobile games, MOBA. Landing URL with UTM per channel, for example
`https://tokentails.com/pawlegends?utm_source=tiktok&utm_campaign=pl-launch&utm_content=teamfight`.

### b.3 Week by week

| Week | Dates | Spend | Work | Decision at the end |
|---|---|---|---|---|
| 0 | Nov 9 to 11 | €0 | Cut 6 clips of 15 to 25 s from real matches (teamfight, parry, Pudding race, bush ambush, tether arena, dare result); write to 20 creators with the §c.4 brief; email draft ready; PostHog dashboard with every b.1 metric | – |
| 1 | Thu Nov 12 to Wed Nov 18 | **€500**: paid €350 (≈ €115 each on TikTok, Reels, Shorts, 2 clips each), creators €150 (first 6) | Launch posts, email, Reddit, itch page; check comments and crashes daily (the "Pawlegends crashes" insight, a.8 step 4) | Cost per finisher = paid and creator spend ÷ human finishers in the week (email and organic finishers counted apart). **< €4: release tranche 2.** ≥ €4: no more paid spend; email and organic only; swap clips once and retest with the €0 left |
| 2 | Nov 19 to 25 | tranche 2 part 1: paid €350 on the best 1 or 2 channels, creators €175 (7) | First tuning pass from week-1 data (length, bots, controls) | Cost per finisher still < €4? Keep going. Else stop paid spend |
| 3 | Nov 26 to Dec 2 | tranche 2 part 2: paid €300, creators €175 (7) | Second tuning pass if fun or length gates miss | – |
| 4 | Dec 3 to 10 | €0 new spend | Measure only; Dec 10 read every b.1 gate | Phase 2 go, pause or stop (b.1) |

Totals: paid €350 + €350 + €300 = €1,000; creators €150 + €175 + €175 = €500.

### b.4 Weekly log (every Thursday)

| Week | Spend to date | Human finishers | Cost per finisher | 1st-session finish | 2nd match 24 h | D1 | D7 | Median length | Purchases | Founder + Legend | Notify | Mobile p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | | |
| 2 | | | | | | | | | | | | |
| 3 | | | | | | | | | | | | |
| 4 | | | | | | | | | | | | |

### b.5 Your call (defaults apply)

| # | Question | Default |
|---|---|---|
| 1 | GDD §11.1 gives each creator a Founder Legend code; the POC backend has no creator-code or comp grant (a promotion code would make the charged amount differ from the table price and the webhook would store the session as `review`) | Creators get €25 only. A comp grant (a scripted paid row that counts toward the 500 seats) is a separate backend task |
| 2 | Channel attribution: UTMs land on the host page, but the game's PostHog events come from the iframe and carry no UTM | Read cost per finisher from total spend ÷ human finishers per week, and the ad platforms' landing-page views per channel; host-side UTM capture is a separate client task |
| 3 | Portals (CrazyGames, Poki) need their SDKs and forbid outside purchases | Not in the 4 weeks. Copy in §c.3 is ready for later |
| 4 | Paid ads age targeting | 18+ |

---

## (c) Launch copy

Checked against [`docs/CLAIMS.md`](../../CLAIMS.md). `tools/copy-lint` does not read Markdown, so every copy block
below was linted as strings through `lintSource` with the `pawlegends` target: game blocks as game copy (R13 on: no
shelter, impact or money words), the store block as a store file (prices allowed; R9 and R10 still on). Result in
§c.6. Rules kept by hand as well:

- No shelter, donation, charity, impact or "real-world" words anywhere in game marketing; no prices outside the
  store copy; no money verbs with players as the subject (R2, R3, R13).
- No platform numbers (registered users, followers, cats): R1 needs a fact id and game marketing does not cite one.
- No token, chain, wallet or USDC words (R9, R10); no "Pink Paw" in names (GDD §1); no LoL terms (Summoner, Rift,
  Nexus, Hextech); no fake scarcity (Founder Legend's 500 seats are a real counter, nothing is "never sold again").
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

Founder packs are open in the store: a Founder coat for Clem, Sage, Sir Brutus and Cacklejaw now, more heroes and the Season 1 Legends Pass when Season 1 launches. Founder Legend is capped at 500 seats.
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

Two things we would love feedback on: does the first match make sense without a tutorial, and is seven minutes the right length? There is a cosmetic store; nothing in it changes stats.

tokentails.com/pawlegends
```

r/MobaGames (only if its rules allow self-posts about your own game; otherwise skip):

<!-- copy:game -->
```text
We built a 3v3 MOBA for the browser with talents instead of items. Looking for design feedback.

Pawlegends is cats vs dogs on a two-lane map. No gold and no items: you pick a talent at levels 3, 6 and 9. Matches are built to end in about seven minutes: on Normal and Hard, Sunset at 6:00 makes towers and cores take double damage and lets each takedown chip the victim's core, Sudden Death at 7:45 drains both cores, and 11:00 is a hard end (Easy runs a little faster: Sunset 5:00, Sudden Death 7:00). Towers take half damage from heroes when none of your minions is near (backdoor protection).

Eight heroes in this first build: Clem (fighter, a parry that sends shots back), Sage (marksman, a map-long Moonshot), Sir Brutus (tank, a tether ring), Cacklejaw (assassin, stealth in the bushes), Lambo (tank, a pull that ties enemy heroes up), Avietė (assassin, a blink you can recast to blink back), Bengas (mage, a burning stage that slows) and Gabė (support, a charm that walks enemies to her). Bots only for now: Rookie in the first match, then Easy, Normal or Hard.

What would you change first? tokentails.com/pawlegends
```

### c.3 Game page text (itch.io now; CrazyGames and Poki style for later)

On itch.io, use a page that links to `tokentails.com/pawlegends`. Upload the HTML5 build there only after checking
that the standalone build (no host page) shows no store button.

<!-- copy:game -->
```text
Pawlegends

Cats vs dogs 3v3 battles. Seven-minute matches, eight heroes, play with bots in your browser.

The Truce Games have begun. Cats and dogs no longer fight over the best sunbeam: they settle it on the Crossing, three heroes a side. Push your lane, take the rat camp, calm Pudding before the other team does, and knock over the Bone Throne.

Features: eight heroes with their own abilities and talents (Clem, Sage, Sir Brutus, Cacklejaw, Lambo, Avietė, Bengas, Gabė), all free to play. Two lanes, towers, a jungle camp and a giant neutral dragon. Matches end by 11:00 at the latest. Paw Tricks: Pounce, Snack Break, Hiss or Purr-ify. Rookie bots for your first match, then Easy, Normal or Hard. Dare links to send a friend the exact same match. Plays on laptops and on phones in landscape.

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

### c.5 Store and SKU copy (host purchase sheet, store panel, Stripe product names)

The "Delivered now" and "Delivered at MVP launch" lines are the ones in `backend/src/pawlegends/pawlegends.contracts.ts`
(the server table wins over this file); the consent line is the one in `client/components/pawlegends/PawlegendsHost.tsx`. Prices are VAT included, same number in € and $.

<!-- copy:store -->
```text
Pawlegends Starter. €0.99 / $0.99, VAT included. Once per account. Delivered now: "Pink Bow Clem" Rare skin and the "Starter" emote. Delivered at MVP launch (target 2027-04-30): 3-day Pride Club trial (bonus).

Pawlegends Founder. €9.99 / $9.99, VAT included. Delivered now: Founder Epic coat for all 4 heroes, animated Founder frame, Founder title. Delivered at MVP launch (target 2027-04-30): 4 MVP heroes of your choice, Season 1 Legends Pass, your name in the in-game credits.

Pawlegends Founder Legend. €29.99 / $29.99, VAT included. First 500 seats, then it closes. Delivered now: Everything in Founder, plus the "Dawnblade Clem" Legendary skin and the Legend frame. Delivered at MVP launch (target 2027-04-30): Everything in Founder at MVP, plus all 8 MVP heroes, Season 1 Legends Pass+, 1 month Pride Club, your name on the Founders' Banner.

Pawlegends Founder Legend upgrade. €20.00 / $20.00, VAT included. For Founder owners, once. Delivered now: The "Dawnblade Clem" Legendary skin and the Legend frame. Delivered at MVP launch (target 2027-04-30): Everything Founder Legend delivers at MVP.

Everything here is cosmetic: no item changes a hero's stats.

If the MVP is not live by 2027-06-30, you can ask for a full refund within 60 days after that date, by email, no questions asked. Items delivered now stay yours.

Deliver the "now" items at once. I understand I lose my 14-day withdrawal right for those items only. The items delivered at MVP launch keep it until they arrive.

Ask a parent or guardian to buy this on their own device.
```

### c.6 Copy-lint result

Run 2026-10-21 (after launch finding PUB-07 rewrote c.1 to c.4 against the v10 data: 8 heroes, Rookie/Easy/Normal/Hard
bots, Pudding at 2:30, Sunset 6:00 and Sudden Death 7:45 on Normal and Hard (5:00 and 7:00 on Easy), and one length
phrase, "seven minutes", from the 2,000-seed balance gate median of 7:01) on this file's `copy:game` and `copy:store` blocks (each paragraph one string, linted with
`lintSource` from `tools/copy-lint/lib/lint.mjs`, target `pawlegends`; game blocks as `pawlegends/src/launch-copy.ts`,
store block as `pawlegends/src/money/launch-copy.ts`). A negative control in the same harness (a game string with a
price, "shelter", "tokens" and "wallet") came back with R13, R2, R9 and R10, so the harness does flag bad copy.

```
game: 36 strings, 0 finding(s)
store: 8 strings, 0 finding(s)
copy-lint (pawlegends target, lintSource): 0 finding(s)
```

Re-run after any edit to a copy block: the harness is a 25-line Node script that pulls each
`<!-- copy:game -->` / `<!-- copy:store -->` block out of this file and calls `lintSource(file, src, {facts,
target})` with `TARGETS.find(t => t.name === 'pawlegends')` and `loadFacts(root)`. It is not checked in; adding
Markdown blocks to copy-lint itself is a tools task.
