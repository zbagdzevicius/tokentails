/**
 * Sound effects (POC.md §3): zzfx parameter arrays synthesised into AudioBuffers on the first user gesture (no
 * AudioContext before it, so no autoplay warnings). The sample builder and a few PPK sounds come from the lifted
 * src/audio/sfxDefs.js; the MOBA sounds below are ours. Distance from the camera focus attenuates and pans.
 * Render side only; never feeds the sim.
 */
import { PCM_RATE, ZZFX_DEFS, zzfxSamples } from './sfxDefs.js';

// zzfx 1.4 order: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
//   pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]
export const PL_SFX = {
  swipe: [0.5, 0, 260, 0.01, 0.02, 0.09, 4, 1, 6, 0, 0, 0, 0, 0.9, 0, 0, 0, 0.5, 0.02, 0, 2400],
  hit: [0.7, 0, 160, 0, 0.02, 0.09, 4, 2, -5, 0, 0, 0, 0, 1, 0, 0, 0, 0.6, 0.02, 0, -2000],
  heroHit: [0.9, 0, 110, 0, 0.04, 0.16, 2, 2.4, -6, 0, 0, 0, 0, 1.1, 0, 0.1, 0, 0.5, 0.03, 0, -1500],
  hurt: [0.8, 0, 220, 0, 0.03, 0.14, 1, 1.5, -8, 0, 0, 0, 0, 0.6, 0, 0.05, 0, 0.6, 0.02, 0, -1800],
  arrow: [0.45, 0, 1100, 0.005, 0.02, 0.07, 1, 1, -24, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.01, 0, 0],
  dash: [0.55, 0, 320, 0.02, 0.05, 0.14, 4, 1, 12, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0.04, 0, 3200],
  slam: [1, 0, 70, 0.005, 0.08, 0.32, 0, 2, -1, 0, 0, 0, 0, 0.9, 0, 0.2, 0, 0.6, 0.05, 0, -900],
  magic: [0.45, 0, 620, 0.02, 0.1, 0.25, 0, 1.5, 0, 0, 310, 0.08, 0, 0, 6, 0, 0, 0.6, 0.05, 0.2, 0],
  ult: [0.7, 0, 330, 0.03, 0.18, 0.4, 2, 1, 0, 0, 165, 0.1, 0.1, 0, 4, 0, 0.06, 0.6, 0.05, 0.25, -2600],
  windup: [0.35, 0, 200, 0.12, 0.1, 0.05, 1, 1, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.02, 0, 0],
  levelup: [0.5, 0, 523, 0.02, 0.12, 0.3, 0, 1, 0, 0, 262, 0.07, 0.07, 0, 0, 0, 0.04, 0.7, 0.02, 0, 0],
  death: [0.6, 0, 420, 0.01, 0.1, 0.42, 1, 1, -7, 0, 0, 0, 0, 0.25, 0, 0, 0, 0.5, 0.08, 0, 0],
  poof: [0.4, 0, 500, 0.005, 0.02, 0.12, 4, 1, -2, 0, 0, 0, 0, 0.7, 0, 0, 0, 0.5, 0.02, 0, 1500],
  towerShot: [0.4, 0, 760, 0.002, 0.03, 0.12, 0, 1, -28, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.02, 0, 0],
  boom: [1, 0, 48, 0.01, 0.22, 0.85, 4, 1, -1, 0, 0, 0, 0, 1, 0, 0.3, 0.1, 0.6, 0.1, 0, -700],
  click: [0.35, 0, 880, 0, 0.01, 0.03, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  deny: [0.35, 0, 190, 0, 0.05, 0.1, 5, 1, 0, 0, -50, 0.05, 0, 0, 0, 0, 0, 0.5, 0.02, 0, 0],
  victory: [0.6, 0, 392, 0.02, 0.2, 0.5, 0, 1, 0, 0, 196, 0.12, 0.12, 0, 0, 0, 0.08, 0.8, 0.04, 0, 0],
  defeat: [0.5, 0, 330, 0.03, 0.25, 0.6, 1, 1, -0.6, 0, -40, 0.18, 0, 0, 0, 0, 0.1, 0.6, 0.05, 0, -1800],
  coin: [0.45, 0, 1500, 0, 0.03, 0.18, 0, 1, 0, 0, 500, 0.05, 0, 0, 0, 0, 0, 0.7, 0.01, 0, 0],
  horn: [0.6, 0, 180, 0.05, 0.35, 0.3, 2, 1, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0.7, 0.05, 0.1, -1400],
} satisfies Record<string, number[]>;

export type SfxName = keyof typeof PL_SFX | 'shieldUp' | 'shieldChime' | 'squeak' | 'hyenaLaugh' | 'blip';
const PPK_USED = ['shieldUp', 'shieldChime', 'squeak', 'hyenaLaugh', 'blip'] as const;

export interface PlayOpts {
  vol?: number;
  rate?: number;
  /** World position (m) for distance falloff and pan. */
  at?: { x: number; z: number };
}

export class Sfx {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private lastAt = new Map<string, number>();
  private muted = false;
  private volume = 0.7;
  /** Listener (camera focus, m). */
  ear = { x: 0, z: 0 };

  /** Call from a user gesture. Safe to call many times. */
  unlock(): void {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume().catch(() => undefined);
      return;
    }
    const Ctor = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ac = new Ctor();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ac.destination);
      const defs: Record<string, number[]> = { ...PL_SFX };
      for (const k of PPK_USED) defs[k] = (ZZFX_DEFS as Record<string, number[]>)[k];
      // Bake in small slices so the first gesture never stalls a frame.
      const names = Object.keys(defs);
      const bake = (): void => {
        const t0 = performance.now();
        while (names.length > 0 && performance.now() - t0 < 4) {
          const n = names.shift()!;
          const pcm = zzfxSamples(defs[n], PCM_RATE);
          const buf = this.ac!.createBuffer(1, pcm.length, PCM_RATE);
          buf.getChannelData(0).set(pcm);
          this.buffers.set(n, buf);
        }
        if (names.length > 0) setTimeout(bake, 0);
      };
      bake();
    } catch {
      this.ac = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  play(name: SfxName, o: PlayOpts = {}): void {
    const ac = this.ac;
    const buf = this.buffers.get(name);
    if (!ac || !buf || !this.master || this.muted) return;
    const now = ac.currentTime;
    // the same sound at most every 40 ms (a wave of minions should not machine-gun)
    if (now - (this.lastAt.get(name) ?? -1) < 0.04) return;
    this.lastAt.set(name, now);
    let vol = o.vol ?? 1;
    let pan = 0;
    if (o.at) {
      const dx = o.at.x - this.ear.x;
      const dz = o.at.z - this.ear.z;
      const d = Math.hypot(dx, dz);
      vol *= Math.max(0, 1 - Math.max(0, d - 8) / 26);
      pan = Math.max(-0.8, Math.min(0.8, dx / 18));
    }
    if (vol <= 0.02) return;
    try {
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = (o.rate ?? 1) * (0.94 + Math.random() * 0.12);
      const g = ac.createGain();
      g.gain.value = vol;
      let tail: AudioNode = g;
      if (pan !== 0 && typeof ac.createStereoPanner === 'function') {
        const p = ac.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        tail = p;
      }
      src.connect(g);
      tail.connect(this.master);
      src.start();
    } catch {
      /* audio is best effort */
    }
  }
}

export const sfx = new Sfx();
