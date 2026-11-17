// @vitest-environment happy-dom
/**
 * FLAGS.md in the match: every player's and bot's country flag beside its name on the overhead plate (canvas stamp),
 * on the HUD portrait strip and in the kill feed. A seat with no known country shows no flag (no paw placeholder);
 * bots keep their robot glyph and Bot label.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ccHtmlOrNone, flagEmoji } from '../../src/social/flags';
import { Hud } from '../../src/ui/hud';
import { Overhead } from '../../src/ui/overhead';
import type { ViewFrame } from '../../src/render/interp';

/** A 2D context stand-in that records every fillText (any other call is a no-op). */
function recorder(): { g: CanvasRenderingContext2D; texts: { text: string; font: string; x: number }[] } {
  const texts: { text: string; font: string; x: number }[] = [];
  const state: Record<string | symbol, unknown> = { font: '10px sans-serif' };
  const g = new Proxy(state, {
    get(t, k) {
      if (k === 'fillText') return (text: string, x: number) => texts.push({ text, font: String(t.font), x });
      if (k === 'measureText') return (text: string) => ({ width: [...text].length * 6 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { g, texts };
}

class TestOverhead extends Overhead {
  use(g: CanvasRenderingContext2D): void {
    this.g = g;
  }
}

describe('flags in the match (FLAGS.md)', () => {
  it('an in-match chip is the flag, or nothing at all for a hidden or unknown country', () => {
    expect(ccHtmlOrNone('LT')).toContain('data-cc="LT"');
    for (const none of [null, undefined, '', 'XX', 'lt']) expect(ccHtmlOrNone(none)).toBe('');
  });

  it('the portrait strip wears each seat\'s flag; a seat without one gets none, bots keep the robot badge', () => {
    document.body.innerHTML = '';
    const hud = new Hud(document.body, 'sage', 'hiss', { onSlot: () => {} });
    hud.mountStrip(['sage', 'clem', 'brutus', 'cacklejaw', 'lambo', 'gabe'], 0, 0, ['You', 'Ana', 'Bo', 'Cy', 'Di', 'Ed'], new Set([2, 3, 4, 5]), ['LT', 'DE', 'FR', null, 'JP', 'BR']);
    const cc = (slot: number): string | null => document.querySelector(`.pp[data-slot="${slot}"] .pl-cc`)?.getAttribute('data-cc') ?? null;
    expect(cc(1)).toBe('DE');
    expect(cc(2)).toBe('FR');
    expect(cc(3)).toBeNull();
    expect(document.querySelector('.pp[data-slot="3"] .pl-cc')).toBeNull();
    expect(cc(4)).toBe('JP');
    expect(document.querySelector<HTMLElement>('.pp[data-slot="2"]')!.dataset.ai).toBe('1');
    expect(document.querySelector('.pp[data-slot="2"]')!.getAttribute('aria-label')).toContain('(Bot)');
    hud.dispose();
  });

  it('a kill-feed hero name carries its flag first', () => {
    document.body.innerHTML = '';
    const hud = new Hud(document.body, 'sage', 'hiss', { onSlot: () => {} });
    const row = hud.kill({ name: 'Ana', rel: 'ally', hero: 'clem', cc: 'DE' }, { name: 'Bo', rel: 'enemy', hero: 'brutus', cc: null }, true);
    const [k, v] = row.querySelectorAll('b');
    expect(k.querySelector('.pl-cc')?.getAttribute('data-cc')).toBe('DE');
    expect(k.textContent).toContain('Ana');
    expect(v.querySelector('.pl-cc')).toBeNull();
    expect(v.textContent).toBe('Bo');
    hud.dispose();
  });

  it('the overhead name pill draws the flag left of the name, and none for a seat without a country', () => {
    const base = { team: 0, hp: 600, maxHp: 1000, shield: 0, buffs: 0, yaw: 0, speed: 0, state: 'idle', level: 4 };
    const ents = [
      { ...base, id: 0, kind: 'hero', hero: 'clem', fx: 90000, fy: 30000 },
      { ...base, id: 1, kind: 'hero', hero: 'lambo', fx: 90500, fy: 30200 },
      { ...base, id: 3, kind: 'hero', hero: 'duchess', team: 1, fx: 91000, fy: 30500 },
      { ...base, id: 4, kind: 'hero', hero: 'brutus', team: 1, fx: 91400, fy: 30400 },
    ];
    const frame = { entities: ents, projectiles: [], zones: [], byId: new Map(ents.map((e) => [e.id, e])), tick: 0 } as unknown as ViewFrame;
    const cam = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 500);
    cam.position.set(90, 25, -10);
    cam.lookAt(90, 0, -30);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const o = new TestOverhead(document.createElement('div'));
    const { g, texts } = recorder();
    o.use(g);
    o.mySlot = 0;
    o.myTeam = 0;
    o.names = ['You', 'Ana', 'Bo', 'Cy', 'Di', 'Ed'];
    o.bots = new Set([3, 4]);
    o.flags = ['LT', 'DE', null, 'FR', null, null];
    o.draw(frame, cam, () => 1);
    const flags = texts.filter((t) => /[\u{1F1E6}-\u{1F1FF}]/u.test(t.text)).map((t) => t.text);
    expect(flags).toContain(flagEmoji('DE'));
    expect(flags).toContain(flagEmoji('FR'));
    // the bot with no country (slot 4) and the hidden seat get no flag; the robot glyph is not text, the name still is
    expect(flags.length).toBe(flags.includes(flagEmoji('LT')) ? 3 : 2);
    const ana = texts.find((t) => t.text === 'Ana')!;
    const de = texts.find((t) => t.text === flagEmoji('DE'))!;
    expect(de.x).toBeLessThan(ana.x);
    expect(texts.some((t) => t.text === 'Di')).toBe(true);
  });
});
