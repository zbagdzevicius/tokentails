// The cat roster. Owned by the CATS lane. Stats per GDD.md "Cat roster"; tabby = the POC exactly.
import { shake, dust } from '../core/fx';
import { C, game } from '../core/state';
import type { CatDef } from '../core/types';
import { startlePeople } from '../world/people';
import { bellyFlop } from './abilities/belly-flop';
import { laser } from './abilities/laser';
import { shadowDash } from './abilities/shadow-dash';
import { sonicYowl } from './abilities/yowl';
import { Cat, LOOKS } from './model';
import { chirp } from './sfx';
import { ROSTER } from './roster';

/** Name, blurb, voice, colour, cost and base stats from the pure roster table. */
const info = (id: keyof typeof ROSTER) => {
  const r = ROSTER[id];
  return { id: r.id, name: r.name, blurb: r.blurb, ultraName: r.ultraName, voice: r.voice, color: r.color, cost: r.cost, base: r.base };
};

export const tabby: CatDef = {
  ...info('tabby'),
  build: () => new Cat(LOOKS.tabby),
  ultra: laser,
};

export const chonk: CatDef = {
  ...info('chonk'),
  build: () => new Cat(LOOKS.chonk),
  ultra: bellyFlop,
  hooks: {
    // passive: the ground shakes under every swat and the whole block jumps
    onSwat() {
      shake(0.12);
      startlePeople(C.pos.x, C.pos.z, 55, 14, 8);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        dust.spawn(C.pos.x + Math.cos(a) * 16, 1.5, C.pos.z + Math.sin(a) * 16, Math.cos(a) * 40, 2, Math.sin(a) * 40, 0.6, 3, 0xd9ccb4, 0, 1.2);
      }
    },
  },
};

export const shadow: CatDef = {
  ...info('shadow'),
  build: () => new Cat(LOOKS.shadow),
  ultra: shadowDash,
  hooks: {
    // passive: every swat is a tiny lunge forward
    onSwat() {
      if (C.air || C.stun > 0) return;
      C.pos.addScaledVector(C.fwd, 6);
      for (let i = 0; i < 3; i++) dust.spawn(C.pos.x - C.fwd.x * 10, 8 + Math.random() * 20, C.pos.z - C.fwd.z * 10, -C.fwd.x * 20, 2, -C.fwd.z * 20, 0.4, 2.5, 0x2a1a4a, 0, 1.2);
    },
  },
};

export const siamese: CatDef = {
  ...info('siamese'),
  build: () => new Cat(LOOKS.siamese),
  ultra: sonicYowl,
  hooks: {
    // passive: her swats come with commentary, and people scatter twice as far
    onSwat(x, z) {
      startlePeople(x, z, 48, 30, 14);
      if (Math.random() < 0.35) chirp(game.cat.voice);
    },
  },
};

export const CAT_DEFS: CatDef[] = [tabby, chonk, shadow, siamese];
