/**
 * Party play on the `/pawlegends` host (docs/plans/moba/MULTIPLAYER.md §5.2, §5.3, §6): the two host jobs of a party.
 *
 * - **Tickets** (`PartyTickets`): the game asks (`party-ticket-request{id}`); the host calls
 *   `POST /pawlegends/party/ticket` with its own `accesstoken` (a guest session is created on a 428) and answers
 *   `party-ticket{id, ticket}` through the bridge, which posts only to its own iframe at the exact game origin. One
 *   request in flight and at most 10 a minute per page; a failure answers `ticket: null` (the game then plays as an
 *   unscored guest). The ticket is never stored or logged.
 * - **Results** (`PartySaves`): a party match's v:2 result goes to the one write path, `POST /user/catbassadors/live`.
 *   The backend checks it against the room log its relay stored, so there is no device queue to claim later (the
 *   ticket fixed the account when the match started): it is posted once, retried on a network or server failure
 *   (2 s, 6 s, 18 s), and its status goes back as `save-result{matchId: room}`, seen only by its owner.
 *
 * No React here: transports and timers are injected, so every rule is unit-tested.
 */
import type { MatchSaveResult, PartyTicketResult } from "@/api/user-api";
import type { PawlegendsPartyResult, PawlegendsSaveResultStatus } from "./bridge";
import { classifyPawlegendsSave, statusOf, type PawlegendsSaveDetail } from "./saves";
import { liveAnswerOf } from "./session";

export const PARTY_TICKETS_PER_MINUTE = 10;
export const PARTY_SAVE_RETRIES_MS = [2000, 6000, 18000] as const;

export interface PartyTicketsOptions {
  mint: () => Promise<PartyTicketResult>;
  answer: (id: string, ticket: string | null, error?: string) => void;
  now?: () => number;
}

export class PartyTickets {
  private busy = false;
  private times: number[] = [];
  private readonly now: () => number;

  constructor(private readonly opts: PartyTicketsOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  async request(id: string): Promise<void> {
    const now = this.now();
    this.times = this.times.filter((t) => now - t < 60_000);
    if (this.busy || this.times.length >= PARTY_TICKETS_PER_MINUTE) return this.opts.answer(id, null, "RATE_LIMITED");
    this.busy = true;
    this.times.push(now);
    try {
      const r = await this.opts.mint();
      if (r.ticket) this.opts.answer(id, r.ticket);
      else this.opts.answer(id, null, r.code ?? (r.status === 0 ? "NETWORK" : "UNAVAILABLE"));
    } catch {
      this.opts.answer(id, null, "NETWORK");
    } finally {
      this.busy = false;
    }
  }
}

export interface PartySavesOptions {
  save: (result: PawlegendsPartyResult) => Promise<MatchSaveResult>;
  onStatus: (matchId: string, status: PawlegendsSaveResultStatus, detail: PawlegendsSaveDetail) => void;
  schedule?: (fn: () => void, ms: number) => void;
}

export class PartySaves {
  private readonly seen = new Set<string>();
  private readonly schedule: (fn: () => void, ms: number) => void;

  constructor(private readonly opts: PartySavesOptions) {
    this.schedule = opts.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
  }

  /** Post one party result (a second submit of the same room on this page is ignored). */
  submit(result: PawlegendsPartyResult): Promise<void> {
    if (this.seen.has(result.room)) return Promise.resolve();
    this.seen.add(result.room);
    this.opts.onStatus(result.room, "saving", { outcome: "pending", httpStatus: 0, code: null, answer: null });
    return this.attempt(result, 0);
  }

  private async attempt(result: PawlegendsPartyResult, tries: number): Promise<void> {
    let r: MatchSaveResult;
    try {
      r = await this.opts.save(result);
    } catch {
      r = { ok: false, status: 0, code: null };
    }
    const outcome = classifyPawlegendsSave(r);
    const detail: PawlegendsSaveDetail = {
      outcome,
      httpStatus: r.status,
      code: r.code ?? null,
      answer: r.ok ? liveAnswerOf(r.body) : null,
    };
    if (outcome === "backoff" && tries < PARTY_SAVE_RETRIES_MS.length) {
      this.opts.onStatus(result.room, statusOf(outcome, r.status), detail);
      return new Promise<void>((resolve) =>
        this.schedule(() => void this.attempt(result, tries + 1).then(resolve, resolve), PARTY_SAVE_RETRIES_MS[tries])
      );
    }
    // "keep" (signed out mid-match): the ticket's account is fixed, so a later post would be refused too
    this.opts.onStatus(result.room, outcome === "keep" ? "rejected" : statusOf(outcome, r.status), detail);
  }
}
