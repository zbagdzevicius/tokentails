import { spawn, spawnSync } from "child_process";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import path from "path";

/**
 * scripts/check-meta.mjs (plan G14) is an ES module CLI; drive it against a local HTTP server that
 * serves fixture pages, and check scripts/build-icons.mjs outputs on disk.
 */
const SCRIPT = path.resolve(__dirname, "../scripts/check-meta.mjs");
const PUBLIC = path.resolve(__dirname, "../public");
const ORIGIN = "https://tokentails.com";

const ICONS = `
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48"/>
  <link rel="icon" href="/icons/icon-32.png" type="image/png" sizes="32x32"/>
  <link rel="icon" href="/icons/icon-192.png" type="image/png" sizes="192x192"/>
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180"/>
  <link rel="manifest" href="/manifest.webmanifest"/>
  <meta name="theme-color" content="#0b0820"/>`;

function page(pathname: string, extraHead = "", { image = `${ORIGIN}/logo/og-v2-1200x630.jpg`, w = 1200, h = 630 } = {}) {
  const url = `${ORIGIN}${pathname}`;
  return `<!DOCTYPE html><html><head>${ICONS}
  <title>Token Tails</title>
  <meta name="description" content="Play"/>
  <link rel="canonical" href="${url}"/>
  <meta property="og:title" content="Token Tails"/>
  <meta property="og:description" content="Play"/>
  <meta property="og:url" content="${url}"/>
  <meta property="og:image" content="${image}"/>
  <meta property="og:image:width" content="${w}"/>
  <meta property="og:image:height" content="${h}"/>
  ${extraHead}</head><body><main>ok</main></body></html>`;
}

const HEIST_GAME = `<!doctype html><html><head>
  <meta name="description" content="Catnip Heist"/>
  <link rel="canonical" href="https://tokentails.com/heist"/>
  <link rel="icon" href="/favicon.ico"/>
</head><body></body></html>`;

type Route = { status?: number; type?: string; body: string | Buffer; location?: string };

function goodRoutes(): Record<string, Route> {
  const file = (p: string) => fs.readFileSync(path.join(PUBLIC, p));
  const routes: Record<string, Route> = {
    "/": { body: page("/") },
    "/game": { body: page("/game") },
    "/heist": { body: page("/heist") },
    "/packs": { body: page("/packs") },
    "/shelter-payouts": { body: page("/shelter-payouts") },
    "/impact": { body: page("/impact") },
    "/manifest.webmanifest": { type: "application/manifest+json", body: file("manifest.webmanifest") },
    "/favicon.ico": { type: "image/x-icon", body: file("favicon.ico") },
    "/heist-game/index.html": { body: HEIST_GAME },
  };
  const manifest = JSON.parse(file("manifest.webmanifest").toString());
  for (const icon of manifest.icons) routes[icon.src] = { type: "image/png", body: file(icon.src.slice(1)) };
  return routes;
}

async function serve(routes: Record<string, Route>) {
  const server = http.createServer((req, res) => {
    const route = routes[(req.url || "/").split("?")[0]];
    if (!route) {
      res.writeHead(404).end("not found");
      return;
    }
    const headers: Record<string, string> = { "content-type": route.type || "text/html" };
    if (route.location) headers.location = route.location;
    res.writeHead(route.status ?? 200, headers).end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

function run(base: string): Promise<{ status: number | null; report: { ok: boolean; results: { target: string; errors: string[] }[] } }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, "--base", base, "--json"]);
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, report: JSON.parse(out) }));
  });
}

async function check(routes: Record<string, Route>) {
  const server = await serve(routes);
  try {
    const { status, report } = await run(server.base);
    const errors = Object.fromEntries(report.results.map((r) => [r.target, r.errors]));
    return { status, ok: report.ok, errors };
  } finally {
    await server.close();
  }
}

describe("check-meta (plan G14)", () => {
  it("passes a site with one icon family, night theme-color, 1200x630 OG and right canonicals", async () => {
    const { status, ok, errors } = await check(goodRoutes());
    expect(errors).toEqual(Object.fromEntries(Object.keys(errors).map((k) => [k, []])));
    expect(ok).toBe(true);
    expect(status).toBe(0);
  });

  it("fails a redirecting /heist, a stray per-page favicon and a ?ref= canonical", async () => {
    const routes = goodRoutes();
    routes["/heist"] = { status: 302, location: "/heist/index.html", body: "" };
    routes["/packs"] = { body: page("/packs", '<link rel="shortcut icon" href="/logo/coin.webp"/>') };
    routes["/game"] = { body: page("/game?ref=abc") };
    const { status, errors } = await check(routes);
    expect(status).toBe(1);
    expect(errors["/heist"].join()).toMatch(/status 302 -> \/heist\/index.html/);
    expect(errors["/packs"].join()).toMatch(/outside the shared family: icon \/logo\/coin.webp/);
    expect(errors["/game?ref=check-meta"].join()).toMatch(/canonical carries a query/);
  });

  it("fails @undefined, https:/ joins, %VITE_ leftovers and a wrong OG size", async () => {
    const routes = goodRoutes();
    routes["/"] = { body: page("/", '<meta name="twitter:site" content="@undefined"/>') };
    routes["/impact"] = { body: page("/impact", '<meta name="x" content="https:/tokentails.com/feed"/>') };
    routes["/shelter-payouts"] = { body: page("/shelter-payouts", "", { w: 1257, h: 631 }) };
    routes["/heist-game/index.html"] = { body: HEIST_GAME.replace("Catnip Heist", "%VITE_DESC%") };
    const { errors } = await check(routes);
    expect(errors["/"].join()).toContain("@undefined");
    expect(errors["/impact"].join()).toContain("https:/ (missing slash)");
    expect(errors["/shelter-payouts"].join()).toContain("og:image is 1257x631, expected 1200x630");
    expect(errors["/heist-game/index.html"].join()).toContain("%VITE_");
  });

  it("fails an off-palette manifest without a maskable icon and a favicon without a 32 frame", async () => {
    const routes = goodRoutes();
    routes["/manifest.webmanifest"] = {
      body: JSON.stringify({
        name: "Token Tails",
        start_url: "/",
        theme_color: "#1f2937",
        background_color: "#0b0820",
        icons: [{ src: "/icons/icon-48.webp", type: "image/png", sizes: "48x48", purpose: "any maskable" }],
      }),
    };
    const ico = Buffer.from(fs.readFileSync(path.join(PUBLIC, "favicon.ico")));
    ico[6 + 16] = 64; // second frame claims 64 px
    routes["/favicon.ico"] = { body: ico };
    const { errors } = await check(routes);
    const manifest = errors["/manifest.webmanifest"].join("\n");
    expect(manifest).toContain("start_url /, expected /game");
    expect(manifest).toContain("theme_color #1f2937");
    expect(manifest).toContain("both \"any\" and \"maskable\"");
    expect(manifest).toContain("is not typed and named PNG");
    expect(manifest).toContain("answers 404");
    expect(errors["/favicon.ico"].join()).toMatch(/needs 16 and 32/);
  });
});

describe("build-icons outputs (plan G14)", () => {
  const png = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file));
  // PNG IHDR: width, height at 16/20, colour type at 25 (2 = RGB, 6 = RGBA).
  const ihdr = (b: Buffer) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20), colourType: b[25] });

  it("are committed and up to date", () => {
    const res = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/build-icons.mjs"), "--check"], {
      encoding: "utf8",
    });
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
  }, 60_000);

  it("ship an opaque 1024 App Store icon with no alpha channel", () => {
    expect(ihdr(png("resources/store/app-store-1024.png"))).toEqual({ width: 1024, height: 1024, colourType: 2 });
  });

  it("keep transparent any icons, opaque maskable and apple-touch icons, all square", () => {
    expect(ihdr(png("public/icons/icon-512.png"))).toEqual({ width: 512, height: 512, colourType: 6 });
    const maskable = ihdr(png("public/icons/icon-maskable-512.png"));
    expect([maskable.width, maskable.height]).toEqual([512, 512]);
    expect(ihdr(png("public/icons/apple-touch-icon.png"))).toEqual({ width: 180, height: 180, colourType: 2 });
    expect(ihdr(png("resources/logo.png"))).toMatchObject({ width: 1024, height: 1024 });
  });

  it("pack hand-authored 16 and 32 frames into favicon.ico", () => {
    const ico = png("public/favicon.ico");
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256);
    expect(sizes).toEqual([16, 32, 48]);
    expect(ihdr(png("public/icons/icon-16.png"))).toMatchObject({ width: 16, height: 16 });
    expect(ihdr(png("public/icons/icon-32.png"))).toMatchObject({ width: 32, height: 32 });
  });

  it("keep the head and the coin of the maskable icon inside the 80% safe circle", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require("sharp");
    const { data, info } = await sharp(path.resolve(__dirname, "../public/icons/icon-maskable-512.png"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const side = info.width;
    const radius = side * 0.4;
    let outside = 0;
    // Everything but the body stripes at the bottom corners: the ears, face and coin.
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        if (y > side * 0.8 && Math.abs(x - side / 2) > side * 0.12) continue;
        const i = (y * side + x) * info.channels;
        // Night plate #0b0820.
        const ink = Math.abs(data[i] - 11) + Math.abs(data[i + 1] - 8) + Math.abs(data[i + 2] - 32) > 40;
        if (ink && Math.hypot(x + 0.5 - side / 2, y + 0.5 - side / 2) > radius) outside++;
      }
    }
    expect(outside).toBe(0);
  });

  it("make the default share card exactly 1200x630", () => {
    const jpg = png("public/logo/og-v2-1200x630.jpg");
    let i = 2;
    let size: number[] | null = null;
    while (i < jpg.length) {
      const marker = jpg[i + 1];
      if (marker >= 0xc0 && marker <= 0xc2) {
        size = [jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)];
        break;
      }
      i += 2 + jpg.readUInt16BE(i + 2);
    }
    expect(size).toEqual([1200, 630]);
  });
});
