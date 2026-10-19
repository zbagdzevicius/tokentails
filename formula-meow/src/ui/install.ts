/**
 * Lane "audio-ui" install (iteration 2). Owns juice/audio/**, juice/index.ts, core/hud/**, src/ui/** (kit look via
 * tokens.css, strings, a11y content) and review/**.
 *
 * What it wires:
 *  - strings (`CORE_EN`), the settings and how-to screens (lazy chunks), the paw iris between menu screens
 *  - the race UI feed (incoming items, battle clock, splits, records, captions) as a JuiceBus listener
 *  - music scenes from the screen stack: the lounge loop on menus, a fanfare on the podium, the race song in races
 *  - UI sounds for every menu control (hover, confirm, primary, back, toggles, tabs, sliders) and the stingers for
 *    unlocks, achievements, purchases, fish earned and the end of a cup (app bus events from the other lanes)
 *  - the announcer volume and the colour-blind HUD colours follow the settings live
 *
 * Extension points: `Hud.say` / `HudModel` (core/hud/hud.ts), the UI kit API (src/ui/kit), `registerScreen('settings'
 * | 'howto', …)`, `t()` / `registerStrings` (src/ui/i18n.ts, `?lang=xx` pseudo-locale), `setA11y` / `TIER_COLOURS`,
 * `uiSound(id)` (src/ui/sound.ts) for any lane's screen.
 */
import type { Shell } from '../core/app/shell';
import { registerScreen, type ScreenId } from '../core/app/screens';
import { appBus } from '../core/app/app-bus';
import { registerStrings } from './i18n';
import { CORE_EN } from './strings/core.en';
import { setUiShell } from './shell-ref';
import { setUiSoundPlayer, uiSound } from './sound';
import { RaceUi } from './race-ui';
import { installTransitions } from './transitions';
import type { AudioScene } from '../juice/audio/race-audio';
import './ui.css';

/** Screens that play the menu loop (no race under them). */
const MENU_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>(['title', 'menu', 'select', 'class', 'cup', 'tt', 'battle', 'garage', 'achievements', 'stats', 'rewards']);
/** Screens that play the menu loop only when no race is running under them (from the menu, not from pause). */
const SIDE_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>(['settings', 'howto', 'tracks', 'editor', 'yourcat', 'pinkpaw']);

/** Pure: which music scene a screen stack top asks for. `raceUnder` = a race is loaded and not torn down. */
export function sceneFor(top: ScreenId | null, raceUnder: boolean, current: AudioScene): AudioScene {
  if (top === 'podium') return 'podium';
  if (top && MENU_SCREENS.has(top)) return 'menu';
  if (top && SIDE_SCREENS.has(top)) return raceUnder ? current : 'menu';
  // standings between Grand Prix races keep what plays (the race's results loop)
  if (top === 'standings') return current === 'podium' ? 'podium' : current === 'menu' ? 'menu' : 'race';
  return 'race';
}

export function installAudioUi(shell: Shell): void {
  registerStrings('en', CORE_EN);
  setUiShell(shell);
  registerScreen('settings', () => import('./screens/settings'));
  registerScreen('howto', () => import('./screens/howto'));
  shell.bus.add(new RaceUi(shell));
  installTransitions();

  // sounds for screens and the results panel go through the race audio's UI bus
  setUiSoundPlayer((id, n) => shell.audio.ui(id, n));

  // settings the shell does not push itself: the announcer volume and the HUD's tier colours
  const applyMix = () => {
    shell.audio.setMixer({ voice: shell.settings.voiceVol });
    shell.hud.applyTierColours();
  };
  applyMix();
  appBus.on('settingsChanged', ({ key }) => {
    if (key === 'voiceVol' || key === 'colourblind') applyMix();
  });

  // music scenes + the "back" blip when a layer closes
  let size = 0;
  let lastClick = 0;
  appBus.on('screen', ({ id }) => {
    const n = shell.screens.size;
    const raceUnder = !!shell.world;
    shell.audio.setScene(sceneFor(id, raceUnder, shell.audio.currentScene));
    if (n < size && n > 0 && performance.now() - lastClick > 200) uiSound('back');
    size = n;
  });

  // stingers from the other lanes
  appBus.on('unlock', () => uiSound('unlock'));
  appBus.on('achievement', () => uiSound('achievement'));
  appBus.on('purchase', () => uiSound('purchase'));
  appBus.on('fishEarned', ({ amount }) => {
    const plinks = Math.max(1, Math.min(6, Math.round(amount / 5)));
    for (let i = 0; i < plinks; i++) setTimeout(() => uiSound('fish', i), i * 70);
  });
  appBus.on('cupEnd', ({ place }) => uiSound(place <= 3 ? 'cupWin' : 'cupDone'));

  if (typeof document === 'undefined') return;
  // UI sounds for every menu control (capture: before the control changes its own state)
  const inUi = (el: Element) => !!el.closest('[data-ui-layer], .fm-ui-modal, .fm-panel, .fm-menu-btn, .fm-ugc-btn');
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, a[href], [role="switch"], [role="tab"], [role="radio"]');
      if (!el || !inUi(el) || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      lastClick = performance.now();
      const role = el.getAttribute('role');
      if (role === 'switch') uiSound(el.getAttribute('aria-checked') === 'true' ? 'toggleOff' : 'toggleOn');
      else if (role === 'tab' || role === 'radio') uiSound('tab');
      else if (el.classList.contains('primary')) uiSound('primary');
      else uiSound('confirm');
    },
    true,
  );
  let hovered: Element | null = null;
  let hoverAt = 0;
  const hover = (el: Element | null) => {
    if (!el || el === hovered || !inUi(el)) return;
    hovered = el;
    const now = performance.now();
    if (now - hoverAt < 50) return;
    hoverAt = now;
    uiSound('hover');
  };
  document.addEventListener('pointerover', (e) => {
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    hover((e.target as Element | null)?.closest?.('button:not(:disabled), a[href], [role="tab"], [role="radio"]') ?? null);
  });
  // keyboard / gamepad focus moves (the kit's focusNav marks the layer with .fm-nav-pad)
  document.addEventListener('focusin', (e) => {
    const el = e.target as Element | null;
    if (el?.closest?.('.fm-nav-pad')) hover(el);
  });
  let sliderAt = 0;
  document.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | null;
    if (!el || el.type !== 'range' || !inUi(el)) return;
    const now = performance.now();
    if (now - sliderAt < 70) return;
    sliderAt = now;
    const min = Number(el.min) || 0;
    const max = Number(el.max) || 1;
    uiSound('slider', (Number(el.value) - min) / Math.max(1e-6, max - min));
  });
}
