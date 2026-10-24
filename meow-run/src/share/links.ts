// Challenge links (SHARE lane): building ?c= links for finished runs, and opening them (the challenge card).
import type { RunResult } from '../core/types';
import { stages } from '../core/registry';
import { play, save } from '../ui/flow';
import { fmtInt } from '../ui/format';
import { ugc } from '../ugc/contract';
import { toast } from '../ugc/hub';
import { clearParams, linkWith, readParams, shareBase } from '../ugc/sharekit';
import { decodeLook } from '../wardrobe/look';
import { setChallenge } from './active';
import { decodeChallenge, fitChallenge, fitChallengeSync, MAX_LINK, type Challenge } from './code';
import { courseLabel, setDailyCourse } from './dailystage';
import { drawLookOr } from './portrait';
import { challengeOf, lastFinished } from './record';
import { modal } from './ui';

export const linkOpts = { allowPartial: false };
let cache: { result: RunResult; name: string; link: string | null; compact: boolean } | null = null;
let lastLinkStr: string | null = null;
let pending: Promise<string | null> | null = null;

export const playerName = (): string => save.player.name;
export const lastLink = (): string | null => lastLinkStr;
const maxCode = () => MAX_LINK - `${shareBase()}?c=`.length;

function challengeFor(r: RunResult): Challenge | null {
  const run = lastFinished();
  if (!run || run.result !== r) return null;
  return challengeOf(run, playerName(), linkOpts.allowPartial);
}

/** ugc.challengeUrl: sync (the compact code is prepared in the background; until then an uncompressed one) */
export function challengeUrl(r: RunResult): string | null {
  const name = playerName();
  if (cache && cache.result === r && cache.name === name) return cache.link;
  const c = challengeFor(r);
  if (!c) return null;
  const link = linkWith({ c: fitChallengeSync(c, maxCode()).code });
  cache = { result: r, name, link, compact: false };
  lastLinkStr = link;
  void prepareLink(r);
  return link;
}

/** the compact link for a run (deflated); cached per run + name */
export function prepareLink(r: RunResult): Promise<string | null> {
  const name = playerName();
  if (cache && cache.result === r && cache.name === name && cache.compact) return Promise.resolve(cache.link);
  const c = challengeFor(r);
  if (!c) return Promise.resolve(null);
  const p = fitChallenge(c, maxCode()).then(({ code }) => {
    const link = linkWith({ c: code });
    // a newer request (another name) may have replaced this one
    if (playerName() === name) {
      cache = { result: r, name, link, compact: true };
      lastLinkStr = link;
    }
    return link;
  });
  pending = p;
  return p;
}
export const pendingLink = () => pending;

// ---------------------------------------------------------------- opening a link
function courseText(c: Challenge, trailName: string): string {
  if (c.stage === 'daily') return courseLabel(c.seed ?? 0);
  if (c.stage === 'trail') return `Trail: ${trailName || 'a player trail'}`;
  return stages.has(c.stage) ? stages.get(c.stage).name : c.stage;
}

function showChallengeCard(c: Challenge, trailName: string): void {
  const name = c.name || 'A Mochi fan';
  const m = modal('share-chal', { onEsc: () => close() });
  const card = document.createElement('div');
  card.className = 'card share-chal-card';
  const cv = document.createElement('canvas');
  cv.className = 'share-chal-cat';
  cv.width = cv.height = 240;
  const ctx = cv.getContext('2d');
  if (ctx) drawLookOr(ctx, decodeLook(c.look), 0, 0, 240);
  const h = document.createElement('h2');
  h.textContent = `${name} challenges you!`;
  const beat = document.createElement('p');
  beat.className = 'share-chal-beat';
  beat.textContent = `Beat ${name}'s ${fmtInt(c.score)}`;
  const course = document.createElement('p');
  course.className = 'share-chal-course';
  course.textContent = courseText(c, trailName);
  const note = document.createElement('p');
  note.className = 'share-chal-note';
  note.textContent = c.ghost.length ? `Race ${name}'s ghost on the same course.` : 'Same course, same rules.';
  const row = document.createElement('div');
  row.className = 'row';
  const go = document.createElement('button');
  go.id = 'shareChalPlay';
  go.className = 'btn gold';
  go.textContent = 'PLAY';
  const later = document.createElement('button');
  later.id = 'shareChalLater';
  later.className = 'btn alt small';
  later.textContent = 'Not now';
  row.append(go, later);
  card.append(cv, h, beat, course, note, row);
  m.el.appendChild(card);
  function close(): void {
    setChallenge(null);
    m.close();
  }
  go.addEventListener('click', () => {
    m.close();
    if (c.stage === 'daily') setDailyCourse(c.seed ?? 1, c.theme ?? 'meadow');
    play(c.stage);
  });
  later.addEventListener('click', close);
  go.focus({ preventScroll: true });
}

/** decode a code and show the challenge card (or a toast when it is broken) */
export async function openChallengeCode(code: string): Promise<boolean> {
  const c = await decodeChallenge(code);
  if (!c) {
    toast('That challenge link is broken');
    return false;
  }
  let trailName = '';
  if (c.stage === 'trail') {
    const res = ugc.loadTrail(c.trail ?? '');
    if (!res.ok) {
      toast('That challenge link is broken');
      return false;
    }
    trailName = res.author ? `${res.name} by ${res.author}` : res.name;
  }
  setChallenge(c);
  showChallengeCard(c, trailName);
  return true;
}

/** registerShare: a ?c= link opens on the title */
export function openLinkFromUrl(): void {
  const code = readParams().get('c');
  if (code === null) return;
  clearParams(['c']);
  void openChallengeCode(code);
}
