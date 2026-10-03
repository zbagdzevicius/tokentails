/**
 * @jest-environment jsdom
 */
import fs from "fs";
import path from "path";
import * as sass from "sass";
import {
  NIGHT_ROUTES,
  applySkyScope,
  isZoomLocked,
  normalizePath,
  skyForPath,
  viewportForPath,
} from "@/components/shared/skyScope";
import { THEME_COLOR } from "@/design/tokens";

const CLIENT = path.resolve(__dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(CLIENT, f), "utf8");

describe("night scope gating (plan G6)", () => {
  it("covers exactly the plan's night routes", () => {
    expect([...NIGHT_ROUTES]).toEqual(["/", "/packs", "/shelter-payouts", "/impact", "/heist", "/game"]);
  });

  it.each([
    ["/", "night"],
    ["/game", "night"],
    ["/game?mode=heist#x", "night"],
    ["/packs/", "night"],
    ["/shelter-payouts", "night"],
    ["/shelter-payouts/give", "night"],
    ["/shelter-payouts/receipt", "night"],
    ["/impact", "night"],
    ["/heist", "night"],
    ["/feed", null],
    ["/feed/[category]/[article]", null],
    ["/cats", null],
    ["/cats/[cat]", null],
    ["/stats", null],
    ["/giveaway", null],
    ["/404", null],
    ["/portrait", null],
    ["/gamer", null],
    ["/packsale", null],
  ])("%s -> %s", (route, sky) => {
    expect(skyForPath(route)).toBe(sky);
  });

  it("normalizes query, hash and trailing slashes", () => {
    expect(normalizePath("/game/?a=1#b")).toBe("/game");
    expect(normalizePath("")).toBe("/");
    expect(normalizePath(undefined)).toBe("/");
    expect(normalizePath("/?x")).toBe("/");
  });

  it("keeps pinch zoom on everywhere except /game (WCAG 1.4.4)", () => {
    for (const route of ["/", "/packs", "/feed", "/shelter-payouts/give", "/stats", "/404"]) {
      expect(isZoomLocked(route)).toBe(false);
      const vp = viewportForPath(route);
      expect(vp).not.toMatch(/maximum-scale|user-scalable|minimum-scale/);
      expect(vp).toContain("width=device-width");
      expect(vp).toContain("viewport-fit=cover");
    }
    expect(isZoomLocked("/game")).toBe(true);
    expect(viewportForPath("/game")).toBe(
      "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no",
    );
  });

  it("applySkyScope sets and clears data-sky and data-zoom on navigation", () => {
    const root = document.documentElement;
    applySkyScope(root, "/game");
    expect(root.getAttribute("data-sky")).toBe("night");
    expect(root.getAttribute("data-zoom")).toBe("locked");
    applySkyScope(root, "/feed");
    expect(root.hasAttribute("data-sky")).toBe(false);
    expect(root.hasAttribute("data-zoom")).toBe(false);
    applySkyScope(root, "/packs");
    expect(root.getAttribute("data-sky")).toBe("night");
    expect(root.hasAttribute("data-zoom")).toBe(false);
  });

  it("_document: night theme-color from the token, first-paint style, scope attributes, no global zoom lock", () => {
    const doc = read("pages/_document.js");
    expect(THEME_COLOR).toBe("#0b0820");
    expect(doc).toContain('name="theme-color" content={THEME_COLOR}');
    expect(doc).not.toContain("#1f2937");
    expect(doc).toContain("getInitialProps");
    expect(doc).toContain("data-sky={sky || undefined}");
    expect(doc).toMatch(/FIRST_PAINT = `html,body\{background-color:\$\{THEME_COLOR\}\}/);
    // The viewport moved to _app so it can follow client navigation; zoom is no longer
    // disabled for every route.
    expect(doc).not.toMatch(/name="viewport"/);
    expect(doc).not.toMatch(/user-scalable=no/);
  });

  it("_app renders one keyed viewport tag from viewportForPath and syncs the scope", () => {
    const app = read("pages/_app.tsx");
    expect(app).toContain('<meta name="viewport" content={viewportForPath(route)} key="viewport" />');
    expect(app).toContain("applySkyScope(document.documentElement, route)");
  });

  it("globals.scss: night background everywhere, cream ink only under [data-sky], dead override gone", () => {
    const css = read("styles/globals.scss");
    expect(css).not.toContain('[data-testid="modal-content"]');
    expect(css).toMatch(/background-color: rgb\(var\(--tt-night-900\)\);/);
    expect(css).not.toMatch(/@apply bg-gray-900/);
    expect(css).toMatch(/html\[data-sky\],\s*html\[data-sky\] body \{\s*color: rgb\(var\(--tt-cream\)\);\s*color-scheme: dark;/);
    expect(css).toMatch(/html:not\(\[data-sky\]\),\s*html:not\(\[data-sky\]\) body \{\s*@apply text-gray-800;/);
    // touch-action that blocks pinch zoom is limited to the game shell.
    expect(css).toMatch(/html\[data-zoom="locked"\],\s*html\[data-zoom="locked"\] body \{\s*touch-action: pan-x pan-y;/);
    expect(css.match(/touch-action: pan-x pan-y/g)).toHaveLength(1);
    // Dusk grade.
    expect(css).toContain("--tt-sky-dusk:");
    expect(css).toMatch(/\[data-sky="dusk"\] \{/);
  });

  it("globals.scss: dark panels get cream ink and light panels gold ink, at zero specificity (review 3d #1)", () => {
    const css: string = sass.compileString(read("styles/globals.scss"), { loadPaths: [path.join(CLIENT, "styles")] }).css;
    const rule = (ink: string) => {
      const m = new RegExp(`(:where\\(html\\[data-sky\\]\\) :where\\([^)]*\\))\\s*\\{\\s*color: rgb\\(var\\(--tt-${ink}\\)\\);`).exec(css);
      expect(m).not.toBeNull();
      // jsdom's selector engine mishandles escaped classes (`.bg-black\\/60`) inside :where(), so
      // match the same selector unwrapped: `:where(A) :where(B, C)` -> `A B, A C`. Chrome is
      // checked live by the 3d Playwright probe.
      const [, scope, list] = /^:where\((.*?)\) :where\((.*)\)$/.exec(m![1])!;
      return list
        .split(",")
        .map((sel) => `${scope} ${sel.trim()}`)
        .join(", ");
    };
    const dark = rule("cream");
    const light = rule("gold-ink");
    document.documentElement.setAttribute("data-sky", "night");
    const el = (cls: string) => {
      const d = document.createElement("div");
      d.className = cls;
      document.body.appendChild(d);
      return d;
    };
    for (const cls of ["bg-black/60", "bg-tt-night-900/85", "bg-tt-night-700", "bg-gray-900", "bg-main-black"]) {
      expect(el(cls).matches(dark)).toBe(true);
      expect(el(cls).matches(light)).toBe(false);
    }
    for (const cls of ["bg-tt-cream", "bg-white", "bg-pink-100", "bg-yellow-50", "bg-tt-gold-400"]) {
      expect(el(cls).matches(light)).toBe(true);
      expect(el(cls).matches(dark)).toBe(false);
    }
    // Faint fills are not surfaces, and nothing applies outside the night scope.
    expect(el("bg-black/20").matches(dark)).toBe(false);
    expect(el("bg-white/50").matches(light)).toBe(false);
    document.documentElement.removeAttribute("data-sky");
    expect(el("bg-black/60").matches(dark)).toBe(false);
    // <main> keeps gold ink in scope until task 7b flips it (light legacy surfaces still dominate).
    expect(read("layouts/MainLayout.tsx")).toContain('<main className="text-yellow-900 [[data-sky]_&]:text-tt-gold-ink">');
  });
});
