// Tail vault: press E (tap) in the approach window and Mochi's tail stretches into a springy pole at the paw pad,
// vaulting a chasm too wide to jump. A dotted golden arc shows the route; a missed vault simply falls (a heart,
// placed past the gap by core), never a soft-lock. SETPIECES lane.
import * as THREE from 'three';
import { events } from '../core/events';
import { burst } from '../core/fx';
import { callout, clearPrompt, prompt, react } from '../core/hud';
import { beginArc, onAbility, P } from '../core/player';
import { setPieceTypes } from '../core/registry';
import { addPoints } from '../core/score';
import type { SetPieceType } from '../core/types';
import { GEO, MAT, mesh, num } from './kit';
import { vaultArc, vaultYAt } from './layout';

const tmp = new THREE.Vector3();
const DOTS = 15;

/** spec.s = window start. params gap (u from s to the chasm), len (chasm length) */
const vault: SetPieceType = {
  id: 'vault',
  checkpoint: true,
  create(ctx) {
    const { s } = ctx.spec;
    const gapS = s + num(ctx, 'gap', 30);
    const len = num(ctx, 'len', 24);
    const arc = vaultArc(gapS, len);
    const w = ctx.track.widthAt(arc.plant);

    // the paw pad where the tail plants, and the landing pad
    const pad = mesh(ctx, GEO.disc(), MAT.pad(), arc.plant, 0, 0.06, false, false);
    pad.scale.setScalar(1.6);
    pad.renderOrder = 2;
    const land = mesh(ctx, GEO.disc(), MAT.pad(), arc.land + 1, 0, 0.06, false, false);
    land.scale.setScalar(1.3);
    land.renderOrder = 2;
    // edge stakes on both rims
    for (const side of [-1, 1]) {
      mesh(ctx, GEO.stakeStriped(), MAT.vc(), gapS - 0.6, side * (w / 2 - 0.2), 0, true).scale.set(1.3, 1.4, 1.3);
      mesh(ctx, GEO.stakeStriped(), MAT.vc(), gapS + len + 0.6, side * (ctx.track.widthAt(gapS + len + 1) / 2 - 0.2), 0, true).scale.set(1.3, 1.4, 1.3);
    }
    // the dotted route
    const dots: THREE.Mesh[] = [];
    for (let i = 0; i < DOTS; i++) {
      const ss = arc.plant + ((i + 0.5) / DOTS) * (arc.land - arc.plant);
      const d = mesh(ctx, GEO.dot(), MAT.dots(), ss, 0, vaultYAt(gapS, len, ss) + 0.5, true, false);
      d.scale.setScalar(1.3);
      dots.push(d);
    }

    let armed = false;
    let used = false;
    let done = false;
    const launch = () => {
      used = true;
      armed = false;
      clearPrompt();
      beginArc(Math.max(4, arc.land - P.s), arc.height, 'vault');
      events.emit('setPiece', { id: 'vault', phase: 'start' });
      tmp.copy(P.world.pos);
      burst(tmp, 8, 0xe3cfa4, 4, 0.45, 0.2, 10, 0.8);
      react('wow');
    };
    const off = onAbility(() => {
      if (used || P.mode !== 'run' || P.s < s || P.s > gapS + 1.5) return false;
      if (P.s >= arc.plant) launch();
      else if (!armed) {
        armed = true;
        clearPrompt();
        callout('TAIL READY!', 'info');
      }
      return true;
    });
    return {
      end: arc.land + 6,
      update(_dt, t) {
        if (!used && P.mode === 'run') {
          if (armed && P.s >= arc.plant) launch();
          else if (!armed && P.s >= s && P.s < gapS) prompt('ability', 'TAIL VAULT!', 0.2);
        }
        if (used && !done && P.s >= arc.land - 0.5 && P.mode === 'run') {
          done = true;
          addPoints(250);
          callout('PURRFECT!');
          events.emit('setPiece', { id: 'vault', phase: 'end' });
        }
        // dots: a travelling shimmer; armed = brighter and faster; gone once used
        for (let i = 0; i < dots.length; i++) {
          const d = dots[i];
          d.visible = !used;
          if (!used) d.scale.setScalar(1 + 0.6 * Math.max(0, Math.sin(t * (armed ? 12 : 6) - i * 0.6)));
        }
        pad.scale.setScalar(1.6 + Math.sin(t * 6) * 0.12 + (armed ? 0.4 : 0));
      },
      onRespawn() {
        used = armed = done = false;
      },
      dispose: off,
    };
  },
};

export function registerVault(): void {
  setPieceTypes.add(vault);
}
