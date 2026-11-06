/**
 * Party play strings (docs/plans/moba/MULTIPLAYER.md §8). Every pre-match screen reads its text from here, so a copy
 * pass touches one file. Rail lines stay short (<= 28 characters on phones).
 */
export const COPY = Object.freeze({
  title: 'Play with friends',
  party: 'Party',
  partyCode: 'Party code',
  share: 'Share',
  copy: 'Copy link',
  copied: 'Copied',
  linkCopied: 'Link copied',
  showQr: 'Show QR',
  scanToJoin: 'Scan to join',
  close: 'Close',
  invite: 'Invite',
  you: 'you',
  guest: 'guest',
  leader: 'Leader',
  makeLeader: 'Make leader',
  remove: 'Remove',
  bots: 'Bots',
  leaderPicks: (d: string) => `Leader picks: ${d}`,
  newPlayer: 'New player in party',
  openSeats: 'Open seats',
  openSeatsNote: 'Friends can join mid-match',
  openSeatsBuff: 'Bots get the human buff while seats are open',
  openSeatsRewards: 'Unfilled seats lower rewards',
  lockParty: 'Lock party',
  newCode: 'New code',
  start: 'Start',
  play: 'Play',
  startAnyway: 'Start anyway',
  waitingLeader: 'Waiting for leader',
  waitingFor: (name: string) => `Waiting for ${name}`,
  nudge: 'Nudge',
  nudged: 'Nudged',
  leave: 'Leave party',
  back: 'Back',
  playAgain: 'Play again together',
  joinWithCode: 'Join with code',
  enterCode: 'Enter the 6-character code',
  codeSkipped: 'Codes never use 0, 1, I, L or O',
  paste: 'Paste',
  join: 'Join',
  joining: (code: string) => `Joining ${code}…`,
  connecting: 'Connecting…',
  // pick
  pickTitle: 'Pick your hero',
  lockIn: 'Lock in',
  lockedIn: 'Locked in',
  trick: 'Paw Trick',
  tryThis: 'New? Try this',
  leaderChose: (side: string) => `Leader chose ${side}s`,
  bot: 'Bot',
  // loading
  loadingTitle: 'Into the Crossing…',
  botCovers: (name: string) => `Bot covers until ${name} loads`,
  botsCover: 'Bots cover anyone still loading',
  // notes (top of the screen; the rail in a match)
  nudgedYou: (name: string) => `${name} nudged you`,
  rematchNote: 'Leader started a rematch',
  joinedNote: (name: string) => `${name} joined`,
  leftNote: (name: string) => `${name} left`,
  leaderNote: (name: string) => `${name} leads now`,
  youLead: 'You lead the party now',
  // errors (§8)
  ended: 'This party has ended',
  notFound: 'No party with that code',
  codeChanged: 'This invite is out of date: ask for a new link',
  alreadyIn: 'You are already in this party in another tab',
  sideSwitched: 'Leader switched sides: pick again',
  heroTaken: (hero: string, name: string) => `${name} took ${hero}`,
  leaveSure: 'Tap again to leave',
  removeSure: 'Tap again to remove',
  rematchSoon: (s: number) => `Starting in ${s}s`,
  changeHero: 'Change hero',
  slowJoin: (s: number) => `Still connecting · ${s}s (slow network?)`,
  startWhenBack: (name: string) => `Starting when ${name} is back`,
  playNow: 'Play now',
  ownParty: 'Start your own party',
  updateRequired: 'Update to play together',
  reload: 'Reload',
  busy: (s: number) => `Servers busy, retrying in ${s}s`,
  kicked: 'You were removed from the party',
  locked: 'This party is locked',
  full: 'This party is full',
  inMatch: 'This party is in a match',
  slowDown: 'Slow down a moment',
  elsewhere: 'Playing in another tab',
  badTicket: 'Sign-in expired: playing as a guest',
  badCode: 'A code has 6 letters and digits',
  generic: 'Something went wrong',
  offline: 'Reconnecting…',
});

/** The text of a relay error code on a pre-match screen. */
export function errorText(code: string, retryS = 0): string {
  switch (code) {
    case 'update_required':
      return COPY.updateRequired;
    case 'party_not_found':
      return COPY.notFound;
    case 'party_ended':
    case 'room_gone':
      return COPY.ended;
    case 'code_changed':
      return COPY.codeChanged;
    case 'already_in_party':
      return COPY.alreadyIn;
    case 'party_full':
      return COPY.full;
    case 'party_busy':
      return COPY.inMatch;
    case 'party_locked':
      return COPY.locked;
    case 'kicked':
      return COPY.kicked;
    case 'server_busy':
      return COPY.busy(Math.max(1, retryS));
    case 'rate_limited':
      return COPY.slowDown;
    case 'seat_elsewhere':
      return COPY.elsewhere;
    case 'bad_ticket':
      return COPY.badTicket;
    case 'bad_code':
      return COPY.badCode;
    default:
      return COPY.generic;
  }
}

export const DIFF_LABEL: Readonly<Record<string, string>> = Object.freeze({ rookie: 'Rookie', easy: 'Easy', normal: 'Normal', hard: 'Hard' });

/** Escape text for innerHTML (every name, code and label goes through it). */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
