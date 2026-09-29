# Track B: quick rolling forms

This track covers the eight short online forms in AI-EXECUTION-PLAN.md §5: Game3 Grants, SKALE SIP-6
forum post, Sonic Innovator Fund, Beam Foundation, IMX Developer Incentives, MegaETH Mega Mafia,
Mastercard Start Path and Artizen Fund. Each form is described once in `form.md`, answered from
pre-approved blocks and facts, and turned into a copy-paste sheet. The plan is to do all eight in
one sitting.

## Files per application

| File | What it is |
|---|---|
| `form.md` | One row per form field: `\| id \| label \| type \| limit \| required \| source \|` (optional 7th column: criterion ids) |
| `answers.md` | `### <field id>` free answers. A real answer here **overrides** the field's source. `TODO` counts as empty. Any other heading (`## Notes`) ends the answer, so notes below it are never pasted. Hard-wrapped lines are joined; a blank line starts a new paragraph; lines starting `- `, `* `, `1. ` stay on their own line. An id that matches no field (a typo) or appears twice is warned about |
| `call.md` | Frontmatter holds `fm:` values: `website`, `ask` (plain number), `contact` (a role address only) |
| `fill.md` | Generated paste sheet: every field in a copy block with its count against the limit. Never edit it |
| `draft.md` | Generated mirror of the prose fields so `fund check` runs citation, banned-term and placeholder rules on the real text |

- **type**: `text` (one line) · `longtext` · `url` · `select` · `number` · `email-role` (the local part
  must be a role like hello, team or grants; personal addresses fail)
- **limit**: `140` means characters and `150w` means words. For `select`, list the options as
  `Gaming/AI/Other`. Limits are counted on the pasted text, and `[F-###]` citations are stripped first.
- **source**: `block:<frame>/<Heading>` (or `block:<Heading>`, which uses the app's frame) from
  `facts/BLOCKS.md` · `fact:F-###` · `answer` · `fm:<call.md key>`

## The fast loop

```sh
node bin/fund.mjs new sonic-innovator --track B --program "Sonic Innovator Fund" --frame high-throughput \
  --url https://docs.soniclabs.com/funding/innovator-fund
#   match form.md to the live form: edit the table, or append fields in one command:
node bin/fund.mjs b:new-form sonic-innovator --fields "chain:Current chain:text:100:yes;volume:Migration projection:longtext:500:yes"
#   set ask: (plain number) and contact: (role address) in call.md if the form asks for them
node bin/fund.mjs b:answer sonic-innovator --run   # AI drafts every empty or over-limit answer into answers.md
node bin/fund.mjs b:fill sonic-innovator           # writes fill.md; exits 1 with a list if anything is missing or too long
node bin/fund.mjs check sonic-innovator            # core rules plus B:form/sources/required/answers/limits/types/content/fresh
#   human reads fill.md, pastes it into the form
node bin/fund.mjs status sonic-innovator submitted --next "Wait for reply; chase in 2 weeks"   # also regenerates TRACKER.md
```

`--run` pipes the prompt to `$FUND_AI_CMD` (default `claude -p`). The reply may be wrapped in a code
fence, use decorated headings or merge citations (`[F-015, F-016]`); b:answer fixes all three. When
the AI cannot answer from the facts it writes `TODO: <what is missing>`; b:answer then says so and
prints which `### id` to answer by hand, and b:fill shows the reason instead of suggesting another
AI run. The stock template's `summary` points at the
frame's One-liner block, which is over 140 characters in most frames, so the first `b:answer --run`
writes a trimmed override for it. The frame decides which block text the `block:<Heading>` sources
use and which terms are banned, so pick it on `new` (`game-studio` is the default).

For the batch sitting:

```sh
node bin/fund.mjs b:batch    # fills and checks every open Track B app, ranks them ready / needs answers / blocked,
                             # and writes applications/B-BATCH.md with minutes per form and the next command for each
```

Work from the top of B-BATCH.md down. Rows marked "needs answers" can be fixed by editing
answers.md (or running `b:answer --run`). Rows marked "blocked" need someone else to act first:
a missing block or fact, an unverified fact in a strict status, or a passed deadline.

`b:answer <slug>` without `--run` prints the prompt so you can paste it into any chat.
`--all` redrafts every answer field, not only the failing ones. It never writes `fm:` fields, URLs,
numbers or emails, because those are decisions and must not be invented.

## Add a new program in under 5 minutes

1. Open the form. List its fields in one command. This creates the app if it does not exist and
   adds `TODO` stubs to answers.md:

   ```sh
   node bin/fund.mjs b:new-form megaeth-mafia --program "MegaETH Mega Mafia" --url https://www.megaeth.com/builder --frame high-throughput \
     --fields "name:Project name:text:60:yes;pitch:One-liner:text:140:yes:block:One-liner;desc:What are you building:longtext:1000:yes;web:Website:url::yes:fm:website;email:Email:email-role::yes:fm:contact"
   ```

   The spec is `id:label:type:limit:required[:source]`, with fields separated by `;`. The source
   defaults to `answer`. On an existing Track B app, new ids are appended and existing ids are kept.
   `--force` replaces form.md, and `--print` only prints the rows.
2. Set `contact:` (a role address) and `ask:` in call.md if the form asks for them.
3. `node bin/fund.mjs b:answer megaeth-mafia --run`, then `node bin/fund.mjs b:fill megaeth-mafia`.
   Fix whatever it lists and re-run until it exits 0.

## Rules this track enforces

- Numbers in prose answers must cite FACTS.md. The check reuses `coreChecks` per field, so an
  uncited number, an unknown or retired fact, or a banned term fails the field. Unverified and SEI-era
  facts warn while drafting and fail from `in-review` onwards.
- Every `block:` heading and `fact:` id must exist, even when answers.md overrides the field.
- fill.md and draft.md must match what `b:fill` would write now (compared by content, so a changed
  `ask:` in call.md, block or fact is caught, and a git checkout or `touch` is not). Stale warns, and
  fails at `status: ready`.
- `number` and `url` values are checked with citations stripped, so `fact:F-001` feeds a number
  field. Any fact a non-prose field cites must exist; unverified and SEI-era ones warn, then fail
  from `in-review` onwards.
- A malformed citation (`[F-015, F-016]`, `[F-15]`, a bare `F-015`) fails the field, because only
  `[F-###]` is stripped and anything else would be pasted into the live form.
- `b:fill` and `b:answer` refuse apps whose call.md is not `track: B`, so they never overwrite another
  track's draft.md. A call.md without a `---` block reads as trackless: the b: commands say so,
  `b:batch` lists it as skipped, and `fund check` reports it as an error. (A UTF-8 byte-order mark is
  stripped by the core, so Windows Notepad files work.)
- SEI-era facts fail from `in-review` even when the sentence says "on SEI" (a core rule). Verify them
  in FACTS.md or drop them before moving a high-throughput form to review.
- Excluded programs are not in this track: BGA, Mantle, Stellar Community Fund, Giveth, investment
  options, credits.

Example: `applications/game3-grants/` has 12 fields, uses blocks from two frames, overrides a block
that was over its limit, and passes `fund check` and `b:fill`.
