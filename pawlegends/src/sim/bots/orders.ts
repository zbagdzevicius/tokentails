/**
 * Command pings (sim v10, GAPS B1): what a ping from slot 0 does to its allied bots (slots 1 and 2), and the lane
 * swap. The brain reads the orders through `orderOf` (bots/brain.ts); enemy bots never see a ping or an order.
 *
 * A ping gives each allied bot alive an order with a TTL (PING in data/pings.ts). A bot under PING.refuseHpBp or
 * napping refuses and barks 'heal' ("Healing first!"); Fall back is never refused. A new ping replaces the order.
 */
import { BOT_AI } from '../../data/bots';
import { CORE, MAP, mirrorX, mirrorY } from '../../data/map';
import { LANE_SWAP, PING, PING_KIND, PING_KINDS, type BarkKind } from '../../data/pings';
import { HUMAN_SLOT, NO_TARGET, SLOTS_PER_TEAM, type Command, type SimEvent, type Team } from '../api';
import { dist2 } from '../fixed';
import { nearLane, nearestLane } from '../map/grid';
import type { MatchHandle } from '../state';
import { G, MG, RANGE, type World } from '../world';
import { hpBp, seenEnemy } from './sense';
import { isHumanSlot, leadOf } from '../humans';

type PingCommand = Extract<Command, { op: 9 }>;

const ttlOf = (kind: number): number => (kind === PING_KIND.Focus ? PING.focusTicks : kind === PING_KIND.FallBack ? PING.fallBackTicks : PING.orderTicks);

/**
 * Apply a lead human's ping (already gated and quantised): orders, then the `ping` event and one `bark` per answering
 * bot. Slot 0's in every match; sim v16 PvP: slot 3's too, ordering team 1's bots (`from`).
 */
export function applyPing(m: MatchHandle, cmd: PingCommand, from = HUMAN_SLOT): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const team = w.team[from];
  const first = team * SLOTS_PER_TEAM;
  const kind = cmd.kind;
  // Focus needs an enemy hero the team can see now.
  const target = kind === PING_KIND.Focus && cmd.id !== NO_TARGET && cmd.id < RANGE.minions && seenEnemy(w, team, cmd.id) ? cmd.id : -1;
  const barks: SimEvent[] = [];
  let took = 0;
  if (kind !== PING_KIND.Focus || target >= 0) {
    for (let id = first; id < first + SLOTS_PER_TEAM; id++) {
      // Party play (B1): a ping never orders a human's hero (slots 1 and 2 in a party), even while a pilot plays it.
      if (isHumanSlot(w, id) || w.team[id] !== team || w.alive[id] === 0) continue;
      let what: BarkKind = 'ok';
      if (kind !== PING_KIND.FallBack && (hpBp(w, id) < PING.refuseHpBp || w.napT[id] > 0)) what = 'heal';
      else {
        w.botOrd[id] = kind + 1;
        w.botOrdT[id] = tick + ttlOf(kind);
        w.botOrdX[id] = cmd.x;
        w.botOrdY[id] = cmd.y;
        w.botOrdId[id] = target;
        // Forget the last issued order, so the bot re-issues its next move at once.
        w.botOp[id] = 0;
        took++;
      }
      barks.push({ type: 'bark', tick, id, what });
    }
  }
  // Sim v16 PvP: the event names its team (snapshots show it to that team only); PvE events are unchanged.
  if (w.pvp === 1) m.events.push({ type: 'ping', tick, kind: PING_KINDS[kind], x: cmd.x, y: cmd.y, target, took, team: team as Team });
  else m.events.push({ type: 'ping', tick, kind: PING_KINDS[kind], x: cmd.x, y: cmd.y, target, took });
  for (let i = 0; i < barks.length; i++) m.events.push(barks[i]);
}

/** The order allied bot `id` follows now (PING_KIND), or −1. Clears an expired or pointless order. */
export function orderOf(w: World, id: number): number {
  // Party play (B1): no order for a human's slot, so nothing here clears hashed botOrd* state of a piloted hero.
  if (isHumanSlot(w, id) || w.botOrd[id] === 0) return -1;
  const kind = w.botOrd[id] - 1;
  const t = w.botOrdId[id];
  const over =
    w.globals[G.Tick] > w.botOrdT[id] ||
    (kind === PING_KIND.Focus && (t < 0 || w.alive[t] === 0)) ||
    (kind === PING_KIND.Group && w.alive[leadOf(w, w.team[id])] === 0);
  if (over) {
    w.botOrd[id] = 0;
    w.botOrdId[id] = -1;
    return -1;
  }
  return kind;
}

/** The focused enemy hero of bot `id`, or −1. */
export const focusOf = (w: World, id: number): number => (orderOf(w, id) === PING_KIND.Focus ? w.botOrdId[id] : -1);

/**
 * The human's lane by where it stands: 0 Sunny, 1 Puddle, −1 off the lanes, in a base or dead. Both lanes start at
 * the core, so the fountain and the spawns read as "near a lane" and only the midline would split them: within
 * LANE_SWAP.baseRange of either core no lane counts (a nap or a respawn never flips the swap).
 */
function humanLaneNow(w: World): number {
  const h = HUMAN_SLOT;
  const x = w.x[h];
  const y = w.y[h];
  if (w.alive[h] === 0 || !nearLane(x, y, BOT_AI.leashLane)) return -1;
  const r2 = LANE_SWAP.baseRange * LANE_SWAP.baseRange;
  if (dist2(x, y, CORE.x, CORE.y) <= r2 || dist2(x, y, mirrorX(CORE.x), mirrorY(CORE.y)) <= r2) return -1;
  // Sim v19: on a point map, the nearest of its lanes.
  if (MAP.point === 1) return nearestLane(x, y);
  return y >= MAP.height >> 1 ? 0 : 1;
}

/**
 * Lane swap (GAPS B1), every tick: once the human has stood LANE_SWAP.hold ticks in a row in Puddle Lane (from
 * LANE_SWAP.from on), ally slot 1 takes Sunny Lane; the same hold in Sunny swaps it back.
 */
export function stepLaneSwap(w: World): void {
  // Sim v16 PvP: no lane swap (it follows team 0's human only, so it would favour one side).
  if (w.pvp === 1) return;
  if (w.mg.length > 0) {
    stepRoleSwap(w);
    return;
  }
  const lane = humanLaneNow(w);
  const cur = w.globals[G.LaneSwap];
  const wants = lane < 0 ? cur : lane;
  if (wants === cur) {
    w.globals[G.LaneSwapT] = 0;
    return;
  }
  const t = w.globals[G.LaneSwapT] + 1;
  if (t >= LANE_SWAP.hold && w.globals[G.Tick] >= LANE_SWAP.from) {
    w.globals[G.LaneSwap] = wants;
    w.globals[G.LaneSwapT] = 0;
  } else w.globals[G.LaneSwapT] = t;
}

/**
 * Sim v19 (Hearthwood, MAP-5V5.md §4.1): the lane swap over five roles. Once the human has stood LANE_SWAP.hold ticks
 * in a row in another role's lane (from LANE_SWAP.from on), it takes that lane's role and the allied bot that had it
 * takes the human's old role. G.LaneSwap holds the lane being held (+1), G.LaneSwapT the ticks.
 */
function stepRoleSwap(w: World): void {
  const lane = humanLaneNow(w);
  const mine = w.mg[MG.Role + HUMAN_SLOT];
  if (lane < 0 || lane === mine || w.globals[G.Tick] < LANE_SWAP.from) {
    w.globals[G.LaneSwapT] = 0;
    return;
  }
  if (w.globals[G.LaneSwap] !== lane + 1) {
    w.globals[G.LaneSwap] = lane + 1;
    w.globals[G.LaneSwapT] = 0;
  }
  if (++w.globals[G.LaneSwapT] < LANE_SWAP.hold) return;
  w.globals[G.LaneSwapT] = 0;
  const team = w.team[HUMAN_SLOT];
  const first = team * SLOTS_PER_TEAM;
  for (let id = first; id < first + SLOTS_PER_TEAM; id++) {
    if (id === HUMAN_SLOT || isHumanSlot(w, id) || w.mg[MG.Role + id] !== lane) continue;
    w.mg[MG.Role + id] = mine;
    w.mg[MG.Role + HUMAN_SLOT] = lane;
    return;
  }
}

/** The lane role of hero `id` (0 Sunny, 1 Puddle, 2 roams), after the lane swap of the human's team. Sim v19
 *  (Hearthwood): its ROLE (bots/roles.ts; lane roles are the lane index). */
export function laneRole(w: World, id: number): number {
  if (w.mg.length > 0) return w.mg[MG.Role + id];
  const role = id % SLOTS_PER_TEAM;
  if (w.globals[G.LaneSwap] === 1 && w.team[id] === w.team[HUMAN_SLOT] && role < 2) return 1 - role;
  return role;
}
