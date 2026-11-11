// @vitest-environment happy-dom
/** The in-place morph the chat sheets render with: matching nodes survive, attributes and text follow, extras go. */
import { describe, expect, it } from 'vitest';
import { morphHtml } from '../../src/ui/morph';

describe('morphHtml', () => {
  it('keeps nodes, syncs attributes and text, appends and removes', () => {
    const root = document.createElement('div');
    morphHtml(root, '<ul><li data-x="1">a</li></ul><form><input name="q"></form><p>err</p>');
    const ul = root.querySelector('ul')!;
    const input = root.querySelector('input')!;
    input.value = 'draft';
    morphHtml(root, '<ul><li data-x="2">b</li><li>c</li></ul><form><input name="q" placeholder="Hi"></form>');
    expect(root.querySelector('ul')).toBe(ul);
    expect(root.querySelector('input')).toBe(input);
    expect(input.value).toBe('draft');
    expect(input.getAttribute('placeholder')).toBe('Hi');
    expect(ul.innerHTML).toBe('<li data-x="2">b</li><li>c</li>');
    expect(root.querySelector('p')).toBeNull();
  });

  it('fills holes before comparing and replaces a node whose tag changed', () => {
    const root = document.createElement('div');
    const fill = (t: DocumentFragment) => t.querySelectorAll<HTMLElement>('[data-name]').forEach((e) => (e.textContent = e.dataset.name ?? ''));
    morphHtml(root, '<span data-name="<b>x</b>"></span><b>1</b>', fill);
    const span = root.firstElementChild;
    morphHtml(root, '<span data-name="<b>x</b>"></span><i>2</i>', fill);
    expect(root.firstElementChild).toBe(span);
    expect(span!.textContent).toBe('<b>x</b>');
    expect(root.lastElementChild!.tagName).toBe('I');
  });
});
