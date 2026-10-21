import{D as e,I as t,K as n,R as r,it as i,k as a,ot as o,q as s,y as c}from"./three-CTf-QKNe.js";var l=`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,u=`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
vec3 pick(vec2 o){
  vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.35, l);
  return c * k;
}
void main(){
  vec3 c = pick(vec2(-1.0, -1.0)) + pick(vec2(1.0, -1.0)) + pick(vec2(-1.0, 1.0)) + pick(vec2(1.0, 1.0));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`,d=`
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 o = vec2(cos(a), sin(a)) * (i < 4 ? 1.5 : 3.0);
    c += texture2D(tSrc, vUv + o * uTexel).rgb * 0.1;
  }
  gl_FragColor = vec4(c, 1.0);
}`,f=`
uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uSat; uniform float uVig; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 b = texture2D(tBloom, vUv).rgb;
  c += b * uBloom;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  vec2 p = vUv - 0.5;
  c *= 1.0 - uVig * smoothstep(0.25, 0.75, length(p * vec2(1.0, 1.3)));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`,p=class{renderer;main;half;quarter;quad;scene=new n;cam=new t(-1,1,1,-1,0,1);thresh;blur;comp;size=new i;boost=0;enabled=!0;get sceneTarget(){return this.main}constructor(t){this.renderer=t;let n={minFilter:e,magFilter:e,depthBuffer:!1,type:c};this.main=new o(4,4,{minFilter:e,magFilter:e,depthBuffer:!0,samples:4,type:c}),this.half=new o(2,2,n),this.quarter=new o(1,1,n);let p=()=>({value:new i(1,1)});this.thresh=new s({uniforms:{tSrc:{value:null},uTexel:p(),uThreshold:{value:.9}},vertexShader:l,fragmentShader:u,depthTest:!1,depthWrite:!1}),this.blur=new s({uniforms:{tSrc:{value:null},uTexel:p()},vertexShader:l,fragmentShader:d,depthTest:!1,depthWrite:!1}),this.comp=new s({uniforms:{tScene:{value:null},tBloom:{value:null},uBloom:{value:.85},uSat:{value:1.05},uVig:{value:.12}},vertexShader:l,fragmentShader:f,depthTest:!1,depthWrite:!1}),this.quad=new a(new r(2,2),this.thresh),this.quad.frustumCulled=!1,this.scene.add(this.quad)}resize(){this.renderer.getDrawingBufferSize(this.size);let e=Math.max(1,Math.floor(this.size.x)),t=Math.max(1,Math.floor(this.size.y));(this.main.width!==e||this.main.height!==t)&&(this.main.setSize(e,t),this.half.setSize(Math.max(1,e>>1),Math.max(1,t>>1)),this.quarter.setSize(Math.max(1,e>>2),Math.max(1,t>>2)))}pass(e,t,n,r){this.quad.material=e,e.uniforms.tSrc&&(e.uniforms.tSrc.value=t);let i=t.image;e.uniforms.uTexel&&e.uniforms.uTexel.value.set(1/Math.max(1,i?.width??1),1/Math.max(1,i?.height??1)),this.renderer.setRenderTarget(n),r(this.scene,this.cam)}render(e,t,n){let r=this.renderer;this.resize();let i=r.info;i.reset(),i.autoReset=!1;try{r.setRenderTarget(this.main),n(e,t),this.pass(this.thresh,this.main.texture,this.half,n),this.pass(this.blur,this.half.texture,this.quarter,n);let i=this.comp.uniforms;i.tScene.value=this.main.texture,i.tBloom.value=this.quarter.texture,i.uSat.value=1.05+.25*this.boost,i.uVig.value=.1+.25*this.boost,i.uBloom.value=.65+.35*this.boost,this.quad.material=this.comp,r.setRenderTarget(null),n(this.scene,this.cam)}finally{i.autoReset=!0,r.setRenderTarget(null)}}dispose(){this.main.dispose(),this.half.dispose(),this.quarter.dispose(),this.thresh.dispose(),this.blur.dispose(),this.comp.dispose(),this.quad.geometry.dispose()}};export{p as PostFx};