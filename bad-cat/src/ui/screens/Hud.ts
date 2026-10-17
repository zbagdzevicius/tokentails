/**
 * Run HUD (GDD 5.1, 3.1): score top centre, combo under it, timer top right, suspicion eye (floating above the
 * human when the renderer can project it, the corner otherwise), human-state hint ("?" on TELEGRAPH, LOOK warning),
 * event banners for all 12 room events, "LAST CALL ×2", 3 FTUE prompts, floating points, pause overlay.
 * v5 (W2-UI-RUN, ../hud): Sunday Zzz noise meter, two humans (shared meter, pips, the other one's "?"), mirror
 * and REC cues, ghost race chips, pooled crime stickers. Reads SimState only; never writes it.
 */
import { CatAct, COMBO_WINDOW_TICKS, COMBO_WINDOW_V7, EVENT_TICKS, FTUE_TICKS, HumanSt, TICK_HZ, catActGainsSuspicion, propKind, type PlayableRoom, type SimEvent, type SimState } from '../../types';
import { frameableMess, routineOf } from '../../sim';
import { COPY, formatClock, formatScore, propEmoji } from '../copy';
import { btn, h } from '../dom';
import { eventBannerText, HUD_COPY, pronounOf } from '../hud/copy-hud';
import { createV5Layer, type GhostLaneView, type HudProjector } from '../hud/layer';
import { suspicionPct } from '../hud/meters';

export type { HudProjector, GhostLaneView };

/** 'rotate': paused because the phone turned sideways (round 3: say why once it is upright again). */
export type PauseKind = null | 'pause' | 'rotate' | 'context';

export interface HudOptions {
  play: PlayableRoom;
  ftue: boolean;
  touch: boolean;
  practice: boolean;
  onPause(): void;
  onResume(): void;
  onQuit(): void;
  onRestart(): void;
  /** Screen position (0..1, y down) of a prop, so points pop where the crash happened. */
  locate?(prop: number): { x: number; y: number } | null;
  /** Accomplice display name for the wish sticker (default: today's Pink Paw cat of the room). */
  accompliceName?: string;
}

export interface Hud {
  update(s: SimState, events: readonly SimEvent[]): void;
  setPaused(kind: PauseKind): void;
  /** The run intro's "GO!" stamp. */
  showGo?(): void;
  /** The FTUE prompt on screen now (0 none, see ftuePrompt). */
  promptId?(): number;
  /** v5: screen projection of humans and cells (the run session passes the renderer's). null = corner eye only. */
  setProjector?(p: HudProjector | null): void;
  /** v5: ghost race lanes (live states) for the score chips. */
  setGhosts?(lanes: readonly GhostLaneView[]): void;
  dispose(): void;
}

/** Hint pill text and class for this frame (pure; tested). `busyNew`: show "busy. Go!" (after a look ends). */
export function humanHint(s: SimState, play: PlayableRoom, busyNew: boolean): { text: string; cls: string } {
  if (s.cat.act === CatAct.CUDDLED) return { text: '😾 CAUGHT! Cuddle time.', cls: 'bc-hint is-look' };
  const looking: number[] = [];
  let fake = false;
  let turning2 = false;
  s.humans.forEach((hm, i) => {
    if (hm.state === HumanSt.LOOK) looking.push(i);
    else if (hm.state === HumanSt.FAKEOUT) fake = true;
    else if (hm.state === HumanSt.TELEGRAPH && i > 0) turning2 = true;
  });
  const spot = spottedState(s);
  if (looking.length) {
    if (spot === 'frozen')
      return { text: looking.length > 1 ? "😼 Frozen... they can't tell" : HUD_COPY.frozenSafe(pronounOf(safeRoutine(play, looking[0]))), cls: 'bc-hint is-frozen' };
    if (spot === 'moving') return { text: HUD_COPY.spotted, cls: 'bc-hint is-look' };
    const text = looking.length > 1 ? HUD_COPY.bothLook : HUD_COPY.look(pronounOf(safeRoutine(play, looking[0])));
    return { text, cls: 'bc-hint is-look' };
  }
  if (fake) return { text: '…false alarm', cls: 'bc-hint is-fake' };
  // two humans: the second one's turn gets its own pill (the first one's "hm?" is drawn in the room)
  if (turning2 && s.humans[0]?.state !== HumanSt.TELEGRAPH) return { text: HUD_COPY.secondTurn, cls: 'bc-hint is-telegraph' };
  if (busyNew && s.humans[0]?.state === HumanSt.BUSY) return { text: `${play.routine.name} is busy. Go!`, cls: 'bc-hint is-busy' };
  return { text: '', cls: 'bc-hint' };
}

function safeRoutine(play: PlayableRoom, i: number) {
  try {
    return routineOf(play, i);
  } catch {
    return play.routine;
  }
}

/**
 * FTUE prompt for this frame (pure; tested). 0 none, 1 run, 4 hop, 2 swat, 3 freeze, 5 sneak (ids match the CSS
 * classes). Order: run → hop → SWAT! → (first telegraph) freeze → (after the first turn) sneak. The freeze prompt
 * shows only during the telegraph: once he LOOKs, the hint pill alone says so (no stacked red banners).
 */
export interface FtueMemo {
  moved: boolean;
  jumped?: boolean;
  swatted: boolean;
  telegraphSeen: boolean;
  freezeUntil: number;
  sneaked?: boolean;
  /** Tick the sneak lesson started (after the first look), -1 not yet. */
  sneakFrom?: number;
}
export type FtuePromptId = 0 | 1 | 2 | 3 | 4 | 5;
export const SNEAK_PROMPT_TICKS = 150;
export function ftuePrompt(m: FtueMemo, s: SimState, events: readonly SimEvent[]): FtuePromptId {
  const hm = s.humans[0];
  for (const e of events) {
    if (e.t === 'step' || e.t === 'jump') m.moved = true;
    if (e.t === 'jump') m.jumped = true;
    if (e.t === 'swat' || e.t === 'push') m.swatted = true;
  }
  if (s.cat.act === CatAct.SNEAK || s.cat.act === CatAct.TROT || s.cat.stepTicks > 0) m.moved = true;
  if (s.cat.act === CatAct.JUMP) m.jumped = true;
  if (s.cat.act === CatAct.SNEAK) m.sneaked = true;
  // Caught (cuddle) or over: no prompt.
  if (s.ended || s.cat.act === CatAct.CUDDLED) return 0;
  if (hm && !m.telegraphSeen && hm.state === HumanSt.TELEGRAPH) {
    m.telegraphSeen = true;
    m.freezeUntil = s.tick + 120;
  }
  if (hm && hm.state === HumanSt.TELEGRAPH) return m.telegraphSeen && s.tick < m.freezeUntil ? 3 : 0;
  if (hm && hm.state === HumanSt.LOOK) return 0;
  const lessons = !m.moved ? 1 : !m.jumped && !m.swatted ? 4 : !m.swatted ? 2 : 0;
  // round 2: the hop lesson stays up for the whole paw trail (10 s) and comes back after the first freeze
  if (lessons && s.tick <= FTUE_LESSON_TICKS) return lessons;
  // Sneak comes only after the first turn (trot is the default; sneak is the quiet option).
  if (hm && m.telegraphSeen && hm.state === HumanSt.BUSY && !m.sneaked) {
    if (m.sneakFrom === undefined || m.sneakFrom < 0) m.sneakFrom = s.tick;
    if (s.tick < m.sneakFrom + SNEAK_PROMPT_TICKS) return 5;
  }
  return 0;
}

/** The run, hop and swat lessons show until this tick (20 s; was 14 s). */
export const FTUE_LESSON_TICKS = 600;

/** "busy. Go!" shows this long after each LOOK, fake-out or room EVENT ends (round 3: not the whole BUSY phase). */
export const BUSY_HINT_TICKS = 45;
/** The "Hop on a chair first" toast repeats at most this often. */
export const CANT_REACH_TOAST_TICKS = 45;

/**
 * Spotted state for the HUD (pure; tested). 'moving': the cat moves in the cone and suspicion rises (red SPOTTED,
 * edge flash). 'frozen': in the cone but frozen ("he can't tell", no flash). 'none' otherwise.
 */
export function spottedState(s: SimState): 'moving' | 'frozen' | 'none' {
  if (s.seen !== 1 || s.cat.act === CatAct.CUDDLED) return 'none';
  return catActGainsSuspicion(s.cat.act) ? 'moving' : 'frozen';
}

/**
 * Display name of the L1 seat nearest to (x, z) from the room's own furniture (the FTUE hop prompt): "chair",
 * "footstool", "sofa"... A two-cell sofa piece is the footstool. Falls back to "chair".
 */
export function seatName(play: PlayableRoom, x: number, z: number): string {
  let best = '';
  let bd = Infinity;
  for (const f of play.shell.furniture ?? []) {
    if (f.level !== 1) continue;
    const dx = Math.max(f.x - x, 0, x - (f.x + f.w - 1));
    const dz = Math.max(f.z - z, 0, z - (f.z + f.d - 1));
    const d = Math.max(dx, dz);
    if (d < bd) {
      bd = d;
      best = f.type === 'sofa' && f.w * f.d <= 2 ? 'footstool' : f.type.replace(/-/g, ' ');
    }
  }
  return best || 'chair';
}

/**
 * HUD / briefing name of a Must-Wreck target: the prop's own name ("Plate stack", "Christmas tree"). Review round 1:
 * the "Gold " prefix on every target read as clutter (and lower-cased "Gold christmas tree"); the gold ring and the
 * "Must-Wreck" heading already say which ones count.
 */
export function targetName(kind: number): string {
  return propKind(kind)?.name ?? 'Thing';
}

export function createHud(host: HTMLElement, o: HudOptions): Hud {
  const score = h('div', { class: 'bc-score' }, '0');
  const comboText = h('span', { class: 'bc-combo-txt' });
  // QA round 3: a draining bar under the combo shows the 4 s window (the ring alone was missed)
  const comboBar = h('i', { class: 'bc-combo-bar', 'aria-hidden': 'true' }, h('b', {}));
  const combo = h('div', { class: 'bc-combo' }, h('i', { class: 'bc-combo-ring', 'aria-hidden': 'true' }), comboText, comboBar);
  const timer = h('div', { class: 'bc-timer' }, formatClock(o.play.mode === 'ftue' ? FTUE_TICKS : o.play.room.ticks));
  const eyeFill = h('i', { class: 'bc-eye-fill' });
  const eye = h('div', { class: 'bc-eye', title: 'Suspicion' }, h('span', { class: 'bc-eye-ico', 'aria-hidden': 'true' }, '👁'), h('div', { class: 'bc-eye-bar' }, eyeFill));
  const hint = h('div', { class: 'bc-hint' });
  const banner = h('div', { class: 'bc-banner-run' });
  // QA round 3: coach lines get their own slot under the event banner (they sat on top of "KETTLE! 5 seconds")
  const coach = h('div', { class: 'bc-coach', 'aria-live': 'polite' });
  const prompt = h('div', { class: 'bc-prompt' });
  const pops = h('div', { class: 'bc-pops' });
  const under = h('div', { class: 'bc-pops-under' });
  const flash = h('div', { class: 'bc-flash', 'aria-hidden': 'true' });
  const vignette = h('div', { class: 'bc-vignette', 'aria-hidden': 'true' });
  const go = h('div', { class: 'bc-go', 'aria-hidden': 'true' }, 'GO!');
  // Must-Wreck list (desktop side panel) and the compact counter (every screen): both mark wrecked targets.
  const targetIdx: number[] = [];
  o.play.room.props.forEach((p, i) => {
    if (p.target) targetIdx.push(i);
  });
  const targetLis = targetIdx.map((i) => {
    const k = o.play.room.props[i].kind;
    return h('li', {}, h('span', { 'aria-hidden': 'true' }, propEmoji(k)), ' ', targetName(k));
  });
  const side = h('aside', { class: 'bc-side' }, h('div', { class: 'bc-kicker' }, COPY.mustWreck), h('ul', {}, ...targetLis));
  const tgtIcons = targetIdx.map((i) => h('i', { class: 'bc-tgt-i' }, propEmoji(o.play.room.props[i].kind)));
  const tgtCount = h('b', {}, `0/${targetIdx.length}`);
  const tgt = h('div', { class: 'bc-tgt', 'aria-label': COPY.mustWreck }, h('span', { 'aria-hidden': 'true' }, '🎯'), tgtCount, ...tgtIcons);
  const edge = h('div', { class: 'bc-edge', 'aria-hidden': 'true' });
  const pauseBtn = btn('❚❚', o.onPause, 'bc-icon-btn bc-pause-btn');
  pauseBtn.setAttribute('aria-label', COPY.paused);

  const overlay = h('div', { class: 'bc-pause' });
  const bannerTitle = h('span', { class: 'bc-banner-title' });
  const bannerSub = h('span', { class: 'bc-banner-sub' });
  banner.append(bannerTitle, bannerSub);
  const root = h(
    'div',
    { class: 'bc-hud' },
    vignette,
    flash,
    edge,
    h('div', { class: 'bc-hud-top' }, h('div', { class: 'bc-hud-left' }, eye, tgt), h('div', { class: 'bc-hud-mid' }, score, combo), h('div', { class: 'bc-hud-right' }, timer, pauseBtn)),
    hint,
    banner,
    coach,
    prompt,
    pops,
    under,
    go,
    side,
    overlay,
  );
  host.appendChild(root);
  // v5 layer: Zzz meter before the eye, two-human pips inside it, REC under the targets; floating parts on root
  const v5 = createV5Layer(root, { play: o.play, locate: o.locate, accompliceName: o.accompliceName });
  eye.insertAdjacentElement('beforebegin', v5.noise);
  eye.appendChild(v5.pips);
  tgt.insertAdjacentElement('afterend', v5.rec);
  const pron = pronounOf(o.play.routine);

  const memo: FtueMemo = { moved: false, swatted: false, telegraphSeen: false, freezeUntil: 0 };
  let eventStart = -1;
  let busyFrom = -1;
  let lastHuman: number = -1;
  let reachToastTick = -Infinity;
  let last = { ring: -1, score: -1, combo: -1, secs: -1, susp: -1, hint: '', banner: '', coach: '', prompt: -1, wrecked: -1, seen: 0, eyeCls: '' };
  let redUntil = -1;
  const popTimers: number[] = [];

  const setText = (el: HTMLElement, key: 'hint' | 'banner' | 'coach', text: string, cls: string): void => {
    if (last[key] === text) return;
    last[key] = text;
    el.textContent = text;
    el.className = cls + (text ? ' is-on' : '');
  };

  return {
    update(s, events) {
      if (s.score !== last.score) {
        last.score = s.score;
        score.textContent = formatScore(s.score);
        score.classList.remove('is-bump');
        void score.offsetWidth;
        score.classList.add('is-bump');
      }
      if (s.combo !== last.combo) {
        last.combo = s.combo;
        comboText.textContent = s.combo > 1 ? `×${s.combo} combo` : '';
        combo.classList.toggle('is-on', s.combo > 1);
      }
      // round 2: a timer ring around the combo shows how long the chain stays open (it holds while a fall is in flight)
      const win = (s.rules ?? 7) >= 7 ? COMBO_WINDOW_V7 : COMBO_WINDOW_TICKS;
      const ring = s.combo > 1 && s.comboTimer > 0 ? Math.max(0, Math.min(100, Math.round((100 * s.comboTimer) / win))) : 0;
      if (ring !== last.ring) {
        last.ring = ring;
        combo.style.setProperty('--combo-left', `${ring}%`);
        combo.classList.toggle('is-low', ring > 0 && ring < 30);
      }
      const secs = Math.ceil((s.ticks - s.tick) / TICK_HZ);
      if (secs !== last.secs) {
        last.secs = secs;
        timer.textContent = formatClock(s.ticks - s.tick);
        timer.classList.toggle('is-low', secs <= 10);
      }
      const susp = suspicionPct(s.suspicion);
      if (susp !== last.susp) {
        last.susp = susp;
        eyeFill.style.transform = `scaleX(${susp / 100})`;
        // amber below 50, red from 50 (the Perfect Crime limit)
        eye.classList.toggle('is-hot', susp >= 50);
        eye.classList.toggle('is-max', susp >= 75);
        // red screen-edge vignette above 50 %
        vignette.style.opacity = String(Math.max(0, (susp - 50) / 50)); // the shadow itself peaks at 0.35 alpha
        vignette.classList.toggle('is-on', susp > 50);
      }
      // round 3: red only while the cat moves in the cone (suspicion rises); a frozen cat in sight is safe
      const spot = spottedState(s);
      const moving = spot === 'moving' ? 1 : 0;
      eye.classList.toggle('is-seen', moving === 1);
      eye.classList.toggle('is-frozen', spot === 'frozen');
      // spotted moving (0 → 1): a 120 ms red edge flash (the "!" pops over the cat in the renderer)
      if (moving === 1 && last.seen === 0) {
        edge.classList.remove('is-on');
        void edge.offsetWidth;
        edge.classList.add('is-on');
      }
      last.seen = moving;
      // v5: noise meter, floating eye, cues, stickers, ghost chips
      const v = v5.update(s, events, { suspPct: susp, spot });
      const eyeCls = `${v.eyeShown ? '' : 'g'}${v.eyeFloating ? 'a' : ''}`;
      if (eyeCls !== last.eyeCls) {
        last.eyeCls = eyeCls;
        eye.classList.toggle('is-gone', !v.eyeShown);
        eye.classList.toggle('is-away', v.eyeFloating);
      }

      // Must-Wreck progress.
      let wrecked = 0;
      for (let k = 0; k < targetIdx.length; k++) {
        const p = s.props[targetIdx[k]];
        const done = !!p && p.restTick >= 0;
        if (done) wrecked++;
        tgtIcons[k].classList.toggle('is-done', done);
        targetLis[k].classList.toggle('is-done', done);
      }
      if (wrecked !== last.wrecked) {
        const bump = last.wrecked >= 0 && wrecked > last.wrecked;
        last.wrecked = wrecked;
        tgtCount.textContent = `${wrecked}/${targetIdx.length}`;
        tgt.classList.toggle('is-all', wrecked === targetIdx.length && wrecked > 0);
        if (bump) {
          tgt.classList.remove('is-bump');
          void tgt.offsetWidth;
          tgt.classList.add('is-bump');
        }
      }

      // Human state hint (both humans in boss rooms; the napper's sleep needs none).
      const hm = s.humans[0];
      if (hm && hm.state !== lastHuman) {
        // BUSY after a LOOK, fake-out or EVENT: "busy. Go!" for 1.5 s (not at the run start)
        busyFrom = hm.state === HumanSt.BUSY && lastHuman !== -1 && lastHuman !== HumanSt.BUSY ? s.tick : -1;
        lastHuman = hm.state;
      }
      const hn = humanHint(s, o.play, busyFrom >= 0 && s.tick - busyFrom < BUSY_HINT_TICKS);
      const ht = hn.text;
      const hc = hn.cls;
      setText(hint, 'hint', ht, hc);

      // Event banner / last call.
      if (s.eventActive && eventStart < 0) eventStart = s.tick;
      if (!s.eventActive) eventStart = -1;
      let bt = '';
      let bs = '';
      let ba = '';
      const cuddled = s.cat.act === CatAct.CUDDLED;
      if (s.eventActive && !cuddled) {
        const b = eventBannerText(Number(o.play.room.event) || 0, EVENT_TICKS - (s.tick - eventStart), pron, TICK_HZ);
        bt = b.title;
        bs = b.tag;
        ba = b.sub;
      } else if (s.lastCall && !cuddled) bt = COPY.lastCall;
      if (last.banner !== bt) {
        last.banner = bt;
        bannerTitle.textContent = bt;
        bannerSub.textContent = bs;
        banner.setAttribute('aria-label', ba || bt);
        banner.className = `bc-banner-run${bt ? ' is-on' : ''}${s.lastCall && !s.eventActive ? ' is-lastcall' : ''}`;
      }

      // Coach line (QA round 3): red-pawed (2 s), else "let him turn" while a mess could frame the Roomba
      for (const e of events) if (e.t === 'redpaw') redUntil = e.tick + 2 * TICK_HZ;
      let ct = '';
      if (!cuddled && s.tick < redUntil) ct = HUD_COPY.redPawed;
      else if (!cuddled && s.roomba && !s.humans.some((x) => x.state === HumanSt.LOOK) && frameableMess(s) >= 0) ct = HUD_COPY.frameIt(pron);
      setText(coach, 'coach', ct, `bc-coach${ct === HUD_COPY.redPawed ? ' is-red' : ''}`);

      // FTUE prompts.
      if (o.ftue) {
        const pr = ftuePrompt(memo, s, events);
        if (pr !== last.prompt) {
          last.prompt = pr;
          const P = COPY.ftuePrompts;
          prompt.textContent =
            pr === 1 ? (o.touch ? P.move : P.moveKeys)
            : pr === 4 ? (o.touch ? P.jump : P.jumpKeys)(seatName(o.play, s.cat.x, s.cat.z))
            : pr === 2 ? (o.touch ? P.swat : P.swatKeys)
            : pr === 3 ? HUD_COPY.freezePrompt(pron)
            : pr === 5 ? (o.touch ? P.sneak : P.sneakKeys)
            : '';
          prompt.className = `bc-prompt bc-prompt-${pr}${pr ? ' is-on' : ''}`;
        }
      }

      // Floating points.
      for (const e of events) {
        if ((e.t === 'break' || e.t === 'spill' || e.t === 'land' || e.t === 'hit') && e.points > 0) {
          // pooled, at the crash (round 3 look); the crime sticker for the same event comes from the v5 layer
          v5.points(`+${formatScore(e.points)}${e.combo > 1 ? ` ×${e.combo}` : ''}`, e.prop);
          if (e.t === 'break') {
            flash.classList.remove('is-on');
            void flash.offsetWidth;
            flash.classList.add('is-on');
          }
        } else if (e.t === 'cantReach' && e.tick - reachToastTick >= CANT_REACH_TOAST_TICKS) {
          // floor → table is two levels: the sim refused the jump (SIM_VERSION 4), say why
          reachToastTick = e.tick;
          addPop(e.level >= 3 ? COPY.cantReachHigh : COPY.cantReach, 'is-reach is-under');
        }
      }
    },
    showGo() {
      go.classList.remove('is-on');
      void go.offsetWidth;
      go.classList.add('is-on');
    },
    promptId() {
      return last.prompt < 0 ? 0 : last.prompt;
    },
    setProjector(p) {
      v5.setProjector(p);
    },
    setGhosts(lanes) {
      v5.setGhosts(lanes);
    },
    setPaused(kind) {
      root.classList.toggle('is-paused', !!kind);
      overlay.innerHTML = '';
      overlay.className = 'bc-pause' + (kind ? ' is-on' : '');
      if (!kind) return;
      if (kind === 'context') {
        overlay.append(h('div', { class: 'bc-pause-card' }, h('h2', {}, COPY.contextLost)));
        return;
      }
      const card = h(
        'div',
        { class: 'bc-pause-card' },
        h('h2', {}, COPY.paused),
        kind === 'rotate' ? h('p', { class: 'bc-muted bc-small' }, COPY.pausedRotate) : null,
        btn(o.touch ? COPY.tapToResume : COPY.clickToResume, o.onResume, 'bc-cta bc-cta-big'),
        o.practice ? btn(COPY.restart, o.onRestart, 'bc-cta bc-cta-soft') : null,
        btn(COPY.quitRun, o.onQuit, 'bc-link'),
      );
      overlay.append(card);
    },
    dispose() {
      for (const t of popTimers) clearTimeout(t);
      v5.dispose();
      root.remove();
    },
  };

  function addPop(text: string, cls: string, at: { x: number; y: number } | null = null): void {
    const p = h('div', { class: `bc-pop ${cls}` }, text);
    if (at && at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1) {
      // at the crash, clamped inside the stage
      p.classList.add('is-at');
      p.style.left = `${Math.max(12, Math.min(88, at.x * 100))}%`;
      p.style.top = `${Math.max(14, Math.min(80, at.y * 100 - 4))}%`;
      root.appendChild(p);
      setTimeout(() => p.remove(), 1200);
      return;
    }
    (cls.includes('is-under') ? under : pops).appendChild(p);
    setTimeout(() => p.remove(), 1200);
    while (pops.childElementCount > 4) pops.firstElementChild?.remove();
  }
}
