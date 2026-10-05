// temp helper (scratch): render a GLB turntable to PNGs. Usage: node .mascot-render.mjs in.glb outPrefix
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
const [,, glb, outPrefix] = process.argv;
const three = path.resolve('node_modules/three');
const html = `<!doctype html><html><body style="margin:0;background:#3b2350">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'; import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'; import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js'; import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); r.setSize(768,768); r.outputColorSpace=THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
const s=new THREE.Scene(); s.background=new THREE.Color('#3b2350');
const pm=new THREE.PMREMGenerator(r); s.environment=pm.fromScene(new RoomEnvironment(),0.04).texture; r.toneMapping=THREE.ACESFilmicToneMapping; s.add(new THREE.HemisphereLight(0xffffff,0x553366,1.6)); const d=new THREE.DirectionalLight(0xffffff,2.2); d.position.set(2,3,4); s.add(d);
const c=new THREE.PerspectiveCamera(30,1,0.01,100);
new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('/model.glb',g=>{const o=g.scene; const b=new THREE.Box3().setFromObject(o); const sz=b.getSize(new THREE.Vector3()); const ctr=b.getCenter(new THREE.Vector3()); o.position.sub(ctr); s.add(o);
 const dist=Math.max(sz.x,sz.y,sz.z)*2.3; let tris=0; o.traverse(m=>{if(m.isMesh) tris+=m.geometry.index?m.geometry.index.count/3:m.geometry.attributes.position.count/3});
 window.shot=(deg)=>{const a=deg*Math.PI/180; c.position.set(Math.sin(a)*dist,sz.y*0.15,Math.cos(a)*dist); c.lookAt(0,0,0); r.render(s,c); return r.domElement.toDataURL('image/png');};
 let mats=[]; o.traverse(m=>{if(m.isMesh){const mm=m.material; mats.push({metal:mm.metalness,rough:mm.roughness,map:!!mm.map,mrMap:!!mm.metalnessMap})}}); window.info={mats,tris,size:[sz.x,sz.y,sz.z]}; window.ready=true;});
</script></body></html>`;
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal','--enable-gpu-rasterization','--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.route('http://m.local/**', rt => { const u = new URL(rt.request().url()).pathname;
  if (u === '/') return rt.fulfill({ body: html, contentType: 'text/html' });
  if (u === '/model.glb') return rt.fulfill({ body: readFileSync(glb), contentType: 'model/gltf-binary' });
  if (u.startsWith('/three/')) return rt.fulfill({ body: readFileSync(path.join(three, u.slice(7))), contentType: 'text/javascript' });
  rt.fulfill({ status: 404 }); });
await p.goto('http://m.local/'); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
const { writeFileSync } = await import('fs');
for (const deg of [0, 45, 90, 180, 270]) { const u = await p.evaluate(d => window.shot(d), deg); writeFileSync(`${outPrefix}-${deg}.png`, Buffer.from(u.split(',')[1], 'base64')); }
console.log(JSON.stringify(await p.evaluate(() => window.info)));
await b.close();
