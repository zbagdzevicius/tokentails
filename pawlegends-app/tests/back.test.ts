/**
 * The Android back button (src/shell/back.ts): Escape into the game everywhere except the bare title, where the app
 * goes to the background instead of quitting.
 */
import { describe, expect, it } from 'vitest';
import { backAction, handleBack, OVERLAY_SELECTOR } from '../src/shell/back';

class FakeKey {
  constructor(
    public type: string,
    public init: KeyboardEventInit,
  ) {}
}

function fakeDoc(screen: string | undefined, open: string[] = []) {
  const events: FakeKey[] = [];
  const focus = { dispatchEvent: (e: FakeKey) => void events.push(e) };
  const doc = {
    documentElement: { dataset: { screen } },
    activeElement: focus,
    body: focus,
    defaultView: { KeyboardEvent: FakeKey },
    querySelector: (sel: string) => (open.some((o) => sel.split(', ').includes(o)) ? {} : null),
  } as unknown as Document;
  return { doc, events };
}

describe('backAction', () => {
  it('escapes everywhere but the bare title', () => {
    for (const screen of ['pick', 'match', 'results']) expect(backAction({ screen, overlayOpen: false })).toBe('escape');
    expect(backAction({ screen: 'title', overlayOpen: true })).toBe('escape');
    expect(backAction({ screen: 'title', overlayOpen: false })).toBe('minimize');
    // before the game set a screen (boot): never quit, go to the background
    expect(backAction({ screen: undefined, overlayOpen: false })).toBe('minimize');
  });
  it('the overlay list covers the lobby overlays, the party panel and dialogs', () => {
    for (const s of ['.pl-menu', '[aria-modal="true"]', '.pl-store', '.pl-party', '.lb-quests[open]']) expect(OVERLAY_SELECTOR.split(', ')).toContain(s);
  });
});

describe('handleBack', () => {
  it('in a match it presses Escape (keydown, then keyup) on the focused element', () => {
    const { doc, events } = fakeDoc('match');
    let minimized = 0;
    expect(handleBack(doc, () => minimized++)).toBe('escape');
    expect(events.map((e) => e.type)).toEqual(['keydown', 'keyup']);
    expect(events[0].init).toMatchObject({ key: 'Escape', code: 'Escape', bubbles: true });
    expect(minimized).toBe(0);
  });
  it('on the title with settings open it closes them; on the bare title it minimizes', () => {
    const open = fakeDoc('title', ['[aria-modal="true"]']);
    expect(handleBack(open.doc, () => undefined)).toBe('escape');
    const bare = fakeDoc('title');
    let minimized = 0;
    expect(handleBack(bare.doc, () => minimized++)).toBe('minimize');
    expect(minimized).toBe(1);
    expect(bare.events).toEqual([]);
  });
});
