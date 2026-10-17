/**
 * Room Maker dev page (not shipped): http://localhost:5174/src/editor/dev.html
 *   ?speed=1   speed build (90 s)      ?admin=1   admin (every shell, Export JSON, no budget)
 *   ?r=<code>  remix a room code       ?auto=N    dev playtest answers N targets without asking
 * The playtest is a stub: the real run lives in the UI shell (W3). It asks how many targets you wrecked.
 */
import { content } from '../content';
import { codec } from '../codec';
import { render } from '../render';
import type { RoomMakerResult, RunResult } from '../types';
import { editor } from './index';
import type { RoomMakerDebug } from './RoomMaker';

declare global {
  interface Window {
    __bcEvents?: { event: string; props?: Record<string, unknown> }[];
    __bcResult?: RoomMakerResult;
    __bcMaker?: RoomMakerDebug;
  }
}

const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
window.__bcEvents = [];

function fakeRun(targets: number): RunResult {
  return { roomId: 'dev', mode: 'practice', simVersion: 5, score: 1200 * targets, stamp: 'clean', rank: 'dev', maxCombo: 1, seenCount: 0, targets, framed: 0, ticks: 2250, timeline: '', inputs: [], events: [], finalHash: 0 };
}

function askTargets(): Promise<RunResult | null> {
  const auto = q.get('auto');
  if (auto !== null) return Promise.resolve(fakeRun(Number(auto) | 0));
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'dev-modal';
    m.innerHTML = '<div class="dev-card"><h3>Dev playtest</h3><p>The real run is wired by the UI shell. How many targets did you wreck?</p><div class="row"></div></div>';
    const row = m.querySelector('.row')!;
    for (const n of [0, 1, 2, 3]) {
      const b = document.createElement('button');
      b.textContent = String(n);
      b.dataset.devTargets = String(n);
      b.onclick = () => {
        m.remove();
        resolve(fakeRun(n));
      };
      row.append(b);
    }
    const quit = document.createElement('button');
    quit.textContent = 'Quit';
    quit.onclick = () => {
      m.remove();
      resolve(null);
    };
    row.append(quit);
    document.body.append(m);
  });
}

const code = q.get('r');
const initial = code ? (codec.decodeRoom?.(code) ?? undefined) : undefined;

void editor
  .open(app, {
    render,
    content,
    codec,
    author: q.get('author') ?? '',
    initial,
    speedBuild: q.get('speed') === '1',
    admin: q.get('admin') === '1',
    playtest: () => askTargets(),
    linkFor: (room) => codec.buildLink({ room, ghosts: [] }, `${location.origin}/`),
    track: (event, props) => {
      window.__bcEvents!.push({ event, props });
      console.debug('[track]', event, props);
    },
    onExit: () => undefined,
    onReady: (api: RoomMakerDebug) => {
      window.__bcMaker = api;
    },
  } as Parameters<typeof editor.open>[1])
  .then((res) => {
    window.__bcResult = res;
    const m = document.createElement('div');
    m.className = 'dev-modal';
    const card = document.createElement('div');
    card.className = 'dev-card';
    card.innerHTML = `<h3>${res.kind}</h3>`;
    if (res.link) {
      const a = document.createElement('a');
      a.href = res.link;
      a.textContent = res.link;
      a.dataset.devLink = '1';
      card.append(a);
      if (res.card) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(res.card);
        img.style.cssText = 'width:100%;margin-top:8px;border-radius:8px';
        card.append(img);
      }
    }
    const again = document.createElement('button');
    again.textContent = 'Build another';
    again.onclick = () => location.reload();
    card.append(document.createElement('br'), again);
    m.append(card);
    document.body.append(m);
  });
