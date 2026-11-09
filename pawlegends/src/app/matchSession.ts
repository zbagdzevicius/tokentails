/**
 * One match on the client: the LocalHost (sim Worker), the snapshot buffer, the match view, input (desktop and
 * touch), HUD, minimap, scoreboard, talents, first-match tips and the Esc menu. The app's frame loop calls
 * `frame(dt)`; the session calls back once with the result and the replay.
 */
import { setPvpEqualView } from '../render/camera/height';
import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import { matchVoiceKeys } from '../audio/voiceLines';
import { haptic } from '../ui/haptics';
import { intensityOf, Music } from '../audio/music';
import { LocalHost } from '../host/local-host';
import type { MatchHost } from '../host/protocol';
import type { WelcomeMsg } from '../host/protocol';
import { matchSpeedFor } from './mpTypes';
import { basicRange, maxCooldown } from '../input/abilities';
import { DesktopInput, type InputHost } from '../input/desktop';
import { Orders } from '../input/orders';
import { groundAt, project } from '../input/screen';
import { isEnemy, type Unit } from '../input/targeting';
import { TouchControls } from '../input/touch/touchControls';
import type { Companion } from '../meta/roster';
import { Tips } from '../onboarding/tips';
import { ObjectiveClock, Objectives, type BeatId } from '../onboarding/objectives';
import { Announcer, XpPops, type Moment } from '../render/announcer';
import { isFun, type AnyEvent } from '../render/feelEvents';
import type { GuideMode } from './firstSession';
import { cardLook, ELEMENT_COLOR, lookKey, type FrameId, type Look } from '../render/cosmetics';
import { setProbeBlocked } from '../render/skins/spriteProbe';
import { cardIdentity, cutName, heroSub, selfNames, tidyName, type CardIdentity } from '../meta/cardName';
import { coarsePointer } from './platform';
import { getSkin, isCardSkinId, putSkin, type CatSkin } from '../render/skins/skinStore';
import { eyesOf } from '../render/skins/registry';
import type { SkinFxMode } from '../render/skins/tierFx';
import { bakePortrait, portraitUrl } from '../render/portraits';
import { toX, toZ } from '../render/coords';
import { FADE, SHAPE } from '../render/fx/Particles.js';
import { LowHp } from '../render/fx/lowHp';
import { GameView } from '../render/gameView';
import { SnapBuffer, type ViewEntity, type ViewFrame } from '../render/interp';
import type { GameRenderer } from '../render/renderer';
import type { TierSettings } from '../render/quality';
import { HERO_SCALE } from '../render/views/models';
import { CORE, FOUNTAIN, MAP, PUDDING_SPOT, TOWER_SPOTS, mirrorX } from '../data/map';
import { PING_KIND } from '../data/pings';
import { TOWERS } from '../data/towers';
import { HEROES } from '../data/heroes';
import { TICK_HZ } from '../data/timeline';
import { BuffFlag, Op, type Difficulty, type EntitySnap, type HeroId, type MatchResult, type ReplayRecord, type SimEvent, type Snapshot, type TrickId } from '../sim/api';
import { HERO_TEXT, rankUpLines, slotNames, TRICK_TEXT } from '../ui/heroText';
import { headingPoint } from '../input/heading';
import { ProgressRail } from '../ui/progressRail';
import { DIFFICULTY_RULES } from '../data/bots';
import { FISH } from '../data/fish';
import { ultHint } from '../render/effects';
import { levelWhat } from '../ui/toyText';
import { icon } from '../ui/icons';
import { Hud, type FeedName } from '../ui/hud';
import { pingKindOfColor } from '../ui/pingGlyph';
import { resetStructures, syncStructures } from '../input/navMirror';
import { Minimap, laneNamed } from '../ui/minimap';
import { PingWheel } from '../ui/pingWheel';
import { chipPing } from '../ui/pingText';
import { Overhead } from '../ui/overhead';
import { Scoreboard, teamLabel } from '../ui/scoreboard';
import { Stage } from '../ui/stage';
import { TOWER_GLYPH } from '../ui/notify';
import { bannerNote } from '../render/juice';
import { menuScreen, RESULTS_AFTER_END_MS } from '../ui/screens';
import { CoreLog, endCause, type CoreSource } from './endCause';
import { TalentPicker } from '../ui/talents';

/** LoL pass (lane B): the end crest shows this long after the core falls (the camera eases there first), holds
 * CREST_HOLD_MS (QA v2 #4: 1.6 s was too short to read), and the results wait CREST_EXTRA_MS longer than
 * RESULTS_AFTER_END_MS for it (1.58 s added). */
const CREST_AT_MS = 900;
const CREST_HOLD_MS = 2400;
const CREST_EXTRA_MS = Math.max(0, CREST_AT_MS + CREST_HOLD_MS + 480 - RESULTS_AFTER_END_MS);
/**
 * `?e2e=1` only: hand Playwright a live object as `window.__pl<name>` (__plJuice, __plWorld, __plHud). Set through one
 * computed key, so the built files carry no `window.__` debug global literal (perf.spec "no debug hooks").
 */
function e2eHook(name: string, v: unknown): void {
  (window as unknown as Record<string, unknown>)[`__pl${name}`] = v;
}

/**
 * QA v2 #2: how often each coaching line may show in one match (the dive warning showed 15-25 times a match, lane help
 * 8 times). After that the player has heard it; the arrow and the ring still teach.
 */
const COACH_MAX: Readonly<Record<string, number>> = { dive: 3, 'lane-help': 3, 'cant-go': 2, tower: 4, comeback: 2 };
/** QA v2 #2: a COMEBACK / "They are rallying" line at most once per this long (ms of match time). */
const COMEBACK_GAP_MS = 60000;
/** "Go!" shows only when the first play snapshot is this close (ticks) to the last gate one (not after a catch-up). */
const GO_MAX_JUMP_TICKS = 15;
/** QA v2 #13: no lane help before this match clock (s): it fired at "Go!" and named two lanes in a few seconds. */
const LANE_HELP_FROM_S = 40;

/** LoL pass (lane B): the rail badge for big announcer lines that have no portrait (a gold crest). */
const LOL_CREST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 15.4l-5.3 2.7 1-5.8L3.5 8.2l5.9-.9z"/></svg>';

export interface MatchSetup {
  /**
   * UX pass 2: the player's in-game username (the Token Tails profile name, or the party display name), shown over
   * their own hero and in their scoreboard row, kill feed, death recap and results instead of "You" or the champion
   * title; the champion stays visible as the small line under it and in the portraits. Absent: "You". Bots keep
   * their persona names ("Biscuit the Clem").
   */
  playerName?: string | null;
  hero: HeroId;
  trick: TrickId;
  difficulty: Difficulty;
  seed?: number;
  speed?: number;
  firstMatch: boolean;
  muted: boolean;
  /** Fewer than five matches played: extra warnings (a tower is hitting you, lane arrow in the first match). */
  newPlayer?: boolean;
  /** The player owns the "Starter" emote (render only: a wave on the T key or the emote chip). */
  emote?: boolean;
  /** Render-only cosmetics for the player's hero, frame and title, and Companion Kittens. */
  look?: Look | null;
  frame?: FrameId | null;
  title?: string | null;
  companions?: readonly Companion[];
  /** Objective chips (fun plan F1): the Rookie script, the lite one (matches 2 and 3) or none. */
  guide?: GuideMode;
  /** The player has cast an ultimate in an earlier match: no "ULTIMATE READY" prompt any more. */
  knowsUlt?: boolean;
  /** Card skin effects (Settings: All / Mine only / Off; GDD §7.2). */
  skinFx?: SkinFxMode;
  /** Featured skin ids a showcase bot may wear (empty unless web, session 2+, not the first match). */
  showcase?: readonly string[];
  /** GAPS B1: the player's second match: one tip shows how to tell the team what to do (pings). */
  pingTip?: boolean;
  /**
   * GAPS B2: the pause menu offers Forfeit from this match tick (app/firstSession.ts forfeitTick: the sim's
   * DifficultyRules.forfeitFrom, 0 in matches 1–3 and on Rookie); 0 or absent = no Forfeit button.
   */
  forfeitFrom?: number;
  /** Party play: the host to drive (a NetHost); absent = the solo LocalHost. */
  host?: () => MatchHost;
  /** Party play: the session is one seat of a party match (§4.6 guards: no local pause or speed). */
  party?: {
    slot: number;
    names: readonly (string | null)[];
    rejoin?: boolean;
    /** The player has never finished a match: 2 or 3 control hints on the rail instead of the tutorial (§4.6). */
    newbie?: boolean;
    /** Settings' Hide names (friends read "Teammate 2"). */
    hideNames?: boolean;
    /** Quick Play co-op (M1A-IMPL.md): teammates are strangers; Leave match leaves the matched party. */
    coop?: boolean;
    /** This player took a leaver's seat mid-match (analytics). */
    backfill?: boolean;
    /** Casual PvP (V16.md §5): humans on both teams; slot 3 leads team 1 (its pings are sim commands). */
    pvp?: boolean;
  };
}

/**
 * GAPS B1: the ping tip of match 2 shows once the gates are open this long (ticks: 0:55). Not 1350 (0:45): that is
 * the first Frenzy Catnip, and its banner (with the rat camp's "Pack power!") pushed the tip out of the queue.
 */
const PING_TIP_TICK = 1650;
const PING_TIP_TITLE = 'Tell your team what to do';
/** LoL pass (lane B): how long the ping tip may wait behind announcer lines before it is dropped (ms, ÷ match speed). */
const PING_TIP_STALE_MS = 60_000;
/** Seconds the ping tip stays up: its text runs ~19 words, an ordinary banner's 2.1 s is too short to read it. */
const PING_TIP_HOLD = 5.5;

/** `?e2e=1&skins=legendary` (perf.spec.ts): every hero in a synthetic Legendary card skin. Never outside e2e. */
function e2eLegendary(): boolean {
  try {
    const q = new URLSearchParams(location.search);
    return q.get('e2e') === '1' && q.get('skins') === 'legendary';
  } catch {
    return false;
  }
}

function e2eSkin(slot: number): CatSkin {
  const els = ['FIRE', 'ICE', 'GRASS', 'WATER', 'DARK', 'STELLAR'] as const;
  const id = `cat.e2e${slot}`;
  return {
    id,
    catId: `e2e${slot}`,
    name: `Cat ${slot + 1}`,
    element: els[slot % els.length],
    tierRung: 'LEGENDARY',
    bond: 30,
    rung: 'LEGENDARY',
    coat: { pattern: slot % 2 ? 'tabby' : 'calico', base: 0xc8891a, deep: 0x3a2a20, light: 0xf0d8b0, cream: 0xfff3dc, patch: 0xe07a2a, stripe: 0.55 },
    eyes: eyesOf(0x8fd11e),
    earInner: 0xd58971,
    nose: 0x6a4438,
    rev: 0,
    source: 'family',
    order: slot,
  };
}

/** What the announcer saw (results screen, Treat Track, quests, analytics `pl_*`). */
export interface MatchFun {
  /** Seconds to the player's first takedown, or -1. */
  firstTakedownS: number;
  /** Seconds to level 4, or -1. */
  level4S: number;
  takedowns: number;
  combos: number;
  pickups: number;
  biggestMulti: number;
  shutdowns: number;
  /** Our team calmed Pudding. */
  pudding: boolean;
  /** Towers (and cores) our team took. */
  towers: number;
  /** The best moment's title ("Triple Pounce", "First Blood!"), or null. */
  best: string | null;
  /** The player's damage to enemy heroes (0 = never joined a fight). */
  heroDamage: number;
  /** The player cast its ultimate this match. */
  usedUlt: boolean;
}

export interface MatchEnd {
  result: MatchResult;
  replay: ReplayRecord;
  welcome: WelcomeMsg;
  kills: number;
  deaths: number;
  /** Round 1: K / D / A from the sim's own stats (one definition on the card, the quest and the personal best). */
  assists: number;
  level: number;
  teamKills: [number, number];
  /** First-match tips completed (analytics `tip_done`). */
  tips: string[];
  /** Real input events in the match (analytics human filter). */
  activity: number;
  /** What knocked the player out, by killer kind (hero, tower, minion, ...): the results tip reads it. */
  deathsBy: Record<string, number>;
  fun: MatchFun;
  /** Round 2: one line naming what decided the match ("Their minions broke our core in Sudden Death ..."). */
  cause?: string;
  /** Lane F (F5): the player's Fish by `fish` event reason (the results' Fish-by-source bar). */
  fishBy?: Record<string, number>;
}

export interface SessionHooks {
  onEnd(e: MatchEnd): void;
  onTalent?(tier: number, choice: number): void;
  /** Audit UX-03: `counted` = this leave is recorded as a forfeit loss (`leaveCounts`), with the match so far. */
  onLeave(counted?: { ticks: number; takedowns: number }): void;
  onMute(m: boolean): void;
  /** Audit UX-09: open Settings over the paused match; `done` brings the pause menu back. */
  onSettings?(done: () => void): void;
  onError(msg: string): void;
  onPaused?(p: boolean): void;
  /** Party play analytics (MULTIPLAYER.md §10, lane M8): flat props, never a party code or room id. */
  track?(event: string, props: Record<string, string | number | boolean>): void;
}

/** Round 2: "Can't go that way" repeats this often (ms) while the player stays blocked (12 s before). */
const STUCK_REPEAT_MS = 5000;

/** Round 2: "Defend!" instead of "Our core is under attack!" when the player is further than this from it (mm). */
const DEFEND_FAR_MM = 40000;

/** The attack tip fires at the latest this many match seconds in (the first wave spawns at 0:30). */
const TIPS_FIRST_WAVE_S = 36;

const killerName = (who: { kind: string; hero?: HeroId } | null): string => {
  if (!who) return 'Someone';
  if (who.kind === 'hero' && who.hero) return HERO_TEXT[who.hero].title;
  if (who.kind === 'tower') return 'A tower';
  if (who.kind === 'core') return 'The core';
  if (who.kind === 'fountain') return 'The fountain';
  if (who.kind === 'minion') return 'Minions';
  if (who.kind === 'pudding') return 'Pudding';
  return 'Rats';
};

/**
 * Round 1 ("'Your team is behind' appeared while my team led on takedowns"): say what "behind" means. Towers count 3
 * takedowns each in the gap, so a team ahead on takedowns can trail on towers. Pure.
 */
export function behindBanner(kOurs: number, kTheirs: number, tOurs: number, tTheirs: number): { title: string; sub: string; tone: 'info' } {
  const towers = (n: number): string => `${n} tower${n === 1 ? '' : 's'}`;
  if (tTheirs > tOurs && kOurs >= kTheirs) return { title: `They took ${towers(tTheirs)} to your ${tOurs}`, sub: 'Push a lane with your minions!', tone: 'info' };
  if (tTheirs > tOurs) return { title: `They lead: ${towers(tTheirs)} to ${tOurs}`, sub: 'Group up and push a lane together.', tone: 'info' };
  return { title: `They lead ${kTheirs} to ${kOurs} on takedowns`, sub: 'Group up with your team and fight together.', tone: 'info' };
}

/** Feel pass B5: how long (ms, match time) the own plate reads "You" after the start. */
export const YOU_LABEL_MS = 10_000;
/** Feel pass B3: the touch target-lock row: enemies within this × the attack range, at most NEAR_ROW_MAX. */
export const NEAR_ROW_K = 1.5;
export const NEAR_ROW_MAX = 3;
/** Feel pass B3: the top strip's objective timer shows from `before` s ahead of the spawn to `after` s past it. */
export const OBJ_STRIP = Object.freeze({ before: 10, after: 3 });
/** Feel pass B2: how long (ms) the "Your base: bottom left" toast shows at the start. */
export const BASE_TOAST_MS = 1200;

export class MatchSession {
  readonly host: MatchHost;
  readonly buffer = new SnapBuffer();
  readonly view: GameView;
  readonly ui: HTMLElement;
  /** Round 1: one centre-screen item at a time (ui/stage.ts). */
  readonly stage: Stage;
  private orders: Orders | null = null;
  private desktop: DesktopInput | null = null;
  private touch: TouchControls | null = null;
  /** GAPS B1: the ping wheel (desktop G, touch paw button), the paw button, and whether the match-2 tip showed. */
  private pingWheel: PingWheel | null = null;
  private pingBtn: HTMLButtonElement | null = null;
  private pingTipShown = false;
  private hud: Hud | null = null;
  /** Champion browser: the long-press skill peek on the own skill buttons (its detach), loaded after the HUD. */
  private peekOff: (() => void) | null = null;
  private overhead: Overhead;
  /** LoL pass (lane C): the persistent low-health vignette (made on the first body tick). */
  private lowHp: LowHp | null = null;
  private minimap: Minimap;
  private scoreboard: Scoreboard | null = null;
  private talents: TalentPicker | null = null;
  private tips: Tips;
  private goals: Objectives;
  /** GAPS A4: the next objective and its timers (snapshots and events only). */
  private objClock: ObjectiveClock | null = null;
  private announcer: Announcer | null = null;
  private readonly xpPops = new XpPops();
  /** Lane F (F2, F3): the level-up and Toy lines on the rail (one item when they land within 2 s). */
  private readonly progress = new ProgressRail();
  /** Lane F (F5): the player's Fish by source from its own `fish` events (the trickle is the rest of SlotStats.fish). */
  private readonly fishBy: Record<string, number> = {};
  /** Lane F (F4): the newest kill-feed row of a takedown by our team (its killer's Fish lands in the same tick). */
  private feedRow: { tick: number; killer: number; el: HTMLElement; fish: number } | null = null;
  /** Lane F (F6): the underdog line shows once a match. */
  private underdogSaid = false;
  private readonly music = new Music();
  private towersTaken = 0;
  private coreHitAt = -1e9;
  private lowAt = -1e9;
  private wasLow = false;
  private trailAt = 0;
  private napFxAt = 0;
  private menu: HTMLElement | null = null;
  private welcome: WelcomeMsg | null = null;
  private units: Unit[] = [];
  private frameNow: ViewFrame | null = null;
  private events: SimEvent[] = [];
  private ended = false;
  private paused = false;
  private scoreOn = false;
  private muted: boolean;
  private lastLevel = 1;
  /** Wave C (C2): the own hero's talent picks from the latest snapshot (the talent card shows numbers with them). */
  private lastTalents: readonly number[] = [-1, -1, -1];
  private disposed = false;
  private deathsBy: Record<string, number> = {};
  /** Display names by slot ("Clem 2" for a team's second Clem). */
  private names: string[] = [];
  /** Party play (lane M): the party HUD (its own lazy chunk), once loaded. */
  private mp: import('./mpHud').MpHud | null = null;
  /** Count of real input events (analytics human filter). */
  activity = 0;
  /** The player's hits that landed (e2e telemetry). */
  private hitsLanded = 0;
  /** Card skin cat names by slot ('' = none): the scoreboard's "<Hero> · <cat>". */
  private catNames: string[] = [];
  /** Lobby spec §3b: the owned card the player's champion wears (its name replaces the hero title), or null. */
  private myCard: CardIdentity | null = null;
  /** UX pass 2: the player's username, cleaned and cut to 14 characters (setup.playerName), or null. */
  private selfName: string | null = null;
  /** pawlegends: the card worn this match, as the match named it (the results screen keeps that name, QA). */
  get card(): CardIdentity | null {
    return this.myCard;
  }
  /** UX pass 2: the username this match showed for the player (results name their row after it), or null. */
  get playerName(): string | null {
    return this.selfName;
  }
  /** `?e2e=1`: mirror a few facts into html data attributes for Playwright (one window global: `__plJuice`, the rail). */
  private readonly e2e = (() => {
    try {
      return new URLSearchParams(location.search).get('e2e') === '1';
    } catch {
      return false;
    }
  })();

  constructor(
    private readonly gr: GameRenderer,
    parent: HTMLElement,
    private readonly setup: MatchSetup,
    private readonly hooks: SessionHooks,
  ) {
    this.muted = setup.muted;
    this.ui = document.createElement('div');
    this.ui.className = 'pl-match';
    parent.appendChild(this.ui);
    this.stage = new Stage(this.ui);
    // a match uses the skin palettes cached at its start: no sprite probes until it ends
    setProbeBlocked(true);
    this.view = new GameView(gr, this.ui, {
      onKill: (e, victim, killer) => this.onKill(e, victim, killer),
      onTalentOffer: (tier) => this.talents?.offer(tier, this.inFight()),
      onLevel: (lv) => {
        this.lastLevel = lv;
        this.hud?.levelUp(lv);
        if (lv < 4) return false;
        // one channel: the first-match tip, else the goal chip (the lite guide), else effects' banner; none for a
        // player who has cast an ultimate before
        if (this.tips.enabled) {
          this.tips.trigger('ult');
          return true;
        }
        if (this.goals.enabled && !this.setup.knowsUlt) {
          this.goals.start('ult');
          return true;
        }
        return !!this.setup.knowsUlt;
      },
      levelNote: (lv, guided) => {
        // Lane F (F3): "Level 4 — Ultimate unlocked!" (with how to cast it on desktop when no tip or chip guides it)
        // Fun pass (playtest #5): a tip or goal chip that guides the ult already says "Level 4!": no second line
        if (lv === 4 && guided) return true;
        const touch = document.documentElement.dataset.touch === '1';
        // feel pass B3: on desktop the HUD's "Rank up!" card already shows a level-up: no second line (level 4 keeps it:
        // it says how to cast the ultimate)
        if (!touch && lv !== 4) {
          // (recorded as said: the card shows it)
          this.view.juice.note(`Level ${lv}`);
          return true;
        }
        const what = levelWhat(lv, touch);
        const ranks = touch ? [] : rankUpLines(this.welcome?.picks[this.view.mySlot] ?? 'clem', lv, this.lastTalents);
        const sub = lv === 4 && !guided ? ultHint() : ranks.join(' · ') || undefined;
        this.view.juice.push(this.progress.level({ level: lv, what, ...(sub ? { sub } : {}) }, this.frameNow?.latest.clock.tick ?? 0));
        return true;
      },
      onWindupAtMe: () => this.tips.trigger('dodge'),
      onTowerAim: (src, ticks) => {
        this.overhead.lockOn(src, this.view.mySlot, ticks / 30 / Math.max(1, this.buffer.speed));
        this.towerHit(src, true);
      },
      onTowerDown: (ours) => {
        if (ours) {
          this.towersTaken++;
          this.goals.start('push');
        }
      },
      onCoreDown: (who) => {
        // look at the falling core (the slow-mo comes from effects); feel pass B1: no zoom, the framing stays fixed
        this.view.lookAt(who.x, who.z, 10);
      },
    });
    this.view.juice.stage = this.stage;
    this.view.juice.speed = matchSpeedFor(!!setup.party, setup.speed);
    // casual PvP: the same zoom limits on every seat (V16.md §5 Camera)
    setPvpEqualView(setup.party?.pvp === true);
    // e2e (rail.spec.ts): the juice instance, to push one note of each priority
    if (this.e2e) e2eHook('Juice', this.view.juice);
    // ANIM-SPEC §4.1: the animation director binds clips to events a few frames before they fire (read-only peek)
    this.view.peek = (h, out) => this.buffer.peekEvents(h, out);
    this.overhead = new Overhead(this.ui);
    // plates over the drawn bodies (the view pushes overlapping heroes apart, render only)
    this.overhead.heroAt = (id) => this.view.heroes.rigOf(id)?.ch.object.position ?? null;
    // minion bars over the drawn bodies, none for a minion the view does not draw (render only)
    this.overhead.minionAt = (id) => this.view.minions.drawnAt.get(id) ?? null;
    this.overhead.goldPlate = setup.frame === 'frame.legendary';
    // LoL pass (lane C), e2e only: the view, the overhead bars and the low-health vignette for the in-world checks
    // lane F: `inject` runs one event through the client's event path (effects, feel, announcer), e2e only: the
    // progression spec shows a Toy buy and a last-hit Fish pop without playing minutes of farm first
    if (this.e2e)
      e2eHook('World', {
        view: this.view,
        overhead: this.overhead,
        lowHp: () => this.lowHp,
        inject: (ev: SimEvent) => {
          this.view.effects.handle(ev);
          this.feelEvent(ev);
          if (this.announcer) this.present(this.announcer.feed(ev));
        },
      });
    resetStructures();
    this.minimap = new Minimap(this.ui, {
      peekHold: (x, z) => this.view.peekHold(x, z),
      peekEnd: () => this.view.peekEnd(),
      moveTo: (x, y) => this.orders?.move(x, y),
      viewQuad: () => this.viewQuad(),
      mySlot: () => this.view.mySlot,
      myTeam: () => this.view.myTeam,
      goHere: (x, y) => this.sendPing(PING_KIND.GoHere, x, y),
    });
    // feel pass B2 (e2e): the minimap, to find a tower's pixel on the turned map
    if (this.e2e) e2eHook('Minimap', this.minimap);
    this.applyPerf(this.gr.settings);
    this.tips = new Tips(this.view.juice.notify, setup.firstMatch);
    this.goals = new Objectives(this.view.juice.notify, setup.guide ?? 'off');
    this.minimap.pickups = () => this.view.pickups.list();
    this.minimap.timers = () => this.objClock?.timers() ?? [];
    // GAPS A4 / B1: a tap on the objective chip sends its ping (Take Pudding, Group on me, Go here at a camp)
    this.goals.onTap = (key) => {
      if (this.e2e) document.documentElement.dataset.chipTap = key;
      const kind = chipPing(key);
      if (kind === null) return;
      const chip = this.objClock?.chip();
      const me = this.units.find((u) => u.id === this.view.mySlot);
      this.sendPing(kind, chip?.x ?? me?.x ?? MAP.width / 2, chip?.y ?? me?.y ?? MAP.height / 2);
    };
    // Party play (MULTIPLAYER.md §4.1): a NetHost from the party chunk; solo keeps the LocalHost.
    this.host = setup.host ? setup.host() : new LocalHost();
    // party play (§4.6): the relay's clock sets the pace; a speed is refused
    this.buffer.speed = matchSpeedFor(!!setup.party, setup.speed);
    this.host.listen({
      welcome: (w) => this.onWelcome(w),
      snap: (s) => {
        this.buffer.push(s);
        this.simOwn(s);
        if (this.e2e) this.trackOwn(s);
      },
      events: (_t, list) => {
        this.buffer.pushEvents(list);
        this.rawOwnEvents(list);
      },
      end: (result, replay) => this.onEnd(result, replay),
      error: (m) => hooks.onError(m),
    });
    this.host.join({ hero: setup.hero, trick: setup.trick, difficulty: setup.difficulty, seed: setup.seed, speed: setup.speed });
    // Hold the sim until the scene has drawn and the countdown ran (the clock read 0:25 on a slow first load).
    this.host.pause(true);
    document.documentElement.dataset.match = 'loading';
    delete document.documentElement.dataset.endReason;
    delete document.documentElement.dataset.crest;
  }

  /** Party play: a note on the top rail (MULTIPLAYER.md §7: every in-match message goes there). */
  rail(n: { key: string; title: string; tone: 'good' | 'bad' | 'gold' | 'info'; ttl?: number }): void {
    this.view.juice.notify.push({ key: n.key, title: n.title, tone: n.tone, prio: 2, ...(n.ttl ? { ttl: n.ttl } : {}) });
  }

  get matchId(): string | null {
    return this.welcome?.matchId ?? null;
  }

  private onWelcome(w: WelcomeMsg): void {
    this.welcome = w;
    // perf-2: which loop runs this match and how many Worker starts failed first (e2e reads it)
    if (this.e2e) document.documentElement.dataset.simHost = `${this.host.kind}:${this.host.restarts}`;
    this.view.setTeam(w.slot, w.team, w.tricks);
    // C6: the own hero is drawn at a much shorter interpolation lag than everyone else
    this.buffer.selfId = w.slot;
    // ANIM-SPEC §13: the heroes' move sets and skill FX load with the match (their own lazy chunks)
    void this.view.loadAnim(w.picks);
    this.objClock = new ObjectiveClock(w.team);
    this.view.setSpecies(HEROES[w.picks[0]]?.side === 'dog');
    const shown = this.view.dressBots(w.seed, w.picks, this.setup.showcase ?? []);
    this.view.dress(this.setup.look ?? null, this.setup.companions ?? []);
    this.view.setSkinFx(this.setup.skinFx ?? 'all');
    if (this.e2e && e2eLegendary()) {
      for (let slot = 0; slot < w.picks.length; slot++) {
        const sk = e2eSkin(slot);
        putSkin(sk);
        this.view.heroes.looks.set(slot, cardLook(sk.id));
      }
    }
    // card skins: the player's own plate names the cat (only the own plate: plates stack in fights); everyone else's
    // cat shows on the scoreboard only
    const mine = isCardSkinId(this.setup.look?.coat) ? getSkin(this.setup.look?.coat) : null;
    // lobby spec §3b: an owned card renames the player's champion ("Simas"); its plate then reads the cat's name
    // instead of "You" over a small cat line (the self chevron and colour still mark it as yours)
    const myCard = cardIdentity(w.picks[w.slot], this.setup.look);
    this.myCard = myCard;
    // UX pass 2: a username names the own plate (over the champion: "Clem", or the worn cat and the champion)
    const user = this.setup.playerName ? cutName(tidyName(this.setup.playerName), 14) || null : null;
    this.selfName = user;
    const heroTitle = HERO_TEXT[w.picks[w.slot]]?.title ?? '';
    if (myCard || user) this.overhead.selfName = true;
    this.overhead.catName = user ? (myCard ? `${myCard.name} · ${heroTitle}` : mine?.name ? `${mine.name} · ${heroTitle}` : heroTitle) : myCard ? null : (mine?.name ?? null);
    if (this.e2e) document.documentElement.dataset.selfName = user ?? '';
    this.overhead.plateGem = mine?.rung === 'LEGENDARY' ? `#${ELEMENT_COLOR[mine.element].toString(16).padStart(6, '0')}` : null;
    this.catNames = w.picks.map((_, slot) => (slot === w.slot ? (mine?.name ?? '') : (shown.get(slot) ?? '')));
    this.overhead.mySlot = w.slot;
    this.overhead.myTeam = w.team;
    const hero = w.picks[w.slot];
    const trick = w.tricks[w.slot];
    const env = {
      send: (cmd: Parameters<LocalHost['send']>[0]) => this.host.send(cmd),
      units: () => this.units,
      meId: w.slot,
      hero,
      trick,
      cooldowns: () => this.frameNow?.byId.get(w.slot)?.cooldowns ?? null,
      level: () => this.frameNow?.byId.get(w.slot)?.level ?? 1,
      branch: () => this.frameNow?.byId.get(w.slot)?.branch === true,
      nowMs: () => performance.now(),
      // UX pass 2: the flash reads readiness and windups from the newest snapshot (the drawn frame trails it)
      simOwn: () => this.ownNewest,
      // C2: a buffered cast that never found a free moment: the deny sound and the button's red flash only now
      onDeny: (slot: 0 | 1 | 2 | 3 | 4) => {
        if (this.touch?.isEnabled) this.touch.deny(slot);
        else {
          sfx.play('deny', { vol: 0.6 });
          this.hud?.deny(slot);
        }
      },
    };
    this.orders = new Orders(env);
    this.orders.speed = this.buffer.speed;
    this.pingWheel = new PingWheel(this.ui);
    this.pingWheel.onPick = (kind) => this.wheelPing(kind);
    const inputHost: InputHost = {
      canvas: this.gr.renderer.domElement,
      view: this.view,
      orders: this.orders,
      enabled: () => !this.ended && !this.paused && !this.talentsBlock(),
      units: () => this.units,
      onScoreboard: (on) => {
        this.scoreOn = on;
        this.scoreboard?.show(on, this.frameNow);
      },
      onMenu: () => (this.menu ? this.resume() : this.openMenu()),
      onTalent: (c) => this.talents?.pick(c) ?? false,
      onActivity: () => {
        this.activity++;
      },
      marker: (x, z, attack) => this.marker(x, z, attack),
      pingWheel: this.pingWheel,
      ping: (kind, x, y, id) => this.sendPing(kind, x, y, id),
      // party play: while the own hero's predicted walk is in flight, the walker is where a command sent now lands
      // (the newest snapshot is a round trip behind it); the tick stays the snapshot's
      simMe: () => {
        const p = this.ownSim ? this.host.predictedSelf?.() : null;
        return p && this.ownSim ? { x: p.x, y: p.y, tick: this.ownSim.tick } : this.ownSim;
      },
      // Audit CF-12: a refused desktop cast flashes its HUD slot red
      onDeny: (slot) => this.hud?.deny(slot),
    };
    this.desktop = new DesktopInput(inputHost);
    this.touch = new TouchControls(inputHost, this.ui, this.desktop);
    // the Mac app plays with keyboard and mouse even if WebKit ever reports a coarse pointer (app/platform.ts)
    const coarse = coarsePointer();
    this.touch.enable(coarse);
    const ht = HERO_TEXT[hero];
    this.touch.setIcons({ q: icon(ht.abilities[0].icon), w: icon(ht.abilities[1].icon), e: icon(ht.abilities[2].icon), r: icon(ht.abilities[3].icon), trick: icon(TRICK_TEXT[trick].icon) });
    this.tips.touch = coarse;
    this.tips.padMode = () => this.desktop?.padMode;
    this.tips.names = { q: ht.abilities[0].name, e: ht.abilities[2].name, r: ht.abilities[3].name };
    this.goals.touch = coarse;
    this.goals.names = { q: ht.abilities[0].name, r: ht.abilities[3].name };
    // sim v5 species teams: a hero twice in one team, the second one is "Sage 2" (one table for every label)
    this.names = selfNames(slotNames(w.picks, w.seed, w.slot), w.slot, user ? { name: user } : myCard);
    if (this.e2e) document.documentElement.dataset.plateNames = this.names.join('|');
    this.announcer = new Announcer(w.slot, w.team, (s) => this.names[s] ?? 'A hero', (s) => w.picks[s]);
    // LoL pass (lane B): an Ace reads who is out from the latest snapshot (an enemy out of sight counts by its timer)
    this.announcer.down = (slot) => {
      const e = this.frameNow?.byId.get(slot);
      if (e) return e.state === 'dead';
      return this.hud?.stripOut(slot) ?? false;
    };
    this.overhead.names = this.names;
    this.overhead.bounty = (slot) => {
      const snap = this.frameNow?.byId.get(slot)?.bountyStreak ?? 0;
      return Math.max(this.announcer?.bounty(slot) ?? 0, snap >= 3 ? snap : 0);
    };
    this.music.start();
    // the announcer's lines for this match (its six heroes' lines too), fetched and decoded before they are needed
    sfx.preloadVoice(matchVoiceKeys(w.picks));
    if (this.setup.look) bakePortrait(this.gr, hero, this.setup.look);
    this.hud = new Hud(this.ui, hero, trick, {
      onSlot: (i) => {
        const me = this.units.find((u) => u.id === w.slot);
        if (!me || !this.orders) return;
        if (i === 5) {
          this.orders.nap();
          return;
        }
        const slot = i as 0 | 1 | 2 | 3 | 4;
        const spec = this.orders.aimSpec(slot);
        // a heading blink or dash (Pounce, the escape dashes): its full distance where the hero is heading, not 2 m
        const a = spec.heading && this.touch ? this.touch.heading(me, spec) : (this.view.me()?.yaw ?? 0);
        const p = spec.heading ? headingPoint(spec, me, a) : { x: me.x + Math.cos(a) * 2000, y: me.y + Math.sin(a) * 2000 };
        this.orders.cast(slot, p.x, p.y);
      },
      onPortrait: (slot) => {
        this.touch?.lockOn(slot);
      },
      // GAPS B1: a held enemy portrait pings Focus hero on it
      onPortraitHold: (slot) => {
        const u = this.units.find((x) => x.id === slot);
        if (u && u.state !== 'dead') this.sendPing(PING_KIND.Focus, u.x, u.y, slot);
      },
      // desktop skill tooltips: the hovered slot's range in the world (never a cast); the portrait shows the attack ring
      onHover: (slot) => {
        this.desktop?.previewSlot(slot !== null && slot >= 0 && slot <= 4 ? (slot as 0 | 1 | 2 | 3 | 4) : null);
        this.desktop?.previewAttack(slot === -1);
        if (this.e2e) document.documentElement.dataset.slotTip = slot === null ? '' : String(slot);
      },
    }, this.setup.look ?? null, this.setup.difficulty);
    // GAPS A4 / A5: the other heroes' portraits with death timers; a tap on an enemy one locks it on touch
    this.hud.mountStrip(w.picks, w.slot, w.team, this.names);
    // champion browser: hold an own skill button to read its card (no pause, the input is untouched); own chunk
    void import('../ui/champBrowser/skillPeek')
      .then((m) => {
        if (this.disposed) return;
        this.peekOff = m.attachSkillPeek(this.ui, hero, () => this.hud?.codexState() ?? { level: 1, choices: [], branch: false });
      })
      .catch(() => undefined);
    // lobby spec §3b: the worn card's name rides on the HUD portrait too ("Ficus · Clem")
    this.hud.setSelfName(this.selfName ?? myCard?.name ?? null);
    // LoL pass (lane B): e2e reaches the HUD (the crest, the kill feed) the way it reaches the rail
    if (this.e2e) e2eHook('Hud', this.hud);
    const portrait = this.ui.querySelector<HTMLElement>('.pl-portrait');
    if (portrait && this.setup.frame) portrait.dataset.frame = this.setup.frame;
    if (portrait && this.setup.title) portrait.dataset.title = this.setup.title;
    if (this.e2e) {
      const d = document.documentElement.dataset;
      d.matchLook = lookKey(this.setup.look);
      d.matchFrame = this.setup.frame ?? '';
      d.kittens = String(this.view.companions?.count ?? 0);
      d.squadNames = (this.setup.companions ?? []).slice(0, 2).map((c) => c.name).join(',');
      // GAPS A3 (rematch.spec.ts): what Run it back must keep (hero, trick, difficulty) and change (the seed)
      d.matchPick = `${this.setup.hero},${this.setup.trick},${this.setup.difficulty}`;
      d.matchSeed = String(w.seed);
    }
    // feel pass art: the match's stickers ("Back in N") follow the player's side
    this.ui.dataset.side = HEROES[w.picks[w.slot]]?.side === 'dog' ? 'dog' : 'cat';
    // a renamed champion's row reads "Simas · Clem (you)": the hero title takes the cat column (the VS keeps the cat)
    this.scoreboard = new Scoreboard(this.ui, w.picks, w.slot, this.names, this.catNames.map((c, slot) => (slot === w.slot && (this.myCard || this.selfName) ? heroTitle : c)));
    // cards: the VS intro (both teams as Token Tails cards flipping up over the held countdown); its own lazy chunk,
    // skipped in e2e unless ?vs=1 and at test speeds
    if ((!this.e2e || /[?&]vs=1/.test(location.search)) && Math.max(1, this.buffer.speed) === 1) {
      const vsPortrait = this.setup.look ? portraitUrl(hero, this.setup.look) : null;
      void import('../ui/cards/vs')
        .then((m) => {
          // a chunk that lands after the count reached "1" would cover the match start: skip it then
          if (!this.disposed && !this.vsDone) m.showVsIntro(this.ui, { picks: w.picks, mySlot: w.slot, names: this.names, cats: this.catNames, myPortrait: vsPortrait, myTier: mine?.rung ?? null, meName: this.selfName ?? this.myCard?.name ?? null, meSub: this.myCard?.sub ?? (this.selfName ? heroSub(hero) : null), teamNames: [teamLabel(w.picks, 0), teamLabel(w.picks, 1)] });
        })
        .catch(() => undefined);
    }
    // cards: carded heroes' card flourish in the world (respawn flip-up, Epic+ twinkle), a TierFx extension chunk
    void import('../render/skins/tierCardFx').then((m) => m.installCardFlourish()).catch(() => undefined);
    // nature: a carded hero's card element as a few body motes (embers, frost, sparks, ...), a TierFx extension chunk
    void import('../render/nature/matchNature').then((m) => m.installNature()).catch(() => undefined);
    this.scoreboard.root.addEventListener('pointerdown', (e) => {
      if (!this.scoreboard?.root.classList.contains('tap')) return;
      e.stopPropagation();
      this.showScores(false);
    });
    this.mountTouchChrome();
    if (this.setup.party) this.mountParty(w);
    this.talents = new TalentPicker(this.ui, hero, (tier, choice) => {
      this.orders?.talent(tier, choice);
      this.hooks.onTalent?.(tier, choice);
      sfx.play('click');
    }, () => ({ level: this.lastLevel, talents: this.lastTalents }));
    // a talent that comes mid-fight waits behind the glowing portrait: a tap opens it (round 0)
    const pic = this.ui.querySelector<HTMLElement>('.pl-portrait');
    this.talents.onWait = (on) => pic?.classList.toggle('talent-ready', on);
    pic?.addEventListener('pointerdown', (e) => {
      if (!this.talents?.waiting) return;
      e.stopPropagation();
      e.preventDefault();
      this.talents.reveal();
    });
    // wrap the orders so tips see what the player does
    const o = this.orders;
    const cast = o.cast.bind(o);
    o.cast = (slot, x, y, id) => {
      const ok = cast(slot, x, y, id);
      if (ok) {
        this.hud?.pulse(slot);
        if (slot === 0) this.tips.complete('q');
        if (slot === 2) {
          if (this.tips.isActive('dodge')) this.view.juice.callout('Purrfect!', 'gold');
          this.tips.complete('dodge');
        }
        if (slot === 3) {
          this.usedUlt = true;
          this.tips.complete('ult');
          this.goals.complete('ult');
        }
      }
      return ok;
    };
    const attack = o.attack.bind(o);
    o.attack = (id) => {
      attack(id);
      if (this.units.find((u) => u.id === id)?.kind === 'minion') this.tips.complete('attack');
    };
    const move = o.move.bind(o);
    o.move = (x, y) => {
      move(x, y);
      this.tips.complete('move');
      this.gateNote();
    };
    const amove = o.attackMove.bind(o);
    o.attackMove = (x, y) => {
      amove(x, y);
      this.gateNote();
    };
    if (this.setup.emote) this.mountEmote();
    if (this.setup.party?.rejoin) {
      // party play (MULTIPLAYER.md §4.5): a rejoin mid-match has no countdown; the rail shows the catch-up instead
      this.vsDone = true;
      this.ui.querySelector('.tt-vs')?.classList.add('out');
      this.host.pause(false);
      document.documentElement.dataset.match = 'live';
      this.mpLive = true;
      this.mp?.start();
    } else
      this.countdown(() => {
        document.documentElement.dataset.match = 'live';
        this.mpLive = true;
        this.mp?.start();
        this.baseToast();
        // feel pass B5: the own "You" label and arrow go after the first 10 s (the gold ring marks the hero)
        this.youTimer = setTimeout(() => {
          this.youTimer = undefined;
          if (this.overhead && !this.disposed) this.overhead.youLabel = false;
        }, YOU_LABEL_MS / Math.max(1, this.buffer.speed));
        setTimeout(() => this.tips.trigger('move'), 5000 / Math.max(1, this.buffer.speed));
      });
  }

  /**
   * Feel pass B2: the map is diagonal and each seat sees its own base bottom left, so the start says so for 1.2 s
   * (a team-1 seat is told the map is turned, as Wild Rift does for the red side).
   */
  private baseToast(): void {
    const el = document.createElement('div');
    el.className = 'pl-basetoast';
    const hero = this.welcome?.picks[this.view.mySlot];
    el.dataset.side = hero && HEROES[hero]?.side === 'dog' ? 'dog' : 'cat';
    el.setAttribute('role', 'status');
    const turned = this.view.myTeam === 1;
    el.innerHTML = `<i class="stk" aria-hidden="true"></i><span><b>Your base: bottom left</b>${turned ? '<small>(map turned)</small>' : ''}</span>`;
    this.ui.appendChild(el);
    if (this.e2e) document.documentElement.dataset.baseToast = turned ? 'turned' : 'base';
    setTimeout(() => el.remove(), BASE_TOAST_MS);
  }

  private gateNoteAt = -1e9;
  /** Feel pass B5: the timer that hides the own "You" label after YOU_LABEL_MS (cleared on dispose). */
  private youTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Round 1 ("a move order in the first seconds is dropped"): it is not dropped, the gate barrier holds every hero at
   * its 8 m line until 0:03. Say so over the hero instead of looking like an ignored click.
   */
  private gateNote(): void {
    const clock = this.frameNow?.latest.clock;
    if (!clock || clock.phase !== 'gate') return;
    const now = performance.now();
    if (now - this.gateNoteAt < 1200) return;
    this.gateNoteAt = now;
    const left = Math.max(1, Math.ceil(clock.nextPhaseIn / TICK_HZ));
    // LoL pass (lane A): on the top rail, never over the hero
    this.view.juice.push({ key: 'gate-order', title: `Gates open in ${left}...`, tone: 'info', prio: 4, cooldown: 3000 });
  }

  private talentsBlock(): boolean {
    return false;
  }

  private onKill(e: Extract<SimEvent, { type: 'death' }>, victim: { kind: string; hero?: HeroId; team: number } | null, killer: { kind: string; hero?: HeroId; team: number } | null): void {
    // LoL pass (lane B): the announcer says a tower falling (the rail line comes from effects.ts)
    if (victim?.kind === 'tower') sfx.voice(victim.team === this.view.myTeam ? 'ourTurret' : 'turret');
    if (!victim || victim.kind !== 'hero') {
      if (victim?.kind === 'minion' && e.killer === this.view.mySlot) {
        this.tips.complete('attack');
        this.goals.complete('minions');
      }
      return;
    }
    this.scoreboard?.death(e.id, e.killer);
    if (e.id === this.view.mySlot) {
      const k = killer?.kind ?? 'other';
      this.deathsBy[k] = (this.deathsBy[k] ?? 0) + 1;
      this.clearTowerWarnings();
      this.hud?.recap(this.recapLine(killer, e.killer));
    }
    const good = victim.team !== this.view.myTeam;
    const rel = (team: number | undefined, id: number): FeedName['rel'] =>
      id === this.view.mySlot ? 'self' : team === 2 || team === undefined ? 'neutral' : team === this.view.myTeam ? 'ally' : 'enemy';
    const self = this.selfName ?? this.myCard?.name ?? 'You';
    const victimName = e.id === this.view.mySlot ? self : (this.names[e.id] ?? (victim.hero ? HERO_TEXT[victim.hero].title : 'A hero'));
    const killerLabel = e.killer === this.view.mySlot ? self : killer?.kind === 'hero' && this.names[e.killer] ? this.names[e.killer] : killerName(killer);
    // cards: heroes carry their face (an element-ringed portrait) into the kill feed
    const row = this.hud?.kill(
      { name: killerLabel, rel: rel(killer?.team, e.killer), ...(killer?.kind === 'hero' && killer.hero ? { hero: killer.hero } : {}) },
      { name: victimName, rel: rel(victim.team, e.id), ...(victim.hero ? { hero: victim.hero } : {}) },
      good,
    );
    if (row && good && e.killer >= 0 && e.killer < 6) this.feedRow = { tick: e.tick, killer: e.killer, el: row, fish: 0 };
  }

  private chromeOff: (() => void) | null = null;

  /**
   * Touch has no Esc or Tab: a pause button at the top (menu with Scores, Sound, Leave), a tap on the score bar
   * shows the scoreboard, and turning the phone to portrait pauses the bot match (the rotate prompt covers it).
   */
  /**
   * GAPS B1: send a command ping (the client debounce in Orders holds one sent too soon; the paw button greys out
   * meanwhile). The sim's `ping` and `bark` events come back and the announcer shows them.
   */
  private sendPing(kind: number, x: number, y: number, id?: number): boolean {
    if (!this.orders || this.ended || this.paused) return false;
    // party play (§7 M2): slots 1 and 2 ping socially (markers only; the leader's pings command the bots in the sim)
    if (this.setup.party && !this.isLead()) {
      const ok = this.mp?.ping(kind, x, y, id) ?? false;
      if (!ok) sfx.play('deny', { vol: 0.5 });
      else sfx.play('click', { vol: 0.6 });
      if (this.e2e && ok) document.documentElement.dataset.pingsSent = String(Number(document.documentElement.dataset.pingsSent ?? 0) + 1);
      return ok;
    }
    const ok = this.orders.ping(kind, x, y, id);
    if (!ok) sfx.play('deny', { vol: 0.5 });
    if (this.e2e) document.documentElement.dataset.pingsSent = String(this.orders.pings);
    return ok;
  }

  /** A wheel slice: where its ping points (the marker only; the bots read the kind). */
  private wheelPing(kind: number): void {
    const team = this.view.myTeam;
    const me = this.units.find((u) => u.id === this.view.mySlot);
    const side = (x: number): number => (team === 0 ? x : mirrorX(x));
    const enemy = (x: number): number => (team === 0 ? mirrorX(x) : x);
    let x = me?.x ?? MAP.width / 2;
    let y = me?.y ?? MAP.height / 2;
    if (kind === PING_KIND.Pudding) {
      const pud = this.units.find((u) => u.kind === 'pudding');
      x = pud?.x ?? PUDDING_SPOT.x;
      y = pud?.y ?? PUDDING_SPOT.y;
    } else if (kind === PING_KIND.PushSunny || kind === PING_KIND.PushPuddle) {
      const t = TOWER_SPOTS.find((s) => s.tier === 'outer' && s.lane === (kind === PING_KIND.PushSunny ? 'sunny' : 'puddle'))!;
      x = enemy(t.x);
      y = t.y;
    } else if (kind === PING_KIND.Defend) {
      x = side(CORE.x);
      y = CORE.y;
    }
    this.sendPing(kind, x, y);
  }

  /** GAPS B1 touch: the paw button by the minimap opens the ping wheel in the middle of the screen. */
  private mountPingButton(): void {
    const b = document.createElement('button');
    b.className = 'pl-pingbtn';
    b.type = 'button';
    b.setAttribute('aria-label', 'Tell your team');
    b.innerHTML = icon('paw');
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.pingWheel?.open) this.pingWheel.close();
      else this.pingWheel?.openAt(window.innerWidth / 2, window.innerHeight / 2);
    });
    this.ui.appendChild(b);
    this.pingBtn = b;
  }

  private mountTouchChrome(): void {
    this.mountPingButton();
    const b = document.createElement('button');
    b.className = 'pl-pause';
    b.type = 'button';
    b.setAttribute('aria-label', 'Pause');
    b.innerHTML = '<i></i><i></i>';
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.menu) this.resume();
      else this.openMenu();
    });
    const score = this.ui.querySelector<HTMLElement>('.pl-score');
    // feel pass B3: pause is an icon at the right end of the top strip (desktop never shows it)
    (score ?? this.ui).appendChild(b);
    const onScore = (e: PointerEvent): void => {
      if (document.documentElement.dataset.touch !== '1') return;
      e.stopPropagation();
      this.showScores(!this.scoreOn);
    };
    score?.addEventListener('pointerdown', onScore);
    let mq: MediaQueryList | null = null;
    const onTurn = (): void => {
      if (mq?.matches && !this.ended) this.openMenu();
    };
    try {
      mq = matchMedia('(orientation: portrait) and (pointer: coarse)');
      mq.addEventListener('change', onTurn);
      onTurn();
    } catch {
      mq = null;
    }
    this.chromeOff = () => {
      b.remove();
      score?.removeEventListener('pointerdown', onScore);
      mq?.removeEventListener('change', onTurn);
    };
  }

  private emoteAt = -1e9;
  private emoteOff: (() => void) | null = null;

  /** The "Starter" emote (owned): a chip by the score bar (touch: under the ping paw, ui.css) and the T key. Render only; nothing is sent to the sim. */
  private mountEmote(): void {
    const b = document.createElement('button');
    b.className = 'pl-emote';
    b.type = 'button';
    b.title = 'Starter emote (T)';
    b.innerHTML = `${icon('paw')}<span>Wave</span><kbd>T</kbd>`;
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.emote();
    });
    this.ui.appendChild(b);
    const key = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      this.emote();
    };
    addEventListener('keydown', key);
    this.emoteOff = () => {
      removeEventListener('keydown', key);
      b.remove();
    };
  }

  /** Wave (Clem waves her paw, the others cheer) with a puff of hearts, at most every 3 s. */
  emote(): boolean {
    if (!this.setup.emote || this.ended || this.paused || !this.welcome) return false;
    const now = performance.now();
    if (now - this.emoteAt < 3000) return false;
    const me = this.view.me();
    if (!me || me.state === 'dead') return false;
    const hero = this.welcome.picks[this.welcome.slot];
    if (!this.view.heroes.emote(this.welcome.slot, hero === 'clem' ? 'wave' : 'cheer')) return false;
    this.emoteAt = now;
    const p = new THREE.Vector3(toX(me.fx), 1.62 * HERO_SCALE[hero], toZ(me.fy));
    this.view.particles.ring(p, { n: 8, r0: 0.3, speed: [0.6, 1.2], up: 1.4, color: 0xff7a9a, alpha: 0.95, additive: true, size: [0.18, 0.28], life: [0.6, 0.9], fade: FADE.LINEAR });
    sfx.play('click', { vol: 0.4, rate: 1.5 });
    if (this.e2e) document.documentElement.dataset.emotes = String(Number(document.documentElement.dataset.emotes ?? 0) + 1);
    return true;
  }

  /** Per core team: last "under attack" call (ms) and whether the "falling" call was made. */
  private coreCall: [number, number] = [-1e9, -1e9];
  private coreLow: [boolean, boolean] = [false, false];
  /** Round 2: what hit each core lately (the results card's "why" line) and each team's last hero death tick. */
  private coreLog = new CoreLog();
  private heroDeathTick: [number, number] = [-1, -1];
  private lastPhase: string = 'play';
  /** The newest snapshot tick seen in the gate phase. */
  private lastGateTick = 0;

  /**
   * A core took a hit: "Our core is under attack!" / "Their core is under attack!" (at most every 20 s per core)
   * with a minimap ping, and one "falling" call under 30%, so a win or a loss never pops up without warning.
   */
  private coreHit(core: { team: number; fx: number; fy: number; hp: number; maxHp: number }, byUnit: boolean, frame: ViewFrame): void {
    if (core.team !== 0 && core.team !== 1) return;
    const ours = core.team === this.view.myTeam;
    const now = performance.now();
    const low = core.maxHp > 0 && core.hp < core.maxHp * 0.3;
    const color = ours ? '#ff4d5e' : '#ffd34d';
    if (low && !this.coreLow[core.team]) {
      this.coreLow[core.team] = true;
      this.coreCall[core.team] = now;
      this.view.juice.banner({ title: ours ? 'Our core is falling!' : 'Their core is falling!', sub: ours ? 'Everyone home: defend it.' : 'Finish it!', tone: ours ? 'bad' : 'gold', urgent: true });
      sfx.voice(ours ? 'coreFalling' : 'theirCoreFalling');
      this.minimap.ping(core.fx, core.fy, color, 4000);
      return;
    }
    // Round 2: only units hitting it raise the call (the per-takedown chip fired it at 1:35 with every tower up).
    if (!byUnit) return;
    if (now - this.coreCall[core.team] < 20000 / Math.max(1, this.buffer.speed)) return;
    this.coreCall[core.team] = now;
    const me = frame.byId.get(this.view.mySlot);
    const far = !!me && me.hp > 0 && Math.hypot(me.fx - core.fx, me.fy - core.fy) > DEFEND_FAR_MM;
    if (ours && far) {
      // Round 2: "Defend!" with a ping when the player is far from its own core under attack.
      this.view.juice.banner({ title: 'Defend!', sub: this.touch ? 'Our core is under attack: tap Nap to go home.' : 'Our core is under attack: press B to Nap home.', tone: 'bad', urgent: true });
      sfx.voice('coreAttacked');
      this.minimap.ping(core.fx, core.fy, color, 4000);
      return;
    }
    this.view.juice.banner({ title: ours ? 'Our core is under attack!' : 'Their core is under attack!', tone: ours ? 'bad' : 'good', urgent: true });
    sfx.voice(ours ? 'coreAttacked' : 'theirCoreAttacked');
    this.minimap.ping(core.fx, core.fy, color);
  }

  private wasDead = false;
  private usedUlt = false;
  private alertAt = -1e9;
  /** QA v2 #2: coaching lines said this match, per key (COACH_MAX). */
  private readonly coachN = new Map<string, number>();
  private comebackAt = -1e9;
  /** QA v2 #13: the lane the last lane help named, and when (it stays the same lane for 30 s). */
  private laneSaid: { lane: string; at: number } | null = null;

  /** May the coaching line `key` show once more this match? Counts it when yes. */
  private coach(key: string): boolean {
    const n = this.coachN.get(key) ?? 0;
    if (n >= (COACH_MAX[key] ?? Infinity)) return false;
    this.coachN.set(key, n + 1);
    return true;
  }
  /** Who hurt the player lately (render ms), for the death recap. */
  private hurtBy: { name: string; tower: boolean; at: number }[] = [];

  private calmFor = 0;
  private behindSaid = false;
  /** Round 1 lane help: stuck against a wall (enemy fountain), or 45 s with nothing to do. */
  private stuckFrom = 0;
  private stuckAt = { x: 0, y: 0 };
  private stuckSaidAt = -1e9;
  private lastUseful = -1;
  private idleSaidAt = -1e9;
  private laneArrow: { x: number; y: number } | null = null;
  private laneArrowUntil = 0;

  /** Once a match, for newer players: the team trails by 4+ (takedowns + 3 a tower): one calm call to group up. */
  private behindCall(score: { kills: readonly number[]; towers: readonly number[] }, team: number): void {
    if (this.behindSaid || !this.setup.newPlayer) return;
    const them = 1 - team;
    const gap = score.kills[them] - score.kills[team] + 3 * (score.towers[them] - score.towers[team]);
    if (gap < 4) return;
    this.behindSaid = true;
    this.view.juice.banner(behindBanner(score.kills[team], score.kills[them], score.towers[team], score.towers[them]));
  }

  /** Is the player fighting: hurt by an enemy in the last 3 s? (talent offers wait then) */
  private inFight(): boolean {
    const last = this.hurtBy[this.hurtBy.length - 1];
    const span = 3000 / Math.max(1, this.buffer.speed);
    const now = performance.now();
    // feel pass B5: damage dealt to an enemy hero counts too (the talent card never opens over a fight)
    return (!!last && now - last.at < span) || now - this.dealtAt < span;
  }
  /** Feel pass B5: when the player last hit an enemy hero (ms). */
  private dealtAt = -1e9;

  /** Hide the tower alert and the "Tower aiming at you!" lock-on (on death, on respawn, when no tower shoots). */
  private clearTowerWarnings(): void {
    this.overhead.clearLocks(this.view.mySlot);
    this.view.juice.notify.drop('tower');
    this.view.juice.notify.drop('dive');
    this.alertAt = -1e9;
  }

  /** "Knocked out by Cacklejaw + a tower: wait for your minions." from the last 6 s of hits. */
  private recapLine(killer: { kind: string; hero?: HeroId } | null, killerId = -1): string {
    const now = performance.now();
    const recent = this.hurtBy.filter((h) => now - h.at < 6000 / Math.max(1, this.buffer.speed));
    const names: string[] = [];
    const add = (n: string): void => {
      if (n && !names.includes(n)) names.push(n);
    };
    // Round 2: the slot's name ("Cacklejaw 2"), the same as the kill feed and the scoreboard.
    if (killer?.kind === 'hero' && killer.hero) add(this.names[killerId] ?? HERO_TEXT[killer.hero].title);
    for (let i = recent.length - 1; i >= 0; i--) if (!recent[i].tower) add(recent[i].name);
    const tower = killer?.kind === 'tower' || killer?.kind === 'core' || recent.some((h) => h.tower);
    if (tower) add('a tower');
    if (!names.length) add(killer?.kind === 'minion' ? 'minions' : 'the enemy');
    this.hurtBy = [];
    const by = names.slice(0, 3).join(' + ');
    return tower ? `Knocked out by ${by}: wait for your minions to tank` : `Knocked out by ${by}`;
  }

  /**
   * An enemy tower (or core) hit the player: a red dashed beam from it to the hero every time, and for new players a
   * "Tower is hitting you!" alert (at most every 6 s), since the dashed range ring alone went unnoticed.
   */
  private towerHit(src: number, lockOn = false): void {
    if (!lockOn) this.overhead.beam(src, this.view.mySlot);
    if (!this.setup.newPlayer) return;
    const now = performance.now();
    if (now - this.alertAt < 6000) return;
    this.alertAt = now;
    if (!this.coach('tower')) return;
    this.towerAlert(
      'tower',
      lockOn ? 'Tower aiming at you!' : 'Tower is hitting you!',
      lockOn ? 'Step out of its ring, or let your minions walk in first.' : 'Step back until your minions walk in.',
    );
  }

  /**
   * LoL pass (lane A): the red tower or dive alert is a note on the top rail (never over the field). The tower hitting
   * you is danger (prio 1); the dive warning is advice (prio 2, QA v2 #2: it cut in on First Blood and slain lines).
   */
  private towerAlert(key: 'tower' | 'dive', title: string, sub: string): void {
    const sp = Math.max(1, this.buffer.speed);
    this.view.juice.push({ key, title, sub, tone: 'bad', prio: key === 'dive' ? 2 : 1, icon: TOWER_GLYPH, ttl: 2000 / sp, cooldown: 6000 / sp, ...(key === 'dive' ? { stale: 1500 } : {}) });
    sfx.play('click', { vol: 0.5, rate: 0.6 });
  }

  /**
   * MAP-GAPS A10: a ping at (x, y) mm: a minimap ring with the kind's glyph, its own ground marker (never the mint
   * move-order marker) and, when the spot is off screen, an arrow at the screen edge for 1 s.
   */
  private pingMark(xMm: number, yMm: number, color: string): void {
    const kind = pingKindOfColor(color);
    this.minimap.ping(xMm, yMm, color, 3000, kind);
    if (kind === 'pushSunny' || kind === 'pushPuddle') this.minimap.flashLane(kind === 'pushSunny' ? 'sunny' : 'puddle');
    this.view.pingMarker(xMm / 1000, -yMm / 1000, color, kind);
    this.pingEdge(xMm / 1000, -yMm / 1000, color);
    sfx.play('click', { vol: 0.35, rate: 1.2 });
    if (this.e2e) document.documentElement.dataset.pingMarks = String(this.view.pingMarks.placed);
  }

  /** MAP-GAPS A10: a 1 s arrow at the screen edge toward a ping at (x, z) m that is off screen. */
  private pingEdge(x: number, z: number, color: string): void {
    const c = this.gr.renderer.domElement;
    const r = c.getBoundingClientRect();
    const p = new THREE.Vector3(x, 0, z).project(this.gr.camera);
    const sx = r.left + ((p.x + 1) / 2) * r.width;
    const sy = r.top + ((1 - p.y) / 2) * r.height;
    if (p.z < 1 && sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = sx - cx;
    let dy = sy - cy;
    if (p.z >= 1) {
      dx = -dx;
      dy = -dy;
    }
    const m = 28;
    const k = Math.min((r.width / 2 - m) / Math.max(1e-3, Math.abs(dx)), (r.height / 2 - m) / Math.max(1e-3, Math.abs(dy)));
    const el = document.createElement('div');
    el.className = 'pl-pingedge';
    el.style.left = `${cx + dx * k}px`;
    el.style.top = `${cy + dy * k}px`;
    el.style.setProperty('--c', color);
    el.style.setProperty('--a', `${Math.atan2(dy, dx)}rad`);
    this.ui.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  private marker(x: number, z: number, attack: boolean): void {
    // the bold ring marker (GameView.orderMarker: over the VFX, red with crosshair ticks for attacks) and a few sparks
    this.view.orderMarker(x, z, attack);
    const p = new THREE.Vector3(x, 0.08, z);
    this.view.particles.ring(p, { n: 6, r0: 0.5, speed: [0.5, 1], up: 0.2, color: attack ? 0xff4d5e : 0x5ff0a8, alpha: 0.8, additive: true, size: [0.1, 0.16], life: [0.25, 0.35], fade: FADE.LINEAR });
    sfx.play('click', { vol: 0.35, rate: attack ? 0.8 : 1.2 });
  }

  private viewQuad(): { x: number; z: number }[] | null {
    const c = this.gr.renderer.domElement;
    const r = c.getBoundingClientRect();
    const out: { x: number; z: number }[] = [];
    for (const [px, py] of [
      [r.left, r.top],
      [r.right, r.top],
      [r.right, r.bottom],
      [r.left, r.bottom],
    ]) {
      const g = groundAt(this.gr.camera, c, px, py);
      if (!g) return null;
      out.push({ x: g.x, z: g.z });
    }
    return out;
  }

  /**
   * After two drawn frames (shaders compiled, models up), "3, 2, 1, Go!" over the field, then the sim runs. A menu
   * opened meanwhile keeps it paused (resume() unpauses it).
   */
  /** cards: the countdown reached "1": the VS intro fades now and a late one never shows. */
  private vsDone = false;

  private countdown(go: () => void): void {
    const speed = Math.max(1, this.buffer.speed);
    // LoL pass (lane A): the digits are the top rail's resting countdown line, not a big number over the field
    const rail = this.view.juice.notify;
    // the sim starts on the last step, but the gates hold every hero for 3 s more: "Go!" waits for the barrier
    // (frame(): the gate -> play change), so it never says go under "Gates open in 0:03"
    const steps = ['3', '2', '1', 'Ready!'];
    let i = 0;
    const next = (): void => {
      if (this.disposed) return;
      if (i === steps.length - 1) {
        if (!this.menu) this.host.pause(false);
        go();
      }
      if (i >= steps.length) {
        rail.rest('countdown', null);
        return;
      }
      rail.rest('countdown', steps[i], 'gold');
      if (i === 0) sfx.voice('welcome', { sting: false });
      // cards: the VS intro is gone by "1" whatever its own timers say (a late chunk under load would cover "Ready!")
      if (i === steps.length - 2) {
        this.vsDone = true;
        this.ui.querySelector('.tt-vs')?.classList.add('out');
      }
      // lifecycle: a tick per step, a brighter one on "Ready!"
      sfx.play('blip', { vol: 0.5, rate: i === steps.length - 1 ? 1.6 : 1 });
      i++;
      setTimeout(next, (i === steps.length ? 600 : 700) / speed);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => next()));
  }

  /** "Go!" as the gate barrier drops: a short prio 0 note on the top rail. */
  private goFlash(): void {
    if (this.disposed) return;
    this.view.juice.push({ key: 'go', title: 'Go!', tone: 'gold', prio: 0, ttl: 700 });
    sfx.voice('gatesOpen', { sting: false });
  }

  private openMenu(): void {
    if (this.menu || this.ended) return;
    this.paused = true;
    this.host.pause(true);
    this.hooks.onPaused?.(true);
    const touch = document.documentElement.dataset.touch === '1';
    this.menu = menuScreen(this.ui, {
      muted: this.muted,
      touch,
      // Audit UX-05: Scores hides the pause card (it drew over the scoreboard) and adds a Back to it
      onScores: () => this.menuScores(),
      ...(this.hooks.onSettings
        ? {
            onSettings: () => {
              this.menu?.classList.add('under');
              this.hooks.onSettings?.(() => this.menu?.classList.remove('under'));
            },
          }
        : {}),
      onResume: () => this.resume(),
      // feel pass B1: the Camera height row: the view follows at once behind the menu
      onCameraHeight: (h) => {
        this.view.setCameraHeight(h);
      },
      onMute: (m) => {
        this.muted = m;
        this.hooks.onMute(m);
      },
      leaveCounts: this.leaveCounts(),
      onLeave: () => {
        const counted = this.leaveCounts() ? { ticks: this.buffer.latest?.clock.tick ?? 0, takedowns: this.myTakedowns() } : undefined;
        this.resume();
        this.hooks.onLeave(counted);
      },
      // GAPS B2: Forfeit (a confirm step in the menu); the sim ends the match on its next tick
      ...(this.setup.forfeitFrom ? { forfeit: { from: this.setup.forfeitFrom, tick: this.buffer.latest?.clock.tick ?? 0 }, onForfeit: () => this.forfeit() } : {}),
      // party play (§4.6, M5): a local overlay over a running match; Pause and Forfeit are votes
      ...(this.setup.party
        ? {
            party: {
              coop: this.setup.party.coop === true,
              // casual PvP: no pause (one team cannot stop the other's match); Remake from 1:00 to 3:00 instead
              ...(this.setup.party.pvp
                ? {
                    pvp: true,
                    remake: (() => {
                      const t = this.buffer.latest?.clock.tick ?? 0;
                      return t >= 1800 && t < 5400;
                    })(),
                    onVoteRemake: () => {
                      this.mp?.vote('remake', true);
                      this.resume();
                    },
                    onMuteOpponents: () => {
                      this.mp?.toggleOpponents();
                      this.resume();
                    },
                  }
                : {}),
              onVotePause: () => {
                this.mp?.vote('pause', true);
                this.resume();
              },
            },
          }
        : {}),
    });
  }

  /** The lead seat of this player's team: slot 0, or slot 3 for a PvP team-1 seat. */
  private leadSlot(): number {
    return this.setup.party?.pvp && this.view.mySlot >= 3 ? 3 : 0;
  }

  /** This seat leads its team (its pings are sim commands). */
  private isLead(): boolean {
    return this.view.mySlot === this.leadSlot();
  }

  /** Audit UX-03: a solo match that offers Forfeit (match 4 on, never Rookie) records a Leave as a forfeit loss. */
  private leaveCounts(): boolean {
    return !this.setup.party && !!this.setup.forfeitFrom;
  }

  /** The player's takedowns so far (kills + assists), for a leave recorded as a forfeit. */
  private myTakedowns(): number {
    return this.announcer?.takedowns ?? 0;
  }

  /** GAPS B2: send Op.Forfeit and unpause; the end arrives as a normal (lost, reason 'forfeit') match end. */
  private forfeit(): void {
    if (this.ended) return;
    // party play: NetHost turns it into a surrender vote (§4.6); the rail shows "Surrender? 1/2"
    this.host.send({ op: Op.Forfeit });
    this.resume();
  }

  /**
   * Party play (MULTIPLAYER.md §7, lane M): load the party HUD chunk and hand it the views it decorates. Until it
   * lands (a few ms) the NetHost's own rail notes stand in.
   */
  private mountParty(w: WelcomeMsg): void {
    const link = (this.host as { party?: import('./mpTypes').PartyLink }).party;
    if (!link) return;
    const base = [...this.names];
    void import('./mpHud')
      .then(({ MpHud }) => {
        if (this.disposed || this.mp) return;
        this.mp = new MpHud(
          {
            ui: this.ui,
            rail: this.view.juice.notify,
            overhead: this.overhead,
            minimap: this.minimap,
            scoreboard: () => this.scoreboard,
            hud: () => this.hud,
            baseNames: base,
            setNames: (names) => {
              this.names = names;
              this.overhead.names = names;
              this.scoreboard?.setNames(names);
              if (this.e2e) document.documentElement.dataset.mpNames = names.join('|');
            },
            pingAt: (x, y, color) => {
              this.pingMark(x, y, color);
              if (this.e2e) document.documentElement.dataset.mpPingAt = `${x},${y}`;
            },
            popOver: (slot, text, tone) => {
              if (!text) return;
              const at = slot === w.slot ? this.heroScreen() : this.barkScreen(slot, true);
              if (at) this.view.juice.pop(text, at.x, at.y - 34, tone);
            },
            emote: (slot, pose, color) => {
              if (!this.view.heroes.emote(slot, pose)) return;
              const hero = w.picks[slot];
              const e = this.frameNow?.byId.get(slot);
              if (!hero || !e) return;
              const p = new THREE.Vector3(toX(e.fx), 1.62 * HERO_SCALE[hero], toZ(e.fy));
              this.view.particles.ring(p, { n: 8, r0: 0.3, speed: [0.6, 1.2], up: 1.4, color, alpha: 0.95, additive: true, size: [0.18, 0.28], life: [0.6, 0.9], fade: FADE.LINEAR });
              if (this.e2e) document.documentElement.dataset.emotes = String(Number(document.documentElement.dataset.emotes ?? 0) + 1);
            },
            enabled: () => !this.ended && !this.menu && !this.talentsBlock(),
            touch: document.documentElement.dataset.touch === '1' || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches),
            newbie: this.setup.party?.newbie === true,
            difficulty: this.setup.difficulty,
            track: (event, props) => this.hooks.track?.(event, props),
            tick: () => this.buffer.latest?.clock.tick ?? 0,
          },
          link,
          { hideNames: this.setup.party?.hideNames === true },
        );
        if (this.e2e) e2eHook('Mp', this.mp);
        if (this.mpLive) this.mp.start();
      })
      .catch(() => undefined);
  }

  /** The match is live (party analytics and hints start then). */
  private mpLive = false;

  /** Scoreboard by tap (pause menu or the score bar on touch); a tap on it closes it. */
  /** Audit UX-05: the scoreboard from the pause menu: the menu hides under it, and Back (or Esc) brings it back. */
  private menuScores(): void {
    if (!this.menu) return;
    this.menu.classList.add('under');
    this.showScores(true);
    const back = document.createElement('button');
    back.className = 'pl-btn big pl-scores-back';
    back.textContent = 'Back';
    const done = (): void => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      this.showScores(false);
      this.menu?.classList.remove('under');
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      done();
    };
    back.addEventListener('click', done);
    document.addEventListener('keydown', onKey, true);
    // beside the scoreboard (it redraws its own markup), above its tap layer
    this.ui.appendChild(back);
    this.scoresBack = done;
  }

  /** Closes the pause menu's scoreboard (UX-05), if it is open. */
  private scoresBack: (() => void) | null = null;

  private showScores(on: boolean): void {
    this.scoreOn = on;
    this.scoreboard?.root.classList.toggle('tap', on);
    this.scoreboard?.show(on, this.frameNow);
  }

  resume(): void {
    this.scoresBack?.();
    this.scoresBack = null;
    if (this.scoreboard?.root.classList.contains('tap')) this.showScores(false);
    this.menu?.remove();
    this.menu = null;
    if (this.paused) {
      this.paused = false;
      this.host.pause(false);
      this.hooks.onPaused?.(false);
    }
  }

  /** PERF-IOS: the app's pacer draws a paused match at a low rate. */
  get isPaused(): boolean {
    return this.paused;
  }

  /** PERF-IOS: the overhead canvas's DPR cap and the minimap's redraw rate follow the phone profile and the governor. */
  applyPerf(s: TierSettings): void {
    this.overhead.maxDpr = s.overheadDpr;
    this.minimap.hz = s.minimapHz;
  }

  /** PERF-IOS P1-6: hidden page or backgrounded app: the music stops scheduling notes. */
  setHidden(hidden: boolean): void {
    this.music.setHidden(hidden);
  }

  /** Host page pause/resume (bridge). */
  setPaused(p: boolean): void {
    if (p) this.openMenu();
    else this.resume();
  }

  private onEnd(result: MatchResult, replay: ReplayRecord): void {
    if (this.ended || !this.welcome) return;
    this.ended = true;
    // GAPS B2 (forfeit.spec.ts): how the match ended
    document.documentElement.dataset.endReason = result.reason;
    const me = this.welcome.slot;
    const won = result.outcome === 'won';
    // party play (M8): mp_match_end with the bot share of this player's turns; the save status stays private
    const pe = (replay as { party?: { scored: boolean | null } }).party;
    this.mp?.ended(result.outcome, result.reason, pe?.scored ?? null);
    // LoL pass (lane B): the result is a prio 0 rail note (data-said), said by the announcer, then the crest
    this.view.juice.banner({ title: won ? 'Victory!' : 'Defeat', tone: won ? 'good' : 'bad', urgent: true });
    sfx.voice(won ? 'victory' : 'defeat');
    // the winners' own victory loops (render only)
    if (result.outcome === 'won' || result.outcome === 'lost') this.view.director.victory(won ? this.welcome.team : 1 - this.welcome.team);
    // slow-mo on the final blow (fun plan F2 item 1), the crowd, and the music bows out
    this.view.juice.slowmo(1200, 0.25, true);
    if (won) {
      sfx.play('roar');
      sfx.play('cheer', { vol: 0.8 });
      this.view.juice.flash('gold');
    }
    this.music.stop();
    // cut to the core that fell, so the end is seen, not just announced
    const loser = won ? 1 - this.welcome.team : this.welcome.team;
    const fallen = this.buffer.latest?.entities.find((e) => e.kind === 'core' && e.team === loser);
    if (fallen) this.view.lookAt(toX(fallen.x), toZ(fallen.y), 10);
    sfx.play(won ? 'victory' : 'defeat');
    const myStats = result.stats.find((s) => s.slot === me);
    const sb = this.scoreboard;
    const latest = this.buffer.latest;
    const k = latest?.score.kills ?? [0, 0];
    const team = this.welcome.team;
    const cause = this.causeLine(result, won, latest);
    // let the last moments play out before the results screen
    const welcome = this.welcome;
    // lifecycle: end confetti (won) or soft puffs, then a paw wipe that closes just before the results replace the match
    // LoL pass (lane B): the camera eases to the fallen core (CREST_AT_MS), then the VICTORY / DEFEAT crest holds
    // CREST_HOLD_MS before the paw wipe closes; the results come CREST_EXTRA_MS later than before
    const sp = Math.max(1, this.buffer.speed);
    const resultsIn = Math.max(300, (RESULTS_AFTER_END_MS + CREST_EXTRA_MS) / sp);
    setTimeout(() => {
      if (!this.disposed) this.hud?.crest(won);
    }, CREST_AT_MS / sp);
    this.view.lifecycle?.matchEnd(won, resultsIn - 480);
    setTimeout(
      () => {
        if (this.disposed) return;
        this.hooks.onEnd({
          result,
          replay,
          welcome,
          kills: myStats?.kills ?? sb?.kills[me] ?? 0,
          deaths: myStats?.deaths ?? sb?.deaths[me] ?? 0,
          assists: myStats?.assists ?? 0,
          level: myStats?.level ?? this.lastLevel,
          teamKills: team === 0 ? [k[0], k[1]] : [k[1], k[0]],
          tips: [...this.tips.completed],
          activity: this.activity,
          deathsBy: { ...this.deathsBy },
          cause,
          fishBy: { ...this.fishBy },
          fun: { ...this.funSummary(myStats?.heroDamage ?? 0), ...(myStats ? { takedowns: myStats.kills + myStats.assists } : {}) },
        });
      },
      resultsIn,
    );
  }

  private hudRectsAt = -1e9;
  /** Round 2: tell the overhead where the top HUD is (its plates fade there), twice a second. */
  private hudRectsTick(): void {
    const now = performance.now();
    if (now - this.hudRectsAt < 500) return;
    this.hudRectsAt = now;
    const rects: { left: number; top: number; right: number; bottom: number }[] = [];
    for (const el of this.ui.querySelectorAll<HTMLElement>('.pl-score, .pl-hp, .pl-portrait, .pl-pause')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top < window.innerHeight / 3) rects.push({ left: r.left - 4, top: r.top - 4, right: r.right + 4, bottom: r.bottom + 4 });
    }
    this.overhead.hudRects = rects;
    const side: typeof rects = [];
    // feel pass B5: off-screen pointers and plates also keep clear of the button arc, the top strip, the ping corner
    for (const el of this.ui.querySelectorAll<HTMLElement>('.pl-minimap, .pl-strip, .pl-feed, .pl-tbtn, .pl-score, .pl-pingbtn, .pl-emote, .pl-chatbtn')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) side.push({ left: r.left - 4, top: r.top - 4, right: r.right + 4, bottom: r.bottom + 4 });
    }
    this.overhead.sideRects = side;
  }

  /** Round 2: the results card's "why" line (app/endCause.ts). */
  private causeLine(result: MatchResult, won: boolean, latest: SnapBuffer['latest']): string {
    const team = this.view.myTeam;
    const loser = won ? 1 - team : team;
    const ents = latest?.entities ?? [];
    const ownCore = ents.find((e) => e.kind === 'core' && e.team === team);
    const theirCore = ents.find((e) => e.kind === 'core' && e.team === 1 - team);
    let forward = 0;
    let alive = 0;
    for (const e of ents) {
      if (e.kind !== 'hero' || e.team !== team || e.hp <= 0) continue;
      alive++;
      if (ownCore && theirCore && Math.hypot(e.x - theirCore.x, e.y - theirCore.y) < Math.hypot(e.x - ownCore.x, e.y - ownCore.y)) forward++;
    }
    const k = latest?.score.kills ?? [0, 0];
    const t = latest?.score.towers ?? [0, 0];
    return endCause({
      won,
      reason: result.reason,
      phase: this.lastPhase,
      top: this.coreLog.top(loser, result.ticks),
      kills: team === 0 ? [k[0], k[1]] : [k[1], k[0]],
      towers: team === 0 ? [t[0], t[1]] : [t[1], t[0]],
      oursForward: forward,
      oursAlive: alive,
    });
  }

  private funSummary(heroDamage: number): MatchFun {
    const a = this.announcer;
    return {
      firstTakedownS: a && a.firstTakedownTick >= 0 ? Math.round(a.firstTakedownTick / 30) : -1,
      level4S: a && a.level4Tick >= 0 ? Math.round(a.level4Tick / 30) : -1,
      takedowns: a?.takedowns ?? 0,
      combos: a?.combos ?? 0,
      pickups: a?.pickups ?? 0,
      biggestMulti: a?.biggestMulti ?? 0,
      shutdowns: a?.shutdowns ?? 0,
      pudding: a?.pudding ?? false,
      towers: this.towersTaken,
      best: a?.bestMoment?.title ?? null,
      heroDamage,
      usedUlt: this.usedUlt,
    };
  }

  /** The player's hero on screen (px), or null. */
  private heroScreen(): { x: number; y: number } | null {
    const me = this.view.me();
    if (!me || !this.welcome) return null;
    const c = this.gr.renderer.domElement;
    const p = project(this.gr.camera, c, toX(me.fx), 2.2 * HERO_SCALE[this.welcome.picks[this.welcome.slot]], toZ(me.fy));
    return p.on ? { x: p.x, y: p.y } : null;
  }

  /** A living allied bot on screen to say a bark: `slot` first, then the other ally (px), or null. */
  private barkScreen(slot: number, only = false): { x: number; y: number } | null {
    const w = this.welcome;
    const frame = this.view.frame;
    if (!w || !frame) return null;
    const team = w.slot < 3 ? 0 : 1;
    const order = only ? [slot] : [slot, ...[0, 1, 2].map((k) => team * 3 + k).filter((s) => s !== slot)];
    const c = this.gr.renderer.domElement;
    for (const s of order) {
      if (s === w.slot || s < team * 3 || s >= team * 3 + 3) continue;
      const e = frame.byId.get(s);
      const hero = w.picks[s];
      if (!e || !hero || e.state === 'dead' || e.hp <= 0) continue;
      const p = project(this.gr.camera, c, toX(e.fx), 2.2 * HERO_SCALE[hero], toZ(e.fy));
      if (p.on) return { x: p.x, y: p.y };
    }
    return null;
  }

  /** Show what the announcer called. */
  private present(list: readonly Moment[]): void {
    const j = this.view.juice;
    const me = this.view.me();
    for (const m of list) {
      // MAP-GAPS A19: a line that names a lane flashes it on the minimap
      const named = laneNamed(m.title);
      if (named) this.minimap.flashLane(named);
      // Nine Lives read like "you survived" when it fired on the killing blow: only while alive
      if (m.key === 'nineLives' && (!me || me.state === 'dead' || me.hp <= 0)) continue;
      // feel pass B3: the grey-out and the one centred "Back in N" already say it: "You have been slain" is voice only
      if (m.key === 'slain') {
        if (m.voice) sfx.voice(m.voice);
        continue;
      }
      if (m.size === 'ping') {
        if (m.key === 'frenzySpawn') for (const p of this.view.pickups.list()) if (p.kind === 'frenzy') this.minimap.ping(p.x, p.y, '#7dff8a', 3000);
        // GAPS B1: the player's ping: a minimap ring and a ground marker where it points, and its name over the hero
        if (m.key === 'ping' && m.at && this.setup.party && !this.isLead()) {
          // party play: the leader's ping, as a friend sees it (muted: nothing); PvP: the own team's lead
          if (this.mp?.isMuted(this.leadSlot())) continue;
          this.pingMark(m.at.x, m.at.y, m.at.color);
          this.mp?.leaderPing(m.title);
          continue;
        }
        if (m.key === 'ping' && m.at) {
          this.pingMark(m.at.x, m.at.y, m.at.color);
          const at = this.heroScreen();
          if (at) j.pop(m.title, at.x, at.y - 34, 'info');
          sfx.play('click', { vol: 0.6 });
        }
        continue;
      }
      if (m.size === 'bark') {
        // GAPS A6: the ally's line over that ally (the other ally when it is down or off screen; else nothing)
        const at = this.barkScreen(m.slot ?? -1);
        // GAPS B1: an answer to a ping is said by that ally (over it, or in the feed when it is off screen)
        const answer = m.key === 'barkPing' || m.key === 'barkHeal';
        if (answer) {
          const on = this.barkScreen(m.slot ?? -1, true);
          if (on) j.bark(m.title, on.x, on.y - 10, m.tone === 'bad' ? 'bad' : 'good');
          else this.hud?.note(`${this.names[m.slot ?? -1] ?? 'Ally'}: ${m.title}`);
          if (this.e2e) {
            const d = document.documentElement.dataset;
            d.barks = `${d.barks ? `${d.barks},` : ''}${m.slot}:${m.key === 'barkHeal' ? 'heal' : 'ok'}`;
          }
          continue;
        }
        if (at) j.bark(m.title, at.x, at.y - 10, 'good');
        continue;
      }
      // QA v2 #2: COMEBACK / "They are rallying" at most once a minute and COACH_MAX.comeback times a match
      if (m.key === 'comeback' || m.key === 'comebackThem') {
        const t = performance.now();
        if (t - this.comebackAt < COMEBACK_GAP_MS / Math.max(1, this.buffer.speed) || !this.coach('comeback')) continue;
        // Fun pass (playtest #8): no "our waves get stronger" while our core is falling (it fired in the same second)
        if (m.key === 'comeback' && this.welcome && this.coreLow[this.welcome.team]) continue;
        this.comebackAt = t;
      }
      // Lane F (F2): the player's Toy: the progression rail line (merged with a level-up within 2 s), the chip's burst
      if (m.key === 'buy' && m.toy) {
        j.push(this.progress.bought({ name: m.toy.name, head: m.toy.head, sub: m.toy.sub }, m.tick ?? this.frameNow?.latest.clock.tick ?? 0));
        this.hud?.toyBurst();
        j.flash('gold');
        continue;
      }
      if (m.key === 'geared') {
        j.push({ key: 'geared', title: m.title, tone: 'bad', prio: 3, cooldown: 20000 });
        continue;
      }
      // Lane F (F4): the sim's shutdown Fish lands on the "Shut down!" item already on the rail (same key)
      if (m.key === 'shutdownFish') {
        j.push({ key: 'shutdown', title: m.title, tone: m.tone, prio: 2, big: true, icon: LOL_CREST });
        continue;
      }
      // LoL pass (lane B): a multikill, an Ace or a takedown makes a queued "An ally has been slain" moot
      if (m.key.startsWith('multi') || m.key === 'ace' || m.key === 'takedown' || m.key === 'allyTakedown') j.notify.drop('ally-slain');
      if (m.size === 'banner' && (m.big || m.face !== undefined)) {
        // LoL pass (lane B): announcer lines with a crest (desktop) or the killer's / ally's portrait as the badge
        const hero = m.face !== undefined ? this.welcome?.picks[m.face] : undefined;
        const face = hero ? portraitUrl(hero) : null;
        j.push({
          ...(m.key === 'allySlain' ? { key: 'ally-slain' } : m.key === 'shutdown' ? { key: 'shutdown' } : {}),
          title: m.title,
          ...(m.sub ? { sub: m.sub } : {}),
          tone: m.tone,
          prio: 2,
          ...(m.big ? { big: true } : {}),
          ...(face ? { icon: face } : m.big ? { icon: LOL_CREST } : {}),
          // fun pass (playtest #5): a shutdown is the takedown's own bigger line, so a waiting "Takedown!" goes
          ...(m.key === 'ace' || m.key === 'shutdown' ? { tag: 'multi', drops: ['takedown'] } : {}),
        });
      } else if (m.size === 'banner') j.banner({ title: m.title, sub: m.sub, tone: m.tone });
      else if (m.size === 'callout') j.callout(m.title, m.tone);
      else {
        const at = this.heroScreen();
        // a new combo step replaces the last one on screen (never "Combo x3" over "Combo x4")
        if (at && m.key.startsWith('combo')) j.popReplace('combo', m.title, at.x, at.y - 10, m.tone, true);
        else if (at) j.pop(m.title, at.x, at.y - 10, m.tone, m.key.startsWith('pickup'));
      }
      if (m.voice) sfx.voice(m.voice);
      if (m.slowmo) j.slowmo(m.slowmo.ms, m.slowmo.scale);
      if (m.shake) j.kick(m.shake);
      if (m.crowd) sfx.play(m.crowd, { vol: m.crowd === 'roar' ? 0.9 : 0.75 });
      if (m.key.startsWith('combo') || m.key.startsWith('multi')) sfx.play('sting', { rate: m.key.startsWith('multi') ? 1.2 : 1 });
      // QA v2 #9: a big announcer line with no voice of its own gets a soft sting, like LoL's banners
      else if (m.size === 'banner' && m.big && !m.voice) sfx.play('sting', { vol: 0.5, rate: 1.1 });
      if (m.key.startsWith('multi') || m.key === 'firstBlood' || m.key === 'shutdown') j.flash('gold');
      if (m.key === 'frenzySpawn') {
        for (const p of this.view.pickups.list()) if (p.kind === 'frenzy') this.minimap.ping(p.x, p.y, '#7dff8a', 3000);
      }
    }
  }

  /** Per-event objective beats (fun plan F1). */
  private beatsFrom(ev: SimEvent | { type: string }, frame: ViewFrame): void {
    const me = this.view.mySlot;
    const e = ev as SimEvent;
    if (e.type === 'hit' && e.src === me) {
      const dst = frame.byId.get(e.dst);
      if (dst?.kind === 'minion') this.goals.complete('minions');
      if (dst?.kind === 'hero' && dst.team !== this.view.myTeam) this.goals.complete('dog');
    } else if (e.type === 'pudding') {
      if (e.what === 'spawn') this.goals.start('pudding');
      if (e.what === 'calmed') {
        if (e.team === this.view.myTeam) this.goals.complete('pudding');
        else this.goals.dismiss('pudding');
      }
    } else if (e.type === 'sunset') this.goals.start('sunset');
    else if (e.type === 'death' && e.killer === me && e.id < 6) this.goals.complete('dog');
  }

  /** lifecycle: the gate chip's title while the lifecycle pill counts the gates down (the timer's phase line skips it). */
  private lcGateTitle(): string | null {
    const chip = this.view.lifecycle ? this.objClock?.chip() : null;
    return chip?.key === 'gates' ? chip.title : null;
  }

  /** Time and proximity beats, the arrow's target, the Pudding ring. */
  private goalTick(frame: ViewFrame): void {
    const g = this.goals;
    const chip = this.objClock?.chip() ?? null;
    // lifecycle: its gate pill counts the gates down (with the padlock signs over each gate), so the standing chip waits
    // for the next objective instead of printing "Gates open in" a second time
    g.standing(chip?.key === 'gates' && this.view.lifecycle ? null : chip);
    if (!g.enabled || !this.welcome) return;
    const me = frame.byId.get(this.welcome.slot);
    const sec = frame.latest.clock.seconds;
    if (!me) return;
    const team = this.welcome.team;
    let enemyMinion = Infinity;
    let enemyHero = Infinity;
    let allyMinion = Infinity;
    for (const u of this.units) {
      if (u.state === 'dead') continue;
      const d = Math.hypot(u.x - me.fx, u.y - me.fy);
      if (u.kind === 'minion' && u.team === team) allyMinion = Math.min(allyMinion, d);
      if (!isEnemy(u, team)) continue;
      if (u.kind === 'minion') enemyMinion = Math.min(enemyMinion, d);
      if (u.kind === 'hero') enemyHero = Math.min(enemyHero, d);
    }
    // feel QA: "Run to the lane ... along the arrow" waits for the gate to open (no arrow, and no way out, before it)
    const gateUp = frame.latest.clock.phase === 'gate';
    if (sec >= 1 && !gateUp) g.start('lane');
    // out of the base and with the wave (the first wave walks past the fountain, so near it alone is not enough)
    const out = team === 0 ? me.fx > 14000 : me.fx < 86000;
    if (out && (allyMinion < 9000 || (team === 0 ? me.fx > 26000 : me.fx < 74000))) g.complete('lane');
    if (sec >= 12 || enemyMinion < 10000) g.start('minions');
    const down = me.state === 'dead';
    if (enemyHero < 14000 && sec >= 10 && !down) g.start('dog');
    // feel QA: the dog tip outlived a death into the fountain; take it back while dead or once no dog is near
    if (g.current === 'dog' && (down || enemyHero > 22000)) g.retract('dog');
    if (g.current === 'pudding') {
      const p = frame.entities.find((e) => e.kind === 'pudding' && e.state !== 'dead');
      g.setProgress(p && p.maxHp > 0 ? 1 - p.hp / p.maxHp : null);
    }
  }

  /** Where the ground arrow points for the chip on screen, or null. */
  private goalTarget(frame: ViewFrame): { x: number; y: number } | null {
    const id: BeatId | null = this.goals.current;
    if (!id || !this.welcome || this.goals.isDone(id)) return null;
    const me = frame.byId.get(this.welcome.slot);
    if (!me) return null;
    const team = this.welcome.team;
    const nearest = (pred: (u: Unit) => boolean): { x: number; y: number } | null => {
      let best: Unit | null = null;
      let bd = Infinity;
      for (const u of this.units) {
        if (u.state === 'dead' || !pred(u)) continue;
        const d = Math.hypot(u.x - me.fx, u.y - me.fy);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      return best ? { x: best.x, y: best.y } : null;
    };
    switch (id) {
      case 'lane':
        return nearest((u) => u.kind === 'minion' && u.team === team) ?? { x: team === 0 ? 22000 : 78000, y: 50000 };
      case 'minions':
        return nearest((u) => u.kind === 'minion' && isEnemy(u, team));
      case 'dog':
      case 'ult':
        return nearest((u) => u.kind === 'hero' && isEnemy(u, team));
      case 'pudding':
        return nearest((u) => u.kind === 'pudding');
      case 'push':
        return nearest((u) => (u.kind === 'tower' || u.kind === 'core') && isEnemy(u, team));
      default:
        return null;
    }
  }

  /** Music intensity from the fight around the player (fun plan F2 item 13). */
  private musicTick(frame: ViewFrame): void {
    if (!this.welcome) return;
    const me = frame.byId.get(this.welcome.slot);
    const team = this.welcome.team;
    let enemyNear = false;
    let allies = 0;
    let enemies = 0;
    if (me && me.state !== 'dead') {
      for (const e of frame.entities) {
        if (e.kind !== 'hero' || e.state === 'dead') continue;
        const d = Math.hypot(e.fx - me.fx, e.fy - me.fy);
        if (e.team === team) {
          if (d < 12000) allies++;
        } else {
          if (d < 15000) enemyNear = true;
          if (d < 12000) enemies++;
        }
      }
    }
    const ph = frame.latest.clock.phase;
    const lvl = intensityOf({
      enemyNear,
      fight2v2: allies >= 2 && enemies >= 2,
      sunset: ph === 'sunset',
      suddenDeath: ph === 'suddenDeath',
      coreUnderAttack: performance.now() - this.coreHitAt < 4000,
    });
    this.music.setIntensity(lvl);
  }

  /** Low health: a gasp and a red rim, at most every 6 s; Zoomies: a dust trail behind a hasted hero. */
  private bodyTick(frame: ViewFrame, dt: number): void {
    if (!this.welcome) return;
    const me = frame.byId.get(this.welcome.slot);
    // LoL pass (lane C): the low-health vignette follows the HP every frame (off while dead)
    this.lowHp ??= new LowHp(this.ui);
    this.lowHp.update(me && me.maxHp > 0 ? me.hp / me.maxHp : 1, !me || me.state === 'dead');
    if (!me || me.state === 'dead' || me.maxHp <= 0) {
      this.wasLow = false;
      this.wasDead = true;
      return;
    }
    if (this.wasDead) {
      this.wasDead = false;
      this.clearTowerWarnings();
    }
    const low = me.hp < me.maxHp * 0.25;
    const now = performance.now();
    if (low && !this.wasLow && now - this.lowAt > 6000) {
      this.lowAt = now;
      sfx.play('gasp');
      // LoL pass (lane C): the persistent vignette (render/fx/lowHp.ts) replaced the one-shot red rim flash here
    }
    this.wasLow = low;
    // round 1 tier perks: an Epic frame owner's Nap sparkles, a Legendary one's rises in a gold column
    const tier = this.setup.frame === 'frame.legendary' ? 2 : this.setup.frame === 'frame.epic' ? 1 : 0;
    if (tier && me.state === 'napping') {
      this.napFxAt -= dt;
      if (this.napFxAt <= 0) {
        this.napFxAt = 0.1;
        const p = new THREE.Vector3(toX(me.fx), 0.3, toZ(me.fy));
        this.view.particles.ring(p, { n: tier === 2 ? 5 : 3, r0: 0.7, speed: [0.2, 0.5], up: tier === 2 ? 3.2 : 1.6, color: tier === 2 ? 0xffd34d : 0xc79bff, alpha: 0.9, additive: true, size: [0.12, 0.22], life: [0.6, 0.9], fade: FADE.LINEAR });
      }
    }
    this.trailAt -= dt;
    const zoom = ((BuffFlag as Record<string, number>).Zoomies ?? 0) | BuffFlag.Hasted;
    if ((me.buffs & zoom) !== 0 && me.speed > 2 && this.trailAt <= 0) {
      this.trailAt = 0.06;
      const p = new THREE.Vector3(toX(me.fx), 0.15, toZ(me.fy));
      this.view.particles.burst(p, { n: 2, shape: SHAPE.PUFF, color: 0xfff4e0, alpha: 0.7, size: [0.25, 0.4], sizeEnd: 1.3, life: [0.3, 0.45], speed: [0.2, 0.6], up: 0.4, drag: 2 });
      this.view.particles.burst(p, { additive: true, n: 1, shape: SHAPE.STAR4, color: 0x9be3c4, intensity: 1.6, size: [0.12, 0.2], life: [0.3, 0.4], speed: [0.3, 0.8], up: 0.8 });
    }
  }

  /** One animation frame. */
  frame(dt: number): void {
    if (this.disposed) return;
    const scale = this.view.juice.timeScale(dt);
    const frame = this.paused ? this.buffer.sample(this.buffer.renderTick) : this.buffer.advance(dt, scale);
    if (frame && !this.paused) this.host.present?.(frame);
    this.frameNow = frame;
    // "Go!" only when the drop is watched live: a rejoin's catch-up jumps from a gate snapshot to the match clock
    if (frame && this.lastPhase === 'gate' && frame.latest.clock.phase === 'play' && frame.latest.clock.tick - this.lastGateTick <= GO_MAX_JUMP_TICKS) this.goFlash();
    if (frame && frame.latest.clock.phase === 'gate') this.lastGateTick = frame.latest.clock.tick;
    if (frame && frame.latest.clock.phase !== 'ended') this.lastPhase = frame.latest.clock.phase;
    if (frame) {
      this.turnToInput(frame);
      // MAP-GAPS A14: the input grid mirrors the standing towers and cores
      syncStructures(frame.latest.entities);
      this.units.length = 0;
      for (const e of frame.entities) this.units.push({ id: e.id, kind: e.kind, team: e.team, x: e.fx, y: e.fy, hp: e.hp, maxHp: e.maxHp, state: e.state });
      this.ccHaptic(frame);
      this.events.length = 0;
      for (const ev of this.buffer.takeEvents(this.events)) {
        this.view.effects.handle(ev);
        this.feelEvent(ev);
        this.minimap.event(ev);
        const a = this.announcer;
        if (a) this.present(a.feed(ev));
        const fe = ev as AnyEvent;
        // the trickle (2 XP a second) is silent: a pop every second was noise
        if (isFun(fe) && fe.type === 'xp' && fe.id === this.view.mySlot && fe.reason !== 'trickle') this.xpPops.add(fe.amount, fe.tick ?? frame.latest.clock.tick);
        this.beatsFrom(ev, frame);
        // The attack tip is done once the player's hit lands on a minion (a right-click, A-move or the ATK button).
        this.objClock?.feed(ev);
        if (ev.type === 'death' && ev.id >= 0 && ev.id < 6) this.heroDeathTick[ev.id < 3 ? 0 : 1] = ev.tick;
        if (ev.type === 'hit') {
          const dst = frame.byId.get(ev.dst);
          if (dst?.kind === 'core') {
            // Round 2: map damage (takedown chips, Sudden Death burn, takedown core damage) is not "under attack".
            const src = ev.src >= 0 ? frame.byId.get(ev.src) : undefined;
            const from: CoreSource =
              ev.src < 0
                ? ev.kind === 'chip' || this.heroDeathTick[dst.team === 1 ? 1 : 0] === ev.tick
                  ? 'takedowns'
                  : 'decay'
                : src?.kind === 'minion'
                  ? 'minions'
                  : src?.kind === 'hero'
                    ? 'heroes'
                    : 'towers';
            this.coreLog.add(dst.team, ev.tick, from, ev.amount);
            this.coreHit(dst, ev.src >= 0, frame);
            this.coreHitAt = performance.now();
          }
        }
        if (ev.type === 'hit' && ev.src === this.view.mySlot) {
          const dst = frame.byId.get(ev.dst);
          if (dst && dst.kind === 'hero' && dst.team !== this.view.myTeam) this.dealtAt = performance.now();
        }
        if (ev.type === 'hit' && ev.dst === this.view.mySlot) {
          const src = frame.byId.get(ev.src);
          if (src && (src.kind === 'tower' || src.kind === 'core') && src.team !== this.view.myTeam) this.towerHit(ev.src);
          if (src && src.team !== this.view.myTeam) {
            const tower = src.kind === 'tower' || src.kind === 'core';
            this.hurtBy.push({ name: src.hero ? (this.names[ev.src] ?? HERO_TEXT[src.hero].title) : tower ? 'a tower' : 'minions', tower, at: performance.now() });
            if (this.hurtBy.length > 24) this.hurtBy.shift();
          }
        }
        if (ev.type === 'hit') this.scoreboard?.hit(ev.src, ev.dst, ev.amount);
        if (ev.type === 'buff' && ev.kind === 'takedown') {
          this.scoreboard?.credit(ev.id);
          if (ev.id === this.view.mySlot) {
            const who = this.view.companions?.cheer();
            if (who) this.hud?.note(`${who} cheered your takedown`);
          }
        }
        if (ev.type === 'hit' && (ev.src === this.view.mySlot || ev.dst === this.view.mySlot)) {
          const other = frame.byId.get(ev.src === this.view.mySlot ? ev.dst : ev.src);
          if (other && other.team !== this.view.myTeam) this.lastUseful = performance.now();
        }
        if (ev.type === 'hit' && ev.src === this.view.mySlot) {
          this.hitsLanded++;
          // round 1: any hit the player lands counts (it was minions only, so the tip came at 1:33 after 18 hits)
          const dst = frame.byId.get(ev.dst);
          if (dst && dst.team !== this.view.myTeam) this.tips.complete('attack');
        }
      }
      this.tipTriggers(frame);
      this.objClock?.frame(frame.latest.entities, frame.latest.clock);
      this.goalTick(frame);
      this.helpTick(frame);
      this.hudRectsTick();
      this.overhead.guide = this.laneArrow ?? (this.goals.enabled ? this.goalTarget(frame) : this.guideTarget(frame));
      // fun pass (playtest #13): on a phone, no "+XP" pop over a hero fight (the XP bar still fills; the fight's damage
      // numbers and combo need the room). XP from that fight is not shown later either.
      const quietXp = document.documentElement.dataset.touch === '1' && this.inFight();
      for (const n of this.xpPops.flush(frame.tick)) {
        if (quietXp) continue;
        const at = this.heroScreen();
        if (at) this.view.juice.popXp(n, at.x + (Math.random() - 0.5) * 40, at.y - 24);
      }
      if (!this.ended && !this.paused) this.musicTick(frame);
      this.bodyTick(frame, dt);
    }
    this.orders?.update();
    this.desktop?.update(dt);
    this.view.update(frame, this.paused ? 0 : dt);
    this.overhead.watchers = this.view.watchers;
    this.overhead.draw(frame, this.gr.camera, (e) => (e.hero ? HERO_SCALE[e.hero] : 1));
    this.minimap.draw(frame);
    this.tips.update(dt);
    this.goals.update(this.paused ? 0 : dt);
    this.pingBtn?.classList.toggle('cool', !(this.orders?.pingReady() ?? false));
    if (this.setup.pingTip && !this.pingTipShown && frame && frame.tick >= PING_TIP_TICK && !this.ended) {
      // GAPS B1: one tip in match 2. It is the only ping lesson and match 2 is its only chance, so it counts as shown
      // only once it is on screen; a stale or overflow drop from the banner queue queues it again.
      const juice = this.view.juice;
      if (juice.showing === PING_TIP_TITLE) {
        this.pingTipShown = true;
        if (this.e2e) document.documentElement.dataset.pingTip = '1';
      } else if (!juice.queued(PING_TIP_TITLE)) {
        const touch = document.documentElement.dataset.touch === '1';
        // LoL pass (lane B): an announcer line may cut in (an ally slain, a tower); the tip then waits at the front of
        // the queue (a long `stale`) and comes back for the rest of its time instead of being dropped
        juice.push({
          ...bannerNote({
            title: PING_TIP_TITLE,
            sub: touch ? 'Tap the paw for orders. Hold the map: go here. Hold an enemy face: focus.' : 'Hold G for orders. Alt-click: go here, or focus an enemy hero.',
            tone: 'info',
            hold: PING_TIP_HOLD,
          }),
          stale: PING_TIP_STALE_MS,
        });
      }
    }
    if (this.talents?.waiting) {
      this.calmFor = this.inFight() ? 0 : this.calmFor + dt * this.buffer.speed;
      if (this.calmFor >= 2.5) this.talents.reveal();
    }
    this.talents?.tick(!this.paused && !this.ended, this.buffer.speed);
    // the centre band: the death recap holds it while dead, an open talent card while it is up
    const nowMs = performance.now();
    const meNow = frame && this.welcome ? frame.byId.get(this.welcome.slot) : undefined;
    if (meNow?.talents) this.lastTalents = meNow.talents;
    this.stage.hold('recap', meNow?.state === 'dead', nowMs);
    this.stage.hold('talent', this.talents?.open ?? false, nowMs);
    // LoL pass (lane A): while out, the rail's resting line counts the respawn down with the lives left
    this.respawnLine(meNow);
    if (this.e2e) {
      this.telemetry(frame);
      document.documentElement.dataset.stage = this.stage.top(nowMs) ?? '';
      // Wave C (C4): card-tier effect particles started so far (perf and skins specs)
      document.documentElement.dataset.cardFx = String(this.view.effects.cards?.emitted ?? 0);
    }
    if (frame && this.hud && this.welcome) {
      const me = frame.byId.get(this.welcome.slot) ?? null;
      let lvSum = 0;
      let lvN = 0;
      for (const e of frame.entities) {
        if (e.kind === 'hero' && e.team !== this.welcome.team && e.team !== 2 && e.level) {
          lvSum += e.level;
          lvN++;
        }
      }
      this.hud.blockTips(!!this.menu || this.scoreOn || this.paused || this.ended || (this.talents?.open ?? false) || (this.view.lifecycle?.holdTips ?? false) /* lifecycle: P2-12 */);
      // LoL pass (lane B): low quality greys the world with an overlay, not a filter on the WebGL canvas
      this.hud.lowQuality = this.gr.settings.tier === 'low';
      this.hud.update(me, frame.latest.clock, frame.latest.score, this.welcome.team, lvN ? lvSum / lvN : 0, this.goals.standingTitle ?? this.lcGateTitle());
      const lock = this.touch?.isEnabled ? this.touch.lockedId() : null;
      this.hud.stripUpdate(frame.byId, frame.tick, lock, this.nearEnemies(frame, me, lock));
      this.objStrip(frame);
      this.overhead.myToy = me?.toy ?? 0;
      this.underdogLine(frame);
      this.overhead.targetLock = lock !== null && this.touch ? { id: lock, left: this.touch.lock.left(performance.now()) } : null;
      this.behindCall(frame.latest.score, this.welcome.team);
      const hero = this.welcome.picks[this.welcome.slot];
      const trick = this.welcome.tricks[this.welcome.slot];
      // Wave C (C2): the sweeps use the cooldowns at this level (ranks) with the picked talents
      this.touch?.update(me?.cooldowns ?? null, [0, 1, 2, 3, 4].map((i) => maxCooldown(hero, i as 0, trick, me?.branch === true, me?.level ?? 1, me?.talents)), me?.level ?? 1);
      if (this.scoreOn) this.scoreboard?.show(true, frame);
    }
  }

  private respawnShown = '';

  /** The own hero in the newest snapshot (the input steers and casts from there, ahead of the drawn hero). */
  private ownSim: { x: number; y: number; tick: number } | null = null;

  /** UX pass 2: the own hero's cooldowns and state in the newest snapshot (Orders: the flash goes by these). */
  private ownNewest: { cooldowns: readonly number[] | null; state: EntitySnap['state'] } | null = null;

  private simOwn(s: Snapshot): void {
    if (!this.welcome) return;
    const me = s.entities.find((e) => e.id === this.view.mySlot);
    if (!me) return;
    this.ownNewest = { cooldowns: me.cooldowns ?? null, state: me.state };
    if (me.state === 'dead') {
      this.ownSim = null;
      return;
    }
    if (this.ownSim) {
      this.ownSim.x = me.x;
      this.ownSim.y = me.y;
      this.ownSim.tick = s.clock.tick;
    } else this.ownSim = { x: me.x, y: me.y, tick: s.clock.tick };
  }

  /**
   * The own hero's casts as the host hands the events over (the render clock plays them later): the cast buffer
   * lets an order held behind a cast go, and the touch input learns the tick its run-on lands (orders.ts, touchControls.ts).
   */
  private rawOwnEvents(list: readonly SimEvent[]): void {
    const me = this.view.mySlot;
    for (const ev of list) {
      // feel pass B4: an enemy's E cast too (the touch auto-target skips a Howler arguing back)
      if (ev.type === 'cast' && ev.src !== me && ev.slot === 2) {
        this.touch?.onSimEvent(ev);
        continue;
      }
      if ((ev.type !== 'cast' && ev.type !== 'windup') || ev.src !== me) continue;
      this.orders?.applied(ev);
      this.touch?.onSimEvent(ev);
    }
  }

  /** `?e2e=1` only (flash-touch.spec.ts): the own hero's sim position per snapshot, [tick, x, y], the last 900. */
  private ownTrack: number[][] | null = null;

  private trackOwn(s: Snapshot): void {
    if (!this.ownTrack) {
      this.ownTrack = [];
      e2eHook('Track', this.ownTrack);
    }
    const me = s.entities.find((e) => e.id === this.view.mySlot);
    if (!me) return;
    this.ownTrack.push([s.clock.tick, me.x, me.y]);
    if (this.ownTrack.length > 900) this.ownTrack.splice(0, this.ownTrack.length - 900);
  }

  /**
   * Lane F (F6): once a match, a low-priority rail line when the player's team is 2+ Toy tiers behind after the
   * difficulty's catch-up start (the sim then pays the team behind on Fish comeback Fish, +1 a second to its
   * lowest-Fish hero: DifficultyRules.catchUpFrom, FISH.comebackPerSecond). Toys are the client's view of that gap.
   */
  private underdogLine(frame: ViewFrame): void {
    if (this.underdogSaid || this.ended || !this.welcome) return;
    if (frame.latest.clock.tick < DIFFICULTY_RULES[this.setup.difficulty].catchUpFrom) return;
    const toys = [0, 0];
    for (const e of frame.entities) if (e.kind === 'hero' && (e.team === 0 || e.team === 1)) toys[e.team] += e.toy ?? 0;
    const ours = toys[this.welcome.team];
    if (toys[1 - this.welcome.team] - ours < 2) return;
    this.underdogSaid = true;
    this.view.juice.push({ key: 'underdog', title: `Behind on Toys: +${FISH.comebackPerSecond} Fish/s`, sub: 'Your team’s lowest-Fish hero earns extra Fish until you catch up.', tone: 'info', prio: 4 });
  }

  /**
   * C2, C3, C11c: the own hero's events for the input and the phone's haptics. A windup or cast confirms the cast
   * buffer's cast; a cast re-sends a held stick at once (the hero walks on); buzzes for a cast, a last hit, a
   * takedown, a Toy and a level-up.
   */
  private feelEvent(ev: SimEvent): void {
    const me = this.view.mySlot;
    switch (ev.type) {
      case 'windup':
        if (ev.src === me) this.orders?.onEvent(ev);
        return;
      case 'cast':
        if (ev.src !== me) return;
        this.orders?.onEvent(ev);
        this.touch?.onOwnCast();
        haptic('cast');
        return;
      case 'fish':
        if (ev.id === me) {
          this.fishBy[ev.reason] = (this.fishBy[ev.reason] ?? 0) + ev.amount;
          if (ev.reason === 'lastHit') {
            this.lastHitsSeen++;
            haptic('lastHit');
          }
        }
        // F4: the killer's Fish (kill, First Blood, shutdown) shows on its kill-feed row
        if ((ev.reason === 'kill' || ev.reason === 'firstBlood' || ev.reason === 'shutdown') && this.feedRow && this.feedRow.killer === ev.id && this.feedRow.tick === ev.tick) {
          this.feedRow.fish += ev.amount;
          this.hud?.feedFish(this.feedRow.el, this.feedRow.fish);
        }
        return;
      case 'buff':
        if (ev.id === me && ev.kind === 'takedown') haptic('takedown');
        return;
      case 'buy':
        if (ev.id === me) haptic('toy');
        return;
      case 'levelup':
        if (ev.id === me) haptic('levelUp');
        return;
      default:
        return;
    }
  }

  private ccWas = false;
  /** Own last-hit Fish events seen (e2e telemetry, C5). */
  private lastHitsSeen = 0;

  /** C11c: one buzz as the own hero gets stunned, rooted or feared. */
  private ccHaptic(frame: ViewFrame): void {
    const me = frame.byId.get(this.view.mySlot);
    const cc = !!me && me.state !== 'dead' && (me.buffs & (BuffFlag.Stunned | BuffFlag.Rooted | BuffFlag.Feared)) !== 0;
    if (cc && !this.ccWas) haptic('cc');
    this.ccWas = cc;
  }

  /**
   * C6: the own hero's model turns to the newest move order at once (the stick or a right-click), instead of waiting
   * for the sim's facing to come back through the snapshots. Only while it walks (never mid-cast, -swing, or under
   * crowd control) and for a moment after the order.
   */
  private turnToInput(frame: ViewFrame): void {
    const o = this.orders?.lastMove;
    const me = frame.byId.get(this.view.mySlot);
    if (!o || !me || (me.state !== 'moving' && me.state !== 'idle')) return;
    if ((me.buffs & (BuffFlag.Stunned | BuffFlag.Rooted | BuffFlag.Feared)) !== 0) return;
    if (performance.now() - o.at > 250 / Math.max(1, this.buffer.speed)) return;
    const dx = o.x - me.fx;
    const dy = o.y - me.fy;
    if (dx * dx + dy * dy < 250000) return;
    me.yaw = Math.atan2(dy, dx);
  }

  /**
   * Feel pass B3: the touch target-lock row shows only the enemy heroes within 1.5 × the attack range (and the locked
   * one), at most 3, nearest first.
   */
  private readonly near = new Set<number>();
  private nearEnemies(frame: ViewFrame, me: ViewEntity | undefined | null, lock: number | null): ReadonlySet<number> {
    this.near.clear();
    if (!me || me.state === 'dead' || !me.hero || !this.welcome) return this.near;
    const reach = basicRange(me.hero) * NEAR_ROW_K;
    const list: { id: number; d: number }[] = [];
    for (const e of frame.entities) {
      if (e.kind !== 'hero' || e.team === this.welcome.team || e.team > 1 || e.state === 'dead') continue;
      const d = Math.hypot(e.fx - me.fx, e.fy - me.fy);
      if (d <= reach || e.id === lock) list.push({ id: e.id, d });
    }
    list.sort((a, b) => a.d - b.d);
    for (const n of list.slice(0, NEAR_ROW_MAX)) this.near.add(n.id);
    return this.near;
  }

  /**
   * Feel pass B3: the objective timer in the top strip (it replaces the standing objective chip on the rail): the next
   * objective's icon and countdown from 10 s before it is up to 3 s after.
   */
  private objUpAt = -1;
  private objStrip(frame: ViewFrame): void {
    const timers = this.objClock?.timers() ?? [];
    let best: { key: string; left: number } | null = null;
    for (const t of timers) if (t.left > 0 && t.left <= OBJ_STRIP.before * TICK_HZ && (!best || t.left < best.left)) best = { key: t.key, left: t.left };
    const tick = frame.tick;
    if (best && best.left <= TICK_HZ) this.objUpAt = tick + best.left;
    const up = this.objUpAt >= 0 && tick >= this.objUpAt && tick - this.objUpAt <= OBJ_STRIP.after * TICK_HZ;
    this.hud?.objective(best ? { key: best.key, secs: Math.ceil(best.left / TICK_HZ) } : up ? { key: 'up', secs: 0 } : null);
  }

  /** "Back in 7 · 8 of 9 lives" on the rail's resting line while the player is out (cleared on respawn). */
  private respawnLine(me: { state: string; respawnIn?: number } | undefined): void {
    const dead = !!me && me.state === 'dead' && !this.ended;
    const lives = this.view.lifecycle?.hud.livesText ?? '';
    const text = dead ? `Back in ${Math.max(1, Math.ceil((me!.respawnIn ?? 0) / TICK_HZ))}${lives ? ` · ${lives}` : ''}` : '';
    if (text === this.respawnShown) return;
    this.respawnShown = text;
    // feel pass B3: the centred "Back in N" says it; the rail line stays only on desktop (its lives count is there)
    const touch = document.documentElement.dataset.touch === '1';
    this.view.juice.notify.rest('respawn', touch ? null : text || null, 'bad');
  }

  private telemetry(frame: ViewFrame | null): void {
    const d = document.documentElement.dataset;
    const me = frame?.byId.get(this.view.mySlot);
    if (me) d.me = `${Math.round(me.x)},${Math.round(me.y)},${me.state}`;
    d.ops = (this.orders?.recent ?? []).join(',');
    d.aim = this.view.aim ? '1' : '';
    // the basic attack range ring's radius (m) when drawn (A armed, a skill aimed, touch Attack held)
    d.atkRing = this.view.attackRingM > 0 ? this.view.attackRingM.toFixed(2) : '';
    d.casts = String(this.orders?.casts ?? 0);
    // C2 / C5 / C6 telemetry: cast buffer counters, Attack presses with nothing in reach, the drawn own position
    if (this.orders) d.castBuf = `${this.orders.buffers.kept},${this.orders.buffers.sent},${this.orders.buffers.expired},${this.orders.buffers.retried},${this.orders.busyWhy()},${this.orders.queued ?? ''},${this.orders.busyLeftMs}`;
    d.atkNone = String(this.touch?.atkNone ?? 0);
    // UX pass 2: the unit ATK rings now, the newest Attack order's target, last-hit / tower presses that found one
    d.atkTarget = this.touch?.atkPreview != null ? String(this.touch.atkPreview) : '';
    const sentId = this.orders?.lastAttackId ?? -1;
    d.atkSent = sentId >= 0 ? `${sentId}:${frame?.byId.get(sentId)?.kind ?? ''}` : '';
    d.extraHits = this.touch ? `${this.touch.extraHits.lasthit},${this.touch.extraHits.tower}` : '';
    // hold-to-select on ATK: the candidates shown and the selection while held; selector locks, cancels, last pick
    d.atkCands = this.view.atkCands ? this.view.atkCands.join(',') : '';
    d.atkSel = this.view.atkSelect != null ? String(this.view.atkSelect) : '';
    d.atkHold = this.touch?.atkHoldState() ?? '';
    d.atkSelN = this.touch ? `${this.touch.atkSel.locked},${this.touch.atkSel.cancelled},${this.touch.atkSel.last ?? ''},${this.touch.atkSel.kind},${this.touch.atkSel.why}` : '';
    d.atkLock = this.touch?.attackLockId() != null ? String(this.touch.attackLockId()) : '';
    // heading casts (Pounce and the escape dashes) sent on the touch press and on the release (heading.ts)
    d.heads = this.touch ? `${this.touch.heads.press},${this.touch.heads.fired},${this.orders?.holds ?? 0}` : '';
    d.lastHits = String(this.lastHitsSeen);
    if (me) d.meF = `${Math.round(me.fx)},${Math.round(me.fy)}`;
    d.hits = String(this.hitsLanded);
    const pick = this.touch?.lastPick;
    if (pick && d.atkN !== String(this.touch!.picks)) {
      d.atkN = String(this.touch!.picks);
      d.atk = JSON.stringify(pick);
    }
    d.walkin = this.orders?.walkingIn != null ? String(this.orders.walkingIn) : '';
    d.cancel = this.ui.querySelector('.pl-cancel.on') ? '1' : '';
    if (frame) {
      // Live units on the field (perf.spec.ts: the draw-call budget is for 6 heroes + 24 minions + 4 towers).
      let heroes = 0;
      let minions = 0;
      let towers = 0;
      for (const e of frame.entities) {
        if (e.state === 'dead') continue;
        if (e.kind === 'hero') heroes++;
        else if (e.kind === 'minion') minions++;
        else if (e.kind === 'tower') towers++;
      }
      d.units = `${heroes},${minions},${towers}`;
      // the fight camera's team-fight flag and the living heroes within 12 m of the player (anim captures)
      d.fight = this.view.fightCam.fight ? '1' : '';
      d.team = String(this.view.myTeam);
      let near = 0;
      if (me)
        for (const e of frame.entities) if (e.kind === 'hero' && e.state !== 'dead' && Math.hypot(e.x - me.x, e.y - me.y) < 12000) near++;
      d.near = String(near);
      // GAPS B2 (forfeit.spec.ts): the match tick, so a test can wait for the Forfeit time
      d.tick = String(frame.latest.clock.tick);
      // First-match tips (first-match.spec.ts): the tip on screen, those shown and done, and where on screen the
      // nearest enemy minion and hero are (so a test can right-click one).
      d.tip = this.tips.current ?? '';
      d.tipsShown = this.tips.shown.join(',');
      d.tipsDone = this.tips.completed.join(',');
      d.difficulty = this.setup.difficulty;
      d.goalsShown = this.goals.shown.join(',');
      d.goalsDone = this.goals.completed.join(',');
      const chip = this.objClock?.chip();
      d.objChip = chip ? `${chip.key}|${chip.title}` : '';
      d.rings = String(this.minimap.ringsDrawn);
      d.lock = String(this.touch?.lockedId() ?? '');
      d.locks = String(this.touch?.locks ?? 0);
      d.music = String(this.music.intensity);
      d.autos = String(this.touch?.autos ?? 0);
      d.pickups = String(this.view.pickups.count);
      d.level = String(me?.level ?? 0);
      d.hp = me && me.maxHp > 0 ? String(Math.round((100 * me.hp) / me.maxHp)) : '';
      d.foeMinion = this.nearestFoeOnScreen('minion');
      d.foeHero = this.nearestFoeOnScreen('hero');
      d.foeHeroId = this.foeId;
      d.allyFront = this.allyFrontOnScreen();
      const self = this.units.find((u) => u.id === this.view.mySlot);
      d.meScreen = self ? this.onScreen(self.x, self.y) : '';
      // LoL pass (lane A, rail.spec.ts): the player's drawn plate box, so a test can hold the rail off it
      this.overhead.boxes ??= [];
      const plate = this.overhead.boxes.find((b) => b.kind === 'hero' && b.id === this.view.mySlot);
      d.selfPlate = plate ? `${Math.round(plate.x0)},${Math.round(plate.y0)},${Math.round(plate.x1)},${Math.round(plate.y1)}` : '';
    }
  }

  /** The id of the enemy hero nearestFoeOnScreen('hero') last found (e2e: A5 lock spec), or ''. */
  private foeId = '';

  private nearestFoeOnScreen(kind: 'minion' | 'hero'): string {
    const me = this.units.find((u) => u.id === this.view.mySlot);
    if (!me || !this.welcome) return '';
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const u of this.units) {
      if (u.kind !== kind || !isEnemy(u, this.welcome.team) || u.state === 'dead') continue;
      const d = Math.hypot(u.x - me.x, u.y - me.y);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (kind === 'hero') this.foeId = best ? String(best.id) : '';
    if (!best) return '';
    return this.onScreen(best.x, best.y, `,${Math.round(bestD)}`);
  }

  /**
   * A point 1.5 m behind the allied minion furthest toward the enemy in the player's lane (within 12 m of the player
   * across the lane), on screen, or ''. first-match.spec.ts follows its wave with it like a careful new player.
   */
  private allyFrontOnScreen(): string {
    const me = this.units.find((u) => u.id === this.view.mySlot);
    if (!me || !this.welcome) return '';
    const team = this.welcome.team;
    const ahead = team === 0 ? 1 : -1;
    let best: Unit | null = null;
    for (const u of this.units) {
      if (u.kind !== 'minion' || u.team !== team || u.state === 'dead' || Math.abs(u.y - me.y) > 12000) continue;
      if (!best || (u.x - best.x) * ahead > 0) best = u;
    }
    return best ? this.onScreen(best.x - ahead * 1500, best.y) : '';
  }

  /** Client pixel of a sim point when it is well inside the canvas (no edge pan for a test's click), else ''. */
  private onScreen(x: number, y: number, suffix = ''): string {
    const c = this.gr.renderer.domElement;
    const p = project(this.gr.camera, c, toX(x), 0.4, toZ(y));
    const r = c.getBoundingClientRect();
    const m = 60;
    const inside = p.on && p.x > r.left + m && p.x < r.right - m && p.y > r.top + m && p.y < r.bottom - m;
    return inside ? `${Math.round(p.x)},${Math.round(p.y)}${suffix}` : '';
  }

  private guideDone = false;

  /**
   * First match only, the first two minutes: where the ground arrow points (the nearest allied minion, else the
   * Sunny Lane bend), until the player has walked up to an allied wave once.
   */
  /**
   * Round 1: "my hero was pinned against the invisible wall at the enemy fountain for 3.5 minutes". Held into a wall
   * for 2 s: a banner says why (the enemy fountain cannot be entered) and a ground arrow points back to the lane; 45 s
   * without a fight: "Your team needs you in Sunny Lane" with the same arrow.
   */
  private helpTick(frame: ViewFrame): void {
    if (!this.welcome || this.ended) return;
    const me = frame.byId.get(this.welcome.slot);
    const now = performance.now();
    const sp = Math.max(1, this.buffer.speed);
    if (this.lastUseful < 0) this.lastUseful = now;
    if (!me || me.state === 'dead') {
      this.stuckFrom = now;
      this.lastUseful = now;
      return;
    }
    const team = this.welcome.team;
    const fx = team === 0 ? MAP.width - FOUNTAIN.x : FOUNTAIN.x;
    const nearFountain = Math.hypot(me.fx - fx, me.fy - FOUNTAIN.y) < FOUNTAIN.radius + 8000;
    this.overhead.enemyFountain = nearFountain ? { x: fx, y: FOUNTAIN.y, r: FOUNTAIN.radius } : null;
    if (me.state !== 'moving' || Math.hypot(me.fx - this.stuckAt.x, me.fy - this.stuckAt.y) > 600) {
      this.stuckAt = { x: me.fx, y: me.fy };
      this.stuckFrom = now;
    } else if (now - this.stuckFrom > 2000 / sp && now - this.stuckSaidAt > STUCK_REPEAT_MS / sp) {
      this.stuckSaidAt = now;
      if (nearFountain) this.overhead.fountainPulse();
      if (this.coach('cant-go'))
        this.view.juice.banner(nearFountain ? { title: 'No entry: enemy fountain', sub: 'Back to the lane! Follow the arrow.', tone: 'info' } : { title: "Can't go that way", sub: 'Back to the lane: follow the arrow.', tone: 'info' });
      this.pointToLane(frame, now + 5000 / sp);
    }
    // Round 2: 10 s of no progress (held into the trees, or walking circles) brings the lane prompt, not only 45 s
    // without a fight (it came after about 45 s for a player stuck beside the core).
    if (Math.hypot(me.fx - this.progressAt.x, me.fy - this.progressAt.y) > 3000 || now - this.lastUseful < 3000 / sp) {
      this.progressAt = { x: me.fx, y: me.fy, t: now };
    }
    // (a veteran waiting in a bush is left alone: only new players, or a hero that keeps walking without getting anywhere)
    const noProgress = (this.setup.newPlayer || me.state === 'moving') && frame.latest.clock.seconds > 20 && now - this.progressAt.t > 10000 / sp;
    if (
      frame.latest.clock.seconds > LANE_HELP_FROM_S &&
      (noProgress || (frame.latest.clock.seconds > 60 && now - this.lastUseful > 45000 / sp)) &&
      now - this.idleSaidAt > (noProgress ? 15000 : 60000) / sp
    ) {
      this.idleSaidAt = now;
      this.lastUseful = now;
      let lane = this.pointToLane(frame, now + 8000 / sp);
      // the same lane for 30 s: it named Puddle Lane, then Sunny Lane, within seconds
      if (this.laneSaid && now - this.laneSaid.at < 30000 / sp) lane = this.laneSaid.lane;
      else this.laneSaid = { lane, at: now };
      if (this.coach('lane-help')) this.view.juice.banner({ title: `Help in ${lane}!`, sub: 'Your team needs you: follow the arrow.', tone: 'info' });
    }
    if (this.laneArrow && now > this.laneArrowUntil) this.laneArrow = null;
    if (this.setup.newPlayer) this.diveWarn(me, team, now, sp);
  }

  private diveSaidAt = -1e9;
  private riverSaidAt = -1e9;
  private progressAt = { x: 0, y: 0, t: 0 };

  /**
   * Round 1 ("by 0:30 I had walked past the outer defences to the enemy core"): for newer players, a warning as soon
   * as they step within an enemy tower's reach + 2 m with none of their minions in it, before the tower locks on.
   */
  private diveWarn(me: { fx: number; fy: number }, team: number, now: number, sp: number): void {
    // Round 2: also when the player crosses the river with none of its minions ahead (the 0:16 river brawl)
    const across = team === 0 ? me.fx > MAP.riverX[1] : me.fx < MAP.riverX[0];
    if (across && now - this.riverSaidAt > 20000 / sp && now - this.diveSaidAt > 4000 / sp) {
      const ahead = this.units.some((u) => u.kind === 'minion' && u.team === team && u.state !== 'dead' && (team === 0 ? u.x > me.fx - 1500 : u.x < me.fx + 1500) && Math.abs(u.y - me.fy) < 12000);
      if (!ahead) {
        this.riverSaidAt = now;
        this.diveSaidAt = now;
        if (this.coach('dive')) this.towerAlert('dive', 'Too far ahead!', 'Past the river alone, heroes jump you. Wait for your wave.');
        return;
      }
    }
    // QA v2 #2: at most COACH_MAX.dive a match, and further apart each time (8 s, 24 s, 40 s)
    if (now - this.diveSaidAt < (8000 + 16000 * (this.coachN.get('dive') ?? 0)) / sp) return;
    if ((this.coachN.get('dive') ?? 0) >= COACH_MAX.dive) return;
    const reach = TOWERS.outer.range + 2000;
    for (const t of this.units) {
      if ((t.kind !== 'tower' && t.kind !== 'core') || t.team === team || t.team === 2 || t.state === 'dead') continue;
      if (Math.hypot(t.x - me.fx, t.y - me.fy) > reach) continue;
      const tanked = this.units.some((u) => u.kind === 'minion' && u.team === team && u.state !== 'dead' && Math.hypot(u.x - t.x, u.y - t.y) < TOWERS.outer.range);
      if (tanked) return;
      this.diveSaidAt = now;
      if (this.coach('dive')) this.towerAlert('dive', 'Too far ahead!', 'That tower hits hard. Let your wave walk in first.');
      return;
    }
  }

  /** Aim the ground arrow at the lane the team plays (most allied heroes; tie: Sunny) and name it. */
  private pointToLane(frame: ViewFrame, until: number): string {
    const team = this.welcome?.team ?? 0;
    const mid = 30000;
    let sunny = 0;
    let puddle = 0;
    for (const e of frame.entities) {
      if (e.kind !== 'hero' || e.team !== team || e.id === this.view.mySlot || e.state === 'dead') continue;
      if (e.fy >= mid) sunny++;
      else puddle++;
    }
    const top = sunny >= puddle;
    // the allied minion furthest along that lane, else the lane bend on our side
    let best: Unit | null = null;
    for (const u of this.units) {
      if (u.kind !== 'minion' || u.team !== team || u.state === 'dead' || (u.y >= mid) !== top) continue;
      if (!best || (team === 0 ? u.x > best.x : u.x < best.x)) best = u;
    }
    this.laneArrow = best ? { x: best.x, y: best.y } : { x: team === 0 ? 22000 : 78000, y: top ? 50000 : 10000 };
    this.laneArrowUntil = until;
    return top ? 'Sunny Lane' : 'Puddle Lane';
  }

  private guideTarget(frame: ViewFrame): { x: number; y: number } | null {
    if (!this.setup.firstMatch || this.guideDone || !this.welcome) return null;
    const me = frame.byId.get(this.welcome.slot);
    if (!me || frame.latest.clock.seconds > 120) {
      if (frame.latest.clock.seconds > 120) this.guideDone = true;
      return null;
    }
    if (frame.latest.clock.seconds < 6) return null;
    const team = this.welcome.team;
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const u of this.units) {
      if (u.kind !== 'minion' || u.team !== team || u.state === 'dead') continue;
      const d = Math.hypot(u.x - me.fx, u.y - me.fy);
      if (d < bd) {
        bd = d;
        best = { x: u.x, y: u.y };
      }
    }
    if (best && bd < 9000) {
      this.guideDone = true;
      return null;
    }
    // no wave out yet: the Sunny Lane bend on our side (POC.md §5 waypoints, mirrored for Woof)
    return best ?? { x: team === 0 ? 22000 : 78000, y: 50000 };
  }

  private tipTriggers(frame: ViewFrame): void {
    if (!this.tips.enabled || !this.welcome) return;
    const me = frame.byId.get(this.welcome.slot);
    if (!me || me.state === 'dead') return;
    let fight = false;
    for (const u of this.units) {
      if (!isEnemy(u, this.welcome.team)) continue;
      const d = Math.hypot(u.x - me.fx, u.y - me.fy);
      if (u.kind === 'minion' && d < 9000) this.tips.trigger('attack');
      if (u.kind === 'hero' && d < 8000) {
        this.tips.trigger('q');
        fight = true;
      }
    }
    this.tips.combat(fight);
    // The first wave (§12): once it has walked out for a few seconds, even if the player is not next to it yet.
    if (frame.latest.clock.seconds >= TIPS_FIRST_WAVE_S) this.tips.trigger('attack');
  }

  dispose(): void {
    this.peekOff?.();
    this.peekOff = null;
    if (this.disposed) return;
    this.disposed = true;
    if (this.youTimer !== undefined) clearTimeout(this.youTimer);
    this.youTimer = undefined;
    setProbeBlocked(false);
    setPvpEqualView(false);
    this.host.leave();
    this.host.dispose();
    this.desktop?.dispose();
    this.touch?.dispose();
    this.emoteOff?.();
    this.chromeOff?.();
    this.mp?.dispose();
    this.mp = null;
    this.hud?.dispose();
    this.scoreboard?.dispose();
    this.talents?.dispose();
    this.minimap.dispose();
    this.tips.dispose();
    this.goals.dispose();
    this.music.stop();
    sfx.hushVoice();
    this.view.dispose();
    this.ui.remove();
    delete document.documentElement.dataset.match;
    delete document.documentElement.dataset.touch;
  }
}
