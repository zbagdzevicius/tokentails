# Recording dev runs for par (GDD 4.5, 13.7)

Par paws come from five recorded runs by humans, not from a bot. bronze = the median of the five, silver = the
best, gold = floor(best × 1.15). `npm run par` replays each saved ghost through the real sim, under the rules
in its header (`simVersion`), and writes `src/content/par.json`. Content reads that file
(`parFor(roomId)` in `src/content/daily.ts`), so a new build shows the paws.

## 1. Play five runs per room

- Use the running dev server, http://localhost:5174 (or its HTTPS tunnel on a phone). Do not restart it.
  Touch input on a real phone gives the most honest par.
- Open the room:
  - a daily: `http://localhost:5174/#d=18`. Ranked and practice resolve the same room, so a practice run of a
    future day counts.
  - The Glass: `http://localhost:5174/#glass=1`.
  - a Kitchen variant (preview days before launch, `preview-NNN`): open Home before launch day; preview day 0 is
    `preview-001`, day −1 is `preview-002`, and so on.
- Play the way a decent new player would, not a speedrun. Caught runs count too, because they are part of
  the real score spread. Do not record the FTUE first heist (`m=f` links): its timing is different, and
  `par add` refuses those links.

## 2. Save each run as a ghost

On the result screen, use **Dare a friend** / **Share** and copy the link. It carries the run as `g=` (a
clip handoff link carries `rp=`, which works too). Then, in `bad-cat/`:

```sh
npm run par -- add 'https://tokentails.com/badcat/d/18?g=AQ3k...&c=Bv4...&n=Mochi'
npm run par -- add '<link 2>' '<link 3>'   # several at once
```

`add` decodes the ghost and finds its room from the room key in the ghost header, so any link form works
(`/badcat/d/18?g=`, `#d=18&g=`, or a bare payload). It writes `runs/<roomId>/run-<k>.ghost`: a `#` comment line
with the replayed score, then the payload. A payload that is already saved is skipped. Player rooms (`/r?r=`)
have no par and are rejected.

**With the QA hook** (`VITE_BADCAT_QA=1`; it is meant for QA and e2e, not for human runs):
`await window.__BADCAT_QA__.play(inputs)` returns a `RunResult` whose `inputs` you can turn into a
payload with `encodeGhostSync(inputs, roomId)` from `src/codec`. Save it by hand as
`runs/<roomId>/<name>.ghost`. Use this only to reproduce a human run you already have as inputs. Scripted
or searched inputs (`__BADCAT_QA__.scoring()`) are a bot and must never go into `runs/`.

## 3. Compute par

```sh
npm run par          # replays runs/*/*.ghost, writes src/content/par.json (rooms without runs keep their entry)
npm run par -- --dry # print only
npm run par -- --prune  # also drop entries of rooms that no longer have runs
```

The output warns about a room with fewer or more than five runs, a ghost recorded in another room, and a ghost
on older rules (it still replays bit-exact under those rules; re-record it for current-rule par after a
`SIM_VERSION` bump). Commit `runs/` together with `par.json`, so par can always be recomputed.

## Ghost file format

```
# daily-018 sim v5 score 6420 (Gremlin) saved 2026-11-20T10:00:00.000Z
AQ3k...base64url ghost payload (src/codec/ghost-codec.ts, deflated or not)
```

Blank lines and `#` lines are ignored, and the first other line is the payload.
