// Cat select and upgrades. Owned by the META-UI lane. Data from the cats registry + cats/economy + cats/stats.
import { uiBack, uiBuy, uiClick, uiDeny, uiFanfare } from '../audio/ui-sfx';
import { buyCat, buyUpgrade, canBuyCat, canBuyUpgrade, catCost, upgradeCost } from '../cats/economy';
import { effectiveStats } from '../cats/stats';
import { CAT_ORDER, UPGRADE_IDS, UPGRADE_MAX, cats, game, prepareLevel, screens, type CatDef, type CatId, type CatStats, type UpgradeId } from '../core/api';
import { $, ICON, catFace, esc, onTap, toast, wiggle } from './dom';
import { loadoutStats, selectedCat, store } from './store';

const el = $('cats');
const tabs = $('catTabs');
const panel = $('catPanel');
let focus: CatId = 'tabby';

const UPG: Record<UpgradeId, [string, string]> = {
  power: ['POWER', 'Harder swats, bigger pounce'],
  speed: ['SPEED', 'Faster paws and zoomies'],
  fur: ['FUR', 'More patience, shrugs off water'],
  ultra: ['ULTRA', 'Charges faster, lasts longer'],
};

/** Stat bars: what a player cares about, derived from CatStats. */
const METRICS: [string, (s: CatStats) => number][] = [
  ['SPEED', (s) => s.walk + s.zoom * 0.3],
  ['SWAT', (s) => (s.swatPower * s.swatRadius) / s.swatCd],
  ['POUNCE', (s) => s.pounceR / Math.sqrt(s.pounceCd)],
  ['PATIENCE', (s) => s.patienceMax / s.wetResist],
  ['ULTRA', (s) => s.ultraCharge * s.ultraTime],
];
const MAXED: Record<UpgradeId, number> = { power: UPGRADE_MAX, speed: UPGRADE_MAX, fur: UPGRADE_MAX, ultra: UPGRADE_MAX };

function metricMax(): number[] {
  const all = CAT_ORDER.filter((id) => cats.has(id)).map((id) => effectiveStats(cats.get(id).base, MAXED));
  return METRICS.map(([, f]) => Math.max(...all.map(f)));
}

const eyeOf: Partial<Record<CatId, string>> = { tabby: '#9be36a', chonk: '#ffd24a', shadow: '#ffe14a', siamese: '#5cc8ff' };

function renderTabs(): void {
  const s = store.get();
  const selCat = selectedCat();
  tabs.innerHTML = CAT_ORDER.filter((id) => cats.has(id))
    .map((id) => {
      const d = cats.get(id);
      const owned = s.cats[id].owned;
      const state = id === selCat ? 'SELECTED' : owned ? 'OWNED' : `${ICON.leaf()} ${catCost(id)}`;
      return `<button class="ctab ${id === focus ? 'on' : ''} ${owned ? '' : 'locked'} ${canBuyCat(s, id) ? 'afford' : ''}" data-id="${id}" style="--c:${d.color}">
        ${catFace(owned ? d.color : '#6b625a', owned ? (eyeOf[id] ?? '#ffd24a') : '#3a332e')}
        <b class="txt">${esc(d.name)}</b><small>${state}</small></button>`;
    })
    .join('');
  tabs.querySelectorAll<HTMLButtonElement>('.ctab').forEach((b) => {
    const id = b.dataset.id as CatId;
    onTap(b, () => setFocus(id, true));
    b.addEventListener('focus', () => setFocus(id, false));
  });
}

function renderPanel(): void {
  const s = store.get();
  const d: CatDef = cats.get(focus);
  const prog = s.cats[focus];
  const owned = prog.owned;
  const isSel = selectedCat() === focus;
  const st = effectiveStats(d.base, prog.upgrades);
  const mx = metricMax();
  const bars = METRICS.map(([name, f], i) => {
    const v = f(st) / mx[i];
    const b = f(effectiveStats(d.base, {})) / mx[i];
    return `<div class="stat"><span>${name}</span><i><em style="transform:scaleX(${b.toFixed(3)})"></em><u style="transform:scaleX(${v.toFixed(3)})"></u></i></div>`;
  }).join('');
  const cost = catCost(focus);
  const action = owned
    ? isSel
      ? `<button class="go small sel" id="catAct" data-primary>${ICON.check()} SELECTED</button>`
      : `<button class="go small" id="catAct" data-primary>SELECT</button>`
    : `<button class="go small buy" id="catAct" data-primary ${canBuyCat(s, focus) ? '' : 'aria-disabled="true"'}>BUY ${ICON.leaf()} ${cost}</button>`;
  const need = !owned && !canBuyCat(s, focus) ? `<div class="need">${cost - s.catnip} more catnip. Wreck cities to earn it.</div>` : '';
  const ups = UPGRADE_IDS.map((u) => {
    const lv = prog.upgrades[u];
    const c = upgradeCost(focus, u, lv);
    const can = canBuyUpgrade(s, focus, u);
    const pips = Array.from({ length: UPGRADE_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    const btn = c === null ? `<button class="ubtn max" aria-disabled="true" data-up="${u}">MAX</button>` : `<button class="ubtn" data-up="${u}" ${can ? '' : 'aria-disabled="true"'}>${ICON.leaf()} ${c}</button>`;
    return `<div class="up ${owned ? '' : 'dim'}"><div class="uname"><b>${UPG[u][0]}</b><small>${UPG[u][1]}</small></div><div class="pips">${pips}</div>${btn}</div>`;
  }).join('');
  panel.innerHTML = `
    <div class="cinfo" style="--c:${d.color}">
      <div class="chead"><b class="txt">${esc(d.name)}</b><span class="ult">ULTRA: ${esc(d.ultraName)}</span></div>
      <p class="blurb">${esc(d.blurb)}</p>
      <div class="stats2">${bars}</div>
      <div class="cact">${action}${need}</div>
    </div>
    <div class="ups">${owned ? '' : '<div class="uphint">Buy this cat to upgrade it</div>'}${ups}</div>`;
  onTap($('catAct'), () => act($('catAct')), null);
  panel.querySelectorAll<HTMLButtonElement>('.ubtn').forEach((b) => onTap(b, () => upgrade(b.dataset.up as UpgradeId, b), null));
  $('catNip').innerHTML = `${ICON.leaf()} ${s.catnip}`;
}

function setFocus(id: CatId, moveFocus: boolean): void {
  if (focus === id && !moveFocus) return;
  focus = id;
  tabs.querySelectorAll('.ctab').forEach((t) => t.classList.toggle('on', (t as HTMLElement).dataset.id === id));
  renderPanel();
}

/** Show the chosen cat strolling behind the menus. */
function previewCat(id: CatId): void {
  if (game.mode !== 'title' || !game.level) return;
  prepareLevel(game.level.id, id, loadoutStats(id));
}

function act(b: HTMLElement): void {
  const s = store.get();
  if (!s.cats[focus].owned) {
    if (!canBuyCat(s, focus)) {
      uiDeny();
      wiggle(b);
      return;
    }
    store.set({ ...buyCat(s, focus), selectedCat: focus });
    uiBuy();
    setTimeout(uiFanfare, 250);
    toast(`${cats.get(focus).name} joins the rampage!`);
    previewCat(focus);
  } else if (selectedCat() !== focus) {
    uiClick();
    store.set({ ...s, selectedCat: focus });
    previewCat(focus);
  } else return;
  renderTabs();
  renderPanel();
  ($('catAct') as HTMLElement).focus({ preventScroll: true });
}

function upgrade(u: UpgradeId, b: HTMLElement): void {
  const s = store.get();
  if (!canBuyUpgrade(s, focus, u)) {
    uiDeny();
    wiggle(b);
    return;
  }
  store.set(buyUpgrade(s, focus, u));
  uiBuy();
  renderTabs();
  renderPanel();
  const nb = panel.querySelector<HTMLElement>(`.ubtn[data-up="${u}"]`);
  nb?.focus({ preventScroll: true });
  const pips = nb?.parentElement?.querySelectorAll('.pips i.on');
  pips?.[pips.length - 1]?.animate([{ transform: 'scale(2.2)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,1.6,.4,1)' });
}

export function initCats(): void {
  screens.register({
    id: 'cats',
    el,
    onShow: () => {
      focus = selectedCat();
      renderTabs();
      renderPanel();
      ($('catAct') as HTMLElement | null)?.focus({ preventScroll: true });
    },
  });
  onTap($('catsBack'), () => screens.back(), uiBack);
}

/** For tests / results: how many cats the player could buy right now. */
export const affordableCats = () => CAT_ORDER.filter((id) => canBuyCat(store.get(), id));
