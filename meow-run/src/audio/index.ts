// Audio entry for the CAT-AUDIO lane: unlock on the first user gesture, then music and sfx follow game events.
import { initMusic } from './music';
import { initSfx } from './sfx';
import { initAudio } from './synth';

export function registerAudio(): void {
  initMusic();
  initSfx();
  // browsers only allow audio after a gesture: any tap, click or key unlocks (and later resumes) the context
  const unlock = () => {
    try {
      initAudio();
    } catch (err) {
      console.warn('audio unavailable', err);
    }
  };
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) addEventListener(ev, unlock, { capture: true, passive: true });
}
