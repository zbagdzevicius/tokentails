/**
 * In-app browsers (TikTok, Instagram, Facebook) and link building (GDD 6.6, 7.3).
 * M0: detect, keep playing, and at share time copy the clip handoff link (?rp=…&clip=1) with the
 * "••• → Open in browser" steps. Links are built with L2's buildLink; when the codec cannot build one yet
 * (ghost codec is M1a), a plain room link is used.
 */
import type { CatSpec, EnvInfo, GhostRef, InAppBrowser, LinkState, PlayableRoom, RoomDef, TickInput } from '../types';
import { buildLink } from '../codec';
import { detectEnv } from '../platform';

export const DEFAULT_BASE = 'https://tokentails.com/badcat';

/** UA-based detection, used when the platform env is not available. */
export function inAppFromUa(ua: string): InAppBrowser {
  if (/BytedanceWebview|musical_ly|TikTok/i.test(ua)) return 'tiktok';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV/i.test(ua)) return 'facebook';
  return 'none';
}

/** detectEnv() that never throws (L8 may still be a stub). */
export function safeEnv(): EnvInfo {
  try {
    return detectEnv();
  } catch {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
    return {
      isIOS,
      isAndroid: /Android/i.test(ua),
      isTouch: typeof window !== 'undefined' && 'ontouchstart' in window,
      inApp: inAppFromUa(ua),
      dev: false,
      qa: false,
      presaleUrl: null,
      shortUrl: 'tokentails.com/badcat',
      canShareFiles: false,
      webcodecs: typeof VideoEncoder !== 'undefined',
      audioEncoder: typeof AudioEncoder !== 'undefined',
    };
  }
}

export function needsHandoff(env: Pick<EnvInfo, 'inApp'>): boolean {
  return env.inApp !== 'none';
}

/** Copy for the "Open in Safari/Chrome to save your clip" sheet. */
export function handoffSteps(env: Pick<EnvInfo, 'inApp' | 'isIOS'>): { title: string; steps: string[] } {
  const browser = env.isIOS ? 'Safari' : 'Chrome';
  return {
    title: `Open in ${browser} to save your clip`,
    steps: [
      'The link is copied.',
      'Tap ••• at the top right.',
      `Choose "Open in browser" (or paste the link into ${browser}).`,
    ],
  };
}

function plainRoomLink(play: PlayableRoom, base: string): string {
  const b = base.replace(/\/+$/, '');
  if (play.room.id === 'glass') return `${b}/glass`;
  return play.dayNo && play.dayNo >= 1 ? `${b}/d/${play.dayNo}` : b;
}

function tryBuild(s: LinkState, base: string, fallback: string): string {
  try {
    const link = buildLink(s, base);
    return link || fallback;
  } catch {
    return fallback;
  }
}

/** Clip handoff link: /badcat/d/<n>?rp=<ghost>&c=<cat>&n=<name>&clip=1 (L2 encodes). */
export function buildHandoffLink(play: PlayableRoom, cat: CatSpec, inputs: readonly TickInput[], base = DEFAULT_BASE): string {
  const s: LinkState = {
    dayNo: play.dayNo,
    glass: play.room.id === 'glass' || undefined,
    ghosts: [],
    replay: { inputs: inputs.slice(), cat, name: cat.name },
    clip: true,
  };
  return tryBuild(s, base, plainRoomLink(play, base));
}

/** Dare link: /badcat/d/<n>?g=<ghost>&c=<cat>&n=<name>[&via=] (ghost codec ships in M1a). */
export function buildDareLink(
  play: PlayableRoom,
  cat: CatSpec,
  inputs: readonly TickInput[],
  base = DEFAULT_BASE,
  via?: string,
): string {
  const s: LinkState = {
    dayNo: play.dayNo,
    glass: play.room.id === 'glass' || undefined,
    ghosts: [{ inputs: inputs.slice(), cat, name: cat.name }],
    via,
  };
  return tryBuild(s, base, plainRoomLink(play, base));
}

/** Room link for the emoji/result cards. */
export function buildRoomLink(play: PlayableRoom, base = DEFAULT_BASE): string {
  // a preview day (<= 0) is today's room for everyone: the plain link opens it, without a "/d/-30" path
  return tryBuild({ dayNo: play.dayNo !== undefined && play.dayNo >= 1 ? play.dayNo : undefined, glass: play.room.id === 'glass' || undefined, ghosts: [] }, base, plainRoomLink(play, base));
}

/** Copy text to the clipboard; falls back to a hidden textarea + execCommand. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall back */
  }
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function copyHandoffLink(link: string): Promise<boolean> {
  return copyText(link);
}

// ---------------------------------------------------------------------------------------------
// FULL build: Android intent:// handoff, bc_inapp_handoff steps, dare chains, room-link dares
// ---------------------------------------------------------------------------------------------

/** Android in-app browser (not Chrome itself): the env says so, or the UA has Android + an in-app marker. */
export function isAndroidInApp(env: Pick<EnvInfo, 'isAndroid' | 'inApp' | 'isIOS'>): boolean {
  return env.isAndroid && !env.isIOS && env.inApp !== 'none';
}

/**
 * `intent://<host><path>?<query>#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=<enc>;end`
 * for an https link (pure). The link's own #fragment cannot ride in the intent URI, so it is dropped from the
 * intent part and kept only in the fallback URL. Null for a non-http(s) link.
 */
export function intentUrl(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const scheme = u.protocol.slice(0, -1);
  const fallback = encodeURIComponent(u.href);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

/** Android in-app browser: the intent:// link that opens Chrome directly; null on iOS, desktop and in Chrome. */
export function androidIntentFor(link: string, env: Pick<EnvInfo, 'isAndroid' | 'inApp' | 'isIOS'>): string | null {
  return isAndroidInApp(env) ? intentUrl(link) : null;
}

export function androidIntent(link: string): string | null {
  return androidIntentFor(link, safeEnv());
}

export type HandoffStep = 'shown' | 'link_copied' | 'intent_opened' | 'arrived';
export type HandoffPurpose = 'clip' | 'pay';

/** Props of the `bc_inapp_handoff` analytics event (GDD 14). */
export function handoffEvent(step: HandoffStep, purpose: HandoffPurpose = 'clip'): { step: HandoffStep; purpose: HandoffPurpose } {
  return { step, purpose };
}

/**
 * What the handoff sheet shows: the intent link (Android) or the "•••" steps (iOS / others), the link to copy, and
 * the event to send when the sheet opens. The sheet sends `link_copied` / `intent_opened` itself on tap.
 */
export function handoffPlan(
  link: string,
  env: Pick<EnvInfo, 'isAndroid' | 'inApp' | 'isIOS'>,
  purpose: HandoffPurpose = 'clip',
): { intent: string | null; steps: { title: string; steps: string[] }; copy: string; event: { step: HandoffStep; purpose: HandoffPurpose } } {
  const intent = androidIntentFor(link, env);
  const steps = intent
    ? { title: 'Open in Chrome to save your clip', steps: ['Tap "Open in Chrome".', 'If nothing happens, the link is copied: paste it into Chrome.'] }
    : handoffSteps(env);
  return { intent, steps, copy: link, event: handoffEvent('shown', purpose) };
}

/** A run as a dare ghost (`g`). */
export interface DareRun {
  inputs: readonly TickInput[];
  cat: CatSpec;
  score?: number;
  simVersion?: number;
}

function ghostOf(r: DareRun): GhostRef {
  return {
    inputs: r.inputs.slice(),
    cat: r.cat,
    name: r.cat.name,
    ...(typeof r.score === 'number' && r.score >= 0 ? { score: Math.floor(r.score) } : {}),
    ...(r.simVersion !== undefined ? { simVersion: r.simVersion } : {}),
  };
}

/**
 * Dare chain link (GDD 6.3): the receiver's own run becomes `g`, the sender's ghost `g2`, so the next friend races
 * both. Replay-only (older rules) sender ghosts are kept as they are.
 */
export function buildDareChainLink(play: PlayableRoom, mine: DareRun, sender: GhostRef | null | undefined, base = DEFAULT_BASE, via?: string): string {
  const ghosts: GhostRef[] = [ghostOf(mine)];
  if (sender && sender.inputs?.length) ghosts.push({ ...sender, inputs: sender.inputs.slice() });
  const s: LinkState = {
    dayNo: play.dayNo !== undefined && play.dayNo >= 1 ? play.dayNo : undefined,
    glass: play.room.id === 'glass' || undefined,
    ghosts,
    via,
  };
  return tryBuild(s, base, plainRoomLink(play, base));
}

/**
 * Dare on a player room (`/r?r=<room>&g=&gn=&s=&g2=&gn2=&s2=`): ghost names ride as gn/gn2 (n is the room title).
 * `roomCode` (the payload the link was opened with) is reused so its id keeps keying the ghosts.
 */
export function buildRoomDareLink(room: RoomDef, mine: DareRun, sender?: GhostRef | null, base = DEFAULT_BASE, roomCode?: string, via?: string): string {
  const ghosts: GhostRef[] = [ghostOf(mine)];
  if (sender && sender.inputs?.length) ghosts.push({ ...sender, inputs: sender.inputs.slice() });
  const s: LinkState = { room, ghosts, via, ...(roomCode ? { roomCode } : {}) };
  try {
    return buildLink(s, base) || base;
  } catch {
    return base;
  }
}
