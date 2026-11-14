import{n as e}from"./heroes-DmDidokZ.js";import{S as t,b as n,h as r}from"./rig-B-8semAc.js";import{T as i,b as a,d as o}from"./charMaterial-DO-q2rmS.js";import{St as s,at as c,xt as l}from"./three-CE68GREw.js";import"./domino-DKy9kpFV.js";import{r as u}from"./palette-BPNPpz7F.js";import{n as d}from"./api-RCWwCQSx.js";import{c as f,n as p}from"./talents-DUlzpW0S.js";import{K as m,M as h,P as g,R as _,U as v,z as y}from"./world-BU0DnUQ_.js";import{i as b,n as x,t as S}from"./Particles-sLWaYFGO.js";import{p as C}from"./common-BEVefwUY.js";import{Kt as w,On as T,c as E,kn as D}from"./index-CoA46ypE.js";var O=Object.freeze({low:Object.freeze({particles:800,countScale:.6,trailHz:15,debris:.45,extras:!1,lightning:5,cracks:0}),med:Object.freeze({particles:1600,countScale:1,trailHz:30,debris:.8,extras:!0,lightning:8,cracks:2}),high:Object.freeze({particles:2e3,countScale:1,trailHz:45,debris:1,extras:!0,lightning:12,cracks:4})}),k=Object.freeze([4,7,10]);function A(e){let t=0;for(let n of k)e>=n&&t++;return t}function ee(e,t){return t<0||t>3?1:1+.18*Math.max(0,p(e,t)-1)}var te=(e,t)=>t>=0&&t<=3&&p(e,t)>=f(t);function j(e){return Math.min(2.4,Math.max(.5,Math.sqrt(Math.max(0,e)/120)))}function M(e,t,n){return n?e>=260||e>=150&&t>0&&e*100>=t*16:!1}var N=t=>i[e[t].element],P=t=>e[t].base.range<=2e3;function F(e,t){let n=N(e);return!t&&o(n)?a(n,16777215,.7):n}var I=[`grass`,`dirt`,`water`,`wood`,`stone`],L=Object.freeze({grass:Object.freeze({chip:7323477,shape:b.FEATHER,dust:12904102,dustAlpha:.45}),dirt:Object.freeze({chip:12753500,shape:b.SHARD,dust:15389600,dustAlpha:.6}),water:Object.freeze({chip:10476799,shape:b.DROPLET,dust:15924223,dustAlpha:.6}),wood:Object.freeze({chip:10119742,shape:b.SHARD,dust:14268810,dustAlpha:.5}),stone:Object.freeze({chip:11775138,shape:b.SHARD,dust:15262422,dustAlpha:.55})}),R=Math.round(y.width/1e3),z=Math.round(y.height/1e3),B=null,V=null;function H(e,t,n,r,i,a){let o=i-n,s=a-r,c=Math.max(0,Math.min(1,((e-n)*o+(t-r)*s)/(o*o+s*s||1)));return Math.hypot(e-(n+o*c),t-(r+s*c))}function U(){if(R=Math.round(y.width/1e3),z=Math.round(y.height/1e3),y.point===1)return ne();let e=new Uint8Array(R*z),t=y.width/1e3,n=[];for(let e of[`sunny`,`puddle`]){let r=_[e].map(([e,t])=>[e/1e3,t/1e3]),i=[...r,...r.map(([e,n])=>[t-e,n]).reverse().slice(1)];n.push(i.flat())}let r=y.laneWidth/2e3,[i,a]=[y.riverX[0]/1e3,y.riverX[1]/1e3],[o,s,c,l]=v.base.map(e=>e/1e3),u=[m.x/1e3,m.y/1e3];for(let d=0;d<z;d++)for(let f=0;f<R;f++){let p=f+.5,m=d+.5,h=!1;for(let e of n){for(let t=0;t+3<e.length&&!h;t+=2)H(p,m,e[t],e[t+1],e[t+2],e[t+3])<=r&&(h=!0);if(h)break}let g=`grass`;p>=i&&p<=a?g=h?`wood`:`water`:p>=o&&p<=c&&m>=s&&m<=l||t-p>=o&&t-p<=c&&m>=s&&m<=l?g=`stone`:(h||Math.hypot(p-u[0],m-u[1])<=5.5||Math.hypot(t-p-u[0],m-u[1])<=5.5)&&(g=`dirt`),e[d*R+f]=I.indexOf(g)}return e}function ne(){let e=new Uint8Array(R*z),t=y.width/1e3,n=y.height/1e3,r=[],i=Object.keys(_);for(let e of i){let i=_[e].map(([e,t])=>[e/1e3,t/1e3]);r.push([...i,...i.map(([e,r])=>[t-e,n-r]).reverse().slice(1)].flat())}let a=y.laneWidth/2e3,o=[[g.x/1e3,g.y/1e3,g.radius/1e3+1.5],[h.x/1e3,h.y/1e3,6]];for(let i=0;i<z;i++)for(let s=0;s<R;s++){let c=s+.5,l=i+.5,u=!1;for(let e of r){for(let t=0;t+3<e.length&&!u;t+=2)H(c,l,e[t],e[t+1],e[t+2],e[t+3])<=a&&(u=!0);if(u)break}let d=`grass`;Math.abs(c+l-t)<=7.07?d=u?`wood`:`water`:o.some(([e,r,i])=>Math.hypot(c-e,l-r)<=i||Math.hypot(t-c-e,n-l-r)<=i)?d=`stone`:u&&(d=`dirt`),e[i*R+s]=I.indexOf(d)}return e}function re(e,t){V!==y&&(B=null,V=y),B??=U();let n=Math.floor(e),r=Math.floor(-t);return n<0||r<0||n>=R||r>=z?`grass`:I[B[r*R+n]]}var ie=class{additive=!1;n=6;exact=!1;shape=b.SOFT;color=16777215;intensity=1;size=[.1,.2];sizeEnd=1;life=[.3,.5];speed=[1,2];dir=void 0;spread=Math.PI;gravity=0;drag=0;spin=0;stretch=1;fade=S.LINEAR;grow=x.LINEAR;jitter=0;up=0;floor=!1;alpha=1;tint=0;bounce=.3;r0=.2;y=.05;reset(){return this.additive=!1,this.n=6,this.exact=!1,this.shape=b.SOFT,this.color=16777215,this.intensity=1,this.sizes(.1,.2),this.sizeEnd=1,this.lives(.3,.5),this.speeds(1,2),this.dir=void 0,this.spread=Math.PI,this.gravity=0,this.drag=0,this.spin=0,this.stretch=1,this.fade=S.LINEAR,this.grow=x.LINEAR,this.jitter=0,this.up=0,this.floor=!1,this.alpha=1,this.tint=0,this.bounce=.3,this.r0=.2,this.y=.05,this}sizes(e,t){return this.size[0]=e,this.size[1]=t,this}lives(e,t){return this.life[0]=e,this.life[1]=t,this}speeds(e,t){return this.speed[0]=e,this.speed[1]=t,this}},ae=class{shape=b.SOFT;color=16777215;intensity=1;size0=.5;size1=.5;life=.2;grow=x.OUT;fade=S.LINEAR;rot=0;spin=0;alpha=1;vx=0;vy=0;vz=0;additive=!0;reset(){return this.shape=b.SOFT,this.color=16777215,this.intensity=1,this.size0=this.size1=.5,this.life=.2,this.grow=x.OUT,this.fade=S.LINEAR,this.rot=this.spin=0,this.alpha=1,this.vx=this.vy=this.vz=0,this.additive=!0,this}},W=new l,G=new l,K=new l,q=new l(0,1,0),oe={},J=e=>oe[e]??=`#`+e.toString(16).padStart(6,`0`),Y=6,X=48,se=16743112,ce=class{particles;shock;tier=O.med;tierName=`med`;reduced=!1;auras=new r(n(),12,{additive:!0,y:.042,renderOrder:1,name:`level-aura`});sugar=new r(n(),X,{additive:!0,y:.043,renderOrder:1,name:`sugar-rush`});peak=0;life=null;tint=16773584;dashYaw=NaN;time=0;moteT=new Float32Array(Y);o=new ie;s=new ae;constructor(e,t){this.particles=e,this.shock=t}setTier(e,t=this.reduced){this.tier=O[e],this.tierName=e,this.reduced=t,this.particles.setBudget(this.tier.particles),this.particles.setTier({countScale:this.tier.countScale*(t?E:1),flat:e===`low`||t})}get scale(){return this.tier.countScale*(this.reduced?E:1)}rnd(){return this.particles.rng()}impact(e,t,n,r,i){let a=j(t);this.tint=n;let o=this.o.reset();o.additive=!0,o.n=Math.round(4+6*a),o.shape=b.SPARK,o.color=n,o.intensity=1.8+.2*a,o.sizes(.07,.12+.04*a),o.lives(.16,.26+.05*a),o.speeds(2.5+a,5+2.5*a),o.stretch=2.6,o.drag=4,o.gravity=6,this.particles.burst(e,o);let s=this.s.reset();if(s.shape=b.STAR4,s.color=16774874,s.intensity=2,s.size0=.45+.35*a,s.size1=.1,s.life=.12+.02*a,s.rot=this.rnd()*3,this.particles.single(e,s),r||a>1.3){let t=this.s.reset();t.shape=b.RING,t.color=n,t.intensity=1.5,t.size0=.3,t.size1=1.1+.6*a,t.life=.22,t.alpha=.85,this.particles.single(e,t)}i&&this.bigHit(e,n)}bigHit(e,t){let n=this.s.reset();n.shape=b.STAR8,n.color=t,n.intensity=2.2,n.size0=2.2,n.size1=.4,n.life=.2,n.rot=this.rnd()*6,n.spin=this.reduced?0:4,this.particles.single(e,n);let r=this.s.reset();r.shape=b.STAR4,r.color=16777215,r.intensity=2.6,r.size0=1.5,r.size1=.2,r.life=.14,this.particles.single(e,r);let i=this.o.reset();i.additive=!0,i.n=10,i.shape=b.STAR4,i.color=t,i.intensity=2,i.sizes(.16,.26),i.lives(.25,.4),i.speeds(4,7),i.drag=5,i.up=.5,this.particles.burst(e,i)}slash(e,t,n,r,i,o,s,c=1,l=1.1){let u=Math.max(5,Math.round(9*c*this.scale)),d=a(o,16777215,.55),f=this.reduced?0:3*c;for(let a=0;a<u;a++){let p=a/(u-1),m=n+s*(p-.5)*i,h=Math.cos(m),g=-Math.sin(m),_=Math.sin(p*Math.PI);W.set(e+h*r,l+p*.3,t+g*r);let v=this.s.reset();v.shape=b.SOFT,v.color=o,v.intensity=1.3,v.size0=(.6+.5*_)*c,v.size1=.1,v.life=.12+p*.12,v.alpha=.55,v.vx=-g*s*f,v.vz=h*s*f,this.particles.single(W,v),W.set(e+h*(r+.15*c),l+p*.3,t+g*(r+.15*c));let y=this.s.reset();y.shape=b.SOFT,y.color=d,y.intensity=2,y.size0=(.28+.22*_)*c,y.size1=.05,y.life=.1+p*.1,y.alpha=.95,y.vx=v.vx,y.vz=v.vz,this.particles.single(W,y)}let p=n+s*.5*i;W.set(e+Math.cos(p)*r,l+.3,t-Math.sin(p)*r);let m=this.s.reset();m.shape=b.STAR4,m.color=16777215,m.intensity=2,m.size0=.5*c,m.size1=.05,m.life=.16,m.rot=this.rnd()*3,this.particles.single(W,m)}trail(e,t,n,r){let i=this.o.reset();i.additive=!0,i.n=1,i.exact=!0,i.shape=b.SOFT,i.color=t,i.intensity=1.5,i.sizes(n,n*1.4),i.sizeEnd=.2,i.lives(.18,.3),i.speeds(.1,.4),this.particles.burst(e,i),r&&this.tier.extras&&!this.reduced&&(i.shape=b.SPARK,i.color=a(t,16777215,.4),i.intensity=2,i.sizes(.05,.09),i.sizeEnd=1,i.lives(.25,.4),i.speeds(.6,1.4),i.gravity=4,i.stretch=2,this.particles.burst(e,i))}dash(e,t,n,r,i,a=1){let o=Math.hypot(n-e,r-t);if(!(o>.05))return;K.set((n-e)/o,0,(r-t)/o);let s=Math.max(4,Math.round(10*this.scale)),c=this.o.reset();c.additive=!0,c.n=1,c.exact=!0,c.shape=b.SPARK,c.color=i,c.intensity=2,c.sizes(.1*a,.16*a),c.lives(.2,.3),c.speeds(this.reduced?1:7,this.reduced?2:10),c.dir=K,c.spread=.06,c.stretch=3.5,c.drag=7;for(let o=0;o<s;o++){let l=o/(s-1);W.set(e+(n-e)*l,.6+this.rnd()*.6,t+(r-t)*l),this.particles.burst(W,c);let u=this.s.reset();u.shape=b.SOFT,u.color=i,u.intensity=1.2,u.size0=1.1*a,u.size1=.2,u.life=.2+l*.15,u.alpha=.5,W.y=.9,this.particles.single(W,u)}this.tint=i,this.dashYaw=Math.atan2(-(r-t),n-e),this.debris(e,t,.7*a),this.dashYaw=NaN}debris(e,t,n=1){if(this.tier.debris<=0)return;let r=re(e,t);this.life?.impact(e,t,n,r,this.tint,this.dashYaw);let i=L[r];W.set(e,.15,t);let a=this.o.reset();a.n=Math.max(1,Math.round((3+5*n)*this.tier.debris)),a.shape=i.shape,a.color=i.chip,a.tint=.2,a.sizes(.07+.02*n,.13+.04*n),a.lives(.5,.85),a.speeds(1.4,2.6+1.4*n),a.dir=q,a.spread=1.2,a.up=1.5+n,a.gravity=r===`water`?10:13,a.drag=.4,a.spin=r===`grass`?6:10,a.fade=S.HOLD,a.floor=!0,a.bounce=r===`water`?0:.35,a.jitter=.25,this.particles.burst(W,a);let o=this.o.reset();if(o.n=Math.max(1,Math.round((2+3*n)*this.tier.debris)),o.shape=b.PUFF,o.color=i.dust,o.alpha=i.dustAlpha,o.sizes(.3,.5),o.sizeEnd=2,o.lives(.35,.6),o.speeds(.6,1.6),o.up=.4,o.drag=3,o.jitter=.3,W.y=.2,this.particles.burst(W,o),r===`water`){let e=this.s.reset();e.shape=b.RING,e.color=15399167,e.intensity=1.2,e.size0=.4,e.size1=1.8+n,e.life=.35,e.alpha=.7,W.y=.08,this.particles.single(W,e)}}pillar(e,t,n,r=1){W.set(e,.2,t);let i=this.o.reset();i.additive=!0,i.n=Math.round(14*r),i.shape=b.SOFT,i.color=n,i.intensity=1.8,i.sizes(.5*r,.9*r),i.sizeEnd=.3,i.lives(.45,.75),i.speeds(this.reduced?2:5,this.reduced?3:9),i.dir=q,i.spread=.12,i.drag=2.2,i.jitter=.35,this.particles.burst(W,i),W.y=3.6*r;let o=this.s.reset();o.shape=b.STAR8,o.color=a(n,16777215,.4),o.intensity=2.2,o.size0=.4,o.size1=2.2*r,o.life=.4,o.fade=S.POP,o.spin=this.reduced?0:2,this.particles.single(W,o)}ultimateMark(e,t,n,r){this.life?.castGlow(e,t,1),W.set(e,0,t),this.shock.start(W,{r1:3.2,dur:.38,color:J(r),height:.8,intensity:1.4}),W.set(e,.15,t);let i=this.o.reset();i.additive=!0,i.n=14,i.shape=b.STAR4,i.color=n,i.intensity=1.6,i.sizes(.25,.4),i.sizeEnd=1,i.lives(.35,.55),i.speeds(3,5),i.up=1.2,i.drag=3,i.r0=.5,i.alpha=.9,this.particles.ring(W,i)}ultimate(e,t,n,r,i,a=1){W.set(e,0,t);let o=Math.min(9,Math.max(3.5,i))*(.85+.15*a);this.shock.start(W,{r1:o,dur:.45,color:J(r),height:1.1,intensity:1.6}),this.shock.start(W,{r1:o*.6,dur:.3,color:J(n),height:.6}),this.pillar(e,t,n,1+.25*(a-1)),this.tint=n,this.life?.castGlow(e,t,a),W.set(e,.15,t);let s=this.o.reset();s.additive=!0,s.n=Math.round(24*a),s.shape=b.STAR4,s.color=n,s.intensity=1.8,s.sizes(.3,.5),s.sizeEnd=1,s.lives(.45,.7),s.speeds(4,7),s.up=1.4,s.drag=3,s.r0=.6,s.alpha=.95,this.particles.ring(W,s);let c=this.reduced?0:this.tier.cracks;for(let e=0;e<c;e++){let t=e/c*Math.PI*2+this.rnd()*.6;K.set(Math.cos(t),0,Math.sin(t)),this.shock.crack(W,K,{length:o*.55,width:.7,color:J(n),travel:.14,life:.5})}this.debris(e,t,1.6)}lightning(e,t,n,r,i,a,o){let s=this.tier.lightning,c=r-e,l=i-t,u=a-n,d=Math.sqrt(c*c+l*l+u*u);if(!(d>.1))return;K.set(a-n,0,-(r-e)),K.lengthSq()<1e-6&&K.set(1,0,0),K.normalize();let f=Math.min(.9,d*.12),p=e,m=t,h=n,g=this.reduced?.22:.14;for(let c=1;c<=s;c++){let l=c/s,u=c===s?0:(this.rnd()*2-1)*f,d=e+(r-e)*l+K.x*u,_=t+(i-t)*l+(this.rnd()-.5)*f*.5,v=n+(a-n)*l+K.z*u;for(let e=0;e<3;e++){let t=(e+.5)/3;W.set(p+(d-p)*t,m+(_-m)*t,h+(v-h)*t);let n=this.s.reset();n.shape=b.SOFT,n.color=o,n.intensity=2.2,n.size0=.42,n.size1=.12,n.life=g+this.rnd()*.05,n.fade=this.reduced?S.LINEAR:S.TWINKLE,this.particles.single(W,n);let r=this.s.reset();r.shape=b.SOFT,r.color=16777215,r.intensity=2.6,r.size0=.16,r.size1=.05,r.life=g,this.particles.single(W,r)}p=d,m=_,h=v}G.set(r,i,a);let _=this.s.reset();_.shape=b.STAR8,_.color=o,_.intensity=2.4,_.size0=1.4,_.size1=.2,_.life=.18,this.particles.single(G,_)}levelSpike(e,t,n,r){let i=A(n);if(i===0||!k.includes(n))return;let a=.8+.2*i;W.set(e,0,t),this.shock.start(W,{r1:3+i,dur:.45,color:J(r),height:.5+.2*i}),this.pillar(e,t,r,a),W.set(e,.4,t);let o=this.o.reset();o.additive=!0,o.n=10+6*i,o.shape=b.STAR5,o.color=r,o.intensity=2,o.sizes(.2,.34),o.lives(.6,1),o.speeds(2,4),o.up=4.5,o.gravity=6,this.particles.burst(W,o)}rankFlourish(e,t,n){W.set(e,.3,t);let r=this.o.reset();r.additive=!0,r.n=12,r.shape=b.STAR4,r.color=a(n,16777215,.35),r.intensity=2,r.sizes(.16,.26),r.sizeEnd=.4,r.lives(.35,.55),r.speeds(1.6,2.6),r.up=1.6,r.drag=2,r.r0=.5,r.alpha=1,this.particles.ring(W,r)}update(e,t,n){this.time+=e;let r=this.particles.live;r>this.peak&&(this.peak=r);let i=this.auras;i.begin();let a=this.sugar;a.begin();let o=0;for(let r=0;r<t.length;r++){let s=t[r];if(o<X&&s.state!==`dead`&&(s.buffs&(d.SugarRush|d.Sugared))!==0){let e=s.kind===`hero`&&s.hero!==void 0,t=e?w[s.hero]*1.6:.85,n=this.reduced?0:Math.sin(this.time*4+s.id);a.add(T(s.fx),D(s.fy),t*(1+.04*n),se,e?.55+.1*n:.35),o++}if(s.kind!==`hero`||!s.hero||s.state===`dead`||(s.buffs&d.Stealth)!==0)continue;let c=A(s.level??1);if(c===0)continue;let l=T(s.fx),u=D(s.fy),f=F(s.hero,s.id===n),p=w[s.hero]*1.32,m=this.reduced?0:Math.sin(this.time*(2+c)+s.id);if(i.add(l,u,p*(1+.03*m),f,.22+.12*c+.05*m),c>=2&&i.add(l,u,p*(1.12+(this.reduced?0:(this.time*.6+s.id*.17)%1*.25)),f,.18+.06*c),!this.tier.extras||this.reduced||c<2||s.id<0||s.id>=Y||(this.moteT[s.id]-=e,this.moteT[s.id]>0))continue;this.moteT[s.id]=c>=3?.18:.32;let h=this.rnd()*Math.PI*2;W.set(l+Math.cos(h)*p*.5,.2,u+Math.sin(h)*p*.5);let g=this.s.reset();g.shape=b.STAR4,g.color=f,g.intensity=1.6,g.size0=.16,g.size1=.06,g.life=.7,g.vy=1.6,g.fade=S.IN_OUT,this.particles.single(W,g)}i.end(),a.end()}dispose(){this.auras.dispose(),this.sugar.dispose()}},le=Object.freeze({crescent:0,arc:1,ring:2,dome:3,wall:4,beam:5,pillar:6,twister:7,curtain:8,heart:9,chain:10,meteor:11,glow:12,crackStar:20,crackLine:21,scorch:22,scratches:23,crater:24,petals:25}),ue=`
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
}`,de=`
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
}`;function fe(){return{uTime:{value:0},uTele:{value:Array.from({length:4},()=>new s)},uFadeOwn:{value:1}}}function pe(e,t){let n=new c({uniforms:e,vertexShader:ue,fragmentShader:de,transparent:!0,depthWrite:!1,side:2,blending:t===`add`?5:1});return t===`add`&&(n.blendSrc=201,n.blendDst=205,n.blendEquation=100),n.name=`fx-${t}`,n}var me=Object.freeze({own:u.self,ally:u.ally,enemy:u.danger});function he(e,t,n,r){let i=0;for(let a=0;a<e.length&&i<4;a++){let o=e[a],s=t(o.src);if(!s||s.team===n)continue;let c=o.x/1e3,l=-o.y/1e3,u=(s.x+c)*.5,d=(s.z+l)*.5,f=Math.hypot(c-s.x,l-s.z)*.5+2.2;r[i++].set(u,d,f,1)}for(let e=i;e<r.length;e++)r[e].w=0;return i}var ge=Object.freeze({low:.2,med:.3,high:.3});function _e(e,t,n){if(!(t>0))return 1;let r=e/t,i=ge[n];return r<=i?1:Math.max(.5,1-(r-i)/i*.5)}var Z=Object.freeze({whooshS:[`dash`,1.45,.35],whooshM:[`dash`,1.1,.45],whooshL:[`dash`,.8,.55],flip:[`dash`,1.25,.45],land:[`slam`,1.5,.35],bodyThud:[`slam`,.9,.55],clang:[`hit`,1.7,.6],tingParry:[`coin`,1.6,.6],crackle:[`magic`,1.7,.45],zap:[`towerShot`,.8,.5],sizzle:[`magic`,.7,.45],fwoomp:[`ult`,1.4,.45],pop:[`poof`,1.1,.55],balloon:[`pickup`,.8,.45],chain:[`hit`,2.1,.4],lightsJingle:[`coin`,1.2,.5],flutter:[`swipe`,1.6,.35],kiss:[`pickup`,1.6,.45],drum:[`slam`,1.2,.5],curtain:[`swipe`,.6,.45],gong:[`horn`,1.6,.5]}),ve=class{win=-1;n=0;time=0;tick(e){this.time+=e}cue(e,n,r=1){let i=Z[e]??Z[`whoosh${e}`];if(!i)return;let a=Math.floor(this.time*10);a!==this.win&&(this.win=a,this.n=0),!(this.n>=3)&&(this.n++,t.play(i[0],{rate:i[1],vol:i[2]*r,at:n}))}},Q=new l,ye=Object.freeze({}),be=class{mesh;ribbons;linger;particles;shock;cam;juice;sfx;lookup;tier=`med`;reduced=!1;constructor(e,t,n,r,i,a,o,s,c){this.mesh=e,this.ribbons=t,this.linger=n,this.particles=r,this.shock=i,this.cam=a,this.juice=o,this.sfx=s,this.lookup=c}relation(e){return e===this.lookup.mySlot?`own`:this.lookup.teamOf(e)===this.lookup.myTeam?`ally`:`enemy`}rim(e){return me[this.relation(e)]}abil(e,t){let n=this.lookup.heroOf(e);return n?C(n,t,this.lookup.talentsOf(e),this.lookup.branchOf(e)):ye}heroPos(e,t){return this.lookup.posOf(e,t)}card(e){return this.lookup.card?.(e)??null}ents=null;projs=null;status(e,t){let n=this.ents?.get(e);return n?(t.buffs=n.buffs,t.shield=n.shield,t.hp=n.hp??0,t.maxHp=n.maxHp??0,!0):!1}facing(e,t){let n=this.lookup.yawOf?.(e)??NaN;return n===n&&(t.x=Math.cos(n),t.y=0,t.z=-Math.sin(n),!0)}projPos(e,t){let n=this.projs;if(!n)return!1;for(let r=0;r<n.length;r++)if(n[r].index===e)return t.x=n[r].fx/1e3,t.y=.6,t.z=-n[r].fy/1e3,!0;return!1}bonePos(e,t,n){let r=this.lookup.bone(e,t===`weaponTip`?`weapon`:t);return r?(r.updateWorldMatrix(!0,!1),t===`weaponTip`?Q.set(0,$,0).applyMatrix4(r.matrixWorld):Q.setFromMatrixPosition(r.matrixWorld),n.x=Q.x,n.y=Q.y,n.z=Q.z,!0):!1}},$=.5;export{ee as _,_e as a,pe as c,F as d,N as f,te as g,P as h,$ as i,fe as l,M as m,ve as n,he as o,j as p,be as r,le as s,Z as t,ce as u};