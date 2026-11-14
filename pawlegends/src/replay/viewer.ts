/**
 * The replay viewer (MATCH-MOMENTS.md §2), its own lazy chunk. It draws a saved match with the normal match view: a
 * MatchSession whose host is a ReplayHost over one ReplayEngine (the sim Worker re-running the stored inputs). The
 * bar under it: play / pause, 1x / 2x / 4x, a seek bar (the part the scout has run is seekable; red marks are the
 * player's deaths, gold marks its takedowns), "my deaths" (jump to the next one, 5 s before it), a free camera (drag
 * the map; "Follow me" returns) and Exit. A seek rebuilds the view at the new tick from the nearest keyframe, so
 * nothing drawn before the seek lingers. Input never reaches the replay.
 */
import type { MatchEnd, MatchSession, MatchSetup } from '../app/matchSession';
import type { GameRenderer } from '../render/renderer';
import type { Look } from '../render/cosmetics';
import { screenRightXZ, toX, toZ, towardCameraXZ } from '../render/coords';
import { HERO_TEXT } from '../ui/heroText';
import { MAP } from '../data/map';
import type { HeroId, ReplayRecord } from '../sim/api';
import { ReplayEngine, type ReplayHost } from './host';
import type { ReplayError, ReplayInfo } from './core';
import { REPLAY_SPEEDS } from './loop';
import { clock, MODE_LABEL, type HistoryEntry } from './store';
import { sfx } from '../audio/sfx';
import { CLIP_DEFAULT_SECONDS, CLIP_LENGTHS, clipSupported, defaultFraming, momentTick, openClipSheet, startClip, type ClipRecorder, type Framing } from '../share/clip';
import '../ui/css/moments.css';

/** "Jump to my death" lands this many ticks before it (5 s), so the fight leading to it is seen. */
export const DEATH_LEAD_TICKS = 150;

export interface ViewerContext {
  Session: typeof MatchSession;
  gr: GameRenderer;
  root: HTMLElement;
  record: ReplayRecord;
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
}

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
  const engine = new ReplayEngine(rec);
  const html = document.documentElement;
  let session: MatchSession | null = null;
  let host: ReplayHost | null = null;
  let info: ReplayInfo = { total: rec.ticks, scouted: 0, deaths: [], takedowns: [], done: false, ok: null, slow: false };
  let closed = false;
  let building = 0;
  let ended = false;
  let free: { x: number; z: number } | null = null;
  ctx.track?.('replay_open', { hero: rec.hero, ticks: rec.ticks, worker: engine.kind === 'worker' });

  const bar = document.createElement('div');
  bar.className = 'mm-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Replay controls');
  const heroName = ctx.entry.heroName || HERO_TEXT[rec.hero as HeroId]?.title || rec.hero;
  bar.innerHTML = `
    <button type="button" class="mm-b mm-x" data-r="exit" aria-label="Exit replay" title="Exit replay">✕</button>
    <button type="button" class="mm-b mm-play" data-r="play" aria-label="Play" data-testid="replay-play">▶</button>
    <span class="mm-speeds" role="group" aria-label="Speed">${REPLAY_SPEEDS.map((s) => `<button type="button" class="mm-b mm-sp${s === 1 ? ' on' : ''}" data-speed="${s}" aria-pressed="${s === 1}">${s}x</button>`).join('')}</span>
    <div class="mm-track" data-testid="replay-seek" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="${rec.ticks}" aria-valuenow="0">
      <i class="mm-buf"></i><i class="mm-pos"></i><span class="mm-marks"></span><i class="mm-thumb"></i>
    </div>
    <span class="mm-time" data-testid="replay-time">0:00 / ${clock(rec.ticks / 30)}</span>
    <button type="button" class="mm-b mm-death" data-r="death" data-testid="replay-death" disabled title="Jump to my next knockout">My deaths <b>0</b></button>
    <button type="button" class="mm-b mm-cam" data-r="cam" data-testid="replay-cam" aria-pressed="false" title="Free camera: drag the map">Free cam</button>
    <button type="button" class="mm-b mm-clipb" data-r="clip" data-testid="replay-clip" title="Record a 10-20 s clip from here" hidden><i class="mm-dot" aria-hidden="true"></i><span>Clip</span></button>`;
  const title = document.createElement('div');
  title.className = 'mm-title';
  title.innerHTML = `<b>Replay</b><span>${esc(heroName)} · ${esc(MODE_LABEL[ctx.entry.mode] ?? '')} · ${ctx.entry.outcome === 'won' ? 'Victory' : ctx.entry.outcome === 'draw' ? 'Draw' : 'Defeat'}</span>`;
  const drag = document.createElement('div');
  drag.className = 'mm-drag';
  drag.hidden = true;
  const veil = document.createElement('div');
  veil.className = 'mm-veil';
  veil.innerHTML = '<span class="mm-spin" aria-hidden="true"></span><b>Loading replay…</b>';
  // SHARE-PUSH.md §1: the clip panel (framing and length), over the view above the bar
  const canClip = clipSupported();
  let framing: Framing = ctx.clip ?? defaultFraming({ touch: html.dataset.touch === '1', w: innerWidth, h: innerHeight });
  let clipLen = CLIP_DEFAULT_SECONDS;
  const panel = document.createElement('div');
  panel.className = 'mm-clippanel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Record a clip');
  panel.dataset.testid = 'clip-panel';
  panel.innerHTML = `<b>Record a clip</b>
    <div class="mm-seg" role="group" aria-label="Framing"><button type="button" class="mm-b" data-f="vertical" data-testid="clip-vertical">Vertical 9:16</button><button type="button" class="mm-b" data-f="wide" data-testid="clip-wide">Wide 16:9</button></div>
    <div class="mm-seg" role="group" aria-label="Length">${CLIP_LENGTHS.map((n) => `<button type="button" class="mm-b" data-len="${n}">${n} s</button>`).join('')}</div>
    <p>From here, at 1x, with the game's sound.</p>
    <div class="mm-row"><button type="button" class="pl-btn ghost small" data-k="cancel">Cancel</button><button type="button" class="pl-btn small" data-k="rec" data-testid="clip-record">Record</button></div>`;
  ctx.root.append(title, drag, bar, panel, veil);
  html.dataset.replay = 'loading';

  const $ = <T extends HTMLElement>(sel: string): T => bar.querySelector<T>(sel)!;
  const track = $('.mm-track');
  const playBtn = $('.mm-play');
  const deathBtn = $<HTMLButtonElement>('.mm-death');
  const camBtn = $('.mm-cam');
  const clipBtn = $<HTMLButtonElement>('.mm-clipb');
  clipBtn.hidden = !canClip;
  let clipRec: ClipRecorder | null = null;
  let tapStream: MediaStream | null = null;
  /** The Legend Moment run: cue the best moment once the scout has seen the whole match, then record. */
  let auto: { framing: Framing; cued: boolean; seconds: number } | null = ctx.clip && canClip ? { framing: ctx.clip, cued: false, seconds: CLIP_DEFAULT_SECONDS } : null;
  if (auto) html.dataset.clip = 'finding';

  const paintPanel = (): void => {
    for (const b of panel.querySelectorAll<HTMLElement>('[data-f]')) b.setAttribute('aria-pressed', String(b.dataset.f === framing));
    for (const b of panel.querySelectorAll<HTMLElement>('[data-len]')) b.setAttribute('aria-pressed', String(Number(b.dataset.len) === clipLen));
  };
  const showPanel = (on: boolean): void => {
    panel.hidden = !on;
    clipBtn.setAttribute('aria-expanded', String(on));
    if (on) {
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
    veil.innerHTML = `<div class="mm-err" role="alert"><b>Replay not available</b><p>${esc(ERROR_TEXT[why])}</p><button type="button" class="pl-btn" data-r="exit">Back</button></div>`;
  };

  const drawMarks = (): void => {
    const marks = bar.querySelector<HTMLElement>('.mm-marks')!;
    const total = Math.max(1, info.total);
    marks.innerHTML =
      info.deaths.map((t) => `<i class="mm-mk death" style="left:${((t / total) * 100).toFixed(2)}%" title="Knocked out ${clock(t / 30)}"></i>`).join('') +
      info.takedowns.map((t) => `<i class="mm-mk td" style="left:${((t / total) * 100).toFixed(2)}%" title="Takedown ${clock(t / 30)}"></i>`).join('');
    track.style.setProperty('--buf', `${((info.scouted / total) * 100).toFixed(2)}%`);
    deathBtn.querySelector('b')!.textContent = String(info.deaths.length);
    deathBtn.disabled = info.deaths.length === 0;
    html.dataset.replayDeaths = String(info.deaths.length);
    html.dataset.replayScouted = String(info.scouted);
    if (info.done) html.dataset.replayOk = String(info.ok);
  };

  engine.listener = {
    info: (i) => {
      info = i;
      if (i.slow) return fail('slow');
      drawMarks();
      if (auto && !auto.cued && i.done && i.ok !== false) {
        auto.cued = true;
        ctx.track?.('clip_moment', { takedowns: i.takedowns.length });
        seek(momentTick(i, CLIP_DEFAULT_SECONDS), 'Cueing your Legend Moment…');
      }
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
    stopRec(true);
    ended = true;
    setPlayIcon();
    veil.classList.remove('out');
    veil.innerHTML = `<div class="mm-err mm-end" role="dialog" aria-label="Replay over"><b>Replay over</b><p>${esc(heroName)} · ${ctx.entry.k} / ${ctx.entry.d} / ${ctx.entry.a}</p><div class="mm-row"><button type="button" class="pl-btn ghost" data-r="exit">Back</button><button type="button" class="pl-btn" data-r="again" data-testid="replay-again">Watch again</button></div></div>`;
  };

  /** (Re)build the view at tick `at`. */
  const build = (at: number, label: string): void => {
    if (closed) return;
    const token = ++building;
    ended = false;
    teardownSession();
    veil.innerHTML = `<span class="mm-spin" aria-hidden="true"></span><b>${esc(label)}</b>`;
    veil.classList.remove('out');
    html.dataset.replay = 'loading';
    engine.setPaused(true);
    const setup: MatchSetup = {
      hero: rec.hero,
      trick: rec.trick,
      difficulty: rec.difficulty,
      seed: rec.seed,
      ...(rec.map === 'hearthwood' ? { map: 'hearthwood' as const } : {}),
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
    ctx.root.append(title, drag, bar, panel, veil);
    void (ctx.warm ? ctx.warm(s) : Promise.resolve()).then(() => {
      if (closed || token !== building || s !== session) return;
      // the Legend Moment run keeps the veil until the scout found the moment and the view stands on it
      if (auto && !auto.cued) return;
      veil.classList.add('out');
      html.dataset.replay = 'playing';
      engine.setPaused(false);
      setPlayIcon();
      if (auto?.cued) {
        const { framing: f, seconds } = auto;
        auto = null;
        startRec(f, seconds);
      }
    });
  };

  /** Record `seconds` from the play head at 1x, then the clip sheet. */
  function startRec(f: Framing, seconds: number): void {
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
      title: ctx.clipTitle?.replace(/\s*\+\d+\s*(fish|xp)\b.*$/i, '').trim() || 'Legend Moment',
      sub: `${heroName} · ${MODE_LABEL[ctx.entry.mode] ?? 'Paw Legends'}`,
      audio: tapStream,
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
        title: ctx.clipTitle ?? null,
        onLink: (url, text) => ctx.onShareLink?.(url, text),
        onAgain: () => showPanel(true),
        onClose: () => {
          if (html.dataset.clip === 'done') delete html.dataset.clip;
        },
        ...(ctx.track ? { track: ctx.track } : {}),
      });
    });
  }

  const seek = (tick: number, label = 'Rewinding…'): void => {
    if (closed) return;
    // a seek rebuilds the view: a recording in progress is thrown away
    stopRec(false);
    const t = Math.max(0, Math.min(tick, Math.max(0, info.scouted - 1)));
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

  const setFree = (on: boolean): void => {
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
  };

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
  track.addEventListener('click', (e) => seek(seekTick(trackFraction(e.clientX), info)));

  const onBar = (e: Event): void => {
    const t = e.target as HTMLElement;
    const r = t.closest<HTMLElement>('[data-r]')?.dataset.r;
    const sp = t.closest<HTMLElement>('[data-speed]')?.dataset.speed;
    if (sp) return setSpeed(Number(sp));
    if (r === 'exit') return close();
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
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const f = t.closest<HTMLElement>('[data-f]')?.dataset.f;
    const len = t.closest<HTMLElement>('[data-len]')?.dataset.len;
    const k = t.closest<HTMLElement>('[data-k]')?.dataset.k;
    if (f === 'vertical' || f === 'wide') framing = f;
    if (len) clipLen = Number(len);
    if (f || len) return paintPanel();
    if (k === 'cancel') return showPanel(false);
    if (k === 'rec') {
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
    for (const n of [bar, title, drag, panel, veil]) n.remove();
    for (const k of ['replay', 'replayTick', 'replayDeaths', 'replayScouted', 'replayOk', 'replaySpeed', 'replayCam', 'clip']) delete html.dataset[k];
    ctx.onExit();
  }

  setSpeed(1);
  setFree(false);
  build(0, auto ? 'Finding your Legend Moment…' : 'Loading replay…');
  return { close };
}
