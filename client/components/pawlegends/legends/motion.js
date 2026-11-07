/* eslint-disable */
/**
 * Motion for the `/legends` landing (landing A/B arm B), ported from the scroll-lane-map landing script
 * (docs/plans/moba/landings/03-scroll-lane-map.html). Plain JS on purpose: it is the original engine (the lane drawn
 * through the sections, the minion canvas, towers that fall as you scroll, the fog intro, the practice pad, the pinned
 * dog base) with only the changes the port needs, the same way as `../landing/motion.js`:
 * - everything is scoped to the landing root (`$`/`$$`, `gsap.context`), not the document;
 * - window/document listeners, rAF loops, timers and observers are tracked, so the returned stop() leaves nothing
 *   running after the page unmounts (client-side navigation);
 * - GSAP and its plugins come from npm (`gsap` 3.13, the same "no charge" licence the original used from cdnjs);
 * - the intro curtain is the root's `js-intro` class (CSS lifts it after 5 s if this never runs), and the page tells
 *   the deferred analytics it is ready (`pawlegends:landing-ready`) once the fog has opened;
 * - the tower count comes from the markup (the game's four towers a team, `facts.ts`).
 *
 * @param {HTMLElement} rootEl the `.lgb` element
 * @param {Record<string, any>} libs gsap and its plugins
 * @returns {() => void} stop
 */
export function startLegendsMotion(rootEl, libs) {
  "use strict";
  var gsap = libs.gsap;
  var ac = new AbortController(), dead = false;
  var timers = new Set(), rafs = new Set(), observers = [], loose = [], onRefreshInit = null;
  function opts(o){ var r = typeof o === 'object' && o ? Object.assign({}, o) : {capture: !!o}; r.signal = ac.signal; return r; }
  function onWin(t, f, o){ window.addEventListener(t, f, opts(o)); }
  function onDoc(t, f, o){ document.addEventListener(t, f, opts(o)); }
  function rafT(cb){ if (dead) return 0; var id = requestAnimationFrame(function(t){ rafs.delete(id); if (!dead) cb(t); }); rafs.add(id); return id; }
  function later(cb, ms){ if (dead) return 0; var id = setTimeout(function(){ timers.delete(id); if (!dead) cb(); }, ms); timers.add(id); return id; }
  function ioT(cb, o){ var x = new IntersectionObserver(function(en){ if (!dead) cb(en); }, o); observers.push(x); return x; }
  /* The intro has played (or there is none): the page can start its deferred work (analytics, components/GoogleTagManager). */
  var readySent = false;
  function ready(){ if (readySent) return; readySent = true; try { window.dispatchEvent(new Event('pawlegends:landing-ready')); } catch (e) {} }

  var ctx = gsap.context(body, rootEl);

  return function stop(){
    if (dead) return;
    dead = true;
    ac.abort();
    timers.forEach(clearTimeout); rafs.forEach(cancelAnimationFrame);
    observers.forEach(function(o){ o.disconnect(); });
    if (onRefreshInit) libs.ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
    ctx.revert();
    gsap.killTweensOf(loose);
    gsap.killTweensOf(Array.prototype.slice.call(rootEl.querySelectorAll('*')));
  };

  function body(){
  var W0=window, D=document, docEl=D.documentElement;
  var RM = !!(W0.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var G = gsap, ST = libs.ScrollTrigger, CustomEase = libs.CustomEase, SplitText = libs.SplitText, Flip = libs.Flip;
  var MO = !RM;
  G.registerPlugin(ST, CustomEase, SplitText, libs.DrawSVGPlugin, libs.Physics2DPlugin, Flip, libs.MotionPathPlugin, libs.ScrambleTextPlugin);
  if (MO){ rootEl.classList.add('mo'); CustomEase.create('lgb-iris','M0,0 C.2,0 .25,.08 .35,.3 .5,.7 .62,1.04 1,1'); }
  var HOVER = !!(W0.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches);
  /* scoped to the landing root, never the document */
  var $ = function(s,c){return (c||rootEl).querySelector(s)}, $$ = function(s,c){return Array.prototype.slice.call((c||rootEl).querySelectorAll(s))};
  var map = $('#map'), lane = $('#lane'), paths = $$('path', lane), finalSec = $('.final');
  var anchors = $$('.anchor');
  var towers = $$('.tower').map(function(el,i){return {el:el, n:i+1, hp:1, down:false, lastHit:0, hpEl:$('.hp i',el), ghost:$('.hp s',el), tw:$('.tw',el), flash:$('.flash',el), anchor:el.parentNode, leg:el.closest('.leg')}});
  var mobile = false, vw = innerWidth, vh = innerHeight;
  var clamp = function(v,a,b){return v<a?a:v>b?b:v};

  /* ---------- split letters (wordmark + victory) ---------- */
  function splitChars(el, cls, rot, base){
    var txt = el.textContent; el.textContent='';
    for (var i=0;i<txt.length;i++){var s=D.createElement('span');s.className=cls; var r=((i%2?1:-1)*(6+((i*37)%10)));
      if (cls==='ch' && el.closest('.wordmark')){ var c=D.createElement('span'); c.className='chi'; c.textContent=txt[i]; s.appendChild(c); } else s.textContent=txt[i]===' '?'\u00a0':txt[i];
      s.style.setProperty('--i', (base||0)+i); if(rot) s.dataset.r = r; el.appendChild(s);}
  }
  splitChars($('.wordmark .l1'),'ch',1,0); splitChars($('.wordmark .l2'),'ch',1,3);
  splitChars($('.victory .vl'),'ch',1,0);
  var wmChars=$$('.wordmark .ch');

  /* ---------- lane geometry ---------- */
  var LUT={xs:null,ys:null,n:0,step:5,len:0}, mapTop=0, W=0, H=0, pts=[], riverInfo={top:0,bottom:0}, depInfo=[], baseY0=0, PIN=0, baseS=0, laneW=96;
  var finalST=null;
  function rel(el){var r=el.getBoundingClientRect(), m=map.getBoundingClientRect(); return {x:r.left+r.width/2-m.left, y:r.top+r.height/2-m.top, top:r.top-m.top, bottom:r.bottom-m.top, l:r.left-m.left, r:r.right-m.left}}
  function flat(fn){ var t=map.style.transform; map.style.transform=''; try{ fn(); } finally { map.style.transform=t; } }
  function layout(){ flat(layoutInner); }
  function layoutInner(){
    mobile = innerWidth<=760; vw=innerWidth; vh=innerHeight;
    var m = map.getBoundingClientRect(); mapTop = m.top + scrollY; W = map.clientWidth; H = map.scrollHeight;
    lane.setAttribute('width',W); lane.setAttribute('height',H); lane.setAttribute('viewBox','0 0 '+W+' '+H);
    pts = anchors.map(function(a){var p=rel(a); var sec=a.closest('.leg'); var s=rel(sec); p.secTop=s.top; p.secBot=s.bottom; return p;});
    // dog base: measure from the pin spacer so a pinned section still reports its resting place
    var last=pts[pts.length-1]; PIN = finalST ? (finalST.end-finalST.start) : 0;
    if (finalST){ var sp=finalSec.parentNode, sr=rel(sp), fr=finalSec.getBoundingClientRect(), ar=anchors[anchors.length-1].getBoundingClientRect();
      last.y = sr.top + (ar.top - fr.top); last.secTop = sr.top; }
    baseY0 = last.y;
    var d='M'+pts[0].x+' '+pts[0].y;
    for (var i=1;i<pts.length;i++){
      var A=pts[i-1], B=pts[i];
      var g=(A.secBot+B.secTop)/2, gap=Math.max(60,B.secTop-A.secBot);
      if (Math.abs(A.x-B.x)<2){ d+=' L'+B.x+' '+B.y; continue; }
      var h=Math.max(30, Math.min(gap/2-10, 190));
      if (A.y>g-h) g=A.y+h; if (B.y<g+h) g=(A.y+B.y)/2, h=Math.min(h,(B.y-A.y)/2-2);
      d+=' L'+A.x+' '+(g-h)+' C'+A.x+' '+g+' '+B.x+' '+g+' '+B.x+' '+(g+h)+' L'+B.x+' '+B.y;
    }
    if (PIN) d+=' L'+last.x+' '+(last.y+PIN);
    laneW = mobile?40:96; var lw=laneW;
    paths.forEach(function(p){p.setAttribute('d',d)});
    paths[0].setAttribute('stroke-width',lw+14); paths[1].setAttribute('stroke-width',lw); paths[2].setAttribute('stroke-width',lw*.42);
    paths[3].style.strokeWidth = mobile?3:4;
    var P=paths[1], len=P.getTotalLength(), step=5, n=Math.ceil(len/step)+1, xs=new Float32Array(n), ys=new Float32Array(n);
    for (var k=0;k<n;k++){var q=P.getPointAtLength(Math.min(len,k*step)); xs[k]=q.x; ys[k]=q.y; if(k&&ys[k]<ys[k-1]) ys[k]=ys[k-1];}
    LUT={xs:xs,ys:ys,n:n,step:step,len:len};
    baseS = idxAtY(baseY0)*step; catExitS = $('.hero .plaza').offsetWidth/2 + (mobile?50:90); dogExit = $('.final .plaza').offsetWidth/2 + 16; curBaseS=baseS;
    if (RM || !MO){ paths[4].style.strokeDasharray = paths[5].style.strokeDasharray = 'none'; }
    // river + bridge
    var rv=$('#river'), rr=rel(rv), bx=xAtY(rr.y);
    var br=$('#bridge'); br.style.left=bx+'px'; br.style.setProperty('--bw',(lw+44)+'px'); planks(br, rv.clientHeight-36);
    var rw=rv.clientWidth, rh=rv.clientHeight, rp=$('#lgb-rpath'); var amp=mobile?10:18;
    rp.setAttribute('d','M-40 '+(rh*.5+rw*.019)+' C'+(rw*.25)+' '+(rh*.5-amp+rw*.01)+' '+(rw*.5)+' '+(rh*.5+amp)+' '+(rw*.75)+' '+(rh*.5-amp-rw*.01)+' S'+(rw+40)+' '+(rh*.5-rw*.019)+' '+(rw+40)+' '+(rh*.5-rw*.019));
    $('#rtext').setAttribute('viewBox','0 0 '+rw+' '+rh);
    riverInfo={top:rr.top, bottom:rr.bottom, x:bx};
    depInfo = $$('[data-depth]').map(function(e){ var r=rel(e); return {el:e, y:r.y, k:parseFloat(e.dataset.depth)}; });
    minimap(d); trees(lw);
  }
  function idxAtY(y){var ys=LUT.ys,lo=0,hi=LUT.n-1; if(y<=ys[0])return 0; if(y>=ys[hi])return hi; while(hi-lo>1){var mid=(lo+hi)>>1; if(ys[mid]<y)lo=mid; else hi=mid;} return lo;}
  function xAtY(y){return LUT.xs[idxAtY(y)]}
  function at(s){return Math.max(0,Math.min(LUT.n-2,(s/LUT.step)|0));}
  function pt(s){var i=at(s), f=(s/LUT.step)-i; f=clamp(f,0,1); var x=LUT.xs[i]+(LUT.xs[i+1]-LUT.xs[i])*f, y=LUT.ys[i]+(LUT.ys[i+1]-LUT.ys[i])*f;
    var j=Math.min(LUT.n-1,i+3), k=Math.max(0,i-3), tx=LUT.xs[j]-LUT.xs[k], ty=LUT.ys[j]-LUT.ys[k], L=Math.hypot(tx,ty)||1; return {x:x,y:y,nx:-ty/L,ny:tx/L,tx:tx/L};}

  /* ---------- bridge planks ---------- */
  var plankN=0;
  function planks(br, h){ var n=Math.max(6,Math.floor(h/19)); if (n===plankN) return; plankN=n; br.innerHTML=''; for (var i=0;i<n;i++) br.appendChild(D.createElement('i')); }

  /* ---------- minimap ---------- */
  var mmMarks=[];
  function minimap(d){
    var svg=$('#mmsvg'); svg.setAttribute('viewBox','0 0 '+W+' '+H); $('path',svg).setAttribute('d',d);
    mmMarks.forEach(function(m){m.remove()}); mmMarks=[];
    pts.forEach(function(p,i){ var a=anchors[i].getAttribute('data-a'); if(a==='rest') return;
      var mk=D.createElement('span'); mk.className='mk'+(a==='cat-base'?' base cat':a==='dog-base'?' base':''); mk.style.left=(p.x/W*100)+'%'; mk.style.top=(p.y/H*100)+'%'; mk.dataset.a=a;
      $('#mm').insertBefore(mk,$('#mm .tr')); mmMarks.push(mk);});
    syncMarks();
  }
  function syncMarks(pulse){ mmMarks.forEach(function(mk){ var t=towers.filter(function(t){return 't'+t.n===mk.dataset.a})[0];
    var was=mk.classList.contains('x'), now=(t&&t.down)||(mk.dataset.a==='dog-base'&&won);
    if (now && !was){ mk.classList.add('x'); if (MO && pulse) G.fromTo(mk,{scale:2.4},{scale:1,duration:.7,ease:'elastic.out(1,.4)',xPercent:-50,yPercent:-50}); } }); }
  $('#mini').addEventListener('click',function(e){var r=$('#mm').getBoundingClientRect(); var f=clamp((e.clientY-r.top)/r.height,0,1);
    if(e.detail===0){ var cur=scrollY-mapTop+innerHeight*.55, nx=pts.filter(function(p){return p.y>cur+40})[0]; f = nx? nx.y/H : 0; }
    scrollTo({top:Math.max(0,mapTop+f*H-innerHeight*.5),behavior:RM?'auto':'smooth'});});

  /* ---------- trees: shadows + trunks at 1.0x, crowns on their own plane ---------- */
  var lastTreeW=-1;
  function rnd(seed){return function(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646}}
  function trees(lw){
    if (Math.abs(W-lastTreeW)<2 && $('#trees').children.length) return; lastTreeW=W;
    var box=$('#trees'), cbox=$('#crowns'); box.innerHTML=''; cbox.innerHTML='';
    var R=rnd(42), mr=map.getBoundingClientRect(), blocks=$$('.leg .content, .plaza, .fountain, .foot, .river').map(function(el){var r=rel(el);var b=el.getBoundingClientRect();return {l:b.left-mr.left-30,r:b.right-mr.left+30,t:r.top-30,b:r.bottom+30}});
    if (PIN) blocks.push({l:pts[pts.length-1].x-260,r:pts[pts.length-1].x+260,t:baseY0,b:baseY0+PIN+260});
    var cell=mobile?64:84, f1=D.createDocumentFragment(), f2=D.createDocumentFragment(), count=0;
    for (var y=40;y<H-60;y+=cell){ for (var x=10;x<W;x+=cell){
      var px=x+(R()-.5)*cell*.9, py=y+(R()-.5)*cell*.9;
      if (R()<.45) continue;
      var bad=false; for (var b=0;b<blocks.length;b++){var q=blocks[b]; if(px>q.l&&px<q.r&&py>q.t&&py<q.b){bad=true;break;}} if(bad) continue;
      var i0=idxAtY(py-lw*2), i1=idxAtY(py+lw*2), dmin=1e9; for (var k=i0;k<=i1;k+=2){var dx=LUT.xs[k]-px,dy=LUT.ys[k]-py; var dd=dx*dx+dy*dy; if(dd<dmin)dmin=dd;}
      if (Math.sqrt(dmin)<lw/2+46) continue;
      var s=(mobile?30:42)+R()*(mobile?22:40), css='left:'+px.toFixed(0)+'px;top:'+py.toFixed(0)+'px;--s:'+s.toFixed(0)+'px';
      var t=D.createElement('span'); t.className='tree'; t.style.cssText=css; f1.appendChild(t);
      var c=D.createElement('span'); c.className='crown'; c.style.cssText=css; f2.appendChild(c);
      if(++count>260) break;
    } if(count>260) break; }
    box.appendChild(f1); cbox.appendChild(f2);
  }

  /* ---------- canopy parallax layer (1.35x) ---------- */
  (function(){ var l=$('.canopy .lyr'), R=rnd(7), f=D.createDocumentFragment();
    for (var rep=0;rep<2;rep++) for (var i=0;i<14;i++){ var e=D.createElement('span'); e.className='leaf'; var s=90+R()*150, left=R()<.5;
      e.style.cssText='width:'+s+'px;height:'+(s*.8)+'px;top:'+(rep*1600+i*114+R()*60)+'px;'+(left?'left:'+(-s*.62+R()*20):'right:'+(-s*.62+R()*20))+'px'; f.appendChild(e);}
    l.appendChild(f); })();

  /* ---------- canvas fx ---------- */
  var cv=$('#fx'), cx=cv.getContext('2d'), DPR=Math.min(2,W0.devicePixelRatio||1), VW=0, VH=0;
  function size(){VW=innerWidth;VH=innerHeight;cv.width=VW*DPR;cv.height=VH*DPR;cx.setTransform(DPR,0,0,DPR,0,0)}
  var minions=[], parts=[], shots=[], rings=[], spawnT=0, fightT=0, gatesOpen=false, F=0, trailF=0, won=false;
  var comet=(function(){ var c=D.createElement('canvas'); c.width=c.height=64; var g=c.getContext('2d'), gr=g.createRadialGradient(32,32,0,32,32,32);
    gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.18,'rgba(255,214,230,.95)'); gr.addColorStop(.45,'rgba(236,90,141,.55)'); gr.addColorStop(1,'rgba(236,90,141,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64); return c; })();
  var sparks=[];
  function spawnWave(side, s){ for (var i=0;i<3;i++) minions.push({side:side,s:s+(side==='c'?-i*16:i*16),off:(i-1)*(mobile?6:12),tgt:10+Math.random()*44,ph:Math.random()*6,hp:1,a:0}); }
  function burst(x,y,n,cols,spd,grav,sz,life){ for (var i=0;i<n;i++){var a=Math.random()*Math.PI*2, v=spd*(.35+Math.random()*.9); parts.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-(grav?spd*.5:0),g:grav,c:cols[i%cols.length],s:sz*(.5+Math.random()),l:life*(.6+Math.random()*.6),t:0,sq:Math.random()<.4});} }
  function ring(x,y,r0,r1,dur,col,w,sy){ rings.push({x:x,y:y,r0:r0,r1:r1,d:dur,t:0,c:col,w:w,sy:sy||1}); }
  function drawMinion(m, now, top){
    var p=pt(m.s), walk=m.mv?Math.sin(now/90+m.ph)*1.6:0, x=p.x+p.nx*m.off, y=p.y+p.ny*m.off-top+walk, r=mobile?5:7.5;
    if (y<-30||y>VH+30) return;
    cx.globalAlpha=m.a;
    cx.fillStyle='rgba(29,79,36,.25)'; cx.beginPath(); cx.ellipse(x+2,y+r*.9,r*1.1,r*.45,0,0,7); cx.fill();
    var c=m.side==='c', col=c?'#ec5a8d':'#3d68dd', dk=c?'#8a1f47':'#0d1d4a';
    cx.fillStyle=col; cx.strokeStyle=dk; cx.lineWidth=2;
    if (c){ cx.beginPath(); cx.moveTo(x-r*.95,y-r*.2); cx.lineTo(x-r*.7,y-r*1.45); cx.lineTo(x-r*.05,y-r*.75); cx.closePath(); cx.fill(); cx.stroke();
      cx.beginPath(); cx.moveTo(x+r*.95,y-r*.2); cx.lineTo(x+r*.7,y-r*1.45); cx.lineTo(x+r*.05,y-r*.75); cx.closePath(); cx.fill(); cx.stroke(); }
    cx.beginPath(); cx.arc(x,y,r,0,7); cx.fill(); cx.stroke();
    if (!c){ cx.fillStyle=dk; cx.beginPath(); cx.ellipse(x-r*.95,y+r*.05,r*.38,r*.7,.4,0,7); cx.fill(); cx.beginPath(); cx.ellipse(x+r*.95,y+r*.05,r*.38,r*.7,-.4,0,7); cx.fill(); }
    cx.fillStyle='#fff'; cx.beginPath(); cx.arc(x-r*.32,y-r*.1,r*.2,0,7); cx.arc(x+r*.32,y-r*.1,r*.2,0,7); cx.fill();
    cx.globalAlpha=1;
    // splash sparkles while crossing the river
    if (m.mv && p.y>riverInfo.top+40 && p.y<riverInfo.bottom-40 && Math.random()<.12) parts.push({x:x+(Math.random()-.5)*14,y:p.y+r,vx:(Math.random()-.5)*40,vy:-60-Math.random()*50,g:260,c:Math.random()<.5?'#ffffff':'#bfe8ff',s:1.6+Math.random()*1.4,l:.45,t:0,sq:false});
  }
  function sim(dt, top){
    var sTop=idxAtY(top-40)*LUT.step, sBot=idxAtY(top+VH+40)*LUT.step, front=F;
    if (gatesOpen && !RM){
      spawnT-=dt; if (spawnT<=0){ spawnT=2.1;
        var cs=Math.max(0,Math.min(sTop,front-60)); if (front-cs>50) spawnWave('c',cs);
        if (!won){ var ds=Math.min(curBaseS-dogExit,Math.max(sBot,front+60)); if (ds-front>50) spawnWave('d',ds); } }
    }
    var spd=(mobile?34:46)*(1+Math.min(1.5,Math.abs(vel)/30)), atFrontC=0, atFrontD=0;
    for (var i=minions.length-1;i>=0;i--){ var m=minions[i];
      var target = m.side==='c' ? front-m.tgt : front+m.tgt; if (won && m.side==='c') target=front-14-m.tgt*.6;
      var dd=target-m.s; m.mv=Math.abs(dd)>2; if (m.mv) m.s+=Math.sign(dd)*Math.min(Math.abs(dd),spd*dt); else { if(m.side==='c')atFrontC++; else atFrontD++; }
      m.a=Math.min(1,m.a+dt*3);
      if (m.dead){ m.a-=dt*6; if(m.a<=0) minions.splice(i,1); continue; }
      if (m.s<sTop-400||m.s>sBot+400){ minions.splice(i,1); }
    }
    if (minions.length>60) minions.splice(0,minions.length-60);
    fightT-=dt;
    if (fightT<=0 && atFrontC && atFrontD){ fightT=.16+Math.random()*.2; var fp=pt(front); burst(fp.x+(Math.random()-.5)*30,fp.y+(Math.random()-.5)*20,4,['#fff','#ffc83d','#ffe9a8'],70,0,2.6,.35);
      if (Math.random()<.18){ var side=Math.random()<.55?'d':'c'; var cand=minions.filter(function(m){return m.side===side&&!m.mv&&!m.dead}); if(cand.length>1){var v=cand[(Math.random()*cand.length)|0]; v.dead=true; var vp=pt(v.s); burst(vp.x+vp.nx*v.off,vp.y+vp.ny*v.off,10,side==='c'?['#ec5a8d','#ffd3e2']:['#3d68dd','#cfdcff'],110,260,3,.6);} } }
  }

  function render(now, dt, top){
    cx.clearRect(0,0,VW,VH);
    if (!LUT.n) return;
    // speed streaks beside the canopy
    var sa=Math.min(.35,Math.abs(vel)/40);
    if (sa>.02 && VW>1300){ cx.strokeStyle='rgba(18,64,30,'+sa.toFixed(3)+')'; cx.lineCap='round';
      for (var q=0;q<10;q++){ var sx=(q<5? 12+q*20 : VW-12-(q-5)*20), sy=((q*173+now*.9*Math.sign(vel))%VH+VH)%VH, l=60+Math.abs(vel)*6;
        cx.lineWidth=q%2?3:5; cx.beginPath(); cx.moveTo(sx,sy); cx.lineTo(sx,sy+l); cx.stroke(); } }
    // comet head where the trail ends
    if (gatesOpen && !won){ var cp=pt(trailF), cy=cp.y-top;
      var want=2+Math.min(6,Math.round(Math.abs(vel)/3));
      sparks.unshift({x:cp.x+(Math.random()-.5)*8,y:cp.y+(Math.random()-.5)*8}); if (sparks.length>want) sparks.length=want;
      for (var k=sparks.length-1;k>=1;k--){ var sp=sparks[k], a=(1-k/(sparks.length+1)); cx.globalAlpha=a*.9; cx.fillStyle=k%2?'#ffd3e2':'#fff'; cx.beginPath(); cx.arc(sp.x, sp.y-top - k*4*Math.sign(vel||1), 2.6*a+1,0,7); cx.fill(); }
      cx.globalAlpha=1; var cs2=(mobile?34:54)*(1+Math.sin(now/180)*.08); cx.drawImage(comet, cp.x-cs2/2, cy-cs2/2, cs2, cs2);
      // front rings: expo.out expansion, second ring 0.3 s behind
      var fp=pt(F), fy=fp.y-top;
      for (var rI=0;rI<2;rI++){ var pr=((now/1000 - rI*.3)%1.2+1.2)%1.2/1.2, e=1-Math.pow(2,-10*pr);
        cx.strokeStyle='rgba(255,255,255,'+(0.8*(1-pr)).toFixed(3)+')'; cx.lineWidth=3-rI; cx.beginPath(); cx.arc(fp.x,fy,(mobile?10:18)+e*(mobile?18:36),0,7); cx.stroke(); } }
    minions.sort(function(a,b){return a.s-b.s});
    for (var i=0;i<minions.length;i++) drawMinion(minions[i], now, top);
    // shots
    for (var j=shots.length-1;j>=0;j--){ var s=shots[j]; s.t+=dt; var k2=Math.min(1,s.t/s.d), ek=1-Math.pow(1-k2,2);
      var x=s.x0+(s.x1-s.x0)*ek, y=s.y0+(s.y1-s.y0)*ek-Math.sin(k2*Math.PI)*s.arc-top;
      cx.fillStyle=s.cat?'#ec5a8d':'#ffc83d'; cx.strokeStyle=s.cat?'#fff':'#6b4a07'; cx.lineWidth=2; cx.beginPath(); cx.arc(x,y,mobile?3.5:5,0,7); cx.fill(); cx.stroke();
      if (k2>=1){ burst(s.x1,s.y1,7,s.cat?['#ec5a8d','#fff']:['#ffc83d','#fff'],90,0,2.5,.35); if (s.done) s.done(); shots.splice(j,1);} }
    // rings
    for (var r=rings.length-1;r>=0;r--){ var g=rings[r]; g.t+=dt; var kk=Math.min(1,g.t/g.d), ee=1-Math.pow(1-kk,3), rad=g.r0+(g.r1-g.r0)*ee;
      cx.globalAlpha=1-kk; cx.strokeStyle=g.c; cx.lineWidth=g.w*(1-kk*.6); cx.beginPath(); cx.ellipse(g.x,g.y-top,rad,rad*g.sy,0,0,7); cx.stroke(); if (kk>=1) rings.splice(r,1); }
    cx.globalAlpha=1;
    // particles
    for (var p=parts.length-1;p>=0;p--){ var qd=parts[p]; qd.t+=dt; if(qd.t>qd.l){parts.splice(p,1);continue;}
      var damp=Math.pow(.96,dt*60); qd.vx*=damp; qd.vy=qd.vy*damp+qd.g*dt; qd.x+=qd.vx*dt; qd.y+=qd.vy*dt; var a2=1-qd.t/qd.l, py=qd.y-top;
      if (py<-40||py>VH+40) continue;
      cx.globalAlpha=a2; cx.fillStyle=qd.c;
      if (qd.sq){ cx.save(); cx.translate(qd.x,py); cx.rotate(qd.t*8); cx.fillRect(-qd.s,-qd.s*.6,qd.s*2,qd.s*1.2); cx.restore(); }
      else { cx.beginPath(); cx.arc(qd.x,py,qd.s,0,7); cx.fill(); } }
    cx.globalAlpha=1;
  }

  /* ---------- camera ---------- */
  var cam={z:1,fx:0,fy:0,rot:0,sx:0,sy:0}, lastMapT='', lastCvT=''; loose.push(cam);
  function camString(top){
    var c=vw/2, m=vh/2;
    return 'translate('+cam.sx.toFixed(2)+'px,'+cam.sy.toFixed(2)+'px) translate('+c+'px,'+m+'px) rotate('+cam.rot.toFixed(3)+'deg) translate('+(-c)+'px,'+(-m)+'px) translate('+cam.fx.toFixed(1)+'px,'+cam.fy.toFixed(1)+'px) scale('+cam.z.toFixed(4)+') translate('+(-cam.fx).toFixed(1)+'px,'+(-cam.fy).toFixed(1)+'px)';
  }
  var camwrap=$('.final .camwrap');
  function applyCam(top){
    if (finalST && scrollY > finalST.start - 4){ if (lastMapT){ map.style.transform=''; map.style.willChange=''; lastMapT=''; } G.set(camwrap,{x:cam.sx,y:cam.sy}); var tc=(cam.sx||cam.sy)?'translate('+cam.sx.toFixed(1)+'px,'+cam.sy.toFixed(1)+'px)':''; if (tc!==lastCvT){ cv.style.transform=tc; lastCvT=tc; } return; }
    var idle = Math.abs(cam.rot)<.004 && Math.abs(cam.z-1)<.0002 && Math.abs(cam.sx)<.05 && Math.abs(cam.sy)<.05;
    var t = idle ? '' : camString(top), mt = idle ? '' : 'translate(0,'+top.toFixed(1)+'px) '+t+' translate(0,'+(-top).toFixed(1)+'px)';
    if (mt!==lastMapT){ map.style.willChange = mt ? 'transform' : ''; map.style.transform=mt; lastMapT=mt; }
    if (t!==lastCvT){ cv.style.transform=t; lastCvT=t; }
  }
  function shake(px, dur){ if (!MO) return; var o={a:px}; G.to(o,{a:0,duration:dur,ease:'power2.out',onUpdate:function(){ cam.sx=(Math.random()*2-1)*o.a; cam.sy=(Math.random()*2-1)*o.a; },onComplete:function(){cam.sx=cam.sy=0;}}); }

  /* ---------- towers + base ---------- */
  var downCount=0, toast=$('.toast'), scoreEl=$('.score'), twcount=$('#twcount');
  function showToast(a,b){ toast.innerHTML='<span class="ln"></span><span class="sub"></span>'; var ln=$('.ln',toast); ln.textContent=a; splitChars(ln,'ch'); $('.sub',toast).textContent=b;
    toast.classList.remove('on'); void toast.offsetWidth; if(!RM) toast.classList.add('on'); }
  function setCount(txt){ if (MO && libs.ScrambleTextPlugin){ G.to(twcount,{duration:.4,scrambleText:{text:txt,chars:'0123456789',speed:.6,revealDelay:.1}}); } else twcount.textContent=txt; }
  function topple(t, top){
    t.down=true; t.el.classList.add('down'); downCount++;
    var icons=$$('.twi i'), ic=icons[t.n-1];
    var left=towers.length-downCount; $('#twsr').textContent=left+' dog towers standing';
    setCount(left? left+' tower'+(left>1?'s':'')+' left':'Core exposed');
    var p=pts[t.n]; var bx=p.x, by=p.y;
    if (MO){
      if (ic) G.timeline().to(ic,{scale:1.6,duration:.18,ease:'power2.out'}).to(ic,{rotationY:180,duration:.35,ease:'back.out(2)'},'<.08').to(ic,{scale:1,duration:.35,ease:'back.out(3)'},'<.1');
      G.to(scoreEl,{keyframes:{x:[0,-6,6,-4,4,-2,0]},duration:.4,ease:'none'});
      var dir = (p.x > vw/2) ? -1 : 1, tw=t.tw;
      var tl=G.timeline();
      tl.to(tw,{x:3,duration:1/32,repeat:11,yoyo:true,ease:'none'})
        .set(tw,{x:0})
        .to(tw,{rotation:92*dir,duration:.45,ease:'power4.in'})
        .add(function(){ landFx(t,bx,by,dir); })
        .to(tw,{rotation:86*dir,duration:.12,ease:'power2.out'})
        .to(tw,{rotation:92*dir,duration:.4,ease:'bounce.out'})
        .to(tw,{filter:'grayscale(.7) brightness(.85)',duration:.5},'<');
      var flag=$('.capflag',t.el); G.fromTo(flag,{rotation:-90,scale:.4},{rotation:0,scale:1,duration:.9,ease:'elastic.out(1,.45)',delay:1.1});
      capture(t);
    } else { if (ic) ic.classList.add('x'); burst(bx,by-30,30,['#e9d3a8','#d8bf91','#fff'],150,140,4,1); }
    showToast(left?'Dog tower down!':'Last tower down!', left? left+' to go':'The dog core is open');
    syncMarks(true);
  }
  function landFx(t,bx,by,dir){
    shake(6,.4);
    ring(bx+dir*30,by,10,mobile?50:90,.7,'rgba(233,211,168,.95)',8,.45);
    burst(bx+dir*40,by-10,40,['#e9d3a8','#d8bf91','#bfa77d','#fff'],170,140,4.5,1.1);
    var rb=$$('.rubble b',t.el);
    rb.forEach(function(b,i){ var a=-90+(Math.random()*120-60); G.set(b,{opacity:1,x:0,y:-40,xPercent:-50,yPercent:-50,rotation:0});
      G.to(b,{physics2D:{velocity:200+Math.random()*220,angle:a,gravity:900},rotation:(Math.random()*720-360),duration:.5,ease:'none',
        onComplete:function(){ G.to(b,{x:b.style.getPropertyValue('--x'),y:b.style.getPropertyValue('--y'),rotation:i*47,duration:.5,ease:'back.out(2)'}); }}); });
  }
  function hitFx(t){
    if (t.down) return;
    if (MO){ G.fromTo(t.flash,{opacity:.95},{opacity:0,duration:.12,ease:'power1.in'});
      var fp=pt(F), dx=pts[t.n].x-fp.x, dy=pts[t.n].y-fp.y, L=Math.hypot(dx,dy)||1;
      G.fromTo(t.tw,{x:dx/L*4,y:dy/L*4},{x:0,y:0,duration:.25,ease:'back.out(3)'}); }
  }
  function hitTower(t, now){
    if (now-t.lastHit<320) return; t.lastHit=now;
    var p=pts[t.n], fp=pt(F);
    shots.push({x0:p.x,y0:p.y-70,x1:fp.x,y1:fp.y,t:0,d:.45,arc:40});
    shots.push({x0:fp.x+(Math.random()-.5)*20,y0:fp.y,x1:p.x,y1:p.y-56,t:0,d:.32,arc:26,cat:true,done:function(){hitFx(t)}});
  }
  var baseHp=$('.base-hp'), baseHpV=1, baseLast=0;
  function setTowerHp(t,hp){ t.el.style.setProperty('--hp',hp.toFixed(3)); if (MO){ G.to(t.ghost,{scaleX:hp,duration:.3,delay:.25,ease:'power2.in',overwrite:true}); } else t.ghost.style.transform='scaleX('+hp+')'; }
  function logic(now, top){
    towers.forEach(function(t){
      var ay=pts[t.n].y-top;
      var hp = clamp((ay-vh*.42)/(vh*.4),0,1);
      if (!t.down){ if (hp<t.hp-.002 && hp<1){ t.hp=hp; setTowerHp(t,hp); if(MO) hitTower(t,now);}
        t.el.classList.toggle('hot', hp<1 && hp>0);
        if (hp<=0) topple(t, top); }
    });
    if (!won){
      var bh;
      if (finalST) bh = 1 - clamp((scrollY - finalST.start)/(PIN*.85),0,1);
      else { var b=pts[pts.length-1].y-top, bottom=(innerHeight+scrollY)>=docEl.scrollHeight-40; bh=clamp((b-vh*.38)/(vh*.35),0,1); if (bottom) bh=0; }
      if (bh<baseHpV && bh<1 && MO && now-baseLast>300){ baseLast=now; var fp=pt(F), bp=rel($('.final .nexus'));
        shots.push({x0:fp.x+(Math.random()-.5)*30,y0:fp.y,x1:bp.x+(Math.random()-.5)*30,y1:bp.y,t:0,d:.32,arc:30,cat:true,done:function(){ G.fromTo('.final .house',{x:3},{x:0,duration:.25,ease:'back.out(3)'}); }}); }
      if (bh<baseHpV){ baseHpV=bh; baseHp.style.setProperty('--hp',bh.toFixed(3)); if (MO) G.to($('s',baseHp),{scaleX:bh,duration:.3,delay:.25,ease:'power2.in',overwrite:true}); else $('s',baseHp).style.transform='scaleX('+bh+')'; }
      if (baseHpV<=0){ var rest=towers.filter(function(t){return !t.down}); if (rest.length) rest.forEach(function(t){ t.hp=0; setTowerHp(t,0); topple(t,top); }); win(); }
    }
  }

  /* ---------- capture wipe on a section card ---------- */
  function capture(t){
    var card=$('.card',t.leg), pin=$('.maplabel .pin',t.leg);
    if (pin) G.timeline({delay:.5}).to(pin,{rotationY:90,duration:.2,ease:'power2.in'}).add(function(){ pin.classList.add('cat'); $('b',pin).textContent='✓'; }).to(pin,{rotationY:0,duration:.2,ease:'back.out(2)'});
    if (!card) return; var w=$('.wipe',card); if (!w) return;
    G.timeline({delay:.35}).set(w,{visibility:'visible'})
      .fromTo($('i',w),{xPercent:-160},{xPercent:330,duration:.5,ease:'expo.inOut'})
      .fromTo($('b',w),{opacity:0,scale:1.6},{opacity:1,scale:1,duration:.3,ease:'back.out(3)'},'-=.3')
      .add(function(){ card.classList.add('cap'); })
      .to($('b',w),{opacity:0,y:-10,duration:.3,ease:'power2.in'},'+=.5')
      .set(w,{visibility:'hidden'});
  }

  /* ---------- base break + VICTORY ---------- */
  var flashw=$('.flashw');
  function win(){
    if (won) return; won=true; finalSec.classList.add('won'); var p=rel($('.final .nexus')); syncMarks(true);
    var vic=$('.victory'), chars=$$('.victory .vl .ch');
    if (!MO){ $$('.final .flag').forEach(function(f){ f.classList.add('cat'); }); burst(p.x,p.y,70,['#ec5a8d','#ffc83d','#fff','#ffd3e2'],380,380,5,1.6); return; }
    var house=$('.final .house'), crack=$$('.final .crack path'), shards=$$('.final .shards path'), deb=$('.final .debris'), cw=$('.final .camwrap');
    G.set($('.final .crack'),{visibility:'visible'}); G.set(crack,{drawSVG:'0%'});
    var tl=G.timeline();
    tl.to(baseHp,{scale:1.2,opacity:0,duration:.25,ease:'back.in(2)'})
      .to(crack,{drawSVG:'100%',duration:.18,stagger:.06,ease:'power2.out'},0)
      .to(house,{keyframes:{x:[0,-3,3,-4,4,-2,2,0]},duration:.4,ease:'none',transformOrigin:'50% 90%'},0.05)
      .add(function(){
        G.fromTo(flashw,{opacity:.85},{opacity:0,duration:.06,ease:'none',delay:.0,onComplete:function(){G.set(flashw,{opacity:0})}});
        G.set([house,$('.final .crack')],{visibility:'hidden'});
        minions.forEach(function(m){ if (m.side==='d'){ m.dead=true; var vp=pt(m.s); burst(vp.x+vp.nx*m.off,vp.y,8,['#3d68dd','#cfdcff'],110,260,3,.6); } }); G.set($('.final .shards'),{visibility:'visible'});
        shards.forEach(function(s,i){ var ang=-90+(i-3)*28+(Math.random()*20-10);
          G.fromTo(s,{x:0,y:0,rotation:0,opacity:1},{physics2D:{velocity:200+Math.random()*220,angle:ang,gravity:900},rotation:(Math.random()*2-1)*260,duration:1.1,ease:'none',transformOrigin:'50% 50%'});
          G.to(s,{opacity:0,duration:.3,delay:.8}); });
        G.set(deb,{visibility:'visible'}); G.from($$('path,g',deb),{scale:0,transformOrigin:'50% 100%',duration:.5,ease:'back.out(3)',stagger:.05,delay:.35});
        burst(p.x,p.y,90,['#ec5a8d','#ffc83d','#fff','#ffd3e2','#ff8db5'],420,380,5,1.8);
        burst(p.x,p.y,24,['#2f57c9','#132a66','#ffc83d'],300,600,5,1.2);
        ring(p.x,p.y+20,20,mobile?140:240,.8,'rgba(255,255,255,.95)',10,.5);
        shake(10,.6);
        G.timeline().to(cw,{scale:1.06,duration:.4,ease:'power2.out'}).to(cw,{scale:1,duration:.4,ease:'power2.inOut'});
        $$('.final .flag').forEach(function(f,i){ G.timeline({delay:.5+i*.08}).to(f,{rotation:-90,duration:.18,ease:'power2.in'}).add(function(){f.classList.add('cat')}).to(f,{rotation:0,duration:.8,ease:'elastic.out(1,.45)'}); });
      },.45)
      .set(vic,{visibility:'visible'},.55)
      .fromTo(chars,{scale:3,opacity:0,filter:'blur(12px)',rotation:function(i,el){return +el.dataset.r}},{scale:1,opacity:1,filter:'blur(0px)',duration:.7,ease:'expo.out',stagger:.05,rotation:0},.55)
      .add(function(){ G.set(chars,{clearProps:'filter'});
        G.fromTo($('.victory .shine'),{backgroundPosition:'160% 0'},{backgroundPosition:'-60% 0',duration:1.1,ease:'power2.inOut',repeat:-1,repeatDelay:1.9}); });
  }

  /* ---------- velocity + parallax ---------- */
  var rtp=$('#rtp'), rts=$('#rts'), roff=0, lastSY=scrollY, vel=0, canopy=$('.canopy .lyr'), ground=$('#ground'), crowns=$('#crowns'), rtLen=0;
  function parallax(top, now){
    var sy=scrollY; vel = vel*.88 + (sy-lastSY)*.12; lastSY=sy;
    if (RM) return;
    canopy.style.transform='translate3d(0,'+(-((sy*1.35)%1600)).toFixed(1)+'px,0)';
    ground.style.transform='translate3d(0,'+((top*.1)%240).toFixed(1)+'px,0)';
    crowns.style.transformOrigin=(W/2)+'px '+(top+vh/2).toFixed(0)+'px';
    if (!crowns.style.transform) crowns.style.transform='scale(1.045)';
    if (riverInfo.bottom>top-50 && riverInfo.top<top+vh+50){
      roff -= .6 + Math.abs(vel)*.35; if (roff< -900) roff+=900; rtp.setAttribute('startOffset', roff.toFixed(1));
      if (!rtLen) rtLen=rts.textContent.length;
      var amp=Math.min(9,1.2+Math.abs(vel)*.5), prev=0, ds=[];
      for (var i=0;i<rtLen;i++){ var yv=Math.sin(i*.55+now*.006)*amp; ds.push((yv-prev).toFixed(1)); prev=yv; }
      rts.setAttribute('dy',ds.join(' '));
    }
    for (var d=0; d<depInfo.length; d++){ var e=depInfo[d], c=(e.y-top-vh/2); e.el.style.translate='0 '+(c*e.k).toFixed(1)+'px'; }
  }

  /* ---------- main loop ---------- */
  var mePin=$('#me'), trs=$$('#mm .tr').map(function(e,i){return {el:e,x:0,y:0,o:.55-i*.1}}), S={y:scrollY}, lastNow=performance.now(); loose.push(S);
  var pinClipY=-1, catExitS=0, curBaseS=0, dogExit=0;
  function frame(now){
    var dt=Math.min(.05,(now-lastNow)/1000); lastNow=now;
    if (LUT.n){
      var sy = MO ? S.y : scrollY, top=sy-mapTop;
      // where the dog base currently sits (it rides the pin)
      var baseYNow = finalST ? baseY0 + clamp(scrollY-finalST.start,0,PIN) : baseY0;
      var sBase = idxAtY(baseYNow)*LUT.step; curBaseS=sBase;
      F=idxAtY(top+vh*.55)*LUT.step; if (F<catExitS) F=catExitS; if (F>sBase-dogExit-24) F=sBase-dogExit-24; if (won) F=sBase-dogExit;
      trailF += (F-trailF)*Math.min(1,dt*7);
      var tr = gatesOpen? trailF : 0; if (won) tr=sBase;
      if (MO) paths[4].style.strokeDasharray=paths[5].style.strokeDasharray = tr.toFixed(1)+' '+(LUT.len+10);
      if (PIN && Math.abs(baseYNow-pinClipY)>.5){ pinClipY=baseYNow; lane.style.clipPath='inset(0 0 '+Math.max(0,H-baseYNow).toFixed(0)+'px 0)'; }
      // camera banks into the curve ahead
      if (MO){ var ahead=pt(Math.min(LUT.len,F+140)), nearEnd = finalST && scrollY > finalST.start - vh*1.2;
        var tgt = nearEnd ? 0 : clamp(ahead.tx*1.2,-1.2,1.2); cam.rot += (tgt-cam.rot)*Math.min(1,dt*3); if (Math.abs(cam.rot)<.004) cam.rot=0; applyCam(top); }
      var fp=pt(F); var mx=fp.x/W*100, my=fp.y/H*100;
      mePin.style.transform='translate('+(mx*0.01*mmW).toFixed(1)+'px,'+(my*0.01*mmH).toFixed(1)+'px)';
      var px=mx*0.01*mmW, py=my*0.01*mmH; for (var i=0;i<trs.length;i++){ var tI=trs[i]; tI.x+=(px-tI.x)*.18; tI.y+=(py-tI.y)*.18; px=tI.x; py=tI.y; tI.el.style.transform='translate('+tI.x.toFixed(1)+'px,'+tI.y.toFixed(1)+'px)'; tI.el.style.opacity=(Math.abs(vel)>.5?tI.o:tI.o*.4).toFixed(2); }
      logic(now, top); sim(dt, top); render(now, dt, top); parallax(top, now);
    }
    if (!RM) rafT(frame);
  }
  var mmW=0, mmH=0; function mmSize(){ var r=$('#mm'); mmW=r.clientWidth; mmH=r.clientHeight; }
  function staticFrame(){ var top=scrollY-mapTop; F=idxAtY(top+vh*.55)*LUT.step;
    var fp=pt(F); mePin.style.transform='translate('+(fp.x/W*mmW).toFixed(1)+'px,'+(fp.y/H*mmH).toFixed(1)+'px)'; trs.forEach(function(t){t.el.style.opacity=0});
    logic(performance.now(), top); }

  /* ---------- intro: fog of war iris, camera drop, countdown, gates ---------- */
  function intro(){
    var hero=$('.hero');
    if (!MO){ rootEl.classList.remove('js-intro'); openGates(true); ready(); return; }
    var a=rel($('.hero .anchor')), ax=a.x, ay=a.y-(scrollY-mapTop);
    // fog canvas: noise clouds that dissolve outward from the cat nexus
    var fc=D.createElement('canvas'); fc.className='fog'; fc.setAttribute('aria-hidden','true'); rootEl.appendChild(fc);
    var fw=Math.ceil(vw/2), fh=Math.ceil(vh/2); fc.width=fw; fc.height=fh; var g=fc.getContext('2d');
    var cloud=D.createElement('canvas'); cloud.width=fw; cloud.height=fh; var cg=cloud.getContext('2d'); cg.fillStyle='#0c2414'; cg.fillRect(0,0,fw,fh);
    var R=rnd(11); for (var i=0;i<90;i++){ var x=R()*fw, y=R()*fh, r=20+R()*110, gr=cg.createRadialGradient(x,y,0,x,y,r), lt=R()<.6;
      gr.addColorStop(0, lt?'rgba(42,110,56,.55)':'rgba(6,26,12,.6)'); gr.addColorStop(1,'rgba(12,36,20,0)'); cg.fillStyle=gr; cg.beginPath(); cg.arc(x,y,r,0,7); cg.fill(); }
    rootEl.classList.remove('js-intro');
    var fx=ax/2, fy=ay/2, Rmax=Math.hypot(Math.max(fx,fw-fx),Math.max(fy,fh-fy))*1.3, P={p:0}, lobes=[]; for (var l=0;l<14;l++) lobes.push({a:l/14*Math.PI*2+R()*.3, k:.75+R()*.5});
    function drawFog(){ var p=P.p, r=p*Rmax; g.clearRect(0,0,fw,fh); g.globalCompositeOperation='source-over';
      g.save(); g.translate(fx,fy); g.scale(1+p*.35,1+p*.35); g.translate(-fx,-fy); g.globalAlpha=1-Math.max(0,p-.75)*4; g.drawImage(cloud,0,0); g.restore(); g.globalAlpha=1;
      if (r>1){ g.globalCompositeOperation='destination-out';
        var hg=g.createRadialGradient(fx,fy,r*.55,fx,fy,r); hg.addColorStop(0,'rgba(0,0,0,1)'); hg.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=hg; g.beginPath(); g.arc(fx,fy,r,0,7); g.fill();
        g.fillStyle='#000'; for (var q=0;q<lobes.length;q++){ var lb=lobes[q], lr=r*.38*lb.k; g.beginPath(); g.arc(fx+Math.cos(lb.a)*r*.62, fy+Math.sin(lb.a)*r*.62, lr,0,7); g.fill(); }
        g.globalCompositeOperation='source-over';
        g.strokeStyle='rgba(255,236,190,'+(.85*(1-p*p)).toFixed(3)+')'; g.lineWidth=3; g.shadowColor='rgba(255,200,61,.9)'; g.shadowBlur=12; g.beginPath(); g.arc(fx,fy,r*.82,0,7); g.stroke(); g.shadowBlur=0; } }
    drawFog();
    var tl=G.timeline({delay:.08});
    // camera starts zoomed onto the nexus and lands on the map
    cam.fx=ax; cam.fy=ay; cam.z=1.12; applyCam(scrollY-mapTop);
    tl.to(P,{p:1,duration:1.1,ease:'lgb-iris',onUpdate:drawFog,onComplete:function(){ fc.remove(); ready(); }},0)
      .to(cam,{z:1,duration:1.4,ease:'expo.out'},.75-.35);
    // wordmark drop with landing squash
    G.set(wmChars,{visibility:'visible'});
    wmChars.forEach(function(c){ G.set(c,{yPercent:-120,opacity:0,rotation:+c.dataset.r,transformOrigin:'50% 100%'}); });
    tl.to(wmChars,{yPercent:0,opacity:1,rotation:0,duration:.6,ease:'back.out(2.2)',stagger:{each:.045,from:'edges',onComplete:function(){ G.timeline().to(this.targets()[0],{scaleY:.75,scaleX:1.12,duration:.07,ease:'power2.out'}).to(this.targets()[0],{scaleY:1.08,scaleX:.96,duration:.09,ease:'power2.out'}).to(this.targets()[0],{scaleY:1,scaleX:1,duration:.09,ease:'power2.inOut'}); }}},.5);
    var ani=$$('.hero .ani'); G.set(ani,{visibility:'visible',opacity:0,y:24});
    tl.to(ani[0],{opacity:1,y:0,duration:.6,ease:'expo.out'},.45)   // map label
      .to(ani[3],{opacity:1,y:0,duration:.5,ease:'back.out(2)'},.6)   // gates pill
      .to([ani[1],ani[2]],{opacity:1,y:0,duration:.8,ease:'expo.out',stagger:.1},.95)
      .to(ani[4],{opacity:1,y:0,duration:.6,ease:'expo.out'},1.5);
    // puppets pop onto their pedestals
    var ph=$$('.hero .pinhero'); G.set(ph,{visibility:'visible',x:0,y:0,xPercent:-50,yPercent:-50,scale:0});
    G.set($$('.hero .lid'),{x:0,y:0,xPercent:-50,yPercent:-50,scaleX:1,rotation:0,scaleY:0});
    tl.to(ph,{scale:1,duration:.6,ease:'back.out(2.4)',stagger:.08},.85);
    // countdown 3-2-1, 0.42 s beats, squash per digit
    var num=$('#gates .num');
    [3,2,1].forEach(function(n,i){ tl.add(function(){ num.textContent=n; },.85+i*.42)
      .fromTo(num,{scale:1.8,scaleY:1.8,opacity:0},{scale:1,opacity:1,duration:.24,ease:'back.out(3)'},.85+i*.42)
      .to(num,{keyframes:{scaleY:[.7,1.1,1]},duration:.16,ease:'none'},.85+i*.42+.2); });
    tl.add(function(){ openGates(false); },.85+3*.42);
    // flags snap up
    G.set($$('.plaza.cat .flag'),{rotation:-90});
    tl.to($$('.plaza.cat .flag'),{rotation:0,duration:.9,ease:'elastic.out(1,.45)',stagger:.06},.85+3*.42);
    tl.add(function(){ puppets(); }, .85+3*.42);
  }
  function openGates(quiet){ gatesOpen=true; var g=$('#gates'); g.textContent='Gates open. Push the lane!'; g.parentNode.classList.add('open');
    if (MO) G.fromTo(g.parentNode,{scale:1.12},{scale:1,duration:.5,ease:'elastic.out(1,.5)'});
    if(!quiet && LUT.n){ var exit=($('.hero .plaza').offsetWidth/2)+12; spawnWave('c', exit); spawnWave('c', exit+60); spawnT=1.2; var p=pt(0);
      burst(p.x,p.y,40,['#ec5a8d','#ffc83d','#fff'],300,200,4,1.1); ring(p.x,p.y,20,mobile?160:280,.9,'rgba(255,255,255,.9)',6,1); ring(p.x,p.y,10,mobile?110:190,.7,'rgba(236,90,141,.9)',4,1); } }

  /* ---------- puppeted heroes ---------- */
  function puppets(){
    var ph=$$('.hero .pinhero');
    ph.forEach(function(e,i){ var bob=$('.bob',e), lids=$$('.lid',e);
      if (MO){
        G.timeline().to(e,{y:-14,scaleY:1.08,scaleX:.94,duration:.18,ease:'power2.out',delay:i*.06}).to(e,{y:6,scaleY:.9,scaleX:1.08,duration:.16,ease:'power2.in'}).to(e,{y:4,scaleY:1,scaleX:1,duration:.4,ease:'elastic.out(1,.5)'});
        G.to(bob,{scaleY:1.035,duration:1.2,ease:'sine.inOut',yoyo:true,repeat:-1,delay:i*.3,transformOrigin:'50% 62%'});
        G.fromTo(bob,{rotation:-3},{rotation:3,duration:2.05,ease:'sine.inOut',yoyo:true,repeat:-1,delay:i*.5});
        (function blink(){ if (dead) return; G.timeline({delay:2+Math.random()*3,onComplete:blink}).to(lids,{scaleY:1,duration:.06,ease:'power1.in'}).to(lids,{scaleY:0,duration:.1,ease:'power1.out'}); })();
      } });
  }

  /* ---------- MO: GSAP-driven sections ---------- */
  function motion(){
    // smoothed scroll for the camera (scrub .6)
    G.fromTo(S,{y:0},{y:function(){return ST.maxScroll(W0)},ease:'none',scrollTrigger:{start:0,end:'max',scrub:.6,invalidateOnRefresh:true}});
    // kinetic wordmark: idle bob + cursor spring
    wmChars.forEach(function(c,i){ G.to($('.chi',c),{y:2,duration:1.5,ease:'sine.inOut',yoyo:true,repeat:-1,delay:-(i*.3)%3,startAt:{y:-2}}); });
    if (HOVER){ var wm=$('.wordmark'), qx=wmChars.map(function(c){return G.quickTo(c,'x',{duration:.9,ease:'elastic.out(1,.3)'})}), qy=wmChars.map(function(c){return G.quickTo(c,'y',{duration:.9,ease:'elastic.out(1,.3)'})});
      wm.addEventListener('pointermove',function(e){ wmChars.forEach(function(c,i){ var r=c.getBoundingClientRect(), dx=r.left+r.width/2-e.clientX, dy=r.top+r.height/2-e.clientY, d=Math.hypot(dx,dy)||1, k=Math.max(0,1-d/150)*8; qx[i](dx/d*k); qy[i](dy/d*k); }); });
      wm.addEventListener('pointerleave',function(){ qx.forEach(function(q){q(0)}); qy.forEach(function(q){q(0)}); }); }

    // cards: tape + wipe, tilted-paper entrance
    $$('.leg:not(.hero) .card').forEach(function(card,i){
      var tape=D.createElement('span'); tape.className='tape'; card.appendChild(tape);
      var w=D.createElement('span'); w.className='wipe'; w.setAttribute('aria-hidden','true'); w.innerHTML='<i></i><b>Captured</b>'; card.appendChild(w);
      var sgn=(card.closest('.leg').dataset.side==='R')?1:-1;
      G.fromTo(card,{rotation:4*sgn,y:40,opacity:0},{rotation:0,y:0,opacity:1,duration:.8,ease:'back.out(1.6)',scrollTrigger:{trigger:card,start:'top 88%',once:true}});
      G.fromTo(tape,{y:-30,rotation:-30*sgn,opacity:0},{y:0,rotation:-4,opacity:1,duration:.7,ease:'back.out(3)',delay:.15,scrollTrigger:{trigger:card,start:'top 88%',once:true}});
    });
    $$('.hero .card').forEach(function(card){ var tape=D.createElement('span'); tape.className='tape'; card.appendChild(tape); });
    $$('.rv').forEach(function(e){ G.fromTo(e,{opacity:0,y:28},{opacity:1,y:0,duration:.9,ease:'expo.out',delay:.2,scrollTrigger:{trigger:e,start:'top 92%',once:true}}); });
    $$('.leg:not(.hero) .maplabel').forEach(function(e){ G.fromTo(e,{opacity:0,x:-20},{opacity:1,x:0,duration:.7,ease:'expo.out',scrollTrigger:{trigger:e,start:'top 92%',once:true}}); });

    // headlines: masked lines, words rise, em lands last with punch + underline
    $$('.kin').forEach(function(h){
      var side=(h.closest('.leg')||{dataset:{}}).dataset.side==='R'?1:-1;
      var sp=SplitText.create(h,{type:'lines,words',mask:'lines',linesClass:'ln',wordsClass:'word'});
      var em=$$('em .word',h), dog=$$('.dog .word',h), plain=sp.words.filter(function(w){return em.indexOf(w)<0&&dog.indexOf(w)<0});
      em.forEach(function(w){ var s=D.createElementNS('http://www.w3.org/2000/svg','svg'); s.setAttribute('class','ul'); s.setAttribute('viewBox','0 0 100 10'); s.setAttribute('preserveAspectRatio','none'); s.setAttribute('aria-hidden','true');
        s.innerHTML='<path d="M2 6 C 25 2, 50 9, 98 4"/>'; w.appendChild(s); });
      var tl=G.timeline({scrollTrigger:{trigger:h,start:'top 86%',once:true}});
      tl.from(plain,{yPercent:110,duration:.9,ease:'expo.out',stagger:.06});
      if (dog.length) tl.from(dog,{xPercent:-60*side,yPercent:0,opacity:0,duration:.8,ease:'expo.out',stagger:.06},'-=.65');
      if (em.length){ tl.from(em,{yPercent:110,duration:.7,ease:'expo.out',stagger:.06},'-=.6')
        .fromTo(em,{scale:1.15},{scale:1,duration:.9,ease:'elastic.out(1,.5)',transformOrigin:'50% 70%'},'-=.35')
        .fromTo($$('svg.ul path',h),{drawSVG:'0%'},{drawSVG:'100%',duration:.5,ease:'power2.inOut',stagger:.1},'-=.75'); }
    });

    // bridge planks thunk down
    G.from('#bridge i',{y:-20,opacity:0,duration:.5,ease:'bounce.out',stagger:.03,scrollTrigger:{trigger:'#river',start:'top 80%',once:true}});

    // buttons: press squash + magnetic hover
    $$('.btn, .chip').forEach(function(b){
      b.addEventListener('pointerdown',function(){ G.to(b,{scale:.94,duration:.08,ease:'power2.out'}); });
      var up=function(){ G.to(b,{keyframes:{scale:[1.04,1]},duration:.35,ease:'back.out(3)'}); };
      b.addEventListener('pointerup',up);
      if (HOVER && b.classList.contains('btn')){ var mx=G.quickTo(b,'x',{duration:.5,ease:'power3.out'}), my=G.quickTo(b,'y',{duration:.5,ease:'power3.out'});
        b.addEventListener('pointermove',function(e){ var r=b.getBoundingClientRect(), dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2); mx(clamp(dx*.18,-8,8)); my(clamp(dy*.3,-8,8)); });
        b.addEventListener('pointerleave',function(){ mx(0); my(0); G.to(b,{scale:1,duration:.3}); }); }
    });
    // CTA: breathing glow
    G.to('.cta-wrap',{scale:1.035,duration:.8,ease:'sine.inOut',yoyo:true,repeat:-1});
    $$('.cta-wrap .ring').forEach(function(r,i){ G.fromTo(r,{opacity:.9,scaleX:1,scaleY:1},{opacity:0,scaleX:1.14,scaleY:1.5,duration:1.6,ease:'expo.out',repeat:-1,delay:i*.8}); });

    roster(); shelter();
  }

  /* ---------- roster: dealt from the tower, Flip filter, breathing, sheen ---------- */
  function roster(){
    var slots=$$('#grid .slot'), cards=slots.map(function(s){return $('.hc',s)}), deck=pts[3];
    var tl=G.timeline({scrollTrigger:{trigger:'#grid',start:'top 99%',end:'top 72%',scrub:.6}});
    flat(function(){ cards.forEach(function(c,i){ var r=rel(c), dx=deck.x-r.x, dy=(deck.y-60)-r.y;
      tl.fromTo(c,{x:dx,y:dy,rotation:(i%2?12:-12),scale:.35,opacity:0},{motionPath:{path:[{x:dx,y:dy},{x:dx*.5,y:Math.max(dy,0)*.5+90},{x:0,y:0}],curviness:1.25},rotation:0,scale:1,opacity:1,duration:1,ease:'power2.out',immediateRender:true},i*.05); }); });
    cards.forEach(function(c){ var img=$('.stage img',c), tw=G.to(img,{scaleY:1.0175,duration:1.2,ease:'sine.inOut',yoyo:true,repeat:-1,paused:true});
      ioT(function(es){ es[0].isIntersecting?tw.play():tw.pause(); }).observe(c);
      if (HOVER){ var rx=G.quickTo(c,'rotationX',{duration:.5,ease:'power3.out'}), ry=G.quickTo(c,'rotationY',{duration:.5,ease:'power3.out'}), ly=G.quickTo(c,'y',{duration:.4,ease:'power3.out'});
        c.addEventListener('pointermove',function(e){ var r=c.getBoundingClientRect(), x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height; ry((x-.5)*16); rx(-(y-.5)*16); ly(-4); c.style.setProperty('--mx',(x*100).toFixed(1)+'%'); c.style.setProperty('--my',(y*100).toFixed(1)+'%'); });
        c.addEventListener('pointerleave',function(){ rx(0); ry(0); ly(0); }); } });
    var grid=$('#grid');
    $$('.chip').forEach(function(ch){ ch.addEventListener('click',function(){ var r=ch.dataset.r; $$('.chip').forEach(function(x){x.setAttribute('aria-pressed', x===ch?'true':'false')});
      var state=Flip.getState(slots);
      var order=slots.slice().sort(function(a,b){ var ma=(r==='all'||a.dataset.r===r)?0:1, mb=(r==='all'||b.dataset.r===r)?0:1; return ma-mb || (+a.dataset.i)-(+b.dataset.i); });
      order.forEach(function(s){ grid.appendChild(s); });
      Flip.from(state,{duration:.55,ease:'power3.inOut'});
      slots.forEach(function(s){ var on=r==='all'||s.dataset.r===r; G.to($('.hc',s),{scale:on?1:.92,opacity:on?1:.55,filter:on?'grayscale(0) brightness(1)':'grayscale(.85) brightness(.92)',duration:.45,ease:'power3.out'}); });
    }); });
  }

  /* ---------- shelter: canvas fountain + mascot puppet ---------- */
  function shelter(){
    var fo=$('.fountain'), c=$('canvas',fo), g=c.getContext('2d'), heart=$('svg',fo), run=false, hearts=[], drops=[], t0=performance.now();
    function sz(){ c.width=Math.round(c.clientWidth*DPR); c.height=Math.round(c.clientHeight*DPR); }
    sz(); onWin('resize',sz);
    G.to(heart,{y:-4,duration:1.1,ease:'sine.inOut',yoyo:true,repeat:-1,startAt:{y:4}});
    G.timeline({repeat:-1,repeatDelay:.0}).to(heart,{scale:1.12,duration:.6,ease:'elastic.out(1,.4)',onStart:function(){ for (var i=0;i<3;i++) hearts.push({x:(Math.random()-.5)*.3,y:0,v:.25+Math.random()*.2,t:0,s:.6+Math.random()*.5}); }}).to(heart,{scale:1,duration:.6,ease:'power2.inOut'});
    function draw(now){ if (!run) return; var w=c.width, h=c.height, cxp=w/2, cyp=h/2, u=w/270, t=(now-t0)/1000; g.clearRect(0,0,w,h);
      // 3 jets
      for (var j=0;j<3;j++){ var ang=(-90+(j-1)*38)*Math.PI/180, sp=(46+Math.sin(t*3+j)*3)*u;
        g.strokeStyle='rgba(191,232,255,.85)'; g.lineWidth=3.2*u; g.lineCap='round'; g.beginPath();
        for (var k=0;k<=14;k++){ var tt=k/14*1.1, x=cxp+Math.cos(ang)*sp*tt, y=cyp-10*u+Math.sin(ang)*sp*tt+30*u*tt*tt; k?g.lineTo(x,y):g.moveTo(x,y); } g.stroke();
        if (Math.random()<.5) drops.push({x:cxp+Math.cos(ang)*sp*1.1,y:cyp-10*u+Math.sin(ang)*sp*1.1+36*u,vx:Math.cos(ang)*10*u*(Math.random()+.5),vy:-6*u,t:0}); }
      for (var d=drops.length-1;d>=0;d--){ var q=drops[d]; q.t+=1/60; q.vy+=60*u/60; q.x+=q.vx/60; q.y+=q.vy/60*4; if (q.t>.5){drops.splice(d,1);continue;} g.fillStyle='rgba(255,255,255,'+(1-q.t*2).toFixed(2)+')'; g.beginPath(); g.arc(q.x,q.y,1.6*u,0,7); g.fill(); }
      for (var hI=hearts.length-1;hI>=0;hI--){ var hh=hearts[hI]; hh.t+=1/60; if (hh.t>1.4){hearts.splice(hI,1);continue;} var hx=cxp+hh.x*w+Math.sin(hh.t*5)*4*u, hy=cyp-16*u-hh.t*h*hh.v, s=7*u*hh.s;
        g.globalAlpha=Math.max(0,1-hh.t/1.4); g.fillStyle='#ec5a8d'; g.beginPath(); g.moveTo(hx,hy+s*.9); g.bezierCurveTo(hx-s*1.4,hy,hx-s*.6,hy-s,hx,hy-s*.3); g.bezierCurveTo(hx+s*.6,hy-s,hx+s*1.4,hy,hx,hy+s*.9); g.fill(); g.globalAlpha=1; }
      rafT(draw); }
    ioT(function(es){ var v=es[0].isIntersecting; if (v&&!run){ run=true; rafT(draw);} else if(!v) run=false; }).observe(fo);
    var mh=$('.masc .mh'), mp=$('.masc .mp');
    G.timeline({repeat:-1,yoyo:true}).to(mh,{rotation:-3,duration:1.5,ease:'sine.inOut'}).to(mh,{rotation:2,duration:1.5,ease:'sine.inOut'});
    G.timeline({repeat:-1,repeatDelay:1.6}).to(mp,{y:-3,duration:.12,ease:'power2.out'}).to(mp,{y:0,duration:.18,ease:'bounce.out'}).to(mp,{y:-3,duration:.12,ease:'power2.out'}).to(mp,{y:0,duration:.18,ease:'bounce.out'});
  }

  /* ---------- practice pad ---------- */
  (function(){
    var field=$('#field'), aimG=$('#aimG'), arrow=$('#aimArrow'), end=$('#aimEnd'), proj=$('#proj'), dummyB=$('#dummyB'), msg=$('#padmsg'), pops=$('#pops'), dhp=$('#dhp'), heroB=$('#heroB'), hero=$('#hero'), ptrail=$('#ptrail'), dflash=$('#dflash');
    var shim=$('#lgb-shim'), sh=[$('#lgb-sh1'),$('#lgb-sh2'),$('#lgb-sh3')];
    var NS='http://www.w3.org/2000/svg', HX=84, HY=176, DX=310, DY=90, aiming=false, mode='line', ang=-.4, charge=0, ptr=null, tStart=0, hits=0, sweep=0, raf=0, held=null, busy=false;
    var dots=[]; for (var i=0;i<6;i++){ var c=D.createElementNS(NS,'circle'); c.setAttribute('r',6-i*.7); c.setAttribute('fill',i%2?'#ffd3e2':'#ec5a8d'); c.setAttribute('opacity',0); ptrail.appendChild(c); dots.push(c); }
    function svgPt(e){var r=field.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*400, y:(e.clientY-r.top)/r.height*250};}
    function draw(now){
      var len=(mode==='area'?210:250)*charge, ex=HX+Math.cos(ang)*len, ey=HY+Math.sin(ang)*len;
      if (mode==='area'){ arrow.setAttribute('d','M'+HX+' '+HY+' L'+ex+' '+ey); arrow.setAttribute('stroke-dasharray','6 8'); end.setAttribute('r', 34); }
      else { var w=mode==='dash'?14:11, px=-Math.sin(ang)*w, py=Math.cos(ang)*w, hx=HX+Math.cos(ang)*(len-26), hy=HY+Math.sin(ang)*(len-26);
        arrow.removeAttribute('stroke-dasharray');
        arrow.setAttribute('d','M'+(HX+px)+' '+(HY+py)+' L'+(hx+px)+' '+(hy+py)+' L'+(hx+px*2.2)+' '+(hy+py*2.2)+' L'+ex+' '+ey+' L'+(hx-px*2.2)+' '+(hy-py*2.2)+' L'+(hx-px)+' '+(hy-py)+' L'+(HX-px)+' '+(HY-py)+'Z'); end.setAttribute('r', 0.1); }
      end.setAttribute('cx',ex); end.setAttribute('cy',ey);
      // shimmer runs along the arrow; tremble at full charge
      shim.setAttribute('x2',ex); shim.setAttribute('y2',ey);
      if (!RM && now){ var o=((now/520)%1.3)-.15; sh[0].setAttribute('offset',clamp(o-.1,0,1)); sh[1].setAttribute('offset',clamp(o,0,1)); sh[2].setAttribute('offset',clamp(o+.1,0,1)); }
      if (!RM && charge>.98){ aimG.setAttribute('transform','translate('+(Math.random()*4-2).toFixed(1)+' '+(Math.random()*4-2).toFixed(1)+')'); } else aimG.removeAttribute('transform');
      if (held) held.style.setProperty('--cd',(charge*360).toFixed(0)+'deg');
    }
    function loop(now){ if(!aiming) return; var c0=Math.min(1,(now-tStart)/450); charge=1-Math.pow(1-c0,3);
      if (!ptr){ sweep+=.035; ang=Math.atan2(DY-HY,DX-HX)+Math.sin(sweep)*.35; }
      draw(now); raf=rafT(loop); }
    function start(m, e){ if (aiming||busy) return; mode=m||'line'; aiming=true; tStart=performance.now(); charge=0; sweep=0; ptr= e&&e.clientX!=null && e.currentTarget===field ? svgPt(e):null;
      if (ptr) ang=Math.atan2(ptr.y-HY,ptr.x-HX); aimG.setAttribute('opacity',1); msg.classList.remove('on');
      if (RM){ charge=1; draw(0); } else raf=rafT(loop); }
    function move(e){ if(!aiming||!ptr) return; ptr=svgPt(e); ang=Math.atan2(ptr.y-HY,ptr.x-HX); if(RM) draw(0); }
    function squash(sx,sy){ var a=ang*180/Math.PI; heroB.setAttribute('transform','rotate('+a.toFixed(1)+') scale('+sx.toFixed(3)+' '+sy.toFixed(3)+') rotate('+(-a).toFixed(1)+')'); }
    function release(){ if(!aiming) return; aiming=false; cancelAnimationFrame(raf); aimG.setAttribute('opacity',0); aimG.removeAttribute('transform');
      if (held){ var hb=held; hb.classList.remove('held'); if (MO) G.to(hb,{'--cd':'0deg',duration:.3}); else hb.style.setProperty('--cd','0deg'); if (MO) G.to(hb,{keyframes:{scale:[.9,1.06,1]},duration:.35,ease:'none'}); held=null;}
      var len=(mode==='area'?210:250)*Math.max(.35,charge), ex=HX+Math.cos(ang)*len, ey=HY+Math.sin(ang)*len;
      var vx=ex-HX, vy=ey-HY, wx=DX-HX, wy=DY-HY, t=clamp((vx*wx+vy*wy)/(vx*vx+vy*vy),0,1), cxp=HX+vx*t, cyp=HY+vy*t, dist=Math.hypot(DX-cxp,DY-cyp);
      var hit = mode==='area' ? Math.hypot(DX-ex,DY-ey)<52 : dist<34;
      var stop = hit? (mode==='area'?1:Math.min(1,t+.02)) : 1;
      if (RM || !MO){ proj.setAttribute('opacity',0); land(hit, HX+vx*stop, HY+vy*stop); return; }
      busy=true;
      // squash, then stretch along the aim
      var sq={x:1,y:1}; G.timeline({onUpdate:function(){squash(sq.x,sq.y)}}).to(sq,{x:.85,y:.85,duration:.06,ease:'power2.in'}).to(sq,{x:1.1,y:.92,duration:.1,ease:'power2.out'}).to(sq,{x:1,y:1,duration:.4,ease:'elastic.out(1,.4)'});
      var P={k:0}, hist=[], dur=(mode==='dash'?.26:.38);
      if (mode!=='dash') proj.setAttribute('opacity',1);
      G.to(P,{k:stop,duration:dur,ease:'power3.out',delay:.06,onUpdate:function(){ var kk=P.k, x=HX+vx*kk, y=HY+vy*kk-(mode==='area'?Math.sin(kk/stop*Math.PI)*60:0);
          if (mode==='dash') hero.setAttribute('transform','translate('+x.toFixed(1)+' '+y.toFixed(1)+')'); else proj.setAttribute('transform','translate('+x.toFixed(1)+' '+y.toFixed(1)+')');
          hist.unshift([x,y]); for (var i=0;i<dots.length;i++){ var h=hist[Math.min(hist.length-1,(i+1)*2)]; dots[i].setAttribute('cx',h[0]); dots[i].setAttribute('cy',h[1]); dots[i].setAttribute('opacity',(mode==='dash'?.5:.85)*(1-i/dots.length)); } },
        onComplete:function(){ var x=HX+vx*stop, y=HY+vy*stop;
          // 80 ms hit-stop before the impact plays out
          G.delayedCall(hit?.08:0,function(){ proj.setAttribute('opacity',0); G.to(dots,{attr:{opacity:0},duration:.2}); land(hit,x,y); busy=false; }); }});
    }
    function land(hit,x,y){
      if (mode==='dash'){ if (MO) G.delayedCall(.35,function(){ var o={x:x,y:y}; G.to(o,{x:HX,y:HY,duration:.5,ease:'back.out(1.6)',onUpdate:function(){hero.setAttribute('transform','translate('+o.x.toFixed(1)+' '+o.y.toFixed(1)+')')}}); }); else hero.setAttribute('transform','translate('+HX+' '+HY+')'); }
      var ring=D.createElementNS(NS,'circle'); ring.setAttribute('cx',x); ring.setAttribute('cy',y); ring.setAttribute('r',6); ring.setAttribute('fill','none'); ring.setAttribute('stroke', hit?'#ffc83d':'#ec5a8d'); ring.setAttribute('stroke-width',4); pops.appendChild(ring);
      var tx=D.createElementNS(NS,'text'); tx.setAttribute('x',hit?DX:x); tx.setAttribute('y',(hit?DY:y)-36); tx.setAttribute('text-anchor','middle'); tx.setAttribute('style','font:700 22px var(--disp);fill:'+(hit?'#bf2f63':'#56424f')+';paint-order:stroke;stroke:#fff;stroke-width:5px'); tx.textContent=hit?'HIT!':'miss'; pops.appendChild(tx);
      if (MO){ G.to(ring,{attr:{r:46},opacity:0,duration:.6,ease:'expo.out',onComplete:function(){ring.remove()}});
        var vxp=(Math.random()-.5)*60, o={y:0,x:0,vy:-120};
        G.fromTo(tx,{scale:.2,transformOrigin:'50% 100%'},{scale:1,duration:.4,ease:'back.out(3)'});
        G.to(o,{duration:.9,onUpdate:function(){ var dt=1/60; o.vy+=420*dt; o.y+=o.vy*dt; o.x+=vxp*dt; tx.setAttribute('transform','translate('+o.x.toFixed(1)+' '+o.y.toFixed(1)+')'); },onComplete:function(){tx.remove()}});
        G.to(tx,{opacity:0,duration:.3,delay:.6}); }
      else { later(function(){ring.remove(); tx.remove();},900); }
      if (hit){ hits++;
        if (MO){ G.fromTo(dflash,{attr:{opacity:.95}},{attr:{opacity:0},duration:.18,ease:'power1.in'});
          if (hits%5===0){ G.timeline().to(dummyB,{rotation:90,svgOrigin:'0 30',duration:.45,ease:'bounce.out'}).to(dummyB,{rotation:0,svgOrigin:'0 30',duration:.6,ease:'back.out(2)',delay:.7}).add(function(){dhp.setAttribute('width',46)}); }
          else G.timeline().to(dummyB,{rotation:12,x:8,svgOrigin:'0 30',duration:.08}).to(dummyB,{rotation:0,x:0,svgOrigin:'0 30',duration:.5,ease:'elastic.out(1,.35)'}); }
        var w=Math.max(0,46-(hits%5)*9.2); if (MO) G.to(dhp,{attr:{width:w||0},duration:.25,ease:'power2.out'}); else dhp.setAttribute('width', w||46);
        msg.textContent = hits===1?'Nice. Now try the others.':(hits%5===0?'Knocked over!':hits+' hits'); }
      else msg.textContent='Missed. Hold, aim, release.';
      msg.classList.add('on'); }
    field.addEventListener('pointerdown',function(e){ e.preventDefault(); field.setPointerCapture&&field.setPointerCapture(e.pointerId); start('line',e); });
    field.addEventListener('pointermove',move);
    field.addEventListener('pointerup',release); field.addEventListener('pointercancel',release);
    $$('.sk').forEach(function(b){
      b.addEventListener('pointerdown',function(e){ e.preventDefault(); held=b; b.classList.add('held'); if (MO) G.to(b,{scale:.9,duration:.08}); start(b.dataset.k,null); });
      b.addEventListener('pointerup',release); b.addEventListener('pointerleave',function(){ if(held===b) release(); });
      b.addEventListener('keydown',function(e){ if((e.key===' '||e.key==='Enter')&&!e.repeat){ e.preventDefault(); held=b; b.classList.add('held'); start(b.dataset.k,null);} });
      b.addEventListener('keyup',function(e){ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); release(); } });
      b.addEventListener('click',function(e){ e.preventDefault(); });
      if (MO && HOVER){ var mx=G.quickTo(b,'x',{duration:.4,ease:'power3.out'}), my=G.quickTo(b,'y',{duration:.4,ease:'power3.out'});
        b.addEventListener('pointermove',function(e){ var r=b.getBoundingClientRect(); mx(clamp((e.clientX-r.left-r.width/2)*.25,-6,6)); my(clamp((e.clientY-r.top-r.height/2)*.25,-6,6)); });
        b.addEventListener('pointerleave',function(){ mx(0); my(0); }); }
    });
    onDoc('keydown',function(e){ var k=e.key&&e.key.toLowerCase(); var m={q:'line',w:'area',e:'dash'}[k]; if(!m||e.repeat||e.metaKey||e.ctrlKey) return; var pr=$('#pad').getBoundingClientRect(); if(pr.bottom<0||pr.top>innerHeight) return; if (/INPUT|TEXTAREA/.test(D.activeElement.tagName)) return; held=$('.sk[data-k='+m+']'); held.classList.add('held'); start(m,null); });
    onDoc('keyup',function(e){ var k=e.key&&e.key.toLowerCase(); if({q:1,w:1,e:1}[k]) release(); });
  })();

  /* ---------- static (reduced motion / no GSAP) roster filter ---------- */
  if (!MO) $$('.chip').forEach(function(c){ c.addEventListener('click',function(){ var r=c.dataset.r; $$('.chip').forEach(function(x){x.setAttribute('aria-pressed', x===c?'true':'false')});
    $$('#grid .slot').forEach(function(h){ $('.hc',h).classList.toggle('dim', r!=='all' && h.dataset.r!==r); }); }); });
  $$('.tower').forEach(function(t){ var rb=$('.rubble',t); for (var i=0;i<8;i++){ var b=D.createElement('b'); var a=i/8*Math.PI*2+.3; b.style.setProperty('--x',(Math.cos(a)*(26+i*3))+'px'); b.style.setProperty('--y',(Math.sin(a)*(14+i*2))+'px'); b.style.setProperty('--r',(i*47)+'deg'); rb.appendChild(b);} });

  /* ---------- pin the dog base while its HP drains ---------- */
  function makePin(){
    if (finalST){ finalST.kill(true); finalST=null; }
    if (!MO) return;
    if (finalSec.offsetHeight > innerHeight-8) return;
    finalST = ST.create({trigger:finalSec, start: innerWidth<=760 ? 'top top' : 'center center', end:'+='+Math.round(innerHeight*.6), pin:true, pinSpacing:true, anticipatePin:1});
  }

  /* ---------- boot ---------- */
  function boot(){
    size(); mmSize();
    if (MO){ onRefreshInit=function(){ map.style.transform=''; lastMapT=''; }; ST.addEventListener('refreshInit',onRefreshInit); makePin(); ST.refresh(); }
    layout();
    if (MO) motion();
    intro();
    if (RM){ onWin('scroll',function(){ if(LUT.n) staticFrame(); },{passive:true}); staticFrame(); }
    else rafT(frame);
  }
  var rT, lastW=innerWidth; onWin('resize',function(){ clearTimeout(rT); rT=later(function(){ size(); mmSize(); if (MO && Math.abs(innerWidth-lastW)>40){ lastW=innerWidth; ctx.add(makePin); ST.refresh(); } layout(); if(RM) staticFrame(); },150); });
  function relayout(){ if (MO) ST.refresh(); layout(); }
  if (D.fonts && D.fonts.ready) D.fonts.ready.then(function(){ later(relayout,60); });
  if (D.readyState !== 'complete') onWin('load',function(){ relayout(); });
  boot();

  /* ---------- minimap: hidden over the footer, and on phones over the two bases ---------- */
  (function(){ var m=$('#mini'); if(!m||!('IntersectionObserver' in W0)) return; var on={};
    function upd(){ var ph=innerWidth<=760; m.classList.toggle('off',!!(on.foot||(ph&&(on.hero||on.final)))); }
    function watch(sel,key,mg){ var el=$(sel); if(!el) return; ioT(function(es){ on[key]=es[0].isIntersecting; upd(); },{rootMargin:mg||'0px'}).observe(el); }
    watch('.foot','foot'); watch('.hero','hero','0px 0px -45% 0px'); watch('.final','final','0px 0px -25% 0px'); onWin('resize',upd); })();
  }
}
