import{l as e}from"./xp-BNTUdF09.js";import{St as t,at as n,xt as r}from"./three-BaO1HYE_.js";import{at as i,c as a,it as o,rt as s,st as c,x as l}from"./charMaterial-Du6afg1v.js";import"./domino-DlExLy4O.js";import{r as u}from"./palette-A15ugDKM.js";import{n as d}from"./api-Dq3FoNgT.js";import{D as f,O as p,b as m,h}from"./rig-jfW0VPKl.js";import{C as g,D as _,F as v,M as y,O as b,x}from"./fixed-CUxwLYD1.js";import{p as S}from"./common-Bk_vEhCD.js";import{t as C}from"./models-DnAvkpFy.js";import{c as ee,n as w}from"./talents-CRhaUp1L.js";import{nn as T,r as E}from"./index-BVnio3p7.js";var D=Object.freeze({low:Object.freeze({particles:800,countScale:.6,trailHz:15,debris:.45,extras:!1,lightning:5,cracks:0}),med:Object.freeze({particles:1600,countScale:1,trailHz:30,debris:.8,extras:!0,lightning:8,cracks:2}),high:Object.freeze({particles:2e3,countScale:1,trailHz:45,debris:1,extras:!0,lightning:12,cracks:4})}),O=Object.freeze([4,7,10]);function k(e){let t=0;for(let n of O)e>=n&&t++;return t}function te(e,t){return t<0||t>3?1:1+.18*Math.max(0,w(e,t)-1)}var A=(e,t)=>t>=0&&t<=3&&w(e,t)>=ee(t);function j(e){return Math.min(2.4,Math.max(.5,Math.sqrt(Math.max(0,e)/120)))}function ne(e,t,n){return n?e>=260||e>=150&&t>0&&e*100>=t*16:!1}var M=t=>l[e[t].element],re=t=>e[t].base.range<=2e3;function N(e,t){let n=M(e);return!t&&a(n)?s(n,16777215,.7):n}var P=[`grass`,`dirt`,`water`,`wood`,`stone`],F=Object.freeze({grass:Object.freeze({chip:7323477,shape:c.FEATHER,dust:12904102,dustAlpha:.45}),dirt:Object.freeze({chip:12753500,shape:c.SHARD,dust:15389600,dustAlpha:.6}),water:Object.freeze({chip:10476799,shape:c.DROPLET,dust:15924223,dustAlpha:.6}),wood:Object.freeze({chip:10119742,shape:c.SHARD,dust:14268810,dustAlpha:.5}),stone:Object.freeze({chip:11775138,shape:c.SHARD,dust:15262422,dustAlpha:.55})}),I=Math.round(b.width/1e3),L=Math.round(b.height/1e3),R=null,z=null;function B(e,t,n,r,i,a){let o=i-n,s=a-r,c=Math.max(0,Math.min(1,((e-n)*o+(t-r)*s)/(o*o+s*s||1)));return Math.hypot(e-(n+o*c),t-(r+s*c))}function ie(){if(I=Math.round(b.width/1e3),L=Math.round(b.height/1e3),b.point===1)return ae();let e=new Uint8Array(I*L),t=b.width/1e3,n=[];for(let e of[`sunny`,`puddle`]){let r=_[e].map(([e,t])=>[e/1e3,t/1e3]),i=[...r,...r.map(([e,n])=>[t-e,n]).reverse().slice(1)];n.push(i.flat())}let r=b.laneWidth/2e3,[i,a]=[b.riverX[0]/1e3,b.riverX[1]/1e3],[o,s,c,l]=y.base.map(e=>e/1e3),u=[v.x/1e3,v.y/1e3];for(let d=0;d<L;d++)for(let f=0;f<I;f++){let p=f+.5,m=d+.5,h=!1;for(let e of n){for(let t=0;t+3<e.length&&!h;t+=2)B(p,m,e[t],e[t+1],e[t+2],e[t+3])<=r&&(h=!0);if(h)break}let g=`grass`;p>=i&&p<=a?g=h?`wood`:`water`:p>=o&&p<=c&&m>=s&&m<=l||t-p>=o&&t-p<=c&&m>=s&&m<=l?g=`stone`:(h||Math.hypot(p-u[0],m-u[1])<=5.5||Math.hypot(t-p-u[0],m-u[1])<=5.5)&&(g=`dirt`),e[d*I+f]=P.indexOf(g)}return e}function ae(){let e=new Uint8Array(I*L),t=b.width/1e3,n=b.height/1e3,r=[],i=Object.keys(_);for(let e of i){let i=_[e].map(([e,t])=>[e/1e3,t/1e3]);r.push([...i,...i.map(([e,r])=>[t-e,n-r]).reverse().slice(1)].flat())}let a=b.laneWidth/2e3,o=[[g.x/1e3,g.y/1e3,g.radius/1e3+1.5],[x.x/1e3,x.y/1e3,6]];for(let i=0;i<L;i++)for(let s=0;s<I;s++){let c=s+.5,l=i+.5,u=!1;for(let e of r){for(let t=0;t+3<e.length&&!u;t+=2)B(c,l,e[t],e[t+1],e[t+2],e[t+3])<=a&&(u=!0);if(u)break}let d=`grass`;Math.abs(c+l-t)<=7.07?d=u?`wood`:`water`:o.some(([e,r,i])=>Math.hypot(c-e,l-r)<=i||Math.hypot(t-c-e,n-l-r)<=i)?d=`stone`:u&&(d=`dirt`),e[i*I+s]=P.indexOf(d)}return e}function V(e,t){z!==b&&(R=null,z=b),R??=ie();let n=Math.floor(e),r=Math.floor(-t);return n<0||r<0||n>=I||r>=L?`grass`:P[R[r*I+n]]}var H=class{additive=!1;n=6;exact=!1;shape=c.SOFT;color=16777215;intensity=1;size=[.1,.2];sizeEnd=1;life=[.3,.5];speed=[1,2];dir=void 0;spread=Math.PI;gravity=0;drag=0;spin=0;stretch=1;fade=o.LINEAR;grow=i.LINEAR;jitter=0;up=0;floor=!1;alpha=1;tint=0;bounce=.3;r0=.2;y=.05;reset(){return this.additive=!1,this.n=6,this.exact=!1,this.shape=c.SOFT,this.color=16777215,this.intensity=1,this.sizes(.1,.2),this.sizeEnd=1,this.lives(.3,.5),this.speeds(1,2),this.dir=void 0,this.spread=Math.PI,this.gravity=0,this.drag=0,this.spin=0,this.stretch=1,this.fade=o.LINEAR,this.grow=i.LINEAR,this.jitter=0,this.up=0,this.floor=!1,this.alpha=1,this.tint=0,this.bounce=.3,this.r0=.2,this.y=.05,this}sizes(e,t){return this.size[0]=e,this.size[1]=t,this}lives(e,t){return this.life[0]=e,this.life[1]=t,this}speeds(e,t){return this.speed[0]=e,this.speed[1]=t,this}},U=class{shape=c.SOFT;color=16777215;intensity=1;size0=.5;size1=.5;life=.2;grow=i.OUT;fade=o.LINEAR;rot=0;spin=0;alpha=1;vx=0;vy=0;vz=0;additive=!0;reset(){return this.shape=c.SOFT,this.color=16777215,this.intensity=1,this.size0=this.size1=.5,this.life=.2,this.grow=i.OUT,this.fade=o.LINEAR,this.rot=this.spin=0,this.alpha=1,this.vx=this.vy=this.vz=0,this.additive=!0,this}},W=new r,G=new r,K=new r,q=new r(0,1,0),oe={},J=e=>oe[e]??=`#`+e.toString(16).padStart(6,`0`),Y=6,se=class{particles;shock;tier=D.med;tierName=`med`;reduced=!1;auras=new h(m(),12,{additive:!0,y:.042,renderOrder:1,name:`level-aura`});peak=0;time=0;moteT=new Float32Array(Y);o=new H;s=new U;constructor(e,t){this.particles=e,this.shock=t}setTier(e,t=this.reduced){this.tier=D[e],this.tierName=e,this.reduced=t,this.particles.setBudget(this.tier.particles),this.particles.setTier({countScale:this.tier.countScale*(t?E:1),flat:e===`low`||t})}get scale(){return this.tier.countScale*(this.reduced?E:1)}rnd(){return this.particles.rng()}impact(e,t,n,r,i){let a=j(t),o=this.o.reset();o.additive=!0,o.n=Math.round(4+6*a),o.shape=c.SPARK,o.color=n,o.intensity=1.8+.2*a,o.sizes(.07,.12+.04*a),o.lives(.16,.26+.05*a),o.speeds(2.5+a,5+2.5*a),o.stretch=2.6,o.drag=4,o.gravity=6,this.particles.burst(e,o);let s=this.s.reset();if(s.shape=c.STAR4,s.color=16774874,s.intensity=2,s.size0=.45+.35*a,s.size1=.1,s.life=.12+.02*a,s.rot=this.rnd()*3,this.particles.single(e,s),r||a>1.3){let t=this.s.reset();t.shape=c.RING,t.color=n,t.intensity=1.5,t.size0=.3,t.size1=1.1+.6*a,t.life=.22,t.alpha=.85,this.particles.single(e,t)}i&&this.bigHit(e,n)}bigHit(e,t){let n=this.s.reset();n.shape=c.STAR8,n.color=t,n.intensity=2.2,n.size0=2.2,n.size1=.4,n.life=.2,n.rot=this.rnd()*6,n.spin=this.reduced?0:4,this.particles.single(e,n);let r=this.s.reset();r.shape=c.STAR4,r.color=16777215,r.intensity=2.6,r.size0=1.5,r.size1=.2,r.life=.14,this.particles.single(e,r);let i=this.o.reset();i.additive=!0,i.n=10,i.shape=c.STAR4,i.color=t,i.intensity=2,i.sizes(.16,.26),i.lives(.25,.4),i.speeds(4,7),i.drag=5,i.up=.5,this.particles.burst(e,i)}slash(e,t,n,r,i,a,o,l=1,u=1.1){let d=Math.max(5,Math.round(9*l*this.scale)),f=s(a,16777215,.55),p=this.reduced?0:3*l;for(let s=0;s<d;s++){let m=s/(d-1),h=n+o*(m-.5)*i,g=Math.cos(h),_=-Math.sin(h),v=Math.sin(m*Math.PI);W.set(e+g*r,u+m*.3,t+_*r);let y=this.s.reset();y.shape=c.SOFT,y.color=a,y.intensity=1.3,y.size0=(.6+.5*v)*l,y.size1=.1,y.life=.12+m*.12,y.alpha=.55,y.vx=-_*o*p,y.vz=g*o*p,this.particles.single(W,y),W.set(e+g*(r+.15*l),u+m*.3,t+_*(r+.15*l));let b=this.s.reset();b.shape=c.SOFT,b.color=f,b.intensity=2,b.size0=(.28+.22*v)*l,b.size1=.05,b.life=.1+m*.1,b.alpha=.95,b.vx=y.vx,b.vz=y.vz,this.particles.single(W,b)}let m=n+o*.5*i;W.set(e+Math.cos(m)*r,u+.3,t-Math.sin(m)*r);let h=this.s.reset();h.shape=c.STAR4,h.color=16777215,h.intensity=2,h.size0=.5*l,h.size1=.05,h.life=.16,h.rot=this.rnd()*3,this.particles.single(W,h)}trail(e,t,n,r){let i=this.o.reset();i.additive=!0,i.n=1,i.exact=!0,i.shape=c.SOFT,i.color=t,i.intensity=1.5,i.sizes(n,n*1.4),i.sizeEnd=.2,i.lives(.18,.3),i.speeds(.1,.4),this.particles.burst(e,i),r&&this.tier.extras&&!this.reduced&&(i.shape=c.SPARK,i.color=s(t,16777215,.4),i.intensity=2,i.sizes(.05,.09),i.sizeEnd=1,i.lives(.25,.4),i.speeds(.6,1.4),i.gravity=4,i.stretch=2,this.particles.burst(e,i))}dash(e,t,n,r,i,a=1){let o=Math.hypot(n-e,r-t);if(!(o>.05))return;K.set((n-e)/o,0,(r-t)/o);let s=Math.max(4,Math.round(10*this.scale)),l=this.o.reset();l.additive=!0,l.n=1,l.exact=!0,l.shape=c.SPARK,l.color=i,l.intensity=2,l.sizes(.1*a,.16*a),l.lives(.2,.3),l.speeds(this.reduced?1:7,this.reduced?2:10),l.dir=K,l.spread=.06,l.stretch=3.5,l.drag=7;for(let o=0;o<s;o++){let u=o/(s-1);W.set(e+(n-e)*u,.6+this.rnd()*.6,t+(r-t)*u),this.particles.burst(W,l);let d=this.s.reset();d.shape=c.SOFT,d.color=i,d.intensity=1.2,d.size0=1.1*a,d.size1=.2,d.life=.2+u*.15,d.alpha=.5,W.y=.9,this.particles.single(W,d)}this.debris(e,t,.7*a)}debris(e,t,n=1){if(this.tier.debris<=0)return;let r=V(e,t),i=F[r];W.set(e,.15,t);let a=this.o.reset();a.n=Math.max(1,Math.round((3+5*n)*this.tier.debris)),a.shape=i.shape,a.color=i.chip,a.tint=.2,a.sizes(.07+.02*n,.13+.04*n),a.lives(.5,.85),a.speeds(1.4,2.6+1.4*n),a.dir=q,a.spread=1.2,a.up=1.5+n,a.gravity=r===`water`?10:13,a.drag=.4,a.spin=r===`grass`?6:10,a.fade=o.HOLD,a.floor=!0,a.bounce=r===`water`?0:.35,a.jitter=.25,this.particles.burst(W,a);let s=this.o.reset();if(s.n=Math.max(1,Math.round((2+3*n)*this.tier.debris)),s.shape=c.PUFF,s.color=i.dust,s.alpha=i.dustAlpha,s.sizes(.3,.5),s.sizeEnd=2,s.lives(.35,.6),s.speeds(.6,1.6),s.up=.4,s.drag=3,s.jitter=.3,W.y=.2,this.particles.burst(W,s),r===`water`){let e=this.s.reset();e.shape=c.RING,e.color=15399167,e.intensity=1.2,e.size0=.4,e.size1=1.8+n,e.life=.35,e.alpha=.7,W.y=.08,this.particles.single(W,e)}}pillar(e,t,n,r=1){W.set(e,.2,t);let i=this.o.reset();i.additive=!0,i.n=Math.round(14*r),i.shape=c.SOFT,i.color=n,i.intensity=1.8,i.sizes(.5*r,.9*r),i.sizeEnd=.3,i.lives(.45,.75),i.speeds(this.reduced?2:5,this.reduced?3:9),i.dir=q,i.spread=.12,i.drag=2.2,i.jitter=.35,this.particles.burst(W,i),W.y=3.6*r;let a=this.s.reset();a.shape=c.STAR8,a.color=s(n,16777215,.4),a.intensity=2.2,a.size0=.4,a.size1=2.2*r,a.life=.4,a.fade=o.POP,a.spin=this.reduced?0:2,this.particles.single(W,a)}ultimateMark(e,t,n,r){W.set(e,0,t),this.shock.start(W,{r1:3.2,dur:.38,color:J(r),height:.8,intensity:1.4}),W.set(e,.15,t);let i=this.o.reset();i.additive=!0,i.n=14,i.shape=c.STAR4,i.color=n,i.intensity=1.6,i.sizes(.25,.4),i.sizeEnd=1,i.lives(.35,.55),i.speeds(3,5),i.up=1.2,i.drag=3,i.r0=.5,i.alpha=.9,this.particles.ring(W,i)}ultimate(e,t,n,r,i,a=1){W.set(e,0,t);let o=Math.min(9,Math.max(3.5,i))*(.85+.15*a);this.shock.start(W,{r1:o,dur:.45,color:J(r),height:1.1,intensity:1.6}),this.shock.start(W,{r1:o*.6,dur:.3,color:J(n),height:.6}),this.pillar(e,t,n,1+.25*(a-1)),W.set(e,.15,t);let s=this.o.reset();s.additive=!0,s.n=Math.round(24*a),s.shape=c.STAR4,s.color=n,s.intensity=1.8,s.sizes(.3,.5),s.sizeEnd=1,s.lives(.45,.7),s.speeds(4,7),s.up=1.4,s.drag=3,s.r0=.6,s.alpha=.95,this.particles.ring(W,s);let l=this.reduced?0:this.tier.cracks;for(let e=0;e<l;e++){let t=e/l*Math.PI*2+this.rnd()*.6;K.set(Math.cos(t),0,Math.sin(t)),this.shock.crack(W,K,{length:o*.55,width:.7,color:J(n),travel:.14,life:.5})}this.debris(e,t,1.6)}lightning(e,t,n,r,i,a,s){let l=this.tier.lightning,u=r-e,d=i-t,f=a-n,p=Math.sqrt(u*u+d*d+f*f);if(!(p>.1))return;K.set(a-n,0,-(r-e)),K.lengthSq()<1e-6&&K.set(1,0,0),K.normalize();let m=Math.min(.9,p*.12),h=e,g=t,_=n,v=this.reduced?.22:.14;for(let u=1;u<=l;u++){let d=u/l,f=u===l?0:(this.rnd()*2-1)*m,p=e+(r-e)*d+K.x*f,y=t+(i-t)*d+(this.rnd()-.5)*m*.5,b=n+(a-n)*d+K.z*f;for(let e=0;e<3;e++){let t=(e+.5)/3;W.set(h+(p-h)*t,g+(y-g)*t,_+(b-_)*t);let n=this.s.reset();n.shape=c.SOFT,n.color=s,n.intensity=2.2,n.size0=.42,n.size1=.12,n.life=v+this.rnd()*.05,n.fade=this.reduced?o.LINEAR:o.TWINKLE,this.particles.single(W,n);let r=this.s.reset();r.shape=c.SOFT,r.color=16777215,r.intensity=2.6,r.size0=.16,r.size1=.05,r.life=v,this.particles.single(W,r)}h=p,g=y,_=b}G.set(r,i,a);let y=this.s.reset();y.shape=c.STAR8,y.color=s,y.intensity=2.4,y.size0=1.4,y.size1=.2,y.life=.18,this.particles.single(G,y)}levelSpike(e,t,n,r){let i=k(n);if(i===0||!O.includes(n))return;let a=.8+.2*i;W.set(e,0,t),this.shock.start(W,{r1:3+i,dur:.45,color:J(r),height:.5+.2*i}),this.pillar(e,t,r,a),W.set(e,.4,t);let o=this.o.reset();o.additive=!0,o.n=10+6*i,o.shape=c.STAR5,o.color=r,o.intensity=2,o.sizes(.2,.34),o.lives(.6,1),o.speeds(2,4),o.up=4.5,o.gravity=6,this.particles.burst(W,o)}rankFlourish(e,t,n){W.set(e,.3,t);let r=this.o.reset();r.additive=!0,r.n=12,r.shape=c.STAR4,r.color=s(n,16777215,.35),r.intensity=2,r.sizes(.16,.26),r.sizeEnd=.4,r.lives(.35,.55),r.speeds(1.6,2.6),r.up=1.6,r.drag=2,r.r0=.5,r.alpha=1,this.particles.ring(W,r)}update(e,t,n){this.time+=e;let r=this.particles.live;r>this.peak&&(this.peak=r);let i=this.auras;i.begin();for(let r=0;r<t.length;r++){let a=t[r];if(a.kind!==`hero`||!a.hero||a.state===`dead`||(a.buffs&d.Stealth)!==0)continue;let s=k(a.level??1);if(s===0)continue;let l=f(a.fx),u=p(a.fy),m=N(a.hero,a.id===n),h=C[a.hero]*1.32,g=this.reduced?0:Math.sin(this.time*(2+s)+a.id);if(i.add(l,u,h*(1+.03*g),m,.22+.12*s+.05*g),s>=2&&i.add(l,u,h*(1.12+(this.reduced?0:(this.time*.6+a.id*.17)%1*.25)),m,.18+.06*s),!this.tier.extras||this.reduced||s<2||a.id<0||a.id>=Y||(this.moteT[a.id]-=e,this.moteT[a.id]>0))continue;this.moteT[a.id]=s>=3?.18:.32;let _=this.rnd()*Math.PI*2;W.set(l+Math.cos(_)*h*.5,.2,u+Math.sin(_)*h*.5);let v=this.s.reset();v.shape=c.STAR4,v.color=m,v.intensity=1.6,v.size0=.16,v.size1=.06,v.life=.7,v.vy=1.6,v.fade=o.IN_OUT,this.particles.single(W,v)}i.end()}dispose(){this.auras.dispose()}},ce=Object.freeze({crescent:0,arc:1,ring:2,dome:3,wall:4,beam:5,pillar:6,twister:7,curtain:8,heart:9,chain:10,meteor:11,glow:12,crackStar:20,crackLine:21,scorch:22,scratches:23,crater:24,petals:25}),le=`
attribute float aKind;
attribute float aT;
attribute float aAlpha;
attribute float aSeed;
attribute float aRel;
attribute vec3 aColor;
attribute vec3 aRim;
attribute vec4 aParams;
varying vec2 vUv;
varying float vKind;
varying float vT;
varying float vAlpha;
varying float vSeed;
varying float vRel;
varying vec3 vColor;
varying vec3 vRim;
varying vec4 vParams;
varying vec3 vWorld;
varying float vFres;
void main() {
  vUv = uv;
  vKind = aKind;
  vT = aT;
  vAlpha = aAlpha;
  vSeed = aSeed;
  vRel = aRel;
  vColor = aColor;
  vRim = aRim;
  vParams = aParams;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vec3 v = normalize(cameraPosition - w.xyz);
  vFres = 1.0 - abs(dot(n, v));
  gl_Position = projectionMatrix * viewMatrix * w;
}`,ue=`
uniform float uTime;
uniform vec4 uTele[4];
uniform float uFadeOwn;
varying vec2 vUv;
varying float vKind;
varying float vT;
varying float vAlpha;
varying float vSeed;
varying float vRel;
varying vec3 vColor;
varying vec3 vRim;
varying vec4 vParams;
varying vec3 vWorld;
varying float vFres;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n21(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float band(float x, float a, float b, float s) { return smoothstep(a - s, a, x) * (1.0 - smoothstep(b, b + s, x)); }
void main() {
  float k = floor(vKind + 0.5);
  float t = clamp(vT, 0.0, 1.0);
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float a = 0.0;
  float edge = 0.0;
  float fade = 1.0 - smoothstep(0.55, 1.0, t);
  if (k < 0.5 || (k > 0.5 && k < 1.5)) {
    // crescent / arc: a slash sweeping the exact arc (p0) between inner (p1) and the rim, side p2
    float halfArc = vParams.x * 0.5;
    float side = vParams.z >= 0.0 ? 1.0 : -1.0;
    float sweep = k < 0.5 ? smoothstep(0.0, 0.4, t) : 1.0;
    float lead = mix(-halfArc, halfArc, sweep) * side;
    float from = -halfArc * side;
    float lo = min(from, lead), hi = max(from, lead);
    float inArc = band(ang, lo, hi, 0.05);
    float rad = band(r, vParams.y, 1.0, 0.04);
    float near = 1.0 - clamp(abs(ang - lead) / max(0.2, vParams.x * 0.6), 0.0, 1.0);
    float noise = 0.75 + 0.5 * n21(vec2(ang * 6.0, r * 8.0 + vSeed * 13.0 - uTime * 2.0));
    a = inArc * rad * (0.35 + 0.9 * near * near) * noise * fade;
    edge = smoothstep(0.82, 1.0, r);
  } else if (k < 2.5) {
    // ring: an expanding wave from p1 (inner share) to the rim
    float R = mix(vParams.y, 1.0, 1.0 - pow(1.0 - t, 3.0));
    float w = 0.05 + 0.08 * (1.0 - t);
    a = band(r, R - w, R, 0.03) * (1.0 - t) * (r < 1.0 ? 1.0 : 0.0);
    edge = 1.0 - smoothstep(0.0, w, R - r);
  } else if (k < 3.5) {
    // dome: fresnel shell with a hex-ish pattern, rising with overshoot
    float hex = 0.6 + 0.4 * abs(sin(vUv.x * 60.0 + vUv.y * 10.0) * sin(vUv.y * 24.0));
    float rise = smoothstep(0.0, 0.12, t);
    a = (0.15 + 0.85 * pow(vFres, 2.0)) * hex * rise * fade * step(vUv.y, rise * 1.04);
    edge = pow(vFres, 4.0);
  } else if (k < 4.5) {
    // wall band: the front arc (p0) of a cylinder, a shimmer
    float u = abs(fract(vUv.x + 0.25) * 2.0 - 1.0) * 3.14159;
    float inArc = 1.0 - smoothstep(vParams.x * 0.5 - 0.05, vParams.x * 0.5, u);
    float sh = 0.6 + 0.4 * sin(vUv.y * 20.0 - uTime * 6.0 + vUv.x * 30.0);
    a = inArc * (1.0 - vUv.y) * sh * fade * (0.5 + vParams.w);
    edge = smoothstep(0.75, 1.0, 1.0 - vUv.y);
  } else if (k < 5.5 || (k > 9.5 && k < 11.5)) {
    // beam (5), chain (10), meteor (11): a quad along +x, v across
    float across = abs(vUv.y - 0.5) * 2.0;
    float core = exp(-across * across * 7.0);
    float grow = smoothstep(0.0, 0.08, t);
    float scroll = 0.7 + 0.3 * n21(vec2(vUv.x * 18.0 - uTime * 9.0, vUv.y * 3.0 + vSeed));
    if (k < 5.5) a = core * scroll * grow * fade * step(vUv.x, grow + 0.001);
    else if (k < 10.5) {
      float link = abs(fract(vUv.x * max(2.0, vParams.x)) - 0.5) * 2.0;
      a = smoothstep(0.55, 0.75, link) * (1.0 - smoothstep(0.6, 0.9, across)) * fade;
    } else a = core * pow(vUv.x, 2.0) * fade;
    edge = smoothstep(0.5, 0.9, across);
  } else if (k < 6.5) {
    // pillar: a light column fading up
    float st = 0.75 + 0.25 * n21(vec2(vUv.x * 14.0, vUv.y * 4.0 - uTime * 5.0));
    a = pow(1.0 - vUv.y, 1.4) * st * fade * smoothstep(0.0, 0.1, t);
    edge = 1.0 - smoothstep(0.0, 0.3, vFres);
  } else if (k < 7.5) {
    // twister: twisting stripes
    float s = sin((vUv.x * 4.0 + vUv.y * 3.0 - uTime * 5.0) * 6.2832);
    a = smoothstep(0.2, 0.9, s) * (1.0 - vUv.y * 0.6) * fade;
    edge = smoothstep(0.6, 1.0, vUv.y);
  } else if (k < 8.5) {
    // curtain: a flame mask over an arc (p0)
    float u = abs(fract(vUv.x + 0.25) * 2.0 - 1.0) * 3.14159;
    float inArc = 1.0 - smoothstep(vParams.x * 0.5 - 0.05, vParams.x * 0.5, u);
    float fl = n21(vec2(vUv.x * 30.0, vUv.y * 4.0 - uTime * 3.0));
    a = inArc * smoothstep(vUv.y - 0.15, vUv.y + 0.15, fl) * fade * 0.8;
    edge = smoothstep(0.6, 1.0, vUv.y);
  } else if (k < 9.5) {
    // heart wave: a heart-shaped front crossing to the rim
    float R = mix(0.15, 1.0, smoothstep(0.0, 0.6, t));
    vec2 q = vec2(p.y, p.x) * 1.25 / max(R, 0.01);
    q.y += 0.2;
    float hv = pow(dot(q, q) - 1.0, 3.0) - q.x * q.x * q.y * q.y * q.y;
    a = (1.0 - smoothstep(0.0, 0.15, abs(hv))) * fade;
    edge = 0.5;
  } else if (k < 12.5) {
    // glow card: a soft disc (the Med stand-in for point lights)
    a = exp(-r * r * 4.0) * (1.0 - t);
  } else {
    // lingering glyphs (normal blending, never red, never a ring)
    float g = 0.0;
    if (k < 20.5) {
      float rays = 7.0;
      float f = fract((ang / 6.2832) * rays + vSeed);
      float d = abs(f - 0.5) * r * 6.2832 / rays;
      g = (1.0 - smoothstep(0.0, 0.035 + 0.02 * (1.0 - r), d)) * (1.0 - smoothstep(0.6, 1.0, r)) * step(0.06, r);
    } else if (k < 21.5) {
      float y = p.y + 0.12 * sin(p.x * 9.0 + vSeed * 20.0) * (0.6 + 0.4 * n21(p * 5.0));
      g = (1.0 - smoothstep(0.02, 0.06, abs(y))) * (1.0 - smoothstep(0.85, 1.0, abs(p.x)));
    } else if (k < 22.5) {
      g = (1.0 - smoothstep(0.55, 0.95, r + 0.25 * n21(p * 4.0 + vSeed))) * 0.85;
    } else if (k < 23.5) {
      float y = abs(fract((p.y + 1.0) * 1.5) - 0.5);
      g = (1.0 - smoothstep(0.03, 0.07, y)) * (1.0 - smoothstep(0.5, 0.9, abs(p.x) + 0.3 * abs(p.y))) * step(abs(p.y), 0.9);
    } else if (k < 24.5) {
      g = band(r, 0.45, 0.8, 0.12) * 0.7 + (1.0 - smoothstep(0.0, 0.45, r)) * 0.5;
    } else {
      vec2 c = floor(p * 3.0);
      vec2 f = fract(p * 3.0) - 0.5;
      float on = step(0.55, h21(c + vSeed));
      g = on * (1.0 - smoothstep(0.12, 0.22, length(f * vec2(1.0, 2.0)))) * (1.0 - smoothstep(0.8, 1.0, r));
    }
    // desaturate after 200 ms of its life (p3 = life s)
    float sat = 1.0 - smoothstep(0.0, 0.2 / max(0.2, vParams.w), t);
    vec3 grey = vec3(dot(vColor, vec3(0.3, 0.59, 0.11)));
    gl_FragColor = vec4(mix(grey, vColor, sat), g * (1.0 - smoothstep(0.6, 1.0, t)) * vAlpha * 0.8);
    if (gl_FragColor.a < 0.004) discard;
    return;
  }
  // the relation rim on the outer edge: softer on own / ally shapes so a thin one keeps its colour (a pink leash, a
  // fire cone); an enemy's keeps the strong danger rim (readability, §9)
  vec3 col = mix(vColor, vRim, clamp(edge, 0.0, 1.0) * (vRel > 1.5 ? 0.85 : 0.55));
  // readability: never over an enemy windup at full strength
  float dim = 1.0;
  for (int i = 0; i < 4; i++) {
    vec4 tl = uTele[i];
    if (tl.w > 0.5 && distance(vWorld.xz, tl.xy) < tl.z) dim = 0.35;
  }
  float own = vRel < 1.5 ? uFadeOwn : 1.0;
  float alpha = a * vAlpha * dim * own * (0.6 + 0.4 * vParams.w);
  if (alpha < 0.004) discard;
  // glow plus 60% cover: the colour stays saturated on bright sand instead of adding up to white
  gl_FragColor = vec4(col * alpha * 1.6, alpha * 0.6);
}`;function de(){return{uTime:{value:0},uTele:{value:Array.from({length:4},()=>new t)},uFadeOwn:{value:1}}}function fe(e,t){let r=new n({uniforms:e,vertexShader:le,fragmentShader:ue,transparent:!0,depthWrite:!1,side:2,blending:t===`add`?5:1});return t===`add`&&(r.blendSrc=201,r.blendDst=205,r.blendEquation=100),r.name=`fx-${t}`,r}var pe=Object.freeze({own:u.self,ally:u.ally,enemy:u.danger});function me(e,t,n,r){let i=0;for(let a=0;a<e.length&&i<4;a++){let o=e[a],s=t(o.src);if(!s||s.team===n)continue;let c=o.x/1e3,l=-o.y/1e3,u=(s.x+c)*.5,d=(s.z+l)*.5,f=Math.hypot(c-s.x,l-s.z)*.5+2.2;r[i++].set(u,d,f,1)}for(let e=i;e<r.length;e++)r[e].w=0;return i}var he=Object.freeze({low:.2,med:.3,high:.3});function X(e,t,n){if(!(t>0))return 1;let r=e/t,i=he[n];return r<=i?1:Math.max(.5,1-(r-i)/i*.5)}var Z=Object.freeze({whooshS:[`dash`,1.45,.35],whooshM:[`dash`,1.1,.45],whooshL:[`dash`,.8,.55],flip:[`dash`,1.25,.45],land:[`slam`,1.5,.35],bodyThud:[`slam`,.9,.55],clang:[`hit`,1.7,.6],tingParry:[`coin`,1.6,.6],crackle:[`magic`,1.7,.45],zap:[`towerShot`,.8,.5],sizzle:[`magic`,.7,.45],fwoomp:[`ult`,1.4,.45],pop:[`poof`,1.1,.55],balloon:[`pickup`,.8,.45],chain:[`hit`,2.1,.4],lightsJingle:[`coin`,1.2,.5],flutter:[`swipe`,1.6,.35],kiss:[`pickup`,1.6,.45],drum:[`slam`,1.2,.5],curtain:[`swipe`,.6,.45],gong:[`horn`,1.6,.5]}),ge=class{win=-1;n=0;time=0;tick(e){this.time+=e}cue(e,t,n=1){let r=Z[e]??Z[`whoosh${e}`];if(!r)return;let i=Math.floor(this.time*10);i!==this.win&&(this.win=i,this.n=0),!(this.n>=3)&&(this.n++,T.play(r[0],{rate:r[1],vol:r[2]*n,at:t}))}},Q=new r,_e=Object.freeze({}),ve=class{mesh;ribbons;linger;particles;shock;cam;juice;sfx;lookup;tier=`med`;reduced=!1;constructor(e,t,n,r,i,a,o,s,c){this.mesh=e,this.ribbons=t,this.linger=n,this.particles=r,this.shock=i,this.cam=a,this.juice=o,this.sfx=s,this.lookup=c}relation(e){return e===this.lookup.mySlot?`own`:this.lookup.teamOf(e)===this.lookup.myTeam?`ally`:`enemy`}rim(e){return pe[this.relation(e)]}abil(e,t){let n=this.lookup.heroOf(e);return n?S(n,t,this.lookup.talentsOf(e),this.lookup.branchOf(e)):_e}heroPos(e,t){return this.lookup.posOf(e,t)}card(e){return this.lookup.card?.(e)??null}ents=null;projs=null;status(e,t){let n=this.ents?.get(e);return n?(t.buffs=n.buffs,t.shield=n.shield,t.hp=n.hp??0,t.maxHp=n.maxHp??0,!0):!1}facing(e,t){let n=this.lookup.yawOf?.(e)??NaN;return n===n&&(t.x=Math.cos(n),t.y=0,t.z=-Math.sin(n),!0)}projPos(e,t){let n=this.projs;if(!n)return!1;for(let r=0;r<n.length;r++)if(n[r].index===e)return t.x=n[r].fx/1e3,t.y=.6,t.z=-n[r].fy/1e3,!0;return!1}bonePos(e,t,n){let r=this.lookup.bone(e,t===`weaponTip`?`weapon`:t);return r?(r.updateWorldMatrix(!0,!1),t===`weaponTip`?Q.set(0,$,0).applyMatrix4(r.matrixWorld):Q.setFromMatrixPosition(r.matrixWorld),n.x=Q.x,n.y=Q.y,n.z=Q.z,!0):!1}},$=.5;export{te as _,X as a,fe as c,N as d,M as f,A as g,re as h,$ as i,de as l,ne as m,ge as n,me as o,j as p,ve as r,ce as s,Z as t,se as u};