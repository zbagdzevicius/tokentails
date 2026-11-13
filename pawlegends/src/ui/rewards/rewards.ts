/**
 * Rewards cloud UI (gap plan P2): the account progress sync loop, the Lucky Treat chest (its odds open BEFORE it
 * does), the under-16 Daily Treat, the Welcome Path strip and toasts, and the mastery chips on champion cards.
 *
 * Sync: `RewardsCloud.onHost` takes the host's `session` (boot, sign-in, sign-out) and a `save-result` that saved (the
 * `/live` save may have paid a grant) and runs one `progress.sync` (meta/progressCloud.ts). A chest is never shown in a
 * match: it waits for Home or the results screen (`<html data-screen>`), one at a time. Nothing here sells anything,
 * links to a store or shows a price; the app build shows exactly the same.
 */
import '../css/rewards.css';
import type { ApiArgs, ApiOp, ApiResult } from '../../embed/api';
import type { HostMessage } from '../../embed/bridge';
import type { HeroId } from '../../sim/api';
import { LUCKY_DEFAULT, RARITY_NAME, untilFloor, type Grant, type LuckyTable } from '../../meta/lucky';
import { masteryOf, masteryToNext, MASTERY_MAX } from '../../meta/mastery';
import { applyView, buildBlob, loadCloud, markOpened, parseView, saveCloud, unopened } from '../../meta/progressCloud';
import { treatReward } from '../../meta/treats';
import { giftLabel, WELCOME_DAYS, WELCOME_PATH, welcomeVisible } from '../../meta/welcome';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The blob as one bridge arg (embed/api.ts allows `blob` up to this long). */
export const BLOB_ARG_MAX = 30000;

export interface RewardsDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  /** A host session exists (signed in, or a guest who has played): only then is there an account to sync. */
  eligible(): boolean;
  /** Local progress changed (redraw Home). */
  onChange(): void;
  root?: HTMLElement;
}

const itemName = (id: string): string => treatReward(id)?.name ?? 'A new look';

// ------------------------------------------------------------------------------------------------------- sync loop

export class RewardsCloud {
  private busy: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Grant[] = [];
  private obs: MutationObserver | null = null;
  private open: HTMLElement | null = null;

  constructor(private readonly deps: RewardsDeps) {
    installRewardsClicks();
    if (typeof MutationObserver === 'function')
      this.obs = new MutationObserver(() => this.flush());
    this.obs?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-screen'] });
  }

  /** The app's one host hook: a session (boot or sign-in) or a saved match. */
  onHost(m: HostMessage): void {
    if (m.type === 'session') this.later(300);
    else if (m.type === 'save-result' && m.status === 'saved') this.later(600);
  }

  later(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync();
    }, ms);
  }

  /** One round trip: send this device's blob, fold the account's merge back, apply new grants. */
  sync(): Promise<void> {
    if (!this.deps.eligible()) return Promise.resolve();
    if (this.busy) {
      this.again = true;
      return this.busy;
    }
    this.busy = (async () => {
      const { blob, local } = buildBlob();
      let s = JSON.stringify(blob);
      // an oversized blob drops the settings first (never progress)
      if (s.length > BLOB_ARG_MAX) s = JSON.stringify({ ...blob, prefs: { at: 0, data: {} } });
      if (s.length > BLOB_ARG_MAX) return;
      const r = await this.deps.api('progress.sync', { blob: s });
      const v = r.ok ? parseView(r.body) : null;
      if (!v) {
        saveCloud(local);
        return;
      }
      const out = applyView(v, local);
      for (const g of out.fresh) if (g.kind === 'welcome') welcomeToast(g, this.deps.root);
      this.queue.push(...unopened(out.fresh));
      if (out.changed) this.deps.onChange();
      // tell the account which grants this device applied
      if (out.fresh.length) this.again = true;
      this.flush();
    })()
      .catch(() => undefined)
      .finally(() => {
        this.busy = null;
        if (this.again) {
          this.again = false;
          this.later(1500);
        }
      });
    return this.busy;
  }

  /** Show the next unopened chest when Home or the results screen is up (never in a match or the pick). */
  flush(): void {
    if (this.open?.isConnected || !this.queue.length) return;
    const screen = document.documentElement.dataset.screen;
    if (screen !== 'title' && screen !== 'results') return;
    const g = this.queue.shift()!;
    this.open = openLuckyChest(g, loadCloud().lucky ?? LUCKY_DEFAULT, () => {
      this.open = null;
      this.flush();
    });
  }

  dispose(): void {
    this.obs?.disconnect();
    if (this.timer) clearTimeout(this.timer);
  }
}

// ------------------------------------------------------------------------------------------------------- dialogs

function trapClose(root: HTMLElement, close: () => void): void {
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
}

/** The CSS chest (no image asset): lid, body, a paw clasp. */
const CHEST = '<span class="rw-chest-lid" aria-hidden="true"></span><span class="rw-chest-body" aria-hidden="true"><i class="rw-clasp"></i></span><span class="rw-burst" aria-hidden="true"></span>';

/**
 * The Lucky Treat chest (or the under-16 Daily Treat). Sealed first: Open and Odds. Open plays the reveal and names the
 * reward and its rarity. Returns the dialog; `onDone` runs when it closes.
 */
export function openLuckyChest(g: Grant, table: LuckyTable, onDone?: () => void, parent: HTMLElement = document.body): HTMLElement {
  const daily = g.kind === 'treat';
  const root = document.createElement('div');
  root.className = 'rw-scrim';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', daily ? 'Daily Treat' : 'Lucky Treat');
  root.dataset.testid = 'lucky-treat';
  const opener = document.activeElement as HTMLElement | null;
  root.innerHTML = `<div class="rw-card sealed${daily ? ' daily' : ''}">
    <p class="rw-kick">First win today</p>
    <h2 class="rw-title">${daily ? 'Daily Treat' : 'Lucky Treat'}</h2>
    <button type="button" class="rw-chest" data-k="open" aria-label="${daily ? 'Open the Daily Treat' : 'Open the Lucky Treat'}">${CHEST}</button>
    <p class="rw-what" aria-live="polite">${daily ? 'A treat for your first win of the day.' : 'Earned, never sold. Cosmetics only.'}</p>
    <div class="rw-actions">
      <button type="button" class="pl-btn" data-k="open">Open</button>
      ${daily ? '' : '<button type="button" class="pl-btn ghost small" data-k="odds" data-testid="lucky-odds">See odds</button>'}
    </div>
  </div>`;
  const card = root.querySelector('.rw-card') as HTMLElement;
  let opened = false;
  const close = (): void => {
    markOpened(g.id);
    root.remove();
    opener?.focus?.();
    onDone?.();
  };
  const reveal = (): void => {
    if (opened) return;
    opened = true;
    markOpened(g.id);
    const rarity = daily ? 'daily' : (g.rarity ?? 'common');
    card.classList.remove('sealed');
    card.classList.add('opened', `r-${rarity}`);
    const what = g.item ? itemName(g.item) : `+${g.xp ?? 0} Treat XP`;
    const tag = daily ? 'Daily Treat' : `${RARITY_NAME[g.rarity ?? 'common']}${g.floor ? ' · lucky 10th' : ''}`;
    (card.querySelector('.rw-kick') as HTMLElement).textContent = tag;
    (card.querySelector('.rw-title') as HTMLElement).textContent = what;
    (card.querySelector('.rw-what') as HTMLElement).textContent = g.item ? 'Added to your collection.' : g.xp && !daily ? 'You had every look in this tier, so it pays Treat XP.' : 'Added to your Treat Track.';
    const chest = card.querySelector('.rw-chest') as HTMLButtonElement;
    chest.disabled = true;
    chest.setAttribute('aria-label', what);
    (card.querySelector('.rw-actions') as HTMLElement).innerHTML = `<button type="button" class="pl-btn" data-k="close">Nice!</button>${daily ? '' : '<button type="button" class="pl-btn ghost small" data-k="odds">Odds</button>'}`;
    (card.querySelector('[data-k="close"]') as HTMLElement).focus();
  };
  root.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k;
    if (k === 'open') reveal();
    else if (k === 'odds') openLuckyOdds(table, parent);
    else if (k === 'close') close();
    else if (e.target === root && opened) close();
  });
  trapClose(root, () => (opened ? close() : reveal()));
  parent.appendChild(root);
  (root.querySelector('.pl-btn[data-k="open"]') as HTMLElement | null)?.focus();
  return root;
}

/** The odds sheet: the published table, the every-10th floor, and the rules. Opens over anything (also the chest). */
export function openLuckyOdds(table: LuckyTable = loadCloud().lucky ?? LUCKY_DEFAULT, parent: HTMLElement = document.body): HTMLElement {
  document.querySelector('.rw-odds-scrim')?.remove();
  const root = document.createElement('div');
  root.className = 'rw-scrim rw-odds-scrim';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'rw-odds-h');
  root.dataset.testid = 'lucky-odds-sheet';
  const opener = document.activeElement as HTMLElement | null;
  const rows = table.odds
    .map((r) => `<tr class="r-${r.rarity}"><th scope="row"><i class="rw-gem" aria-hidden="true"></i>${RARITY_NAME[r.rarity]}</th><td class="pct">${r.pct % 1 ? r.pct.toFixed(1) : r.pct}%</td><td>${r.rarity === 'common' ? 'Palette coats' : r.rarity === 'rare' ? 'Treat Track coats, Wave emote' : 'Champion frames and titles'}<small>${r.items} looks · all owned: +${r.dupXp} Treat XP</small></td></tr>`)
    .join('');
  const n = untilFloor(table);
  root.innerHTML = `<div class="rw-card rw-odds">
    <h2 id="rw-odds-h" class="rw-title">${table.eligible ? 'Lucky Treat odds' : 'Daily Treat'}</h2>
    ${
      table.eligible
        ? `<table class="rw-table"><thead><tr><th scope="col">Rarity</th><th scope="col">Chance</th><th scope="col">What's inside</th></tr></thead><tbody>${rows}</tbody></table>
    <ul class="rw-rules">
      <li>One Lucky Treat a day, for your first win (days change at 00:00 UTC).</li>
      <li>Every ${table.floor}th Lucky Treat is Rare or better. Yours: ${n === table.floor && table.n > 0 ? `the next one is a ${table.floor}th` : `Rare or better in ${n}`}.</li>
      <li>Earned only. It is never sold and nothing paid opens one.</li>
      <li>Cosmetic only. You never get a look you already own.</li>
    </ul>`
        : `<p class="rw-what">Your first win each day gives a Daily Treat: +${table.dailyTreatXp} Treat XP. No random rewards on this account.</p>`
    }
    <div class="rw-actions"><button type="button" class="pl-btn small" data-k="close">Close</button></div>
  </div>`;
  const close = (): void => {
    root.remove();
    opener?.focus?.();
  };
  root.addEventListener('click', (e) => {
    if (e.target === root || (e.target as HTMLElement).closest('[data-k="close"]')) close();
  });
  trapClose(root, close);
  parent.appendChild(root);
  (root.querySelector('[data-k="close"]') as HTMLElement).focus();
  return root;
}

/** "Welcome gift · Day 3: +200 Treat XP", a short status toast over Home or the results. */
function welcomeToast(g: Grant, parent: HTMLElement = document.body): void {
  const el = document.createElement('div');
  el.className = 'rw-toast';
  el.setAttribute('role', 'status');
  el.dataset.testid = 'welcome-toast';
  el.innerHTML = `<b>Welcome gift · Day ${g.n ?? '?'}</b><span>${esc(g.item ? itemName(g.item) : `+${g.xp ?? 0} Treat XP`)}</span>`;
  parent.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3600);
  setTimeout(() => el.remove(), 4100);
}

// ------------------------------------------------------------------------------------------------------- Home Today

let clicksOn = false;
/** One delegated listener: any `[data-rw="odds"]` (Home's Today list) opens the odds sheet. */
export function installRewardsClicks(): void {
  if (clicksOn || typeof document === 'undefined') return;
  clicksOn = true;
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.('[data-rw="odds"]');
    if (!t) return;
    e.preventDefault();
    openLuckyOdds();
  });
}

/**
 * Home's Today list, under the quests: the Welcome Path (while it runs) and the Lucky Treat row (its odds one tap
 * away). Empty before the account has answered once.
 */
export function todayExtraHtml(): string {
  const c = loadCloud();
  const parts: string[] = [];
  if (welcomeVisible(c.welcome)) {
    const days = c.welcome!.days;
    const items = WELCOME_PATH.map((g) => {
      const st = g.day <= days ? 'got' : g.day === days + 1 && !c.welcome!.today ? 'next' : '';
      const label = `Day ${g.day}: ${giftLabel(g)}${st === 'got' ? ', received' : ''}`;
      return `<li class="${st}" title="${esc(label)}" aria-label="${esc(label)}"><span aria-hidden="true">${st === 'got' ? '✓' : g.day}</span></li>`;
    }).join('');
    const next = WELCOME_PATH[days];
    const sub = days >= WELCOME_DAYS ? 'All 7 gifts received' : c.welcome!.today ? `Tomorrow: ${giftLabel(next)}` : `Play today: ${giftLabel(next)}`;
    parts.push(`<div class="rw-wp" role="group" aria-label="${esc(`Welcome Path: ${days} of ${WELCOME_DAYS} days`)}" data-testid="welcome-path"><span class="rw-wp-t"><b>Welcome Path</b><small>${esc(sub)}</small></span><ol class="rw-days">${items}</ol></div>`);
  }
  if (c.lucky)
    parts.push(
      c.lucky.eligible
        ? `<button type="button" class="rw-lrow" data-rw="odds" data-testid="today-lucky"><i class="rw-mini-chest" aria-hidden="true"></i><span><b>Lucky Treat</b><small>Your first win each day · see odds</small></span></button>`
        : `<div class="rw-lrow"><i class="rw-mini-chest" aria-hidden="true"></i><span><b>Daily Treat</b><small>First win each day: +${c.lucky.dailyTreatXp} Treat XP</small></span></div>`,
    );
  return parts.length ? `<div class="rw-today">${parts.join('')}</div>` : '';
}

// ------------------------------------------------------------------------------------------------------- mastery

/** The champion browser's chip: "M3" with its verified count (nothing before the hero's first verified match). */
export function masteryChipHtml(hero: HeroId): string {
  const r = masteryOf(hero);
  if (!r || r.level < 1) return '';
  const next = masteryToNext(r);
  const label = `Mastery ${r.level} of ${MASTERY_MAX}: ${r.m} verified ${r.m === 1 ? 'match' : 'matches'}, ${r.w} ${r.w === 1 ? 'win' : 'wins'}${next ? `. ${next} more to Mastery ${r.level + 1}` : ''}`;
  return `<li class="rw-mastery m${r.level}" aria-label="${esc(label)}" title="${esc(label)}" data-testid="mastery-chip"><i aria-hidden="true">M${r.level}</i>Mastery</li>`;
}

/** A store card's ribbon: "M3". */
export function masteryRibbonHtml(hero: HeroId): string {
  const r = masteryOf(hero);
  return r && r.level >= 1 ? `<i class="cst-rib rw-mrib m${r.level}" title="Mastery ${r.level}">M${r.level}</i>` : '';
}
