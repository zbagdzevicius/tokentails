# Paw Legends live ops: Events, community goal, Winter Nap, fan vote

Status: shipped Nov 13, 2026 (gap plan P1 `liveops-community`, `~/Downloads/paw-legends/research/gaps.md` rows L1–L3).
No sim change. Nothing here has a price, a random reward or a new start button.

## What players see

Home → **Events** (left stack) opens one popover:

- **Community goal**: one shared bar ("Play 2,000 matches together", 1,500 / 2,000). When it fills, every player
  (guests too) taps **Claim your coat** and gets the goal's palette coat.
- **Winter Nap** (Dec 15 – Jan 4, UTC days): one gift per day played, 7 gifts, the last one a coat. A missed day
  never resets anything. Before Dec 15 the card shows the dates.
- **Fan vote** between two coat concepts (three colour swatches each, no new art). One vote per account; after voting
  the card shows the shares.
- **Featured mode**: one live mode a week (Blitz, Skirmish, Classic, Monday 00:00 UTC). Its Events row reads
  "Featured · 3d left" and its Mode Select tile shows the event countdown chip. It is registered with
  `registerMode` as a timed event on the live mode, so it stays on the one play path (PLAY → mode → variant →
  champion) and stays playable; the base entry comes back when the week ends.

The Events button gets its dot when a reward waits (reached goal, earned gift) or an open vote is not cast.

## Server

`backend/src/pawlegends/liveops/`:

| Route | Auth | What |
|---|---|---|
| `GET /pawlegends/config` | public, `Cache-Control: public, max-age=30`, 60/min per IP | `{v, now, events[], featuredMode, featuredQuests, goal{id,label,metric,target,progress,reached,rewardItem,rewardName,startsAt,endsAt}, vote{…, open, tallies}, nap{…, open, today}}` |
| `GET /pawlegends/config/me` | account (guests too) | goal claimed, nap `{days, earned, claimed, playedToday}`, vote choice, `items` (every coat live ops granted) |
| `POST /pawlegends/config/goal/claim` | account | idempotent; 409 `PAWLEGENDS_GOAL_NOT_REACHED` before the target |
| `POST /pawlegends/config/nap/claim` | account | opens every earned, unclaimed gift (compare-and-set on `napClaimed`) |
| `POST /pawlegends/config/vote {option: 'a'\|'b'}` | account | one vote per account per vote id |

Storage: `pawlegendsliveopsconfig` (the one override doc, `_id: 'live'`), `pawlegendsliveopscount` (`goal:<id>`,
`vote:<id>:<a|b>`), `pawlegendsliveops` (one doc per account).

**One writer.** The goal counter and the Winter Nap days grow only in `/live`: `savePawlegendsMatch` and
`savePawlegendsPartyMatch` call `applyCommunityGoal` once, after their Game row exists (unique digest), from the
re-sim's or the relay verdict's own numbers. A forfeit adds nothing to the goal. `liveops.spec.ts` checks the callers
in the source.

## Changing the calendar (no deploy)

Edit the `pawlegendsliveopsconfig` doc `_id: 'live'` in Mongo. Every field is optional; a missing or invalid field keeps
the code default (`liveops.defaults.ts`), `null` turns that piece off. The answer is cached 30 s per process.

```json
{
  "_id": "live",
  "goal": { "id": "g2-takedowns", "label": "Land 20,000 takedowns together", "metric": "takedowns", "target": 20000,
            "rewardItem": "coat.sage.loop.moss", "rewardName": "Moss coat for Sage",
            "startsAt": "2026-12-15T00:00:00Z", "endsAt": "2027-01-05T00:00:00Z" },
  "featuredMode": { "id": "classic", "endsAt": "2026-11-30T00:00:00Z" },
  "featuredQuests": ["Win 2 Classic matches"],
  "vote": null
}
```

- `metric`: `matches` (any finished match), `wins`, or `takedowns` (kills + assists, at most 60 a match).
- Rewards must be palette coats the game already draws (`render/cosmetics.ts` FREE_COATS: Treat Track coats and the
  `coat.<hero>.loop.<palette>` loop coats). A claimed coat joins the player's free unlocks; `config/me` lists them so a
  new device gets them back. The Treat Track skips a coat the player already owns.
- `featuredMode.id` must be a live mode (`blitz`, `skirmish`, `classic`).

## Founder calls (defaults in force)

1. Goal target: 2,000 matches by Dec 15 (no traffic data behind it). Raise or lower it in the doc.
2. Vote concepts: "Aurora Frost" (Sage) vs "Candy Cane" (Brutus). The winner needs art later.
3. Guests can vote (one vote per guest account). Switch to registered-only if ballot stuffing shows up.

## Follow-ups

- "Calm Pudding 100,000 times" needs a per-slot Pudding count in the verified stats: a sim change (new `SlotStats`
  field), so a later sim version. Until then the goal counts matches, wins or takedowns.
- Featured quests are display lines only; quest rewards for the featured mode belong to the quests sync work.
- Guest → account merge does not carry `pawlegendsliveops` yet (the coats stay in the device's unlocks).
