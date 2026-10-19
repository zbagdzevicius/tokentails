/**
 * "Put YOUR cat in the kart" (GDD 7), the light version of the bad-cat cat maker: pick a photo, drag / resize the
 * face oval, and the coat pattern and colours are guessed from the photo (copied bad-cat k-means palette + pattern
 * guess). The photo is decoded and analysed on the device and never uploaded. DOM only, opened from the results.
 */
import { rgb565, rgb888, type CatSpec, type Pattern } from '../../types';
import { clampCrop, cropToDecal, initialCrop, OVAL_RX, OVAL_RY, type Crop } from './face-decal';
import { analyseCoat } from './pattern-guess';
import { faceSkip, sampleCoat, SAMPLE_SIZE } from './photo-palette';
import { filterName } from '../codec/text-filter';
import type { YourCat } from './store';
import { focusNav } from '../../ui/kit';

const MAX_WORK_PX = 1200;
const PATTERNS: readonly Pattern[] = ['solid', 'tabby', 'tuxedo', 'bicolor', 'calico', 'colorpoint', 'tortie'];

async function decodePhoto(file: File): Promise<HTMLCanvasElement> {
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    const url = URL.createObjectURL(file);
    bmp = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('decode'));
      i.src = url;
    }).finally(() => URL.revokeObjectURL(url));
  }
  const w0 = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
  const h0 = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  const k = Math.min(1, MAX_WORK_PX / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  if ('close' in bmp) bmp.close();
  return c;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export interface MakerResult {
  cat: CatSpec;
  name: string;
  face: HTMLCanvasElement | null;
}

/** Opens the maker over `host`. Resolves with the new cat, `null` to remove the saved cat, or undefined on close. */
export function openMaker(host: HTMLElement, current: YourCat | null, base: CatSpec): Promise<MakerResult | null | undefined> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'fm-maker';
    wrap.setAttribute('data-ui-layer', '');
    wrap.innerHTML = `
      <div class="fm-panel fm-sticker fm-maker-panel" role="dialog" aria-label="Your cat">
        <h2>Put YOUR cat in the kart</h2>
        <p class="fm-line">Pick a photo of your cat. It stays on this device; dare links carry only the coat colours and name.</p>
        <div class="fm-maker-stage"><canvas class="fm-maker-photo" width="300" height="300"></canvas><p class="fm-maker-empty">No photo yet</p></div>
        <label class="fm-maker-size">Face size <input type="range" min="15" max="100" value="62" data-k="size" disabled></label>
        <div class="fm-maker-row">
          <canvas class="fm-maker-face" width="96" height="96"></canvas>
          <div class="fm-maker-coat">
            <div class="fm-maker-swatches"></div>
            <select data-k="pattern">${PATTERNS.map((p) => `<option value="${p}">${p}</option>`).join('')}</select>
          </div>
        </div>
        <label class="fm-maker-name">Name <input type="text" maxlength="12" data-k="name" value="${esc(current?.name ?? '')}" placeholder="Mochi" autocomplete="off"></label>
        <div class="fm-row-btns">
          <button class="fm-btn${current ? '' : ' primary'}" data-act="pick">📷 Pick a photo</button>
          <button class="fm-btn primary" data-act="save" ${current ? '' : 'disabled'}>Race! 🏁</button>
        </div>
        <div class="fm-row-btns">
          ${current ? '<button class="fm-btn" data-act="remove">Remove my cat</button>' : ''}
          <button class="fm-btn" data-act="close">Close</button>
        </div>
      </div>`;
    host.appendChild(wrap);
    const $ = <T extends Element>(s: string) => wrap.querySelector(s) as T;
    const photoCv = $<HTMLCanvasElement>('.fm-maker-photo');
    const faceCv = $<HTMLCanvasElement>('.fm-maker-face');
    const sizeIn = $<HTMLInputElement>('[data-k="size"]');
    const patSel = $<HTMLSelectElement>('[data-k="pattern"]');
    const nameIn = $<HTMLInputElement>('[data-k="name"]');
    const saveBtn = $<HTMLButtonElement>('[data-act="save"]');
    const sw = $<HTMLDivElement>('.fm-maker-swatches');

    let photo: HTMLCanvasElement | null = null;
    let crop: Crop | null = null;
    let spec: CatSpec = current ? { ...current.cat } : { ...base };
    let face: HTMLCanvasElement | null = current?.face ?? null;
    patSel.value = spec.pattern;

    const drawSwatches = () => {
      sw.innerHTML = [spec.base, spec.secondary, spec.tertiary].map((c) => `<i style="background:#${rgb888(c).toString(16).padStart(6, '0')}"></i>`).join('');
    };
    const drawFace = () => {
      const g = faceCv.getContext('2d')!;
      g.clearRect(0, 0, 96, 96);
      g.fillStyle = `#${rgb888(spec.base).toString(16).padStart(6, '0')}`;
      g.beginPath();
      g.arc(48, 48, 46, 0, Math.PI * 2);
      g.fill();
      if (face) g.drawImage(face, 0, 0, 96, 96);
    };
    const drawPhoto = () => {
      const g = photoCv.getContext('2d')!;
      if (!photo || !crop) return;
      const k = Math.min(photoCv.width / photo.width, photoCv.height / photo.height);
      const ox = (photoCv.width - photo.width * k) / 2;
      const oy = (photoCv.height - photo.height * k) / 2;
      g.fillStyle = '#1a1238';
      g.fillRect(0, 0, photoCv.width, photoCv.height);
      g.drawImage(photo, ox, oy, photo.width * k, photo.height * k);
      g.fillStyle = 'rgba(26,18,56,0.55)';
      g.beginPath();
      g.rect(0, 0, photoCv.width, photoCv.height);
      g.ellipse(ox + (crop.x + crop.w / 2) * k, oy + (crop.y + crop.h / 2) * k, crop.w * OVAL_RX * k, crop.h * OVAL_RY * k, 0, 0, Math.PI * 2);
      g.fill('evenodd');
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(ox + (crop.x + crop.w / 2) * k, oy + (crop.y + crop.h / 2) * k, crop.w * OVAL_RX * k, crop.h * OVAL_RY * k, 0, 0, Math.PI * 2);
      g.stroke();
    };
    const analyse = (keepPattern = false) => {
      if (!photo || !crop) return;
      face = cropToDecal(photo, crop);
      const s = sampleCoat(photo, crop);
      if (s) {
        const a = analyseCoat(s.pixels, SAMPLE_SIZE, SAMPLE_SIZE, faceSkip(crop, s.region));
        const pattern = keepPattern ? spec.pattern : a.pattern;
        spec = { ...spec, pattern, base: rgb565(a.roles.base), secondary: rgb565(a.roles.secondary), tertiary: rgb565(a.roles.tertiary) };
        patSel.value = pattern;
      }
      drawPhoto();
      drawFace();
      drawSwatches();
    };

    drawSwatches();
    drawFace();

    const opener = document.activeElement as HTMLElement | null;
    let closed = false;
    const close = (v: MakerResult | null | undefined) => {
      if (closed) return;
      closed = true;
      stopNav();
      window.removeEventListener('keydown', onEsc, true);
      wrap.remove();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      resolve(v);
    };
    // keyboard and pad: Esc / B close the maker (not the menu under it), arrows move between its controls
    const stopNav = focusNav(wrap, { back: () => close(undefined), modal: true });
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(undefined);
    };
    window.addEventListener('keydown', onEsc, true);
    wrap.querySelector<HTMLButtonElement>('[data-act="pick"]')?.focus({ preventScroll: true });

    // drag the oval
    let drag: { x: number; y: number } | null = null;
    photoCv.addEventListener('pointerdown', (e) => {
      if (!photo) return;
      drag = { x: e.clientX, y: e.clientY };
      photoCv.setPointerCapture(e.pointerId);
    });
    photoCv.addEventListener('pointermove', (e) => {
      if (!drag || !photo || !crop) return;
      const k = photoCv.getBoundingClientRect().width / photoCv.width;
      const s = Math.min(photoCv.width / photo.width, photoCv.height / photo.height) * k;
      crop = clampCrop({ ...crop, x: crop.x + (e.clientX - drag.x) / s, y: crop.y + (e.clientY - drag.y) / s }, photo.width, photo.height);
      drag = { x: e.clientX, y: e.clientY };
      drawPhoto();
    });
    const endDrag = () => {
      if (drag) analyse(true);
      drag = null;
    };
    photoCv.addEventListener('pointerup', endDrag);
    photoCv.addEventListener('pointercancel', endDrag);
    sizeIn.addEventListener('input', () => {
      if (!photo || !crop) return;
      const side = (Math.min(photo.width, photo.height) * Number(sizeIn.value)) / 100;
      const cx = crop.x + crop.w / 2;
      const cy = crop.y + crop.h / 2;
      crop = clampCrop({ x: cx - side / 2, y: cy - side / 2, w: side, h: side }, photo.width, photo.height);
      drawPhoto();
    });
    sizeIn.addEventListener('change', () => analyse(true));
    patSel.addEventListener('change', () => {
      spec = { ...spec, pattern: patSel.value as Pattern };
    });

    wrap.querySelector('[data-act="pick"]')!.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.cssText = 'position:fixed;left:-9999px;opacity:0';
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        input.remove();
        if (!f) return;
        try {
          photo = await decodePhoto(f);
          crop = initialCrop(photo.width, photo.height);
          sizeIn.disabled = false;
          sizeIn.value = '62';
          wrap.querySelector('.fm-maker-empty')?.remove();
          analyse();
          saveBtn.disabled = false;
          wrap.querySelector('[data-act="pick"]')?.classList.remove('primary');
          if (!nameIn.value) nameIn.focus();
        } catch {
          const p = wrap.querySelector('.fm-maker-empty');
          if (p) p.textContent = "This photo won't open here. Try a screenshot or a JPEG.";
        }
      });
      document.body.appendChild(input);
      input.click();
    });
    // B53: a name is enough to race (the photo is optional: the coat comes from the swatches and the pattern)
    const syncSave = () => {
      saveBtn.disabled = !current && !photo && !filterName(nameIn.value);
    };
    nameIn.addEventListener('input', syncSave);
    syncSave();
    saveBtn.addEventListener('click', () => {
      const name = filterName(nameIn.value) || 'My cat';
      close({ cat: { ...spec, name }, name, face });
    });
    wrap.querySelector('[data-act="remove"]')?.addEventListener('click', () => close(null));
    wrap.querySelector('[data-act="close"]')!.addEventListener('click', () => close(undefined));
  });
}
