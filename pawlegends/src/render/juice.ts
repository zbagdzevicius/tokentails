/**
 * Juice (render only, POC.md §3): hitstop, camera shake, world pops and the rim flash. The sim never waits for any of
 * this: hitstop only slows the render clock for a few frames, and the interpolation catches up right after.
 *
 * LoL pass (lane A): banners and callouts no longer draw in the middle of the screen. `banner()` and `callout()` are
 * adapters onto the top notification rail (ui/notify.ts), which orders every message by priority, dedupes it and
 * rate-limits the spammy ones; callers did not change.
 */
import { claimScreen } from './fx/screenLayer';
import { CameraShake } from './camera/CameraShake.js';
import type { Stage } from '../ui/stage';
import { Notify, TOWER_GLYPH, type Note, type NotePrio } from '../ui/notify';

/** Round 1: a queued ordinary banner older than this is dropped (a "First Blood!" after five knockouts is stale). */
export const BANNER_STALE_MS = 3000;
/** XP pops this close together (ms) merge into one sum. */
export const XP_MERGE_MS = 900;

/** Global slow motion never runs longer than this (ms) unless asked for the match end (ANIM-SPEC §6). */
export const SLOWMO_CAP_MS = 110;
/** C11a: a full freeze of the global clock lasts at most this long (3 frames at 60 Hz). */
export const FREEZE_CAP_MS = 48;
/** C11d: kicks under this trauma are dropped: the screen shakes for the player's kills and big hits only. */
export const KICK_MIN = 0.2;

export interface Banner {
  title: string;
  sub?: string;
  tone?: 'good' | 'bad' | 'gold' | 'info';
  /** Kills of structures, the core, the result: shown before ordinary banners (rail prio 0). */
  urgent?: boolean;
  /** When it was queued (ms; kept for older callers). */
  at?: number;
  /** Seconds on screen (render time) for a long text such as the match-2 ping tip; default per priority. */
  hold?: number;
}

/** Info texts that repeat (lane help, walls, the ping and trackpad tips): rail prio 4, one per key per cooldown. */
const INFO: readonly { re: RegExp; key: string; cooldown: number }[] = [
  // QA v2 #2: lane help and the wall line repeated all match; matchSession also caps them per match (COACH_MAX)
  { re: /^Your team needs you in |^Help in .+!$/, key: 'lane-help', cooldown: 20000 },
  { re: /^Can't go that way$|^Enemy fountain: you can't go in$|^No entry: enemy fountain$/, key: 'cant-go', cooldown: 12000 },
  { re: /^Tell your team what to do$/, key: 'Tell your team what to do', cooldown: 8000 },
  { re: /^Trackpad mode: click to move$/, key: 'trackpad', cooldown: 60000 },
];
/** Announcer moments drawn big on desktop (with a crest badge and a light sweep). */
const BIG = /^(First Blood!|Double Pounce|Triple Pounce|Cat-astrophe|Shut down!|ACE!|Enemy team ACE|Victory!|Defeat|Enemy (tower|core) down!|We lost a (tower|core))/;
const MULTI = /^(Double Pounce|Triple Pounce|Cat-astrophe|ACE!|Shut down!)/;
const CREST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 15.4l-5.3 2.7 1-5.8L3.5 8.2l5.9-.9z"/></svg>';

/** Rail priority and options for a banner (the adapter's mapping; exported for tests). */
export function bannerNote(b: Banner): Note {
  const info = INFO.find((i) => i.re.test(b.title));
  const big = BIG.test(b.title);
  const tower = /tower|core/i.test(b.title) && !info;
  const prio: NotePrio = b.urgent ? 0 : info ? 4 : 2;
  return {
    title: b.title,
    ...(b.sub ? { sub: b.sub } : {}),
    tone: b.tone ?? 'info',
    prio,
    ...(b.hold ? { ttl: b.hold * 1000 } : {}),
    ...(info ? { key: info.key, cooldown: info.cooldown } : {}),
    ...(big ? { big: true, icon: tower ? TOWER_GLYPH : CREST } : tower ? { icon: TOWER_GLYPH } : {}),
    ...(MULTI.test(b.title) ? { tag: 'multi', drops: ['takedown'] } : {}),
  };
}

/** Rail note for a callout ("Takedown!", "Level 5"): prio 3, counted. */
export function calloutNote(text: string, tone: Banner['tone'] = 'gold'): Note {
  const level = /^Level \d+$/.test(text);
  const takedown = /^(Takedown!?|Assist!)$/.test(text);
  return {
    title: text,
    tone,
    prio: 3,
    count: !level,
    ...(level ? { key: 'level', tag: 'level', drops: ['level'] } : {}),
    ...(takedown ? { tag: 'takedown' } : {}),
  };
}

const isPhone = (): boolean => {
  try {
    return document.documentElement.dataset.touch === '1';
  } catch {
    return false;
  }
};

/**
 * QA v2 #10: the lowest a pop may start under the top rail (px): a pop rises ~1.5 × its height, so one that starts near
 * the top drifted into the rail line ("+162 XP" over it at 844 × 390). Only under the rail's span; 0 elsewhere.
 */
export function popFloor(x: number, phone: boolean, w = typeof window !== 'undefined' ? window.innerWidth : 1440, h = typeof window !== 'undefined' ? window.innerHeight : 900): number {
  const small = w < 700 || (w < 844 && h <= 380);
  const half = phone ? (small ? 105 : Math.min(180, Math.max(100, (w - 480) / 2))) : 320;
  if (Math.abs(x - w / 2) > half + 40) return 0;
  const railBottom = phone ? (small ? 70 : 84) : 160;
  return railBottom + (phone ? 30 : 40);
}

export class Juice {
  readonly shake = new CameraShake({ decay: 1.8, pitch: 0.035, yaw: 0.03, roll: 0.025, pos: 0.25, kick: 0.22 });
  private stopLeft = 0;
  private stopScale = 0;
  /** Settings: 0..1. */
  shakeScale = 1;
  /** The top notification rail (null DOM in tests without a root; the queue still works). */
  readonly notify: Notify;
  private popLayer: HTMLElement | null = null;
  private flashEl: HTMLElement | null = null;
  private popTimes: number[] = [];
  /** The last pop per replace group (combo, xp) and, for XP, its running sum. */
  private readonly groups = new Map<string, { el: HTMLElement; at: number; n: number }>();
  /** Callouts and pops shown (e2e telemetry and tests). */
  readonly said: string[] = [];
  /** The match's hold bookkeeping (ui/stage.ts): an open talent card dims the rail; null in tests and the lobby. */
  stage: Stage | null = null;
  private speedV = 1;

  constructor(root: HTMLElement | null) {
    this.notify = new Notify(root && typeof document !== 'undefined' ? root : null);
    if (root && typeof document !== 'undefined') {
      this.popLayer = document.createElement('div');
      this.popLayer.className = 'pl-pops';
      root.appendChild(this.popLayer);
      this.flashEl = document.createElement('div');
      this.flashEl.className = 'pl-flash';
      root.appendChild(this.flashEl);
    }
  }

  /** Render-time scale for the stale check (the match speed in e2e runs). */
  get speed(): number {
    return this.speedV;
  }

  set speed(v: number) {
    this.speedV = v;
    this.notify.speed = v;
  }

  /** Freeze the render clock for `ms` (scale 0) or slow it (`scale` > 0). The longest active request wins. */
  hitstop(ms: number, scale = 0): void {
    const s = (scale <= 0 ? Math.min(ms, FREEZE_CAP_MS) : ms) / 1000;
    if (s > this.stopLeft) {
      this.stopLeft = s;
      this.stopScale = scale;
    }
  }

  /**
   * Slow motion: the render clock runs at `scale` (0..1) for `ms`. Capped at SLOWMO_CAP_MS (ANIM-SPEC D5, §6: a long
   * global slow-mo left the snapshot clock behind and the catch-up rushed every hero); `long` is for the match end
   * only (the core falling), where nothing plays on after it.
   */
  slowmo(ms: number, scale: number, long = false): void {
    this.hitstop(long ? ms : Math.min(ms, SLOWMO_CAP_MS), Math.max(0.05, Math.min(1, scale)));
  }

  /** Record a text as said (a moment shown by another layer, e.g. the ult banner; e2e reads data-said). */
  note(text: string): void {
    this.remember(text);
  }

  /** Is slow motion (or a hitstop) running? */
  get slowed(): boolean {
    return this.stopLeft > 0;
  }

  /** Trauma 0..1. */
  kick(trauma: number): void {
    if (trauma < KICK_MIN) return;
    this.shake.add(trauma * this.shakeScale);
  }

  /** Render-clock scale for this frame (call once per frame with the real dt). */
  timeScale(dt: number): number {
    if (this.stopLeft <= 0) return 1;
    this.stopLeft -= dt;
    return this.stopScale;
  }

  /** Queue a banner on the rail (adapter: `urgent` → prio 0, lane help and tips → prio 4 with a cooldown, else 2). */
  banner(b: Banner): void {
    this.remember(b.title);
    this.notify.push(bannerNote(b));
  }

  /** Push a rail note directly (the ult moment, tower alerts). */
  push(n: Note): boolean {
    this.remember(n.title);
    return this.notify.push(n);
  }

  /** The title of the main rail note on screen now ('' when none). */
  get showing(): string {
    return this.notify.showing;
  }

  /** Is a banner with this title (or its rail key) waiting in the queue? (The queue drops stale and overflow notes.) */
  queued(title: string): boolean {
    return this.notify.queued(bannerNote({ title }).key ?? title);
  }

  /** Is a banner with this title on the rail (main or second line) or waiting for it? */
  onRail(title: string): boolean {
    return this.notify.onRail(bannerNote({ title }).key ?? title);
  }

  /** A short personal word ("Purrfect!", "Takedown!"): a prio 3 rail note, ×N when it repeats. */
  callout(text: string, tone: Banner['tone'] = 'gold'): void {
    this.remember(text);
    this.notify.push(calloutNote(text, tone));
  }

  /** Floating text at a screen point (px): "+40 XP", "Combo x2", "+FRENZY". Rises and fades in ~1 s. */
  pop(text: string, x: number, y: number, tone: Banner['tone'] = 'gold', big = false): void {
    this.remember(text);
    const layer = this.popLayer;
    if (!layer || !Number.isFinite(x) || !Number.isFinite(y)) return;
    // phones: at most 3 at once (5 before, LoL pass A6; fun pass playtest #13: a 3v1 was a pile of text), stacked closer
    const phone = isPhone();
    while (layer.childElementCount > (phone ? 2 : 8)) layer.firstElementChild?.remove();
    // pops that come close together stack upward and alternate sides, so "+40 XP" never covers "Combo x2"
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.popTimes = this.popTimes.filter((t) => now - t < 600);
    const k = this.popTimes.length;
    this.popTimes.push(now);
    const el = document.createElement('div');
    el.className = `pl-pop tone-${tone}${big ? ' big' : ''}`;
    el.textContent = text;
    const side = phone ? 30 : 46;
    const px = Math.round(x + (k % 2 ? side : -side) * Math.min(1, k));
    el.style.left = `${px}px`;
    el.style.top = `${Math.round(Math.max(y - k * (phone ? 20 : 26), popFloor(px, phone)))}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  /** An ally's line over that ally: a pop on a dark pill (phones: 12 px, at most 18 characters). */
  bark(text: string, x: number, y: number, tone: Banner['tone'] = 'good'): void {
    const short = isPhone() && text.length > 18 ? `${text.slice(0, 17).trimEnd()}…` : text;
    this.pop(short, x, y, tone);
    const el = this.popLayer?.lastElementChild as HTMLElement | null;
    if (el?.textContent === short) el.classList.add('bark');
    if (short !== text) this.remember(text);
  }

  /**
   * A pop that replaces the last one of its `group` still on screen (trailer review: "Combo x3" drew over "Combo x4").
   * Returns the element (null without a layer).
   */
  popReplace(group: string, text: string, x: number, y: number, tone: Banner['tone'] = 'gold', big = false): HTMLElement | null {
    const prev = this.groups.get(group);
    if (prev?.el.isConnected) {
      prev.el.remove();
      // its slot in the stacking window goes with it
      const i = this.popTimes.indexOf(prev.at);
      if (i >= 0) this.popTimes.splice(i, 1);
    }
    this.pop(text, x, y, tone, big);
    const el = (this.popLayer?.lastElementChild as HTMLElement | null) ?? null;
    if (el) this.groups.set(group, { el, at: this.popTimes[this.popTimes.length - 1] ?? 0, n: 0 });
    return el;
  }

  /** "+n XP": XP gained within XP_MERGE_MS of the last XP pop adds to it ("+81 XP", not three stacked pops). */
  popXp(n: number, x: number, y: number): void {
    const prev = this.groups.get('xp');
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (prev?.el.isConnected && now - prev.at < XP_MERGE_MS) {
      prev.n += n;
      prev.el.textContent = `+${prev.n} XP`;
      this.remember(prev.el.textContent);
      return;
    }
    const el = this.popReplace('xp', `+${n} XP`, x, y, 'gold');
    const g = this.groups.get('xp');
    if (el && g) g.n = n;
    el?.classList.add('xp');
  }

  /** A full-screen rim flash: white (Nine Lives), gold (level up, a multikill), red (low health). */
  flash(kind: 'white' | 'gold' | 'red'): void {
    const el = this.flashEl;
    if (!el) return;
    // GFX-10: one full-screen layer at a time (the red one runs 1.1 s, the others 0.7 s)
    if (!claimScreen(kind === 'red' ? 1100 : 700)) return;
    el.className = 'pl-flash';
    void el.offsetWidth;
    el.className = `pl-flash on ${kind}`;
  }

  private remember(text: string): void {
    this.said.push(text);
    if (this.said.length > 40) this.said.shift();
    try {
      document.documentElement.dataset.said = this.said.slice(-12).join('|');
    } catch {
      /* node */
    }
  }

  update(dt: number): void {
    this.notify.hold = this.stage?.held('talent') ?? false;
    this.notify.update(dt);
  }

  clear(): void {
    this.notify.clear();
    this.shake.reset();
    this.stopLeft = 0;
  }

  dispose(): void {
    this.notify.dispose();
    this.popLayer?.remove();
    this.flashEl?.remove();
  }
}
