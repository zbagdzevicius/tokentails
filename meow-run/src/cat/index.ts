// CAT-AUDIO lane entry: the kitten, the actors, music + sfx and the juice. Called once by main.ts.
import { registerAudio } from '../audio';
import { audio } from '../audio/synth';
import { musicContext, musicState } from '../audio/music';
import { speedLineLevel } from '../juice/speedlines';
import { scene } from '../core/engine';
import { kittenRig } from '../core/player';
import { registerKitten } from '../core/registry';
import { registerJuice } from '../juice';
import { registerActors } from './actors';
import { buildMochi } from './mochi';

export function registerCatAudio(): void {
  registerKitten(buildMochi);
  registerActors();
  registerAudio();
  registerJuice();
  // test hook for shots/cat-audio-*.mjs (read-only helpers)
  let an: AnalyserNode | null = null;
  const buf = new Float32Array(2048);
  /** RMS of the master output right now (0 = silence; null before the audio context exists) */
  const level = () => {
    const A = audio();
    if (!A) return null;
    if (!an) {
      an = A.ctx.createAnalyser();
      an.fftSize = 2048;
      A.out.connect(an);
    }
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  };
  (window as unknown as { __catAudio: unknown }).__catAudio = { scene, rig: kittenRig, music: musicState, audioCtx: musicContext, speedLines: speedLineLevel, level };
}
