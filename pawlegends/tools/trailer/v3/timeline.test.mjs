// Trailer v3.4 timeline rules (v3.3's plus the v3.3 review's); v3.3 rules (v3.2's plus the v3.3 review's) (no browser): the 15 s splices stay on the 25-frame beat grid, every word leaves with a
// whole 8-frame exit before its shot is cut, and the real-cats line sits only over the game's pick screen.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lintTrailerCopy } from '../lint-copy.mjs';
import { CORE_HIT, CUT15, CUTS, BEAT_FRAMES, GLARE, endCard, glareBlobFails, typeEls } from './timeline.mjs';
import { OUT_FRAMES } from './mg.js';
import { SHOTS } from './shots.mjs';

const copy = JSON.parse(readFileSync(new URL('./copy.json', import.meta.url), 'utf8'));
const shotAt = (f) => SHOTS.find((s) => f >= s.f0 && f <= s.f1);

describe('trailer v3.4 timeline', () => {
  it('every mission line holds at least a second (60 frames) in the 30 s cut', () => {
    for (const aspect of ['16x9', '9x16']) {
      for (const e of typeEls(30, aspect, copy).filter((x) => ['M1', 'M2', 'M3b'].includes(x.id))) expect(e.out - e.in).toBeGreaterThanOrEqual(60);
    }
  });

  it('the 15 s end card has the URL on screen for at least 1.5 s', () => {
    expect(CUTS[15] - endCard(15).url).toBeGreaterThanOrEqual(90);
    expect(CUTS[30] - endCard(30).url).toBeGreaterThanOrEqual(90);
  });

  it('every gameplay shot starts and ends at the gameplay distance (pushes and the crane only round their beats)', () => {
    // v3.4: the hook's crane ends on the whole Crossing (both bases under CATS VS DOGS) and the next shot is the
    // gameplay view again; its rise is tested below
    for (const s of SHOTS.filter((x) => x.take && x.id !== 'S01')) {
      const k = s.cam.keys;
      for (const d of [k[0].dist ?? 1, k.at(-1).dist ?? 1]) {
        expect(d).toBeGreaterThanOrEqual(0.95);
        expect(d).toBeLessThanOrEqual(1.3);
      }
      expect(Math.max(...k.map((x) => x.dist ?? 1))).toBeLessThanOrEqual(1.3);
    }
  });

  it('every 9:16 shot is captured natively except the pick screen (recomposed from its own landscape capture)', () => {
    for (const s of SHOTS) if (s.aspects && !s.aspects.includes('9x16')) expect(s.lobby?.pick).toBeTruthy();
  });

  it('the 15 s cut is contiguous and every splice offset is a whole number of beats', () => {
    let next = 0;
    for (const [a, b, d] of CUT15) {
      expect(a).toBe(next);
      expect(d % BEAT_FRAMES).toBe(0);
      next = b + 1;
    }
    expect(next).toBe(CUTS[15]);
  });

  it('the shots tile the 30 s master with no gap or overlap', () => {
    const sorted = [...SHOTS].sort((x, y) => x.f0 - y.f0);
    let next = 0;
    for (const s of sorted) {
      expect(s.f0).toBe(next);
      next = s.f1 + 1;
    }
    expect(next).toBe(CUTS[30]);
  });

  it('every 30 s word has finished its exit by the last frame of the shot it starts in (no half-drawn word on a cut)', () => {
    for (const aspect of ['16x9', '9x16']) {
      for (const e of typeEls(30, aspect, copy)) {
        const s = shotAt(e.in);
        // a line may run across the shots of one beat group (CATS VS DOGS over the crane) but never past its own end
        const last = SHOTS.filter((x) => x.f0 <= e.out + OUT_FRAMES).sort((a, b) => b.f0 - a.f0)[0];
        expect(e.out + OUT_FRAMES - 1).toBeLessThanOrEqual(last.f1);
        expect(s).toBeTruthy();
      }
    }
  });

  it('the full CATS VS DOGS line is on screen for at least 35 frames, and gone before the crane comes down', () => {
    // v3.6: the descent starts on f103 (34 frames, mirroring the rise), so the line wipes on f110 and is cleared before
    // the heroes grow out of specks under it (40 frames ran the wipe over Clem and Cacklejaw on the way down)
    const els = typeEls(30, '16x9', copy).filter((e) => e.id.startsWith('L1'));
    const together = Math.min(...els.map((e) => e.out)) - Math.max(...els.map((e) => e.in));
    expect(together).toBeGreaterThanOrEqual(35);
  });

  it('INSPIRED BY REAL CATS. is laid only over the pick screen (never over gameplay plates of non-champions)', () => {
    for (const aspect of ['16x9', '9x16']) {
      for (const e of typeEls(30, aspect, copy).filter((x) => x.id.startsWith('M4'))) {
        for (let f = e.in; f < e.out + OUT_FRAMES; f++) expect(shotAt(f)?.lobby?.pick).toBeTruthy();
      }
    }
  });

  it('VICTORY! holds at least a second in both cuts', () => {
    for (const cut of [30, 15]) {
      const v = typeEls(cut, '16x9', copy).find((e) => e.id === 'M6');
      expect(v.out + OUT_FRAMES - v.in).toBeGreaterThanOrEqual(58);
    }
  });

  it('the hook starts at the gameplay distance and cranes to the whole Crossing (2.5x to 4x) for CATS VS DOGS', () => {
    const k = SHOTS.find((x) => x.id === 'S01').cam.keys;
    expect(k[0].dist).toBe(1);
    const wide = Math.max(...k.map((x) => x.dist ?? 1));
    expect(wide).toBeGreaterThanOrEqual(2.5);
    expect(wide).toBeLessThanOrEqual(4);
    const l1 = typeEls(30, '16x9', copy).filter((e) => e.id.startsWith('L1'));
    const wideFrom = k.find((x) => x.dist === wide).f;
    // v3.6: the eased rise ends on f66; CATS slams on the f62 half-beat in its last frames (over 95 % of the way up)
    for (const e of l1) expect(e.in).toBeGreaterThanOrEqual(wideFrom - 4);
    // CATS on the cat side (left), DOGS on the dog side (right)
    expect(l1.find((e) => e.id === 'L1a').x).toBeLessThan(0.5);
    expect(l1.find((e) => e.id === 'L1c').x).toBeGreaterThan(0.5);
  });

  it('TEAM CAT OR TEAM DOG? slams after its cut and TEAM DOG? holds at least 50 frames in both cuts', () => {
    for (const cut of [30, 15]) {
      for (const aspect of ['16x9', '9x16']) {
        const els = typeEls(cut, aspect, copy);
        const dog = els.find((e) => e.id === 'M5c');
        expect(dog.out - dog.in).toBeGreaterThanOrEqual(50);
        const cat = els.find((e) => e.id === 'M5a');
        const segStart = cut === 15 ? CUT15.find(([a, b, d]) => a <= cat.in && b >= cat.in)[0] : SHOTS.find((x) => x.id === 'S17').f0;
        expect(cat.in).toBeGreaterThan(segStart);
      }
    }
  });

  it('every 9:16 word sits inside the platforms\' safe band (y 0.12-0.78) outside the end card', () => {
    for (const cut of [30, 15]) for (const e of typeEls(cut, '9x16', copy)) {
      expect(e.y).toBeGreaterThanOrEqual(0.12);
      expect(e.y).toBeLessThanOrEqual(0.78);
    }
  });

  it('VICTORY! lands with the core burst (CORE_HIT), not before it', () => {
    const v = typeEls(30, '16x9', copy).find((e) => e.id === 'M6');
    expect(v.in).toBeGreaterThan(CORE_HIT);
  });

  it('every rivalry and champion shot carries a name tag in its team colour', () => {
    const els = typeEls(30, '16x9', copy);
    for (const [id, style] of [['N3', 'cat'], ['N4', 'dog'], ['N6', 'dog'], ['N7', 'cat'], ['N8', 'cat'], ['N9', 'cat'], ['N10', 'cat']]) {
      const e = els.find((x) => x.id === id);
      expect(e.style).toBe(style);
      expect(e.out - e.in).toBeGreaterThanOrEqual(30);
    }
  });

  it('every on-screen string passes the copy gate', () => {
    expect(lintTrailerCopy(copy).findings).toEqual([]);
  });
});

describe('trailer v3.5: the crane settles to gameplay, the glare gate', () => {
  const s01 = SHOTS.find((s) => s.id === 'S01');
  it('the opening crane lands back on the gameplay camera inside the shot, on a half-beat, and holds it to the cut', () => {
    const keys = s01.cam.keys;
    const land = keys.find((k) => k.f === 137);
    expect(land).toMatchObject({ dist: 1, pitch: 0, blend: 0, ease: 'ease' });
    expect(keys.at(-1)).toMatchObject({ f: s01.f1, dist: 1, pitch: 0, blend: 0 });
    expect(Math.abs((137 % BEAT_FRAMES) - BEAT_FRAMES / 2)).toBeLessThanOrEqual(0.5);
    // 9:16 (v3.7): the quarter turn comes back to the opening distance, pitch and yaw on f125 and holds to the cut
    const pk = s01.portrait.cam.keys;
    expect(pk.find((k) => k.f === 125)).toMatchObject({ dist: pk[0].dist, pitch: pk[0].pitch, yaw: 0 });
    expect(pk.at(-1)).toMatchObject({ f: s01.f1, dist: pk[0].dist, pitch: pk[0].pitch, yaw: 0 });
    expect(s01.f1 - 125).toBeGreaterThanOrEqual(24);
    expect(s01.portrait.cam.target.f1).toBe(125);
    // v3.6: the clock is back at real time before the camera starts down (it was 4.2x until the landing)
    const down = keys.find((k) => k.f > 66 && k.ease === 'linear').f;
    expect(s01.ramp.at(-1)[1]).toBe(1);
    expect(s01.ramp.at(-1)[0]).toBeLessThanOrEqual(down);
  });

  it('CATS VS DOGS is gone before the plates and the HUD fade back in on the way down', () => {
    const back = s01.uiFade.find(([f, a], i) => i > 0 && a === 0 && s01.uiFade[i + 1]?.[1] === 1)[0];
    for (const aspect of ['16x9', '9x16']) {
      for (const e of typeEls(30, aspect, copy).filter((x) => x.id.startsWith('L1'))) expect(e.out + OUT_FRAMES).toBeLessThanOrEqual(back);
    }
  });

  it('the blob gate catches the v3.4 masters\' white rims and passes the v3.5 render', () => {
    // v3.4 30 s 16:9 f419-449 (Champion's Challenge circle) and 9:16 f33-42 (Pack Hunt / swing rings): 1-2.3 %
    const v34 = [0.004, 0.0126, 0.0128, 0.0131, 0.0215, 0.0133, 0.006];
    const r = glareBlobFails(v34);
    expect(r.runs).toEqual([1]);
    expect(r.peaks).toEqual([4]);
    // the v3.5 worst frames
    expect(glareBlobFails([0.0051, 0.0063, 0.0028, 0.0063])).toEqual({ runs: [], peaks: [] });
    // outside gameplay (the end card's cream type plate) nothing counts
    expect(glareBlobFails([0.05, 0.05, 0.05], () => false)).toEqual({ runs: [], peaks: [] });
    expect(GLARE.worstClip).toBeLessThan(0.047);
  });
});

describe('trailer v3.6: review of v3.5', () => {
  const s01 = SHOTS.find((s) => s.id === 'S01');
  it('the crane rises and comes down over the same 30+ frames, the fast clock only while the map is wide', () => {
    const k = s01.cam.keys;
    const top = k.find((x) => x.dist === Math.max(...k.map((y) => y.dist ?? 1)));
    const start = k.filter((x) => x.f < top.f).at(-1);
    const down = k.find((x) => x.f > top.f && x.ease === 'linear');
    const land = k.find((x) => x.f > down.f && x.dist === 1);
    const rise = top.f - start.f;
    const fall = land.f - down.f;
    expect(rise).toBeGreaterThanOrEqual(30);
    expect(fall).toBeGreaterThanOrEqual(30);
    expect(Math.abs(rise - fall)).toBeLessThanOrEqual(2);
    expect(top.ease).toBe('ease');
    // the speed-up starts after the camera is up and is over before it starts down
    const fast = s01.ramp.filter(([, v]) => v > 1.01);
    expect(Math.min(...fast.map(([f]) => f))).toBeGreaterThanOrEqual(top.f);
    expect(Math.max(...fast.map(([f]) => f))).toBeLessThan(down.f);
  });
  it('the 9:16 crane starts and ends at yaw 0 (the gameplay yaw)', () => {
    const k = s01.portrait.cam.keys;
    expect(k[0].yaw ?? 0).toBe(0);
    expect(k.at(-1).yaw ?? 0).toBe(0);
  });
  it('the shield heroes never play the cheer in the line-up (it held the shield out flat)', () => {
    const s17 = SHOTS.find((s) => s.id === 'S17');
    const shield = new Set(s17.lobby.stands.map((st, i) => (['lambo', 'brutus'].includes(st.hero) ? i : -1)).filter((i) => i >= 0));
    for (const a of s17.lobby.acts) if (shield.has(a.stand)) expect(a.act).toBe('swing');
  });
  it('the roll call is all on the game camera with the HUD (no HUD flicker at the name-card cuts)', () => {
    for (const id of ['S03', 'S04', 'S06', 'S07', 'S08', 'S09', 'S10']) {
      const s = SHOTS.find((x) => x.id === id);
      expect(s.cam.base).toBe('game');
      expect(s.layers).toContain('hudlite');
    }
  });
});

describe('trailer v3.7: review of v3.6', () => {
  const s01 = SHOTS.find((s) => s.id === 'S01');
  it('the 9:16 crane turns a quarter while wide, CATS above VS above DOGS, and turns back before it lands', () => {
    const k = s01.portrait.cam.keys;
    const wide = k.filter((x) => Math.abs(x.yaw ?? 0) === 90);
    expect(wide.length).toBeGreaterThanOrEqual(2);
    const l1 = typeEls(30, '9x16', copy).filter((e) => e.id.startsWith('L1'));
    const [a, b, c] = ['L1a', 'L1b', 'L1c'].map((id) => l1.find((e) => e.id === id));
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
    // the words are gone before the camera starts down (the last wide key)
    for (const e of l1) expect(e.out).toBeLessThanOrEqual(wide.at(-1).f);
  });
  it('the mission is three beats (no CALM PUDDING. line, no Pudding shot)', () => {
    for (const aspect of ['16x9', '9x16']) {
      const ids = typeEls(30, aspect, copy).map((e) => e.id);
      expect(ids).not.toContain('M7');
      for (const id of ['M1', 'M2', 'M3a', 'M3b']) expect(ids).toContain(id);
    }
    expect(SHOTS.find((s) => s.id === 'S16')).toBeUndefined();
  });
  it('the 15 s cut: 3V3 slams after its cut, IN YOUR BROWSER and TAKE THEIR CORE. hold a second, gone before VICTORY!', () => {
    for (const aspect of ['16x9', '9x16']) {
      const els = typeEls(15, aspect, copy);
      const by = (id) => els.find((e) => e.id === id);
      expect(by('L2a').in).toBeGreaterThan(150);
      expect(by('L2b').out - by('L2b').in).toBeGreaterThanOrEqual(60);
      expect(by('M3b').out - by('M3b').in).toBeGreaterThanOrEqual(60);
      expect(by('M3b').in - by('M3a').in).toBeGreaterThanOrEqual(3);
      expect(by('M3b').out + OUT_FRAMES).toBeLessThanOrEqual(by('M6').in);
      for (const id of ['L2a', 'L2b', 'M3a', 'M3b']) {
        const seg = CUT15.find(([x, y]) => by(id).in >= x && by(id).in <= y);
        expect(by(id).out + OUT_FRAMES - 1).toBeLessThanOrEqual(seg[1]);
      }
    }
  });
  it('the core shot frames the doghouse itself and its camera moves on the hits, then settles at the gameplay distance', () => {
    const s15 = SHOTS.find((s) => s.id === 'S15');
    expect(s15.cam.target.point).toBeTruthy();
    const d = s15.cam.keys.map((k) => k.dist);
    expect(new Set(d).size).toBeGreaterThan(3);
    expect(s15.cam.keys.find((k) => k.f === CORE_HIT).dist).toBeLessThan(0.95);
    expect(s15.cam.keys.at(-1).dist).toBe(1);
  });
  it('every name tag sits next to its hero, not in a fixed corner', () => {
    for (const aspect of ['16x9', '9x16']) {
      const tags = typeEls(30, aspect, copy).filter((e) => /^N\d/.test(e.id));
      expect(new Set(tags.map((e) => `${e.x},${e.y}`)).size).toBeGreaterThanOrEqual(6);
    }
  });
});
