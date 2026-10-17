# Research lens: creator virality (zero-follower growth on X and TikTok)

Date: 2026-10-15. Scope: how solo creators with no audience get games and apps seen on X and TikTok in
2025–2026, and what that means for a new Token Tails web game that has to bring in its own audience.

Confidence key: **high** = primary source or several independent reports; **medium** = one trade
article; **low** = marketing blog or aggregator claim with no method shown. Unknowns are marked as such.
No numbers here are invented. Where sources disagree, both are shown.

---

## 1. Bottom line

1. **Follower count does not decide reach on TikTok; the clip does.** TikTok says outright that "neither
   follower count nor whether the account has had previous high-performing videos are direct factors" in
   recommendations, and that finishing a video is a strong signal
   ([TikTok Newsroom](https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you)). A zero-follower
   account can reach the For You feed with its first post. **High.**
2. **Plain devlog content has mostly stopped working.** One trade report says devlog videos that reached
   800K views in 2024 averaged 300–800 views in 2025
   ([Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-originals/the-indie-game-discovery-problem-is-getting-worse)),
   and "most videos get under 1,000 views"
   ([presskit.gg](https://presskit.gg/field-guides/tiktok-indie-game-marketing)). Neither source shows its
   data, so treat this as **medium** confidence. Virality is a long-tail lottery: you need volume and moments
   people want to share, not a weekly diary.
3. **The best-performing pattern is a game that produces clips by itself.** These are moments players want
   to record, artifacts they want to post (Wordle's grid, Infinite Craft's "First Discovery"), or characters
   that are already memes (Steal a Brainrot). The creator is then the player, not the developer.
   presskit.gg says it this way: "make a game with moments people want to TikTok about." **High**, because
   several cases agree.
4. **X rewards conversation, not likes.** In the open-sourced ranker, a reply weighs 10× a like, and a reply
   that the author answers weighs 150× a like
   ([trendingtopics.eu](https://www.trendingtopics.eu/x-open-sources-its-algorithm-and-reveals-what-it-takes-to-go-viral/)).
   Reports are punished far harder. A no-audience founder should run a reply strategy and post game moments
   that make people reply. **Medium**, because exact weights differ between sources (see §3).
5. **The famous solo-game money stories mostly had an audience already.** fly.pieter.com reached about
   $72K/month in ad sales ([dev.ua](https://dev.ua/en/news/kalichna-shi-hra-zarobyla-vzhe-87k-baksiv-na-reklami-1741866359)),
   but the creator had 600K+ followers and an Elon Musk quote. Its revenue model (in-world sponsor slots)
   can be copied. Its distribution cannot. **High.**

---

## 2. TikTok mechanics (2025–2026)

| Signal | What we know | Source | Confidence |
|---|---|---|---|
| Finishing a video | Official: a strong signal with heavy weight, especially for longer videos | [TikTok Newsroom](https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you) | High |
| Follower count | Official: not a direct factor; a large audience still gives some baseline visibility | same | High |
| First test batch | Official: "your first set of likes, comments, and replays will initiate an early round of recommendations" | same | High |
| Completion bar | Claim that the bar rose from about 50% (2024) to about 70% (2025) | [socialz.ai](https://socialz.ai/blog/tiktok-algorithm-2025), [posteverywhere](https://posteverywhere.ai/blog/how-the-tiktok-algorithm-works) | Low (no method shown) |
| Shares and saves vs likes | Shares and saves are weighted above likes; shares per post said to be up 45% year over year | [rondocin](https://rondocin.it.com/blog/what-2026-algorithms-reward), [fanpagekarma](https://www.fanpagekarma.com/insights/?p=14186) | Low–medium |
| Follower-first testing | Claim that new videos are tested on existing followers first, which would weaken the "zero followers is fine" story | aggregator blogs above | Low; it conflicts with the official text |
| Slideshows (Photo Mode) | Carousels go to the For You feed like videos; no filming needed | [thesolocreators](https://thesolocreators.com/learn/faceless-tiktok-slideshows-free-traffic/) | Medium |
| POV hooks | 27.6% of POV-hook posts became outliers, against 19.0% for the average hook type (virlo dataset) | [virlo.ai](https://virlo.ai/data/viral-hooks/type/pov) | Low–medium (vendor data) |

**Design implications.** Short loops (under 15 s, the length The Matriarch's developer recommended) make
completion easy. A second watch counts as a replay. Content that people send to someone ("this is your
cat") produces shares. Saves come from content that is useful or that people want to collect, such as a
cat card or a cat-type result.

## 3. X mechanics (2025–2026)

xAI open-sourced the ranker. A September 2025 update added Grok-based classification and a "slop score".
A January 2026 release replaced the old ranker with a transformer
([trendingtopics.eu](https://www.trendingtopics.eu/x-open-sources-its-algorithm-and-reveals-what-it-takes-to-go-viral/),
[glitchwire](https://glitchwire.com/news/x-open-sources-its-algorithm-again-10-things-you-need-to-know-about-how-your-fee/)).

| Interaction | Weight (like = 0.5) | Note |
|---|---|---|
| Like | 0.5 | baseline |
| Repost | 1 | 2× a like |
| Reply, quote, DM share | 5 | 10× a like |
| Reply that the author answers | 75 | 150× a like (summary from the search results) |
| Follow from a post | 4 | 8× a like |
| Report | negative, 234× to 468× a like | **the sources disagree** |
| Mute / "not interested" / block | negative, about 59–118× / 43–86× / 31–62× | the sources disagree by about 2×, perhaps from different versions |

Other facts from the same article: posts older than 48 hours are filtered out; posts from accounts the
viewer does not follow get a 0.75 multiplier; **accounts with few impressions get a boost** (this helps a
new account); repeated posts by the same author in one feed are discounted. One caveat: the weights scale
*predicted probabilities*, not actual counts. **Medium confidence overall.** The fetched page dates its
release to Aug 17, 2026, while other coverage says Jan 2026, so this snapshot may change.

**Game-tweet data** ([howtomarketagame, May 2026](https://howtomarketagame.com/2026/05/07/2026-tips-for-making-your-tweets-go-viral/)):
the median is **7.15 wishlists per 1,000 views**; views and wishlists correlate almost perfectly
(Spearman r = 0.95); the like rate averages about 1.2%. The playbook that works is to show gameplay in the
first 2–3 seconds, post edited clips rather than whole trailers, **put the link in a reply rather than the
main tweet**, and pick genres with an instant emotion (horror; cute animals). **Medium-high** (the analysis
comes from a known industry newsletter).

**Reply-guy strategy.** One account grew from 800 to 15,000 followers in 4 months through targeted replies.
A claim says 84% of 300 accounts that grew from under 1K to over 10K in Q1 2026 used replies as their main
tactic ([teract.ai](https://www.teract.ai/resources/twitter-reply-guy-strategy-2026)). Typical tactics:
reply within 5–15 minutes, target accounts with 5–20× your follower count, and add data or a story.
**Low** (vendor blog). Dagobert Renouf went from 0 to 73K followers, and his first mini-viral reply brought
thousands of visits and a few sales
([Indie Hackers](https://www.indiehackers.com/post/replying-to-500-tweets-day-and-other-tips-for-growing-to-70k-twitter-followers-3e57d8ca53),
page returned 403, numbers taken from the search summary). **Medium.**

## 4. Case studies

### 4.1 Zero or near-zero audience

| Case | What happened | Numbers | Source | Conf. |
|---|---|---|---|---|
| **The Matriarch** (TikTok) | 3 months of posting on Reddit, X, FB and Imgur with no traction, then one TikTok took off. The winning video looked like earlier flops but had faster pacing | 400 → 23,000 wishlists; viral clip 1M views and 100K likes in hours; +1,500 / +3,500 / +2,500 wishlists on days 1–3; top 5 Next Fest demo; format was a "catchy question on top, video, CTA at the bottom", under 15 s, about 1 post a week | [Game Developer](https://www.gamedeveloper.com/game-platforms/from-400-to-20-000-wishlists-with-1-video-how-tiktok-can-make-your-game-go-viral) | High |
| **I Just Want to be Single!!** (visual novel) | The developer nearly quit, then posted a clip of the main menu | 571K views → 2,900 wishlists; next video +12K followers, wishlists doubled to 6K in a month (about 5 wishlists per 1,000 views) | [Outlook Respawn / search summary](https://respawn.outlookindia.com/gaming/gaming-originals/the-indie-game-discovery-problem-is-getting-worse), [howtomarketagame](https://howtomarketagame.com/seven-great-tips-for-marketing-your-indie-game-on-tiktok/) | Medium |
| **Wordle** | No marketing, no account. The spoiler-free emoji grid carried no link but made people curious | 90 players (Nov 2021) → 300K (early Jan 2022) → 2M+ (end of Jan 2022); then bought by NYT | [BuzzFeed News](https://www.buzzfeednews.com/article/stefficao/how-wordle-went-viral-strategy), [Aakash Gupta](https://www.news.aakashg.com/p/wordle) | High |
| **Grow a Garden** (Roblox) | An anonymous 16-year-old built it in 3 days; growth came mostly from short-form clips (TikTok/YouTube); trading and stealing created social drama; timed "admin abuse" live events | Launched Mar 26, 2025; 5M CCU (May 18) → 21.3M (Jun 21) → 22.3M peak (Aug 23); #1 on Roblox Top Earners by Jul 19; revenue not disclosed | [Wikipedia](https://en.wikipedia.org/wiki/Grow_a_Garden) | High |
| **Steal a Brainrot** (Roblox) | Built on TikTok-native Italian brainrot characters (Tralalero Tralala, first posted Jan 2025); core loop is stealing from other players | Launched May 16, 2025; 42.7B visits; 25.8M CCU peak (Oct 11, 2025), a Roblox record | [Wikipedia: Italian brainrot](https://en.wikipedia.org/wiki/Italian_brainrot), [Wikipedia: Steal a Brainrot](https://en.wikipedia.org/wiki/Steal_a_Brainrot) | High |
| **Couple Joy** (faceless slideshow app account) | Couples app marketed only through photo carousels | 2M+ views, 60K+ likes, 200+ posts; downloads and revenue paywalled (unknown) | [Playkit](https://playkit.substack.com/p/couple-joy-faceless-slideshow-growth) | Medium (numbers partial) |
| **Rayz AI** (faceless app) | No face on camera, TikTok only | $0 → $80K MRR in 75 days, 40M+ views | [Shortimize](https://www.shortimize.com/blog/from-zero-to-80k-mrr-in-75-days-how-rayz-ai-mastered-tiktok-marketing) | Low–medium |
| **Cal AI** (app, multi-account) | Over a dozen branded TikTok accounts from Jan 2025 posting carousels and faceless reposts, plus paid UGC creators | $1.5M MRR, 15M downloads, bought by MyFitnessPal (some sources say a "$50M run rate") | [8x.social](https://www.8x.social/en/blog/cal-ai-multi-account), [Shortimize](https://www.shortimize.com/blog/cal-ais-marketing-strategies-lessons-from-a-400k-mrr-success-story) | Medium (sources conflict on scale) |

### 4.2 Viral through streamers and clips (audience borrowed, not owned)

| Case | Mechanism | Numbers | Source | Conf. |
|---|---|---|---|---|
| **PEAK** | Built in 4 months at a game jam; co-op chaos is fun to watch ("friendslop"); proximity-voice slapstick | 100K sold in 24 h, 1M in week 1, about 10M (9.7M) in 8 weeks, about 170K daily peak CCU | [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/from-game-jam-to-10-million-units-indie-hit-peak-success), [fullcleared](https://fullcleared.com/news/co-op-climbing-game-peak-has-sold-5m-copies/) | High |
| **R.E.P.O.** | One Twitch voice-chat moment ("Chest Pain (I Love)") became a sound that people remixed and animated | "Tens of millions of views"; sales not in sources (unknown) | [meme.com](https://meme.com/memes/repo-i-love) | Medium |
| **Chained Together** | Failure clips of two players physically chained ("rage"); Kai Cenat and IShowSpeed played it chained in real life | 85,638 peak CCU (Jun 24, 2024), Streamers' Choice award | [GameWorldObserver](https://gameworldobserver.com/2024/06/25/chained-together-85k-concurrent-players-launch-steam), [Wikipedia](https://en.wikipedia.org/wiki/Chained_Together) | High |
| **Megabonk** | A solo developer known for YouTube devlogs (Dani); posts warmly on X | 1M sold in 2 weeks, about 1.3M est.; $9.99 → about $10M gross | [PowerUp Gaming](https://powerupgaming.co.uk/2025/10/03/megabonk-tops-1-million-sales-in-2-weeks/) | High (but he had an audience) |
| **DREADMOOR** | Repeated spikes from big aggregator accounts reposting (IndieGameJoe 2.5M views → +25K wishlists/week; one old trailer repost at 150K views → +17K) | 200K+ wishlists in 13 months; a steady 1,500–2,000 a day | [wnhub](https://wnhub.io/news/stores-and-publishing/item-50914) | Medium |
| **Gorilla Tag** | Social VR tag; kids recording each other drove short-form spread | $100M+ revenue, 10M players (Jun 2024), 3M MAU / 1M DAU, about 60 min average session; cosmetics with try-on | [Road to VR](https://roadtovr.com/gorilla-tag-revenue-vr-success-another-axiom/) | High (the TikTok part is not quantified) |
| **Infinite Craft** (web) | The "First Discovery" badge is a status object players want to screenshot | Launch post: 15M views, 11K reposts, 37K likes in 1 week; 300M recipes a day (the creator already had an audience) | [Wikipedia](https://en.wikipedia.org/wiki/Infinite_Craft) | High |

### 4.3 Build in public with an audience (the model to copy, not the path)

- **fly.pieter.com**: three.js browser MMO flight sim built with Cursor in about 3 h (Feb 26, 2025). In
  17 days: 320K unique players, 31K on its best day, about 2K concurrent. **$87K earned and about $72K/month
  in sold ad space** (blimps and in-world billboards, "Million Dollar Homepage" style); jets sold for $29.99
  added little. Distribution: 600K+ followers plus Musk's "AI games are going to be massive"
  ([dev.ua](https://dev.ua/en/news/kalichna-shi-hra-zarobyla-vzhe-87k-baksiv-na-reklami-1741866359),
  [404 Media](https://www.404media.co/this-game-created-by-ai-vibe-coding-makes-50-000-a-month-yours-probably-wont/),
  headline: "yours probably won't"). The same creator later sold ad slots on another project at
  $5K/month and $10K/month and announced a $25K → $50K → $100K price ladder
  ([digg](https://digg.com/tech/mm4c7usw)). **High.**
- **Vibe Jam 2025**: 1,170 browser games submitted in 7 days; three.js recommended; winners got
  $10K / $5K / $2.5K ([vibecoding.app](https://vibecoding.app/events/recap/pieter-levels-vibe-code-game-jam-2025)).
  This is a ready-made, high-traffic distribution event for exactly our stack. The 2026 edition exists
  ([vibej.am/2026](https://vibej.am/2026/press)); the dates of the next one are unknown.

## 5. Which game moments get clipped

From the cases above and [howtomarketagame](https://howtomarketagame.com/2026/05/07/2026-tips-for-making-your-tweets-go-viral/),
[presskit.gg](https://presskit.gg/field-guides/tiktok-indie-game-marketing) and
[GameDiscoverCo](https://newsletter.gamediscover.co/p/video-games-and-tiktok-how-to-get):

1. **Funny failure or physics chaos** (PEAK, Chained Together): instantly readable with the sound off.
2. **An identity artifact** ("this is so my cat", Wordle grid, First Discovery): people share it because
   it says something about them.
3. **Theft or betrayal between players** (Steal a Brainrot, Grow a Garden): drama and revenge make good POV.
4. **Rare drops and reveals** (a gacha or egg-hatch moment): suspense keeps people watching to the end.
5. **Voice or sound moments** (R.E.P.O.): a remixable sound becomes a TikTok trend.
6. **Satisfying loops, before and after, bugs** (presskit.gg's format list).
7. **Cute animals** ("cute woodland creatures" outperform, per howtomarketagame), which fits our cats.

Formats that work without a face: gameplay clip with a text hook at the top; "POV: your cat…" captions;
photo-mode carousels (results, cat cards, rankings); remixable sounds; serial "Day N" posts.

## 6. What this means for the Token Tails game

- **Make the share artifact the core loop, not an add-on.** Every session should end with a vertical
  9:16 clip or card about *your* cat: a "POV: your cat stole…" replay, a 5-second rendered moment, a
  spoiler-free grid. /yourcat already turns one photo into a playable cat. That is the identity artifact
  (Wordle grid × Infinite Craft First Discovery) that people repost.
- **Build in a social conflict loop** (steal, rescue, or prank between players' cats) so clips have drama.
  Grow a Garden and Steal a Brainrot show that theft between players is the strongest UGC driver of
  2025.
- **Clips must make sense in the first 2 seconds with the sound off**, and the full clip should run 7–15 s
  so people watch to the end.
- **Use real shelter cats as recurring "characters"** that clips are built around: a cast like the brainrot
  characters, but real and adoptable.
- **Run many faceless accounts** (Cal AI style: carousels plus auto-rendered clips from the game) instead of
  one founder account. Post 2–3 times a week per account at least; volume matters because outcomes have a
  long tail.
- **On X: put the link in a reply, answer every reply** (the 150× weight), run a daily reply strategy
  under big pet, AI and game accounts, and enter Vibe Jam–type events.
- **Revenue that fits a zero-audience start:** sponsor slots placed in the world, with prices that climb
  publicly (fly.pieter: about $72K/month, with an audience); cosmetics with try-on (Gorilla Tag: $100M+).
  Subscriptions are unproven for this genre (unknown).

## 7. Anti-patterns

- Weekly devlog-only posting (reach collapse; 300–800 views typical, per Outlook Respawn).
- Horizontal 16:9 clips (perform worse than vertical; GameDiscoverCo).
- Long intros or dialogue before the hook; posting whole trailers.
- A link in the main tweet; a high report or mute rate (negative weights are 31–468× a like).
- Copying fly.pieter's *distribution* (it depended on 600K followers plus Musk).
- Assuming one video will do it: The Matriarch's hit looked like its earlier flops; the result is a lottery
  you win with volume and iteration.
- Paying for reach too early: a $500–2K paid TikTok budget is now "recommended" (Outlook Respawn), so
  organic reach has to come from the product.

## 8. Unknowns

- TikTok's exact completion threshold (the 70% figure has no method behind it).
- Exact X weights, because the versions differ; whether the new-author boost still exists after the 2026
  rewrite.
- Revenue figures for Grow a Garden, Steal a Brainrot, R.E.P.O. and Couple Joy.
- How well a web game's share clip converts to plays (we only have the 7.15 wishlists per 1,000 views
  figure for Steam).
