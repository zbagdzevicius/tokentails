/**
 * Gamepad API, standard mapping (GDD 2.3). Dead zone 0.12, rescaled to full range. Start pauses, Select restarts.
 * Menus read the pad through the UI kit's `focusNav` (src/ui/kit), not through this race input.
 */
import { mergeSteer, type InputSource, type RawInput } from './raw';

const DEAD = 0.12;
const prevStart: boolean[] = [];
const prevSelect: boolean[] = [];

export class GamepadInput implements InputSource {
  poll(out: RawInput): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = (i: number) => !!p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4);
      let x = p.axes[0] ?? 0;
      const y = p.axes[1] ?? 0;
      x = Math.abs(x) < DEAD ? 0 : (x - Math.sign(x) * DEAD) / (1 - DEAD);
      if (b(14)) x = -1; // d-pad
      if (b(15)) x = 1;
      mergeSteer(out, x, false);
      out.gas ||= b(7) || b(0);
      out.brake ||= b(6) || b(1);
      out.drift ||= b(5);
      const item = b(2) || b(4);
      out.item ||= item;
      out.itemBack ||= item && y > 0.5;
      out.lookBack ||= b(3);
      const start = b(9);
      out.pause ||= start && !prevStart[p.index];
      prevStart[p.index] = start;
      // Select / Back restarts the race (B31)
      const select = b(8);
      out.restart ||= select && !prevSelect[p.index];
      prevSelect[p.index] = select;
      out.any ||= p.buttons.some((x) => x.pressed);
    }
  }
  dispose(): void {}
}
