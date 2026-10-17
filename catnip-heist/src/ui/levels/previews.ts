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
 * Sizes (Act 1 4 Oct 2026, Act 2 17 Oct 2026 builds): thumbs 15-24 KB, @2x 31-56 KB, loops 63-113 KB;
 * about 2.4 MB for all 48 files. Each card loads only its own thumb; a loop loads only on focus.
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
  'heist-09': 'Deep Blue: one cat holds the plate while the other meows through the aquarium glass, freezing the dogs on the far side.',
  'heist-10': 'After Hours: the vault key opens the pharmacy door, giving the night nurse a shortcut away from the kennel ward.',
  'heist-11': 'Signal Box: one switch plate opens both gates while the signal sentries turn on a shared clock.',
  'heist-12': 'Spin Cycle: a cat stands in the doorway so the plate door stays open after its partner steps off the plate.',
  'heist-13': 'Kibble Factory: a cat meows through the held-open cat flap and the doorman sets off the long way round.',
  'heist-14': 'The Golden Bowl: one cat carries the golden key across the map so the other can open the far cage.',
  'heist-15': 'Night Gallery: the vault opens and the dog statues in the exhibit halls wake up.',
  'heist-16': 'Kibble Corp Tower: a cat in the CEO’s office holds the plate that opens the helipad airlock for its partner.',
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
  'heist-09': 'data:image/webp;base64,UklGRrQAAABXRUJQVlA4IKgAAADQBACdASogABIAPu1gq1AppSOtsBgIAbAdiWIAACXFP7lb7OIEhvjUJoEGBlkPQAD+71/yX2vEO8qqWaWXd8vz9wIJgkO9LmUOqLPqJZE1GSfKu8xfBzR/BNn81jJXtk70vgsu2IluLpt2ACte7iTzjtvaGhcToopJt4WAUGValr5AJ1zR3mkGhdqAY3bQuw4fAKE7bqXNrHTcyyl0KfgbiJ8+J2RNwAA=',
  'heist-10': 'data:image/webp;base64,UklGRsQAAABXRUJQVlA4ILgAAADwBACdASogABIAPu1iqU2ppaOiMAgBMB2JYgC4MB0+p0qpnrXuumwLlCp69m+Ms7AA/rnmHqka+CxHD11lO+PhQ+HWIbWSor9TQetyWpQvHegPRs2ZDgpyB6CLgyTdWbtU4OHY9wLAUM3r6/eWHm0D4Lc9oLERLtWOgsauQOp8L2Ip8HBwo6f7vKNS0Ly7RZPjE59Z66L2UbCkdulqvw5rebDqHjtsCrhrfCl6LypvbWJYgFn0AAAA',
  'heist-11': 'data:image/webp;base64,UklGRugAAABXRUJQVlA4INwAAADwBQCdASogABIAPu1ur1IppiQiqAgBMB2JZADE81/DypEM/RbcDigZGdEIP4E7D97koazy4t8uAAD+7pPIPE/5s+FB+m0egRuXyZG0R/+dyn4RHqpLY5VHqDvdDK7zPc4NHHbNqtF6IrR+tJR1a/BZ/nnK1gm7Dv16i6FE+5XTNoW3K7+Rf6M3llFQSmPI3tllurCDRfWIoBZAFII7X1Mwxhuw8FMo7MU5p0Rz/rTtE3olDJrIh+agFDqWZthDVdiwE1Kuf6C/AmL1p5thDbIK+s3KGZUAC5aHAAAA',
  'heist-12': 'data:image/webp;base64,UklGRswAAABXRUJQVlA4IMAAAAAQBgCdASogABIAPu1iq1AppSOisBgIATAdiWQAqSNeQvUMw8iY08gGlCmMVcYqdS/YbM1/z5wgGIAA/nU0X1sTg6HB2GtUxjALiZFchAnDBgnmCAQOUjC43IPPkWOYPeAxto5NmuoE2DpUzF4MwSI2pw5CcrQ/OykyGhdNv2czwlnQXoiQGtPuIGHv9FIn2064lhvqy2Mt/dCmmUsNYlFoHYlO5a1phd5qR6arSDBHLERgjDiJYct8dp3eyGtCQAA=',
  'heist-13': 'data:image/webp;base64,UklGRr4AAABXRUJQVlA4ILIAAADwBACdASogABIAPu1or1CppaQiqAqpMB2JZAC7AYx3QaEckiMJYN3WBzIJz2IwR4AA/tlNpWNTgvKk6VCFnH0Ki5PpX3sV3xgQ25SCnzr95B2f4u7Fnk+oSxYRagojoABNygYgj6fdjwBr2zMv+ebMlCbqmxldnWTpfusI0uxUOvFS5DToCLqR4A5j6v/ZCO1jfP993pa+pzFEj1n9QGSGFTaqtT9FukzhOaTSuwNop4AA',
  'heist-14': 'data:image/webp;base64,UklGRsQAAABXRUJQVlA4ILgAAACQBQCdASogABIAPu1ipk6ppSMiMBgMATAdiWQAuzlBPGKsAA+g6l4lS1uXiZFoY6gETMQeEAD+wAm3ol9KQp+Mmd15RM7R1usK36lqW24YL3y7JtkxHJQV1TBop/oWluEfVuwBQ2aj6nIPbGOQpUF+q+BxKtvT5S5lrcXVzU+O7YOHaKzF3L7IzUsGQgjaViGzdf0/VymQ3eVAZTI1ZGAhW6RFoGwaj3D8P6wH4e/tMiE0HYWIQAAA',
  'heist-15': 'data:image/webp;base64,UklGRu4AAABXRUJQVlA4IOIAAABwBQCdASogABIAPu1kqU2ppaQiMAgBMB2JZgAFEAJQMwats+EuyP/+KuFq4e71vnmvNM8wAP7uoLPVtMi0ux36nansfdnTYTZJ7VE3tFYB08ur+kOHxdtdqisygmhySfkO/87V3lyBopeDT8YimYNoX9UiNPfOF4dicj6Q8ZQqGo4axLflXfUfCg36RQX/iFQyvBLbvDimBefO3zuCFfcFz732eFzgC4Wb1NGLNVP0IxC7BBunO7Ig2Xh/4JjVDY3+DbG9ey+2Ye1DtLYPprfY/y08UrXGFJcUhy+LwhNgAAAA',
  'heist-16': 'data:image/webp;base64,UklGRsQAAABXRUJQVlA4ILgAAABwBQCdASogABIAPu1qrlCppaQiqAqpMB2JZACsMzRCmBDkd1RtSMySe5tS3bQHmDayM0dAAP7MAGN57NB7TGTXJ3kQHJC18nMAQYJEiP0HHpNw4r5O68aau4ZhXa6DjTKxRdYN3FfyH3GHIhxI7NYa4nVqzUVqTwGo7qfThGQHFO2Vm74VEO/6dAK/Ql4MnML73z3gjD7C98E/w2H8z3czsd8gyx7P8jf93QEwKmwNqrmb1VmRjoAA',
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
