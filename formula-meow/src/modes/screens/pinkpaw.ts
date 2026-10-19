/**
 * Pink Paw: the real shelter cats the rivals are modelled on, with their status and its date (the roster is a
 * snapshot, so the date is always shown), a link to each cat's page and to the page that shows what has been paid to
 * the shelter. No numbers or claims of our own.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { PINK_PAW_CATS, PINK_PAW_SHELTER, PINK_PAW_STATUS_AS_OF, pinkPawAdoptUrl } from '../../share/pinkpaw/pink-paw';
import { SHELTER_PAYOUTS_URL } from '../../share/links/link';
import { h } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { focusFirst, frame, hex, guardedBack } from './ui';

const STATUS: Record<string, string> = { WAITING: 'waiting for a home', RECOVERING: 'recovering', ADOPTED: 'adopted' };

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  const fr = frame(root, { title: t('Pink Paw'), sub: PINK_PAW_SHELTER, cls: 'fm-m-pinkpaw' });
  fr.body.append(h('p', { class: 'fm-line' }, [t('Your rivals are real cats from Pink Paw, a shelter in Lithuania. Their karts and coats are drawn by us; their names and statuses come from the shelter.')]));
  fr.body.append(h('p', { class: 'fm-m-note' }, [t('Statuses as of {d}. A cat may have found a home since.', { d: PINK_PAW_STATUS_AS_OF })]));
  const ul = h('ul', { class: 'fm-m-cats' });
  for (const c of PINK_PAW_CATS) {
    ul.append(
      h('li', {}, [
        h('span', { class: 'sw', 'aria-hidden': 'true' }, [h('i', { style: `background:${hex(c.base)}` }), h('i', { style: `background:${hex(c.secondary)}` })]),
        // the date is said once, in the note above (it repeated on every row)
        h('span', { class: 'nm' }, [h('b', {}, [c.name]), h('small', {}, [[t(STATUS[c.status] ?? c.status), c.bio.replace(/\s*Waiting at Pink Paw\.\s*$/, '')].filter(Boolean).join(' · ')])]),
        h('a', { class: 'fm-m-link', href: pinkPawAdoptUrl(c), target: '_blank', rel: 'noopener' }, [t('See {name}', { name: c.name })]),
      ]),
    );
  }
  fr.body.append(ul);
  fr.footer.append(h('a', { class: 'fm-btn fm-ui-btn', href: SHELTER_PAYOUTS_URL, target: '_blank', rel: 'noopener', 'data-act': 'payouts' }, [t('What the shelter has been paid ↗')]));
  focusFirst(root, 'a');
  return { back: guardedBack };
}
