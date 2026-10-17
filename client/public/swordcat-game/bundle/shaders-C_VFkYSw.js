import{E as e,S as t,Zt as n,bn as r,gn as i,mt as a,r as o,yn as s}from"./three-DSMtJqNN.js";var c=Object.freeze({rimDay:`#FFE6B8`,rimNight:`#FFD08A`,rimHush:`#F6E6FF`,ink:`#4A2A1E`,blob:`#5A4E7A`,blobA:.35,telegraph:`#FF8A3D`,sparkle:Object.freeze([`#FFF1C4`,`#FFD57A`]),holy:`#FFE3A3`,lantern:`#FFC46B`,fire:`#FF8A3D`}),l={uRim:{value:new t(c.rimDay)},uRimK:{value:.38},uSunDirV:{value:new s(0,1,0)},uGlow:{value:new r(0,-999,0,3.5)},uGlowCol:{value:new t(c.lantern)},uLamps:{value:Array.from({length:4},()=>new r(0,-999,0,0))},uLampCol:{value:new t(c.lantern)},uLampStr:{value:0}},u={uFogLow:{value:new t(`#EED6A6`)},uFogBase:{value:0},uFogFalloff:{value:.6},uFogLowMix:{value:.6},uFogFocus:{value:new s},uFogMode:{value:0},uFogClear:{value:5},uFogTopMul:{value:1.5}},d=Object.freeze({low:.7,high:1.15}),f=`#include <fog_pars_vertex>
#ifdef USE_FOG
varying vec3 vFogW;
#endif`,p=`#include <fog_vertex>
#ifdef USE_FOG
vFogW = (vec4(mvPosition.xyz - viewMatrix[3].xyz, 0.0) * viewMatrix).xyz;
#endif`,m=`
uniform vec3 uFogLow; uniform float uFogBase, uFogFalloff, uFogLowMix;
uniform vec3 uFogFocus; uniform float uFogMode, uFogClear, uFogTopMul;
float hfogHeight(vec3 w) { return exp( - max( w.y - uFogBase, 0.0 ) * uFogFalloff ); }
float hfogFactor(vec3 w, float viewDepth) {
  float dFocus = max( length( w.xz - uFogFocus.xz ) - uFogClear, 0.0 ) * uFogTopMul;
  float dEff = mix( viewDepth, dFocus, uFogMode );
  #ifdef FOG_EXP2
    float hfDist = 1.0 - exp( - fogDensity * fogDensity * dEff * dEff );
  #else
    float hfDist = smoothstep( fogNear, fogFar, dEff );
  #endif
  return clamp( hfDist * mix( ${d.low.toFixed(2)}, ${d.high.toFixed(2)}, hfogHeight( w ) ), 0.0, 1.0 );
}
vec3 hfogColor(vec3 w) { return mix( fogColor, uFogLow, hfogHeight( w ) * uFogLowMix ); }
`,h=`#include <fog_pars_fragment>
#ifdef USE_FOG
varying vec3 vFogW;
`+m+`
#endif`,g=`#ifdef USE_FOG
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hfogColor( vFogW ), hfogFactor( vFogW, vFogDepth ) );
#endif`;function _(e){return!e||e.fragmentShader.includes(`varying vec3 vFogW`)||(e.uniforms??={},Object.assign(e.uniforms,u),e.vertexShader=e.vertexShader.replace(`#include <fog_pars_vertex>`,f).replace(`#include <fog_vertex>`,p),e.fragmentShader=e.fragmentShader.replace(`#include <fog_pars_fragment>`,h)),e}function v(e){return _(e),e.fragmentShader=e.fragmentShader.replace(`#include <fog_fragment>`,g),e}var y=`
#ifdef USE_FOG
uniform vec4 uGlow; uniform vec3 uGlowCol; uniform vec4 uLamps[ 4 ]; uniform vec3 uLampCol; uniform float uLampStr;
float hfogPool(vec3 w, vec4 p) { vec3 d = w - p.xyz; d.y *= 0.5; float l = 1.0 - smoothstep(0.0, max(p.w, 1e-3), length(d)); return l * l * step(0.001, p.w); }
#endif
`,b=`
#ifdef USE_FOG
{
  float hfL = hfogPool(vFogW, uLamps[ 0 ]) + hfogPool(vFogW, uLamps[ 1 ]) + hfogPool(vFogW, uLamps[ 2 ]) + hfogPool(vFogW, uLamps[ 3 ]);
  outgoingLight += diffuseColor.rgb * (uGlowCol * hfogPool(vFogW, uGlow) * 0.6 + uLampCol * hfL * uLampStr);
}
#endif
#include <opaque_fragment>`;function x(e){if(!e?.fragmentShader||e.fragmentShader.includes(`hfogPool(`))return e;let t=e.fragmentShader;return!t.includes(`#include <lights_fragment_begin>`)||!t.includes(`#include <opaque_fragment>`)||!t.includes(`varying vec3 vFogW`)||(e.uniforms??={},Object.assign(e.uniforms,l),e.fragmentShader=t.replace(`#include <fog_pars_fragment>`,`#include <fog_pars_fragment>`+y).replace(`#include <opaque_fragment>`,b)),e}function S(e){if(!e||e.userData?.hfog||e.userData?.noHeightFog||e.fog===!1)return e;let t=e.onBeforeCompile,n=Object.prototype.hasOwnProperty.call(e,`onBeforeCompile`)||e.customProgramCacheKey!==a.prototype.customProgramCacheKey?String(e.customProgramCacheKey()):``;return e.onBeforeCompile=function(e,n){t&&t!==a.prototype.onBeforeCompile&&t.call(this,e,n),v(e),x(e)},e.customProgramCacheKey=()=>n+`|hfog3`,e.userData.hfog=!0,e.needsUpdate=!0,e}function C(e,t){let n=Math.max(Math.hypot(t.x-e.focus.x,t.z-e.focus.z)-e.clear,0)*e.topMul,r=(e.viewDepth??0)*(1-e.mode)+n*e.mode,i=1-Math.exp(-e.density*e.density*r*r),a=Math.exp(-Math.max(t.y-(e.base??0),0)*(e.falloff??.6));return Math.min(1,Math.max(0,i*(d.low+(d.high-d.low)*a)))}var w=new Set,ee=new Set([`highp`,`mediump`,`lowp`,`flat`,`smooth`,`invariant`,`centroid`,`noperspective`]);function T(e){return e.replace(/\/\*[\s\S]*?\*\//g,e=>e.replace(/[^\n]/g,``)).replace(/\/\/[^\n]*/g,``)}function E(e){let t=[],n=0,r=e.length;for(;n<r;){for(;n<r&&/\s/.test(e[n]);)n++;if(n>=r)break;if(e[n]===`#`){let i=n;for(;;){let a=e.indexOf(`
`,i),o=a<0?r:a;if(e[o-1]===`\\`||e[o-1]===`\r`&&e[o-2]===`\\`)i=o+1;else{t.push({kind:`pp`,text:e.slice(n,o).trim()}),n=o+1;break}}continue}let i=n,a=0;for(;i<r;i++){let o=e[i];if(o===`(`)a++;else if(o===`)`)a--;else if(o===`;`&&a===0){t.push({kind:`decl`,text:e.slice(n,i+1).trim()}),i++;break}else if(o===`{`&&a===0){let a=1,o=i+1;for(;o<r&&a>0;o++)e[o]===`{`?a++:e[o]===`}`&&a--;let s=e.slice(n,i);if(/^\s*struct\b/.test(s)){let r=e.indexOf(`;`,o);t.push({kind:`struct`,text:e.slice(n,r+1).trim()}),i=r+1}else t.push({kind:`func`,text:e.slice(n,o).trim()}),i=o;break}else if(o===`#`&&a===0&&/\n\s*$/.test(e.slice(Math.max(n,i-80),i)))break}i<=n&&(i=n+1),n=i}return t}function D(e){let t=[],n=0,r=0;for(let i=0;i<e.length;i++){let a=e[i];a===`(`||a===`[`?n++:a===`)`||a===`]`?n--:a===`,`&&n===0&&(t.push(e.slice(r,i)),r=i+1)}return t.push(e.slice(r)),t.map(e=>e.trim()).filter(Boolean)}function O(e){let t=e.replace(/;\s*$/,``).trim().split(/\s+/),n=``,r=[],i=0;for(;i<t.length;i++){let e=t[i];if(e===`uniform`||e===`attribute`||e===`varying`||e===`const`||e===`in`||e===`out`)n||=e;else if(ee.has(e))r.push(e);else break}if(i>=t.length)return null;let a=t[i];if(a===`precision`)return{storage:`precision`,quals:r,type:a,names:[]};let o=D(t.slice(i+1).join(` `)).map(e=>{let t=/^([A-Za-z_]\w*)\s*(\[[^\]]*\])?/.exec(e);return t?{name:t[1],arr:t[2]??``}:null}).filter(Boolean);return{storage:n,quals:r,type:a,names:o}}function k(e){let t=/([A-Za-z_]\w*)\s*\(/.exec(e);return t?t[1]:null}function A(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return(t>>>0).toString(36)}function j(e,t){let n=/^mat([234])/.exec(e),r=/\[(\d+)\]/.exec(t??``);return(n?+n[1]:1)*(r?+r[1]:1)}var M=class{constructor(e,t={}){this.name=e,this.libs=(t.libs??[]).map(e=>typeof e==`string`?{match:e,emit:e}:e).map(e=>({...e,stripped:T(e.match)})),this.shared=new Set(t.shared??[]),this.sharedVaryings=t.sharedVaryings??{},this.prefix=t.prefix??`fxm`,this.modules=[],this._byKey=new Map,this.version=0,this.sealed=-1,this._src=null,this._mats=new Set,this.late=[],this.patch=null,w.add(this)}module(e){let t=e.side??0,n=e.fog!==!1,r=A(e.vertexShader)+`.`+A(e.fragmentShader)+`.`+t+(n?`f`:`n`)+(e.instanced?`i`:``),i=this._byKey.get(r);if(i)return i;let a=this.modules.length,o=this._compileModule(a,e,t,n);return o.key=r,this.modules.push(o),this._byKey.set(r,o),this.version++,this._src=null,this.sealed>=0?(this.late.push(o.name),console.warn(`[uber:${this.name}] module '${o.name}' registered after the program compiled: it gets its own program (register it at import time)`)):this._refreshMaterials(),o}_compileModule(e,t,n,r){let i=`${this.prefix}${e}_`,a=e=>{let t=T(e),n=[];for(let e=0;e<this.libs.length;e++){let r=this.libs[e].stripped;r.trim()&&t.includes(r)&&(t=t.split(r).join(`
`),n.push(e))}return{items:E(t),libs:n}},o=a(t.vertexShader),s=a(t.fragmentShader),c=t.instanced===`both`?`both`:!!t.instanced||/\binstanceMatrix\b/.test(t.vertexShader),l=new Map,u=[],d=[],f=[],p=[],m=[],h=(e,t)=>{let n=new Map,r=[];for(let a of e){if(a.kind===`pp`){if(/^#\s*include\b/.test(a.text)){(t?p:m).push(a.text);continue}if(/^#\s*(version|extension)\b/.test(a.text))continue;let e=/^#\s*define\s+([A-Za-z_]\w*)/.exec(a.text);e&&n.set(`#`+e[1],null),r.push(a.text);continue}if(a.kind===`struct`){let e=/struct\s+([A-Za-z_]\w*)/.exec(a.text);e&&n.set(e[1],i+e[1]),r.push(a.text);continue}if(a.kind===`func`){let e=k(a.text);e===`main`?n.set(`main`,i+(t?`vmain`:`fmain`)):e&&n.set(e,i+e),r.push(a.text);continue}let e=O(a.text);if(!e)r.push(a.text);else if(e.storage!==`precision`){if(e.storage===`varying`||e.storage===`out`&&t||e.storage===`in`&&!t)for(let t of e.names)!(t.name in this.sharedVaryings)&&!u.some(e=>e.name===t.name)&&u.push({name:t.name,type:e.type+t.arr,quals:e.quals.filter(e=>e===`flat`)});else if(e.storage===`attribute`||e.storage===`in`&&t)for(let t of e.names)d.some(e=>e.name===t.name)||d.push({name:t.name,type:e.type});else if(e.storage===`uniform`){let t=e.names.filter(e=>!this.shared.has(e.name)),a=e.names.filter(e=>this.shared.has(e.name));for(let t of a)f.push(`uniform ${e.quals.join(` `)} ${e.type} ${t.name}${t.arr};`.replace(/\s+/g,` `));for(let r of t)l.set(r.name,{type:e.type,arr:r.arr,quals:e.quals}),n.set(r.name,i+r.name);t.length&&r.push(`uniform ${e.quals.join(` `)} ${e.type} ${t.map(e=>e.name+e.arr).join(`, `)};`.replace(/\s+/g,` `))}else{for(let t of e.names)n.set(t.name,i+t.name);r.push(a.text)}}}return{renames:n,keep:r}},g=h(o.items,!0),_=h(s.items,!1);return{index:e,name:t.name??`m${e}`,side:n,fog:r,instanced:c,prefix:i,uniforms:l,varyings:u,attributes:d,sharedDecls:f,incV:p,incF:m,libsV:o.libs,libsF:s.libs,vs:g,fs:_,vSlots:new Map,aSlots:new Map}}source(){if(this._src&&this._src.version===this.version)return this._src;let e=this.modules,t=new Map,n=new Map;for(let r of e){let e=new Map,i=new Map;r.vSlots.clear(),r.aSlots.clear();for(let n of r.varyings){let i=(n.quals.length?n.quals.join(` `)+` `:``)+n.type,a=e.get(i)??0;e.set(i,a+1),r.vSlots.set(n.name,{t:i,i:a}),t.set(i,Math.max(t.get(i)??0,a+1))}for(let e of r.attributes){let t=i.get(e.type)??0;i.set(e.type,t+1),r.aSlots.set(e.name,{t:e.type,i:t}),n.set(e.type,Math.max(n.get(e.type)??0,t+1))}}let r=(e,t,n)=>`${e}_${t.replace(/\[(\d+)\]/,`a$1`).replace(/\s+/g,`_`)}_${n}`,i=(e,t)=>{let n=e.split(` `),i=n.pop(),a=n.join(` `),o=/\[\d+\]/.exec(i)?.[0]??``;return`${a?a+` `:``}varying ${i.replace(/\[\d+\]/,``)} ${r(`fxv`,e,t)}${o};`};for(let t of e)t.vMacro=[...t.vSlots].map(([e,t])=>[e,r(`fxv`,t.t,t.i)]),t.aMacro=[...t.aSlots].map(([e,t])=>[e,r(`fxa`,t.t,t.i)]);let a=e=>{let t=new Set,n=[];for(let r of e){let e=r.replace(/\s+/g,``);t.has(e)||(t.add(e),n.push(r))}return n.sort((e,t)=>+!!/<common>/.test(t)-!!/<common>/.test(e))},o=t=>a(e.flatMap(e=>t?e.incV:e.incF)),s=[...new Set(e.flatMap(e=>e.sharedDecls))],c=t=>[...new Set(e.flatMap(e=>t?e.libsV:e.libsF))].sort((e,t)=>e-t).map(e=>this.libs[e].emit),l=`// uber:${this.name} v${this.version} (${e.length} modules)`,u=(e,t)=>{let n=t?e.vs:e.fs,r=[],i=[];for(let[n,a]of[...e.vMacro,...t?e.aMacro:[]])r.push(`#define ${n} ${a}`),i.push(`#undef ${n}`);for(let[e,t]of n.renames)e.startsWith(`#`)?i.push(`#undef ${e.slice(1)}`):(r.push(`#define ${e} ${t}`),i.push(`#undef ${e}`));let a=e.fog?``:`#ifdef USE_FOG\n#define FXU_FOG_${e.index}\n#undef USE_FOG\n#endif\n`,o=e.fog?``:`#ifdef FXU_FOG_${e.index}\n#define USE_FOG\n#undef FXU_FOG_${e.index}\n#endif\n`;return`// ---- module ${e.index}: ${e.name}\n${a}${r.join(`
`)}\n${n.keep.join(`
`)}\n${i.join(`
`)}\n${o}`},d=(e,t)=>!t||e.instanced===`both`?null:e.instanced?`#ifdef USE_INSTANCING`:`#ifndef USE_INSTANCING`,f=a=>{let f=[l,...o(a),...Object.values(this.sharedVaryings),...s,...c(a)];if(a)for(let[e,t]of n)for(let n=0;n<t;n++)f.push(`attribute ${e} ${r(`fxa`,e,n)};`);for(let[e,n]of t)for(let t=0;t<n;t++)f.push(i(e,t));f.push(`uniform int fxMode;`);let p=[],m=[];for(let t of e){let e=d(t,a),n=u(t,a),r=`${t.prefix}${a?`vmain`:`fmain`}`,i=`if ( fxMode == ${t.index} ) { `;!a&&t.side===0&&(i+=`if ( ! gl_FrontFacing ) discard; `),!a&&t.side===1&&(i+=`if ( gl_FrontFacing ) discard; `),i+=`${r}(); return; }`,p.push(e?`${e}\n${n}\n#endif`:n),m.push(e?`${e}\n  ${i}\n#endif`:`  ${i}`)}let h=a?`  gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );`:`  discard;`;return`${f.join(`
`)}\n${p.join(`
`)}\nvoid main() {\n${m.join(`
`)}\n${h}\n}\n`},p={vertexShader:f(!0),fragmentShader:f(!1),uniforms:{}};this.patch&&this.patch(p);let m=1,h=1;for(let t of e)for(let[,e]of t.uniforms){let t=j(e.type,e.arr);m+=t,h+=t}let g={modules:e.length,attributes:[...n].reduce((e,[t,n])=>e+n*j(t),0)+3,varyings:[...t].reduce((e,[t,n])=>e+n*j(t.split(` `).pop(),/\[\d+\]/.exec(t)?.[0]),0)+Object.keys(this.sharedVaryings).length+ +!!e.some(e=>e.incV.some(e=>/fog_pars_vertex/.test(e))),uniformsV:m,uniformsF:h};return(g.attributes>12||g.varyings>15||h>224||m>256)&&!this._limitWarned&&(this._limitWarned=!0,console.warn(`[uber:${this.name}] near the WebGL 2 minimum limits (${JSON.stringify(g)}): split the group`)),this._src={version:this.version,vertexShader:p.vertexShader,fragmentShader:p.fragmentShader,stats:g},this._src}_refreshMaterials(){if(!this._mats.size)return;let e=this.source();for(let t of this._mats){let n=typeof t.deref==`function`?t.deref():t;n?n.vertexShader!==e.vertexShader&&(n.vertexShader=e.vertexShader,n.fragmentShader=e.fragmentShader,n.needsUpdate=!0):this._mats.delete(t)}}material(e,t={}){let{vertexShader:n,fragmentShader:r,side:i,fog:o,...s}=t,c=this.source(),l=new B({...s,vertexShader:c.vertexShader,fragmentShader:c.fragmentShader});l.side=2,l.forceSinglePass=!0,l.fog=!0,!l.transparent&&l.blending===1&&(l.blending=0),F(l,{group:this,mod:e}),I(l,e);let u=this,d=l.onBeforeCompile;return l.onBeforeCompile=function(e,t){u.sealed<0&&(u.sealed=u.version),u._fillSamplers(e.uniforms),d&&d!==a.prototype.onBeforeCompile&&d.call(this,e,t)},this._mats.add(typeof WeakRef==`function`?new WeakRef(l):l),l}_fillSamplers(e){if(e)for(let t of this.modules)for(let[n,r]of t.uniforms){if(!/^sampler/.test(r.type))continue;let i=t.prefix+n;i in e||(e[i]={value:P()})}}info(){let e=this.source();return{name:this.name,version:this.version,sealed:this.sealed,late:this.late.slice(),...e.stats,names:this.modules.map(e=>e.name)}}},N=null;function P(){return N||(N=new e(new Uint8Array([255,255,255,255]),1,1),N.needsUpdate=!0,N)}function F(e,t){Object.defineProperty(e.userData,"uber",{value:t,enumerable:!1,writable:!0,configurable:!0})}function I(e,t){let n=e.uniforms??={};n.fxMode={value:t.index},n.fogColor||Object.assign(n,i.clone(o.fog));for(let[e]of t.uniforms){let r=t.prefix+e;Object.prototype.hasOwnProperty.call(n,r)||Object.defineProperty(n,r,{get(){return n[e]},enumerable:!0,configurable:!0})}}function L(e){let t=e?.attributes;t&&t.normal===void 0&&t.position!==void 0&&(t.normal=t.position)}function R(e){e?.traverse?.(e=>{let t=e.material;t&&(t.isUberMaterial||Array.isArray(t)&&t.some(e=>e?.isUberMaterial))&&L(e.geometry)})}function z(e,t){let n=e?.attributes;if(!n)return;n.normal===void 0&&n.position!==void 0&&(n.normal=n.position);let r=t.aMacro;if(r)for(let e=0;e<r.length;e++){let t=n[r[e][0]];t!==void 0&&n[r[e][1]]!==t&&(n[r[e][1]]=t)}}var B=class extends n{constructor(e){super(e),this.isUberMaterial=!0}onBeforeRender(e,t,n,r,i){let a=this.userData.uber;a&&(z(r,a.mod),i?.isInstancedMesh&&a.mod.instanced===!1&&!this._uberWarned&&(this._uberWarned=!0,console.warn(`[uber:${a.group.name}] '${a.mod.name}' is drawn on an InstancedMesh: register it with instanced: true or 'both'`)))}copy(e){super.copy(e);let t=e.userData?.uber;if(t){F(this,t);for(let[e]of t.mod.uniforms)delete this.uniforms[t.mod.prefix+e];I(this,t.mod);for(let n of t.group.shared)e.uniforms?.[n]&&(this.uniforms[n]=e.uniforms[n]);t.install?.(this),this.onBeforeCompile=e.onBeforeCompile,t.group._mats.add(typeof WeakRef==`function`?new WeakRef(this):this)}return this}},V=()=>i.clone(o.fog);function H(e){return e?.isUberMaterial?(Object.assign(e.uniforms,u),e.userData.hfog=!0,e):(!e?.fog||typeof e.fragmentShader!=`string`||(e.fragmentShader.includes(`varying vec3 vFogW`)||(e.fragmentShader=e.fragmentShader.replace(/\bhfog(Factor|Color)\b/g,`__fxHfog$1`),_(e),e.fragmentShader=e.fragmentShader.replace(/__fxHfog(Factor|Color)/g,`hfog$1`)),e.uniforms??={},Object.assign(e.uniforms,u),e.userData.hfog=!0),e)}var U=`
float fxFog() {
#ifdef USE_FOG
  return hfogFactor( vFogW, vFogDepth );
#else
  return 0.0;
#endif
}
vec3 fxFogColor() {
#ifdef USE_FOG
  return hfogColor( vFogW );
#else
  return vec3( 0.0 );
#endif
}`,W=`
float fxDot2( vec2 v ) { return dot( v, v ); }
// iq: n-point star, m in [2, n] controls the point sharpness
float fxStar( vec2 p, float r, float n, float m ) {
  float an = 3.141593 / n, en = 3.141593 / m;
  vec2 acs = vec2( cos( an ), sin( an ) ), ecs = vec2( cos( en ), sin( en ) );
  float bn = mod( atan( p.x, p.y ), 2.0 * an ) - an;
  p = length( p ) * vec2( cos( bn ), abs( sin( bn ) ) );
  p -= r * acs;
  p += ecs * clamp( - dot( p, ecs ), 0.0, r * acs.y / ecs.y );
  return length( p ) * sign( p.x );
}
// iq: heart (p.y from 0 at the tip to ~1 at the lobes)
float fxHeart( vec2 p ) {
  p.x = abs( p.x );
  if ( p.y + p.x > 1.0 ) return sqrt( fxDot2( p - vec2( 0.25, 0.75 ) ) ) - 0.3535534;
  return sqrt( min( fxDot2( p - vec2( 0.0, 1.0 ) ), fxDot2( p - 0.5 * max( p.x + p.y, 0.0 ) ) ) ) * sign( p.x - p.y );
}
float fxAA( float d, float w ) { return 1.0 - smoothstep( -w, w, d ); }

vec2 fxShape( float shape, vec2 uv ) {
  float d = length( uv );
  int s = int( shape + 0.5 );
  if ( s == 0 ) {                                   // SOFT: round glow
    float g = exp( -d * d * 4.5 ) * ( 1.0 - smoothstep( 0.8, 1.0, d ) );
    return vec2( g, 1.0 );
  } else if ( s == 1 ) {                            // PUFF: cotton ball, lit from the upper left
    float a = 1.0 - smoothstep( 0.72, 1.0, d );
    vec3 n = vec3( uv, sqrt( max( 1.0 - d * d, 0.0 ) ) );
    float l = clamp( dot( n, normalize( vec3( -0.45, 0.75, 0.55 ) ) ), 0.0, 1.0 );
    return vec2( a, 0.7 + 0.38 * l );
  } else if ( s == 2 ) {                            // STAR4: twinkle (art.md §8)
    vec2 c = uv * 0.5;
    float core = pow( max( 1.0 - smoothstep( 0.0, 0.5, d * 0.5 ), 0.0 ), 3.0 );
    float star = max( 0.0, 1.0 - abs( c.x ) * 16.0 ) * ( 1.0 - smoothstep( 0.0, 0.5, abs( c.y ) ) )
               + max( 0.0, 1.0 - abs( c.y ) * 16.0 ) * ( 1.0 - smoothstep( 0.0, 0.5, abs( c.x ) ) );
    return vec2( clamp( core + star * 0.8, 0.0, 1.0 ), 1.0 );
  } else if ( s == 3 ) {                            // STAR5: chunky cartoon hit-star
    float sd = fxStar( uv, 0.9, 5.0, 2.6 );
    float a = fxAA( sd, 0.06 );
    return vec2( a, 1.0 - 0.25 * smoothstep( -0.35, 0.0, sd ) );
  } else if ( s == 4 ) {                            // RING
    float a = 1.0 - smoothstep( 0.06, 0.16, abs( d - 0.82 ) );
    return vec2( a, 1.0 );
  } else if ( s == 5 ) {                            // SPARK: tapered streak along uv.y
    float w = 1.0 - smoothstep( 0.0, 1.0, abs( uv.x ) * ( 1.6 + 1.4 * abs( uv.y ) ) );
    float a = w * ( 1.0 - smoothstep( 0.55, 1.0, abs( uv.y ) ) );
    return vec2( a, 1.0 );
  } else if ( s == 6 ) {                            // HEART
    float sd = fxHeart( uv * vec2( 0.62, 0.62 ) + vec2( 0.0, 0.48 ) );
    return vec2( fxAA( sd, 0.03 ), 1.0 - 0.2 * smoothstep( -0.2, 0.0, sd ) );
  } else if ( s == 7 ) {                            // FEATHER: leaf with a spine
    float e = fxDot2( vec2( uv.x * 2.6, uv.y ) );
    float a = 1.0 - smoothstep( 0.75, 1.0, e );
    float spine = 1.0 - smoothstep( 0.0, 0.08, abs( uv.x ) );
    return vec2( a, 0.85 + 0.25 * spine - 0.15 * uv.y );
  } else if ( s == 8 ) {                            // DROPLET: teardrop pointing up
    vec2 p = uv; p.y += 0.25;
    float r = 0.62 - 0.38 * clamp( p.y, 0.0, 1.0 );
    float a = 1.0 - smoothstep( r - 0.08, r, length( vec2( p.x, max( p.y, 0.0 ) * 0.55 + min( p.y, 0.0 ) ) ) );
    vec3 n = vec3( uv, sqrt( max( 1.0 - d * d, 0.0 ) ) );
    return vec2( a, 0.75 + 0.5 * clamp( dot( n, vec3( -0.5, 0.6, 0.6 ) ), 0.0, 1.0 ) );
  } else if ( s == 9 ) {                            // SHARD: kite / chip
    float sd = abs( uv.x ) * 1.7 + abs( uv.y ) - 0.9;
    return vec2( fxAA( sd, 0.05 ), 0.8 + 0.3 * step( 0.0, uv.x ) );
  } else if ( s == 10 ) {                           // STAR8: thin 8-point star with a soft core
    float sd = fxStar( uv, 0.95, 8.0, 5.5 );
    float a = max( fxAA( sd, 0.05 ), exp( -d * d * 10.0 ) );
    return vec2( a, 1.0 );
  } else if ( s == 11 ) {                           // FISH (silhouette)
    float body = fxDot2( vec2( uv.x * 1.6 + 0.15, uv.y * 3.2 ) ) - 1.0;
    vec2 t = vec2( uv.x - 0.62, abs( uv.y ) );
    float tail = max( t.y - 0.05 - t.x * 1.2, -t.x ) ;
    float a = max( fxAA( body, 0.12 ), fxAA( max( tail, t.x - 0.32 ), 0.04 ) );
    return vec2( a, 0.85 + 0.25 * step( uv.y, 0.0 ) );
  } else if ( s == 12 ) {                           // CONFETTI: rounded paper rect (the flip squashes the quad's width)
    vec2 q = abs( uv ) - vec2( 0.5, 0.82 );
    float sd = length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - 0.14;
    return vec2( fxAA( sd, 0.06 ), 0.82 + 0.3 * step( 0.0, uv.x * uv.y ) );
  } else if ( s == 13 ) {                           // PLUS: chunky rounded heal cross (ART §8.6), lit top-left
    vec2 a = abs( uv );
    vec2 q1 = a - vec2( 0.78, 0.28 ), q2 = a - vec2( 0.28, 0.78 );
    float b1 = length( max( q1, 0.0 ) ) + min( max( q1.x, q1.y ), 0.0 );
    float b2 = length( max( q2, 0.0 ) ) + min( max( q2.x, q2.y ), 0.0 );
    return vec2( fxAA( min( b1, b2 ) - 0.1, 0.06 ), 0.9 + 0.2 * step( uv.y, uv.x ) );
  }
  return vec2( 0.0, 1.0 );
}`,G=`
float fxHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float fxNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( fxHash( i ), fxHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( fxHash( i + vec2( 0.0, 1.0 ) ), fxHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float fxFbm2( vec2 p ) { return fxNoise( p ) * 0.65 + fxNoise( p * 2.13 + 17.1 ) * 0.35; }`,K=`
#include <tonemapping_fragment>
#include <colorspace_fragment>`,q=new M(`fx`,{libs:[{match:m,emit:`#ifdef USE_FOG\n${m}\n#endif`},U,W,G],shared:[...Object.keys(u),`fogColor`,`fogDensity`,`fogNear`,`fogFar`],sharedVaryings:{vFogW:`#ifdef USE_FOG
varying vec3 vFogW;
#endif`}});function J(e){let t=_({vertexShader:e.vertexShader,fragmentShader:e.fragmentShader,uniforms:{}});return q.module({vertexShader:t.vertexShader,fragmentShader:t.fragmentShader,side:e.side,fog:e.fog!==!1,instanced:e.instanced,name:e.name})}function Y(e){let{instanced:t,...n}=e;return H(q.material(J(e),n))}var X=`
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = vec4( position, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,Z=`
uniform vec3 uColor;
uniform float uOpacity, uUseMap;
uniform sampler2D uMap;
varying vec2 vUv;
#include <fog_pars_fragment>
${U}
void main() {
  vec4 c = vec4( uColor, uOpacity );
  if ( uUseMap > 0.5 ) c *= texture2D( uMap, vUv );
  gl_FragColor = vec4( mix( c.rgb, fxFogColor(), fxFog() ), c.a );
  ${K}
}`,Q=new Map;for(let e of[!0,!1])for(let t of[0,2,1])Q.set(`${e}|${t}`,J({name:`fx.basic${e?``:`.nofog`}${t===0?``:t===2?`.double`:`.back`}`,vertexShader:X,fragmentShader:Z,fog:e,side:t,instanced:`both`}));function $(e){let t=e.uniforms;Object.defineProperty(e,"color",{get:()=>t.uColor.value,set:e=>t.uColor.value.copy(e),configurable:!0}),Object.defineProperty(e,"fxMap",{get:()=>t.uMap.value,set:e=>{t.uMap.value=e??null,t.uUseMap.value=+!!e},configurable:!0}),Object.defineProperty(e,"opacity",{get:()=>t.uOpacity.value,set:e=>{t.uOpacity.value=e},configurable:!0})}function te(e={}){let{color:n=`#ffffff`,map:r=null,opacity:i=1,fog:a=!0,side:o=0,...s}=e,c=Q.get(`${a!==!1}|${o}`)??Q.get(`true|0`),l={uColor:{value:new t(n)},uOpacity:{value:i},uMap:{value:r},uUseMap:{value:+!!r}},u=q.material(c,{...s,uniforms:l});return u.userData.uber.install=$,$(u),u.userData.fxBasic=!0,a===!1&&(u.userData.noHeightFog=!0),H(u)}export{V as a,Y as c,C as d,S as f,W as i,R as l,c as m,G as n,te as o,l as p,K as r,J as s,U as t,u};