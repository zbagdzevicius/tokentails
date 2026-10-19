/**
 * UGC hub (main bundle, small): the "🏁 Tracks" sticker shown with the pause and results screens, the track
 * banner with "Remix" when a shared track loads, the broken-link notice, and `?make` / `/make`. The Track Doodle
 * editor itself is a lazy chunk.
 *
 * The Tracks sheet and the editor are screens on the shell's one overlay stack ('tracks', 'editor'), so whatever was
 * open below them (the pause panel) is hidden while they are up (B46). Reads the race through the juice bus
 * (read-only) and drives the shell only through its public API (`start`, `pause`, `setup`, `world`, `screens`).
 */
import type { TrackDef } from '../types';
import type { Shell } from '../core/app/shell';
import type { FrameInfo } from '../juice/bus';
import { GO_TICK } from '../core/sim/world';
import { TRACKS } from '../core/track/tracks';
import { decodeTrackCode, encodeTrack } from './codec/track-code';
import { extractCode, trackLink, wantsEditor } from './codec/link';
import { setTrackCodec, trackFromLocation } from './codec/track-codec';
import { trackCodecV1 } from './codec/track-code';
import { listSaved, loadDraft, removeSaved, type SavedTrack } from './store';
import { byline, displayName, remixOf, shareTrack } from './actions';
import type { EditorOptions } from './editor/TrackDoodle';
import { registerScreen } from '../core/app/screens';
import './ugc.css';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class UgcHub {
  private readonly btn: HTMLButtonElement;
  private readonly banner: HTMLDivElement;
  /** the Tracks screen's root while it is open */
  private sheet: HTMLElement | null = null;
  private pendingNotice: (() => void) | null = null;
  private shown = false;
  private bannerFor = '';
  private bannerOff = false;
  private editorOpen = false;

  constructor(private readonly shell: Shell) {
    this.btn = document.createElement('button');
    this.btn.className = 'fm-ugc-btn fm-sticker';
    this.btn.textContent = '🏁 Tracks';
    this.btn.setAttribute('aria-label', 'Tracks: make, remix and share');
    this.btn.addEventListener('click', () => this.openSheet());
    this.banner = document.createElement('div');
    this.banner.className = 'fm-ugc-banner fm-sticker';
    shell.host.append(this.btn, this.banner);
    registerScreen('tracks', () => ({
      mount: (root) => {
        this.sheet = root;
        root.classList.add('fm-ugc-sheet', 'on');
        root.addEventListener('click', (e) => {
          if (e.target === root) this.closeSheet();
        });
        root.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape') e.stopPropagation();
        });
        const fill = this.pendingNotice ?? (() => this.renderSheet());
        this.pendingNotice = null;
        fill();
        return { unmount: () => (this.sheet = null) };
      },
    }));
    registerScreen('editor', () =>
      import('./editor/TrackDoodle').then((mod) => ({
        mount: (root: HTMLElement, params: unknown) => {
          const o = params as Partial<EditorOptions>;
          const ed = mod.openTrackDoodle(
            {
              def: o.def,
              slot: o.slot,
              theme: this.shell.setup?.track.theme ?? 0,
              host: {
                play: (d) => {
                  this.editorOpen = false;
                  this.shell.screens.remove('editor');
                  this.play(d);
                },
                closed: () => {
                  this.editorOpen = false;
                  this.shell.screens.remove('editor');
                },
              },
            },
            root,
          );
          return {
            // Esc is the editor's own (it asks first when there are changes)
            back: () => true,
            unmount: () => ed.root.remove(),
          };
        },
      })),
    );

    shell.bus.add({
      onFrame: (info) => this.onFrame(info),
      onReset: () => {
        this.bannerOff = false;
        this.bannerFor = '';
      },
    });
  }

  /** After the first race has started: broken links and `?make`. */
  boot(): void {
    const r = trackFromLocation(location);
    if (r && !r.ok) {
      this.notice(
        'This track link is broken.',
        'Race Kitchen instead?',
        [
          ['Race Kitchen', () => this.closeSheet()],
          ['✍️ Make a track', () => void this.openEditor({})],
        ],
      );
    } else if (wantsEditor(location.search, location.hash, location.pathname)) void this.openEditor({});
  }

  private onFrame(info: FrameInfo): void {
    // B44: the sticker comes with the pause and results screens (never over the finish celebration)
    const top = this.shell.screens.top();
    const show = !this.editorOpen && (top === 'pause' || top === 'results');
    if (show !== this.shown) {
      this.shown = show;
      this.btn.classList.toggle('on', show);
    }
    const track = this.shell.setup?.track;
    const ugc = !!track && track.id.startsWith('u-');
    const want = ugc && !this.bannerOff && !this.editorOpen && info.st.tick < GO_TICK + 180 && !info.paused;
    if (want && this.bannerFor !== track!.id) {
      this.bannerFor = track!.id;
      this.banner.innerHTML = `<span class="t">🏁 ${esc(displayName(track!))}</span><span class="b">${esc(byline(track!))}</span>`;
      const remix = document.createElement('button');
      remix.className = 'fm-ugc-chip';
      remix.textContent = '🔀 Remix';
      remix.addEventListener('click', () => {
        this.bannerOff = true;
        void this.openEditor({ def: remixOf(track!) });
      });
      this.banner.append(remix);
    }
    this.banner.classList.toggle('on', want);
  }

  private pauseRace(): void {
    const w = this.shell.world;
    if (w && !w.done) this.shell.pause(true);
  }

  async openEditor(o: Partial<EditorOptions>): Promise<void> {
    if (this.editorOpen) return;
    this.editorOpen = true;
    this.closeSheet();
    this.pauseRace();
    this.btn.classList.remove('on');
    this.banner.classList.remove('on');
    let def = o.def;
    let slot = o.slot;
    if (!def) {
      const draft = loadDraft();
      if (draft && draft.def.points.length) {
        def = draft.def;
        slot = draft.slot;
      }
    }
    const root = await this.shell.screens.push('editor', { def, slot });
    if (!root) {
      this.editorOpen = false;
      this.notice('The editor did not load.', 'Check the connection and try again.', [['OK', () => this.closeSheet()]]);
    }
  }

  /** Race a track exactly as a friend would get it from the link (decoded, validated, names filtered). */
  play(def: TrackDef): boolean {
    const code = encodeTrack(def);
    const back = decodeTrackCode(code);
    if (!back.ok) return false;
    try {
      history.replaceState(null, '', trackLink(code, location));
    } catch {
      /* sandboxed frames */
    }
    const setup = this.shell.setup;
    this.shell.start({ track: back.track, cls: setup?.cls ?? 0, seed: (Math.random() * 0x7fffffff) | 0, modifiers: 0 });
    this.closeSheet();
    return true;
  }

  private current(): TrackDef {
    return this.shell.setup?.track ?? TRACKS[0];
  }

  openSheet(): void {
    if (this.sheet) this.renderSheet();
    else void this.shell.screens.push('tracks');
  }

  private renderSheet(): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const cur = this.current();
    const saved = listSaved();
    const rows = saved
      .map(
        (s, i) => `<li>
          <span class="n">${esc(s.name || 'Untitled Track')}</span>
          <button class="fm-ugc-chip" data-i="${i}" data-a="race" aria-label="Race">▶</button>
          <button class="fm-ugc-chip" data-i="${i}" data-a="edit" aria-label="Edit">✏️</button>
          <button class="fm-ugc-chip" data-i="${i}" data-a="share" aria-label="Share">🔗</button>
          <button class="fm-ugc-chip" data-i="${i}" data-a="del" aria-label="Delete">🗑</button>
        </li>`,
      )
      .join('');
    sheet.innerHTML = `
      <div class="fm-panel fm-sticker fm-ugc-panel" role="dialog" aria-label="Tracks">
        <h1>Tracks</h1>
        <div class="fm-row-btns">
          <button class="fm-btn primary" data-a="make">✍️ Make a track</button>
          <button class="fm-btn" data-a="remix">🔀 Remix ${esc(displayName(cur))}</button>
        </div>
        ${cur.id.startsWith('u-') ? `<p class="fm-line">${esc(displayName(cur))} · ${esc(byline(cur))} <button class="fm-ugc-chip" data-a="sharecur">🔗 Share</button></p>` : ''}
        <h2>Saved on this device</h2>
        ${saved.length ? `<ul class="fm-ugc-list">${rows}</ul>` : '<p class="fm-line">Nothing yet. Make a track and it lands here.</p>'}
        <h2>Got a track link?</h2>
        <div class="fm-ugc-paste">
          <input type="text" placeholder="Paste a link or code" aria-label="Track link or code" autocomplete="off" spellcheck="false" />
          <button class="fm-btn" data-a="paste">Race</button>
        </div>
        <p class="fm-line fm-ugc-msg" role="status" aria-live="polite"></p>
        <div class="fm-row-btns"><button class="fm-btn" data-a="close">Close</button></div>
      </div>`;
    const msg = sheet.querySelector<HTMLElement>('.fm-ugc-msg')!;
    const say = (t: string) => (msg.textContent = t);
    const on = (a: string, fn: (b: HTMLButtonElement) => void) =>
      sheet.querySelectorAll<HTMLButtonElement>(`[data-a="${a}"]`).forEach((b) => b.addEventListener('click', () => fn(b)));
    const entry = (b: HTMLButtonElement): SavedTrack => saved[Number(b.dataset.i)];
    on('close', () => this.closeSheet());
    on('make', () => void this.openEditor({}));
    on('remix', () => void this.openEditor({ def: remixOf(cur) }));
    on('sharecur', () => void shareTrack(cur).then(say));
    on('race', (b) => {
      const s = entry(b);
      const d = decodeTrackCode(s.code);
      if (d.ok) this.play(d.track);
      else {
        const draft = decodeTrackCode(s.code, { validate: false });
        if (draft.ok) void this.openEditor({ def: draft.track, slot: s.slot });
        else say('This saved track is damaged.');
      }
    });
    on('edit', (b) => {
      const s = entry(b);
      const d = decodeTrackCode(s.code, { validate: false });
      if (d.ok) void this.openEditor({ def: d.track, slot: s.slot });
      else say('This saved track is damaged.');
    });
    on('share', (b) => {
      const d = decodeTrackCode(entry(b).code);
      if (d.ok) void shareTrack(d.track).then(say);
      else say('Fix this track in the editor before sharing it.');
    });
    on('del', (b) => {
      removeSaved(entry(b).slot);
      this.renderSheet();
    });
    const input = sheet.querySelector<HTMLInputElement>('.fm-ugc-paste input')!;
    const race = () => {
      const code = extractCode(input.value);
      if (!code) return say('That does not look like a track link.');
      const d = decodeTrackCode(code);
      if (d.ok) this.play(d.track);
      else say('This track link is broken.');
    };
    on('paste', race);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') race();
    });
  }

  private notice(title: string, line: string, buttons: Array<[string, () => void]>): void {
    const fill = () => {
      const sheet = this.sheet;
      if (!sheet) return;
      sheet.innerHTML = `<div class="fm-panel fm-sticker fm-ugc-panel" role="alertdialog"><h1>${esc(title)}</h1><p class="fm-line">${esc(line)}</p><div class="fm-row-btns"></div></div>`;
      const row = sheet.querySelector('.fm-row-btns')!;
      buttons.forEach(([label, fn], i) => {
        const b = document.createElement('button');
        b.className = 'fm-btn' + (i === 0 ? ' primary' : '');
        b.textContent = label;
        b.addEventListener('click', fn);
        row.append(b);
      });
    };
    if (this.sheet) fill();
    else {
      this.pendingNotice = fill;
      void this.shell.screens.push('tracks');
    }
  }

  closeSheet(): void {
    this.shell.screens.remove('tracks');
    this.sheet = null;
  }
}

/** ugc lane install (src/lanes.ts): the track codec for the core, then the hub. */
export function installUgc(shell: Shell): UgcHub {
  setTrackCodec(trackCodecV1);
  const hub = new UgcHub(shell);
  // the first race starts right after installLanes (main.ts); look at the URL once it is running
  setTimeout(() => hub.boot(), 0);
  (window as unknown as { __fmUgc?: UgcHub }).__fmUgc = hub;
  return hub;
}
