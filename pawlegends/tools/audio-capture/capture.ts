/**
 * Hit-sequence capture (audio pass 2): renders a scripted ~9 s hit sequence through the game's own Sfx with an
 * OfflineAudioContext and returns it as a 16-bit stereo WAV, plus how many Web Audio nodes it created. Works against
 * the code before the pass (layered zzfx plays) and after (the hit bank), so the two renders are comparable.
 * Driven by tools/audio-capture.mjs (Vite dev server + headless Chromium). Not part of the game bundle.
 */
import { sfx } from '../../src/audio/sfx';
import { playSkillSfx } from '../../src/audio/skillSfx';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const S = sfx as Any;
const RATE = 44100;
const LEN = 9;

// a seeded Math.random: the same jitter every run
let seed = 12345;
Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function wav(buf: AudioBuffer): string {
  const ch = [buf.getChannelData(0), buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)];
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) out.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
  let s = '';
  const u8 = new Uint8Array(out.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/** What render/effects.ts does for one hit, in either version. */
function hit(o: { hero?: string; kind: 'basic' | 'ability'; skill?: string; nature?: string; target: 'hero' | 'unit' | 'structure'; who: 'mine' | 'me' | 'other'; heavy?: boolean; big?: boolean; at?: { x: number; z: number }; from?: { x: number; z: number } }): void {
  const relation = o.who === 'mine' ? 'mine' : 'enemy';
  if (o.hero) {
    const style = ({ clem: 'claw', brutus: 'bonk', sage: 'shot', bengas: 'bolt' } as Record<string, string>)[o.hero] ?? 'claw';
    if (o.kind === 'basic' && typeof S.swing === 'function') S.swing({ hero: o.hero, style, mine: o.who !== 'other', at: o.from });
    playSkillSfx(o.hero as Any, (o.kind === 'basic' ? 'basic' : o.skill) as Any, 'impact', { at: o.at, relation, src: o.hero.length } as Any);
  }
  if (o.who === 'other' && o.hero) return; // others' hero hits: the identity layer only (as in effects.ts)
  S.impact({ target: o.target, who: o.who, heavy: o.heavy ?? o.kind === 'ability', big: o.big, nature: o.nature, at: o.at });
}

function fish(): void {
  if (typeof S.fishPing === 'function') S.fishPing();
  else S.play('coin', { vol: 0.35, rate: 1.2 });
}

const near = { x: 2, z: 0 };
const far = { x: 12, z: 4 };
const SCRIPT: [number, () => void][] = [];
const at = (t: number, f: () => void): void => void SCRIPT.push([t, f]);
// 1. the player's melee basics on a minion (Clem's claw), three swings
for (let i = 0; i < 3; i++) at(0.2 + i * 0.55, () => hit({ hero: 'clem', kind: 'basic', target: 'unit', who: 'mine', at: near, from: { x: 0, z: 0 } }));
// 2. melee basics on a hero; the third is a crit-sized hit
for (let i = 0; i < 3; i++) at(2.0 + i * 0.5, () => hit({ hero: 'clem', kind: 'basic', target: 'hero', who: 'mine', big: i === 2, heavy: i === 2, at: near, from: { x: 0, z: 0 } }));
// 3. a tank's bonk and a marksman's shots on a hero
at(3.6, () => hit({ hero: 'brutus', kind: 'basic', target: 'hero', who: 'mine', at: near, from: { x: 0, z: 0 } }));
for (let i = 0; i < 2; i++) at(4.1 + i * 0.45, () => hit({ hero: 'sage', kind: 'basic', target: 'hero', who: 'mine', at: { x: 5, z: 0 }, from: { x: 0, z: 0 } }));
// 4. skills: a fire ability and a slam (blunt) landing on a hero
at(5.1, () => hit({ hero: 'bengas', kind: 'ability', skill: 'q', nature: 'fire', target: 'hero', who: 'mine', at: near }));
at(5.6, () => hit({ hero: 'brutus', kind: 'ability', skill: 'w', nature: 'impact', target: 'hero', who: 'mine', at: near }));
// 5. the player hits a tower twice
for (let i = 0; i < 2; i++) at(6.1 + i * 0.4, () => hit({ hero: 'clem', kind: 'basic', target: 'structure', who: 'mine', at: near, from: { x: 0, z: 0 } }));
// 6. the player is hit (the second by a tower: heavy)
at(7.0, () => hit({ kind: 'basic', target: 'hero', who: 'me' }));
at(7.35, () => hit({ kind: 'basic', target: 'hero', who: 'me', heavy: true }));
// 7. a last hit and its Fish
at(7.8, () => { hit({ hero: 'clem', kind: 'basic', target: 'unit', who: 'mine', at: near, from: { x: 0, z: 0 } }); fish(); });
// 8. others' minion fight 12 m away: 10 hits 40 ms apart (the voice caps keep it from stacking)
for (let i = 0; i < 10; i++) at(8.2 + i * 0.04, () => hit({ kind: 'basic', target: 'unit', who: 'other', at: far }));

async function run(): Promise<{ wav: string; nodes: Record<string, number>; sources: number; peak: number; rms: number; plays: number }> {
  const ctx = new OfflineAudioContext(2, RATE * LEN, RATE);
  const nodes: Record<string, number> = {};
  for (const m of ['createBufferSource', 'createGain', 'createStereoPanner', 'createBiquadFilter', 'createOscillator']) {
    const orig = (ctx as Any)[m].bind(ctx);
    (ctx as Any)[m] = (...a: unknown[]) => {
      nodes[m] = (nodes[m] ?? 0) + 1;
      return orig(...a);
    };
  }
  (globalThis as Any).AudioContext = function FakeCtor() {
    return ctx;
  };
  sfx.unlock();
  // wait for the bake (4 ms slices)
  for (let i = 0; i < 2000; i++) {
    const n = (S.buffers as Map<string, unknown>).size;
    await new Promise((r) => setTimeout(r, 10));
    if ((S.buffers as Map<string, unknown>).size === n && n > 50) break;
  }
  sfx.ear = { x: 0, z: 0 };
  const base = { ...nodes };
  for (const [t, f] of SCRIPT) {
    void ctx.suspend(t).then(() => {
      f();
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const sub: Record<string, number> = {};
  for (const k of Object.keys(nodes)) sub[k] = nodes[k] - (base[k] ?? 0);
  let peak = 0;
  let sq = 0;
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    peak = Math.max(peak, Math.abs(d[i]));
    sq += d[i] * d[i];
  }
  return { wav: wav(buf), nodes: sub, sources: sub.createBufferSource ?? 0, peak, rms: Math.sqrt(sq / d.length), plays: SCRIPT.length };
}

(window as Any).__capture = run;
(window as Any).__ready = true;
