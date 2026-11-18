/**
 * The Profile screen (founder, Nov 18: "profile looks bad, instead show full width tab like with store and etc, immersive
 * combined everything profile related in one place like in league of legends"). The Store's full-width frame (top bar
 * with Back, the bottom tab bar, Escape and the Android back close it) with League of Legends' profile sections. The
 * favourite champion's splash stands full height behind the whole screen (sharp on the left, a blurred wash behind
 * the rest); the identity sits over it. Overview: rank crest (one crest per tier) with the points bar, peak and
 * placements, top mastery, season highlights with recent form, the Pass and recent matches. Then Matches, Champions
 * (mastery), Stats, Collection (every coat, border and title, owned or locked) and Account.
 *
 * One screen for every profile: yours (opened from the Home avatar chip) and another player's, read-only (from a
 * friend's row or a player in a match's detail; their public `history.list` answer and its `player` card). Its own
 * lazy chunk; the art is the store splash. Match history, the Store, the Pass, the Treat Track, Social and Settings keep
 * their own screens: this links to them.
 *
 * Every source loads on its own (`name.get`, `social.get`, `ranked.me`, `history.list`); a failed one shows "Couldn't
 * load" in its own card and keeps any last known value, never an empty state. Names are set with textContent.
 */
import '../champStore/champStore.css';
import './profile.css';
import type { ApiArgs, ApiOp, ApiResult } from '../../embed/api';
import type { AccountAction } from '../../embed/bridge';
import { HEROES, HERO_IDS, type HeroId } from '../../data/heroes';
import { avatarHtml, titleText } from '../avatar';
import { accountActionOf, accountPanelHtml, type AccountModel } from '../account';
import { heroFaceUrl } from '../art';
import { splashAttrs } from '../champStore/model';
import { ROLE_NAME } from '../champSelect/roles';
import { ccHtml, countryName } from '../../social/flags';
import { levelInfo, moreMatches } from '../../meta/accountLevel';
import { MASTERY_MAX } from '../../meta/mastery';
import { parseRankedCard } from '../../meta/ranked';
import { ago } from '../../replay/store';
import { crestSvg } from './crest';
import { collectionOf, ownedOf, ownedSet, type CollectionEntry } from './collection';
import {
  bannerHero,
  championRows,
  duration,
  formOf,
  isProfileTab,
  mapName,
  masteryScore,
  maxedCount,
  num,
  parsePlayerCard,
  parseStats,
  rankView,
  roleSplit,
  rowOf,
  shownName,
  SOURCES_IDLE,
  statsOfRows,
  TAB_LABEL,
  tabsFor,
  topMastery,
  wearableFrames,
  wearableTitles,
  type ProfileData,
  type ProfileRow,
  type ProfileTab,
  type Sources,
  type SourceState,
} from './model';
import { NAME_MAX, nameErrorText, nameProblem, priceLine, yarnText, type NameInfo } from './name';

export interface ProfileFriend {
  code: string;
  name: string;
  av?: unknown;
  cc?: string | null;
  /** Already a friend (Message and Invite show); false or absent: a player from a match. */
  friend?: boolean;
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
  /** The items owned now (the entitlements can arrive after the screen opened). */
  items?(): Iterable<string>;
  onClose(): void;
  signIn(): void;
  openHistory(friend: { code: string; name: string } | null): void;
  openSettings(): void;
  openStore?(tab?: 'champions' | 'coats' | 'frames'): void;
  openPass?(): void;
  openTrack?(): void;
  openSocial?(): void;
  /** Another player: open a chat with them (Social's chat). */
  message?(friend: { code: string; name: string }): void;
  /** Another player: invite them to a party (PLAY → With Friends, then the invite). */
  invite?(friend: { code: string; name: string }): void;
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
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z"/></svg>';
const MODE_WORD: Readonly<Record<string, string>> = Object.freeze({ skirmish: 'Skirmish', classic: 'Classic', blitz: 'Blitz', pvp: 'PvP', ranked: 'Ranked', coop: 'Co-op', practice: 'Practice', arcade: 'Arcade', party: 'Party' });
const OUTCOME_WORD = Object.freeze({ won: 'Victory', lost: 'Defeat', draw: 'Draw' });
const heroName = (h: string): string => (h in HEROES ? HEROES[h as HeroId].name : h);
const DELETE_URL = 'https://pawlegends.app/account';

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
    d.title = titleOfAv(d.av);
    d.frame = frameOfAv(d.av);
  }
  const tabs = tabsFor(self);
  let tab: ProfileTab = o.tab && isProfileTab(o.tab) && tabs.includes(o.tab) ? o.tab : 'overview';
  const src: Sources = { ...SOURCES_IDLE };
  let priv = false;
  let info: NameInfo | null = null;
  let edit: { draft: string; confirm: string | null; busy: boolean; hero: HeroId; frame: string; hint: string } | null = null;
  let note = '';
  let noteBad = false;
  let disposed = false;
  const now = (): number => o.now?.() ?? Date.now();
  const canEdit = (): boolean => self && d.signedIn && !!o.api;
  const remote = (): boolean => !!o.api && (!self || d.signedIn);
  const busy = (s: SourceState): boolean => remote() && (s === 'idle' || s === 'loading');
  const owned = (): Set<string> => ownedSet([...d.items, ...(o.items?.() ?? [])], { title: d.title, frame: d.frame });

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
  const splash = (h: string, sizes: string, cls = 'pfx-art', lazy = false): string => `<img class="${cls}" alt="" decoding="async" draggable="false"${lazy ? ' loading="lazy"' : ''} ${splashAttrs(base, h, !!o.low, sizes)}>`;
  const face = (h: string): string => (h in HEROES ? `<img class="pfx-face" alt="" decoding="async" src="${esc(heroFaceUrl(h as HeroId))}">` : `<span class="pfx-face"></span>`);
  const nameSpan = (cls: string, text: string, testid = ''): string => `<b class="${cls}" data-name="${esc(text)}"${testid ? ` data-testid="${testid}"` : ''}></b>`;
  const card = (title: string, body: string, cls = '', extra = ''): string => `<section class="pfx-card ${cls}"${extra}><h3>${title}</h3>${body}</section>`;
  const skel = (lines = 2): string => `<div class="pfx-skel" aria-hidden="true">${'<i></i>'.repeat(lines)}</div>`;
  const failed = (what: string): string => `<div class="pfx-fail" role="alert" data-testid="profile-failed"><p>Couldn't load ${esc(what)}.</p><button type="button" class="pl-btn ghost small" data-a="retry">Try again</button></div>`;

  const levelRing = (size: 56 | 88): string => {
    const lv = d.level;
    const av = avatarHtml(d.av, size, { guest: self && !d.signedIn && !d.av, fallbackHero: bannerHero(d) });
    const pct = lv ? Math.round(lv.pct * 100) : 0;
    return `<span class="pfx-ring" style="--p:${pct}%"${lv ? ` aria-label="${esc(`Level ${lv.level}, ${lv.toNext ? `${moreMatches(lv.toNext)} to level ${lv.level + 1}` : 'top level'}`)}" role="img"` : ''}>${av}${lv ? `<span class="pfx-lv" data-testid="profile-level">Lv ${lv.level}</span>` : ''}</span>`;
  };

  /** The identity over the splash: the avatar in its level ring, the name, title, flag and code, the main actions. */
  const identity = (): string => {
    const title = d.title ? `<span class="pfx-title" data-testid="profile-title">${esc(titleText(d.title))}</span>` : '';
    const flag = d.cc ? `<span class="pfx-flag" title="${esc(countryName(d.cc))}" data-testid="profile-flag-shown">${ccHtml(d.cc)}</span>` : '';
    const code = d.code ? `<span class="pfx-code">${esc(d.code)}</span>` : '';
    let act = '';
    if (self && !d.signedIn) act = o.account || o.api ? `<button type="button" class="pl-btn small" data-a="signin" data-testid="profile-signin">Sign in</button><p class="pfx-fine">Sign in to choose your name and keep your progress.</p>` : '';
    else if (canEdit()) {
      const why = src.name === 'failed' ? `<p class="pfx-fine bad">Couldn't load your name. <button type="button" class="pfx-link" data-a="retry">Try again</button></p>` : '';
      // no Edit until the name rules loaded (a failed load shows its own Try again instead of a dead button)
      act = src.name === 'failed' && !info ? why : `<button type="button" class="pl-btn small" data-a="edit" data-testid="profile-edit"${info ? '' : ' disabled'}>Edit profile</button>`;
    } else if (!self && o.friend) {
      act = `<div class="pfx-acts">${o.message && o.friend.friend ? `<button type="button" class="pl-btn small" data-a="message" data-testid="profile-message">Message</button>` : ''}${o.invite && o.friend.friend ? `<button type="button" class="pl-btn ghost small" data-a="invite" data-testid="profile-invite">Invite to party</button>` : ''}<button type="button" class="pl-btn ghost small" data-a="history" data-testid="profile-history">Match history</button></div>`;
    }
    const nm = shownName(d);
    const nameBusy = self && d.signedIn && busy(src.name) && !d.name;
    return `<div class="pfx-who">
        ${levelRing(88)}
        <div class="pfx-whotext">
          ${nameBusy ? '<span class="pfx-skel pfx-nameskel" aria-hidden="true"><i></i></span>' : nameSpan('pfx-name', nm, 'profile-name')}
          <div class="pfx-tags">${title}${flag}${code}</div>
        </div>
        <div class="pfx-bact">${act}</div>
      </div>`;
  };

  const rankCard = (): string => {
    if (self && !d.signedIn)
      return card('Ranked', `<div class="pfx-rankbody"><div class="pfx-crest" data-tier="none">${crestSvg('none')}</div><div class="pfx-rankinfo"><b class="pfx-big" data-testid="profile-rank" data-tier="none">Unranked</b><small>Sign in to play Ranked.</small></div></div>`, 'pfx-rank');
    const s: SourceState = self ? src.ranked : src.hist;
    if (busy(s)) return card('Ranked', skel(3), 'pfx-rank');
    if (s === 'failed' && !d.ranked) return card('Ranked', failed(self ? 'your rank' : 'their rank'), 'pfx-rank');
    const r = rankView(d.ranked, self, !!d.rankedNone);
    const pips = r.pips ? `<span class="pfx-pips" aria-hidden="true">${[1, 2, 3].map((i) => `<i${i <= r.pips ? ' class="on"' : ''}></i>`).join('')}</span>` : '';
    const bar =
      r.progress !== null
        ? `<div class="pfx-lp"><span class="pfx-bar" role="progressbar" aria-label="${esc(r.placements ? 'Placement matches' : 'Rank points')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(r.progress * 100)}"><i style="width:${Math.round(r.progress * 100)}%"></i></span><small>${esc(r.line)}</small></div>`
        : `<small>${esc(r.line)}</small>`;
    const peak = r.peak ? `<span class="pfx-peak" data-testid="profile-peak">Best: ${esc(r.peak)}</span>` : '';
    return card(
      'Ranked',
      `<div class="pfx-rankbody"><div class="pfx-crest" data-tier="${r.tier}">${crestSvg(r.tier)}${pips}</div><div class="pfx-rankinfo"><b class="pfx-big" data-testid="profile-rank" data-tier="${r.tier}">${esc(r.label)}</b>${bar}${peak}</div></div>`,
      'pfx-rank',
    );
  };

  const topChampsCard = (): string => {
    const top = topMastery(d.mastery, 3);
    const favs = (d.stats?.favourites ?? []).slice(0, 3);
    const tiles = top.length
      ? top.map((t) => `<button type="button" class="pfx-mtile" data-a="tab" data-tab="champions" aria-label="${esc(`${heroName(t.hero)}, mastery ${t.level}`)}">${splash(t.hero, '(min-width: 1200px) 240px, 140px')}<i class="pfx-m" data-m="${t.level}">M${t.level}</i><span>${esc(heroName(t.hero))}</span></button>`).join('')
      : favs.map((f) => `<button type="button" class="pfx-mtile" data-a="tab" data-tab="champions" aria-label="${esc(`${heroName(f.hero)}, ${f.matches} matches`)}">${splash(f.hero, '(min-width: 1200px) 240px, 140px')}<span>${esc(heroName(f.hero))}<small>${f.matches} played</small></span></button>`).join('');
    const score = masteryScore(d.mastery);
    const head = `Top champions${score ? ` <small>Mastery ${num(score)}</small>` : ''}`;
    if (!tiles) {
      if (busy(src.hist)) return card('Top champions', skel(3), 'pfx-top');
      if (src.hist === 'failed') return card('Top champions', failed('champions'), 'pfx-top');
      if (!self) return card('Top champions', `<p class="pfx-empty pfx-mid">No champions played this season.</p>`, 'pfx-top');
      // a new player: three starters to aim for, dimmed, with what earns mastery
      const ghosts = (['clem', 'sage', 'lambo'] as HeroId[]).filter((h) => h in HEROES).map((h) => `<button type="button" class="pfx-mtile ghost" data-a="tab" data-tab="champions" aria-label="${esc(`${heroName(h)}: not played yet`)}">${splash(h, '(min-width: 1200px) 240px, 140px')}<span>${esc(heroName(h))}<small>Not played yet</small></span></button>`).join('');
      return card('Top champions', `<div class="pfx-mrow">${ghosts}</div><p class="pfx-fine">Play matches to earn champion mastery.</p>`, 'pfx-top');
    }
    return card(head, `<div class="pfx-mrow">${tiles}</div>`, 'pfx-top');
  };

  const statTiles = (): string => {
    const s = d.stats;
    const t = (v: string, l: string, k: string): string => `<div class="pfx-stat" data-k="${k}"><b>${esc(v)}</b><small>${esc(l)}</small></div>`;
    if (!s || !s.matches)
      return `<div class="pfx-stats zero">${t('0', 'Matches', 'matches')}${t('–', 'Win rate', 'wr')}${t('–', 'KDA', 'kda')}${t('0', 'MVP', 'mvp')}</div><p class="pfx-empty">${self ? 'Your numbers show after your first match.' : 'No matches this season.'}</p>`;
    return `<div class="pfx-stats">${t(num(s.matches), 'Matches', 'matches')}${t(s.winRate === null ? '–' : `${s.winRate}%`, 'Win rate', 'wr')}${t(s.kda.toFixed(1), 'KDA', 'kda')}${t(num(s.mvp), 'MVP', 'mvp')}</div>`;
  };

  const formStrip = (n = 10): string => {
    const form = formOf(d.rows, n);
    return form.length ? `<div class="pfx-form" role="img" aria-label="${esc(`Last ${form.length} results: ${form.join(' ')}`)}">${form.map((x) => `<i data-r="${x}">${x}</i>`).join('')}</div>` : '';
  };

  /** Season highlights: the numbers, then the last ten results (device numbers when the server failed). */
  const seasonCard = (): string => {
    if (busy(src.hist) && !(self && d.stats)) return card('This season', skel(2), 'pfx-season');
    if (src.hist === 'failed' && !d.stats) return card('This season', failed('season numbers'), 'pfx-season');
    const head = d.stats?.from === 'device' ? 'On this device' : d.stats?.season ? esc(d.stats.season) : 'This season';
    const form = formStrip(10);
    const stale = src.hist === 'failed' ? `<p class="pfx-fine bad">Showing this device's matches. <button type="button" class="pfx-link" data-a="retry">Try again</button></p>` : '';
    return card(head, `${statTiles()}${form ? `<div class="pfx-formrow"><small>Recent form</small>${form}</div>` : ''}${stale}`, 'pfx-season');
  };

  const passCard = (): string => {
    if (!self) return '';
    const p = d.pass;
    if (!p)
      return card('Legends Pass', `<p class="pfx-empty">${d.signedIn ? 'Season progress shows here once it loads.' : 'Sign in to earn Season XP.'}</p>${o.openPass || o.openTrack ? `<button type="button" class="pl-btn ghost small" data-a="${o.openPass ? 'pass' : 'track'}">${o.openPass ? 'Open Pass' : 'Treat Track'}</button>` : ''}`, 'pfx-pass');
    return card(
      `Legends Pass${p.name ? ` <small>${esc(p.name.replace(/^Season \d+:\s*/, ''))}</small>` : ''}`,
      `<div class="pfx-passrow"><b class="pfx-tier"><small>Tier</small>${p.tier}</b><div class="pfx-passbar"><span class="pfx-bar" role="progressbar" aria-label="${esc(`Tier ${p.tier} of ${p.tiers}`)}" aria-valuemin="0" aria-valuemax="${p.tiers}" aria-valuenow="${p.tier}"><i style="width:${Math.round(Math.max(0, Math.min(1, p.tier / Math.max(1, p.tiers))) * 100)}%"></i></span><p class="pfx-row"><span>${p.tier} / ${p.tiers}</span><span>${num(p.xp)} Season XP</span></p></div></div>${o.openPass ? `<button type="button" class="pl-btn ghost small" data-a="pass" data-testid="profile-open-pass">Open Pass</button>` : ''}`,
      'pfx-pass',
    );
  };

  const rowHtml = (r: ProfileRow, i: number): string => {
    const mode = MODE_WORD[r.mode] ?? r.mode;
    const map = mapName(r.map);
    const len = duration(r.seconds);
    return `<button type="button" class="pfx-mrowi" data-a="history" data-o="${r.outcome}" data-i="${i}" aria-label="${esc(`${OUTCOME_WORD[r.outcome]}, ${heroName(r.hero)}, ${r.k} ${r.d} ${r.a}, ${mode}${map ? `, ${map}` : ''}${len ? `, ${len}` : ''}`)}">${face(r.hero)}<span class="pfx-oc"><b>${OUTCOME_WORD[r.outcome]}</b><small>${esc(mode)}</small></span><span class="pfx-hn">${esc(heroName(r.hero))}</span><span class="pfx-kda">${r.k} / <em>${r.d}</em> / ${r.a}</span>${r.mvp ? `<i class="pfx-mvp">${r.mvp.toUpperCase()}</i>` : r.grade ? `<i class="pfx-grade" data-g="${esc(r.grade[0])}">${esc(r.grade)}</i>` : '<i class="pfx-nog"></i>'}<span class="pfx-map">${esc(map)}</span><span class="pfx-len">${esc(len)}</span><span class="pfx-when">${r.at ? esc(ago(r.at, now())) : ''}</span></button>`;
  };

  const recentCard = (): string => {
    if (priv) return card('Recent matches', `<p class="pfx-empty">This player keeps their matches private.</p>`, 'pfx-recent');
    if (busy(src.hist) && !d.rows.length) return card('Recent matches', skel(3), 'pfx-recent');
    if (src.hist === 'failed' && !d.rows.length) return card('Recent matches', failed('matches'), 'pfx-recent');
    const rows = d.rows.slice(0, 5);
    const link = `<button type="button" class="pfx-link" data-a="history" data-testid="open-history" aria-haspopup="dialog">Match history</button>`;
    const body = rows.length ? `<div class="pfx-list">${rows.map(rowHtml).join('')}</div>${link}` : `<div class="pfx-mid"><p class="pfx-empty">${self ? 'No matches yet. Your games show here.' : 'No matches yet.'}</p>${self ? link : ''}</div>`;
    return card('Recent matches', body, 'pfx-recent');
  };

  // --------------------------------------------------------------------------------------------- tab views
  const showRank = (): boolean => self || !!d.hasCard || busy(src.hist) || src.hist === 'failed';
  const overview = (): string =>
    `<div class="pfx-ov${showRank() ? '' : ' norank'}${self ? '' : ' other'}" role="tabpanel" id="pfx-panel" aria-labelledby="pfx-tab-${tab}">${identity()}<div class="pfx-cards" data-scroll="main">${showRank() ? rankCard() : ''}${topChampsCard()}${seasonCard()}${passCard()}${recentCard()}</div></div>`;

  const pane = (body: string, cls = ''): string => `<div class="pfx-pane ${cls}" data-scroll="main" role="tabpanel" id="pfx-panel" aria-labelledby="pfx-tab-${tab}">${body}</div>`;

  const matchesView = (): string => {
    let body: string;
    if (priv) body = `<p class="pfx-empty">This player keeps their matches private.</p>`;
    else if (busy(src.hist) && !d.rows.length) body = skel(5);
    else if (src.hist === 'failed' && !d.rows.length) body = failed('matches');
    else if (!d.rows.length) body = `<p class="pfx-empty" data-testid="profile-no-matches">${self ? 'No matches yet. Play one and it shows here.' : 'No matches yet.'}</p>`;
    else body = `<div class="pfx-list pfx-mlist">${d.rows.slice(0, 20).map(rowHtml).join('')}</div>`;
    const shown = d.rows.slice(0, 20);
    const w = shown.filter((r) => r.outcome === 'won').length;
    const l = shown.filter((r) => r.outcome === 'lost').length;
    const sum = shown.length ? `<span class="pfx-chips"><span class="pfx-chip">Last <b>${shown.length}</b></span><span class="pfx-chip win">Won <b>${w}</b></span><span class="pfx-chip loss">Lost <b>${l}</b></span></span>` : '';
    const stale = src.hist === 'failed' && d.rows.length ? `<p class="pfx-fine bad">Showing this device's matches. <button type="button" class="pfx-link" data-a="retry">Try again</button></p>` : '';
    return pane(
      `<div class="pfx-narrow"><div class="pfx-panehead">${sum}<button type="button" class="pl-btn small" data-a="history" data-testid="profile-full-history">Full match history</button></div>${stale}${body}<p class="pfx-fine">Open a match in the full history to see both teams${self ? ' and watch replays kept on this device' : ''}.</p></div>`,
    );
  };

  const championsView = (): string => {
    const rows = championRows(d.mastery, d.stats?.favourites ?? [], self);
    const score = masteryScore(d.mastery);
    const known = score > 0;
    const chips = [
      known ? `<span class="pfx-chip">Mastery score <b>${num(score)}</b></span><span class="pfx-chip">M${MASTERY_MAX} <b>${maxedCount(d.mastery)}</b></span>` : '',
      self && d.champs ? `<span class="pfx-chip">Owned <b>${d.champs.owned} / ${d.champs.total}</b></span>` : '',
    ].join('');
    const head = `<div class="pfx-panehead"><h3>${known ? 'Champion mastery' : 'Champions played'}</h3>${chips ? `<span class="pfx-chips">${chips}</span>` : ''}</div>`;
    if (!rows.length) {
      const body = busy(src.hist) ? skel(3) : src.hist === 'failed' ? failed('champions') : `<p class="pfx-empty">${self ? 'Play any champion to start its mastery.' : 'No champions played this season.'}</p>`;
      return pane(`${head}${body}`);
    }
    const cards = rows
      .map((r) => {
        const line = r.level >= MASTERY_MAX ? 'Top mastery' : r.toNext !== null ? `${r.toNext} to M${r.level + 1}` : self ? 'Not played yet' : '';
        const wr = r.matches ? `${Math.round((r.wins / r.matches) * 100)}% won` : '';
        return `<div class="pfx-ccard${r.level || r.matches ? '' : ' dim'}" data-hero="${r.hero}">${splash(r.hero, '(min-width: 900px) 200px, 140px', 'pfx-art', true)}${r.level ? `<i class="pfx-m" data-m="${r.level}">M${r.level}</i>` : ''}<span class="pfx-cfoot"><b>${esc(heroName(r.hero))}</b><small>${esc(ROLE_NAME[HEROES[r.hero].role] ?? '')}</small>${r.matches ? `<small class="pfx-played">${r.matches} played · ${wr}</small>` : ''}${line ? `<small class="pfx-next">${esc(line)}</small>` : ''}</span></div>`;
      })
      .join('');
    return pane(`${head}<div class="pfx-cgrid">${cards}</div>`);
  };

  const statsView = (): string => {
    const s = d.stats;
    if (!s && busy(src.hist)) return pane(skel(4));
    if (!s && src.hist === 'failed') return pane(failed('stats'));
    const roles = s ? roleSplit(s.favourites) : [];
    const shown = d.rows.slice(0, 20);
    const avg = (f: (r: ProfileRow) => number): string => (shown.length ? (shown.reduce((t, r) => t + f(r), 0) / shown.length).toFixed(1) : '–');
    const lens = shown.filter((r) => r.seconds > 0);
    const avgLen = lens.length ? duration(Math.round(lens.reduce((t, r) => t + r.seconds, 0) / lens.length)) : '–';
    const wr = s?.winRate ?? null;
    const donut = s
      ? `<div class="pfx-donut" style="--wr:${wr ?? 0}%" role="img" aria-label="${esc(wr === null ? 'No win rate yet' : `Win rate ${wr}%`)}"><b>${wr === null ? '–' : `${wr}%`}</b><small>Win rate</small></div><div class="pfx-wl"><span><b>${num(s.wins)}</b><small>Won</small></span><span><b>${num(Math.max(0, s.matches - s.wins))}</b><small>Not won</small></span><span><b>${s.kda.toFixed(1)}</b><small>KDA</small></span><span><b>${num(s.mvp)}</b><small>MVP</small></span></div>`
      : `<p class="pfx-empty">${self ? 'Your numbers show after your first match.' : 'No matches this season.'}</p>`;
    const head = s?.from === 'device' ? 'On this device' : s?.season ? esc(s.season) : 'This season';
    const roleHtml = roles.length
      ? roles.map((r) => `<div class="pfx-role"><span>${esc(ROLE_NAME[r.role] ?? r.role)}</span><span class="pfx-bar"><i style="width:${r.winRate}%"></i></span><small>${r.matches} · ${r.winRate}%</small></div>`).join('')
      : `<p class="pfx-empty">Shows after a few matches.</p>`;
    const favHtml = s?.favourites.length
      ? `<div class="pfx-favs">${s.favourites
          .slice(0, 5)
          .map((f) => `<div class="pfx-fav">${face(f.hero)}<b>${esc(heroName(f.hero))}</b><span class="pfx-bar"><i style="width:${f.winRate}%"></i></span><small>${f.matches} played · ${f.winRate}% won</small></div>`)
          .join('')}</div>`
      : `<p class="pfx-empty">No favourites yet.</p>`;
    const form = formOf(d.rows, 10);
    const formHtml = form.length
      ? `<div class="pfx-formbars" role="img" aria-label="${esc(`Last ${form.length} results: ${form.join(' ')}`)}">${[...d.rows]
          .sort((a, b) => b.at - a.at)
          .slice(0, 10)
          .reverse()
          .map((r) => {
            const k = (r.k + r.a) / Math.max(1, r.d);
            return `<span data-r="${r.outcome === 'won' ? 'W' : r.outcome === 'lost' ? 'L' : 'D'}" style="--h:${Math.round(Math.max(12, Math.min(100, k * 14)))}%"><i></i><small>${r.outcome === 'won' ? 'W' : r.outcome === 'lost' ? 'L' : 'D'}</small></span>`;
          })
          .join('')}${'<span data-r="" aria-hidden="true"><i></i><small>–</small></span>'.repeat(Math.max(0, 10 - Math.min(10, d.rows.length)))}</div><p class="pfx-fine">Last 10 matches, oldest first. Bar height: KDA of the match.</p>`
      : `<p class="pfx-empty">No matches yet.</p>`;
    const lv = d.level
      ? card(
          'Account level',
          `<div class="pfx-lvrow">${levelRing(56)}<div><b class="pfx-big">Lv ${d.level.level}</b><small>${d.level.toNext ? `${esc(moreMatches(d.level.toNext))} to Lv ${d.level.level + 1}` : 'Top level'}</small><small>${num(d.matches)} matches played</small></div></div>`,
          'pfx-lvcard',
        )
      : '';
    const per = card(
      `Per match <small>last ${shown.length || 0}</small>`,
      `<div class="pfx-stats">${[
        [avg((r) => r.k), 'Knockouts'],
        [avg((r) => r.d), 'Naps'],
        [avg((r) => r.a), 'Assists'],
        [avgLen, 'Length'],
      ]
        .map(([v, l]) => `<div class="pfx-stat"><b>${esc(v)}</b><small>${esc(l)}</small></div>`)
        .join('')}</div>`,
      'pfx-per',
    );
    const stale = src.hist === 'failed' ? `<p class="pfx-fine bad pfx-wide">Showing this device's matches. <button type="button" class="pfx-link" data-a="retry">Try again</button></p>` : '';
    return pane(
      `${stale}<div class="pfx-sgrid${d.level ? '' : ' nolv'}">${card(head, donut, 'pfx-wr')}${lv}${per}${card('Recent form', formHtml, 'pfx-formcard')}${card('By role', roleHtml, 'pfx-roles')}${card('Favourite champions', favHtml, 'pfx-favcard')}</div>`,
    );
  };

  const collectionView = (): string => {
    const own = owned();
    const c = collectionOf(own);
    const edit = canEdit();
    const wearT = new Set(wearableTitles([...own]));
    const wearF = new Set(wearableFrames([...own]));
    const count = (l: CollectionEntry[]): string => {
      const x = ownedOf(l);
      return `<small>${x.owned} / ${x.total}</small>`;
    };
    const lock = (e: CollectionEntry): string => (e.owned ? '' : `<span class="pfx-lock" aria-hidden="true">${LOCK_SVG}</span>`);
    const locked = (e: CollectionEntry, kind: 'coats' | 'frames'): string => (o.openStore && e.from === 'store' ? `store-${kind}` : o.openPass && e.from === 'pass' ? 'pass' : o.openTrack && e.from === 'earned' ? 'track' : 'noop');
    const where = (e: CollectionEntry): string => (e.owned ? 'Owned' : e.from === 'store' ? 'Store' : e.from === 'pass' ? 'Legends Pass' : 'Treat Track');
    const coats = c.coats
      .map((e) => {
        const a = e.owned ? 'noop' : locked(e, 'coats');
        const sw = (e.colors ?? []).map((x) => `<i style="background:${esc(x)}"></i>`).join('');
        return `<button type="button" class="pfx-item pfx-coat${e.owned ? ' own' : ''}" data-a="${a}" data-id="${esc(e.id)}" aria-label="${esc(`${e.name} coat for ${heroName(e.hero ?? '')}: ${where(e)}`)}"${a === 'noop' ? ' aria-disabled="true"' : ''}>${e.hero ? splash(e.hero, '160px', 'pfx-art', true) : ''}${lock(e)}<span class="pfx-sw" aria-hidden="true">${sw}</span><span class="pfx-ifoot"><b>${esc(e.name)}</b><small>${esc(heroName(e.hero ?? ''))} · ${esc(where(e))}</small></span></button>`;
      })
      .join('');
    const hero = (((d.av as { i?: string } | null)?.i ?? '').startsWith('h:') ? (d.av as { i: string }).i.slice(2) : bannerHero(d)) as HeroId;
    const frames = c.frames
      .map((e) => {
        const can = e.owned && edit && wearF.has(e.id);
        const on = (d.frame ?? null) === e.id;
        const a = can ? 'wear' : e.owned ? 'noop' : locked(e, 'frames');
        return `<button type="button" class="pfx-item pfx-frame${e.owned ? ' own' : ''}" data-a="${a}" data-kind="frame" data-id="${esc(e.id)}"${can ? ` aria-pressed="${on}"` : ''} aria-label="${esc(`${e.name} border: ${on ? 'worn' : can ? 'tap to wear' : where(e)}`)}"${a === 'noop' ? ' aria-disabled="true"' : ''}>${avatarHtml({ i: `h:${hero}`, f: e.id }, 56)}${lock(e)}<span class="pfx-ifoot"><b>${esc(e.name)}</b><small>${on ? 'Worn' : esc(where(e))}</small></span></button>`;
      })
      .join('');
    const titles = c.titles
      .map((e) => {
        const can = e.owned && edit && wearT.has(e.id);
        const on = (d.title ?? null) === e.id;
        const a = can ? 'wear' : e.owned ? 'noop' : locked(e, 'frames');
        return `<button type="button" class="pfx-wear${e.owned ? ' own' : ''}" data-a="${a}" data-kind="title" data-id="${esc(e.id)}"${can ? ` aria-pressed="${on}"` : ''}${a === 'noop' ? ' aria-disabled="true"' : ''} aria-label="${esc(`${e.name} title: ${on ? 'worn' : can ? 'tap to wear' : where(e)}`)}">${e.owned ? '' : LOCK_SVG}${esc(e.name)}</button>`;
      })
      .join('');
    const off = (kind: 'title' | 'frame'): string => (edit && (kind === 'title' ? d.title : d.frame) ? `<button type="button" class="pfx-link" data-a="wear" data-kind="${kind}" data-id="none">Wear none</button>` : '');
    const champs = d.champs
      ? `<button type="button" class="pfx-ctile" data-a="${o.openStore ? 'store-champions' : 'noop'}"><b>${d.champs.owned} / ${d.champs.total}</b><span>Champions</span></button>`
      : '';
    const sum = `<div class="pfx-ctiles" data-testid="profile-collection-counts">${champs}${[
      ['Coats', c.coats, 'coats'],
      ['Borders', c.frames, 'frames'],
      ['Titles', c.titles, 'titles'],
    ]
      .map(([l, list, k]) => {
        const x = ownedOf(list as CollectionEntry[]);
        return `<a class="pfx-ctile" href="#pfx-${k}" data-a="jump" data-k="${k}" data-testid="profile-count-${k}"><b>${x.owned} / ${x.total}</b><span>${l}</span></a>`;
      })
      .join('')}</div>`;
    const hint = edit ? '<p class="pfx-fine">Tap an owned border or title to wear it. Locked items open where you get them.</p>' : `<p class="pfx-fine">${d.signedIn ? 'Wearing items needs a connection.' : 'Sign in to wear titles and borders.'}</p>`;
    return pane(
      `${sum}${hint}
      <section class="pfx-sec" id="pfx-frames"><div class="pfx-panehead"><h3>Borders ${count(c.frames)}</h3>${off('frame')}</div><div class="pfx-igrid pfx-fgrid">${frames}</div></section>
      <section class="pfx-sec" id="pfx-titles"><div class="pfx-panehead"><h3>Titles ${count(c.titles)}</h3>${off('title')}</div><div class="pfx-wears">${titles}</div></section>
      <section class="pfx-sec" id="pfx-coats"><div class="pfx-panehead"><h3>Coats ${count(c.coats)}</h3>${o.openStore ? '<button type="button" class="pl-btn ghost small" data-a="store-coats">Store</button>' : ''}</div><div class="pfx-igrid">${coats}</div></section>`,
      'pfx-coll',
    );
  };

  const accountView = (): string => {
    const acc = o.account
      ? card('Account', `<div class="pfx-acct">${accountPanelHtml(o.account.model)}</div>${o.account.model.signedIn && !o.account.model.isApp ? `<a class="pfx-link danger" href="${DELETE_URL}" target="_blank" rel="noopener" data-testid="profile-delete">Delete account</a>` : ''}`, 'pfx-acc')
      : card('Account', `<p class="pfx-empty">Accounts are on pawlegends.app.</p>`, 'pfx-acc');
    const code = d.code
      ? card('Player code', `<p class="pfx-row"><b class="pfx-codebig" data-testid="profile-code">${esc(d.code)}</b><button type="button" class="pl-btn ghost small" data-a="copy">Copy</button></p><p class="pfx-fine">Friends add you with this code.</p>${o.openSocial ? '<button type="button" class="pl-btn ghost small" data-a="social">Friends and invites</button>' : ''}`)
      : self && d.signedIn && busy(src.social)
        ? card('Player code', skel(2))
        : self && d.signedIn && src.social === 'failed'
          ? card('Player code', failed('your code'))
          : '';
    const hidden = o.flag?.hidden ?? false;
    const flag = o.flag
      ? card('Privacy', `<label class="pfx-switch"><input type="checkbox" data-a="flag" data-testid="profile-flag"${hidden ? '' : ' checked'}><span>Show my country flag${d.cc && !hidden ? ` ${ccHtml(d.cc)}` : ''}</span></label><p class="pfx-fine">Match history is public. More choices are in Settings.</p>`)
      : '';
    const set = card(
      'Settings',
      `<p class="pfx-fine">Sound, graphics, controls and notifications.</p><button type="button" class="pl-btn ghost small" data-a="settings" data-testid="profile-settings">Open Settings</button>${o.openTrack ? '<button type="button" class="pl-btn ghost small" data-a="track">Treat Track</button>' : ''}`,
    );
    return pane(`<div class="pfx-agrid">${acc}${code}${flag}${set}</div>`);
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
    const frames = wearableFrames([...owned()])
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
    const focusTab = active?.dataset.tab && root.contains(active) && active.classList.contains('cst-tab') ? active.dataset.tab : null;
    const view = tab === 'overview' ? overview() : tab === 'matches' ? matchesView() : tab === 'champions' ? championsView() : tab === 'stats' ? statsView() : tab === 'collection' ? collectionView() : accountView();
    const inert = edit ? ' inert' : '';
    const nav = tabs
      .map((t) => `<button type="button" role="tab" id="pfx-tab-${t}" class="cst-tab${t === tab ? ' on' : ''}" data-a="tab" data-tab="${t}" aria-selected="${t === tab}" aria-controls="pfx-panel" tabindex="${t === tab ? 0 : -1}" data-testid="profile-tab-${t}">${TAB_LABEL[t]}</button>`)
      .join('');
    const yarn = self && d.yarn !== null ? `<span class="cst-chip" aria-label="${esc(`${num(d.yarn)} Yarn`)}"><img src="${base}assets/splash/yarn.svg" alt="" width="22" height="22"><b>${num(d.yarn)}</b></span>` : '';
    const hero = bannerHero(d);
    root.dataset.tab = tab;
    root.dataset.side = HEROES[hero]?.side ?? 'cat';
    root.innerHTML = `<div class="pfx-backdrop" aria-hidden="true">${splash(hero, '720px', 'pfx-bdwash')}${splash(hero, '(min-width: 600px) 720px, 360px', 'pfx-bdart')}</div><div class="card cst-frame">
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
    if (on && bar && bar.scrollWidth > bar.clientWidth) {
      const x = on.getBoundingClientRect().left - bar.getBoundingClientRect().left + bar.scrollLeft;
      bar.scrollLeft = Math.max(0, x - (bar.clientWidth - on.offsetWidth) / 2);
    }
    if (focusTab) root.querySelector<HTMLElement>(`.cst-tab[data-tab="${tab}"]`)?.focus({ preventScroll: true });
    else if (edit && !root.querySelector('.pfx-editor')?.contains(doc.activeElement)) root.querySelector<HTMLElement>('.pfx-editor [data-a="edit-close"]')?.focus({ preventScroll: true });
  };

  // -------------------------------------------------------------------------------------------------- data
  const deviceRows = d.rows;
  const settle = (p: Promise<ApiResult>): Promise<ApiResult> => p.catch((): ApiResult => ({ id: 'x', ok: false, status: 0 }));
  const fetchAll = async (): Promise<void> => {
    if (!remote()) {
      for (const k of Object.keys(src) as (keyof Sources)[]) src[k] = 'ok';
      if (!d.stats) d.stats = statsOfRows(d.rows);
      return render();
    }
    const api = o.api!;
    const want: (keyof Sources)[] = self ? ['name', 'social', 'ranked', 'hist'] : ['hist'];
    // only what is not loaded yet (a retry asks again for the failed ones)
    const todo = want.filter((k) => src[k] !== 'ok');
    for (const k of todo) src[k] = 'loading';
    if (!self) for (const k of ['name', 'social', 'ranked'] as const) src[k] = 'ok';
    render();
    const call = (k: keyof Sources): Promise<ApiResult> =>
      k === 'name' ? settle(api('name.get')) : k === 'social' ? settle(api('social.get')) : k === 'ranked' ? settle(api('ranked.me')) : settle(api('history.list', o.friend ? { code: o.friend.code } : {}));
    const res = await Promise.all(todo.map(async (k) => [k, await call(k)] as const));
    if (disposed) return;
    for (const [k, r] of res) {
      if (k === 'hist') {
        if (r.ok && r.body) {
          const b = r.body as { owner?: { name?: unknown }; rows?: unknown[]; stats?: unknown; player?: unknown };
          const rows = (Array.isArray(b.rows) ? b.rows : []).map((x, i) => rowOf(x, `s${i}`)).filter((x): x is ProfileRow => !!x);
          if (rows.length || !self) d.rows = rows;
          d.stats = parseStats(b.stats) ?? statsOfRows(d.rows);
          if (!self) {
            if (typeof b.owner?.name === 'string' && b.owner.name) d.name = b.owner.name.slice(0, 40);
            const card = parsePlayerCard(b.player);
            if (card) {
              d.hasCard = true;
              d.ranked = card.ranked;
              d.rankedNone = card.none;
              d.matches = card.matches;
              d.level = levelInfo(card.matches);
              if (card.av) {
                d.av = card.av;
                d.title = titleOfAv(card.av);
                d.frame = frameOfAv(card.av);
              }
              if (card.cc) d.cc = card.cc;
            }
          }
          src.hist = 'ok';
        } else if (!self && (r.status === 403 || r.status === 404)) {
          priv = true;
          src.hist = 'ok';
        } else {
          src.hist = 'failed';
          // keep the last known rows; yours fall back to this device's
          if (self && !d.rows.length) d.rows = deviceRows;
          if (!d.stats && self && d.rows.length) d.stats = statsOfRows(d.rows);
        }
      } else if (k === 'name') {
        if (r.ok && r.body) {
          info = r.body as NameInfo;
          d.name = info.name || d.name;
          o.onName?.(info.name);
          src.name = 'ok';
        } else src.name = 'failed';
      } else if (k === 'social') {
        if (r.ok && r.body) {
          const me = (r.body as { me?: { code?: string; av?: unknown; title?: string | null; frame?: string | null } }).me;
          if (me) {
            d.code = typeof me.code === 'string' ? me.code : d.code;
            if (me.av) d.av = me.av;
            if (me.title !== undefined) d.title = me.title ?? null;
            if (me.frame !== undefined) d.frame = me.frame ?? null;
          }
          src.social = 'ok';
        } else src.social = 'failed';
      } else if (k === 'ranked') {
        if (r.ok) {
          d.ranked = parseRankedCard(r.body) ?? d.ranked;
          src.ranked = 'ok';
        } else src.ranked = 'failed';
      }
    }
    root.dataset.failed = (Object.keys(src) as (keyof Sources)[]).filter((k) => src[k] === 'failed').join(' ');
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
    const r = await settle(o.api('name.set', { name }));
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
    const r = await settle(o.api('social.me', args));
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

  const goTab = (t: ProfileTab, focus: boolean): void => {
    if (!tabs.includes(t)) return;
    if (t !== tab) {
      tab = t;
      scrollTop = 0;
      say('');
      o.track?.('profile_tab', { tab: t });
    }
    render();
    if (focus) root.querySelector<HTMLElement>(`.cst-tab[data-tab="${t}"]`)?.focus({ preventScroll: true });
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
  // ARIA tabs: Left / Right move and open the next tab, Home / End the first and last (roving tabindex)
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (!t.classList?.contains('cst-tab')) return;
    const i = tabs.indexOf(tab);
    const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    goTab(next, true);
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
    const fr = o.friend ? { code: o.friend.code, name: d.name } : null;
    switch (a) {
      case 'close':
        close();
        return o.onClose();
      case 'tab': {
        const t = el.dataset.tab;
        if (isProfileTab(t)) goTab(t, false);
        return;
      }
      case 'jump': {
        e.preventDefault();
        root.querySelector<HTMLElement>(`#pfx-${el.dataset.k}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      case 'retry':
        return void fetchAll();
      case 'signin':
        return leave(() => o.signIn());
      case 'history':
        return leave(() => o.openHistory(fr));
      case 'message':
        return fr && o.message ? leave(() => o.message!(fr)) : undefined;
      case 'invite':
        return fr && o.invite ? leave(() => o.invite!(fr)) : undefined;
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
        if (!canEdit()) return;
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

/** A worn title / border from an avatar view (`t`, `f`). */
const titleOfAv = (av: unknown): string | null => {
  const t = (av as { t?: unknown } | null)?.t;
  return typeof t === 'string' && /^title\.[a-z0-9._-]{1,48}$/.test(t) ? t : null;
};
const frameOfAv = (av: unknown): string | null => {
  const f = (av as { f?: unknown } | null)?.f;
  return typeof f === 'string' && /^frame\.[a-z0-9._-]{1,48}$/.test(f) ? f : null;
};

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
