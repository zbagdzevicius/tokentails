/**
 * Set pieces on the HUD (iteration 3, juice lane; SETPIECES.md section 9):
 * - mini-map icons, drawn once into the map's background: a loop ring, the wall lane as a cyan arc on its side, the
 *   jump gap as a dark break with gold lips, a tunnel as a dark covered stretch with a magenta core
 * - the "Stunts" row on the results screen (clean stunts, the best combo, the nets that caught you), from the juice
 *   lane's tally (counted client-side from the race events; not a sim field, not hashed)
 */
import type { BuiltTrack } from '../track/build';
import type { ResultCtx } from './results';
import type { StuntSummary } from '../../juice/stunts';
import { t } from '../../ui/i18n';

type MapXY = (x: number, z: number) => readonly [number, number] | number[];

const PINK = '#ff3ea5';
const CYAN = '#2cf6f3';
const GOLD = '#ffd23f';
const INK = '#2a1a22';

/** A point `d` m across the road at main sample `i` on the map. */
function at(tr: BuiltTrack, i: number, d: number, xy: MapXY): [number, number] {
  const j = ((i % tr.n) + tr.n) % tr.n;
  const p = xy(tr.px[j] - tr.tz[j] * d, tr.pz[j] + tr.tx[j] * d);
  return [p[0], p[1]];
}

function stretch(g: CanvasRenderingContext2D, tr: BuiltTrack, i0: number, i1: number, d: number, xy: MapXY): void {
  const len = (i1 - i0 + tr.n) % tr.n;
  g.beginPath();
  for (let k = 0; k <= len; k += 2) {
    const [x, y] = at(tr, i0 + k, d, xy);
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

/** Draw every set piece's icon onto the mini-map background (called from `Hud.setTrack`). */
export function drawPieceIcons(g: CanvasRenderingContext2D, tr: BuiltTrack, xy: MapXY): number {
  const pieces = tr.pieces ?? [];
  g.save();
  g.lineCap = g.lineJoin = 'round';
  for (const pc of pieces) {
    const mid = pc.i0 + Math.round(((pc.i1 - pc.i0 + tr.n) % tr.n) / 2);
    switch (pc.kind) {
      case 'tunnel':
        g.strokeStyle = INK;
        g.lineWidth = 14;
        stretch(g, tr, pc.i0, pc.i1, 0, xy);
        g.strokeStyle = PINK;
        g.lineWidth = 4;
        stretch(g, tr, pc.i0, pc.i1, 0, xy);
        break;
      case 'wall': {
        const side = pc.side === 0 ? [-1, 1] : [pc.side];
        for (const s of side) {
          const off = s * (tr.halfW[mid] + 6);
          g.strokeStyle = INK;
          g.lineWidth = 7;
          stretch(g, tr, pc.i0, pc.i1, off, xy);
          g.strokeStyle = CYAN;
          g.lineWidth = 4;
          stretch(g, tr, pc.i0, pc.i1, off, xy);
        }
        break;
      }
      case 'jump': {
        if (pc.gap <= 0) {
          const [x, y] = at(tr, pc.i0, 0, xy);
          g.fillStyle = GOLD;
          g.beginPath();
          g.arc(x, y, 4, 0, Math.PI * 2);
          g.fill();
          break;
        }
        g.strokeStyle = INK;
        g.lineWidth = 11;
        stretch(g, tr, pc.i0, pc.i1, 0, xy);
        for (const i of [pc.i0, pc.i1]) {
          const w = tr.halfW[i] + 2;
          const [ax, ay] = at(tr, i, -w, xy);
          const [bx, by] = at(tr, i, w, xy);
          g.strokeStyle = GOLD;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
        }
        break;
      }
      case 'loop': {
        const [x, y] = at(tr, mid, 0, xy);
        g.lineWidth = 6;
        g.strokeStyle = INK;
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = 3;
        g.strokeStyle = PINK;
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.stroke();
        break;
      }
    }
  }
  g.restore();
  return pieces.length;
}

/**
 * The "Stunts" results row: "Stunts 4 · best combo ×3", plus a friendly count of net catches. Null when the race had
 * no set piece to show (battle, a track without pieces, nothing ridden).
 */
export function stuntSection(s: Readonly<StuntSummary> | null, ctx: ResultCtx): HTMLElement | null {
  if (!s || ctx.mode === 'battle') return null;
  if (s.clean === 0 && s.nets === 0 && s.jumps === 0) return null;
  const el = document.createElement('div');
  el.className = 'fm-line fm-stunts';
  el.dataset.stunts = String(s.clean);
  // iteration 4 merge: the progression lane's "✨ Style" row already lists loops, landings, wall rides and the combo
  // from the same race, so this row then keeps only what Style does not say (the net catches), or hides
  const st = ctx.result.stats?.[ctx.result.player.kart];
  const styled = !!st && (st.loops > 0 || st.cleanLandings > 0 || st.walls > 0 || st.tricks > 0 || st.miniTurbos[2] > 0 || st.bestCombo >= 2);
  if (styled) {
    if (!s.nets) return null;
    el.textContent = `🕸️ ${t('caught by the net: {n}', { n: s.nets })}`;
    return el;
  }
  const parts = [t('Stunts: {n}', { n: s.clean })];
  const bits: string[] = [];
  if (s.loops) bits.push(`🌀×${s.loops}`);
  if (s.walls) bits.push(`🧱×${s.walls}`);
  if (s.landings) bits.push(`🛬×${s.landings}`);
  if (bits.length) parts.push(bits.join(' '));
  if (s.bestCombo >= 2) parts.push(t('best combo ×{n}', { n: s.bestCombo }));
  if (s.nets) parts.push(t('caught by the net: {n}', { n: s.nets }));
  el.textContent = `✨ ${parts.join(' · ')}`;
  return el;
}
