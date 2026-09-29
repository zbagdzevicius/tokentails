# Track E — Monitor, don't build

For programs that aren't worth building for yet (Ronin, Superteam, the 2027 Lithuanian travel
subsidy) and for **catching new calls within hours**. A scan checks 31 verified sources in ~20
seconds and tells you only what changed; the triage prompt sorts changes into the other tracks.

## The fast loop

```bash
node bin/fund.mjs e:scan                  # fetch all sources, diff against state, write applications/E-CHANGES.md
node bin/fund.mjs e:triage --run --apply  # AI triage → scaffold every new YES row + add it to portfolio/opportunities.json as COND
node bin/fund.mjs go                      # the portfolio autopilot picks the new apps up once you confirm them
node bin/fund.mjs e:remind                # parked Track E applications whose revisit date has arrived
```

Run `e:scan` daily (cron, launchd or n8n). The first scan baselines every source (`NEW`); after
that you only see `CHANGED` rows with the new items listed. One failing source never stops the
others; it shows as `ERROR` and the scan still exits 0.

## From triage to applications, automatically

`e:triage` asks the AI for a readable table **and** a fenced ```json array
(`[{source, opportunity: YES|NO|CHECK, track, program, url, deadline, reason}]`). `--apply` parses
that block and, for each YES row:

| Rule | Result |
|---|---|
| Program is BGA, Mantle, SCF / Stellar Community Fund or Giveth | `EXCLUDED` |
| In-person, relocation, residency | `EXCLUDED` (not remote) |
| VC / equity ("no equity" and "equity-free" are fine), token sale, exchange listing, market maker, matching fund, free, cloud or "in credits" offers | `EXCLUDED` (not a grant) |
| Same slug, URL or program as an existing application or portfolio entry (or earlier in the batch) | `DUPLICATE` |
| Deadline already passed | `SKIPPED` |
| Anything else | `ADDED`: `fund new <slug> --track <X> --program … --url … --deadline …`, plus a portfolio entry with verdict `COND`, `condition_met: false` and the AI's reason in `notes` |

NO and CHECK rows are listed, never scaffolded. An unknown track letter falls back to B.
If the answer contains several fenced json blocks, the last one that parses wins (the prompt asks
for it last). The portfolio is saved after every scaffold, so a failure mid-batch never leaves an
application without its portfolio entry; a failed `fund new` shows as `FAILED` and the command exits 1.

```bash
node bin/fund.mjs e:triage --run --apply            # saves the raw answer to applications/E-TRIAGE.md
node bin/fund.mjs e:triage --apply --from applications/E-TRIAGE.md --dry   # re-apply an edited answer; --dry writes nothing
```

The human step that stays: confirm each new COND entry (live, remote, a real grant), fill in
`capital_mid_usd` and `success`, set `"condition_met": true`, then `fund go`. The exclusion screen
is a keyword backstop for the prompt's own rules, not a replacement for that read.

## Source kinds

| kind | Compares | `extract` |
|---|---|---|
| `json` | List of items (or a scalar) at a dot path | dot path, e.g. `data.items`; empty = root. `item` template: `"{title} — {rewardAmount} {token}"` |
| `rss` | RSS `<item>` / Atom `<entry>` titles | — (use `keywords` to filter) |
| `html` | Regex capture group 1 across the page, or a hash of visible text (scripts and styles ignored) | regex, e.g. `kvietimai/([a-z0-9-]{20,})` |
| `wp-modified` | A WordPress page's `modified` field | the page id |
| `status` | The HTTP status code — e.g. an EU topic JSON that 404s until the call is published | — |

`keywords` (optional) keeps only list items containing one of the words.

## Add a source in under a minute

```bash
node bin/fund.mjs e:add nouns-forum https://discourse.nouns.wtf/latest.rss --kind rss --keywords grant,proposal --feeds D
node bin/fund.mjs e:scan --only nouns-forum
```

## Park a program here

```bash
node bin/fund.mjs new ronin-pod --track E --program "Ronin Proof of Distribution" --url https://docs.roninchain.com/proof-of-distribution
# in applications/ronin-pod/call.md set:  watch: [ronin-pod-docs]   revisit: 2027-01-15
node bin/fund.mjs check ronin-pod
```

`fund check` fails if a `watch:` id isn't in `watchlist.json`, and warns when the revisit date has
arrived.

## Files

- `watchlist.json` — sources (verified responding on the date in each `verified` field). `feeds_track: "orc"` marks competition and bounty sources that feed the orc flows in `funding/orchestrator/examples/` rather than a fund track.
- `state.json` — last value per source (git-ignored; delete it to re-baseline).
- `prompts/triage.md` — the triage prompt, including the remote-only, grants-and-accelerators-only
  and excluded-program rules.
- `applications/E-CHANGES.md` — the latest scan's changes (written by `e:scan`).

- `applications/E-TRIAGE.md` — the latest raw triage answer (written by `e:triage --run --apply`).

Env overrides for tests or a second watchlist: `FUND_E_WATCHLIST`, `FUND_E_STATE`, `FUND_E_CHANGES`,
`FUND_E_TRIAGE`, `FUND_PORTFOLIO`, `FUND_NOW`.
