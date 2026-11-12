# Paw Legends without Token Tails: audit

Founder ask (2026-11-12, verbatim): "for now let's drop "Your cats become skins" feature as it's just a confusion and
redirection from main game, they don't need to know about Token Tails at all in Pawlegends ultracode"

Status: **done 2026-11-12** on branch `feat/pawlegends-no-tokentails` (from `origin/main` f9ac34d8, worktree
`tokentails-pawlegends-notc`); not pushed yet. §11 lists what changed. The audit below (§0 to §10) is kept as it was
written; its line numbers are from f9ac34d8. Every "Your call" (§9) took its default.

## 0. The short version

- The cats-become-skins feature is one pipe: the host sends `roster` (owned Token Tails cats), `featured` and `offer`
  (cats for sale), and `champions` (with `forSale`). The game turns the roster into card skins, chromas, tier and
  collection frames, breed coats, Companion Kittens, a squad, a Cards drawer, a Meet card, a chat avatar tab and a
  party card. The host opens `PawlegendsCatSheet` (the $5 named-cat checkout) on `open-cat`.
- **Sim safety: confirmed, no sim change needed.** Nothing in this pipe is a sim input. `CosmeticsConfig` in
  `pawlegends/src/sim/api.ts:66-75` is documented render-only, not in the replay or the hash. `src/sim/**` never reads
  squad, companions, cards or skins (grep: the only hit is the `companionCats` type field). The backend save path
  (`pawlegends-live.ts`, `pawlegends-replay.dto.ts`) has no card, companion or cosmetic field. A party match's
  `cosmetics.heroSkins` is filled by the relay from `party.card` images and is already `null` for any member who sent
  no card (`backend/src/pawlegends/party/party-relay.ts:2258-2261`, `:3195`). The client simply stops sending them.
  `tests/unit/skins-determinism.test.ts` already guards that skins never change the sim.
- **Cleanest cut:** the game ignores `roster`, `featured`, `offer` and `champions.forSale` (treat the roster as
  `EMPTY_ROSTER`), and deletes the UI that only exists for them. The host stops sending them and drops the cat sheet.
  Server data (owned cats, offers, champion cards for sale) stays untouched, just unused.
- Side effect to accept: element **chromas** (the Look sheet's colour tints) come **only** from owned cats
  (`render/cosmetics.ts:395-396`, `:415-419`). With the roster gone the tint row is empty and hides itself
  (`ui/screens.ts:306`, it shows only when there is more than one choice). Tier and collection frames (Rare, Epic,
  Legendary, Buddy, Crew, Clowder) and starter breed coats also come only from cats and go away. Paw Legends' own coats,
  Founder/Legend frames, Treat Track and store frames, titles, Pass and champion store are untouched.

## 1. Sim and replay map (what removal must not break)

| Piece | Where | Read by the sim? | In replay/hash? | Removal |
|---|---|---|---|---|
| `MatchConfig.cosmetics.companionCats`, `heroSkins` | `pawlegends/src/sim/api.ts:66-75`, `:101` | No | No (doc comment, POC.md §7.1) | Send nothing / empty |
| Match setup `companions` (Companion Kittens) | `app/app.ts:1421`, `:1438`; `app/matchSession.ts:134`, `:624`, `:787-788`, `:2241` | No (render: `render/gameView.ts:830`, `render/views/companionView.ts`) | No | Pass `[]` (party matches already do, `app/app.ts:1327`) |
| Worn card skin (`look.coat = cat.<id>`) | `app/app.ts:1416-1418`, `render/cosmetics.ts:409` | No | No | `resolveLook` already falls back to Classic when the cat is not in the roster (`render/cosmetics.ts:409`): old saved looks heal themselves |
| Bond (`noteBond`) | `app/app.ts:1609-1610` | No (profile only) | No | Stops being written |
| Party `party.card{catId}` | `party/partyClient.ts:1110-1115`, `app/app.ts:1150`; relay `party/party-cards.ts`, `party-relay.service.ts:117` | No | Relay copies the image into `cosmetics.heroSkins` (display) | `cardId` returns null: nothing sent; heroSkins stay null |
| Showcase bots in featured skins | `app/app.ts:1447` | No | No | `showcase: []` |
| Save write path `POST /user/catbassadors/live` | host `saves.ts` | n/a | n/a | Unchanged (one write path) |

No `SIM_VERSION` change. No server schema change.

## 2. In the game (`pawlegends/src`)

Actions: **remove** = delete the code path; **rename** = keep the feature, change the words; **keep** = with reason.

### 2.1 Data intake (the root of the feature)

| File:line | What it does / what the player sees | Action |
|---|---|---|
| `embed/integrate.ts:1-16`, `:255-300` | Integration state: roster, featured, offer, squad, bench, Meet | Remove roster/featured/offer/squad/Meet state; keep session, save chip, audio, party ticket, api, account, champion art |
| `embed/integrate.ts:657-690` (`case 'featured'`, `'offer'`, `'roster'`, `'purchase-result'`) | Takes cats and a "joined" cat | Remove the four handlers (ignore the messages; `purchase-result` for store SKUs goes through `CheckoutBridge`, check before deleting) |
| `embed/integrate.ts:708-713` (`case 'champions'`) | Champion art plus `forSale` | Keep art; force `forSale: false` everywhere (as app builds do today) and drop `askChampion` |
| `app/app.ts:285-290`, `:386-391`, `:1414` | Roster → cosmetics, `syncSkins`, `autoEquip` | Remove: roster stays `EMPTY_ROSTER` |
| `app/app.ts:304-310`, `app/skinDemo.ts` | `?skins=demo` fake roster (local only) | Remove file and hook |
| `app/app.ts:396`, `:403-490` (`syncSkins`, `skinShowcaseOpen`, `wearing`, `autoEquip`, `previewSkin`) | "Now wearing Ficus · Undo" chip, locked featured skin previews | Remove |
| `meta/roster.ts` | Roster parser and cat cosmetics | Keep `EMPTY_ROSTER` and types the cosmetics code still reads; delete parsing once nothing calls it |
| `meta/squad.ts`, `meta/profile.ts:47`, `:177` (`squad`, `newCat`, `skinAuto`, `meetClosed`, `bond`) | Squad prefs | Remove `meta/squad.ts`; leave profile fields parsed but unused (old saves must still load) |
| `money/offer.ts` (`pickMeet`) | Meet offer engine | Remove |
| `embed/bridge.ts:18`, `:248-249` (`DEFAULT_EMBED_ORIGINS`, `ART_BUCKET_HOST`) | Allowed host origins; art CDN allowlist | Keep: technical, never shown. Art host is still needed for the Pink Paw champion art |
| `embed/bridge.ts` posts `open-cat`, `offer-seen`, `champion-offer`, `skin-preview` | Asks the host to sell a cat | Remove the senders |

### 2.2 Home and lobby

| File:line | What the player sees | Action |
|---|---|---|
| `ui/home/homeScreen.ts:224-226` | **Cards** nav item with a count badge, key C | Remove (only exists for cats) |
| `ui/home/homeScreen.ts:318` → `ui/lobby/lobbyScreen.ts:221-240` (`peekHtml`) | Bottom-right card fan: "**Your cats become skins** · Collect cards on Token Tails" / "No cat cards yet", "Your 5 cats are here.", "Tap to wear a card", "Wearing Ficus" | Remove |
| `ui/home/homeScreen.ts:298` | "Games" button, aria "Back to Token Tails games" | Remove. `-flow` already removes it: take theirs on conflict |
| `ui/home/homeScreen.ts:453` | C key opens Cards | Remove |
| `ui/lobby/lobbyScreen.ts:216` (`firstPeekLine`) | "Your cat is here." | Remove |
| `ui/lobby/lobbyScreen.ts:301` | Cards rail item (old lobby) | Remove |
| `ui/lobby/lobbyScreen.ts:372` | Eyebrow "**Your Token Tails cat**" over a hero wearing a card | Remove the card branch: always "Your champion" |
| `ui/lobby/lobbyScreen.ts:365-370` | "Fire look" chip, "Rare card" rung chip, gem | Remove the card branch |
| `ui/lobby/lobbyScreen.ts:404` | "Games" exit, "Back to Token Tails games" | Remove |
| `ui/lobby/lobbyScreen.ts:250`, `ui/screens.ts:100` | Frame tip "Frames come from cats you adopted by name, by their tier." | Remove the cat sentence; keep "Earned on the Treat Track." |
| `app/app.ts:847-850` | `cardCount`, `peek`, `wearing`, `onCards` passed to Home | Remove |
| `app/app.ts:908-913` | `onExit` posts `exit` to the host | Remove (with `-flow`) |
| `ui/cards.ts:288-310` (`titleCards`) | "**New squad mate!**", "**Your squad**" chips, "Sign in to bring your cats" | Remove squad and joined lines; keep level badges (see 2.6 catnip) |
| `ui/cards.ts:171-235` (`meetCard`, `championMeetLine`) | Meet card: "A new squad mate?", "Meet Ficus ›", "See Lucky's card ›", "**Opens on Token Tails**", "**Adopt on Token Tails**", "Inspired by X's Token Tails card…" | Remove |
| `ui/cards.ts:238-250` (`championInfo`) | Lobby champion panel: "X is inspired by her **Token Tails card**. Every player can pick her." plus an owner badge | Keep the panel (Pink Paw champion lore); rename to "X is a real cat from the Pink Paw shelter." and drop the owner badge |

### 2.3 Champion select and Look

| File:line | What the player sees | Action |
|---|---|---|
| `ui/screens.ts:309` | Look sheet "**Cards**" button (opens the drawer) and "No other coats for Clem yet. **Cards dress your heroes.**" | Remove the button; text becomes "No other coats for Clem yet." |
| `ui/screens.ts:355` | `teamNote` slot `cs-squad` under the seats (squad cards) | Remove |
| `ui/screens.ts:362`, `:446-453` | Look button shown only when `onDeck` exists; `deck` action | Show Look when coats or tints exist (`hasLookChoices`); delete `deck` action |
| `ui/screens.ts:461-462` | "card skins never carry a chroma" branch | Remove the `cat.` branch |
| `ui/cards.ts:342-395` (`pickCards`) | "Your squad" row, "Your Token Tails pets walk with your waves, on either side.", swap bench, Guest cat, "Sign in to bring your cats" | Remove |
| `ui/champSelect/champSelect.ts:297-305` | Tile label with the card name, "**Card**" badge with title "From X's card" | Remove (tile shows the champion name) |
| `app/app.ts:1022`, `:2027` (`championTiles`) | Champion card art on tiles and owner flag | Keep art only; drop `owned` |
| `app/app.ts:1042`, `:925-1006` (`onDeck`, `openCards`, `deckData`, `deckCard`) | Opens the drawer | Remove |
| `ui/deck/deck.ts`, `deckCard.ts`, `empty.ts`, `deck.css`, `cssUrl.ts` | "Your cards" drawer: "**Your Token Tails cats become skins for every champion.**", "Cats you adopt or redeem on Token Tails show up here.", "Sign in to bring your cats.", "**Visit Token Tails**" link to `https://tokentails.com` (`empty.ts:24`, `:44`), postcards aria "Shelter champions on Token Tails" | Remove the whole folder |

### 2.4 Match, loading and results

| File:line | What the player sees | Action |
|---|---|---|
| `app/app.ts:1419-1421`, `:1438` | Companion Kittens walk with the waves, nap at the fountain | Remove (`companions: []`) |
| `app/app.ts:1453-1460` → `ui/screens.ts:943-948` | Loading line "Ficus and Pickles walk with you this match", worn card, "Bond 3" | Remove the squad line, worn card and Bond; keep hero match count |
| `app/matchSession.ts:2241-2242` | HUD note "Ficus cheered your takedown" | Goes away with no companions; delete the branch |
| `ui/screens.ts:568`, `:743` | Results "**Ficus** fought as Clem · Bond 4" | Remove |
| `app/app.ts:1800`, `:1809` | MVP card shows the worn card's tier gem | Remove card tier (store-coat rung stays) |
| `ui/cards.ts:482-500` (`resultsCards`) | Results corner: companion card, Guest cat, Meet card, "**Token Tails cats can join your squad**" | Remove all but the `notify` button |
| `app/app.ts:1447` | Bots wear featured (for-sale) cat skins as a showcase | Remove |
| `render/skins/registry.ts`, `classify.ts`, `families.gen.ts`, `tierCardFx.ts`, `cardFxView`, `ui/cards/*` (vs/mvp card art) | Card skin palettes and card effects | Keep the effect kit the store coats use (`render/skins/coatRung.ts`, `effectKit.ts`, `tierFx.ts`); remove the `cat.<id>` card-skin registry, featured skins and Awakened/Bond once nothing calls them (follow-up, not needed for the visible cut) |
| `ui/settings.ts:136-138` | "Skin effects: all / mine / off" | Keep: also governs store coat effects |

### 2.5 Social, party, collection

| File:line | What the player sees | Action |
|---|---|---|
| `social/socialSheet.ts:673-683`, `app/app.ts:1245-1247` | Avatar picker tab "**My cats**" with the player's own cat art; empty "**Your Token Tails cats show here.**" | Remove the tab (Champions only). Existing `cat` avatars stay server-side and keep rendering for now (see Your call 4) |
| `party/partyClient.ts:1110-1115`, `app/app.ts:1150` | Party sends the worn cat card; peers see its art on the party lobby avatar | Stop sending (`cardId` → null) |
| `party/ui/partyLobby.ts:50-53`, `party/partyClient.ts:599` | Shows a peer's card art (older clients still send one) | Ignore `m.card` (show the default avatar) |
| `ui/collection.ts:46` (`postcardStory`) | "Lucky is a real Pink Paw cat. This champion is drawn from her **Token Tails card**." | Rename: drop the Token Tails sentence. Keep "Meet the real cat" postcards (`:91`) |
| `ui/collection.ts:93` | "**Card effects**" list of owned card skins | Remove |
| `ui/store.ts:250` | Store fine print "Checkout opens on the **Token Tails** web page." | Rename: "Checkout opens on a secure web page." |

### 2.6 Links, names and currency

| File:line | What the player sees | Action |
|---|---|---|
| `ui/settings.ts:71-75`, `:146` | Settings "Privacy" link → `docs.tokentails.com/...` (web) or `tokentails.com/pawlegends/privacy` (app) | Point both at the Paw Legends privacy page (`/pawlegends/privacy`, `pawlegends.app/privacy` in the app). It names Token Tails MB as controller, which the law requires |
| `share/partyLink.ts:20` | Invite link and QR read `https://tokentails.com/pawlegends?party=K7QX2M` | Use `https://pawlegends.app/?party=` (next.config.js already sends `/?party=` to `/play` on that host) |
| `app/platform.ts:16`, `:68-79` (`PUBLIC_GAME_URL`, `shareBase`) | Dare links from the app read `tokentails.com/pawlegends?dare=` | `https://pawlegends.app/` |
| `ui/cards.ts:146-152`, `:443-449` | "+12 catnip · 340 total" on results, level chips "First win: +5 catnip" | Catnip is the Token Tails currency. Hide it in the game (the server still pays it through the one save path). See Your call 2 |
| `render/ppk/ui/text.js:27`, `:166`; `render/ppk/core/brand.js:39`, `:49`, `:62`; `ui/ppk-ui.css:1597-1599` (`.tt-cobrand`) | "A Token Tails game", "Token Tails Adventure", co-brand pill | Not rendered (no caller of `title.foot`, `credits.team`, `PAGE_TITLE`, `BRAND` outside ppk). Delete the strings so a grep stays clean |
| `render/ppk/characters/palette.js:37` | Comment only | Keep |
| `index.html:16-17` | Preconnect to `api.tokentails.com` | Keep: invisible, the API host |
| `analytics/posthog.ts` event names (`offer_shown`, `checkout_start kind:meet`) | Not shown to players | Remove the Meet events with their code |

## 3. Host page (`client/`)

The game page is `/pawlegends/play`; on `pawlegends.app`, `/` is the landing and `/play`, `/privacy`, `/terms`,
`/account`, `/support` are rewrites (`client/next.config.js:169-199`).

| File:line | What the player sees | Action |
|---|---|---|
| `components/pawlegends/PawlegendsHost.tsx:437` (`rosterOf`), `:444` (`storefrontCats`), `:464-471` (`championsOf`, `pickFeatured`), `:478-631` (`onOpenCat`, `onOfferSeen`, `onChampionOffer`, `onSkinPreview`), `:785-800` (offer ask) | Fetches owned cats and storefront, sends `roster`/`featured`/`offer`, runs the Meet offer engine | Remove; send `champions` with `forSale: false` (art only) |
| `components/pawlegends/PawlegendsHost.tsx:959-962`, `:995-1010` | `PawlegendsCatSheet` ("Meet Ficus", $5 checkout, "Ficus joined your squad", "Back in the lobby, Ficus is in your squad.") and `OwnedCatSheet` ("Ficus is in your squad") | Remove both |
| `components/pawlegends/PawlegendsCatSheet.tsx` | The cat checkout sheet | Delete file (and `client/__test__/pawlegends/cat-sheet.test.tsx`) |
| `components/pawlegends/rosterBridge.ts`, `featuredBridge.ts` | Roster and featured shaping | Delete once the native host stops importing `rosterOf` (§4) |
| `components/pawlegends/championsBridge.ts` | Champion art + `forSale` | Keep; always `forSale: false` |
| `components/pawlegends/PawlegendsHost.tsx:698`, `flags.ts:98` (`PAWLEGENDS_EXIT_PATH = "/game"`), `:907-926` | `exit` → Token Tails games hub; slow banner "Back", timeout "**Back to games**" → `/game` | Remove the `exit` handler; timeout/slow link goes to the Paw Legends landing (`/` on pawlegends.app, `/pawlegends` elsewhere) |
| `components/pawlegends/PawlegendsHost.tsx:1051` | Notify sheet "**Token Tails** keeps this email only to send Pawlegends season news." | Rename: "We keep this email only to send Pawlegends season news." |
| `components/pawlegends/PawlegendsAccount.tsx:126` | "anonymises your Token Tails profile" | Rename: "anonymises your profile" |
| `pages/pawlegends/play.tsx:21`, `index.tsx:19-20`, `account.tsx:9`, `support.tsx:7`, `privacy.tsx:11`, `terms.tsx:15` | Tab titles "Pawlegends - Token Tails"; meta description "by Token Tails" | Drop the suffix and "by Token Tails" |
| `components/seo/SeoHead.tsx:68`, `:113-116` | `og:site_name` (site name) and canonical on the Paw Legends pages | Pass "Pawlegends" as the site name for these pages; canonical stays as is (see Your call 5) |
| `components/pawlegends/landing/markup.ts:252`, `:260-261`, `:494-495`, `:230` | Shelter section: Token Tails logo, "Pawlegends is made by **Token Tails**, a cat game studio", "**Visit Token Tails**" → `/`; footer logo + "**Pawlegends by Token Tails**"; party illustration URL `tokentails.com/pawlegends?party=` | Remove logo, studio sentence and button (keep the Pink Paw sentence); footer text "Pawlegends"; illustration URL `pawlegends.app/?party=` |
| `components/pawlegends/legends/markup.ts:139`, `:142-143`, `:216`, `:331`, `:366`, `:374-376` | "Token Tails mascot", "made by Token Tails", "Meet the cats at Token Tails", "By Token Tails", browser bar `tokentails.com/pawlegends/play`, "Visit Token Tails", footer logo and nav link "Token Tails" | Same treatment; `-names` edits these files too (merge both intents) |
| `pages/pawlegends/terms.tsx:58-74` | Section "What you can buy": "The only thing for sale is a named cat, from its Meet card… The Token Tails checkout… added to your Token Tails account as a Common card. In Pawlegends it brings: …" (`MEET_PERKS`) | Remove the section (and `MEET_PERKS`); the store section below becomes "What you can buy" |
| `pages/pawlegends/terms.tsx:53-54` | "It is made by Token Tails and is still in development" | Keep the legal maker line only if legal wants it in the terms; default reword to "operated by Token Tails MB" in the legal footer, not the intro |
| `pages/pawlegends/terms.tsx:80` | "Items belong to your Token Tails account" | Keep the legal fact, reword: "Items belong to your account (operated by Token Tails MB)" |
| `pages/pawlegends/privacy.tsx:83`, `:111-117`, `:159`, `:192-194` | "made by Token Tails MB, Vilnius" (controller), "your Token Tails profile", OTA from tokentails.com, "Token Tails privacy policy" link | Keep the controller line and technical domains (legal and true). Reword "your Token Tails profile" → "your profile". Review the §192-194 link with Your call 3 |
| `pages/pawlegends/account.tsx`, `support.tsx` | `info@tokentails.com` contact | Keep (legal contact; see Your call 6) |
| `components/pawlegends/checkout.ts` | Stripe statement and seller | Keep: legal entity on the receipt |

## 4. Native app (`pawlegends-app/`)

| File:line | What the player sees | Action |
|---|---|---|
| `src/host/nativeHost.ts:178-182` | Sends the roster (starter and redeemed cats) and champion cards | Stop sending `roster`; keep `champions` (art, never for sale) |
| `src/host/nativeHost.ts:343` | Delete-account dialog: "your **Token Tails** profile is anonymised and **your cats go back to the shelter pool**" | "Your sign-in is deleted and your profile is anonymised. This cannot be undone." (the server behaviour is unchanged) |
| `src/host/sheet.ts:260` | Sign-in sheet: "By signing in you agree to the **Token Tails terms**. Privacy: tokentails.com/pawlegends/privacy" | "…agree to the Pawlegends terms. Privacy: pawlegends.app/privacy" |
| `src/host/nativeHost.ts:43` | Error "write to hello@tokentails.com" | Keep (contact address; Your call 6) |
| `fastlane/metadata/en-US/description.txt:19`, `metadata_android/en-US/full_description.txt:19`, `metadata_mac/en-US/description.txt:24` | Store text "Pawlegends is made by Token Tails, a small game studio from Vilnius, Lithuania." | Remove the line (the store shows the seller anyway) |
| `fastlane/metadata/copyright.txt` | "2026 Token Tails" | Keep: legal |
| `fastlane/metadata/en-US/marketing_url.txt`, `privacy_url.txt`, `support_url.txt` | `tokentails.com/pawlegends…` | `https://pawlegends.app/`, `/privacy`, `/support` |
| `fastlane/metadata/review_information/notes.txt:18` | Reviewer note mentions "the card collection" and the "Your cats b[ecome skins]" title line | Rewrite: no card collection |
| Bundle id `com.tokentails.pawlegends`, Firebase files, OTA host `tokentails.com/pawlegends-app/updates` | Not shown to players | Keep (changing the id makes a new app) |

## 5. Backend (`backend/src/pawlegends`)

Untouched by the cut (server data stays, just unused): `GET /user/cats`, offer service (`pawlegends-offer.service.ts`),
`GET /pawlegends/champions` `forSale`, `party/party-cards.ts`, chat avatar kind `cat` (`social/avatar.ts`).

| File:line | What the player sees | Action |
|---|---|---|
| `pawlegends-account.service.ts:47` | Restore and notify emails end "**Pawlegends by Token Tails.**" | "Pawlegends." |
| `pawlegends-account.service.ts:187` | Sender address `hello@tokentails.com` (env override), name "Pawlegends" | Keep (Your call 6) |
| `pawlegends-webhook.service.ts:269` | Internal log reason | Keep (never shown) |

## 6. Docs that define these UIs

Mark each as "parked 2026-11-12: no Token Tails in Paw Legends (NO-TOKENTAILS.md)", do not delete the history:
`docs/plans/moba/CARD-SKINS.md` (§1, §5, §6: the card side; the coat rung part stays live),
`docs/plans/moba/GDD.md` §7.2 (line 373, "Owned Token Tails cats in Pawlegends (the cross-sell)"),
`docs/plans/moba/LANDING-PICK-UX.md` (Cards peek, B5 squad slot), `docs/plans/moba/CHAT-AVATARS.md` §7.4 (My cats tab),
`docs/plans/moba/MULTIPLAYER.md` D8 (party cards), `pawlegends/README.md` and `pawlegends-app/README.md` where they
describe the roster, and `docs/CLIENT.md` "Pawlegends" host messages.

## 7. Tests that will move

Game: `tests/unit/integration.test.ts`, `lobby-screen.test.ts`, `home-screen.test.ts`, `card-name.test.ts`,
`card-fx-ui.test.ts`, `skins-offer-rules.test.ts`, `skins-demo.test.ts`, `skins-profile.test.ts`,
`social-sheet.test.ts`, `party-lobby.test.ts`; e2e `skins.spec.ts`, `embed.spec.ts`, `lobby.spec.ts`. Keep
`skins-determinism.test.ts`. Client: `__test__/pawlegends/cat-sheet.test.tsx`, `cards.test.ts`,
`champions-bridge.test.ts`, `landing.test.tsx`, `legends.test.tsx`. Native: `tests/host.test.ts` (sign-in and delete
copy). Add one guard test: no player-visible string in `pawlegends/src` (outside comments) matches `/Token ?Tails/`.

## 8. Merge hot spots with the other worktrees

Uncommitted edits on 2026-11-12 in the same files:
- `-flow`: `app/app.ts`, `ui/home/homeScreen.ts`, `ui/screens.ts`, `ui/settings.ts` (already removes the Games
  button: keep theirs, then drop Cards).
- `-names`: `app/app.ts`, `embed/integrate.ts`, `ui/cards.ts`, `ui/collection.ts`, both landing `markup.ts` files
  (English names: keep their names, apply our removals).
- `-store`: `app/app.ts`, `ui/store.ts` (fine-print line).
- `-5v5`: `app/app.ts`, `ui/collection.ts`.
- `client/public/pawlegends-game`: take theirs and rebuild.

## 9. Your call (defaults apply if no answer)

1. **Chromas, tier frames, breed coats** come only from Token Tails cats. Default: they go away with the roster; the
   tint row hides. (Alternative later: grant tints through the Treat Track or store, a separate task.)
2. **Catnip** ("+12 catnip", "First win: +5 catnip") is a Token Tails currency. Default: hide it in the game; the
   server still pays it (score path unchanged). Level chips show "First win: badge" / best time.
3. **Privacy link**: default both web and app link the Paw Legends privacy page (which names Token Tails MB as the
   controller, as required). The general Token Tails policy link inside it (`privacy.tsx:192-194`) stays only if legal
   needs it for the shared-account data; default keep that one sentence.
4. **Existing cat chat avatars** (chosen before the cut): default keep rendering them (server data); the picker no
   longer offers cats.
5. **Canonical/og:url** of the Paw Legends pages point at tokentails.com today. Default: leave (SEO move is a separate
   step); only the visible site name changes.
6. **Contact addresses** `info@` / `hello@tokentails.com` in support, account, terms, emails. Default keep (legal
   contact). Change only when a pawlegends.app mailbox exists.
7. **Invite and dare links** move to `pawlegends.app`. Default yes (routing already exists in `next.config.js`).

## 10. Order of work (proposed)

1. Game: ignore `roster`/`featured`/`offer`, champions `forSale: false`; delete deck, Meet, squad, Cards nav/peek,
   card branches in lobby/pick/loading/results, avatar cats tab, party card; rename the copy in §2.6.
2. Host: stop sending the four messages, delete the cat sheets, exit to the landing, rename copy and titles, landing
   and legends Token Tails sections.
3. Native: stop `roster`, sign-in and delete copy, store metadata.
4. Backend: email footer.
5. Docs parked, tests updated, guard test, rebuild `client/public/pawlegends-game`, OTA bundle per the app README.

## 11. What was done (2026-11-12)

No sim change, no `SIM_VERSION` change, no server schema change. `POST /user/catbassadors/live` stays the one score
write path. Server data (owned cats, offers, champion cards for sale) is untouched, just unused.

### Game (`pawlegends/src`)

- **Feed cut at the source.** `embed/integrate.ts` owns `roster`, `featured` and `offer` and ignores them; the
  integration state has no roster, featured cats, Meet offer, squad or joined cat. `champions` keeps the art and always
  sets `forSale: false`. The app's own `roster`/`offer` branches are gone; `owned().roster` is `EMPTY_ROSTER`.
- **Deleted:** `ui/deck/` (the "Your cards" drawer; `cssUrl.ts` moved to `ui/cssUrl.ts`), `meta/squad.ts`,
  `app/skinDemo.ts` (`?skins=demo`; the demo roster lives on as `tools/fixtures/demoRoster.ts` for the dormant
  render-kit tests and the trailer harness), `pickMeet`/`MEET_SNOOZE` (`money/offer.ts`), the cat path of
  `CheckoutBridge` (`openCat`, `onCatResult`, `waiting`).
- **Home and lobby:** no Cards nav item, card peek ("Your cats become skins"), C shortcut or "Games" exit; the
  champion is always "Your champion" (no card name, rung chip or gem); frames say "Earned on the Treat Track."
- **Title slot (`ui/cards.ts`):** no "New squad mate!", "Your squad", Meet card or "Sign in to bring your cats"; the
  champion panel says "<name> is a real cat from the Pink Paw shelter" (no owner badge).
- **Champion select:** no card names, rung border or "Card" badge on tiles; no squad slot; the Look sheet has coats and
  tints only (no Cards button, no "Cards dress your heroes"); the Look button shows only when there is a choice.
- **Match, loading, results:** companions `[]`, showcase `[]`, no "walk with you" line, worn card, Bond, "fought as",
  card tier on the MVP card, "cheered your takedown" note, companion or guest card, or "Token Tails cats can join your
  squad". The VS and MVP card footer reads "PAWLEGENDS".
- **Social and party:** the avatar picker has champions only; the party sends no `party.card` and shows no peer card.
- **Collection:** no "Card effects" list; the postcard story drops "Token Tails card".
- **Words and links:** no catnip in the game (level chips show times and "First win: badge"; the results chip shows no
  "+N catnip"); store fine print "Checkout opens on a secure web page."; Settings privacy link
  `https://pawlegends.app/privacy`; invite links `https://pawlegends.app/?party=`; dare links from the app and from
  the production host pages `https://pawlegends.app/?dare=`; the unused PPK brand strings name Pawlegends / Pink Paw.
- **Guard:** `tests/unit/no-tokentails.test.ts` fails on any non-comment line in `src/` or `index.html` that names
  Token Tails (technical hosts allowed: embed origins, art bucket, API host, the share host list) and on any removed
  UI rendering on Home, pick, loading, results or the Treat Track.

### Host (`client/`)

- `PawlegendsHost.tsx` sends no `roster`, `featured` or `offer`, asks no offer, counts no offer session and handles no
  `open-cat`, `offer-seen`, `champion-offer`, `skin-preview` or `exit`; champions go out as `championArtOf` (art only).
  The slow and timeout banners lead to the Paw Legends landing (`pawlegendsHomePath`: `/` on pawlegends.app,
  `/pawlegends` elsewhere), never `/game`. The notify sheet says "We keep this email...".
- **Deleted:** `PawlegendsCatSheet.tsx`, `rosterBridge.ts`, `featuredBridge.ts` and their tests, `MEET_PERKS`.
  `bridge.ts` keeps the protocol (an older game may still send the messages), unused by the host.
- **Pages:** tab titles and descriptions drop "- Token Tails" / "by Token Tails"; `SeoHead` takes `siteName`
  (`og:site_name` and `author` "Pawlegends", no `twitter:site`/`creator`) on every Paw Legends page. Canonicals stay
  (Your call 5). Landing and `/legends`: no Token Tails logo, studio line, "Visit Token Tails", "By Token Tails",
  footer link or "Token Tails mascot"; the Pawlegends wordmark takes the logo's place; the illustration URLs read
  `pawlegends.app`.
- **Legal:** terms drop the "What you can buy" named-cat section (the store and pass section is now "What you can buy";
  earlier buyers keep their version's terms) and name the operator once ("Who runs it": Token Tails MB). Privacy keeps
  "made by Token Tails MB" (controller) and one link to the operator's general policy for the shared account
  (`OPERATOR_PRIVACY_URL`, Your call 3); "your Token Tails profile" reads "your profile"; invite links and the account
  page point at pawlegends.app. Contact addresses unchanged (Your call 6). The consent version numbers were not bumped
  (legal to confirm: the store version governs new purchases).
- **Kept:** tokentails.com/pawlegends still renders the same Paw Legends pages (no site header there either: the
  layout has none). `PAWLEGENDS_EXIT_PATH` (`/game`) stays only as the kill-switch target.

### App (`pawlegends-app/`), backend, docs

- Native host: no `roster` (champion art only); delete dialog "Your sign-in is deleted and your profile is anonymised.
  This cannot be undone."; sign-in fine print "the Pawlegends terms. Privacy: pawlegends.app/privacy".
- Store metadata: the "made by Token Tails" line removed (iOS, Android, Mac); marketing, privacy and support URLs on
  pawlegends.app; reviewer notes drop the card collection and the "Your cats become skins" line. Copyright, bundle id,
  OTA host and contact unchanged.
- Backend: the restore and notify email footer reads "Pawlegends." (links unchanged).
- Docs marked parked: CARD-SKINS.md (card side), GDD.md §7.2, LANDING-PICK-UX.md, CHAT-AVATARS.md §7.4,
  MULTIPLAYER.md D8/D12; README notes in `pawlegends/` and `pawlegends-app/`; `docs/CLIENT.md` host section.

### Left for later (not visible to players)

- The dormant card-skin render kit (`render/skins/registry.ts`, `skinStore`, `cardFx`, `tierCardFx`, `meta/roster.ts`
  parsing, `meta/cardName.ts`, companion views) and the dead CSS of the removed UI (`ui/cards.css`, `lobby.css`).
- `bridge.ts` (game and host) still parses the old messages; removing them needs the shared fixture changed.
- Restore and notify email links use `pawlegendsPublicUrl` (tokentails.com/pawlegends).
- The OTA bundle for the app (`pawlegends-app`, see its README) after the merge.

