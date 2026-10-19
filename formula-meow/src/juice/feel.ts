/**
 * Starter feel (juice lane seed, GDD 11): turns race events into camera trauma, spark bursts and Android haptics.
 * Hooks are injected by the shell so this file never touches the sim or the camera class directly.
 */
import type { RaceEvent } from '../types';
import { DRIFT } from '../tuning';
import type { FrameInfo, JuiceListener } from './bus';
import { vibrate } from './haptics';

export interface FeelHooks {
  trauma(v: number): void;
  burst(kart: number, color: number, n: number, speed?: number): void;
  reducedMotion(): boolean;
}


export class StarterFeel implements JuiceListener {
  constructor(private readonly hooks: FeelHooks) {}

  onEvent(e: RaceEvent, info: FrameInfo): void {
    const me = e.kart === info.me;
    switch (e.type) {
      case 'wall':
        if (me) this.hooks.trauma(e.a === 2 ? 0.4 : 0.2);
        this.hooks.burst(e.kart, 0xffd27a, e.a === 2 ? 18 : 8, 5);
        break;
      case 'bump':
        if (me || e.b === info.me) this.hooks.trauma(0.15);
        break;
      case 'land':
        if (me) {
          this.hooks.trauma(Math.min(0.5, 0.3 * ((e.a ?? 0) / 60)));
          vibrate(15);
        }
        this.hooks.burst(e.kart, 0xfff3dc, 10, 4);
        break;
      case 'miniTurbo':
        if (me) this.hooks.trauma(0.15);
        this.hooks.burst(e.kart, DRIFT.colors[(e.a ?? 1) - 1], 14 + 8 * (e.a ?? 1), 7);
        break;
      case 'driftTier':
        if (me) vibrate(8);
        break;
      case 'hit':
        if (me) {
          this.hooks.trauma(0.6);
          vibrate(25);
        }
        this.hooks.burst(e.kart, 0xffffff, 20, 6);
        break;
      case 'pounce':
        this.hooks.burst(e.kart, 0xff3ea5, 24, 7);
        if (me) this.hooks.trauma(0.2);
        break;
      case 'itemPickup':
        this.hooks.burst(e.kart, 0xffc93c, 16, 6);
        break;
      case 'pad':
        if (me) this.hooks.trauma(0.1);
        break;
    }
  }
}
