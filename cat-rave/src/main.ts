/**
 * L-UI: boot + wiring. The integration contract between lanes lives here (SPEC.md "Wiring"):
 * params → quality → world → beat clock → crowd → DJ → director → HUD → payout feed → input →
 * frame loop (with the frame-time governor).
 */
import { Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D } from 'three';
import { createBeatClock } from './audio';
import { createAdsApi, type AdsStatusOn, type LiveAd } from './ads/api';
import { mountAdSheet, type MountedAdSheet } from './ads/sheet';
import { adSlot, slotLabel } from './ads/slots';
import { createSponsorsStrip } from './ads/sponsors';
import { createAdBoards } from './ads/world';
import { arcWeekActive, arcWeekOverride } from './arc/arcweek';
import { createArcBadge } from './arc/badge';
import { createArcDeskLogo } from './arc/deskLogo';
import { createRaveApi } from './checkout/api';
import { createArrivalsList } from './checkout/arrivals';
import { forgetMyOrder, readMyOrderIds } from './checkout/myorders';
import { mountCheckout } from './checkout/sheet';
import { countryLeaderboard, fetchGeoCountry } from './data/countries';
import { API_BY_HOST, LAYOUT, LINKS, QUALITY, SHOTS } from './config';
import { createCrowd, type CrowdWithFlags } from './crowd';
import { createPayoutFeed, safeHttpsUrl, treatAllowedHere, treatStatus } from './data';
import { createRaveOrders, type NameShoutout } from './data/rave-orders';
import { createOwnTag } from './ui/ownTag';
import { createDj } from './dj';
import type { BeatEventPayload, FrameContext, LaserMode, PayoutSnapshot, Quality, QualityProfile, Section, WorldApi } from './types';
import { createDirector } from './ui/director';
import { counterText, formatUsd, shareText, shoutFor } from './ui/format';
import { COUNT_UP_MS, createHud, type TreatMode } from './ui/hud';
import { bindInput } from './ui/input';
import { parseParams } from './ui/params';
import { FrameGovernor, pickQuality, readDeviceHints, stepDown } from './ui/quality';
import { composePicture, savePicture, shareLink, shareUrl } from './ui/share';
import { createWorld } from './world';

/** localStorage, or null where it throws (private windows, blocked site data). */
function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function apiBase(override: string | null): string | null {
  if (override) return override;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="rave:api-url"]')?.content.trim();
  if (meta) return meta.replace(/\/+$/, '');
  const env = import.meta.env.RAVE_API_URL as string | undefined;
  const host = location.host.toLowerCase();
  // Dev: any local port reads live data (Vite moves off 5180 when it is taken).
  const dev = import.meta.env.DEV && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? API_BY_HOST['localhost:5180'] : undefined;
  return API_BY_HOST[host] ?? dev ?? (env ? env.replace(/\/+$/, '') : null);
}

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: per-viewer convenience only */
    }
  },
};

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function setBoot(text: string, progress: number) {
  const step = document.getElementById('boot-step');
  if (step) step.textContent = text;
  document.getElementById('boot')?.style.setProperty('--boot-progress', String(progress));
}

function hideBoot() {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('boot-done');
  setTimeout(() => boot.remove(), 700);
}

/** No WebGL: keep the fundraiser readable with plain links. */
function showFallback(snapshot: PayoutSnapshot | null) {
  const boot = document.getElementById('boot');
  if (!boot) return;
  const t = snapshot ? counterText(snapshot) : null;
  boot.classList.add('boot-fallback');
  boot.innerHTML = `<div class="boot-card"><div class="boot-moon" aria-hidden="true"></div>
    <h1>${t ? `${t.amount} raised · ${t.cats}` : 'Moon Rave'}</h1>
    <p>This browser can't show the 3D dance floor (WebGL is off or unavailable). Every $1 paid out to the Pink Paw shelter is one dancing cat.</p>
    <p><a href="${LINKS.give}">Add a cat 🐾</a> · <a href="${LINKS.payouts}">See every payout</a></p></div>`;
}

/**
 * Compiles every shader up front, including objects that only appear later (the drop's sword and
 * bows, the find beacon, the flash): Android GLES can stall 50–200 ms compiling them mid-drop.
 * Hidden objects are made visible for the compile only. Capped so a slow driver never holds boot.
 */
async function precompile(world: WorldApi, camera: Camera) {
  const hidden: Object3D[] = [];
  world.scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  try {
    await Promise.race([world.renderer.compileAsync(world.scene, camera), new Promise((r) => setTimeout(r, 1500))]);
  } catch (err) {
    console.warn('[rave] shader precompile failed', err);
  } finally {
    for (const o of hidden) o.visible = false;
  }
}

async function boot() {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const hudRoot = document.getElementById('hud') as HTMLElement;
  const params = parseParams(location.search, location.host);
  const og = new URLSearchParams(location.search).get('og') === '1';
  const reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
  const api = apiBase(params.api);
  const feed = createPayoutFeed({ api, demoCats: params.cats });
  const firstSnapshot = feed.load(); // start fetching while the scene builds
  // Moon Rave checkout orders: names + X handles for rave cats, arriving holograms, shout-outs.
  // With no API (file preview) nothing is named or arriving.
  const orders = createRaveOrders({ api, feed, myOrders: () => readMyOrderIds(), onOrderGone: (id) => void forgetMyOrder(id) });
  const raveApi = api ? createRaveApi({ base: api }) : null;
  const raveStatus = raveApi && !params.embed && !og ? raveApi.status() : null; // 2 s timeout, never throws

  setBoot('tuning the decks', 0.15);
  await nextFrame();
  const forced: Quality | null = og ? 'high' : params.quality;
  let profile: QualityProfile = QUALITY[forced ?? pickQuality(readDeviceHints())];

  let world: WorldApi;
  try {
    world = createWorld(canvas, profile);
  } catch (err) {
    console.error('[rave] WebGL world failed', err);
    showFallback(await firstSnapshot.catch(() => null));
    return;
  }
  setBoot('rising the moon', 0.35);
  await nextFrame();

  const storedMute = store.get('rave:muted') === '1';
  const clock = createBeatClock({ muted: params.mute || storedMute || og });
  const crowd: CrowdWithFlags = createCrowd(world, profile);
  setBoot('waking the kittens', 0.55);
  await nextFrame();
  const dj = createDj(world, clock, profile);
  // Arc week: the official Arc logo on the booth's front panel (and the HUD badge below) inside the window.
  const arcForced = arcWeekOverride(location.search);
  const arcOn = () => arcForced ?? arcWeekActive(Date.now());
  const deskLogo = createArcDeskLogo(LAYOUT.boothSize);
  world.scene.add(deskLogo.group);
  deskLogo.setVisible(arcOn());
  // Ad space: 20 slots in the world; hidden until the API says ads are on sale or some are live.
  const adBoards = createAdBoards(world.scene);
  const director = createDirector(world, crowd, dj, og ? 'hero' : params.shot, { auto: params.auto && !og, reducedMotion });
  director.resize(window.innerWidth, window.innerHeight);
  await precompile(world, director.camera);

  // ------------------------------------------------------------------ flashes (≤ 3 per second)
  const flashTimes: number[] = [];
  const flash = (color: Parameters<WorldApi['flash']>[0], strength = 1) => {
    const t = performance.now();
    while (flashTimes.length && t - flashTimes[0] > 1000) flashTimes.shift();
    if (flashTimes.length >= 3) return;
    flashTimes.push(t);
    world.flash(color, reducedMotion ? strength * 0.35 : strength);
  };

  // ------------------------------------------------------------------ lasers follow the song
  const laserFor = (s: Section): LaserMode =>
    s === 'drop' ? (reducedMotion ? 'sweep' : 'strobe') : s === 'build' ? 'fan' : s === 'groove' ? 'sweep' : 'idle';
  let holding = false;
  const syncLasers = () => world.setLaserMode(holding ? 'fan' : laserFor(clock.now().section));

  // ------------------------------------------------------------------ data → scene
  let snapshot: PayoutSnapshot | null = null;
  let pinned: number | null = null;
  // Treats sent from this page and not yet in the index: the feed matches them by tx hash and
  // forgets them after 10 minutes, so an unrelated payout never clears "treat on its way".
  let pending = 0;
  const applySnapshot = (s: PayoutSnapshot) => {
    pending = s.demo ? 0 : feed.pendingUsdMicro;
    snapshot = s;
    crowd.setCats(s.catList.slice(0, crowd.capacity));
    syncFlags();
    crowd.setNextCat(s.demo ? 0 : Math.min(0.999, s.progressToNext + pending / 1_000_000));
    hud.setSnapshot(s);
    hud.setPending(pending);
    hud.setCapacity(crowd.capacity);
  };

  /**
   * Flags: each real cat holds its buyer's country (rave orders); DEMO cats keep the sample country
   * the snapshot gave them (undefined = keep). The leaderboard is the orders' board, or a DEMO board.
   */
  const syncFlags = () => {
    const s = snapshot;
    if (!s) return;
    // crowd.setCountries skips the walk when the list did not change (every orders poll lands here).
    crowd.setCountries(s.catList.slice(0, crowd.capacity).map((c) => (c.demo ? undefined : (orders.namesForCat(c)?.country ?? null))));
    const real = orders.countries();
    if (!s.demo) {
      hud.setCountries(real);
      return;
    }
    // DEMO: the real buyers' countries plus the demo cats' sample ones, marked DEMO.
    const board = countryLeaderboard([
      ...real.rows.map((r) => ({ country: r.code, cats: r.cats, landed: r.landed > 0 })),
      { country: null, cats: real.unknownCats },
      ...s.catList.filter((c) => c.demo).map((c) => ({ country: c.country, cats: 1 })),
    ]);
    hud.setCountries({ ...board, demo: true });
  };

  /** Every cat one payout made (a $5 gift = 5 cats) glows, not only the one tapped. */
  const siblingRange = (index: number): { start: number; count: number } => {
    const cat = snapshot?.catList[index];
    const sibs = cat?.payout ? feed.catsForTx(cat.payout.txHash) : [];
    if (sibs.length < 2) return { start: index, count: 1 };
    const start = sibs[0].index;
    return { start, count: Math.min(sibs[sibs.length - 1].index, crowd.capacity - 1) - start + 1 };
  };

  /** `screenY`: where the cat is on screen (tap); the card then avoids covering it. */
  const focusCatIndex = (index: number, opts: { fly: boolean; screenY?: number }) => {
    pinnedShot = director.shot;
    const cat = snapshot?.catList[index];
    if (!cat) return;
    const siblings = cat.payout ? feed.catsForTx(cat.payout.txHash).length : 1;
    const range = siblingRange(index);
    pinned = index;
    if (opts.fly) director.focusCat(index);
    crowd.highlight(range.start, range.count);
    // A fly-to frames the cat in the upper third (director view offset), so the card stays at the
    // bottom; a tapped cat in the lower half gets the card at the top instead.
    const top = !opts.fly && opts.screenY !== undefined && opts.screenY > window.innerHeight * 0.45;
    // A find fly-to card stays a little longer than a tapped cat's (6 s); both close on a camera cut.
    hud.showCat(cat, { mode: 'pin', siblings, place: top ? 'top' : 'bottom', autoCloseMs: opts.fly ? 12_000 : undefined });
  };
  /** `index` when it is a real cat (below snapshot.realCats), else null (demo cats are not shareable). */
  const realCatIndex = (index: number | null) => (index !== null && snapshot && index < snapshot.realCats ? index : null);
  /** Shot the pinned card was opened on: the next camera cut closes it. */
  let pinnedShot: string | null = null;
  const closePinned = () => {
    hud.showCat(null);
    pinned = null;
    if (director.focused !== null) director.focusCat(null);
    else crowd.highlight(null);
  };

  const findCat = (query: string): { ok: boolean; message: string } => {
    const q = query.trim();
    const help = 'Paste a tx hash (0x…) or a cat number like #7.';
    if (!q) return { ok: false, message: help };
    const num = q.match(/^(?:cat\s*)?#?\s*(\d{1,7})$/i);
    const isTx = /^(0x)?[0-9a-f]{8,64}$/i.test(q);
    if (!num && !isTx) return { ok: false, message: help };
    const cat = feed.findCat(q);
    if (!cat) {
      if (num) return { ok: false, message: `There is no cat #${Number(num[1]).toLocaleString('en-US')} yet.` };
      // A payout that is part of the next, unfinished dollar: fly to the half-formed cat.
      const m = feed.findTx(q);
      if (m && !m.complete && snapshot) {
        const pct = Math.min(99, Math.floor((snapshot.progressToNext + pending / 1_000_000) * 100));
        const msg = `Your treat is part of cat #${(m.catIndex + 1).toLocaleString('en-US')}, now ${pct}% formed.`;
        if (m.catIndex < crowd.capacity) {
          hud.showCat(null);
          pinned = null;
          director.focusCat(m.catIndex);
        }
        return { ok: true, message: msg };
      }
      return { ok: false, message: 'No cat for that tx yet. New payouts take about 2 minutes to reach the index.' };
    }
    if (cat.index >= crowd.capacity) return { ok: false, message: `Cat #${cat.index + 1} is dancing off-screen (beyond what this device draws).` };
    focusCatIndex(cat.index, { fly: true });
    const many = cat.payout && isTx ? feed.catsForTx(q) : [];
    if (many.length > 1) return { ok: true, message: `That payout made ${many.length} cats: #${many[0].index + 1}–#${many[many.length - 1].index + 1}. Flying to #${cat.index + 1}.` };
    if (isTx && cat.payout && !cat.payout.txHash.startsWith(q.toLowerCase().replace(/^(0x)?/, '0x'))) {
      return { ok: true, message: `Your payout is part of cat #${cat.index + 1}. Flying there!` };
    }
    return { ok: true, message: `Found cat #${cat.index + 1}!` };
  };

  // ------------------------------------------------------------------ HUD
  const toggleMute = () => {
    const m = !clock.muted;
    clock.setMuted(m);
    store.set('rave:muted', m ? '1' : '0');
    if (!m && !clock.unlocked) void clock.unlock();
    return m;
  };
  let treatMode: TreatMode = 'link';
  const hud = createHud(hudRoot, {
    embed: params.embed || og,
    og,
    coarse,
    muted: clock.muted,
    onMute() {
      hud.setSoundPrompt(false);
      return toggleMute();
    },
    async onShareLink() {
      // Real cats only: a ?cats= demo count is never shared, and neither is a demo cat's number
      // (the shared link drops ?cats, so it would point at a cat that does not exist).
      const url = shareUrl(realCatIndex(director.focused ?? pinned));
      const r = await shareLink(url, shareText(snapshot?.realCats ?? 0));
      return r === 'copied' ? 'Link copied. Paste it anywhere.' : r === 'shared' ? 'Thanks for sharing!' : `Copy this link: ${url}`;
    },
    async onSavePicture() {
      try {
        const scene = await world.capture();
        const t = snapshot ? counterText(snapshot) : { amount: '$0.00', cats: '0 cats dancing' };
        // A demo crowd is stamped DEMO across the picture so it can't pass for the real floor.
        const png = await composePicture(scene, {
          amount: t.amount,
          cats: t.cats,
          tag: 'Moon Rave · $1 = 1 dancing cat for the Pink Paw shelter',
          demo: snapshot?.demo ? `DEMO · ${snapshot.cats.toLocaleString('en-US')} cats shown, not real` : null,
        });
        const r = await savePicture(png);
        return r === 'shared' ? 'Shared!' : 'Saved moon-rave.png';
      } catch (e) {
        console.warn('[rave] capture failed', e);
        return 'Could not grab the picture on this device. Try a screenshot.';
      }
    },
    onFind: findCat,
    onShot(id) {
      if (id === 'auto') director.setAuto(true);
      else {
        director.setAuto(false);
        director.setShot(id);
      }
    },
    shotState: () => ({ shot: director.shot, auto: director.auto }),
    async onTreat() {
      // feed.sendTreat records the treat as pending (by tx hash, 10-minute expiry) and re-reads
      // the index at 30 s and 2.5 min.
      const r = await feed.sendTreat();
      if (r.ok) {
        if (snapshot) applySnapshot(snapshot);
        const href = safeHttpsUrl(r.explorerUrl);
        hud.shout('Treat sent! 🍬 On its way to the floor', href ? { href, label: 'tx ↗' } : undefined);
        crowd.pulsePaws(1);
        flash('pink', 0.6);
      }
      return r;
    },
    onCardClosed() {
      pinned = null;
      if (director.focused !== null) director.focusCat(null);
      else crowd.highlight(null);
    },
    nameFor(cat) {
      const n = orders.namesForCat(cat);
      return n ? { name: n.name, x: n.x, xUrl: n.xUrl, country: n.country } : null;
    },
  });
  const badge = createArcBadge();
  if (!params.embed && !og) hud.mountBadge(badge.el);
  const syncArc = () => {
    const on = arcOn();
    badge.setVisible(on && !params.embed && !og);
    deskLogo.setVisible(on);
  };
  syncArc();
  setInterval(syncArc, 60_000);
  const sponsors = createSponsorsStrip();
  if (!params.embed && !og) hud.mountSponsors(sponsors.el);

  // A pending treat expires after 10 minutes even if no new snapshot arrives.
  setInterval(() => {
    if (!snapshot || snapshot.demo) return;
    const p = feed.pendingUsdMicro;
    if (p !== pending) applySnapshot(snapshot);
  }, 15_000);

  // ------------------------------------------------------------------ beat events
  // The DJ's own speech bubble says "no sleep, just grind"; the stamp says something else.
  const stamps = ['PAWS UP!', '$1 = 1 CAT', 'DROP!'];
  let stampN = 0;
  clock.on('drop', ({ cause }: BeatEventPayload) => {
    dj.raiseSword();
    dj.confetti();
    crowd.jump(1);
    crowd.pulsePaws(1);
    // The world flashes white-green and pumps the bloom on the drop downbeat itself.
    director.onDrop();
    syncLasers();
    if (!og) hud.stamp(cause === 'new-cat' ? 'NEW CAT!' : cause === 'viewer' ? 'DROP!' : stamps[stampN++ % stamps.length]);
  });
  clock.on('section', syncLasers);
  clock.on('build', () => {
    world.setLaserMode('fan');
    flash('violet', 0.5);
  });
  syncLasers();

  // ------------------------------------------------------------------ payouts
  setBoot('counting the cats', 0.75);
  applySnapshot(await firstSnapshot);
  // New cats: the camera cuts to where the first one lands and holds there while they fall from
  // 30 m into their slots; the whole new range glows for ~10 s; the counter bounces. Shout-outs
  // about new money wait for the counter's count-up, so the text never runs ahead of the number.
  let newCatGlow = 0;
  const NEW_CAT_GLOW_MS = 10_000;
  feed.subscribe((next, diff) => {
    applySnapshot(next);
    const landed = diff.newCats.filter((c) => c.index < crowd.capacity);
    if (landed.length && pinned === null && director.focused === null && !next.demo) {
      const first = landed[0];
      director.landing(first.index, 6 + Math.min(landed.length, 8) * 0.28);
      const lead = director.landingLeadS;
      landed.forEach((cat, i) => void crowd.dropIn(cat.index, lead + i * 0.04));
      crowd.highlight(first.index, landed[landed.length - 1].index - first.index + 1);
      clearTimeout(newCatGlow);
      newCatGlow = window.setTimeout(() => {
        if (pinned === null && director.focused === null) crowd.highlight(null);
      }, NEW_CAT_GLOW_MS);
    } else {
      landed.forEach((cat) => void crowd.dropIn(cat.index));
    }
    const last = landed[landed.length - 1];
    const tmp = new Vector3();
    if (last && crowd.catPosition(last.index, tmp)) dj.pointAt(tmp);
    if (diff.newCats.length) {
      const first = diff.newCats[0];
      const n = diff.newCats.length;
      // A Moon Rave order's cats land under the buyer's names ("Mochi just landed! 🪩",
      // "Mochi + 4 friends landed!"), in the DJ bubble and the toast alike; other payouts keep "Cat #N".
      const named = orders.namesForCat(first)?.name ?? null;
      const landedLine = named ? (n > 1 ? `${named} + ${n - 1} ${n - 1 === 1 ? 'friend' : 'friends'} landed! 🪩` : `${named} just landed! 🪩`) : null;
      dj.shout(landedLine ?? (n > 1 ? `${n} new cats! Paws up!` : `Cat #${first.index + 1} just landed!`));
      clock.meow(n > 1 ? 84 : 81);
      hud.celebrateCats(n);
      const text = landedLine ?? (n > 1 ? `${n} new cats just landed! Cat #${first.index + 1}–#${first.index + n}` : shoutFor(first));
      setTimeout(() => hud.shout(text), COUNT_UP_MS);
      clock.queueDrop('new-cat');
      flash('green', 0.8);
    } else if (diff.newPayouts.length) {
      const micro = diff.newPayouts.reduce((n, p) => n + p.usdMicro, 0);
      setTimeout(() => hud.shout(`+${formatUsd(micro)} just landed for the shelter`), COUNT_UP_MS);
      crowd.pulsePaws(0.7);
    }
  });
  feed.startPolling();

  // ------------------------------------------------------------------ Moon Rave orders (names, holograms)
  // Paid orders whose payout is not in the feed yet stand on the floor as pink holograms (never
  // counted); when the payout lands they become real cats and the DJ shouts out their names.
  const arrivals = createArrivalsList({ title: 'Arriving now', max: 6 });
  if (!params.embed && !og) hud.mountArrivals(arrivals.el);
  // The viewer's own arriving hologram carries a floating name tag (the first one, if several).
  const ownTag = createOwnTag(hudRoot);
  let ownK = -1;
  // "dancing" rows leave the list DANCING_ROW_MS after they landed, so it does not keep growing.
  const DANCING_ROW_MS = 30_000;
  const landedSeen = new Map<string, number>();
  let collapseTimer = 0;
  const syncOrders = () => {
    crowd.setArriving(orders.arriving().count);
    syncFlags();
    const nowMs = Date.now();
    let nextCollapse = Infinity;
    const rows = orders.recent(12).filter((r) => {
      if (r.phase !== 'landed') return true;
      let at = landedSeen.get(r.orderId);
      if (at === undefined) landedSeen.set(r.orderId, (at = nowMs));
      const left = at + DANCING_ROW_MS - nowMs;
      if (left > 0) nextCollapse = Math.min(nextCollapse, left);
      return left > 0;
    });
    arrivals.update(rows.slice(0, 6));
    clearTimeout(collapseTimer);
    if (Number.isFinite(nextCollapse)) collapseTimer = window.setTimeout(syncOrders, nextCollapse + 50);
    // Own hologram: index among the drawn holograms (newest order first, like crowd.pickArriving).
    const shown = crowd.arrivingShown;
    const names = shown ? orders.arrivingNames(shown) : [];
    ownK = names.findIndex((n) => orders.order(n.orderId)?.mine);
    const own = ownK >= 0 ? names[ownK] : null;
    ownTag.set(own ? (own.name ?? 'Your cat') : null, own ? (orders.order(own.orderId)?.cats ?? 1) : 1);
  };
  orders.subscribe(syncOrders);
  // Tapping your own row in the arrivals list: the DJ points at your hologram and its tag pulses.
  arrivals.el.addEventListener('click', (ev) => {
    const row = (ev.target as HTMLElement | null)?.closest?.('.rvc-arr-mine');
    if (!row || (ev.target as HTMLElement).closest('a') || ownK < 0) return;
    const tmp = new Vector3();
    if (crowd.arrivingPosition(ownK, tmp)) dj.pointAt(tmp);
    ownTag.pulse();
  });
  /** Name, X and status of arriving hologram `k` (newest order first, like crowd.pickArriving). */
  const arrivingInfo = (k: number) => {
    const n = orders.arrivingNames(Math.max(k + 1, crowd.arrivingShown))[k];
    if (!n) return null;
    const view = orders.arriving().orders.find((o) => o.orderId === n.orderId);
    return { name: n.name, x: n.x, xUrl: n.xUrl, country: n.country, status: view?.status ?? 'paid', delayed: view?.delayed ?? false };
  };
  const shoutNames = (e: NameShoutout) => {
    // The canvas bubble takes plain text; the HUD toast gets the buyer's X as a real link (ugc rel).
    // The feed's own "N new cats!" bubble (3.2 s) fires in the same tick, so the names follow it.
    setTimeout(() => dj.shout(e.text, 5), 3400);
    const names = e.x ? e.text.replace(/ Shout-out to @[A-Za-z0-9_]{1,15}!$/, '') : e.text;
    // After the generic "N new cats just landed!" toast (COUNT_UP_MS + its 3.7 s on screen).
    setTimeout(() => {
      if (e.x && e.xUrl) hud.shout(`${names} Shout-out to`, { href: e.xUrl, label: `@${e.x}`, after: '!' });
      else hud.shout(names);
    }, COUNT_UP_MS + 3800);
    const tmp = new Vector3();
    const cat = e.cats[0];
    if (cat && cat.index < crowd.capacity && crowd.catPosition(cat.index, tmp)) dj.pointAt(tmp);
    clock.meow(86);
  };
  orders.onLanded(shoutNames);
  void orders.load().then(() => {
    syncOrders();
    orders.startPolling();
  });

  // In-page checkout when GET /rave/status opens card or crypto (USDC on Arc); otherwise today's Add-a-cat sheet.
  void raveStatus?.then((st) => {
    if (!st.enabled || !raveApi) return;
    hud.setCheckout((host) =>
      mountCheckout(host, {
        api: raveApi,
        status: st,
        // The IP country hides the "Your flag" picker; asked once, when the sheet first opens.
        country: st.country !== undefined ? st.country : fetchGeoCountry(api),
        storage: safeLocalStorage(),
        onPaid(o) {
          orders.track(o.answer, o.status === 'paid' ? 'paid' : 'pending');
          syncOrders();
          dj.shout(o.cats > 1 ? `${o.cats} cats on their way! 🛸` : `${o.names[0] ?? 'A new cat'} is on the way! 🛸`, 4);
          crowd.pulsePaws(1);
          flash('pink', 0.7);
        },
        onDone() {
          hud.closeSheet();
          const tmp = new Vector3();
          if (crowd.arrivingShown && crowd.arrivingPosition(0, tmp)) dj.pointAt(tmp);
        },
      }),
    );
  });

  // ------------------------------------------------------------------ ad space
  // Live ads always show (GET /rave/ads); empty slots, "Advertise" and the buy sheet only while
  // GET /rave/ads/status says enabled: card (Stripe keys) or crypto (USDC on Arc to the treasury) is open.
  const adsApi = api && !og ? createAdsApi({ base: api }) : null;
  let liveAds: LiveAd[] = [];
  let adSheet: MountedAdSheet | null = null;
  const applyAdsStatus = (st: AdsStatusOn) => {
    adBoards.setTaken(st.slots.filter((x) => !x.free && !liveAds.some((a) => a.slotId === x.slotId)).map((x) => x.slotId));
  };
  const loadAds = async () => {
    if (!adsApi) return;
    liveAds = await adsApi.list();
    adBoards.setAds(liveAds);
    sponsors.update(liveAds);
  };
  if (adsApi) {
    void loadAds();
    setInterval(() => void loadAds(), 5 * 60_000);
    void adsApi.status().then((st) => {
      if (!st.enabled || params.embed) return;
      adBoards.setSelling(true);
      applyAdsStatus(st);
      hud.setAdSheet((host) => {
        adSheet = mountAdSheet(host, {
          api: adsApi,
          status: st,
          onStatus: applyAdsStatus,
          onPaid() {
            dj.shout('New sponsor incoming! 📣', 4);
            flash('violet', 0.6);
            void adsApi.status().then((next) => next.enabled && applyAdsStatus(next));
          },
          onClose: () => hud.closeSheet(),
        });
        return adSheet;
      });
    });
  }
  /** Tap on an ad face: the sponsor's card (approved ad) or the buy sheet (empty slot on sale). */
  const tapAd = (slotId: string, y: number) => {
    const ad = adBoards.adFor(slotId);
    const slot = adSlot(slotId);
    if (ad && slot) {
      hud.showSponsored({ name: ad.name, url: ad.url, x: ad.x, imageUrl: ad.imageUrl, slotLabel: slotLabel(slot) }, { place: y > window.innerHeight * 0.45 ? 'top' : 'bottom' });
      return true;
    }
    if (adSheet !== null || adsApi) {
      hud.openAds(slotId);
      return true;
    }
    return false;
  };

  // Treat CTA: in-page only on tokentails.com with a live rail; elsewhere the give page has it.
  if (api && treatAllowedHere(location.host)) {
    hud.setTreatMode('hidden');
    void treatStatus(api).then((st) => {
      treatMode = st?.live ? 'inpage' : 'hidden';
      hud.setTreatMode(treatMode);
    });
  } else hud.setTreatMode(treatMode);

  // ------------------------------------------------------------------ resize
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    world.resize(w, h, Math.min(window.devicePixelRatio || 1, profile.dprCap));
    director.resize(w, h);
  };
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------------ input
  const ndc = new Vector2();
  const ray = new Raycaster();
  const floor = new Plane(new Vector3(0, 1, 0), 0);
  const floorHit = new Vector3();
  const toNdc = (x: number, y: number) => ndc.set((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1);
  let hoverIdx: number | null = null;
  let hoverGhost: number | null = null;
  /** gestures.ts: a second tap within 300 ms is a double tap. */
  const DOUBLE_TAP_MS = 300;
  let tapSelect = 0;
  let activated = false;

  // Audio counts as activated only once unlock() really succeeded: on iOS a drag or pinch is not a
  // user gesture, so the first touch can fail and the next tap must try again.
  const activate = () => {
    if (activated || clock.muted) return;
    void clock.unlock().then((ok) => {
      if (!ok || activated) return;
      activated = true;
      hud.setSoundPrompt(false);
    });
  };
  // Any gesture anywhere (HUD buttons included) unlocks audio.
  document.addEventListener('pointerup', activate, { passive: true });
  bindInput(canvas, {
    activate,
    tap(x, y) {
      toNdc(x, y);
      ray.setFromCamera(ndc, director.camera);
      const origin = ray.ray.intersectPlane(floor, floorHit) ? floorHit.clone() : undefined;
      crowd.jump(0.6, origin);
      crowd.pulsePaws(0.8);
      clock.tap(); // a hat hit in the music (no-op while muted or locked)
      director.onTap();
      // Select / deselect waits out the double-tap window, so the first tap of a double tap only hops.
      const idx = crowd.pick(ndc.x, ndc.y, director.camera);
      clearTimeout(tapSelect);
      const ghost = idx === null && crowd.arrivingShown ? crowd.pickArriving(ndc.x, ndc.y, director.camera) : null;
      const adHit = idx === null && ghost === null ? adBoards.pick(ray) : null;
      tapSelect = window.setTimeout(() => {
        if (idx !== null && snapshot?.catList[idx]) focusCatIndex(idx, { fly: false, screenY: y });
        else if (ghost !== null && arrivingInfo(ghost)) {
          if (pinned !== null || director.focused !== null) closePinned();
          hud.showArriving(arrivingInfo(ghost), { mode: 'pin', place: y > window.innerHeight * 0.45 ? 'top' : 'bottom' });
        } else if (adHit !== null) {
          if (pinned !== null || director.focused !== null) closePinned();
          tapAd(adHit, y);
        } else if (pinned !== null || director.focused !== null) closePinned();
      }, DOUBLE_TAP_MS);
    },
    doubleTap() {
      clearTimeout(tapSelect);
      clock.queueDrop('viewer');
      // Instant answer: the drop itself waits for the next bar line (up to ~1.8 s).
      flash('white', 0.5);
      crowd.jump(1);
      crowd.pulsePaws(1.2);
      director.onTap();
      world.setLaserMode('fan');
      hud.stamp('DROP INCOMING');
    },
    holdStart() {
      holding = true;
      clock.beginBuild();
      world.setLaserMode('fan');
    },
    holdEnd() {
      holding = false;
      clock.endBuild();
    },
    drag(dx, dy) {
      director.orbit(dx, dy);
    },
    dragEnd() {},
    dolly(delta) {
      director.dolly(delta);
    },
    hover(x, y) {
      toNdc(x, y);
      const idx = crowd.pick(ndc.x, ndc.y, director.camera);
      const ghost = idx === null && crowd.arrivingShown ? crowd.pickArriving(ndc.x, ndc.y, director.camera) : null;
      if (ghost !== hoverGhost) {
        hoverGhost = ghost;
        canvas.style.cursor = ghost === null ? '' : 'pointer';
        if (pinned === null && idx === null) hud.showArriving(ghost === null ? null : arrivingInfo(ghost), { mode: 'hover', x, y });
      }
      if (idx === null && ghost === null) {
        ray.setFromCamera(ndc, director.camera);
        const slot = adBoards.pick(ray);
        adBoards.setHover(slot);
        canvas.style.cursor = slot !== null ? 'pointer' : '';
      } else adBoards.setHover(null);
      if (idx === hoverIdx) return;
      hoverIdx = idx;
      if (idx !== null || ghost !== null) canvas.style.cursor = 'pointer';
      if (pinned !== null) return;
      if (idx === null && ghost !== null) {
        crowd.highlight(director.focused);
        return;
      }
      const cat = idx === null ? null : snapshot?.catList[idx] ?? null;
      const hi = idx ?? director.focused;
      if (hi === null) crowd.highlight(null);
      else crowd.highlight(siblingRange(hi).start, siblingRange(hi).count);
      if (cat) hud.showCat(cat, { mode: 'hover', x, y, siblings: cat.payout ? feed.catsForTx(cat.payout.txHash).length : 1 });
      else hud.showCat(null);
    },
    hoverEnd() {
      hoverIdx = null;
      hoverGhost = null;
      adBoards.setHover(null);
      canvas.style.cursor = '';
      if (pinned === null) {
        hud.showCat(null);
        crowd.highlight(director.focused);
      }
    },
    key: {
      buildStart() {
        holding = true;
        clock.beginBuild();
        world.setLaserMode('fan');
      },
      buildEnd() {
        holding = false;
        clock.endBuild();
      },
      drop: () => clock.queueDrop('viewer'),
      shot(n) {
        const id = SHOTS[n - 1];
        if (!id) return;
        director.setAuto(false);
        director.setShot(id);
      },
      toggleAuto: () => director.setAuto(!director.auto),
      toggleMute: () => hud.setMuted(toggleMute()),
      find: () => hud.openSheet('find'),
    },
    keysBlocked: () => hud.sheetOpen,
  });

  // ------------------------------------------------------------------ share image mode (?og=1)
  // scripts/og.mjs screenshots this at 1200×630 → public/og.jpg. A title, not a live number, so the
  // share card never shows a stale total.
  if (og) {
    hudRoot.style.display = 'none';
    const t = document.createElement('div');
    t.style.cssText =
      'position:fixed;left:56px;bottom:44px;font-family:var(--rave-display),system-ui;line-height:1;pointer-events:none;' +
      'color:#eafff0;text-shadow:0 0 16px #5dff8a,0 0 40px rgba(61,255,110,.6),0 3px 0 #0b5a26';
    t.innerHTML =
      '<div style="font-size:96px">MOON RAVE</div>' +
      '<div style="margin-top:10px;font-size:46px;color:#ffd1e6;text-shadow:0 0 14px #ff4f9e,0 0 34px rgba(255,79,158,.6)">$1 raised = 1 dancing cat</div>' +
      '<div style="margin-top:14px;font:700 22px system-ui;color:rgba(234,255,240,.85);text-shadow:0 1px 8px #000">for the Pink Paw cat shelter · live from on-chain payouts</div>';
    const shade = document.createElement('div');
    shade.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 55% at 22% 88%, rgba(2,12,6,.78), transparent 70%)';
    document.body.append(shade, t);
  }

  // ------------------------------------------------------------------ boot focus + hints
  if (params.cat) {
    const r = findCat(params.cat);
    hud.shout(r.message); // success too: "That payout made 5 cats: #3–#7"
  }
  hud.setSoundPrompt(!clock.muted && !og);
  if (!params.embed && !og && store.get('rave:hinted') !== '1') {
    setTimeout(() => {
      hud.hint(coarse ? 'tap to hop · hold to build · double tap to drop' : 'click to hop · hold to build · double-click to drop · drag to orbit');
      store.set('rave:hinted', '1');
    }, 2500);
  }

  // ------------------------------------------------------------------ frame loop
  const governor = new FrameGovernor(profile.targetFps);
  const lowerQuality = () => {
    if (forced) return;
    const next = stepDown(profile.quality);
    if (next) {
      profile = QUALITY[next];
      console.info(`[rave] frame budget missed; stepping down to ${next}`);
    } else if (profile.bloom) {
      // Last step on weak phones: low keeps bloom by default; drop it and the DPR to 1.
      profile = { ...profile, bloom: false, dprCap: 1 };
      console.info('[rave] frame budget missed; low tier without bloom');
    } else return;
    world.setQuality(profile);
    crowd.setQuality(profile);
    dj.setQuality(profile);
    governor.reset(profile.targetFps);
    resize();
    if (snapshot) applySnapshot(snapshot);
  };

  let yieldTick = 0;
  const yielded = new Set<Element>();
  const yieldHud = () => {
    const rects = adBoards.liveRects(director.camera, window.innerWidth, window.innerHeight);
    const next = new Set<Element>();
    if (rects.length && !hud.sheetOpen) {
      for (const el of hudRoot.querySelectorAll('.rv-counter, .rv-side, .rv-arrivals, .rv-arc-badge, .rv-sponsors-slot')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (rects.some((a) => a.x0 < r.right && r.left < a.x1 && a.y0 < r.bottom && r.top < a.y1)) next.add(el);
      }
    }
    for (const el of yielded) if (!next.has(el)) el.classList.remove('rv-yield');
    for (const el of next) el.classList.add('rv-yield');
    yielded.clear();
    for (const el of next) yielded.add(el);
  };
  const ownTagPos = new Vector3();
  const t0 = performance.now();
  let last = t0;
  let frames = 0;
  let fpsT = t0;
  let fps = 0;
  let first = true;
  const frame = (nowMs: number) => {
    requestAnimationFrame(frame);
    const rawDt = (nowMs - last) / 1000;
    const dt = Math.min(0.1, Math.max(0, rawDt));
    last = nowMs;
    clock.tick();
    const beat = clock.now();
    const f: FrameContext = { dt, time: (nowMs - t0) / 1000, beat, camera: director.camera, profile };
    world.renderer.info.reset(); // autoReset is off: the composer's passes would reset it mid-frame
    world.update(f);
    crowd.update(f);
    dj.update(f);
    director.update(f);
    adBoards.update(f.time, director.camera, world.moonCenter);
    // A paid ad never stays under the HUD: a few times a second, any HUD block over a live ad's screen
    // rectangle fades (CSS .rv-yield) until the camera moves on.
    if (++yieldTick % 12 === 0) yieldHud();
    ownTag.update(director.camera, ownK >= 0 ? crowd.arrivingPosition(ownK, ownTagPos) : null, window.innerWidth, window.innerHeight);
    // A tapped cat's card closes on the next camera cut (find fly-tos hold the camera, so no cut).
    if (pinned !== null && director.focused === null && director.shot !== pinnedShot) closePinned();
    world.render(director.camera);
    if (first) {
      first = false;
      setBoot('paws up', 1);
      hideBoot();
      (window as unknown as { __raveReady?: boolean }).__raveReady = true;
    }
    if (governor.sample(rawDt)) lowerQuality();
    frames++;
    if (nowMs - fpsT >= 500) {
      fps = (frames * 1000) / (nowMs - fpsT);
      frames = 0;
      fpsT = nowMs;
      if (params.debug) {
        const info = world.renderer.info.render;
        hud.setDebug(
          `${fps.toFixed(0)} fps · ${governor.averageMs.toFixed(1)} ms · ${profile.quality}\n` +
            `${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris\n` +
            `bar ${beat.bar} · ${beat.section} ${(beat.sectionProgress * 100).toFixed(0)}% · e ${beat.energy.toFixed(2)}\n` +
            `shot ${director.shot}${director.auto ? ' (auto)' : ''}${director.manual ? ' manual' : ''} · cats ${snapshot?.cats ?? 0}/${crowd.capacity}`,
        );
      }
    }
  };
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) last = performance.now();
  });

  // Exposed for the dev console and e2e checks only.
  (window as unknown as { __rave?: unknown }).__rave = {
    world,
    crowd,
    dj,
    clock,
    director,
    feed,
    hud,
    orders,
    ads: adBoards,
    reloadAds: loadAds,
    deskLogo,
    badge,
    get profile() {
      return profile;
    },
    setProfile: (q: Quality) => {
      profile = QUALITY[q];
      world.setQuality(profile);
      crowd.setQuality(profile);
      dj.setQuality(profile);
      resize();
      if (snapshot) applySnapshot(snapshot);
    },
  };
}

void boot().catch((err) => {
  console.error('[rave] boot failed', err);
  showFallback(null);
});
