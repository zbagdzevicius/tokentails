/**
 * The announcer's voice: the priority queue (one line at a time, priority first, stale lines dropped, the result
 * cuts in), the recorded clips and their manifest, the announcer moments that carry a line, and no speech synthesis.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VoiceQueue,
  VOICE_CUT_PRIORITY,
  VOICE_FRESH_CUT_MS,
  VOICE_GAP_MS,
  VOICE_HOLD_MS,
  VOICE_LINES,
  VOICE_QUEUE_MAX,
  VOICE_STALE_MS,
  bountyLine,
  matchVoiceKeys,
  nameLine,
  onRollLine,
  voicePriority,
} from '../../src/audio/voiceLines';
import { Announcer } from '../../src/render/announcer';
import { HERO_IDS } from '../../src/data/heroes';
import type { HeroId } from '../../src/sim/api';

const ROOT = join(__dirname, '../..');
const VOICE_DIR = join(ROOT, 'public/voice');
const manifest = JSON.parse(readFileSync(join(VOICE_DIR, 'manifest.json'), 'utf8')) as string[];

describe('voice queue', () => {
  it('a free voice starts the line at once; while busy, lines wait for the clip to end plus the gap', () => {
    const q = new VoiceQueue();
    expect(q.push('firstBlood', 0)).toEqual({ key: 'firstBlood', cut: false });
    q.length('firstBlood', 0, 1000);
    expect(q.push('double', 200)).toBeNull();
    expect(q.queued).toEqual(['double']);
    expect(q.waitMs(200)).toBe(1000 + VOICE_GAP_MS - 200);
    expect(q.next(1000 + VOICE_GAP_MS - 1)).toBeNull();
    expect(q.next(1000 + VOICE_GAP_MS)).toEqual({ key: 'double', cut: false });
    expect(q.queued).toEqual([]);
  });

  it('until its length is known a started line holds the voice; a missing clip frees it at once', () => {
    const q = new VoiceQueue();
    q.push('ace', 0);
    expect(q.push('turret', 10)).toBeNull();
    expect(q.next(VOICE_HOLD_MS - 1)).toBeNull();
    q.length('ace', 0, 0);
    expect(q.next(20)?.key).toBe('turret');
  });

  it('the highest priority goes first, the newest first within a priority', () => {
    const q = new VoiceQueue();
    q.push('firstBlood', 0);
    q.length('firstBlood', 0, 1000);
    q.push('allySlain', 100); // 2
    q.push('comebackUs', 150); // 1
    q.push('triple', 200); // 4
    expect(q.next(1300)?.key).toBe('triple');
    q.length('triple', 1300, 500);
    expect(q.next(2100)?.key).toBe('allySlain');
    q.length('allySlain', 2100, 100);
    // comebackUs waited 2.3 s: stale for a priority-1 line
    expect(q.next(2500)).toBeNull();
    expect(q.queued).toEqual([]);
  });

  it('a stale line is dropped, by priority: a late "Double pounce!" is noise', () => {
    const q = new VoiceQueue();
    q.push('victory', 0);
    q.length('victory', 0, 3000);
    q.push('double', 10);
    expect(voicePriority('double')).toBe(3);
    expect(q.next(10 + VOICE_STALE_MS[3] + 1 + 3000)).toBeNull();
  });

  it('the result (victory or defeat) cuts whatever plays; a lower line never cuts', () => {
    const q = new VoiceQueue();
    q.push('allySlain', 0);
    q.length('allySlain', 0, 1500);
    expect(q.push('ace', 100)).toBeNull();
    expect(voicePriority('victory')).toBe(VOICE_CUT_PRIORITY);
    expect(q.push('victory', 200)).toEqual({ key: 'victory', cut: true });
    expect(q.current).toBe('victory');
    q.length('victory', 200, 900);
    // victory is not cut by defeat (both 5): it waits
    expect(q.push('defeat', 300)).toBeNull();
  });

  it('the same moment: a higher line arriving right after a lower one started cuts it, and the lower one waits', () => {
    const q = new VoiceQueue();
    expect(q.push('allySlain', 0)).toEqual({ key: 'allySlain', cut: false });
    expect(q.push('firstBlood', VOICE_FRESH_CUT_MS)).toEqual({ key: 'firstBlood', cut: true });
    expect(q.current).toBe('firstBlood');
    expect(q.queued).toEqual(['allySlain']);
    q.length('firstBlood', VOICE_FRESH_CUT_MS, 900);
    expect(q.next(VOICE_FRESH_CUT_MS + 900 + VOICE_GAP_MS)?.key).toBe('allySlain');
    // later than the window a lower line keeps playing
    const r = new VoiceQueue();
    r.push('allySlain', 0);
    expect(r.push('firstBlood', VOICE_FRESH_CUT_MS + 1)).toBeNull();
  });

  it('browsing heroes: a new name cuts the last name off', () => {
    const q = new VoiceQueue();
    q.push(nameLine('clem'), 0);
    q.length(nameLine('clem'), 0, 700);
    expect(q.push(nameLine('sage'), 100)).toEqual({ key: 'name_sage', cut: true });
  });

  it('no repeats and a short queue: the same key is refreshed, the weakest oldest line goes', () => {
    const q = new VoiceQueue();
    q.push('slain', 0);
    q.length('slain', 0, 2000);
    expect(q.push('slain', 50)).toBeNull();
    expect(q.queued).toEqual([]);
    q.push('allySlain', 100);
    q.push('allySlain', 120);
    expect(q.queued).toEqual(['allySlain']);
    q.push('packPower', 130);
    q.push('comebackThem', 140);
    q.push('shutdown', 150);
    expect(q.queued.length).toBe(VOICE_QUEUE_MAX);
    expect(q.queued).not.toContain('packPower');
    expect(q.queued).toContain('shutdown');
  });

  it('clear() forgets the line and the queue', () => {
    const q = new VoiceQueue();
    q.push('ace', 0);
    q.push('double', 10);
    q.clear();
    expect(q.current).toBeNull();
    expect(q.queued).toEqual([]);
    expect(q.push('double', 20)?.key).toBe('double');
  });
});

describe('voice clips', () => {
  const heroes: readonly string[] = [...HERO_IDS, 'rocket', 'frankie', 'domino'];

  it('the manifest lists every fixed line and each hero\'s three lines, each once', () => {
    expect(new Set(manifest).size).toBe(manifest.length);
    for (const k of VOICE_LINES) expect(manifest, k).toContain(k);
    for (const h of heroes) for (const k of [onRollLine(h), bountyLine(h), nameLine(h)]) expect(manifest, k).toContain(k);
  });

  it('every manifest id has a small mp3 file, and every mp3 is listed', () => {
    for (const k of manifest) {
      const f = join(VOICE_DIR, `${k}.mp3`);
      expect(existsSync(f), f).toBe(true);
      const size = statSync(f).size;
      expect(size, k).toBeGreaterThan(1000);
      expect(size, k).toBeLessThan(64 * 1024);
      // an MPEG frame sync or an ID3 tag
      const head = readFileSync(f).subarray(0, 3);
      expect(head.toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), k).toBe(true);
    }
  });

  it('the match preload covers its heroes\' lines and the priority-2+ fixed lines', () => {
    const keys = matchVoiceKeys(['clem', 'sage', 'brutus', 'clem', 'nugget', 'howler']);
    expect(keys).toContain('onRoll_brutus');
    expect(keys).toContain('bounty_howler');
    expect(keys.filter((k) => k === 'onRoll_clem').length).toBe(1);
    expect(keys).toContain('victory');
    expect(keys).not.toContain('takedown');
    for (const k of keys) expect(manifest, k).toContain(k);
  });

  it('no robotic fallback: speech synthesis appears nowhere in the game code', () => {
    for (const f of ['src/audio/voice.ts', 'src/audio/sfx.ts', 'src/audio/voiceLines.ts', 'src/app/matchSession.ts']) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/speechSynthesis|SpeechSynthesisUtterance/);
    }
  });

  it('iOS Safari: audio unlocks on the end of a tap too, resumes any non-running context, and a held line is not said late', () => {
    const app = readFileSync(join(ROOT, 'src/app/app.ts'), 'utf8');
    for (const ev of ['pointerup', 'touchend', 'click']) expect(app).toContain(`'${ev}'`);
    expect(readFileSync(join(ROOT, 'src/audio/sfx.ts'), 'utf8')).toContain("this.ac.state !== 'running'");
    // a suspended context is asked to resume and gets a moment (the line is not dropped at once, nor said late)
    const voice = readFileSync(join(ROOT, 'src/audio/voice.ts'), 'utf8');
    expect(voice).toContain('ctx.resume()');
    expect(voice).toContain('RESUME_WAIT_MS');
  });
});

describe('announcer lines', () => {
  const picks: HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw', 'lambo', 'nugget'];
  const name = (s: number) => picks[s];
  const death = (tick: number, id: number, killer: number) => ({ type: 'death' as const, tick, id, killer });

  it('an enemy streak and an enemy bounty name the hero; the player\'s streak, bounty and a fallen ally have lines', () => {
    const a = new Announcer(0, 0, name, (s) => picks[s]);
    a.feed(death(100, 0, 4));
    a.feed(death(200, 1, 4));
    const s3 = a.feed(death(300, 2, 4));
    expect(s3.find((m) => m.key === 'enemyStreak')?.voice).toBe('onRoll_lambo');
    expect(a.feed({ type: 'bounty', tick: 310, id: 5, value: 60 })[0]?.voice).toBe('bounty_nugget');
    expect(a.feed({ type: 'bounty', tick: 320, id: 0, value: 60 })[0]?.voice).toBe('bountyMe');
    const b = new Announcer(0, 0, name, (s) => picks[s]);
    expect(b.feed(death(100, 1, 3)).find((m) => m.key === 'allySlain')?.voice).toBe('allySlain');
  });

  it('the player\'s streak tiers are said ("On a roll!" at 3)', () => {
    const a = new Announcer(0, 0, name, (s) => picks[s]);
    a.feed(death(100, 3, 0));
    a.feed(death(2000, 4, 0));
    const third = a.feed(death(4000, 5, 0));
    expect(third.find((m) => m.key === 'streak3')?.voice).toBe('streak3');
  });

  it('every voice an announcer moment can carry has a clip', () => {
    const fixed = ['firstBlood', 'double', 'triple', 'catastrophe', 'shutdown', 'ace', 'aceUs', 'slain', 'allySlain', 'cleanSweep', 'bountyMe', 'frenzySpawn', 'frenzyThem', 'packPower', 'comebackUs', 'comebackThem', 'geared', 'streak3', 'streak4', 'streak5', 'streak6'];
    for (const k of fixed) expect(manifest, k).toContain(k);
  });
});
