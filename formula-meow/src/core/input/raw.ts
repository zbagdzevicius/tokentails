/** Device-level input before the mux (GDD 2). Every source fills one of these per frame. */
export interface RawInput {
  /** -1..1, + = right (analog after each source's own curve) */
  steer: number;
  /** the source steers digitally (keys): the mux keeps its 0.10 s ramp */
  digital: boolean;
  /** the steer came from a touch stick (iteration 4: Smart Steer helps touch steering only) */
  steerTouch: boolean;
  gas: boolean;
  brake: boolean;
  drift: boolean;
  item: boolean;
  itemBack: boolean;
  lookBack: boolean;
  pause: boolean;
  restart: boolean;
  /** any press this frame (unlocks audio, starts the countdown press on touch) */
  any: boolean;
  /** touch is in use (auto gas, one-thumb drift) */
  touch: boolean;
}

export function emptyRaw(): RawInput {
  return { steer: 0, digital: false, steerTouch: false, gas: false, brake: false, drift: false, item: false, itemBack: false, lookBack: false, pause: false, restart: false, any: false, touch: false };
}

export interface InputSource {
  /** OR this source's state into `out` (steer: keep the largest magnitude) */
  poll(out: RawInput, dt: number): void;
  dispose(): void;
}

export function mergeSteer(out: RawInput, steer: number, digital: boolean, touch = false): void {
  if (Math.abs(steer) > Math.abs(out.steer)) {
    out.steer = steer;
    out.digital = digital;
    out.steerTouch = touch;
  }
}
