/**
 * Human personas (GDD 3.5, 4.3, 11.1): who the human is, for render only. Routines differ by outfit, hair, prop in
 * hand, posture and how they move while BUSY; the sim's cone timing never changes. Every `RoutineDef.persona`
 * value has an entry (tested). Pure data.
 */
import type { RoutineDef } from '../../types';

export type PersonaId = NonNullable<RoutineDef['persona']>;
export type Holding = NonNullable<RoutineDef['holding']>;
export type Posture = NonNullable<RoutineDef['pose']>;

export const PERSONA_IDS: readonly PersonaId[] = ['chef-dad', 'couch-potato', 'skincare-sis', 'wfh-worker', 'party-host', 'napper', 'grandma', 'caterer'];

export type HairStyle = 'short' | 'bun' | 'long' | 'curly' | 'messy' | 'grey-bun' | 'neat';
export type Headwear = 'none' | 'chef' | 'party' | 'headset' | 'towel' | 'nightcap';
/** How the arms move while BUSY. */
export type BusyAnim = 'stir' | 'remote' | 'cream' | 'type' | 'mingle' | 'snore' | 'knit' | 'tray';

export interface PersonaDef {
  id: PersonaId;
  outfit: number;
  /** forearm colour (sleeves) or null = bare forearms (skin) */
  sleeve: number | null;
  pants: number;
  shoes: number;
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  headwear: Headwear;
  glasses?: boolean;
  moustache?: boolean;
  apron?: boolean;
  /** green face mask (skincare) */
  faceMask?: boolean;
  bowtie?: boolean;
  cardigan?: boolean;
  hoodie?: boolean;
  pyjama?: boolean;
  holding: Holding;
  posture: Posture;
  busy: BusyAnim;
  /** Double-take duration multiplier (grandma's slow turns: 1.5). The sim's cone timing is unchanged. */
  turnScale: number;
  /** Walk cycle speed multiplier. */
  walkScale: number;
  /** Extra height (m) above the head bone for the bubble anchor. */
  headTop: number;
}

export const PERSONAS: Readonly<Record<PersonaId, PersonaDef>> = {
  'chef-dad': {
    id: 'chef-dad', outfit: 0x8c9bb5, sleeve: null, pants: 0x55607a, shoes: 0x3b3340, skin: 0xf2c4a0, hair: 0x5a3b2e,
    hairStyle: 'short', headwear: 'chef', moustache: true, apron: true, holding: 'pan', posture: 'stand', busy: 'stir',
    turnScale: 1, walkScale: 1, headTop: 0.78,
  },
  'couch-potato': {
    id: 'couch-potato', outfit: 0x7d8fb3, sleeve: 0x7d8fb3, pants: 0x4a5160, shoes: 0xe9e3d8, skin: 0xe8b48f, hair: 0x2f2522,
    hairStyle: 'messy', headwear: 'none', hoodie: true, holding: 'remote', posture: 'sit', busy: 'remote',
    turnScale: 1.1, walkScale: 0.9, headTop: 0.55,
  },
  'skincare-sis': {
    id: 'skincare-sis', outfit: 0xd7a6c4, sleeve: null, pants: 0xb98bb0, shoes: 0xfff0f5, skin: 0xf6cfb5, hair: 0x8a4b2e,
    hairStyle: 'long', headwear: 'towel', faceMask: true, holding: 'phone', posture: 'stand', busy: 'cream',
    turnScale: 1, walkScale: 1, headTop: 0.72,
  },
  'wfh-worker': {
    id: 'wfh-worker', outfit: 0x9fb4a8, sleeve: 0x9fb4a8, pants: 0x5b6470, shoes: 0x3b3340, skin: 0xc68e6a, hair: 0x1f1a1c,
    hairStyle: 'curly', headwear: 'headset', glasses: true, holding: 'laptop', posture: 'sit', busy: 'type',
    turnScale: 1, walkScale: 1, headTop: 0.62,
  },
  'party-host': {
    id: 'party-host', outfit: 0xc39ad6, sleeve: null, pants: 0x4d4a6b, shoes: 0x2b2440, skin: 0xd9a27e, hair: 0x6b2f2a,
    hairStyle: 'bun', headwear: 'party', holding: 'phone', posture: 'stand', busy: 'mingle',
    turnScale: 0.95, walkScale: 1.1, headTop: 0.78,
  },
  napper: {
    id: 'napper', outfit: 0x9db7d6, sleeve: 0x9db7d6, pants: 0x9db7d6, shoes: 0x9db7d6, skin: 0xf0c3a2, hair: 0x6e4b3a,
    hairStyle: 'messy', headwear: 'nightcap', pyjama: true, holding: 'none', posture: 'lie', busy: 'snore',
    turnScale: 1.25, walkScale: 0.8, headTop: 0.66,
  },
  grandma: {
    id: 'grandma', outfit: 0xb39ab0, sleeve: 0xb39ab0, pants: 0x6f6578, shoes: 0x4a3f48, skin: 0xf0cdb4, hair: 0xd9d4d0,
    hairStyle: 'grey-bun', headwear: 'none', glasses: true, cardigan: true, holding: 'mug', posture: 'stand', busy: 'knit',
    turnScale: 1.5, walkScale: 0.7, headTop: 0.66,
  },
  caterer: {
    id: 'caterer', outfit: 0xf3efe8, sleeve: 0xf3efe8, pants: 0x2b2733, shoes: 0x1f1b24, skin: 0xd8a582, hair: 0x2a1f1b,
    hairStyle: 'neat', headwear: 'none', bowtie: true, holding: 'tray', posture: 'stand', busy: 'tray',
    turnScale: 0.9, walkScale: 1.05, headTop: 0.55,
  },
};

/** The persona of a routine: `persona`, else guessed from the name, else Chef Dad. */
export function personaFor(r: Pick<RoutineDef, 'persona' | 'name' | 'kind'>): PersonaDef {
  if (r.persona && PERSONAS[r.persona]) return PERSONAS[r.persona];
  const n = (r.name ?? '').toLowerCase();
  if (r.kind === 'napper' || /nap|sleep/.test(n)) return PERSONAS.napper;
  if (/couch|tv/.test(n)) return PERSONAS['couch-potato'];
  if (/skin|sis/.test(n)) return PERSONAS['skincare-sis'];
  if (/wfh|work|zoom/.test(n)) return PERSONAS['wfh-worker'];
  if (/party|host/.test(n)) return PERSONAS['party-host'];
  if (/grand/.test(n)) return PERSONAS.grandma;
  if (/cater/.test(n)) return PERSONAS.caterer;
  return PERSONAS['chef-dad'];
}

/** Resolved look of one human: persona + the routine's overrides (outfit colour, holding, pose). */
export interface HumanLook extends PersonaDef {
  napper: boolean;
}
export function humanLook(r: RoutineDef): HumanLook {
  const p = personaFor(r);
  return {
    ...p,
    outfit: r.outfitColor ?? p.outfit,
    sleeve: p.sleeve === null ? null : (r.outfitColor ?? p.sleeve),
    holding: r.holding ?? p.holding,
    posture: r.pose ?? p.posture,
    napper: r.kind === 'napper' || p.id === 'napper',
  };
}
