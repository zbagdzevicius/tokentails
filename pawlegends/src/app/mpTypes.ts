/**
 * Party play in the match (docs/plans/moba/MULTIPLAYER.md §7, lane M): what MatchSession and its party HUD read from
 * the party match host (net/net-host.ts NetHost implements `PartyLink`). Types and a few constants only, so the match
 * chunk never imports the party chunk.
 */
import type { SocialKind, VoteKind } from '../net/proto';
import type { MpEvent } from '../analytics/posthog';
import { cutName, tidyName } from '../meta/cardName';

/** The party analytics events (MULTIPLAYER.md §10); the embed host relays exactly these (tests/unit/mp-analytics). */
export const MP_EVENTS: readonly MpEvent[] = Object.freeze([
  'party_create',
  'party_join',
  'party_share',
  'party_leave',
  'party_kick',
  'party_start',
  'party_pick',
  'mp_match_start',
  'mp_net',
  'mp_disconnect',
  'mp_rejoin',
  'mp_takeover',
  'mp_reclaim',
  'mp_desync',
  'mp_referee_divergence',
  'mp_vote',
  'mp_social',
  'mp_match_end',
  'mp_rematch',
] as MpEvent[]);

/**
 * The slot names of a party match for this viewer (§7 M1, D8). `base` are the solo names (slotNames + selfNames: bots
 * keep their persona, the viewer its card); `party` are the relay's display names per slot ("Sunny Tabby"; null = a
 * bot slot). A friend's slot takes its party name, cut for a plate; with Hide names on, or a friend this viewer
 * muted, it reads "Teammate 2" (the slot number + 1). The viewer's own slot keeps `base`. Pure.
 */
export function partySlotNames(
  base: readonly string[],
  party: readonly (string | null | undefined)[],
  mySlot: number,
  opts: { hide?: boolean; muted?: ReadonlySet<number> } = {},
): string[] {
  return base.map((b, slot) => {
    if (slot === mySlot) return b;
    const raw = party[slot];
    if (raw === null || raw === undefined) return b;
    if (opts.hide || opts.muted?.has(slot)) return teammateName(slot);
    const name = tidyName(raw);
    return name ? cutName(name, 18) : teammateName(slot);
  });
}

/** "Teammate 2": a friend's name hidden or muted (by slot, so it never changes mid-match). */
export const teammateName = (slot: number): string => `Teammate ${slot + 1}`;

/** Ring colour per human slot (§7 M1): slot 0 gold, 1 cyan, 2 pink. Plates, scoreboard, minimap, HUD strip. */
export const SLOT_RING: readonly string[] = Object.freeze(['#f5c542', '#3ad0e0', '#ff6fb1']);

export type Conn = 'on' | 'away' | 'off';

/** §4.6: a party match runs at the relay's pace; a local speed (?speed=, the e2e harness) is refused. Pure. */
export const matchSpeedFor = (party: boolean, speed?: number): number => (party ? 1 : Math.max(1, Math.min(64, Math.round(speed ?? 1))));

/** One human seat as the party sees it now (bots have none). */
export interface SeatInfo {
  slot: number;
  /** The relay's display name ("Sunny Tabby"); the owner's own custom cat name never reaches a peer (D8). */
  name: string | null;
  conn: Conn;
  /** The card art URL (cleaned), or null. */
  art: string | null;
}

export interface SocialMsg {
  slot: number;
  kind: SocialKind;
  id: number;
  x?: number;
  y?: number;
  target?: number;
  /** This player's own message coming back from the relay. */
  mine: boolean;
}

export interface VoteMsg {
  kind: VoteKind;
  /** Slots that voted yes. */
  yes: number[];
  need: number;
  /** ms left on the vote. */
  leftMs: number;
  result?: 'pass' | 'fail';
}

export interface PausedMsg {
  paused: boolean;
  leftMs?: number;
  resuming?: boolean;
}

export type SlotReasonText = 'drop' | 'afk' | 'away' | 'late' | 'left' | 'back' | 'desync' | 'restore' | 'open';

export interface PartyLinkListener {
  /** TURN mode bits changed: bit s = slot s flown by a bot. */
  mask?(mask: number, prev: number): void;
  /** A slot's reason text (drop, back, ...); `joined` = a friend took an open seat mid-match. */
  slot?(slot: number, reason: SlotReasonText, joined: boolean): void;
  social?(m: SocialMsg): void;
  vote?(m: VoteMsg): void;
  paused?(m: PausedMsg): void;
  /** The party view changed (names, connection, cards). */
  seats?(seats: readonly SeatInfo[]): void;
  /** This player's own hero came back from a bot after `seconds`. */
  covered?(seconds: number): void;
}

/** The party side of a match host (NetHost). */
export interface PartyLink {
  readonly mySlot: number;
  /** Human slots of this match (slot 0 always; 1 and 2 when friends or open seats). */
  readonly humans: readonly number[];
  /** Display names per slot (null = a bot slot); updated when a friend joins mid-match. */
  readonly names: readonly (string | null)[];
  readonly seats: readonly SeatInfo[];
  piloted(slot: number): boolean;
  /** Share (0..100) of this match's turns slot `slot` was flown by a bot. */
  pilotPct(slot: number): number;
  listen(l: PartyLinkListener): () => void;
  /** Send a social message (mirrored rate limit: false when refused). */
  social(kind: SocialKind, id: number, x?: number, y?: number, target?: number): boolean;
  vote(kind: VoteKind, yes: boolean): void;
  /** Rail notes use these names (the HUD's mute and Hide names). */
  nameOf: (slot: number) => string;
  /** Network numbers for analytics (`mp_net`). */
  net(): { rttMs: number; buffer: number; holds: number; catchups: number };
}
