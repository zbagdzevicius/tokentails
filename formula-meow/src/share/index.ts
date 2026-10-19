/**
 * Share lane entry (GDD 7–9, 13, 14): installs the ShareHooks and two JuiceBus listeners on the shell.
 *
 * - Your cat: the saved cat (coat + name) races in the player slot; its face decal goes on the player's driver.
 * - Dares: every finished race can send a ghost link; opening one races the challenger's ghost in lockstep, and the
 *   result says who won by how much (recomputed, never trusted), plus a device-only rivalry ledger.
 * - Finish clip: a 12 s vertical clip encoded after the race from the replay, shared with the native share sheet;
 *   the result card PNG is the fallback.
 * - Daily Cup: one seeded race a day (UTC), the first finish is the ranked run, a Wordle-style card to share.
 * - Pink Paw: honest copy only; one button to the shelter payouts page. The game moves no money.
 */
import { DEFAULT_CAT, SIM_VERSION, type RaceEvent } from '../types';
import { CLASSES } from '../tuning';
import type { Shell } from '../core/app/shell';
import { TRACKS } from '../core/track/tracks';
import { decalTexture, setFaceDecal } from '../core/render/face-decal-material';
import { themeOf } from '../core/track/themes';
import { load, save } from '../core/app/storage';
import { setShareHooks, type ResultAction, type ResultContext, type ResultExtras, type RouteSetup } from './hooks';
import { decodeGhost, encodeGhost, trackKey } from './codec/ghost-codec';
import { dailyUrl, dareUrl, homeUrl, parseRoute, SHELTER_PAYOUTS_URL, type Route } from './links/link';
import { GhostRunner } from './links/ghost-runner';
import { ledgerLine, loadLedger, recordDuel, saveLedger } from './links/rivalry';
import { shareClip, shareImage, showToast } from './links/share-sheet';
import { clipCaption, dailyCardText, dareText, fmtRaceTime, ordinalText, PINK_PAW_SHARE_LINE } from './cards/card-text';
import { canvasPng, drawResultCard } from './cards/result-card';
import { dailySetup, dayNoFor, EMPTY_DAILY, isDailyRace, recordDaily, type DailyRecord } from './daily/daily';
import { clearYourCat, initYourCat, saveYourCat, yourCat, type YourCat } from './yourcat/store';
import { webCodecsAvailable } from './clip/encoder-webcodecs';
import type { EncodedClip } from './clip/encoder-types';
import { trackCodec, trackFromLocation } from '../ugc/codec/track-codec';
import { displayName } from '../ugc/actions';
import type { TrackDef } from '../types';
import { focusNav } from '../ui/kit';
import './share.css';

type ClipState = { cancel: { cancelled: boolean }; progress: number; out: EncodedClip | null | 'failed'; wantShare: boolean };

/** Share text: native sheet, else the clipboard, else a prompt to copy by hand. Must run from a tap. */
async function shareText(text: string): Promise<void> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ text });
      return;
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
    }
  }
  try {
    await nav!.clipboard.writeText(text);
    showToast('Copied. Paste it to a friend');
    return;
  } catch {
    /* fall through */
  }
  window.prompt('Copy this and send it:', text);
}

/** The sender's name for dares: the saved cat's name, else a name asked once and kept on this device. */
function senderName(): string | null {
  const yc = yourCat();
  if (yc?.name) return yc.name;
  const n = load<string>('dareName', '');
  return n || null;
}

/** Ask once, inline, for the name a dare is sent under ("Race Žygis's ghost" gets the tap, "Tofu" does not). */
function askName(host: HTMLElement): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'fm-maker fm-dare-name';
    wrap.innerHTML = `
      <form class="fm-panel fm-sticker fm-maker-panel">
        <h2>Who is daring them?</h2>
        <label class="fm-maker-name">Your name <input name="n" maxlength="16" autocomplete="nickname" placeholder="Your name"></label>
        <p class="fm-line">Your friend sees "Race <i>your name</i>'s ghost".</p>
        <div class="fm-row-btns"><button class="fm-btn primary" type="submit">⚔️ Send dare</button><button class="fm-btn" type="button" data-skip>Skip</button></div>
      </form>`;
    wrap.setAttribute('data-ui-layer', '');
    host.appendChild(wrap);
    const input = wrap.querySelector('input')!;
    setTimeout(() => input.focus(), 50);
    let closed = false;
    // Esc (and pad B) skip, like the Skip button; other keys stay inside the form
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      done(null);
    };
    window.addEventListener('keydown', onEsc, true);
    wrap.addEventListener('keydown', (e) => e.stopPropagation());
    const stopNav = focusNav(wrap, { back: () => done(null), modal: true });
    const done = (v: string | null) => {
      if (closed) return;
      closed = true;
      stopNav();
      window.removeEventListener('keydown', onEsc, true);
      wrap.remove();
      resolve(v);
    };
    wrap.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = input.value.trim().slice(0, 16);
      if (n) save('dareName', n);
      done(n || null);
    });
    wrap.querySelector('[data-skip]')!.addEventListener('click', () => done(null));
  });
}

function linkLabel(): string {
  return homeUrl(location).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function installShare(shell: Shell): void {
  const route: Route = parseRoute(location);
  const runner = new GhostRunner(shell);
  const today = dayNoFor(new Date());
  let lapPlaces: number[] = [];
  let clip: ClipState | null = null;
  let banner: HTMLDivElement | null = null;
  let resultToken = 0;

  // ------------------------------------------------------------------ your cat
  const applyFace = (yc: YourCat | null) => {
    const w = shell.world;
    const v = shell.view;
    if (!w || !v) return;
    const me = w.cfg.humans[0] ?? 0;
    const t = yc?.face ? decalTexture(yc.face) : null;
    setFaceDecal(v.karts[me].cat.faceMat, t);
  };
  initYourCat((yc) => applyFace(yc));

  // ------------------------------------------------------------------ dares
  const showBanner = (text: string) => {
    banner?.remove();
    const b = document.createElement('div');
    b.className = 'fm-dare-banner';
    b.textContent = text;
    shell.host.appendChild(b);
    banner = b;
    setTimeout(() => b.classList.add('off'), 3800);
    setTimeout(() => b.remove(), 4400);
  };
  // B47: a dare that cannot be raced says so, on the grid as well as in a toast (a toast alone was gone before the
  // boot loader cleared, so the race looked like a plain Kitchen race)
  let notice: string | null = null;
  const tell = (msg: string) => {
    notice = msg;
    showToast(msg, 6000);
    if (shell.world) {
      showBanner(msg);
      notice = null;
    }
  };
  if (route.kind === 'dare-broken') tell('That dare link is broken or from an older version. Racing without the ghost.');
  if (route.kind === 'dare') {
    void decodeGhost(route.ghost).then((g) => {
      if (!g) {
        tell('That dare link is broken or from an older version. Racing without the ghost.');
        return;
      }
      runner.set({ ghost: g, name: route.name, cat: route.cat });
      if (!runner.live && runner.matches()) {
        runner.onReset();
        if (runner.live) showBanner(`👻 Race ${route.name}'s ghost`);
      } else if (g.simVersion !== SIM_VERSION) tell('That ghost is from another version of the game. Racing the same track without it.');
    });
  }

  // ------------------------------------------------------------------ bus: lap places, face, ghost
  shell.bus.add({
    onEvent(e: RaceEvent, info) {
      if (e.kart !== info.me) return;
      if (e.type === 'lap') lapPlaces.push(info.st.karts[info.me].place);
      if (e.type === 'finish') lapPlaces.push(e.a ?? info.st.karts[info.me].place);
    },
    onReset() {
      lapPlaces = [];
      if (clip) clip.cancel.cancelled = true;
      clip = null;
      const yc = yourCat();
      if (yc?.face) applyFace(yc);
    },
  });
  shell.bus.add(runner);
  shell.bus.add({
    onReset() {
      if (notice) {
        showBanner(notice);
        notice = null;
      } else if (runner.live) showBanner(`👻 Race ${runner.current?.name ?? 'the'}'s ghost`);
      // B36: a Daily Cup race says so on the grid
      else if (shell.setup?.mode === 'daily' && shell.setup.day) showBanner(`🏆 Daily Cup #${shell.setup.day}`);
    },
  });

  // ------------------------------------------------------------------ clip
  const clipButton = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>('.fm-overlay [data-x="0"]');
  /** B44: the clip button keeps a fixed width and shows its progress as a fill, never as changing text */
  const setClipLabel = (text: string, busy: boolean, progress = 1) => {
    const b = clipButton();
    if (!b) return;
    if (b.textContent !== text) b.textContent = text;
    b.classList.toggle('fm-busy', busy);
    b.style.setProperty('--p', `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`);
  };

  const cardShare = async (ctx: ResultContext, extra: string | null) => {
    const yc = yourCat();
    const accent = themeOf(ctx.cfg.track.theme).accent;
    const cv = drawResultCard({
      place: ctx.result.player.place,
      time: ctx.result.player.time,
      bestLap: ctx.result.player.bestLap,
      trackName: displayName(ctx.cfg.track),
      className: `${CLASSES[ctx.cfg.cls].name} ${CLASSES[ctx.cfg.cls].cc}`,
      catName: senderName() ?? DEFAULT_CAT.name,
      face: yc?.face ?? null,
      linkLabel: linkLabel(),
      accent,
      extra,
    });
    const png = await canvasPng(cv);
    if (png) await shareImage(png, captionFor(ctx), 'formula-meow.png');
  };

  /** the dare link for the run on the results screen (set once its ghost is encoded): captions point at it */
  let dareLink: string | null = null;
  const buildDare = (track: TrackDef, ghost: string, name: string | null) => {
    const authored = TRACKS.some((x) => x.id === track.id);
    let trackCode: string | null = null;
    try {
      trackCode = authored ? null : (trackCodec()?.encode(track) ?? null);
    } catch {
      trackCode = null; // an unencodable track still gets a dare link; it just won't resolve the track
    }
    return dareUrl(location, { ghost, cat: yourCat()?.cat ?? null, name: name ?? undefined, trackCode });
  };

  // the clip and the card are what spreads: their caption links to "race this exact run", not a cold start
  const captionFor = (ctx: ResultContext) =>
    `${clipCaption({ trackName: displayName(ctx.cfg.track), time: ctx.result.player.time, place: ctx.result.player.place, link: dareLink ?? homeUrl(location) })}\n${PINK_PAW_SHARE_LINE}`;

  const startClip = (ctx: ResultContext) => {
    if (!webCodecsAvailable()) {
      clip = { cancel: { cancelled: false }, progress: 1, out: 'failed', wantShare: false };
      setClipLabel('🖼️ Share card', false);
      return;
    }
    const st: ClipState = { cancel: { cancelled: false }, progress: 0, out: null, wantShare: false };
    clip = st;
    const yc = yourCat();
    setTimeout(() => {
      if (st.cancel.cancelled) return;
      void import('./clip/clip-job')
        .then((m) =>
          m.makeClip(
            {
              cfg: ctx.cfg,
              replay: ctx.replay,
              events: ctx.events,
              result: ctx.result,
              trackName: displayName(ctx.cfg.track),
              catName: senderName() ?? DEFAULT_CAT.name,
              face: yc?.face ?? null,
              linkLabel: linkLabel(),
              accent: themeOf(ctx.cfg.track.theme).accent,
            },
            (p) => {
              st.progress = p;
              if (clip === st) setClipLabel('🎬 Clip', true, p);
            },
            st.cancel,
          ),
        )
        .catch(() => null)
        .then((out) => {
          if (st.cancel.cancelled) return;
          st.out = out ?? 'failed';
          if (clip !== st) return;
          setClipLabel(out ? '🎬 Share clip' : '🖼️ Share card', false);
          if (st.wantShare) {
            st.wantShare = false;
            if (out) void shareClip(out.blob, captionFor(ctx));
            else void cardShare(ctx, null);
          }
        });
    }, 450);
  };

  // ------------------------------------------------------------------ hooks
  setShareHooks({
    playerRacer() {
      const yc = yourCat();
      return yc ? { name: yc.name, cat: yc.cat } : null;
    },

    resolveRoute(loc: Location): RouteSetup | null {
      const r = parseRoute(loc);
      if (r.kind === 'dare') {
        const t = TRACKS.find((x) => trackKey(x.id) === r.header.trackKey);
        // a dare on a UGC track carries the track code too (`t=`); the shell races that track, we supply the rest
        const shared = t ? null : trackFromLocation(loc);
        const ugc = shared?.ok && trackKey(shared.track.id) === r.header.trackKey ? shared.track : null;
        if (!t && !ugc) return null;
        return { trackId: (t ?? ugc)!.id, cls: r.header.cls, seed: r.header.seed, modifiers: r.header.modifiers, mode: 'dare' };
      }
      if (r.kind === 'daily') {
        // a future day is not out yet (it would spend that day's ranked run early): race today's instead
        const day = Math.min(r.day, today);
        const d = dailySetup(day, TRACKS);
        return { trackId: d.track.id, cls: d.cls, seed: d.seed, modifiers: d.modifiers, mode: 'daily', day };
      }
      return null;
    },

    onResult(ctx: ResultContext): ResultExtras {
      const { result, replay, cfg, events } = ctx;
      const me = cfg.humans[0] ?? 0;
      const lines: string[] = [];
      const actions: ResultAction[] = [];
      const yc = yourCat();
      const finished = result.player.time != null;

      // ghost of this run (deflated off the main path; ready long before the tap)
      const fin = events.find((e) => e.type === 'finish' && e.kart === me);
      const inputs = fin ? replay.inputs.slice(0, fin.tick + 2) : replay.inputs;
      const ghostP = encodeGhost(
        { trackKey: trackKey(cfg.track.id), seed: cfg.seed, cls: cfg.cls, modifiers: cfg.modifiers, forgiving: cfg.forgiving, slot: me, body: cfg.racers[me]?.kart.body ?? 0, mode: cfg.mode ?? 'race', rival: cfg.racers.findIndex((r, i) => i !== me && !!r.rival) },
        inputs,
      );
      // B49: a fast Again must not let this run's link leak into the next race's caption
      const token = ++resultToken;
      dareLink = null;
      void ghostP.then((g) => {
        if (g && token === resultToken) dareLink = buildDare(cfg.track, g, senderName());
      });
      let ghostRow: ResultExtras['ghost'];
      let later: ResultExtras['later'];

      // dare outcome (recomputed ghost time, B50: over a few frames, never on the results frame)
      let beat: string | null = null;
      const dareLive = runner.live && runner.matches();
      if (dareLive && runner.current) {
        const name = runner.current.name;
        const my = result.player.time;
        const outcome = (gt: number | null) => {
          const out: string[] = [];
          const iWon = my != null && (gt == null || my < gt);
          if (iWon) {
            beat = name;
            out.push(gt != null ? `You beat ${name}'s ghost by ${(gt - my!).toFixed(2)} s!` : `You beat ${name}'s ghost!`);
          } else out.push(gt != null && my != null ? `${name}'s ghost won by ${(my - gt).toFixed(2)} s. Again?` : `${name}'s ghost won. Again?`);
          const l = recordDuel(loadLedger(), name, iWon);
          saveLedger(l);
          const ll = ledgerLine(l, name);
          if (ll) out.push(ll);
          return out;
        };
        const now = runner.finishNow;
        if (now !== undefined) {
          ghostRow = { name, time: now };
          lines.push(...outcome(now));
        } else {
          ghostRow = { name, time: null };
          later = runner.finishTime().then((gt) => (token === resultToken ? { ghost: { name, time: gt }, lines: outcome(gt) } : null));
        }
      }

      // daily cup
      const dayOf = [route.kind === 'daily' ? Math.min(route.day, today) : -1, today].find(
        (d) => d > 0 && isDailyRace(d, TRACKS, { trackId: cfg.track.id, seed: cfg.seed, cls: cfg.cls, modifiers: cfg.modifiers }),
      );
      let dailyAction: ResultAction;
      if (dayOf != null) {
        const rec = load<DailyRecord>('daily', EMPTY_DAILY);
        const laps = lapPlaces.length ? lapPlaces.slice() : [result.player.place];
        let ranked = dayOf === today && finished ? recordDaily(rec, { day: dayOf, place: result.player.place, time: result.player.time, laps }) : null;
        const thisRun = ranked != null;
        if (ranked) {
          save('daily', rec);
          lines.unshift(`Daily Cup #${dayOf}: ranked run${rec.streak > 1 ? ` · ${rec.streak}-day streak` : ''}`);
        } else {
          ranked = rec.runs[String(dayOf)] ?? null;
          lines.unshift(ranked ? `Daily Cup #${dayOf}: practice (ranked run ${ordinalText(ranked.place)}, ${fmtRaceTime(ranked.time)})` : `Daily Cup #${dayOf}: practice`);
        }
        const run = ranked ?? { day: dayOf, place: result.player.place, time: result.player.time, laps };
        dailyAction = {
          id: 'daily-share',
          label: `📋 Daily #${dayOf}`,
          tier: 'icon',
          // the ranked run's ghost rides along (a dare link on the daily seed is the same race), so friends can race it
          run: () =>
            void shareText(
              dailyCardText({ day: dayOf, place: run.place, time: run.time, laps: run.laps, link: (thisRun && dareLink) || dailyUrl(location, dayOf), streak: rec.streak, ghost: !!(thisRun && dareLink) }),
            ),
        };
      } else {
        dailyAction = {
          id: 'daily',
          label: `🏆 Daily #${today}`,
          tier: 'icon',
          run: () => {
            const d = dailySetup(today, TRACKS);
            // B36: the Daily Cup has its own address (and banner / HUD tag through the race mode)
            try {
              history.replaceState(null, '', dailyUrl(location, today));
            } catch {
              /* sandboxed frames */
            }
            shell.start({ track: d.track, cls: d.cls, seed: d.seed, modifiers: d.modifiers, mode: 'daily', day: today });
          },
        };
      }

      // 0: clip (index 0 is relied on by setClipLabel)
      actions.push({
        id: 'clip',
        label: webCodecsAvailable() ? '🎬 Clip…' : '🖼️ Share card',
        run: () => {
          const c = clip;
          if (!c || c.out === 'failed') void cardShare(ctx, beat ? `Beat ${beat}'s ghost` : null);
          else if (c.out) void shareClip(c.out.blob, captionFor(ctx));
          else {
            c.wantShare = true;
            showToast(`Making your clip… ${Math.round(c.progress * 100)}%`);
          }
        },
      });
      // 1: dare
      actions.push({
        id: 'dare',
        label: beat ? '⚔️ Send revenge →' : '⚔️ Dare a friend',
        primary: true,
        run: () => {
          const send = (name: string | null) =>
            ghostP.then((ghost) => {
              const url = buildDare(cfg.track, ghost, name);
              dareLink = url;
              const text = dareText({ trackName: displayName(cfg.track), time: result.player.time, place: result.player.place, link: url, beat });
              return shareText(`${text}\n${PINK_PAW_SHARE_LINE}`);
            });
          const name = senderName();
          if (name) void send(name);
          else void askName(shell.host).then((n) => send(n));
        },
      });
      // 2: daily
      actions.push(dailyAction);
      // 3: your cat
      actions.push({
        id: 'yourcat',
        label: yc ? `🐱 ${yc.name}` : '🐱 Your cat',
        tier: 'icon',
        run: () =>
          void import('./yourcat/maker').then((m) =>
            m.openMaker(shell.host, yourCat(), DEFAULT_CAT).then((r) => {
              if (r === undefined) return;
              if (r === null) clearYourCat();
              else saveYourCat(r.cat, r.name, r.face);
              if (shell.setup) shell.start({ ...shell.setup });
            }),
          ),
      });
      // 4: Pink Paw (honest: a page that shows what has been paid to the shelter)
      actions.push({
        id: 'pinkpaw',
        label: '🐾 Pink Paw ↗',
        tier: 'icon',
        run: () => void window.open(SHELTER_PAYOUTS_URL, '_blank', 'noopener'),
      });

      startClip(ctx);
      // B48: only the dare's own race (and Daily Cup races) skip the class unlocks, not every race after a dare link
      const noUnlock = dareLive || dayOf != null;
      return { actions, lines, ghost: ghostRow, noUnlock, later };
    },
  });
}
