/**
 * Catnip art (plan G8, decision #56): the botanical sprig masters, the derived rasters, the pinned
 * legacy names and the leaf audit.
 *
 * - Every raster is an integer nearest upscale of one master (decoded and compared pixel by pixel).
 * - Every file's bytes are pinned. A legacy name (`logo/catnip.webp`, `catnip-coin.png`, the Heist
 *   `catnip.webp`) may be overwritten only because this pin exists (F12 asset rule); changing the
 *   art means re-running the exporter and updating the pins in one reviewed change.
 *   The pins hash the committed files, so a `sharp` upgrade alone breaks nothing; but the encoder's
 *   bytes are only stable for one sharp/libvips version, so re-running the exporter after a sharp
 *   upgrade may change the bytes (not the pixels, which the decode check above proves). Then
 *   regenerate the pins: `node scripts/art/catnip-export.mjs` and copy the printed hashes here.
 * - The masters follow the art spec: a lavender spike at least 25% of the plant's height, separate
 *   leaf pairs, an asymmetric silhouette, soft mint greens, nothing yellow or face-like.
 * - The leaf audit: code references a catnip raster only through a v2 name or a pinned legacy name,
 *   and the game code this task owns references only v2 names.
 */
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import sharp from "sharp";

const CLIENT = path.resolve(__dirname, "..");
const REPO = path.resolve(CLIENT, "..");
const ART = path.join(CLIENT, "art", "catnip");

type Output = { path: string; master: number; scale: number; sha256: string; legacy?: boolean };

/** Byte pins. Mirrors OUTPUTS in scripts/art/catnip-export.mjs. */
const OUTPUTS: Output[] = [
  { path: "client/public/catnip/catnip-v2-16.png", master: 16, scale: 1, sha256: "844f11b0daef314157a5c314576de5e8c64c4e77f02b5c891f14b71059b31934" },
  { path: "client/public/catnip/catnip-v2-24.png", master: 24, scale: 1, sha256: "b96f3a0ccf557350e972eead0e61ff4ea0be6757063fa7890f439036b653e275" },
  { path: "client/public/catnip/catnip-v2-32.png", master: 32, scale: 1, sha256: "4d4181e93b7a77d74aafea0ad2d30c1a2ce4cf66abdfd5bc1f5ed6628da4dcb4" },
  { path: "client/public/catnip/catnip-v2-48.png", master: 24, scale: 2, sha256: "9407c604885cc8916d75f7a731aa04b6bd79aca24cabd792927200df80f050f4" },
  { path: "client/public/catnip/catnip-v2-64.png", master: 64, scale: 1, sha256: "1f21ca3ebdd84b0b844e29f8b4dfc21d9b334873456a3e46875f845184ab85fc" },
  { path: "client/public/catnip/catnip-v2-96.png", master: 32, scale: 3, sha256: "3a9e593dc518d6da773fd5faf9867cdca3e1b068aea6c942a136878eb49e45fa" },
  { path: "client/public/catnip/catnip-v2-72.png", master: 24, scale: 3, sha256: "cc536be2917b04becd2081371faedb6f5993c583e353ff1f401b0a679589dd2f" },
  { path: "client/public/catnip/catnip-v2-128.png", master: 64, scale: 2, sha256: "182cc58c2a95d261f4067b844030d56cd9ae09bfbbdb19b7539e48e46005e594" },
  { path: "client/public/catnip/catnip-v2-144.png", master: 24, scale: 6, sha256: "1adbcecad6e86a8724dfbb6a627f885c1467b4175e55b5971329ec872df7c328" },
  { path: "client/public/catnip/catnip-v2-192.png", master: 64, scale: 3, sha256: "acc6767b4bca648f8d274620d43302415f95094e7665098f2dc928159ee38d55" },
  { path: "client/public/catnip/catnip-v2-288.png", master: 32, scale: 9, sha256: "7e884df9a08a076a05a09c1193792e743191380508e3c1cc9a3057f16db70a42" },
  { path: "client/public/logo/catnip.webp", master: 64, scale: 5, legacy: true, sha256: "36c36523f24a66e0ba5b05794d5e69a0fb49ce69b5ce8112ef434aa816e36522" },
  { path: "client/public/catnip-chaos/items/catnip-coin.png", master: 32, scale: 1, legacy: true, sha256: "4d4181e93b7a77d74aafea0ad2d30c1a2ce4cf66abdfd5bc1f5ed6628da4dcb4" },
  { path: "catnip-heist/public/assets/images/catnip.webp", master: 32, scale: 3, legacy: true, sha256: "c1a55217ea863a587261a459fab22897462cd5043d0ad9e36c4fa19cccc729a3" },
  { path: "catnip-heist/public/assets/images/catnip-16.png", master: 16, scale: 1, sha256: "844f11b0daef314157a5c314576de5e8c64c4e77f02b5c891f14b71059b31934" },
];

/** The cannabis-leaf rasters these legacy names held before the sprig (git blobs of HEAD at G8). */
const PRE_SPRIG_SHA256 = [
  "27f29074800aeab926cb1c45e4525a160b43cdbe57f6c144b4d823c0c622c10f", // logo/catnip.webp
  "085325df793b7784e7d73cb1f9f90bf05b3eed8eb500823a19566a63461f2f36", // catnip-chaos/items/catnip-coin.png
  "28d0a472961f01c5c5e08f226f0e689793001219cf7a65d21549a2a81410f570", // heist images/catnip.webp
];

const palette: Record<string, [number, number, number]> = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(path.join(ART, "palette.json"), "utf8")).colors as Record<string, string>).map(
    ([ch, hex]) => [ch, [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]],
  ),
);

function master(size: number): string[] {
  return readFileSync(path.join(ART, `catnip-${size}.txt`), "utf8")
    .replace(/\r/g, "")
    .split("\n")
    .filter((row) => row.length > 0);
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(path.join(REPO, file))).digest("hex");

const LAVENDER = new Set(["p", "L", "w"]);
const GREEN = new Set(["d", "v", "m", "l", "S", "s"]);

describe("catnip masters (art spec)", () => {
  it.each([16, 24, 32, 64])("the %ipx master is square and uses only palette characters", (size) => {
    const rows = master(size);
    expect(rows).toHaveLength(size);
    for (const row of rows) {
      expect(row).toHaveLength(size);
      for (const ch of row) expect(ch === "." || ch in palette).toBe(true);
    }
  });

  it.each([16, 24, 32, 64])("the %ipx spike is lavender and at least 25%% of the plant's height", (size) => {
    const rows = master(size);
    const plantRows = rows.map((row, y) => ({ y, row })).filter(({ row }) => /[^.o]/.test(row));
    const spikeRows = rows.filter((row) => Array.from(row).some((ch) => LAVENDER.has(ch)));
    const height = plantRows[plantRows.length - 1].y - plantRows[0].y + 1;
    expect(spikeRows.length / height).toBeGreaterThanOrEqual(0.25);
    // The spike sits on top: the first plant row is lavender.
    expect(Array.from(plantRows[0].row).some((ch) => LAVENDER.has(ch))).toBe(true);
  });

  it.each([16, 24, 32, 64])("the %ipx sprig is asymmetric (no mirror image, unlike a leaf rosette)", (size) => {
    const rows = master(size);
    const fill = rows.map((row) => Array.from(row).map((ch) => ch !== "."));
    let mirrored = 0;
    let filled = 0;
    fill.forEach((row) => row.forEach((on, x) => {
      if (!on) return;
      filled++;
      if (row[size - 1 - x]) mirrored++;
    }));
    // A centred cannabis-style leaf mirrors almost perfectly; the tilted sprig does not.
    expect(mirrored / filled).toBeLessThan(0.8);
  });

  it.each([16, 24, 32, 64])("the %ipx leaves come in separate pairs (a stem-only gap between them)", (size) => {
    const rows = master(size);
    // Below the spike, find rows where the only non-outline pixels are stem pixels near the centre.
    const firstGreen = rows.findIndex((row) => Array.from(row).some((ch) => "dvml".includes(ch)));
    const leafRows = rows.map((row) => Array.from(row).some((ch) => "dvml".includes(ch)));
    // Count separate bands of leaf rows on the left half (one band per leaf of a pair).
    const leftBands = (() => {
      let bands = 0;
      let inBand = false;
      rows.forEach((row) => {
        const left = Array.from(row.slice(0, Math.floor(size * 0.4))).some((ch) => "dvml".includes(ch));
        if (left && !inBand) bands++;
        inBand = left;
      });
      return bands;
    })();
    expect(firstGreen).toBeGreaterThan(0);
    expect(leafRows.filter(Boolean).length).toBeGreaterThan(size * 0.25);
    expect(leftBands).toBeGreaterThanOrEqual(2);
  });

  it("the palette is soft mint and lavender: nothing yellow, nothing saturated green, no face colours", () => {
    for (const [ch, [r, g, b]] of Object.entries(palette)) {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      if (GREEN.has(ch)) {
        // Mint: green leads, blue close behind (no yellow-green), saturation moderate.
        expect(g).toBeGreaterThan(r);
        expect(b).toBeGreaterThan(r * 0.9);
        expect(sat).toBeLessThan(0.62);
      }
      if (LAVENDER.has(ch)) expect(b).toBeGreaterThan(g);
      // No yellow (the old leaf's sparkles) and no pink cheeks or black eyes.
      expect(r > 200 && g > 160 && b < 120).toBe(false);
      expect(r > 220 && g < 150 && b < 180).toBe(false);
    }
  });
});

describe("catnip rasters", () => {
  it("the exporter reports every output up to date", () => {
    const out = execFileSync(process.execPath, [path.join(CLIENT, "scripts", "art", "catnip-export.mjs"), "--check"], {
      encoding: "utf8",
    });
    expect(out).toMatch(/up to date \(15 files\)/);
  });

  it.each(OUTPUTS.map((o) => [o.path, o] as const))("%s is an integer nearest upscale of its master", async (_, output) => {
    const rows = master(output.master);
    const { data, info } = await sharp(path.join(REPO, output.path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const size = output.master * output.scale;
    expect([info.width, info.height]).toEqual([size, size]);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const ch = rows[Math.floor(y / output.scale)][Math.floor(x / output.scale)];
        const i = (y * size + x) * 4;
        if (ch === ".") {
          expect(data[i + 3]).toBe(0);
        } else {
          const [r, g, b] = palette[ch];
          if (data[i] !== r || data[i + 1] !== g || data[i + 2] !== b || data[i + 3] !== 255) {
            throw new Error(`${output.path} pixel ${x},${y} is ${data.slice(i, i + 4).join(",")}, expected ${ch}`);
          }
        }
      }
    }
  });

  it.each(OUTPUTS.map((o) => [o.path, o.sha256] as const))("%s matches its pinned hash", (file, hash) => {
    expect(sha256(file)).toBe(hash);
  });

  it("no legacy name still holds the cannabis-leaf raster", () => {
    for (const output of OUTPUTS.filter((o) => o.legacy)) {
      expect(PRE_SPRIG_SHA256).not.toContain(sha256(output.path));
    }
  });
});

describe("CatnipIcon srcSet files", () => {
  it("every file CatnipIcon can request is exported and pinned", () => {
    const source = readFileSync(path.join(CLIENT, "components", "shared", "CatnipIcon.tsx"), "utf8");
    const sizes = /CATNIP_ICON_SIZES = \[([^\]]+)\]/.exec(source)![1].split(",").map((n) => Number(n.trim()));
    const files = new Set(sizes.flatMap((size) => [1, 2, 3].map((d) => `client/public/catnip/catnip-v2-${size * d}.png`)));
    const pinned = new Set(OUTPUTS.map((o) => o.path));
    expect(Array.from(files).filter((f) => !pinned.has(f))).toEqual([]);
  });
});

describe("leaf audit", () => {
  const LEGACY = ["logo/catnip.webp", "catnip-chaos/items/catnip-coin.png", "images/catnip.webp"];
  const ALLOWED = [
    /(^|\/)catnip-v2-(16|24|32|48|64|72|96|128|144|192|288)\.png$/,
    /(^|\/)images\/catnip-16\.png$/,
    // Mode banner art named after the mode (a cat on platforms, no catnip drawn): not catnip art.
    /(^|\/)game-modal\/catnip-chaos\.webp$/,
  ];

  /** Every catnip raster path referenced from code (tracked and untracked, ignored files excluded). */
  function references(pathspecs: string[]): Array<{ file: string; ref: string }> {
    let out = "";
    try {
      out = execFileSync(
        "git",
        ["grep", "-n", "-I", "-o", "--untracked", "-E", "[A-Za-z0-9_./-]*catnip[A-Za-z0-9_-]*\\.(png|webp|gif|jpe?g|svg)", "--", ...pathspecs],
        { cwd: REPO, encoding: "utf8" },
      );
    } catch (err) {
      // git grep exits 1 when nothing matches.
      if ((err as { status?: number }).status !== 1) throw err;
    }
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [file, , ...rest] = line.split(":");
        return { file, ref: rest.join(":").replace(/^\.?\/?/, "").replace(/^.*\/public\//, "").replace(/^(assets\/)/, "") };
      });
  }

  const CODE = [
    "client/components",
    "client/pages",
    "client/lib",
    "client/hooks",
    "client/constants",
    "client/context",
    "client/layouts",
    "cms/components",
    "cms/pages",
    "catnip-heist/src",
    "catnip-heist/scripts",
    "catnip-heist/index.html",
    ":(exclude)*.test.*",
    ":(exclude)*__tests__*",
  ];

  it("code references catnip art only by a v2 name or a pinned legacy name", () => {
    const bad = references(CODE).filter(
      ({ ref }) => !ALLOWED.some((re) => re.test(ref)) && !LEGACY.some((legacy) => ref.endsWith(legacy)),
    );
    expect(bad).toEqual([]);
  });

  it("the game scenes reference only the v2 names (no legacy catnip path)", () => {
    const owned = [
      "client/components/Match3",
      "client/components/CatnipChaos",
      "client/components/PixelRescue",
      "client/components/Phaser",
      "client/components/base",
      "client/components/shelter",
      "catnip-heist/src/render",
      "catnip-heist/src/ui",
      ":(exclude)*__tests__*",
    ];
    const legacy = references(owned).filter(({ ref }) => LEGACY.some((name) => ref.endsWith(name)));
    expect(legacy).toEqual([]);
  });

  it("the game sprig URLs are served from the app origin, never the CDN (deploy-order safe)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MATCH3_CATNIP_ICONS, MATCH3_TILE_ASSETS } = require("@/components/Match3/match3.config");
    const urls: string[] = [
      ...Object.values(MATCH3_CATNIP_ICONS as Record<number, string>),
      (MATCH3_TILE_ASSETS as ReadonlyArray<{ type: string; src: string }>).find((t) => t.type === "CATNIP")!.src,
    ];
    urls.forEach((url) => expect(url).toMatch(/^\/catnip\/catnip-v2-\d+\.png$/));
    const chaos = readFileSync(path.join(CLIENT, "components", "CatnipChaos", "config.tsx"), "utf8");
    expect(chaos).toMatch(/catnipIconSrc\(32\)/);
    expect(chaos).not.toMatch(/cdnFile\(["'`]catnip\//);
  });
});
