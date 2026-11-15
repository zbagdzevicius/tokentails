// @vitest-environment happy-dom
/**
 * gaps6 the monthly coat drop (docs/plans/moba/LIVEOPS.md "Coat drop"): the baked calendar equals the server's, the
 * config parser (absent keeps the baked drop, null hides it), the countdown line (Home's drop slide) and the store's
 * "New drop" check. The drop's coats are real coats with parts and store art.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as server from '../../../backend/src/pawlegends/liveops/liveops.defaults';
import { DROP_CALENDAR, dropAt, dropLine, inDrop, parseConfig, parseDrop, resetLiveops, setDropAction } from '../../src/meta/liveops';
import { EFFECT_COATS } from '../../src/money/catalog';
import { COAT_PARTS } from '../../src/render/chars/coatParts';
import { SKIN_ART_IDS } from '../../src/ui/art/skinArt.gen';
import { countdownText } from '../../src/ui/modeSelect/modes';

const NOW = Date.parse('2026-11-18T10:00:00Z');
afterEach(() => {
  setDropAction({});
  resetLiveops();
  vi.useRealTimers();
});


describe('the monthly coat drop (gaps6)', () => {
  it('the baked calendar is the server one; every drop coat is a store coat with parts and painted art', () => {
    expect(DROP_CALENDAR).toEqual(server.DROP_CALENDAR);
    for (const d of DROP_CALENDAR)
      for (const id of d.coats) {
        expect(EFFECT_COATS.some((c) => c.id === id), id).toBe(true);
        expect(COAT_PARTS[id], id).toBeTruthy();
        expect(SKIN_ART_IDS.has(id), id).toBe(true);
      }
  });

  it('dropAt: none before the first, the running one after; the server answer wins; null hides it', () => {
    expect(dropAt(Date.parse('2026-11-01T00:00:00Z'))).toBeNull();
    const d = dropAt(NOW)!;
    expect(d.id).toBe('drop-2026-11');
    expect(d.next).toBeNull();
    expect(parseDrop(undefined, NOW)?.id).toBe('drop-2026-11');
    expect(parseDrop(null, NOW)).toBeNull();
    const srv = { id: 'drop-x', name: 'Test Drop', coats: ['coat.sage.store_bloomtail'], startsAt: '2026-11-17T00:00:00Z', endsAt: '2026-12-17T00:00:00Z', next: { startsAt: '2026-12-17T00:00:00Z', name: 'Winter Drop' } };
    expect(parseDrop(srv, NOW)).toMatchObject({ id: 'drop-x', coats: ['coat.sage.store_bloomtail'], next: { name: 'Winter Drop' } });
    // a malformed server drop keeps the baked one
    expect(parseDrop({ id: 'x' }, NOW)?.id).toBe('drop-2026-11');
    expect(parseConfig({ v: 1, events: [], drop: null }, NOW)?.drop).toBeNull();
    expect(parseConfig({ v: 1, events: [] }, NOW)?.drop?.id).toBe('drop-2026-11');
  });

  it('the countdown: new for the window, then the next scheduled drop, else nothing', () => {
    const d = dropAt(NOW)!;
    expect(dropLine(d, NOW, countdownText)).toMatch(/^3 new coats · new for \d+d/);
    expect(dropLine(d, d.endsAt + 1, countdownText)).toBe('');
    expect(dropLine({ ...d, next: { startsAt: d.endsAt + 86_400_000 * 3, name: 'December Drop' } }, d.endsAt + 1, countdownText)).toMatch(/^December Drop in /);
  });

  it('inDrop: the store marks the drop coats only while they are new', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetLiveops(NOW);
    expect(inDrop('coat.brutus.store_chairman', NOW)).toBe(true);
    expect(inDrop('coat.sage.store_bloomtail', NOW)).toBe(false);
    expect(inDrop('coat.brutus.store_chairman', Date.parse('2026-12-01T00:00:01Z'))).toBe(false);
  });
});
