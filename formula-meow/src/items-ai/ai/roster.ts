/**
 * The default field (GDD 5.1, 13): 7 rivals who are real Pink Paw cats (licence exists; ADOPTED cats are left out).
 * The share lane shows each rival's status with its date and the adopt link; this file only builds RacerInfo.
 */
import { DEFAULT_CAT, type BodyId, type CatSpec, type KartLook, type Personality, type RaceClass, type RacerInfo } from '../../types';
import { pinkPawCatSpec, pinkPawWaiting } from '../../share/pinkpaw/pink-paw';
import { personalityFor } from './personalities';

/** Kart paint per slot (bright toy colours that read on both themes). */
const PAINTS: [number, number, number][] = [
  [0xff5a5f, 0xfff3dc, 0x2a1a22],
  [0x3aa8ff, 0xffffff, 0x1a2a4a],
  [0xffc93c, 0x2a1a22, 0xff5a5f],
  [0x3bb273, 0xfff3dc, 0x1d3b2a],
  [0xb07fd8, 0xfff3dc, 0x2a1a3a],
  [0xff8a3d, 0x2a1a22, 0xfff3dc],
  [0x2cf6f3, 0x1a1238, 0xff3ea5],
  [0xff3ea5, 0xfff3dc, 0x1a1238],
];

/** Kart look per slot: the AI field shows all six bodies (content/karts.ts), slot 0 (the player's default) is the Tuna Can. */
export function kartLookFor(slot: number): KartLook {
  return { body: (slot % 6) as BodyId, paint: PAINTS[slot % PAINTS.length], number: (slot * 7 + 3) % 100 };
}

export interface FieldOptions {
  seed: number;
  cls: RaceClass;
  /** grid slot of the player (0 = pole); -1 = AI-only field */
  playerSlot: number;
  playerName?: string;
  playerCat?: CatSpec;
  playerKart?: KartLook;
}

/** 8 racers: the player at `playerSlot`, Pink Paw cats in the other slots (rotated by seed). */
export function buildField(o: FieldOptions): RacerInfo[] {
  const cats = pinkPawWaiting();
  const out: RacerInfo[] = [];
  let r = 0;
  const rot = cats.length ? Math.abs(o.seed | 0) % cats.length : 0;
  for (let slot = 0; slot < 8; slot++) {
    if (slot === o.playerSlot) {
      out.push({ name: o.playerName ?? 'You', cat: o.playerCat ?? DEFAULT_CAT, kart: o.playerKart ?? kartLookFor(0) });
      continue;
    }
    const c = cats.length ? cats[(r + rot) % cats.length] : undefined;
    const ai: Personality = personalityFor(o.seed, slot, o.cls);
    out.push(
      c
        ? { name: c.name, cat: pinkPawCatSpec(c), kart: kartLookFor(r + 1), ai, pinkPawId: c.id }
        : { name: `Cat ${slot + 1}`, cat: DEFAULT_CAT, kart: kartLookFor(r + 1), ai },
    );
    r++;
  }
  return out;
}
