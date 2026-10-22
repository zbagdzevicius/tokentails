/**
 * The announcer (iteration 2, audio-ui lane): a big stadium cat that "speaks" in formant meows through a PA chain.
 * Every line is a short syllable score sung by `syllable()` (synth.ts), so it costs one voice in the budget and no
 * files. Lines are rhythmically shaped like the words they stand for ("FI-NAL LAAAP!"); the caption text is what a
 * player with captions on reads (`ANNOUNCE_TEXT`, looked up through `t()` by the HUD).
 *
 * `AnnouncerLogic` is the pure part (unit-tested): which race event earns which line, with cooldowns so the cat never
 * talks over itself. `playLine` is the synth part. The race audio plays lines on its own voice bus (priority 3 in the
 * voice budget) and ducks the music under them.
 */
import { GO_TICK } from '../../core/sim/world';
import type { RaceEvent } from '../../types';
import { syllable, noise, type SynthGraph, type VoiceProfile, type Vowel } from './synth';

export type AnnounceId =
  | 'three'
  | 'two'
  | 'one'
  | 'go'
  | 'finalLap'
  | 'lead'
  | 'ouch'
  | 'record'
  | 'win'
  | 'podium'
  | 'lose'
  | 'pop'
  | 'out'
  | 'wrong'
  | 'timeUp'
  | 'battleWin'
  // iteration 3: set pieces (low priority: never over "Final lap", never after the finish)
  | 'loopDeMeow'
  | 'wallRide'
  | 'bigAir'
  | 'niceLanding'
  | 'tunnelRun'
  // iteration 4 (F4, F5): the photo finish and the final-lap duel
  | 'whisker'
  | 'soClose'
  | 'stolen'
  | 'comeback'
  | 'holdOn';

/** Lines that are only flavour: they take a lower voice priority and give way to everything else. */
export const LOW_LINES: ReadonlySet<AnnounceId> = new Set<AnnounceId>(['loopDeMeow', 'wallRide', 'bigAir', 'niceLanding', 'tunnelRun', 'holdOn']);

/** Lines said after the player's own finish (the finish line may still be playing: they may wait longer for it). */
export const FINISH_LINES: ReadonlySet<AnnounceId> = new Set<AnnounceId>(['whisker', 'soClose', 'stolen']);

/** Caption text per line (English keys for `t()`; registered in src/ui/strings/core.en.ts). */
export const ANNOUNCE_TEXT: Readonly<Record<AnnounceId, string>> = {
  three: 'Three…',
  two: 'Two…',
  one: 'One…',
  go: 'MEOW! Go!',
  finalLap: 'Final lap!',
  lead: 'You take the lead!',
  ouch: 'Ouch!',
  record: 'New record!',
  win: 'You win!',
  podium: 'On the podium!',
  lose: 'Mrrrow… next time.',
  pop: 'Balloon popped!',
  out: "You're out!",
  wrong: 'Wrong way?',
  timeUp: 'Time!',
  battleWin: 'Last cat standing!',
  loopDeMeow: 'LOOP-DE-MEOW!',
  wallRide: 'WALL RIDE!',
  bigAir: 'BIG AIR!',
  niceLanding: 'NICE LANDING!',
  tunnelRun: 'TUNNEL RUN!',
  whisker: 'By a whisker!',
  soClose: 'So close!',
  stolen: 'Stolen at the line!',
  comeback: 'What a comeback!',
  holdOn: 'Hold on!',
};

interface Syl {
  /** start, seconds from the line start */
  at: number;
  v: Vowel;
  to?: Vowel;
  dur: number;
  p: number;
  pe?: number;
  peak: number;
  breath?: number;
}

/** A trill "mrrp": four fast flutters then an open vowel (the countdown). */
function mrrp(at: number, p: number, peak: number): Syl[] {
  const out: Syl[] = [];
  for (let i = 0; i < 3; i++) out.push({ at: at + i * 0.034, v: 'm', dur: 0.032, p: p * (1 + i * 0.05), pe: p * (1.06 + i * 0.05), peak: peak * 0.8 });
  out.push({ at: at + 0.1, v: 'uh', to: 'a', dur: 0.16, p: p * 1.18, pe: p * 1.3, peak });
  return out;
}

/** Line scores. Pitch 1 = the announcer's speaking pitch (a big, low cat). */
const LINES: Readonly<Record<AnnounceId, readonly Syl[]>> = {
  three: mrrp(0, 1, 0.16),
  two: mrrp(0, 1.12, 0.17),
  one: mrrp(0, 1.26, 0.18),
  go: [
    { at: 0, v: 'i', to: 'e', dur: 0.12, p: 1.5, pe: 1.7, peak: 0.2 },
    { at: 0.1, v: 'a', to: 'o', dur: 0.5, p: 1.85, pe: 1.45, peak: 0.24, breath: 0.15 },
  ],
  // "FI - NAL  LAAAP!"
  finalLap: [
    { at: 0, v: 'i', dur: 0.12, p: 1.25, pe: 1.3, peak: 0.19 },
    { at: 0.13, v: 'a', to: 'uh', dur: 0.14, p: 1.2, pe: 1.15, peak: 0.18 },
    { at: 0.32, v: 'a', to: 'o', dur: 0.46, p: 1.45, pe: 1.6, peak: 0.24, breath: 0.1 },
  ],
  // "mrr-RAOW!" rising
  lead: [
    { at: 0, v: 'm', dur: 0.08, p: 1.0, pe: 1.1, peak: 0.14 },
    { at: 0.07, v: 'uh', to: 'a', dur: 0.36, p: 1.2, pe: 1.65, peak: 0.22 },
  ],
  // "MROWCH" short, falling, breathy
  ouch: [
    { at: 0, v: 'a', to: 'u', dur: 0.2, p: 1.5, pe: 1.05, peak: 0.2, breath: 0.35 },
  ],
  // "nya-nya-NYAAA!"
  record: [
    { at: 0, v: 'e', to: 'a', dur: 0.1, p: 1.3, pe: 1.4, peak: 0.16 },
    { at: 0.13, v: 'e', to: 'a', dur: 0.1, p: 1.45, pe: 1.55, peak: 0.17 },
    { at: 0.27, v: 'e', to: 'a', dur: 0.42, p: 1.65, pe: 1.9, peak: 0.23, breath: 0.05 },
  ],
  // "meow-meow-MEEEOW"
  win: [
    { at: 0, v: 'i', to: 'a', dur: 0.14, p: 1.3, pe: 1.45, peak: 0.17 },
    { at: 0.17, v: 'i', to: 'a', dur: 0.14, p: 1.45, pe: 1.6, peak: 0.18 },
    { at: 0.36, v: 'i', to: 'a', dur: 0.2, p: 1.6, pe: 1.95, peak: 0.24 },
    { at: 0.54, v: 'a', to: 'u', dur: 0.36, p: 1.95, pe: 1.5, peak: 0.22 },
  ],
  podium: [
    { at: 0, v: 'e', to: 'a', dur: 0.16, p: 1.3, pe: 1.5, peak: 0.18 },
    { at: 0.18, v: 'a', to: 'o', dur: 0.34, p: 1.5, pe: 1.35, peak: 0.2 },
  ],
  // "mrrrooow…" long and falling
  lose: [
    { at: 0, v: 'm', dur: 0.1, p: 1.05, pe: 1.0, peak: 0.13 },
    { at: 0.09, v: 'u', to: 'o', dur: 0.62, p: 1.0, pe: 0.72, peak: 0.17, breath: 0.15 },
  ],
  // "MYAP!"
  pop: [{ at: 0, v: 'e', to: 'a', dur: 0.14, p: 1.8, pe: 2.0, peak: 0.2 }],
  // "nyooout"
  out: [
    { at: 0, v: 'i', to: 'u', dur: 0.14, p: 1.3, pe: 1.15, peak: 0.18 },
    { at: 0.13, v: 'u', to: 'o', dur: 0.42, p: 1.15, pe: 0.8, peak: 0.19, breath: 0.2 },
  ],
  // "mrr? mrr?" questioning (rising at the end)
  wrong: [
    { at: 0, v: 'm', to: 'uh', dur: 0.16, p: 1.1, pe: 1.35, peak: 0.15 },
    { at: 0.24, v: 'm', to: 'e', dur: 0.2, p: 1.2, pe: 1.6, peak: 0.16 },
  ],
  timeUp: [
    { at: 0, v: 'a', dur: 0.12, p: 1.4, pe: 1.4, peak: 0.2 },
    { at: 0.14, v: 'a', to: 'o', dur: 0.36, p: 1.4, pe: 1.1, peak: 0.2 },
  ],
  battleWin: [
    { at: 0, v: 'm', dur: 0.08, p: 1.2, pe: 1.3, peak: 0.15 },
    { at: 0.08, v: 'a', dur: 0.14, p: 1.45, pe: 1.6, peak: 0.2 },
    { at: 0.26, v: 'i', to: 'a', dur: 0.44, p: 1.7, pe: 2.0, peak: 0.24, breath: 0.08 },
  ],
  // "loo - de - MEEE-OOOW!" (the last syllable swoops up and over, like the loop)
  loopDeMeow: [
    { at: 0, v: 'u', dur: 0.12, p: 1.2, pe: 1.25, peak: 0.18 },
    { at: 0.13, v: 'e', dur: 0.1, p: 1.3, pe: 1.35, peak: 0.17 },
    { at: 0.25, v: 'i', to: 'a', dur: 0.24, p: 1.5, pe: 2.05, peak: 0.24 },
    { at: 0.47, v: 'a', to: 'u', dur: 0.36, p: 2.05, pe: 1.4, peak: 0.22, breath: 0.08 },
  ],
  // "wohl RAAAID!"
  wallRide: [
    { at: 0, v: 'u', to: 'o', dur: 0.14, p: 1.15, pe: 1.2, peak: 0.18 },
    { at: 0.16, v: 'a', to: 'i', dur: 0.4, p: 1.4, pe: 1.7, peak: 0.23, breath: 0.06 },
  ],
  // "big EEEH!"
  bigAir: [
    { at: 0, v: 'i', dur: 0.1, p: 1.35, pe: 1.4, peak: 0.18 },
    { at: 0.12, v: 'e', to: 'a', dur: 0.46, p: 1.6, pe: 1.95, peak: 0.24, breath: 0.05 },
  ],
  // "nais LAN-ding"
  niceLanding: [
    { at: 0, v: 'a', to: 'i', dur: 0.16, p: 1.4, pe: 1.5, peak: 0.19 },
    { at: 0.2, v: 'a', dur: 0.14, p: 1.55, pe: 1.55, peak: 0.21 },
    { at: 0.36, v: 'i', dur: 0.22, p: 1.45, pe: 1.3, peak: 0.19, breath: 0.05 },
  ],
  // "tun-nel RUUUN!"
  tunnelRun: [
    { at: 0, v: 'uh', dur: 0.1, p: 1.2, pe: 1.2, peak: 0.17 },
    { at: 0.12, v: 'o', dur: 0.1, p: 1.15, pe: 1.15, peak: 0.16 },
    { at: 0.25, v: 'uh', to: 'a', dur: 0.4, p: 1.45, pe: 1.7, peak: 0.23, breath: 0.08 },
  ],
  // "by a WHIS-kerrr!" (a quick pickup, then the word leaps up and purrs out)
  whisker: [
    { at: 0, v: 'a', to: 'i', dur: 0.1, p: 1.25, pe: 1.3, peak: 0.16 },
    { at: 0.11, v: 'uh', dur: 0.07, p: 1.3, pe: 1.3, peak: 0.15 },
    { at: 0.2, v: 'i', dur: 0.16, p: 1.75, pe: 1.9, peak: 0.24, breath: 0.12 },
    { at: 0.38, v: 'uh', to: 'u', dur: 0.32, p: 1.6, pe: 1.35, peak: 0.19, breath: 0.06 },
  ],
  // "so CLOOOSE…" (a long fall: the near miss)
  soClose: [
    { at: 0, v: 'o', dur: 0.14, p: 1.3, pe: 1.35, peak: 0.18 },
    { at: 0.17, v: 'o', to: 'u', dur: 0.5, p: 1.45, pe: 1.05, peak: 0.21, breath: 0.12 },
  ],
  // "STO-len at the LIIINE!"
  stolen: [
    { at: 0, v: 'o', dur: 0.12, p: 1.4, pe: 1.45, peak: 0.2, breath: 0.1 },
    { at: 0.13, v: 'e', dur: 0.08, p: 1.35, pe: 1.3, peak: 0.16 },
    { at: 0.23, v: 'a', dur: 0.07, p: 1.3, pe: 1.3, peak: 0.14 },
    { at: 0.32, v: 'a', to: 'i', dur: 0.46, p: 1.7, pe: 2.0, peak: 0.25, breath: 0.06 },
  ],
  // "what a COME-BAAACK!" (climbing all the way)
  comeback: [
    { at: 0, v: 'o', dur: 0.08, p: 1.15, pe: 1.2, peak: 0.15 },
    { at: 0.1, v: 'uh', dur: 0.06, p: 1.2, pe: 1.2, peak: 0.13 },
    { at: 0.18, v: 'uh', dur: 0.12, p: 1.4, pe: 1.5, peak: 0.2 },
    { at: 0.32, v: 'a', to: 'e', dur: 0.44, p: 1.65, pe: 2.05, peak: 0.25, breath: 0.06 },
  ],
  // "HOLD ON!" two tense beats
  holdOn: [
    { at: 0, v: 'o', to: 'u', dur: 0.18, p: 1.35, pe: 1.4, peak: 0.2 },
    { at: 0.24, v: 'o', dur: 0.24, p: 1.5, pe: 1.6, peak: 0.22, breath: 0.08 },
  ],
};

/** Length of a line in seconds (how long the music ducks, how long the voice holds the budget). */
export function lineLength(id: AnnounceId): number {
  let end = 0;
  for (const s of LINES[id]) end = Math.max(end, s.at + s.dur);
  return end;
}

/** Every line, for tests and the QA page. */
export const ANNOUNCE_IDS = Object.keys(LINES) as AnnounceId[];

const ANNOUNCER: VoiceProfile = { f0: 300, fs: 1.45, vibHz: 5.5, vibCents: 18, breath: 0.1 };

/** Sing one line at context time `t` into `g.out` (the voice bus). Returns its end time. */
export function playLine(g: SynthGraph, id: AnnounceId, t: number, vol = 1): number {
  let end = t;
  for (const s of LINES[id]) end = Math.max(end, syllable(g, t + s.at, ANNOUNCER, { vowel: s.v, to: s.to, dur: s.dur, pitch: s.p, pitchEnd: s.pe, peak: s.peak * vol, breath: s.breath }));
  // the PA "click" before the line: a tiny breath on the mic
  noise(g, t - 0.02, { peak: 0.04 * vol, decay: 0.03, filter: { type: 'bandpass', freq: 2500, q: 2 }, seed: 83 });
  return end;
}

/**
 * Which event earns which line (pure; cooldowns in ticks). The race audio asks it for every event and plays what it
 * returns; `record`, `timeUp` and `battleWin` come from outside (the HUD feed knows the best times and the mode).
 */
export class AnnouncerLogic {
  private lastLead = -1e9;
  private lastOuch = -1e9;
  private lastWrong = -1e9;
  private lastAny = -1e9;
  private finished = false;
  // set pieces: the loop and the tunnel are called once a race, the rest with cooldowns, and nothing near "Final lap"
  private finalAt = -1e9;
  private loopSaid = false;
  private tunnelSaid = false;
  private lastWall = -1e9;
  private lastAir = -1e9;
  private lastLand = -1e9;
  // iteration 4: the duel lines (comeback once, "Hold on!" every 6 s) and one finish-drama line
  private comebackSaid = false;
  private lastHold = -1e9;
  private finishDrama = false;

  reset(): void {
    this.lastLead = this.lastOuch = this.lastWrong = this.lastAny = -1e9;
    this.finished = false;
    this.finalAt = this.lastWall = this.lastAir = this.lastLand = -1e9;
    this.loopSaid = this.tunnelSaid = false;
    this.comebackSaid = this.finishDrama = false;
    this.lastHold = -1e9;
  }

  /** A flavour line may not talk over "Final lap!" (3 s), after the finish, or right on top of another line. */
  private quiet(tick: number, gap = 45): boolean {
    return this.finished || tick - this.finalAt < 180 || tick - this.lastAny < gap;
  }

  /** The player entered a tunnel (no sim event: the juice lane reads the tunnel mask). */
  onTunnel(tick: number): AnnounceId | null {
    if (this.tunnelSaid || this.quiet(tick)) return null;
    this.tunnelSaid = true;
    this.lastAny = tick;
    return 'tunnelRun';
  }

  /**
   * A final-lap duel line (iteration 4, F5; the juice lane decides when): "What a comeback!" once a race, "Hold on!"
   * at most every 6 s. Never over "Final lap!", never after the finish, never on top of another line.
   */
  onDuel(id: 'comeback' | 'holdOn', tick: number): AnnounceId | null {
    if (this.quiet(tick, 60)) return null;
    if (id === 'comeback') {
      if (this.comebackSaid) return null;
      this.comebackSaid = true;
    } else {
      if (tick - this.lastHold < 360) return null;
      this.lastHold = tick;
    }
    this.lastAny = tick;
    return id;
  }

  /**
   * One line about how the race was decided, after the player's own finish (F4): "By a whisker!" / "So close!" on a
   * photo finish, "Stolen at the line!" for a place taken in the last second. Once a race, only after the finish.
   */
  onFinishDrama(id: 'whisker' | 'soClose' | 'stolen', tick: number): AnnounceId | null {
    if (!this.finished || this.finishDrama) return null;
    this.finishDrama = true;
    this.lastAny = tick;
    return id;
  }

  onEvent(e: RaceEvent, me: number, mode: string): AnnounceId | null {
    const mine = e.kart === me;
    const a = e.a ?? 0;
    const pick = (id: AnnounceId | null): AnnounceId | null => {
      if (id) this.lastAny = e.tick;
      return id;
    };
    switch (e.type) {
      case 'countdown':
        if (e.kart !== -1 && !mine) return null;
        return pick(a === 3 ? 'three' : a === 2 ? 'two' : a === 1 ? 'one' : null);
      case 'go':
        return e.kart === -1 || mine ? pick('go') : null;
      case 'finalLap':
        if (mine) this.finalAt = e.tick;
        return mine && !this.finished ? pick('finalLap') : null;
      case 'stuntEnter':
        if (!mine || this.quiet(e.tick)) return null;
        if (a === 0 && !this.loopSaid) {
          this.loopSaid = true;
          return pick('loopDeMeow');
        }
        if (a === 1 && e.tick - this.lastWall >= 900) {
          this.lastWall = e.tick;
          return pick('wallRide');
        }
        if (a === 2 && e.tick - this.lastAir >= 300) {
          this.lastAir = e.tick;
          return pick('bigAir');
        }
        return null;
      case 'stuntLand':
        // right after "BIG AIR!" is fine (the flight is the gap between them); still never over the final lap
        if (!mine || this.quiet(e.tick, 0) || e.tick - this.lastLand < 300) return null;
        this.lastLand = e.tick;
        return pick('niceLanding');
      case 'overtake':
        // taking the lead (not in the first 2 s, at most every 6 s)
        if (!mine || a !== 1 || this.finished || e.tick < GO_TICK + 120 || e.tick - this.lastLead < 360) return null;
        this.lastLead = e.tick;
        return pick('lead');
      case 'hit':
        if (!mine || this.finished || e.tick - this.lastOuch < 480 || e.tick - this.lastAny < 60) return null;
        this.lastOuch = e.tick;
        return pick('ouch');
      case 'wrongWay':
        if (!mine || e.tick - this.lastWrong < 600) return null;
        this.lastWrong = e.tick;
        return pick('wrong');
      case 'balloonPop':
        return mine ? pick('pop') : null;
      case 'eliminated':
        return mine ? pick('out') : null;
      case 'finish':
        if (!mine) return null;
        this.finished = true;
        if (mode === 'battle') return pick(a === 1 ? 'battleWin' : 'timeUp');
        return pick(a === 1 ? 'win' : a <= 3 ? 'podium' : 'lose');
      default:
        return null;
    }
  }
}
