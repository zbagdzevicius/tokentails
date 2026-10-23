# Pawlegends launch readiness: go/no-go (checked 2026-10-23, launch Thu 2026-11-12)

Branch `feat/pawlegends` (worktree `tokentails-pawlegends`), SIM_VERSION 10 with the v9 verifier kept for 30 days.
`main` was fast-forwarded to `323ab118` and production is live: `GET /pawlegends/sim` reports `simVersion` 10 with
`simVersions` [9, 10], `GET /pawlegends/status` reports `store: false`, and the page is still `noindex` (it stays so
until the trademark search passes, U8). The compact small-phone HUD (U2) is committed on `feat/pawlegends` after
`323ab118` and is not on `main` yet: it ships as a client-only fix (rebuilt bundle, push to `main`). The steps are in
[`LAUNCH.md`](LAUNCH.md) and the plan in [`GAPS.md`](GAPS.md) §3.

## Verdict

**Code: GO.** Every automated gate passes on the branch (table below). **Deploy: done** (`main` at `323ab118`, live).

**Launch: NO-GO until you close the items in "Your items".** The blockers are:

- the Stripe test checkout (G-Pay);
- the real-device gate (G-Dev);
- the legal text on the one thing the game sells (the $5 cat): terms, privacy policy and the EU withdrawal notice;
- the trademark search and the VAT answer.

None of these is code that can be finished here without your decision or your devices. Free channels (email, X,
Reddit, dare links) can go live once G-Pay, G-Dev and the trademark search pass. Paid EU traffic also waits for U4 (U5
is built with default wording in `6c078a31`; your legal OK on it is pending).

## Go/no-go table

| # | Gate | Status | Evidence (2026-10-22 merged branch; rows 3, 4, 7, 8, 9 and 20 re-run 2026-10-23 with the compact HUD) |
|---|---|---|---|
| 1 | Merge and deploy | GO, live | `origin/main` merged on 2026-10-22 (merge commit `1b265eef`), then `main` fast-forwarded to `323ab118` on 2026-10-23. Production: `/pawlegends/sim` reports `simVersion` 10 with [9, 10], `/pawlegends/status` reports `store: false`, the page is `noindex` |
| 2 | Pawlegends `tsc --noEmit` | GO | 0 errors |
| 3 | Pawlegends vitest | GO | 115 files (1 skipped), 1,067 tests: 1,063 passed, 4 skipped, 0 failed |
| 4 | `lint:sim` (integer-only, deterministic sim) | GO | ok, 100 files |
| 5 | `lift -- --check` | GO | 49 lifted and 7 ported files carry a provenance header |
| 6 | `gen:skins:check` | GO | `families.gen.ts` up to date (58 families) |
| 7 | `build` + `budget` | GO | First-load JS 430.4 KB gzip (budget 450), CSS 15.8 KB, total 2.04 MB (budget 10 MB) |
| 8 | Full Playwright (23 specs) | GO | 88 of 88 passed (20 min, 1 worker; 83 of 83 before the compact HUD added `hud-compact.spec.ts`). One desktop timeout in `skins.spec.ts` ("?skins=demo in a match", 90 s wait for the card effect) passed on its one re-run |
| 9 | `determinism` | GO | 100 seeds, 264,666 commands, hash trails identical (record → replay) |
| 10 | Balance, 2,000 seeds | GO | 23 of 23 checks pass, 0 safety ends. Heroes: clem 53.2, bengas 51.2, aviete 53.4, brutus 49.1, cacklejaw 48.4, lambo 49.3, sage 50.5, gabe 50.2. Median length 7:01, p95 7:52. Core kill before Sudden Death 80.7%. Cats 51.3 / dogs 48.7. Tricks 48.8 to 50.9. Level-6 branches: sage 52.5, brutus 47.2 |
| 10a | Map side (watch) | GO, watch | Purrhaven 46.9 / Woof 53.1. Inside the tool's 45 to 55% gate, but 0.1 points outside the 47 to 53% "side" band in GAPS.md §7. The cat/dog species split (51.3 / 48.7) is inside it. No sim change for this: it would need a new SIM_VERSION. Read it again from real matches in week 1 |
| 11 | fun1, fun2, novice, parked | GO | fun1 22/22 (win 99.0%, L2 0:24, L4 1:17, median 5:01). fun2 7/7 (win 80.0%, median 6:40). novice 1/1 (90.5%). parked 2/2 (allies beside the parked player 1.5% of the time; no end within 2:00) |
| 12 | `vendor-sim:check` | GO | Backend copy current: v9 (frozen) and v10 |
| 13 | Backend lint, build | GO | `rtk proxy npm run lint` exit 0; `npm run build` exit 0 |
| 14 | Backend tests | GO | 166 suites: 158 passed, 6 skipped. 2559 tests: 2494 passed, 65 skipped. Two suites (`image.controller`, `crypto-checkout.service`) do not start without `OPENAI_API_KEY` in the shell; they are not Pawlegends. Re-run with dummy `OPENAI_API_KEY` and `INVALIDATE_CACHE_SECRET`: 2 suites, 61 tests passed |
| 15 | Client `tsc --noEmit` | GO | 0 errors (after `npm ci` in the worktree: main added `markdown-it` and `yaml`) |
| 16 | Client ESLint, files changed on the branch | GO | 51 files, 0 errors, 0 warnings |
| 17 | Client jest | GO | 243 suites, 3,743 tests, all passed |
| 18 | `scripts/sync-contracts.mjs --check` | GO | Generated contracts are up to date |
| 19 | copy-lint (`--target pawlegends,client,backend`) | GO for this branch | 2 findings, both in files only main changed: `GameSelectModal.tsx:32` (the Swordcat line "Every cat you save is a real Pink Paw cat", R2) and `pages/shelter-payouts.tsx:32` ("on-chain" in an app build, R10). They are not fixed here (repo rule: no silent fixes). CI's copy-lint job fails on them until main fixes them. The LAUNCH.md launch copy: 42 strings, 0 findings |
| 20 | Client bundle (`npm run build:client`) | GO | `client/public/pawlegends-game` rebuilt with the compact HUD (`index-BEk-mNBY.js`, CSS `index-BIboNf3k.css`). Three releases are kept for open tabs (`build-releases.json`) |
| 21 | Docs | GO | LAUNCH.md §a.3, §a.5, §a.7, §b and §c rewritten for the game as it is: no store, one $5 cat from the Meet card, pings, level-6 branches. README "Stripe test mode" table now lists the cat run |
| 22 | **G-Pay**: Stripe test checkout through `open-cat` | **NO-GO** (yours) | Never run against Stripe. Steps: LAUNCH.md §a.3 (one $5 cat from the Meet card, one restore on a second profile). Results go in the README table |
| 23 | **G-Dev**: iPhone 11, Pixel 6a, Iris Xe | **NO-GO** (yours, due Tue Nov 10) | Not run. Every number so far came from the M3 Pro GPU with only the CPU throttled. Steps: LAUNCH.md §a.4 (`?quality=low&perf=1`). The README "Device performance results" table is empty |
| 24 | Legal: privacy and terms for the cat sale | **NO-GO** (yours) | U4 below. U5 is built (`6c078a31`) with default wording (your legal OK pending) |
| 25 | Trademark search (a.1) | **NO-GO** (yours, by Nov 9) | Table in LAUNCH.md §a.1 is empty. The page stays `noindex` until it passes |
| 26 | VAT answer (a.2) | **NO-GO** (yours, by Nov 9) | "VAT answer: (pending)" |
| 27 | 10-person playtest (a.5) | Open (Nov 10) | New script and survey in LAUNCH.md §a.5 |
| 28 | Analytics reach PostHog | Open (check on deploy day) | The embedded route relays game events through the host (PUB-02); it needs `NEXT_PUBLIC_POSTHOG_KEY` on Vercel. See U1 |

## Your items

Each item gives its status and the smallest step that closes it. Where your list had the same item twice, it is
merged into one.

| # | Item | Status | To close it |
|---|---|---|---|
| U1 | **Game analytics key.** The committed build was made without `VITE_PAWLEGENDS_POSTHOG_KEY` (and without `VITE_PAWLEGENDS_BUILD`, so the bridge reports version `dev`). The a.6 build step did not say to set them. The b.1 gate and kill metrics, and the a.8 step-4 launch-day checks, need `match_end`, `title_view`, `second_match`, `item_seen_in_match` and `perf_sample` | Partly fixed. On `/pawlegends` (where all traffic lands) the game sends no PostHog call of its own. It relays every event to the host, which sends it with the site key `NEXT_PUBLIC_POSTHOG_KEY` (the relay is in this build: `offer_shown` and `analytics` are in `index-DsmR0zfv.js`). Only the bare standalone URL sends nothing. LAUNCH.md a.6 now shows the key in the build command | 1) Confirm `NEXT_PUBLIC_POSTHOG_KEY` is set on Vercel Production. 2) Optional, standalone only: deploy step 0 below. 3) On deploy day, the a.6 check: one match in a private window shows `title_view`, `match_start` and `match_end` with `embed = true` within a minute |
| U2 | **HUD on a 667×375 landscape phone** (iPhone SE/8 class). The self panel overlapped the pause button and your team's score, two of the three enemy portraits hid under the minimap (one of three at 740×360), and a full four-line kill feed on touch ran into the right-hand ability buttons | **Closed** (decision G22: compact HUD). `pawlegends/src/ui/ui.css`, block "U2 (G22) compact HUD": touch only, below 700 px wide or ≤ 380 px tall under 844 px (667×375, 640×360, 740×360). The self panel is 148×44 instead of 222×58, the pause is a 44 px button left of a narrower score bar, the enemy portraits sit under the score (each a 44 px tap area), the goal chip, tip, banners and alert start under them, the kill feed shows its two newest lines on one line each, the Wave emote is 44 px tall, and the talent card docks left of R and Nap. 844×390 and up, and desktop, are unchanged (the e2e pins the 844×390 boxes) | Check it on the real phone during G-Dev. E2e: `pawlegends/tests/e2e/hud-compact.spec.ts` (667×375 and 640×360: no overlaps in the top band, feed, talent card or buttons; taps ≥ 44 px; the joystick walks; every ping slice on screen). Screenshots land in `pawlegends/test-results/hud-compact/` |
| U3 | **Device gate (G-Dev)**: iPhone 11, Pixel 6a, Iris Xe. LAUNCH.md section a, row 4, due Tue Nov 10 | Open | LAUNCH.md §a.4. Pass: phones p95 ≤ 33 ms, draw calls ≤ 90, heap ≤ 150 MB; Iris Xe p95 ≤ 16.7 ms. Fill the README table |
| U4 | **Privacy policy.** The only policy (docs.tokentails.com, last updated 2025-01-01) says Token Tails does not knowingly collect data from anyone under 18. It does not mention PostHog, Stripe, match data or restore emails. Pawlegends asks every buyer's age band and stores it on the server with a device id and the account (under 16 included, to lock the device), and sells to 16 and 17 year olds (€30 cap) | Partly fixed: the in-game Settings panel and `/pawlegends/terms` now link the policy. The policy text is still wrong, and the `/pawlegends` page and the cat sheet link nothing | Legal call (yours): update the policy (minors 16 and 17, the age band and device id, PostHog, Stripe, match saves, restore and notify emails), or stop sales to 16 and 17 year olds. Then link it from the cat sheet next to the payment form, and from the `/pawlegends` page |
| U5 | **Terms and EU withdrawal on the $5 cat.** The cat sheet ("Meet <cat>") now shows links to `/pawlegends/terms` and the privacy policy, the EU withdrawal notice (digital content, delivered right away, the 14-day right ends on delivery) and a required consent box; the checkout (`<Payment>`) mounts only while it is ticked. The tick sends `consentVersion` `2026-10-23`; both checkouts refuse any other version from the game (`PawlegendsCheckoutGuard`, 400 `PAWLEGENDS_INVALID`) and record the accepted version and time (Stripe intent metadata `consent_version`, `consent_at`; crypto order `consent`). `/pawlegends/terms` is rewritten for the cat (no retired packs); the legacy `pl_*` checkout keeps its 2026-10-17 terms version | **Built (`6c078a31`), default wording, founder legal OK pending** | Read the wording on the cat sheet and `/pawlegends/terms` (`client/pages/pawlegends/terms.tsx`). A change to the text needs a new version in `client/components/pawlegends/checkout.ts` and `backend/src/pawlegends/pawlegends.contracts.ts`. Host tests: `client/__test__/pawlegends/cat-sheet.test.tsx`, `pawlegends-host.test.tsx`. Paid EU traffic still waits for U4 |
| U6 | **Stripe test mode (G-Pay)** and the README table. Nothing has run against real Stripe test mode. The README listed the 8 retired `pl_*` runs | README table rewritten for the new run. The run itself is open | LAUNCH.md §a.3: one $5 cat from the Meet card with `4242…`, one restore on a second profile, the under-16 block. Record the `pi_…` ids in the README |
| U7 | **VAT answer** (LAUNCH.md §a.2: "(pending)") and steps 2 and 3 of the founder checklist (by Nov 9) | Open | Ask the accountant; write the answer and date into §a.2. If the answer is Stripe Tax, that is a code change on the shared checkout, not an env var |
| U8 | **Trademark search** (a.1) | Open | Fill the §a.1 table by Nov 9. Only then remove `noindex` (a.8 step 1) |

## Deploy commands, in order (backend first, then the page)

Deployed on 2026-10-23 (`main` at `323ab118`; the step 5 sim and status checks answer as expected). Kept as the
order for a backend or sim fix.

One push to `main` redeploys Vercel (client) and DigitalOcean (backend) at the same time. The page therefore stays
closed until the backend serves the v10 sim and the `/pawlegends/*` routes. Run from the repo root of the worktree.

```bash
# 0. Optional, for the standalone URL only: rebuild the game with the public PostHog project key and a build label.
cd pawlegends
VITE_PAWLEGENDS_POSTHOG_KEY=phc_… VITE_PAWLEGENDS_BUILD=$(git rev-parse --short HEAD) npm run build:client
cd .. && git add client/public/pawlegends-game \
  && git commit -m "build(pawlegends): client bundle with the standalone PostHog key"
grep -l 'phc_' client/public/pawlegends-game/build/index-*.js   # prints the bundle

# 1. If main moved since 2026-10-22: merge it again and re-run the client checks.
git fetch origin && git merge origin/main
(cd client && npm install && npx tsc --noEmit && npm test)

# 2. Close the page on Vercel before the merge (the build that the merge starts inlines it).
cd client && vercel env add NEXT_PUBLIC_PAWLEGENDS production   # value: 0
cd ..

# 3. Push the branch, open the PR, wait for CI.
git push -u origin feat/pawlegends
gh pr create --base main --head feat/pawlegends --title "feat(pawlegends): Phase 1 launch" --body-file <notes.md>
gh pr checks --watch        # copy-lint fails on main's 2 findings (gate 19) until main fixes them

# 4. Merge. This deploys the backend (DigitalOcean) and a closed page (Vercel).
gh pr merge --merge

# 5. Wait for the backend deploy, then check it (all three must pass; otherwise fix forward and repeat 5).
curl -s https://api.tokentails.com/pawlegends/sim | jq '{simVersion, simVersions, placeholder}'
#   expect {"simVersion": 10, "simVersions": [9, 10], "placeholder": false}
(cd pawlegends && npm run vendor-sim:check-remote -- https://api.tokentails.com)
curl -s -o /dev/null -w '%{http_code}\n' https://api.tokentails.com/pawlegends/status   # 200, not 404

# 6. Open the page: unset the kill switch and redeploy (NEXT_PUBLIC_* values are inlined at build).
cd client && vercel env rm NEXT_PUBLIC_PAWLEGENDS production && vercel --prod && cd ..

# 7. Smoke test: one signed-in match on https://tokentails.com/pawlegends (results chip "Saved to your account"),
#    one match in a private window, then PostHog Activity: title_view, match_start, match_end with embed = true.
```

Launch day (Thu Nov 12), after a.1 passed: one commit removes `noindex` and the sitemap exclude (LAUNCH.md a.8 step 1
has the diff and the two tests to flip). Then `git push origin main`. The posts go out at 16:00 UTC (18:00 Vilnius).

## Env names

Names only; values stay in Vercel, DigitalOcean and your local env files.

| Where | Name | Needed value |
|---|---|---|
| Vercel Production | `NEXT_PUBLIC_PAWLEGENDS` | `0` from step 2 to step 6, then unset (unset = on) |
| Vercel Production | `NEXT_PUBLIC_PAWLEGENDS_PICKER` | unset (kill switch for the picker card only) |
| Vercel Production | `NEXT_PUBLIC_POSTHOG_KEY` | set (every b.1 metric depends on it) |
| Vercel Production | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_BE_URL` | already set for the shelter-cat checkout |
| Your machine, at `build:client` | `VITE_PAWLEGENDS_POSTHOG_KEY`, `VITE_PAWLEGENDS_BUILD` | optional (standalone URL and the build label) |
| Backend | `STRIPE_SECRET_KEY` | already set (the $5 cat uses the shared Token Tails checkout) |
| Backend | `SENDGRID_API_KEY` | already set (notify-me; without it the button hides) |
| Backend | `INVALIDATE_CACHE_SECRET` or `PAWLEGENDS_ENTITLEMENT_SECRET` | one of them set (entitlement routes; else 503) |
| Backend | `PAWLEGENDS_STRIPE_WEBHOOK_SECRET`, `PAWLEGENDS_STRIPE_SECRET_KEY` | leave unset: they belong to the retired `pl_*` store (`store: false` only hides it) |
| Backend | `PAWLEGENDS_PUBLIC_URL`, `PAWLEGENDS_DEV_LINKS` | unset in production |
| Local G-Pay run | `STRIPE_SECRET_KEY` (test), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test), `NEXT_PUBLIC_BE_URL=http://localhost:3005` | LAUNCH.md §a.3 |

## Fix forward (no rollback)

Never revert. When production breaks, fix it on a branch, run the LAUNCH.md a.6 checks and push to `main`.

- **Triggers (any one):**
  - the page or the cat checkout errors;
  - `vendor-sim:check-remote` fails;
  - the PostHog alert "Pawlegends rejected or failed saves" fires (over 5% in an hour);
  - a run of `pawlegends save rejected` lines with `PAWLEGENDS_OUTCOME_MISMATCH`, a hash mismatch or
    `PAWLEGENDS_SIM_VERSION` (sim drift: every save from that build is lost until the fix is live);
  - a run of `pawlegends_worker` crashes after a deploy.
- **While the fix is on its way:** set `NEXT_PUBLIC_PAWLEGENDS=0` on Vercel and redeploy. That is the one kill switch.
  It sends players to `/game` and hides the picker card. It is also the only way to stop the game's cat offers, since
  the $5 checkout is shared with the rest of Token Tails.
- **Backend or sim fix:** use the launch order. Keep the page closed, wait for the backend, pass step 5, then unset the
  flag and redeploy Vercel (step 6). A sim change means a new SIM_VERSION, with the old one kept in the verifier.
- **Client-only fix** (HUD, copy, cat sheet): rebuild with `npm run build:client` if the game changed, commit, push to
  `main`. The page stays open. Old tabs keep loading their own build, since three releases are kept.

## Launch-day monitoring (Thu Nov 12 and Fri morning)

- **Before 16:00 UTC:** the PostHog alert "Pawlegends rejected or failed saves" and the "Pawlegends crashes" insight
  exist (LAUNCH.md a.8 step 4 has both recipes).
- **20:00 UTC and Fri morning, PostHog:**
  - `match_end` from human sessions (`embed = true`);
  - `title_view` → `match_end` for first sessions;
  - `perf_sample` p95 by tier;
  - `app_error` with `code` starting `pawlegends_`, and `pawlegends_bridge_timeout`;
  - the `pawlegends_save` rejected/failed ratio broken down by `code`;
  - the Meet funnel: `offer_shown` → `pawlegends_meet_open` → `pawlegends_cat_purchase {ok: true}`.
- **Backend (DigitalOcean runtime logs):** `PawlegendsLive` lines `pawlegends save rejected: code=… simVersion=…`. A 429
  or 503 is load on the replay worker.
- **Stripe Dashboard:** $5 PaymentIntents for the cats; any dispute or refund the same day.
- **Daily in week 1:** comments on the X thread and the Reddit posts, crashes, and the cost per finisher from §b.3.

## Not done here, on purpose

- `main` was fast-forwarded to `323ab118` and deployed on 2026-10-23. The compact HUD commit after it is not pushed.
  Nothing was changed on Stripe.
- U2 (small-phone HUD) is closed with the compact HUD (decision G22, 2026-10-23); the real-phone look is part of G-Dev.
  U5 (cat sheet legal lines) was built in `6c078a31` with default wording; your legal OK on the wording is pending.
- main's 2 copy-lint findings were left for main.
- The client `node_modules` in this worktree is now its own install (`npm ci`) instead of a link to the main
  checkout's, because main added packages the main checkout does not have yet.
