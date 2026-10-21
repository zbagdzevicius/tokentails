/**
 * Command pings (sim v10, GAPS B1): what a ping from slot 0 does to its allied bots (slots 1 and 2), and the lane
 * swap. The brain reads the orders through `orderOf` (bots/brain.ts); enemy bots never see a ping or an order.
 *
 * A ping gives each allied bot alive an order with a TTL (PING in data/pings.ts). A bot under PING.refuseHpBp or
 * napping refuses and barks 'heal' ("Healing first!"); Fall back is never refused. A new ping replaces the order.
 */
import { BOT_AI } from '../../data/bots';
import { CORE, MAP, mirrorX } from '../../data/map';
import { LANE_SWAP, PING, PING_KIND, PING_KINDS, type BarkKind } from '../../data/pings';
import { HUMAN_SLOT, NO_TARGET, SLOTS_PER_TEAM, type Command, type SimEvent } from '../api';
import { dist2 } from '../fixed';
import { nearLane } from '../map/grid';
import type { MatchHandle } from '../state';
import { G, RANGE, type World } from '../world';
import { hpBp, seenEnemy } from './sense';

type PingCommand = Extract<Command, { op: 9 }>;

const ttlOf = (kind: number): number => (kind === PING_KIND.Focus ? PING.focusTicks : kind === PING_KIND.FallBack ? PING.fallBackTicks : PING.orderTicks);

/** Apply slot 0's ping (already gated and quantised): orders, then the `ping` event and one `bark` per answering bot. */
export function applyPing(m: MatchHandle, cmd: PingCommand): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const team = w.team[HUMAN_SLOT];
  const kind = cmd.kind;
  // Focus needs an enemy hero the team can see now.
  const target = kind === PING_KIND.Focus && cmd.id !== NO_TARGET && cmd.id < RANGE.minions && seenEnemy(w, team, cmd.id) ? cmd.id : -1;
  const barks: SimEvent[] = [];
  let took = 0;
  if (kind !== PING_KIND.Focus || target >= 0) {
    for (let id = RANGE.heroes; id < SLOTS_PER_TEAM; id++) {
      if (id === HUMAN_SLOT || w.team[id] !== team || w.alive[id] === 0) continue;
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
  m.events.push({ type: 'ping', tick, kind: PING_KINDS[kind], x: cmd.x, y: cmd.y, target, took });
  for (let i = 0; i < barks.length; i++) m.events.push(barks[i]);
}

/** The order allied bot `id` follows now (PING_KIND), or −1. Clears an expired or pointless order. */
export function orderOf(w: World, id: number): number {
  if (id === HUMAN_SLOT || w.botOrd[id] === 0) return -1;
  const kind = w.botOrd[id] - 1;
  const t = w.botOrdId[id];
  const over =
    w.globals[G.Tick] > w.botOrdT[id] ||
    (kind === PING_KIND.Focus && (t < 0 || w.alive[t] === 0)) ||
    (kind === PING_KIND.Group && w.alive[HUMAN_SLOT] === 0);
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
  if (dist2(x, y, CORE.x, CORE.y) <= r2 || dist2(x, y, mirrorX(CORE.x), CORE.y) <= r2) return -1;
  return y >= MAP.height >> 1 ? 0 : 1;
}

/**
 * Lane swap (GAPS B1), every tick: once the human has stood LANE_SWAP.hold ticks in a row in Puddle Lane (from
 * LANE_SWAP.from on), ally slot 1 takes Sunny Lane; the same hold in Sunny swaps it back.
 */
export function stepLaneSwap(w: World): void {
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

/** The lane role of hero `id` (0 Sunny, 1 Puddle, 2 roams), after the lane swap of the human's team. */
export function laneRole(w: World, id: number): number {
  const role = id % SLOTS_PER_TEAM;
  if (w.globals[G.LaneSwap] === 1 && w.team[id] === w.team[HUMAN_SLOT] && role < 2) return 1 - role;
  return role;
}
