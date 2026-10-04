/**
 * Level-select previews: a still per heist card, a short muted gameplay loop for the focused card,
 * and a hero for the brief panel. All are real gameplay (solution replays), built by
 * `node scripts/build-level-previews.mjs` into public/assets/images/levels/.
 *
 * Paths are relative to the game's asset base (the `base` the UI already uses, `assets/` by
 * default), so a card does `${base}${p.thumb}`.
 *
 *   const p = getLevelPreview('heist-03');
 *   img.src = base + p.thumb; img.srcset = `${base}${p.thumb} 1x, ${base}${p.thumb2x} 2x`;
 *   // only for the focused card, created on focus (never preloaded):
 *   if (p.loop) { video.src = base + p.loop; video.muted = true; video.loop = true; video.playsInline = true; video.poster = base + p.thumb; }
 *
 * Sizes (4 Oct 2026 build): thumbs 15-23 KB, @2x 31-52 KB, loops 63-113 KB; about 1.2 MB for all 24 files.
 */

export const LEVEL_PREVIEW_DIR = 'images/levels/';

/** MIME type of the loop: the UI uses a <video> for `video/*` and an <img> for `image/*`. */
export type LevelLoopType = 'video/mp4' | 'image/webp' | 'none';

export interface LevelPreview {
  /** 480x270 WebP for the card (1x). */
  thumb: string;
  /** 960x540 WebP (2x screens). */
  thumb2x?: string;
  /** ~2.5 s seamless muted loop (480x270, 15 fps). Load it only for the focused card. */
  loop?: string;
  loopType: LevelLoopType;
  /** Brief-panel background (the 2x still: the panel is at most ~320 CSS px wide). */
  hero: string;
  /** What the preview shows, for the image's alt text. */
  alt: string;
  /** Tiny inline blur-up placeholder (data: URI), shown while the thumb loads. */
  lqip?: string;
  /** Frame size of thumb (aspect ratio for layout before the image loads). */
  width: number;
  height: number;
}

/** What each level's preview shows (kept in step with the shots in scripts/build-level-previews.mjs). */
const ALT: Record<string, string> = {
  'heist-01': 'Kibble Corp Warehouse: a cat on the pressure plate holds the door while a guard dog’s vision cone sweeps the crate stacks near the exit portal.',
  'heist-02': 'Kennel Row: the black cat meows and the doorman dog, its cone turned orange, leaves its post to investigate.',
  'heist-03': 'Twin Locks: two cats take turns on the plates to open a row of doors while a dog patrols the crate room.',
  'heist-04': 'Counting House: the cats swap through a plate door past a patrol dog to reach the golden key.',
  'heist-05': 'Watchtower Yard: a cat grabs catnip between the turning cones of three sentry dogs.',
  'heist-06': 'Conveyor Halls: a cat threads the narrow corridors to the exit and the caged shelter cat.',
  'heist-07': 'Split Shift: two wings, each cat holding a plate to open the door for the other.',
  'heist-08': 'Kibble Corp HQ: a guard dog’s cone sweeps past the vault ring as the cats close in on the last shelter cat’s crate.',
};

/**
 * Blur-up placeholders: each thumb shrunk to 32x18 WebP (about 200 bytes), shown blurred while the
 * real thumb loads. Regenerate with the thumbs (sharp: resize(32, 18).webp({ quality: 40 })).
 */
const LQIP: Record<string, string> = {
  'heist-01': 'data:image/webp;base64,UklGRtQAAABXRUJQVlA4IMgAAADQBQCdASogABIAPu1ur1KppiQiqAgBMB2JaACdMuItNRmHk9GvSfJTDoq2aBmKNHAsMlvSpL2AAP6tJSvtxtvq+FrmCp3MxOXZucnvNwp3vENxpx8lgMcrl1AvSOt6PWLlOq+6Mti7MQpuIjFKSbSuNVd+yhG3P3qm0KDOs/rBXxbJVMAy6u051irV/a5OEGWy79eRU5NWjohK/ZaseYEcC4xnUO4kgkiAzlupJ+ZdTRFas2xtk6mT5pFiRRLSL0ywqjB6gW8AAA==',
  'heist-02': 'data:image/webp;base64,UklGRtIAAABXRUJQVlA4IMYAAACQBQCdASogABIAPu1sq1EppaOiqAqpMB2JZgCsADTv5zGmKOTr4SlfB7BI2dkC3agUu1KAAAD++Ejxkpcj/Ai1NwiHhV/bXYAdLpHCxnhR2MAFxq+lpZn4gIxG9XyeRzvaSfRiE3YbKUn0UK1vwwMCrPA16eOG4KfxgHJnhNMuefZAzdnIPR524K6zsUXoo3Ha49cuU7VJypwkSF/Pb3T2NNUbBUYDjI7A00F3MOOAGCFJubzupV3r4eqsU2jFRGjjM+v8YAA=',
  'heist-03': 'data:image/webp;base64,UklGRq4AAABXRUJQVlA4IKIAAADwBACdASogABIAPu1gqk2ppSQjMBgMATAdiUAXYAaPDjKuSiXyxrecIFPF/B1SfSwA/vaJoPfmcXYIhIkIRJkn14CJVEGzq+TkkXz3SfqgP+8boRLx8GxrO/WPqa6g73GKqGU2FoCZSoXDhmsJN7hQ45ak0P42ZsrUr/qFeIvPXy8c+4qlleb7qaXcaX/qBhE1N2KU64Jmt7+vcYtHLkfFcAA=',
  'heist-04': 'data:image/webp;base64,UklGRrwAAABXRUJQVlA4ILAAAABQBQCdASogABIAPu1irFAppSQisBgIATAdiWQAuwAOkvTR6HMIqIc+SMtNxcLq1xceaAAA/r/waJLH5w8ipjstsoA7xV0oybfM2unopOtdfOVdhQkLVw+IX2Yn1/FXH7lba8w/S+TtlgeAHiXeJtzMzLC5q4gW+jCqJ/FdjqusRis52DrE0XX3iimLYWz5sEtOsNLKVZE5f4m4S43+ee5Rz7xRJn/FYeQfISng2ucAAA==',
  'heist-05': 'data:image/webp;base64,UklGRrgAAABXRUJQVlA4IKwAAACwBQCdASogABIAPuVgpU2pJaOiMAwBIByJbACdMoADEVAKWKxrVWUOc9mSkmRkvDP1JT5WgQAA/tq28T0uVYzw9Akht30pCjHdcWTZ9F8WAjqnlCboSV3zr+dvA7z2WjwFVjoDxmFyjEWS1jSnB/EFZnBkJbaKVE++m7lW5vq0M7aj4ooi06NWUZaWaTrhWdOb86vnUttzBkc2Z22xT+EAspaIaZe6H1wP32AA',
  'heist-06': 'data:image/webp;base64,UklGRoQAAABXRUJQVlA4IHgAAADQBACdASogABIAPu1oqk2ppiQiMAgBMB2JQBfJBDv3LJFNhZNxKrYuf4xNR+w2oAD+686IaALo7QcmFDTSazdBtHHqxPFUvwm6qoSgYMVwH6dLxhaWyTVP7RD72FNLEEv8vxT3sWYe8/Yc88v7kP5AZuBmG+e8AAA=',
  'heist-07': 'data:image/webp;base64,UklGRrwAAABXRUJQVlA4ILAAAAAQBQCdASogABIAPu1or1AppaSiqAqpMB2JQBWAASXnQoykpD/WnktcjXIUV0cCjf5AAP6/ng41Nj6evCJEp1Y4DBz5IqlDCpV1uRfo/CBWUGMHYiYYPyNt2DUVQ9ks4dBF7hy7tiFCERcTkomxHa3g+lyQYVpfWuhYK6EomCQRFv7dBh0N7s2M76A0Qe593hLxtwy6s9N+ZfaLwRzgtCM1Wn5GJ3uinFXXilAhIBwAAA==',
  'heist-08': 'data:image/webp;base64,UklGRsAAAABXRUJQVlA4ILQAAACQBQCdASogABIAPu1irVAppSQisBgIATAdiWIAnQAR8Dbuy7d+r5XNRWhHVjKn30igYByNMAD+qfTMGcD3N3nyZ0eUKYOSMhWrdg6PO+8IIIQWRoHmjyK5QC1QEKNTP26SLr4LfQiQDnKKKP+qIKc6Dx2q6XDtc9RlhZVEXW3iXUoeAG07cYZAkGgUKcDywvivXW22+IAp6sOaB3zVKjtucRBXO1amiKsSg5yhDEfWhEYUAAA=',
};

export const LEVEL_PREVIEW_IDS = Object.keys(ALT);

/** The preview for a level, or null for a level without one (a new level, a custom map). */
export function getLevelPreview(levelId: string): LevelPreview | null {
  const alt = ALT[levelId];
  if (!alt) return null;
  const stem = `${LEVEL_PREVIEW_DIR}${levelId}`;
  return {
    thumb: `${stem}.webp`,
    thumb2x: `${stem}@2x.webp`,
    loop: `${stem}-loop.mp4`,
    loopType: 'video/mp4',
    hero: `${stem}@2x.webp`,
    alt,
    lqip: LQIP[levelId],
    width: 480,
    height: 270,
  };
}
