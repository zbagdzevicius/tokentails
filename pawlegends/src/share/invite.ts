/**
 * Invite and comeback codes in the Social sheet (backend `pawlegends/growth`, gaps.md S1; Wild Rift "See You on the
 * Rift"). Every registered player has a 7-character code and a link (`https://pawlegends.app/?ref=CODE`). A new friend,
 * or one away for 21+ days, accepts it (the web page redeems the link after sign-in; the code field here works in the
 * apps too), finishes 3 verified matches, and both players claim a coat here. Free: no price anywhere, so it shows in
 * the apps as well.
 *
 * The match counter is written only by the `/live` save on the server; this row only reads it, accepts a code and
 * claims. Ops go through the host's allowlist (`growth.invite`, `growth.redeem`, `growth.claim`): no token or URL in
 * the game. Pure helpers plus one small controller the sheet owns.
 */
import type { ApiArgs, ApiOp } from '../embed/api';

/** What the host answers (`api-result`). */
export interface InviteApiResult {
  ok: boolean;
  status: number;
  body?: unknown;
}

export interface InviteRowView {
  name: string;
  kind: string;
  matches: number;
  need: number;
  status: string;
  claimable: boolean;
}

export interface InviteState {
  code: string;
  link: string;
  need: number;
  invited: InviteRowView[];
  accepted: InviteRowView | null;
  claimable: number;
  nextCoat: string | null;
  earned: number;
  cap: number;
}

const CODE = /^[A-HJ-NP-Z2-9]{7}$/;
const LINK = /^https:\/\/pawlegends\.app\/\?ref=[A-HJ-NP-Z2-9]{7}$/;
const COAT = /^coat\.[a-z]+\.store_[a-z_]+$/;
const num = (v: unknown, lo = 0, hi = 1000): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : lo);
const text = (v: unknown, max = 40): string => (typeof v === 'string' ? v.slice(0, max) : '');

function rowOf(v: unknown): InviteRowView | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  return {
    name: text(r.name, 24) || 'A friend',
    kind: r.kind === 'comeback' ? 'comeback' : 'new',
    matches: num(r.matches, 0, 99),
    need: num(r.need, 1, 99) || 3,
    status: r.status === 'done' || r.status === 'expired' ? r.status : 'pending',
    claimable: r.claimable === true,
  };
}

/** `GET /pawlegends/growth/invite`, cleaned; null when it is not one. */
export function inviteStateOf(body: unknown): InviteState | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.code !== 'string' || !CODE.test(b.code)) return null;
  const link = typeof b.link === 'string' && LINK.test(b.link) ? b.link : inviteLink(b.code);
  return {
    code: b.code,
    link,
    need: num(b.need, 1, 99) || 3,
    invited: (Array.isArray(b.invited) ? b.invited : []).map(rowOf).filter((r): r is InviteRowView => !!r).slice(0, 10),
    accepted: rowOf(b.accepted),
    claimable: num(b.claimable, 0, 99),
    nextCoat: typeof b.nextCoat === 'string' && COAT.test(b.nextCoat) ? b.nextCoat : null,
    earned: num(b.earned, 0, 99),
    cap: num(b.cap, 0, 99),
  };
}

/** The share link of a code (the landing sends `?ref=` on to `/play`). */
export const inviteLink = (code: string): string => `https://pawlegends.app/?ref=${code}`;

/** The share text: what both players get, in one line. */
export const inviteText = (): string => 'Play Paw Legends with me! Finish 3 matches and we both get a coat.';

/** "Patchwork Calico coat for Clem" style name of a reward coat id (`coat.clem.store_calico`). */
export function coatLabel(id: string | null): string {
  if (!id) return 'a coat';
  const [, hero = '', rest = ''] = id.split('.');
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  return `${rest.replace(/^store_/, '').split('_').map(cap).join(' ')} coat for ${cap(hero)}`;
}

/** A typed code, cleaned, or null. */
export function cleanInviteCode(v: string): string | null {
  const c = v.replace(/[\s-]/g, '').toUpperCase();
  return CODE.test(c) ? c : null;
}

/** The server's refusal as a short line. */
export function inviteError(r: InviteApiResult): string {
  const code = (r.body as { code?: string } | undefined)?.code ?? '';
  if (r.status === 0) return 'No connection. Try again';
  if (r.status === 429) return 'Too many tries. Wait a minute';
  switch (code) {
    case 'PAWLEGENDS_INVITE_UNKNOWN':
      return 'No invite with this code';
    case 'PAWLEGENDS_INVITE_SELF':
      return 'That is your own code';
    case 'PAWLEGENDS_INVITE_USED':
      return 'You already accepted an invite';
    case 'PAWLEGENDS_INVITE_DEVICE':
      return 'This device already accepted an invite';
    case 'PAWLEGENDS_INVITE_NOT_ELIGIBLE':
      return 'Invites are for new players and players back after 21 days';
    case 'PAWLEGENDS_INVITE_FULL':
      return 'Your friend has too many open invites';
  }
  return 'Something went wrong. Try again';
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The one-line status of the invite this player accepted, or of their newest invite. */
export function inviteLine(s: InviteState): string {
  const a = s.accepted;
  if (a && a.status === 'pending') return `${a.name}'s invite: ${a.matches}/${a.need} matches`;
  const open = s.invited.find((r) => r.status === 'pending');
  if (open) return `${open.name}: ${open.matches}/${open.need} matches`;
  if (s.earned >= s.cap && s.cap > 0) return `You earned all ${s.cap} invite coats`;
  return `Invite a friend: ${s.need} matches, you both get a coat`;
}

/** The row's markup (inside the Friends tab). Names are filled by textContent through `data-name`. */
export function inviteRowHtml(s: InviteState | null, entering: boolean): string {
  if (entering)
    return `<form class="pl-social-add pl-invite-row" data-form="invite" data-testid="invite-code-form"><input name="invite" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Invite code" aria-label="Invite code" inputmode="text"><button type="submit" class="pl-btn small">Accept</button><button type="button" class="pl-btn ghost small" data-a="inv-cancel" aria-label="Cancel">&times;</button></form>`;
  if (!s) return '';
  const claim = s.claimable
    ? `<button type="button" class="pl-btn small" data-a="inv-claim" data-testid="invite-claim">Claim coat${s.claimable > 1 ? ` ×${s.claimable}` : ''}</button>`
    : '';
  const enter = !s.accepted ? `<button type="button" class="pl-btn ghost small" data-a="inv-enter" data-testid="invite-enter" aria-label="Enter an invite code">Code</button>` : '';
  return `<div class="pl-social-row pl-invite-row" data-testid="invite-row"><span class="pl-social-who"><span class="pl-social-name" data-name="${esc(inviteLine(s))}"></span><small class="pl-social-st">Your invite code <b>${esc(s.code)}</b></small></span>${claim}<button type="button" class="pl-btn ghost small" data-a="inv-share" data-testid="invite-share">Invite</button>${enter}</div>`;
}

export interface InviteDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<InviteApiResult>;
  /** Re-render the sheet. */
  render(): void;
  /** A status note in the sheet. */
  note(text: string): void;
  track?(event: string, props?: Record<string, string | number | boolean>): void;
}

/** The Social sheet's invite row: loads the state, shares the link, accepts a code and claims coats. */
export class InviteRow {
  state: InviteState | null = null;
  entering = false;

  constructor(private readonly deps: InviteDeps) {}

  async load(): Promise<void> {
    const r = await this.deps.api('growth.invite');
    if (r.ok) this.state = inviteStateOf(r.body) ?? this.state;
    this.deps.render();
  }

  html(): string {
    return inviteRowHtml(this.state, this.entering);
  }

  /** The row's buttons (`data-a` starting with `inv-`). */
  async act(a: string): Promise<void> {
    if (a === 'inv-share') return this.share();
    if (a === 'inv-enter' || a === 'inv-cancel') {
      this.entering = a === 'inv-enter';
      this.deps.render();
      return;
    }
    if (a === 'inv-claim') {
      const r = await this.deps.api('growth.claim');
      const got = r.ok ? ((r.body as { granted?: unknown[] })?.granted ?? []) : [];
      if (r.ok) {
        this.state = inviteStateOf((r.body as { state?: unknown })?.state) ?? this.state;
        this.deps.track?.('invite_claim', { coats: got.length });
        this.deps.note(got.length ? `New coat: ${coatLabel(typeof got[0] === 'string' ? got[0] : null)}` : 'You own every invite coat already');
      } else this.deps.note(inviteError(r));
      this.deps.render();
    }
  }

  async redeem(raw: string): Promise<void> {
    const code = cleanInviteCode(raw);
    if (!code) {
      this.deps.note('An invite code has 7 letters and digits');
      return this.deps.render();
    }
    const r = await this.deps.api('growth.redeem', { code });
    if (r.ok) {
      this.entering = false;
      this.state = inviteStateOf(r.body) ?? this.state;
      this.deps.track?.('invite_accept', { via: 'code' });
      this.deps.note(`Invite accepted! Finish ${this.state?.need ?? 3} matches and you both get a coat`);
    } else this.deps.note(inviteError(r));
    this.deps.render();
  }

  private async share(): Promise<void> {
    const s = this.state;
    if (!s) return;
    this.deps.track?.('invite_share');
    const nav = (typeof navigator !== 'undefined' ? navigator : null) as (Navigator & { share?: (d: ShareData) => Promise<void> }) | null;
    try {
      if (typeof nav?.share === 'function') {
        await nav.share({ url: s.link, text: inviteText(), title: 'Paw Legends' });
        return;
      }
    } catch (e) {
      // the player closed the share sheet: nothing else to do; any other failure copies instead
      if ((e as Error)?.name === 'AbortError') return;
    }
    try {
      await nav?.clipboard?.writeText(`${inviteText()} ${s.link}`);
      this.deps.note('Invite link copied');
    } catch {
      this.deps.note(`Your code: ${s.code}`);
    }
    this.deps.render();
  }
}
