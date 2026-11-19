/**
 * The replay viewer (MATCH-MOMENTS.md §2, HIGHLIGHTS.md §5.2), its own lazy chunk. It draws a saved match with the normal match view: a
 * MatchSession whose host is a ReplayHost over one ReplayEngine (the sim Worker re-running the stored inputs). The
 * bar under it: play / pause, 1x / 2x / 4x, a seek bar (the part the scout has run is seekable; red marks are the
 * player's deaths, gold marks its takedowns), "my deaths" (jump to the next one, 5 s before it), a free camera (drag
 * the map; "Follow me" returns) and Exit. A seek rebuilds the view at the new tick from the nearest keyframe, so
 * nothing drawn before the seek lingers. Input never reaches the replay.
 *
 * Highlights (HIGHLIGHTS.md): the detector rides the scout in the Worker; its reel (or the history row's cached one)
 * draws coloured bands on the seek bar and a Highlights chip row (closed by default, so the phone bar keeps its
 * height). A chip, N / Shift+N, or a results card plays a highlight with the director camera (it frames the fight or
 * follows the hero, never past the player's fog); "Highlights only" plays them back to back; the Clip panel records
 * "This highlight"; the results' Montage records 3-5 of them in one video.
 */
import type { MatchEnd, MatchSession, MatchSetup } from '../app/matchSession';
import type { GameRenderer } from '../render/renderer';
import type { Look } from '../render/cosmetics';
import { screenRightXZ, toX, toZ, towardCameraXZ } from '../render/coords';
import { HERO_TEXT, slotNames } from '../ui/heroText';
import { fillPicks } from '../sim/index';
import { fillPicksParty } from '../sim/party';
import { MAP } from '../data/map';
import type { HeroId, TrickId } from '../sim/api';
import { ReplayEngine, type ReplayHost } from './host';
import type { ReplayError, ReplayInfo, ReplayRecordLike } from './core';
import { REPLAY_SPEEDS } from './loop';
import { clock, MODE_LABEL, type HistoryEntry } from './store';
import { sfx } from '../audio/sfx';
import { CLIP_DEFAULT_SECONDS, CLIP_LENGTHS, clipSeconds, clipSupported, defaultFraming, momentTick, openClipSheet, startClip, startMontage, type ClipKind, type ClipRecorder, type Framing } from '../share/clip';
import { HZ, highlightAt, highlightSeconds, mmss, montageSegments, stepHighlight, type Highlight, type HighlightReel } from './highlights/rules';
import '../ui/css/moments.css';

/** "Jump to my death" lands this many ticks before it (5 s), so the fight leading to it is seen. */
export const DEATH_LEAD_TICKS = 150;

export interface ViewerContext {
  Session: typeof MatchSession;
  gr: GameRenderer;
  root: HTMLElement;
  /** The kept record (solo, party or PvP), with `me` = the player's seat. */
  record: ReplayRecordLike;
  entry: HistoryEntry;
  muted: boolean;
  look: Look | null;
  playerName?: string | null;
  /** The app drives the frame loop, pause and visibility through its current session. */
  setSession(s: MatchSession | null): void;
  /** The app's warm-up (programs compiled behind the veil); resolves when the view is ready. */
  warm?(s: MatchSession): Promise<void>;
  onExit(): void;
  onMute(m: boolean): void;
  onSettings?(done: () => void): void;
  track?(event: string, props: Record<string, string | number | boolean>): void;
  /**
   * SHARE-PUSH.md §1, the results' Legend Moment: open straight on the match's best moment and record a clip of it in
   * this framing (the scout finds the window with the most takedowns first).
   */
  clip?: Framing | null;
  /** The banner headline of a clip (the match's best moment, "Shut down!"), else LEGEND MOMENT. */
  clipTitle?: string | null;
  /** Send the game link through the share bridge (a device that cannot share a video file). */
  onShareLink?(url: string, text: string): void;
  /** HIGHLIGHTS.md: the history row's cached reel (else the scout computes it and `onReel` hands it back). */
  reel?: HighlightReel | null;
  onReel?(reel: HighlightReel): void;
  /** Open on this highlight id (a results card): play it with the director camera, then its end card; with `clip`, record it. */
  highlight?: string | null;
  /** Record the match montage in this framing (the results' Montage button). */
  montage?: Framing | null;
  /** Display name per hero slot for the highlight titles (the results' names); else the seed's bot names. */
  names?: readonly string[] | null;
}

/** The camera point of a highlight at tick `t` (sim mm), interpolated between its keys; null without keys. Pure. */
export function camPoint(h: Pick<Highlight, 'cam'>, t: number): { x: number; y: number } | null {
  const k = h.cam.keys;
  if (!k.length) return null;
  if (t <= k[0][0]) return { x: k[0][1] * 100, y: k[0][2] * 100 };
  for (let i = 1; i < k.length; i++) {
    if (t > k[i][0]) continue;
    const a = k[i - 1];
    const b = k[i];
    const f = (t - a[0]) / Math.max(1, b[0] - a[0]);
    return { x: (a[1] + (b[1] - a[1]) * f) * 100, y: (a[2] + (b[2] - a[2]) * f) * 100 };
  }
  const z = k[k.length - 1];
  return { x: z[1] * 100, y: z[2] * 100 };
}

/** The bar's colour family for a highlight (gold epic, sky teamfight, bolt clutch/objective, rose funny). Pure. */
export const bandOf = (h: Pick<Highlight, 'category'>): 'epic' | 'fight' | 'bolt' | 'funny' =>
  h.category === 'funny' ? 'funny' : h.category === 'teamfight' ? 'fight' : h.category === 'clutch' || h.category === 'objective' ? 'bolt' : 'epic';

export const ERROR_TEXT: Readonly<Record<ReplayError | 'crash' | 'slow', string>> = Object.freeze({
  version: 'This replay was made with an older version of the game, so it cannot play here.',
  party: 'Party match replays are not available yet.',
  decode: 'This replay could not be read.',
  slow: 'Replays are not available on this device.',
  crash: 'The replay stopped. Try again.',
});

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The next death at least 1 s after `tick`, else the first (wraps); -1 when none. Pure. */
export function nextDeath(deaths: readonly number[], tick: number): number {
  if (!deaths.length) return -1;
  const after = deaths.find((d) => d - DEATH_LEAD_TICKS > tick + 30);
  return after ?? deaths[0];
}

/** Where a click at fraction `f` of the bar lands: clamped to the scouted part. Pure. */
export function seekTick(f: number, info: Pick<ReplayInfo, 'total' | 'scouted'>): number {
  const t = Math.round(Math.max(0, Math.min(1, f)) * info.total);
  return Math.max(0, Math.min(t, Math.max(0, info.scouted - 1)));
}

export interface ReplayViewer {
  close(): void;
}

export function openReplayViewer(ctx: ViewerContext): ReplayViewer {
  const rec = ctx.record;
  const me = rec.me ?? 0;
  const seat = rec.humans?.find((h) => h.slot === me);
  const myHero = (seat?.hero ?? rec.hero ?? ctx.entry.hero) as HeroId;
  const myTrick = (seat?.trick ?? rec.trick ?? 'pounce') as TrickId;
  const heroTitle = ctx.entry.heroName || HERO_TEXT[myHero]?.title || myHero;
  let names: readonly string[] = ctx.names ?? [];
  if (!names.length)
    try {
      const picks = rec.humans ? fillPicksParty(rec.seed, rec.humans, rec.map).picks : fillPicks(rec.seed, myHero, myTrick, rec.map).picks;
      names = slotNames(picks, rec.seed, me).map((n, i) => (i === me ? heroTitle : n));
    } catch {
      names = [];
    }
  // a cached reel spares the Worker the detector
  const engine = new ReplayEngine(rec, { hl: ctx.reel ? null : { names: names.slice(), ...(ctx.entry.emotes?.length ? { emotes: ctx.entry.emotes.slice() } : {}) } });
  const html = document.documentElement;
  let session: MatchSession | null = null;
  let host: ReplayHost | null = null;
  let info: ReplayInfo = { total: rec.ticks, scouted: 0, deaths: [], takedowns: [], done: false, ok: null, slow: false };
  let closed = false;
  let building = 0;
  let ended = false;
  let free: { x: number; z: number } | null = null;
  // HIGHLIGHTS.md: the reel (cached or from the scout), the director, Highlights only, the montage
  let reel: HighlightReel | null = ctx.reel ?? null;
  let reelKnown = !!reel;
  let dir: Highlight | null = null;
  /** What the director does at its highlight's end: show the highlight's end card, or just let go. */
  let dirStop: 'card' | 'off' = 'off';
  let lastHl: Highlight | null = null;
  let hlOnly = false;
  let montageWant: Framing | null = ctx.montage && clipSupported() ? ctx.montage : null;
  let montaging = false;
  /** The current build's warm-up finished and the replay runs (a montage seek waits for it). */
  let viewReady = false;
  let readyCb: (() => void) | null = null;
  ctx.track?.('replay_open', { hero: myHero, ticks: rec.ticks, worker: engine.kind === 'worker', party: !!rec.humans });

  const bar = document.createElement('div');
  bar.className = 'mm-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Replay controls');
  const heroName = heroTitle;
  bar.innerHTML = `
    <button type="button" class="mm-b mm-x" data-r="exit" aria-label="Exit replay" title="Exit replay">✕</button>
    <button type="button" class="mm-b mm-play" data-r="play" aria-label="Play" data-testid="replay-play">▶</button>
    <span class="mm-speeds" role="group" aria-label="Speed">${REPLAY_SPEEDS.map((s) => `<button type="button" class="mm-b mm-sp${s === 1 ? ' on' : ''}" data-speed="${s}" aria-pressed="${s === 1}">${s}x</button>`).join('')}</span>
    <div class="mm-track" data-testid="replay-seek" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="${rec.ticks}" aria-valuenow="0">
      <i class="mm-buf"></i><i class="mm-pos"></i><span class="mm-marks"></span><i class="mm-thumb"></i>
    </div>
    <span class="mm-time" data-testid="replay-time">0:00 / ${clock(rec.ticks / 30)}</span>
    <button type="button" class="mm-b mm-death" data-r="death" data-testid="replay-death" disabled title="Jump to my next knockout">My deaths <b>0</b></button>
    <button type="button" class="mm-b mm-hlb" data-r="hl" data-testid="replay-highlights" aria-expanded="false" disabled title="Highlights (N: next)"><span class="mm-star" aria-hidden="true">✦</span><span class="mm-hll">Highlights</span> <b>0</b></button>
    <button type="button" class="mm-b mm-cam" data-r="cam" data-testid="replay-cam" aria-pressed="false" title="Free camera: drag the map">Free cam</button>
    <button type="button" class="mm-b mm-clipb" data-r="clip" data-testid="replay-clip" title="Record a 10-20 s clip from here" hidden><i class="mm-dot" aria-hidden="true"></i><span>Clip</span></button>`;
  const title = document.createElement('div');
  title.className = 'mm-title';
  title.innerHTML = `<b>Replay</b><span>${esc(heroName)} · ${esc(MODE_LABEL[ctx.entry.mode] ?? '')} · ${ctx.entry.outcome === 'won' ? 'Victory' : ctx.entry.outcome === 'draw' ? 'Draw' : 'Defeat'}</span>`;
  // the Highlights chip row: one row over the bar, closed by default (the phone bar keeps its height)
  const hlRow = document.createElement('div');
  hlRow.className = 'mm-hlrow';
  hlRow.hidden = true;
  hlRow.setAttribute('role', 'toolbar');
  hlRow.setAttribute('aria-label', 'Highlights');
  hlRow.dataset.testid = 'replay-hl-row';
  const drag = document.createElement('div');
  drag.className = 'mm-drag';
  drag.hidden = true;
  const veil = document.createElement('div');
  veil.className = 'mm-veil';
  veil.innerHTML = '<span class="mm-spin" aria-hidden="true"></span><b>Loading replay…</b>';
  // SHARE-PUSH.md §1: the clip panel (framing and length), over the view above the bar
  const canClip = clipSupported();
  let framing: Framing = ctx.clip ?? defaultFraming({ touch: html.dataset.touch === '1', w: innerWidth, h: innerHeight });
  let clipLen: number | 'hl' = CLIP_DEFAULT_SECONDS;
  /** The highlight under the play head when the Clip panel opened ("This highlight"). */
  let panelHl: Highlight | null = null;
  const panel = document.createElement('div');
  panel.className = 'mm-clippanel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Record a clip');
  panel.dataset.testid = 'clip-panel';
  panel.innerHTML = `<b>Record a clip</b>
    <div class="mm-seg" role="group" aria-label="Framing"><button type="button" class="mm-b" data-f="vertical" data-testid="clip-vertical">Vertical 9:16</button><button type="button" class="mm-b" data-f="wide" data-testid="clip-wide">Wide 16:9</button></div>
    <div class="mm-seg" role="group" aria-label="Length">${CLIP_LENGTHS.map((n) => `<button type="button" class="mm-b" data-len="${n}">${n} s</button>`).join('')}<button type="button" class="mm-b" data-len="hl" data-testid="clip-this-highlight" hidden>This highlight</button></div>
    <p>From here, at 1x, with the game's sound.</p>
    <div class="mm-row"><button type="button" class="pl-btn ghost small" data-k="cancel">Cancel</button><button type="button" class="pl-btn small" data-k="rec" data-testid="clip-record">Record</button></div>`;
  ctx.root.append(title, drag, hlRow, bar, panel, veil);
  html.dataset.replay = 'loading';

  const $ = <T extends HTMLElement>(sel: string): T => bar.querySelector<T>(sel)!;
  const track = $('.mm-track');
  const playBtn = $('.mm-play');
  const deathBtn = $<HTMLButtonElement>('.mm-death');
  const camBtn = $('.mm-cam');
  const hlBtn = $<HTMLButtonElement>('.mm-hlb');
  const clipBtn = $<HTMLButtonElement>('.mm-clipb');
  clipBtn.hidden = !canClip;
  let clipRec: ClipRecorder | null = null;
  let tapStream: MediaStream | null = null;
  /**
   * The Legend Moment run: cue the best moment (the reel's top highlight, else the most takedowns in 15 s) once it is
   * known, then record. A results card's Clip names its highlight.
   */
  let auto: { framing: Framing; cued: boolean; seconds: number; title?: string; sub?: string; kind?: ClipKind } | null = ctx.clip && canClip ? { framing: ctx.clip, cued: false, seconds: CLIP_DEFAULT_SECONDS } : null;
  if (auto || montageWant) html.dataset.clip = 'finding';

  const paintPanel = (): void => {
    for (const b of panel.querySelectorAll<HTMLElement>('[data-f]')) b.setAttribute('aria-pressed', String(b.dataset.f === framing));
    for (const b of panel.querySelectorAll<HTMLElement>('[data-len]')) b.setAttribute('aria-pressed', String(b.dataset.len === 'hl' ? clipLen === 'hl' : Number(b.dataset.len) === clipLen));
    const p = panel.querySelector('p');
    if (p) p.textContent = clipLen === 'hl' && panelHl ? `${panelHl.title}: ${highlightSeconds(panelHl)} s from ${mmss(panelHl.start)}, at 1x.` : "From here, at 1x, with the game's sound.";
  };
  const showPanel = (on: boolean): void => {
    panel.hidden = !on;
    clipBtn.setAttribute('aria-expanded', String(on));
    if (on) {
      // "This highlight" is preselected when the play head is inside one
      panelHl = highlightAt(reel, host?.tick ?? 0) ?? (ended ? lastHl : null);
      const hb = panel.querySelector<HTMLElement>('[data-len="hl"]')!;
      hb.hidden = !panelHl;
      if (panelHl) clipLen = 'hl';
      else if (clipLen === 'hl') clipLen = CLIP_DEFAULT_SECONDS;
      paintPanel();
      panel.querySelector<HTMLElement>('[data-k="rec"]')?.focus({ preventScroll: true });
    }
  };
  const clipLabel = (sec: number | null): void => {
    const sp = clipBtn.querySelector('span')!;
    sp.textContent = sec === null ? 'Clip' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    clipBtn.classList.toggle('rec', sec !== null);
    clipBtn.title = sec === null ? 'Record a 10-20 s clip from here' : 'Stop recording';
    clipBtn.setAttribute('aria-label', sec === null ? 'Record a clip' : 'Stop recording');
  };
  const endTap = (): void => {
    sfx.untap(tapStream);
    tapStream = null;
  };
  /** Stop a recording: keep it (the clip sheet opens) or throw it away. */
  const stopRec = (keep: boolean): void => {
    const r = clipRec;
    if (!r) return;
    clipRec = null;
    if (keep) r.stop();
    else r.cancel();
  };

  const fail = (why: ReplayError | 'crash' | 'slow'): void => {
    if (closed) return;
    html.dataset.replay = `error:${why}`;
    ctx.track?.('replay_error', { why });
    teardownSession();
    veil.classList.remove('out');
    // the reason's code under the text (founder, Nov 19: "not available" alone could not tell which check refused it)
    veil.innerHTML = `<div class="mm-err" role="alert"><b>Replay not available</b><p>${esc(ERROR_TEXT[why])}</p><small class="mm-errcode" data-testid="replay-error-code">Code: ${esc(why)}</small><button type="button" class="pl-btn" data-r="exit">Back</button></div>`;
  };

  const drawMarks = (): void => {
    const marks = bar.querySelector<HTMLElement>('.mm-marks')!;
    const total = Math.max(1, info.total);
    const pc = (t: number): string => ((Math.max(0, Math.min(total, t)) / total) * 100).toFixed(2);
    marks.innerHTML =
      (reel?.list ?? []).map((h) => `<i class="mm-band ${bandOf(h)}" style="left:${pc(h.start)}%;width:${(Number(pc(h.end)) - Number(pc(h.start))).toFixed(2)}%" title="${esc(h.title)} ${mmss(h.start)}"></i>`).join('') +
      info.deaths.map((t) => `<i class="mm-mk death" style="left:${((t / total) * 100).toFixed(2)}%" title="Knocked out ${clock(t / 30)}"></i>`).join('') +
      info.takedowns.map((t) => `<i class="mm-mk td" style="left:${((t / total) * 100).toFixed(2)}%" title="Knockout or assist ${clock(t / 30)}"></i>`).join('');
    track.style.setProperty('--buf', `${((info.scouted / total) * 100).toFixed(2)}%`);
    deathBtn.querySelector('b')!.textContent = String(info.deaths.length);
    deathBtn.disabled = info.deaths.length === 0;
    html.dataset.replayDeaths = String(info.deaths.length);
    html.dataset.replayScouted = String(info.scouted);
    if (info.done) html.dataset.replayOk = String(info.ok);
  };

  /** The highlight a results card or the Legend Moment wants: the named one, else the reel's best. */
  const wantedHl = (): Highlight | null => {
    const list = reel?.list ?? [];
    const id = ctx.highlight ?? reel?.top[0] ?? null;
    return (id ? list.find((h) => h.id === id) : null) ?? null;
  };

  /** Cue the Legend Moment / card clip once the scout has seen the whole match and the reel is known. */
  const cue = (): void => {
    if (!auto || auto.cued || !info.done || !reelKnown) return;
    auto.cued = true;
    const h = wantedHl();
    if (h) {
      Object.assign(auto, { seconds: highlightSeconds(h), title: h.title, sub: h.sub, kind: 'highlight' as const });
      ctx.track?.('hl_clip', { type: h.type, framing: auto.framing, seconds: auto.seconds });
      setDir(h, 'off');
      seek(h.start, 'Cueing your highlight…', true);
      return;
    }
    if (info.ok === false) {
      auto = null;
      return;
    }
    ctx.track?.('clip_moment', { takedowns: info.takedowns.length });
    seek(momentTick(info, CLIP_DEFAULT_SECONDS), 'Cueing your Legend Moment…');
  };

  const paintHl = (): void => {
    const list = reel?.list ?? [];
    hlBtn.disabled = list.length === 0;
    hlBtn.querySelector('b')!.textContent = String(list.length);
    html.dataset.replayHl = String(list.length);
    const at = dir?.id ?? null;
    hlRow.innerHTML =
      `<button type="button" class="mm-chip mm-only" data-hlonly data-testid="replay-hl-only" aria-pressed="${hlOnly}">${hlOnly ? 'Stop' : '▶ Highlights only'}</button>` +
      list.map((h) => `<button type="button" class="mm-chip ${bandOf(h)}${h.id === at ? ' on' : ''}" data-hl="${esc(h.id)}" title="${esc(h.sub)}"><b>${esc(h.title)}</b><small>${mmss(h.start)}</small></button>`).join('');
  };

  engine.listener = {
    info: (i) => {
      info = i;
      // Founder, Nov 19 (Watch said "Replay not available" on a phone): one slow measuring stretch (a busy phone while
      // the match view warms up) closed the replay for good, though playing needs only 30 ticks a second. A slow device
      // now plays; only its seeks take longer (they wait for the scout, "Loading…").
      html.dataset.replaySlow = i.slow ? '1' : '0';
      drawMarks();
      cue();
    },
    reel: (r) => {
      reelKnown = true;
      if (r && !reel) {
        reel = r;
        ctx.onReel?.(r);
        if (!ctx.reel) ctx.track?.('hl_scan', { ms: 0, count: r.list.length, ok: true, from: 'viewer' });
      }
      drawMarks();
      paintHl();
      cue();
      if (montageWant && viewReady) beginMontage();
    },
    error: (why) => fail(why),
  };

  const setPlayIcon = (): void => {
    const playing = !engine.paused && !ended;
    playBtn.textContent = playing ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (html.dataset.replay !== 'loading' && !html.dataset.replay?.startsWith('error')) html.dataset.replay = ended ? 'ended' : playing ? 'playing' : 'paused';
  };

  const teardownSession = (): void => {
    if (!session) return;
    ctx.setSession(null);
    session.dispose();
    session = null;
    host = null;
  };

  const endCard = (): void => {
    // a montage segment reaching the match's end: the montage goes on to its next segment and its end card
    if (montaging) return;
    // a results card's highlight that runs to the match's end keeps its own end card (Clip it · Next highlight ·
    // Watch full match) instead of "Replay over" (a recording of it still stops and opens the clip sheet)
    if (!clipRec && (html.dataset.replay === 'highlight-end' || (dir && dirStop === 'card'))) {
      const h = dir ?? lastHl;
      ended = true;
      if (dir) setDir(null);
      if (h && html.dataset.replay !== 'highlight-end') hlEndCard(h);
      return;
    }
    stopRec(true);
    ended = true;
    setPlayIcon();
    veil.classList.remove('out');
    veil.innerHTML = `<div class="mm-err mm-end" role="dialog" aria-label="Replay over"><b>Replay over</b><p>${esc(heroName)} · ${ctx.entry.k} / ${ctx.entry.d} / ${ctx.entry.a}</p><div class="mm-row"><button type="button" class="pl-btn ghost" data-r="exit">Back</button><button type="button" class="pl-btn" data-r="again" data-testid="replay-again">Watch again</button></div></div>`;
  };

  /** A highlight played to its end (from a results card): Clip it · Next highlight · Watch full match. */
  const hlEndCard = (h: Highlight): void => {
    lastHl = h;
    engine.setPaused(true);
    setPlayIcon();
    veil.classList.remove('out');
    veil.innerHTML = `<div class="mm-err mm-end mm-hlend" role="dialog" aria-label="Highlight over" data-testid="replay-hl-end"><b>${esc(h.title)}</b><p>${esc(h.sub)}</p><div class="mm-row">${canClip ? '<button type="button" class="pl-btn small" data-r="hlclip" data-testid="replay-hl-clip">Clip it</button>' : ''}<button type="button" class="pl-btn ghost small" data-r="hlnext" data-testid="replay-hl-next">Next highlight</button><button type="button" class="pl-btn ghost small" data-r="full" data-testid="replay-hl-full">Watch full match</button></div></div>`;
    html.dataset.replay = 'highlight-end';
  };

  /** Turn the director on (on `h`) or off. */
  function setDir(h: Highlight | null, stop: 'card' | 'off' = 'off'): void {
    dir = h;
    dirStop = stop;
    if (h) {
      lastHl = h;
      if (free) setFree(false);
      session?.view.peekEnd();
    } else if (!free) session?.view.peekEnd();
    html.dataset.replayCam = h ? 'director' : free ? 'free' : 'follow';
    if (h) html.dataset.replayHlAt = h.id;
    else delete html.dataset.replayHlAt;
    paintHl();
  }

  /** Play highlight `h` from its start with the director camera. */
  const playHighlight = (h: Highlight, stop: 'card' | 'off', label = 'Jumping to the highlight…'): void => {
    stopRec(false);
    setDir(h, stop);
    seek(h.start, label, true);
  };

  /** The director reached its highlight's end. */
  const dirEnded = (): void => {
    const h = dir;
    if (!h || clipRec || montaging) return;
    if (hlOnly) {
      const next = (reel?.list ?? []).find((x) => x.start > h.start);
      if (next) {
        veil.classList.add('mm-wipe');
        return playHighlight(next, 'off', next.title);
      }
      hlOnly = false;
      setDir(null);
      return hlEndCard(h);
    }
    if (dirStop === 'card') {
      setDir(null);
      return hlEndCard(h);
    }
    setDir(null);
  };

  /** Record highlight `h` (its own length) from its start. */
  const recordHighlight = (h: Highlight, f: Framing): void => {
    if (!canClip) return;
    const seconds = clipSeconds((h.end - h.start) / HZ, true);
    auto = { framing: f, cued: true, seconds, title: h.title, sub: h.sub, kind: 'highlight' };
    ctx.track?.('hl_clip', { type: h.type, framing: f, seconds });
    showPanel(false);
    setDir(h, 'off');
    seek(h.start, 'Cueing the highlight…', true);
  };

  /** HIGHLIGHTS.md §5.3: the montage (3-5 highlights, 20-30 s, in match order) in one recording. */
  function beginMontage(): void {
    const f = montageWant;
    if (!f || montaging || closed || !session) return;
    montageWant = null;
    const segs = reel ? montageSegments(reel, info.total) : [];
    if (segs.length < 3 || !reel) {
      // too few highlights for a montage: the best one as a clip instead
      html.dataset.clip = 'none';
      const h = wantedHl();
      if (h) return recordHighlight(h, f);
      veil.classList.add('out');
      engine.setPaused(false);
      setPlayIcon();
      return;
    }
    montaging = true;
    showPanel(false);
    setSpeed(1);
    html.dataset.montage = 'recording';
    tapStream = sfx.tap();
    const outcome = ctx.entry.outcome === 'won' ? 'Victory' : ctx.entry.outcome === 'draw' ? 'Draw' : 'Defeat';
    const list = reel.list;
    const r = startMontage({
      source: ctx.gr.renderer.domElement,
      framing: f,
      audio: tapStream,
      segments: segs,
      intro: { title: 'Match montage', sub: `${heroName} · ${MODE_LABEL[ctx.entry.mode] ?? 'Paw Legends'}` },
      outro: { title: outcome, sub: `${heroName} · ${ctx.entry.k} / ${ctx.entry.d} / ${ctx.entry.a} · ${rec.mode === 'pvp' ? 'PvP' : rec.humans ? 'Party' : 'vs bots'}` },
      seekTo: (at, i) =>
        new Promise<void>((res) => {
          readyCb = res;
          const h = list.find((x) => x.id === segs[i].id) ?? null;
          setDir(h, 'off');
          seek(at, segs[i].title, true);
        }),
      play: (on) => {
        engine.setPaused(!on);
        setPlayIcon();
      },
      onTick: (sec) => {
        if (clipRec === r) clipLabel(sec);
      },
    });
    clipRec = r;
    html.dataset.clip = 'recording';
    clipLabel(0);
    for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-speed]')) b.disabled = true;
    const total = segs.reduce((n, sg) => n + sg.seconds, 0);
    ctx.track?.('hl_montage', { segments: segs.length, seconds: total, framing: f });
    void r.done.then((clip) => {
      montaging = false;
      endTap();
      if (clipRec === r) clipRec = null;
      clipLabel(null);
      delete html.dataset.montage;
      for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-speed]')) b.disabled = false;
      setDir(null);
      if (closed) return;
      if (!clip) {
        html.dataset.clip = 'none';
        return;
      }
      html.dataset.clip = 'done';
      engine.setPaused(true);
      setPlayIcon();
      openClipSheet(ctx.root, {
        clip,
        heroName,
        title: 'Match montage',
        onLink: (url, text) => ctx.onShareLink?.(url, text),
        onClose: () => {
          if (html.dataset.clip === 'done') delete html.dataset.clip;
        },
        ...(ctx.track ? { track: ctx.track } : {}),
      });
    });
  }

  /** (Re)build the view at tick `at`. */
  const build = (at: number, label: string): void => {
    if (closed) return;
    const token = ++building;
    ended = false;
    viewReady = false;
    teardownSession();
    veil.innerHTML = `<span class="mm-spin" aria-hidden="true"></span><b>${esc(label)}</b>`;
    veil.classList.remove('out');
    html.dataset.replay = 'loading';
    engine.setPaused(true);
    const setup: MatchSetup = {
      hero: myHero,
      trick: myTrick,
      difficulty: rec.difficulty,
      seed: rec.seed,
      ...(rec.map && rec.map !== 'crossing' ? { map: rec.map } : {}),
      ...(rec.mutator && rec.mutator !== 'none' ? { mutator: rec.mutator } : {}),
      replay: true,
      speed: 1,
      firstMatch: false,
      newPlayer: false,
      emote: false,
      muted: ctx.muted,
      look: ctx.look,
      companions: [],
      guide: 'off',
      knowsUlt: true,
      pingTip: false,
      showcase: [],
      playerName: ctx.playerName ?? null,
      host: () => {
        host = engine.hostAt(at);
        return host;
      },
    };
    const s = new ctx.Session(ctx.gr, ctx.root, setup, {
      onEnd: (_e: MatchEnd) => {
        if (s === session) endCard();
      },
      onLeave: () => close(),
      onMute: (m) => ctx.onMute(m),
      ...(ctx.onSettings ? { onSettings: ctx.onSettings } : {}),
      onError: () => fail('crash'),
    });
    session = s;
    s.ui.classList.add('pl-replaying');
    s.setReplaySpeed(engine.speed);
    ctx.setSession(s);
    // the bar and the title stay over the newly built view
    ctx.root.append(title, drag, hlRow, bar, panel, veil);
    void (ctx.warm ? ctx.warm(s) : Promise.resolve()).then(() => {
      if (closed || token !== building || s !== session) return;
      viewReady = true;
      // the Legend Moment run keeps the veil until the scout found the moment and the view stands on it
      if (auto && !auto.cued) return;
      // the montage waits for the reel, then runs on this view
      if (montageWant) {
        if (reelKnown) beginMontage();
        return;
      }
      veil.classList.add('out');
      veil.classList.remove('mm-wipe');
      html.dataset.replay = 'playing';
      engine.setPaused(false);
      setPlayIcon();
      const ready = readyCb;
      readyCb = null;
      ready?.();
      if (auto?.cued) {
        const { framing: f, seconds, title: t, sub, kind } = auto;
        auto = null;
        startRec(f, seconds, t || sub ? { title: t ?? '', sub: sub ?? '', kind: kind ?? 'clip' } : undefined);
      }
    });
  };

  /** Record `seconds` from the play head at 1x, then the clip sheet (a highlight names the banner). */
  function startRec(f: Framing, seconds: number, hl?: { title: string; sub: string; kind: ClipKind }): void {
    if (clipRec || closed || !session || ended) return;
    showPanel(false);
    setSpeed(1);
    if (engine.paused) {
      engine.setPaused(false);
      setPlayIcon();
    }
    tapStream = sfx.tap();
    const r = startClip({
      source: ctx.gr.renderer.domElement,
      framing: f,
      seconds,
      title: hl?.title || ctx.clipTitle?.replace(/\s*\+\d+\s*(fish|xp)\b.*$/i, '').trim() || 'Legend Moment',
      sub: hl?.sub || `${heroName} · ${MODE_LABEL[ctx.entry.mode] ?? 'Paw Legends'}`,
      audio: tapStream,
      kind: hl?.kind ?? 'clip',
      onTick: (sec) => {
        if (clipRec === r) clipLabel(sec);
      },
    });
    clipRec = r;
    html.dataset.clip = 'recording';
    clipLabel(0);
    for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-speed]')) b.disabled = true;
    ctx.track?.('clip_start', { framing: f, seconds, auto: !!ctx.clip });
    void r.done.then((clip) => {
      endTap();
      if (clipRec === r) clipRec = null;
      clipLabel(null);
      for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-speed]')) b.disabled = false;
      if (closed) return;
      if (!clip) {
        html.dataset.clip = 'none';
        return;
      }
      html.dataset.clip = 'done';
      engine.setPaused(true);
      setPlayIcon();
      openClipSheet(ctx.root, {
        clip,
        heroName,
        title: hl?.title ?? ctx.clipTitle ?? null,
        onLink: (url, text) => ctx.onShareLink?.(url, text),
        onAgain: () => showPanel(true),
        onClose: () => {
          if (html.dataset.clip === 'done') delete html.dataset.clip;
        },
        ...(ctx.track ? { track: ctx.track } : {}),
      });
    });
  }

  const seek = (tick: number, label = 'Rewinding…', keepDir = false): void => {
    if (closed) return;
    // a seek rebuilds the view: a recording in progress is thrown away (a montage's own seeks belong to it)
    if (!montaging) stopRec(false);
    const t = Math.max(0, Math.min(tick, Math.max(0, info.scouted - 1)));
    // a seek outside the director's highlight lets the camera go
    if (!keepDir && dir && (t < dir.start || t > dir.end)) setDir(null);
    if (!keepDir) hlOnly = false;
    ctx.track?.('replay_seek', { tick: t });
    build(t, label);
  };

  const setSpeed = (sp: number): void => {
    engine.setSpeed(sp);
    session?.setReplaySpeed(engine.speed);
    for (const b of bar.querySelectorAll<HTMLElement>('[data-speed]')) {
      const on = Number(b.dataset.speed) === engine.speed;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    html.dataset.replaySpeed = String(engine.speed);
  };

  function setFree(on: boolean): void {
    // any manual camera action ends the director
    if (dir) {
      dir = null;
      hlOnly = false;
      delete html.dataset.replayHlAt;
      paintHl();
    }
    camBtn.setAttribute('aria-pressed', String(on));
    camBtn.classList.toggle('on', on);
    camBtn.textContent = on ? 'Follow me' : 'Free cam';
    drag.hidden = !on;
    html.dataset.replayCam = on ? 'free' : 'follow';
    if (on) {
      const f = session?.view.follow;
      free = { x: (f?.x ?? 0) + (session?.view.camOff.x ?? 0), z: (f?.z ?? 0) + (session?.view.camOff.z ?? 0) };
    } else {
      free = null;
      session?.view.peekEnd();
    }
  }

  // free camera: drag the map (grab and pull), arrow keys pan
  let dragAt: { x: number; y: number; id: number } | null = null;
  const pan = (dxPx: number, dyPx: number): void => {
    if (!free || !session) return;
    const ppm = Math.max(4, session.view.pxPerMetre(free.x, free.z));
    const r = screenRightXZ();
    const t = towardCameraXZ();
    // the camera looks down at an angle: a vertical pixel covers more ground than a horizontal one
    const mx = -dxPx / ppm;
    const my = -dyPx / (ppm * 0.75);
    free.x += r.x * mx + t.x * my;
    free.z += r.z * mx + t.z * my;
    // keep it on the map (sim mm -> m via the render's own conversion)
    const x0 = Math.min(toX(0), toX(MAP.width));
    const x1 = Math.max(toX(0), toX(MAP.width));
    const z0 = Math.min(toZ(0), toZ(MAP.height));
    const z1 = Math.max(toZ(0), toZ(MAP.height));
    free.x = Math.max(x0, Math.min(x1, free.x));
    free.z = Math.max(z0, Math.min(z1, free.z));
  };
  drag.addEventListener('pointerdown', (e) => {
    dragAt = { x: e.clientX, y: e.clientY, id: e.pointerId };
    drag.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  drag.addEventListener('pointermove', (e) => {
    if (!dragAt || e.pointerId !== dragAt.id) return;
    pan(e.clientX - dragAt.x, e.clientY - dragAt.y);
    dragAt = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  const dragEnd = (e: PointerEvent): void => {
    if (dragAt && e.pointerId === dragAt.id) dragAt = null;
  };
  drag.addEventListener('pointerup', dragEnd);
  drag.addEventListener('pointercancel', dragEnd);

  const trackFraction = (clientX: number): number => {
    const r = track.getBoundingClientRect();
    return r.width > 0 ? (clientX - r.left) / r.width : 0;
  };
  track.addEventListener('click', (e) => {
    if (!montaging) seek(seekTick(trackFraction(e.clientX), info));
  });

  const onBar = (e: Event): void => {
    const t = e.target as HTMLElement;
    const r = t.closest<HTMLElement>('[data-r]')?.dataset.r;
    const sp = t.closest<HTMLElement>('[data-speed]')?.dataset.speed;
    if (sp) return setSpeed(Number(sp));
    if (r === 'exit') return close();
    if (montaging && r !== 'clip') return;
    if (r === 'hl') {
      const open = hlRow.hidden;
      hlRow.hidden = !open;
      hlBtn.setAttribute('aria-expanded', String(open));
      if (open) paintHl();
      return;
    }
    if (r === 'hlclip' && lastHl) return recordHighlight(lastHl, framing);
    if (r === 'hlnext' && lastHl) {
      const n = stepHighlight(reel?.list ?? [], lastHl.start, 1);
      if (n) {
        ctx.track?.('hl_open', { type: n.type, from: 'viewer' });
        return playHighlight(n, 'card');
      }
      return;
    }
    if (r === 'full') {
      setDir(null);
      return seek(0, 'Loading replay…');
    }
    if (r === 'again') {
      ctx.track?.('replay_again', {});
      return seek(0, 'Loading replay…');
    }
    if (r === 'play') {
      if (ended) return seek(0, 'Loading replay…');
      engine.setPaused(!engine.paused);
      clipRec?.pause(engine.paused);
      return setPlayIcon();
    }
    if (r === 'death') {
      const d = nextDeath(info.deaths, host?.tick ?? 0);
      if (d >= 0) {
        ctx.track?.('replay_death_jump', {});
        seek(Math.max(0, d - DEATH_LEAD_TICKS), 'Jumping to your knockout…');
      }
      return;
    }
    if (r === 'cam') return setFree(!free);
    if (r === 'clip') {
      if (clipRec) return stopRec(true);
      return showPanel(!!panel.hidden);
    }
  };
  hlRow.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-hlonly]')) {
      hlOnly = !hlOnly;
      ctx.track?.('hl_only', { on: hlOnly });
      const first = reel?.list[0];
      if (hlOnly && first) return playHighlight(first, 'off', first.title);
      if (!hlOnly) setDir(null);
      return paintHl();
    }
    const id = t.closest<HTMLElement>('[data-hl]')?.dataset.hl;
    const h = id ? reel?.list.find((x) => x.id === id) : null;
    if (h) {
      ctx.track?.('hl_open', { type: h.type, from: 'viewer' });
      playHighlight(h, 'off');
    }
  });
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const f = t.closest<HTMLElement>('[data-f]')?.dataset.f;
    const len = t.closest<HTMLElement>('[data-len]')?.dataset.len;
    const k = t.closest<HTMLElement>('[data-k]')?.dataset.k;
    if (f === 'vertical' || f === 'wide') framing = f;
    if (len) clipLen = len === 'hl' ? 'hl' : Number(len);
    if (f || len) return paintPanel();
    if (k === 'cancel') return showPanel(false);
    if (k === 'rec') {
      if (clipLen === 'hl') {
        if (panelHl) recordHighlight(panelHl, framing);
        return;
      }
      // at the very end there is nothing left to record: start the length before the end
      if (ended || (host?.tick ?? 0) > info.total - clipLen * 30) {
        auto = { framing, cued: true, seconds: clipLen };
        showPanel(false);
        return seek(Math.max(0, info.total - clipLen * 30 - 90), 'Rewinding…');
      }
      startRec(framing, clipLen);
    }
  });
  bar.addEventListener('click', onBar);
  veil.addEventListener('click', onBar);

  const onKey = (e: KeyboardEvent): void => {
    if (closed || (e.target as HTMLElement)?.closest?.('input, textarea') || !!html.dataset.clipSheet) return;
    if (e.key === ' ' && html.dataset.replay !== 'loading') {
      e.preventDefault();
      e.stopPropagation();
      playBtn.click();
    } else if (free && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const k = 40;
      pan(e.key === 'ArrowLeft' ? -k : e.key === 'ArrowRight' ? k : 0, e.key === 'ArrowUp' ? -k : e.key === 'ArrowDown' ? k : 0);
    } else if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey && html.dataset.replay !== 'loading' && !montaging && !clipRec) {
      // N / Shift+N: the next / previous highlight
      const h = stepHighlight(reel?.list ?? [], host?.tick ?? 0, e.shiftKey ? -1 : 1);
      if (h) {
        e.preventDefault();
        ctx.track?.('hl_open', { type: h.type, from: 'viewer' });
        playHighlight(h, 'off');
      }
    } else if (e.target === track && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // the slider: ±10 s
      e.preventDefault();
      seek((host?.tick ?? 0) + (e.key === 'ArrowLeft' ? -300 : 300));
    }
  };
  document.addEventListener('keydown', onKey, true);

  // the bar follows the play head; the free camera holds its point every frame (a respawn snap clears a peek)
  let raf = 0;
  const loop = (): void => {
    if (closed) return;
    raf = requestAnimationFrame(loop);
    const tick = host?.tick ?? 0;
    const total = Math.max(1, info.total);
    const pct = `${((Math.min(tick, total) / total) * 100).toFixed(2)}%`;
    track.style.setProperty('--pos', pct);
    track.setAttribute('aria-valuenow', String(tick));
    const tm = bar.querySelector<HTMLElement>('.mm-time')!;
    const txt = `${clock(tick / 30)} / ${clock(info.total / 30)}`;
    if (tm.textContent !== txt) tm.textContent = txt;
    html.dataset.replayTick = String(tick);
    if (free && session) session.view.peekHold(free.x, free.z);
    else if (dir && session && viewReady) {
      if (tick >= dir.end || ended) dirEnded();
      else if (!(dir.cam.mode === 'follow' && dir.cam.slot === me)) {
        // the director: the fight's moving frame, or the hero it follows (the player's own keeps the normal camera)
        const p = camPoint(dir, tick);
        if (p) session.view.peekHold(toX(p.x), toZ(p.y));
      }
    }
  };
  raf = requestAnimationFrame(loop);

  function close(): void {
    if (closed) return;
    closed = true;
    stopRec(false);
    endTap();
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey, true);
    teardownSession();
    engine.dispose();
    for (const n of [bar, title, drag, hlRow, panel, veil]) n.remove();
    for (const k of ['replay', 'replayTick', 'replayDeaths', 'replayScouted', 'replayOk', 'replaySpeed', 'replayCam', 'clip', 'replayHl', 'replayHlAt', 'montage']) delete html.dataset[k];
    ctx.onExit();
  }

  setSpeed(1);
  setFree(false);
  paintHl();
  // a results card (or a cached Legend Moment) opens straight on its highlight: the scout runs up to it on load
  const opening = reel ? wantedHl() : null;
  if (montageWant) build(0, 'Preparing your montage…');
  else if (opening && (ctx.highlight || auto)) {
    if (auto) {
      auto.cued = true;
      Object.assign(auto, { seconds: highlightSeconds(opening), title: opening.title, sub: opening.sub, kind: 'highlight' as const });
      setDir(opening, 'off');
    } else setDir(opening, 'card');
    ctx.track?.('hl_open', { type: opening.type, from: 'results' });
    build(opening.start, auto ? 'Cueing your highlight…' : 'Loading the highlight…');
  } else build(0, auto ? 'Finding your Legend Moment…' : 'Loading replay…');
  return { close };
}
