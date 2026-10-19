/**
 * Settings (POC.md §3 ui/settings.ts): sound, graphics quality, the desktop controls (quick cast or aim on hold,
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
}

const SKIN_FX_NAME = { all: 'All', mine: 'Mine only', off: 'Off' } as const;

const TIER_NAME: Record<QualityTier, string> = { low: 'Low', med: 'Medium', high: 'High' };
const CAST_NAME: Record<CastMode, string> = { quick: 'Quick cast', hold: 'Aim on hold' };
const PAD_NAME: Record<TrackpadPref, string> = { auto: 'Auto', on: 'On', off: 'Off' };
const CURSOR_NAME: Record<CursorSize, string> = { normal: 'Normal', large: 'Large' };
const TARGET_NAME: Record<TargetFirst, string> = { heroes: 'Heroes', lowest: 'Lowest HP %', closest: 'Closest' };

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
  const ctl = { cast: castMode(), pad: trackpadPref(), cursor: cursorSize(), target: targetFirst(), lastHit: lastHitButton(), tower: towerButton() };
  const showControls = keyboardDevice();
  const row = (label: string, a: string, on: boolean): string =>
    `<div class="set-row"><span>${label}</span><button class="chip ${on ? 'on' : ''}" data-a="${a}" aria-pressed="${on}">${on ? 'On' : 'Off'}</button></div>`;
  const render = (): void => {
    root.innerHTML = `<div class="card"><h2>Settings</h2>
      ${row('Sound', 'sound', !s.muted)}
      <div class="set-row"><span>Graphics</span><span class="chips">${(['low', 'med', 'high'] as const)
        .map((t) => `<button class="chip ${s.tier === t ? 'on' : ''}" data-t="${t}">${TIER_NAME[t]}</button>`)
        .join('')}</span></div>
      ${showControls ? `<div class="set-row"><span>Ability keys</span><span class="chips">${(['quick', 'hold'] as const)
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
      ${s.stats === null ? '' : row('Share anonymous play stats', 'stats', s.stats)}
      <p class="fine">Play stats are anonymous: hero, difficulty, match length. No names, no emails.</p>
      <button class="pl-btn big" data-a="close">Done</button></div>`;
  };
  render();
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const tier = t.closest<HTMLElement>('[data-t]')?.dataset.t as QualityTier | undefined;
    const cast = t.closest<HTMLElement>('[data-cast]')?.dataset.cast as CastMode | undefined;
    const pad = t.closest<HTMLElement>('[data-pad]')?.dataset.pad as TrackpadPref | undefined;
    const cur = t.closest<HTMLElement>('[data-cursor]')?.dataset.cursor as CursorSize | undefined;
    const sfx = t.closest<HTMLElement>('[data-skinfx]')?.dataset.skinfx as 'all' | 'mine' | 'off' | undefined;
    const tgt = t.closest<HTMLElement>('[data-target]')?.dataset.target as TargetFirst | undefined;
    if (tgt) {
      ctl.target = tgt;
      setTargetFirst(tgt);
    } else if (a === 'lasthit') {
      ctl.lastHit = !ctl.lastHit;
      setLastHitButton(ctl.lastHit);
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
      root.remove();
      o.onClose();
      return;
    } else return;
    render();
  });
  parent.appendChild(root);
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
