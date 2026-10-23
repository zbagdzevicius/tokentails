// Filler checkpoints (pure, node-importable). The stage scripts flag a checkpoint before every big set piece; this adds
// more so no stretch between two checkpoints is longer than maxGap, which keeps a late death cheap. A filler spot is
// on plain ground (or a bridge, or the river), with no hazard starting just before or shortly after it, so a respawn there is fair.
import type { PieceSpec, SegmentKind } from './types';

/** pieces that can hurt: no checkpoint right on top of them */
export const HAZARD_TYPES: ReadonlySet<string> = new Set(['log', 'rock', 'branch', 'puddle', 'bamboo', 'driftlog', 'riverrock', 'rapid', 'edge']);
const SAFE_KINDS: ReadonlySet<SegmentKind> = new Set<SegmentKind>(['ground', 'bridge', 'river']);

export const MAX_CP_GAP = 300;

/** true when a respawn at c is fair: ground, bridge or river from c - 2 to c + 24 and no hazard from c - 4 to c + 18 */
export function safeSpot(c: number, specs: readonly PieceSpec[], kindAt: (s: number) => SegmentKind): boolean {
  for (let s = c - 2; s <= c + 24; s += 1) if (!SAFE_KINDS.has(kindAt(s))) return false;
  for (const sp of specs) {
    if (!HAZARD_TYPES.has(sp.type)) continue;
    if (sp.s <= c + 18 && sp.s + (sp.len ?? 0) >= c - 4) return false;
  }
  return true;
}

/**
 * Returns the sorted checkpoint list with fillers so that no gap (including the last one, to `end`) is longer than
 * maxGap where a safe spot exists. cps must contain 0.
 */
export function fillCheckpoints(cps: readonly number[], specs: readonly PieceSpec[], kindAt: (s: number) => SegmentKind, end: number, maxGap = MAX_CP_GAP): number[] {
  const out = [...new Set(cps)].sort((a, b) => a - b);
  let guard = 0;
  for (let i = 0; i < out.length && guard++ < 500; i++) {
    const a = out[i];
    const b = i + 1 < out.length ? out[i + 1] : end;
    if (b - a <= maxGap) continue;
    // the latest safe spot no further than maxGap ahead, else the earliest one after that (still before b - 60)
    let found = -1;
    for (let c = Math.floor(a + maxGap); c >= a + maxGap * 0.4; c -= 2) {
      if (safeSpot(c, specs, kindAt)) {
        found = c;
        break;
      }
    }
    if (found < 0) {
      for (let c = Math.floor(a + maxGap) + 2; c < b - 60; c += 2) {
        if (safeSpot(c, specs, kindAt)) {
          found = c;
          break;
        }
      }
    }
    if (found > a) out.splice(i + 1, 0, found);
  }
  return out;
}
