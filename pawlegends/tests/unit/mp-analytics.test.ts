// @vitest-environment happy-dom
/**
 * Party play M8 (MULTIPLAYER.md §10): the party event names, flat props, and no party code, room id, member id or
 * name in any prop (the game's scrubber and the party HUD's own events). The embed host's allowlist relays them.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Analytics, cleanMpProps, isMpEvent } from '../../src/analytics/posthog';
import { MP_EVENTS } from '../../src/app/mpTypes';
import { MpHud } from '../../src/app/mpHud';
import { FakeLink, fakeHost } from './mp-helpers';

const SPEC = ['party_create', 'party_join', 'party_share', 'party_leave', 'party_kick', 'party_start', 'party_pick', 'mp_match_start', 'mp_net', 'mp_disconnect', 'mp_rejoin', 'mp_takeover', 'mp_reclaim', 'mp_desync', 'mp_referee_divergence', 'mp_vote', 'mp_social', 'mp_match_end', 'mp_rematch', 'mm_join', 'mm_cancel', 'mm_found', 'mm_backfill_offer', 'mm_backfill_join', 'mm_penalty', 'mm_keep_waiting', 'mp_void'];

const flat = (p: Record<string, unknown>): boolean => Object.values(p).every((v) => ['string', 'number', 'boolean'].includes(typeof v));
const leaks = (p: Record<string, unknown>): boolean =>
  Object.keys(p).some((k) => /^(code|room|roomId|member|memberId|party|partyId|name|token|ticket)$/.test(k)) ||
  Object.values(p).some((v) => typeof v === 'string' && (/^[2-9A-HJ-NP-Z]{6}$/.test(v) || /^[A-Za-z0-9_-]{16,}$/.test(v)));

describe('party analytics (M8)', () => {
  it('the event names are the spec list, and the embed host relays every one', () => {
    expect([...MP_EVENTS].sort()).toEqual([...SPEC].sort());
    for (const e of SPEC) expect(isMpEvent(e)).toBe(true);
    expect(isMpEvent('match_end')).toBe(false);
    const host = readFileSync(resolve(__dirname, '../../../client/analytics/pawlegends-events.ts'), 'utf8');
    for (const e of SPEC) expect(host).toContain(`"${e}"`);
  });

  it('the scrubber drops codes, room ids, member ids and names', () => {
    const p = cleanMpProps({ code: 'K7QX2M', room: 'abc', via: 'link', guest: true, members: 2, other: 'K7QX2M', id: 'a3f9c2d1e8b7a6f5c4d3', name: 'Mira' });
    expect(p).toEqual({ via: 'link', guest: true, members: 2 });
  });

  it('queued party events carry flat props without a code or a room id', () => {
    const a = new Analytics({ key: '', fetch: null, kv: { getItem: () => 'granted', setItem: () => undefined } });
    a.track('party_join', { via: 'code', code: 'K7QX2M', members: 2, guest: false, nested: { a: 1 } });
    a.track('mp_match_end', { outcome: 'won', room: 'r-1234567890abcdef', humans: 2, piloted_pct: 4, reason: 'core', scored: true });
    for (const e of a.pending()) {
      expect(flat(e.props)).toBe(true);
      expect(leaks(e.props)).toBe(false);
    }
  });

  it('the party HUD only sends mp_* events with flat props', () => {
    const link = new FakeLink(1, ['K7QX2M', 'Mira', null, null, null, null]);
    const f = fakeHost(['A', 'B', 'C', 'D', 'E', 'F']);
    const hud = new MpHud(f.host, link, { hideNames: false });
    hud.start();
    link.emit('slot', 1, 'drop', false);
    link.emit('covered', 42);
    link.emit('vote', { kind: 'pause', yes: [0], need: 2, leftMs: 9000 });
    link.emit('vote', { kind: 'pause', yes: [], need: 0, leftMs: 0, result: 'fail' });
    for (let i = 0; i < 40; i++) hud.ping(0, 1000, 2000);
    hud.ended('won', 'core', true);
    const names = new Set(f.tracked.map((t) => t.event));
    expect([...names].every((n) => isMpEvent(n))).toBe(true);
    for (const n of ['mp_match_start', 'mp_takeover', 'mp_reclaim', 'mp_vote', 'mp_match_end']) expect(names.has(n)).toBe(true);
    for (const t of f.tracked) {
      expect(flat(t.props)).toBe(true);
      expect(leaks(t.props)).toBe(false);
    }
    hud.dispose();
  });
});
