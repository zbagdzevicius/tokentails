/** Styles for the level select and the results-screen campaign strip (own <style> tag). */
import { HEIST_BODY_FONT } from '../fonts.generated';

const OL = 'var(--ch-ol, #2a0f1f)';
const COIN = 'var(--ch-coin, #ffcc55)';

// claim:fiction CSS, not copy: '@supports' and similar tokens are selectors, not impact claims
const CSS = `
.ch-lv { position: absolute; inset: 0; display: none; flex-direction: column; pointer-events: auto; overflow: hidden;
  padding: calc(12px + var(--ch-sat, 0px)) calc(16px + var(--ch-sar, 0px)) calc(12px + var(--ch-sab, 0px)) calc(16px + var(--ch-sal, 0px));
  background: radial-gradient(ellipse 120% 80% at 50% 0%, #4b1d6e 0%, #301934 45%, #0b0820 100%); color: var(--ch-cream, #fcecbb); }
.ch-lv.ch-on { display: flex; animation: ch-lv-in .3s ease-out both; }
@keyframes ch-lv-in { from { opacity: 0; } to { opacity: 1; } }
.ch-lv-head { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; min-width: 0; }
.ch-lv-head > div { min-width: 0; }
.ch-lv-head h2 { margin: 0; font-size: clamp(22px, 4vmin, 34px); color: ${COIN};
  text-shadow: 0 3px 0 ${OL}, 2px 0 0 ${OL}, -2px 0 0 ${OL}; }
.ch-lv-head .ch-lv-sub { margin: 2px 0 0; font: 600 14px/1.3 ${HEIST_BODY_FONT}; opacity: .88; }
.ch-lv-total { margin-left: auto; flex: 0 0 auto; display: flex; align-items: center; gap: 6px; font-size: 18px; padding: 6px 12px;
  border: 3px solid ${OL}; border-radius: 12px; background: rgba(11,8,32,.55); }
.ch-lv-total .ch-svg, .ch-lv-stars .ch-on { color: ${COIN}; }
.ch-lv-body { flex: 1 1 auto; min-height: 0; display: flex; gap: 16px; margin-top: 12px; }
.ch-lv-mapwrap { position: relative; flex: 1 1 auto; min-width: 0; overflow: auto; -webkit-overflow-scrolling: touch; container-type: size; }
.ch-lv-map { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: auto;
  gap: clamp(14px, 3vmin, 30px); padding: 12px 28px 20px; min-height: 100%; box-sizing: border-box; align-content: center; }
.ch-lv-path { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.ch-lv-path path { fill: none; stroke-width: 9; stroke-linecap: round; stroke-dasharray: .1 16; }
.ch-lv-path .ch-lv-open { stroke: ${COIN}; }
.ch-lv-path .ch-lv-shut { stroke: rgba(153,102,204,.45); }

/* ---- cards ---- */
.ch-lv-card { position: relative; z-index: 1; grid-column: var(--c4); grid-row: var(--r4); align-self: center;
  display: flex; flex-direction: column; align-items: stretch; gap: 6px; text-align: left; cursor: pointer;
  padding: 7px 7px 9px; border: 3px solid ${OL}; border-radius: 18px; min-height: 44px; min-width: 0;
  background: linear-gradient(180deg, rgba(86,46,110,.96), rgba(48,25,58,.96)); color: inherit; font: inherit;
  box-shadow: 0 5px 0 ${OL}, 0 10px 22px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.2);
  transform: perspective(800px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateY(var(--lift, 0px));
  transition: transform .18s ease, box-shadow .15s ease, border-color .15s ease; -webkit-tap-highlight-color: transparent; }
.ch-lv-card:hover:not([disabled]) { --lift: -3px; }
.ch-lv-card:active:not([disabled]) { --lift: 1px; }
.ch-lv-card:focus-visible { outline: 3px solid var(--ch-cream, #fcecbb); outline-offset: 3px; }
.ch-lv-card[aria-current="true"] { border-color: ${COIN}; box-shadow: 0 5px 0 ${OL}, 0 0 0 4px rgba(255,204,85,.35), 0 0 28px rgba(255,204,85,.25), 0 10px 22px rgba(0,0,0,.35); }
.ch-lv-card[disabled] { cursor: not-allowed; background: linear-gradient(180deg, rgba(64,40,82,.92), rgba(36,20,46,.94)); }

.ch-lv-media { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 12px;
  border: 2px solid ${OL}; background: #1a1030; isolation: isolate; }
/* Grid layout: the stills grow into the free height (two rows), from 16:9 up to 5:4 of the card width.
   Card width = (map width - side padding - 3 gaps) / 4; the card's chrome below the still is ~90px. */
@supports (height: 1cqh) {
  .ch-lv-media { --cw: calc((100cqw - 56px - 3 * clamp(14px, 3vmin, 30px)) / 4 - 18px); aspect-ratio: auto;
    height: clamp(calc(var(--cw) * .5625), calc((100cqh - 32px - clamp(14px, 3vmin, 30px)) / 2 - 92px), calc(var(--cw) * .8)); }
}
.ch-lv-media::before { content: ''; position: absolute; inset: -8px; background: var(--lqip, linear-gradient(135deg, #3b1f52, #1a1030)) center / cover no-repeat;
  filter: blur(6px) saturate(1.1); z-index: 0; }
.ch-lv-media[data-state="loading"]::after { content: ''; position: absolute; inset: 0; z-index: 1;
  background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.12) 50%, transparent 70%) -100% 0 / 200% 100% no-repeat; animation: ch-lv-shimmer 1.2s linear infinite; }
@keyframes ch-lv-shimmer { to { background-position: 100% 0; } }
.ch-lv-thumb, .ch-lv-loop { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; z-index: 1;
  transform: scale(1.06) translate(var(--px, 0px), var(--py, 0px)); transition: opacity .35s ease, transform .2s ease, filter .2s ease; }
.ch-lv-thumb { opacity: 0; }
.ch-lv-media[data-state="ready"] .ch-lv-thumb { opacity: 1; }
.ch-lv-loop { opacity: 0; z-index: 2; pointer-events: none; }
.ch-lv-loop.ch-on { opacity: 1; }
.ch-lv-shade { position: absolute; inset: 0; z-index: 3; pointer-events: none;
  background: linear-gradient(180deg, rgba(11,8,32,.35) 0%, transparent 32%, transparent 62%, rgba(11,8,32,.55) 100%); }
.ch-lv-num { position: absolute; z-index: 4; top: 6px; left: 6px; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
  font-size: 17px; line-height: 1; background: ${COIN}; color: ${OL}; border: 3px solid ${OL}; box-shadow: 0 2px 0 ${OL}; }
.ch-lv-card[data-won="true"] .ch-lv-num { background: var(--ch-mint, #d5f4e5); }
.ch-lv-card[disabled] .ch-lv-num { background: #6b5a78; }
.ch-lv-avatar { position: absolute; z-index: 4; right: 6px; bottom: 6px; width: 40px; height: 40px; border-radius: 50%; overflow: hidden;
  border: 3px solid ${COIN}; box-shadow: 0 2px 0 ${OL}, 0 0 0 2px ${OL}; background: #3b1f52; }
.ch-lv-avatar-in { display: block; width: 100%; height: 100%; }
.ch-lv-avatar-in img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ch-lv-avatar-in .ch-svg { display: block; margin: 8px auto; font-size: 18px; color: var(--ch-lilac, #f0c5fd); }
.ch-lv-lockover { position: absolute; z-index: 4; inset: 0; display: none; place-items: center; pointer-events: none; }
.ch-lv-lockover .ch-svg { width: 44px; height: 44px; padding: 10px; box-sizing: border-box; border-radius: 50%; font-size: 22px;
  background: rgba(11,8,32,.72); color: var(--ch-cream, #fcecbb); border: 3px solid ${OL}; box-shadow: 0 0 0 2px rgba(252,236,187,.35); }
.ch-lv-card[disabled] .ch-lv-lockover { display: grid; }
.ch-lv-card[disabled] .ch-lv-thumb { filter: grayscale(.75) brightness(.55) blur(.6px); }
.ch-lv-card[disabled] .ch-lv-avatar { filter: grayscale(.4) brightness(.8); border-color: #9b86ad; }

.ch-lv-info { display: flex; flex-direction: column; gap: 3px; padding: 0 4px; min-width: 0; }
.ch-lv-name { font-size: 17px; line-height: 1.1; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow-wrap: anywhere; }
.ch-lv-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ch-lv-row { flex-wrap: wrap; row-gap: 2px; }
.ch-lv-best, .ch-lv-lock { font: 600 12px/1.2 ${HEIST_BODY_FONT}; opacity: .85; min-width: 0; }
.ch-lv-card[disabled] .ch-lv-info { opacity: .72; }
.ch-lv-stars { display: flex; gap: 2px; font-size: 16px; color: rgba(252,236,187,.28); flex: 0 0 auto; }
.ch-lv-stars .ch-svg { font-size: inherit; }

/* ---- brief panel ---- */
.ch-lv-detail { flex: 0 0 min(370px, 36%); display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  border: 3px solid ${OL}; border-radius: 20px; background: linear-gradient(180deg, rgba(86,46,110,.94), rgba(34,16,44,.96));
  box-shadow: 0 6px 0 ${OL}, 0 18px 40px rgba(0,0,0,.4); }
.ch-lv-hero { position: relative; flex: 0 0 auto; aspect-ratio: 16 / 8; overflow: hidden; background: #1a1030; isolation: isolate; border-bottom: 3px solid ${OL}; }
.ch-lv-hero::before { content: ''; position: absolute; inset: -8px; background: var(--lqip, linear-gradient(135deg, #3b1f52, #1a1030)) center / cover no-repeat; filter: blur(6px); }
.ch-lv-hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .35s ease; }
.ch-lv-hero[data-state="ready"] img { opacity: 1; animation: ch-lv-kb 14s ease-in-out infinite alternate; }
@keyframes ch-lv-kb { from { transform: scale(1.02); } to { transform: scale(1.12) translate(-2%, -1%); } }
.ch-lv-hero .ch-lv-shade { background: linear-gradient(180deg, transparent 35%, rgba(20,8,30,.88) 100%); }
.ch-lv-herotext { position: absolute; z-index: 4; left: 14px; right: 14px; bottom: 10px; }
.ch-lv-kick { display: block; font-size: 13px; color: var(--ch-lilac, #f0c5fd); letter-spacing: .04em; }
.ch-lv-hero h3 { margin: 0; font-size: clamp(22px, 2.4vw, 28px); line-height: 1.05; color: ${COIN};
  text-shadow: 0 3px 0 ${OL}, 2px 0 0 ${OL}, -2px 0 0 ${OL}; }
.ch-lv-dbody { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px 8px; }
.ch-lv-dbody[data-more="true"] { -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 34px), transparent); mask-image: linear-gradient(180deg, #000 calc(100% - 34px), transparent); }
.ch-lv-dbody > * { flex: 0 0 auto; }
.ch-lv-intro { margin: 0; font: 600 14px/1.38 ${HEIST_BODY_FONT}; }
.ch-lv-facts { display: flex; flex-wrap: wrap; gap: 6px; font: 700 12px/1 ${HEIST_BODY_FONT}; }
.ch-lv-facts > span { display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; border-radius: 999px; background: rgba(11,8,32,.45); border: 1px solid rgba(252,236,187,.18); }
.ch-lv-facts .ch-svg { font-size: 13px; color: ${COIN}; }
.ch-lv-rules { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.ch-lv-rules li { display: flex; align-items: flex-start; gap: 8px; }
.ch-lv-rules li .ch-svg { font-size: 18px; color: rgba(252,236,187,.3); flex: 0 0 auto; }
.ch-lv-rules li.ch-on .ch-svg { color: ${COIN}; }
.ch-lv-rules b { display: block; font-weight: normal; color: var(--ch-cream, #fcecbb); }
.ch-lv-rules small { opacity: .75; font-family: ${HEIST_BODY_FONT}; font-weight: 600; }
.ch-lv-gowrap { flex: 0 0 auto; padding: 8px 14px 14px; }
.ch-lv-go { width: 100%; }

/* ---- the real cat ---- */
.ch-lv-rc { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 16px;
  background: linear-gradient(180deg, rgba(213,244,229,.14), rgba(213,244,229,.05)); border: 2px dashed var(--ch-mint, #d5f4e5); }
.ch-lv-rc-pics { position: relative; flex: 0 0 auto; display: flex; align-items: center; }
.ch-lv-rc-photo { position: relative; display: block; width: 74px; height: 98px; border-radius: 12px; overflow: hidden; flex: 0 0 auto;
  border: 3px solid ${OL}; background: linear-gradient(135deg, #5a3a72, #2a1638); box-shadow: 0 3px 0 ${OL}; transform: rotate(-3deg); }
.ch-lv-rc-photo img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity .3s ease; }
.ch-lv-rc-photo[data-state="ready"] img { opacity: 1; }
.ch-lv-rc-photo[data-state="loading"]::after, .ch-lv-res-photo[data-state="loading"]::after { content: ''; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.14) 50%, transparent 70%) -100% 0 / 200% 100% no-repeat; animation: ch-lv-shimmer 1.2s linear infinite; }
.ch-lv-rc-photo > .ch-svg { display: block; margin: 34px auto; font-size: 24px; color: var(--ch-lilac, #f0c5fd); }
.ch-lv-rc-link { position: relative; z-index: 2; display: grid; place-items: center; width: 26px; height: 26px; margin: 0 -9px; border-radius: 50%;
  background: var(--ch-pink, #ff8fb1); color: ${OL}; border: 3px solid ${OL}; font-size: 13px; }
.ch-lv-rc-sprite { display: grid; place-items: center; width: 74px; height: 98px; border-radius: 12px; border: 3px solid ${OL}; box-shadow: 0 3px 0 ${OL};
  background: radial-gradient(circle at 50% 70%, rgba(255,204,85,.35), transparent 60%), linear-gradient(180deg, #4b2a63, #2a1638); transform: rotate(3deg); }
.ch-lv-rc-sprite canvas { width: 72px; height: 72px; image-rendering: pixelated; filter: drop-shadow(0 3px 0 rgba(42,15,31,.6)); }
.ch-lv-rc-text { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 0; }
.ch-lv-rc-kick { font-size: 12px; color: var(--ch-mint, #d5f4e5); letter-spacing: .05em; }
.ch-lv-rc-name { font-weight: normal; font-size: 24px; line-height: 1; color: var(--ch-cream, #fcecbb); text-shadow: 0 2px 0 ${OL}; overflow-wrap: anywhere; }
.ch-lv-body-font { font-family: ${HEIST_BODY_FONT}; font-weight: 800; }
/* A letter the display face lacks (ė, č, ą, ū): its base letter in the display face, the mark drawn
   on top, the real letter kept (invisible) in the DOM for text and screen readers. */
.ch-dia { position: relative; display: inline-block; }
.ch-dia::before { content: attr(data-base); }
.ch-dia-ch { display: inline-block; width: 0; overflow: hidden; vertical-align: top; color: transparent; text-shadow: none; }
.ch-dia::after { content: ''; position: absolute; left: 50%; background: currentColor; box-shadow: 0 .06em 0 ${OL}; pointer-events: none; }
.ch-dia-dot::after { width: .17em; height: .17em; border-radius: .05em; top: .08em; transform: translateX(-50%); }
.ch-dia-dot.ch-dia-up::after { top: -.16em; }
.ch-dia-macron::after { width: .42em; height: .1em; border-radius: .05em; top: .14em; transform: translateX(-50%); }
.ch-dia-macron.ch-dia-up::after { top: -.1em; }
.ch-dia-caron::after { width: .2em; height: .2em; top: .02em; background: none; box-shadow: none; border: solid currentColor; border-width: 0 .08em .08em 0; transform: translateX(-50%) rotate(45deg); }
.ch-dia-caron.ch-dia-up::after { top: -.24em; }
.ch-dia-ogonek::after { width: .16em; height: .2em; top: auto; bottom: -.12em; left: 58%; background: none; box-shadow: none; border: solid currentColor; border-width: 0 0 .08em .08em; border-radius: 0 0 0 .14em; }
.ch-lv-rc-chip { display: inline-block; padding: 3px 8px; border-radius: 999px; font: 800 11px/1.2 ${HEIST_BODY_FONT};
  background: ${COIN}; color: ${OL}; border: 2px solid ${OL}; }
.ch-lv-rc-chip[data-status="RECOVERING"] { background: var(--ch-sky, #c4e2fc); }
.ch-lv-rc-chip[data-status="ADOPTED"] { background: var(--ch-mint, #d5f4e5); }
.ch-lv-rc-line { font: 600 11.5px/1.3 ${HEIST_BODY_FONT}; color: var(--ch-lilac, #f0c5fd); }
.ch-lv-rc-meet { font: 800 12.5px/1.2 ${HEIST_BODY_FONT}; color: ${COIN}; text-decoration: underline; text-underline-offset: 2px; padding: 4px 0; }
.ch-lv-rc-meet:hover, .ch-lv-rc-meet:focus-visible { color: #fff2c4; }
.ch-lv-rc[data-loading="true"] .ch-lv-rc-chip { opacity: .7; }

/* ---- HUD: the real cat beside the objective ---- */
.ch-obj { align-items: center; gap: 8px; }
.ch-lv-hudcat { position: relative; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.ch-lv-hudcat-photo { position: relative; display: block; width: 46px; height: 46px; border-radius: 50%; overflow: hidden;
  border: 3px solid var(--ch-coin, #ffcc55); box-shadow: 0 0 0 2px ${OL}, 0 3px 0 2px ${OL}; background: #3b1f52; }
.ch-lv-hudcat-photo img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity .3s ease; }
.ch-lv-hudcat-photo[data-state="ready"] img { opacity: 1; }
.ch-lv-hudcat-photo > .ch-svg { display: block; margin: 10px auto; font-size: 20px; color: var(--ch-lilac, #f0c5fd); }
.ch-lv-hudcat-name { margin-top: -9px; max-width: 72px; padding: 1px 6px; border-radius: 999px; border: 2px solid ${OL}; background: ${COIN}; color: ${OL};
  font: 800 10.5px/1.15 ${HEIST_BODY_FONT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: relative; z-index: 1; }
.ch-lv-hudcat[data-freed="true"] .ch-lv-hudcat-photo { border-color: var(--ch-mint, #d5f4e5); animation: ch-lv-pop .5s cubic-bezier(.2,1.4,.4,1) both; }
.ch-lv-hudcat[data-freed="true"] .ch-lv-hudcat-name { background: var(--ch-mint, #d5f4e5); }
@media (max-height: 460px) {
  .ch-lv-hudcat-photo { width: 38px; height: 38px; }
  .ch-lv-hudcat-name { font-size: 9.5px; margin-top: -7px; }
}

/* ---- results strip ---- */
.ch-lv-res { display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 8px 0 4px; text-align: center; }
.ch-lv-res .ch-lv-stars { font-size: 26px; }
.ch-lv-res .ch-lv-new { color: ${COIN}; animation: ch-lv-pop .5s cubic-bezier(.2,1.4,.4,1) both; }
.ch-lv-res small { font-size: 12px; opacity: .8; }
.ch-lv-resrow { display: flex; justify-content: center; gap: 10px; margin-top: 4px; width: 100%; }
.ch-lv-resrow .ch-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; flex: 1 1 0; width: auto; min-width: 0; padding-left: 10px; padding-right: 10px; }
.ch-lv-resrow .ch-btn:only-child { flex: 0 1 60%; }
.ch-rescue .ch-lv-res-pics { position: relative; flex: 0 0 auto; display: block; padding: 0 14px 10px 0; }
.ch-rescue .ch-lv-res-photo { position: relative; display: block; flex: 0 0 auto; width: 120px; height: 160px; border-radius: 14px; overflow: hidden;
  border: 3px solid ${OL}; background: linear-gradient(135deg, #5a3a72, #2a1638); box-shadow: 0 4px 0 ${OL}, 0 0 0 3px var(--ch-mint, #d5f4e5), 0 10px 24px rgba(0,0,0,.35); transform: rotate(-3deg); }
.ch-rescue .ch-lv-res-pics canvas.ch-lv-res-badge { position: absolute; right: 0; bottom: 0; z-index: 2; width: 58px; height: 58px; padding: 3px; box-sizing: border-box;
  border-radius: 50%; border: 3px solid ${OL}; background: radial-gradient(circle at 50% 65%, rgba(255,204,85,.55), #4b2a63 70%); box-shadow: 0 3px 0 ${OL}; }
.ch-lv-headline { display: inline; }
@media (max-height: 760px) and (min-height: 461px) {
  .ch-rescue .ch-lv-res-photo { width: 96px; height: 128px; }
  .ch-rescue .ch-lv-res-photo > .ch-svg { margin: 46px auto; }
  .ch-rescue .ch-lv-res-pics canvas.ch-lv-res-badge { width: 50px; height: 50px; }
}
.ch-rescue .ch-lv-res-photo img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity .3s ease; }
.ch-rescue .ch-lv-res-photo[data-state="ready"] img { opacity: 1; }
.ch-rescue .ch-lv-res-photo > .ch-svg { display: block; margin: 62px auto; font-size: 28px; color: var(--ch-lilac, #f0c5fd); }
.ch-results .ch-dialog > .ch-scroll.ch-lv-hasfoot { padding-bottom: 0; }
.ch-lv-resfoot { position: sticky; bottom: 0; z-index: 6; display: flex; flex-direction: row; flex-wrap: wrap; gap: 8px 10px; margin: 0 -2px; padding: 20px 2px 2px;
  border-radius: 0 0 16px 16px; background: linear-gradient(180deg, rgba(44,21,56,0), rgba(44,21,56,.94) 18px); }
/* Next + Heists take a row of their own; Heists alone shares the row with Retry and Menu. */
.ch-lv-resfoot > .ch-lv-resrow { flex: 1 1 100%; margin-top: 0; }
.ch-lv-resfoot > .ch-lv-resrow:has(> :only-child) { flex: 1 1 0; }
.ch-lv-resfoot > .ch-row { flex: 2 1 0; margin: 0; }
.ch-lv-resfoot .ch-btn, .ch-results .ch-lv-resfoot .ch-btn.ch-big { min-height: 52px; padding: 8px 10px; font-size: clamp(18px, 2.4vmin + 6px, 24px); }
.ch-rescue .ch-lv-res-real { color: var(--ch-cream, #fcecbb) !important; }
.ch-rescue .ch-lv-res-real a { color: ${COIN}; text-decoration: underline; text-underline-offset: 2px; pointer-events: auto; white-space: nowrap; }
@keyframes ch-lv-pop { 0% { transform: scale(.2); } 100% { transform: scale(1); } }

/* ---- phones: the cards become one swipeable strip ---- */
@media (max-width: 760px), (max-height: 500px) {
  .ch-lv-path { display: none; }
  .ch-lv-mapwrap { flex: 0 0 auto; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; overscroll-behavior-x: contain;
    scrollbar-width: none; margin: 0 -16px; padding: 0 16px; scroll-padding: 0 16px; container-type: normal;
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 28px), transparent);
    mask-image: linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 28px), transparent); }
  .ch-lv-media { aspect-ratio: 16 / 9; height: auto; }
  .ch-lv-name { -webkit-line-clamp: 1; line-clamp: 1; }
  .ch-lv-mapwrap::-webkit-scrollbar { display: none; }
  .ch-lv-map { display: flex; gap: 12px; padding: 6px 2px 14px; min-height: 0; width: max-content; align-items: stretch; }
  .ch-lv-card { flex: 0 0 auto; width: clamp(196px, 60vw, 250px); scroll-snap-align: center; align-self: stretch; }
  .ch-lv-card:not(:last-child)::after { content: ''; position: absolute; top: 34%; right: -15px; width: 12px; height: 6px; border-radius: 3px;
    background: rgba(255,204,85,.7); box-shadow: 0 0 0 2px ${OL}; }
  .ch-lv-card[disabled]::after { background: rgba(153,102,204,.6); }
}
@media (max-width: 760px) and (min-height: 501px), (max-height: 500px) and (max-width: 599px) {
  .ch-lv-body { flex-direction: column; gap: 6px; overflow-y: auto; overflow-x: hidden; margin: 8px -16px 0; padding: 0 16px; }
  .ch-lv-detail { flex: 0 0 auto; overflow: visible; }
  .ch-lv-hero { aspect-ratio: 16 / 7; border-radius: 17px 17px 0 0; }
  .ch-lv-dbody { overflow: visible; }
  .ch-lv-gowrap { position: sticky; bottom: 0; z-index: 5; border-radius: 0 0 17px 17px;
    background: linear-gradient(180deg, rgba(34,16,44,0), rgba(34,16,44,.97) 30%); }
  .ch-lv-head .ch-lv-sub { font-size: 13px; }
}
@media (max-height: 500px) and (min-width: 600px) {
  .ch-lv { padding-top: calc(8px + var(--ch-sat, 0px)); padding-bottom: calc(8px + var(--ch-sab, 0px)); }
  .ch-lv-head h2 { font-size: 22px; }
  .ch-lv-head .ch-lv-sub { display: none; }
  .ch-lv-total { font-size: 15px; padding: 4px 10px; }
  .ch-lv-body { margin-top: 6px; gap: 12px; }
  .ch-lv-mapwrap { flex: 1 1 auto; margin: 0; padding: 0; align-self: center; }
  .ch-lv-card { width: clamp(180px, 26vw, 230px); }
  .ch-lv-detail { flex: 0 0 min(46%, 400px); }
  .ch-lv-hero { aspect-ratio: auto; height: 92px; }
  .ch-lv-hero h3 { font-size: 21px; }
  .ch-lv-dbody { padding: 10px 12px 6px; }
  .ch-lv-gowrap { padding: 6px 12px 10px; }
  .ch-lv-go { padding-top: 8px; padding-bottom: 8px; }
  .ch-lv-rc { order: -1; padding: 8px; gap: 10px; }
  .ch-lv-hero { height: 76px; }
  .ch-lv-rc-photo, .ch-lv-rc-sprite { width: 60px; height: 80px; }
  .ch-lv-rc-photo > .ch-svg { margin: 26px auto; }
  .ch-lv-rc-sprite canvas { width: 58px; height: 58px; }
  .ch-lv-rc-name { font-size: 21px; }
  .ch-lv-rc-text { gap: 2px; }
  .ch-lv-rc-line { font-size: 11px; }
  .ch-lv-rc-meet { padding: 2px 0; }
}
/* Landscape phones: the results' rescue box keeps a mid-size photo, the four actions share one row. */
@media (max-height: 460px) {
  .ch-rescue .ch-lv-res-photo { width: 72px; height: 96px; }
  .ch-rescue .ch-lv-res-photo > .ch-svg { margin: 34px auto; }
  .ch-rescue .ch-lv-res-pics { padding: 0 10px 8px 0; }
  .ch-rescue .ch-lv-res-pics canvas.ch-lv-res-badge { width: 40px; height: 40px; }
  .ch-results .ch-dialog > .ch-scroll.ch-lv-hasfoot { grid-template-areas: 'paws table' 'rescue table' 'stars table' 'meta meta' 'btns btns'; }
  .ch-results .ch-scroll > .ch-lv-res { grid-area: stars; margin: 0; flex-direction: row; flex-wrap: wrap; justify-content: center; column-gap: 8px; }
  .ch-results .ch-scroll > .ch-lv-res .ch-lv-stars { font-size: 20px; }
  .ch-results .ch-scroll > .ch-lv-resfoot { grid-area: btns; flex-wrap: nowrap; padding-top: 14px; }
  .ch-lv-resfoot > .ch-lv-resrow, .ch-lv-resfoot > .ch-lv-resrow:has(> :only-child), .ch-lv-resfoot > .ch-row { flex: 1 1 0; min-width: 0; }
  .ch-lv-resfoot > .ch-lv-resrow:has(> :only-child) ~ .ch-row { flex-grow: 2; }
  .ch-lv-resfoot .ch-btn, .ch-results .ch-lv-resfoot .ch-btn.ch-big { min-height: 44px; padding: 6px 10px; font-size: 18px; }
  /* The fact line stays even here (ui.ts hides the rescue box's small print on landscape phones). */
  .ch-results .ch-rescue p small.ch-lv-res-real { display: block; font-size: 11px; line-height: 1.25; margin-top: 2px; }
}
@media (max-width: 380px) {
  .ch-lv-rc { gap: 10px; padding: 8px; }
  .ch-lv-rc-photo, .ch-lv-rc-sprite { width: 64px; height: 86px; }
  .ch-lv-rc-sprite canvas { width: 62px; height: 62px; }
  .ch-lv-rc-name { font-size: 21px; }
  .ch-rescue .ch-lv-res-photo { width: 104px; height: 138px; }
}
@media (prefers-reduced-motion: reduce) {
  .ch-lv.ch-on, .ch-lv-res .ch-lv-new, .ch-lv-hero[data-state="ready"] img, .ch-lv-media::after { animation: none; }
  .ch-lv-card, .ch-lv-thumb { transition: none; transform: none; }
}
.ch-lv-reduced .ch-lv-card, .ch-lv-reduced .ch-lv-thumb { transform: none; }
.ch-lv-reduced .ch-lv-hero img { animation: none !important; }
`;

let injected = false;

export function ensureLevelStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.dataset.ch = 'levels';
  style.textContent = CSS;
  document.head.appendChild(style);
}
