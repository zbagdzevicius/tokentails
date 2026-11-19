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
 * Founder, Nov 19 ("each thing should serve its own purpose"): nothing is worn here. A title or frame claimed on this
 * screen shows one "Wear it" link that opens Profile's Collection, the one place it is worn.
 */
import { catalogSku, PASS_PLUS_SKU, PASS_SKU, PASS_UPGRADE_SKU } from '../money/catalog';
import type { StoreSnapshot } from '../money/entitlements';
import { browserCurrency } from '../money/skus';
import { claimKey, currentSeason, matchesToNextText, readyRewards, seasonEndText, seasonTier, type PassRow, type PassState } from '../meta/pass';
import { catalogPrice, itemState } from './storeCore';
import type { HeroId } from '../sim/api';
import { PAID_COATS } from '../render/cosmetics';
import { icon } from './icons';
import { faceImgAttrs, installArtFallback, skinArtId } from './art';
import { HERO_IDS } from '../data/heroes';
import { LOCK_SVG, TICK_SVG, bookClose, bookTabs, focusTab, hex, wireTabs } from './passBook';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface PassOpts {
  snapshot: () => StoreSnapshot;
  /** Ask the host to claim (`pass-claim`); false when there is no host. */
  claim(row: PassRow | null, tier: number | null): boolean;
  /** Buy a pass SKU (web store only). */
  buy?(sku: string): boolean;
  /** A hero portrait for a coat tile without painted skin art (ui/art.ts covers the rest), or null. */
  portrait?(hero: HeroId, item: string): string | null;
  /** Back to the Treat Track tab. */
  onTrack?(): void;
  /** What the player wears now (the "Wear it" link hides once the claimed title or frame is worn). */
  worn?(): { title: string | null; frame: string | null };
  /** "Wear it": open Profile's Collection (absent: no link). */
  onWearIt?(): void;
  onClose(): void;
}

const EMPTY: PassState = { id: 's1', xp: 0, tier: 0, premium: 'none', skips: 0, claimed: [], endsAt: '' };

export function passPanel(parent: HTMLElement, o: PassOpts): { el: HTMLElement; close(): void; refresh(): void } {
  installArtFallback();
  const root = document.createElement('div');
  root.className = 'pl-screen pl-menu pl-pass pl-book';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Legends Pass');
  const def = currentSeason();
  let line = '';
  let scrolled = false;
  /** Titles and frames claimed on this screen, in claim order (the newest one owned and not worn gets "Wear it"). */
  const claimedHere: { id: string; name: string }[] = [];
  const wearable = (r: { item: string }): boolean => r.item.startsWith('title.') || r.item.startsWith('frame.');
  const remember = (rows: { item: string; name: string }[]): void => {
    for (const r of rows) if (wearable(r) && !claimedHere.some((c) => c.id === r.item)) claimedHere.push({ id: r.item, name: r.name });
  };
  const rarity = (row: PassRow, n: number, item: string): string => {
    if (row === 'p' && n === def.tiers) return 'legendary';
    const rung = PAID_COATS[item]?.rung;
    if (rung) return rung.toLowerCase();
    return n >= 24 ? 'epic' : n >= 12 || row === 'p' ? 'rare' : 'common';
  };
  const preview = (item: string, name: string, hero: string | undefined): string => {
    if (item.startsWith('coat.')) {
      const c = PAID_COATS[item]?.coat;
      // the coat's painted face (brand-book skin art; the hero's face if it fails), else the given portrait
      const art = hero && (HERO_IDS as readonly string[]).includes(hero) && skinArtId({ coat: item });
      const pic = !art && hero ? (o.portrait?.(hero as HeroId, item) ?? null) : null;
      const face = art
        ? `<img ${faceImgAttrs(hero as HeroId, { coat: item })} alt="" loading="lazy" decoding="async" draggable="false">`
        : pic
          ? `<img src="${esc(pic)}" alt="" loading="lazy" decoding="async" draggable="false">`
          : icon('coat');
      const sw = c ? `<span class="sw" aria-hidden="true"><i style="background:${hex(c.base)}"></i><i style="background:${hex(c.light)}"></i><i style="background:${hex(c.accent)}"></i></span>` : '';
      return `<span class="pv coat"${c ? ` style="--c1:${hex(c.base)};--c2:${hex(c.accent)}"` : ''}>${face}${sw}</span>`;
    }
    if (item.startsWith('frame.')) return `<span class="pv frame" data-frame="${esc(item)}">${icon('paw')}</span>`;
    return `<span class="pv title"><span>${esc(name.replace(/ title$/, ''))}</span></span>`;
  };
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
      if (!r) return `<div class="pc empty ${row === 'f' ? 'free' : 'prem'}" aria-hidden="true"></div>`;
      const claimed = s.claimed.includes(claimKey(row, n));
      const reached = n <= tier;
      const lock = row === 'p' && !premium;
      const state = claimed ? 'claimed' : lock ? 'locked' : reached ? 'ready' : 'ahead';
      const kind = r.item.startsWith('coat.') ? 'coat' : r.item.startsWith('frame.') ? 'frame' : 'title';
      const label = `${r.name}${claimed ? ', claimed' : state === 'ready' ? ', ready to claim' : lock ? ', Legends Pass row' : ''}`;
      const st = claimed ? `${TICK_SVG}<span>Claimed</span>` : lock ? `${LOCK_SVG}<span>Pass</span>` : state === 'ready' ? '<span>Claim</span>' : `<span>Tier ${n}</span>`;
      return `<button type="button" class="pc ${state} k-${kind} r-${rarity(row, n, r.item)} ${row === 'f' ? 'free' : 'prem'}" data-row="${row}" data-tier="${n}" aria-label="${esc(`Tier ${n}: ${label}`)}"${state === 'ready' ? '' : ' aria-disabled="true"'}>${preview(r.item, r.name, r.hero)}<b>${esc(r.name)}</b><small class="st">${st}</small></button>`;
    };
    const cols = Array.from({ length: def.tiers }, (_, i) => i + 1)
      .map(
        (n) =>
          `<div class="pcol${n === tier ? ' now' : ''}${n <= tier ? ' reached' : ''}" data-col="${n}" role="listitem">${cell('f', n)}<span class="pn" aria-hidden="true"><i class="node"></i><em>${n}</em></span>${cell('p', n)}</div>`,
      )
      .join('');
    const currency = browserCurrency();
    const buys = !snap.storeOpen || snap.isApp
      ? ''
      : [PASS_SKU, PASS_PLUS_SKU, PASS_UPGRADE_SKU]
          .map((k) => catalogSku(k)!)
          .filter((d) => itemState(d, snap) === 'buy')
          .map((d) => `<button type="button" class="bk-buy buy" data-buy="${d.sku}">${esc(d.sku === PASS_SKU ? 'Legends Pass' : d.sku === PASS_PLUS_SKU ? 'Pass+' : 'Upgrade to Pass+')} ${esc(catalogPrice(d, currency))}</button>`)
          .join('');
    // the newest title or frame claimed here that the account now owns and does not wear
    const worn = o.worn?.() ?? { title: null, frame: null };
    const fresh = o.onWearIt
      ? [...claimedHere].reverse().find((c) => snap.items.has(c.id) && (c.id.startsWith('title.') ? worn.title : worn.frame) !== c.id)
      : undefined;
    const wearIt = fresh ? `<p class="wear-new" data-new="${esc(fresh.id)}"><span>${esc(fresh.name)} is yours.</span><button type="button" class="bk-link" data-a="wear" data-testid="pass-wear-it">Wear it</button></p>` : '';
    const [kick, title] = def.name.includes(': ') ? def.name.split(': ', 2) : ['', def.name];
    const prevLeft = root.querySelector<HTMLElement>('.pass-track')?.scrollLeft;
    // a re-render (a claim, Claim all, a host refresh) keeps keyboard focus: the same tile, else the same control,
    // else the selected tab (innerHTML would otherwise drop focus to the page behind the modal)
    const f = document.activeElement as HTMLElement | null;
    const refocus =
      f && root.contains(f)
        ? f.dataset.tier
          ? `.pc[data-row="${f.dataset.row}"][data-tier="${f.dataset.tier}"]`
          : f.dataset.a
            ? `[data-a="${f.dataset.a}"]`
            : f.dataset.buy
              ? `[data-buy="${f.dataset.buy}"]`
              : f.classList.contains('pass-track')
                ? '.pass-track'
                : '[role="tab"][aria-selected="true"]'
        : null;
    root.innerHTML = `<div class="card bk-card">${bookClose('Legends Pass')}<div class="bk-head">${bookTabs('pass', 'Pass')}</div>
      <div class="pass-plate" role="group" aria-label="${esc(def.name)}">
        <div class="pp-title"><span class="kick">${esc(kick)}</span><b>${esc(title)}</b></div>
        <div class="pass-top"><span class="tier-gem" aria-hidden="true"><b>${tier}</b></span><span class="xpw"><span class="xp" data-xp="${s.xp}">Tier <b data-tier="${tier}">${tier}</b>/${def.tiers} · ${s.xp} Season XP</span><span class="bar" role="progressbar" aria-label="Season XP to the next Tier" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i><span class="gem" style="left:${pct}%"></span></span><small>${esc(togo ?? 'Every Tier reached')}${end ? ` · season ends ${esc(end)}, rewards never expire` : ''}</small></span></div>
      </div>
      <div class="pass-book">
        <div class="pass-rows"><span class="rl f">Free</span><span class="rl p">${premium ? (s.premium === 'plus' ? 'Pass+' : 'Pass') : 'Pass'}</span></div>
        <div class="pass-scroll"><div class="pass-track" role="list" aria-label="Reward tiers" tabindex="0">${cols}</div><span class="more" aria-hidden="true">more ▸</span></div>
      </div>
      <div class="pass-bar"><button type="button" class="bk-done gold" data-a="all"${ready.length ? '' : ' disabled'}>Claim all${ready.length ? ` (${ready.length})` : ''}</button>${buys}${wearIt}<p class="line" role="status">${esc(line)}</p></div>
      <p class="fine">Every match gives Season XP; wins and knockouts give more. No random rewards.</p>
    </div>`;
    const track = root.querySelector<HTMLElement>('.pass-track');
    const sc = root.querySelector<HTMLElement>('.pass-scroll');
    if (track && sc) {
      const now = track.querySelector<HTMLElement>(`[data-col="${Math.max(1, tier)}"]`);
      if (!scrolled && now) {
        track.scrollLeft = Math.max(0, now.offsetLeft - track.clientWidth / 2 + now.offsetWidth / 2);
        scrolled = true;
      } else if (prevLeft !== undefined) track.scrollLeft = prevLeft;
      const more = (): void => {
        sc.classList.toggle('end', track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
        sc.classList.toggle('start', track.scrollLeft <= 4);
      };
      track.addEventListener('scroll', more, { passive: true });
      more();
    }
    if (refocus) {
      const el = root.querySelector<HTMLElement>(refocus);
      const to = el && !(el as HTMLButtonElement).disabled ? el : root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      to?.focus({ preventScroll: true });
    }
  };
  render();
  wireTabs(root);
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
      const row = pc.dataset.row as PassRow;
      const n = Number(pc.dataset.tier);
      const ok = o.claim(row, n);
      line = ok ? 'Claiming…' : 'Sign in to claim rewards.';
      const r = (row === 'f' ? def.free : def.premium).find((x) => x.tier === n);
      if (ok && r) remember([r]);
    } else if (a === 'all') {
      const ok = o.claim(null, null);
      line = ok ? 'Claiming…' : 'Sign in to claim rewards.';
      if (ok) {
        const snap = o.snapshot();
        const s = (snap.season as PassState | null) ?? { ...EMPTY, endsAt: def.endsAt };
        remember(readyRewards(def, s).map((r) => ({ item: r.item, name: (r.row === 'f' ? def.free : def.premium).find((x) => x.tier === r.tier)?.name ?? r.item })));
      }
    } else if (a === 'wear' && o.onWearIt) {
      close();
      o.onClose();
      o.onWearIt();
      return;
    } else if (buy) {
      line = o.buy?.(buy) ? 'Finish on the purchase sheet.' : "The store isn't open right now.";
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
  // the first scroll to the current tier needs layout: once more now that the panel is in the page
  scrolled = false;
  render();
  focusTab(root);
  return {
    el: root,
    close,
    refresh: () => {
      line = '';
      render();
    },
  };
}
