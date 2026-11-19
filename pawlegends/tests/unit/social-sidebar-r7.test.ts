// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { ChatSheet, endsRun, msgTime } from '../../src/social/chatSheet';

/* Social sidebar round 7: keyboard focus moves into a DM, a skeleton while it loads, each run of messages has a time. */
afterEach(() => {
  document.body.innerHTML = '';
});

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function thread(opts: { autofocus?: 'input' | 'head'; hold?: boolean } = {}) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((ok) => (release = ok));
  const api = vi.fn(async (op: string): Promise<ApiResult> => {
    if (op === 'chat.open') return { id: 'x', ok: true, status: 200, body: { thread: 'dAAAAAAAAAAAAAAAAAAAAAA', tier: 'text' } };
    if (op === 'chat.history') {
      if (opts.hold) await gate;
      return {
        id: 'x',
        ok: true,
        status: 200,
        body: {
          thread: { tier: 'text', muted: false, readOnly: false },
          messages: [
            { mid: 'a'.repeat(24), mine: false, k: 't', text: 'hi', at: '2026-11-11T10:00:00Z' },
            { mid: 'b'.repeat(24), mine: false, k: 't', text: 'gg', at: '2026-11-11T10:00:20Z' },
            { mid: 'c'.repeat(24), mine: true, k: 't', text: 'yo', at: '2026-11-11T10:01:00Z' },
          ],
          more: false,
        },
      };
    }
    return { id: 'x', ok: true, status: 200, body: {} };
  });
  const onClose = vi.fn();
  const s = new ChatSheet(document.body, { api: api as never, friend: { code: 'PL-AAAA-BBBB', name: 'Mira' }, onClose, autofocus: opts.autofocus });
  return { s, onClose, release };
}

describe('social sidebar round 7', () => {
  it('a run of messages ends at a change of side or 5 minutes of quiet', () => {
    const list = [
      { at: '2026-11-11T10:00:00Z', mine: false },
      { at: '2026-11-11T10:00:20Z', mine: false },
      { at: '2026-11-11T10:01:00Z', mine: true },
      { at: '2026-11-11T10:07:00Z', mine: true },
    ];
    expect(list.map((_, i) => endsRun(list, i))).toEqual([false, true, true, true]);
    expect(msgTime(new Date(2026, 10, 11, 9, 5))).toBe('09:05');
  });

  it('loading shows a skeleton and the composer in place, then the messages with their times', async () => {
    const { s, release } = thread({ hold: true });
    await flush();
    expect(s.root.querySelectorAll('.pl-chat-skel').length).toBe(3);
    expect(s.root.querySelector('.pl-chat-list')!.getAttribute('aria-busy')).toBe('true');
    expect(s.root.textContent).not.toContain('Loading…');
    expect(s.root.querySelector('.pl-chat-form input')).toBeTruthy();
    release();
    await flush();
    await flush();
    expect(s.root.querySelectorAll('.pl-chat-skel').length).toBe(0);
    expect(s.root.querySelectorAll('[data-testid="chat-time"]').length).toBe(2);
    s.dispose();
  });

  it('keyboard: focus goes into the thread, then the composer; Tab stays inside; Esc closes the thread only', async () => {
    const { s, onClose } = thread({ autofocus: 'input' });
    expect(s.root.contains(document.activeElement)).toBe(true);
    await flush();
    await flush();
    const input = s.root.querySelector<HTMLInputElement>('input[name="chat"]')!;
    expect(document.activeElement).toBe(input);
    const last = [...s.root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')].at(-1)!;
    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(s.root.contains(document.activeElement)).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(onClose).toHaveBeenCalledWith('esc');
    expect(s.closed).toBe(true);
  });
});
