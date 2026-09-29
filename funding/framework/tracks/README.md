# Track plugin contract

Each track lives in `tracks/<dir>/` and default-exports an object from `track.mjs`:

```js
export default {
  id: 'A',                       // letter used in call.md `track:` and `fund new --track`
  name: 'Build once, submit many',
  defaultFrame: 'payout-rail',   // optional; used when `fund new` gets no --frame
  checks: [                      // optional; run by `fund check` after the core checks
    ({ app, facts, frames, core }) => ({ name: 'my-rule', level: 'ok' | 'warn' | 'error', detail: '...' }),
    // may return an array, or a Promise
  ],
  commands: {                    // optional; namespaced "<letter>:<verb>", dispatched by bin/fund.mjs
    'a:build': { help: 'one line', run: async ({ args, flags, core, runAI, tracks, invoke }) => 0 /* exit code */ },
  },
  noLoop: 'why',                 // optional; `fund loop` refuses this track (B: draft.md is generated)
  onScaffold: async ({ slug, dir, vars, core }) => {},  // optional; after templates are copied
};
```

- `tracks/<dir>/templates/` files are copied over the shared `templates/` on `fund new`, with
  `{{SLUG}} {{PROGRAM}} {{TRACK}} {{FRAME}} {{DEADLINE}} {{URL}} {{CREATED}}` substituted.
- `app` is `core.loadApp(slug)`: `{ slug, dir, call: {fm, body}, draft: {fm, body}, review,
  sections: [{title, criteria, limit, words, text, chars, wordCount}], criteria: [{id, name, weight, quote}] }`.
- Track code must stay dependency-free (Node built-ins only), except Track A's Foundry project.
- Tests go in `test/track-<letter>.test.mjs` and must pass with `npm test`.
- `tracks/<dir>/pipeline.mjs` (optional) customises the engine's steps for `fund plan/run/done`:
  `export default function pipeline(defaultSteps, helpers) { return steps; }`. The step contract,
  helpers (`replace`, `insertAfter`, `remove`, `checkErrors`, `strictErrors`, `humanMark`, …) and the
  optional step fields (`command`, `noOverride`, `wait`, `runWhenParked`) are in
  `lib/PIPELINE-CONTRACT.md`. Give every human step whose evidence a command writes a `command`, so
  `fund queue` and every `next:` line print that action instead of a `fund done` that is refused.
