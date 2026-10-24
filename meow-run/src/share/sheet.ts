// The share sheet and the name prompt (SHARE lane). The card PNG is built as soon as the results show, the compact
// challenge link right after, so every button calls shareOrDownload straight from its click (iOS user gesture).
import { stages } from '../core/registry';
import type { RunResult } from '../core/types';
import { sanitizeName, NAME_MAX } from '../meta/save';
import { lastRunResult, save, setSave } from '../ui/flow';
import { fmtInt } from '../ui/format';
import { ugc } from '../ugc/contract';
import { toast } from '../ugc/hub';
import { copyText, fileStem, shareBase, shareOrDownload, type ShareOutcome } from '../ugc/sharekit';
import { decodeLook } from '../wardrobe/look';
import { active } from './active';
import { cardBlob, type CardInfo } from './card';
import { dayLabel } from './daily';
import { dailyCfg, isTodayDaily } from './dailystage';
import { challengeUrl, playerName, prepareLink } from './links';
import { lastFinished } from './record';
import { button, el, modal } from './ui';

export const FAN = 'A Mochi fan';

// ---------------------------------------------------------------- name
/** while typing: drop what sanitizeName would drop, but keep a trailing space (the final value is sanitised) */
const liveName = (v: string) =>
  v
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^ /, '')
    .slice(0, NAME_MAX);

function storeName(n: string): void {
  setSave({ ...save, player: { ...save.player, name: n } });
}

let asking: Promise<string> | null = null;
/** ugc.askName: the saved name, or a prompt when none is set (force = always prompt, e.g. the name chip) */
export function askName(force = false): Promise<string> {
  if (!force && playerName()) return Promise.resolve(playerName());
  if (asking) return asking;
  asking = new Promise<string>((resolve) => {
    const done = (v: string | null) => {
      m.close();
      asking = null;
      if (v !== null) storeName(v);
      resolve(v ?? playerName());
    };
    const m = modal('share-name', { onEsc: () => done(force ? null : ''), onEnter: () => done(sanitizeName(input.value)) });
    const card = el('div', 'card share-name-card');
    const h = el('h2', '', force ? 'Your name' : "What's your name?");
    const p = el('p', 'share-name-sub', 'It goes on your cards and challenge links.');
    const input = document.createElement('input');
    input.id = 'shareNameInput';
    input.type = 'text';
    input.maxLength = NAME_MAX;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.enterKeyHint = 'done';
    input.placeholder = FAN;
    input.value = playerName();
    input.setAttribute('aria-label', 'Your name');
    input.addEventListener('input', () => {
      const v = liveName(input.value);
      if (v !== input.value) input.value = v;
    });
    const row = el('div', 'row');
    row.append(
      button('shareNameOk', 'btn gold', 'OK', () => done(sanitizeName(input.value))),
      button('shareNameSkip', 'btn alt small', force ? 'Cancel' : 'Skip', () => done(force ? null : '')),
    );
    card.append(h, p, input, row);
    m.el.appendChild(card);
    // phones: focusing opens the keyboard, which is what the player wants here
    setTimeout(() => input.focus({ preventScroll: true }), 30);
  });
  return asking;
}

// ---------------------------------------------------------------- the card for the last run
let built: { result: RunResult; name: string; blob: Promise<Blob> } | null = null;

function cardInfo(r: RunResult): CardInfo {
  const st = stages.has(r.stageId) ? stages.get(r.stageId) : null;
  const run = lastFinished();
  const c = active.challenge;
  const kind: CardInfo['kind'] = r.stageId === 'trail' ? 'trail' : r.stageId === 'endless' || r.stageId === 'daily' ? 'distance' : 'stars';
  let style = { bestChain: 0, tricks: 0, stylePoints: 0, rank: '' as CardInfo['style']['rank'] };
  try {
    style = ugc.styleSummary();
  } catch {
    /* STYLE default */
  }
  const prev = r.stageId === 'endless' ? save.endlessBest.score : r.stageId === 'daily' ? save.daily.best : (save.stages[r.stageId]?.best ?? 0);
  return {
    stage: r.stageId === 'daily' && isTodayDaily() ? `Daily Run · ${dayLabel(dailyCfg.day)}` : st ? st.name : 'Meow Run',
    score: r.score,
    kind,
    stars: r.stars,
    distance: r.distance,
    trailName: st?.name ?? '',
    look: run?.result === r ? decodeLook(run.look) : ugc.currentLook(),
    name: playerName() || FAN,
    style,
    sticker: c && active.won ? `BEAT ${(c.name || 'THEM').toUpperCase()}!` : '',
    best: r.score > 0 && r.score >= prev && (r.finished || kind === 'distance'),
  };
}

/** (re)build the card for the last run when the results show or the name changes */
export function buildCard(): Promise<Blob> | null {
  const r = lastRunResult();
  if (!r) return null;
  const name = playerName();
  if (built && built.result === r && built.name === name) return built.blob;
  const blob = cardBlob(cardInfo(r));
  blob.catch(() => {});
  built = { result: r, name, blob };
  return blob;
}

// ---------------------------------------------------------------- the sheet
function bumpShares(o: ShareOutcome): void {
  if (o === 'shared' || o === 'downloaded' || o === 'copied') setSave({ ...save, ugcStats: { ...save.ugcStats, shares: save.ugcStats.shares + 1 } });
  const msg: Record<ShareOutcome, string> = { shared: 'Shared!', downloaded: 'Saved to your downloads', copied: 'Link copied!', cancelled: '', failed: "Couldn't share that" };
  if (msg[o]) toast(msg[o]);
}

let sheetOpen = false;
/** the player skipped the name prompt this session: don't ask on every share */
let skipped = false;
export const isSheetOpen = () => sheetOpen;

export async function openShareSheet(): Promise<void> {
  const r = lastRunResult();
  if (!r || sheetOpen) return;
  sheetOpen = true;
  if (!playerName() && !skipped && !(await askName())) skipped = true;
  let blob: Blob | null = null;
  let link: string | null = challengeUrl(r);
  let url = '';
  const m = modal('share-sheet', { onEsc: () => close() });
  const card = el('div', 'card share-sheet-card');
  const sendBack = !!active.challenge && active.won !== null;
  const h = el('h2', '', sendBack ? (active.won ? 'Send it back!' : 'Ask for a rematch') : 'Share your run');
  const prev = el('div', 'share-prev');
  const img = document.createElement('img');
  img.alt = 'Your Meow Run share card';
  prev.appendChild(img);
  const chip = button('shareNameChip', 'share-chip', '', () => {
    void askName(true).then(() => refresh(true));
  });
  chip.setAttribute('aria-label', 'Change your name');
  const chipName = el('span', 'share-chip-name');
  const chipEdit = el('span', 'share-chip-edit', 'EDIT');
  chip.append(el('span', 'share-chip-pre', 'Playing as'), chipName, chipEdit);

  const scoreTxt = fmtInt(r.score);
  const challengeBtn = button('shareChallenge', 'btn gold', 'CHALLENGE A FRIEND', () => {
    if (!link) return;
    void shareOrDownload({ title: 'Meow Run', text: `Beat my ${scoreTxt} in Meow Run!`, url: link }).then(bumpShares);
  });
  const cardBtn = button('shareCard', 'btn', 'SHARE CARD', () => {
    if (!blob) {
      toast('The card is almost ready...');
      return;
    }
    const file = new File([blob], `${fileStem('card')}.png`, { type: 'image/png' });
    void shareOrDownload({ file, title: 'Meow Run', text: `Can you beat my ${scoreTxt} in Meow Run?`, url: link ?? shareBase() }).then(bumpShares);
  });
  const copyBtn = button('shareCopy', 'btn alt small', 'COPY LINK', () => {
    void copyText(link ?? shareBase()).then((ok) => bumpShares(ok ? 'copied' : 'failed'));
  });
  const clipBtn = button('shareClip', 'btn alt small', 'SAVE CLIP', () => {
    close();
    ugc.openClip();
  });
  const closeBtn = button('shareClose', 'btn alt small', 'CLOSE', () => close());
  const main = el('div', 'share-actions');
  main.append(challengeBtn, cardBtn);
  const more = el('div', 'row share-more');
  more.append(copyBtn, clipBtn, closeBtn);
  card.append(h, prev, chip, main, more);
  m.el.appendChild(card);

  let clipOk = false;
  try {
    clipOk = ugc.clipReady();
  } catch {
    clipOk = false;
  }
  clipBtn.classList.toggle('hidden', !clipOk);

  let gen = 0;
  function refresh(nameChanged: boolean): void {
    const my = ++gen;
    chipName.textContent = playerName() || FAN;
    link = challengeUrl(r!);
    challengeBtn.classList.toggle('hidden', !link);
    copyBtn.textContent = link ? 'COPY LINK' : 'COPY GAME LINK';
    if (nameChanged) {
      blob = null;
      prev.classList.add('busy');
    }
    const bp = buildCard();
    bp?.then((b) => {
      if (my !== gen) return;
      blob = b;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(b);
      img.src = url;
      prev.classList.remove('busy');
    }).catch(() => toast("Couldn't draw the card"));
    void prepareLink(r!).then((l) => {
      if (my === gen && l) link = l;
    });
  }
  function close(): void {
    if (!sheetOpen) return;
    sheetOpen = false;
    gen++;
    m.close();
    setTimeout(() => url && URL.revokeObjectURL(url), 1000);
  }
  prev.classList.add('busy');
  refresh(false);
  challengeBtn.focus({ preventScroll: true });
}
