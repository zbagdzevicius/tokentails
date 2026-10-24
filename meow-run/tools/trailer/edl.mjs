// Edit decision lists for both cuts (STORYBOARD.md). Shared by render-cards.mjs, audio.mjs and edit.mjs.
// 144 BPM at 60 fps: one beat = 25 frames, one bar = 100. Every cut starts on a beat.
// clip: [shot, src frame in the take, length in frames, fx?]  fx: 'punch' zoom punch at the cut, 'end' blurred bg
// cards: { at, len, kind: 'slam'|'cap'|'tag'|'end', text, sub?, color? } (frames of the cut)
// music: [[fromBeat, section]] (intro, groove, lead, chase, cozy, end); risers / drops: [[fromBeat, toBeat]]
export const FPS = 60;
export const BEAT = 25;
export const BAR = 100;

const b = (n) => Math.round(n * BEAT);
const URL = 'Play free at tokentails.com/meow-run';

export const CUTS = {
  trailer: {
    aspect: '16x9',
    out: 'meowrun-trailer',
    poster: ['loop', 368], // clean frame (no HUD): Mochi on her tail at the top of the vault, the bell beside her
    posterLift: 0.33, // the title card sits above her head
    clips: [
      ['hook', 78, b(4)],
      ['title', 130, b(4), 'punch'],
      ['m-run', 90, b(4), 'punch'],
      ['m-slide', 30, b(4), 'punch'],
      ['m-vault', 160, b(4), 'punch'],
      ['g-wall', 30, b(4), 'punch'],
      ['g-wall2', 100, b(4), 'punch'],
      ['g-river', 110, b(6), 'punch'],
      ['g-dog', 150, b(6), 'punch'],
      ['s-puff', 50, b(4), 'punch'],
      ['s-cloud', 90, b(4), 'punch'],
      ['s-combo', 0, b(6), 'punch'],
      ['s-yarn', 60, b(6), 'punch'],
      ['m-pounce', 90, b(3), 'punch'],
      ['g-gap', 30, b(3), 'punch'],
      ['s-wall', 5, b(3), 'punch'],
      ['endless', 100, b(3), 'punch'],
      ['cottage', 330, b(4), 'punch'],
      ['end', 0, b(8), 'end'],
    ],
    cards: [
      { at: b(4), len: b(4), kind: 'slam', text: 'MEOW RUN', x: 0.68, y: 0.2 }, // in the sky, clear of Mochi and the dog
      { at: b(8), len: b(4) - 4, kind: 'cap', text: 'Race home for dinner' },
      { at: b(12), len: b(4) - 4, kind: 'cap', text: 'Jump · slide · dodge' },
      { at: b(16), len: b(4) - 4, kind: 'tag', text: 'Tail vault', color: '#ff8a3d' },
      { at: b(20), len: b(8) - 4, kind: 'tag', text: 'Claws out!', sub: 'WALL-RUN', color: '#ffd24a' },
      { at: b(28), len: b(6) - 4, kind: 'cap', text: 'Leaf surf the river' },
      { at: b(34), len: b(6) - 4, kind: 'cap', text: 'The big dog wants to play' },
      { at: b(40), len: b(8) - 4, kind: 'tag', text: 'Puff cloud', sub: 'OVER THE CANYON', color: '#b98cff' },
      { at: b(48), len: b(6) - 4, kind: 'cap', text: '7 golden bells · fish combos' },
      { at: b(54), len: b(6) - 4, kind: 'cap', text: 'Outrun the giant yarn ball' },
      { at: b(60), len: b(12) - 4, kind: 'cap', text: '3 stages + Endless' },
      { at: b(60), len: b(3) - 3, kind: 'tag', text: 'Sunny Meadow', color: '#8fd36a', big: 1.35 },
      { at: b(63), len: b(3) - 3, kind: 'tag', text: 'River Gorge', color: '#6cc8ff', big: 1.35 },
      { at: b(66), len: b(3) - 3, kind: 'tag', text: 'Sunset Hills', color: '#ff9a6a', big: 1.35 },
      { at: b(69), len: b(3) - 3, kind: 'tag', text: 'Endless', sub: 'HOW FAR CAN YOU GO?', color: '#b98cff', big: 1.35 },
      { at: b(76), len: b(8), kind: 'end', text: 'MEOW RUN', sub: URL },
    ],
    music: [[0, 'intro'], [4, 'groove'], [16, 'lead'], [34, 'chase'], [40, 'lead'], [54, 'chase'], [60, 'lead'], [72, 'cozy'], [76, 'end']],
    risers: [[2, 4], [32, 34], [52, 54], [74, 76]],
    drops: [[3.5, 4], [75.5, 76]],
    hits: [[b(73), 'meow']],
  },
  mode: {
    aspect: '9x16',
    out: 'meowrun-mode',
    posterAt: b(8) + 40, // 'Swipe up to jump': Mochi over the log, the finger mid-swipe
    clips: [
      ['hook', 78, b(4)],
      ['p-steer', 30, b(4), 'punch'],
      ['p-jump', 30, b(4), 'punch'],
      ['p-slide', 60, b(4), 'punch'],
      ['p-pounce', 70, b(4), 'punch'],
      ['p-vault', 170, b(4), 'punch'],
      ['p-wall', 20, b(4), 'punch'],
      ['p-river', 40, b(4), 'punch'],
      ['p-cloud', 70, b(4), 'punch'],
      ['p-bells', 50, b(4), 'punch'],
      ['p-fish', 0, b(4), 'punch'],
      ['p-dog', 110, b(4), 'punch'],
      ['p-yarn', 50, b(4), 'punch'],
      ['cottage', 330, b(4), 'punch'],
      ['end', 0, b(6), 'end'],
    ],
    cards: [
      { at: 6, len: b(4) - 10, kind: 'slam', text: 'MEOW RUN', sub: 'How to play' },
      { at: b(4), len: b(4) - 4, kind: 'cap', text: 'Drag to steer' },
      { at: b(8), len: b(4) - 4, kind: 'cap', text: 'Swipe up to jump' },
      { at: b(12), len: b(4) - 4, kind: 'cap', text: 'Swipe down to slide' },
      { at: b(16), len: b(4) - 4, kind: 'cap', text: 'Swipe up twice', sub: 'Pounce over gaps' },
      { at: b(20), len: b(4) - 4, kind: 'cap', text: 'Tap: tail vault' },
      { at: b(24), len: b(4) - 4, kind: 'cap', text: 'Claws out on walls', sub: 'Automatic' },
      { at: b(28), len: b(4) - 4, kind: 'cap', text: 'Surf the river' },
      { at: b(32), len: b(4) - 4, kind: 'cap', text: 'Tap: puff cloud' },
      { at: b(36), len: b(4) - 4, kind: 'cap', text: 'Grab all 7 bells' },
      { at: b(40), len: b(4) - 4, kind: 'cap', text: 'Fish = combo' },
      { at: b(44), len: b(4) - 4, kind: 'cap', text: "Don't get caught", sub: '3 hearts a run' },
      { at: b(48), len: b(4) - 4, kind: 'cap', text: 'Stay on the free side' },
      { at: b(56), len: b(6), kind: 'end', text: 'MEOW RUN', sub: URL },
    ],
    music: [[0, 'intro'], [4, 'groove'], [20, 'lead'], [44, 'chase'], [52, 'cozy'], [56, 'end']],
    risers: [[2, 4], [42, 44], [54, 56]],
    drops: [[3.5, 4]],
  },
};

/** Cut length in frames, and each clip's destination frame. */
export function layout(cut) {
  let at = 0;
  const clips = cut.clips.map(([shot, src, len, fx]) => {
    const c = { shot, src, len, fx: fx ?? '', at };
    at += len;
    return c;
  });
  return { clips, frames: at };
}
