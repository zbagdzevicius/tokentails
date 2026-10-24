// City map: the campaign as nodes on a winding paw-print trail. Owned by the META-UI lane.
import { uiDeny } from '../audio/ui-sfx';
import { isLevelUnlocked, totalStars } from '../campaign/stars';
import { levelList, money, screens, type LevelDef, type LevelId } from '../core/api';
import { $, ICON, esc, onTap, wiggle } from './dom';
import { go } from './router';
import { store } from './store';

const el = $('map');
const board = $('mapBoard');
const detail = $('mapDetail');
let sel: LevelId = 'meowhattan';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** What it takes to unlock a level, in words. */
export function lockText(level: LevelDef, all: LevelDef[]): string {
  const s = store.get();
  const prev = all.find((l) => l.index === level.index - 1);
  const parts: string[] = [];
  if (prev && (s.levels[prev.id]?.stars ?? 0) < 1) parts.push(`1★ in ${prev.name}`);
  const tot = totalStars(s);
  if (tot < level.unlockStars) parts.push(`${level.unlockStars}★ total (you have ${tot})`);
  return parts.length ? `Needs ${parts.join(' and ')}` : '';
}

const starsHtml = (n: number) => `${ICON.star(n >= 1)}${ICON.star(n >= 2)}${ICON.star(n >= 3)}`;

function nodePos(i: number, n: number, tall: boolean): [number, number] {
  const t = n > 1 ? i / (n - 1) : 0.5;
  return tall ? [i % 2 ? 0.7 : 0.3, 0.9 - 0.8 * t] : [0.09 + 0.82 * t, i % 2 ? 0.3 : 0.7];
}

function render(): void {
  const s = store.get();
  const all = levelList();
  const W = board.clientWidth || 1;
  const H = board.clientHeight || 1;
  const tall = W / H < 1.05;
  const pos = all.map((_, i) => nodePos(i, all.length, tall));
  let html = '';
  // paw prints between the nodes, along a gentle curve
  for (let i = 0; i < all.length - 1; i++) {
    const [x0, y0] = pos[i];
    const [x1, y1] = pos[i + 1];
    const ax = x0 * W;
    const ay = y0 * H;
    const bx = x1 * W;
    const by = y1 * H;
    const mx = (ax + bx) / 2 + (by - ay) * 0.18;
    const my = (ay + by) / 2 - (bx - ax) * 0.18;
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(3, Math.min(9, Math.floor(len / 46)));
    const open = isLevelUnlocked(all[i + 1], s, all);
    for (let k = 1; k <= n; k++) {
      const t = 0.14 + (0.72 * (k - 1)) / Math.max(1, n - 1);
      const px = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx;
      const py = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by;
      const tx = 2 * (1 - t) * (mx - ax) + 2 * t * (bx - mx);
      const ty = 2 * (1 - t) * (my - ay) + 2 * t * (by - my);
      const ang = Math.atan2(ty, tx);
      const side = k % 2 ? 7 : -7;
      const ox = -Math.sin(ang) * side;
      const oy = Math.cos(ang) * side;
      html += `<i class="print ${open ? 'open' : ''}" style="transform:translate(${(px + ox).toFixed(1)}px,${(py + oy).toFixed(1)}px) rotate(${(ang + Math.PI / 2).toFixed(2)}rad)">${ICON.paw()}</i>`;
    }
  }
  all.forEach((l, i) => {
    const p = s.levels[l.id];
    const open = isLevelUnlocked(l, s, all);
    const [x, y] = pos[i];
    const fresh = open && !p?.plays;
    html += `<button class="node ${open ? '' : 'locked'} ${l.id === sel ? 'sel' : ''} ${fresh ? 'fresh' : ''}" data-id="${l.id}" ${open ? '' : 'aria-disabled="true"'}
      style="left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%;--c:${hex(l.world.theme.sky)};--g:${hex(l.world.theme.palette[0] ?? 0x888888)}"
      aria-label="${esc(l.name)}">
      <span class="disc txt">${open ? i + 1 : ICON.lock()}</span>
      <span class="nname txt">${esc(l.name)}</span>
      <span class="nstars">${starsHtml(p?.stars ?? 0)}</span>
      ${fresh ? `<span class="here txt">${i === 0 ? 'START HERE' : 'NEW!'}</span>` : ''}
    </button>`;
  });
  board.innerHTML = html;
  board.querySelectorAll<HTMLButtonElement>('.node').forEach((b) => {
    const id = b.dataset.id as LevelId;
    b.addEventListener('focus', () => select(id, false));
    onTap(b, () => {
      if (sel === id) enter(id, b);
      else select(id, true);
    });
  });
  renderDetail();
  $('mapNip').innerHTML = `${ICON.leaf()} ${s.catnip}`;
  $('mapStars').innerHTML = `${ICON.star(true)} ${totalStars(s)} / ${all.length * 3}`;
}

function renderDetail(): void {
  const s = store.get();
  const all = levelList();
  const l = all.find((x) => x.id === sel) ?? all[0];
  const open = isLevelUnlocked(l, s, all);
  const p = s.levels[l.id];
  detail.innerHTML = `
    <div class="dhead"><b class="txt">${esc(l.name)}</b><span class="dstars">${starsHtml(p?.stars ?? 0)}</span></div>
    <div class="dtag">${esc(l.tagline)}</div>
    <div class="dmeta">${p?.plays ? `Best ${money(p.best)} · played ${p.plays}×` : 'Not played yet'} · ${l.duration} s</div>
    ${open ? `<button class="go small" id="mapGo" data-primary>RAMPAGE HERE</button>` : `<div class="dlock">${ICON.lock()} ${esc(lockText(l, all))}</div>`}`;
  const goBtn = document.getElementById('mapGo');
  if (goBtn) onTap(goBtn, () => go.intro(l.id));
}

function select(id: LevelId, focus: boolean): void {
  if (sel === id) return;
  sel = id;
  board.querySelectorAll('.node').forEach((n) => n.classList.toggle('sel', (n as HTMLElement).dataset.id === id));
  renderDetail();
  if (focus) (board.querySelector(`.node[data-id="${id}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
}

function enter(id: LevelId, b: HTMLElement): void {
  const all = levelList();
  const l = all.find((x) => x.id === id)!;
  if (!isLevelUnlocked(l, store.get(), all)) {
    uiDeny();
    wiggle(b);
    return;
  }
  go.intro(id);
}

/** The city to highlight by default: the furthest unlocked one that still has stars to win. */
function defaultSel(): LevelId {
  const s = store.get();
  const all = levelList();
  let pick = all[0].id;
  for (const l of all) if (isLevelUnlocked(l, s, all) && (s.levels[l.id]?.stars ?? 0) < 3) pick = l.id;
  return pick;
}

export function initMap(): void {
  screens.register({
    id: 'map',
    el,
    onShow: (params) => {
      sel = (params as LevelId | undefined) ?? defaultSel();
      render();
      requestAnimationFrame(() => {
        render(); // board size is known now
        (board.querySelector('.node.sel') as HTMLElement | null)?.focus({ preventScroll: true });
      });
    },
  });
  onTap($('mapBack'), () => go.title());
  onTap($('mapCats'), () => go.cats());
  addEventListener('resize', () => screens.current() === 'map' && render());
}
