/**
 * Host integration, game side (integration plan §3.2). One self-contained module: it listens to the bridge on its own
 * (`Bridge.on` takes several handlers), keeps the integration state, and mounts the slot UI (ui/cards.ts) into the
 * screens' `[data-slot="cards"]` and `[data-slot="save"]` elements through a MutationObserver on `#app`. A screen
 * without a slot gets one appended in a fixed place, so the slots also show before the screens declare them.
 *
 * Handles: `session{signedIn, progress}` (merged into the local profile: unlocks follow the account), `save-result`
 * (the results save chip), `app.notify`, `audio` volumes and (sim v9) `champions` (the shelter champions' art). Sends
 * `request-sign-in`. Paw Legends stands on its own (docs/plans/moba/NO-TOKENTAILS.md, 2026-11-12): an older host's
 * `roster`, `featured` and Meet `offer` are ignored, and a champion is never for sale here.
 *
 * `handle(m)` tells the app which messages need nothing more from it (the app's last branch:
 * `else if (!integration.handle(m)) ent.apply(m)`); processing happens in the listener, never twice.
 */
import type { AnalyticsEvent, AnalyticsProps } from '../analytics/posthog';
import type { Entitlements } from '../money/entitlements';
import { accountState, mergeServerProgress, progressChanged, saveProfile, setAccountState, type Profile } from '../meta/profile';
import { isAppBuild, setAppBuild } from '../meta/roster';
import { championInfo, resultsCards, saveChip, titleCards, levelBadges, type ChipState } from '../ui/cards';
import { HEROES } from '../data/heroes';
import { closeAccountPanel, mountAccountChip, type AccountModel } from '../ui/account';
import { championOf } from '../data/heroes/shelter';
import type { HeroId } from '../sim/api';
import { HERO_TEXT } from '../ui/heroText';
import {
  parseApp,
  parseAudio,
  parseChampions,
  parsePartyTicket,
  parseSaveResult,
  parseSession,
  type AppInfo,
  type AudioInfo,
  type Bridge,
  type ChampionCard,
  type HostMessage,
  type PartyResult,
  type Progress,
  type SaveResult,
  type SignInProvider,
  type SignInReason,
  type AccountAction,
} from './bridge';
import { parseApiResult, type ApiArgs, type ApiOp, type ApiResult } from './api';

/**
 * Messages the integration fully owns: the app has nothing to do with them. `roster`, `featured` and `offer` are an
 * older host's Token Tails cat feed: owned here so nothing else reads them (NO-TOKENTAILS.md).
 */
export const OWNED_TYPES: readonly string[] = Object.freeze(['save-result', 'featured', 'roster', 'offer', 'champions', 'party-ticket', 'api-result']);
/** How long the game waits for the host's `api-result` (SOCIAL-RANKED.md §13). */
export const API_WAIT_MS = 10000;
/** How long the game waits for the host's party ticket before it joins as an unscored guest. */
export const PARTY_TICKET_WAIT_MS = 6000;
/** A results chip waits this long for the host's first `save-result`, then hides (an older host sends none). */
export const SAVE_WAIT_MS = 12000;

export interface IntegrationDeps {
  ent: Entitlements;
  profile: () => Profile;
  analytics: { track(event: AnalyticsEvent, props?: AnalyticsProps): void };
  /** Profile or champion art changed: the app redraws its meta (lobby, looks, frames). */
  onRosterChange(): void;
  /** Where the screens live (default `#app`). */
  root?: HTMLElement | null;
  /** Sim v9: the hero on the lobby turntable (the title's champion info follows it). */
  lobbyHero?: () => HeroId;
}

export interface MatchInfo {
  ticks: number;
  difficulty: string;
  won: boolean;
}

export interface IntegrationState {
  signedIn: boolean;
  /** UX pass 2: the signed-in player's profile name (`session.name`), shown over their own hero; null = "You". */
  playerName: string | null;
  /** Sign-in: how the signed-in player signed in (`session.provider`; the account chip's icon). */
  provider: SignInProvider | null;
  progress: Progress | null;
  app: AppInfo | null;
  audio: AudioInfo | null;
  matchId: string | null;
  match: MatchInfo | null;
  /** Account progress when the match ended (for "New fastest!"). */
  progressAtMatch: Progress | null;
  save: SaveResult | null;
  /** Sim v9: the shelter champions' art (never for sale here); empty until the host sends them. */
  champions: ChampionCard[];
}

export interface Integration {
  handle(m: HostMessage): boolean;
  /** A fresh id for the next `match-result` (`/^[a-z0-9]{1,16}$/`); the save chip follows it. */
  nextMatchId(info?: MatchInfo): string;
  /** CHAMPION-STORE.md §6: a Practice match ended (nothing posted): the results chip shows no save at all. */
  unsaved(): void;
  state(): Readonly<IntegrationState>;
  /** Redraw every mounted slot now. */
  refresh(): void;
  /** Sim v9: the pick tiles' champion art. */
  championTiles(): Partial<Record<HeroId, { art?: string }>>;
  /**
   * Party play (MULTIPLAYER.md §5.3): a single-use party ticket minted by the embed host with its own session, or null
   * (standalone, no host answer within PARTY_TICKET_WAIT_MS, or the host had none): the player is an unscored guest.
   */
  partyTicket(): Promise<string | null>;
  /** Party play (§6): hand a party match's v:2 result to the host's save path; the save chip follows the room id. */
  partyResult(result: PartyResult, info?: MatchInfo): boolean;
  /**
   * Social, ranked and reports (SOCIAL-RANKED.md §13): one allowlisted API op through the host's session. Standalone, a
   * timeout or a refused post answers `{ok: false, status: 0}`.
   */
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  /** Ask the host to open its sign-in (social features are for registered accounts). */
  requestSignIn(reason: SignInReason): void;
  /** The account chip and Settings row: sign in, sign out, manage (web) or delete (app). False when nothing listens. */
  account(action: AccountAction): boolean;
  /** What the account chip shows, or null when no host answered (the plain standalone game has no accounts). */
  accountModel(): AccountModel | null;
  dispose(): void;
}

type ScreenKind = 'title' | 'pick' | 'results';

/** A random match id: base36, 16 characters at most. */
export function makeMatchId(rand: () => number = Math.random, now: number = Date.now()): string {
  const t = now.toString(36).slice(-8);
  let r = '';
  while (r.length < 8) r += Math.floor(rand() * 36).toString(36);
  return `${t}${r}`.slice(0, 16);
}

/** "New fastest!": the saved fastest win is new for the account (exact with match info, else compared). Pure. */
export function isNewFastest(save: SaveResult | null, before: Progress | null, match: MatchInfo | null): boolean {
  if (!save || save.status !== 'saved' || save.fastestWin === null || save.fastestWin <= 0) return false;
  if (match) {
    if (!match.won) return false;
    const prev = before?.fastestWin[match.difficulty as keyof Progress['fastestWin']] ?? 0;
    return save.fastestWin === match.ticks && (prev === 0 || match.ticks < prev);
  }
  if (!before) return false;
  return !Object.values(before.fastestWin).includes(save.fastestWin);
}

/** The results chip state for this match. Pure. */
export function chipState(embedded: boolean, save: SaveResult | null, waitedOut: boolean): ChipState | null {
  if (!embedded) return 'local';
  if (save) return save.status;
  return waitedOut ? null : 'waiting';
}

function screenKind(el: Element): ScreenKind | null {
  if (!el.classList.contains('pl-screen')) return null;
  if (el.classList.contains('pl-title')) return 'title';
  if (el.classList.contains('pl-pick')) return 'pick';
  if (el.classList.contains('pl-results')) return 'results';
  return null;
}

/** The screen-level corner dock (ui/cards.css `.plc-dock`): a direct child of the screen, so a column transform never moves it. */
function dockIn(scr: HTMLElement, kind: ScreenKind): HTMLElement {
  let d = scr.querySelector<HTMLElement>(':scope > .plc-dock');
  if (!d) {
    d = document.createElement('div');
    d.className = `plc-dock dock-${kind}`;
    scr.appendChild(d);
  }
  return d;
}

/** The screen's slot, or one created in a fixed place when the screen declares none. */
function slotIn(scr: HTMLElement, name: 'cards' | 'save', kind: ScreenKind): HTMLElement | null {
  const found = scr.querySelector<HTMLElement>(`[data-slot="${name}"]`);
  if (found) return found;
  const slot = document.createElement('div');
  slot.dataset.slot = name;
  slot.dataset.auto = '1';
  if (kind === 'title') {
    (scr.querySelector('.pl-title-col') ?? scr).appendChild(slot);
  } else if (kind === 'pick') {
    scr.appendChild(slot);
  } else if (name === 'cards') {
    (scr.querySelector('.pl-results-col') ?? scr).appendChild(slot);
  } else {
    const col = scr.querySelector('.pl-results-col') ?? scr;
    const anchor = col.querySelector('.stats');
    if (anchor && anchor.parentElement === col) col.insertBefore(slot, anchor);
    else col.appendChild(slot);
  }
  return slot;
}

/** One integration per bridge. */
const installed = new WeakMap<object, Integration>();

/**
 * Install once per bridge; a later call returns the first one unchanged. The App constructor installs first
 * (integration plan §0), so the boot fallback in main.ts is a no-op once that wiring exists.
 */
export function installIntegration(bridge: Pick<Bridge, 'active' | 'post' | 'on'>, deps: IntegrationDeps): Integration {
  const prev = installed.get(bridge);
  if (prev) return prev;
  const integ = create(bridge, deps);
  installed.set(bridge, integ);
  return integ;
}

function create(bridge: Pick<Bridge, 'active' | 'post' | 'on'>, deps: IntegrationDeps): Integration {
  const s: IntegrationState = {
    signedIn: false,
    playerName: null,
    provider: null,
    progress: null,
    app: null,
    audio: null,
    matchId: null,
    match: null,
    progressAtMatch: null,
    save: null,
    champions: [],
  };
  let cardsV = 1;
  let saveV = 1;
  let waitedOut = false;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  /** Party tickets the game is waiting for, by request id. */
  const ticketWaits = new Map<string, (ticket: string | null) => void>();
  /** API answers the game is waiting for, by request id. */
  const apiWaits = new Map<string, (r: ApiResult) => void>();
  let disposed = false;

  const isApp = (): boolean => s.app?.isApp === true || deps.ent.snapshot().isApp || isAppBuild();
  const embedded = (): boolean => bridge.active && deps.ent.snapshot().embedded;

  // the host tracks the prompt (`pawlegends_signin_prompt`); the game only asks
  const signIn = (reason: SignInReason): void => void bridge.post('request-sign-in', { reason });
  const account = (action: AccountAction): boolean => {
    closeAccountPanel();
    return bridge.post('account', { action });
  };
  const accountModel = (): AccountModel | null =>
    embedded() ? { signedIn: s.signedIn, name: s.signedIn ? s.playerName : null, provider: s.signedIn ? s.provider : null, isApp: isApp() } : null;

  /** Sim v9: the lobby (title) info panel of the champion on the turntable (a real Pink Paw cat). Information only. */
  const championPanel = (): HTMLElement | null => {
    const hero = deps.lobbyHero?.();
    const champ = hero ? championOf(hero) : null;
    if (!hero || !champ) return null;
    // the real cat's photo (ui/art.ts), never the host's Token Tails card sprite (`catImg`, pixel art)
    return championInfo({
      name: champ.name,
      realName: champ.cardName,
      pronoun: champ.pronoun,
      type: HEROES[champ.hero].element,
      hero: champ.hero,
      flavour: HERO_TEXT[champ.hero].flavour,
    });
  };

  /** The inline part goes in the slot, the corner part (results: notify) in the screen dock. */
  const renderCards = (slot: HTMLElement, kind: ScreenKind, scr: HTMLElement): void => {
    const p = deps.profile();
    const ask = embedded() && !s.signedIn;
    const dock = dockIn(scr, kind);
    if (kind === 'title') {
      // signed-in owners were still told "No account needed." (round 0)
      const acct = scr.querySelector<HTMLElement>('.acct');
      if (acct) acct.textContent = s.signedIn ? 'Signed in: wins save to your account.' : 'No account needed.';
      // sign-in: the account chip in the corner (a host answered: the web page or the app's in-page host)
      const model = accountModel();
      if (model) mountAccountChip(scr, model, (a) => void account(a));
      else scr.querySelector('.pl-acct-chip')?.remove();
      slot.replaceChildren(titleCards({ badges: levelBadges(s.progress, p.fastest), askSignIn: ask && p.matches >= 1 }, { signIn: () => signIn('save-progress') }));
      dock.replaceChildren();
      const info = championPanel();
      if (info) slot.appendChild(info);
    } else if (kind === 'pick') {
      slot.replaceChildren();
      dock.replaceChildren();
    } else {
      slot.replaceChildren();
      dock.replaceChildren(
        resultsCards(
          { notify: !!s.app?.notify && deps.ent.snapshot().notifyOpen && !scr.querySelector('[data-a="notify"]') },
          {
            notify: () => {
              if (bridge.post('notify', { where: 'results' })) deps.analytics.track('notify_signup', { where: 'results' });
            },
          },
        ),
      );
    }
    slot.dataset.plcV = String(cardsV);
  };

  const renderSave = (slot: HTMLElement): void => {
    slot.dataset.plcV = String(saveV);
    if (!s.matchId && !s.save) {
      slot.replaceChildren();
      return;
    }
    const st = chipState(embedded(), s.save, waitedOut);
    if (!st) {
      slot.replaceChildren();
      return;
    }
    const sv = s.save;
    slot.replaceChildren(
      saveChip(
        {
          state: st,
          newFastest: isNewFastest(sv, s.progressAtMatch, s.match),
          askSignIn: embedded() && !s.signedIn,
          season: sv?.status === 'saved' ? (sv.season ?? null) : null,
        },
        { signIn: () => signIn('claim-rewards') },
      ),
    );
  };

  const root = deps.root === undefined ? (typeof document !== 'undefined' ? document.getElementById('app') : null) : deps.root;

  function render(): void {
    if (disposed || !root) return;
    for (const node of Array.from(root.children)) {
      const scr = node as HTMLElement;
      const kind = screenKind(scr);
      if (!kind) continue;
      const cards = slotIn(scr, 'cards', kind);
      if (cards && cards.dataset.plcV !== String(cardsV)) renderCards(cards, kind, scr);
      if (kind === 'results') {
        const save = slotIn(scr, 'save', kind);
        if (save && save.dataset.plcV !== String(saveV)) renderSave(save);
      }
    }
  }

  let queued = false;
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      render();
    });
  };
  const observer = root && typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
  observer?.observe(root as HTMLElement, { childList: true, subtree: true });

  const redraw = (cards = true, save = false): void => {
    if (cards) cardsV++;
    if (save) saveV++;
    render();
  };

  bridge.on((m: HostMessage) => {
    if (disposed) return;
    switch (m.type) {
      case 'session': {
        const v = parseSession(m);
        if (!v) return;
        s.signedIn = v.signedIn;
        s.playerName = v.name ?? null;
        s.provider = v.provider ?? null;
        s.progress = v.progress;
        setAccountState({ signedIn: v.signedIn, progress: v.progress, name: v.name ?? null, provider: v.provider ?? null });
        // a panel opened for the old account must not act for the new one
        closeAccountPanel();
        const before = deps.profile();
        const merged = mergeServerProgress(before, v.progress);
        if (merged !== before && progressChanged(before, merged)) {
          saveProfile(merged);
          deps.onRosterChange();
        }
        redraw(true, true);
        return;
      }
      case 'save-result': {
        const v = parseSaveResult(m);
        if (!v || (s.matchId !== null && v.matchId !== s.matchId)) return;
        s.save = v;
        redraw(false, true);
        return;
      }
      case 'app': {
        const v = parseApp(m);
        if (!v) return;
        s.app = v;
        setAppBuild(v.isApp);
        redraw();
        return;
      }
      case 'audio': {
        const v = parseAudio(m);
        if (v) s.audio = v;
        return;
      }
      case 'champions': {
        const v = parseChampions(m);
        if (!v) return;
        // the champions' art only: a champion card is never for sale in Paw Legends (NO-TOKENTAILS.md)
        s.champions = v.map((c) => ({ ...c, forSale: false }));
        deps.onRosterChange();
        redraw();
        return;
      }
      case 'party-ticket': {
        const v = parsePartyTicket(m);
        const wait = v ? ticketWaits.get(v.id) : undefined;
        if (!v || !wait) return;
        ticketWaits.delete(v.id);
        wait(v.ticket);
        return;
      }
      case 'api-result': {
        const v = parseApiResult(m);
        const wait = v ? apiWaits.get(v.id) : undefined;
        if (!v || !wait) return;
        apiWaits.delete(v.id);
        wait(v);
        return;
      }
      default:
        return;
    }
  });

  return {
    handle: (m) => OWNED_TYPES.includes(m.type),
    unsaved: () => {
      s.matchId = null;
      s.match = null;
      s.save = null;
      waitedOut = false;
      if (waitTimer) clearTimeout(waitTimer);
      saveV++;
    },
    nextMatchId: (info) => {
      s.matchId = makeMatchId();
      s.match = info ?? null;
      s.progressAtMatch = s.progress ?? accountState().progress;
      s.save = null;
      waitedOut = false;
      if (waitTimer) clearTimeout(waitTimer);
      waitTimer = setTimeout(() => {
        waitedOut = true;
        if (!s.save) redraw(false, true);
      }, SAVE_WAIT_MS);
      saveV++;
      return s.matchId;
    },
    partyTicket: () => {
      if (!bridge.active) return Promise.resolve(null);
      const id = makeMatchId();
      return new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => {
          ticketWaits.delete(id);
          resolve(null);
        }, PARTY_TICKET_WAIT_MS);
        ticketWaits.set(id, (t) => {
          clearTimeout(timer);
          resolve(t);
        });
        if (!bridge.post('party-ticket-request', { id })) {
          clearTimeout(timer);
          ticketWaits.delete(id);
          resolve(null);
        }
      });
    },
    requestSignIn: (reason) => signIn(reason),
    account,
    accountModel,
    api: (op, args = {}) => {
      const id = makeMatchId();
      const none: ApiResult = { id, ok: false, status: 0 };
      if (!bridge.active) return Promise.resolve(none);
      return new Promise<ApiResult>((resolve) => {
        const timer = setTimeout(() => {
          apiWaits.delete(id);
          resolve(none);
        }, API_WAIT_MS);
        apiWaits.set(id, (r) => {
          clearTimeout(timer);
          resolve(r);
        });
        if (!bridge.post('api-request', { id, op, args })) {
          clearTimeout(timer);
          apiWaits.delete(id);
          resolve(none);
        }
      });
    },
    partyResult: (result, info) => {
      s.matchId = result.room;
      s.match = info ?? null;
      s.progressAtMatch = s.progress ?? accountState().progress;
      s.save = null;
      waitedOut = false;
      if (waitTimer) clearTimeout(waitTimer);
      waitTimer = setTimeout(() => {
        waitedOut = true;
        if (!s.save) redraw(false, true);
      }, SAVE_WAIT_MS);
      saveV++;
      return bridge.post('party-result', { matchId: result.room, result });
    },
    state: () => s,
    refresh: () => redraw(true, true),
    championTiles: () => {
      const out: Partial<Record<HeroId, { art?: string }>> = {};
      for (const c of s.champions) out[c.hero] = c.art ? { art: c.art } : {};
      return out;
    },
    dispose: () => {
      disposed = true;
      observer?.disconnect();
      if (waitTimer) clearTimeout(waitTimer);
    },
  };
}
