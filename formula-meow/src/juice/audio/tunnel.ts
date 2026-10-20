/**
 * Tunnel acoustics (iteration 3, juice lane; SETPIECES.md section 9). Inside a tunnel the music closes to a 900 Hz
 * low-pass in 0.25 s, the sfx and engine buses get a short slap-back echo (120 ms, feedback 0.25, wet 0.3) and the
 * engine comes up 3 dB, so the walls feel close and the speed feels louder. Outside every node sits at its neutral
 * value (low-pass wide open, echo wet 0, engine trim 1): the graph costs nothing audible on the open road.
 *
 * Graph (built once per audio context, a sibling of the race audio's pause low-pass):
 *   music → `lp` → (the race audio's pause low-pass)
 *   sfx, engine → `send` → `delay` ⇄ `fb` ; `delay` → `wet` → out
 *   engine bus gain × `engineTrim`
 */

/** The numbers (tests read them). */
export const TUNNEL_AUDIO = {
  lpHz: 900,
  /** time to close / open the low-pass (s); setTargetAtTime uses a third of it as the time constant */
  lpTime: 0.25,
  delay: 0.12,
  feedback: 0.25,
  wet: 0.3,
  /** engine +3 dB */
  engineTrim: 1.4125,
} as const;

/** The parts of an AudioContext the tunnel graph needs (a fake one in tests). */
export interface TunnelCtx {
  readonly currentTime: number;
  readonly sampleRate: number;
  createBiquadFilter(): BiquadFilterNode;
  createDelay(max?: number): DelayNode;
  createGain(): GainNode;
}

export class TunnelAudio {
  /** music goes in here (and comes out of `lp` into whatever follows) */
  readonly lp: BiquadFilterNode;
  /** connect the sfx and engine buses to this (a post-fader send) */
  readonly send: GainNode;
  readonly delay: DelayNode;
  readonly fb: GainNode;
  readonly wet: GainNode;
  private on = false;
  private readonly open: number;

  constructor(
    private readonly ctx: TunnelCtx,
    out: AudioNode,
  ) {
    this.open = Math.min(20000, ctx.sampleRate / 2);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = this.open;
    this.lp.Q.value = 0.7;
    this.send = ctx.createGain();
    this.send.gain.value = 1;
    this.delay = ctx.createDelay(0.5);
    this.delay.delayTime.value = TUNNEL_AUDIO.delay;
    this.fb = ctx.createGain();
    this.fb.gain.value = TUNNEL_AUDIO.feedback;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    this.send.connect(this.delay);
    this.delay.connect(this.fb);
    this.fb.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(out);
  }

  get inside(): boolean {
    return this.on;
  }

  /** The engine bus multiplier now (the race audio folds it into the engine level). */
  get engineTrim(): number {
    return this.on ? TUNNEL_AUDIO.engineTrim : 1;
  }

  /** Enter or leave a tunnel. Returns true when it changed. */
  set(on: boolean): boolean {
    if (on === this.on) return false;
    this.on = on;
    const t = this.ctx.currentTime;
    const tau = TUNNEL_AUDIO.lpTime / 3;
    this.lp.frequency.cancelScheduledValues(t);
    this.lp.frequency.setTargetAtTime(on ? TUNNEL_AUDIO.lpHz : this.open, t, tau);
    this.wet.gain.cancelScheduledValues(t);
    this.wet.gain.setTargetAtTime(on ? TUNNEL_AUDIO.wet : 0, t, on ? tau : tau * 2);
    return true;
  }

  /** Back to the open road at once (race reset). */
  reset(): void {
    this.on = false;
    const t = this.ctx.currentTime;
    this.lp.frequency.cancelScheduledValues(t);
    this.lp.frequency.setValueAtTime(this.open, t);
    this.wet.gain.cancelScheduledValues(t);
    this.wet.gain.setValueAtTime(0, t);
  }
}
