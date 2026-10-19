// @vitest-environment happy-dom
/**
 * Token Tails integration, game side (integration plan §3.7): the bridge parsers against the shared fixture, the
 * account progress merge, the frame rules (pack cats excluded), the app-build roster filter and the mounted card UI
 * (sign-in, Meet card gating, open-cat, the save chip).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { GAME_TYPES, HOST_TYPES, LEVEL_CATNIP, PROGRESS_LEVELS, PROGRESS_MAX, cleanArt, type HostMessage, type Progress } from '../../src/embed/bridge';
import { chipState, installIntegration, isNewFastest, makeMatchId } from '../../src/embed/integrate';
import { sanitizeHostMessage } from '../../src/embed/messages';
import { freshProfile, loadProfile, mergeServerProgress, noteChampionMatch, resetProfileCache, saveProfile, BISCUIT_UNLOCK, type Profile } from '../../src/meta/profile';
import { parseRoster, rosterCosmetics, setAppBuild } from '../../src/meta/roster';
import { Entitlements } from '../../src/money/entitlements';
import { bestFrame } from '../../src/render/cosmetics';
import { PAWLEGENDS_LEVEL_CAPS, PAWLEGENDS_LEVELS, PAWLEGENDS_MAX_TICKS } from '../../../shared/caps';

type Msg = Record<string, unknown>;
interface Case {
  valid: Msg;
  invalid: Msg;
  sanitize?: { input: Msg; expected: Msg }[];
}
const FIX = JSON.parse(readFileSync(resolve(__dirname, '../../../shared/pawlegends-bridge.fixtures.json'), 'utf8')) as {
  hostToGame: Record<string, Case>;
  gameToHost: Record<string, Case>;
};

const CAT_A = '65a1b2c3d4e5f6a7b8c9d0e1';
const CAT_B = '65a1b2c3d4e5f6a7b8c9d0e2';

describe('bridge protocol: shared fixture', () => {
  it('knows every host type and sends every game type but the retired purchase-intent', () => {
    expect([...HOST_TYPES].sort()).toEqual(Object.keys(FIX.hostToGame).sort());
    expect([...GAME_TYPES].sort()).toEqual(Object.keys(FIX.gameToHost).filter((t) => t !== 'purchase-intent').sort());
    expect(GAME_TYPES as readonly string[]).not.toContain('purchase-intent');
  });
  for (const [type, c] of Object.entries(FIX.hostToGame)) {
    it(`${type}: valid parses to itself, invalid is ignored, sanitize cases match`, () => {
      expect(sanitizeHostMessage(c.valid)).toEqual(c.valid);
      expect(sanitizeHostMessage(c.invalid)).toBeNull();
      for (const s of c.sanitize ?? []) expect(sanitizeHostMessage(s.input)).toEqual(s.expected);
    });
  }
  it('mirrors shared/caps.ts (levels, first-win catnip, max ticks)', () => {
    expect([...PROGRESS_LEVELS]).toEqual(PAWLEGENDS_LEVELS);
    expect(PROGRESS_LEVELS.map((l) => LEVEL_CATNIP[l])).toEqual(PAWLEGENDS_LEVEL_CAPS);
    expect(PROGRESS_MAX).toBe(PAWLEGENDS_MAX_TICKS);
  });
  it('allows cat art from the Token Tails bucket only', () => {
    expect(cleanArt('https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/cats/a.png')).toBeTruthy();
    expect(cleanArt('https://fra1.cdn.digitaloceanspaces.com/tokentails-nfts/a.png')).toBeTruthy();
    for (const bad of [
      'http://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png',
      'https://fra1.cdn.digitaloceanspaces.com/other-bucket/a.png',
      'https://fra1.cdn.digitaloceanspaces.com/tokentails-nfts/../other/a.png',
      'https://evil.example/tokentails-nfts/a.png',
      'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com.evil.example/a.png',
      'https://u:p@fra1.cdn.digitaloceanspaces.com/tokentails-nfts/a.png',
      'javascript:alert(1)',
      42,
    ])
      expect(cleanArt(bad), String(bad)).toBeUndefined();
  });
  it('makes match ids the host accepts', () => {
    for (let i = 0; i < 50; i++) expect(makeMatchId()).toMatch(/^[a-z0-9]{1,16}$/);
  });
});

const progress = (o: Partial<Record<keyof Progress, Partial<Record<'easy' | 'normal' | 'rookie' | 'hard', number>>>> = {}): Progress => ({
  catnip: { easy: 0, normal: 0, rookie: 0, hard: 0, ...o.catnip },
  matches: { easy: 0, normal: 0, rookie: 0, hard: 0, ...o.matches },
  fastestWin: { easy: 0, normal: 0, rookie: 0, hard: 0, ...o.fastestWin },
});

describe('mergeServerProgress', () => {
  it('takes the better value per level and unlocks the first-win coat from the account', () => {
    const local = { ...freshProfile(), matches: 2, fastest: { easy: 300 } };
    const p = mergeServerProgress(local, progress({ catnip: { easy: 20 }, matches: { easy: 4, normal: 3 }, fastestWin: { easy: 8123, normal: 6000 } }));
    expect(p.firstWinDone).toBe(true);
    expect(p.unlocks).toContain(BISCUIT_UNLOCK);
    expect(p.matches).toBe(7);
    expect(p.fastest).toEqual({ easy: 271, normal: 200 }); // ceil(8123/30), 6000/30
    expect(local.firstWinDone).toBe(false); // pure
  });
  it('never lowers anything local', () => {
    const local = { ...freshProfile(), matches: 12, wins: 4, firstWinDone: true, fastest: { easy: 100 }, unlocks: [BISCUIT_UNLOCK] };
    const p = mergeServerProgress(local, progress({ matches: { easy: 1 }, fastestWin: { easy: 9000 } }));
    expect(p).toMatchObject({ matches: 12, wins: 4, firstWinDone: true, fastest: { easy: 100 } });
    expect(mergeServerProgress(local, null)).toBe(local);
  });
});

describe('roster frames and app builds', () => {
  const cat = (id: string, o: Msg = {}) => ({ id, name: id, type: 'FIRE', tier: 'COMMON', isStarter: false, origin: 'adopt', catalogId: `65a1b2c3d4e5f6a7b8c9d0${id.padStart(2, '0')}`, ...o });
  beforeEach(() => setAppBuild(false));
  it('no tier frame from a pack cat (decision #19)', () => {
    const r = rosterCosmetics(parseRoster([cat('1', { tier: 'LEGENDARY', origin: 'pack' }), cat('2', { tier: 'EPIC', origin: 'pack' })]));
    expect(r.frames).toEqual([]);
    expect(r.named).toBe(0);
    expect(bestFrame({ items: new Set(), unlocks: new Set(), roster: r })).toBeNull();
  });
  it('collection frames at 1, 3 and 5 distinct named cats (starters and duplicates do not count)', () => {
    const frames = (n: number) => rosterCosmetics(parseRoster(Array.from({ length: n }, (_, i) => cat(String(i + 10))))).frames;
    expect(frames(0)).toEqual([]);
    expect(frames(1)).toEqual(['frame.buddy']);
    expect(frames(3)).toEqual(['frame.buddy', 'frame.crew']);
    expect(frames(5)).toEqual(['frame.buddy', 'frame.crew', 'frame.clowder']);
    const twins = rosterCosmetics(parseRoster([cat('20'), cat('21', { catalogId: cat('20').catalogId }), cat('22', { isStarter: true, origin: 'starter' })]));
    expect(twins.named).toBe(1);
    const r = rosterCosmetics(parseRoster([...Array.from({ length: 5 }, (_, i) => cat(String(i + 30))), cat('40', { tier: 'EPIC', origin: 'redeem' })]));
    expect(bestFrame({ items: new Set(), unlocks: new Set(), roster: r })).toBe('frame.clowder');
  });
  it('app builds keep starter and redeemed cats only', () => {
    const raw = [cat('1', { origin: 'starter', isStarter: true }), cat('2', { origin: 'redeem' }), cat('3', { origin: 'adopt' }), cat('4', { origin: 'pack' }), cat('5', { origin: undefined })];
    expect(parseRoster(raw, { isApp: true }).map((c) => c.id)).toEqual(['1', '2']);
    expect(parseRoster(raw).map((c) => c.id)).toEqual(['1', '2', '3', '4', '5']);
    setAppBuild(true);
    expect(parseRoster(raw).map((c) => c.id)).toEqual(['1', '2']);
  });
});

describe('save chip rules', () => {
  const saved = (o: Msg = {}) => ({ matchId: 'a1', status: 'saved' as const, catnipPaid: 20, catnipTotal: 60, fastestWin: 8000, ...o });
  it('chip state', () => {
    expect(chipState(false, null, false)).toBe('local');
    expect(chipState(true, null, false)).toBe('waiting');
    expect(chipState(true, null, true)).toBeNull();
    expect(chipState(true, saved(), false)).toBe('saved');
  });
  it('new fastest: exact with match info, compared without', () => {
    expect(isNewFastest(saved(), progress({ fastestWin: { easy: 9000 } }), { ticks: 8000, difficulty: 'easy', won: true })).toBe(true);
    expect(isNewFastest(saved(), progress({ fastestWin: { easy: 7000 } }), { ticks: 9000, difficulty: 'easy', won: true })).toBe(false);
    expect(isNewFastest(saved(), progress(), null)).toBe(true);
    expect(isNewFastest(saved(), progress({ fastestWin: { easy: 8000 } }), null)).toBe(false);
    expect(isNewFastest(saved({ status: 'queued' }), progress(), null)).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------- mounted UI

function harness(opts: { sessions?: number; matches?: number; keep?: Partial<Profile> } = {}) {
  resetProfileCache();
  setAppBuild(false);
  const p = { ...freshProfile(), ...opts.keep, sessions: opts.sessions ?? 2, matches: opts.matches ?? 1 };
  saveProfile(p);
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const posted: { type: string; payload: Msg }[] = [];
  const handlers: ((m: HostMessage) => void)[] = [];
  const ent = new Entitlements();
  const tracked: string[] = [];
  const bridge = {
    active: true,
    post: (type: string, payload: Msg = {}) => (posted.push({ type, payload }), true),
    on: (h: (m: HostMessage) => void) => void handlers.push(h),
  };
  let metaChanges = 0;
  const integ = installIntegration(bridge as never, { ent, profile: loadProfile, analytics: { track: (e) => void tracked.push(e) }, onRosterChange: () => metaChanges++, root });
  const emit = (m: Msg): void => {
    const msg = { ns: 'tt-pawlegends', v: 1, ...m } as unknown as HostMessage;
    ent.apply(msg); // the app's last branch
    handlers.forEach((h) => h(msg));
  };
  const screen = (kind: 'title' | 'pick' | 'results', won = true): HTMLElement => {
    root.querySelector('.pl-screen')?.remove();
    const el = document.createElement('div');
    el.className = `pl-screen pl-${kind}${kind === 'results' ? (won ? ' won' : ' lost') : ''}`;
    el.innerHTML = kind === 'title' ? '<div class="pl-title-col"></div>' : kind === 'pick' ? '<div class="pl-pick-col"><button data-a="start">Play</button></div>' : '<div class="pl-results-col"><div class="stats"></div><div class="actions"></div></div>';
    root.appendChild(el);
    integ.refresh();
    return el;
  };
  emit({ type: 'hello' });
  emit({ type: 'app', isApp: false, store: true, notify: true });
  return { root, posted, emit, screen, integ, tracked, metaChanges: () => metaChanges, ent };
}

// round 1: only cats with art get a Meet card (the bucket host is the one the bridge accepts)
const ART = (n: string): string => `https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/tokentails-nfts/test/${n}.png`;
const featured = { type: 'featured', cats: [{ catalogId: CAT_A, name: 'Pumpkin', type: 'GRASS', art: ART('pumpkin') }, { catalogId: CAT_B, name: 'Nova', type: 'STELLAR', art: ART('nova') }] };

describe('mounted cards', () => {
  it('signed out: Save your wins asks the host to sign in; the session progress merges in', () => {
    const h = harness();
    h.emit({ type: 'session', signedIn: false });
    const t = h.screen('title');
    const btn = t.querySelector<HTMLElement>('[data-a="save-wins"]');
    expect(btn).toBeTruthy();
    btn!.click();
    expect(h.posted).toContainEqual({ type: 'request-sign-in', payload: { reason: 'save-progress' } });
    h.emit({ type: 'session', signedIn: true, progress: progress({ catnip: { easy: 20 }, matches: { easy: 3 }, fastestWin: { easy: 8123 } }) });
    expect(h.metaChanges()).toBe(1);
    expect(loadProfile().unlocks).toContain(BISCUIT_UNLOCK);
    const t2 = h.screen('title');
    expect(t2.querySelector('[data-a="save-wins"]')).toBeNull();
    expect(t2.querySelector('.plc-level[data-level="easy"]')?.textContent).toContain('20 catnip');
    expect(t2.querySelector('.plc-level[data-level="normal"]')?.textContent).toContain('+40 catnip');
  });

  it('Meet card: session 2, lobby, once; offer-seen once, then open-cat', () => {
    const h = harness();
    h.emit(featured);
    h.emit({ type: 'offer', offer: { kind: 'meet', catalogId: CAT_A } });
    const t = h.screen('title');
    const card = t.querySelector<HTMLElement>('.plc-meet');
    expect(card?.dataset.catalog).toBe(CAT_A);
    expect(card?.textContent).not.toMatch(/\$|€|price|shelter|donat|pack/i);
    h.integ.refresh(); // a redraw keeps the same card and does not re-send offer-seen
    expect(h.posted.filter((m) => m.type === 'offer-seen')).toEqual([{ type: 'offer-seen', payload: { kind: 'meet', catalogId: CAT_A } }]);
    t.querySelector<HTMLElement>('[data-a="meet"]')!.click();
    expect(h.posted).toContainEqual({ type: 'open-cat', payload: { catalogId: CAT_A } });
    // leaving the lobby ends the card; one per session, so the results screen shows none
    h.screen('pick');
    const r = h.screen('results', true);
    expect(r.querySelector('.plc-meet')).toBeNull();
    expect(h.posted.filter((m) => m.type === 'offer-seen')).toHaveLength(1);
  });

  it('no Meet card in session 1, in app builds, or for a cat the host did not feature', () => {
    const s1 = harness({ sessions: 1 });
    s1.emit(featured);
    s1.emit({ type: 'offer', offer: { kind: 'meet', catalogId: CAT_A } });
    expect(s1.screen('title').querySelector('.plc-meet')).toBeNull();

    const app = harness();
    app.emit({ type: 'app', isApp: true, store: true });
    app.emit(featured);
    app.emit({ type: 'offer', offer: { kind: 'meet', catalogId: CAT_A } });
    expect(app.screen('title').querySelector('.plc-meet')).toBeNull();
    expect(app.screen('pick').querySelector('.plc-card.guest')).toBeNull();
    expect(app.posted.some((m) => m.type === 'offer-seen' || m.type === 'open-cat')).toBe(false);

    const other = harness();
    other.emit({ type: 'featured', cats: [{ catalogId: CAT_B, name: 'Nova', type: 'STELLAR' }] });
    other.emit({ type: 'offer', offer: { kind: 'meet', catalogId: CAT_A } });
    expect(other.screen('title').querySelector('.plc-meet')).toBeNull();
  });

  it('no Meet card on the results after a Rookie match (fun plan F4); an Easy win may show it', () => {
    const rookie = harness();
    rookie.emit(featured);
    rookie.emit({ type: 'offer', offer: { kind: 'meet', catalogId: CAT_A } });
    rookie.integ.nextMatchId({ ticks: 9000, difficulty: 'rookie', won: true });
    expect(rookie.screen('results', true).querySelector('.plc-meet')).toBeNull();
    expect(rookie.posted.some((m) => m.type === 'offer-seen')).toBe(false);

    const easy = harness();
    easy.emit(featured);
    easy.emit({ type: 'offer', offer: { kind: 'meet', catalogId: CAT_A } });
    easy.integ.nextMatchId({ ticks: 9000, difficulty: 'easy', won: true });
    expect(easy.screen('results', true).querySelector<HTMLElement>('.plc-meet')?.dataset.catalog).toBe(CAT_A);
  });

  it('pick shows your squad with art; a purchase result celebrates the new cat', () => {
    const h = harness();
    h.emit(featured);
    const guestPick = h.screen('pick');
    expect(guestPick.querySelector('.plc-card.guest')?.textContent).toContain('Pumpkin');
    h.emit({ type: 'purchase-result', catalogId: CAT_A, ok: true });
    h.emit({
      type: 'roster',
      cats: [{ id: 'c1', name: 'Pumpkin', type: 'GRASS', tier: 'COMMON', isStarter: false, origin: 'adopt', catalogId: CAT_A, art: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png' }],
    });
    const pick = h.screen('pick');
    const card = pick.querySelector<HTMLElement>('.plc-card');
    expect(card?.textContent).toContain('Pumpkin');
    expect(card?.querySelector('img')?.getAttribute('src')).toBe('https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png');
    expect(pick.querySelector('.plc-card.guest')).toBeNull();
    // pick → title: the joined line has gone with the screen change (it shows on the title right after the purchase)
    const h2 = harness();
    h2.emit(featured);
    h2.screen('title');
    h2.emit({ type: 'purchase-result', catalogId: CAT_B, ok: true });
    expect(h2.root.querySelector('.plc-joined')?.textContent).toContain('Nova');
  });

  it('results: the save chip follows the match id, counts up the catnip, and offers sign-in when queued', () => {
    const h = harness();
    h.emit({ type: 'session', signedIn: true, progress: progress() });
    const id = h.integ.nextMatchId();
    const r = h.screen('results');
    expect(r.querySelector('[data-save]')?.getAttribute('data-save')).toBe('waiting');
    h.emit({ type: 'save-result', matchId: 'zzzz', status: 'saved', catnipPaid: 20, catnipTotal: 20, fastestWin: 8000 }); // another match
    expect(r.querySelector('[data-save]')?.getAttribute('data-save')).toBe('waiting');
    h.emit({ type: 'save-result', matchId: id, status: 'saved', catnipPaid: 20, catnipTotal: 20, fastestWin: 8000 });
    expect(r.querySelector('[data-save]')?.getAttribute('data-save')).toBe('saved');
    expect(r.querySelector('.plc-catnip')).toBeTruthy();
    expect(r.querySelector('.plc-stamp')?.textContent).toBe('New fastest!');

    const g = harness();
    g.emit({ type: 'session', signedIn: false });
    const gid = g.integ.nextMatchId();
    const gr = g.screen('results');
    g.emit({ type: 'save-result', matchId: gid, status: 'queued', catnipPaid: 0, catnipTotal: null, fastestWin: null });
    expect(gr.querySelector('[data-save]')?.getAttribute('data-save')).toBe('queued');
    gr.querySelector<HTMLElement>('[data-a="save-wins"]')!.click();
    expect(g.posted).toContainEqual({ type: 'request-sign-in', payload: { reason: 'claim-rewards' } });
  });

  it('game messages match the shared fixture shapes', () => {
    for (const t of ['request-sign-in', 'open-cat', 'offer-seen'] as const) {
      const keys = Object.keys(FIX.gameToHost[t].valid).filter((k) => !['ns', 'v', 'type'].includes(k)).sort();
      const h = harness();
      h.emit(featured);
      h.emit({ type: 'offer', offer: { kind: 'meet', catalogId: CAT_A } });
      h.emit({ type: 'session', signedIn: false });
      const tEl = h.screen('title');
      tEl.querySelector<HTMLElement>('[data-a="save-wins"]')?.click();
      tEl.querySelector<HTMLElement>('[data-a="meet"]')?.click();
      const sent = h.posted.find((m) => m.type === t);
      expect(sent, t).toBeTruthy();
      expect(Object.keys(sent!.payload).sort()).toEqual(keys);
    }
  });
});

describe('champion Meet card (sim v9)', () => {
  const LAMBO = '6a30473c1d6649b19b03622b';
  const champions = { type: 'champions', cats: [{ catalogId: LAMBO, forSale: true, catImg: ART('lambo') }] };
  const asks = (h: ReturnType<typeof harness>) => h.posted.filter((m) => m.type === 'champion-offer');

  it('the 3rd match in session 1 makes the card due; visit 2 asks again and shows it; once shown it is no longer due', () => {
    const v1 = harness({ sessions: 1 });
    v1.emit(champions);
    for (let i = 0; i < 2; i++) {
      noteChampionMatch('lambo');
      v1.integ.championMatch('lambo');
    }
    expect(asks(v1)).toEqual([]);
    noteChampionMatch('lambo');
    v1.integ.championMatch('lambo');
    expect(asks(v1)).toEqual([{ type: 'champion-offer', payload: { catalogId: LAMBO } }]);
    noteChampionMatch('lambo');
    v1.integ.championMatch('lambo'); // once a page load
    expect(asks(v1)).toHaveLength(1);
    // the server held it back (session 1): the host sends no offer, nothing shows
    expect(v1.screen('title').querySelector('.plc-meet')).toBeNull();

    // visit 2: the champions message re-sends the due card; the host's offer puts it on the lobby
    const v2 = harness({ sessions: 2, keep: { championMatches: loadProfile().championMatches } });
    v2.emit(champions);
    expect(asks(v2)).toEqual([{ type: 'champion-offer', payload: { catalogId: LAMBO } }]);
    v2.emit({ type: 'offer', offer: { kind: 'meet', catalogId: LAMBO } });
    expect(v2.screen('title').querySelector<HTMLElement>('.plc-meet')?.dataset.catalog).toBe(LAMBO);
    expect(loadProfile().championShown).toEqual(['lambo']);

    const v3 = harness({ sessions: 3, keep: { championMatches: loadProfile().championMatches, championShown: ['lambo'] } });
    v3.emit(champions);
    expect(asks(v3)).toEqual([]);
  });

  it('never a champion card before its 3rd match, even when the storefront features that card', () => {
    const h = harness({ keep: { championMatches: { lambo: 2 } } });
    h.emit(champions);
    h.emit({ type: 'featured', cats: [{ catalogId: LAMBO, name: 'Lambo', type: 'STELLAR', art: ART('lambo') }] });
    h.emit({ type: 'offer', offer: { kind: 'meet', catalogId: LAMBO } });
    expect(h.screen('title').querySelector('.plc-meet')).toBeNull();
    expect(h.posted.some((m) => m.type === 'offer-seen' || m.type === 'champion-offer')).toBe(false);
  });
});
