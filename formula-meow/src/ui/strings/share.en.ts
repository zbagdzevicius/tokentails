/**
 * The share-ugc lane's strings (English, iteration 4: results headline, dare card, duel, clip hype, Beat the maker).
 * Registered by `ui/install.ts`; every visible string goes through `t()`. Numbers in them are measured on this device
 * in this race only (margins, gaps, laps).
 */
export const SHARE_EN: Record<string, string> = {
  // F7 results headline (share/cards/headline.ts)
  "Checking {name}'s ghost…": "Checking {name}'s ghost…",
  "You beat {name}'s ghost by {s} s": "You beat {name}'s ghost by {s} s",
  "You beat {name}'s ghost": "You beat {name}'s ghost",
  "Lost to {name}'s ghost by {s} s": "Lost to {name}'s ghost by {s} s",
  "{name}'s ghost won": "{name}'s ghost won",
  'PHOTO FINISH by {s} s': 'PHOTO FINISH by {s} s',
  'WON BY {s} s': 'WON BY {s} s',
  '{name} beat you by {s} s': '{name} beat you by {s} s',
  'You held off {name} by {s} s': 'You held off {name} by {s} s',
  'New best by {s} s': 'New best by {s} s',
  'New best': 'New best',
  '{s} s off your best': '{s} s off your best',
  More: 'More',
  // F7 clip hype (share/clip/highlight.ts hypeReason)
  'That photo finish deserves a clip': 'That photo finish deserves a clip',
  'That ×{n} combo deserves a clip': 'That ×{n} combo deserves a clip',
  '{n} loops deserve a clip': '{n} loops deserve a clip',
  // F9 dares and duels (share/links/dare-card.ts, dare-flow.ts)
  '⚔️ Dare a friend': '⚔️ Dare a friend',
  '⚔️ Send it back': '⚔️ Send it back',
  '⚔️ Dare': '⚔️ Dare',
  '{name} dares you': '{name} dares you',
  'did not finish': 'did not finish',
  'Race the pack': 'Race the pack',
  'Race the same track': 'Race the same track',
  '1v1: you and the ghost': '1v1: you and the ghost',
  'You, the ghost and 7 cats': 'You, the ghost and 7 cats',
  'Time trial: you and the ghost': 'Time trial: you and the ghost',
  'Rematch 👻': 'Rematch 👻',
  // F10 Beat the maker (ugc/maker-lap.ts, ugc/hub.ts)
  "⏱ Sender's lap {t} · beat it": "⏱ Sender's lap {t} · beat it",
  "⏱ You beat the sender's lap by {s} s!": "⏱ You beat the sender's lap by {s} s!",
  "⏱ You matched the sender's lap: {t}": "⏱ You matched the sender's lap: {t}",
  "⏱ The sender's lap is {s} s faster. Again?": "⏱ The sender's lap is {s} s faster. Again?",
  Lap: 'Lap',
};
