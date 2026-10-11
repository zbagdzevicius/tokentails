/**
 * Pink Paw cat on the share card (docs/plans/yourcat-v2.md §5.4).
 *
 * 1. The live gallery (`GET /shelter/rozine-pedute/gallery`, parsed with the shared
 *    `parsePinkPawGalleryBody`, which already drops HEAVEN cats).
 * 2. Candidates: cats in `atShelter` only, named Judas, Raudvis, Zare or Simas (the four with a
 *    licensed card image), with status WAITING or RECOVERING. Adopted, HEAVEN and unknown-status cats
 *    are never shown.
 * 3. `candidates[fnv1a(yourcatId) % candidates.length]`: stable per upload.
 * 4. The image is a same-origin copy in `public/yourcat/pink-paw/`.
 * 5. Any failure (fetch, 3 s timeout, parse, no candidate) is `null`: no panel. There is never a
 *    bundled fallback list, because it could not screen out a cat that was adopted or has died.
 */
import { apiUrl, rawApiFetch } from "@/api/api";
import { parsePinkPawGalleryBody, pinkPawGalleryPath, type PinkPawGallery } from "@/shared-contracts/pink-paw";

export const PINK_PAW_TIMEOUT_MS = 3000;

/** The cats with a licensed card image, by lower-case name. */
export const PINK_PAW_CARD_IMAGES: Readonly<Record<string, string>> = {
  judas: "/yourcat/pink-paw/judas-card.webp",
  raudvis: "/yourcat/pink-paw/raudvis-card.webp",
  zare: "/yourcat/pink-paw/zare-card.webp",
  simas: "/yourcat/pink-paw/simas-card.webp",
};

export interface PinkPawCandidate {
  name: string;
  image: string;
}

/** FNV-1a (32-bit) of a string. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Step 2: the cats that may appear on a card, in the gallery's (name) order. */
export function pinkPawCandidates(gallery: PinkPawGallery | null): PinkPawCandidate[] {
  if (!gallery) return [];
  const out: PinkPawCandidate[] = [];
  for (const cat of gallery.atShelter) {
    if (cat.status !== "WAITING" && cat.status !== "RECOVERING") continue;
    const image = PINK_PAW_CARD_IMAGES[cat.name.trim().toLowerCase()];
    if (!image) continue;
    out.push({ name: cat.name, image });
  }
  return out;
}

/** Step 3: one candidate per record id, or null when there is none. */
export function pickPinkPawCat(candidates: readonly PinkPawCandidate[], yourcatId: string): PinkPawCandidate | null {
  if (!candidates.length || !yourcatId) return null;
  return candidates[fnv1a(yourcatId) % candidates.length];
}

export interface FetchOptions {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  base?: string | undefined;
}

/** Steps 1 and 2. Never rejects: any failure is an empty list. */
export async function fetchPinkPawCandidates(options: FetchOptions = {}): Promise<PinkPawCandidate[]> {
  const base = options.base ?? apiUrl;
  if (!base) return [];
  const fetchImpl = options.fetchImpl ?? rawApiFetch;
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(null);
    }, options.timeoutMs ?? PINK_PAW_TIMEOUT_MS);
  });
  try {
    const request = (async () => {
      const response = await fetchImpl(`${base}${pinkPawGalleryPath()}`, {
        method: "GET",
        credentials: "omit",
        headers: { Accept: "application/json" },
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) return null;
      return parsePinkPawGalleryBody(await response.json());
    })();
    const gallery = await Promise.race([request, timeout]);
    return pinkPawCandidates(gallery);
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
