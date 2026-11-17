/**
 * Hidden in a bush (or stealthed): the view dims a little so the player knows the enemy cannot see them (founder,
 * 2026-11-17). Render / UI only: one CSS layer under the HUD (`.pl-hidedim`, first child of the match UI), an
 * opacity fade of 150 ms, hidden (no paint) while off. No text, no icon.
 *
 * Hidden mirrors the sim's rule (sim/map/brush.ts hiddenFrom) on what this client sees: in a bush unless an enemy unit
 * is within BRUSH_REVEAL_MM (a minion: MINION_BRUSH_REVEAL_MM) or in the same bush; stealthed unless an enemy unit is
 * within EFFECTS.stealthReveal; never while revealed (`Marked`) or down.
 */
import './inworld.css';
import { EFFECTS } from '../../data/effects';
import { BRUSH_REVEAL_MM, MINION_BRUSH_REVEAL_MM } from '../../data/map';
import { BuffFlag } from '../../sim/api';
import { bushAt } from '../../sim/map/brush';

interface Unit {
  kind: string;
  team: number;
  state: string;
  buffs: number;
  x: number;
  y: number;
  fx?: number;
  fy?: number;
}

const posX = (u: Unit): number => u.fx ?? u.x;
const posY = (u: Unit): number => u.fy ?? u.y;

/** Is my hero hidden from the enemy team now (as far as this client sees)? Pure. */
export function hiddenFromEnemies(me: Unit | null | undefined, units: Iterable<Unit>, myTeam: number): boolean {
  if (!me || me.state === 'dead' || me.kind !== 'hero') return false;
  if (me.buffs & BuffFlag.Marked) return false;
  const inBrush = (me.buffs & BuffFlag.InBrush) !== 0;
  const stealthed = (me.buffs & BuffFlag.Stealth) !== 0;
  if (!inBrush && !stealthed) return false;
  const mx = posX(me);
  const my = posY(me);
  const bush = inBrush ? bushAt(Math.round(mx), Math.round(my)) : -1;
  const rb = BRUSH_REVEAL_MM * BRUSH_REVEAL_MM;
  const rm = MINION_BRUSH_REVEAL_MM * MINION_BRUSH_REVEAL_MM;
  const rs = EFFECTS.stealthReveal * EFFECTS.stealthReveal;
  let brushSeen = !inBrush;
  let stealthSeen = !stealthed;
  const foe = 1 - myTeam;
  for (const e of units) {
    if (brushSeen && stealthSeen) break;
    if (e.team !== foe || e.state === 'dead' || e.kind === 'fountain') continue;
    const dx = posX(e) - mx;
    const dy = posY(e) - my;
    const d2 = dx * dx + dy * dy;
    if (!brushSeen && (d2 <= (e.kind === 'minion' ? rm : rb) || (bush >= 0 && (e.buffs & BuffFlag.InBrush) !== 0 && bushAt(Math.round(posX(e)), Math.round(posY(e))) === bush)))
      brushSeen = true;
    if (!stealthSeen && d2 <= rs) stealthSeen = true;
  }
  return !(brushSeen && stealthSeen);
}

export class HideDim {
  readonly el: HTMLDivElement | null;
  /** The state last written (e2e and tests). */
  on = false;
  /** e2e only: forces the state (null = the real one). */
  force: boolean | null = null;

  constructor(parent: HTMLElement | null) {
    if (!parent || typeof document === 'undefined') {
      this.el = null;
      return;
    }
    const el = document.createElement('div');
    el.className = 'pl-hidedim';
    el.setAttribute('aria-hidden', 'true');
    el.dataset.testid = 'hide-dim';
    // under every HUD piece: the first child of the match UI
    parent.insertBefore(el, parent.firstChild);
    this.el = el;
  }

  update(hidden: boolean): void {
    const on = this.force ?? hidden;
    if (on === this.on) return;
    this.on = on;
    if (this.el) this.el.dataset.on = on ? '1' : '';
  }

  dispose(): void {
    this.el?.remove();
  }
}
