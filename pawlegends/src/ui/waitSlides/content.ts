/**
 * While-you-wait slides (founder, Nov 20: "some interesting info / slideshow to see while waiting so that it won't be
 * boring here"): the queue's Short wait and search cards show one comic panel at a time.
 *
 * Every line is TRUE for the current build: numbers are read from the game's own data modules (so a tuning change
 * rewrites the slide), champion slides are built from HERO_TEXT and LORE, and the few map numbers that live in the sim's
 * map specs are written here with their source and pinned by tests/unit/wait-slides.test.ts. Words only, no DOM. Pure.
 */
import { TOY_COST, TOY_PASSIVE, TOY_PASSIVE_TIER, TOY_TIERS } from '../../data/toys';
import { HERO_RULES, NINE_LIVES, RESPAWN, TAKEDOWN_HEAL, XP, ZOOMIES } from '../../data/xp';
import { COMEBACK, MINIONS, WAVE } from '../../data/minions';
import { CROSSING_TIMELINE, SUNSET, TICK_HZ } from '../../data/timeline';
import { TRICKS } from '../../data/tricks';
import { HERO_IDS, HEROES, type HeroId } from '../../data/heroes';
import { LORE } from '../../data/lore';
import { HERO_TEXT, TRICK_TEXT, type IconId } from '../heroText';
import { MAP_CARDS } from '../mapPick';
import { MAP_POOL_3V3, type MapId } from '../../sim/api';
import { PINNED } from './pinned';

// sim-chunk numbers, copied (./pinned.ts; the unit test pins them to data/fish.ts, towers.ts, pickups.ts, camps.ts, pudding.ts)
const FISH = PINNED.fish;
const TOWERS = PINNED.towers;
const PICKUPS = PINNED.pickups;
const RAT_CAMP_STATS = PINNED.rats;
const CROSSING_PUDDING = PINNED.pudding;

export type SlideKind = 'tip' | 'champ' | 'map' | 'live';

export type SlideArt =
  | { t: 'icon'; icon: IconId; tone: 'rose' | 'sky' | 'bolt' }
  | { t: 'face'; hero: HeroId }
  | { t: 'map'; map: MapId }
  | { t: 'split'; cat: number; dog: number };

export interface Slide {
  /** Short and stable (at most 15 characters: the analytics prop scrubber drops longer id-like strings). */
  id: string;
  kind: SlideKind;
  /** The chip over the panel ("TIP", "CAT · FIGHTER", "MAP", "LIVE"). */
  tag: string;
  title: string;
  text: string;
  /** A small second line (a quote, an epithet). */
  sub?: string;
  art: SlideArt;
  /** Account levels this slide is for (inclusive; absent = every level). */
  minLv?: number;
  maxLv?: number;
  /** A basic: new players (Lv 1 to 3) see these first. */
  basic?: boolean;
  /** Only on this input (the desktop key tips; the touch cast tip). */
  device?: 'mouse' | 'touch';
}

// ------------------------------------------------------------------------------------------------------- helpers
const sec = (ticks: number): number => Math.round((ticks / TICK_HZ) * 10) / 10;
const clock = (ticks: number): string => {
  const s = Math.round(ticks / TICK_HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const pct = (bp: number): number => Math.round(bp / 100);
/** bp multipliers (12500 = ×1.25) as "+25%". */
const over = (bp: number): number => Math.round((bp - 10000) / 100);
const m = (mm: number): number => Math.round(mm / 100) / 10;
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const total = (n: number): number => TOY_COST.slice(0, n).reduce((a, b) => a + b, 0);

const tip = (id: string, title: string, text: string, icon: IconId, o: Partial<Slide> = {}): Slide => ({
  id,
  kind: 'tip',
  tag: 'TIP',
  title,
  text,
  art: { t: 'icon', icon, tone: o.basic ? 'bolt' : 'rose' },
  ...o,
});

// ----------------------------------------------------------------------------------------------------------- tips
/** Gameplay tips, read from the data the sim plays by. */
export const TIP_SLIDES: readonly Slide[] = Object.freeze([
  // src: data/fish.ts FISH.lastHitBp, FISH.nearBp
  tip('t-lasthit', 'Last hit = Fish', `Land the final blow on a minion and you take ${pct(FISH.lastHitBp)}% of its Fish. Teammates close by get ${pct(FISH.nearBp)}% each.`, 'tuna', { basic: true }),
  // src: data/fish.ts FISH.minion [melee, ranged, siege]
  tip('t-minionfish', 'Know your minions', `A melee minion is worth ${FISH.minion[0]} Fish, a ranged one ${FISH.minion[1]}, a siege cart ${FISH.minion[2]}.`, 'tuna', { minLv: 2 }),
  // src: data/toys.ts header (bought automatically), TOY_TIERS, TOY_COST
  tip('t-toys', 'Toys buy themselves', `Fish buys your next Toy the moment you can afford it: ${TOY_TIERS} tiers, the full set at ${total(TOY_TIERS).toLocaleString('en-US')} Fish. No shop trips.`, 'balloon', { basic: true }),
  // src: data/toys.ts TOY_PASSIVE_TIER, TOY_PASSIVE (fighter, tank, mage)
  tip('t-toy3a', `Tier ${TOY_PASSIVE_TIER} wakes your role`, `Fighters heal ${pct(TOY_PASSIVE.fighterLifestealBp)}% of basic hits on heroes. Tanks take ${pct(TOY_PASSIVE.tankReduceBp)}% less from heroes. Mages’ abilities hit heroes ${pct(TOY_PASSIVE.mageAbilityBp)}% harder.`, 'crown', { minLv: 2 }),
  // src: data/toys.ts TOY_PASSIVE (marksman, assassin, support)
  tip('t-toy3b', 'Role perks, part two', `Marksmen hit heroes beyond ${m(TOY_PASSIVE.marksmanFarRange)} m for +${pct(TOY_PASSIVE.marksmanFarBp)}%. Assassins deal +${pct(TOY_PASSIVE.assassinExecuteBp)}% to heroes under ${pct(TOY_PASSIVE.assassinExecuteHpBp)}% health. Supports heal and shield ${pct(TOY_PASSIVE.supportBp)}% more.`, 'crown', { minLv: 2 }),
  // src: data/xp.ts XP.ultimateLevel
  tip('t-ult', `Ultimate at level ${XP.ultimateLevel}`, `Your fourth skill wakes up at level ${XP.ultimateLevel}. Save it for a fight you can win.`, 'sun', { basic: true }),
  // src: data/xp.ts XP.talentLevels; each tier of data/heroes/*.ts talents holds two picks; input/presets.ts talent1/2 = Digit1/2
  tip('t-talents', 'Pick a talent', `At levels ${XP.talentLevels.join(', ').replace(/, (\d+)$/, ' and $1')} you choose one of two talents. Each one changes a skill for the rest of the match.`, 'hunt', { basic: true }),
  // src: data/xp.ts XP.levelUpHealBp
  tip('t-lvlheal', 'Level up, heal up', `Every level-up gives back ${pct(XP.levelUpHealBp)}% of your max health. Leveling mid-fight can flip it.`, 'heart'),
  // src: data/xp.ts TAKEDOWN_HEAL.healBp (kill or assist)
  tip('t-takedown', 'Takedowns refill you', `Get a knockout or an assist and ${pct(TAKEDOWN_HEAL.healBp)}% of your max health comes straight back.`, 'heart', { basic: true }),
  // src: data/xp.ts XP.assistWindow
  tip('t-assist', `${sec(XP.assistWindow)} second rule`, `Hit a hero in the last ${sec(XP.assistWindow)} seconds before it falls and the assist is yours.`, 'paw'),
  // src: data/xp.ts XP.maxLevel
  tip('t-maxlvl', `Level ${XP.maxLevel} is the cap`, `Heroes top out at level ${XP.maxLevel} in a match. The team that wins fights gets there first.`, 'crown', { minLv: 2 }),
  // src: data/minions.ts WAVE.xpRange; data/xp.ts XP.shareBp
  tip('t-xpshare', 'Sharing is slower', `Minion XP goes to heroes within ${m(WAVE.xpRange)} m. Alone you get it all, two heroes get ${pct(XP.shareBp[1])}% each.`, 'paw', { minLv: 3 }),
  // src: data/xp.ts XP.killerBonusBp (the killer's unshared bonus)
  tip('t-killxp', 'Kills level you up', `Kill XP grows with the victim’s level, and the hero who lands the knockout gets ${pct(XP.killerBonusBp)}% extra on top.`, 'hunt', { minLv: 3 }),
  // src: data/towers.ts TOWERS.lockOnTicks (lock-on: a hero that leaves the range is not shot)
  tip('t-lockon', 'Towers aim first', `A tower marks you for ${sec(TOWERS.lockOnTicks)} second before it fires. Step out of range in that second and the shot never comes.`, 'ring', { basic: true }),
  // src: data/towers.ts TOWERS.rampBp, rampCapBp
  tip('t-ramp', 'Don’t tank the tower', `Every tower shot in a row hits ${pct(TOWERS.rampBp)}% harder, up to +${pct(TOWERS.rampCapBp)}%. Let your minions take the heat.`, 'ring', { basic: true }),
  // src: sim/combat/damage.ts forceAggro (a hero that damages an enemy hero near a structure draws its fire)
  tip('t-aggro', 'Towers guard their heroes', 'Hit an enemy hero next to its tower and that tower turns on you.', 'ring'),
  // src: data/towers.ts TOWERS.backdoorBp, backdoorRange
  tip('t-backdoor', 'Bring minions', `Towers take ${pct(TOWERS.backdoorBp)}% less damage from heroes while none of your minions are within ${m(TOWERS.backdoorRange)} m.`, 'ring', { minLv: 3 }),
  // src: data/fish.ts FISH.tower; data/towers.ts TOWERS.teamXp
  tip('t-towerpay', 'Towers pay everyone', `Take a tower and every living hero on your team gets ${FISH.tower} Fish and ${TOWERS.teamXp} XP.`, 'ring'),
  // src: data/towers.ts TOWERS.fortifyUntil (Crossing and the pool maps: 7200 ticks)
  tip('t-fortify', 'Fortified towers', `Until ${clock(TOWERS.fortifyUntil[0])}, towers shrug off part of the damage and hit back harder. Early dives hurt.`, 'shield', { minLv: 4 }),
  // src: data/timeline.ts SUNSET
  tip('t-sunset', 'Sunset', `At Sunset towers and cores take ${SUNSET.structureDamageBp / 10000}× damage and minions hit ${over(SUNSET.minionDamageBp)}% harder. Time to push.`, 'sun', { minLv: 3 }),
  // src: data/xp.ts ZOOMIES; ZOOMIES doc: after leaving the fountain or respawning, damage ends it
  tip('t-zoomies', 'Zoomies', `Leave your fountain or respawn and you run ${pct(ZOOMIES.speedBp)}% faster for ${sec(ZOOMIES.ticks)} s. Taking damage ends it.`, 'dash', { basic: true }),
  // src: data/xp.ts HERO_RULES.napChannel (recall, broken by damage); input/presets.ts nap = KeyB
  tip('t-nap', 'Take a Nap', `Nap sends you home after ${sec(HERO_RULES.napChannel)} s. Any hit wakes you up, so nap out of sight.`, 'nap', { basic: true }),
  // src: data/pickups.ts PICKUPS.snack; data/fish.ts FISH.snack; SNACK_BEHIND (behind the own outer tower)
  tip('t-snack', 'Fish Snacks', `From ${clock(PICKUPS.snack.first)}, a Fish Snack waits behind your outer tower every ${sec(PICKUPS.snack.every)} s: ${pct(PICKUPS.snack.healBp)}% health, ${FISH.snack} Fish and fresh Zoomies.`, 'tuna'),
  // src: data/pickups.ts PICKUPS.frenzy
  tip('t-frenzy', 'Frenzy Catnip', `From ${clock(PICKUPS.frenzy.first)}, Frenzy Catnip spawns mid-map every ${sec(PICKUPS.frenzy.every)} s: +${pct(PICKUPS.frenzy.dmgBp)}% damage and +${pct(PICKUPS.frenzy.speedBp)}% speed for ${sec(PICKUPS.frenzy.ticks)} s.`, 'spark'),
  // src: data/camps.ts RAT_CAMP_STATS.packDmgBp, packTicks; sim/combat/damage.ts packBuff on rat camps
  tip('t-rats', 'Rat camp buff', `Clear a rat camp and every hero on your team deals ${pct(RAT_CAMP_STATS.packDmgBp)}% more damage for ${sec(RAT_CAMP_STATS.packTicks)} s.`, 'paw'),
  // src: data/fish.ts FISH.firstBlood
  tip('t-firstblood', 'First blood', `The match’s first takedown pays the killer ${FISH.firstBlood} extra Fish.`, 'hunt'),
  // src: data/fish.ts FISH.shutdownPerStreak, shutdownMax
  tip('t-shutdown', 'End the streak', `Knock out a hero on a takedown streak for ${FISH.shutdownPerStreak} bonus Fish per takedown, up to ${FISH.shutdownMax}.`, 'hunt', { minLv: 3 }),
  // src: data/xp.ts RESPAWN.base, perLevel (late Sunset stretches it: data/timeline.ts LATE_SUNSET)
  tip('t-respawn', 'Falling costs time', `Early on a knockout costs ${sec(RESPAWN.base)} s plus ${sec(RESPAWN.perLevel)} s per level. Late in the match the wait grows a lot.`, 'nap', { minLv: 2 }),
  // src: data/xp.ts NINE_LIVES.reduceBp; sim/effects/bonus.ts nineLives (the threshold is per mode: data/bots.ts
  // nineLivesLossBp, 40% Normal, 45% Hard and PvP, so the slide names no share)
  tip('t-ninelives', 'Nine Lives', `Burst has a ceiling: lose a big chunk of health inside one second and the rest of that second’s damage is cut by ${pct(NINE_LIVES.reduceBp)}%.`, 'shield', { minLv: 4 }),
  // src: data/minions.ts COMEBACK; sim/units/minion.ts checkComeback (takedowns count only without lead pressure,
  // i.e. Rookie and Easy: every queued match counts structures only)
  tip('t-underdog', 'Underdog waves', `Fall ${COMEBACK.structuresBehind} structures behind and your next ${COMEBACK.waves} waves get ${pct(COMEBACK.hpBp)}% more health.`, 'shield', { minLv: 4 }),
  // src: data/timeline.ts CROSSING_TIMELINE.siegeFrom, siegeEveryNthWave; data/minions.ts MINIONS.siege.towerBp
  tip('t-siege', 'Siege carts', `From ${clock(CROSSING_TIMELINE.siegeFrom)}, every ${ordinal(CROSSING_TIMELINE.siegeEveryNthWave)} wave brings a siege cart. It hits towers ${MINIONS.siege.towerBp / 10000}× as hard.`, 'charge', { minLv: 2 }),
  // src: data/timeline.ts CROSSING_TIMELINE.firstWave, waveEvery
  tip('t-waves', 'Wave clock', `The first minions march at ${clock(CROSSING_TIMELINE.firstWave)}, then a new wave every ${sec(CROSSING_TIMELINE.waveEvery)} s.`, 'charge', { basic: true }),
  // src: data/tricks.ts TRICKS.pounce; ui/heroText.ts TRICK_TEXT; input/desktop.ts (Pounce casts on the key press)
  tip('t-pounce', TRICK_TEXT.pounce.name, `The Paw Trick that blinks you ${m(TRICKS.pounce.blink)} m in one press. It comes back after ${sec(TRICKS.pounce.cooldown)} s, so make it count.`, 'blink', { basic: true }),
  // src: data/tricks.ts TRICKS.snack (broken by hard crowd control)
  tip('t-snackbrk', TRICK_TEXT.snack.name, `Heals ${pct(TRICKS.snack.healBp)}% of your health over ${sec(TRICKS.snack.duration)} s. A stun cuts it short, so eat out of reach.`, 'heart'),
  // src: data/tricks.ts TRICKS.hiss; ui/heroText.ts DOG_TRICK_TEXT (dogs call it Growl)
  tip('t-hiss', 'Hiss or Growl', `Scare every enemy within ${m(TRICKS.hiss.radius)} m for ${sec(TRICKS.hiss.fear)} s. Perfect for shaking off a diver.`, 'hiss'),
  // src: data/tricks.ts TRICKS.purrify; ui/heroText.ts trickHint (the Tank tip)
  tip('t-purrify', 'Purr-ify or Shake Off', `Breaks stuns, roots, slows, scares and charms, even mid-stun. Back every ${sec(TRICKS.purrify.cooldown)} s. Tanks love it.`, 'purr', { minLv: 2 }),
  // src: input/presets.ts MOBA_BINDINGS (Q W E R, D trick, B nap, Space centre, Tab scoreboard)
  tip('t-keys', 'Hotkeys', 'Q W E R cast, D is your Paw Trick, B naps, 1 and 2 pick talents, Space centres the camera, Tab shows the score.', 'paw', { device: 'mouse', basic: true }),
  // src: ui/settings.ts CAST_NAME; input/presets.ts castMode default 'hold'
  tip('t-castkey', 'On release or on press', 'Skills cast when you let go of the key, so you see the range first. Want speed? Settings → Ability keys → On press.', 'blink', { device: 'mouse', minLv: 2 }),
  // src: input/presets.ts ping = KeyG; Alt-click pings Focus on an enemy hero
  tip('t-ping', 'Ping it', 'Hold G for the ping wheel. Alt-click an enemy hero to call Focus on it.', 'spark', { device: 'mouse', minLv: 2 }),
  // src: ui/settings.ts touch cast modes (Quick, Indicator, Normal; dashes always cast on press)
  tip('t-touchcast', 'Your cast style', 'Settings has three touch modes: Quick casts at the best target, Indicator shows the aim first, Normal taps then aims. Dashes always fire on press.', 'blink', { device: 'touch', minLv: 2 }),
  // src: data/pudding.ts CROSSING_PUDDING (calm meter filled by damage, escort joins the next wave); data/fish.ts FISH.pudding; CROSSING_TIMELINE.pudding
  tip('t-pudding', 'Calm Pudding', `On the Crossing, Pudding wakes at ${clock(CROSSING_TIMELINE.pudding)}. Fill his calm meter with damage and he walks with your next wave. Your whole team gets ${FISH.pudding} Fish.`, 'paw', { minLv: 2 }),
  // src: data/pudding.ts CROSSING_PUDDING.hopEvery, hopRadius
  tip('t-pudhop', 'Mind the hop', `Wild Pudding hops every ${sec(CROSSING_PUDDING.hopEvery)} s and knocks back everyone within ${m(CROSSING_PUDDING.hopRadius)} m. Dodge the ring.`, 'ring', { minLv: 3 }),
]);

// ----------------------------------------------------------------------------------------------------------- maps
const map = (id: string, mapId: MapId, title: string, text: string, o: Partial<Slide> = {}): Slide => ({ id, kind: 'map', tag: 'MAP', title, text, art: { t: 'map', map: mapId }, ...o });
const name = (id: MapId): string => MAP_CARDS[id].name;

/**
 * The 3v3 map rotation (sim/api.ts MAP_POOL_3V3). Objective numbers live in the sim's map specs (data/maps/*.ts), which
 * the client never loads before a match: they are written out here and pinned to the specs by the unit test.
 */
export const MAP_SLIDES: readonly Slide[] = Object.freeze([
  // src: sim/api.ts MAP_POOL_3V3; ui/mapPick.ts MAP_CARDS
  map('m-pool', 'crossing', `${MAP_POOL_3V3.length} maps in rotation`, `3v3 matches rotate ${MAP_POOL_3V3.map((id) => MAP_CARDS[id].short).join(', ').replace(/, ([^,]+)$/, ' and $1')}. Each one plays differently.`, { basic: true }),
  // src: ui/mapPick.ts MAP_CARDS.crossing.line
  map('m-crossing', 'crossing', name('crossing'), MAP_CARDS.crossing.line),
  // src: data/maps/ridge.ts laneNames ['Ridge Road']; data/minions.ts WAVE.oneLaneMelee, oneLaneRanged; objective.first 1800 (1:00)
  map('m-ridge', 'ridge', name('ridge'), `One lane, so every wave carries ${WAVE.oneLaneMelee} melee and ${WAVE.oneLaneRanged} ranged minions. The Fish Mill in the woods opens at 1:00.`),
  // src: data/maps/ridge.ts objective potPerSecond 4, capture 120 (4 s), buffTicks 1350 (45 s), minionStructBp 12500; sim/units/objective.ts
  map('m-mill', 'ridge', 'The Fish Mill', 'Its pot fills 4 Fish a second. Stand alone in the disc for 4 s to take it all, plus a Lantern Wave: your minions hit structures 25% harder for 45 s.'),
  // src: data/maps/ridge.ts objective endAt 8100 (4:30); data/timeline.ts RIDGE_TIMELINE.pudding 8100
  map('m-ridgepud', 'ridge', 'Mill closes, Pudding wakes', 'At 4:30 the Fish Mill shuts for good and Pudding wakes up in its pit. Be there.', { minLv: 2 }),
  // src: data/maps/thicket.ts objective first 2700 (1:30), capture 90 (3 s), cooldown 1800 (60 s)
  map('m-thicket', 'thicket', name('thicket'), 'Two Paw Shrines unlock at 1:30. Stand alone on one for 3 s to capture it. It then locks for 60 s.'),
  // src: data/maps/thicket.ts objective speedBp 1000, minionStructBp 11500, heroStructBp 11500; sim/units/objective.ts
  map('m-shrines', 'thicket', 'Swift Paws, Twin Blessing', 'Own one shrine: your team runs 10% faster. Own both: your heroes and minions hit structures 15% harder.'),
  // src: data/maps/quarry.ts objective first 1350 (0:45), cooldown 180 (6 s), gemCap 20
  map('m-quarry', 'quarry', name('quarry'), 'From 0:45 a Catnip Gem pops out of the Geode every 6 s. Walk over one to grab it. Fall and you drop every gem you carry.'),
  // src: data/maps/quarry.ts objective gemNeed 7, countdown 360 (12 s), buffTicks 1350 (45 s), minionTakenBp 7000, minionStructBp 15000
  map('m-surge', 'quarry', 'Geode Surge', 'Hold 7 gems as a team for 12 s: for 45 s your minions take 30% less damage and hit structures 50% harder.', { minLv: 2 }),
  // src: data/maps/pitch.ts objective siegeBp 1200, fish 40, xp 50; sim/units/objective.ts ballInGoal
  map('m-pitch', 'pitch', name('pitch'), 'Kick the Mega Yarn Ball into their goal: their weakest tower loses 12% of its health and every hero on your team gets 40 Fish and 50 XP.'),
  // src: sim/units/objective.ts header (one hit breaks a crate, every crate regrows after a goal, crates crumble at Sunset)
  map('m-crates', 'pitch', 'Crates', 'A ball that hits a crate breaks it. Every crate grows back after a goal, and at Sunset they crumble for good.', { minLv: 2 }),
]);

// ------------------------------------------------------------------------------------------------------ champions
const cap = (s: string): string => s.toUpperCase();

/** Two panels per champion: who they are (lore) and their ultimate (kit text). */
export function championSlides(): Slide[] {
  const out: Slide[] = [];
  for (const id of HERO_IDS) {
    const t = HERO_TEXT[id];
    const lore = LORE[id];
    if (!t || !lore) continue;
    const side = HEROES[id].side === 'cat' ? 'CAT' : 'DOG';
    const tag = `${side} · ${cap(t.role)}`;
    // src: data/lore.ts LORE[id] (epithet, quote, howTheyFight)
    out.push({ id: `c-${id}`, kind: 'champ', tag, title: t.title, sub: lore.epithet, text: `“${lore.quote}”`, art: { t: 'face', hero: id } });
    // src: ui/heroText.ts HERO_TEXT[id].abilities[3] (the ultimate) and passive
    const ult = t.abilities[3];
    out.push({ id: `u-${id}`, kind: 'champ', tag, title: ult.name, sub: `${t.title}’s ultimate`, text: ult.text, art: { t: 'face', hero: id } });
  }
  return out;
}

/** Every static slide (the live ones are built per wait from the player's own numbers). */
export function staticSlides(): Slide[] {
  return [...TIP_SLIDES, ...MAP_SLIDES, ...championSlides()];
}
