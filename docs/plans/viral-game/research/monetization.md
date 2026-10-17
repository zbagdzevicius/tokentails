# Monetization research: ARR/MRR for a small-team web game (Oct 15, 2026)

Lens: how small teams and solo builders make recurring or repeat revenue from web and indie games in 2024–2026,
and what that means for a Token Tails web game that has to bring in its own audience.

Rules used here: numbers are quoted with their source. Where a source is a secondary aggregator or a vendor blog,
it is marked **(secondary)** or **(low confidence)**. "Unknown" means no source gave the number.

---

## 1. Case studies with real numbers

### 1.1 fly.pieter.com (Pieter Levels, Feb 2025): sponsorship ads in a 3D browser game

| Fact | Number | Source |
|---|---|---|
| Build time | ~3 h (first version "30 minutes"), Cursor + Claude Sonnet 3.7, three.js | [vgtimes](https://vgtimes.com/tech-and-hardware/122582-dutch-startup-founder-creates-game-using-ai-in-180-minutes-and-earns-87000-in-one-month.html), [dev.to](https://dev.to/promptway/he-built-a-flight-simulator-in-three-hours-and-hit-1m-a-year-in-17-days-then-it-went-to-zero-1b1l) |
| Launch | Feb 28, 2025 (vgtimes); Feb 2025 | same |
| MRR day 13 | $67,000 | [nichesitegrowth](https://nichesitegrowth.beehiiv.com/p/67k-mo-from-an-ai-coded-game), dev.to |
| MRR day 17 | $87,000 ("$1M ARR") | dev.to, vgtimes |
| 404 Media (Mar 5, 2025) | "more than $50,000 a month" | [404media](https://404media.co/this-game-created-by-ai-vibe-coding-makes-50-000-a-month-yours-probably-wont) |
| Revenue mix (early) | ~$52k/mo from 22 ads "at various prices"; $360 from 12 jets at $29.99 | [search summary of xataka / 404media](https://www.xatakamovil.com/futuro/este-juego-ridiculamente-simple-le-esta-dando-a-su-creador-50-000-dolares-al-mes-se-hizo-ia-30-minutos) (secondary) |
| Ad prices | $5,000/month in-game ad slot; branded blimp ~$1,000/week | nichesitegrowth; vgtimes |
| F-16 upgrade | $29.99; 9 sold in first 7 days | vgtimes |
| Players | 320,000 users in 30 days; 15,000+ per day | vgtimes; nichesitegrowth |
| Distribution | Levels' ~625K X followers + Elon Musk repost (Mar 12, 2025) | nichesitegrowth; vgtimes |
| Mid-2026 | **$0/month** listed in his X bio; "once the viral moment passed and the ad slots lapsed, the money left with the attention" | [dev.to](https://dev.to/promptway/he-built-a-flight-simulator-in-three-hours-and-hit-1m-a-year-in-17-days-then-it-went-to-zero-1b1l) |

**Reading.** 95%+ of the money was B2B: founders and startups buying billboards/blimps to be seen by Levels'
X audience watching the game. It was "MRR" only in the sense of monthly ad contracts; it was attention rental
and decayed to zero. Player purchases were negligible (12 jets ≈ $360). The model works only while the game
itself is a media event. A spin-off, "Vibe Sail", reached $2,700 MRR in 8 days (nichesitegrowth) — the model
shrinks fast without the founder's follower count.

**For us:** sponsorship slots are a launch-spike tool, not ARR. With ~0 audience, no brand pays for a billboard
until the game has proof of attention. But the *mechanic* (a visible, buyable spot in the world, shown in every
clip players post) is cheap to build and transfers well to "sponsor a shelter cat" / "your brand on the cat
tree" slots priced for small pet brands. Make it self-serve (Stripe link) so any viral spike converts on its own.

### 1.2 Shell Shockers (Blue Wizard Digital): long-lived browser .io shooter

| Fact | Number | Source |
|---|---|---|
| Revenue | "low seven figures annually", almost all from the web version | [GameDiscoverCo deep dive](https://newsletter.gamediscover.co/p/deep-dive-shell-shockers-multi-million) |
| Mix | "approximately 80–90% ad driven"; rest = cosmetics (hats, weapon skins) + VIP subscription | same |
| VIP ("Very Important Poultry") | removes ads + non-competitive cosmetic bonuses; price not disclosed | same |
| Peak DAU | 300k–350k | same |
| Audience | mostly 10–15 years old; 51% Windows, 39% Chromebook, 10% mobile; 47.6% US | same |
| Lifetime players | 200 million | [Wikipedia](https://en.wikipedia.org/wiki/Blue_Wizard_Digital) |
| Discovery | "no press, limited influencers"; face-to-face (classroom) virality | GameDiscoverCo |

**Reading.** Durable seven figures from a web game is real, but at ~300k DAU and with ads doing most of the
work. Ad revenue scales with DAU; it does not need a whale. Subscription = ad removal + cosmetics.

### 1.3 Krunker.io, Bloxd.io: portal-native web games

- Krunker: 200M+ unique players at acquisition by FRVR (May 12, 2022); price undisclosed; economy of "thousands
  of skins and items to unlock, sell and trade"; revenue = IAP + ads ([GamesBeat](https://gamesbeat.com/frvr-acquires-free-to-play-shooter-krunker-io/),
  [Game Developer](https://www.gamedeveloper.com/press-release/frvr-acquires-popular-free-to-play-shooter-krunkerio)). Revenue: unknown.
- Bloxd.io: 11–15M monthly players, 580k daily players, 14.3k average CCU (Jul 16, 2025), "#1 game on game
  portals over the last 2 years", self-funded and profitable with 8–11 people; UGC ("editable worlds in 5 lines
  of code") ([Bloxd role info](https://hot-telephone-d14.notion.site/Bloxd-Software-Engineer-Role-Info-5867626632054bc9ab095b20cc30837f),
  [builtinlondon](https://builtinlondon.uk/company/bloxd)). Revenue: unknown.

**Reading.** The proven web path to sustained revenue is portal distribution (CrazyGames, Poki) + ads + cosmetic
IAP, with UGC/social multiplayer keeping retention. Note Bloxd is UGC-first — the closest web analogue to a
"tool that brings audience in".

### 1.4 Portal economics (CrazyGames, Poki, others)

| Platform | Developer share | Scale | Source |
|---|---|---|---|
| CrazyGames | 60% ads, 70% in-game purchases (Xsolla) | 35M MAU | [cinevva guide](https://app.cinevva.com/guides/web-game-monetization) (secondary) |
| Poki | 50% ads (100% on own traffic) | 60M MAU, 1B+ monthly plays | same |
| Playgama Bridge | 80% | – | same |
| GameDistribution | 33% | 4,000+ portals | same |

- Rewarded-video eCPM: US $15–28, EU $8–15, tier-3 $1–3 (Playgama 2026 via cinevva, **secondary**).
- One developer's real data: ~€1.20 per 1,000 plays across 8 WebGL titles on CrazyGames (451,327 plays = €556.92), older games (cinevva, secondary).
- "A well-performing casual game on a major portal lands somewhere in the $200 to $2,000 a month middle"; top Poki studios "up to €1 million a year" (cinevva, secondary).
- CrazyGames + Xsolla Pay: +15–20% conversion and +60% average order value; 70% of Xsolla Pay users made monthly repeat transactions ([Xsolla partner spotlight](https://xsolla.com/partner-spotlight/crazygames-improves-conversion-with-xsolla-pay), vendor source).

**Reading.** Ads alone at €1–3 per 1,000 plays need millions of plays a month to matter. Portals are a
distribution channel (free traffic) more than a revenue engine for us — and the CrazyGames/Poki SDKs restrict
outbound links and own the checkout, which collides with our Stripe + shelter-share checkout. Use a portal
build as a funnel, keep the money flows on tokentails.com.

### 1.5 Social cosmetics games (non-web, but the model we would copy)

- **Gorilla Tag** (VR, Another Axiom): >$100M revenue, "primarily through in-game cosmetics which allow for
  try-ons and a social shopping experience"; 10M lifetime players, 3M MAU, 1M DAU, ~60 min average session
  ([Road to VR](https://www.roadtovr.com/how-gorilla-tag-became-a-100-million-vr-success/)). Started as a solo dev's
  early-access game (2021). Key: cosmetics are seen by others in social play, and you can try them on in front of friends.
- **Grow a Garden** (Roblox, 2025): built in days by a 16-year-old; $12M of item sales in May 2025 alone; peak
  ~22M concurrent players (Aug 23, 2025) ([Wikipedia](https://en.wikipedia.org/wiki/Grow_a_Garden), [Calcalist](https://www.calcalistech.com/ctechnews/article/dj4lxef8r)).
  Mechanic: collectible/rare items (seeds, rare pets), trading, timed events, social flexing.
- **PEAK** (Steam, Landfill + Aggro Crab, Jun 16 2025): $5–8 price, 1M copies week 1, 10M+ by mid-August 2025
  (Alinea estimate); viral TikTok clips (e.g. one clip 3.6M views in 10 days); daily-rotating map; built in ~4
  months from a jam ([Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/from-game-jam-to-10-million-units-indie-hit-peak-success),
  [Know Your Meme](https://knowyourmeme.com/memes/subcultures/peak-video-game)). Revenue implied ≈ $50M+ gross (estimate, not reported).

**Reading.** The 2025 viral winners monetized *the clip-generating social moment*: friends failing together
(PEAK), flexing rare collectibles (Grow a Garden), and visible cosmetics (Gorilla Tag). None of them needed an
audience at launch; the game produced the content that brought the audience.

### 1.6 UGC creator economies (platform scale, for rev-share design)

- Roblox DevEx: ~$1.5B paid to creators in 2025, up from $922.8M in 2024; DevEx rate +8.5% from Sep 5, 2025;
  top 10 creators averaged $33.9M (statista / Respawn, **secondary**; primary: [Roblox 10-K FY2025](https://www.sec.gov/Archives/edgar/data/1315098/000131509826000024/rblx-20251231.htm), not opened).
- Fortnite UEFN: $722M paid to island creators as of Sep 2025; $1B by Jun 2026; engagement pool = 40% of net
  Item Shop revenue; creators get 75% of a new/lapsed player's pool contribution for 6 months
  ([Tubefilter](https://www.tubefilter.com/2026/06/17/epic-games-unreal-editor-for-fortnite-creator-payouts/), [Fortnite news](https://www.fortnite.com/news/fortnite-developers-will-soon-be-able-to-sell-in-game-items)).
- Fortnite Support-A-Creator: 5% of a referred player's spend goes to the creator; Epic absorbs it as a marketing
  cost; open to everyone; $100 minimum payout ([Sportskeeda](https://www.sportskeeda.com/fortnite/news-epic-games-removed-requirement-fortnite-s-creator-program),
  [Epic help](https://www.epicgames.com/help/c-34406160/a19029301)).

**Reading.** The biggest platforms pay creators *for bringing players* (Epic's 75% new-player bonus, 5% creator
codes). For a zero-audience game this is the cheapest acquisition channel: pay TikTok/X micro-creators a revenue
share on players they bring, instead of ad spend.

### 1.7 Animal-cause games

- Children of Morta "Paws and Claws" DLC: 100% of profits donated; £546,000 raised for Humane World for Animals
  since 2020 ([Humane World](https://www.humaneworld.org/en/gamers-raise-half-million-animal-rescue)).
- King's Pet Rescue Saga ran a 4-week Battersea campaign where community targets unlocked real donations
  (same search; secondary).
- Stray-driven shelter fundraisers: one shelter raised $7,000 in a week via a raffle (local news, secondary).

**Reading.** A cause DLC/pack sells modestly but steadily and gives press a story. The community-target
mechanic ("if players hit X, a real cat gets Y") is a proven, free social hook.

---

## 2. Model-by-model evidence

| Model | Evidence | Typical numbers | Confidence |
|---|---|---|---|
| In-world sponsorship / billboards | fly.pieter.com | $5k/mo slot, ~$1k/week blimp; $87k MRR peak → $0 by mid-2026 | high (multiple sources), but spiky |
| Programmatic ads (portals, rewarded video) | Shell Shockers 80–90% ads; portal shares | €1–3 per 1k plays; rewarded eCPM US $15–28 | medium (secondary) |
| Intrinsic in-game ads (Anzu, now on web via Playgama) | [GamesBeat](https://gamesbeat.com/playgama-and-anzu-bring-real-world-ads-to-web-games/) | Anzu aCPM $4.01 vs video $9.67 ([gamedevreports](https://gamedevreports.substack.com/p/anzu-intrinsic-in-game-advertising?open=false)) | medium |
| Cosmetics (social, visible) | Gorilla Tag $100M+, Krunker, Shell Shockers | payer share unknown per title | high for model, unknown for conversion |
| Subscription / VIP | Shell Shockers VIP; "subscribers spend 2x" (Nielsen SuperData via [Xsolla](https://xsolla.com/blog/monetizing-your-browser-based-game-via-subscriptions)) | price/conversion not disclosed | low |
| Battle/season pass | aggregators: 8–20% of actives buy vs 1–5% for single IAP; ESA 2026: 26% of US players 8+ have bought a pass ([voxbooster](https://voxbooster.com/blog/battle-pass-statistics-2026/), [shanethegamer](https://www.shanethegamer.com/research/battle-pass-statistics/)) | – | **low** (aggregators, unclear methodology) |
| Generic F2P payer conversion | 2–5% typical; range <1% to ~17%; old (2014–2016) data ([GamesBrief](https://www.gamesbrief.com/2014/03/gamesbriefers-are-mobile-conversion-rates-really-this-low/), [Shacknews](https://shacknews.com/article/83318/study-only-15-of-f2p-customers-buy-in-app-purchases)) | 2–5% | medium (old) |
| Cheap premium + social virality | PEAK $5–8, 10M units | – | high |
| Creator rev share / codes | Fortnite 5%, UEFN 40% pool | – | high |
| Patreon / supporter | anecdotes $4k–56k/mo for some indie devs; median Steam indie earned $249 in 2025 ([fungies](https://fungies.io/indie-developer-market-2026-complete-analysis-data-trends-forecasts-2/)) | – | low (anecdotal) |
| Discord Activities | open to all devs since Sep 2024; Discord takes 10% of SDK commerce; durable/consumable SKUs + subscriptions; US/UK/EU desktop; $100 to qualify; >25% of Discord MAU use Activities ([Gigazine](https://gigazine.net/gsc_news/en/20240927-discord-new-monetization-feature), [Phaser tutorial](https://phaser.io/tutorials/how-to-monetize-your-discord-activity-application)) | per-title revenue unknown | medium |

## 3. Payments: web checkout vs app stores

- Stripe standard fee 2.9% + $0.30 vs up to 30% app-store commission ([RevenueCat](https://www.revenuecat.com/blog/engineering/can-you-use-stripe-for-in-app-purchases)).
- Epic v. Apple: Apr 30, 2025 ruling + Dec 2025 appeal decision let US iOS apps link to external web checkout with
  no Apple commission pending a final determination ([Adapty](https://adapty.io/blog/can-you-use-stripe-for-in-app-purchases/), secondary). EU/other regions differ; check before relying on it.
- Bain Gaming Report 2026: nearly half of 5,300+ surveyed players bought from a developer's web store in the past
  12 months, 27% multiple times; 40% of 13–17-year-olds made multiple direct purchases; three-quarters of top-grossing
  mobile games run a web store (12% in 2019) ([Bain](https://www.bain.com/insights/game-distribution-half-your-players-already-buy-direct-gaming-report-2026/)).
- Supercell Store: direct linking since Apr 30, 2025; ~10% bonus currency on web purchases; shifting 20% of Brawl
  Stars spend would save >$42M/yr ([Stash](https://www.stash.gg/blog/supercell-store)). Web-shop share of revenue: not disclosed.
- Caveat: conversion can drop by up to 45% when players leave the app for checkout (gamegrowthadvisor, secondary). A
  web-native game avoids this: checkout is already in the browser.

**For us:** a browser game keeps ~97% of each sale through Stripe (we already have Stripe + crypto checkout + shelter
share keeper). Do not wrap the new game in Capacitor for monetization; keep purchases on the web.

## 4. What this means for the Token Tails game (ranked)

Ranked by (a) works with zero audience, (b) recurring, (c) fit with the shelter brand, (d) build cost for 1–2 people.

1. **Visible social cosmetics + "your real cat" UGC** (Gorilla Tag / Grow a Garden pattern, plus /yourcat).
   Items are seen in every shared clip and screenshot, so each sale is also an ad. Price small ($1–5) via Stripe.
   Conversion: assume the 2–5% F2P baseline until measured.
2. **Season pass / "Shelter Season" supporter pass** (monthly or 4–6 week). Turns cosmetics into MRR; tie a fixed
   share to Pink Paw and show a live shelter counter. Conversion figures (8–20%) are low-confidence; plan on the
   low end.
3. **Creator referral rev share** (Fortnite 5% / UEFN new-player bonus pattern): every player gets a code; creators who
   bring players get a cut of their spend for N months. This is the acquisition engine, paid only on results.
4. **Self-serve sponsored world objects** (fly.pieter.com pattern): a Stripe link sells "this cat tree / billboard / cat
   name this week" to pet brands and indie founders. Zero revenue until there is a spike; then it captures it
   automatically. Never count it as ARR.
5. **Portal build for traffic** (CrazyGames/Poki, Discord Activity) with rewarded ads: low money per play, but free
   distribution to tens of millions of MAU. Keep the full economy and checkout on tokentails.com.
6. **Community cause targets** (Pet Rescue Saga pattern): "players hit X → Pink Paw gets Y" — no revenue directly,
   but a press and share hook that costs nothing.
7. **Patreon/supporter tiers**: only once there is an audience; anecdotal evidence only.

## 5. Unknowns

- fly.pieter.com: exact advertiser count over time, renewal rate, and when revenue fell to zero (only "mid-2026 $0").
- Shell Shockers VIP price and subscriber count.
- Krunker and Bloxd revenue.
- Payer conversion for web-only games (no public 2025–2026 benchmark found; the Xsolla 80.7% figure is an IAP *checkout*
  conversion, not payer rate).
- Discord Activity per-title revenue.
- Battle-pass purchase rates from a primary source (current figures are aggregator claims).
