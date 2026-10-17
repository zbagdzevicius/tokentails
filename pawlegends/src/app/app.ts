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
import { EMPTY_ROSTER, parseRoster, rosterCosmetics, type RosterCosmetics } from '../meta/roster';
import { loadProfile, recordMatch, saveProfile, startSession, tipsDue } from '../meta/profile';
import { CheckoutBridge } from '../money/checkoutBridge';
import { Entitlements } from '../money/entitlements';
import { markShown, offerOf, pickOffer, type Offer, type OfferScreen } from '../money/offer';
import type { SkuId } from '../money/skus';
import { bestFrame, lookItems, lookKey, resolveLook, titleOf, type Look, type Owned } from '../render/cosmetics';
import { Lobby } from '../render/lobby';
import { bakePortrait, bakePortraits, portraitUrl } from '../render/portraits';
import { FpsProbe, QualityGovernor, qualityOverride, rememberTier, startTier, type QualityTier } from '../render/quality';
import { createRenderer, type GameRenderer } from '../render/renderer';
import type { HeroId } from '../sim/api';
import { dareFromUrl, dareUrl, type Dare } from '../share/dare';
import { offerCard } from '../ui/offerCard';
import { PerfReadout, perfFromUrl } from '../ui/perfReadout';
import { loadingVeil, pickScreen, resultsScreen, rotatePrompt, SUDDEN_DEATH_S, titleScreen, type Choice } from '../ui/screens';
import { consentPrompt, settingsPanel } from '../ui/settings';
import { notePurchase, storePanel } from '../ui/store';
import { HERO_TEXT } from '../ui/heroText';
import { MatchSession, type MatchEnd, type MatchSetup } from './matchSession';

type Screen = 'title' | 'pick' | 'match' | 'results';

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
    const url = `${import.meta.env.BASE_URL ?? './'}assets/fonts/Fredoka-Latin.woff2`;
    const face = new FontFace('Fredoka', `url("${url}") format("woff2")`, { weight: '300 700', display: 'swap' });
    face
      .load()
      .then((f) => document.fonts.add(f))
      .catch(() => undefined);
  } catch {
    /* system font fallback */
  }
}

/** p95 of a list of frame times (ms). */
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
    bridge.on((m) => this.onHost(m));
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
    } else if (m.type === 'audio') this.setMuted(m.muted === true);
    else if (m.type === 'roster') {
      this.roster = rosterCosmetics(parseRoster(m.cats));
      this.refreshMeta();
    } else if (m.type === 'offer') {
      const o = offerOf(m.offer);
      if (o !== undefined) this.hostOffer = o;
    } else this.ent.apply(m);
  }

  private owned(): Owned {
    const s = this.ent.snapshot();
    return { items: s.items, unlocks: new Set(loadProfile().unlocks), roster: this.roster };
  }

  private lookFor(hero: HeroId): Look {
    const chosen = loadProfile().looks[hero];
    return resolveLook(hero, this.owned(), chosen as Partial<Look> | undefined);
  }

  /** Store, roster or app state changed: redraw the lobby screen so buttons, looks and frames follow. */
  private refreshMeta(): void {
    const s = this.ent.snapshot();
    const d = document.documentElement.dataset;
    d.store = s.storeOpen ? '1' : '0';
    d.isApp = s.isApp ? '1' : '0';
    d.items = [...s.items].sort().join(',');
    d.chromas = this.roster.chromas.join(',');
    d.frame = bestFrame(this.owned()) ?? '';
    if (!s.storeOpen) {
      this.overlay?.close();
      this.overlay = null;
      this.offerEl?.close();
      this.offerEl = null;
    } else this.overlay?.refresh?.();
    this.revealPurchase();
    if (this.screen === 'title') this.showTitle();
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

  showTitle(): void {
    const first = this.screen !== 'title' || !this.screenEl;
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
        frame: bestFrame(owned),
        title: titleOf(owned),
        portrait: this.badgePortrait(),
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
      }),
    );
    if (first) this.analytics.track('title_view', { first_time: p.matches === 0, dare: !!this.dare });
    this.maybeOffer('lobby');
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
      }),
    );
  }

  private startMatch(c: Choice, seed?: number): void {
    this.choice = c;
    const p = loadProfile();
    p.hero = c.hero;
    p.trick = c.trick;
    p.difficulty = c.difficulty;
    const tips = tipsDue(p);
    p.tipsNext = false;
    saveProfile(p);
    const owned = this.owned();
    const look = this.lookFor(c.hero);
    const setup: MatchSetup = {
      ...c,
      seed,
      speed: this.speed,
      firstMatch: tips,
      newPlayer: p.matches < 5,
      emote: owned.items.has('emote.starter'),
      muted: sfx.isMuted,
      look,
      frame: bestFrame(owned),
      title: titleOf(owned),
      companions: this.roster.companions,
    };
    this.lastSetup = setup;
    this.analytics.track('match_start', { hero: c.hero, difficulty: c.difficulty, trick: c.trick, dare: seed !== undefined });
    for (const item of lookItems(look)) this.analytics.track('item_seen_in_match', { item, sku: skuOfItem(item) });
    this.frameMs = [];
    const veil = loadingVeil(this.root, 'Into the Crossing...');
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
    this.matchesThisSession++;
    this.human.match(seconds);
    // Bridge: the replay is the record; the summary is display only (host `summaryOf`).
    this.bridge.post('match-result', {
      replay: e.replay,
      summary: { won, ticks: e.result.ticks, hero: e.replay.hero, difficulty: e.replay.difficulty, takedowns: e.kills },
    });
    this.analytics.track('match_end', { result: e.result.outcome, length: seconds, hero: e.replay.hero, difficulty: e.replay.difficulty, takedowns: e.kills });
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
        link = dareUrl({ seed: e.replay.seed, hero: e.replay.hero, trick: e.replay.trick, difficulty: e.replay.difficulty, seconds: seconds < SUDDEN_DEATH_S ? seconds : 0 }, base);
      } catch {
        link = null;
      }
    }
    const s = this.ent.snapshot();
    this.setScreen(
      'results',
      resultsScreen(this.root, {
        won,
        seconds,
        hero: e.replay.hero,
        difficulty: e.replay.difficulty,
        kills: e.kills,
        deaths: e.deaths,
        level: e.level,
        teamKills: e.teamKills,
        firstWin: rec.firstWin,
        best: rec.best,
        dareLink: link,
        deathsBy: e.deathsBy,
        touch: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
        speed: this.speed,
        storeOpen: s.storeOpen,
        notifyOpen: s.notifyOpen,
        onAgain: () => {
          sfx.play('click');
          this.startMatch(setup ? { hero: setup.hero, trick: setup.trick, difficulty: setup.difficulty } : this.choice);
        },
        onChange: () => {
          sfx.play('click');
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
    // the offer card waits for the staged results reveal, and shows only after a win (never on a Defeat screen)
    if (won)
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

  private openSettings(): void {
    if (this.overlay) return;
    const p = loadProfile();
    const el = settingsPanel(this.root, {
      state: { muted: sfx.isMuted, tier: this.tier, tipsOn: tipsDue(p), stats: this.analytics.configured ? this.analytics.consentState === 'granted' : null },
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

/** The SKU an item came from (analytics only). */
function skuOfItem(item: string): string {
  if (item === 'skin.clem.pink_bow') return 'pl_starter';
  if (item === 'skin.clem.dawnblade') return 'pl_founder_legend';
  return 'pl_founder';
}
