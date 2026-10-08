# Submission images

One folder per event. Each folder has its own `README.md` listing every file with its exact size, where it goes in
the form, and the alt text or caption to paste. Every image was rendered from existing repo assets and real
screenshots, checked by eye, and kept under 2 MB. Sources for re-rendering are in each folder's `src/` or `_src/`,
and the shared kit (brand CSS, fonts, logos, screenshots, `render.mjs`) is in `_shared/`.

Reviewed 2026-10-04; mainnet re-render 2026-10-08. Arbitrum Singapore (submitted) and Anitya still show testnet or no chain
claims. Every other set shows only mainnet facts: 9 proof payouts on 7 chains sent by Token Tails (8 with the memo "Token Tails
first payout", 1 Tempo "Catnip Heist campaign"), wallet held by Token Tails until handover. No image claims a player or donor payout. There are no sponsor, prize or chain logos, because none are in the repo and no organiser asked for them.

| Event (deadline) | Folder | Files | Where they go | Still needed from you |
|---|---|---|---|---|
| Arbitrum Open House Singapore (Oct 4 15:59, zone not shown) | `arbitrum-singapore/` | 9: `logo-1024`, `cover-1920x1080`, `cover-1200x630`, `01`–`06` screenshots (receipt, testnet proof, diagram, heist result, Pink Paw cats, payouts page) | Logo → HackQuest logo field. Cover → banner, if the form has one. 01–06 → screenshots, in order | Confirm the deadline zone today. Only the logo field is confirmed. Deploy the working tree first: 01, 02 and 06 come from localhost:3001. `logo.png` (600x337, Sep 29) is an older file, not part of this set |
| Arc Microgrants (Oct 14 23:59 ET, target Oct 7) | `arc-microgrants/` | 6: `01-logo`, `02-cover-1200x630`, `03-architecture`, `04-sponsored-treat`, `05-receipt`, `06-arc-mainnet-payouts` | Logo → avatar. Cover → BUIDL cover. Gallery order: 03, 05, 04, 06 | The image fields weren't captured. Arc mainnet done (Oct 8 re-render). After the first real sponsored treat, add its receipt and drop "treat flow proven on testnet first" from 03 |
| Colosseum World's Fair (Oct 12 23:59 PT) | `colosseum/` | 10: `01-logo`, `01b-graphic-square`, `02-cover` (1920 + 1200), `03`–`05` diagrams and receipts, `06`–`08` screens | 01 → Arena "product logo or graphic" (use 01b if the field says "graphic"). The rest → pitch video, slides, README, X posts | Arena seems to have only one image field. Re-rendered for mainnet Oct 8 (03 `one-contract-seven-mainnets`, 06 `screen-mainnet-payouts`, 08 `screen-tempo-mainnet-receipt`) |
| Tameion Agents Hackathon (Oct 10 23:59 ET), invite only | `tameion/` | 8: `logo-1024`, `cover-1920x1080`, `social-1200x630`, 2 diagrams, `screen-proof`, `screen-code`, `screen-twin` | The form (Google Form) has no image fields, so these are for the ≤3 min demo video (title card, diagrams, stills), the repo README and the share post | The invite. After CappedSpender is on Arc testnet, change the "Testnet deploy pending" chip in `src/agent-limits.html`. The treat-agent Node suite fails 1 of 29 tests (`observe` goal: 50000 vs 90), so the chip now claims only 26/26 forge tests. Fix the test before you cite the Node count |
| Monad Metropolis, Consumer & Payments (Oct 13, zone unverified) | `monad-metropolis/` | 9: `logo-1024`, `cover-1920x1080`, `cover-1200x630`, `01`–`05` screenshots, `06-how-it-works` | Logo, cover, then screenshots 01–06 in order | Log in to hackathon.monad.xyz and confirm the image fields. Monad mainnet receipt in 03 and the covers; 04 is `04-mainnet-payouts`; 01 and 05 retaken Oct 8 (no more "open soon") |
| x402 Foundation impact micro-grant (rolling) | `x402-microgrant/` | 7: `x-card-1600x900`, `x-card-1200x675`, `diagram-x402-flow`, 3 page screenshots (payouts hero, Pink Paw, heist payouts), spare `logo-1024` | X card → the X post (tag @coinbaseDev). Diagram and screenshots → the GitHub issue sections named in the README | It needs a mainnet x402 run first. Then add a terminal screenshot (402 → 200) and the explorer tx, and retake the hero and Pink Paw screenshots, which say "Not handed over yet". `answers.md` promises "a real cat's story and portrait", but the endpoint returns name, image and shelter |
| Anitya World Jam main (Oct 21 22:59) + weeklies (~Oct 7, 14, 21) | `anitya/` | 14: main jam `main-itch-cover-630x500`, `main-world-thumb-1600x900`, `main-shot-1`–`5`, `catnip-heist-square-1024`. Weeklies: `weekly-heist-02`–`07` (1600x900) | itch cover, world thumbnail, itch screenshots 1–5. Discord `#jam-submission`: thumb + map (leave shot 5 out). One weekly image per round | Rename the weekly titles in `src/build.sh` once each theme is announced. Anitya's thumbnail size isn't published. The map shows layout only, so don't call it "playable" until the in-builder AI prompts are tested |
| Team1 Avalanche (rolling, after Oct 21) | `team1-avalanche/` | 9: `01-logo`, `02-cover-1920x1080`, `03-cover-1200x630`, `04-avalanche-mainnet`, `05-how-it-works`, `06`/`07` Avalanche mainnet receipts (desktop, phone), `08-app-landing`, `09-catnip-heist-shelters` | Logo, cover, proof and diagram first. If the form takes a deck: 02, 04, 05, 06 | The form fields weren't captured. `funding/framework/applications/team1-avalanche/draft.md` is still the Tempo/Colosseum text and needs an Avalanche C-Chain rewrite |
| Circle Developer Grants (rolling, after the Arc decision) | `circle-grants/` | 8: `01-logo`, `02-cover-1920x1080`, `03-cover-1200x630`, `04-diagram-agent-flow`, `05-screen-receipt`, `06-screen-proof`, `07-screen-treat`, `08-screen-game` | Logo → avatar. If the form takes few images: 04, 02, 05, 06 | The form fields weren't captured. The agent endpoint is off ("not public yet" chip). `submission.md` still leads with Tempo: align it with the Arc agent-payments angle. 05–08 show Arc mainnet (Oct 8) |

Total: 81 images in 9 sets (counting the older `arbitrum-singapore/logo.png`).

## Fixed in this review

- `tameion/diagram-agent-flow`: "0.01 USDC" was clipped to "0.01 USD" in the budget box.
- `tameion/diagram-agent-limits`: the chip claimed "29 Node tests". Only 28 of 29 pass today, so it now says "CappedSpender: 26/26 forge tests pass" (verified with `forge test`).
- `circle-grants/02` and `03` covers: the screenshot was cropped mid-word ("6 TESTNETS", "hUSD"). They now use the full-width proof crop, with the Arc card readable.
- `monad-metropolis/01`: the Retry and Menu buttons were cut in half. The whole results panel now shows.
- `monad-metropolis` covers: changed "a USDC treat goes to a real cat shelter" (present tense, while the live page says "opens soon") to "Running on testnet now".
- `arbitrum-singapore/01`: the headline "1 USDC to Pink Paw" now says "1 test USDC".
- `arbitrum-singapore/03`: "Who pays" claimed sponsored game treats on Arbitrum, but the network picker shows Arbitrum as "Not open yet". It now says the test payouts came from Token Tails' own wallet, and that sponsored treats run on Arc testnet first.
- `arc-microgrants/06`: "15 USDC payouts" could be read as 15 USDC paid. It now says "15 test payouts … 1.77 test USDC in total".
- `x402-microgrant/x-card` (both sizes): "One HTTP request" was wrong (the flow is GET → 402 → retry with payment). It now says "Ask, get a 402, retry with payment."
- `anitya/` weeklies and covers: the Cat Paw font swallowed word spaces ("TheCounting"). Word spacing is widened and every image re-rendered.
- `anitya/main-shot-2`: the corner logo covered a guard dog and crates, so it moved to the empty top-right.

## Facts checked against the source

- 73/73 Foundry tests: the ShelterSplit suites (32 + 20 + 3 + 17 + 1) all pass on `forge test` today.
- The Arc testnet ShelterSplit `preview()` pays 100% to Pink Paw's wallet, so "the whole price goes to shelter wallets" holds.
- The Arbitrum Sepolia ShelterSplit token is Circle's Arbitrum Sepolia USDC.
- Sponsored treats are gated on a verified email, an account at least 24 h old and one treat a day (`shelter-onchain.controller.ts`).
- The x402 memo nonce expires after 600 s ("expires in 10 minutes").
- The heist-08 manifest has 5 guards and 26 catnip coins. The weekly dog counts match the manifest.

## Before any upload

- Screenshots from `localhost:3001` show pages that exist only in the working tree (the testnet proof section, the network picker, receipts). Deploy them to tokentails.com first, or describe them as the next release.
- The testnet counts (49 payouts on 10 contracts; Arc 14–15) were captured on Oct 4 and grow with each new test payout. Re-render before submitting if they matter.
