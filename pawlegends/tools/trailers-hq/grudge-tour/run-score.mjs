// bundle a scratch script with the worktree's vite (TS imports without extensions), then run it
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const PKG = decodeURIComponent(new URL("../../..", import.meta.url).pathname).replace(/\/$/, "");
const { build } = await import(`${PKG}/node_modules/vite/dist/node/index.js`);
const entry = process.argv[3];
const r = await build({ configFile: false, mode: 'production', root: PKG, logLevel: 'silent', define: { 'import.meta.env': '{}' },
  build: { write: false, minify: false, target: 'es2022', ssr: true, rolldownOptions: { input: entry, output: { codeSplitting: false } } } });
const out = (Array.isArray(r) ? r : [r]).flatMap((x) => x.output).filter((o) => o.type === 'chunk');
const file = entry.replace(/\.mjs$/, '.bundle.mjs');
writeFileSync(file, out[0].code);
await import(pathToFileURL(file).href);
