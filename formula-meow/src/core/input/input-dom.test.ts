// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { TouchInput } from './touch';
import { KeyboardInput } from './keyboard';
import { InputMux } from './mux';
import { emptyRaw } from './raw';
import { setLocale } from '../../ui/i18n';

const racing = { racing: true, speedFrac: 0, drifting: false, curve: 0, wall: false };

function pointer(type: string, pointerType: string, target: EventTarget = window): void {
  const e = new PointerEvent(type, { pointerType, bubbles: true, clientX: 10, clientY: 10, pointerId: 1 });
  target.dispatchEvent(e);
}

afterEach(() => {
  document.body.innerHTML = '';
  setLocale('en');
});

describe('touch: auto-gas from GO without a touch on the race area', () => {
  it('a menu tap with a finger makes the player a touch player, so the mux holds the gas after GO', () => {
    const touch = new TouchInput(document.body);
    const mux = new InputMux([touch], { autoGas: false, oneThumb: true });
    // the tap on "Kibble Cup" (a menu button, not the race overlay)
    const menuBtn = document.createElement('button');
    document.body.append(menuBtn);
    pointer('pointerdown', 'touch', menuBtn);
    expect(touch.active).toBe(true);
    mux.frame(1 / 60, racing);
    expect(mux.sample(0, racing).gas).toBe(true);
    touch.dispose();
  });

  it('a mouse click is not a touch', () => {
    const touch = new TouchInput(document.body);
    pointer('pointerdown', 'mouse');
    expect(touch.active).toBe(false);
    const out = emptyRaw();
    touch.poll(out);
    expect(out.touch).toBe(false);
    touch.dispose();
    // disposed: no longer listening
    const t2 = new TouchInput(document.body);
    t2.dispose();
    pointer('pointerdown', 'touch');
    expect(t2.active).toBe(false);
  });

  it('the thumb overlay and the item button go through t()', () => {
    setLocale('xx');
    const touch = new TouchInput(document.body);
    expect(touch.root.querySelector('.fm-item-btn')!.getAttribute('aria-label')).toMatch(/^⟦/);
    expect(TouchInput.copy(true).steer).toMatch(/^⟦/);
    expect(TouchInput.copy(false).pad).toMatch(/^⟦/);
    touch.dispose();
  });
});

describe('keyboard: P resumes from the pause screen', () => {
  function layer(screen: string, el: HTMLElement): HTMLElement {
    const root = document.createElement('div');
    root.className = 'fm-overlay on fm-screen';
    root.dataset.screen = screen;
    root.dataset.uiLayer = '';
    root.append(el);
    document.body.append(root);
    return root;
  }
  function key(code: string): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'KeyP' ? 'p' : code, bubbles: true }));
  }

  it('P toggles pause while Resume has the focus', () => {
    const kb = new KeyboardInput();
    const resume = document.createElement('button');
    layer('pause', resume);
    resume.focus();
    key('KeyP');
    const out = emptyRaw();
    kb.poll(out, 1 / 60);
    expect(out.pause).toBe(true);
    kb.dispose();
  });

  it('P is a letter in a text field, and does nothing over another layer (the editor)', () => {
    const kb = new KeyboardInput();
    const input = document.createElement('input');
    layer('pause', input);
    input.focus();
    key('KeyP');
    let out = emptyRaw();
    kb.poll(out, 1 / 60);
    expect(out.pause).toBe(false);
    document.body.innerHTML = '';
    const btn = document.createElement('button');
    layer('editor', btn);
    btn.focus();
    key('KeyP');
    out = emptyRaw();
    kb.poll(out, 1 / 60);
    expect(out.pause).toBe(false);
    kb.dispose();
  });
});
