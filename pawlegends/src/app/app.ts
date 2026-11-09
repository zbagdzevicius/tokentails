/**
 * The app flow (POC.md §12): title → pick → match → results, one frame loop, the quality governor, the lobby
 * turntable between matches and the embed bridge. Also the meta layer around the matches: cosmetics from the
 * entitlement token, free unlocks and the host roster; the store, the offer card and settings; consent-gated
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
import { EMPTY_ROSTER, isAppBuild, parseRoster, rosterCosmetics, type CatTier, type RosterCat, type RosterCosmetics } from '../meta/roster';
import { coatGlow } from '../render/skins/cardFx';
import { nextBond, onSkinsChanged, ownedSkins, setFeaturedSkins, setRosterSkins, showcaseGate, wantProbe } from '../render/skins/registry';
import { FEATURED_SKIN_PREFIX, getSkin, isCardSkinId, skinIdOf, type CatSkin } from '../render/skins/skinStore';
import type { SkinTile } from '../ui/screens';
import { squadPrefs } from '../meta/squad';
import { DEMO_ROSTER, skinDemoOn } from './skinDemo';
import { recordLadder } from '../meta/ladder';
import { GRADE_TREAT_XP, gradeMatch } from '../meta/grade';
import { HERO_IDS, HEROES } from '../data/heroes';
import { accountState, heroForSide, loadProfile, noteBond, noteChampionMatch, noteHeroMatch, notePreview, playSession, previewAllowed, recordMatch, saveProfile, startSession, tipsDue } from '../meta/profile';
import { CheckoutBridge } from '../money/checkoutBridge';
import { Entitlements } from '../money/entitlements';
import { markShown, offerOf, pickOffer, type Offer, type OfferScreen } from '../money/offer';
import type { SkuId } from '../money/skus';
import { ELEMENT_COLOR, bestFrame, cardLook, lookItems, lookKey, resolveLook, titleOf, type Look, type Owned } from '../render/cosmetics';
import { Lobby } from '../render/lobby';
import { bakePortrait, bakePortraits, portraitUrl } from '../render/portraits';
import { FpsProbe, qualityOverride, rememberTier, startTier, tierSettings, type QualityTier } from '../render/quality';
import { isPhone } from '../render/perf/device';
import { FramePacer, MATCH_FPS, WARM, paceTarget, warmMatch } from '../render/perf/pacer';
import { champCovered } from '../ui/champBrowser/cover';
import { GOV, GOV_NAMES, GOV_STEP, ThermalGovernor } from '../render/perf/governor';
import { autoBatterySaver, batterySaver, releaseAutoSaver, savePerfStep, savedPerfStep, setBatterySaver } from '../render/perf/prefs';
import { thermal } from '../render/perf/thermal';
import { createRenderer, type GameRenderer } from '../render/renderer';
import type { HeroId } from '../sim/api';
import { dareFromUrl, dareUrl, type Dare } from '../share/dare';
import { inviteUrl, partyApi, partyFromUrl } from '../share/partyLink';
import type { PartyClient } from '../party';
import { hideNames, lastQueueSide, onlineMode, setLastQueueSide, setOnlineMode, type OnlineMode } from '../meta/partyPrefs';
import { pvpAvailable, pvpKnown } from '../meta/pvpCapability';
import { isMpEvent } from '../analytics/posthog';
import type { MatchMsg } from '../net/proto';
import { offerCard } from '../ui/offerCard';
import { PerfReadout, perfFromUrl } from '../ui/perfReadout';
import { loadingVeil, pickScreen, refreshPickFaces, setPickLook, resultsScreen, rotatePrompt, type Choice } from '../ui/screens';
import { disposeLobby, heroIdentity, lobbyScreen, type LobbyIdentity } from '../ui/lobby/lobbyScreen';
import { heroElement } from '../ui/cards/el';
import type { DeckCard, DeckHandle } from '../ui/deck/deck';
import { championOf } from '../data/heroes/shelter';
import { consentPrompt, settingsPanel } from '../ui/settings';
import { notePurchase, storePanel } from '../ui/store';
import { HERO_TEXT, slotNames } from '../ui/heroText';
import { cardIdentity, selfNames, veilName } from '../meta/cardName';
import type { MatchEnd, MatchSession, MatchSetup } from './matchSession';

/**
 * The match (session, game view, effects, HUD) is its own chunk: the title and menus load without it (first-load JS
 * budget) and it is prefetched once the title is up, so a match still starts at once.
 */
const loadMatch = (): Promise<typeof import('./matchSession')> => import('./matchSession');
import { canPickDifficulty, difficultyFor, forfeitTick, guideMode, isRookie, pickable, PICK_DIFFICULTY_FROM, rookieAvailable } from './firstSession';
import { dayKey, followsHero, loadQuests, progressQuests, questViews, saveQuests } from '../meta/quests';
import { addTreatXp, loadTreats, loadTreatsRaw, migrateTreats, saveTreats, treatXpFor } from '../meta/treats';
import { collectionPanel } from '../ui/collection';
import { parseAudio } from '../embed/bridge';
import { installIntegration, type Integration } from '../embed/integrate';
import { suddenDeathS } from '../ui/screens';

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
    // Sim v9: the champion names Avietė and Gabė. Fredoka has no precomposed ė, but it has e and the combining dot
    // (U+0307), so the UI writes those names decomposed (data/heroes/shelter.ts `uiName`). A cluster e + dot must come
    // from one face, so this one (the whole font) covers Basic Latin too.
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
export function tryHeroFor(current: HeroId, bests: Partial<Record<HeroId, unknown>>): HeroId {
  const side = HEROES[current]?.side ?? 'cat';
  const order: readonly HeroId[] = HERO_IDS.filter((h) => HEROES[h].side === side);
  const start = order.indexOf(current);
  const rest = order.map((_, k) => order[(start + k + 1) % order.length]).slice(0, order.length - 1);
  return rest.find((h) => !bests[h]) ?? rest[0];
}

function p95(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] * 10) / 10;
}

export class App {
  readonly gr: GameRenderer;
  readonly lobby: Lobby;
  readonly ent = new Entitlements();
  readonly checkout: CheckoutBridge;
  readonly analytics: Analytics;
  /** Token Tails cards, sign-in, save chip and the Meet card (embed/integrate.ts). */
  readonly integration: Integration;
  private readonly human = new HumanFilter();
  private screen: Screen = 'title';
  private screenEl: HTMLElement | null = null;
  private overlay: { close(): void; refresh?(): void } | null = null;
  private offerEl: { close(): void } | null = null;
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
  /** Party play (MULTIPLAYER.md): the open party (lazy chunk), and a `?party=` code to join at boot. */
  private party: PartyClient | null = null;
  private partyCode: string | null = partyFromUrl();
  private readonly partyApi = partyApi();
  private readonly speed = speedFromUrl();
  private choice: Choice;
  private lastSetup: MatchSetup | null = null;
  private frames = 0;
  private roster: RosterCosmetics = EMPTY_ROSTER;
  private rosterCats: RosterCat[] = [];
  private hostOffer: Offer | null | undefined = undefined;
  private offerShown = false;
  private matchesThisSession = 0;
  /** A purchase the host confirmed: once its items arrive, the lobby hero puts the new look on ("New!"). */
  private pendingReveal: SkuId | null = null;
  private frameMs: number[] = [];
  /** `?perf=1` on-screen readout for the device gate (§15 item 27); null otherwise. */
  private readonly perf: PerfReadout | null;
  private readonly sessionNo: number;
  private readonly dayN: number;

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
    // Hero portraits for the pick cards and the HUD, rendered once by this renderer (render/portraits.ts).
    bakePortraits(this.gr);
    document.documentElement.dataset.quality = this.gr.settings.tier;
    this.lobby = new Lobby(this.gr);
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
      onRosterChange: () => {
        this.roster = rosterCosmetics(this.rosterCats, squadPrefs());
        this.syncSkins();
        this.autoEquip();
        this.refreshMeta();
      },
      root,
      lobbyHero: () => this.choice.hero,
      chromaPreview: (element) => {
        const hero = this.choice.hero;
        if (!(element in ELEMENT_COLOR)) return null;
        const look: Look = { ...this.lookFor(hero), chroma: element as Look['chroma'] };
        bakePortrait(this.gr, hero, look);
        const url = portraitUrl(hero, look);
        return url ? { url, hero: HERO_TEXT[hero].title } : null;
      },
    });
    bridge.on((m) => this.onHost(m));
    // `?skins=demo` (local standalone only, see skinDemo.ts): a fixed roster so card skins show without a host
    if (skinDemoOn({ search: location.search, protocol: location.protocol, hostname: location.hostname, framed: bridge.active || window.parent !== window, isApp: this.isApp() })) {
      this.rosterCats = parseRoster(DEMO_ROSTER);
      this.roster = rosterCosmetics(this.rosterCats, squadPrefs());
      this.syncSkins();
      document.documentElement.dataset.skinDemo = '1';
    }
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
      } else this.analytics.refreshConsent();
    });
    this.gr.resize();
    if (this.dare) this.analytics.track('dare_open', { hero: this.dare.hero, difficulty: this.dare.difficulty });
    this.analytics.track('quality_tier', { tier: this.tier });
    this.showTitle();
    // a `?party=` link joins at once; a reload with a party seat (a stored resume token) rejoins it
    if (this.partyApi && this.partyCode) this.openParty('join', this.partyCode);
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
    if (m.type === 'pause' || m.type === 'resume') {
      this.session?.setPaused(m.type === 'pause');
      // correctness QA: a pause sent while the match chunk loads was lost (the bridge said paused, the match ran)
      if (!this.session) this.pendingPause = m.type === 'pause';
      this.bridge.post('paused', { paused: m.type === 'pause' });
    } else if (m.type === 'audio') {
      this.setMuted(m.muted === true);
      const v = parseAudio(m);
      if (v) sfx.setVolumes(v);
    }
    else if (m.type === 'roster') {
      this.rosterCats = parseRoster(m.cats);
      this.roster = rosterCosmetics(this.rosterCats, squadPrefs());
      this.syncSkins();
      this.autoEquip();
      this.refreshMeta();
    } else if (m.type === 'offer') {
      const o = offerOf(m.offer);
      if (o !== undefined) this.hostOffer = o;
    } else if (!this.integration.handle(m)) this.ent.apply(m);
    if (m.type === 'featured' || m.type === 'app') this.syncSkins();
    // save-result and featured belong to the integration: the results save chip shows "+N catnip" once the
    // server paid it (POST /user/catbassadors/live via the host)
  }

  // ------------------------------------------------------------------------------------------- card skins

  private isApp(): boolean {
    return this.ent.snapshot().isApp || isAppBuild() || this.integration.state().app?.isApp === true;
  }

  /** GDD §7.2: owned cats (with their Bond) and, on the web, the featured cats as skins. */
  private syncSkins(): void {
    setRosterSkins(this.rosterCats, loadProfile().bond);
    setFeaturedSkins(this.isApp() ? [] : this.integration.state().featured);
  }

  /**
   * Locked featured tiles and showcase bots follow the offer gates: web only, from the second play session (never in
   * session 1). App builds: never.
   */
  private skinShowcaseOpen(firstMatch = false): { tiles: boolean; bots: boolean } {
    return showcaseGate({ isApp: this.isApp(), playSession: playSession(loadProfile()), firstMatch });
  }

  private skinTile(sk: CatSkin): SkinTile {
    return { id: sk.id, name: sk.name, element: sk.element, rung: sk.rung, bond: sk.bond, next: nextBond(sk.bond), tint: coatGlow(sk), ...(sk.art ? { art: sk.art } : {}), ...(sk.fromPack ? { fromPack: true } : {}) };
  }

  /** The card the lobby shows for a worn skin ("Wearing <name>"), or null. */
  private wearing(look: Look | null): { name: string; type: string; art?: string; frame?: string } | null {
    const sk = isCardSkinId(look?.coat) ? getSkin(look?.coat) : null;
    if (!sk || sk.featured) return null;
    const frame = sk.rung === 'RARE' ? 'frame.rare' : sk.rung === 'EPIC' ? 'frame.epic' : sk.rung === 'LEGENDARY' ? 'frame.legendary' : undefined;
    return { name: sk.name, type: sk.element, ...(sk.art ? { art: sk.art } : {}), ...(frame ? { frame } : {}) };
  }

  /**
   * The newest cat (profile `newCat`) arrives in the roster: its skin goes on the last-picked champion, once, with a
   * "Now wearing <name> · Undo" chip. Nothing is worn silently.
   */
  private autoEquip(leavingMatch = false): void {
    // never over the match HUD: showTitle runs it again when the match ends
    if (this.screen === 'match' && !leavingMatch) return;
    const p = loadProfile();
    const id = p.newCat;
    if (!id || p.skinAuto === id) return;
    const cat = this.rosterCats.find((c) => c.catalogId === id || c.id === id);
    if (!cat) return;
    const hero = p.hero;
    const prev = p.looks[hero] ?? null;
    p.looks[hero] = cardLook(skinIdOf(cat.id));
    p.skinAuto = id;
    saveProfile(p);
    const chip = document.createElement('div');
    chip.className = 'pl-new pl-wear-chip';
    chip.setAttribute('role', 'status');
    const t = document.createElement('span');
    t.textContent = `Now wearing ${cat.name}`;
    const undo = document.createElement('button');
    undo.className = 'chip small';
    undo.dataset.a = 'undo-skin';
    undo.textContent = 'Undo';
    undo.addEventListener('click', () => {
      const q = loadProfile();
      if (prev) q.looks[hero] = prev;
      else delete q.looks[hero];
      saveProfile(q);
      chip.remove();
      this.refreshMeta();
      if (this.screen === 'pick') this.showPick();
    });
    chip.append(t, document.createTextNode(' · '), undo);
    this.root.appendChild(chip);
    setTimeout(() => chip.classList.add('out'), 6000);
    setTimeout(() => chip.remove(), 6600);
  }

  /** A locked featured skin spins on the turntable for PREVIEW_MS, then the hero's own look returns. */
  private previewSkin(id: string): boolean {
    const sk = getSkin(id);
    if (!sk?.featured || !this.skinShowcaseOpen().tiles) return false;
    const p = loadProfile();
    if (!previewAllowed(p, accountState().signedIn)) return false;
    notePreview();
    wantProbe(id);
    const hero = this.choice.hero;
    this.lobby.setHero(hero, 0, cardLook(id));
    document.documentElement.dataset.skinPreview = id;
    if (sk.catalogId) this.integration.notePreview(sk.catalogId);
    setTimeout(() => {
      if (document.documentElement.dataset.skinPreview === id) delete document.documentElement.dataset.skinPreview;
      if ((this.screen === 'pick' || this.screen === 'title') && this.choice.hero === hero) this.setLobbyHero(hero);
    }, PREVIEW_MS);
    return true;
  }

  private owned(): Owned {
    const s = this.ent.snapshot();
    return { items: s.items, unlocks: new Set(loadProfile().unlocks), roster: this.roster };
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
    d.chromas = this.roster.chromas.join(',');
    d.frame = bestFrame(this.owned(), loadProfile().wornFrame) ?? '';
    if (!s.storeOpen) {
      this.overlay?.close();
      this.overlay = null;
      this.offerEl?.close();
      this.offerEl = null;
    } else this.overlay?.refresh?.();
    this.revealPurchase();
    if (this.screen === 'title') this.showTitle(offer);
    else if (this.screen === 'pick') this.lobby.setHero(this.choice.hero, 0, this.lookFor(this.choice.hero));
    // the open cards drawer follows a roster change
    if (this.cards) this.cards.update(this.deckData(this.dare?.hero ?? this.choice.hero));
  }

  /** The lobby hero's portrait in its look, for the frame badge (baked on demand). */
  private badgePortrait(): string | null {
    const hero = this.dare?.hero ?? this.choice.hero;
    const look = this.lookFor(hero);
    bakePortrait(this.gr, hero, look);
    return portraitUrl(hero, look);
  }

  /** The bought look goes on the lobby hero, with confetti and a short "New!" line, as proof the purchase arrived. */
  private revealPurchase(): void {
    const sku = this.pendingReveal;
    if (!sku || !this.ent.snapshot().skus.has(sku)) return;
    this.pendingReveal = null;
    const hero: HeroId = sku === 'pl_founder' ? this.choice.hero : 'clem';
    const coat = sku === 'pl_founder' ? `coat.founder.${hero}` : sku === 'pl_starter' ? 'skin.clem.pink_bow' : 'skin.clem.dawnblade';
    const p = loadProfile();
    p.looks[hero] = { coat, chroma: (p.looks[hero] as Partial<Look> | undefined)?.chroma ?? null };
    saveProfile(p);
    this.choice = { ...this.choice, hero };
    this.lobby.confetti(2.5);
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

  private setLobbyHero(hero: HeroId): void {
    const look = this.lookFor(hero);
    this.lobby.setHero(hero, 0, look);
    document.documentElement.dataset.look = `${hero}:${lookKey(look)}`;
  }

  // ---------------------------------------------------------------------------------------------- screens

  private setScreen(s: Screen, el: HTMLElement | null): void {
    // QA: the lobby's document key listener left with its screen (it piled up, one per redraw, holding old screens)
    disposeLobby(this.screenEl);
    this.screenEl?.remove();
    this.screenEl = el;
    this.screen = s;
    document.documentElement.dataset.screen = s;
    // the cards drawer belongs to the lobby screens
    if (s === 'match' || s === 'results') {
      this.cards?.close();
      this.cards = null;
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

  private setMuted(m: boolean): void {
    sfx.setMuted(m);
    const p = loadProfile();
    p.muted = m;
    saveProfile(p);
  }

  /** Casual PvP: the mode chosen on the title this page (null: the remembered one). */
  private onlineMode: OnlineMode | null = null;

  /** `offer` false: a redraw after a lobby panel closed (the Treat Track panel never leads to an offer). */
  showTitle(offer = true): void {
    // casual PvP: ask the backend once; the title redraws with the mode chip when it answers yes
    if (this.partyApi && pvpKnown() === null)
      void pvpAvailable(this.partyApi).then((yes) => {
        if (yes && this.screen === 'title' && !this.party) this.showTitle(false);
      });
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
    // a cat that arrived during a match goes on now (never over the match HUD)
    this.autoEquip(true);
    this.lobby.enter();
    this.lobby.side = 0.42;
    this.setLobbyHero(this.dare?.hero ?? this.choice.hero);
    const p = loadProfile();
    const owned = this.owned();
    const s = this.ent.snapshot();
    // lobby spec §3a: the redesigned lobby (ui/lobby); the champion is named after the worn Token Tails cat
    const hero = this.dare?.hero ?? this.choice.hero;
    const look = this.lookFor(hero);
    const card = cardIdentity(hero, look);
    const identity: LobbyIdentity = card
      ? { name: card.name, sub: card.sub, element: card.element, role: card.role, card: true, rung: card.rung }
      : heroIdentity(hero, heroElement(hero));
    const skins = ownedSkins();
    const worn = card ? skins.find((k) => k.id === card.skinId) : undefined;
    const peek = [...(worn ? [worn] : []), ...skins.filter((k) => k !== worn)].slice(0, 3).map((k) => ({
      name: k.name,
      element: k.element,
      rung: k.rung,
      ...(k.art ? { art: k.art } : {}),
      ...(k.sprite ? { sprite: k.sprite } : {}),
    }));
    this.setScreen(
      'title',
      lobbyScreen(this.root, {
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
        onDifficulty: (d) => {
          this.choice = { ...this.choice, difficulty: d };
        },
        cardCount: skins.length,
        peek,
        wearing: card ? { name: card.name } : null,
        onCards: () => this.openCards(),
        // the match chunk loads during the 0.4 s dolly (it is usually prefetched already)
        playOut: () => {
          void loadMatch().catch(() => undefined);
          return this.lobby.playOut();
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
                locked: p.matches < 5,
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
        onCollection: p.matches > 0 ? () => this.openCollection() : undefined,
        onExit: this.bridge.active
          ? () => {
              sfx.play('click');
              this.bridge.post('exit');
            }
          : undefined,
        // round 1: in the guided matches the hero quest names the hero being played ("Win with Cacklejaw" while
        // playing Sage); GAPS A1: after them it is the day's round-robin hero (each of the 8 every 8 days)
        quests: p.matches > 0 ? questViews(loadQuests(), followsHero(p.matches) ? this.choice.hero : undefined) : undefined,
      }),
    );
    if (first) this.analytics.track('title_view', { first_time: p.matches === 0, dare: !!this.dare });
    if (offer) this.maybeOffer('lobby');
    this.maybeConsent();
  }

  /** The "Your cards" drawer on screen (lobby spec §3b), or null. */
  private cards: DeckHandle | null = null;
  private cardsLoading = false;

  /** A card skin as the drawer shows it. */
  private deckCard(sk: CatSkin, locked = false): DeckCard {
    return { ...this.skinTile(sk), ...(sk.sprite ? { sprite: sk.sprite } : {}), ...(locked ? { locked: true } : {}) };
  }

  /** The drawer's data for the lobby hero: owned cards, locked featured tiles (the gates), the worn card. */
  private deckData(hero: HeroId): { owned: DeckCard[]; locked: DeckCard[]; current: string | null; classicPortrait: string | null; signedIn: boolean } {
    const look = this.lookFor(hero);
    const classic = resolveLook(hero, this.owned(), null);
    bakePortrait(this.gr, hero, classic);
    return {
      owned: ownedSkins().map((sk) => this.deckCard(sk)),
      locked: this.skinShowcaseOpen().tiles
        ? this.integration
            .state()
            .featured.map((f) => getSkin(`${FEATURED_SKIN_PREFIX}${f.catalogId}`))
            .filter((sk): sk is CatSkin => !!sk)
            .slice(0, 2)
            .map((sk) => this.deckCard(sk, true))
        : [],
      current: cardIdentity(hero, look)?.skinId ?? null,
      classicPortrait: portraitUrl(hero, classic),
      signedIn: accountState().signedIn,
    };
  }

  /**
   * Open the cards drawer (its own chunk) for the lobby hero. Wearing a card saves `profile.looks[hero]` (as the pick
   * screen's Skins row did), redraws the hero with the equip burst and redraws the screen under the drawer.
   */
  private openCards(): void {
    if (this.cards || this.cardsLoading || this.overlay) return;
    this.cardsLoading = true;
    void import('../ui/deck/deck')
      .then(({ openDeck }) => {
        this.cardsLoading = false;
        if (this.screen !== 'title' && this.screen !== 'pick') return;
        const hero = this.dare?.hero ?? this.choice.hero;
        const tiles = this.integration.championTiles();
        this.cards = openDeck(this.root, {
          hero,
          ...this.deckData(hero),
          postcards: HERO_IDS.flatMap((h) => {
            const c = championOf(h);
            return c ? [{ name: c.cardName, ...(tiles[h]?.art ? { art: tiles[h]?.art } : {}) }] : [];
          }),
          isApp: this.isApp(),
          embed: this.bridge.active,
          onEquip: (id) => {
            const q = loadProfile();
            if (id) q.looks[hero] = cardLook(id);
            else delete q.looks[hero];
            saveProfile(q);
            // nature lane: the worn card's element has its own equip sound (already loaded with the drawer chunk)
            const el = id ? cardIdentity(hero, cardLook(id))?.element : null;
            if (el) void import('../render/nature/natureDefs').then(({ NATURE }) => sfx.play(NATURE[el].sfx)).catch(() => sfx.play('pickup'));
            else sfx.play('pickup');
            this.setLobbyHero(hero);
            this.lobby.equipBurst();
            this.cards?.update({ current: id });
            if (this.screen === 'title') this.showTitle(false);
            // cards lane: redraw the pick screen in place (a rebuilt screen dropped the trick and bots picked on it)
            else if (this.screen === 'pick' && this.screenEl) setPickLook(this.screenEl, hero, this.lookFor(hero));
          },
          onPreview: (id) => this.previewSkin(id),
          onSignIn: () => void this.bridge.post('request-sign-in', { reason: 'save-progress' }),
          onSeen: (id) => wantProbe(id),
          flyTo: () => this.lobby.heroPoint(),
          onClose: () => {
            this.cards = null;
          },
        });
      })
      .catch(() => {
        // the chunk did not load (offline): the pick screen still has every card
        this.cardsLoading = false;
        if (this.screen === 'title') this.showPick();
      });
  }

  showPick(): void {
    this.lobby.enter();
    this.lobby.side = 0.5;
    this.setLobbyHero(this.choice.hero);
    const p = loadProfile();
    this.setScreen(
      'pick',
      pickScreen(this.root, {
        initial: this.choice,
        owned: this.owned(),
        champions: this.integration.championTiles(),
        skins: {
          owned: ownedSkins().map((sk) => this.skinTile(sk)),
          locked: this.skinShowcaseOpen().tiles
            ? this.integration
                .state()
                .featured.map((f) => getSkin(`${FEATURED_SKIN_PREFIX}${f.catalogId}`))
                .filter((sk): sk is CatSkin => !!sk)
                .slice(0, 2)
                .map((sk) => this.skinTile(sk))
            : [],
        },
        onPreview: (id) => this.previewSkin(id),
        onTileSeen: (id) => wantProbe(id),
        // lobby spec §3b: the inline Skins strip is a compact row; the cards live in the drawer
        onDeck: () => this.openCards(),
        looks: p.looks as Record<HeroId, Partial<Look>>,
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
          this.choice = { ...this.choice, hero: h };
          this.setLobbyHero(h);
          // sim v14: the picked hero, its side and the last hero per side (the CATS / DOGS switch restores it) are
          // remembered, so a reload opens on the same side and hero
          const q = loadProfile();
          q.hero = h;
          q.side = HEROES[h].side;
          q.lastBySide[q.side] = h;
          saveProfile(q);
        },
        // sim v14 (DOGS-V13 §2): the CATS / DOGS switch; DOGS waits for the guided first match (a dog dare skips it)
        lastBySide: p.lastBySide,
        dogsLocked: p.matches === 0 && !(this.dare && HEROES[this.dare.hero]?.side === 'dog'),
        onSide: (side, _hero, left) => {
          // the hero the player switched away from is the one that side restores
          const q = loadProfile();
          q.side = side;
          q.lastBySide[HEROES[left].side] = left;
          saveProfile(q);
        },
        onStart: (c) => {
          sfx.play('click');
          this.startMatch(c);
        },
        onBack: () => {
          // Audit UX-08: Back from a "Try <hero>" pick goes home on the hero the player had, not the teased one
          if (this.beforeTry) this.choice = { ...this.choice, hero: this.beforeTry.hero, trick: this.beforeTry.trick };
          this.beforeTry = null;
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
            hero: this.choice.hero,
            trick: this.choice.trick,
            difficulty: picks ? this.choice.difficulty : 'easy',
            difficulties: picks ? ['easy', 'normal', 'hard'] : ['easy'],
            maxDifficulty: picks ? 'hard' : 'easy',
            newbie: p.matches === 0,
            matches: p.matches,
            // casual PvP from the title's chip (a newbie always queues co-op; the relay refuses PvP before 5 matches)
            queueMode: pvpKnown() === true && p.matches >= 5 && (this.onlineMode ?? onlineMode(p.matches)) === 'pvp' ? 'casual' : 'coop',
            build: String(import.meta.env.VITE_PAWLEGENDS_BUILD ?? 'dev').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 32) || 'dev',
            // P9: the embed host mints a single-use ticket with its own session; standalone players are unscored guests
            ticket: () => this.integration.partyTicket(),
            guestKey: () => partyGuestKey(),
            cardId: () => cardIdentity(this.choice.hero, this.lookFor(this.choice.hero))?.catId ?? null,
            preload: () => loadMatch(),
            startMatch: (host, match, _view, info) => this.startPartyMatch(host, match, info?.backfill === true),
            // Quick Play: the remembered side, the analytics context and the pick's default hero per side
            // a brand-new player searches as Cats by default (DOGS is the solo title's unlock after match 1)
            queueSide: p.matches === 0 ? 'cat' : lastQueueSide(),
            saveQueueSide: (side) => setLastQueueSide(side),
            mmInfo: () => ({ surface: this.isApp() ? 'app' : this.bridge.active ? 'embed' : 'web', matches: loadProfile().matches, guest: !accountState().signedIn }),
            heroForSide: (side) => heroForSide(loadProfile(), side),
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
        ...(match.mode === 'coop' ? { coop: true, backfill } : {}),
        ...(match.mode === 'casual' ? { coop: true, backfill, pvp: true } : {}),
      },
    };
    this.lastSetup = setup;
    this.analytics.track('match_start', { hero, difficulty, trick, dare: false, party: true, load_ms: sinceLoadMs(), first_match: p.matches === 0 });
    const veil = loadingVeil(this.root, 'Into the Crossing...', match.mode === 'casual' ? 'PvP' : match.mode === 'coop' ? (backfill ? 'Joining your new team' : 'With your team') : 'With friends', this.wearing(look), { name: veilName(hero, look), matches: p.heroMatches[hero] ?? 0, bond: null });
    this.setScreen('match', null);
    this.lobby.leave();
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

  private startMatch(pick: Choice, seed?: number): void {
    this.beforeTry = null;
    const p = loadProfile();
    // the first-session script (fun plan F1): match 1 is Rookie, matches 2 and 3 Easy, then the player's pick;
    // a dare keeps its own bots (the seed and the difficulty make the dare)
    const c: Choice = { ...pick, difficulty: seed !== undefined ? pick.difficulty : difficultyFor(p.matches, pick.difficulty, undefined, undefined, p.veteran) };
    this.choice = isRookie(c.difficulty) ? { ...c, difficulty: pick.difficulty } : c;
    p.hero = c.hero;
    p.side = HEROES[c.hero]?.side ?? p.side;
    p.lastBySide[p.side] = c.hero;
    p.trick = c.trick;
    if (!isRookie(c.difficulty)) p.difficulty = c.difficulty;
    const tips = tipsDue(p);
    p.tipsNext = false;
    saveProfile(p);
    // the squad may have changed on the pick screen, or a cat just joined
    this.roster = rosterCosmetics(this.rosterCats, squadPrefs());
    const owned = this.owned();
    // GDD §7.2: the first match never wears a card skin (the tutorial art matches); its coat and chroma stay as before
    const chosen = this.lookFor(c.hero);
    const look = p.matches === 0 && isCardSkinId(chosen.coat) ? resolveLook(c.hero, owned, null) : chosen;
    // QA: the cat the champion wears does not also walk as a kitten ("Ficus" twice); the next squad cat walks instead
    const wornCat = cardIdentity(c.hero, look)?.catId ?? null;
    const companions = wornCat ? this.roster.cats.filter((k) => k.id !== wornCat).slice(0, this.roster.companions.length) : this.roster.companions;
    // no probe here: the match uses the palette cached at its start (a probe landing mid-match would rebuild the rig)
    const setup: MatchSetup = {
      ...c,
      // UX pass 2: the signed-in player's profile name over their own hero (guests: "You")
      playerName: this.integration.state().playerName,
      seed,
      speed: this.speed,
      firstMatch: tips,
      newPlayer: p.matches < 5,
      emote: owned.items.has('emote.starter') || owned.unlocks.has('emote.wave'),
      muted: sfx.isMuted,
      look,
      frame: bestFrame(owned, p.wornFrame),
      title: titleOf(owned, p.wornTitle),
      companions,
      guide: p.tipsOff ? 'off' : seed !== undefined && p.matches > 0 ? 'off' : guideMode(p.matches),
      knowsUlt: p.knowsUlt && p.matches > 0,
      // GAPS B1: the ping tip in the player's second match
      pingTip: p.matches === 1 && !p.tipsOff,
      // GAPS B2: Forfeit in the pause menu from this tick (never in matches 1–3 or on Rookie)
      forfeitFrom: forfeitTick(p.matches, c.difficulty),
      skinFx: p.skinFx,
      // GDD §7.2 bot showcase: web, from session 2, never the first match
      showcase: this.skinShowcaseOpen(p.matches === 0 || tips).bots ? this.integration.state().featured.map((f) => `${FEATURED_SKIN_PREFIX}${f.catalogId}`) : [],
    };
    this.lastSetup = setup;
    this.analytics.track('match_start', { hero: c.hero, side: HEROES[c.hero]?.side ?? 'cat', difficulty: c.difficulty, trick: c.trick, dare: seed !== undefined, load_ms: sinceLoadMs(), first_match: p.matches === 0 });
    for (const item of lookItems(look)) this.analytics.track('item_seen_in_match', { item, sku: skuOfItem(item) });
    this.frameMs = [];
    const mates = companions.map((k) => k.name);
    // GAPS A6: the loading screen names this hero's match count and, in a card skin, that cat's Bond
    const worn = isCardSkinId(look.coat) ? getSkin(look.coat) : null;
    const veil = loadingVeil(
      this.root,
      'Into the Crossing...',
      mates.length ? `${mates.join(' and ')} ${mates.length > 1 ? 'walk' : 'walks'} with you this match` : undefined,
      this.wearing(look),
      { name: veilName(c.hero, look), matches: p.heroMatches[c.hero] ?? 0, bond: worn && !worn.featured ? worn.bond : null },
    );
    this.setScreen('match', null);
    this.lobby.leave();
    this.session?.dispose();
    this.session = null;
    this.pendingPause = false;
    const token = ++this.matchToken;
    void loadMatch()
      .then(({ MatchSession }) => {
        if (token !== this.matchToken) return;
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

  /** The lobby's last frame is up behind the champion browser: no more lobby frames until it closes. */
  private champFrozen = false;

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

  private showResults(e: MatchEnd): void {
    // QA: the name the match used (a roster update during the match must not turn "Ficus" back into "Clem")
    const myCard = this.session?.card ?? null;
    // UX pass 2: the username the match showed names the player's row (and the MVP / best lines)
    const userName = this.session?.playerName ?? null;
    const won = e.result.outcome === 'won';
    const seconds = Math.floor(e.result.ticks / 30);
    const setup = this.lastSetup;
    const rec = recordMatch(won, seconds, e.replay.difficulty);
    // GDD §7.2 Bond: one more finished match wearing this cat's skin (earned by play only)
    const worn = isCardSkinId(setup?.look?.coat) ? getSkin(setup?.look?.coat) : null;
    let skinLine: { name: string; art?: string; bond: number; next: number | null; rung: CatTier; tint: number } | null = null;
    if (worn && !worn.featured) {
      const bond = noteBond(worn.catId, this.rosterCats.map((c) => c.id));
      this.syncSkins();
      // Wave C (C4): the card effects after this match's Bond (a new rung shows its new effect)
      const now = getSkin(worn.id) ?? worn;
      skinLine = { name: worn.name, ...(worn.art ? { art: worn.art } : {}), bond, next: nextBond(bond), rung: now.rung, tint: coatGlow(now) };
    }
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
    if (!partyEnd) {
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
    // Sim v9: from a non-owner's 3rd finished match on a shelter champion, the host may offer that card (until shown)
    if (noteChampionMatch(e.replay.hero) > 0) this.integration.championMatch(e.replay.hero);
    noteHeroMatch(e.replay.hero);
    // Treat Track and daily quests (local, free, fixed order); recordMatch counted this match already.
    // GAPS B2: a forfeit pays TREAT_XP.forfeit only: no quest progress, no grade or first-win XP, a full ladder loss.
    const forfeit = e.result.reason === 'forfeit';
    const follow = followsHero(loadProfile().matches - 1);
    const quests = forfeit
      ? (() => {
          const state = loadQuests();
          return { state, views: questViews(state, follow ? e.replay.hero : undefined), xp: 0 };
        })()
      : progressQuests(loadQuests(), { won, hero: e.replay.hero, takedowns: e.fun.takedowns, pudding: e.fun.pudding, towers: e.fun.towers, combos: e.fun.combos }, follow);
    if (!forfeit) saveQuests(quests.state);
    const prof = loadProfile();
    const ownedIds = new Set<string>([...prof.unlocks, ...this.ent.snapshot().items]);
    // GAPS A2: the grade (pure, from the sim's own stats) adds Treat XP (S +40, A +25, B +10; never catnip)
    const mySlot = e.welcome.slot;
    const grades = gradeMatch(e.result);
    const myGrade = grades.slots.find((g) => g.slot === mySlot)?.grade ?? 'C';
    const gradeXp = forfeit ? 0 : GRADE_TREAT_XP[myGrade];
    // GAPS A6: the first win of the local day adds its bonus (once a day, no streak, no catnip)
    const treats = addTreatXp(loadTreats(), treatXpFor({ won, takedowns: e.fun.takedowns, pudding: e.fun.pudding, forfeit }) + quests.xp + gradeXp, ownedIds, { won, day: dayKey() });
    saveTreats(treats.state);
    if (treats.rewards.length) {
      for (const r of treats.rewards) if (!prof.unlocks.includes(r.id)) prof.unlocks.push(r.id);
      saveProfile(prof);
    }
    for (const id of e.tips) this.analytics.track('tip_done', { id });
    if (rec.second) this.analytics.track('second_match', { hero: e.replay.hero });
    if (this.frameMs.length > 60) this.analytics.track('perf_sample', { p95: p95(this.frameMs), tier: this.tier });
    this.session?.dispose();
    this.session = null;
    this.lobby.enter();
    this.lobby.side = 0.45;
    this.setLobbyHero(e.replay.hero);
    if (won) this.lobby.confetti(3);
    let link: string | null = null;
    // a party match has no dare link (its seed belongs to the party)
    if (won && !partyEnd) {
      try {
        const base = shareBase({ appShell: inAppShell(), embedded: this.bridge.active, referrer: document.referrer, href: location.href });
        link = dareUrl({ seed: e.replay.seed, hero: e.replay.hero, trick: e.replay.trick, difficulty: e.replay.difficulty, seconds: seconds < suddenDeathS(e.replay.difficulty) ? seconds : 0 }, base);
      } catch {
        link = null;
      }
    }
    const s = this.ent.snapshot();
    const lp = loadProfile();
    if (e.fun.usedUlt && !lp.knowsUlt) {
      lp.knowsUlt = true;
      saveProfile(lp);
    }
    // GAPS A2: the grade replaces the old KDA impact on the ladder (an S or A loss costs half; not stacked)
    // the bot ladder is a solo rating: a party match (friends, a shared seed, bots flying dropped friends) never moves it
    const ladder = partyEnd ? null : recordLadder({ won, difficulty: e.replay.difficulty, hero: e.replay.hero, heroName: HERO_TEXT[e.replay.hero].title, seconds, takedowns: e.fun.takedowns, grade: myGrade, forfeit });
    // round 2: "Change hero" names one to try (from match 2: match 1 keeps Play again as the only call)
    const tease = lp.matches >= 2 ? tryHeroFor(e.replay.hero, lp.bests) : null;
    const myTeam = mySlot < 3 ? 0 : 1;
    // lobby spec §3b: a worn owned card names the player's row and MVP after the cat (records stay per hero)
    const names = selfNames(slotNames(e.welcome.picks, e.welcome.seed, e.welcome.slot), mySlot, userName ? { name: userName } : myCard);
    // party play: every human row (yours too), the MVP and "Best on your team" use the party names the friends saw
    const partyNames = (partyEnd as { names?: (string | null)[] } | undefined)?.names;
    if (partyNames) partyNames.forEach((n, slot) => n && (names[slot] = n));
    const nameOf = (slot: number): string => names[slot] ?? HERO_TEXT[e.result.stats.find((st) => st.slot === slot)?.hero ?? e.replay.hero].title;
    const bestMine = grades.best[myTeam];
    // Party play (M6): results together, the party's rows and actions (the save chip stays this player's own)
    const party = partyEnd && this.party ? this.party : null;
    const table = e.result.stats
      .map((st) => ({
        name: nameOf(st.slot),
        grade: grades.slots.find((g) => g.slot === st.slot)?.grade,
        mvp: st.slot === grades.mvp,
        best: !won && st.slot === bestMine,
        rel: st.slot === mySlot ? 'self' : (st.slot < 3 ? 0 : 1) === myTeam ? 'ally' : 'enemy',
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
        won,
        seconds,
        hero: e.replay.hero,
        heroName: myCard?.name ?? null,
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
            ...(grades.mvp === mySlot ? { portrait: setup?.look ? portraitUrl(e.replay.hero, setup.look) : null, tier: worn && !worn.featured ? (getSkin(worn.id) ?? worn).rung : null } : {}),
          },
          // cards: on a defeat the results card shows the best on the player's team (feel QA: the enemy MVP got the rays)
          bestOnTeam: won
            ? null
            : {
                name: nameOf(bestMine),
                you: bestMine === mySlot,
                hero: e.welcome.picks[bestMine] ?? e.result.stats.find((st) => st.slot === bestMine)?.hero,
                ...(bestMine === mySlot ? { portrait: setup?.look ? portraitUrl(e.replay.hero, setup.look) : null, tier: worn && !worn.featured ? (getSkin(worn.id) ?? worn).rung : null } : {}),
              },
        },
        personal: ladder?.personal ?? null,
        // a party's surrender is the team's vote, not one player's forfeit
        cause: partyEnd && e.result.reason === 'forfeit' ? 'Your team voted to surrender.' : e.cause,
        // round 2: a returning player (4+ matches or "played MOBAs before") gets Play again at End + 2.5 s
        quick: lp.matches >= 4 || lp.veteran || !!partyEnd,
        tryHero: tease,
        skin: skinLine,
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
          this.analytics.track('rematch_click', { kind: 'again', hero: e.replay.hero, difficulty: e.replay.difficulty });
          this.startMatch(setup ? { hero: setup.hero, trick: setup.trick, difficulty: setup.difficulty } : this.choice);
        },
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
    // the offer card waits for the staged results reveal, and shows only after a win (never on a Defeat screen),
    // never after the Rookie match (fun plan F4)
    if (won && !isRookie(e.replay.difficulty))
      setTimeout(() => {
        if (this.screen === 'results') this.maybeOffer('results');
      }, 2500);
  }

  // ------------------------------------------------------------------------------------- store and offers

  private openStore(from: 'lobby' | 'results'): void {
    if (!this.ent.snapshot().storeOpen || this.overlay) return;
    this.offerEl?.close();
    this.offerEl = null;
    this.analytics.track('store_open', { from });
    const panel = storePanel(this.root, {
      snapshot: () => this.ent.snapshot(),
      termsUrl: this.termsUrl(),
      checkout: this.checkout,
      onClose: () => {
        this.overlay = null;
      },
      onNotify: () => this.notify('store'),
      onBuy: (sku) => this.analytics.track('checkout_start', { sku }),
    });
    this.overlay = panel;
  }

  private notify(where: 'store' | 'results'): void {
    if (!this.ent.snapshot().notifyOpen) return;
    if (this.bridge.post('notify', { where })) this.analytics.track('notify_signup', { where });
  }

  private maybeOffer(screen: OfferScreen): void {
    if (this.offerEl || this.overlay) return;
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
      cards: ownedSkins().map((sk) => ({ name: sk.name, rung: sk.rung, tint: coatGlow(sk) })),
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
    const saver = batterySaver().on || this.gr.settings.fpsCap < MATCH_FPS;
    // PERF-IOS §8 Track C: the champion browser covers the 3D view (its own clip runs on its own canvas): over a menu
    // the lobby is drawn once more and then not at all until it closes; over a match it counts as a covering panel
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
    else {
      this.lobby.update(dt);
      this.gr.render();
    }
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
/** How long a featured skin preview spins on the turntable (ms). */
export const PREVIEW_MS = 8000;

/** The SKU an item came from (analytics only). */
function skuOfItem(item: string): string {
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
