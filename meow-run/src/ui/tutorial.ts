// Stage 1 coach cards (META-UI lane): steer, jump, slide, pounce, tail vault. Shown while stage.tutorial is set and
// the save has no tutorialDone. Each card shows the real keys (desktop) or an animated finger (phones) and goes away
// as soon as the player does the move. The step logic is pure (tutorial-logic.ts).
import { isTouch } from '../core/engine';
import { events } from '../core/events';
import { hud } from '../core/hud';
import { steerAxis } from '../core/input';
import { addFrameHook } from '../core/loop';
import { P } from '../core/player';
import { G, game } from '../core/state';
import { TutorialMachine, type TutStep } from './tutorial-logic';

const CARDS: Record<TutStep, { kb: string; tc: string; title: [string, string]; sub: [string, string] }> = {
  steer: {
    kb: '<kbd class="press">A</kbd><kbd class="press">D</kbd>',
    tc: '<div class="finger" data-g="side"><i></i></div>',
    title: ['Steer!', 'Drag to steer!'],
    sub: ['A / D or the arrow keys: run for the fish', 'Slide a finger left and right'],
  },
  jump: {
    kb: '<kbd class="press">SPACE</kbd>',
    tc: '<div class="finger" data-g="up"><i></i></div>',
    title: ['Jump!', 'Swipe up to jump!'],
    sub: ['Hop over logs and rocks', 'Hop over logs and rocks'],
  },
  slide: {
    kb: '<kbd class="press">S</kbd>',
    tc: '<div class="finger" data-g="down"><i></i></div>',
    title: ['Slide!', 'Swipe down to slide!'],
    sub: ['Duck under low branches', 'Duck under low branches'],
  },
  pounce: {
    kb: '<kbd class="press">SPACE</kbd><kbd class="press">SPACE</kbd>',
    tc: '<div class="finger" data-g="up2"><i></i></div>',
    title: ['Pounce!', 'Swipe up again!'],
    sub: ['Jump again in the air to dash forward', 'A second swipe in the air is a pounce'],
  },
  vault: {
    kb: '<kbd class="press">E</kbd>',
    tc: '<div class="finger" data-g="tap"><i></i></div>',
    title: ['Tail vault!', 'Tap to tail vault!'],
    sub: ['Press E at the edge: Mochi poles over on her tail', 'Tap at the edge: Mochi poles over on her tail'],
  },
};

let enabled = false;
let machine = new TutorialMachine();
/** flow turns the coach on for tutorial stages until the save says it is done */
export function setTutorialEnabled(on: boolean): void {
  enabled = on;
  machine = new TutorialMachine();
}

export function initTutorial(): void {
  const coach = document.getElementById('coach')!;
  const art = coach.querySelector('.art') as HTMLElement;
  const title = coach.querySelector('.say b') as HTMLElement;
  const sub = coach.querySelector('.say span') as HTMLElement;
  let shown: TutStep | null = null;
  const show = (s: TutStep | null) => {
    if (s === shown) return;
    shown = s;
    coach.classList.toggle('hidden', !s);
    if (!s) return;
    const c = CARDS[s];
    const i = isTouch ? 1 : 0;
    art.innerHTML = isTouch ? c.tc : c.kb;
    title.textContent = c.title[i];
    sub.textContent = c.sub[i];
    coach.classList.remove('in');
    void coach.offsetWidth;
    coach.classList.add('in');
  };
  events.on('jump', () => machine.event('jump'));
  events.on('slide', (e) => e.on && machine.event('slide'));
  events.on('pounce', () => machine.event('pounce'));
  events.on('abilityStart', (e) => e.id === 'vault' && machine.event('abilityStart'));
  events.on('stageStart', () => {
    machine = new TutorialMachine();
    show(null);
  });
  events.on('finishLine', () => show(null));
  events.on('quit', () => show(null));
  addFrameHook((dt) => {
    if (!enabled || !game.stage?.tutorial || game.mode !== 'play') {
      if (shown && game.mode !== 'paused') show(null);
      return;
    }
    const pr = hud.prompt;
    const s = machine.update(dt, {
      time: G.time,
      steer: steerAxis(),
      promptAction: pr ? pr.action : null,
      promptText: pr ? pr.text : '',
      progress: G.progress,
      airborne: !P.grounded,
    });
    show(s);
  });
}
