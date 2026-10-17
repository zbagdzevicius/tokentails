/**
 * Router state machine (GDD 13.5), pure and unit-tested:
 *
 *   boot → (route? thanks|redeem|restore|club|cameo|brand|maker|archive|rapsheet|settings)
 *        → (?studio=1? studio) → (typed? picker)
 *        → (first visit? linkIntro → catmaker (skippable) → 40 s FTUE : link? briefing : home)
 *        (a dare link on a first visit: linkIntro → catmaker → the dared room's full run against the ghost, no 40 s FTUE)
 *        → briefing → run → result → share → (FTUE? home "your ranked run is ready")
 *        → (session ≥ 2 and a paywall offer or a pre-sale link? offer card) → home
 *
 *   clipHandoff (?clip=1&rp=…): boot → (no photo on this device? catmaker reAdd, skippable) → result (the replay
 *   is re-simulated, the clip renders behind it) → share.
 *
 * Side screens: picker, archive, catmaker, cats, settings, rapsheet, season, friends, weekly, rooms, maker,
 * studio, sheets (club, cameo, gift, shop, brand...), back → home (one level back to rooms, rapsheet, settings).
 * The first visit always plays the 40 s FTUE run (GDD 8) on the link's room (or today's room); on a boss or
 * Napper day it plays The Glass instead. One ranked run per day: the first finished run of today's room is
 * ranked, every other run is practice. The Glass is always practice. Paywall moments outside the share flow
 * (catmaker_saved, streak_break, archive_old) use { t: 'offer' }: never in session 1, at most one per session.
 */
import type { LinkRoute, RunMode } from '../types';

/** Money / link sheets mounted by the shell (GDD 6.6 routes, 9 Club, gifts, shop, brand). */
export type SheetKind = 'thanks' | 'redeem' | 'restore' | 'club' | 'cameo' | 'brand' | 'shop' | 'gift' | 'maker';

export type Screen =
  | 'boot'
  | 'picker'
  | 'linkIntro'
  | 'catmaker'
  | 'home'
  | 'briefing'
  | 'run'
  | 'result'
  | 'share'
  | 'offer'
  | 'archive'
  | 'settings'
  /** FULL build: a money or link sheet (state.sheet), the cat manager (up to 5 cats), the Rap Sheet. */
  | 'sheet'
  | 'cats'
  | 'rapsheet'
  /** Wave 2: season track, friends board, weekly card, my rooms, the Room Maker (playtests run as a practice run). */
  | 'season'
  | 'friends'
  | 'weekly'
  | 'rooms'
  | 'maker'
  /** Phase 2 (src/online): the daily board (top 100) and the public room feed. */
  | 'board'
  | 'feed'
  /** ?studio=1: the founder's stitch / reply clip queue (GDD 6.2). */
  | 'studio';

/** Side screens opened with { t: 'open' } (back → home). */
export type SideScreen = 'archive' | 'settings' | 'catmaker' | 'picker' | 'cats' | 'rapsheet' | 'season' | 'friends' | 'weekly' | 'rooms' | 'maker' | 'studio' | 'board' | 'feed';

export type EntryKind = 'direct' | 'daily_link' | 'typed' | 'glass' | 'cat_link' | 'clip_handoff' | 'dare_link' | 'room_link' | 'route';

export interface Entry {
  kind: EntryKind;
  dayNo?: number;
  glass?: boolean;
  pick?: boolean;
  catCode?: string;
  via?: string;
  /** A player room from a room link (/r?r=...): the app keeps the RoomDef, the plan only says `ugc`. */
  ugc?: boolean;
  /** /badcat/<route> links (thanks, redeem, restore, club, ...). */
  route?: LinkRoute;
  /** ?studio=1: the studio session opens first. */
  studio?: boolean;
}

export interface RouterCtx {
  entry: Entry;
  todayNo: number;
  /** 1 = the player's first session on this device. */
  sessionIndex: number;
  /** The 40 s first heist has been played on this device. */
  ftueDone: boolean;
  /** Ranked run already recorded for this day. */
  rankedDone(dayNo: number): boolean;
  /** A pre-sale Payment Link is configured. */
  presale: boolean;
  /** FULL build: a paywall offer card is due after this share (money.paywall decided it). */
  offer?(): boolean;
  /** GDD 13.5: the 40 s first heist on a boss or Napper day plays The Glass instead. */
  ftueGlass?(dayNo: number): boolean;
}

export interface RunPlan {
  glass: boolean;
  dayNo?: number; // undefined for The Glass
  mode: RunMode;
  /** The player room from the room link (never ranked, never the 40 s FTUE). */
  ugc?: boolean;
  /** Room Maker "clear it" run: a practice run of the draft; it ends back in the maker (no result screen). */
  playtest?: boolean;
  /** Studio session run (40 s): its share returns to the studio queue. */
  studio?: boolean;
  /** Household clip: the second cat's run of the same room; it ends back on the share screen (no result). */
  household?: boolean;
}

export interface RouterState {
  screen: Screen;
  plan: RunPlan | null;
  /** In the first-visit flow (linkIntro → catmaker → FTUE run → share). */
  ftue: boolean;
  ftueDone: boolean;
  /** Home shows "Your ranked run for Kitchen #n is ready". */
  readyRanked: boolean;
  offerShown: boolean;
  /** Where the catmaker returns (side screen). */
  back: Screen;
  /** Which sheet the 'sheet' screen shows. */
  sheet?: SheetKind;
  /** Clip handoff: the cat maker re-adds the photo, then the result of the replay opens. */
  reAdd?: boolean;
  /** Where a paywall offer card opened outside the share flow returns. */
  offerBack?: Screen;
  /** The share's run plan while the household run plays (restored when it ends). */
  hhPlan?: RunPlan;
}

export type RouterEvent =
  | { t: 'booted' }
  /** Clip handoff link (rp + clip=1): the replay was re-simulated; open its result and render the clip. */
  | { t: 'replayReady'; dayNo?: number; glass?: boolean; reAdd?: boolean }
  | { t: 'picked'; dayNo?: number; glass?: boolean }
  | { t: 'introDone' }
  | { t: 'catmakerDone' }
  | { t: 'play'; dayNo?: number; glass?: boolean; ugc?: boolean }
  | { t: 'start' }
  | { t: 'ended' }
  | { t: 'toShare' }
  | { t: 'playAgain' }
  | { t: 'shareDone' }
  | { t: 'offerDone' }
  | { t: 'open'; screen: SideScreen }
  /** Room Maker: play the draft once (practice), then come back to the maker. */
  | { t: 'playtest' }
  | { t: 'sheet'; sheet: SheetKind }
  /** A paywall moment outside the share flow (catmaker_saved, streak_break, archive_old): the shell decided it. */
  | { t: 'offer' }
  /** Studio: play the 40 s run of the current queue item on this room. */
  | { t: 'studioPlay'; dayNo?: number; glass?: boolean }
  /** Share screen "Play Luna too": record the second cat's run of the same room for the household clip. */
  | { t: 'household' }
  | { t: 'back' }
  | { t: 'quit' };

export function initialRouter(ctx: RouterCtx): RouterState {
  return { screen: 'boot', plan: null, ftue: false, ftueDone: ctx.ftueDone, readyRanked: false, offerShown: false, back: 'home' };
}

/** Which mode a run on a room gets. */
export function planFor(ctx: RouterCtx, sel: { dayNo?: number; glass?: boolean; ugc?: boolean }, ftue: boolean): RunPlan {
  if (sel.ugc) return { glass: false, mode: 'practice', ugc: true };
  const glass = !!sel.glass;
  const dayNo = glass ? undefined : sel.dayNo ?? ctx.todayNo;
  if (ftue) {
    // a boss room (90 s, two humans) or the Napper's noise meter is no first heist: The Glass instead
    if (!glass && dayNo !== undefined && ctx.ftueGlass?.(dayNo)) return { glass: true, dayNo: undefined, mode: 'ftue' };
    return { glass, dayNo, mode: 'ftue' };
  }
  if (!glass && dayNo === ctx.todayNo && !ctx.rankedDone(ctx.todayNo)) return { glass, dayNo, mode: 'ranked' };
  return { glass, dayNo, mode: 'practice' };
}

function entrySel(e: Entry): { dayNo?: number; glass?: boolean; ugc?: boolean } {
  if (e.ugc) return { ugc: true };
  return e.glass ? { glass: true } : { dayNo: e.dayNo };
}

/** The screen a /badcat/<route> link opens (routes win over the first-visit flow: a gift or a receipt first). */
export function routeScreen(route: LinkRoute): { screen: Screen; sheet?: SheetKind } {
  switch (route) {
    case 'archive':
      return { screen: 'archive' };
    case 'settings':
      return { screen: 'settings' };
    case 'rapsheet':
      return { screen: 'rapsheet' };
    case 'maker':
      return { screen: 'maker' };
    default:
      return { screen: 'sheet', sheet: route };
  }
}

export function reduce(ctx: RouterCtx, s: RouterState, e: RouterEvent): RouterState {
  const firstVisit = !s.ftueDone;
  switch (e.t) {
    case 'booted': {
      if (s.screen !== 'boot') return s;
      if (ctx.entry.route) return { ...s, ...routeScreen(ctx.entry.route), back: 'home' };
      if (ctx.entry.studio) return { ...s, screen: 'studio', back: 'home' };
      if (ctx.entry.pick || ctx.entry.kind === 'typed') return { ...s, screen: 'picker', back: 'home' };
      // Dare arrivals (GDD 6.3, 8): a first-timer sees the dare on the intro, snaps a cat, then plays the dared
      // room itself against the ghost (briefing dare line, ghost in the run, beat/lose on the result). A 40 s first
      // heist in between lost the dare (review round 1). Returning players skip to the briefing.
      if (ctx.entry.kind === 'dare_link')
        return firstVisit
          ? { ...s, screen: 'linkIntro', ftue: true, plan: planFor(ctx, entrySel(ctx.entry), false) }
          : { ...s, screen: 'briefing', plan: planFor(ctx, entrySel(ctx.entry), false) };
      if (firstVisit) return { ...s, screen: 'linkIntro', ftue: true, plan: planFor(ctx, entrySel(ctx.entry), true) };
      if (ctx.entry.kind === 'cat_link') return { ...s, screen: 'catmaker', back: 'home' };
      if (ctx.entry.kind === 'daily_link' || ctx.entry.kind === 'glass' || ctx.entry.kind === 'clip_handoff' || ctx.entry.kind === 'room_link')
        return { ...s, screen: 'briefing', plan: planFor(ctx, entrySel(ctx.entry), false) };
      return { ...s, screen: 'home' };
    }
    case 'replayReady': {
      if (s.screen !== 'boot') return s;
      const plan: RunPlan = { glass: !!e.glass, dayNo: e.glass ? undefined : e.dayNo, mode: 'practice' };
      // no photo on this device (a new browser after the in-app handoff): re-add it for the opener, skippable
      if (e.reAdd) return { ...s, screen: 'catmaker', ftue: false, reAdd: true, back: 'result', plan };
      return { ...s, screen: 'result', ftue: false, plan };
    }
    case 'picked': {
      if (s.screen !== 'picker' && s.screen !== 'archive') return s;
      const sel = { dayNo: e.dayNo, glass: e.glass };
      if (firstVisit) return { ...s, screen: 'linkIntro', ftue: true, plan: planFor(ctx, sel, true) };
      return { ...s, screen: 'briefing', plan: planFor(ctx, sel, false) };
    }
    case 'introDone':
      return s.screen === 'linkIntro' ? { ...s, screen: 'catmaker', back: 'briefing' } : s;
    case 'catmakerDone':
      if (s.screen !== 'catmaker') return s;
      if (s.reAdd) return { ...s, screen: 'result', reAdd: false, back: 'home' };
      if (s.ftue && s.plan) return { ...s, screen: 'briefing' };
      return { ...s, screen: s.back === 'briefing' && s.plan ? 'briefing' : 'home' };
    case 'play':
      if (s.screen !== 'home' && s.screen !== 'archive' && s.screen !== 'picker' && s.screen !== 'rooms' && s.screen !== 'friends' && s.screen !== 'maker' && s.screen !== 'board' && s.screen !== 'feed') return s;
      // A first heist left early is not done: the next play is still the FTUE (never marked done on quit).
      return { ...s, screen: 'briefing', readyRanked: false, ftue: firstVisit, plan: planFor(ctx, { dayNo: e.dayNo, glass: e.glass, ugc: e.ugc }, firstVisit && !e.ugc) };
    case 'playtest':
      if (s.screen !== 'maker') return s;
      return { ...s, screen: 'briefing', ftue: false, plan: { glass: false, mode: 'practice', ugc: true, playtest: true } };
    case 'studioPlay':
      if (s.screen !== 'studio') return s;
      // the founder's 40 s practice run (GDD 6.2): first-heist timing, never ranked, back to the queue after the share
      return { ...s, screen: 'briefing', ftue: false, plan: { glass: !!e.glass, dayNo: e.glass ? undefined : e.dayNo ?? ctx.todayNo, mode: 'ftue', studio: true } };
    case 'household': {
      if (s.screen !== 'share' || !s.plan || s.plan.playtest || s.plan.household) return s;
      const base = s.plan;
      return { ...s, screen: 'briefing', hhPlan: base, plan: { glass: base.glass, dayNo: base.dayNo, mode: 'practice', ...(base.ugc ? { ugc: true } : {}), household: true } };
    }
    case 'start':
      return s.screen === 'briefing' && s.plan ? { ...s, screen: 'run' } : s;
    case 'ended':
      if (s.screen !== 'run') return s;
      if (s.plan?.playtest) return { ...s, screen: 'maker' };
      if (s.plan?.household) return { ...s, screen: 'share', plan: s.hhPlan ?? s.plan, hhPlan: undefined };
      // The FTUE run counts as played once it ends.
      return { ...s, screen: 'result', ftueDone: s.ftueDone || s.plan?.mode === 'ftue' || s.ftue };
    case 'toShare':
      return s.screen === 'result' ? { ...s, screen: 'share' } : s;
    case 'playAgain': {
      if ((s.screen !== 'result' && s.screen !== 'share' && s.screen !== 'run') || !s.plan || s.plan.playtest || s.plan.household) return s;
      if (s.plan.studio) return { ...s, screen: 'briefing', ftue: false, plan: { ...s.plan } };
      const plan = planFor(ctx, { dayNo: s.plan.dayNo, glass: s.plan.glass, ugc: s.plan.ugc }, false);
      return { ...s, screen: 'briefing', ftue: false, plan };
    }
    case 'shareDone': {
      if (s.screen !== 'share' && s.screen !== 'result') return s;
      if (s.plan?.studio) return { ...s, screen: 'studio' };
      // (older flow, kept for a dare FTUE plan still in flight: the full dared run follows the first heist)
      if (s.ftue && ctx.entry.kind === 'dare_link' && s.plan?.mode === 'ftue')
        return { ...s, screen: 'briefing', ftue: false, plan: planFor(ctx, entrySel(ctx.entry), false) };
      if (s.ftue) return { ...s, screen: 'home', ftue: false, readyRanked: !ctx.rankedDone(ctx.todayNo) };
      // never in a player's first session, at most one card per session (GDD 9.2)
      if (!s.offerShown && ctx.sessionIndex >= 2 && (ctx.offer?.() || ctx.presale)) return { ...s, screen: 'offer', offerShown: true, offerBack: 'home' };
      return { ...s, screen: 'home' };
    }
    case 'offer': {
      const from: Screen[] = ['home', 'archive', 'rooms', 'settings', 'cats', 'season', 'rapsheet'];
      if (s.offerShown || ctx.sessionIndex < 2 || !from.includes(s.screen)) return s;
      return { ...s, screen: 'offer', offerShown: true, offerBack: s.screen };
    }
    case 'offerDone':
      return s.screen === 'offer' ? { ...s, screen: s.offerBack ?? 'home', offerBack: undefined } : s;
    case 'open':
      if (s.screen === 'run' || s.screen === 'boot') return s;
      return { ...s, screen: e.screen, back: s.screen === 'rooms' || s.screen === 'rapsheet' || s.screen === 'settings' ? s.screen : 'home' };
    case 'sheet':
      if (s.screen === 'run' || s.screen === 'boot') return s;
      return { ...s, screen: 'sheet', sheet: e.sheet, back: s.screen === 'offer' || s.screen === 'sheet' ? 'home' : s.screen };
    case 'back':
      if (s.screen === 'run' || s.screen === 'boot') return s;
      // a side screen opened from My rooms, the Rap Sheet or Settings goes back there (one level)
      if ((s.back === 'rooms' || s.back === 'rapsheet' || s.back === 'settings') && s.screen !== s.back) return { ...s, screen: s.back, back: 'home', ftue: false };
      return { ...s, screen: 'home', ftue: false };
    case 'quit':
      if (s.screen !== 'run' && s.screen !== 'briefing') return s;
      // a playtest left early goes back to the maker (the editor gets null: not cleared)
      if (s.plan?.playtest) return { ...s, screen: 'maker' };
      if (s.plan?.household) return { ...s, screen: 'share', plan: s.hhPlan ?? s.plan, hhPlan: undefined };
      if (s.plan?.studio) return { ...s, screen: 'studio' };
      return { ...s, screen: 'home', ftue: false };
  }
}

/** Mutable wrapper the app shell uses; listeners fire after every transition that changes the screen or plan. */
export class Router {
  state: RouterState;
  private listeners: ((s: RouterState, prev: RouterState) => void)[] = [];

  constructor(readonly ctx: RouterCtx) {
    this.state = initialRouter(ctx);
  }
  on(fn: (s: RouterState, prev: RouterState) => void): void {
    this.listeners.push(fn);
  }
  /** QA only (VITE_BADCAT_QA): jump to a screen with a plan, as if the flow had led there. */
  jump(next: Partial<RouterState> & { screen: Screen }): void {
    const prev = this.state;
    this.state = { ...prev, ...next };
    for (const l of this.listeners) l(this.state, prev);
  }
  send(e: RouterEvent): boolean {
    const prev = this.state;
    const next = reduce(this.ctx, prev, e);
    if (next === prev) return false;
    this.state = next;
    for (const l of this.listeners) l(next, prev);
    return true;
  }
}
