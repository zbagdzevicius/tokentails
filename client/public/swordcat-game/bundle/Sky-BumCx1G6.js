import{S as e,Yt as t,_ as n,an as r,on as i,rn as a,vt as o,yn as s,z as c}from"./three-DSMtJqNN.js";import{c as l,o as u,s as d}from"./shaders-C_VFkYSw.js";var f=`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w;            // always at the far plane
}`,p=`
uniform vec3 uTop, uHorizon, uGround, uSunColor;
uniform vec3 uSunDir;
uniform float uSunGlow, uTime, uClouds, uExposure;
varying vec3 vDir;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // top → horizon (the horizon band is exactly the fog colour), below the horizon stay at the fog colour
  float t = smoothstep(0.0, 0.55, h);
  vec3 col = mix(uHorizon, uTop, pow(t, 0.8));
  // slow cloud banks (low contrast, only above the horizon)
  vec2 uv = d.xz / max(0.12, h + 0.25);
  float c = fbm(uv * 1.6 + vec2(uTime * 0.004, uTime * 0.0025));
  float band = smoothstep(0.02, 0.25, h) * (1.0 - smoothstep(0.55, 0.95, h));
  col = mix(col, col * 1.06 + 0.015, smoothstep(0.45, 0.8, c) * band * uClouds);
  col = mix(col, col * 0.93, smoothstep(0.55, 0.3, c) * band * uClouds * 0.6);
  // soft sun glow
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 8.0) * 0.18 + pow(sd, 64.0) * 0.35) * uSunGlow * smoothstep(-0.05, 0.1, h);
  gl_FragColor = vec4(col * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;d({name:`sky`,side:1,fog:!1,vertexShader:f,fragmentShader:p});var m=class{constructor(t=450){this.uniforms={uTop:{value:new e(`#8FCBF2`)},uHorizon:{value:new e(`#F6E4C0`)},uGround:{value:new e(`#C9A46A`)},uSunColor:{value:new e(`#FFE7C2`)},uSunDir:{value:new s(-.5,.6,.6)},uSunGlow:{value:1},uTime:{value:0},uClouds:{value:1},uExposure:{value:1}},this.material=l({name:`sky`,uniforms:this.uniforms,vertexShader:f,fragmentShader:p,side:1,depthWrite:!1,depthTest:!0,fog:!1,toneMapped:!0}),this.material.userData.noHeightFog=!0,this.mesh=new o(new a(t,32,16),this.material),this.mesh.name=`sky`,this.mesh.frustumCulled=!1,this.mesh.renderOrder=-1e3,this.mesh.userData.owned=!0}update(e,t){this.mesh.position.copy(e.position),this.uniforms.uTime.value=t}dispose(){this.mesh.removeFromParent(),this.mesh.geometry.dispose(),this.material.dispose()}},h=Object.freeze({skyline:`#8E86C0`,skylineFog:.55,horizon:`#5E9A62`,horizonFog:.6,forest:`#3E7A62`,bog:`#4E8A80`,night:`#5A4E90`}),g=class{constructor({base:t=h.skyline,toFog:n=h.skylineFog}={}){this.base=new e(t),this.toFog=n,this.material=u({color:t,fog:!1}),this.material.userData.noHeightFog=!0,this.group=new c,this.group.name=`skyline`}add(e){return e.traverse(e=>{e.isMesh&&(e.material=this.material,e.castShadow=!1,e.receiveShadow=!1,e.renderOrder=-10)}),this.group.add(e),e}update(e){this.material.color.copy(this.base).lerp(e,this.toFog)}dispose(){this.material.dispose()}},_=null;function v(){if(_)return _;if(typeof document>`u`)return null;let e=document.createElement(`canvas`);e.width=e.height=128;let r=e.getContext(`2d`),i=r.createRadialGradient(64,64,0,64,64,64);return i.addColorStop(0,`rgba(255,255,255,1)`),i.addColorStop(.18,`rgba(255,255,255,0.75)`),i.addColorStop(.45,`rgba(255,255,255,0.22)`),i.addColorStop(1,`rgba(255,255,255,0)`),r.fillStyle=i,r.fillRect(0,0,128,128),_=new n(e),_.colorSpace=t,_}function y({color:t=`#FFC46B`,size:n=6,intensity:a=2.5,fog:o=!1}={}){let s=new i({map:v(),color:new e(t).multiplyScalar(a),blending:2,transparent:!0,depthWrite:!1,fog:o});s.userData.noHeightFog=!0;let c=new r(s);return c.scale.setScalar(n),c.renderOrder=5,c.userData.owned=!0,c}export{y as i,g as n,m as r,h as t};