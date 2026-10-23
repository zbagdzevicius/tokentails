/**
 * The player's own cat (GDD 7): the coat as an 18-character cat code, the name, and the face crop as a small PNG
 * data URL. Device only: the face never leaves this browser (links carry the cat code and name, never the photo).
 */
import type { CatSpec } from '../../types';
import { load, save } from '../../core/app/storage';
import { decodeCat, encodeCat } from '../codec/cat-codec';
import { filterName } from '../codec/text-filter';

interface Stored {
  code: string;
  name: string;
  face: string | null;
}

const KEY = 'yourcat';
const FACE_PX = 160;

export interface YourCat {
  cat: CatSpec;
  name: string;
  face: HTMLCanvasElement | null;
}

let cached: YourCat | null | undefined;

function faceFromDataUrl(url: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || FACE_PX;
        c.height = img.naturalHeight || FACE_PX;
        c.getContext('2d')?.drawImage(img, 0, 0);
        resolve(c);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Load once at boot. The coat and name are ready synchronously (the first race already uses them); the face image
 * decodes asynchronously and `onFace` runs when it is ready.
 */
export function initYourCat(onFace: (c: YourCat) => void): YourCat | null {
  if (cached !== undefined) return cached;
  const s = load<Stored | null>(KEY, null);
  const name = s ? filterName(s.name) || 'My cat' : '';
  const cat = s ? decodeCat(s.code, name) : null;
  if (!s || !cat) {
    cached = null;
    return null;
  }
  const yc: YourCat = { cat: { ...cat, name }, name, face: null };
  cached = yc;
  if (s.face && s.face.startsWith('data:image/png;base64,')) {
    void faceFromDataUrl(s.face).then((f) => {
      if (f && cached === yc) {
        yc.face = f;
        onFace(yc);
      }
    });
  }
  return yc;
}

/** The cat as last loaded or saved (sync, for the race setup). */
export function yourCat(): YourCat | null {
  return cached ?? null;
}

export function saveYourCat(cat: CatSpec, name: string, face: HTMLCanvasElement | null): YourCat {
  const n = filterName(name) || 'My cat';
  let faceUrl: string | null = null;
  let small: HTMLCanvasElement | null = null;
  if (face) {
    small = document.createElement('canvas');
    small.width = FACE_PX;
    small.height = FACE_PX;
    small.getContext('2d')?.drawImage(face, 0, 0, FACE_PX, FACE_PX);
    try {
      faceUrl = small.toDataURL('image/png');
    } catch {
      faceUrl = null;
    }
  }
  save(KEY, { code: encodeCat(cat), name: n, face: faceUrl } satisfies Stored);
  cached = { cat: { ...cat, name: n }, name: n, face: small };
  return cached;
}

export function clearYourCat(): void {
  save(KEY, null);
  cached = null;
}
