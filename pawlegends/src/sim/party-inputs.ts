/**
 * Party play, the part `step` needs (MULTIPLAYER.md §1.1, §1.2). Kept apart from party.ts (which imports index.ts for
 * the replay) so index.ts can import it without a cycle.
 *
 * Same-tick order (B2, pinned by tests/unit/party-order.test.ts): slot 0's ping, slot 0's command, the forfeit block,
 * then `applyPartyInputs` (slot 1, then slot 2), then the in-sim bots.
 *
 * Sim v16 S-PvP (docs/plans/moba/V16.md §3.1.4, pinned by tests/unit/pvp-order.test.ts): slot 0's ping, command and
 * forfeit; then slot 3's ping and forfeit (`applyLeadInputs`); then the commands of slots 1..5 in slot order (slot 3's
 * at its own position); then the in-sim bots.
 */
import { Op, PVP_LEAD1, SLOTS_PER_TEAM, SLOT_COUNT, type Command, type MatchConfig } from './api';
import { applyPing } from './bots/orders';
import { encodeCommand } from './commands';
import { fnvBytes, fnvInt } from './hash';
import { createGate, gateCommand, gateForfeit } from './input';
import { rulesOf } from './rules';
import type { MatchHandle, PartyState } from './state';
import { applyOrder } from './units/hero';
import { G } from './world';

/**
 * Throws RangeError unless `humans` is a valid seat list. PvE: ascending, unique, contains 0 and lies within {0, 1, 2}.
 * PvP (sim v16): ascending, unique, within 0..5, 2 to 6 entries, containing 0 and 3 (each team's lead).
 */
export function validateHumans(humans: readonly number[], mode: MatchConfig['mode'] = 'pve'): void {
  const pvp = mode === 'pvp';
  const max = pvp ? SLOT_COUNT : SLOTS_PER_TEAM;
  if (!Array.isArray(humans) || humans.length < (pvp ? 2 : 1) || humans.length > max) throw new RangeError(pvp ? `pvp humans must list 2 to ${SLOT_COUNT} slots` : `humans must list 1 to ${SLOTS_PER_TEAM} slots`);
  if (humans[0] !== 0) throw new RangeError('humans must start with slot 0');
  for (let i = 0; i < humans.length; i++) {
    const s = humans[i];
    if (!Number.isInteger(s) || s < 0 || s >= max) throw new RangeError(pvp ? `human slot ${String(s)} is not 0 to ${SLOT_COUNT - 1}` : SLOTS_PER_TEAM === 3 ? `human slot ${String(s)} is not 0, 1 or 2` : `human slot ${String(s)} is not 0 to ${SLOTS_PER_TEAM - 1}`);
    if (i > 0 && s <= humans[i - 1]) throw new RangeError('humans must be ascending and unique');
  }
  if (pvp && !humans.includes(PVP_LEAD1)) throw new RangeError(`pvp humans must contain slot ${PVP_LEAD1} (team 1 lead)`);
}

/** One gate and one log per human slot >= 1 (slot 0 keeps the match's own gate and log). Indexed 0..5. */
export function createPartyState(config: MatchConfig): PartyState {
  const humans = config.humans ?? [0];
  validateHumans(humans, config.mode);
  const slots: number[] = [];
  // Sim v18: one entry per hero slot of the map (6, or 10 on Hearthwood).
  const gates: PartyState['gates'] = [];
  const logs: PartyState['logs'] = [];
  for (let s = 0; s < SLOT_COUNT; s++) {
    gates.push(null);
    logs.push(null);
  }
  for (let i = 1; i < humans.length; i++) {
    const s = humans[i];
    slots.push(s);
    gates[s] = createGate();
    logs[s] = [];
  }
  return { slots, gates, logs };
}

/**
 * The commands slot `s` may send: everything but pings and forfeits (those are slot 0's; v1 drops them unlogged).
 * Sim v16 PvP: team 1's lead (slot 3) keeps its pings and forfeits (`lead`).
 */
function ownCommands(list: readonly Command[] | undefined, lead = false): Command[] | undefined {
  if (!list || list.length === 0) return undefined;
  if (lead) return list as Command[];
  let clean = true;
  for (let i = 0; i < list.length && clean; i++) clean = list[i].op !== Op.Ping && list[i].op !== Op.Forfeit;
  if (clean) return list as Command[];
  const out: Command[] = [];
  for (let i = 0; i < list.length; i++) if (list[i].op !== Op.Ping && list[i].op !== Op.Forfeit) out.push(list[i]);
  return out;
}

const fold = (m: MatchHandle, tick: number, slot: number, cmd: Command): void => {
  const w = m.world;
  w.globals[G.InputHash] = fnvBytes(fnvInt(fnvInt(w.globals[G.InputHash], tick), slot), encodeCommand(cmd)) | 0;
};

/**
 * Sim v16 S-PvP step 1a: team 1's lead (slot 3) gates its commands; its ping applies (orders team 1's bots) and its
 * forfeit is decided now, right after slot 0's block; its other command waits in `m.pvp.leadCmd` for its slot position
 * in `applyPartyInputs`. The log keeps slot 0's order: ping, command, forfeit.
 */
export function applyLeadInputs(m: MatchHandle, tick: number, bySlot: readonly (readonly Command[] | undefined)[] | undefined): void {
  const party = m.party;
  const pvp = m.pvp;
  if (!party || !pvp) return;
  const gate = party.gates[PVP_LEAD1]!;
  const log = party.logs[PVP_LEAD1]!;
  const list = ownCommands(bySlot ? bySlot[PVP_LEAD1] : undefined, true);
  const cmd = gateCommand(gate, tick, list);
  const ping = gate.ping;
  if (ping && ping.op === Op.Ping) {
    log.push({ tick, cmd: ping });
    fold(m, tick, PVP_LEAD1, ping);
    applyPing(m, ping, PVP_LEAD1);
    pvp.actAt1 = tick;
  }
  if (cmd) log.push({ tick, cmd });
  pvp.leadCmd = cmd;
  if (gateForfeit(gate, tick, list, rulesOf(m).forfeitFrom)) {
    const ff: Command = { op: Op.Forfeit };
    log.push({ tick, cmd: ff });
    fold(m, tick, PVP_LEAD1, ff);
  }
}

/**
 * Step 1b (party only): the human slots >= 1 apply their commands through their own gate, in slot order. Each applied
 * command is logged in its slot's log and folded into G.InputHash with the slot (slot 0's fold is unchanged). Sim v16
 * PvP: slot 3's command was gated (and logged) by `applyLeadInputs`; it is folded and applied here, at its position.
 */
export function applyPartyInputs(m: MatchHandle, tick: number, bySlot: readonly (readonly Command[] | undefined)[] | undefined): void {
  const party = m.party;
  if (!party) return;
  const pvp = m.pvp;
  for (let i = 0; i < party.slots.length; i++) {
    const slot = party.slots[i];
    let cmd: Command | null;
    if (pvp && slot === PVP_LEAD1) {
      cmd = pvp.leadCmd;
      pvp.leadCmd = null;
      if (!cmd) continue;
      pvp.actAt1 = tick;
    } else {
      cmd = gateCommand(party.gates[slot]!, tick, ownCommands(bySlot ? bySlot[slot] : undefined));
      if (!cmd) continue;
      party.logs[slot]!.push({ tick, cmd });
    }
    fold(m, tick, slot, cmd);
    applyOrder(m, slot, cmd);
  }
}
