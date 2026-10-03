# Revenue Kickstart: What to Build First

Token Tails MB. Checked 2026-09-30. Planning note, not legal or tax advice.
Tags: (E) is evidence (a path or a dated URL). (J) is judgment. D1 is 2026-10-01.

## 1. Bottom line

**#1 bet: a "Rainbow Bridge" pet memorial portrait on Etsy, digital only.**
- The buyer sends 1–3 photos of a cat or dog that has died.
- We deliver a painterly memorial portrait with the pet's name, dates and a short tribute, within 3–5 days.
- Prices are $24.99 and $34.99.

Why this one:
- **Proven demand.** Etsy memorial listings show 10k+ sales each (E, listings cited in §9; the skeptic could not re-fetch them, they returned 403).
- **Built-in buyers and a seasonal peak.** Q4 sympathy and Christmas gifting is starting now (J).
- **Buyers care less about price** than in generic portraits (J).
- **Most of the pipeline exists.** It reuses the Gemini portrait generator we already have (E, `backend/src/shared/utils/ai-portrait.ts`, `docs/BACKEND.md` L248).
- **No dependency on the unconfirmed sprite licences.**
- **Etsy is merchant of record** for digital sales (E, Etsy VAT help page).

**Two cheap parallel bets:**
1. **Pixel Cats asset packs on itch.io.** The fastest cash we have, as a probe and follower funnel. It is not a real revenue line.
2. **A Fiverr "your pet as a pixel game sprite" gig at $10–99.** It starts only after the sprite IP gate closes.

**When the first € arrives (J):**

| Bet | First sale | First € in the bank | Why the lag |
|---|---|---|---|
| itch.io packs | about Oct 10–21 | about Oct 25–Nov 4 | 7-day availability plus 10–14 day payout review (E, itch.io payments docs) |
| Etsy memorial | about Oct 15–30 | about Nov 5–20 | 14–20 day deposit delay for new shops, possible reserve (E) |
| Fiverr gig | — | about D35–45 | 14-day clearance for new sellers (E) |

**90-day expectation (J):** €300–1,500 gross across all three. That is a first € and a learning signal, not a business yet. Only the memorial bet can plausibly grow beyond that.

## 2. Why current products have no revenue

- **The buyers were airdrop farmers.** The 542k users and 307.6k MAU peak came from the SEI/airdrop era (E, `extra/traction.md`). Those users came for tokens, not to buy things (J).
- **We sell only on our own site, with no traffic.** Portraits ($6/$49/$69) and packs sell through Stripe Checkout on our own domain (E, `backend/src/payments/price-table.ts`). No marketplace, store listing or search channel brings buyers to them (J).
- **The prices don't work.**
  - The $6 portrait loses money once fees and VAT are paid (J).
  - The Legendary pack charges $350 but the client shows $400 (E, price table vs client).
  - Print is not wired: `PrintifyService` is never injected (E, `docs/HISTORY.md`).
- **Regulation blocks promotion.** $TAILS, the TGE countdown (2026-11-19), custodial wallets and loot-box odds carry MiCA/CASP exposure (E, `funding/PLAN.md` L19–28). They have to be stripped before any app-store or portal push (J).
- **Products aren't finished for real buyers.**
  - Catnip Heist has no human playtests or telemetry, about 16k lines of unreviewed agent code, and an icon that "reads as cannabis" (E, `docs/plans/catnip-heist-strategy.md` §2).
  - Asset licences are unconfirmed (E, same doc L34).

## 3. Ranked options

| # | Option | Channel | Price | Days to first € in bank (J) | 90-day € (J) | Effort | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Rainbow Bridge memorial portrait, digital | Etsy | $24.99 / $34.99 | 35–50 | €200–900 gross | 1 agent-day + 0.5 human day, then 25–40 min per order | **GO, #1** |
| 2 | Pixel Cats asset packs | itch.io | free / $2.99 PWYW / $9.99 | 25–35 | €30–250 | 1 agent-day + 3 h | **GO, probe** |
| 3 | Pet as pixel game sprite gig | Fiverr | $10 / $40 / $99 | 35–45 | €0–500 | Pipeline + fast replies | **GO after IP gate** |
| 4 | Playable-ad single + 3 variants | Upwork | €250–450 | ≥45 | €0–700 | 3–4 days portfolio | **HOLD.** Probe only if there is capacity after D14. The solver is Heist-only (E, `catnip-heist/tools/solver.ts`), there is no match-3 code, and AI tools are commoditising playables (E, layer.ai, makeitplayable.com) |
| 5 | AI ad-creative packs | Fiverr / cold email | €99–199 | ≥40 | €0–500 | 2–3 days to adapt ai-ugc | **KILL.** Meta's free image-to-video tool (E), $10–60 gigs (E), and the tool is not built for per-client orders |
| 6 | Twitch/Discord cat emotes | Etsy | $12.99–39.99 | 35–60 | −€150 to +€300 | New face art for every order | **KILL.** 48 px full-body sprites don't make legible 28 px emotes (E, `cat-assets/cats/*.png`) |
| 7 | Portrait posters and framed prints (POD) | Etsy + Printify | $49.99–79.99 | — | — | Low | **DEFER** until the accountant confirms VAT/OSS on physical intra-EU sales (E, bontello.com) |
| 8 | Voxel pets pack / voxeliser tool | Fab, Unity | $14.99+ | 60+ | ~€0 in the window | Medium | **DEFER.** 60-day new-seller hold, $100 minimum (E, Fab), unreviewed code, licence conflict |
| 9 | Catnip Heist | CrazyGames / Poki | Revenue share | 45–60+ | €0–300/mo | Playtests + icon | **DEFER.** Builds an audience, not near-term revenue (E, strategy doc) |
| 10 | Shelter revenue-share portraits | Shelter audiences | — | — | — | Agreements needed | **LATER**, as a Pink Paw pilot on #1's pipeline |
| 11 | Grant red-team reviews | Upwork | €300–800 | 30–60 | €0–800 | Trust-gated | **Opportunistic only.** Our own win record is thin |
| 12 | Advergames, agent consulting, level-design automation | Outbound | €2–5k | 60+ | — | High | **KILL.** No built-in buyers |
| 13 | Steam, Kickstarter, Roblox, Shopify/Chrome/GPT stores, AppSumo, Notion/Canva | Various | — | Months | ~0 | — | **KILL.** Too slow or need an audience (E, marketplaces research) |
| 14 | IAP/ads in the existing app, cat packs | App stores | $5–350 | — | — | Strip crypto first | **KILL for now.** MiCA/CASP, loot-box odds, price bug |

## 4. The #1 bet in detail

### Product

A custom "Rainbow Bridge" memorial for a cat or dog.
- **Input:** 1–3 photos from the buyer.
- **Output:** a 4K painterly portrait with a soft rainbow/meadow scene and the pet's name and dates.
- **Tribute:** 60 words, drafted by the existing OpenAI story step and edited by a human.
- **Files:** print-ready (8x10, A4, 12x16 at 300 dpi) plus a phone wallpaper.
- **Later add-on:** a pixel-angel animated keepsake (+$10). It uses the angel/aureola/wings layers (E, `cat-assets/aserprite/Enchantments.aseprite`) and ships only after the sprite IP assignment is signed.

### Pricing

| SKU | Price | Net after fees (J) |
|---|---|---|
| Memorial portrait, digital, print-ready files | $24.99 | about $21.5 |
| Portrait + edited tribute card + wallpaper + 2 background choices | $34.99 | about $30.5 |

- Gemini costs about $1 per order for 4 variants (J).
- No $6 tier. No physical SKUs in v1.

### Listing copy outline

- **Title:** "Custom Pet Memorial Portrait from Photo | Rainbow Bridge Cat & Dog Painting | Pet Loss Sympathy Gift | Printable Digital File"
- **First image:** a real finished output of a team-owned or consented pet, before and after.
- **Images 2–6:** a cat example, a dog example, the tribute card, the wall mockup, and "how it works" in 3 steps.
- **Description order:**
  1. What you get.
  2. How to order: photos through personalisation or Messages, plus the pet's name and dates.
  3. Delivery in 3–5 days.
  4. One free remake. No refund after the digital file is delivered.
  5. Printing tips.
- **AI disclosure,** word for word: "Made by our studio with AI image tools using our own prompts; every portrait is selected, checked and finished by a person." Classify the item as "Designed by".
- **13 tags:** pet memorial, rainbow bridge, pet loss gift, cat memorial, dog memorial, sympathy gift, custom pet portrait, pet portrait from photo, in memory of pet, printable memorial, pet remembrance, loss of cat, loss of dog.
- **Listings:** publish 5 of the same product with different keyword angles (cat, dog, sympathy gift, bundle, Christmas memorial) at $0.20 each.

### What to build (reuse)

- **Fulfilment CLI, internal only.**
  - Calls `generatePortraitForImage` with a billed Gemini key.
  - Adds a new "rainbow-bridge" prompt. The current styles are highness, monarch, aristocrat and commander (E, `docs/BACKEND.md` L248).
  - Outputs 4 variants, the tribute draft, the name/dates typography overlay and the export sizes.
  - Do not add the style to the public API or the Stripe price table.
  - Never route orders through `POST /image/portrait`, which is still public paid generation (E, `docs/BACKEND.md` known issues). **Report that to the founder. Do not fix it silently.**
- **Order tracker:** a spreadsheet outside the repo, because buyer photos are personal data.
- **Message templates:** order received, draft ready, delivered with a review request (one polite ask), remake.

### Agents vs humans

- **Agents:**
  - Prompt iteration and variant grids.
  - Overlay and export scripts.
  - 8 example mockups.
  - Listing copy, tags and FAQ.
  - Message templates.
  - First pass of the tribute draft.
  - A daily metrics digest.
- **Humans:**
  - Etsy shop setup and identity verification, and the accountant question.
  - Collecting consented pet photos.
  - Scoring likeness and tone.
  - Choosing 1 of the 4 variants for every order.
  - Editing the tribute.
  - Every buyer message. Grieving buyers get a human reply.

### 30-day plan

**Week 1 (daily tasks):**
- **D1, Thu Oct 1.** Human: open the Etsy shop (LT, Etsy Payments, $15–29 setup), start verification, and email the accountant the VAT question (§7). Human: ask 10–20 friends or Pink Paw volunteers for pet photos with written consent. Agent: CLI skeleton and prompt v1.
- **D2.** Agent: run v1 on the consented photos and produce a 4-up grid for each pet. Human: score each output 1–5 for likeness and tone (30 min).
- **D3.** Agent: prompt v2/v3 (colour of the rainbow light, keep markings accurate, no halo clichés), tribute template, overlay fonts limited to OFL fonts (E, `cat-assets/fonts` holds bebas-neue and nunito). Human: pick the final style.
- **D4.** Agent: 8 example images, 5 listing drafts, FAQ, remake policy, message templates. Human: tone review (1 h).
- **D5.** Human: publish 5 listings, opt out of Offsite Ads, set up processing-time and personalisation fields.
- **D6.** Dry run: an internal fake order, end to end. Time it with a target of 40 minutes or less. **No shill purchases.**
- **D7.** Fix whatever the dry run exposed. Agent: start the daily digest of views, favourites, orders and messages.

**Week 2.** Add 3–5 more keyword-angle listings. Answer messages within 4 h in EU daytime. Once there are at least 8 listings and the first favourites, turn on Etsy Ads at $3/day.

**Week 3.** Add the Q4 hooks: a "First Christmas without you" printable memorial listing and a sympathy-gift bundle. Politely ask for a review after each delivery.

**Week 4.** If the IP assignment is signed, add the pixel-angel add-on. Run the D30 gate.

### Success metrics and gates

- **D14:**
  - **Continue** if there are 300+ views, 10+ favourites and 1+ order.
  - Under 300 views means the problem is search, not the product: rewrite titles, tags and thumbnails.
  - Good views but no order means changing the first image and price ($19.99 test).
- **D30:**
  - **Continue into Q4 and raise ads to $5/day** if there are 3+ orders, the rating is 4.8 or higher, and human time is 40 minutes per order or less.
  - **Kill** if there is no order after 1,500 views or 30 days of ads, or if human time is over 60 minutes per order.

## 5. Parallel bets (short plans)

### itch.io Pixel Cats (probe)

- **Gate first:**
  - A signed IP assignment from the contributor who authored 26 of the 50 `cat-assets` commits, including every character commit (E, git log).
  - A check of any NFT-holder terms.
  - Exclude `memes/` (the `pudgy*` files, likely Pudgy Penguins IP), `prepared-nft-bg/` and any font that is not OFL.
- **SKUs:**
  - Free 3-cat sampler.
  - "All Cats" at pay-what-you-want, $2.99 minimum, $6.99 suggested.
  - Hats and accessories at $2.99.
  - A $9.99 bundle that includes the Aseprite sources.
- **Honest copy:** "59 colour variants of 5 hand-drawn cats + accessory layers, NFT-free commercial licence." Never say "58 breeds" (E: 5 base sets plus colormaps).
- **Settings:** "itch.io collects payments" mode, so itch is merchant of record and handles EU VAT (E). Complete the tax interview on D1.
- **Effort:** agents do 1 day of packaging (GIF previews, a 630x500 cover, LICENSE.txt). A human spends 3 h uploading.
- **Voxel SKU:** only after the first paid sale and a human review of the GLB export.
- **Kill:** fewer than 100 sampler downloads by D21 means reworking the covers and tags once, then stopping.

### Fiverr pixel-pet gig

- **Starts after the same IP gate.**
- **Packages:**
  - Basic $10: 1 static 48 px sprite plus a 1-animation GIF, with markings touched up by hand.
  - Standard $40: 4 animations.
  - Premium $99: 10 animations plus a GLB plus a 1-level web mini-game. Offer it only once there are reviews.
- **Pipeline:** the vision coat classifier (E, `backend/src/shared/utils/ai.utils.ts` ~L180–215) feeds `changeSpriteColors.js`, then an Aseprite touch-up.
- **Getting orders:** pitch 5 Briefs a day during the 7–14 day new-gig boost. Deliver every piece as custom work (Fiverr bans mass-produced AI content, E).
- **Kill:** 0 orders by D28 at $10, or touch-up time averaging over 45 minutes.

## 6. What NOT to do now

- **No pushes of the store app, IAP or packs** until $TAILS, the TGE, custodial wallets and loot-box odds are stripped. The MiCA white-paper deadline is about 2026-10-21 (E, `funding/PLAN.md`).
- **No Twitch emotes, AI UGC agency or playable-ad pillar.** They are commoditised or don't fit the assets (see §3).
- **No Printify physical SKUs** until the VAT/OSS position is confirmed.
- **No Fab, Unity Asset Store, Steam or Heist portal launch in October.** Cash takes 60+ days, or the product has blockers.
- **No paid traffic to our own Stripe site.** It puts OSS on the MB, and `POST /image/portrait` is open.
- **No Telegram, token or crypto framing** anywhere in listings.
- **No shill purchases or fake reviews** on any platform.

## 7. Legal/IP/tax checklist (not legal advice)

- [ ] **Sprite IP.** Get a written assignment or licence to the MB from the sprite artist for the cats, hats and enchantments. Check the NFT sale terms for holder rights. Add a LICENSE/provenance file to `cat-assets` (E: none exists).
- [ ] **Third-party content.** Exclude `memes/pudgy*`, NFT backgrounds and any non-OFL fonts. Confirm the licence of the Cat Paw font before using it anywhere.
- [ ] **Root licence.** The root is "all rights reserved" while `contracts/LICENSE` and `shelter-rail/` are MIT. Resolve this before selling any code or tools (E, `COMMERCIAL_LICENSE.md`, `docs/CONTRACTS.md`).
- [ ] **Gemini output.** Output is owned by the customer and commercial use is allowed. Use only a billed key when serving EEA users (E, ai.google.dev/gemini-api/terms).
- [ ] **AI rules by platform:**
  - Etsy: disclose AI in the description, classify as "Designed by", make the first image a real output (E, seller handbook).
  - itch.io: the generative-AI tag is mandatory if AI was used. Leave it unchecked only if the art is fully hand-drawn (E).
  - Fiverr: must own all delivered rights, work must be custom per client, no mass-produced AI content (E).
- [ ] **Buyer photos (GDPR).** Keep them only as long as fulfilment needs (delete after 30 days). Use them for marketing only with explicit consent. Keep them out of git.
- [ ] **EU VAT/OSS:**
  - Etsy collects VAT on digital items delivered by automatic download (E). Ask the accountant whether a custom file delivered afterwards counts. If not, the MB owes VAT in each buyer's country and needs OSS registration.
  - itch in "collects payments" mode is merchant of record (E).
  - Fiverr pays the MB as a service provider; book it as service income (J; confirm).
  - Physical POD: the MB carries intra-EU VAT itself (E).
- [ ] **MB invoicing.** Record each platform payout gross, with the platform fees as expenses. Keep platform statements as supporting documents. Use reverse-charge invoices for any EU B2B client work.
- [ ] **Consumer law.** For digital content, get the buyer's explicit consent to delivery that waives the 14-day withdrawal right. The remake-not-refund policy relies on it (J; confirm the wording).

## 8. How it feeds Token Tails and the shelter mission

- **Shelter pilot.** The memorial pipeline becomes the fulfilment engine for a "portrait of your adopted cat" pilot with Pink Paw. After D30, a fixed share per order (for example €1) could go to Pink Paw, with published receipts. Only claim it once it is real (J).
- **Developer funnel.** itch followers and Fiverr buyers are a first non-airdrop audience. Premium Fiverr mini-games and the voxel SKU showcase the Heist engine ahead of a CrazyGames launch (J).
- **Cash for the clean-up.** Revenue pays for stripping the crypto features from the app. That unlocks app-store and portal distribution for the 5-mode game in 2027 (J).
- **Reusable learning.** Buyer data (which styles, species and price points sell) carries over to the $6/$49/$69 portrait product. Reprice or retire it on that evidence (J).

## 9. Sources (retrieved 2026-09-30 unless dated)

- **Repo:** `docs/BACKEND.md` (L248, known issues), `docs/API.md:188-198`, `backend/src/payments/price-table.ts`, `docs/HISTORY.md`, `funding/PLAN.md` L19–28, `docs/plans/catnip-heist-strategy.md` L28–34, `extra/traction.md`, `cat-assets/` (ls, git log), `catnip-heist/tools/solver.ts`, `backend/src/shared/utils/ai.utils.ts`, `/Users/zygimantasbagdzevicius/me/apps/ai-ugc/README.md`
- **Etsy:**
  - AI rules: https://www.etsy.com/seller-handbook/article/1275449912004 ; https://www.listadum.com/blog/etsy-creativity-standards (2026)
  - VAT on digital items: https://help.etsy.com/hc/en-gb/articles/115015587567-How-VAT-Works-on-Digital-Items
  - Fees: https://help.etsy.com/hc/en-us/articles/115015710408 ; https://craftybase.com/blog/the-complete-guide-to-etsy-fees
  - New-shop holds: https://www.insightagent.app/guides/etsy-payment-holds-new-sellers-guide
  - Memorial listings: https://www.etsy.com/listing/512914422 ; https://www.etsy.com/listing/1508185829
  - Conversion benchmarks: https://www.insightagent.app/guides/etsy-conversion-rate-benchmarks
- **EU VAT for EU-based Etsy sellers:** https://www.bontello.com/en/blog/eu-vat-etsy-sellers-2026
- **Gemini terms:** https://ai.google.dev/gemini-api/terms
- **Memorial market size:** https://www.globenewswire.com/news-release/2026/01/16/3220372/28124/en/ (2026-01-16)
- **itch.io:** https://itch.io/docs/creators/payments ; https://toffeecraft.itch.io/cat-pixel-mega-pack ; https://itch.io/game-assets/top-sellers/tag-cats ; https://seethingswarm.itch.io/catset
- **Fiverr:** https://help.fiverr.com/hc/en-us/articles/37333301560593 ; https://fiverrtutorials.com/fiverr-payment-process ; https://hustlespire.com/how-long-to-get-orders-on-fiverr/ ; https://www.fiverr.com/alt5665/create-pixel-art-of-your-pet
- **Playables:** https://www.ludaxis.io/blog/playable-ads-2026 (2026-09-21) ; https://layer.ai/features/playable-generation ; https://makeitplayable.com/
- **Meta free image-to-video ads:** https://www.1clickreport.com/blog/meta-image-to-video-ads-2026-guide
- **Fab payouts:** https://www.fab.com/o/become-a-publisher ; https://www.strayspark.studio/blog/fab-marketplace-12-month-retrospective-seller-2026 (2026-04-17)
- **CrazyGames and Poki terms:** https://app.cinevva.com/guides/publish-game-crazygames
