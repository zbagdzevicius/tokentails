// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsScreenProps } from '../types';
import { meta } from './index';
import { sampleEntries, sampleProfile, sampleRecords, sampleSeason } from './fixtures';

// Round 3 QA: with VITE_BADCAT_CLUB and the API URL unset the offline build still showed 15 "Join Club" buttons,
// the boss-pack lock row and the Restore / Creator code / Club rows. Plan 7.4 and 0c: no Club UI offline.

let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => host.remove());

const text = (): string => host.textContent ?? '';

describe('Club UI off (clubUi: false)', () => {
  it('season: no Club track and no Join Club button', () => {
    const un = meta.season(host, { view: sampleSeason(300 * 7, false), club: false, clubUi: false, onClaim: vi.fn(), onJoinClub: vi.fn(), onBack: vi.fn() });
    expect(host.querySelectorAll('.bmt-joinclub, .bmt-joinclub-big').length).toBe(0);
    expect(host.querySelector('.bmt-track-club')).toBeNull();
    expect(host.querySelectorAll('.bmt-tier').length).toBe(15);
    un();
  });

  it('archive: no boss-pack lock row, no "Club vault" line', () => {
    const entries = sampleEntries(60, 59).map((e, i) => (i % 7 === 6 ? { ...e, boss: true } : e));
    const un = meta.archive(host, { todayNo: 60, entries, records: sampleRecords, club: false, clubUi: false, freeDays: 14, onPlay: vi.fn(), onGlass: vi.fn(), onLocked: vi.fn(), onBack: vi.fn() });
    expect(host.querySelector('.bmt-lockrow')).toBeNull();
    expect(text()).not.toContain('Club');
    un();
  });

  it('settings: no Restore, Creator code, Join or locked Club rows', () => {
    const p: SettingsScreenProps = {
      profile: sampleProfile(),
      persistent: true,
      club: false,
      clubUi: false,
      consent: 'unset',
      hasPhoto: true,
      a2hs: null,
      exportSave: vi.fn(async () => 'x'),
      importSave: vi.fn(async () => true),
      qr: vi.fn(() => ''),
      onIcs: vi.fn(),
      onChange: vi.fn(),
      onConsent: vi.fn(),
      onRestore: vi.fn(),
      onPortal: vi.fn(),
      onManageCats: vi.fn(),
      onCreatorCode: vi.fn(),
      onClub: vi.fn(),
      onBack: vi.fn(),
    };
    const un = meta.settings(host, p);
    expect(text()).not.toContain('Restore purchases');
    expect(text()).not.toContain('Creator code');
    expect(text()).not.toContain('Chaos Club');
    expect(host.querySelectorAll('.bmt-lock').length).toBe(0);
    expect(text()).not.toContain('For brands');
    un();
  });

  it('settings: "For brands" shows only when the shell passes onBrand', () => {
    const onBrand = vi.fn();
    const un = meta.settings(host, {
      profile: sampleProfile(), persistent: true, club: false, consent: 'unset', hasPhoto: false, a2hs: null,
      exportSave: vi.fn(async () => 'x'), importSave: vi.fn(async () => true), qr: vi.fn(() => ''), onIcs: vi.fn(), onChange: vi.fn(),
      onConsent: vi.fn(), onRestore: vi.fn(), onPortal: vi.fn(), onManageCats: vi.fn(), onCreatorCode: vi.fn(), onClub: vi.fn(), onBack: vi.fn(), onBrand,
    });
    const row = Array.from(host.querySelectorAll<HTMLElement>('.bmt-action')).find((e) => e.textContent?.includes('For brands'));
    row!.click();
    expect(onBrand).toHaveBeenCalled();
    un();
  });
});
