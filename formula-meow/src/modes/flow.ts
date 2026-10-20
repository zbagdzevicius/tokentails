/**
 * Mode flow (modes lane): title → menu → mode → racer → class → cup / track → race(s) → results → standings /
 * podium → menu. Owns the `modes` save slot, the scenery behind the menus (the attract race, or the showroom with
 * the player's kart and the podium), and the bookkeeping of each mode:
 *
 * - Grand Prix: 4 races chained with `shell.startRace` (results show Continue), points and reverse-standings grids,
 *   the cup saved after every race (quit any time, resume from the menu), podium and trophies at the end.
 * - Time trial: the player alone with three Catnips, the personal-best (or dev) ghost in lockstep, splits at every
 *   checkpoint, medals, the personal-best ghost saved on the device with the share ghost codec.
 * - Battle: the balloon arena with the free-roam AI.
 *
 * Results are booked on `raceEnd` (so closing the tab on the results loses nothing); `startRace` outcomes only
 * decide where to go next.
 */
import { DEFAULT_CAT, SIM_VERSION, type BodyId, type KartLook, type RaceClass, type RaceEvent, type RaceResult, type RacerInfo } from '../types';
import type { RaceRequest, Shell } from '../core/app/shell';
import { newSeed } from '../core/app/shell';
import { screens, type ScreenId } from '../core/app/screens';
import { appBus } from '../core/app/app-bus';
import { TRACKS, RUG, trackById } from '../core/track/tracks';
import { cupById, CUPS } from '../content/cups';
import type { CupId } from '../content/ids';
import { yourCat } from '../share/yourcat/store';
import { PINK_PAW_CATS, pinkPawCatSpec } from '../share/pinkpaw/pink-paw';
import { decodeGhost, encodeGhost, trackKey } from '../share/codec/ghost-codec';
import { dailySetup, dayNoFor } from '../share/daily/daily';
import { dailyUrl } from '../share/links/link';
import type { Replay } from '../core/sim/replay';
import type { HudModel } from '../core/hud/hud';
import { modal, toast } from '../ui/kit';
import { t } from '../ui/i18n';
import { buildCupField, cupDef, cupOutcome, newCup, raceField, raceModifiers, raceSeed, scoreRace, simClass, standings, type CupPlayer } from './gp/cup';
import { clsKey, modesSlot, type ClassPick, type CupRun, type GhostPick, type ModesSave, type TtRecord } from './store';
import { pickRival, unlockProvider, type LockKind } from './hooks';
// [integrator] one loadout: the racer select and the Garage read and write the progression lane's equip
import { loadout as progLoadout, setLoadout as setProgLoadout, recordMedal } from '../progression/api';
import { PAINT_PRESETS } from '../content/cosmetics';
import { devGhostJob, devRacer, medalFor, medalTimes, replayJob, runAsync, trackSig, TT_SEED, ttConfig, type GhostRun } from './tt/ghosts';
import { BATTLE_TICKS } from './battle/rules';
import type { TtGhostView } from './tt/ghost-view';

/** [integrator] the Garage's paint presets (progression lane), so both screens show the same swatches */
export const PAINTS: ReadonlyArray<[number, number, number]> = PAINT_PRESETS.map((p) => p.paint);

/** The player's racer look as the modes screens edit it: `cat` is 'own', 'tofu' or a Pink Paw id. */
export interface Look {
  cat: string;
  body: BodyId;
  paint: number;
  hat: number;
  number: number;
}

/** Screens that sit on the showroom (the player's kart on a turntable) instead of the attract race. */
const SHOWROOM_SCREENS = new Set<ScreenId>(['select', 'class', 'cup', 'tt', 'battle', 'race']);
/** Other lanes' screens that can open from the menu (the attract race runs behind them too). */
const MENU_OVERLAYS = new Set<ScreenId>(['settings', 'garage', 'achievements', 'stats', 'tracks', 'rewards', 'yourcat']);
/** Screens the modes lane owns: a race started by anyone else clears them. */
export const MODES_SCREENS: readonly ScreenId[] = ['title', 'menu', 'select', 'class', 'cup', 'tt', 'battle', 'race', 'standings', 'podium', 'howto', 'pinkpaw'];

type Pending =
  | { kind: 'gp'; race: number; grid: number[]; scored: boolean; cupSeed: number }
  | { kind: 'tt'; trackId: string; cls: ClassPick; modifiers: number; ghost: GhostRun | null; ghostLabel: string; dev: number | null }
  | { kind: 'battle' };

export interface TtOutcome {
  time: number | null;
  prev: number | null;
  newRecord: boolean;
  medal: number;
  prevMedal: number;
  dev: number | null;
  ghostTime: number | null;
  ghostLabel: string;
}

export interface GpOutcome {
  cupId: CupId;
  race: number;
  gained: number;
  place: number;
  standing: number;
}

export interface Showroom {
  turntable(look: RacerInfo): void;
  podium(top3: RacerInfo[], trophy: number): void;
  hide(): void;
  readonly active: boolean;
}

let instance: ModesFlow | null = null;

export function flow(): ModesFlow {
  if (!instance) throw new Error('modes flow not installed');
  return instance;
}

export class ModesFlow {
  private pending: Pending | null = null;
  private lastReplay: Replay | null = null;
  private ttSplits: number[] = [];
  /** the outcome of the last time trial / Grand Prix race (result sections read these) */
  lastTt: TtOutcome | null = null;
  lastGp: GpOutcome | null = null;
  /** points gained by field index in the last cup race (standings chips) */
  lastGained: number[] = [];
  /** standings before the last cup race (animated swaps) */
  lastOrder: number[] = [];
  private showroom: Showroom | null = null;
  private showroomLoad: Promise<Showroom> | null = null;
  private attractTimer: ReturnType<typeof setTimeout> | null = null;
  private devCache = new Map<string, GhostRun | null>();
  ttGhost: TtGhostView | null = null;
  private sceneryGen = 0;

  constructor(readonly shell: Shell) {
    instance = this;
    screens.onChange((top) => this.scenery(top));
    appBus.on('raceStart', (e) => this.onRaceStart(e.mode));
    appBus.on('raceEnd', (e) => this.onRaceEnd(e.result));
    shell.bus.add({
      onEvent: (e: RaceEvent, info) => {
        if (e.kart === info.me && e.type === 'checkpoint' && this.pending?.kind === 'tt') this.ttSplits[e.a ?? 0] = (e.b ?? 0) / 60;
      },
      onFrame: (info) => {
        // the attract race loops: a new one a moment after it ends
        if (this.shell.attract && info.st.phase === 'done' && !this.attractTimer) this.attractTimer = setTimeout(() => ((this.attractTimer = null), this.startAttract()), 400);
      },
      onReset: () => {
        this.ttSplits = [];
        // the feel lane's slow orbit for the race behind the menus (chase until it lands)
        if (this.shell.attract) this.shell.setCameraMode('attract');
      },
    });
  }

  // ------------------------------------------------------------------------------------------------------------------
  // save
  // ------------------------------------------------------------------------------------------------------------------

  get save(): ModesSave {
    return modesSlot().get();
  }

  update(fn: (s: ModesSave) => void): ModesSave {
    return modesSlot().update(fn);
  }

  /**
   * [integrator] The racer look: body, paint, number and hat live in the progression loadout (the Garage edits the
   * same one); 'own' vs 'tofu' stays in the modes save (the loadout's `cat` is only set for a Pink Paw cat).
   */
  get look(): Look {
    const m = this.save.look;
    try {
      const e = progLoadout();
      const cat = e.cat ?? (m.cat === 'tofu' ? 'tofu' : 'own');
      return { cat, body: e.body, paint: e.paint, hat: e.hat, number: e.number };
    } catch {
      return { ...m };
    }
  }

  setLook(fn: (l: Look) => void): Look {
    const l = { ...this.look };
    fn(l);
    const shelter = l.cat !== 'own' && l.cat !== 'tofu';
    try {
      setProgLoadout({ body: l.body, paint: l.paint, hat: l.hat, number: l.number, cat: shelter ? l.cat : null });
    } catch {
      /* progression not installed (unit tests): the modes save below still keeps the pick */
    }
    this.update((s) => (s.look = { ...s.look, ...l }));
    return this.look;
  }

  lock(kind: LockKind, id: string | number): string | null {
    try {
      return unlockProvider().lock(kind, String(id));
    } catch {
      return null;
    }
  }

  /** Lock lines of everything the menus gate, to tell what a race just unlocked. */
  lockSnapshot(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const c of [1, 2, 3]) out[`class:${c}`] = this.lock('class', c);
    for (const c of CUPS) out[`cup:${c.id}`] = this.lock('cup', c.id);
    out['mode:battle'] = this.lock('mode', 'battle');
    return out;
  }

  /** Names of what opened between two snapshots. */
  opened(before: Record<string, string | null>): string[] {
    const after = this.lockSnapshot();
    const names: Record<string, string> = {
      'class:1': t('100cc Alley Cat'),
      'class:2': t('150cc Zoomies'),
      'class:3': t('Mirror'),
      'cup:catnip': t('Catnip Cup'),
      'mode:battle': t('Balloon Battle'),
    };
    return Object.keys(after).filter((k) => before[k] && !after[k] && names[k]).map((k) => names[k]);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // the player's racer
  // ------------------------------------------------------------------------------------------------------------------

  /** Cat choices: the cat maker's cat (if any), Tofu, and the Pink Paw cats the unlock provider allows. */
  catChoices(): Array<{ id: string; name: string; cat: typeof DEFAULT_CAT; pinkPawId?: string; note?: string }> {
    const out: Array<{ id: string; name: string; cat: typeof DEFAULT_CAT; pinkPawId?: string; note?: string }> = [];
    const yc = yourCat();
    if (yc) out.push({ id: 'own', name: yc.name, cat: yc.cat });
    out.push({ id: 'tofu', name: DEFAULT_CAT.name, cat: DEFAULT_CAT });
    let ids: string[] = [];
    try {
      ids = unlockProvider().shelterCats();
    } catch {
      ids = [];
    }
    for (const id of ids) {
      const c = PINK_PAW_CATS.find((x) => x.id === id);
      if (c) out.push({ id: c.id, name: c.name, cat: pinkPawCatSpec(c), pinkPawId: c.id, note: t('Real cat at Pink Paw (as of {d})', { d: '2026-10-04' }) });
    }
    return out;
  }

  kartLook(): KartLook {
    const l = this.look;
    const body = this.lock('body', l.body) ? 0 : l.body;
    return { body, paint: PAINTS[l.paint % PAINTS.length], number: l.number };
  }

  player(): CupPlayer {
    const l = this.look;
    const choices = this.catChoices();
    const c = choices.find((x) => x.id === l.cat) ?? choices[0];
    const hat = l.hat && !this.lock('hat', l.hat) ? l.hat : 0;
    if (c.id === 'tofu') return { name: t('You'), cat: DEFAULT_CAT, kart: this.kartLook(), hat };
    return { name: c.name, cat: c.cat, kart: this.kartLook(), pinkPawId: c.pinkPawId, hat };
  }

  playerRacer(): RacerInfo {
    const p = this.player();
    const r: RacerInfo = { name: p.name, cat: p.cat, kart: p.kart };
    if (p.pinkPawId) r.pinkPawId = p.pinkPawId;
    if (p.hat) r.hat = p.hat;
    return r;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // scenery: the attract race behind the menus, the showroom behind the racer / class / track pickers
  // ------------------------------------------------------------------------------------------------------------------

  startAttract(): void {
    if (this.attractTimer) clearTimeout(this.attractTimer);
    this.attractTimer = null;
    const top = screens.top();
    if (!top || SHOWROOM_SCREENS.has(top) || top === 'podium') return;
    const track = TRACKS[Math.floor(Math.random() * TRACKS.length)] ?? TRACKS[0];
    // the shell blurs on every start (race keys must not press a menu button); the menu keeps its focus here
    const focused = document.activeElement as HTMLElement | null;
    this.shell.start({ track, cls: 1, seed: newSeed(), modifiers: 0, mode: 'race', attract: true } as RaceRequest);
    if (focused && focused !== document.body && focused.isConnected) focused.focus({ preventScroll: true });
  }

  /** The attract race for a plain visit's boot race (main.ts starts it right after the lanes install). */
  attractRequest(): RaceRequest {
    const track = TRACKS[Math.floor(Math.random() * TRACKS.length)] ?? TRACKS[0];
    return { track, cls: 1, seed: newSeed(), modifiers: 0, mode: 'race', attract: true };
  }

  loadShowroom(): Promise<Showroom> {
    if (this.showroom) return Promise.resolve(this.showroom);
    if (!this.showroomLoad)
      this.showroomLoad = import('./stage/showroom').then((m) => {
        this.showroom = m.createShowroom(this.shell);
        return this.showroom;
      });
    return this.showroomLoad;
  }

  /** Keep the right thing behind the top screen. */
  private scenery(top: ScreenId | null): void {
    const gen = ++this.sceneryGen;
    if (top && SHOWROOM_SCREENS.has(top)) {
      void this.loadShowroom().then((s) => {
        if (gen === this.sceneryGen) s.turntable(this.playerRacer());
      });
      return;
    }
    if (top === 'podium') return; // the podium screen drives the showroom itself
    if (this.showroom?.active) this.showroom.hide();
    // a menu over no race (after "Quit to menu", or leaving the showroom): the attract race comes back. Checked a
    // moment later, so a menu pushed on the way to another screen does not start one for nothing.
    if (!top || this.shell.world) return;
    setTimeout(() => {
      const now = screens.top();
      if (gen !== this.sceneryGen || !now || this.shell.world || SHOWROOM_SCREENS.has(now) || now === 'podium') return;
      if (MODES_SCREENS.includes(now) || MENU_OVERLAYS.has(now)) this.startAttract();
    }, 0);
  }

  /** Refresh the turntable after the look changed. */
  refreshShowroom(): void {
    if (this.showroom?.active) this.showroom.turntable(this.playerRacer());
  }

  podiumScene(top3: RacerInfo[], trophy: number): void {
    void this.loadShowroom().then((s) => s.podium(top3, trophy));
  }

  // ------------------------------------------------------------------------------------------------------------------
  // navigation
  // ------------------------------------------------------------------------------------------------------------------

  goMenu(): void {
    this.update((s) => (s.menuSeen = true));
    screens.clear();
    void screens.push('menu');
  }

  /** Leave whatever is on top for a race: no menu layer may stay over it. */
  private clearForRace(): void {
    screens.clear();
    if (this.showroom?.active) this.showroom.hide();
  }

  private onRaceStart(mode: string): void {
    // mode fields never leak from one race into the next (each mode sets its own right after its start)
    // [integrator] not the rival: the progression lane sets (or clears) it on every raceStart, just before this
    this.shell.hudExtras({ gpRace: undefined, balloons: undefined, timeLeft: undefined, splits: undefined });
    // a race the modes lane did not start (Track Doodle, a share action, the Daily Cup from the results): our
    // menu layers must not sit over it
    const mine = this.pending && ((this.pending.kind === 'gp' && mode === 'gp') || (this.pending.kind === 'tt' && mode === 'tt') || (this.pending.kind === 'battle' && mode === 'battle'));
    // a restart (pause, R, Select) of a mode race starts it again: its HUD fields come back with it
    if (mine && this.modeHud?.mode === mode) this.shell.hudExtras(this.modeHud);
    if (!mine) {
      this.modeHud = null;
      this.pending = null;
      for (const id of MODES_SCREENS) screens.remove(id);
      if (this.showroom?.active) this.showroom.hide();
      this.ttGhost?.arm(null);
    }
  }

  /** the HUD fields of the mode race running now (re-applied after a restart) */
  private modeHud: Partial<HudModel> | null = null;

  private setModeHud(m: Partial<HudModel>): void {
    this.modeHud = m;
    this.shell.hudExtras(m);
  }

  /** A Grand Prix race is running (the pause screen asks before quitting it). */
  inCupRace(): boolean {
    return this.pending?.kind === 'gp' && !!this.shell.world && !this.shell.world.done;
  }

  get mode(): Pending['kind'] | null {
    return this.pending?.kind ?? null;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // results bookkeeping
  // ------------------------------------------------------------------------------------------------------------------

  /** The share lane hands every finished race's replay to its hooks; the modes lane keeps the last one (TT ghosts). */
  noteReplay(r: Replay): void {
    this.lastReplay = r;
  }

  private onRaceEnd(result: RaceResult): void {
    const p = this.pending;
    if (!p) return;
    if (p.kind === 'gp' && result.mode === 'gp') this.bookGp(p, result);
    else if (p.kind === 'tt' && result.mode === 'tt') this.bookTt(p, result);
    else if (p.kind === 'battle' && result.mode === 'battle')
      this.update((s) => {
        s.battle.played++;
        if (result.player.place === 1) s.battle.wins++;
      });
  }

  private bookGp(p: Extract<Pending, { kind: 'gp' }>, result: RaceResult): void {
    if (p.scored) return;
    const s = this.save;
    const run = s.cup;
    if (!run || run.race !== p.race || run.seed !== p.cupSeed) return;
    p.scored = true;
    this.lastOrder = standings(run);
    const placeBySlot: number[] = [];
    for (const row of result.places) placeBySlot[row.kart] = row.place;
    const gained = scoreRace(run, p.grid, placeBySlot);
    this.lastGained = gained;
    const me = run.field.findIndex((r) => r.player);
    this.lastGp = { cupId: run.cupId, race: p.race, gained: gained[me], place: result.player.place, standing: standings(run).indexOf(me) + 1 };
    this.update((x) => (x.cup = run));
  }

  private bookTt(p: Extract<Pending, { kind: 'tt' }>, result: RaceResult): void {
    const key = clsKey(p.trackId, p.cls);
    const rec = this.save.tt[key];
    const prev = rec && rec.simVersion === SIM_VERSION ? rec.best : null;
    const time = result.player.time;
    const medal = medalFor(time, p.dev);
    const newRecord = time != null && (prev == null || time < prev);
    this.lastTt = { time, prev, newRecord, medal, prevMedal: rec?.medal ?? 0, dev: p.dev, ghostTime: p.ghost?.time ?? null, ghostLabel: p.ghostLabel };
    if (time == null) return;
    // [integrator] the progression lane pays the medal (its scale: 1 gold … 3 bronze; ours: 3 gold … 1 bronze)
    if (medal > 0) {
      try {
        recordMedal(p.trackId, simClass(p.cls), 4 - medal);
      } catch (err) {
        console.warn('[modes] medal not booked', err);
      }
    }
    const splits = this.ttSplits.slice();
    this.update((s) => {
      const old = s.tt[key];
      const keep = old && old.simVersion === SIM_VERSION && old.best <= time;
      // a new record drops the old ghost; the new one lands once encoded (a ghost never races under another time)
      s.tt[key] = keep ? { ...old, medal: Math.max(old.medal, medal) } : { best: time, simVersion: SIM_VERSION, splits, medal: Math.max(old?.simVersion === SIM_VERSION ? old.medal : 0, medal) };
    });
    if (!newRecord) return;
    // the personal-best ghost: this run's inputs up to the finish, in the share ghost codec
    const w = this.shell.world;
    const replay = this.lastReplay;
    if (!w || !replay) return;
    const fin = w.st.events.find((e) => e.type === 'finish' && e.kart === 0);
    const inputs = fin ? replay.inputs.slice(0, fin.tick + 2) : replay.inputs;
    const cfg = w.cfg;
    void encodeGhost({ trackKey: trackKey(cfg.track.id), seed: cfg.seed, cls: cfg.cls, modifiers: cfg.modifiers, forgiving: cfg.forgiving, slot: 0, body: cfg.racers[0]?.kart.body ?? 0, mode: 'tt' }, inputs).then((ghost) =>
      this.update((s) => {
        const r = s.tt[key];
        if (r && r.best === time) r.ghost = ghost;
      }),
    );
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Grand Prix
  // ------------------------------------------------------------------------------------------------------------------

  startCup(cupId: CupId, cls: ClassPick): void {
    const run = newCup(cupId, cls, newSeed(), this.player());
    const info: RacerInfo[] = run.field.map((r) => ({ name: r.name, cat: r.cat, kart: r.kart, ai: r.ai }));
    run.rival = pickRival(info, this.save.lastRival);
    this.update((s) => {
      s.cup = run;
      s.last.cupId = cupId;
      s.last.cls = cls;
      if (run.rival >= 0) s.lastRival = run.field[run.rival].name;
    });
    this.runCupRace();
  }

  /** Race the next race of the saved cup (or its podium when all four are done). */
  runCupRace(): void {
    const run = this.save.cup;
    if (!run) return this.goMenu();
    if (run.race >= cupDef(run).races.length) return this.finishCup();
    const cup = cupDef(run);
    const i = run.race;
    const { racers, slot, grid } = raceField(run);
    this.pending = { kind: 'gp', race: i, grid, scored: false, cupSeed: run.seed };
    this.clearForRace();
    const promise = this.shell.startRace({
      track: trackById(cup.races[i].track),
      cls: simClass(run.cls),
      seed: raceSeed(run.seed, i),
      modifiers: raceModifiers(cup, i, run.cls),
      mode: 'gp',
      cupId: run.cupId,
      raceIndex: i,
      racers,
      playerSlot: slot,
      waitForInput: false,
      actions: [{ label: t('Continue'), exit: 'continue', primary: true }],
    });
    const rivalSlot = run.rival >= 0 ? grid.indexOf(run.rival) : -1;
    this.setModeHud({
      mode: 'gp',
      gpRace: { n: i + 1, of: cup.races.length },
      rival: rivalSlot >= 0 ? { kart: rivalSlot, name: run.field[run.rival].name } : undefined,
      // the RACE n/4 chip already says where you are in the cup: no second tag line in the column
      tag: undefined,
    });
    void promise.then((o) => {
      if (o.exit === 'continue') void screens.push('standings');
    });
  }

  /** After race 4: trophy, unlocks, the cup event, then the podium. */
  finishCup(): void {
    const run = this.save.cup;
    if (!run) return this.goMenu();
    const before = this.lockSnapshot();
    const out = cupOutcome(run);
    const k = clsKey(run.cupId, run.cls);
    this.update((s) => {
      if (out.trophy && (!s.trophies[k] || out.trophy < s.trophies[k])) s.trophies[k] = out.trophy;
      s.cupsDone[k] = (s.cupsDone[k] ?? 0) + 1;
      s.cup = null;
    });
    appBus.emit('cupEnd', { cupId: run.cupId, cls: simClass(run.cls), place: out.place, points: out.points, mirror: run.cls === 3 });
    if (out.trophy) appBus.emit('unlock', { kind: 'trophy', id: `${run.cupId}:${run.cls}:${out.trophy}` });
    const opened = this.opened(before);
    for (const name of opened) appBus.emit('unlock', { kind: 'modes', id: name });
    this.shell.leaveRace();
    screens.clear();
    void screens.push('podium', { run, outcome: out, opened });
  }

  async quitCupAsk(): Promise<boolean> {
    const i = await modal(t('Quit the cup?'), t('Your cup is saved. Resume it from the menu at the next race.'), [t('Quit'), t('Keep racing')], { focus: 1 });
    return i === 0;
  }

  dropCup(): void {
    this.update((s) => (s.cup = null));
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Time trial
  // ------------------------------------------------------------------------------------------------------------------

  ttKey(trackId: string, cls: ClassPick): string {
    return clsKey(trackId, cls);
  }

  ttRecord(trackId: string, cls: ClassPick): TtRecord | null {
    const r = this.save.tt[clsKey(trackId, cls)];
    return r && r.simVersion === SIM_VERSION ? r : null;
  }

  /** An older record (another game version): its time is shown, its ghost cannot run. */
  ttOldRecord(trackId: string, cls: ClassPick): TtRecord | null {
    const r = this.save.tt[clsKey(trackId, cls)];
    return r && r.simVersion !== SIM_VERSION ? r : null;
  }

  private devKey(trackId: string, cls: ClassPick): string {
    return `${SIM_VERSION}:${trackSig(trackById(trackId))}:${cls}`;
  }

  /** The dev ghost of a track and class (computed on this device once, a slice per frame). */
  async devGhost(trackId: string, cls: ClassPick): Promise<GhostRun | null> {
    const key = this.devKey(trackId, cls);
    if (this.devCache.has(key)) return this.devCache.get(key) ?? null;
    const track = trackById(trackId);
    const cfg = ttConfig(track, simClass(cls), cls === 3 ? 1 : 0, devRacer());
    let run: GhostRun | null = null;
    try {
      run = await runAsync(devGhostJob(cfg));
    } catch {
      run = null;
    }
    if (run && run.time == null) run = null;
    this.devCache.set(key, run);
    this.update((s) => (s.devTimes[key] = run?.time ?? null));
    return run;
  }

  /** Cached dev time (seconds) if known, without computing. */
  devTime(trackId: string, cls: ClassPick): number | null | undefined {
    const key = this.devKey(trackId, cls);
    const c = this.devCache.get(key);
    if (c !== undefined) return c?.time ?? null;
    return this.save.devTimes[key];
  }

  medalTimes(dev: number): [number, number, number] {
    return medalTimes(dev);
  }

  async startTt(trackId: string, cls: ClassPick, ghostPick: GhostPick): Promise<void> {
    this.update((s) => {
      s.last.ttTrack = trackId;
      s.last.ttCls = cls;
      s.last.ghost = ghostPick;
    });
    const track = trackById(trackId);
    const modifiers = cls === 3 ? 1 : 0;
    const dev = await this.devGhost(trackId, cls);
    let ghost: GhostRun | null = null;
    let ghostLabel = '';
    let ghostCfg = null as ReturnType<typeof ttConfig> | null;
    if (ghostPick !== 'off') {
      const rec = this.ttRecord(trackId, cls);
      if (ghostPick === 'pb' && rec?.ghost) {
        const g = await decodeGhost(rec.ghost);
        if (g && g.simVersion === SIM_VERSION) {
          const racer = { ...this.playerRacer(), kart: { ...this.kartLook(), body: g.body ?? 0 } };
          ghostCfg = { ...ttConfig(track, g.cls, g.modifiers, racer, g.forgiving), seed: g.seed };
          ghost = await runAsync(replayJob(ghostCfg, g.inputs));
          ghostLabel = t('Your best');
        }
      }
      if (!ghost && dev) {
        ghost = dev;
        ghostCfg = ttConfig(track, simClass(cls), modifiers, devRacer());
        ghostLabel = t('Dev ghost (Token Tails team)');
      }
    }
    this.pending = { kind: 'tt', trackId, cls, modifiers, ghost, ghostLabel, dev: dev?.time ?? null };
    this.ttGhost?.arm(ghost && ghostCfg ? { cfg: ghostCfg, run: ghost, name: ghostLabel === t('Your best') ? t('Your best') : t('Dev ghost') } : null);
    this.clearForRace();
    const promise = this.shell.startRace({
      track,
      cls: simClass(cls),
      seed: TT_SEED,
      modifiers,
      mode: 'tt',
      racers: [this.playerRacer()],
      playerSlot: 0,
      waitForInput: false,
      actions: [
        { label: t('Retry ↻'), exit: 'again', primary: true },
        { label: t('Tracks'), exit: 'next' },
      ],
    });
    const rec = this.ttRecord(trackId, cls);
    const medals = dev?.time ? medalTimes(dev.time) : null;
    this.setModeHud({ mode: 'tt', splits: [], tag: rec ? t('Best {t}', { t: fmt(rec.best) }) : medals ? t('Gold {t}', { t: fmt(medals[0]) }) : t('Time trial') });
    void promise.then((o) => {
      if (o.exit === 'again') void this.startTt(trackId, cls, ghostPick);
      else if (o.exit === 'next') {
        this.shell.leaveRace();
        screens.clear();
        void screens.push('menu').then(() => void screens.push('tt'));
      }
    });
  }

  /** Split deltas against the ghost for the HUD. */
  ghostSplit(c: number): number | null {
    const p = this.pending;
    if (!p || p.kind !== 'tt' || !p.ghost) return null;
    return p.ghost.splits[c] ?? null;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Battle
  // ------------------------------------------------------------------------------------------------------------------

  battleClass(): RaceClass {
    // playtest round 2: battle at 50cc crawled (27–52 km/h); the arena is small, so it always runs at 100cc
    return 1;
  }

  startBattle(): void {
    const seed = newSeed();
    const cls = this.battleClass();
    const field = buildCupField(seed, cls as ClassPick, this.player());
    const slot = seed % 8;
    const order = field.slice(1);
    order.splice(slot, 0, field[0]);
    const racers: RacerInfo[] = order.map((r) => {
      const info: RacerInfo = { name: r.name, cat: r.cat, kart: r.kart };
      if (r.ai) info.ai = r.ai;
      if (r.pinkPawId) info.pinkPawId = r.pinkPawId;
      if (r.hat) info.hat = r.hat;
      return info;
    });
    this.pending = { kind: 'battle' };
    this.ttGhost?.arm(null);
    this.clearForRace();
    const promise = this.shell.startRace({
      track: RUG,
      cls,
      seed,
      modifiers: 0,
      mode: 'battle',
      racers,
      playerSlot: slot,
      timeLimitTicks: BATTLE_TICKS, // [integrator] the HUD clock reads this: 3:00, not 3:01 (the battle rules end the round on it)
      waitForInput: false,
      actions: [{ label: t('Rematch ↻'), exit: 'again', primary: true }],
    });
    this.setModeHud({ mode: 'battle', tag: t('Balloon Battle') });
    void promise.then((o) => {
      if (o.exit === 'again') this.startBattle();
    });
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Daily Cup (the share lane runs it; the menu starts it)
  // ------------------------------------------------------------------------------------------------------------------

  startDaily(): void {
    const day = dayNoFor(new Date());
    const d = dailySetup(day, TRACKS);
    try {
      history.replaceState(null, '', dailyUrl(location, day));
    } catch {
      /* sandboxed frames */
    }
    this.pending = null;
    this.clearForRace();
    this.shell.start({ track: d.track, cls: d.cls, seed: d.seed, modifiers: d.modifiers, mode: 'daily', day });
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Single race ([integrator]): any track, any unlocked class, the usual Again / Next / Menu results
  // ------------------------------------------------------------------------------------------------------------------

  startQuick(trackId: string, cls: ClassPick): void {
    this.update((s) => {
      s.last.quickTrack = trackId;
      s.last.quickCls = cls;
    });
    const sim = simClass(cls);
    this.pending = null;
    this.ttGhost?.arm(null);
    this.clearForRace();
    // the results' Next keeps this class (the shell reads its settings)
    this.shell.updateSettings({ cls: sim });
    void this.shell.startRace({ track: trackById(trackId), cls: sim, seed: newSeed(), modifiers: cls === 3 ? 1 : 0, mode: 'race', playerKart: this.kartLook() });
  }

  // ------------------------------------------------------------------------------------------------------------------
  // misc
  // ------------------------------------------------------------------------------------------------------------------

  cupInProgress(): CupRun | null {
    const run = this.save.cup;
    return run && cupById(run.cupId) ? run : null;
  }

  toast(text: string): void {
    toast(text);
  }
}

export function fmt(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '–:––.––';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

export function fmtDelta(d: number): string {
  return `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
}
