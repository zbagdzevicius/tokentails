/**
 * The PvP report button (docs/plans/moba/SOCIAL-RANKED.md §8.1, §8.2): a flag on every human row but your own, in the
 * in-match scoreboard and on the results screen. One tap opens four reason chips; one tap on a chip sends the report
 * (no confirm), the flag turns into a check and the toast says "Thanks. We review every report." One report per player
 * per match: the client disables the flag, the server enforces it. DOM only while the scoreboard or results are open;
 * nothing renders per frame.
 *
 * REPORT_REASONS mirrors `backend/src/pawlegends/social/report.contracts.ts` (tests/unit/report-reasons.test.ts).
 */

export const REPORT_REASONS = ['afk', 'grief', 'cheat', 'name'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_LABELS: Readonly<Record<ReportReason, string>> = Object.freeze({
  afk: 'AFK',
  grief: 'Griefing',
  cheat: 'Cheating / map hack',
  name: 'Offensive name',
});

export const REPORT_THANKS = 'Thanks. We review every report.';

export type ReportOutcome = 'sent' | 'already' | 'failed';

/** Sends one report through the host (`api-request` op `report.send`); resolves how it went. */
export type ReportSend = (slot: number, reason: ReportReason, tick: number | null) => Promise<ReportOutcome>;

/**
 * The reports of one match, by slot (the flag's checked state for the scoreboard and the results). A failed send frees
 * the flag again so the player can retry.
 */
export class ReportBook {
  private readonly state = new Map<number, 'sending' | 'done'>();

  constructor(
    readonly room: string,
    private readonly send: ReportSend,
  ) {}

  done(slot: number): boolean {
    return this.state.has(slot);
  }

  /** Sends at most once per slot; resolves the outcome (a repeat answers 'already' without a call). */
  async report(slot: number, reason: ReportReason, tick: number | null): Promise<ReportOutcome> {
    if (this.state.has(slot)) return 'already';
    this.state.set(slot, 'sending');
    let out: ReportOutcome;
    try {
      out = await this.send(slot, reason, tick);
    } catch {
      out = 'failed';
    }
    if (out === 'failed') this.state.delete(slot);
    else this.state.set(slot, 'done');
    return out;
  }
}

/** Who gets a flag: a human (named) seat that is not yours. Bots have no name. Pure. */
export function reportable(slot: number, mySlot: number, names: readonly (string | null | undefined)[]): boolean {
  return slot !== mySlot && typeof names[slot] === 'string' && (names[slot] as string).length > 0;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The flag button of a row (44 px target), or its checked twin. */
export function flagHtml(slot: number, name: string, done: boolean): string {
  return done
    ? `<button type="button" class="pl-flag done" data-report="${slot}" disabled aria-label="${esc(`Reported ${name}`)}" title="Reported">&#10003;</button>`
    : `<button type="button" class="pl-flag" data-report="${slot}" aria-label="${esc(`Report ${name}`)}" title="Report">&#9873;</button>`;
}

let open: { el: HTMLElement; off: () => void } | null = null;

/** Close the popover (any outside touch, a joystick or an ability press, Esc). */
export function closeReportPopover(): void {
  if (!open) return;
  open.off();
  open.el.remove();
  open = null;
}

/**
 * The four reason chips (2×2, 44 px tall) anchored to `anchor`; a chip tap calls `onPick` and closes. Any pointerdown
 * outside closes it without sending (the match keeps running underneath).
 */
export function reportPopover(anchor: HTMLElement, name: string, onPick: (reason: ReportReason) => void): HTMLElement {
  closeReportPopover();
  const doc = anchor.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'pl-report-pop';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `Report ${name}`);
  const title = doc.createElement('p');
  title.className = 'pl-report-title';
  title.textContent = `Report ${name}`;
  el.appendChild(title);
  const grid = doc.createElement('div');
  grid.className = 'pl-report-chips';
  for (const reason of REPORT_REASONS) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'pl-report-chip';
    b.dataset.reason = reason;
    b.textContent = REPORT_LABELS[reason];
    grid.appendChild(b);
  }
  el.appendChild(grid);
  const r = anchor.getBoundingClientRect();
  const vw = doc.documentElement.clientWidth || 360;
  const vh = doc.documentElement.clientHeight || 640;
  el.style.position = 'fixed';
  el.style.zIndex = '60';
  el.style.right = `${Math.max(8, Math.round(vw - r.right))}px`;
  if (r.bottom + 120 < vh) el.style.top = `${Math.round(r.bottom + 4)}px`;
  else el.style.bottom = `${Math.max(8, Math.round(vh - r.top + 4))}px`;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    const reason = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-reason]')?.dataset.reason as ReportReason | undefined;
    if (!reason) return;
    e.stopPropagation();
    closeReportPopover();
    onPick(reason);
  });
  const outside = (e: Event) => {
    if (!el.contains(e.target as Node)) closeReportPopover();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeReportPopover();
  };
  // next tick: the tap that opened it must not close it
  const t = setTimeout(() => {
    doc.addEventListener('pointerdown', outside, true);
    doc.addEventListener('keydown', onKey, true);
  }, 0);
  doc.body.appendChild(el);
  open = {
    el,
    off: () => {
      clearTimeout(t);
      doc.removeEventListener('pointerdown', outside, true);
      doc.removeEventListener('keydown', onKey, true);
    },
  };
  return el;
}

/** Maps an `api-result` of `report.send` to the outcome: 201 sent, 200 already, anything else failed. Pure. */
export function reportOutcomeOf(r: { ok: boolean; status: number; body?: unknown }): ReportOutcome {
  if (!r.ok) return r.status === 400 || r.status === 404 ? 'already' : 'failed';
  return r.status === 201 ? 'sent' : 'already';
}

/** A short toast outside a match (the results screen has no rail): 44 px, 2.5 s, polite live region. */
export function reportToast(doc: Document, text: string, ms = 2500): HTMLElement {
  doc.querySelector('.pl-report-toast')?.remove();
  const el = doc.createElement('div');
  el.className = 'pl-report-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = text;
  doc.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}
