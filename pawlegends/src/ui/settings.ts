/**
 * Settings (POC.md §3 ui/settings.ts): sound, graphics quality, screen shake (Wave C C3: Full / Low / Off), camera height
 * (ui/cameraHeightRow.ts), the desktop controls (cast on key release, the default, or quick cast,
 * trackpad mode Auto / On / Off, cursor size Normal / Large; input/presets.ts keeps them), the touch controls (GAPS
 * A5: Target first Heroes / Lowest HP % / Closest, the optional last-hit and tower buttons), first-match tips and anonymous play stats (the
 * analytics consent, shared with tokentails.com). Plus the small consent prompt shown on the title from the second
 * session when the choice is still open and the game runs outside the Token Tails page (the page asks on its own).
 */
import {
  castMode,
  cursorSize,
  lastHitButton,
  leftHanded,
  setCastMode,
  setLeftHanded,
  setTouchSize,
  touchSize,
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
  type TouchSize,
  type TrackpadPref,
} from '../input/presets';
import type { QualityTier } from '../render/quality';
import { APP_ENV } from '../app/platform';
import { setShakePref, shakePref, type ShakePref } from '../render/fx/vfxPrefs';
import { allowWatch, hideNames, setAllowWatch, setHideNames } from '../meta/partyPrefs';
import { bindCameraHeightRow, cameraHeightRowHtml } from './cameraHeightRow';
import { MINIMAP_SIZES, colourBlind, minimapSize, setColourBlind, setMinimapSize, type MinimapSize } from './minimapPrefs';
import { accountActionOf, accountRowHtml, type AccountModel, type AccountSend } from './account';
import { menuText, menuTextRowHtml, setMenuText, type MenuText } from './history/textScale';

export interface SettingsState {
  muted: boolean;
  tier: QualityTier;
  tipsOn: boolean;
  /** null when analytics is not configured in this build (the row hides). */
  stats: boolean | null;
  /** Card skin effects (GDD §7.2): All, Mine only, Off. */
  skinFx?: 'all' | 'mine' | 'off';
  /** PERF-IOS P3-3: Battery saver (30 fps); `saverAuto` when the game turned it on (heat or Low Power Mode). */
  saver?: boolean;
  saverAuto?: boolean;
  /** The thermal governor has lightened the graphics for now. */
  warm?: boolean;
}

export interface SettingsOpts {
  state: SettingsState;
  onMute(m: boolean): void;
  onTier(t: QualityTier): void;
  onTips(on: boolean): void;
  onStats(on: boolean): void;
  onSkinFx?(m: 'all' | 'mine' | 'off'): void;
  onSaver?(on: boolean): void;
  onClose(): void;
  /** The host's terms page (null without a host page: the link hides). */
  termsUrl?: string | null;
  /** Sign-in: the Account row (absent without a host: the plain standalone game has no accounts). */
  account?: { model: AccountModel; send: AccountSend };
  /**
   * SHARE-PUSH.md §2: Notifications on this device and each category (absent where web push cannot work: the app
   * shells, a browser without push, or a server without keys).
   */
  push?: PushSettings;
}

export interface PushSettings {
  /** On, the categories left on, and whether the browser blocks notifications. */
  state(): { on: boolean; cats: readonly string[]; blocked: boolean };
  names: Readonly<Record<string, string>>;
  /** Straight from the tap (the permission prompt needs the gesture): a note to show, or null. */
  toggle(on: boolean): Promise<string | null>;
  setCat(cat: string, on: boolean): Promise<void>;
}

/**
 * Paw Legends' own privacy notice (client/pages/pawlegends/privacy.tsx, served at pawlegends.app/privacy; it names the
 * operator as the law requires). Web and app link the same page (NO-TOKENTAILS.md, Your call 3).
 */
export const WEB_PRIVACY_URL = 'https://pawlegends.app/privacy';
/** The app's notice (the App Store listing's privacy policy URL): the same page. */
export const APP_PRIVACY_URL = WEB_PRIVACY_URL;
/** The Settings link. */
export const PRIVACY_URL = APP_ENV ? APP_PRIVACY_URL : WEB_PRIVACY_URL;

const linkAttr = (url: string): string => url.replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c] ?? c);

const SKIN_FX_NAME = { all: 'All', mine: 'Mine only', off: 'Off' } as const;

const TIER_NAME: Record<QualityTier, string> = { low: 'Low', med: 'Medium', high: 'High' };
const CAST_NAME: Record<CastMode, string> = { hold: 'Cast on key release (hold to see range)', quick: 'Quick cast (on press)' };
const PAD_NAME: Record<TrackpadPref, string> = { auto: 'Auto', on: 'On', off: 'Off' };
const CURSOR_NAME: Record<CursorSize, string> = { normal: 'Normal', large: 'Large' };
const TARGET_NAME: Record<TargetFirst, string> = { heroes: 'Heroes', lowest: 'Lowest HP %', closest: 'Closest' };
const SHAKE_NAME: Record<ShakePref, string> = { full: 'Full', low: 'Low', off: 'Off' };
const TSIZE_NAME: Record<TouchSize, string> = { normal: 'Normal', large: 'Large' };

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
  const ctl = { cast: castMode(), pad: trackpadPref(), cursor: cursorSize(), target: targetFirst(), lastHit: lastHitButton(), tower: towerButton(), lefty: leftHanded(), tsize: touchSize(), shake: shakePref(), hide: hideNames(), watch: allowWatch(), cvd: colourBlind(), mm: minimapSize(), menuText: menuText() };
  const showControls = keyboardDevice();
  let pushNote = '';
  const pushRows = (p: PushSettings): string => {
    const st = p.state();
    return `${row('Notifications', 'push', st.on)}${st.on ? Object.keys(p.names).map((c) => `<div class="set-row sub"><span>${p.names[c]}</span><button class="chip ${st.cats.includes(c) ? 'on' : ''}" data-pushcat="${c}" aria-pressed="${st.cats.includes(c)}">${st.cats.includes(c) ? 'On' : 'Off'}</button></div>`).join('') : ''}${st.blocked ? '<p class="fine" data-testid="push-blocked">Notifications are blocked for pawlegends.app in this browser\'s site settings.</p>' : ''}${pushNote ? `<p class="fine" data-testid="push-note">${pushNote}</p>` : ''}`;
  };
  const row = (label: string, a: string, on: boolean): string =>
    `<div class="set-row"><span>${label}</span><button class="chip ${on ? 'on' : ''}" data-a="${a}" aria-pressed="${on}">${on ? 'On' : 'Off'}</button></div>`;
  const render = (): void => {
    // Audit UX-10: a corner ✕ (sticky) and a sticky Done, so the exit is on screen on a 667x375 phone
    root.innerHTML = `<div class="card"><button class="pl-x" data-a="x" aria-label="Close settings">✕</button><h2>Settings</h2>
      ${row('Sound', 'sound', !s.muted)}
      <div class="set-row"><span>Graphics</span><span class="chips">${(['low', 'med', 'high'] as const)
        .map((t) => `<button class="chip ${s.tier === t ? 'on' : ''}" data-t="${t}">${TIER_NAME[t]}</button>`)
        .join('')}</span></div>
      ${o.onSaver ? `${row('Battery saver (30 fps)', 'saver', !!s.saver)}${s.saver && s.saverAuto ? '<p class="fine" data-testid="saver-auto">Turned on because the device got warm. Turn it off for 60 fps.</p>' : ''}` : ''}
      ${s.warm ? '<p class="fine" data-testid="perf-warm">The device is warm: graphics are lighter for now and come back once it cools.</p>' : ''}
      <div class="set-row"><span>Screen shake</span><span class="chips">${(['full', 'low', 'off'] as const)
        .map((m) => `<button class="chip ${ctl.shake === m ? 'on' : ''}" data-shake="${m}">${SHAKE_NAME[m]}</button>`)
        .join('')}</span></div>
      ${cameraHeightRowHtml()}
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
      ${row('Tower button', 'tower', ctl.tower)}
      ${row('Left-handed (buttons left, stick right)', 'lefty', ctl.lefty)}
      <div class="set-row"><span>Button size</span><span class="chips">${(['normal', 'large'] as const)
        .map((m) => `<button class="chip ${ctl.tsize === m ? 'on' : ''}" data-tsize="${m}">${TSIZE_NAME[m]}</button>`)
        .join('')}</span></div>`}
      ${o.onSkinFx ? `<div class="set-row"><span>Skin effects</span><span class="chips">${(['all', 'mine', 'off'] as const)
        .map((m) => `<button class="chip ${(s.skinFx ?? 'all') === m ? 'on' : ''}" data-skinfx="${m}">${SKIN_FX_NAME[m]}</button>`)
        .join('')}</span></div>` : ''}
      <div class="set-row"><span>Minimap size</span><span class="chips">${MINIMAP_SIZES.map((m) => `<button class="chip ${ctl.mm === m ? 'on' : ''}" data-mm="${m}">${m.toUpperCase()}</button>`).join('')}</span></div>
      ${row('Colour-blind map colours', 'cvd', ctl.cvd)}
      ${menuTextRowHtml(ctl.menuText)}
      ${row('Tips in the next match', 'tips', s.tipsOn)}
      ${row('Hide friends\' names (party)', 'hidenames', ctl.hide)}
      ${row('Let friends watch my matches', 'watch', ctl.watch)}
      ${o.push ? pushRows(o.push) : ''}
      ${s.stats === null ? '' : row('Share anonymous play stats', 'stats', s.stats)}
      ${accountRowHtml(o.account?.model ?? null)}
      <p class="fine">Play stats are anonymous: hero, difficulty, match length. No names, no emails.</p>
      <p class="fine links" data-testid="settings-legal"><a href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy</a>${o.termsUrl ? ` · <a href="${linkAttr(o.termsUrl)}" target="_blank" rel="noopener">Terms</a>` : ''}</p>
      <button class="pl-btn big" data-a="close">Done</button></div>`;
  };
  render();
  bindCameraHeightRow(root);
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const acct = accountActionOf(t);
    if (acct && acct !== 'chip' && o.account) {
      // the host's sheet opens over the game: Settings closes first, so it never sits on top of it
      close();
      o.account.send(acct);
      return;
    }
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const tier = t.closest<HTMLElement>('[data-t]')?.dataset.t as QualityTier | undefined;
    const cast = t.closest<HTMLElement>('[data-cast]')?.dataset.cast as CastMode | undefined;
    const pad = t.closest<HTMLElement>('[data-pad]')?.dataset.pad as TrackpadPref | undefined;
    const cur = t.closest<HTMLElement>('[data-cursor]')?.dataset.cursor as CursorSize | undefined;
    const sfx = t.closest<HTMLElement>('[data-skinfx]')?.dataset.skinfx as 'all' | 'mine' | 'off' | undefined;
    const tgt = t.closest<HTMLElement>('[data-target]')?.dataset.target as TargetFirst | undefined;
    const tsize = t.closest<HTMLElement>('[data-tsize]')?.dataset.tsize as TouchSize | undefined;
    const shake = t.closest<HTMLElement>('[data-shake]')?.dataset.shake as ShakePref | undefined;
    const mm = t.closest<HTMLElement>('[data-mm]')?.dataset.mm as MinimapSize | undefined;
    const mt = t.closest<HTMLElement>('[data-menutext]')?.dataset.menutext as MenuText | undefined;
    const pc = t.closest<HTMLElement>('[data-pushcat]')?.dataset.pushcat;
    if ((a === 'push' || pc) && o.push) {
      const p = o.push;
      const job = pc ? p.setCat(pc, !p.state().cats.includes(pc)).then(() => null) : p.toggle(!p.state().on);
      void job.then((note) => {
        pushNote = note ?? '';
        if (root.isConnected) render();
      });
      return;
    }
    if (mt) {
      ctl.menuText = mt;
      setMenuText(mt);
    } else if (mm) {
      ctl.mm = mm;
      setMinimapSize(mm);
    } else if (shake) {
      ctl.shake = shake;
      setShakePref(shake);
    } else if (tgt) {
      ctl.target = tgt;
      setTargetFirst(tgt);
    } else if (a === 'lasthit') {
      ctl.lastHit = !ctl.lastHit;
      setLastHitButton(ctl.lastHit);
    } else if (a === 'cvd') {
      ctl.cvd = !ctl.cvd;
      setColourBlind(ctl.cvd);
    } else if (a === 'hidenames') {
      ctl.hide = !ctl.hide;
      setHideNames(ctl.hide);
    } else if (a === 'watch') {
      ctl.watch = !ctl.watch;
      setAllowWatch(ctl.watch);
    } else if (a === 'tower') {
      ctl.tower = !ctl.tower;
      setTowerButton(ctl.tower);
    } else if (a === 'lefty') {
      ctl.lefty = !ctl.lefty;
      setLeftHanded(ctl.lefty);
    } else if (tsize) {
      ctl.tsize = tsize;
      setTouchSize(tsize);
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
    } else if (a === 'saver' && o.onSaver) {
      s.saver = !s.saver;
      s.saverAuto = false;
      o.onSaver(s.saver);
    } else if (a === 'sound') {
      s.muted = !s.muted;
      o.onMute(s.muted);
    } else if (a === 'tips') {
      s.tipsOn = !s.tipsOn;
      o.onTips(s.tipsOn);
    } else if (a === 'stats' && s.stats !== null) {
      s.stats = !s.stats;
      o.onStats(s.stats);
    } else if (a === 'close' || a === 'x' || t === root) {
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
