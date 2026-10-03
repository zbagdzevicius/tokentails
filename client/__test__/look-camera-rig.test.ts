import { canStepZoom, DEADZONE, FOLLOW_LERP, installCameraRig, SKY_TILES } from "@/components/Phaser/look/cameraRig";
import { LOOK_RESIZE } from "@/components/Phaser/look/makeGameConfig";
import { CANVAS_PIXEL_RATIO } from "@/components/Phaser/look/registry";

// G7 "Camera" and F10: every hub and platformer scene gets an integer zoom from pickZoom, map
// bounds, follow lerp 0.12 with a deadzone and look-ahead, and integer zoom tweens.

type Handler = (...args: unknown[]) => void;

function emitter() {
  const handlers = new Map<string, Set<Handler>>();
  return {
    on(event: string, fn: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    },
    once(event: string, fn: Handler) {
      const wrap: Handler = (...args) => {
        handlers.get(event)?.delete(wrap);
        fn(...args);
      };
      this.on(event, wrap);
    },
    off(event: string, fn: Handler) {
      handlers.get(event)?.delete(fn);
    },
    emit(event: string, ...args: unknown[]) {
      Array.from(handlers.get(event) ?? []).forEach((fn) => fn(...args));
    },
  };
}

function fakeScene(css: { width: number; height: number }, dpr: number) {
  const registry = new Map<string, unknown>([[CANVAS_PIXEL_RATIO, dpr]]);
  const scale = { width: css.width * dpr, height: css.height * dpr };
  const camera = {
    width: scale.width,
    height: scale.height,
    zoom: 1,
    roundPixels: false,
    followOffset: { x: 0, y: 0 },
    bounds: null as null | number[],
    deadzone: null as null | number[],
    follow: null as null | { target: unknown; lerp: number[] },
    _follow: null as unknown,
    setZoom(z: number) {
      this.zoom = z;
    },
    setRoundPixels(v: boolean) {
      this.roundPixels = v;
    },
    setBounds(...b: number[]) {
      this.bounds = b;
    },
    setDeadzone(...d: number[]) {
      this.deadzone = d;
    },
    startFollow(target: unknown, _round: boolean, lx: number, ly: number) {
      this._follow = target;
      this.follow = { target, lerp: [lx, ly] };
      this.followOffset = { x: 0, y: 0 };
    },
    zoomTo: jest.fn(function (this: { zoom: number }, z: number, _d: number, _e: string, _f: boolean, cb: Handler) {
      this.zoom = z * 0.97; // mid-tween value, then the end callback
      cb(null, 1);
    }),
  };
  const events = emitter();
  const gameEvents = emitter();
  const scene = {
    registry: { get: (key: string) => registry.get(key) },
    scale,
    cameras: { main: camera },
    events,
    game: { events: gameEvents },
    time: { delayedCall: (_ms: number, fn: () => void) => fn() },
  };
  return { scene, camera, events, gameEvents, registry, scale };
}

const world = { x: -1024, y: -960, width: 4096, height: 1280 };

describe("installCameraRig", () => {
  it("applies an integer zoom from pickZoom and bounds with sky room", () => {
    const { scene, camera } = fakeScene({ width: 1440, height: 900 }, 1);
    const rig = installCameraRig(scene as never, { preset: "hub", world, reducedMotion: false });
    expect(rig.zoom).toBe(3);
    expect(camera.zoom).toBe(3);
    expect(camera.roundPixels).toBe(true);
    expect(camera.bounds).toEqual([world.x, world.y - SKY_TILES * 32, world.width, world.height + SKY_TILES * 32]);
  });

  it("platformers show 14 x 9 tiles; phones in portrait swap the target", () => {
    expect(installCameraRig(fakeScene({ width: 1440, height: 900 }, 1).scene as never, { preset: "platformer", world, reducedMotion: false }).zoom).toBe(3);
    expect(installCameraRig(fakeScene({ width: 390, height: 844 }, 2).scene as never, { preset: "platformer", world, reducedMotion: false }).zoom).toBe(2);
    expect(installCameraRig(fakeScene({ width: 390, height: 844 }, 2).scene as never, { preset: "hub", world, reducedMotion: false }).zoom).toBe(3);
  });

  it("follows with lerp 0.12 and a deadzone, and looks ahead on top of the scene's own offset", () => {
    const { scene, camera, events } = fakeScene({ width: 1440, height: 900 }, 1);
    const rig = installCameraRig(scene as never, { preset: "platformer", world, reducedMotion: false });
    const cat = { body: { velocity: { x: 200 } } };
    rig.follow(cat as never);
    expect(camera.follow?.lerp).toEqual([FOLLOW_LERP, FOLLOW_LERP]);
    const view = { w: 1440 / 3, h: 900 / 3 };
    expect(camera.deadzone).toEqual([Math.round(view.w * DEADZONE.x), Math.round(view.h * DEADZONE.y)]);
    for (let i = 0; i < 200; i += 1) events.emit("update");
    // Running right: the camera leads to the right (followOffset is subtracted from the target).
    expect(camera.followOffset.x).toBeLessThan(-40);
    expect(Number.isInteger(camera.followOffset.x)).toBe(true);
    // The scene sets its own offset (Cupid's gate): the look-ahead is added to it, not replacing it.
    camera.followOffset.x = 30;
    events.emit("update");
    const ahead = camera.followOffset.x - 30;
    expect(ahead).toBeLessThan(-40);
    cat.body.velocity.x = 0;
    for (let i = 0; i < 400; i += 1) events.emit("update");
    expect(camera.followOffset.x).toBe(30);
  });

  it("has no look-ahead under reduced motion", () => {
    const { scene, camera, events } = fakeScene({ width: 1440, height: 900 }, 1);
    const rig = installCameraRig(scene as never, { preset: "platformer", world, reducedMotion: true });
    rig.follow({ body: { velocity: { x: 300 } } } as never);
    for (let i = 0; i < 50; i += 1) events.emit("update");
    expect(camera.followOffset.x).toBe(0);
  });

  it("zoom tweens land on whole levels; a resize re-picks the zoom", () => {
    const { scene, camera, gameEvents, scale } = fakeScene({ width: 1440, height: 900 }, 1);
    const rig = installCameraRig(scene as never, { preset: "platformer", world, reducedMotion: false });
    const done = jest.fn();
    rig.zoomBy(1, 500, done);
    expect(camera.zoomTo).toHaveBeenCalledWith(4, 500, "Power2", true, expect.any(Function));
    expect(camera.zoom).toBe(4);
    rig.zoomHome(300, done);
    expect(camera.zoom).toBe(3);
    expect(done).toHaveBeenCalledTimes(2);

    scale.width = 1024;
    scale.height = 700;
    camera.width = 1024;
    camera.height = 700;
    gameEvents.emit(LOOK_RESIZE, {});
    expect(rig.zoom).toBe(2);
    expect(camera.zoom).toBe(2);
    expect(Number.isInteger(camera.zoom)).toBe(true);
  });

  it("a resize while stepped in keeps k + step (the tutorial tour does not snap back)", () => {
    const { scene, camera, gameEvents, scale } = fakeScene({ width: 1440, height: 900 }, 1);
    const rig = installCameraRig(scene as never, { preset: "platformer", world, reducedMotion: false });
    rig.zoomBy(1, 500);
    expect(rig.step).toBe(1);
    expect(camera.zoom).toBe(4);
    scale.width = 1024;
    scale.height = 700;
    camera.width = 1024;
    camera.height = 700;
    gameEvents.emit(LOOK_RESIZE, {});
    expect(rig.zoom).toBe(2);
    expect(camera.zoom).toBe(3);
    rig.zoomHome(300);
    expect(rig.step).toBe(0);
    expect(camera.zoom).toBe(2);
    gameEvents.emit(LOOK_RESIZE, {});
    expect(camera.zoom).toBe(2);
  });

  it("a resize during a zoom tween lands on the new k + step", () => {
    const { scene, camera, gameEvents, scale } = fakeScene({ width: 1440, height: 900 }, 1);
    const rig = installCameraRig(scene as never, { preset: "platformer", world, reducedMotion: false });
    let end: ((cam: unknown, progress: number) => void) | null = null;
    camera.zoomTo.mockImplementationOnce((_z: number, _d: number, _e: string, _f: boolean, cb: Handler) => {
      end = cb;
    });
    rig.zoomBy(1, 500);
    scale.width = 1024;
    scale.height = 700;
    camera.width = 1024;
    camera.height = 700;
    gameEvents.emit(LOOK_RESIZE, {});
    end!(null, 1);
    expect(camera.zoom).toBe(3);
  });

  it("canStepZoom: one level in only while at least 10 tiles stay visible across", () => {
    // Desktop 1440 x 900 at DPR 1, platformer k = 3: 4 shows 11.25 tiles.
    expect(canStepZoom(1440, 3, 1)).toBe(true);
    // 1024 x 700, k = 2: 3 would show 10.7 tiles.
    expect(canStepZoom(1024, 2, 1)).toBe(true);
    // Phone portrait 390 at DPR 2 (780 backing px), k = 2: 3 shows 8.1 tiles.
    expect(canStepZoom(780, 2, 1)).toBe(false);
    // Phone landscape 844 x 390 at DPR 2 (1688 px), k = 4: 5 shows 10.55 tiles.
    expect(canStepZoom(1688, 4, 1)).toBe(true);
    expect(canStepZoom(780, 2, 0)).toBe(true);
  });

  it("stops listening on shutdown", () => {
    const { scene, camera, events, gameEvents, scale } = fakeScene({ width: 1440, height: 900 }, 1);
    installCameraRig(scene as never, { preset: "hub", world: null, reducedMotion: false });
    expect(camera.bounds).toBeNull();
    events.emit("shutdown");
    scale.width = 400;
    gameEvents.emit(LOOK_RESIZE, {});
    expect(camera.zoom).toBe(3);
  });
});
