/**
 * LoL-style party invites and the fast inbox (docs/plans/moba/SOCIAL-INVITES.md). The app polls `social.inbox` every
 * 4 s on menus and in the party lobby (never in a match, never in a hidden tab); the server answers 204 while the
 * player's own rev is unchanged, so a poll is one indexed read. This module is the pure part (parsing, the sim check)
 * plus the three toasts: a friend's invite (Accept / Decline, a 60 s countdown), an answer to your own invite, and a
 * DM line. Names are always set with `textContent`. Loaded lazily, the first time the inbox has something to show.
 */
import { SIM_VERSION } from '../sim/version';
import { previewText } from '../data/chatPhrases';

export interface InboxInvite {
  id: string;
  from: { code: string; name: string };
  party: string;
  mode?: 'ranked';
  /** The inviter's sim build (`<version>.<hash>`); absent from an older backend or an older game. */
  sim?: string;
  /** Milliseconds left when the server answered. */
  ttl: number;
  /**
   * Nov 19: past its 60 s window but the inviter still waits in that lobby (the phone was locked, the tab hidden, or a
   * match was on): `age` is how long ago it was sent; `held` when this game said `later` during a match.
   */
  missed?: true;
  age?: number;
  held?: true;
}

export interface InboxAnswer {
  id: string;
  name: string;
  /** `later`: the friend is in a match; the invite waits for its end (Nov 19). */
  answer: 'accepted' | 'declined' | 'later';
}

export interface InboxChat {
  unread: number;
  top?: { thread: string; fromName: string; preview: string; code?: string };
}

export interface Inbox {
  rev?: string;
  invites: InboxInvite[];
  answers: InboxAnswer[];
  chat?: InboxChat;
}

const INVITE_ID = /^[a-f0-9]{24}$/;
const PARTY = /^[A-Za-z0-9]{4,12}$/;
const SIM = /^\d{1,4}\.[A-Za-z0-9]{4,24}$/;
/** An invite lives 60 s on the server; the toast never shows longer than that. */
export const INVITE_MAX_MS = 60_000;
/** The inbox poll (SOCIAL-INVITES.md: an invite or a DM shows within ~4 s). */
export const INBOX_EVERY_MS = 4_000;

const str = (v: unknown, max = 64): string | null => (typeof v === 'string' && v.length <= max ? v : null);

/** One invite row from the inbox or the pulse, cleaned; null when it is not one. */
export function inviteOf(v: unknown): InboxInvite | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const from = r.from as Record<string, unknown> | undefined;
  const party = str(r.party, 12);
  if (!party || !PARTY.test(party) || !from || typeof from.name !== 'string') return null;
  const id = str(r.id, 24) ?? '';
  const ttl = typeof r.ttl === 'number' && Number.isFinite(r.ttl) ? Math.max(0, Math.min(INVITE_MAX_MS, r.ttl)) : INVITE_MAX_MS;
  return {
    id: INVITE_ID.test(id) ? id : '',
    from: { code: str(from.code, 24) ?? '', name: from.name.slice(0, 40) },
    party,
    ...(r.mode === 'ranked' ? { mode: 'ranked' as const } : {}),
    ...(typeof r.sim === 'string' && SIM.test(r.sim) ? { sim: r.sim } : {}),
    ttl,
    ...(r.missed === true ? { missed: true as const, age: typeof r.age === 'number' && Number.isFinite(r.age) ? Math.max(0, r.age) : 0 } : {}),
    ...(r.held === true ? { held: true as const } : {}),
  };
}

/** The `social.inbox` answer, cleaned (unknown parts dropped). */
export function parseInbox(body: unknown): Inbox {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const invites = (Array.isArray(b.invites) ? b.invites : []).map(inviteOf).filter((x): x is InboxInvite => !!x).slice(0, 5);
  const answers = (Array.isArray(b.answers) ? b.answers : [])
    .map((a): InboxAnswer | null => {
      const r = (a ?? {}) as Record<string, unknown>;
      if (typeof r.id !== 'string' || typeof r.name !== 'string' || (r.answer !== 'accepted' && r.answer !== 'declined' && r.answer !== 'later')) return null;
      return { id: r.id.slice(0, 24), name: r.name.slice(0, 40), answer: r.answer };
    })
    .filter((x): x is InboxAnswer => !!x)
    .slice(0, 5);
  const c = b.chat as Record<string, unknown> | undefined;
  let chat: InboxChat | undefined;
  if (c && typeof c.unread === 'number' && Number.isFinite(c.unread)) {
    chat = { unread: Math.max(0, Math.min(999, Math.floor(c.unread))) };
    const t = c.top as Record<string, unknown> | undefined;
    if (t && typeof t.thread === 'string' && typeof t.fromName === 'string')
      chat.top = {
        thread: t.thread.slice(0, 32),
        fromName: t.fromName.slice(0, 40),
        preview: typeof t.preview === 'string' ? t.preview.slice(0, 60) : '',
        ...(typeof t.code === 'string' && t.code.length <= 24 ? { code: t.code } : {}),
      };
  }
  return { ...(typeof b.rev === 'string' && b.rev.length <= 32 ? { rev: b.rev } : {}), invites, answers, ...(chat ? { chat } : {}) };
}

/** This build's sim, as invites carry it (`<SIM_VERSION>.<source hash>`). */
export function buildSim(hash: string = typeof __SIM_HASH__ !== 'undefined' ? __SIM_HASH__ : '0000000000000000'): string {
  return `${SIM_VERSION}.${hash.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || '0000'}`;
}

/**
 * The party relay plays one sim build per party (it refuses a mixed party at Start). `ok`: same build (or the invite
 * does not say); `me`: this game is older (Reload updates it); `them`: the friend's game is older; `differ`: the same
 * version on another source hash (one of you reloads).
 */
export function simCheck(theirs: string | undefined, mine: string = buildSim()): 'ok' | 'me' | 'them' | 'differ' {
  if (!theirs || !SIM.test(theirs) || theirs === mine) return 'ok';
  const [tv, th] = theirs.split('.');
  const [mv, mh] = mine.split('.');
  if (Number(tv) > Number(mv)) return 'me';
  if (Number(tv) < Number(mv)) return 'them';
  return th === mh ? 'ok' : 'differ';
}

/** The toast's second line for a build mismatch ('' when the builds match). */
export function simLine(check: ReturnType<typeof simCheck>, name: string): string {
  if (check === 'me') return `Reload to update your game, then join ${name}.`;
  if (check === 'them') return `${name} has an older version. They need to reload before you can play together.`;
  if (check === 'differ') return `Your game versions differ. Reload to update, then join.`;
  return '';
}

export interface InviteToastOpts {
  /** Ranked duo invite, with this player's lock line (gaps5 polish 4) or null. */
  locked?: string | null;
  sim?: ReturnType<typeof simCheck>;
  onAccept(): void;
  onDecline(): void;
  /** Reload the game (an older build); absent: no Reload button. */
  onReload?(): void;
  /** The countdown ran out without an answer. */
  onExpire?(): void;
  /** Nov 19: this player is in a party lobby of their own (Accept leaves it): the card asks so. */
  inParty?: boolean;
  now?(): number;
}

/** A toast shell: one per class (a newer one replaces it), its test id, on the body. */
function shell(doc: Document, cls: string, testid: string, role = 'status'): HTMLElement {
  doc.querySelector(`.${cls.split(' ')[0]}`)?.remove();
  const el = doc.createElement('div');
  el.className = `${cls} pl-report-toast`;
  el.setAttribute('role', role);
  el.dataset.testid = testid;
  doc.body.appendChild(el);
  return el;
}

/** A button that closes `el` and then runs `fn`. */
function act(doc: Document, el: HTMLElement, label: string, cls: string, testid: string, fn: () => void, done = () => el.remove()): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.dataset.testid = testid;
  b.addEventListener('click', () => {
    done();
    fn();
  });
  return b;
}

/** "<b>name</b> rest" as text nodes (never markup). */
function line(doc: Document, name: string, rest: string): HTMLElement {
  const t = doc.createElement('span');
  t.className = 'pl-invite-text';
  const b = doc.createElement('b');
  b.textContent = name;
  t.append(b, doc.createTextNode(rest));
  return t;
}

/**
 * "Mira invites you to a party" with Accept and Decline and a countdown bar (LoL style). One at a time: a newer invite
 * replaces the shown one. On a build mismatch the second line says who must update; when this game is the older one
 * Accept becomes Reload. Returns the element (removed on any answer or at expiry).
 */
export function inviteCard(doc: Document, inv: InboxInvite, o: InviteToastOpts): HTMLElement {
  const now = o.now ?? (() => Date.now());
  const ends = now() + Math.max(0, Math.min(INVITE_MAX_MS, inv.ttl));
  const el = shell(doc, 'pl-invite-toast pl-invite-card', 'invite-toast', 'alertdialog');
  el.setAttribute('aria-label', 'Party invite');
  if (inv.mode === 'ranked') el.dataset.ranked = o.locked ? 'locked' : 'open';
  const what = inv.mode === 'ranked' ? 'a Ranked duo' : 'a party';
  const text = line(doc, inv.from.name, inv.missed ? ` invited you to ${what} ${agoWords(inv.age ?? 0)}` : ` invites you to ${what}`);
  const sub = (cls: string, words: string, testid: string) => {
    const s = doc.createElement('small');
    s.className = cls;
    s.dataset.testid = testid;
    s.textContent = words;
    text.append(doc.createElement('br'), s);
  };
  if (o.inParty) sub('pl-invite-leave', `Leave your party and join ${inv.from.name}?`, 'invite-leave');
  if (inv.mode === 'ranked' && o.locked) sub('pl-invite-lock', `Ranked is locked for you: ${o.locked}. Join to play Casual together.`, 'invite-ranked-lock');
  const check = o.sim ?? 'ok';
  if (check !== 'ok') sub('pl-invite-lock pl-invite-sim', simLine(check, inv.from.name), 'invite-update');
  const left = doc.createElement('small');
  left.className = 'pl-invite-left';
  left.dataset.testid = 'invite-left';
  const bar = doc.createElement('i');
  bar.className = 'pl-invite-bar';
  let timer: ReturnType<typeof setInterval> | null = null;
  const done = () => {
    if (timer) clearInterval(timer);
    el.remove();
  };
  const row = doc.createElement('span');
  row.className = 'pl-invite-acts';
  row.append(
    left,
    check === 'me' && o.onReload ? act(doc, el, 'Reload', 'pl-btn small', 'invite-reload', o.onReload, done) : act(doc, el, o.inParty ? 'Join' : 'Accept', 'pl-btn small', 'invite-accept', o.onAccept, done),
    act(doc, el, 'Decline', 'pl-btn ghost small', 'invite-decline', o.onDecline, done),
  );
  el.append(text, row, bar);
  const tick = () => {
    const ms = ends - now();
    if (ms <= 0) {
      done();
      o.onExpire?.();
      return;
    }
    left.textContent = `${Math.ceil(ms / 1000)}s`;
    bar.style.transform = `scaleX(${(ms / INVITE_MAX_MS).toFixed(3)})`;
  };
  tick();
  if (el.isConnected) timer = setInterval(tick, 250);
  return el;
}

/** A short one-line toast (an answer to your invite, an expired invite): 4 s. */
export function lineToast(doc: Document, words: string, testid = 'social-toast', ms = 4000): HTMLElement {
  const el = shell(doc, 'pl-social-toast', testid);
  el.textContent = words;
  setTimeout(() => el.remove(), ms);
  return el;
}

/** "Mira declined your invite" / "Mira is joining your party" / "Mira is in a match: …". */
export const answerLine = (a: InboxAnswer): string =>
  `${a.name} ${a.answer === 'declined' ? 'declined your invite' : a.answer === 'later' ? 'is in a match: they see your invite when it ends' : 'is joining your party'}`;

/** "just now", "2 min ago" (a missed invite's age). */
export function agoWords(ms: number): string {
  const min = Math.floor(ms / 60_000);
  return min < 1 ? 'a moment ago' : `${min} min ago`;
}

/**
 * Nov 19: an invite that came during a match: a small notice at the top that takes no input and never covers the
 * HUD's controls (pointer-events none, 5 s). The card shows when the match ends.
 */
export function matchNotice(doc: Document, inv: InboxInvite, ms = 5000): HTMLElement {
  const el = shell(doc, 'pl-invite-notice', 'invite-notice');
  el.append(line(doc, inv.from.name, ` invited you to ${inv.mode === 'ranked' ? 'a Ranked duo' : 'a party'}. Answer after the match.`));
  setTimeout(() => el.remove(), ms);
  return el;
}

/**
 * Nov 20 (the nickname is the unique username): an assigned name's one-time notice ("Scout" was taken, you are Scout2
 * now) with Choose a name (Profile's name editor) and Keep it. Stays until answered; either answer marks it seen.
 */
export function nameNoticeCard(doc: Document, text: string, onChoose: () => void, onKeep: () => void): HTMLElement {
  const el = shell(doc, 'pl-dm-toast pl-name-notice', 'name-notice', 'alertdialog');
  const t = doc.createElement('span');
  t.className = 'pl-invite-text';
  t.textContent = text;
  el.append(t, act(doc, el, 'Choose a name', 'pl-btn small', 'name-notice-choose', onChoose), act(doc, el, 'Keep it', 'pl-btn ghost small', 'name-notice-keep', onKeep));
  return el;
}

/** A friend's DM while the Social sheet is closed: "Mira: see you at 7" with Open (6 s). Muted threads never get here. */
export function dmToast(doc: Document, from: string, preview: string, onOpen: () => void, ms = 6000): HTMLElement {
  const el = shell(doc, 'pl-dm-toast', 'dm-toast');
  el.append(line(doc, `${from}: `, previewText(preview) || 'New message'), act(doc, el, 'Open', 'pl-btn small', 'dm-open', onOpen));
  setTimeout(() => el.remove(), ms);
  return el;
}
