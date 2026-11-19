/**
 * Casual bot seats shown as players (founder, 2026-11-19: "while match is found, in-game shouldn't appear as BOT but as
 * generated user name, country, champ like as usual"). The relay names each bot seat of a casual (never ranked) match
 * with a persona (backend party/bot-persona.ts): a generated name, a flag and an avatar, in the party view
 * (`mm.fill`, the pick and loading) and the match frame (`personas`, the match and the results). Every screen shows the
 * persona like a player and never a "Bot" tag; `names` keeps null for these seats, so every rule that needs a person
 * (reports, kudos, friend requests, a profile link) still skips them, quietly. Ranked bots stay labelled.
 */
import type { AvatarWire, PersonaView } from '../net/proto';

export interface Persona {
  slot: number;
  name: string;
  /** ISO flag; null shows a paw (a player who hid it). */
  cc: string | null;
  av: AvatarWire | null;
  /** The champion it locked (pick and loading; absent until it locks, and for the other team in the pick). */
  hero: string | null;
}

const NAME = /^[A-Za-z][A-Za-z '-]{1,31}$/;
const CC = /^[A-Z]{2}$/;
const ICON = /^[a-z]:[a-z0-9_.-]{1,48}$/;

/** The personas of a frame, checked (a bad entry is dropped, never shown), by slot. Pure. */
export function personaMap(list: readonly PersonaView[] | null | undefined, slots = 10): Map<number, Persona> {
  const out = new Map<number, Persona>();
  if (!Array.isArray(list)) return out;
  for (const p of list) {
    if (!p || !Number.isInteger(p.slot) || p.slot < 0 || p.slot >= slots || typeof p.name !== 'string' || !NAME.test(p.name)) continue;
    out.set(p.slot, {
      slot: p.slot,
      name: p.name,
      cc: typeof p.cc === 'string' && CC.test(p.cc) ? p.cc : null,
      av: p.av && typeof p.av.i === 'string' && ICON.test(p.av.i) ? { i: p.av.i } : null,
      hero: typeof p.hero === 'string' && /^[a-z0-9_]{1,32}$/.test(p.hero) ? p.hero : null,
    });
  }
  return out;
}

let current: ReadonlyMap<number, Persona> = new Map();

/** The running match's personas (each match sets its own; a solo or ranked match sets none). */
export function setMatchPersonas(list: readonly PersonaView[] | null | undefined): void {
  current = personaMap(list);
}

/** The persona of a seat in the running (or just ended) match, or null. */
export function matchPersona(slot: number): Persona | null {
  return current.get(slot) ?? null;
}

/** Every persona of the running (or just ended) match, by slot. */
export function matchPersonas(): ReadonlyMap<number, Persona> {
  return current;
}

/** The seats the running match shows as players although bots play them. */
export function matchPersonaSlots(): ReadonlySet<number> {
  return new Set(current.keys());
}

/** Display names per slot: the relay's player names, a persona's name where a bot plays as a player. Pure. */
export function withPersonaNames(names: readonly (string | null | undefined)[], personas: ReadonlyMap<number, Persona>): (string | null)[] {
  return names.map((n, slot) => (n !== null && n !== undefined ? n : (personas.get(slot)?.name ?? null)));
}
