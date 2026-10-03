/**
 * Cupid Cat (plan G10): the enemy hit path goes through the starter shield, and the rules that keep
 * device data from unlocking progress or rewards. Phaser is replaced by a minimal Arcade.Sprite so
 * `BasePixelEnemy.dealDamageToPlayer` runs in Node against a fake scene built on the real
 * `ShieldState`.
 */
jest.mock("phaser", () => {
  class Sprite {
    scene: unknown;
    x: number;
    y: number;
    body: { x: number; y: number; width: number; height: number; setSize: () => void } | null;
    constructor(scene: unknown, x: number, y: number) {
      this.scene = scene;
      this.x = x;
      this.y = y;
      this.body = { x: x - 20, y: y - 25, width: 40, height: 50, setSize: () => undefined };
    }
    setOrigin() {
      return this;
    }
    setCollideWorldBounds() {
      return this;
    }
    setOffset() {
      return this;
    }
  }
  const Phaser = {
    Physics: { Arcade: { Sprite } },
    Math: { Distance: { Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1) } },
    Utils: { Array: { GetRandom: <T,>(items: T[]) => items[0] } },
  };
  return { __esModule: true, default: Phaser, ...Phaser };
});

jest.mock("@/components/Phaser/typography", () => ({
  scaleTo: () => 1,
  ttWorldText: () => ({ setScale: () => undefined, destroy: () => undefined, y: 0 }),
}));

import { BasePixelEnemy } from "@/components/PixelRescue/objects/BasePixelEnemy";
import {
  CUPID_GIFT_TAILS,
  SHIELD_BREAK_GRACE_MS,
  ShieldState,
  cupidGiftRedeemable,
  prefersReducedMotion,
  recordsLocalClears,
} from "@/components/PixelRescue/ftue";

/** A PixelRescueScene stand-in: `consumeShield` on the real ShieldState, like the scene's. */
function fakeScene() {
  let now = 0;
  const shield = new ShieldState();
  const scene = {
    add: { existing: jest.fn() },
    physics: { add: { existing: jest.fn() } },
    time: { delayedCall: jest.fn() },
    tweens: { add: jest.fn() },
    shield,
    advance: (ms: number) => {
      now += ms;
    },
    consumeShield: jest.fn(() => shield.hit(now) !== "hit"),
    handlePlayerHit: jest.fn(),
  };
  return scene;
}

class TestEnemy extends BasePixelEnemy {
  attack(target: unknown) {
    this.dealDamageToPlayer(target as never);
  }
  rearm() {
    this.hasDealtDamage = false;
  }
}

function enemyAt(scene: ReturnType<typeof fakeScene>, x: number) {
  return new TestEnemy({ scene: scene as never, x, y: 0, texture: "runner", groundLayer: {} as never });
}

const catAt = (x: number) => ({ x, y: 0, body: { x: x - 16, y: -16, width: 32, height: 32 } });

describe("Cupid enemy hits and the starter shield", () => {
  it("an attack in range with an active shield is absorbed: handlePlayerHit is never called", () => {
    const scene = fakeScene();
    scene.shield.arm("starter");
    const enemy = enemyAt(scene, 0);
    enemy.attack(catAt(30));
    expect(scene.consumeShield).toHaveBeenCalledWith(enemy);
    expect(scene.handlePlayerHit).not.toHaveBeenCalled();
    expect(scene.shield.isActive).toBe(false);
  });

  it("a second attack inside the grace window does not land either", () => {
    const scene = fakeScene();
    scene.shield.arm("starter");
    const enemy = enemyAt(scene, 0);
    enemy.attack(catAt(30));
    enemy.rearm();
    scene.advance(SHIELD_BREAK_GRACE_MS - 1);
    enemy.attack(catAt(30));
    expect(scene.handlePlayerHit).not.toHaveBeenCalled();
  });

  it("after the grace window the next attack hits", () => {
    const scene = fakeScene();
    scene.shield.arm("starter");
    const enemy = enemyAt(scene, 0);
    enemy.attack(catAt(30));
    enemy.rearm();
    scene.advance(SHIELD_BREAK_GRACE_MS);
    enemy.attack(catAt(30));
    expect(scene.handlePlayerHit).toHaveBeenCalledTimes(1);
  });

  it("without a shield an attack in range hits, and one out of range does nothing", () => {
    const scene = fakeScene();
    enemyAt(scene, 0).attack(catAt(500));
    expect(scene.consumeShield).not.toHaveBeenCalled();
    expect(scene.handlePlayerHit).not.toHaveBeenCalled();
    enemyAt(scene, 0).attack(catAt(30));
    expect(scene.handlePlayerHit).toHaveBeenCalledTimes(1);
  });
});

describe("Cupid device-local clears", () => {
  it("are kept only when the save cannot reach the server", () => {
    expect(recordsLocalClears(null)).toBe(true);
    expect(recordsLocalClears(undefined)).toBe(true);
    expect(recordsLocalClears({ transient: true })).toBe(true);
    expect(recordsLocalClears({ transient: false })).toBe(false);
    expect(recordsLocalClears({})).toBe(false);
  });
});

describe("Cupid gift", () => {
  const days = 14;
  const all = (value: number) => Array.from({ length: days }, () => value);

  it("is redeemable only when the server shows every day cleared", () => {
    expect(cupidGiftRedeemable({ seasonEventCleared: all(1) } as never, false)).toBe(true);
    const oneMissing = all(1);
    oneMissing[5] = 0;
    expect(cupidGiftRedeemable({ seasonEventCleared: oneMissing } as never, false)).toBe(false);
  });

  it("never from no profile, an empty profile, or once redeemed", () => {
    expect(cupidGiftRedeemable(null, false)).toBe(false);
    expect(cupidGiftRedeemable({} as never, false)).toBe(false);
    expect(cupidGiftRedeemable({ seasonEventCleared: all(1) } as never, true)).toBe(false);
  });

  it("matches the backend reward", () => {
    expect(CUPID_GIFT_TAILS).toBe(10000);
  });
});

describe("prefersReducedMotion", () => {
  it("reads the media query and survives a missing or throwing matchMedia", () => {
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
    expect(prefersReducedMotion(undefined)).toBe(false);
    expect(
      prefersReducedMotion({
        matchMedia: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(false);
  });
});
