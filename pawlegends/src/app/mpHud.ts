/**
 * The party HUD of a party match (docs/plans/moba/MULTIPLAYER.md §7, lane M). Its own lazy chunk: MatchSession loads
 * it only for party matches. It reads the party match host (`PartyLink`, net/net-host.ts) and draws:
 * - M1 teammate identity: friends' names on plates, scoreboard, HUD strip, kill feed (Hide names and mute read
 *   "Teammate 2"), slot rings (0 mint, 1 violet, 2 orange) on plates, the minimap and the strip, connection dots.
 * - M2 social pings from slots 1 and 2 (markers only, never simulated) and the leader's in-sim pings for the others.
 * - M3 quick chat and emotes (src/party/ui/quickChat.ts), mute by tapping a name on the scoreboard.
 * - M4 takeover: robot glyph and greyed ring while a bot flies a friend; "Bot covered for you · 0:42".
 * - M5 votes as rail chips ("Surrender? 1/2 · Yes · No", "Pause? 1/3 · Yes", "Paused 0:47 · Resume").
 * - M7 first-match control hints on the rail (0 matches: no tutorial in party play).
 * - M8 the in-match analytics events (flat props, never a party code or room id).
 *
 * Every message is a rail note (src/ui/notify.ts): nothing is drawn mid-screen on phones. Pure helpers (`voteNote`,
 * `pausedNote`, `hintsFor`) are unit-tested; the class wires them to the session.
 */
import type { Notify, Note } from '../ui/notify';
import type { Overhead } from '../ui/overhead';
import type { Minimap } from '../ui/minimap';
import type { Scoreboard } from '../ui/scoreboard';
import type { Hud } from '../ui/hud';
import type { SocialKind, VoteKind } from '../net/proto';
import { PING_KINDS } from '../data/pings';
import { PING_TEXT } from '../ui/pingText';
import { EMOTES, socialLine, socialText } from '../data/social';
import { SLOT_RING, partySlotNames, type PartyLink, type PausedMsg, type SocialMsg, type VoteMsg } from './mpTypes';
import { QuickChat, type ChatPick } from '../party/ui/quickChat';

/** What the party HUD needs from the MatchSession (kept narrow: the session stays the owner of every view). */
export interface MpHudHost {
  ui: HTMLElement;
  rail: Notify;
  overhead: Overhead;
  minimap: Minimap;
  scoreboard(): Scoreboard | null;
  hud(): Hud | null;
  /** The solo slot names (bots' personas, the player's card name). */
  baseNames: readonly string[];
  /** Party names changed: the session updates its own table (announcer, kill feed, scoreboard, plates). */
  setNames(names: string[]): void;
  /** A ping marker: a minimap ring and a ground marker at (x, y) in sim units. */
  pingAt(x: number, y: number, color: string): void;
  /** A short pop over hero `slot` when it is on screen (render only). */
  popOver(slot: number, text: string, tone: 'good' | 'bad' | 'gold' | 'info'): void;
  /** An emote pose on hero `slot` with a puff in its colour. */
  emote(slot: number, pose: 'wave' | 'cheer', color: number): void;
  /** Input is open (no menu, no end, no talent card). */
  enabled(): boolean;
  touch: boolean;
  /** The player has never finished a match: control hints on the rail (§4.6). */
  newbie: boolean;
  /** Bot difficulty of the match (analytics). */
  difficulty: string;
  track(event: string, props: Record<string, string | number | boolean>): void;
  /** Match ticks now (the analytics clock). */
  tick(): number;
  /** Test seam. */
  now?(): number;
}

// ------------------------------------------------------------------------------------------------ pure helpers

const VOTE_WORD: Record<'surrender' | 'pause', string> = { surrender: 'Surrender', pause: 'Pause' };
export const VOTE_KEY = (kind: VoteKind): string => `mp-vote-${kind}`;
export const PAUSED_KEY = 'mp-paused';

/** The rail note of a running vote (§7 M5): "Surrender? 1/2" with Yes/No chips until this player voted. Pure. */
export function voteNote(v: VoteMsg, mySlot: number): Note | null {
  if (v.kind !== 'surrender' && v.kind !== 'pause') return null;
  const word = VOTE_WORD[v.kind];
  if (v.result) {
    const pass = v.result === 'pass';
    return { key: VOTE_KEY(v.kind), title: pass ? (v.kind === 'surrender' ? 'Surrender passed' : 'Pausing…') : `${word} vote failed`, tone: pass ? 'gold' : 'info', prio: 1, ttl: 2200 };
  }
  const voted = v.yes.includes(mySlot);
  const actions = voted
    ? undefined
    : v.kind === 'surrender'
      ? [
          { id: 'vote-surrender-yes', label: 'Yes' },
          { id: 'vote-surrender-no', label: 'No' },
        ]
      : [{ id: 'vote-pause-yes', label: 'Yes' }];
  return {
    key: VOTE_KEY(v.kind),
    // short enough for a phone rail with two chips: who is in, out of how many are needed, and the time left
    title: `${word} ${v.yes.length}/${v.need}${v.leftMs > 0 ? ` · ${Math.ceil(v.leftMs / 1000)}s` : ''}`,
    tone: 'gold',
    // a vote waits on this player: it takes the phone's one rail line from any announcer line (prio 0)
    prio: actions ? 0 : 1,
    ttl: Math.max(1500, v.leftMs || 10_000),
    ...(actions ? { actions } : {}),
  };
}

/** "Paused 0:47 · Resume" (a sticky note with the Resume chip), "Resuming in 3" or null (playing). Pure. */
export function pausedNote(p: PausedMsg, leftMs: number): Note | null {
  if (!p.paused) return null;
  const s = Math.max(0, Math.ceil(leftMs / 1000));
  if (p.resuming) return { key: PAUSED_KEY, title: `Resuming in ${s}`, tone: 'gold', prio: 1, ttl: Math.max(1000, leftMs + 500) };
  return { key: PAUSED_KEY, title: `Paused ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, tone: 'gold', prio: 0, ttl: Math.max(1500, leftMs + 1000), actions: [{ id: 'vote-resume', label: 'Resume' }] };
}

/** First-match control hints (§4.6, M7): 3 lines for a player with 0 matches, at these match seconds. Pure. */
export function hintsFor(touch: boolean): { at: number; title: string }[] {
  return touch
    ? [
        { at: 3, title: 'Tap the ground to move' },
        { at: 9, title: 'Tap a skill button to cast' },
        { at: 15, title: 'Paw button: tell your team' },
      ]
    : [
        { at: 3, title: 'Right-click to move' },
        { at: 9, title: 'Q W E R cast your skills' },
        { at: 15, title: 'Hold G to ping, T to chat' },
      ];
}

// ------------------------------------------------------------------------------------------------ the HUD

export class MpHud {
  readonly muted = new Set<number>();
  private hide: boolean;
  private chat: QuickChat | null = null;
  private names: string[] = [];
  private paused: PausedMsg | null = null;
  private pausedUntil = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly off: () => void;
  private readonly now: () => number;
  private readonly hints: { at: number; title: string }[];
  private netAt = 0;
  private started = false;
  private disposed = false;

  constructor(
    private readonly h: MpHudHost,
    readonly link: PartyLink,
    opts: { hideNames: boolean },
  ) {
    this.now = h.now ?? (() => performance.now());
    this.hide = opts.hideNames;
    this.hints = h.newbie ? hintsFor(h.touch) : [];
    this.off = link.listen({
      mask: () => this.refreshSeats(),
      seats: () => {
        this.applyNames();
        this.refreshSeats();
      },
      slot: (slot, reason, joined) => this.onSlot(slot, reason, joined),
      social: (m) => this.onSocial(m),
      vote: (v) => this.onVote(v),
      paused: (p) => this.onPaused(p),
      covered: (s) => this.onCovered(s),
    });
    link.nameOf = (slot) => this.names[slot] ?? `Teammate ${slot + 1}`;
    h.rail.onAction = (id) => this.onAction(id);
    h.minimap.ringOf = (slot) => (this.isFriend(slot) ? (SLOT_RING[slot] ?? null) : null);
    const sb = h.scoreboard();
    if (sb) sb.onMute = (slot) => this.toggleMute(slot);
    this.chat = new QuickChat(h.ui, { enabled: () => h.enabled() });
    this.chat.onPick = (p) => this.sendChat(p);
    this.applyNames();
    this.refreshSeats();
    this.timer = setInterval(() => this.everySecond(), 1000);
  }

  /** The match is live (after the countdown or at a rejoin): the analytics start and the hint clock. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const n = this.link.net();
    this.netAt = this.now();
    this.h.track('mp_match_start', { humans: this.link.humans.length, difficulty: this.h.difficulty, rtt_p50: n.rttMs, buffer: n.buffer });
  }

  private isFriend(slot: number): boolean {
    return slot !== this.link.mySlot && slot >= 0 && slot < 3 && this.link.names[slot] !== null && this.link.names[slot] !== undefined;
  }

  // -------------------------------------------------------------------------------------------- identity (M1, M4)

  private applyNames(): void {
    this.names = partySlotNames(this.h.baseNames, this.link.names, this.link.mySlot, { hide: this.hide, muted: this.muted });
    this.h.setNames(this.names);
  }

  /** Plates, scoreboard and the HUD strip from the seats and the TURN mode bits. */
  refreshSeats(): void {
    const plates = new Map<number, { ring: string; bot: boolean }>();
    const rows = new Map<number, { ring: string; bot: boolean; conn: 'on' | 'away' | 'off'; muted: boolean }>();
    const hud = this.h.hud();
    for (let slot = 0; slot < 3; slot++) {
      if (!this.isFriend(slot)) {
        if (slot !== this.link.mySlot) hud?.setStripSeat(slot, null);
        continue;
      }
      const ring = SLOT_RING[slot];
      const bot = this.link.piloted(slot);
      const seat = this.link.seats.find((s) => s.slot === slot);
      plates.set(slot, { ring, bot });
      rows.set(slot, { ring, bot, conn: seat?.conn ?? (bot ? 'off' : 'on'), muted: this.muted.has(slot) });
      hud?.setStripSeat(slot, { ring, bot, art: seat?.art ?? null, name: this.names[slot] ?? '' });
    }
    this.h.overhead.seats = plates;
    const sb = this.h.scoreboard();
    if (sb) sb.seats = rows;
  }

  /** M3: a tap on a friend's scoreboard name mutes them for this session (pings, chat, emotes and the name). */
  toggleMute(slot: number): void {
    if (!this.isFriend(slot)) return;
    if (this.muted.has(slot)) this.muted.delete(slot);
    else this.muted.add(slot);
    this.applyNames();
    this.refreshSeats();
    this.h.rail.push({ key: `mp-mute-${slot}`, title: this.muted.has(slot) ? `${this.names[slot]} muted` : `${this.names[slot]} unmuted`, tone: 'info', prio: 3, ttl: 1500 });
  }

  /** Settings' Hide names changed mid-match. */
  setHide(on: boolean): void {
    this.hide = on;
    this.applyNames();
    this.refreshSeats();
  }

  private onSlot(slot: number, reason: string, joined: boolean): void {
    if (joined) this.applyNames();
    if (slot === this.link.mySlot && reason !== 'back') this.h.track('mp_takeover', { reason });
    if (slot === this.link.mySlot && reason === 'desync') this.h.track('mp_desync', { tick: this.h.tick(), n: 1 });
    this.refreshSeats();
  }

  private onCovered(seconds: number): void {
    this.h.rail.push({ key: 'mp-covered', title: `Bot covered for you · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, tone: 'info', prio: 2, ttl: 4000 });
    this.h.track('mp_reclaim', { after_s: seconds });
  }

  // -------------------------------------------------------------------------------------------- social (M2, M3)

  /** A ping from this player in slot 1 or 2: a social marker (the leader's pings stay in the sim, §7 M2). */
  ping(kind: number, x: number, y: number, target?: number): boolean {
    if (!this.link.social('ping', kind, x, y, target)) return false;
    this.drawSocial({ slot: this.link.mySlot, kind: 'ping', id: kind, x, y, ...(target !== undefined ? { target } : {}), mine: true });
    return true;
  }

  /** The leader's in-sim ping as the other friends see it ("Mira: Go here" on the rail; the session draws the marker). */
  leaderPing(label: string): void {
    if (this.link.mySlot === 0 || this.muted.has(0) || !label) return;
    const name = this.names[0] ?? 'Leader';
    const room = Math.max(4, 26 - label.length);
    this.h.rail.push({ key: 'mp-social-0', title: `${name.length > room ? `${name.slice(0, room - 1)}…` : name}: ${label}`, tone: 'info', prio: 3, ttl: 2200 });
  }

  /** Is this friend muted (the session hides the leader's sim pings too)? */
  isMuted(slot: number): boolean {
    return this.muted.has(slot);
  }

  private sendChat(p: ChatPick): void {
    if (!this.link.social(p.kind, p.id)) {
      this.h.rail.push({ key: 'mp-chat-slow', title: 'Slow down a moment', tone: 'info', prio: 3, ttl: 1200 });
      return;
    }
    this.drawSocial({ slot: this.link.mySlot, kind: p.kind, id: p.id, mine: true });
  }

  private onSocial(m: SocialMsg): void {
    if (m.mine) return; // drawn when sent
    if (this.muted.has(m.slot)) return;
    this.drawSocial(m);
  }

  private drawSocial(m: SocialMsg): void {
    const sample = Math.random() < 0.1;
    if (m.mine && sample) this.h.track('mp_social', { kind: m.kind, id: m.id });
    if (m.kind === 'ping') {
      const t = PING_TEXT[PING_KINDS[m.id]];
      if (t && m.x !== undefined && m.y !== undefined) this.h.pingAt(m.x, m.y, t.color);
      if (!m.mine) this.note(m.slot, m.kind, m.id);
      else this.h.popOver(m.slot, t?.label ?? '', 'info');
      return;
    }
    if (m.kind === 'emote') {
      const em = EMOTES[m.id];
      if (!em) return;
      this.h.emote(m.slot, em.pose, em.color);
      this.h.popOver(m.slot, em.glyph, 'gold');
      return;
    }
    // chat: over the hero when on screen, and on the rail for the others
    this.h.popOver(m.slot, socialText('chat', m.id), 'info');
    if (!m.mine) this.note(m.slot, m.kind, m.id);
  }

  private note(slot: number, kind: SocialKind, id: number): void {
    const line = socialLine(this.names[slot] ?? `Teammate ${slot + 1}`, kind, id);
    if (line) this.h.rail.push({ key: `mp-social-${slot}`, title: line, tone: 'info', prio: 3, ttl: 2200 });
  }

  // -------------------------------------------------------------------------------------------- votes (M5)

  private lastVote: Partial<Record<VoteKind, VoteMsg>> = {};

  private onVote(v: VoteMsg): void {
    if (v.result) {
      const prev = this.lastVote[v.kind];
      this.h.track('mp_vote', { kind: v.kind, result: v.result, yes: prev?.yes.length ?? 0, need: prev?.need ?? 0 });
      delete this.lastVote[v.kind];
      this.h.rail.drop(VOTE_KEY(v.kind));
    } else this.lastVote[v.kind] = v;
    const n = voteNote(v, this.link.mySlot);
    if (n) this.h.rail.push(n);
  }

  /** Esc menu and rail chips: start or answer a vote. */
  vote(kind: VoteKind, yes: boolean): void {
    this.link.vote(kind, yes);
  }

  private onAction(id: string): void {
    if (id === 'vote-surrender-yes') this.vote('surrender', true);
    else if (id === 'vote-surrender-no') this.vote('surrender', false);
    else if (id === 'vote-pause-yes') this.vote('pause', true);
    else if (id === 'vote-resume') this.vote('resume', true);
    else return;
    // the chips go at once (the relay's echo redraws the count)
    const key = id.startsWith('vote-resume') ? PAUSED_KEY : VOTE_KEY(id.split('-')[1] as VoteKind);
    const cur = this.lastVote[id.split('-')[1] as VoteKind];
    if (cur && key !== PAUSED_KEY) {
      const n = voteNote({ ...cur, yes: [...cur.yes, this.link.mySlot] }, this.link.mySlot);
      if (n) this.h.rail.push(n);
    }
  }

  private onPaused(p: PausedMsg): void {
    this.paused = p.paused ? p : null;
    this.pausedUntil = this.now() + (p.leftMs ?? 0);
    if (!p.paused) {
      this.h.rail.drop(PAUSED_KEY);
      this.h.rail.push({ key: 'mp-resumed', title: 'Resumed', tone: 'good', prio: 2, ttl: 1200 });
      // the paused time is not play time for the hints and the network sample
      return;
    }
    this.drawPaused();
  }

  private drawPaused(): void {
    if (!this.paused) return;
    const n = pausedNote(this.paused, this.pausedUntil - this.now());
    if (n) this.h.rail.push(n);
  }

  /** The paused state, for the session (input closed while the relay holds the turns). */
  get isPaused(): boolean {
    return this.paused !== null;
  }

  // -------------------------------------------------------------------------------------------- the clock

  private everySecond(): void {
    if (this.disposed) return;
    if (this.paused) this.drawPaused();
    if (this.chat) this.chat.cool = false;
    const s = Math.floor(this.h.tick() / 30);
    while (this.hints.length && this.started && s >= this.hints[0].at && s < this.hints[0].at + 6) {
      const hint = this.hints.shift()!;
      this.h.rail.push({ key: `mp-hint-${hint.at}`, title: hint.title, tone: 'info', prio: 4, ttl: 4000 });
    }
    if (this.hints.length && s >= this.hints[0].at + 6) this.hints.shift();
    // mp_net every 60 s
    if (this.started && this.now() - this.netAt >= 60_000) {
      this.netAt = this.now();
      const n = this.link.net();
      this.h.track('mp_net', { rtt_p50: n.rttMs, rtt_p95: n.rttMs, jitter_p95: 0, buffer: n.buffer, holds: n.holds, catchups: n.catchups, ...(n.inputMs !== undefined ? { input_ms: n.inputMs } : {}) });
    }
  }

  /** The match ended: the end event (the session's result) with the share of turns bots flew this player. */
  ended(outcome: string, reason: string, scored: boolean | null): void {
    const piloted = this.link.pilotPct(this.link.mySlot);
    this.h.track('mp_match_end', { outcome, humans: this.link.humans.length, piloted_pct: piloted, reason, scored: scored !== false });
    this.chat?.close();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.off();
    this.chat?.dispose();
    this.chat = null;
    this.h.rail.onAction = null;
    this.h.overhead.seats = null;
  }
}
