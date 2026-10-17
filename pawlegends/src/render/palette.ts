/** Render palette: team colours, hero coats, relation colours (render only). */
export const TEAM = Object.freeze({
  /** Purrhaven: cream and rose. */
  0: Object.freeze({ main: 0xff6f91, second: 0xfff3dc, deep: 0xc94a72, name: 'Purrhaven' }),
  /** Woof: navy and brass. */
  1: Object.freeze({ main: 0x3d5a9e, second: 0xd9a441, deep: 0x26396b, name: 'Woof' }),
  /** Neutral (rats, Pudding). */
  2: Object.freeze({ main: 0xb8a27a, second: 0xf0e2c0, deep: 0x7d6b4c, name: 'Wild' }),
});

/**
 * Relation colours, ONE encoding everywhere (rings, nameplates, bars, minimap, towers, kill feed): our team in the
 * Purrhaven rose, the enemy in the Woof blue, yellow only for "you". The human is always slot 0 on Purrhaven in the
 * POC (host-core HUMAN_SLOT), so relation and cloth colour agree (the old teal ally / red enemy rings read as
 * "neither" and "our pink"). `danger` stays red for threats that are not a team read (wind-up telegraphs, tower range).
 */
export const RELATION = Object.freeze({
  self: 0xffd34d,
  ally: 0xff6f91,
  enemy: 0x4f78e8,
  neutral: 0xf0c27a,
  danger: 0xff4d5e,
});

export const RELATION_CSS = Object.freeze({
  self: '#ffd34d',
  ally: '#ff7a9a',
  enemy: '#7a9cff',
  neutral: '#f0c27a',
  danger: '#ff4d5e',
});

/** Minion bars: the relation hue, paler and thinner than a hero's (a minion bar never reads as a hero). */
export const MINION_BAR_CSS = Object.freeze({ ally: '#ffb8c9', enemy: '#a9c0ff' });

export const HERO_COLOR_CSS = Object.freeze({
  clem: '#ff9f6b',
  sage: '#8fb7d9',
  brutus: '#d6a36a',
  cacklejaw: '#9a7ac2',
});
