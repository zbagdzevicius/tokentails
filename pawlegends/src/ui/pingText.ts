/**
 * Command ping copy and layout (GAPS B1): the wheel's slices, the label the player sees for a ping, and the line an
 * allied bot barks back (the sim's `bark` event says only 'ok' or 'heal'; the text is chosen here, at render time).
 */
import { PING_KIND, type PingKind } from '../data/pings';
import type { IconId } from './heroText';

export interface PingText {
  /** The wheel label and the toast ("Take Pudding"). */
  label: string;
  /** What an ally answers when it takes the order. */
  ack: string;
  icon: IconId;
  /** Minimap and ground marker colour. */
  color: string;
}

export const PING_TEXT: Readonly<Record<PingKind, PingText>> = Object.freeze({
  goHere: { label: 'Go here', ack: 'On my way!', icon: 'paw', color: '#7fd4ff' },
  group: { label: 'Group on me', ack: 'Coming to you!', icon: 'paw', color: '#7fd4ff' },
  pudding: { label: 'Take Pudding', ack: 'Going for Pudding!', icon: 'heart', color: '#ffb3d1' },
  pushSunny: { label: 'Push Sunny', ack: 'Pushing Sunny Lane!', icon: 'sun', color: '#ffd166' },
  pushPuddle: { label: 'Push Puddle', ack: 'Pushing Puddle Lane!', icon: 'wind', color: '#ffd166' },
  defend: { label: 'Defend base', ack: 'Heading home to defend!', icon: 'shield', color: '#9be59b' },
  fallBack: { label: 'Fall back', ack: 'Backing off!', icon: 'dash', color: '#ff9f6e' },
  focus: { label: 'Focus hero', ack: 'On it!', icon: 'sword', color: '#ff4d5e' },
});

/** The refusal bark ('heal'): a bot under 35% HP or napping. */
export const HEAL_BARK = 'Healing first!';

/** The six slices of the wheel, clockwise from the top. Go here and Focus hero have their own gestures. */
export const WHEEL_KINDS: readonly number[] = Object.freeze([
  PING_KIND.Group,
  PING_KIND.PushSunny,
  PING_KIND.Defend,
  PING_KIND.FallBack,
  PING_KIND.PushPuddle,
  PING_KIND.Pudding,
]);

/**
 * GAPS A4 chip → ping: a tap on the objective chip sends the matching ping (one tap, no wheel), or nothing.
 * Pudding coming or wild → Take Pudding; an escort, Sunset or Sudden Death → Group on me; a rat camp → Go here.
 */
export function chipPing(key: string): number | null {
  switch (key) {
    case 'pudding':
    case 'calm':
      return PING_KIND.Pudding;
    case 'escort':
    case 'sunset':
    case 'suddenDeath':
      return PING_KIND.Group;
    case 'rats':
    case 'theirRats':
      return PING_KIND.GoHere;
    default:
      return null;
  }
}

/** The wheel slice under a pointer offset (px from the wheel's centre), or −1 inside the dead zone. */
export function wheelSlice(dx: number, dy: number, deadPx = 26): number {
  if (Math.hypot(dx, dy) < deadPx) return -1;
  // 0 = straight up, clockwise (screen y grows downward)
  const a = (Math.atan2(dx, -dy) + Math.PI * 2 + Math.PI / WHEEL_KINDS.length) % (Math.PI * 2);
  return Math.floor(a / ((Math.PI * 2) / WHEEL_KINDS.length)) % WHEEL_KINDS.length;
}

/**
 * GAPS B1 / A6 lane hint on the pick screen (possible since the lane swap: a human who stays in Puddle Lane from 0:40
 * sends the Puddle bot to Sunny Lane, so no lane is left empty).
 */
export function laneHint(role: string): string {
  switch (role) {
    case 'Marksman':
    case 'Mage':
      return 'Lane: Sunny (top). Your bots cover Puddle.';
    case 'Tank':
    case 'Fighter':
      return 'Lane: Puddle (bottom) or Sunny. Your bots swap to cover the other.';
    default:
      return 'Lane: either one. Your bots swap to cover the other.';
  }
}
