// SHARE lane entry (ITERATION2.md 6.3): share card, challenge links (?c=) with ghosts, the Daily Run, the player name.
// src/ugc/index.ts calls registerShare() once, after the menus exist and the title stage is prepared.
import { events } from '../core/events';
import { callout } from '../core/hud';
import { addFrameHook, clock } from '../core/loop';
import { game, prefs } from '../core/state';
import { setEndlessBest } from '../ui/hud';
import { dayLabel } from './daily';
import type { RunResult } from '../core/types';
import { isUnlocked } from '../meta/save';
import { lastRunResult, play, save, setSave } from '../ui/flow';
import { fmtInt } from '../ui/format';
import { exposeTestHook, provide } from '../ugc/contract';
import { addButton, onScreen, refreshHub } from '../ugc/hub';
import { active, activeChallenge } from './active';
import { cardBlob, snapshotScene, type CardInfo } from './card';
import { decodeLook } from '../wardrobe/look';
import { decodeChallenge, encodeChallenge, type Challenge } from './code';
import { dailyCfg, isTodayDaily, registerDailyStage, setDailyToday, todayKey } from './dailystage';
import { packGhost, unpackGhost, type GhostSample } from './ghost';
import { challengeUrl, lastLink, linkOpts, openChallengeCode, openLinkFromUrl, playerName, prepareLink } from './links';
import { initRace, race } from './race';
import { initRecording, recording } from './record';
import { askName, buildCard, isSheetOpen, openShareSheet } from './sheet';
import './share.css';

const ICON_SUN =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#ffc21a" stroke="#2a1c14" stroke-width="2"/><g stroke="#2a1c14" stroke-width="2.2" stroke-linecap="round"><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M4.8 19.2l2.1-2.1M17.1 6.9l2.1-2.1"/></g></svg>';
const ICON_SHARE =
  '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="#2a1c14" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="#2a1c14" stroke-width="2.6" stroke-linecap="round"/></svg>';

/** today's Daily Run */
export function startDaily(): void {
  setDailyToday();
  play('daily');
}

function onDailyEnd(r: RunResult): void {
  if (r.stageId !== 'daily' || !isTodayDaily()) return;
  const day = dailyCfg.day;
  const d = save.daily.day === day ? save.daily : { day, best: 0, distance: 0 };
  setSave({
    ...save,
    daily: { day, best: Math.max(d.best, r.score), distance: Math.max(d.distance, r.distance) },
    ugcStats: { ...save.ugcStats, dailyPlays: save.ugcStats.dailyPlays + 1 },
  });
}

const playedToday = () => save.daily.day === todayKey() && save.daily.best > 0;
const newToday = () => (save.daily.day !== todayKey() ? 'NEW' : null);

export function registerShare(): void {
  registerDailyStage();
  initRecording();
  initRace();
  provide({
    playerName,
    askName: () => askName(false),
    challengeUrl,
    activeChallenge,
  });

  addButton({ id: 'ugcDaily', slot: 'title', label: 'DAILY', icon: ICON_SUN, order: 20, visible: () => isUnlocked(save, 'daily'), badge: newToday, onClick: startDaily });
  const dailyCard = addButton({ id: 'ugcDailyCard', slot: 'select', label: 'DAILY RUN', icon: ICON_SUN, order: 10, tone: 'gold', visible: () => isUnlocked(save, 'daily'), badge: newToday, onClick: startDaily });
  addButton({ id: 'ugcShare', slot: 'results', label: 'SHARE', icon: ICON_SHARE, order: 10, tone: 'gold', visible: () => !!lastRunResult(), onClick: () => void openShareSheet() });

  // the card background: the finish flourish's 3/4-front victory pose with confetti (1.15 s of sim time after the
  // line, when the swing has arrived); without a flourish (reduced motion, endless) the scene as the run ends
  let finishAt = -1;
  let snapped = false;
  events.on('stageStart', ({ stage }) => {
    finishAt = -1;
    snapped = false;
    if (stage.id === 'daily') {
      // the Daily Run's identity: a banner, and today's best in the distance pill
      const today = isTodayDaily();
      const best = today && save.daily.day === dailyCfg.day ? save.daily.distance : 0;
      setEndlessBest(best, today ? "TODAY'S BEST" : 'BEST');
      callout(today ? `DAILY RUN · ${dayLabel(dailyCfg.day)}` : stage.name.toUpperCase(), 'info');
    }
  });
  events.on('finishLine', () => {
    finishAt = prefs.reducedMotion ? -1 : clock.sim;
  });
  addFrameHook(() => {
    if (finishAt < 0 || snapped || game.mode !== 'finish' || clock.sim - finishAt < 1.15) return;
    snapped = true;
    snapshotScene();
  });
  events.on('stageEnd', ({ result }) => {
    onDailyEnd(result);
    if (!snapped) snapshotScene();
    finishAt = -1;
  });
  onScreen((s) => {
    if (s === 'results') {
      // the card and the compact link are made now, so SHARE is instant
      buildCard();
      const r = lastRunResult();
      if (r) void prepareLink(r);
    } else if (s === 'select') {
      const lbl = dailyCard.querySelector('.ugc-lbl');
      if (lbl) lbl.textContent = playedToday() ? `DAILY RUN · BEST ${fmtInt(save.daily.best)}` : 'DAILY RUN';
    }
  });
  refreshHub();

  exposeTestHook('share', {
    encode: (c: Challenge) => encodeChallenge({ ...c, ghost: c.ghost instanceof Uint8Array ? c.ghost : new Uint8Array((c.ghost as unknown as number[]) ?? []) }),
    decode: (s: string) => decodeChallenge(s),
    /** samples -> packed ghost bytes (synthetic challenges in shots) */
    packGhost: (samples: GhostSample[], hz = 6) => packGhost(samples, hz),
    unpackGhost: (b: Uint8Array) => {
      const g = unpackGhost(b);
      return g ? { hz: g.hz, n: g.n, first: g.s[0], last: g.s[g.n - 1] } : null;
    },
    lastLink,
    /** the compact link of the last run (waits for the deflate) */
    link: async () => {
      const r = lastRunResult();
      return r ? prepareLink(r) : null;
    },
    /** a card from made-up data (look at the layout: stickers, trails, long names) */
    sampleCard: (o: Partial<CardInfo> = {}) =>
      cardBlob({ stage: 'Sunny Meadow Canyon', score: 512340, kind: 'stars', stars: [true, true, false], distance: 0, trailName: '', look: decodeLook('3a0210'), name: 'Mia', style: { bestChain: 23, tricks: 7, stylePoints: 4200, rank: 'A' }, sticker: '', best: false, ...o }),
    cardBlob: async () => {
      const b = buildCard();
      if (!b) throw new Error('no run yet');
      return b;
    },
    ghost: () => ({ active: race.active, visible: race.visible, samples: race.samples, s: race.s, recorded: recording.samples }),
    challenge: () => activeChallenge(),
    won: () => active.won,
    daily: () => ({ ...dailyCfg, today: isTodayDaily(), saved: { ...save.daily } }),
    startDaily,
    openLink: (code: string) => openChallengeCode(code),
    open: () => openShareSheet(),
    sheetOpen: isSheetOpen,
    /** in memory only: let dev.jump runs (started mid-stage) make challenge links too */
    devAllowPartial: (on = true) => {
      linkOpts.allowPartial = !!on;
    },
  });

  // a challenge link (?c=) opens on the title
  openLinkFromUrl();
}
