import{B as e,H as t,S as n,U as r,W as i,X as a,Z as o,_ as s,c,d as l,dt as u,g as d,gt as f,h as p,j as m,l as ee,mt as te,rt as h,s as g,t as _,u as v,x as y,xt as b}from"./three-CE68GREw.js";import{Hr as x}from"./ranger-DzmzXjJ0.js";import{Rn as S,zn as C}from"./index-Lc7Q5sq3.js";function w(e,t){if(typeof document>`u`)return new te;let n=document.createElement(`canvas`);n.width=n.height=e;let r=n.getContext(`2d`);r&&t(r,e);let i=new v(n);return i.colorSpace=h,i.anisotropy=4,i}var T=null,E=null,D=null;function O(){return T??=w(128,(e,t)=>{let n=t/2,r=e.createRadialGradient(n,n,t*.28,n,n,t*.46);r.addColorStop(0,`rgba(255,255,255,0)`),r.addColorStop(.75,`rgba(255,255,255,0.35)`),r.addColorStop(1,`rgba(255,255,255,0)`),e.fillStyle=r,e.fillRect(0,0,t,t),e.strokeStyle=`#fff`,e.lineWidth=t*.06,e.beginPath(),e.arc(n,n,t*.42,0,Math.PI*2),e.stroke()}),T}var k=null,A=null;function j(e,t,n){let r=t/2;e.strokeStyle=`rgba(20,10,16,0.88)`,e.lineWidth=t*.13,e.beginPath(),e.arc(r,r,t*n,0,Math.PI*2),e.stroke(),e.strokeStyle=`#fff`,e.lineWidth=t*.065,e.beginPath(),e.arc(r,r,t*n,0,Math.PI*2),e.stroke()}function ne(){return k??=w(128,(e,t)=>j(e,t,.4)),k}function re(){return A??=w(128,(e,t)=>{j(e,t,.4);let n=t/2;e.lineCap=`round`;for(let[r,i]of[[t*.12,`rgba(20,10,16,0.88)`],[t*.055,`#fff`]]){e.strokeStyle=i,e.lineWidth=r,e.beginPath();for(let r=0;r<4;r++){let i=r*Math.PI/2+Math.PI/4;e.moveTo(n+Math.cos(i)*t*.42,n+Math.sin(i)*t*.42),e.lineTo(n+Math.cos(i)*t*.2,n+Math.sin(i)*t*.2)}e.stroke()}}),A}function M(){return E??=w(128,(e,t)=>{let n=t/2,r=e.createRadialGradient(n,n,0,n,n,t*.5);r.addColorStop(0,`rgba(255,255,255,0.18)`),r.addColorStop(.82,`rgba(255,255,255,0.32)`),r.addColorStop(.9,`rgba(255,255,255,0.95)`),r.addColorStop(.97,`rgba(255,255,255,0.4)`),r.addColorStop(1,`rgba(255,255,255,0)`),e.fillStyle=r,e.fillRect(0,0,t,t)}),E}function N(){return D??=w(256,(e,t)=>{let n=t/2;e.strokeStyle=`#fff`,e.lineWidth=t*.018,e.setLineDash([t*.05,t*.035]),e.beginPath(),e.arc(n,n,t*.48,0,Math.PI*2),e.stroke();let r=e.createRadialGradient(n,n,t*.3,n,n,t*.48);r.addColorStop(0,`rgba(255,255,255,0)`),r.addColorStop(1,`rgba(255,255,255,0.16)`),e.fillStyle=r,e.beginPath(),e.arc(n,n,t*.48,0,Math.PI*2),e.fill()}),D}var P=new e,F=new o,I=new b,L=new b,R=new p,z=new o().setFromEuler(new n(-Math.PI/2,0,0)),B=Object.freeze({blending:5,blendEquation:100,blendSrc:209,blendDst:201,premultipliedAlpha:!0}),V=class{mesh;n=0;constructor(e,n,r={}){let i=new a(1,1),o=new t({map:e,transparent:!0,depthWrite:!1,depthTest:r.depthTest??!0,toneMapped:!1,...r.additive?B:{blending:1},polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2});this.mesh=new m(i,o,n),this.mesh.instanceMatrix.setUsage(y),this.mesh.setColorAt(0,new p(1,1,1)),this.mesh.count=0,this.mesh.frustumCulled=!1,this.mesh.renderOrder=r.renderOrder??2,this.mesh.name=r.name??`decals`,this.y=r.y??.04}y;begin(){this.n=0}add(e,t,n,r,i=1,a=0){this.n>=this.mesh.instanceMatrix.count||(F.setFromAxisAngle(L.set(0,1,0),a).multiply(z),P.compose(L.set(e,this.y,t),F,I.set(n,n,1)),this.mesh.setMatrixAt(this.n,P),R.setHex(r).multiplyScalar(i),this.mesh.setColorAt(this.n,R),this.n++)}end(){this.mesh.count=this.n,this.mesh.instanceMatrix.needsUpdate=!0,this.mesh.instanceColor&&(this.mesh.instanceColor.needsUpdate=!0)}dispose(){this.mesh.geometry.dispose(),this.mesh.material.dispose()}};Object.freeze({Body:0,Head:1,LegFL:2,LegFR:3,LegBL:4,LegBR:5,Tail:6,Weapon:7,Off:8});var H=new e,U=new o,W=new n,G=new b,K=new b,q=new p,ie=class{geos=[];get empty(){return this.geos.length===0}add(e,t,n={}){let r=e;r.deleteAttribute(`uv`),r.getAttribute(`uv1`)&&r.deleteAttribute(`uv1`),W.set(...n.rot??[0,0,0]),U.setFromEuler(W),G.set(...n.scale??[1,1,1]),K.set(...n.at??[0,0,0]),H.compose(K,U,G),r.applyMatrix4(H);let i=r.getAttribute(`position`).count;q.setHex(t,h);let a=new Float32Array(i*3),o=new Float32Array(i),s=new Float32Array(i*3),l=n.pivot??[0,0,0];for(let e=0;e<i;e++)a[e*3]=q.r,a[e*3+1]=q.g,a[e*3+2]=q.b,o[e]=n.part??0,s[e*3]=l[0],s[e*3+1]=l[1],s[e*3+2]=l[2];return r.setAttribute(`color`,new c(a,3)),r.setAttribute(`aPart`,new c(o,1)),r.setAttribute(`aPivot`,new c(s,3)),r.index?(this.geos.push(r.toNonIndexed()),r.dispose()):this.geos.push(r),this}sphere(e,t,n={},r=12){return this.add(new u(e,r,Math.max(6,Math.round(r*.7))),t,n)}box(e,t,n,r,i={}){return this.add(new g(e,t,n),r,i)}cyl(e,t,n,r,i={},a=10){return this.add(new s(e,t,n,a),r,i)}cone(e,t,n,r={},i=8){return this.add(new d(e,t,i),n,r)}capsule(e,t,n,r={}){return this.add(new l(e,t,3,8),n,r)}torus(e,t,n,r={},i=Math.PI*2){return this.add(new f(e,t,6,18,i),n,r)}build(){if(this.geos.length===0)return new ee;let e=_(this.geos,!1);for(let e of this.geos)e.dispose();if(this.geos=[],!e)throw Error(`model merge failed`);return e.computeBoundingSphere(),e}},J=`
attribute float aPart;
attribute vec3 aPivot;
uniform float uTime, uPhase, uWalk, uSwing, uCast;
mat3 plRz(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 plRy(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 plRx(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 plPart(float p){
  float sw = sin(uPhase) * uWalk * 0.75;
  if (p < 0.5) return mat3(1.0);
  if (p < 1.5) return plRz(sin(uTime * 2.1) * 0.05 + uSwing * -0.18 + uCast * 0.22 + uWalk * sin(uPhase * 2.0) * 0.04);
  if (p < 2.5) return plRz(sw);
  if (p < 3.5) return plRz(-sw);
  if (p < 4.5) return plRz(-sw);
  if (p < 5.5) return plRz(sw);
  if (p < 6.5) return plRy(sin(uTime * 3.2 + uPhase * 0.5) * (0.35 + uWalk * 0.25)) * plRz(0.15 * sin(uTime * 1.7));
  if (p < 7.5) return plRz(mix(0.25 + sin(uTime * 1.9) * 0.06, -1.9, uSwing) + uCast * 1.4 + uWalk * sin(uPhase) * 0.18);
  return plRx(uCast * 0.9 + uSwing * 0.3);
}
`,Y=0,ae=`
uniform float uDmg, uEmber, uTime;
varying vec3 vPlObj;
vec2 plH2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float plCrack(vec3 o, float amt){
  vec2 p = vec2(o.x + o.z * 0.73, o.y * 0.8) * 1.25;
  // a little wobble so the edges read as broken stone, not tiles
  p += (plH2(floor(p * 3.0)) - 0.5) * 0.12;
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 c1 = i;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + plH2(i + g) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; c1 = i + g; } else if (d < d2) d2 = d;
  }
  float edge = sqrt(d2) - sqrt(d1);
  float w = 0.07 + 0.07 * amt;
  float line = 1.0 - smoothstep(w * 0.3, w, edge);
  // a few cells' edges crack (more as the damage grows): broken runs, not a tiled wall; the base cracks first
  float keep = step(plH2(c1 * 1.37 + 3.1).x, amt * (0.62 - 0.14 * clamp(o.y * 0.2, 0.0, 1.0)));
  return line * keep;
}
`;function oe(e={}){let t=e.cracks===!0,n={uTime:{value:0},uPhase:{value:0},uWalk:{value:0},uSwing:{value:0},uCast:{value:0},uFlashK:{value:0},uFlash:{value:new p(16777215)},uOpacity:{value:1},uDmg:{value:0},uEmber:{value:0}},r=new i({vertexColors:!0});return r.userData.rig=n,r.onBeforeCompile=e=>{Y++,Object.assign(e.uniforms,n),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>\n${J}${t?`varying vec3 vPlObj;
`:``}`).replace(`#include <beginnormal_vertex>`,`#include <beginnormal_vertex>
mat3 plR = plPart(aPart);
objectNormal = plR * objectNormal;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>\n${t?`vPlObj = transformed;
`:``}transformed = plR * (transformed - aPivot) + aPivot;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\nuniform vec3 uFlash;\nuniform float uFlashK;\nuniform float uOpacity;${t?`\n${ae}`:``}`),e.fragmentShader=t?e.fragmentShader.replace(`#include <color_fragment>`,`#include <color_fragment>
float plCk = 0.0;
if (uDmg > 0.001) plCk = plCrack(vPlObj, uDmg);
diffuseColor.rgb *= 1.0 - 0.86 * plCk;`).replace(`#include <opaque_fragment>`,`#include <opaque_fragment>
gl_FragColor.rgb += plCk * uEmber * vec3(1.3, 0.5, 0.1) * (0.7 + 0.3 * sin(uTime * 9.0 + vPlObj.y * 3.0));
gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlash, uFlashK);
gl_FragColor.a *= uOpacity;`):e.fragmentShader.replace(`#include <opaque_fragment>`,`#include <opaque_fragment>
gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlash, uFlashK);
gl_FragColor.a *= uOpacity;`)},r.customProgramCacheKey=()=>t?`pl-rig-v1-dmg`:`pl-rig-v1`,r}var se=`
attribute float aPart;
attribute vec3 aPivot;
attribute vec4 aAnim;
uniform float uTime;
mat3 plRz(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 plRy(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 plRx(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
// aAnim: x walk phase, y walk weight, z weapon arm (minionInstances.ts minionArm: < 0 cocked back, 1 the strike on the
// contact, > 1 the overshoot, back to 0 on the follow-through), w hit (1 decaying) plus 2 × the own-hit flash (0..8)
varying float vPlFlash;
mat3 plUpright(float p){
  float hw = mod(aAnim.w, 2.0);
  vPlFlash = floor(aAnim.w * 0.5) / 8.0;
  float s = sin(aAnim.x) * aAnim.y;
  float sw = aAnim.z;
  float idle = sin(uTime * 2.1 + aAnim.x * 0.3);
  if (p < 0.5) return mat3(1.0);
  if (p < 1.5) return plRz(idle * 0.04 - sw * 0.2 - hw * 0.35 + aAnim.y * sin(aAnim.x * 2.0) * 0.05);
  if (p < 2.5) return plRz(-s * 0.8) * plRx(-0.08 - hw * 0.5);
  if (p < 3.5) return plRz(s * 0.7 + sw * 2.1) * plRx(0.08 + hw * 0.5);
  if (p < 4.5) return plRz(s * 0.7);
  if (p < 5.5) return plRz(-s * 0.7);
  return plRy(sin(uTime * 3.2 + aAnim.x * 0.5) * (0.3 + aAnim.y * 0.3));
}
`;function ce(){let e={uTime:{value:0}},t=new i({vertexColors:!0});return t.userData.rig=e,t.onBeforeCompile=t=>{Y++,Object.assign(t.uniforms,e),t.vertexShader=t.vertexShader.replace(`#include <common>`,`#include <common>\n${se}`).replace(`#include <beginnormal_vertex>`,`#include <beginnormal_vertex>
mat3 plR = plUpright(aPart);
objectNormal = plR * objectNormal;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
transformed = plR * (transformed - aPivot) + aPivot;`),t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>
varying float vPlFlash;`).replace(`#include <opaque_fragment>`,`#include <opaque_fragment>
float plEdge = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
gl_FragColor.rgb *= 1.0 - 0.5 * smoothstep(0.62, 0.92, plEdge);
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), vPlFlash * 0.75);`)},t.customProgramCacheKey=()=>`pl-rig-v3`,t}var X={};function le(e){let t=X[e];return t||(t=new r,t.name=`shadow-depth-${e}`,X[e]=t),t}var Z=2.6,Q=e=>e?S[e]:Z,ue=e=>e?C[e]:Z,$=e=>Q(e)/Z,de=(e,t)=>t*$(e),fe=e=>e?x[e].w:1,pe=e=>($(e)+fe(e))/2,me=e=>.35*Q(e),he=e=>.72*Q(e);export{de as a,oe as c,ne as d,re as f,O as h,ue as i,ce as l,M as m,me as n,ie as o,N as p,he as r,le as s,pe as t,V as u};