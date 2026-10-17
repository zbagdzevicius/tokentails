/**
 * Clip caption lines (GDD 7.3 caption templates). One line, top third, readable with the sound off in 1 s.
 * The UI copy file (ui/copy.ts, L5) owns screen text; these are the burned-in clip captions only.
 */
import { DEFAULT_CAT, TICK_HZ, type ClipPlan } from '../../types';

export type HookKind = 'pov' | 'turned_late' | 'caught' | 'perfect' | 'glass';

/** Seconds with one decimal, never "0.0" (a 0-tick gap still reads as "0.1"). */
export function formatGap(gapTicks: number): string {
  const tenths = Math.max(1, Math.round((Math.max(0, gapTicks) * 10) / TICK_HZ));
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

export function turnedLateCaption(gapTicks: number): string {
  return `He turned around ${formatGap(gapTicks)} seconds too late`;
}

/** "link in bio" in any spacing (GDD 7.5: no format uses it; a cat literally named "Linkinbio" reads as the default cat). */
export const LINK_IN_BIO = /link\s*(is\s*)?in\s*(my\s*)?bio/i;

/** Cat name for burned-in captions: trimmed, default "Tofu" when empty or when it reads as "link in bio". */
export function catOrDefault(cat: string): string {
  const c = (cat || '').trim();
  return c && !LINK_IN_BIO.test(c) ? c : DEFAULT_CAT.name;
}

/** Hook caption for the first 10 s of the clip. */
export function hookFor(kind: HookKind, catName: string, opts: { seconds?: number; gapTicks?: number } = {}): string {
  const cat = catOrDefault(catName);
  switch (kind) {
    case 'turned_late':
      return turnedLateCaption(opts.gapTicks ?? 0);
    case 'caught':
      return `This is what ${cat} does when you leave`;
    case 'perfect':
      return `${cat} has never been caught`;
    case 'glass':
      return `${cat} vs. the wine glass`;
    case 'pov':
    default:
      return `POV: you left ${cat} alone for ${opts.seconds ?? 75} seconds`;
  }
}

/** Caption for a plan: the measured "turned too late" line when a gap is given, else the plan's hook. */
export function captionFor(plan: ClipPlan, gapTicks?: number): string {
  if (typeof gapTicks === 'number' && gapTicks >= 0) return turnedLateCaption(gapTicks);
  return plan.hook;
}

/** The caption line shown at a clip frame: hook until 10 s, then the URL line (it replaces the hook). */
export function captionAt(plan: ClipPlan, frame: number, urlFromFrame = 300): string {
  return frame >= urlFromFrame ? plan.urlLine : plan.hook;
}

/** Text that goes with the shared clip (GDD 7.5 format 2). */
export function clipShareText(catName: string, link: string): string {
  return `${catOrDefault(catName)} chose violence 😼 ${link} #badcatdaily #catsoftiktok #cattok`;
}
