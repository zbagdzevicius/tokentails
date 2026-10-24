// Intro card: the city is loaded behind it (street-level shot), objectives listed, PLAY starts the clock.
import { cats, levelList, levels, money, prepareLevel, screens, type LevelId } from '../core/api';
import { $, ICON, catFace, esc, onTap } from './dom';
import { threatList } from './objectives';
import { go, run } from './router';
import { loadoutStats, selectedCat, store } from './store';

const el = $('intro');
let levelId: LevelId = 'meowhattan';

function render(): void {
  const l = levels.get(levelId);
  const s = store.get();
  const p = s.levels[l.id];
  const d = cats.get(run.catId);
  const n = levelList().length;
  const obj = l.objectives
    .map((o, i) => {
      const done = !!p?.objectives[i];
      return `<li class="${done ? 'done' : ''}">${ICON.star(done)}<span>${esc(o.label)}</span>${done ? '<em>earned</em>' : ''}</li>`;
    })
    .join('');
  const threats = threatList(l);
  // the final boss is a wall for a fresh tabby: say what helps before the first try
  const up = s.cats[run.catId]?.upgrades;
  const rec = l.boss?.endsLevel && (up?.fur ?? 0) < 2 && run.catId !== 'chonk' ? '<b>TOUGH FIGHT</b> Recommended: Big Biscuit, or FUR level 2 (CATS).' : '';
  $('introBody').innerHTML = `
    <div class="ilabel txt">CITY ${l.index + 1} OF ${n} · ${l.duration} SECONDS</div>
    <h2 class="iname txt">${esc(l.name)}</h2>
    <p class="itag">${esc(l.tagline)}</p>
    <ul class="iobj">${obj}</ul>
    ${threats.length ? `<div class="ithreat"><b>WATCH OUT</b> ${threats.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="ifish"><b>FISH TRUCKS</b> refill patience: follow the blue FISH arrow when you get wet.</div>
    ${rec ? `<div class="irec">${rec}</div>` : ''}
    ${p?.plays ? `<div class="ibest">Best ${money(p.best)}</div>` : ''}
    <button class="icat" id="introCat" style="--c:${d.color}">${catFace(d.color)}<span><b>${esc(d.name)}</b><small>ULTRA: ${esc(d.ultraName)} · change</small></span></button>`;
  onTap($('introCat'), () => go.cats());
}

export function initIntro(): void {
  screens.register({
    id: 'intro',
    el,
    onShow: (params) => {
      if (params) levelId = params as LevelId;
      run.levelId = levelId;
      run.catId = selectedCat();
      // the city loads first so it shows behind the card
      prepareLevel(levelId, run.catId, loadoutStats(run.catId));
      render();
      $('introPlay').focus({ preventScroll: true });
    },
  });
  onTap($('introPlay'), () => go.play());
  onTap($('introBack'), () => go.map(levelId));
}
