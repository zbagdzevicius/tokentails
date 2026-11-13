/**
 * The `/legends` landing stylesheet (landing A/B arm B; port of the scroll-lane-map landing), scoped under `.lgb` so it
 * never leaks into the rest of the site. Ported from the original by a scoping pass: selectors prefixed with `.lgb`,
 * `:root`/`body`/`html.x` mapped onto the root, keyframes renamed `lgb-*`, the inlined fonts replaced by the
 * `/pawlegends` landing's Fredoka file and the site's Nunito. Edit it here by hand now.
 */
import { LEGENDS_FONT } from "./markup";

// eslint-disable-next-line tt/no-raw-font -- the ported landing keeps its own faces (Fredoka display, site Nunito body), scoped to .lgb
export const LEGENDS_CSS = `@font-face{font-family:"Fredoka";src:url("${LEGENDS_FONT}") format("woff2");font-weight:300 700;font-display:swap}
.lgb{--grass:#86c95c;--grass2:#79bf51;--grass3:#62ab45;--forest:#2f7a36;--forest2:#215c28;
  --sand:#f4d79c;--sand2:#ead0a0;--sandEdge:#d39c52;
  --paper:#fffaf0;--paper2:#fbefd9;--ink:#2b1d2a;--ink2:#56424f;
  --pink:#ec5a8d;--pinkD:#bf2f63;--pinkL:#ffd3e2;
  --navy:#1f3d91;--navyD:#132a66;--navyL:#cfdcff;
  --gold:#ffc83d;--goldD:#d79a12;--river:#5bb8ee;--riverD:#2f8fd0;
  --lc:clamp(220px,25vw,340px);--gap:clamp(260px,36vh,380px);
  --ease-out:cubic-bezier(.16,1,.3,1);--ease-back:cubic-bezier(.34,1.56,.64,1);--ease-in:cubic-bezier(.55,0,.75,.2);
  color-scheme:light;
  --disp:"Fredoka",ui-rounded,system-ui,sans-serif;--body:"Nunito",system-ui,sans-serif;}
.lgb *{box-sizing:border-box}
.lgb{scroll-behavior:auto;-webkit-text-size-adjust:100%}
.lgb{margin:0;background:var(--grass);color:var(--ink);font:500 17px/1.6 var(--body);overflow-x:clip}
.lgb::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:radial-gradient(closest-side,#93d26688,#93d26600) 0 0/700px 560px,radial-gradient(closest-side,#74b84d66,#74b84d00) 350px 280px/700px 560px}
.lgb img{max-width:100%;display:block}
.lgb a{color:inherit}
.lgb :focus-visible{outline:3px solid var(--gold);outline-offset:3px;border-radius:10px}
.lgb .skip{position:absolute;left:12px;top:-60px;z-index:100;background:var(--paper);padding:10px 14px;border-radius:10px;font-weight:800;text-decoration:none}
.lgb .skip:focus{top:12px}
.lgb .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.lgb .hud{position:fixed;inset:12px 16px auto;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:12px;pointer-events:none}
.lgb .hud>*{pointer-events:auto}
.lgb .brand{font:700 26px/1 var(--disp);text-decoration:none;color:#fff6e6;letter-spacing:.01em;
  -webkit-text-stroke:6px #4a2b35;paint-order:stroke fill;filter:drop-shadow(0 3px 0 #4a2b3566)}
.lgb .brand b{color:var(--pink);font-weight:700}
.lgb .brand img{display:block;width:150px;height:auto;-webkit-text-stroke:0;filter:none}
.lgb .score{display:flex;align-items:center;gap:10px;background:#2b1d2ae6;color:#fff;border-radius:16px;padding:7px 14px;
  font:700 13px/1 var(--body);letter-spacing:.12em;text-transform:uppercase;box-shadow:0 6px 0 #0000002e;backdrop-filter:blur(6px)}
.lgb .score .t{display:flex;align-items:center;gap:6px}
.lgb .score .t::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--pink);box-shadow:0 0 0 2px #fff3}
.lgb .score .t.dog::before{background:#5d86ff}
.lgb .twi{display:flex;gap:5px;padding:0 6px;border-left:1px solid #ffffff2a;border-right:1px solid #ffffff2a;perspective:200px}
.lgb .twi i{position:relative;width:14px;height:18px;transform-style:preserve-3d}
.lgb .twi i::before,.lgb .twi i::after{content:"";position:absolute;inset:0;backface-visibility:hidden;border-radius:7px 7px 3px 3px}
.lgb .twi i::before{background:linear-gradient(#ffc83d 0 32%,#3c64d6 32%)}
.lgb .twi i::after{transform:rotateY(180deg);border-radius:5px;background:#e2385f;
  -webkit-mask:linear-gradient(45deg,#0000 42%,#000 42% 58%,#0000 58%),linear-gradient(-45deg,#0000 42%,#000 42% 58%,#0000 58%);mask:linear-gradient(45deg,#0000 42%,#000 42% 58%,#0000 58%),linear-gradient(-45deg,#0000 42%,#000 42% 58%,#0000 58%)}
.lgb .twi i.x{transform:rotateY(180deg)}
.lgb:not(.mo) .twi i{transition:transform .5s var(--ease-back)}
.lgb .score .lbl{color:#ffffffb8;font-size:11px;min-width:13ch}
.lgb .btn{--b:var(--pinkD);display:inline-flex;align-items:center;gap:10px;font:700 18px/1 var(--disp);letter-spacing:.01em;text-decoration:none;color:#fff;
  background:linear-gradient(180deg,#f06b9a,var(--b));border:3px solid #4a1d32;border-radius:16px;padding:15px 22px 16px;
  box-shadow:0 6px 0 #4a1d32, 0 12px 24px #4a1d3240;position:relative;overflow:hidden;isolation:isolate}
.lgb .btn::after{content:"";position:absolute;inset:-2px;z-index:-1;background:linear-gradient(110deg,transparent 30%,#ffffff70 48%,transparent 62%);transform:translateX(-120%);transition:transform .7s var(--ease-out)}
.lgb .btn:hover::after{transform:translateX(120%)}
.lgb:not(.mo) .btn{transition:transform .25s var(--ease-back)}
.lgb:not(.mo) .btn:hover{transform:translateY(-3px)}
.lgb .btn .paw{width:22px;height:22px;flex:none}
.lgb .btn.sm{font-size:15px;padding:10px 14px 11px;border-radius:13px;box-shadow:0 4px 0 #4a1d32}
.lgb .btn.ghost{background:var(--paper);color:var(--ink);border-color:var(--ink);box-shadow:0 6px 0 var(--ink)}
.lgb .toast{position:fixed;left:50%;top:68px;bottom:auto;z-index:45;transform:translate(-50%,-140%);pointer-events:none;text-align:center;white-space:nowrap;display:flex;align-items:center;gap:12px;padding:10px 16px 10px 20px;border-radius:999px;background:var(--navyD);box-shadow:0 6px 0 #0b1a44,0 14px 30px #0b1a4455;border:3px solid #fff;opacity:0;visibility:hidden}
.lgb .toast.on{visibility:visible;animation:lgb-pillIn .5s var(--ease-back) forwards, lgb-pillOut .4s var(--ease-in) 2.3s forwards}
@keyframes lgb-pillIn{from{opacity:0;transform:translate(-50%,-30px) scale(.7)}to{opacity:1;transform:translateX(-50%)}}
@keyframes lgb-pillOut{from{opacity:1;transform:translateX(-50%)}to{opacity:0;transform:translate(-50%,-24px) scale(.9);visibility:hidden}}
.lgb .toast .ln{display:block;font:700 clamp(20px,2.4vw,30px)/1 var(--disp);color:#fff;letter-spacing:.02em}
.lgb .toast .sub{display:inline-block;font:800 11px/1 var(--body);letter-spacing:.2em;text-transform:uppercase;background:#ffc83d;color:var(--navyD);padding:6px 10px;border-radius:8px;opacity:0}
.lgb .toast .ch{display:inline-block;opacity:0}
.lgb .toast.on .ch{animation:lgb-tIn .55s var(--ease-back) forwards;animation-delay:calc(.12s + var(--i)*26ms)}
.lgb .toast.on .sub{animation:lgb-subIn .5s var(--ease-out) .45s forwards}
@keyframes lgb-tIn{0%{opacity:0;transform:translateY(-18px) scale(1.5) rotate(-8deg)}100%{opacity:1;transform:none}}
@keyframes lgb-subIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.lgb .camclip{overflow:clip;position:relative}
.lgb .map{position:relative;z-index:0;overflow:clip;padding:96px 0 0;transform-origin:0 0}
.lgb .ground{position:absolute;left:0;right:0;top:-240px;bottom:0;z-index:0;pointer-events:none;will-change:transform;
  background-image:
   radial-gradient(circle at 20px 30px,#ffffffb0 0 1.6px,transparent 2.4px),
   radial-gradient(circle at 150px 70px,#f79bc0 0 1.8px,transparent 2.6px),
   radial-gradient(circle at 90px 190px,#b9a3ff 0 1.6px,transparent 2.4px),
   radial-gradient(circle at 200px 140px,#ffe06b 0 1.6px,transparent 2.4px),
   radial-gradient(circle at 60px 110px,#ffffff80 0 1.3px,transparent 2px);
  background-size:240px 240px}
.lgb .lane{position:absolute;left:0;top:0;z-index:1;pointer-events:none;overflow:visible}
.lgb .lane .edge{stroke:var(--sandEdge);fill:none;stroke-linecap:round;stroke-linejoin:round}
.lgb .lane .fill{stroke:var(--sand);fill:none;stroke-linecap:round;stroke-linejoin:round}
.lgb .lane .hi{stroke:#fbe8c0;fill:none;stroke-linecap:round;opacity:.65}
.lgb .lane .mark{stroke:#d9ad6a;fill:none;stroke-linecap:round;stroke-dasharray:1 20;stroke-width:4}
.lgb .lane .glow{stroke:#ec5a8d55;fill:none;stroke-linecap:round;stroke-width:16}
.lgb .lane .trail{stroke:var(--pink);fill:none;stroke-linecap:round;stroke-width:5}
.lgb .trees,.lgb .crowns{position:absolute;inset:0;z-index:2;pointer-events:none}
.lgb .crowns{z-index:3;will-change:transform}
.lgb .tree{position:absolute;width:var(--s);height:var(--s);transform:translate(-50%,-50%);border-radius:46% 54% 50% 50%;
  background:radial-gradient(circle at 50% 60%,#2f7a36,#245f2b);box-shadow:calc(var(--s)*.16) calc(var(--s)*.2) 0 #1d4f2440}
.lgb .crown{position:absolute;width:var(--s);height:var(--s);transform:translate(-50%,-50%)}
.lgb .crown::before,.lgb .crown::after{content:"";position:absolute;border-radius:46% 54% 50% 50%;background:radial-gradient(circle at 34% 28%,#a5e070 0 12%,#5fb443 45%,#2f7a36 100%)}
.lgb .crown::before{inset:-4% 2% 6% -2%}
.lgb .crown::after{width:62%;height:62%;left:44%;top:-12%;filter:brightness(1.08)}
.lgb .shadowfx{position:fixed;inset:0;z-index:3;pointer-events:none;overflow:hidden}
.lgb .cloud{position:absolute;width:60vw;height:40vw;border-radius:50%;background:radial-gradient(closest-side,#0d3a1a22,#0d3a1a00);animation:lgb-drift 46s linear infinite}
.lgb .cloud.b{width:44vw;height:30vw;top:55%;animation-duration:64s;animation-delay:-30s}
@keyframes lgb-drift{from{transform:translate(-70vw,-10vh)}to{transform:translate(120vw,10vh)}}
.lgb .canopy{position:fixed;inset:0;z-index:30;pointer-events:none}
.lgb .canopy .lyr{position:absolute;left:0;right:0;top:0;height:3200px;will-change:transform}
.lgb .leaf{position:absolute;border-radius:50%;background:radial-gradient(circle at 40% 35%,#3f9a3f,#1b5226 70%);filter:blur(3px);opacity:.92}
.lgb .leg{position:relative;z-index:6;display:grid;grid-template-columns:var(--lc) 1fr;grid-template-areas:"lane content";
  max-width:1280px;margin:0 auto var(--gap);padding:0 24px;min-height:62vh}
.lgb .leg[data-side=R]{grid-template-columns:1fr var(--lc);grid-template-areas:"content lane"}
.lgb .lanecol{grid-area:lane;display:flex;align-items:center;justify-content:center;position:relative}
.lgb .anchor{position:relative;width:0;height:0}
.lgb .content{grid-area:content;align-self:center;position:relative}
.lgb .leg[data-side=L] .content{padding-left:clamp(12px,2vw,32px)}
.lgb .leg[data-side=R] .content{padding-right:clamp(12px,2vw,32px)}
.lgb .maplabel{display:inline-flex;align-items:center;gap:10px;margin:0 0 14px;font:900 12px/1 var(--body);letter-spacing:.24em;text-transform:uppercase;color:#fff;
  text-shadow:0 0 3px #1d4f24,0 0 6px #1d4f24,0 2px 0 #1d4f24}
.lgb .maplabel .pinw{perspective:120px;display:inline-block;flex:none}
.lgb .maplabel .pin{width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--navy);border:3px solid #fff;box-shadow:0 3px 0 #1d4f2466;display:grid;place-items:center;transition:background .2s}
.lgb .maplabel .pin b{transform:rotate(45deg);font:700 11px/1 var(--disp);color:#fff;letter-spacing:0;text-shadow:none}
.lgb .maplabel .pin.cat{background:var(--pink)}
.lgb .card{background:var(--paper);border:3px solid var(--ink);border-radius:24px;padding:clamp(20px,2.6vw,34px);box-shadow:0 8px 0 var(--ink),0 22px 40px #1d4f2433;position:relative}
.lgb .tape{position:absolute;top:-11px;left:30px;width:58px;height:20px;background:#ffe9a8cc;transform:rotate(-4deg);border-radius:3px;box-shadow:0 2px 4px #0002;z-index:2;transition:background .3s}
.lgb .card.cap .tape{background:#ff8db5d9}
.lgb .wipe{position:absolute;inset:0;border-radius:21px;clip-path:inset(-20px 0 0 0 round 21px);pointer-events:none;z-index:4;visibility:hidden}
.lgb .wipe i{position:absolute;top:-10%;bottom:-10%;left:0;width:46%;transform:skewX(-18deg);
  background:linear-gradient(90deg,#fff0 0,#ffd3e2 8%,#ec5a8d 22% 78%,#ffd3e2 92%,#fff0 100%)}
.lgb .wipe b{position:absolute;right:18px;top:6px;font:800 12px/1 var(--body);letter-spacing:.2em;text-transform:uppercase;color:#fff;background:var(--pinkD);border:2px solid #fff;
  box-shadow:0 3px 0 #8a1f47;padding:7px 10px;border-radius:999px;opacity:0;white-space:nowrap;transform:rotate(4deg)}
.lgb h2{font:700 clamp(34px,4.4vw,62px)/.98 var(--disp);margin:0 0 14px;letter-spacing:-.005em;color:var(--ink)}
.lgb h2 em{font-style:normal;color:var(--pinkD)}
.lgb h2 .dog{color:var(--navy)}
.lgb .kin .ln-mask{padding:.06em .08em .1em;margin:-.06em -.08em -.1em}
.lgb .kin .word{position:relative}
.lgb .kin svg.ul{position:absolute;left:-2%;bottom:-.14em;width:104%;height:.26em;overflow:visible;pointer-events:none}
.lgb .kin svg.ul path{fill:none;stroke:var(--pink);stroke-width:5;stroke-linecap:round}
.lgb p{margin:0 0 14px}
.lgb .lede{font-size:clamp(17px,1.35vw,19px);color:var(--ink2)}
.lgb .duo{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:clamp(18px,2.4vw,36px);align-items:center}
.lgb .hero{min-height:calc(100vh - 96px);margin-bottom:calc(var(--gap) - 40px)}
.lgb .wordmark{margin:0 0 18px;font:700 clamp(56px,8.3vw,124px)/.92 var(--disp);letter-spacing:-.01em;color:#fff6e6;
  -webkit-text-stroke:.12em #4a2b35;paint-order:stroke fill;filter:drop-shadow(0 .07em 0 #4a2b35);cursor:default}
.lgb .wordmark .l2{color:var(--pink)}
.lgb .wordmark .ch,.lgb .wordmark .chi{display:inline-block}
.lgb .wordmark img{display:block;width:min(460px,82vw,70vh);height:auto;margin-left:-14px;-webkit-user-drag:none;filter:drop-shadow(0 12px 18px #1d4f2466)}
.lgb .tag{font:700 clamp(20px,1.9vw,27px)/1.25 var(--disp);color:#fff;margin:22px 0 22px;text-shadow:0 2px 0 #1d4f24,0 0 10px #1d4f2499;max-width:32ch;text-wrap:balance}
.lgb .hero .card{max-width:560px}
.lgb .ctas{display:flex;flex-wrap:wrap;gap:14px 16px;align-items:center;margin-top:20px}
.lgb .gates{display:inline-flex;align-items:center;gap:10px;margin-top:22px;background:#2b1d2ae0;color:#fff;border-radius:999px;padding:8px 16px 8px 10px;font:700 15px/1 var(--disp);letter-spacing:.02em}
.lgb .gates .gdot{width:14px;height:14px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 0 #ffc83d99;animation:lgb-ping 1.2s var(--ease-out) infinite}
.lgb .gates.open .gdot{background:#7ef08a}
@keyframes lgb-ping{to{box-shadow:0 0 0 12px #ffc83d00}}
.lgb .gates .num{display:inline-block;min-width:1ch;transform-origin:50% 80%}
.lgb .scrollhint{display:flex;align-items:center;gap:10px;margin-top:26px;font:800 12px/1 var(--body);letter-spacing:.22em;text-transform:uppercase;color:#fff;text-shadow:0 0 4px #1d4f24,0 2px 0 #1d4f24}
.lgb .scrollhint svg{animation:lgb-bob 1.6s var(--ease-out) infinite}
@keyframes lgb-bob{50%{transform:translateY(6px)}}
.lgb.mo .hero .ani,.lgb.mo .wordmark .ch,.lgb.mo .pinhero{visibility:hidden}
.lgb .plaza{position:absolute;left:0;top:0;width:var(--pz,330px);height:var(--pz,330px);transform:translate(-50%,-50%);border-radius:50%;
  background:repeating-conic-gradient(from 7deg,#0000 0 29deg,#c9a77a55 29deg 30deg),radial-gradient(circle,#f8e6c6 0 30%,#c9a77a66 30.4% 31%,#f6e0bb 31.5% 62%,#c9a77a77 62.4% 63%,#f2d7ad 63.5% 100%);
  border:5px solid #e7c899;box-shadow:inset 0 -10px 0 #d9b78722,0 14px 0 #1d4f2433}
.lgb .plaza.dog{background:repeating-conic-gradient(from 7deg,#0000 0 29deg,#8fa3cc66 29deg 30deg),radial-gradient(circle,#e8eefc 0 30%,#8fa3cc77 30.4% 31%,#dfe6f7 31.5% 62%,#8fa3cc88 62.4% 63%,#d3dcf2 63.5% 100%);border-color:#b9c6e6}
.lgb .flag{position:absolute;width:4px;height:44px;background:#6b4b35;border-radius:2px;transform-origin:50% 100%}
.lgb .flag::after{content:"";position:absolute;left:4px;top:0;width:24px;height:16px;background:var(--pink);clip-path:polygon(0 0,100% 20%,70% 50%,100% 80%,0 100%);transform-origin:0 50%;animation:lgb-wave 1.4s ease-in-out infinite alternate}
.lgb .plaza.dog .flag::after{background:var(--navy);transition:background .2s}
.lgb .plaza.dog .flag.cat::after{background:var(--pink)}
@keyframes lgb-wave{from{transform:skewY(-6deg) scaleX(.9)}to{transform:skewY(6deg) scaleX(1.05)}}
.lgb .nexus{position:absolute;left:50%;top:50%;transform:translate(-50%,-56%);width:42%;filter:drop-shadow(10px 14px 0 #1d4f2433)}
.lgb .nexus svg{width:100%;height:auto;display:block;overflow:visible}
.lgb .nexus .hov{animation:lgb-hover 3s ease-in-out infinite}
@keyframes lgb-hover{50%{transform:translateY(-6px)}}
.lgb .pinhero{position:absolute;width:var(--hs,84px);height:var(--hs,84px);transform:translate(-50%,-50%);z-index:2}
.lgb .pinhero .disc{position:absolute;inset:0;border-radius:50%;border:4px solid var(--pink);background:radial-gradient(circle at 50% 35%,#5a3a7e,#2d1b44);box-shadow:0 0 0 4px #fff,0 10px 0 #1d4f2440}
.lgb .pinhero .pup{position:absolute;left:-30%;width:160%;top:-80%;height:180%;pointer-events:none;
  -webkit-mask:linear-gradient(#000 0 0) 0 0/100% 72.3% no-repeat,radial-gradient(circle calc(var(--hs,84px)/2 - 4px) at 50% 72.3%,#000 calc(100% - 1px),#0000 100%);
  mask:linear-gradient(#000 0 0) 0 0/100% 72.3% no-repeat,radial-gradient(circle calc(var(--hs,84px)/2 - 4px) at 50% 72.3%,#000 calc(100% - 1px),#0000 100%)}
.lgb .pinhero .bob{position:absolute;left:3.1%;width:93.8%;top:var(--top,27%);transform-origin:50% 48%}
.lgb .pinhero .bob img{width:100%;height:auto}
.lgb .pinhero .lid{position:absolute;width:var(--lw,13%);height:var(--lh,7%);border-radius:50% 50% 45% 45%;background:var(--lc,#55565d);transform:translate(-50%,-50%) scaleY(0);transform-origin:50% 0}
.lgb .pinhero .nm{position:absolute;left:50%;bottom:-14px;transform:translateX(-50%);font:700 11px/1 var(--disp);color:#fff;background:var(--ink);padding:3px 7px;border-radius:7px;white-space:nowrap;opacity:0;transition:opacity .2s}
.lgb .pinhero:hover .nm{opacity:1}
.lgb .tower{position:absolute;left:0;top:0;width:0;height:0;z-index:4}
.lgb .tower .range{position:absolute;left:-110px;top:-110px;width:220px;height:220px;border-radius:50%;border:3px dashed #1f3d9166;background:radial-gradient(circle,#1f3d9112,#1f3d9100 70%);
  animation:lgb-spin 24s linear infinite;transition:border-color .4s,opacity .6s}
.lgb .tower.hot .range{border-color:#e2385fbb;background:radial-gradient(circle,#e2385f1c,#e2385f00 70%);animation:lgb-spin 6s linear infinite}
.lgb .tower.down .range{opacity:0}
@keyframes lgb-spin{to{transform:rotate(360deg)}}
.lgb .tower .shadow{position:absolute;left:-18px;top:-6px;width:74px;height:30px;border-radius:50%;background:#1d4f2444;transform:skewX(-30deg)}
.lgb .tower .tw{position:absolute;left:-30px;top:-86px;width:60px;height:96px;transform-origin:50% 92%}
.lgb .tower .body{position:absolute;left:3px;right:3px;top:26px;bottom:0;border-radius:27px/12px;background:linear-gradient(90deg,#132a66,#3d68dd 38%,#5a82ee 46%,#1f3d91 80%);border:3px solid #0d1d4a;overflow:hidden}
.lgb .tower .body::after{content:"";position:absolute;left:8px;right:8px;top:24px;height:7px;border-radius:4px;background:#0d1d4a66}
.lgb .tower .flash{position:absolute;inset:0;background:#fff;opacity:0;border-radius:inherit}
.lgb .tower .cap{position:absolute;left:0;right:0;top:0;height:42px;border-radius:50% 50% 44% 44%/60% 60% 40% 40%;background:radial-gradient(circle at 36% 30%,#fff2b8,#ffc83d 40%,#d79a12);border:3px solid #6b4a07}
.lgb .tower .cap::after{content:"";position:absolute;left:50%;top:-14px;width:22px;height:12px;transform:translateX(-50%);background:#fff;border:3px solid #6b4a07;border-radius:7px;
  box-shadow:-8px -2px 0 -3px #fff,8px -2px 0 -3px #fff}
.lgb .tower .hp{position:absolute;left:-34px;top:-118px;width:68px;height:11px;border-radius:6px;background:#2b1d2a;border:2px solid #fff;overflow:hidden}
.lgb .tower .hp i,.lgb .tower .hp s{position:absolute;inset:0;transform-origin:0 50%;transform:scaleX(var(--hp,1))}
.lgb .tower .hp s,.lgb .base-hp s{transform:scaleX(1)}
.lgb .tower .hp s{background:#ffd34d}
.lgb .tower .hp i{background:linear-gradient(#7ea2ff,#2f57c9)}
.lgb .tower .hp::after,.lgb .base-hp::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,#0000 0 calc(25% - 2px),#2b1d2a calc(25% - 2px) 25%)}
.lgb .tower .tlbl{position:absolute;left:50%;top:-146px;transform:translateX(-50%);white-space:nowrap;font:800 10px/1 var(--body);letter-spacing:.2em;color:#fff;text-transform:uppercase;text-shadow:0 0 3px #13204f,0 1px 0 #13204f}
.lgb .tower.down .hp,.lgb .tower.down .tlbl{opacity:0;transition:opacity .3s}
.lgb:not(.mo) .tower.down .tw{transform:rotate(86deg) translate(6px,8px);filter:grayscale(.7) brightness(.85)}
.lgb .rubble{position:absolute;left:0;top:0}
.lgb .rubble b{position:absolute;width:14px;height:12px;background:#2f57c9;border:2px solid #0d1d4a;border-radius:3px;opacity:0;transform:translate(-50%,-50%)}
.lgb .rubble b:nth-child(2n){background:var(--gold);border-color:#6b4a07;width:10px;height:9px}
.lgb:not(.mo) .tower.down .rubble b{opacity:1;transform:translate(var(--x),var(--y)) rotate(var(--r))}
.lgb .capflag{position:absolute;left:18px;top:-50px;width:4px;height:50px;background:#6b4b35;border-radius:2px;transform-origin:50% 100%;opacity:0}
.lgb .capflag::after{content:"";position:absolute;left:4px;top:0;width:28px;height:19px;background:var(--pink);clip-path:polygon(0 0,100% 20%,70% 50%,100% 80%,0 100%);transform-origin:0 50%;animation:lgb-wave 1.2s ease-in-out infinite alternate}
.lgb .tower.down .capflag{opacity:1}
.lgb .pad{background:var(--sand);border:3px solid var(--ink);border-radius:26px;box-shadow:0 8px 0 var(--ink);overflow:hidden;position:relative;user-select:none;-webkit-user-select:none}
.lgb .pad svg.field{display:block;width:100%;height:auto;touch-action:none;cursor:crosshair}
.lgb .pad .hint{position:absolute;left:14px;top:12px;font:800 11px/1 var(--body);letter-spacing:.2em;text-transform:uppercase;color:var(--ink2);background:#fffaf0cc;padding:6px 9px;border-radius:8px}
.lgb .pad .msg{position:absolute;right:14px;bottom:94px;font:700 16px/1 var(--disp);color:var(--pinkD);opacity:0;transform:translateY(-6px);transition:.3s var(--ease-out)}
.lgb .pad .msg.on{opacity:1;transform:none}
.lgb .skills{display:flex;justify-content:center;gap:10px;padding:12px;background:#2b1d2a;border-top:3px solid var(--ink)}
.lgb .sk{position:relative;width:56px;height:56px;border-radius:14px;border:3px solid #fff3;background:linear-gradient(#4a3550,#2f2236);color:#fff;font:700 13px/1 var(--disp);cursor:pointer;display:grid;place-items:center;
  transition:border-color .2s,background .2s;touch-action:none}
.lgb .sk::after{content:"";position:absolute;inset:3px;border-radius:9px;background:conic-gradient(#ffffff59 var(--cd,0deg),#0000 0);pointer-events:none}
.lgb .sk svg{width:26px;height:26px;position:relative;z-index:1}
.lgb .sk kbd{position:absolute;right:3px;bottom:2px;font:800 10px/1 var(--body);opacity:.75}
.lgb .sk:hover,.lgb .sk:focus-visible{border-color:var(--gold)}
.lgb .sk.held{background:linear-gradient(#ec5a8d,#a8295a);border-color:#fff}
.lgb .tip{position:absolute;bottom:calc(100% + 12px);left:50%;width:200px;transform:translate(-50%,6px) scale(.96);opacity:0;pointer-events:none;background:var(--paper);color:var(--ink);border:2px solid var(--ink);border-radius:12px;padding:10px 12px;
  font:600 13px/1.35 var(--body);text-align:left;box-shadow:0 4px 0 var(--ink);transition:.22s var(--ease-out);z-index:3}
.lgb .tip b{display:block;font:700 15px/1.1 var(--disp);margin-bottom:3px}
.lgb .sk:hover .tip,.lgb .sk:focus-visible .tip{opacity:1;transform:translate(-50%,0) scale(1)}
.lgb .sk:first-child .tip{left:0;transform:translate(0,6px) scale(.96)}
.lgb .sk:first-child:hover .tip,.lgb .sk:first-child:focus-visible .tip{transform:none}
.lgb .sk:last-child .tip{left:auto;right:0;transform:translate(0,6px) scale(.96)}
.lgb .sk:last-child:hover .tip,.lgb .sk:last-child:focus-visible .tip{transform:none}
.lgb .cap-note{font-size:13px;color:var(--ink2);margin:10px 4px 0;font-weight:700}
.lgb .scout{position:relative;margin:0;border:3px solid var(--ink);border-radius:20px;overflow:hidden;box-shadow:0 8px 0 var(--ink),0 24px 50px #1d4f2440;background:#000}
.lgb .scout img{width:100%;aspect-ratio:1000/563;object-fit:cover;transform:scale(1.08);transition:transform 1.2s var(--ease-out)}
.lgb .scout:hover img{transform:scale(1.13)}
.lgb .scout::before,.lgb .scout::after{content:"";position:absolute;width:34px;height:34px;border:4px solid #fff;z-index:2;pointer-events:none}
.lgb .scout::before{left:12px;top:12px;border-right:0;border-bottom:0;border-radius:8px 0 0 0}
.lgb .scout::after{right:12px;bottom:12px;border-left:0;border-top:0;border-radius:0 0 8px 0}
.lgb .scout figcaption{position:absolute;left:12px;bottom:12px;right:60px;z-index:2;font:700 13px/1.3 var(--body);color:#fff;background:#2b1d2ad0;padding:7px 10px;border-radius:10px;width:max-content;max-width:calc(100% - 70px)}
.lgb .scout .rec{position:absolute;right:16px;top:16px;z-index:2;display:flex;align-items:center;gap:6px;font:800 11px/1 var(--body);letter-spacing:.2em;color:#fff;background:#2b1d2ad0;padding:6px 9px;border-radius:8px}
.lgb .scout .rec::before{content:"";width:8px;height:8px;border-radius:50%;background:#ff4d6d;animation:lgb-blink 1s steps(2) infinite}
@keyframes lgb-blink{50%{opacity:0}}
.lgb .vs3{display:flex;align-items:center;gap:10px;margin:16px 0 4px;flex-wrap:wrap}
.lgb .vs3 .team{display:flex}
.lgb .vs3 .team span{width:40px;height:40px;border-radius:50%;border:3px solid var(--pink);margin-left:-8px;background:#3b2357;overflow:hidden;box-shadow:0 0 0 2px #fff}
.lgb .vs3 .team span:first-child{margin-left:0}
.lgb .vs3 .team.d span{border-color:var(--navy)}
.lgb .vs3 .team img{width:100%;height:100%;object-fit:cover;object-position:50% 18%}
.lgb .vs3 b{font:700 20px/1 var(--disp);color:var(--ink)}
.lgb .note{font-size:14px;font-weight:700;color:var(--ink2);background:var(--paper2);border-radius:10px;padding:8px 12px;display:inline-block}
.lgb .river{position:relative;z-index:3;height:clamp(220px,30vh,300px);margin:calc(var(--gap) * -.75) 0 calc(var(--gap) * .25);pointer-events:none}
.lgb .river .water{position:absolute;left:-5%;right:-5%;top:22%;bottom:22%;background:linear-gradient(180deg,#7fcdf6,#4fb0ea 50%,#7fcdf6);border-top:6px solid #e5c58f;border-bottom:6px solid #e5c58f;transform:rotate(-2.2deg);overflow:hidden}
.lgb .river .rip{position:absolute;left:-260px;right:-260px;top:0;bottom:0;background-repeat:repeat;will-change:transform}
.lgb .river .rip.a{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='130' height='46'%3E%3Cpath d='M8 14q9-6 18 0M70 34q11-7 22 0' stroke='%23ffffffa0' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");animation:lgb-flowA 6s linear infinite}
.lgb .river .rip.b{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='170' height='60'%3E%3Cpath d='M40 22q12-7 24 0M118 46q8-5 16 0' stroke='%232f8fd066' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='150' cy='12' r='2' fill='%23fff'/%3E%3C/svg%3E");animation:lgb-flowB 9s linear infinite}
@keyframes lgb-flowA{to{transform:translateX(130px)}}
@keyframes lgb-flowB{to{transform:translateX(-170px)}}
.lgb .river svg.rtext{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
.lgb .river text{font:700 34px/1 var(--disp);fill:#ffffffd9;letter-spacing:.08em}
.lgb .bridge{position:absolute;z-index:4;top:50%;width:var(--bw,140px);height:calc(100% - 36px);transform:translate(-50%,-50%) rotate(-2.2deg);
  display:flex;flex-direction:column;justify-content:space-between;border-left:8px solid #7a4c26;border-right:8px solid #7a4c26;border-radius:10px;filter:drop-shadow(12px 14px 0 #10406033)}
.lgb .bridge i{display:block;height:15px;flex:none;background:linear-gradient(#c48c52,#a8723f);border-radius:3px;box-shadow:inset 0 -3px 0 #8a5a2e}
.lgb .rlabel{position:absolute;left:50%;top:6px;transform:translateX(-50%);z-index:5}
.lgb .roster-head{position:relative;z-index:2;display:grid;grid-template-columns:1.1fr .9fr;gap:24px;align-items:end;margin-bottom:22px}
.lgb .chips{display:flex;flex-wrap:wrap;gap:8px}
.lgb .chip{font:700 14px/1 var(--disp);padding:9px 13px;border-radius:999px;border:2.5px solid var(--ink);background:var(--paper);color:var(--ink);cursor:pointer;box-shadow:0 3px 0 var(--ink);transition:transform .2s var(--ease-back),background .2s}
.lgb .chip:hover{transform:translateY(-2px)}
.lgb .chip[aria-pressed=true]{background:var(--ink);color:#fff}
.lgb .grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;list-style:none;padding:0;margin:0}
.lgb .slot{perspective:900px}
.lgb .hc{position:relative;border:3px solid var(--ink);border-radius:18px;background:var(--paper);box-shadow:0 6px 0 var(--ink);overflow:hidden;transition:box-shadow .3s var(--ease-out)}
.lgb .hc::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .3s;mix-blend-mode:soft-light;
  background:radial-gradient(circle at var(--mx,50%) var(--my,30%),#ffffffd9,#fff0 46%),linear-gradient(115deg,#fff0 calc(var(--mx,50%) - 20%),#ffffff80 var(--mx,50%),#fff0 calc(var(--mx,50%) + 20%))}
.lgb .hc:hover::after{opacity:1}
.lgb .hc:hover{box-shadow:0 10px 0 var(--ink),0 22px 30px #1d4f2440}
.lgb .hc .stage{position:relative;aspect-ratio:300/360;background:radial-gradient(ellipse 70% 60% at 50% 40%,#5a3a7e,#2d1b44);overflow:hidden}
.lgb .hc .stage::after{content:"";position:absolute;left:18%;right:18%;bottom:7%;height:12%;border-radius:50%;background:radial-gradient(closest-side,#ec5a8d,#ec5a8d00);opacity:.0;transition:opacity .4s,transform .5s var(--ease-back);transform:scale(.6)}
.lgb .hc.dog .stage::after{background:radial-gradient(closest-side,#5d86ff,#5d86ff00)}
.lgb .hc:hover .stage::after,.lgb .slot:focus-within .stage::after{opacity:1;transform:scale(1.2)}
.lgb .hc .stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 20%;transform-origin:50% 100%}
.lgb .hc .meta{padding:9px 11px 11px;display:flex;flex-direction:column;gap:5px}
.lgb .hc .nm{font:700 17px/1.05 var(--disp)}
.lgb .hc .rl{display:flex;gap:6px;align-items:center;font:800 10px/1 var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--ink2)}
.lgb .hc .side{padding:3px 6px;border-radius:6px;background:var(--pinkL);color:#8a1f47}
.lgb .hc.dog .side{background:var(--navyL);color:var(--navyD)}
.lgb:not(.mo) .hc.dim{opacity:.4;filter:grayscale(.85);transform:scale(.92)}
.lgb .devices{position:relative;min-height:clamp(300px,34vw,440px)}
.lgb .browser{position:absolute;left:0;top:0;width:88%;border:3px solid var(--ink);border-radius:16px;background:var(--ink);overflow:hidden;box-shadow:0 8px 0 var(--ink),0 30px 50px #1d4f2444}
.lgb .browser .bar{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#3a2a38}
.lgb .browser .bar i{width:9px;height:9px;border-radius:50%;background:#ff6b8a}
.lgb .browser .bar i:nth-child(2){background:var(--gold)}
.lgb .browser .bar i:nth-child(3){background:#7ee08a}
.lgb .browser .bar span{margin-left:8px;flex:1;background:#2b1d2a;color:#fffc;border-radius:7px;padding:4px 10px;font:700 11px/1 var(--body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lgb .browser img{width:100%;aspect-ratio:960/540;object-fit:cover}
.lgb .phone{position:absolute;right:0;bottom:0;width:34%;border:4px solid var(--ink);border-radius:30px;padding:7px;background:#3a2a38;box-shadow:0 8px 0 var(--ink),0 30px 50px #1d4f2455}
.lgb .phone img{border-radius:22px;aspect-ratio:420/747;object-fit:cover;width:100%}
.lgb .phone::before{content:"";position:absolute;left:50%;top:12px;width:30%;height:8px;border-radius:5px;background:#2b1d2a;transform:translateX(-50%);z-index:2}
.lgb .facts{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:10px}
.lgb .facts li{display:flex;gap:12px;align-items:center;font-weight:800;color:var(--ink)}
.lgb .facts li span{width:34px;height:34px;flex:none;border-radius:10px;display:grid;place-items:center;background:var(--sand);border:2.5px solid var(--ink);font:700 15px/1 var(--disp)}
.lgb .fountain{position:absolute;left:0;top:0;width:150px;height:150px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,#8fd6fb 0 52%,#e8cc98 53% 64%,#d7b277 65% 100%);border:4px solid #c99f62;box-shadow:0 12px 0 #1d4f2433}
.lgb .fountain i{position:absolute;left:50%;top:50%;width:40%;height:40%;border-radius:50%;border:3px solid #ffffffcc;transform:translate(-50%,-50%);animation:lgb-ripple 2.4s var(--ease-out) infinite}
.lgb .fountain i:nth-child(2){animation-delay:.8s}
.lgb .fountain i:nth-child(3){animation-delay:1.6s}
@keyframes lgb-ripple{from{transform:translate(-50%,-50%) scale(.3);opacity:1}to{transform:translate(-50%,-50%) scale(1.6);opacity:0}}
.lgb .fountain canvas{position:absolute;left:-40%;top:-80%;width:180%;height:260%;pointer-events:none}
.lgb .fountain svg{position:absolute;left:50%;top:50%;width:46px;margin:-26px 0 0 -23px;filter:drop-shadow(0 4px 0 #a8295a66)}
.lgb .shelter .card{display:grid;grid-template-columns:auto 1fr;gap:clamp(16px,2.4vw,30px);align-items:center;max-width:820px;margin-left:auto}
.lgb .masc{position:relative;width:clamp(110px,14vw,180px);aspect-ratio:269/350}
.lgb .masc img{position:absolute;inset:0;width:100%;height:100%}
.lgb .realcats{list-style:none;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(8px,1.2vw,14px);margin:18px 0 0;padding:0;max-width:520px}
.lgb .realcats li{display:flex;flex-direction:column;align-items:center;gap:5px;background:#fff;border:3px solid var(--ink);border-radius:14px;padding:5px 5px 7px;box-shadow:4px 5px 0 var(--ink)}
.lgb .realcats li:nth-child(odd){transform:rotate(-2deg)}
.lgb .realcats li:nth-child(even){transform:rotate(2deg)}
.lgb .realcats img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:#3a2a33}
.lgb .realcats b{font:700 clamp(12px,1vw,15px)/1 var(--disp);color:var(--ink)}
.lgb .masc .mb{clip-path:polygon(0 56%,100% 52%,100% 100%,0 100%)}
.lgb .masc .mh{clip-path:polygon(0 0,100% 0,100% 60%,62% 62%,40% 64%,0 63%);transform-origin:50% 58%}
.lgb .masc .mp{clip-path:circle(13% at 27% 50%)}
.lgb .big5{font:700 clamp(40px,5vw,70px)/.9 var(--disp);color:var(--pinkD);display:block;margin-bottom:4px}
.lgb .tlink{font-weight:900;color:var(--pinkD);text-decoration-thickness:2px;text-underline-offset:3px}
.lgb .tlink:hover{color:var(--ink)}
.lgb .leg.final[data-side]{--lcF:clamp(300px,34vw,470px);grid-template-columns:1fr var(--lcF);grid-template-areas:"content lane";min-height:auto;margin-bottom:0;padding-top:40px;padding-bottom:40px;align-items:center}
.lgb .final .lanecol{height:clamp(340px,36vw,500px)}
.lgb .final .plaza{--pz:clamp(280px,29vw,420px)}
.lgb .final .content{max-width:640px}
.lgb .final h2{font-size:clamp(46px,6vw,88px);color:#fff;-webkit-text-stroke:.11em #4a2b35;paint-order:stroke fill;filter:drop-shadow(0 .06em 0 #4a2b35)}
.lgb .final .tag{margin:0 0 6px;max-width:28ch}
.lgb .cta-wrap{position:relative;display:inline-flex}
.lgb .cta-wrap .ring{position:absolute;inset:-3px;border-radius:22px;border:3px solid #fff;box-shadow:0 0 0 2px #ff5f9e66;pointer-events:none;opacity:0}
.lgb:not(.mo) .cta-wrap .ring{animation:lgb-ringp 1.6s var(--ease-out) infinite}
.lgb:not(.mo) .cta-wrap .ring+.ring{animation-delay:.8s}
@keyframes lgb-ringp{0%{opacity:.95;transform:scale(1)}70%{opacity:0}100%{opacity:0;transform:scale(1.1,1.42)}}
.lgb .final .btn.play{font-size:clamp(20px,2vw,26px);padding:20px 30px 21px;border-radius:20px}
.lgb .final .small{font-size:15px;font-weight:700;color:#fff;text-shadow:0 0 4px #1d4f24,0 1px 0 #1d4f24;margin-top:22px}
.lgb .base-hp{position:absolute;left:50%;top:-30%;transform:translateX(-50%);width:160px;height:14px;border-radius:8px;background:#2b1d2a;border:3px solid #fff;overflow:hidden}
.lgb .base-hp i,.lgb .base-hp s{position:absolute;inset:0;transform-origin:0 50%;transform:scaleX(var(--hp,1))}
.lgb .base-hp s{background:#ffd34d}
.lgb .base-hp i{background:linear-gradient(#7ea2ff,#2f57c9)}
.lgb .final .shards,.lgb .final .debris,.lgb .final .crack{visibility:hidden}
.lgb .final .crack path{fill:none;stroke:#fff8dc;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.lgb:not(.mo) .final.won .house,.lgb:not(.mo) .final.won .base-hp{visibility:hidden}
.lgb:not(.mo) .final.won .debris{visibility:visible}
.lgb .camwrap{position:absolute;left:0;top:0}
.lgb .victory{position:absolute;left:50%;top:-1%;transform:translate(-50%,-50%);font:700 clamp(46px,5.6vw,84px)/1 var(--disp);color:var(--gold);-webkit-text-stroke:.1em #4a2b35;paint-order:stroke fill;white-space:nowrap;pointer-events:none;
  filter:drop-shadow(0 .06em 0 #4a2b35);z-index:6;visibility:hidden}
.lgb .victory .ch{display:inline-block}
.lgb .victory .shine{position:absolute;left:0;top:0;color:transparent;-webkit-text-stroke:0;background:linear-gradient(100deg,#fff0 40%,#fffbe0 50%,#fff0 60%) 160% 0/260% 100% no-repeat;-webkit-background-clip:text;background-clip:text;filter:none}
.lgb .final.won .victory{visibility:visible}
.lgb .flashw{position:fixed;inset:0;z-index:55;background:#fff;opacity:0;pointer-events:none}
.lgb .foot{position:relative;z-index:6;background:#2b1d2a;color:#fff;padding:26px 24px 30px;margin-top:10px;border-top:6px solid #1d4f24}
.lgb .foot .in{max-width:1180px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}
.lgb .foot img{width:150px}
.lgb .foot nav{display:flex;flex-wrap:wrap;gap:18px;font-weight:800}
.lgb .foot nav a{text-decoration:none;color:#ffd3e2}
.lgb .foot nav a:hover{color:#fff;text-decoration:underline}
.lgb .foot p{margin:0;color:#ffffffb0;font-size:14px;max-width:46ch}
.lgb .mini{position:fixed;right:16px;bottom:16px;z-index:40;width:94px;height:150px;border-radius:16px;background:#2b1d2ae6;border:3px solid #fff;box-shadow:0 6px 0 #0003;padding:8px;cursor:pointer;transition:opacity .3s var(--ease-out)}
.lgb .mini.off{opacity:0;pointer-events:none}
.lgb .mini .mm{display:block;position:relative;width:100%;height:100%;border-radius:9px;background:#5fa843;overflow:hidden}
.lgb .mini svg{position:absolute;inset:0;width:100%;height:100%}
.lgb .mini svg path{fill:none;stroke:var(--sand);stroke-width:5;vector-effect:non-scaling-stroke;stroke-linecap:round}
.lgb .mini .mk{position:absolute;width:9px;height:9px;border-radius:3px;transform:translate(-50%,-50%);background:#5d86ff;border:1.5px solid #fff;transition:background .3s}
.lgb .mini .mk.base{width:13px;height:13px;border-radius:50%}
.lgb .mini .mk.cat,.lgb .mini .mk.x{background:var(--pink)}
.lgb .mini .tr{position:absolute;left:0;top:0;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:var(--gold);pointer-events:none}
.lgb .mini .me{position:absolute;left:0;top:0;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:var(--gold);border:2px solid #fff;box-shadow:0 0 0 0 #ffc83d;animation:lgb-ping 1.2s infinite}
.lgb canvas.fog{position:fixed;inset:0;z-index:60;pointer-events:none;width:100vw;height:100vh}
.lgb canvas#fx{position:fixed;inset:0;z-index:5;pointer-events:none;width:100vw;height:100vh;transform-origin:0 0}
@media (max-width:1300px){
.lgb .canopy{display:none}
}
@media (max-width:1100px){
.lgb .duo{grid-template-columns:1fr}
.lgb .roster-head{grid-template-columns:1fr}
.lgb .grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.lgb .devices{max-width:620px}
}
@media (max-width:760px){
.lgb{--lc:52px;--gap:120px}
.lgb{font-size:16px}
.lgb .map{padding-top:78px}
.lgb .hud{inset:10px 10px auto}
.lgb .brand{display:none}
.lgb .score{padding:7px 10px;gap:7px;font-size:11px}
.lgb .score .lbl{display:none}
.lgb .leg,.lgb .leg[data-side=R]{grid-template-columns:var(--lc) minmax(0,1fr);grid-template-areas:"lane content";padding:0 16px 0 0;min-height:auto}
.lgb .leg .content,.lgb .leg[data-side=R] .content,.lgb .leg[data-side=L] .content{padding:0 0 0 6px}
.lgb .leg.hero[data-side]{grid-template-columns:1fr;grid-template-areas:"lane" "content";padding:0 16px;min-height:auto;margin-bottom:var(--gap)}
.lgb .hero .lanecol{height:270px}
.lgb .hero .plaza{--pz:230px}
.lgb .hero .pinhero{--hs:58px}
.lgb .hero .content{padding:0!important}
.lgb .tower{transform:scale(.62)}
.lgb .tower .range{display:none}
.lgb .card{border-radius:20px;box-shadow:0 6px 0 var(--ink),0 16px 30px #1d4f2433}
.lgb .wipe{border-radius:17px}
.lgb .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.lgb .shelter .card{grid-template-columns:1fr}
.lgb .masc{width:110px}
.lgb .final,.lgb .leg.final[data-side]{grid-template-columns:1fr;grid-template-areas:"lane" "content";padding:72px 16px 22px;text-align:center}
.lgb .final .content{margin:0 auto}
.lgb .final .ctas{justify-content:center}
.lgb .final .tag{margin:0 auto 6px}
.lgb .final .lanecol{height:214px}
.lgb .final .plaza{--pz:188px}
.lgb .final .ctas{gap:10px}
.lgb .final h2{font-size:46px}
.lgb .final .small{font-size:13px;margin-top:16px}
.lgb .victory{top:5%}
.lgb .browser .bar{padding:6px 6px}
.lgb .browser .bar i{display:none}
.lgb .browser .bar span{margin-left:0;padding:4px 6px;font-size:8.5px;letter-spacing:-.01em;text-overflow:clip;text-align:center}
.lgb .base-hp{top:-26%;width:120px}
.lgb .foot{padding:14px 16px 16px}
.lgb .foot .in{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center}
.lgb .foot img{width:84px}
.lgb .foot nav{justify-content:flex-end;gap:12px;font-size:14px}
.lgb .foot p{font-size:12px;line-height:1.4;grid-column:1/-1;max-width:none}
.lgb .maplabel{letter-spacing:.14em;font-size:11px;line-height:1.3}
.lgb .fountain{width:46px;height:46px}
.lgb .fountain svg{width:20px;margin:-12px 0 0 -10px}
.lgb .canopy{display:none}
.lgb .river{margin:calc(var(--gap) * -.6) 0 calc(var(--gap) * .4);height:180px}
.lgb .river text{font-size:26px}
.lgb .mini{width:40px;height:66px;left:6px;right:auto;bottom:10px;padding:3px;border-radius:10px;border-width:2px}
.lgb .mini .me{width:9px;height:9px;margin:-4.5px 0 0 -4.5px}
.lgb .mini .mk{width:6px;height:6px}
.lgb .mini .mk.base{width:8px;height:8px}
.lgb .devices{min-height:auto;display:grid;grid-template-columns:1.7fr 1fr;gap:10px;align-items:end}
.lgb .browser,.lgb .phone{position:relative;width:auto}
.lgb .phone{border-radius:20px;padding:4px}
.lgb .phone img{border-radius:15px}
.lgb .phone::before{display:none}
.lgb .toast{top:56px;bottom:auto;flex-direction:row;gap:8px;padding:7px 12px;max-width:calc(100vw - 32px)}
.lgb .toast .ln{font-size:17px}
.lgb .toast .sub{font-size:9px;padding:5px 7px}
.lgb .gates{font-size:14px}
}
@media (prefers-reduced-motion:reduce){
.lgb *,.lgb *::before,.lgb *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;transition-delay:0s!important;animation-delay:0s!important}
.lgb .toast{display:none}
}
/* ---------- port: page shell (the original set these on html and body) ---------- */
html:has(.lgb),body:has(.lgb){background:#86c95c;overflow-x:clip;scroll-behavior:auto}
.lgb{position:relative;display:block;min-height:100vh;isolation:isolate;text-align:left;-webkit-font-smoothing:antialiased}
.lgb h1,.lgb h2,.lgb figure,.lgb ul{margin-top:0}
.lgb strong{font-weight:900}
/* the practice pad hero's pulse ring (an SVG <animate> in the original; CSS so reduced motion stops it) */
.lgb #heroB .pulse{transform-box:fill-box;transform-origin:center;animation:lgb-pulse 1.6s ease-in-out infinite}
@keyframes lgb-pulse{50%{transform:scale(1.15)}}
/* the intro curtain: until the fog intro starts (motion allowed only); lifted after 5 s anyway if the motion chunk never runs */
@keyframes lgb-unveil{to{opacity:0;visibility:hidden}}
@media (prefers-reduced-motion:no-preference){
  .lgb.js-intro::after{content:"";position:fixed;inset:0;z-index:70;background:#0c2414;pointer-events:none;animation:lgb-unveil .3s linear 5s forwards}
}
/* ---------- roster: New tags, the coming-next strip ---------- */
.lgb .hc .new{position:absolute;left:8px;top:8px;z-index:2;font:800 10px/1 var(--body);letter-spacing:.16em;text-transform:uppercase;color:var(--ink);background:var(--gold);border:2px solid var(--ink);border-radius:6px;padding:4px 6px;transform:rotate(-6deg)}
.lgb .next{margin-top:18px;border-top:3px dashed #2b1d2a33;padding-top:14px}
.lgb .next-h{font:700 17px/1.2 var(--disp);margin:0 0 10px}
.lgb .next ul{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:10px}
.lgb .next li{display:flex;align-items:center;gap:8px;background:var(--paper2);border:2.5px solid var(--ink);border-radius:12px;padding:6px 10px 6px 6px}
.lgb .next .pc{width:30px;height:30px;border-radius:50%;background:var(--navy);display:grid;place-items:center;flex:none}
.lgb .next .pc svg{width:18px;height:18px;fill:#fff}
.lgb .next b{display:block;font:700 15px/1.1 var(--disp)}
.lgb .next small{display:block;font:800 10px/1.2 var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--ink2)}
.lgb .card .lede+.lede{margin-top:2px}
.lgb .foot nav a{white-space:nowrap}
/* short landscape screens (a phone on its side, 844x390): the phone-size minimap, so it never covers a card */
@media (max-height:500px){
  .lgb .mini{width:40px;height:66px;padding:3px;border-radius:10px;border-width:2px}
  .lgb .mini .me{width:9px;height:9px;margin:-4.5px 0 0 -4.5px}
  .lgb .mini .mk{width:6px;height:6px}
  .lgb .mini .mk.base{width:8px;height:8px}
}
/* the HUD steps aside while the dog base and its VICTORY banner pass under it (motion.js), so the win is never covered */
.lgb .hud{transition:opacity .25s,visibility .25s}
.lgb .hud.off{opacity:0;visibility:hidden}
/* a phone on its side: the final section side by side (call to action | dog base), so the base and its banner fit on screen */
@media (max-height:500px) and (min-width:600px){
  .lgb .final,.lgb .leg.final[data-side]{grid-template-columns:minmax(0,1fr) 250px;grid-template-areas:"content lane";padding:28px 16px 22px;text-align:left;align-items:end}
  .lgb .final .content{margin:0}
  .lgb .final .ctas{justify-content:flex-start}
  .lgb .final .tag{margin:0 0 6px}
  .lgb .final .lanecol{height:200px}
  .lgb .final .plaza{--pz:176px}
  .lgb .victory{top:40%}
}
/* narrow phones: the roster cards are about 117 px wide at 375, so the side tag and role wrap and the tracking tightens */
@media (max-width:420px){
  .lgb .hc .meta{padding:8px 8px 10px;min-width:0}
  .lgb .hc .nm{font-size:16px;overflow-wrap:anywhere}
  .lgb .hc .rl{flex-wrap:wrap;gap:4px 5px;letter-spacing:.06em}
}
`;
