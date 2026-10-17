# L-DJ notes

## What main can use beyond `DjApi`

`createDj` returns `DjExtApi` (exported from `src/dj/index.ts`), a superset of `DjApi`:

- `shout(text, seconds = 3.2)`: comic speech bubble over the DJ's head, top priority. Suggested in
  `feed.subscribe` next to `hud.shout`: `dj.shout(\`Cat #${cat.index + 1} just landed!\`)`. Without it,
  `pointAt()` already pops a generic "Welcome to the rave!" bubble.
- `swordUp`: true while the sword is up.

To use it, main would `import { createDj, type DjExtApi } from './dj'` (the return type already is
`DjExtApi`, so `const dj = createDj(...)` gets it with no cast). No types.ts change needed; if the spec owner
wants it shared, add `shout(text: string, seconds?: number): void` to `DjApi`.

## Drop wiring

The DJ subscribes to `clock.on('drop')` itself (types.ts says "Auto on every 'drop' event"), and main also
calls `dj.raiseSword()` + `dj.confetti()` on drop. Calls within 300 ms are merged, so this gives one sword and
one burst. Either side may drop its call. A drop with `cause: 'new-cat'` skips the catchphrase bubble, so
the new-cat welcome wins.

## Coordinates used

- `root` sits at `world.boothTop` (deck space). Decks are centred at z = −0.22 on the booth top. The kitten
  stands behind the booth at z = −0.8 on a dark riser that reaches the floor, and is scaled by `LAYOUT.djScale`.
- The controller is 1.62 × 0.62 m, so it fits on the 2.4 × 1.2 booth.
- `headPosition()` gives roughly world (0, 1.75, −0.75). The bubble sits above it and is sized by camera distance.

## Requests and gaps

- Nothing needed in types.ts or config.ts.
- `confetti(amount)` with an explicit amount is never deduped. The default amount is 45% of
  `profile.confetti`, plus a trickle while the sword is up.
- Bows are world-space and land on y = 0.012. They pass through the booth and cats; there is no collision.
- Reduced motion is not wired into the DJ. The sword glint and bows don't strobe, so nothing in this
  lane flashes faster than 3/s.
