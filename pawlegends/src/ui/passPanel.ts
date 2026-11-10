/**
 * Legends Pass screen (docs/plans/moba/STORE-PASS.md §6): the Track's second tab next to the Treat Track. One
 * non-scrolling screen: a fixed header (tabs, XP bar, "about N matches to tier X", the season's real end date), the
 * 30-tier strip (free row on top, premium row below with a lock; the one scroll region, scrolled to the current tier,
 * with a visible thumb and a "more" fade), and a fixed action bar (Claim all, Buy Pass / Pass+ on the web).
 *
 * Season XP comes only from verified matches (the backend's one score writer); the game never adds it. Claims go
 * through the host (`pass-claim`), which answers a fresh `store`. In an app build there is no price, no buy button and
 * no "buy on the web" wording: the premium row shows locked with no call to action (STORE-PASS.md §7).
 * Copy (CLAIMS R8): "Season XP", never Tails, coins or money; every reward is listed up front, nothing random.
 */
import { catalogSku, PASS_PLUS_SKU, PASS_SKU, PASS_UPGRADE_SKU } from '../money/catalog';
import type { StoreSnapshot } from '../money/entitlements';
import { browserCurrency } from '../money/skus';
import { claimKey, currentSeason, matchesToNextText, readyRewards, seasonEndText, seasonTier, type PassRow, type PassState } from '../meta/pass';
import { catalogPrice, itemState } from './store';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface PassOpts {
  snapshot: () => StoreSnapshot;
  /** Ask the host to claim (`pass-claim`); false when there is no host. */
  claim(row: PassRow | null, tier: number | null): boolean;
  /** Buy a pass SKU (web store only). */
  buy?(sku: string): boolean;
  /** Back to the Treat Track tab. */
  onTrack?(): void;
  onClose(): void;
}

const EMPTY: PassState = { id: 's1', xp: 0, tier: 0, premium: 'none', skips: 0, claimed: [], endsAt: '' };

export function passPanel(parent: HTMLElement, o: PassOpts): { el: HTMLElement; close(): void; refresh(): void } {
  const root = document.createElement('div');
  root.className = 'pl-screen pl-menu pl-pass';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Legends Pass');
  const def = currentSeason();
  let line = '';
  let scrolled = false;
  const render = (): void => {
    const snap = o.snapshot();
    const s: PassState = (snap.season as PassState | null) ?? { ...EMPTY, endsAt: def.endsAt };
    const tier = seasonTier(def, s.xp, s.skips);
    const premium = s.premium !== 'none';
    const pct = tier >= def.tiers ? 100 : Math.round((100 * (Math.max(0, s.xp) % def.xpPerTier)) / def.xpPerTier);
    const ready = readyRewards(def, s);
    const togo = matchesToNextText(def, s);
    const end = seasonEndText(s.endsAt || def.endsAt);
    const cell = (row: PassRow, n: number): string => {
      const r = (row === 'f' ? def.free : def.premium).find((x) => x.tier === n);
      if (!r) return `<div class="pc empty" aria-hidden="true"></div>`;
      const claimed = s.claimed.includes(claimKey(row, n));
      const reached = n <= tier;
      const lock = row === 'p' && !premium;
      const state = claimed ? 'claimed' : lock ? 'locked' : reached ? 'ready' : 'ahead';
      const kind = r.item.startsWith('coat.') ? 'coat' : r.item.startsWith('frame.') ? 'frame' : 'title';
      const label = `${r.name}${claimed ? ', claimed' : state === 'ready' ? ', ready to claim' : lock ? ', premium row' : ''}`;
      return `<button type="button" class="pc ${state} k-${kind}" data-row="${row}" data-tier="${n}" aria-label="${esc(`Tier ${n}: ${label}`)}"${state === 'ready' ? '' : ' aria-disabled="true"'}><b>${esc(r.name)}</b><small>${claimed ? '✓' : lock ? '🔒' : state === 'ready' ? 'Claim' : `Tier ${n}`}</small></button>`;
    };
    const cols = Array.from({ length: def.tiers }, (_, i) => i + 1)
      .map((n) => `<div class="pcol ${n === tier ? 'now' : ''} ${n <= tier ? 'reached' : ''}" data-col="${n}"><span class="pn">${n}</span>${cell('f', n)}${cell('p', n)}</div>`)
      .join('');
    const currency = browserCurrency();
    const buys = !snap.storeOpen || snap.isApp
      ? ''
      : [PASS_SKU, PASS_PLUS_SKU, PASS_UPGRADE_SKU]
          .map((k) => catalogSku(k)!)
          .filter((d) => itemState(d, snap) === 'buy')
          .map((d) => `<button class="pl-btn small buy" data-buy="${d.sku}">${esc(d.sku === PASS_SKU ? 'Legends Pass' : d.sku === PASS_PLUS_SKU ? 'Pass+' : 'Upgrade to Pass+')} ${esc(catalogPrice(d, currency))}</button>`)
          .join('');
    root.innerHTML = `<div class="card">
      <div class="head"><div class="tabs" role="tablist"><button type="button" role="tab" class="chip" data-a="track" aria-selected="false">Treat Track</button><button type="button" role="tab" class="chip on" aria-selected="true">Legends Pass</button></div><button class="pl-x" data-a="x" aria-label="Close the Legends Pass">✕</button></div>
      <div class="pass-top"><b>${esc(def.name)}</b><span class="xp" data-xp="${s.xp}">Tier <b data-tier="${tier}">${tier}</b>/${def.tiers} · ${s.xp} Season XP</span><span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span><small>${esc(togo ?? 'Every tier reached')}${end ? ` · season ends ${esc(end)}, rewards never expire` : ''}</small></div>
      <div class="pass-rows"><span class="rl">Free</span><span class="rl p">${premium ? (s.premium === 'plus' ? 'Pass+' : 'Pass') : 'Premium'}</span></div>
      <div class="pass-scroll"><div class="pass-track" role="list">${cols}</div><span class="more" aria-hidden="true">▸ more</span></div>
      <div class="pass-bar"><button class="pl-btn small" data-a="all"${ready.length ? '' : ' disabled'}>Claim all${ready.length ? ` (${ready.length})` : ''}</button>${buys}<p class="line" role="status">${esc(line)}</p></div>
      <p class="fine">Season XP comes from every match you finish: a win, a loss, takedowns and the first win of the day. No random rewards.</p>
    </div>`;
    const track = root.querySelector<HTMLElement>('.pass-track');
    const sc = root.querySelector<HTMLElement>('.pass-scroll');
    if (track && sc) {
      const now = track.querySelector<HTMLElement>(`[data-col="${Math.max(1, tier)}"]`);
      if (!scrolled && now) {
        track.scrollLeft = Math.max(0, now.offsetLeft - track.clientWidth / 2);
        scrolled = true;
      }
      const more = (): void => {
        sc.classList.toggle('end', track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
      };
      track.addEventListener('scroll', more);
      more();
    }
  };
  render();
  const close = (): void => {
    if (!root.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !root.isConnected) return;
    e.preventDefault();
    e.stopPropagation();
    close();
    o.onClose();
  };
  document.addEventListener('keydown', onKey, true);
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const pc = t.closest<HTMLElement>('.pc.ready');
    const buy = t.closest<HTMLElement>('[data-buy]')?.dataset.buy;
    if (pc) {
      line = o.claim(pc.dataset.row as PassRow, Number(pc.dataset.tier)) ? 'Claiming...' : 'Sign in to claim rewards.';
    } else if (a === 'all') {
      line = o.claim(null, null) ? 'Claiming...' : 'Sign in to claim rewards.';
    } else if (buy) {
      line = o.buy?.(buy) ? 'Finish on the purchase sheet.' : 'The store is not available right now.';
    } else if (a === 'track') {
      close();
      o.onClose();
      o.onTrack?.();
      return;
    } else if (a === 'x' || t === root) {
      close();
      o.onClose();
      return;
    } else return;
    render();
  });
  parent.appendChild(root);
  return {
    el: root,
    close,
    refresh: () => {
      line = '';
      render();
    },
  };
}
