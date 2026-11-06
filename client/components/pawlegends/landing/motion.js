/* eslint-disable */
/**
 * Motion for the Pawlegends landing (`/pawlegends`), ported from the vs-screen landing script
 * (docs/plans/moba/landings/02-vs-screen.html). Plain JS on purpose: it is the original engine (canvas seam, sparks,
 * sprite fighters, GSAP intro and scroll story) with only the changes the port needs:
 * - everything is scoped to the landing root (`$`/`$$`, `gsap.context`), not the document;
 * - window/document listeners, rAF loops, timers, observers and the ticker are tracked, so the returned stop()
 *   leaves nothing running after the page unmounts (client-side navigation);
 * - GSAP and its plugins come from npm (`gsap` 3.13, the same "no charge" licence the original used from cdnjs);
 * - new for the refresh: the CATS / DOGS switch, hero blurbs and paw cards for new heroes, the Squad round.
 *
 * @param {HTMLElement} rootEl the `.pll` element
 * @param {Record<string, any>} libs gsap and its plugins
 * @returns {() => void} stop
 */
/* Module level on purpose: the SWC minifier inlined scramble() and dropped a function-local copy. */
var SCRAMBLE_POOL = 'ABCDEFGHJKLMNPRSTUVWXYZ#!?';

export function startLandingMotion(rootEl, libs) {
  "use strict";
  var gsap = libs.gsap, ScrollTrigger = libs.ScrollTrigger, SplitText = libs.SplitText, CustomEase = libs.CustomEase;
  var ac = new AbortController(), dead = false;
  var timers = new Set(), rafs = new Set(), observers = [], tickers = [], holder = {};
  function opts(o){ var r = typeof o === 'object' && o ? Object.assign({}, o) : {capture: !!o}; r.signal = ac.signal; return r; }
  function onWin(t, f, o){ window.addEventListener(t, f, opts(o)); }
  function onDoc(t, f, o){ document.addEventListener(t, f, opts(o)); }
  function on(el, t, f, o){ el.addEventListener(t, f, opts(o)); }
  function raf(cb){ if (dead) return 0; var id = requestAnimationFrame(function(t){ rafs.delete(id); if (!dead) cb(t); }); rafs.add(id); return id; }
  function later(cb, ms){ if (dead) return 0; var id = setTimeout(function(){ timers.delete(id); if (!dead) cb(); }, ms); timers.add(id); return id; }
  function io(cb){ var o = new IntersectionObserver(function(en){ if (!dead) cb(en); }); observers.push(o); return o; }
  function addTicker(f){ tickers.push(f); gsap.ticker.add(f); }

  var ctx = gsap.context(body, rootEl);

  return function stop(){
    if (dead) return;
    dead = true;
    ac.abort();
    timers.forEach(clearTimeout); rafs.forEach(cancelAnimationFrame);
    observers.forEach(function(o){ o.disconnect(); });
    tickers.forEach(function(f){ gsap.ticker.remove(f); });
    gsap.globalTimeline.timeScale(1);
    if (holder.mm) holder.mm.revert();
    ctx.revert();
    gsap.killTweensOf(Array.prototype.slice.call(rootEl.querySelectorAll('*')));
  };

  function body(){
  var root = rootEl;
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE = matchMedia('(pointer: fine)').matches;
  var G = gsap, hasG = true;
  var ST = ScrollTrigger;
  var has = {ScrollTrigger:true, SplitText:true, CustomEase:true, DrawSVGPlugin:true, MorphSVGPlugin:true, MotionPathPlugin:true};
  G.registerPlugin(ScrollTrigger, SplitText, CustomEase, libs.DrawSVGPlugin, libs.MorphSVGPlugin, libs.MotionPathPlugin);
  CustomEase.create('slam','M0,0 C0.12,0 0.16,1.12 0.3,1.04 0.44,0.98 0.6,1 1,1');
  CustomEase.create('windup','M0,0 C0.3,-0.12 0.5,-0.08 0.62,0.2 0.8,0.8 0.9,1 1,1');
  var SLAM = 'slam', WINDUP = 'windup';
  var $ = function(s,c){return (c||rootEl).querySelector(s)};
  var $$ = function(s,c){return Array.prototype.slice.call((c||rootEl).querySelectorAll(s))};
  var clamp = function(v,a,b){return v<a?a:v>b?b:v};
  var anim = !RM;

  /* =========================================================
     HERO ENGINE: one canvas, one rAF loop (seam, sparks, sprites, light)
     ========================================================= */
  var hero = $('.hero'), cv = $('#seam'), cx = cv.getContext('2d');
  var W=0, H=0, DPR=Math.min(window.devicePixelRatio||1,2);
  var S = {tug:0, tugT:0, rot:0, crack: anim ? 0 : 1, alpha:1, fight:-1, ready:false};
  var geo = {cx:0, ang:0};
  var heroVisible = true, mobile = false;
  var EXIT_ANG = Math.PI - 0.14;
  var jit = [], NPT = 24;
  function regen(){ jit = []; for (var i=0;i<=NPT;i++){ jit.push(i===0||i===NPT ? 0 : (Math.random()-.5)*Math.min(46, W*.05)); } branches = []; for (var b=0;b<3;b++){ var k = 2+Math.floor(Math.random()*(NPT-4)), segs=[], dir=Math.random()<.5?-1:1; for (var s=0;s<4;s++) segs.push([dir*(12+Math.random()*26),(Math.random()-.3)*30]); branches.push({k:k,segs:segs}); } }
  var branches = [];
  function size(){
    var r = hero.getBoundingClientRect(); W = r.width; H = r.height; mobile = innerWidth <= 820;
    cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
    var a = mobile ? .64 : .58, b = mobile ? .36 : .42;
    geo.cx = W*(a+b)/2; geo.ang = Math.atan2(H, (b-a)*W);
    regen(); sprites.forEach(sizeSprite); lastClip = '';
    frameDraw(performance.now(), 0);
  }
  function ease(t){ return t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }
  function line(){
    var ang = geo.ang + (EXIT_ANG - geo.ang)*ease(S.rot);
    var dx = Math.cos(ang), dy = Math.sin(ang);
    return {px: geo.cx + S.tug, py: H/2, dx:dx, dy:dy, nx:-dy, ny:dx};
  }
  var lastClip = '', sideCat = $('.side.cat'), sideDog = $('.side.dog');
  function applyClip(L){
    var Lg = (W+H)*2, f = function(v){return v.toFixed(1)+'px'};
    var ax = L.px - L.dx*Lg, ay = L.py - L.dy*Lg, bx = L.px + L.dx*Lg, by = L.py + L.dy*Lg;
    var key = ax.toFixed(1)+','+ay.toFixed(1)+','+bx.toFixed(1);
    if (key === lastClip) return; lastClip = key;
    sideCat.style.clipPath = 'polygon('+f(ax)+' '+f(ay)+','+f(bx)+' '+f(by)+','+f(bx+L.nx*Lg)+' '+f(by+L.ny*Lg)+','+f(ax+L.nx*Lg)+' '+f(ay+L.ny*Lg)+')';
    sideDog.style.clipPath = 'polygon('+f(ax)+' '+f(ay)+','+f(bx)+' '+f(by)+','+f(bx-L.nx*Lg)+' '+f(by-L.ny*Lg)+','+f(ax-L.nx*Lg)+' '+f(ay-L.ny*Lg)+')';
  }
  function seamPts(L){
    var Ls = Math.hypot(W,H)*.5 + 30, pts = [];
    for (var i=0;i<=NPT;i++){ var t = -1 + 2*i/NPT; pts.push([L.px + L.dx*t*Ls + L.nx*jit[i], L.py + L.dy*t*Ls + L.ny*jit[i]]); }
    return pts;
  }
  function stroke(pts, n){ cx.beginPath(); cx.moveTo(pts[0][0],pts[0][1]); for (var i=1;i<n;i++) cx.lineTo(pts[i][0],pts[i][1]); }
  function drawSeam(L){
    if (S.crack <= 0 || S.alpha <= 0) return null;
    var pts = seamPts(L), n = Math.max(2, Math.round(S.crack*NPT)+1);
    if (S.crack < 1 && n <= NPT){ var p=pts[n-1], q=pts[n], k=S.crack*NPT-(n-1); pts = pts.slice(0,n); pts.push([p[0]+(q[0]-p[0])*k, p[1]+(q[1]-p[1])*k]); n++; }
    cx.globalAlpha = S.alpha; cx.lineJoin = 'round'; cx.lineCap = 'round';
    stroke(pts,n); cx.strokeStyle='rgba(255,240,77,.10)'; cx.lineWidth=36; cx.stroke();
    cx.strokeStyle='rgba(255,240,77,.20)'; cx.lineWidth=22; cx.stroke();
    cx.strokeStyle='#12091f'; cx.lineWidth=15; cx.stroke();
    cx.strokeStyle='#fff04d'; cx.lineWidth=8; cx.stroke();
    cx.strokeStyle='#ffffff'; cx.lineWidth=2.6; cx.stroke();
    if (anim){
      cx.strokeStyle='rgba(255,240,77,.85)'; cx.lineWidth=2.5;
      branches.forEach(function(b){ if (b.k >= n-1) return; var x=pts[b.k][0], y=pts[b.k][1]; cx.beginPath(); cx.moveTo(x,y);
        b.segs.forEach(function(s){ x += L.nx*s[0] + L.dx*s[1]; y += L.ny*s[0] + L.dy*s[1]; cx.lineTo(x,y); }); cx.stroke(); });
    }
    cx.globalAlpha = 1;
    return pts;
  }

  /* ---------- sparks ---------- */
  var sparks = [], MAXS = 120, spawnAcc = 0, scrollV = 0, ptrSpeed = 0, burstReq = 0;
  for (var si=0; si<MAXS; si++) sparks.push({on:false});
  function spawn(pts, L){
    for (var i=0;i<MAXS;i++){ var s = sparks[i]; if (s.on) continue;
      var k = Math.random()*(pts.length-1), a = pts[k|0], b = pts[(k|0)+1], f = k-(k|0);
      var side = Math.random()<.5?-1:1, sp = 180 + Math.random()*520, j = (Math.random()-.5)*1.2;
      s.on = true; s.x = a[0]+(b[0]-a[0])*f; s.y = a[1]+(b[1]-a[1])*f;
      s.vx = (L.nx*side + L.dx*j)*sp; s.vy = (L.ny*side + L.dy*j)*sp - 160*Math.random();
      s.life = s.max = .5 + Math.random()*.4; s.w = 1.4 + Math.random()*2.2; return true; }
    return false;
  }
  function drawSparks(dt){
    cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round';
    var drag = Math.pow(.96, dt*60);
    for (var i=0;i<MAXS;i++){ var s = sparks[i]; if (!s.on) continue;
      s.life -= dt; if (s.life <= 0 || s.y > H+40){ s.on = false; continue; }
      s.vx *= drag; s.vy = s.vy*drag + 900*dt; s.x += s.vx*dt; s.y += s.vy*dt;
      var a = s.life/s.max; cx.globalAlpha = a;
      cx.strokeStyle = a > .55 ? '#ffffff' : '#fff04d'; cx.lineWidth = s.w;
      cx.beginPath(); cx.moveTo(s.x - s.vx*.035, s.y - s.vy*.035); cx.lineTo(s.x, s.y); cx.stroke();
    }
    cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
  }
  /* ---------- FIGHT! speed-line burst ---------- */
  var burstLines = [];
  for (var bi=0; bi<6; bi++) burstLines.push({a: bi/6*Math.PI*2 + .3, w: 10 + (bi%3)*6});
  function drawFightBurst(now){
    if (S.fight < 0) return; var t = (now - S.fight)/420; if (t >= 1){ S.fight = -1; return; }
    var ox = W/2, oy = H*(mobile ? .61 : .44), R = Math.hypot(W,H)*.6, e = 1-Math.pow(1-t,3);
    cx.lineCap = 'butt';
    burstLines.forEach(function(L){ var r0 = R*(.12 + .5*e), r1 = r0 + R*.32*(1-t);
      cx.beginPath(); cx.moveTo(ox+Math.cos(L.a)*r0, oy+Math.sin(L.a)*r0); cx.lineTo(ox+Math.cos(L.a)*r1, oy+Math.sin(L.a)*r1);
      cx.globalAlpha = 1-t; cx.strokeStyle = '#12091f'; cx.lineWidth = L.w*(1-t*.4)+6; cx.stroke(); cx.strokeStyle = '#ffffff'; cx.lineWidth = L.w*(1-t*.4); cx.stroke(); });
    cx.globalAlpha = 1;
  }

  /* ---------- sprite fighters (24 frames captured from the live hero select, ping-pong at 12 fps) ---------- */
  var FW = 250, FH = 283, FN = 24, FC = 6;
  var sprites = $$('.fighter canvas.sprite').map(function(c){ return {c:c, g:c.getContext('2d'), img:null, ok:false, last:-1}; });
  function sizeSprite(s){ var w = s.c.offsetWidth, h = s.c.offsetHeight; if (!w) return; s.c.width = Math.round(w*DPR); s.c.height = Math.round(h*DPR); s.last = -1; }
  function drawSprite(s, idx){
    if (!s.ok || idx === s.last) return; s.last = idx;
    var c = s.c, cw = c.width, ch = c.height, k = cw/FW*1.04, dw = FW*k, dh = FH*k;
    s.g.clearRect(0,0,cw,ch);
    s.g.drawImage(s.img, (idx%FC)*FW, ((idx/FC)|0)*FH, FW, FH, (cw-dw)/2, ch-dh+ch*.03, dw, dh);
  }
  sprites.forEach(function(s){
    var img = new Image(); img.decoding = 'async';
    img.onload = function(){ s.img = img; s.ok = true; sizeSprite(s); drawSprite(s, 0); s.c.closest('.frame').classList.add('live'); };
    img.src = s.c.getAttribute('data-src');
  });

  /* ---------- light follows the pointer ---------- */
  var light = {x:.5, y:.5, tx:.5, ty:.5};
  function applyLight(){
    var dx = light.tx-light.x, dy = light.ty-light.y;
    if (Math.abs(dx) < .0005 && Math.abs(dy) < .0005) return;
    light.x += dx*.08; light.y += dy*.08;
    hero.style.setProperty('--lx', (10 + light.x*40).toFixed(1)+'%'); hero.style.setProperty('--ly', (25 + light.y*50).toFixed(1)+'%');
    hero.style.setProperty('--rx', (50 + light.x*40).toFixed(1)+'%'); hero.style.setProperty('--ry', (25 + light.y*50).toFixed(1)+'%');
  }

  var lastT = performance.now();
  function frameDraw(now, dt){
    if (!W) return;
    var L = line(); applyClip(L);
    cx.setTransform(DPR,0,0,DPR,0,0); cx.clearRect(0,0,W,H);
    var pts = drawSeam(L);
    if (anim && pts && S.crack >= 1 && S.alpha > .3){
      spawnAcc += dt*(26 + Math.min(220, Math.abs(scrollV)*.12) + Math.min(160, ptrSpeed*.12));
      while (spawnAcc >= 1){ spawnAcc--; spawn(pts, L); }
      while (burstReq > 0){ burstReq--; spawn(pts, L); }
    }
    if (anim) drawSparks(dt);
    drawFightBurst(now);
    var idx = 0;
    if (anim){ var f = Math.floor(now/1000*12) % (FN*2-2); idx = f < FN ? f : (FN*2-2) - f; }
    sprites.forEach(function(s){ drawSprite(s, idx); });
  }
  if (anim){
    io(function(en){ heroVisible = en[0].isIntersecting; hero.classList.toggle('off', !heroVisible); }).observe(hero);
    (function loop(now){
      raf(loop);
      var dt = Math.min(.05, (now - lastT)/1000); lastT = now;
      ptrSpeed *= .9; scrollV *= .9;
      if (!heroVisible) return;
      S.tug += (S.tugT - S.tug)*.08;
      applyLight();
      frameDraw(now, dt);
    })(lastT);
  }
  size();
  onWin('resize', function(){ size(); });

  /* ---------- shake helper ---------- */
  function shake(el, amp, dur){
    if (!anim) return;
    var tl = G.timeline(); var n = Math.round((dur||.35)/.045);
    for (var i=0;i<n;i++){ var f = 1 - i/n; tl.to(el,{x:(Math.random()-.5)*2*amp*f, y:(Math.random()-.5)*2*amp*f, rotation:(Math.random()-.5)*amp*.08*f, duration:.045, ease:'none'}); }
    tl.to(el,{x:0,y:0,rotation:0,duration:.08,ease:'power2.out'});
    return tl;
  }

  /* ---------- speed lines burst (select slots) ---------- */
  function burst(canvas, color){
    if (RM) return;
    var r = canvas.getBoundingClientRect(), d = Math.min(window.devicePixelRatio||1,2);
    canvas.width = r.width*d; canvas.height = r.height*d;
    var c = canvas.getContext('2d'); c.setTransform(d,0,0,d,0,0);
    var w=r.width,h=r.height,cxp=w/2,cyp=h*.42,R=Math.hypot(w,h)/1.6, lines=[];
    for (var i=0;i<46;i++) lines.push({a:Math.random()*Math.PI*2, w:1+Math.random()*5, s:.55+Math.random()*.45, l:.18+Math.random()*.3});
    var t0 = performance.now(), D = 420;
    (function tick(now){
      var t = Math.min(1,(now-t0)/D), e = 1-Math.pow(1-t,3);
      c.clearRect(0,0,w,h);
      lines.forEach(function(L){
        var r0 = R*(.25 + e*.75*L.s), r1 = r0 + R*L.l*(1-t);
        c.beginPath(); c.moveTo(cxp+Math.cos(L.a)*r0, cyp+Math.sin(L.a)*r0); c.lineTo(cxp+Math.cos(L.a)*r1, cyp+Math.sin(L.a)*r1);
        c.strokeStyle = color; c.globalAlpha = (1-t); c.lineWidth = L.w*(1-t*.5); c.stroke();
      });
      if (t < .5){
        c.globalAlpha = 1 - t*2; c.fillStyle = '#fff04d'; c.beginPath();
        var sp = 10, rr = 40 + e*90;
        for (var k=0;k<sp*2;k++){ var ang = k/(sp*2)*Math.PI*2, rad = k%2 ? rr*.35 : rr; c.lineTo(cxp+Math.cos(ang)*rad, cyp+Math.sin(ang)*rad); }
        c.closePath(); c.fill();
      }
      c.globalAlpha = 1;
      if (t < 1) raf(tick); else c.clearRect(0,0,w,h);
    })(t0);
  }

  function chars(el){
    /* one span per letter; a combining mark stays with its letter (Avie\u0307te\u0307 is written decomposed for Fredoka) */
    var t = el.textContent, parts = t.match(/[^\u0300-\u036f][\u0300-\u036f]*/g) || []; el.textContent = '';
    for (var i=0;i<parts.length;i++){ var s=document.createElement('span'); s.className='ch'; s.textContent = parts[i]; el.appendChild(s); }
    return $$('.ch', el);
  }

  /* =========================================================
     HERO SELECT
     ========================================================= */
  var slots = {cat:$('#slot-cat'), dog:$('#slot-dog')}, current = {};
  var stage = $('#stage'), stageVs = $('.stage-vs span'), tiles = $$('.tile'), lis = tiles.map(function(t){ return t.parentNode; });
  tiles.forEach(function(t){ if (t.getAttribute('aria-pressed') === 'true') current[t.dataset.side] = t.dataset.name; });
  var bio = $('.pick-bio');
  function setBio(tile){
    if (!bio) return;
    var d = tile.dataset;
    $('b', bio).textContent = d.name;
    $('.meta', bio).textContent = ' · ' + d.role + (d.breed ? ' · ' + d.breed : '');
    $('.txt', bio).textContent = d.blurb;
  }
  function slam(tile){
    var side = tile.dataset.side, name = tile.dataset.name, role = tile.dataset.role, portrait = tile.dataset.portrait;
    tiles.forEach(function(t){ if (t.dataset.side === side) t.setAttribute('aria-pressed', t===tile ? 'true' : 'false'); });
    setBio(tile);
    if (current[side] === name) return false;
    current[side] = name;
    var slot = slots[side], img = $('.pic img', slot);
    slot.classList.toggle('is-sil', !portrait);
    if (portrait) img.src = portrait;
    img.alt = name.normalize('NFC') + ', ' + side + ' ' + role.toLowerCase();
    var nameEl = $('.name .ital', slot); nameEl.textContent = name; $('.role', slot).textContent = role;
    $('.name', slot).classList.toggle('long', name.normalize('NFC').length > 9);
    $('.breed', slot).textContent = tile.dataset.breed || '';
    $('.blurb', slot).textContent = tile.dataset.blurb || '';
    if (!anim) return true;
    var art = portrait ? img : $('.sil', slot);
    var dir = side === 'cat' ? -1 : 1, cs = chars(nameEl);
    G.killTweensOf([art, cs]);
    slot.classList.add('f1');
    later(function(){ slot.classList.remove('f1'); slot.classList.add('f2'); }, 55);
    later(function(){ slot.classList.remove('f2'); }, 110);
    G.fromTo(art, {xPercent:dir*70, scale:1.45, skewX:dir*-14, opacity:.4}, {xPercent:0, scale:1, skewX:0, opacity:1, duration:.42, ease:'expo.out'});
    G.fromTo(cs, {yPercent:120, rotation:dir*-14, opacity:0}, {yPercent:0, rotation:0, opacity:1, duration:.5, ease:'back.out(2.6)', stagger:.025, delay:.06});
    G.fromTo([$('.role', slot), $('.breed', slot), $('.blurb', slot)], {x:dir*-30, opacity:0}, {x:0, opacity:1, duration:.4, ease:'power3.out', delay:.12, stagger:.04});
    G.fromTo(stageVs, {scale:1.4, rotation:dir*14}, {scale:1, rotation:0, duration:.5, ease:'elastic.out(1,.4)'});
    var shownLis = lis.filter(function(l){ return l.offsetParent !== null; }), i = shownLis.indexOf(tile.parentNode);
    G.fromTo(shownLis.filter(function(l,j){return j!==i}), {scale:1}, {scale:.96, duration:.1, ease:'power2.out', yoyo:true, repeat:1, stagger:{grid:'auto', from:Math.max(0,i), amount:.22}});
    burst($('.lines', slot), side === 'cat' ? '#ffffff' : '#fff04d');
    shake(stage, 9, .3);
    return true;
  }
  /* CATS / DOGS switch: one side's tiles at a time (the game's pick screen has the same switch) */
  var grid = $('.grid'), switches = $$('.side-switch button');
  function showSide(side){
    if (grid.dataset.show === side) return;
    grid.dataset.show = side;
    switches.forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.show === side ? 'true' : 'false'); });
    var pressed = tiles.filter(function(t){ return t.dataset.side === side && t.getAttribute('aria-pressed') === 'true'; })[0];
    if (pressed) setBio(pressed);
    if (!anim) return;
    var vis = tiles.filter(function(t){ return t.dataset.side === side; });
    G.fromTo(vis, {y:40, rotation:function(i){return (i%2?1:-1)*12}, opacity:0, scale:.6}, {y:0, rotation:0, opacity:1, scale:1, duration:.45, ease:'back.out(1.8)', stagger:{each:.035, from:'random'}, clearProps:'transform,opacity'});
    G.fromTo(stageVs, {scale:1.4, rotation:side === 'cat' ? -14 : 14}, {scale:1, rotation:0, duration:.5, ease:'elastic.out(1,.4)'});
  }
  switches.forEach(function(b){ b.addEventListener('click', function(){ showSide(b.dataset.show); }); });
  var lockT = {};
  function lock(tile){
    var side = tile.dataset.side, slot = slots[side], rd = $('.ready', slot);
    if (!anim){ rd.style.opacity = 1; clearTimeout(lockT[side]); lockT[side] = later(function(){ rd.style.opacity = 0; }, 1400); return; }
    G.killTweensOf(rd);
    G.fromTo($('.cur b', tile), {scale:2, rotation:-12}, {scale:1, rotation:0, duration:.4, ease:'back.out(4)'});
    G.timeline().set(rd, {opacity:1, clipPath:'inset(0 100% 0 0)'})
      .to(rd, {clipPath:'inset(0 0% 0 0)', duration:.18, ease:'expo.out'})
      .fromTo(rd, {scale:1.25}, {scale:1, duration:.3, ease:'back.out(3)', immediateRender:false}, '<')
      .to(rd, {clipPath:'inset(0 0 0 100%)', duration:.25, ease:'expo.in'}, '+=1.1');
    G.globalTimeline.timeScale(.05);
    later(function(){ G.globalTimeline.timeScale(1); }, 120);
  }
  tiles.forEach(function(t){
    t.addEventListener('mouseenter', function(){ slam(t); });
    t.addEventListener('focus', function(){ slam(t); });
    t.addEventListener('click', function(){ slam(t); lock(t); });
  });
  if (anim && FINE){
    lis.forEach(function(li){
      var qx = G.quickTo(li, 'x', {duration:.4, ease:'power3.out'}), qy = G.quickTo(li, 'y', {duration:.4, ease:'power3.out'});
      li.addEventListener('pointermove', function(e){ var r = li.getBoundingClientRect(); qx(clamp((e.clientX - r.left - r.width/2)*.18, -6, 6)); qy(clamp((e.clientY - r.top - r.height/2)*.18, -6, 6)); });
      li.addEventListener('pointerleave', function(){ qx(0); qy(0); });
    });
    Object.keys(slots).forEach(function(k){
      var s = slots[k]; G.set(s, {transformPerspective:800});
      var ry = G.quickTo(s, 'rotationY', {duration:.5, ease:'power3.out'}), rx = G.quickTo(s, 'rotationX', {duration:.5, ease:'power3.out'});
      s.addEventListener('pointermove', function(e){ var r = s.getBoundingClientRect(), px = (e.clientX-r.left)/r.width, py = (e.clientY-r.top)/r.height;
        ry((px-.5)*16); rx(-(py-.5)*10); s.style.setProperty('--gx', (px*100).toFixed(1)+'%'); });
      s.addEventListener('pointerleave', function(){ ry(0); rx(0); s.style.setProperty('--gx', '50%'); });
    });
  }

  /* =========================================================
     CONTINUE countdown
     ========================================================= */
  (function(){
    var box = $('.count'), n = $('.count .n'), prg = $('.count .prg'), sec = $('.cont'), flash = $('.cflash'), cta = $('#cont-cta').parentNode, v = 9, timer = null;
    if (!anim){ box.classList.add('ended'); return; }
    function schedule(ms){ clearTimeout(timer); timer = later(tick, ms); }
    function tick(){
      if (box.classList.contains('ended')){ box.classList.remove('ended'); v = 9; n.textContent = '9'; G.to(prg, {attr:{'stroke-dashoffset':0}, duration:.5, ease:'power2.out'}); G.killTweensOf(cta, 'scale'); G.to(cta, {scale:1, duration:.3}); schedule(1000); return; }
      v -= 1;
      G.timeline()
        .to(n, {scale:.85, duration:.1, ease:'power2.in'})
        .add(function(){ n.textContent = String(v); })
        .fromTo(n, {scale:2.4, rotation:-10}, {scale:1, rotation:0, duration:.45, ease:SLAM, immediateRender:false})
        .fromTo(flash, {opacity:.15}, {opacity:0, duration:.22, ease:'power2.out', immediateRender:false}, '<')
        .fromTo(prg, {attr:{'stroke-width':6}}, {attr:{'stroke-width':11}, duration:.12, ease:'power2.out', yoyo:true, repeat:1, immediateRender:false}, '<');
      G.to(prg, {attr:{'stroke-dashoffset':(9-v)/9}, duration:.8, ease:'power2.inOut'});
      if (v === 0){
        shake(n, 12, .35);
        G.delayedCall(.45, function(){ box.classList.add('ended'); G.fromTo(cta, {scale:1}, {scale:1.06, duration:.5, ease:'sine.inOut', yoyo:true, repeat:3}); });
        schedule(2600);
      } else schedule(1000);
    }
    io(function(en){
      if (en[0].isIntersecting){ if (!timer) schedule(900); }
      else { clearTimeout(timer); timer = null; }
    }).observe(sec);
  })();

  /* =========================================================
     no GSAP or reduced motion: static, finished page
     ========================================================= */
  if (!anim){ S.crack = 1; frameDraw(performance.now(), 0); return; }

  /* =========================================================
     INTRO SEQUENCE
     ========================================================= */
  var shakeEl = $('.hero-shake');
  var logoCh = $$('.logo .ch');
  var frames = $$('.fighter .frame'), tags = $$('.fighter .tag');
  G.set('.side.cat', {xPercent:-100});
  G.set('.side.dog', {xPercent:100});
  G.set(frames[0], {xPercent:-150, rotation:-12});
  G.set(frames[1], {xPercent:150, rotation:12});
  G.set(frames, {transformPerspective:900, transformOrigin:'50% 100%'});
  G.set(tags, {scale:0, opacity:0});
  G.set('.vs-word', {scale:5, opacity:0});
  G.set('.bar i', {scaleX:0});
  G.set('.bar b, .timer', {opacity:0, y:-10});
  G.set(logoCh, {yPercent:-180, rotationX:-90, opacity:0, transformPerspective:600});
  G.set('.sub, .hero-copy .ctas, .scroll-cue', {opacity:0, y:24});
  root.classList.remove('js-intro');

  var announcer = $('.announcer');
  function scramble(el, final, dur){
    var o = {p:0};
    return G.to(o, {p:1, duration:dur, ease:'none', onUpdate:function(){
      var k = Math.floor(o.p*final.length), s = final.slice(0,k);
      for (var i=k;i<final.length;i++) s += SCRAMBLE_POOL[(Math.random()*SCRAMBLE_POOL.length)|0];
      el.textContent = s; }, onComplete:function(){ el.textContent = final; }});
  }
  var cr = {c:0};
  var tl = G.timeline({delay:.1});
  tl.to('.side.cat', {xPercent:0, duration:.55, ease:'power4.out'}, 0)
    .to('.side.dog', {xPercent:0, duration:.55, ease:'power4.out'}, .06)
    .to(cr, {c:1, duration:.32, ease:'power2.in', onUpdate:function(){ S.crack = cr.c; }}, .42)
    .add(function(){ regen(); burstReq += 40; }, .74)
    .to('.flash', {opacity:.85, duration:.04, ease:'none'}, .74)
    .to('.flash', {opacity:0, duration:.35, ease:'power2.out'}, .78)
    .add(function(){ shake(shakeEl, 14, .35); }, .74)
    // fighters: wind up backwards, then slam in, squash on contact
    .to(frames[0], {xPercent:-156, duration:.12, ease:WINDUP}, .84)
    .to(frames[1], {xPercent:156, duration:.12, ease:WINDUP}, .9)
    .to(frames[0], {xPercent:0, rotation:0, duration:.45, ease:SLAM}, .96)
    .to(frames[1], {xPercent:0, rotation:0, duration:.45, ease:SLAM}, 1.02)
    .to(frames[0], {scaleX:1.08, scaleY:.92, duration:.08, ease:'power2.out'}, 1.1)
    .to(frames[1], {scaleX:1.08, scaleY:.92, duration:.08, ease:'power2.out'}, 1.16)
    .to(frames[0], {scaleX:1, scaleY:1, duration:.6, ease:'elastic.out(1,.35)'}, 1.18)
    .to(frames[1], {scaleX:1, scaleY:1, duration:.6, ease:'elastic.out(1,.35)'}, 1.24)
    .to(tags[0], {scale:1, opacity:1, duration:.45, ease:'back.out(3)'}, 1.17)
    .to(tags[1], {scale:1, opacity:1, duration:.45, ease:'back.out(3)'}, 1.23)
    // VS drops through the camera
    .to('.vs-word', {scale:.85, opacity:1, duration:.38, ease:'expo.in'}, 1.2)
    .add(function(){ shake(shakeEl, 22, .45); burstReq += 30; }, 1.58)
    .to('.flash', {opacity:.6, duration:.03, ease:'none'}, 1.58)
    .to('.flash', {opacity:0, duration:.3, ease:'power2.out'}, 1.61)
    .fromTo('.vs-ghost.p', {x:-8, opacity:.95}, {x:0, opacity:0, duration:.25, ease:'power2.out', immediateRender:false}, 1.58)
    .fromTo('.vs-ghost.b', {x:8, opacity:.95}, {x:0, opacity:0, duration:.25, ease:'power2.out', immediateRender:false}, 1.58)
    .fromTo('.vs-ring', {scale:.3, opacity:1}, {scale:1.6, opacity:0, duration:.6, ease:'expo.out', immediateRender:false}, 1.58)
    .to('.vs-word', {scale:1, duration:.7, ease:'elastic.out(1.2,.3)'}, 1.58)
    .to('.bar i', {scaleX:1, duration:.7, ease:'power3.out', stagger:.08}, 1.65)
    .to('.bar b, .timer', {opacity:1, y:0, duration:.4, ease:'back.out(2)', stagger:.06}, 1.7)
    // FIGHT!
    .to('.vs-word', {opacity:0, scale:.9, duration:.12}, 2.0)
    .add(function(){ S.fight = performance.now(); scramble(announcer, 'FIGHT!', .26); }, 2.02)
    .fromTo(announcer, {scale:3, opacity:0, rotation:-8}, {scale:1, opacity:1, rotation:-4, duration:.3, ease:'expo.out', immediateRender:false}, 2.02)
    .to(announcer, {scale:1.4, opacity:0, duration:.3, ease:'power2.in'}, 2.42)
    // logo assembles only after FIGHT! has left
    .to(logoCh, {keyframes:[{yPercent:0, rotationX:0, opacity:1, duration:.45, ease:'back.out(3)'}, {scaleY:.8, scaleX:1.12, duration:.04, ease:'power1.out'}, {scaleY:1, scaleX:1, duration:.3, ease:'elastic.out(1,.4)'}],
        stagger:{each:.03, from:'edges'}}, 2.55)
    .to('.vs-word', {opacity:1, scale:1, duration:.45, ease:'back.out(2.5)'}, 3.05)
    .to('.sub, .hero-copy .ctas, .scroll-cue', {opacity:1, y:0, duration:.6, ease:'power3.out', stagger:.08}, 2.85);

  /* idle life */
  var puppets = $$('.fighter .puppet');
  tl.add(function(){
    S.ready = true;
    G.to('.vs-word', {scale:1.04, duration:.9, ease:'sine.inOut', yoyo:true, repeat:-1});
    puppets.forEach(function(p,i){ G.to(p, {scaleY:1.025, scaleX:.99, duration:1.8, ease:'sine.inOut', yoyo:true, repeat:-1, delay:i*.5}); });
    (function thunder(){
      G.delayedCall(3 + Math.random()*3, function(){
        if (dead) return;
        if (heroVisible && window.scrollY < 200){ G.fromTo('.flash',{opacity:.35},{opacity:0,duration:.4,ease:'power2.out'}); shake(shakeEl, 6, .25); regen(); burstReq += 60; }
        thunder();
      });
    })();
  });

  /* pointer: depth parallax + tug-of-war + tilt */
  var depth = [['.side .tone',.2],['.side .bigword',.5],['.fighter',1],['.vs',1.4],['.hud',-.3]].map(function(d){
    return $$(d[0]).map(function(el){ return {k:d[1], x:G.quickTo(el,'x',{duration:.9, ease:'power3.out'}), y:G.quickTo(el,'y',{duration:.9, ease:'power3.out'})}; });
  }).reduce(function(a,b){return a.concat(b)},[]);
  var tilt = frames.map(function(f){ return {ry:G.quickTo(f,'rotationY',{duration:.6, ease:'power3.out'}), sk:G.quickTo(f,'skewX',{duration:.6, ease:'power3.out'})}; });
  var lastPX = 0, lastPY = 0;
  if (FINE){
    hero.addEventListener('pointermove', function(e){
      var r = hero.getBoundingClientRect(), px = (e.clientX - r.left)/r.width - .5, py = (e.clientY - r.top)/r.height - .5;
      S.tugT = -px*W*.09; light.tx = px+.5; light.ty = py+.5;
      ptrSpeed += Math.hypot(e.clientX-lastPX, e.clientY-lastPY); lastPX = e.clientX; lastPY = e.clientY;
      depth.forEach(function(d){ d.x(px*d.k*44); d.y(py*d.k*26); });
      if (S.ready) tilt.forEach(function(t){ t.ry(px*12); t.sk(-6 - px*8); });
    });
    hero.addEventListener('pointerleave', function(){ S.tugT = 0; light.tx = .5; light.ty = .5; depth.forEach(function(d){ d.x(0); d.y(0); }); tilt.forEach(function(t){ t.ry(0); t.sk(-6); }); });
  }
  hero.addEventListener('pointerdown', function(e){
    if (e.target.closest('a')) return;
    G.fromTo('.flash',{opacity:.5},{opacity:0,duration:.35,ease:'power2.out'}); shake(shakeEl, 16, .35); regen(); burstReq += 60;
    G.fromTo('.vs-word',{scale:1.3},{scale:1,duration:.6,ease:'elastic.out(1,.35)', overwrite:'auto'});
  });

  /* =========================================================
     CURSOR + BUTTONS
     ========================================================= */
  if (FINE){
    root.classList.add('has-cursor');
    var cur = $('.cursor'), rf = $('.cursor .rfill'), cqx = G.quickTo(cur,'x',{duration:.16, ease:'power3.out'}), cqy = G.quickTo(cur,'y',{duration:.16, ease:'power3.out'});
    var shown = false, charging = null;
    onWin('pointermove', function(e){ if (e.pointerType !== 'mouse') return; cqx(e.clientX); cqy(e.clientY); if (!shown){ shown = true; G.set(cur,{x:e.clientX,y:e.clientY}); G.to(cur,{opacity:1,duration:.2}); } }, {passive:true});
    onDoc('mouseleave', function(){ shown = false; G.to(cur,{opacity:0,duration:.2}); });
    onDoc('pointerover', function(e){ var hot = e.target.closest('a,button'); G.to(cur, {scale: hot ? 1.35 : 1, duration:.3, ease:'back.out(3)', overwrite:'auto'}); });
    onWin('pointerdown', function(e){ if (!e.target.closest('.btn,.tile')) return; charging = G.fromTo(rf, {attr:{'stroke-dashoffset':1}}, {attr:{'stroke-dashoffset':0}, duration:.4, ease:'power1.in'}); });
    onWin('pointerup', function(){ if (charging){ charging.kill(); charging = null; G.to(rf, {attr:{'stroke-dashoffset':1}, duration:.25, ease:'power2.out'}); } });
  }
  $$('.mag').forEach(function(m){
    var qx = G.quickTo(m,'x',{duration:.35, ease:'power3.out'}), qy = G.quickTo(m,'y',{duration:.35, ease:'power3.out'});
    if (FINE){
      m.addEventListener('pointermove', function(e){ var r = m.getBoundingClientRect(); qx(clamp((e.clientX-r.left-r.width/2)*.12,-10,10)); qy(clamp((e.clientY-r.top-r.height/2)*.25,-10,10)); });
      m.addEventListener('pointerleave', function(){ G.to(m, {x:0, y:0, duration:.8, ease:'elastic.out(1,.5)', overwrite:'auto'}); });
    }
    m.addEventListener('pointerdown', function(){ G.to(m, {scaleY:.92, scaleX:1.04, duration:.06, ease:'power2.out', overwrite:'auto'}); });
    var rel = function(){ G.to(m, {scaleY:1, scaleX:1, duration:.5, ease:'elastic.out(1,.4)', overwrite:'auto'}); };
    m.addEventListener('pointerup', rel); m.addEventListener('pointercancel', rel);
  });

  /* =========================================================
     SCROLL STORY
     ========================================================= */
  if (!ST) return;

  /* hero exit: seam swings flat, the halves fly apart, VS goes through the camera, a yellow slash wipes into the select */
  var slashP = $('.slash path');
  function slashEdge(){ var e = innerWidth*.045/innerHeight*100, top = 40; return 'M-5,'+(top-.4).toFixed(2)+' L105,'+(top+e*1.1-.4).toFixed(2)+' L105,'+(top+e*1.1+.9).toFixed(2)+' L-5,'+(top+.9).toFixed(2)+' Z'; }
  var SL = {thin:'M-5,61 L105,39 L105,40.2 L-5,62.2 Z', full:'M-5,-6 L105,-6 L105,106 L-5,106 Z'};
  G.set(slashP, {attr:{d:SL.thin}, opacity:0});
  var morph = function(d, dur, ease){ return has.MorphSVGPlugin ? {morphSVG:d, duration:dur, ease:ease} : {attr:{d:d}, duration:dur, ease:ease}; };
  var exitTl = G.timeline({defaults:{ease:'none'}, scrollTrigger:{trigger:hero, start:'top top', end:'+=60%', scrub:.8, pin:true, pinSpacing:false, anticipatePin:1, invalidateOnRefresh:true,
    onUpdate:function(s){ scrollV = s.getVelocity(); }}});
  exitTl.to('.scroll-cue', {opacity:0, duration:.04}, 0)
    .to('.hero-copy', {yPercent:-40, opacity:0, duration:.2, ease:'power2.in'}, 0)
    .to(S, {rot:1, duration:.4, ease:'power2.inOut'}, 0)
    .to('.hud', {yPercent:-260, opacity:0, duration:.25, ease:'power2.in'}, .05)
    .to('.side.cat', {xPercent:-34, yPercent:-62, duration:.62, ease:'power2.inOut'}, .28)
    .to('.side.dog', {xPercent:34, yPercent:62, duration:.62, ease:'power2.inOut'}, .28)
    .to('.fighter.cat', {xPercent:-260, yPercent:-60, rotation:-14, duration:.4, ease:'power2.in'}, .25)
    .to('.fighter.dog', {xPercent:260, yPercent:60, rotation:14, duration:.4, ease:'power2.in'}, .25)
    .to('.vs', {scale:9, duration:.45, ease:'power3.in'}, .28)
    .to('.vs', {opacity:0, duration:.12}, .6)
    .to(S, {alpha:0, duration:.1}, .6)
    .set(slashP, {opacity:1}, .42)
    .to(slashP, morph(SL.full, .2, 'power3.in'), .42)
    .to(slashP, morph(slashEdge, .3, 'power3.out'), .66)
    .to(slashP, {opacity:0, duration:.04}, .96);

  /* section headers: words slam from alternating sides */
  $$('.h2').forEach(function(h){
    var ws = $$('.w', h), targets = ws.length ? ws : [h];
    G.from(targets, {x:function(i){return i%2? 120 : -120}, opacity:0, skewX:function(i){return i%2? -30 : 30}, duration:.7, ease:'expo.out', stagger:.08,
      scrollTrigger:{trigger:h, start:'top 85%', once:true}});
  });
  G.from('.select-head .kicker, .select-head .lede', {y:20, opacity:0, duration:.6, ease:'power3.out', stagger:.15, scrollTrigger:{trigger:'.select-head', start:'top 80%', once:true}});

  /* grid tiles deal in like cards; slots slam from the sides */
  G.from(tiles, {y:60, rotation:function(i){return (i%2?1:-1)*14}, opacity:0, scale:.6, duration:.6, ease:'back.out(1.8)', stagger:{each:.045, from:'random'}, clearProps:'transform,opacity',
    scrollTrigger:{trigger:'.grid', start:'top 85%', once:true}});
  G.from('#slot-cat', {xPercent:-60, rotation:-14, opacity:0, duration:.8, ease:'expo.out', scrollTrigger:{trigger:'#stage', start:'top 80%', once:true}});
  G.from('#slot-dog', {xPercent:60, rotation:14, opacity:0, duration:.8, ease:'expo.out', scrollTrigger:{trigger:'#stage', start:'top 80%', once:true}});
  G.from('.stage-vs', {scale:0, rotation:-90, duration:.6, ease:'back.out(3)', delay:.4, scrollTrigger:{trigger:'#stage', start:'top 80%', once:true}});
  G.to('.stage-vs', {y:-5, duration:1.2, ease:'sine.inOut', yoyo:true, repeat:-1});
  $$('.slot .pic').forEach(function(p,i){ G.to(p, {y:-6, duration:1.9, ease:'sine.inOut', yoyo:true, repeat:-1, delay:i*.6}); });

  /* halftone dot transitions */
  $$('.dotband').forEach(function(b){
    var rows = $$('i', b);
    rows.forEach(function(r){ r.style.setProperty('--r','0px'); });
    ScrollTrigger.create({trigger:b, start:'top bottom', end:'bottom 45%', scrub:true, onUpdate:function(s){
      var p = s.progress;
      rows.forEach(function(r,i){ r.style.setProperty('--r', (10.5*clamp(p*1.6 - (3-i)*.2, 0, 1)).toFixed(2)+'px'); });
    }});
  });

  /* =========================================================
     ROUNDS
     ========================================================= */
  var rs = $$('.round');
  var split = has.SplitText ? function(el){ return SplitText.create(el, {type:'words', wordsClass:'w'}).words; } : function(el){ return [el]; };
  var h3w = rs.map(function(r){ return split($('h3 .ital', r)); });
  /* overlays: ambient loops that play while their round is on screen */
  var amb = [];
  (function(){
    var o1 = $('.ov1'), lane = $('.lane', o1), ink = $('.lane-ink', o1), paw = $('.pawm', o1), bases = $$('.base', o1);
    var t1 = G.timeline({paused:true, repeat:-1, repeatDelay:.5});
    t1.fromTo([ink, lane], {drawSVG:'0%'}, {drawSVG:'100%', duration:1.2, ease:'power2.inOut'}, 0)
      .fromTo(paw, {opacity:0, scale:.4}, {opacity:1, scale:1, duration:.3, ease:'back.out(3)'}, .2)
      .to(paw, {motionPath:{path:lane, align:lane, alignOrigin:[.5,.5], autoRotate:true}, duration:2.2, ease:'power1.inOut'}, .2)
      .fromTo(bases[1], {scale:.6, opacity:1, transformOrigin:'50% 50%'}, {scale:1.8, opacity:0, duration:.6, ease:'expo.out'}, 2.35)
      .to([ink, lane], {drawSVG:'100% 100%', duration:.6, ease:'power2.in'}, 2.6)
      .to(paw, {opacity:0, scale:.4, duration:.25}, 2.7);
    G.to(bases[0], {scale:1.12, transformOrigin:'50% 50%', duration:.8, ease:'sine.inOut', yoyo:true, repeat:-1});
    if (!has.DrawSVGPlugin || !has.MotionPathPlugin){ t1.clear(); }
    amb.push(t1);

    var o2 = $('.ov2'), aim = $('.aim', o2), hold = $('.hold', o2), proj = $('.proj', o2), boom = $('.boom', o2);
    var t2 = G.timeline({paused:true, repeat:-1, repeatDelay:.6});
    t2.set(aim, {scaleX:0, opacity:1, transformOrigin:'0% 50%'}).set(hold, {attr:{'stroke-dashoffset':1}})
      .to(aim, {scaleX:1, duration:.6, ease:'power2.in'}, 0)
      .to(hold, {attr:{'stroke-dashoffset':0}, duration:.6, ease:'power2.in'}, 0)
      .fromTo(aim, {y:0}, {y:1.5, duration:.04, repeat:5, yoyo:true, ease:'none'}, .55)
      .set(proj, {opacity:1, attr:{cx:60}}, .78)
      .to(aim, {opacity:0, duration:.15}, .78)
      .to(hold, {attr:{'stroke-dashoffset':1}, duration:.2}, .78)
      .to(proj, {attr:{cx:400}, duration:.42, ease:'expo.out'}, .78)
      .set(proj, {opacity:0}, 1.08)
      .fromTo(boom, {opacity:1, scale:.3, transformOrigin:'50% 50%'}, {opacity:0, scale:2.2, duration:.5, ease:'expo.out'}, 1.06);
    amb.push(t2);

    var st = $$('.ov3 .star');
    var t3 = G.timeline({paused:true, repeat:-1, repeatDelay:.4});
    t3.fromTo(st, {scale:0, rotation:-40, opacity:1, transformOrigin:'50% 50%'}, {scale:1, rotation:0, duration:.35, ease:'back.out(3)', stagger:.12})
      .to(st, {scale:1.15, duration:.08, yoyo:true, repeat:1, stagger:.12}, '<.3')
      .to(st, {scale:0, opacity:0, duration:.25, ease:'power2.in', stagger:.08}, '+=.7');
    amb.push(t3);

    /* squad (new): the invite link gets a tap, then the six cards deal in, your team first */
    var sq = $('svg.sq'), cards = $$('.card', sq), tapd = $('.tapdot', sq), chip = $('.chip', sq);
    var t5 = G.timeline({paused:true, repeat:-1, repeatDelay:1.2});
    t5.fromTo(tapd, {scale:.3, opacity:1, transformOrigin:'50% 50%'}, {scale:2.2, opacity:0, duration:.6, ease:'expo.out'}, 0)
      .fromTo(chip, {scale:1, transformOrigin:'50% 50%'}, {scale:1.04, duration:.12, ease:'power2.out', yoyo:true, repeat:1}, 0)
      .fromTo(cards, {y:60, opacity:0, rotation:function(i){return (i%2?1:-1)*8}, transformOrigin:'50% 100%'}, {y:0, opacity:1, rotation:0, duration:.45, ease:'back.out(2)', stagger:.12}, .35)
      .to(cards.slice(0,3), {y:-10, duration:.18, ease:'power2.out', yoyo:true, repeat:1, stagger:.06}, '+=.3');
    amb.push(t5);

    var taps = $$('.ov4 .tap');
    var t4 = G.timeline({paused:true, repeat:-1, repeatDelay:.3});
    t4.fromTo(taps, {scale:.2, opacity:1, transformOrigin:'50% 50%'}, {scale:2, opacity:0, duration:.9, ease:'expo.out', stagger:.18});
    amb.push(t4);
  })();
  var curAmb = -1;
  function setAmb(k){ if (k === curAmb) return; curAmb = k; amb.forEach(function(t,i){ if (i===k) t.play(); else t.pause(); }); }
  /* numerals draw in as each round arrives */
  var drawn = [];
  function drawNum(i){ if (drawn[i]) return; drawn[i] = true; G.fromTo($('.num text', rs[i]), {attr:{'stroke-dashoffset':700}}, {attr:{'stroke-dashoffset':0}, duration:.8, ease:'power2.inOut'}); }
  rs.forEach(function(r){ G.set($('.num text', r), {attr:{'stroke-dashoffset':700}}); });

  /* jagged lightning wipe: polygon edge for the round, a yellow band just behind it */
  var JX = [0,4,-3,5,-2,4,-3,3,0], JY = [0,12,25,37,50,62,75,88,100];
  function edge(base){ return JY.map(function(y,i){ return (base + y*.22 + JX[i]).toFixed(2)+'% '+y+'%'; }); }
  function wipeClip(base){ return 'polygon(' + edge(base).join(',') + ',400% 100%,400% 0%)'; }
  function zapClip(base){ var a = edge(base), b = edge(base + 1.8).reverse(); return 'polygon(' + a.concat(b).join(',') + ')'; }

  var mm = G.matchMedia(); holder.mm = mm;
  mm.add('(min-height: 560px)', function(){
    var wrap = $('#rounds'), pips = $$('.pips i');
    wrap.classList.add('pinned');
    var wp = rs.map(function(){ return {b:130}; });
    function paint(i){ var b = wp[i].b; rs[i].style.clipPath = wipeClip(b); var z = $('.zap', rs[i]); if (z) z.style.clipPath = zapClip(b); }
    rs.forEach(function(r,i){ G.set(r,{zIndex:i+1}); if (i) paint(i); });
    var SEG = 1, n = rs.length;
    var t = G.timeline({defaults:{ease:'none'}, scrollTrigger:{trigger:wrap, start:'top top', end:function(){return '+=' + (n-1)*innerHeight*1.15}, scrub:.7, pin:true, anticipatePin:1,
      onToggle:function(s){ lastK = -1; if (s.isActive) drawNum(0); else setAmb(-1); }}});
    rs.forEach(function(r,i){
      var shot = $('.shot', r), kb = $('.kb', shot), at = i ? (i-1)*SEG : 0, segEnd = i < n-1 ? i*SEG + .3 : (n-1)*SEG + .5;
      // Ken Burns across the whole time the round is on screen
      t.fromTo(kb, {scale:1.04, xPercent: i%2 ? 3 : -3}, {scale:1.14, xPercent: i%2 ? -3 : 3, duration:segEnd - at, ease:'none'}, at);
      t.fromTo($('.num', r), {yPercent:0}, {yPercent:-15, duration:segEnd - at, ease:'none'}, at);
      if (!i) return;
      t.to(wp[i], {b:-60, duration:.4, ease:'power3.inOut', onUpdate:function(){ paint(i); }}, at)
       .from(shot, {xPercent: i%2 ? 40 : -40, rotation: i%2 ? 8 : -8, scale:.8, duration:.35, ease:'power3.out'}, at + .12)
       .from($('.banner', r), {scale:3, opacity:0, rotation:-10, duration:.2, ease:'expo.out'}, at + .22)
       .from(h3w[i], {rotationX:-80, yPercent:40, opacity:0, transformPerspective:600, duration:.25, ease:'power4.out', stagger:.05}, at + .25)
       .from($('p', r), {y:24, opacity:0, duration:.2, ease:'power3.out'}, at + .3)
       .from($$('.chips li', r), {scale:0, opacity:0, duration:.18, ease:'back.out(2.5)', stagger:.04}, at + .34)
       .to($('.shot', rs[i-1]), {scale:.9, opacity:.4, duration:.35, ease:'power2.in'}, at);
      if (shot.classList.contains('tall')) t.fromTo(shot, {rotation:90}, {rotation:0, duration:.4, ease:'back.out(1.4)'}, at + .1);
    });
    t.to({}, {duration:.2});
    var lastK = -1;
    t.eventCallback('onUpdate', function(){
      var time = t.time(), k = 0;
      for (var i=1;i<n;i++) if (time >= (i-1)*SEG + .3) k = i;
      if (k === lastK) return; lastK = k;
      pips.forEach(function(p,j){ p.classList.toggle('on', j<=k); });
      setAmb(k); drawNum(k);
    });
    return function(){ wrap.classList.remove('pinned'); rs.forEach(function(r){ G.set(r,{clearProps:'all'}); var z = $('.zap', r); if (z) z.style.clipPath = ''; }); setAmb(-1); curAmb = -1; };
  });
  mm.add('(max-height: 559px)', function(){
    var sts = rs.map(function(r,i){ return ScrollTrigger.create({trigger:r, start:'top 60%', end:'bottom 40%', onToggle:function(s){ if (s.isActive){ setAmb(i); drawNum(i); } }}); });
    return function(){ sts.forEach(function(s){ s.kill(); }); };
  });

  /* round 1 entrance (before the pin starts) */
  var r1 = {trigger:'#rounds', start:'top 70%', once:true};
  G.from('.round[data-r="1"] .shot', {xPercent:-30, rotation:-6, opacity:0, duration:.9, ease:'expo.out', scrollTrigger:r1});
  G.from('.round[data-r="1"] .banner', {scale:3, opacity:0, rotation:-10, duration:.45, ease:'expo.out', delay:.15, scrollTrigger:r1});
  G.from(h3w[0], {rotationX:-80, yPercent:40, opacity:0, transformPerspective:600, duration:.8, ease:'power4.out', stagger:.05, delay:.2, scrollTrigger:r1});
  G.from('.round[data-r="1"] .chips li', {scale:0, opacity:0, duration:.5, ease:'back.out(2.5)', stagger:.04, delay:.45, scrollTrigger:r1});
  ScrollTrigger.create({trigger:'#rounds', start:'top 60%', once:true, onEnter:function(){ drawNum(0); if (curAmb < 0) setAmb(0); }});

  /* =========================================================
     TAPES: flick in, then a velocity-reactive marquee
     ========================================================= */
  var rows = $$('.tape .row'), xs=[0,0], vel = 0, skew = 0;
  G.from('.tape.t1', {xPercent:-70, rotation:-25, duration:1, ease:'expo.out', scrollTrigger:{trigger:'.tapes', start:'top 85%', once:true}});
  G.from('.tape.t2', {xPercent:70, rotation:24, duration:1, ease:'expo.out', delay:.08, scrollTrigger:{trigger:'.tapes', start:'top 85%', once:true}});
  var tapesOn = false;
  ScrollTrigger.create({trigger:'.tapes', start:'top bottom', end:'bottom top', onToggle:function(s){ tapesOn = s.isActive; }, onUpdate:function(s){ vel = s.getVelocity()/220; }});
  addTicker(function(){
    if (!tapesOn) return;
    var v = 1 + Math.min(14, Math.abs(vel)); vel *= .92;
    skew += (clamp(vel*-1.2, -14, 14) - skew)*.15;
    rows.forEach(function(r,i){
      var third = r.scrollWidth/3;
      xs[i] -= (i? -1 : 1) * v * .9;
      if (xs[i] <= -third) xs[i] += third; if (xs[i] > 0) xs[i] -= third;
      r.style.transform = 'translate3d(' + xs[i].toFixed(1) + 'px,0,0) skewX(' + (i ? -skew : skew).toFixed(2) + 'deg)';
    });
  });

  /* =========================================================
     TALE OF THE TAPE
     ========================================================= */
  function scrambleNum(el, end){
    var o = {p:0};
    G.to(o, {p:1, duration:.5, ease:'none', onUpdate:function(){ el.textContent = String((Math.random()*10)|0); }, onComplete:function(){
      G.fromTo(el, {scale:1.5}, {scale:1, duration:.4, ease:'back.out(4)'}); el.textContent = String(end); }});
  }
  $$('.tale-row').forEach(function(r,i){
    var l = $('.l',r), rr = $('.r',r), m = $('.m',r), bars = $$('.tb', r), st = {trigger:r, start:'top 90%', once:true};
    G.set(bars, {scaleX:0});
    G.from(l, {xPercent:-40, opacity:0, duration:.6, ease:'expo.out', delay:i*.06, scrollTrigger:st});
    G.from(rr, {xPercent:40, opacity:0, duration:.6, ease:'expo.out', delay:i*.06, scrollTrigger:st});
    G.from(m, {scaleY:0, duration:.4, ease:'back.out(2)', scrollTrigger:st});
    G.to(bars, {scaleX:1, duration:.9, ease:'expo.out', stagger:.12, delay:.3 + i*.12, scrollTrigger:st});
    $$('.val[data-count]', r).forEach(function(v){ var end = +v.dataset.count; v.textContent = '0';
      ScrollTrigger.create({trigger:r, start:'top 90%', once:true, onEnter:function(){ G.delayedCall(.15 + i*.08, function(){ scrambleNum(v, end); }); }}); });
    G.set(m.firstElementChild, {display:'inline-block', transformPerspective:400});
    r.addEventListener('pointerenter', function(){ G.to(m.firstElementChild, {rotationX:'+=360', duration:.5, ease:'back.out(1.6)'}); G.to(l, {x:-6, duration:.3, ease:'power3.out'}); G.to(rr, {x:6, duration:.3, ease:'power3.out'}); });
    r.addEventListener('pointerleave', function(){ G.to([l, rr], {x:0, duration:.6, ease:'elastic.out(1,.5)'}); });
  });
  G.from('.tale-foot', {opacity:0, y:12, duration:.6, ease:'power3.out', scrollTrigger:{trigger:'.tale-foot', start:'top 95%', once:true}});

  /* =========================================================
     SHELTER: the real title belt
     ========================================================= */
  var beltT = {trigger:'.belt', start:'top 80%', once:true};
  var disc = $('.belt .disc'), splitB = $('.belt .split'), beltIn = $('.belt-in');
  G.from(disc, {rotation:-540, scale:.4, opacity:0, duration:1.6, ease:'expo.out', scrollTrigger:beltT, onComplete:function(){ G.to(disc, {rotation:'+=360', duration:50, ease:'none', repeat:-1}); }});
  G.from('.belt img', {scale:0, rotation:-20, duration:.8, ease:'back.out(2.2)', delay:.35, scrollTrigger:beltT});
  G.timeline({scrollTrigger:beltT, delay:.8})
    .from(splitB, {scale:3, rotation:-30, opacity:0, duration:.32, ease:'expo.in'})
    .to(splitB, {scaleY:.78, scaleX:1.18, duration:.06, ease:'power2.out'})
    .add(function(){ dust(); })
    .to(splitB, {scaleY:1, scaleX:1, duration:.6, ease:'elastic.out(1,.4)'})
    .to(splitB, {rotation:16, duration:2, ease:'sine.inOut', yoyo:true, repeat:-1}, '+=.2');
  function dust(){
    var c = $('.belt canvas'), r = c.getBoundingClientRect(), d = DPR; c.width = r.width*d; c.height = r.height*d;
    var g = c.getContext('2d'), sr = splitB.getBoundingClientRect(), ox = sr.left - r.left + sr.width/2, oy = sr.top - r.top + sr.height*.9, ps = [];
    for (var i=0;i<8;i++){ var a = Math.PI*(.05 + .9*i/7); ps.push({x:ox, y:oy, vx:Math.cos(a)*(90+Math.random()*80)*(i%2?1:-1), vy:-Math.random()*40 + 30, r:6+Math.random()*8}); }
    var t0 = performance.now();
    (function tick(now){
      var t = Math.min(1,(now-t0)/400); g.setTransform(d,0,0,d,0,0); g.clearRect(0,0,r.width,r.height);
      ps.forEach(function(p){ var e = 1-Math.pow(1-t,2); g.globalAlpha = (1-t)*.85; g.fillStyle = '#fff3e3'; g.strokeStyle = '#12091f'; g.lineWidth = 2;
        g.beginPath(); g.arc(p.x + p.vx*e*.5, p.y + p.vy*e*.4, p.r*(.6+.8*e), 0, Math.PI*2); g.fill(); g.stroke(); });
      if (t < 1) raf(tick); else g.clearRect(0,0,r.width,r.height);
    })(t0);
  }
  if (FINE){
    G.set(beltIn, {transformPerspective:800});
    var bx = G.quickTo(beltIn,'rotationY',{duration:.6, ease:'power3.out'}), by = G.quickTo(beltIn,'rotationX',{duration:.6, ease:'power3.out'});
    $('.belt').addEventListener('pointermove', function(e){ var r = this.getBoundingClientRect(); bx(((e.clientX-r.left)/r.width-.5)*24); by(-((e.clientY-r.top)/r.height-.5)*18); });
    $('.belt').addEventListener('pointerleave', function(){ bx(0); by(0); });
  }
  var shH = $('.shelter h2 .ital');
  if (has.SplitText){
    var shSplit = SplitText.create(shH, {type:'words,chars', charsClass:'char'});
    G.from(shSplit.chars, {yPercent:-120, rotation:function(){return (Math.random()-.5)*30}, opacity:0, duration:.6, ease:'back.out(2.4)', stagger:{each:.025, from:'start'},
      scrollTrigger:{trigger:shH, start:'top 85%', once:true}, onComplete:function(){
        G.timeline({repeat:-1, repeatDelay:6, delay:2}).to(shSplit.chars, {yPercent:-14, duration:.2, ease:'sine.out', yoyo:true, repeat:1, stagger:.03});
      }});
  }
  var strongs = $$('.shelter p strong');
  G.set(strongs, {backgroundSize:'0% 42%'});
  G.to(strongs, {backgroundSize:'100% 42%', duration:.6, ease:'power3.out', stagger:.2, scrollTrigger:{trigger:'.shelter p', start:'top 85%', once:true}, delay:.5});

  /* =========================================================
     CONTINUE: mascots
     ========================================================= */
  var m1 = $('.cont .mascot'), m2 = $('.cont .mascot2');
  G.set(m2, {scaleX:-1, scaleY:1, rotation:0}); /* GSAP reads CSS scaleX(-1) as rotate(180) scaleY(-1); pin it explicitly */
  G.from(m1, {yPercent:100, rotation:12, duration:.8, ease:'back.out(1.6)', scrollTrigger:{trigger:'.cont', start:'top 60%', once:true}});
  G.from(m2, {yPercent:100, duration:.8, ease:'back.out(1.6)', delay:.15, scrollTrigger:{trigger:'.cont', start:'top 60%', once:true}});
  [m1, m2].forEach(function(m,i){
    G.to(m, {scaleY:1.03, duration:2, ease:'sine.inOut', yoyo:true, repeat:-1, delay:i*.7});
    (function twitch(){ G.delayedCall(3 + Math.random()*2, function(){ if (dead) return; G.to(m, {rotation:(Math.random()<.5?-4:4), duration:.15, ease:'power2.out', yoyo:true, repeat:1}); twitch(); }); })();
  });
  var ctaMag = $('#cont-cta').parentNode;
  ctaMag.addEventListener('pointerenter', function(){ G.to(m1, {keyframes:{rotation:[0,-7,6,-6,5,-3,0]}, duration:.6, ease:'none', overwrite:'auto'}); });

  if (document.readyState === 'complete') later(function(){ ScrollTrigger.refresh(); }, 0);
  else onWin('load', function(){ ScrollTrigger.refresh(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if (!dead) ScrollTrigger.refresh(); });
  }
}
