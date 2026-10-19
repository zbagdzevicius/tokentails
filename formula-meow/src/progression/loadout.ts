/**
 * The player's garage loadout on the grid: body, paint, number, hat, trail and (when picked) a playable Pink Paw cat,
 * plus the rival flag for Grand Prix and Daily Cup races. `dressRequest` fills a race request before the shell builds
 * the race, so the body reaches the sim (ghosts carry it) and the hat and trail are on the RacerInfo before the karts
 * are drawn. A request that already names a kart or a field (the modes lane's select screen) keeps it.
 */
import type { CatSpec, KartLook, RaceClass, RaceMode, RacerInfo } from '../types';
import type { RaceRequest } from '../core/app/shell';
import { PAINT_PRESETS } from '../content/cosmetics';
import { PINK_PAW_CATS, pinkPawCatSpec, pinkPawWaiting } from '../share/pinkpaw/pink-paw';
import { pickRival, rivalByName, withRival } from './rival';
import type { Loadout, ProgSave } from './state';

export function kartFromLoadout(l: Loadout): KartLook {
  const p = PAINT_PRESETS[l.paint] ?? PAINT_PRESETS[0];
  return { body: l.body, paint: [p.paint[0], p.paint[1], p.paint[2]], number: l.number };
}

export interface FieldFn {
  (o: { seed: number; cls: RaceClass; playerSlot: number; playerName?: string; playerCat?: CatSpec; playerKart?: KartLook }): RacerInfo[];
}

export interface DressDeps {
  buildField: FieldFn;
  /** the share lane's own cat (cat maker), or null */
  own: { name: string; cat: CatSpec } | null;
  /** the shell's default player slot */
  defaultSlot: number;
}

/** Fields this module built: a restart with a new seed rebuilds them (the AI personalities follow the seed). */
const built = new WeakSet<object>();
const builtKarts = new WeakSet<object>();

export interface Dressed {
  req: RaceRequest;
  rival: { kart: number; name: string } | null;
}

/** Swap an AI that is the same shelter cat as the player for a roster cat not on the grid (cosmetic only). */
function dedupeShelterCat(racers: RacerInfo[], me: number, catId: string): void {
  const used = new Set(racers.map((r) => r.pinkPawId).filter(Boolean));
  used.add(catId);
  const spare = pinkPawWaiting().find((c) => !used.has(c.id));
  racers.forEach((r, i) => {
    if (i === me || r.pinkPawId !== catId) return;
    if (spare) racers[i] = { ...r, name: spare.name, cat: pinkPawCatSpec(spare), pinkPawId: spare.id };
    else racers[i] = { ...r, name: `Cat ${i + 1}`, pinkPawId: undefined };
  });
}

/**
 * The cup's rival is a shelter cat the seed left off this grid (7 of the 8 roster cats race at a time): give the
 * strongest AI that cat's name and coat, so the rival stays the same cat for the whole cup. Cosmetic only (the AI keeps
 * its own numbers). Returns the index, or -1 when the name is not a roster cat.
 */
function bringRival(racers: RacerInfo[], humans: readonly number[], name: string): number {
  const cat = pinkPawWaiting().find((c) => c.name === name);
  if (!cat || racers.some((r) => r.pinkPawId === cat.id || r.name === cat.name)) return -1;
  const idx = pickRival(racers, humans);
  if (idx < 0) return -1;
  racers[idx] = { ...racers[idx], name: cat.name, cat: pinkPawCatSpec(cat), pinkPawId: cat.id };
  return idx;
}

export function rivalMode(mode: RaceMode | undefined): boolean {
  return mode === 'gp' || mode === 'daily';
}

/**
 * Fill a race request from the loadout (pure apart from remembering which fields it built). `cupRival` is the name
 * kept for the cup in progress (GP); the Daily Cup picks without memory so every player meets the same rival.
 */
export function dressRequest(req: RaceRequest, s: ProgSave, d: DressDeps, cupRival: string | null = null): Dressed {
  const l = s.equip;
  const slot = req.playerSlot ?? d.defaultSlot;
  const humans = [slot];
  // a kart this module chose (a restart re-sends it) follows the garage; one another lane chose is kept
  const playerKart = req.playerKart && !builtKarts.has(req.playerKart) ? req.playerKart : kartFromLoadout(l);
  if (playerKart !== req.playerKart) builtKarts.add(playerKart);
  const shelter = l.cat ? PINK_PAW_CATS.find((c) => c.id === l.cat && c.status !== 'ADOPTED') : undefined;
  let racers: RacerInfo[];
  const foreign = !!req.racers && !built.has(req.racers);
  if (foreign) {
    // a field from another lane (modes): copy it, add the cosmetics it left out
    racers = (req.racers ?? []).map((r) => ({ ...r }));
    const p = racers[slot];
    if (p) racers[slot] = { ...p, hat: p.hat ?? l.hat, trail: p.trail ?? l.trail };
  } else {
    const name = shelter ? shelter.name : (d.own?.name ?? 'You');
    const cat = shelter ? pinkPawCatSpec(shelter) : d.own?.cat;
    racers = d.buildField({ seed: req.seed, cls: req.cls, playerSlot: slot, playerName: name, playerCat: cat, playerKart });
    const p = racers[slot];
    if (p) racers[slot] = { ...p, hat: l.hat, trail: l.trail };
    if (shelter) dedupeShelterCat(racers, slot, shelter.id);
  }
  let rival: Dressed['rival'] = null;
  if (rivalMode(req.mode)) {
    let idx = req.mode === 'gp' && cupRival ? rivalByName(racers, humans, cupRival) : -1;
    if (idx < 0 && req.mode === 'gp' && cupRival) idx = bringRival(racers, humans, cupRival);
    if (idx < 0) idx = pickRival(racers, humans, req.mode === 'gp' ? s.lastRival : null);
    if (idx >= 0) {
      racers = withRival(racers, idx);
      rival = { kart: idx, name: racers[idx].name };
    }
  }
  if (!foreign) built.add(racers);
  return { req: { ...req, playerKart, racers }, rival };
}
