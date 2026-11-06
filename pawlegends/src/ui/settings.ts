/**
 * Settings (POC.md §3 ui/settings.ts): sound, graphics quality, screen shake (Wave C C3: Full / Low / Off), camera zoom
 * (ui/zoomSlider.ts), the desktop controls (cast on key release, the default, or quick cast,
 * trackpad mode Auto / On / Off, cursor size Normal / Large; input/presets.ts keeps them), the touch controls (GAPS
 * A5: Target first Heroes / Lowest HP % / Closest, the optional last-hit and tower buttons), first-match tips and anonymous play stats (the
 * analytics consent, shared with tokentails.com). Plus the small consent prompt shown on the title from the second
 * session when the choice is still open and the game runs outside the Token Tails page (the page asks on its own).
 */
import {
  castMode,
  cursorSize,
  lastHitButton,
  setCastMode,
  setCursorSize,
  setLastHitButton,
  setTargetFirst,
  setTowerButton,
  setTrackpadPref,
  targetFirst,
  towerButton,
  trackpadPref,
  type CastMode,
  type CursorSize,
  type TargetFirst,
  type TrackpadPref,
} from '../input/presets';
import type { QualityTier } from '../render/quality';
import { setShakePref, shakePref, type ShakePref } from '../render/fx/vfxPrefs';
import { hideNames, setHideNames } from '../meta/partyPrefs';
import { bindZoomRow, zoomRowHtml } from './zoomSlider';

export interface SettingsState {
  muted: boolean;
  tier: QualityTier;
  tipsOn: boolean;
  /** null when analytics is not configured in this build (the row hides). */
  stats: boolean | null;
  /** Card skin effects (GDD §7.2): All, Mine only, Off. */
  skinFx?: 'all' | 'mine' | 'off';
}

export interface SettingsOpts {
  state: SettingsState;
  onMute(m: boolean): void;
  onTier(t: QualityTier): void;
  onTips(on: boolean): void;
  onStats(on: boolean): void;
  onSkinFx?(m: 'all' | 'mine' | 'off'): void;
  onClose(): void;
  /** The host's terms page (null outside the Token Tails page: the link hides). */
  termsUrl?: string | null;
}

/** Token Tails privacy policy (the same page as the site footer and the sign-in sheet). */
export const PRIVACY_URL = 'https://docs.tokentails.com/community-and-social-impact/privacy-policy';

const linkAttr = (url: string): string => url.replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c] ?? c);

const SKIN_FX_NAME = { all: 'All', mine: 'Mine only', off: 'Off' } as const;

const TIER_NAME: Record<QualityTier, string> = { low: 'Low', med: 'Medium', high: 'High' };
const CAST_NAME: Record<CastMode, string> = { hold: 'Cast on key release (hold to see range)', quick: 'Quick cast (on press)' };
const PAD_NAME: Record<TrackpadPref, string> = { auto: 'Auto', on: 'On', off: 'Off' };
const CURSOR_NAME: Record<CursorSize, string> = { normal: 'Normal', large: 'Large' };
const TARGET_NAME: Record<TargetFirst, string> = { heroes: 'Heroes', lowest: 'Lowest HP %', closest: 'Closest' };
const SHAKE_NAME: Record<ShakePref, string> = { full: 'Full', low: 'Low', off: 'Off' };

/** Phones and tablets have no keys or cursor: the controls rows hide. */
const keyboardDevice = (): boolean => {
  try {
    return !(typeof matchMedia === 'function' && matchMedia('(hover: none)').matches);
  } catch {
    return true;
  }
};

export function settingsPanel(parent: HTMLElement, o: SettingsOpts): HTMLElement {
  const root = document.createElement('div');
  root.className = 'pl-screen pl-menu pl-settings';
  const s = { ...o.state };
  const ctl = { cast: castMode(), pad: trackpadPref(), cursor: cursorSize(), target: targetFirst(), lastHit: lastHitButton(), tower: towerButton(), shake: shakePref(), hide: hideNames() };
  const showControls = keyboardDevice();
  const row = (label: string, a: string, on: boolean): string =>
    `<div class="set-row"><span>${label}</span><button class="chip ${on ? 'on' : ''}" data-a="${a}" aria-pressed="${on}">${on ? 'On' : 'Off'}</button></div>`;
  const render = (): void => {
    root.innerHTML = `<div class="card"><h2>Settings</h2>
      ${row('Sound', 'sound', !s.muted)}
      <div class="set-row"><span>Graphics</span><span class="chips">${(['low', 'med', 'high'] as const)
        .map((t) => `<button class="chip ${s.tier === t ? 'on' : ''}" data-t="${t}">${TIER_NAME[t]}</button>`)
        .join('')}</span></div>
      <div class="set-row"><span>Screen shake</span><span class="chips">${(['full', 'low', 'off'] as const)
        .map((m) => `<button class="chip ${ctl.shake === m ? 'on' : ''}" data-shake="${m}">${SHAKE_NAME[m]}</button>`)
        .join('')}</span></div>
      ${zoomRowHtml()}
      ${showControls ? `<div class="set-row"><span>Ability keys</span><span class="chips">${(['hold', 'quick'] as const)
        .map((m) => `<button class="chip ${ctl.cast === m ? 'on' : ''}" data-cast="${m}">${CAST_NAME[m]}</button>`)
        .join('')}</span></div>
      <div class="set-row"><span>Trackpad mode (click to move)</span><span class="chips">${(['auto', 'on', 'off'] as const)
        .map((m) => `<button class="chip ${ctl.pad === m ? 'on' : ''}" data-pad="${m}">${PAD_NAME[m]}</button>`)
        .join('')}</span></div>
      <div class="set-row"><span>Cursor size</span><span class="chips">${(['normal', 'large'] as const)
        .map((m) => `<button class="chip ${ctl.cursor === m ? 'on' : ''}" data-cursor="${m}">${CURSOR_NAME[m]}</button>`)
        .join('')}</span></div>` : `<div class="set-row"><span>Target first (Attack button)</span><span class="chips">${(['heroes', 'lowest', 'closest'] as const)
        .map((m) => `<button class="chip ${ctl.target === m ? 'on' : ''}" data-target="${m}">${TARGET_NAME[m]}</button>`)
        .join('')}</span></div>
      ${row('Last-hit button', 'lasthit', ctl.lastHit)}
      ${row('Tower button', 'tower', ctl.tower)}`}
      ${o.onSkinFx ? `<div class="set-row"><span>Skin effects</span><span class="chips">${(['all', 'mine', 'off'] as const)
        .map((m) => `<button class="chip ${(s.skinFx ?? 'all') === m ? 'on' : ''}" data-skinfx="${m}">${SKIN_FX_NAME[m]}</button>`)
        .join('')}</span></div>` : ''}
      ${row('Tips in the next match', 'tips', s.tipsOn)}
      ${row('Hide friends\' names (party)', 'hidenames', ctl.hide)}
      ${s.stats === null ? '' : row('Share anonymous play stats', 'stats', s.stats)}
      <p class="fine">Play stats are anonymous: hero, difficulty, match length. No names, no emails.</p>
      <p class="fine links" data-testid="settings-legal"><a href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy</a>${o.termsUrl ? ` · <a href="${linkAttr(o.termsUrl)}" target="_blank" rel="noopener">Terms</a>` : ''}</p>
      <button class="pl-btn big" data-a="close">Done</button></div>`;
  };
  render();
  bindZoomRow(root);
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const tier = t.closest<HTMLElement>('[data-t]')?.dataset.t as QualityTier | undefined;
    const cast = t.closest<HTMLElement>('[data-cast]')?.dataset.cast as CastMode | undefined;
    const pad = t.closest<HTMLElement>('[data-pad]')?.dataset.pad as TrackpadPref | undefined;
    const cur = t.closest<HTMLElement>('[data-cursor]')?.dataset.cursor as CursorSize | undefined;
    const sfx = t.closest<HTMLElement>('[data-skinfx]')?.dataset.skinfx as 'all' | 'mine' | 'off' | undefined;
    const tgt = t.closest<HTMLElement>('[data-target]')?.dataset.target as TargetFirst | undefined;
    const shake = t.closest<HTMLElement>('[data-shake]')?.dataset.shake as ShakePref | undefined;
    if (shake) {
      ctl.shake = shake;
      setShakePref(shake);
    } else if (tgt) {
      ctl.target = tgt;
      setTargetFirst(tgt);
    } else if (a === 'lasthit') {
      ctl.lastHit = !ctl.lastHit;
      setLastHitButton(ctl.lastHit);
    } else if (a === 'hidenames') {
      ctl.hide = !ctl.hide;
      setHideNames(ctl.hide);
    } else if (a === 'tower') {
      ctl.tower = !ctl.tower;
      setTowerButton(ctl.tower);
    } else if (sfx) {
      s.skinFx = sfx;
      o.onSkinFx?.(sfx);
    } else if (cur) {
      ctl.cursor = cur;
      setCursorSize(cur);
    } else if (cast) {
      ctl.cast = cast;
      setCastMode(cast);
    } else if (pad) {
      ctl.pad = pad;
      setTrackpadPref(pad);
    } else if (tier) {
      s.tier = tier;
      o.onTier(tier);
    } else if (a === 'sound') {
      s.muted = !s.muted;
      o.onMute(s.muted);
    } else if (a === 'tips') {
      s.tipsOn = !s.tipsOn;
      o.onTips(s.tipsOn);
    } else if (a === 'stats' && s.stats !== null) {
      s.stats = !s.stats;
      o.onStats(s.stats);
    } else if (a === 'close' || t === root) {
      close();
      return;
    } else return;
    render();
  });
  // pawlegends: lobby spec §1 — Esc closes Settings (it kept blocking clicks after Escape) and focus returns to the
  // button that opened it (the screen under it may have been redrawn: then its Settings button)
  const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  const close = (): void => {
    if (!root.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    o.onClose();
    const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>('[data-a="settings"]');
    back?.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!root.isConnected) {
      document.removeEventListener('keydown', onKey, true);
      return;
    }
    if (e.key === 'Tab') {
      // pawlegends (QA): a modal keeps focus: Tab and Shift+Tab wrap inside the panel (they reached Play behind it)
      const f = Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((n) => !(n as HTMLButtonElement).disabled && n.getClientRects().length > 0);
      if (!f.length) return;
      const at = f.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      e.stopPropagation();
      f[at < 0 ? (e.shiftKey ? f.length - 1 : 0) : (at + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  document.addEventListener('keydown', onKey, true);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Settings');
  parent.appendChild(root);
  root.querySelector<HTMLElement>('.card button')?.focus({ preventScroll: true });
  return root;
}

/** One-line consent prompt (bottom of the title). */
export function consentPrompt(parent: HTMLElement, onChoice: (granted: boolean) => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'pl-consent';
  root.innerHTML = `<span>Help us tune Pawlegends with anonymous play stats?</span>
    <button class="pl-btn small" data-c="1">Sure</button><button class="pl-btn ghost small" data-c="0">No thanks</button>`;
  root.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
    if (c === undefined) return;
    root.remove();
    onChoice(c === '1');
  });
  parent.appendChild(root);
  return root;
}
