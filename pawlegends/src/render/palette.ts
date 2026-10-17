/** Render palette: team colours, hero coats, relation colours (render only). */
export const TEAM = Object.freeze({
  /** Purrhaven: cream and rose. */
  0: Object.freeze({ main: 0xff6f91, second: 0xfff3dc, deep: 0xc94a72, name: 'Purrhaven' }),
  /** Woof: navy and brass. */
  1: Object.freeze({ main: 0x3d5a9e, second: 0xd9a441, deep: 0x26396b, name: 'Woof' }),
  /** Neutral (rats, Pudding). */
  2: Object.freeze({ main: 0xb8a27a, second: 0xf0e2c0, deep: 0x7d6b4c, name: 'Wild' }),
});

export const RELATION = Object.freeze({
  self: 0xffd34d,
  ally: 0x5fd3c6,
  enemy: 0xff4d5e,
  neutral: 0xf0c27a,
});

export const RELATION_CSS = Object.freeze({
  self: '#ffd34d',
  ally: '#5fd3c6',
  enemy: '#ff4d5e',
  neutral: '#f0c27a',
});

export const HERO_COLOR_CSS = Object.freeze({
  clem: '#ff9f6b',
  sage: '#8fb7d9',
  brutus: '#d6a36a',
  cacklejaw: '#9a7ac2',
});
