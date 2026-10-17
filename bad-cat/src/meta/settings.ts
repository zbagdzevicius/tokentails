/**
 * Full settings (GDD 8, 13.6, 14): volume sliders, reduce motion, photo in clips, clip music, Club caption style
 * and streamer layout (lock rows for free players), shared analytics consent, daily reminder + .ics, Add to Home
 * Screen, save code (text + QR) export/import, the "this browser only" notice, Restore purchases, Manage
 * subscription, My cats, Creator code, and the Club row. Every change calls onChange with a whole new Profile.
 */
import { onlineSection } from './online';
import { COSMETICS, type Profile, type ProfilePrefs, type SettingsScreenProps, type Unmount } from '../types';
import { btn, copyText, h } from '../ui/dom';
import { escapeTo, header, scope, screen } from './shared';

export const DEFAULT_REMINDER = '19:00';
const CAPTIONS = ['Default', ...COSMETICS.filter((c) => c.slot === 'caption').sort((a, b) => a.id - b.id).map((c) => c.name)];

const vol = (v: number | undefined): number => Math.round(Math.max(0, Math.min(1, typeof v === 'number' && Number.isFinite(v) ? v : 1)) * 100);

export function mountSettings(host: HTMLElement, p: SettingsScreenProps): Unmount {
  const clubUi = p.clubUi !== false;
  const s = scope();
  let prof: Profile = { ...p.profile, settings: { ...p.profile.settings }, prefs: { ...(p.profile.prefs ?? {}) } };
  const commit = (next: Partial<Profile['settings']> | null, prefs: Partial<ProfilePrefs> | null): void => {
    prof = {
      ...prof,
      settings: next ? { ...prof.settings, ...next } : prof.settings,
      prefs: prefs ? { ...(prof.prefs ?? {}), ...prefs } : prof.prefs,
    };
    p.onChange(prof);
  };
  const prefs = (): ProfilePrefs => prof.prefs ?? {};

  const section = (title: string, cls: string, ...kids: (Node | null)[]): HTMLElement =>
    h('section', { class: `bc-card bmt-set ${cls}`, 'aria-label': title }, h('div', { class: 'bc-kicker' }, title), ...kids);
  const toggle = (label: string, checked: boolean, on: (v: boolean) => void, sub?: string, name?: string): { row: HTMLElement; box: HTMLInputElement; sub: HTMLElement } => {
    const box = h('input', { type: 'checkbox', 'data-k': name ?? label });
    box.checked = checked;
    box.addEventListener('change', () => on(box.checked));
    const subEl = sub ? h('small', { class: 'bc-muted bmt-sub' }, sub) : h('small', { class: 'bc-muted bmt-sub' });
    return { row: h('label', { class: 'bc-toggle bmt-toggle' }, box, h('span', { class: 'bmt-toggle-txt' }, h('span', {}, label), subEl)), box, sub: subEl };
  };
  const action = (icon: string, label: string, onClick: () => void, sub?: string, cls = ''): HTMLElement => {
    const b = h('button', { class: `bmt-action ${cls}`, type: 'button' }, h('span', { class: 'bmt-action-ico', 'aria-hidden': 'true' }, icon), h('span', { class: 'bmt-action-txt' }, h('strong', {}, label), sub ? h('small', { class: 'bc-muted' }, sub) : null), h('span', { class: 'bmt-action-go', 'aria-hidden': 'true' }, '›'));
    b.addEventListener('click', onClick);
    return b;
  };
  const lockRow = (label: string, sub: string): HTMLElement | null => (clubUi ? action('🔒', label, p.onClub, sub, 'bmt-lock') : null);

  // ----- sound -----
  const slider = (label: string, key: 'master' | 'music' | 'sfx'): HTMLElement => {
    const val = h('output', { class: 'bmt-slider-val' }, `${vol(prefs()[key])}%`);
    const r = h('input', { type: 'range', min: 0, max: 100, step: 5, value: vol(prefs()[key]), 'aria-label': `${label} volume`, 'data-k': key });
    r.addEventListener('input', () => (val.textContent = `${r.value}%`));
    r.addEventListener('change', () => commit(null, { [key]: Math.max(0, Math.min(100, Number(r.value))) / 100 }));
    return h('label', { class: 'bmt-slider' }, h('span', {}, label), r, val);
  };
  // round 3: the sliders dim while the sound is off (they stay usable: set the levels before unmuting)
  const sliders = h('div', { class: `bmt-sliders${prof.settings.audio ? '' : ' is-muted'}` }, slider('Master', 'master'), slider('Music', 'music'), slider('Crashes & meows', 'sfx'));
  const sound = section(
    'Sound',
    'bmt-set-sound',
    toggle('Sound on', prof.settings.audio, (v) => {
      sliders.classList.toggle('is-muted', !v);
      commit({ audio: v }, null);
    }, undefined, 'audio').row,
    sliders,
  );

  // ----- play & clips -----
  const photo = toggle('Show my cat’s photo in clips', false, (v) => commit({ showPhotoInClips: v }, null), '', 'showPhotoInClips');
  const setPhoto = (has: boolean): void => {
    photo.box.disabled = !has;
    photo.box.checked = has && prof.settings.showPhotoInClips;
    photo.sub.textContent = has ? 'Opens your clip with the real cat.' : 'No photo yet: add one in My cats.';
  };
  setPhoto(typeof p.hasPhoto === 'boolean' ? p.hasPhoto : false);
  if (typeof p.hasPhoto !== 'boolean') {
    void Promise.resolve(p.hasPhoto).then(
      (v) => !s.dead && setPhoto(!!v),
      () => !s.dead && setPhoto(false),
    );
  }

  const captionPicker = (): HTMLElement => {
    const cur = Math.max(0, Math.min(CAPTIONS.length - 1, Math.trunc(prefs().captionStyle ?? 0)));
    const group = h('div', { class: 'bmt-captions', role: 'radiogroup', 'aria-label': 'Clip caption style' });
    CAPTIONS.forEach((name, i) => {
      const b = h('button', { class: `bmt-cap bmt-cap-${i}`, type: 'button', role: 'radio', 'aria-checked': String(i === cur), 'data-style': i }, h('span', { class: 'bmt-cap-demo', 'aria-hidden': 'true' }, 'BAD KITTY'), h('span', {}, name));
      b.addEventListener('click', () => {
        for (const o of Array.from(group.children)) o.setAttribute('aria-checked', String(o === b));
        commit(null, { captionStyle: i });
      });
      group.append(b);
    });
    return h('div', { class: 'bmt-field' }, h('span', { class: 'bmt-field-label' }, 'Caption style'), group);
  };
  const clips = section(
    'Play & clips',
    'bmt-set-play',
    toggle('Reduce motion', prof.settings.reduceMotion, (v) => commit({ reduceMotion: v }, null), 'Less shake, fewer flying shards.', 'reduceMotion').row,
    photo.row,
    toggle('Add music to clips', prefs().clipMusic === true, (v) => commit(null, { clipMusic: v }), '12 seconds of sneaky jazz.', 'clipMusic').row,
    p.club ? captionPicker() : lockRow('Caption styles', 'Comic, Neon, Typewriter and more · Club'),
    p.club
      ? toggle('Streamer layout', prefs().streamer === true, (v) => commit(null, { streamer: v }), 'Clean 16:9 stage with a dare QR code.', 'streamer').row
      : lockRow('Streamer layout', 'Clean 16:9 stage for streams · Club'),
  );

  // ----- privacy -----
  const privacy = section(
    'Privacy',
    'bmt-set-privacy',
    toggle('Anonymous stats', p.consent === 'granted', (v) => p.onConsent(v), 'Helps us count crimes. No ads, no names. Shared with tokentails.com.', 'consent').row,
  );

  // ----- reminder & home screen -----
  const time = h('input', { type: 'time', value: /^\d{2}:\d{2}$/.test(prefs().reminder ?? '') ? prefs().reminder! : DEFAULT_REMINDER, 'aria-label': 'Daily reminder time', 'data-k': 'reminder' });
  time.addEventListener('change', () => {
    if (/^\d{2}:\d{2}$/.test(time.value)) commit(null, { reminder: time.value });
  });
  const a2hsNote = h('small', { class: 'bc-muted bmt-sub', 'aria-live': 'polite' });
  let a2hsRow: HTMLElement | null = null;
  if (p.a2hs?.available) {
    if (p.a2hs.ios) {
      a2hsRow = h('div', { class: 'bmt-tip' }, h('span', { 'aria-hidden': 'true' }, '📲'), h('span', {}, 'Tap ', h('strong', {}, 'Share'), ' then ', h('strong', {}, 'Add to Home Screen'), '. The cat moves in.'));
    } else {
      const a2 = p.a2hs;
      a2hsRow = h(
        'div',
        { class: 'bmt-field' },
        btn('📲 Add to Home Screen', () => {
          void a2.prompt().then(
            (ok) => !s.dead && (a2hsNote.textContent = ok ? 'Moved in. Look for the paw on your home screen.' : 'Maybe later, then.'),
            () => !s.dead && (a2hsNote.textContent = 'Your browser said no. Rude.'),
          );
        }, 'bc-cta bc-cta-soft bmt-a2hs'),
        a2hsNote,
      );
    }
  }
  const reminder = section(
    'Daily reminder',
    'bmt-set-reminder',
    h('label', { class: 'bmt-field bmt-time' }, h('span', { class: 'bmt-field-label' }, 'New room alarm'), time),
    btn('📅 Add to calendar (.ics)', () => p.onIcs(/^\d{2}:\d{2}$/.test(time.value) ? time.value : DEFAULT_REMINDER), 'bc-cta bc-cta-soft bmt-ics'),
    h('small', { class: 'bc-muted' }, 'A daily calendar nudge. No email, no push, no nagging (well, a little).'),
    a2hsRow,
  );

  // ----- save code -----
  const out = h('div', { class: 'bmt-save-out', 'aria-live': 'polite' });
  const exportBtn = btn('📦 Show my save code', () => {
    exportBtn.disabled = true;
    out.textContent = 'Packing the crime scene…';
    void p.exportSave().then(
      (code) => {
        if (s.dead) return;
        exportBtn.disabled = false;
        out.innerHTML = '';
        const ta = h('textarea', { class: 'bmt-code', readonly: true, rows: 3, 'aria-label': 'Save code', spellcheck: 'false' }, code);
        const svg = code ? p.qr(code) : '';
        const qr = h('div', { class: 'bmt-qr', role: 'img', 'aria-label': 'Save code QR' });
        if (svg) qr.innerHTML = svg;
        const copied = h('small', { class: 'bc-muted', 'aria-live': 'polite' });
        out.append(
          svg ? qr : h('small', { class: 'bc-muted' }, 'Too big for a QR code: copy the text instead.'),
          ta,
          btn('Copy code', () => void copyText(code).then((ok) => !s.dead && (copied.textContent = ok ? 'Copied. Paste it on the other device.' : 'Copy failed: select the text by hand.')), 'bc-link bmt-copy'),
          copied,
        );
      },
      () => {
        if (s.dead) return;
        exportBtn.disabled = false;
        out.textContent = 'Could not pack the save. Try again?';
      },
    );
  }, 'bc-cta bc-cta-soft bmt-export');
  const importTa = h('textarea', { class: 'bmt-code', rows: 2, placeholder: 'Paste a save code', 'aria-label': 'Save code to import', spellcheck: 'false' });
  const importMsg = h('small', { class: 'bmt-import-msg', 'aria-live': 'polite' });
  const importBtn = btn('Import', () => {
    const code = importTa.value.trim();
    if (!code) {
      importMsg.textContent = 'Paste a code first.';
      return;
    }
    importBtn.disabled = true;
    void p.importSave(code).then(
      (ok) => {
        if (s.dead) return;
        importBtn.disabled = false;
        importMsg.textContent = ok ? 'Welcome back. Your record followed you.' : 'That code smells wrong. Check it and try again.';
        importMsg.className = `bmt-import-msg ${ok ? 'is-ok' : 'is-bad'}`;
      },
      () => {
        if (s.dead) return;
        importBtn.disabled = false;
        importMsg.textContent = 'That code smells wrong. Check it and try again.';
        importMsg.className = 'bmt-import-msg is-bad';
      },
    );
  }, 'bc-cta bmt-import');
  const save = section(
    'Move to another device',
    'bmt-set-save',
    p.persistent ? null : h('p', { class: 'bmt-warn', role: 'note' }, '⚠️ This browser only: storage is blocked here, so streaks and stamps may vanish. Export a save code to keep them.'),
    exportBtn,
    out,
    h('div', { class: 'bmt-field' }, h('span', { class: 'bmt-field-label' }, 'Got a code?'), importTa, importBtn, importMsg),
    clubUi ? h('small', { class: 'bc-muted' }, 'Purchases move with Restore purchases, not with the code.') : null,
  );

  // ----- account -----
  const account = section(
    clubUi ? 'Cats & purchases' : 'Your cat',
    'bmt-set-account',
    action('🐱', 'My cats', p.onManageCats, p.club ? 'Up to 5 cats' : clubUi ? '1 cat · 5 with Club' : 'Your cat and its look'),
    // restore and creator codes only online (GDD 7.4, 0c): offline builds show no Club or purchase rows
    clubUi ? action('🧾', 'Restore purchases', p.onRestore, 'Bought on another browser? Use your receipt email.') : null,
    p.club ? action('⚙️', 'Manage subscription', p.onPortal, 'Change or cancel in two taps.') : null,
    clubUi ? action('🎥', 'Creator code', p.onCreatorCode, 'Make clips? Ask for your own code.') : null,
    p.club
      ? h('div', { class: 'bmt-club is-member' }, h('span', { 'aria-hidden': 'true' }, '💜'), h('span', {}, h('strong', {}, 'Chaos Club member'), h('small', { class: 'bc-muted' }, ' Gold stamps, all the old rooms, 5 cats.')))
      : clubUi
        ? action('💜', 'Join the Chaos Club', p.onClub, 'All old rooms, gold stamps, 5 cats. Helps Pink Paw.', 'bmt-club')
        : null,
    p.onBrand ? action('🏷️', 'For brands', p.onBrand, 'Put your product in a room. Test mode until launch.') : null,
  );

  // Phase 2: account, push reminder, streak emails, /yourcat import, feed, creator dashboard (server features only)
  const online = p.online ? onlineSection(p.online, s) : null;
  const root = screen('bmt-settings', header('Settings', p.onBack, 'Paperwork'), sound, clips, privacy, reminder, online, save, account);
  escapeTo(s, p.onBack);
  return s.mount(host, root);
}
