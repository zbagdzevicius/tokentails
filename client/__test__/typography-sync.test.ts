import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { HEIST_FONT_FILES } from "../../catnip-heist/src/ui/fonts.generated";
import { FONT_FILES, PRELOAD_FONT_FILES } from "@/components/typography/fonts.generated";

// Plan F4: every face is self-hosted from the pinned Fontsource packages by
// scripts/sync-fonts.mjs, for the client, the CMS and the Heist.
const CLIENT = path.resolve(__dirname, "..");
const REPO = path.resolve(CLIENT, "..");
const read = (...parts: string[]) => readFileSync(path.join(...parts), "utf8");
/** `/fonts/x.woff2?v=abc` -> `/fonts/x.woff2`. */
const stripVersion = (url: string) => url.replace(/\?v=[0-9a-f]+$/, "");

jest.setTimeout(60_000);

describe("sync-fonts", () => {
  it("--check passes: every copy and generated file matches the packages", () => {
    const out = execFileSync(process.execPath, [path.join(CLIENT, "scripts/sync-fonts.mjs"), "--check"], {
      cwd: CLIENT,
      encoding: "utf8",
    });
    expect(out).toMatch(/up to date/);
  });

  it("every @font-face url in the client SCSS exists under public/", () => {
    const scss = read(CLIENT, "styles/fonts.generated.scss");
    const urls = Array.from(scss.matchAll(/url\("([^"]+)"\)/g), (m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(existsSync(path.join(CLIENT, "public", stripVersion(url)))).toBe(true);
    expect(new Set(urls)).toEqual(new Set(FONT_FILES.map((f) => f.file)));
  });

  it("versions every font URL with the content hash of the file it serves", () => {
    const targets: Array<[string, string]> = [
      [path.join(CLIENT, "styles/fonts.generated.scss"), path.join(CLIENT, "public")],
      [path.join(REPO, "cms/styles/fonts.generated.scss"), path.join(REPO, "cms/public")],
      [path.join(REPO, "catnip-heist/src/ui/fonts.generated.ts"), path.join(REPO, "catnip-heist/public/fonts")],
    ];
    for (const [file, publicDir] of targets) {
      const urls = Array.from(readFileSync(file, "utf8").matchAll(/url\("([^"]+)"\)/g), (m) => m[1]);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        const match = /^(?:\$\{fontsBase\})?(.+)\?v=([0-9a-f]{10})$/.exec(url);
        expect(match).not.toBeNull();
        const bytes = readFileSync(path.join(publicDir, match![1]));
        expect(createHash("sha256").update(bytes).digest("hex").slice(0, 10)).toBe(match![2]);
      }
    }
  });

  it("uses font-display swap and a unicode-range on every brand face", () => {
    const scss = read(CLIENT, "styles/fonts.generated.scss");
    const faces = scss.split("@font-face").slice(1).filter((block) => block.includes("url("));
    expect(faces).toHaveLength(FONT_FILES.length);
    for (const face of faces) {
      expect(face).toContain("font-display: swap;");
      expect(face).toMatch(/unicode-range: U\+/);
    }
  });

  it("ships latin-ext for every brand family and latin only for Roboto", () => {
    for (const family of ["Passion One", "Bebas Neue", "Nunito"]) {
      const subsets = new Set(FONT_FILES.filter((f) => f.family === family).map((f) => f.subset));
      expect(subsets).toEqual(new Set(["latin", "latin-ext"]));
    }
    expect(FONT_FILES.filter((f) => f.family === "Roboto").map((f) => [f.weight, f.subset])).toEqual([[500, "latin"]]);
  });

  it("does not add Pixelify Sans (decision #92)", () => {
    expect(FONT_FILES.some((f) => /pixelify/i.test(f.family))).toBe(false);
  });

  it("ships the OFL licence next to the files of every family", () => {
    for (const dir of [path.join(CLIENT, "public/fonts"), path.join(REPO, "cms/public/fonts")]) {
      for (const id of ["passion-one", "bebas-neue", "nunito"]) {
        expect(read(dir, `LICENSE-${id}.txt`)).toMatch(/SIL OPEN FONT LICENSE/i);
      }
    }
    expect(read(REPO, "catnip-heist/public/fonts/LICENSE-nunito.txt")).toMatch(/SIL OPEN FONT LICENSE/i);
  });

  it("preloads the three brand faces from _document", () => {
    expect(PRELOAD_FONT_FILES.map(stripVersion)).toEqual([
      "/fonts/passion-one-latin-900-normal.woff2",
      "/fonts/bebas-neue-latin-400-normal.woff2",
      "/fonts/nunito-latin-wght-normal.woff2",
    ]);
    // A preload is reused only when its URL (query included) matches the @font-face one.
    const faceUrls = new Set(FONT_FILES.map((f) => f.file));
    for (const file of PRELOAD_FONT_FILES) {
      expect(faceUrls.has(file)).toBe(true);
      expect(existsSync(path.join(CLIENT, "public", stripVersion(file)))).toBe(true);
    }
    const doc = read(CLIENT, "pages/_document.js");
    expect(doc).toContain("PRELOAD_FONT_FILES.map");
    expect(doc).toContain('as="font"');
    expect(doc).toContain('crossOrigin="anonymous"');
  });

  it("no stylesheet imports Google Fonts (client and CMS, decision #83)", () => {
    for (const file of [path.join(CLIENT, "styles/globals.scss"), path.join(REPO, "cms/styles/globals.scss")]) {
      const css = readFileSync(file, "utf8");
      expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
      expect(css).toMatch(/@use ["']\.\/fonts\.generated["'] as fonts;/);
    }
  });

  it("no client, CMS or Heist source references Google Fonts (tracked and new files)", () => {
    const pattern = "fonts\\.(googleapis|gstatic)\\.com";
    // Allowed: the sync script's doc comment and the e2e checks that assert zero such requests.
    const allowed = new Set(["client/scripts/sync-fonts.mjs", "client/e2e/fixtures/network.ts", "client/e2e/smoke.spec.ts", "client/e2e/typography.spec.ts"]);
    const git = (args: string[]) => {
      try {
        return execFileSync("git", args, { cwd: REPO, encoding: "utf8" });
      } catch (error) {
        // git grep exits 1 when nothing matches.
        return (error as { stdout?: string }).stdout ?? "";
      }
    };
    const scope = ["--", "client", "cms", "catnip-heist", ":!**/node_modules/**", ":!**/.next/**", ":!**/dist/**", ":!**/coverage/**"];
    const hits = [
      ...git(["grep", "-l", "-E", pattern, ...scope]).split("\n"),
      ...git(["grep", "-l", "--untracked", "--exclude-standard", "-E", pattern, ...scope]).split("\n"),
    ].filter((file) => file && !allowed.has(file));
    expect(Array.from(new Set(hits))).toEqual([]);
  });

  it("the CMS preloads only files it ships, with the @font-face URLs", () => {
    const doc = read(REPO, "cms/pages/_document.tsx");
    expect(doc).toContain("PRELOAD_FONT_FILES.map");
    expect(doc).not.toMatch(/'\/fonts\//);
    const manifest = read(REPO, "cms/styles/fonts.preload.generated.ts");
    const hrefs = JSON.parse(/PRELOAD_FONT_FILES: ReadonlyArray<string> = (\[.*\]);/.exec(manifest)![1]) as string[];
    expect(hrefs.map(stripVersion)).toEqual([
      "/fonts/passion-one-latin-400-normal.woff2",
      "/fonts/bebas-neue-latin-400-normal.woff2",
    ]);
    const scss = read(REPO, "cms/styles/fonts.generated.scss");
    for (const href of hrefs) {
      expect(scss).toContain(`url("${href}")`);
      expect(existsSync(path.join(REPO, "cms/public", stripVersion(href)))).toBe(true);
    }
  });

  it("the Heist copy is Nunito (decision #85) and its files exist", () => {
    expect(HEIST_FONT_FILES.length).toBeGreaterThan(0);
    for (const file of HEIST_FONT_FILES) {
      expect(file).toMatch(/^nunito-/);
      expect(existsSync(path.join(REPO, "catnip-heist/public/fonts", file))).toBe(true);
    }
  });

  describe("metric-matched fallback faces", () => {
    interface Metrics {
      xWidthAvg: number;
      unitsPerEm: number;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const metrics = (name: string): Metrics => require(`@capsizecss/metrics/${name}`);
    const avg = (m: Metrics) => m.xWidthAvg / m.unitsPerEm;

    interface FallbackFace {
      family: string;
      weight: string;
      style: string;
      src: string;
      sizeAdjust: number;
      comment: string;
    }
    const fallbackFaces = (): FallbackFace[] => {
      const scss = read(CLIENT, "styles/fonts.generated.scss");
      const blocks = scss.split(/(?=\/\* [^*]+ on [^*]+ \*\/\n@font-face)/).filter((b) => b.includes("size-adjust"));
      return blocks.map((block) => ({
        comment: /\/\* ([^*]+) \*\//.exec(block)![1],
        family: /font-family: "([^"]+)"/.exec(block)![1],
        weight: /font-weight: ([^;]+);/.exec(block)![1],
        style: /font-style: ([^;]+);/.exec(block)![1],
        src: /src: ([^;]+);/.exec(block)![1],
        sizeAdjust: parseFloat(/size-adjust: ([\d.]+)%/.exec(block)![1]) / 100,
      }));
    };
    const minWeight = (weight: string) => parseInt(weight, 10);

    it("scales bold faces against Arial Bold and regular faces against Arial", () => {
      const faces = fallbackFaces().filter((f) => !f.family.endsWith(" Android"));
      expect(faces.length).toBeGreaterThan(0);
      for (const face of faces) {
        const [target, base] = face.comment.split(" on ");
        const bold = minWeight(face.weight) >= 600;
        expect({ face: face.comment, base }).toEqual({ face: face.comment, base: bold ? "arial/700" : "arial" });
        expect(face.sizeAdjust).toBeCloseTo(avg(metrics(target)) / avg(metrics(base)), 3);
        expect(face.src.startsWith(bold ? 'local("Arial Bold")' : 'local("Arial")')).toBe(true);
      }
    });

    it("gives Roboto Bold its own Android family and keeps regular Roboto in the main one", () => {
      for (const face of fallbackFaces()) {
        const bold = minWeight(face.weight) >= 600;
        if (face.family.endsWith(" Android")) {
          expect(face.src).toBe('local("Roboto Bold")');
          const [target, base] = face.comment.split(" on ");
          expect(base).toBe("roboto/700");
          expect(face.sizeAdjust).toBeCloseTo(avg(metrics(target)) / avg(metrics("roboto/700")), 3);
        } else {
          expect(face.src.includes('local("Roboto Bold")')).toBe(false);
          expect(face.src.includes('local("Roboto")')).toBe(!bold);
        }
      }
    });

    it("covers every role weight with a band measured at a weight in that band", () => {
      const faces = fallbackFaces().filter((f) => f.family === "Nunito Fallback" && f.style === "normal");
      expect(faces.map((f) => f.weight)).toEqual(["200 599", "600 749", "750 1000"]);
      expect(faces.map((f) => f.comment.split(" on ")[0])).toEqual(["nunito", "nunito/700", "nunito/800"]);
    });

    it("the Heist module uses the same corrected faces", () => {
      const heist = read(REPO, "catnip-heist/src/ui/fonts.generated.ts");
      expect(heist).toContain("/* nunito/800 on arial/700 */");
      expect(heist).toContain('font-family: "Nunito Fallback Android";');
    });
  });
});
