/**
 * Party play, the part `step` needs (MULTIPLAYER.md §1.1, §1.2). Kept apart from party.ts (which imports index.ts for
 * the replay) so index.ts can import it without a cycle.
 *
 * Same-tick order (B2, pinned by tests/unit/party-order.test.ts): slot 0's ping, slot 0's command, the forfeit block,
 * then `applyPartyInputs` (slot 1, then slot 2), then the in-sim bots.
 */
import { Op, SLOTS_PER_TEAM, type Command, type MatchConfig } from './api';
import { encodeCommand } from './commands';
import { fnvBytes, fnvInt } from './hash';
import { createGate, gateCommand } from './input';
import type { MatchHandle, PartyState } from './state';
import { applyOrder } from './units/hero';
import { G } from './world';

/** Throws RangeError unless `humans` is ascending, unique, contains 0 and lies within {0, 1, 2}. */
export function validateHumans(humans: readonly number[]): void {
  if (!Array.isArray(humans) || humans.length < 1 || humans.length > SLOTS_PER_TEAM) throw new RangeError('humans must list 1 to 3 slots');
  if (humans[0] !== 0) throw new RangeError('humans must start with slot 0');
  for (let i = 0; i < humans.length; i++) {
    const s = humans[i];
    if (!Number.isInteger(s) || s < 0 || s >= SLOTS_PER_TEAM) throw new RangeError(`human slot ${String(s)} is not 0, 1 or 2`);
    if (i > 0 && s <= humans[i - 1]) throw new RangeError('humans must be ascending and unique');
  }
}

/** One gate and one log per human slot >= 1 (slot 0 keeps the match's own gate and log). */
export function createPartyState(config: MatchConfig): PartyState {
  const humans = config.humans ?? [0];
  validateHumans(humans);
  const slots: number[] = [];
  const gates: PartyState['gates'] = [null, null, null];
  const logs: PartyState['logs'] = [null, null, null];
  for (let i = 1; i < humans.length; i++) {
    const s = humans[i];
    slots.push(s);
    gates[s] = createGate();
    logs[s] = [];
  }
  return { slots, gates, logs };
}

/** The commands slot `s` may send: everything but pings and forfeits (those are slot 0's; v1 drops them unlogged). */
function ownCommands(list: readonly Command[] | undefined): Command[] | undefined {
  if (!list || list.length === 0) return undefined;
  let clean = true;
  for (let i = 0; i < list.length && clean; i++) clean = list[i].op !== Op.Ping && list[i].op !== Op.Forfeit;
  if (clean) return list as Command[];
  const out: Command[] = [];
  for (let i = 0; i < list.length; i++) if (list[i].op !== Op.Ping && list[i].op !== Op.Forfeit) out.push(list[i]);
  return out;
}

/**
 * Step 1b (party only): the human slots >= 1 apply their commands through their own gate, in slot order. Each applied
 * command is logged in its slot's log and folded into G.InputHash with the slot (slot 0's fold is unchanged).
 */
export function applyPartyInputs(m: MatchHandle, tick: number, bySlot: readonly (readonly Command[] | undefined)[] | undefined): void {
  const party = m.party;
  if (!party) return;
  const w = m.world;
  for (let i = 0; i < party.slots.length; i++) {
    const slot = party.slots[i];
    const cmd = gateCommand(party.gates[slot]!, tick, ownCommands(bySlot ? bySlot[slot] : undefined));
    if (!cmd) continue;
    party.logs[slot]!.push({ tick, cmd });
    w.globals[G.InputHash] = fnvBytes(fnvInt(fnvInt(w.globals[G.InputHash], tick), slot), encodeCommand(cmd)) | 0;
    applyOrder(m, slot, cmd);
  }
}
