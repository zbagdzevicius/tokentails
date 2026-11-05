/**
 * LoL pass (lane C): order marker looks (render only). A move click draws a green chevron burst, four arrows that
 * collapse into the clicked point over 350 ms on a mint ground ring; an attack order keeps the red collapsing ring
 * (views/decals.ts crosshair) and adds a red outline under the targeted unit for 600 ms. On touch a thin red ring stays
 * under the unit the player's basic attacks are landing on.
 */
import * as THREE from 'three';

/** Move chevrons: how long they take to collapse (s). */
export const CHEVRON_LIFE = 0.35;
/** The mint ground ring under the chevrons (s). */
export const MOVE_RING_LIFE = 0.5;
/** The red outline under an attack order's target (s). */
export const TARGET_MARK_LIFE = 0.6;
/** Touch: the auto-attack target ring holds this long after the last basic hit (s). */
export const AUTO_TARGET_HOLD = 1.6;

/** Chevron decal diameter (m) at age `t` (s): 3.2 m wide at the click, collapsing (ease-in) to 0.5 m; 0 when over. Pure. */
export function chevronSize(t: number): number {
  if (t < 0 || t >= CHEVRON_LIFE) return 0;
  const k = t / CHEVRON_LIFE;
  return 3.2 - 2.7 * k * k;
}

/** Target outline opacity at age `t` (s): full, then a fade over the last third; 0 when over. Pure. */
export function targetMarkAlpha(t: number): number {
  if (t < 0 || t >= TARGET_MARK_LIFE) return 0;
  const k = t / TARGET_MARK_LIFE;
  return k < 2 / 3 ? 1 : 1 - (k - 2 / 3) * 3;
}

let chevTex: THREE.Texture | null = null;

/** Four inward chevrons (tips toward the centre) with an ink outline: tinted by the decal colour. */
export function chevronTexture(): THREE.Texture {
  if (chevTex) return chevTex;
  if (typeof document === 'undefined') return (chevTex = new THREE.Texture());
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const m = s / 2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [w, col] of [
      [s * 0.11, 'rgba(20,10,16,0.85)'],
      [s * 0.055, '#ffffff'],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        // the tip at 0.2 of the radius, the arms back out at 0.38
        const tx = m + ux * s * 0.2;
        const ty = m + uy * s * 0.2;
        const bx = m + ux * s * 0.36;
        const by = m + uy * s * 0.36;
        g.moveTo(bx - uy * s * 0.1, by + ux * s * 0.1);
        g.lineTo(tx, ty);
        g.lineTo(bx + uy * s * 0.1, by - ux * s * 0.1);
      }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  chevTex = t;
  return t;
}
