/**
 * Room Maker (GDD 6.4): a DOM layer over a live renderer. Portrait first, thumbs at the bottom:
 *   1 shell -> 2 props (palette tabs, tap to place, drag to move, tap to rotate, long-press to delete, undo/redo)
 *   -> 3 human + room event -> 4 three Must-Wreck targets -> 5 clear it (>= 2 of 3 in the maker's own run)
 *   -> 6 publish (title, author, link, 1200 x 630 card) -> done.
 * Remix (opts.initial), speed build (90 s) and admin (no budget, every shell/routine/theme, Export JSON).
 */
import {
  DEFAULT_CAT,
  ROOM_EVENT_NAMES,
  propKind,
  type CatSpec,
  type EditorOverlay,
  type Level,
  type PlayableRoom,
  type Renderer,
  type RoomDef,
  type RoomMakerOptions,
  type RoomMakerResult,
  type RoomTheme,
  type RoutineDef,
  type ShellDef,
  type SimState,
} from '../types';
import { initSim } from '../sim';
import { History } from './history';
import { ADMIN_MAX_PROPS, CLEAR_MIN_TARGETS, MAKER_MAX_BUDGET, MAKER_MAX_PROPS, MAKER_TARGETS, budgetCapFor, budgetMeter, propCost, roomBudget } from './budget';
import { check, type CheckResult } from './check';
import { PALETTE_TABS, kindHint, kindIcon, kindsForTab, shellKinds, type PaletteTab } from './palette';
import {
  CLOTH_MAX,
  cellOf,
  deleteProp,
  editableCopy,
  gameplayKey,
  inGrid,
  moveProp,
  newDraft,
  placeProp,
  propAt,
  resizeCloth,
  rotateProp,
  defaultRoutine,
  eventChoices,
  routineChoices,
  setSpawn,
  surfaceLevel,
  switchShell,
  targetCount,
  toggleTarget,
  type EditResult,
} from './placement';
import {
  ANON,
  AUTHOR_MAX,
  TITLE_MAX,
  UNTITLED,
  cleanAuthor,
  cleanTitle,
  exportJson,
  finalizeRoom,
  makeRoomCard,
  remixAncestors,
  remixLine,
  speedBadge,
  speedClock,
} from './publish';

/** Local extension of the frozen RoomMakerOptions (see LANE-NOTES/W2-EDITOR.md). */
export interface RoomMakerOptionsX extends RoomMakerOptions {
  /** Reuse the live renderer (one WebGL context, FULL-PLAN decision 5); otherwise the editor makes and disposes its own. */
  renderer?: Renderer;
  /** The player's cat for the preview. */
  cat?: CatSpec;
  /** Clock (tests). */
  now?: () => number;
  /** Long-press delay in ms (default 480). */
  longPressMs?: number;
  /** Dev page and e2e: called once with helpers to find cells on screen. */
  onReady?(api: RoomMakerDebug): void;
}

/** Dev/e2e helpers (never used by the game). */
export interface RoomMakerDebug {
  /** Client px of a cell centre on its surface, null when the renderer cannot project. */
  cellToClient(x: number, z: number): { x: number; y: number } | null;
  /** The current draft (a copy). */
  draft(): RoomDef;
  /** The cell under a client point (what a tap would hit). */
  pick(clientX: number, clientY: number): { x: number; z: number } | null;
}

export type MakerStep = 'shell' | 'props' | 'human' | 'targets' | 'clear' | 'publish' | 'done';
const STEPS: readonly { id: MakerStep; label: string }[] = [
  { id: 'shell', label: 'Room' },
  { id: 'props', label: 'Stuff' },
  { id: 'human', label: 'Human' },
  { id: 'targets', label: 'Targets' },
  { id: 'clear', label: 'Clear it' },
  { id: 'publish', label: 'Publish' },
];
const THEMES: readonly RoomTheme[] = ['default', 'xmas', 'birthday', 'wedding', 'nye', 'valentine', 'thanksgiving', 'spring'];
const PERSONA_ICON: Readonly<Record<string, string>> = {
  'chef-dad': '👨‍🍳',
  'couch-potato': '🛋️',
  'wfh-worker': '💻',
  napper: '😴',
  'skincare-sis': '🧖',
  'party-host': '🥳',
  grandma: '👵',
  caterer: '🤵',
};
const ROUTINE_BLURB: Readonly<Record<string, string>> = {
  'chef-dad': 'Cooks with his back turned. Turns around fast.',
  'couch-potato': 'Glued to the TV. Ad breaks are dangerous.',
  'wfh-worker': 'On a call. Crimes on camera score extra.',
  napper: 'Asleep. Too much noise wakes them up.',
  // round 3: every human gets a line (admin lists them all; some only had their sound, "teacup clink")
  'skincare-sis': 'Faces the mirror. When it glints, she can see you in it.',
  'party-host': 'Busy with the buffet. Sees the whole room when she turns.',
  grandma: 'Slow to turn, long to look. She has seen it all before.',
  caterer: 'Two of them, taking turns. Never both at once.',
};
/** One line per room event (ROOM_EVENT_NAMES order): what the human does for those 6 s. */
const EVENT_BLURB: readonly string[] = [
  'The doorbell: 6 s with nobody watching.',
  'The kettle: tea first, cat later.',
  'A phone call: eyes on the wall.',
  'Ad break: up for snacks, back fast.',
  'The oven dings: eyes on the oven.',
  'Lights off for a surprise.',
  'The alarm rings: no snoozing it.',
  'Speeches: everyone faces the toast.',
  'Guests at the door: hugs, 6 s.',
  'A courier: sign here, please.',
  'Pizza: tipping the driver.',
  "“You're on mute”: eyes on the screen.",
];
/** Step dot labels (the full names are in STEPS; these fit under a 22 px dot). */
const STEP_SHORT: Readonly<Record<MakerStep, string>> = { shell: 'Room', props: 'Props', human: 'Human', targets: 'Targets', clear: 'Clear', publish: 'Publish', done: 'Done' };

type Cell = { x: number; z: number; level: Level };

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  cell: Cell;
  prop: number;
  spawn: boolean;
  moved: boolean;
  drag: Cell | null;
  consumed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------------------------
// tiny DOM helpers (own copies so the editor CSS stays self-contained)
// ---------------------------------------------------------------------------------------------

type Attrs = Record<string, string | number | boolean | undefined | null>;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}
function button(label: string, id: string, onClick: () => void, cls = 'bce-btn'): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button', 'data-bce': id }, label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) onClick();
  });
  return b;
}

// ---------------------------------------------------------------------------------------------
// the editor
// ---------------------------------------------------------------------------------------------

export function openRoomMaker(host: HTMLElement, opts: RoomMakerOptionsX): Promise<RoomMakerResult> {
  return new Promise<RoomMakerResult>((resolve) => {
    const maker = new RoomMaker(host, opts, resolve);
    maker.start();
  });
}

class RoomMaker {
  private readonly now: () => number;
  private readonly shells: readonly ShellDef[];
  private readonly routines: readonly RoutineDef[];
  private readonly admin: boolean;
  private readonly cat: CatSpec;
  private readonly history = new History<RoomDef>();
  private readonly startedAt: number;

  private step: MakerStep = 'shell';
  private draft!: RoomDef;
  private tab: PaletteTab = 'fragile';
  private kind = 1;
  private tool: 'place' | 'spawn' = 'place';
  private selected = -1;
  private ancestors: string[] = [];
  private title = '';
  private author: string;
  private remix = false;
  /** Chaos cap of this draft: a remix of an authored room keeps that room's budget (budgetCapFor). */
  private budgetCap = MAKER_MAX_BUDGET;
  /** Title of the room this one remixes ("Remix of “QA Kitchen”"), when known. */
  private sourceTitle = '';
  private clearedKey: string | null = null;
  private lastRun: { targets: number; key: string } | null = null;
  private buildMs: number | undefined;
  private playStartedMs: number | undefined;
  private result: RoomMakerResult | null = null;
  private placedTracked = false;
  private closeArmed = 0;
  private checkCache: { key: string; res: CheckResult } | null = null;
  private hover: { x: number; z: number } | null = null;
  private gesture: Gesture | null = null;
  private busy = false;
  private done = false;

  // DOM
  private root!: HTMLElement;
  private stage!: HTMLElement;
  private hint!: HTMLElement;
  private meter!: HTMLElement;
  private panel!: HTMLElement;
  private nav!: HTMLElement;
  private dots!: HTMLElement;
  private clock!: HTMLElement;
  private fallbackGrid: HTMLElement | null = null;

  // render
  private renderer: Renderer | null = null;
  private ownRenderer = false;
  private sim: SimState | null = null;
  private loading = false;
  private pendingLoad: PlayableRoom | null = null;
  private raf = 0;
  private lastFrame = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private audio: AudioContext | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: RoomMakerOptionsX,
    private readonly resolve: (r: RoomMakerResult) => void,
  ) {
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.startedAt = this.now();
    this.shells = opts.content.shells ?? [];
    this.routines = opts.content.routines ?? [];
    this.admin = !!opts.admin;
    this.cat = opts.cat ?? DEFAULT_CAT;
    this.author = cleanAuthor(opts.codec, opts.author ?? '') === ANON ? '' : cleanAuthor(opts.codec, opts.author ?? '');
  }

  // ----- lifecycle -----

  start(): void {
    const first = this.shellChoices()[0] ?? 0;
    const init = this.opts.initial;
    let toastMsg = '';
    if (init && this.shells[init.shell] && this.shellChoices().includes(init.shell)) {
      this.draft = editableCopy(init, this.shells[init.shell]);
      this.ancestors = remixAncestors(init);
      this.title = init.title ?? '';
      this.sourceTitle = init.title ?? '';
      this.budgetCap = budgetCapFor(init);
      this.remix = true;
      this.step = 'props';
    } else {
      this.draft = newDraft(this.shells[first], first, this.routines, this.admin);
      if (init) {
        this.ancestors = remixAncestors(init);
        this.remix = true;
        toastMsg = "That room's shell isn't in the Room Maker yet. Pick one to start fresh.";
      }
    }
    this.build();
    this.mountRenderer();
    this.render();
    this.refreshView();
    this.track(this.remix ? 'remix' : 'open');
    if (this.opts.speedBuild) this.timerId = setInterval(() => this.tickClock(), 250);
    if (toastMsg) this.toast(toastMsg);
    try {
      this.opts.onReady?.({ cellToClient: (x, z) => this.cellToClient(x, z), draft: () => structuredClone(this.draft), pick: (x, y) => this.pick(x, y) });
    } catch {
      /* dev only */
    }
  }

  private cellToClient(x: number, z: number): { x: number; y: number } | null {
    const sh = this.shell;
    if (!inGrid(sh, x, z)) return null;
    const p = this.renderer?.projectWorld?.(x, z, surfaceLevel(sh, x, z));
    const rect = (this.renderer?.canvas ?? this.fallbackGrid)?.getBoundingClientRect();
    if (!rect) return null;
    if (p) return { x: rect.left + p.x * rect.width, y: rect.top + p.y * rect.height };
    if (!this.fallbackGrid) return null;
    return { x: rect.left + ((x + 0.5) / sh.width) * rect.width, y: rect.top + ((z + 0.5) / sh.depth) * rect.height };
  }

  private finish(r: RoomMakerResult): void {
    if (this.done) return;
    this.done = true;
    this.teardown();
    this.resolve(r);
    try {
      this.opts.onExit();
    } catch {
      /* the shell's problem */
    }
  }

  private teardown(): void {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    this.stopLoop();
    for (const off of this.offs.splice(0)) off();
    if (this.gesture?.timer) clearTimeout(this.gesture.timer);
    this.gesture = null;
    try {
      this.renderer?.setEditorOverlay?.(null);
    } catch {
      /* ignore */
    }
    if (this.ownRenderer) {
      try {
        this.renderer?.dispose();
      } catch {
        /* ignore */
      }
    }
    this.renderer = null;
    try {
      void this.audio?.close();
    } catch {
      /* ignore */
    }
    this.root?.remove();
  }

  // ----- data helpers -----

  /** Shell cards; admin sees every shell once by name (review round 1: Kitchen and Living room showed twice). */
  private shellChoices(): number[] {
    const out: number[] = [];
    const names = new Set<string>();
    this.shells.forEach((s, i) => {
      if (!(this.admin || s.maker)) return;
      if (this.admin && names.has(s.name) && !(this.draft && this.draft.shell === i)) return;
      names.add(s.name);
      out.push(i);
    });
    return out;
  }
  private get shell(): ShellDef {
    return this.shells[this.draft.shell] ?? this.shells[0];
  }
  private play(room: RoomDef = this.draft): PlayableRoom {
    return this.opts.content.resolve(room, 'practice');
  }
  private checkNow(): CheckResult {
    const key = gameplayKey(this.draft);
    if (this.checkCache?.key === key) return this.checkCache.res;
    const res = check(this.draft, this.opts.content, { admin: this.admin, maxBudget: this.budgetCap });
    this.checkCache = { key, res };
    return res;
  }
  private get cleared(): boolean {
    return this.clearedKey !== null && this.clearedKey === gameplayKey(this.draft);
  }
  private elapsed(): number {
    return Math.max(0, this.now() - this.startedAt);
  }
  private track(step: string, extra: Record<string, string | number | boolean> = {}): void {
    try {
      this.opts.track('bc_room_maker', { step, props: this.draft?.props.length ?? 0, ms: Math.round(this.elapsed()), ...extra });
    } catch {
      /* analytics never breaks the editor */
    }
  }

  // ----- edits -----

  /** Apply an edit: history, redraw, feedback. Returns the result for chaining. */
  /** Round 3: the cell of the last tap that placed nothing, painted red for a moment (with the toast's reason). */
  private flashBad: { cell: number; until: number } | null = null;
  private lastTap: { x: number; z: number } | null = null;

  private flashRefused(): void {
    const sh = this.shell;
    const t = this.lastTap;
    this.lastTap = null;
    if (!sh || !t) return;
    this.flashBad = { cell: t.z * sh.width + t.x, until: this.now() + 600 };
    this.refreshOverlay();
    this.stage?.classList.remove('bce-flash');
    void this.stage?.offsetWidth;
    this.stage?.classList.add('bce-flash');
    setTimeout(() => {
      this.flashBad = null;
      this.refreshOverlay();
    }, 650);
  }

  private apply(res: EditResult, sound: 'place' | 'move' | 'rotate' | 'delete' | 'target' | 'spawn' | 'resize'): EditResult {
    if (!res.ok) {
      this.toast(res.reason ?? 'Nope.');
      this.buzz(true);
      this.flashRefused();
      return res;
    }
    this.lastTap = null;
    if (res.room === this.draft) return res;
    this.history.commit(this.draft);
    this.draft = res.room;
    this.afterEdit();
    this.blip(sound);
    this.buzz(false);
    return res;
  }

  private afterEdit(): void {
    if (this.selected >= this.draft.props.length) this.selected = -1;
    this.refreshView();
    this.render();
  }

  placeAt(x: number, z: number): EditResult {
    this.lastTap = { x, z };
    const k = propKind(this.kind);
    if (!k) return { ok: false, room: this.draft, reason: 'Pick something first.' };
    const maxProps = this.admin ? ADMIN_MAX_PROPS : MAKER_MAX_PROPS;
    if (this.draft.props.length >= maxProps) {
      const r = { ok: false, room: this.draft, reason: `${maxProps} things is the limit. Even a cat gets tired.` };
      return this.apply(r, 'place');
    }
    if (!this.admin && roomBudget(this.draft) + propCost(this.kind) > this.budgetCap) return this.apply({ ok: false, room: this.draft, reason: 'Too much chaos, even for a cat' }, 'place');
    const r = this.apply(placeProp(this.draft, this.shell, this.kind, x, z), 'place');
    if (r.ok && r.index !== undefined) {
      this.selected = k.pull === 'cloth' ? r.index : -1;
      if (!this.placedTracked) {
        this.placedTracked = true;
        this.track('placed');
      }
      this.render();
    }
    return r;
  }

  undo(): void {
    const prev = this.history.undo(this.draft);
    if (!prev) return this.toast('Nothing to undo. Fresh start!');
    this.draft = prev;
    this.afterEdit();
    this.blip('delete');
  }
  redo(): void {
    const next = this.history.redo(this.draft);
    if (!next) return this.toast('Nothing to redo.');
    this.draft = next;
    this.afterEdit();
    this.blip('place');
  }

  /** Today's daily room when its shell is open in the Room Maker (review round 1: start from a real layout). */
  private todayRoom(): RoomDef | null {
    try {
      const c = this.opts.content;
      const day = c.dayNoFor(this.opts.today ?? new Date());
      const r = c.dailyRoom(day);
      return r && this.shellChoices().includes(r.shell) ? r : null;
    } catch {
      return null;
    }
  }

  /** "Kitchen #18": what today's room is called on the picker. */
  private todayTitle(r: RoomDef): string {
    try {
      const c = this.opts.content;
      const day = c.dayNoFor(this.opts.today ?? new Date());
      return r.title || c.roomLabel?.(day) || '';
    } catch {
      return r.title ?? '';
    }
  }

  /**
   * "Remix today": today's room as the draft, trimmed to the maker's limits (targets first, then the rest in order
   * while the chaos budget and the prop count allow). The player moves things around instead of starting empty.
   */
  remixToday(): void {
    const today = this.todayRoom();
    if (!today) return this.toast("Today's room isn't open in the Room Maker. Pick a room instead.");
    this.history.commit(this.draft);
    const copy = editableCopy(today, this.shells[today.shell]);
    const sh = this.shells[copy.shell];
    const maxProps = this.admin ? ADMIN_MAX_PROPS : MAKER_MAX_PROPS;
    // A remix of an authored room keeps its chaos (round 2: every remix was over 3,000 and could never publish).
    this.budgetCap = budgetCapFor(today);
    this.sourceTitle = this.todayTitle(today);
    const keep: typeof copy.props = [];
    let budget = 0;
    const ordered = [...copy.props.filter((p) => p.target), ...copy.props.filter((p) => !p.target)];
    for (const p of ordered) {
      const cost = propCost(p.kind);
      if (keep.length >= maxProps || (!this.admin && budget + cost > this.budgetCap)) continue;
      keep.push(p);
      budget += cost;
    }
    let next: RoomDef = { ...copy, props: keep };
    delete next.routine2;
    if (sh && !routineChoices(this.routines, sh, this.admin).includes(next.routine)) next = { ...next, routine: defaultRoutine(this.routines, sh, next.shell, this.admin) };
    this.draft = next;
    this.selected = -1;
    this.step = 'props';
    this.afterEdit();
    this.blip('place');
    this.track('remix');
    this.toast("Today's room is yours. Move things around, then mark 3 targets.");
  }

  /** "Remix of “QA Kitchen”" when the source title is known (round 2), else "Remix of Zyg's Kitchen". */
  private remixCredit(room: Pick<RoomDef, 'author' | 'ancestors'>, shellName: string): string {
    if (this.sourceTitle && this.remix) return `Remix of “${this.sourceTitle}”`;
    return remixLine(room, shellName);
  }

  private chooseShell(i: number): void {
    if (i === this.draft.shell) return;
    const sh = this.shells[i];
    if (!sh) return;
    this.history.commit(this.draft);
    this.draft = switchShell(this.draft, sh, i, this.routines, this.admin);
    this.selected = -1;
    this.afterEdit();
    this.blip('place');
  }

  // ----- steps -----

  go(step: MakerStep): void {
    if (step === this.step) return;
    // round 3: no way past "Clear it" without a clear (the admin keeps the shortcut)
    if (step === 'publish' && !this.cleared && !this.admin) step = 'clear';
    if (step === this.step) return;
    this.step = step;
    this.tool = 'place';
    this.hover = null;
    this.render();
    this.refreshOverlay();
  }

  private next(): void {
    const i = STEPS.findIndex((s) => s.id === this.step);
    if (this.step === 'targets' && !this.checkNow().ok) {
      this.toast(this.checkNow().errors[0] ?? 'Fix the red bits first.');
      this.buzz(true);
      return;
    }
    if (this.step === 'clear' && !this.cleared && !this.admin) {
      this.toast(`Wreck ${CLEAR_MIN_TARGETS} of ${MAKER_TARGETS} targets yourself first. No impossible rooms!`);
      return;
    }
    const n = STEPS[i + 1];
    if (n) this.go(n.id);
  }
  private back(): void {
    const i = STEPS.findIndex((s) => s.id === this.step);
    const p = STEPS[i - 1];
    if (p) this.go(p.id);
  }

  async playtest(): Promise<void> {
    if (this.busy) return;
    const res = this.checkNow();
    if (!res.ok) {
      this.toast(res.errors[0] ?? 'Fix the red bits first.');
      return;
    }
    this.busy = true;
    this.playStartedMs = this.elapsed();
    const { room } = finalizeRoom(this.draft, this.opts.codec, this.title || UNTITLED, this.author || ANON, this.ancestors);
    const key = gameplayKey(this.draft);
    this.root.classList.add('is-away');
    this.stopLoop();
    if (this.ownRenderer) {
      try {
        this.renderer?.dispose();
      } catch {
        /* ignore */
      }
      this.renderer = null;
    }
    let out: { targets: number; key: string } | null = null;
    try {
      const run = await this.opts.playtest(room);
      out = run ? { targets: run.targets | 0, key } : null;
    } catch {
      out = null;
    }
    if (this.done) return;
    this.root.classList.remove('is-away');
    if (this.ownRenderer || !this.renderer) this.mountRenderer();
    this.refreshView();
    this.busy = false;
    this.lastRun = out;
    if (out && out.targets >= CLEAR_MIN_TARGETS) {
      this.clearedKey = key;
      this.buildMs = this.playStartedMs;
      this.track('cleared', { targets: out.targets });
      this.blip('target');
    }
    this.render();
  }

  async publish(): Promise<RoomMakerResult | null> {
    if (this.busy) return null;
    if (!this.cleared) {
      this.toast(`Clear it first: wreck ${CLEAR_MIN_TARGETS} of ${MAKER_TARGETS} targets in your own room.`);
      return null;
    }
    this.busy = true;
    this.render();
    const title = cleanTitle(this.opts.codec, this.title);
    const author = cleanAuthor(this.opts.codec, this.author);
    const { room, code } = finalizeRoom(this.draft, this.opts.codec, title, author, this.ancestors);
    let link = '';
    try {
      link = this.opts.linkFor(room);
    } catch {
      link = '';
    }
    const shellName = this.shell.name;
    let card: Blob | null = null;
    try {
      card = await makeRoomCard(this.play(room), { title: room.title ?? title, author: room.author ?? author, remix: this.remixCredit(room, shellName), badge: speedBadge(this.buildMs, !!this.opts.speedBuild), shellName }, this.opts.render);
    } catch {
      card = null;
    }
    if (this.done) return null;
    this.result = { kind: 'published', room, code, link, buildMs: Math.round(this.buildMs ?? this.elapsed()), card };
    this.track('published', { remix: this.remix, speed: !!this.opts.speedBuild });
    this.busy = false;
    this.step = 'done';
    this.render();
    this.refreshOverlay();
    return this.result;
  }

  private close(): void {
    if (this.step === 'done' && this.result) return this.finish(this.result);
    const t = this.now();
    if (this.draft.props.length > 0 && t - this.closeArmed > 3000) {
      this.closeArmed = t;
      this.toast('Tap ✕ again to leave. Your room is not saved.');
      return;
    }
    this.finish({ kind: 'cancelled' });
  }

  private exportRoom(): void {
    const room: RoomDef = { ...this.draft };
    if (this.title) room.title = cleanTitle(this.opts.codec, this.title);
    if (this.author) room.author = cleanAuthor(this.opts.codec, this.author);
    if (this.ancestors.length) room.ancestors = this.ancestors.slice();
    const json = exportJson(room, `room-${this.shell.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
    try {
      void navigator.clipboard?.writeText(json).catch(() => undefined);
    } catch {
      /* ignore */
    }
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = el('a', { href: url, download: 'room.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      /* the textarea below still has it */
    }
    const sheet = el('div', { class: 'bce-sheet', 'data-bce': 'export-sheet' });
    const ta = el('textarea', { class: 'bce-json', readonly: true, 'data-bce': 'export-json' });
    ta.value = json;
    sheet.append(el('h3', {}, 'RoomDef JSON'), ta, button('Close', 'export-close', () => sheet.remove()));
    this.root.append(sheet);
    this.toast('Copied the room JSON.');
  }

  // ----- feedback -----

  private toast(text: string): void {
    if (!this.root) return;
    this.root.querySelectorAll('.bce-toast').forEach((t) => t.remove());
    const t = el('div', { class: 'bce-toast', role: 'status' }, text);
    this.root.append(t);
    setTimeout(() => t.classList.add('is-out'), 1900);
    setTimeout(() => t.remove(), 2300);
  }
  private buzz(err: boolean): void {
    try {
      navigator.vibrate?.(err ? [12, 40, 12] : 8);
    } catch {
      /* no haptics */
    }
  }
  /** A tiny synthesized pop (WebAudio, created on the first gesture). */
  private blip(kind: 'place' | 'move' | 'rotate' | 'delete' | 'target' | 'spawn' | 'resize'): void {
    try {
      const Ctx = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!Ctx) return;
      this.audio ??= new Ctx();
      const a = this.audio;
      const t = a.currentTime;
      const o = a.createOscillator();
      const g = a.createGain();
      const f = { place: 660, move: 520, rotate: 740, delete: 220, target: 880, spawn: 590, resize: 480 }[kind];
      o.type = kind === 'delete' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(kind === 'delete' ? f * 0.5 : f * 1.6, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + 0.14);
    } catch {
      /* silent is fine */
    }
  }

  // ----- renderer -----

  private mountRenderer(): void {
    this.renderer = null;
    this.ownRenderer = false;
    if (this.opts.renderer) {
      this.renderer = this.opts.renderer;
    } else {
      try {
        this.renderer = this.opts.render.createRenderer(this.stage, { quality: 'mid' });
        this.ownRenderer = true;
      } catch {
        this.renderer = null;
      }
    }
    try {
      this.renderer?.setLayout?.('editor');
    } catch {
      /* optional */
    }
    this.sim = null;
    this.ensureGrid();
  }

  /** Without a renderer (no WebGL) or without pickCell: a flat tappable grid. */
  private ensureGrid(): void {
    const need = !this.renderer || !this.renderer.pickCell;
    if (need && !this.fallbackGrid) {
      this.fallbackGrid = el('div', { class: 'bce-grid', 'data-bce': 'grid' });
      this.stage.append(this.fallbackGrid);
    } else if (!need && this.fallbackGrid) {
      this.fallbackGrid.remove();
      this.fallbackGrid = null;
    }
  }

  private refreshView(): void {
    this.checkCache = null;
    const play = this.play();
    if (this.fallbackGrid) this.drawGrid(play);
    if (this.renderer) {
      this.pendingLoad = play;
      void this.pumpLoad();
    }
    this.refreshOverlay();
  }

  private async pumpLoad(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    while (this.pendingLoad && this.renderer) {
      const p = this.pendingLoad;
      this.pendingLoad = null;
      this.sim = null;
      try {
        await this.renderer.load(p, [this.cat]);
        if (!this.pendingLoad) this.sim = initSim(p, this.cat);
      } catch {
        this.sim = null;
      }
      this.refreshOverlay();
    }
    this.loading = false;
    this.startLoop();
  }

  private startLoop(): void {
    if (this.raf || this.done || typeof requestAnimationFrame === 'undefined') return;
    const loop = (t: number): void => {
      this.raf = requestAnimationFrame(loop);
      if (!this.renderer || !this.sim || this.loading) return;
      if (t - this.lastFrame >= 1000 / 30) {
        this.lastFrame = t;
        this.sim.tick++;
      }
      try {
        this.renderer.frame(this.sim, 0, []);
      } catch {
        /* a bad frame never kills the editor */
      }
    };
    this.raf = requestAnimationFrame(loop);
  }
  private stopLoop(): void {
    if (this.raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private overlayState(): EditorOverlay {
    const editing = this.step === 'props' || this.step === 'targets' || this.step === 'shell';
    const showBad = this.step === 'targets' || this.step === 'clear';
    const targets = this.draft.props.map((p, i) => (p.target ? i : -1)).filter((i) => i >= 0);
    const bad = showBad ? this.checkNow().bad.slice() : [];
    if (this.flashBad && this.now() < this.flashBad.until) bad.push(this.flashBad.cell);
    // the view cone while marking targets (review round 1: "where the human can look" had nothing to see)
    const look = this.step === 'targets' ? this.checkNow().look ?? [] : [];
    // Placing props: tint the Roomba's road and the human's spot, the cells a tap there is refused on (round 2).
    const sh = this.shell;
    const placing = this.step === 'props' || this.step === 'human';
    const road = placing && sh ? (sh.roombaLoop ?? []).map((c) => c.z * sh.width + c.x) : [];
    const human = placing && sh ? [sh.humanSpot, ...(sh.humanSpot2 && this.draft.routine2 !== undefined ? [sh.humanSpot2] : [])].map((c) => c.z * sh.width + c.x) : [];
    return { grid: editing, hover: editing ? this.hover : null, bad, look, road, human, targets, spawn: this.draft.spawn };
  }
  private refreshOverlay(): void {
    const o = this.overlayState();
    try {
      this.renderer?.setEditorOverlay?.(o);
    } catch {
      /* optional */
    }
    if (this.fallbackGrid) this.paintGridOverlay(o);
  }

  private drawGrid(play: PlayableRoom): void {
    const g = this.fallbackGrid;
    if (!g) return;
    const { shell, room } = play;
    g.style.setProperty('--cols', String(shell.width));
    g.style.setProperty('--rows', String(shell.depth));
    const cells: HTMLElement[] = [];
    for (let z = 0; z < shell.depth; z++)
      for (let x = 0; x < shell.width; x++) {
        const lv = surfaceLevel(shell, x, z);
        const c = el('div', { class: `bce-cell lv${lv}`, 'data-x': x, 'data-z': z });
        if (shell.humanSpot.x === x && shell.humanSpot.z === z) c.textContent = '🧍';
        cells.push(c);
      }
    room.props.forEach((p, i) => {
      const k = propKind(p.kind);
      if (k?.pull === 'cloth') {
        for (let z = p.z; z < p.z + (p.d ?? 1); z++) for (let x = p.x; x < p.x + (p.w ?? 1); x++) cells[cellOf(shell, x, z)]?.classList.add('cloth');
        return;
      }
      const c = cells[cellOf(shell, p.x, p.z)];
      if (c) {
        c.textContent = kindIcon(p.kind);
        c.dataset.prop = String(i);
      }
    });
    const sp = cells[cellOf(shell, room.spawn.x, room.spawn.z)];
    if (sp) sp.textContent = '🐾';
    g.replaceChildren(...cells);
  }
  private paintGridOverlay(o: EditorOverlay): void {
    const g = this.fallbackGrid;
    if (!g) return;
    const W = this.shell.width;
    const tset = new Set((o.targets ?? []).map((i) => {
      const p = this.draft.props[i];
      return p ? cellOf(this.shell, p.x, p.z) : -1;
    }));
    const bset = new Set(o.bad ?? []);
    const lset = new Set(o.look ?? []);
    g.querySelectorAll<HTMLElement>('.bce-cell').forEach((c) => {
      const i = Number(c.dataset.z) * W + Number(c.dataset.x);
      c.classList.toggle('target', tset.has(i));
      c.classList.toggle('bad', bset.has(i));
      c.classList.toggle('look', lset.has(i) && !bset.has(i));
      c.classList.toggle('hover', !!o.hover && o.hover.x === Number(c.dataset.x) && o.hover.z === Number(c.dataset.z));
    });
  }

  /** Screen point -> cell (renderer pick, else the fallback grid's geometry). */
  pick(clientX: number, clientY: number): Cell | null {
    const sh = this.shell;
    if (this.renderer?.pickCell) {
      try {
        const c = this.renderer.pickCell(clientX, clientY);
        return c && inGrid(sh, c.x, c.z) ? { x: c.x, z: c.z, level: surfaceLevel(sh, c.x, c.z) } : null;
      } catch {
        return null;
      }
    }
    const g = this.fallbackGrid;
    if (!g) return null;
    const r = g.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const x = Math.floor(((clientX - r.left) / r.width) * sh.width);
    const z = Math.floor(((clientY - r.top) / r.height) * sh.depth);
    return inGrid(sh, x, z) ? { x, z, level: surfaceLevel(sh, x, z) } : null;
  }

  // ----- gestures (tap to place, drag to move, tap to rotate, long-press to delete) -----

  private bindStage(): void {
    const s = this.stage;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void): void => {
      s.addEventListener(type, fn as EventListener);
      this.offs.push(() => s.removeEventListener(type, fn as EventListener));
    };
    on('pointerdown', (e) => this.onDown(e.pointerId ?? 1, e.clientX, e.clientY));
    on('pointermove', (e) => this.onMove(e.pointerId ?? 1, e.clientX, e.clientY));
    on('pointerup', (e) => this.onUp(e.pointerId ?? 1, e.clientX, e.clientY));
    on('pointercancel', () => this.cancelGesture());
    on('contextmenu', (e) => e.preventDefault());
    const key = (e: KeyboardEvent): void => {
      if (this.step !== 'props' && this.step !== 'targets') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      }
    };
    document.addEventListener('keydown', key);
    this.offs.push(() => document.removeEventListener('keydown', key));
  }

  onDown(id: number, x: number, y: number): void {
    if (this.step !== 'props' && this.step !== 'targets') return;
    const cell = this.pick(x, y);
    if (!cell) {
      // round 3: a tap off the room placed nothing and said nothing
      this.toast(this.step === 'props' ? 'Tap inside the room: the floor or a surface.' : 'Tap a prop in the room.');
      this.buzz(true);
      return;
    }
    let prop = propAt(this.draft, cell.x, cell.z);
    // review round 1: a wine glass is ~10 px on a phone; in the Targets step a tap snaps to the prop drawn nearest
    // to the finger within one cell
    if (this.step === 'targets' && prop < 0) prop = this.snapProp(cell, x, y);
    const spawn = this.step === 'props' && this.draft.spawn.x === cell.x && this.draft.spawn.z === cell.z;
    this.cancelGesture();
    const gst: Gesture = { id, x0: x, y0: y, cell, prop, spawn, moved: false, drag: null, consumed: false, timer: null };
    if (this.step === 'props' && prop >= 0)
      gst.timer = setTimeout(() => {
        if (this.gesture !== gst || gst.moved) return;
        gst.consumed = true;
        this.apply(deleteProp(this.draft, prop), 'delete');
        this.toast('Poof. Gone.');
      }, this.opts.longPressMs ?? 480);
    this.gesture = gst;
  }

  onMove(id: number, x: number, y: number): void {
    const cell = this.pick(x, y);
    const gst = this.gesture;
    if (!gst || gst.id !== id) {
      const hv = cell ? { x: cell.x, z: cell.z } : null;
      if ((hv?.x ?? -1) !== (this.hover?.x ?? -1) || (hv?.z ?? -1) !== (this.hover?.z ?? -1)) {
        this.hover = hv;
        this.refreshOverlay();
      }
      return;
    }
    if (gst.consumed || this.step !== 'props' || (gst.prop < 0 && !gst.spawn)) return;
    const far = Math.hypot(x - gst.x0, y - gst.y0) > 8;
    if (!cell || !far) return;
    if (cell.x === gst.cell.x && cell.z === gst.cell.z && !gst.moved) return;
    gst.moved = true;
    if (gst.timer) clearTimeout(gst.timer);
    gst.timer = null;
    gst.drag = cell;
    this.hover = { x: cell.x, z: cell.z };
    this.refreshOverlay();
  }

  onUp(id: number, x: number, y: number): void {
    const gst = this.gesture;
    if (!gst || gst.id !== id) return;
    if (gst.timer) clearTimeout(gst.timer);
    this.gesture = null;
    if (gst.consumed) return;
    if (gst.moved) {
      const to = gst.drag ?? this.pick(x, y);
      if (!to) return;
      if (gst.spawn && gst.prop < 0) this.apply(setSpawn(this.draft, this.shell, to.x, to.z), 'spawn');
      else if (gst.prop >= 0) {
        const r = this.apply(moveProp(this.draft, this.shell, gst.prop, to.x, to.z), 'move');
        if (r.ok && r.index !== undefined && propKind(this.draft.props[r.index]?.kind ?? 0)?.pull === 'cloth') this.selected = r.index;
      }
      return;
    }
    this.tap(gst.cell, gst.prop);
  }

  /** The prop within one cell of `cell` whose cell centre is drawn nearest to the client point, -1 none. */
  private snapProp(cell: { x: number; z: number }, cx: number, cy: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cell.x + dx;
        const z = cell.z + dz;
        const i = propAt(this.draft, x, z);
        if (i < 0 || propKind(this.draft.props[i].kind)?.pull === 'cloth') continue;
        const p = this.cellToClient(x, z);
        const d = p ? Math.hypot(p.x - cx, p.y - cy) : Math.hypot(dx, dz) * 1000;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    return best;
  }

  private cancelGesture(): void {
    if (this.gesture?.timer) clearTimeout(this.gesture.timer);
    this.gesture = null;
  }

  /** A tap on a cell (no drag, no long-press). */
  tap(cell: { x: number; z: number }, prop = propAt(this.draft, cell.x, cell.z)): void {
    if (this.step === 'targets') {
      if (prop < 0) return this.toast('Tap a prop to make it a Must-Wreck target.');
      const r = this.apply(toggleTarget(this.draft, prop), 'target');
      if (r.ok && this.draft.props[prop]?.target) {
        const n = targetCount(this.draft);
        if (n === MAKER_TARGETS) this.toast('Three targets. Perfectly evil.');
      }
      return;
    }
    if (this.step !== 'props') return;
    if (this.tool === 'spawn') {
      const r = this.apply(setSpawn(this.draft, this.shell, cell.x, cell.z), 'spawn');
      if (r.ok) {
        this.tool = 'place';
        this.render();
      }
      return;
    }
    if (prop >= 0) {
      const k = propKind(this.draft.props[prop].kind);
      if (k?.pull === 'cloth') {
        // a tap on a cloth places the chosen prop on it (a tablecloth is a surface), unless the cloth itself is chosen
        if (this.kind !== 14) {
          this.placeAt(cell.x, cell.z);
          return;
        }
        this.selected = prop;
        this.render();
        return this.toast('Stretch the tablecloth with the arrows below.');
      }
      this.apply(rotateProp(this.draft, this.shell, prop), 'rotate');
      return;
    }
    this.placeAt(cell.x, cell.z);
  }

  // ----- DOM -----

  private build(): void {
    this.root = el('div', { class: 'bce', 'data-bce': 'root' });
    if (this.admin) this.root.classList.add('is-admin');
    const close = button('✕', 'close', () => this.close(), 'bce-icon');
    close.setAttribute('aria-label', 'Close the Room Maker');
    this.dots = el('div', { class: 'bce-dots' });
    this.clock = el('div', { class: 'bce-clock', 'data-bce': 'clock' });
    const top = el('header', { class: 'bce-top' }, close, this.dots, this.clock);
    if (this.admin) top.append(button('Export JSON', 'export', () => this.exportRoom(), 'bce-chip bce-admin'));
    this.stage = el('div', { class: 'bce-stage', 'data-bce': 'stage' });
    // review round 1: the hint sits under the room (it covered the middle of it), and the stage keeps one height
    // in every step so the camera never jumps between them (editor.css)
    this.hint = el('div', { class: 'bce-hint', 'data-bce': 'hint' });
    this.meter = el('div', { class: 'bce-meter', 'data-bce': 'meter' });
    this.panel = el('section', { class: 'bce-panel', 'data-bce': 'panel' });
    this.nav = el('footer', { class: 'bce-nav' });
    this.root.append(top, this.stage, this.hint, this.meter, this.panel, this.nav);
    this.host.append(this.root);
    this.bindStage();
    this.tickClock();
  }

  private tickClock(): void {
    if (!this.clock) return;
    if (!this.opts.speedBuild) {
      this.clock.textContent = '';
      return;
    }
    const ms = this.buildMs ?? this.elapsed();
    const c = speedClock(ms);
    this.clock.textContent = `⏱ ${c.text}`;
    this.clock.classList.toggle('is-over', c.over);
    this.clock.classList.toggle('is-hurry', !c.over && ms > 75_000);
  }

  render(): void {
    if (!this.root || this.done) return;
    this.root.dataset.step = this.step;
    // step dots
    this.dots.replaceChildren(
      ...STEPS.map((s, i) => {
        const cur = STEPS.findIndex((t) => t.id === this.step);
        const d = el('span', { class: `bce-dot${s.id === this.step ? ' is-on' : ''}${i < cur || this.step === 'done' ? ' is-done' : ''}` }, String(i + 1));
        d.title = s.label;
        // round 3: every dot is labelled (only the current step was named)
        return el('span', { class: `bce-dotw${s.id === this.step ? ' is-on' : ''}`, 'aria-label': `Step ${i + 1}: ${s.label}` }, d, el('small', { class: 'bce-dot-label' }, STEP_SHORT[s.id]));
      }),
      el('span', { class: 'bce-step-name' }, this.step === 'done' ? 'Published!' : ''),
    );
    this.renderMeter();
    this.hint.textContent = this.hintText();
    this.panel.replaceChildren(...this.panelFor());
    this.nav.replaceChildren(...this.navFor());
    this.tickClock();
  }

  private hintText(): string {
    switch (this.step) {
      case 'shell':
        return 'Pick a room to trash.';
      case 'props':
        return this.tool === 'spawn' ? 'Tap the floor where your cat starts.' : 'Tap: place · drag: move · tap a prop: turn · hold: delete';
      case 'human':
        return 'Who is watching?';
      case 'targets':
        return `Tap ${MAKER_TARGETS} props to mark Must-Wreck (${targetCount(this.draft)}/${MAKER_TARGETS}).`;
      case 'clear':
        return `No impossible rooms: wreck ${CLEAR_MIN_TARGETS} of ${MAKER_TARGETS} yourself.`;
      case 'publish':
        return 'Name it. Sign it. Send it.';
      default:
        return '';
    }
  }

  private renderMeter(): void {
    const b = roomBudget(this.draft);
    const cap = this.budgetCap;
    const max = this.admin ? Math.max(cap, b) : cap;
    const m = budgetMeter(b, this.admin ? Infinity : cap);
    const fill = el('div', { class: 'bce-meter-fill' });
    fill.style.width = `${Math.round(Math.min(1, b / max) * 100)}%`;
    const maxProps = this.admin ? ADMIN_MAX_PROPS : MAKER_MAX_PROPS;
    this.meter.dataset.mood = m.mood;
    this.meter.replaceChildren(
      el('div', { class: 'bce-meter-bar' }, fill),
      el(
        'div',
        { class: 'bce-meter-text' },
        el('b', { 'data-bce': 'budget' }, `${b.toLocaleString('en-US')}${this.admin ? '' : ` / ${cap.toLocaleString('en-US')}`}`),
        ` chaos · ${m.line}`,
        el('span', { class: 'bce-count', 'data-bce': 'count' }, `${this.draft.props.length}/${maxProps}`),
      ),
    );
  }

  private panelFor(): HTMLElement[] {
    switch (this.step) {
      case 'shell':
        return this.shellPanel();
      case 'props':
        return this.propsPanel();
      case 'human':
        return this.humanPanel();
      case 'targets':
        return this.targetsPanel();
      case 'clear':
        return this.clearPanel();
      case 'publish':
        return this.publishPanel();
      case 'done':
        return this.donePanel();
    }
  }

  private shellPanel(): HTMLElement[] {
    const cards = this.shellChoices().map((i) => {
      const s = this.shells[i];
      const c = button('', `shell-${i}`, () => this.chooseShell(i), `bce-card${i === this.draft.shell ? ' is-on' : ''}`);
      c.append(shellThumb(s), el('span', { class: 'bce-card-name' }, s.name));
      return c;
    });
    const today = this.todayRoom();
    const remix = today
      ? button(`✨ Remix today's ${this.shells[today.shell]?.name ?? 'room'}`, 'remix-today', () => this.remixToday(), 'bce-chip bce-remix-today')
      : null;
    return [...(remix ? [remix, el('small', { class: 'bce-note' }, 'Start from today’s layout, or pick an empty room:')] : []), el('div', { class: 'bce-cards' }, ...cards)];
  }

  private propsPanel(): HTMLElement[] {
    // round 3: only the room's own props (admin: every kind), and tabs with nothing for this room are hidden
    const only = this.admin ? undefined : shellKinds(this.draft.shell);
    const tabList = PALETTE_TABS.filter((t) => kindsForTab(t.id, only).length > 0);
    if (!tabList.some((t) => t.id === this.tab) && tabList[0]) {
      this.tab = tabList[0].id;
      const first = kindsForTab(this.tab, only)[0];
      if (first) this.kind = first.kind;
    }
    const tabs = el(
      'div',
      { class: 'bce-tabs', role: 'tablist' },
      ...tabList.map((t) => {
        const b = button(`${t.icon} ${t.label}`, `tab-${t.id}`, () => {
          this.tab = t.id;
          const first = kindsForTab(t.id, only)[0];
          if (first && !kindsForTab(t.id, only).some((k) => k.kind === this.kind)) this.kind = first.kind;
          this.render();
        }, `bce-tab${t.id === this.tab ? ' is-on' : ''}`);
        b.setAttribute('role', 'tab');
        return b;
      }),
    );
    const kinds = kindsForTab(this.tab, only);
    const chips = el(
      'div',
      { class: 'bce-kinds' },
      ...kinds.map((k) => {
        const b = button('', `kind-${k.id}`, () => {
          this.kind = k.kind;
          this.tool = 'place';
          this.render();
        }, `bce-kind${k.kind === this.kind && this.tool === 'place' ? ' is-on' : ''}`);
        b.append(el('span', { class: 'bce-kind-icon' }, kindIcon(k.kind)), el('span', { class: 'bce-kind-name' }, k.name), el('span', { class: 'bce-kind-pts' }, propCost(k.kind) ? `${propCost(k.kind)} · ${kindHint(k)}` : kindHint(k)));
        return b;
      }),
    );
    const tools = el(
      'div',
      { class: 'bce-tools' },
      button('↶ Undo', 'undo', () => this.undo(), 'bce-chip'),
      button('↷ Redo', 'redo', () => this.redo(), 'bce-chip'),
      button('🐾 Cat start', 'spawn-tool', () => {
        this.tool = this.tool === 'spawn' ? 'place' : 'spawn';
        this.render();
      }, `bce-chip${this.tool === 'spawn' ? ' is-on' : ''}`),
    );
    (tools.querySelector('[data-bce="undo"]') as HTMLButtonElement).disabled = !this.history.canUndo;
    (tools.querySelector('[data-bce="redo"]') as HTMLButtonElement).disabled = !this.history.canRedo;
    // round 3: the row scrolls sideways: say so (and fade its edges in editor.css) when it holds more than fits
    const wrap = el('div', { class: 'bce-kinds-wrap' }, chips);
    const more = kinds.length > 3 ? el('small', { class: 'bce-more', 'data-bce': 'kinds-more' }, `${kinds.length} props · swipe for more ›`) : null;
    // only when the row really overflows (four props fit on a phone: no "swipe" then)
    if (more && typeof requestAnimationFrame !== 'undefined')
      requestAnimationFrame(() => {
        const over = chips.scrollWidth > chips.clientWidth + 4;
        more.hidden = !over;
        wrap.classList.toggle('is-end', !over);
      });
    if (more)
      chips.addEventListener(
        'scroll',
        () => {
          const end = chips.scrollLeft + chips.clientWidth >= chips.scrollWidth - 4;
          wrap.classList.toggle('is-end', end);
        },
        { passive: true },
      );
    const out = [tabs, wrap, ...(more ? [more] : []), tools];
    const sel = this.draft.props[this.selected];
    if (sel && propKind(sel.kind)?.pull === 'cloth') {
      const w = sel.w ?? 1;
      const d = sel.d ?? 1;
      const rs = (dw: number, dd: number) => () => this.apply(resizeCloth(this.draft, this.shell, this.selected, w + dw, d + dd), 'resize');
      const row = el(
        'div',
        { class: 'bce-tools bce-resize', 'data-bce': 'cloth' },
        el('span', {}, `Tablecloth ${w} × ${d}`),
        button('◀', 'cloth-w-', rs(-1, 0), 'bce-chip'),
        button('▶', 'cloth-w+', rs(1, 0), 'bce-chip'),
        button('▲', 'cloth-d-', rs(0, -1), 'bce-chip'),
        button('▼', 'cloth-d+', rs(0, 1), 'bce-chip'),
      );
      (row.querySelector('[data-bce="cloth-w+"]') as HTMLButtonElement).disabled = w >= CLOTH_MAX;
      (row.querySelector('[data-bce="cloth-d+"]') as HTMLButtonElement).disabled = d >= CLOTH_MAX;
      out.push(row);
    }
    return out;
  }

  private humanPanel(): HTMLElement[] {
    // one card per human: Chef Dad's four frozen tempos are one person (review round 1: four identical cards)
    const seen = new Set<string>();
    const choices = routineChoices(this.routines, this.shell, this.admin).filter((i) => {
      const n = this.routines[i]?.name ?? '';
      if (seen.has(n) && this.draft.routine !== i) return false;
      seen.add(n);
      return true;
    });
    const pick = (field: 'routine' | 'routine2', i: number) => () => {
      if (this.draft[field] === i) return;
      this.history.commit(this.draft);
      this.draft = { ...this.draft, [field]: i };
      this.afterEdit();
      this.blip('place');
    };
    const card = (field: 'routine' | 'routine2', i: number): HTMLElement => {
      const r = this.routines[i];
      const b = button('', `${field}-${i}`, pick(field, i), `bce-card bce-human${this.draft[field] === i ? ' is-on' : ''}`);
      b.append(el('span', { class: 'bce-human-icon' }, PERSONA_ICON[r.persona ?? ''] ?? '🧍'), el('span', { class: 'bce-card-name' }, r.name), el('span', { class: 'bce-card-sub' }, ROUTINE_BLURB[r.persona ?? ''] ?? r.cue));
      return b;
    };
    const out: HTMLElement[] = [el('h3', {}, 'The human'), el('div', { class: 'bce-cards bce-cards-2' }, ...choices.map((i) => card('routine', i)))];
    if (this.draft.routine2 !== undefined) out.push(el('h3', {}, 'Second human'), el('div', { class: 'bce-cards bce-cards-2' }, ...choices.map((i) => card('routine2', i))));
    out.push(
      el('h3', {}, 'The room event'),
      el(
        'div',
        { class: 'bce-events' },
        ...eventChoices(this.draft.shell, ROOM_EVENT_NAMES.length, this.draft.event, this.admin).map((i) => {
          const b = button('', `event-${i}`, () => this.setEvent(i), `bce-chip bce-event${this.draft.event === i ? ' is-on' : ''}`);
          b.append(el('b', {}, ROOM_EVENT_NAMES[i]), el('small', {}, EVENT_BLURB[i] ?? ''));
          return b;
        }),
      ),
    );
    if (this.admin)
      out.push(
        el('h3', {}, 'Theme (admin)'),
        el('div', { class: 'bce-events' }, ...THEMES.map((t) => button(t, `theme-${t}`, () => this.setTheme(t), `bce-chip${(this.draft.theme ?? 'default') === t ? ' is-on' : ''}`))),
      );
    return out;
  }
  private setEvent(i: number): void {
    if (this.draft.event === i) return;
    this.history.commit(this.draft);
    this.draft = { ...this.draft, event: i };
    this.afterEdit();
    this.blip('place');
  }
  private setTheme(t: RoomTheme): void {
    this.history.commit(this.draft);
    const next = { ...this.draft };
    if (t === 'default') delete next.theme;
    else next.theme = t;
    this.draft = next;
    this.afterEdit();
  }

  private targetsPanel(): HTMLElement[] {
    const res = this.checkNow();
    const n = targetCount(this.draft);
    const tgt = el(
      'div',
      { class: 'bce-target-row' },
      ...[0, 1, 2].map((i) => el('span', { class: `bce-ring${i < n ? ' is-on' : ''}` }, i < n ? '🎯' : '○')),
      el('span', { class: 'bce-muted' }, n === MAKER_TARGETS ? 'Three targets. Perfectly evil.' : 'Tap props in the room.'),
      button('↶ Undo', 'undo', () => this.undo(), 'bce-chip'),
    );
    const list = el('ul', { class: 'bce-errors', 'data-bce': 'errors' }, ...res.errors.map((e) => el('li', {}, e)));
    return [tgt, res.ok ? el('p', { class: 'bce-ok', 'data-bce': 'check-ok' }, '✓ Looks wreckable. Now prove it.') : list];
  }

  private clearPanel(): HTMLElement[] {
    const r = this.lastRun && this.lastRun.key === gameplayKey(this.draft) ? this.lastRun : null;
    const cleared = this.cleared;
    let msg: string;
    if (cleared) msg = `Cleared! You wrecked ${r?.targets ?? CLEAR_MIN_TARGETS} of ${MAKER_TARGETS}. Publish unlocked.`;
    else if (r) msg = r.targets === 0 ? 'Zero wrecked. The room wins this round. Try again?' : `Only ${r.targets} of ${MAKER_TARGETS}. So close. Again!`;
    else if (this.clearedKey) msg = 'You changed the room since your clear: play it once more.';
    else msg = `Play your own room and wreck at least ${CLEAR_MIN_TARGETS} of ${MAKER_TARGETS} targets. That proves the room can be beaten: no impossible rooms.`;
    const play = button(cleared ? '▶ Play again' : '▶ Play it', 'play', () => void this.playtest(), cleared ? 'bce-btn' : 'bce-btn bce-cta');
    play.disabled = this.busy;
    return [el('p', { class: cleared ? 'bce-ok' : 'bce-muted', 'data-bce': 'clear-msg' }, msg), play];
  }

  private publishPanel(): HTMLElement[] {
    const title = el('input', { class: 'bce-input', 'data-bce': 'title', maxlength: TITLE_MAX, placeholder: `${this.author || 'My'}'s ${this.shell.name}`, autocomplete: 'off', enterkeyhint: 'next' });
    title.value = this.title;
    const author = el('input', { class: 'bce-input', 'data-bce': 'author', maxlength: AUTHOR_MAX, placeholder: 'Your name', autocomplete: 'off', enterkeyhint: 'done' });
    author.value = this.author;
    const preview = el('p', { class: 'bce-muted', 'data-bce': 'preview' });
    const upd = (): void => {
      this.title = title.value;
      this.author = author.value;
      const t = this.title.trim() ? cleanTitle(this.opts.codec, this.title) : cleanTitle(this.opts.codec, title.placeholder);
      const a = cleanAuthor(this.opts.codec, this.author);
      const rl = this.remixCredit({ author: a, ancestors: this.ancestors }, this.shell.name);
      preview.textContent = `“${t}” by ${a}${rl ? ` · ${rl}` : ''}`;
    };
    title.addEventListener('input', upd);
    author.addEventListener('input', upd);
    upd();
    const go = button(this.busy ? 'Publishing…' : '🚀 Publish', 'publish', () => {
      if (!this.title.trim()) this.title = title.placeholder;
      void this.publish();
    }, 'bce-btn bce-cta');
    const locked = !this.cleared && !this.admin;
    go.disabled = this.busy || locked;
    const badge = speedBadge(this.buildMs, !!this.opts.speedBuild);
    // round 3: a dimmed Publish said nothing: say why, and offer the way back to step 5
    const why = locked
      ? el(
          'p',
          { class: 'bce-locked', 'data-bce': 'publish-locked' },
          `🔒 Clear it first: wreck ${CLEAR_MIN_TARGETS} of ${MAKER_TARGETS} targets in your own room. `,
          button('▶ Play it', 'publish-play', () => this.go('clear'), 'bce-chip'),
        )
      : null;
    return [
      el('label', { class: 'bce-field' }, el('span', {}, 'Room title'), title),
      el('label', { class: 'bce-field' }, el('span', {}, 'Built by'), author),
      preview,
      badge ? el('p', { class: 'bce-badge', 'data-bce': 'badge' }, `⏱ ${badge}`) : el('span', {}),
      ...(why ? [why] : []),
      go,
    ];
  }

  private donePanel(): HTMLElement[] {
    const res = this.result;
    if (!res) return [];
    const out: HTMLElement[] = [el('h3', {}, '🎉 Your room is live. Dare a friend.')];
    if (res.card && typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        const url = URL.createObjectURL(res.card);
        out.push(el('img', { class: 'bce-card-img', src: url, alt: 'Room card', 'data-bce': 'card' }));
        this.offs.push(() => URL.revokeObjectURL(url));
      } catch {
        /* no preview */
      }
    }
    const link = el('input', { class: 'bce-input bce-link', readonly: true, 'data-bce': 'link' });
    link.value = res.link ?? '';
    out.push(
      link,
      el(
        'div',
        { class: 'bce-tools' },
        button('Copy link', 'copy', () => {
          try {
            void navigator.clipboard?.writeText(res.link ?? '').then(
              () => this.toast('Link copied. Go cause trouble.'),
              () => this.toast('Copy failed: long-press the link.'),
            );
          } catch {
            this.toast('Copy failed: long-press the link.');
          }
        }, 'bce-chip'),
        button('Share', 'share', () => this.finish(res), 'bce-btn bce-cta'),
        button('Done', 'done', () => this.finish(res), 'bce-chip'),
      ),
    );
    return out;
  }

  private navFor(): HTMLElement[] {
    if (this.step === 'done') return [];
    const i = STEPS.findIndex((s) => s.id === this.step);
    const back = button('‹ Back', 'back', () => this.back(), 'bce-btn bce-ghost');
    back.disabled = i <= 0;
    if (this.step === 'publish') return [back];
    let label = 'Next ›';
    let ok = true;
    if (this.step === 'targets') {
      const res = this.checkNow();
      ok = res.ok;
      label = ok ? 'Clear it ›' : `Fix ${res.errors.length} thing${res.errors.length === 1 ? '' : 's'}`;
    }
    if (this.step === 'clear') {
      ok = this.cleared || this.admin;
      label = 'Publish ›';
    }
    const next = button(label, 'next', () => this.next(), `bce-btn bce-cta${ok ? '' : ' is-blocked'}`);
    if (this.step === 'clear' && !ok) next.disabled = true;
    return [back, next];
  }
}

/** Shell card thumbnail: the heightmap as a tiny SVG in the shell's colours. */
export function shellThumb(s: ShellDef): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${s.width} ${s.depth}`);
  svg.setAttribute('class', 'bce-thumb');
  svg.setAttribute('aria-hidden', 'true');
  const hex = (c: number | undefined, f: string): string => (c === undefined ? f : `#${(c & 0xffffff).toString(16).padStart(6, '0')}`);
  const tones = [hex(s.floorColor, '#e9d6b9'), '#c99c76', '#a9744f', '#7c4f37'];
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', String(s.width));
  bg.setAttribute('height', String(s.depth));
  bg.setAttribute('fill', hex(s.wallColor, '#f4e3c9'));
  svg.append(bg);
  for (let z = 0; z < s.depth; z++)
    for (let x = 0; x < s.width; x++) {
      const lv = s.levels[z * s.width + x];
      if (lv === 0 && !s.occludes[z * s.width + x]) {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', String(x + 0.04));
        r.setAttribute('y', String(z + 0.04));
        r.setAttribute('width', '0.92');
        r.setAttribute('height', '0.92');
        r.setAttribute('fill', tones[0]);
        svg.append(r);
        continue;
      }
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(x + 0.04));
      r.setAttribute('y', String(z + 0.04));
      r.setAttribute('width', '0.92');
      r.setAttribute('height', '0.92');
      r.setAttribute('rx', '0.15');
      r.setAttribute('fill', tones[lv] ?? tones[0]);
      svg.append(r);
    }
  const h = document.createElementNS(NS, 'circle');
  h.setAttribute('cx', String(s.humanSpot.x + 0.5));
  h.setAttribute('cy', String(s.humanSpot.z + 0.5));
  h.setAttribute('r', '0.42');
  h.setAttribute('fill', '#ff6f91');
  svg.append(h);
  return svg;
}
