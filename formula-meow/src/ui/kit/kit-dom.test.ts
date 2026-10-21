// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { focusNav, keepFocus, modal, modalOpen, tabTarget } from './index';

afterEach(() => {
  document.body.innerHTML = '';
});

function tab(shift = false): void {
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true }));
}

describe('kit dialogs own the focus', () => {
  it('tabTarget wraps and pulls an outside focus in', () => {
    expect(tabTarget(3, 2, false)).toBe(0);
    expect(tabTarget(3, 0, true)).toBe(2);
    expect(tabTarget(3, -1, false)).toBe(0);
    expect(tabTarget(3, -1, true)).toBe(2);
    expect(tabTarget(0, -1, false)).toBe(-1);
  });

  it('while "Quit the cup?" is up, modalOpen() holds and Tab never leaves it for ☰ or the pause screen', async () => {
    const menu = document.createElement('button');
    menu.className = 'fm-menu-btn';
    const pause = document.createElement('div');
    pause.dataset.uiLayer = '';
    const resume = document.createElement('button');
    pause.append(resume);
    document.body.append(menu, pause);
    const stopPause = focusNav(pause);
    expect(modalOpen()).toBe(false);
    const answer = modal('Quit the cup?', 'Progress is lost.', ['Keep racing', 'Quit']);
    expect(modalOpen()).toBe(true);
    const dlg = document.querySelector('.fm-ui-modal')!;
    const btns = [...dlg.querySelectorAll('button')];
    expect(document.activeElement).toBe(btns[0]);
    for (let i = 0; i < 6; i++) {
      tab(i % 2 === 1);
      expect(dlg.contains(document.activeElement)).toBe(true);
    }
    // focus lost to the body (a click on the backdrop): Tab comes back into the dialog, not to ☰
    (document.activeElement as HTMLElement).blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(dlg.contains(document.activeElement)).toBe(true);
    btns[1].click();
    expect(await answer).toBe(1);
    expect(modalOpen()).toBe(false);
    // the screen layer under it traps Tab too once it is the top: ☰ is out of reach
    resume.focus();
    tab();
    expect(document.activeElement).toBe(resume);
    stopPause();
  });
});

describe('keepFocus', () => {
  it('a chip screen that rebuilds on a pick keeps the focus on the picked chip', () => {
    const scope = document.createElement('div');
    document.body.append(scope);
    let sel = 'a';
    const build = () => {
      scope.innerHTML = '';
      for (const id of ['a', 'b', 'c']) {
        const b = document.createElement('button');
        b.dataset.act = `track-${id}`;
        b.className = id === sel ? 'sel' : '';
        scope.append(b);
      }
    };
    build();
    const b = scope.querySelector<HTMLElement>('[data-act="track-b"]')!;
    b.focus();
    sel = 'b';
    keepFocus(scope, build);
    expect(b.isConnected).toBe(false);
    expect((document.activeElement as HTMLElement).dataset.act).toBe('track-b');
    expect(document.activeElement).not.toBe(document.body);
  });
});
