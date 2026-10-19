/**
 * Input mux (GDD 2): all devices → one TickInput per sim tick. Steering is quantized to −7..+7; buttons are
 * latched every 2 ticks (30 Hz) for compact ghosts, with presses kept sticky so a short tap is never lost.
 * Touch gets automatic gas (after GO) and the one-thumb auto drift (GDD 2.1): holding the stick past 70 % of lock
 * for 0.25 s above 60 % of top speed starts a drift; releasing back inside 30 % lets it go.
 */
import type { TickInput } from '../../types';
import { emptyRaw, type InputSource, type RawInput } from './raw';

export interface MuxSettings {
  /** desktop auto-gas (touch is always auto) */
  autoGas: boolean;
  oneThumb: boolean;
}

export interface MuxContext {
  /** true once GO has happened */
  racing: boolean;
  /** player speed / top speed */
  speedFrac: number;
  /** player is drifting (sim state) */
  drifting: boolean;
}

export class InputMux {
  readonly raw: RawInput = emptyRaw();
  private sticky = { drift: false, item: false, gas: false };
  private latched: TickInput = { steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false };
  private autoHold = 0;
  private autoDrift = false;
  /** last frame's raw meta (pause/restart/lookBack) for the shell */
  pause = false;
  restart = false;
  lookBack = false;
  any = false;
  touch = false;

  constructor(
    private readonly sources: InputSource[],
    public settings: MuxSettings,
  ) {}

  /** Poll devices once per animation frame. */
  frame(dt: number, ctx: MuxContext): void {
    const r = this.raw;
    Object.assign(r, emptyRaw());
    for (const s of this.sources) s.poll(r, dt);
    this.pause = r.pause;
    this.restart = r.restart;
    this.lookBack = r.lookBack;
    this.any = r.any;
    this.touch = r.touch;
    // one-thumb auto drift (touch only)
    if (r.touch && this.settings.oneThumb && ctx.racing) {
      const a = Math.abs(r.steer);
      if (!this.autoDrift) {
        this.autoHold = a > 0.7 && ctx.speedFrac > 0.6 ? this.autoHold + dt : 0;
        if (this.autoHold > 0.25) this.autoDrift = true;
      } else if (a < 0.3 || (!ctx.drifting && this.autoHold > 0.6)) {
        this.autoDrift = false;
        this.autoHold = 0;
      } else this.autoHold += dt;
    } else this.autoDrift = false;
    if (r.drift || this.autoDrift) this.sticky.drift = true;
    if (r.item) this.sticky.item = true;
    if (r.gas) this.sticky.gas = true;
  }

  /** TickInput for sim tick `tick` (latched on even ticks). */
  sample(tick: number, ctx: MuxContext): TickInput {
    if (tick % 2 === 0) {
      const r = this.raw;
      const autoGas = ctx.racing && (r.touch || this.settings.autoGas);
      this.latched = {
        steer: Math.max(-7, Math.min(7, Math.round(r.steer * 7))),
        gas: autoGas ? !r.brake : r.gas || this.sticky.gas,
        brake: r.brake,
        drift: r.drift || this.autoDrift || this.sticky.drift,
        item: this.sticky.item,
        itemBack: r.itemBack,
      };
      // a sticky press stays down for one latch, then follows the device again
      this.sticky = { drift: false, item: false, gas: false };
    }
    return this.latched;
  }

  dispose(): void {
    for (const s of this.sources) s.dispose();
  }
}
