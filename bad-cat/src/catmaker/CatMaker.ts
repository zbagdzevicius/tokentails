/**
 * "My Cat" flow (GDD 6.1, 6.2, 7.3, 8): intro (take / choose photo or 2 s video / by hand / skip) → oval crop (with
 * a frame scrubber over a video's first 2 s) → dress-up screen with a live preview, a k-means palette and a pattern
 * guess, cosmetics the player owns → CatMakerResult. Variants: studio / reply template (@handle, screenshots) and
 * re-add after an in-app handoff (one tap, the spec stays). DOM + CSS only, mobile portrait first.
 * Photos and videos never leave the device.
 */
import { filterName } from '../codec';
import {
  COSMETICS,
  DEFAULT_CAT,
  EYE_COLORS,
  PATTERNS,
  rgb565,
  rgb888,
  type CatMakerOpenExtras,
  type CatMakerResult,
  type CatSpec,
  type FaceDecal,
  type Pattern,
  type RenderApi,
} from '../types';
import { FUR_CHIPS, chipIndexOf565, deriveSecondary, hex } from './body-colour';
import { canvasToBlob, clampCrop, cropToDecal, dragCrop, initialCrop, pinchCrop, sampleFurColour, type Crop } from './face-decal';
import { filterHandle, HANDLE_MAX } from './handle';
import { analyseCoat } from './pattern-guess';
import { ACCEPT_CAMERA, ACCEPT_GALLERY, PhotoError, MSG_CANT_OPEN, cropToOpener, decodeFile, drawVideoFrame, initialFrameTime, openerCanvas, pickFile, type DecodedPhoto } from './photo-input';
import { faceSkip, sampleCoat, SAMPLE_SIZE, type PaletteCluster } from './photo-palette';
import { photoStore, type PhotoStore, type StoredCat } from './photo-store';
import { mountPreview, type CatPreviewHandle, type PreviewFactory } from './preview';
import { injectStyles } from './styles';
import { wearOwned } from '../progress/cosmetics';
export { wearOwned };
import { OPENER_SECONDS, canReencode, scaleCrop, trimVideo, videoGate, type VideoPlan } from './video-opener';

export interface CatMakerOptions extends CatMakerOpenExtras {
  initial?: CatSpec;
  fromLink: boolean;
  render: RenderApi;
  /** "Mochi dared you: 6,375" (dare arrivals): the intro headline. */
  dare?: string;
  /** Test / UI override for the 3D preview (defaults to L3's createCatPreview). */
  previewFactory?: PreviewFactory;
  store?: PhotoStore;
  /** Internal (manage → add): a new cat for an empty slot; skip means "never mind". */
  adding?: boolean;
}

export const NAME_MAX = 12;
/** `catIndex` value that keeps the cat out of every slot (studio cats: a guest's photo is never stored). */
export const MEMORY_ONLY = -1;
const NO_STORE: PhotoStore = {
  put: async () => {},
  get: async () => null,
  remove: async () => {},
  move: async () => {},
  persistent: false,
};
export const ACCEPT_IMAGES = 'image/jpeg,image/png,image/*';

/** filterName from the codec lane, with a local fallback while that lane is a stub. */
export function safeName(raw: string): string {
  try {
    return filterName(raw, NAME_MAX);
  } catch {
    return localNameFilter(raw);
  }
}

export function localNameFilter(raw: string): string {
  let s = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/(https?:|www\.|\.(com|net|org|io|ly|gg|me)\b|@)/i.test(s)) return '';
  s = Array.from(s).slice(0, NAME_MAX).join('').trim();
  return s;
}

/** Chip label of a pattern ("Colorpoint", "Tortie"...). */
export function patternLabel(p: Pattern): string {
  return p[0].toUpperCase() + p.slice(1);
}

/** What the secondary / tertiary colours mean for a pattern (null = the pattern does not use it). */
export function colourRoles(p: Pattern): { base: string; secondary: string | null; tertiary: string | null } {
  switch (p) {
    case 'tabby':
      return { base: 'Fur', secondary: 'Stripes', tertiary: 'Belly' };
    case 'tuxedo':
      return { base: 'Fur', secondary: null, tertiary: 'Bib & paws' };
    case 'bicolor':
      return { base: 'Fur', secondary: null, tertiary: 'White bits' };
    case 'calico':
      return { base: 'Ginger patches', secondary: 'Dark patches', tertiary: 'White' };
    case 'colorpoint':
      return { base: 'Body', secondary: 'Points', tertiary: null };
    case 'tortie':
      return { base: 'Ginger', secondary: 'Dark mottle', tertiary: null };
    default:
      return { base: 'Fur', secondary: null, tertiary: null };
  }
}

/** Cosmetic chip items for a slot: only owned ids that exist (none → the row is hidden). */
export function ownedCosmetics(slot: 'collar' | 'hat', owned: readonly number[] | undefined): { id: number; name: string; color: number }[] {
  if (!owned || !owned.length) return [];
  const want = new Set(owned);
  return COSMETICS.filter((c) => c.slot === slot && want.has(c.id)).map((c) => ({ id: c.id, name: c.name, color: c.color ?? 0xffffff }));
}

type Method = CatMakerResult['method'];

interface El {
  <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs?: Record<string, string | number | boolean | undefined>,
    ...kids: (Node | string | null | undefined)[]
  ): HTMLElementTagNameMap[K];
}

export const el: El = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};

const HERO_SVG = `<svg viewBox="0 0 120 110" aria-hidden="true"><ellipse cx="60" cy="100" rx="42" ry="7" fill="#4a3350"/>
<path d="M28 34 L24 6 L46 22 Z M92 34 L96 6 L74 22 Z" fill="#9a9aa2" stroke="#2b1d2e" stroke-width="3" stroke-linejoin="round"/>
<ellipse cx="60" cy="48" rx="36" ry="32" fill="#9a9aa2" stroke="#2b1d2e" stroke-width="3"/>
<ellipse cx="60" cy="50" rx="24" ry="22" fill="none" stroke="#ffb36b" stroke-width="3" stroke-dasharray="6 5"/>
<ellipse cx="49" cy="46" rx="4" ry="5" fill="#f2c14e"/><ellipse cx="71" cy="46" rx="4" ry="5" fill="#f2c14e"/>
<path d="M57 56 h6 l-3 4z" fill="#e88a9a"/><ellipse cx="60" cy="92" rx="30" ry="12" fill="#9a9aa2" stroke="#2b1d2e" stroke-width="3"/></svg>`;

function copySpec(s: CatSpec): CatSpec {
  return { ...s };
}


async function blobToCanvas(b: Blob): Promise<HTMLCanvasElement | null> {
  try {
    const bmp = await createImageBitmap(b);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')?.drawImage(bmp, 0, 0);
    bmp.close?.();
    return c;
  } catch {
    return null;
  }
}

export function openCatMaker(host: HTMLElement, opts: CatMakerOptions): Promise<CatMakerResult> {
  injectStyles();
  // catIndex -1 = memory only (?studio=1): the photo lives in the result, no cat slot is read, written or cleared
  const memoryOnly = opts.catIndex === MEMORY_ONLY || (!!opts.linked && !!opts.initial && !opts.adding && !opts.studio && !opts.reAdd);
  const store = memoryOnly ? NO_STORE : (opts.store ?? photoStore());
  const catIndex = Number.isInteger(opts.catIndex) && (opts.catIndex as number) >= 0 ? (opts.catIndex as number) : 0;
  const initial = opts.initial ? wearOwned(opts.initial, opts.owned) : null;
  const studio = !!opts.studio;
  const allowVideo = opts.allowVideo !== false;
  // linked: someone else's cat from a /c/ link, opened by a player who already has a cat. Nothing here reads or
  // writes the player's own slot: "Keep my cat" leaves it alone, "Play as" hands the cat back to the shell.
  const linked = !!opts.linked && !!initial && !opts.adding && !studio && !opts.reAdd;
  const editingExisting = !!initial && !opts.fromLink && !opts.adding && !linked;

  let spec: CatSpec = copySpec(initial ?? DEFAULT_CAT);
  if (studio && !initial) spec.name = '';
  let method: Method = 'manual';
  let photo: DecodedPhoto | null = null;
  let crop: Crop | null = null;
  let decal: HTMLCanvasElement | null = null;
  let photoColour: number | null = null; // RGB888 sampled from the photo (fallback when the palette fails)
  let palette: PaletteCluster[] = [];
  let guessed: Pattern | null = null;
  let gate: { plan: VideoPlan; note: string } | null = null;
  let stored: StoredCat | null = null;
  let keepStored = false; // confirm without a new photo but keep the saved face/opener
  let preview: CatPreviewHandle | null = null;
  let cleanupScreen: (() => void) | null = null;
  let settled = false;
  let typedName = studio ? '' : initial?.name ?? '';
  let typedHandle = '';

  const root = el('div', { class: 'bcm', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'My Cat', 'data-bcm': 'root' });
  const busyText = el('span', {}, 'Reading photo…');
  const busy = el('div', { class: 'bcm-busy', 'aria-live': 'polite' }, el('span', { class: 'bcm-paw', 'aria-hidden': 'true' }, '🐾'), busyText);
  host.appendChild(root);
  const setBusy = (on: boolean, text = 'Reading photo…'): void => {
    busyText.textContent = text;
    busy.classList.toggle('on', on);
  };

  let resolveFn: (r: CatMakerResult) => void = () => undefined;
  const done = new Promise<CatMakerResult>((r) => (resolveFn = r));

  const disposeVideo = (): void => {
    photo?.video?.dispose();
  };

  const finish = (r: CatMakerResult): void => {
    if (settled) return;
    settled = true;
    teardownScreen();
    disposeVideo();
    root.remove();
    document.querySelectorAll('input[data-bcm-picker]').forEach((e) => e.remove());
    resolveFn(memoryOnly ? r : { ...r, catIndex });
  };

  function teardownScreen(): void {
    cleanupScreen?.();
    cleanupScreen = null;
    if (preview) {
      preview.dispose();
      preview = null;
    }
    root.replaceChildren(busy);
  }

  const loadStored = store.get(catIndex).then((r) => {
    stored = r;
    return r;
  });

  const skipKeep = async (): Promise<void> => {
    if (initial && !opts.adding) {
      const r = await loadStored.catch(() => null);
      finish({ spec: copySpec(initial), face: r?.face, opener: r?.opener, method: 'skipped' });
    } else finish({ spec: copySpec(DEFAULT_CAT), method: 'skipped' });
  };

  const galleryAccept = allowVideo ? ACCEPT_GALLERY : ACCEPT_IMAGES;

  /** Picks a file; on success goes to the crop screen. */
  const pick = (capture: boolean, err: HTMLElement): void => {
    err.textContent = '';
    void pickFile({ accept: capture ? ACCEPT_CAMERA : galleryAccept, capture }).then((file) => {
      if (file && !settled) void handleFile(file, capture ? 'camera' : 'gallery', err);
    });
  };

  /** Desktop / studio: drop a screenshot or video anywhere on the screen. */
  const acceptDrops = (err: HTMLElement): void => {
    const over = (e: DragEvent): void => {
      e.preventDefault();
      root.classList.add('drop');
    };
    const leave = (): void => root.classList.remove('drop');
    const drop = (e: DragEvent): void => {
      e.preventDefault();
      root.classList.remove('drop');
      const f = e.dataTransfer?.files?.[0];
      if (f && !settled) void handleFile(f, 'gallery', err);
    };
    root.addEventListener('dragover', over);
    root.addEventListener('dragleave', leave);
    root.addEventListener('drop', drop);
    const prev = cleanupScreen;
    cleanupScreen = () => {
      prev?.();
      root.removeEventListener('dragover', over);
      root.removeEventListener('dragleave', leave);
      root.removeEventListener('drop', drop);
    };
  };

  const mountHero = (hero: HTMLElement, s: CatSpec): void => {
    // The same 3D turntable as the dress-up screen, with the flat drawing as the fallback.
    try {
      const heroCanvas = el('canvas', { class: 'bcm-hero-canvas', 'aria-hidden': 'true' }) as HTMLCanvasElement;
      hero.append(heroCanvas);
      preview = mountPreview(heroCanvas, s, null, opts.previewFactory);
    } catch {
      hero.innerHTML = HERO_SVG;
    }
  };

  // ------------------------------------------------------------------------------------------- re-add
  function showReAdd(errMsg = ''): void {
    teardownScreen();
    const name = safeName(opts.reAdd?.name ?? '') || safeName(initial?.name ?? '') || 'your cat';
    const err = el('div', { class: 'bcm-err', role: 'alert' }, errMsg);
    const choose = el('button', { class: 'bcm-btn primary', type: 'button', 'data-bcm': 'readd-choose' }, allowVideo ? 'Add photo or 2 s video' : 'Add photo');
    const take = el('button', { class: 'bcm-btn', type: 'button', 'data-bcm': 'readd-take' }, 'Take photo');
    const skip = el('button', { class: 'bcm-btn ghost', type: 'button', 'data-bcm': 'readd-skip' }, 'Skip, the game cat can open');
    const hero = el('div', { class: 'bcm-hero' });
    root.append(
      el(
        'div',
        { class: 'bcm-screen' },
        el('h1', { text: `Add ${name}’s photo again for the clip opener` }),
        el('p', { text: `Your run made it over here, but the photo stayed in the other app. One tap and ${name} opens the clip again. It stays on this phone.` }),
        hero,
        err,
        el('div', { class: 'bcm-actions' }, choose, take, skip),
      ),
    );
    mountHero(hero, spec);
    choose.onclick = () => pick(false, err);
    take.onclick = () => pick(true, err);
    skip.onclick = async () => {
      const r = await loadStored.catch(() => null);
      finish({ spec: copySpec(initial ?? DEFAULT_CAT), face: r?.face, opener: r?.opener, method: 'skipped' });
    };
    acceptDrops(err);
  }

  // ------------------------------------------------------------------------------------------- intro
  function showLinked(): void {
    teardownScreen();
    const who = safeName(initial?.name ?? '') || 'this cat';
    const mine = safeName(opts.linked?.keepName ?? '') || 'my cat';
    const adopt = el('button', { class: 'bcm-btn primary', type: 'button', 'data-bcm': 'adopt' }, `Play as ${who}`);
    const keep = el('button', { class: 'bcm-btn ghost', type: 'button', 'data-bcm': 'skip' }, `Keep ${mine}`);
    const hero = el('div', { class: 'bcm-hero' });
    root.append(
      el(
        'div',
        { class: 'bcm-screen' },
        el('h1', { text: who === 'this cat' ? 'Meet this cat' : `Meet ${who}` }),
        el('p', { text: opts.linked?.canAdd ? `A friend shared their cat. Add ${who} to your gang, or keep playing as ${mine}.` : `A friend shared their cat. Take ${who} for a spin this visit (${mine} stays saved), or keep playing as ${mine}.` }),
        hero,
        el('div', { class: 'bcm-actions' }, adopt, keep),
      ),
    );
    mountHero(hero, copySpec(initial ?? DEFAULT_CAT));
    adopt.onclick = () => finish({ spec: copySpec(initial ?? DEFAULT_CAT), method: 'skipped', adopted: true });
    keep.onclick = () => finish({ spec: copySpec(initial ?? DEFAULT_CAT), method: 'skipped', kept: true });
  }

  function showIntro(errMsg = ''): void {
    if (linked) return showLinked();
    teardownScreen();
    disposeVideo();
    photo = null;
    const err = el('div', { class: 'bcm-err', role: 'alert' }, errMsg);
    let title: string;
    let sub: string;
    if (studio) {
      title = 'Put their cat in the game';
      sub = 'Drop a screenshot of their video (or the commenter’s photo), fit the face, add their @handle. Nothing gets uploaded.';
    } else if (opts.adding) {
      title = 'A new cat joins the gang';
      sub = 'Snap them, pick a photo or a 2 s video, or build them by hand. Photos stay on this phone.';
    } else if (opts.fromLink && opts.dare) {
      title = opts.dare;
      sub = 'Snap your cat (10 s) and show them how it is done. The photo stays on this phone.';
    } else if (opts.fromLink) {
      title = 'Snap your cat (10 s)';
      sub = 'Your cat stars in the chaos. The photo stays on this phone.';
    } else {
      title = 'My Cat';
      sub = 'Snap a photo or build your cat by hand. Photos stay on this phone.';
    }

    const chooseLabel = studio ? 'Drop a screenshot of their video' : allowVideo ? 'Choose photo or short video' : 'Choose photo';
    const take = el('button', { class: `bcm-btn${studio ? '' : ' primary'}`, type: 'button', 'data-bcm': 'take' }, 'Take photo');
    const choose = el('button', { class: `bcm-btn${studio ? ' primary' : ''}`, type: 'button', 'data-bcm': 'choose' }, chooseLabel);
    const hand = el('button', { class: 'bcm-btn', type: 'button', 'data-bcm': 'hand' }, 'Pick by hand');
    const skipLabel = opts.adding ? 'Never mind' : editingExisting ? `Keep ${initial?.name || 'my cat'}` : 'Skip, use a house cat';
    const skip = el('button', { class: 'bcm-btn ghost', type: 'button', 'data-bcm': 'skip' }, skipLabel);

    const actions = el('div', { class: 'bcm-actions' });
    if (studio) actions.append(choose, take);
    else actions.append(take, choose);
    const editBtn = el('button', { class: 'bcm-btn', type: 'button', 'data-bcm': 'edit' }, `Dress up ${initial?.name || 'my cat'}`);
    if (editingExisting) actions.append(editBtn);
    actions.append(hand, skip);

    const hero = el('div', { class: 'bcm-hero' });
    root.append(el('div', { class: 'bcm-screen' }, el('h1', { text: title }), el('p', { text: sub }), hero, err, actions));
    mountHero(hero, copySpec(initial && !opts.adding ? initial : DEFAULT_CAT));

    take.onclick = () => pick(true, err);
    choose.onclick = () => pick(false, err);
    hand.onclick = () => {
      method = 'manual';
      photo = null;
      crop = null;
      decal = null;
      palette = [];
      guessed = null;
      gate = null;
      keepStored = false;
      showConfirm();
    };
    editBtn.onclick = async () => {
      editBtn.disabled = true;
      const r = await loadStored;
      method = 'manual';
      photo = null;
      decal = r?.face ? await blobToCanvas(r.face.texture) : null;
      keepStored = !!r;
      showConfirm();
    };
    skip.onclick = () => void skipKeep();
    acceptDrops(err);
  }

  async function handleFile(file: File, via: 'camera' | 'gallery', err: HTMLElement): Promise<void> {
    setBusy(true, 'Reading photo…');
    try {
      const d = await decodeFile(file);
      if (settled) {
        d.video?.dispose();
        return;
      }
      disposeVideo();
      photo = d;
      method = d.kind === 'video' ? 'video' : via;
      crop = initialCrop(d.canvas.width, d.canvas.height);
      keepStored = false;
      gate = d.video ? videoGate({ bytes: file.size, duration: d.video.duration, canReencode: canReencode(), allowVideo }) : null;
      setBusy(false);
      showCrop();
    } catch (e) {
      setBusy(false);
      err.textContent = e instanceof PhotoError ? e.message : MSG_CANT_OPEN;
    }
  }

  // ------------------------------------------------------------------------------------------- crop
  function showCrop(): void {
    if (!photo || !crop) return opts.reAdd ? showReAdd() : showIntro();
    teardownScreen();
    const src = photo.canvas;
    const iw = src.width;
    const ih = src.height;
    const view = el('canvas', { 'aria-hidden': 'true' });
    const oval = el('div', { class: 'bcm-oval' });
    const stage = el('div', {
      class: 'bcm-stage',
      'data-bcm': 'stage',
      role: 'application',
      'aria-label': 'Photo. Drag to move the oval, pinch to resize it.',
    }, view, oval);
    const range = el('input', { type: 'range', min: 0, max: 1000, step: 1, 'aria-label': 'Oval size' });
    const minus = el('button', { class: 'bcm-btn', type: 'button', 'aria-label': 'Smaller' }, '−');
    const plus = el('button', { class: 'bcm-btn', type: 'button', 'aria-label': 'Bigger' }, '+');
    const use = el('button', { class: 'bcm-btn primary', type: 'button', 'data-bcm': 'use-face' }, opts.reAdd ? 'Use this face, done' : 'Use this face');
    const again = el('button', { class: 'bcm-btn', type: 'button', 'data-bcm': 'again' }, photo.video ? 'Another video' : 'Another photo');
    const noFace = el('button', { class: 'bcm-btn', type: 'button', 'data-bcm': 'no-face' }, 'No face');

    // video: a scrubber over the first 2 s picks the frame the face is cut from
    const video = photo.video;
    let scrub: HTMLElement | null = null;
    if (video) {
      const maxT = Math.max(0, Math.min(OPENER_SECONDS, Number.isFinite(video.duration) ? video.duration : OPENER_SECONDS));
      const slider = el('input', {
        type: 'range',
        min: 0,
        max: Math.round(maxT * 1000),
        step: 33,
        value: Math.round(initialFrameTime(video.duration) * 1000),
        'aria-label': 'Frame',
        'data-bcm': 'scrub',
      });
      let seeking = Promise.resolve();
      slider.oninput = () => {
        const t = Number(slider.value) / 1000;
        seeking = seeking.then(async () => {
          await video.seek(t);
          if (settled || !photo) return;
          drawVideoFrame(video, photo.canvas);
          layout();
        });
      };
      scrub = el(
        'div',
        { class: 'bcm-scrub' },
        el('div', { class: 'bcm-label', text: 'Slide to the frame with the best face' }),
        slider,
        gate ? el('p', { class: 'bcm-note', 'data-bcm': 'video-note', text: gate.note }) : null,
      );
    }

    root.append(
      el(
        'div',
        { class: 'bcm-screen' },
        el('h1', { text: 'Fit the oval to the face' }),
        stage,
        scrub,
        el('p', { class: 'bcm-hint', text: 'Drag to move · pinch or slide to resize' }),
        el('div', { class: 'bcm-zoom' }, minus, range, plus),
        el('div', { class: 'bcm-footer' }, use, el('div', { class: 'bcm-row' }, again, noFace)),
      ),
    );

    let k = 1; // display px per photo px
    let ox = 0;
    let oy = 0;
    const minSide = (): number => Math.min(40, Math.min(iw, ih));
    const maxSide = (): number => Math.min(iw, ih);

    const place = (): void => {
      if (!crop) return;
      oval.style.width = `${crop.w * k}px`;
      oval.style.height = `${crop.h * k}px`;
      oval.style.transform = `translate(${ox + crop.x * k}px, ${oy + crop.y * k}px)`;
      const lo = minSide();
      const hi = maxSide();
      range.value = String(hi > lo ? Math.round(((crop.w - lo) / (hi - lo)) * 1000) : 1000);
    };
    function layout(): void {
      const sw = stage.clientWidth || 1;
      const sh = stage.clientHeight || 1;
      k = Math.min(sw / iw, sh / ih);
      const dw = Math.max(1, Math.round(iw * k));
      const dh = Math.max(1, Math.round(ih * k));
      ox = Math.round((sw - dw) / 2);
      oy = Math.round((sh - dh) / 2);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      view.width = Math.max(1, Math.round(dw * dpr));
      view.height = Math.max(1, Math.round(dh * dpr));
      view.style.width = `${dw}px`;
      view.style.height = `${dh}px`;
      view.style.transform = `translate(${ox}px, ${oy}px)`;
      const ctx = view.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, view.width, view.height);
      }
      place();
    }

    const setCrop = (c: Crop): void => {
      crop = clampCrop(c, iw, ih);
      place();
    };

    // pointer: one finger drags, two fingers pinch (and drag by their midpoint)
    const pts = new Map<number, { x: number; y: number }>();
    const span = (): { mx: number; my: number; d: number } => {
      const a = [...pts.values()];
      if (a.length < 2) return { mx: a[0]?.x ?? 0, my: a[0]?.y ?? 0, d: 0 };
      return { mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
    };
    const onDown = (e: PointerEvent): void => {
      e.preventDefault();
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onMove = (e: PointerEvent): void => {
      if (!pts.has(e.pointerId) || !crop) return;
      e.preventDefault();
      const before = span();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = span();
      let c = crop;
      if (pts.size >= 2 && before.d > 0 && after.d > 0) c = pinchCrop(c, after.d / before.d, iw, ih);
      c = dragCrop(c, (after.mx - before.mx) / k, (after.my - before.my) / k, iw, ih);
      setCrop(c);
    };
    const onUp = (e: PointerEvent): void => {
      pts.delete(e.pointerId);
    };
    const onWheel = (e: WheelEvent): void => {
      if (!crop) return;
      e.preventDefault();
      setCrop(pinchCrop(crop, Math.exp(-e.deltaY * 0.0015), iw, ih));
    };
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('lostpointercapture', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    // iOS Safari: stop the page from treating the pinch as a zoom gesture
    const stopGesture = (e: Event): void => e.preventDefault();
    stage.addEventListener('gesturestart', stopGesture);
    stage.addEventListener('gesturechange', stopGesture);

    range.oninput = () => {
      if (!crop) return;
      const lo = minSide();
      const hi = maxSide();
      const side = lo + ((hi - lo) * Number(range.value)) / 1000;
      setCrop(pinchCrop(crop, side / crop.w, iw, ih));
    };
    minus.onclick = () => crop && setCrop(pinchCrop(crop, 1 / 1.15, iw, ih));
    plus.onclick = () => crop && setCrop(pinchCrop(crop, 1.15, iw, ih));

    const finishCrop = (withFace: boolean): void => {
      if (!photo || !crop) return;
      decal = withFace ? cropToDecal(photo.canvas, crop) : null;
      if (opts.reAdd) {
        // one tap: the spec stays exactly as it came over in the link
        void save(copySpec(initial ?? spec));
        return;
      }
      analysePhoto();
      showConfirm();
    };
    use.onclick = () => finishCrop(true);
    noFace.onclick = () => finishCrop(false);
    again.onclick = () => (opts.reAdd ? showReAdd() : showIntro());

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout()) : null;
    ro?.observe(stage);
    window.addEventListener('resize', layout);
    requestAnimationFrame(layout);
    cleanupScreen = () => {
      ro?.disconnect();
      window.removeEventListener('resize', layout);
    };
  }

  /** k-means palette + pattern guess from the photo; preselects the chips (the player can change everything). */
  function analysePhoto(): void {
    if (!photo || !crop) return;
    palette = [];
    guessed = null;
    const sample = sampleCoat(photo.canvas, crop);
    if (sample) {
      try {
        const a = analyseCoat(sample.pixels, SAMPLE_SIZE, SAMPLE_SIZE, faceSkip(crop, sample.region));
        if (a.clusters.length) {
          palette = a.clusters;
          guessed = a.pattern;
          spec.pattern = a.pattern;
          spec.base = rgb565(a.roles.base);
          spec.secondary = rgb565(a.roles.secondary);
          spec.tertiary = rgb565(a.roles.tertiary);
          photoColour = a.roles.base;
          return;
        }
      } catch {
        /* fall back to the ring colour */
      }
    }
    const col = sampleFurColour(photo.canvas, crop);
    if (col != null) {
      photoColour = col;
      spec.base = rgb565(col);
      spec.secondary = deriveSecondary(spec.base);
    }
  }

  /** Face + opener for the current photo / video, saved to the slot; then resolves. */
  async function save(out: CatSpec): Promise<void> {
    let face: FaceDecal | undefined;
    let opener: CatMakerResult['opener'];
    if (photo && crop) {
      const p = photo;
      const work = p.canvas;
      let openerW = 0;
      let openerH = 0;
      if (p.video && gate && gate.plan !== 'still' && p.file) {
        if (gate.plan === 'keep') {
          opener = { media: p.file, kind: 'video' };
          openerW = p.video.width;
          openerH = p.video.height;
        } else {
          setBusy(true, 'Trimming to the first 2 seconds…');
          const t = await trimVideo(p.video).catch(() => null);
          setBusy(false);
          if (t) {
            opener = { media: t.blob, kind: 'video' };
            openerW = t.width;
            openerH = t.height;
          }
        }
      }
      if (!opener) {
        const oc = openerCanvas(work);
        const media = await canvasToBlob(oc, 'image/jpeg', 0.85);
        if (media) opener = { media, kind: 'photo' };
        openerW = oc.width;
        openerH = oc.height;
      }
      if (decal) {
        const texture = await canvasToBlob(decal, 'image/png');
        if (texture) {
          // in opener pixels: the clip's match cut crops the opener image, not the source photo (round 3)
          const c = opener?.kind === 'video' ? scaleCrop(crop, work.width, work.height, openerW, openerH) : cropToOpener(crop, work.width, work.height);
          face = { texture, crop: c };
        }
      }
      await store.put(catIndex, { face, opener });
    } else if (keepStored && stored) {
      face = stored.face;
      opener = stored.opener;
    } else {
      await store.remove(catIndex);
    }
    const handle = studio ? filterHandle(typedHandle) || undefined : undefined;
    finish({ spec: out, face, opener, method, ...(handle ? { handle } : {}) });
  }

  // ------------------------------------------------------------------------------------------- dress-up
  function showConfirm(): void {
    teardownScreen();
    const canvas = el('canvas', { 'aria-hidden': 'true' });
    const badge = el('div', { class: 'bcm-badge', 'aria-hidden': 'true' });
    const previewBox = el('div', { class: 'bcm-preview', role: 'img', 'aria-label': 'Your cat' }, canvas, badge);
    const scroll = el('div', { class: 'bcm-scroll' });

    const syncers: (() => void)[] = [];
    const refresh = (): void => {
      preview?.update(spec, decal);
      for (const fn of syncers) fn();
    };

    const group = (label: string, body: HTMLElement, id?: string): { g: HTMLElement; label: HTMLElement } => {
      const lab = el('div', { class: 'bcm-label', text: label });
      const g = el('div', { class: 'bcm-group', role: 'group', 'aria-label': label, 'data-bcm-group': id }, lab, body);
      scroll.append(g);
      return { g, label: lab };
    };

    type Item<T> = { value: T; text?: string; swatch?: number; extraClass?: string; aria?: string };
    const chipRow = <T>(label: string, items: readonly Item<T>[], get: () => T, set: (v: T) => void, id?: string): { g: HTMLElement; label: HTMLElement; btns: HTMLButtonElement[] } => {
      const row = el('div', { class: 'bcm-chips' });
      const btns = items.map((it) => {
        const both = it.swatch != null && it.text != null;
        const b = el('button', {
          class: `bcm-chip${it.swatch != null && !both ? ' swatch' : ''}${both ? ' cos' : ''}${it.extraClass ? ' ' + it.extraClass : ''}`,
          type: 'button',
          'aria-label': it.aria ?? it.text ?? String(it.value),
          'aria-pressed': 'false',
        });
        if (it.swatch != null) {
          const sw = el('span');
          sw.style.background = hex(it.swatch);
          b.append(sw);
          if (both) b.append(it.text as string);
        } else b.textContent = it.text ?? String(it.value);
        b.onclick = () => {
          set(it.value);
          refresh();
          b.classList.remove('pop');
          void b.offsetWidth;
          b.classList.add('pop');
        };
        row.append(b);
        return b;
      });
      syncers.push(() => {
        const cur = get();
        items.forEach((it, i) => btns[i].setAttribute('aria-pressed', String(it.value === cur)));
      });
      return { ...group(label, row, id), btns };
    };

    // studio: the @handle for the caption ("I put @luna.mom's cat in my game"), never stored
    if (studio) {
      const handle = el('input', {
        class: 'bcm-name',
        type: 'text',
        inputmode: 'email',
        maxlength: HANDLE_MAX + 1,
        autocomplete: 'off',
        autocapitalize: 'none',
        spellcheck: 'false',
        placeholder: '@their.handle',
        'aria-label': 'Their @handle',
        'data-bcm': 'handle',
      });
      handle.value = typedHandle;
      const capLine = el('p', { class: 'bcm-note', 'data-bcm': 'handle-caption' });
      const syncCap = (): void => {
        const hnd = filterHandle(typedHandle);
        capLine.textContent = hnd ? `Caption: “I put ${hnd}’s cat in my game”` : 'Caption: “I put this cat in my game”';
      };
      handle.addEventListener('input', () => {
        const f = filterHandle(handle.value);
        const v = f || (handle.value.trim().startsWith('@') ? '@' : '');
        if (handle.value !== v) handle.value = v;
        typedHandle = v;
        syncCap();
      });
      syncCap();
      const box = el('div', {}, handle, capLine);
      group('Their @handle', box, 'handle');
    }

    // name
    const name = el('input', {
      class: 'bcm-name',
      type: 'text',
      maxlength: NAME_MAX,
      autocomplete: 'off',
      autocapitalize: 'words',
      spellcheck: 'false',
      enterkeyhint: 'done',
      placeholder: studio ? 'Their cat’s name' : 'Your cat’s name',
      'aria-label': 'Name',
      'data-bcm': 'name',
    });
    name.value = typedName;
    name.addEventListener('input', () => (typedName = name.value));
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') name.blur();
    });
    group('Name', name);

    // pattern (all 7), the photo guess marked
    const patItems = PATTERNS.map((p) => ({ value: p, text: patternLabel(p), extraClass: p === guessed ? 'guess' : undefined, aria: p === guessed ? `${patternLabel(p)} (our guess)` : patternLabel(p) }));
    const pat = chipRow<Pattern>('Pattern', patItems, () => spec.pattern, (v) => (spec.pattern = v), 'pattern');
    if (guessed) pat.g.append(el('p', { class: 'bcm-note', 'data-bcm': 'guess', text: `Our guess from the photo: ${patternLabel(guessed)}. Wrong? Tap another, we won’t be offended.` }));

    // palette swatches from the photo (k-means), offered first in every colour row
    const photoItems = (role: string): Item<number>[] => {
      const items: Item<number>[] = palette.map((c, i) => ({ value: rgb565(c.rgb), swatch: c.rgb, extraClass: 'photo', aria: `${role}: photo colour ${i + 1}` }));
      if (!palette.length && photoColour != null) items.push({ value: rgb565(photoColour), swatch: photoColour, extraClass: 'photo', aria: 'From photo' });
      return items;
    };
    const dedupe = (items: Item<number>[]): Item<number>[] => {
      const seen = new Set<number>();
      return items.filter((it) => (seen.has(it.value) ? false : (seen.add(it.value), true)));
    };

    // base
    const baseItems = photoItems('Fur');
    if (!baseItems.length && chipIndexOf565(spec.base) < 0) baseItems.push({ value: spec.base, swatch: rgb888(spec.base), extraClass: 'photo', aria: 'Current' });
    for (const c of FUR_CHIPS) baseItems.push({ value: rgb565(c.rgb), swatch: c.rgb, aria: c.label });
    const baseRow = chipRow('Fur', dedupe(baseItems), () => spec.base, (v) => {
      spec.base = v;
      if (!secTouched) spec.secondary = deriveSecondary(v);
    }, 'base');

    // secondary (stripes / patches / points / mottle)
    let secTouched = spec.secondary !== deriveSecondary(spec.base);
    const secItems: Item<number>[] = [{ value: -1, swatch: rgb888(deriveSecondary(spec.base)), aria: 'Auto' }];
    secItems.push(...photoItems('Second colour'));
    for (const c of FUR_CHIPS) secItems.push({ value: rgb565(c.rgb), swatch: c.rgb, aria: c.label });
    const secRow = chipRow(
      'Stripes',
      dedupe(secItems),
      () => (secTouched ? spec.secondary : -1),
      (v) => {
        if (v === -1) {
          secTouched = false;
          spec.secondary = deriveSecondary(spec.base);
        } else {
          secTouched = true;
          spec.secondary = v;
        }
      },
      'secondary',
    );

    // tertiary (belly / bib / white)
    const terItems: Item<number>[] = photoItems('White bits');
    if (!terItems.some((t) => t.value === spec.tertiary)) terItems.push({ value: spec.tertiary, swatch: rgb888(spec.tertiary), aria: 'Current' });
    for (const c of FUR_CHIPS) terItems.push({ value: rgb565(c.rgb), swatch: c.rgb, aria: c.label });
    const terRow = chipRow('Belly', dedupe(terItems), () => spec.tertiary, (v) => (spec.tertiary = v), 'tertiary');

    syncers.push(() => {
      const roles = colourRoles(spec.pattern);
      baseRow.label.textContent = roles.base;
      secRow.g.hidden = !roles.secondary;
      if (roles.secondary) secRow.label.textContent = roles.secondary;
      terRow.g.hidden = !roles.tertiary;
      if (roles.tertiary) terRow.label.textContent = roles.tertiary;
      const autoSw = secRow.btns[0]?.querySelector('span') as HTMLElement | null;
      if (autoSw) autoSw.style.background = hex(rgb888(deriveSecondary(spec.base)));
      badge.textContent = spec.pattern === guessed ? `${patternLabel(spec.pattern)} · photo guess` : patternLabel(spec.pattern);
    });

    chipRow(
      'Eyes',
      EYE_COLORS.map((c, i) => ({ value: i, swatch: c, aria: `Eye colour ${i + 1}` })),
      () => spec.eyes,
      (v) => (spec.eyes = v),
    );
    chipRow('Ears', [{ value: 'normal' as const, text: 'Pointy' }, { value: 'fold' as const, text: 'Fold' }], () => spec.ears, (v) => (spec.ears = v));
    chipRow(
      'Tail',
      [
        { value: 'normal' as const, text: 'Normal' },
        { value: 'fluffy' as const, text: 'Fluffy' },
        { value: 'bob' as const, text: 'Bob' },
      ],
      () => spec.tail,
      (v) => (spec.tail = v),
    );
    chipRow(
      'Body',
      [
        { value: 'slim' as const, text: 'Slim' },
        { value: 'normal' as const, text: 'Normal' },
        { value: 'chonk' as const, text: 'Chonk' },
      ],
      () => spec.body,
      (v) => (spec.body = v),
    );

    // cosmetics the player owns (rows hidden when none)
    const collars = ownedCosmetics('collar', opts.owned?.collars);
    if (collars.length)
      chipRow(
        'Collar',
        [{ value: 0, text: 'None' }, ...collars.map((c) => ({ value: c.id, text: c.name, swatch: c.color }))],
        () => spec.collar,
        (v) => (spec.collar = v),
        'collar',
      );
    const hats = ownedCosmetics('hat', opts.owned?.hats);
    if (hats.length)
      chipRow(
        'Hat',
        [{ value: 0, text: 'None' }, ...hats.map((c) => ({ value: c.id, text: c.name, swatch: c.color }))],
        () => spec.hat,
        (v) => (spec.hat = v),
        'hat',
      );

    const okLabel = studio ? 'Put them in the game' : opts.adding ? 'Welcome to the gang' : 'This is my cat';
    const ok = el('button', { class: 'bcm-btn primary', type: 'button', 'data-bcm': 'confirm' }, okLabel);
    const back = el('button', { class: 'bcm-btn ghost', type: 'button', 'data-bcm': 'back' }, photo ? 'Change photo' : 'Use a photo instead');
    // round 3: the hand-built screen had no way out but "This is my cat" / "Use a photo instead"
    const skipHand =
      method === 'manual' && !photo
        ? el(
            'button',
            { class: 'bcm-btn ghost', type: 'button', 'data-bcm': 'skip-hand' },
            opts.adding ? 'Never mind' : initial ? `Keep ${initial.name || 'my cat'}` : 'Skip, use a house cat',
          )
        : null;
    const footer = el('div', { class: 'bcm-footer' }, ok, back);
    if (skipHand) footer.append(skipHand);
    root.append(el('div', { class: 'bcm-screen' }, previewBox, scroll, footer));
    if (skipHand) skipHand.onclick = () => void skipKeep();

    preview = mountPreview(canvas, spec, decal, opts.previewFactory);
    refresh();

    back.onclick = () => showIntro();
    ok.onclick = async () => {
      ok.disabled = true;
      const fallbackName = studio ? '' : safeName(initial?.name ?? '');
      const finalName = safeName(name.value) || fallbackName || DEFAULT_CAT.name;
      await save({ ...spec, name: finalName });
    };
  }

  void loadStored.catch(() => null);
  if (opts.reAdd) showReAdd();
  else showIntro();
  return done;
}
