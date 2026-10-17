# Research lens: UGC platforms and UGC mechanics (2026-10-15)

Question: which user-generated-content (UGC) mechanics drive organic growth and revenue, what makes UGC
spread or die, and what a zero-audience web game from Token Tails (1–2 people plus AI, cat + shelter brand,
`/yourcat` photo-to-cat already built) should copy.

Method: 17 web searches and fetches, sources from 2024–2026 where possible. Numbers are quoted from the cited
page. "Unknown" means no source was found. Secondary aggregators (rolearn.dev, rowatcher.com, sqmagazine)
are marked as lower confidence.

---

## 1. Platform-scale UGC economies (context, not something we can copy directly)

| Platform | Key numbers | Source |
|---|---|---|
| Roblox | ~$1.5B paid to creators through DevEx in 2025, up from $922.8M in 2024 (+63%); 23,500+ creators paid in 2025; DevEx rate raised 8.5% from Sep 5, 2025 | [Roblox 10-K FY2025](https://www.sec.gov/Archives/edgar/data/1315098/000131509826000024/rblx-20251231.htm), [Tubefilter](https://www.tubefilter.com/?p=194006), [Statista](https://statista.com/statistics/1376672/roblox-developer-payout) |
| Roblox avatar UGC | ~120,000 active item sellers (early 2026); creator keeps roughly 25–35% of list price; median item ~$20 lifetime, top 1% $50k+ (aggregator, low confidence) | [rolearn.dev](https://rolearn.dev/trend-reports/roblox-ugc-marketplace-trends-2026) |
| Fortnite UEFN | $352M paid to creators in 2024; creators grew 24k → 70k; 198k islands published in 2024; creator islands = 36.5% of playtime in 2024, 47% by 2026; >$1B paid since UEFN launch | [Fortnite official 2024 review](https://www.fortnite.com/news/fortnite-ecosystem-2024-year-in-review-celebrating-creators-and-looking-ahead), [PocketGamer.biz](https://www.pocketgamer.biz/epic-games-paid-352-million-to-fortnite-creators-in-2024), [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/epics-uefn-payouts-reached-1-billion-since-launch) |
| Fortnite payout design | 40% of Item Shop net revenue goes to an engagement pool; from Nov 1, 2025 creators who bring new or lapsed players get 75% of those players' pool contribution for 6 months; island-specific items pay creators 100% through 2026, then 50% | [esports.gg](https://esports.gg/guides/fortnite/how-do-fortnite-creators-make-money/), [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/epic-games-expands-uefn-amid-722m-creator-boom) |
| Steam Workshop | $57M paid to ~1,500 item creators from 75 countries, 2011–Jan 2015 (old, no newer total found) | [PC Gamer](https://www.pcgamer.com/uk/steam-workshop-creators-have-made-over-57-million-since-2011) |
| Astrocade (AI prompt-to-game, web) | ~5M MAU, ~140M plays/month, 75k+ games from 80 countries within ~8 months of public launch; $56M Series A+B (Sea, Sequoia), May 2026; "women 20–40 are the best users", "competes more against Instagram" | [Fortune](https://www.fortune.com/2026/05/05/astrocade-raises-56-million-series-b-sequoia-video-games-platform-ali-amir-sadeghian/) |
| Discord Activities (web games in iframes) | Discord ~200M monthly users; >25% of MAU use Activities; "Death by AI" reached nearly 7M players in weeks | [Sacra](https://sacra.com/chat/h/0c0cf621-6037-4af4-9405-352a5c16f98b), [GamesBeat](https://gamesbeat.com/discord-opens-activities-in-app-games-and-features-to-all-developers/) |

Takeaway: the money is real, but it pools on platforms with built-in audiences. Fortnite now pays creators
explicitly for **bringing new players in**: the platforms value acquisition above everything else. A
standalone web game has no platform feed, so the share link and the clip have to do the acquisition.

## 2. The hits: what spread and why

### Grow a Garden (Roblox, 2025)
- First version built in a few days by a 16-year-old; peak 22.3M concurrent (Aug 23, 2025), earlier 21.3M
  (Jun 21, 2025); ~$12M item revenue in May 2025 alone ([Wikipedia](https://en.wikipedia.org/wiki/Grow_a_Garden),
  [PocketGamer.biz](https://www.pocketgamer.biz/roblox-game-grow-a-garden-beats-steam-with-record-concurrent-user-high-of-89m)).
- Drove Roblox Q2 2025 DAU to 111.8M (+41% YoY) and a bookings guidance raise to $5.87–5.97B
  ([Wikipedia](https://en.wikipedia.org/wiki/Grow_a_Garden)).
- Mechanic: slow idle growth + rare random mutations + trading + timed shop restocks + weather events. The
  UGC is the player's own garden and rare pets; status comes from showing them.

### Steal a Brainrot (Roblox, 2025)
- 25.8M concurrent at the Oct 2025 "Yin Yang" event, first Roblox game above 25M; now ~215k (−99.2%)
  ([PocketGamer.biz](https://www.pocketgamer.biz/robloxs-steal-a-brainrot-becomes-first-game-to-surpass-25m-concurrent-players),
  [Rowatcher](https://rowatcher.com/news/is-the-brainrot-trend-dying-what-ccu-data-from-three-top-games-reveals)).
- The characters themselves were **AI-generated TikTok UGC**: "Tralalero Tralala" (shark in Nike shoes,
  Jan 2025, one early video 17M plays in 3 months) spawned dozens of AI animal-object mashups that became
  Roblox games, Spotify remixes and Panini stickers ([Know Your Meme](https://knowyourmeme.com/editorials/guides/what-does-the-tralalero-tralala-meme-mean-the-origins-of-the-italian-brainrot-tiktok-trend-featuring-a-shark-wearing-nikes-explained)).
- Lesson: a game that **collects characters the internet already makes** inherits their distribution. Also: the
  same genre shows 96–99% falls from peak within months; "games that stop updating die within weeks".

### Dress to Impress (Roblox, 2023–)
- 9.7B visits; all-time peak 1.73M concurrent (Dec 2024); now 37–54k average
  ([Rowatcher](https://rowatcher.com/news/dress-to-impress-how-a-teen-developer-s-fashion-game-hit-9-7-billion-visits),
  [Wikipedia](https://en.wikipedia.org/wiki/Dress_to_Impress_(video_game))).
- Loop: themed prompt → 360 s to build an outfit → runway walk → everyone rates 1–5 stars. **Every round
  makes a reveal moment that films well.**
- TikTok: official account 2.5M followers, 5–10M views per post, 750k+ hashtag posts; the "Pose 28" emote
  became a meme that people recreated in real life. Viral clips were made by **adult** players, which pulled
  in a non-Roblox audience. Streamers (Pokimane, Kai Cenat, CaseOH, James Charles) followed.
- Brand collabs (Charli XCX: 651k CCU spike), toy line with DLC codes.

### Gartic Phone (web, 2020–)
- Free browser game (Pictionary × Telephone), released Oct 7, 2020; Twitch peak 252.5k viewers (Jun 2021);
  in July 2026 still 418k hours watched/month, 55.7k peak viewers
  ([Streams Charts](https://streamscharts.com/games/gartic-phone),
  [Know Your Meme](https://knowyourmeme.com/editorials/guides/what-is-gartic-phone-and-why-do-streamers-love-it-the-multiplayer-drawing-game-explained)).
- One clip of a streamer playing with pro animators: 3.2M plays, 594.5k likes (Aug 2021).
- Why: a room link, no account, zero teaching time, and the end-of-round **album replay** is the content.
  Monetization: unknown (ads). Revenue figures: unknown.

### fly.pieter.com (web, three.js, Feb 2025)
- Built with AI in ~3 hours; reached $67k MRR on day 13 and $87k MRR ($1M ARR run rate) on day 17 from
  in-world ad blimps/billboards plus a $29.99 F-16; ~17k peak concurrent; by mid-2026 reported at
  **$0/month** ([DEV Community](https://dev.to/promptway/he-built-a-flight-simulator-in-three-hours-and-hit-1m-a-year-in-17-days-then-it-went-to-zero-1b1l),
  [Avgeekery](https://avgeekery.com/?p=39779)). Caveat: the author already had a large X audience and an Elon
  Musk repost; this does not prove a zero-audience launch.
- The follow-up Vibe Coding Game Jam had 1,170 entries
  ([DEV Community](https://dev.to/promptway/he-built-a-flight-simulator-in-three-hours-and-hit-1m-a-year-in-17-days-then-it-went-to-zero-1b1l)).
- Lesson: **sponsors buy attention spikes, not recurring revenue.** In-world ad inventory is a fast first
  dollar; it is not MRR.

### Photo-to-character AI trends (2025)
- GPT-4o image launch (Mar 25, 2025): the Ghibli trend added "one million users in the last hour" to ChatGPT
  (Sam Altman); ran OpenAI out of GPUs ([Cybernews](https://cybernews.com/ai-news/openai-chatgpt-ghibli-image-tool-surge-users-1m-hour-altman-says/),
  [Khaleej Times](https://www.khaleejtimes.com/business/tech/ghibli-chatgpt-usage-record)).
- The post format was a **before/after pair**; pet photos were among the most common inputs.
- Pet-specific 2025 trends: "pet to person", "pets as movie characters", "AI fat pet prank"
  ([Creative Bloq](https://creativebloq.com/ai/the-viral-pet-to-person-ai-trend-turned-my-cat-into-a-weird-slobby-man),
  [Kapwing Nov 2025](https://www.kapwing.com/resources/november-2025-ai-trends-for-creators-brands)). View
  counts: unknown per trend.
- Lesson: "your own pet, transformed" is a proven share format. `/yourcat` already does this; the gap is a
  **game moment** the transformed cat then appears in, which makes the second clip.

### Avatar makers with a social object: Picrew, Gacha Life
- Picrew: artist-submitted presets, used for profile pictures and "matching couple PFPs" on TikTok, X and
  Discord ([Know Your Meme](https://amp.knowyourmeme.com/memes/sites/picrewme)). Users: unknown.
- Gacha Life: 2D character creator + "Studio" scene maker; the output is short videos and skits posted to
  TikTok/YouTube ([Hwb](https://hwb.gov.wales/keeping-safe-online/in-the-know/gacha-life)). Downloads: unknown
  from the found sources.
- Lesson: 2D works when the creation is an **identity badge** (PFP) or a **story/skit format** for video.

## 3. Failures: why UGC dies

| Case | What happened | Lesson | Source |
|---|---|---|---|
| Rec Room (closed Jun 1, 2026) | $3.5B valuation (2021), $294M raised; UGC cosmetics = 60% of player spend and outsold first-party 10×, but Rec Room kept only ~30% of UGC sales; paid creators $1M+/quarter; mobile/console expansion produced "millions of pieces" of low-quality content and users who rarely created or spent; laid off 16% then ~half (310 → ~100) | Keep a real margin on UGC sales; low-effort UGC floods discovery; growth users who don't create or pay are a cost | [Road to VR (top creator)](https://roadtovr.com/rec-room-shutdown-why-top-creator/), [Road to VR layoffs](https://roadtovr.com/rec-room-layoff-half-staff-august-2025/), [GeekWire](https://www.geekwire.com/2026/rec-room-shutting-down-seattles-3-5b-social-gaming-platform-says-it-cant-make-the-business-work/) |
| Dreams (PS4) | Live support ended Sep 1, 2023; "couldn't find a sustainable path"; PS4-only; the promised creator store never shipped, so creators had no way to earn | Deep creation tools without distribution off-platform or creator income stall | [Push Square](https://www.pushsquare.com/news/2023/07/dreams-live-service-ending-as-media-molecule-couldnt-find-a-sustainable-path) |
| Super Mario Maker 2 | 2M courses in <2 weeks, 4–5M within weeks (2019); upload cap 32 → 64 after outcry | Creation volume is easy; discovery and curation are the bottleneck. Shareable course IDs worked inside the console, not on the open web. Newer totals: unknown | [TechRadar](https://www.techradar.com/news/super-mario-maker-2-on-switch-has-hit-2-million-player-made-courses), [DualShockers](https://www.dualshockers.com/super-mario-maker-2-4-million-courses-uploaded/) |
| Brainrot wave | −96% to −99% from peak in months | Trend-borrowed UGC spikes and decays; needs a weekly event cadence | [Rowatcher](https://rowatcher.com/news/is-the-brainrot-trend-dying-what-ccu-data-from-three-top-games-reveals) |
| fly.pieter.com | $87k MRR → $0 | One-off sponsor and IAP revenue is not recurring | [DEV Community](https://dev.to/promptway/he-built-a-flight-simulator-in-three-hours-and-hit-1m-a-year-in-17-days-then-it-went-to-zero-1b1l) |

## 4. What makes UGC spread (synthesis)

1. **Creation takes seconds, not hours.** Photo upload (Ghibli, `/yourcat`), 360-second outfit (DTI), one
   drawing (Gartic). Deep editors (Dreams, Mario Maker) produce great content but few creators per viewer.
2. **The output is a video-ready reveal.** Runway walk, before/after pair, Gartic album replay. If the
   moment doesn't fit in a 9:16 clip under 15 s, it won't travel on TikTok.
3. **Other people judge or remix it.** Star ratings (DTI), telephone chains (Gartic), stealing others'
   characters (Brainrot). A link that says "rate my cat" or "beat my cat" has a reason to be opened.
4. **Identity and ownership.** Your garden, your outfit, your pet. People share themselves, not the game.
5. **Borrow content the internet already makes.** Brainrot characters came from TikTok AI videos; cat
   photos are among the most posted images online. The game should ingest that content, not compete with it.
6. **Adults outside the core audience film it.** DTI spread when adults made clips; Astrocade's best users are
   women 20–40. A cat game naturally fits that demographic.
7. **Live cadence after the spike.** Timed restocks, weekly themes, events; games that stop updating die
   within weeks.
8. **Instant play by link.** Gartic and fly.pieter: no install, no account. Discord Activities show web
   games can live inside chat apps.

## 5. What makes it die
- Flood of low-effort UGC with no curation (Rec Room mobile).
- Creator income without platform margin (Rec Room 30% keep).
- Platform lock (Dreams PS4, Mario Maker on Switch): creations can't be seen on the open web.
- One-shot monetization (sponsor blimps, single IAP) mistaken for MRR.
- No event cadence after the viral peak.

## 6. Implications for Token Tails

- Make the core UGC unit **"my cat"** (photo → 3D/2.5D or pixel cat via the existing `/yourcat` pipeline)
  and the core social loop **"rate / battle / visit my cat by link"**, DTI-style: a short themed round, a
  reveal, other players' votes.
- Every round should export a **9:16 clip and a before/after card** automatically (Ghibli pair format + DTI
  runway reveal). The share link should open the game straight into that cat, with no login.
- Put **real shelter cats** into each lobby as collectible or "guest" cats. This is the brand's own content,
  like Brainrot's ready-made characters, and the reason to come back each week (new shelter cat drop).
- Moderation and curation from day one (photo-only input limits griefing; AI style keeps quality even).
- Revenue: cosmetic items for your cat (Rec Room: UGC cosmetics = 60% of spend) with **≥50% margin kept**,
  a monthly "Pink Paw club" subscription for weekly drops, and brand/shelter sponsorship of themed weeks
  (treated as spike revenue, not MRR).
- Ship as a plain web link first; add a Discord Activity wrapper later for group play.

## 7. Unknowns
- Gartic Phone revenue, MAU and ad model.
- Picrew and Gacha Life user counts.
- Super Mario Maker 2 level totals after 2019.
- View counts for 2025 pet AI trends.
- Astrocade's revenue and how its games spread off-platform.
- Zero-audience counter-examples: fly.pieter.com and most hits had a platform feed or an existing audience;
  no source found for a standalone web UGC game reaching scale from zero followers.
