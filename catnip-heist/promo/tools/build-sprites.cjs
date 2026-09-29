// Builds promo/assets/sprites (copies of game assets + sprites.json + preview.png). Originals untouched.
// Run from catnip-heist/: node promo/tools/build-sprites.cjs
const fs = require('fs'), path = require('path'), sharp = require('sharp');
const SRC = 'public/assets', OUT = 'promo/assets/sprites';
const m = JSON.parse(fs.readFileSync(SRC + '/manifest.json', 'utf8'));
const HEROES = ['albertino', 'oreo']; // orange tabby + tuxedo: strong silhouette contrast on the dark purple bg
for (const d of ['cats', 'dogs', 'images', 'icons']) fs.mkdirSync(`${OUT}/${d}`, { recursive: true });
const cp = (a, b) => fs.copyFileSync(`${SRC}/${a}`, `${OUT}/${b}`);
const sheetEntry = (kind, c) => {
  cp(c.sheet, `${kind}/${c.id}.png`);
  return { id: c.id, name: c.name, sheet: `assets/sprites/${kind}/${c.id}.png`, frame: m.frame, cols: c.cols,
    rows: c.rows.map((r, i) => ({ name: r.name, frames: r.frames, row: i, bounds: r.bounds })) };
};
const cats = m.cats.map((c) => sheetEntry('cats', c));
const dogs = m.dogs.map((c) => sheetEntry('dogs', c));
const images = {};
for (const [k, v] of Object.entries(m.images)) { cp(v, `images/${path.basename(v)}`); images[k] = `assets/sprites/images/${path.basename(v)}`; }
const icons = {};
for (const [k, v] of Object.entries(m.icons)) { cp(v, `icons/${path.basename(v)}`); icons[k] = `assets/sprites/icons/${path.basename(v)}`; }
cp(m.font, 'catpaw.woff2');
cp('manifest.json', 'manifest.source.json');
const shelter = [];
for (const f of fs.readdirSync('src/levels').filter((f) => /^heist-\d+\.json$/.test(f)).sort()) {
  const j = JSON.parse(fs.readFileSync('src/levels/' + f, 'utf8'));
  if (j.crate) shelter.push({ level: j.id, id: j.crate.catId, name: j.crate.catName });
}
const palette = {
  // index.html :root / src/ui/styles.ts --ch-* tokens
  night: '#0d0616', plum: '#301934', violet: '#4b0082', grape: '#6f2da8', lavender: '#9966cc',
  coin: '#ffc93c', cream: '#fcecbb', ember: '#c1260f', rust: '#ee642a', pink: '#ff7aa2',
  mint: '#d5f4e5', sky: '#c4e2fc', lilac: '#f0c5fd', outline: '#2a0f1f', grape2: '#5a2190',
  // src/render/backdrop.ts sky gradient
  skyTop: '#07030e', skyMid: '#1d0b33', skyLow: '#3a1648', cityDark: '#12071f', windowGlow: '#ffc93c',
  // src/render/fx.ts + level.ts catnip coin / glow
  catnip: '#9be15d', catnipDeep: '#5fbf3a', catnipGlow: '#b6f36a', catnipPale: '#eaffc0', catnipEmissive: '#3a7a20',
  // src/render/GameRenderer.ts guard vision cone states + flashes
  conePatrol: '#ffc62e', coneSniff: '#ffe08a', coneInvestigate: '#ff7a1a', coneAlert: '#ff2e22', alertFlash: '#ff2a1a',
  alertRed: '#ff3b2e', vaultOpen: '#7cff9a', rescueFlash: '#fff3d0', meowRing: '#b6f36a',
  // src/render/level.ts world colors
  floorA: '#7b5aa6', floorB: '#6c4c98', rug: '#b0406e', wall: '#4a2c6e', trim: '#d9b8f5', box: '#c98a4b',
  vault: '#51466e', crateWood: '#9b6235', crateBars: '#cfc3e6', platePad: '#5a8f80',
  // semantic aliases for scenes
  bg: '#0d0616', bgAlt: '#301934', accent: '#9be15d', gold: '#ffc93c', alert: '#ff2e22', text: '#fcecbb', textDim: '#9966cc',
};
const json = {
  frame: m.frame,
  note: 'Rows are in manifest order: row index = position in rows[] (verified visually + by alpha scan). Frames laid out left-to-right from col 0; sprites face RIGHT. eldrem is a dragon whose wings overflow its 48px cells (neighbouring rows bleed) - avoid close-ups of it. Use imageSmoothingEnabled=false.',
  heroes: HEROES, specials: ['amberclaw','beaver','eldrem','fox','goat','hana','moose','owl','raccon','solo-survivor','sticky','yak'], specialsNote: 'non-cat or oversized sprites (dino, dragon, human, owl, ghost...) - fun for the mosaic, eldrem/amberclaw/solo-survivor fill the whole cell, beaver/sticky/moose are tiny',
  shelter: shelter.map((s) => s.id), shelterDetail: shelter,
  cats, dogs, images, icons, font: 'assets/sprites/catpaw.woff2', fontFamily: 'Cat Paw', palette,
};
fs.writeFileSync(`${OUT}/sprites.json`, JSON.stringify(json, null, 1));

// ---- preview.png: IDLE frame 0 of every cat + every dog, then heroes' rows, images
(async () => {
  const S = 3, cell = 48 * S, W = 12, pad = 8, lab = 22, cw = cell + pad, ch = cell + lab + pad;
  const all = [...cats.map((c) => ['cat', c]), ...dogs.map((d) => ['dog', d])];
  const gridRows = Math.ceil(all.length / W);
  const heroRowsH = HEROES.length * (cell + lab + pad);
  const width = W * cw + pad, height = 50 + gridRows * ch + 40 + heroRowsH + 40 + 200;
  const comps = [], svg = [];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  svg.push(`<text x="${pad}" y="34" font-family="Helvetica" font-size="26" fill="${palette.coin}">Catnip Heist sprite kit — IDLE f0 of ${cats.length} cats + ${dogs.length} dogs (dogs: WALKING f0). ★ hero  ⌂ shelter cat</text>`);
  const frameBuf = async (e, rowName, f) => {
    const r = e.rows.find((x) => x.name === rowName) || e.rows[0];
    return sharp(OUT.replace('promo/assets/sprites', 'promo') + '/' + e.sheet).extract({ left: f * 48, top: r.row * 48, width: 48, height: 48 })
      .resize(cell, cell, { kernel: 'nearest' }).png().toBuffer();
  };
  for (let i = 0; i < all.length; i++) {
    const [kind, e] = all[i], x = pad + (i % W) * cw, y = 50 + Math.floor(i / W) * ch;
    comps.push({ input: await frameBuf(e, kind === 'cat' ? 'IDLE' : 'WALKING', 0), left: x, top: y });
    const isCat = kind === 'cat';
    const tag = (isCat && HEROES.includes(e.id) ? '★ ' : '') + ((isCat && json.shelter.includes(e.id)) ? '⌂ ' : '') + (kind === 'dog' ? 'DOG ' : '') + e.id;
    svg.push(`<text x="${x + cell / 2}" y="${y + cell + 16}" text-anchor="middle" font-family="Helvetica" font-size="15" fill="${!isCat ? palette.rust : HEROES.includes(e.id) ? palette.coin : json.shelter.includes(e.id) ? palette.catnip : palette.cream}">${esc(tag)}</text>`);
  }
  let y0 = 50 + gridRows * ch + 30;
  svg.push(`<text x="${pad}" y="${y0 - 4}" font-family="Helvetica" font-size="20" fill="${palette.lavender}">Hero cats: frame 2 of each row (row order check)</text>`);
  for (const [hi, id] of HEROES.entries()) {
    const e = cats.find((c) => c.id === id);
    const y = y0 + 8 + hi * (cell + lab + pad);
    for (const [ri, r] of e.rows.entries()) {
      const x = pad + ri * (cell + 10);
      comps.push({ input: await frameBuf(e, r.name, Math.min(2, r.frames - 1)), left: x, top: y });
      svg.push(`<text x="${x + cell / 2}" y="${y + cell + 16}" text-anchor="middle" font-family="Helvetica" font-size="14" fill="${palette.mint}">${r.name}(${r.frames})</text>`);
    }
  }
  y0 += heroRowsH + 30;
  let x = pad;
  for (const [k, p] of Object.entries(images)) {
    const buf = await sharp('promo/' + p).resize({ height: 160, fit: 'inside' }).png().toBuffer();
    const md = await sharp(buf).metadata();
    comps.push({ input: buf, left: x, top: y0 });
    svg.push(`<text x="${x + md.width / 2}" y="${y0 + 180}" text-anchor="middle" font-family="Helvetica" font-size="15" fill="${palette.cream}">${k}</text>`);
    x += md.width + 30;
  }
  const sw = 60; let px = x + 20;
  const pal = ['night', 'plum', 'grape', 'lavender', 'catnip', 'coin', 'cream', 'alert', 'rust', 'pink', 'mint'];
  pal.forEach((k, i) => { const cx = px + (i % 6) * (sw + 6), cy = y0 + Math.floor(i / 6) * 90;
    svg.push(`<rect x="${cx}" y="${cy}" width="${sw}" height="${sw}" fill="${palette[k]}" stroke="#fff" stroke-opacity=".3"/><text x="${cx + sw / 2}" y="${cy + sw + 16}" text-anchor="middle" font-family="Helvetica" font-size="13" fill="${palette.cream}">${k}</text>`); });
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${palette.skyMid}"/>${svg.join('')}</svg>`);
  await sharp(bg).composite(comps).png().toFile(`${OUT}/preview.png`);
  console.log('ok', width, height, 'cats', cats.length, 'dogs', dogs.length);
})();
