/**
 * Match history (MATCH-MOMENTS.md §1, MATCH-HISTORY.md): Wild Rift style. The list (champion, result, mode, K / D / A,
 * grade, MVP, length, date) with this season's numbers on top (win rate, KDA, MVPs, favourite champions), filters by
 * mode, and a tap opens the match: both teams' scoreboard (level, K / D / A, CS, Fish, Toys, grade), a damage graph
 * (dealt and taken), the MVP, and Watch replay where this device kept the replay.
 *
 * Yours comes from the account (`history.list`; the server writes rows only from verified results), merged with the
 * rows kept on this device (offline, unsynced, and the replays). A friend's comes by their player code, when their
 * choice allows it (everyone / friends / only me; default friends). Without a session or a connection the device rows
 * show, as before. Opened from the Profile's "Match history" pill and from a friend's row. Its own lazy chunk.
 */
import type { HeroId } from '../../sim/api';
import { SIM_VERSION } from '../../sim/version';
import type { ApiArgs, ApiOp, ApiResult } from '../../embed/api';
import { HERO_TEXT } from '../heroText';
import { heroFaceUrl } from '../art';
import { ago, clock, loadHistory, MODE_LABEL, replayOf, type HistoryEntry } from '../../replay/store';
import '../css/moments.css';
import '../css/history.css';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export type Outcome = 'won' | 'lost' | 'draw';
export type ServerMode = 'skirmish' | 'classic' | 'blitz' | 'pvp' | 'ranked' | 'coop' | 'practice' | 'arcade';
export type Filter = 'all' | 'ranked' | 'pvp' | 'ai' | 'blitz' | 'arcade';
export const FILTERS: readonly Filter[] = Object.freeze(['all', 'ranked', 'pvp', 'ai', 'blitz', 'arcade'] as Filter[]);
const FILTER_LABEL: Readonly<Record<Filter, string>> = Object.freeze({ all: 'All', ranked: 'Ranked', pvp: 'PvP', ai: 'vs AI', blitz: 'Blitz', arcade: 'Arcade' });

/** The server's list row (MATCH-HISTORY.md). */
export interface ServerRow {
  id: string;
  at: number;
  mode: ServerMode;
  map: 'crossing' | 'hearthwood';
  mutator: string | null;
  difficulty: string;
  outcome: Outcome;
  seconds: number;
  hero: string;
  k: number;
  d: number;
  a: number;
  grade: string | null;
  mvp: 'mvp' | 'svp' | null;
  key?: string;
}
export interface ServerPlayer {
  slot: number;
  team: 0 | 1;
  hero: string;
  name: string | null;
  bot: boolean;
  owner: boolean;
  level: number;
  k: number;
  d: number;
  a: number;
  damage: number;
  taken: number;
  tower: number;
  heal: number;
  fish: number;
  toys: number;
  cs: number;
  grade: string | null;
}
export interface ServerMatch extends ServerRow {
  slot: number;
  winner: 0 | 1 | -1;
  mvpSlot: number | null;
  svpSlot: number | null;
  reason: string | null;
  players: ServerPlayer[];
}
export interface SeasonStats {
  season: string;
  name: string;
  matches: number;
  wins: number;
  winRate: number | null;
  kda: number;
  mvp: number;
  favourites: { hero: string; matches: number; wins: number; winRate: number }[];
}
export interface ServerPage {
  owner: { name: string; self: boolean };
  rows: ServerRow[];
  next: string | null;
  stats?: SeasonStats;
}

/** One row as shown: from the account (`sid`) or from this device only. */
export interface ShownRow {
  sid: string | null;
  at: number;
  hero: string;
  heroName: string | null;
  mode: string;
  filter: Filter;
  outcome: Outcome;
  grade: string | null;
  k: number;
  d: number;
  a: number;
  seconds: number;
  mvp: 'mvp' | 'svp' | null;
  /** The device row of this match (its replay, its champion name), or null. */
  local: HistoryEntry | null;
}

export interface HistoryOpts {
  /** The device rows (default: loadHistory()). */
  rows?: readonly HistoryEntry[];
  now?: number;
  /** The host's API (absent: device rows only). */
  api?(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  /** A friend's history (their player code and name); absent: yours. */
  friend?: { code: string; name: string } | null;
  /** A registered account is signed in. */
  signedIn?: boolean;
  onWatch(id: string): void;
  onClose(): void;
  track?(event: string, props?: Record<string, string | number | boolean>): void;
}

const ARCADE: Readonly<Record<string, string>> = Object.freeze({
  cannon: 'Cannon Chaos',
  toybox: 'Toy Box',
  rapid: 'Rapid Paws',
  bounty: 'Bounty Hunt',
  onelane: 'One Lane',
  duel: 'Duel',
  boss: 'Boss Weekend',
});

/** "Ranked 3v3", "PvP 5v5", "Co-op 3v3"… Pure. */
export function modeLabel(r: Pick<ServerRow, 'mode' | 'map' | 'mutator'>): string {
  const size = r.map === 'hearthwood' ? '5v5' : '3v3';
  switch (r.mode) {
    case 'ranked':
      return `Ranked ${size}`;
    case 'pvp':
      return `PvP ${size}`;
    case 'coop':
      return `Co-op ${size}`;
    case 'classic':
      return 'Classic 5v5';
    case 'blitz':
      return 'Blitz';
    case 'practice':
      return 'Practice';
    case 'arcade':
      return ARCADE[r.mutator ?? ''] ?? 'Arcade';
    default:
      return `Skirmish ${size}`;
  }
}

export const filterOfServer = (m: ServerMode): Filter => (m === 'ranked' ? 'ranked' : m === 'pvp' ? 'pvp' : m === 'blitz' ? 'blitz' : m === 'practice' || m === 'arcade' ? 'arcade' : 'ai');
export const filterOfLocal = (m: HistoryEntry['mode']): Filter => (m === 'pvp' ? 'pvp' : m === 'blitz' ? 'blitz' : m === 'practice' ? 'arcade' : 'ai');

/** What the row's action says. Pure. */
export function watchState(r: Pick<HistoryEntry, 'replay' | 'simVersion' | 'noReplay'>, simVersion = SIM_VERSION): 'watch' | 'older' | 'party' | 'none' {
  if (r.noReplay === 'party') return 'party';
  if (!r.replay) return 'none';
  return r.simVersion === simVersion ? 'watch' : 'older';
}

/** A device row's match key (`finalHash:ticks`): its own, else its kept replay's. */
export function localKey(r: HistoryEntry, replay: (id: string) => { finalHash: string; ticks: number } | null = replayOf): string | null {
  if (r.key) return r.key;
  const rec = r.replay ? replay(r.id) : null;
  return rec ? `${rec.finalHash}:${rec.ticks}` : null;
}

const fromLocal = (r: HistoryEntry): ShownRow => ({
  sid: null,
  at: r.at,
  hero: r.hero,
  heroName: r.heroName ?? null,
  mode: MODE_LABEL[r.mode] ?? r.mode,
  filter: filterOfLocal(r.mode),
  outcome: r.outcome,
  grade: r.grade,
  k: r.k,
  d: r.d,
  a: r.a,
  seconds: r.seconds,
  mvp: null,
  local: r,
});

const fromServer = (s: ServerRow, l: HistoryEntry | null): ShownRow => ({
  sid: s.id,
  at: s.at,
  hero: s.hero,
  heroName: l?.heroName ?? null,
  mode: modeLabel(s),
  filter: filterOfServer(s.mode),
  outcome: s.outcome,
  grade: s.grade,
  k: s.k,
  d: s.d,
  a: s.a,
  seconds: s.seconds,
  mvp: s.mvp,
  local: l,
});

/**
 * Your list: the account's rows, each with its device row when one has the same match key (its replay and name), then
 * the device rows the account does not have (offline, or never sent) inside the page's time span. Device rows from an
 * older build without a key are left out (the account may list them already). Pure.
 */
export function mergeRows(server: readonly ServerRow[], local: readonly HistoryEntry[], complete: boolean, keyOf: (r: HistoryEntry) => string | null = (r) => localKey(r)): ShownRow[] {
  const byKey = new Map<string, HistoryEntry>();
  const keys = new Map<HistoryEntry, string | null>();
  for (const r of local) {
    const k = keyOf(r);
    keys.set(r, k);
    if (k && !byKey.has(k)) byKey.set(k, r);
  }
  const used = new Set<HistoryEntry>();
  const out: ShownRow[] = server.map((s) => {
    const l = s.key ? (byKey.get(s.key) ?? null) : null;
    if (l) used.add(l);
    return fromServer(s, l);
  });
  const oldest = server.length ? server[server.length - 1].at : -Infinity;
  for (const r of local) {
    if (used.has(r) || !keys.get(r)) continue;
    if (!complete && r.at < oldest) continue;
    out.push(fromLocal(r));
  }
  return out.sort((x, y) => y.at - x.at);
}

const heroTitle = (h: string, name?: string | null): string => name || HERO_TEXT[h as HeroId]?.title || h;
const face = (h: string, size: number, cls = 'mh-face'): string => `<img class="${cls}" src="${esc(heroFaceUrl(h as HeroId))}" alt="" loading="lazy" width="${size}" height="${size}">`;
const resultWord = (o: Outcome): string => (o === 'won' ? 'Victory' : o === 'draw' ? 'Draw' : 'Defeat');
const badge = (m: 'mvp' | 'svp' | null): string => (m ? `<b class="mh-mvp ${m}" title="${m === 'mvp' ? 'Best on the winning team' : 'Best on the losing team'}">${m.toUpperCase()}</b>` : '');

export function rowHtml(r: ShownRow, now: number, withWatch = true): string {
  const name = heroTitle(r.hero, r.heroName);
  const res = resultWord(r.outcome);
  const w = withWatch && r.local ? watchState(r.local) : 'none';
  const action =
    w === 'watch'
      ? `<button type="button" class="pl-btn small mh-watch" data-watch="${esc(r.local!.id)}" aria-label="${esc(`Watch the replay: ${name}, ${res}`)}">▶ Watch</button>`
      : w === 'older'
        ? '<small class="mh-note" title="Made with an older version of the game">Older version</small>'
        : '';
  const open = r.sid ?? `local:${r.local?.id ?? ''}`;
  return `<li class="mh-row ${r.outcome}" data-open="${esc(open)}" tabindex="0" role="button" aria-label="${esc(`${res}, ${name}, ${r.mode}: open the match`)}">
    ${face(r.hero, 48)}
    <span class="mh-main"><b>${esc(name)}</b><small>${esc(r.mode)} · ${esc(ago(r.at, now))}${r.sid ? '' : ' · <i class="mh-dev">this device</i>'}</small></span>
    <span class="mh-res"><b class="mh-out">${res}</b><small>${clock(r.seconds)}</small></span>
    <span class="mh-kda" data-kda="${r.k}/${r.d}/${r.a}"><b>${r.k} / ${r.d} / ${r.a}</b><small>K / D / A</small></span>
    ${r.grade ? `<b class="mh-grade" data-grade="${esc(r.grade)}" title="Grade ${esc(r.grade)}">${esc(r.grade)}</b>` : '<span class="mh-grade none"></span>'}
    <span class="mh-act">${badge(r.mvp)}${action}</span>
  </li>`;
}

export function seasonHtml(s: SeasonStats | undefined): string {
  if (!s) return '';
  if (!s.matches) return `<section class="mh-season" data-testid="history-season"><small class="mh-sname">${esc(s.name)}</small><p class="mh-snone">No matches this season yet.</p></section>`;
  const favs = s.favourites
    .map((f) => `<span class="mh-fav" title="${esc(`${heroTitle(f.hero)}: ${f.matches} ${f.matches === 1 ? 'match' : 'matches'}, ${f.winRate}% won`)}">${face(f.hero, 32, 'mh-fface')}<small>${f.winRate}%</small></span>`)
    .join('');
  return `<section class="mh-season" data-testid="history-season">
    <small class="mh-sname">${esc(s.name)}</small>
    <div class="mh-snums">
      <span><b>${s.matches}</b><small>Matches</small></span>
      <span><b data-testid="history-winrate">${s.winRate ?? 0}%</b><small>Win rate</small></span>
      <span><b>${s.kda.toFixed(1)}</b><small>KDA</small></span>
      <span><b>${s.mvp}</b><small>MVP</small></span>
      ${favs ? `<span class="mh-favs" aria-label="Favourite champions">${favs}</span>` : ''}
    </div>
  </section>`;
}

const fmt = (n: number): string => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString('en-US'));
const playerName = (p: ServerPlayer): string => (p.bot ? heroTitle(p.hero) : (p.name ?? 'Player'));

function teamHtml(m: ServerMatch, team: 0 | 1): string {
  const mine = m.players.find((p) => p.owner)?.team ?? 0;
  const players = m.players.filter((p) => p.team === team);
  const won = m.winner === team;
  const label = `${team === mine ? 'Your team' : 'Enemy team'} · ${m.winner === -1 ? 'Draw' : won ? 'Victory' : 'Defeat'}`;
  const kills = players.reduce((t, p) => t + p.k, 0);
  const rows = players
    .map((p) => {
      const mvp = m.mvpSlot === p.slot ? 'mvp' : m.svpSlot === p.slot ? 'svp' : null;
      return `<tr class="${p.owner ? 'me' : ''}" data-slot="${p.slot}">
        <td class="mh-pl">${face(p.hero, 30, 'mh-pface')}<span class="mh-pn"><b>${esc(playerName(p))}</b><small>${p.bot ? '<i class="mh-bot">Bot</i>' : esc(heroTitle(p.hero))}${p.owner ? ' · <i class="mh-you">You</i>' : ''}</small></span>${badge(mvp)}</td>
        <td class="mh-num">${p.level}</td>
        <td class="mh-num mh-k">${p.k}/${p.d}/${p.a}</td>
        <td class="mh-num">${p.cs}</td>
        <td class="mh-num">${fmt(p.fish)}</td>
        <td class="mh-num mh-toys">${p.toys}</td>
        <td class="mh-num">${p.grade ? `<b class="mh-g" data-grade="${esc(p.grade)}">${esc(p.grade)}</b>` : '–'}</td>
      </tr>`;
    })
    .join('');
  return `<section class="mh-team ${won ? 'won' : m.winner === -1 ? 'draw' : 'lost'}" data-team="${team}">
    <h3><span>${esc(label)}</span><small>${kills} ${kills === 1 ? 'takedown' : 'takedowns'}</small></h3>
    <table class="mh-table"><thead><tr><th scope="col">Player</th><th scope="col" title="Level">Lv</th><th scope="col">K/D/A</th><th scope="col" title="Last hits">CS</th><th scope="col">Fish</th><th scope="col" class="mh-toys">Toys</th><th scope="col">Grade</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function damageHtml(m: ServerMatch): string {
  const max = Math.max(1, ...m.players.map((p) => Math.max(p.damage, p.taken)));
  const mine = m.players.find((p) => p.owner)?.team ?? 0;
  const ordered = [...m.players].sort((a, b) => (a.team === mine ? 0 : 1) - (b.team === mine ? 0 : 1) || a.slot - b.slot);
  const bar = (v: number, cls: string, label: string): string => `<span class="mh-bar ${cls}" role="img" aria-label="${esc(`${label}: ${v}`)}"><i style="width:${Math.round((100 * v) / max)}%"></i><small>${fmt(v)}</small></span>`;
  return `<div class="mh-graph" data-testid="history-damage">
    <p class="mh-legend"><i class="dealt"></i>Damage to champions <i class="taken"></i>Damage taken</p>
    ${ordered
      .map(
        (p) => `<div class="mh-grow ${p.team === mine ? 'ally' : 'enemy'}${p.owner ? ' me' : ''}">${face(p.hero, 28, 'mh-pface')}<span class="mh-gn">${esc(playerName(p))}</span><span class="mh-bars">${bar(p.damage, 'dealt', 'Damage to champions')}${bar(p.taken, 'taken', 'Damage taken')}</span></div>`,
      )
      .join('')}
  </div>`;
}

export function matchHtml(m: ServerMatch, now: number, watchId: string | null): string {
  const mine = m.players.find((p) => p.owner)?.team ?? 0;
  const mvp = m.players.find((p) => p.slot === m.mvpSlot);
  return `<div class="mh-detail" data-testid="history-match">
    <div class="mh-dtop"><button type="button" class="pl-btn ghost small mh-back" data-a="back" aria-label="Back to the list">‹ Back</button>
      <span class="mh-dres ${m.outcome}"><b>${resultWord(m.outcome)}</b><small>${esc(modeLabel(m))} · ${clock(m.seconds)} · ${esc(ago(m.at, now))}</small></span>
      ${watchId ? `<button type="button" class="pl-btn small mh-watch" data-watch="${esc(watchId)}" data-testid="history-watch">▶ Watch replay</button>` : ''}</div>
    ${mvp ? `<p class="mh-mvpline">${face(mvp.hero, 28, 'mh-pface')}<span><b class="mh-mvp mvp">MVP</b> ${esc(playerName(mvp))}${mvp.bot ? ' <i class="mh-bot">Bot</i>' : ''} · ${mvp.k}/${mvp.d}/${mvp.a}</span></p>` : ''}
    <div class="mh-tabs" role="tablist"><button type="button" role="tab" class="mh-tab" data-tab="board" aria-selected="true">Scoreboard</button><button type="button" role="tab" class="mh-tab" data-tab="damage" aria-selected="false">Damage</button></div>
    <div class="mh-pane" data-pane="board">${teamHtml(m, mine as 0 | 1)}${teamHtml(m, (1 - mine) as 0 | 1)}</div>
    <div class="mh-pane" data-pane="damage" hidden>${damageHtml(m)}</div>
  </div>`;
}

/** A device-only row: its own numbers (the full scoreboard is kept for matches saved to the account). */
function localDetailHtml(r: ShownRow, now: number): string {
  const w = r.local && watchState(r.local) === 'watch' ? r.local.id : null;
  return `<div class="mh-detail" data-testid="history-match">
    <div class="mh-dtop"><button type="button" class="pl-btn ghost small mh-back" data-a="back" aria-label="Back to the list">‹ Back</button>
      <span class="mh-dres ${r.outcome}"><b>${resultWord(r.outcome)}</b><small>${esc(r.mode)} · ${clock(r.seconds)} · ${esc(ago(r.at, now))}</small></span>
      ${w ? `<button type="button" class="pl-btn small mh-watch" data-watch="${esc(w)}" data-testid="history-watch">▶ Watch replay</button>` : ''}</div>
    <p class="mh-mvpline">${face(r.hero, 28, 'mh-pface')}<span><b>${esc(heroTitle(r.hero, r.heroName))}</b> · ${r.k}/${r.d}/${r.a}${r.grade ? ` · Grade ${esc(r.grade)}` : ''}</span></p>
    <p class="mh-empty">The full scoreboard is kept for matches saved to your account. This one is on this device only.</p>
  </div>`;
}

export const errText = (r: ApiResult, friend: string | null): string => {
  const code = (r.body as { code?: string } | undefined)?.code ?? '';
  if (r.status === 0) return 'No connection. Try again.';
  if (r.status === 429) return 'Too many tries. Wait a minute.';
  if (code === 'PAWLEGENDS_HISTORY_PRIVATE') return `${friend ?? 'This player'} keeps their match history private.`;
  if (code === 'PAWLEGENDS_NEED_ACCOUNT') return "Sign in to see your friends' match history.";
  if (code === 'PAWLEGENDS_SOCIAL_NOT_FOUND') return 'No player with this code.';
  if (code === 'PAWLEGENDS_HISTORY_NOT_FOUND') return 'That match is no longer kept.';
  return 'Something went wrong. Try again.';
};

const pageOf = (b: unknown): ServerPage | null => {
  const p = b as ServerPage | null;
  return p && Array.isArray(p.rows) && !!p.owner && typeof p.owner === 'object' ? p : null;
};

export function historySheet(parent: HTMLElement, o: HistoryOpts): HTMLElement {
  const local = o.rows ?? loadHistory();
  const now = o.now ?? Date.now();
  const friend = o.friend ?? null;
  const root = document.createElement('div');
  root.className = 'pl-screen pl-menu mm-history';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', friend ? `${friend.name}'s match history` : 'Match history');
  root.dataset.testid = 'match-history';
  root.innerHTML = `<div class="card mh-card"><button class="pl-x" data-a="x" aria-label="Close match history">✕</button><div class="mh-body"></div><button class="pl-btn big" data-a="close">Done</button></div>`;
  const card = root.querySelector<HTMLElement>('.mh-card')!;
  const body = root.querySelector<HTMLElement>('.mh-body')!;

  let filter: Filter = 'all';
  let server: ServerRow[] | null = null;
  let next: string | null = null;
  let stats: SeasonStats | undefined;
  let ownerName = friend?.name ?? '';
  let error = '';
  let loading = !!o.api;
  let more = false;
  let detailOf: string | null = null;
  const details = new Map<string, ServerMatch>();
  let listScroll = 0;

  const shown = (): ShownRow[] => {
    if (friend) return (server ?? []).map((s) => fromServer(s, null));
    if (!server) return local.map(fromLocal);
    return mergeRows(server, local, !next);
  };

  const listHtml = (): string => {
    const all = shown();
    const rows = filter === 'all' ? all : all.filter((r) => r.filter === filter);
    const title = friend ? `${esc(ownerName || friend.name)}'s history` : 'Match history';
    const chips = server ? `<div class="mh-filters" role="tablist" aria-label="Filter by mode">${FILTERS.map((f) => `<button type="button" role="tab" class="mh-chip" data-filter="${f}" aria-selected="${f === filter}">${FILTER_LABEL[f]}</button>`).join('')}</div>` : '';
    const wins = rows.filter((r) => r.outcome === 'won').length;
    const sum = !server && !loading && rows.length ? `<p class="mh-sum">Last ${rows.length} ${rows.length === 1 ? 'match' : 'matches'} · ${wins} ${wins === 1 ? 'win' : 'wins'} · replays of your last 5 solo matches</p>` : '';
    const list =
      loading && (friend || !local.length)
        ? '<p class="mh-empty" role="status">Loading…</p>'
        : error && friend
          ? `<p class="mh-empty" role="status" data-testid="history-error">${esc(error)}</p>`
          : rows.length
            ? `<ol class="mh-list">${rows.map((r) => rowHtml(r, now, !friend)).join('')}</ol>`
            : `<p class="mh-empty">${filter !== 'all' ? `No ${FILTER_LABEL[filter]} matches yet.` : friend ? 'No matches yet.' : 'No matches yet. Play one and it shows up here, with a replay to watch.'}</p>`;
    const moreBtn = server && next ? `<button type="button" class="pl-btn ghost small mh-more" data-a="more"${more ? ' disabled' : ''}>${more ? 'Loading…' : 'Show older matches'}</button>` : '';
    // founder Nov 17: match history is public, so there is no privacy choice (the server ignores any stored one)
    const fine = friend
      ? ''
      : server
        ? '<p class="fine">Saved to your account (your last 100 matches), and other players can see it. Replays stay on this device.</p>'
        : '<p class="fine">Saved on this device.</p>';
    return `<h2>${title}</h2>${seasonHtml(stats)}${chips}${sum}${list}${moreBtn}${fine}`;
  };

  const render = (): void => {
    if (detailOf) {
      const id = detailOf;
      if (id.startsWith('local:')) {
        const r = shown().find((x) => !x.sid && x.local?.id === id.slice(6));
        body.innerHTML = r ? localDetailHtml(r, now) : '<p class="mh-empty">Not found.</p>';
      } else {
        const m = details.get(id);
        const row = shown().find((x) => x.sid === id);
        const watch = !friend && row?.local && watchState(row.local) === 'watch' ? row.local.id : null;
        body.innerHTML = m
          ? matchHtml(m, now, watch)
          : error
            ? `<div class="mh-detail"><button type="button" class="pl-btn ghost small mh-back" data-a="back">‹ Back</button><p class="mh-empty" role="status">${esc(error)}</p></div>`
            : '<p class="mh-empty" role="status">Loading…</p>';
      }
      return;
    }
    body.innerHTML = listHtml();
  };

  const load = async (append: boolean): Promise<void> => {
    if (!o.api) return;
    const args: ApiArgs = {};
    if (friend) args.code = friend.code;
    if (filter !== 'all') args.mode = filter;
    if (append && next) args.before = next;
    const r = await o.api('history.list', args);
    if (!root.isConnected) return;
    loading = false;
    more = false;
    const p = r.ok ? pageOf(r.body) : null;
    if (!p) {
      // yours: the device rows, as before; a friend's: why not
      if (friend) error = errText(r, friend.name);
      render();
      return;
    }
    error = '';
    server = append && server ? [...server, ...p.rows] : p.rows;
    next = p.next;
    if (p.stats) stats = p.stats;
    if (p.owner?.name) ownerName = p.owner.name;
    if (!detailOf) render();
  };

  const openMatch = async (id: string): Promise<void> => {
    listScroll = card.scrollTop;
    detailOf = id;
    error = '';
    render();
    card.scrollTop = 0;
    o.track?.('history_match', { friend: !!friend, local: id.startsWith('local:') });
    if (id.startsWith('local:') || details.has(id) || !o.api) return;
    const r = await o.api('history.match', { match: id, ...(friend ? { code: friend.code } : {}) });
    if (r.ok && r.body && Array.isArray((r.body as ServerMatch).players)) details.set(id, r.body as ServerMatch);
    else error = errText(r, friend?.name ?? null);
    if (detailOf === id && root.isConnected) render();
  };

  const back = (): void => {
    const from = detailOf;
    detailOf = null;
    error = '';
    render();
    card.scrollTop = listScroll;
    const row = from ? [...root.querySelectorAll<HTMLElement>('[data-open]')].find((el) => el.dataset.open === from) : null;
    (row ?? root.querySelector<HTMLElement>('[data-open]'))?.focus({ preventScroll: true });
  };

  const close = (): void => {
    if (!root.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    o.onClose();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (detailOf) back();
      else close();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      const t = e.target as HTMLElement | null;
      const id = t && root.contains(t) && t.matches('[data-open]') ? t.dataset.open : null;
      if (id) {
        e.preventDefault();
        void openMatch(id);
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const watch = t.closest<HTMLElement>('[data-watch]')?.dataset.watch;
    if (watch) {
      close();
      o.onWatch(watch);
      return;
    }
    if (t.closest('[data-a="close"], [data-a="x"]') || t === root) {
      close();
      return;
    }
    if (t.closest('[data-a="back"]')) {
      back();
      return;
    }
    const chip = t.closest<HTMLElement>('[data-filter]')?.dataset.filter as Filter | undefined;
    if (chip && FILTERS.includes(chip) && chip !== filter) {
      filter = chip;
      o.track?.('history_filter', { filter: chip });
      if (o.api && server) {
        loading = true;
        render();
        void load(false);
      } else render();
      return;
    }
    if (t.closest('[data-a="more"]') && next && !more) {
      more = true;
      render();
      void load(true);
      return;
    }
    const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab;
    if (tab) {
      root.querySelectorAll<HTMLElement>('.mh-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
      root.querySelectorAll<HTMLElement>('.mh-pane').forEach((p) => (p.hidden = p.dataset.pane !== tab));
      return;
    }
    if (t.closest('select, label')) return;
    const open = t.closest<HTMLElement>('[data-open]')?.dataset.open;
    if (open) void openMatch(open);
  });
  parent.appendChild(root);
  render();
  root.querySelector<HTMLElement>('.mh-watch, [data-a="close"]')?.focus({ preventScroll: true });
  void load(false);
  return root;
}
