/**
 * World dynamics (FULL build seam, FULL-PLAN.md): the moving and changing parts of the room that are not actors
 * (Roomba with its blinking LED, puddles and the Roomba spreading them, tablecloth slide and cable tug, stack
 * pieces, the toppling tree, theme decorations that animate, the sponsor label). Owned by package W1-RENDER-WORLD;
 * created and driven by `Renderer.ts` (package W1-RENDER-ACTORS), which never reaches inside.
 *
 * Contract (frozen):
 *   const dyn = createWorldDynamics(play, mat);  scene.add(dyn.group);
 *   every frame: dyn.update(state, alpha, eventsOfThisFrame);
 *   clip camera / FX: dyn.roombaPosition(v) -> world position of the Roomba (null when the room has none);
 *   on room change / dispose: dyn.dispose().
 * The renderer never writes SimState; neither does this module.
 *
 * Implementation: world/dynamics.ts (Roomba, puddles and wet tracks, cables, ornament pops and splashes, TV / fire /
 * REC glow, string lights, snow, confetti, disco ball). Stack pieces, the cloth slide and drop, the tree sway and
 * topple, the open box and the sponsor label are prop poses and live in props-view.ts.
 */
import type { Group, Material, Vector3 } from 'three';
import type { PlayableRoom, SimEvent, SimState } from '../types';
import { createWorldDynamicsImpl } from './world/dynamics';

export interface WorldDynamics {
  readonly group: Group;
  update(s: SimState, alpha: number, events: readonly SimEvent[]): void;
  roombaPosition(out: Vector3): Vector3 | null;
  dispose(): void;
}

export function createWorldDynamics(play: PlayableRoom, mat: Material): WorldDynamics {
  return createWorldDynamicsImpl(play, mat);
}
