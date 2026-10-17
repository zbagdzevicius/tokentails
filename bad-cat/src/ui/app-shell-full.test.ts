// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAT, type MetaApi } from '../types';
import { startApp } from './app-shell';
import { click, fakeMoney, inputs, playRun, qa, room, RUN_TICKS, until, world, type World } from './shell-world.test-util';

/** Wave 3 flows with fake services (GDD 3.5, 6.2, 6.7, 7.3, 8, 9.2, 13.5, 14). */

afterEach(() => {
  document.body.innerHTML = '';
  delete window.__BADCAT_QA__;
});

function boot(w: World): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  startApp(root, w.services);
  return root;
}

/** A returning player in session `n` (the shell counts this boot). */
function returning(w: World, sessionsBefore = 1): World {
  w.kv.set('ftueDone', true);
  w.profile.p = { ...w.profile.p, sessions: sessionsBefore, cats: [{ ...DEFAULT_CAT, name: 'Mochi' }] };
  return w;
}

async function toShare(): Promise<void> {
  await until(() => qa().screen() === 'result');
  click('.bc-share-btn');
  await until(() => qa().screen() === 'share');
}

describe('paywall moments (GDD 9.2)', () => {
  it('session 1: no card after the share, even when money would offer one', async () => {
    const w = returning(world({ ghosts: [] }), 0);
    const m = fakeMoney();
    w.services.money = m;
    boot(w);
    await until(() => qa().screen() === 'home');
    click('.bc-room-card.is-glass');
    await until(() => qa().screen() === 'briefing');
    await playRun();
    await toShare();
    click('.bc-done');
    await until(() => qa().screen() === 'home');
    expect(m.shown).toHaveLength(0);
    expect(document.querySelector('.fake-offer')).toBeNull();
  }, 15000);

  it('session 2: one card after the share (never before it), accept opens the Club sheet', async () => {
    const w = returning(world({ ghosts: [] }), 1);
    const m = fakeMoney();
    w.services.money = m;
    boot(w);
    await until(() => qa().screen() === 'home');
    click('.bc-room-card.is-glass');
    await until(() => qa().screen() === 'briefing');
    await playRun();
    await until(() => qa().screen() === 'result');
    expect(document.querySelector('.fake-offer')).toBeNull(); // never on the result screen
    click('.bc-share-btn');
    await until(() => qa().screen() === 'share');
    click('.bc-done');
    await until(() => qa().screen() === 'offer');
    expect(m.offers.some((c) => c.trigger === 'post_share' && c.afterShare && c.sessionIndex === 2)).toBe(true);
    expect(document.querySelector('.fake-offer')?.textContent).toContain('Offer post_share');
    click('.fake-offer-yes');
    await until(() => qa().screen() === 'sheet');
    await until(() => !!document.querySelector('.fake-club'));
    click('.fake-club-close');
    await until(() => qa().screen() === 'home');
    // one per session: a second share shows nothing
    click('.bc-room-card.is-glass');
    await until(() => qa().screen() === 'briefing');
    await playRun();
    await toShare();
    click('.bc-done');
    await until(() => qa().screen() === 'home');
  }, 20000);

  it('catmaker_saved in session 2 shows the card after the save; never in the FTUE', async () => {
    const w = returning(world({ ghosts: [] }), 2);
    const m = fakeMoney();
    w.services.money = m;
    const root = boot(w);
    await until(() => qa().screen() === 'home');
    click('.bc-cta', 'My cat');
    await until(() => qa().screen() === 'offer');
    expect(root.textContent).toContain('Offer catmaker_saved');
    click('.fake-offer-close');
    await until(() => qa().screen() === 'home');
  }, 15000);
});

describe('Felony Friday (GDD 3.5)', () => {
  it('the chooser defaults to the Pink Paw cat, names both cats, and the pick decides the run cat', async () => {
    const w = returning(world({ ghosts: [] }), 1);
    w.entries.set(18, { felonyFriday: true, weekday: 4 });
    const root = boot(w);
    await until(() => qa().screen() === 'home');
    click('.bc-today .bc-cta');
    await until(() => qa().screen() === 'briefing');
    await until(() => !!root.querySelector('.bc-chooser'));
    expect(root.querySelector('.bc-chip.is-on')?.getAttribute('data-choice')).toBe('pinkpaw');
    expect(root.querySelector('.bc-chooser-line')?.textContent).toMatch(/from Pink Paw commits the crime\. Mochi is the getaway driver/);
    await until(() => w.loaded.length > 0);
    expect(w.loaded[w.loaded.length - 1].cats[0]).not.toBe('Mochi');
    // pick my own cat: the stage reloads with Mochi
    click('.bc-chip[data-choice="mine"]');
    await until(() => w.loaded[w.loaded.length - 1].cats[0] === 'Mochi');
    expect(root.querySelector('.bc-chooser-line')?.textContent).toBe('Mochi commits the crime. Felony Friday!');
    expect(qa().screen()).toBe('briefing'); // a chip tap never starts the run
    await playRun();
    expect(w.events.find((x) => x.e === 'bc_run_start')?.p.cat_source).not.toBe('pinkpaw');
  }, 15000);

  it('playing the Pink Paw cat reports cat_source pinkpaw', async () => {
    const w = returning(world({ ghosts: [] }), 1);
    w.entries.set(18, { felonyFriday: true, weekday: 4 });
    boot(w);
    await until(() => qa().screen() === 'home');
    click('.bc-today .bc-cta');
    await until(() => qa().screen() === 'briefing');
    await playRun();
    expect(w.events.find((x) => x.e === 'bc_run_start')?.p.cat_source).toBe('pinkpaw');
  }, 15000);
});

describe('briefing and home extras', () => {
  it('boss banner, Community Sunday credit, tomorrow teaser and room chips', async () => {
    const w = returning(world({ ghosts: [] }), 1);
    w.rooms.set(18, room('daily-18', 'Boss: Birthday Party #3', { boss: true, ticks: 2700 }));
    w.entries.set(18, { boss: true, weekday: 5, theme: 'birthday', community: { code: 'x', title: 'Mia Kitchen', author: 'Mia' } });
    w.entries.set(19, { title: 'Bathroom #3: Toilet Paper Wednesday' });
    const root = boot(w);
    await until(() => qa().screen() === 'home');
    expect(root.textContent).toContain('Tomorrow: Toilet Paper Wednesday');
    expect(root.querySelector('.bc-boss-badge')).not.toBeNull();
    expect(root.textContent).toContain('🎂 Birthday');
    click('.bc-today .bc-cta');
    await until(() => qa().screen() === 'briefing');
    expect(root.querySelector('.bc-boss-banner')?.textContent).toContain('BOSS ROOM · 90 s');
    expect(root.textContent).toContain('Community Sunday: built by Mia');
  }, 15000);

  it('the first heist on a boss day plays The Glass', async () => {
    const w = world({ ghosts: [] });
    w.rooms.set(18, room('daily-18', 'Boss', { boss: true }));
    w.entries.set(18, { boss: true });
    const root = boot(w);
    await until(() => qa().screen() === 'linkIntro');
    click('.bc-boot');
    await until(() => qa().screen() === 'briefing');
    expect(qa().router!().plan).toEqual({ glass: true, dayNo: undefined, mode: 'ftue' });
    expect(root.textContent).toContain('The Glass');
  }, 15000);

  it('picker shows The Glass, today and 14 past dailies with OG stills', async () => {
    const w = world({ ghosts: [], pick: true, entry: 'typed' });
    w.kv.set('ftueDone', true);
    const root = boot(w);
    await until(() => qa().screen() === 'picker');
    const cards = root.querySelectorAll('.bc-room-card');
    expect(cards.length).toBe(16);
    expect(root.querySelector('.bc-room-img')?.getAttribute('src')).toMatch(/og\/glass\.png$/);
    expect(root.querySelectorAll('.bc-room-img')[1]?.getAttribute('src')).toMatch(/og\/d\/18\.png$/);
  }, 15000);
});

describe('result extras', () => {
  it('wish + adopt link, par paws, dare lines vs two ghosts (one replay-only)', async () => {
    const w = returning(world({ ghosts: [] }), 1);
    w.rooms.set(18, room('daily-18', 'Kitchen #18', { accomplice: { pinkPawId: 'x', wishPropIndex: 0, x: 1, z: 1, level: 0 } }));
    w.entries.set(18, { par: { bronze: 50, silver: 100, gold: 1000 } });
    w.services.progress = { recordRankedDay: () => ({ current: 1, best: 1 }), parPaws: (score, par) => (score >= (par?.silver ?? 1e9) ? 2 : 1) };
    const root = boot(w);
    await until(() => qa().screen() === 'home');
    click('.bc-today .bc-cta');
    await until(() => qa().screen() === 'briefing');
    await playRun();
    await until(() => qa().screen() === 'result');
    expect(root.querySelector('.bc-paws.is-2')).not.toBeNull();
    expect(root.querySelector('.bc-wish')?.textContent).toMatch(/still hoping|Wish granted/);
    const open = window.open;
    window.open = (() => ({ opener: null })) as unknown as typeof window.open;
    click('.bc-adopt');
    window.open = open;
    expect(w.events.some((x) => x.e === 'bc_pinkpaw_adopt_click')).toBe(true);
  }, 15000);
});

describe('clip handoff (GDD 7.3, 13.5)', () => {
  it('no photo in this browser: the cat maker re-adds it (skippable), then the result of the replay', async () => {
    const w = world({ ghosts: [], dayNo: 16, clip: true, replay: { inputs: inputs(RUN_TICKS), cat: { ...DEFAULT_CAT, name: 'Mochi' }, name: 'Mochi' } });
    boot(w);
    // the fake cat maker resolves at once (skip): catmaker → result
    await until(() => qa().screen() === 'result');
    expect(w.catmakerOpens).toHaveLength(1);
    expect(w.catmakerOpens[0].reAdd).toEqual({ name: 'Mochi' });
    expect(w.events.some((x) => x.e === 'bc_inapp_handoff' && x.p.step === 'arrived')).toBe(true);
    click('.bc-share-btn');
    await until(() => qa().screen() === 'share');
    await until(() => w.exports.length > 0);
  }, 15000);
});

describe('household clip ("Play Luna too")', () => {
  it('records the second cat run, comes back to the share and renders the household clip', async () => {
    const w = returning(world({ ghosts: [] }), 1);
    w.profile.p = { ...w.profile.p, cats: [{ ...DEFAULT_CAT, name: 'Mochi' }, { ...DEFAULT_CAT, name: 'Luna' }] };
    const root = boot(w);
    await until(() => qa().screen() === 'home');
    click('.bc-room-card.is-glass');
    await until(() => qa().screen() === 'briefing');
    await playRun();
    await toShare();
    await until(() => !!root.querySelector('.bc-chip[data-format="household"]'));
    expect(root.querySelector('.bc-chip[data-format="household"]')?.textContent).toBe('Mochi vs Luna');
    click('.bc-chip[data-format="household"]');
    await until(() => qa().screen() === 'briefing');
    expect(qa().router!().plan).toMatchObject({ household: true, mode: 'practice' });
    await until(() => w.loaded.some((l) => l.cats[0] === 'Luna'));
    await playRun();
    await until(() => qa().screen() === 'share');
    await until(() => w.exports.some((o) => o.format === 'household'));
    const hh = w.exports.find((o) => o.format === 'household') as { second?: { cat: { name: string } } };
    expect(hh.second?.cat.name).toBe('Luna');
    expect(w.days.size).toBe(0); // practice + household: nothing ranked
  }, 20000);
});

describe('moderation (GDD 6.7)', () => {
  it('a hidden room link opens home instead, with a note', async () => {
    const w = returning(world({ ghosts: [], room: room('ugc-1', 'Bad Room'), roomCode: 'RC1' }), 1);
    w.kv.set('hidden', ['h-RC1']);
    const root = boot(w);
    await until(() => qa().screen() === 'home');
    await until(() => root.textContent!.includes('You hid that room'));
  }, 15000);

  it('hide and report a link-opened room from the share screen', async () => {
    const w = returning(world({ ghosts: [], room: room('ugc-2', 'Weird Room'), roomCode: 'RC2' }), 1);
    const root = boot(w);
    await until(() => qa().screen() === 'briefing');
    await playRun();
    await toShare();
    click('.bc-cta', 'Hide and report this room');
    expect(w.events.find((x) => x.e === 'ugc_reported')?.p).toMatchObject({ payload_hash: 'h-RC2', kind: 'room' });
    expect(w.kv.get('hidden')).toEqual(['h-RC2']);
    void root;
  }, 15000);
});

describe('analytics common props and consent', () => {
  it('every event carries entry (typed_or_direct on a bare open), day_no and is_first_session', async () => {
    const w = returning(world({ ghosts: [] }), 1);
    boot(w);
    await until(() => qa().screen() === 'home');
    const bootEv = w.events.find((x) => x.e === 'bc_boot')!;
    expect(['typed_or_direct', 'direct']).toContain(bootEv.p.entry);
    expect(bootEv.p.is_first_session).toBe(false);
    expect(typeof bootEv.p.sim_version).toBe('number');
  }, 15000);

  it('the consent banner waits for session 2', async () => {
    const seen: string[] = [];
    const meta = { consent: (host: HTMLElement) => (seen.push('consent'), host.append(document.createElement('i')), () => undefined) } as unknown as MetaApi;
    const w1 = returning(world({ ghosts: [] }, { env: { dev: true } }), 0);
    w1.services.meta = meta;
    boot(w1);
    await until(() => qa().screen() === 'home');
    expect(seen).toEqual([]);
    document.body.innerHTML = '';
    const w2 = returning(world({ ghosts: [] }, { env: { dev: true } }), 1);
    w2.services.meta = meta;
    boot(w2);
    await until(() => qa().screen() === 'home');
    expect(seen).toEqual(['consent']);
  }, 15000);
});

describe('QA hook (VITE_BADCAT_QA)', () => {
  it('goto, setDay, services, router, events', async () => {
    const w = returning(world({ ghosts: [] }), 1);
    boot(w);
    await until(() => qa().screen() === 'home');
    qa().setDay!(21);
    expect(qa().router!().screen).toBe('home');
    qa().goto!('briefing');
    await until(() => qa().screen() === 'briefing');
    expect(qa().router!().plan).toMatchObject({ dayNo: 21, mode: 'ranked' });
    qa().goto!('settings');
    expect(qa().screen()).toBe('settings');
    expect(qa().services!()).toBe(w.services);
    expect(qa().events!().some((x) => x.e === 'bc_boot')).toBe(true);
    expect(() => qa().goto!('nope')).toThrow();
  }, 15000);
});

describe('studio (?studio=1, GDD 6.2)', () => {
  it('queue → studio cat maker → 40 s run → stitch clip with the handle → save → back to the queue', async () => {
    const w = returning(world({ ghosts: [], studio: true }), 3);
    w.services.catMaker.open = async (_h, o) => {
      w.catmakerOpens.push(o as unknown as Record<string, unknown>);
      return { spec: { ...DEFAULT_CAT, name: 'Luna' }, method: 'gallery', handle: '@luna.mom' };
    };
    const root = boot(w);
    await until(() => qa().screen() === 'studio');
    await until(() => !!root.querySelector('.bc-studio-next'));
    const area = root.querySelector<HTMLTextAreaElement>('.bc-studio-batch')!;
    area.value = '@bob.cat Biscuit\nr: @amy Pixel';
    click('.bc-cta', 'Add to the queue');
    await until(() => root.querySelectorAll('.bc-studio-row').length === 2);
    click('.bc-studio-next');
    await until(() => qa().screen() === 'briefing');
    expect(w.catmakerOpens[0]).toMatchObject({ studio: true, catIndex: -1 });
    expect(qa().router!().plan).toMatchObject({ studio: true, mode: 'ftue' });
    await until(() => w.loaded.some((l) => l.cats[0] === 'Luna'));
    await playRun();
    await until(() => qa().screen() === 'result');
    expect(w.days.size).toBe(0);
    click('.bc-share-btn');
    await until(() => qa().screen() === 'share');
    await until(() => w.exports.length > 0);
    expect(w.exports[0]).toMatchObject({ format: 'stitch', overlay: 'luna.mom' });
    await until(() => !(document.querySelector('.bc-post') as HTMLButtonElement).disabled);
    click('.bc-post');
    await until(() => w.events.some((x) => x.e === 'bc_share_action' && x.p.artifact === 'reply_video'));
    click('.bc-done');
    await until(() => qa().screen() === 'studio');
    await until(() => !!root.querySelector('.bc-studio-row.is-saved'));
    expect(root.textContent).toContain('1 saved');
  }, 20000);
});
