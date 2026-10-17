/**
 * Meta screens dev harness (not shipped): http://localhost:5174/src/meta/dev.html?screen=archive&club=1&empty=1
 * Screens: archive, rapsheet, season, settings, friends, weekly, consent, rooms. Callbacks log to the console.
 */
import '../ui/styles.css';
import { qrSvg } from '../platform';
import { meta } from './index';
import { sampleCrimes, sampleEntries, sampleFriends, sampleProfile, sampleRecords, sampleRooms, sampleSeason, sampleSummary, sampleWeekly } from './fixtures';

const q = new URLSearchParams(location.search);
const screen = q.get('screen') ?? 'archive';
const club = q.get('club') === '1';
const isEmpty = q.get('empty') === '1';
const app = document.getElementById('app')!;
app.dataset.screen = screen;
const log = (name: string) => (...a: unknown[]) => console.log(`[meta] ${name}`, ...a);
const back = log('back');

switch (screen) {
  case 'archive':
    meta.archive(app, { todayNo: 30, entries: isEmpty ? [] : sampleEntries(30, 29), records: sampleRecords, club, freeDays: 14, onPlay: log('play'), onGlass: log('glass'), onLocked: log('locked'), onBack: back });
    break;
  case 'rapsheet':
    meta.rapSheet(app, { catName: 'Mochi', summary: sampleSummary(isEmpty), crimes: sampleCrimes(club, isEmpty), onShareCard: log('share'), onBack: back });
    break;
  case 'season':
    meta.season(app, { view: sampleSeason(club ? 300 * 19 + 120 : 300 * 7 + 150, club, [3]), club, onClaim: log('claim'), onJoinClub: log('club'), onBack: back });
    break;
  case 'settings':
    meta.settings(app, {
      profile: sampleProfile(),
      persistent: q.get('persistent') !== '0',
      club,
      consent: 'unset',
      hasPhoto: Promise.resolve(true),
      a2hs: { available: true, ios: q.get('ios') === '1', prompt: async () => true },
      exportSave: async () => 'bcd1.eNqrVkrOzysuSS0uUbJSMDQwUKotBgBQ6gZQ',
      importSave: async (c) => c.startsWith('bcd1.'),
      qr: (t) => qrSvg(t),
      onIcs: log('ics'),
      onChange: log('change'),
      onConsent: log('consent'),
      onRestore: log('restore'),
      onPortal: log('portal'),
      onManageCats: log('cats'),
      onCreatorCode: log('creator'),
      onClub: log('club'),
      onBack: back,
    });
    break;
  case 'friends':
    meta.friends(app, { roomLabel: 'Kitchen #18', entries: isEmpty ? [] : sampleFriends(), myScore: 5000, onRace: log('race'), onHide: log('hide'), onBack: back });
    break;
  case 'weekly':
    meta.weekly(app, { summary: sampleWeekly(q.get('ready') !== '0', isEmpty), catName: 'Mochi', animated: club, onShare: log('share'), onClose: back });
    break;
  case 'consent':
    meta.archive(app, { todayNo: 30, entries: sampleEntries(30, 10), records: sampleRecords, club, freeDays: 14, onPlay: log('play'), onGlass: log('glass'), onLocked: log('locked'), onBack: back });
    meta.consent(app, { onChoice: log('consent') });
    break;
  case 'rooms':
    meta.myRooms(app, { rooms: isEmpty ? [] : sampleRooms(), onPlay: log('play'), onShare: log('share'), onRemix: log('remix'), onNew: log('new'), onBack: back });
    break;
}
