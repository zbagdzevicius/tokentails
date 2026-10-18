/**
 * One match on the client: the LocalHost (sim Worker), the snapshot buffer, the match view, input (desktop and
 * touch), HUD, minimap, scoreboard, talents, first-match tips and the Esc menu. The app's frame loop calls
 * `frame(dt)`; the session calls back once with the result and the replay.
 */
import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import { intensityOf, Music } from '../audio/music';
import { LocalHost } from '../host/local-host';
import type { WelcomeMsg } from '../host/protocol';
import { maxCooldown } from '../input/abilities';
import { DesktopInput, type InputHost } from '../input/desktop';
import { Orders } from '../input/orders';
import { groundAt, project } from '../input/screen';
import { isEnemy, type Unit } from '../input/targeting';
import { TouchControls } from '../input/touch/touchControls';
import type { Companion } from '../meta/roster';
import { Tips } from '../onboarding/tips';
import { Objectives, type BeatId } from '../onboarding/objectives';
import { Announcer, XpPops, type Moment } from '../render/announcer';
import { isFun, type AnyEvent } from '../render/feelEvents';
import type { GuideMode } from './firstSession';
import { lookKey, type FrameId, type Look } from '../render/cosmetics';
import { bakePortrait } from '../render/portraits';
import { toX, toZ } from '../render/coords';
import { FADE, SHAPE } from '../render/fx/Particles.js';
import { GameView } from '../render/gameView';
import { SnapBuffer, type ViewFrame } from '../render/interp';
import type { GameRenderer } from '../render/renderer';
import { HERO_SCALE } from '../render/views/models';
import { FOUNTAIN, MAP } from '../data/map';
import { TOWERS } from '../data/towers';
import { HEROES } from '../data/heroes';
import { TICK_HZ, TIMELINE } from '../data/timeline';
import { BuffFlag, type Difficulty, type HeroId, type MatchResult, type ReplayRecord, type SimEvent, type TrickId } from '../sim/api';
import { HERO_TEXT, slotNames, TRICK_TEXT } from '../ui/heroText';
import { icon } from '../ui/icons';
import { Hud, type FeedName } from '../ui/hud';
import { Minimap } from '../ui/minimap';
import { Overhead } from '../ui/overhead';
import { Scoreboard } from '../ui/scoreboard';
import { Stage } from '../ui/stage';
import { menuScreen, RESULTS_AFTER_END_MS } from '../ui/screens';
import { CoreLog, endCause, type CoreSource } from './endCause';
import { TalentPicker } from '../ui/talents';

export interface MatchSetup {
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
}

export interface SessionHooks {
  onEnd(e: MatchEnd): void;
  onTalent?(tier: number, choice: number): void;
  onLeave(): void;
  onMute(m: boolean): void;
  onError(msg: string): void;
  onPaused?(p: boolean): void;
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

export class MatchSession {
  readonly host: LocalHost;
  readonly buffer = new SnapBuffer();
  readonly view: GameView;
  readonly ui: HTMLElement;
  /** Round 1: one centre-screen item at a time (ui/stage.ts). */
  readonly stage: Stage;
  private orders: Orders | null = null;
  private desktop: DesktopInput | null = null;
  private touch: TouchControls | null = null;
  private hud: Hud | null = null;
  private overhead: Overhead;
  private minimap: Minimap;
  private scoreboard: Scoreboard | null = null;
  private talents: TalentPicker | null = null;
  private tips: Tips;
  private goals: Objectives;
  private announcer: Announcer | null = null;
  private readonly xpPops = new XpPops();
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
  private disposed = false;
  private deathsBy: Record<string, number> = {};
  /** Display names by slot ("Clem 2" for a team's second Clem). */
  private names: string[] = [];
  /** Count of real input events (analytics human filter). */
  activity = 0;
  /** The player's hits that landed (e2e telemetry). */
  private hitsLanded = 0;
  /** `?e2e=1`: mirror a few facts into html data attributes for Playwright (no window globals). */
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
        // push the camera in on the falling core (the slow-mo comes from effects)
        this.view.lookAt(who.x, who.z, 10);
        this.view.zoomTarget = Math.max(0.6, this.view.zoomTarget * 0.75);
      },
    });
    this.view.juice.stage = this.stage;
    this.view.juice.speed = Math.max(1, Math.min(64, Math.round(setup.speed ?? 1)));
    this.overhead = new Overhead(this.ui);
    this.overhead.goldPlate = setup.frame === 'frame.legendary';
    this.minimap = new Minimap(this.ui, {
      lookAt: (x, z) => this.view.lookAt(x, z),
      moveTo: (x, y) => this.orders?.move(x, y),
      viewQuad: () => this.viewQuad(),
      mySlot: () => this.view.mySlot,
      myTeam: () => this.view.myTeam,
    });
    this.tips = new Tips(this.ui, setup.firstMatch);
    this.goals = new Objectives(this.ui, setup.guide ?? 'off');
    this.minimap.pickups = () => this.view.pickups.list();
    this.host = new LocalHost();
    this.buffer.speed = Math.max(1, Math.min(64, Math.round(setup.speed ?? 1)));
    this.host.listen({
      welcome: (w) => this.onWelcome(w),
      snap: (s) => this.buffer.push(s),
      events: (_t, list) => this.buffer.pushEvents(list),
      end: (result, replay) => this.onEnd(result, replay),
      error: (m) => hooks.onError(m),
    });
    this.host.join({ hero: setup.hero, trick: setup.trick, difficulty: setup.difficulty, seed: setup.seed, speed: setup.speed });
    // Hold the sim until the scene has drawn and the countdown ran (the clock read 0:25 on a slow first load).
    this.host.pause(true);
    document.documentElement.dataset.match = 'loading';
  }

  get matchId(): string | null {
    return this.welcome?.matchId ?? null;
  }

  private onWelcome(w: WelcomeMsg): void {
    this.welcome = w;
    this.view.setTeam(w.slot, w.team, w.tricks);
    this.view.setSpecies(HEROES[w.picks[0]]?.side === 'dog');
    this.view.dressBots(w.seed, w.picks);
    this.view.dress(this.setup.look ?? null, this.setup.companions ?? []);
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
      nowMs: () => performance.now(),
    };
    this.orders = new Orders(env);
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
    };
    this.desktop = new DesktopInput(inputHost);
    this.touch = new TouchControls(inputHost, this.ui, this.desktop);
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.touch.enable(coarse);
    const ht = HERO_TEXT[hero];
    this.touch.setIcons({ q: icon(ht.abilities[0].icon), w: icon(ht.abilities[1].icon), e: icon(ht.abilities[2].icon), r: icon(ht.abilities[3].icon), trick: icon(TRICK_TEXT[trick].icon) });
    this.tips.touch = coarse;
    this.tips.padMode = () => this.desktop?.padMode;
    this.tips.names = { q: ht.abilities[0].name, e: ht.abilities[2].name, r: ht.abilities[3].name };
    this.goals.touch = coarse;
    this.goals.names = { q: ht.abilities[0].name, r: ht.abilities[3].name };
    // sim v5 species teams: a hero twice in one team, the second one is "Sage 2" (one table for every label)
    this.names = slotNames(w.picks, w.seed, w.slot);
    this.announcer = new Announcer(w.slot, w.team, (s) => this.names[s] ?? 'A hero');
    this.overhead.names = this.names;
    this.overhead.bounty = (slot) => {
      const snap = this.frameNow?.byId.get(slot)?.bountyStreak ?? 0;
      return Math.max(this.announcer?.bounty(slot) ?? 0, snap >= 3 ? snap : 0);
    };
    this.music.start();
    if (this.setup.look) bakePortrait(this.gr, hero, this.setup.look);
    this.hud = new Hud(this.ui, hero, trick, {
      onSlot: (i) => {
        const me = this.units.find((u) => u.id === w.slot);
        if (!me || !this.orders) return;
        if (i === 5) this.orders.nap();
        else this.orders.cast(i as 0 | 1 | 2 | 3 | 4, me.x + Math.cos(this.view.me()?.yaw ?? 0) * 2000, me.y + Math.sin(this.view.me()?.yaw ?? 0) * 2000);
      },
    }, this.setup.look ?? null);
    const portrait = this.ui.querySelector<HTMLElement>('.pl-portrait');
    if (portrait && this.setup.frame) portrait.dataset.frame = this.setup.frame;
    if (portrait && this.setup.title) portrait.dataset.title = this.setup.title;
    if (this.e2e) {
      const d = document.documentElement.dataset;
      d.matchLook = lookKey(this.setup.look);
      d.matchFrame = this.setup.frame ?? '';
      d.kittens = String(this.view.companions?.count ?? 0);
      d.squadNames = (this.setup.companions ?? []).slice(0, 2).map((c) => c.name).join(',');
    }
    this.scoreboard = new Scoreboard(this.ui, w.picks, w.slot, this.names);
    this.scoreboard.root.addEventListener('pointerdown', (e) => {
      if (!this.scoreboard?.root.classList.contains('tap')) return;
      e.stopPropagation();
      this.showScores(false);
    });
    this.mountTouchChrome();
    this.talents = new TalentPicker(this.ui, hero, (tier, choice) => {
      this.orders?.talent(tier, choice);
      this.hooks.onTalent?.(tier, choice);
      sfx.play('click');
    });
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
    this.countdown(() => {
      document.documentElement.dataset.match = 'live';
      setTimeout(() => this.tips.trigger('move'), 5000 / Math.max(1, this.buffer.speed));
    });
  }

  private gateNoteAt = -1e9;

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
    const at = this.heroScreen();
    const left = Math.max(1, Math.ceil(clock.nextPhaseIn / TICK_HZ));
    if (at) this.view.juice.pop(`Gates open in ${left}...`, at.x, at.y - 30, 'info');
  }

  private talentsBlock(): boolean {
    return false;
  }

  private onKill(e: Extract<SimEvent, { type: 'death' }>, victim: { kind: string; hero?: HeroId; team: number } | null, killer: { kind: string; hero?: HeroId; team: number } | null): void {
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
    const victimName = e.id === this.view.mySlot ? 'You' : (this.names[e.id] ?? (victim.hero ? HERO_TEXT[victim.hero].title : 'A hero'));
    const killerLabel = e.killer === this.view.mySlot ? 'You' : killer?.kind === 'hero' && this.names[e.killer] ? this.names[e.killer] : killerName(killer);
    this.hud?.kill({ name: killerLabel, rel: rel(killer?.team, e.killer) }, { name: victimName, rel: rel(victim.team, e.id) }, good);
  }

  private chromeOff: (() => void) | null = null;

  /**
   * Touch has no Esc or Tab: a pause button at the top (menu with Scores, Sound, Leave), a tap on the score bar
   * shows the scoreboard, and turning the phone to portrait pauses the bot match (the rotate prompt covers it).
   */
  private mountTouchChrome(): void {
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
    this.ui.appendChild(b);
    const score = this.ui.querySelector<HTMLElement>('.pl-score');
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

  /** The "Starter" emote (owned): a chip by the score bar and the T key. Render only; nothing is sent to the sim. */
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
      this.minimap.ping(core.fx, core.fy, color, 4000);
      return;
    }
    this.view.juice.banner({ title: ours ? 'Our core is under attack!' : 'Their core is under attack!', tone: ours ? 'bad' : 'good', urgent: true });
    this.minimap.ping(core.fx, core.fy, color);
  }

  private alertEl: HTMLElement | null = null;
  private wasDead = false;
  private usedUlt = false;
  private alertAt = -1e9;
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
    return !!last && performance.now() - last.at < 3000 / Math.max(1, this.buffer.speed);
  }

  /** Hide the tower alert and the "Tower aiming at you!" lock-on (on death, on respawn, when no tower shoots). */
  private clearTowerWarnings(): void {
    this.overhead.clearLocks(this.view.mySlot);
    const el = this.alertEl;
    if (!el) return;
    el.classList.remove('on');
    el.innerHTML = '';
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
    this.towerAlert(
      lockOn
        ? `${icon('shield')}<b>Tower aiming at you!</b><span>Step out of its ring, or let your minions walk in first.</span>`
        : `${icon('shield')}<b>Tower is hitting you!</b><span>Step back until your minions walk in.</span>`,
      now,
    );
  }

  /** Show the red tower alert (it claims the centre band: ui/stage.ts). */
  private towerAlert(html: string, now: number): void {
    if (!this.alertEl) {
      this.alertEl = document.createElement('div');
      this.alertEl.className = 'pl-alert';
      this.alertEl.setAttribute('role', 'alert');
      this.ui.appendChild(this.alertEl);
    }
    const el = this.alertEl;
    el.innerHTML = html;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    this.stage.claim('alert', 2400 / Math.max(1, this.buffer.speed), now);
    sfx.play('click', { vol: 0.5, rate: 0.6 });
    setTimeout(() => {
      el.classList.remove('on');
      setTimeout(() => {
        if (!el.classList.contains('on')) el.innerHTML = '';
      }, 300);
    }, 2400 / Math.max(1, this.buffer.speed));
  }

  private marker(x: number, z: number, attack: boolean): void {
    const p = new THREE.Vector3(x, 0.08, z);
    this.view.particles.single(p, { shape: SHAPE.RING, color: attack ? 0xff4d5e : 0x9be3c4, intensity: 1.6, size0: 1.2, size1: 0.2, life: 0.35, additive: true });
    this.view.particles.ring(p, { n: 6, r0: 0.5, speed: [0.5, 1], up: 0.2, color: attack ? 0xff4d5e : 0x9be3c4, alpha: 0.8, additive: true, size: [0.1, 0.16], life: [0.25, 0.35], fade: FADE.LINEAR });
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
  private countdown(go: () => void): void {
    const speed = Math.max(1, this.buffer.speed);
    const el = document.createElement('div');
    el.className = 'pl-count';
    el.setAttribute('aria-live', 'polite');
    this.ui.appendChild(el);
    const steps = ['3', '2', '1', 'Go!'];
    let i = 0;
    const next = (): void => {
      if (this.disposed) return;
      if (i === steps.length - 1) {
        if (!this.menu) this.host.pause(false);
        go();
      }
      if (i >= steps.length) {
        el.remove();
        return;
      }
      el.textContent = steps[i];
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
      i++;
      setTimeout(next, (i === steps.length ? 600 : 700) / speed);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => next()));
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
      onScores: () => this.showScores(true),
      onResume: () => this.resume(),
      onMute: (m) => {
        this.muted = m;
        this.hooks.onMute(m);
      },
      onLeave: () => {
        this.resume();
        this.hooks.onLeave();
      },
    });
  }

  /** Scoreboard by tap (pause menu or the score bar on touch); a tap on it closes it. */
  private showScores(on: boolean): void {
    this.scoreOn = on;
    this.scoreboard?.root.classList.toggle('tap', on);
    this.scoreboard?.show(on, this.frameNow);
  }

  resume(): void {
    if (this.scoreboard?.root.classList.contains('tap')) this.showScores(false);
    this.menu?.remove();
    this.menu = null;
    if (this.paused) {
      this.paused = false;
      this.host.pause(false);
      this.hooks.onPaused?.(false);
    }
  }

  /** Host page pause/resume (bridge). */
  setPaused(p: boolean): void {
    if (p) this.openMenu();
    else this.resume();
  }

  private onEnd(result: MatchResult, replay: ReplayRecord): void {
    if (this.ended || !this.welcome) return;
    this.ended = true;
    const me = this.welcome.slot;
    const won = result.outcome === 'won';
    this.view.juice.banner({ title: won ? 'Victory!' : 'Defeat', tone: won ? 'good' : 'bad' });
    // slow-mo on the final blow (fun plan F2 item 1), the crowd, and the music bows out
    this.view.juice.slowmo(1200, 0.25);
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
          fun: { ...this.funSummary(myStats?.heroDamage ?? 0), ...(myStats ? { takedowns: myStats.kills + myStats.assists } : {}) },
        });
      },
      Math.max(300, RESULTS_AFTER_END_MS / Math.max(1, this.buffer.speed)),
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

  /** Show what the announcer called. */
  private present(list: readonly Moment[]): void {
    const j = this.view.juice;
    const me = this.view.me();
    for (const m of list) {
      // Nine Lives read like "you survived" when it fired on the killing blow: only while alive
      if (m.key === 'nineLives' && (!me || me.state === 'dead' || me.hp <= 0)) continue;
      if (m.size === 'ping') {
        if (m.key === 'frenzySpawn') for (const p of this.view.pickups.list()) if (p.kind === 'frenzy') this.minimap.ping(p.x, p.y, '#7dff8a', 3000);
        continue;
      }
      if (m.size === 'banner') j.banner({ title: m.title, sub: m.sub, tone: m.tone });
      else if (m.size === 'callout') j.callout(m.title, m.tone);
      else {
        const at = this.heroScreen();
        if (at) j.pop(m.title, at.x, at.y - 10, m.tone, m.key.startsWith('combo') || m.key.startsWith('pickup'));
      }
      if (m.slowmo) j.slowmo(m.slowmo.ms, m.slowmo.scale);
      if (m.shake) j.kick(m.shake);
      if (m.crowd) sfx.play(m.crowd, { vol: m.crowd === 'roar' ? 0.9 : 0.75 });
      if (m.key.startsWith('combo') || m.key.startsWith('multi')) sfx.play('sting', { rate: m.key.startsWith('multi') ? 1.2 : 1 });
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

  /** Round 1: the goal the chip shows between beats (Pudding first, then the next tower). */
  private standingGoal(frame: ViewFrame): { title: string; sub: string; icon: 'heart' | 'shield' | 'sun' } | null {
    if (!this.welcome) return null;
    const team = this.welcome.team;
    const sec = frame.latest.clock.seconds;
    const pud = frame.entities.find((e) => e.kind === 'pudding' && e.state !== 'dead');
    if (pud && pud.team === 2) return { title: 'Calm Pudding in the river', sub: 'He marches with the team that calms him', icon: 'heart' };
    if (pud && pud.team === team) return { title: 'Pudding marches with you', sub: 'Push behind him: he burns towers', icon: 'heart' };
    if (pud) return { title: 'Their Pudding is coming', sub: 'Hit him together to send him home', icon: 'heart' };
    const pudAt = Math.floor(TIMELINE.pudding / TICK_HZ);
    if (sec < pudAt) {
      const left = pudAt - sec;
      return { title: `Pudding wakes in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, sub: 'Calm him and he marches with your wave', icon: 'heart' };
    }
    const sc = frame.latest.score;
    const ours = sc.towers[team];
    const theirs = sc.towers[1 - team];
    if (frame.latest.clock.phase === 'sunset' || frame.latest.clock.phase === 'suddenDeath') return { title: 'Finish their core', sub: `Towers ${ours} to ${theirs}: takedowns hit cores now`, icon: 'sun' };
    return { title: 'Take their next tower', sub: `Towers ${ours} to ${theirs}: walk in behind your minions`, icon: 'shield' };
  }

  /** Time and proximity beats, the arrow's target, the Pudding ring. */
  private goalTick(frame: ViewFrame): void {
    const g = this.goals;
    g.standing(this.standingGoal(frame));
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
    if (sec >= 1) g.start('lane');
    // out of the base and with the wave (the first wave walks past the fountain, so near it alone is not enough)
    const out = team === 0 ? me.fx > 14000 : me.fx < 86000;
    if (out && (allyMinion < 9000 || (team === 0 ? me.fx > 26000 : me.fx < 74000))) g.complete('lane');
    if (sec >= 12 || enemyMinion < 10000) g.start('minions');
    if (enemyHero < 14000 && sec >= 10) g.start('dog');
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
      this.view.juice.flash('red');
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
    this.frameNow = frame;
    if (frame && frame.latest.clock.phase !== 'ended') this.lastPhase = frame.latest.clock.phase;
    if (frame) {
      this.units.length = 0;
      for (const e of frame.entities) this.units.push({ id: e.id, kind: e.kind, team: e.team, x: e.fx, y: e.fy, hp: e.hp, maxHp: e.maxHp, state: e.state });
      this.events.length = 0;
      for (const ev of this.buffer.takeEvents(this.events)) {
        this.view.effects.handle(ev);
        const a = this.announcer;
        if (a) this.present(a.feed(ev));
        const fe = ev as AnyEvent;
        // the trickle (2 XP a second) is silent: a pop every second was noise
        if (isFun(fe) && fe.type === 'xp' && fe.id === this.view.mySlot && fe.reason !== 'trickle') this.xpPops.add(fe.amount, fe.tick ?? frame.latest.clock.tick);
        this.beatsFrom(ev, frame);
        // The attack tip is done once the player's hit lands on a minion (a right-click, A-move or the ATK button).
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
      this.goalTick(frame);
      this.helpTick(frame);
      this.hudRectsTick();
      this.overhead.guide = this.laneArrow ?? (this.goals.enabled ? this.goalTarget(frame) : this.guideTarget(frame));
      for (const n of this.xpPops.flush(frame.tick)) {
        const at = this.heroScreen();
        if (at) this.view.juice.pop(`+${n} XP`, at.x + (Math.random() - 0.5) * 40, at.y - 24, 'gold');
      }
      if (!this.ended && !this.paused) this.musicTick(frame);
      this.bodyTick(frame, dt);
    }
    this.orders?.update();
    this.desktop?.update(dt);
    this.view.update(frame, this.paused ? 0 : dt);
    this.overhead.draw(frame, this.gr.camera, (e) => (e.hero ? HERO_SCALE[e.hero] : 1));
    this.minimap.draw(frame);
    this.tips.update(dt);
    this.goals.update(this.paused ? 0 : dt);
    if (this.talents?.waiting) {
      this.calmFor = this.inFight() ? 0 : this.calmFor + dt * this.buffer.speed;
      if (this.calmFor >= 2.5) this.talents.reveal();
    }
    this.talents?.tick(!this.paused && !this.ended, this.buffer.speed);
    // the centre band: the death recap holds it while dead, an open talent card while it is up
    const nowMs = performance.now();
    const meNow = frame && this.welcome ? frame.byId.get(this.welcome.slot) : undefined;
    this.stage.hold('recap', meNow?.state === 'dead', nowMs);
    this.stage.hold('talent', this.talents?.open ?? false, nowMs);
    if (this.e2e) {
      this.telemetry(frame);
      document.documentElement.dataset.stage = this.stage.top(nowMs) ?? '';
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
      this.hud.update(me, frame.latest.clock, frame.latest.score, this.welcome.team, lvN ? lvSum / lvN : 0);
      this.behindCall(frame.latest.score, this.welcome.team);
      const hero = this.welcome.picks[this.welcome.slot];
      const trick = this.welcome.tricks[this.welcome.slot];
      this.touch?.update(me?.cooldowns ?? null, [0, 1, 2, 3, 4].map((i) => maxCooldown(hero, i as 0, trick)), me?.level ?? 1);
      if (this.scoreOn) this.scoreboard?.show(true, frame);
    }
  }

  private telemetry(frame: ViewFrame | null): void {
    const d = document.documentElement.dataset;
    const me = frame?.byId.get(this.view.mySlot);
    if (me) d.me = `${Math.round(me.x)},${Math.round(me.y)},${me.state}`;
    d.ops = (this.orders?.recent ?? []).join(',');
    d.aim = this.view.aim ? '1' : '';
    d.casts = String(this.orders?.casts ?? 0);
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
      // First-match tips (first-match.spec.ts): the tip on screen, those shown and done, and where on screen the
      // nearest enemy minion and hero are (so a test can right-click one).
      d.tip = this.tips.current ?? '';
      d.tipsShown = this.tips.shown.join(',');
      d.tipsDone = this.tips.completed.join(',');
      d.difficulty = this.setup.difficulty;
      d.goalsShown = this.goals.shown.join(',');
      d.goalsDone = this.goals.completed.join(',');
      d.music = String(this.music.intensity);
      d.autos = String(this.touch?.autos ?? 0);
      d.pickups = String(this.view.pickups.count);
      d.level = String(me?.level ?? 0);
      d.hp = me && me.maxHp > 0 ? String(Math.round((100 * me.hp) / me.maxHp)) : '';
      d.foeMinion = this.nearestFoeOnScreen('minion');
      d.foeHero = this.nearestFoeOnScreen('hero');
      d.allyFront = this.allyFrontOnScreen();
      const self = this.units.find((u) => u.id === this.view.mySlot);
      d.meScreen = self ? this.onScreen(self.x, self.y) : '';
    }
  }

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
      this.view.juice.banner(nearFountain ? { title: "Enemy fountain: you can't go in", sub: 'Back to the lane! Follow the arrow.', tone: 'info' } : { title: "Can't go that way", sub: 'Back to the lane: follow the arrow.', tone: 'info' });
      this.pointToLane(frame, now + 5000 / sp);
    }
    // Round 2: 10 s of no progress (held into the trees, or walking circles) brings the lane prompt, not only 45 s
    // without a fight (it came after about 45 s for a player stuck beside the core).
    if (Math.hypot(me.fx - this.progressAt.x, me.fy - this.progressAt.y) > 3000 || now - this.lastUseful < 3000 / sp) {
      this.progressAt = { x: me.fx, y: me.fy, t: now };
    }
    // (a veteran waiting in a bush is left alone: only new players, or a hero that keeps walking without getting anywhere)
    const noProgress = (this.setup.newPlayer || me.state === 'moving') && frame.latest.clock.seconds > 20 && now - this.progressAt.t > 10000 / sp;
    if ((noProgress || (frame.latest.clock.seconds > 60 && now - this.lastUseful > 45000 / sp)) && now - this.idleSaidAt > (noProgress ? 15000 : 60000) / sp) {
      this.idleSaidAt = now;
      this.lastUseful = now;
      const lane = this.pointToLane(frame, now + 8000 / sp);
      this.view.juice.banner({ title: `Your team needs you in ${lane}`, sub: 'Follow the arrow to the fight.', tone: 'info' });
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
        this.towerAlert(`${icon('shield')}<b>Too far ahead of your minions!</b><span>Past the river alone, enemy heroes jump you. Wait for your wave.</span>`, now);
        return;
      }
    }
    if (now - this.diveSaidAt < 8000 / sp) return;
    const reach = TOWERS.outer.range + 2000;
    for (const t of this.units) {
      if ((t.kind !== 'tower' && t.kind !== 'core') || t.team === team || t.team === 2 || t.state === 'dead') continue;
      if (Math.hypot(t.x - me.fx, t.y - me.fy) > reach) continue;
      const tanked = this.units.some((u) => u.kind === 'minion' && u.team === team && u.state !== 'dead' && Math.hypot(u.x - t.x, u.y - t.y) < TOWERS.outer.range);
      if (tanked) return;
      this.diveSaidAt = now;
      this.towerAlert(`${icon('shield')}<b>Too far ahead of your minions!</b><span>That tower hits hard. Wait for your wave to walk in first.</span>`, now);
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
    if (this.disposed) return;
    this.disposed = true;
    this.host.leave();
    this.host.dispose();
    this.desktop?.dispose();
    this.touch?.dispose();
    this.emoteOff?.();
    this.chromeOff?.();
    this.hud?.dispose();
    this.scoreboard?.dispose();
    this.talents?.dispose();
    this.minimap.dispose();
    this.tips.dispose();
    this.goals.dispose();
    this.music.stop();
    this.view.dispose();
    this.ui.remove();
    delete document.documentElement.dataset.match;
    delete document.documentElement.dataset.touch;
  }
}
