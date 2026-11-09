/**
 * DEV ONLY: the skill preview lab (`npm run dev` → /skill-preview.html?hero=clem&slot=q&w=480&h=300&tier=med).
 * Mounts the real preview player (src/ui/preview/skillPreview.ts) in a box, with a button per hero and slot and a
 * stats line. window.__preview exposes the player for tools and screenshots. Never part of `build`.
 */
import { HERO_IDS } from '../data/heroes';
import type { HeroId } from '../data/heroes/types';
import type { QualityTier } from '../render/quality';
import { PREVIEW_SLOTS, type PreviewSlot } from '../ui/preview/skillSandbox';

/** capture=1: no rAF; tools drive it with __preview.advance(seconds). */
const q = new URLSearchParams(location.search);
const hero = (HERO_IDS.includes(q.get('hero') as HeroId) ? q.get('hero') : 'clem') as HeroId;
const slot = (PREVIEW_SLOTS.includes(q.get('slot') as PreviewSlot) ? q.get('slot') : 'q') as PreviewSlot;
const tier = (['low', 'med', 'high'].includes(q.get('tier') ?? '') ? q.get('tier') : undefined) as QualityTier | undefined;
const box = document.getElementById('box') as HTMLElement;
box.style.width = `${Number(q.get('w') ?? 480)}px`;
box.style.height = `${Number(q.get('h') ?? 300)}px`;
const bar = document.getElementById('bar') as HTMLElement;
const out = document.getElementById('stats') as HTMLElement;

const { mountSkillPreview } = await import('../ui/preview/skillPreview');
const p = mountSkillPreview(box, hero, slot, { tier, autoplay: q.get('capture') !== '1' });
(window as unknown as { __preview: typeof p }).__preview = p;
for (const h of HERO_IDS)
  for (const s of PREVIEW_SLOTS) {
    const b = document.createElement('button');
    b.textContent = `${h} ${s.toUpperCase()}`;
    b.onclick = () => void p.set(h, s);
    bar.appendChild(b);
  }
setInterval(() => {
  const s = p.stats();
  out.textContent = `${s.hero} ${s.slot} · casts ${s.casts} · loops ${s.loops} · frames ${s.frames} · avg ${s.avgMs.toFixed(2)} ms · max ${s.maxMs.toFixed(1)} ms · first frame ${s.firstFrameMs.toFixed(0)} ms · ${s.tier}`;
}, 500);
