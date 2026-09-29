/**
 * The chiptune loop as data: 4 bars of 16th-note steps (64 steps) in A minor, a sneaky
 * "tiptoe" feel. MIDI note numbers, null = rest. Progression Am - F - G - E.
 */
export interface MusicTrack {
  bpm: number;
  bass: (number | null)[];
  lead: (number | null)[];
  /** Variation played on every second loop. */
  leadB?: (number | null)[];
}

const _ = null;

function bassBar(root: number): (number | null)[] {
  // Staccato walking pattern: root, octave, fifth.
  return [root, _, _, root, _, _, root + 12, _, root, _, root + 7, _, root + 12, _, root + 7, _];
}

export const MUSIC: MusicTrack = {
  bpm: 108,
  bass: [...bassBar(45), ...bassBar(41), ...bassBar(43), ...bassBar(40)],
  lead: [
    // Am
    69, _, _, 72, _, 71, _, 69, _, _, 64, _, _, _, _, _,
    // F
    65, _, _, 69, _, 72, _, 69, _, _, 67, _, 65, _, _, _,
    // G
    67, _, _, 71, _, 74, _, 71, _, _, 69, _, 67, _, _, _,
    // E
    68, _, _, 71, _, 76, _, _, 74, _, 71, _, 68, _, 64, _,
  ],
  leadB: [
    76, _, 72, _, 69, _, 72, _, 76, _, 79, _, 76, _, _, _,
    77, _, 72, _, 69, _, 72, _, 77, _, 76, _, 72, _, _, _,
    74, _, 71, _, 67, _, 71, _, 74, _, 79, _, 74, _, _, _,
    76, _, 71, _, 68, _, 71, _, 76, _, _, 74, 71, _, 68, _,
  ],
};
