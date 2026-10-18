/**
 * Settings (POC.md §3 ui/settings.ts): sound, graphics quality, the desktop controls (quick cast or aim on hold,
 * trackpad mode Auto / On / Off; input/presets.ts keeps them), first-match tips and anonymous play stats (the
 * analytics consent, shared with tokentails.com). Plus the small consent prompt shown on the title from the second
 * session when the choice is still open and the game runs outside the Token Tails page (the page asks on its own).
 */
import { castMode, setCastMode, setTrackpadPref, trackpadPref, type CastMode, type TrackpadPref } from '../input/presets';
import type { QualityTier } from '../render/quality';

export interface SettingsState {
  muted: boolean;
  tier: QualityTier;
  tipsOn: boolean;
  /** null when analytics is not configured in this build (the row hides). */
  stats: boolean | null;
}

export interface SettingsOpts {
  state: SettingsState;
  onMute(m: boolean): void;
  onTier(t: QualityTier): void;
  onTips(on: boolean): void;
  onStats(on: boolean): void;
  onClose(): void;
}

const TIER_NAME: Record<QualityTier, string> = { low: 'Low', med: 'Medium', high: 'High' };
const CAST_NAME: Record<CastMode, string> = { quick: 'Quick cast', hold: 'Aim on hold' };
const PAD_NAME: Record<TrackpadPref, string> = { auto: 'Auto', on: 'On', off: 'Off' };

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
  const ctl = { cast: castMode(), pad: trackpadPref() };
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
    if (cast) {
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
