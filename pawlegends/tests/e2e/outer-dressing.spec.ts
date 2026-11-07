import { expect, test } from '@playwright/test';
import { startFirstMatch } from './helpers';

// MAP-GAPS A12: at the widest zoom with the camera on each map corner, every screen corner's ground point lies inside
// the dressed band (mapView OUTER_DRESS: 46 m west and east, 40 m north, 25 m south), so no bare grass shows.
const DRESS = { west: 46, east: 46, north: 40, south: 25 };

test('max zoom on every map corner: the screen corners land on dressed ground', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop zoom');
  await page.setViewportSize({ width: 1440, height: 900 });
  await startFirstMatch(page);
  for (const [x, z] of [
    [0, -62],
    [100, -62],
    [0, 2],
    [100, 2],
  ] as const) {
    const pts = await page.evaluate(
      async ([fx, fz]) => {
        type V = { x: number; y: number; z: number; set(x: number, y: number, z: number): V; unproject(c: unknown): V; sub(v: V): V };
        const v = (window as unknown as { __plWorld: { view: { zoomTarget: number; gr: { zoom: number; focus: V; camera: { position: V } }; lookAt(x: number, z: number, h: number): void } } }).__plWorld.view;
        v.zoomTarget = 1.9;
        v.gr.zoom = 1.9;
        v.lookAt(fx, fz, 1e9);
        await new Promise((r) => setTimeout(r, 900));
        const cam = v.gr.camera as unknown as { position: V };
        const Ctor = cam.position.constructor as unknown as new () => V;
        const out: [number, number][] = [];
        for (const [nx, ny] of [
          [-1, 1],
          [1, 1],
          [-1, -1],
          [1, -1],
        ]) {
          const p = new Ctor().set(nx, ny, 0.5).unproject(cam).sub(cam.position);
          if (p.y >= -1e-4) {
            out.push([NaN, NaN]);
            continue;
          }
          const t = -cam.position.y / p.y;
          out.push([cam.position.x + p.x * t, -(cam.position.z + p.z * t)]);
        }
        return out;
      },
      [x, z] as const,
    );
    for (const [gx, gy] of pts) {
      expect(Number.isFinite(gx), `sky at ${x},${z}`).toBe(true);
      expect(gx).toBeGreaterThanOrEqual(-DRESS.west);
      expect(gx).toBeLessThanOrEqual(100 + DRESS.east);
      expect(gy).toBeGreaterThanOrEqual(-DRESS.south);
      expect(gy).toBeLessThanOrEqual(60 + DRESS.north);
    }
  }
});
