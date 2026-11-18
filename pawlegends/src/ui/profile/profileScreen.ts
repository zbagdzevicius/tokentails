/**
 * The Profile screen (founder, Nov 18: "profile looks bad, instead show full width tab like with store and etc, immersive
 * combined everything profile related in one place like in league of legends"). The Store's full-width frame (top bar
 * with Back, the bottom tab bar, Escape and the Android back close it) with League of Legends' profile sections:
 * Overview (the favourite champion's splash as the banner, the avatar in a level ring, rank crest, top mastery, season
 * numbers, the Pass and recent matches), Matches, Champions (mastery), Stats, Collection and Account.
 *
 * One screen for every profile: yours (opened from the Home avatar chip) and another player's, read-only (opened from
 * a friend's row; what their public `history.list` answer carries). Its own lazy chunk; the art is the store splash.
 * Match history, the Store, the Pass, the Treat Track, Social and Settings keep their own screens: this links to them.
 * Every call goes through the host (`name.get`, `name.set`, `social.get`, `social.me`, `ranked.me`, `history.list`).
 * Names are set with textContent.
 */
import '../champStore/champStore.css';
import './profile.css';
import type { ApiArgs, ApiOp, ApiResult } from '../../embed/api';
import type { AccountAction } from '../../embed/bridge';
import { HEROES, HERO_IDS, type HeroId } from '../../data/heroes';
import { avatarHtml, titleText, FRAME_RING } from '../avatar';
import { accountActionOf, accountPanelHtml, type AccountModel } from '../account';
import { heroFaceUrl } from '../art';
import { splashAttrs } from '../champStore/model';
import { ROLE_NAME } from '../champSelect/roles';
import { ccHtml, countryName } from '../../social/flags';
import { levelInfo, moreMatches } from '../../meta/accountLevel';
import { MASTERY_MAX } from '../../meta/mastery';
import { parseRankedCard } from '../../meta/ranked';
import { ago } from '../../replay/store';
import {
  bannerHero,
  championRows,
  collectionCounts,
  formOf,
  isProfileTab,
  masteryScore,
  maxedCount,
  num,
  parseStats,
  rankView,
  roleSplit,
  rowOf,
  statsOfRows,
  TAB_LABEL,
  tabsFor,
  topMastery,
  wearableFrames,
  wearableTitles,
  type ProfileData,
  type ProfileRow,
  type ProfileTab,
} from './model';
import { NAME_MAX, nameErrorText, nameProblem, priceLine, yarnText, type NameInfo } from './name';

export interface ProfileFriend {
  code: string;
  name: string;
  av?: unknown;
  cc?: string | null;
}

export interface ProfileScreenOpts {
  /** The data the app already holds (the device and the entitlements); filled in from the host as answers arrive. */
  data: ProfileData;
  /** Another player's profile (read-only); absent: yours. */
  friend?: ProfileFriend | null;
  tab?: ProfileTab;
  /** The host's API (absent: device data only). */
  api?(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  /** Asset base (import.meta.env.BASE_URL). */
  base: string;
  /** Low quality: the 360 px splash only. */
  low?: boolean;
  /** The account (null: no host, no accounts). */
  account?: { model: AccountModel; send(a: AccountAction): void } | null;
  /** The country flag is hidden (Settings' switch) and the setter. */
  flag?: { hidden: boolean; set(hide: boolean): void };
  onClose(): void;
  signIn(): void;
  openHistory(friend: { code: string; name: string } | null): void;
  openSettings(): void;
  openStore?(tab?: 'champions' | 'coats' | 'frames'): void;
  openPass?(): void;
  openTrack?(): void;
  openSocial?(): void;
  /** The public name changed (Home, the HUD and the results follow). */
  onName?(name: string): void;
  /** A title or border worn (also kept on the device for Home's chip). */
  onWear?(kind: 'title' | 'frame', id: string | null): void;
  /** A name to suggest for the first change (the account's profile name). */
  suggest?(): string | null;
  track?(event: string, props?: Record<string, string | number | boolean>): void;
  now?(): number;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const BACK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
const PAW_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 13c-3 0-6 2.6-6 5.2 0 1.6 1.4 2.3 3 2.3 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.6 0 3-.7 3-2.3C18 15.6 15 13 12 13zM6.5 11a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8zm11 0a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8zM9.3 7.4a2.1 2.6 0 1 0 0-5.2 2.1 2.6 0 0 0 0 5.2zm5.4 0a2.1 2.6 0 1 0 0-5.2 2.1 2.6 0 0 0 0 5.2z"/></svg>';
const MODE_WORD: Readonly<Record<string, string>> = Object.freeze({ skirmish: 'Skirmish', classic: 'Classic', blitz: 'Blitz', pvp: 'PvP', ranked: 'Ranked', coop: 'Co-op', practice: 'Practice', arcade: 'Arcade', party: 'Party' });
const OUTCOME_WORD = Object.freeze({ won: 'Victory', lost: 'Defeat', draw: 'Draw' });
const heroName = (h: string): string => (h in HEROES ? HEROES[h as HeroId].name : h);
const DELETE_URL = 'https://pawlegends.app/account';

type Load = 'idle' | 'loading' | 'ok' | 'failed' | 'private';

export function profileScreen(parent: HTMLElement, o: ProfileScreenOpts): { el: HTMLElement; close(): void; refresh(): void; setTab(t: ProfileTab): void } {
  const doc = parent.ownerDocument;
  const self = !o.friend;
  const d: ProfileData = { ...o.data, rows: [...o.data.rows] };
  if (o.friend) {
    d.self = false;
    d.signedIn = true;
    d.name = o.friend.name;
    d.code = o.friend.code;
    d.av = o.friend.av ?? null;
    d.cc = o.friend.cc ?? null;
    d.level = null;
  }
  const tabs = tabsFor(self);
  let tab: ProfileTab = o.tab && isProfileTab(o.tab) && tabs.includes(o.tab) ? o.tab : 'overview';
  let load: Load = 'idle';
  let info: NameInfo | null = null;
  let edit: { draft: string; confirm: string | null; busy: boolean; hero: HeroId; frame: string; hint: string } | null = null;
  let note = '';
  let noteBad = false;
  let disposed = false;
  const now = (): number => o.now?.() ?? Date.now();
  const canEdit = (): boolean => self && d.signedIn && !!o.api;

  const root = doc.createElement('div');
  root.className = 'pl-screen pl-shop cst pfx';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', self ? 'Profile' : `${d.name}: profile`);
  root.dataset.testid = 'profile-screen';
  root.dataset.self = self ? '1' : '0';
  const base = o.base;
  root.style.setProperty('--cst-bg', `url("${absUrl(`${base}assets/splash/backdrop-1600.webp`)}")`);

  // ------------------------------------------------------------------------------------------------ pieces
  const say = (t: string, bad = false): void => {
    note = t;
    noteBad = bad;
  };
  const splash = (h: string, sizes: string, cls = 'pfx-art'): string => `<img class="${cls}" alt="" decoding="async" draggable="false" ${splashAttrs(base, h, !!o.low, sizes)}>`;
  const face = (h: string): string => (h in HEROES ? `<img class="pfx-face" alt="" decoding="async" src="${esc(heroFaceUrl(h as HeroId))}">` : `<span class="pfx-face"></span>`);
  const nameSpan = (cls: string, text: string, testid = ''): string => `<b class="${cls}" data-name="${esc(text)}"${testid ? ` data-testid="${testid}"` : ''}></b>`;
  const card = (title: string, body: string, cls = '', extra = ''): string => `<section class="pfx-card ${cls}"${extra}><h3>${title}</h3>${body}</section>`;
  const skel = (lines = 2): string => `<div class="pfx-skel" aria-hidden="true">${'<i></i>'.repeat(lines)}</div>`;
  const loading = (): boolean => load === 'loading' || load === 'idle';

  const levelRing = (): string => {
    const lv = d.level;
    const av = avatarHtml(d.av, 88, { guest: self && !d.signedIn && !d.av, fallbackHero: bannerHero(d) });
    const pct = lv ? Math.round(lv.pct * 100) : 0;
    return `<span class="pfx-ring" style="--p:${pct}%"${lv ? ` aria-label="${esc(`Level ${lv.level}, ${lv.toNext ? `${moreMatches(lv.toNext)} to level ${lv.level + 1}` : 'top level'}`)}" role="img"` : ''}>${av}${lv ? `<span class="pfx-lv" data-testid="profile-level">Lv ${lv.level}</span>` : ''}</span>`;
  };

  /** The left column: the banner splash, the avatar in its level ring, the name, title, flag and code, the main action. */
  const banner = (): string => {
    const hero = bannerHero(d);
    const title = d.title ? `<span class="pfx-title" data-testid="profile-title">${esc(titleText(d.title))}</span>` : '';
    const flag = d.cc ? `<span class="pfx-flag" title="${esc(countryName(d.cc))}">${ccHtml(d.cc)}</span>` : '';
    const code = d.code ? `<span class="pfx-code">${esc(d.code)}</span>` : '';
    let act = '';
    if (self && !d.signedIn) act = o.account || o.api ? `<button type="button" class="pl-btn small" data-a="signin" data-testid="profile-signin">Sign in</button><p class="pfx-fine">Sign in to choose your name and keep your progress.</p>` : '';
    else if (canEdit()) act = `<button type="button" class="pl-btn small" data-a="edit" data-testid="profile-edit"${info ? '' : ' disabled'}>Edit profile</button>`;
    else if (!self && o.friend) act = `<button type="button" class="pl-btn ghost small" data-a="history" data-testid="profile-history">Match history</button>`;
    return `<aside class="pfx-banner" data-side="${HEROES[hero]?.side ?? 'cat'}">
      ${splash(hero, '(min-width: 900px) 720px, 360px', 'pfx-bart')}
      <div class="pfx-bwho">
        ${levelRing()}
        ${nameSpan('pfx-name', d.name, 'profile-name')}
        <div class="pfx-tags">${title}${flag}${code}</div>
        <div class="pfx-bact">${act}</div>
      </div>
    </aside>`;
  };

  const rankCard = (): string => {
    const r = rankView(d.ranked);
    if (self && loading() && d.signedIn && o.api) return card('Ranked', skel(2), 'pfx-rank');
    return card(
      'Ranked',
      `<div class="pfx-crest" data-tier="${r.tier}" aria-hidden="true">${PAW_SVG}</div><b class="pfx-big" data-testid="profile-rank">${esc(r.label)}</b><small>${esc(r.line)}</small>`,
      'pfx-rank',
    );
  };

  const topChampsCard = (): string => {
    const top = topMastery(d.mastery, 3);
    const favs = (d.stats?.favourites ?? []).slice(0, 3);
    const tiles = top.length
      ? top.map((t) => `<button type="button" class="pfx-mtile" data-a="tab" data-tab="champions" aria-label="${esc(`${heroName(t.hero)}, mastery ${t.level}`)}">${splash(t.hero, '120px')}<i class="pfx-m" data-m="${t.level}">M${t.level}</i><span>${esc(heroName(t.hero))}</span></button>`).join('')
      : favs.map((f) => `<button type="button" class="pfx-mtile" data-a="tab" data-tab="champions" aria-label="${esc(`${heroName(f.hero)}, ${f.matches} matches`)}">${splash(f.hero, '120px')}<span>${esc(heroName(f.hero))}</span></button>`).join('');
    const score = masteryScore(d.mastery);
    const head = `Top champions${score ? ` <small>Mastery ${num(score)}</small>` : ''}`;
    if (!tiles) return card('Top champions', `<p class="pfx-empty">${self ? 'Play matches to earn champion mastery.' : 'No champions played this season.'}</p>`, 'pfx-top');
    return card(head, `<div class="pfx-mrow">${tiles}</div>`, 'pfx-top');
  };

  const statTiles = (): string => {
    const s = d.stats;
    if (!s) return `<p class="pfx-empty">${self ? 'Your numbers show after your first match.' : 'No matches this season.'}</p>`;
    const t = (v: string, l: string, k: string): string => `<div class="pfx-stat" data-k="${k}"><b>${esc(v)}</b><small>${esc(l)}</small></div>`;
    return `<div class="pfx-stats">${t(num(s.matches), 'Matches', 'matches')}${t(s.winRate === null ? '–' : `${s.winRate}%`, 'Win rate', 'wr')}${t(s.kda.toFixed(1), 'KDA', 'kda')}${t(num(s.mvp), 'MVP', 'mvp')}</div>`;
  };

  const seasonCard = (): string => {
    if (!self && loading()) return card('This season', skel(2), 'pfx-season');
    const head = d.stats?.from === 'device' ? 'On this device' : d.stats?.season ? esc(d.stats.season) : 'This season';
    return card(head, statTiles(), 'pfx-season');
  };

  const passCard = (): string => {
    if (!self) return '';
    const p = d.pass;
    if (!p)
      return card('Legends Pass', `<p class="pfx-empty">${d.signedIn ? 'Season progress shows here once it loads.' : 'Sign in to earn Season XP.'}</p>${o.openPass || o.openTrack ? `<button type="button" class="pl-btn ghost small" data-a="${o.openPass ? 'pass' : 'track'}">${o.openPass ? 'Open Pass' : 'Treat Track'}</button>` : ''}`, 'pfx-pass');
    return card(
      `Legends Pass${p.name ? ` <small>${esc(p.name.replace(/^Season \d+:\s*/, ''))}</small>` : ''}`,
      `<div class="pfx-bar" role="img" aria-label="${esc(`Tier ${p.tier} of ${p.tiers}`)}"><i style="width:${Math.round(Math.max(0, Math.min(1, p.tier / Math.max(1, p.tiers))) * 100)}%"></i></div><p class="pfx-row"><span>Tier <b>${p.tier}</b> / ${p.tiers}</span><span>${num(p.xp)} Season XP</span></p>${o.openPass ? `<button type="button" class="pl-btn ghost small" data-a="pass" data-testid="profile-open-pass">Open Pass</button>` : ''}`,
      'pfx-pass',
    );
  };

  const rowHtml = (r: ProfileRow, i: number): string =>
    `<button type="button" class="pfx-mrowi" data-a="history" data-o="${r.outcome}" data-i="${i}" aria-label="${esc(`${OUTCOME_WORD[r.outcome]}, ${heroName(r.hero)}, ${r.k} ${r.d} ${r.a}, ${MODE_WORD[r.mode] ?? r.mode}`)}">${face(r.hero)}<b class="pfx-oc">${OUTCOME_WORD[r.outcome]}</b><span class="pfx-hn">${esc(heroName(r.hero))}</span><span class="pfx-kda">${r.k} / <em>${r.d}</em> / ${r.a}</span>${r.mvp ? `<i class="pfx-mvp">${r.mvp.toUpperCase()}</i>` : r.grade ? `<i class="pfx-grade">${esc(r.grade)}</i>` : '<i></i>'}<span class="pfx-when"><span>${esc(MODE_WORD[r.mode] ?? r.mode)}</span><small>${r.at ? esc(ago(r.at, now())) : ''}</small></span></button>`;

  const recentCard = (): string => {
    if (load === 'private') return card('Recent matches', `<p class="pfx-empty">This player keeps their matches private.</p>`, 'pfx-recent');
    if (!self && loading()) return card('Recent matches', skel(3), 'pfx-recent');
    const rows = d.rows.slice(0, 5);
    const link = `<button type="button" class="pfx-link" data-a="history" data-testid="open-history" aria-haspopup="dialog">Match history</button>`;
    const body = rows.length ? `<div class="pfx-list">${rows.map(rowHtml).join('')}</div>${link}` : `<p class="pfx-empty">${self ? 'No matches yet. Your games show here.' : 'No matches yet.'}</p>${self ? link : ''}`;
    return card('Recent matches', body, 'pfx-recent');
  };

  const failedBar = (): string => (load === 'failed' ? `<div class="pfx-err" role="alert"><span>Couldn't load everything.</span><button type="button" class="pl-btn ghost small" data-a="retry" data-testid="profile-retry">Try again</button></div>` : '');

  // --------------------------------------------------------------------------------------------- tab views
  const overview = (): string => `<div class="pfx-ov">${banner()}<div class="pfx-cards" data-scroll="main">${failedBar()}${rankCard()}${topChampsCard()}${seasonCard()}${passCard()}${recentCard()}</div></div>`;

  const matchesView = (): string => {
    let body: string;
    if (load === 'private') body = `<p class="pfx-empty">This player keeps their matches private.</p>`;
    else if (loading() && !d.rows.length && (!self || (d.signedIn && o.api))) body = skel(5);
    else if (!d.rows.length) body = `<p class="pfx-empty" data-testid="profile-no-matches">${self ? 'No matches yet. Play one and it shows here.' : 'No matches yet.'}</p>`;
    else body = `<div class="pfx-list">${d.rows.slice(0, 20).map(rowHtml).join('')}</div>`;
    return `<div class="pfx-pane" data-scroll="main">${failedBar()}<div class="pfx-panehead"><h3>${self ? 'Your matches' : 'Matches'}</h3><button type="button" class="pl-btn small" data-a="history" data-testid="profile-full-history">Full match history</button></div>${body}<p class="pfx-fine">Open a match in the full history to see both teams${self ? ' and watch replays kept on this device' : ''}.</p></div>`;
  };

  const championsView = (): string => {
    const rows = championRows(d.mastery, d.stats?.favourites ?? [], self);
    const score = masteryScore(d.mastery);
    const head = `<div class="pfx-panehead"><h3>Champion mastery</h3><span class="pfx-chips"><span class="pfx-chip">Score <b>${num(score)}</b></span><span class="pfx-chip">M${MASTERY_MAX} <b>${maxedCount(d.mastery)}</b></span>${self && d.champs ? `<span class="pfx-chip">Owned <b>${d.champs.owned} / ${d.champs.total}</b></span>` : ''}</span></div>`;
    if (!rows.length) return `<div class="pfx-pane" data-scroll="main">${head}<p class="pfx-empty">${self ? 'Play any champion to start its mastery.' : 'No champions played this season.'}</p></div>`;
    const cards = rows
      .map((r) => {
        const line = r.level >= MASTERY_MAX ? 'Top mastery' : r.toNext !== null ? `${r.toNext} to M${r.level + 1}` : self ? 'Not played yet' : `${r.matches} ${r.matches === 1 ? 'match' : 'matches'}`;
        return `<div class="pfx-ccard${r.level ? '' : ' dim'}" data-hero="${r.hero}">${splash(r.hero, '(min-width: 900px) 200px, 140px')}${r.level ? `<i class="pfx-m" data-m="${r.level}">M${r.level}</i>` : ''}<span class="pfx-cfoot"><b>${esc(heroName(r.hero))}</b><small>${esc(ROLE_NAME[HEROES[r.hero].role] ?? '')}${r.matches ? ` · ${r.matches} played · ${r.wins} won` : ''}</small><small class="pfx-next">${esc(line)}</small></span></div>`;
      })
      .join('');
    return `<div class="pfx-pane" data-scroll="main">${head}<div class="pfx-cgrid">${cards}</div></div>`;
  };

  const statsView = (): string => {
    const s = d.stats;
    const roles = s ? roleSplit(s.favourites) : [];
    const form = formOf(d.rows, 10);
    const roleHtml = roles.length
      ? roles.map((r) => `<div class="pfx-role"><span>${esc(ROLE_NAME[r.role] ?? r.role)}</span><span class="pfx-bar"><i style="width:${r.winRate}%"></i></span><small>${r.matches} · ${r.winRate}%</small></div>`).join('')
      : `<p class="pfx-empty">Shows after a few matches.</p>`;
    const favHtml = s?.favourites.length
      ? s.favourites.slice(0, 5).map((f) => `<div class="pfx-fav">${face(f.hero)}<b>${esc(heroName(f.hero))}</b><small>${f.matches} played · ${f.winRate}% won</small></div>`).join('')
      : `<p class="pfx-empty">No favourites yet.</p>`;
    const formHtml = form.length ? `<div class="pfx-form" aria-label="${esc(`Last ${form.length} results: ${form.join(' ')}`)}">${form.map((x) => `<i data-r="${x}">${x}</i>`).join('')}</div>` : `<p class="pfx-empty">No matches yet.</p>`;
    const lv = self && d.level ? card('Account level', `<b class="pfx-big">Lv ${d.level.level}</b><small>${d.level.toNext ? `${esc(moreMatches(d.level.toNext))} to Lv ${d.level.level + 1}` : 'Top level'} · ${num(d.matches)} matches played</small>`, 'pfx-lvcard') : '';
    return `<div class="pfx-pane pfx-sgrid" data-scroll="main">${failedBar()}${card(s?.from === 'device' ? 'On this device' : 'This season', !self && loading() ? skel(2) : statTiles(), 'pfx-season')}${lv}${card('Recent form', formHtml)}${card('By role', roleHtml)}${card('Favourite champions', favHtml)}</div>`;
  };

  const collectionView = (): string => {
    const c = collectionCounts(d.items);
    const tile = (n: string, l: string, a: string, sub: string): string => `<button type="button" class="pfx-ctile" data-a="${a}"><b>${esc(n)}</b><span>${esc(l)}</span><small>${esc(sub)}</small></button>`;
    const titles = wearableTitles(d.items);
    const frames = wearableFrames(d.items);
    const chips = (list: string[], kind: 'title' | 'frame', cur: string | null): string =>
      list
        .map((id) => {
          const label = id === 'none' ? 'None' : kind === 'title' ? titleText(id) : frameName(id);
          const ring = kind === 'frame' && id !== 'none' ? ` style="--ring:${FRAME_RING[id] ?? '#ffd166'}"` : '';
          return `<button type="button" class="pfx-wear" data-a="wear" data-kind="${kind}" data-id="${esc(id)}" aria-pressed="${(cur ?? 'none') === id}"${ring}${canEdit() ? '' : ' disabled'}>${esc(label)}</button>`;
        })
        .join('');
    const store = o.openStore ? ' (Store)' : '';
    return `<div class="pfx-pane" data-scroll="main">
      <div class="pfx-ctiles">
        ${d.champs ? tile(`${d.champs.owned} / ${d.champs.total}`, 'Champions', o.openStore ? 'store-champions' : 'noop', `Owned${store}`) : ''}
        ${tile(num(c.coats), 'Coats', o.openStore ? 'store-coats' : 'noop', `Owned${store}`)}
        ${tile(num(c.frames), 'Borders', o.openStore ? 'store-frames' : 'noop', `Owned${store}`)}
        ${tile(num(c.titles), 'Titles', o.openTrack ? 'track' : 'noop', 'Earned')}
      </div>
      <div class="pfx-sgrid pfx-wgrid">
      ${card('Title', `<div class="pfx-wears">${chips(titles, 'title', d.title)}</div>${titles.length < 2 ? '<p class="pfx-fine">Earn titles on the Treat Track and the Legends Pass.</p>' : ''}`)}
      ${card('Avatar border', `<div class="pfx-wears">${chips(frames, 'frame', d.frame)}</div>${frames.length < 2 ? '<p class="pfx-fine">Borders come from the Store and the Legends Pass.</p>' : ''}`)}
      </div>
      ${canEdit() ? '' : `<p class="pfx-fine">${d.signedIn ? 'Wearing items needs a connection.' : 'Sign in to wear titles and borders.'}</p>`}
      <div class="pfx-links">${o.openTrack ? '<button type="button" class="pl-btn ghost small" data-a="track">Treat Track</button>' : ''}${o.openPass ? '<button type="button" class="pl-btn ghost small" data-a="pass">Legends Pass</button>' : ''}${o.openStore ? '<button type="button" class="pl-btn ghost small" data-a="store-coats">Store</button>' : ''}</div>
    </div>`;
  };

  const accountView = (): string => {
    const acc = o.account
      ? card('Account', `<div class="pfx-acct">${accountPanelHtml(o.account.model)}</div>${o.account.model.signedIn && !o.account.model.isApp ? `<a class="pfx-link danger" href="${DELETE_URL}" target="_blank" rel="noopener" data-testid="profile-delete">Delete account</a>` : ''}`)
      : card('Account', `<p class="pfx-empty">Accounts are on pawlegends.app.</p>`);
    const code = d.code
      ? card('Player code', `<p class="pfx-row"><b class="pfx-codebig" data-testid="profile-code">${esc(d.code)}</b><button type="button" class="pl-btn ghost small" data-a="copy">Copy</button></p><p class="pfx-fine">Friends add you with this code.</p>${o.openSocial ? '<button type="button" class="pl-btn ghost small" data-a="social">Friends and invites</button>' : ''}`)
      : '';
    const hidden = o.flag?.hidden ?? false;
    const flag = o.flag
      ? card('Privacy', `<label class="pfx-switch"><input type="checkbox" data-a="flag" data-testid="profile-flag"${hidden ? '' : ' checked'}><span>Show my country flag${d.cc && !hidden ? ` ${ccHtml(d.cc)}` : ''}</span></label><p class="pfx-fine">Match history is public. More choices are in Settings.</p>`)
      : '';
    return `<div class="pfx-pane pfx-sgrid" data-scroll="main">${acc}${code}${flag}${card('Settings', `<p class="pfx-fine">Sound, graphics, controls and notifications.</p><button type="button" class="pl-btn ghost small" data-a="settings" data-testid="profile-settings">Open Settings</button>`)}</div>`;
  };

  // ------------------------------------------------------------------------------------------------ editor
  const editorHtml = (): string => {
    if (!edit || !info) return '';
    const e = edit;
    const i = info;
    const t = now();
    let nameBox: string;
    if (e.confirm) {
      const cost = i.free ? 'Free' : yarnText(i.price);
      nameBox = `<div class="pfx-box" data-testid="profile-confirm"><p>Change your name to</p>${nameSpan('pfx-preview', e.confirm)}<small>${i.free ? `This change is free. Later changes cost ${esc(yarnText(i.cost))}.` : 'Others see your new name everywhere.'}</small><div class="pfx-act"><button type="button" class="pl-btn ghost small" data-a="name-back">Back</button><button type="button" class="pl-btn small" data-a="name-confirm" data-testid="profile-confirm-btn"${e.busy ? ' disabled' : ''}>Confirm · ${esc(cost)}</button></div></div>`;
    } else {
      const wait = !i.free && !!i.nextAt && i.nextAt > t;
      const short = !i.free && !wait && i.yarn < i.price;
      nameBox = `<form class="pfx-box" data-testid="profile-nick"><label for="pfx-nick">Name others see</label><div class="pfx-namerow"><input id="pfx-nick" name="nick" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Your name" data-testid="profile-nick-input"${wait ? ' disabled' : ''}><button type="submit" class="pl-btn small" data-testid="profile-nick-change"${wait || e.busy ? ' disabled' : ''}>Change</button></div><small class="pfx-price${i.free ? ' free' : ''}${short ? ' short' : ''}" data-testid="profile-price">${esc(priceLine(i, t))}</small><small class="pfx-hint" aria-live="polite">${esc(e.hint)}</small></form>`; // copy-lint-ignore R13 a CSS class and test id; the fee is Yarn earned by playing, never money
    }
    const icons = HERO_IDS.map((h) => `<button type="button" class="pfx-avt" data-a="pick-icon" data-ref="${h}" aria-pressed="${e.hero === h}" aria-label="${esc(heroName(h))}">${avatarHtml({ i: `h:${h}` }, 40)}</button>`).join('');
    const frames = wearableFrames(d.items)
      .map((f) => `<button type="button" class="pfx-avt" data-a="pick-frame" data-frame="${esc(f)}" aria-pressed="${e.frame === f}" aria-label="${f === 'none' ? 'No border' : esc(frameName(f))}">${avatarHtml({ i: `h:${e.hero}`, ...(f !== 'none' ? { f } : {}) }, 40)}</button>`)
      .join('');
    return `<div class="pfx-editor" role="dialog" aria-modal="true" aria-label="Edit profile" data-testid="profile-editor"><div class="pfx-epanel">
      <header class="pfx-ehead"><h3>Edit profile</h3><button type="button" class="cst-back pfx-x" data-a="edit-close" aria-label="Close">${X_SVG}</button></header>
      <div class="pfx-ebody">
        ${nameBox}
        <div class="pfx-box"><div class="pfx-avhead">${avatarHtml({ i: `h:${e.hero}`, ...(e.frame !== 'none' ? { f: e.frame } : {}) }, 56)}<span><b>Avatar</b><small>Pick a champion and a border.</small></span><button type="button" class="pl-btn small" data-a="pick-save" data-testid="profile-avatar-save">Save avatar</button></div>
          <div class="pfx-avgrid" role="group" aria-label="Champion icon" data-testid="profile-picker">${icons}</div>
          <div class="pfx-avgrid" role="group" aria-label="Border">${frames}</div>
        </div>
      </div>
    </div></div>`;
  };

  // ------------------------------------------------------------------------------------------------ render
  let scrollTop = 0;
  const render = (): void => {
    if (disposed) return;
    const active = doc.activeElement as HTMLElement | null;
    const focusName = active && root.contains(active) ? active.getAttribute('name') : null;
    const focusTab = active?.dataset.tab && root.contains(active) ? active.dataset.tab : null;
    const view = tab === 'overview' ? overview() : tab === 'matches' ? matchesView() : tab === 'champions' ? championsView() : tab === 'stats' ? statsView() : tab === 'collection' ? collectionView() : accountView();
    const inert = edit ? ' inert' : '';
    const nav = tabs.map((t) => `<button type="button" role="tab" class="cst-tab${t === tab ? ' on' : ''}" data-a="tab" data-tab="${t}" aria-selected="${t === tab}" data-testid="profile-tab-${t}">${TAB_LABEL[t]}</button>`).join('');
    const yarn = self && d.yarn !== null ? `<span class="cst-chip" aria-label="${esc(`${num(d.yarn)} Yarn`)}"><img src="${base}assets/splash/yarn.svg" alt="" width="22" height="22"><b>${num(d.yarn)}</b></span>` : '';
    root.dataset.tab = tab;
    root.innerHTML = `<div class="card cst-frame">
      <header class="cst-top"${inert}>
        <button type="button" class="cst-back" data-a="close" aria-label="Back" data-testid="profile-back">${BACK_SVG}</button>
        <h2>${self ? 'Profile' : 'Player'}</h2>
        <div class="cst-wallet">${yarn}</div>
      </header>
      <div class="cst-main pfx-main" data-view="${tab}"${inert}>${view}</div>
      ${note ? `<p class="line cst-line pfx-note${noteBad ? ' bad' : ''}" role="status" data-testid="profile-note">${esc(note)}</p>` : ''}
      <nav class="cst-tabs pfx-tabs" role="tablist" aria-label="Profile sections"${inert}>${nav}</nav>
      ${editorHtml()}
    </div>`;
    for (const el of root.querySelectorAll<HTMLElement>('[data-name]')) el.textContent = el.dataset.name ?? '';
    const input = root.querySelector<HTMLInputElement>('input[name="nick"]');
    if (input && edit) {
      input.value = edit.draft;
      if (focusName === 'nick') input.focus();
    }
    const sc = root.querySelector<HTMLElement>('[data-scroll="main"]');
    if (sc) {
      sc.scrollTop = scrollTop;
      sc.addEventListener('scroll', () => (scrollTop = sc.scrollTop), { passive: true });
    }
    // a tab bar that scrolls (narrow screens) keeps the open tab in view
    const on = root.querySelector<HTMLElement>('.cst-tab.on');
    const bar = on?.parentElement;
    if (on && bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2);
    if (focusTab) root.querySelector<HTMLElement>(`.cst-tab[data-tab="${focusTab}"]`)?.focus({ preventScroll: true });
    else if (edit && !root.querySelector('.pfx-editor')?.contains(doc.activeElement)) root.querySelector<HTMLElement>('.pfx-editor [data-a="edit-close"]')?.focus({ preventScroll: true });
  };

  // -------------------------------------------------------------------------------------------------- data
  const deviceRows = d.rows;
  const fetchAll = async (): Promise<void> => {
    if (!o.api) {
      load = 'ok';
      if (!d.stats) d.stats = statsOfRows(d.rows);
      return render();
    }
    if (self && !d.signedIn) {
      load = 'ok';
      if (!d.stats) d.stats = statsOfRows(d.rows);
      return render();
    }
    load = 'loading';
    render();
    const api = o.api;
    const hist = api('history.list', o.friend ? { code: o.friend.code } : {});
    const calls = self ? [api('name.get'), api('social.get'), api('ranked.me'), hist] : [hist];
    const res = await Promise.all(calls.map((p) => p.catch((): ApiResult => ({ id: 'x', ok: false, status: 0 }))));
    if (disposed) return;
    let failed = false;
    const h = res[res.length - 1];
    if (h.ok && h.body) {
      const b = h.body as { owner?: { name?: unknown }; rows?: unknown[]; stats?: unknown };
      const rows = (Array.isArray(b.rows) ? b.rows : []).map((r, i) => rowOf(r, `s${i}`)).filter((r): r is ProfileRow => !!r);
      if (rows.length || !self) d.rows = rows;
      d.stats = parseStats(b.stats) ?? statsOfRows(d.rows);
      if (!self && typeof b.owner?.name === 'string' && b.owner.name) d.name = b.owner.name.slice(0, 40);
    } else if (!self && (h.status === 403 || h.status === 404)) {
      load = 'private';
    } else {
      failed = true;
      d.rows = self ? deviceRows : [];
      d.stats = statsOfRows(d.rows);
    }
    if (self) {
      const [n, s, r] = res;
      if (n.ok && n.body) {
        info = n.body as NameInfo;
        d.name = info.name || d.name;
        o.onName?.(info.name);
      } else failed = true;
      if (s.ok && s.body) {
        const me = (s.body as { me?: { code?: string; av?: unknown; title?: string | null; frame?: string | null } }).me;
        if (me) {
          d.code = typeof me.code === 'string' ? me.code : d.code;
          if (me.av) d.av = me.av;
          if (me.title !== undefined) d.title = me.title ?? null;
          if (me.frame !== undefined) d.frame = me.frame ?? null;
        }
      } else failed = true;
      if (r.ok) d.ranked = parseRankedCard(r.body);
    }
    if (load !== 'private') load = failed ? 'failed' : 'ok';
    render();
  };

  // --------------------------------------------------------------------------------------------- actions
  const openEdit = (): void => {
    if (!info) return;
    const cur = (d.av as { i?: string } | null)?.i ?? '';
    const hero = (cur.startsWith('h:') && cur.slice(2) in HEROES ? cur.slice(2) : bannerHero(d)) as HeroId;
    edit = { draft: info.nick ?? (info.changes === 0 ? (o.suggest?.() ?? '') : ''), confirm: null, busy: false, hero, frame: d.frame ?? 'none', hint: '' };
    say('');
    o.track?.('profile_edit');
  };

  const askName = (): void => {
    if (!edit || !info || edit.busy) return;
    const v = edit.draft.trim().replace(/\s+/g, ' ');
    const err = nameProblem(v);
    if (err) return say(err, true);
    if (info.nick === v) return say('That is already your name.', true);
    if (!info.free && info.yarn < info.price) return say(`Not enough Yarn: you need ${yarnText(info.price)}, you have ${yarnText(info.yarn)}. Play matches to earn more.`, true);
    edit.confirm = v;
    say('');
  };

  const changeName = async (): Promise<void> => {
    if (!edit?.confirm || edit.busy || !o.api) return;
    const name = edit.confirm;
    edit.busy = true;
    render();
    const r = await o.api('name.set', { name }).catch((): ApiResult => ({ id: 'x', ok: false, status: 0 }));
    if (disposed || !edit) return;
    edit.busy = false;
    if (r.ok && r.body) {
      const paid = Number((r.body as { paid?: number }).paid) || 0;
      info = r.body as NameInfo;
      d.name = info.name;
      edit.draft = info.nick ?? name;
      edit.confirm = null;
      say(`You are ${info.name} now.`);
      o.onName?.(info.name);
      o.track?.('name_change', { paid: paid > 0, changes: info.changes });
    } else {
      edit.confirm = null;
      say(nameErrorText(r, info, now()), true);
      const n = await o.api('name.get').catch(() => null);
      if (n?.ok && n.body && !disposed) info = n.body as NameInfo;
    }
    render();
  };

  const saveMe = async (args: ApiArgs, ok: string, after?: () => void): Promise<void> => {
    if (!o.api) return;
    const r = await o.api('social.me', args).catch((): ApiResult => ({ id: 'x', ok: false, status: 0 }));
    if (disposed) return;
    if (r.ok) {
      const me = (r.body as { me?: { av?: unknown; title?: string | null; frame?: string | null } } | undefined)?.me;
      if (me?.av) d.av = me.av;
      if (me && me.title !== undefined) d.title = me.title ?? null;
      if (me && me.frame !== undefined) d.frame = me.frame ?? null;
      after?.();
      say(ok);
    } else say("Couldn't save that. Try again.", true);
    render();
  };

  const copyCode = (): void => {
    if (!d.code) return;
    try {
      void navigator.clipboard?.writeText(d.code).catch(() => undefined);
      say('Code copied');
    } catch {
      say(d.code);
    }
  };

  // leaving for another screen: close, then open it (one overlay at a time)
  const leave = (then: () => void): void => {
    close();
    o.onClose();
    then();
  };

  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'nick' && edit) {
      edit.draft = t.value;
      edit.hint = edit.draft.trim() ? (nameProblem(edit.draft) ?? '') : '';
      const hint = root.querySelector<HTMLElement>('.pfx-hint');
      if (hint) hint.textContent = edit.hint;
    }
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    askName();
    render();
  });
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.a === 'flag' && o.flag) {
      const hide = !t.checked;
      o.flag.hidden = hide;
      o.flag.set(hide);
      say(hide ? 'Your flag is hidden' : 'Your flag is shown');
      render();
    }
  });
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const acct = accountActionOf(target);
    if (acct && acct !== 'chip' && o.account) {
      const send = o.account.send;
      // the host's sheet takes over (sign in, sign out, manage, delete): Home is what shows after it
      return leave(() => send(acct));
    }
    const el = target.closest<HTMLElement>('[data-a]');
    if (edit && target.classList.contains('pfx-editor')) {
      edit = null;
      return render();
    }
    const a = el?.dataset.a;
    if (!a || !el || el.hasAttribute('disabled')) return;
    switch (a) {
      case 'close':
        close();
        return o.onClose();
      case 'tab': {
        const t = el.dataset.tab;
        if (isProfileTab(t) && tabs.includes(t) && t !== tab) {
          tab = t;
          scrollTop = 0;
          say('');
          o.track?.('profile_tab', { tab: t });
        }
        return render();
      }
      case 'retry':
        return void fetchAll();
      case 'signin':
        return leave(() => o.signIn());
      case 'history':
        return leave(() => o.openHistory(o.friend ? { code: o.friend.code, name: d.name } : null));
      case 'settings':
        return leave(() => o.openSettings());
      case 'pass':
        return o.openPass ? leave(() => o.openPass!()) : undefined;
      case 'track':
        return o.openTrack ? leave(() => o.openTrack!()) : undefined;
      case 'social':
        return o.openSocial ? leave(() => o.openSocial!()) : undefined;
      case 'store-champions':
        return o.openStore ? leave(() => o.openStore!('champions')) : undefined;
      case 'store-coats':
        return o.openStore ? leave(() => o.openStore!('coats')) : undefined;
      case 'store-frames':
        return o.openStore ? leave(() => o.openStore!('frames')) : undefined;
      case 'copy':
        copyCode();
        return render();
      case 'edit':
        openEdit();
        return render();
      case 'edit-close':
        edit = null;
        return render();
      case 'name-back':
        if (edit) edit.confirm = null;
        return render();
      case 'name-confirm':
        return void changeName();
      case 'pick-icon':
        if (edit) edit.hero = (el.dataset.ref ?? 'clem') as HeroId;
        return render();
      case 'pick-frame':
        if (edit) edit.frame = el.dataset.frame ?? 'none';
        return render();
      case 'pick-save':
        if (edit) {
          const frame = edit.frame;
          void saveMe({ avatarKind: 'hero', avatarRef: edit.hero, frame }, 'Avatar saved', () => o.onWear?.('frame', frame === 'none' ? null : frame));
        }
        return;
      case 'wear': {
        const kind = el.dataset.kind === 'frame' ? 'frame' : 'title';
        const id = el.dataset.id ?? 'none';
        void saveMe(kind === 'title' ? { title: id } : { frame: id }, kind === 'title' ? 'Title saved' : 'Border saved', () => o.onWear?.(kind, id === 'none' ? null : id));
        return;
      }
    }
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !root.isConnected) return;
    e.preventDefault();
    e.stopPropagation();
    if (edit) {
      edit = null;
      render();
    } else {
      close();
      o.onClose();
    }
  };
  doc.addEventListener('keydown', onKey, true);
  const close = (): void => {
    if (disposed) return;
    disposed = true;
    doc.removeEventListener('keydown', onKey, true);
    root.remove();
  };

  if (self && d.level === null) d.level = levelInfo(d.matches);
  parent.appendChild(root);
  o.track?.('profile_open', { self, tab });
  render();
  root.querySelector<HTMLElement>('.cst-back')?.focus({ preventScroll: true });
  void fetchAll();
  return {
    el: root,
    close,
    refresh: render,
    setTab: (t) => {
      if (tabs.includes(t)) {
        tab = t;
        render();
      }
    },
  };
}

/** "Gold Paw border" style names for border ids (`frame.store.goldpaw` → "Goldpaw"). */
function frameName(id: string): string {
  const last = id.split('.').pop() ?? id;
  return last.replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const absUrl = (p: string): string => {
  try {
    return new URL(p, document.baseURI).href;
  } catch {
    return p;
  }
};
