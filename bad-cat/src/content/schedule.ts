/**
 * The daily schedule (GDD 3.4, 3.5, 8 seasons, 13.7, 15.3, Appendix A): which room, human, twist and theme each
 * day gets, the 21 authored recipes, the generator beyond them, and the founder's hand-edited fields
 * (Community Sunday, sponsor) read from `public/daily/index.json`.
 *
 * Week:  Mon Kitchen (Chef Dad) · Tue Living room (Couch Potato) · Wed Bathroom (Skincare Sis, mirror)
 *        Thu Home office (WFH Worker, on camera) · Fri Party room (Party Host, Felony Friday)
 *        Sat Boss (two humans, 90 s): Birthday / Wedding alternate, the Christmas Tree every Saturday of S1
 *        Sun Bedroom (Napper, noise meter); a Community room when the founder picks one (from day 21)
 * Specials: Thanksgiving (day 11), the New Year's party boss on Dec 31, the Valentine's dinner boss on Feb 14.
 */
import { SEASONS, propKind, type RoomDef, type RoomEventKind, type RoomTheme } from '../types';
import { pinkPawWaiting } from '../platform';
import { buildDailyRoom, roomProblems, WEEKDAY_TELEGRAPH, type DailyRecipe } from './authoring';
import type { Area } from './kits';
import { KIND } from './props-catalog';
import { ROUTINE, ROUTINES } from './routines';
import { SHELL, SHELLS } from './shells';

/** Day #1 (local date), GDD 3.4. Build constant. A Monday. */
export const DAY1 = '2026-11-16';
const MS_DAY = 86_400_000;
const [D1Y, D1M, D1D] = DAY1.split('-').map(Number);
export const DAY1_UTC = Date.UTC(D1Y, D1M - 1, D1D);
/** Days authored by hand and baked as JSON (rooms/daily-001..021.json). */
export const AUTHORED_DAYS = 21;
/** Days written to public/daily/index.json. */
export const INDEX_DAYS = 63;
/** Community Sunday starts in week 3 (GDD 6.4, 15.3). */
export const FIRST_COMMUNITY_DAY = 21;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local calendar date (YYYY-MM-DD) of a day number. */
export function dateOfDay(dayNo: number): string {
  return new Date(DAY1_UTC + (Math.trunc(dayNo) - 1) * MS_DAY).toISOString().slice(0, 10);
}

/** 0 = Monday .. 6 = Sunday (Day #1 is a Monday). */
export function weekdayOf(dayNo: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return ((((Math.trunc(dayNo) - 1) % 7) + 7) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** Before Day #1 the rotation runs as preview days. */
export function isPreviewDay(dayNo: number): boolean {
  return dayNo < 1;
}

/** SEASONS id of a day ('pre', 's0'..'s3'), or undefined after the last season. */
export function seasonOf(dayNo: number): string | undefined {
  const d = dateOfDay(dayNo);
  return SEASONS.find((s) => d >= s.start && d <= s.end)?.id;
}

/** Christmas season by calendar (S1 "Deck the Halls" is Dec 1 - Jan 10; later years follow the same dates). */
export function isXmasDay(dayNo: number): boolean {
  const md = dateOfDay(dayNo).slice(5);
  return md >= '12-01' || md <= '01-10';
}

const isNewYearsEve = (dayNo: number): boolean => dateOfDay(dayNo).slice(5) === '12-31';
const isValentines = (dayNo: number): boolean => dateOfDay(dayNo).slice(5) === '02-14';

/** "Nov 2" */
export function shortDate(dayNo: number): string {
  const [, m, d] = dateOfDay(dayNo).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function mixSeed(seed: number, dayNo: number): number {
  let h = (seed ^ Math.imul(dayNo | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------------------------------------------------------------------------------------------
// Day plans
// ---------------------------------------------------------------------------------------------

type T = { kind: number; at?: [number, number]; area?: Area[] };
const t = (kind: number, area?: Area[] | [number, number]): T =>
  area === undefined ? { kind } : typeof area[0] === 'number' ? { kind, at: area as [number, number] } : { kind, area: area as Area[] };

/** One day's plan before the builder: shell, humans, name, targets, wish, event, theme. */
export interface DayPlan {
  shell: number;
  routine: number;
  routine2?: number;
  name: string;
  event: RoomEventKind;
  targets: T[];
  wish: number;
  theme?: RoomTheme;
  boss?: boolean;
  /** Extra filler slots left empty. */
  drop?: number;
  grabbables?: number[];
}

/** Appendix A (days 1-14) and week 3 (days 15-21, Season 1 starts Dec 1 on day 16). */
export const AUTHORED_PLANS: readonly DayPlan[] = [
  // 1 Mon Nov 16: the wine glass right on the counter edge by Chef Dad's elbow
  { shell: SHELL.kitchen, routine: ROUTINE.chefDad, name: 'Breakfast Heist', event: 1, targets: [t(KIND.wineGlass, [7, 1]), t(KIND.fruitBowl, ['table', 'sideboard']), t(KIND.eggCarton, ['counter'])], wish: KIND.tunaCan },
  // 2 Tue: the remote on the sofa right next to him, the lamp that was always going to fall
  { shell: SHELL.living, routine: ROUTINE.couchPotato, name: 'TV Night', event: 10, targets: [t(KIND.tvRemote, [4, 8]), t(KIND.popcornBowl, ['coffee']), t(KIND.lamp)], wish: KIND.yarnBall },
  // 3 Wed: the toilet roll sits on the loo like it owns the place
  { shell: SHELL.bathroom, routine: ROUTINE.skincareSis, name: 'Toilet Paper Wednesday', event: 2, targets: [t(KIND.toiletRoll, [10, 4]), t(KIND.perfume, ['vanity']), t(KIND.toothbrushCup, ['vanity'])], wish: KIND.rubberDuck },
  // 4 Thu: the Zoom call in the Home office (round 2: the sofa version's webcam saw 2 of 21 props and it was day 2's
  // layout again); the tripod films the desk wall
  { shell: SHELL.office, routine: ROUTINE.wfhWorker, name: 'Zoom Call', event: 11, targets: [t(KIND.mug, ['desk']), t(KIND.phone, ['desk', 'credenza']), t(KIND.pottedPlant, ['bookcase', 'shelf', 'credenza'])], wish: KIND.penCup },
  // 5 Fri: Felony Friday, the cake in the middle of the cloth
  { shell: SHELL.party, routine: ROUTINE.partyHost, name: 'Felony Friday', event: 5, targets: [t(KIND.cake, ['partytable']), t(KIND.cupsTower, ['buffet']), t(KIND.balloon, ['giftshelf', 'stage'])], wish: KIND.ribbon, theme: 'birthday' },
  // 6 Sat: Boss Birthday Party, Grandma on the stage with her tea
  { shell: SHELL.bossBirthday, routine: ROUTINE.partyHostBoss, routine2: ROUTINE.grandma, name: 'Birthday Party', event: 7, targets: [t(KIND.cake, ['caketable']), t(KIND.giftStack, ['table']), t(KIND.punchBowl, ['buffet'])], wish: KIND.birthdayCandles, theme: 'birthday', boss: true },
  // 7 Sun: Laundry Day, the basket balanced on the bed beside the sleeper
  { shell: SHELL.bedroom, routine: ROUTINE.napper, name: 'Laundry Day', event: 6, targets: [t(KIND.laundryBasket, ['bed']), t(KIND.alarmClock, [7, 1]), t(KIND.jewelleryDish, ['dresser'])], wish: KIND.sock },
  // 8 Mon: Bake Sale
  { shell: SHELL.kitchen, routine: ROUTINE.chefDad + 1, name: 'Bake Sale', event: 4, targets: [t(KIND.cookieTray, ['counter']), t(KIND.flourBag, ['counter', 'shelf']), t(KIND.mixerBowl, ['table', 'bench'])], wish: KIND.butter },
  // 9 Tue: Game Night
  { shell: SHELL.living, routine: ROUTINE.couchPotato, name: 'Game Night', event: 0, targets: [t(KIND.boardGame, ['coffee']), t(KIND.snackTower, ['console']), t(KIND.controller, ['sofa'])], wish: KIND.dice },
  // 10 Wed: Spa Day, candles on the bathtub rim
  { shell: SHELL.bathroom, routine: ROUTINE.skincareSis, name: 'Spa Day', event: 2, targets: [t(KIND.scentedCandle, ['tub']), t(KIND.faceMaskJar, ['vanity']), t(KIND.towelStack, ['towels'])], wish: KIND.rubberDuck },
  // 11 Thu: Thanksgiving, Grandma at the table
  { shell: SHELL.kitchenDinner, routine: ROUTINE.chefDad, routine2: ROUTINE.grandma, name: 'Thanksgiving', event: 8, targets: [t(KIND.gravyBoat, ['table']), t(KIND.pie, ['table', 'bench']), t(KIND.turkeyPlatter, ['counter'])], wish: KIND.turkeyLeg, theme: 'thanksgiving' },
  // 12 Fri: Black Friday Boxes
  { shell: SHELL.party, routine: ROUTINE.partyHost, name: 'Black Friday Boxes', event: 9, targets: [t(KIND.boxTower, ['partytable']), t(KIND.bubbleWrap, ['buffet']), t(KIND.receiptPile, ['giftshelf', 'stage'])], wish: KIND.cardboardBox },
  // 13 Sat: Boss Wedding Cake, two caterers
  { shell: SHELL.bossWedding, routine: ROUTINE.catererA, routine2: ROUTINE.catererB, name: 'Wedding Cake', event: 7, targets: [t(KIND.cake, ['caketable']), t(KIND.champagneTower, ['champagne']), t(KIND.bouquet, ['headtable'])], wish: KIND.ribbon, theme: 'wedding', boss: true },
  // 14 Sun: Sunday Nap, the phone on the very edge of the nightstand
  { shell: SHELL.bedroom, routine: ROUTINE.napper, name: 'Sunday Nap', event: 6, targets: [t(KIND.phone, [7, 1]), t(KIND.waterGlass, ['bed', 'dresser']), t(KIND.pottedPlant, ['wardrobe', 'dresser'])], wish: KIND.blanket },
  // 15 Mon Nov 30: Leftovers
  { shell: SHELL.kitchen, routine: ROUTINE.chefDad + 2, name: 'Leftovers', event: 0, targets: [t(KIND.pie, ['table']), t(KIND.gravyBoat, ['counter', 'bench']), t(KIND.plateStack, ['counter'])], wish: KIND.turkeyLeg },
  // 16 Tue Dec 1: Season 1 starts
  { shell: SHELL.living, routine: ROUTINE.couchPotato, name: 'Tinsel TV Night', event: 3, targets: [t(KIND.ornament, ['console', 'bookcase']), t(KIND.snowGlobe, ['coffee']), t(KIND.popcornBowl, ['sofa', 'coffee'])], wish: KIND.yarnBall, theme: 'xmas' },
  // 17 Wed: Bubble Bath
  { shell: SHELL.bathroom, routine: ROUTINE.skincareSis, name: 'Bubble Bath', event: 2, targets: [t(KIND.scentedCandle, ['tub']), t(KIND.snowGlobe, ['vanity', 'towels']), t(KIND.perfume, ['vanity'])], wish: KIND.rubberDuck, theme: 'xmas' },
  // 18 Thu: Zoom Call (the Home office arrives)
  { shell: SHELL.office, routine: ROUTINE.wfhWorker, name: 'Zoom Call', event: 11, targets: [t(KIND.mug, ['desk']), t(KIND.cookieTray, ['credenza', 'desk']), t(KIND.snowGlobe, ['bookcase', 'shelf', 'credenza'])], wish: KIND.penCup, theme: 'xmas' },
  // 19 Fri: Ugly Sweater Felony Friday
  { shell: SHELL.party, routine: ROUTINE.partyHost, name: 'Ugly Sweater Felony Friday', event: 5, targets: [t(KIND.cookieTray, ['partytable']), t(KIND.giftStack, ['giftshelf', 'buffet']), t(KIND.cupsTower, ['buffet'])], wish: KIND.ribbon, theme: 'xmas' },
  // 20 Sat Dec 5: Boss Christmas Tree, swatted from the mantle
  { shell: SHELL.bossChristmas, routine: ROUTINE.christmasHost, routine2: ROUTINE.grandma, name: 'Christmas Tree', event: 8, targets: [t(KIND.christmasTree, [5, 1]), t(KIND.cookieTray, ['coffee']), t(KIND.snowGlobe, ['cabinet', 'bookcase', 'mantle'])], wish: KIND.ribbon, theme: 'xmas', boss: true },
  // 21 Sun Dec 6: Sunday Nap (the first Community Sunday slot)
  { shell: SHELL.bedroom, routine: ROUTINE.napper, name: 'Sunday Nap', event: 6, targets: [t(KIND.phone, ['nightstand', 'bed']), t(KIND.alarmClock, ['nightstand', 'dresser']), t(KIND.waterGlass, ['bed', 'dresser'])], wish: KIND.blanket, theme: 'xmas' },
];

type Variant = { name: string; targets: T[]; wish: number; event: RoomEventKind; grabbables?: number[] };
const v = (name: string, kinds: number[], wish: number, event: RoomEventKind, areas: (Area[] | undefined)[] = []): Variant => ({
  name,
  targets: kinds.map((k, i) => t(k, areas[i])),
  wish,
  event,
});

/** Weekday rotations for generated days (index = weekday, Mon .. Sun). Each week takes the next variant. */
const WEEK_VARIANTS: readonly (readonly Variant[])[] = [
  [
    v('Breakfast Heist', [KIND.wineGlass, KIND.fruitBowl, KIND.eggCarton], KIND.tunaCan, 1),
    v('Bake Sale', [KIND.cookieTray, KIND.flourBag, KIND.mixerBowl], KIND.butter, 4),
    v('Pancake Panic', [KIND.plateStack, KIND.eggCarton, KIND.mug], KIND.butter, 1),
    v('Midnight Snack', [KIND.pie, KIND.wineGlass, KIND.fruitBowl], KIND.tunaCan, 2),
    v('Soup Day', [KIND.mixerBowl, KIND.mug, KIND.vase], KIND.tunaCan, 0),
    v('Leftovers', [KIND.pie, KIND.gravyBoat, KIND.plateStack], KIND.turkeyLeg, 0),
  ],
  [
    v('TV Night', [KIND.tvRemote, KIND.popcornBowl, KIND.lamp], KIND.yarnBall, 10),
    v('Game Night', [KIND.boardGame, KIND.snackTower, KIND.controller], KIND.dice, 0),
    v('Movie Marathon', [KIND.popcornBowl, KIND.waterGlass, KIND.vase], KIND.blanket, 3),
    v('Match Day', [KIND.controller, KIND.wineGlass, KIND.snackTower], KIND.dice, 10),
    v('Book Club', [KIND.bookStack, KIND.scentedCandle, KIND.mug], KIND.yarnBall, 0),
  ],
  [
    v('Toilet Paper Wednesday', [KIND.toiletRoll, KIND.perfume, KIND.toothbrushCup], KIND.rubberDuck, 2),
    v('Spa Day', [KIND.scentedCandle, KIND.faceMaskJar, KIND.towelStack], KIND.rubberDuck, 2),
    v('Hair Day', [KIND.toothbrushCup, KIND.waterGlass, KIND.faceMaskJar], KIND.rubberDuck, 0),
    v('Laundry Hour', [KIND.laundryBasket, KIND.towelStack, KIND.perfume], KIND.sock, 6),
  ],
  [
    v('Zoom Call', [KIND.laptop, KIND.mug, KIND.pottedPlant], KIND.penCup, 11),
    v('Deadline Day', [KIND.receiptPile, KIND.phone, KIND.waterGlass], KIND.penCup, 11),
    v('Inbox Zero', [KIND.bookStack, KIND.penCup, KIND.mug], KIND.rubberDuck, 0),
    v('Quarterly Review', [KIND.laptop, KIND.boardGame, KIND.scentedCandle], KIND.penCup, 9),
  ],
  [
    v('Felony Friday', [KIND.cake, KIND.cupsTower, KIND.balloon], KIND.ribbon, 5),
    v('Black Friday Boxes', [KIND.boxTower, KIND.bubbleWrap, KIND.receiptPile], KIND.cardboardBox, 9),
    v('Pizza Party', [KIND.popcornBowl, KIND.snackTower, KIND.cupsTower], KIND.ribbon, 10),
    v('Game Show Night', [KIND.boardGame, KIND.balloon, KIND.punchBowl], KIND.dice, 5),
  ],
  [], // Saturday: bosses (bossPlan)
  [
    v('Laundry Day', [KIND.laundryBasket, KIND.alarmClock, KIND.jewelleryDish], KIND.sock, 6),
    v('Sunday Nap', [KIND.phone, KIND.waterGlass, KIND.pottedPlant], KIND.blanket, 6),
    v('Lazy Sunday', [KIND.bookStack, KIND.waterGlass, KIND.alarmClock], KIND.blanket, 0),
    v('Breakfast in Bed', [KIND.mug, KIND.jewelleryDish, KIND.phone], KIND.butter, 6),
  ],
];

/** Season 1 (Christmas) weekday rotations. */
const XMAS_VARIANTS: readonly (readonly Variant[])[] = [
  [v('Christmas Cookies', [KIND.cookieTray, KIND.flourBag, KIND.ornament], KIND.butter, 4), v('Mulled Wine', [KIND.snowGlobe, KIND.wineGlass, KIND.fruitBowl], KIND.tunaCan, 1)],
  [v('Tinsel TV Night', [KIND.ornament, KIND.snowGlobe, KIND.popcornBowl], KIND.yarnBall, 3), v('Gift Wrapping', [KIND.giftWrap, KIND.giftStack, KIND.tvRemote], KIND.ribbon, 0)],
  [v('Bubble Bath', [KIND.scentedCandle, KIND.towelStack, KIND.snowGlobe], KIND.rubberDuck, 2), v('Glitter Mask', [KIND.faceMaskJar, KIND.perfume, KIND.ornament], KIND.rubberDuck, 2)],
  [v('Zoom Call', [KIND.mug, KIND.cookieTray, KIND.snowGlobe], KIND.penCup, 11), v('Holiday Cards', [KIND.giftWrap, KIND.penCup, KIND.phone], KIND.ribbon, 9)],
  // round 3: four Fridays, so no December Friday repeats a title (day 40 was day 26's "Secret Santa" again)
  [
    v('Gift Swap Heist', [KIND.giftWrap, KIND.giftStack, KIND.cupsTower], KIND.ribbon, 5),
    v('Cocoa Crime Spree', [KIND.cookieTray, KIND.punchBowl, KIND.balloon], KIND.ribbon, 10),
    v('Ugly Sweater Felony Friday', [KIND.cookieTray, KIND.giftStack, KIND.cupsTower], KIND.ribbon, 5),
    v('Secret Santa', [KIND.giftStack, KIND.snowGlobe, KIND.punchBowl], KIND.ribbon, 8),
  ],
  [],
  [v('Sunday Nap', [KIND.phone, KIND.ornament, KIND.waterGlass], KIND.blanket, 6), v('Cosy Sunday', [KIND.snowGlobe, KIND.alarmClock, KIND.bookStack], KIND.blanket, 0)],
];

const HOME: readonly { shell: number; routine: number }[] = [
  { shell: SHELL.kitchen, routine: ROUTINE.chefDad },
  { shell: SHELL.living, routine: ROUTINE.couchPotato },
  { shell: SHELL.bathroom, routine: ROUTINE.skincareSis },
  { shell: SHELL.office, routine: ROUTINE.wfhWorker },
  { shell: SHELL.party, routine: ROUTINE.partyHost },
  { shell: SHELL.bossBirthday, routine: ROUTINE.partyHostBoss },
  { shell: SHELL.bedroom, routine: ROUTINE.napper },
];

function bossPlan(dayNo: number): DayPlan {
  const week = Math.floor((dayNo - 1) / 7);
  if (isNewYearsEve(dayNo))
    return { shell: SHELL.bossNye, routine: ROUTINE.partyHostBoss, routine2: ROUTINE.couchPotato, name: "New Year's Party", event: 5, targets: [t(KIND.champagneBottle, ['bar']), t(KIND.cupsTower, ['bar', 'dj']), t(KIND.balloon, ['cocktail', 'shelf'])], wish: KIND.ribbon, theme: 'nye', boss: true };
  if (isValentines(dayNo))
    return { shell: SHELL.bossWedding, routine: ROUTINE.partyHostBoss, routine2: ROUTINE.catererB, name: "Valentine's Dinner", event: 7, targets: [t(KIND.bouquet, ['headtable']), t(KIND.cake, ['caketable']), t(KIND.wineGlass, ['champagne', 'headtable'])], wish: KIND.ribbon, theme: 'valentine', boss: true };
  if (isXmasDay(dayNo))
    return { shell: SHELL.bossChristmas, routine: ROUTINE.christmasHost, routine2: ROUTINE.grandma, name: 'Christmas Tree', event: 8, targets: [t(KIND.christmasTree, [5, 1]), t(week % 2 ? KIND.cookieTray : KIND.snowGlobe, ['coffee']), t(week % 2 ? KIND.ornament : KIND.giftStack, ['cabinet', 'bookcase', 'sofa'])], wish: KIND.ribbon, theme: 'xmas', boss: true };
  if (week % 2 === 0)
    return { shell: SHELL.bossBirthday, routine: ROUTINE.partyHostBoss, routine2: ROUTINE.grandma, name: 'Birthday Party', event: 7, targets: [t(KIND.cake, ['caketable']), t(KIND.giftStack, ['table']), t(KIND.punchBowl, ['buffet'])], wish: KIND.birthdayCandles, theme: 'birthday', boss: true };
  return { shell: SHELL.bossWedding, routine: ROUTINE.catererA, routine2: ROUTINE.catererB, name: 'Wedding Cake', event: 7, targets: [t(KIND.cake, ['caketable']), t(KIND.champagneTower, ['champagne']), t(KIND.bouquet, ['headtable'])], wish: KIND.ribbon, theme: 'wedding', boss: true };
}

/** The plan of any day >= 1: authored for 1..21, generated from the weekday's rotation after. */
export function planForDay(dayNo: number): DayPlan {
  const n = Math.trunc(dayNo);
  if (n >= 1 && n <= AUTHORED_DAYS) return AUTHORED_PLANS[n - 1];
  const wd = weekdayOf(n);
  if (wd === 5 || isNewYearsEve(n) || isValentines(n)) return bossPlan(n);
  const week = Math.floor((n - 1) / 7);
  const xmas = isXmasDay(n);
  const list = xmas ? XMAS_VARIANTS[wd] : WEEK_VARIANTS[wd];
  const pick = list[week % list.length];
  const home = HOME[wd];
  const plan: DayPlan = { shell: home.shell, routine: home.routine, name: pick.name, event: pick.event, targets: pick.targets, wish: pick.wish };
  if (wd === 0) plan.routine = ROUTINE.chefDad + (week % 4); // Chef Dad's four tempos
  const season = SEASONS.find((s) => s.id === seasonOf(n));
  if (xmas) plan.theme = 'xmas';
  else if (season && season.theme !== 'default') plan.theme = season.theme;
  return plan;
}

/** Display name of a shell for labels ("Kitchen #18"). */
export function shellLabel(shell: number): string {
  if (shell === SHELL.kitchenDinner) return 'Kitchen';
  if (shell === SHELL.livingZoom) return 'Living room';
  return SHELLS[shell]?.name ?? 'Room';
}

/** "Kitchen #18", "Boss: Christmas Tree #20". */
export function labelForPlan(plan: Pick<DayPlan, 'boss' | 'name' | 'shell'>, dayNo: number): string {
  return plan.boss ? `Boss: ${plan.name} #${dayNo}` : `${shellLabel(plan.shell)} #${dayNo}`;
}

/** "Kitchen #18: Breakfast Heist", boss rooms: "Boss: Christmas Tree #20". */
export function titleForPlan(plan: Pick<DayPlan, 'boss' | 'name' | 'shell'>, dayNo: number): string {
  return plan.boss ? labelForPlan(plan, dayNo) : `${labelForPlan(plan, dayNo)}: ${plan.name}`;
}

/** Today's Pink Paw accomplice: the waiting cats in turn. */
export function accompliceIdFor(dayNo: number): string | undefined {
  const pool = pinkPawWaiting();
  if (!pool.length) return undefined;
  const i = (((Math.trunc(dayNo) - 1) % pool.length) + pool.length) % pool.length;
  return pool[i].id;
}

const BASE_SEED = 0xbadc0de5;

/** The builder recipe of a day (attempt > 0 re-rolls the jitter when the first roll does not validate). */
export function recipeForDay(dayNo: number, attempt = 0): DailyRecipe {
  const n = Math.trunc(dayNo);
  const plan = planForDay(n);
  const r: DailyRecipe = {
    id: n >= 1 ? `daily-${String(n).padStart(3, '0')}` : `preview-${String(1 - n).padStart(3, '0')}`,
    seed: mixSeed(BASE_SEED + attempt * 0x9e37, n),
    shell: plan.shell,
    routine: plan.routine,
    event: plan.event,
    name: plan.name,
    title: titleForPlan(plan, n),
    telegraph: WEEKDAY_TELEGRAPH[weekdayOf(n)],
    targets: plan.targets,
    wish: plan.wish,
  };
  if (plan.routine2 !== undefined) r.routine2 = plan.routine2;
  if (plan.theme) r.theme = plan.theme;
  if (plan.boss) r.boss = true;
  if (plan.drop) r.drop = plan.drop;
  if (plan.grabbables) r.grabbables = plan.grabbables;
  const acc = accompliceIdFor(n);
  if (acc) r.pinkPawId = acc;
  return r;
}

/** Build a generated day: the first attempt that validates (deterministic); the last attempt if none does. */
/**
 * QA round 3 band (content/rank-bot.test.ts): days whose first valid roll scored far off their shell's median for the
 * planner bot start from another roll. Day → first attempt. Re-check with the rank table after a sim change.
 */
export const BAND_ATTEMPT: Readonly<Record<number, number>> = { 49: 3, 57: 6 };

export function generateRoom(dayNo: number): RoomDef {
  let last: RoomDef | null = null;
  let lastError: unknown = null;
  const first = BAND_ATTEMPT[Math.trunc(dayNo)] ?? 0;
  for (let attempt = first; attempt < first + 12; attempt++) {
    try {
      const room = buildDailyRoom(recipeForDay(dayNo, attempt));
      if (roomProblems(room).length === 0) return room;
      last = room;
    } catch (e) {
      lastError = e;
    }
  }
  if (last) return last;
  throw lastError instanceof Error ? lastError : new Error(`day ${dayNo}: no room`);
}

/** Twist line of a day (GDD 3.5). */
export function twistFor(dayNo: number, plan: DayPlan): string {
  if (plan.boss) return 'Two humans, one suspicion meter';
  const r = ROUTINES[plan.routine];
  if (r?.kind === 'napper') return 'Shh: a noise meter replaces the cone';
  if (r?.mirror) return 'Mirror: when it glints, she can see you in it';
  if (r?.onCamera) return 'Crashes on camera score +50%';
  if (plan.routine2 !== undefined) return 'Two humans at the table';
  switch (weekdayOf(dayNo)) {
    case 0:
      return 'The stove timer warns before he turns';
    case 1:
      return 'He looks up on ad breaks (listen for the jingle)';
    case 4:
      return "Felony Friday: play as today's Pink Paw cat";
    default:
      return '';
  }
}

/** Every kind slug on a room's Must-Wreck list, in order. */
export function targetSlugs(room: RoomDef): string[] {
  return room.props.filter((p) => p.target).map((p) => propKind(p.kind)?.id ?? String(p.kind));
}
