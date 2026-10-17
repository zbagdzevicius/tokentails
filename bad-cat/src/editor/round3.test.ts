import { describe, expect, it } from 'vitest';
import { PROP_KINDS } from '../types';
import { kindIcon, kindsForTab, placeableKinds, shellKinds } from './palette';
import { defaultEvent, defaultRoutine, newDraft, switchShell } from './placement';
import { content } from '../content';

// Round 3 (QA) Room Maker: the palette lists the room's own props, every prop has its own icon, and a new room
// comes with its own human and event.
describe('Room Maker round 3', () => {
  it("the Kitchen palette is the Kitchen's props (no ornament, turkey platter or face-mask jar)", () => {
    const only = shellKinds(0)!;
    const ids = kindsForTab('fragile', only).map((k) => k.id);
    expect(ids).toContain('wine-glass');
    for (const no of ['ornament', 'turkey-platter', 'face-mask-jar']) expect(ids).not.toContain(no);
    expect(kindsForTab('fragile').length).toBeGreaterThan(ids.length);
  });

  it('every placeable prop has its own icon (the Perfume tray was a 🎁)', () => {
    const gifts = new Set(['gift-stack', 'gift-wrap']);
    for (const k of placeableKinds()) if (!gifts.has(k.id)) expect(kindIcon(k.kind), k.id).not.toBe('🎁');
    expect(PROP_KINDS.length).toBeGreaterThan(10);
  });

  it('switching to the Living room brings the Couch Potato and a living-room event', () => {
    const shells = content.shells!;
    const routines = content.routines!;
    const kitchen = newDraft(shells[0], 0, routines);
    const living = switchShell(kitchen, shells[1], 1, routines);
    expect(living.routine).toBe(defaultRoutine(routines, shells[1], 1));
    expect(routines[living.routine].name).toBe('Couch Potato');
    expect(living.event).toBe(defaultEvent(1));
  });
});
