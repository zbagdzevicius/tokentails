/**
 * One match on the client: the LocalHost (sim Worker), the snapshot buffer, the match view, input (desktop and
 * touch), HUD, minimap, scoreboard, talents, first-match tips and the Esc menu. The app's frame loop calls
 * `frame(dt)`; the session calls back once with the result and the replay.
 */
import * as THREE from 'three';
import { sfx } from '../audio/sfx';
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
import { lookKey, type FrameId, type Look } from '../render/cosmetics';
import { toX, toZ } from '../render/coords';
import { FADE, SHAPE } from '../render/fx/Particles.js';
import { GameView } from '../render/gameView';
import { SnapBuffer, type ViewFrame } from '../render/interp';
import type { GameRenderer } from '../render/renderer';
import { HERO_SCALE } from '../render/views/models';
import type { Difficulty, HeroId, MatchResult, ReplayRecord, SimEvent, TrickId } from '../sim/api';
import { HERO_TEXT, TRICK_TEXT } from '../ui/heroText';
import { icon } from '../ui/icons';
import { Hud, type FeedName } from '../ui/hud';
import { Minimap } from '../ui/minimap';
import { Overhead } from '../ui/overhead';
import { Scoreboard } from '../ui/scoreboard';
import { menuScreen, RESULTS_AFTER_END_MS } from '../ui/screens';
import { TalentPicker } from '../ui/talents';

export interface MatchSetup {
  hero: HeroId;
  trick: TrickId;
  difficulty: Difficulty;
  seed?: number;
  speed?: number;
  firstMatch: boolean;
  muted: boolean;
  /** Render-only cosmetics for the player's hero, frame and title, and Companion Kittens. */
  look?: Look | null;
  frame?: FrameId | null;
  title?: string | null;
  companions?: readonly Companion[];
}

export interface MatchEnd {
  result: MatchResult;
  replay: ReplayRecord;
  welcome: WelcomeMsg;
  kills: number;
  deaths: number;
  level: number;
  teamKills: [number, number];
  /** First-match tips completed (analytics `tip_done`). */
  tips: string[];
  /** Real input events in the match (analytics human filter). */
  activity: number;
}

export interface SessionHooks {
  onEnd(e: MatchEnd): void;
  onTalent?(tier: number, choice: number): void;
  onLeave(): void;
  onMute(m: boolean): void;
  onError(msg: string): void;
  onPaused?(p: boolean): void;
}

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

export class MatchSession {
  readonly host: LocalHost;
  readonly buffer = new SnapBuffer();
  readonly view: GameView;
  readonly ui: HTMLElement;
  private orders: Orders | null = null;
  private desktop: DesktopInput | null = null;
  private touch: TouchControls | null = null;
  private hud: Hud | null = null;
  private overhead: Overhead;
  private minimap: Minimap;
  private scoreboard: Scoreboard | null = null;
  private talents: TalentPicker | null = null;
  private tips: Tips;
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
    this.view = new GameView(gr, this.ui, {
      onKill: (e, victim, killer) => this.onKill(e, victim, killer),
      onTalentOffer: (tier) => this.talents?.offer(tier),
      onLevel: (lv) => {
        this.lastLevel = lv;
        if (lv >= 4) this.tips.trigger('ult');
      },
      onWindupAtMe: () => this.tips.trigger('dodge'),
    });
    this.overhead = new Overhead(this.ui);
    this.minimap = new Minimap(this.ui, {
      lookAt: (x, z) => this.view.lookAt(x, z),
      moveTo: (x, y) => this.orders?.move(x, y),
      viewQuad: () => this.viewQuad(),
      mySlot: () => this.view.mySlot,
      myTeam: () => this.view.myTeam,
    });
    this.tips = new Tips(this.ui, setup.firstMatch);
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
    document.documentElement.dataset.match = 'loading';
  }

  get matchId(): string | null {
    return this.welcome?.matchId ?? null;
  }

  private onWelcome(w: WelcomeMsg): void {
    this.welcome = w;
    this.view.setTeam(w.slot, w.team, w.tricks);
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
    this.hud = new Hud(this.ui, hero, trick, {
      onSlot: (i) => {
        const me = this.units.find((u) => u.id === w.slot);
        if (!me || !this.orders) return;
        if (i === 5) this.orders.nap();
        else this.orders.cast(i as 0 | 1 | 2 | 3 | 4, me.x + Math.cos(this.view.me()?.yaw ?? 0) * 2000, me.y + Math.sin(this.view.me()?.yaw ?? 0) * 2000);
      },
    });
    const portrait = this.ui.querySelector<HTMLElement>('.pl-portrait');
    if (portrait && this.setup.frame) portrait.dataset.frame = this.setup.frame;
    if (portrait && this.setup.title) portrait.dataset.title = this.setup.title;
    if (this.e2e) {
      const d = document.documentElement.dataset;
      d.matchLook = lookKey(this.setup.look);
      d.matchFrame = this.setup.frame ?? '';
      d.kittens = String(this.view.companions?.count ?? 0);
    }
    this.scoreboard = new Scoreboard(this.ui, w.picks, w.slot);
    this.talents = new TalentPicker(this.ui, hero, (tier, choice) => {
      this.orders?.talent(tier, choice);
      this.hooks.onTalent?.(tier, choice);
      sfx.play('click');
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
        if (slot === 3) this.tips.complete('ult');
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
    };
    document.documentElement.dataset.match = 'live';
    setTimeout(() => this.tips.trigger('move'), 5000 / Math.max(1, this.buffer.speed));
  }

  private talentsBlock(): boolean {
    return false;
  }

  private onKill(e: Extract<SimEvent, { type: 'death' }>, victim: { kind: string; hero?: HeroId; team: number } | null, killer: { kind: string; hero?: HeroId; team: number } | null): void {
    if (!victim || victim.kind !== 'hero') {
      if (victim?.kind === 'minion' && e.killer === this.view.mySlot) this.tips.complete('attack');
      return;
    }
    this.scoreboard?.death(e.id, e.killer);
    const good = victim.team !== this.view.myTeam;
    const rel = (team: number | undefined, id: number): FeedName['rel'] =>
      id === this.view.mySlot ? 'self' : team === 2 || team === undefined ? 'neutral' : team === this.view.myTeam ? 'ally' : 'enemy';
    const victimName = e.id === this.view.mySlot ? 'You' : victim.hero ? HERO_TEXT[victim.hero].title : 'A hero';
    const killerLabel = e.killer === this.view.mySlot ? 'You' : killerName(killer);
    this.hud?.kill({ name: killerLabel, rel: rel(killer?.team, e.killer) }, { name: victimName, rel: rel(victim.team, e.id) }, good);
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

  private openMenu(): void {
    if (this.menu || this.ended) return;
    this.paused = true;
    this.host.pause(true);
    this.hooks.onPaused?.(true);
    this.menu = menuScreen(this.ui, {
      muted: this.muted,
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

  resume(): void {
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
    sfx.play(won ? 'victory' : 'defeat');
    const myStats = result.stats.find((s) => s.slot === me);
    const sb = this.scoreboard;
    const latest = this.buffer.latest;
    const k = latest?.score.kills ?? [0, 0];
    const team = this.welcome.team;
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
          level: myStats?.level ?? this.lastLevel,
          teamKills: team === 0 ? [k[0], k[1]] : [k[1], k[0]],
          tips: [...this.tips.completed],
          activity: this.activity,
        });
      },
      Math.max(300, RESULTS_AFTER_END_MS / Math.max(1, this.buffer.speed)),
    );
  }

  /** One animation frame. */
  frame(dt: number): void {
    if (this.disposed) return;
    const scale = this.view.juice.timeScale(dt);
    const frame = this.paused ? this.buffer.sample(this.buffer.renderTick) : this.buffer.advance(dt, scale);
    this.frameNow = frame;
    if (frame) {
      this.units.length = 0;
      for (const e of frame.entities) this.units.push({ id: e.id, kind: e.kind, team: e.team, x: e.fx, y: e.fy, hp: e.hp, maxHp: e.maxHp, state: e.state });
      this.events.length = 0;
      for (const ev of this.buffer.takeEvents(this.events)) {
        this.view.effects.handle(ev);
        // The attack tip is done once the player's hit lands on a minion (a right-click, A-move or the ATK button).
        if (ev.type === 'hit' && ev.src === this.view.mySlot) {
          this.hitsLanded++;
          if (frame.byId.get(ev.dst)?.kind === 'minion') this.tips.complete('attack');
        }
      }
      this.tipTriggers(frame);
    }
    this.orders?.update();
    this.desktop?.update(dt);
    this.view.update(frame, this.paused ? 0 : dt);
    this.overhead.draw(frame, this.gr.camera, (e) => (e.hero ? HERO_SCALE[e.hero] : 1));
    this.minimap.draw(frame);
    this.tips.update(dt);
    if (this.e2e) this.telemetry(frame);
    if (frame && this.hud && this.welcome) {
      const me = frame.byId.get(this.welcome.slot) ?? null;
      this.hud.update(me, frame.latest.clock, frame.latest.score, this.welcome.team);
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

  private tipTriggers(frame: ViewFrame): void {
    if (!this.tips.enabled || !this.welcome) return;
    const me = frame.byId.get(this.welcome.slot);
    if (!me || me.state === 'dead') return;
    for (const u of this.units) {
      if (!isEnemy(u, this.welcome.team)) continue;
      const d = Math.hypot(u.x - me.fx, u.y - me.fy);
      if (u.kind === 'minion' && d < 9000) this.tips.trigger('attack');
      if (u.kind === 'hero' && d < 8000) this.tips.trigger('q');
    }
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
    this.hud?.dispose();
    this.scoreboard?.dispose();
    this.talents?.dispose();
    this.minimap.dispose();
    this.tips.dispose();
    this.view.dispose();
    this.ui.remove();
    delete document.documentElement.dataset.match;
    delete document.documentElement.dataset.touch;
  }
}
