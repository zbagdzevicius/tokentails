/**
 * Painted champion and skin art for the UI (ui/art.ts, founder Nov 13: "we show too much of champs look rendered
 * rather than images in in-game UI"): every hero has a face in the bundle, every skin with art maps to a real skin of
 * the game's library (same id, same hero) and has its three files on pawlegends.app, and the portraits are images,
 * never a WebGL bake.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HERO_IDS } from '../../src/data/heroes';
import { FREE_BISCUIT, FREE_COATS, PAID_COATS } from '../../src/render/cosmetics';
import { SKIN_ART_IDS } from '../../src/ui/art/skinArt.gen';
import { artImgAttrs, artLayers, artRoot, faceFor, faceImgAttrs, faceReady, markArt, resetArtState, skinArtId, splashFor } from '../../src/ui/art';
import { cachedPortraitUrl, portraitUrl, SKU_LOOK } from '../../src/render/portraits';
import { cssPicUrl } from '../../src/ui/cssUrl';

const ROOT = path.resolve(__dirname, '../..');
const SKINS = path.resolve(ROOT, '../pawlegends-web/public/pawlegends-art/skins');
const LEGACY = ['skin.clem.pink_bow', 'skin.clem.dawnblade', ...HERO_IDS.map((h) => `coat.founder.${h}`)];

/** The hero a skin id belongs to, from the game's own skins library. */
function heroOf(id: string): string | null {
  if (PAID_COATS[id]) return PAID_COATS[id].hero;
  if (FREE_COATS[id]) return FREE_COATS[id].hero;
  if (id === FREE_BISCUIT) return 'brutus';
  if (id.startsWith('skin.clem.')) return 'clem';
  if (id.startsWith('coat.founder.')) return id.slice('coat.founder.'.length);
  return null;
}

afterEach(() => resetArtState());

describe('skin art files', () => {
  it('every hero has its face (256 px) in the game bundle', () => {
    const missing = HERO_IDS.filter((h) => !fs.existsSync(path.join(ROOT, 'public/assets/faces', `${h}-256.webp`)));
    expect(missing).toEqual([]);
  });

  it('every skin with art is a real skin of the game (same id, same hero)', () => {
    expect(SKIN_ART_IDS.size).toBeGreaterThan(200);
    const unknown = [...SKIN_ART_IDS].filter((id) => {
      const h = heroOf(id);
      return !h || !(HERO_IDS as readonly string[]).includes(h) || !(id.startsWith(`coat.${h}.`) || LEGACY.includes(id));
    });
    expect(unknown).toEqual([]);
  });

  it('every named store, pass and Treat Track coat has art', () => {
    const named = [...Object.keys(PAID_COATS), ...Object.entries(FREE_COATS).filter(([, f]) => !f.loop).map(([id]) => id), FREE_BISCUIT];
    expect(named.filter((id) => !SKIN_ART_IDS.has(id))).toEqual([]);
  });

  it('every skin with art has its face and its 360 and 720 splash on pawlegends.app', () => {
    const missing = [...SKIN_ART_IDS].flatMap((id) => [256, 360, 720].map((w) => `${id}-${w}.webp`)).filter((f) => !fs.existsSync(path.join(SKINS, f)));
    expect(missing).toEqual([]);
  });
});

describe('art URLs', () => {
  it('faces: the hero face for the default look, the skin face only once it loaded', () => {
    const look = { coat: 'coat.brutus.store_thunderpaw', chroma: null };
    expect(portraitUrl('brutus')).toContain('assets/faces/brutus-256.webp');
    expect(faceReady(look)).toBe(false);
    expect(cachedPortraitUrl('brutus', look)).toBeNull();
    expect(portraitUrl('brutus', look)).toContain('assets/faces/brutus-256.webp');
    markArt('coat.brutus.store_thunderpaw', true);
    expect(cachedPortraitUrl('brutus', look)).toContain('/pawlegends-art/skins/coat.brutus.store_thunderpaw-256.webp');
    expect(faceFor('brutus', look)).toContain('/pawlegends-art/skins/');
  });

  it('a look without art (chroma only, a card skin) keeps the hero face', () => {
    expect(skinArtId({ coat: null })).toBeNull();
    expect(skinArtId({ coat: 'cat.123' })).toBeNull();
    expect(cachedPortraitUrl('clem', { coat: 'cat.123', chroma: null })).toContain('assets/faces/clem-256.webp');
  });

  it('big pictures: the skin splash over the hero splash; a failed skin falls back', () => {
    const look = { coat: 'coat.clem.store_calico' };
    expect(splashFor('clem', look, 360)).toContain('coat.clem.store_calico-360.webp');
    expect(artLayers('clem', look)).toMatch(/^url\('[^']*coat\.clem\.store_calico-720\.webp[^']*'\),url\('[^']*assets\/splash\/clem-720\.webp[^']*'\)$/);
    expect(artLayers('clem', null)).not.toContain(',');
    expect(artImgAttrs('clem', look)).toContain('data-fallback=');
    expect(faceImgAttrs('clem', look)).toContain('data-fallback=');
    markArt('coat.clem.store_calico', false);
    expect(splashFor('clem', look)).toContain('assets/splash/clem-720.webp');
    expect(faceImgAttrs('clem', look)).not.toContain('data-fallback');
  });

  it('the store packs show painted art of their headline look', () => {
    for (const l of Object.values(SKU_LOOK)) expect(skinArtId(l)).not.toBeNull();
  });

  it('skin art comes from pawlegends.app (same origin there, absolute elsewhere and in the app)', () => {
    expect(artRoot('pawlegends.app')).toMatch(/\/pawlegends-art\/$/);
    expect(artRoot('localhost')).toBe('https://pawlegends.app/pawlegends-art/');
    expect(artRoot(null)).toBe('https://pawlegends.app/pawlegends-art/');
  });

  it('inline styles accept painted art URLs and still refuse injection', () => {
    expect(cssPicUrl('https://pawlegends.app/pawlegends-art/skins/coat.clem.lilac-256.webp?v=abc')).toContain('url(');
    expect(cssPicUrl('x);background:red')).toBeNull();
    expect(cssPicUrl('https://a.b/x");color:red')).toBeNull();
  });
});

describe('no runtime renders on menus', () => {
  it('the portrait module no longer touches WebGL', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/render/portraits.ts'), 'utf8');
    expect(src).not.toMatch(/from 'three'|WebGLRenderTarget|readRenderTargetPixels/);
  });

  it('the app bakes no portraits; only Home and the results build the 3D lobby (founder, Nov 13: 3D champion on Home and, with its emote, on the results)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/app/app.ts'), 'utf8');
    expect(src).not.toMatch(/bakePortraits|bakeLooks|bakePortrait\(/);
    expect(src).toContain('new ArtStage(');
    expect(src.match(/new Lobby\(/g)?.length).toBe(1);
    expect(src).toMatch(/private enterHomeLobby\([^)]*\)[\s\S]*?new Lobby\(/);
    expect(src).toContain("this.enterHomeLobby('results')");
  });
});
