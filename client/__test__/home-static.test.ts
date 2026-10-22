/**
 * The web home page (docs/CLIENT.md "Home page (/)"): the static Play-to-Save landing in public/home,
 * built by scripts/sync-home.mjs, served at "/" by a web-only beforeFiles rewrite. The Capacitor
 * export keeps pages/index.tsx and drops public/home.
 */
// Modules are re-required inside jest.isolateModules under a different env.
/* eslint-disable @typescript-eslint/no-require-imports */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Route = { source: string; destination: string; permanent?: boolean };
type Rewrites = { beforeFiles: Route[]; afterFiles: Route[]; fallback: Route[] };
type Config = {
  output?: string;
  rewrites?: () => Promise<Rewrites>;
  redirects?: () => Promise<Route[]>;
};

const loadConfig = (isApp: boolean): Config => {
  const previous = process.env.NEXT_PUBLIC_IS_APP;
  if (isApp) process.env.NEXT_PUBLIC_IS_APP = "true";
  else delete process.env.NEXT_PUBLIC_IS_APP;
  try {
    let loaded: Config | undefined;
    jest.isolateModules(() => {
      loaded = require("../next.config.js");
    });
    return loaded!;
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_IS_APP;
    else process.env.NEXT_PUBLIC_IS_APP = previous;
  }
};

const PUBLIC = path.resolve(__dirname, "../public");
const HOME = path.join(PUBLIC, "home", "index.html");
const html = fs.readFileSync(HOME, "utf8");

describe("next.config.js home routing", () => {
  it("serves public/home at / before pages/index.tsx on the web", async () => {
    const rewrites = await loadConfig(false).rewrites!();
    expect(rewrites.beforeFiles).toContainEqual({ source: "/", destination: "/home/index.html" });
    // Only the root: every other route keeps its page.
    expect(rewrites.beforeFiles.map((r) => r.source)).toEqual(["/"]);
  });

  it("redirects /home and /home/index.html to / so the page has one URL", async () => {
    const redirects = await loadConfig(false).redirects!();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: "/home", destination: "/", permanent: true },
        { source: "/home/index.html", destination: "/", permanent: true },
      ]),
    );
  });

  it("caches the home media for a day (stale for a week)", async () => {
    const config = loadConfig(false) as Config & { headers?: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
    const headers = await config.headers!();
    expect(headers).toContainEqual({
      source: "/home/media/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
    });
  });

  it("leaves the app export on pages/index.tsx (no rewrites)", () => {
    const config = loadConfig(true);
    expect(config.output).toBe("export");
    expect(config.rewrites).toBeUndefined();
    expect(fs.existsSync(path.resolve(__dirname, "../pages/index.tsx"))).toBe(true);
  });
});

describe("public/home/index.html", () => {
  it("names the production URL as canonical and is indexable", () => {
    expect(html).toContain('<link rel="canonical" href="https://tokentails.com/">');
    expect(html).toContain('<meta property="og:url" content="https://tokentails.com/">');
    expect(html).not.toMatch(/noindex/i);
  });

  it("carries the shared icon family and manifest of pages/_document.js", () => {
    for (const href of ["/favicon.ico", "/icons/icon-32.png", "/icons/icon-192.png", "/icons/apple-touch-icon.png"]) expect(html).toContain(`href="${href}"`);
    expect(html.match(/rel="(icon|apple-touch-icon)"/g)).toHaveLength(4);
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">');
  });

  it("loads every local file from /home/media/ or the site root, and each one exists", () => {
    expect(html).not.toMatch(/\.\.\/v1\d\/media|token-tails-pitch\.vercel\.app/);
    expect(html).not.toMatch(/['"(]media\//);
    const files = new Set<string>();
    for (const m of Array.from(html.matchAll(/\/home\/media\/[\w./-]+\.(webp|jpg|png|mp4)/g))) files.add(m[0]);
    for (const m of Array.from(html.matchAll(/(?:href|src)="(\/(?:fonts|icons|logo|cursor|rave)\/[^"?]+|\/font\.woff2|\/favicon\.ico|\/manifest\.webmanifest)/g))) files.add(m[1]);
    for (const m of Array.from(html.matchAll(/url\((\/[^)?]+)/g))) files.add(m[1]);
    expect(files.size).toBeGreaterThan(20);
    const missing = Array.from(files).filter((f) => !fs.existsSync(path.join(PUBLIC, f)));
    expect(missing).toEqual([]);
  });

  it("links games and payouts on the same origin", () => {
    for (const route of ["/heist", "/swordcat", "/rave", "/shelter-payouts", "/cats"]) {
      expect(html).toContain(`href="${route}`);
    }
    expect(html).toContain("var T='/';");
  });

  it("mounts the wallet buttons with a layout Stripe accepts", () => {
    expect(html).not.toContain("maxRows:1,overflow:'never'");
    expect(html).toContain("layout:{maxColumns:1,maxRows:0,overflow:'never'}");
  });

  it("reads live data from api.tokentails.com, never a same-origin /api/ path", () => {
    expect(html).not.toMatch(/['"]\/api\//);
    for (const url of [
      "https://api.tokentails.com/shelter/goal/C-001",
      "https://api.tokentails.com/shelter/rozine-pedute/gallery",
      "https://api.tokentails.com/rave/status",
      "https://api.tokentails.com/club/status",
    ]) {
      expect(html).toContain(`'${url}'`);
    }
  });

  it("ships no dev comments (internal paths and plan names stay in the landing source)", () => {
    expect(html).not.toMatch(/<!--|\/\*/);
    expect(html).not.toMatch(/landing-poc|STORYBOARD|deck-assets|v16c1/);
  });

  it("captions the cat café video neutrally (founder rule: no unverified 'we hosted' claim)", () => {
    expect(html).not.toMatch(/Token Tails cat café/);
    expect(html).toContain("label:'Cat café event'");
  });

  it("uses one offline waiting-count fallback for the hero and the cat deck", () => {
    expect(html).toContain("var WAIT_FALLBACK=104");
    expect(html).toContain('id="wallN">104<');
    expect(html).not.toMatch(/paintCount\(\d|wallCount\(\d/);
  });

  it("offers returning players a Sign in link to /game", () => {
    expect(html).toContain('<a class="signin" href="/game?signin=1&amp;from=home_signin"');
  });

  it("speaks of Tails Club in the future tense until it opens", () => {
    for (const soon of ['<span class="club-soon">will go</span>', '<span class="club-soon">will be</span> a monthly or yearly membership']) {
      expect(html).toContain(soon);
    }
  });

    it("sends no click beacon (there is no /api/evt on tokentails.com)", () => {
    expect(html).toContain("var API_EVT=''");
    expect(html).toContain("function track(evt,cta){if(!API_EVT)return;");
  });
});

describe("app export prune", () => {
  it("drops public/home from the Capacitor export and the export check asserts it", () => {
    const script = path.resolve(__dirname, "../scripts/prune-app-export.mjs");
    expect(fs.readFileSync(path.resolve(__dirname, "../scripts/check-app-export.mjs"), "utf8")).toContain("WEB_ONLY_DIRS");
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "app-export-home-"));
    try {
      fs.mkdirSync(path.join(out, "home", "media", "v12"), { recursive: true });
      fs.writeFileSync(path.join(out, "home", "index.html"), "x");
      fs.writeFileSync(path.join(out, "home", "media", "v12", "a.mp4"), "x");
      fs.writeFileSync(path.join(out, "index.html"), "x");
      execFileSync(process.execPath, [script, out]);
      expect(fs.existsSync(path.join(out, "home"))).toBe(false);
      expect(fs.existsSync(path.join(out, "index.html"))).toBe(true);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
