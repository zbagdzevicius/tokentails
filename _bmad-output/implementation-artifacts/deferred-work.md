- source_spec: `_bmad-output/implementation-artifacts/spec-gaming-landing-as-homepage.md`
  summary: Delete the orphaned `client/public/forever-feline/` folder (17 files) and the four mascot images (`emotions/lovelable`, `actions/chilling`, `tasks/paint_a_picture`, `tasks/taking_a_selfie`) left behind by the removed app-family landing.
  evidence: No source references remain (grep over client and cms). The folder is mirrored to the public CDN by `.gitlab-ci.yml`, so check CDN access logs for external links before deleting.
- source_spec: `_bmad-output/implementation-artifacts/spec-gaming-landing-as-homepage.md`
  summary: Homepage content inherited from gaming.tsx has pre-existing issues: no `alt` text on hero and store images, no `<h1>`, all-caps meta description, hardcoded "800+ strays saved", `jusitfy-center` typo, no footer or legal links, and `/old-landing` duplicates the hero.
  evidence: All present in `pages/gaming.tsx` at baseline; the approved spec forbade content changes to the moved page. Decide the fate of `/old-landing` at the same time.
- source_spec: `_bmad-output/implementation-artifacts/spec-gaming-landing-as-homepage.md`
  summary: Mobile browsers that are neither iOS nor Android see no store button on the homepage.
  evidence: `pages/index.tsx` gates the App Store link on `isDesktop || isIOS` and the Play Store link on `isDesktop || isAndroid`; pre-existing in gaming.tsx.
- source_spec: `_bmad-output/implementation-artifacts/spec-gaming-landing-as-homepage.md`
  summary: Add an end-to-end check that `GET /gaming` returns 308 to `/` and `GET /` serves the gaming landing, since the Jest suite covers the module and config surface only.
  evidence: Intent-alignment lens; verified manually with `next start` during this build. No CI runs Jest today (`.gitlab-ci.yml` only syncs assets).
- source_spec: `_bmad-output/implementation-artifacts/spec-landing-proof-section.md`
  summary: The reel marquee shows a frame jump at each 70 s wrap because the duplicated track's videos are not time-synced with the visible copy.
  evidence: Edge-case lens; inherent to the duplicate-track CSS loop. Fix needs JS syncing of 15 video pairs or a single-copy JS-driven scroller.
- source_spec: `_bmad-output/implementation-artifacts/spec-landing-proof-section.md`
  summary: Proof-section videos have no `onError` fallback, so a missing or blocked media file shows a black bordered tile.
  evidence: Edge-case lens. Most likely trigger is the CDN missing `landing/proof/*` before a manual upload; fix the deploy step first, then decide whether to hide failed tiles.
- source_spec: `_bmad-output/implementation-artifacts/spec-landing-proof-section.md`
  summary: Confirm the 15 reels match the proposal deck's marquee; three reel IDs are not in `extra/traction.md` and five traction IDs are not in the set.
  evidence: Intent-alignment lens; the deck is outside the repo so fidelity is unverifiable here. `reel-DSFva36DFtZ.mp4` is a 4 s, 35 KB clip.
