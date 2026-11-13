/**
 * Good-teammate kudos on the PvP results screen (docs/plans/moba/CLUBS-KUDOS.md §5): one 👍 per human teammate, one
 * tap, no confirm. The server checks everything again (the stored room, same team, not a pre-made party mate,
 * registered, blocks) and answers once per teammate per match; a party mate's button reads "Party mate" after the
 * server says so. Received thumbs-ups fill the player's monthly good-teammate chest (the Clubs tab shows it). DOM only
 * while the results screen is open; names are set with textContent.
 */
import type { ApiResult } from '../embed/api';

export interface KudosMate {
  slot: number;
  name: string;
}

/**
 * The human teammates a player can thumb: same team, not the player, a named (human) seat. `slots` is the room's seat
 * count (6 on Crossing, 10 on Hearthwood); a team is the first or the second half. Pure.
 */
export function kudosMates(mySlot: number, names: readonly (string | null | undefined)[], slots: number): KudosMate[] {
  const size = slots >= 10 ? 5 : 3;
  const team = (s: number) => (s >= size ? 1 : 0);
  const out: KudosMate[] = [];
  for (let s = 0; s < slots; s++) {
    const n = names[s];
    if (s === mySlot || team(s) !== team(mySlot) || typeof n !== 'string' || !n) continue;
    out.push({ slot: s, name: n });
  }
  return out;
}

export type KudosOutcome = 'sent' | 'premade' | 'failed';

/** What a `kudos.give` answer means for the button. Pure. */
export function kudosOutcome(r: ApiResult): KudosOutcome {
  if (r.ok) return 'sent';
  const code = (r.body as { code?: string } | undefined)?.code;
  return code === 'PAWLEGENDS_KUDOS_PREMADE' ? 'premade' : 'failed';
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface KudosRowOpts {
  mates: readonly KudosMate[];
  send(slot: number): Promise<ApiResult>;
  track?(event: string, props?: Record<string, string | number | boolean>): void;
}

/** Fills the results screen's kudos slot (`[data-slot="kudos"]`); nothing when there is no slot or no teammate. */
export function mountKudos(results: HTMLElement, o: KudosRowOpts): HTMLElement | null {
  const slot = results.querySelector<HTMLElement>('[data-slot="kudos"]');
  if (!slot || !o.mates.length) return null;
  const row = results.ownerDocument.createElement('div');
  row.className = 'pl-kudos';
  row.dataset.testid = 'kudos-row';
  row.innerHTML = `<p class="pl-kudos-q"><b>Good teammates?</b><small>A thumbs-up fills their monthly chest</small></p><div class="pl-kudos-list">${o.mates
    .map((m) => `<button type="button" class="pl-btn ghost small pl-kudos-btn" data-kudos="${m.slot}" aria-label="${esc(`Thumbs-up for ${m.name}`)}"><span aria-hidden="true">👍</span><span class="pl-kudos-name" data-name="${esc(m.name)}"></span></button>`)
    .join('')}</div>`;
  for (const el of row.querySelectorAll<HTMLElement>('[data-name]')) el.textContent = el.dataset.name ?? '';
  row.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-kudos]');
    if (!b || b.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const s = Number(b.dataset.kudos);
    const mate = o.mates.find((m) => m.slot === s);
    if (!mate) return;
    b.disabled = true;
    b.classList.add('sending');
    void o
      .send(s)
      .catch(() => ({ id: 'x', ok: false, status: 0 }) as ApiResult)
      .then((r) => {
        const out = kudosOutcome(r);
        b.classList.remove('sending');
        o.track?.('kudos_give', { outcome: out });
        if (out === 'failed') {
          b.disabled = false;
          b.classList.add('retry');
          b.setAttribute('aria-label', `Thumbs-up for ${mate.name}: not sent, tap to retry`);
          return;
        }
        b.classList.add(out === 'sent' ? 'done' : 'mate');
        const label = b.querySelector<HTMLElement>('.pl-kudos-name');
        if (label) label.textContent = out === 'sent' ? `${mate.name} ✓` : `${mate.name} · party mate`;
        b.setAttribute('aria-label', out === 'sent' ? `Thumbs-up sent to ${mate.name}` : `${mate.name} is a party mate`);
      });
  });
  slot.replaceWith(row);
  return row;
}
