/**
 * The party lobby (docs/plans/moba/MULTIPLAYER.md §8, lane P4): three columns on phone landscape and desktop.
 * Left: the code (`K7Q X2M`), a big Share, Copy and QR (inline on desktop, "Show QR" on phones). Centre: three seat
 * cards (art, name, guest badge, leader crown, connection dot; an empty seat says "Invite" and opens share). Right:
 * bots difficulty (leader; "Leader picks" for others) with the new-player hint, Open seats, Lock party, New code, and
 * Start (leader) or "Waiting for leader", plus the "Waiting for Mira · Nudge" chip (D11: no ready check).
 *
 * Pure: `lobbyHtml(model)` returns markup; every name, code and label is escaped; actions are `data-p` attributes the
 * party client dispatches. The results phase reuses it with "Play again together".
 */
import { cleanArt } from '../../embed/bridge';
import { displayCode, type MemberView, type PartyView } from '../../net/proto';
import { COPY, DIFF_LABEL, esc } from './copy';

export interface LobbyModel {
  view: PartyView;
  /** The QR svg of the invite link (escaped by construction). */
  qr: string;
  /** The text of the last error, or null. */
  error: string | null;
  /** The leader may start although someone is away (10 s after the first Start). */
  startAnyway: boolean;
  /** Members this player nudged in the last 10 s (the chip says "Nudged"). */
  nudged: ReadonlySet<string>;
  /** The difficulties the leader can pick. */
  difficulties: readonly string[];
  /** Local "Hide names": peers show as "Teammate 2" (lane M owns the setting; the lobby honours it). */
  hideNames?: boolean;
  /** Quick Play (M1A-IMPL.md §1): the leader of a party of 1 or 2 may queue it with strangers ("Play online"). */
  online?: boolean;
}

/** The peer-visible name of a member for this viewer (the owner sees its own custom cat name). */
export function shownName(v: PartyView, m: MemberView, hide = false): string {
  if (m.id === v.you) return m.ownName ?? m.name;
  if (hide) return `Teammate ${v.members.indexOf(m) + 1}`;
  return m.name;
}

const PAW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 13c-3 0-6 2.6-6 5.2 0 1.6 1.4 2.3 3 2.3 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.6 0 3-.7 3-2.3C18 15.6 15 13 12 13zM6.5 11a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8zm11 0a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8zM9.3 7.4a2.1 2.6 0 1 0 0-5.2 2.1 2.6 0 0 0 0 5.2zm5.4 0a2.1 2.6 0 1 0 0-5.2 2.1 2.6 0 0 0 0 5.2z"/></svg>';
const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>';

function seatHtml(v: PartyView, m: MemberView | undefined, i: number, leader: boolean, hide: boolean): string {
  if (!m) {
    return `<li class="pp-seat empty" data-testid="party-seat-empty"><button type="button" class="pp-invite" data-p="share"><span class="pp-av">+</span><b>${COPY.invite}</b></button></li>`;
  }
  const me = m.id === v.you;
  const name = shownName(v, m, hide);
  const art = cleanArt(m.card?.image);
  const av = art
    ? `<span class="pp-av pic" style="background-image:url('${esc(art)}')" data-el="${esc(m.card?.element ?? '')}"></span>`
    : `<span class="pp-av">${PAW}</span>`;
  const badges = [
    m.id === v.leader ? `<span class="pp-crown" title="${COPY.leader}">${CROWN}</span>` : '',
    me ? `<span class="pp-tag me">${COPY.you}</span>` : '',
    m.guest ? `<span class="pp-tag">${COPY.guest}</span>` : '',
    m.newbie ? '<span class="pp-tag new">New</span>' : '',
  ].join('');
  const tools =
    leader && !me && (v.phase === 'lobby' || v.phase === 'results')
      ? `<span class="pp-tools"><button type="button" class="pp-mini" data-p="lead" data-m="${esc(m.id)}" aria-label="${esc(`${COPY.makeLeader}: ${name}`)}" title="${COPY.makeLeader}">${CROWN}</button><button type="button" class="pp-mini" data-p="kick" data-m="${esc(m.id)}" aria-label="${esc(`${COPY.remove}: ${name}`)}" title="${COPY.remove}">×</button></span>`
      : '';
  return `<li class="pp-seat" data-conn="${m.conn}" data-slot="${i}"${me ? ' data-me="1"' : ''} data-testid="party-seat">${av}<span class="pp-who"><b>${esc(name)}</b><span class="pp-badges">${badges}</span></span><i class="pp-dot" title="${m.conn === 'on' ? 'Here' : m.conn === 'away' ? 'Away' : 'Offline'}"></i>${tools}</li>`;
}

export function lobbyHtml(o: LobbyModel): string {
  const v = o.view;
  const leader = v.leader === v.you;
  const hide = o.hideNames === true;
  // seats: the leader first (slot 0), then join order
  const ordered = [...v.members.filter((m) => m.id === v.leader), ...v.members.filter((m) => m.id !== v.leader)];
  const seats = [0, 1, 2].map((i) => seatHtml(v, ordered[i], i, leader, hide)).join('');
  const label = (d: string) => DIFF_LABEL[d] ?? d;
  const newbie = v.members.some((m) => m.newbie) ? `<p class="pp-hint" data-testid="party-newbie">${COPY.newPlayer}</p>` : '';
  const diff = leader
    ? `<div class="pp-seg" role="radiogroup" aria-label="${COPY.bots}">${o.difficulties
        .map((d) => `<button type="button" role="radio" aria-checked="${v.difficulty === d}" data-p="diff" data-v="${esc(d)}">${esc(label(d))}</button>`)
        .join('')}</div>`
    : `<p class="pp-dim" data-testid="party-leader-picks">${esc(COPY.leaderPicks(label(v.difficulty)))}</p>`;
  const toggles = leader
    ? `<div class="pp-toggles">
        <label class="pp-check"><input type="checkbox" data-p="open" ${v.openSeats ? 'checked' : ''}><span>${COPY.openSeats}</span></label>
        <label class="pp-check"><input type="checkbox" data-p="lock" ${v.locked ? 'checked' : ''}><span>${COPY.lockParty}</span></label>
        <button type="button" class="pl-btn ghost small" data-p="newcode">${COPY.newCode}</button>
      </div>`
    : v.openSeats
      ? `<p class="pp-dim">${COPY.openSeats}: ${COPY.openSeatsNote.toLowerCase()}</p>`
      : '';
  const openNotes = v.openSeats ? `<p class="pp-note">${COPY.openSeatsBuff}. ${COPY.openSeatsRewards}.</p>` : '';
  const waitingIds = v.waiting ?? [];
  const waiting = waitingIds
    .map((id) => v.members.find((m) => m.id === id))
    .filter((m): m is MemberView => !!m)
    .map(
      (m) =>
        `<p class="pp-chip" data-testid="party-waiting"><span>${esc(leader ? COPY.waitingFor(shownName(v, m, hide)) : COPY.startWhenBack(shownName(v, m, hide)))}</span> · <button type="button" class="pp-link" data-p="nudge" data-m="${esc(m.id)}" ${o.nudged.has(m.id) ? 'disabled' : ''}>${o.nudged.has(m.id) ? COPY.nudged : COPY.nudge}</button></p>`,
    )
    .join('');
  const solo = v.members.length === 1 && !v.openSeats;
  const results = v.phase === 'results';
  const startLabel = results ? COPY.playAgain : waitingIds.length && o.startAnyway ? COPY.startAnyway : solo ? COPY.play : COPY.start;
  const action = leader
    ? `<button type="button" class="pl-btn big pp-start" data-p="${results ? 'rematch' : 'start'}" data-testid="party-start">${startLabel}</button>`
    : results
      ? `<button type="button" class="pl-btn big pp-start" data-p="rematch" data-testid="party-rematch">${COPY.playAgain}</button>`
      : waitingIds.length
        ? ''
        : `<p class="pp-dim pp-wait" data-testid="party-wait-leader">${COPY.waitingLeader}</p>`;
  const err = o.error ? `<p class="pp-err" role="alert">${esc(o.error)}</p>` : '';
  const online =
    o.online && leader && !v.mm && v.members.length <= 2 && (v.phase === 'lobby' || v.phase === 'results')
      ? `<button type="button" class="pl-btn ghost pp-online" data-p="queue" data-testid="party-queue">${COPY.online}</button>`
      : '';
  return `<div class="pp-card pp-lobby" data-phase="${v.phase}">
    <div class="pp-head"><h2>${COPY.party}${v.locked ? ' <span class="pp-pill">Locked</span>' : ''}</h2><button type="button" class="pl-btn ghost small" data-p="leave" data-testid="party-leave">${COPY.leave}</button></div>
    <div class="pp-grid">
      <section class="pp-code-col" aria-label="${COPY.partyCode}">
        <small>${COPY.partyCode}</small>
        <div class="pp-code" data-testid="party-code">${esc(displayCode(v.code))}</div>
        <button type="button" class="pl-btn pp-share" data-p="share" data-testid="party-share">${COPY.share}</button>
        <div class="pp-row"><button type="button" class="pl-btn ghost small" data-p="copy" data-testid="party-copy">${COPY.copy}</button><button type="button" class="pl-btn ghost small pp-qr-btn" data-p="qr">${COPY.showQr}</button></div>
        <div class="pp-qr-inline" aria-hidden="false">${o.qr}</div>
      </section>
      <ul class="pp-seats" aria-label="Seats">${seats}</ul>
      <section class="pp-ctl">
        <small>${COPY.bots}</small>${diff}${newbie}
        ${toggles}${openNotes}
        ${waiting}${err}
        ${action}${online}
      </section>
    </div>
  </div>`;
}

/** The full-screen QR on phones. */
export function qrSheetHtml(qr: string, code: string): string {
  return `<div class="pp-sheet" role="dialog" aria-modal="true" aria-label="${COPY.scanToJoin}" data-testid="party-qr-sheet"><div class="pp-sheet-qr">${qr}</div><p class="pp-code">${esc(displayCode(code))}</p><button type="button" class="pl-btn" data-p="qr-close">${COPY.close}</button></div>`;
}
