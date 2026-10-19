/**
 * Lane "progression" install (iteration 2). Owns src/progression/** (fish economy, unlocks, achievements, stats,
 * garage, rival picker, daily challenges), content/cosmetics.ts and share/pinkpaw/unlocks.ts.
 *
 * What it hooks, all through public contracts:
 * - app bus: `raceStart` (rival chip), `raceEnd` (record the race: fish, stats, challenges, achievements),
 *   `cupEnd` (trophies, class / Mirror / Catnip Cup unlocks, a shelter cat), `unlock` (the shell's own class unlocks).
 *   It emits `fishEarned`, `achievement`, `unlock` and `purchase`.
 * - `registerResultSection` (fish earned, next goal, achievements, daily challenges, rival record, garage links).
 * - `registerScreen('garage' | 'achievements' | 'stats' | 'rewards')`, lazy chunks.
 * - the race request: `shell.start` is wrapped (marked below) so the garage loadout (body, paint, number, hat, trail,
 *   a playable Pink Paw cat) and the GP / Daily Cup rival are on the grid before the race is built.
 * - the JuiceBus: the player's hat on the head bone and the trail behind the kart (render only).
 *
 * The modes lane reaches the progression through `src/progression/api.ts` (unlock states, the loadout, medals).
 */
import type { Shell, RaceRequest, RaceSetup } from '../core/app/shell';
import type { RaceClass, RaceEvent } from '../types';
import { registerStrings, t } from '../ui/i18n';
import { PROGRESSION_EN } from '../ui/strings/progression.en';
import { registerScreen, screens } from '../core/app/screens';
import { registerResultSection } from '../core/hud/results';
import { saveProgress } from '../core/app/settings';
import { load } from '../core/app/storage';
import { emptyStats } from '../core/app/race-stats';
import { shareHooks } from '../share/hooks';
import { buildField } from '../items-ai';
import { ALL_TRACKS } from '../core/track/tracks';
import { toast } from '../ui/kit';
import { reducedMotion } from '../ui/a11y';
import { prog, setProg, world, queueReward, onProg, dailyToday, peekRewards } from './store';
import { applyCup, applyGhostWins, applyRace, applyShellClass, emptyAward, mergeAward, type Award, type RaceRecord } from './record';
import { dressRequest } from './loadout';
import { hitRival } from './rival';
import { achievementById } from './achievements';
import { wearHat, HAT_NAME } from './cosmetics/hats';
import { KartTrail } from './cosmetics/trail';
import { renderProgressSection } from './results-section';
import { setLastAward, lastAward } from './last';
import './progression.css';

/** the shell's default player slot (core/app/shell.ts PLAYER_SLOT) */
const DEFAULT_SLOT = 5;

/** total dare wins in the share lane's rivalry ledger (device only) */
function ledgerWins(): number {
  const l = load<Record<string, { me?: number }>>('rivalry', {});
  let n = 0;
  for (const v of Object.values(l)) n += typeof v?.me === 'number' ? v.me : 0;
  return n;
}

export function installProgression(shell: Shell): void {
  registerStrings('en', PROGRESSION_EN);
  const s0 = prog();

  // ---- class unlocks: one truth in both saves (the shell clamps ?cls and its pickers to its own copy) ----
  const syncClass = () => {
    const s = prog();
    if (s.classUnlocked > shell.progress.unlocked) {
      shell.progress.unlocked = s.classUnlocked;
      saveProgress(shell.progress);
    } else if (shell.progress.unlocked > s.classUnlocked) setProg(applyShellClass(s, shell.progress.unlocked, world()).save);
  };
  syncClass();
  if (s0.ghostWins < 0) setProg(applyGhostWins(prog(), ledgerWins(), world()).save);

  // ---- announce what an award brought (app bus for other lanes, a toast when no results are up) ----
  const announce = (a: Award, toasts: boolean) => {
    if (a.total > 0) appBusEmitFish(shell, a);
    for (const id of a.achievements) {
      shell.appBus.emit('achievement', { id });
      const def = achievementById(id);
      if (toasts && def) toast(`${def.icon} ${t('Achievement: {name}', { name: t(def.name) })}`);
    }
    for (const u of a.unlocks) {
      if (u.kind === 'class') {
        syncClass();
        shell.appBus.emit('unlock', { kind: 'class', id: u.id });
      } else shell.appBus.emit('unlock', { kind: u.kind, id: u.id });
    }
  };

  // ---- the race request: loadout + rival (wraps shell.start; integrator: a `playerLoadout` hook would replace it) ----
  let rivalNow: { kart: number; name: string } | null = null;
  let lastGp: { cupId: string; index: number } | null = null;
  const start = shell.start.bind(shell);
  // [progression lane] every race starts through here, so the garage and the rival reach every grid
  shell.start = (setup: RaceSetup | RaceRequest) => {
    let req = setup as RaceRequest;
    try {
      const s = prog();
      let cupRival: string | null = null;
      if (req.mode === 'gp' && req.cupId) {
        const idx = req.raceIndex ?? 0;
        const same = s.cupRival?.cupId === req.cupId;
        const restartOfFirst = idx === 0 && lastGp?.cupId === req.cupId && lastGp.index === 0;
        cupRival = same && (idx > 0 || restartOfFirst) ? s.cupRival!.name : null;
        lastGp = { cupId: req.cupId, index: idx };
      }
      const d = dressRequest(req, s, { buildField, own: shareHooks().playerRacer?.() ?? null, defaultSlot: DEFAULT_SLOT }, cupRival);
      req = d.req;
      rivalNow = d.rival;
      if (req.mode === 'gp' && req.cupId && d.rival && cupRival !== d.rival.name) {
        setProg({ ...prog(), cupRival: { cupId: req.cupId, name: d.rival.name }, lastRival: d.rival.name });
      }
    } catch (err) {
      console.warn('[progression] could not dress the race', err);
      rivalNow = null;
    }
    start(req);
  };

  // ---- race start: the rival chip, the hat, the trail ----
  const trail = new KartTrail(shell.stage.scene);
  let hatPut = false;
  // the rival is called out just after GO (the countdown owns the centre slot before it)
  let rivalCall: { kart: number; name: string } | null = null;
  let rivalTimer: ReturnType<typeof setTimeout> | null = null;
  const token = () => shell.raceToken;
  shell.appBus.on('raceStart', () => {
    hatPut = false;
    trail.set(prog().equip.trail);
    trail.clear();
    const me = shell.world?.cfg.humans[0] ?? DEFAULT_SLOT;
    const rival = rivalNow && shell.racers[rivalNow.kart]?.rival ? rivalNow : null;
    const anyRival = rival ?? findRival(shell, me);
    shell.hudExtras({ rival: anyRival ?? undefined });
    rivalCall = anyRival;
    putHat(shell, me);
    hatPut = true;
  });
  shell.bus.add({
    onEvent: (e) => {
      if (e.type !== 'go' || !rivalCall) return;
      const name = rivalCall.name;
      const at = token();
      if (rivalTimer) clearTimeout(rivalTimer);
      rivalTimer = setTimeout(() => {
        rivalTimer = null;
        if (at === token() && !shell.isPaused) shell.hud.say(t('RIVAL: {name}', { name }), { prio: 1, ms: 2200, tone: 'red', sub: t('beat them to the line') });
      }, 1300);
    },
    onFrame: (f) => {
      const v = shell.view;
      if (!v) return;
      if (!hatPut) {
        putHat(shell, f.me);
        hatPut = true;
      }
      const kv = v.karts[f.me];
      if (!kv) return;
      const k = f.st.karts[f.me];
      const sp = Math.hypot(k.vx, k.vz);
      const racing = f.st.phase !== 'countdown' && !f.paused && kv.root.visible;
      trail.update(f.paused ? 0 : f.dt, kv.root.position.x, kv.root.position.y, kv.root.position.z, kv.root.rotation.y, sp, racing, reducedMotion());
    },
    onReset: () => {
      trail.clear();
      if (rivalTimer) clearTimeout(rivalTimer);
      rivalTimer = null;
    },
  });
  onProg((s) => trail.set(s.equip.trail));

  // ---- race end: record it ----
  shell.appBus.on('raceEnd', ({ result }) => {
    const w = shell.world;
    if (!w) return;
    const me = w.cfg.humans[0] ?? result.player.kart;
    const events: readonly RaceEvent[] = w.st.events;
    let maxCoins = 0;
    for (const e of events) if (e.type === 'coin' && e.kart === me && (e.a ?? 0) > maxCoins) maxCoins = e.a ?? 0;
    const rivalIdx = w.cfg.racers.findIndex((r, i) => i !== me && r.rival);
    const arena = w.cfg.track.kind === 'arena';
    const rec: RaceRecord = {
      result,
      stats: result.stats?.[me] ?? emptyStats(me),
      trackId: w.cfg.track.id,
      modifiers: w.cfg.modifiers,
      ugc: !ALL_TRACKS.some((t) => t.id === w.cfg.track.id),
      hasBranches: (w.cfg.track.branches?.length ?? 0) > 0,
      body: w.cfg.racers[me]?.kart.body ?? 0,
      distance: arena ? 0 : Math.max(0, w.st.karts[me]?.dist ?? 0),
      maxCoinsHeld: maxCoins,
      rival: rivalIdx >= 0 ? { kart: rivalIdx, name: w.cfg.racers[rivalIdx].name, hit: hitRival(events, me, rivalIdx) } : undefined,
    };
    const before = prog();
    const { save, award } = applyRace(before, rec, world());
    setProg(save);
    setLastAward(award, shell.raceToken, result.seed, before.fish);
    if (result.mode === 'gp' && w.cfg.cupId) cupFish.set(w.cfg.cupId, (cupFish.get(w.cfg.cupId) ?? 0) + award.total);
    announce(award, false);
    checkGhosts(shell);
  });
  const cupFish = new Map<string, number>();
  shell.appBus.on('raceStart', ({ mode, cupId, raceIndex }) => {
    if (mode === 'gp' && cupId && (raceIndex ?? 0) === 0) cupFish.set(cupId, 0);
  });

  // ---- a Grand Prix result (modes lane) ----
  shell.appBus.on('cupEnd', (e) => {
    const mirror = !!(e as { mirror?: boolean }).mirror;
    const { save, award } = applyCup(prog(), { cupId: e.cupId, cls: e.cls as RaceClass, place: e.place, mirror }, world());
    setProg(save);
    const races = cupFish.get(e.cupId) ?? 0;
    queueReward(races > 0 ? mergeAward({ ...emptyAward(), fish: [{ key: 'Races in this cup', amount: races }], total: races }, award) : award);
    announce(award, false);
  });

  // ---- the shell unlocked a class on its own (v1 rule after a quick race) ----
  shell.appBus.on('unlock', (e) => {
    if (e.kind !== 'class') return;
    const n = Number(e.id);
    if (Number.isInteger(n) && n > prog().classUnlocked) {
      const r = applyShellClass(prog(), n, world());
      setProg(r.save);
      const la = lastAward();
      if (la) setLastAward(mergeAward(la.award, r.award), la.token, la.seed, la.fishBefore);
    }
  });

  // dare wins land a little after the results (the ghost's time is recomputed over a few frames)
  shell.appBus.on('screen', ({ id }) => {
    checkGhosts(shell);
    // a cup's rewards that nobody showed yet (the modes lane pushes `rewards` after the podium) appear on the menu
    if (id === 'menu' && peekRewards().length) void screens.push('rewards');
  });

  // ---- results section, screens ----
  registerResultSection(50, (ctx) => renderProgressSection(ctx, shell));
  registerScreen('garage', () => import('./screens/garage').then((m) => m.garageScreen(shell)));
  registerScreen('achievements', () => import('./screens/awards').then((m) => m.awardsScreen()));
  registerScreen('stats', () => import('./screens/stats').then((m) => m.statsScreen()));
  registerScreen('rewards', () => import('./screens/rewards').then((m) => m.rewardsScreen()));

  // today's challenges exist from the first boot (the results and the menu show them)
  dailyToday();
  (window as unknown as { __fmProg?: unknown }).__fmProg = { prog, setProg, screens };
}

function appBusEmitFish(shell: Shell, a: Award): void {
  shell.appBus.emit('fishEarned', { amount: a.total, reasons: a.fish.map((f) => ({ label: t(f.key, f.vars), amount: f.amount })) });
}

/** A rival another lane set on the field (modes' own GP grid), or null. */
function findRival(shell: Shell, me: number): { kart: number; name: string } | null {
  const i = shell.racers.findIndex((r, k) => k !== me && r.rival);
  return i >= 0 ? { kart: i, name: shell.racers[i].name } : null;
}

/** The player's hat on the head bone (skipped when the kart view already draws one). */
function putHat(shell: Shell, me: number): void {
  const kv = shell.view?.karts[me];
  const info = shell.racers[me];
  if (!kv || !info) return;
  if (kv.root.userData.cosmetics || kv.root.getObjectByName(HAT_NAME)) return;
  wearHat(kv.cat.head, info.hat ?? 0);
}

let ghostTimer: ReturnType<typeof setTimeout> | null = null;
function checkGhosts(shell: Shell): void {
  const run = () => {
    const total = ledgerWins();
    const s = prog();
    if (s.ghostWins >= 0 && total <= s.ghostWins) return;
    const r = applyGhostWins(s, total, world());
    setProg(r.save);
    for (const id of r.award.achievements) {
      shell.appBus.emit('achievement', { id });
      const def = achievementById(id);
      if (def) toast(`${def.icon} ${t('Achievement: {name}', { name: t(def.name) })} +${r.award.total} 🐟`);
    }
  };
  run();
  if (ghostTimer) clearTimeout(ghostTimer);
  ghostTimer = setTimeout(run, 2500);
}
