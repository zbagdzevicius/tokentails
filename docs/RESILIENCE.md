# Resilience

How Token Tails keeps a crash from blanking the app, and how we measure it (plan F9, G13). Related:
[CLIENT.md](CLIENT.md) "Analytics", [GAMES.md](GAMES.md) "Shared plumbing", [BACKEND.md](BACKEND.md)
"Cats, blessings, shelters" (the storefront).

[![CI](https://github.com/zbagdzevicius/tokentails/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/zbagdzevicius/tokentails/actions/workflows/ci.yml)

The badge shows the GitHub Actions run of `.github/workflows/ci.yml` on `main`. It starts reporting
once the workflow has run on `main`; making its jobs required checks is a GitHub settings step.

## What we claim, and how

We do not say "crash-free" without a number and its definition. The public quality figure is:

> **Crash-free instrumented sessions ≥ 99.5%**, where
> crash-free instrumented sessions = 1 − (sessions with an `app_error` at scene level or higher) /
> (sessions with a `game_start`).

- "Instrumented" means consenting sessions with analytics on (`NEXT_PUBLIC_POSTHOG_KEY` set and the
  player pressed ACCEPT). Sessions without consent are not counted either way.
- "Scene level or higher" means the codes `scene_crash:*`, `page_crash:*`, `root_crash:*`,
  `scene_stall` and `scene_start_failed`. Modal and section crashes, listener errors and window errors
  are tracked but do not count against the figure (the player keeps playing).
- The denominator counts sessions with at least one `game_start` (sent on `RUN_BEGIN`), so a visit
  that never starts a run is neither a success nor a failure.
- Until the PostHog dashboards exist (plan section 6.3) the figure is a target, not a measured result.
  Any public use must name the window it was measured over, and say "instrumented sessions".

Companion guardrails (plan section 6.3): `storefront_degraded` under 0.5% of Shelter opens and
`game_font_fallback` under 1% of sessions.

## Boundaries (`client/components/errors/`)

| Level | Component | Where | Fallback |
|---|---|---|---|
| Root | `RootBoundary` | `pages/_app.tsx`, outside every provider | Full screen at `LAYERS.system` (600): RELOAD and TRY AGAIN |
| Page | `PageBoundary` | `layouts/MainLayout.tsx`, inside the providers, keyed by the route | Full screen at 590: TRY AGAIN and RELOAD |
| Scene | `SceneBoundary` | `components/game/Game.tsx`, one per Phaser mount (Home, Shelter, Purrsuit, Cupid Cat, Paw Match) | Over the canvas and the run gate, under lobby modals (90): TRY AGAIN (fresh mount) and BACK TO MENU |
| Modal | `ModalBoundary` | Inside every `GameModal` | An inline card in the modal: TRY AGAIN and CLOSE |
| Section | `SectionBoundary` | Each landing section (`hero` has a PLAY GAME fallback) | Renders nothing, or its fallback, and reports |

All share one `ErrorBoundary` class that reports `app_error` with the code `<level>_crash:<name>`
and resets on TRY AGAIN or a route change. `CrashPanel` uses no context and inline styles only, so
it renders even when a provider is the thing that failed. Copy (decision #89): "Something went wrong.
Your cats are safe." with one claim-free line per level, for example "This game stopped. Try it
again, or head back to the menu." The copy never promises that progress was saved. RELOAD in app
builds goes to `/`, where `AppRouteRestore` routes on.

## Phaser crash guard (`client/components/Phaser/events.ts`)

- Every GameEvents listener runs inside try/catch: a throw is reported as `listener_error:<event>`
  and the other listeners still run.
- A stall watchdog watches the game's `poststep` heartbeat: after 8 s without frames while the page
  is visible and the game is not paused, it reports `scene_stall`, shows the scene fallback and tears
  the stalled game down (Phaser schedules its next frame only after a step returns, so an exception in
  `update` freezes the canvas silently). During startup the limit is 15 s, and a scene stuck in
  Phaser's CREATING state on two checks is `scene_start_failed`. Tab switches, device sleep, a modal
  suspension and Capacitor resume reset it.
- Window errors and unhandled rejections are reported only when they come from our own origin
  (`capacitor://localhost` included); extensions and wallets are ignored.

## Telemetry

`app_error` goes through the same consent gate as every product event, at most 5 per tab session and
one per code (counts in `sessionStorage`, so RELOAD cannot loop them). Messages and stacks are
scrubbed (`shared/analytics-core.ts`): no emails, tokens, addresses, ids, phone numbers, IBANs or
quoted names, at most 8 stack frames, flat context with at most 12 keys, the route pattern
(`/cats/[cat]`), never the real URL. `posthog.captureException` is never called.

## Storefront contract (plan G13)

The Shelter used to crash when a shelter slug key was missing from `GET /cat/sale`. The fix ships in
two halves so old native builds are protected too:

1. **Backend first**: the four required keys are always arrays and every key returned before is
   kept, with whitelisted fields and an additive `_meta` (BACKEND.md). An unchanged shipped client
   no longer crashes against the patched backend.
2. **Client**: `parseStorefront` (`shared/storefront.ts`, fuzzed with 2,000 seeded cases) never
   throws; `CAT_API.storefront()` never returns an array; `useStorefront` shares one query and keeps
   the last good cats on a failed refetch; `sample` never mutates its input; the Shelter shows "All
   adopted, thank you!" or "Back soon" signs for empty zones and a degraded notice with RETRY on a
   failure; NPC sheets that 404 are skipped and reported.

## Resilience matrix (`client/e2e/resilience.spec.ts`)

Each case runs at 390x844, 360x740, 844x390 and 1440x900 and fails on any `pageerror`, unmocked
backend call or wrong auth header.

| Surface | Case | Expected |
|---|---|---|
| `/cats` | Current shape with duplicate cat names | Every partner cat listed |
| `/cats` | Legacy shape without `_meta` or the partner key | The adopted notice, no crash |
| `/cats` | A required key missing | No crash |
| `/cats` | 500, then a good retry | RETRY, then the cats |
| `/cats` | Malformed JSON | RETRY |
| `/cats` | A top-level array | RETRY |
| Shelter | Duplicate names and a 404 sprite | Every good cat spawns, the missing one is skipped (`NPC_SPAWNED.skipped`) |
| Shelter | Legacy shape | All adopted sign, the rest spawn |
| Shelter | 500, then RETRY | Degraded notice, then the spawn |
| Shelter | Malformed JSON | Degraded notice, nothing spawns |

Forced crashes (`?__crash=root|page|scene|modal|section|listener`, live only in development or a
`NEXT_PUBLIC_E2E=1` build) exercise every fallback: each renders, has focus on its primary button,
passes axe and recovers. The stall and startup watchdogs are covered by jest
(`errors-crash-guard`) and a scratch Playwright run that throws inside a scene. The whole
end-to-end set runs in the CI `client` job.

## Catnip Heist (G13-H)

`catnip-heist/src/app/crash.ts`: a boot failure, a burst of 3 same-origin errors within 2 s, or a
5 s frame stall while the page is visible shows a night overlay ("The heist stopped. Reload to jump
back in.") with RELOAD focused and the rest of the page inert; a lone error is only reported. Reports
use the shared scrubber and consent key, at most 5 per session, sent with `sendBeacon` only when the
build has `VITE_POSTHOG_KEY`. Replay and verify builds compile the module out.

## Known limits

- Installed native builds keep the old client (no boundaries) until the next store release; the
  backend storefront hotfix is what protects them.
- A game whose boot throws inside `new Phaser.Game` (before its first step) is caught only if the
  mount throws during render.
- The E2E crash hooks are inert in normal builds but still shipped (CLIENT.md known issues).
- Heist crash reports need a PostHog key in the Heist build; a manual check that a beacon arrives as
  `app_error` on the EU host is still to do.
- Headless WebGL in CI is software rendering; frame-time gates need a real device.
