import{A as e,B as t,L as n,St as r,V as i,X as a,Z as o,at as s,h as c,k as l,o as u,r as d,v as f,x as p,xt as m,yt as h}from"./three-CE68GREw.js";var g=Object.freeze({rimDay:`#FFE6B8`,rimNight:`#FFD08A`,rimHush:`#F6E6FF`,ink:`#4A2A1E`,blob:`#5A4E7A`,blobA:.35,telegraph:`#FF8A3D`,sparkle:Object.freeze([`#FFF1C4`,`#FFD57A`]),holy:`#FFE3A3`,lantern:`#FFC46B`,fire:`#FF8A3D`});new c(g.rimDay),new m(0,1,0),new r(0,-999,0,3.5),new c(g.lantern),Array.from({length:4},()=>new r(0,-999,0,0)),new c(g.lantern);var _={uFogLow:{value:new c(`#EED6A6`)},uFogBase:{value:0},uFogFalloff:{value:.6},uFogLowMix:{value:.6},uFogFocus:{value:new m},uFogMode:{value:0},uFogClear:{value:5},uFogTopMul:{value:1.5}},v=Object.freeze({low:.7,high:1.15}),y=`#include <fog_pars_vertex>
#ifdef USE_FOG
varying vec3 vFogW;
#endif`,ee=`#include <fog_vertex>
#ifdef USE_FOG
vFogW = (vec4(mvPosition.xyz - viewMatrix[3].xyz, 0.0) * viewMatrix).xyz;
#endif`,b=`
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
  return clamp( hfDist * mix( ${v.low.toFixed(2)}, ${v.high.toFixed(2)}, hfogHeight( w ) ), 0.0, 1.0 );
}
vec3 hfogColor(vec3 w) { return mix( fogColor, uFogLow, hfogHeight( w ) * uFogLowMix ); }
`,te=`#include <fog_pars_fragment>
#ifdef USE_FOG
varying vec3 vFogW;
`+b+`
#endif`;function x(e){return!e||e.fragmentShader.includes(`varying vec3 vFogW`)||(e.uniforms??={},Object.assign(e.uniforms,_),e.vertexShader=e.vertexShader.replace(`#include <fog_pars_vertex>`,y).replace(`#include <fog_vertex>`,ee),e.fragmentShader=e.fragmentShader.replace(`#include <fog_pars_fragment>`,te)),e}var S=new Set,C=new Set([`highp`,`mediump`,`lowp`,`flat`,`smooth`,`invariant`,`centroid`,`noperspective`]);function w(e){return e.replace(/\/\*[\s\S]*?\*\//g,e=>e.replace(/[^\n]/g,``)).replace(/\/\/[^\n]*/g,``)}function ne(e){let t=[],n=0,r=e.length;for(;n<r;){for(;n<r&&/\s/.test(e[n]);)n++;if(n>=r)break;if(e[n]===`#`){let i=n;for(;;){let a=e.indexOf(`
`,i),o=a<0?r:a;if(e[o-1]===`\\`||e[o-1]===`\r`&&e[o-2]===`\\`)i=o+1;else{t.push({kind:`pp`,text:e.slice(n,o).trim()}),n=o+1;break}}continue}let i=n,a=0;for(;i<r;i++){let o=e[i];if(o===`(`)a++;else if(o===`)`)a--;else if(o===`;`&&a===0){t.push({kind:`decl`,text:e.slice(n,i+1).trim()}),i++;break}else if(o===`{`&&a===0){let a=1,o=i+1;for(;o<r&&a>0;o++)e[o]===`{`?a++:e[o]===`}`&&a--;let s=e.slice(n,i);if(/^\s*struct\b/.test(s)){let r=e.indexOf(`;`,o);t.push({kind:`struct`,text:e.slice(n,r+1).trim()}),i=r+1}else t.push({kind:`func`,text:e.slice(n,o).trim()}),i=o;break}else if(o===`#`&&a===0&&/\n\s*$/.test(e.slice(Math.max(n,i-80),i)))break}i<=n&&(i=n+1),n=i}return t}function re(e){let t=[],n=0,r=0;for(let i=0;i<e.length;i++){let a=e[i];a===`(`||a===`[`?n++:a===`)`||a===`]`?n--:a===`,`&&n===0&&(t.push(e.slice(r,i)),r=i+1)}return t.push(e.slice(r)),t.map(e=>e.trim()).filter(Boolean)}function ie(e){let t=e.replace(/;\s*$/,``).trim().split(/\s+/),n=``,r=[],i=0;for(;i<t.length;i++){let e=t[i];if(e===`uniform`||e===`attribute`||e===`varying`||e===`const`||e===`in`||e===`out`)n||=e;else if(C.has(e))r.push(e);else break}if(i>=t.length)return null;let a=t[i];if(a===`precision`)return{storage:`precision`,quals:r,type:a,names:[]};let o=re(t.slice(i+1).join(` `)).map(e=>{let t=/^([A-Za-z_]\w*)\s*(\[[^\]]*\])?/.exec(e);return t?{name:t[1],arr:t[2]??``}:null}).filter(Boolean);return{storage:n,quals:r,type:a,names:o}}function ae(e){let t=/([A-Za-z_]\w*)\s*\(/.exec(e);return t?t[1]:null}function T(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return(t>>>0).toString(36)}function E(e,t){let n=/^mat([234])/.exec(e),r=/\[(\d+)\]/.exec(t??``);return(n?+n[1]:1)*(r?+r[1]:1)}var oe=class{constructor(e,t={}){this.name=e,this.libs=(t.libs??[]).map(e=>typeof e==`string`?{match:e,emit:e}:e).map(e=>({...e,stripped:w(e.match)})),this.shared=new Set(t.shared??[]),this.sharedVaryings=t.sharedVaryings??{},this.prefix=t.prefix??`fxm`,this.modules=[],this._byKey=new Map,this.version=0,this.sealed=-1,this._src=null,this._mats=new Set,this.late=[],this.patch=null,S.add(this)}module(e){let t=e.side??0,n=e.fog!==!1,r=T(e.vertexShader)+`.`+T(e.fragmentShader)+`.`+t+(n?`f`:`n`)+(e.instanced?`i`:``),i=this._byKey.get(r);if(i)return i;let a=this.modules.length,o=this._compileModule(a,e,t,n);return o.key=r,this.modules.push(o),this._byKey.set(r,o),this.version++,this._src=null,this.sealed>=0?(this.late.push(o.name),console.warn(`[uber:${this.name}] module '${o.name}' registered after the program compiled: it gets its own program (register it at import time)`)):this._refreshMaterials(),o}_compileModule(e,t,n,r){let i=`${this.prefix}${e}_`,a=e=>{let t=w(e),n=[];for(let e=0;e<this.libs.length;e++){let r=this.libs[e].stripped;r.trim()&&t.includes(r)&&(t=t.split(r).join(`
`),n.push(e))}return{items:ne(t),libs:n}},o=a(t.vertexShader),s=a(t.fragmentShader),c=t.instanced===`both`?`both`:!!t.instanced||/\binstanceMatrix\b/.test(t.vertexShader),l=new Map,u=[],d=[],f=[],p=[],m=[],h=(e,t)=>{let n=new Map,r=[];for(let a of e){if(a.kind===`pp`){if(/^#\s*include\b/.test(a.text)){(t?p:m).push(a.text);continue}if(/^#\s*(version|extension)\b/.test(a.text))continue;let e=/^#\s*define\s+([A-Za-z_]\w*)/.exec(a.text);e&&n.set(`#`+e[1],null),r.push(a.text);continue}if(a.kind===`struct`){let e=/struct\s+([A-Za-z_]\w*)/.exec(a.text);e&&n.set(e[1],i+e[1]),r.push(a.text);continue}if(a.kind===`func`){let e=ae(a.text);e===`main`?n.set(`main`,i+(t?`vmain`:`fmain`)):e&&n.set(e,i+e),r.push(a.text);continue}let e=ie(a.text);if(!e)r.push(a.text);else if(e.storage!==`precision`){if(e.storage===`varying`||e.storage===`out`&&t||e.storage===`in`&&!t)for(let t of e.names)!(t.name in this.sharedVaryings)&&!u.some(e=>e.name===t.name)&&u.push({name:t.name,type:e.type+t.arr,quals:e.quals.filter(e=>e===`flat`)});else if(e.storage===`attribute`||e.storage===`in`&&t)for(let t of e.names)d.some(e=>e.name===t.name)||d.push({name:t.name,type:e.type});else if(e.storage===`uniform`){let t=e.names.filter(e=>!this.shared.has(e.name)),a=e.names.filter(e=>this.shared.has(e.name));for(let t of a)f.push(`uniform ${e.quals.join(` `)} ${e.type} ${t.name}${t.arr};`.replace(/\s+/g,` `));for(let r of t)l.set(r.name,{type:e.type,arr:r.arr,quals:e.quals}),n.set(r.name,i+r.name);t.length&&r.push(`uniform ${e.quals.join(` `)} ${e.type} ${t.map(e=>e.name+e.arr).join(`, `)};`.replace(/\s+/g,` `))}else{for(let t of e.names)n.set(t.name,i+t.name);r.push(a.text)}}}return{renames:n,keep:r}},g=h(o.items,!0),_=h(s.items,!1);return{index:e,name:t.name??`m${e}`,side:n,fog:r,instanced:c,prefix:i,uniforms:l,varyings:u,attributes:d,sharedDecls:f,incV:p,incF:m,libsV:o.libs,libsF:s.libs,vs:g,fs:_,vSlots:new Map,aSlots:new Map}}source(){if(this._src&&this._src.version===this.version)return this._src;let e=this.modules,t=new Map,n=new Map;for(let r of e){let e=new Map,i=new Map;r.vSlots.clear(),r.aSlots.clear();for(let n of r.varyings){let i=(n.quals.length?n.quals.join(` `)+` `:``)+n.type,a=e.get(i)??0;e.set(i,a+1),r.vSlots.set(n.name,{t:i,i:a}),t.set(i,Math.max(t.get(i)??0,a+1))}for(let e of r.attributes){let t=i.get(e.type)??0;i.set(e.type,t+1),r.aSlots.set(e.name,{t:e.type,i:t}),n.set(e.type,Math.max(n.get(e.type)??0,t+1))}}let r=(e,t,n)=>`${e}_${t.replace(/\[(\d+)\]/,`a$1`).replace(/\s+/g,`_`)}_${n}`,i=(e,t)=>{let n=e.split(` `),i=n.pop(),a=n.join(` `),o=/\[\d+\]/.exec(i)?.[0]??``;return`${a?a+` `:``}varying ${i.replace(/\[\d+\]/,``)} ${r(`fxv`,e,t)}${o};`};for(let t of e)t.vMacro=[...t.vSlots].map(([e,t])=>[e,r(`fxv`,t.t,t.i)]),t.aMacro=[...t.aSlots].map(([e,t])=>[e,r(`fxa`,t.t,t.i)]);let a=e=>{let t=new Set,n=[];for(let r of e){let e=r.replace(/\s+/g,``);t.has(e)||(t.add(e),n.push(r))}return n.sort((e,t)=>+!!/<common>/.test(t)-!!/<common>/.test(e))},o=t=>a(e.flatMap(e=>t?e.incV:e.incF)),s=[...new Set(e.flatMap(e=>e.sharedDecls))],c=t=>[...new Set(e.flatMap(e=>t?e.libsV:e.libsF))].sort((e,t)=>e-t).map(e=>this.libs[e].emit),l=`// uber:${this.name} v${this.version} (${e.length} modules)`,u=(e,t)=>{let n=t?e.vs:e.fs,r=[],i=[];for(let[n,a]of[...e.vMacro,...t?e.aMacro:[]])r.push(`#define ${n} ${a}`),i.push(`#undef ${n}`);for(let[e,t]of n.renames)e.startsWith(`#`)?i.push(`#undef ${e.slice(1)}`):(r.push(`#define ${e} ${t}`),i.push(`#undef ${e}`));let a=e.fog?``:`#ifdef USE_FOG\n#define FXU_FOG_${e.index}\n#undef USE_FOG\n#endif\n`,o=e.fog?``:`#ifdef FXU_FOG_${e.index}\n#define USE_FOG\n#undef FXU_FOG_${e.index}\n#endif\n`;return`// ---- module ${e.index}: ${e.name}\n${a}${r.join(`
`)}\n${n.keep.join(`
`)}\n${i.join(`
`)}\n${o}`},d=(e,t)=>!t||e.instanced===`both`?null:e.instanced?`#ifdef USE_INSTANCING`:`#ifndef USE_INSTANCING`,f=a=>{let f=[l,...o(a),...Object.values(this.sharedVaryings),...s,...c(a)];if(a)for(let[e,t]of n)for(let n=0;n<t;n++)f.push(`attribute ${e} ${r(`fxa`,e,n)};`);for(let[e,n]of t)for(let t=0;t<n;t++)f.push(i(e,t));f.push(`uniform int fxMode;`);let p=[],m=[];for(let t of e){let e=d(t,a),n=u(t,a),r=`${t.prefix}${a?`vmain`:`fmain`}`,i=`if ( fxMode == ${t.index} ) { `;!a&&t.side===0&&(i+=`if ( ! gl_FrontFacing ) discard; `),!a&&t.side===1&&(i+=`if ( gl_FrontFacing ) discard; `),i+=`${r}(); return; }`,p.push(e?`${e}\n${n}\n#endif`:n),m.push(e?`${e}\n  ${i}\n#endif`:`  ${i}`)}let h=a?`  gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );`:`  discard;`;return`${f.join(`
`)}\n${p.join(`
`)}\nvoid main() {\n${m.join(`
`)}\n${h}\n}\n`},p={vertexShader:f(!0),fragmentShader:f(!1),uniforms:{}};this.patch&&this.patch(p);let m=1,h=1;for(let t of e)for(let[,e]of t.uniforms){let t=E(e.type,e.arr);m+=t,h+=t}let g={modules:e.length,attributes:[...n].reduce((e,[t,n])=>e+n*E(t),0)+3,varyings:[...t].reduce((e,[t,n])=>e+n*E(t.split(` `).pop(),/\[\d+\]/.exec(t)?.[0]),0)+Object.keys(this.sharedVaryings).length+ +!!e.some(e=>e.incV.some(e=>/fog_pars_vertex/.test(e))),uniformsV:m,uniformsF:h};return(g.attributes>12||g.varyings>15||h>224||m>256)&&!this._limitWarned&&(this._limitWarned=!0,console.warn(`[uber:${this.name}] near the WebGL 2 minimum limits (${JSON.stringify(g)}): split the group`)),this._src={version:this.version,vertexShader:p.vertexShader,fragmentShader:p.fragmentShader,stats:g},this._src}_refreshMaterials(){if(!this._mats.size)return;let e=this.source();for(let t of this._mats){let n=typeof t.deref==`function`?t.deref():t;n?n.vertexShader!==e.vertexShader&&(n.vertexShader=e.vertexShader,n.fragmentShader=e.fragmentShader,n.needsUpdate=!0):this._mats.delete(t)}}material(e,t={}){let{vertexShader:r,fragmentShader:i,side:a,fog:o,...s}=t,c=this.source(),l=new ce({...s,vertexShader:c.vertexShader,fragmentShader:c.fragmentShader});l.side=2,l.forceSinglePass=!0,l.fog=!0,!l.transparent&&l.blending===1&&(l.blending=0),k(l,{group:this,mod:e}),A(l,e);let u=this,d=l.onBeforeCompile;return l.onBeforeCompile=function(e,t){u.sealed<0&&(u.sealed=u.version),u._fillSamplers(e.uniforms),d&&d!==n.prototype.onBeforeCompile&&d.call(this,e,t)},this._mats.add(typeof WeakRef==`function`?new WeakRef(l):l),l}_fillSamplers(e){if(e)for(let t of this.modules)for(let[n,r]of t.uniforms){if(!/^sampler/.test(r.type))continue;let i=t.prefix+n;i in e||(e[i]={value:O()})}}info(){let e=this.source();return{name:this.name,version:this.version,sealed:this.sealed,late:this.late.slice(),...e.stats,names:this.modules.map(e=>e.name)}}},D=null;function O(){return D||(D=new f(new Uint8Array([255,255,255,255]),1,1),D.needsUpdate=!0,D)}function k(e,t){Object.defineProperty(e.userData,"uber",{value:t,enumerable:!1,writable:!0,configurable:!0})}function A(e,t){let n=e.uniforms??={};n.fxMode={value:t.index},n.fogColor||Object.assign(n,h.clone(d.fog));for(let[e]of t.uniforms){let r=t.prefix+e;Object.prototype.hasOwnProperty.call(n,r)||Object.defineProperty(n,r,{get(){return n[e]},enumerable:!0,configurable:!0})}}function se(e,t){let n=e?.attributes;if(!n)return;n.normal===void 0&&n.position!==void 0&&(n.normal=n.position);let r=t.aMacro;if(r)for(let e=0;e<r.length;e++){let t=n[r[e][0]];t!==void 0&&n[r[e][1]]!==t&&(n[r[e][1]]=t)}}var ce=class extends s{constructor(e){super(e),this.isUberMaterial=!0}onBeforeRender(e,t,n,r,i){let a=this.userData.uber;a&&(se(r,a.mod),i?.isInstancedMesh&&a.mod.instanced===!1&&!this._uberWarned&&(this._uberWarned=!0,console.warn(`[uber:${a.group.name}] '${a.mod.name}' is drawn on an InstancedMesh: register it with instanced: true or 'both'`)))}copy(e){super.copy(e);let t=e.userData?.uber;if(t){k(this,t);for(let[e]of t.mod.uniforms)delete this.uniforms[t.mod.prefix+e];A(this,t.mod);for(let n of t.group.shared)e.uniforms?.[n]&&(this.uniforms[n]=e.uniforms[n]);t.install?.(this),this.onBeforeCompile=e.onBeforeCompile,t.group._mats.add(typeof WeakRef==`function`?new WeakRef(this):this)}return this}},j=()=>h.clone(d.fog);function M(e){return e?.isUberMaterial?(Object.assign(e.uniforms,_),e.userData.hfog=!0,e):(!e?.fog||typeof e.fragmentShader!=`string`||(e.fragmentShader.includes(`varying vec3 vFogW`)||(e.fragmentShader=e.fragmentShader.replace(/\bhfog(Factor|Color)\b/g,`__fxHfog$1`),x(e),e.fragmentShader=e.fragmentShader.replace(/__fxHfog(Factor|Color)/g,`hfog$1`)),e.uniforms??={},Object.assign(e.uniforms,_),e.userData.hfog=!0),e)}var N=`
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
}`,P=`
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
// pawlegends: distance to the segment a-b (the sticker glyphs below are built from capsules)
float fxSeg( vec2 p, vec2 a, vec2 b ) { vec2 pa = p - a, ba = b - a; float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ); return length( pa - ba * h ); }
// pawlegends: a sticker's alpha and shade from its SDF: a crisp edge with a darker ink rim, lit from the upper left
vec2 fxSticker( float sd, vec2 uv ) { return vec2( fxAA( sd, 0.045 ), 1.02 - 0.38 * smoothstep( -0.09, 0.0, sd ) + 0.1 * ( uv.y - uv.x ) * 0.5 ); }

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
  // pawlegends: the cat / dog sticker glyphs (funKit stickers; they were composed of 2-6 dots and read as debug points)
  } else if ( s == 14 ) {                           // ZED: a chunky sleepy "Z"
    float sd = min( min( fxSeg( uv, vec2( -0.5, 0.56 ), vec2( 0.5, 0.56 ) ), fxSeg( uv, vec2( 0.5, 0.56 ), vec2( -0.5, -0.56 ) ) ),
                    fxSeg( uv, vec2( -0.5, -0.56 ), vec2( 0.5, -0.56 ) ) ) - 0.15;
    return fxSticker( sd, uv );
  } else if ( s == 15 ) {                           // PAW: a bean pad and four toe beans
    vec2 q = ( uv - vec2( 0.0, -0.3 ) ) / vec2( 0.5, 0.4 );
    float sd = ( length( q ) - 1.0 ) * 0.4;
    sd = min( sd, length( uv - vec2( -0.6, 0.16 ) ) - 0.19 );
    sd = min( sd, length( uv - vec2( -0.22, 0.52 ) ) - 0.2 );
    sd = min( sd, length( uv - vec2( 0.22, 0.52 ) ) - 0.2 );
    sd = min( sd, length( uv - vec2( 0.6, 0.16 ) ) - 0.19 );
    return fxSticker( sd, uv );
  } else if ( s == 16 ) {                           // NOTE: a music note (round head, stem, flag)
    vec2 q = uv - vec2( -0.22, -0.52 );
    q = vec2( q.x * 0.87 + q.y * 0.5, -q.x * 0.5 + q.y * 0.87 ) / vec2( 0.32, 0.23 );
    float sd = ( length( q ) - 1.0 ) * 0.23;
    sd = min( sd, fxSeg( uv, vec2( 0.06, -0.48 ), vec2( 0.06, 0.74 ) ) - 0.07 );
    sd = min( sd, fxSeg( uv, vec2( 0.06, 0.74 ), vec2( 0.48, 0.34 ) ) - 0.08 );
    return fxSticker( sd, uv );
  } else if ( s == 17 ) {                           // EXCLAIM: "!"
    float sd = min( fxSeg( uv, vec2( 0.0, 0.72 ), vec2( 0.0, -0.12 ) ) - 0.17 + 0.06 * ( 0.72 - uv.y ) * 0.5, length( uv - vec2( 0.0, -0.6 ) ) - 0.17 );
    return fxSticker( sd, uv );
  } else if ( s == 18 ) {                           // BONE: a bar with two knobs at each end
    float sd = fxSeg( uv, vec2( -0.55, 0.0 ), vec2( 0.55, 0.0 ) ) - 0.15;
    sd = min( sd, length( vec2( abs( uv.x ), abs( uv.y ) ) - vec2( 0.62, 0.17 ) ) - 0.2 );
    return fxSticker( sd, uv );
  }
  return vec2( 0.0, 1.0 );
}`,F=`
float fxHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float fxNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( fxHash( i ), fxHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( fxHash( i + vec2( 0.0, 1.0 ) ), fxHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float fxFbm2( vec2 p ) { return fxNoise( p ) * 0.65 + fxNoise( p * 2.13 + 17.1 ) * 0.35; }`,I=`
#include <tonemapping_fragment>
#include <colorspace_fragment>`,L=new oe(`fx`,{libs:[{match:b,emit:`#ifdef USE_FOG\n${b}\n#endif`},N,P,F],shared:[...Object.keys(_),`fogColor`,`fogDensity`,`fogNear`,`fogFar`],sharedVaryings:{vFogW:`#ifdef USE_FOG
varying vec3 vFogW;
#endif`}});function R(e){let t=x({vertexShader:e.vertexShader,fragmentShader:e.fragmentShader,uniforms:{}});return L.module({vertexShader:t.vertexShader,fragmentShader:t.fragmentShader,side:e.side,fog:e.fog!==!1,instanced:e.instanced,name:e.name})}function z(e){let{instanced:t,...n}=e;return M(L.material(R(e),n))}var B=`
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
}`,V=`
uniform vec3 uColor;
uniform float uOpacity, uUseMap;
uniform sampler2D uMap;
varying vec2 vUv;
#include <fog_pars_fragment>
${N}
void main() {
  vec4 c = vec4( uColor, uOpacity );
  if ( uUseMap > 0.5 ) c *= texture2D( uMap, vUv );
  gl_FragColor = vec4( mix( c.rgb, fxFogColor(), fxFog() ), c.a );
  ${I}
}`,H=new Map;for(let e of[!0,!1])for(let t of[0,2,1])H.set(`${e}|${t}`,R({name:`fx.basic${e?``:`.nofog`}${t===0?``:t===2?`.double`:`.back`}`,vertexShader:B,fragmentShader:V,fog:e,side:t,instanced:`both`}));new m,new m,new u,new t,new o;function U(e,t,n=16777215){if(t==null)return e.set(n);if(t.isColor)return e.copy(t);try{return e.set(t)}catch{return e.set(n)}}var W=Object.freeze({SOFT:0,PUFF:1,STAR4:2,STAR5:3,RING:4,SPARK:5,HEART:6,FEATHER:7,DROPLET:8,SHARD:9,STAR8:10,FISH:11,CONFETTI:12,PLUS:13,ZED:14,PAW:15,NOTE:16,EXCLAIM:17,BONE:18}),G=Object.freeze({LINEAR:0,POP:1,HOLD:2,TWINKLE:3,IN_OUT:4}),K=Object.freeze({LINEAR:0,OUT:1,BACK:2,PULSE:3}),q=.8,le=`
attribute vec3 iPos;
attribute vec4 iCol;      // rgb (HDR allowed), alpha
attribute vec4 iPar;      // size (m), stretch (≥ 1 → velocity aligned), rotation (rad), shape id
attribute vec3 iDir;      // world velocity (for stretched sparks)
varying vec2 vUv;
varying vec4 vCol;
varying float vShape;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4( iPos, 1.0 );
  vec2 corner = position.xy * 2.0;          // quad is ±0.5 → ±1
  vUv = corner;
  float size = iPar.x * 0.5;
  vec2 c;
  if ( iPar.y > 1.001 ) {
    vec3 vd = ( modelViewMatrix * vec4( iDir, 0.0 ) ).xyz;
    float l = length( vd.xy );
    vec2 ax = l > 1e-5 ? vd.xy / l : vec2( 0.0, 1.0 );
    vec2 ay = vec2( -ax.y, ax.x );
    c = ax * corner.y * iPar.y + ay * corner.x;
  } else {
    // CONFETTI (shape 12): iPar.y (0..1) is the paper's flip, squashing its width before the spin (ART §8.6)
    vec2 k = abs( iPar.w - 12.0 ) < 0.5 ? vec2( corner.x * max( 0.08, iPar.y ), corner.y ) : corner;
    float cs = cos( iPar.z ), sn = sin( iPar.z );
    c = vec2( cs * k.x - sn * k.y, sn * k.x + cs * k.y );
  }
  mvPosition.xy += c * size;
  // never fill the lens: fade sprites that are almost touching the camera
  vCol = iCol;
  vCol.a *= smoothstep( 0.15, 0.7 + iPar.x * 2.5, -mvPosition.z );   // bigger sprites fade out further from the lens
  vShape = iPar.w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,ue=e=>`
varying vec2 vUv;
varying vec4 vCol;
varying float vShape;
#include <fog_pars_fragment>
${N}
${P}
void main() {
  vec2 sh = fxShape( vShape, vUv );
  float a = sh.x * vCol.a;
  if ( a < 0.004 ) discard;
  vec3 col = vCol.rgb * sh.y;
  float f = fxFog();
  ${e?`gl_FragColor = vec4( col * a * ( 1.0 - f ), 1.0 );`:`gl_FragColor = vec4( mix( col, fxFogColor(), f ), a );`}
  ${I}
}`,J=null;function de(){return J||(J=new a(1,1),J)}function fe(){return{x:0,y:0,z:0,vx:0,vy:0,vz:0,life:.5,size0:.2,size1:.2,grow:K.LINEAR,rot:0,spin:0,gravity:0,drag:0,r:1,g:1,b:1,a:1,intensity:1,shape:W.SOFT,stretch:1,fade:G.LINEAR,floor:-1/0,bounce:.3}}var Y=class{constructor({capacity:t,additive:n,name:r,renderOrder:a=5}){let o=this.capacity=t;this.additive=n,this.limit=t,this.count=0,this.pos=new Float32Array(o*3),this.vel=new Float32Array(o*3),this.age=new Float32Array(o),this.life=new Float32Array(o),this.size0=new Float32Array(o),this.size1=new Float32Array(o),this.grow=new Uint8Array(o),this.rot=new Float32Array(o),this.spin=new Float32Array(o),this.grav=new Float32Array(o),this.drag=new Float32Array(o),this.col=new Float32Array(o*4),this.shape=new Float32Array(o),this.stretch=new Float32Array(o),this.fade=new Uint8Array(o),this.floor=new Float32Array(o),this.bounce=new Float32Array(o),this.seed=new Float32Array(o),this.flat=!1;let s=new e,c=de();s.index=c.index,s.setAttribute(`position`,c.getAttribute(`position`)),this.aPos=new l(new Float32Array(o*3),3).setUsage(p),this.aCol=new l(new Float32Array(o*4),4).setUsage(p),this.aPar=new l(new Float32Array(o*4),4).setUsage(p),this.aDir=new l(new Float32Array(o*3),3).setUsage(p),s.setAttribute(`iPos`,this.aPos),s.setAttribute(`iCol`,this.aCol),s.setAttribute(`iPar`,this.aPar),s.setAttribute(`iDir`,this.aDir),s.instanceCount=0,this.geometry=s,this.material=z({name:`fx.particles.${r}`,vertexShader:le,fragmentShader:ue(n),uniforms:j(),fog:!0,transparent:!0,depthWrite:!1,depthTest:!0,blending:n?2:1}),this.mesh=new i(s,this.material),this.mesh.name=`fx.particles.${r}`,this.mesh.frustumCulled=!1,this.mesh.renderOrder=a,this.mesh.matrixAutoUpdate=!1,this.mesh.visible=!1}spawn(e){if(this.count>=this.limit)return-1;let t=this.count++,n=t*3,r=t*4;this.pos[n]=e.x,this.pos[n+1]=e.y,this.pos[n+2]=e.z,this.vel[n]=e.vx,this.vel[n+1]=e.vy,this.vel[n+2]=e.vz,this.age[t]=0,this.life[t]=Math.max(.016,e.life),this.size0[t]=e.size0,this.size1[t]=e.size1,this.grow[t]=e.grow,this.rot[t]=e.rot,this.spin[t]=e.spin,this.grav[t]=e.gravity,this.drag[t]=e.drag;let i=e.intensity;return this.col[r]=e.r*i,this.col[r+1]=e.g*i,this.col[r+2]=e.b*i,this.col[r+3]=e.a,this.shape[t]=e.shape,this.stretch[t]=e.stretch,this.fade[t]=e.fade,this.floor[t]=e.floor,this.bounce[t]=e.bounce,this.seed[t]=(t*.618034+e.rot*.1591549)%1,t}_kill(e){let t=--this.count;if(e===t)return;let n=e*3,r=t*3,i=e*4,a=t*4;for(let e=0;e<3;e++)this.pos[n+e]=this.pos[r+e],this.vel[n+e]=this.vel[r+e];for(let e=0;e<4;e++)this.col[i+e]=this.col[a+e];this.age[e]=this.age[t],this.life[e]=this.life[t],this.size0[e]=this.size0[t],this.size1[e]=this.size1[t],this.grow[e]=this.grow[t],this.rot[e]=this.rot[t],this.spin[e]=this.spin[t],this.grav[e]=this.grav[t],this.drag[e]=this.drag[t],this.shape[e]=this.shape[t],this.stretch[e]=this.stretch[t],this.fade[e]=this.fade[t],this.floor[e]=this.floor[t],this.bounce[e]=this.bounce[t],this.seed[e]=this.seed[t]}update(e){let t=this.pos,n=this.vel,r=this.aPos.array,i=this.aCol.array,a=this.aPar.array,o=this.aDir.array,s=0;for(;s<this.count;){let c=this.age[s]+=e,l=this.life[s];if(c>=l){this._kill(s);continue}let u=s*3,d=s*4;if(e>0){n[u+1]-=this.grav[s]*e;let r=this.drag[s];if(r>0){let t=Math.exp(-r*e);n[u]*=t,n[u+1]*=t,n[u+2]*=t}if(t[u]+=n[u]*e,t[u+1]+=n[u+1]*e,t[u+2]+=n[u+2]*e,t[u+1]<this.floor[s]){t[u+1]=this.floor[s];let e=this.bounce[s];n[u+1]=Math.abs(n[u+1])*e,n[u]*=.6,n[u+2]*=.6,this.spin[s]*=.5}this.rot[s]+=this.spin[s]*e}let f=c/l,p;switch(this.grow[s]){case K.OUT:p=1-(1-f)*(1-f)*(1-f);break;case K.BACK:{let e=f-1;p=1+2.70158*e*e*e+1.70158*e*e;break}case K.PULSE:p=Math.sin(Math.min(1,f*1.15)*Math.PI);break;default:p=f}let m=this.size0[s]+(this.size1[s]-this.size0[s])*p,h;switch(this.fade[s]){case G.POP:h=f<.12?f/.12:1-(f-.12)/.88;break;case G.HOLD:h=f<.55?1:1-(f-.55)/.45;break;case G.TWINKLE:h=(1-f)*(.55+.45*Math.sin(c*31+s*1.7));break;case G.IN_OUT:h=Math.sin(f*Math.PI);break;default:h=1-f}r[u]=t[u],r[u+1]=t[u+1],r[u+2]=t[u+2],o[u]=n[u],o[u+1]=n[u+1],o[u+2]=n[u+2];let g=this.col;i[d]=g[d],i[d+1]=g[d+1],i[d+2]=g[d+2],i[d+3]=g[d+3]*(h<0?0:h);let _=this.stretch[s];if(this.shape[s]===W.CONFETTI)_=this.flat?1:Math.abs(Math.cos(c*9+this.seed[s]*6.2831853));else if(_>1){let e=n[u],t=n[u+1],r=n[u+2],i=Math.sqrt(e*e+t*t+r*r);_=1+(_-1)*Math.min(1,i/6),_<1.01&&(_=1.01)}a[d]=m>0?m:0,a[d+1]=_,a[d+2]=this.rot[s],a[d+3]=this.shape[s],s++}let c=this.count;this.geometry.instanceCount=c,this.mesh.visible=c>0,c>0&&($(this.aPos,c*3),$(this.aCol,c*4),$(this.aPar,c*4),$(this.aDir,c*3))}clear(){this.count=0,this.geometry.instanceCount=0,this.mesh.visible=!1}dispose(){this.mesh.removeFromParent(),this.geometry.dispose(),this.material.dispose()}},X=new c,Z=new m,pe=class{constructor({rng:e,groundY:t=null}){this.rng=e,this.groundY=t,this.add=new Y({capacity:1200,additive:!0,name:`add`,renderOrder:7}),this.alpha=new Y({capacity:800,additive:!1,name:`alpha`,renderOrder:6}),this.spec=fe(),this.countScale=1}setTier({countScale:e=1,flat:t=!1}={}){this.countScale=Math.max(.1,Math.min(1,e)),this.add.flat=this.alpha.flat=!!t}scaled(e){return e>0?Math.max(1,Math.round(e*this.countScale)):0}attach(e){e.add(this.alpha.mesh,this.add.mesh)}setBudget(e){let t=Math.max(100,e|0);this.add.limit=Math.min(this.add.capacity,Math.round(t*.6)),this.alpha.limit=Math.min(this.alpha.capacity,Math.round(t*.4))}get live(){return this.add.count+this.alpha.count}room(e,t=1,n=q){return this.claim(e,t,n)>=t}claim(e,t=1,n=q){let r=e?this.add:this.alpha,i=Math.floor(r.limit*n)-r.count;return Math.max(0,Math.min(t|0,i))}update(e){this.add.update(e),this.alpha.update(e)}clear(){this.add.clear(),this.alpha.clear()}dispose(){this.add.dispose(),this.alpha.dispose()}begin(){let e=this.spec;return e.vx=e.vy=e.vz=0,e.rot=0,e.spin=0,e.gravity=0,e.drag=0,e.a=1,e.intensity=1,e.stretch=1,e.grow=K.LINEAR,e.fade=G.LINEAR,e.floor=-1/0,e.bounce=.3,e.shape=W.SOFT,e}emit(e){return(e?this.add:this.alpha).spawn(this.spec)}randDir(e,t,n){let r=this.rng;if(!t||n>=Math.PI){let t=r()*2-1,n=r()*Math.PI*2,i=Math.sqrt(1-t*t);return e.set(Math.cos(n)*i,t,Math.sin(n)*i)}let i=Math.cos(n),a=i+(1-i)*r(),o=Math.sqrt(Math.max(0,1-a*a)),s=r()*Math.PI*2,c=t.x,l=t.y,u=t.z,d,f,p;Math.abs(l)<.9?(d=u,f=0,p=-c):(d=0,f=-u,p=l);let m=Math.sqrt(d*d+f*f+p*p)||1;d/=m,f/=m,p/=m;let h=l*p-u*f,g=u*d-c*p,_=c*f-l*d,v=Math.cos(s)*o,y=Math.sin(s)*o;return e.set(d*v+h*y+c*a,f*v+g*y+l*a,p*v+_*y+u*a).normalize()}burst(e,t){let n=this.rng,r=t.exact?t.n??6:this.scaled(t.n??6);U(X,t.color??16777215);let i=t.floor?(this.groundY?.(e.x,e.z,e.y-10)??-1/0)+(t.floorLift??.02):-1/0;for(let a=0;a<r;a++){let r=this.begin(),a=t.jitter??0;r.x=e.x+(n()*2-1)*a,r.y=e.y+(n()*2-1)*a*(t.jitterY??1),r.z=e.z+(n()*2-1)*a,this.randDir(Z,t.dir,t.spread??Math.PI);let o=Q(n,t.speed??[1,2]);if(r.vx=Z.x*o,r.vy=Z.y*o+(t.up??0),r.vz=Z.z*o,t.flat&&(r.vy=(t.up??0)+(n()*2-1)*.2),r.life=Q(n,t.life??[.3,.5]),r.size0=Q(n,t.size??[.1,.2]),r.size1=r.size0*(t.sizeEnd??1),r.grow=t.grow??K.LINEAR,r.fade=t.fade??G.LINEAR,r.rot=n()*Math.PI*2,r.spin=(n()*2-1)*(t.spin??0),r.gravity=t.gravity??0,r.drag=t.drag??0,r.r=X.r,r.g=X.g,r.b=X.b,r.a=t.alpha??1,r.intensity=t.intensity??1,t.tint){let e=(n()*2-1)*t.tint;r.r*=1+e,r.g*=1+e,r.b*=1+e}r.shape=t.shape??W.SOFT,r.stretch=t.stretch??1,r.floor=i,r.bounce=t.bounce??.3,this.emit(!!t.additive)}}single(e,t){U(X,t.color??16777215);let n=this.begin();return n.x=e.x,n.y=e.y,n.z=e.z,n.vx=t.vx??0,n.vy=t.vy??0,n.vz=t.vz??0,n.life=t.life??.2,n.size0=t.size0??.5,n.size1=t.size1??n.size0,n.grow=t.grow??K.OUT,n.fade=t.fade??G.LINEAR,n.rot=t.rot??0,n.spin=t.spin??0,n.r=X.r,n.g=X.g,n.b=X.b,n.a=t.alpha??1,n.intensity=t.intensity??1,n.shape=t.shape??W.SOFT,n.stretch=1,this.emit(t.additive!==!1)}ring(e,t){let n=this.rng,r=this.scaled(t.n??10);U(X,t.color??16777215);let i=t.floor?(this.groundY?.(e.x,e.z,e.y-10)??-1/0)+.02:-1/0;for(let a=0;a<r;a++){let o=a/r*Math.PI*2+n()*.3,s=Math.sin(o),c=Math.cos(o),l=this.begin(),u=t.r0??.2,d=Q(n,t.speed??[2,3]);if(l.x=e.x+s*u,l.y=e.y+(t.y??.05),l.z=e.z+c*u,l.vx=s*d,l.vy=t.up??.3,l.vz=c*d,l.life=Q(n,t.life??[.4,.6]),l.size0=Q(n,t.size??[.25,.35]),l.size1=l.size0*(t.sizeEnd??2),l.grow=K.OUT,l.fade=t.fade??G.LINEAR,l.drag=t.drag??3.5,l.gravity=t.gravity??0,l.rot=n()*6.283,l.spin=(n()*2-1)*(t.spin??1),l.r=X.r,l.g=X.g,l.b=X.b,l.a=t.alpha??.8,l.intensity=t.intensity??1,t.tint){let e=(n()*2-1)*t.tint;l.r*=1+e,l.g*=1+e,l.b*=1+e}l.shape=t.shape??W.PUFF,l.floor=i,this.emit(!!t.additive)}}};function Q(e,t){return Array.isArray(t)?t[0]+(t[1]-t[0])*e():t}function $(e,t){e.clearUpdateRanges(),e.addUpdateRange(0,t),e.needsUpdate=!0}export{U as a,I as c,W as i,j as l,K as n,N as o,pe as r,F as s,G as t,z as u};