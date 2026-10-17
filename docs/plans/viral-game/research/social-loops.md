# Research lens: social loops (which loops actually produce invites)

Date: 2026-10-15. Scope: social and viral loop mechanics for a new no-install web game from Token Tails
(cat game brand tied to the Pink Paw shelter, ~0 audience). Every number below has its source inline.
Where a number comes from a weak aggregator, it is marked **(low confidence)**. Where a number does not
exist publicly, it is marked **unknown**. Nothing here is invented.

## 1. The core finding in one paragraph

Games with no audience that went viral between 2022 and 2026 did not grow through "invite friends"
buttons. They grew because **playing produced an artifact that was worth posting on its own** (Wordle grid,
Infinite Craft discovery, a Peak or R.E.P.O. clip, a Spotify Wrapped card), and the artifact pulled the
viewer into a **zero-friction, same-content session** (same daily seed, same room, same link). Explicit
referral rewards (Hamster Kombat, Squad Busters) produced huge but short spikes or failed to retain.
Collection-plus-reciprocity loops (Monopoly GO stickers, Pokémon TCG Pocket Wonder Pick, Grow a Garden
trading) produced the revenue, but they need an existing player base to work. So the order is:
**artifact loop first (acquire), reciprocity loop second (retain and monetise), referral rewards last
(optional garnish)**.

## 2. Measured benchmarks for K-factor

- K = invites per user × conversion per invite. Sustained K > 1 is rare and usually temporary; typical
  healthy products land at K = 0.3–0.7 ([LaunchList guide](https://blog.getlaunchlist.com/blog/viral-coefficient-k-factor-guide)).
- Mobile games: cited range 0.4–1.2 depending on genre ([same guide](https://blog.getlaunchlist.com/blog/viral-coefficient-k-factor-guide));
  a practical "social invites" target of K = 0.25 with an alert under 0.15 per 4-week window
  ([Bruin use case](https://getbruin.com/use-cases/mobile-gaming/social-feature-virality-coefficient-tracking/)) **(low confidence: vendor example, not a study)**.
- Referral-programme heuristics: active-host rate > 50 %, > 15 invites per user, 5–8 % conversion
  ([Kurve](https://kurve.co.uk/blog/app-referral-marketing-k-factor-viral-retention)) **(low confidence)**.
- **Unknown**: no public, game-specific K-factor for Wordle, Peak, Grow a Garden or Infinite Craft.
  Their spread is visible only through proxies (tweets, shares, concurrents), listed below.

Implication: plan for K ≈ 0.2–0.5 from the artifact loop and get the remainder from cycle time (daily)
and creators. Do not plan on K > 1.

## 3. Loop-by-loop evidence

### 3.1 Shareable result artifact + daily shared seed (Wordle pattern)

- Wordle: 90 players on Nov 1 2021 → 300,000+ on Jan 2 2022 → 2M+ a week later
  ([Wikipedia](https://en.wikipedia.org/wiki/Wordle)). The emoji grid was **invented by players**
  (a group of friends in New Zealand) and then built in by the developer; that is what triggered the
  Twitter spread in late Dec 2021 ([Wikipedia](https://en.wikipedia.org/wiki/Wordle)).
- 1.2M Wordle results shared on Twitter Jan 1–13 2022; 3.3M people tweeted, 32.2M tweets, 500k tweets/day at
  peak ([Wikipedia summary of Twitter's case study](https://en.wikipedia.org/wiki/Wordle);
  [TechCrunch](https://techcrunch.com/2022/05/04/wordle-new-york-times-user-growth)).
- Monetisation outcome: NYT paid a "low seven-figure sum"; Wordle brought "tens of millions of new users"
  and NYT Games' best quarter ever for net subscriber adds ([TechCrunch](https://techcrunch.com/2022/05/04/wordle-new-york-times-user-growth)).
  NYT Games: 11.2B puzzle plays in 2025 ([NY1/AP, Jan 2026](https://ny1.com/nyc/all-boroughs/ap-top-news/2026/01/21/this-just-in-from-the-new-york-times-its-first-2-player-game-and-an-evolving-business-model)).
  NYT's first multiplayer game (Crossplay) launched Jan 2026, same source.
- GeoGuessr: free tier is one daily challenge; unlimited is $6.99/month or $47.88/year; challenge links
  made by subscribers are playable by anyone without an account ([search summary, vocal.media](https://vocal.media/gamers/how-to-play-geo-guessr-for-free-complete-guide-for-2025)) **(medium confidence)**.
  Revenue ~$500k in 2019 vs ~$18M around 2022 ([beehiiv profile](https://private-equity-bros.beehiiv.com/p/this-simple-app-was-bootstrapped-to-a-400m-valuation)) **(low confidence)**.

Why it works: the artifact is spoiler-free, comparable (same seed for everyone), status-bearing,
short (one daily play), and the cycle time is one day.

### 3.2 "First discovery" / creative output artifact (Infinite Craft pattern)

- Infinite Craft launched Jan 31 2024 on neal.fun (web, no install); the launch post got 15M+ views,
  11k reposts, 37k likes in a week; ~1,000 items crafted per second by Feb 2 2024
  ([Wikipedia](https://en.wikipedia.org/wiki/Infinite_Craft)). Players posted their "First Discovery"
  results as brag screenshots. Player count: **unknown** publicly.

Why it works: each player's output is unique (UGC by recombination), so posts are not repetitive; it
works in a browser tab.

### 3.3 Clip-generating co-op ("friendslop": Peak, R.E.P.O., Schedule I)

- Peak: 1M sales in 6 days, 2M by Jun 25 2025, viral on TikTok and X; proximity voice + slapstick
  physics described as "an endless generator for viral, emergent comedy"
  ([Know Your Meme](https://knowyourmeme.com/memes/subcultures/peak-video-game);
  [G2A news](https://www.g2a.com/news/latest/peak-game-surpasses-100k-concurrent-players-on-steam/)).
  Multiplayer is **friends-only** (Steam invites, max 4) — the invite is the purchase trigger.
  Alinea: 61 % of Peak buyers also played R.E.P.O. ([Alinea via GameDevReports](https://gamedevreports.substack.com/p/alinea-analytics-top-steam-games-09a)).
- R.E.P.O.: 14.4M Steam copies / $113.6M by May 2025 (Alinea, [blog](https://alineaanalytics.com/blog/steam_may_2025/));
  later estimates ~20M copies ([vaporlens](https://vaporlens.app/app/3241660/r_e_p_o/stats/details)) **(low confidence)**.
- Schedule I: ~8M copies, peak 460k concurrent, "one developer + Unity + a TikTok account"
  ([gamegeeker](https://gamegeeker.com/games/schedule-i-3164500-steam-pc)) **(low confidence)**.

Why it works: the game's real output is **clips**, made by players, posted to TikTok/Shorts. Friend
invite is structural (you cannot have the fun alone). Caveat: these are paid PC games with voice chat;
the web-mobile translation is unproven.

### 3.4 Collect, trade, gift, reciprocity (Monopoly GO, Pokémon TCG Pocket, Grow a Garden)

- Monopoly GO: fastest mobile game to $6B lifetime IAP (Hasbro, Jan 2026, per
  [tech-insider](https://tech-insider.org/monopoly-go-sticker-economy-mobile-monetization/)) **(medium confidence)**.
  Sticker albums with duplicate gifting turned solo collecting into a "social obligation network";
  "engagement is notably stronger when a player has five or more friends who actively play"; Monopoly GO
  Chat app (Mar 2026) reached #1 free app in six countries, 25M messages, 6.5M groups
  ([PocketGamer.biz](https://www.pocketgamer.biz/what-monopoly-go-can-teach-developers-about-building-lasting-player-communities/)).
- Pokémon TCG Pocket: Wonder Pick lets you spend stamina to pick one card from a friend's or stranger's
  freshly opened pack, and the opener gets a "thanks" reward; 100M+ downloads, $120M first month
  ([PocketGamer.biz](http://www.pocketgamer.biz/game-analysis-the-winning-formula-behind-pokmon-trading-card-game-pocket/));
  ~$1.3B first 12 months (AppMagic via [Insider Gaming](https://insider-gaming.com/pokemon-tcg-pocket-first-year-revenue-estimates-hit-1-3-billion/)).
- Grow a Garden (Roblox, made by a 16-year-old in a few days): 21.6M concurrent in late June 2025, beating
  Fortnite's 15.2M; global seed shop restocks every 5 min so "everybody's shop is the exact same";
  trade or steal others' crops ([Fortune](https://fortune.com/2025/07/30/roblox-video-game-grow-a-garden-viral-summer-hit/)).
  Roblox DAU +41 % to 111.8M that quarter ([wnhub](https://wnhub.io/news/finance/item-48413)) **(medium confidence)**.

Why it works: scarcity + duplicates + the ability to give creates reciprocity debt; **shared global
clock** (same shop, same moment) creates talkable events. Caveat: needs an existing population; at
30 actives there is nobody to trade with, so seed it with a house "trader" (the shelter) and strangers.

### 3.5 Explicit referral rewards (Hamster Kombat, Squad Busters)

- Hamster Kombat: 100M users in 73 days, 300M by Aug 2024; certain upgrade cards were locked behind
  inviting a friend ([Decrypt](https://decrypt.co/237629/hamster-kombat-keeps-demanding-more-friends-enough-already);
  [geekchamp](https://geekchamp.com/how-telegram-game-hamster-kombat-got-300-million-users-and-the-ire-of-irans-military/)).
  Then −86 % (to ~41M monthly) by Nov 2024 after a disappointing airdrop
  ([The Defiant](https://thedefiant.io/news/nfts-and-web3/hamster-kombat-loses-259-million-players-amid-86-drop-blockchain-gaming-01e15538)).
  The engine was a financial promise, not fun. (Also Telegram-based: excluded for Token Tails anyway.)
- Squad Busters (Supercell): referral gold rewards; 75M downloads, $100M+ spend, yet shut down < 18 months
  after launch with 59 % lower DAU than Brawl Stars at the same age
  ([search summary of AppMagic / PocketGamer](https://www.pocketgamer.biz/r/PG.Biz/Supercell+news/news.asp?c=44543)) **(medium confidence)**.

Lesson: rewarded invites can buy reach but not retention, and incentive-driven sharing collapses when the
incentive disappoints.

### 3.6 Streamer / chat-interaction loops (Twitch, TikTok LIVE)

- Choice Chamber (viewers vote in chat to change the game): 1M+ "players" counting chatters
  ([GamesBeat](https://gamesbeat.com/choice-chamber-has-twitch-viewers-help-or-torture-a-streamer/)).
- Marbles on Stream (Nov 2019): viewers type `!play` to enter a marble race; a long-lived filler game for
  streamers ([games.gg](https://games.gg/marbles-on-stream/)). Current player numbers **unknown**.
- Jackbox: phone-browser controller via room code, audience up to 10,000, built explicitly for streamers
  ([Jackbox streaming features](https://jackboxgames.com/streaming-moderation-accessibility-features-jackbox-party-pack-eight)).
  "300M games via Join since 2020" appears only on a weak site **(low confidence, do not cite)**.
- Crowd Control: TikTok LIVE support from May 2025; viewers trigger effects with follows, likes, shares
  and gifts across 150+ games; credited with 1.8× Twitch streamer revenue; ~70,000 creators, $2.5M+
  additional earnings ([Game Developer press release](https://www.gamedeveloper.com/press-release/crowd-control-launches-tiktok-support-with-exclusive-interactive-features)).
  A cottage industry of TikTok LIVE interactive games exists (Livecade, Devign, EarnOnLIVE)
  ([itch: tiktok-interactive-games](https://tiktok-interactive-games.itch.io)).

Why it matters for a zero-audience studio: **the streamer brings the audience, the game gives the
streamer a reason to stream it** (more gifts, more chat). Each viewer who interacts is a pseudo-player and
a candidate for the browser link. This is the closest analogue to "creators with no audience going viral"
because small TikTok LIVE hosts actively look for interactive games to raise gift revenue.

### 3.7 UGC sharing codes and creator payouts

- Fortnite UEFN: $1B+ paid to creators since 2023; $324–342M in 2024; Epic added a 75 % bonus for
  creators who bring new or lapsed players (Nov 2025), and creators keep 100 % of V-Bucks value from
  in-island sales through 2026 ([PocketGamer.biz](https://www.pocketgamer.biz/unreal-engine-for-fortnite-creator-payouts-surpass-1bn/);
  [GamesBeat](https://gamesbeat.com/fortnite-by-the-numbers-342m-paid-to-creators-in-2024-with-creators-tripling-to-70000/)).
- Animal Crossing Dream Addresses: 12-digit codes to visit someone's island read-only; whole forums exist
  to swap them ([How-To Geek](https://www.howtogeek.com/683468/how-to-visit-someones-island-in-dreams-in-animal-crossing-new-horizons/);
  [GameWith forum](https://gamewith.net/animal-crossing-new-horizons/bbs/threads/show/25)).

Lesson: a short code or link to **someone's creation** is a share unit as strong as a score, and paying
creators for players they bring (Epic's 75 % new-player bonus) is the industrial version of K.

### 3.8 Cause / charity mechanics

- Overwatch Pink Mercy (2018): limited charity skin + shirts, 100 % of skin proceeds donated, $12.7M in two
  weeks, plus $130k from 14 charity streams ([TheGamer](https://www.thegamer.com/overwatch-pink-mercy-breast-cancer-charity/);
  [TechCrunch](https://techcrunch.com/?p=1670002)). Best evidence that **a time-limited charity cosmetic
  converts players into buyers** — but it ran on an existing huge audience.
- Stray (2022): Nebraska Humane Society raffled 4 copies for $5 entries → $7,000 in a week from 550 donors,
  mostly new to the shelter, from as far as Germany and Malta; a streamer raised $1,500 in 4.5 h vs a
  $200 goal; but North Shore Animal League saw **no adoption traffic increase**
  ([WHYY](https://whyy.org/articles/stray-video-game-helping-real-cats/)).
- Tree Planet (Korea): grow a virtual tree → a real one is planted, paid by ads; 1M+ downloads in five years,
  boosted by "Star's Forest" where **K-pop fandoms grew forests named after idols**
  ([Philstar](https://www.philstar.com/world/2019/04/22/1911378/world)).
- MAG Interactive (Wordzee, QuizDuel): bundles that give in-game bonuses plus plant trees via Ecosia
  ([Cision](https://news.cision.com/mag-interactive/r/mag-joins-playing-for-the-planet-for-the-third-consecutive-year,c3579282)).
  Conversion uplift **unknown** (not published).
- To The Rescue! (dog shelter sim): 20 % of profit to Petfinder Foundation ([Steam](https://store.steampowered.com/app/946720/To_The_Rescue/)). Sales **unknown**.
- Games Done Quick 2025: AGDQ $2.56M, SGDQ $2.44M ([Shacknews](https://www.shacknews.com/article/145101/summer-games-done-quick-2025-final-total)).

Lesson: cause marketing **raises conversion and press-worthiness** but is not by itself a growth loop.
It gets shared when a **fandom competes for the cause** (Tree Planet's idol forests) or when a
**visible, named beneficiary** gets a concrete outcome (a $5 raffle, a spayed cat). No public evidence
that cause mechanics alone produce K.

### 3.9 Streaks and recap cards (retention side of the loop)

- Duolingo: streaks called "the biggest driver" of growth; 9M+ users with year-plus streaks
  ([Lenny's Podcast summary](https://www.recall.it/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team)) **(medium confidence)**.
  Streak screens fell from 14 % of apps (2024) to 8.1 % (2025): they stick only where a genuine daily loop
  exists ([Lazyweb](https://www.lazyweb.com/research/are-streaks-still-spreading-beyond-duolingo)).
- Spotify Wrapped 2025: 200M engaged users in 24 h (+19 % YoY) and 500M shares in the first 24 h (+41 %),
  "shares" counting native shares, downloads and screenshots
  ([Music Business Worldwide](https://www.musicbusinessworldwide.com/spotify-wrapped-campaign-hit-200m-engaged-users-in-24-hours-a-19-yoy-increase);
  [IBTimes](https://www.ibtimes.com/record-breaking-spotify-wrapped-2025-sees-200m-engage-500m-shares-day-3792059)).
  A personal identity card ("what kind of X are you") is the most-shared format on the internet.

### 3.10 A cat character as the viral hook

- Chess.com Jan 2023: the cat bot "Mittens" (taunting AI cat) coincided with 10M daily actives on Jan 20,
  31.7M games that day and 8.9M new registrations in Jan–Feb ([esports.gg](https://esports.gg/news/chess/chess-com-crashes-as-it-hits-the-highest-ever-daily-active-users);
  [Scroll](https://scroll.in/article/1076313/how-the-covid-19-pandemic-a-tv-show-and-a-cat-bot-boosted-the-popularity-of-online-chess)).
  Attribution to Mittens alone is **not proven**; it is widely credited.

Lesson: a cat with a personality that "beats you" or "taunts you" is a meme generator. Pink Paw's real
named cats can play this role.

## 4. Which loops produce invites: ranking for Token Tails (zero audience, web, cat + shelter)

Scores 1–5. "Works at zero audience" is weighted highest.

| Loop | Works at 0 audience | Invite / share strength | Retention | Monetisation link | Build cost (1–2 people + AI) | Evidence quality |
|---|---|---|---|---|---|---|
| Daily seed + spoiler-free result card (Wordle) | 5 | 4 | 4 | 3 (subscription for unlimited, like GeoGuessr/NYT) | 5 | High |
| Challenge link: "beat my run / ghost on the same seed" | 5 | 4 | 3 | 2 | 4 | Medium (GeoGuessr, Words With Friends; no public K) |
| Unique UGC artifact (Infinite Craft discovery, "your cat" card, Wrapped-style identity card) | 5 | 5 | 2 | 3 (cosmetics, prints, /yourcat HD) | 4 | High for shares, unknown K |
| Streamer / TikTok LIVE chat-plays mode | 4 | 4 (via host) | 2 | 4 (host gifts; sponsor slots) | 3 | Medium (Crowd Control 1.8×) |
| Clip-generating physics co-op (Peak) | 3 | 5 | 3 | 3 | 2 (realtime netcode, voice) | High on Steam, unproven on web |
| Collect / gift / trade duplicates (Monopoly GO, TCG Pocket Wonder Pick) | 2 | 3 | 5 | 5 | 3 | High at scale |
| Fandom competition for a cause (Tree Planet idol forests, team totals) | 3 | 4 | 3 | 4 (charity cosmetics à la Pink Mercy) | 4 | Medium |
| Rewarded referral (Hamster Kombat) | 3 | 3 | 1 | 1 | 5 | High for spike + collapse |
| Streaks alone | 1 | 1 | 4 | 2 | 5 | High (retention only) |

## 5. Recommended loop stack for the new game

1. **Daily seed run** on a single named Pink Paw cat ("Today's cat: Mila"), 60–120 s session, mobile
   browser. Ends with a **spoiler-free result card** (emoji or tiny pixel grid + cat portrait + "Mila got
   12 treats today"). Copy-to-clipboard text first (works in every chat, like Wordle), image second.
2. **Challenge link with a ghost**: the result URL contains seed + compressed input replay; opening it
   plays instantly against the sender's ghost (no sign-in). Winner/loser line in the card ("beat Zyg by 3").
3. **UGC hook** via /yourcat: "put your own cat in today's run" — the share card shows *your* cat next to the
   shelter cat. Personal identity artifact = Wrapped/Infinite Craft-style uniqueness.
4. **Collective cause meter**: every run adds treats to the cat's daily bowl (tie to the existing
   sponsored-treat rail); teams/fandoms (countries, creators, schools) compete for "whose cat ate most".
   Real-world outcome shown with a receipt (Stray raffle and Pink Mercy are the evidence, not K).
5. **LIVE mode**: a `?live=1` host view where chat commands or TikTok gifts spawn obstacles/treats
   (Marbles on Stream / Crowd Control pattern) so small creators have a reason to stream it.
6. **Later, once population exists**: duplicate cat stickers to gift (Monopoly GO), "Wonder Pick" from a
   friend's pack (TCG Pocket). Skip rewarded referrals beyond a small cosmetic.

Monetisation fit: GeoGuessr/NYT model (free daily, $3–7/month for unlimited/archives), limited charity
cosmetics with a published share to Pink Paw (Pink Mercy), streamer sponsorship slots, /yourcat HD prints.

## 6. Anti-patterns

- Invite-gated progress or financial promises (Hamster Kombat −86 %; Squad Busters closure).
- Requiring sign-up before the challenge link plays (kills conversion; GeoGuessr challenge links work
  without an account).
- Share cards that spoil the content or look identical for everyone (nothing to compare or brag about).
- Assuming a charity angle spreads by itself (Stray: donations yes, adoption traffic no).
- Trading/gifting economies at launch with no population (empty market feels dead).
- Realtime voice co-op on mobile web as the first bet (Peak's loop depends on Steam friends + voice).
- Telegram mini-app distribution (excluded by team rule anyway).

## 7. Unknowns to resolve by measurement

- Real K per loop for a web game (no public data): instrument `share_click`, `link_open`, `first_run_from_link`.
- Conversion of a challenge link open → completed run on mobile Safari/Chrome in-app browsers.
- Whether cause framing lifts share rate (A/B: card with vs without "Mila got 12 treats").
- Whether TikTok LIVE hosts adopt a free web game without a desktop overlay app.
