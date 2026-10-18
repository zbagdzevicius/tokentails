/**
 * Token Tails integration, game side (integration plan §3.2). One self-contained module: it listens to the bridge
 * on its own (`Bridge.on` takes several handlers), keeps the integration state, and mounts the card UI
 * (ui/cards.ts) into the screens' `[data-slot="cards"]` and `[data-slot="save"]` elements through a
 * MutationObserver on `#app`. A screen without a slot gets one appended in a fixed place, so the cards also show
 * before the screens declare their slots.
 *
 * Handles: `session{signedIn, progress}` (merged into the local profile: unlocks follow the account), `save-result`
 * (the results save chip), `featured` (guest cards), `offer{kind:'meet'}` (the session's single offer), `app.notify`,
 * `purchase-result{catalogId, ok}`, `roster` art and catalog ids, and `audio` volumes. Sends `request-sign-in`,
 * `open-cat` and `offer-seen`. App builds: no featured cats, no offer, no checkout, roster starter and redeem only.
 *
 * `handle(m)` tells the app which messages need nothing more from it (the app's last branch:
 * `else if (!integration.handle(m)) ent.apply(m)`); processing happens in the listener, never twice.
 */
import type { AnalyticsEvent, AnalyticsProps } from '../analytics/posthog';
import { CheckoutBridge, INTENT_HOLD_MS } from '../money/checkoutBridge';
import type { Entitlements } from '../money/entitlements';
import { pickMeet } from '../money/offer';
import { accountState, mergeServerProgress, playSession, progressChanged, saveProfile, setAccountState, type Profile } from '../meta/profile';
import { parseRoster, rosterCosmetics, setAppBuild, type RosterCat } from '../meta/roster';
import { chooseSquadMate, noteNewCat, squadPrefs } from '../meta/squad';
import { meetCard, pickCards, resultsCards, saveChip, titleCards, levelBadges, type ChipState, type SquadMate } from '../ui/cards';
import {
  parseApp,
  parseAudio,
  parseFeatured,
  parseOffer,
  parsePurchaseResult,
  parseSaveResult,
  parseSession,
  type AppInfo,
  type AudioInfo,
  type Bridge,
  type FeaturedCat,
  type HostMessage,
  type MeetOffer,
  type Progress,
  type SaveResult,
  type SignInReason,
} from './bridge';

/** Messages the integration fully owns: the app has nothing to do with them. */
export const OWNED_TYPES: readonly string[] = Object.freeze(['save-result', 'featured']);
/** A results chip waits this long for the host's first `save-result`, then hides (an older host sends none). */
export const SAVE_WAIT_MS = 12000;

export interface IntegrationDeps {
  ent: Entitlements;
  profile: () => Profile;
  analytics: { track(event: AnalyticsEvent, props?: AnalyticsProps): void };
  /** Profile or roster derived state changed: the app redraws its meta (lobby, looks, frames). */
  onRosterChange(): void;
  /** Where the screens live (default `#app`). */
  root?: HTMLElement | null;
  now?: () => number;
  /** Round 1: a portrait of the player's hero in an element's chroma, for the Meet card preview (null: none). */
  chromaPreview?: (element: string) => { url: string; hero: string } | null;
}

export interface MatchInfo {
  ticks: number;
  difficulty: string;
  won: boolean;
}

export interface IntegrationState {
  signedIn: boolean;
  progress: Progress | null;
  app: AppInfo | null;
  audio: AudioInfo | null;
  roster: RosterCat[];
  featured: FeaturedCat[];
  hostOffer: MeetOffer | null | undefined;
  /** The Meet card was shown in this page session (one per session). */
  offerShown: boolean;
  /** Where the live card shows (it stays there across redraws until the player leaves the screen or closes it). */
  liveOffer: { offer: MeetOffer; screen: 'title' | 'results' } | null;
  matchId: string | null;
  match: MatchInfo | null;
  /** Account progress when the match ended (for "New fastest!"). */
  progressAtMatch: Progress | null;
  save: SaveResult | null;
  /** A cat bought in this session (its name), celebrated on the title. */
  joined: string | null;
}

export interface Integration {
  handle(m: HostMessage): boolean;
  /** A fresh id for the next `match-result` (`/^[a-z0-9]{1,16}$/`); the save chip follows it. */
  nextMatchId(info?: MatchInfo): string;
  state(): Readonly<IntegrationState>;
  /** Redraw every mounted slot now. */
  refresh(): void;
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
  const now = deps.now ?? (() => Date.now());
  const checkout = new CheckoutBridge(bridge, deps.ent, now);
  const s: IntegrationState = {
    signedIn: false,
    progress: null,
    app: null,
    audio: null,
    roster: [],
    featured: [],
    hostOffer: undefined,
    offerShown: false,
    liveOffer: null,
    matchId: null,
    match: null,
    progressAtMatch: null,
    save: null,
    joined: null,
  };
  let cardsV = 1;
  let saveV = 1;
  let waitedOut = false;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let lastScreen: ScreenKind | null = null;

  const isApp = (): boolean => s.app?.isApp === true || deps.ent.snapshot().isApp;
  const embedded = (): boolean => bridge.active && deps.ent.snapshot().embedded;
  const featuredIds = (): string[] => s.featured.map((c) => c.catalogId);
  const cosmetics = () => rosterCosmetics(s.roster, squadPrefs());

  // the host tracks the prompt (`pawlegends_signin_prompt`); the game only asks
  const signIn = (reason: SignInReason): void => void bridge.post('request-sign-in', { reason });

  const mate = (c: { id: string; name: string; element: RosterCat['type']; tier: RosterCat['tier']; art?: string; fromPack?: boolean }): SquadMate => {
    const art = c.art ?? s.roster.find((r) => r.id === c.id)?.art;
    return { id: c.id, name: c.name, type: c.element, tier: c.tier, ...(art ? { art } : {}), ...(c.fromPack ? { fromPack: true } : {}) };
  };
  const squad = (): SquadMate[] => cosmetics().companions.map(mate);
  /** Every other owned cat (the pick screen's swap row). */
  const bench = (): SquadMate[] => cosmetics().cats.slice(2).map(mate);

  /** The Meet offer for `screen`, marking it shown (and telling the host) the first time it renders. */
  const meetFor = (screen: 'title' | 'results'): FeaturedCat | null => {
    const live = s.liveOffer;
    if (live && live.screen === screen) {
      if (cosmetics().catalogIds.includes(live.offer.catalogId) || isApp()) return null;
      return s.featured.find((c) => c.catalogId === live.offer.catalogId) ?? null;
    }
    // fun plan F4: no offer after a Rookie match
    if (screen === 'results' && s.match?.difficulty === 'rookie') return null;
    const prof = deps.profile();
    const o = pickMeet({
      session: playSession(prof),
      closed: prof.meetClosed,
      pageSession: prof.sessions,
      now: Date.now(),
      screen: screen === 'title' ? 'lobby' : 'results',
      store: deps.ent.snapshot(),
      shownThisSession: s.offerShown,
      hostOffer: s.hostOffer,
      // round 1: only cats with art get a Meet card (never ask to adopt a cat the player cannot see)
      featured: s.featured.filter((c) => !!c.art).map((c) => c.catalogId),
      owned: cosmetics().catalogIds,
    });
    if (!o) return null;
    const cat = s.featured.find((c) => c.catalogId === o.catalogId);
    if (!cat) return null;
    s.offerShown = true;
    s.liveOffer = { offer: o, screen };
    bridge.post('offer-seen', { kind: 'meet', catalogId: o.catalogId });
    deps.analytics.track('offer_shown', { kind: 'meet', catalogId: o.catalogId, screen });
    document.documentElement.dataset.offer = 'meet';
    return cat;
  };

  const meetModel = (cat: FeaturedCat) => ({
    cat,
    preview: deps.chromaPreview?.(cat.type) ?? null,
    waiting: checkout.waiting() === cat.catalogId,
    onMeet: () => {
      deps.analytics.track('offer_click', { kind: 'meet', catalogId: cat.catalogId });
      if (checkout.openCat(cat.catalogId, featuredIds())) {
        deps.analytics.track('checkout_start', { kind: 'meet', catalogId: cat.catalogId });
        cardsV++;
        render();
        setTimeout(() => {
          cardsV++;
          render();
        }, INTENT_HOLD_MS + 50);
      }
    },
  });

  const closeMeet = (): void => {
    s.liveOffer = null;
    document.documentElement.dataset.offer = '';
  };
  /** Round 2: the player closed the card (✕): remember it, so it does not come back on every page load. */
  const dismissMeet = (): void => {
    const live = s.liveOffer;
    if (live) {
      const p = deps.profile();
      p.meetClosed = { id: live.offer.catalogId, session: p.sessions, at: Date.now() };
      saveProfile(p);
    }
    closeMeet();
  };

  /** The inline part goes in the slot, the corner cards (Meet, squad, companion) in the screen dock. */
  const renderCards = (slot: HTMLElement, kind: ScreenKind, scr: HTMLElement): void => {
    const p = deps.profile();
    const ask = embedded() && !s.signedIn;
    const dock = dockIn(scr, kind);
    if (kind === 'title') {
      // signed-in owners were still told "No account needed." (round 0)
      const acct = scr.querySelector<HTMLElement>('.acct');
      if (acct) acct.textContent = s.signedIn ? 'Signed in: wins save to your account.' : 'No account needed.';
      const cat = meetFor('title');
      slot.replaceChildren(
        titleCards(
          { badges: levelBadges(s.progress, p.fastest), askSignIn: ask && p.matches >= 1, meet: null, joined: s.joined, squad: s.signedIn ? squad() : [] },
          { signIn: () => signIn('save-progress'), meetClosed: dismissMeet },
        ),
      );
      dock.replaceChildren(...(cat ? [meetCard({ ...meetModel(cat), onClose: dismissMeet })] : []));
    } else if (kind === 'pick') {
      slot.replaceChildren();
      dock.replaceChildren(
        pickCards(
          { squad: squad(), bench: bench(), guest: isApp() ? null : (s.featured[0] ?? null), askSignIn: ask },
          {
            signIn: () => signIn('save-progress'),
            choose: (id) => {
              chooseSquadMate(id, squad().map((c) => c.id));
              deps.onRosterChange();
              redraw();
            },
          },
        ),
      );
    } else {
      const won = scr.classList.contains('won');
      const cat = won ? meetFor('results') : null;
      const mates = squad();
      slot.replaceChildren();
      dock.replaceChildren(
        resultsCards(
          {
            won,
            companion: mates[0] ?? null,
            guest: isApp() ? null : (s.featured.find((c) => c.catalogId !== cat?.catalogId) ?? s.featured[0] ?? null),
            meet: cat ? meetModel(cat) : null,
            notify: !!s.app?.notify && deps.ent.snapshot().notifyOpen && !scr.querySelector('[data-a="notify"]'),
          },
          {
            meetClosed: dismissMeet,
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
          catnipPaid: sv?.status === 'saved' ? sv.catnipPaid : 0,
          catnipTotal: sv?.catnipTotal ?? null,
          newFastest: isNewFastest(sv, s.progressAtMatch, s.match),
          askSignIn: embedded() && !s.signedIn,
        },
        { signIn: () => signIn('claim-rewards') },
      ),
    );
  };

  const root = deps.root === undefined ? (typeof document !== 'undefined' ? document.getElementById('app') : null) : deps.root;

  function render(): void {
    if (disposed || !root) return;
    let seen: ScreenKind | null = null;
    for (const node of Array.from(root.children)) {
      const scr = node as HTMLElement;
      const kind = screenKind(scr);
      if (!kind) continue;
      seen = kind;
      const cards = slotIn(scr, 'cards', kind);
      if (cards && cards.dataset.plcV !== String(cardsV)) renderCards(cards, kind, scr);
      if (kind === 'results') {
        const save = slotIn(scr, 'save', kind);
        if (save && save.dataset.plcV !== String(saveV)) renderSave(save);
      }
    }
    // leaving the screen of the live card ends it (one show per session)
    if (seen !== lastScreen) {
      if (s.liveOffer && seen !== s.liveOffer.screen) closeMeet();
      if (seen !== 'title' && seen !== 'results') s.joined = null;
      lastScreen = seen;
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
        s.progress = v.progress;
        setAccountState(v);
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
      case 'featured': {
        const v = parseFeatured(m);
        if (!v) return;
        s.featured = isApp() ? [] : v;
        redraw();
        return;
      }
      case 'offer': {
        const v = parseOffer(m);
        if (v === undefined) return;
        s.hostOffer = isApp() ? null : v;
        redraw();
        return;
      }
      case 'app': {
        const v = parseApp(m);
        if (!v) return;
        s.app = v;
        setAppBuild(v.isApp);
        if (v.isApp) {
          s.featured = [];
          s.hostOffer = null;
          s.liveOffer = null;
        }
        redraw();
        return;
      }
      case 'roster': {
        s.roster = parseRoster(m.cats, { isApp: isApp() });
        if (s.liveOffer && cosmetics().catalogIds.includes(s.liveOffer.offer.catalogId)) closeMeet();
        redraw();
        return;
      }
      case 'purchase-result': {
        const v = parsePurchaseResult(m);
        if (!v) return;
        if (v.ok) {
          s.joined = s.featured.find((c) => c.catalogId === v.catalogId)?.name ?? 'Your new cat';
          // the new cat takes the first squad slot, so the joined line's promise holds (round 0 blocker)
          noteNewCat(v.catalogId);
          deps.onRosterChange();
          if (s.liveOffer?.offer.catalogId === v.catalogId) closeMeet();
        }
        redraw();
        return;
      }
      case 'audio': {
        const v = parseAudio(m);
        if (v) s.audio = v;
        return;
      }
      default:
        return;
    }
  });

  return {
    handle: (m) => OWNED_TYPES.includes(m.type),
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
    state: () => s,
    refresh: () => redraw(true, true),
    dispose: () => {
      disposed = true;
      observer?.disconnect();
      if (waitTimer) clearTimeout(waitTimer);
    },
  };
}
