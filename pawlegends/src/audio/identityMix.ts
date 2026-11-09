/**
 * Champion identity mix (docs/plans/moba/CHAMP-IDENTITY.md §4, `MIX` in data/identity.ts): the bus rules that keep a
 * 10-hero teamfight readable. Per-sound cooldown by layer, voice caps (total, per nature, per hero, travel loops) with
 * stealing of the oldest lower-priority voice, volume caps by layer, relation gain and a soft duck once many voices
 * play. Pure bookkeeping (no AudioContext): audio/sfx.ts asks `admit`, starts the node, then `add`s it. Render only.
 */
import { MIX } from '../render/identity';

export type MixLayer = 'cast' | 'impact' | 'travel' | 'motif' | 'basicVoice' | 'ultVoice';
export type MixRelation = 'mine' | 'enemy' | 'ally' | 'minion';

export const MIX_LAYERS: readonly MixLayer[] = Object.freeze(['cast', 'impact', 'travel', 'motif', 'basicVoice', 'ultVoice'] as MixLayer[]);

/** Same-sound window by layer (ms): MIX.sameSoundMs, the motif layer sharing the cast window. */
export const SAME_SOUND_MS: Readonly<Record<MixLayer, number>> = Object.freeze({ ...MIX.sameSoundMs, motif: MIX.sameSoundMs.cast });

export interface MixRequest {
  /** Baked sound name (the cooldown key together with the layer). */
  name: string;
  layer: MixLayer;
  hero?: string;
  nature?: string;
  /** MIX.priority value (higher wins a steal). */
  priority: number;
  relation: MixRelation;
  /** Wanted level (the sound's loudness, as a zzfx volume) before the layer cap. */
  vol: number;
  /** The zzfx volume baked into the buffer (default 1): the gain is level / baked, so the heard level obeys the cap. */
  baked?: number;
  /** Seconds the sound lasts (its voice slot is held this long). */
  dur: number;
}

export interface MixVoice {
  name: string;
  layer: MixLayer;
  hero?: string;
  nature?: string;
  priority: number;
  start: number;
  end: number;
  stop: (() => void) | null;
}

export interface MixDecision {
  /** Final node gain (capped level × relation × duck ÷ baked volume), before distance falloff and the host volume. */
  gain: number;
  /** Voices to stop before this one starts (already removed from the mixer). */
  steals: MixVoice[];
}

/** Relation gain (minions sit with allies). */
export function relationGain(r: MixRelation): number {
  return r === 'minion' ? MIX.relationGain.ally : MIX.relationGain[r];
}

/** The capped base gain of a layer: never above its MIX.volCap. */
export function cappedVol(layer: MixLayer, vol: number): number {
  return Math.max(0, Math.min(vol, MIX.volCap[layer]));
}

/** The priority of a sound: ults first, then CC aimed at the player, the player's hero, enemies, allies, minions. */
export function mixPriority(o: { relation: MixRelation; ult?: boolean; ccAtMe?: boolean }): number {
  const P = MIX.priority;
  if (o.ult) return o.relation === 'mine' ? P.myUlt : P.ult;
  if (o.ccAtMe) return P.ccAtMe;
  return o.relation === 'mine' ? P.mine : o.relation === 'enemy' ? P.enemy : o.relation === 'ally' ? P.ally : P.minion;
}

export class VoiceMixer {
  readonly voices: MixVoice[] = [];
  private readonly last = new Map<string, number>();
  /** Dropped requests (tests, debugging): cooldown and caps. */
  dropped = 0;

  /** Forget voices that finished by `now` (s). */
  prune(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end <= now) this.voices.splice(i, 1);
  }

  /**
   * May this sound play now? Null when it repeats inside its layer window, or a cap is full of voices of equal or
   * higher priority. Otherwise the gain to play it at and the voices it steals (removed here; the caller stops them).
   */
  admit(req: MixRequest, now: number): MixDecision | null {
    this.prune(now);
    const key = `${req.layer}:${req.name}`;
    const last = this.last.get(key);
    if (last !== undefined && (now - last) * 1000 < SAME_SOUND_MS[req.layer]) {
      this.dropped++;
      return null;
    }
    const steals: MixVoice[] = [];
    const live = (v: MixVoice): boolean => !steals.includes(v);
    const fit = (match: (v: MixVoice) => boolean, cap: number): boolean => {
      const mine = this.voices.filter((v) => live(v) && match(v));
      if (mine.length < cap) return true;
      let victim: MixVoice | null = null;
      for (const v of mine) if (v.priority < req.priority && (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.start < victim.start))) victim = v;
      if (!victim) return false;
      steals.push(victim);
      return true;
    };
    const ok =
      (req.layer !== 'travel' || fit((v) => v.layer === 'travel', MIX.travelMax)) &&
      (!req.hero || fit((v) => v.hero === req.hero, MIX.maxPerHero)) &&
      (!req.nature || fit((v) => v.nature === req.nature, MIX.maxPerNature)) &&
      fit(() => true, MIX.maxVoices);
    if (!ok) {
      this.dropped++;
      return null;
    }
    for (const s of steals) this.voices.splice(this.voices.indexOf(s), 1);
    this.last.set(key, now);
    const busy = this.voices.length >= MIX.duckAt;
    const gain = (cappedVol(req.layer, req.vol) * relationGain(req.relation) * (busy ? MIX.duckGain : 1)) / Math.max(0.05, req.baked ?? 1);
    return { gain, steals };
  }

  /** Track a started voice (after `admit` said yes). */
  add(req: MixRequest, now: number, stop: (() => void) | null): MixVoice {
    const v: MixVoice = { name: req.name, layer: req.layer, hero: req.hero, nature: req.nature, priority: req.priority, start: now, end: now + Math.max(0.01, req.dur), stop };
    this.voices.push(v);
    return v;
  }

  clear(): void {
    this.voices.length = 0;
    this.last.clear();
  }
}
