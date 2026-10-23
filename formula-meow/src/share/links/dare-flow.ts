/**
 * Opening a dare link (iteration 4, F9). The shell has already put the dare's race on the grid (mode 'dare', the
 * default field) when the ghost decodes; this shows the full-screen challenge card over it, then starts the race the
 * player picked:
 *
 * - a ghost of this build (`duelable`): a 1v1 against the ghost only (one kart on the track; a time-trial ghost races a
 *   time trial), or, with "Race the pack" on, the old race in the default field. The ghost always replays in its own
 *   shadow world (`GhostRunner`, unchanged). The card shows the ghost's recomputed time (`traceGhost`), and during the
 *   race a pill shows the live gap to it from the same trace.
 * - an older ghost: the card says so and the race runs on the same track without it (a target-time race, as before).
 *
 * `?bot=1` (QA) taps the card by itself.
 */
import { DEFAULT_CAT, type RaceMode, type RacerInfo } from '../../types';
import { CLASSES } from '../../tuning';
import type { Shell, RaceRequest } from '../../core/app/shell';
import { buildField } from '../../items-ai';
import type { JuiceListener, FrameInfo } from '../../juice/bus';
import { displayName } from '../../ugc/actions';
import type { Ghost } from '../codec/ghost-codec';
import { yourCat } from '../yourcat/store';
import { showDareCard, GapPill } from './dare-card';
import { duelable, duelGap, traceGhost, type GhostTrace } from './duel';
import type { DareGhost } from './ghost-runner';

/** What the visible race is for a dare: its mode and field (pure, unit tested). */
export function dareRace(g: Pick<Ghost, 'simVersion' | 'mode' | 'slot'>, pack: boolean): { mode: RaceMode; solo: boolean } {
  if (!duelable(g)) return { mode: 'dare', solo: false };
  if (g.mode === 'tt') return { mode: 'tt', solo: true };
  return { mode: 'dare', solo: !pack };
}

const isBot = (): boolean => typeof location !== 'undefined' && new URLSearchParams(location.search).has('bot');

export class DareFlow implements JuiceListener {
  private trace: GhostTrace | null = null;
  private traceFor: Ghost | null = null;
  private tracing: Promise<GhostTrace | null> | null = null;
  private readonly pill: GapPill;
  /** the duel the shell is racing now (the race request we started), so a different race hides the pill */
  private duelReq: RaceRequest | null = null;

  constructor(
    private readonly shell: Shell,
    private readonly isLive: () => boolean,
    private readonly ghostName: () => string,
  ) {
    this.pill = new GapPill(shell.host);
  }

  /** The ghost's run, traced once per ghost (chunked: the card stays live while it runs). */
  traceOf(g: Ghost): Promise<GhostTrace | null> {
    if (this.traceFor === g && this.tracing) return this.tracing;
    this.traceFor = g;
    this.trace = null;
    const track = this.shell.setup?.track;
    if (!track) return Promise.resolve(null);
    this.tracing = traceGhost(g, track, { chunk: 600 })
      .catch(() => null)
      .then((tr) => {
        if (this.traceFor === g) this.trace = tr;
        return tr;
      });
    return this.tracing;
  }

  /** Show the card for `d` and start the race the player picks. Resolves once the race is started. */
  async open(d: DareGhost, notice: string | null): Promise<void> {
    const g = d.ghost;
    const setup = this.shell.setup;
    if (!setup) return;
    const duel = duelable(g) && !notice;
    const time = duel ? this.traceOf(g).then((tr) => (tr ? tr.finish : null)) : null;
    // the flyover plays behind the card for a second, then settles on the grid
    const settle = setTimeout(() => this.shell.camera.skip(), 1000);
    const card = showDareCard(this.shell.host, {
      name: d.name,
      trackName: displayName(setup.track),
      className: `${CLASSES[setup.cls].name} ${CLASSES[setup.cls].cc}`,
      tt: g.mode === 'tt',
      cat: d.cat,
      time,
      notice,
      auto: isBot() ? 1600 : 0,
    });
    const pick = await card;
    clearTimeout(settle);
    const now = this.shell.setup;
    if (!now || now.track.id !== setup.track.id) return;
    const race = dareRace(g, pick.pack);
    const yc = yourCat();
    const racers: RacerInfo[] | undefined = race.solo ? [buildField({ seed: g.seed, cls: g.cls, playerSlot: 0, playerName: yc?.name ?? 'You', playerCat: yc?.cat ?? DEFAULT_CAT })[0]] : undefined;
    const req: RaceRequest = { ...now, mode: race.mode, waitForInput: false, ...(racers ? { racers, playerSlot: 0 } : {}) };
    this.duelReq = duel ? req : null;
    this.shell.start(req);
  }

  onReset(): void {
    this.pill.hide();
    // the pill rides along in the dare's races (the duel, its rematches, the pack race), never in another race
    if (this.duelReq && this.isLive() && this.traceFor) this.pill.show(this.ghostName());
  }

  onFrame(info: FrameInfo): void {
    if (!this.pill.visible) return;
    if (!this.isLive()) {
      this.pill.hide();
      return;
    }
    const tr = this.trace;
    const k = info.st.karts[info.me];
    if (!tr || !k) return;
    if (k.finished) {
      this.pill.hide();
      return;
    }
    const gap = duelGap(tr, info.st.tick, k.dist);
    // a ghost that never finished (an old run replayed on this build) has no gap once its log ends
    if (gap == null && tr.finish == null && info.st.tick > tr.ticks) this.pill.stopped();
    else this.pill.update(gap, info.dt);
  }

  /** The live gap pill is up (it names the ghost, so the grid needs no "Race Zyg's ghost" banner as well). */
  get pillUp(): boolean {
    return this.pill.visible;
  }

  /** The results came up: the pill goes. */
  hidePill(): void {
    this.pill.hide();
  }
}
