import { describe, expect, it } from 'vitest';
import { buildField } from '../items-ai';
import type { RaceRequest } from '../core/app/shell';
import { KITCHEN } from '../core/track/tracks';
import { dressRequest, kartFromLoadout } from './loadout';
import { pickRival } from './rival';
import { defaultProg } from './state';
import { shelterUnlockOrder } from '../share/pinkpaw/unlocks';
import { PAINT_PRESETS } from '../content/cosmetics';

const deps = { buildField, own: null, defaultSlot: 5 };
const req = (o: Partial<RaceRequest> = {}): RaceRequest => ({ track: KITCHEN, cls: 0, seed: 42, modifiers: 0, mode: 'race', ...o });

describe('the garage loadout on the grid', () => {
  it('puts the body, paint, number, hat and trail on the player', () => {
    const s = defaultProg();
    s.owned.bodies.push(4);
    s.owned.hats.push(3);
    s.equip = { body: 4, paint: 2, number: 42, hat: 3, trail: 0, cat: null };
    const d = dressRequest(req(), s, deps);
    expect(d.req.playerKart).toEqual({ body: 4, paint: PAINT_PRESETS[2].paint, number: 42 });
    const me = d.req.racers![5];
    expect(me.kart.body).toBe(4);
    expect(me.hat).toBe(3);
    expect(me.name).toBe('You');
    expect(d.rival).toBeNull();
    expect(d.req.racers!.filter((r) => r.rival)).toHaveLength(0);
  });

  it('keeps a kart and a field another lane chose, adding only the missing cosmetics', () => {
    const s = defaultProg();
    s.equip.hat = 2;
    const field = buildField({ seed: 1, cls: 0, playerSlot: 7 });
    field[7] = { ...field[7], hat: 5 };
    const kart = { body: 1 as const, paint: [1, 2, 3] as [number, number, number], number: 1 };
    const d = dressRequest(req({ racers: field, playerSlot: 7, playerKart: kart }), s, deps);
    expect(d.req.playerKart).toBe(kart);
    expect(d.req.racers![7].hat).toBe(5);
    expect(d.req.racers!.map((r) => r.name)).toEqual(field.map((r) => r.name));
    expect(d.req.racers).not.toBe(field); // copied, never mutated
    expect(field[7].trail).toBeUndefined();
  });

  it('rebuilds its own field on a restart with a new seed (AI personalities follow the seed)', () => {
    const s = defaultProg();
    const a = dressRequest(req({ seed: 1 }), s, deps);
    const b = dressRequest({ ...a.req, seed: 2 }, s, deps);
    expect(b.req.racers).not.toBe(a.req.racers);
    expect(b.req.racers!.map((r) => r.ai?.skill)).toEqual(buildField({ seed: 2, cls: 0, playerSlot: 5 }).map((r) => r.ai?.skill));
  });

  it('races as a playable Pink Paw cat and swaps the same cat out of the AI field', () => {
    const s = defaultProg();
    const cats = shelterUnlockOrder();
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      for (const c of cats) {
        s.owned.cats = [c.id];
        s.equip.cat = c.id;
        const d = dressRequest(req({ seed }), s, deps);
        const me = d.req.racers![5];
        expect(me.name).toBe(c.name);
        expect(me.pinkPawId).toBeUndefined();
        const ids = d.req.racers!.map((r) => r.pinkPawId).filter(Boolean);
        expect(ids).not.toContain(c.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('names a rival in a Daily Cup (the same for everyone) and keeps a GP rival for the cup', () => {
    const s = defaultProg();
    const daily = dressRequest(req({ mode: 'daily' }), s, deps);
    expect(daily.rival).not.toBeNull();
    const field = buildField({ seed: 42, cls: 0, playerSlot: 5 });
    expect(daily.rival!.kart).toBe(pickRival(field, [5]));
    s.lastRival = daily.rival!.name; // memory never changes the Daily Cup
    expect(dressRequest(req({ mode: 'daily' }), s, deps).rival).toEqual(daily.rival);
    // a new cup avoids the last rival
    const gp = dressRequest(req({ mode: 'gp', cupId: 'kibble', raceIndex: 0 }), s, deps);
    expect(gp.rival!.name).not.toBe(daily.rival!.name);
    // later races of the cup keep the cup's rival by name, whatever the seed
    const next = dressRequest(req({ mode: 'gp', cupId: 'kibble', raceIndex: 1, seed: 7 }), s, deps, gp.rival!.name);
    expect(next.rival!.name).toBe(gp.rival!.name);
    expect(next.req.racers![next.rival!.kart].rival).toBe(true);
  });

  it('a restart picks up a garage change (its own kart and field are rebuilt)', () => {
    const s = defaultProg();
    const a = dressRequest(req(), s, deps);
    s.equip = { ...s.equip, paint: 7, hat: 0 };
    const b = dressRequest({ ...a.req, seed: 9 }, s, deps);
    expect(b.req.playerKart!.paint).toEqual(PAINT_PRESETS[7].paint);
    expect(b.req.racers![5].kart.paint).toEqual(PAINT_PRESETS[7].paint);
  });

  it('kartFromLoadout falls back to the first paint for an unknown preset', () => {
    expect(kartFromLoadout({ body: 0, paint: 77, number: 3, hat: 0, trail: 0, cat: null }).paint).toEqual(PAINT_PRESETS[0].paint);
  });
});
