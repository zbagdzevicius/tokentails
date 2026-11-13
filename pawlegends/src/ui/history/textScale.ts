/**
 * Menu text size (MATCH-MOMENTS.md §5, accessibility): Normal or Large, for menus only (Settings, results, history,
 * the Treat Track, friends): the match HUD keeps its size, so its phone footprint never grows. Stored per device and
 * applied as html[data-menu-text] (ui/css/moments.css scales the menu panels).
 */
import '../css/moments.css';

export type MenuText = 'normal' | 'large';
export const MENU_TEXT_KEY = 'tt.pawlegends.menuText.v1';
export const MENU_TEXT_NAME: Readonly<Record<MenuText, string>> = Object.freeze({ normal: 'Normal', large: 'Large' });

export function menuText(): MenuText {
  try {
    return localStorage.getItem(MENU_TEXT_KEY) === 'large' ? 'large' : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyMenuText(v: MenuText = menuText()): void {
  if (typeof document === 'undefined') return;
  if (v === 'large') document.documentElement.dataset.menuText = 'large';
  else delete document.documentElement.dataset.menuText;
}

export function setMenuText(v: MenuText): void {
  try {
    if (v === 'large') localStorage.setItem(MENU_TEXT_KEY, 'large');
    else localStorage.removeItem(MENU_TEXT_KEY);
  } catch {
    /* storage blocked: this page only */
  }
  applyMenuText(v);
}

/** The Settings row (settings.ts renders it among the other rows). */
export function menuTextRowHtml(v: MenuText = menuText()): string {
  return `<div class="set-row" data-testid="menu-text-row"><span>Menu text size</span><span class="chips">${(['normal', 'large'] as const)
    .map((m) => `<button class="chip ${v === m ? 'on' : ''}" data-menutext="${m}" aria-pressed="${v === m}">${MENU_TEXT_NAME[m]}</button>`)
    .join('')}</span></div>`;
}

// the saved size applies from the first screen (this module loads with Settings, in the first-load graph)
applyMenuText();
