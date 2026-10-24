// The Trail Maker screen (TRAILS lane): MY TRAILS (play, edit, share, delete) and the editor (name, world, pace,
// block palette, course strip, live validation, top-down minimap with a running Mochi dot, estimated time, RANDOM,
// TEST RUN, SHARE once finished). Browser module. Every player-typed or link-borne name is set with textContent.
import { game, prefs } from '../core/state';
import * as session from '../core/session';
import { sanitizeName, TRAILS_MAX, type TrailEntry } from '../meta/save';
import { BLOCKS, blockAllowed, blockById, blocksFor } from '../stages/blocks';
import { ugc } from '../ugc/contract';
import { addScreen, onScreen, toast } from '../ugc/hub';
import { linkWith, shareOrDownload } from '../ugc/sharekit';
import { play, screen, setScreen } from '../ui/flow';
import { fmtDist, fmtInt, fmtTime } from '../ui/format';
import { thumbCanvas } from '../ui/thumbs';
import { DEFAULT_TRAIL_NAME, decodeTrail, encodeTrail, MAX_BLOCKS, PACES, SEED_MAX, THEMES, type Pace, type Trail } from './code';
import { IC } from './icons';
import { drawMap, mapData, mapFrame, type MapData } from './minimap';
import { deleteMine, findMine, mine, saveMine } from './store';
import { analyzeTrail, randomName, randomTrail, THEME_NAMES, type TrailAnalysis } from './validate';

type View = 'list' | 'edit';
interface Draft {
  trail: Trail;
  /** the saved entry this draft edits (null = not saved yet) */
  prevCode: string | null;
  /** selected block (-1 = none) */
  sel: number;
}

let root: HTMLElement | null = null;
let view: View = 'list';
let draft: Draft | null = null;
let ana: TrailAnalysis | null = null;
let map: MapData | null = null;
let pending = 0;
let raf = 0;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const randSeed = (): number => Math.floor(Math.random() * SEED_MAX);
const PAW = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="15.5" r="5"/><circle cx="5.5" cy="9.5" r="2.4"/><circle cx="10" cy="5.5" r="2.4"/><circle cx="14" cy="5.5" r="2.4"/><circle cx="18.5" cy="9.5" r="2.4"/></svg>';

export const makerView = (): View => view;
export const makerDraft = (): Trail | null => (draft ? { ...draft.trail, blocks: draft.trail.blocks.map((b) => ({ ...b })) } : null);
export const makerCheck = (): TrailAnalysis | null => ana;

// ---------------------------------------------------------------- sharing (also the results button)
export function shareTrail(code: string, name: string): void {
  // straight from the click handler (iOS needs the fresh gesture)
  void shareOrDownload({ title: 'Meow Run', text: `Try my Meow Run trail "${sanitizeName(name) || DEFAULT_TRAIL_NAME}"!`, url: linkWith({ t: code }) }).then((o) => {
    if (o === 'copied') toast('Trail link copied!');
    else if (o === 'shared') toast('Trail shared!');
    else if (o === 'failed') toast('Could not share the link');
  });
}

function startRun(code: string): void {
  const r = ugc.loadTrail(code);
  if (!r.ok) {
    toast(r.error);
    return;
  }
  stopMapLoop();
  play('trail');
}

// ---------------------------------------------------------------- DOM
function build(): HTMLElement {
  const sec = addScreen('trails', { dim: true });
  sec.innerHTML = `
<div class="trails-wrap">
  <header class="trails-head">
    <button class="iconbtn" id="trailsBack" aria-label="Back">${IC.back}</button>
    <h2 class="txt" id="trailsTitle">Trail Maker</h2>
    <span class="trails-count txt" id="trailsCount"></span>
  </header>
  <div id="trailsList" class="trails-list">
    <div class="card trails-intro">
      <div class="trails-intro-ico">${IC.maker}</div>
      <p><b>Build your own course.</b> Chain blocks, test-run it, then send the link to a friend.</p>
      <div class="row">
        <button id="trailsNew" class="btn gold"><span class="ugc-ico">${IC.plus}</span>NEW TRAIL</button>
        <button id="trailsSurprise" class="btn alt"><span class="ugc-ico">${IC.dice}</span>SURPRISE ME</button>
      </div>
    </div>
    <div id="trailsMine" class="trails-mine"></div>
  </div>
  <div id="trailsEditor" class="trails-editor hidden">
    <div class="trails-col">
      <div class="card trails-mapbox">
        <canvas id="trailsMap" aria-label="Trail map"></canvas>
        <div id="trailsBadge" class="trails-badge" role="status"></div>
        <div id="trailsStats" class="trails-stats"></div>
        <button id="trailsReseed" class="iconbtn trails-reseed" aria-label="New layout" title="Same blocks, new layout">${IC.shuffle}</button>
      </div>
      <div class="card trails-course">
        <div class="trails-label">COURSE <span id="trailsN"></span></div>
        <div id="trailsStrip" class="trails-strip"></div>
        <div id="trailsTools" class="trails-tools">
          <button id="trailsLeft" class="trails-tool" aria-label="Move left">${IC.left}<span>MOVE</span></button>
          <button id="trailsRight" class="trails-tool" aria-label="Move right">${IC.right}<span>MOVE</span></button>
          <button id="trailsMirror" class="trails-tool" aria-pressed="false">${IC.mirror}<span>MIRROR</span></button>
          <button id="trailsHard" class="trails-tool" aria-pressed="false">${IC.hard}<span>HARD</span></button>
          <button id="trailsDel" class="trails-tool" aria-label="Delete block">${IC.trash}<span>DELETE</span></button>
        </div>
      </div>
    </div>
    <div class="trails-col">
      <div class="card trails-setup">
        <button id="trailsSetupBtn" class="trails-setupbtn" aria-expanded="false"><span class="trails-label">SETUP</span><b id="trailsSetupSum"></b><i>EDIT</i></button>
        <div class="trails-setup-body">
        <label class="trails-label" for="trailsName">NAME</label>
        <input id="trailsName" type="text" maxlength="14" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done">
        <div class="trails-label">WORLD</div>
        <div id="trailsThemes" class="trails-themes"></div>
        <div class="trails-label">PACE</div>
        <div id="trailsPace" class="trails-pace"></div>
        </div>
      </div>
      <div class="card trails-blocks">
        <div class="trails-label">BLOCKS <small>tap to add</small></div>
        <div id="trailsPalette" class="trails-palette"></div>
      </div>
    </div>
    <div class="trails-actions">
      <button id="trailsRandom" class="btn alt small"><span class="ugc-ico">${IC.dice}</span>RANDOM</button>
      <button id="trailsTest" class="btn green"><span class="ugc-ico">${IC.play}</span>TEST RUN</button>
      <button id="trailsShare" class="btn gold small hidden"><span class="ugc-ico">${IC.share}</span>SHARE</button>
    </div>
  </div>
</div>`;
  // worlds
  const th = $('trailsThemes');
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.className = 'trails-theme';
    b.dataset.theme = t;
    b.appendChild(thumbCanvas(t, 120, 70));
    const l = document.createElement('span');
    l.textContent = THEME_NAMES[t];
    b.appendChild(l);
    b.addEventListener('click', () => edit((d) => (d.trail.theme = t)));
    th.appendChild(b);
  }
  // phones: NAME, WORLD and PACE fold into one SETUP line above the palette (tap to open)
  $('trailsSetupBtn').addEventListener('click', () => {
    const card = $('trailsSetupBtn').parentElement!;
    const open = !card.classList.contains('open');
    card.classList.toggle('open', open);
    $('trailsSetupBtn').setAttribute('aria-expanded', String(open));
  });
  // paces
  const pc = $('trailsPace');
  PACES.forEach((p, i) => {
    const b = document.createElement('button');
    b.dataset.pace = String(i);
    b.innerHTML = `<b>${p.name.toUpperCase()}</b><small>${p.start}-${p.max} m/s</small>`;
    b.addEventListener('click', () => edit((d) => (d.trail.pace = i as Pace)));
    pc.appendChild(b);
  });

  $('trailsBack').addEventListener('click', back);
  $('trailsNew').addEventListener('click', () => newTrail(false));
  $('trailsSurprise').addEventListener('click', () => newTrail(true));
  $('trailsRandom').addEventListener('click', () => {
    if (!draft) return;
    const t = draft.trail;
    draft.trail = randomTrail(randSeed(), { theme: t.theme, pace: t.pace, name: t.name });
    draft.sel = -1;
    refresh();
  });
  $('trailsReseed').addEventListener('click', () => edit((d) => (d.trail.seed = randSeed())));
  $('trailsTest').addEventListener('click', testRun);
  $('trailsShare').addEventListener('click', () => {
    if (!draft) return;
    const code = encodeTrail(draft.trail);
    if (findMine(code)?.finished) shareTrail(code, draft.trail.name);
  });
  $('trailsLeft').addEventListener('click', () => move(-1));
  $('trailsRight').addEventListener('click', () => move(1));
  $('trailsMirror').addEventListener('click', () => edit((d) => d.sel >= 0 && (d.trail.blocks[d.sel].mirror = !d.trail.blocks[d.sel].mirror)));
  $('trailsHard').addEventListener('click', () => edit((d) => d.sel >= 0 && (d.trail.blocks[d.sel].hard = !d.trail.blocks[d.sel].hard)));
  $('trailsDel').addEventListener('click', removeSel);
  const name = $<HTMLInputElement>('trailsName');
  name.addEventListener('input', () => {
    if (draft) draft.trail.name = sanitizeName(name.value) || DEFAULT_TRAIL_NAME;
    setupSummary();
    schedule();
  });
  const tidy = () => {
    if (!draft) return;
    draft.trail.name = sanitizeName(name.value) || DEFAULT_TRAIL_NAME;
    name.value = draft.trail.name;
  };
  name.addEventListener('change', tidy);
  name.addEventListener('blur', tidy);
  return sec;
}

// ---------------------------------------------------------------- list
const analyses = new Map<string, { a: TrailAnalysis; m: MapData }>();
function analysisFor(code: string): { a: TrailAnalysis; m: MapData } | null {
  const hit = analyses.get(code);
  if (hit) return hit;
  const t = decodeTrail(code);
  if (!t) return null;
  const a = analyzeTrail(t);
  const v = { a, m: mapData(a.track, a.ranges, a.length) };
  if (analyses.size > 40) analyses.clear();
  analyses.set(code, v);
  return v;
}

function entryEl(e: TrailEntry, i: number): HTMLElement {
  const t = decodeTrail(e.code);
  const row = document.createElement('div');
  row.className = 'card trails-entry';
  row.style.setProperty('--i', String(i));
  const thumb = document.createElement('canvas');
  thumb.className = 'trails-entry-map';
  const info = document.createElement('div');
  info.className = 'trails-entry-info';
  const nm = document.createElement('b');
  nm.textContent = e.name;
  const meta = document.createElement('div');
  meta.className = 'trails-meta';
  const an = analysisFor(e.code);
  meta.textContent = t && an ? `${THEME_NAMES[t.theme]} · ${t.blocks.length} blocks · ~${fmtTime(an.a.seconds)}` : 'Broken trail';
  const st = document.createElement('div');
  st.className = `trails-state${e.finished ? ' done' : ''}`;
  st.innerHTML = e.finished ? `${IC.check}<span></span>` : '<span></span>';
  (st.querySelector('span') as HTMLElement).textContent = e.finished ? `CLEARED · best ${fmtInt(e.best)}` : 'Finish it once to share it';
  info.append(nm, meta, st);
  const btns = document.createElement('div');
  btns.className = 'trails-entry-btns';
  const mk = (cls: string, label: string, icon: string, fn: () => void, disabled = false) => {
    const b = document.createElement('button');
    b.className = `trails-tool ${cls}${disabled ? ' off' : ''}`;
    b.innerHTML = `${icon}<span>${label}</span>`;
    b.addEventListener('click', fn);
    btns.appendChild(b);
    return b;
  };
  mk('trails-play', 'PLAY', IC.play, () => startRun(e.code), !t);
  mk('trails-edit', 'EDIT', IC.edit, () => t && openEditor(t, e.code), !t);
  mk('trails-share', 'SHARE', IC.share, () => (e.finished ? shareTrail(e.code, e.name) : toast('Finish your trail once, then share it!')), !e.finished);
  let armed = 0;
  const del = mk('trails-del', 'DELETE', IC.trash, () => {
    if (!armed) {
      del.classList.add('armed');
      (del.querySelector('span') as HTMLElement).textContent = 'SURE?';
      armed = window.setTimeout(() => {
        armed = 0;
        del.classList.remove('armed');
        (del.querySelector('span') as HTMLElement).textContent = 'DELETE';
      }, 2500);
      return;
    }
    clearTimeout(armed);
    deleteMine(e.code);
    renderList();
    toast('Trail deleted');
  });
  row.append(thumb, info, btns);
  if (an && t) {
    requestAnimationFrame(() => paintCanvas(thumb, an.m, t.blocks.map((b) => blockById(b.id)?.color ?? '#fff'), -1, undefined, -1));
  }
  return row;
}

function renderList(): void {
  const host = $('trailsMine');
  host.innerHTML = '';
  const list = mine();
  $('trailsCount').textContent = `${list.length}/${TRAILS_MAX}`;
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'trails-empty txt';
    p.textContent = 'No trails yet. Tap NEW TRAIL and add some blocks!';
    host.appendChild(p);
  }
  list.forEach((e, i) => host.appendChild(entryEl(e, i)));
}

// ---------------------------------------------------------------- editor
function newTrail(random: boolean): void {
  if (mine().length >= TRAILS_MAX) {
    toast(`You have ${TRAILS_MAX} trails: delete one first`);
    return;
  }
  const seed = randSeed();
  const t: Trail = random ? randomTrail(seed) : { v: 1, name: randomName(seed), theme: 'meadow', pace: 1, seed, blocks: [] };
  openEditor(t, null);
}

/** open the editor on a trail (prevCode = the saved entry it edits, null = a new or copied trail) */
export function openEditor(trail: Trail, prevCode: string | null): void {
  ensure();
  if (game.stage && game.mode !== 'title') session.quit();
  draft = { trail: { ...trail, blocks: trail.blocks.map((b) => ({ ...b })) }, prevCode, sel: -1 };
  view = 'edit';
  $<HTMLInputElement>('trailsName').value = draft.trail.name;
  showView();
  setScreen('trails');
  refresh(true);
}

/** open MY TRAILS */
export function openMaker(): void {
  ensure();
  if (game.stage && game.mode !== 'title') session.quit();
  view = 'list';
  showView();
  setScreen('trails');
}

export function closeMaker(): void {
  stopMapLoop();
  view = 'list';
  if (screen() === 'trails') setScreen('title');
}

/** a block scrolled into view (focus, a tap target) lands below the sticky map + course panel on phones */
function pad(): void {
  const r = root;
  if (!r) return;
  const col = r.querySelector('.trails-col') as HTMLElement | null;
  const sticky = col && r.classList.contains('editing') && getComputedStyle(col).position === 'sticky';
  r.style.scrollPaddingTop = sticky ? `${Math.round(col.getBoundingClientRect().height) + 8}px` : '';
}

function showView(): void {
  $('trailsList').classList.toggle('hidden', view !== 'list');
  $('trailsEditor').classList.toggle('hidden', view !== 'edit');
  $('trailsTitle').textContent = view === 'list' ? 'Trail Maker' : 'Edit trail';
  $('trailsCount').classList.toggle('hidden', view !== 'list');
  root?.classList.toggle('editing', view === 'edit');
  root?.classList.remove('compact');
  root?.scrollTo?.(0, 0);
  requestAnimationFrame(pad);
  if (view === 'list') {
    stopMapLoop();
    renderList();
  }
}

/** save the draft (if it has blocks) and go back to the list */
function back(): void {
  if (view === 'edit' && draft) {
    if (draft.trail.blocks.length > 0) {
      const r = saveMine(draft.trail, draft.prevCode);
      if (!r.ok) toast(`You have ${TRAILS_MAX} trails: delete one first`);
      else draft.prevCode = r.code;
    }
    view = 'list';
    showView();
    return;
  }
  closeMaker();
}

function edit(fn: (d: Draft) => unknown): void {
  if (!draft) return;
  fn(draft);
  refresh();
}

function addBlock(id: string): void {
  if (!draft) return;
  const bl = draft.trail.blocks;
  if (bl.length >= MAX_BLOCKS) {
    toast(`A trail has at most ${MAX_BLOCKS} blocks`);
    return;
  }
  const at = draft.sel >= 0 ? draft.sel + 1 : bl.length;
  bl.splice(at, 0, { id, mirror: false, hard: false });
  draft.sel = at;
  refresh();
}
function move(dir: number): void {
  if (!draft || draft.sel < 0) return;
  const bl = draft.trail.blocks;
  const j = draft.sel + dir;
  if (j < 0 || j >= bl.length) return;
  [bl[draft.sel], bl[j]] = [bl[j], bl[draft.sel]];
  draft.sel = j;
  refresh();
}
function removeSel(): void {
  if (!draft || draft.sel < 0) return;
  draft.trail.blocks.splice(draft.sel, 1);
  draft.sel = Math.min(draft.sel, draft.trail.blocks.length - 1);
  refresh();
}
function select(i: number): void {
  if (!draft) return;
  draft.sel = Math.max(-1, Math.min(draft.trail.blocks.length - 1, i));
  refresh();
}

function testRun(): void {
  if (!draft) return;
  const a = ana ?? analyzeTrail(draft.trail);
  if (!a.ok) {
    toast(a.errors[0]?.message ?? 'This trail does not work yet');
    return;
  }
  const r = saveMine(draft.trail, draft.prevCode);
  if (!r.ok) {
    toast(`You have ${TRAILS_MAX} trails: delete one first`);
    return;
  }
  draft.prevCode = r.code;
  startRun(r.code);
}

/** re-render the editor now (structure) and the analysis on the next frame */
function setupSummary(): void {
  if (!draft) return;
  const t = draft.trail;
  const nm = ($<HTMLInputElement>('trailsName').value || t.name || '').trim();
  $('trailsSetupSum').textContent = `${nm || 'My trail'} · ${THEME_NAMES[t.theme]} · ${PACES[t.pace].name}`;
}

function refresh(now = false): void {
  if (!draft || !root) return;
  const t = draft.trail;
  // worlds, paces
  for (const b of $('trailsThemes').children) (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.theme === t.theme);
  for (const b of $('trailsPace').children) (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.pace === String(t.pace));
  setupSummary();
  // palette (the world filters it)
  const pal = $('trailsPalette');
  const want = blocksFor(t.theme)
    .map((b) => b.id)
    .join('');
  if (pal.dataset.ids !== want) {
    pal.dataset.ids = want;
    pal.innerHTML = '';
    for (const b of BLOCKS) {
      if (!blockAllowed(b, t.theme)) continue;
      const el = document.createElement('button');
      el.className = `trails-blk${b.big ? ' big' : ''}`;
      el.dataset.id = b.id;
      el.style.setProperty('--c', b.color);
      el.innerHTML = `<i>${b.icon}</i><span>${b.name}</span>`;
      el.addEventListener('click', () => addBlock(b.id));
      pal.appendChild(el);
    }
  }
  // strip
  const strip = $('trailsStrip');
  strip.innerHTML = '';
  t.blocks.forEach((tb, i) => {
    const def = blockById(tb.id);
    const c = document.createElement('button');
    c.className = `trails-chip${i === draft!.sel ? ' on' : ''}${tb.mirror ? ' mir' : ''}${tb.hard ? ' hard' : ''}`;
    c.dataset.i = String(i);
    c.style.setProperty('--c', def?.color ?? '#fff');
    c.title = def?.name ?? '?';
    c.innerHTML = `<em>${i + 1}</em><i>${def?.icon ?? ''}</i>${tb.hard ? `<u>${IC.hard}</u>` : ''}`;
    c.addEventListener('click', () => select(i === draft!.sel ? -1 : i));
    strip.appendChild(c);
  });
  if (!t.blocks.length) {
    const p = document.createElement('div');
    p.className = 'trails-hint';
    p.textContent = 'Tap blocks below to build your course';
    strip.appendChild(p);
  }
  // keep the selected chip in view (scroll the strip only, never the page)
  const selEl = strip.querySelector('.on') as HTMLElement | null;
  if (selEl) {
    const l = selEl.offsetLeft - strip.offsetLeft;
    if (l < strip.scrollLeft + 8) strip.scrollLeft = l - 8;
    else if (l + selEl.offsetWidth > strip.scrollLeft + strip.clientWidth - 8) strip.scrollLeft = l + selEl.offsetWidth - strip.clientWidth + 8;
  }
  $('trailsN').textContent = `${t.blocks.length}/${MAX_BLOCKS}`;
  const has = draft.sel >= 0;
  for (const id of ['trailsLeft', 'trailsRight', 'trailsMirror', 'trailsHard', 'trailsDel']) ($(id) as HTMLButtonElement).disabled = !has;
  ($('trailsLeft') as HTMLButtonElement).disabled = !has || draft.sel === 0;
  ($('trailsRight') as HTMLButtonElement).disabled = !has || draft.sel === t.blocks.length - 1;
  $('trailsMirror').setAttribute('aria-pressed', String(has && t.blocks[draft.sel].mirror));
  $('trailsHard').setAttribute('aria-pressed', String(has && t.blocks[draft.sel].hard));
  if (now) analyse();
  else schedule();
}

function schedule(): void {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    analyse();
  });
}

let dotT0 = 0;
function analyse(): void {
  if (!draft) return;
  const t = draft.trail;
  ana = analyzeTrail(t);
  const cv = $<HTMLCanvasElement>('trailsMap');
  map = mapData(ana.track, ana.ranges, ana.length, (cv.clientWidth || 300) / (cv.clientHeight || 180));
  const bad = new Set(ana.errors.map((e) => e.block).filter((b) => b >= 0));
  for (const c of $('trailsStrip').children) {
    const i = Number((c as HTMLElement).dataset.i ?? -1);
    (c as HTMLElement).classList.toggle('bad', bad.has(i));
  }
  const code = encodeTrail(t);
  const entry = findMine(code);
  const badge = $('trailsBadge');
  badge.className = `trails-badge ${ana.ok ? 'ok' : 'err'}`;
  badge.textContent = ana.ok ? (entry?.finished ? 'CLEARED! Share it with a friend' : 'Ready: TEST RUN it!') : (ana.errors[0]?.message ?? 'Not ready');
  const paws = Array.from({ length: 5 }, (_, i) => `<i class="${i < ana!.difficulty ? 'on' : ''}">${PAW}</i>`).join('');
  $('trailsStats').innerHTML = `<span>${fmtDist(ana.length)}</span><span>~${fmtTime(ana.seconds)}</span><span class="trails-paws" title="Difficulty">${paws}</span>`;
  ($('trailsTest') as HTMLButtonElement).classList.toggle('off', !ana.ok);
  $('trailsShare').classList.toggle('hidden', !entry?.finished);
  paintEditorMap();
  startMapLoop();
}

// ---------------------------------------------------------------- minimap painting
const statics = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function fit(cv: HTMLCanvasElement): { w: number; h: number; dpr: number } {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(40, Math.round((cv.clientWidth || 300) * dpr));
  const h = Math.max(40, Math.round((cv.clientHeight || 180) * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return { w, h, dpr };
}
function paintCanvas(cv: HTMLCanvasElement, m: MapData, colors: string[], sel: number, bad: Set<number> | undefined, dot: number): void {
  const { w, h } = fit(cv);
  const c = cv.getContext('2d');
  if (!c) return;
  c.clearRect(0, 0, w, h);
  drawMap(c, w, h, m, { colors, sel, bad, dot });
}
function paintEditorMap(): void {
  if (!draft || !map || !ana) return;
  const cv = $<HTMLCanvasElement>('trailsMap');
  const colors = draft.trail.blocks.map((b) => blockById(b.id)?.color ?? '#fff');
  const bad = new Set(ana.errors.map((e) => e.block).filter((b) => b >= 0));
  // the static layer (redrawn only on edits); the loop blits it and adds the runner dot
  let st = statics.get(cv);
  if (!st) {
    st = document.createElement('canvas');
    statics.set(cv, st);
  }
  const { w, h } = fit(cv);
  st.width = w;
  st.height = h;
  const c = st.getContext('2d');
  if (c) drawMap(c, w, h, map, { colors, sel: draft.sel, bad });
  blit(-1);
}
function blit(u: number): void {
  const cv = $<HTMLCanvasElement>('trailsMap');
  const st = statics.get(cv);
  const c = cv.getContext('2d');
  if (!st || !c || !map) return;
  c.clearRect(0, 0, cv.width, cv.height);
  c.drawImage(st, 0, 0);
  if (u < 0) return;
  // the runner dot (same projection as drawMap)
  const fr = mapFrame(map, cv.width, cv.height);
  const f = Math.min(map.n - 1.001, u * (map.n - 1));
  const a = Math.floor(f);
  const k = f - a;
  const x = fr.ox + (map.xs[a] + (map.xs[a + 1] - map.xs[a]) * k) * fr.sx;
  const y = fr.oy + (map.ys[a] + (map.ys[a + 1] - map.ys[a]) * k) * fr.sy;
  c.fillStyle = '#ff8a2a';
  c.strokeStyle = '#2a1c14';
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(x, y, Math.max(5, Math.min(cv.width, cv.height) / 26), 0, Math.PI * 2);
  c.fill();
  c.stroke();
}
function loop(now: number): void {
  raf = 0;
  if (screen() !== 'trails' || view !== 'edit' || !ana || prefs.reducedMotion) return;
  const period = Math.max(4, Math.min(14, ana.seconds / 8)) * 1000;
  blit(((now - dotT0) % period) / period);
  raf = requestAnimationFrame(loop);
}
function startMapLoop(): void {
  if (raf || prefs.reducedMotion) return;
  dotT0 = performance.now();
  raf = requestAnimationFrame(loop);
}
function stopMapLoop(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

// ---------------------------------------------------------------- keys
function onKey(e: KeyboardEvent): void {
  if (screen() !== 'trails' || document.querySelector('.ugc-overlay')) return;
  const tgt = e.target as HTMLElement | null;
  if (tgt && tgt.tagName === 'INPUT') {
    if (e.code === 'Escape' || e.code === 'Enter') (tgt as HTMLInputElement).blur();
    return;
  }
  if (e.code === 'Escape') {
    e.preventDefault();
    back();
    return;
  }
  if (view !== 'edit' || !draft) return;
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    e.preventDefault();
    const dir = e.code === 'ArrowLeft' ? -1 : 1;
    if (e.shiftKey) move(dir);
    else select(draft.sel < 0 ? (dir > 0 ? 0 : draft.trail.blocks.length - 1) : draft.sel + dir);
  } else if (e.code === 'Delete' || e.code === 'Backspace') {
    e.preventDefault();
    removeSel();
  }
}

function ensure(): void {
  if (root) return;
  root = build();
  // phones: once the palette scrolls, the sticky map shrinks to a strip so more blocks are in reach
  const r = root;
  // (with hysteresis, so the shrink itself never flips it back), and a block scrolled into view lands below the panel
  r.addEventListener(
    'scroll',
    () => {
      const was = r.classList.contains('compact');
      const on = r.classList.contains('editing') && (was ? r.scrollTop > 2 : r.scrollTop > 24);
      if (on !== was) {
        r.classList.toggle('compact', on);
        pad();
      }
    },
    { passive: true },
  );
  addEventListener('resize', pad);
  r.addEventListener('pointerdown', pad, { capture: true, passive: true });
  addEventListener('keydown', onKey);
  addEventListener('resize', () => {
    if (screen() === 'trails' && view === 'edit') schedule();
  });
  onScreen((s) => {
    if (s !== 'trails') stopMapLoop();
    else if (view === 'edit') startMapLoop();
  });
}

/** build the screen at start-up (hidden until opened) */
export function initMaker(): void {
  ensure();
}
