/**
 * In-match chat for one match (docs/plans/moba/MATCH-CHAT.md §4, §5.1 solo): the ticker and the drawer, the party
 * link's PROTO 6 chat (send, receive, the team tier, rejects), the wheel's lines, and in a solo match the bot chatter
 * engine (src/chat/botChatter.ts) fed from the snapshot events the announcer already reads.
 *
 * Solo: the engine is seeded with hash(match seed ⊕ a local nonce), runs on match time (ticks, so a fast e2e match
 * keeps human timing in match seconds), never touches the sim (it only reads events and the hero rows), and its lines
 * go through the same chat filter as everyone's. A solo player has no known age band, so the team is phrases only
 * (MATCH-CHAT §6.4): bots there send phrase ids. A bark and a typed line from the same bot are 10 s apart. Rookie
 * match 1 is silent. The memory of seen lines lives in `localStorage` `pl.botSeen` (try/catch).
 */
import { BotChatter, mergeSeen, pushSeen, type BotSeen } from '../chat/botChatter';
import { cuesFromEvents, heroesFromSnapshot, statesFromHeroes } from '../chat/cues';
import { hash32 } from '../chat/rng';
import { filterChatText } from '../../../shared/chat-filter';
import { CHAT_SAY_RATE, type MatchChannel } from '../net/proto';
import { chatErrorText, matchPhraseText, type ChatReportKind } from '../data/chatPhrases';
import { RELATION_CSS } from '../render/palette';
import { ChatTicker, type ChatLineView } from '../ui/chatTicker';
import { ChatDrawer, type ChatSend } from '../ui/chatDrawer';
import type { PartyLink } from './mpTypes';

export interface MatchChatHost {
  ui: HTMLElement;
  touch: boolean;
  mySlot: number;
  myTeam: 0 | 1;
  /** Seats per team (3, or 5 on Hearthwood). */
  teamSize: number;
  sides: readonly ['cat' | 'dog', 'cat' | 'dog'];
  map: string;
  /** Display names per slot (bots keep their persona names; mutes and Hide names apply). */
  names(): readonly string[];
  /** The party link (absent: a solo match, where the bot chatter runs here). */
  link: PartyLink | null;
  /** Solo: the match seed and whether bots stay quiet (Rookie match 1). */
  solo?: { seed: number; silent: boolean };
  report?(mid: string, kind: ChatReportKind): Promise<boolean>;
  mute?(slot: number): void;
  isMuted?(slot: number): boolean;
  /** Match time in ticks (30 a second). */
  tick(): number;
  e2e?: boolean;
}

const SEEN_KEY = 'pl.botSeen';
const TICK_MS = 1000 / 30;

function readSeen(): BotSeen | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const v = raw ? (JSON.parse(raw) as BotSeen) : null;
    return v && Array.isArray(v.l) && Array.isArray(v.s) ? v : null;
  } catch {
    return null;
  }
}

function writeSeen(v: BotSeen): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(v));
  } catch {
    /* storage blocked: no memory */
  }
}

function nonce(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  } catch {
    return Date.now() >>> 0;
  }
}

export class MatchChat {
  readonly ticker: ChatTicker;
  readonly drawer: ChatDrawer;
  /** Solo only: the bot chatter. */
  readonly engine: BotChatter | null = null;
  private readonly seen: BotSeen | null = null;
  private readonly sent: number[] = [];
  private lastSample = -1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offLink: (() => void) | null = null;
  private ended = false;
  private disposed = false;
  /** Players this player muted in chat for this match (bots included: nobody can tell). */
  private readonly muted = new Set<number>();

  constructor(private readonly h: MatchChatHost) {
    this.ticker = new ChatTicker(h.ui, { touch: h.touch });
    this.drawer = new ChatDrawer(h.ui, {
      touch: h.touch,
      side: h.sides[h.myTeam],
      send: (ch, body) => this.send(ch, body),
      mute: (slot: number) => {
        if (this.muted.has(slot)) this.muted.delete(slot);
        else this.muted.add(slot);
        h.mute?.(slot);
      },
      ...(h.report && h.link ? { report: (mid: string, kind: ChatReportKind) => h.report!(mid, kind) } : {}),
      onToggle: (open) => {
        if (h.e2e) document.documentElement.dataset.chatDrawer = open ? '1' : '';
      },
    });
    this.ticker.onOpen = () => this.drawer.openOn(this.drawer.channel);
    this.drawer.tier = h.link?.chatTier ?? 'quick';
    if (h.link) {
      const link = h.link;
      this.offLink = link.listen({
        chat: (m) => this.incoming(m),
        chatReject: (why, until) => this.drawer.error(chatErrorText(`chat_${why}`, why, until ? new Date(until).toISOString() : null)),
        chatTier: (t) => (this.drawer.tier = t),
      });
    } else if (h.solo) {
      // an e2e run may pin the seed (window.__plChatSeed, read only with ?e2e=1)
      const forced = h.e2e ? (globalThis as { __plChatSeed?: number }).__plChatSeed : undefined;
      const seed = forced !== undefined ? Number(forced) >>> 0 : hash32(`${h.solo.seed}:${nonce()}`);
      const seenRing = readSeen();
      const seen = seenRing ? mergeSeen([seenRing]) : null;
      this.seen = seenRing;
      this.engine = new BotChatter({
        seed,
        slots: 2 * h.teamSize,
        teamSize: h.teamSize,
        map: h.map,
        humans: [h.mySlot],
        sides: h.sides,
        silent: h.solo.silent,
        // no age band in a solo match: phrases only (MATCH-CHAT.md §6.4)
        tiers: ['quick', 'quick'],
        seen: [seen, seen],
        filter: (text) => filterChatText(text).ok,
        startMs: h.tick() * TICK_MS,
      });
    }
    this.timer = setInterval(() => this.clock(), 250);
    if (h.e2e) (window as unknown as { __plChat?: MatchChat }).__plChat = this;
    this.layout();
    addEventListener('resize', this.onResize);
  }

  private readonly onResize = (): void => this.layout();
  private layoutAt = 0;

  /**
   * Phones (§4.1): the ticker sits right under the kill feed's largest box (its rows by the same size rules as the
   * feed's CSS) and keeps its rows above the ability cluster; the drawer starts at the feed's top and stops above the
   * cluster too. Measured, not guessed: tests/e2e/chat-layout.spec.ts checks every overlap at every minimap size.
   */
  layout(): void {
    this.layoutAt = performance.now();
    if (!this.h.touch || typeof getComputedStyle !== 'function') return;
    const ui = this.h.ui;
    const H = innerHeight;
    const W = innerWidth;
    const feed = ui.querySelector<HTMLElement>('.pl-feed');
    const cs = feed ? getComputedStyle(feed) : null;
    const safeT = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-t')) || 0;
    const feedTop = cs ? parseFloat(cs.top) || 0 : 0;
    // the feed's largest box: its rows by the same size rules as its CSS (1 row on short phones or a large minimap)
    const mmL = document.documentElement.dataset.mmSize === 'l';
    const feedRows = H < 381 || mmL ? 1 : 2;
    const ROW = 21;
    let feedBottom = feedTop + feedRows * ROW + (feedRows - 1) * 4;
    // rows already in the feed may be taller than the estimate
    if (feed) for (const r of feed.querySelectorAll<HTMLElement>('.pl-feed-row')) if (getComputedStyle(r).display !== 'none') feedBottom = Math.max(feedBottom, r.getBoundingClientRect().bottom);
    const top = Math.round(feedBottom + 6 - safeT);
    ui.style.setProperty('--chat-top', `${top}px`);
    // a feed on the left half (beside the minimap, the LoL HUD) → the ticker lines up on its left edge; else right
    const fr = feed?.getBoundingClientRect();
    const left = fr ? fr.left : NaN;
    if (Number.isFinite(left) && left < W / 2) {
      ui.dataset.chatAlign = 'left';
      ui.style.setProperty('--chat-left', `${Math.round(left)}px`);
    } else delete ui.dataset.chatAlign;
    // the rows stop above the highest control under them (the ability cluster, the last-hit and tower buttons)
    const tr = this.ticker.el.getBoundingClientRect();
    const x0 = tr.width ? tr.left : W - 180;
    const x1 = tr.width ? tr.right : W;
    let floor = H;
    for (const el of ui.querySelectorAll<HTMLElement>('.pl-tbtn, .pl-tcluster, .pl-strip.enemy .pp, .pl-emote, .pl-pingbtn')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= x0 || r.left >= x1 || r.bottom <= top + safeT) continue;
      floor = Math.min(floor, r.top);
    }
    const room = floor - 6 - (top + safeT);
    this.ticker.rowsCap = Math.max(1, Math.floor((room + 3) / (ROW + 3)));
    // the drawer: the right half, left of the upper-right button column (nap, tower, last-hit, E), from the top
    // down to above whatever control lies under it (the ability cluster); never the joystick half
    const btns = [...ui.querySelectorAll<HTMLElement>('.pl-tbtn, .pl-tcluster')].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
    let colLeft = W;
    for (const r of btns) if (r.left > W / 2 && r.top < H * 0.5) colLeft = Math.min(colLeft, r.left);
    const right = Math.max(10, Math.round(W - colLeft + 6));
    const width = Math.max(180, Math.min(360, Math.round(W * 0.46), Math.round(W - right - W / 2)));
    const dx0 = W - right - width;
    const dx1 = W - right;
    const drawerTop = 8;
    let under = H;
    for (const r of btns) if (r.right > dx0 && r.left < dx1 && r.top > drawerTop + safeT) under = Math.min(under, r.top);
    ui.style.setProperty('--drawer-top', `${drawerTop}px`);
    ui.style.setProperty('--drawer-right', `${right}px`);
    ui.style.setProperty('--drawer-w', `${width}px`);
    ui.style.setProperty('--drawer-max', `${Math.max(120, Math.round(under - 8 - drawerTop - safeT))}px`);
  }

  /** The composer's input has focus: no game key may fire. */
  isTyping(): boolean {
    return this.drawer.isTyping();
  }

  /** Desktop: Enter opens Team (All when the team is phrases only), Shift+Enter All. Returns true when handled. */
  key(e: KeyboardEvent, enabled: boolean): boolean {
    if (e.key !== 'Enter' || this.h.touch || this.isTyping() || !enabled || this.ended) return false;
    const ch: MatchChannel = e.shiftKey || this.drawer.tier === 'quick' ? 'all' : 'team';
    e.preventDefault();
    this.drawer.openOn(ch, true);
    return true;
  }

  /** The wheel's centre (Type / More). */
  openDrawer(): void {
    this.drawer.openOn('team', !this.h.touch && this.drawer.tier === 'text');
  }

  /** A legacy wheel line from a teammate (or this player): shown in the ticker, not the rail (§4.1). */
  wheelLine(slot: number, text: string, mine: boolean): void {
    if (!text || this.isMuted(slot)) return;
    this.show({ slot, text, ch: 'team', kind: 'phrase', mine });
  }

  /** Solo: one sim event (cues for the bot chatter; read only). */
  event(ev: unknown): void {
    if (!this.engine || this.ended) return;
    const now = this.h.tick() * TICK_MS;
    for (const c of cuesFromEvents([ev], 2 * this.h.teamSize, this.h.teamSize)) this.engine.observe(c, now);
  }

  /** Solo: the frame's hero rows, sampled once a second. */
  frame(entities: readonly { kind: string; slot: number; team: unknown; hp: number; maxHp: number; x: number; y: number; respawnIn?: number }[]): void {
    if (!this.engine || this.ended) return;
    const t = this.h.tick();
    if (t - this.lastSample < 30) return;
    this.lastSample = t;
    const bots = Array.from({ length: 2 * this.h.teamSize }, (_, i) => i).filter((s) => s !== this.h.mySlot);
    this.engine.sample(statesFromHeroes(heroesFromSnapshot(entities, this.h.teamSize), bots), t * TICK_MS);
  }

  /** A bark over bot `slot` (solo): it does not also type within 10 s. */
  bark(slot: number): void {
    this.engine?.bark(slot, this.h.tick() * TICK_MS);
  }

  /** The player died: the drawer folds away (§4.1). */
  closeDrawer(): void {
    this.drawer.close();
  }

  end(winner: 0 | 1): void {
    if (this.ended) return;
    this.engine?.observe({ k: 'end', winner }, this.h.tick() * TICK_MS);
    this.drawer.close();
    this.ended = true;
    // the end lines still arrive while the banner shows (≤ 12 s of wall time)
    const until = performance.now() + 12_000;
    const t0 = this.h.tick() * TICK_MS;
    const at = performance.now();
    const endTick = setInterval(() => {
      if (this.disposed || performance.now() > until) {
        clearInterval(endTick);
        this.saveSeen();
        return;
      }
      for (const l of this.engine?.due(t0 + (performance.now() - at)) ?? []) this.showBot(l);
    }, 250);
  }

  private clock(): void {
    if (this.disposed) return;
    // the HUD's buttons come and go (last-hit, tower): the layout follows every 2 s
    if (performance.now() - this.layoutAt > 2000) this.layout();
    this.ticker.tick();
    if (!this.engine || this.ended) return;
    for (const l of this.engine.due(this.h.tick() * TICK_MS)) this.showBot(l);
  }

  private isMuted(slot: number): boolean {
    return this.muted.has(slot) || !!this.h.isMuted?.(slot);
  }

  private showBot(l: { slot: number; ch: 'team' | 'all'; k: 't' | 'q'; text?: string; id?: number }): void {
    const text = l.k === 't' ? (l.text ?? '') : matchPhraseText(l.id ?? -1, this.h.sides[l.slot >= this.h.teamSize ? 1 : 0]);
    if (!text || this.isMuted(l.slot)) return;
    this.show({ slot: l.slot, text, ch: l.ch, kind: l.k === 't' ? 'text' : 'phrase', mine: false });
  }

  private incoming(m: { mid: string; slot: number; ch: MatchChannel; k: 't' | 'q'; text?: string; id?: number; mine: boolean }): void {
    if (this.isMuted(m.slot) && !m.mine) return;
    const team = m.slot >= this.h.teamSize ? 1 : 0;
    const text = m.k === 't' ? (m.text ?? '') : matchPhraseText(m.id ?? -1, this.h.sides[team]);
    if (!text) return;
    this.show({ mid: m.mid, slot: m.slot, text, ch: m.ch, kind: m.k === 't' ? 'text' : 'phrase', mine: m.mine });
  }

  private show(l: Omit<ChatLineView, 'name' | 'color'>): void {
    const team = l.slot >= this.h.teamSize ? 1 : 0;
    const color = l.mine || l.slot === this.h.mySlot ? RELATION_CSS.self : team === this.h.myTeam ? RELATION_CSS.ally : RELATION_CSS.enemy;
    const line: ChatLineView = { ...l, mine: l.mine || l.slot === this.h.mySlot, name: this.h.names()[l.slot] ?? `Player ${l.slot + 1}`, color };
    this.ticker.push(line);
    this.drawer.add(line);
    if (this.h.e2e) {
      const d = document.documentElement.dataset;
      d.chatLines = String(Number(d.chatLines ?? 0) + 1);
      d.chatSaid = [...(d.chatSaid ? d.chatSaid.split(' | ') : []), `${line.ch === 'all' ? '[All] ' : ''}${line.name}: ${line.text}`].slice(-20).join(' | ');
    }
  }

  /** Send from the drawer: the relay's rate mirrored (5 in 10 s); solo lines stay local (a human cue for the bots). */
  private send(ch: MatchChannel, body: ChatSend): string | null {
    if (this.ended) return chatErrorText('chat_phase');
    const now = performance.now();
    while (this.sent.length && now - this.sent[0] >= CHAT_SAY_RATE.windowMs) this.sent.shift();
    if (this.sent.length >= CHAT_SAY_RATE.perWindow) return chatErrorText('chat_rate');
    if (body.k === 't' && (ch === 'all' || this.drawer.tier !== 'text')) return chatErrorText('chat_quick_only');
    this.sent.push(now);
    if (this.h.link) {
      if (!this.h.link.chat?.(ch, body)) return chatErrorText('chat_rate');
      return null;
    }
    // solo: shown at once; the bots hear it (a probe silences them, a thanks may get one reaction)
    const text = body.k === 't' ? body.text : matchPhraseText(body.id, this.h.sides[this.h.myTeam]);
    this.show({ slot: this.h.mySlot, text, ch, kind: body.k === 't' ? 'text' : 'phrase', mine: true });
    this.engine?.human({ slot: this.h.mySlot, ch, ...body }, this.h.tick() * TICK_MS);
    return null;
  }

  private saveSeen(): void {
    if (!this.engine) return;
    const lines = this.engine.seenBy(this.h.myTeam);
    if (lines.length) writeSeen(pushSeen(this.seen, lines));
  }

  /** e2e: a line through the same render path (a seam for the layout specs, never in a real match). */
  debugLine(slot: number, text: string, ch: MatchChannel = 'team'): void {
    if (!this.h.e2e) return;
    this.show({ slot, text, ch, kind: 'text', mine: false });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.ended) this.saveSeen();
    if (this.timer) clearInterval(this.timer);
    removeEventListener('resize', this.onResize);
    this.offLink?.();
    this.ticker.dispose();
    this.drawer.dispose();
    if (this.h.e2e) delete (window as unknown as { __plChat?: MatchChat }).__plChat;
  }
}
