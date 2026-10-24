// Edit decision lists for both cuts (STORYBOARD.md). Shared by render-cards.mjs, audio.mjs and edit.mjs.
// 150 BPM at 60 fps: one beat = 24 frames, one bar = 96. Every cut starts on a beat.
// clip: [shot, src frame in the take, length in frames, fx?]  fx: 'punch' zoom punch at the cut, 'end' blurred bg
// cards: { at, len, kind: 'slam'|'cap'|'tag'|'end', text, sub?, color? } (frames of the cut)
export const FPS = 60;
export const BEAT = 24;
export const BAR = 96;

const b = (n) => n * BEAT;

export const CUTS = {
  trailer: {
    aspect: '16x9',
    out: 'ultracat-trailer',
    poster: ['loop', 440], // clean frame (no HUD) + the title card
    clips: [
      ['hook', 0, b(4)],
      ['title', 30, b(4), 'punch'],
      ['combo', 40, b(8)],
      ['heli', 70, b(4), 'punch'],
      ['truck', 30, b(4), 'punch'],
      ['u-tabby', 0, b(4), 'punch'],
      ['u-chonk', 70, b(4), 'punch'],
      ['u-shadow', 0, b(4), 'punch'],
      ['u-siamese', 0, b(4), 'punch'],
      ['c-meow', 60, b(2), 'punch'],
      ['c-docks', 20, b(2), 'punch'],
      ['c-sub', 20, b(2), 'punch'],
      ['c-neko', 20, b(2), 'punch'],
      ['c-base', 18, b(2), 'punch'],
      ['wanted', 0, b(2), 'punch'],
      ['dog', 170, b(8), 'punch'],
      ['roomba', 110, b(4), 'punch'],
      ['roomba', 300, b(4), 'punch'],
      ['roomba', 560, b(4), 'punch'],
      ['frenzy', 120, b(4), 'punch'],
      ['end', 0, b(12), 'end'],
    ],
    cards: [
      { at: b(4), len: b(4), kind: 'slam', text: 'ULTRA CAT' },
      { at: b(8), len: b(8) - 6, kind: 'cap', text: 'Knock everything off the table' },
      { at: b(16), len: b(4) - 4, kind: 'cap', text: 'The city fights back' },
      { at: b(20), len: b(4) - 4, kind: 'tag', text: 'Fire trucks', color: '#ff5a4a' },
      { at: b(24), len: b(16) - 4, kind: 'cap', text: '4 cats · 4 ULTRAs' },
      { at: b(24), len: b(4) - 4, kind: 'tag', text: 'Marmalade', sub: 'LASER EYES', color: '#ff8a2a' },
      { at: b(28), len: b(4) - 4, kind: 'tag', text: 'Big Biscuit', sub: 'BELLY FLOP', color: '#ffb35a' },
      { at: b(32), len: b(4) - 4, kind: 'tag', text: 'Midnight', sub: 'SHADOW DASH', color: '#a98bff' },
      { at: b(36), len: b(4) - 4, kind: 'tag', text: 'Duchess', sub: 'SONIC YOWL', color: '#7fe3ff' },
      { at: b(40), len: b(10) - 4, kind: 'cap', text: '5 cities to wreck' },
      { at: b(40), len: b(2) - 3, kind: 'tag', text: 'Meowhattan', color: '#ffd24a' },
      { at: b(42), len: b(2) - 3, kind: 'tag', text: 'Catfish Wharf', color: '#ff9a5a' },
      { at: b(44), len: b(2) - 3, kind: 'tag', text: 'Purrburbia', color: '#7ccf5a' },
      { at: b(46), len: b(2) - 3, kind: 'tag', text: 'Nekotown', color: '#ff3e7a' },
      { at: b(48), len: b(2) - 3, kind: 'tag', text: 'Fort Fluffington', color: '#c9b27a' },
      { at: b(50), len: b(2) - 3, kind: 'tag', text: 'Topple the landmarks', color: '#ff5a4a' },
      { at: b(52), len: b(8) - 4, kind: 'cap', text: 'Boss: Mecha-Dog' },
      // ends before the UNPLUGGED beat: the game's banner is that shot's one headline
      { at: b(60), len: b(8) - 4, kind: 'cap', text: 'Final boss: Roomba Prime' },
      { at: b(72), len: b(4) - 4, kind: 'cap', text: 'Final frenzy' },
      { at: b(76), len: b(12), kind: 'end', text: 'ULTRA CAT', sub: 'Play free at tokentails.com/ultra-cat' },
    ],
  },
  mode: {
    aspect: '9x16',
    out: 'ultracat-mode',
    posterAt: b(4) + 30, // 'Drag to stomp around': the cat in full view (the title frame hid it behind the card)
    clips: [
      ['hook', 0, b(4)],
      ['p-move', 20, b(4), 'punch'],
      ['p-swat', 10, b(4), 'punch'],
      ['p-pounce', 20, b(4), 'punch'],
      ['p-zoom', 20, b(4), 'punch'],
      ['u-tabby', 0, b(6), 'punch'],
      ['heli', 150, b(6), 'punch'],
      ['combo', 60, b(6), 'punch'],
      ['roomba', 110, b(4), 'punch'],
      ['roomba', 560, b(4), 'punch'],
      ['u-chonk', 70, b(2), 'punch'],
      ['u-shadow', 10, b(2), 'punch'],
      ['u-siamese', 10, b(2), 'punch'],
      ['frenzy', 40, b(2), 'punch'],
      ['frenzy', 100, b(6), 'punch'],
      ['end', 0, b(6), 'end'],
    ],
    cards: [
      { at: 6, len: b(4) - 10, kind: 'slam', text: 'ULTRA CAT', sub: 'How to play' },
      { at: b(4), len: b(4) - 4, kind: 'cap', text: 'Drag to stomp around' },
      { at: b(8), len: b(4) - 4, kind: 'cap', text: 'Tap SWAT: knock it down' },
      { at: b(12), len: b(4) - 4, kind: 'cap', text: 'POUNCE to smash' },
      { at: b(16), len: b(4) - 4, kind: 'cap', text: 'Hold ZOOM to bulldoze' },
      { at: b(20), len: b(6) - 4, kind: 'cap', text: 'Meter full? Hit ULTRA' },
      { at: b(26), len: b(6) - 4, kind: 'cap', text: 'Water = nap time', sub: 'Swat the helicopters' },
      { at: b(32), len: b(6) - 4, kind: 'cap', text: 'Chain hits for combos' },
      { at: b(38), len: b(8) - 4, kind: 'cap', text: 'Beat the bosses' },
      { at: b(46), len: b(8) - 4, kind: 'cap', text: '4 cats · 5 cities' },
      { at: b(54), len: b(6) - 4, kind: 'cap', text: 'Final frenzy: x2' },
      { at: b(60), len: b(6), kind: 'end', text: 'ULTRA CAT', sub: 'Play free at tokentails.com/ultra-cat' },
    ],
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
