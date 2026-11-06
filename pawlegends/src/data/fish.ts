/**
 * Fish (sim v12, docs/FUN-PROGRESSION-V12.md S1): the in-match currency. Every hero earns it from last hits, kills,
 * assists, objectives and a passive trickle; `progression/fish.ts` spends it on Toys (data/toys.ts) automatically.
 * Integer amounts; shares in basis points.
 *
 * S6 tuning (balance gate, 2,000 seeds): the spec's start (passive 2 a second, minions 12 / 9 / 25, rats 30 / 10) paid
 * 40% of all Fish passively and 9% from minions. With passive 1, minions 36 / 27 / 75 and rats 60 / 20 the split is
 * kills and assists 33%, minions 29%, objectives 14%, passive and comeback 20%, camp 4%; Toy tier 1 to 3 land at
 * 2:11, 4:13 and 6:22 for the median hero.
 */
export const FISH = Object.freeze({
  /** Every hero, alive or dead, every second from the first wave. */
  passivePerSecond: 1,
  /** Lane minion value by kind index (0 melee, 1 ranged, 2 siege). */
  minion: Object.freeze([36, 27, 75]),
  /** The hero who landed the last hit takes this share of the minion's value. Fun pass (playtest #3: a last hit was
   *  worth +7 Fish over standing near, so the trickle was half a casual player's Fish): 80% (60% before), so a melee
   *  last hit is +18 over standing near. The full value (near 25%) let the ranged-heavy cat roster out-farm the dogs
   *  (balance gate cats 53.4%, 47% to 53%). */
  lastHitBp: 8000,
  /** Every other hero of that team within WAVE.xpRange takes this share (each, not split). Fun pass: 30% (40%). */
  nearBp: 3000,
  /** Hero kill value (killer); 80 when the victim died 2+ times in a row, 50 at 4+ (deathStreak). */
  kill: 120,
  killRepeat: 80,
  killRepeatFrom: 2,
  killFed: 50,
  killFedFrom: 4,
  /** The match's first takedown pays the killer this on top. */
  firstBlood: 50,
  /** The assisters split this share of the kill value (first blood and shutdown not included). */
  assistBp: 5000,
  /** Shutdown: the killer gets perStreak × the victim's takedown streak (from XP.bountyStreak), at most shutdownMax. */
  shutdownPerStreak: 40,
  shutdownMax: 200,
  /** Rat (each of the camp's two): the last hitter, and every other hero of its team within XP.shareRange. */
  ratLastHit: 60,
  ratNear: 20,
  /** Every hero of the team that took an enemy tower. */
  tower: 100,
  /** Every hero of the team that calmed Pudding. */
  pudding: 75,
  /** A Fish Snack pickup, to its taker. */
  snack: 40,
  /** Comeback: from DifficultyRules.catchUpFrom, the lowest-Fish hero of the team behind on raw Fish, every second. */
  comebackPerSecond: 1,
});
