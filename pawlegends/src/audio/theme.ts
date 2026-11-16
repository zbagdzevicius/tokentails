/**
 * Theme soundtrack outside the match (brand v6): the home loop, the champion-select build and the stingers (lock in,
 * victory, defeat), all from the shared motif (themeMotif.js), rendered offline by tools/music/compose.mjs into
 * pawlegends.app/pawlegends-art/music/*.m4a (streamed, outside the game bundle). Nothing loads before the first gesture unlocked the audio; each cue is fetched when first
 * wanted (never on first load) and dropped again when a match starts. In the match the live layers of audio/music.ts
 * play instead (quiet, Wild Rift style).
 *
 * Routed into the music input of the sfx master: mute, the hidden-page suspend and the announcer's ducking apply; the
 * host's music volume times the player's Music slider sets the level. Loops run [pad, pad + cycle] of their file, so
 * they are seamless whatever the decoder's priming. Render side only; never feeds the sim.
 */
import { sfx, type AudioProbe } from './sfx';
import { artRoot } from '../ui/art';
import { LOOP_PAD_S, MENU_LOOPS, THEME_BPM, THEME_REV } from './themeMotif.js';

export type ThemeCue = 'home' | 'select';
export type ThemeSting = 'lock' | 'victory' | 'defeat';

/** Level of each cue in the mix (the files are -16 LUFS; the menus sit under the UI clicks). */
const CUE_GAIN: Record<ThemeCue, number> = { home: 0.42, select: 0.4 };
const STING_GAIN = 0.55;
/** setTargetAtTime constant of a crossfade (~95% in 3τ). */
const FADE_TAU = 0.35;
/** A loop under a sting. */
const UNDER_STING = 0.35;
const RATE = 48000;

/** One cycle of a loop in seconds (a whole number of 48 kHz samples, as rendered). */
export function cycleSeconds(cue: ThemeCue): number {
  return Math.round(((MENU_LOOPS[cue].bars * 4 * 60) / THEME_BPM) * RATE) / RATE;
}

/** The cue for what is on screen: none in a match, the build while a champion select is open, else the home theme. */
export function cueFor(screen: string | undefined, champSelectOpen: boolean): ThemeCue | null {
  if (screen === 'match') return null;
  return champSelectOpen ? 'select' : 'home';
}

/** The e2e audio probe (tests/e2e/audio.spec.ts sets `__plAudioProbe`). */
function probe(name: string, src: AudioBufferSourceNode, gain: number): void {
  const f = (globalThis as unknown as { __plAudioProbe?: AudioProbe }).__plAudioProbe;
  try {
    if (typeof f === 'function') f({ kind: 'music', name, src, gain });
  } catch {
    /* a test hook */
  }
}

/**
 * Where a cue's file lives: pawlegends.app beside the skin art (`pawlegends-art/music/`, outside the game's 10 MB
 * bundle; the native app and other hosts read it from https://pawlegends.app, which allows that with CORS).
 */
export const musicUrl = (name: string): string => `${artRoot()}music/${name}.m4a?v=${THEME_REV}`;

interface Playing {
  cue: ThemeCue;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class ThemeMusic {
  private bus: GainNode | null = null;
  private busCtx: AudioContext | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private want: ThemeCue | null = null;
  private cur: Playing | null = null;
  /** Context time until which a sting plays (a loop waits for it to finish before it enters). */
  private stingUntil = 0;
  /** Loads started (tests). */
  loads = 0;

  /** What should play now (null: nothing, e.g. in a match). Safe to call every tick. */
  setCue(cue: ThemeCue | null): void {
    if (cue === null && this.want !== null) this.drop();
    this.want = cue;
    this.apply();
  }

  /** A one-shot over the loop (the loop dips under it). Loads it first if needed; skipped while muted. */
  sting(name: ThemeSting): void {
    const ac = this.ready();
    if (!ac) return;
    void this.load(name, ac).then((buf) => {
      const bus = this.bus;
      if (!buf || !bus || this.busCtx !== ac || sfx.isMuted) return;
      try {
        const now = ac.currentTime;
        const src = ac.createBufferSource();
        src.buffer = buf;
        const g = ac.createGain();
        g.gain.value = STING_GAIN;
        src.connect(g);
        g.connect(bus);
        src.start(now);
        probe(name, src, STING_GAIN);
        src.onended = () => g.disconnect();
        this.stingUntil = now + buf.duration;
        if (this.cur) {
          const lvl = CUE_GAIN[this.cur.cue];
          this.cur.gain.gain.cancelScheduledValues(now);
          this.cur.gain.gain.setTargetAtTime(lvl * UNDER_STING, now, 0.05);
          this.cur.gain.gain.setTargetAtTime(lvl, now + buf.duration * 0.8, FADE_TAU);
        }
      } catch {
        /* best effort */
      }
    });
  }

  /** Warm the stingers a screen is about to need (small files). */
  prefetch(...names: ThemeSting[]): void {
    const ac = this.ready();
    if (ac) for (const n of names) void this.load(n, ac);
  }

  /** The audio context once unlocked and running, with the theme bus wired and levelled; else null. */
  private ready(): AudioContext | null {
    const ac = sfx.context;
    const out = sfx.musicOutput;
    if (!ac || !out || ac.state !== 'running') return null;
    if (this.busCtx !== ac) {
      this.bus = ac.createGain();
      this.bus.connect(out);
      this.busCtx = ac;
      this.cur = null;
      this.buffers.clear();
    }
    const lvl = sfx.musicLevel;
    if (this.bus && Math.abs(this.bus.gain.value - lvl) > 1e-3) this.bus.gain.setTargetAtTime(lvl, ac.currentTime, 0.05);
    return ac;
  }

  private load(name: string, ac: AudioContext): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      this.loads++;
      p = fetch(musicUrl(name))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((a) => ac.decodeAudioData(a))
        .catch(() => {
          // a failed fetch may be retried by the next want
          this.buffers.delete(name);
          return null;
        });
      this.buffers.set(name, p);
    }
    return p;
  }

  private apply(): void {
    const ac = this.ready();
    if (!ac) return;
    const want = this.want;
    if (this.cur && this.cur.cue !== want) this.fadeOut(this.cur, ac);
    if (!want || this.cur || sfx.isMuted) return;
    // a sting (victory, defeat) finishes before the home theme comes back
    if (ac.currentTime < this.stingUntil - 0.4) return;
    const pending = this.buffers.get(want);
    void this.load(want, ac).then((buf) => {
      if (!buf || this.want !== want || this.cur || this.busCtx !== ac || !this.bus) return;
      try {
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.loopStart = LOOP_PAD_S;
        src.loopEnd = Math.min(buf.duration, LOOP_PAD_S + cycleSeconds(want));
        const g = ac.createGain();
        // starts ~30 dB down (no click) and rises: the loop enters from inside its pad
        g.gain.value = CUE_GAIN[want] * 0.03;
        src.connect(g);
        g.connect(this.bus);
        const now = ac.currentTime;
        src.start(now, LOOP_PAD_S);
        probe(want, src, CUE_GAIN[want]);
        g.gain.setTargetAtTime(CUE_GAIN[want], now, pending ? FADE_TAU : FADE_TAU * 0.6);
        this.cur = { cue: want, src, gain: g };
      } catch {
        /* best effort */
      }
    });
  }

  private fadeOut(p: Playing, ac: AudioContext): void {
    if (this.cur === p) this.cur = null;
    try {
      p.gain.gain.cancelScheduledValues(ac.currentTime);
      p.gain.gain.setTargetAtTime(0, ac.currentTime, FADE_TAU);
      p.src.stop(ac.currentTime + FADE_TAU * 5);
      p.src.onended = () => p.gain.disconnect();
    } catch {
      p.gain.disconnect();
    }
  }

  /** A match starts: fade the loop and free the decoded loops (they are the big ones); stings stay cached. */
  private drop(): void {
    const ac = sfx.context;
    if (this.cur && ac) this.fadeOut(this.cur, ac);
    this.cur = null;
    for (const k of Object.keys(MENU_LOOPS)) this.buffers.delete(k);
  }
}

export const theme = new ThemeMusic();

/**
 * Drive the theme from the page: the cue follows the screen (document data-screen, set by the app) and whether a
 * champion select is open (its LOCK IN button); a tap on LOCK IN plays the lock sting. Ticks twice a second.
 */
export function installTheme(doc: Document = document): () => void {
  const tick = (): void => {
    if (doc.hidden) return;
    const open = !!doc.querySelector('.cs-lock');
    const cue = cueFor(doc.documentElement.dataset.screen, open);
    theme.setCue(cue);
    if (open) theme.prefetch('lock');
    else if (cue === null) theme.prefetch('victory', 'defeat');
  };
  const onClick = (e: Event): void => {
    const b = (e.target as Element | null)?.closest?.('.cs-lock') as HTMLButtonElement | null;
    if (b && !b.disabled && !b.classList.contains('done')) theme.sting('lock');
  };
  doc.addEventListener('click', onClick, true);
  const id = setInterval(tick, 500);
  return () => {
    clearInterval(id);
    doc.removeEventListener('click', onClick, true);
  };
}
