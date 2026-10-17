/**
 * The v5 HUD layer (W2-UI-RUN): Zzz noise meter, floating suspicion eye above the human (corner fallback), the
 * second human's "?" , mirror and REC cues, ghost race chips and pooled crime stickers. Hud.ts owns the classic
 * HUD and slots these nodes in. Reads SimState only; DOM work per frame is text/class changes on change and one
 * transform for each floating badge.
 */
import './hud.css';
import { HumanSt, type PlayableRoom, type SimEvent, type SimState } from '../../types';
import { mirrorHuman, mirrorPhase, routineOf, webcamOn } from '../../sim';
import { accompliceFor } from '../../platform';
import { HUD_COPY, pronounOf, type Pronoun } from './copy-hud';
import { ghostChip, type GhostLane } from './ghosts';
import { eyeAnchor, eyeVisible, humanPip, noiseView, watchedHuman, type NoiseView, type ScreenPoint } from './meters';
import { crimePops, type CrimePop, type PopCtx } from './popups';
import { createStickerPool, type StickerPool } from './pool';

export interface HudProjector {
  /** Head of human i (0..1, y down). */
  human?(i: number): ScreenPoint | null;
  /** A world cell at a level. */
  world?(x: number, z: number, level: number): ScreenPoint | null;
}

export type GhostLaneView = Pick<GhostLane, 'name' | 'replayOnly' | 'state'>;

export interface LayerOptions {
  play: PlayableRoom;
  locate?(prop: number): { x: number; y: number } | null;
  /** The accomplice's display name; default: today's Pink Paw cat for the room's accomplice. */
  accompliceName?: string;
}

export interface LayerFrame {
  suspPct: number;
  spot: 'moving' | 'frozen' | 'none';
}

export interface LayerState {
  eyeShown: boolean;
  eyeFloating: boolean;
  /** The Zzz bar floats above the napper (the corner one steps aside). */
  noiseFloating: boolean;
  noise: NoiseView | null;
  mirrorLive: boolean;
  mirrorHot: boolean;
  rec: boolean;
}

export interface V5Layer {
  /** Corner Zzz meter (Hud.ts puts it in the top-left column). */
  readonly noise: HTMLElement;
  /** Two-human pips (Hud.ts puts them inside the corner eye). */
  readonly pips: HTMLElement;
  /** REC badge (top right). */
  readonly rec: HTMLElement;
  update(s: SimState, events: readonly SimEvent[], f: LayerFrame): LayerState;
  setProjector(p: HudProjector | null): void;
  setGhosts(lanes: readonly GhostLaneView[]): void;
  /** Pooled "+480" at a prop (or centre-top without one). */
  points(text: string, prop: number | null): void;
  dispose(): void;
}

/** Ticks the mirror cue stays red after the mirror saw the cat. */
export const MIRROR_HOT_TICKS = 45;
/** Ticks the "crashes on camera +50%" hint shows at the run start. */
export const REC_HINT_TICKS = 120;

const el = (tag: string, cls: string, text = ''): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** A quick scale punch (transform only); never throws, never leaves a rejected promise behind. */
function bump(node: HTMLElement, scale: number, ms: number): void {
  if (typeof node.animate !== 'function') return;
  try {
    node.animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], { duration: ms, easing: 'ease-out' }).finished?.catch(() => undefined);
  } catch {
    /* decoration */
  }
}

/** Name the wish sticker uses: an explicit name, else today's Pink Paw accomplice, else ''. */
export function accompliceNameOf(play: PlayableRoom, explicit?: string): string {
  if (explicit) return explicit;
  const a = play.room.accomplice;
  if (!a) return '';
  try {
    return accompliceFor(play.dayNo ?? 1, a.pinkPawId)?.name ?? '';
  } catch {
    return '';
  }
}

export function createV5Layer(root: HTMLElement, o: LayerOptions): V5Layer {
  const play = o.play;
  const pron: Pronoun = pronounOf(play.routine);
  const twoHumans = !!play.routine2;
  const ctx: PopCtx = { kindOf: () => -1, accompliceName: accompliceNameOf(play, o.accompliceName), pronoun: pron };

  // corner Zzz meter
  const noiseFill = el('i', 'bc-noise-fill');
  const noise = el('div', 'bc-noise');
  noise.setAttribute('aria-label', 'Noise');
  noise.append(el('span', 'bc-noise-ico', '💤'), el('div', 'bc-noise-bar'), el('b', 'bc-noise-lbl', HUD_COPY.noiseLabel));
  noise.children[1].appendChild(noiseFill);
  // two-human pips in the corner eye
  const pips = el('span', twoHumans ? 'bc-pips is-on' : 'bc-pips');
  const pipEls = [el('i', 'bc-pip'), el('i', 'bc-pip')];
  pips.append(...pipEls);
  if (twoHumans) pips.title = HUD_COPY.shared;
  // REC badge
  const rec = el('div', 'bc-rec', HUD_COPY.rec);
  rec.setAttribute('aria-label', HUD_COPY.recHint);

  // floating badge above the human: the eye (or the Zzz bar on Sunday)
  const floatFill = el('i', 'bc-float-fill');
  const floatIco = el('span', 'bc-float-ico', '👁');
  const floatBar = el('div', 'bc-float-bar');
  floatBar.appendChild(floatFill);
  const floatPips = el('span', twoHumans ? 'bc-pips is-on' : 'bc-pips');
  const floatPipEls = [el('i', 'bc-pip'), el('i', 'bc-pip')];
  floatPips.append(...floatPipEls);
  const floatInner = el('div', 'bc-float-in');
  floatInner.append(floatIco, floatBar, floatPips);
  const float = el('div', 'bc-float');
  float.setAttribute('aria-hidden', 'true');
  float.appendChild(floatInner);
  // the other human's "?"
  const q2 = el('div', 'bc-q2', '?');
  q2.setAttribute('aria-hidden', 'true');
  // cues (mirror, rec hint, wake warning) under the banner row
  const cueMirror = el('div', 'bc-cue bc-cue-mirror');
  const cueRec = el('div', 'bc-cue bc-cue-rec', HUD_COPY.recHint);
  const cueNoise = el('div', 'bc-cue bc-cue-noise');
  const cues = el('div', 'bc-cues');
  cues.append(cueMirror, cueRec, cueNoise);
  // ghost chips (top right, under the timer)
  const ghostsBox = el('div', 'bc-ghosts');
  // stickers above everything else in the HUD
  const stickerLayer = el('div', 'bc-stickers');
  root.append(float, q2, cues, ghostsBox, stickerLayer);
  const stickers: StickerPool = createStickerPool(stickerLayer, 10, 'bc-sticker');
  const pointsPool: StickerPool = createStickerPool(stickerLayer, 6, 'bc-pop is-points bc-pt');

  let proj: HudProjector | null = null;
  let lanes: readonly GhostLaneView[] = [];
  let chipEls: { box: HTMLElement; label: HTMLElement; lastScore: number; lastLead: string }[] = [];
  let mirrorHotUntil = -1;
  let underIdx = -1;
  let size = { w: root.clientWidth || 390, h: root.clientHeight || 844 };
  let ro: ResizeObserver | null = null;
  const onResize = (): void => {
    size = { w: root.clientWidth || size.w, h: root.clientHeight || size.h };
  };
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(onResize);
    ro.observe(root);
  } else if (typeof window !== 'undefined') window.addEventListener('resize', onResize);
  const timers: number[] = [];
  const last = { floatKey: '', q2Key: '', noisePct: -1, noiseCls: '', mirror: '', rec: -1, recHint: -1, noiseCue: '', floatPct: -1, pips: '', floatMode: '' };

  const projectHuman = (s: SimState, i: number): ScreenPoint | null => {
    if (!proj) return null;
    try {
      const p = proj.human?.(i);
      if (p) return p;
      const hm = s.humans[i];
      return hm && proj.world ? proj.world(hm.x, hm.z, 3) : null;
    } catch {
      return null;
    }
  };

  const place = (node: HTMLElement, a: { x: number; y: number } | null, key: 'floatKey' | 'q2Key'): void => {
    // review round 1: keep the whole pill on screen (it was cut at the edge when the human stood near it)
    const half = Math.ceil((node.offsetWidth || 0) / 2);
    const px = a ? Math.round(Math.max(half + 6, Math.min(size.w - half - 6, a.x * size.w))) : 0;
    const k = a ? `${px},${Math.round(a.y * size.h)}` : '';
    if (k === last[key]) return;
    last[key] = k;
    if (!a) {
      node.classList.remove('is-on');
      return;
    }
    node.style.transform = `translate3d(${px}px, ${Math.round(a.y * size.h)}px, 0) translate(-50%, -100%)`;
    node.classList.add('is-on');
  };

  const anchorOf = (s: SimState, p: CrimePop): { x: number; y: number } => {
    const a = p.anchor;
    let pt: { x: number; y: number } | null = null;
    try {
      if (a.at === 'prop') pt = o.locate?.(a.prop) ?? (proj?.world && s.props[a.prop] ? proj.world(s.props[a.prop].x, s.props[a.prop].z, s.props[a.prop].level) : null);
      else if (a.at === 'cell') pt = proj?.world?.(a.x, a.z, a.level) ?? null;
      else if (a.at === 'human') {
        const e = eyeAnchor(projectHuman(s, a.human));
        pt = e ? { x: e.x, y: e.y + 0.05 } : null;
      }
    } catch {
      pt = null;
    }
    // at a prop the "+480" rises above the crash, so the sticker slaps just under it; elsewhere a bit above
    const dy = a.at === 'prop' ? 0.06 : -0.05;
    if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) && pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1) return { x: pt.x, y: pt.y + dy };
    // under the score: consecutive ones step down so two stickers in one beat never cover each other
    underIdx = (underIdx + 1) % 3;
    return { x: 0.5, y: 0.24 + underIdx * 0.065 };
  };

  const slap = (s: SimState, p: CrimePop): void => {
    const go = (): void => {
      const at = anchorOf(s, p);
      stickers.spawn({ text: p.text, cls: `is-${p.tone} is-${p.kind}`, x: at.x, y: at.y, tilt: p.tilt, motion: 'slap' });
    };
    if (p.delayMs > 0 && typeof window !== 'undefined') timers.push(window.setTimeout(go, p.delayMs));
    else go();
  };

  const setCue = (node: HTMLElement, key: 'mirror' | 'noiseCue', text: string, cls: string): void => {
    const k = `${text}|${cls}`;
    if (last[key] === k) return;
    last[key] = k;
    node.textContent = text;
    node.className = `${node.className.split(' ').slice(0, 2).join(' ')}${text ? ' is-on' : ''}${cls ? ` ${cls}` : ''}`;
  };

  const applyPips = (pipsNow: readonly string[], els: HTMLElement[]): void => {
    for (let i = 0; i < 2; i++) {
      const pip = pipsNow[i] ?? '';
      els[i].textContent = pip;
      els[i].className = `bc-pip${pip === '!' ? ' is-look' : pip === '?' ? ' is-q' : pip === 'z' ? ' is-z' : ''}`;
    }
  };

  return {
    noise,
    pips,
    rec,
    update(s, events, f) {
      ctx.kindOf = (i) => s.props[i]?.kind ?? -1;
      // ----- meters
      const nv = noiseView(s);
      const eyeShown = eyeVisible(s);
      if (nv) {
        if (nv.pct !== last.noisePct) {
          last.noisePct = nv.pct;
          noiseFill.style.transform = `scaleX(${nv.pct / 100})`;
        }
        const cls = `bc-noise is-on${nv.pulse ? ' is-pulse' : ''}${nv.warn ? ' is-warn' : ''}${nv.frozen ? ' is-frozen' : ''}`;
        if (cls !== last.noiseCls) {
          last.noiseCls = cls;
          noise.className = cls;
        }
      } else if (last.noiseCls !== 'bc-noise') {
        last.noiseCls = 'bc-noise';
        noise.className = 'bc-noise';
      }
      for (const e of events) {
        if (e.t === 'noise') bump(noise, 1.18, 260);
      }
      // ----- floating badge (eye above the watched human; Zzz above the napper while nobody else watches)
      const mode = eyeShown ? 'eye' : nv ? 'noise' : '';
      const who = mode === 'eye' ? watchedHuman(s) : nv ? nv.human : -1;
      const anchor0 = mode && who >= 0 ? eyeAnchor(projectHuman(s, who)) : null;
      // the world "hm?" floats above a turning human's head: lift the pill clear of it (review round 1)
      const turning = who >= 0 && s.humans[who]?.state === HumanSt.TELEGRAPH;
      const anchor = anchor0 && turning ? { x: anchor0.x, y: Math.max(0.12, anchor0.y - 0.07) } : anchor0;
      place(float, anchor, 'floatKey');
      noise.classList.toggle('is-away', !!anchor && mode === 'noise');
      if (mode !== last.floatMode) {
        last.floatMode = mode;
        floatIco.textContent = mode === 'noise' ? '💤' : '👁';
        float.classList.toggle('is-noise', mode === 'noise');
      }
      const fpct = mode === 'noise' && nv ? nv.pct : f.suspPct;
      if (fpct !== last.floatPct) {
        last.floatPct = fpct;
        floatFill.style.transform = `scaleX(${fpct / 100})`;
      }
      float.classList.toggle('is-hot', mode === 'noise' ? !!nv?.warn : fpct >= 50);
      float.classList.toggle('is-pulse', mode === 'noise' ? !!nv?.pulse : fpct >= 75);
      float.classList.toggle('is-seen', f.spot === 'moving');
      float.classList.toggle('is-frozen', mode === 'noise' && !!nv?.frozen);
      if (twoHumans) {
        const now = [0, 1].map((i) => (s.humans[i] ? humanPip(s.humans[i].state) : ''));
        const k = now.join('|');
        if (k !== last.pips) {
          last.pips = k;
          applyPips(now, pipEls);
          applyPips(now, floatPipEls);
        }
      }
      // the other human's "?" while it is turning and the eye sits on someone else
      let q: { x: number; y: number } | null = null;
      if (twoHumans) {
        for (let i = 0; i < s.humans.length; i++) {
          if (i === who || s.humans[i].state !== HumanSt.TELEGRAPH) continue;
          q = eyeAnchor(projectHuman(s, i));
          break;
        }
      }
      place(q2, q, 'q2Key');
      // ----- cues
      let mirrorLive = false;
      let mirrorGlint = false;
      let mirrorP: Pronoun = pron;
      try {
        const mh = mirrorHuman(s, play);
        mirrorLive = mh >= 0;
        if (mirrorLive) mirrorP = pronounOf(routineOf(play, mh));
        // v6: a glint warns before she checks the mirror (the mirror only watches during the check)
        mirrorGlint = !mirrorLive && mirrorPhase(s, play) === 'glint';
      } catch {
        mirrorLive = false;
      }
      for (const e of events) if (e.t === 'seen' && e.by === 'mirror') mirrorHotUntil = s.tick + MIRROR_HOT_TICKS;
      const mirrorHot = mirrorHotUntil >= s.tick && mirrorHotUntil >= 0;
      setCue(
        cueMirror,
        'mirror',
        mirrorHot ? HUD_COPY.mirrorSeen(mirrorP) : mirrorLive ? HUD_COPY.mirror(mirrorP) : mirrorGlint ? HUD_COPY.mirrorGlint(mirrorP) : '',
        mirrorHot ? 'is-hot' : mirrorGlint ? 'is-glint' : '',
      );
      let recOn = false;
      try {
        recOn = webcamOn(s, play);
      } catch {
        recOn = false;
      }
      if (+recOn !== last.rec) {
        last.rec = +recOn;
        rec.classList.toggle('is-on', recOn);
      }
      const recHint = recOn && s.tick < REC_HINT_TICKS ? 1 : 0;
      if (recHint !== last.recHint) {
        last.recHint = recHint;
        cueRec.classList.toggle('is-on', recHint === 1);
      }
      const nap = nv ? pronounOf(routineOf(play, nv.human)) : pron;
      setCue(cueNoise, 'noiseCue', nv?.frozen ? HUD_COPY.noiseFrozen : nv?.warn && !s.ended ? HUD_COPY.noiseStir(nap) : '', nv?.frozen ? 'is-frozen' : 'is-warn');
      // ----- crime stickers
      if (events.length) {
        const pops = crimePops(events, { ...ctx, pronoun: nap });
        for (const p of pops) slap(s, p);
        if (recOn && events.some((e) => (e.t === 'break' || e.t === 'spill' || e.t === 'land' || e.t === 'hit') && e.cam)) {
          bump(rec, 1.35, 300);
        }
      }
      // ----- ghost chips
      for (let i = 0; i < chipEls.length; i++) {
        const c = ghostChip(lanes[i], s.score);
        const ce = chipEls[i];
        if (c.score !== ce.lastScore) {
          ce.lastScore = c.score;
          ce.label.textContent = c.label;
        }
        const lead = `${c.lead ?? ''}${c.done ? ' done' : ''}`;
        if (lead !== ce.lastLead) {
          ce.lastLead = lead;
          ce.box.classList.toggle('is-ahead', c.lead === 'ahead');
          ce.box.classList.toggle('is-behind', c.lead === 'behind');
          ce.box.classList.toggle('is-done', c.done);
        }
      }
      return { eyeShown, eyeFloating: !!anchor && mode === 'eye', noise: nv, mirrorLive, mirrorHot, rec: recOn, noiseFloating: !!anchor && mode === 'noise' };
    },
    setProjector(p) {
      proj = p;
      last.floatKey = '';
      last.q2Key = '';
    },
    setGhosts(ls) {
      lanes = ls.slice(0, 2);
      ghostsBox.textContent = '';
      chipEls = lanes.map((l, i) => {
        const c = ghostChip(l, 0);
        const label = el('b', 'bc-ghost-name', c.label);
        const box = el('div', `bc-ghost bc-ghost-${i}${l.replayOnly ? ' is-replay' : ''}`);
        box.append(el('i', 'bc-ghost-dot'), label);
        if (c.tag) box.append(el('small', 'bc-ghost-tag', c.tag));
        ghostsBox.appendChild(box);
        return { box, label, lastScore: c.score, lastLead: '' };
      });
      ghostsBox.classList.toggle('is-on', chipEls.length > 0);
      root.classList.toggle('has-ghosts', chipEls.length > 0);
    },
    points(text, prop) {
      let at: { x: number; y: number } | null = null;
      if (prop !== null) {
        try {
          at = o.locate?.(prop) ?? null;
        } catch {
          at = null;
        }
      }
      const ok = at && at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1;
      pointsPool.spawn({ text, cls: '', x: ok ? at!.x : 0.5, y: ok ? at!.y - 0.04 : 0.2, motion: 'rise' });
    },
    dispose() {
      for (const t of timers) clearTimeout(t);
      ro?.disconnect();
      if (!ro && typeof window !== 'undefined') window.removeEventListener('resize', onResize);
      stickers.dispose();
      pointsPool.dispose();
      for (const n of [float, q2, cues, ghostsBox, stickerLayer]) n.remove();
    },
  };
}

