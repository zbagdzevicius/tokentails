/**
 * Phone-like devices get bottom sheets for the Social panel's menus (a friend's row menu, my own card); only a wide
 * screen with a mouse gets the small popover by its row.
 *
 * Nov 19 (founder: "points on mobile overlaps"): the row menu used to be a sheet only when `(hover: none)` or
 * `(pointer: coarse)` matched. Some Android phones and WebViews report a fine, hovering primary pointer (a stylus
 * digitizer such as Samsung's S Pen, a paired mouse or keyboard, a desktop-site request), so the phone got the
 * desktop popover floating over the list. Any one of these signals now means a sheet:
 *
 * - a touch or no-hover input (`hover: none`, `pointer: coarse`, `any-pointer: coarse`);
 * - a narrow or short viewport (up to SHEET_MAX_W wide or SHORT_SHEET_PX tall): there is no room for a popover;
 * - the native app's WebView on a phone or tablet (not the Mac app, which plays with a mouse);
 * - the game's own touch flag (`html[data-touch="1"]`, set by the touch controls on the first real touch);
 * - a mobile browser (`navigator.userAgentData.mobile`, or a touch screen with a phone or tablet user agent).
 */
import { shellPlatform, type ShellPlatform } from '../app/platform';

/** Up to this width a menu is a bottom sheet whatever the pointer. */
export const SHEET_MAX_W = 900;
/** Up to this height (a phone held sideways) a menu is a bottom sheet whatever the pointer. */
export const SHORT_SHEET_PX = 500;
/** The media query that alone makes a menu a sheet (listened to: a resize or a new pointer re-lays an open menu). */
export const SHEET_QUERY = `(hover: none), (pointer: coarse), (any-pointer: coarse), (max-width: ${SHEET_MAX_W}px), (max-height: ${SHORT_SHEET_PX}px)`;

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|IEMobile/i;

interface WinLike {
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: { maxTouchPoints?: number; userAgent?: string; userAgentData?: { mobile?: boolean } };
  document?: { documentElement?: { dataset?: Record<string, string | undefined> } };
}

/** True when a menu should be a bottom sheet on this device. Never throws. */
export function sheetDevice(win: WinLike | null | undefined, platform: ShellPlatform | null = shellPlatform()): boolean {
  if (!win) return false;
  try {
    if (platform && platform !== 'mac') return true;
    if (win.matchMedia?.(SHEET_QUERY).matches) return true;
    if (win.document?.documentElement?.dataset?.touch === '1') return true;
    const nav = win.navigator;
    if (nav?.userAgentData?.mobile === true) return true;
    if ((nav?.maxTouchPoints ?? 0) > 0 && MOBILE_UA.test(nav?.userAgent ?? '')) return true;
    // a phone's user agent with no touch reported at all (an emulator, a WebView that hides it): still a phone
    if (/Android.+Mobile|iPhone|iPod/i.test(nav?.userAgent ?? '')) return true;
  } catch {
    /* a sandboxed frame without navigator: the media query answer stands */
  }
  return false;
}
