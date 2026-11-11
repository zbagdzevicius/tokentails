/*
 * The referee's map-hack signal, "acts on hidden" (docs/plans/moba/SOCIAL-RANKED.md §9.2), PvP rooms only. Counts, per
 * human slot, the Attack and Cast commands (`acts`), those aimed at an enemy hero the slot's team has not seen for at
 * least 1 s (`hid`), and those sent while such a hidden enemy hero stood within 9 m (`opp`, the honest bush-guess
 * denominator). Reads the sim through its optional read-only `heroSight` export (absent on frozen bundles: no signal,
 * reports still work). Pilot (bot) commands are never counted. Never changes the sim: it only reads after a step.
 *
 * Relative imports only: the referee worker loads its files by path.
 */
import type { PawlegendsCommand } from '../../vendor/pawlegends-sim';

/** Op codes of `src/sim/api.ts` (Attack carries `id`; Cast carries `x`, `y` in mm and `id`). */
export const OP_ATTACK = 3;
export const OP_CAST = 4;
/** `heroSight` writes x (mm), y (mm), alive (0/1), seenBits (bit t: team t sees it) per hero slot. */
export const SIGHT_STRIDE = 4;
export const INTEL_HIDDEN_TICKS = 30;
export const INTEL_NEAR_MM = 9000;
export const INTEL_AIM_MM = 1500;

export interface SlotIntel {
    slot: number;
    acts: number;
    hid: number;
    opp: number;
    hero?: string;
}

export class IntelCounter {
    private readonly sight: Int32Array;
    /** lastSeen[team * slots + hero]: the last tick team saw the hero (-∞ before the first sight read). */
    private readonly lastSeen: Float64Array;
    private readonly acts: number[];
    private readonly hid: number[];
    private readonly opp: number[];
    private primed = false;

    constructor(
        private readonly slots: number,
        private readonly teamSize: number,
        private readonly humans: readonly number[],
        private readonly read: (out: Int32Array) => void,
        private readonly picks: readonly string[] = []
    ) {
        this.sight = new Int32Array(slots * SIGHT_STRIDE);
        this.lastSeen = new Float64Array(2 * slots).fill(-Infinity);
        this.acts = new Array(slots).fill(0);
        this.hid = new Array(slots).fill(0);
        this.opp = new Array(slots).fill(0);
    }

    private teamOf(slot: number): number {
        return slot >= this.teamSize ? 1 : 0;
    }

    /** Enemy heroes of `team` hidden from it for at least 1 s at `tick` (from the last sight read). */
    private hiddenFrom(team: number, tick: number): number[] {
        const out: number[] = [];
        for (let h = 0; h < this.slots; h++) {
            if (this.teamOf(h) === team) continue;
            const o = h * SIGHT_STRIDE;
            if (!this.sight[o + 2]) continue;
            if ((this.sight[o + 3] >>> team) & 1) continue;
            if (tick - this.lastSeen[team * this.slots + h] < INTEL_HIDDEN_TICKS) continue;
            out.push(h);
        }
        return out;
    }

    /**
     * Before a step: the decoded commands of this sub-tick, per slot. `pilotMask` bit s = slot s flown by a bot (its
     * commands are the pilot's, never counted).
     */
    beforeStep(tick: number, per: readonly (readonly PawlegendsCommand[])[], pilotMask: number): void {
        if (!this.primed) return;
        for (const s of this.humans) {
            if (s >= this.slots || ((pilotMask >>> s) & 1) === 1) continue;
            const cmds = per[s];
            if (!cmds?.length) continue;
            const team = this.teamOf(s);
            let hidden: number[] | null = null;
            for (const c of cmds) {
                if (c.op !== OP_ATTACK && c.op !== OP_CAST) continue;
                this.acts[s]++;
                hidden ??= this.hiddenFrom(team, tick);
                if (!hidden.length) continue;
                const me = s * SIGHT_STRIDE;
                const mx = this.sight[me];
                const my = this.sight[me + 1];
                let aimed = false;
                let near = false;
                for (const h of hidden) {
                    const o = h * SIGHT_STRIDE;
                    const hx = this.sight[o];
                    const hy = this.sight[o + 1];
                    if (Math.hypot(hx - mx, hy - my) <= INTEL_NEAR_MM) near = true;
                    if (c.op === OP_ATTACK && c.id === h) aimed = true;
                    else if (c.op === OP_CAST) {
                        if (c.id === h) aimed = true;
                        else if (
                            typeof c.x === 'number' &&
                            typeof c.y === 'number' &&
                            Math.hypot(c.x - hx, c.y - hy) <= INTEL_AIM_MM
                        )
                            aimed = true;
                    }
                }
                if (near) this.opp[s]++;
                if (aimed) this.hid[s]++;
            }
        }
    }

    /** After a step: read the sight and stamp who sees whom. */
    afterStep(tick: number): void {
        this.read(this.sight);
        this.primed = true;
        for (let h = 0; h < this.slots; h++) {
            const bits = this.sight[h * SIGHT_STRIDE + 3];
            for (let t = 0; t < 2; t++) if ((bits >>> t) & 1) this.lastSeen[t * this.slots + h] = tick;
        }
    }

    result(): SlotIntel[] {
        return this.humans
            .filter(s => s < this.slots)
            .map(s => ({
                slot: s,
                acts: this.acts[s],
                hid: this.hid[s],
                opp: this.opp[s],
                ...(this.picks[s] ? { hero: this.picks[s] } : {}),
            }));
    }
}
