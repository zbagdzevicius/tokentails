# H-HOSTING notes (Oct 16)

For the other lanes and the integrator:

- `RAVE_PATHS` is in `src/config.ts`: `{ status: '/rave/status', checkout: '/rave/checkout', cats: '/rave/cats', order: '/rave/orders/' }`.
  To build an order URL, append the id: `${api}${RAVE_PATHS.order}${id}`. The `usdc-tx` and webhook paths are not in it. The USDC lane builds `${RAVE_PATHS.order}${id}/usdc-tx`.
- `API_BY_HOST` now covers `localhost` and `127.0.0.1` on ports 4180 and 5180–5189. It is still keyed by host, so `/rave` on tokentails.com resolves to `https://api.tokentails.com` and `main.ts` needs no change.
- `LINKS.self` is `https://tokentails.com/rave`. `share.ts` keeps using `location.pathname` on the site, which is `/rave` because the rewrite keeps the URL.
- `vite.config.ts` has `server.fs.allow = [searchForWorkspaceRoot(cwd), '../shelter-rail/src']`, so the USDC tab can import `../../../shelter-rail/src/sdk.mjs` in dev.
  Typing is up to the checkout lane. `src/checkout/_probe.ts` currently fails `tsc` with TS7016 (no declaration for `sdk.mjs`). Add a `.d.ts` or `// @ts-expect-error`. H-HOSTING did not touch it.
- `build:client`: `RAVE_BASE=/rave/` writes to `../client/public/rave`, emptied first. It has NOT been run. A trial build into a scratch dir gave `/rave/favicon.svg` and `/rave/build/*.js|css` as expected.
  The integrator runs it once and commits `client/public/rave`. Until then `/rave` is a 404.
- `client/next.config.js` has `const raveRewrites = [{ source: "/rave", destination: "/rave/index.html" }]`. It is spread into the plain rewrites array and into `afterFiles` of the Bad Cat branch. It applies to web builds only.
