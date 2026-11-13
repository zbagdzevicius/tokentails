/**
 * The Clubs tab of the Social sheet (docs/plans/moba/CLUBS-KUDOS.md §6). Phone first and no-scroll like the other tabs:
 * no club → a generated name with a reroll die and Create, or join by code; in a club → the club card (name, code,
 * the weekly chest bar with its three tiers and Claim), the good-teammate card, and Members / Chat / Leave. Members
 * are pages of rows; the owner can remove a member (a second tap confirms). Club chat opens the DM thread sheet on the
 * club's thread (the same filter, age tiers and reports). Names are set with textContent by the sheet; every call
 * goes through the host (`api-request`).
 */
import type { ApiArgs, ApiOp, ApiResult } from '../../embed/api';
import { avatarHtml } from '../../ui/avatar';
import {
  CLUB_CHEST_TIERS,
  clubErrorText,
  clubNameArg,
  clubNameText,
  KUDOS_CHEST_TIERS,
  nextTier,
  normalClubCode,
  parseClubsState,
  rollClubName,
  untilText,
  type ClubView,
  type ClubsState,
  type KudosView,
} from './clubData';

export interface ClubsPanelDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  /** Re-render the sheet (state changed). */
  render(): void;
  /** A status line under the sheet (fades after 3 s). */
  note(text: string): void;
  /** Open the club chat over the sheet. */
  openChat(thread: string, title: string): void;
  track?(event: string, props?: Record<string, string | number | boolean>): void;
  now?(): number;
  rand?(): number;
}

type View = 'club' | 'members';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The chest bar: fill to the wins over the top tier, a pip per tier (lit once reached). Pure. */
export function chestBarHtml(wins: number, tiers: readonly number[], label: string): string {
  const top = tiers[tiers.length - 1] || 1;
  const pct = Math.min(100, Math.round((wins / top) * 100));
  const pips = tiers
    .map((t, i) => {
      const at = Math.round((t / top) * 100);
      const on = wins >= t ? ' on' : '';
      return `<i class="pl-club-pip${on}" style="left:${at}%" title="Tier ${i + 1}: ${t}"></i><small class="pl-club-tick${on}${i === tiers.length - 1 ? ' end' : ''}" style="left:${at}%">${t}</small>`;
    })
    .join('');
  return `<div class="pl-club-bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${top}" aria-valuenow="${Math.min(wins, top)}"><i class="pl-club-fill" style="width:${pct}%"></i>${pips}</div>`;
}

export class ClubsPanel {
  state: ClubsState | null = null;
  view: View = 'club';
  page = 0;
  private name: [number, number];
  private confirm: string | null = null;
  private busy = false;

  constructor(private readonly deps: ClubsPanelDeps) {
    this.name = rollClubName(deps.rand);
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  async load(): Promise<void> {
    const r = await this.deps.api('club.get');
    const s = r.ok ? parseClubsState(r.body) : null;
    if (s) this.state = s;
    else if (!r.ok) {
      this.state = this.state ?? { club: null, kudos: null };
      this.deps.note(clubErrorText((r.body as { code?: string } | undefined)?.code, r.status));
    }
  }

  private async act(op: ApiOp, args: ApiArgs, ok: (s: ClubsState) => string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await this.deps.api(op, args);
      const s = r.ok ? parseClubsState(r.body) : null;
      if (s) {
        this.state = s;
        this.deps.note(ok(s));
      } else this.deps.note(clubErrorText((r.body as { code?: string } | undefined)?.code, r.status));
    } finally {
      this.busy = false;
      this.confirm = null;
      this.deps.render();
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Markup

  body(per: number): string {
    const s = this.state;
    if (!s) return `<p class="pl-social-empty">Loading…</p>`;
    if (!s.club) return this.noClubBody(s.kudos);
    if (this.view === 'members') return this.membersBody(s.club, per);
    return this.clubBody(s.club, s.kudos);
  }

  footer(per: number): string {
    const s = this.state;
    if (!s) return '';
    if (!s.club)
      return `<form class="pl-social-add pl-club-join"><input name="club" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CL-XXXXXX" aria-label="Club code" inputmode="text" data-testid="club-code"><button type="submit" class="pl-btn small" data-testid="club-join">Join</button></form>`;
    if (this.view === 'members') {
      const pages = Math.max(1, Math.ceil(s.club.members.length / per));
      const page = Math.min(this.page, pages - 1);
      const pager = pages > 1 ? `<span class="pl-pager"><button type="button" class="pl-btn ghost small" data-club="prev" aria-label="Previous page"${page <= 0 ? ' disabled' : ''}>&lsaquo;</button><small>${page + 1}/${pages}</small><button type="button" class="pl-btn ghost small" data-club="next" aria-label="Next page"${page >= pages - 1 ? ' disabled' : ''}>&rsaquo;</button></span>` : '';
      return `<button type="button" class="pl-btn ghost small" data-club="back">&lsaquo; Club</button>${pager}`;
    }
    const leave = this.confirm === 'leave' ? 'Tap to leave' : 'Leave';
    return `<button type="button" class="pl-btn ghost small" data-club="members" data-testid="club-members">Members <b>${s.club.size}/${s.club.cap}</b></button><button type="button" class="pl-btn small" data-club="chat" data-testid="club-chat">💬 Chat</button><button type="button" class="pl-btn ghost small pl-club-leave${this.confirm === 'leave' ? ' armed' : ''}" data-club="leave" data-testid="club-leave">${leave}</button>`;
  }

  private kudosHtml(k: KudosView | null): string {
    if (!k) return '';
    const t = nextTier(k.tiers?.length ? k.tiers : KUDOS_CHEST_TIERS, k.n);
    const line = t ? `${k.n}/${t.need} thumbs-ups · next: <b data-name="${esc(k.next.name)}"></b>` : `All ${k.tiers.length} chests opened this month`;
    return `<div class="pl-club-kudos" data-testid="club-kudos"><span class="pl-club-thumb" aria-hidden="true">👍</span><span class="pl-club-kt"><b>Good teammate</b><small>${line}</small></span>${chestBarHtml(k.n, k.tiers?.length ? k.tiers : KUDOS_CHEST_TIERS, 'Good teammate chest')}</div>`;
  }

  private noClubBody(k: KudosView | null): string {
    const name = clubNameText(this.name[0], this.name[1]);
    return `<div class="pl-club-intro"><p class="pl-club-lede"><b>Clubs</b> · up to 30 players, one chat, and a weekly chest your wins fill.</p><div class="pl-club-make"><button type="button" class="pl-btn ghost small pl-club-die" data-club="roll" aria-label="Another name" data-testid="club-roll">🎲</button><span class="pl-club-newname" data-name="${esc(name)}" data-testid="club-name"></span><button type="button" class="pl-btn small" data-club="create" data-testid="club-create">Create</button></div><small class="pl-club-hint">Or join a friend's club with its code below.</small></div>${this.kudosHtml(k)}`;
  }

  private clubBody(c: ClubView, k: KudosView | null): string {
    const ch = c.chest;
    const left = untilText(new Date(ch.endsAt).getTime() - this.now());
    const t = nextTier(ch.tiers?.length ? ch.tiers : CLUB_CHEST_TIERS, ch.wins);
    const claim = ch.open > 0 ? `<button type="button" class="pl-btn small pl-club-claim" data-club="claim" data-testid="club-claim">Open chest${ch.open > 1 ? ` ×${ch.open}` : ''}</button>` : '';
    const sub = ch.open > 0 ? 'Yours' : ch.mine > 0 ? `You added ${ch.mine} ${ch.mine === 1 ? 'win' : 'wins'}` : 'Win a party or PvP match to join in';
    const goal = t ? `${ch.wins}/${t.need} wins` : `${ch.wins} wins · all tiers reached`;
    const quick = c.tier === 'quick' ? ' · quick chat' : '';
    return `<div class="pl-club-card" data-testid="club-card"><div class="pl-club-head"><span class="pl-club-crest" aria-hidden="true">${esc(c.name.slice(0, 1))}</span><span class="pl-club-id"><b class="pl-club-name" data-name="${esc(c.name)}"></b><small><span class="pl-club-code" data-testid="club-code-text">${esc(c.code)}</span>${quick}</small></span><button type="button" class="pl-btn ghost small" data-club="copy" aria-label="Copy club code">Copy</button></div><div class="pl-club-chest"><div class="pl-club-ct"><b>Club chest</b><small>${goal} · resets in ${esc(left)}</small></div>${chestBarHtml(ch.wins, ch.tiers?.length ? ch.tiers : CLUB_CHEST_TIERS, 'Club chest')}<div class="pl-club-cf"><small>${sub} · next: <b data-name="${esc(ch.next.name)}"></b></small>${claim}</div></div></div>${this.kudosHtml(k)}`;
  }

  private membersBody(c: ClubView, per: number): string {
    const pages = Math.max(1, Math.ceil(c.members.length / per));
    this.page = Math.min(this.page, pages - 1);
    const rows = c.members.slice(this.page * per, this.page * per + per);
    return rows
      .map((m) => {
        const role = m.owner ? '<small class="pl-social-st pl-club-owner">Owner</small>' : '';
        const wins = `<small class="pl-social-st">${m.wins} ${m.wins === 1 ? 'win' : 'wins'}</small>`;
        const armed = this.confirm === `rm:${m.mid}`;
        const rm = c.owner && !m.you ? `<button type="button" class="pl-btn ghost small${armed ? ' armed' : ''}" data-club="remove" data-mid="${esc(m.mid)}" aria-label="${esc(`Remove ${m.name}`)}">${armed ? 'Sure?' : 'Remove'}</button>` : '';
        return `<div class="pl-social-row${m.you ? ' me' : ''}" data-testid="club-member">${avatarHtml(m.av, 32)}<span class="pl-social-name" data-name="${esc(m.you ? `${m.name} (you)` : m.name)}"></span>${role}${wins}${rm}</div>`;
      })
      .join('');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Actions

  /** A `data-club` click; true when handled. */
  click(el: HTMLElement): boolean {
    const a = el.dataset.club;
    if (!a || el.hasAttribute('disabled')) return false;
    const c = this.state?.club;
    switch (a) {
      case 'roll':
        this.name = rollClubName(this.deps.rand);
        this.deps.render();
        return true;
      case 'create':
        this.deps.track?.('club_create');
        void this.act('club.create', { name: clubNameArg(this.name) }, (s) => (s.club ? `Welcome to ${s.club.name}` : ''));
        return true;
      case 'copy':
        if (c) {
          void (typeof navigator !== 'undefined' ? navigator.clipboard?.writeText(c.code) : undefined)?.catch(() => undefined);
          this.deps.note('Club code copied');
        }
        return true;
      case 'members':
        this.view = 'members';
        this.page = 0;
        this.confirm = null;
        this.deps.render();
        return true;
      case 'back':
        this.view = 'club';
        this.confirm = null;
        this.deps.render();
        return true;
      case 'prev':
      case 'next':
        this.page = Math.max(0, this.page + (a === 'next' ? 1 : -1));
        this.deps.render();
        return true;
      case 'chat':
        if (c) {
          this.deps.track?.('club_chat');
          this.deps.openChat(c.thread, c.name);
        }
        return true;
      case 'claim':
        this.deps.track?.('club_claim');
        void this.act('club.claim', {}, (s) => (s.got?.length ? `Chest: ${s.got.map((g) => g.name).join(', ')}` : 'Nothing new in the chest'));
        return true;
      case 'leave':
        if (this.confirm !== 'leave') {
          this.confirm = 'leave';
          this.deps.render();
          return true;
        }
        this.deps.track?.('club_leave');
        this.view = 'club';
        void this.act('club.leave', {}, () => 'You left the club');
        return true;
      case 'remove': {
        const mid = el.dataset.mid ?? '';
        if (!mid) return true;
        if (this.confirm !== `rm:${mid}`) {
          this.confirm = `rm:${mid}`;
          this.deps.render();
          return true;
        }
        this.deps.track?.('club_remove');
        void this.act('club.remove', { to: mid }, () => 'Removed from the club');
        return true;
      }
    }
    return false;
  }

  /** The join form. */
  async join(raw: string): Promise<void> {
    const code = normalClubCode(raw.trim());
    if (!code) {
      this.deps.note('Check the club code');
      this.deps.render();
      return;
    }
    this.deps.track?.('club_join');
    await this.act('club.join', { code }, (s) => (s.club ? `Welcome to ${s.club.name}` : ''));
  }
}
