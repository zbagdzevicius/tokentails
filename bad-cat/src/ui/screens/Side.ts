/** Side screens: settings and the pre-sale offer card (session ≥ 2 only, after the share; GDD 9.2). */
import type { Profile } from '../../types';
import { COPY } from '../copy';
import { btn, h } from '../dom';

export interface SettingsProps {
  settings: Profile['settings'];
  persistent: boolean;
  /** Round 3: whether a cat photo exists. Without one the photo toggle shows unticked and disabled. */
  hasPhoto?: boolean | Promise<boolean>;
  onChange(s: Profile['settings']): void;
  onBack(): void;
  /** FULL build: anonymous analytics consent (shared `tt-analytics-consent` key). Absent = row hidden. */
  consent?: { granted: boolean; onChange(granted: boolean): void };
  /** Extra rows: reminder (.ics), save code, cats, Club restore / portal... */
  actions?: { label: string; sub?: string; onClick(): void }[];
}

export function mountSettings(host: HTMLElement, p: SettingsProps): () => void {
  const s = { ...p.settings };
  const boxes = new Map<keyof Profile['settings'], HTMLInputElement>();
  const row = (label: string, key: keyof Profile['settings']): HTMLElement => {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = s[key];
    boxes.set(key, cb);
    cb.addEventListener('change', () => {
      s[key] = cb.checked;
      p.onChange({ ...s });
    });
    return h('label', { class: 'bc-toggle' }, cb, h('span', {}, label));
  };
  const photoNote = h('small', { class: 'bc-muted' });
  const setPhoto = (has: boolean): void => {
    const cb = boxes.get('showPhotoInClips');
    if (!cb) return;
    // no photo: nothing to show, so the box reads unticked (the saved choice applies once a photo exists)
    cb.disabled = !has;
    cb.checked = has && s.showPhotoInClips;
    photoNote.textContent = has ? '' : ` ${COPY.noPhotoYet}`;
  };
  const root = h(
    'div',
    { class: 'bc-screen bc-settings' },
    h('header', { class: 'bc-head' }, btn(`‹ ${COPY.back}`, p.onBack, 'bc-link'), h('h2', {}, COPY.settings)),
    h('section', { class: 'bc-card' }, row(COPY.sound, 'audio'), row(COPY.reduceMotion, 'reduceMotion'), row(COPY.showPhoto, 'showPhotoInClips'), photoNote),
    p.consent ? consentRow(p.consent) : null,
    p.actions?.length
      ? h(
          'section',
          { class: 'bc-card bc-settings-actions' },
          ...p.actions.map((a) => h('div', { class: 'bc-settings-action' }, btn(a.label, a.onClick, 'bc-cta bc-cta-soft'), a.sub ? h('small', { class: 'bc-muted' }, a.sub) : null)),
        )
      : null,
    !p.persistent ? h('p', { class: 'bc-muted bc-small' }, COPY.storageBlocked) : null,
    h('p', { class: 'bc-muted bc-small' }, COPY.controlsHelp),
  );
  host.appendChild(root);
  if (p.hasPhoto !== undefined) {
    if (typeof p.hasPhoto === 'boolean') setPhoto(p.hasPhoto);
    else {
      setPhoto(false);
      void p.hasPhoto.then(setPhoto, () => setPhoto(false));
    }
  }
  return () => root.remove();
}

export interface OfferProps {
  onPresale(): void;
  onClose(): void;
}

export function mountOffer(host: HTMLElement, p: OfferProps): () => void {
  const root = h(
    'div',
    { class: 'bc-screen bc-offer' },
    h(
      'section',
      { class: 'bc-card bc-presale' },
      h('div', { class: 'bc-logo', 'aria-hidden': 'true' }, '🐾'),
      h('h2', {}, COPY.offerTitle),
      h('p', { class: 'bc-muted' }, COPY.offerBody),
      btn(COPY.presale, p.onPresale, 'bc-cta bc-cta-gold bc-cta-big'),
      btn(COPY.notNow, p.onClose, 'bc-link'),
    ),
  );
  host.appendChild(root);
  return () => root.remove();
}

function consentRow(c: NonNullable<SettingsProps['consent']>): HTMLElement {
  const cb = h('input', { type: 'checkbox' });
  cb.checked = c.granted;
  cb.addEventListener('change', () => c.onChange(cb.checked));
  return h(
    'section',
    { class: 'bc-card' },
    h('label', { class: 'bc-toggle' }, cb, h('span', {}, 'Share anonymous play stats')),
    h('small', { class: 'bc-muted' }, 'No account, no ads. It tells us which rooms are too hard. Off by default.'),
  );
}
