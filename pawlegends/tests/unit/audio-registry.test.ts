/**
 * The sound registry (audio fix, Nov 9: "sounds are not played in-game"). Every sound the game can ask for has a
 * real, audible asset: each zzfx def bakes to finite, non-silent PCM; every announcer key a match can say has a
 * listed, well-formed mp3 in public/voice (and in the committed web build); a play reaches the probe with a non-zero
 * gain only when it is audible (muted, held or before the unlock: nothing), so a test can no longer pass while silent.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PCM_RATE, ZZFX_DEFS, zzfxSamples } from '../../src/audio/sfxDefs.js';
import { PL_SFX, Sfx, type AudioProbe } from '../../src/audio/sfx';
import { VOICE_LINES, bountyLine, nameLine, onRollLine, type VoiceKey } from '../../src/audio/voiceLines';
import { HERO_IDS } from '../../src/data/heroes';
import { parseProfile } from '../../src/meta/profile';

const ROOT = join(__dirname, '../..');
const PPK = ['shieldUp', 'shieldChime', 'squeak', 'hyenaLaugh', 'blip'] as const;

/** Every key the announcer can say: the fixed lines plus each hero's three lines. */
function allVoiceKeys(): VoiceKey[] {
  const out: VoiceKey[] = [...VOICE_LINES];
  for (const h of HERO_IDS) out.push(onRollLine(h), bountyLine(h), nameLine(h));
  return out;
}

/** An mp3 starts with an ID3 tag or an MPEG frame sync (11 set bits). */
function isMp3(b: Buffer): boolean {
  if (b.length < 4) return false;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true;
  return b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
}

describe('zzfx sounds', () => {
  const defs: Record<string, number[]> = { ...PL_SFX };
  for (const k of PPK) defs[k] = (ZZFX_DEFS as Record<string, number[]>)[k];

  it.each(Object.keys(defs))('%s bakes to finite, audible, short PCM', (name) => {
    const pcm = zzfxSamples(defs[name], PCM_RATE);
    expect(pcm.length).toBeGreaterThan(PCM_RATE * 0.01);
    expect(pcm.length).toBeLessThan(PCM_RATE * 3);
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) {
      expect(Number.isFinite(pcm[i])).toBe(true);
      peak = Math.max(peak, Math.abs(pcm[i]));
    }
    expect(peak).toBeGreaterThan(0.05);
  });

  it('the hit layers are known and short (a hit never smears into the next)', () => {
    const s = new Sfx();
    for (const n of ['hitCrack', 'hitThump', 'hitHeavy', 'critRing', 'hurtThud', 'heroHit', 'hurt', 'towerShot'] as const) {
      expect(s.knows(n)).toBe(true);
      expect(zzfxSamples(PL_SFX[n], PCM_RATE).length / PCM_RATE).toBeLessThan(0.4);
    }
    // the contact is the shortest layer; the weight is low
    expect(zzfxSamples(PL_SFX.hitCrack, PCM_RATE).length).toBeLessThan(zzfxSamples(PL_SFX.hitThump, PCM_RATE).length);
    expect(PL_SFX.hitThump[2]).toBeLessThan(200);
  });
});

describe('announcer clips', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public/voice/manifest.json'), 'utf8')) as string[];

  it('every key a match can say is listed and has a real mp3', () => {
    for (const k of allVoiceKeys()) {
      expect(manifest, k).toContain(k);
      const f = join(ROOT, 'public/voice', `${k}.mp3`);
      expect(existsSync(f), f).toBe(true);
      const b = readFileSync(f);
      expect(b.length, k).toBeGreaterThan(1500);
      expect(isMp3(b), k).toBe(true);
    }
  });

  it('the voice is fetched under the page base (Vite BASE_URL), so /pawlegends-game/ and the app bundle resolve it', () => {
    const src = readFileSync(join(ROOT, 'src/audio/voice.ts'), 'utf8');
    expect(src).toContain('BASE_URL');
    expect(src).toContain('`${BASE}voice/manifest.json`');
    expect(src).toContain('`${BASE}voice/${key}.mp3`');
    // the client build sets the base; the app bundle builds with the relative base
    expect(readFileSync(join(ROOT, 'package.json'), 'utf8')).toContain('PAWLEGENDS_BASE=/pawlegends-game/');
  });

  it('the committed web build carries the same clips', () => {
    const dir = join(ROOT, '../client/public/pawlegends-game/voice');
    if (!existsSync(dir)) return;
    const built = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as string[];
    for (const k of allVoiceKeys()) {
      expect(built, k).toContain(k);
      expect(statSync(join(dir, `${k}.mp3`)).size, k).toBeGreaterThan(1500);
    }
  });
});

// ------------------------------------------------------------------------------------------------ a fake WebAudio

type Node = { connect: (n: unknown) => void; disconnect: () => void; gain?: { value: number }; pan?: { value: number } };

function fakeAudio(): { Ctor: unknown; started: string[] } {
  const started: string[] = [];
  const node = (extra: object = {}): Node => ({ connect: () => undefined, disconnect: () => undefined, ...extra });
  class FakeCtx {
    state = 'running';
    currentTime = 0;
    sampleRate = PCM_RATE;
    destination = node();
    createGain = (): Node => node({ gain: { value: 1 } });
    createStereoPanner = (): Node => node({ pan: { value: 0 } });
    createBuffer = (_c: number, len: number, rate: number) => {
      const data = new Float32Array(len);
      return { duration: len / rate, length: len, getChannelData: () => data };
    };
    createBufferSource = () => {
      const src = {
        ...node(),
        buffer: null as unknown,
        playbackRate: { value: 1 },
        onended: null as null | (() => void),
        start: () => started.push('start'),
        stop: () => undefined,
      };
      return src;
    };
    resume = (): Promise<void> => Promise.resolve();
    suspend = (): Promise<void> => Promise.resolve();
    addEventListener = (): void => undefined;
  }
  return { Ctor: FakeCtx, started };
}

describe('audible plays only', () => {
  const g = globalThis as unknown as { AudioContext?: unknown; __plAudioProbe?: AudioProbe };
  let heard: { kind: string; name: string; gain: number }[];
  let prev: unknown;
  beforeEach(() => {
    prev = g.AudioContext;
    heard = [];
    g.__plAudioProbe = (o) => heard.push({ kind: o.kind, name: o.name, gain: o.gain });
  });
  afterEach(() => {
    g.AudioContext = prev;
    delete g.__plAudioProbe;
  });

  async function ready(): Promise<Sfx> {
    const { Ctor } = fakeAudio();
    g.AudioContext = Ctor;
    const s = new Sfx();
    s.unlock();
    // the bake runs in 4 ms slices
    for (let i = 0; i < 400 && !s.context; i++) await new Promise((r) => setTimeout(r, 0));
    // 'blip' is baked last: once it plays, every sound is baked
    for (let i = 0; i < 400; i++) {
      s.play('blip');
      if (heard.length) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(heard.length).toBe(1);
    heard.length = 0;
    (s.context as unknown as { currentTime: number }).currentTime = 0.5;
    return s;
  }

  it('a play before the unlock, while muted or inside a hold is not heard; unmuted it is, with a non-zero gain', async () => {
    const pre = new Sfx();
    pre.play('hit');
    expect(heard).toEqual([]);
    const s = await ready();
    s.setMuted(true);
    s.play('victory');
    s.impact({ target: 'hero', who: 'mine', heavy: true, big: true });
    expect(heard).toEqual([]);
    s.setMuted(false);
    const release = s.hold();
    s.play('defeat');
    expect(s.playLayer({ name: 'victory', layer: 'impact', relation: 'self', src: 0 } as never)).toBe(false);
    expect(heard).toEqual([]);
    release();
    release(); // twice is harmless
    expect(s.held).toBe(false);
    s.play('victory');
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ kind: 'sfx', name: 'victory' });
    expect(heard[0].gain).toBeGreaterThan(0);
  });

  it('a hit is layered: the player\'s big hit on a hero is crack, thump, body, punch and ring; the player hurt is a thud and the grunt', async () => {
    const s = await ready();
    s.impact({ target: 'hero', who: 'mine', heavy: true, big: true });
    expect(heard.map((h) => h.name)).toEqual(['hitCrack', 'hitThump', 'heroHit', 'hitHeavy', 'critRing']);
    expect(heard.every((h) => h.gain > 0)).toBe(true);
    heard.length = 0;
    // the same sounds 40 ms apart at most: the clock moves on
    (s.context as unknown as { currentTime: number }).currentTime = 1;
    s.impact({ target: 'hero', who: 'me' });
    expect(heard.map((h) => h.name)).toEqual(['hurtThud', 'hurt']);
    heard.length = 0;
    (s.context as unknown as { currentTime: number }).currentTime = 2;
    s.impact({ target: 'unit', who: 'other' });
    expect(heard.map((h) => h.name)).toEqual(['hitCrack', 'hitThump']);
  });

  it('a muted voice line is not recorded as said (data-voice lists lines that reached the speakers only)', async () => {
    const s = await ready();
    s.setMuted(true);
    s.voice('victory');
    expect(s.voiced).toEqual([]);
  });
});

describe('the game profile mute', () => {
  it('a mute saved before audioV 2 (maybe the host\'s) starts unmuted once; the player\'s own mute stays', () => {
    expect(parseProfile(JSON.stringify({ muted: true })).muted).toBe(false);
    expect(parseProfile(JSON.stringify({ muted: true, audioV: 2 })).muted).toBe(true);
    expect(parseProfile(null).audioV).toBe(2);
  });

  it('a host audio message is applied for the visit only, never saved; the player\'s switch is saved and told to the host', () => {
    const app = readFileSync(join(ROOT, 'src/app/app.ts'), 'utf8');
    const host = app.slice(app.indexOf("m.type === 'audio'"), app.indexOf("m.type === 'audio'") + 400);
    expect(host).toContain('sfx.setMuted(');
    expect(host).not.toContain('this.setMuted(');
    expect(app).toContain("this.bridge.post('sound', { muted: m })");
  });
});
