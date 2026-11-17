/**
 * Sim v34 (docs/plans/moba/V34-MAPS.md §8.7): the ground colours of each map (render only, ~1 KB). Purrhaven Crossing's
 * row is exactly the colours mapView painted before; the pool maps take our toon palette (v6 Lightning Rivalry) in their
 * own mood: Lanternfall Ridge dusk, Twinbark Thicket deep moss, Geode Quarry warm sandstone, Pawball Park mown stripes.
 * `paint` adds a map's own ground marks (the pitch's chalk, the arena's sand) on the playfield canvas.
 */
import { ACTIVE_MAP, MAP } from '../../data/map';

export interface MapTheme {
  grass: readonly [string, string, string];
  blobDark: string;
  blobLight: string;
  path: string;
  pathEdge: string;
  den: string;
  petals?: readonly string[];
  /** Extra ground marks: canvas, metre→pixel maps, pixels a metre. */
  paint?(g: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, px: number): void;
}

const CROSSING: MapTheme = {
  grass: ['#a7d98a', '#9fd383', '#a3d488'],
  blobDark: 'rgba(120,180,95,0.16)',
  blobLight: 'rgba(190,230,150,0.16)',
  path: '#dcc792',
  pathEdge: '#c9b27c',
  den: '#d9c595',
};

const W = (): number => MAP.width / 1000;
const Hm = (): number => MAP.height / 1000;

const THEMES: Readonly<Record<string, MapTheme>> = {
  crossing: CROSSING,
  ridge: {
    grass: ['#8fc690', '#86bf8c', '#8bc48e'],
    blobDark: 'rgba(70,120,110,0.18)',
    blobLight: 'rgba(170,215,190,0.14)',
    path: '#d4c49a',
    pathEdge: '#b9a679',
    den: '#cdb98a',
    petals: ['#ffe14a', '#ffd27a', '#fff3e3'],
    paint(g, X, Y, px) {
      // the mill pit: a darker ring of trampled earth round the axis
      const o = ACTIVE_MAP.objective!;
      g.strokeStyle = 'rgba(120,92,58,0.35)';
      g.lineWidth = 0.6 * px;
      g.beginPath();
      g.arc(X(o.x / 1000), Y(o.y / 1000), (o.r / 1000) * px, 0, Math.PI * 2);
      g.stroke();
    },
  },
  thicket: {
    grass: ['#7fbf72', '#76b86b', '#7cbd70'],
    blobDark: 'rgba(50,110,60,0.2)',
    blobLight: 'rgba(160,210,130,0.14)',
    path: '#cdb98a',
    pathEdge: '#a99466',
    den: '#c4ad7c',
    petals: ['#ffffff', '#b98cff', '#ffb3cd'],
    paint(g, X, Y, px) {
      // each shrine sits on a pale paw-stone disc
      const o = ACTIVE_MAP.objective!;
      for (const x of [o.x / 1000, W() - o.x / 1000]) {
        g.fillStyle = '#e9dcc0';
        g.beginPath();
        g.arc(X(x), Y(o.y / 1000), (o.r / 1000 + 0.4) * px, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(150,120,80,0.35)';
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(X(x - 0.9 + k * 0.6), Y(o.y / 1000 + 0.9 - (k === 0 || k === 3 ? 0.3 : 0)), 0.32 * px, 0, Math.PI * 2);
          g.fill();
        }
        g.beginPath();
        g.arc(X(x), Y(o.y / 1000 - 0.3), 0.75 * px, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  quarry: {
    grass: ['#c8d68a', '#c2d184', '#c6d488'],
    blobDark: 'rgba(170,140,90,0.2)',
    blobLight: 'rgba(240,225,170,0.18)',
    path: '#e8cf98',
    pathEdge: '#cfae72',
    den: '#e2c58c',
    petals: ['#ffe14a', '#ffffff'],
    paint(g, X, Y, px) {
      // the arena's sandstone floor with a cut-stone ring round the Geode
      const o = ACTIVE_MAP.objective!;
      g.fillStyle = 'rgba(214,170,110,0.35)';
      g.beginPath();
      g.arc(X(o.x / 1000), Y(o.y / 1000), 6 * px, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(150,110,70,0.5)';
      g.lineWidth = 0.25 * px;
      for (const r of [3.2, 6]) {
        g.beginPath();
        g.arc(X(o.x / 1000), Y(o.y / 1000), r * px, 0, Math.PI * 2);
        g.stroke();
      }
    },
  },
  pitch: {
    grass: ['#9fd383', '#a6d98a', '#9fd383'],
    blobDark: 'rgba(120,180,95,0.08)',
    blobLight: 'rgba(190,230,150,0.08)',
    path: '#cfe7a8',
    pathEdge: '#b5d78e',
    den: '#cfe7a8',
    paint(g, X, Y, px) {
      // mown stripes across the pitch, then the chalk: halfway line, centre circle, both goal boxes
      const x0 = 13;
      const x1 = W() - 13;
      for (let x = x0, i = 0; x < x1; x += 4, i++) {
        if (i % 2) continue;
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(X(x), Y(41), 4 * px, 22 * px);
      }
      g.strokeStyle = 'rgba(255,253,240,0.8)';
      g.lineWidth = 0.18 * px;
      const mid = W() / 2;
      g.beginPath();
      g.moveTo(X(mid), Y(41));
      g.lineTo(X(mid), Y(19));
      g.stroke();
      g.beginPath();
      g.arc(X(mid), Y(Hm() / 2), 5 * px, 0, Math.PI * 2);
      g.stroke();
      const gm = ACTIVE_MAP.goalMouth!;
      for (const flip of [false, true]) {
        const f = (x: number): number => (flip ? W() - x : x);
        const a = f(gm[2] / 1000);
        const b = f(gm[2] / 1000 + 6);
        g.beginPath();
        g.moveTo(X(a), Y(22));
        g.lineTo(X(b), Y(22));
        g.lineTo(X(b), Y(38));
        g.lineTo(X(a), Y(38));
        g.stroke();
      }
    },
  },
};

export const mapTheme = (id: string): MapTheme => THEMES[id] ?? CROSSING;
