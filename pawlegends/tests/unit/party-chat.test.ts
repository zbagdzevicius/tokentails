// @vitest-environment happy-dom
/**
 * Party and team chat (CHAT-AVATARS.md §6.3): shown on the lobby, pick and results of a PROTO 5 party only; the strip
 * collapses with an unread count; phrases by scope (team phrases with strangers); text input only for a `text` tier;
 * lines from blocked members are hidden; names and text by textContent; rejects show the reason class.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PartyView } from '../../src/net/proto';
import { PartyChat, chatScopeOf, rejectCode, textAllowed } from '../../src/party/ui/partyChat';

afterEach(() => {
  document.body.innerHTML = '';
});

const view = (over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: 'ABCDEF',
  phase: 'lobby',
  leader: 'm1',
  difficulty: 'easy',
  openSeats: false,
  locked: false,
  members: [
    { id: 'm1', name: 'Mira', guest: false, conn: 'on', av: { i: 'h:clem' } },
    { id: 'm2', name: '<b>Sunny</b>', guest: false, conn: 'on' },
    { id: 'm3', name: 'Blocked Bob', guest: false, conn: 'on' },
  ],
  you: 'm1',
  chat: { tier: 'text', thread: 'pAAAAAAAAAAAAAAAAAAAAAA' },
  ...over,
});

function chat(wide = false) {
  const sent: unknown[] = [];
  const report = vi.fn(async () => true);
  const c = new PartyChat(document.body, { send: (m) => sent.push(m), report, hideNames: () => false, wide: () => wide });
  return { c, sent, report };
}

describe('party chat', () => {
  it('shows only on the lobby, pick and results of a PROTO 5 party', () => {
    const { c } = chat();
    c.sync(view(), 'lobby');
    expect(c.el.hidden).toBe(false);
    c.sync(view({ phase: 'loading' }), 'loading');
    expect(c.el.hidden).toBe(true);
    c.sync(view({ chat: undefined }), 'lobby');
    expect(c.el.hidden).toBe(true);
  });

  it('collapsed strip counts unread; opened, it lists lines as text and sends phrases and text', () => {
    const { c, sent } = chat();
    c.sync(view(), 'lobby');
    c.onFrame({ t: 'chat.msg', mid: 'a'.repeat(24), from: 'm2', k: 't', text: '<img src=x>', at: 1 });
    expect(c.el.querySelector('[data-testid="party-chat-strip"] .pl-chat-unread')!.textContent).toBe('1');
    c.el.querySelector<HTMLElement>('[data-a="toggle"]')!.click();
    const line = c.el.querySelector('.pp-chat-line')!;
    expect(line.querySelector('.pp-chat-name')!.textContent).toBe('<b>Sunny</b>');
    // the text never becomes markup: the only picture is the sender's painted hero face (ui/art.ts)
    expect(line.querySelector('img:not([src*="/assets/faces/"])')).toBeNull();
    c.el.querySelector<HTMLElement>('[data-a="say"]')!.click();
    expect(sent[0]).toMatchObject({ t: 'chat.say', k: 'q' });
    const input = c.el.querySelector<HTMLInputElement>('[data-testid="party-chat-input"]')!;
    input.value = 'gg';
    c.el.querySelector<HTMLFormElement>('form')!.requestSubmit();
    expect(sent[1]).toEqual({ t: 'chat.say', k: 't', text: 'gg' });
  });

  it('quick tier and strangers: no input, team phrases', () => {
    const v = view({ chat: { tier: 'quick', thread: 'pAAAAAAAAAAAAAAAAAAAAAA' } });
    expect(textAllowed(v)).toBe(false);
    const team = view({ mm: { side: 'cat', strangers: true } });
    expect(textAllowed(team)).toBe(false);
    expect(chatScopeOf(team)).toBe('team');
    const { c } = chat(true);
    c.sync(team, 'pick');
    expect(c.el.querySelector('[data-testid="party-chat-input"]')).toBeNull();
    expect(c.el.textContent).toContain('Team chat');
    expect(c.el.textContent).not.toContain('Wanna play?');
  });

  it('hides blocked members; rejects show the reason class', () => {
    const { c } = chat(true);
    c.sync(view({ blocks: ['m3'] }), 'lobby');
    c.onFrame({ t: 'chat.msg', mid: 'b'.repeat(24), from: 'm3', k: 'q', id: 12, at: 1 });
    expect(c.el.querySelectorAll('.pp-chat-line')).toHaveLength(0);
    c.onFrame({ t: 'chat.reject', why: 'contact' });
    expect(c.el.querySelector('.pl-chat-err')!.textContent).toContain('no contact details');
    expect(rejectCode('rate')).toBe('chat_rate');
    expect(rejectCode('words')).toBe('chat_rejected');
  });

  it('reports a line by id', async () => {
    const { c, report } = chat(true);
    c.sync(view(), 'lobby');
    c.el.querySelector<HTMLElement>('[data-a="toggle"]')!.click();
    c.onFrame({ t: 'chat.msg', mid: 'c'.repeat(24), from: 'm2', k: 'q', id: 12, at: 1 });
    c.el.querySelector<HTMLElement>('[data-a="report"]')!.click();
    c.el.querySelector<HTMLElement>('[data-a="report-kind"][data-kind="harass"]')!.click();
    expect(report).toHaveBeenCalledWith('c'.repeat(24), 'harass');
  });

  it('a party re-render keeps the text input node and its draft (picks and presence re-render every frame)', () => {
    const { c } = chat(true);
    c.sync(view(), 'lobby');
    c.el.querySelector<HTMLElement>('[data-a="toggle"]')!.click();
    const input = c.el.querySelector<HTMLInputElement>('[data-testid="party-chat-input"]')!;
    input.value = 'gg wp';
    input.focus();
    // a presence change re-renders the lobby
    c.sync(view({ members: view().members.map((m) => (m.id === 'm2' ? { ...m, conn: 'away' as const } : m)) }), 'lobby');
    c.onFrame({ t: 'chat.msg', mid: 'e'.repeat(24), from: 'm2', k: 'q', id: 1, at: 2 });
    const same = c.el.querySelector<HTMLInputElement>('[data-testid="party-chat-input"]')!;
    expect(same).toBe(input);
    expect(same.value).toBe('gg wp');
    expect(document.activeElement).toBe(input);
    expect(c.el.querySelectorAll('.pp-chat-line')).toHaveLength(1);
  });

  it('starts collapsed everywhere (desktop too); the pick folds an opened drawer back to the button', () => {
    const { c } = chat(true);
    c.sync(view(), 'lobby');
    expect(c.el.querySelector('.pp-chat-drawer')).toBeNull();
    expect(c.el.querySelector('[data-testid="party-chat-strip"]')).not.toBeNull();
    c.el.querySelector<HTMLElement>('[data-a="toggle"]')!.click();
    expect(c.el.querySelector('.pp-chat-drawer')).not.toBeNull();
    c.sync(view({ phase: 'pick' }), 'pick');
    expect(c.el.querySelector('.pp-chat-drawer')).toBeNull();
    c.sync(view({ phase: 'results' }), 'lobby');
    expect(c.el.querySelector('.pp-chat-drawer')).toBeNull();
  });
});
