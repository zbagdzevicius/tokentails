// Menu sounds, all synthesised. Owned by the META-UI lane. Every function is a no-op before the first gesture.
import { audio, tone } from './synth';

const now = () => audio()?.ctx.currentTime ?? 0;
const semi = (f: number, n: number) => f * Math.pow(2, n / 12);

/** Button press: a soft wooden blip. */
export function uiClick(): void {
  if (!audio()) return;
  tone('triangle', 660, 0.05, 0.18, { to: 520 });
  tone('sine', 1320, 0.03, 0.05);
}

/** Moving the focus with the arrows. */
export function uiMove(): void {
  if (!audio()) return;
  tone('sine', 880, 0.03, 0.06);
}

/** Back / close. */
export function uiBack(): void {
  if (!audio()) return;
  tone('triangle', 520, 0.07, 0.15, { to: 330 });
}

/** Cannot do that (locked city, not enough catnip). */
export function uiDeny(): void {
  if (!audio()) return;
  const t = now();
  tone('square', 150, 0.09, 0.1, { at: t });
  tone('square', 120, 0.12, 0.1, { at: t + 0.1 });
}

/** A star lands. `n` (0..2) raises the pitch for the 2nd and 3rd star. */
export function uiStar(n = 0): void {
  if (!audio()) return;
  const t = now();
  const f = semi(1046, [0, 4, 7][Math.max(0, Math.min(2, n))]);
  tone('sine', f, 0.6, 0.22, { at: t });
  tone('sine', f * 2.01, 0.35, 0.07, { at: t });
  tone('triangle', f * 3, 0.15, 0.04, { at: t + 0.01 });
}

/** Counter tick while numbers roll up. */
export function uiTick(): void {
  if (!audio()) return;
  tone('square', 1800 + Math.random() * 200, 0.015, 0.03);
}

/** Purchase: a rising three-note chime with a sparkle. */
export function uiBuy(): void {
  if (!audio()) return;
  const t = now();
  const base = 784;
  [0, 4, 7, 12].forEach((n, i) => {
    tone('triangle', semi(base, n), 0.25, 0.16, { at: t + i * 0.06 });
    tone('sine', semi(base, n) * 2, 0.18, 0.05, { at: t + i * 0.06 });
  });
}

/** Something new unlocked: a little brass fanfare. */
export function uiFanfare(): void {
  if (!audio()) return;
  const t = now();
  const r = 523;
  const notes: [number, number, number][] = [
    [0, 0, 0.12],
    [0, 0.13, 0.12],
    [0, 0.26, 0.12],
    [5, 0.39, 0.3],
    [9, 0.72, 0.18],
    [12, 0.92, 0.6],
  ];
  for (const [n, at, d] of notes) {
    tone('sawtooth', semi(r, n), d, 0.07, { at: t + at, attack: 0.02 });
    tone('square', semi(r, n - 12), d, 0.04, { at: t + at, attack: 0.02 });
  }
  tone('triangle', semi(r, 16), 0.8, 0.06, { at: t + 0.92 });
}

/** Results stinger: a happy cadence, or a sleepy slide for TOO WET. */
export function uiJingle(happy: boolean): void {
  if (!audio()) return;
  const t = now();
  if (happy) {
    [0, 4, 7, 11, 12].forEach((n, i) => tone('triangle', semi(392, n), 0.3, 0.12, { at: t + i * 0.09 }));
  } else {
    tone('triangle', 392, 0.5, 0.12, { at: t, to: 196 });
    tone('triangle', 330, 0.7, 0.1, { at: t + 0.45, to: 147 });
  }
}

/** A short purr-like rumble for the tutorial "nice!" moments. */
export function uiNice(): void {
  if (!audio()) return;
  const t = now();
  tone('sine', 880, 0.12, 0.12, { at: t });
  tone('sine', 1320, 0.2, 0.1, { at: t + 0.08 });
}
