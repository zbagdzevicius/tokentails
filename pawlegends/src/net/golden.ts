/**
 * Party play golden self-test (MULTIPLAYER.md §2.1): 300 ticks of a fixed 3-human party match flown by three pilots.
 * The net-host worker runs it at load with its own sim and compares the hash with __SIM_GOLDEN__ (computed by
 * `npm run vendor-sim` with the vendored backend bundle); a mismatch means a build skew SIM_HASH cannot see, and the
 * client refuses to join (update_required). Pure: takes the sim's functions, imports nothing.
 */
export interface GoldenSim {
  createMatch(config: { seed: number; picks: readonly string[]; tricks: readonly string[]; difficulty: string; humans?: readonly number[] }): unknown;
  step(m: unknown, commands?: readonly unknown[], others?: readonly (readonly unknown[] | undefined)[]): void;
  hash(m: unknown): number;
  fillPicksParty(seed: number, humans: readonly { slot: number; hero: string; trick: string }[]): { picks: string[]; tricks: string[] };
  createPlayerBotFor(m: unknown, profile: string, slot: number): unknown;
  playerBotCommands(m: unknown, bot: unknown): unknown[];
}

export const GOLDEN_SEED = 0x5a1f00d;
export const GOLDEN_TICKS = 300;

/** The golden hash (uint32) of this sim. */
export function goldenHash(sim: GoldenSim): number {
  const seats = [
    { slot: 0, hero: 'clem', trick: 'pounce' },
    { slot: 1, hero: 'sage', trick: 'snack' },
    { slot: 2, hero: 'gabe', trick: 'hiss' },
  ];
  const { picks, tricks } = sim.fillPicksParty(GOLDEN_SEED, seats);
  const m = sim.createMatch({ seed: GOLDEN_SEED, picks, tricks, difficulty: 'normal', humans: [0, 1, 2] });
  const bots = [0, 1, 2].map((s) => sim.createPlayerBotFor(m, 'normal', s));
  for (let t = 0; t < GOLDEN_TICKS; t++) {
    const out = bots.map((b) => sim.playerBotCommands(m, b));
    sim.step(m, out[0], out);
  }
  return sim.hash(m) >>> 0;
}
