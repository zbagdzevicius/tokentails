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
export const RELATION: { readonly self: number; readonly ally: number; readonly enemy: number; readonly neutral: number; readonly danger: number } = {
  self: 0xffd34d,
  ally: 0xff6f91,
  enemy: 0x4f78e8,
  neutral: 0xf0c27a,
  danger: 0xff4d5e,
};

export const RELATION_CSS: { readonly self: string; readonly ally: string; readonly enemy: string; readonly neutral: string; readonly danger: string } = {
  self: '#ffd34d',
  ally: '#ff7a9a',
  enemy: '#7a9cff',
  neutral: '#f0c27a',
  danger: '#ff4d5e',
};

/** Minion bars: the relation hue, paler and thinner than a hero's (a minion bar never reads as a hero). */
export const MINION_BAR_CSS: { readonly ally: string; readonly enemy: string } = { ally: '#ffb8c9', enemy: '#a9c0ff' };

/** The cat-side (rose) and dog-side (blue) relation hues: the ally / enemy pair before a side swap. */
const SIDE_HUES = Object.freeze({
  rel: [0xff6f91, 0x4f78e8] as const,
  css: ['#ff7a9a', '#7a9cff'] as const,
  bar: ['#ffb8c9', '#a9c0ff'] as const,
  team: ['#ff6f91', '#6f8fe0'] as const,
});

let sideSwap = false;

/** True while our team is the dogs (round 2: the human picked a dog). */
export function sidesSwapped(): boolean {
  return sideSwap;
}

/**
 * Cats vs dogs reads the same whichever side the human picks: the cats are always rose, the dogs always blue. When the
 * human's team is the dogs (`on`), "ally" takes the dog blue and "enemy" the cat rose everywhere (rings, plates, bars,
 * minimap, HUD), matching the bases and the minions, which already wear their species' style. Render only.
 */
export function setSideSwap(on: boolean): void {
  sideSwap = on;
  const a = on ? 1 : 0;
  const e = 1 - a;
  const rel = RELATION as { ally: number; enemy: number };
  rel.ally = SIDE_HUES.rel[a];
  rel.enemy = SIDE_HUES.rel[e];
  const css = RELATION_CSS as { ally: string; enemy: string };
  css.ally = SIDE_HUES.css[a];
  css.enemy = SIDE_HUES.css[e];
  const bar = MINION_BAR_CSS as { ally: string; enemy: string };
  bar.ally = SIDE_HUES.bar[a];
  bar.enemy = SIDE_HUES.bar[e];
  if (typeof document !== 'undefined' && document.documentElement) {
    const st = document.documentElement.style;
    if (on) {
      st.setProperty('--ally', SIDE_HUES.css[1]);
      st.setProperty('--t0', SIDE_HUES.team[1]);
      st.setProperty('--t1', SIDE_HUES.team[0]);
    } else {
      st.removeProperty('--ally');
      st.removeProperty('--t0');
      st.removeProperty('--t1');
    }
    document.documentElement.dataset.sides = on ? 'dogs' : 'cats';
  }
}

export const HERO_COLOR_CSS = Object.freeze({
  clem: '#ff9f6b',
  sage: '#8fb7d9',
  brutus: '#d6a36a',
  cacklejaw: '#9a7ac2',
  lambo: '#a8b0bc',
  aviete: '#ffe24d',
  bengas: '#ff8a5c',
  gabe: '#8fd0ff',
});

let team0Dogs = false;

/** Round 2: team 0 (slot 0's team) are the dogs. Team-coloured things (cloth, bolts, banners) follow the species. */
export function setTeam0Dogs(on: boolean): void {
  team0Dogs = on;
}

/** The TEAM[] style a sim team wears: the cat rose for the cats, the Woof blue for the dogs, whichever slot they play. */
export function dressTeam(team: number): 0 | 1 {
  const t = (team === 1 ? 1 : 0) as 0 | 1;
  return (team0Dogs ? 1 - t : t) as 0 | 1;
}
