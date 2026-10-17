import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { parseLink } from '../codec';
import { DEFAULT_CAT, NO_INPUT, type TickInput } from '../types';
import { androidIntentFor, buildDareChainLink, buildRoomDareLink, handoffEvent, handoffPlan, intentUrl } from './inapp-handoff';
import { reportPayload, reportProps } from './report';
import { fixtureRoom } from './test-fixtures';

const android = { isAndroid: true, isIOS: false, inApp: 'tiktok' as const };
const ios = { isAndroid: false, isIOS: true, inApp: 'instagram' as const };

describe('Android intent handoff', () => {
  it('builds the intent:// link for Android in-app browsers', () => {
    const link = 'https://tokentails.com/badcat/d/18?rp=abc&clip=1';
    expect(androidIntentFor(link, android)).toBe(
      'intent://tokentails.com/badcat/d/18?rp=abc&clip=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' +
        encodeURIComponent(link) +
        ';end',
    );
  });

  it('is null on iOS, desktop and in Chrome itself, and for non-http links', () => {
    expect(androidIntentFor('https://x.com/a', ios)).toBeNull();
    expect(androidIntentFor('https://x.com/a', { isAndroid: false, isIOS: false, inApp: 'none' })).toBeNull();
    expect(androidIntentFor('https://x.com/a', { ...android, inApp: 'none' })).toBeNull();
    expect(intentUrl('javascript:alert(1)')).toBeNull();
    expect(intentUrl('not a url')).toBeNull();
  });

  it('drops the fragment from the intent part but keeps it in the fallback', () => {
    const u = intentUrl('https://tokentails.com/badcat#r=abc')!;
    expect(u.startsWith('intent://tokentails.com/badcat#Intent;')).toBe(true);
    expect(u).toContain(encodeURIComponent('#r=abc'));
  });

  it('handoff plan: intent on Android, ••• steps on iOS; bc_inapp_handoff props', () => {
    expect(handoffPlan('https://t.co/x', android).intent).toMatch(/^intent:\/\//);
    const p = handoffPlan('https://t.co/x', ios, 'pay');
    expect(p.intent).toBeNull();
    expect(p.steps.steps.join(' ')).toContain('•••');
    expect(p.event).toEqual({ step: 'shown', purpose: 'pay' });
    expect(handoffEvent('intent_opened')).toEqual({ step: 'intent_opened', purpose: 'clip' });
  });
});

const inputs: TickInput[] = Array.from({ length: 120 }, (_, i) => (i % 30 < 10 ? { dir: 2, speed: 1, buttons: 0 } : NO_INPUT) as TickInput);

describe('dare chains', () => {
  it('the receiver run is g, the sender ghost g2 (with scores)', () => {
    const play = fixtureRoom();
    const link = buildDareChainLink(play, { inputs, cat: { ...DEFAULT_CAT, name: 'Luna' }, score: 9100 }, { inputs, cat: { ...DEFAULT_CAT, name: 'Mochi' }, name: 'Mochi', score: 8420 }, 'https://tokentails.com/badcat');
    expect(link).toContain('/d/18');
    const u = new URL(link);
    expect(u.searchParams.get('g')).toBeTruthy();
    expect(u.searchParams.get('g2')).toBeTruthy();
    expect(u.searchParams.get('n')).toBe('Luna');
    expect(u.searchParams.get('s')).toBe('9100');
    expect(u.searchParams.get('s2')).toBe('8420');
    // no sender: a plain one-ghost dare
    const solo = new URL(buildDareChainLink(play, { inputs, cat: DEFAULT_CAT }, null, 'https://tokentails.com/badcat'));
    expect(solo.searchParams.get('g2')).toBeNull();
  });

  it('room-link dares carry gn names', () => {
    const room = content.dailyRoom(3);
    const link = buildRoomDareLink(room, { inputs, cat: { ...DEFAULT_CAT, name: 'Luna' }, score: 100 }, { inputs, cat: { ...DEFAULT_CAT, name: 'Mochi' }, name: 'Mochi', score: 50 }, 'https://tokentails.com/badcat');
    const u = new URL(link);
    expect(u.searchParams.get('r')).toBeTruthy();
    expect(u.searchParams.get('gn')).toBe('Luna');
    expect(u.searchParams.get('gn2')).toBe('Mochi');
    expect(parseLink(u).room).toBeTruthy();
  });
});

describe('report', () => {
  it('ugc_reported props', () => {
    expect(reportProps('abc123', 'room')).toEqual({ payload_hash: 'abc123', kind: 'room' });
    const p = reportPayload('some-room-code', 'ghost');
    expect(p.kind).toBe('ghost');
    expect(p.payload_hash).toMatch(/^[0-9a-z]{8}$/);
  });
});
