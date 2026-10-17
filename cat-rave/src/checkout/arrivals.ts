/**
 * F-CHECKOUT: the arrivals list. Rows are the data lane's `RaveOrderView` (orders.recent()), typed
 * here structurally so this module does not depend on src/data. Names and handles go in with
 * textContent only; the X link is rebuilt from a re-checked handle by xLink(); the tx link is used
 * only when it is an https URL.
 */
import { namesSummary } from './names';
import { xLink } from './xhandle';

export interface ArrivalView {
  orderId: string;
  cats: number;
  x: string | null;
  status: string;
  phase: 'arriving' | 'landed';
  delayed?: boolean;
  payoutUrl: string | null;
  previewNames: string[];
  mine?: boolean;
}

export interface ArrivalsList {
  el: HTMLElement;
  update(rows: readonly ArrivalView[]): void;
  destroy(): void;
}

const httpsOnly = (u: string | null | undefined): string | null => {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

/** The status chip text for a row. */
export function arrivalChip(row: Pick<ArrivalView, 'phase' | 'status' | 'delayed'>): { text: string; tone: 'arriving' | 'onchain' | 'landed' | 'slow' } {
  if (row.phase === 'landed') return { text: 'dancing 🪩', tone: 'landed' };
  if (row.status === 'onchain') return { text: 'on-chain ✓', tone: 'onchain' };
  if (row.delayed) return { text: 'arriving · payout delayed', tone: 'slow' };
  if (row.status === 'pending') return { text: 'arriving · confirming', tone: 'arriving' };
  return { text: 'arriving', tone: 'arriving' };
}

export function createArrivalsList(opts: { title?: string; max?: number; doc?: Document } = {}): ArrivalsList {
  const doc = opts.doc ?? document;
  const max = opts.max ?? 8;
  const el = doc.createElement('section');
  el.className = 'rvc-arrivals';
  el.setAttribute('aria-label', opts.title ?? 'Arrivals');
  const head = doc.createElement('h3');
  head.className = 'rvc-arrivals-h';
  head.textContent = opts.title ?? 'Arrivals';
  const list = doc.createElement('ol');
  list.className = 'rvc-arrivals-list';
  el.append(head, list);
  el.hidden = true;

  const row = (r: ArrivalView) => {
    const li = doc.createElement('li');
    li.className = `rvc-arr${r.mine ? ' rvc-arr-mine' : ''}`;
    li.dataset.order = r.orderId;
    const ico = doc.createElement('span');
    ico.className = `rvc-arr-ico rvc-tone-${r.phase === 'landed' ? 'landed' : 'arriving'}`;
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = r.phase === 'landed' ? '🐈' : '🛸';
    const body = doc.createElement('span');
    body.className = 'rvc-arr-body';
    const names = doc.createElement('b');
    names.className = 'rvc-arr-names';
    names.textContent = namesSummary(r.previewNames, r.cats);
    const meta = doc.createElement('small');
    meta.className = 'rvc-arr-meta';
    meta.append(doc.createTextNode(`${r.cats.toLocaleString('en-US')} ${r.cats === 1 ? 'cat' : 'cats'}`));
    const link = xLink(r.x, doc);
    if (link) meta.append(doc.createTextNode(' · '), link);
    if (r.mine) meta.append(doc.createTextNode(' · yours'));
    body.append(names, meta);
    const c = arrivalChip(r);
    const href = httpsOnly(r.payoutUrl);
    const chip = doc.createElement(href ? 'a' : 'span') as HTMLAnchorElement;
    chip.className = `rvc-chip rvc-tone-${c.tone}`;
    chip.textContent = c.text;
    if (href) {
      chip.href = href;
      chip.target = '_blank';
      chip.rel = 'noopener';
      chip.title = 'View the payout on the explorer';
    }
    li.append(ico, body, chip);
    return li;
  };

  return {
    el,
    update(rows) {
      const shown = rows.filter((r) => r && r.cats > 0).slice(0, max);
      list.replaceChildren(...shown.map(row));
      el.hidden = shown.length === 0;
    },
    destroy() {
      el.remove();
    },
  };
}
