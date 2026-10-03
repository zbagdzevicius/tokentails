/**
 * scripts/art/tile-legend.mjs replaces the Windows-path scripts a.js (replace tile ids) and b.js
 * (count catnip tiles) with a cross-platform CLI that takes paths as arguments (plan G7, known issue).
 */
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const CLIENT = path.resolve(__dirname, "..");
const CLI = path.join(CLIENT, "scripts", "art", "tile-legend.mjs");
const FLIP_H = 0x80000000;

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "tile-legend-"));
  const file = path.join(dir, "level.json");
  const map = {
    infinite: true,
    tilesets: [{ name: "blocks", firstgid: 1, columns: 30, tilecount: 480 }],
    layers: [
      { type: "tilelayer", name: "blocks", chunks: [{ x: 0, y: 0, width: 2, height: 2, data: [3, 3, 0, 61] }] },
      {
        type: "tilelayer",
        name: "catnip",
        chunks: [
          { x: 0, y: 0, width: 2, height: 2, data: [248, 0, 248, 0] },
          { x: 16, y: 0, width: 2, height: 2, data: [0, (FLIP_H + 248) >>> 0, 0, 0] },
        ],
      },
      { type: "group", name: "g", layers: [{ type: "tilelayer", name: "deco", data: [3, 0, 0, 0], width: 2, height: 2 }] },
    ],
  };
  writeFileSync(file, JSON.stringify(map));
  return { dir, file };
}

const run = (...args: string[]) => execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

describe("tile-legend.mjs", () => {
  it("counts a gid per layer and chunk, flip flags included (b.js)", () => {
    const { file } = fixture();
    const out = JSON.parse(run("count", file, "--gid", "248", "--layer", "catnip", "--json"));
    expect(out.total).toBe(3);
    expect(out.layers.catnip.chunks).toEqual([
      { x: 0, y: 0, count: 2 },
      { x: 16, y: 0, count: 1 },
    ]);
  });

  it("lists the legend with tileset and local index, recursing into groups", () => {
    const { file } = fixture();
    const out = JSON.parse(run("legend", file, "--json"));
    expect(out.blocks).toEqual([
      { gid: 3, count: 2, tileset: "blocks", index: 2 },
      { gid: 61, count: 1, tileset: "blocks", index: 60 },
    ]);
    expect(out.deco).toEqual([{ gid: 3, count: 1, tileset: "blocks", index: 2 }]);
  });

  it("replace is a dry run by default and keeps flip flags when writing (a.js)", () => {
    const { dir, file } = fixture();
    const before = readFileSync(file, "utf8");
    expect(run("replace", file, "--from", "248", "--to", "159")).toContain("3 tiles replaced (dry run");
    expect(readFileSync(file, "utf8")).toBe(before);

    const outFile = path.join(dir, "out.json");
    run("replace", file, "--from", "248,61", "--to", "159", "--out", outFile);
    expect(readFileSync(file, "utf8")).toBe(before);
    const out = JSON.parse(readFileSync(outFile, "utf8"));
    expect(out.layers[0].chunks[0].data).toEqual([3, 3, 0, 159]);
    expect(out.layers[1].chunks[0].data).toEqual([159, 0, 159, 0]);
    expect(out.layers[1].chunks[1].data[1]).toBe((FLIP_H + 159) >>> 0);

    run("replace", file, "--from", "3", "--to", "4", "--layer", "blocks", "--write");
    const written = JSON.parse(readFileSync(file, "utf8"));
    expect(written.layers[0].chunks[0].data).toEqual([4, 4, 0, 61]);
    expect(written.layers[2].layers[0].data).toEqual([3, 0, 0, 0]);
  });

  it("reads and rewrites base64-encoded layers (6d review, finding 10)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tile-legend-b64-"));
    const file = path.join(dir, "level.json");
    const encode = (gids: number[]) => {
      const buf = Buffer.alloc(gids.length * 4);
      gids.forEach((g, i) => buf.writeUInt32LE(g >>> 0, i * 4));
      return buf.toString("base64");
    };
    const map = {
      infinite: false,
      tilesets: [{ name: "blocks", firstgid: 1, columns: 30, tilecount: 480 }],
      layers: [{ type: "tilelayer", name: "catnip", encoding: "base64", width: 2, height: 2, data: encode([248, 0, (FLIP_H + 248) >>> 0, 3]) }],
    };
    writeFileSync(file, JSON.stringify(map));
    expect(JSON.parse(run("count", file, "--gid", "248", "--json")).total).toBe(2);
    expect(JSON.parse(run("legend", file, "--json")).catnip).toEqual([
      { gid: 3, count: 1, tileset: "blocks", index: 2 },
      { gid: 248, count: 2, tileset: "blocks", index: 247 },
    ]);
    run("replace", file, "--from", "248", "--to", "159", "--write");
    const written = JSON.parse(readFileSync(file, "utf8"));
    expect(typeof written.layers[0].data).toBe("string");
    expect(written.layers[0].data).toBe(encode([159, 0, (FLIP_H + 159) >>> 0, 3]));
  });

  it("works on a real level with a relative path from any working directory", () => {
    const out = execFileSync(process.execPath, [CLI, "count", "public/catnip-chaos/levels/level-21.json", "--gid", "248", "--json"], {
      cwd: CLIENT,
      encoding: "utf8",
    });
    expect(JSON.parse(out).layers.catnip.total).toBeGreaterThan(0);
  });

  it("has no hard-coded absolute paths", () => {
    const src = readFileSync(CLI, "utf8");
    expect(src).not.toMatch(/[A-Z]:\\\\|\/Users\//);
  });
});
