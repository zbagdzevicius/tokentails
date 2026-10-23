// First-run tutorial on a tutorial level: MOVE -> SWAT a building -> POUNCE -> ULTRA -> RAMPAGE!
// The clock and spawners wait (G.timeFrozen) until it is done or skipped. Owned by the META-UI lane.
import { uiNice } from '../audio/ui-sfx';
import { G, events, game, isTouch, showBanner } from '../core/api';
import { $, onTap } from './dom';
import { store } from './store';

interface Step {
  title: string;
  kbd: string;
  touch: string;
  glow: string | null; // touch control to highlight
}

const STEPS: Step[] = [
  { title: 'WALK AROUND', kbd: 'Hold <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys', touch: 'Drag anywhere on the left side', glow: 'stick' },
  { title: 'SWAT A BUILDING', kbd: 'Walk up to a building, press <kbd>J</kbd> or click', touch: 'Walk up to a building, tap SWAT', glow: 'tbSwat' },
  { title: 'POUNCE!', kbd: 'Press <kbd>SPACE</kbd> or right-click to leap and smash', touch: 'Tap POUNCE to leap and smash', glow: 'tbPounce' },
  { title: 'ULTRA IS FULL', kbd: 'Press <kbd>E</kbd> to unleash it', touch: 'Tap the glowing ULTRA button', glow: 'tbUltra' },
];

const box = $('tut');
let active = false;
let idx = 0;
let advancing = false;
let hideT = 0;
let gen = 0; // bumped by start/cancel: a stale 'NICE' timer from an abandoned run does nothing
let advT = 0;
const done = [false, false, false, false]; // actions already performed (in any order)

function glow(id: string | null): void {
  for (const g of ['stick', 'tbSwat', 'tbPounce', 'tbUltra']) $(g).classList.toggle('tut-glow', g === id);
}

function render(): void {
  const s = STEPS[idx];
  const touch = isTouch || document.body.classList.contains('touch');
  const ult = idx === 3 && game.cat ? game.cat.ultraName : '';
  $('tutTitle').textContent = idx === 3 && ult ? `${ult} IS READY` : s.title;
  $('tutSub').innerHTML = touch ? s.touch : s.kbd;
  $('tutDots').innerHTML = STEPS.map((_, i) => `<i class="${i < idx ? 'done' : i === idx ? 'on' : ''}"></i>`).join('');
  glow(touch ? s.glow : null);
  box.classList.remove('nice');
  box.animate([{ transform: 'translateX(-50%) scale(.85)', opacity: 0 }, { transform: 'translateX(-50%) scale(1)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.5,.4,1)' });
  if (idx === 3) G.ultra = 100;
}

function advance(): void {
  if (!active || advancing) return;
  advancing = true;
  done[idx] = true;
  uiNice();
  box.classList.add('nice');
  $('tutTitle').textContent = ['NICE PAWS!', 'CRASH! NICE.', 'BOOM!', ''][idx] || 'NICE!';
  const g = gen;
  advT = window.setTimeout(() => {
    if (g !== gen) return;
    advancing = false;
    if (!active) return;
    idx++;
    while (idx < STEPS.length && done[idx]) idx++; // skip steps the player already did out of order
    if (idx >= STEPS.length) finish(false);
    else render();
  }, idx === 3 ? 0 : 700);
}

/** An action happened: advance if it is the current step, else remember it for later. */
function did(step: number): void {
  if (!active) return;
  if (step === idx && !advancing) advance();
  else if (step > idx || advancing) done[step] = true;
}

function finish(skipped: boolean): void {
  if (!active) return;
  active = false;
  G.timeFrozen = false;
  glow(null);
  store.set({ ...store.get(), tutorialDone: true });
  document.body.classList.remove('tutorial');
  if (skipped) {
    box.classList.add('hidden');
    showBanner('RAMPAGE!');
    return;
  }
  $('tutTitle').textContent = 'RAMPAGE!';
  $('tutSub').innerHTML = `${game.level?.duration ?? 90} seconds. Knock it all off the table.`;
  $('tutDots').innerHTML = '';
  box.classList.add('nice');
  clearTimeout(hideT);
  hideT = window.setTimeout(() => box.classList.add('hidden'), 2600);
}

/** Stop without marking it done (quit, restart, level change). */
function cancel(): void {
  gen++;
  clearTimeout(advT);
  if (!active) return;
  active = false;
  advancing = false;
  glow(null);
  box.classList.add('hidden');
  document.body.classList.remove('tutorial');
}

export function startTutorial(): void {
  clearTimeout(hideT);
  clearTimeout(advT);
  gen++;
  active = true;
  idx = 0;
  done.fill(false);
  advancing = false;
  G.timeFrozen = true;
  box.classList.remove('hidden');
  document.body.classList.add('tutorial');
  render();
}

export const tutorialActive = () => active;
export const skipTutorial = () => finish(true);

export function initTutorial(): void {
  events.on('levelStart', ({ level }) => {
    cancel();
    clearTimeout(hideT);
    box.classList.add('hidden');
    if (level.tutorial && !store.get().tutorialDone) startTutorial();
  });
  events.on('levelLoad', cancel);
  events.on('levelEnd', cancel);
  events.on('moved', () => did(0));
  events.on('swat', ({ hit }) => {
    if (hit) did(1);
    else if (active && idx === 1 && !advancing) $('tutSub').innerHTML = 'Missed! <b>Get closer</b> to a building, then swat';
  });
  events.on('pounceLand', () => did(2));
  events.on('ultraStart', () => did(3));
  onTap($('tutSkip'), () => skipTutorial());
  $('tutSkip').addEventListener('pointerdown', (e) => e.stopPropagation());
}
