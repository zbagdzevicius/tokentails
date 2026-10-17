// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIM_VERSION, type Profile, type SettingsScreenProps } from '../types';
import { meta, archiveLocked, bragLine, tierState, replayOnly, weeklySentence, parPaws } from './index';
import { sampleCrimes, sampleEntries, sampleFriends, sampleProfile, sampleRecords, sampleRooms, sampleSeason, sampleSummary, sampleWeekly } from './fixtures';

let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  host.remove();
});

const q = <T extends Element = HTMLElement>(sel: string): T => host.querySelector(sel) as T;
const qa = (sel: string): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>(sel));
const byText = (sel: string, text: string): HTMLElement | undefined => qa(sel).find((e) => e.textContent?.includes(text));
const esc = (): void => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('meta api', () => {
  it('exports every MetaApi mount', () => {
    for (const k of ['archive', 'rapSheet', 'season', 'settings', 'friends', 'weekly', 'consent', 'myRooms'] as const) expect(typeof meta[k]).toBe('function');
  });
  it('par paws', () => {
    const par = { bronze: 10, silver: 20, gold: 30 };
    expect([parPaws(0, par), parPaws(10, par), parPaws(25, par), parPaws(31, par), parPaws(50)]).toEqual([0, 1, 2, 3, 0]);
  });
});

describe('archive', () => {
  const base = () => ({
    todayNo: 30,
    entries: sampleEntries(30, 29),
    records: sampleRecords,
    freeDays: 14,
    onPlay: vi.fn(),
    onGlass: vi.fn(),
    onLocked: vi.fn(),
    onBack: vi.fn(),
  });
  it('locks days older than freeDays for free players only', () => {
    expect(archiveLocked(30, 16, 14, false)).toBe(false);
    expect(archiveLocked(30, 15, 14, false)).toBe(true);
    expect(archiveLocked(30, 1, 14, true)).toBe(false);
  });
  it('pins The Glass first, lists newest first, and locks old days', () => {
    const p = { ...base(), club: false };
    const un = meta.archive(host, p);
    const cases = qa('.bmt-case');
    expect(cases[0].classList.contains('bmt-glass')).toBe(true);
    expect(cases[1].dataset.day).toBe('29');
    expect(cases.length).toBe(30);
    cases[0].click();
    expect(p.onGlass).toHaveBeenCalled();
    q<HTMLElement>('[data-day="20"]').click();
    expect(p.onPlay).toHaveBeenCalledWith(20);
    const old = q<HTMLElement>('[data-day="10"]');
    expect(old.classList.contains('is-locked')).toBe(true);
    old.click();
    expect(p.onLocked).toHaveBeenCalledWith(10);
    expect(p.onPlay).toHaveBeenCalledTimes(1);
    expect(qa('.is-locked').length).toBe(15); // days 1..15
    // record: score + stamp + paws
    expect(q('[data-day="29"] .bmt-score')?.textContent).toMatch(/\d/);
    expect(q('[data-day="27"] .bmt-case-rec')?.textContent).toContain('Unsolved');
    // boss pack is a lock row for free players
    const lock = q<HTMLElement>('.bmt-lockrow');
    expect(lock).toBeTruthy();
    lock.click();
    expect(p.onLocked).toHaveBeenCalledTimes(2);
    un();
  });
  it('Club: nothing locked, boss replay pack plays bosses', () => {
    const p = { ...base(), club: true };
    const un = meta.archive(host, p);
    expect(qa('.is-locked').length).toBe(0);
    const bossBtns = qa('.bmt-boss-pack button');
    expect(bossBtns.length).toBeGreaterThan(0);
    bossBtns[0].click();
    expect(p.onPlay).toHaveBeenCalled();
    expect(qa('.bmt-chip-boss').length).toBe(bossBtns.length);
    un();
  });
  it('empty state, Escape = back, unmount removes nodes and listeners', () => {
    const p = { ...base(), entries: [], club: false };
    const un = meta.archive(host, p);
    expect(q('.bmt-empty')?.textContent).toContain('No old case files');
    esc();
    expect(p.onBack).toHaveBeenCalledTimes(1);
    un();
    expect(host.children.length).toBe(0);
    esc();
    expect(p.onBack).toHaveBeenCalledTimes(1);
    un(); // idempotent
  });
});

describe('rap sheet', () => {
  it('brag line', () => {
    expect(bragLine(sampleSummary())).toBe('212 vases, 31 mugs, 14 cakes, framed the Roomba 9x');
  });
  it('renders the grid, gold stamps, filters and share', () => {
    const p = { catName: 'Mochi', summary: sampleSummary(), crimes: sampleCrimes(true), onShareCard: vi.fn(), onBack: vi.fn() };
    const un = meta.rapSheet(host, p);
    expect(q('.bmt-brag')?.textContent).toContain('212 vases');
    expect(q('.bmt-mug-plate')?.textContent).toContain('MOCHI');
    expect(qa('.bmt-tile').length).toBe(p.crimes.length);
    expect(qa('.bmt-tile.is-gold').length).toBe(p.crimes.filter((c) => c.gold).length);
    expect(qa('.bmt-tile.is-gold').length).toBeGreaterThan(0);
    q<HTMLElement>('.bmt-tile[data-id="kind-0"]').click();
    expect(q('.bmt-casenote')?.textContent).toContain('first on Nov 17');
    byText('.bmt-tab', 'Specials')!.click();
    expect(qa('.bmt-tile').length).toBe(p.crimes.filter((c) => c.special).length);
    byText('.bmt-tab', 'Stamped')!.click();
    expect(qa('.bmt-tile.is-missing').length).toBe(0);
    q<HTMLElement>('.bmt-share').click();
    expect(p.onShareCard).toHaveBeenCalledTimes(1);
    un();
    expect(host.innerHTML).toBe('');
  });
  it('free players get no gold stamps', () => {
    const un = meta.rapSheet(host, { catName: 'Tofu', summary: sampleSummary(), crimes: sampleCrimes(false), onShareCard: vi.fn(), onBack: vi.fn() });
    expect(qa('.bmt-tile.is-gold').length).toBe(0);
    un();
  });
  it('empty: "No crimes yet. Suspicious." and no share', () => {
    const un = meta.rapSheet(host, { catName: '', summary: sampleSummary(true), crimes: sampleCrimes(false, true), onShareCard: vi.fn(), onBack: vi.fn() });
    expect(host.textContent).toContain('No crimes yet. Suspicious.');
    expect(q('.bmt-share')).toBeNull();
    un();
  });
});

describe('season', () => {
  it('tier states', () => {
    const v = sampleSeason(300 * 20, false, [3]);
    expect(tierState(v.tiers[2], false, v.tier)).toBe('claimed');
    expect(tierState(v.tiers[5], false, v.tier)).toBe('claim');
    expect(tierState(v.tiers[0], false, v.tier)).toBe('title');
    expect(tierState(v.tiers[17], false, v.tier)).toBe('club');
    const c = sampleSeason(300 * 20, true);
    expect(tierState(c.tiers[17], true, c.tier)).toBe('claim');
    expect(tierState(c.tiers[23], true, c.tier)).toBe('locked');
  });
  it('free player: claims, Join Club on Club tiers, XP bar', () => {
    const p = { view: sampleSeason(300 * 7 + 150, false, [3]), club: false, onClaim: vi.fn(), onJoinClub: vi.fn(), onBack: vi.fn() };
    const un = meta.season(host, p);
    expect(qa('.bmt-tier').length).toBe(30);
    expect(q('[data-tier="3"]').classList.contains('is-claimed')).toBe(true);
    const six = q('[data-tier="6"]');
    expect(six.classList.contains('is-claim')).toBe(true);
    six.querySelector<HTMLElement>('.bmt-claim')!.click();
    expect(p.onClaim).toHaveBeenCalledWith(6);
    expect(q('[data-tier="6"]').classList.contains('is-claimed')).toBe(true);
    expect(q('[data-tier="9"]').classList.contains('is-locked')).toBe(true);
    expect(qa('.bmt-joinclub').length).toBe(15);
    q<HTMLElement>('[data-tier="21"] .bmt-joinclub').click();
    q<HTMLElement>('.bmt-joinclub-big').click();
    expect(p.onJoinClub).toHaveBeenCalledTimes(2);
    expect(q('.bmt-xp-fill').style.width).toBe('50%');
    expect(host.textContent).toContain('23 DAYS LEFT');
    un();
  });
  it('Club member claims Club tiers', () => {
    const p = { view: sampleSeason(300 * 30, true), club: true, onClaim: vi.fn(), onJoinClub: vi.fn(), onBack: vi.fn() };
    const un = meta.season(host, p);
    expect(qa('.bmt-joinclub, .bmt-joinclub-big').length).toBe(0);
    q<HTMLElement>('[data-tier="18"] .bmt-claim').click();
    expect(p.onClaim).toHaveBeenCalledWith(18);
    expect(host.textContent).toContain('Maximum menace');
    un();
  });
});

describe('settings', () => {
  const make = (over: Partial<SettingsScreenProps> = {}): SettingsScreenProps & { changes: Profile[] } => {
    const changes: Profile[] = [];
    return {
      changes,
      profile: sampleProfile(),
      persistent: true,
      club: false,
      consent: 'unset',
      hasPhoto: true,
      a2hs: null,
      exportSave: vi.fn(async () => 'SAVE-CODE-123'),
      importSave: vi.fn(async (c: string) => c === 'good'),
      qr: vi.fn(() => '<svg class="fake-qr"></svg>'),
      onIcs: vi.fn(),
      onChange: vi.fn((p: Profile) => void changes.push(p)),
      onConsent: vi.fn(),
      onRestore: vi.fn(),
      onPortal: vi.fn(),
      onManageCats: vi.fn(),
      onCreatorCode: vi.fn(),
      onClub: vi.fn(),
      onBack: vi.fn(),
      ...over,
    };
  };
  const box = (k: string): HTMLInputElement => q<HTMLInputElement>(`input[data-k="${k}"]`);
  const fire = (el: HTMLElement, type: string): void => void el.dispatchEvent(new Event(type, { bubbles: true }));

  it('writes prefs and settings through onChange (cumulative, no mutation of props)', () => {
    const p = make();
    const orig = JSON.stringify(p.profile);
    const un = meta.settings(host, p);
    const master = box('master');
    expect(master.value).toBe('80');
    master.value = '40';
    fire(master, 'change');
    expect(p.changes.at(-1)!.prefs!.master).toBeCloseTo(0.4);
    const rm = box('reduceMotion');
    rm.checked = true;
    fire(rm, 'change');
    const last = p.changes.at(-1)!;
    expect(last.settings.reduceMotion).toBe(true);
    expect(last.prefs!.master).toBeCloseTo(0.4);
    const music = box('clipMusic');
    music.checked = true;
    fire(music, 'change');
    expect(p.changes.at(-1)!.prefs!.clipMusic).toBe(true);
    const t = q<HTMLInputElement>('input[type="time"]');
    expect(t.value).toBe('08:30');
    t.value = '21:15';
    fire(t, 'change');
    expect(p.changes.at(-1)!.prefs!.reminder).toBe('21:15');
    q<HTMLElement>('.bmt-ics').click();
    expect(p.onIcs).toHaveBeenCalledWith('21:15');
    expect(JSON.stringify(p.profile)).toBe(orig);
    un();
  });
  it('gates Club-only rows for free players', () => {
    const p = make();
    const un = meta.settings(host, p);
    expect(q('.bmt-captions')).toBeNull();
    expect(box('streamer')).toBeNull();
    const locks = qa('.bmt-lock');
    expect(locks.length).toBe(2);
    locks[0].click();
    q<HTMLElement>('.bmt-action.bmt-club').click();
    expect(p.onClub).toHaveBeenCalledTimes(2);
    expect(byText('.bmt-action', 'Manage subscription')).toBeUndefined();
    un();
  });
  it('Club: caption style picker and streamer toggle, manage subscription', () => {
    const p = make({ club: true });
    const un = meta.settings(host, p);
    const caps = qa('.bmt-cap');
    expect(caps.length).toBe(5);
    expect(caps[0].getAttribute('aria-checked')).toBe('true');
    caps[3].click();
    expect(p.changes.at(-1)!.prefs!.captionStyle).toBe(3);
    expect(caps[3].getAttribute('aria-checked')).toBe('true');
    const st = box('streamer');
    st.checked = true;
    fire(st, 'change');
    expect(p.changes.at(-1)!.prefs!.streamer).toBe(true);
    byText('.bmt-action', 'Manage subscription')!.click();
    expect(p.onPortal).toHaveBeenCalled();
    expect(qa('.bmt-lock').length).toBe(0);
    un();
  });
  it('photo toggle is disabled without a photo (also when the promise resolves later)', async () => {
    let res!: (v: boolean) => void;
    const p = make({ hasPhoto: new Promise<boolean>((r) => (res = r)) });
    const un = meta.settings(host, p);
    expect(box('showPhotoInClips').disabled).toBe(true);
    res(true);
    await flush();
    expect(box('showPhotoInClips').disabled).toBe(false);
    expect(box('showPhotoInClips').checked).toBe(true);
    un();
    const un2 = meta.settings(host, make({ hasPhoto: false }));
    expect(box('showPhotoInClips').disabled).toBe(true);
    expect(box('showPhotoInClips').checked).toBe(false);
    un2();
  });
  it('consent, account rows, persistent notice', () => {
    const p = make({ consent: 'granted', persistent: false });
    const un = meta.settings(host, p);
    const c = box('consent');
    expect(c.checked).toBe(true);
    c.checked = false;
    fire(c, 'change');
    expect(p.onConsent).toHaveBeenCalledWith(false);
    expect(host.textContent).toContain('This browser only');
    byText('.bmt-action', 'Restore purchases')!.click();
    byText('.bmt-action', 'My cats')!.click();
    byText('.bmt-action', 'Creator code')!.click();
    expect(p.onRestore).toHaveBeenCalled();
    expect(p.onManageCats).toHaveBeenCalled();
    expect(p.onCreatorCode).toHaveBeenCalled();
    un();
    const un2 = meta.settings(host, make());
    expect(host.textContent).not.toContain('This browser only');
    un2();
  });
  it('save code export shows text + QR; import reports success and failure', async () => {
    const p = make();
    const un = meta.settings(host, p);
    q<HTMLElement>('.bmt-export').click();
    await flush();
    expect(p.exportSave).toHaveBeenCalled();
    expect(p.qr).toHaveBeenCalledWith('SAVE-CODE-123');
    expect(q('.bmt-qr .fake-qr')).toBeTruthy();
    expect(q<HTMLTextAreaElement>('.bmt-save-out textarea').value).toBe('SAVE-CODE-123');
    const ta = q<HTMLTextAreaElement>('textarea[aria-label="Save code to import"]');
    ta.value = 'bad';
    q<HTMLElement>('.bmt-import').click();
    await flush();
    expect(q('.bmt-import-msg').classList.contains('is-bad')).toBe(true);
    ta.value = 'good';
    q<HTMLElement>('.bmt-import').click();
    await flush();
    expect(q('.bmt-import-msg').textContent).toContain('Welcome back');
    un();
  });
  it('A2HS: prompt button on Chrome, tip on iOS, hidden when unavailable', async () => {
    const prompt = vi.fn(async () => true);
    const un = meta.settings(host, make({ a2hs: { available: true, ios: false, prompt } }));
    q<HTMLElement>('.bmt-a2hs').click();
    await flush();
    expect(prompt).toHaveBeenCalled();
    expect(host.textContent).toContain('Moved in');
    un();
    const un2 = meta.settings(host, make({ a2hs: { available: true, ios: true, prompt } }));
    expect(q('.bmt-tip')?.textContent).toContain('Add to Home Screen');
    un2();
    const un3 = meta.settings(host, make({ a2hs: { available: false, ios: false, prompt } }));
    expect(q('.bmt-a2hs')).toBeNull();
    expect(q('.bmt-tip')).toBeNull();
    un3();
  });
  it('async results after unmount do not throw or write', async () => {
    let res!: (v: string) => void;
    const p = make({ exportSave: () => new Promise<string>((r) => (res = r)) });
    const un = meta.settings(host, p);
    q<HTMLElement>('.bmt-export').click();
    un();
    res('late');
    await flush();
    expect(host.innerHTML).toBe('');
  });
});

describe('friends', () => {
  it('replay-only marks old sim versions', () => {
    expect(replayOnly({ ...sampleFriends()[0], simVersion: SIM_VERSION })).toBe(false);
    expect(replayOnly({ ...sampleFriends()[0], simVersion: SIM_VERSION - 1 })).toBe(true);
  });
  it('board sorted, you highlighted, race/hide, replay-only marked', () => {
    const p = { roomLabel: 'Kitchen #18', entries: sampleFriends(), myScore: 5000, onRace: vi.fn(), onHide: vi.fn(), onBack: vi.fn() };
    const un = meta.friends(host, p);
    const rows = qa('.bmt-row');
    expect(rows.map((r) => r.querySelector('strong')!.textContent)).toEqual(['Mochi', 'You', 'Biscuit', 'Pickle']);
    expect(rows[1].classList.contains('is-me')).toBe(true);
    expect(rows[3].classList.contains('is-old')).toBe(true);
    expect(rows[3].textContent).toContain('replay only');
    expect(q('.bmt-board-sum').textContent).toContain('Mochi still rules Kitchen #18 by 3,120');
    rows[0].querySelector<HTMLElement>('.bmt-race')!.click();
    expect(p.onRace).toHaveBeenCalledWith(p.entries[0]);
    rows[2].querySelector<HTMLElement>('.bmt-hide')!.click();
    expect(p.onHide).toHaveBeenCalledWith(p.entries[1]);
    expect(qa('.bmt-row').length).toBe(3);
    expect((qa('.bmt-dot')[0] as HTMLElement).style.background).not.toBe('');
    un();
    expect(host.innerHTML).toBe('');
  });
  it('empty state', () => {
    const un = meta.friends(host, { roomLabel: 'Kitchen #18', entries: [], onRace: vi.fn(), onHide: vi.fn(), onBack: vi.fn() });
    expect(host.textContent).toContain('No dares yet.');
    un();
  });
});

describe('weekly', () => {
  it('sentence', () => {
    expect(weeklySentence('Mochi', sampleWeekly(true))).toBe('Mochi’s week: 41 crimes, 9 vases, framed the Roomba 3 times. Most wanted in Kitchen.');
  });
  it('renders the card, animated for Club, share and close', () => {
    const p = { summary: sampleWeekly(true), catName: 'Mochi', animated: true, onShare: vi.fn(), onClose: vi.fn() };
    const un = meta.weekly(host, p);
    expect(q('.bmt-wcard').classList.contains('is-animated')).toBe(true);
    expect(host.textContent).toContain('Most wanted in Kitchen');
    expect(host.textContent).toContain('Sir Pounce');
    expect(host.textContent).toContain('CASE CLOSED');
    q<HTMLElement>('.bmt-share').click();
    expect(p.onShare).toHaveBeenCalled();
    q<HTMLElement>('.bmt-weekly-x').click();
    esc();
    expect(p.onClose).toHaveBeenCalledTimes(2);
    un();
  });
  it('not ready, not animated for free, empty week', () => {
    const un = meta.weekly(host, { summary: sampleWeekly(false), catName: 'Tofu', animated: false, onShare: vi.fn(), onClose: vi.fn() });
    expect(q('.bmt-wcard').classList.contains('is-animated')).toBe(false);
    expect(host.textContent).toContain('SO FAR');
    un();
    const un2 = meta.weekly(host, { summary: sampleWeekly(true, true), catName: 'Tofu', animated: false, onShare: vi.fn(), onClose: vi.fn() });
    expect(host.textContent).toContain('No crimes this week. Suspicious.');
    expect(q('.bmt-share')).toBeNull();
    un2();
  });
});

describe('consent', () => {
  it('Yes and No thanks call onChoice once', () => {
    const onChoice = vi.fn();
    const un = meta.consent(host, { onChoice });
    expect(host.textContent).toContain('Help us count crimes?');
    expect(host.textContent).toContain('Anonymous stats, no ads.');
    q<HTMLElement>('.bmt-consent-yes').click();
    q<HTMLElement>('.bmt-consent-no').click();
    expect(onChoice).toHaveBeenCalledTimes(1);
    expect(onChoice).toHaveBeenCalledWith(true);
    un();
    expect(host.innerHTML).toBe('');
    const onChoice2 = vi.fn();
    const un2 = meta.consent(host, { onChoice: onChoice2 });
    q<HTMLElement>('.bmt-consent-no').click();
    expect(onChoice2).toHaveBeenCalledWith(false);
    esc(); // Escape never decides
    expect(onChoice2).toHaveBeenCalledTimes(1);
    un2();
  });
});

describe('my rooms', () => {
  it('lists rooms newest first with play/share/remix/new', () => {
    const p = { rooms: sampleRooms(), onPlay: vi.fn(), onShare: vi.fn(), onRemix: vi.fn(), onNew: vi.fn(), onBack: vi.fn() };
    const un = meta.myRooms(host, p);
    const rooms = qa('.bmt-room');
    expect(rooms[0].textContent).toContain('Grandma');
    expect(rooms[0].querySelector('.bmt-room-share')).toBeNull(); // not cleared yet
    rooms[0].querySelector<HTMLElement>('.bmt-room-play')!.click();
    expect(p.onPlay).toHaveBeenCalledWith(p.rooms[1]);
    rooms[1].querySelector<HTMLElement>('.bmt-room-share')!.click();
    expect(p.onShare).toHaveBeenCalledWith(p.rooms[0]);
    rooms[1].querySelector<HTMLElement>('.bmt-room-remix')!.click();
    expect(p.onRemix).toHaveBeenCalledWith(p.rooms[0]);
    q<HTMLElement>('.bmt-new').click();
    expect(p.onNew).toHaveBeenCalled();
    q<HTMLElement>('.bmt-back').click();
    expect(p.onBack).toHaveBeenCalled();
    un();
  });
  it('empty state', () => {
    const un = meta.myRooms(host, { rooms: [], onPlay: vi.fn(), onShare: vi.fn(), onRemix: vi.fn(), onNew: vi.fn(), onBack: vi.fn() });
    expect(host.textContent).toContain('No rooms yet.');
    un();
  });
});
