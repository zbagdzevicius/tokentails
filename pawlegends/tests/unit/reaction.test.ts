/**
 * Sim v17 reaction-window guard (docs/plans/moba/V17.md §3.2, RESEARCH §C6): every hero ability that applies hard CC
 * (stun, fear, charm, root, freeze, lure, or a knockback / push / pull) winds up at least 9 ticks (300 ms), at least
 * 12 ticks (400 ms) when it reaches 9 m or more, and a hard-CC projectile or dash needs at least 350 ms to cover its
 * full range. Checked for every hero, every slot and every talent combination at level 10. The only way out is the
 * explicit EXEMPT list (each with its reason): a new hard-CC ability that is neither fast-safe nor classified fails.
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../src/data/heroes';
import { TICK_HZ } from '../../src/data/timeline';
import { heroSlotAim } from '../../src/sim/heroes/kit';
import { kitNumbers, type Nums } from '../../src/sim/heroes/talents';

/** Ability numbers that make it hard CC. */
const CC_KEYS = ['stun', 'fear', 'charm', 'root', 'freeze', 'lure', 'knockback', 'push', 'pull'] as const;
const SLOTS = ['q', 'w', 'e', 'r'] as const;

/** Minimum windups (ticks) and travel (ms) of the rule. */
const MIN_WINDUP = 9;
const MIN_WINDUP_FAR = 12;
const FAR_MM = 9000;
const MIN_TRAVEL_MS = 350;

/** `hero.slot` (slot q/w/e/r or `passive`) → why it is exempt. */
const EXEMPT: Readonly<Record<string, string>> = Object.freeze({
  'clem.q': 'melee combo finisher at 2.4 m: the knockback (or the Pounce Finish stun) lands only on the 3rd strike',
  'sage.w': 'a placed, hidden trap that arms after 15 ticks: walking around it is the counter-play',
  'aviete.passive': 'Live Wire charge: from v17 it needs a 0.5 s W fill or a brush and then a landed hit (§3.7)',
  'duchess.passive': 'Snub: needs three landed stacks; dodging her slow Q (833 ms) is the read',
  'howler.e': 'Talk Back is reactive: only attackers within 4.5 m who hit him are feared',
  'meatball.q': 'peel knockback without a stun (Bowling Roll)',
  'meatball.e': 'peel knockback without a stun (Big Brother)',
  'meatball.r': 'peel bumps without a stun (Unstoppable Chonk)',
  'frankie.q': 'peel knockback without a stun (Weenie Roll)',
  'domino.e': 'self-peel push without a stun (Shake It Off)',
});

/** Abilities whose kit delays the CC itself by `a.windup` after an instant cast (Rocket's toy sits there first). */
const IN_KIT_DELAY: ReadonlySet<string> = new Set(['rocket.e']);

interface Row {
  key: string;
  windup: number;
  reach: number;
  travelMs: number | null;
}

/** Every hard-CC ability of every hero in every talent combination (level 10). */
function rows(): Row[] {
  const out: Row[] = [];
  const combos: number[][] = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c of [-1, 0, 1]) combos.push([a, b, c]);
  for (let h = 0; h < HERO_IDS.length; h++) {
    for (const choices of combos) {
      const nums = kitNumbers(h, 10, choices);
      for (let s = 0; s < 4; s++) {
        const a = nums[SLOTS[s]] as Nums;
        if (!CC_KEYS.some((k) => (a[k] ?? 0) > 0)) continue;
        const reach = a.range ?? a.dash ?? a.radius ?? 0;
        const key = `${HERO_IDS[h]}.${SLOTS[s]}`;
        const windup = Math.max(heroSlotAim(h, nums, s).windup, a.minPop ?? 0, IN_KIT_DELAY.has(key) ? (a.windup ?? 0) : 0);
        const len = a.range ?? a.dash ?? 0;
        const travelMs = (a.speed ?? 0) > 0 && len > 0 ? Math.floor((len * 1000) / a.speed) : null;
        out.push({ key, windup, reach, travelMs });
      }
      if (CC_KEYS.some((k) => (nums.passive[k] ?? 0) > 0)) out.push({ key: `${HERO_IDS[h]}.passive`, windup: 0, reach: 0, travelMs: null });
    }
  }
  return out;
}

describe('sim v17 reaction windows (every hard-CC skill shot can be seen and dodged)', () => {
  const all = rows();

  it('the classification covers real abilities: every exemption names a hard-CC ability', () => {
    const keys = new Set(all.map((r) => r.key));
    for (const k of Object.keys(EXEMPT)) expect(keys.has(k), k).toBe(true);
    // The scan finds the abilities the plan names.
    for (const k of ['brutus.e', 'lambo.e', 'lambo.r', 'cacklejaw.w', 'meatball.w', 'frankie.w', 'frankie.r', 'bengas.w', 'gabe.r', 'bravo.r', 'domino.r'])
      expect(keys.has(k), k).toBe(true);
  });

  it(`every hard-CC ability winds up >= ${MIN_WINDUP} ticks (>= ${MIN_WINDUP_FAR} at >= 9 m) unless exempt`, () => {
    const bad: string[] = [];
    for (const r of all) {
      if (EXEMPT[r.key]) continue;
      const need = r.reach >= FAR_MM ? MIN_WINDUP_FAR : MIN_WINDUP;
      if (r.windup < need) bad.push(`${r.key}: windup ${r.windup} < ${need} (reach ${r.reach})`);
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it(`every hard-CC projectile or dash needs >= ${MIN_TRAVEL_MS} ms at its full range unless exempt`, () => {
    const bad: string[] = [];
    for (const r of all) {
      if (EXEMPT[r.key] || r.travelMs === null) continue;
      if (r.travelMs < MIN_TRAVEL_MS) bad.push(`${r.key}: ${r.travelMs} ms`);
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('the v17 numbers (§3.2, §3.8): windups and times to land at max range', () => {
    const at = (hero: string, slot: number) => {
      const h = HERO_IDS.indexOf(hero as never);
      const nums = kitNumbers(h, 10);
      return { aim: heroSlotAim(h, nums, slot), a: nums[SLOTS[slot]] as Nums };
    };
    const ms = (ticks: number): number => Math.round((ticks * 1000) / TICK_HZ);
    expect(at('cacklejaw', 1).aim.windup).toBe(9);
    expect(at('meatball', 1).aim.windup).toBe(9);
    const brutus = at('brutus', 2);
    expect([brutus.aim.windup, brutus.a.speed]).toEqual([9, 14000]);
    expect(ms(brutus.aim.windup) + Math.floor((brutus.a.dash * 1000) / brutus.a.speed)).toBe(657);
    const lambo = at('lambo', 2);
    expect([lambo.aim.windup, lambo.a.speed, lambo.a.radius]).toEqual([12, 12000, 1800]);
    expect(ms(lambo.aim.windup) + Math.floor((lambo.a.dash * 1000) / lambo.a.speed)).toBe(816);
    const frankie = at('frankie', 1);
    expect([frankie.a.minPop, frankie.a.radius]).toEqual([9, 1600]);
    expect(at('frankie', 3).aim.windup).toBe(12);
  });
});
