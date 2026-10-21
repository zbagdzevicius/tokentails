/**
 * Settings screen (audio-ui lane, lazy chunk; `registerScreen('settings')`). Reached from pause, and from the menu
 * once the modes lane adds its tile. Three tabs:
 *  - Sound: on/off, music, effects and announcer volumes (each slider previews its own bus)
 *  - Controls: one-thumb drift, auto-gas, haptics, and the controls for the input in use
 *  - Accessibility: reduced motion, captions, high-contrast HUD, text size, colour-blind drift colours (with a preview
 *    of the three tier colours and their shapes)
 * Every change saves at once through `shell.updateSettings` (the save blob) and applies live.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import type { Colourblind, Settings } from '../../core/app/save';
import { button, h, panel, slider, tabs, toggle, actionFooter } from '../kit';
import { t } from '../i18n';
import { touchHelp } from '../../core/app/race-labels';
import { TIER_COLOURS } from '../a11y';
import { uiShell } from '../shell-ref';

const TIER_SHAPE = ['●', '◆', '★'];
const CB: Array<{ id: Colourblind; label: string }> = [
  { id: 'off', label: 'Standard' },
  { id: 'deut', label: 'Deuteranopia' },
  { id: 'prot', label: 'Protanopia' },
  { id: 'trit', label: 'Tritanopia' },
];

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
let lastTab = 0;

function tierPreview(cb: Colourblind): HTMLElement {
  const cols = TIER_COLOURS[cb] ?? TIER_COLOURS.off;
  return h(
    'span',
    { class: 'fm-cb-preview', 'aria-hidden': 'true' },
    cols.map((c, i) => h('i', { style: `--c:${hex(c)}` }, [TIER_SHAPE[i]])),
  );
}

export function mount(root: HTMLElement, _params: unknown, api: ScreenApi): ScreenHandle {
  const shell = uiShell();
  const s: Settings | null = shell ? shell.settings : null;
  const set = (p: Partial<Settings>) => shell?.updateSettings(p);
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  // --- Sound
  let lastVoice = 0;
  const sound = h('div', { class: 'fm-settings', role: 'tabpanel' }, [
    toggle(t('Sound'), !(s?.muted ?? false), (v) => {
      set({ muted: !v });
    }),
    slider(t('Music'), s?.musicVol ?? 0.8, (v) => set({ musicVol: v }), { step: 0.05 }),
    slider(
      t('Effects'),
      s?.sfxVol ?? 1,
      (v) => {
        set({ sfxVol: v });
      },
      { step: 0.05 },
    ),
    slider(
      t('Announcer'),
      s?.voiceVol ?? 1,
      (v) => {
        set({ voiceVol: v });
        const now = performance.now();
        if (now - lastVoice > 900) {
          lastVoice = now;
          shell?.audio.announce('podium');
        }
      },
      { step: 0.05 },
    ),
  ]);

  // --- Controls
  // the touch help names the drift method that is on (it always described one-thumb drift)
  const helpLine = h('p', { class: 'fm-line fm-help' }, [
    touch ? touchHelp(s?.oneThumb ?? true) : t('Keys: ←→ steer · ↑ gas · ↓ brake · Space drift · Shift item · Q look back · R restart · Esc pause'),
  ]);
  const controls = h('div', { class: 'fm-settings', role: 'tabpanel' }, [
    toggle(t('One-thumb drift'), s?.oneThumb ?? true, (v) => {
      set({ oneThumb: v });
      if (touch) helpLine.textContent = touchHelp(v);
    }),
    toggle(t('Auto-gas'), s?.autoGas ?? false, (v) => {
      set({ autoGas: v });
    }),
    toggle(t('Vibration'), s?.haptics ?? true, (v) => {
      set({ haptics: v });
    }),
    helpLine,
    h('p', { class: 'fm-line fm-help' }, [t('Gamepad: stick steers · A gas · B brake · RB drift · X item · Y look back · Start pause · Select restart')]),
  ]);

  // --- Accessibility
  const cbGroup = h('div', { class: 'fm-seg', role: 'radiogroup', 'aria-label': t('Colour-blind drift colours') });
  const cbBtns = CB.map((c) =>
    h('button', { class: 'fm-seg-b', type: 'button', role: 'radio', 'aria-checked': String((s?.colourblind ?? 'off') === c.id), 'data-cb': c.id }, [h('span', {}, [t(c.label)]), tierPreview(c.id)]),
  );
  cbBtns.forEach((b, i) =>
    b.addEventListener('click', () => {
      cbBtns.forEach((x, j) => x.setAttribute('aria-checked', String(i === j)));
      set({ colourblind: CB[i].id });
    }),
  );
  cbGroup.append(...cbBtns);
  const access = h('div', { class: 'fm-settings', role: 'tabpanel' }, [
    toggle(t('Reduced motion'), s?.reducedMotion ?? false, (v) => {
      set({ reducedMotion: v });
    }),
    toggle(t('Captions'), s?.captions ?? false, (v) => {
      set({ captions: v });
    }),
    toggle(t('High-contrast HUD'), s?.highContrast ?? false, (v) => {
      set({ highContrast: v });
    }),
    slider(t('Text size'), s?.textScale ?? 1, (v) => set({ textScale: v }), { min: 0.85, max: 1.5, step: 0.05 }),
    h('h3', {}, [t('Colour-blind drift colours')]),
    cbGroup,
    h('p', { class: 'fm-line fm-help' }, [t('Drift sparks, the drift meter and the turbo banners use these colours. The shapes ● ◆ ★ always show the tier too.')]),
  ]);

  const pages = [sound, controls, access];
  const show = (i: number) => {
    lastTab = i;
    pages.forEach((p, j) => (p.hidden = i !== j));
  };
  const tabRow = tabs([t('Sound'), t('Controls'), t('Accessibility')], (i) => {
    show(i);
  }, lastTab);
  show(lastTab);

  const done = button(t('Done'), () => api.close(), { primary: true, act: 'done' });
  root.append(panel(t('Settings'), [tabRow, ...pages, actionFooter([done])], 'fm-settings-panel'));
  return {
    unmount: () => {
      // the pause panel under this screen was drawn with the old values: bring its switches up to date
      const cur = shell?.settings;
      if (!cur) return;
      const sync: Array<[string, boolean]> = [
        [t('Sound'), !cur.muted],
        [t('Reduced motion'), cur.reducedMotion],
        [t('One-thumb drift'), cur.oneThumb],
        [t('Auto-gas'), cur.autoGas],
      ];
      for (const [label, on] of sync)
        document.querySelectorAll<HTMLElement>(`[data-screen="pause"] .fm-ui-switch[aria-label="${CSS.escape(label)}"]`).forEach((sw) => sw.setAttribute('aria-checked', String(on)));
    },
  };
}
