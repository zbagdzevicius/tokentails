# Core command modules

Each file here default-exports one command definition (or an array of them). `bin/fund.mjs`
loads them all at startup; a module name must not clash with a built-in (`new`, `check`, `prompt`,
`status`, `tracker`, `list`, `facts`, `tracks`) or another module.

```js
export default {
  name: 'verify',                         // the CLI verb: node bin/fund.mjs verify <slug>
  help: '<slug> | --all — one line shown in fund help',
  booleanFlags: ['all', 'offline'],       // flags that never take a value
  async run({ args, flags, core, runAI, tracks, invoke }) {
    // core    — CORE from lib/core.mjs
    // runAI   — (prompt, { label: '<slug>/<step>', model }?) => string: one orc session
    //           (or $FUND_AI_CMD when set)
    // tracks  — loaded track plugins keyed by id
    // invoke  — (argv[]) => Promise<exitCode>, runs any fund command in-process
    return 0;                             // exit code
  },
};
```
