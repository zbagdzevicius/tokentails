// @vitest-environment happy-dom
/**
 * Party play M2-M3 (MULTIPLAYER.md §7, D8): social messages are enumerated ids, never text. The counts match the
 * relay's SOCIAL_COUNT; points are clamped integers on the map; the rate limit (1 per 2 s, 10 per 30 s) is mirrored on
 * the client; the chat wheel maps a pointer to the right line or emote.
 */
import { describe, expect, it } from 'vitest';
import { SOCIAL_BOUNDS, SOCIAL_COUNT, SocialLimiter, clampSocialPoint, socialIdOk, parseClientJson } from '../../src/net/proto';
import { CHAT_LINES, EMOTES, socialLine, socialText } from '../../src/data/social';
import { PING_KINDS } from '../../src/data/pings';
import { MAP } from '../../src/data/map';
import { CHAT_RING, QuickChat, chatSlice } from '../../src/party/ui/quickChat';

describe('social ids and limits (M2, M3)', () => {
  it('the wire counts equal the client tables and the map bounds equal MAP', () => {
    expect(SOCIAL_COUNT.chat).toBe(CHAT_LINES.length);
    expect(SOCIAL_COUNT.emote).toBe(EMOTES.length);
    expect(SOCIAL_COUNT.ping).toBe(PING_KINDS.length);
    expect(CHAT_LINES).toEqual(['Nice!', 'On my way', 'Help me', 'Group up', 'Back off', 'Push', 'Thanks', 'GG']);
    expect(EMOTES).toHaveLength(4);
    expect(SOCIAL_BOUNDS).toEqual({ width: MAP.width, height: MAP.height });
  });

  it('only enumerated ids pass; text never has a field', () => {
    expect(socialIdOk('chat', 7)).toBe(true);
    expect(socialIdOk('chat', 8)).toBe(false);
    expect(socialIdOk('emote', 4)).toBe(false);
    expect(socialIdOk('ping', -1)).toBe(false);
    expect(socialIdOk('ping', 1.5)).toBe(false);
    expect(() => parseClientJson(JSON.stringify({ t: 'social', kind: 'chat', id: 1, text: 'hi' }))).toThrow();
    expect(() => parseClientJson(JSON.stringify({ t: 'social', kind: 'chat', id: 1.5 }))).toThrow();
    expect(socialText('chat', 99)).toBe('');
    expect(socialText('ping', 0)).toBe('Go here');
  });

  it('points are clamped integers inside the map', () => {
    expect(clampSocialPoint(123.6, -5)).toEqual({ x: 124, y: 0 });
    expect(clampSocialPoint(1e9, 1e9)).toEqual({ x: MAP.width, y: MAP.height });
    expect(clampSocialPoint(Number.NaN, Infinity)).toEqual({ x: 0, y: 0 });
  });

  it('rate limit: 1 per 2 s and 10 per 30 s', () => {
    const l = new SocialLimiter();
    expect(l.allow(0)).toBe(true);
    expect(l.allow(1999)).toBe(false);
    const m = new SocialLimiter();
    let n = 0;
    for (let i = 0; i < 15; i++) if (m.allow(i * 2000)) n++;
    expect(n).toBe(10);
    expect(m.allow(30_000)).toBe(true);
  });

  it('rail lines fit a 28-character phone line', () => {
    expect(socialLine('Mira', 'chat', 1)).toBe('Mira: On my way');
    expect(socialLine('Sunny Tabby of the Long Name', 'ping', 1).length).toBeLessThanOrEqual(28);
    expect(socialLine('Mira', 'chat', 42)).toBe('');
  });

  it('the chat wheel: inner ring emotes, outer ring lines, dead zone sends nothing', () => {
    expect(chatSlice(0, 0)).toBeNull();
    expect(chatSlice(0, -CHAT_RING.inner)).toEqual({ kind: 'emote', id: 0 });
    expect(chatSlice(CHAT_RING.inner, 0)).toEqual({ kind: 'emote', id: 1 });
    expect(chatSlice(0, -CHAT_RING.outer)).toEqual({ kind: 'chat', id: 0 });
    expect(chatSlice(0, CHAT_RING.outer)).toEqual({ kind: 'chat', id: 4 });
    const root = document.createElement('div');
    document.body.appendChild(root);
    const qc = new QuickChat(root, { enabled: () => true });
    const got: string[] = [];
    qc.onPick = (p) => got.push(`${p.kind}:${p.id}`);
    qc.button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(qc.open).toBe(true);
    const items = root.querySelectorAll<HTMLButtonElement>('.pl-chatwheel .cw');
    expect(items).toHaveLength(12);
    items[1].dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(got).toEqual(['chat:1']);
    expect(qc.open).toBe(false);
    qc.dispose();
  });
});
