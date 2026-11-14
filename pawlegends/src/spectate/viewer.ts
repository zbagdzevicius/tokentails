/**
 * Live spectating (docs/plans/moba/SPECTATE.md), its own lazy chunk: watch a friend's live match (Watch on their row in
 * Social) or the featured live match ("Watch live"), a short delay behind the players. The normal match view draws it:
 * a MatchSession over a NetHost in spectate mode that re-simulates the relay's delayed TURN stream with this build's frozen sim
 * (the same NetCore the players run). Its own relay socket (never the party's), so watching never touches a party.
 *
 * The spectate bar (replaces the controls, so the phone HUD keeps its footprint): Leave, LIVE with the delay and the
 * spectator count, one chip per hero of both teams (tap: the camera follows that hero; a downed one is dimmed), Free
 * cam (drag the map) and Scores (both teams' scoreboard). Nothing a spectator does reaches the match.
 */
import type { MatchEnd, MatchSession, MatchSetup } from '../app/matchSession';
import type { GameRenderer } from '../render/renderer';
import { screenRightXZ, toX, toZ, towardCameraXZ } from '../render/coords';
import { MAP } from '../data/map';
import { HEROES } from '../data/heroes';
import { HERO_TEXT } from '../ui/heroText';
import type { HeroId, MatchResult, Snapshot } from '../sim/api';
import { SIM_VERSION } from '../sim/version';
import { PartySocket, browserSocketEnv, type SocketEnv } from '../net/socket';
import { PROTO_WATCH, WS_PATH, type MatchMsg, type ServerJson, type SpectateInfo } from '../net/proto';
import { NetHost } from '../net/net-host';
import '../ui/css/moments.css';
import './spectate.css';

/** Who to watch: a friend's live room (from presence), or the relay's featured match. */
export type SpectateTarget = { room: string; name?: string } | { featured: true };

export interface SpectateContext {
  Session: typeof MatchSession;
  gr: GameRenderer;
  root: HTMLElement;
  target: SpectateTarget;
  /** The relay's API base (http(s)://…): the socket goes to its `/pawlegends/ws`. */
  api: string;
  build: string;
  ticket(): Promise<string | null>;
  guestKey(): string;
  muted: boolean;
  setSession(s: MatchSession | null): void;
  warm?(s: MatchSession): Promise<void>;
  onExit(): void;
  onMute(m: boolean): void;
  onSettings?(done: () => void): void;
  track?(event: string, props: Record<string, string | number | boolean>): void;
  /** Test seam: the socket environment. */
  env?: SocketEnv;
}

export type SpectateError = 'watch_none' | 'watch_full' | 'watch_update' | 'rate_limited' | 'old' | 'lost' | 'crash';

export const SPECTATE_ERROR_TEXT: Readonly<Record<SpectateError, { title: string; body: string }>> = Object.freeze({
  watch_none: { title: 'Nothing to watch', body: 'This match ended, or its players keep matches private.' },
  watch_full: { title: 'Match is full', body: 'Try again in a minute.' },
  watch_update: { title: 'Update to watch', body: 'This match runs another game version.' },
  rate_limited: { title: 'Already watching', body: 'Close the other screen to watch here.' },
  old: { title: 'Not ready yet', body: 'The servers are updating. Try again in a minute.' },
  lost: { title: 'Lost the live view', body: 'The connection to the match was lost.' },
  crash: { title: 'The live view stopped', body: 'Try again.' },
});

const FEATURED_NONE = { title: 'No live match right now', body: 'Try again soon.' };

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const simHash = (): string => (typeof __SIM_HASH__ !== 'undefined' ? __SIM_HASH__ : '0000000000000000');

/** The hero the view follows first: the friend's seat by name, else the relay's pick. Pure. */
export function followSlot(m: Pick<MatchMsg, 'names'> & { watch?: Pick<SpectateInfo, 'follow'> }, friend?: string): number {
  if (friend) {
    const i = m.names.findIndex((n) => n !== null && n === friend);
    if (i >= 0) return i;
  }
  return m.watch?.follow ?? 0;
}

/** "15 s behind live". Pure. */
export const delayText = (ms: number): string => `${Math.round(ms / 1000)} s behind live`;

/** The winner line of the end card. Pure. */
export function winnerText(r: Pick<MatchResult, 'winner'>, sides: readonly ['cat' | 'dog', 'cat' | 'dog']): string {
  if (r.winner !== 0 && r.winner !== 1) return 'Draw';
  const side = sides[r.winner];
  return sides[0] === sides[1] ? `Team ${r.winner === 0 ? 'Blue' : 'Red'} wins` : `${side === 'dog' ? 'Dogs' : 'Cats'} win`;
}

export interface SpectateViewer {
  close(): void;
}

export function openSpectateViewer(ctx: SpectateContext): SpectateViewer {
  const html = document.documentElement;
  const featured = 'featured' in ctx.target;
  const friend = 'room' in ctx.target ? ctx.target.name : undefined;
  let session: MatchSession | null = null;
  let host: NetHost | null = null;
  /** The hero the session (and the fog) follows. */
  let own = -1;
  let match: MatchMsg | null = null;
  let closed = false;
  let ended = false;
  let failed = false;
  let follow = -1;
  let free: { x: number; z: number } | null = null;
  let cam: { x: number; z: number } | null = null;
  let snap: Snapshot | null = null;
  const lastAt = new Map<number, { x: number; y: number; dead: boolean }>();
  let viewers = 0;
  ctx.track?.('spectate_open', { featured });

  const bar = document.createElement('div');
  bar.className = 'mm-bar sp-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Spectator controls');
  bar.innerHTML = `
    <button type="button" class="mm-b mm-x" data-r="exit" aria-label="Stop watching" data-testid="spectate-exit">✕</button>
    <span class="sp-live" data-testid="spectate-live"><i aria-hidden="true"></i><b>LIVE</b><small class="sp-delay"></small></span>
    <span class="sp-viewers" data-testid="spectate-viewers" aria-live="polite"></span>
    <span class="sp-heroes" role="group" aria-label="Follow a hero"></span>
    <button type="button" class="mm-b" data-r="cam" data-testid="spectate-cam" aria-pressed="false">Free cam</button>
    <button type="button" class="mm-b" data-r="scores" data-testid="spectate-scores" aria-pressed="false">Scores</button>`;
  const drag = document.createElement('div');
  drag.className = 'mm-drag';
  drag.hidden = true;
  const veil = document.createElement('div');
  veil.className = 'mm-veil';
  veil.innerHTML = `<span class="mm-spin" aria-hidden="true"></span><b>${featured ? 'Finding a live match…' : 'Joining the live match…'}</b>`;
  ctx.root.append(drag, bar, veil);
  html.dataset.spectate = 'loading';

  const $ = <T extends HTMLElement>(sel: string): T => bar.querySelector<T>(sel)!;
  const heroesEl = $('.sp-heroes');
  const camBtn = $('[data-r="cam"]');
  const scoresBtn = $('[data-r="scores"]');

  const socket = new PartySocket(
    `${ctx.api.replace(/^http/, 'ws').replace(/\/+$/, '')}${WS_PATH}`,
    { sim: SIM_VERSION, simHash: simHash(), build: ctx.build, guestKey: ctx.guestKey() },
    // never the party's resume token: this socket only watches (a reconnect asks for the match again)
    { ...(ctx.env ?? browserSocketEnv()), store: undefined },
  );

  const showCard = (t: { title: string; body: string }): void => {
    veil.classList.remove('out');
    veil.innerHTML = `<div class="mm-err" role="alert"><b>${esc(t.title)}</b><p>${esc(t.body)}</p><button type="button" class="pl-btn" data-r="exit">Back</button></div>`;
  };

  const fail = (why: SpectateError): void => {
    if (closed || ended || failed) return;
    failed = true;
    html.dataset.spectate = `error:${why}`;
    ctx.track?.('spectate_error', { why, featured });
    teardownSession();
    socket.close();
    showCard(featured && why === 'watch_none' ? FEATURED_NONE : SPECTATE_ERROR_TEXT[why]);
  };

  const teardownSession = (): void => {
    host?.dispose();
    host = null;
    if (!session) return;
    ctx.setSession(null);
    session.dispose();
    session = null;
  };

  const sidesOf = (m: MatchMsg): ['cat' | 'dog', 'cat' | 'dog'] => {
    if (m.species) return m.species;
    const n = m.config.map === 'hearthwood' ? 5 : 3;
    const side = (slot: number): 'cat' | 'dog' => (HEROES[m.config.picks[slot] as HeroId]?.side === 'dog' ? 'dog' : 'cat');
    return [side(0), side(n)];
  };

  const endCard = (r: MatchResult): void => {
    if (ended || !match) return;
    ended = true;
    html.dataset.spectate = 'ended';
    ctx.track?.('spectate_end', { featured });
    veil.classList.remove('out');
    veil.innerHTML = `<div class="mm-err mm-end" role="dialog" aria-label="Match over" data-testid="spectate-end"><b>Match over</b><p>${esc(winnerText(r, sidesOf(match)))}</p><div class="mm-row"><button type="button" class="pl-btn" data-r="exit">Back</button></div></div>`;
    socket.close();
  };

  // the hero chips: both teams, in slot order (team 0 then team 1)
  const drawHeroes = (m: MatchMsg): void => {
    const n = m.config.map === 'hearthwood' ? 5 : 3;
    const chips: string[] = [];
    for (let slot = 0; slot < 2 * n; slot++) {
      const hero = m.config.picks[slot] as HeroId;
      const name = m.names[slot] ?? HERO_TEXT[hero]?.title ?? hero;
      const label = (HERO_TEXT[hero]?.title ?? hero).slice(0, 2);
      chips.push(`<button type="button" class="sp-hero t${slot < n ? 0 : 1}${m.names[slot] ? ' human' : ''}" data-slot="${slot}" aria-pressed="false" title="${esc(name)}">${esc(label)}</button>`);
    }
    heroesEl.innerHTML = chips.join('');
  };

  const setFollow = (slot: number): void => {
    follow = slot;
    free = null;
    drag.hidden = true;
    camBtn.setAttribute('aria-pressed', 'false');
    camBtn.classList.remove('on');
    for (const b of heroesEl.querySelectorAll<HTMLElement>('[data-slot]')) {
      const on = Number(b.dataset.slot) === slot;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    html.dataset.spectateFollow = String(slot);
    // the session's own hero: its normal camera (no hold)
    if (slot === own) {
      cam = null;
      session?.view.peekEnd();
    }
  };

  const setFree = (on: boolean): void => {
    if (!on) return setFollow(own);
    const f = session?.view.follow;
    free = cam ? { ...cam } : { x: (f?.x ?? 0) + (session?.view.camOff.x ?? 0), z: (f?.z ?? 0) + (session?.view.camOff.z ?? 0) };
    follow = -1;
    drag.hidden = false;
    camBtn.setAttribute('aria-pressed', 'true');
    camBtn.classList.add('on');
    for (const b of heroesEl.querySelectorAll<HTMLElement>('[data-slot]')) {
      b.classList.remove('on');
      b.setAttribute('aria-pressed', 'false');
    }
    html.dataset.spectateFollow = 'free';
  };

  let scoresOn = false;
  const setScores = (on: boolean): void => {
    scoresOn = on;
    scoresBtn.setAttribute('aria-pressed', String(on));
    scoresBtn.classList.toggle('on', on);
    session?.showScores(on);
  };

  const setViewers = (n: number): void => {
    viewers = Math.max(0, n);
    const el = $('.sp-viewers');
    el.textContent = `${viewers} watching`;
    html.dataset.spectateViewers = String(viewers);
  };

  /** Build the view on the relay's spectator `match`. */
  const build = (m: MatchMsg): void => {
    match = m;
    const slot = followSlot(m, friend);
    own = slot;
    const h = new NetHost(socket, { ...m, you: { slot } }, { lost: () => fail('lost'), spectate: {
      progress: (pct, done) => {
        ff = !done;
        if (done) return reveal();
        const b = veil.querySelector('b');
        if (b && !veil.classList.contains('out')) b.textContent = `Catching up… ${pct}%`;
      },
      snap: (s) => {
        snap = s;
        for (const e of s.entities) if (e.kind === 'hero') lastAt.set(e.id, { x: e.x, y: e.y, dead: e.state === 'dead' });
        if (s.clock.tick > 0) {
          playing = true;
          if (!ff) reveal();
        }
      },
    } });
    host = h;
    const hero = m.config.picks[slot] as HeroId;
    const setup: MatchSetup = {
      hero,
      trick: m.config.tricks[slot] as MatchSetup['trick'],
      difficulty: m.config.difficulty as MatchSetup['difficulty'],
      seed: m.config.seed,
      ...(m.config.map === 'hearthwood' ? { map: 'hearthwood' as const } : {}),
      replay: true,
      spectate: { names: m.names },
      speed: 1,
      firstMatch: false,
      newPlayer: false,
      emote: false,
      muted: ctx.muted,
      look: null,
      companions: [],
      guide: 'off',
      knowsUlt: true,
      pingTip: false,
      showcase: [],
      playerName: m.names[slot] ?? null,
      host: () => h,
    };
    const s = new ctx.Session(ctx.gr, ctx.root, setup, {
      onEnd: (e: MatchEnd) => endCard(e.result),
      onLeave: () => close(),
      onMute: (mu) => ctx.onMute(mu),
      ...(ctx.onSettings ? { onSettings: ctx.onSettings } : {}),
      onError: () => fail('crash'),
    });
    session = s;
    s.ui.classList.add('pl-replaying', 'pl-spectating');
    ctx.setSession(s);
    ctx.root.append(drag, bar, veil);
    drawHeroes(m);
    setFollow(slot);
    setViewers(m.watch?.viewers ?? 1);
    $('.sp-delay').textContent = delayText(m.watch?.delayMs ?? 0);
    const b = veil.querySelector('b');
    if (b) b.textContent = 'The live view starts in a moment…';
    void (ctx.warm ? ctx.warm(s) : Promise.resolve()).then(() => {
      if (closed || s !== session) return;
      warmed = true;
      reveal();
    });
  };
  let warmed = false;
  /** The delayed stream is past tick 0, and no fast-forward (a catch-up) runs. */
  let playing = false;
  let ff = false;
  const reveal = (): void => {
    if (!warmed || !playing || ff || closed || failed || ended) return;
    if (veil.classList.contains('out')) return;
    veil.classList.add('out');
    html.dataset.spectate = 'live';
  };

  // the viewer's own tap (the NetHost listens to the turns, `end` and a reconnect's `match` itself)
  socket.tap({
    json: (m: ServerJson) => {
      if (closed) return;
      switch (m.t) {
        case 'match':
          if (m.you.slot === -1 && !host) build(m);
          return;
        case 'spectate':
          return setViewers(m.viewers);
        case 'error':
          if (m.code === 'watch_none' || m.code === 'watch_full' || m.code === 'watch_update' || m.code === 'rate_limited') return fail(m.code);
          if (m.code === 'update_required') return fail('watch_update');
          if (m.code === 'bad_message') return fail('old');
          // the relay hands the room to another relay: reconnect (the load balancer picks the serving one) and ask
          // again; server_moving closes the socket by itself
          if (m.code === 'room_gone') socket.bounce(typeof m.retryMs === 'number' ? m.retryMs : 250);
          return;
        default:
          return;
      }
    },
    state: (st) => {
      if (closed || st !== 'open') return;
      // an older relay (before PROTO 7) answered as PROTO 1: it cannot stream a match to a spectator
      if (socket.proto < PROTO_WATCH) return fail('old');
      socket.sendJson('room' in ctx.target ? { t: 'spectate', room: ctx.target.room } : { t: 'spectate', featured: true });
    },
  });
  socket.connect(ctx.ticket());

  // free camera: drag the map (as the replay viewer)
  let dragAt: { x: number; y: number; id: number } | null = null;
  const pan = (dxPx: number, dyPx: number): void => {
    if (!free || !session) return;
    const ppm = Math.max(4, session.view.pxPerMetre(free.x, free.z));
    const r = screenRightXZ();
    const t = towardCameraXZ();
    const mx = -dxPx / ppm;
    const my = -dyPx / (ppm * 0.75);
    free.x += r.x * mx + t.x * my;
    free.z += r.z * mx + t.z * my;
    const w = match?.config.map === 'hearthwood' ? 128_000 : MAP.width;
    const hgt = match?.config.map === 'hearthwood' ? 128_000 : MAP.height;
    const x0 = Math.min(toX(0), toX(w));
    const x1 = Math.max(toX(0), toX(w));
    const z0 = Math.min(toZ(0), toZ(hgt));
    const z1 = Math.max(toZ(0), toZ(hgt));
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

  const onClick = (e: Event): void => {
    const t = e.target as HTMLElement;
    const r = t.closest<HTMLElement>('[data-r]')?.dataset.r;
    const chip = t.closest<HTMLElement>('[data-slot]');
    if (chip) return setFollow(Number(chip.dataset.slot));
    if (r === 'exit') return close();
    if (r === 'cam') return setFree(!free);
    if (r === 'scores') return setScores(!scoresOn);
  };
  bar.addEventListener('click', onClick);
  veil.addEventListener('click', onClick);

  const onKey = (e: KeyboardEvent): void => {
    if (closed || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);

  // every frame: the camera holds the free point or eases after the followed hero; the chips dim the downed heroes
  let raf = 0;
  let chipsAt = 0;
  const loop = (now: number): void => {
    if (closed) return;
    raf = requestAnimationFrame(loop);
    if (!session) return;
    if (free) session.view.peekHold(free.x, free.z);
    else if (follow >= 0 && follow !== own) {
      const p = lastAt.get(follow);
      if (p) {
        const want = { x: toX(p.x), z: toZ(p.y) };
        cam = cam ? { x: cam.x + (want.x - cam.x) * 0.18, z: cam.z + (want.z - cam.z) * 0.18 } : want;
        session.view.peekHold(cam.x, cam.z);
      }
    }
    if (now - chipsAt > 250) {
      chipsAt = now;
      for (const b of heroesEl.querySelectorAll<HTMLElement>('[data-slot]')) b.classList.toggle('down', lastAt.get(Number(b.dataset.slot))?.dead === true);
      if (snap) html.dataset.spectateTick = String(snap.clock.tick);
      // this build's sim failed the golden self-test: it cannot re-run the match
      if (host?.ready === false) fail('watch_update');
    }
  };
  raf = requestAnimationFrame(loop);

  function close(): void {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey, true);
    if (!ended && !failed) host?.leave();
    teardownSession();
    socket.close();
    for (const n of [bar, drag, veil]) n.remove();
    for (const k of ['spectate', 'spectateViewers', 'spectateFollow', 'spectateTick']) delete html.dataset[k];
    ctx.onExit();
  }

  return { close };
}
