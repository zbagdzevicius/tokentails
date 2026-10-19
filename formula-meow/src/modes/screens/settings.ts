/**
 * Settings (installed only when no other lane registers a settings screen; the audio-ui lane owns the real one):
 * sound, music and effects volume, reduced motion, high contrast, captions, haptics, the drift method on touch and
 * auto-gas on a keyboard. Everything saves at once through `shell.updateSettings`.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { slider, toggle } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { flow } from '../flow';
import { focusFirst, frame, touchUi, guardedBack } from './ui';

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  const shell = flow().shell;
  const s = shell.settings;
  const fr = frame(root, { title: t('Settings'), cls: 'fm-m-settings' });
  const set = shell.updateSettings.bind(shell);
  fr.body.append(
    toggle(t('Sound'), !s.muted, (v) => set({ muted: !v })),
    slider(t('Music'), s.musicVol, (v) => set({ musicVol: v })),
    slider(t('Effects'), s.sfxVol, (v) => set({ sfxVol: v })),
    toggle(t('Reduced motion'), s.reducedMotion, (v) => set({ reducedMotion: v })),
    toggle(t('High contrast'), s.highContrast, (v) => set({ highContrast: v })),
    toggle(t('Captions'), s.captions, (v) => set({ captions: v })),
    toggle(t('Vibration'), s.haptics, (v) => set({ haptics: v })),
    touchUi() ? toggle(t('One-thumb drift'), s.oneThumb, (v) => set({ oneThumb: v })) : toggle(t('Auto-gas'), s.autoGas, (v) => set({ autoGas: v })),
  );
  fr.footer.remove();
  focusFirst(root, '[role="switch"]');
  return { back: guardedBack };
}
