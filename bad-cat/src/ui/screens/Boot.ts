/** Boot / link-intro card: logo, the room and "Be a bad cat" (GDD 8 step 1), in-app banner. */
import { COPY } from '../copy';
import { btn, h } from '../dom';

export interface BootProps {
  roomLabel?: string;
  /** "Mochi dared you: 6,375" on a dare arrival. */
  dare?: string;
  inApp: boolean;
  /** linkIntro: auto-advance after `autoMs`, or on tap. Boot: no handler. */
  onNext?: () => void;
  autoMs?: number;
}

export function mountBoot(host: HTMLElement, p: BootProps): () => void {
  const banner = p.inApp
    ? h('div', { class: 'bc-banner' }, h('span', {}, COPY.inAppBanner), btn('✕', () => banner?.remove(), 'bc-x'))
    : null;
  const root = h(
    'div',
    { class: 'bc-screen bc-boot' },
    banner,
    h(
      'div',
      { class: 'bc-boot-mid' },
      h('div', { class: 'bc-logo', 'aria-hidden': 'true' }, '🐾'),
      h('h1', { class: 'bc-title' }, COPY.title),
      p.dare ? h('div', { class: 'bc-dare-note bc-dare-intro' }, p.dare) : null,
      p.roomLabel ? h('div', { class: 'bc-room-chip' }, p.roomLabel) : null,
      h('p', { class: 'bc-tagline' }, p.onNext ? COPY.tagline : COPY.loading),
      p.onNext ? h('div', { class: 'bc-dots' }, h('i'), h('i'), h('i')) : null,
    ),
  );
  host.appendChild(root);
  let timer = 0;
  let done = false;
  const next = (): void => {
    if (done || !p.onNext) return;
    done = true;
    p.onNext();
  };
  if (p.onNext) {
    root.addEventListener('click', next);
    timer = window.setTimeout(next, p.autoMs ?? (p.dare ? 2600 : 1400));
  }
  return () => {
    done = true;
    clearTimeout(timer);
    root.remove();
  };
}
