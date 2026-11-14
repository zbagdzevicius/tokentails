# Paw Legends: force update (OTA, app shells, web)

Status: implemented 2026-11-14 (not yet pushed or published). Worktree `tokentails-pawlegends-ota`.

What landed, and where it differs from the design below:

- Backend `GET /pawlegends/client-policy` (`backend/src/pawlegends/client-policy/`), the shared decision
  `shared/client-policy.ts` (synced to backend and pawlegends-web), the `update` block on the `PAWLEGENDS_SIM_VERSION` 400.
- Publish tooling: `policy.json` on publish, promote, rollback and `--write-policy`; `--grace-hours`, `--maintenance`,
  `--compat 1 --www www-bridge` (refuses a game bundle below NATIVE_COMPAT, publishes the bridge once unless `--force`).
  The policy is rewritten only when its content changes. The hourly promote writes the first `policy.json` files after
  the merge, so nothing generated is committed by hand.
- Shell gate (`pawlegends-app/src/shell/{policy,gate}.ts`). **Offline rule (changed):** offline, the game plays with a
  notice whenever the last kept answer still accepts the installed sim and shell, even if a newer bundle is required;
  it blocks only when the backend no longer replays that sim (its matches would not save) or the shell is retired. The
  API answer is preferred: the mirror is asked after 1 s or when the API fails, and the API gets its full 2.5 s.
- Game: `version.json` from the vite build, `src/meta/clientPolicy.ts` (`UpdateWatch`). "On the title" also means no
  overlay over it (Mode Select, a sheet): an e2e caught a reload while Mode Select was open. The card counts 5 s (2 s
  when blocking). A framed game posts `reload-request` and reloads its own frame 2.5 s later if an older host ignores it.
- Web host: `reload-request` remounts the frame with `?v=<sha>`; a `stale` save shows "New version ready · Reload".
- Workflow: compat read from `app-config.mjs` in the summary and purges, `policy.json` purged, inputs `grace_hours`,
  `maintenance` (+ `maintenance_until`) and `bridge` (none, beta, stable) in a separate `policy` job.
- Verified 2026-11-14 by an adversarial pass: `pawlegends-app/tests/update-drill.test.ts` runs the real shell
  modules against a local stand-in for tokentails.com (manifests, bundles and `policy.json` from the real
  `ota-publish.mjs` under a throwaway key), an emulated native updater (the capgo RSA/AES/SHA-256 check) and an API
  stand-in. Scenarios: one bundle behind, up to date (< 1 s), offline accepted and rejected, API down, forged or edited
  `policy.json`, corrupted bundle, tampered manifest, rollback, stale API, a lagging backend, a match started while the
  gate runs, and the bridge against the 1.0.x shell code (`tests/fixtures/manifest-compat1.ts`, frozen from
  `ccd7ca75~1`). Two fixes came out of it: the gate re-checks "on the title" after the policy answer and again before
  it applies (a party invite could pull the player into a pick while it downloaded, and the apply would have reloaded
  that pick); and a client whose sim is NEWER than every sim the answering backend replays (a backend instance behind a
  redeploy) is never sent to update or the store (§3.3), online or offline.
- Not done here: the device drills (§8.3), the first bridge publish (run the workflow with `bridge: beta`).

Founder's ask (verbatim): "ultracode fix OTA, force update and don't allow to start without syncing to latest
version ( e.g. API call / etc ). must be backward compatible in some way"

Other runs in progress (sim v27, coat models, spectating, test cleanup) are handled elsewhere. This plan does not
touch `pawlegends/src/sim/**`.

## 1. What runs today (read end to end)

### 1.1 Native shells and bundles

| Piece | Where | Fact that matters here |
|---|---|---|
| Native binaries | `pawlegends-app/ios`, `android` | iOS/Android 1.0.x are **compat 1**: App, Haptics and `@capgo/capacitor-updater` 7.53.0 only, with no Firebase auth plugin. 1.1.0 (ccd7ca75, Nov 11) is **compat 2**: it adds sign-in. The native side injects `__PL_CHANNEL__` (`stable` for App Store and every Android release, `beta` for TestFlight, `dev` for Debug), `__PL_PLATFORM__` and `__PL_THERMAL__` at document start. |
| `shell.js` | `src/shell/main.ts`, built **into each web bundle** by `scripts/build-web.mjs` | The OTA logic is JavaScript **inside the bundle**, not in the binary. A phone runs the `shell.js` of the bundle it has installed. **A new bundle can therefore change the update policy on every phone that takes it, without a store release.** This is the backward-compatibility lever. |
| Manifest | `updates/<ios|android>/<compat>/manifest(-beta).json` on tokentails.com (`client/public`) | Signed with RSASSA-PKCS1-v1_5/SHA-256 over the canonical JSON (`canonicalManifest`). The bundle zip is AES-encrypted and has an RSA-encrypted checksum that the native updater verifies before it unzips. All bundles live under `updates/ios/<compat>/bundles/`, because `HTTPS_TT` in the first iOS shells accepts only that path. |
| Check | `src/shell/ota.ts` `Ota.check` | Runs once the title is up (`html[data-ready]`) and on each `resume`, throttled to once per 30 min (`CHECK_EVERY_MS`). Order: GET manifest → parse → verify → `decide` (newer seq, or a `rollback`, `minNative`, never a version that already failed) → **download in the background** → store it in `pl.ota.pending`. |
| Apply | `Ota.applyIfSafe` | `CapacitorUpdater.set` (a reload) **only** on the title with no party (`safeToApply`), on the next cold start or on a resume. A phone takes a new bundle **two launches/resumes after publish at best**, and nothing forces it. |
| Rollback | Capgo watchdog | `notifyAppReady()` runs when the title is up. A bundle that does not reach the title within `appReadyTimeout` (30 s) is reverted by Capgo, and `Ota.booted` records it in `pl.ota.failed` so it is never retried. A manual rollback re-points both channels at a kept bundle with `rollback: true` (`ota-publish.mjs --rollback`). |
| Mac | `takesOtaUpdates('mac') === false` | Never downloads (guideline 2.4.5). It runs only the bundle in its build. |

### 1.2 Publish and promote (`scripts/ota-publish.mjs`, `.github/workflows/pawlegends-ota.yml`)

Every push to main that touches the game or the shell builds `www/`, passes the gate `vendor-sim:check-remote` (the
backend serves this exact sim), signs, publishes **beta**, and commits to main. Every hour a job promotes to **stable**:
the newest kept bundle that is ≥ 6 h old, or one ≥ 2 h old when stable has fallen 6 h behind (f30a43a2, 75952c7d).
Bundles younger than 12 h are never pruned.

Live state on 2026-11-14:

| File | Version | sim |
|---|---|---|
| ios/2 stable, android/2 stable | 20261114000348-d4e754c | 26 |
| ios/2 beta, android/2 beta | 20261114031325-9c5c82e | 27 |
| ios/1 stable | 20261110123949-cfc4fb7 | 19 |
| ios/1 beta, android/1 beta | 20261111112457-ef22d35 | 19 |
| **android/1 stable** | **missing** | – |

### 1.3 Game, web host, backend

- **Game (`pawlegends/`).** `__PL_BUILD__` (version, sha, builtAt) and `SIM_VERSION` are baked in, and the watermark
  shows them (`src/ui/versionMark.ts`). `html[data-screen]` holds the current screen (`app.ts setScreen`). The only
  call to the server is `pvpCapability.ts`, which GETs `/pawlegends/sim` once per page to decide whether to show the PvP
  chip. The game never asks whether it is outdated.
- **Web `/play` (`pawlegends-web/pages/play.tsx`, `PawlegendsHost.tsx`).** The game loads in a same-origin iframe
  `/pawlegends-game/index.html?embed=1`. `index.html` revalidates (Cloudflare 60 s). Hashed `build/**` assets are
  immutable, and the last 3 releases are kept (`build-releases.json`). **An open tab never refreshes.** The frame
  reloads only when the player presses the bridge-timeout Reload button. A player who keeps the tab open runs the
  old build for days.
- **Saves.** `POST /user/catbassadors/live` is the one write path. A `simVersion` outside `SIM_VERSIONS` (10…27 today)
  returns `400 PAWLEGENDS_SIM_VERSION` with `sim: {simVersion, bundleSha256, simVersions}`. The host (`saves.ts`)
  classifies it as `stale`, **purges** those queued matches and sends `save-result {status:'rejected', code}`. The
  game shows only a rejected chip. Nothing tells the player to update.
- **Party relay and matchmaking.** An old proto or sim gets `error update_required` (`party-relay.ts`, `mm-bridge.ts`).
  In the app, the party UI's `reload` calls `location.reload()`, which reloads **the same bundle**.

### 1.4 Defects found on the way (fix in this work)

1. `android/1/manifest.json` (stable) never existed. Android 1.0.x release installs read stable only, so they **never
   got any OTA**. Google Play is not public yet, so this affects only internal testers.
2. `pawlegends-ota.yml` hard-codes compat `1` in the step summary and in **both Cloudflare purge steps**
   (`updates/$p/1/manifest*.json`). Since compat 2 the live manifests are never purged. Apps therefore see a release
   up to 30 s + 60 s SWR late, and the summary shows the dead compat-1 beta.
3. `docs/plans/moba/APP-STORE.md` "OTA flow" is stale: 10 s timeout (it is now 30 s), `ios/<compat>/` without
   `updates/`, `next()`, and `CAPGO_PRIVATE_KEY` (it is now `OTA_PRIVATE_KEY`). Rewrite it to point here.
4. Nothing anywhere forces a version. Any update is opportunistic, and old tabs and phones play on until a save is
   rejected.

## 2. Principles

1. **The API decides *whether*. The signed manifest decides *what*.** The policy API (TLS, no signature) can only
   answer `ok`, `update`, `store` or `maintenance`. Every byte that gets installed still comes from a manifest signed
   with the OTA key and a zip the updater verifies natively. A spoofed or buggy policy can at worst delay play, and it
   can never install anything.
2. **Fail open on our bugs, fail closed only on an answer.** An exception in the gate, a malformed policy or an
   unknown action lets the game start. The gate blocks only when a parsed policy (API, or the signed static mirror,
   or the cached copy of one of them) says the installed bundle is not allowed.
3. **Never mid-match.** Checks happen at boot, on resume while on the title, and when the game returns to the title.
   A result that arrives during a match waits for the title.
4. **Never brick a phone.** Being offline or the API being down leads to a clear retry screen, or to play with a
   notice when the installed bundle is still accepted. There is no crash loop: a target version that failed to boot is
   never retried automatically, and the Capgo watchdog stays armed.
5. **Everything stays rollback-able.** A rollback manifest is itself a required update, so gated phones move *to*
   it. Every retry on a blocking screen also re-reads the manifest, so publishing a fix unsticks any phone stuck there.
6. No feature flags. `required` is a property of a release (with a grace period), not a switch.

## 3. Server policy

### 3.1 Static signed mirror (works when the API is down)

`ota-publish.mjs` writes one file per platform and compat next to the manifests:

`client/public/pawlegends-app/updates/<ios|android>/<compat>/policy.json`

```jsonc
{
  "schema": 1, "kind": "policy", "platform": "ios", "compat": 2,
  "minCompat": 2,                    // shells below this: action "store"
  "minSim": 26,                      // floor for every channel (see 3.3); never below min(backend SIM_VERSIONS)
  "channels": {
    "stable": { "version": "20261114000348-d4e754c", "seq": 20261114000348, "simVersion": 26,
                "minNative": "1.0.0", "rollback": false, "requiredFrom": "2026-11-14T06:20:00Z" },
    "beta":   { "version": "20261114031325-9c5c82e", "seq": 20261114031325, "simVersion": 27,
                "minNative": "1.0.0", "rollback": false, "requiredFrom": "2026-11-14T03:14:00Z" }
  },
  "store": "https://apps.apple.com/app/id6832032981",
  "web": "https://pawlegends.app/play",
  "maintenance": null,               // or { "message": "...", "until": "2026-…Z" }
  "issuedAt": "2026-11-14T06:20:00Z",
  "signature": "…"                   // same key and canonical rule as the manifests
}
```

- It is rewritten on publish (beta entry), promote (stable entry) and rollback (both entries, `rollback: true`). Each
  entry mirrors its manifest exactly, so the two cannot disagree. The shell also cross-checks: a policy that names a
  version its manifest does not name is ignored for the `what`.
- `requiredFrom` = the moment the entry went live + the release's grace (default **0 h**: stable has already soaked
  6 h on beta). A release with a new sim is always required at once, and its grace is ignored.
- Headers (`client/next.config.js`): the same as the manifests (`max-age=0, must-revalidate`, Cloudflare 30 s), and
  the deploy purges it like the manifests do.

### 3.2 API: `GET /pawlegends/client-policy`

Query: `platform=ios|android|mac|web&compat=<n>&channel=stable|beta|dev&bundle=<version>&seq=<n>&sim=<n>&native=<x.y.z>`.
Every parameter is optional. Older clients send nothing, and the endpoint still answers `ok`.

```jsonc
{
  "schema": 1,
  "action": "ok" | "update" | "store" | "maintenance",
  "reason": "current" | "older-bundle" | "sim-too-old" | "sim-not-accepted" | "compat-retired" | "native-too-old" | "rollback" | "maintenance",
  "latest": { "version": "...", "seq": 0, "simVersion": 27, "minNative": "1.0.0" } | null,
  "minSim": 26, "acceptedSims": [10, …, 27], "liveSim": 27,
  "store": "https://…", "web": "https://pawlegends.app/play",
  "maintenance": null, "retryAfterSec": 60, "checkedAt": "…"
}
```

- Source: the backend fetches `policy.json` from tokentails.com for each platform and compat it is asked about. Its
  in-memory cache lasts 60 s and serves the stale copy for up to 24 h when a fetch fails. It verifies the signature
  with a copy of `ota/public-key.pem`, and a bad signature counts as a failed fetch. It merges in its own
  `SIM_VERSIONS`: the effective `minSim` = max(policy.minSim, min(SIM_VERSIONS)), and a `sim` outside `SIM_VERSIONS`
  is always `update` (or `store`). Coupling to the repo is limited to the one public key, and the backend does not
  need a redeploy for each OTA.
- `platform=web`: `latest` comes from `https://pawlegends.app/pawlegends-game/version.json` (new, §5.1), cached the
  same way.
- `platform=mac`: no OTA, so a mac answer is only ever `ok`, `store` (sim not accepted) or `maintenance`.
- Cost: no database and no auth, a pure function over cached data. `Cache-Control: public, max-age=60,
  stale-if-error=86400`. The per-IP throttle is `clientPolicy: { limit: 120, ttl: MINUTE }` on the existing
  `ClientIpThrottlerGuard`. When throttled (429), the client uses its fallback chain, and nothing blocks.
- With no policy file reachable and no cache, the decision rests on sims alone: `ok` if `sim ∈ SIM_VERSIONS`.

### 3.3 The decision (one pure function, shared)

`decidePolicy(policy, client, now)` in `shared-contracts/client-policy.ts`. The backend and the web copies are kept in
sync like the other shared contracts, and the shell imports the web copy through `@/`.

1. `maintenance` set and `now < until` → `maintenance`.
2. `compat < minCompat` → `store` (`compat-retired`).
3. `sim` known and `sim < minSim` (or not in `acceptedSims`) → `update` if the channel's latest has
   `simVersion ≥ minSim` and `native ≥ latest.minNative`, else `store`. A sim newer than every accepted one is the
   backend lagging (an instance behind a redeploy), not the client: no action from this rule.
4. The channel's latest is newer (`latest.seq > seq`), or it is a `rollback` with `latest.version ≠ bundle`, and
   `now ≥ requiredFrom` → `update` (or `store` when `native < latest.minNative`).
5. Otherwise → `ok` (with `latest`, so a newer, not yet required bundle still downloads in the background).

How `minSim` is set: `ota-publish` writes `minSim` = the lowest `simVersion` among the live channels' bundles of that
platform and compat. A promote of a sim-27 bundle to stable makes `minSim` 27, so every stable phone on sim 26 is
`update` at once. A beta-only sim 27 leaves stable phones alone. Never below `min(SIM_VERSIONS)`, so queued offline
matches of an accepted sim still save.

## 4. Native shell (compat 2+): the update gate

All of it ships **in `shell.js`**, so every compat-2 phone gets it with its next OTA bundle and no store release.

### 4.1 Flow

1. `shell.js` (classic script in `<head>`) creates `#pl-gate` on `DOMContentLoaded`. It is a full-screen layer above
   the game, in the splash colour `#2b1d2e`, with the brand logo. It is transparent for the first 600 ms but already
   **swallows input** (`pointer-events: all`, `inert` on the game root once it exists). The game keeps booting behind
   it, so the title, `html[data-ready]` and `notifyAppReady()` happen as they do today and the watchdog is never
   tripped by the gate.
2. In parallel with the game's boot it gets the policy through a hedged chain: API (2.5 s timeout); the static
   `policy.json` starts after 1 s, or at once if the API fails; the first valid answer wins. It also fetches the
   manifest (already the existing code). All requests go through native HTTP (`CapacitorHttp`): no CORS, no cookies,
   no device id.
3. It decides:
   - `ok` → removes the gate and keeps the existing background download for an optional newer bundle.
   - `update` → the gate shows **"Updating Paw Legends"** with a progress bar driven by
     `CapacitorUpdater.addListener('download', {percent})`, then `ota.check(force=true)` downloads the manifest's
     bundle. The manifest version must be ≥ the policy's `latest.seq`, or equal to it when it is a rollback. It waits
     for the title (`whenReady`, ≤ 30 s), runs `ota.booted()` and then the new `ota.applyNow()`, which is `set()`
     without the party check: nothing is playable behind the gate. The gate text becomes "Starting…" and the
     WebView reloads into the new bundle.
   - `store` → **"A new Paw Legends is on the App Store / Google Play"** with the store button, plus "Play in your
     browser" (pawlegends.app/play, opened externally).
   - `maintenance` → "Back soon" with the message, a retry and a countdown.
   - No answer from API, mirror or manifest (offline): it uses the last good policy cached in `pl.policy.last` (signed
     mirror or API body, ≤ 7 days). If that policy, evaluated **now**, says `ok`, or if there is no cached policy at
     all (first launch offline), the game starts with a small chip: "Offline · playing <short version>. Matches save
     when you're back online." Otherwise a **retry screen**: "Paw Legends needs the latest version to play online. Can't
     reach the update server." It has a Try again button and retries automatically with backoff (2, 4, 8, 16, 30, 60 s)
     and on the `online` event.
4. **Every retry re-runs the whole chain, including the manifest.** A published rollback or fix therefore unsticks
   any phone sitting on a blocking screen.

### 4.2 Re-checks

- On `resume`: only when `data-screen === 'title'` and no party (`safeToApply`), throttled to once per 5 min.
  Otherwise it is queued.
- When the game returns to the title: a `MutationObserver` on `html[data-screen]` (the shell already watches
  `data-ready`). **No game change is needed for this.**
- When the game raises `pl:update-required` (a save or the relay was refused, §5.3): forced, no throttle, run on the
  next title.

### 4.3 No loops, no bricks

- A target version in `pl.ota.failed` (it failed to boot here) is never downloaded again automatically. The gate then
  falls back to the offline rule: play with "Couldn't update, playing <version>" if the installed bundle is still
  accepted, else a "Couldn't update" screen with the store link and a **manual** Try again. The manual retry clears that
  one version from `failed` once per day.
- `pl.gate.attempts` counts download or apply failures per target. After 3 within 10 min the gate behaves as above
  instead of spinning.
- Any exception inside the gate removes the gate and logs `[gate] failed open` (fail open, principle 2).
- "On the title" is checked when a run starts, again when the policy answers, and again right before `applyNow`: a
  game that left the title meanwhile (an invite needs no tap) gets no screen and no reload; the check is owed.
- `channel === 'dev'` uses the local server like today. The Mac shows only `store` and `maintenance` screens.

### 4.4 Launch-time budget

With fast answers the gate is invisible: the game's own boot (2–5 s) is longer than the hedged fetch. Worst case on a
dead network is about 3.5 s of "Checking for updates…" before the offline rule decides.

## 5. The game itself (web and app)

### 5.1 Web `/play`: open tabs refresh on the title

- The game's vite build writes `dist/version.json` = `{sha, builtAt, simVersion}`, published as
  `/pawlegends-game/version.json` with `max-age=0, must-revalidate` (Cloudflare 60 s, the same rule as `index.html`).
- `pawlegends/src/meta/clientPolicy.ts` (new; no app-only code) runs at boot, on each return to the title, on
  `visibilitychange → visible`, and every 10 min while on the title. It GETs `version.json` (`cache: 'no-store'`) and
  `/pawlegends/client-policy?platform=web&sim=…&bundle=<sha>`.
  - Outdated `sha` or `action: update`, while on the title with no party → **reload to the latest build**. Embedded,
    the game sends a new game message `reload-request {reason}` and the host remounts the frame (`setFrameKey`) with
    `?v=<newSha>`. Standalone, it calls `location.reload()`. A 10 s "Updating Paw Legends…" card shows first, so the
    reload is never a surprise.
  - Outdated during a pick, a match or results → nothing until the title.
  - Not on `acceptedSims` → the next title shows a **blocking** "New version, reloading" card (no Play button) and
    reloads.
  - Offline or API down → nothing (the web build is always the one the server just sent).
- `PawlegendsHost.tsx` handles `reload-request`. It also adds a host-side fallback for **older game builds** that never
  send it: when `saves.ts` classifies a save as `stale`, the host shows a "New version ready · Reload" bar. Reload is
  the player's action, because the host cannot see the old game's screen.

### 5.2 App: the game asks the shell

The app build runs the same `clientPolicy.ts`, but inside the shell it only dispatches `pl:update-required` (or
`pl:update-check`) and lets the shell's gate (§4) do the work. A `location.reload()` in the app would reload the same
bundle. In the party client, the `reload` action on `update_required` dispatches `pl:update-required` before reloading,
so the gate catches the reload.

### 5.3 Backend structured rejection, client update screen

- `pawlegendsError` for `PAWLEGENDS_SIM_VERSION` additionally carries `update: { action: 'update', minSim, liveSim,
  web: 'https://pawlegends.app/play' }` (additive: old hosts ignore it). The same applies to the party ticket and the
  relay `update_required` (already structured).
- Host (`saves.ts`): the `stale` outcome keeps purging only matches whose sim the backend no longer accepts (behaviour
  unchanged). `save-result` already carries `code`.
- Game: `save-result {status:'rejected', code:'PAWLEGENDS_SIM_VERSION'}` → the results chip reads "Update needed to
  save matches", and the game raises `pl:update-required` (app) or marks the session outdated (web: reload on the
  next title, §5.1). The rejection is no longer silent.

## 6. Backward compatibility

| Client generation | How it is reached | What the player sees |
|---|---|---|
| **compat 1** (iOS/Android 1.0.x, before Nov 10–11), any bundle | A final signed compat-1 **bridge bundle** in `updates/{ios,android}/1/manifest(-beta).json` (§6.1). Every compat-1 `shell.js` ever shipped reads exactly these paths, needs `platform` = its own, `compat: 1`, and a zip under `updates/ios/1/bundles/` (checked against b5500906, 6548684d and 9eae7e8f). | The bridge downloads in the background and applies on the next launch or title resume: the friendly **"Update Paw Legends"** screen. |
| compat 2, any bundle before this change | The next OTA brings the new `shell.js` through the old, non-blocking flow (download, then apply on the next launch or title resume). From then on the phone is gated. | One hop with the old behaviour, then forced updates. The server backstop covers the hop: the relay says `update_required`, `/live` rejects with the structured 400. |
| compat 2 with the gate | §4. | Blocking update with progress. |
| Mac | Only a new Mac build carries the gate. Until then: the server backstop and the store link through the relay message. | – |
| Web tab with an old game in a new host | Host fallback bar on a `stale` save. | "New version ready · Reload". |
| Web tab with an old game in an old host | Nothing client-side can reach it. The backstop is the server rejection (sim outside `SIM_VERSIONS`), and the tab refreshes once the player reloads it. | Rejected chip, as today. |
| Future compat 3 | `minCompat` in the compat-2 `policy.json` moves to 3, and gated compat-2 shells show `store`. No bridge is needed again. | Store screen. |

### 6.1 The compat-1 bridge bundle

What compat 1 required (from git, ccd7ca75~1 = 80692c00): a `www/` with `index.html` loading `./shell.js`, and a
`bundle.json` stamp with `compat: 1`. The native plugins available are `@capacitor/app` 7, `@capacitor/haptics` 7,
`@capgo/capacitor-updater` 7.53.0 and core `CapacitorHttp` (plus the Android `ShellPlugin` for the channel and the
platform). **There is no `FirebaseAuthentication`**, so the bridge must not load `host.js` or anything Firebase.

- `pawlegends-app/bridge/index.html`: static, inline CSS, brand logo PNG, no game module, under 300 KB. It sets
  `html[data-ready]=1` and `html[data-screen]=title` at once, so the old watchdog `notifyAppReady()` fires and later
  updates (a rollback of the bridge) still apply on the title.
  - Title: "Update Paw Legends". Body: "This version can't play any more. Get the new Paw Legends with accounts,
    PvP and the latest champions."
  - Button by platform (`__PL_PLATFORM__`, else `Capacitor.getPlatform()`):
    - iOS: `itms-apps://apps.apple.com/app/id6832032981`, with `https://apps.apple.com/app/id6832032981` as fallback.
    - Android: `market://details?id=com.tokentails.pawlegends`, with
      `https://play.google.com/store/apps/details?id=com.tokentails.pawlegends` as fallback.
  - Secondary: "Play in your browser", `https://pawlegends.app/play`.
  - Capacitor 7 opens navigations to another host or scheme in the system (iOS `WebViewDelegationHandler` →
    `UIApplication.open`, Android `BridgeWebViewClient` → `ACTION_VIEW`). Verify in the drill (§8.3).
- `shell.js`: built from the current `src/shell/main.ts` with a compat-1 stamp (`build-web.mjs --bridge --compat 1`).
  It keeps the OTA, haptics and Android back handling, so the bridge itself can be rolled back or replaced. Its OTA
  module uses only updater calls that 7.53.0 has. It installs no host channel and loads no `host.js`.
- Stamp: `{compat: 1, simVersion: 0, seq: <UTC now>}` (seq is newer than ef22d35). `simVersion: 0` marks "no game"
  (old parsers accept any integer). `--check-sim` is skipped for the bridge.
- Publish: `ota-publish.mjs --compat 1 --www www-bridge` writes `ios/1/bundles/<v>.zip` and the manifests for **ios/1
  and android/1, beta and stable**. That includes the missing `android/1/manifest.json`. Beta first, then stable after
  a device check. It never touches compat 2.
- Store IDs in the repo: App Store id **6832032981** (`pawlegends-web/components/pawlegends/landing/markup.ts`
  `PAWLEGENDS_APP_STORE_ID`), Android/iOS bundle id **com.tokentails.pawlegends** (`app-config.mjs APP_ID`, fastlane
  `Appfile`). The landing test notes Google Play is not live yet: the Play link reaches only testers until production
  release. That is acceptable, because compat-1 Android installs exist only on testing tracks.

## 7. OTA publish and promote changes

- `scripts/lib/app-config.mjs`: `MIN_COMPAT = 2`, `REQUIRED_GRACE_HOURS = 0`, `STORE_URLS = {ios, android, mac}`,
  `WEB_PLAY_URL`, `POLICY_FILE = 'policy.json'`.
- `scripts/ota-publish.mjs`:
  - `writePolicy(platform)` after every publish, promote and rollback. It signs, sets `minSim` (§3.3), `minCompat`,
    `store`, and `requiredFrom` = live time + grace.
  - `--grace-hours <n>` (a per-release attribute, stored in the bundle record): the only way to make a release
    "optional for n hours", for example a large art-only drop. A new sim always means 0.
  - `--compat <n>` and `OTA_WWW_DIR`/`--www <dir>` for the bridge. They refuse `--compat` above `NATIVE_COMPAT`, and a
    `--compat` below it is allowed only for a `www` whose stamp says `simVersion: 0` (bridge-only).
  - `--maintenance "<message>" --until <iso>` and `--maintenance off` rewrite and re-sign the policy only.
  - Prune: never removes a bundle the policy names (the same set as the manifests).
- `scripts/build-web.mjs`: `--bridge --compat 1` builds `www-bridge/` (bridge `index.html` + `shell.js` + `bundle.json`)
  without the game or `host.js`.
- `.github/workflows/pawlegends-ota.yml`:
  - Read the compat from `app-config.mjs` in the summary and the **purge** steps (defect 2), and also purge
    `policy.json`.
  - `workflow_dispatch` inputs `grace_hours`, `publish_bridge` (build and publish the compat-1 bridge to beta, or to
    beta and stable with `promote_now`) and `maintenance`.
  - Add `pawlegends-app/bridge/**` to the paths.
- `client/next.config.js`: an `edge(\`${OTA}/policy.json\`, REVALIDATE, "max-age=30, stale-while-revalidate=60")` rule.
- `pawlegends-web/next.config.js`: the `version.json` header rule.

## 8. Tests, rollout, rollback

### 8.1 Tests

- `pawlegends-app/tests/policy.test.ts`: the `decidePolicy` table (each reason, rollback to an older seq, a new sim
  ignoring grace, maintenance window, native too old, compat retired, missing fields, so old clients get `ok`),
  policy signature ok/bad, hedged fetch (API wins, API times out and the mirror wins, both fail and the cache decides,
  no cache lets play with a notice).
- `pawlegends-app/tests/gate.test.ts` (happy-dom): invisible for 600 ms, then each screen; progress from the
  `download` event; `applyNow` only after `whenReady`; a resume off the title does nothing until a title mutation; a
  target in `failed` produces no loop; 3 failures switch to the fallback; an exception fails open; a retry re-reads
  the manifest.
- `pawlegends-app/tests/ota.test.ts`: `applyNow` and `addListener` on the fake updater.
- `pawlegends-app/tests/update-drill.test.ts` (happy-dom): the drill of §8.3 without a device, end to end over HTTP
  (see the status note at the top).
- `pawlegends-app/tests/publish.test.ts`: `policy.json` is written and signed on publish, promote and rollback;
  `minSim` follows the live channels; `--grace-hours`; `--compat 1` bridge publish writes ios/1 and android/1 (both
  channels) and leaves compat 2 byte-identical; prune keeps the policy-named bundles; maintenance on and off.
- `pawlegends-app/tests/bridge.test.ts`: the bridge `www` has no game module, no `host.js` and no "firebase"; it has
  both store links and the web link; `data-ready` and `data-screen` are set; the `shell.js` stamp says compat 1; size
  is under 300 KB. Old-parser parity: the bridge manifest passes `parseManifest` and `verifyManifest` **as they were at
  b5500906 and 9eae7e8f** (vendored copies of the old functions in the test).
- `backend/src/pawlegends/client-policy/client-policy.spec.ts`: the decision table, the merge with `SIM_VERSIONS`, the
  60 s cache, 24 h stale-on-error, a bad signature ignored, no parameters → `ok`, the throttle, and `Cache-Control`.
  The `pawlegends-live.spec.ts` assertion covers the `update` block in the 400 body.
- Shared-contract parity test (backend vs pawlegends-web copy of `client-policy.ts`).
- `pawlegends/src/meta/clientPolicy.test.ts`: reload only on the title with no party; throttle; a blocking card when
  the sim is not accepted; app mode dispatches the events and never calls `location.reload`.
- `pawlegends-web/__test__/pawlegends-host.test.tsx`: `reload-request` remounts the frame with `?v=`; the host-side
  stale bar.
- Playwright (`pawlegends-web/e2e/pawlegends-force-update.spec.ts`, one `userDataDir` deleted in `finally`): change
  `version.json` → the tab reloads on the title, not mid-match.

### 8.2 Rollout (each step merged to main and pushed; fix forward)

1. **Backend**: the `client-policy` endpoint and the structured 400. Harmless: nobody calls it yet. Deploy and check
   `curl api.tokentails.com/pawlegends/client-policy?platform=ios&compat=2`.
2. **Publish tooling**: `policy.json`, the header rules, the workflow fixes (defect 2). The next publish writes the
   policy files. Check the signature locally with the public key.
3. **Web**: `version.json` + `clientPolicy.ts` + host `reload-request`. Through the game's normal web build.
4. **Shell gate** (compat 2): OTA beta → TestFlight soak (6 h) and the device drill → stable. From this bundle on,
   phones are gated. Watch for a rise in `[gate]` logs or support mail.
5. **Bridge** (compat 1): `publish_bridge` to beta. Check on one TestFlight 1.0.x iPhone and one internal-track 1.0.x
   Android, then stable.
6. Update `APP-STORE.md` "OTA flow" (defect 3) and the README local drill.

### 8.3 Device drill (before steps 4 and 5)

The local drill (`scripts/ota-local.mjs`, Debug build on the `dev` channel):

- **(a) Gate update**: an old bundle → the gated bundle (one non-blocking hop) → publish a newer one → relaunch → the
  update screen with progress → the new title.
- **(b) Offline**: airplane mode with a cached `ok` → the notice chip. With a cached policy whose `minSim` is above the
  installed sim → the retry screen. Back online → it updates.
- **(c) Bad bundle**: publish one whose title never comes up → the watchdog rolls back → the gate shows "Couldn't
  update", with no loop.
- **(d) Rollback**: `rollback` to an older seq → gated phones move down to it.
- **(e) Compat 1**: build the 1.0 binary from `80692c00` in a scratch worktree (`build-sim`), serve `updates/ios/1`
  locally with the bridge → the bridge appears. The App Store and browser buttons open outside the app. A rollback of
  the bridge to ef22d35 restores the old game. Then the same on Android with `adb reverse tcp:8787 tcp:8787`.

### 8.4 Rollback

- Bad gated bundle: workflow `rollback_to=<previous>`. The policy then marks the rollback, gated phones download it on
  their next check or retry, and a non-booting bundle is reverted by the watchdog anyway.
- Gate too strict (a false block): republish with `grace_hours=72`. The policy becomes `ok` for current phones within
  60 s (backend cache) + 30 s (edge). Or `--maintenance off` if that was the cause.
- Bad bridge: `ota-publish.mjs --compat 1 --rollback 20261111112457-ef22d35` (ios/1 and android/1). The bridge's own
  `shell.js` takes it.
- Backend endpoint broken: clients fall back to the signed mirror automatically. A fix is redeployed.

## 9. Files per component

**Backend (`backend/`)**
- `src/pawlegends/client-policy/client-policy.ts` (new: types, `decidePolicy` re-export, merge with `SIM_VERSIONS`)
- `src/pawlegends/client-policy/client-policy.service.ts` (new: fetch, verify, cache of `policy.json` and `version.json`)
- `src/pawlegends/client-policy/ota-public-key.ts` (new: a copy of `pawlegends-app/ota/public-key.pem`, with a parity
  test)
- `src/pawlegends/client-policy/client-policy.spec.ts` (new)
- `src/shared-contracts/client-policy.ts` (new, a copy of the pawlegends-web contract)
- `src/pawlegends/pawlegends.controller.ts` (`@Get('client-policy')`, `PAWLEGENDS_THROTTLES.clientPolicy`)
- `src/pawlegends/pawlegends-live.ts` (`update` block on `PAWLEGENDS_SIM_VERSION`) + `pawlegends-live.spec.ts`
- `src/app.module.ts` (register `PawlegendsClientPolicyService`)

**App shell (`pawlegends-app/`)**
- `src/shell/policy.ts` (new: hedged fetch, signature, cache `pl.policy.last`, `decidePolicy` from `@/shared-contracts`)
- `src/shell/gate.ts` (new: overlay DOM and screens, backoff, attempts, fail-open)
- `src/shell/ota.ts` (`applyNow`, download progress listener, `UpdaterLike.addListener`, forced check)
- `src/shell/manifest.ts` (`verifySigned` generalised from `verifyManifest`, `PolicyFile` parse)
- `src/shell/main.ts` (wire the gate at boot, resume, `data-screen` observer, `pl:update-required`)
- `bridge/index.html`, `bridge/logo.png` (new: compat-1 bridge)
- `scripts/build-web.mjs` (`--bridge --compat`)
- `scripts/ota-publish.mjs` (`policy.json`, `--grace-hours`, `--compat`/`--www`, `--maintenance`)
- `scripts/lib/app-config.mjs` (`MIN_COMPAT`, `REQUIRED_GRACE_HOURS`, `STORE_URLS`, `WEB_PLAY_URL`, `POLICY_FILE`)
- `scripts/ota-local.mjs` (serve `policy.json`, `--compat 1` drill)
- `tests/policy.test.ts`, `tests/gate.test.ts`, `tests/bridge.test.ts` (new); `tests/ota.test.ts`, `tests/publish.test.ts`,
  `tests/manifest.test.ts`
- `README.md` ("OTA flow", "Force update", drill steps)

**Game (`pawlegends/`, never `src/sim/**`)**
- `src/meta/clientPolicy.ts` + `clientPolicy.test.ts` (new)
- `src/app/app.ts` (call it at boot and in `setScreen('title')`, show the update card)
- `src/embed/bridge.ts` (`reload-request` in `GAME_TYPES`; handle `code` on `save-result`)
- `src/embed/integrate.ts` (results chip "Update needed")
- `src/party/partyClient.ts` (the `reload` action raises `pl:update-required` first)
- `vite.config.ts` (emit `version.json`)

**Web (`pawlegends-web/`)**
- `shared-contracts/client-policy.ts` (new: the contract and `decidePolicy`)
- `components/pawlegends/PawlegendsHost.tsx` (`reload-request`, stale-save reload bar)
- `components/pawlegends/bridge.ts` (`reload-request` parse)
- `next.config.js` (`/pawlegends-game/version.json` headers)
- `__test__/pawlegends-host.test.tsx`, `__test__/pawlegends-saves.test.ts`, `e2e/pawlegends-force-update.spec.ts`

**Site and CI**
- `client/next.config.js` (`policy.json` headers)
- `client/public/pawlegends-app/updates/{ios,android}/{1,2}/policy.json`, `updates/android/1/manifest.json` (generated)
- `.github/workflows/pawlegends-ota.yml` (compat from config in summary and purge, `policy.json` purge, inputs
  `grace_hours`, `publish_bridge`, `maintenance`, bridge paths)
- `scripts/cdn-cache.mjs` (`--file policy.json` allowed, default compat from `app-config.mjs`)

**Docs**
- `docs/plans/moba/FORCE-UPDATE.md` (this file)
- `docs/plans/moba/APP-STORE.md` ("OTA flow" and "Sim compatibility" rewritten to point here)
