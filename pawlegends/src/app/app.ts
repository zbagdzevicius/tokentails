/**
 * The app flow (POC.md §12): title → pick → match → results, one frame loop, the quality governor, the lobby
 * turntable between matches and the embed bridge. Also the meta layer around the matches: cosmetics from the
 * entitlement token and free unlocks; the store, the offer card and settings; consent-gated
 * analytics. `html[data-screen]` names the current screen (tests read it; there is no debug global).
 */
import { fishSources, medals, progressRows } from '../ui/progressSummary';
import { HumanFilter } from '../analytics/human';
import { askConsent, createAnalytics, type Analytics } from '../analytics/posthog';
import { retentionDay, sinceLoadMs } from '../analytics/kpi';
import { sfx } from '../audio/sfx';
import { nameLine } from '../audio/voiceLines';
import { crashSender, reportCrash, setCrashHook } from './crash';
import { SIM_VERSION } from '../sim/version';
import { inAppShell, shareBase } from './platform';
import type { Bridge, HostMessage } from '../embed/bridge';
import { EMPTY_ROSTER, isAppBuild } from '../meta/roster';
import { onSkinsChanged } from '../render/skins/registry';
import { recordLadder } from '../meta/ladder';
import { GRADE_TREAT_XP, gradeMatch } from '../meta/grade';
import { HERO_IDS, HEROES } from '../data/heroes';
import { accountState, heroForSide, loadProfile, noteChampionMatch, noteHeroMatch, recordMatch, saveProfile, startSession, tipsDue } from '../meta/profile';
import { CheckoutBridge } from '../money/checkoutBridge';
import { Entitlements } from '../money/entitlements';
import { markShown, pickOffer, type Offer, type OfferScreen } from '../money/offer';
import { isSku, type SkuId } from '../money/skus';
import { CATALOG_SKUS, CHAMPION_IDS, STARTERS, catalogSku, champSkuOf, type CatalogSku } from '../money/catalog';
import { appHidden, canPlay, champStatus, localChampions, lockReason, openChampions, ownedCount, type ChampionsState } from '../meta/champions';
import { PAID_COATS, bestFrame, lookItems, lookKey, resolveLook, titleOf, type Look, type Owned } from '../render/cosmetics';
import { ArtStage } from '../ui/stage/artStage';
import { Lobby } from '../render/lobby';
import { heroSplashUrl, onSkinArt, splashFor } from '../ui/art';
import { loadHistory, newEntryId, recordMoment, replayOf, type HistoryEntry } from '../replay/store';

import { portraitUrl, warmPortraits } from '../render/portraits';
import { FpsProbe, qualityOverride, rememberTier, startTier, tierSettings, type QualityTier } from '../render/quality';
import { isPhone } from '../render/perf/device';
import { FramePacer, MATCH_FPS, WARM, paceTarget, warmMatch } from '../render/perf/pacer';
import { champCovered } from '../ui/champBrowser/cover';
import { openChampInfo } from '../ui/champBrowser/open';
import type { HeroActionState } from '../ui/champBrowser/champBrowser';
import { GOV, GOV_NAMES, GOV_STEP, ThermalGovernor } from '../render/perf/governor';
import { autoBatterySaver, batterySaver, releaseAutoSaver, savePerfStep, savedPerfStep, setBatterySaver } from '../render/perf/prefs';
import { thermal } from '../render/perf/thermal';
import { createRenderer, runFrameTap, type GameRenderer } from '../render/renderer';
import { PUSH_CAT_NAME, PUSH_CATS, disablePush, enablePush, loadPushPrefs, permission, pushSupported, resyncPush, savePushPrefs, serverKey, setPushCats, shouldAsk, type PushCat } from '../social/push';
import { pushAskCard } from '../ui/pushAsk';
import { clipSupported } from '../share/clipSupport';
import type { ApiArgs, ApiOp } from '../embed/api';
import type { HeroId } from '../sim/api';
import { dareFromUrl, dareUrl, type Dare } from '../share/dare';
import { inviteUrl, partyApi, partyFromUrl, watchFromUrl } from '../share/partyLink';
import type { PartyClient } from '../party';
import { PVP_UNLOCK_MATCHES, hideNames, lastQueueSide, onlineMode, pvpQueueFor, setLastQueueSide, setOnlineMode, type OnlineMode } from '../meta/partyPrefs';
import { pvpAvailable, pvpKnown } from '../meta/pvpCapability';
import { showUpdateCard, UpdateWatch } from '../meta/clientPolicy';
import { isMpEvent } from '../analytics/posthog';
import type { MatchMsg } from '../net/proto';
import { offerCard } from '../ui/offerCard';
import { PerfReadout, perfFromUrl } from '../ui/perfReadout';
import { loadingVeil, pickScreen, rankedBlockHtml, refreshPickChamps, refreshPickFaces, resultsScreen, rotatePrompt, type Choice } from '../ui/screens';
import { disposeLobby, heroIdentity, type LobbyIdentity } from '../ui/lobby/lobbyScreen';
import { botsChoice, disposeHome, homeScreen, patchHome, type HomeProfile, type HomeScreenOpts, type Promo } from '../ui/home/homeScreen';
import { currentSeason, seasonEndText } from '../meta/pass';
import { initLiveops } from '../meta/liveops';
import { legacyMode, loadModeChoice, modeById, modeList, pillText, rankedModeDef, registerMode, saveModeChoice, type ModeChoice, type ModeDef } from '../ui/modeSelect/modes';
import { fetchRankedStatus, parseRankedCard, rankedLabel, rankedResult, type RankedCard } from '../meta/ranked';
import { heroElement } from '../ui/cards/el';
import { consentPrompt, settingsPanel } from '../ui/settings';
import { notePurchase, storePanel, type StoreTab } from '../ui/store';
import { passPanel } from '../ui/passPanel';
import { HERO_TEXT, slotNames } from '../ui/heroText';
import { selfNames } from '../meta/cardName';
import type { MatchEnd, MatchSession, MatchSetup } from './matchSession';
import { MODE_MAP, MODE_MINUTES, MODE_MUTATOR, MODE_NAME, MUTATOR_MODE, MUTATOR_VEIL, loadMatchMode, modeFromUrl, saveMatchMode, type MatchMode } from '../ui/lobby/matchMode';
import { MUTATORS, type MapId, type Mutator } from '../sim/api';

/**
 * The match (session, game view, effects, HUD) is its own chunk: the title and menus load without it (first-load JS
 * budget) and it is prefetched once the title is up, so a match still starts at once.
 */
const loadMatch = (): Promise<typeof import('./matchSession')> => import('./matchSession');
import { canPickDifficulty, difficultyFor, forfeitTick, guideMode, isRookie, pickable, PICK_DIFFICULTY_FROM, rookieAvailable } from './firstSession';
import { dayKey, followsHero, loadQuests, progressQuests, questViews, saveQuests } from '../meta/quests';
import { addTreatXp, loadTreats, loadTreatsRaw, migrateTreats, perMinuteShare, saveTreats, treatXpFor } from '../meta/treats';
import { collectionPanel } from '../ui/collection';
import { parseAudio } from '../embed/bridge';
import { installIntegration, type Integration } from '../embed/integrate';
import { ReportBook, REPORT_THANKS, reportOutcomeOf, reportPopover, reportToast, reportable } from '../social/report';
import { kudosMates, mountKudos } from '../social/kudos';
import { suddenDeathS } from '../ui/screens';
import { assetRev } from '../ui/assetRev';
import { RewardsCloud, todayExtraHtml } from '../ui/rewards/rewards';

type Screen = 'title' | 'pick' | 'match' | 'results';

/**
 * GAPS A1: a version 1 Treat Track (9 chests) moves to the 30-chest track once; chests that opened empty after the
 * old track ran out are paid now (meta/treats.ts migrateTreats: idempotent, so nothing is granted twice). The
 * unlocks are saved before the new track state, so a blocked second write only repeats a no-op.
 */
function migrateTreatTrack(): void {
  const raw = loadTreatsRaw();
  if (raw === null) return;
  const p = loadProfile();
  const m = migrateTreats(raw, new Set(p.unlocks));
  if (m.grants.length) {
    for (const r of m.grants) if (!p.unlocks.includes(r.id)) p.unlocks.push(r.id);
    saveProfile(p);
  }
  if (m.migrated) saveTreats(m.state);
}

function speedFromUrl(): number {
  try {
    const v = Number(new URLSearchParams(location.search).get('speed'));
    return Number.isFinite(v) && v >= 1 ? Math.min(64, Math.round(v)) : 1;
  } catch {
    return 1;
  }
}

function installFont(): void {
  try {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    const base = import.meta.env.BASE_URL ?? './';
    // The extended Fredoka (Latin Extended and combining marks) draws accented player and card names; a letter and its
    // combining mark must come from one face, so this one (the whole font) covers Basic Latin too. (The champion names
    // are plain English since Nov 2026: Raspberry, Gabby, Bengal, Lambo.)
    // Audit GFX-14: it is the only face now. The separate Latin file (65 KB) only duplicated its Basic Latin, so the
    // game loaded 152 KB of fonts for one family; index.html preloads this file.
    const ext = new FontFace('Fredoka', `url("${base}assets/fonts/Fredoka-Ext.woff2") format("woff2")`, {
      weight: '300 700',
      display: 'swap',
      unicodeRange: 'U+0000-024F, U+0300-036F, U+1E00-1EFF',
    });
    ext
      .load()
      .then((f) => document.fonts.add(f))
      .catch(() => undefined);
  } catch {
    /* system font fallback */
  }
}

/** p95 of a list of frame times (ms). */
/**
 * Round 2: the Change hero button teases a hero the player has not won with yet (else the next one), never its own.
 * Sim v14: only heroes of the current hero's side (the player chose cats or dogs on the switch).
 */
export function tryHeroFor(current: HeroId, bests: Partial<Record<HeroId, unknown>>, playable?: (h: HeroId) => boolean): HeroId {
  const side = HEROES[current]?.side ?? 'cat';
  const order: readonly HeroId[] = HERO_IDS.filter((h) => HEROES[h].side === side);
  const start = order.indexOf(current);
  const rest = order.map((_, k) => order[(start + k + 1) % order.length]).slice(0, order.length - 1);
  // CHAMPION-STORE.md: only a champion the player may pick (a starter, free this week, owned), never a Practice-only one
  const open = playable ? rest.filter(playable) : rest;
  const pool = open.length ? open : rest;
  return pool.find((h) => !bests[h]) ?? pool[0];
}

/** Frame-time percentiles (ms, one decimal) for `perf_sample`: p50, p95 and p99 (LATENCY-PLAN M1). */
export function framePcts(xs: readonly number[]): { p50: number; p95: number; p99: number } {
  if (!xs.length) return { p50: 0, p95: 0, p99: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => Math.round(s[Math.min(s.length - 1, Math.floor(s.length * q))] * 10) / 10;
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

export class App {
  readonly gr: GameRenderer;
  /** The menu stage: the screen's painted scene and the hero's art (ui/stage/artStage.ts; no 3D on menus). */
  readonly stage: ArtStage;
  /** Home's 3D hero on its pedestal (founder, Nov 13: "in homepage ... here we should show 3d champ"); null until Home. */
  private lobby: Lobby | null = null;
  /** The 3D lobby is up (Home only): the frame loop draws it. */
  private lobbyOn = false;
  /** The lobby's last frame is up behind the champion browser: no more lobby frames until it closes. */
  private champFrozen = false;
  readonly ent = new Entitlements();
  readonly checkout: CheckoutBridge;
  readonly analytics: Analytics;
  /** Sign-in, save chip and the champion info (embed/integrate.ts). */
  readonly integration: Integration;
  /** Gap plan P2 rewards-cloud: account progress sync, the Lucky Treat and the Welcome Path (ui/rewards). */
  private readonly rewards: RewardsCloud;
  private readonly human = new HumanFilter();
  private screen: Screen = 'title';
  private screenEl: HTMLElement | null = null;
  private overlay: { close(): void; refresh?(): void; kind?: 'store' | 'pass' } | null = null;
  private offerEl: { close(): void } | null = null;
  /** SHARE-PUSH.md §2: the server's push key once known (null: no web push here), the notifications card, the boot sync. */
  private pushKey: string | null = null;
  private pushAskEl: { close(): void } | null = null;
  private pushBooted = false;
  private session: MatchSession | null = null;
  private tier: QualityTier;
  private probe: FpsProbe | null;
  /** PERF-IOS P1-3: the thermal governor (a phone that ended its last visit hot starts one step cooler). */
  private readonly governor = new ThermalGovernor(Math.max(0, savedPerfStep() - 1));
  /** PERF-IOS P1-1: draws at 60 in the match, 30 in menus, 15 paused or behind a full-screen panel. */
  private readonly pacer = new FramePacer();
  private readonly phone = isPhone();
  /** PERF-IOS P1-6: the loop is stopped while the page is hidden or the app is in the background. */
  private suspended = false;
  private raf = 0;
  private readonly frameCb = (t: number): void => this.frame(t);
  /** `?quality=` forces a tier for the whole visit: the governor does not step it down (perf.spec.ts measures it). */
  private readonly forcedTier = qualityOverride() !== null;
  private last = performance.now();
  private dare: Dare | null = dareFromUrl();
  /**
   * Sim v22 (WR-BS-PLAN.md §5): `?mode=blitz|skirmish|classic` selects that tile once; a mode this build does not know
   * (a newer client's link) shows "Update to play …" and falls back to Skirmish, never a crash.
   */
  private linkMode = (() => {
    try {
      return modeFromUrl(location.search);
    } catch {
      return null;
    }
  })();
  /** Sim v22: Blitz matches finished in a row (the results' "Take {hero} into Skirmish" after two). */
  private blitzRun = 0;
  /** Party play (MULTIPLAYER.md): the open party (lazy chunk), and a `?party=` code to join at boot. */
  private party: PartyClient | null = null;
  private partyCode: string | null = partyFromUrl();
  private readonly partyApi = partyApi();
  private readonly speed = speedFromUrl();
  private choice: Choice;
  private lastSetup: MatchSetup | null = null;
  /** CHAMPION-STORE.md §6: the match on screen is Practice (a locked champion): it saves nothing. */
  private practice = false;
  /** Sim v27: the match on screen is the Practice ground (saves nothing, counts as no match). */
  private sandbox = false;
  /** Locked champions already reported as viewed this session (analytics, once each). */
  private lockedSeen = new Set<string>();
  private frames = 0;
  private hostOffer: Offer | null | undefined = undefined;
  private offerShown = false;
  private matchesThisSession = 0;
  /** A purchase the host confirmed: once its items arrive, the lobby hero puts the new look on ("New!"). */
  private pendingReveal: string | null = null;
  private frameMs: number[] = [];
  /** `?perf=1` on-screen readout for the device gate (§15 item 27); null otherwise. */
  private readonly perf: PerfReadout | null;
  private readonly sessionNo: number;
  private readonly dayN: number;
  /** Force update (FORCE-UPDATE.md §5): an outdated web build reloads on the title; the app hands over to its shell. */
  private readonly updates: UpdateWatch;

  constructor(
    private readonly root: HTMLElement,
    private readonly bridge: Bridge,
  ) {
    installFont();
    const start = startTier();
    this.tier = start.tier;
    this.probe = start.probe;
    this.gr = createRenderer(root, this.tier);
    if (this.governor.step > 0) this.gr.apply(tierSettings(this.tier, { phone: this.phone, step: this.governor.step }));
    document.documentElement.dataset.phone = this.phone ? '1' : '0';
    this.perf = perfFromUrl() ? new PerfReadout(root) : null;
    document.documentElement.dataset.quality = this.gr.settings.tier;
    // founder, Nov 13: the menus show the heroes as painted art (faces, splashes, skin art), never a 3D render
    this.stage = new ArtStage(root, this.gr.renderer.domElement, () => this.gr.settings.tier === 'low');
    // the worn skins' painted faces (profile ring, pick tiles and seats, HUD) load now; the screen takes them as they land
    onSkinArt(() => this.artReady());
    warmPortraits(HERO_IDS.map((h) => [h, this.lookFor(h)] as [HeroId, Look]));
    const p = startSession();
    this.sessionNo = p.sessions;
    this.dayN = retentionDay();
    migrateTreatTrack();
    sfx.setMuted(p.muted);
    // sim v14: the hero follows the side the switch was left on (the last hero picked there)
    this.choice = { hero: HEROES[p.hero].side === p.side ? p.hero : heroForSide(p, p.side), trick: p.trick, difficulty: p.difficulty };
    this.human.install(window);
    // PUB-02: embedded, events go to the host's analytics (the site's policy and id); standalone, to PostHog after consent
    this.analytics = createAnalytics(
      // day_n: whole days since this browser first played (D1 / D7 retention, analytics/kpi.ts)
      () => ({ human: this.human.human, embed: bridge.active, session: this.sessionNo, quality: this.tier, day_n: this.dayN }),
      bridge.active ? (event, props) => bridge.post('analytics', { event, props: { ...props } }) : null,
    );
    // Launch finding R1: crashes go to the host (embedded) or this page's consent-gated analytics (app/crash.ts).
    setCrashHook(
      crashSender({
        consent: () => this.analytics.consentState,
        post: (props) => bridge.post('client-error', { ...props }),
        track: (props) => this.analytics.track('app_error', { ...props }),
        flush: () => this.analytics.flush(),
        context: () => ({ screen: this.screen, tier: this.tier, sim: SIM_VERSION }),
      }),
    );
    this.checkout = new CheckoutBridge(bridge, this.ent);
    this.checkout.onResult((sku, ok) => {
      notePurchase(ok);
      if (ok) this.pendingReveal = sku;
    });
    rotatePrompt(root);
    addEventListener('resize', () => {
      this.gr.resize();
      // a resize clears the drawing buffer: the lobby frozen behind the champion browser draws once more
      this.champFrozen = false;
    });
    // iOS Safari only lets a touch's end (touchend, pointerup, click) start or resume audio, not its pointerdown
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, () => sfx.unlock(), { capture: true });
    this.integration = installIntegration(bridge, {
      ent: this.ent,
      profile: loadProfile,
      analytics: this.analytics,
      onRosterChange: () => this.refreshMeta(),
      root,
      lobbyHero: () => this.choice.hero,
      // a save refused because this build's sim is too old: update (web: on the next title; app: the shell's gate)
      onUpdateNeeded: () => void this.updates.check('rejected'),
    });
    this.updates = new UpdateWatch({
      mode: inAppShell() || bridge.kind === 'native' ? 'app' : bridge.kind === 'frame' ? 'frame' : 'web',
      api: this.partyApi,
      versionUrl: `${import.meta.env.BASE_URL ?? './'}version.json`,
      own: { sha: typeof __PL_BUILD__ !== 'undefined' ? __PL_BUILD__.sha : 'local', sim: SIM_VERSION },
      fetchJson: async (url) => {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => ctl?.abort(), 5000);
        try {
          const r = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: ctl?.signal ?? undefined });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.json();
        } finally {
          clearTimeout(timer);
        }
      },
      // the bare title: no party, and no overlay over it (Mode Select, a sheet): the player is not on the way to a match
      atTitle: () =>
        this.screen === 'title' && !this.party && !this.overlay && !this.root.querySelector('.ms-overlay') && !document.querySelector('.pl-party') && !hasPartySeat(),
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      storage: (() => {
        try {
          return sessionStorage;
        } catch {
          return null;
        }
      })(),
      showCard: (o) => showUpdateCard(document, o),
      reload: (reason, version) => {
        // framed: the host starts the frame again on the latest build; an older host ignores the message, so the
        // frame reloads itself shortly after (the host reconnects on the frame's load either way)
        if (bridge.kind === 'frame') {
          bridge.post('reload-request', { reason, ...(version ? { version } : {}) });
          setTimeout(() => location.reload(), 2500);
        } else location.reload();
      },
      dispatch: (type) => dispatchEvent(new Event(type)),
    });
    // rewards-cloud: the account's progress (signed in, or a guest whose /live saves made an account)
    this.rewards = new RewardsCloud({
      api: (op, args) => this.integration.api(op, args),
      eligible: () => bridge.active && (this.integration.state().signedIn || loadProfile().matches > 0),
      onChange: () => this.refreshMeta(false),
      root,
    });
    bridge.on((m) => this.onHost(m));
    // a sprite probe finished: the palette changed, so the pick tiles, the lobby hero and the portraits follow
    // (debounced; the pick screen is never rebuilt, so the trick, bots, a running Preview and the strip scroll stay)
    let skinsTimer: ReturnType<typeof setTimeout> | null = null;
    onSkinsChanged(() => {
      if (skinsTimer) clearTimeout(skinsTimer);
      skinsTimer = setTimeout(() => {
        skinsTimer = null;
        if (this.screen === 'match') return;
        if (this.screen !== 'pick') return this.refreshMeta();
        if (this.screenEl) refreshPickFaces(this.screenEl);
        if (!document.documentElement.dataset.skinPreview) this.setLobbyHero(this.choice.hero);
      }, 120);
    });
    this.ent.onChange(() => this.refreshMeta());
    document.addEventListener('visibilitychange', () => this.setSuspended(document.hidden));
    // PERF-IOS P1-6: the Capacitor app going to the background (the App plugin's pause / resume; no import, so the web
    // build is unchanged). Older shells without the plugin fall back to visibilitychange above.
    try {
      const capApp = (window as unknown as { Capacitor?: { Plugins?: { App?: { addListener?: (e: string, f: () => void) => unknown } } } }).Capacitor?.Plugins?.App;
      capApp?.addListener?.('pause', () => this.setSuspended(true));
      capApp?.addListener?.('resume', () => this.setSuspended(document.hidden));
    } catch {
      /* no bridge */
    }
    // after render/perf/thermal.ts drops its cached value (its listener may be added later than this one)
    addEventListener('pl-thermal', () => queueMicrotask(() => this.onThermal()));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // party play (§4.5): a hidden tab is "away" (NetHost; a bot flies the hero) and comes back to the match, not
        // to a menu over it (the menu would also hide a friend's vote on the rail)
        if (!this.lastSetup?.party || this.screen !== 'match') this.session?.setPaused(true);
        // the match chunk may still be loading: pause the session the moment it exists
        if (!this.session && this.screen === 'match') this.pendingPause = true;
      } else {
        this.analytics.refreshConsent();
        // a tab that comes back after hours: is this build still the live one?
        void this.updates.check('visible');
      }
    });
    this.gr.resize();
    if (this.dare) this.analytics.track('dare_open', { hero: this.dare.hero, difficulty: this.dare.difficulty });
    this.analytics.track('quality_tier', { tier: this.tier });
    this.showTitle();
    // a `?party=` link joins at once; a reload with a party seat (a stored resume token) rejoins it
    // SPECTATE.md §1: a `?watch=` link opens the live view (a party link wins)
    const watch = this.partyCode ? null : watchFromUrl();
    if (watch) stripParam('watch');
    if (this.partyApi && this.partyCode) this.openParty('join', this.partyCode);
    else if (this.partyApi && watch) this.openSpectate(watch);
    else if (this.partyApi && hasPartySeat()) this.openParty('resume');
    // a closed tab (no resume token left) still in a party: rejoin it by its code (the relay gives this player their
    // own seat back; a party that ended meanwhile closes quietly)
    else if (this.partyApi && lastPartyCode()) this.openParty('resume', lastPartyCode());
    // a closed tab that was a stranger in a live Quick Play match (no code): ask the relay for that seat back
    else if (this.partyApi && lastMmMatch()) this.openParty('back');
    if (this.partyCode) stripPartyParam();
    // the party chunk is fetched while idle once the title is up (never part of the first load, §11)
    if (this.partyApi) idle(() => void import('../party').catch(() => undefined));
    this.onThermal();
    this.raf = requestAnimationFrame(this.frameCb);
    document.documentElement.dataset.ready = '1';
    // PERF-IOS §8 Track C: the boot splash fades out under the title (0.35 s), then leaves the page: hidden, its two
    // infinite animations still ran for the whole session (style recalcs in the lobby and in every match)
    setTimeout(() => document.getElementById('boot')?.remove(), 600);
  }

  // ------------------------------------------------------------------------------------------- host + meta

  private onHost(m: HostMessage): void {
    // PUB-02: events tracked before the first hello were held; the host can take them now
    if (m.type === 'hello') this.analytics.flush();
    // rewards-cloud: a session or a saved match syncs the account's progress (and shows a Lucky Treat it paid)
    this.rewards.onHost(m);
    if (m.type === 'pause' || m.type === 'resume') {
      this.session?.setPaused(m.type === 'pause');
      // correctness QA: a pause sent while the match chunk loads was lost (the bridge said paused, the match ran)
      if (!this.session) this.pendingPause = m.type === 'pause';
      this.bridge.post('paused', { paused: m.type === 'pause' });
    } else if (m.type === 'audio') {
      // the host's mute applies to this visit only: never saved into the game profile (a host mute saved there kept
      // the standalone game silent too, and came back on every visit)
      sfx.setMuted(m.muted === true);
      const v = parseAudio(m);
      if (v) sfx.setVolumes(v);
    }
    else if (!this.integration.handle(m)) this.ent.apply(m);
    // save-result belongs to the integration (POST /user/catbassadors/live via the host). An older host's Token Tails
    // `roster`, `featured` and Meet `offer` are owned there too and ignored (NO-TOKENTAILS.md).
  }

  // ------------------------------------------------------------------------------------------- looks

  private isApp(): boolean {
    return this.ent.snapshot().isApp || isAppBuild() || this.integration.state().app?.isApp === true;
  }

  private owned(): Owned {
    const s = this.ent.snapshot();
    // Paw Legends stands on its own: no Token Tails cats, so no cat coats, tints or tier frames (NO-TOKENTAILS.md)
    return { items: s.items, unlocks: new Set(loadProfile().unlocks), roster: EMPTY_ROSTER };
  }

  private artTimer: ReturnType<typeof setTimeout> | null = null;
  /** A worn skin's painted face loaded: Home's profile ring and the pick's tiles and seats take it (debounced). */
  private artReady(): void {
    if (this.artTimer) return;
    this.artTimer = setTimeout(() => {
      this.artTimer = null;
      if (this.screen === 'title') this.refreshMeta(false);
      else if (this.screen === 'pick' && this.screenEl) refreshPickFaces(this.screenEl);
    }, 150);
  }

  private lookFor(hero: HeroId): Look {
    const chosen = loadProfile().looks[hero];
    return resolveLook(hero, this.owned(), chosen as Partial<Look> | undefined);
  }

  /**
   * Store, roster or app state changed: redraw the lobby screen so buttons, looks and frames follow. `offer` false
   * (a lobby panel closed) redraws the title without the offer check.
   */
  private refreshMeta(offer = true): void {
    const s = this.ent.snapshot();
    const d = document.documentElement.dataset;
    d.store = s.storeOpen ? '1' : '0';
    d.isApp = s.isApp ? '1' : '0';
    d.items = [...s.items].sort().join(',');
    d.chromas = '';
    d.frame = bestFrame(this.owned(), loadProfile().wornFrame) ?? '';
    if (!s.storeOpen) {
      // only the store closes with the store; the Legends Pass and other panels stay (and redraw)
      if (this.overlay?.kind === 'store') {
        this.overlay.close();
        this.overlay = null;
      } else this.overlay?.refresh?.();
      this.offerEl?.close();
      this.offerEl = null;
    } else this.overlay?.refresh?.();
    this.revealPurchase();
    this.keepPlayable();
    if (this.screen === 'title') this.showTitle(offer);
    else if (this.screen === 'pick') {
      this.setLobbyHero(this.choice.hero);
      // CHAMPION-STORE.md: an unlock or a purchase landed while the pick is up
      if (this.screenEl) refreshPickChamps(this.screenEl);
    }
  }

  // ------------------------------------------------------------------------------------------- champions

  /**
   * CHAMPION-STORE.md: the host's champions state; with a host that sent none (signed out, an older host), the
   * starters and this week's rotation. Without any host (a standalone page: no account, nothing is ever saved) every
   * champion is open, as Practice is.
   */
  private champs(): ChampionsState {
    const s = this.ent.snapshot();
    if (s.champions) return s.champions;
    return s.embedded || this.isApp() ? localChampions() : openChampions();
  }

  /** May this player pick `h` now (a starter, free this week, or owned; app builds: not a web purchase)? */
  private playable(h: string): boolean {
    return canPlay(h, this.champs(), this.isApp());
  }

  /** `prefer` when playable, else the side's remembered hero, else the side's first starter (Clem, Sir Brutus). */
  private playableHero(prefer: HeroId): HeroId {
    if (this.playable(prefer)) return prefer;
    const side = HEROES[prefer]?.side ?? 'cat';
    const remembered = heroForSide(loadProfile(), side);
    if (this.playable(remembered)) return remembered;
    return (STARTERS.find((h) => (HERO_IDS as readonly string[]).includes(h) && HEROES[h as HeroId].side === side) ?? 'clem') as HeroId;
  }

  /**
   * The lobby's hero stays one the player may pick (a rotation week ended, a refund, sign-out). A swap made before the
   * host's champions arrived (the page opens on the starters and the rotation) is undone once the hero is playable
   * again, so a Founders roster or an owned champion keeps the lobby on the player's own hero.
   */
  private keepPlayable(): void {
    const back = this.swapped;
    if (back && this.choice.hero === back.to && this.playable(back.from)) {
      this.swapped = null;
      this.choice = { ...this.choice, hero: back.from };
      return;
    }
    const h = this.playableHero(this.choice.hero);
    if (h === this.choice.hero) return;
    this.swapped = { from: back && this.choice.hero === back.to ? back.from : this.choice.hero, to: h };
    this.choice = { ...this.choice, hero: h };
  }

  /** The hero keepPlayable swapped away from (`from`) and the one it put on the lobby (`to`). */
  private swapped: { from: HeroId; to: HeroId } | null = null;

  /** CHAMPION-STORE.md §8.6: ask the host to unlock `h` with Yarn or a Champion Pick (it answers a fresh `store`). */
  private unlockChamp(h: HeroId, via: 'yarn' | 'pick'): void {
    this.analytics.track('champ_unlock', { hero: h, via });
    if (!this.bridge.post('champ-unlock', { hero: h, via }) && this.screenEl) refreshPickChamps(this.screenEl);
  }

  /**
   * Home's champion browser button for `h` (champBrowser.ts HeroAction): SELECT a playable hero, SELECTED for the Home
   * hero, BUY a locked one on the web (the store's champion detail), UNLOCK in the app (Yarn and Champion Picks only,
   * no price). No button for a locked hero the app does not offer or when no store can open.
   */
  heroAction(h: HeroId): HeroActionState {
    if (this.dare) return 'none';
    if (this.playable(h)) return h === this.choice.hero ? 'selected' : 'select';
    const app = this.isApp();
    if (app) return appHidden(h, this.champs(), true) ? 'none' : 'unlock';
    return this.ent.snapshot().storeOpen ? 'buy' : 'none';
  }

  /**
   * SELECT in Home's champion browser: `h` becomes the Home hero and the hero the champion select opens on (the same
   * memory the champion select's own pick writes). Home is patched in place (no rebuild, no entrance replay).
   */
  selectHomeHero(h: HeroId): void {
    if (!this.playable(h) || this.dare) return;
    sfx.play('click');
    const prev = this.choice.hero;
    this.choice = { ...this.choice, hero: h };
    this.swapped = null;
    const q = loadProfile();
    if (HEROES[prev] && HEROES[prev].side !== HEROES[h].side) q.lastBySide[HEROES[prev].side] = prev;
    q.hero = h;
    q.side = HEROES[h].side;
    q.lastBySide[q.side] = h;
    saveProfile(q);
    this.analytics.track('home_hero_select', { hero: h });
    if (this.screen === 'title') this.showTitle(false);
    else this.setLobbyHero(h);
  }

  /** The lobby hero's face in its look, for the frame badge (the skin's face once it has loaded). */
  private badgePortrait(): string | null {
    const hero = this.dare?.hero ?? this.choice.hero;
    return portraitUrl(hero, this.lookFor(hero));
  }

  /** The bought look goes on the lobby hero, with confetti and a short "New!" line, as proof the purchase arrived. */
  private revealPurchase(): void {
    const sku = this.pendingReveal;
    if (!sku) return;
    // STORE-PASS.md: a store or pass SKU is revealed once its items arrive in the host's `store` message
    const store = catalogSku(sku);
    if (store) return this.revealStore(store);
    if (!isSku(sku) || !this.ent.snapshot().skus.has(sku)) return;
    this.pendingReveal = null;
    const hero: HeroId = sku === 'pl_founder' ? this.choice.hero : 'clem';
    const coat = sku === 'pl_founder' ? `coat.founder.${hero}` : sku === 'pl_starter' ? 'skin.clem.pink_bow' : 'skin.clem.dawnblade';
    const p = loadProfile();
    p.looks[hero] = { coat, chroma: (p.looks[hero] as Partial<Look> | undefined)?.chroma ?? null };
    saveProfile(p);
    this.choice = { ...this.choice, hero };
    this.celebrate(2.5);
    const name = sku === 'pl_founder' ? `Founder coat on ${HERO_NAME(hero)}` : sku === 'pl_starter' ? 'Pink Bow Clem' : 'Dawnblade Clem';
    const el = document.createElement('div');
    el.className = 'pl-new';
    el.setAttribute('role', 'status');
    el.innerHTML = `<b>New!</b><span></span>`;
    (el.querySelector('span') as HTMLElement).textContent = `${name} is yours. Wearing it now.`;
    this.root.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4200);
    if (this.screen === 'pick') this.setLobbyHero(hero);
  }

  /**
   * A bought store item arrived (STORE-PASS.md §3 step 5): a coat goes on its hero, a frame and its title are worn, a
   * set puts its first coat on and wears its frame; the pass shows a line. The "New!" toast is the proof.
   */
  private revealStore(def: CatalogSku): void {
    const s = this.ent.snapshot();
    const items = def.items.length ? def.items : [];
    // CHAMPION-STORE.md: a champion arrives in the host's `store.champions`, never in the cosmetic items
    const champ = def.kind === 'champion';
    const arrived =
      def.kind === 'pass'
        ? !!s.season && s.season.premium !== 'none'
        : champ
          ? items.every((i) => champStatus(i.slice('champ.'.length), this.champs()) !== 'locked')
          : items.every((i) => s.items.has(i));
    if (!arrived) return;
    this.pendingReveal = null;
    const p = loadProfile();
    const coat = items.find((i) => i.startsWith('coat.'));
    const coatHero = coat ? (PAID_COATS[coat]?.hero ?? null) : null;
    if (coat && coatHero) p.looks[coatHero] = { coat, chroma: (p.looks[coatHero] as Partial<Look> | undefined)?.chroma ?? null };
    const frame = items.find((i) => i.startsWith('frame.'));
    const title = items.find((i) => i.startsWith('title.'));
    if (frame) p.wornFrame = frame;
    if (title) p.wornTitle = title;
    saveProfile(p);
    if (coatHero) this.choice = { ...this.choice, hero: coatHero };
    // a single champion goes on the lobby at once
    if (champ && def.hero && (HERO_IDS as readonly string[]).includes(def.hero)) this.choice = { ...this.choice, hero: def.hero as HeroId };
    this.celebrate(2.5);
    const el = document.createElement('div');
    el.className = 'pl-new';
    el.setAttribute('role', 'status');
    el.innerHTML = `<b>New!</b><span></span>`;
    (el.querySelector('span') as HTMLElement).textContent = def.kind === 'pass' ? `${def.label} is yours. Every reached premium reward is ready to claim.` : champ ? `${def.label} is yours. Pick it in any mode.` : `${def.label} is yours. Wearing it now.`;
    this.root.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4200);
    this.analytics.track('store_item_granted', { sku: def.sku });
    if (this.screen === 'pick' && coatHero) this.setLobbyHero(coatHero);
  }

  /**
   * Home and the results: the painted stage goes, the 3D lobby (hero on its pedestal over the screen's scene) comes up
   * on the canvas. On the results the hero cheers on a Victory and sulks on a Defeat (render/lobby.ts \`mood\`; founder,
   * Nov 13: "in this post-game screen let's show 3d character as well with emote which represent either defeat or
   * victory").
   */
  private enterHomeLobby(mode: 'home' | 'results' = 'home'): void {
    this.stage.leave();
    if (!this.lobby) this.lobby = new Lobby(this.gr);
    if (!this.lobbyOn) this.lobby.enter();
    const home = mode === 'home';
    this.lobby.side = home ? 0 : 0.45;
    this.lobby.heroScale = home ? 0.72 : 1;
    this.lobby.footShare = home ? 0.09 : 0;
    this.lobbyOn = true;
    this.champFrozen = false;
    document.documentElement.dataset.stage = home ? 'home3d' : 'results3d';
  }

  private leaveHomeLobby(): void {
    if (!this.lobbyOn) return;
    this.lobbyOn = false;
    this.lobby?.leave();
    if (/^(home|results)3d$/.test(document.documentElement.dataset.stage ?? '')) delete document.documentElement.dataset.stage;
  }

  /** Confetti on whichever stage is up (Home's 3D lobby or the painted stage). */
  private celebrate(seconds: number): void {
    if (this.lobbyOn && this.lobby) this.lobby.confetti(seconds);
    else this.stage.confetti(seconds);
  }

  private setLobbyHero(hero: HeroId): void {
    const look = this.lookFor(hero);
    this.stage.setHero(hero, look);
    if (this.lobbyOn && this.lobby) this.lobby.setHero(hero, 0, look);
    document.documentElement.dataset.look = `${hero}:${lookKey(look)}`;
  }

  // ---------------------------------------------------------------------------------------------- screens

  private setScreen(s: Screen, el: HTMLElement | null): void {
    // QA: the lobby's document key listener left with its screen (it piled up, one per redraw, holding old screens)
    disposeLobby(this.screenEl);
    disposeHome(this.screenEl);
    this.screenEl?.remove();
    this.screenEl = el;
    this.screen = s;
    document.documentElement.dataset.screen = s;
    if (s === 'match') this.homeIntro = true;
    // force update: an outdated build reloads on the title only (never in a pick, a match or on results)
    if (s === 'title') this.updates.onTitle();
    else this.updates.offTitle();
    // the notifications card belongs to the results it came with
    if (s !== 'results') {
      this.pushAskEl?.close();
      this.pushAskEl = null;
    }
    if (s === 'pick' || s === 'match') {
      this.offerEl?.close();
      this.offerEl = null;
      this.overlay?.close();
      this.overlay = null;
      // an unanswered stats prompt must not cover the pick or match controls; the next title view asks again
      this.consentEl?.remove();
      this.consentEl = null;
    }
  }

  /** The player's own Sound switch: saved, and told to the host, whose one mute follows (tt:audio:v1). */
  private setMuted(m: boolean): void {
    sfx.setMuted(m);
    const p = loadProfile();
    p.muted = m;
    saveProfile(p);
    if (this.bridge.active) this.bridge.post('sound', { muted: m });
    // the switch is a tap: start (or resume) the audio in it
    if (!m) sfx.unlock();
  }

  /** Casual PvP: the mode chosen on the title this page (null: the remembered one). */
  private onlineMode: OnlineMode | null = null;
  /** The title's Blitz | Skirmish | Classic pick this visit (localStorage may be blocked; null = the stored one). */
  private matchModeNow: MatchMode | null = null;
  /** Home's mode and queue this visit (Mode Select's Confirm; null = the stored one). */
  private modeChoiceNow: ModeChoice | null = null;
  /** Back from the champion select of the play path: Home opens Mode Select on this variant again (once). */
  private modesAt: ModeChoice | null = null;
  /** The mode the champion select starts (the play path's vs Bots, or the remembered mode). */
  private pickMode: ModeDef | null = null;
  /** The champion select on screen came from Mode Select (its Back goes back there; a match start clears it). */
  private pickFromFlow = false;

  /**
   * The one play path's last step (HOME-MODES.md §5): Mode Select chose a mode and a variant. vs Bots opens the
   * champion select (its LOCK IN starts the match on the mode's map), Co-op and PvP join the queue (the champion select
   * follows the match found), With Friends opens the party lobby.
   */
  private startFlow(c: ModeChoice): void {
    const mode = modeById(c.mode, modeList());
    if (!mode) return;
    this.analytics.track('play_start', { mode: c.mode, variant: c.queue, difficulty: this.choice.difficulty });
    const lm = legacyMode(c.mode);
    this.matchModeNow = lm;
    saveMatchMode(lm);
    if (c.queue === 'bots') return this.showPick(mode);
    sfx.play('click');
    if (c.queue === 'friends') return this.openParty('create');
    this.onlineMode = c.queue;
    setOnlineMode(c.queue);
    this.openParty('queue');
  }

  /** Gap plan P4: the ranked match being played (its card before the match, read through the host). */
  private rankedRun: { before: Promise<RankedCard | null> } | null = null;

  /** The signed-in player's ranked card (`GET /pawlegends/ranked/me` through the host), or null. */
  private rankedCard(): Promise<RankedCard | null> {
    if (!this.bridge.active || !accountState().signedIn) return Promise.resolve(null);
    return this.integration
      .api('ranked.me')
      .then((r) => (r.ok ? parseRankedCard(r.body) : null))
      .catch(() => null);
  }

  /**
   * Gap plan P4: fill the results' ranked block once the save lands: the card is read again every 3 s (up to 45 s)
   * until it moved from the one before the match; then tier, points or the shield show. Never a guessed number.
   */
  private fillRanked(resultsEl: HTMLElement, won: boolean): void {
    const run = this.rankedRun;
    this.rankedRun = null;
    if (!run) return;
    const slot = resultsEl.querySelector<HTMLElement>('[data-slot="ranked"]');
    if (!slot) return;
    const same = (a: RankedCard | null, b: RankedCard | null) => JSON.stringify(a) === JSON.stringify(b);
    void run.before.then(async (before) => {
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        if (!resultsEl.isConnected) return;
        const after = await this.rankedCard();
        if (!after || same(before, after)) continue;
        slot.innerHTML = rankedBlockHtml(rankedResult(before, after, won));
        this.analytics.track('ranked_result' as never, { won, tier: after.tierIdx ?? -1 } as never);
        return;
      }
      if (resultsEl.isConnected) slot.innerHTML = `<p class="pl-rk-wait">Ranked points update when the match saves.</p>`;
    });
  }

  /** The Ranked tile's last gate and rank line (a change redraws Home once). */
  private rankedKey = '';

  /**
   * Gap plan P4: read the ranked gate (and, signed in through the host, the player's tier) and register the Ranked tile
   * from it. Home redraws only when the tile changed and no Mode Select is open (it would close mid-choice).
   */
  private refreshRanked(api: string): void {
    const me = this.bridge.active && accountState().signedIn ? this.integration.api('ranked.me').catch(() => null) : Promise.resolve(null);
    void Promise.all([fetchRankedStatus(api), me]).then(([st, mine]) => {
      const r = mine?.ok ? ((mine.body as { ranked?: { tierIdx?: number; points?: number; placementsLeft?: number; placementsOf?: number } } | null)?.ranked ?? null) : null;
      const rank =
        r && typeof r.tierIdx === 'number'
          ? r.tierIdx >= 12
            ? { tier: rankedLabel(r.tierIdx, r.points ?? 0) }
            : { tier: rankedLabel(r.tierIdx), ...(typeof r.points === 'number' ? { lp: r.points } : {}) }
          : r && typeof r.placementsLeft === 'number'
            ? { tier: `Placements ${Math.max(0, (r.placementsOf ?? 5) - r.placementsLeft)}/${r.placementsOf ?? 5}` }
            : undefined;
      const def = rankedModeDef(st, rank);
      const key = JSON.stringify([def.state, def.lockText ?? '', def.rank ?? null]);
      registerMode(def);
      if (key === this.rankedKey) return;
      const first = this.rankedKey === '';
      this.rankedKey = key;
      if (first && def.state !== 'live' && !st) return;
      if (this.screen === 'title' && !this.party && !this.root.querySelector('.ms-overlay')) this.showTitle(false);
    });
  }

  /** The next Home plays its entrance animations (the first of the visit, and after each match). */
  private homeIntro = true;

  /** `offer` false: a redraw after a lobby panel closed (the Treat Track panel never leads to an offer). */
  showTitle(offer = true): void {
    // CHAMPION-STORE.md: the lobby's hero is one the player may pick (its quick Play starts it)
    this.keepPlayable();
    // sim v22: a `?mode=` link picks its tile once (an unknown one says so and keeps Skirmish)
    let notice: string | undefined;
    if (this.linkMode) {
      const lm = this.linkMode;
      this.linkMode = null;
      this.matchModeNow = lm.mode;
      saveMatchMode(lm.mode);
      // Home reads its own mode key (Mode Select): the link's tile, vs Bots
      this.modeChoiceNow = { mode: lm.mode, queue: 'bots' };
      saveModeChoice(this.modeChoiceNow);
      if (!lm.known) notice = `Update to play ${lm.asked.charAt(0).toUpperCase()}${lm.asked.slice(1)}. Playing Skirmish for now.`;
      this.analytics.track('mode_link', { mode: lm.known ? lm.mode : 'unknown', asked: lm.asked });
    }
    // gap plan P4: the Ranked tile follows the live gate (GET /pawlegends/ranked/status, 30 s cache)
    if (this.partyApi) this.refreshRanked(this.partyApi);
    // casual PvP: ask the backend once; the title redraws with the mode chip when it answers yes
    if (this.partyApi && pvpKnown() === null)
      void pvpAvailable(this.partyApi).then((yes) => {
        // never under an open Mode Select (the redraw would close it mid-choice; PvP shows the next time it opens)
        if (yes && this.screen === 'title' && !this.party && !this.root.querySelector('.ms-overlay')) this.showTitle(false);
      });
    // social (SOCIAL-RANKED.md §4.3): the title pulse starts once (it runs only while the title shows)
    this.startSocialPulse();
    const first = this.screen !== 'title' || !this.screenEl;
    // the match chunk loads in the background once the title is up (a match then starts without a fetch)
    if (!this.matchPrefetched) {
      this.matchPrefetched = true;
      setTimeout(() => {
        void loadMatch().catch(() => undefined);
        // the match's lazy feel chunks too (start gate, death and respawn, the fun kit): on a slow network they
        // arrived after the gate had already dropped
        void import('../render/fx/lifecycle').catch(() => undefined);
        void import('../render/fx/fun/funKit').catch(() => undefined);
      }, 1500);
    }
    // a party of one played its solo match (D10): the party is still open, back to it
    if (this.party?.suspended && this.screen !== 'title') queueMicrotask(() => this.party?.show());
    const p = loadProfile();
    const owned = this.owned();
    const s = this.ent.snapshot();
    // lobby spec §3a: the redesigned lobby (ui/lobby), named after the hero
    const hero = this.dare?.hero ?? this.choice.hero;
    const identity: LobbyIdentity = heroIdentity(hero, heroElement(hero));
    // Home's profile strip, season and promos (HOME-MODES.md §4): only numbers the server or this device has
    const season = s.season;
    const def = season ? currentSeason() : null;
    const profile: HomeProfile = {
      name: accountState().name ?? this.integration.state().playerName ?? 'Guest',
      tier: season ? season.tier : null,
      pct: season && def ? (Math.max(0, season.xp) % def.xpPerTier) / def.xpPerTier : 0,
      xp: season ? season.xp : null,
      matches: p.matches,
    };
    const ends = season ? seasonEndText(season.endsAt) : '';
    const base = import.meta.env.BASE_URL ?? './';
    const promos: Promo[] = [
      ...(p.matches > 0
        ? [
            season
              ? { id: 'pass', title: 'Legends Pass', sub: `Tier ${season.tier}${ends ? ` · ends ${ends}` : ''}`, art: `${base}assets/lobby/promo-pass.webp${assetRev()}`, action: 'pass' as const }
              : { id: 'track', title: 'Treat Track', sub: 'Pick your next reward', art: `${base}assets/lobby/promo-pass.webp${assetRev()}`, action: 'pass' as const },
          ]
        : []),
      // sim v27: Cannon Chaos is live; the slide opens Mode Select on it
      { id: 'cannon', title: 'Cannon Chaos', sub: 'Live now · start at level 3', art: `${base}assets/lobby/promo-cannon.webp${assetRev()}`, action: 'modes', mode: 'cannon' },
      { id: 'store', title: 'Store', sub: 'Champions, coats and frames', art: `${base}assets/lobby/promo-store${this.tier === 'low' ? '-lo' : ''}.webp${assetRev()}`, action: 'store' },
    ];
    // live ops (LIVEOPS.md): Events reads the server through the host; the featured mode registers before modeList
    initLiveops((op, args) => this.integration.api(op, args), () => loadProfile().matches > 0, () => this.screen === 'title' && this.refreshMeta(false));
    this.pushBoot();
    const modes = modeList();
    const opts: HomeScreenOpts = {
      profile,
      modes,
      modeChoice: this.modeChoiceNow ?? loadModeChoice(modes),
      // Mode Select's Confirm: saved, and the old 3v3 | 5v5 key follows (the pick, party queue and rematch read it)
      onModeChoice: (c) => {
        this.modeChoiceNow = c;
        saveModeChoice(c);
        const lm = legacyMode(c.mode);
        this.matchModeNow = lm;
        saveMatchMode(lm);
        if ((c.queue === 'coop' || c.queue === 'pvp') && pvpKnown() === true) {
          this.onlineMode = c.queue;
          setOnlineMode(c.queue);
        }
      },
      // PLAY → Mode Select → variant: the champion select, the queue or the party (the one play path)
      onStart: (c) => this.startFlow(c),
      openAt: this.takeModesAt(),
      onModesOpen: (from) => this.analytics.track('play_open', { from }),
      // nav Heroes and the nameplate: the champion browser on the Home hero, with SELECT / BUY / UNLOCK under the
      // description (Nov 12, the founder). Never a match: the match still starts only from PLAY → Mode Select.
      onHeroes: () => {
        const h = this.dare?.hero ?? this.choice.hero;
        void openChampInfo({
          hero: h,
          within: this.screenEl,
          look: (x) => this.lookFor(x),
          onBrowse: (x) => this.setLobbyHero(x),
          onClose: () => this.setLobbyHero(this.dare?.hero ?? this.choice.hero),
          action: { state: (x) => this.heroAction(x), on: (x, kind) => (kind === 'select' ? this.selectHomeHero(x) : this.openStore('lobby', 'champions', x)) },
        });
      },
      promos,
      seasonEnd: ends ? `Ends ${ends}` : '',
      base,
      firstTime: p.matches === 0,
      last: this.choice,
      dare: this.dare,
      muted: sfx.isMuted,
      identity,
      storeOpen: s.storeOpen,
      frame: bestFrame(owned, p.wornFrame),
      title: titleOf(owned, p.wornTitle),
      portrait: this.badgePortrait(),
      signedIn: accountState().signedIn,
      isApp: this.isApp(),
      firstLine: rookieAvailable() ? 'Your first match is a guided Rookie match.' : 'Your first match is a guided match against Easy bots.',
      difficulties: pickable(),
      difficultyNote: canPickDifficulty(p.matches, p.veteran) ? undefined : `More bots after ${PICK_DIFFICULTY_FROM} matches.`,
      // the variant step's bots difficulty: remembered at once (the next PLAY opens on it)
      onDifficulty: (d) => {
        this.choice = { ...this.choice, difficulty: d };
        const q = loadProfile();
        q.difficulty = d;
        saveProfile(q);
      },
      // sim v22: a `?mode=` link's unknown mode says "Update to play …" as Home opens
      ...(notice ? { notice } : {}),
      // the match chunk loads during the 0.4 s dolly (it is usually prefetched already)
      playOut: () => {
        void loadMatch().catch(() => undefined);
        return this.lobbyOn && this.lobby ? this.lobby.playOut() : this.stage.playOut();
      },
      sound: (n) => sfx.play(n),
      onPlay: (c, seed) => {
        if (seed !== undefined) this.dare = null;
        this.startMatch(c, seed);
      },
      onChoose: () => {
        sfx.play('click');
        this.showPick();
      },
      onParty: this.partyApi
        ? () => {
            sfx.play('click');
            this.openParty('create');
          }
        : undefined,
      onJoinCode: this.partyApi
        ? () => {
            sfx.play('click');
            this.openParty('code');
          }
        : undefined,
      // casual PvP (V16.md §5): the mode chip, only when the backend verifies PvP for this build's sim
      onlineMode:
        this.partyApi && pvpKnown() === true
          ? {
              mode: this.onlineMode ?? onlineMode(p.matches),
              // no match-count lock for now (PVP_UNLOCK_MATCHES 0): PvP is one tap from the first session
              locked: p.matches < PVP_UNLOCK_MATCHES,
              played: p.matches,
              needed: PVP_UNLOCK_MATCHES,
              onMode: (m) => {
                this.onlineMode = m;
                setOnlineMode(m);
              },
            }
          : undefined,
      // Quick Play co-op (M1A-IMPL.md §1): one tap for everyone, a brand-new guest included (zero friction: no
      // sign-in, no unlock). The big button stays the guided solo match; a new player queues with the newbie hint.
      onOnline:
        this.partyApi
          ? () => {
              sfx.play('click');
              this.openParty('queue');
            }
          : undefined,
      onMute: (m) => this.setMuted(m),
      onStore: () => this.openStore('lobby'),
      onSettings: () => this.openSettings(),
      // Social, ranked and boards (SOCIAL-RANKED.md §14): through the host's session, so embedded only
      onSocial: this.bridge.active ? () => this.openSocial() : undefined,
      socialBadge: this.socialBadge,
      onCollection: p.matches > 0 ? () => this.openCollection() : undefined,
      // round 1: in the guided matches the hero quest names the hero being played ("Win with Cacklejaw" while
      // playing Sage); GAPS A1: after them it is the day's round-robin hero (each of the 8 every 8 days)
      quests: p.matches > 0 ? questViews(loadQuests(), followsHero(p.matches) ? this.choice.hero : undefined) : undefined,
      // rewards-cloud: the Welcome Path and the Lucky Treat odds under Today's quests
      todayExtra: p.matches > 0 ? todayExtraHtml() : '',
    };
    // The Home re-render fix (Nov 12): a redraw of the Home on screen (a panel closed, a Treat Track | Legends Pass tab
    // switch, an entitlement or progress refresh, an equip) patches the changed parts into the same Home. Rebuilding
    // it replayed every entrance animation behind the next panel and re-entered the 3D lobby.
    const patched = !first && patchHome(this.screenEl, opts);
    // Home (HOME-MODES.md §4): the 3D hero stands centred on the key art's ring (founder, Nov 13: Home shows the 3D
    // champion; the champion select, results, cards and HUD keep the painted art)
    if (!patched) this.enterHomeLobby();
    this.setLobbyHero(this.dare?.hero ?? this.choice.hero);
    if (!patched) {
      // the entrance plays on the first Home of the visit and on the one after a match; every other Home is still
      this.setScreen('title', homeScreen(this.root, { ...opts, still: !this.homeIntro }));
      this.homeIntro = false;
    }
    if (first) this.analytics.track('title_view', { first_time: p.matches === 0, dare: !!this.dare });
    if (offer) this.maybeOffer('lobby');
    this.maybeConsent();
  }

  /** The variant Home reopens Mode Select on (Back from the champion select), once. */
  private takeModesAt(): ModeChoice | null {
    const at = this.modesAt;
    this.modesAt = null;
    return at;
  }

  /** The champion select. `mode`: the play path's vs Bots mode (else the remembered one, as after a match). */
  showPick(mode?: ModeDef): void {
    if (mode) {
      this.pickMode = mode;
      this.pickFromFlow = true;
    }
    const flow = (this.pickFromFlow ? this.pickMode : null) ?? modeById((this.modeChoiceNow ?? loadModeChoice()).mode, modeList()) ?? null;
    this.leaveHomeLobby();
    this.stage.enter('pick');
    this.setLobbyHero(this.choice.hero);
    const p = loadProfile();
    this.setScreen(
      'pick',
      pickScreen(this.root, {
        // the play path: the mode's map (Classic: Hearthwood) or mutator (Blitz) rides on the choice LOCK IN starts
        initial: flow && p.matches > 0 ? botsChoice(this.choice, this.choice.difficulty, flow) : this.choice,
        // Sim v19: the seats match the match it starts (startMatch's rule: 5v5 Classic after the first match)
        teamSize: p.matches > 0 && (flow ? flow.size === '5v5' : (this.choice.map ?? MODE_MAP[this.matchModeNow ?? loadMatchMode()]) === 'hearthwood') ? 5 : 3,
        ...(flow && p.matches > 0 ? { modeLine: pillText(flow, 'bots') } : {}),
        owned: this.owned(),
        champions: this.integration.championTiles(),
        // CHAMPION-STORE.md §10: locked champions show their unlock row; LOCK IN on one is Practice
        champs: {
          state: () => this.champs(),
          isApp: this.isApp(),
          store: this.ent.snapshot().storeOpen,
          onUnlock: (h, via) => this.unlockChamp(h, via),
          onBuy: (h) => {
            const sku = champSkuOf(h);
            if (!this.checkout.buy(sku)) return;
            this.pendingReveal = sku;
            this.analytics.track('checkout_start', { sku });
          },
          onLockedView: (h) => {
            if (this.lockedSeen.has(h)) return;
            this.lockedSeen.add(h);
            this.analytics.track('champ_locked_view', { hero: h });
          },
        },
        looks: p.looks as Record<HeroId, Partial<Look>>,
        playerName: this.integration.state().playerName ?? null,
        onLook: (h, look) => {
          const q = loadProfile();
          q.looks[h] = { coat: look.coat, chroma: look.chroma };
          saveProfile(q);
          this.setLobbyHero(h);
        },
        onHero: (h) => {
          sfx.play('click');
          // champion select: the announcer says the hero's name (a newer pick cuts the last name off)
          sfx.voice(nameLine(h), { sting: false });
          const prev = this.choice.hero;
          this.choice = { ...this.choice, hero: h };
          this.swapped = null;
          this.setLobbyHero(h);
          // sim v14: the picked hero, its side and the last hero per side (the hero left behind on the other side too)
          // are remembered, so a reload opens on the same side and hero
          const q = loadProfile();
          if (HEROES[prev] && HEROES[prev].side !== HEROES[h].side) q.lastBySide[HEROES[prev].side] = prev;
          q.hero = h;
          q.side = HEROES[h].side;
          q.lastBySide[q.side] = h;
          saveProfile(q);
        },
        // sim v14 (DOGS-V13 §2): dogs wait for the guided first match (a dog dare skips it)
        dogsLocked: p.matches === 0 && !(this.dare && HEROES[this.dare.hero]?.side === 'dog'),
        onStart: (c, opts) => {
          sfx.play('click');
          this.startMatch(c, undefined, opts?.practice === true);
        },
        onBack: () => {
          // Audit UX-08: Back from a "Try <hero>" pick goes home on the hero the player had, not the teased one
          if (this.beforeTry) this.choice = { ...this.choice, hero: this.beforeTry.hero, trick: this.beforeTry.trick };
          this.beforeTry = null;
          // the play path: Back is one step, to the variant (vs Bots) of the mode
          if (this.pickFromFlow) this.modesAt = { mode: flow?.id ?? 'skirmish', queue: 'bots' };
          this.pickFromFlow = false;
          this.showTitle();
        },
        difficulties: pickable(),
        difficultyNote: canPickDifficulty(p.matches, p.veteran) ? undefined : `Easy bots. More bots after ${PICK_DIFFICULTY_FROM} matches.`,
        numbers: p.numbers,
        onNumbers: (on) => {
          const q = loadProfile();
          q.numbers = on;
          saveProfile(q);
        },
        // round 1: a MOBA veteran need not sit through two more Easy matches (match 1 stays the guided one)
        onVeteran:
          p.matches >= 1 && !canPickDifficulty(p.matches, p.veteran)
            ? () => {
                const q = loadProfile();
                q.veteran = true;
                saveProfile(q);
                this.choice = { ...this.choice, difficulty: 'normal' };
                this.showPick();
              }
            : undefined,
      }),
    );
  }

  // ------------------------------------------------------------------------------------------- party play

  /** Open the party chunk: create a party at once (the first tap), join a link's code, type a code, or resume a seat. */
  /**
   * The Quick Play queue the title's online buttons start: Co-op, or PvP. PvP is 5v5 Classic when the mode toggle
   * picks it (no match-count lock; the toggle shows after the guided first match), else 3v3 casual (no match-count
   * lock either while PVP_UNLOCK_MATCHES is 0).
   */
  private queueModeFor(matches: number): 'coop' | 'casual' | 'classic' | 'ranked' {
    if (pvpKnown() !== true) return 'coop';
    // gap plan P4: PLAY → Ranked → PvP queues ranked (the relay checks the gate and the account)
    if (this.onlineMode === 'pvp' && (this.modeChoiceNow ?? loadModeChoice()).mode === 'ranked') return 'ranked';
    return pvpQueueFor(this.onlineMode ?? onlineMode(matches), matches, (this.matchModeNow ?? loadMatchMode()) === 'classic');
  }

  private openParty(mode: 'create' | 'join' | 'code' | 'resume' | 'queue' | 'back', code: string | null = null): void {
    if (!this.partyApi) return;
    // the party survived a solo match (D10): the title's button shows it again
    if (this.party) {
      if (this.party.suspended) this.party.show();
      return;
    }
    if (this.partyOpening) return;
    const api = this.partyApi;
    const p = loadProfile();
    const picks = canPickDifficulty(p.matches, p.veteran);
    this.partyOpening = true;
    void import('../party')
      .then(({ openParty }) => {
        this.partyOpening = false;
        if (this.party) return;
        this.party = openParty(
          {
            root: this.root,
            api,
            hero: this.playableHero(this.choice.hero),
            trick: this.choice.trick,
            difficulty: picks ? this.choice.difficulty : 'easy',
            difficulties: picks ? ['easy', 'normal', 'hard'] : ['easy'],
            maxDifficulty: picks ? 'hard' : 'easy',
            newbie: p.matches === 0,
            matches: p.matches,
            // PvP from the title's button: 5v5 Classic when picked (open to every player after the guided first
            // match), else 3v3 casual (no match-count lock for now: a 0-match guest queues it too)
            queueMode: this.queueModeFor(p.matches),
            build: String(import.meta.env.VITE_PAWLEGENDS_BUILD ?? 'dev').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 32) || 'dev',
            // P9: the embed host mints a single-use ticket with its own session; standalone players are unscored guests
            ticket: () => this.integration.partyTicket(),
            guestKey: () => partyGuestKey(),
            preload: () => loadMatch(),
            startMatch: (host, match, _view, info) => {
              // gap plan P4: a ranked match remembers the ranked card before it, for the results block
              this.rankedRun = info?.ranked ? { before: this.rankedCard() } : null;
              this.startPartyMatch(host, match, info?.backfill === true);
            },
            // Quick Play: the remembered side, the analytics context and the pick's default hero per side
            // a brand-new player searches as Cats by default (DOGS is the solo title's unlock after match 1)
            queueSide: p.matches === 0 ? 'cat' : lastQueueSide(),
            saveQueueSide: (side) => setLastQueueSide(side),
            mmInfo: () => ({ surface: this.isApp() ? 'app' : this.bridge.active ? 'embed' : 'web', matches: loadProfile().matches, guest: !accountState().signedIn }),
            heroForSide: (side) => this.playableHero(heroForSide(loadProfile(), side)),
            // CHAMPION-STORE.md §8.1: starters, the week's rotation and owned champions (the relay checks the same)
            champLock: (h) => lockReason(h, this.champs(), this.isApp()),
            // a backfill took the seat while this player was away: the match ends here, the party screen says why
            endMatch: () => {
              this.session?.dispose();
              this.session = null;
              this.showTitle(false);
            },
            startSolo: (difficulty) => this.startMatch({ ...this.choice, difficulty: difficulty as Choice['difficulty'] }),
            notify: (n) => this.session?.rail(n),
            close: () => {
              this.party = null;
              this.partyCode = null;
              if (this.screen === 'title') this.showTitle(false);
            },
            inviteUrl,
            share: (url, text) => this.bridge.post('share', { kind: 'party', url, text }),
            analytics: (event, props) => this.analytics.track(event as never, props as never),
            // CHAT-AVATARS §2.7: report a party chat line through the host (signed-in players only)
            chatReport: (mid, kind) =>
              accountState().signedIn ? this.integration.api('chat.report', { msg: mid, kind }).then((r) => r.ok) : Promise.resolve(false),
            // CHAT-AVATARS §5: the relay's push for a DM, so a party player sees it without waiting for a poll
            dmNotice: (thread) => {
              if (this.social && !this.social.closed) return this.social.dmNotice(thread);
              this.chatUnread++;
              this.paintSocialBadge();
            },
          },
          { mode, code },
        );
      })
      .catch((err: unknown) => {
        this.partyOpening = false;
        reportCrash('window', err);
      });
  }
  private partyOpening = false;

  /** The Social sheet (SOCIAL-RANKED.md §14.2): one at a time, over the lobby. */
  private social: import('../social/socialSheet').SocialSheet | null = null;
  /** Requests and invites waiting (the lobby button's badge), from the title pulse. */
  private socialBadge = 0;
  /** Unread DMs (CHAT-AVATARS §6.1), added to the badge. */
  private chatUnread = 0;
  private socialPulse: ReturnType<typeof setInterval> | null = null;
  private socialRev: string | undefined;
  /** Invite ids already toasted (an invite lives 3 min; the set is tiny). */
  private readonly socialToasted = new Set<string>();

  /** The lobby's Friends button badge, in place (the title is not re-rendered for a pulse). */
  private paintSocialBadge(): void {
    const btn = this.root.querySelector<HTMLElement>('[data-testid="lobby-social"]');
    if (!btn) return;
    let b = btn.querySelector<HTMLElement>('.lb-social-badge');
    const n = this.socialBadge + this.chatUnread;
    if (!n) return void b?.remove();
    if (!b) {
      b = document.createElement('i');
      b.className = 'lb-social-badge';
      btn.appendChild(b);
    }
    b.textContent = n > 9 ? '9+' : String(n);
  }

  private openSocial(tab?: import('../social/socialSheet').SocialTab): void {
    if (this.social && !this.social.closed) return;
    sfx.play('click');
    void import('../social/socialSheet')
      .then(({ SocialSheet }) => {
        if (this.social && !this.social.closed) return;
        this.social = new SocialSheet(
          this.root,
          {
            api: (op, args) => this.integration.api(op, args),
            signedIn: () => accountState().signedIn,
            partyCode: () => {
              const v = this.party?.state.view;
              return v && v.phase === 'lobby' && !this.party?.state.inMatch ? v.code : null;
            },
            joinParty: (code) => this.openParty('join', code),
            // SPECTATE.md: Watch on a friend's row, and the featured "Watch live" row (needs the relay)
            ...(this.partyApi ? { watch: (target: { room: string; name: string } | { featured: true }) => this.openSpectate(target) } : {}),
            signIn: () => this.integration.requestSignIn('save-progress'),
            // the one play path: Play Casual opens Mode Select on Skirmish's PvP variant (Find match is one tap)
            playCasual: () => {
              this.modesAt = { mode: 'skirmish', queue: 'pvp' };
              if (this.screen === 'title' && !this.session) this.showTitle(false);
            },
            // CHAT-AVATARS §7.4: the picker's owned borders (champions only: no Token Tails cats, NO-TOKENTAILS.md)
            ownedItems: () => [...this.ent.snapshot().items],
            inMatch: () => !!this.session,
            onUnread: (n) => {
              this.chatUnread = Math.max(0, n);
              this.paintSocialBadge();
            },
          },
          tab,
        );
      })
      .catch((err: unknown) => reportCrash('window', err));
  }

  /**
   * The title pulse (SOCIAL-RANKED.md §4.3, §5): every 30 s on the title while the tab is visible and the player is
   * signed in; never in a match. A waiting invite shows one toast with Join.
   */
  private startSocialPulse(): void {
    if (this.socialPulse || !this.bridge.active) return;
    const beat = async (): Promise<void> => {
      if (this.screen !== 'title' || !accountState().signedIn) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const r = await this.integration.api('social.pulse', this.socialRev ? { rev: this.socialRev } : {});
      if (!r.ok || r.status === 204 || !r.body) return;
      const body = r.body as { rev?: string; invites?: { id?: string; from?: { name?: string }; party?: string }[]; chat?: { unread?: number } };
      this.socialRev = typeof body.rev === 'string' ? body.rev : undefined;
      this.socialBadge = body.invites?.length ?? 0;
      this.chatUnread = typeof body.chat?.unread === 'number' ? Math.max(0, body.chat.unread) : this.chatUnread;
      this.paintSocialBadge();
      // the pulse answers "changed" on any friend's presence change too: toast each invite once, not on every change
      const inv = body.invites?.find((i) => !i.id || !this.socialToasted.has(i.id));
      if (inv?.id) this.socialToasted.add(inv.id);
      if (inv?.party && typeof inv.from?.name === 'string') {
        const { inviteToast } = await import('../social/socialSheet');
        inviteToast(document, inv.from.name, () => this.openParty('join', inv.party!));
      }
    };
    this.socialPulse = setInterval(() => void beat(), 30_000);
    void beat();
  }

  /** PvP reports (SOCIAL-RANKED.md §8): one book per room, kept for the results screen of that room. */
  private reportBook: ReportBook | null = null;
  private reportBookFor(room: string): ReportBook {
    if (this.reportBook?.room === room) return this.reportBook;
    this.reportBook = new ReportBook(room, (slot, reason, tick) =>
      this.integration
        .api('report.send', { room, slot, reason, ...(tick !== null ? { tick } : {}) })
        .then((r) => reportOutcomeOf(r)),
    );
    return this.reportBook;
  }

  /** A party match: the MatchSession runs on the party's NetHost (no first-session rules, no speed). */
  private startPartyMatch(host: () => import('../net/net-host').NetHost, match: MatchMsg, backfill = false): void {
    const p = loadProfile();
    const slot = match.you.slot;
    const hero = match.config.picks[slot] as Choice['hero'];
    const trick = match.config.tricks[slot] as Choice['trick'];
    const difficulty = match.config.difficulty as Choice['difficulty'];
    const owned = this.owned();
    const look = this.lookFor(hero);
    const setup: MatchSetup = {
      // UX pass 2: the account's profile name, else the party display name the friends see for this seat
      playerName: this.integration.state().playerName ?? match.names[slot] ?? null,
      hero,
      trick,
      difficulty,
      seed: match.config.seed,
      speed: 1,
      // sim v19: a 5v5 Classic room plays Hearthwood Divide (PROTO 4 carries the map on the match frame and config)
      ...(((match as { map?: string }).map ?? (match.config as { map?: string }).map) === 'hearthwood' ? { map: 'hearthwood' as const } : {}),
      firstMatch: false,
      newPlayer: p.matches < 5,
      // party play: quick chat and its 4 emotes replace the solo Wave chip (T opens the chat wheel)
      emote: false,
      muted: sfx.isMuted,
      look,
      frame: bestFrame(owned, p.wornFrame),
      title: titleOf(owned, p.wornTitle),
      companions: [],
      guide: 'off',
      knowsUlt: p.knowsUlt,
      pingTip: false,
      // the Esc menu's Forfeit is a surrender vote in party play (NetHost), open from the difficulty's forfeit time
      // (casual PvP: 4:00, V16.md §3.1.2)
      forfeitFrom: match.mode === 'casual' ? 7200 : forfeitTick(99, difficulty),
      skinFx: p.skinFx,
      showcase: [],
      host: host as unknown as MatchSetup['host'],
      // a resume or a reload joins a running match (the relay sends startInMs 0): no countdown, no VS intro
      party: {
        slot,
        names: match.names,
        rejoin: match.startInMs === 0,
        newbie: p.matches === 0,
        hideNames: hideNames(),
        // MATCH-CHAT.md §3: report an in-match line through the host (signed-in players only)
        chatReport: (mid, kind) =>
          accountState().signedIn ? this.integration.api('chat.report', { msg: mid, kind }).then((r) => r.ok) : Promise.resolve(false),
        ...(match.mode === 'coop' ? { coop: true, backfill } : {}),
        ...(match.mode === 'casual' ? { coop: true, backfill, pvp: true, report: this.reportBookFor(match.room) } : {}),
      },
    };
    this.lastSetup = setup;
    this.analytics.track('match_start', { hero, difficulty, trick, dare: false, party: true, load_ms: sinceLoadMs(), first_match: p.matches === 0 });
    const veil = loadingVeil(this.root, 'Into the Crossing...', match.mode === 'casual' ? 'PvP' : match.mode === 'coop' ? (backfill ? 'Joining your new team' : 'With your team') : 'With friends', { name: HERO_TEXT[hero].title, matches: p.heroMatches[hero] ?? 0 });
    this.setScreen('match', null);
    this.leaveHomeLobby();
    this.stage.leave();
    this.session?.dispose();
    this.session = null;
    const token = ++this.matchToken;
    void loadMatch()
      .then(({ MatchSession }) => {
        if (token !== this.matchToken) return;
        this.beginSession(MatchSession, setup, { hero, trick, difficulty }, veil);
      })
      .catch((err: unknown) => {
        veil.remove();
        reportCrash('window', err);
        this.showTitle();
      });
  }

  /** After a party match's results: back to the party (rematch or leave there). */
  private backToParty(): void {
    this.session?.dispose();
    this.session = null;
    this.showTitle(false);
    this.party?.matchOver();
  }

  private startMatch(pick: Choice, seed?: number, practice = false): void {
    this.beforeTry = null;
    this.pickFromFlow = false;
    // the player chose this match's hero: a pending keepPlayable swap is not undone after it
    this.swapped = null;
    // CHAMPION-STORE.md §6: a locked champion plays only as Practice (asked for on the pick, or a dare's hero): the
    // match saves nothing. Any other start swaps a locked hero for a playable one (the lobby's quick Play).
    // Sim v27 (V27.md §2): the Practice ground plays any champion and saves nothing, like Practice
    const sandbox = seed === undefined && pick.mutator === 'practice';
    if (sandbox) practice = true;
    else if (!this.playable(pick.hero)) {
      if (seed !== undefined) practice = true;
      else if (!practice) pick = { ...pick, hero: this.playableHero(pick.hero) };
    } else practice = false;
    this.practice = practice;
    this.sandbox = sandbox;
    if (practice) this.analytics.track('practice_try', { hero: pick.hero });
    const p = loadProfile();
    // the first-session script (fun plan F1): match 1 is Rookie, matches 2 and 3 Easy, then the player's pick;
    // a dare keeps its own bots (the seed and the difficulty make the dare)
    // the Practice ground plays Normal's towers and never counts as a match of the script
    const c: Choice = { ...pick, difficulty: sandbox ? 'normal' : seed !== undefined ? pick.difficulty : difficultyFor(p.matches, pick.difficulty, undefined, undefined, p.veteran) };
    // Sim v19: 5v5 Classic is the toggle's choice (a rematch keeps it); the first match and a dare stay 3v3
    const stored = this.matchModeNow ?? loadMatchMode();
    const picked = pick.mutator && pick.mutator !== 'none' ? pick.mutator : undefined;
    const map: MapId | undefined = seed === undefined && p.matches > 0 && (pick.map ?? (picked ? 'crossing' : MODE_MAP[stored])) === 'hearthwood' ? 'hearthwood' : undefined;
    // Sim v22: Blitz is the 3v3 tile's mutator (never on the first match, a dare or Classic). Sim v27: so are Cannon
    // Chaos and the weekly twist; the Practice ground is open from the first visit.
    const wanted = pick.mutator ?? (pick.map ? 'none' : MODE_MUTATOR[stored]);
    const mutator: Mutator | undefined = seed === undefined && !map && wanted !== 'none' && MUTATORS.includes(wanted) && (p.matches > 0 || wanted === 'practice') ? wanted : undefined;
    delete c.map;
    delete c.mutator;
    this.choice = isRookie(c.difficulty) ? { ...c, difficulty: pick.difficulty } : c;
    // Practice never becomes the remembered hero (the lobby keeps a playable one)
    if (practice) this.choice = { ...this.choice, hero: this.playableHero(this.choice.hero) };
    p.hero = practice ? this.choice.hero : c.hero;
    p.side = HEROES[c.hero]?.side ?? p.side;
    p.lastBySide[p.side] = c.hero;
    p.trick = c.trick;
    if (!isRookie(c.difficulty)) p.difficulty = c.difficulty;
    const tips = tipsDue(p);
    p.tipsNext = false;
    saveProfile(p);
    const owned = this.owned();
    const look = this.lookFor(c.hero);
    // no probe here: the match uses the palette cached at its start (a probe landing mid-match would rebuild the rig)
    const setup: MatchSetup = {
      ...c,
      // UX pass 2: the signed-in player's profile name over their own hero (guests: "You")
      playerName: this.integration.state().playerName,
      seed,
      speed: this.speed,
      ...(map ? { map } : {}),
      ...(mutator ? { mutator } : {}),
      firstMatch: tips,
      newPlayer: p.matches < 5,
      emote: owned.items.has('emote.starter') || owned.unlocks.has('emote.wave'),
      muted: sfx.isMuted,
      look,
      frame: bestFrame(owned, p.wornFrame),
      title: titleOf(owned, p.wornTitle),
      companions: [],
      guide: p.tipsOff ? 'off' : seed !== undefined && p.matches > 0 ? 'off' : guideMode(p.matches),
      knowsUlt: p.knowsUlt && p.matches > 0,
      // GAPS B1: the ping tip in the player's second match
      pingTip: p.matches === 1 && !p.tipsOff,
      // GAPS B2: Forfeit in the pause menu from this tick (never in matches 1–3 or on Rookie)
      // sim v27: the Practice ground has no Forfeit (Leave goes home and counts nothing)
      forfeitFrom: sandbox ? 0 : forfeitTick(p.matches, c.difficulty),
      skinFx: p.skinFx,
      showcase: [],
    };
    this.lastSetup = setup;
    this.analytics.track('match_start', { hero: c.hero, side: HEROES[c.hero]?.side ?? 'cat', difficulty: c.difficulty, trick: c.trick, dare: seed !== undefined, load_ms: sinceLoadMs(), first_match: p.matches === 0, mode: map ? 'classic' : mutator ? MUTATOR_MODE[mutator] : 'skirmish', map: map ?? 'crossing', mutator: mutator ?? 'none' });
    for (const item of lookItems(look)) this.analytics.track('item_seen_in_match', { item, sku: skuOfItem(item) });
    this.frameMs = [];
    // GAPS A6: the loading screen names this hero's match count
    const veil = loadingVeil(this.root, map ? 'Into Hearthwood Divide...' : mutator ? MUTATOR_VEIL[mutator] : 'Into the Crossing...', undefined, {
      name: HERO_TEXT[c.hero].title,
      matches: p.heroMatches[c.hero] ?? 0,
    });
    this.setScreen('match', null);
    this.leaveHomeLobby();
    this.stage.leave();
    this.session?.dispose();
    this.session = null;
    this.pendingPause = false;
    const token = ++this.matchToken;
    void loadMatch()
      .then(({ MatchSession, mapPreviewFor }) => {
        if (token !== this.matchToken) return;
        // sim v22: a top-down card of Hearthwood on the veil while the match loads
        const pv = mapPreviewFor(setup.map);
        if (pv) veil.appendChild(pv);
        this.beginSession(MatchSession, setup, c, veil);
      })
      .catch((err: unknown) => {
        veil.remove();
        reportCrash('window', err);
        this.showTitle();
      });
  }

  /** Audit UX-08: the hero and trick before the results' "Try <hero>" swapped them in (Back on the pick restores them). */
  private beforeTry: { hero: HeroId; trick: Choice['trick'] } | null = null;

  /** A newer startMatch call wins over a match chunk still loading. */
  private matchToken = 0;
  /** A host pause (or a hidden tab) that arrived while the match chunk loaded: applied when the session starts. */
  private pendingPause = false;
  private matchPrefetched = false;

  private beginSession(Session: typeof MatchSession, setup: MatchSetup, c: Choice, veil: HTMLElement): void {
    this.session = new Session(this.gr, this.root, setup, {
      onEnd: (e) => this.showResults(e),
      onLeave: (counted) => {
        // Quick Play: leaving leaves the matched party (a backfill or a bot takes the seat), back to the title
        if (setup.party?.coop && this.party) {
          this.party.leaveParty('match');
          this.session?.dispose();
          this.session = null;
          return this.showTitle();
        }
        if (setup.party) return this.backToParty();
        if (counted) this.recordLeave(c, counted);
        this.session?.dispose();
        this.session = null;
        this.showTitle();
      },
      onMute: (m) => this.setMuted(m),
      // Audit UX-09: Settings from the pause menu (the menu comes back when it closes)
      onSettings: (done) => this.openSettings(done),
      onError: (msg) => {
        // Reported as a worker crash; the window listener then only shows the overlay for it.
        const err = new Error(`sim: ${msg}`);
        reportCrash('worker', err);
        throw err;
      },
      onPaused: (paused) => this.bridge.post('paused', { paused }),
      onTalent: (tier, choice) => this.analytics.track('talent_pick', { hero: c.hero, tier, choice }),
      // party play analytics (MULTIPLAYER.md §10): mp_* names only, flat props
      track: (event, props) => {
        if (!isMpEvent(event)) return;
        // M1A-IMPL.md §7.1: the match events say whether this was a friend party or Quick Play co-op
        const mode = event === 'mp_match_start' || event === 'mp_match_end' ? { mode: setup.party?.coop ? 'coop' : 'party', backfill: setup.party?.backfill === true } : {};
        this.analytics.track(event, { ...props, ...mode });
      },
    });
    if (this.pendingPause || document.hidden) this.session.setPaused(true);
    this.pendingPause = false;
    // PERF-IOS: the governor ignores the match's first seconds (shader compiles, pools)
    this.governor.hold(performance.now() + GOV.WARMUP_MS);
    // PERF-IOS P2-6 / §8 Track C: the veil stays up until the match's programs are compiled (WebKit stalled 942 ms at
    // the first fight, then 75–186 ms at the drop and at first lane contact while the veil left after 250 ms): once
    // the roster is known, GameView.warmup() builds every hero of both teams (the enemies are hidden by the fog until
    // first contact), shows the hidden pools and draws one frame with shadows, all behind the veil, capped in time
    const session = this.session;
    const t0 = performance.now();
    void warmMatch(
      () => (this.session === session ? session.view.hasRoster : null),
      () => session.view.warmup(t0 + WARM.totalMs),
      (ms) => new Promise((r) => setTimeout(r, ms)),
      () => performance.now() - t0,
    ).then((r) => {
      if (r.ms >= 0) {
        document.documentElement.dataset.warmMs = String(Math.round(r.ms));
        document.documentElement.dataset.warmed = r.warmed ? '1' : '0';
      }
      veil.classList.add('out');
      setTimeout(() => veil.remove(), 650);
    });
  }

  /**
   * Audit UX-03: from match 4 (solo, off Rookie) a Leave is recorded as a forfeit (client meta only, no sim op): a
   * match and a loss on the profile, the full ladder loss, and match_end with reason 'leave' (the forfeit-rate
   * measure saw nothing before). No Treat XP, quests or grade.
   */
  private recordLeave(c: Choice, at: { ticks: number; takedowns: number }): void {
    const seconds = Math.floor(at.ticks / 30);
    recordMatch(false, seconds, c.difficulty);
    recordLadder({ won: false, difficulty: c.difficulty, hero: c.hero, heroName: HERO_TEXT[c.hero].title, seconds, takedowns: at.takedowns, grade: 'C', forfeit: true });
    this.analytics.track('match_end', { result: 'lost', reason: 'leave', length: seconds, hero: c.hero, difficulty: c.difficulty, takedowns: at.takedowns, pl_match_len_s: seconds, pl_rookie: isRookie(c.difficulty) });
  }

  /** Sim v22: the Choice fields that start `mode` (Classic: the map; Blitz: the mutator; Skirmish: neither). */
  private modeChoice(mode: MatchMode): Pick<Choice, 'map' | 'mutator'> {
    return mode === 'classic' ? { map: 'hearthwood' } : mode === 'blitz' ? { mutator: 'blitz' } : { map: 'crossing', mutator: 'none' };
  }

  /**
   * Sim v22 (WR-BS-PLAN.md §5): the results' context button. After a Skirmish or Classic loss: "Quick Blitz? ~3 min";
   * after two Blitz in a row: "Take {hero} into Skirmish" (feeds the deep mode). Otherwise none.
   */
  private nextMode(played: MatchMode, won: boolean, hero: HeroId, setup: MatchSetup | null): { label: string; sub: string; onNext(): void } | null {
    const go = (mode: MatchMode): void => {
      sfx.play('click');
      this.matchModeNow = mode;
      saveMatchMode(mode);
      this.analytics.track('rematch_click', { kind: 'mode', hero, mode, from: played });
      this.startMatch({ ...(setup ? { hero: setup.hero, trick: setup.trick, difficulty: setup.difficulty } : this.choice), ...this.modeChoice(mode) });
    };
    if (played !== 'blitz' && !won) return { label: 'Quick Blitz?', sub: `~${MODE_MINUTES.blitz} min`, onNext: () => go('blitz') };
    if (played === 'blitz' && this.blitzRun >= 2) return { label: `Take ${HERO_TEXT[hero].title} into Skirmish`, sub: `~${MODE_MINUTES.skirmish} min`, onNext: () => go('skirmish') };
    return null;
  }

  private showResults(e: MatchEnd): void {
    // UX pass 2: the username the match showed names the player's row (and the MVP / best lines)
    const userName = this.session?.playerName ?? null;
    // MATCH-MOMENTS.md: the champion's name this match (a worn card's cat), for history and the share card
    const momentName = this.session?.card?.name ?? null;
    const won = e.result.outcome === 'won';
    const seconds = Math.floor(e.result.ticks / 30);
    const setup = this.lastSetup;
    // Sim v22: a Blitz match counts as a match but sets no fastest win, moves no ladder and has no dare link; its
    // Treat XP is paid per minute like Skirmish (WR-BS-PLAN.md §9)
    // Sim v27: Cannon Chaos and the weekly twists count like Blitz (a mutator match: per-minute pay, no ladder, no
    // fastest win, no dare); the Practice ground counts as nothing at all
    const sandbox = this.sandbox && !(e.replay as { party?: unknown }).party;
    this.sandbox = false;
    const blitz = (e.replay.mutator ?? 'none') !== 'none';
    const draw = e.result.draw === true;
    const playedMode: MatchMode = setup?.map === 'hearthwood' ? 'classic' : e.replay.mutator === 'blitz' ? 'blitz' : 'skirmish';
    this.blitzRun = e.replay.mutator === 'blitz' ? this.blitzRun + 1 : 0;
    const rec = sandbox ? { firstWin: false, best: false, second: false } : recordMatch(won, seconds, e.replay.difficulty, !blitz);
    this.matchesThisSession++;
    this.human.match(seconds);
    // Bridge: the replay is the record; the summary is display only (host `summaryOf`).
    // Party play (MULTIPLAYER.md §6): a party match never posts a solo replay; its v:2 result goes to the host, which
    // posts it to `/live` (checked against the relay's stored room log). Only its owner ever sees the save status. A
    // room the relay said is unscored (no ticket, no secret, a suspected referee) posts nothing.
    const partyEnd = (e.replay as { party?: { room: string; slot: number; scored: boolean | null } }).party;
    if (partyEnd && partyEnd.scored !== false && (e.replay.outcome === 'won' || e.replay.outcome === 'lost')) {
      this.integration.partyResult(
        { v: 2, room: partyEnd.room, slot: partyEnd.slot, simVersion: e.replay.simVersion, ticks: e.result.ticks, outcome: e.replay.outcome, finalHash: e.replay.finalHash },
        { ticks: e.result.ticks, difficulty: e.replay.difficulty, won },
      );
    }
    // CHAMPION-STORE.md §6: Practice saves nothing (no /live, no XP, no Yarn, no quests)
    const practice = !partyEnd && this.practice;
    this.practice = false;
    // Practice: the results chip must not show the previous match's save
    if (practice) this.integration.unsaved();
    if (!partyEnd && !practice) {
      const matchId = this.integration.nextMatchId({ ticks: e.result.ticks, difficulty: e.replay.difficulty, won });
      this.bridge.post('match-result', {
        matchId,
        replay: e.replay,
        summary: { won, ticks: e.result.ticks, hero: e.replay.hero, difficulty: e.replay.difficulty, takedowns: e.kills },
      });
    }
    // pl_* (fun plan F5): real-player numbers to check against the fun1 gate
    this.analytics.track('match_end', {
      result: e.result.outcome,
      // GAPS B2 measure: forfeit rate by difficulty (the backend's verified rows store a forfeit as 'quit')
      reason: e.result.reason,
      length: seconds,
      hero: e.replay.hero,
      difficulty: e.replay.difficulty,
      takedowns: e.kills,
      pl_first_takedown_s: e.fun.firstTakedownS,
      pl_deaths: e.deaths,
      pl_takedowns: e.fun.takedowns,
      pl_level4_s: e.fun.level4S,
      pl_match_len_s: seconds,
      pl_rookie: isRookie(e.replay.difficulty),
    });
    // Sim v27: leaving the Practice ground (or its 11:00 end) goes straight back Home: no results, nothing saved
    if (sandbox) {
      this.session?.dispose();
      this.session = null;
      this.showTitle();
      return;
    }
    if (!sandbox) {
      noteChampionMatch(e.replay.hero);
      noteHeroMatch(e.replay.hero);
    }
    // Treat Track and daily quests (local, free, fixed order); recordMatch counted this match already.
    // GAPS B2: a forfeit pays TREAT_XP.forfeit only: no quest progress, no grade or first-win XP, a full ladder loss.
    const forfeit = e.result.reason === 'forfeit' || practice;
    const follow = followsHero(loadProfile().matches - 1);
    const quests = forfeit
      ? (() => {
          const state = loadQuests();
          return { state, views: questViews(state, follow ? e.replay.hero : undefined), xp: 0 };
        })()
      : progressQuests(loadQuests(), { won, hero: e.replay.hero, takedowns: e.fun.takedowns, pudding: e.fun.pudding, towers: e.fun.towers, combos: e.fun.combos, party: !!partyEnd && !setup?.party?.coop }, follow);
    if (!forfeit) saveQuests(quests.state);
    const prof = loadProfile();
    const ownedIds = new Set<string>([...prof.unlocks, ...this.ent.snapshot().items]);
    // GAPS A2: the grade (pure, from the sim's own stats) adds Treat XP (S +40, A +25, B +10; never catnip)
    const mySlot = e.welcome.slot;
    const grades = gradeMatch(e.result);
    const myGrade = grades.slots.find((g) => g.slot === mySlot)?.grade ?? 'C';
    const gradeXp = forfeit ? 0 : Math.round(GRADE_TREAT_XP[myGrade] * perMinuteShare(blitz ? e.result.ticks : undefined));
    // GAPS A6: the first win of the local day adds its bonus (once a day, no streak, no catnip)
    const treats = addTreatXp(loadTreats(), practice ? 0 : treatXpFor({ won, takedowns: e.fun.takedowns, pudding: e.fun.pudding, forfeit, ...(blitz ? { ticks: e.result.ticks } : {}), ...(draw ? { draw } : {}) }) + quests.xp + gradeXp, ownedIds, { won: won && !practice, day: dayKey() });
    saveTreats(treats.state);
    if (treats.rewards.length) {
      for (const r of treats.rewards) if (!prof.unlocks.includes(r.id)) prof.unlocks.push(r.id);
      saveProfile(prof);
    }
    for (const id of e.tips) this.analytics.track('tip_done', { id });
    if (rec.second) this.analytics.track('second_match', { hero: e.replay.hero });
    if (this.frameMs.length > 60) this.analytics.track('perf_sample', { ...framePcts(this.frameMs), tier: this.tier });
    this.session?.dispose();
    this.session = null;
    this.enterHomeLobby('results');
    this.setLobbyHero(e.replay.hero);
    if (won) this.celebrate(3);
    let link: string | null = null;
    // a party match has no dare link (its seed belongs to the party)
    if (won && !partyEnd && !blitz) {
      try {
        const base = shareBase({ appShell: inAppShell(), embedded: this.bridge.active, referrer: document.referrer, href: location.href });
        link = dareUrl({ seed: e.replay.seed, hero: e.replay.hero, trick: e.replay.trick, difficulty: e.replay.difficulty, seconds: seconds < suddenDeathS(e.replay.difficulty) ? seconds : 0 }, base);
      } catch {
        link = null;
      }
    }
    // MATCH-MOMENTS.md §1: the history row (this device) and, for a solo match, its replay record
    const moment = this.saveMoment(e, { name: momentName, mode: partyEnd ? (setup?.party?.pvp ? 'pvp' : 'party') : practice ? 'practice' : playedMode, grade: e.result.reason === 'forfeit' ? null : myGrade, party: !!partyEnd });
    const s = this.ent.snapshot();
    const lp = loadProfile();
    if (e.fun.usedUlt && !lp.knowsUlt) {
      lp.knowsUlt = true;
      saveProfile(lp);
    }
    // GAPS A2: the grade replaces the old KDA impact on the ladder (an S or A loss costs half; not stacked)
    // the bot ladder is a solo rating: a party match (friends, a shared seed, bots flying dropped friends) never moves it
    // CHAMPION-STORE.md §6: Practice never moves the bot ladder either (the forfeit flag above would count a full loss);
    // sim v22: nor does Blitz
    const ladder = partyEnd || practice || blitz ? null : recordLadder({ won, difficulty: e.replay.difficulty, hero: e.replay.hero, heroName: HERO_TEXT[e.replay.hero].title, seconds, takedowns: e.fun.takedowns, grade: myGrade, forfeit });
    // round 2: "Change hero" names one to try (from match 2: match 1 keeps Play again as the only call)
    const tease = lp.matches >= 2 ? tryHeroFor(e.replay.hero, lp.bests, (h) => this.playable(h)) : null;
    const myTeam = mySlot < 3 ? 0 : 1;
    // UX pass 2: the username names the player's row and MVP (records stay per hero)
    const names = selfNames(slotNames(e.welcome.picks, e.welcome.seed, e.welcome.slot), mySlot, userName ? { name: userName } : null);
    // party play: every human row (yours too), the MVP and "Best on your team" use the party names the friends saw
    const partyNames = (partyEnd as { names?: (string | null)[] } | undefined)?.names;
    if (partyNames) partyNames.forEach((n, slot) => n && (names[slot] = n));
    const nameOf = (slot: number): string => names[slot] ?? HERO_TEXT[e.result.stats.find((st) => st.slot === slot)?.hero ?? e.replay.hero].title;
    const bestMine = grades.best[myTeam];
    // Party play (M6): results together, the party's rows and actions (the save chip stays this player's own)
    const party = partyEnd && this.party ? this.party : null;
    const reportBook = partyEnd && setup?.party?.pvp && setup.party.report ? setup.party.report : null;
    const table = e.result.stats
      .map((st) => ({
        name: nameOf(st.slot),
        grade: grades.slots.find((g) => g.slot === st.slot)?.grade,
        mvp: st.slot === grades.mvp,
        best: !won && st.slot === bestMine,
        rel: st.slot === mySlot ? 'self' : (st.slot < 3 ? 0 : 1) === myTeam ? 'ally' : 'enemy',
        // PvP reports (SOCIAL-RANKED.md §8.1): a flag on every human row but your own
        ...(reportBook && partyNames && reportable(st.slot, mySlot, partyNames) ? { slot: st.slot, flag: reportBook.done(st.slot) ? ('done' as const) : ('can' as const) } : {}),
        k: st.kills,
        d: st.deaths,
        a: st.assists,
        heroDmg: st.heroDamage,
        towerDmg: st.towerDamage,
      }))
      .sort((a, b) => Number(a.rel === 'enemy') - Number(b.rel === 'enemy'));
    // Lane F (F5): the progression summary from the sim's own stats (sim v12) and the player's Fish events
    const medalOf = medals(e.result.stats, grades.slots, grades.mvp);
    const progress = e.result.stats.some((st) => typeof st.fish === 'number')
      ? { rows: progressRows(e.result.stats, mySlot, nameOf, medalOf, (h, slot) => (slot === mySlot && setup?.look ? portraitUrl(h, setup.look) : portraitUrl(h, null))), sources: fishSources(e.fishBy ?? {}, e.result.stats.find((st) => st.slot === mySlot)?.fish ?? 0) }
      : null;
    const resultsEl = resultsScreen(this.root, {
        // gap plan P4: a scored ranked match shows the ranked block (filled once the save lands)
        ...(party && this.rankedRun && partyEnd?.scored !== false ? { ranked: true } : {}),
        ...(reportBook
          ? {
              onReport: (slot: number, anchor: HTMLElement) =>
                void reportPopover(anchor, nameOf(slot), (reason) => {
                  anchor.setAttribute('disabled', '');
                  anchor.classList.add('done');
                  anchor.innerHTML = '&#10003;';
                  void reportBook.report(slot, reason, null).then((out) => {
                    if (out === 'failed') {
                      anchor.removeAttribute('disabled');
                      anchor.classList.remove('done');
                      anchor.innerHTML = '&#9873;';
                    }
                    reportToast(document, out === 'failed' ? 'Report not sent. Try again' : REPORT_THANKS);
                  });
                }),
            }
          : {}),
        won,
        seconds,
        hero: e.replay.hero,
        heroName: null,
        difficulty: e.replay.difficulty,
        kills: e.kills,
        deaths: e.deaths,
        assists: e.assists,
        level: e.level,
        teamKills: e.teamKills,
        firstWin: rec.firstWin,
        best: rec.best,
        dareLink: link,
        deathsBy: e.deathsBy,
        heroDamage: e.fun.heroDamage,
        bestMoment: e.fun.best,
        treats,
        quests: quests.views,
        table,
        progress,
        ladder: ladder && !isRookie(e.replay.difficulty) ? { rating: ladder.rating, delta: ladder.delta, placement: ladder.placement, impact: ladder.impact, grade: ladder.grade } : null,
        grade: {
          grade: myGrade,
          xp: gradeXp,
          // cards: the MVP's hero (and, for the player, their look and card rung) draws the results MVP card
          mvp: {
            name: nameOf(grades.mvp),
            you: grades.mvp === mySlot,
            hero: e.welcome.picks[grades.mvp] ?? e.result.stats.find((st) => st.slot === grades.mvp)?.hero,
            ...(grades.mvp === mySlot ? { portrait: setup?.look ? portraitUrl(e.replay.hero, setup.look) : null, tier: null, awakened: null } : {}),
          },
          // cards: on a defeat the results card shows the best on the player's team (feel QA: the enemy MVP got the rays)
          bestOnTeam: won
            ? null
            : {
                name: nameOf(bestMine),
                you: bestMine === mySlot,
                hero: e.welcome.picks[bestMine] ?? e.result.stats.find((st) => st.slot === bestMine)?.hero,
                ...(bestMine === mySlot ? { portrait: setup?.look ? portraitUrl(e.replay.hero, setup.look) : null, tier: null, awakened: null } : {}),
              },
        },
        personal: ladder?.personal ?? null,
        // a party's surrender is the team's vote, not one player's forfeit
        cause: partyEnd && e.result.reason === 'forfeit' ? 'Your team voted to surrender.' : e.cause,
        // round 2: a returning player (4+ matches or "played MOBAs before") gets Play again at End + 2.5 s
        quick: lp.matches >= 4 || lp.veteran || !!partyEnd,
        tryHero: tease,
        touch: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
        speed: this.speed,
        storeOpen: s.storeOpen,
        notifyOpen: s.notifyOpen,
        // GAPS A3 "Run it back": same hero, trick and difficulty, a new seed (no seed passed: the match draws one).
        // It stays in this page session, so the offer's once-a-session rule (money/offer.ts) never shows a second card.
        onAgain: () => {
          sfx.play('click');
          if (party) return party.again(true);
          // Quick Play: the matched party already let this stranger go (idle in results): search again
          if (partyEnd && setup?.party?.coop) {
            this.backToParty();
            return this.openParty('queue');
          }
          if (partyEnd) return this.backToParty();
          this.analytics.track('rematch_click', { kind: 'again', hero: e.replay.hero, difficulty: e.replay.difficulty, mode: playedMode });
          // sim v22: the same mode, one tap (Blitz stays Blitz, Classic stays Classic)
          this.startMatch(setup ? { hero: setup.hero, trick: setup.trick, difficulty: setup.difficulty, ...this.modeChoice(playedMode) } : this.choice);
        },
        mode: lp.matches >= 2 ? `${MODE_NAME[playedMode]} ~${MODE_MINUTES[playedMode]} min` : null,
        next: partyEnd || lp.matches < 2 ? null : this.nextMode(playedMode, won, e.replay.hero, setup),
        // GAPS A3 "Switch cat": the pick screen with this match's difficulty kept (round 2: on the teased hero)
        onChange: () => {
          sfx.play('click');
          if (party) return party.again(false);
          if (partyEnd) return this.backToParty();
          this.analytics.track('rematch_click', { kind: 'switch', hero: e.replay.hero, difficulty: e.replay.difficulty });
          const keep = setup && !isRookie(setup.difficulty) ? setup.difficulty : this.choice.difficulty;
          this.beforeTry = tease ? { hero: this.choice.hero, trick: this.choice.trick } : null;
          this.choice = { ...this.choice, difficulty: keep, ...(tease ? { hero: tease } : {}) };
          this.showPick();
        },
        // Audit UX-08: Home from the results (the lobby, on the hero just played)
        onHome: () => {
          sfx.play('click');
          if (partyEnd) return this.backToParty();
          this.showTitle();
        },
        onShare: (url, text) => {
          try {
            void navigator.clipboard?.writeText(url).catch(() => undefined);
          } catch {
            /* no clipboard */
          }
          // PUB-06: the dare line rides along, so the host's share sheet says "Beat my 7:12 vs Easy bots".
          this.bridge.post('share', { kind: 'dare', url, text });
        },
        onStore: () => this.openStore('results'),
        onNotify: () => this.notify('results'),
        // MATCH-MOMENTS.md §2, §3: the Legend Moment card and this match's replay
        moments: {
          onCard: () => this.openCard(moment, link, userName, setup?.look ?? null),
          onReplay: moment.replay && moment.simVersion === SIM_VERSION ? () => this.openReplay(moment.id) : null,
        },
        ...(party
          ? {
              party: {
                rowsHtml: party.resultsRows(e.result.stats, mySlot, names, partyEnd as { names?: (string | null)[]; pilotPct?: number[] }),
                ...party.resultsActions(),
                // leave the party and the results: back to the title (never a stranded results screen)
                onLeave: () => {
                  party.leaveParty();
                  this.session?.dispose();
                  this.session = null;
                  this.showTitle();
                },
              },
            }
          : {}),
      });
    this.setScreen('results', resultsEl);
    party?.bindResults(resultsEl, () => this.backToParty());
    if (party && this.rankedRun) this.fillRanked(resultsEl, won);
    // CLUBS-KUDOS.md §5: a PvP match's results offer a thumbs-up to each human teammate (signed-in players only)
    if (reportBook && partyNames && accountState().signedIn)
      mountKudos(resultsEl, { mates: kudosMates(mySlot, partyNames, e.welcome.picks.length), send: (slot) => this.integration.api('kudos.give', { room: reportBook.room, slot }) });
    // the offer card waits for the staged results reveal, and shows only after a win (never on a Defeat screen),
    // never after the Rookie match (fun plan F4)
    // SHARE-PUSH.md §2: the notifications card after a win (never the first launch); it takes the corner before the offer
    if (won && !partyEnd) this.maybePushAsk();
    if (won && !isRookie(e.replay.difficulty))
      setTimeout(() => {
        if (this.screen === 'results') this.maybeOffer('results');
      }, 2500);
  }

  // ------------------------------------------------------------------------------------- match moments

  /** MATCH-MOMENTS.md §1: save the history row (and the replay of a solo match). Display only, on this device. */
  private saveMoment(e: MatchEnd, o: { name: string | null; mode: HistoryEntry['mode']; grade: string | null; party: boolean }): HistoryEntry {
    const at = Date.now();
    return recordMoment(
      {
        id: newEntryId(at),
        at,
        hero: e.replay.hero,
        heroName: o.name,
        mode: o.mode,
        difficulty: e.replay.difficulty,
        outcome: e.result.draw ? 'draw' : e.result.outcome === 'won' ? 'won' : 'lost',
        grade: o.grade,
        k: e.kills,
        d: e.deaths,
        a: e.assists,
        seconds: Math.floor(e.result.ticks / 30),
        best: e.fun.best,
        simVersion: e.replay.simVersion,
        noReplay: o.party ? 'party' : null,
      },
      o.party ? null : e.replay,
    );
  }

  /** MATCH-MOMENTS.md §3: the 1200x630 Legend Moment card (its own chunk) over the results. */
  private openCard(m: HistoryEntry, link: string | null, player: string | null, look: Look | null): void {
    sfx.play('click');
    const hero = m.hero as HeroId;
    void import('../share/card')
      .then(({ openShareCard }) =>
        openShareCard(this.root, {
          data: {
            won: m.outcome === 'won',
            draw: m.outcome === 'draw',
            heroName: m.heroName || HERO_TEXT[hero].title,
            role: HERO_TEXT[hero].role,
            side: HEROES[hero]?.side === 'dog' ? 'dog' : 'cat',
            k: m.k,
            d: m.d,
            a: m.a,
            grade: m.grade,
            best: m.best ?? null,
            line: `${MODE_NAME[m.mode as MatchMode] ?? (m.mode === 'pvp' ? 'PvP' : m.mode === 'party' ? 'Party' : 'Practice')} · ${Math.floor(m.seconds / 60)}:${String(m.seconds % 60).padStart(2, '0')}`,
            player,
            art: splashFor(hero, look ?? undefined, 720),
            artFallback: heroSplashUrl(hero, 720),
          },
          url: link,
          onLink: (url, text) => {
            try {
              void navigator.clipboard?.writeText(`${text} ${url}`).catch(() => undefined);
            } catch {
              /* no clipboard */
            }
            this.bridge.post('share', { kind: 'moment', url, text });
          },
          track: (ev, props) => this.analytics.track(ev as 'share_card', props),
          // SHARE-PUSH.md §1: a video of the best moment, recorded from the kept replay
          onClip: m.replay && m.simVersion === SIM_VERSION && clipSupported() ? (framing) => this.openReplay(m.id, { clip: framing, clipTitle: m.best ?? null }) : null,
        }),
      )
      .catch((err: unknown) => reportCrash('window', err));
  }

  /** MATCH-MOMENTS.md §1: the last 20 matches (from the Treat Track's profile entry). */
  private openHistory(): void {
    if (this.overlay) this.overlay.close();
    this.overlay = null;
    this.analytics.track('history_open', { rows: loadHistory().length });
    void import('../ui/history/historySheet')
      .then(({ historySheet }) => {
        const el = historySheet(this.root, {
          onWatch: (id) => this.openReplay(id),
          onClose: () => {
            if (this.overlay?.close === close) this.overlay = null;
          },
        });
        const close = (): void => el.remove();
        this.overlay = { close };
      })
      .catch((err: unknown) => reportCrash('window', err));
  }

  /**
   * MATCH-MOMENTS.md §2: watch a kept replay: the match view (MatchSession) over a ReplayHost, the sim re-running the
   * stored inputs in the sim Worker. Back to Home when it closes.
   */
  private openReplay(id: string, o: { clip?: 'vertical' | 'wide'; clipTitle?: string | null } = {}): void {
    const record = replayOf(id);
    const entry = loadHistory().find((r) => r.id === id);
    if (!record || !entry) return;
    sfx.play('click');
    this.overlay?.close();
    this.overlay = null;
    this.setScreen('match', null);
    this.leaveHomeLobby();
    this.stage.leave();
    this.session?.dispose();
    this.session = null;
    const token = ++this.matchToken;
    void Promise.all([loadMatch(), import('../replay/viewer')])
      .then(([{ MatchSession }, { openReplayViewer }]) => {
        if (token !== this.matchToken) return;
        openReplayViewer({
          Session: MatchSession,
          gr: this.gr,
          root: this.root,
          record,
          entry,
          muted: sfx.isMuted,
          look: this.lookFor(record.hero),
          playerName: this.integration.state().playerName,
          ...this.viewerHooks(token),
          track: (ev, props) => this.analytics.track(ev as 'replay_open', props),
          clip: o.clip ?? null,
          clipTitle: o.clipTitle ?? entry.best ?? null,
          onShareLink: (url, text) => {
            try {
              void navigator.clipboard?.writeText(`${text} ${url}`).catch(() => undefined);
            } catch {
              /* no clipboard */
            }
            this.bridge.post('share', { kind: 'moment', url, text });
          },
        });
      })
      .catch((err: unknown) => {
        reportCrash('window', err);
        this.showTitle();
      });
  }

  /** The replay and spectate viewers' shared plumbing: the session slot, the warm-up, Home on exit, mute, Settings. */
  private viewerHooks(token: number) {
    return {
      setSession: (s: MatchSession | null) => {
        this.session = s;
        if (s) this.governor.hold(performance.now() + GOV.WARMUP_MS);
      },
      warm: (s: MatchSession) => {
        const t0 = performance.now();
        return warmMatch(
          () => (this.session === s ? s.view.hasRoster : null),
          () => s.view.warmup(t0 + WARM.totalMs),
          (ms) => new Promise((r) => setTimeout(r, ms)),
          () => performance.now() - t0,
        ).then(() => undefined);
      },
      onExit: () => {
        this.session = null;
        if (token === this.matchToken) this.showTitle();
      },
      onMute: (m: boolean) => this.setMuted(m),
      onSettings: (done: () => void) => this.openSettings(done),
    };
  }

  /**
   * SPECTATE.md: watch a friend's live match or the featured one, a short delay behind the players: the match view over
   * a SpectateHost (the relay's delayed turns re-simulated with this build's sim). Back to Home when it closes. Never
   * while in a party (its own socket would compete for the identity's caps; the Social sheet hides Watch then).
   */
  private openSpectate(target: { room: string; name: string } | { featured: true }): void {
    const api = this.partyApi;
    if (!api || this.session) return;
    sfx.play('click');
    this.overlay?.close();
    this.overlay = null;
    this.setScreen('match', null);
    this.leaveHomeLobby();
    this.stage.leave();
    const token = ++this.matchToken;
    void Promise.all([loadMatch(), import('../spectate/viewer')])
      .then(([{ MatchSession }, { openSpectateViewer }]) => {
        if (token !== this.matchToken) return;
        openSpectateViewer({
          Session: MatchSession,
          gr: this.gr,
          root: this.root,
          target,
          api,
          build: String(import.meta.env.VITE_PAWLEGENDS_BUILD ?? 'dev').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 32) || 'dev',
          ticket: () => this.integration.partyTicket(),
          guestKey: () => partyGuestKey(),
          muted: sfx.isMuted,
          ...this.viewerHooks(token),
          track: (ev, props) => this.analytics.track(ev as 'spectate_open', props),
        });
      })
      .catch((err: unknown) => {
        reportCrash('window', err);
        this.showTitle();
      });
  }

  // ------------------------------------------------------------------------------------- store and offers

  private openStore(from: 'lobby' | 'results', tab?: StoreTab, hero?: HeroId): void {
    // the app has no store (no prices): only a champion's detail opens there, for its Yarn and Champion Pick unlock
    if (this.overlay || !(this.ent.snapshot().storeOpen || (hero && this.isApp()))) return;
    this.offerEl?.close();
    this.offerEl = null;
    this.analytics.track('store_open', { from });
    const panel = storePanel(this.root, {
      snapshot: () => this.ent.snapshot(),
      termsUrl: this.termsUrl(),
      checkout: this.checkout,
      onClose: () => {
        this.overlay = null;
        this.refreshMeta(false);
      },
      onNotify: () => this.notify('store'),
      onBuy: (sku) => {
        this.pendingReveal = sku;
        this.analytics.track('checkout_start', { sku });
      },
      // a face (ui/art.ts) for the frame previews; the coat cards show the skin's painted splash (store.ts `coatImg`)
      preview: (hero, coat) => ((HERO_IDS as readonly string[]).includes(hero) ? portraitUrl(hero as HeroId, { coat, chroma: null }) : null),
      equipped: () => {
        const p = loadProfile();
        const worn = new Set<string>();
        for (const l of Object.values(p.looks)) if (l?.coat) worn.add(l.coat);
        if (p.wornFrame) worn.add(p.wornFrame);
        if (p.wornTitle) worn.add(p.wornTitle);
        return worn;
      },
      onEquip: (def) => this.equipStore(def),
      onPass: () => this.openPass(),
      tab,
      ...(hero ? { hero } : {}),
      // CHAMPION-STORE.md §10: the champion grid reads the same champions the pick does, and unlocks the same way
      champs: () => this.champs(),
      isApp: this.isApp(),
      onUnlock: (h, via) => this.unlockChamp(h, via),
      onInfo: (h, within) => void openChampInfo({ hero: h, within, parent: within }),
    });
    this.overlay = Object.assign(panel, { kind: 'store' as const });
  }

  /** Equip an owned store item (STORE-PASS.md §4): a coat on its hero, a frame and its title worn. Visual only. */
  private equipStore(def: CatalogSku): void {
    const p = loadProfile();
    for (const item of def.items) {
      const c = PAID_COATS[item];
      if (c && def.kind !== 'bundle') p.looks[c.hero] = { coat: item, chroma: (p.looks[c.hero] as Partial<Look> | undefined)?.chroma ?? null };
      if (item.startsWith('frame.')) p.wornFrame = item;
      if (item.startsWith('title.')) p.wornTitle = item;
    }
    saveProfile(p);
    const coat = def.items.find((i) => PAID_COATS[i]);
    if (coat && def.kind !== 'bundle') this.choice = { ...this.choice, hero: PAID_COATS[coat].hero };
  }

  /** The Legends Pass screen (STORE-PASS.md §6): progress from the server, claims through the host. */
  private openPass(): void {
    if (this.overlay) return;
    this.analytics.track('pass_open', {});
    const panel = passPanel(this.root, {
      snapshot: () => this.ent.snapshot(),
      claim: (row, tier) => {
        const ok = this.bridge.post('pass-claim', row ? { row, tier } : { all: true });
        if (ok) this.analytics.track('pass_claim', { row: row ?? 'all', tier: tier ?? 0 });
        return ok;
      },
      buy: (sku) => {
        const ok = this.checkout.buy(sku);
        if (ok) {
          this.pendingReveal = sku;
          this.analytics.track('checkout_start', { sku });
        }
        return ok;
      },
      portrait: (h, item) => portraitUrl(h, { coat: item, chroma: null }),
      onTrack: () => this.openCollection(),
      onClose: () => {
        this.overlay = null;
        this.refreshMeta(false);
      },
    });
    this.overlay = Object.assign(panel, { kind: 'pass' as const });
  }

  private notify(where: 'store' | 'results'): void {
    if (!this.ent.snapshot().notifyOpen) return;
    if (this.bridge.post('notify', { where })) this.analytics.track('notify_signup', { where });
  }

  // ------------------------------------------------------------------------------------------ push notifications

  private pushApi = (op: ApiOp, args?: ApiArgs) => this.integration.api(op, args);

  /** Once a page: learn the server key (no key: no opt-in, no Settings rows) and re-send an existing subscription. */
  private pushBoot(): void {
    if (this.pushBooted || !pushSupported()) return;
    this.pushBooted = true;
    void serverKey(this.pushApi).then((k) => {
      this.pushKey = k;
      if (k) void resyncPush(this.pushApi);
      else this.pushBooted = false;
    });
  }

  /** The card's and Settings' "Turn on": a note for the player, or null when on. Call it straight from the tap. */
  private async pushTurnOn(from: 'card' | 'settings'): Promise<string | null> {
    const key = this.pushKey;
    if (!key) return 'Notifications are not available right now.';
    const r = await enablePush(this.pushApi, key);
    this.analytics.track('push_optin', { result: r, from });
    if (r === 'on') return null;
    return r === 'denied' ? 'Allow notifications for pawlegends.app in your browser to turn them on.' : 'Could not turn notifications on. Try again later.';
  }

  private maybePushAsk(): void {
    if (this.pushAskEl) return;
    const prefs = loadPushPrefs();
    const ask = (): void => {
      if (!this.pushKey || this.screen !== 'results' || this.overlay || this.offerEl || this.pushAskEl) return;
      if (!shouldAsk({ won: true, session: this.sessionNo, supported: pushSupported(), perm: permission(), prefs: loadPushPrefs(), now: Date.now() })) return;
      const p = loadPushPrefs();
      savePushPrefs({ ...p, asks: p.asks + 1, lastAsk: Date.now() });
      this.analytics.track('push_prompt', { asks: p.asks + 1 });
      this.pushAskEl = pushAskCard(this.root, {
        onYes: () => this.pushTurnOn('card'),
        onNo: () => this.analytics.track('push_optin', { result: 'later', from: 'card' }),
        onClose: () => (this.pushAskEl = null),
      });
    };
    if (!shouldAsk({ won: true, session: this.sessionNo, supported: pushSupported(), perm: permission(), prefs, now: Date.now() })) return;
    void serverKey(this.pushApi).then((k) => {
      this.pushKey = k;
      setTimeout(ask, 1800);
    });
  }

  private maybeOffer(screen: OfferScreen): void {
    if (this.offerEl || this.overlay || this.pushAskEl) return;
    const p = loadProfile();
    const s = this.ent.snapshot();
    const now = Date.now();
    const o = pickOffer({
      session: p.sessions,
      matches: p.matches,
      firstWin: p.firstWinDone,
      store: s,
      history: p.offers,
      screen,
      shownThisSession: this.offerShown,
      now,
      hostOffer: this.hostOffer,
    });
    document.documentElement.dataset.offer = o ? o.kind : '';
    if (!o) return;
    this.offerShown = true;
    p.offers = markShown(p.offers, o, now);
    saveProfile(p);
    for (const sku of o.skus) this.analytics.track('offer_shown', { sku });
    this.offerEl = offerCard(this.root, {
      offer: o,
      checkout: this.checkout,
      now: () => Date.now(),
      onClick: (sku: SkuId) => {
        this.analytics.track('offer_click', { sku });
        this.analytics.track('checkout_start', { sku });
      },
      onClose: () => {
        this.offerEl = null;
      },
      onDetails: () => this.openStore(screen === 'results' ? 'results' : 'lobby'),
    });
  }

  /** The host's terms page (POC.md §8.6): next to the host page that frames the game. */
  private termsUrl(): string | null {
    try {
      if (this.bridge.active && document.referrer) return `${new URL(document.referrer).origin}/pawlegends/terms`;
    } catch {
      /* no referrer */
    }
    return null;
  }

  // ------------------------------------------------------------------------------------ settings, consent

  /** GAPS A1: the Treat Track chest screen ("pick your next target") and the profile shelf. Never opens an offer. */
  private openCollection(): void {
    if (this.overlay) return;
    const p = loadProfile();
    const tiles = this.integration.championTiles();
    const art: Partial<Record<HeroId, string>> = {};
    for (const h of HERO_IDS) {
      const a = tiles[h]?.art;
      if (a) art[h] = a;
    }
    const el = collectionPanel(this.root, {
      treats: loadTreats(),
      owned: new Set<string>([...p.unlocks, ...this.ent.snapshot().items]),
      art,
      portrait: (h) => portraitUrl(h, null),
      wornTitle: p.wornTitle,
      wornFrame: p.wornFrame,
      onTarget: (h) => {
        const t = loadTreats();
        t.target = h;
        saveTreats(t);
      },
      onWear: (kind, id) => {
        const q = loadProfile();
        if (kind === 'title') q.wornTitle = id;
        else q.wornFrame = id;
        saveProfile(q);
      },
      onPass: () => this.openPass(),
      // MATCH-MOMENTS.md §1: the profile entry's Match history
      onHistory: () => this.openHistory(),
      champions: { owned: ownedCount(this.champs(), this.isApp()), total: CHAMPION_IDS.length, founders: this.champs().founders, yarn: this.champs().yarn.balance },
      onClose: () => {
        this.overlay = null;
        // one redraw, without the offer check: the Treat Track panel never leads to an offer
        this.refreshMeta(false);
      },
    });
    this.overlay = { close: () => el.remove() };
  }

  private openSettings(after?: () => void): void {
    if (this.overlay) {
      after?.();
      return;
    }
    const p = loadProfile();
    const account = this.integration.accountModel();
    const el = settingsPanel(this.root, {
      state: {
        muted: sfx.isMuted,
        tier: this.tier,
        tipsOn: tipsDue(p),
        stats: this.analytics.configured ? this.analytics.live : null,
        skinFx: p.skinFx,
        saver: batterySaver().on,
        saverAuto: batterySaver().by === 'auto',
        warm: this.governor.step > 0,
      },
      onSaver: (on) => {
        setBatterySaver(on);
        this.analytics.track('quality_tier', { tier: this.tier, saver: on, by: 'user' });
      },
      onSkinFx: (m) => {
        const q = loadProfile();
        q.skinFx = m;
        saveProfile(q);
      },
      onMute: (m) => this.setMuted(m),
      onTier: (t) => this.setTier(t),
      onTips: (on) => {
        const q = loadProfile();
        q.tipsOff = !on;
        q.tipsNext = on;
        saveProfile(q);
      },
      onStats: (on) => this.analytics.setConsent(on),
      termsUrl: this.termsUrl(),
      ...(account ? { account: { model: account, send: (a) => void this.integration.account(a) } } : {}),
      ...(this.pushKey && pushSupported()
        ? {
            push: {
              state: () => {
                const q = loadPushPrefs();
                return { on: q.on, cats: q.cats, blocked: permission() === 'denied' };
              },
              names: PUSH_CAT_NAME,
              toggle: (on: boolean) => {
                if (on) return this.pushTurnOn('settings');
                this.analytics.track('push_prefs', { on: false });
                return disablePush(this.pushApi).then(() => null);
              },
              setCat: (cat: string, on: boolean) => {
                const cats = loadPushPrefs().cats.filter((c) => c !== cat);
                if (on) cats.push(cat as PushCat);
                this.analytics.track('push_prefs', { cat, on });
                return setPushCats(this.pushApi, PUSH_CATS.filter((c) => cats.includes(c)));
              },
            },
          }
        : {}),
      onClose: () => {
        this.overlay = null;
        if (this.screen === 'title') this.showTitle();
        after?.();
      },
    });
    this.overlay = { close: () => el.remove() };
  }

  private consentEl: HTMLElement | null = null;
  private maybeConsent(): void {
    // Standalone only, from the second session, on the title screen (setScreen hides it). Embedded, the events go to
    // the host and follow the site's policy (PUB-02), so the game never asks there.
    if (this.consentEl || !askConsent({ configured: this.analytics.configured, consent: this.analytics.consentState, embedded: this.bridge.active, sessionNo: this.sessionNo })) return;
    this.consentEl = consentPrompt(this.root, (granted) => {
      this.analytics.setConsent(granted);
      this.consentEl = null;
    });
  }

  // ------------------------------------------------------------------------------------------ frame loop

  /** A tier change: the player's Settings choice (`by: 'user'`, remembered per device) or the first match's probe. */
  private setTier(t: QualityTier, by: 'user' | 'probe' = 'user'): void {
    rememberTier(t, by);
    if (t === this.tier) return;
    this.tier = t;
    this.applyProfile();
    this.analytics.track('quality_tier', { tier: t });
  }

  /** PERF-IOS: the tier with this device's profile and the governor's step, to the renderer, the view and the HUD. */
  private applyProfile(): void {
    this.gr.apply(tierSettings(this.tier, { phone: this.phone, step: this.governor.step }));
    this.session?.view.setShadows(this.gr.settings.shadows);
    this.session?.applyPerf(this.gr.settings);
    document.documentElement.dataset.quality = this.gr.settings.tier;
    document.documentElement.dataset.perfStep = String(this.governor.step);
    this.pacer.reset();
  }

  /** PERF-IOS P2-7: the shell's thermal state changed (or the first read): Low Power Mode turns Battery saver on. */
  private onThermal(): void {
    if (thermal().lowPower && autoBatterySaver()) this.analytics.track('quality_tier', { tier: this.tier, saver: true, by: 'low_power' });
    this.releaseSaverIfCool();
  }

  /**
   * The game's own Battery saver ends when its cause has: no Low Power Mode, the OS not hot, and the governor above its
   * 30 fps step (it stepped back up, or this launch started one step cooler). A player's choice is never touched.
   */
  private releaseSaverIfCool(): void {
    const t = thermal();
    const hot = t.state === 'serious' || t.state === 'critical';
    if (t.lowPower || hot || this.governor.step >= GOV_STEP.fps30) return;
    if (releaseAutoSaver()) this.analytics.track('quality_tier', { tier: this.tier, saver: false, by: 'cool' });
  }

  /** PERF-IOS P1-6: hidden page or backgrounded app: no frames, no audio, no music scheduling. */
  private setSuspended(on: boolean): void {
    if (on === this.suspended) return;
    this.suspended = on;
    if (on) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      sfx.suspend();
      this.session?.setHidden(true);
      savePerfStep(this.governor.step);
    } else {
      sfx.resumeContext();
      this.session?.setHidden(false);
      this.pacer.reset();
      this.last = performance.now();
      if (!this.raf) this.raf = requestAnimationFrame(this.frameCb);
    }
  }

  private frame(now: number): void {
    this.raf = 0;
    if (this.suspended) return;
    this.raf = requestAnimationFrame(this.frameCb);
    const inMatch = this.screen === 'match' && !!this.session;
    const paused = this.session?.isPaused ?? false;
    // founder, Nov 13: the menus are painted art in the DOM (ui/stage/artStage.ts), so no WebGL frame is drawn outside a
    // match: no GPU work behind Home, the champion select, the store or the results
    // Home is the exception: its 3D hero (founder, Nov 13) draws on the canvas at the menu rate
    if (!this.session && !this.lobbyOn) {
      this.last = now;
      return;
    }
    const saver = batterySaver().on || this.gr.settings.fpsCap < MATCH_FPS;
    // PERF-IOS §8 Track C: the champion browser covers the 3D view (its own clip runs on its own canvas): over Home the
    // lobby is drawn once more and then not at all until it closes; over a match it counts as a covering panel
    const champ = champCovered();
    if (champ && !this.session) {
      if (this.champFrozen) return;
      this.champFrozen = true;
    } else this.champFrozen = false;
    const fps = paceTarget({ inMatch, paused, covered: !!this.overlay || champ, saver });
    if (!this.champFrozen && !this.pacer.due(now, fps)) return;
    const t0 = performance.now();
    const raw = Math.max(0, now - this.last);
    const dt = Math.min(0.1, raw / 1000);
    this.last = now;
    // P1-2: the probe measures the first seconds of a running match at the full 60 fps target (never the title)
    if (this.probe && inMatch && !paused && fps === MATCH_FPS) {
      const r = this.probe.sample(dt);
      if (r) {
        this.probe = null;
        this.setTier(r === 'low' ? 'low' : this.tier, 'probe');
      }
    }
    if (inMatch && this.frameMs.length < 20000) this.frameMs.push(raw);
    // Draw calls for the perf check (POC.md §10): a plain data attribute, sampled once a second, no debug global.
    if ((this.frames = (this.frames + 1) % 60) === 0) document.documentElement.dataset.draws = String(this.gr.renderer.info.render.calls);
    if (this.session) this.session.frame(dt);
    else if (this.lobby) {
      this.lobby.update(dt);
      this.gr.render();
    }
    runFrameTap();
    const work = performance.now() - t0;
    if (inMatch && !paused && !this.forcedTier) {
      const th = thermal().state;
      const next = this.governor.sample({ frameMs: raw, workMs: work, targetMs: 1000 / fps, now, thermal: th });
      if (next !== null) {
        this.applyProfile();
        savePerfStep(next);
        this.analytics.track('quality_tier', { tier: this.gr.settings.tier, step: next, reason: this.governor.lastReason });
        this.releaseSaverIfCool();
      }
      // sustained throttling (the OS says so, or 30 fps held a minute): Battery saver turns on by itself, unless the
      // player chose it in Settings (`saver` above is also true on the governor's own 30 fps step, so read the pref)
      if (!batterySaver().on && this.governor.throttled(th, now) && autoBatterySaver()) this.analytics.track('quality_tier', { tier: this.tier, saver: true, by: 'thermal' });
    }
    this.perf?.sample({ frameMs: raw, draws: this.gr.renderer.info.render.calls, tier: this.gr.settings.tier, inMatch, fps, step: this.governor.step, reason: GOV_NAMES[this.governor.step] + (this.governor.lastReason ? ` (${this.governor.lastReason})` : ''), workMs: work });
  }
}

const HERO_NAME = (h: HeroId): string => HERO_TEXT[h].title;

/** The SKU an item came from (analytics only). */
function skuOfItem(item: string): string {
  // STORE-PASS.md: a store coat names its single SKU; a pass coat its season pass
  const store = CATALOG_SKUS.find((d) => d.kind === 'cosmetic' && d.items.includes(item));
  if (store) return store.sku;
  if (item.includes('.s1_')) return 'pl_pass_s1';
  if (item === 'skin.clem.pink_bow') return 'pl_starter';
  if (item === 'skin.clem.dawnblade') return 'pl_founder_legend';
  return 'pl_founder';
}

/** A stored party resume token (a reload of this tab while in a party rejoins it; the relay checks it). */
function hasPartySeat(): boolean {
  try {
    return !!sessionStorage.getItem('pl.party.resume');
  } catch {
    return false;
  }
}

/** The code of the party this browser was last in (src/party/partyClient.ts keeps it), within 3 hours, or null. */
function lastPartyCode(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem('pl.party.last') ?? 'null') as { code?: unknown; at?: unknown } | null;
    if (!v || typeof v.code !== 'string' || !/^[2-9A-HJ-NP-Z]{6}$/.test(v.code) || typeof v.at !== 'number') return null;
    return Date.now() - v.at < 3 * 3600_000 ? v.code : null;
  } catch {
    return null;
  }
}

/** A stranger's live Quick Play match this browser was in (src/party/partyClient.ts marks it), within 1 hour. */
function lastMmMatch(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem('pl.party.last') ?? 'null') as { mm?: unknown; at?: unknown } | null;
    return !!v && v.mm === true && typeof v.at === 'number' && Date.now() - v.at < 3600_000;
  } catch {
    return false;
  }
}

/** Drop `?party=` from the address bar once read, so a later reload does not rejoin an old party by code. */
function stripParam(key: string): void {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has(key)) return;
    u.searchParams.delete(key);
    history.replaceState(history.state, '', `${u.pathname}${u.search}${u.hash}`);
  } catch {
    /* sandboxed */
  }
}

function stripPartyParam(): void {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('party')) return;
    u.searchParams.delete('party');
    history.replaceState(history.state, '', `${u.pathname}${u.search}${u.hash}`);
  } catch {
    /* sandboxed */
  }
}

/** Run `fn` when the main thread is idle (a timeout where requestIdleCallback is missing, as on Safari). */
function idle(fn: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 8000 });
  else setTimeout(fn, 3000);
}

/** A per-browser random guest key (party identity for the relay's caps; never a secret, never shown to peers). */
function partyGuestKey(): string {
  const k = 'pl.party.guest';
  try {
    const old = localStorage.getItem(k);
    if (old && /^[A-Za-z0-9_-]{8,64}$/.test(old)) return old;
  } catch {
    /* private mode */
  }
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  const key = Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
  try {
    localStorage.setItem(k, key);
  } catch {
    /* private mode */
  }
  return key;
}
