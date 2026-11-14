/**
 * The anonymous play stats consent line on the title (gaps4 first-load JS: kept apart from the Settings panel, which
 * loads when it first opens).
 */
/** One-line consent prompt (bottom of the title). */
export function consentPrompt(parent: HTMLElement, onChoice: (granted: boolean) => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'pl-consent';
  root.innerHTML = `<span>Help us tune Pawlegends with anonymous play stats?</span>
    <button class="pl-btn small" data-c="1">Sure</button><button class="pl-btn ghost small" data-c="0">No thanks</button>`;
  root.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
    if (c === undefined) return;
    root.remove();
    onChoice(c === '1');
  });
  parent.appendChild(root);
  return root;
}
