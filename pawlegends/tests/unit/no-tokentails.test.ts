// @vitest-environment happy-dom
/**
 * Paw Legends stands on its own (docs/plans/moba/NO-TOKENTAILS.md, founder ask 2026-11-12: "they don't need to know
 * about Token Tails at all in Pawlegends"). Two guards:
 * 1. no player-visible string in the game source names Token Tails or links to tokentails.com. Comment lines are
 *    skipped; the only allowed mentions are technical hosts the player never sees (the embed origins, the art bucket,
 *    the API host, the production host list for share links);
 * 2. the screens render no cards, squad, Meet card, card peek, Cards nav item or "Games" exit, and the cat checkout
 *    message is never sent.
 * The legal pages that must name the operator (Token Tails MB) live in the host (pawlegends-web/pages), not here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { homeScreen, type HomeScreenOpts } from '../../src/ui/home/homeScreen';
import { heroIdentity } from '../../src/ui/lobby/lobbyScreen';
import { loadingVeil, pickScreen, resultsScreen } from '../../src/ui/screens';
import { collectionPanel } from '../../src/ui/collection';
import { freshTreats } from '../../src/meta/treats';
import { EMPTY_ROSTER } from '../../src/meta/roster';
import { modeList } from '../../src/ui/modeSelect/modes';
import { PRIVACY_URL } from '../../src/ui/settings';
import { inviteUrl } from '../../src/share/partyLink';
import { PUBLIC_GAME_URL } from '../../src/app/platform';
import { CheckoutBridge } from '../../src/money/checkoutBridge';
import { Entitlements } from '../../src/money/entitlements';

vi.mock('../../src/render/portraits', () => ({ portraitUrl: () => null }));

const ROOT = resolve(__dirname, '../..');
const TT = /token\s?tails/i;
/** Technical hosts the player never reads (embed origins, art bucket, API, share-link host list). */
const ALLOWED: readonly RegExp[] = [
  /DEFAULT_EMBED_ORIGINS = 'https:\/\/pawlegends\.app,https:\/\/tokentails\.com,https:\/\/www\.tokentails\.com'/,
  /tokentails-nfts/,
  /https:\/\/api\.tokentails\.com/,
  /^const PUBLIC_HOSTS: /,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|js|mjs|html)$/.test(n) ? [p] : [];
  });
}

/** The code part of a line: whole comment lines are dropped, and a trailing ` // …` comment is cut off. */
function codeOf(line: string): string {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return '';
  return t.replace(/\s\/\/\s.*$/, '');
}

describe('no Token Tails in the game source', () => {
  it('no player-visible string names Token Tails (comments and technical hosts aside)', () => {
    const hits: string[] = [];
    for (const f of [...files(join(ROOT, 'src')), join(ROOT, 'index.html')]) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = codeOf(line);
          if (code && TT.test(code) && !ALLOWED.some((a) => a.test(code))) hits.push(`${relative(ROOT, f)}:${i + 1}: ${code.slice(0, 120)}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('links point at Paw Legends\' own domain', () => {
    expect(PRIVACY_URL).toBe('https://pawlegends.app/privacy');
    expect(inviteUrl('K7QX2M')).toBe('https://pawlegends.app/?party=K7QX2M');
    expect(PUBLIC_GAME_URL).toBe('https://pawlegends.app/');
  });

  it('the cards drawer, squad, skin demo and Meet engine are gone from the source tree', () => {
    for (const p of ['src/ui/deck', 'src/meta/squad.ts', 'src/app/skinDemo.ts']) expect(() => statSync(join(ROOT, p)), p).toThrow();
    const offer = readFileSync(join(ROOT, 'src/money/offer.ts'), 'utf8');
    expect(offer).not.toMatch(/export function pickMeet/);
  });
});

const NOW = Date.now();
const home = (o: Partial<HomeScreenOpts> = {}): HomeScreenOpts => ({
  firstTime: false,
  last: { hero: 'sage', trick: 'pounce', difficulty: 'easy' },
  dare: null,
  muted: false,
  identity: heroIdentity('sage', 'WIND'),
  signedIn: true,
  difficulties: ['easy', 'normal', 'hard'],
  onPlay: vi.fn(),
  onChoose: vi.fn(),
  onStart: vi.fn(),
  onMute: vi.fn(),
  onStore: vi.fn(),
  onSettings: vi.fn(),
  onSocial: vi.fn(),
  onCollection: vi.fn(),
  onParty: vi.fn(),
  storeOpen: true,
  profile: { name: 'Guest', tier: 3, pct: 0.2, xp: 300, matches: 12 },
  modes: modeList(NOW),
  modeChoice: { mode: 'skirmish', queue: 'bots' },
  onModeChoice: vi.fn(),
  base: './',
  ...o,
});

/** Selectors of the removed cats-become-skins UI. */
const GONE = '[data-a="cards"], [data-a="exit"], [data-testid="lobby-exit"], .lb-peek, .pl-wearing, .plc-meet, .plc-squad, .plc-joined, .plc-pick, .cs-squad, .cs-ls-cards, [data-a="deck"], .pl-skin, .champ-owned, .card-fx-list';

describe('no cats-become-skins UI on any screen', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Home (returning and first visit): no Cards nav item, card peek or Games exit', () => {
    for (const firstTime of [false, true]) {
      const root = homeScreen(document.body, home({ firstTime }));
      expect(root.querySelector(GONE), `firstTime ${firstTime}`).toBeNull();
      expect(root.textContent ?? '').not.toMatch(TT);
      expect(root.textContent ?? '').not.toMatch(/your cats|become skins|squad/i);
      document.body.innerHTML = '';
    }
  });

  it('champion select, loading, results and the Treat Track: no cards, squad, Bond or card names', () => {
    const pick = pickScreen(document.body, { initial: { hero: 'clem', trick: 'pounce', difficulty: 'easy' }, owned: { items: new Set(), unlocks: new Set(), roster: EMPTY_ROSTER }, onHero: vi.fn(), onStart: vi.fn(), onBack: vi.fn() });
    const veil = loadingVeil(document.body, 'Into the Crossing...', undefined, { name: 'Clem', matches: 3 });
    const res = resultsScreen(document.body, {
      won: true, seconds: 432, hero: 'clem', difficulty: 'easy', kills: 2, deaths: 1, level: 6, teamKills: [9, 4], firstWin: false, best: false,
      onAgain: vi.fn(), onChange: vi.fn(), onShare: vi.fn(), dareLink: 'https://pawlegends.app/?dare=x',
    });
    const col = collectionPanel(document.body, { treats: freshTreats(), owned: new Set(), art: {}, portrait: () => null, wornTitle: null, wornFrame: null, onTarget: vi.fn(), onWear: vi.fn(), onClose: vi.fn() });
    for (const [name, el] of [['pick', pick], ['veil', veil], ['results', res], ['collection', col]] as const) {
      expect(el.querySelector(GONE), name).toBeNull();
      expect(el.textContent ?? '', name).not.toMatch(TT);
      expect(el.textContent ?? '', name).not.toMatch(/\bBond \d|fought as|walk with you|squad/i);
    }
    // the Pink Paw "Meet the real cat" postcards stay
    expect(col.querySelector('.postcards')).not.toBeNull();
  });

  it('the game never asks the host for the cat checkout', () => {
    const posted: string[] = [];
    const bridge = { post: (t: string) => (posted.push(t), true), on: () => undefined };
    const co = new CheckoutBridge(bridge as never, new Entitlements());
    expect('openCat' in co).toBe(false);
    expect(posted).not.toContain('open-cat');
  });
});
