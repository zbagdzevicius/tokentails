/**
 * Overlay UI stylesheet, injected once. Brand: Cat Paw font, glassy night/plum/grape panels with a
 * chunky dark outline, an inner lavender highlight and a hard pixel drop shadow; coin-yellow primary
 * actions with a gloss sweep. Every class is prefixed `ch-` so it cannot clash with the renderer or
 * host page. Heavy effects (backdrop blur) are limited to modal panels, never the per-frame HUD.
 */
import { ASSET_BASE } from '../types';

const CSS = /* css */ `
.ch-ui, .ch-ui * { box-sizing: border-box; }
.ch-ui {
  --ch-night:#0d0616; --ch-plum:#301934; --ch-violet:#4b0082; --ch-grape:#6f2da8; --ch-lav:#9966cc;
  --ch-coin:#ffc93c; --ch-cream:#fcecbb; --ch-ember:#c1260f; --ch-rust:#ee642a; --ch-pink:#ff7aa2;
  --ch-mint:#d5f4e5; --ch-sky:#c4e2fc; --ch-lilac:#f0c5fd; --ch-ol:#2a0f1f;
  --ch-sat: env(safe-area-inset-top, 0px); --ch-sar: env(safe-area-inset-right, 0px);
  --ch-sab: env(safe-area-inset-bottom, 0px); --ch-sal: env(safe-area-inset-left, 0px);
  --ch-gap: clamp(8px, 2.2vmin, 16px);
  --ch-glass: linear-gradient(180deg, rgba(86,46,110,.86) 0%, rgba(48,25,58,.88) 55%, rgba(30,14,38,.92) 100%);
  --ch-glass-lite: linear-gradient(180deg, rgba(74,40,98,.8), rgba(34,16,44,.84));
  --ch-rim: inset 0 1px 0 rgba(255,255,255,.22), inset 0 0 0 1px rgba(153,102,204,.55), inset 0 -2px 0 rgba(0,0,0,.28);
  --ch-ease-pop: cubic-bezier(.2,1.4,.4,1);
  position: absolute; inset: 0; pointer-events: none; z-index: 10;
  font-family: 'Cat Paw', ui-rounded, system-ui, sans-serif; color: var(--ch-cream);
  letter-spacing: .02em; line-height: 1.2; user-select: none; -webkit-user-select: none;
  -webkit-font-smoothing: antialiased;
}
.ch-ui :where(button) { font: inherit; color: inherit; letter-spacing: inherit; }
.ch-svg { display: inline-flex; line-height: 0; font-size: 22px; }
.ch-svg svg { display: block; }
.ch-ui :focus-visible { outline: 3px solid var(--ch-sky); outline-offset: 3px; }
.ch-screen { position: absolute; inset: 0; pointer-events: auto; display: none; }
.ch-screen.ch-on { display: flex; }
.ch-screen.ch-enter { animation: ch-screen-in .34s ease-out both; }
@keyframes ch-screen-in { 0% { opacity: 0; } 100% { opacity: 1; } }
.ch-diorama { position: absolute; inset: 0; display: none; pointer-events: none; }
.ch-diorama.ch-on { display: block; }
.ch-diorama canvas { position: absolute; inset: 0; }
.ch-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ---------- iris transition ---------- */
.ch-iris { position: absolute; left: 50%; top: 50%; width: 0; height: 0; border-radius: 50%; pointer-events: none; z-index: 50;
  box-shadow: 0 0 0 200vmax var(--ch-night); opacity: 0; transform: translate(-50%, -50%); }
.ch-iris::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 6px solid var(--ch-coin); box-shadow: 0 0 24px 4px rgba(255,201,60,.6); }
.ch-iris.ch-go { animation: ch-iris .46s cubic-bezier(.55,0,.35,1) both; }
@keyframes ch-iris { 0% { width: 0; height: 0; opacity: 1; } 85% { opacity: 1; } 100% { width: 260vmax; height: 260vmax; opacity: 0; } }

/* ---------- shared widgets ---------- */
.ch-panel {
  position: relative; background: var(--ch-glass);
  border: 3px solid var(--ch-ol); border-radius: 20px;
  box-shadow: 0 6px 0 var(--ch-ol), 0 18px 40px rgba(0,0,0,.45), var(--ch-rim);
  -webkit-backdrop-filter: blur(10px) saturate(1.25); backdrop-filter: blur(10px) saturate(1.25);
}
.ch-panel::before { content: ''; position: absolute; inset: 0; border-radius: 17px; pointer-events: none;
  background: radial-gradient(ellipse 90% 40% at 50% 0%, rgba(240,197,253,.16), rgba(240,197,253,0) 70%); }
.ch-btn {
  --bg: var(--ch-grape); --bg2: #5a2190; --fg: var(--ch-cream); --hi: rgba(255,255,255,.26);
  position: relative; overflow: hidden; isolation: isolate;
  appearance: none; cursor: pointer; min-height: 48px; min-width: 48px; padding: 10px 22px;
  border: 3px solid var(--ch-ol); border-radius: 14px; background: linear-gradient(180deg, var(--bg) 0%, var(--bg) 52%, var(--bg2) 100%); color: var(--fg);
  font-size: clamp(17px, 2.6vmin + 6px, 24px); line-height: 1; text-transform: uppercase;
  box-shadow: 0 5px 0 var(--ch-ol), 0 8px 16px rgba(0,0,0,.3), inset 0 3px 0 var(--hi), inset 0 -4px 0 rgba(0,0,0,.2);
  transition: transform .09s ease, box-shadow .09s ease, filter .15s ease;
  display: inline-flex; align-items: center; justify-content: center; gap: 10px; white-space: nowrap;
  touch-action: manipulation; text-shadow: 0 2px 0 rgba(42,15,31,.35);
}
.ch-btn::after { content: ''; position: absolute; top: -20%; bottom: -20%; left: -60%; width: 40%; z-index: -1; pointer-events: none;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent); transform: skewX(-18deg) translateX(-120%); }
.ch-btn:hover { filter: brightness(1.08) saturate(1.05); transform: translateY(-1px); }
.ch-btn:hover::after { animation: ch-shine .7s ease-out; }
@keyframes ch-shine { to { transform: skewX(-18deg) translateX(480%); } }
.ch-btn:active, .ch-btn.ch-down { transform: translateY(4px); box-shadow: 0 1px 0 var(--ch-ol), inset 0 3px 0 var(--hi), inset 0 -2px 0 rgba(0,0,0,.22); }
.ch-btn[disabled] { filter: grayscale(.7) brightness(.7); cursor: not-allowed; transform: none; }
.ch-btn.ch-primary { --bg: var(--ch-coin); --bg2: #f0a92a; --fg: var(--ch-ol); --hi: rgba(255,255,255,.6); text-shadow: 0 2px 0 rgba(255,255,255,.35); }
.ch-btn.ch-pink { --bg: var(--ch-pink); --bg2: #ec5a88; --fg: var(--ch-ol); --hi: rgba(255,255,255,.5); text-shadow: 0 2px 0 rgba(255,255,255,.3); }
.ch-btn.ch-ghost { --bg: rgba(60,30,74,.88); --bg2: rgba(36,16,46,.92); --hi: rgba(255,255,255,.16); }
.ch-btn.ch-big { font-size: clamp(22px, 3.4vmin + 8px, 34px); padding: 14px 34px; min-height: 60px; border-radius: 18px; }
.ch-btn.ch-icon { padding: 0; width: 48px; height: 48px; border-radius: 50%; font-size: 22px; }
.ch-btn img { width: 1.2em; height: 1.2em; object-fit: contain; image-rendering: auto; }
.ch-btn .ch-svg { font-size: 1em; margin-right: .1em; }
.ch-btn > .ch-bimg { margin-right: .15em; }
.ch-primary.ch-big .ch-bimg { width: 1.1em; height: 1.1em; filter: drop-shadow(0 2px 0 rgba(42,15,31,.35)); }
.ch-title-text {
  margin: 0; font-weight: normal; font-size: clamp(44px, 10vmin + 10px, 118px); line-height: 1; text-transform: uppercase;
  display: flex; flex-direction: column; align-items: center;
}
.ch-title-text > span { display: block; padding: .1em .4em 0; margin-top: -.1em; background: linear-gradient(180deg, #fff6c9 0%, var(--ch-coin) 45%, #f39a1e 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 3px 0 var(--ch-ol)) drop-shadow(3px 0 0 var(--ch-ol)) drop-shadow(-3px 0 0 var(--ch-ol)) drop-shadow(0 -3px 0 var(--ch-ol)) drop-shadow(0 7px 0 #5a2143) drop-shadow(0 14px 18px rgba(0,0,0,.5)); }
.ch-title-text > span + span { font-size: .62em; margin-top: -.12em; letter-spacing: .12em; background: linear-gradient(180deg, #ffd3e0 0%, var(--ch-pink) 55%, #d9467a 100%); -webkit-background-clip: text; background-clip: text; }
.ch-h2 { font-size: clamp(24px, 4vmin + 10px, 44px); color: var(--ch-cream); margin: 0; text-transform: uppercase; font-weight: normal;
  text-shadow: 0 3px 0 var(--ch-ol), 2px 0 0 var(--ch-ol), -2px 0 0 var(--ch-ol), 0 -2px 0 var(--ch-ol), 0 6px 12px rgba(0,0,0,.35); }
.ch-sub { font-size: clamp(14px, 1.6vmin + 8px, 20px); color: var(--ch-lilac); margin: 0; }
.ch-corner { position: absolute; top: calc(var(--ch-sat) + var(--ch-gap)); right: calc(var(--ch-sar) + var(--ch-gap)); display: flex; gap: 10px; }
.ch-back { position: absolute; top: calc(var(--ch-sat) + var(--ch-gap)); left: calc(var(--ch-sal) + var(--ch-gap)); }

/* ---------- menu scrim (the live 3D diorama renders behind it) ---------- */
.ch-backdrop {
  background:
    radial-gradient(ellipse 46% 62% at 50% 50%, rgba(13,6,22,.72) 0%, rgba(13,6,22,.42) 55%, rgba(13,6,22,0) 100%),
    linear-gradient(180deg, rgba(13,6,22,.55) 0%, rgba(13,6,22,0) 22%, rgba(13,6,22,0) 72%, rgba(13,6,22,.7) 100%);
}
.ch-stars { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.ch-stars i { position: absolute; width: 3px; height: 3px; background: var(--ch-lilac); opacity: .5; box-shadow: 0 0 6px var(--ch-lilac); animation: ch-twinkle 3.2s ease-in-out infinite; }
.ch-floaty { position: absolute; width: 40px; height: 40px; object-fit: contain; opacity: .8; filter: drop-shadow(0 4px 0 var(--ch-ol)) drop-shadow(0 0 10px rgba(255,201,60,.35)); animation: ch-float 6s ease-in-out infinite; pointer-events: none; }
@keyframes ch-twinkle { 0%,100% { opacity: .1; transform: scale(.7); } 50% { opacity: .8; transform: scale(1); } }
@keyframes ch-float { 0%,100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-14px) rotate(6deg); } }
@keyframes ch-pop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
@keyframes ch-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes ch-rise { 0% { transform: translateY(18px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }

/* ---------- title ---------- */
.ch-title { flex-direction: column; align-items: center; justify-content: center; gap: clamp(10px, 2.4vmin, 24px); text-align: center; padding: calc(var(--ch-sat) + 24px) calc(var(--ch-sar) + 16px) calc(var(--ch-sab) + 34px) calc(var(--ch-sal) + 16px); }
.ch-brand { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ch-brand::before { content: ''; position: absolute; left: 50%; top: 55%; width: 150%; height: 120%; transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none; z-index: -1;
  background: radial-gradient(ellipse, rgba(255,201,60,.16), rgba(111,45,168,.14) 45%, rgba(13,6,22,0) 70%); }
.ch-logo { width: clamp(140px, 26vmin, 250px); height: auto; filter: drop-shadow(0 5px 0 var(--ch-ol)) drop-shadow(0 0 22px rgba(255,201,60,.35)); animation: ch-pop .5s ease-out both; }
.ch-title .ch-title-text { animation: ch-pop .6s .08s var(--ch-ease-pop) both; }
.ch-ribbon { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 6px 16px; margin: 0 0 4px; text-align: left; border-radius: 999px; background: var(--ch-glass-lite); border: 2px solid var(--ch-ol);
  box-shadow: 0 3px 0 var(--ch-ol), var(--ch-rim); color: var(--ch-mint); font-size: clamp(13px, 1.5vmin + 8px, 17px); animation: ch-rise .5s .2s ease-out both; }
.ch-ribbon img { width: 22px; height: 22px; object-fit: contain; flex: none; }
.ch-menu { display: flex; flex-direction: column; gap: 14px; width: min(360px, 88vw); animation: ch-rise .5s .28s ease-out both; }
.ch-menu .ch-btn { width: 100%; }
/* Play button glow: a separate layer behind the button that only fades (opacity runs on the
   compositor; an animated box-shadow would restyle and repaint the title on every frame). */
.ch-play-wrap { position: relative; display: flex; width: 100%; isolation: isolate; }
.ch-play-glow { position: absolute; inset: 0; z-index: -1; border-radius: 14px; pointer-events: none; opacity: 0;
  box-shadow: 0 0 26px 4px rgba(255,201,60,.45); animation: ch-breathe 2.6s 1s ease-in-out infinite; will-change: opacity; }
@keyframes ch-breathe { 0%,100% { opacity: 0; } 50% { opacity: 1; } }
.ch-tag { color: var(--ch-mint); margin: 0; }
.ch-foot { position: absolute; bottom: calc(var(--ch-sab) + 10px); left: 0; right: 0; font-size: 13px; color: var(--ch-lilac); font-family: system-ui, sans-serif; opacity: .85; text-shadow: 0 1px 2px #000; }
.ch-foot img { width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px; }

/* ---------- cat pick ---------- */
.ch-pick { flex-direction: column; padding: calc(var(--ch-sat) + var(--ch-gap)) calc(var(--ch-sar) + var(--ch-gap)) 0 calc(var(--ch-sal) + var(--ch-gap));
  background: radial-gradient(ellipse at 50% 0%, rgba(111,45,168,.35), rgba(13,6,22,0) 60%), rgba(13,6,22,.74);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.ch-pick-head { display: flex; align-items: center; gap: 12px; padding: 0 0 10px; min-height: 52px; }
.ch-pick-head .ch-head-text { flex: 1; min-width: 0; text-align: center; }
.ch-pick-head .ch-sub { font-family: system-ui, sans-serif; font-size: 14px; font-weight: 600; margin-top: 4px; }
.ch-grid-wrap { flex: 1; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y; padding: 12px 8px 20px; margin: 0 -4px;
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 12px, #000 calc(100% - 16px), transparent 100%); mask-image: linear-gradient(180deg, transparent 0, #000 12px, #000 calc(100% - 16px), transparent 100%); }
.ch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(88px, 18vw, 118px), 1fr)); gap: clamp(8px, 1.4vw, 14px); max-width: 1180px; margin: 0 auto; }
.ch-card {
  position: relative; appearance: none; cursor: pointer; padding: 6px 4px 8px; border-radius: 16px;
  border: 3px solid var(--ch-ol); background: var(--ch-glass-lite);
  box-shadow: 0 4px 0 var(--ch-ol), var(--ch-rim); display: flex; flex-direction: column; align-items: center; gap: 2px;
  transition: transform .16s var(--ch-ease-pop), box-shadow .16s ease, background .15s ease; touch-action: pan-y;
  animation: ch-rise .4s ease-out both; animation-delay: calc(var(--i, 0) * 12ms);
}
.ch-card::before { content: ''; position: absolute; left: 22%; right: 22%; bottom: 30px; height: 8px; border-radius: 50%; background: rgba(13,6,22,.55); filter: blur(2px); pointer-events: none; }
.ch-card:hover { transform: translateY(-4px) rotate(-1.5deg); box-shadow: 0 8px 0 var(--ch-ol), 0 12px 20px rgba(0,0,0,.35), var(--ch-rim), 0 0 0 2px var(--ch-lav); }
.ch-card:nth-child(even):hover { transform: translateY(-4px) rotate(1.5deg); }
.ch-card:hover canvas { transform: scale(1.08); }
.ch-card canvas { position: relative; width: 100%; aspect-ratio: 1; image-rendering: pixelated; display: block; border-radius: 10px; transition: transform .2s var(--ch-ease-pop);
  background: radial-gradient(circle at 50% 70%, rgba(153,102,204,.45), rgba(13,6,22,0) 70%); }
.ch-card .ch-name { font-size: clamp(13px, 1.1vw + 8px, 17px); color: var(--ch-cream); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px; }
.ch-card[aria-pressed="true"] { background: linear-gradient(180deg, #fff0b8 0%, var(--ch-coin) 55%, #f2a52a 100%);
  box-shadow: 0 4px 0 var(--ch-ol), 0 0 0 3px var(--ch-ol), 0 0 0 6px rgba(255,201,60,.55), 0 0 26px 6px rgba(255,201,60,.4), inset 0 2px 0 rgba(255,255,255,.6);
  animation: ch-select .38s var(--ch-ease-pop) both; }
@keyframes ch-select { 0% { transform: scale(.92); } 60% { transform: scale(1.07) rotate(-1deg); } 100% { transform: scale(1); } }
.ch-card[aria-pressed="true"] .ch-name { color: var(--ch-ol); }
.ch-card[aria-pressed="true"] canvas { background: radial-gradient(circle at 50% 70%, rgba(255,255,255,.7), rgba(255,255,255,0) 70%); }
.ch-badge { position: absolute; top: -10px; right: -10px; width: 30px; height: 30px; border-radius: 50%; background: var(--ch-pink); color: var(--ch-ol);
  border: 3px solid var(--ch-ol); display: none; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 3px 0 var(--ch-ol), 0 0 12px rgba(255,122,162,.6); z-index: 2; }
.ch-card[aria-pressed="true"] .ch-badge { display: flex; animation: ch-pop .3s var(--ch-ease-pop) both; }
.ch-pick-bar {
  position: relative; display: flex; align-items: center; gap: 14px; justify-content: center; flex-wrap: wrap;
  padding: 12px calc(var(--ch-sar) + var(--ch-gap)) calc(var(--ch-sab) + 12px) calc(var(--ch-sal) + var(--ch-gap));
  margin: 0 calc(-1 * (var(--ch-sar) + var(--ch-gap))) 0 calc(-1 * (var(--ch-sal) + var(--ch-gap)));
  background: linear-gradient(180deg, rgba(60,30,74,.92), rgba(20,9,28,.97)); border-top: 3px solid var(--ch-ol);
  box-shadow: 0 -10px 30px rgba(0,0,0,.35), inset 0 2px 0 rgba(153,102,204,.45);
}
.ch-slots { display: flex; gap: 10px; align-items: center; }
.ch-slot { width: 64px; height: 64px; border-radius: 16px; border: 3px dashed rgba(153,102,204,.8); display: flex; align-items: center; justify-content: center; position: relative; background: rgba(13,6,22,.6);
  color: var(--ch-lav); font-size: 26px; }
.ch-slot:not(.ch-filled)::after { content: '?'; opacity: .6; animation: ch-bob 1.8s ease-in-out infinite; }
.ch-slot.ch-filled { border-style: solid; border-color: var(--ch-ol); background: radial-gradient(circle at 50% 70%, #9a5ad0, var(--ch-grape) 60%, #4d1d7a); box-shadow: 0 4px 0 var(--ch-ol), inset 0 2px 0 rgba(255,255,255,.3), 0 0 16px rgba(153,102,204,.5); animation: ch-pop .3s var(--ch-ease-pop) both; }
.ch-slot canvas { width: 100%; height: 100%; image-rendering: pixelated; }
.ch-slot b { position: absolute; bottom: -7px; left: -7px; width: 24px; height: 24px; border-radius: 50%; background: var(--ch-coin); color: var(--ch-ol); border: 2px solid var(--ch-ol); font-size: 13px; display: flex; align-items: center; justify-content: center; font-weight: normal; }
.ch-slot-plus { font-size: 22px; color: var(--ch-coin); text-shadow: 0 2px 0 var(--ch-ol); }
.ch-slot-names { font-size: 15px; color: var(--ch-lilac); min-width: 120px; max-width: 34vw; line-height: 1.3; }
.ch-slot-names div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- HUD ---------- */
.ch-hud { pointer-events: none; }
.ch-hud > * { pointer-events: auto; }
.ch-hud-top { position: absolute; top: calc(var(--ch-sat) + 8px); left: calc(var(--ch-sal) + 8px); right: calc(var(--ch-sar) + 8px); display: flex; align-items: flex-start; gap: 8px; pointer-events: none; }
.ch-hud-top > * { pointer-events: auto; }
.ch-hud.ch-enter .ch-hud-top { animation: ch-drop .45s .1s var(--ch-ease-pop) both; }
.ch-hud.ch-enter .ch-crew { animation: ch-slide-l .45s .2s var(--ch-ease-pop) both; }
@keyframes ch-drop { 0% { transform: translateY(-30px); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes ch-slide-l { 0% { transform: translateX(-40px); opacity: 0; } 100% { transform: none; opacity: 1; } }
.ch-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.ch-chip { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 13px 0 7px; border-radius: 20px; background: var(--ch-glass-lite);
  border: 2px solid var(--ch-ol); box-shadow: 0 3px 0 var(--ch-ol), 0 6px 12px rgba(0,0,0,.25), var(--ch-rim); font-size: 19px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ch-chip img { width: 26px; height: 26px; object-fit: contain; filter: drop-shadow(0 2px 0 var(--ch-ol)); }
.ch-chip .ch-ico { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; color: var(--ch-lav); border-radius: 50%; background: rgba(13,6,22,.5); box-shadow: inset 0 0 0 1px rgba(153,102,204,.4); }
.ch-chip b { font-weight: normal; }
.ch-chip small { font-size: .7em; color: var(--ch-lav); margin-left: 1px; }
.ch-chip.ch-spot .ch-ico { color: var(--ch-pink); }
.ch-chip.ch-key .ch-ico { color: var(--ch-ol); background: rgba(255,255,255,.35); }
.ch-chip.ch-coins b { color: var(--ch-coin); text-shadow: 0 0 10px rgba(255,201,60,.4); }
.ch-chip.ch-spot b { color: var(--ch-pink); }
.ch-chip.ch-key { background: linear-gradient(180deg, #ffe38a, var(--ch-coin)); color: var(--ch-ol); box-shadow: 0 3px 0 var(--ch-ol), 0 0 16px rgba(255,201,60,.55), inset 0 2px 0 rgba(255,255,255,.55); animation: ch-pop .35s var(--ch-ease-pop) both; }
.ch-chip.ch-bump { animation: ch-bump .42s var(--ch-ease-pop); }
.ch-chip.ch-spot.ch-bump { animation: ch-shake .42s ease-out; }
@keyframes ch-bump { 0% { transform: scale(1); } 35% { transform: scale(1.22); } 100% { transform: scale(1); } }
@keyframes ch-shake { 0%,100% { transform: none; } 20% { transform: translateX(-4px) rotate(-3deg); } 40% { transform: translateX(4px) rotate(3deg); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
.ch-plus { position: absolute; left: 50%; top: 2px; font-size: 16px; color: var(--ch-coin); text-shadow: 0 2px 0 var(--ch-ol), 0 0 8px rgba(255,201,60,.6); pointer-events: none; animation: ch-plus .8s ease-out both; }
@keyframes ch-plus { 0% { transform: translate(-50%, 0) scale(.6); opacity: 0; } 20% { opacity: 1; transform: translate(-50%, 14px) scale(1.15); } 100% { transform: translate(-50%, 34px) scale(1); opacity: 0; } }
.ch-obj { flex: 1; min-width: 0; display: flex; justify-content: center; }
.ch-obj-inner { position: relative; max-width: min(520px, 100%); padding: 6px 16px 7px 44px; border-radius: 14px; background: linear-gradient(180deg, rgba(40,18,52,.86), rgba(13,6,22,.86)); border: 2px solid var(--ch-ol);
  font-size: clamp(14px, 1.2vw + 9px, 20px); text-align: left; color: var(--ch-cream); box-shadow: 0 3px 0 var(--ch-ol), 0 6px 14px rgba(0,0,0,.3), var(--ch-rim); }
.ch-obj-inner::before { content: ''; position: absolute; left: 10px; top: 50%; width: 24px; height: 24px; margin-top: -12px; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #fff3b0, var(--ch-coin) 55%, #e08a17); border: 2px solid var(--ch-ol); box-shadow: 0 0 10px rgba(255,201,60,.55); }
.ch-obj-inner::after { content: '!'; position: absolute; left: 10px; top: 50%; width: 28px; margin-top: -9px; text-align: center; font-size: 15px; color: var(--ch-ol); }
.ch-obj-inner small { display: block; font-size: .66em; color: var(--ch-lav); text-transform: uppercase; letter-spacing: .12em; }
.ch-obj-inner.ch-new { animation: ch-obj-new .6s var(--ch-ease-pop); }
@keyframes ch-obj-new { 0% { transform: scale(.9); box-shadow: 0 3px 0 var(--ch-ol), 0 0 0 0 rgba(255,201,60,.8); } 50% { transform: scale(1.05); box-shadow: 0 3px 0 var(--ch-ol), 0 0 0 8px rgba(255,201,60,0); } 100% { transform: none; } }
.ch-hud-right { display: flex; gap: 8px; }
.ch-hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--ch-sab) + 16px); max-width: min(560px, 60vw); padding: 10px 18px 10px 16px; border-radius: 14px;
  background: linear-gradient(180deg, #fff6d6, var(--ch-cream)); color: var(--ch-ol); border: 3px solid var(--ch-ol); box-shadow: 0 4px 0 var(--ch-ol), 0 10px 22px rgba(0,0,0,.35), inset 0 2px 0 #fff;
  font-size: clamp(14px, 1vw + 10px, 19px); text-align: center; display: none; pointer-events: none; }
.ch-hint::before { content: ''; position: absolute; left: -3px; top: -3px; bottom: -3px; width: 10px; border-radius: 14px 0 0 14px; background: var(--ch-pink); border: 3px solid var(--ch-ol); border-right: 0; }
.ch-hint.ch-on { display: block; animation: ch-hint-in .35s var(--ch-ease-pop) both; }
@keyframes ch-hint-in { 0% { opacity: 0; transform: translate(-50%, 12px) scale(.96); } 100% { opacity: 1; transform: translate(-50%, 0); } }
.ch-crew { position: absolute; top: calc(var(--ch-sat) + 64px); left: calc(var(--ch-sal) + 8px); display: flex; flex-direction: column; gap: 10px; }
.ch-crew-btn { position: relative; appearance: none; cursor: pointer; width: 60px; height: 60px; padding: 0; border-radius: 16px; border: 2px solid var(--ch-ol);
  background: var(--ch-glass-lite); box-shadow: 0 3px 0 var(--ch-ol), var(--ch-rim); opacity: .72; transition: transform .18s var(--ch-ease-pop), opacity .15s ease, box-shadow .15s ease; }
.ch-crew-btn:hover { opacity: .95; }
.ch-crew-btn canvas { width: 100%; height: 100%; image-rendering: pixelated; display: block; }
.ch-crew-btn[aria-current="true"] { opacity: 1; background: radial-gradient(circle at 50% 70%, #9a5ad0, var(--ch-grape) 60%, #4d1d7a); border-color: var(--ch-ol); transform: scale(1.1);
  box-shadow: 0 3px 0 var(--ch-ol), 0 0 0 3px var(--ch-coin), 0 0 18px 3px rgba(255,201,60,.5), inset 0 2px 0 rgba(255,255,255,.3); }
.ch-crew-btn .ch-crew-tag { position: absolute; bottom: -7px; right: -9px; font-size: 11px; padding: 2px 6px; border-radius: 8px; background: var(--ch-coin); color: var(--ch-ol); border: 2px solid var(--ch-ol); display: none; box-shadow: 0 2px 0 var(--ch-ol); }
.ch-crew-btn[aria-current="true"] .ch-crew-tag { display: block; animation: ch-pop .3s var(--ch-ease-pop) both; }
.ch-crew-key { font-family: system-ui, sans-serif; font-size: 11px; font-weight: 700; color: var(--ch-lilac); text-align: center; text-shadow: 0 1px 2px #000; }
.ch-toasts { position: absolute; top: calc(var(--ch-sat) + 78px); left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
.ch-toast { padding: 8px 20px; border-radius: 16px; font-size: clamp(18px, 2vw + 10px, 30px); border: 3px solid var(--ch-ol); box-shadow: 0 4px 0 var(--ch-ol), 0 10px 24px rgba(0,0,0,.4), inset 0 2px 0 rgba(255,255,255,.35);
  background: linear-gradient(180deg, #8a45c8, var(--ch-grape)); color: var(--ch-cream); animation: ch-toast 1.6s ease-out both; text-transform: uppercase; text-shadow: 0 2px 0 rgba(42,15,31,.4); }
.ch-toast.ch-bad { background: linear-gradient(180deg, #e8412a, var(--ch-ember)); box-shadow: 0 4px 0 var(--ch-ol), 0 0 26px rgba(238,100,42,.55), inset 0 2px 0 rgba(255,255,255,.3); }
.ch-toast.ch-good { background: linear-gradient(180deg, #fff0b0, var(--ch-coin)); color: var(--ch-ol); text-shadow: 0 2px 0 rgba(255,255,255,.4); box-shadow: 0 4px 0 var(--ch-ol), 0 0 26px rgba(255,201,60,.55), inset 0 2px 0 #fff; }
.ch-toast.ch-info { background: linear-gradient(180deg, #e6f3ff, var(--ch-sky)); color: var(--ch-ol); text-shadow: none; }
@keyframes ch-toast { 0% { transform: translateY(12px) scale(.7); opacity: 0; } 12% { transform: translateY(0) scale(1.08); opacity: 1; } 20% { transform: scale(1); } 80% { opacity: 1; } 100% { transform: translateY(-16px); opacity: 0; } }
.ch-flash { position: absolute; inset: 0; pointer-events: none; opacity: 0; box-shadow: inset 0 0 0 5px var(--ch-ember), inset 0 0 80px 14px rgba(193,38,15,.5); }
.ch-flash.ch-go { animation: ch-flash .8s ease-out; }
@keyframes ch-flash { 0% { opacity: 1; } 100% { opacity: 0; } }

/* ---------- touch controls ---------- */
.ch-touch { position: absolute; inset: 0; pointer-events: none; display: none; }
.ch-touch.ch-on { display: block; }
.ch-stick-zone { position: absolute; left: 0; bottom: 0; width: 50%; height: 62%; pointer-events: auto; touch-action: none; }
.ch-stick { position: absolute; left: max(90px, 32%); top: calc(100% - 110px - var(--ch-sab)); width: 132px; height: 132px; margin: -66px 0 0 -66px; border-radius: 50%;
  background: radial-gradient(circle, rgba(13,6,22,.15) 40%, rgba(13,6,22,.45) 100%); border: 3px solid rgba(252,236,187,.5);
  box-shadow: inset 0 0 0 8px rgba(153,102,204,.22), 0 0 0 2px rgba(42,15,31,.6), 0 6px 18px rgba(0,0,0,.3); pointer-events: none; transition: opacity .15s ease, transform .15s ease; }
.ch-stick::before { content: ''; position: absolute; inset: 14px; border-radius: 50%; border: 2px dashed rgba(252,236,187,.25); }
.ch-stick.ch-idle { opacity: .55; transform: scale(.94); }
.ch-knob { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px; margin: -29px 0 0 -29px; border-radius: 50%;
  background: radial-gradient(circle at 40% 30%, #d9b8f5, var(--ch-lav) 55%, #6d3fa3); border: 3px solid var(--ch-ol); box-shadow: 0 4px 0 var(--ch-ol), inset 0 3px 0 rgba(255,255,255,.4); transition: box-shadow .15s ease; }
.ch-stick:not(.ch-idle) .ch-knob { box-shadow: 0 4px 0 var(--ch-ol), inset 0 3px 0 rgba(255,255,255,.4), 0 0 18px 4px rgba(240,197,253,.55); }
.ch-pad { position: absolute; right: calc(var(--ch-sar) + 18px); bottom: calc(var(--ch-sab) + 18px); width: 196px; height: 176px; pointer-events: none; }
.ch-pad .ch-btn { position: absolute; pointer-events: auto; touch-action: none; padding: 0; border-radius: 50%; flex-direction: column; gap: 0; font-size: 13px; transition: transform .07s ease, box-shadow .07s ease, filter .1s ease; }
.ch-pad .ch-btn span { font-size: 10px; line-height: 1; margin-top: 3px; opacity: .8; }
.ch-pad .ch-btn.ch-down { transform: translateY(4px) scale(.92); filter: brightness(1.2); }
.ch-pad .ch-act { right: 0; bottom: 20px; width: 84px; height: 84px; font-size: 16px; }
.ch-pad .ch-act.ch-down { box-shadow: 0 1px 0 var(--ch-ol), 0 0 24px 6px rgba(255,201,60,.6), inset 0 3px 0 var(--hi); }
.ch-pad .ch-meow { right: 100px; bottom: 0; width: 66px; height: 66px; }
.ch-pad .ch-meow.ch-down { box-shadow: 0 1px 0 var(--ch-ol), 0 0 24px 6px rgba(255,122,162,.6), inset 0 3px 0 var(--hi); }
.ch-pad .ch-swap { right: 88px; bottom: 90px; width: 62px; height: 62px; }
.ch-pad .ch-swap.ch-down { box-shadow: 0 1px 0 var(--ch-ol), 0 0 24px 6px rgba(153,102,204,.7), inset 0 3px 0 var(--hi); }
.ch-pad .ch-btn img { width: 26px; height: 26px; }
.ch-ripple { position: absolute; left: 50%; top: 50%; width: 100%; height: 100%; margin: -50% 0 0 -50%; border-radius: 50%; background: rgba(255,255,255,.55); pointer-events: none; z-index: -1; animation: ch-ripple .45s ease-out forwards; }
@keyframes ch-ripple { 0% { transform: scale(.2); opacity: .8; } 100% { transform: scale(1.6); opacity: 0; } }

/* ---------- modal (pause / results) ---------- */
.ch-modal { align-items: center; justify-content: center; background: radial-gradient(ellipse at 50% 50%, rgba(48,25,52,.45), rgba(13,6,22,.82) 75%); padding: calc(var(--ch-sat) + 12px) calc(var(--ch-sar) + 12px) calc(var(--ch-sab) + 12px) calc(var(--ch-sal) + 12px); }
.ch-modal.ch-on { animation: ch-screen-in .25s ease-out both; }
.ch-dialog { width: min(440px, 100%); max-height: 100%; overflow-y: auto; padding: clamp(16px, 3vmin, 28px); display: flex; flex-direction: column; gap: 14px; align-items: stretch; text-align: center; animation: ch-dialog-in .42s var(--ch-ease-pop) both; }
@keyframes ch-dialog-in { 0% { transform: translateY(24px) scale(.9); opacity: 0; } 100% { transform: none; opacity: 1; } }
.ch-dialog .ch-btn { width: 100%; }
.ch-row { display: flex; gap: 10px; }
.ch-row > * { flex: 1; }
.ch-pause-head { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ch-pause-head .ch-h2 { display: flex; align-items: center; gap: 12px; }
.ch-pause-head .ch-h2 .ch-svg { font-size: .8em; color: var(--ch-coin); filter: drop-shadow(0 2px 0 var(--ch-ol)); }
.ch-pause-head .ch-sub { font-family: system-ui, sans-serif; font-size: 13px; font-weight: 600; color: var(--ch-lav); }
.ch-keys { font-family: system-ui, sans-serif; font-size: 13px; color: var(--ch-lilac); display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: center; text-align: left; margin: 2px 0 0; padding: 12px 14px;
  border-radius: 14px; background: rgba(13,6,22,.45); box-shadow: inset 0 0 0 1px rgba(153,102,204,.35); }
.ch-keys span:nth-child(odd) { white-space: nowrap; }
.ch-keys kbd { display: inline-block; font-family: inherit; font-weight: 700; color: var(--ch-cream); background: linear-gradient(180deg, #4a2a5c, #2c1538); border: 2px solid var(--ch-ol); border-bottom-width: 4px; border-radius: 7px; padding: 1px 7px; font-size: 12px; white-space: nowrap; box-shadow: inset 0 1px 0 rgba(255,255,255,.2); }
.ch-results .ch-dialog { width: min(480px, 100%); padding-top: clamp(26px, 4vmin, 36px); overflow: visible; }
.ch-results .ch-dialog > .ch-scroll { overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 12px; min-height: 0; flex: 1 1 auto; padding: 14px 2px 4px; margin: -4px -2px; }
.ch-banner { position: relative; align-self: center; margin-top: calc(-1 * clamp(44px, 6vmin, 54px)); padding: 8px 34px; background: linear-gradient(180deg, #ff9dbb, var(--ch-pink) 60%, #e0507f); border: 3px solid var(--ch-ol); border-radius: 12px;
  box-shadow: 0 4px 0 var(--ch-ol), inset 0 2px 0 rgba(255,255,255,.45); animation: ch-pop .45s var(--ch-ease-pop) both; }
.ch-banner .ch-h2 { color: #fff7de; font-size: clamp(22px, 3.4vmin + 10px, 38px); white-space: nowrap; }
.ch-banner.ch-miss { background: linear-gradient(180deg, #b89ad6, var(--ch-lav) 60%, #7a4cb0); }
.ch-rescue { display: flex; align-items: center; gap: 12px; justify-content: center; padding: 10px; border-radius: 14px; background: linear-gradient(180deg, rgba(213,244,229,.16), rgba(213,244,229,.06)); border: 2px dashed var(--ch-mint); animation: ch-rise .4s .5s ease-out both; }
.ch-rescue canvas { width: 72px; height: 72px; image-rendering: pixelated; animation: ch-bob 1.6s ease-in-out infinite; filter: drop-shadow(0 3px 0 rgba(42,15,31,.6)); }
.ch-rescue p { margin: 0; font-size: clamp(17px, 1.5vw + 10px, 24px); color: var(--ch-mint); text-align: left; }
.ch-rescue p small { display: block; font-size: .62em; color: var(--ch-lilac); font-family: system-ui, sans-serif; margin-top: 3px; }
.ch-rescue .ch-payouts { display: block; margin-top: 4px; font-size: .6em; font-family: system-ui, sans-serif; color: var(--ch-coin); text-decoration: underline; text-underline-offset: 2px; pointer-events: auto; }
.ch-rescue .ch-give { display: inline-block; margin-top: 8px; padding: 9px 16px; border: 3px solid var(--ch-ol); border-radius: 14px; background: var(--ch-pink); color: var(--ch-ol); font-size: .62em; font-weight: 800; font-family: system-ui, sans-serif; text-decoration: none; box-shadow: 0 4px 0 var(--ch-ol); pointer-events: auto; animation: ch-give-wiggle 2.4s ease-in-out 1.2s infinite; }
.ch-rescue .ch-give:hover, .ch-rescue .ch-give:focus-visible { background: #ffb3cf; transform: translateY(-2px) rotate(-1deg); animation-play-state: paused; }
.ch-rescue .ch-give:active { transform: translateY(2px); box-shadow: 0 2px 0 var(--ch-ol); }
@keyframes ch-give-wiggle { 0%, 88%, 100% { transform: rotate(0); } 91% { transform: rotate(-3deg) scale(1.04); } 94% { transform: rotate(3deg) scale(1.04); } 97% { transform: rotate(-1deg); } }
.ch-reduced .ch-rescue .ch-give { animation: none; }
.ch-rescue .ch-payouts-total { display: block; margin-top: 2px; font-size: .55em; font-family: system-ui, sans-serif; color: var(--ch-cream); opacity: .85; }
.ch-rescue .ch-payouts-total:empty { display: none; }
.ch-rescue .ch-payouts:hover, .ch-rescue .ch-payouts:focus-visible { color: var(--ch-cream); }
.ch-rescue.ch-miss { background: rgba(193,38,15,.12); border-color: var(--ch-rust); }
.ch-rescue.ch-miss p { color: var(--ch-rust); }
.ch-paws { display: flex; justify-content: center; align-items: flex-end; gap: 14px; }
.ch-paws span { position: relative; display: inline-flex; }
.ch-paws span:nth-child(2) { transform: translateY(-8px); }
.ch-paws img { position: relative; width: 50px; height: 50px; object-fit: contain; filter: grayscale(1) brightness(.3) drop-shadow(0 3px 0 var(--ch-ol)); }
.ch-paws span:nth-child(2) img { width: 60px; height: 60px; }
.ch-paws img.ch-lit { filter: drop-shadow(0 3px 0 var(--ch-ol)) drop-shadow(0 0 12px rgba(255,201,60,.7)); animation: ch-paw .55s var(--ch-ease-pop) both; }
.ch-paws span.ch-lit::before { content: ''; position: absolute; inset: -14px; border-radius: 50%; background: radial-gradient(circle, rgba(255,201,60,.55), rgba(255,201,60,0) 65%); animation: ch-burst .7s ease-out both; animation-delay: inherit; }
@keyframes ch-paw { 0% { transform: scale(0) rotate(-30deg); opacity: 0; } 70% { transform: scale(1.3) rotate(8deg); opacity: 1; } 100% { transform: scale(1); } }
@keyframes ch-burst { 0% { transform: scale(.2); opacity: 0; } 40% { opacity: 1; } 100% { transform: scale(1.4); opacity: .55; } }
.ch-score { width: 100%; border-collapse: collapse; font-size: clamp(15px, 1vw + 11px, 19px); }
.ch-score td { text-align: left; padding: 6px 6px; border-bottom: 2px dashed rgba(153,102,204,.3); }
.ch-score tr { animation: ch-rise .35s ease-out both; }
.ch-score td:last-child { text-align: right; font-variant-numeric: tabular-nums; color: var(--ch-mint); }
.ch-score tr.ch-total td { border-bottom: 0; font-size: 1.45em; color: var(--ch-coin); padding-top: 12px; text-shadow: 0 2px 0 var(--ch-ol), 0 0 14px rgba(255,201,60,.45); }
.ch-score tr.ch-total td:last-child { color: var(--ch-coin); }
.ch-score tr.ch-total.ch-done td:last-child { animation: ch-bump .45s var(--ch-ease-pop); }
.ch-score .ch-neg { color: var(--ch-pink) !important; }
.ch-meta { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--ch-lav); display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; }
.ch-meta code { color: var(--ch-cream); }
.ch-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.ch-confetti i { position: absolute; top: -20px; width: 9px; height: 14px; border: 2px solid var(--ch-ol); animation: ch-fall linear forwards; }
@keyframes ch-fall { 0% { transform: translateY(0) rotate(0); opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } }

/* ---------- yard overlay + loading ---------- */
.ch-yardbar { pointer-events: none; }
.ch-yardbar > * { pointer-events: auto; }
.ch-yard-title { position: absolute; top: calc(var(--ch-sat) + var(--ch-gap)); left: 50%; transform: translateX(-50%); text-align: center; pointer-events: none; white-space: nowrap; }
.ch-yard-title .ch-h2 { font-size: clamp(22px, 3vmin + 10px, 36px); }
.ch-yard-title .ch-sub { display: inline-block; margin-top: 6px; padding: 4px 12px; border-radius: 12px; background: rgba(13,6,22,.78); border: 2px solid var(--ch-ol); color: var(--ch-cream); font-family: system-ui, sans-serif; font-size: 13px; font-weight: 600; text-shadow: none; box-shadow: 0 2px 0 var(--ch-ol); }
.ch-loading { align-items: center; justify-content: center; flex-direction: column; gap: 14px; background: radial-gradient(ellipse at 50% 45%, #2d1438 0%, var(--ch-night) 70%); }
.ch-loading img { width: 72px; height: 72px; animation: ch-spin 1.1s steps(8) infinite; filter: drop-shadow(0 4px 0 var(--ch-ol)) drop-shadow(0 0 16px rgba(255,201,60,.4)); }
.ch-loading p { font-size: 24px; margin: 0; text-shadow: 0 3px 0 var(--ch-ol); }
.ch-loading .ch-bar { width: min(240px, 60vw); height: 12px; border-radius: 8px; border: 2px solid var(--ch-ol); background: rgba(13,6,22,.7); overflow: hidden; box-shadow: 0 2px 0 var(--ch-ol); }
.ch-loading .ch-bar i { display: block; height: 100%; width: 40%; border-radius: 6px; background: linear-gradient(90deg, var(--ch-pink), var(--ch-coin)); animation: ch-load 1.2s ease-in-out infinite; }
@keyframes ch-load { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
.ch-loading small { font-family: system-ui, sans-serif; font-size: 13px; color: var(--ch-lav); max-width: 34ch; text-align: center; }
@keyframes ch-spin { to { transform: rotate(360deg); } }

@media (max-width: 520px) {
  .ch-chip { height: 36px; font-size: 16px; padding: 0 10px 0 5px; }
  .ch-chip img, .ch-chip .ch-ico { width: 22px; height: 22px; }
  .ch-chip .ch-ico { font-size: 17px; }
  .ch-hud-top { flex-wrap: wrap; }
  .ch-hud-right { position: absolute; top: 0; right: 0; }
  .ch-hud-right .ch-btn.ch-icon { width: 42px; height: 42px; font-size: 19px; }
  .ch-chips { padding-right: 96px; }
  .ch-obj { order: 3; flex-basis: 100%; }
  .ch-obj-inner { width: 100%; font-size: 15px; padding: 5px 12px 6px 40px; }
  .ch-pick-head .ch-h2 { font-size: 23px; }
  .ch-pick-head .ch-sub { font-size: 12px; }
  .ch-crew-btn { width: 50px; height: 50px; }
  .ch-slot { width: 54px; height: 54px; }
  .ch-slot-names { display: none; }
  .ch-pick-bar .ch-btn { flex: 1; }
  .ch-hint { max-width: calc(100vw - 24px); width: max-content; bottom: auto; top: calc(var(--ch-sat) + 124px); padding: 5px 12px 5px 16px; font-size: 13px; line-height: 1.3;
    border-width: 2px; box-shadow: 0 2px 0 var(--ch-ol), 0 6px 14px rgba(0,0,0,.3); background: rgba(252,236,187,.92); }
  .ch-hint::before { border-width: 2px; left: -2px; top: -2px; bottom: -2px; width: 8px; }
  .ch-toasts { top: calc(var(--ch-sat) + 178px); }
  .ch-toast { font-size: 17px; padding: 6px 14px; }
  .ch-crew { top: calc(var(--ch-sat) + 196px); }
  .ch-banner { padding: 7px 18px; }
  .ch-paws img { width: 42px; height: 42px; } .ch-paws span:nth-child(2) img { width: 50px; height: 50px; }
  .ch-title-text { font-size: clamp(44px, 15vw, 80px); }
}
@media (max-height: 460px) {
  .ch-title { flex-direction: row; flex-wrap: wrap; align-content: center; column-gap: 40px; row-gap: 10px; }
  .ch-title .ch-brand { flex-direction: column; }
  .ch-title .ch-logo { width: 110px; }
  .ch-title .ch-title-text { font-size: 58px; }
  .ch-title .ch-ribbon { display: none; }
  .ch-title .ch-menu { width: min(280px, 40vw); }
  .ch-crew { top: calc(var(--ch-sat) + 58px); }
  /* Landscape phones: the cat sits mid-screen, so toasts go to a right-hand column under the HUD. */
  .ch-toasts { top: calc(var(--ch-sat) + 92px); left: auto; right: calc(var(--ch-sar) + 12px); align-items: flex-end; gap: 6px; }
  .ch-toast { font-size: 16px; padding: 4px 12px; }
  .ch-obj-inner { font-size: 14px; padding: 4px 12px 4px 38px; }
  .ch-obj-inner::before { width: 20px; height: 20px; margin-top: -10px; left: 9px; }
  .ch-obj-inner::after { left: 9px; width: 24px; margin-top: -8px; font-size: 13px; }
  .ch-hint { bottom: calc(var(--ch-sab) + 10px); max-width: min(460px, 46vw); padding: 6px 12px 6px 16px; font-size: 13px; }
  .ch-crew-btn { width: 48px; height: 48px; }
  .ch-crew-key { display: none; }
  .ch-dialog { gap: 8px; padding: 14px; }
  .ch-results .ch-dialog { padding-top: 22px; width: min(620px, 100%); }
  .ch-banner { margin-top: -40px; padding: 5px 22px; }
  .ch-paws img { width: 32px; height: 32px; } .ch-paws span:nth-child(2) img { width: 38px; height: 38px; }
  .ch-rescue { padding: 6px; } .ch-rescue canvas { width: 52px; height: 52px; }
  .ch-score td { padding: 3px 6px; }
  .ch-results .ch-dialog > .ch-scroll { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); grid-template-areas: 'paws table' 'rescue table' 'meta meta' 'btns btns'; column-gap: 16px; row-gap: 8px; align-items: center; }
  .ch-results .ch-paws { grid-area: paws; }
  .ch-results .ch-rescue { grid-area: rescue; }
  .ch-results .ch-rescue p small { display: none; }
  .ch-results .ch-rescue p { font-size: 16px; }
  .ch-results .ch-score { grid-area: table; font-size: 15px; }
  .ch-results .ch-meta { grid-area: meta; }
  .ch-results .ch-scroll > .ch-row { grid-area: btns; }
  .ch-results .ch-btn.ch-big { min-height: 46px; padding: 8px 20px; font-size: 22px; }
  .ch-keys { padding: 8px 12px; gap: 4px 12px; }
  .ch-pad { transform: scale(.85); transform-origin: bottom right; }
  .ch-stick-zone { height: 80%; }
  .ch-grid { grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); }
  .ch-pick-head { min-height: 44px; padding-bottom: 4px; }
  .ch-pick-head .ch-h2 { font-size: 24px; }
  .ch-pick-bar { padding-top: 6px; padding-bottom: calc(var(--ch-sab) + 6px); }
  .ch-pick-bar .ch-btn.ch-big { min-height: 48px; padding: 8px 24px; font-size: 22px; }
  .ch-slot { width: 48px; height: 48px; }
}
.ch-touching .ch-crew-key, .ch-touching .ch-keys { display: none; }
@media (prefers-reduced-motion: reduce) {
  .ch-ui *, .ch-ui *::before, .ch-ui *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
  .ch-floaty, .ch-stars, .ch-confetti, .ch-iris { display: none; }
}
.ch-reduced *, .ch-reduced *::before, .ch-reduced *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
.ch-reduced .ch-iris, .ch-reduced .ch-confetti { display: none; }
`;

let injected = false;

/** Inject the UI stylesheet (and the Cat Paw @font-face, resolved against `base`) once. */
export function ensureStyles(base = ASSET_BASE): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.dataset.ch = 'ui';
  style.textContent = `@font-face { font-family: 'Cat Paw'; src: url('${base}fonts/catpaw.woff2') format('woff2'); font-display: swap; }\n${CSS}`;
  document.head.appendChild(style);
}
