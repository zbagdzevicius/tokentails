// @vitest-environment happy-dom
/**
 * The game's API bridge (docs/plans/moba/SOCIAL-RANKED.md §13): the op allowlist matches the shared fixture (the host
 * reads the same list), args are flattened to known keys, answers are matched by id, and standalone or refused posts
 * answer `{ok: false, status: 0}` without waiting.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { API_OPS, cleanApiArgs, parseApiRequest, parseApiResult } from '../../src/embed/api';
import { installIntegration, API_WAIT_MS } from '../../src/embed/integrate';
import { Entitlements } from '../../src/money/entitlements';
import { freshProfile } from '../../src/meta/profile';

const FIX = JSON.parse(readFileSync(resolve(__dirname, '../../../shared/pawlegends-bridge.fixtures.json'), 'utf8')) as {
  apiOps: string[];
  gameToHost: Record<string, { valid: Record<string, unknown> }>;
};

describe('api bridge (SOCIAL-RANKED.md §13)', () => {
  it('the op list is the shared one', () => {
    expect([...API_OPS]).toEqual(FIX.apiOps);
  });

  it('args keep known flat keys only', () => {
    expect(cleanApiArgs({ room: 'r1', slot: 3, url: 'https://evil', nested: { a: 1 }, note: 'x'.repeat(141) })).toEqual({ room: 'r1', slot: 3 });
    expect(cleanApiArgs([1])).toBeNull();
    expect(cleanApiArgs(undefined)).toEqual({});
  });

  it('requests: unknown ops are refused; the fixture sample parses', () => {
    expect(parseApiRequest({ id: 'a1', op: 'user.delete', args: {} })).toBeNull();
    expect(parseApiRequest(FIX.gameToHost['api-request'].valid)).toMatchObject({ op: 'report.send', args: { slot: 3 } });
  });

  it('results: body must be an object under the size cap', () => {
    expect(parseApiResult({ id: 'a1', ok: true, status: 201, body: { ok: true } })).toEqual({ id: 'a1', ok: true, status: 201, body: { ok: true } });
    expect(parseApiResult({ id: 'a1', ok: true, status: 200, body: 'x' })).toBeNull();
    expect(parseApiResult({ id: 'a1', ok: true, status: 200, body: { s: 'x'.repeat(70_000) } })).toBeNull();
    expect(parseApiResult({ id: 'A!', ok: true, status: 200 })).toBeNull();
  });

  function harness(active = true, accept = true) {
    const posted: { type: string; payload: Record<string, unknown> }[] = [];
    let handler: ((m: Record<string, unknown>) => void) | null = null;
    const msg = (m: Record<string, unknown>) => ({ ns: 'tt-pawlegends', v: 1, ...m });
    const bridge = {
      active,
      post: (type: string, payload: Record<string, unknown> = {}) => {
        posted.push({ type, payload });
        return accept;
      },
      on: (h: (m: Record<string, unknown>) => void) => void (handler = h),
    };
    const integ = installIntegration(bridge as never, {
      ent: new Entitlements(),
      profile: freshProfile,
      analytics: { track: () => undefined },
      root: document.createElement('div'),
      onRosterChange: () => undefined,
    });
    return { integ, posted, emit: (m: Record<string, unknown>) => handler?.(msg(m)) };
  }

  it('answers by id; standalone and refused posts answer status 0 at once', async () => {
    const h = harness();
    const p = h.integ.api('report.send', { room: 'r1', slot: 3, reason: 'afk' });
    const req = h.posted.find((m) => m.type === 'api-request')!;
    expect(req.payload).toMatchObject({ op: 'report.send', args: { room: 'r1', slot: 3, reason: 'afk' } });
    h.emit({ type: 'api-result', id: 'other', ok: true, status: 200 });
    h.emit({ type: 'api-result', id: req.payload.id, ok: true, status: 201, body: { ok: true } });
    await expect(p).resolves.toMatchObject({ ok: true, status: 201 });
    await expect(harness(false).integ.api('ranked.status')).resolves.toMatchObject({ ok: false, status: 0 });
    await expect(harness(true, false).integ.api('ranked.status')).resolves.toMatchObject({ ok: false, status: 0 });
  });

  it('times out to status 0', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const p = h.integ.api('social.get');
      vi.advanceTimersByTime(API_WAIT_MS + 1);
      await expect(p).resolves.toMatchObject({ ok: false, status: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});
