// Iteration 2 entry (INTEGRATOR-owned). src/ui/index.ts calls registerUgc() once, after the menus exist and the
// title stage is prepared. Order matters: the WARDROBE first (others read ugc.currentLook at start-up), TRAILS before
// SHARE (a challenge link may carry a trail), and the capture/photo lanes last.
import { registerClip } from '../clip';
import { registerPhoto } from '../photo';
import { registerShare } from '../share';
import { registerStyle } from '../style';
import { registerTrails } from '../trails';
import { registerWardrobe } from '../wardrobe';
import './ugc.css';

const LANES: [string, () => void][] = [
  ['wardrobe', registerWardrobe],
  ['style', registerStyle],
  ['trails', registerTrails],
  ['share', registerShare],
  ['clip', registerClip],
  ['photo', registerPhoto],
];

export function registerUgc(): void {
  for (const [name, fn] of LANES) {
    try {
      fn();
    } catch (err) {
      // one broken lane must not take the game down; the error still fails the smoke (console error)
      console.error(`ugc lane ${name} failed to start`, err);
    }
  }
}
