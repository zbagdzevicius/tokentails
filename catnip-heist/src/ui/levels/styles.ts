/** Styles for the level select and the results-screen campaign strip (own <style> tag). */

const CSS = `
.ch-lv { position: absolute; inset: 0; display: none; flex-direction: column; pointer-events: auto; overflow: hidden;
  padding: calc(12px + var(--ch-sat, 0px)) calc(16px + var(--ch-sar, 0px)) calc(12px + var(--ch-sab, 0px)) calc(16px + var(--ch-sal, 0px));
  background: radial-gradient(ellipse 120% 80% at 50% 0%, #4b1d6e 0%, #301934 45%, #0d0616 100%); color: var(--ch-cream, #fcecbb); }
.ch-lv.ch-on { display: flex; animation: ch-lv-in .3s ease-out both; }
@keyframes ch-lv-in { from { opacity: 0; } to { opacity: 1; } }
.ch-lv-head { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; }
.ch-lv-head h2 { margin: 0; font-size: clamp(22px, 4vmin, 34px); color: var(--ch-coin, #ffc93c);
  text-shadow: 0 3px 0 var(--ch-ol, #2a0f1f), 2px 0 0 var(--ch-ol, #2a0f1f), -2px 0 0 var(--ch-ol, #2a0f1f); }
.ch-lv-head .ch-lv-sub { margin: 2px 0 0; font-size: 14px; opacity: .85; }
.ch-lv-total { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 18px; padding: 6px 12px;
  border: 3px solid var(--ch-ol, #2a0f1f); border-radius: 12px; background: rgba(13,6,22,.55); }
.ch-lv-total .ch-svg, .ch-lv-stars .ch-on { color: var(--ch-coin, #ffc93c); }
.ch-lv-body { flex: 1 1 auto; min-height: 0; display: flex; gap: 16px; margin-top: 12px; }
.ch-lv-mapwrap { position: relative; flex: 1 1 auto; min-width: 0; overflow: auto; -webkit-overflow-scrolling: touch; }
.ch-lv-map { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: minmax(150px, auto);
  gap: clamp(14px, 3vmin, 34px); padding: 12px 8px 20px; min-height: 100%; box-sizing: border-box; align-content: center; }
.ch-lv-path { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.ch-lv-path path { fill: none; stroke-width: 9; stroke-linecap: round; stroke-dasharray: .1 16; }
.ch-lv-path .ch-lv-open { stroke: var(--ch-coin, #ffc93c); }
.ch-lv-path .ch-lv-shut { stroke: rgba(153,102,204,.45); }
.ch-lv-card { position: relative; z-index: 1; grid-column: var(--c4); grid-row: var(--r4); align-self: center;
  display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; cursor: pointer;
  padding: 12px 10px 10px; border: 3px solid var(--ch-ol, #2a0f1f); border-radius: 18px; min-height: 44px;
  background: linear-gradient(180deg, rgba(86,46,110,.95), rgba(48,25,58,.95)); color: inherit; font: inherit;
  box-shadow: 0 5px 0 var(--ch-ol, #2a0f1f), 0 10px 22px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.2);
  transition: transform .15s ease, box-shadow .15s ease; }
.ch-lv-card:hover:not([disabled]) { transform: translateY(-3px); }
.ch-lv-card[aria-current="true"] { border-color: var(--ch-coin, #ffc93c); box-shadow: 0 5px 0 var(--ch-ol, #2a0f1f), 0 0 0 4px rgba(255,201,60,.35), 0 10px 22px rgba(0,0,0,.35); }
.ch-lv-card[disabled] { cursor: not-allowed; filter: grayscale(.75) brightness(.7); }
.ch-lv-num { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; font-size: 20px;
  background: var(--ch-coin, #ffc93c); color: var(--ch-ol, #2a0f1f); border: 3px solid var(--ch-ol, #2a0f1f); }
.ch-lv-card[data-won="true"] .ch-lv-num { background: var(--ch-mint, #d5f4e5); }
.ch-lv-card[disabled] .ch-lv-num { background: #6b5a78; color: #2a0f1f; }
.ch-lv-name { font-size: 16px; line-height: 1.15; }
.ch-lv-best { font-size: 13px; opacity: .85; }
.ch-lv-lock { font-size: 12px; opacity: .9; display: flex; align-items: center; gap: 4px; }
.ch-lv-stars { display: flex; gap: 2px; font-size: 18px; color: rgba(252,236,187,.28); }
.ch-lv-stars .ch-svg { font-size: inherit; }
.ch-lv-detail { flex: 0 0 min(320px, 34%); display: flex; flex-direction: column; gap: 10px; padding: 16px; overflow: auto;
  border: 3px solid var(--ch-ol, #2a0f1f); border-radius: 20px; background: linear-gradient(180deg, rgba(86,46,110,.9), rgba(34,16,44,.92));
  box-shadow: 0 6px 0 var(--ch-ol, #2a0f1f), 0 18px 40px rgba(0,0,0,.4); }
.ch-lv-detail h3 { margin: 0; font-size: 22px; color: var(--ch-coin, #ffc93c); }
.ch-lv-detail p { margin: 0; font-size: 14px; line-height: 1.35; }
.ch-lv-facts { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; opacity: .9; }
.ch-lv-rules { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.ch-lv-rules li { display: flex; align-items: flex-start; gap: 8px; }
.ch-lv-rules li .ch-svg { font-size: 18px; color: rgba(252,236,187,.3); flex: 0 0 auto; }
.ch-lv-rules li.ch-on .ch-svg { color: var(--ch-coin, #ffc93c); }
.ch-lv-rules b { display: block; font-weight: normal; color: var(--ch-cream, #fcecbb); }
.ch-lv-rules small { opacity: .75; }
.ch-lv-rescue { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.ch-lv-go { margin-top: auto; }
.ch-lv-res { display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 8px 0 4px; text-align: center; }
.ch-lv-res .ch-lv-stars { font-size: 26px; }
.ch-lv-res .ch-lv-new { color: var(--ch-coin, #ffc93c); animation: ch-lv-pop .5s cubic-bezier(.2,1.4,.4,1) both; }
.ch-lv-res small { font-size: 12px; opacity: .8; }
.ch-lv-resrow { display: flex; justify-content: center; gap: 10px; margin-top: 4px; width: 100%; }
.ch-lv-resrow .ch-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; flex: 1 1 0; width: auto; min-width: 0; padding-left: 10px; padding-right: 10px; }
.ch-lv-resrow .ch-btn:only-child { flex: 0 1 60%; }
@keyframes ch-lv-pop { 0% { transform: scale(.2); } 100% { transform: scale(1); } }
@media (max-width: 760px), (max-height: 460px) {
  .ch-lv-body { flex-direction: column; overflow: auto; }
  .ch-lv-mapwrap { overflow: visible; flex: 0 0 auto; }
  .ch-lv-detail { flex: 0 0 auto; }
}
@media (max-width: 560px) {
  .ch-lv-map { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: minmax(130px, auto); }
  .ch-lv-card { grid-column: var(--c2); grid-row: var(--r2); }
}
@media (prefers-reduced-motion: reduce) {
  .ch-lv.ch-on, .ch-lv-res .ch-lv-new { animation: none; }
  .ch-lv-card { transition: none; }
}
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
