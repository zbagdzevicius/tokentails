import type { Page } from "@playwright/test";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";

/**
 * MY HOME as the Cat Yard (components/home, shared/home-yard.ts): the lobby HOME tile opens the
 * voxel garden with the player's own cats, the HUD's GO BACK / SHELTER stay clickable at every
 * size (landscape included, where the Phaser HOME's mobile controls used to cover them), FEED sends
 * the active cat to the bowls and saves EAT, and SELECT on another cat's name card makes it the
 * active cat. No score is written.
 *
 * The yard renders with WebGL (software ANGLE in CI): its sheets are the local hat sprites, so the
 * run needs no CDN. Set HOME_YARD_SHOTS=<dir> to save a screenshot per viewport.
 */

const CAT = {
  _id: "64e2e0000000000000000c01",
  name: "Scout",
  isStarter: true,
  type: "GRASS",
  tier: "COMMON",
  spriteImg: "/cats/yellow/sprites/hat-wizard-blue.png",
  catImg: "/logo/logo.webp",
  status: { EAT: 0 },
};
const MOCHI = { ...CAT, _id: "64e2e0000000000000000c02", name: "Mochi", isStarter: false, spriteImg: "/cats/yellow/sprites/hat-cylinder-black.png", status: { EAT: 4 } };
const LUNA = { ...CAT, _id: "64e2e0000000000000000c03", name: "Luna", isStarter: false, spriteImg: "/cats/yellow/sprites/hat-musketeer-red.png", status: { EAT: 4 } };
const PLAYER = {
  _id: "64e2e0000000000000000u01",
  isGuest: false,
  name: "Player",
  onboarding: { state: "done" },
  tails: 120,
  catnipChaos: [],
  match3: [],
  codex: [],
  quests: [],
  streak: 3,
  canRedeemLives: true,
};

const SHOTS = process.env.HOME_YARD_SHOTS;

function mockBackend(backend: BackendMock, active = CAT) {
  const cats = [active, MOCHI, LUNA].filter((c, i, all) => all.findIndex((o) => o._id === c._id) === i);
  backend
    .on("GET", "/user/profile", { body: { ...PLAYER, cat: active, cats } })
    .on("GET", "/user/cats", { body: cats })
    .on("POST", "/quest/search", { body: [] })
    .on("PUT", /^\/cat\//, { body: {} })
    .on("PATCH", /^\/cat\//, { body: {} })
    .on("POST", /^\/cat\//, { body: {} })
    .on("GET", /^\/cat\/.*/, { body: {} });
}

async function openHome(page: Page, backend: BackendMock) {
  mockBackend(backend);
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__TT_E2E_AUTH__ = { user: { uid: "player-1", isAnonymous: false } };
    w.__TT_E2E__ = true;
    try {
      window.localStorage.setItem("tt.tailsExplainer.v1", "1");
    } catch {
      /* storage blocked: the explainer may show, the test closes nothing */
    }
  });
  await gotoAndSettle(page, "/game", 2500);
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  // The yard (not the Phaser fallback) became ready.
  await expect(page.locator('[data-testid="home-yard"][data-state="ready"]')).toBeVisible({ timeout: 120_000 });
}

/** The point of a button is reachable: the topmost element there is the button or inside it. */
async function isTopmost(page: Page, name: string): Promise<boolean> {
  const box = await page.getByRole("button", { name, exact: true }).boundingBox();
  if (!box) return false;
  return page.evaluate(
    ({ x, y, name: label }) => {
      const el = document.elementFromPoint(x, y);
      const button = el?.closest("button");
      return !!button && (button.textContent ?? "").includes(label);
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, name },
  );
}

test.use({ allowUnmocked: true });
test.setTimeout(240_000);

test.describe("MY HOME: the Cat Yard", () => {
  test("opens with the player's cats; GO BACK and SHELTER are reachable; FEED saves EAT", async ({ page, backend }, info) => {
    test.skip(info.project.name === "mobile-360", "covered by mobile-390");
    const saves: string[] = [];
    page.on("request", (r) => {
      if (/\/cat\//.test(r.url()) && ["PUT", "PATCH", "POST"].includes(r.method())) saves.push(r.postData() ?? "");
      if (/catbassadors\/live/.test(r.url())) saves.push("SCORE");
    });
    await openHome(page, backend);

    await expect(page.locator(".chy-root canvas")).toBeVisible();
    // The old centred HUD never shows with the yard.
    await expect(page.getByRole("button", { name: "Feed To Control" })).toHaveCount(0);
    await expect(page.getByTestId("home-yard-nav")).toBeVisible();
    expect(await isTopmost(page, "← GO BACK")).toBe(true);
    expect(await isTopmost(page, "SHELTER")).toBe(true);

    const positions = await page.evaluate(
      () => (window as unknown as { __ttHomeYard?: { screenPositions(): { id: string }[] } }).__ttHomeYard?.screenPositions() ?? [],
    );
    expect(positions.map((p) => p.id).sort()).toEqual([CAT._id, MOCHI._id, LUNA._id].sort());

    if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-yard-hungry-${info.project.name}.png` });

    await page.getByRole("button", { name: "FEED Scout" }).click();
    // The cat walks to the bowls and eats (about 2 s), then EAT is saved and the panel hides.
    await expect(page.getByTestId("home-yard-feed")).toHaveCount(0, { timeout: 60_000 });
    expect(saves.some((body) => /"EAT"\s*:\s*4/.test(body))).toBe(true);
    expect(saves).not.toContain("SCORE");

    if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-yard-fed-${info.project.name}.png` });
  });

  test("SELECT on another cat's name card makes it the active cat", async ({ page, backend }, info) => {
    test.skip(info.project.name !== "desktop-1440" && info.project.name !== "mobile-390");
    await openHome(page, backend);
    const activated: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes(MOCHI._id)) activated.push(r.url());
    });
    await page.evaluate((id) => {
      (window as unknown as { __ttHomeYard?: { select(id: string): void } }).__ttHomeYard?.select(id);
    }, MOCHI._id);
    const select = page.locator(".chy-card.chy-on").getByRole("button", { name: "SELECT" });
    await expect(select).toBeVisible();
    await select.click();
    await expect(page.getByTestId("toast").getByText("Mochi selected successfully!")).toBeVisible({ timeout: 10_000 });
    expect(activated.length).toBeGreaterThan(0);
  });
});
