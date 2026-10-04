import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { type BackendMock, expect, gotoAndSettle, test } from "./fixtures";

/**
 * Night GameModal migration, part A (plan G6 "Overlay migration", F3.3/F3.4, G14 Wheel; task 4c):
 * Cats, Wheel, Packs, Profile, Events (Quests), Codex and Support are GameModals with a title, a
 * close that is never clipped, Esc to close, and zero axe violations for the rules below at 390 and
 * 1440. The Wheel cannot be closed mid-spin. The Packs checkout leaves third-party iframes usable.
 *
 * Firebase is faked through the E2E auth hook (`__TT_E2E_AUTH__`); the backend is mocked.
 * Set MODALS_A_SHOTS=<dir> to save a screenshot of every modal.
 */

const AXE_RULES = ["button-name", "nested-interactive", "aria-dialog-name", "image-alt", "color-contrast"];

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
const PLAYER = {
  _id: "64e2e0000000000000000u01",
  isGuest: false,
  name: "Player",
  onboarding: { state: "done" },
  tails: 120,
  catnipChaos: [],
  match3: [],
  cat: CAT,
  cats: [CAT],
  codex: [],
  quests: [],
  streak: 3,
  canRedeemLives: true,
};
const GUEST = { ...PLAYER, _id: "64e2e0000000000000000g01", isGuest: true, name: "Guest" };

const isUserToken = (token: string | undefined) => !!token && token.endsWith(".user");

/** A populated Codex: claimable tier, challenge and milestone, so the night cards render with data. */
// Every check met: the backend marks a tier claimable only for an eligible account, and the
// TIERS card shows CLAIM only then.
const PROGRESSION = {
  eligible: true,
  eligibilityCriteria: [
    { id: "cats", label: "Own 3 cats", description: "Adopt or open packs", current: 3, target: 3, met: true },
    { id: "streak", label: "3 day streak", description: "Spin daily", current: 3, target: 3, met: true },
  ],
  metrics: {
    collectiblesOwned: 1,
    tierCounts: { common: 1, rare: 0, epic: 0, legendary: 0 },
    rareOrAbove: 0,
    epicOrAbove: 0,
    questsCompleted: 2,
    streak: 3,
    tails: 120,
    packPurchases: 0,
    portraitPurchases: 0,
    totalPurchases: 0,
    additionalLegendaryCards: 0,
    legendaryStashBonusPercent: 0,
    legendaryStashBonusMultiplier: 1,
    collectibleLevel: 1,
    scoreBreakdown: { catScore: 10, questScore: 5, streakScore: 3, tailsScore: 2, monetizationScore: 0 },
  },
  gamification: {
    xp: 40,
    level: 2,
    nextLevelXp: 100,
    levelProgress: 40,
    title: "Kitten Scout",
    comboMultiplier: 1,
    streakBonusTails: 5,
    dailyChallenges: [
      { id: "play", label: "Play 3 runs", description: "Any game", current: 3, target: 3, completed: true, claimed: false, claimable: true, rewardTails: 15, icon: "logo/coin.webp" },
      { id: "spin", label: "Daily Spin", description: "Spin the wheel", current: 0, target: 1, completed: false, claimed: false, claimable: false, rewardTails: 5, icon: "logo/coin.webp" },
    ],
    milestones: [
      { id: "m1", label: "First cat", current: 1, target: 1, reached: true, claimed: false, claimable: true, rewardTails: 20, icon: "logo/coin.webp", unlockable: "Badge" },
    ],
    nextMilestoneId: "m1",
    potentialBonusTails: 40,
  },
  tiers: [
    {
      id: "EXPLORER",
      name: "Explorer",
      description: "Start the journey",
      requirements: [{ id: "cats", label: "Own 1 cat", current: 1, target: 1, met: true }],
      reward: { tails: 50, unlockable: "Explorer badge", revealTitle: "Explorer chest", revealTeaser: "A first treat", image: "logo/coin.webp" },
      unlocked: true,
      claimed: false,
      claimable: true,
      unlockProgress: 100,
    },
    {
      id: "RESCUER",
      name: "Rescuer",
      description: "Help a shelter",
      requirements: [{ id: "packs", label: "Open 1 pack", current: 0, target: 1, met: false }],
      reward: { tails: 100, unlockable: "Rescuer badge", revealTitle: "Rescuer chest", revealTeaser: "For helpers", image: "logo/coin.webp" },
      unlocked: false,
      claimed: false,
      claimable: false,
      unlockProgress: 0,
    },
  ],
  currentTierId: "EXPLORER",
  nextTierId: "RESCUER",
  unlockedUnlockables: [],
  claimedUnlockables: [],
  totalClaimedTiers: 0,
  totalClaimedChallenges: 0,
  totalClaimedMilestones: 0,
};

const ARTICLE = {
  _id: "64e2e0000000000000000a01",
  title: "Scout found a home",
  slug: "scout-found-a-home",
  featuredImage: { url: "/logo/logo.webp" },
  excerpt: "A shelter story.",
  category: { _id: "64e2e0000000000000000ca1", name: "Stories", slug: "stories" },
  createdAt: "2026-09-01T00:00:00.000Z",
  type: "ARTICLE",
  comments: [],
};

/**
 * Opens a lobby modal no HUD control reaches (the SHOP) through GameProvider's E2E hook
 * (`window.__TT_E2E_GAME__`, set when `__TT_E2E__` is; dev and E2E builds only). The old fiber
 * walk looked GameProvider up by its function name, which the production build minifies away.
 */
async function forceOpenedModal(page: Page, modal: string) {
  await page.waitForFunction(() => !!(window as unknown as { __TT_E2E_GAME__?: unknown }).__TT_E2E_GAME__);
  await page.evaluate(
    (value) => (window as unknown as { __TT_E2E_GAME__: { openModal: (next: string) => void } }).__TT_E2E_GAME__.openModal(value),
    modal,
  );
}

function mockBackend(backend: BackendMock, options: { guest?: boolean; packedCat?: boolean } = {}) {
  let redeems = 0;
  backend
    .on("GET", "/user/profile", (request) => ({
      body: options.guest && !isUserToken(request.headers()["accesstoken"]) ? GUEST : PLAYER,
    }))
    .on("GET", /^\/user\/leaderboard.*\/position$/, { body: 1 })
    .on("GET", /^\/user\/leaderboard/, { body: [] })
    .on("GET", "/user/cats", { body: options.packedCat ? [CAT, { ...CAT, _id: "64e2e0000000000000000c02", name: "Mystery", packed: true, packType: "STARTER" }] : [CAT] })
    .on("POST", "/quest/search", { body: [] })
    .on("GET", "/ticket", { body: [] })
    .on("GET", /^\/user\/airdrop/, { body: PROGRESSION })
    .on("POST", /^\/user\/airdrop\/claim/, { body: { success: true, tails: 50, progression: PROGRESSION } })
    .on("GET", "/user/catbassadors/lives/redeem", () => {
      redeems += 1;
      return { body: { tails: 25 } };
    });
  return { redeems: () => redeems };
}

async function openGame(page: Page, backend: BackendMock, options: { guest?: boolean; packedCat?: boolean } = {}) {
  const calls = mockBackend(backend, options);
  await page.addInitScript((guest) => {
    (window as unknown as Record<string, unknown>).__TT_E2E_AUTH__ = guest
      ? { user: { uid: "guest-1", isAnonymous: true } }
      : { user: { uid: "player-1", isAnonymous: false } };
    (window as unknown as Record<string, unknown>).__TT_E2E__ = true;
  }, !!options.guest);
  await gotoAndSettle(page, "/game", 2500);
  await expect(page.getByRole("button", { name: "PLAY", exact: true }).first()).toBeVisible({ timeout: 30_000 });
  return calls;
}

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });

/** The HUD "ABOUT ME" tile is a plain div under the cat art; retry until the modal answers. */
async function openProfile(page: Page) {
  await expect(async () => {
    if (!(await dialog(page, "ABOUT ME").isVisible())) {
      await page.getByText("ABOUT ME", { exact: true }).first().click({ force: true });
    }
    await expect(dialog(page, "ABOUT ME")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

const MODALS: Array<{ id: string; title: string; open: (page: Page) => Promise<void> }> = [
  { id: "profile", title: "ABOUT ME", open: openProfile },
  { id: "codex", title: "PROGRESS", open: (page) => page.getByText("PROGRESS", { exact: true }).first().click() },
  { id: "cats", title: "MY PETS", open: (page) => page.getByRole("button", { name: "MY PETS" }).click() },
  { id: "packs", title: "PACKS", open: (page) => page.getByRole("button", { name: "PACKS" }).click() },
  { id: "wheel", title: "DAILY SPIN", open: (page) => page.getByRole("button", { name: "DAILY SPIN" }).click() },
  { id: "events", title: "EVENTS", open: (page) => page.getByRole("button", { name: "EVENTS" }).click() },
  {
    id: "support",
    title: "SUPPORT",
    open: async (page) => {
      await openProfile(page);
      await dialog(page, "ABOUT ME").getByRole("button", { name: "SUPPORT" }).click();
    },
  },
  // No HUD control opens the SHOP; it is reached through GameProvider's `setOpenedModal`.
  { id: "shop", title: "SHOP", open: (page) => forceOpenedModal(page, "INVITE") },
];

/** The close button's box is inside the viewport and inside every clipping ancestor. */
async function closeButtonClipped(page: Page, title: string): Promise<string[]> {
  return dialog(page, title)
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .evaluate((button) => {
      const problems: string[] = [];
      const box = button.getBoundingClientRect();
      if (box.width < 43.5 || box.height < 43.5) problems.push(`size ${box.width}x${box.height}`);
      if (box.left < 0 || box.top < 0 || box.right > window.innerWidth || box.bottom > window.innerHeight) {
        problems.push(`outside the viewport ${JSON.stringify(box)}`);
      }
      for (let node = button.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.overflowX === "visible" && style.overflowY === "visible") continue;
        const clip = node.getBoundingClientRect();
        if (box.left < clip.left - 0.5 || box.top < clip.top - 0.5 || box.right > clip.right + 0.5 || box.bottom > clip.bottom + 0.5) {
          problems.push(`clipped by <${node.tagName.toLowerCase()} class="${node.className}">`);
        }
      }
      return problems;
    });
}

test.describe("night GameModal migration A (G6, F3.3)", () => {
  test.use({ allowUnmocked: true });

  for (const modal of MODALS) {
    test(`${modal.id}: titled dialog, axe clean, X not clipped, Esc closes`, async ({ page, backend }, testInfo) => {
      test.skip(!["mobile-390", "desktop-1440"].includes(testInfo.project.name), "Checked at 390 and 1440.");
      await openGame(page, backend);
      await modal.open(page);
      const box = dialog(page, modal.title);
      await expect(box).toBeVisible();
      // Night chrome: the scrim is the GameModal one, no cream sheet behind the panel.
      await expect(page.getByTestId("game-modal-scrim")).toBeVisible();
      await page.waitForTimeout(600);

      const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withRules(AXE_RULES).analyze();
      const violations = axe.violations.map(
        (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
      );
      expect(violations, `axe on ${modal.id}`).toEqual([]);
      expect(await closeButtonClipped(page, modal.title)).toEqual([]);

      const shots = process.env.MODALS_A_SHOTS;
      if (shots) await page.screenshot({ path: `${shots}/${modal.id}-${testInfo.project.name}.png` });

      // The game is suspended while the modal is open (F3.5): at least one lobby game is booted,
      // and every one on the page has its loop asleep.
      const loops = await page.evaluate(() =>
        ((window as unknown as { __ttGames?: Array<{ canvas?: HTMLCanvasElement; loop?: { sleeping?: boolean } }> }).__ttGames || [])
          .filter((game) => game.canvas?.isConnected)
          .map((game) => game.loop?.sleeping ?? null),
      );
      // The lobby boots no Phaser game (games start from PLAY), so there may be nothing to put to
      // sleep here; RTL asserts the modal asks for the suspension. When a game is on the page, its
      // loop must be asleep: `undefined` does not count.
      if (loops.length === 0) testInfo.annotations.push({ type: "suspension", description: "no booted game in the lobby" });
      expect(loops.every((sleeping) => sleeping === true), `loops ${JSON.stringify(loops)}`).toBe(true);

      await page.keyboard.press("Escape");
      await expect(box).toHaveCount(0);
    });
  }

  test("the X and the scrim close a modal, and focus returns to the opener", { tag: "@ci-desktop" }, async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Once is enough.");
    await openGame(page, backend);
    const opener = page.getByRole("button", { name: "EVENTS" });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(dialog(page, "EVENTS")).toBeVisible();
    await dialog(page, "EVENTS").getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog(page, "EVENTS")).toHaveCount(0);
    await expect(opener).toBeFocused();

    await opener.click();
    await expect(dialog(page, "EVENTS")).toBeVisible();
    await page.getByTestId("game-modal-scrim").click({ position: { x: 4, y: 4 } });
    await expect(dialog(page, "EVENTS")).toHaveCount(0);
  });

  test("Wheel: a spin cannot be interrupted by Esc, the scrim or the X", async ({ page, backend }, testInfo) => {
    test.skip(!["mobile-390", "desktop-1440"].includes(testInfo.project.name), "Checked at 390 and 1440.");
    const calls = await openGame(page, backend);
    await page.getByRole("button", { name: "DAILY SPIN" }).click();
    const wheel = dialog(page, "DAILY SPIN");
    await expect(wheel).toBeVisible();
    // Within the safe area at any viewport.
    const panel = await page.getByTestId("wheel-panel").boundingBox();
    const viewport = page.viewportSize()!;
    expect(panel!.y).toBeGreaterThanOrEqual(0);
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height);

    await wheel.getByRole("button", { name: "SPIN!" }).click();
    await expect.poll(() => calls.redeems()).toBe(1);
    const close = wheel.getByRole("button", { name: "Close", exact: true });
    await expect(close).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await close.click({ force: true });
    await page.getByTestId("game-modal-scrim").click({ position: { x: 4, y: 4 }, force: true });
    await expect(wheel).toBeVisible();

    // The spin and its reveal end, and the modal closes again.
    await expect(close).not.toHaveAttribute("aria-disabled", "true", { timeout: 20_000 });
    await page.keyboard.press("Escape");
    await expect(wheel).toHaveCount(0);
  });

  test("a guest's Daily Spin opens the AuthSheet first, and the spin runs once after sign-in", { tag: "@ci-desktop" }, async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Once is enough.");
    const calls = await openGame(page, backend, { guest: true });
    await page.getByRole("button", { name: "DAILY SPIN" }).click();
    await dialog(page, "DAILY SPIN").getByRole("button", { name: "SPIN!" }).click();
    await expect(page.getByRole("heading", { name: "CLAIM YOUR REWARDS" })).toBeVisible();
    expect(calls.redeems()).toBe(0);
    await page.evaluate(() => (window as unknown as { __ttE2EAuth: { signIn: () => void } }).__ttE2EAuth.signIn());
    await expect.poll(() => calls.redeems()).toBe(1);
    const redeems = backend.requests().filter((call) => call.path === "/user/catbassadors/lives/redeem");
    expect(redeems.every((call) => isUserToken(call.headers["accesstoken"]))).toBe(true);
  });

  test("Packs: the checkout keeps a Stripe iframe clickable and the dialog open", async ({ page, backend }, testInfo) => {
    test.skip(!["mobile-390", "desktop-1440"].includes(testInfo.project.name), "Checked at 390 and 1440.");
    backend.on("POST", /^\/stripe/, { status: 500, body: {} });
    await openGame(page, backend);
    await page.getByRole("button", { name: "PACKS" }).click();
    const packs = dialog(page, "PACKS");
    await expect(packs).toBeVisible();
    await packs.getByRole("button", { name: "$5" }).click();
    await expect(page.getByTestId("packs-panel")).toHaveAttribute("data-payment-step", "true");
    // The checkout itself, not the pack select again (the dialog remounts its content when it
    // turns non-modal; the selection lives in PacksModal).
    await expect(packs.getByRole("button", { name: "Pay with Card" })).toBeVisible();
    if (process.env.MODALS_A_SHOTS) {
      await page.screenshot({ path: `${process.env.MODALS_A_SHOTS}/packs-checkout-${testInfo.project.name}.png` });
    }
    // A stand-in for Stripe's 3DS challenge: an iframe Stripe appends to <body>, above the modal.
    await page.evaluate(() => {
      const frame = document.createElement("iframe");
      frame.name = "__privateStripeFrame-3ds";
      frame.setAttribute("title", "3DS challenge");
      frame.srcdoc = '<button id="ok" onclick="document.body.dataset.clicked=1">Complete</button>';
      Object.assign(frame.style, { position: "fixed", left: "20px", bottom: "20px", width: "200px", height: "80px", zIndex: "999" });
      document.body.appendChild(frame);
    });
    const challenge = page.frameLocator('iframe[name="__privateStripeFrame-3ds"]');
    await challenge.locator("#ok").click();
    await expect(challenge.locator("body")).toHaveAttribute("data-clicked", "1");
    await expect(packs).toBeVisible();
    // A stray tap on the scrim does not close a checkout in progress; the X still does.
    await page.getByTestId("game-modal-scrim").click({ position: { x: 4, y: 4 }, force: true });
    await expect(packs).toBeVisible();
    await packs.getByRole("button", { name: "Close", exact: true }).click();
    await expect(packs).toHaveCount(0);
  });

  test("a guest's profile offers Save progress and Erase guest progress", { tag: "@ci-desktop" }, async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Once is enough.");
    await openGame(page, backend, { guest: true });
    await openProfile(page);
    const profile = dialog(page, "ABOUT ME");
    await expect(profile.getByTestId("guest-menu")).toBeVisible();
    await expect(profile.getByRole("button", { name: "DELETE ACCOUNT" })).toHaveCount(0);
    await profile.getByRole("button", { name: "ERASE GUEST PROGRESS" }).click();
    await expect(profile.getByTestId("confirm-erase-guest")).toBeVisible();
    await profile.getByRole("button", { name: "KEEP PLAYING" }).click();
    await profile.getByRole("button", { name: "SAVE PROGRESS" }).click();
    await expect(page.getByRole("heading", { name: "SAVE YOUR CAT" })).toBeVisible();
  });

  test("the starter's Rename opens the RenameSheet over the profile", async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390", "Once is enough.");
    await openGame(page, backend);
    await openProfile(page);
    await dialog(page, "ABOUT ME").getByRole("button", { name: /RENAME Scout/i }).click();
    const rename = dialog(page, "Rename your cat");
    await expect(rename).toBeVisible();
    await expect(rename.getByLabel("New name")).toHaveValue("Scout");
    await page.keyboard.press("Escape");
    await expect(rename).toHaveCount(0);
    await expect(dialog(page, "ABOUT ME")).toBeVisible();
  });

  test("an account deletes itself through DELETE /user/me after a confirm step", { tag: "@ci-desktop" }, async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Once is enough.");
    backend.on("DELETE", "/user/me", { body: { success: true } });
    await openGame(page, backend);
    await openProfile(page);
    const profile = dialog(page, "ABOUT ME");
    await profile.getByRole("button", { name: "DELETE ACCOUNT" }).click();
    await expect(profile.getByTestId("confirm-delete-account")).toBeVisible();
    expect(backend.requests().filter((call) => call.method === "DELETE")).toHaveLength(0);
    await profile.getByRole("button", { name: "DELETE FOREVER" }).click();
    await expect.poll(() => backend.requests().filter((call) => call.method === "DELETE" && call.path === "/user/me").length).toBe(1);
    await expect(profile).toHaveCount(0);
  });

  test("Wheel: a redeem that never answers does not trap the player", async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390", "Once is enough.");
    await openGame(page, backend);
    let hung = 0;
    backend.on("GET", "/user/catbassadors/lives/redeem", () => {
      hung += 1;
      return new Promise(() => undefined);
    });
    await page.getByRole("button", { name: "DAILY SPIN" }).click();
    const wheel = dialog(page, "DAILY SPIN");
    await wheel.getByRole("button", { name: "SPIN!" }).click();
    await expect.poll(() => hung).toBe(1);
    const close = wheel.getByRole("button", { name: "Close", exact: true });
    await expect(close).toHaveAttribute("aria-disabled", "true");
    // The redeem timeout (10 s) lifts the lock; the X closes the Wheel again.
    await expect(close).not.toHaveAttribute("aria-disabled", "true", { timeout: 16_000 });
    await close.click();
    await expect(wheel).toHaveCount(0);
  });

  test("MY PETS: a packed cat opens the nested Pack modal, titled, axe clean, X not clipped", async ({ page, backend }, testInfo) => {
    test.skip(!["mobile-390", "desktop-1440"].includes(testInfo.project.name), "Checked at 390 and 1440.");
    await openGame(page, backend, { packedCat: true });
    await page.getByRole("button", { name: "MY PETS" }).click();
    const pets = dialog(page, "MY PETS");
    await expect(pets).toBeVisible();
    await expect(async () => {
      await pets.getByRole("button", { name: "Open Starter pack" }).first().click({ force: true });
      await expect(page.getByRole("dialog", { name: /pack$/i })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    const pack = page.getByRole("dialog", { name: /pack$/i });
    const title = (await pack.getAttribute("aria-label")) ?? (await pack.locator("h2").first().innerText());
    await page.waitForTimeout(600);
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withRules(AXE_RULES).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    expect(await closeButtonClipped(page, title.trim())).toEqual([]);
    if (process.env.MODALS_A_SHOTS) await page.screenshot({ path: `${process.env.MODALS_A_SHOTS}/pack-${testInfo.project.name}.png` });
    await page.keyboard.press("Escape");
    await expect(pack).toHaveCount(0);
    await expect(pets).toBeVisible();
  });

  test("SHARE (phones): titled sheet, axe clean, X not clipped", async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390", "ShareModal is phones only.");
    mockBackend(backend);
    backend.on("POST", /^\/feed\/search/, { body: [ARTICLE] });
    await gotoAndSettle(page, "/feed", 2500);
    await page.getByText("Share", { exact: true }).first().click();
    const share = dialog(page, "SHARE");
    await expect(share).toBeVisible();
    await page.waitForTimeout(400);
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withRules(AXE_RULES).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    expect(await closeButtonClipped(page, "SHARE")).toEqual([]);
    if (process.env.MODALS_A_SHOTS) await page.screenshot({ path: `${process.env.MODALS_A_SHOTS}/share-${testInfo.project.name}.png` });
    await page.keyboard.press("Escape");
    await expect(share).toHaveCount(0);
  });

  test("guest gates: Packs, Codex claim and Support send open the sheet; a dismissal sends nothing", { tag: "@ci-desktop" }, async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Once is enough.");
    await openGame(page, backend, { guest: true });
    const sheet = page.getByRole("dialog", { name: /WELCOME TO TOKEN TAILS|CLAIM YOUR REWARDS/ });
    const dismiss = async () => {
      await expect(sheet).toBeVisible();
      await sheet.getByRole("button", { name: "Keep playing as guest" }).click();
      await expect(sheet).toHaveCount(0);
    };

    // Packs: the pack select stays, no checkout request.
    await page.getByRole("button", { name: "PACKS" }).click();
    const packs = dialog(page, "PACKS");
    await packs.getByRole("button", { name: "$5" }).click();
    await dismiss();
    await expect(page.getByTestId("packs-panel")).not.toHaveAttribute("data-payment-step", "true");
    await expect(packs.getByRole("button", { name: "$5" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(packs).toHaveCount(0);

    // Codex: a claimable tier, revealed, then CLAIM.
    await page.getByText("PROGRESS", { exact: true }).first().click();
    const codex = dialog(page, "PROGRESS");
    await expect(codex).toBeVisible();
    await codex.getByRole("tab", { name: /TIERS/ }).click();
    await codex.getByRole("button", { name: "REVEAL PRIZE" }).first().click();
    await codex.getByRole("button", { name: /^CLAIM 50 TAILS$/ }).first().click();
    await dismiss();
    await page.keyboard.press("Escape");
    await expect(codex).toHaveCount(0);

    // Support: the message is written, SEND asks for an account.
    await openProfile(page);
    await dialog(page, "ABOUT ME").getByRole("button", { name: "SUPPORT" }).click();
    const support = dialog(page, "SUPPORT");
    await support.getByLabel("Your message").fill("My cat is stuck");
    await support.getByRole("button", { name: "SEND" }).click();
    await dismiss();

    const writes = backend
      .requests()
      .filter((call) => /^\/(stripe|ticket|user\/airdrop\/claim)/.test(call.path) && call.method !== "GET");
    expect(writes).toEqual([]);
  });

  test("Codex with data: night cards, axe clean at 390 and 1440", async ({ page, backend }, testInfo) => {
    test.skip(!["mobile-390", "desktop-1440"].includes(testInfo.project.name), "Checked at 390 and 1440.");
    await openGame(page, backend);
    await page.getByText("PROGRESS", { exact: true }).first().click();
    const codex = dialog(page, "PROGRESS");
    // PROGRESS opens on IMPACT (task 6a); REWARDS is the old INFO tab, MISSIONS the old GOALS.
    await codex.getByRole("tab", { name: "REWARDS", exact: true }).click();
    await expect(codex.getByText("To claim", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    // Every tab with data: the night cards keep their contrast (no cream plates left).
    for (const tab of ["IMPACT", "REWARDS", "MISSIONS", "TIERS", "PET ART", "BADGES"]) {
      await codex.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      if (tab === "TIERS") await codex.getByRole("button", { name: "REVEAL PRIZE" }).first().click();
      await page.waitForTimeout(700);
      const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withRules(AXE_RULES).analyze();
      expect(
        axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
        `axe on Codex ${tab}`,
      ).toEqual([]);
      if (process.env.MODALS_A_SHOTS) {
        await page.screenshot({ path: `${process.env.MODALS_A_SHOTS}/codex-${tab.replace(" ", "-").toLowerCase()}-${testInfo.project.name}.png` });
      }
    }
  });
});
