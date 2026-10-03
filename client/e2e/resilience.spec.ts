import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import {
  API_ORIGIN,
  type BackendMock,
  expect,
  fixtureCat,
  type FixtureCat,
  gotoAndSettle,
  storefrontFixture,
  test,
} from "./fixtures";

// Resilience matrix for the storefront surfaces (plan G13 acceptance): whatever `GET /cat/sale`
// returns (current shape, legacy shape without `_meta`, a missing shelter key, a 500, malformed
// JSON, an array), the marketplace and the Shelter render, explain themselves, and throw nothing.
// The fixtures fail every test on a `pageerror`, an unmocked backend call or a wrong auth header.

/** A real 48 px sheet from client/public, so the Shelter can load it without the CDN. */
const GOOD_SPRITE = "/cats/black/sprites/wing-black.png";
/** Served as a true 404 by `routeMissingSprite`. */
const MISSING_SPRITE = "/e2e-missing/sprite-404.png";

const partnerCat = (id: string, name: string, spriteImg = GOOD_SPRITE): FixtureCat =>
  fixtureCat({
    _id: id,
    name,
    isBlueprint: false,
    spriteImg,
    catImg: GOOD_SPRITE,
    shelter: { _id: "s-partner", name: "Rozine pedute", slug: "rozine-pedute" },
  });

const houseCat = (id: string, name: string, slug = "token-tails"): FixtureCat =>
  fixtureCat({
    _id: id,
    name,
    isBlueprint: false,
    spriteImg: GOOD_SPRITE,
    catImg: GOOD_SPRITE,
    shelter: { _id: `s-${slug}`, name: "Token Tails", slug },
  });

/** A body from before G13: no `_meta`, and the Pink Paw key gone once its cats were adopted. */
const legacyBody = (famous: FixtureCat[] = [houseCat("f1", "Famous")]) => ({
  tokentails: [],
  "token-tails": famous,
});

/** Replies to `/cat/sale` with a raw body the JSON mock cannot express. Runs before the fixtures. */
async function rawStorefront(page: Page, body: string, status = 200): Promise<void> {
  await page.route(`${API_ORIGIN}/cat/sale`, (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body,
    }),
  );
}

async function routeMissingSprite(page: Page): Promise<void> {
  await page.route(`**${MISSING_SPRITE}`, (route) =>
    route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }),
  );
}

/**
 * /cats as a signed-in player. Signed out, the page opens the sign-in modal over the list and its
 * close button does not dismiss it (the G1 sign-in wall), so the storefront could not be clicked.
 */
async function openCats(page: Page): Promise<void> {
  await gotoAndSettle(page, "/cats");
}

test.describe("storefront resilience: marketplace (/cats)", () => {
  test.beforeEach(async ({ page, backend }) => {
    await signIn(page, backend);
  });
  const cards = (page: Page) => page.locator('#social-farming-results a[href^="/cats/"]');

  test("current shape lists every partner cat, duplicate names included", async ({ page, backend }) => {
    backend.on("GET", "/cat/sale", {
      body: storefrontFixture({
        "rozine-pedute": [partnerCat("p1", "Mia"), partnerCat("p2", "Mia"), partnerCat("p3", "Luna")],
      }),
    });
    await openCats(page);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByAltText("Mia")).toHaveCount(2);
    await expect(page.getByTestId("storefront-degraded")).toHaveCount(0);
  });

  test("legacy shape without _meta or the partner key shows the adopted notice", async ({ page, backend }) => {
    backend.on("GET", "/cat/sale", { body: legacyBody() });
    await openCats(page);
    await expect(page.getByTestId("storefront-empty")).toContainText("All adopted, thank you!");
    await expect(cards(page)).toHaveCount(0);
    // Famous cats still come from the fallback house slug.
    await page.getByRole("button", { name: "FAMOUS CATS" }).click();
    await expect(cards(page)).toHaveCount(1);
  });

  test("a missing required key in the current shape is not a crash", async ({ page, backend }) => {
    const body = storefrontFixture({ "token-tails": [houseCat("f1", "Famous")] }) as Record<string, unknown>;
    delete body["rozine-pedute"];
    delete body["token-tails-2"];
    backend.on("GET", "/cat/sale", { body });
    await openCats(page);
    await expect(page.getByTestId("storefront-empty")).toBeVisible();
  });

  test("a 500 shows RETRY, and a good retry lists the cats", async ({ page, backend }) => {
    let calls = 0;
    backend.on("GET", "/cat/sale", () => {
      calls += 1;
      return calls === 1
        ? { status: 500, body: { statusCode: 500, message: "Internal server error" } }
        : { body: storefrontFixture({ "rozine-pedute": [partnerCat("p1", "Mia")] }) };
    });
    await openCats(page);
    const alert = page.getByTestId("storefront-degraded");
    await expect(alert).toHaveAttribute("role", "alert");
    await alert.getByRole("button", { name: "RETRY" }).click();
    await expect(alert).toHaveCount(0);
    await expect(cards(page)).toHaveCount(1);
  });

  test("malformed JSON shows RETRY", async ({ page }) => {
    await rawStorefront(page, "{not json");
    await openCats(page);
    await expect(page.getByTestId("storefront-degraded")).toBeVisible();
  });

  test("a top-level array (the old client fallback) shows RETRY", async ({ page, backend }) => {
    backend.on("GET", "/cat/sale", { body: [] });
    await openCats(page);
    await expect(page.getByTestId("storefront-degraded")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
// Shelter: needs a signed-in profile. Firebase is faked in the page: a persisted user in
// localStorage (the web SDK's fallback persistence) plus mocked Identity Toolkit and Secure Token
// replies, so nothing reaches Google and no real account is touched.

const FIREBASE_API_KEY = (() => {
  const source = readFileSync(join(__dirname, "..", "context", "FirebaseAuthContext.tsx"), "utf8");
  const match = /apiKey:\s*"([^"]+)"/.exec(source);
  if (!match) throw new Error("Firebase web config not found in FirebaseAuthContext.tsx");
  return match[1];
})();

const E2E_UID = "e2e-uid";
const TOKEN_EXP = Math.floor(Date.parse("2099-01-01T00:00:00Z") / 1000);

/** An unsigned JWT the SDK can parse; the mocked backend never verifies it. */
const fakeIdToken = (() => {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part({
    iss: "e2e",
    aud: "e2e",
    sub: E2E_UID,
    user_id: E2E_UID,
    iat: TOKEN_EXP - 3600,
    auth_time: TOKEN_EXP - 3600,
    exp: TOKEN_EXP,
    firebase: { sign_in_provider: "password" },
  })}.e2e`;
})();

const playerCat = {
  ...fixtureCat({ _id: "64b0000000000000000000aa", name: "Scout", spriteImg: GOOD_SPRITE, catImg: GOOD_SPRITE }),
  status: { EAT: 10, SLEEP: 10, FUN: 10 },
  blessing: null,
};

async function signIn(page: Page, backend: BackendMock): Promise<void> {
  await page.addInitScript(
    ([apiKey, user]) => {
      try {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(user));
      } catch {
        // Storage blocked: the test then fails on the missing lobby, which says why.
      }
    },
    [
      FIREBASE_API_KEY,
      {
        uid: E2E_UID,
        email: "e2e@example.invalid",
        emailVerified: true,
        isAnonymous: false,
        providerData: [],
        stsTokenManager: { refreshToken: "e2e-refresh", accessToken: fakeIdToken, expirationTime: TOKEN_EXP * 1000 },
        createdAt: "1",
        lastLoginAt: "1",
        apiKey: FIREBASE_API_KEY,
        appName: "[DEFAULT]",
      },
    ] as const,
  );
  await page.route("https://identitytoolkit.googleapis.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        users: [{ localId: E2E_UID, email: "e2e@example.invalid", emailVerified: true, providerUserInfo: [] }],
      }),
    }),
  );
  await page.route("https://securetoken.googleapis.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        access_token: fakeIdToken,
        id_token: fakeIdToken,
        refresh_token: "e2e-refresh",
        expires_in: "3600",
        token_type: "Bearer",
        user_id: E2E_UID,
      }),
    }),
  );
  backend
    .on("GET", "/user/profile", {
      body: { _id: "64b0000000000000000000bb", name: "Tester", cat: playerCat, cats: [playerCat], tails: 0, codex: [], quests: [] },
    })
    .on("GET", "/user/cats", { body: [playerCat] })
    .on("GET", /^\/user\/leaderboard\/.*position$/, { body: { position: 1 } });
}

/** Installs a listener for the scene's NPC_SPAWNED answer before the Shelter mounts. */
async function recordSpawns(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __npcSpawned: unknown[] };
    w.__npcSpawned = [];
    window.addEventListener("NPC_SPAWNED", (event) => w.__npcSpawned.push((event as CustomEvent).detail));
  });
}

interface Spawned {
  count: number;
  skipped: number;
  skippedIds: string[];
  source: string;
}

const spawnedBatches = (page: Page) =>
  page.evaluate(() => (window as unknown as { __npcSpawned: Spawned[] }).__npcSpawned);

async function openShelter(page: Page): Promise<void> {
  await gotoAndSettle(page, "/game", 2500);
  await page.locator('img[src*="game/select/home.webp"]').click();
  // dispatchEvent, not click(): in landscape (844x390) the touch-controls bar
  // (`fixed bottom-6 z-30`, GameSelect/controls) covers GO BACK and SHELTER. That overlap is a
  // separate known bug (logged in alignment-log/2f.md, G14 mobile overlap); this spec is about the
  // storefront, so it reaches the Shelter at every viewport.
  // Retried as one step: under four workers on a dev server, a click dispatched before the HOME
  // view's handler is bound is lost, and the canvas never appears (seen once in 88 runs).
  const shelter = page.getByRole("button", { name: "SHELTER", exact: true });
  const canvas = page.locator("#game-container canvas");
  await expect(async () => {
    if ((await canvas.count()) === 0) await shelter.dispatchEvent("click");
    await expect(canvas).toBeAttached({ timeout: 12_000 });
  }).toPass({ timeout: 40_000, intervals: [500] });
}

test.describe("storefront resilience: Shelter", () => {
  test.beforeEach(async ({ page, backend }) => {
    await signIn(page, backend);
    await recordSpawns(page);
    await routeMissingSprite(page);
  });

  test("duplicate names and a 404 sprite: every good cat spawns, the missing one is skipped", async ({ page, backend }) => {
    backend.on("GET", "/cat/sale", {
      body: storefrontFixture({
        "rozine-pedute": [
          partnerCat("64b0000000000000000000c1", "Mia"),
          partnerCat("64b0000000000000000000c2", "Mia"),
          partnerCat("64b0000000000000000000c3", "Mia", MISSING_SPRITE),
        ],
        "token-tails": [houseCat("64b0000000000000000000d1", "Mia")],
        "token-tails-2": [houseCat("64b0000000000000000000e1", "Event", "token-tails-2")],
      }),
    });
    await openShelter(page);
    await expect.poll(() => spawnedBatches(page), { timeout: 25_000 }).toHaveLength(1);
    const [batch] = await spawnedBatches(page);
    // Four same-named cats keep distinct sprites (id keys); only the 404 is left out.
    expect(batch).toMatchObject({ count: 4, skipped: 1, skippedIds: ["64b0000000000000000000c3"], source: "batch" });
    await expect(page.getByTestId("shelter-empty-zones")).toHaveCount(0);
    await expect(page.getByTestId("storefront-degraded")).toHaveCount(0);
  });

  test("legacy shape: empty zones get the All adopted sign, the rest spawn", async ({ page, backend }) => {
    backend.on("GET", "/cat/sale", { body: legacyBody([houseCat("64b0000000000000000000d1", "Famous")]) });
    await openShelter(page);
    const sign = page.getByTestId("shelter-empty-zones");
    await expect(sign).toContainText("All adopted, thank you!");
    // Only the partner zone says thank you; the empty house zone is "back soon".
    await expect(sign.locator('[data-group="adopted"] li')).toHaveCount(1);
    await expect(sign.locator('[data-group="soon"]')).toContainText("Back soon");
    await expect(sign.locator("li")).toHaveCount(2);
    if (process.env.E2E_SHOTS_DIR) {
      await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/shelter-sign-${test.info().project.name}.png` });
    }
    await expect.poll(() => spawnedBatches(page), { timeout: 25_000 }).toHaveLength(1);
    expect((await spawnedBatches(page))[0]).toMatchObject({ count: 1, skipped: 0 });
  });

  test("a 500 shows the degraded toast; RETRY recovers and spawns", async ({ page, backend }) => {
    let calls = 0;
    backend.on("GET", "/cat/sale", () => {
      calls += 1;
      return calls === 1
        ? { status: 500, body: { statusCode: 500, message: "Internal server error" } }
        : { body: storefrontFixture({ "rozine-pedute": [partnerCat("64b0000000000000000000c1", "Mia")] }) };
    });
    await openShelter(page);
    const toast = page.getByTestId("storefront-degraded");
    await expect(toast).toHaveAttribute("role", "alert");
    await expect(page.getByTestId("shelter-empty-zones")).toHaveCount(0);
    expect(await spawnedBatches(page)).toEqual([]);
    // In short landscape the toast sits compact in the top-right corner, clear of the player cat.
    if ((page.viewportSize()?.height ?? 1000) <= 500) {
      const box = await toast.boundingBox();
      const width = page.viewportSize()?.width ?? 0;
      expect(box && box.x).toBeGreaterThan(width / 2);
      expect(box && box.y).toBeLessThan(60);
    }
    if (process.env.E2E_SHOTS_DIR) {
      await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/shelter-500-${test.info().project.name}.png` });
    }
    await toast.getByRole("button", { name: "RETRY" }).click();
    await expect(toast).toHaveCount(0);
    await expect.poll(() => spawnedBatches(page), { timeout: 25_000 }).toHaveLength(1);
  });

  test("malformed JSON shows the degraded toast and spawns nothing", async ({ page }) => {
    await rawStorefront(page, "<!doctype html><title>502</title>", 200);
    await openShelter(page);
    await expect(page.getByTestId("storefront-degraded")).toBeVisible();
    await page.waitForTimeout(1000);
    expect(await spawnedBatches(page)).toEqual([]);
  });
});
