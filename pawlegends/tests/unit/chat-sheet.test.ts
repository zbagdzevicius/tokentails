// @vitest-environment happy-dom
/**
 * The DM thread sheet (CHAT-AVATARS.md §6.2): the server's tier decides input vs phrase tray, text goes through the
 * host as one op with no URL or token, messages are textContent, errors show inline for 3 s and never echo the text,
 * the 4 s poll runs only while the sheet is open, visible and no match runs, and reports go out by message id.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { ChatSheet, bubbleText, mergeMessages } from '../../src/social/chatSheet';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const THREAD = 'dAAAAAAAAAAAAAAAAAAAAAA';
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function sheet(opts: { tier?: 'text' | 'quick'; inMatch?: boolean; send?: ApiResult } = {}) {
  const calls: { op: string; args: any }[] = [];
  let since: any[] = [];
  const api = vi.fn(async (op: string, args?: any): Promise<ApiResult> => {
    calls.push({ op, args });
    if (op === 'chat.open') return { id: 'x', ok: true, status: 200, body: { thread: THREAD, tier: opts.tier ?? 'text' } };
    if (op === 'chat.history')
      return {
        id: 'x',
        ok: true,
        status: 200,
        body: {
          thread: { tier: opts.tier ?? 'text', muted: false, readOnly: false },
          messages: [
            { mid: 'a'.repeat(24), mine: false, k: 't', text: '<img src=x onerror=alert(1)>', at: '2026-11-11T10:00:00Z' },
            { mid: 'b'.repeat(24), mine: true, k: 'q', id: 5, at: '2026-11-11T10:01:00Z' },
          ],
          more: false,
        },
      };
    if (op === 'chat.since') return since.length ? { id: 'x', ok: true, status: 200, body: { messages: since.splice(0) } } : { id: 'x', ok: true, status: 204 };
    if (op === 'chat.send')
      return opts.send ?? { id: 'x', ok: true, status: 200, body: { message: { mid: 'c'.repeat(24), mine: true, k: args.k, ...(args.text ? { text: args.text } : { id: args.pid }), at: '2026-11-11T10:02:00Z' } } };
    return { id: 'x', ok: true, status: 200, body: {} };
  });
  const onClose = vi.fn();
  const s = new ChatSheet(document.body, {
    api: api as never,
    friend: { code: 'PL-AAAA-AAAA', name: 'Mira', av: { i: 'h:clem' } },
    onClose,
    inMatch: () => opts.inMatch ?? false,
  });
  return { s, calls, onClose, pushSince: (m: any) => since.push(m) };
}

describe('chat sheet', () => {
  it('text tier: the input with a 120 cap, messages as text, phrases as bubbles', async () => {
    const t = sheet();
    await flush();
    const input = document.querySelector<HTMLInputElement>('[data-testid="chat-input"]')!;
    expect(input.maxLength).toBe(120);
    expect(document.querySelector('[data-testid="chat-list"] img')).toBeNull();
    const bubbles = [...document.querySelectorAll('.pl-chat-bubble')].map((b) => b.textContent);
    expect(bubbles).toEqual(['<img src=x onerror=alert(1)>', 'GG, well played!']);
    input.value = 'see you at 7';
    document.querySelector<HTMLFormElement>('.pl-chat-form')!.requestSubmit();
    await flush();
    expect(t.calls.find((c) => c.op === 'chat.send')!.args).toEqual({ thread: THREAD, k: 't', text: 'see you at 7' });
    expect(JSON.stringify(t.calls)).not.toMatch(/https?:|accesstoken/);
    expect([...document.querySelectorAll('.pl-chat-bubble')].pop()!.textContent).toBe('see you at 7');
    // read cursor moved to the newest received message
    expect(t.calls.some((c) => c.op === 'chat.read' && c.args.thread === THREAD && c.args.upTo === 'b'.repeat(24))).toBe(true);
  });

  it('quick tier: no input, the phrase tray and the safety line; a phrase sends its id', async () => {
    const t = sheet({ tier: 'quick' });
    await flush();
    expect(document.querySelector('[data-testid="chat-input"]')).toBeNull();
    expect(document.querySelector('[data-testid="chat-quick-note"]')!.textContent).toContain('Quick chat keeps everyone safe');
    document.querySelector<HTMLElement>('[data-a="say"][data-id="0"]')!.click();
    await flush();
    expect(t.calls.find((c) => c.op === 'chat.send')!.args).toEqual({ thread: THREAD, k: 'q', pid: 0 });
    // nobody is told the other player's age band
    expect(document.body.textContent).not.toMatch(/under|16|18|age/i);
  });

  it('a refused message shows the reason class inline for 3 s and never echoes the text', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sheet({ send: { id: 'x', ok: false, status: 422, body: { code: 'PAWLEGENDS_CHAT_REJECTED', why: 'link' } } });
    await flush();
    const input = document.querySelector<HTMLInputElement>('[data-testid="chat-input"]')!;
    input.value = 'add me on discord';
    document.querySelector<HTMLFormElement>('.pl-chat-form')!.requestSubmit();
    await flush();
    const err = document.querySelector('.pl-chat-err')!;
    expect(err.textContent).toContain('no links');
    expect(err.textContent).not.toContain('discord');
    vi.advanceTimersByTime(3100);
    expect(document.querySelector('.pl-chat-err')).toBeNull();
  });

  it('polls every 4 s while open; pauses in a match; stops on close', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const t = sheet();
    await flush();
    t.pushSince({ mid: 'd'.repeat(24), mine: false, k: 's', id: 2, at: '2026-11-11T10:03:00Z' });
    vi.advanceTimersByTime(4000);
    await flush();
    expect([...document.querySelectorAll('.pl-chat-bubble')].pop()!.textContent).toBe('😹');
    const n = t.calls.filter((c) => c.op === 'chat.since').length;
    document.querySelector<HTMLElement>('[data-a="back"]')!.click();
    expect(t.onClose).toHaveBeenCalled();
    vi.advanceTimersByTime(12_000);
    await flush();
    expect(t.calls.filter((c) => c.op === 'chat.since').length).toBe(n);
    const m = sheet({ inMatch: true });
    await flush();
    vi.advanceTimersByTime(8000);
    await flush();
    expect(m.calls.some((c) => c.op === 'chat.since')).toBe(false);
  });

  it('report a received message by id with one tap on a reason', async () => {
    const t = sheet();
    await flush();
    document.querySelector<HTMLElement>('[data-a="report"]')!.click();
    document.querySelector<HTMLElement>('[data-a="report-kind"][data-kind="contact"]')!.click();
    await flush();
    expect(t.calls.find((c) => c.op === 'chat.report')!.args).toEqual({ msg: 'a'.repeat(24), kind: 'contact' });
    // own messages have no report button
    expect(document.querySelectorAll('.pl-chat-msg.mine [data-a="report"]')).toHaveLength(0);
  });

  it('a polled message keeps the input node, the draft and focus (the phone keyboard stays up); one poll in flight', async () => {
    const t = sheet();
    await flush();
    const input = document.querySelector<HTMLInputElement>('[data-testid="chat-input"]')!;
    input.value = 'half a thou';
    input.focus();
    t.pushSince({ mid: 'd'.repeat(24), mine: false, k: 'q', id: 2, at: '2026-11-11T10:03:00Z' });
    const p1 = t.s.poll();
    const p2 = t.s.poll();
    await Promise.all([p1, p2]);
    await flush();
    expect(t.calls.filter((c) => c.op === 'chat.since')).toHaveLength(1);
    expect(document.querySelectorAll('.pl-chat-msg')).toHaveLength(3);
    const same = document.querySelector<HTMLInputElement>('[data-testid="chat-input"]')!;
    expect(same).toBe(input);
    expect(same.value).toBe('half a thou');
    expect(document.activeElement).toBe(input);
    // toggling the phrase tray does not replace the input either
    document.querySelector<HTMLElement>('[data-a="tray"]')!.click();
    expect(document.querySelector('[data-testid="chat-tray"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="chat-input"]')).toBe(input);
    t.s.dispose();
  });

  it('a relay notice for this thread polls at once; Escape goes back', async () => {
    const t = sheet();
    await flush();
    t.s.poke('another-thread');
    await flush();
    expect(t.calls.filter((c) => c.op === 'chat.since')).toHaveLength(0);
    t.s.poke(THREAD);
    await flush();
    expect(t.calls.filter((c) => c.op === 'chat.since')).toHaveLength(1);
    t.s.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.onClose).toHaveBeenCalled();
    expect(t.s.closed).toBe(true);
  });

  it('pure helpers', () => {
    expect(bubbleText({ k: 'q', id: 12 })).toBe('Ready!');
    expect(bubbleText({ k: 's', id: 99 })).toBe('');
    const a = { mid: '1', mine: true, k: 'q' as const, id: 1, at: 2 };
    const b = { mid: '2', mine: true, k: 'q' as const, id: 1, at: 1 };
    expect(mergeMessages([a], [b, a]).map((m) => m.mid)).toEqual(['2', '1']);
  });
});
