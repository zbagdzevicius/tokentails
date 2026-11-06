/**
 * The Pawlegends landing stylesheet (port of docs/plans/moba/landings/02-vs-screen.html), scoped under `.pll` so it
 * never leaks into the rest of the site. Generated from the original by a postcss pass: selectors prefixed with
 * `.pll`, `:root`/`body`/`html.x` mapped onto the root, keyframes renamed `pll-*`. Edit it here by hand now.
 */
// eslint-disable-next-line tt/no-raw-font -- the ported landing keeps its own faces (Fredoka display, site Nunito body), scoped to .pll
export const LANDING_CSS = String.raw`@font-face{font-family:"Fredoka";src:url("/pawlegends/landing/fredoka.218d0e8a.woff2") format("woff2");font-weight:300 700;font-display:swap}
.pll{
  --pink:#ff3d7f;--pink-d:#c8135b;--pink-l:#ffb3cd;--cream:#fff3e3;--berry:#3e0820;
  --blue:#2f6bff;--blue-d:#0d2f9a;--navy:#071334;--ice:#d6e5ff;
  --bolt:#fff04d;--amber:#ff9d1c;--ink:#12091f;--white:#fff;
  --disp:"Fredoka",ui-rounded,system-ui,sans-serif;
  --body:"Nunito",system-ui,-apple-system,"Segoe UI",sans-serif;
}
.pll *{box-sizing:border-box;margin:0;padding:0}
.pll{background:var(--ink);color:var(--white);font-family:var(--body);font-size:17px;line-height:1.55;overflow-x:clip;-webkit-font-smoothing:antialiased}
.pll img{display:block;max-width:100%}
.pll a{color:inherit}
.pll :focus-visible{outline:4px solid var(--bolt);outline-offset:4px;border-radius:6px}
.pll .sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pll .skip{position:fixed;left:12px;top:-60px;z-index:400;background:var(--bolt);color:var(--ink);padding:10px 16px;font-weight:800;border-radius:8px;text-decoration:none}
.pll .skip:focus{top:12px}
/* ---------- display type ---------- */
.pll .disp{font-family:var(--disp);font-weight:700;text-transform:uppercase;letter-spacing:.01em;line-height:.9;
  -webkit-text-stroke:.07em var(--ink);paint-order:stroke fill;}
.pll .ital{display:inline-block;transform:skewX(-9deg)}
.pll .halftone-pink{background-color:var(--pink);
  background-image:radial-gradient(circle at center,rgba(255,255,255,.28) 0 2.2px,transparent 2.6px),
  repeating-linear-gradient(115deg,rgba(255,255,255,.07) 0 22px,transparent 22px 44px);
  background-size:14px 14px,auto}
.pll .halftone-blue{background-color:var(--blue);
  background-image:radial-gradient(circle at center,rgba(255,255,255,.22) 0 2.2px,transparent 2.6px),
  repeating-linear-gradient(65deg,rgba(255,255,255,.07) 0 22px,transparent 22px 44px);
  background-size:14px 14px,auto}
/* ---------- buttons ---------- */
.pll .mag{display:inline-block;transform-origin:50% 100%}
.pll .btn{--bg:var(--bolt);--fg:var(--ink);position:relative;display:inline-flex;align-items:center;gap:.6em;
  font-family:var(--disp);font-weight:700;font-size:clamp(17px,1.6vw,22px);text-transform:uppercase;letter-spacing:.02em;
  color:var(--fg);background:var(--bg);text-decoration:none;padding:.85em 1.5em .8em;border:3px solid var(--ink);
  border-radius:6px;transform:skewX(-9deg);box-shadow:6px 7px 0 var(--ink);transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s cubic-bezier(.34,1.56,.64,1);overflow:hidden;isolation:isolate}
.pll .btn>span{display:inline-block;transform:skewX(9deg)}
.pll .btn::before{content:"";position:absolute;inset:0;z-index:-1;background:repeating-linear-gradient(-45deg,rgba(255,255,255,.55) 0 10px,transparent 10px 24px);
  transform:translateX(-101%);transition:transform .45s cubic-bezier(.22,1,.36,1)}
.pll .btn:hover{transform:skewX(-9deg) translate(-3px,-4px);box-shadow:10px 12px 0 var(--ink)}
.pll .btn:hover::before{transform:translateX(0)}
.pll .btn:active{transform:skewX(-9deg) translate(4px,5px);box-shadow:1px 1px 0 var(--ink);transition-duration:.06s}
.pll .btn .arrow{display:inline-block;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.pll .btn:hover .arrow{transform:translateX(5px)}
.pll .btn.ghost{--bg:var(--white);--fg:var(--ink)}
.pll .btn.big{font-size:clamp(19px,2vw,28px)}
/* ---------- custom cursor (fine pointers only) ---------- */
.pll .cursor{position:fixed;left:0;top:0;z-index:500;width:46px;height:46px;margin:-23px 0 0 -23px;pointer-events:none;opacity:0;display:none}
.pll.has-cursor .cursor{display:block}
.pll.has-cursor, .pll.has-cursor a, .pll.has-cursor button{cursor:none}
.pll .cursor svg{width:100%;height:100%;overflow:visible}
.pll .cursor .paw{fill:var(--white);stroke:var(--ink);stroke-width:2.2}
.pll .cursor .rtrk{fill:none;stroke:rgba(255,255,255,.35);stroke-width:3}
.pll .cursor .rfill{fill:none;stroke:var(--bolt);stroke-width:4;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1}
/* =========================================================
   HERO / VS
   ========================================================= */
.pll .hero{position:relative;z-index:1;height:100svh;min-height:520px;overflow:hidden;background:var(--ink);isolation:isolate;--lx:22%;--ly:48%;--rx:78%;--ry:48%}
.pll .hero-shake{position:absolute;inset:0}
.pll .side{position:absolute;inset:0;will-change:transform}
.pll .side.cat{clip-path:polygon(0 0,58% 0,42% 100%,0 100%)}
.pll .side.dog{clip-path:polygon(58% 0,100% 0,100% 100%,42% 100%)}
.pll .side .tone{position:absolute;inset:-70px}
.pll .side .tone i{position:absolute;inset:0;animation:pll-driftP 7s linear infinite;will-change:transform}
.pll .side.dog .tone i{animation-name:pll-driftB}
@keyframes pll-driftP{from{transform:translate3d(-28px,28px,0)}to{transform:translate3d(0,-28px,0)}}
@keyframes pll-driftB{from{transform:translate3d(28px,28px,0)}to{transform:translate3d(0,-28px,0)}}
.pll .side .glow{position:absolute;inset:0;pointer-events:none}
.pll .side.cat .glow{background:radial-gradient(ellipse 55% 65% at var(--lx) var(--ly),rgba(255,243,227,.6),transparent 70%),linear-gradient(180deg,transparent 60%,rgba(62,8,32,.55))}
.pll .side.dog .glow{background:radial-gradient(ellipse 55% 65% at var(--rx) var(--ry),rgba(214,229,255,.5),transparent 70%),linear-gradient(180deg,transparent 60%,rgba(7,19,52,.6))}
.pll .side .bigword{position:absolute;top:50%;translate:0 -50%;font-family:var(--disp);font-weight:700;font-size:min(34vw,44vh);line-height:.8;color:transparent;
  -webkit-text-stroke:3px rgba(255,255,255,.22);white-space:nowrap;transform:skewX(-9deg);pointer-events:none;user-select:none;
  background:linear-gradient(100deg,transparent 0 42%,rgba(255,255,255,.34) 48%,rgba(255,240,77,.28) 52%,transparent 58% 100%) 120% 0/250% 100% no-repeat;
  -webkit-background-clip:text;background-clip:text;animation:pll-shimmer 4s cubic-bezier(.45,0,.55,1) infinite}
.pll .side.dog .bigword{animation-delay:-2s}
@keyframes pll-shimmer{0%{background-position:130% 0}60%,100%{background-position:-30% 0}}
.pll .hero.off .bigword,.pll .hero.off .tone i{animation-play-state:paused}
.pll .side.cat .bigword{left:-2vw}
.pll .side.dog .bigword{right:-2vw}
.pll #seam{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3}
.pll .hud{position:absolute;z-index:6;top:clamp(14px,3vh,30px);left:50%;translate:-50% 0;width:min(1240px,calc(100% - 32px));
  display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:clamp(8px,1.4vw,18px)}
.pll .bar{position:relative;height:clamp(22px,3vh,30px);border:3px solid var(--ink);background:var(--ink);border-radius:4px;transform:skewX(-20deg);box-shadow:4px 5px 0 rgba(18,9,31,.55)}
.pll .bar i{position:absolute;inset:2px;display:block;transform-origin:right;background:linear-gradient(180deg,#fff7a8,var(--bolt) 45%,var(--amber))}
.pll .bar.dog i{transform-origin:left}
.pll .bar b{position:absolute;top:calc(100% + 6px);font-family:var(--disp);font-size:clamp(13px,1.4vw,18px);letter-spacing:.06em;color:var(--white);
  -webkit-text-stroke:.18em var(--ink);paint-order:stroke fill;transform:skewX(20deg)}
.pll .bar.cat b{left:6px}.pll .bar.dog b{right:6px}
.pll .timer{font-family:var(--disp);font-weight:700;font-size:clamp(18px,2.2vw,30px);color:var(--ink);background:var(--white);border:3px solid var(--ink);
  border-radius:10px;padding:.18em .55em .12em;box-shadow:4px 5px 0 var(--ink);text-align:center;line-height:1}
.pll .timer small{display:block;font-size:.42em;letter-spacing:.14em;opacity:.7}
.pll .fighter{position:absolute;z-index:4;top:38%;width:clamp(170px,min(19vw,32vh),300px);aspect-ratio:300/419;margin:0}
.pll .fighter.cat{left:clamp(8px,6vw,110px);translate:0 -52%}
.pll .fighter.dog{right:clamp(8px,6vw,110px);translate:0 -52%}
.pll .fighter .par{position:absolute;inset:0}
.pll .frame{position:absolute;inset:0;border:4px solid var(--ink);border-radius:10px;overflow:hidden;transform:skewX(-6deg);box-shadow:10px 12px 0 var(--ink)}
.pll .fighter.cat .frame{background:radial-gradient(circle at 50% 42%,#ffd0e0,var(--pink) 46%,var(--pink-d) 80%,var(--berry))}
.pll .fighter.dog .frame{background:radial-gradient(circle at 50% 42%,var(--ice),var(--blue) 46%,var(--blue-d) 80%,var(--navy))}
.pll .frame .rays{position:absolute;inset:-40%;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.2) 0 8deg,transparent 8deg 22deg);animation:pll-spin 18s linear infinite}
@keyframes pll-spin{to{transform:rotate(1turn)}}
.pll .frame .puppet{position:absolute;inset:0;transform-origin:50% 100%}
.pll .frame .still,.pll .frame .sprite{position:absolute;inset:0;width:100%;height:100%;transform:skewX(6deg) scale(1.1);transform-origin:50% 100%}
.pll .frame .still{object-fit:cover;object-position:50% 100%}
.pll .frame .sprite{opacity:0}
.pll .frame.live .sprite{opacity:1}
.pll .frame.live .still{opacity:0}
.pll .tag{position:absolute;z-index:2;bottom:-16px;font-family:var(--disp);font-weight:700;font-size:clamp(15px,1.6vw,22px);text-transform:uppercase;padding:.25em .7em .2em;
  border:3px solid var(--ink);border-radius:6px;box-shadow:4px 5px 0 var(--ink);transform:skewX(-9deg);color:var(--ink);white-space:nowrap}
.pll .fighter.cat .tag{left:-8px;background:var(--cream)}
.pll .fighter.dog .tag{right:-8px;background:var(--ice)}
.pll .tag em{font-style:normal;display:block;font-size:.58em;letter-spacing:.12em;opacity:.7;margin-top:2px}
.pll .vs{position:absolute;z-index:7;left:50%;top:44%;translate:-50% -50%;pointer-events:none;will-change:transform}
.pll .vs-par{position:relative}
.pll .vs-word,.pll .vs-ghost{display:block;font-family:var(--disp);font-weight:700;font-size:clamp(120px,19vw,290px);line-height:.8;letter-spacing:-.04em;padding:0 .08em;transform:skewX(-12deg) rotate(-6deg)}
.pll .vs-word{position:relative;background:linear-gradient(180deg,#fff 0 38%,var(--bolt) 39% 62%,var(--amber) 63% 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  -webkit-text-stroke:.045em var(--ink);paint-order:stroke fill;filter:drop-shadow(.04em .05em 0 var(--ink)) drop-shadow(0 0 30px rgba(255,240,77,.55))}
.pll .vs-ghost{position:absolute;left:0;top:0;opacity:0;mix-blend-mode:screen}
.pll .vs-ghost.p{color:var(--pink)}.pll .vs-ghost.b{color:#3fd0ff}
.pll .vs-ring{position:absolute;left:50%;top:50%;width:150%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;border:6px solid var(--bolt);opacity:0}
.pll .announcer{position:absolute;z-index:9;left:50%;top:44%;translate:-50% -50%;pointer-events:none;opacity:0;font-family:var(--disp);font-weight:700;
  font-size:clamp(70px,12vw,180px);color:var(--white);-webkit-text-stroke:.08em var(--ink);paint-order:stroke fill;text-transform:uppercase;white-space:nowrap;font-variant-numeric:tabular-nums}
.pll .hero-copy{position:absolute;z-index:8;left:50%;bottom:clamp(18px,5vh,56px);translate:-50% 0;width:min(920px,calc(100% - 32px));text-align:center}
.pll .logo{font-family:var(--disp);font-weight:700;font-size:clamp(48px,7.6vw,118px);line-height:.85;letter-spacing:.005em;text-transform:uppercase;
  color:var(--white);-webkit-text-stroke:.09em var(--ink);paint-order:stroke fill;filter:drop-shadow(.05em .06em 0 var(--ink))}
.pll .logo .ch{display:inline-block;transform-origin:50% 100%}
.pll .logo .paw-c{color:var(--pink-l)}
.pll .logo .leg-c{color:var(--ice)}
.pll .sub{margin:clamp(10px,1.6vh,18px) auto clamp(14px,2.4vh,26px);max-width:40ch;width:fit-content;padding:.45em 1em;border-radius:14px;background:rgba(18,9,31,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font-weight:800;font-size:clamp(16px,1.5vw,21px);line-height:1.35;color:var(--white);
  text-shadow:0 2px 0 var(--ink),0 0 18px rgba(18,9,31,.8)}
.pll .ctas{display:flex;flex-wrap:wrap;gap:16px 22px;justify-content:center}
.pll .flash{position:absolute;inset:0;z-index:20;background:#fff;opacity:0;pointer-events:none}
.pll .slash{position:absolute;inset:0;z-index:19;width:100%;height:100%;pointer-events:none;overflow:visible}
.pll .slash path{fill:var(--bolt);stroke:var(--ink);stroke-width:.5;vector-effect:non-scaling-stroke}
.pll .scroll-cue{position:absolute;z-index:8;right:clamp(16px,3vw,40px);bottom:clamp(18px,4vh,40px);font-family:var(--disp);font-size:13px;letter-spacing:.2em;color:var(--white);
  writing-mode:vertical-rl;opacity:.75}
.pll .scroll-cue::after{content:"";display:block;width:2px;height:48px;background:var(--white);margin:10px auto 0;animation:pll-cue 1.6s cubic-bezier(.65,0,.35,1) infinite;transform-origin:top}
@keyframes pll-cue{0%{transform:scaleY(0)}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}
.pll .pll-main{position:relative;z-index:2}
/* ---------- halftone section transitions ---------- */
.pll .dotband{position:absolute;left:-3%;right:-3%;bottom:-2px;height:var(--bh,15vh);z-index:5;pointer-events:none;display:grid;grid-template-rows:repeat(4,1fr);transform:skewY(-2.5deg);transform-origin:100% 100%}
.pll .dotband i{display:block;margin-bottom:-1px;background:var(--c);
  -webkit-mask:radial-gradient(circle,#000 var(--r),transparent calc(var(--r) + .7px)) 0 0/14px 14px;
  mask:radial-gradient(circle,#000 var(--r),transparent calc(var(--r) + .7px)) 0 0/14px 14px}
.pll .dotband i:nth-child(1){--r:1.6px}.pll .dotband i:nth-child(2){--r:3.6px;-webkit-mask-position:7px 0;mask-position:7px 0}
.pll .dotband i:nth-child(3){--r:6.2px}.pll .dotband i:nth-child(4){--r:10.5px;-webkit-mask-position:7px 0;mask-position:7px 0}
/* =========================================================
   SELECT
   ========================================================= */
.pll .select{position:relative;padding:clamp(80px,11vw,150px) 0 calc(var(--bh) + 10px);--bh:15vh;background:var(--ink);overflow:hidden;
  clip-path:polygon(0 0,100% 4.5vw,100% 100%,0 100%)}
.pll .select::before{content:"";position:absolute;inset:0;background:
  linear-gradient(105deg,rgba(255,61,127,.22) 0 49.8%,rgba(47,107,255,.22) 50.2% 100%);pointer-events:none}
.pll .scan{position:absolute;inset:-10px 0;pointer-events:none;opacity:.5;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 2px,transparent 2px 5px);animation:pll-scan 1.2s linear infinite}
@keyframes pll-scan{to{transform:translate3d(0,5px,0)}}
.pll .sel-edge{position:absolute;left:0;right:0;top:0;height:calc(4.5vw + 10px);background:var(--bolt);clip-path:polygon(0 0,100% 4.5vw,100% calc(4.5vw + 10px),0 10px);z-index:2;pointer-events:none}
.pll .wrap{position:relative;z-index:1;width:min(1320px,calc(100% - 32px));margin:0 auto}
.pll .kicker{font-family:var(--disp);font-weight:600;font-size:clamp(13px,1.2vw,16px);letter-spacing:.24em;text-transform:uppercase;color:var(--bolt)}
.pll .live{display:inline-flex;align-items:center;gap:.6em}
.pll .live::before{content:"";width:.6em;height:.6em;border-radius:50%;background:var(--pink);box-shadow:0 0 0 0 rgba(255,61,127,.7);animation:pll-livepulse 1.4s cubic-bezier(.22,1,.36,1) infinite}
@keyframes pll-livepulse{0%{box-shadow:0 0 0 0 rgba(255,61,127,.7)}100%{box-shadow:0 0 0 .9em rgba(255,61,127,0)}}
.pll .h2{font-size:clamp(44px,7.4vw,112px);color:var(--white);margin:.12em 0 .2em}
.pll .h2 .w{display:inline-block}
.pll .lede{max-width:56ch;color:#efe6ff;font-size:clamp(16px,1.35vw,19px)}
.pll .select-head{text-align:center;margin-bottom:clamp(30px,5vw,60px)}
.pll .select-head .lede{margin:0 auto}
.pll .stage{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr) minmax(0,1fr);gap:clamp(14px,2.2vw,34px);align-items:center}
.pll .slot{position:relative;aspect-ratio:3/4.1;border:4px solid var(--ink);border-radius:14px;overflow:hidden;box-shadow:10px 12px 0 #000;isolation:isolate;--gx:50%}
.pll .slot.cat{rotate:-2deg}
.pll .slot.dog{rotate:2deg}
.pll .slot .bg{position:absolute;inset:-30px;z-index:0}
.pll .slot .rays{position:absolute;inset:-50%;z-index:0;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.2) 0 7deg,transparent 7deg 20deg);animation:pll-spin 24s linear infinite}
.pll .slot .vig{position:absolute;inset:0;z-index:0;pointer-events:none}
.pll .slot.cat .vig{background:radial-gradient(ellipse 70% 60% at 50% 42%,rgba(255,240,245,.35),transparent 70%)}
.pll .slot.dog .vig{background:radial-gradient(ellipse 70% 60% at 50% 42%,rgba(230,240,255,.35),transparent 70%)}
.pll .slot .pic{position:absolute;inset:0;z-index:1;display:grid;place-items:center}
.pll .slot .pic img{width:100%;height:100%;object-fit:cover;object-position:50% 40%;filter:drop-shadow(6px 8px 0 rgba(18,9,31,.35))}
.pll .slot.cat .pic::after,.pll .slot.dog .pic::after{content:"";position:absolute;inset:0;pointer-events:none}
.pll .slot.cat .pic::after{background:linear-gradient(180deg,transparent 58%,rgba(62,8,32,.85))}
.pll .slot.dog .pic::after{background:linear-gradient(180deg,transparent 58%,rgba(7,19,52,.85))}
.pll .slot::after{content:"";position:absolute;inset:0;z-index:5;pointer-events:none;mix-blend-mode:soft-light;opacity:.9;
  background:linear-gradient(105deg,transparent calc(var(--gx) - 22%),rgba(255,255,255,.75) var(--gx),transparent calc(var(--gx) + 22%))}
.pll .slot .lines{position:absolute;inset:0;z-index:3;width:100%;height:100%;pointer-events:none}
.pll .slot .imp{position:absolute;inset:0;z-index:2;background:#000;opacity:0;pointer-events:none}
.pll .slot.f1 .imp{opacity:1;background:#000}
.pll .slot.f1 .pic img{filter:brightness(0) invert(1);z-index:3;position:relative}
.pll .slot.f2 .imp{opacity:1;background:#fff}
.pll .slot.f2 .pic img{filter:brightness(0);z-index:3;position:relative}
.pll .slot.f1 .pic::after,.pll .slot.f2 .pic::after{opacity:0}
.pll .slot .who{position:absolute;z-index:4;left:0;right:0;bottom:0;padding:0 clamp(12px,1.4vw,20px) clamp(14px,1.6vw,22px)}
.pll .slot .pl{display:inline-block;font-family:var(--disp);font-weight:700;font-size:clamp(12px,1vw,14px);letter-spacing:.14em;padding:.25em .7em;border:2px solid var(--ink);border-radius:4px;
  transform:skewX(-9deg);color:var(--ink)}
.pll .slot.cat .pl{background:var(--cream)}
.pll .slot.dog .pl{background:var(--ice)}
.pll .slot .name{font-size:clamp(32px,3.6vw,58px);color:var(--white);margin-top:.12em;white-space:nowrap}
.pll .slot .name .ch{display:inline-block}
.pll .slot .role{font-family:var(--disp);font-weight:600;font-size:clamp(14px,1.3vw,18px);letter-spacing:.1em;text-transform:uppercase;color:var(--bolt);
  -webkit-text-stroke:.16em var(--ink);paint-order:stroke fill;margin-top:.15em}
.pll .ready{position:absolute;z-index:6;left:-10%;right:-10%;top:40%;padding:.12em 0 .06em;text-align:center;font-family:var(--disp);font-weight:700;font-size:clamp(30px,3.4vw,54px);letter-spacing:.08em;
  color:var(--ink);background:var(--bolt);border-block:4px solid var(--ink);transform:rotate(-9deg);opacity:0;pointer-events:none}
.pll .stage-vs{position:absolute;z-index:4;left:50%;top:-8px;translate:-50% -50%;width:clamp(58px,6vw,84px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;
  background:var(--bolt);border:4px solid var(--ink);box-shadow:5px 6px 0 var(--ink);font-family:var(--disp);font-weight:700;font-size:clamp(22px,2.4vw,34px);color:var(--ink);pointer-events:none}
.pll .stage-vs span{display:block;transform:skewX(-10deg) rotate(-8deg)}
.pll .grid-wrap{position:relative;padding-top:clamp(36px,3.6vw,52px)}
.pll .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(8px,1vw,14px);list-style:none}
.pll .grid li{position:relative}
.pll .tile{position:relative;display:block;width:100%;aspect-ratio:1;border:3px solid var(--ink);border-radius:10px;overflow:visible;cursor:pointer;padding:0;
  background:none;font:inherit;color:inherit;transform:skewX(-6deg);transition:transform .35s cubic-bezier(.34,1.56,.64,1)}
.pll .tile .in{position:absolute;inset:0;border-radius:7px;overflow:hidden}
.pll .tile.cat .in{background:radial-gradient(circle at 50% 40%,var(--pink-l),var(--pink) 60%,var(--pink-d))}
.pll .tile.dog .in{background:radial-gradient(circle at 50% 40%,var(--ice),var(--blue) 60%,var(--blue-d))}
.pll .tile img{width:100%;height:100%;object-fit:cover;object-position:50% 12%;transform:skewX(6deg) scale(1.2);transition:transform .45s cubic-bezier(.22,1,.36,1),filter .3s}
.pll .tile.cat .in::after,.pll .tile.dog .in::after{content:"";position:absolute;inset:0;pointer-events:none}
.pll .tile.cat .in::after{background:linear-gradient(180deg,transparent 45%,rgba(255,61,127,.75));box-shadow:inset 0 0 0 3px rgba(255,179,205,.5)}
.pll .tile.dog .in::after{background:linear-gradient(180deg,transparent 45%,rgba(47,107,255,.8));box-shadow:inset 0 0 0 3px rgba(214,229,255,.5)}
.pll .tile .nm{z-index:1;position:absolute;left:4px;right:4px;bottom:4px;font-family:var(--disp);font-weight:700;font-size:clamp(11px,1vw,14px);text-transform:uppercase;text-align:center;
  color:var(--white);-webkit-text-stroke:.22em var(--ink);paint-order:stroke fill;line-height:1;transform:skewX(6deg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pll .tile::after{content:"";position:absolute;inset:-7px;border-radius:13px;border:4px solid transparent;pointer-events:none;transition:border-color .2s}
.pll .tile .cur{position:absolute;z-index:3;top:-14px;opacity:0;transform:translateY(6px) scale(.6);transition:opacity .2s,transform .3s cubic-bezier(.34,1.56,.64,1)}
.pll .tile .cur b{display:inline-block;font-family:var(--disp);font-weight:700;font-size:12px;letter-spacing:.06em;padding:1px 7px;border:2px solid var(--ink);border-radius:4px;color:var(--ink)}
.pll .tile.cat .cur{left:-6px}.pll .tile.cat .cur b{background:var(--pink-l)}
.pll .tile.dog .cur{right:-6px}.pll .tile.dog .cur b{background:var(--ice)}
.pll .tile .new{position:absolute;z-index:2;top:4px;left:4px;font-family:var(--disp);font-weight:700;font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:1px 5px;background:var(--bolt);color:var(--ink);border:2px solid var(--ink);border-radius:4px;pointer-events:none}
.pll .tile:hover,.pll .tile:focus-visible{transform:skewX(-6deg) translateY(-6px) scale(1.06);z-index:2}
.pll .tile:hover img,.pll .tile:focus-visible img{transform:skewX(6deg) scale(1.34)}
.pll .tile[aria-pressed="true"]::after{border-color:var(--bolt);animation:pll-selpulse 1s cubic-bezier(.45,0,.55,1) infinite}
.pll .tile[aria-pressed="true"] .cur{opacity:1;transform:none}
.pll .tile.cat[aria-pressed="true"]::after{box-shadow:0 0 0 3px var(--pink)}
.pll .tile.dog[aria-pressed="true"]::after{box-shadow:0 0 0 3px var(--blue)}
.pll .tile:focus-visible{outline:none}
.pll .tile:focus-visible::after{border-color:var(--white)}
@keyframes pll-selpulse{50%{border-color:var(--white)}}
.pll .grid-legend{display:flex;justify-content:space-between;gap:12px;margin-top:clamp(14px,1.6vw,22px);font-family:var(--disp);font-weight:600;font-size:clamp(13px,1.1vw,15px);
  letter-spacing:.12em;text-transform:uppercase}
.pll .grid-legend span:first-child{color:var(--pink-l)}
.pll .grid-legend span:last-child{color:#9fc0ff}
.pll .hint{margin-top:clamp(18px,2.4vw,30px);text-align:center;color:#cbbde6;font-size:14px}
.pll .hint b{color:var(--white)}
/* =========================================================
   ROUNDS
   ========================================================= */
.pll .rounds{position:relative;background:var(--cream)}
.pll .round{position:relative;overflow:hidden;min-height:100svh;display:grid;align-items:center;padding:clamp(70px,9vw,110px) 0}
.pll .round:nth-child(odd){background:var(--cream);color:var(--ink)}
.pll .round:nth-child(even){background:var(--navy);color:var(--white)}
.pll .round .stripes{position:absolute;inset:0;pointer-events:none;opacity:.5}
.pll .round:nth-child(odd) .stripes{background:repeating-linear-gradient(115deg,rgba(255,61,127,.09) 0 30px,transparent 30px 60px)}
.pll .round:nth-child(even) .stripes{background:repeating-linear-gradient(65deg,rgba(47,107,255,.16) 0 30px,transparent 30px 60px)}
.pll .round .zap{position:absolute;inset:0;z-index:6;background:var(--bolt);pointer-events:none;display:none}
.pll .rounds.pinned .round .zap{display:block}
.pll .round .wrap{display:grid;grid-template-columns:1.25fr 1fr;gap:clamp(24px,4vw,64px);align-items:center}
.pll .round:nth-child(even) .wrap{grid-template-columns:1fr 1.25fr}
.pll .round:nth-child(even) .shot{order:2}
.pll .shot{position:relative;border:4px solid var(--ink);border-radius:14px;overflow:hidden;box-shadow:14px 16px 0 var(--ink);transform:rotate(-1.5deg)}
.pll .round:nth-child(even) .shot{transform:rotate(1.5deg);box-shadow:-14px 16px 0 #000}
.pll .shot .kb{position:relative}
.pll .shot img{width:100%;height:auto}
.pll .ov{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.pll .ov .lane-ink{fill:none;stroke:var(--ink);stroke-width:20;stroke-linecap:round;stroke-linejoin:round}
.pll .ov .lane{fill:none;stroke:var(--bolt);stroke-width:11;stroke-linecap:round;stroke-linejoin:round}
.pll .ov .base{fill:none;stroke-width:8}
.pll .ov .base.c{stroke:var(--pink)}.pll .ov .base.d{stroke:var(--blue)}
.pll .ov .pawm circle,.pll .ov .pawm ellipse{fill:var(--white);stroke:var(--ink);stroke-width:4}
.pll .ov .pawm .pad{fill:var(--pink)}
.pll .ov .aimbar{fill:rgba(255,240,77,.9);stroke:var(--ink);stroke-width:4}
.pll .ov .aimhead{fill:var(--bolt);stroke:var(--ink);stroke-width:4;stroke-linejoin:round}
.pll .ov .hold{fill:none;stroke:var(--bolt);stroke-width:7;stroke-linecap:round}
.pll .ov .holdt{fill:none;stroke:rgba(18,9,31,.45);stroke-width:7}
.pll .ov .proj{fill:var(--white);stroke:var(--ink);stroke-width:4}
.pll .ov .boom{fill:none;stroke:var(--bolt);stroke-width:8}
.pll .ov .proj,.pll .ov .boom{opacity:0}
.pll .ov .star{fill:var(--bolt);stroke:var(--ink);stroke-width:5;stroke-linejoin:round}
.pll .ov .tap{fill:none;stroke:var(--white);stroke-width:5;opacity:0}
.pll .shot.tall{max-width:330px;justify-self:center;width:100%;border-width:10px;border-radius:34px;box-shadow:14px 16px 0 #000}
.pll .shot.tall::before{content:"";position:absolute;z-index:3;top:8px;left:50%;width:34%;height:16px;translate:-50% 0;background:var(--ink);border-radius:0 0 12px 12px}
.pll .shot.tall img{aspect-ratio:420/747;object-fit:cover}
.pll .banner{display:inline-block;font-family:var(--disp);font-weight:700;font-size:clamp(15px,1.4vw,19px);letter-spacing:.2em;text-transform:uppercase;padding:.35em 1em .3em;
  border:3px solid var(--ink);border-radius:5px;transform:skewX(-12deg);box-shadow:5px 6px 0 var(--ink);color:var(--ink)}
.pll .round:nth-child(odd) .banner{background:var(--pink);color:var(--white);-webkit-text-stroke:.15em var(--ink);paint-order:stroke fill}
.pll .round:nth-child(even) .banner{background:var(--bolt)}
.pll .round h3{font-size:clamp(48px,6.6vw,104px);margin:.2em 0 .25em}
.pll .round h3 .w{display:inline-block;transform-origin:50% 100%}
.pll .round:nth-child(odd) h3{color:var(--pink)}
.pll .round:nth-child(even) h3{color:var(--white)}
.pll .round p{font-size:clamp(17px,1.4vw,20px);max-width:38ch;font-weight:600}
.pll .round:nth-child(even) p{color:#dfe8ff}
.pll .round .chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px;list-style:none}
.pll .round .chips li{font-family:var(--disp);font-weight:600;font-size:15px;padding:.3em .8em;border:2px solid currentColor;border-radius:999px}
.pll .round .num{position:absolute;right:-2vw;bottom:-6vw;width:min(46vw,560px);height:min(46vw,560px);pointer-events:none;overflow:visible}
.pll .round .num text{font-family:var(--disp);font-weight:700;font-size:118px;fill:none;stroke:rgba(18,9,31,.16);stroke-width:.7;stroke-dasharray:700;stroke-dashoffset:0}
.pll .round:nth-child(even) .num{left:-2vw;right:auto}
.pll .round:nth-child(even) .num text{stroke:rgba(255,255,255,.16)}
.pll .rounds.pinned .round{position:absolute;inset:0;min-height:0;height:100%}
.pll .rounds.pinned{height:100svh;overflow:hidden}
.pll .pips{position:absolute;z-index:9;left:50%;bottom:22px;transform:translateX(-50%);display:none;gap:10px}
.pll .rounds.pinned .pips{display:flex}
.pll .pips i{width:34px;height:8px;border:2px solid var(--ink);background:rgba(255,255,255,.5);transform:skewX(-20deg);transition:background .2s}
.pll .pips i.on{background:var(--bolt)}
/* =========================================================
   TAPES
   ========================================================= */
.pll .tapes{position:relative;height:clamp(220px,26vw,340px);background:var(--ink);overflow:hidden}
.pll .tape{position:absolute;left:-10%;width:120%;padding:.5em 0;border-block:4px solid var(--ink);white-space:nowrap;font-family:var(--disp);font-weight:700;
  font-size:clamp(24px,3.4vw,46px);text-transform:uppercase;line-height:1}
.pll .tape.t1{top:28%;background:var(--pink);color:var(--white);transform:rotate(-5deg);-webkit-text-stroke:.07em var(--ink);paint-order:stroke fill}
.pll .tape.t2{top:44%;background:var(--bolt);color:var(--ink);transform:rotate(4deg)}
.pll .tape .row{display:inline-flex;gap:.8em;will-change:transform}
.pll .tape .row span::after{content:"\2726";margin-left:.8em}
/* =========================================================
   TALE OF THE TAPE
   ========================================================= */
.pll .tale{position:relative;padding:clamp(70px,9vw,120px) 0 calc(var(--bh) + 20px);--bh:15vh;background:var(--ink);overflow:hidden}
.pll .tale-head{text-align:center;margin-bottom:clamp(28px,4vw,50px)}
.pll .tale-card{position:relative;max-width:980px;margin:0 auto;border:4px solid var(--ink);border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px rgba(255,255,255,.12),14px 16px 0 #000;background:var(--ink)}
.pll .tale-card::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,transparent 40%,rgba(255,255,255,.16) 50%,transparent 60%);transform:translateX(-100%);animation:pll-sweep 5s cubic-bezier(.65,0,.35,1) 1.5s infinite}
@keyframes pll-sweep{0%{transform:translateX(-100%)}40%,100%{transform:translateX(100%)}}
.pll .tale-row{display:grid;grid-template-columns:1fr 170px 1fr;align-items:stretch;border-top:3px solid rgba(18,9,31,.6)}
.pll .tale-row:first-child{border-top:0}
.pll .tale-row>div{position:relative;padding:clamp(14px,1.8vw,22px) clamp(14px,2.4vw,32px) clamp(20px,2.4vw,28px)}
.pll .tale-row .l{text-align:right;background:var(--pink-d)}
.pll .tale-row .r{background:var(--blue-d)}
.pll .tale-row .m{font-family:var(--disp);font-weight:600;font-size:clamp(12px,1.05vw,14px);letter-spacing:.18em;text-transform:uppercase;text-align:center;color:var(--ink);background:var(--white);
  display:grid;place-items:center;padding-inline:8px}
.pll .tale-row .val{display:inline-block;font-family:var(--disp);font-weight:700;font-size:clamp(24px,3vw,42px);line-height:1;color:var(--white);-webkit-text-stroke:.08em var(--ink);paint-order:stroke fill;text-transform:uppercase;font-variant-numeric:tabular-nums}
.pll .tale-row .note{display:block;font-family:var(--body);font-weight:700;font-size:clamp(13px,1.05vw,15px);color:rgba(255,255,255,.88);margin-top:4px;-webkit-text-stroke:0}
.pll .tb{position:absolute;bottom:8px;height:10px;width:calc(var(--v) * (100% - 24px));background:linear-gradient(180deg,#fff7a8,var(--bolt) 50%,var(--amber));border:2px solid var(--ink);border-radius:2px;transform:skewX(-20deg)}
.pll .tale-row .l .tb{right:0;transform-origin:100% 50%}
.pll .tale-row .r .tb{left:0;transform-origin:0 50%}
.pll .tale-foot{text-align:center;margin-top:22px;color:#cbbde6;font-size:15px}
/* =========================================================
   SHELTER
   ========================================================= */
.pll .shelter{position:relative;padding:clamp(70px,9vw,120px) 0 calc(var(--bh) + 20px);--bh:15vh;background:var(--cream);color:var(--ink);overflow:hidden}
.pll .shelter .stripes{position:absolute;inset:-32px;background:radial-gradient(circle at center,rgba(255,61,127,.16) 0 2px,transparent 2.6px);background-size:16px 16px;animation:pll-dots 6s linear infinite}
@keyframes pll-dots{to{transform:translate3d(16px,-32px,0)}}
.pll .shelter .wrap{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(24px,5vw,80px);align-items:center}
.pll .belt{position:relative;aspect-ratio:1;max-width:440px;width:100%;justify-self:center}
.pll .belt-in{position:absolute;inset:0;transform-style:preserve-3d}
.pll .belt .disc{position:absolute;inset:6%;border-radius:50%;border:5px solid var(--ink);background:conic-gradient(from -30deg,var(--bolt),var(--amber),var(--bolt),#fff7a8,var(--bolt));box-shadow:12px 14px 0 var(--ink)}
.pll .belt .disc::after{content:"";position:absolute;inset:12%;border-radius:50%;border:4px dashed rgba(18,9,31,.5)}
.pll .belt .disc::before{content:"";position:absolute;inset:0;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.35) 0 4deg,transparent 4deg 30deg)}
.pll .belt img{position:absolute;inset:20%;width:60%;height:60%;object-fit:contain;filter:drop-shadow(4px 5px 0 rgba(18,9,31,.4))}
.pll .belt .split{position:absolute;right:-2%;top:2%;width:38%;aspect-ratio:1;border-radius:50%;background:var(--pink);border:4px solid var(--ink);display:grid;place-items:center;text-align:center;
  font-family:var(--disp);font-weight:700;color:var(--white);-webkit-text-stroke:.08em var(--ink);paint-order:stroke fill;line-height:.9;box-shadow:6px 7px 0 var(--ink);transform:rotate(10deg)}
.pll .belt .split b{font-size:clamp(28px,3.4vw,46px);display:block}
.pll .belt .split small{font-size:clamp(12px,1vw,15px);letter-spacing:.06em}
.pll .belt canvas{position:absolute;inset:-20%;width:140%;height:140%;pointer-events:none}
.pll .shelter h2{color:var(--pink);font-size:clamp(42px,5.8vw,88px)}
.pll .shelter h2 .char{display:inline-block}
.pll .shelter p{font-size:clamp(17px,1.4vw,20px);font-weight:600;max-width:44ch;margin-top:14px}
.pll .shelter p strong{background:linear-gradient(var(--pink-l),var(--pink-l)) 0 88%/100% 42% no-repeat;font-weight:900}
.pll .shelter .kicker{color:var(--pink-d)}
.pll .shelter .ctas{justify-content:flex-start;margin-top:28px}
/* =========================================================
   CONTINUE
   ========================================================= */
.pll .cont{position:relative;padding:clamp(80px,10vw,140px) 0 clamp(36px,4vw,56px);background:#000;overflow:hidden;text-align:center}
.pll .cont::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 50% 60% at 50% 45%,rgba(255,61,127,.28),transparent 70%),radial-gradient(ellipse 40% 50% at 70% 60%,rgba(47,107,255,.25),transparent 70%)}
.pll .cont .cflash{position:absolute;inset:0;background:radial-gradient(circle at 50% 38%,#fff 0,rgba(255,255,255,.6) 18%,transparent 48%);opacity:0;pointer-events:none;z-index:3}
.pll .cont .wrap{display:flex;flex-direction:column;align-items:center}
.pll .cont h2{font-size:clamp(46px,8vw,120px);color:var(--white)}
.pll .count{position:relative;height:clamp(150px,22vw,300px);width:clamp(150px,22vw,300px);margin:clamp(10px,2vw,24px) auto}
.pll .count .n{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--disp);font-weight:700;font-size:clamp(150px,22vw,300px);line-height:1;color:var(--bolt);
  -webkit-text-stroke:.05em var(--ink);paint-order:stroke fill;filter:drop-shadow(.03em .04em 0 var(--pink)) drop-shadow(0 0 40px rgba(255,240,77,.45));transition:opacity .25s}
.pll .count svg{position:absolute;inset:-8%;width:116%;height:116%;transform:rotate(-90deg)}
.pll .count circle{fill:none;stroke-width:6}
.pll .count .trk{stroke:rgba(255,255,255,.12)}
.pll .count .prg{stroke:var(--pink);stroke-linecap:round}
.pll .press{position:absolute;left:50%;top:50%;translate:-50% -50%;white-space:nowrap;font-family:var(--disp);font-weight:700;font-size:clamp(24px,3vw,40px);letter-spacing:.06em;color:var(--white);
  -webkit-text-stroke:.12em var(--ink);paint-order:stroke fill;background:var(--pink);padding:.15em .6em .1em;border:3px solid var(--ink);border-radius:6px;transform:skewX(-10deg) rotate(-4deg);opacity:0}
.pll .count.ended .n{opacity:.18}
.pll .count.ended .press{opacity:1;animation:pll-blink .5s steps(2,jump-none) infinite}
@keyframes pll-blink{0%{visibility:visible}100%{visibility:hidden}}
.pll .cont p{color:#e8ddff;font-size:clamp(17px,1.4vw,20px);max-width:44ch;margin:0 auto 28px;font-weight:600}
.pll .cont .mascot,.pll .cont .mascot2{height:auto}
.pll .cont .mascot{position:absolute;right:clamp(-30px,4vw,80px);bottom:0;width:clamp(130px,17vw,250px);transform-origin:50% 100%}
.pll .cont .mascot2{position:absolute;left:clamp(-30px,4vw,80px);bottom:0;width:clamp(110px,14vw,210px);transform:scaleX(-1);transform-origin:50% 100%}
.pll .foot{position:relative;z-index:1;margin-top:clamp(50px,6vw,90px);display:flex;flex-wrap:wrap;gap:16px 28px;align-items:center;justify-content:center;color:#b9abd6;font-size:14px}
.pll .foot img{width:120px;height:auto;animation:pll-bob 3s cubic-bezier(.45,0,.55,1) infinite}
@keyframes pll-bob{50%{transform:translateY(-5px) rotate(-2deg)}}
.pll .foot a{color:#fff;font-weight:700}
/* ---------- responsive ---------- */
@media (max-width:1200px){.pll .foot{padding-bottom:calc(clamp(130px,17vw,250px)*1.2)}}
@media (max-width:820px){
  .pll .stage{grid-template-columns:1fr 1fr;grid-template-areas:"p1 p2" "grid grid"}
  .pll .slot.cat{grid-area:p1}.pll .slot.dog{grid-area:p2}.pll .grid-wrap{grid-area:grid}
  .pll .slot{aspect-ratio:4/4.2}
  .pll .grid{grid-template-columns:repeat(6,1fr)}
}
@media (max-width:820px){
  .pll .fighter{width:clamp(130px,36vw,220px);top:31%}
  .pll .fighter.cat{left:16px;translate:0 -50%;rotate:-3deg}
  .pll .fighter.dog{right:16px;translate:0 -50%;rotate:3deg}
  .pll .side.cat{clip-path:polygon(0 0,64% 0,36% 100%,0 100%)}
  .pll .side.dog{clip-path:polygon(64% 0,100% 0,100% 100%,36% 100%)}
  .pll .vs{top:61%}
  .pll .announcer{top:61%}
  .pll .vs-word,.pll .vs-ghost{font-size:clamp(96px,30vw,170px)}
  .pll .hero-copy{bottom:22px}
  .pll .scroll-cue{display:none}
  .pll .round .wrap,.pll .round:nth-child(even) .wrap{grid-template-columns:1fr}
  .pll .round:nth-child(even) .shot{order:0}
  .pll .shot.tall{max-width:200px;border-width:7px;border-radius:24px}
  .pll .shelter .wrap{grid-template-columns:1fr}
  .pll .belt{max-width:300px}
  .pll .tale-row{grid-template-columns:1fr 96px 1fr}
}
@media (max-width:820px) and (max-height:760px){.pll .fighter{width:clamp(110px,30vw,180px)}}
@media (max-width:560px){
  .pll .foot{padding-bottom:120px}
  .pll .grid{grid-template-columns:repeat(4,1fr)}
  .pll .slot{aspect-ratio:3/3.9}
  .pll .slot .name{font-size:clamp(22px,6.6vw,32px);white-space:normal}
  .pll .round{padding:64px 0}
  .pll .round h3{font-size:clamp(40px,12vw,58px)}
  .pll .rounds.pinned .round .wrap{gap:14px}
  .pll .rounds.pinned .shot img{max-height:34svh;object-fit:cover}
  .pll .rounds.pinned .shot.tall{max-width:140px}
  .pll .rounds.pinned .shot.tall img{max-height:28svh}
  .pll .rounds.pinned .round p{font-size:16px}
  .pll .rounds.pinned .round .chips{margin-top:12px}
  .pll .rounds.pinned .round h3{margin:.15em 0 .15em}
  .pll .tale-row>div{padding:12px 10px 20px}
  .pll .tale-row .val{font-size:22px}
  .pll .ctas .mag{width:100%}
  .pll .ctas .btn{width:100%;justify-content:center;white-space:nowrap;font-size:17px;padding-inline:.8em}
  .pll .shelter .ctas .mag,.pll .shelter .ctas .btn{width:auto}
  .pll .cont .mascot{width:104px;right:-14px}
  .pll .cont .mascot2{display:none}
  .pll .select,.pll .tale,.pll .shelter{--bh:11vh}
}
@media (prefers-reduced-motion:reduce){
  .pll *,.pll *::before,.pll *::after{animation:none!important;transition:none!important}
  .pll .count .press{opacity:1}
  .pll .count .n{opacity:.18}
}
/* ---------- port: page shell (the original set these on html and body) ---------- */
html:has(.pll),body:has(.pll){background:#12091f;overflow-x:clip;scroll-behavior:auto}
.pll{position:relative;display:block;min-height:100vh;text-align:left}
@keyframes pll-reveal{to{visibility:visible}}
@media (prefers-reduced-motion:no-preference){
  /* hidden until the intro sets its start pose; shown after 5 s anyway if the motion chunk never runs */
  .pll.js-intro .hero-shake{visibility:hidden;animation:pll-reveal 0s linear 5s forwards}
}
/* ---------- select: the new dogs (no in-game art yet: a paw, the name, breed and role; never a stand-in picture) ---------- */
.pll .newdogs{margin:clamp(26px,3.4vw,44px) auto 0;max-width:1120px;text-align:center}
.pll .nd-head{font-family:var(--disp);font-weight:700;font-size:clamp(18px,1.9vw,26px);letter-spacing:.06em;text-transform:uppercase;color:var(--white);
  display:inline-flex;align-items:center;gap:.55em;flex-wrap:wrap;justify-content:center}
.pll .nd-badge{display:inline-block;font-size:.62em;letter-spacing:.14em;padding:.22em .6em .16em;background:var(--bolt);color:var(--ink);border:3px solid var(--ink);
  border-radius:5px;box-shadow:3px 3px 0 #000;transform:rotate(-6deg)}
.pll .nd-list{list-style:none;display:flex;flex-wrap:wrap;justify-content:center;gap:clamp(10px,1.2vw,16px);margin-top:clamp(14px,1.6vw,20px)}
.pll .nd{position:relative;flex:1 1 0;min-width:0;max-width:220px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;
  padding:clamp(12px,1.2vw,16px) clamp(10px,1vw,14px) clamp(14px,1.3vw,18px);border:3px solid var(--ink);border-radius:10px;box-shadow:4px 5px 0 #000;
  background:radial-gradient(circle at 50% 18%,rgba(214,229,255,.32),transparent 55%),linear-gradient(160deg,var(--blue),var(--blue-d));color:var(--white)}
.pll .nd-art{display:grid;place-items:center;width:clamp(48px,4.4vw,62px);aspect-ratio:1;border-radius:50%;background:rgba(7,19,52,.45);border:3px solid var(--ink)}
.pll .nd-art svg{width:62%;fill:var(--ice);stroke:var(--ink);stroke-width:2.4}
.pll .nd-t{display:flex;flex-direction:column;gap:3px;min-width:0}
.pll .nd-nm{font-family:var(--disp);font-weight:700;font-size:clamp(17px,1.5vw,21px);letter-spacing:.04em;text-transform:uppercase;line-height:1.05;white-space:nowrap;
  -webkit-text-stroke:.1em var(--ink);paint-order:stroke fill}
.pll .nd-meta{font-family:var(--body);font-weight:800;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ice)}
.pll .nd-role{font-family:var(--disp);font-weight:700;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--bolt);margin-bottom:2px}
.pll .nd-b{font-family:var(--body);font-weight:700;font-size:13px;line-height:1.35;color:#e6eeff}
.pll .nd-note{margin-top:clamp(12px,1.4vw,18px);color:#cbbde6;font-size:14px}
@media (max-width:820px){
  .pll .nd{flex:1 1 calc(33.333% - 12px);max-width:none}
  .pll .nd-b{display:none}
}
@media (max-width:560px){
  .pll .nd{flex:1 1 calc(50% - 10px);padding:10px 8px 12px;gap:0}
  .pll .nd-art{display:none}
  .pll .nd-nm{font-size:clamp(15px,4.3vw,18px);letter-spacing:.02em}
  .pll .nd-meta{font-size:11px;letter-spacing:.04em}
  .pll .nd-role{font-size:12px}
}
/* slot copy: breed and the in-game blurb */
.pll .slot.cat .pic::after{background:linear-gradient(180deg,transparent 46%,rgba(62,8,32,.92))}
.pll .slot.dog .pic::after{background:linear-gradient(180deg,transparent 46%,rgba(7,19,52,.92))}
.pll .slot .breed{font-family:var(--body);font-weight:800;font-size:clamp(11px,.9vw,13px);letter-spacing:.12em;text-transform:uppercase;color:var(--ice);margin-top:2px}
.pll .slot .breed:empty{display:none}
.pll .slot .blurb{margin-top:.45em;font-family:var(--body);font-weight:700;font-size:clamp(12px,1vw,15px);line-height:1.35;color:rgba(255,255,255,.94);
  text-shadow:0 1px 0 rgba(18,9,31,.6);max-width:34ch;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.pll .slot .name.long{font-size:clamp(26px,2.7vw,44px)}
.pll .pick-bio{display:none}
/* ---------- rounds: squad illustration ---------- */
.pll .shot svg.sq{display:block;width:100%;height:auto}
.pll .shot svg.sq text{font-family:var(--disp);font-weight:700}
.pll .shot svg.sq .lbl{letter-spacing:.06em}
.pll .shot svg.sq .url{font-weight:600}
.pll .round .small{margin-top:14px;font-size:14px;font-weight:700;opacity:.8;max-width:42ch}
.pll .round .ill{position:absolute;z-index:2;right:10px;bottom:8px;font-family:var(--disp);font-weight:600;font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  color:rgba(255,255,255,.7)}
@media (max-width:820px){
  .pll .slot .blurb,.pll .slot .breed{display:none}
  .pll .pick-bio{display:block;margin:16px auto 0;max-width:46ch;min-height:4.2em;text-align:center;font-size:15px;line-height:1.45;color:#efe6ff}
  .pll .pick-bio b{font-family:var(--disp);font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--white)}
  .pll .pick-bio .meta{color:var(--bolt);font-weight:800}
}
@media (max-width:560px){
  .pll .slot .name.long{font-size:clamp(16px,4.9vw,24px)}
  .pll .rounds.pinned .shot svg.sq{max-height:34svh}
}
@media (max-width:560px) and (max-height:720px){
  /* short phones: the squad round's small print would run into the round pips */
  .pll .rounds.pinned .round .small{display:none}
}
`;
