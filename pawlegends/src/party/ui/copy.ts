/**
 * Party play strings (docs/plans/moba/MULTIPLAYER.md §8). Every pre-match screen reads its text from here, so a copy
 * pass touches one file. Rail lines stay short (<= 28 characters on phones).
 */
export const COPY = Object.freeze({
  /** CHAT-AVATARS.md §5: a friend's DM arrived while in the party screens. */
  dmNotice: 'New message from a friend',
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
  // SOCIAL-INVITES.md: the Friends sheet over the lobby (Invite on online friends' rows)
  inviteFriends: 'Invite friends',
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
  openSeatsBuff: 'Bots in open seats get the same boost as players',
  openSeatsRewards: 'A seat still empty after 1 minute lowers rewards one difficulty',
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
  /** Quick Play pick: leave the matched team (a bot takes the seat). */
  leaveMatch: 'Leave',
  back: 'Back',
  playAgain: 'Play again together',
  joinWithCode: 'Join with code',
  enterCode: 'Enter the 6-character code',
  codeSkipped: 'Codes have no 0, 1, I, L or O',
  paste: 'Paste',
  join: 'Join',
  joining: (code: string) => `Joining ${code}…`,
  connecting: 'Connecting…',
  // pick
  pickTitle: 'Pick your champion',
  /** Ranked draft (SOCIAL-RANKED.md §7.13). */
  banTitle: 'Ban a champion',
  banLock: 'BAN',
  banVoted: (name: string) => `Your vote: ${name}`,
  banRule: (side: string) => `Your team bans one of the ${side}. Most votes wins. A bot team bans too.`,
  lockIn: 'Lock in',
  skillsLore: 'Abilities & lore',
  lockedIn: 'Locked in',
  trick: 'Paw Trick',
  tryThis: 'New? Try this',
  leaderChose: (side: string) => `Leader chose ${side}s`,
  bot: 'Bot',
  // loading
  loadingTitle: 'Into the Crossing…',
  botCovers: (name: string) => `A bot plays for ${name} until they load`,
  // notes (top of the screen; the rail in a match)
  nudgedYou: (name: string) => `${name} nudged you`,
  rematchNote: 'Leader started a rematch',
  joinedNote: (name: string) => `${name} joined`,
  leftNote: (name: string) => `${name} left`,
  leaderNote: (name: string) => `${name} leads now`,
  youLead: 'You lead the party now',
  // errors (§8)
  ended: 'This party has ended',
  notFound: 'No party with that code. Check it with your friend.',
  unreachable: 'No connection. Try again.',
  matchLost: 'Lost connection to the match.',
  codeChanged: 'This invite is old. Ask for a new link.',
  alreadyIn: 'You are in this party in another tab.',
  sideSwitched: 'The leader switched sides. Pick again.',
  heroTaken: (hero: string, name: string) => `${name} took ${hero}`,
  leaveSure: 'Tap again to leave',
  removeSure: 'Tap again to remove',
  rematchSoon: (s: number) => `Starting in ${s}s`,
  changeHero: 'Change champion',
  slowJoin: (s: number) => `Still connecting · ${s}s`,
  startWhenBack: (name: string) => `Starting when ${name} is back`,
  playNow: 'Play now',
  ownParty: 'Start your own party',
  // SOCIAL-INVITES.md: the relay plays one sim build per party; say what to do, never a silent failure
  updateRequired: 'A new version is out. Reload to play together.',
  reload: 'Reload',
  busy: (s: number) => `Busy right now. Trying again in ${s}s`,
  kicked: 'You were removed from the party.',
  locked: 'This party is locked',
  full: 'This party is full',
  inMatch: 'This party is in a match',
  slowDown: 'Too fast. Wait a moment.',
  elsewhere: 'Playing in another tab',
  badTicket: 'You were signed out. Playing as a guest.',
  badCode: 'Codes have 6 letters and numbers',
  generic: 'No connection. Try again.',
  offline: 'Reconnecting…',
  // Quick Play co-op (docs/plans/moba/M1A-IMPL.md §1, §6)
  online: 'Play online',
  finding: 'Finding teammates…',
  usually: (t: string) => `usually ${t}`,
  cancel: 'Cancel',
  searchAgain: 'Search again',
  sideLabel: 'Play as',
  sideCat: 'Cats',
  sideDog: 'Dogs',
  sideAny: 'Either',
  playersFound: (n: number) => `${n} of 3 players found`,
  lowPriority: (t: string) => `You left a match early. Wait ${t}`,
  leaverWarn: 'Leaving matches early adds a short wait',
  matchFound: 'Match found',
  foundLine: (humans: number, bots: number, side: string, diff: string) =>
    `${humans} ${humans === 1 ? 'player' : 'players'}${bots ? ` + ${bots} ${bots === 1 ? 'bot' : 'bots'}` : ''} · ${side} · ${diff}`,
  stoppedAway: 'Search stopped while you were away',
  stoppedElsewhere: 'Searching in another tab',
  stoppedParty: 'Search stopped',
  stoppedUpdate: 'Update the game to play online',
  stoppedLocked: (s: number) => `Too many searches from this network. Try again in ${s}s`,
  stoppedBusy: (s: number) => `Too busy right now. Try again in ${s}s`,
  yourTeam: (side: string) => `Your team: ${side}`,
  teamSide: (side: string) => `Your team plays ${side}`,
  partyQueued: 'Your party is searching',
  backfillTitle: 'Join a match in progress',
  backfillAt: (t: string) => `Match time ${t}`,
  backfillJoin: 'Join',
  backfillKeep: 'Keep searching',
  seatTaken: 'Your seat was taken',
  seatTakenNote: 'Another player took your seat after you left',
  roomOver: 'The match ended while you were away',
  teammateUpdate: 'A teammate must update the game before you can play together',
  roomOldBuild: 'Your team is on an older version. You join their next match.',
  playAgainOnline: 'Play again',
  backToParty: 'Back to party',
  coopLeave: 'Leaving early adds a short wait before your next online match. Another player or a bot takes your place.',
  // Casual PvP (docs/plans/moba/V16.md §5)
  modeLabel: 'Online mode',
  modeCoop: 'Co-op vs bots',
  modePvp: 'PvP',
  pvpLocked: 'PvP unlocks after a few more matches',
  // Mode unlocks by account level (MODE-UNLOCKS.md)
  modeLevel: (name: string, level: number, have: number, need: number) =>
    `${name} unlocks at Lv ${level}: finish ${Math.max(1, need - have)} more ${need - have === 1 ? 'match' : 'matches'} (${Math.min(have, need)}/${need})`,
  modeLevelMate: (name: string, level: number) => `${name} needs Lv ${level} for everyone in the party. Play Skirmish together.`,
  findingPvp: 'Finding a PvP match…',
  pvpTeams: (mine: number, theirs: number, bots = 0, per = 3) => `Your team ${mine} of ${per} · Their team ${theirs} of ${per}${bots ? ` · ${bots} ${bots === 1 ? 'bot' : 'bots'}` : ''}`,
  toCoop: 'Starting Co-op vs bots',
  keepWaiting: 'Keep waiting',
  requeued: 'A player declined. You are back at the front of the queue.',
  pvpFound: 'PvP match found',
  // Ranked (gap plan P4; round 4, SOCIAL-RANKED.md §7.11): 3v3, solo or duo, players first, labelled bots when quiet
  findingRanked: 'Finding a Ranked match…',
  rankedBotsAt: (fillInS: number, aiAtS: number) => `Players first. Bots fill empty seats in ${fillInS}s (half points). At ${Math.floor(aiAtS / 60)}:${String(aiAtS % 60).padStart(2, '0')} with no one else searching, your team plays bots (quarter points)`,
  rankedBotsNow: 'Few players now: bots fill empty seats (half points), or your team plays bots (quarter points)',
  rankedSearching: (n: number) => `${n} searching`,
  rankedPrime: 'Prime Time',
  rankedFoundAi: 'Ranked vs bots',
  rankedFilled: 'Bots fill the empty seats (labelled) · half points',
  rankedAiFound: 'Your team against bots · quarter points',
  rankedLong: 'Ranked is quiet right now',
  playCasual: 'Play Casual instead',
  rankedFound: 'Ranked match found',
  rankedClosed: (online: number, need: number) => `Ranked opens at ${need} players online · ${online} online now`,
  rankedAccount: 'Sign in to play Ranked',
  rankedMatches: (have: number, need: number) => `Ranked unlocks after ${need} matches · ${have}/${need}`,
  // gaps5 polish 4: a Ranked duo whose friend has not unlocked Ranked yet
  rankedMate: (have: number, need: number) => `Your duo partner has not unlocked Ranked yet (${have}/${need} matches). Play solo, or play Casual together.`,
  rankedPending: 'Saving your last Ranked match. Search again in a moment.',
  rankedParty: 'Ranked is solo or duo',
  rankedQueue: 'Ranked',
  modeRetired: 'This mode is gone. PLAY starts a 3v3 match.',
  pvpFoundLine: (mine: [number, number], theirs: [number, number], side: string) =>
    `You: ${side} · ${mine[0]} ${mine[0] === 1 ? 'player' : 'players'}${mine[1] ? ` + ${mine[1]} ${mine[1] === 1 ? 'bot' : 'bots'}` : ''} vs ${theirs[0]}${theirs[1] ? ` + ${theirs[1]} ${theirs[1] === 1 ? 'bot' : 'bots'}` : ''}`,
  accept: 'Accept',
  decline: 'Decline',
  accepted: (yes: number, need: number) => `${yes} of ${need} accepted`,
  declinedYou: 'You declined the match',
  timeoutYou: 'You did not accept in time',
  pvpUpdate: 'Update the game to play PvP',
  opponentsHidden: 'You see their picks on the loading screen',
  theirTeam: 'Their team',
  voided: 'Match cancelled. Nobody gained or lost anything.',
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
    case 'seat_taken':
      return COPY.seatTaken;
    case 'room_over':
      return COPY.roomOver;
    case 'party_unreachable':
      return COPY.unreachable;
    case 'match_lost':
      return COPY.matchLost;
    case 'mm_locked':
      return COPY.stoppedLocked(Math.max(1, retryS));
    case 'pvp_update_required':
      return COPY.pvpUpdate;
    default:
      return COPY.generic;
  }
}

/** "Cats", "Dogs" or "Either" for a queue side. */
export const sideText = (side: string): string => (side === 'cat' ? COPY.sideCat : side === 'dog' ? COPY.sideDog : COPY.sideAny);

/** m:ss for a wait or a match clock. */
export const clockText = (s: number): string => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export const DIFF_LABEL: Readonly<Record<string, string>> = Object.freeze({ rookie: 'Guided', easy: 'Easy', normal: 'Normal', hard: 'Hard' });

/** Escape text for innerHTML (every name, code and label goes through it). */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
