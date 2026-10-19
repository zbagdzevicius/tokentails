/**
 * The app flow (POC.md §12): title → pick → match → results, one frame loop, the quality governor, the lobby
 * turntable between matches and the embed bridge. Also the meta layer around the matches: cosmetics from the
 * entitlement token, free unlocks and the host roster; the store, the offer card and settings; consent-gated
 * analytics. `html[data-screen]` names the current screen (tests read it; there is no debug global).
 */
import { HumanFilter } from '../analytics/human';
import { createAnalytics, type Analytics } from '../analytics/posthog';
import { sfx } from '../audio/sfx';
import type { Bridge, HostMessage } from '../embed/bridge';
import { EMPTY_ROSTER, isAppBuild, parseRoster, rosterCosmetics, type RosterCat, type RosterCosmetics } from '../meta/roster';
import { nextBond, onSkinsChanged, ownedSkins, setFeaturedSkins, setRosterSkins, showcaseGate, wantProbe } from '../render/skins/registry';
import { FEATURED_SKIN_PREFIX, getSkin, isCardSkinId, skinIdOf, type CatSkin } from '../render/skins/skinStore';
import type { SkinTile } from '../ui/screens';
import { squadPrefs } from '../meta/squad';
import { DEMO_ROSTER, skinDemoOn } from './skinDemo';
import { recordLadder } from '../meta/ladder';
import { GRADE_TREAT_XP, gradeMatch } from '../meta/grade';
import { HERO_IDS } from '../data/heroes';
import { accountState, loadProfile, noteBond, noteChampionMatch, noteHeroMatch, notePreview, playSession, previewAllowed, recordMatch, saveProfile, startSession, tipsDue } from '../meta/profile';
import { CheckoutBridge } from '../money/checkoutBridge';
import { Entitlements } from '../money/entitlements';
import { markShown, offerOf, pickOffer, type Offer, type OfferScreen } from '../money/offer';
import type { SkuId } from '../money/skus';
import { ELEMENT_COLOR, bestFrame, cardLook, lookItems, lookKey, resolveLook, titleOf, type Look, type Owned } from '../render/cosmetics';
import { Lobby } from '../render/lobby';
import { bakePortrait, bakePortraits, portraitUrl } from '../render/portraits';
import { FpsProbe, QualityGovernor, qualityOverride, rememberTier, startTier, type QualityTier } from '../render/quality';
import { createRenderer, type GameRenderer } from '../render/renderer';
import type { HeroId } from '../sim/api';
import { dareFromUrl, dareUrl, type Dare } from '../share/dare';
import { offerCard } from '../ui/offerCard';
import { PerfReadout, perfFromUrl } from '../ui/perfReadout';
import { loadingVeil, pickScreen, refreshPickFaces, resultsScreen, rotatePrompt, titleScreen, type Choice } from '../ui/screens';
import { consentPrompt, settingsPanel } from '../ui/settings';
import { notePurchase, storePanel } from '../ui/store';
import { HERO_TEXT, slotNames } from '../ui/heroText';
import { MatchSession, type MatchEnd, type MatchSetup } from './matchSession';
import { canPickDifficulty, difficultyFor, guideMode, isRookie, pickable, PICK_DIFFICULTY_FROM } from './firstSession';
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
    const face = new FontFace('Fredoka', `url("${base}assets/fonts/Fredoka-Latin.woff2") format("woff2")`, { weight: '300 700', display: 'swap' });
    face
      .load()
      .then((f) => document.fonts.add(f))
      .catch(() => undefined);
    // Sim v9: the champion names Avietė and Gabė. Fredoka has no precomposed ė, but it has e and the combining dot
    // (U+0307), so the UI writes those names decomposed (data/heroes/shelter.ts `uiName`). A cluster e + dot must come
    // from one face, so this one (the whole font) covers Basic Latin too, not only the marks.
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
/** Round 2: the Change hero button teases a hero the player has not won with yet (else the next one), never its own. */
export function tryHeroFor(current: HeroId, bests: Partial<Record<HeroId, unknown>>): HeroId {
  const order: readonly HeroId[] = HERO_IDS;
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
  private governor = new QualityGovernor();
  /** `?quality=` forces a tier for the whole visit: the governor does not step it down (perf.spec.ts measures it). */
  private readonly forcedTier = qualityOverride() !== null;
  private last = performance.now();
  private dare: Dare | null = dareFromUrl();
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

  constructor(
    private readonly root: HTMLElement,
    private readonly bridge: Bridge,
  ) {
    installFont();
    const start = startTier();
    this.tier = start.tier;
    this.probe = start.probe;
    this.gr = createRenderer(root, this.tier);
    this.perf = perfFromUrl() ? new PerfReadout(root) : null;
    // Hero portraits for the pick cards and the HUD, rendered once by this renderer (render/portraits.ts).
    bakePortraits(this.gr);
    document.documentElement.dataset.quality = this.tier;
    this.lobby = new Lobby(this.gr);
    const p = startSession();
    this.sessionNo = p.sessions;
    migrateTreatTrack();
    sfx.setMuted(p.muted);
    this.choice = { hero: p.hero, trick: p.trick, difficulty: p.difficulty };
    this.human.install(window);
    this.analytics = createAnalytics(() => ({ human: this.human.human, embed: bridge.active, session: this.sessionNo, quality: this.tier }));
    this.checkout = new CheckoutBridge(bridge, this.ent);
    this.checkout.onResult((sku, ok) => {
      notePurchase(ok);
      if (ok) this.pendingReveal = sku;
    });
    rotatePrompt(root);
    addEventListener('resize', () => this.gr.resize());
    addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
    addEventListener('keydown', () => sfx.unlock(), { capture: true });
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
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.session?.setPaused(true);
      else this.analytics.refreshConsent();
    });
    this.gr.resize();
    if (this.dare) this.analytics.track('dare_open', { hero: this.dare.hero, difficulty: this.dare.difficulty });
    this.analytics.track('quality_tier', { tier: this.tier });
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
    document.documentElement.dataset.ready = '1';
  }

  // ------------------------------------------------------------------------------------------- host + meta

  private onHost(m: HostMessage): void {
    if (m.type === 'pause' || m.type === 'resume') {
      this.session?.setPaused(m.type === 'pause');
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
    return { id: sk.id, name: sk.name, element: sk.element, rung: sk.rung, bond: sk.bond, next: nextBond(sk.bond), ...(sk.art ? { art: sk.art } : {}), ...(sk.fromPack ? { fromPack: true } : {}) };
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
      if (this.screen === 'pick' && this.choice.hero === hero) this.setLobbyHero(hero);
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
    this.screenEl?.remove();
    this.screenEl = el;
    this.screen = s;
    document.documentElement.dataset.screen = s;
    if (s === 'pick' || s === 'match') {
      this.offerEl?.close();
      this.offerEl = null;
      this.overlay?.close();
      this.overlay = null;
    }
  }

  private setMuted(m: boolean): void {
    sfx.setMuted(m);
    const p = loadProfile();
    p.muted = m;
    saveProfile(p);
  }

  /** `offer` false: a redraw after a lobby panel closed (the Treat Track panel never leads to an offer). */
  showTitle(offer = true): void {
    const first = this.screen !== 'title' || !this.screenEl;
    // a cat that arrived during a match goes on now (never over the match HUD)
    this.autoEquip(true);
    this.lobby.enter();
    this.lobby.side = 0.42;
    this.setLobbyHero(this.dare?.hero ?? this.choice.hero);
    const p = loadProfile();
    const owned = this.owned();
    const s = this.ent.snapshot();
    this.setScreen(
      'title',
      titleScreen(this.root, {
        firstTime: p.matches === 0,
        last: this.choice,
        dare: this.dare,
        muted: sfx.isMuted,
        storeOpen: s.storeOpen,
        frame: bestFrame(owned, p.wornFrame),
        title: titleOf(owned, p.wornTitle),
        portrait: this.badgePortrait(),
        wearing: this.wearing(this.lookFor(this.dare?.hero ?? this.choice.hero)),
        onPlay: (c, seed) => {
          sfx.play('click');
          if (seed !== undefined) this.dare = null;
          this.startMatch(c, seed);
        },
        onChoose: () => {
          sfx.play('click');
          this.showPick();
        },
        onMute: (m) => this.setMuted(m),
        onStore: () => this.openStore('lobby'),
        onSettings: () => this.openSettings(),
        onCollection: p.matches > 0 ? () => this.openCollection() : undefined,
        // round 1: in the guided matches the hero quest names the hero being played ("Win with Cacklejaw" while
        // playing Sage); GAPS A1: after them it is the day's round-robin hero (each of the 8 every 8 days)
        quests: p.matches > 0 ? questViews(loadQuests(), followsHero(p.matches) ? this.choice.hero : undefined) : undefined,
      }),
    );
    if (first) this.analytics.track('title_view', { first_time: p.matches === 0, dare: !!this.dare });
    if (offer) this.maybeOffer('lobby');
    this.maybeConsent();
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
        looks: p.looks as Record<HeroId, Partial<Look>>,
        onLook: (h, look) => {
          const q = loadProfile();
          q.looks[h] = { coat: look.coat, chroma: look.chroma };
          saveProfile(q);
          this.setLobbyHero(h);
        },
        onHero: (h) => {
          sfx.play('click');
          this.choice = { ...this.choice, hero: h };
          this.setLobbyHero(h);
        },
        onStart: (c) => {
          sfx.play('click');
          this.startMatch(c);
        },
        onBack: () => this.showTitle(),
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

  private startMatch(pick: Choice, seed?: number): void {
    const p = loadProfile();
    // the first-session script (fun plan F1): match 1 is Rookie, matches 2 and 3 Easy, then the player's pick;
    // a dare keeps its own bots (the seed and the difficulty make the dare)
    const c: Choice = { ...pick, difficulty: seed !== undefined ? pick.difficulty : difficultyFor(p.matches, pick.difficulty, undefined, undefined, p.veteran) };
    this.choice = isRookie(c.difficulty) ? { ...c, difficulty: pick.difficulty } : c;
    p.hero = c.hero;
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
    // no probe here: the match uses the palette cached at its start (a probe landing mid-match would rebuild the rig)
    const setup: MatchSetup = {
      ...c,
      seed,
      speed: this.speed,
      firstMatch: tips,
      newPlayer: p.matches < 5,
      emote: owned.items.has('emote.starter') || owned.unlocks.has('emote.wave'),
      muted: sfx.isMuted,
      look,
      frame: bestFrame(owned, p.wornFrame),
      title: titleOf(owned, p.wornTitle),
      companions: this.roster.companions,
      guide: p.tipsOff ? 'off' : seed !== undefined && p.matches > 0 ? 'off' : guideMode(p.matches),
      knowsUlt: p.knowsUlt && p.matches > 0,
      skinFx: p.skinFx,
      // GDD §7.2 bot showcase: web, from session 2, never the first match
      showcase: this.skinShowcaseOpen(p.matches === 0 || tips).bots ? this.integration.state().featured.map((f) => `${FEATURED_SKIN_PREFIX}${f.catalogId}`) : [],
    };
    this.lastSetup = setup;
    this.analytics.track('match_start', { hero: c.hero, difficulty: c.difficulty, trick: c.trick, dare: seed !== undefined });
    for (const item of lookItems(look)) this.analytics.track('item_seen_in_match', { item, sku: skuOfItem(item) });
    this.frameMs = [];
    const mates = this.roster.companions.map((k) => k.name);
    // GAPS A6: the loading screen names this hero's match count and, in a card skin, that cat's Bond
    const worn = isCardSkinId(look.coat) ? getSkin(look.coat) : null;
    const veil = loadingVeil(
      this.root,
      'Into the Crossing...',
      mates.length ? `${mates.join(' and ')} ${mates.length > 1 ? 'walk' : 'walks'} with you this match` : undefined,
      this.wearing(look),
      { name: HERO_TEXT[c.hero].title, matches: p.heroMatches[c.hero] ?? 0, bond: worn && !worn.featured ? worn.bond : null },
    );
    this.setScreen('match', null);
    this.lobby.leave();
    this.session?.dispose();
    this.session = new MatchSession(this.gr, this.root, setup, {
      onEnd: (e) => this.showResults(e),
      onLeave: () => {
        this.session?.dispose();
        this.session = null;
        this.showTitle();
      },
      onMute: (m) => this.setMuted(m),
      onError: (msg) => {
        throw new Error(`sim: ${msg}`);
      },
      onPaused: (paused) => this.bridge.post('paused', { paused }),
      onTalent: (tier, choice) => this.analytics.track('talent_pick', { hero: c.hero, tier, choice }),
    });
    setTimeout(() => veil.classList.add('out'), 250);
    setTimeout(() => veil.remove(), 900);
  }

  private showResults(e: MatchEnd): void {
    const won = e.result.outcome === 'won';
    const seconds = Math.floor(e.result.ticks / 30);
    const setup = this.lastSetup;
    const rec = recordMatch(won, seconds, e.replay.difficulty);
    // GDD §7.2 Bond: one more finished match wearing this cat's skin (earned by play only)
    const worn = isCardSkinId(setup?.look?.coat) ? getSkin(setup?.look?.coat) : null;
    let skinLine: { name: string; art?: string; bond: number; next: number | null } | null = null;
    if (worn && !worn.featured) {
      const bond = noteBond(worn.catId, this.rosterCats.map((c) => c.id));
      this.syncSkins();
      skinLine = { name: worn.name, ...(worn.art ? { art: worn.art } : {}), bond, next: nextBond(bond) };
    }
    this.matchesThisSession++;
    this.human.match(seconds);
    // Bridge: the replay is the record; the summary is display only (host `summaryOf`).
    const matchId = this.integration.nextMatchId({ ticks: e.result.ticks, difficulty: e.replay.difficulty, won });
    this.bridge.post('match-result', {
      matchId,
      replay: e.replay,
      summary: { won, ticks: e.result.ticks, hero: e.replay.hero, difficulty: e.replay.difficulty, takedowns: e.kills },
    });
    // pl_* (fun plan F5): real-player numbers to check against the fun1 gate
    this.analytics.track('match_end', {
      result: e.result.outcome,
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
    // Treat Track and daily quests (local, free, fixed order); recordMatch counted this match already
    const quests = progressQuests(
      loadQuests(),
      { won, hero: e.replay.hero, takedowns: e.fun.takedowns, pudding: e.fun.pudding, towers: e.fun.towers, combos: e.fun.combos },
      followsHero(loadProfile().matches - 1),
    );
    saveQuests(quests.state);
    const prof = loadProfile();
    const ownedIds = new Set<string>([...prof.unlocks, ...this.ent.snapshot().items]);
    // GAPS A2: the grade (pure, from the sim's own stats) adds Treat XP (S +40, A +25, B +10; never catnip)
    const mySlot = e.welcome.slot;
    const grades = gradeMatch(e.result);
    const myGrade = grades.slots.find((g) => g.slot === mySlot)?.grade ?? 'C';
    const gradeXp = GRADE_TREAT_XP[myGrade];
    // GAPS A6: the first win of the local day adds its bonus (once a day, no streak, no catnip)
    const treats = addTreatXp(loadTreats(), treatXpFor({ won, takedowns: e.fun.takedowns, pudding: e.fun.pudding }) + quests.xp + gradeXp, ownedIds, { won, day: dayKey() });
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
    if (won) {
      const base = this.bridge.active && document.referrer ? `${new URL(document.referrer).origin}/pawlegends` : location.href;
      try {
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
    const ladder = recordLadder({ won, difficulty: e.replay.difficulty, hero: e.replay.hero, heroName: HERO_TEXT[e.replay.hero].title, seconds, takedowns: e.fun.takedowns, grade: myGrade });
    // round 2: "Change hero" names one to try (from match 2: match 1 keeps Play again as the only call)
    const tease = lp.matches >= 2 ? tryHeroFor(e.replay.hero, lp.bests) : null;
    const myTeam = mySlot < 3 ? 0 : 1;
    const names = slotNames(e.welcome.picks, e.welcome.seed, e.welcome.slot);
    const nameOf = (slot: number): string => names[slot] ?? HERO_TEXT[e.result.stats.find((st) => st.slot === slot)?.hero ?? e.replay.hero].title;
    const bestMine = grades.best[myTeam];
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
    this.setScreen(
      'results',
      resultsScreen(this.root, {
        won,
        seconds,
        hero: e.replay.hero,
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
        ladder: ladder && !isRookie(e.replay.difficulty) ? { rating: ladder.rating, delta: ladder.delta, placement: ladder.placement, impact: ladder.impact, grade: ladder.grade } : null,
        grade: {
          grade: myGrade,
          xp: gradeXp,
          mvp: { name: nameOf(grades.mvp), you: grades.mvp === mySlot },
          bestOnTeam: won ? null : { name: nameOf(bestMine), you: bestMine === mySlot },
        },
        personal: ladder?.personal ?? null,
        cause: e.cause,
        // round 2: a returning player (4+ matches or "played MOBAs before") gets Play again at End + 2.5 s
        quick: lp.matches >= 4 || lp.veteran,
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
          this.analytics.track('rematch_click', { kind: 'again', hero: e.replay.hero, difficulty: e.replay.difficulty });
          this.startMatch(setup ? { hero: setup.hero, trick: setup.trick, difficulty: setup.difficulty } : this.choice);
        },
        // GAPS A3 "Switch cat": the pick screen with this match's difficulty kept (round 2: on the teased hero)
        onChange: () => {
          sfx.play('click');
          this.analytics.track('rematch_click', { kind: 'switch', hero: e.replay.hero, difficulty: e.replay.difficulty });
          const keep = setup && !isRookie(setup.difficulty) ? setup.difficulty : this.choice.difficulty;
          this.choice = { ...this.choice, difficulty: keep, ...(tease ? { hero: tease } : {}) };
          this.showPick();
        },
        onShare: (url) => {
          try {
            void navigator.clipboard?.writeText(url).catch(() => undefined);
          } catch {
            /* no clipboard */
          }
          this.bridge.post('share', { kind: 'dare', url });
        },
        onStore: () => this.openStore('results'),
        onNotify: () => this.notify('results'),
      }),
    );
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

  private openSettings(): void {
    if (this.overlay) return;
    const p = loadProfile();
    const el = settingsPanel(this.root, {
      state: { muted: sfx.isMuted, tier: this.tier, tipsOn: tipsDue(p), stats: this.analytics.configured ? this.analytics.consentState === 'granted' : null, skinFx: p.skinFx },
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
      onClose: () => {
        this.overlay = null;
        if (this.screen === 'title') this.showTitle();
      },
    });
    this.overlay = { close: () => el.remove() };
  }

  private consentEl: HTMLElement | null = null;
  private maybeConsent(): void {
    // The Token Tails page asks on its own (the key is shared); standalone, ask from the second session.
    if (this.consentEl || this.bridge.active || !this.analytics.configured || this.analytics.consentState !== 'unset' || this.sessionNo < 2) return;
    this.consentEl = consentPrompt(this.root, (granted) => {
      this.analytics.setConsent(granted);
      this.consentEl = null;
    });
  }

  // ------------------------------------------------------------------------------------------ frame loop

  private setTier(t: QualityTier): void {
    if (t === this.tier) return;
    this.tier = t;
    rememberTier(t);
    this.gr.setTier(t);
    this.session?.view.setShadows(this.gr.settings.shadows);
    document.documentElement.dataset.quality = t;
    this.analytics.track('quality_tier', { tier: t });
  }

  private frame(now: number): void {
    const raw = Math.max(0, now - this.last);
    const dt = Math.min(0.1, raw / 1000);
    this.last = now;
    if (this.probe) {
      const r = this.probe.sample(dt);
      if (r) {
        if (r === 'low') this.setTier('low');
        rememberTier(this.tier);
        this.probe = null;
      }
    } else if (this.screen === 'match' && !this.forcedTier) {
      const next = this.governor.sample(dt, this.tier);
      if (next) this.setTier(next);
    }
    if (this.screen === 'match' && this.frameMs.length < 20000) this.frameMs.push(raw);
    // Draw calls for the perf check (POC.md §10): a plain data attribute, sampled once a second, no debug global.
    if ((this.frames = (this.frames + 1) % 60) === 0) document.documentElement.dataset.draws = String(this.gr.renderer.info.render.calls);
    if (this.session) this.session.frame(dt);
    else {
      this.lobby.update(dt);
      this.gr.render();
    }
    this.perf?.sample({ frameMs: raw, draws: this.gr.renderer.info.render.calls, tier: this.tier, inMatch: this.screen === 'match' });
    requestAnimationFrame((t) => this.frame(t));
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
