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
  if (route.kind === 'dare') {
    void decodeGhost(route.ghost).then((g) => {
      if (!g) {
        showToast("That dare link is broken. Racing without the ghost.");
        return;
      }
      runner.set({ ghost: g, name: route.name, cat: route.cat });
      if (!runner.live && runner.matches()) {
        runner.onReset();
        if (runner.live) showBanner(`👻 Race ${route.name}'s ghost`);
      } else if (g.simVersion !== SIM_VERSION) showToast('That ghost is from another version of the game. Racing the same track without it.');
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
      if (runner.live) showBanner(`👻 Race ${runner.current?.name ?? 'the'}'s ghost`);
    },
  });

  // ------------------------------------------------------------------ clip
  const clipButton = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>('.fm-overlay [data-x="0"]');
  const setClipLabel = (text: string, busy: boolean) => {
    const b = clipButton();
    if (!b) return;
    b.textContent = text;
    b.classList.toggle('fm-busy', busy);
  };

  const cardShare = async (ctx: ResultContext, extra: string | null) => {
    const yc = yourCat();
    const accent = themeOf(ctx.cfg.track.theme).accent;
    const cv = drawResultCard({
      place: ctx.result.player.place,
      time: ctx.result.player.time,
      bestLap: ctx.result.player.bestLap,
      trackName: ctx.cfg.track.name,
      className: `${CLASSES[ctx.cfg.cls].name} ${CLASSES[ctx.cfg.cls].cc}`,
      catName: yc?.name ?? DEFAULT_CAT.name,
      face: yc?.face ?? null,
      linkLabel: linkLabel(),
      accent,
      extra,
    });
    const png = await canvasPng(cv);
    if (png) await shareImage(png, captionFor(ctx), 'formula-meow.png');
  };

  const captionFor = (ctx: ResultContext) =>
    `${clipCaption({ trackName: ctx.cfg.track.name, time: ctx.result.player.time, place: ctx.result.player.place, link: homeUrl(location) })}\n${PINK_PAW_SHARE_LINE}`;

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
              trackName: ctx.cfg.track.name,
              catName: yc?.name ?? DEFAULT_CAT.name,
              face: yc?.face ?? null,
              linkLabel: linkLabel(),
              accent: themeOf(ctx.cfg.track.theme).accent,
            },
            (p) => {
              st.progress = p;
              if (clip === st) setClipLabel(`🎬 Clip ${Math.round(p * 100)}%`, true);
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
        return { trackId: (t ?? ugc)!.id, cls: r.header.cls, seed: r.header.seed, modifiers: r.header.modifiers };
      }
      if (r.kind === 'daily') {
        const d = dailySetup(r.day, TRACKS);
        return { trackId: d.track.id, cls: d.cls, seed: d.seed, modifiers: d.modifiers };
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
      const ghostP = encodeGhost({ trackKey: trackKey(cfg.track.id), seed: cfg.seed, cls: cfg.cls, modifiers: cfg.modifiers, forgiving: cfg.forgiving, slot: me }, inputs);

      // dare outcome (recomputed ghost time)
      let beat: string | null = null;
      if (runner.live && runner.current) {
        const name = runner.current.name;
        const gt = runner.finishTime();
        const my = result.player.time;
        const iWon = my != null && (gt == null || my < gt);
        if (iWon) {
          beat = name;
          lines.push(gt != null ? `You beat ${name}'s ghost by ${(gt - my!).toFixed(2)} s!` : `You beat ${name}'s ghost!`);
        } else lines.push(gt != null && my != null ? `${name}'s ghost won by ${(my - gt).toFixed(2)} s. Again?` : `${name}'s ghost won. Again?`);
        const l = recordDuel(loadLedger(), name, iWon);
        saveLedger(l);
        const ll = ledgerLine(l, name);
        if (ll) lines.push(ll);
      }

      // daily cup
      const dayOf = [route.kind === 'daily' ? route.day : -1, today].find(
        (d) => d > 0 && isDailyRace(d, TRACKS, { trackId: cfg.track.id, seed: cfg.seed, cls: cfg.cls, modifiers: cfg.modifiers }),
      );
      let dailyAction: ResultAction;
      if (dayOf != null) {
        const rec = load<DailyRecord>('daily', EMPTY_DAILY);
        const laps = lapPlaces.length ? lapPlaces.slice() : [result.player.place];
        let ranked = dayOf === today && finished ? recordDaily(rec, { day: dayOf, place: result.player.place, time: result.player.time, laps }) : null;
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
          label: `📋 Share Daily #${dayOf}`,
          run: () => void shareText(dailyCardText({ day: dayOf, place: run.place, time: run.time, laps: run.laps, link: dailyUrl(location, dayOf), streak: rec.streak })),
        };
      } else {
        dailyAction = {
          id: 'daily',
          label: `🏆 Daily Cup #${today}`,
          run: () => {
            const d = dailySetup(today, TRACKS);
            shell.start({ track: d.track, cls: d.cls, seed: d.seed, modifiers: d.modifiers });
          },
        };
      }

      // 0: clip (index 0 is relied on by setClipLabel)
      actions.push({
        id: 'clip',
        label: webCodecsAvailable() ? '🎬 Clip…' : '🖼️ Share card',
        primary: true,
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
        label: beat ? '⚔️ Send revenge →' : finished ? `⚔️ Beat ${fmtRaceTime(result.player.time)} →` : '⚔️ Dare a friend',
        run: () =>
          void ghostP.then((ghost) => {
            const authored = TRACKS.some((x) => x.id === cfg.track.id);
            let trackCode: string | null = null;
            try {
              trackCode = authored ? null : (trackCodec()?.encode(cfg.track) ?? null);
            } catch {
              trackCode = null; // an unencodable track still gets a dare link; it just won't resolve the track
            }
            const url = dareUrl(location, { ghost, cat: yc?.cat ?? null, name: yc?.name ?? DEFAULT_CAT.name, trackCode });
            const text = dareText({ trackName: cfg.track.name, time: result.player.time, place: result.player.place, link: url, beat });
            return shareText(`${text}\n${PINK_PAW_SHARE_LINE}`);
          }),
      });
      // 2: daily
      actions.push(dailyAction);
      // 3: your cat
      actions.push({
        id: 'yourcat',
        label: yc ? `🐱 ${yc.name}` : '🐱 Put YOUR cat in',
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
        label: '🐾 Pink Paw payouts ↗',
        run: () => void window.open(SHELTER_PAYOUTS_URL, '_blank', 'noopener'),
      });

      startClip(ctx);
      return { actions, lines };
    },
  });
}
