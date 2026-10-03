import type { Page } from "@playwright/test";
import { expect, gotoAndSettle, test } from "./fixtures";

// Typography runtime (plan F4, G12 acceptance): the brand faces are self-hosted, the three game faces
// are loaded on the landing and on /game, nothing is requested from Google Fonts, and a Lithuanian
// shelter name pulls the latin-ext subset on demand.

const GOOGLE_FONTS = /^https?:\/\/fonts\.(googleapis|gstatic)\.com\//;

/** The faces the type roles need first (the ones _document preloads). */
const BRAND_FACES = ['900 16px "Passion One"', '400 16px "Bebas Neue"', '700 16px "Nunito"'];

function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

/** Families with at least one loaded face, for the faces in BRAND_FACES (checked with `load`, never `check`). */
async function loadedBrandFaces(page: Page): Promise<boolean[]> {
  return page.evaluate(async (faces) => {
    await document.fonts.ready;
    return Promise.all(faces.map(async (face) => (await document.fonts.load(face, "BESbswy")).length > 0));
  }, BRAND_FACES);
}

for (const path of ["/", "/game"]) {
  test(`${path} loads the three brand faces and nothing from Google Fonts`, async ({ page }) => {
    const urls = recordRequests(page);
    await gotoAndSettle(page, path, 2500);
    expect(await loadedBrandFaces(page)).toEqual([true, true, true]);
    const loaded = await page.evaluate(() =>
      Array.from(document.fonts)
        .filter((face) => face.status === "loaded")
        .map((face) => face.family.replace(/"/g, "")),
    );
    expect(loaded).toEqual(expect.arrayContaining(["Passion One", "Bebas Neue", "Nunito"]));
    expect(urls.filter((url) => GOOGLE_FONTS.test(url))).toEqual([]);
    expect(urls.some((url) => url.includes("/fonts/passion-one-latin-900-normal.woff2"))).toBe(true);
  });
}

test("a Lithuanian shelter name requests the latin-ext subset", async ({ page }) => {
  const urls = recordRequests(page);
  await gotoAndSettle(page, "/", 1000);
  await page.evaluate(async () => {
    const probe = document.createElement("div");
    probe.textContent = "Rozinė pėdutė ąčęėįšųūž";
    // eslint-disable-next-line tt/no-raw-font -- the probe asks for the raw family on purpose, to see which subset loads
    probe.style.cssText = 'font-family: "Nunito"; font-weight: 700; position: fixed; left: 0; top: 0;';
    document.body.appendChild(probe);
    await document.fonts.load('700 16px "Nunito"', probe.textContent);
  });
  await expect
    .poll(() => urls.some((url) => url.includes("/fonts/nunito-latin-ext-wght-normal.woff2")))
    .toBe(true);
  expect(urls.filter((url) => GOOGLE_FONTS.test(url))).toEqual([]);
});
