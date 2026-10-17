/** Cat maker CSS (mobile portrait first, ≥ 44 px targets, safe areas). Injected once on open. */
export const CATMAKER_CSS = `
.bcm{--bg:#2b1d2e;--panel:#3a2740;--panel2:#4a3350;--ink:#fbeee0;--mute:#c9b3c4;--accent:#ffb36b;--accent-ink:#2b1d2e;--pink:#ff8fb1;--line:rgba(251,238,224,.16);
  position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);
  font:16px/1.35 ui-rounded,"SF Pro Rounded",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;overflow:hidden;touch-action:manipulation}
.bcm *{box-sizing:border-box}
.bcm-screen{flex:1;display:flex;flex-direction:column;min-height:0;width:100%;max-width:520px;margin:0 auto;padding:16px}
.bcm h1{font-size:28px;line-height:1.1;margin:8px 0 6px;font-weight:800;letter-spacing:-.01em}
.bcm p{margin:0;color:var(--mute)}
.bcm-grow{flex:1;min-height:0}
.bcm-hero{flex:1;display:flex;align-items:center;justify-content:center;min-height:120px}
.bcm-hero svg{width:min(56vw,220px);height:auto}
.bcm-hero-canvas{width:min(80vw,320px);height:min(34vh,300px);display:block}
.bcm-actions{display:flex;flex-direction:column;gap:10px;padding-top:12px}
.bcm-btn{appearance:none;border:0;border-radius:16px;min-height:56px;padding:12px 18px;font:inherit;font-weight:700;font-size:18px;
  background:var(--panel2);color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;touch-action:manipulation}
.bcm-btn:active{transform:translateY(1px) scale(.99)}
.bcm-btn:focus-visible,.bcm-chip:focus-visible,.bcm-name:focus-visible{outline:3px solid var(--pink);outline-offset:2px}
.bcm-btn.primary{background:var(--accent);color:var(--accent-ink);box-shadow:0 4px 0 #c27a3c}
.bcm-btn.ghost{background:transparent;color:var(--mute);min-height:48px;font-weight:600;font-size:16px;text-decoration:underline;text-underline-offset:3px}
.bcm-btn[disabled]{opacity:.5;pointer-events:none}
.bcm-row{display:flex;gap:10px}
.bcm-row>.bcm-btn{flex:1}
.bcm-err{background:#5a2a36;color:#ffd9de;border-radius:12px;padding:10px 12px;margin-top:10px;font-size:15px}
.bcm-err:empty{display:none}
.bcm-busy{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(43,29,46,.7);font-weight:700;z-index:2}
.bcm-busy.on{display:flex}
/* crop */
.bcm-stage{position:relative;flex:1;min-height:0;border-radius:18px;overflow:hidden;background:#1d1320;touch-action:none}
.bcm-stage canvas{position:absolute;left:0;top:0;display:block}
.bcm-oval{position:absolute;left:0;top:0;pointer-events:none;will-change:transform}
.bcm-oval::before{content:"";position:absolute;inset:0 5%;border-radius:50%;border:3px dashed var(--accent);
  box-shadow:0 0 0 9999px rgba(20,12,22,.55)}
.bcm-hint{text-align:center;padding:10px 0 2px;font-size:15px}
.bcm-zoom{display:flex;align-items:center;gap:10px;padding-top:8px}
.bcm-zoom input{flex:1;height:44px;accent-color:var(--accent)}
.bcm-zoom .bcm-btn{min-height:44px;min-width:48px;padding:0}
/* confirm */
.bcm-preview{position:relative;height:min(36vh,300px);flex:none;border-radius:20px;background:radial-gradient(circle at 50% 40%,#5a3f62,#2f2133 70%);overflow:hidden}
.bcm-preview canvas{width:100%;height:100%;display:block}
.bcm-badge{position:absolute;left:10px;top:10px;font-size:13px;background:rgba(0,0,0,.3);padding:4px 8px;border-radius:999px;color:var(--mute)}
.bcm-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:8px 2px 4px;margin:0 -2px;touch-action:pan-y}
.bcm-group{margin-top:12px}
.bcm-label{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--mute);margin-bottom:6px;font-weight:700}
.bcm-chips{display:flex;flex-wrap:wrap;gap:8px}
.bcm-chip{appearance:none;border:2px solid var(--line);background:var(--panel);color:var(--ink);border-radius:999px;min-height:44px;min-width:44px;
  padding:0 14px;font:inherit;font-weight:600;font-size:15px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;touch-action:manipulation}
.bcm-chip[aria-pressed="true"]{border-color:var(--accent);background:var(--panel2);box-shadow:inset 0 0 0 1px var(--accent)}
.bcm-chip.swatch{padding:0;width:44px}
.bcm-chip.swatch span{width:30px;height:30px;border-radius:50%;margin:auto;border:2px solid rgba(0,0,0,.25)}
.bcm-chip.swatch.photo span{outline:2px dotted var(--ink);outline-offset:2px}
.bcm-name{width:100%;min-height:52px;border-radius:14px;border:2px solid var(--line);background:var(--panel);color:var(--ink);
  font:inherit;font-size:20px;font-weight:700;padding:0 14px;-webkit-user-select:text;user-select:text}
.bcm-footer{flex:none;padding-top:10px;display:flex;flex-direction:column;gap:6px}
.bcm-busy{flex-direction:column;gap:8px}
.bcm-paw{font-size:34px;animation:bcm-bob .7s ease-in-out infinite alternate}
@keyframes bcm-bob{from{transform:translateY(0) rotate(-8deg)}to{transform:translateY(-6px) rotate(8deg)}}
.bcm.drop::after{content:"Drop it like it’s a glass on a counter";position:absolute;inset:12px;border:3px dashed var(--accent);border-radius:20px;
  display:flex;align-items:center;justify-content:center;background:rgba(43,29,46,.85);font-weight:800;font-size:20px;z-index:3;pointer-events:none}
.bcm-note{font-size:14px;color:var(--mute);margin:6px 0 0}
.bcm-scrub{padding-top:10px}
.bcm-scrub input{width:100%;height:40px;accent-color:var(--pink)}
.bcm-chip.pop{animation:bcm-pop .22s ease-out}
@keyframes bcm-pop{0%{transform:scale(.9)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
.bcm-chip.guess{border-style:dashed}
.bcm-chip.guess::after{content:"✨";font-size:13px;margin-left:2px}
.bcm-chip.cos{padding:0 14px 0 6px}
.bcm-chip.cos span{width:26px;height:26px;border-radius:50%;border:2px solid rgba(0,0,0,.25);flex:none}
/* your cats */
.bcm-cats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding-top:12px}
.bcm-card{background:var(--panel);border:2px solid var(--line);border-radius:18px;padding:8px;display:flex;flex-direction:column;gap:6px;min-width:0}
.bcm-card.on{border-color:var(--accent);box-shadow:0 0 0 2px rgba(255,179,107,.25)}
.bcm-card-pick{appearance:none;border:0;background:none;color:var(--ink);font:inherit;padding:0;cursor:pointer;text-align:center;min-width:0}
.bcm-card-art{height:120px;border-radius:14px;background:radial-gradient(circle at 50% 40%,#5a3f62,#2f2133 70%);overflow:hidden}
.bcm-card-art canvas{width:100%;height:100%;display:block}
.bcm-card-name{font-weight:800;font-size:17px;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bcm-card-sub{font-size:13px;color:var(--mute)}
.bcm-card.on .bcm-card-sub{color:var(--accent);font-weight:700}
.bcm-card-row{display:flex;gap:6px}
.bcm-mini{appearance:none;flex:1;border:0;border-radius:12px;min-height:44px;background:var(--panel2);color:var(--ink);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.bcm-mini.danger{color:#ffd9de}
.bcm-mini.armed{background:#8a2f45;color:#fff}
.bcm-mini[disabled]{opacity:.4;pointer-events:none}
.bcm-card.add{appearance:none;align-items:center;justify-content:center;min-height:200px;border-style:dashed;color:var(--mute);font:inherit;font-weight:700;cursor:pointer}
.bcm-plus{font-size:44px;line-height:1;color:var(--accent)}
.bcm-extras{padding-top:12px}
.bcm-upsell{appearance:none;width:100%;display:flex;align-items:center;gap:12px;text-align:left;border:2px dashed var(--pink);border-radius:18px;
  background:rgba(255,143,177,.1);color:var(--ink);font:inherit;padding:12px 14px;cursor:pointer;min-height:56px}
.bcm-upsell small{color:var(--mute)}
.bcm-upsell-cats{font-size:24px;flex:none}
@media (prefers-reduced-motion:reduce){.bcm-paw,.bcm-chip.pop{animation:none}}
@media (min-width:700px) and (min-height:600px){.bcm-cats{grid-template-columns:repeat(3,minmax(0,1fr))}.bcm-screen{padding:24px}.bcm-preview{height:min(40vh,340px)}}
`;

export function injectStyles(doc: Document = document): void {
  if (doc.getElementById('bcm-style')) return;
  const el = doc.createElement('style');
  el.id = 'bcm-style';
  el.textContent = CATMAKER_CSS;
  doc.head.appendChild(el);
}
