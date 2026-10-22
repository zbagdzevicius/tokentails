/**
 * Input mux (GDD 2): all devices → one TickInput per sim tick. Steering is quantized to −7..+7; buttons are
 * latched every 2 ticks (30 Hz) for compact ghosts, with presses kept sticky so a short tap is never lost.
 * Touch gets automatic gas (after GO) and the one-thumb auto drift (GDD 2.1): holding the stick past 70 % of lock
 * for 0.2 s above 60 % of top speed starts a drift, but only into a bend that turns the same way (a nervous thumb
 * on a straight is not a drift). Playtest round 2 (phone drifts almost never reached a mini-turbo): the drift then
 * holds while the stick stays past 35 %, whatever the bend does; releasing the stick (or a wall, or a hop that never
 * became a drift) lets it go, and the release fires the charged mini-turbo.
 * Iteration 4 (F2): Smart Steer (`smart-steer.ts`) edits a touch player's steer at the latch, so the recorded input
 * is the assisted one. Keys and a gamepad are never touched (their TickInputs stay bit-identical).
 */
import type { TickInput } from '../../types';
import { emptyRaw, type InputSource, type RawInput } from './raw';
import { EdgeTrend, smartSteer } from './smart-steer';

export interface MuxSettings {
  /** desktop auto-gas (touch is always auto) */
  autoGas: boolean;
  oneThumb: boolean;
  /**
   * Iteration 4 (F2): Smart Steer, the touch steering assist (feel lane). It acts on touch steering only (never keys
   * or a gamepad); the setting is on by default. Omitted = off.
   */
  smartSteer?: boolean;
}

export interface MuxContext {
  /** true once GO has happened */
  racing: boolean;
  /** player speed / top speed */
  speedFrac: number;
  /** player is drifting (sim state) */
  drifting: boolean;
  /** signed curvature of the road ahead, 1/m (+ = left turn); omitted = no bend check */
  curve?: number;
  /** player is touching a wall */
  wall?: boolean;
  // iteration 4 (F2, filled by core/app/shell.ts every frame)
  /**
   * Where the kart will be in 0.5 s at its current speed and turn rate (its path projected on an arc): the distance
   * in metres from that point to the left / right road edge (the tarmac's edge, kerb not included), positive while
   * the point is on the road, negative past that edge. On a branch, the branch's road. Omitted before GO.
   */
  edgeL?: number;
  edgeR?: number;
  /** the projected point's road heading minus the kart's travel heading, radians (+ = the road turns left) */
  edgeHeading?: number;
  /** the kart rides a loop's rail (no steering there) */
  onRail?: boolean;
  /** the kart is in the air (a ramp, a jump gap) */
  air?: boolean;
  /** drift direction: −1 left, +1 right, 0 none (steer + = right) */
  driftDir?: number;
}

/** One-thumb drift: the bend ahead turns the way the stick points (steer + = right, curve + = left). */
export function bendAgrees(steer: number, curve: number | undefined, min: number): boolean {
  if (curve === undefined) return true;
  return Math.abs(curve) > min && Math.sign(curve) === -Math.sign(steer);
}

export class InputMux {
  readonly raw: RawInput = emptyRaw();
  /** presses kept for one latch so a short tap is never lost; `itemBack` latches with its item press (B24) */
  private sticky = { drift: false, item: false, itemBack: false, gas: false };
  private latched: TickInput = { steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false };
  private autoHold = 0;
  private autoDrift = false;
  /** last frame's raw meta (pause/restart/lookBack) for the shell */
  pause = false;
  restart = false;
  lookBack = false;
  any = false;
  touch = false;
  /** the last latch's Smart Steer correction (assisted − raw steer, −0.35..0.35; 0 = no help) */
  assist = 0;
  private readonly trend = new EdgeTrend();
  private readonly lead: MuxContext = { racing: false, speedFrac: 0, drifting: false };

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
        this.autoHold = a > 0.7 && ctx.speedFrac > 0.6 && !ctx.wall && bendAgrees(r.steer, ctx.curve, 0.025) ? this.autoHold + dt : 0;
        if (this.autoHold > 0.2) this.autoDrift = true;
      } else if (a < 0.35 || ctx.wall || (!ctx.drifting && this.autoHold > 0.6)) {
        this.autoDrift = false;
        this.autoHold = 0;
      } else this.autoHold += dt;
    } else this.autoDrift = false;
    if (r.drift || this.autoDrift) this.sticky.drift = true;
    if (r.item) {
      this.sticky.item = true;
      if (r.itemBack) this.sticky.itemBack = true;
    }
    if (r.gas) this.sticky.gas = true;
  }

  /** TickInput for sim tick `tick` (latched on even ticks). */
  sample(tick: number, ctx: MuxContext): TickInput {
    if (tick % 2 === 0) {
      const r = this.raw;
      const autoGas = ctx.racing && (r.touch || this.settings.autoGas);
      // Smart Steer: a touch player's stick (or no stick at all), never keys or a gamepad
      const assisted = this.settings.smartSteer && r.touch && !r.digital && (r.steerTouch || r.steer === 0);
      this.trend.update(tick, ctx);
      const sc = assisted ? this.trend.apply(ctx, this.lead) : ctx;
      const steer = assisted ? smartSteer(r.steer, sc) : r.steer;
      this.assist = steer - r.steer;
      this.latched = {
        steer: Math.max(-7, Math.min(7, Math.round(steer * 7))),
        // touch has no gas pedal to lift: a full-lock stick at speed without a drift lifts for it (B7: the yaw
        // rate falls with speed, so a tight bend at top speed needs a lift or a drift, SIM_VERSION 6)
        gas: autoGas ? !r.brake && !(r.touch && Math.abs(r.steer) > 0.95 && !ctx.drifting && !this.autoDrift && ctx.speedFrac > 0.9) : r.gas || this.sticky.gas,
        brake: r.brake,
        drift: r.drift || this.autoDrift || this.sticky.drift,
        item: this.sticky.item,
        itemBack: this.sticky.item ? this.sticky.itemBack : r.itemBack,
      };
      // a sticky press stays down for one latch, then follows the device again
      this.sticky = { drift: false, item: false, itemBack: false, gas: false };
    }
    return this.latched;
  }

  dispose(): void {
    for (const s of this.sources) s.dispose();
  }
}
