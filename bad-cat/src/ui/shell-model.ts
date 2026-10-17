/**
 * Pure helpers of the app shell (wave 3), unit-tested without a DOM: analytics `entry`, home lines, Felony Friday
 * choices, dare outcomes against one or two ghosts, the local hide list (GDD 6.7) and the paywall gate.
 */
import type { DailyEntry, GhostRef, Store } from '../types';
import type { EntryKind } from './router';
import { formatScore } from './copy';

/** GDD 14 `entry` values. */
export type AnalyticsEntry = 'direct' | 'typed' | 'typed_or_direct' | 'daily_link' | 'dare_link' | 'room_link' | 'cat_link' | 'clip_handoff';

/**
 * Router entry → GDD 14 `entry`. The Glass link is a daily-style link; a route link (receipt, gift, restore) and a
 * remix count as direct. A plain direct open with no referrer and no parameters is `typed_or_direct`.
 */
export function analyticsEntry(kind: EntryKind, href = '', referrer = ''): AnalyticsEntry {
  switch (kind) {
    case 'typed':
      return 'typed';
    case 'glass':
    case 'daily_link':
      return 'daily_link';
    case 'dare_link':
      return 'dare_link';
    case 'room_link':
      return 'room_link';
    case 'cat_link':
      return 'cat_link';
    case 'clip_handoff':
      return 'clip_handoff';
    case 'route':
      return 'direct';
    default: {
      try {
        const u = new URL(href);
        const bare = !u.search && (!u.hash || u.hash === '#');
        return !referrer && bare ? 'typed_or_direct' : 'direct';
      } catch {
        return 'direct';
      }
    }
  }
}

/** "Bathroom #3: Toilet Paper Wednesday" → "Toilet Paper Wednesday". */
export function roomNickname(title: string): string {
  const i = title.lastIndexOf(':');
  return (i >= 0 ? title.slice(i + 1) : title).trim() || title.trim();
}

/** "Tomorrow: Toilet Paper Wednesday" (GDD 3.3 step 6); undefined without a schedule entry. */
export function tomorrowLine(next: Pick<DailyEntry, 'title' | 'boss' | 'felonyFriday'> | null | undefined): string | undefined {
  if (!next?.title) return undefined;
  const name = roomNickname(next.title);
  if (next.boss) return `Tomorrow: boss room, ${name}`;
  return `Tomorrow: ${name}`;
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const THEME_LABEL: Record<string, string> = {
  xmas: '🎄 Christmas',
  birthday: '🎂 Birthday',
  wedding: '💍 Wedding',
  nye: '🎆 New Year',
  valentine: '💘 Valentine',
  thanksgiving: '🦃 Holiday dinner',
  spring: '🌷 Spring',
};

/** Chips of today's room card: weekday, theme, Felony Friday, Community Sunday. */
export function roomChips(e: Pick<DailyEntry, 'weekday' | 'theme' | 'felonyFriday' | 'community' | 'preview'> | null | undefined): string[] {
  if (!e) return [];
  const out: string[] = [];
  if (!e.preview && e.weekday >= 0 && e.weekday <= 6) out.push(WEEKDAY[e.weekday]);
  if (e.theme && e.theme !== 'default' && THEME_LABEL[e.theme]) out.push(THEME_LABEL[e.theme]);
  if (e.felonyFriday) out.push('🚨 Felony Friday');
  if (e.community) out.push('🛠️ Community Sunday');
  return out;
}

/** "Mochi was seen in 3,214 rooms this week" (Club seen counter, GDD 6.5). */
export function seenLine(catName: string, week: number): string | undefined {
  if (!(week > 0)) return undefined;
  const who = catName.trim() || 'Your cat';
  return `${who} was seen in ${formatScore(week)} room${week === 1 ? '' : 's'} this week`;
}

/** One Felony Friday option: who commits today's crime. */
export interface FelonyOption {
  id: string; // 'mine' | 'pinkpaw' | 'guest:<cameo id>'
  label: string;
  sub?: string;
  source: 'mine' | 'pinkpaw' | 'guest_star';
}

/** Felony Friday options (GDD 3.5): your cat, today's Pink Paw cat, then the week's guest stars (max 3). */
export function felonyOptions(mine: string, pinkPaw: string | null, guests: readonly { id: string; name: string }[]): FelonyOption[] {
  const out: FelonyOption[] = [{ id: 'mine', label: `🐱 ${mine.trim() || 'My cat'}`, source: 'mine' }];
  if (pinkPaw) out.push({ id: 'pinkpaw', label: `🐾 ${pinkPaw}`, sub: 'A real cat still waiting at Pink Paw', source: 'pinkpaw' });
  for (const g of guests.slice(0, 3)) out.push({ id: `guest:${g.id}`, label: `⭐ ${g.name}`, sub: "This week's guest star", source: 'guest_star' });
  return out;
}

/** The line under the chooser: the card names both cats. */
export function felonyLine(mine: string, chosen: FelonyOption | undefined): string {
  const me = mine.trim() || 'Your cat';
  if (!chosen || chosen.source === 'mine') return `${me} commits the crime. Felony Friday!`;
  const who = chosen.label.replace(/^\S+\s/, '');
  return chosen.source === 'pinkpaw' ? `${who} from Pink Paw commits the crime. ${me} is the getaway driver.` : `Guest star ${who} commits the crime. ${me} keeps watch.`;
}

/** Dare outcome against each ghost (GDD 6.3): "You beat Mochi by 1,240" / "Mochi still rules Kitchen #18". */
export interface DareOutcome {
  name: string;
  line: string;
  /** Only for ghosts recorded under the current rules. */
  beat?: boolean;
  margin?: number;
  replayOnly: boolean;
}
export function dareOutcomes(score: number, ghosts: readonly { ref: GhostRef; score: number }[], roomLabel: string): DareOutcome[] {
  return ghosts.map(({ ref, score: g }) => {
    const name = ref.name || ref.cat?.name || 'Your friend';
    if (ref.replayOnly) return { name, replayOnly: true, line: `${name}'s ghost ran on older rules (replay only): no score to beat` };
    const beat = score > g;
    return {
      name,
      replayOnly: false,
      beat,
      margin: score - g,
      line: beat ? `You beat ${name} by ${formatScore(score - g)}` : score === g ? `Dead heat with ${name}` : `${name} still rules ${roomLabel}`,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Local hide list (GDD 6.7 "Hide and report"): payload hashes of rooms and ghosts this device never shows again.
// ---------------------------------------------------------------------------------------------------------------

export const KEY_HIDDEN = 'hidden';
export const HIDDEN_CAP = 200;

export function hiddenList(store: Store): string[] {
  const v = store.get<unknown>(KEY_HIDDEN, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64) : [];
}
export function isHidden(store: Store, hash: string | null | undefined): boolean {
  return !!hash && hiddenList(store).includes(hash);
}
export function hide(store: Store, hash: string): boolean {
  if (!hash) return false;
  const list = hiddenList(store).filter((x) => x !== hash);
  list.push(hash);
  return store.set(KEY_HIDDEN, list.slice(-HIDDEN_CAP));
}

/** Paywall gate of the shell (GDD 9.2): never in session 1, at most one card per session. Money decides the rest. */
export function mayOffer(sessionIndex: number, shownThisSession: boolean, firstVisitToday = false): boolean {
  // round 2 (QA, optional rule taken): a visit after 30 idle minutes the same evening is session 2, but no offer
  // comes on the calendar day of the first visit
  return sessionIndex >= 2 && !shownThisSession && !firstVisitToday;
}

/** True when `createdAt` (ms) falls on the same local calendar day as `now` (ms). */
export function sameLocalDay(createdAt: number, now: number): boolean {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return false;
  const a = new Date(createdAt);
  const b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "+212 season XP · tier 4 of 30" after a run; undefined when nothing was gained. */
export function xpLine(before: { xp: number; tier: number } | null, after: { xp: number; tier: number } | null, tiers = 30): string | undefined {
  if (!after) return undefined;
  const gain = after.xp - (before?.xp ?? 0);
  if (gain <= 0) return undefined;
  return `+${formatScore(gain)} season XP · ${tierText(after.tier, tiers)}`;
}

/** "tier 4 of 30"; before the first tier "on the way to tier 1" (round 2: "tier 0 of 30" read as broken). */
export function tierText(tier: number, tiers?: number): string {
  if (tier <= 0) return 'on the way to tier 1';
  return tiers ? `tier ${tier} of ${tiers}` : `tier ${tier}`;
}

/** Household second cat: the first other cat of the profile (Club: up to 5). */
export function secondCatIndex(cats: readonly unknown[], active: number): number {
  for (let i = 0; i < cats.length; i++) if (i !== active) return i;
  return -1;
}
