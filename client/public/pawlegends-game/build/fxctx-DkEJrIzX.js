import{l as e}from"./xp-DuavgMPc.js";import{D as t,M as n,l as r,o as i,s as a,v as o}from"./charMaterial-BPZ9MBgv.js";import{St as s,at as c,xt as l}from"./three-BaO1HYE_.js";import"./domino-DlExLy4O.js";import{r as u}from"./palette-A15ugDKM.js";import{n as d}from"./api-RCWwCQSx.js";import{D as f,O as p,b as m,h}from"./rig-B3f-uh83.js";import{C as g,D as _,F as v,M as y,O as b,x}from"./fixed-BIEY4RQ1.js";import{p as S}from"./common-B7LwvBtx.js";import{t as C}from"./models-Rk485mJ5.js";import{c as w,n as T}from"./talents-srxEpuFK.js";import{Ut as E,c as D}from"./index-DhL_iKaL.js";var O=Object.freeze({low:Object.freeze({particles:800,countScale:.6,trailHz:15,debris:.45,extras:!1,lightning:5,cracks:0}),med:Object.freeze({particles:1600,countScale:1,trailHz:30,debris:.8,extras:!0,lightning:8,cracks:2}),high:Object.freeze({particles:2e3,countScale:1,trailHz:45,debris:1,extras:!0,lightning:12,cracks:4})}),k=Object.freeze([4,7,10]);function A(e){let t=0;for(let n of k)e>=n&&t++;return t}function ee(e,t){return t<0||t>3?1:1+.18*Math.max(0,T(e,t)-1)}var j=(e,t)=>t>=0&&t<=3&&T(e,t)>=w(t);function M(e){return Math.min(2.4,Math.max(.5,Math.sqrt(Math.max(0,e)/120)))}function N(e,t,n){return n?e>=260||e>=150&&t>0&&e*100>=t*16:!1}var P=t=>n[e[t].element],te=t=>e[t].base.range<=2e3;function F(e,n){let r=P(e);return!n&&o(r)?t(r,16777215,.7):r}var I=[`grass`,`dirt`,`water`,`wood`,`stone`],ne=Object.freeze({grass:Object.freeze({chip:7323477,shape:r.FEATHER,dust:12904102,dustAlpha:.45}),dirt:Object.freeze({chip:12753500,shape:r.SHARD,dust:15389600,dustAlpha:.6}),water:Object.freeze({chip:10476799,shape:r.DROPLET,dust:15924223,dustAlpha:.6}),wood:Object.freeze({chip:10119742,shape:r.SHARD,dust:14268810,dustAlpha:.5}),stone:Object.freeze({chip:11775138,shape:r.SHARD,dust:15262422,dustAlpha:.55})}),L=Math.round(b.width/1e3),R=Math.round(b.height/1e3),z=null,B=null;function V(e,t,n,r,i,a){let o=i-n,s=a-r,c=Math.max(0,Math.min(1,((e-n)*o+(t-r)*s)/(o*o+s*s||1)));return Math.hypot(e-(n+o*c),t-(r+s*c))}function re(){if(L=Math.round(b.width/1e3),R=Math.round(b.height/1e3),b.point===1)return ie();let e=new Uint8Array(L*R),t=b.width/1e3,n=[];for(let e of[`sunny`,`puddle`]){let r=_[e].map(([e,t])=>[e/1e3,t/1e3]),i=[...r,...r.map(([e,n])=>[t-e,n]).reverse().slice(1)];n.push(i.flat())}let r=b.laneWidth/2e3,[i,a]=[b.riverX[0]/1e3,b.riverX[1]/1e3],[o,s,c,l]=y.base.map(e=>e/1e3),u=[v.x/1e3,v.y/1e3];for(let d=0;d<R;d++)for(let f=0;f<L;f++){let p=f+.5,m=d+.5,h=!1;for(let e of n){for(let t=0;t+3<e.length&&!h;t+=2)V(p,m,e[t],e[t+1],e[t+2],e[t+3])<=r&&(h=!0);if(h)break}let g=`grass`;p>=i&&p<=a?g=h?`wood`:`water`:p>=o&&p<=c&&m>=s&&m<=l||t-p>=o&&t-p<=c&&m>=s&&m<=l?g=`stone`:(h||Math.hypot(p-u[0],m-u[1])<=5.5||Math.hypot(t-p-u[0],m-u[1])<=5.5)&&(g=`dirt`),e[d*L+f]=I.indexOf(g)}return e}function ie(){let e=new Uint8Array(L*R),t=b.width/1e3,n=b.height/1e3,r=[],i=Object.keys(_);for(let e of i){let i=_[e].map(([e,t])=>[e/1e3,t/1e3]);r.push([...i,...i.map(([e,r])=>[t-e,n-r]).reverse().slice(1)].flat())}let a=b.laneWidth/2e3,o=[[g.x/1e3,g.y/1e3,g.radius/1e3+1.5],[x.x/1e3,x.y/1e3,6]];for(let i=0;i<R;i++)for(let s=0;s<L;s++){let c=s+.5,l=i+.5,u=!1;for(let e of r){for(let t=0;t+3<e.length&&!u;t+=2)V(c,l,e[t],e[t+1],e[t+2],e[t+3])<=a&&(u=!0);if(u)break}let d=`grass`;Math.abs(c+l-t)<=7.07?d=u?`wood`:`water`:o.some(([e,r,i])=>Math.hypot(c-e,l-r)<=i||Math.hypot(t-c-e,n-l-r)<=i)?d=`stone`:u&&(d=`dirt`),e[i*L+s]=I.indexOf(d)}return e}function ae(e,t){B!==b&&(z=null,B=b),z??=re();let n=Math.floor(e),r=Math.floor(-t);return n<0||r<0||n>=L||r>=R?`grass`:I[z[r*L+n]]}var oe=class{additive=!1;n=6;exact=!1;shape=r.SOFT;color=16777215;intensity=1;size=[.1,.2];sizeEnd=1;life=[.3,.5];speed=[1,2];dir=void 0;spread=Math.PI;gravity=0;drag=0;spin=0;stretch=1;fade=i.LINEAR;grow=a.LINEAR;jitter=0;up=0;floor=!1;alpha=1;tint=0;bounce=.3;r0=.2;y=.05;reset(){return this.additive=!1,this.n=6,this.exact=!1,this.shape=r.SOFT,this.color=16777215,this.intensity=1,this.sizes(.1,.2),this.sizeEnd=1,this.lives(.3,.5),this.speeds(1,2),this.dir=void 0,this.spread=Math.PI,this.gravity=0,this.drag=0,this.spin=0,this.stretch=1,this.fade=i.LINEAR,this.grow=a.LINEAR,this.jitter=0,this.up=0,this.floor=!1,this.alpha=1,this.tint=0,this.bounce=.3,this.r0=.2,this.y=.05,this}sizes(e,t){return this.size[0]=e,this.size[1]=t,this}lives(e,t){return this.life[0]=e,this.life[1]=t,this}speeds(e,t){return this.speed[0]=e,this.speed[1]=t,this}},H=class{shape=r.SOFT;color=16777215;intensity=1;size0=.5;size1=.5;life=.2;grow=a.OUT;fade=i.LINEAR;rot=0;spin=0;alpha=1;vx=0;vy=0;vz=0;additive=!0;reset(){return this.shape=r.SOFT,this.color=16777215,this.intensity=1,this.size0=this.size1=.5,this.life=.2,this.grow=a.OUT,this.fade=i.LINEAR,this.rot=this.spin=0,this.alpha=1,this.vx=this.vy=this.vz=0,this.additive=!0,this}},U=new l,W=new l,G=new l,K=new l(0,1,0),se={},q=e=>se[e]??=`#`+e.toString(16).padStart(6,`0`),J=6,Y=48,ce=16743112,le=class{particles;shock;tier=O.med;tierName=`med`;reduced=!1;auras=new h(m(),12,{additive:!0,y:.042,renderOrder:1,name:`level-aura`});sugar=new h(m(),Y,{additive:!0,y:.043,renderOrder:1,name:`sugar-rush`});peak=0;time=0;moteT=new Float32Array(J);o=new oe;s=new H;constructor(e,t){this.particles=e,this.shock=t}setTier(e,t=this.reduced){this.tier=O[e],this.tierName=e,this.reduced=t,this.particles.setBudget(this.tier.particles),this.particles.setTier({countScale:this.tier.countScale*(t?D:1),flat:e===`low`||t})}get scale(){return this.tier.countScale*(this.reduced?D:1)}rnd(){return this.particles.rng()}impact(e,t,n,i,a){let o=M(t),s=this.o.reset();s.additive=!0,s.n=Math.round(4+6*o),s.shape=r.SPARK,s.color=n,s.intensity=1.8+.2*o,s.sizes(.07,.12+.04*o),s.lives(.16,.26+.05*o),s.speeds(2.5+o,5+2.5*o),s.stretch=2.6,s.drag=4,s.gravity=6,this.particles.burst(e,s);let c=this.s.reset();if(c.shape=r.STAR4,c.color=16774874,c.intensity=2,c.size0=.45+.35*o,c.size1=.1,c.life=.12+.02*o,c.rot=this.rnd()*3,this.particles.single(e,c),i||o>1.3){let t=this.s.reset();t.shape=r.RING,t.color=n,t.intensity=1.5,t.size0=.3,t.size1=1.1+.6*o,t.life=.22,t.alpha=.85,this.particles.single(e,t)}a&&this.bigHit(e,n)}bigHit(e,t){let n=this.s.reset();n.shape=r.STAR8,n.color=t,n.intensity=2.2,n.size0=2.2,n.size1=.4,n.life=.2,n.rot=this.rnd()*6,n.spin=this.reduced?0:4,this.particles.single(e,n);let i=this.s.reset();i.shape=r.STAR4,i.color=16777215,i.intensity=2.6,i.size0=1.5,i.size1=.2,i.life=.14,this.particles.single(e,i);let a=this.o.reset();a.additive=!0,a.n=10,a.shape=r.STAR4,a.color=t,a.intensity=2,a.sizes(.16,.26),a.lives(.25,.4),a.speeds(4,7),a.drag=5,a.up=.5,this.particles.burst(e,a)}slash(e,n,i,a,o,s,c,l=1,u=1.1){let d=Math.max(5,Math.round(9*l*this.scale)),f=t(s,16777215,.55),p=this.reduced?0:3*l;for(let t=0;t<d;t++){let m=t/(d-1),h=i+c*(m-.5)*o,g=Math.cos(h),_=-Math.sin(h),v=Math.sin(m*Math.PI);U.set(e+g*a,u+m*.3,n+_*a);let y=this.s.reset();y.shape=r.SOFT,y.color=s,y.intensity=1.3,y.size0=(.6+.5*v)*l,y.size1=.1,y.life=.12+m*.12,y.alpha=.55,y.vx=-_*c*p,y.vz=g*c*p,this.particles.single(U,y),U.set(e+g*(a+.15*l),u+m*.3,n+_*(a+.15*l));let b=this.s.reset();b.shape=r.SOFT,b.color=f,b.intensity=2,b.size0=(.28+.22*v)*l,b.size1=.05,b.life=.1+m*.1,b.alpha=.95,b.vx=y.vx,b.vz=y.vz,this.particles.single(U,b)}let m=i+c*.5*o;U.set(e+Math.cos(m)*a,u+.3,n-Math.sin(m)*a);let h=this.s.reset();h.shape=r.STAR4,h.color=16777215,h.intensity=2,h.size0=.5*l,h.size1=.05,h.life=.16,h.rot=this.rnd()*3,this.particles.single(U,h)}trail(e,n,i,a){let o=this.o.reset();o.additive=!0,o.n=1,o.exact=!0,o.shape=r.SOFT,o.color=n,o.intensity=1.5,o.sizes(i,i*1.4),o.sizeEnd=.2,o.lives(.18,.3),o.speeds(.1,.4),this.particles.burst(e,o),a&&this.tier.extras&&!this.reduced&&(o.shape=r.SPARK,o.color=t(n,16777215,.4),o.intensity=2,o.sizes(.05,.09),o.sizeEnd=1,o.lives(.25,.4),o.speeds(.6,1.4),o.gravity=4,o.stretch=2,this.particles.burst(e,o))}dash(e,t,n,i,a,o=1){let s=Math.hypot(n-e,i-t);if(!(s>.05))return;G.set((n-e)/s,0,(i-t)/s);let c=Math.max(4,Math.round(10*this.scale)),l=this.o.reset();l.additive=!0,l.n=1,l.exact=!0,l.shape=r.SPARK,l.color=a,l.intensity=2,l.sizes(.1*o,.16*o),l.lives(.2,.3),l.speeds(this.reduced?1:7,this.reduced?2:10),l.dir=G,l.spread=.06,l.stretch=3.5,l.drag=7;for(let s=0;s<c;s++){let u=s/(c-1);U.set(e+(n-e)*u,.6+this.rnd()*.6,t+(i-t)*u),this.particles.burst(U,l);let d=this.s.reset();d.shape=r.SOFT,d.color=a,d.intensity=1.2,d.size0=1.1*o,d.size1=.2,d.life=.2+u*.15,d.alpha=.5,U.y=.9,this.particles.single(U,d)}this.debris(e,t,.7*o)}debris(e,t,n=1){if(this.tier.debris<=0)return;let a=ae(e,t),o=ne[a];U.set(e,.15,t);let s=this.o.reset();s.n=Math.max(1,Math.round((3+5*n)*this.tier.debris)),s.shape=o.shape,s.color=o.chip,s.tint=.2,s.sizes(.07+.02*n,.13+.04*n),s.lives(.5,.85),s.speeds(1.4,2.6+1.4*n),s.dir=K,s.spread=1.2,s.up=1.5+n,s.gravity=a===`water`?10:13,s.drag=.4,s.spin=a===`grass`?6:10,s.fade=i.HOLD,s.floor=!0,s.bounce=a===`water`?0:.35,s.jitter=.25,this.particles.burst(U,s);let c=this.o.reset();if(c.n=Math.max(1,Math.round((2+3*n)*this.tier.debris)),c.shape=r.PUFF,c.color=o.dust,c.alpha=o.dustAlpha,c.sizes(.3,.5),c.sizeEnd=2,c.lives(.35,.6),c.speeds(.6,1.6),c.up=.4,c.drag=3,c.jitter=.3,U.y=.2,this.particles.burst(U,c),a===`water`){let e=this.s.reset();e.shape=r.RING,e.color=15399167,e.intensity=1.2,e.size0=.4,e.size1=1.8+n,e.life=.35,e.alpha=.7,U.y=.08,this.particles.single(U,e)}}pillar(e,n,a,o=1){U.set(e,.2,n);let s=this.o.reset();s.additive=!0,s.n=Math.round(14*o),s.shape=r.SOFT,s.color=a,s.intensity=1.8,s.sizes(.5*o,.9*o),s.sizeEnd=.3,s.lives(.45,.75),s.speeds(this.reduced?2:5,this.reduced?3:9),s.dir=K,s.spread=.12,s.drag=2.2,s.jitter=.35,this.particles.burst(U,s),U.y=3.6*o;let c=this.s.reset();c.shape=r.STAR8,c.color=t(a,16777215,.4),c.intensity=2.2,c.size0=.4,c.size1=2.2*o,c.life=.4,c.fade=i.POP,c.spin=this.reduced?0:2,this.particles.single(U,c)}ultimateMark(e,t,n,i){U.set(e,0,t),this.shock.start(U,{r1:3.2,dur:.38,color:q(i),height:.8,intensity:1.4}),U.set(e,.15,t);let a=this.o.reset();a.additive=!0,a.n=14,a.shape=r.STAR4,a.color=n,a.intensity=1.6,a.sizes(.25,.4),a.sizeEnd=1,a.lives(.35,.55),a.speeds(3,5),a.up=1.2,a.drag=3,a.r0=.5,a.alpha=.9,this.particles.ring(U,a)}ultimate(e,t,n,i,a,o=1){U.set(e,0,t);let s=Math.min(9,Math.max(3.5,a))*(.85+.15*o);this.shock.start(U,{r1:s,dur:.45,color:q(i),height:1.1,intensity:1.6}),this.shock.start(U,{r1:s*.6,dur:.3,color:q(n),height:.6}),this.pillar(e,t,n,1+.25*(o-1)),U.set(e,.15,t);let c=this.o.reset();c.additive=!0,c.n=Math.round(24*o),c.shape=r.STAR4,c.color=n,c.intensity=1.8,c.sizes(.3,.5),c.sizeEnd=1,c.lives(.45,.7),c.speeds(4,7),c.up=1.4,c.drag=3,c.r0=.6,c.alpha=.95,this.particles.ring(U,c);let l=this.reduced?0:this.tier.cracks;for(let e=0;e<l;e++){let t=e/l*Math.PI*2+this.rnd()*.6;G.set(Math.cos(t),0,Math.sin(t)),this.shock.crack(U,G,{length:s*.55,width:.7,color:q(n),travel:.14,life:.5})}this.debris(e,t,1.6)}lightning(e,t,n,a,o,s,c){let l=this.tier.lightning,u=a-e,d=o-t,f=s-n,p=Math.sqrt(u*u+d*d+f*f);if(!(p>.1))return;G.set(s-n,0,-(a-e)),G.lengthSq()<1e-6&&G.set(1,0,0),G.normalize();let m=Math.min(.9,p*.12),h=e,g=t,_=n,v=this.reduced?.22:.14;for(let u=1;u<=l;u++){let d=u/l,f=u===l?0:(this.rnd()*2-1)*m,p=e+(a-e)*d+G.x*f,y=t+(o-t)*d+(this.rnd()-.5)*m*.5,b=n+(s-n)*d+G.z*f;for(let e=0;e<3;e++){let t=(e+.5)/3;U.set(h+(p-h)*t,g+(y-g)*t,_+(b-_)*t);let n=this.s.reset();n.shape=r.SOFT,n.color=c,n.intensity=2.2,n.size0=.42,n.size1=.12,n.life=v+this.rnd()*.05,n.fade=this.reduced?i.LINEAR:i.TWINKLE,this.particles.single(U,n);let a=this.s.reset();a.shape=r.SOFT,a.color=16777215,a.intensity=2.6,a.size0=.16,a.size1=.05,a.life=v,this.particles.single(U,a)}h=p,g=y,_=b}W.set(a,o,s);let y=this.s.reset();y.shape=r.STAR8,y.color=c,y.intensity=2.4,y.size0=1.4,y.size1=.2,y.life=.18,this.particles.single(W,y)}levelSpike(e,t,n,i){let a=A(n);if(a===0||!k.includes(n))return;let o=.8+.2*a;U.set(e,0,t),this.shock.start(U,{r1:3+a,dur:.45,color:q(i),height:.5+.2*a}),this.pillar(e,t,i,o),U.set(e,.4,t);let s=this.o.reset();s.additive=!0,s.n=10+6*a,s.shape=r.STAR5,s.color=i,s.intensity=2,s.sizes(.2,.34),s.lives(.6,1),s.speeds(2,4),s.up=4.5,s.gravity=6,this.particles.burst(U,s)}rankFlourish(e,n,i){U.set(e,.3,n);let a=this.o.reset();a.additive=!0,a.n=12,a.shape=r.STAR4,a.color=t(i,16777215,.35),a.intensity=2,a.sizes(.16,.26),a.sizeEnd=.4,a.lives(.35,.55),a.speeds(1.6,2.6),a.up=1.6,a.drag=2,a.r0=.5,a.alpha=1,this.particles.ring(U,a)}update(e,t,n){this.time+=e;let a=this.particles.live;a>this.peak&&(this.peak=a);let o=this.auras;o.begin();let s=this.sugar;s.begin();let c=0;for(let a=0;a<t.length;a++){let l=t[a];if(c<Y&&l.state!==`dead`&&(l.buffs&(d.SugarRush|d.Sugared))!==0){let e=l.kind===`hero`&&l.hero!==void 0,t=e?C[l.hero]*1.6:.85,n=this.reduced?0:Math.sin(this.time*4+l.id);s.add(f(l.fx),p(l.fy),t*(1+.04*n),ce,e?.55+.1*n:.35),c++}if(l.kind!==`hero`||!l.hero||l.state===`dead`||(l.buffs&d.Stealth)!==0)continue;let u=A(l.level??1);if(u===0)continue;let m=f(l.fx),h=p(l.fy),g=F(l.hero,l.id===n),_=C[l.hero]*1.32,v=this.reduced?0:Math.sin(this.time*(2+u)+l.id);if(o.add(m,h,_*(1+.03*v),g,.22+.12*u+.05*v),u>=2&&o.add(m,h,_*(1.12+(this.reduced?0:(this.time*.6+l.id*.17)%1*.25)),g,.18+.06*u),!this.tier.extras||this.reduced||u<2||l.id<0||l.id>=J||(this.moteT[l.id]-=e,this.moteT[l.id]>0))continue;this.moteT[l.id]=u>=3?.18:.32;let y=this.rnd()*Math.PI*2;U.set(m+Math.cos(y)*_*.5,.2,h+Math.sin(y)*_*.5);let b=this.s.reset();b.shape=r.STAR4,b.color=g,b.intensity=1.6,b.size0=.16,b.size1=.06,b.life=.7,b.vy=1.6,b.fade=i.IN_OUT,this.particles.single(U,b)}o.end(),s.end()}dispose(){this.auras.dispose(),this.sugar.dispose()}},ue=Object.freeze({crescent:0,arc:1,ring:2,dome:3,wall:4,beam:5,pillar:6,twister:7,curtain:8,heart:9,chain:10,meteor:11,glow:12,crackStar:20,crackLine:21,scorch:22,scratches:23,crater:24,petals:25}),de=`
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
}`,fe=`
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
}`;function pe(){return{uTime:{value:0},uTele:{value:Array.from({length:4},()=>new s)},uFadeOwn:{value:1}}}function me(e,t){let n=new c({uniforms:e,vertexShader:de,fragmentShader:fe,transparent:!0,depthWrite:!1,side:2,blending:t===`add`?5:1});return t===`add`&&(n.blendSrc=201,n.blendDst=205,n.blendEquation=100),n.name=`fx-${t}`,n}var he=Object.freeze({own:u.self,ally:u.ally,enemy:u.danger});function X(e,t,n,r){let i=0;for(let a=0;a<e.length&&i<4;a++){let o=e[a],s=t(o.src);if(!s||s.team===n)continue;let c=o.x/1e3,l=-o.y/1e3,u=(s.x+c)*.5,d=(s.z+l)*.5,f=Math.hypot(c-s.x,l-s.z)*.5+2.2;r[i++].set(u,d,f,1)}for(let e=i;e<r.length;e++)r[e].w=0;return i}var ge=Object.freeze({low:.2,med:.3,high:.3});function _e(e,t,n){if(!(t>0))return 1;let r=e/t,i=ge[n];return r<=i?1:Math.max(.5,1-(r-i)/i*.5)}var Z=Object.freeze({whooshS:[`dash`,1.45,.35],whooshM:[`dash`,1.1,.45],whooshL:[`dash`,.8,.55],flip:[`dash`,1.25,.45],land:[`slam`,1.5,.35],bodyThud:[`slam`,.9,.55],clang:[`hit`,1.7,.6],tingParry:[`coin`,1.6,.6],crackle:[`magic`,1.7,.45],zap:[`towerShot`,.8,.5],sizzle:[`magic`,.7,.45],fwoomp:[`ult`,1.4,.45],pop:[`poof`,1.1,.55],balloon:[`pickup`,.8,.45],chain:[`hit`,2.1,.4],lightsJingle:[`coin`,1.2,.5],flutter:[`swipe`,1.6,.35],kiss:[`pickup`,1.6,.45],drum:[`slam`,1.2,.5],curtain:[`swipe`,.6,.45],gong:[`horn`,1.6,.5]}),ve=class{win=-1;n=0;time=0;tick(e){this.time+=e}cue(e,t,n=1){let r=Z[e]??Z[`whoosh${e}`];if(!r)return;let i=Math.floor(this.time*10);i!==this.win&&(this.win=i,this.n=0),!(this.n>=3)&&(this.n++,E.play(r[0],{rate:r[1],vol:r[2]*n,at:t}))}},Q=new l,ye=Object.freeze({}),be=class{mesh;ribbons;linger;particles;shock;cam;juice;sfx;lookup;tier=`med`;reduced=!1;constructor(e,t,n,r,i,a,o,s,c){this.mesh=e,this.ribbons=t,this.linger=n,this.particles=r,this.shock=i,this.cam=a,this.juice=o,this.sfx=s,this.lookup=c}relation(e){return e===this.lookup.mySlot?`own`:this.lookup.teamOf(e)===this.lookup.myTeam?`ally`:`enemy`}rim(e){return he[this.relation(e)]}abil(e,t){let n=this.lookup.heroOf(e);return n?S(n,t,this.lookup.talentsOf(e),this.lookup.branchOf(e)):ye}heroPos(e,t){return this.lookup.posOf(e,t)}card(e){return this.lookup.card?.(e)??null}ents=null;projs=null;status(e,t){let n=this.ents?.get(e);return n?(t.buffs=n.buffs,t.shield=n.shield,t.hp=n.hp??0,t.maxHp=n.maxHp??0,!0):!1}facing(e,t){let n=this.lookup.yawOf?.(e)??NaN;return n===n&&(t.x=Math.cos(n),t.y=0,t.z=-Math.sin(n),!0)}projPos(e,t){let n=this.projs;if(!n)return!1;for(let r=0;r<n.length;r++)if(n[r].index===e)return t.x=n[r].fx/1e3,t.y=.6,t.z=-n[r].fy/1e3,!0;return!1}bonePos(e,t,n){let r=this.lookup.bone(e,t===`weaponTip`?`weapon`:t);return r?(r.updateWorldMatrix(!0,!1),t===`weaponTip`?Q.set(0,$,0).applyMatrix4(r.matrixWorld):Q.setFromMatrixPosition(r.matrixWorld),n.x=Q.x,n.y=Q.y,n.z=Q.z,!0):!1}},$=.5;export{ee as _,_e as a,me as c,F as d,P as f,j as g,te as h,$ as i,pe as l,N as m,ve as n,X as o,M as p,be as r,ue as s,Z as t,le as u};