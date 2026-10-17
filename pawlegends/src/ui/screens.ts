/**
 * Out-of-match screens (POC.md §12): title → pick (4 heroes, Paw Trick, difficulty) → match → results, plus the
 * Esc menu and the portrait rotate prompt. DOM overlays over the lobby turntable. English only.
 */
import { DIFFICULTIES } from '../data/bots';
import { HERO_IDS } from '../data/heroes';
import { TRICK_IDS } from '../data/tricks';
import type { Difficulty, HeroId, TrickId } from '../sim/api';
import { chromaOptions, FRAME_NAME, resolveLook, wardrobe, type FrameId, type Look, type Owned } from '../render/cosmetics';
import { HERO_COLOR_CSS } from '../render/palette';
import type { Dare } from '../share/dare';
import { dareText } from '../share/dare';
import { DIFFICULTY_TEXT, HERO_TEXT, TRICK_TEXT } from './heroText';
import { portraitUrl } from '../render/portraits';
import { icon } from './icons';

function el(cls: string, html = ''): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface Choice {
  hero: HeroId;
  trick: TrickId;
  difficulty: Difficulty;
}

// ------------------------------------------------------------------------------------------------- title

export interface TitleOpts {
  firstTime: boolean;
  last: Choice;
  dare: Dare | null;
  muted: boolean;
  /** Store button (web, host store ready). */
  storeOpen?: boolean;
  frame?: FrameId | null;
  title?: string | null;
  /** The lobby hero's portrait (in its look), drawn inside the frame ring. */
  portrait?: string | null;
  onPlay(c: Choice, seed?: number): void;
  onChoose(): void;
  onMute(m: boolean): void;
  onStore?(): void;
  onSettings?(): void;
}

function badge(frame: FrameId | null | undefined, title: string | null | undefined, portrait?: string | null): string {
  if (!frame && !title) return '';
  const face = portrait ? ` style="background-image:url(${portrait})"` : '';
  return `<div class="pl-badge" ${frame ? `data-frame="${frame}"` : ''}><span class="ring${portrait ? ' pic' : ''}"${face}></span><span>${frame ? esc(FRAME_NAME[frame]) : ''}${title ? ` <b>${esc(title)}</b>` : ''}</span></div>`;
}

export function titleScreen(parent: HTMLElement, o: TitleOpts): HTMLElement {
  const root = el('pl-screen pl-title');
  const dare = o.dare;
  const primary = dare
    ? `<button class="pl-btn big" data-a="dare">Accept the dare</button><p class="dare-line">${esc(dareText(dare))} <small>as ${esc(HERO_TEXT[dare.hero].title)}</small></p>`
    : o.firstTime
      ? `<button class="pl-btn big" data-a="clem">Play as Clem</button>`
      : `<button class="pl-btn big" data-a="quick">Play as ${esc(HERO_TEXT[o.last.hero].title)}</button><button class="pl-btn ghost" data-a="choose">Choose hero</button>`;
  root.innerHTML = `
    <div class="pl-title-col">
      <div class="logo"><span class="paw">${icon('paw')}</span><h1>Paw<b>legends</b></h1></div>
      <p class="tag">3v3 cats and dogs. Nine-minute matches.</p>
      <div class="actions">${primary}</div>
      <p class="sub">No account needed. ${o.firstTime ? 'Your first match is against Easy bots.' : ''}</p>
      ${badge(o.frame, o.title, o.portrait)}
    </div>
    <div class="pl-corner">
      ${o.storeOpen ? `<button class="pl-btn ghost small" data-a="store">${icon('crown')}Store</button>` : ''}
      ${o.onSettings ? `<button class="pl-btn ghost small" data-a="settings">Settings</button>` : ''}
      <button class="pl-mute" data-a="mute" aria-label="Sound">${o.muted ? 'Sound off' : 'Sound on'}</button>
    </div>`;
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'clem') o.onPlay({ hero: 'clem', trick: 'pounce', difficulty: 'easy' });
    else if (a === 'quick') o.onPlay(o.last);
    else if (a === 'choose') o.onChoose();
    else if (a === 'dare' && dare) o.onPlay({ hero: dare.hero, trick: dare.trick, difficulty: dare.difficulty }, dare.seed);
    else if (a === 'store') o.onStore?.();
    else if (a === 'settings') o.onSettings?.();
    else if (a === 'mute') {
      const b = root.querySelector('.pl-mute') as HTMLElement;
      const m = b.textContent === 'Sound on';
      b.textContent = m ? 'Sound off' : 'Sound on';
      o.onMute(m);
    }
  });
  parent.appendChild(root);
  return root;
}

// -------------------------------------------------------------------------------------------------- pick

export interface PickOpts {
  initial: Choice;
  /** What the player owns (coats, chromas); the wardrobe row hides when there is only the default. */
  owned?: Owned;
  looks?: Partial<Record<HeroId, Partial<Look>>>;
  onLook?(h: HeroId, look: Look): void;
  onHero(h: HeroId): void;
  onStart(c: Choice): void;
  onBack(): void;
}

export function pickScreen(parent: HTMLElement, o: PickOpts): HTMLElement {
  const root = el('pl-screen pl-pick');
  const c: Choice = { ...o.initial };
  const looks: Partial<Record<HeroId, Partial<Look>>> = { ...(o.looks ?? {}) };
  const lookOf = (h: HeroId): Look | null => (o.owned ? resolveLook(h, o.owned, looks[h]) : null);
  const wardrobeRow = (h: HeroId): string => {
    if (!o.owned) return '';
    const coats = wardrobe(h, o.owned);
    const chromas = chromaOptions(o.owned);
    if (coats.length < 2 && chromas.length < 2) return '';
    const l = lookOf(h) as Look;
    return `<div class="row wardrobe"><span class="lbl">Look</span>${coats
      .map((k) => `<button class="chip ${k.id === l.coat ? 'on' : ''}" data-coat="${esc(k.id ?? '')}" data-from="${k.from}">${esc(k.name)}</button>`)
      .join('')}${chromas.length > 1 ? chromas.map((k) => `<button class="chip chroma ${k.id === l.chroma ? 'on' : ''}" data-chroma="${esc(k.id ?? '')}">${esc(k.name)}</button>`).join('') : ''}</div>`;
  };
  const render = (): void => {
    const t = HERO_TEXT[c.hero];
    root.innerHTML = `
      <div class="pl-pick-col">
        <div class="pl-pick-head"><button class="pl-btn ghost small" data-a="back">Back</button><h2>Choose your legend</h2></div>
        <div class="heroes">${HERO_IDS.map((h) => {
          const x = HERO_TEXT[h];
          const pic = portraitUrl(h, lookOf(h));
          const face = pic ? `<i class="pic" style="background-image:url(${pic})"></i>` : `<i>${esc(x.title.replace('Sir ', '').slice(0, 2))}</i>`;
          return `<button class="hero-card ${h === c.hero ? 'on' : ''}" data-h="${h}" style="--hero:${HERO_COLOR_CSS[h]}">${face}<b>${esc(x.title)}</b><small>${x.side} · ${x.role}</small></button>`;
        }).join('')}</div>
        <div class="detail">
          <h3>${esc(t.title)} <small>${t.side} ${t.role}</small></h3>
          <p class="blurb">${esc(t.blurb)}</p>
          <ul class="kit">
            <li><span class="ico passive">${icon('paw')}</span><span class="t"><b>${esc(t.passive.name)}</b> ${esc(t.passive.text)}</span></li>
            ${t.abilities.map((a, i) => `<li><span class="ico">${icon(a.icon)}</span><span class="t"><kbd>${'QWER'[i]}</kbd> <b>${esc(a.name)}</b> ${esc(a.text)}</span></li>`).join('')}
          </ul>
        </div>
        <div class="row"><span class="lbl">Paw Trick</span>${TRICK_IDS.map((tr) => `<button class="chip ${tr === c.trick ? 'on' : ''}" data-t="${tr}" title="${esc(TRICK_TEXT[tr].text)}">${icon(TRICK_TEXT[tr].icon)}${esc(TRICK_TEXT[tr].name)}</button>`).join('')}</div>
        ${wardrobeRow(c.hero)}
        <div class="row bots"><span class="lbl">Bots</span>${DIFFICULTIES.map((d) => `<button class="chip ${d === c.difficulty ? 'on' : ''}" data-d="${d}">${DIFFICULTY_TEXT[d]}</button>`).join('')}</div>
        <button class="pl-btn big" data-a="start">Play</button>
      </div>`;
  };
  render();
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const h = t.closest<HTMLElement>('[data-h]')?.dataset.h as HeroId | undefined;
    const tr = t.closest<HTMLElement>('[data-t]')?.dataset.t as TrickId | undefined;
    const d = t.closest<HTMLElement>('[data-d]')?.dataset.d as Difficulty | undefined;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const coat = t.closest<HTMLElement>('[data-coat]')?.dataset.coat;
    const chroma = t.closest<HTMLElement>('[data-chroma]')?.dataset.chroma;
    if (h) {
      c.hero = h;
      o.onHero(h);
    }
    if (coat !== undefined || chroma !== undefined) {
      const cur = lookOf(c.hero);
      if (cur) {
        const next: Look = { coat: coat !== undefined ? coat || null : cur.coat, chroma: chroma !== undefined ? ((chroma || null) as Look['chroma']) : cur.chroma };
        looks[c.hero] = next;
        o.onLook?.(c.hero, next);
      }
      return render();
    }
    if (tr) c.trick = tr;
    if (d) c.difficulty = d;
    if (a === 'start') return o.onStart({ ...c });
    if (a === 'back') return o.onBack();
    if (h || tr || d) render();
  });
  parent.appendChild(root);
  return root;
}

// ----------------------------------------------------------------------------------------------- results

export interface ResultsOpts {
  won: boolean;
  seconds: number;
  hero: HeroId;
  difficulty: Difficulty;
  kills: number;
  deaths: number;
  level: number;
  teamKills: [number, number];
  firstWin: boolean;
  best: boolean;
  dareLink: string | null;
  /** What knocked the player out, by killer kind (results tip). */
  deathsBy?: Record<string, number>;
  /** Touch controls (tip wording). */
  touch?: boolean;
  storeOpen?: boolean;
  notifyOpen?: boolean;
  /** Match speed (e2e and the 64× check); the staged reveal runs this much faster. */
  speed?: number;
  onAgain(): void;
  onChange(): void;
  onShare(url: string): void;
  onStore?(): void;
  onNotify?(): void;
}

/** Sudden Death starts at 10:00 (data/timeline.ts TIMELINE.suddenDeath): after it the clock, not the player, ends the match. */
export const SUDDEN_DEATH_S = 600;

/** The line under Victory / Defeat, chosen by the margin (a 1–14 loss is not "so close"). Pure. */
export function resultLine(o: Pick<ResultsOpts, 'won' | 'kills' | 'teamKills' | 'difficulty'>): string {
  const [ours, theirs] = o.teamKills;
  if (o.won) {
    if (o.kills === 0) return 'Your team took the core. Next time, jump into a fight!';
    return ours - theirs >= 6 ? 'A clean sweep. The core is yours.' : 'The core is yours.';
  }
  const gap = theirs - ours;
  if (gap >= 6) return o.difficulty === 'normal' ? 'Tough one. Try Easy bots or a new hero.' : 'Tough one. The tip below helps.';
  if (gap >= 3) return 'They pulled ahead. You can turn the next one.';
  return 'So close. The next one is yours.';
}

/** One concrete tip from how the match went (null when there is nothing useful to say). Pure. */
export function resultTip(o: Pick<ResultsOpts, 'won' | 'kills' | 'deaths' | 'level' | 'seconds' | 'deathsBy' | 'touch'>): string | null {
  const by = o.deathsBy ?? {};
  const towers = (by.tower ?? 0) + (by.core ?? 0);
  const heroes = by.hero ?? 0;
  const nap = o.touch ? 'tap Nap' : 'press B to Nap';
  if (towers >= 2) return `Towers knocked you out ${towers} times. Walk in behind your minions: the tower hits them first.`;
  if (heroes >= 3 && o.deaths >= 4) return `Enemy heroes caught you ${heroes} times. Under a third of your health, step back to your tower or ${nap}.`;
  if (o.level <= 3 && o.seconds >= 300) return 'Stand near enemy minions when they fall: that is where your levels come from.';
  if (o.kills === 0 && !o.won) return `Use your abilities when an enemy hero comes close: they do most of a hero's damage.`;
  if (o.deaths >= 5) return `Under a third of your health, step back or ${nap}: your fountain heals you fast.`;
  return null;
}

export function resultsScreen(parent: HTMLElement, o: ResultsOpts): HTMLElement {
  const root = el(`pl-screen pl-results ${o.won ? 'won' : 'lost'}`);
  const m = Math.floor(o.seconds / 60);
  const s = String(o.seconds % 60).padStart(2, '0');
  const tip = resultTip(o);
  root.innerHTML = `
    <div class="pl-results-col">
      <h1>${o.won ? 'Victory!' : 'Defeat'}</h1>
      <p class="sub">${esc(resultLine(o))}</p>
      <div class="stats">
        <div><b>${m}:${s}</b><small>Match time${o.best && o.seconds < SUDDEN_DEATH_S ? ' · best!' : ''}</small></div>
        <div><b>${o.kills} / ${o.deaths}</b><small>Takedowns / knocked out</small></div>
        <div><b>${o.level}</b><small>Level</small></div>
        <div><b>${o.teamKills[0]} – ${o.teamKills[1]}</b><small>Team takedowns</small></div>
      </div>
      ${tip ? `<p class="pl-result-tip">${icon('paw')}<span>${esc(tip)}</span></p>` : ''}
      ${o.firstWin ? `<div class="unlock">${icon('crown')}<span><b>Sir Brutus Biscuit coat unlocked</b><small>Free, yours to keep.</small></span></div>` : ''}
      <div class="dare ${o.dareLink ? '' : 'hidden'}">
        <p>Dare a friend: <b>${o.dareLink ? esc(dareText({ seed: 0, hero: o.hero, trick: 'pounce', difficulty: o.difficulty, seconds: o.seconds < SUDDEN_DEATH_S ? o.seconds : 0 })) : ''}</b></p>
        <button class="pl-btn ghost" data-a="share">Copy dare link</button>
      </div>
      <div class="actions"><button class="pl-btn big" data-a="again">Play again</button><button class="pl-btn ghost" data-a="change">Change hero</button></div>
      ${o.storeOpen || o.notifyOpen ? `<div class="extras">${o.storeOpen ? `<button class="pl-btn ghost small" data-a="store">${icon('crown')}Store</button>` : ''}${o.notifyOpen ? `<button class="pl-btn ghost small" data-a="notify">Legends Pass: notify me</button>` : ''}</div>` : ''}
    </div>`;
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'again') o.onAgain();
    else if (a === 'change') o.onChange();
    else if (a === 'store') o.onStore?.();
    else if (a === 'notify') o.onNotify?.();
    else if (a === 'share' && o.dareLink) {
      o.onShare(o.dareLink);
      const b = root.querySelector('[data-a="share"]') as HTMLElement;
      b.textContent = 'Link copied!';
    }
  });
  parent.appendChild(root);
  // Staged reveal (§12): the screen opens at End + RESULTS_AFTER_END_MS with the stats and the unlock; the dare link
  // at End + 5 s, "Play again" at End + 10 s (both inert until then, so a stray tap does not skip them).
  requestAnimationFrame(() => root.classList.add('in'));
  const k = 1 / Math.max(1, o.speed ?? 1);
  setTimeout(() => root.classList.add('dare-in'), Math.max(0, RESULTS_REVEAL_MS.dare - RESULTS_AFTER_END_MS) * k);
  setTimeout(() => root.classList.add('actions-in'), Math.max(0, RESULTS_REVEAL_MS.actions - RESULTS_AFTER_END_MS) * k);
  return root;
}

/** The match view keeps playing this long after the end before the results screen opens (matchSession onEnd). */
export const RESULTS_AFTER_END_MS = 2200;
/** POC.md §12: the dare link at End + 5 s, "Play again" at End + 10 s. */
export const RESULTS_REVEAL_MS = Object.freeze({ dare: 5000, actions: 10000 });

// ---------------------------------------------------------------------------------------------- Esc menu

export interface MenuOpts {
  muted: boolean;
  /** Touch: no key list (the pause button opened this menu). */
  touch?: boolean;
  /** Show the scoreboard (touch has no Tab key). */
  onScores?(): void;
  onResume(): void;
  onMute(m: boolean): void;
  onLeave(): void;
}

export function menuScreen(parent: HTMLElement, o: MenuOpts): HTMLElement {
  const root = el('pl-screen pl-menu');
  root.innerHTML = `<div class="card"><h2>Paused</h2>
    <button class="pl-btn big" data-a="resume">Resume</button>
    ${o.onScores ? `<button class="pl-btn ghost" data-a="scores">Scores</button>` : ''}
    <button class="pl-btn ghost" data-a="mute">${o.muted ? 'Sound: off' : 'Sound: on'}</button>
    <button class="pl-btn ghost danger" data-a="leave">Leave match</button>
    ${o.touch ? '' : `<p class="keys"><kbd>RMB</kbd> move / attack · <kbd>A</kbd>+<kbd>LMB</kbd> attack-move · <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> hold to aim, release to cast · <kbd>D</kbd> Paw Trick · <kbd>B</kbd> Nap · <kbd>S</kbd> stop · <kbd>Space</kbd> centre · <kbd>Tab</kbd> scores</p>`}</div>`;
  let muted = o.muted;
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'resume') o.onResume();
    else if (a === 'scores') o.onScores?.();
    else if (a === 'leave') o.onLeave();
    else if (a === 'mute') {
      muted = !muted;
      (root.querySelector('[data-a="mute"]') as HTMLElement).textContent = muted ? 'Sound: off' : 'Sound: on';
      o.onMute(muted);
    }
  });
  parent.appendChild(root);
  return root;
}

/** Portrait prompt on phones (§9: landscape only). Pure CSS decides when it shows. */
export function rotatePrompt(parent: HTMLElement): HTMLElement {
  const r = el('pl-rotate', `<div>${icon('paw')}<b>Turn your phone sideways</b><small>Pawlegends plays in landscape.</small></div>`);
  parent.appendChild(r);
  return r;
}

/** Loading veil between screens. */
export function loadingVeil(parent: HTMLElement, text: string): HTMLElement {
  const r = el('pl-loading', `<div class="spin">${icon('paw')}</div><b>${esc(text)}</b>`);
  parent.appendChild(r);
  return r;
}
