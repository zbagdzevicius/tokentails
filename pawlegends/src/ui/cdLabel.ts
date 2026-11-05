/**
 * LoL pass (lane B): a cooldown's number on an ability slot (the desktop bar and the touch buttons): whole seconds
 * (rounded up) from 1 s, one decimal under it ("0.6"), '' when ready. `ticks` at 30 Hz. Pure.
 */
export function cdLabel(ticks: number): string {
  if (!(ticks > 0)) return '';
  const s = ticks / 30;
  if (s >= 1) return String(Math.ceil(s));
  return Math.max(0.1, Math.floor(s * 10) / 10).toFixed(1);
}
