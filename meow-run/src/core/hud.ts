// HUD data model. FROZEN. Core and set pieces write here; meta-ui's view (src/ui/hud.ts) draws it every frame.
// The numbers (score, multiplier, hearts, bells, meter, progress) live in G (state.ts).
import { events, type GameEvents } from './events';
import type { Action } from './types';

export const hud = {
  /** contextual key prompt ("SPACE - JUMP!"): action decides the key label (keyboard or touch); null = hidden */
  prompt: null as null | { action: Action; text: string; until: number },
  /** label of the ability meter ("PUFF") */
  meterLabel: 'PUFF',
  /** progress-bar ticks (checkpoint fractions 0..1), set by session */
  ticks: [] as number[],
  /** run clock for prompt expiry (seconds of game time) */
  now: 0,
};

/** Show a prompt for `seconds` of game time (re-calling refreshes it). */
export function prompt(action: Action, text: string, seconds = 1.5): void {
  hud.prompt = { action, text, until: hud.now + seconds };
}
export function clearPrompt(): void {
  hud.prompt = null;
}
/** Comic callout ("CLOSE ONE!", "PURRFECT!", "NOM NOM!"). English only. */
export function callout(text: string, tone: GameEvents['callout']['tone'] = 'good'): void {
  events.emit('callout', { text, tone });
}
/** The kitten portrait reaction next to the hearts. */
export function react(mood: GameEvents['react']['mood']): void {
  events.emit('react', { mood });
}

/** called by the session every fixed step */
export function tickHud(dt: number): void {
  hud.now += dt;
  if (hud.prompt && hud.now > hud.prompt.until) hud.prompt = null;
}
