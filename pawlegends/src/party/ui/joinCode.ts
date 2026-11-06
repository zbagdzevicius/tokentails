/**
 * "Join with code" (docs/plans/moba/MULTIPLAYER.md §5.3, §8, lane P5): six big monospace boxes that auto-advance,
 * take a paste of the whole code (or a whole invite link) in any box, and a Paste button (an explicit tap: no
 * silent clipboard read, since iOS prompts for it). Errors show inline under the boxes. A focused box selects its
 * letter, so typing over a wrong code just works; a letter the alphabet never uses (0, 1, I, L, O) says so.
 */
import { CODE_ALPHABET } from '../../net/proto';
import { COPY, esc } from './copy';

/** Fold typed or pasted text to code letters: upper case; anything outside the alphabet (no 0, 1, I, L, O) dropped. */
export function codeLetters(raw: string): string {
  // a pasted invite link: take its `party` value
  const m = /[?&]party=([^&#\s]+)/i.exec(raw);
  const s = (m ? m[1] : raw).toUpperCase();
  let out = '';
  for (const ch of s) if (CODE_ALPHABET.includes(ch)) out += ch;
  return out;
}

export function joinCodeHtml(error: string | null, initial = ''): string {
  const boxes: string[] = Array.from(
    { length: 6 },
    (_, i) =>
      `<input class="pp-box" data-i="${i}" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Code letter ${i + 1}" value="${esc(initial[i] ?? '')}">`,
  );
  return `<div class="pp-card pp-narrow pp-joincode">
    <h2>${COPY.joinWithCode}</h2>
    <p class="pp-dim">${COPY.enterCode}</p>
    <div class="pp-boxes" data-testid="party-code-boxes">${boxes.slice(0, 3).join('')}<span class="pp-gap" aria-hidden="true"></span>${boxes.slice(3).join('')}</div>
    ${error ? `<p class="pp-err" role="alert" data-testid="party-join-error">${esc(error)}</p>` : ''}
    <p class="pp-dim pp-skip" data-testid="party-code-skip" hidden>${COPY.codeSkipped}</p>
    <div class="pp-row"><button type="button" class="pl-btn ghost small" data-p="paste">${COPY.paste}</button><button type="button" class="pl-btn" data-p="join-code" data-testid="party-join">${COPY.join}</button></div>
    <button type="button" class="pl-btn ghost small" data-p="back">${COPY.back}</button>
  </div>`;
}

/** Wire the boxes in `root`: typing, backspace, arrows and paste. `onFull(code)` fires when all six are filled. */
export function wireCodeBoxes(root: HTMLElement, onFull: (code: string) => void): { value(): string; fill(text: string): void } {
  const boxes = [...root.querySelectorAll<HTMLInputElement>('.pp-box')];
  const value = () => boxes.map((b) => b.value).join('');
  const fill = (text: string, from = 0): void => {
    const letters = codeLetters(text);
    let i = from;
    for (const ch of letters) {
      if (i >= boxes.length) break;
      boxes[i++].value = ch;
    }
    boxes[Math.min(i, boxes.length - 1)]?.focus();
    if (value().length === 6) onFull(value());
  };
  const skip = root.querySelector<HTMLElement>('.pp-skip');
  let skipTimer: ReturnType<typeof setTimeout> | null = null;
  const skipped = (): void => {
    if (!skip) return;
    skip.hidden = false;
    if (skipTimer) clearTimeout(skipTimer);
    skipTimer = setTimeout(() => (skip.hidden = true), 2500);
  };
  boxes.forEach((b, i) => {
    b.addEventListener('focus', () => b.select());
    b.addEventListener('input', () => {
      const raw = b.value;
      let v = codeLetters(raw);
      if (raw && !v && !/[?&]party=/i.test(raw)) skipped();
      // typed into a box that already held a letter (caret after it): keep the new letter
      if (v.length === 2 && !/[?&]party=/i.test(raw) && raw.length === 2) v = v.slice(1);
      if (v.length > 1) return fill(v, i);
      b.value = v;
      if (v && i < boxes.length - 1) boxes[i + 1].focus();
      if (value().length === 6) onFull(value());
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !b.value && i > 0) {
        boxes[i - 1].value = '';
        boxes[i - 1].focus();
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      else if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
      else if (e.key === 'Enter' && value().length === 6) onFull(value());
    });
    b.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') ?? '';
      if (!text) return;
      e.preventDefault();
      fill(text, i);
    });
  });
  (boxes.find((b) => !b.value) ?? boxes[0])?.focus();
  return { value, fill: (t) => fill(t, 0) };
}
