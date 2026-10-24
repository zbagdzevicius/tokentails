// ?t=<code> links (TRAILS lane): "A trail for you" overlay with PLAY / OPEN IN MAKER / SAVE COPY / Not now.
// The code is untrusted: decodeTrail + validateTrail, the name is already sanitised and only ever set as textContent.
import { TRAILS_MAX } from '../meta/save';
import { blockById } from '../stages/blocks';
import { ugc } from '../ugc/contract';
import { openOverlay, toast } from '../ugc/hub';
import { clearParams, readParams } from '../ugc/sharekit';
import { play } from '../ui/flow';
import { fmtDist, fmtTime } from '../ui/format';
import { decodeTrail, encodeTrail, PACES, type Trail } from './code';
import { IC } from './icons';
import { openEditor } from './maker';
import { drawMap, mapData } from './minimap';
import { findMine, mine, saveMine } from './store';
import { analyzeTrail, THEME_NAMES } from './validate';

let open: { close(): void } | null = null;

/** show the overlay for a trail code; false = the code is broken or not a fair trail */
export function showTrailLink(code: string): boolean {
  const t = decodeTrail(code);
  if (!t) return false;
  const a = analyzeTrail(t);
  if (!a.ok) return false;
  const canon = encodeTrail(t);
  open?.close();
  const ov = openOverlay('trails-link');
  const card = document.createElement('div');
  card.className = 'card trails-linkcard';
  card.innerHTML = `
<div class="trails-tag">${IC.maker}<span>A TRAIL FOR YOU</span></div>
<h2 class="trails-linkname"></h2>
<canvas class="trails-linkmap" aria-label="Trail map"></canvas>
<div class="trails-linkmeta"></div>
<div class="trails-linkchips"></div>
<div class="row"><button id="trailsLinkPlay" class="btn gold big"><span class="ugc-ico">${IC.play}</span>PLAY</button></div>
<div class="row">
  <button id="trailsLinkOpen" class="btn alt small"><span class="ugc-ico">${IC.edit}</span>OPEN IN MAKER</button>
  <button id="trailsLinkSave" class="btn alt small"><span class="ugc-ico">${IC.copy}</span>SAVE COPY</button>
</div>
<button id="trailsLinkSkip" class="trails-skip">Not now</button>`;
  ov.el.appendChild(card);
  (card.querySelector('.trails-linkname') as HTMLElement).textContent = t.name;
  if (t.author) {
    const by = document.createElement('div');
    by.className = 'trails-by';
    by.textContent = `by ${t.author}`;
    card.querySelector('.trails-linkname')?.after(by);
  }
  (card.querySelector('.trails-linkmeta') as HTMLElement).textContent =
    `${THEME_NAMES[t.theme]} · ${PACES[t.pace].name} · ${t.blocks.length} blocks · ${fmtDist(a.length)} · ~${fmtTime(a.seconds)} · difficulty ${a.difficulty}/5`;
  const chips = card.querySelector('.trails-linkchips') as HTMLElement;
  for (const b of t.blocks) {
    const def = blockById(b.id);
    if (!def) continue;
    const i = document.createElement('i');
    i.className = `trails-mini${b.mirror ? ' mir' : ''}${b.hard ? ' hard' : ''}`;
    i.style.setProperty('--c', def.color);
    i.title = def.name;
    i.innerHTML = def.icon;
    chips.appendChild(i);
  }
  const cv = card.querySelector('canvas') as HTMLCanvasElement;
  requestAnimationFrame(() => {
    const m = mapData(a.track, a.ranges, a.length, (cv.clientWidth || 300) / (cv.clientHeight || 160));
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round((cv.clientWidth || 300) * dpr);
    cv.height = Math.round((cv.clientHeight || 160) * dpr);
    const c = cv.getContext('2d');
    if (c) drawMap(c, cv.width, cv.height, m, { colors: t.blocks.map((b) => blockById(b.id)?.color ?? '#fff'), sel: -1 });
  });
  const close = () => {
    removeEventListener('keydown', onKey, true);
    ov.close();
    if (open === handle) open = null;
  };
  const handle = { close };
  open = handle;
  // the overlay owns the keyboard while it is open (the title's Enter/Space must not open the stage map under it)
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.stopPropagation();
      if (!(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (e.code === 'Enter') (card.querySelector('#trailsLinkPlay') as HTMLElement).click();
      }
    }
  };
  addEventListener('keydown', onKey, true);
  (card.querySelector('#trailsLinkPlay') as HTMLElement).addEventListener('click', () => {
    const r = ugc.loadTrail(canon);
    close();
    if (r.ok) play('trail');
    else toast(r.error);
  });
  (card.querySelector('#trailsLinkOpen') as HTMLElement).addEventListener('click', () => {
    close();
    openEditor(t, findMine(canon) ? canon : null);
  });
  (card.querySelector('#trailsLinkSave') as HTMLElement).addEventListener('click', () => saveCopy(t, canon));
  (card.querySelector('#trailsLinkSkip') as HTMLElement).addEventListener('click', close);
  return true;
}

function saveCopy(t: Trail, code: string): void {
  if (findMine(code)) {
    toast('Already in your trails');
    return;
  }
  if (mine().length >= TRAILS_MAX) {
    toast(`You have ${TRAILS_MAX} trails: delete one first`);
    return;
  }
  saveMine(t, null);
  toast('Saved to your trails!');
}

export const closeTrailLink = (): void => open?.close();

/** at start-up: a ?t= link opens the overlay (a ?c= challenge wins: SHARE loads its trail through ugc.loadTrail) */
export function handleTrailParam(): void {
  const p = readParams();
  const code = p.get('t');
  if (code === null) return;
  if (!p.has('c')) {
    if (!showTrailLink(code)) toast('That trail link is broken', 2600);
  }
  clearParams(['t']);
}
