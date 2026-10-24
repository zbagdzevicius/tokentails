// TRAILS lane entry (ITERATION2.md 6.6): the Trail Maker (blocks, editor, validation, test runs, ?t= links).
// src/ugc/index.ts calls registerTrails() once, after the menus exist and a stage is prepared (before SHARE, which
// may load a trail carried by a ?c= challenge through ugc.loadTrail).
import { events } from '../core/events';
import { callout } from '../core/hud';
import { game } from '../core/state';
import * as session from '../core/session';
import { exposeTestHook, provide } from '../ugc/contract';
import { addButton } from '../ugc/hub';
import { linkWith } from '../ugc/sharekit';
import { lastRunResult } from '../ui/flow';
import { decodeTrail, encodeTrail, type Trail } from './code';
import { IC } from './icons';
import { closeTrailLink, handleTrailParam, showTrailLink } from './link';
import { closeMaker, initMaker, makerCheck, makerDraft, makerView, openEditor, openMaker, shareTrail } from './maker';
import { currentCode, currentTrail, findMine, install, loadTrail, mine, recordTrailRun } from './store';
import { randomTrail, STARTER, validateTrail } from './validate';
import './trails.css';

const lastWasTrail = (): boolean => lastRunResult()?.stageId === 'trail';

export function registerTrails(): void {
  // the 'trail' stage always exists (the starter course until the player loads one)
  install(STARTER);
  provide({ loadTrail, currentTrailCode: () => currentCode() });
  initMaker();

  addButton({ id: 'ugcTrails', slot: 'title', label: 'TRAIL MAKER', icon: IC.maker, order: 30, onClick: openMaker });
  addButton({ id: 'ugcTrailsCard', slot: 'select', label: 'TRAIL MAKER', icon: IC.maker, order: 20, onClick: openMaker });
  addButton({
    id: 'ugcTrailShare',
    slot: 'results',
    label: 'SHARE TRAIL',
    icon: IC.share,
    order: 40,
    tone: 'green',
    visible: () => lastWasTrail() && !!lastRunResult()?.finished,
    onClick: () => shareTrail(currentCode(), currentTrail().name),
  });
  addButton({
    id: 'ugcTrailEdit',
    slot: 'results',
    label: 'EDIT TRAIL',
    icon: IC.edit,
    order: 45,
    tone: 'alt',
    visible: lastWasTrail,
    onClick: () => {
      const code = currentCode();
      openEditor(currentTrail(), findMine(code) ? code : null);
    },
  });

  // a trail has no bells: the HUD hides the bell row for every stage with bells === 0 (body.nobells); this class
  // stays for trail-only styling
  events.on('stageLoad', ({ stage }) => document.body.classList.toggle('trails-run', stage.id === 'trail'));
  // the trail's name as the opening callout (a friend's trail announces itself)
  events.on('stageStart', ({ stage, at }) => {
    if (stage.id === 'trail' && at === 0) setTimeout(() => game.mode === 'play' && game.stage?.id === 'trail' && callout(stage.name, 'info'), 600);
  });
  events.on('stageEnd', ({ result }) => {
    if (result.stageId === 'trail') recordTrailRun(result.score, result.finished);
  });

  handleTrailParam();

  exposeTestHook('trails', {
    open: openMaker,
    close: () => {
      closeTrailLink();
      closeMaker();
    },
    encode: (t: Trail) => encodeTrail(t),
    decode: (s: string) => decodeTrail(s),
    validate: (t: Trail) => validateTrail(t),
    random: (seed: number) => randomTrail(seed),
    load: (code: string) => loadTrail(code),
    current: (): string | null => currentCode(),
    // extras for the shots
    link: (code?: string) => linkWith({ t: code ?? currentCode() }),
    showLink: (code: string) => showTrailLink(code),
    edit: (t: Trail) => openEditor(t, findMine(encodeTrail(t)) ? encodeTrail(t) : null),
    state: () => {
      const c = makerCheck();
      return { view: makerView(), draft: makerDraft(), check: c && { ok: c.ok, errors: c.errors, length: c.length, seconds: c.seconds, difficulty: c.difficulty }, mine: mine(), mode: game.mode };
    },
    quit: () => {
      if (game.stage) session.quit();
    },
  });
}
