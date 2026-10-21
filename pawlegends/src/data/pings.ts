/**
 * Command pings (sim v10, GAPS B1): slot 0 tells its two allied bots what to do. The sim takes at most one ping every
 * PING.minGap ticks and PING.maxPerMatch a match (input.ts); a ping sets an order with a TTL on allied bots (slots 1
 * and 2), which the bot brain slots below retreat and "fight back when hit" and above Pudding, the camp and the lane
 * (sim/bots/brain.ts; it fights back on the way, so the fight branch stays above the order). Enemy bots never see pings.
 */

/** Ping kinds in stream order (the `kind` byte of Op.Ping is the index). */
export const PING_KINDS = Object.freeze(['goHere', 'group', 'pudding', 'pushSunny', 'pushPuddle', 'defend', 'fallBack', 'focus'] as const);
export type PingKind = (typeof PING_KINDS)[number];

/** Kind indices (World.botOrd stores index + 1; 0 = no order). */
export const PING_KIND = Object.freeze({
  GoHere: 0,
  Group: 1,
  Pudding: 2,
  PushSunny: 3,
  PushPuddle: 4,
  Defend: 5,
  FallBack: 6,
  Focus: 7,
} as const);

/** Bark kinds of the `bark` event (the text is chosen at render time): 'ok' took the order, 'heal' refused it. */
export const BARK_KINDS = Object.freeze(['ok', 'heal'] as const);
export type BarkKind = (typeof BARK_KINDS)[number];

export const PING = Object.freeze({
  /** The sim applies at most one ping every this many ticks (1.5 s); a ping inside the gap is dropped, not logged. */
  minGap: 45,
  /** At most this many pings a match (60 × 7 B fits the +600 B of MAX_INPUT_BYTES with the tick deltas). */
  maxPerMatch: 60,
  /** Order lifetime: Go here, Group on me, Take Pudding, Push, Defend base. */
  orderTicks: 450,
  /** Focus hero: the bot prefers that hero twice as much for this long. */
  focusTicks: 150,
  /** Fall back: the bot retreats for this long. */
  fallBackTicks: 240,
  /** A bot below this HP share (or napping) refuses and barks "Healing first!". */
  refuseHpBp: 3500,
  /** An ordered bot counts as arrived within this distance of its order point (Go here, Take Pudding, Push). */
  arriveRange: 3500,
  /** Focus: the focused hero's foe key is divided by this (a lower key is preferred: "doubles the foe preference"). */
  focusKeyDiv: 2,
  /** Group on me: a bot within this distance of the human fights and works around it. */
  groupRange: 6000,
});

/**
 * Lane swap (GAPS B1): if the human stays in Puddle Lane from LANE_SWAP.from on, the Puddle laner (ally slot 1) takes
 * Sunny Lane. The human counts as in a lane after `hold` ticks in a row there (and back again the same way).
 */
export const LANE_SWAP = Object.freeze({
  /** 0:40 */
  from: 1200,
  /** 5 s in a row in the other lane flips the swap. */
  hold: 150,
  /** Within this of either core (the fountain, the spawns and the shared start of both lanes) no lane counts. */
  baseRange: 9000,
});
