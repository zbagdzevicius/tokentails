/**
 * The results card's "why" line (playtest round 2: "I won the fights and still lost, and nothing says why"). The match
 * session keeps a short log of what hit each core (`CoreLog`); at the end `endCause` names the deciding cause in one
 * sentence from the losing core's last 20 s, the phase and where the player's team stood.
 */
export type CoreSource = 'minions' | 'heroes' | 'towers' | 'decay' | 'takedowns';

/** Damage to one core by source over a sliding window of match ticks. */
export class CoreLog {
  private hits: { tick: number; src: CoreSource; amount: number }[][] = [[], []];
  constructor(private readonly windowTicks = 600) {}

  add(team: number, tick: number, src: CoreSource, amount: number): void {
    if ((team !== 0 && team !== 1) || amount <= 0) return;
    const l = this.hits[team];
    l.push({ tick, src, amount });
    while (l.length && l[0].tick < tick - this.windowTicks) l.shift();
  }

  /** The source that dealt the most to `team`'s core in the window before `tick`, or null. */
  top(team: number, tick: number): CoreSource | null {
    const sum = new Map<CoreSource, number>();
    for (const h of this.hits[team] ?? []) if (h.tick >= tick - this.windowTicks) sum.set(h.src, (sum.get(h.src) ?? 0) + h.amount);
    let best: CoreSource | null = null;
    let most = 0;
    for (const [k, v] of sum) {
      if (v > most) {
        best = k;
        most = v;
      }
    }
    return best;
  }
}

export interface EndCauseInput {
  won: boolean;
  /** GAPS B2: 'forfeit' = the player forfeited. */
  reason: 'core' | 'safetyEnd' | 'forfeit';
  /** The phase the match ended in. */
  phase: 'play' | 'sunset' | 'suddenDeath' | string;
  /** What hit the losing core most in its last 20 s. */
  top: CoreSource | null;
  /** The player's team, own team first. */
  kills: readonly [number, number];
  towers: readonly [number, number];
  /** Heroes of the player's team alive in the enemy half at the end, and alive at all. */
  oursForward: number;
  oursAlive: number;
}

const WHO: Record<CoreSource, [string, string]> = {
  // [their X broke our core, our X broke theirs]
  minions: ['Their minions broke our core', 'Our minions broke their core'],
  heroes: ['Their heroes broke our core', 'We broke their core'],
  towers: ['Their towers wore our core down', 'We wore their core down'],
  decay: ['Sudden Death burned our core down first', 'Sudden Death burned their core down first'],
  takedowns: ['Late knockouts finished our core', 'Late knockouts finished their core'],
};

/** One sentence: what decided the match, from the player's side. */
export function endCause(i: EndCauseInput): string {
  if (i.reason === 'forfeit') return 'You forfeited the match.';
  if (i.reason === 'safetyEnd') return i.won ? 'Time ran out with our core healthier.' : 'Time ran out with their core healthier.';
  const src: CoreSource = i.top ?? (i.phase === 'suddenDeath' ? 'decay' : 'heroes');
  let line = WHO[src][i.won ? 1 : 0];
  if (i.phase === 'suddenDeath' && src !== 'decay') line += ' in Sudden Death';
  else if (i.phase === 'sunset' && src !== 'takedowns') line += ' after Sunset';
  const ahead = i.kills[0] - i.kills[1];
  if (!i.won) {
    if (src === 'minions' && i.oursForward > 0) {
      line += i.oursForward === i.oursAlive && i.oursAlive >= 2 ? ` while all ${i.oursAlive} of us were in their base` : ' while we were pushing theirs';
    }
    line += '.';
    if (src === 'takedowns') line += ' After Sunset every knockout hurts its team’s core.';
    else if (src === 'decay') line += ' In Sudden Death the team with fewer takedowns burns faster.';
    else if (ahead > 0) line += ' Takedowns help, but towers and the core win.';
    else if (src === 'minions') line += ' Clear the waves near your base before you push.';
    return line;
  }
  line += '.';
  if (ahead < 0) line += ' Behind on takedowns, but the core is what counts.';
  else if (i.towers[0] > i.towers[1]) line += ' The towers you took opened the way.';
  return line;
}
