/**
 * A device history row as the account's match shape (founder, Nov 19: "I can't see stats of last match"), and what its
 * account save says. No DOM and no CSS: the app and the Profile load it without the history sheet's chunk.
 */
import type { HistoryEntry } from '../../replay/store';
import type { ServerMatch, ServerMode, ServerPlayer, ServerRow } from './historySheet';

/** A device row's mode as the account names it (the account's own labels and filters). Pure. */
export function serverModeOf(r: Pick<HistoryEntry, 'mode'> & { mutator?: string; board?: { mutator?: string } }): ServerMode {
  if (r.mode === 'party' || r.mode === 'coop') return 'coop';
  if (r.mode === 'pvp' || r.mode === 'classic' || r.mode === 'blitz' || r.mode === 'practice') return r.mode;
  const mut = r.board?.mutator ?? r.mutator;
  return mut && mut !== 'none' ? 'arcade' : 'skirmish';
}

/**
 * Founder, Nov 19 ("I can't see stats of last match"): a device row with its kept scoreboard as the account's match
 * shape, so the same detail (both teams, damage, MVP) shows before the account has the row; null on rows saved before
 * the scoreboard was kept. Pure.
 */
export function localMatch(r: HistoryEntry): ServerMatch | null {
  const b = r.board;
  if (!b || !Array.isArray(b.players) || !b.players.length) return null;
  const me = r.slot ?? 0;
  const players: ServerPlayer[] = b.players.map((p) => ({
    slot: p.s,
    team: p.t,
    hero: p.h,
    name: p.n,
    bot: p.bot,
    owner: p.s === me,
    level: p.lv,
    k: p.k,
    d: p.d,
    a: p.a,
    damage: p.hd,
    taken: p.dt,
    tower: p.td,
    heal: p.hs,
    fish: p.f,
    toys: p.ty,
    cs: p.cs,
    grade: p.g,
  }));
  if (!players.some((p) => p.owner)) return null;
  const map = (r.map ?? 'crossing') as ServerRow['map'];
  return {
    id: `local:${r.id}`,
    at: r.at,
    mode: serverModeOf(r),
    map,
    mutator: (b.mutator ?? r.mutator) && (b.mutator ?? r.mutator) !== 'none' ? (b.mutator ?? r.mutator)! : null,
    difficulty: r.difficulty,
    outcome: r.outcome,
    seconds: r.seconds,
    hero: r.hero,
    k: r.k,
    d: r.d,
    a: r.a,
    grade: r.grade,
    mvp: b.mvp === me ? 'mvp' : b.svp === me ? 'svp' : null,
    ...(r.key ? { key: r.key } : {}),
    slot: me,
    winner: b.winner,
    mvpSlot: b.mvp,
    svpSlot: b.svp,
    reason: b.reason,
    players,
  };
}

/** What a device row's save status says ('' when there is nothing to say: saved, or a row from before Nov 19). Pure. */
export function saveLine(save: HistoryEntry['save'], signedIn = true): { text: string; tone: 'busy' | 'bad' | 'off' | '' } {
  if (!save) return { text: '', tone: '' };
  switch (save.st) {
    case 'saving':
      return { text: 'Saving…', tone: 'busy' };
    case 'saved':
      // a party result the backend took without a match (a bot played most of it)
      return save.code === 'PAWLEGENDS_PARTY_AFK' ? { text: 'Not saved: a bot played most of this match', tone: 'off' } : { text: '', tone: '' };
    case 'queued':
      return signedIn ? { text: "Couldn't save yet, retrying", tone: 'busy' } : { text: 'On this device. Sign in to keep it', tone: 'off' };
    case 'failed':
      return { text: "Couldn't save, retrying", tone: 'bad' };
    case 'rejected':
      return save.code === 'PAWLEGENDS_SIM_VERSION' ? { text: 'Not saved: update the game', tone: 'bad' } : { text: "Not saved: the match couldn't be verified", tone: 'bad' };
    case 'off':
      return save.why === 'practice'
        ? { text: 'Practice is not saved', tone: 'off' }
        : save.why === 'device'
          ? { text: 'On this device only', tone: 'off' }
          : { text: 'Not saved: this match was unscored', tone: 'off' };
  }
}

