/**
 * Share sheet (GDD 3.1, 7.3): "Post clip" lights up when the export is done; the tap itself calls
 * shareClip (fresh gesture). In-app browsers: "Open in Safari/Chrome" + copy the handoff link.
 * Practice again; Dare a friend disabled until M1a; "Copy for the group chat" (emoji card, GDD 7.2).
 */
import type { ShareFormat } from '../../types';
import { COPY } from '../copy';
import { btn, h, toast } from '../dom';
import type { ClipView } from './Result';

/** One "Post as..." chip (GDD 7.5): label, and why it is greyed out. */
export interface FormatChip {
  format: ShareFormat;
  label: string;
  available: boolean;
  reason?: string;
}

export interface ShareProps {
  inApp: boolean;
  showPhoto: boolean;
  hasOpener: boolean;
  onTogglePhoto(on: boolean): void;
  onPost(): void;
  onRetry(): void;
  onCopyHandoff(): Promise<boolean>;
  onCopyChat(): Promise<boolean>;
  onPracticeAgain(): void;
  /** Label of the replay button: "Practice again", or the ranked run it really opens. */
  againLabel?: string;
  /** Dare a friend (absent after the first heist). */
  onDare?(): void;
  /** Share or save the 1080x1350 result card. */
  onCard?(): void;
  onDone(): void;
  /** FULL build: "Post as..." format picked (the clip re-renders in that format). */
  onFormat?(f: ShareFormat): void;
  /** Extra actions (Remix this room, Report this room). */
  extras?: { label: string; onClick(): void }[];
  // ----- wave 3 -----
  /** "More" menu: story card, Rap Sheet mugshot, cat card, cameo card, room link... */
  more?: { label: string; onClick(): void }[];
  /** "Add music to the clip" toggle (12 s sting); absent hides it. */
  music?: { on: boolean; onToggle(on: boolean): void };
  /** In-app browser steps for this browser (iOS "•••" → Open in browser…). */
  handoff?: { title: string; steps: string[] };
  /** The Android intent:// link was tapped (bc_inapp_handoff intent_opened). */
  onIntent?(): void;
}

export interface ShareHandle {
  setClip(v: ClipView): void;
  /** Show the clip inline (the screen's hero once it is ready; also the long-press fallback). */
  showInline(blob: Blob, hint?: boolean): void;
  /** Still shown in the preview slot while the clip renders. */
  setPoster(url: string | null): void;
  toast(text: string): void;
  /** "Post as..." chips (they arrive with the lazy share module) and the selected one. */
  setFormats?(chips: FormatChip[], current: ShareFormat): void;
  /** Android in-app browser: an "Open in Chrome" intent:// link (null hides it). */
  setIntent?(url: string | null): void;
  /**
   * Inline one-line question under the chips (in-app browsers block window.prompt): resolves with the text, or null
   * when cancelled. A second call replaces an open one (the first resolves null).
   */
  askText?(label: string, opts?: { placeholder?: string; initial?: string; ok?: string }): Promise<string | null>;
  dispose(): void;
}

export function mountShare(host: HTMLElement, p: ShareProps): ShareHandle {
  let status: ClipView['status'] = 'idle';
  const post = btn(
    COPY.postClip,
    () => {
      if (status === 'error') p.onRetry();
      else if (status === 'ready') {
        post.classList.add('is-used'); // stop the glow once it has done its job
        p.onPost();
      }
    },
    'bc-cta bc-cta-big bc-post',
  );
  const bar = h('i', { class: 'bc-progress' });
  post.appendChild(bar);
  const preview = h('div', { class: 'bc-clip-preview' });
  const intentSlot = h('div', { class: 'bc-intent' });
  const inApp = p.inApp
    ? h(
        'section',
        { class: 'bc-card bc-inapp' },
        h('strong', {}, p.handoff?.title ?? COPY.inAppShare),
        p.handoff?.steps.length
          ? h('ol', { class: 'bc-steps' }, ...p.handoff.steps.map((x) => h('li', {}, x)))
          : h('small', { class: 'bc-muted' }, COPY.inAppSteps),
        intentSlot,
        btn(
          COPY.copyHandoff,
          () => {
            void p.onCopyHandoff().then((ok) => toast(root, ok ? COPY.copied : 'Could not copy. Long-press the address bar.'));
          },
          'bc-cta bc-cta-gold',
        ),
      )
    : null;
  const photo = p.hasOpener
    ? h(
        'label',
        { class: 'bc-toggle' },
        (() => {
          const cb = h('input', { type: 'checkbox' });
          cb.checked = p.showPhoto;
          cb.addEventListener('change', () => p.onTogglePhoto(cb.checked));
          return cb;
        })(),
        h('span', {}, COPY.showPhoto),
      )
    : null;
  const music = p.music
    ? h(
        'label',
        { class: 'bc-toggle' },
        (() => {
          const cb = h('input', { type: 'checkbox' });
          cb.checked = p.music!.on;
          cb.addEventListener('change', () => p.music!.onToggle(cb.checked));
          return cb;
        })(),
        h('span', {}, '🎵 Add music to the clip'),
      )
    : null;
  const more = p.more?.length
    ? h(
        'details',
        { class: 'bc-more' },
        h('summary', { class: 'bc-cta bc-cta-soft' }, 'More ways to brag'),
        h('div', { class: 'bc-more-list' }, ...p.more.map((x) => btn(x.label, x.onClick, 'bc-cta bc-cta-soft'))),
      )
    : null;
  const formatRow = h('div', { class: 'bc-formats', role: 'radiogroup', 'aria-label': 'Post as' });
  const askSlot = h('div', { class: 'bc-ask' });
  let askDone: ((v: string | null) => void) | null = null;
  const root = h(
    'div',
    { class: 'bc-screen bc-share' },
    h('div', { class: 'bc-share-head' }, h('h2', {}, 'Your crime, on film'), btn(COPY.done, p.onDone, 'bc-link bc-done bc-done-top')),
    preview,
    inApp,
    formatRow,
    askSlot,
    post,
    photo,
    music,
    h(
      'div',
      { class: 'bc-actions' },
      p.onDare ? btn(COPY.dare, p.onDare, 'bc-cta bc-cta-soft') : null,
      p.onCard ? btn(COPY.resultCard, p.onCard, 'bc-cta bc-cta-soft') : null,
      btn(p.againLabel ?? COPY.practiceAgain, p.onPracticeAgain, 'bc-cta bc-cta-soft'),
      btn(
        COPY.copyChat,
        () => {
          void p.onCopyChat().then((ok) => toast(root, ok ? COPY.copied : 'Could not copy'));
        },
        'bc-cta bc-cta-soft',
      ),
      ...(p.extras ?? []).map((x) => btn(x.label, x.onClick, 'bc-cta bc-cta-soft')),
    ),
    more,
  );
  host.appendChild(root);
  let shown: Blob | null = null;
  // blob: URLs this screen made (clip, fallback GIF or card): freed on the next showInline and in dispose()
  // (round 3: the <img> fallbacks were never revoked and kept several MB alive per show)
  const owned = new Set<string>();
  const revoke = (): void => {
    preview.querySelectorAll('video').forEach((v) => {
      if (v.src.startsWith('blob:')) URL.revokeObjectURL(v.src);
    });
    for (const u of owned) URL.revokeObjectURL(u);
    owned.clear();
  };

  return {
    setClip(v) {
      status = v.status;
      post.classList.toggle('is-rendering', v.status === 'rendering');
      post.classList.toggle('is-ready', v.status === 'ready');
      post.disabled = v.status === 'rendering' || v.status === 'unavailable' || v.status === 'idle';
      bar.style.width = v.status === 'rendering' ? `${Math.round(v.progress * 100)}%` : '0';
      post.firstChild!.textContent =
        v.status === 'ready'
          ? COPY.postClip
          : v.status === 'error'
            ? COPY.clipError
            : v.status === 'unavailable'
              ? 'Clips need a newer browser'
              : COPY.clipRendering;
    },
    showInline(blob, hint = false) {
      if (shown === blob && !hint) return;
      shown = blob;
      revoke();
      preview.innerHTML = '';
      const url = URL.createObjectURL(blob);
      owned.add(url);
      if (blob.type.startsWith('image/')) {
        // fallback 2 (no video encoder): the crash GIF or card
        preview.append(h('img', { class: 'bc-clip-poster', src: url, alt: 'Your crash' }));
        if (hint) preview.append(h('small', { class: 'bc-muted' }, COPY.longPress));
        return;
      }
      // no native controls (they cover the clip's bottom caption); tap toggles pause, long-press still saves
      // muted as a PROPERTY before it is in the document: h() sets the attribute after createElement, which does
      // not mute a dynamically created video, and iOS/Android autoplay checks the property (round 3: AAC clips froze)
      const v = document.createElement('video');
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.loop = true;
      v.autoplay = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.src = url;
      v.addEventListener('click', () => {
        if (v.paused) void v.play().catch(() => undefined);
        else v.pause();
      });
      preview.append(v);
      void v.play?.()?.catch?.(() => undefined);
      if (hint) preview.append(h('small', { class: 'bc-muted' }, COPY.longPress));
    },
    setPoster(url) {
      if (shown || !url) return;
      preview.innerHTML = '';
      // the Post button already says "Making your clip…": the poster needs no second caption
      preview.append(h('img', { class: 'bc-clip-poster', src: url, alt: 'Your run' }));
    },
    toast(text) {
      toast(root, text);
    },
    setFormats(all, current) {
      formatRow.innerHTML = '';
      // review round 1: formats that do not fit this run are hidden, not listed as unavailable
      const chips = all.filter((c) => c.available || c.format === current);
      if (!p.onFormat || chips.length < 2) return;
      const scroller = h('div', { class: 'bc-formats-scroll' });
      formatRow.append(h('span', { class: 'bc-kicker' }, 'Post as'), scroller);
      const fade = (): void => {
        const max = scroller.scrollWidth - scroller.clientWidth;
        formatRow.classList.toggle('fade-l', scroller.scrollLeft > 4);
        formatRow.classList.toggle('fade-r', max - scroller.scrollLeft > 4);
      };
      scroller.addEventListener('scroll', fade, { passive: true });
      requestAnimationFrame(fade);
      for (const c of chips) {
        const b = btn(c.label, () => {
          if (!c.available) {
            toast(root, c.reason ?? 'Not for this run');
            return;
          }
          formatRow.querySelectorAll('.bc-chip').forEach((x) => {
            x.classList.toggle('is-on', x === b);
            x.setAttribute('aria-checked', String(x === b));
          });
          p.onFormat?.(c.format);
        }, `bc-chip${c.format === current ? ' is-on' : ''}${c.available ? '' : ' is-off'}`);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(c.format === current));
        b.dataset.format = c.format;
        if (!c.available && c.reason) b.title = c.reason;
        scroller.append(b);
      }
      fade();
    },
    askText(label, o = {}) {
      askDone?.(null);
      askSlot.innerHTML = '';
      return new Promise<string | null>((resolve) => {
        const input = h('input', { type: 'text', class: 'bc-ask-input', maxlength: '31', placeholder: o.placeholder ?? '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done' }) as HTMLInputElement;
        input.value = o.initial ?? '';
        const finish = (v: string | null): void => {
          if (askDone !== finish) return;
          askDone = null;
          askSlot.innerHTML = '';
          resolve(v);
        };
        askDone = finish;
        const ok = btn(o.ok ?? 'OK', () => finish(input.value), 'bc-cta bc-cta-gold bc-ask-ok');
        const cancel = btn('Cancel', () => finish(null), 'bc-link');
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finish(input.value);
          else if (e.key === 'Escape') finish(null);
        });
        askSlot.append(h('label', { class: 'bc-ask-label' }, label), h('div', { class: 'bc-ask-row' }, input, ok, cancel));
        try {
          input.focus({ preventScroll: false });
        } catch {
          /* focus is a nicety */
        }
      });
    },
    setIntent(url) {
      intentSlot.innerHTML = '';
      if (url) {
        const a = h('a', { class: 'bc-cta bc-cta-soft', href: url }, 'Open in Chrome');
        a.addEventListener('click', () => p.onIntent?.());
        intentSlot.append(a);
      }
    },
    dispose() {
      askDone?.(null);
      revoke();
      root.remove();
    },
  };
}
