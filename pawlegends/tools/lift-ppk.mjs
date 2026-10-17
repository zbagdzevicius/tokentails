#!/usr/bin/env node
/**
 * npm run lift: copy a listed set of Pink Paw Knight (swordcat) files into pawlegends/ with a provenance header
 * (PPK commit, source path, licence note), POC.md §3 and §17 step 4.
 *
 * Three kinds of file:
 * - LISTED: the §17 step-4 list, placed where §3 puts them (render/, input/, ui/).
 * - SUPPORT: modules the listed files import, lifted whole under src/render/ppk/<same path as in PPK>.
 * - STUBS: PPK modules we do not lift (game-specific or replaced by the sim); a small generated stand-in under
 *   src/render/ppk/stubs/ that exports the names the lifted files use.
 *
 * Every relative import in a lifted file is resolved against its PPK path and rewritten to the pawlegends path of
 * the lifted (or stubbed) target. An import the tables do not cover is an error, so the lift never ships a dangling
 * path. The `INPUT.presets` and `INPUT.keys` blocks of PPK `src/core/config.js` are also written out as data
 * (src/input/ppkInput.data.js).
 *
 * A lifted file that was edited after the lift (anything below the header differs from a fresh lift) is not
 * overwritten unless --force; edits to lifted files are marked with a `pawlegends:` comment.
 *
 *   node tools/lift-ppk.mjs [--ppk ../swordcat] [--check] [--force]
 *
 * --check exits 1 when a lifted file is missing or lacks its provenance header (POC.md §15 item 26).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const arg = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};

export const LICENCE_NOTE = 'all rights reserved, pending founder decision';

/** [PPK path, pawlegends path] for the §17 step-4 list. */
export const LISTED = [
  ['src/camera/IsoRig.js', 'src/render/camera/IsoRig.js'],
  ['src/camera/Picker.js', 'src/render/camera/Picker.js'],
  ['src/camera/Occluders.js', 'src/render/camera/Occluders.js'],
  ['src/camera/CameraShake.js', 'src/render/camera/CameraShake.js'],
  ['src/core/Input.js', 'src/input/Input.js'],
  ['src/core/toon.js', 'src/render/toon.js'],
  ['src/companions/abilityAim.js', 'src/input/abilityAim.js'],
  ['src/ui/touch.js', 'src/input/touch/touch.js'],
  ['src/ui/touchLayout.js', 'src/input/touch/touchLayout.js'],
  ['src/ui/abilityBar.js', 'src/ui/abilityBar.js'],
  ['src/ui/hpBars.js', 'src/ui/hpBars.js'],
  ['src/ui/messages.js', 'src/ui/messages.js'],
  ['src/ui/inputGlyph.js', 'src/ui/inputGlyph.js'],
  ['src/ui/ui.css', 'src/ui/ppk-ui.css'],
  ['src/fx/GroundDecals.js', 'src/render/fx/GroundDecals.js'],
  ['src/fx/Telegraphs.js', 'src/render/fx/Telegraphs.js'],
  ['src/fx/DamageNumbers.js', 'src/render/fx/DamageNumbers.js'],
  ['src/fx/Particles.js', 'src/render/fx/Particles.js'],
  ['src/fx/Shockwaves.js', 'src/render/fx/Shockwaves.js'],
  // POC.md §3 audio/sfx.ts: zzfx parameter arrays + the node-safe zzfx sample builder (no imports).
  ['src/audio/sfxDefs.js', 'src/audio/sfxDefs.js'],
];

/** Lifted whole because a listed file imports them; placed at src/render/ppk/<path minus src/>. */
export const SUPPORT = [
  'src/core/config.js',
  'src/core/math.js',
  'src/core/events.js',
  'src/core/brand.js',
  'src/core/uber.js',
  'src/world/HeightFog.js',
  'src/world/tone.js',
  'src/fx/shaders.js',
  'src/fx/palette.js',
  'src/fx/util.js',
  'src/fx/Marks.js',
  'src/characters/palette.js',
  // upright PPK-style heroes (src/render/chars/): the pose library + IK, and the geometry builder / colour helpers
  'src/characters/Poses.js',
  'src/characters/util.js',
  'src/ui/dom.js',
  'src/ui/icons.js',
  'src/ui/text.js',
  'src/ui/cursor.js',
  'src/ui/reveal.js',
  'src/ui/settings.js',
  'src/ui/tricks.css',
  'src/companions/steering.js',
  'src/companions/Bubble.js',
];

/** Not lifted: a generated stand-in exporting what the lifted files import. */
export const STUBS = {
  'src/physics/Pathfind.js': {
    why: 'navigation is the sim\'s integer A* (src/sim/nav/astar.ts); render code must not path-find',
    body: 'export function findPath() { return null; }\nexport function reachableIslands() { return null; }\n',
  },
  'src/characters/Readability.js': {
    why: 'PPK character readability pass; Pawlegends heroes get their own outline in render/',
    body: 'export function setHighlight() {}\n',
  },
  'src/ui/portraits.js': {
    why: 'PPK kitten portraits (needs the PPK character configs); Pawlegends hero portraits come from the bake',
    body: "export function portraitSVG() { return ''; }\n",
  },
  'src/core/Assets.js': {
    why: 'PPK asset loader; characters/util.js only needs a URL resolver (Pawlegends characters load no asset files)',
    body: "export function assetUrl(p) { return `${(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './'}assets/${p}`; }\n",
  },
  'src/story/strings.js': {
    why: 'PPK story copy is not used in Pawlegends; ui/text.js reads the one key below at load',
    body: "export const S = Object.freeze({ 'credits.pinkpaw': Object.freeze({ default: '' }) });\n",
  },
};

const supportDest = (p) => `src/render/ppk/${p.replace(/^src\//, '')}`;
const stubDest = (p) => `src/render/ppk/stubs/${p.replace(/^src\//, '')}`;

/** PPK path → pawlegends path for every file the lift writes. */
export function destMap() {
  const m = new Map();
  for (const [from, to] of LISTED) m.set(from, to);
  for (const p of SUPPORT) m.set(p, supportDest(p));
  for (const p of Object.keys(STUBS)) m.set(p, stubDest(p));
  return m;
}

const isCss = (p) => p.endsWith('.css');

export function header(commit, from, kind) {
  const lines = [
    `Lifted from Pink Paw Knight (swordcat) at commit ${commit}: ${from}${kind === 'stub' ? ' (generated stub, not the PPK file)' : ''}`,
    `Licence: ${LICENCE_NOTE} (POC.md §17, GDD §12 decision #3). Not MIT.`,
    'Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".',
  ];
  return isCss(from) ? `/*\n${lines.map((l) => ` * ${l}`).join('\n')}\n */\n` : `${lines.map((l) => `// ${l}`).join('\n')}\n`;
}

export const HEADER_RE = /Lifted from Pink Paw Knight \(swordcat\) at commit [0-9a-f]{4,40}: /;

/**
 * Ported files: our own rewrite of a PPK idea (integer maths for the sim; the TypeScript character rebuild in
 * src/render/chars/), not a copy. They are not produced by this
 * tool but carry the same provenance and licence note, with "Ported from" instead of "Lifted from" (§15 item 26).
 */
export const PORTED = [
  ['src/physics/Pathfind.js', 'src/sim/nav/astar.ts'],
  ['src/companions/abilityAim.js', 'src/sim/bots/casts.ts'],
  // upright PPK-style characters (render only): our TypeScript rebuild of the cheap-tier kitten recipe
  ['src/characters/KittenBuilder.js', 'src/render/chars/skeleton.ts'],
  ['src/characters/KittenBuilder.js', 'src/render/chars/chibi.ts'],
  ['src/characters/Accessories.js', 'src/render/chars/gear.ts'],
  ['src/characters/BeastHead.js', 'src/render/chars/beast.ts'],
  ['src/player/SwordcatModel.js', 'src/render/chars/motion.ts'],
];
export const PORT_HEADER_RE = /Ported from Pink Paw Knight \(swordcat\) at commit [0-9a-f]{4,40}: /;
export function portHeader(commit, from) {
  return (
    `// Ported from Pink Paw Knight (swordcat) at commit ${commit}: ${from} (integer rewrite, not a copy)\n` +
    `// Licence: ${LICENCE_NOTE} (POC.md §17, GDD §12 decision #3). Not MIT.\n`
  );
}
/** A file whose opening comment says it ports, rewrites or adapts PPK code needs a lifted or ported header. */
const PORT_CLAIM_RE = /\b(port(ed|s)?|rewrit(e|ten)|adapt(ed|s)?|cop(y|ied) of)\b[^;{}]{0,160}?(swordcat|Pink Paw Knight|\bPPK\b)/i;
export function unmarkedPorts(root) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const out = [];
  for (const abs of walk(path.join(root, 'src'))) {
    if (!/\.(ts|js|mjs|css)$/.test(abs)) continue;
    const head = fs.readFileSync(abs, 'utf8').slice(0, 1500);
    if (HEADER_RE.test(head.slice(0, 400)) || PORT_HEADER_RE.test(head.slice(0, 400))) continue;
    if (PORT_CLAIM_RE.test(head)) out.push(path.relative(root, abs));
  }
  return out;
}

const SPEC_RE = /(\bfrom\s*|\bimport\s*\(?\s*|@import\s+)(['"])(\.{1,2}\/[^'"]+)\2/g;

/** Rewrite every relative specifier in `text` (a file at PPK path `from`) to its pawlegends path. */
export function rewriteImports(text, from, map) {
  const to = map.get(from);
  const missing = [];
  const out = text.replace(SPEC_RE, (all, pre, q, spec) => {
    const clean = spec.split('?')[0];
    const query = spec.slice(clean.length);
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), clean));
    const dest = map.get(target);
    if (!dest) {
      missing.push(`${from} imports ${spec} (${target})`);
      return all;
    }
    let rel = path.posix.relative(path.posix.dirname(to), dest);
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `${pre}${q}${rel}${query}${q}`;
  });
  return { text: out, missing };
}

function stripHeader(text) {
  return text.replace(/^(\/\/ [^\n]*\n){3}/, '').replace(/^\/\*\n( \* [^\n]*\n){3} \*\/\n/, '');
}

async function inputData(ppk, commit) {
  const mod = await import(pathToFileURL(path.join(ppk, 'src/core/config.js')).href);
  const json = (v) => JSON.stringify(v, null, 2);
  return (
    header(commit, 'src/core/config.js', 'data').replace('rewritten by tools/lift-ppk.mjs', 'none: data extracted by tools/lift-ppk.mjs') +
    '// The INPUT.presets and INPUT.keys blocks of PPK config, as plain data. src/input/presets.ts remaps them to MOBA\n' +
    '// defaults (POC.md §9).\n' +
    `export const PPK_INPUT_PRESETS = Object.freeze(${json(mod.INPUT.presets)});\n\n` +
    `export const PPK_INPUT_KEYS = Object.freeze(${json(mod.INPUT.keys)});\n`
  );
}

async function main() {
  const ppk = path.resolve(arg('--ppk') ?? process.env.PPK_DIR ?? path.join(PKG_ROOT, '..', '..', 'swordcat'));
  const check = flag('--check');
  const force = flag('--force');
  const map = destMap();
  const files = [
    ...LISTED.map(([from]) => ({ from, kind: 'listed' })),
    ...SUPPORT.map((from) => ({ from, kind: 'support' })),
    ...Object.keys(STUBS).map((from) => ({ from, kind: 'stub' })),
  ];
  const dataDest = 'src/input/ppkInput.data.js';

  if (check) {
    const bad = [];
    for (const f of [...files.map((x) => map.get(x.from)), dataDest]) {
      const abs = path.join(PKG_ROOT, f);
      if (!fs.existsSync(abs)) bad.push(`${f}: missing`);
      else if (!HEADER_RE.test(fs.readFileSync(abs, 'utf8').slice(0, 400))) bad.push(`${f}: no provenance header`);
    }
    for (const [, f] of PORTED) {
      const abs = path.join(PKG_ROOT, f);
      if (!fs.existsSync(abs)) bad.push(`${f}: missing`);
      else if (!PORT_HEADER_RE.test(fs.readFileSync(abs, 'utf8').slice(0, 400))) bad.push(`${f}: no "Ported from" header`);
    }
    for (const f of unmarkedPorts(PKG_ROOT)) bad.push(`${f}: says it ports PPK code but has no provenance header (add it to PORTED)`);
    if (bad.length) {
      console.error(bad.join('\n'));
      process.exit(1);
    }
    console.log(`lift check ok: ${files.length + 1} lifted and ${PORTED.length} ported files carry a provenance header`);
    return;
  }

  if (!fs.existsSync(path.join(ppk, 'src/core/config.js'))) {
    console.error(`no PPK checkout at ${ppk} (pass --ppk or PPK_DIR)`);
    process.exit(2);
  }
  const commit = execFileSync('git', ['-C', ppk, 'log', '-1', '--format=%h'], { encoding: 'utf8' }).trim();
  const missing = [];
  const skipped = [];
  let written = 0;
  const write = (rel, content) => {
    const abs = path.join(PKG_ROOT, rel);
    if (fs.existsSync(abs) && !force) {
      const cur = fs.readFileSync(abs, 'utf8');
      if (cur === content) return;
      if (stripHeader(cur) !== stripHeader(content)) {
        skipped.push(rel);
        return;
      }
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    written++;
  };

  for (const { from, kind } of files) {
    const to = map.get(from);
    if (kind === 'stub') {
      const s = STUBS[from];
      write(to, `${header(commit, from, 'stub')}// Not lifted: ${s.why}.\n${s.body}`);
      continue;
    }
    const src = fs.readFileSync(path.join(ppk, from), 'utf8');
    const r = rewriteImports(src, from, map);
    missing.push(...r.missing);
    write(to, header(commit, from, kind) + r.text);
  }
  write(dataDest, await inputData(ppk, commit));

  if (missing.length) {
    console.error(`unresolved imports (add the target to SUPPORT or STUBS):\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
  if (skipped.length) console.warn(`kept hand-edited files (rerun with --force to overwrite):\n  ${skipped.join('\n  ')}`);
  console.log(`lifted PPK @ ${commit}: ${written} written, ${files.length + 1 - written - skipped.length} unchanged, ${skipped.length} kept`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
