// Menu sounds (procedural, on the sfx bus). META-UI lane. Gameplay sfx belong to cat-audio.
import { audio, initAudio, tone } from '../audio/synth';

export function uiClick(): void {
  initAudio();
  if (!audio()) return;
  tone('triangle', 660, 0.06, 0.18, { to: 880 });
  tone('sine', 1320, 0.05, 0.06, { at: audio()!.ctx.currentTime + 0.03 });
}
export function uiBack(): void {
  if (!audio()) return;
  tone('triangle', 620, 0.08, 0.16, { to: 420 });
}
export function uiStar(i: number): void {
  const a = audio();
  if (!a) return;
  const f = [784, 988, 1175][i] ?? 1175;
  tone('square', f, 0.12, 0.07);
  tone('sine', f * 2, 0.25, 0.08, { at: a.ctx.currentTime + 0.04 });
}
export function uiTick(): void {
  if (!audio()) return;
  tone('square', 1400 + Math.random() * 200, 0.02, 0.025);
}
export function uiFanfare(): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, 0.18, 0.12, { at: t + i * 0.09 }));
}
export function uiSad(): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  [392, 370, 349, 262].forEach((f, i) => tone('triangle', f, 0.22, 0.1, { at: t + i * 0.16 }));
}
