// Verifies manifest frame counts against actual non-empty 48px cells in each sheet row.
const sharp = require('sharp'); const m = require('../../public/assets/manifest.json');
(async () => {
  let bad = 0;
  for (const kind of ['cats', 'dogs']) for (const c of m[kind]) {
    const { data, info } = await sharp('public/assets/' + c.sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    c.rows.forEach((r, ri) => {
      let n = 0;
      for (let col = 0; col < info.width / 48; col++) {
        let any = false;
        for (let y = ri * 48; y < ri * 48 + 48 && !any; y++) for (let x = col * 48; x < col * 48 + 48; x++) if (data[(y * info.width + x) * 4 + 3] > 0) { any = true; break; }
        if (any) n = col + 1;
      }
      if (n !== r.frames) { bad++; console.log(kind, c.id, r.name, 'row', ri, 'manifest', r.frames, 'sheet', n); }
    });
    const rowsInSheet = info.height / 48; if (rowsInSheet !== c.rows.length) console.log(kind, c.id, 'sheet rows', rowsInSheet, 'manifest', c.rows.length);
  }
  console.log('mismatches', bad);
})();
