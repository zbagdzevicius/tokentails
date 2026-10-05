import{$ as e,A as t,B as n,C as r,E as i,F as a,G as o,I as s,J as c,K as l,L as u,N as d,P as f,Q as p,R as m,S as h,T as g,U as _,V as v,W as y,X as b,Y as x,Z as S,_ as C,a as w,c as ee,d as T,f as te,h as E,i as ne,j as re,k as ie,l as ae,m as oe,n as se,o as D,p as ce,q as le,r as O,s as ue,u as de,v as fe,w as k,x as A,z as pe}from"./three-DrKrT-qK.js";var me=[`SLEEP`,`DIGGING`,`GROOMING`,`HIT`,`IDLE`,`JUMPING`,`LOAF`,`RUNNING`,`SITTING`,`WALKING`],he={night:`#0d0616`,plum:`#301934`,violet:`#4B0082`,grape:`#6F2DA8`,lavender:`#9966CC`,coin:`#FFC93C`,cream:`#FCECBB`,ember:`#C1260F`,rust:`#EE642A`,pink:`#FF7AA2`,mint:`#D5F4E5`,sky:`#C4E2FC`,lilac:`#F0C5FD`,outline:`#2a0f1f`},ge=Object.freeze({dx:0,dy:0,swap:!1,interact:!1,meow:!1}),_e={BASE_URL:`/heist-game/`,DEV:!1,HEIST_DEPLOYMENTS_URL:`/shelter-payouts/deployments.json`,HEIST_PAYOUTS_URL:`/shelter-payouts`,HEIST_TESTNET_DEPLOYMENTS_URL:`/shelter-payouts/testnet-deployments.json`,MODE:`production`,PROD:!0,SSR:!1},j=_e.BASE_URL??`./`,ve=j===`./`||j===`/`?`assets/`:`${j}assets/`,ye=_e.HEIST_PAYOUTS_URL??`https://tokentails.com/shelter-payouts`,M=_e.HEIST_GIVE_URL??`/shelter-payouts/give`,be=_e.HEIST_DEPLOYMENTS_URL??`${j}payouts/deployments.json`,xe={front:1,back:.82,side:.72,top:1.18,bottom:.55},Se=(()=>{let e=new Float32Array(256);for(let t=0;t<256;t++){let n=t/255;e[t]=n<=.04045?n/12.92:((n+.055)/1.055)**2.4}return e})();function Ce(e,t,n={}){let{w:r,h:i}=t,a=n.alphaThreshold??128,o=n.baseDepth??2,s=n.maxExtra??3,c=new Uint8Array(r*i),l=new Uint32Array(r*i),u=0;for(let n=0;n<i;n++){let i=t.y+n;if(!(i<0||i>=e.height))for(let o=0;o<r;o++){let s=t.x+o;if(s<0||s>=e.width)continue;let d=(i*e.width+s)*4;if(e.data[d+3]>=a){let t=n*r+o;c[t]=1,l[t]=e.data[d]<<16|e.data[d+1]<<8|e.data[d+2],u++}}}let d=r*i,f=new Uint8Array(d),p=new Int32Array(d),m=0,h=0;for(let e=0;e<i;e++)for(let t=0;t<r;t++){let n=e*r+t;c[n]&&(t===0||e===0||t===r-1||e===i-1||!c[n-1]||!c[n+1]||!c[n-r]||!c[n+r])&&(f[n]=1,p[h++]=n)}for(;m<h;){let e=p[m++],t=f[e];if(t>=s)continue;let n=e%r,i=t+1,a=e-1;n>0&&c[a]&&!f[a]&&(f[a]=i,p[h++]=a),a=e+1,n<r-1&&c[a]&&!f[a]&&(f[a]=i,p[h++]=a),a=e-r,a>=0&&c[a]&&!f[a]&&(f[a]=i,p[h++]=a),a=e+r,a<d&&c[a]&&!f[a]&&(f[a]=i,p[h++]=a)}let g=new Uint8Array(r*i);for(let e=0;e<r*i;e++)c[e]&&(g[e]=o+Math.min(f[e]||s,s));let _=n.rim;if(_&&_.amount>0){let e=_.color>>16&255,t=_.color>>8&255,n=_.color&255,a=Math.min(1,_.amount);for(let o=0;o<r*i;o++){if(!c[o]||f[o]!==1)continue;let r=l[o],i=r>>16&255,s=r>>8&255,u=r&255;(.299*i+.587*s+.114*u)/255>_.maxLuma||(l[o]=Math.round(i+(e-i)*a)<<16|Math.round(s+(t-s)*a)<<8|Math.round(u+(n-u)*a))}}return{w:r,h:i,depth:g,color:l,count:u}}var we=new class{pos=new Float32Array(3072);nrm=new Float32Array(3072);col=new Float32Array(3072);idx=new Uint32Array(1536);q=0;r=0;g=0;b=0;reset(){return this.q=0,this}grow(){let e=this.pos.length*2,t=t=>{let n=new Float32Array(e);return n.set(t),n};this.pos=t(this.pos),this.nrm=t(this.nrm),this.col=t(this.col);let n=new Uint32Array(this.idx.length*2);n.set(this.idx),this.idx=n}color(e,t,n){let r=e>>16&255,i=e>>8&255,a=e&255;n?(this.r=Math.min(1,Se[r]*t),this.g=Math.min(1,Se[i]*t),this.b=Math.min(1,Se[a]*t)):(this.r=Math.min(1,r/255*t),this.g=Math.min(1,i/255*t),this.b=Math.min(1,a/255*t))}quad(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m){(this.q+1)*12>this.pos.length&&this.grow();let h=this.q*12,g=this.pos;g[h]=e,g[h+1]=t,g[h+2]=n,g[h+3]=r,g[h+4]=i,g[h+5]=a,g[h+6]=o,g[h+7]=s,g[h+8]=c,g[h+9]=l,g[h+10]=u,g[h+11]=d;let _=this.nrm,v=this.col,{r:y,g:b,b:x}=this;for(let e=h;e<h+12;e+=3)_[e]=f,_[e+1]=p,_[e+2]=m,v[e]=y,v[e+1]=b,v[e+2]=x;let S=this.q*4,C=this.q*6,w=this.idx;w[C]=S,w[C+1]=S+1,w[C+2]=S+2,w[C+3]=S,w[C+4]=S+2,w[C+5]=S+3,this.q++}wallX(e,t,n,r,i,a){a===0?this.stripX(e,t,n,r,-i/2,i/2):(this.stripX(e,t,n,r,a/2,i/2),this.stripX(e,t,n,r,-i/2,-a/2))}stripX(e,t,n,r,i,a){e>0?this.quad(t,n,a,t,n,i,t,r,i,t,r,a,1,0,0):this.quad(t,n,i,t,n,a,t,r,a,t,r,i,-1,0,0)}wallY(e,t,n,r,i,a){a===0?this.stripY(e,t,n,r,-i/2,i/2):(this.stripY(e,t,n,r,a/2,i/2),this.stripY(e,t,n,r,-i/2,-a/2))}stripY(e,t,n,r,i,a){e?this.quad(n,t,a,r,t,a,r,t,i,n,t,i,0,1,0):this.quad(n,t,i,r,t,i,r,t,a,n,t,a,0,-1,0)}};function Te(e,t={}){let{w:n,h:r,depth:i,color:a}=e,o=t.anchorX??n/2,s=t.anchorY??r,c={...xe,...t.shade},l=t.linear??!0,u=we.reset(),d=new Uint8Array(n*r);for(let e=0;e<r;e++)for(let t=0;t<n;t++){let f=e*n+t,p=i[f];if(!p||d[f])continue;let m=a[f],h=1;for(;t+h<n;){let e=f+h;if(d[e]||i[e]!==p||a[e]!==m)break;h++}let g=1;outer:for(;e+g<r;){for(let r=0;r<h;r++){let o=(e+g)*n+t+r;if(d[o]||i[o]!==p||a[o]!==m)break outer}g++}for(let r=0;r<g;r++)for(let i=(e+r)*n+t,a=i+h;i<a;i++)d[i]=1;let _=t-o,v=t+h-o,y=s-e,b=s-(e+g),x=p/2;u.color(m,c.front,l),u.quad(_,b,x,v,b,x,v,y,x,_,y,x,0,0,1),u.color(m,c.back,l),u.quad(v,b,-x,_,b,-x,_,y,-x,v,y,-x,0,0,-1)}for(let e=0;e<2;e++){let t=e===0?1:-1;for(let e=0;e<n;e++){let d=e+t,f=d>=0&&d<n,p=0;for(;p<r;){let d=p*n+e,m=i[d],h=f?i[d+t]:0;if(!m||h>=m){p++;continue}let g=a[d],_=1;for(let e=d+n;p+_<r&&i[e]===m&&(f?i[e+t]:0)===h&&a[e]===g;e+=n)_++;let v=t>0?e+1-o:e-o;u.color(g,c.side,l),u.wallX(t,v,s-(p+_),s-p,m,h),p+=_}}}for(let e=0;e<2;e++){let t=e===0,d=t?-1:1,f=t?c.top:c.bottom;for(let e=0;e<r;e++){let c=e+d,p=c>=0&&c<r,m=d*n,h=e*n,g=0;for(;g<n;){let r=h+g,c=i[r],d=p?i[r+m]:0;if(!c||d>=c){g++;continue}let _=a[r],v=1;for(let e=r+1;g+v<n&&i[e]===c&&(p?i[e+m]:0)===d&&a[e]===_;e++)v++;let y=t?s-e:s-(e+1);u.color(_,f,l),u.wallY(t,y,g-o,g+v-o,c,d),g+=v}}}let f=u.q,p=u.pos.slice(0,f*12),m=f*4,h=u.idx.subarray(0,f*6),g=m>65535?h.slice():new Uint16Array(h),_=1/0,v=1/0,y=1/0,b=-1/0,x=-1/0,S=-1/0;for(let e=0;e<p.length;e+=3){let t=p[e],n=p[e+1],r=p[e+2];t<_&&(_=t),t>b&&(b=t),n<v&&(v=n),n>x&&(x=n),r<y&&(y=r),r>S&&(S=r)}let C=m===0?[0,0,0]:[_,v,y],w=m===0?[0,0,0]:[b,x,S];return{positions:p,normals:u.nrm.slice(0,f*12),colors:u.col.slice(0,f*12),indices:g,voxels:e.count,triangles:f*2,min:C,max:w}}function Ee(e,t){let n=0;for(let r=t.y;r<t.y+t.h&&r<e.height;r++)for(let i=t.x;i<t.x+t.w&&i<e.width;i++)e.data[(r*e.width+i)*4+3]>0&&n++;return n}function De(e,t,n=4){let r=Math.floor(e.width/t),i=Math.floor(e.height/t),a=[];for(let o=0;o<i;o++){let i=0;for(let a=0;a<r&&!(Ee(e,{x:a*t,y:o*t,w:t,h:t})<n);a++)i++;a.push(i)}return a}var Oe=1/24,ke=null,Ae=/^(?:[a-z][a-z0-9+.-]*:|\/)/i;function je(e,t=ve){return Ae.test(e)?e:t+e}function Me(e=ve){return ke||(ke=fetch(e+`manifest.json`).then(e=>{if(!e.ok)throw Error(`manifest.json: HTTP ${e.status}`);return e.json()}),ke.catch(()=>{ke=null})),ke}var Ne=new Map;function Pe(e){let t=Ne.get(e);return t||(t=new Promise((t,n)=>{let r=new Image;r.crossOrigin=`anonymous`,r.decoding=`async`,r.onload=()=>{typeof r.decode==`function`?r.decode().then(()=>t(r),()=>t(r)):t(r)},r.onerror=()=>n(Error(`Failed to load image ${e}`)),r.src=e}),Ne.set(e,t),t.catch(()=>Ne.delete(e))),t}var N=null;function Fe(e,t,n,r=!1){let i=t??e.width,a=n??e.height;N||=document.createElement(`canvas`).getContext(`2d`,{willReadFrequently:!0});let o=N;if(!o)throw Error(`2D canvas unavailable`);let s=o.canvas;return(s.width!==i||s.height!==a)&&(s.width=i,s.height=a),o.imageSmoothingEnabled=r,r&&(o.imageSmoothingQuality=`high`),o.clearRect(0,0,i,a),o.drawImage(e,0,0,i,a),{width:i,height:a,data:o.getImageData(0,0,i,a).data}}var Ie=new Map;function Le(e){let t=Ie.get(e);return t||(t=Pe(e).then(e=>Fe(e)),Ie.set(e,t),t.catch(()=>Ie.delete(e))),t}var Re=new Map;function ze(e){return e.find(e=>e.name===`IDLE`&&e.frames>0)??e.find(e=>e.name===`WALKING`&&e.frames>0)??e.find(e=>e.frames>0)}function Be(e,t=ve,n=48){let r=je(e.sheet,t),i=Re.get(r);return i||(i=Le(r).then(t=>{let i=e.rows;(!i||i.length===0)&&(i=Ve(t,n,e.rowNames));let a=ze(i),o=a?Math.round((a.bounds.minX+a.bounds.maxX+1)/2):n/2,s=a?a.bounds.maxY+1:n;return{id:e.id,name:e.name,url:r,frame:n,cols:e.cols??Math.floor(t.width/n),rows:i,pixels:t,anchorX:o,anchorY:s}}),Re.set(r,i),i.catch(()=>Re.delete(r))),i}function Ve(e,t=48,n){return De(e,t).map((r,i)=>({name:(n?.[i]??`ROW${i}`).toUpperCase(),frames:r,bounds:He(e,t,i,r)}))}function He(e,t,n,r){let i=t,a=t,o=-1,s=-1;for(let c=0;c<r;c++)for(let r=0;r<t;r++)for(let l=0;l<t;l++){let u=((n*t+r)*e.width+c*t+l)*4;e.data[u+3]>0&&(l<i&&(i=l),r<a&&(a=r),l>o&&(o=l),r>s&&(s=r))}return o<0?{minX:0,minY:0,maxX:t-1,maxY:t-1}:{minX:i,minY:a,maxX:o,maxY:s}}function Ue(e,t){let n=t.toUpperCase();return e.rows.findIndex(e=>e.name===n)}function We(e){let t=new te;return t.setAttribute(`position`,new T(e.positions,3)),t.setAttribute(`normal`,new T(e.normals,3)),t.setAttribute(`color`,new T(e.colors,3)),t.setIndex(new T(e.indices,1)),t.boundingBox=new ae(new S(...e.min),new S(...e.max)),t.boundingSphere=new le,t.boundingBox.getBoundingSphere(t.boundingSphere),t.userData.voxels=e.voxels,t.userData.triangles=e.triangles,t}var Ge=new Map,Ke=new te,qe={color:10053324,amount:.55,maxLuma:.2},Je={baseDepth:2,maxExtra:3,rim:qe},Ye={baseDepth:3,maxExtra:0,rim:qe};function Xe(e,t,n,r=Je){let i=Math.max(0,Math.min(e.rows.length-1,t|0)),a=e.rows[i]?.frames??0;if(a<=0)return Ke;let o=((n|0)%a+a)%a,s=r===Je?`${e.url}|${i}|${o}`:r===Ye?`${e.url}|${i}|${o}|lod`:`${e.url}|${i}|${o}|${JSON.stringify(r)}`,c=Ge.get(s);if(!c){let t=e.frame;c=We(Te(Ce(e.pixels,{x:o*t,y:i*t,w:t,h:t},r),{...r,anchorX:e.anchorX,anchorY:e.anchorY})),c.name=s,Ge.set(s,c)}return c}function Ze(e,t){let n=0,r=t??e.rows.map((e,t)=>t);for(let t of r)for(let r=0;r<(e.rows[t]?.frames??0);r++)n+=Xe(e,t,r).userData.triangles??0;return n}function Qe(){for(let e of Ge.values())e.dispose();Ge.clear();for(let e of P.values())e.then(e=>e.dispose()).catch(()=>void 0);P.clear()}var P=new Map;function $e(e,t={}){let n=t.size??16,r=typeof e==`string`?`${e}|${n}|${JSON.stringify(t)}`:``;if(r){let e=P.get(r);if(e)return e}let i=(async()=>{let i;if(typeof e==`string`){let r=await Pe(e),a=n/Math.max(r.width,r.height);i=Fe(r,Math.max(1,Math.round(r.width*a)),Math.max(1,Math.round(r.height*a)),t.smooth??!0)}else i=e.width>n||e.height>n?et(e,n):e;let a={baseDepth:1,maxExtra:2,...t,anchorX:i.width/2,anchorY:i.height/2},o=We(Te(Ce(i,{x:0,y:0,w:i.width,h:i.height},a),a));return o.name=r||`icon`,o})();return r&&(P.set(r,i),i.catch(()=>P.delete(r))),i}function et(e,t){let n=t/Math.max(e.width,e.height),r=Math.max(1,Math.round(e.width*n)),i=Math.max(1,Math.round(e.height*n)),a=new Uint8ClampedArray(r*i*4);for(let t=0;t<i;t++){let n=Math.floor(t*e.height/i),o=Math.max(n+1,Math.floor((t+1)*e.height/i));for(let i=0;i<r;i++){let s=Math.floor(i*e.width/r),c=Math.max(s+1,Math.floor((i+1)*e.width/r)),l=0,u=0,d=0,f=0,p=0;for(let t=n;t<o;t++)for(let n=s;n<c;n++){let r=(t*e.width+n)*4,i=e.data[r+3];l+=e.data[r]*i,u+=e.data[r+1]*i,d+=e.data[r+2]*i,f+=i,p++}let m=(t*r+i)*4;f>0&&(a[m]=l/f,a[m+1]=u/f,a[m+2]=d/f),a[m+3]=f/p}}return{width:r,height:i,data:a}}var F=null,tt=null;function nt(e=`lambert`){if(e===`toon`){if(!tt){let e=new C(new Uint8Array([150,150,150,255,210,210,210,255,255,255,255,255]),3,1,n);e.minFilter=a,e.magFilter=a,e.needsUpdate=!0,tt=new f({vertexColors:!0,gradientMap:e})}return tt}return F||=new d({vertexColors:!0}),F}var I={SLEEP:4,DIGGING:8,GROOMING:8,HIT:12,IDLE:8,JUMPING:10,LOAF:5,RUNNING:12,SITTING:6,WALKING:10,CROUCHED:8,DAMAGE:10,DEAD:8,LYING:4,SNIFFING:8},rt=new Set([`HIT`,`JUMPING`,`DAMAGE`,`DEAD`]),it=class{sheet;object3d;mesh;flipNode;extrude;row=0;frame=0;time=0;fps=8;loop=!0;facing=1;playing=!0;onAnimEnd=null;constructor(e,n={}){this.sheet=e,this.extrude=n.extrude??Je,this.object3d=new r,this.object3d.name=`voxel:${e.id}`,this.flipNode=new r;let i=n.scale??.041666666666666664;this.flipNode.scale.set(i,i,i),this.object3d.add(this.flipNode),this.mesh=new t(Xe(e,0,0,this.extrude),n.material??nt()),this.mesh.castShadow=n.castShadow??!1,this.mesh.receiveShadow=n.receiveShadow??!1,this.mesh.userData.voxelSprite=this,this.flipNode.add(this.mesh);let a=n.anim??(Ue(e,`IDLE`)>=0?`IDLE`:0);if(this.setAnim(a,{restart:!0}),n.phase){let e=this.frameCount();this.time=n.phase*e/this.fps,this.frame=Math.floor(n.phase*e)%Math.max(1,e),this.applyGeometry()}}get anim(){return this.row}get animName(){return this.sheet.rows[this.row]?.name??String(this.row)}get currentFrame(){return this.frame}get facingX(){return this.facing}frameCount(e=this.row){return this.sheet.rows[e]?.frames??0}setAnim(e,t={}){let n=typeof e==`number`?e:Ue(this.sheet,e);if(n<0||n>=this.sheet.rows.length)return this;let r=this.sheet.rows[n].name;return this.fps=t.fps??I[r]??8,this.loop=t.loop??!rt.has(r),n===this.row&&!t.restart&&this.playing?this:(this.row=n,this.frame=0,this.time=0,this.playing=!0,this.applyGeometry(),this)}setFrame(e){let t=Math.max(1,this.frameCount());return this.frame=(e%t+t)%t,this.time=this.frame/this.fps,this.playing=!1,this.applyGeometry(),this}play(){return this.playing=!0,this}pause(){return this.playing=!1,this}setFacing(e){return e!==this.facing&&(this.facing=e,this.flipNode.scale.x=Math.abs(this.flipNode.scale.x)*e),this}faceFromVelocity(e){return e>0?this.setFacing(1):e<0&&this.setFacing(-1),this}update(e){if(!this.playing)return;let t=this.frameCount();if(t<=1)return;this.time+=e;let n=Math.floor(this.time*this.fps);this.loop?n%=t:n>=t-1&&(n=t-1,this.playing=!1,this.onAnimEnd&&this.onAnimEnd(this.row)),n!==this.frame&&(this.frame=n,this.applyGeometry())}triangles(){return this.mesh.geometry.userData.triangles??0}dispose(){this.object3d.removeFromParent(),this.onAnimEnd=null}applyGeometry(){this.mesh.geometry=Xe(this.sheet,this.row,this.frame,this.extrude)}static voxelizeImage(e,t={}){return $e(e,t)}};function at(e,t=2.5){return new E(e).multiplyScalar(t)}var ot={name:`CatnipFinal`,uniforms:{tDiffuse:{value:null},tBloom:{value:null},uExposure:{value:1},uShadowTint:{value:new S(.012,0,.03)},uHighTint:{value:new S(1.04,1,.94)},uSat:{value:1.08},uContrast:{value:1.06},uVignette:{value:.42},uVigColor:{value:new S(.02,.004,.03)},uFlash:{value:new p(1,.1,.05,0)},uAspect:{value:16/9}},vertexShader:`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:`
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform float uExposure, uSat, uContrast, uVignette, uAspect;
    uniform vec3 uShadowTint, uHighTint, uVigColor;
    uniform vec4 uFlash;
    varying vec2 vUv;
    vec3 toSRGB(vec3 c) {
      c = max(c, 0.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    void main() {
      vec3 c = (texture2D(tDiffuse, vUv).rgb + texture2D(tBloom, vUv).rgb) * uExposure;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Split tone: plum lift in the shadows, warm highlights.
      c += uShadowTint * (1.0 - smoothstep(0.0, 0.35, l));
      c *= mix(vec3(1.0), uHighTint, smoothstep(0.25, 1.0, l));
      // Soft shoulder so HDR emissives roll off instead of clipping flat.
      c = c / (1.0 + max(vec3(0.0), c - 0.85) * 0.55);
      vec3 s = toSRGB(c);
      float g = dot(s, vec3(0.299, 0.587, 0.114));
      s = mix(vec3(g), s, uSat);
      s = (s - 0.5) * uContrast + 0.5;
      // Vignette (aspect-aware ellipse).
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) / max(1.0, uAspect * 0.62);
      float v = smoothstep(0.35, 1.05, length(p) * 1.25);
      s = mix(s, toSRGB(uVigColor), v * uVignette);
      // Screen flash (spotted / win), stronger at the edges.
      float edge = mix(0.35, 1.0, smoothstep(0.1, 0.9, length(vUv - 0.5) * 1.6));
      s = mix(s, uFlash.rgb, clamp(uFlash.a * edge, 0.0, 1.0));
      gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
    }`},st=new b(1,0),ct=new b(0,1),lt=new E,ut=class extends se{quad=new D;get output(){return this.renderTargetsHorizontal[0].texture}render(e,t,n){e.getClearColor(lt);let r=e.getClearAlpha(),i=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0);let a=this.quad,o=this.highPassUniforms;o.tDiffuse.value=n.texture,o.luminosityThreshold.value=this.threshold,a.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),a.render(e);let s=this.renderTargetBright;for(let t=0;t<this.nMips;t++){let n=this.separableBlurMaterials[t];a.material=n,n.uniforms.colorTexture.value=s.texture,n.uniforms.direction.value=st,e.setRenderTarget(this.renderTargetsHorizontal[t]),e.clear(),a.render(e),n.uniforms.colorTexture.value=this.renderTargetsHorizontal[t].texture,n.uniforms.direction.value=ct,e.setRenderTarget(this.renderTargetsVertical[t]),e.clear(),a.render(e),s=this.renderTargetsVertical[t]}let c=this.compositeMaterial;a.material=c,c.uniforms.bloomStrength.value=this.strength,c.uniforms.bloomRadius.value=this.radius,c.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),a.render(e),e.setClearColor(lt,r),e.autoClear=i}dispose(){super.dispose(),this.quad.dispose()}},dt=class{composer;bloom;final;renderPass;renderer;constructor(t,n,r,i={}){this.renderer=t;let a=t.getDrawingBufferSize(new b),o=new e(Math.max(1,a.x),Math.max(1,a.y),{type:k,samples:i.samples??4});o.texture.name=`catnip.scene`,this.composer=new ne(t,o),this.renderPass=new O(n,r);let s=new ut(new b(a.x,a.y),i.bloomStrength??.85,i.bloomRadius??.55,i.bloomThreshold??1);this.bloom=s,this.final=new w(ot),this.final.uniforms.tBloom.value=s.output,this.composer.addPass(this.renderPass),this.composer.addPass(this.bloom),this.composer.addPass(this.final),this.setGrade(i)}setGrade(e){let t=this.final.uniforms;e.exposure!==void 0&&(t.uExposure.value=e.exposure),e.shadowTint&&t.uShadowTint.value.set(...e.shadowTint),e.highlightTint&&t.uHighTint.value.set(...e.highlightTint),e.saturation!==void 0&&(t.uSat.value=e.saturation),e.contrast!==void 0&&(t.uContrast.value=e.contrast),e.vignette!==void 0&&(t.uVignette.value=e.vignette),e.vignetteColor&&t.uVigColor.value.set(...e.vignetteColor)}setFlash(e,t){e!==this.flashKey&&(this.flashKey=e,this.flashColor.set(e));let n=this.flashColor;this.final.uniforms.uFlash.value.set(n.r,n.g,n.b,Math.max(0,Math.min(1,t)))}flashKey=null;flashColor=new E;setCamera(e){this.renderPass.camera=e}setSize(e,t){this.composer.setPixelRatio(this.renderer.getPixelRatio()),this.composer.setSize(e,t),this.final.uniforms.uAspect.value=e/Math.max(1,t)}render(e){this.composer.render(e)}dispose(){this.composer.renderTarget1.dispose(),this.composer.renderTarget2.dispose(),this.bloom.dispose(),this.final.dispose?.(),this.composer.dispose?.()}};function L(e=typeof location<`u`?location.search:``){try{let t=new URLSearchParams(e).get(`quality`);return t===`low`||t===`high`?t:null}catch{return null}}var R=`catnip-heist.quality`,z=null;function B(){if(z)return z;try{let e=sessionStorage.getItem(R);(e===`low`||e===`high`)&&(z=e)}catch{}return z}function V(e){z=e;try{sessionStorage.setItem(R,e)}catch{}}function ft(){let e=L();if(e)return{tier:e,probe:null};let t=B();return t?{tier:t,probe:null}:{tier:`high`,probe:new H}}var H=class{seconds;warmup;lowFps;t=0;frames=0;measured=0;result=null;slowRun=0;constructor(e=2,t=.6,n=42){this.seconds=e,this.warmup=t,this.lowFps=n}get done(){return this.result!==null}get tier(){return this.result}get fps(){return this.measured>0?this.frames/this.measured:0}reset(){this.t=0,this.frames=0,this.measured=0,this.result=null,this.slowRun=0}sample(e){return this.result?this.result:!(e>0)||e>1||(this.t+=e,this.t<this.warmup)?null:(this.slowRun=e>1/15?this.slowRun+1:0,this.slowRun>=4?(this.frames++,this.measured+=e,this.result=`low`,V(`low`),this.result):(this.frames++,this.measured+=e,this.measured>=this.seconds&&(this.result=this.fps<this.lowFps?`low`:`high`,V(this.result)),this.result))}},U=2,pt=.85,mt=2,ht=4,gt=`catnip-heist.quality-up`,_t=!1;function vt(){if(_t)return!0;try{_t=sessionStorage.getItem(gt)===`1`}catch{}return _t}function yt(){_t=!0;try{sessionStorage.setItem(gt,`1`)}catch{}}var bt=class{probe;lowFps;allowUp;tier;retry=null;t=0;frames=0;lastFps=0;slowRuns=0;fastRuns=0;constructor(e,t,n=42,r=!0){this.probe=t,this.lowFps=n,this.allowUp=r,this.tier=e}get done(){return!this.probe||this.probe.done}get current(){return this.tier}get fps(){return this.probe&&!this.probe.done?this.probe.fps:this.retry?this.retry.fps:this.lastFps}reset(){this.probe&&!this.probe.done&&this.probe.reset(),this.retry?.reset(),this.t=0,this.frames=0,this.slowRuns=0,this.fastRuns=0}sample(e){if(this.probe&&!this.probe.done){let t=this.probe.sample(e);return t&&(this.tier=t),t}if(this.retry){let t=this.retry.sample(e);return t?(this.retry=null,this.tier=t,this.lastFps=0,t):this.tier}if(!(e>0)||e>1||(this.t+=e,this.frames++,this.t<U))return this.tier;let t=this.frames/this.t;return this.lastFps=t,this.t=0,this.frames=0,this.tier===`high`?(this.slowRuns=t<this.lowFps*pt?this.slowRuns+1:0,this.slowRuns>=mt&&(this.slowRuns=0,this.tier=`low`,V(`low`))):(this.fastRuns=t>=57?this.fastRuns+1:0,this.allowUp&&this.fastRuns>=ht&&!vt()&&(yt(),this.fastRuns=0,this.tier=`high`,this.retry=new H(2,.6,this.lowFps))),this.tier}};function xt(e,t,n,r,i){let a=Math.min(e,t),o=Math.max(1,n)*Math.max(1,r);if(o*a*a<=i)return a;let s=Math.floor(Math.sqrt(i/o)*20)/20;return Math.max(Math.min(1,a),s)}function W(e,t,...n){let r=/^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(e),i=r?r[1]:e,a=document.createElement(i);if(r&&r[2])for(let e of r[2].match(/[.#][\w-]+/g)??[])e[0]===`.`?a.classList.add(e.slice(1)):a.id=e.slice(1);if(t)for(let[e,n]of Object.entries(t))n!=null&&n!==!1&&(e.startsWith(`on`)&&typeof n==`function`?a.addEventListener(e.slice(2),n):e===`class`?a.className+=(a.className?` `:``)+String(n):e===`text`?a.textContent=String(n):a.setAttribute(e,n===!0?``:String(n)));for(let e of n)e!=null&&e!==!1&&a.append(typeof e==`string`?document.createTextNode(e):e);return a}function St(e,t){e.textContent!==t&&(e.textContent=t)}function Ct(){try{return typeof matchMedia==`function`&&matchMedia(`(prefers-reduced-motion: reduce)`).matches}catch{return!1}}function wt(){try{return typeof matchMedia==`function`&&(matchMedia(`(pointer: coarse)`).matches||`ontouchstart`in window)}catch{return!1}}function Tt(e,t=30){let n=Math.max(0,Math.floor(e/t));return`${Math.floor(n/60)}:${String(n%60).padStart(2,`0`)}`}function Et(e){return(e>>>0).toString(16).padStart(8,`0`)}function Dt(e){try{return localStorage.getItem(e)}catch{return null}}function Ot(e,t){try{localStorage.setItem(e,t)}catch{}}function kt(e,t={}){let n=t.size??96,r=document.createElement(`canvas`);return r.width=n,r.height=n,r.setAttribute(`aria-hidden`,`true`),At(r,e,t).catch(()=>void 0),r}async function At(e,t,n={}){let r=n.base??ve,i=await Pe(je(t.sheet,r)),a=(n.row??`IDLE`).toUpperCase(),o=t.rows.findIndex(e=>e.name===a);(o<0||t.rows[o].frames===0)&&(o=Math.max(0,t.rows.findIndex(e=>e.frames>0)));let s=t.rows[o],c=s?.bounds??{minX:0,minY:0,maxX:47,maxY:47},l=Math.min(n.frame??0,Math.max(0,(s?.frames??1)-1)),u=c.maxX-c.minX+1,d=c.maxY-c.minY+1,f=Math.max(u,d)+4,p=(c.minX+c.maxX+1)/2,m=(c.minY+c.maxY+1)/2,h=l*48+p-f/2,g=o*48+m-f/2,_=e.getContext(`2d`);if(!_)return;_.imageSmoothingEnabled=!1,_.clearRect(0,0,e.width,e.height);let v=e.width/f,y=f*v,b=(e.width-y)/2;_.save(),n.flip&&(_.translate(e.width,0),_.scale(-1,1)),_.beginPath(),_.rect(b+(l*48-h)*v,b+(o*48-g)*v,48*v,48*v),_.clip(),_.drawImage(i,h,g,f,f,b,b,y,y),_.restore()}var G=`'Nunito', 'Nunito Fallback', 'Nunito Fallback Android', ui-rounded, system-ui, sans-serif`;function jt(e){return`@font-face {
  font-family: "Nunito";
  font-style: normal;
  font-weight: 200 1000;
  font-display: swap;
  src: url("${e}nunito-latin-wght-normal.woff2?v=ba344451ea") format("woff2-variations"), url("${e}nunito-latin-wght-normal.woff2?v=ba344451ea") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: "Nunito";
  font-style: normal;
  font-weight: 200 1000;
  font-display: swap;
  src: url("${e}nunito-latin-ext-wght-normal.woff2?v=2c8d792869") format("woff2-variations"), url("${e}nunito-latin-ext-wght-normal.woff2?v=2c8d792869") format("woff2");
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;
}
/* nunito on arial */
@font-face {
  font-family: "Nunito Fallback";
  font-style: normal;
  font-weight: 200 599;
  src: local("Arial"), local("ArialMT"), local("Liberation Sans"), local("Roboto");
  size-adjust: 101.39%;
  ascent-override: 99.71%;
  descent-override: 34.82%;
  line-gap-override: 0.00%;
}
/* nunito/700 on arial/700 */
@font-face {
  font-family: "Nunito Fallback";
  font-style: normal;
  font-weight: 600 749;
  src: local("Arial Bold"), local("Arial-BoldMT"), local("Liberation Sans Bold");
  size-adjust: 97.92%;
  ascent-override: 103.25%;
  descent-override: 36.05%;
  line-gap-override: 0.00%;
}
/* nunito/700 on roboto/700 */
@font-face {
  font-family: "Nunito Fallback Android";
  font-style: normal;
  font-weight: 600 749;
  src: local("Roboto Bold");
  size-adjust: 103.95%;
  ascent-override: 97.26%;
  descent-override: 33.96%;
  line-gap-override: 0.00%;
}
/* nunito/800 on arial/700 */
@font-face {
  font-family: "Nunito Fallback";
  font-style: normal;
  font-weight: 750 1000;
  src: local("Arial Bold"), local("Arial-BoldMT"), local("Liberation Sans Bold");
  size-adjust: 100.21%;
  ascent-override: 100.89%;
  descent-override: 35.23%;
  line-gap-override: 0.00%;
}
/* nunito/800 on roboto/700 */
@font-face {
  font-family: "Nunito Fallback Android";
  font-style: normal;
  font-weight: 750 1000;
  src: local("Roboto Bold");
  size-adjust: 106.38%;
  ascent-override: 95.04%;
  descent-override: 33.18%;
  line-gap-override: 0.00%;
}`}var Mt=`
.ch-ui, .ch-ui * { box-sizing: border-box; }
.ch-ui {
  --ch-night:#0b0820; --ch-plum:#301934; --ch-violet:#4b0082; --ch-grape:#6f2da8; --ch-lav:#9966cc;
  --ch-coin:#ffcc55; --ch-cream:#fcecbb; --ch-ember:#c1260f; --ch-rust:#ee642a; --ch-pink:#ff7aa2;
  --ch-mint:#d5f4e5; --ch-sky:#c4e2fc; --ch-lilac:#f0c5fd; --ch-ol:#2a0f1f;
  --ch-sat: env(safe-area-inset-top, 0px); --ch-sar: env(safe-area-inset-right, 0px);
  --ch-sab: env(safe-area-inset-bottom, 0px); --ch-sal: env(safe-area-inset-left, 0px);
  --ch-gap: clamp(8px, 2.2vmin, 16px);
  --ch-glass: linear-gradient(180deg, rgba(86,46,110,.86) 0%, rgba(48,25,58,.88) 55%, rgba(30,14,38,.92) 100%);
  --ch-glass-lite: linear-gradient(180deg, rgba(74,40,98,.8), rgba(34,16,44,.84));
  --ch-rim: inset 0 1px 0 rgba(255,255,255,.22), inset 0 0 0 1px rgba(153,102,204,.55), inset 0 -2px 0 rgba(0,0,0,.28);
  --ch-ease-pop: cubic-bezier(.2,1.4,.4,1);
  position: absolute; inset: 0; pointer-events: none; z-index: 10;
  font-family: 'Cat Paw', ui-rounded, system-ui, sans-serif; color: var(--ch-cream);
  letter-spacing: .02em; line-height: 1.2; user-select: none; -webkit-user-select: none;
  -webkit-font-smoothing: antialiased;
}
.ch-ui :where(button) { font: inherit; color: inherit; letter-spacing: inherit; }
.ch-svg { display: inline-flex; line-height: 0; font-size: 22px; }
.ch-svg svg { display: block; }
.ch-ui :focus-visible { outline: 3px solid var(--ch-sky); outline-offset: 3px; }
.ch-screen { position: absolute; inset: 0; pointer-events: auto; display: none; }
.ch-screen.ch-on { display: flex; }
.ch-screen.ch-enter { animation: ch-screen-in .34s ease-out both; }
@keyframes ch-screen-in { 0% { opacity: 0; } 100% { opacity: 1; } }
.ch-diorama { position: absolute; inset: 0; display: none; pointer-events: none; }
.ch-diorama.ch-on { display: block; }
.ch-diorama canvas { position: absolute; inset: 0; }
.ch-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ---------- iris transition ---------- */
.ch-iris { position: absolute; left: 50%; top: 50%; width: 0; height: 0; border-radius: 50%; pointer-events: none; z-index: 50;
  box-shadow: 0 0 0 200vmax var(--ch-night); opacity: 0; transform: translate(-50%, -50%); }
.ch-iris::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 6px solid var(--ch-coin); box-shadow: 0 0 24px 4px rgba(255,204,85,.6); }
.ch-iris.ch-go { animation: ch-iris .46s cubic-bezier(.55,0,.35,1) both; }
@keyframes ch-iris { 0% { width: 0; height: 0; opacity: 1; } 85% { opacity: 1; } 100% { width: 260vmax; height: 260vmax; opacity: 0; } }

/* ---------- shared widgets ---------- */
.ch-panel {
  position: relative; background: var(--ch-glass);
  border: 3px solid var(--ch-ol); border-radius: 20px;
  box-shadow: 0 6px 0 var(--ch-ol), 0 18px 40px rgba(0,0,0,.45), var(--ch-rim);
  -webkit-backdrop-filter: blur(10px) saturate(1.25); backdrop-filter: blur(10px) saturate(1.25);
}
.ch-panel::before { content: ''; position: absolute; inset: 0; border-radius: 17px; pointer-events: none;
  background: radial-gradient(ellipse 90% 40% at 50% 0%, rgba(240,197,253,.16), rgba(240,197,253,0) 70%); }
.ch-btn {
  --bg: var(--ch-grape); --bg2: #5a2190; --fg: var(--ch-cream); --hi: rgba(255,255,255,.26);
  position: relative; overflow: hidden; isolation: isolate;
  appearance: none; cursor: pointer; min-height: 48px; min-width: 48px; padding: 10px 22px;
  border: 3px solid var(--ch-ol); border-radius: 14px; background: linear-gradient(180deg, var(--bg) 0%, var(--bg) 52%, var(--bg2) 100%); color: var(--fg);
  font-size: clamp(17px, 2.6vmin + 6px, 24px); line-height: 1; text-transform: uppercase;
  box-shadow: 0 5px 0 var(--ch-ol), 0 8px 16px rgba(0,0,0,.3), inset 0 3px 0 var(--hi), inset 0 -4px 0 rgba(0,0,0,.2);
  transition: transform .09s ease, box-shadow .09s ease, filter .15s ease;
  display: inline-flex; align-items: center; justify-content: center; gap: 10px; white-space: nowrap;
  touch-action: manipulation; text-shadow: 0 2px 0 rgba(42,15,31,.35);
}
.ch-btn::after { content: ''; position: absolute; top: -20%; bottom: -20%; left: -60%; width: 40%; z-index: -1; pointer-events: none;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent); transform: skewX(-18deg) translateX(-120%); }
.ch-btn:hover { filter: brightness(1.08) saturate(1.05); transform: translateY(-1px); }
.ch-btn:hover::after { animation: ch-shine .7s ease-out; }
@keyframes ch-shine { to { transform: skewX(-18deg) translateX(480%); } }
.ch-btn:active, .ch-btn.ch-down { transform: translateY(4px); box-shadow: 0 1px 0 var(--ch-ol), inset 0 3px 0 var(--hi), inset 0 -2px 0 rgba(0,0,0,.22); }
.ch-btn[disabled] { filter: grayscale(.7) brightness(.7); cursor: not-allowed; transform: none; }
.ch-btn.ch-primary { --bg: var(--ch-coin); --bg2: #f0a92a; --fg: var(--ch-ol); --hi: rgba(255,255,255,.6); text-shadow: 0 2px 0 rgba(255,255,255,.35); }
.ch-btn.ch-pink { --bg: var(--ch-pink); --bg2: #ec5a88; --fg: var(--ch-ol); --hi: rgba(255,255,255,.5); text-shadow: 0 2px 0 rgba(255,255,255,.3); }
.ch-btn.ch-ghost { --bg: rgba(60,30,74,.88); --bg2: rgba(36,16,46,.92); --hi: rgba(255,255,255,.16); }
.ch-btn.ch-big { font-size: clamp(22px, 3.4vmin + 8px, 34px); padding: 14px 34px; min-height: 60px; border-radius: 18px; }
.ch-btn.ch-icon { padding: 0; width: 48px; height: 48px; border-radius: 50%; font-size: 22px; }
.ch-btn img { width: 1.2em; height: 1.2em; object-fit: contain; image-rendering: auto; }
.ch-btn .ch-svg { font-size: 1em; margin-right: .1em; }
.ch-btn > .ch-bimg { margin-right: .15em; }
.ch-primary.ch-big .ch-bimg { width: 1.1em; height: 1.1em; filter: drop-shadow(0 2px 0 rgba(42,15,31,.35)); }
.ch-title-text {
  margin: 0; font-weight: normal; font-size: clamp(44px, 10vmin + 10px, 118px); line-height: 1; text-transform: uppercase;
  display: flex; flex-direction: column; align-items: center;
}
.ch-title-text > span { display: block; padding: .1em .4em 0; margin-top: -.1em; background: linear-gradient(180deg, #fff6c9 0%, var(--ch-coin) 45%, #f39a1e 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 3px 0 var(--ch-ol)) drop-shadow(3px 0 0 var(--ch-ol)) drop-shadow(-3px 0 0 var(--ch-ol)) drop-shadow(0 -3px 0 var(--ch-ol)) drop-shadow(0 7px 0 #5a2143) drop-shadow(0 14px 18px rgba(0,0,0,.5)); }
.ch-title-text > span + span { font-size: .62em; margin-top: -.12em; letter-spacing: .12em; background: linear-gradient(180deg, #ffd3e0 0%, var(--ch-pink) 55%, #d9467a 100%); -webkit-background-clip: text; background-clip: text; }
.ch-h2 { font-size: clamp(24px, 4vmin + 10px, 44px); color: var(--ch-cream); margin: 0; text-transform: uppercase; font-weight: normal;
  text-shadow: 0 3px 0 var(--ch-ol), 2px 0 0 var(--ch-ol), -2px 0 0 var(--ch-ol), 0 -2px 0 var(--ch-ol), 0 6px 12px rgba(0,0,0,.35); }
.ch-sub { font-size: clamp(14px, 1.6vmin + 8px, 20px); color: var(--ch-lilac); margin: 0; }
.ch-corner { position: absolute; top: calc(var(--ch-sat) + var(--ch-gap)); right: calc(var(--ch-sar) + var(--ch-gap)); display: flex; gap: 10px; }
.ch-back { position: absolute; top: calc(var(--ch-sat) + var(--ch-gap)); left: calc(var(--ch-sal) + var(--ch-gap)); }

/* ---------- menu scrim (the live 3D diorama renders behind it) ---------- */
.ch-backdrop {
  background:
    radial-gradient(ellipse 46% 62% at 50% 50%, rgba(11,8,32,.72) 0%, rgba(11,8,32,.42) 55%, rgba(11,8,32,0) 100%),
    linear-gradient(180deg, rgba(11,8,32,.55) 0%, rgba(11,8,32,0) 22%, rgba(11,8,32,0) 72%, rgba(11,8,32,.7) 100%);
}
.ch-stars { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.ch-stars i { position: absolute; width: 3px; height: 3px; background: var(--ch-lilac); opacity: .5; box-shadow: 0 0 6px var(--ch-lilac); animation: ch-twinkle 3.2s ease-in-out infinite; }
.ch-floaty { position: absolute; width: 40px; height: 40px; object-fit: contain; opacity: .8; filter: drop-shadow(0 4px 0 var(--ch-ol)) drop-shadow(0 0 10px rgba(255,204,85,.35)); animation: ch-float 6s ease-in-out infinite; pointer-events: none; }
@keyframes ch-twinkle { 0%,100% { opacity: .1; transform: scale(.7); } 50% { opacity: .8; transform: scale(1); } }
@keyframes ch-float { 0%,100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-14px) rotate(6deg); } }
@keyframes ch-pop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
@keyframes ch-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes ch-rise { 0% { transform: translateY(18px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }

/* ---------- title ---------- */
.ch-title { flex-direction: column; align-items: center; justify-content: center; gap: clamp(10px, 2.4vmin, 24px); text-align: center; padding: calc(var(--ch-sat) + 24px) calc(var(--ch-sar) + 16px) calc(var(--ch-sab) + 34px) calc(var(--ch-sal) + 16px); }
.ch-brand { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ch-brand::before { content: ''; position: absolute; left: 50%; top: 55%; width: 150%; height: 120%; transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none; z-index: -1;
  background: radial-gradient(ellipse, rgba(255,204,85,.16), rgba(111,45,168,.14) 45%, rgba(11,8,32,0) 70%); }
.ch-logo { width: clamp(140px, 26vmin, 250px); height: auto; filter: drop-shadow(0 5px 0 var(--ch-ol)) drop-shadow(0 0 22px rgba(255,204,85,.35)); animation: ch-pop .5s ease-out both; }
.ch-title .ch-title-text { animation: ch-pop .6s .08s var(--ch-ease-pop) both; }
.ch-ribbon { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 6px 16px; margin: 0 0 4px; text-align: left; border-radius: 999px; background: var(--ch-glass-lite); border: 2px solid var(--ch-ol);
  box-shadow: 0 3px 0 var(--ch-ol), var(--ch-rim); color: var(--ch-mint); font-size: clamp(13px, 1.5vmin + 8px, 17px); animation: ch-rise .5s .2s ease-out both; }
.ch-ribbon img { width: 22px; height: 22px; object-fit: contain; flex: none; }
.ch-menu { display: flex; flex-direction: column; gap: 14px; width: min(360px, 88vw); animation: ch-rise .5s .28s ease-out both; }
.ch-menu .ch-btn { width: 100%; }
/* Play button glow: a separate layer behind the button that only fades (opacity runs on the
   compositor; an animated box-shadow would restyle and repaint the title on every frame). */
.ch-play-wrap { position: relative; display: flex; width: 100%; isolation: isolate; }
.ch-play-glow { position: absolute; inset: 0; z-index: -1; border-radius: 14px; pointer-events: none; opacity: 0;
  box-shadow: 0 0 26px 4px rgba(255,204,85,.45); animation: ch-breathe 2.6s 1s ease-in-out infinite; will-change: opacity; }
@keyframes ch-breathe { 0%,100% { opacity: 0; } 50% { opacity: 1; } }
.ch-tag { color: var(--ch-mint); margin: 0; }
.ch-foot { position: absolute; bottom: calc(var(--ch-sab) + 10px); left: 0; right: 0; padding: 0 16px; text-wrap: balance; font-size: 13px; color: var(--ch-lilac); font-family: ${G}; opacity: .85; text-shadow: 0 1px 2px #000; }
.ch-foot img { width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px; }

/* ---------- cat pick ---------- */
.ch-pick { flex-direction: column; padding: calc(var(--ch-sat) + var(--ch-gap)) calc(var(--ch-sar) + var(--ch-gap)) 0 calc(var(--ch-sal) + var(--ch-gap));
  background: radial-gradient(ellipse at 50% 0%, rgba(111,45,168,.35), rgba(11,8,32,0) 60%), rgba(11,8,32,.74);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.ch-pick-head { display: flex; align-items: center; gap: 12px; padding: 0 0 10px; min-height: 52px; }
.ch-pick-head .ch-head-text { flex: 1; min-width: 0; text-align: center; }
.ch-pick-head .ch-sub { font-family: ${G}; font-size: 14px; font-weight: 600; margin-top: 4px; }
.ch-grid-wrap { flex: 1; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y; padding: 12px 8px 20px; margin: 0 -4px;
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 12px, #000 calc(100% - 16px), transparent 100%); mask-image: linear-gradient(180deg, transparent 0, #000 12px, #000 calc(100% - 16px), transparent 100%); }
.ch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(88px, 18vw, 118px), 1fr)); gap: clamp(8px, 1.4vw, 14px); max-width: 1180px; margin: 0 auto; }
.ch-card {
  position: relative; appearance: none; cursor: pointer; padding: 6px 4px 8px; border-radius: 16px;
  border: 3px solid var(--ch-ol); background: var(--ch-glass-lite);
  box-shadow: 0 4px 0 var(--ch-ol), var(--ch-rim); display: flex; flex-direction: column; align-items: center; gap: 2px;
  transition: transform .16s var(--ch-ease-pop), box-shadow .16s ease, background .15s ease; touch-action: pan-y;
  animation: ch-rise .4s ease-out both; animation-delay: calc(var(--i, 0) * 12ms);
}
.ch-card::before { content: ''; position: absolute; left: 22%; right: 22%; bottom: 30px; height: 8px; border-radius: 50%; background: rgba(11,8,32,.55); filter: blur(2px); pointer-events: none; }
.ch-card:hover { transform: translateY(-4px) rotate(-1.5deg); box-shadow: 0 8px 0 var(--ch-ol), 0 12px 20px rgba(0,0,0,.35), var(--ch-rim), 0 0 0 2px var(--ch-lav); }
.ch-card:nth-child(even):hover { transform: translateY(-4px) rotate(1.5deg); }
.ch-card:hover canvas { transform: scale(1.08); }
.ch-card canvas { position: relative; width: 100%; aspect-ratio: 1; image-rendering: pixelated; display: block; border-radius: 10px; transition: transform .2s var(--ch-ease-pop);
  background: radial-gradient(circle at 50% 70%, rgba(153,102,204,.45), rgba(11,8,32,0) 70%); }
.ch-card .ch-name { font-size: clamp(13px, 1.1vw + 8px, 17px); color: var(--ch-cream); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px; }
.ch-card[aria-pressed="true"] { background: linear-gradient(180deg, #fff0b8 0%, var(--ch-coin) 55%, #f2a52a 100%);
  box-shadow: 0 4px 0 var(--ch-ol), 0 0 0 3px var(--ch-ol), 0 0 0 6px rgba(255,204,85,.55), 0 0 26px 6px rgba(255,204,85,.4), inset 0 2px 0 rgba(255,255,255,.6);
  animation: ch-select .38s var(--ch-ease-pop) both; }
@keyframes ch-select { 0% { transform: scale(.92); } 60% { transform: scale(1.07) rotate(-1deg); } 100% { transform: scale(1); } }
.ch-card[aria-pressed="true"] .ch-name { color: var(--ch-ol); }
.ch-card[aria-pressed="true"] canvas { background: radial-gradient(circle at 50% 70%, rgba(255,255,255,.7), rgba(255,255,255,0) 70%); }
.ch-badge { position: absolute; top: -10px; right: -10px; width: 30px; height: 30px; border-radius: 50%; background: var(--ch-pink); color: var(--ch-ol);
  border: 3px solid var(--ch-ol); display: none; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 3px 0 var(--ch-ol), 0 0 12px rgba(255,122,162,.6); z-index: 2; }
.ch-card[aria-pressed="true"] .ch-badge { display: flex; animation: ch-pop .3s var(--ch-ease-pop) both; }
.ch-pick-bar {
  position: relative; display: flex; align-items: center; gap: 14px; justify-content: center; flex-wrap: wrap;
  padding: 12px calc(var(--ch-sar) + var(--ch-gap)) calc(var(--ch-sab) + 12px) calc(var(--ch-sal) + var(--ch-gap));
  margin: 0 calc(-1 * (var(--ch-sar) + var(--ch-gap))) 0 calc(-1 * (var(--ch-sal) + var(--ch-gap)));
  background: linear-gradient(180deg, rgba(60,30,74,.92), rgba(20,9,28,.97)); border-top: 3px solid var(--ch-ol);
  box-shadow: 0 -10px 30px rgba(0,0,0,.35), inset 0 2px 0 rgba(153,102,204,.45);
}
.ch-slots { display: flex; gap: 10px; align-items: center; }
.ch-slot { width: 64px; height: 64px; border-radius: 16px; border: 3px dashed rgba(153,102,204,.8); display: flex; align-items: center; justify-content: center; position: relative; background: rgba(11,8,32,.6);
  color: var(--ch-lav); font-size: 26px; }
.ch-slot:not(.ch-filled)::after { content: '?'; opacity: .6; animation: ch-bob 1.8s ease-in-out infinite; }
.ch-slot.ch-filled { border-style: solid; border-color: var(--ch-ol); background: radial-gradient(circle at 50% 70%, #9a5ad0, var(--ch-grape) 60%, #4d1d7a); box-shadow: 0 4px 0 var(--ch-ol), inset 0 2px 0 rgba(255,255,255,.3), 0 0 16px rgba(153,102,204,.5); animation: ch-pop .3s var(--ch-ease-pop) both; }
.ch-slot canvas { width: 100%; height: 100%; image-rendering: pixelated; }
.ch-slot b { position: absolute; bottom: -7px; left: -7px; width: 24px; height: 24px; border-radius: 50%; background: var(--ch-coin); color: var(--ch-ol); border: 2px solid var(--ch-ol); font-size: 13px; display: flex; align-items: center; justify-content: center; font-weight: normal; }
.ch-slot-plus { font-size: 22px; color: var(--ch-coin); text-shadow: 0 2px 0 var(--ch-ol); }
.ch-slot-names { font-size: 15px; color: var(--ch-lilac); min-width: 120px; max-width: 34vw; line-height: 1.3; }
.ch-slot-names div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- HUD ---------- */
.ch-hud { pointer-events: none; }
.ch-hud > * { pointer-events: auto; }
.ch-hud-top { position: absolute; top: calc(var(--ch-sat) + 8px); left: calc(var(--ch-sal) + 8px); right: calc(var(--ch-sar) + 8px); display: flex; align-items: flex-start; gap: 8px; pointer-events: none; }
.ch-hud-top > * { pointer-events: auto; }
.ch-hud.ch-enter .ch-hud-top { animation: ch-drop .45s .1s var(--ch-ease-pop) both; }
.ch-hud.ch-enter .ch-crew { animation: ch-slide-l .45s .2s var(--ch-ease-pop) both; }
@keyframes ch-drop { 0% { transform: translateY(-30px); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes ch-slide-l { 0% { transform: translateX(-40px); opacity: 0; } 100% { transform: none; opacity: 1; } }
.ch-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.ch-chip { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 13px 0 7px; border-radius: 20px; background: var(--ch-glass-lite);
  border: 2px solid var(--ch-ol); box-shadow: 0 3px 0 var(--ch-ol), 0 6px 12px rgba(0,0,0,.25), var(--ch-rim); font-size: 19px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ch-chip img { width: 26px; height: 26px; object-fit: contain; filter: drop-shadow(0 2px 0 var(--ch-ol)); }
.ch-chip .ch-ico { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; color: var(--ch-lav); border-radius: 50%; background: rgba(11,8,32,.5); box-shadow: inset 0 0 0 1px rgba(153,102,204,.4); }
.ch-chip b { font-weight: normal; }
.ch-chip small { font-size: .7em; color: var(--ch-lav); margin-left: 1px; }
.ch-chip.ch-spot .ch-ico { color: var(--ch-pink); }
.ch-chip.ch-key .ch-ico { color: var(--ch-ol); background: rgba(255,255,255,.35); }
.ch-chip.ch-coins b { color: var(--ch-coin); text-shadow: 0 0 10px rgba(255,204,85,.4); }
.ch-chip.ch-spot b { color: var(--ch-pink); }
.ch-chip .ch-coins-star { font-size: 15px; color: rgba(255,255,255,.28); margin-left: -1px; }
.ch-chip.ch-coins.ch-all .ch-coins-star { color: var(--ch-coin); text-shadow: 0 0 10px rgba(255,204,85,.7); animation: ch-pop .35s var(--ch-ease-pop) both; }
.ch-chip.ch-exit { display: none; color: var(--ch-mint, #7dffc4); }
.ch-chip.ch-exit.ch-on { display: inline-flex; animation: ch-pop .35s var(--ch-ease-pop) both; }
.ch-chip.ch-key { background: linear-gradient(180deg, #ffe38a, var(--ch-coin)); color: var(--ch-ol); box-shadow: 0 3px 0 var(--ch-ol), 0 0 16px rgba(255,204,85,.55), inset 0 2px 0 rgba(255,255,255,.55); animation: ch-pop .35s var(--ch-ease-pop) both; }
.ch-chip.ch-bump { animation: ch-bump .42s var(--ch-ease-pop); }
.ch-chip.ch-spot.ch-bump { animation: ch-shake .42s ease-out; }
@keyframes ch-bump { 0% { transform: scale(1); } 35% { transform: scale(1.22); } 100% { transform: scale(1); } }
@keyframes ch-shake { 0%,100% { transform: none; } 20% { transform: translateX(-4px) rotate(-3deg); } 40% { transform: translateX(4px) rotate(3deg); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
.ch-plus { position: absolute; left: 50%; top: 2px; font-size: 16px; color: var(--ch-coin); text-shadow: 0 2px 0 var(--ch-ol), 0 0 8px rgba(255,204,85,.6); pointer-events: none; animation: ch-plus .8s ease-out both; }
@keyframes ch-plus { 0% { transform: translate(-50%, 0) scale(.6); opacity: 0; } 20% { opacity: 1; transform: translate(-50%, 14px) scale(1.15); } 100% { transform: translate(-50%, 34px) scale(1); opacity: 0; } }
.ch-obj { flex: 1; min-width: 0; display: flex; justify-content: center; }
.ch-obj-inner { position: relative; max-width: min(520px, 100%); padding: 6px 16px 7px 44px; border-radius: 14px; background: linear-gradient(180deg, rgba(40,18,52,.86), rgba(11,8,32,.86)); border: 2px solid var(--ch-ol);
  font-size: clamp(14px, 1.2vw + 9px, 20px); text-align: left; color: var(--ch-cream); box-shadow: 0 3px 0 var(--ch-ol), 0 6px 14px rgba(0,0,0,.3), var(--ch-rim); }
.ch-obj-inner::before { content: ''; position: absolute; left: 10px; top: 50%; width: 24px; height: 24px; margin-top: -12px; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #fff3b0, var(--ch-coin) 55%, #e08a17); border: 2px solid var(--ch-ol); box-shadow: 0 0 10px rgba(255,204,85,.55); }
.ch-obj-inner::after { content: '!'; position: absolute; left: 10px; top: 50%; width: 28px; margin-top: -9px; text-align: center; font-size: 15px; color: var(--ch-ol); }
.ch-obj-inner small { display: block; font-size: .66em; color: var(--ch-lav); text-transform: uppercase; letter-spacing: .12em; }
.ch-obj-inner.ch-new { animation: ch-obj-new .6s var(--ch-ease-pop); }
button.ch-obj-inner { appearance: none; display: block; font-family: inherit; letter-spacing: inherit; line-height: inherit; cursor: pointer; padding-right: 108px; min-height: 44px; touch-action: manipulation; }
button.ch-obj-inner:hover { border-color: #5a2a4a; }
.ch-obj-route { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 9px 0 6px; border-radius: 14px;
  font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--ch-cream); background: rgba(153,102,204,.28); box-shadow: inset 0 0 0 1px rgba(153,102,204,.6); }
.ch-obj-route img { width: 18px; height: 18px; object-fit: contain; image-rendering: pixelated; }
button.ch-obj-inner.ch-route-on { border-color: var(--ch-ol); box-shadow: 0 3px 0 var(--ch-ol), 0 0 0 2px var(--ch-coin), 0 0 18px rgba(255,204,85,.45), var(--ch-rim); }
button.ch-obj-inner.ch-route-on small { color: var(--ch-coin); }
button.ch-obj-inner.ch-route-on .ch-obj-route { color: var(--ch-ol); background: var(--ch-coin); box-shadow: 0 2px 0 var(--ch-ol); }
@keyframes ch-obj-new { 0% { transform: scale(.9); box-shadow: 0 3px 0 var(--ch-ol), 0 0 0 0 rgba(255,204,85,.8); } 50% { transform: scale(1.05); box-shadow: 0 3px 0 var(--ch-ol), 0 0 0 8px rgba(255,204,85,0); } 100% { transform: none; } }
.ch-hud-right { display: flex; gap: 8px; }
.ch-hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--ch-sab) + 16px); max-width: min(560px, 60vw); padding: 10px 18px 10px 16px; border-radius: 14px;
  background: linear-gradient(180deg, #fff6d6, var(--ch-cream)); color: var(--ch-ol); border: 3px solid var(--ch-ol); box-shadow: 0 4px 0 var(--ch-ol), 0 10px 22px rgba(0,0,0,.35), inset 0 2px 0 #fff;
  font-size: clamp(14px, 1vw + 10px, 19px); text-align: center; display: none; pointer-events: none; }
.ch-hint::before { content: ''; position: absolute; left: -3px; top: -3px; bottom: -3px; width: 10px; border-radius: 14px 0 0 14px; background: var(--ch-pink); border: 3px solid var(--ch-ol); border-right: 0; }
.ch-hint.ch-on { display: block; animation: ch-hint-in .35s var(--ch-ease-pop) both; }
@keyframes ch-hint-in { 0% { opacity: 0; transform: translate(-50%, 12px) scale(.96); } 100% { opacity: 1; transform: translate(-50%, 0); } }
.ch-crew { position: absolute; top: calc(var(--ch-sat) + 64px); left: calc(var(--ch-sal) + 8px); display: flex; flex-direction: column; gap: 10px; }
.ch-crew-btn { position: relative; appearance: none; cursor: pointer; width: 60px; height: 60px; padding: 0; border-radius: 16px; border: 2px solid var(--ch-ol);
  background: var(--ch-glass-lite); box-shadow: 0 3px 0 var(--ch-ol), var(--ch-rim); opacity: .72; transition: transform .18s var(--ch-ease-pop), opacity .15s ease, box-shadow .15s ease; }
.ch-crew-btn:hover { opacity: .95; }
.ch-crew-btn canvas { width: 100%; height: 100%; image-rendering: pixelated; display: block; }
.ch-crew-btn[aria-current="true"] { opacity: 1; background: radial-gradient(circle at 50% 70%, #9a5ad0, var(--ch-grape) 60%, #4d1d7a); border-color: var(--ch-ol); transform: scale(1.1);
  box-shadow: 0 3px 0 var(--ch-ol), 0 0 0 3px var(--ch-coin), 0 0 18px 3px rgba(255,204,85,.5), inset 0 2px 0 rgba(255,255,255,.3); }
.ch-crew-btn .ch-crew-tag { position: absolute; bottom: -7px; right: -9px; font-size: 11px; padding: 2px 6px; border-radius: 8px; background: var(--ch-coin); color: var(--ch-ol); border: 2px solid var(--ch-ol); display: none; box-shadow: 0 2px 0 var(--ch-ol); }
.ch-crew-btn[aria-current="true"] .ch-crew-tag { display: block; animation: ch-pop .3s var(--ch-ease-pop) both; }
.ch-crew-btn .ch-crew-state { position: absolute; top: -8px; left: 50%; transform: translateX(-50%); font-size: 10px; line-height: 1; white-space: nowrap; padding: 2px 5px; border-radius: 8px;
  border: 2px solid var(--ch-ol); box-shadow: 0 2px 0 var(--ch-ol); display: none; pointer-events: none; }
.ch-crew-btn.ch-holding .ch-crew-state { display: block; background: var(--ch-mint); color: var(--ch-ol); }
.ch-crew-btn.ch-danger .ch-crew-state { display: block; background: var(--ch-ember); color: var(--ch-cream); font-size: 13px; padding: 2px 7px; }
.ch-crew-btn.ch-danger { opacity: 1; animation: ch-danger .5s ease-in-out infinite alternate; }
@keyframes ch-danger { 0% { box-shadow: 0 3px 0 var(--ch-ol), 0 0 0 3px var(--ch-ember); } 100% { box-shadow: 0 3px 0 var(--ch-ol), 0 0 0 5px var(--ch-ember), 0 0 18px 4px rgba(193,38,15,.7); } }
@media (prefers-reduced-motion: reduce) { .ch-crew-btn.ch-danger { animation: none; box-shadow: 0 3px 0 var(--ch-ol), 0 0 0 4px var(--ch-ember); } }
.ch-crew-key { font-family: ${G}; font-size: 11px; font-weight: 700; color: var(--ch-lilac); text-align: center; text-shadow: 0 1px 2px #000; }
.ch-toasts { position: absolute; top: calc(var(--ch-sat) + 78px); left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
.ch-toast { padding: 8px 20px; border-radius: 16px; font-size: clamp(18px, 2vw + 10px, 30px); border: 3px solid var(--ch-ol); box-shadow: 0 4px 0 var(--ch-ol), 0 10px 24px rgba(0,0,0,.4), inset 0 2px 0 rgba(255,255,255,.35);
  background: linear-gradient(180deg, #8a45c8, var(--ch-grape)); color: var(--ch-cream); animation: ch-toast 1.6s ease-out both; text-transform: uppercase; text-shadow: 0 2px 0 rgba(42,15,31,.4); }
.ch-toast.ch-bad { background: linear-gradient(180deg, #e8412a, var(--ch-ember)); box-shadow: 0 4px 0 var(--ch-ol), 0 0 26px rgba(238,100,42,.55), inset 0 2px 0 rgba(255,255,255,.3); }
.ch-toast.ch-good { background: linear-gradient(180deg, #fff0b0, var(--ch-coin)); color: var(--ch-ol); text-shadow: 0 2px 0 rgba(255,255,255,.4); box-shadow: 0 4px 0 var(--ch-ol), 0 0 26px rgba(255,204,85,.55), inset 0 2px 0 #fff; }
.ch-toast.ch-info { background: linear-gradient(180deg, #e6f3ff, var(--ch-sky)); color: var(--ch-ol); text-shadow: none; }
@keyframes ch-toast { 0% { transform: translateY(12px) scale(.7); opacity: 0; } 12% { transform: translateY(0) scale(1.08); opacity: 1; } 20% { transform: scale(1); } 80% { opacity: 1; } 100% { transform: translateY(-16px); opacity: 0; } }
.ch-flash { position: absolute; inset: 0; pointer-events: none; opacity: 0; box-shadow: inset 0 0 0 5px var(--ch-ember), inset 0 0 80px 14px rgba(193,38,15,.5); }
.ch-flash.ch-go { animation: ch-flash .8s ease-out; }
@keyframes ch-flash { 0% { opacity: 1; } 100% { opacity: 0; } }

/* ---------- touch controls ---------- */
.ch-touch { position: absolute; inset: 0; pointer-events: none; display: none; }
.ch-touch.ch-on { display: block; }
.ch-stick-zone { position: absolute; left: 0; bottom: 0; width: 50%; height: 62%; pointer-events: auto; touch-action: none; }
.ch-stick { position: absolute; left: max(90px, 32%); top: calc(100% - 110px - var(--ch-sab)); width: 132px; height: 132px; margin: -66px 0 0 -66px; border-radius: 50%;
  background: radial-gradient(circle, rgba(11,8,32,.15) 40%, rgba(11,8,32,.45) 100%); border: 3px solid rgba(252,236,187,.5);
  box-shadow: inset 0 0 0 8px rgba(153,102,204,.22), 0 0 0 2px rgba(42,15,31,.6), 0 6px 18px rgba(0,0,0,.3); pointer-events: none; transition: opacity .15s ease, transform .15s ease; }
.ch-stick::before { content: ''; position: absolute; inset: 14px; border-radius: 50%; border: 2px dashed rgba(252,236,187,.25); }
.ch-stick.ch-idle { opacity: .55; transform: scale(.94); }
.ch-knob { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px; margin: -29px 0 0 -29px; border-radius: 50%;
  background: radial-gradient(circle at 40% 30%, #d9b8f5, var(--ch-lav) 55%, #6d3fa3); border: 3px solid var(--ch-ol); box-shadow: 0 4px 0 var(--ch-ol), inset 0 3px 0 rgba(255,255,255,.4); transition: box-shadow .15s ease; }
.ch-stick:not(.ch-idle) .ch-knob { box-shadow: 0 4px 0 var(--ch-ol), inset 0 3px 0 rgba(255,255,255,.4), 0 0 18px 4px rgba(240,197,253,.55); }
.ch-pad { position: absolute; right: calc(var(--ch-sar) + 18px); bottom: calc(var(--ch-sab) + 18px); width: 196px; height: 176px; pointer-events: none; }
.ch-pad .ch-btn { position: absolute; pointer-events: auto; touch-action: none; padding: 0; border-radius: 50%; flex-direction: column; gap: 0; font-size: 13px; transition: transform .07s ease, box-shadow .07s ease, filter .1s ease; }
.ch-pad .ch-btn span { font-size: 10px; line-height: 1; margin-top: 3px; opacity: .8; }
.ch-pad .ch-btn.ch-down { transform: translateY(4px) scale(.92); filter: brightness(1.2); }
.ch-pad .ch-act { right: 0; bottom: 20px; width: 84px; height: 84px; font-size: 16px; }
.ch-pad .ch-act.ch-down { box-shadow: 0 1px 0 var(--ch-ol), 0 0 24px 6px rgba(255,204,85,.6), inset 0 3px 0 var(--hi); }
.ch-pad .ch-meow { right: 100px; bottom: 0; width: 66px; height: 66px; }
.ch-pad .ch-meow.ch-down { box-shadow: 0 1px 0 var(--ch-ol), 0 0 24px 6px rgba(255,122,162,.6), inset 0 3px 0 var(--hi); }
.ch-pad .ch-swap { right: 88px; bottom: 90px; width: 62px; height: 62px; }
.ch-pad .ch-swap.ch-down { box-shadow: 0 1px 0 var(--ch-ol), 0 0 24px 6px rgba(153,102,204,.7), inset 0 3px 0 var(--hi); }
.ch-pad .ch-btn img { width: 26px; height: 26px; }
.ch-ripple { position: absolute; left: 50%; top: 50%; width: 100%; height: 100%; margin: -50% 0 0 -50%; border-radius: 50%; background: rgba(255,255,255,.55); pointer-events: none; z-index: -1; animation: ch-ripple .45s ease-out forwards; }
@keyframes ch-ripple { 0% { transform: scale(.2); opacity: .8; } 100% { transform: scale(1.6); opacity: 0; } }

/* ---------- modal (pause / results) ---------- */
.ch-modal { align-items: center; justify-content: center; background: radial-gradient(ellipse at 50% 50%, rgba(48,25,52,.45), rgba(11,8,32,.82) 75%); padding: calc(var(--ch-sat) + 12px) calc(var(--ch-sar) + 12px) calc(var(--ch-sab) + 12px) calc(var(--ch-sal) + 12px); }
.ch-modal.ch-on { animation: ch-screen-in .25s ease-out both; }
.ch-dialog { width: min(440px, 100%); max-height: 100%; overflow-y: auto; padding: clamp(16px, 3vmin, 28px); display: flex; flex-direction: column; gap: 14px; align-items: stretch; text-align: center; animation: ch-dialog-in .42s var(--ch-ease-pop) both; }
@keyframes ch-dialog-in { 0% { transform: translateY(24px) scale(.9); opacity: 0; } 100% { transform: none; opacity: 1; } }
.ch-dialog .ch-btn { width: 100%; }
.ch-row { display: flex; gap: 10px; }
.ch-row > * { flex: 1; }
.ch-pause-head { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ch-pause-head .ch-h2 { display: flex; align-items: center; gap: 12px; }
.ch-pause-head .ch-h2 .ch-svg { font-size: .8em; color: var(--ch-coin); filter: drop-shadow(0 2px 0 var(--ch-ol)); }
.ch-pause-head .ch-sub { font-family: ${G}; font-size: 13px; font-weight: 600; color: var(--ch-lav); }
.ch-keys { font-family: ${G}; font-size: 13px; color: var(--ch-lilac); display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: center; text-align: left; margin: 2px 0 0; padding: 12px 14px;
  border-radius: 14px; background: rgba(11,8,32,.45); box-shadow: inset 0 0 0 1px rgba(153,102,204,.35); }
.ch-keys span:nth-child(odd) { white-space: nowrap; }
.ch-keys kbd { display: inline-block; font-family: inherit; font-weight: 700; color: var(--ch-cream); background: linear-gradient(180deg, #4a2a5c, #2c1538); border: 2px solid var(--ch-ol); border-bottom-width: 4px; border-radius: 7px; padding: 1px 7px; font-size: 12px; white-space: nowrap; box-shadow: inset 0 1px 0 rgba(255,255,255,.2); }
.ch-results .ch-dialog { width: min(480px, 100%); padding-top: clamp(26px, 4vmin, 36px); overflow: visible; }
.ch-results .ch-dialog > .ch-scroll { overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 12px; min-height: 0; flex: 1 1 auto; padding: 14px 2px 4px; margin: -4px -2px; }
.ch-banner { position: relative; align-self: center; margin-top: calc(-1 * clamp(44px, 6vmin, 54px)); padding: 8px 34px; background: linear-gradient(180deg, #ff9dbb, var(--ch-pink) 60%, #e0507f); border: 3px solid var(--ch-ol); border-radius: 12px;
  box-shadow: 0 4px 0 var(--ch-ol), inset 0 2px 0 rgba(255,255,255,.45); animation: ch-pop .45s var(--ch-ease-pop) both; }
.ch-banner .ch-h2 { color: #fff7de; font-size: clamp(22px, 3.4vmin + 10px, 38px); white-space: nowrap; }
.ch-banner.ch-miss { background: linear-gradient(180deg, #b89ad6, var(--ch-lav) 60%, #7a4cb0); }
.ch-rescue { display: flex; align-items: center; gap: 12px; justify-content: center; padding: 10px; border-radius: 14px; background: linear-gradient(180deg, rgba(213,244,229,.16), rgba(213,244,229,.06)); border: 2px dashed var(--ch-mint); animation: ch-rise .4s .5s ease-out both; }
.ch-rescue canvas { width: 72px; height: 72px; image-rendering: pixelated; animation: ch-bob 1.6s ease-in-out infinite; filter: drop-shadow(0 3px 0 rgba(42,15,31,.6)); }
.ch-rescue p { margin: 0; font-size: clamp(17px, 1.5vw + 10px, 24px); color: var(--ch-mint); text-align: left; }
.ch-rescue p small { display: block; font-size: .62em; color: var(--ch-lilac); font-family: ${G}; margin-top: 3px; }
.ch-rescue .ch-payouts { display: block; margin-top: 4px; font-size: .6em; font-family: ${G}; color: var(--ch-coin); text-decoration: underline; text-underline-offset: 2px; pointer-events: auto; }
.ch-rescue .ch-give { display: inline-block; margin-top: 8px; padding: 9px 16px; border: 3px solid var(--ch-ol); border-radius: 14px; background: var(--ch-pink); color: var(--ch-ol); font-size: .62em; font-weight: 800; font-family: ${G}; text-decoration: none; box-shadow: 0 4px 0 var(--ch-ol); pointer-events: auto; animation: ch-give-wiggle 2.4s ease-in-out 1.2s infinite; }
.ch-rescue .ch-give:hover, .ch-rescue .ch-give:focus-visible { background: #ffb3cf; transform: translateY(-2px) rotate(-1deg); animation-play-state: paused; }
.ch-rescue .ch-give:active { transform: translateY(2px); box-shadow: 0 2px 0 var(--ch-ol); }
@keyframes ch-give-wiggle { 0%, 88%, 100% { transform: rotate(0); } 91% { transform: rotate(-3deg) scale(1.04); } 94% { transform: rotate(3deg) scale(1.04); } 97% { transform: rotate(-1deg); } }
.ch-reduced .ch-rescue .ch-give { animation: none; }
/* A status badge, not a button: flat (no raised shadow), square-ish corners, default cursor. */
.ch-rescue .ch-rail-chip { display: inline-block; margin-top: 8px; padding: 3px 8px; border: 1px dashed var(--ch-lilac); border-radius: 4px; background: transparent; box-shadow: none; cursor: default; user-select: none; pointer-events: none; color: var(--ch-lilac); font-family: ${G}; font-weight: 800; font-size: max(12px, .5em); letter-spacing: .06em; text-transform: uppercase; }
.ch-rescue .ch-payouts-total { display: block; margin-top: 2px; font-size: .55em; font-family: ${G}; color: var(--ch-cream); opacity: .85; }
.ch-rescue .ch-payouts-total:empty { display: none; }
.ch-rescue .ch-payouts:hover, .ch-rescue .ch-payouts:focus-visible { color: var(--ch-cream); }
.ch-rescue.ch-miss { background: rgba(193,38,15,.12); border-color: var(--ch-rust); }
.ch-rescue.ch-miss p { color: var(--ch-rust); }
.ch-paws { display: flex; justify-content: center; align-items: flex-end; gap: 14px; }
.ch-paws span { position: relative; display: inline-flex; }
.ch-paws span:nth-child(2) { transform: translateY(-8px); }
.ch-paws img { position: relative; width: 50px; height: 50px; object-fit: contain; filter: grayscale(1) brightness(.3) drop-shadow(0 3px 0 var(--ch-ol)); }
.ch-paws span:nth-child(2) img { width: 60px; height: 60px; }
.ch-paws img.ch-lit { filter: drop-shadow(0 3px 0 var(--ch-ol)) drop-shadow(0 0 12px rgba(255,204,85,.7)); animation: ch-paw .55s var(--ch-ease-pop) both; }
.ch-paws span.ch-lit::before { content: ''; position: absolute; inset: -14px; border-radius: 50%; background: radial-gradient(circle, rgba(255,204,85,.55), rgba(255,204,85,0) 65%); animation: ch-burst .7s ease-out both; animation-delay: inherit; }
@keyframes ch-paw { 0% { transform: scale(0) rotate(-30deg); opacity: 0; } 70% { transform: scale(1.3) rotate(8deg); opacity: 1; } 100% { transform: scale(1); } }
@keyframes ch-burst { 0% { transform: scale(.2); opacity: 0; } 40% { opacity: 1; } 100% { transform: scale(1.4); opacity: .55; } }
.ch-score { width: 100%; border-collapse: collapse; font-size: clamp(15px, 1vw + 11px, 19px); }
.ch-score td { text-align: left; padding: 6px 6px; border-bottom: 2px dashed rgba(153,102,204,.3); }
.ch-score tr { animation: ch-rise .35s ease-out both; }
.ch-score td:last-child { text-align: right; font-variant-numeric: tabular-nums; color: var(--ch-mint); }
.ch-score tr.ch-total td { border-bottom: 0; font-size: 1.45em; color: var(--ch-coin); padding-top: 12px; text-shadow: 0 2px 0 var(--ch-ol), 0 0 14px rgba(255,204,85,.45); }
.ch-score tr.ch-total td:last-child { color: var(--ch-coin); }
.ch-score tr.ch-total.ch-done td:last-child { animation: ch-bump .45s var(--ch-ease-pop); }
.ch-score .ch-neg { color: var(--ch-pink) !important; }
.ch-meta { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--ch-lav); display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; }
.ch-meta code { color: var(--ch-cream); }
.ch-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.ch-confetti i { position: absolute; top: -20px; width: 9px; height: 14px; border: 2px solid var(--ch-ol); animation: ch-fall linear forwards; }
@keyframes ch-fall { 0% { transform: translateY(0) rotate(0); opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } }

/* ---------- yard overlay + loading ---------- */
.ch-yardbar { pointer-events: none; }
.ch-yardbar > * { pointer-events: auto; }
.ch-yard-title { position: absolute; top: calc(var(--ch-sat) + var(--ch-gap)); left: 50%; transform: translateX(-50%); text-align: center; pointer-events: none; white-space: nowrap; }
.ch-yard-title .ch-h2 { font-size: clamp(22px, 3vmin + 10px, 36px); }
.ch-yard-title .ch-sub { display: inline-block; margin-top: 6px; padding: 4px 12px; border-radius: 12px; background: rgba(11,8,32,.78); border: 2px solid var(--ch-ol); color: var(--ch-cream); font-family: ${G}; font-size: 13px; font-weight: 600; text-shadow: none; box-shadow: 0 2px 0 var(--ch-ol); }
.ch-loading { align-items: center; justify-content: center; flex-direction: column; gap: 14px; background: radial-gradient(ellipse at 50% 45%, #2d1438 0%, var(--ch-night) 70%); }
.ch-loading img { width: 72px; height: 72px; animation: ch-spin 1.1s steps(8) infinite; filter: drop-shadow(0 4px 0 var(--ch-ol)) drop-shadow(0 0 16px rgba(255,204,85,.4)); }
.ch-loading p { font-size: 24px; margin: 0; text-shadow: 0 3px 0 var(--ch-ol); }
.ch-loading .ch-bar { width: min(240px, 60vw); height: 12px; border-radius: 8px; border: 2px solid var(--ch-ol); background: rgba(11,8,32,.7); overflow: hidden; box-shadow: 0 2px 0 var(--ch-ol); }
.ch-loading .ch-bar i { display: block; height: 100%; width: 40%; border-radius: 6px; background: linear-gradient(90deg, var(--ch-pink), var(--ch-coin)); animation: ch-load 1.2s ease-in-out infinite; }
@keyframes ch-load { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
.ch-loading small { font-family: ${G}; font-size: 13px; color: var(--ch-lav); max-width: 34ch; text-align: center; }
@keyframes ch-spin { to { transform: rotate(360deg); } }

@media (max-width: 520px) {
  .ch-chip { height: 36px; font-size: 16px; padding: 0 10px 0 5px; }
  .ch-chip img, .ch-chip .ch-ico { width: 22px; height: 22px; }
  .ch-chip .ch-ico { font-size: 17px; }
  .ch-hud-top { flex-wrap: wrap; }
  .ch-hud-right { position: absolute; top: 0; right: 0; }
  .ch-hud-right .ch-btn.ch-icon { width: 42px; height: 42px; font-size: 19px; }
  .ch-chips { padding-right: 96px; }
  .ch-obj { order: 3; flex-basis: 100%; }
  .ch-obj-inner { width: 100%; font-size: 15px; padding: 5px 12px 6px 40px; }
  .ch-pick-head .ch-h2 { font-size: 23px; }
  .ch-pick-head .ch-sub { font-size: 12px; }
  .ch-crew-btn { width: 50px; height: 50px; }
  .ch-slot { width: 54px; height: 54px; }
  .ch-slot-names { display: none; }
  .ch-pick-bar .ch-btn { flex: 1; }
  .ch-hint { max-width: calc(100vw - 24px); width: max-content; bottom: auto; top: calc(var(--ch-sat) + 124px); padding: 5px 12px 5px 16px; font-size: 13px; line-height: 1.3;
    border-width: 2px; box-shadow: 0 2px 0 var(--ch-ol), 0 6px 14px rgba(0,0,0,.3); background: rgba(252,236,187,.92); }
  .ch-hint::before { border-width: 2px; left: -2px; top: -2px; bottom: -2px; width: 8px; }
  .ch-toasts { top: calc(var(--ch-sat) + 178px); }
  .ch-toast { font-size: 17px; padding: 6px 14px; }
  .ch-crew { top: calc(var(--ch-sat) + 196px); }
  .ch-banner { padding: 7px 18px; }
  .ch-paws img { width: 42px; height: 42px; } .ch-paws span:nth-child(2) img { width: 50px; height: 50px; }
  .ch-title-text { font-size: clamp(44px, 15vw, 80px); }
}
@media (max-height: 460px) {
  .ch-title { flex-direction: row; flex-wrap: wrap; align-content: center; column-gap: 40px; row-gap: 10px; }
  .ch-title .ch-brand { flex-direction: column; }
  .ch-title .ch-logo { width: 110px; }
  .ch-title .ch-title-text { font-size: 58px; }
  .ch-title .ch-ribbon { display: none; }
  .ch-title .ch-menu { width: min(280px, 40vw); }
  .ch-crew { top: calc(var(--ch-sat) + 58px); }
  /* Landscape phones: the cat sits mid-screen, so toasts go to a right-hand column under the HUD. */
  .ch-toasts { top: calc(var(--ch-sat) + 92px); left: auto; right: calc(var(--ch-sar) + 12px); align-items: flex-end; gap: 6px; }
  .ch-toast { font-size: 16px; padding: 4px 12px; }
  .ch-obj-inner { font-size: 14px; padding: 4px 12px 4px 38px; }
  .ch-obj-inner::before { width: 20px; height: 20px; margin-top: -10px; left: 9px; }
  .ch-obj-inner::after { left: 9px; width: 24px; margin-top: -8px; font-size: 13px; }
  .ch-hint { bottom: calc(var(--ch-sab) + 10px); max-width: min(460px, 46vw); padding: 6px 12px 6px 16px; font-size: 13px; }
  .ch-crew-btn { width: 48px; height: 48px; }
  .ch-crew-key { display: none; }
  .ch-dialog { gap: 8px; padding: 14px; }
  .ch-results .ch-dialog { padding-top: 22px; width: min(620px, 100%); }
  .ch-banner { margin-top: -40px; padding: 5px 22px; }
  .ch-paws img { width: 32px; height: 32px; } .ch-paws span:nth-child(2) img { width: 38px; height: 38px; }
  .ch-rescue { padding: 6px; } .ch-rescue canvas { width: 52px; height: 52px; }
  .ch-score td { padding: 3px 6px; }
  .ch-results .ch-dialog > .ch-scroll { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); grid-template-areas: 'paws table' 'rescue table' 'meta meta' 'btns btns'; column-gap: 16px; row-gap: 8px; align-items: center; }
  .ch-results .ch-paws { grid-area: paws; }
  .ch-results .ch-rescue { grid-area: rescue; }
  .ch-results .ch-rescue p small { display: none; }
  .ch-results .ch-rescue p { font-size: 16px; }
  .ch-results .ch-score { grid-area: table; font-size: 15px; }
  .ch-results .ch-meta { grid-area: meta; }
  .ch-results .ch-scroll > .ch-row { grid-area: btns; }
  .ch-results .ch-btn.ch-big { min-height: 46px; padding: 8px 20px; font-size: 22px; }
  .ch-keys { padding: 8px 12px; gap: 4px 12px; }
  .ch-pad { transform: scale(.85); transform-origin: bottom right; }
  .ch-stick-zone { height: 80%; }
  .ch-grid { grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); }
  .ch-pick-head { min-height: 44px; padding-bottom: 4px; }
  .ch-pick-head .ch-h2 { font-size: 24px; }
  .ch-pick-bar { padding-top: 6px; padding-bottom: calc(var(--ch-sab) + 6px); }
  .ch-pick-bar .ch-btn.ch-big { min-height: 48px; padding: 8px 24px; font-size: 22px; }
  .ch-slot { width: 48px; height: 48px; }
}
.ch-touching .ch-crew-key, .ch-touching .ch-keys { display: none; }
@media (prefers-reduced-motion: reduce) {
  .ch-ui *, .ch-ui *::before, .ch-ui *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
  .ch-floaty, .ch-stars, .ch-confetti, .ch-iris { display: none; }
}
.ch-reduced *, .ch-reduced *::before, .ch-reduced *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
.ch-reduced .ch-iris, .ch-reduced .ch-confetti { display: none; }
`,Nt=!1;function K(e){return/assets\/$/.test(e)?e.replace(/assets\/$/,`fonts/`):`${e.replace(/\/?$/,`/`)}../fonts/`}function Pt(e=ve){if(Nt||typeof document>`u`)return;Nt=!0;let t=document.createElement(`style`);t.dataset.ch=`ui`,t.textContent=`@font-face { font-family: 'Cat Paw'; src: url('${e}fonts/catpaw.woff2') format('woff2'); font-display: swap; }\n${jt(K(e))}\n${Mt}`,document.head.appendChild(t)}var q={px:.84,nx:.72,py:1.06,ny:.55,pz:.92,nz:.7},Ft=class{pos=[];col=[];nor=[];idx=[];tmp=new E;get triangles(){return this.idx.length/3}box(e,t,n,r,i,a,o,s=55,c){let l=this.tmp.set(o),u=l.r,d=l.g,f=l.b,p=u,m=d,h=f;if(c!==void 0){let e=new E(c);p=e.r,m=e.g,h=e.b}return s&4&&this.quad([e,i,a],[r,i,a],[r,i,n],[e,i,n],[0,1,0],p*q.py,m*q.py,h*q.py),s&8&&this.quad([e,t,n],[r,t,n],[r,t,a],[e,t,a],[0,-1,0],u*q.ny,d*q.ny,f*q.ny),s&16&&this.quad([e,t,a],[r,t,a],[r,i,a],[e,i,a],[0,0,1],u*q.pz,d*q.pz,f*q.pz),s&32&&this.quad([r,t,n],[e,t,n],[e,i,n],[r,i,n],[0,0,-1],u*q.nz,d*q.nz,f*q.nz),s&1&&this.quad([r,t,a],[r,t,n],[r,i,n],[r,i,a],[1,0,0],u*q.px,d*q.px,f*q.px),s&2&&this.quad([e,t,n],[e,t,a],[e,i,a],[e,i,n],[-1,0,0],u*q.nx,d*q.nx,f*q.nx),this}block(e,t,n,r,i,a,o,s=55,c){return this.box(e-r,t,n-a,e+r,t+i,n+a,o,s,c)}tile(e,t,n,r,i,a){let o=this.tmp.set(a);return this.quad([e,i,r],[n,i,r],[n,i,t],[e,i,t],[0,1,0],o.r,o.g,o.b),this}quad(e,t,n,r,i,a,o,s){let c=this.pos.length/3;this.pos.push(...e,...t,...n,...r);for(let e=0;e<4;e++)this.nor.push(i[0],i[1],i[2]),this.col.push(a,o,s);this.idx.push(c,c+1,c+2,c,c+2,c+3)}build(){let e=new te;e.setAttribute(`position`,new A(this.pos,3)),e.setAttribute(`normal`,new A(this.nor,3)),e.setAttribute(`color`,new A(this.col,3));let t=this.pos.length/3;return e.setIndex(t>65535?new x(this.idx,1):new c(this.idx,1)),e.computeBoundingBox(),e.computeBoundingSphere(),e}};function It(e){let t=e|0;return()=>{let e=t=t+1831565813|0;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}var Lt=`
uniform vec2 uRes;
uniform vec3 uSkyA;
uniform vec3 uSkyB;
uniform vec3 uSkyC;
uniform vec3 uSun;
vec3 skyAt(vec2 uv) {
  float t = clamp(0.7 * (1.0 - uv.y) + 0.3 * uv.x, 0.0, 1.0);
  vec3 c = mix(uSkyA, uSkyB, smoothstep(0.0, 0.5, t));
  c = mix(c, uSkyC, smoothstep(0.45, 1.0, t));
  float sun = 1.0 - smoothstep(0.0, 0.75, length((uv - vec2(0.12, 1.02)) * vec2(1.0, 1.4)));
  return c + uSun * sun * sun * 0.55;
}
`,J={grassA:9225315,grassB:8436058,grassC:10014060,grassD:11851891,grassE:7777623,soil:6964274,soilTop:8147257,terrace:12098505,terraceDark:9334694,terraceCap:15259375,stoneA:15786218,stoneB:14864354,stoneC:13942232,stoneEdge:11045051,wood:12744266,woodDark:9325873,iron:3877445,leafA:5611602,leafB:7518551,leafC:4163408,leafSun:10275934,trunk:8014387,hedge:5084240,hedgeTop:6795866,basin:13942752,basinTop:16182519,carpet:10053324,carpetTop:11831520,rope:15257498,meadowA:11060332,meadowB:10534247,meadowC:11913843,farA:8365155,farB:7314016,farTrunk:8016457,petals:[16743074,16763196,15779325,12903164,16777215,15623210]},Rt=14,zt=10,Y=-.55;function Bt(e,t,n){let r=new d({vertexColors:!0});return r.onBeforeCompile=r=>{r.uniforms.uTime=e,r.vertexShader=r.vertexShader.replace(`#include <common>`,`#include <common>
uniform float uTime;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
        {
          float w = max(0.0, transformed.y - ${t.toFixed(3)}) * ${n.toFixed(4)};
          float ph = transformed.x * 0.55 + transformed.z * 0.4;
          float gust = 0.65 + 0.35 * sin(uTime * 0.45 + transformed.x * 0.08);
          transformed.x += sin(uTime * 1.9 + ph) * w * gust;
          transformed.z += cos(uTime * 1.6 + ph * 1.3) * w * 0.6 * gust;
        }`)},r.customProgramCacheKey=()=>`yard-wind-${t}-${n}`,r}function Vt(e,t,n){let r=new d({vertexColors:!0});return r.onBeforeCompile=r=>{Object.assign(r.uniforms,e),r.vertexShader=r.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vHazeW;`).replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
vHazeW = (modelMatrix * vec4(transformed, 1.0)).xyz;`),r.fragmentShader=r.fragmentShader.replace(`#include <common>`,`#include <common>\nvarying vec3 vHazeW;\n${Lt}`).replace(`#include <opaque_fragment>`,`#include <opaque_fragment>
        {
          vec2 q = max(abs(vHazeW.xz) - vec2(${Rt.toFixed(1)}, ${zt.toFixed(1)}), 0.0);
          float f = smoothstep(${t.toFixed(1)}, ${n.toFixed(1)}, length(q) + max(0.0, vHazeW.y) * 0.6);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, skyAt(gl_FragCoord.xy / uRes), f);
        }`)},r.customProgramCacheKey=()=>`yard-haze-${t}-${n}`,r}function Ht(e){return new l({transparent:!0,depthWrite:!1,uniforms:{uTime:e,uDeep:{value:new E(5083088)},uShallow:{value:new E(10413823)},uFoam:{value:new E(16774368)},uWarm:{value:new E(16763274)}},vertexShader:`
      varying vec2 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,fragmentShader:`
      uniform float uTime;
      uniform vec3 uDeep, uShallow, uFoam, uWarm;
      varying vec2 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 cell = floor(vW * 9.0);
        vec2 p = (cell + 0.5) / 9.0;          // voxel-quantised water
        float r = length(p);
        float caus = sin(p.x * 6.0 + uTime * 1.3) * sin(p.y * 5.5 - uTime * 1.1) + 0.6 * sin((p.x - p.y) * 4.3 + uTime * 0.8);
        float ring = sin(r * 10.0 - uTime * 2.6) * 0.5 + 0.5;
        vec3 col = mix(uDeep, uShallow, clamp(0.35 + 0.28 * caus + 0.25 * smoothstep(1.9, 0.6, r), 0.0, 1.0));
        col += uFoam * smoothstep(0.86, 0.99, ring) * 0.28 * smoothstep(0.3, 0.9, r);
        // Golden reflection band from the low sun (upper-left), and splash foam around the spout.
        col = mix(col, uWarm, 0.25 * smoothstep(0.4, 1.0, sin((p.x - p.y) * 1.2 + 1.2)));
        col = mix(col, uFoam, smoothstep(0.55, 0.25, r) * (0.55 + 0.25 * sin(uTime * 7.0 + r * 30.0)));
        // Sparkles: HDR (> 1) so they catch the bloom.
        float h = hash(cell);
        float tw = step(0.965, h) * pow(max(0.0, sin(uTime * 2.6 + h * 60.0)), 10.0);
        col += vec3(1.0, 0.97, 0.9) * tw * 2.4;
        gl_FragColor = vec4(col, 0.9);
        #include <colorspace_fragment>
      }`})}function Ut(e=7){let n=It(e),i=new Ft,a=new Ft,o=new Ft,s=new Ft,c=new Ft,l=[],u=[],f=[],p={value:0},m={uRes:{value:new b(1280,720)},uSkyA:{value:new E(16767392)},uSkyB:{value:new E(16169423)},uSkyC:{value:new E(11963096)},uSun:{value:new E(16773312)}},h=(e,t)=>{let n=Math.hypot(e,t);return n>=2.4&&n<3.7||Math.abs(e)<1.05&&n>=2.4||Math.abs(t)<1.05&&n>=2.4},g=[{x:-10.5,z:-6.5},{x:10.5,z:-6.2},{x:-10.2,z:6.4},{x:10.6,z:6.6}],_=(e,t)=>{for(let n of g)if(Math.hypot(e-n.x-.9,t-n.z+.4)<1.8)return!0;return!1};i.box(-14.5,Y,-10.5,14.5,-.12,10.5,J.terrace,51),i.box(-14.62,-.12,-10.62,14.62,.02,10.62,J.terraceCap,51),i.box(-14.62,0,10.5,14.62,.02,10.62,J.terraceCap,4),i.box(-14.62,0,-10.62,14.62,.02,-10.5,J.terraceCap,4),i.box(14.5,0,-10.5,14.62,.02,10.5,J.terraceCap,4),i.box(-14.62,0,-10.5,-14.5,.02,10.5,J.terraceCap,4);for(let e=-14.5;e<14.5;e+=.7)i.box(e,-.42,10.5,e+.64,-.36,10.52,J.terraceDark,16),i.box(e+.3,-.26,10.5,Math.min(14.5,e+.94),-.2,10.52,J.terraceDark,16);for(let e=-10.5;e<10.5;e+=.7)i.box(14.5,-.42,e,14.52,-.36,e+.64,J.terraceDark,1),i.box(14.5,-.26,e+.3,14.52,-.2,Math.min(10.5,e+.94),J.terraceDark,1);let v=(e,t)=>{let r=n(),i=!(Math.floor(e)+Math.floor(t)&1);return r<.07?J.grassD:r<.12?J.grassE:i?r<.55?J.grassA:J.grassC:r<.6?J.grassB:J.grassA},y=(e,t,r)=>{a.block(e,0,t,.035,.12+n()*.1,.035,r),a.block(e+.08,0,t+.04,.03,.08+n()*.06,.03,J.grassD),n()<.5&&a.block(e-.06,0,t+.07,.03,.07+n()*.05,.03,J.grassC)};for(let e=-14.5;e<14.5;e+=1)for(let t=-10.5;t<10.5;t+=1){let r=e+.5,o=t+.5;if(h(r,o)){let a=n(),s=a<.34?J.stoneA:a<.7?J.stoneB:J.stoneC;i.tile(e,t,e+1,t+1,-.02,J.stoneEdge),i.box(e+.05,-.02,t+.05,e+.95,.05,t+.95,_(r,o)?Wt(s,.86):s,21),n()<.12&&i.box(e+.02,0,t+.9,e+.4,.03,t+.98,J.grassE,4)}else{let s=v(e,t);i.tile(e,t,e+1,t+1,0,_(r,o)?Wt(s,.86):s);let c=n();if(c<.42&&y(e+.15+n()*.7,t+.15+n()*.7,c<.2?J.grassE:J.grassC),c>.93){let r=e+.2+n()*.6,i=t+.2+n()*.6,o=.14+n()*.1;a.block(r,0,i,.02,o,.02,J.leafA);let s=J.petals[Math.floor(n()*J.petals.length)];a.block(r,o,i,.06,.05,.06,s,55,Gt(s,1.1))}}}let x=.35;for(let e=-2.45;e<2.45;e+=x)for(let t=-2.45;t<2.45;t+=x){let n=Math.hypot(e+x/2,t+x/2);n<1.85?i.box(e,0,t,e+x,.12,t+x,5931696,4):n<2.4&&i.box(e,0,t,e+x,.55,t+x,J.basin,55,J.basinTop)}i.block(0,0,0,.32,1.35,.32,J.basin,55,J.basinTop);for(let e=-.9;e<.9;e+=.3)for(let t=-.9;t<.9;t+=.3)Math.hypot(e+.15,t+.15)<.95&&i.box(e,1.35,t,e+.3,1.52,t+.3,J.basin,55,J.basinTop);i.block(0,1.52,0,.16,.45,.16,J.basinTop),s.block(0,1.97,0,.1,.12,.1,16763196),l.push({x:0,z:0,r:2.45});for(let e=0;e<8;e++){let t=e/8*Math.PI*2+.3;u.push({x:Math.cos(t)*3,z:Math.sin(t)*3})}let C=new oe(1.95,32);C.rotateX(-Math.PI/2);let w=Ht(p),ee=new t(C,w);ee.position.y=.38,ee.name=`water`,ee.renderOrder=1;let T=(e,t,n)=>{let r=-n*.28;for(let n of[-.8,.8])i.block(e+n,0,t-.2,.06,.34,.06,J.iron),i.block(e+n,0,t+.2,.06,.34,.06,J.iron);for(let n=-1;n<=1;n++)i.block(e,.34,t+n*.13,1,.07,.055,n===0?J.woodDark:J.wood);i.block(e-.8,.34,t+r,.06,.52,.05,J.iron),i.block(e+.8,.34,t+r,.06,.52,.05,J.iron),i.block(e,.58,t+r,1,.1,.05,J.wood),i.block(e,.76,t+r,1,.1,.05,J.woodDark),l.push({x:e-.6,z:t,r:.45},{x:e+.6,z:t,r:.45}),u.push({x:e,z:t+n*.95})};T(-5.8,-3.1,1),T(5.8,-3.1,1),T(-5.8,3.1,-1),T(5.8,3.1,-1);for(let e of g){i.block(e.x,0,e.z,.28,1.5,.28,J.trunk),i.block(e.x+.35,0,e.z,.12,.25,.3,J.trunk),i.block(e.x-.3,0,e.z+.2,.1,.18,.2,J.trunk);let t=[{y:1.3,r:1.5,h:.7,c:J.leafC},{y:2,r:1.25,h:.65,c:J.leafA},{y:2.65,r:.85,h:.55,c:J.leafB},{y:3.2,r:.45,h:.35,c:J.leafB}];for(let r of t){let t=.5;for(let i=-r.r;i<r.r;i+=t)for(let a=-r.r;a<r.r;a+=t){if(Math.hypot(i+t/2,a+t/2)>r.r)continue;let s=n()*.12,c=i+t/2<-r.r*.35&&a+t/2>-r.r*.2||n()<.12?J.leafSun:n()<.2?J.leafB:r.c;o.box(e.x+i,r.y,e.z+a,e.x+i+t,r.y+r.h+s,e.z+a+t,c,55)}}for(let t=0;t<5;t++){let r=n()*Math.PI*2;o.block(e.x+Math.cos(r)*1.1,1.75+n()*.6,e.z+Math.sin(r)*1.1,.09,.18,.09,J.petals[t%2])}l.push({x:e.x,z:e.z,r:.85}),u.push({x:e.x+.9,z:e.z+.9})}let te=(e,t,r,o)=>{i.box(e,0,t,r,.12,o,J.soil,55,J.soilTop);{let n=r-e,i=o-t,a=Math.min(n,i)/2,s=Math.max(1,Math.ceil(Math.max(n,i)/(a*1.4)));for(let c=0;c<s;c++){let u=(c+.5)/s;l.push(n>=i?{x:e+n*u,z:(t+o)/2,r:a}:{x:(e+r)/2,z:t+i*u,r:a})}}i.box(e-.08,0,t-.08,r+.08,.16,t+.04,J.woodDark),i.box(e-.08,0,o-.04,r+.08,.16,o+.08,J.woodDark),i.box(e-.08,0,t,e+.04,.16,o,J.woodDark),i.box(r-.04,0,t,r+.08,.16,o,J.woodDark);for(let i=e+.25;i<r-.1;i+=.42)for(let e=t+.25;e<o-.1;e+=.42){let t=i+(n()-.5)*.15,r=e+(n()-.5)*.15,o=.2+n()*.22;a.block(t,.12,r,.03,o,.03,J.leafA),a.block(t+.07,.12,r,.06,.05,.03,J.leafB);let s=J.petals[Math.floor(n()*J.petals.length)];a.block(t,.12+o,r,.1,.1,.1,s,55,Gt(s,1.1)),a.block(t,.12+o+.1,r,.035,.035,.035,16763196)}};te(-12.8,-4.4,-9.2,-2),te(-12.8,2,-9.2,4.4),te(9.4,2,12.8,4.4),te(10.2,-4.2,12.8,-2.2),te(-3.6,-9.2,-1.6,-6.4),te(1.6,6.4,3.6,9.2);let ne=(e,t,r,a)=>{i.box(e,0,t,r,.75,a,J.hedge,55,J.hedgeTop);for(let o=e;o<r-.01;o+=.5)for(let e=t;e<a-.01;e+=.5)n()<.45?i.box(o+.05,.75,e+.05,Math.min(r,o+.45),.87+n()*.08,Math.min(a,e+.45),n()<.3?J.leafSun:J.hedgeTop):n()<.08&&i.block(o+.25,.75,e+.25,.06,.08,.06,J.petals[Math.floor(n()*3)])};ne(-14.5,-10.5,-1.4,-9.7),ne(1.4,-10.5,14.5,-9.7),ne(-14.5,9.7,-1.4,10.5),ne(1.4,9.7,14.5,10.5),ne(-14.5,-9.7,-13.7,-1.4),ne(-14.5,1.4,-13.7,9.7),ne(13.7,-9.7,14.5,-1.4),ne(13.7,1.4,14.5,9.7);for(let[e,t]of[[-1.25,-10],[1.25,-10],[-1.25,zt],[1.25,zt],[-14,-1.25],[-14,1.25],[Rt,-1.25],[Rt,1.25]])i.block(e,0,t,.17,1,.17,J.terrace,55,J.terraceCap),i.block(e,1,t,.22,.08,.22,J.terraceCap),s.block(e,1.08,t,.07,.1,.07,16763196);for(let[e,t]of[[-3.9,-3.9],[3.9,-3.9],[-3.9,3.9],[3.9,3.9]])i.block(e,0,t,.2,.12,.2,J.iron),i.block(e,.12,t,.07,1.9,.07,J.iron),i.block(e,2.02,t,.2,.06,.2,J.iron),s.block(e,2.08,t,.15,.34,.15,16769946),i.block(e,2.42,t,.22,.07,.22,J.iron),i.block(e,2.49,t,.08,.1,.08,J.iron),l.push({x:e,z:t,r:.2}),f.push(new S(e,2.25,t));let ie=8.2,ae=-6.6;i.block(ie,0,ae,.8,.18,.8,J.carpet,55,J.carpetTop),i.block(7.85,.18,-6.8999999999999995,.13,1.4,.13,J.rope),i.block(8.6,.18,-6.25,.13,.8,.13,J.rope),i.block(8.6,.98,-6.25,.5,.14,.5,J.carpet,55,J.carpetTop),i.block(7.85,1.58,-6.8999999999999995,.55,.14,.55,J.carpet,55,J.carpetTop),i.block(7.85,1.72,-6.8999999999999995,.12,.25,.12,J.rope),i.block(8.399999999999999,.98,-6.25,.05,.2,.05,16743074),l.push({x:ie,z:ae,r:.9}),u.push({x:6.999999999999999,z:-5.5});let se=(e,t,n,r)=>{i.block(e,0,t,.22,.1,.22,n,55,Gt(n,1.15)),i.block(e,.1,t,.15,.02,.15,r)},D=[{x:-4.4,z:6.6},{x:-3.8,z:6.9}];se(D[0].x,D[0].z,16743074,10511164),se(D[1].x,D[1].z,16763196,12903164),l.push({x:-4.1,z:6.75,r:.45});let ce={x:-4.1,z:5.9};u.push({x:-4.1,z:6});let le=(e,t,n)=>{i.block(e,0,t,.14,.26,.14,n,55,Gt(n,1.2)),i.block(e,.05,t,.18,.16,.1,n),i.block(e,.05,t,.1,.16,.18,Wt(n,.9)),i.block(e+.24,0,t+.05,.12,.015,.015,n),l.push({x:e,z:t,r:.2})};le(-7.2,-6.2,16743074),le(6.4,7,10053324),le(-1.9,4.7,12903164),i.box(-8.950000000000001,0,6.5,-7.8500000000000005,.55,7.300000000000001,13210972,51),i.tile(-8.870000000000001,6.58,-7.930000000000001,7.220000000000001,.12,7031342),i.box(-8.950000000000001,.55,6.5,-7.8500000000000005,.6,6.58,14264426),i.box(-8.950000000000001,.55,7.220000000000001,-7.8500000000000005,.6,7.300000000000001,14264426),i.box(-8.950000000000001,.55,6.58,-8.870000000000001,.6,7.220000000000001,14264426),i.box(-7.930000000000001,.55,6.58,-7.8500000000000005,.6,7.220000000000001,14264426),i.box(-8.950000000000001,.55,7.300000000000001,-7.8500000000000005,.62,7.65,14264426,23),l.push({x:-8.4,z:6.9,r:.65});let O=It(e*31+5),ue=(e,t)=>Math.abs(e)<14.62&&Math.abs(t)<10.62;for(let e=-46;e<46;e+=2)for(let t=-46;t<46;t+=2){if(Math.abs(e+1)<23&&Math.abs(t+1)<19){for(let n=0;n<2;n++)for(let r=0;r<2;r++){let i=e+n,a=t+r;if(ue(i+.5,a+.5))continue;let o=O();if(c.tile(i,a,i+1,a+1,Y,o<.5?J.meadowA:o<.93?J.meadowB:J.meadowC),o>.86){let e=O();c.block(i+.2+e*.6,Y,a+.8-e*.6,.05,.1,.05,e<.3?J.petals[Math.floor(e*20)%4]:J.meadowC)}}continue}let n=O();c.tile(e,t,e+2,t+2,Y,n<.5?J.meadowA:n<.9?J.meadowB:J.meadowC)}for(let[e,t,n,r]of[[-1,-46,1,-10.62],[-1,10.62,1,46],[-46,-1,-14.62,1],[14.62,-1,46,1]])c.box(e+(n-e>3?0:.2),Y,t+(r-t>3?0:.2),n-(n-e>3?0:.2),-.52,r-(r-t>3?0:.2),J.stoneC,4);let de=(e,t,n)=>{c.block(e,Y,t,.18*n,.9*n,.18*n,J.farTrunk);let r=O()<.5?J.farA:J.farB;c.block(e,Y+.8*n,t,.95*n,.8*n,.95*n,r,55,Gt(r,1.12)),c.block(e,Y+1.6*n,t,.62*n,.6*n,.62*n,r,55,Gt(r,1.18)),O()<.6&&c.block(e,Y+2.2*n,t,.3*n,.35*n,.3*n,r,55,Gt(r,1.22))};for(let e=0;e<160;e++){let e=O()*Math.PI*2,t=Math.cos(e)*(17+O()*26),n=Math.sin(e)*(13+O()*24);if(Math.abs(t)<2.2||Math.abs(n)<2.2)continue;let r=t>Rt||n>zt,i=Math.abs(t)-Rt,a=Math.abs(n)-zt;Math.max(i,a)<(r?9:2.5)||de(t,n,r?.6+O()*.3:.75+O()*.8)}for(let e=0;e<14;e++){let t=e/14*Math.PI*2+O()*.3,n=Math.cos(t)*40,r=Math.sin(t)*34,i=5+O()*5;for(let e=0;e<3;e++){let t=i*(1-e*.3);c.block(n,Y+e*.9,r,t,.9,t*.7,e===2?J.farA:J.meadowB,55,Gt(J.meadowA,1.05))}}let fe=new r;fe.name=`garden`;let k=i.build(),A=new t(k,new d({vertexColors:!0}));A.name=`garden-static`,A.matrixAutoUpdate=!1;let pe=a.build(),me=new t(pe,Bt(p,.02,.32));me.name=`garden-sway`,me.matrixAutoUpdate=!1;let he=o.build(),ge=new t(he,Bt(p,1.4,.035));ge.name=`garden-leaves`,ge.matrixAutoUpdate=!1;let _e=s.build(),j=new re({vertexColors:!0});j.color.setScalar(2.6);let ve=new t(_e,j);ve.name=`garden-glow`,ve.matrixAutoUpdate=!1;let ye=c.build(),M=new t(ye,Vt(m,1.5,17));M.name=`garden-far`,M.matrixAutoUpdate=!1,fe.add(M,A,me,ge,ve,ee);let be=e=>{A.castShadow=A.receiveShadow=e,ge.castShadow=e,ge.receiveShadow=e,me.receiveShadow=e,M.receiveShadow=!1};return be(!1),{group:fe,world:{bounds:{minX:-13.2,maxX:13.2,minZ:-9.1,maxZ:9.1},obstacles:l,spots:u},spout:new S(0,2.1,0),water:ee,lamps:f,bowls:D,feedSpot:ce,halfX:Rt,halfZ:zt,triangles:i.triangles+a.triangles+o.triangles+s.triangles+c.triangles+32,sky:m,update(e){p.value=e},setShadows:be,dispose(e=!1){for(let t of[A,me,ge,ve,M,ee])t.geometry.dispose(),e||t.material.dispose()}}}function Wt(e,t){return new E(e).multiplyScalar(t).getHex()}function Gt(e,t){let n=new E(e);return n.r=Math.min(1,n.r*t),n.g=Math.min(1,n.g*t),n.b=Math.min(1,n.b*t),n.getHex()}var Kt={WALK:`WALKING`,RUN:`RUNNING`,IDLE:`IDLE`,SIT:`SITTING`,GROOM:`GROOMING`,LOAF:`LOAF`,SLEEP:`SLEEP`,DIG:`DIGGING`,HOP:`JUMPING`,POSE:`SITTING`,EAT:`DIGGING`},qt={WALK:`Strolling`,RUN:`Doing zoomies`,IDLE:`Looking around`,SIT:`Sitting pretty`,GROOM:`Grooming`,LOAF:`Loafing`,SLEEP:`Napping`,DIG:`Digging`,HOP:`Happy hop!`,POSE:`Saying hi`,EAT:`Eating`};function X(e){let t=e.rng=e.rng+1831565813|0;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function Jt(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}var Yt=.36,Xt=.7,Zt=.85,Qt=2.4;function $t(e,t,n,r=Yt){for(let i of e.obstacles){let e=t-i.x,a=n-i.z;if(e*e+a*a<(i.r+r)*(i.r+r))return!0}return!1}function en(e,t,n,r,i,a=Yt){let o=r-t,s=i-n,c=o*o+s*s||1e-6;for(let r of e.obstacles){let e=((r.x-t)*o+(r.z-n)*s)/c;e=e<0?0:e>1?1:e;let i=t+o*e-r.x,l=n+s*e-r.z;if(i*i+l*l<(r.r+a)*(r.r+a))return!0}return!1}function tn(e,t){let n=t.bounds;return{x:n.minX+X(e)*(n.maxX-n.minX),z:n.minZ+X(e)*(n.maxZ-n.minZ)}}function Z(e,t,n){let r=tn(e,t);for(let i=0;i<40;i++){let i=tn(e,t);if($t(t,i.x,i.z,.45999999999999996))continue;let a=!0;for(let e of n){let t=e.x-i.x,n=e.z-i.z;if(t*t+n*n<1){a=!1;break}}if(r=i,a)break}return r}function nn(e,t,n=[]){let r={x:0,z:0,vx:0,vz:0,behaviour:`IDLE`,timer:0,tx:0,tz:0,speed:Zt,rng:Jt(e)|0,held:!1,sleepy:0,playful:0,errand:null,meals:0};r.sleepy=X(r),r.playful=X(r);let i=Z(r,t,n);r.x=r.tx=i.x,r.z=r.tz=i.z;let a=X(r);return a<.25?Q(r,`SLEEP`):a<.4?Q(r,`LOAF`):a<.55?Q(r,`GROOM`):a<.7?Q(r,`SIT`):r.timer=X(r)*2,r.timer*=.3+X(r)*.7,r}var rn={IDLE:[1.5,4],SIT:[4,9],GROOM:[3.5,7],LOAF:[5,11],SLEEP:[9,20],DIG:[1.5,3],HOP:[.8,.8],POSE:[999,999]},an=[2,4];function Q(e,t){e.behaviour=t,e.vx=e.vz=0;let[n,r]=rn[t]??an;e.timer=n+X(e)*(r-n)}function on(e,t){for(let n=0;n<10;n++){let n;if(t.spots.length&&X(e)<.35){let r=t.spots[Math.floor(X(e)*t.spots.length)];n={x:r.x+(X(e)-.5)*1.2,z:r.z+(X(e)-.5)*1.2}}else{let t=X(e)<.3?12:3.5;n={x:e.x+(X(e)*2-1)*t,z:e.z+(X(e)*2-1)*t}}let r=t.bounds;n.x=Math.min(r.maxX,Math.max(r.minX,n.x)),n.z=Math.min(r.maxZ,Math.max(r.minZ,n.z));let i=(n.x-e.x)**2+(n.z-e.z)**2;if(i<.5||$t(t,n.x,n.z)||en(t,e.x,e.z,n.x,n.z))continue;e.tx=n.x,e.tz=n.z;let a=X(e)<.12+e.playful*.15;return e.behaviour=a?`RUN`:`WALK`,e.speed=(a?Qt:Zt)*(.85+X(e)*.3),e.timer=Math.sqrt(i)/e.speed+2,!0}return!1}function sn(e,t){let n=e.behaviour;if(n===`WALK`||n===`RUN`||n===`HOP`){let n=X(e),r=.1+e.sleepy*.18;n<r?Q(e,`SLEEP`):n<r+.14?Q(e,`LOAF`):n<r+.3?Q(e,`GROOM`):n<r+.45?Q(e,`SIT`):n<r+.5?Q(e,`DIG`):n<r+.75?Q(e,`IDLE`):on(e,t)||Q(e,`IDLE`);return}if(n===`SLEEP`&&X(e)<.3){Q(e,`GROOM`);return}on(e,t)||Q(e,`IDLE`)}function cn(e,t,n,r,i,a){let o=t.bounds;e.tx=Math.min(o.maxX,Math.max(o.minX,n)),e.tz=Math.min(o.maxZ,Math.max(o.minZ,r)),e.errand={then:i,seconds:a},e.behaviour=`RUN`,e.speed=Qt,e.timer=Math.hypot(e.tx-e.x,e.tz-e.z)/Qt+4}function ln(e){let t=e.errand;e.errand=null,e.behaviour=t.then,e.vx=e.vz=0,e.timer=t.seconds}function un(e){e.held=!0,e.behaviour!==`SLEEP`&&(e.behaviour===`EAT`||e.errand||(e.behaviour=`HOP`,e.vx=e.vz=0,e.timer=.75))}function dn(e){e.held=!1,e.behaviour===`POSE`&&(e.timer=.5+X(e))}var fn=.5,pn=Math.sqrt(fn),mn=new WeakMap;function hn(e){let t=e.length,n=mn.get(e);if(!n||n.order.length!==t){n={order:new Int32Array(t),rank:new Int32Array(t)};for(let e=0;e<t;e++)n.order[e]=e;mn.set(e,n)}let r=n.order;for(let n=1;n<t;n++){let t=r[n],i=e[t].x,a=n-1;for(;a>=0&&e[r[a]].x>i;)r[a+1]=r[a],a--;r[a+1]=t}for(let e=0;e<t;e++)n.rank[r[e]]=e;return n}function gn(e,t,n){let r=Math.min(.1,Math.max(0,n)),i=e.length,{order:a,rank:o}=hn(e),s=t.obstacles;for(let n=0;n<i;n++){let c=e[n];if(c.timer-=r,c.behaviour===`WALK`||c.behaviour===`RUN`){if(c.held&&!c.errand){c.behaviour=`POSE`,c.timer=999,c.vx=c.vz=0;continue}let l=c.tx-c.x,u=c.tz-c.z,d=Math.sqrt(l*l+u*u);if(d<.08||c.timer<=0){c.errand?ln(c):sn(c,t);continue}let f=l/d*c.speed,p=u/d*c.speed,m=o[n];for(let t=m-1;t>=0;t--){let n=e[a[t]],r=c.x-n.x;if(r>=pn)break;let i=c.z-n.z,o=r*r+i*i;if(o<fn&&o>1e-6){let e=(fn-o)*2.2;f+=r*e,p+=i*e}}for(let t=m+1;t<i;t++){let n=e[a[t]],r=c.x-n.x;if(-r>=pn)break;let i=c.z-n.z,o=r*r+i*i;if(o<fn&&o>1e-6){let e=(fn-o)*2.2;f+=r*e,p+=i*e}}for(let e=0;e<s.length;e++){let t=s[e],n=c.x-t.x,r=c.z-t.z,i=t.r+Yt+Xt,a=n*n+r*r;if(a>i*i||a<1e-12)continue;let o=Math.sqrt(a),d=o-t.r-Yt,m=n/o,h=r/o,g=-(f*m+p*h);if(g<=0)continue;let _=-h,v=m;_*l+v*u<0&&(_=-_,v=-v);let y=Math.min(1,Math.max(0,1-d/Xt));f+=(m+_)*g*y,p+=(h+v)*g*y}let h=Math.sqrt(f*f+p*p)||1,g=Math.min(c.speed,h);c.vx=f/h*g,c.vz=p/h*g,c.x+=c.vx*r,c.z+=c.vz*r}else c.vx=c.vz=0,c.behaviour===`EAT`&&c.timer<=0?(c.meals++,c.behaviour=`HOP`,c.timer=rn.HOP[0]):c.behaviour===`HOP`&&c.timer<=0?c.held?(c.behaviour=`POSE`,c.timer=999):sn(c,t):!c.held&&c.timer<=0&&sn(c,t)}vn(e,hn(e).order);let c=t.bounds;for(let t=0;t<i;t++){let n=e[t];n.x=Math.min(c.maxX,Math.max(c.minX,n.x)),n.z=Math.min(c.maxZ,Math.max(c.minZ,n.z));for(let e=0;e<s.length;e++){let t=s[e],r=n.x-t.x,i=n.z-t.z,a=t.r+Yt,o=r*r+i*i;if(o<a*a){let e=Math.sqrt(o)||.001;n.x=t.x+r/e*a,n.z=t.z+i/e*a}}}}var _n=.6;function vn(e,t){let n=_n*_n,r=e.length;for(let i=0;i<r;i++){let a=t[i];for(let o=i+1;o<r;o++){let r=t[o];if(e[r].x-e[a].x>=.6)break;let i=a<r?a:r,s=a<r?r:a,c=e[i],l=e[s],u=c.x-l.x,d=c.z-l.z,f=u*u+d*d;if(f>=n)continue;f<1e-8&&(u=(i*7+s*3)%5-2||1,d=(i*3+s*5)%5-2,f=u*u+d*d);let p=Math.sqrt(f),m=(_n-Math.min(p,_n))*.5,h=u/p,g=d/p,_=c.held?0:l.held?2:1,v=l.held?0:c.held?2:1;c.x+=h*m*_*.5,c.z+=g*m*_*.5,l.x-=h*m*v*.5,l.z-=g*m*v*.5}}}var yn=Math.PI/4,bn=35*Math.PI/180,xn=60,Sn=1/20,Cn=.7,wn=3.2,Tn=1.7,En=26,Dn=[`IDLE`,`WALKING`,`SITTING`,`GROOMING`,`LOAF`,`SLEEP`,`RUNNING`,`DIGGING`,`JUMPING`],On=4,kn=[`the fountain rim`,`sunny benches`,`the cardboard box`,`the cat tower`,`yarn balls`,`flower beds`,`tree shade`,`the food bowls`,`belly rubs`,`zoomies at dusk`],An=[`chirps at birds`,`naps in loaves`,`slow-blinks at everyone`,`talks back`,`loves a head bump`,`purrs like an engine`,`kneads blankets`,`chases leaves`,`sleeps belly-up`,`counts catnip`],jn=`
.chy-root { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab;
  background: linear-gradient(160deg, #ffd9a0 0%, #f6b9cf 45%, #b68ad8 100%); }
.chy-root.chy-drag { cursor: grabbing; }
.chy-root.chy-hover { cursor: pointer; }
.chy-root canvas { display: block; width: 100%; height: 100%; outline: none; }
.chy-label { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); padding: 3px 10px; border-radius: 10px;
  background: var(--ch-coin); color: var(--ch-ol); border: 3px solid var(--ch-ol); box-shadow: 0 3px 0 var(--ch-ol); font-size: 16px; white-space: nowrap; pointer-events: none; display: none; }
.chy-label.chy-tag { background: var(--ch-mint); font-size: 14px; padding: 2px 8px; }
.chy-card { position: absolute; left: 12px; right: 12px; margin: 0 auto; bottom: calc(var(--ch-sab) + var(--chy-card-bottom, 14px)); max-width: 380px;
  display: none; gap: 12px; align-items: center; padding: 12px 14px; pointer-events: auto; animation: ch-pop .25s ease-out both; }
.chy-card.chy-on { display: flex; }
.chy-card canvas { width: 80px; height: 80px; flex: 0 0 80px; image-rendering: pixelated; border-radius: 12px; background: radial-gradient(circle at 50% 70%, rgba(255,201,60,.35), rgba(0,0,0,0) 70%); }
.chy-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; text-align: left; }
.chy-info h3 { margin: 0; font-size: 26px; color: var(--ch-coin); font-weight: normal; text-shadow: 0 2px 0 var(--ch-ol); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chy-info p { margin: 0; font-family: system-ui, sans-serif; font-size: 13px; color: var(--ch-lilac); }
.chy-info .chy-act { color: var(--ch-mint); font-family: 'Cat Paw', system-ui, sans-serif; font-size: 16px; }
.chy-btns { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.chy-btns .ch-btn { min-height: 40px; padding: 6px 14px; font-size: 15px; border-radius: 12px; }
.chy-btns .ch-btn:disabled { opacity: .6; cursor: default; }
.chy-close { position: absolute; top: -14px; right: -14px; width: 40px !important; height: 40px !important; min-width: 40px; min-height: 40px !important; font-size: 18px !important; }
.chy-zoom { position: absolute; right: calc(var(--ch-sar) + 12px); bottom: calc(var(--ch-sab) + var(--chy-card-bottom, 14px)); display: flex; flex-direction: column; gap: 8px; pointer-events: auto; }
.chy-card.chy-on ~ .chy-zoom { bottom: calc(var(--ch-sab) + var(--chy-card-bottom, 14px) + 136px); }
@media (max-width: 520px) {
  .chy-zoom { display: none; }
  .ch-yard-title { top: calc(var(--ch-sat) + 70px) !important; }
  .ch-yard-title .ch-sub { display: none; }
}
`,Mn=!1,Nn=null;function Pn(e,n,r={}){let a=r.base??ve;if(Pt(a),!Mn){Mn=!0;let e=document.createElement(`style`);e.dataset.ch=`yard`,e.textContent=jn,document.head.appendChild(e)}let c=r.reducedMotion??Ct(),f=r.detail??`auto`,p=W(`div.chy-root`,{"data-yard":``});e.appendChild(p),r.cardBottomPx!=null&&p.style.setProperty(`--chy-card-bottom`,`${Math.max(0,Math.round(r.cardBottomPx))}px`);let x=r.tier?{tier:r.tier,probe:null}:ft(),C=x.tier,w=x.probe,T=Nn??=new ue({antialias:!0,powerPreference:`high-performance`}),ne=r.maxPixelRatio??2,ae=()=>Math.min(window.devicePixelRatio||1,C===`high`?ne:Math.min(ne,1.5));T.setPixelRatio(ae()),T.outputColorSpace=y,T.setClearColor(16169423,1),T.shadowMap.enabled=!0,T.shadowMap.type=1,T.info.autoReset=!1,p.appendChild(T.domElement),T.domElement.setAttribute(`aria-label`,`Cat Yard: drag to look around, tap a cat`),T.domElement.tabIndex=0;let oe=W(`div.ch-ui`);p.appendChild(oe);let se=W(`div.chy-label`),D=W(`div.chy-label.chy-tag`,{"data-yard-tag":``});oe.append(D,se);let O=new o,k=new s(-1,1,1,-1,.1,200),me=new g(16769732,8014504,1.2),he=new fe(16758894,2.45),ge=new S(-6,7.5,11).normalize();he.position.copy(ge).multiplyScalar(40),he.target.position.set(0,0,0),he.shadow.mapSize.set(2048,2048),he.shadow.bias=-6e-4,he.shadow.normalBias=.035;{let e=he.shadow.camera;e.left=-21,e.right=21,e.top=17,e.bottom=-17,e.near=5,e.far=80,e.updateProjectionMatrix()}let _e=new fe(11117823,.7);_e.position.set(10,6,-9),O.add(me,he,he.target,_e,new ee(16773350,.18));let j=Ut();O.add(j.group);let ye=new l({uniforms:j.sky,depthWrite:!1,depthTest:!1,vertexShader:`void main() { gl_Position = vec4(position.xy, 0.9999, 1.0); }`,fragmentShader:`${Lt}\nvoid main() { gl_FragColor = vec4(skyAt(gl_FragCoord.xy / uRes), 1.0);\n#include <colorspace_fragment>\n}`}),M=new t(new m(2,2),ye);M.frustumCulled=!1,M.renderOrder=-100,M.name=`sky`,M.matrixAutoUpdate=!1,O.add(M);let be=(()=>{let e=document.createElement(`canvas`);e.width=e.height=64;let t=e.getContext(`2d`),n=t.createRadialGradient(32,32,0,32,32,32);n.addColorStop(0,`rgba(255,255,255,1)`),n.addColorStop(.45,`rgba(255,255,255,0.7)`),n.addColorStop(1,`rgba(255,255,255,0)`),t.fillStyle=n,t.fillRect(0,0,64,64);let r=new ce(e);return r.colorSpace=y,r})(),xe=new m(1,1);xe.rotateX(-Math.PI/2);let Se=new re({color:16761466,map:be,transparent:!0,opacity:.3,blending:2,depthWrite:!1}),Ce=new i(xe,Se,j.lamps.length);j.lamps.forEach((e,t)=>Ce.setMatrixAt(t,new ie().makeScale(3.6,1,3.6).setPosition(e.x,.07,e.z))),Ce.name=`light-pools`,Ce.renderOrder=1,Ce.matrixAutoUpdate=!1,O.add(Ce);let we=(()=>{let e=[new de(.035,.035,.16),new de(.15,.012,.15).translate(-.093,0,.01),new de(.15,.012,.15).translate(.093,0,.01)],t=[],n=[],r=[],i=[],a=[],o=0;e.forEach((e,s)=>{let c=e.attributes.position,l=e.attributes.normal;for(let e=0;e<c.count;e++){t.push(c.getX(e),c.getY(e),c.getZ(e)),n.push(l.getX(e),l.getY(e),l.getZ(e));let a=s===0?.18:1;r.push(a,a,a),i.push(s===0?0:1)}let u=e.index;for(let e=0;e<u.count;e++)a.push(u.getX(e)+o);o+=c.count,e.dispose()});let s=new te;return s.setAttribute(`position`,new A(t,3)),s.setAttribute(`normal`,new A(n,3)),s.setAttribute(`color`,new A(r,3)),s.setAttribute(`aWing`,new A(i,1)),s.setIndex(a),s})(),Te={value:0},Ee=new d({vertexColors:!0,emissive:3807786});Ee.onBeforeCompile=e=>{e.uniforms.uTime=Te,e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
uniform float uTime;
attribute float aWing;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
        if (aWing > 0.5) {
          float a = sin(uTime * 15.0 + float(gl_InstanceID) * 1.9) * 1.05;
          float ax = abs(transformed.x);
          transformed.y += ax * sin(a);
          transformed.x = sign(transformed.x) * ax * cos(a);
        }`)},Ee.customProgramCacheKey=()=>`yard-butterfly`;let De=new i(we,Ee,9),Oe=[16743074,16763196,12903164,15779325,16777215,15623210,14021861,16743074,16763196],ke=Array.from({length:9},(e,t)=>{let n=[[-11,-3.2],[-11,3.2],[11,3.2],[11.5,-3.2],[-2.6,-7.8],[2.6,7.8],[0,0],[-6,0],[6,0]],[r,i]=n[t%n.length];return{hx:r,hz:i,r:1.2+t%3*.6,a:.35+t%4*.12,b:.5+t%5*.1,p:t*2.1}});Oe.forEach((e,t)=>De.setColorAt(t,new E(e))),De.frustumCulled=!1,De.name=`butterflies`,De.matrixAutoUpdate=!1,O.add(De);let Ae=new m(.95,.95);Ae.rotateX(-Math.PI/2);let je=new re({color:3806784,map:be,transparent:!0,opacity:.5,depthWrite:!1}),Me=n?.cats??[],Ne=r.cats?.length?r.cats:Me.map(e=>e.id),Pe=r.entries??Ne.map(e=>Me.find(t=>t.id===e)).filter(e=>!!e),N=new i(Ae,je,Math.max(1,Pe.length));N.name=`cat-shadows`,N.matrixAutoUpdate=!1,N.renderOrder=1,N.frustumCulled=!1,O.add(N);let Fe=new de(.09,.09,.09),Ie=new re({color:new E(15005439).multiplyScalar(1.12)}),Le=new i(Fe,Ie,28);Le.name=`drops`,Le.matrixAutoUpdate=!1,Le.frustumCulled=!1,O.add(Le);let Re=Array.from({length:28},(e,t)=>({a:t/28*Math.PI*2+t%3*.4,v:1+t*7%5*.12,t:t*.137%1})),ze=new de(.06,.05,.06),Ve=new i(ze,new d({color:10511164,emissive:2757640}),9);Ve.name=`kibble`,Ve.visible=!1,Ve.frustumCulled=!1,Ve.matrixAutoUpdate=!1,O.add(Ve);let He=j.bowls[0];function We(e){Ve.visible=e>0;for(let t=0;t<9;t++){let n=t<Math.ceil(e*9),r=t*2.4,i=t%3*.035;In.makeTranslation(He.x+Math.cos(r)*i,.135+Math.floor(t/5)*.04,He.z+Math.sin(r)*i),Ve.setMatrixAt(t,n?In:Ge)}Ve.instanceMatrix.needsUpdate=!0}let Ge=new ie().makeScale(0,0,0),Ke=new _(.5,.7,32);Ke.rotateX(-Math.PI/2);let qe=new t(Ke,new re({color:new E(16763196).multiplyScalar(1.8),transparent:!0,opacity:.95,depthWrite:!1}));qe.visible=!1,qe.renderOrder=2,O.add(qe);let Ze=new _(.56,.68,32);Ze.rotateX(-Math.PI/2);let Qe=new t(Ze,new re({color:new E(14021861).multiplyScalar(1.3),transparent:!0,opacity:.85,depthWrite:!1}));Qe.visible=!1,Qe.renderOrder=2,Qe.name=`home-ring`,O.add(Qe);let P=j.world,$e=r.spawnNear?{...P,bounds:{minX:Math.max(P.bounds.minX,r.spawnNear.x-r.spawnNear.r),maxX:Math.min(P.bounds.maxX,r.spawnNear.x+r.spawnNear.r),minZ:Math.max(P.bounds.minZ,r.spawnNear.z-r.spawnNear.r),maxZ:Math.min(P.bounds.maxZ,r.spawnNear.z+r.spawnNear.r)}}:P,et=[],F=Pe.map(e=>{let t=nn(e.id,$e,et);return et.push(t),{entry:e,agent:t,sheet:null,lo:null,hi:null,cur:null,row:``,faceX:t.rng&1?1:-1}}),tt=F.map((e,t)=>({i:t,color:r.aura?.(e.entry.id)})).filter(e=>e.color!=null),nt=new m(1.5,1.5);nt.rotateX(-Math.PI/2);let I=new i(nt,new re({map:be,transparent:!0,opacity:.55,blending:2,depthWrite:!1}),Math.max(1,tt.length));I.name=`auras`,I.visible=tt.length>0,I.renderOrder=1,I.frustumCulled=!1,I.matrixAutoUpdate=!1,tt.forEach((e,t)=>I.setColorAt(t,new E(e.color))),O.add(I);let rt=new Map,at=[],ot=0;function st(e,t){for(let n of Dn){let r=Ue(e,n);for(let n=0;r>=0&&n<e.rows[r].frames;n++)at.push(()=>Xe(e,r,n,t))}}let ct=0;function lt(e,t,n){let r=new it(e.sheet,{scale:Sn,extrude:n?Je:Ye,phase:t*.618%1,castShadow:n&&C===`high`});return r.object3d.rotation.y=yn,r.setFacing(e.faceX),rt.set(r.mesh,t),O.add(r.object3d),n&&f===`auto`&&st(e.sheet,Je),r}let ut=Promise.all(F.map((e,t)=>Be(e.entry,a).then(n=>{Un||(e.sheet=n,e.lo=lt(e,t,f===`high`),e.cur=e.lo,ct++,st(n,f===`high`?Je:Ye))}).catch(t=>{console.warn(`[yard] sheet failed`,e.entry.id,t),Un||r.onSheetError?.(e.entry.id,t)}))).then(()=>void 0),L=new S(0,0,.5),R=new b,z=1,B=1,V=1,H=1,U=-1,pt=new S(Math.sin(yn)*Math.cos(bn),Math.sin(bn),Math.cos(yn)*Math.cos(bn)),mt=new S(Math.cos(yn),0,-Math.sin(yn)),ht=new S(-Math.sin(yn),0,-Math.cos(yn));function gt(){let e=V/Math.max(1,H);return Math.min(30,Math.max(17,26/Math.max(.5,e)))}let _t=NaN,vt=NaN,yt=NaN,bt=0,xt=0;function St(){return L.x!==_t||L.z!==vt||z!==yt||V!==bt||H!==xt}function wt(){let e=gt()/(2*z),t=V/Math.max(1,H)*e;k.left=-t,k.right=t,k.top=e,k.bottom=-e,k.updateProjectionMatrix(),Tt(),k.position.copy(L).addScaledVector(pt,xn),k.lookAt(L),k.updateMatrixWorld(),_t=L.x,vt=L.z,yt=z,bt=V,xt=H}function Tt(){let e=gt()/(2*z),t=V/Math.max(1,H)*e,n=j.halfX*Math.abs(mt.x)+j.halfZ*Math.abs(mt.z),r=j.halfX*Math.abs(ht.x)+j.halfZ*Math.abs(ht.z),i=Math.max(1.5,n-1.1*t),a=Math.max(1.5,r-1.1*e/Math.sin(bn)),o=L.x*mt.x+L.z*mt.z,s=L.x*ht.x+L.z*ht.z,c=Math.max(-i,Math.min(i,o)),l=Math.max(-a,Math.min(a,s));L.x=mt.x*c+ht.x*l,L.z=mt.z*c+ht.z*l,L.x=Math.max(-j.halfX+2,Math.min(j.halfX-2,L.x)),L.z=Math.max(-j.halfZ+2,Math.min(j.halfZ-2,L.z))}function Et(){return gt()/z/Math.max(1,H)}function Dt(e,t){let n=Et();L.addScaledVector(mt,-e*n),L.addScaledVector(ht,t*n/Math.sin(bn)),U=-1}function Ot(e,t=!1){B=Math.max(Cn,Math.min(wn,e)),(t||c)&&(z=B)}function At(e,t){let n=F.find(t=>t.entry.id===e);n&&(U=-1,R.set(0,0),t!=null&&Ot(t,!0),L.set(n.agent.x,0,n.agent.z))}r.initialFocus?At(r.initialFocus,r.initialZoom??1):r.initialZoom&&Ot(r.initialZoom,!0);let G=()=>{let e=p.getBoundingClientRect();V=Math.max(1,Math.round(e.width)),H=Math.max(1,Math.round(e.height)),T.setSize(V,H,!1),jt?.setSize(V,H),T.getDrawingBufferSize(j.sky.uRes.value),wt()},jt=null;function Mt(){let e=C===`high`;he.castShadow=e,j.setShadows(e);for(let t of F)t.hi&&(t.hi.mesh.castShadow=e);e&&!jt?jt=new dt(T,O,k,{bloomStrength:.55,bloomRadius:.5,bloomThreshold:1,exposure:1.02,shadowTint:[.02,.004,.035],highlightTint:[1.05,1,.9],saturation:1.1,contrast:1.05,vignette:.32,vignetteColor:[.12,.03,.14]}):!e&&jt&&(jt.dispose(),jt=null),T.setPixelRatio(ae())}Mt();let Nt=typeof ResizeObserver<`u`?new ResizeObserver(G):null;Nt?.observe(p),window.addEventListener(`resize`,G),G();let K=new Map,q={x:0,y:0,t:0},Ft=0,It=0,J=0,Rt=new v,zt=new b;function Y(e,t){let n=p.getBoundingClientRect();zt.set((e-n.left)/n.width*2-1,-((t-n.top)/n.height)*2+1),Rt.setFromCamera(zt,k);let r=[];for(let e of F)e.cur&&r.push(e.cur.mesh);let i=Rt.intersectObjects(r,!1)[0];if(i)return rt.get(i.object)??-1;let a=new S,o=new u(new S(0,1,0),-.3);if(!Rt.ray.intersectPlane(o,a))return-1;let s=-1,c=.7*.7;return F.forEach((e,t)=>{if(!e.cur)return;let n=(e.agent.x-a.x)**2+(e.agent.z-a.z)**2;n<c&&(c=n,s=t)}),s}let Bt=T.domElement,Vt=new AbortController;Bt.addEventListener(`pointerdown`,e=>{try{Bt.setPointerCapture?.(e.pointerId)}catch{}if(K.set(e.pointerId,{x:e.clientX,y:e.clientY}),K.size===1)q={x:e.clientX,y:e.clientY,t:performance.now()},Ft=0,R.set(0,0);else if(K.size===2){let[e,t]=[...K.values()];It=Math.hypot(e.x-t.x,e.y-t.y),Ft=99}p.classList.add(`chy-drag`)},{signal:Vt.signal}),Bt.addEventListener(`pointermove`,e=>{let t=K.get(e.pointerId);if(!t){let t=performance.now();e.pointerType===`mouse`&&t-J>90&&(J=t,p.classList.toggle(`chy-hover`,Y(e.clientX,e.clientY)>=0));return}let n=e.clientX-t.x,r=e.clientY-t.y;if(t.x=e.clientX,t.y=e.clientY,K.size===1){if(Ft+=Math.abs(n)+Math.abs(r),Ft>6){Dt(n,r);let e=performance.now(),t=Math.max(1,e-J);J=e,R.set(n/t*16,r/t*16)}}else if(K.size===2){let[e,t]=[...K.values()],i=Math.hypot(e.x-t.x,e.y-t.y);It>0&&Ot(i/It*B,!0),It=i,Dt(n/2,r/2)}},{signal:Vt.signal});let Ht=e=>{if(K.has(e.pointerId)){if(K.delete(e.pointerId),K.size===0){p.classList.remove(`chy-drag`);let t=performance.now()-q.t<450;if(Ft<=6&&t&&e.type===`pointerup`){let t=Y(e.clientX,e.clientY);Fn(t>=0?F[t].entry.id:null),R.set(0,0)}else(c||performance.now()-J>80)&&R.set(0,0)}else K.size===1&&(It=0,R.set(0,0))}};Bt.addEventListener(`pointerup`,Ht,{signal:Vt.signal}),Bt.addEventListener(`pointercancel`,Ht,{signal:Vt.signal}),Bt.addEventListener(`wheel`,e=>{e.preventDefault(),Ot(B*Math.exp(-e.deltaY*(e.deltaMode===1?.05:.0016)))},{passive:!1,signal:Vt.signal}),Bt.addEventListener(`keydown`,e=>{if(e.key===`ArrowLeft`)Dt(40,0);else if(e.key===`ArrowRight`)Dt(-40,0);else if(e.key===`ArrowUp`)Dt(0,40);else if(e.key===`ArrowDown`)Dt(0,-40);else if(e.key===`+`||e.key===`=`)Ot(B*1.25);else if(e.key===`-`)Ot(B/1.25);else return;e.preventDefault()},{signal:Vt.signal});let Wt=e=>{e.key===`Escape`&&tn&&(Fn(null),e.preventDefault())};window.addEventListener(`keydown`,Wt,!0);let Gt=(e,t,n)=>{let r=W(`button.ch-btn.ch-icon.ch-ghost`,{type:`button`,"aria-label":n},e);return r.addEventListener(`click`,()=>Ot(B*t)),r},X=W(`div`),Jt=W(`h3`),Yt=W(`p.chy-act`),Xt=W(`p`),Zt=W(`button.ch-btn.ch-ghost`,{type:`button`},`Follow`),Qt=r.onChoose?W(`button.ch-btn.ch-primary`,{type:`button`},r.chooseLabel??`Take on heist`):null,$t=W(`button.ch-btn.ch-icon.ch-ghost.chy-close`,{type:`button`,"aria-label":`Close`},`✕`),en=W(`div.ch-panel.chy-card`,{role:`dialog`,"aria-label":`Cat card`},X,W(`div.chy-info`,null,Jt,Yt,Xt,W(`div.chy-btns`,null,Zt,Qt)),$t);oe.append(en,W(`div.chy-zoom`,null,Gt(`+`,1.3,`Zoom in`),Gt(`−`,1/1.3,`Zoom out`))),$t.addEventListener(`click`,()=>Fn(null)),Zt.addEventListener(`click`,()=>{let e=F.findIndex(e=>e.entry.id===tn);U=U===e?-1:e,Zt.textContent=U>=0?`Following`:`Follow`,U>=0&&B<1.8&&Ot(2)}),Qt?.addEventListener(`click`,()=>{tn&&!Qt.disabled&&r.onChoose?.(tn)});let tn=null,Z=-1,rn=!1,an=NaN,Q=NaN;function on(e){e!==rn&&(rn=e,se.style.display=e?`block`:`none`)}function sn(e){let t=r.describe?.(e.entry.id),n=e.agent.sleepy*1e3;Xt.textContent=t?.fact??`Loves ${kn[Math.floor(n)%kn.length]} and ${An[Math.floor(e.agent.playful*1e3)%An.length]}.`,Qt&&(Qt.textContent=t?.chooseLabel??r.chooseLabel??`Take on heist`,Qt.disabled=!!t?.chooseDisabled)}let ln=r.highlight?Pe.findIndex(e=>e.id===r.highlight):-1,fn=r.highlightLabel??(ln>=0?Pe[ln].name:``);D.textContent=fn;let pn=!1,mn=NaN,hn=NaN;function _n(e){e!==pn&&(pn=e,D.style.display=e?`block`:`none`)}let vn=[],Pn=0;function Fn(e){let t=Z>=0?F[Z]:void 0;t&&dn(t.agent),Z=e?F.findIndex(t=>t.entry.id===e):-1,tn=Z>=0?e:null;let n=Z>=0?F[Z]:void 0;U=-1,Zt.textContent=`Follow`,n?(un(n.agent),X.replaceChildren(kt(n.entry,{size:80,base:a})),Jt.textContent=n.entry.name,sn(n),en.classList.add(`chy-on`),se.textContent=n.entry.name,on(!0)):(en.classList.remove(`chy-on`),on(!1)),r.onSelect?.(tn)}let In=new ie,$=new S,Ln=new h,Rn=new ie,zn=new le(new S,.8),Bn=0,Vn=0,Hn=!1,Un=!1,Wn=0,Gn=0,Kn=0,qn=0,Jn=0,Yn=new ie().makeScale(0,0,0),Xn=new pe,Zn=new S(0,1,0),Qn=new S(1.8,1.8,1.8);function $n(e){if(!Hn)return;Bn=requestAnimationFrame($n);let t=Vn?Math.min(.1,(e-Vn)/1e3):1/60;if(Vn=e,qn+=t,Wn+=t,Gn++,Wn>=.5&&(Kn=Math.round(Gn/Wn),Wn=0,Gn=0),w&&!w.done&&w.sample(t)===`low`&&C!==`low`&&(C=`low`,console.info(`[quality] yard: ${w.fps.toFixed(1)} fps -> low tier`),Mt(),G()),T.info.reset(),er(t),jt?jt.render(t):T.render(O,k),ot<at.length){let e=performance.now();for(;ot<at.length&&performance.now()-e<On;)at[ot++]();ot>=at.length&&(at.length=0,ot=0)}}function er(e){if(Math.abs(z-B)>.001&&(z+=(B-z)*Math.min(1,e*10)),K.size===0&&R.lengthSq()>.01&&!c&&(Dt(R.x,R.y),R.multiplyScalar(.02**e)),U>=0){let t=F[U].agent,n=c?1:Math.min(1,e*4);L.x+=(t.x-L.x)*n,L.z+=(t.z-L.z)*n}St()&&wt(),gn(et,P,e);let t=f===`high`||f===`auto`&&z>=Tn;(t||Z>=0)&&(Rn.multiplyMatrices(k.projectionMatrix,k.matrixWorldInverse),Ln.setFromProjectionMatrix(Rn)),Jn=0;let n=0;for(let r=0;r<F.length;r++){let i=F[r],a=i.agent;if(!i.lo||!i.sheet){N.setMatrixAt(r,Yn);continue}let o=f===`high`;if(f===`auto`&&(r===Z||t&&Jn<En)&&(zn.center.set(a.x,.5,a.z),o=Ln.intersectsSphere(zn)),f===`auto`){o&&!i.hi&&(i.hi=lt(i,r,!0));let e=o?i.hi:i.lo;e!==i.cur&&(i.cur&&(i.cur.object3d.visible=!1),e.object3d.visible=!0,e.setFacing(i.faceX),i.row&&e.setAnim(i.row,{restart:!0}),i.cur=e)}i.cur===i.hi&&Jn++;let s=i.cur;s.mesh.castShadow=C===`high`&&s===i.hi&&(r===Z||n++<8);let l=a.vx*mt.x+a.vz*mt.z;l>.05?i.faceX=1:l<-.05&&(i.faceX=-1),s.setFacing(i.faceX);let u=Kt[a.behaviour];u!==i.row&&(i.row=u,s.setAnim(u,{restart:!0}));let d=a.behaviour===`HOP`&&!c?Math.max(0,Math.sin((.75-a.timer)*Math.PI*2.6))*.3:0;s.object3d.position.set(a.x,d,a.z),s.update(e);let p=a.behaviour===`SLEEP`||a.behaviour===`LOAF`?1.15:1;In.makeScale(p,1,p*.8).setPosition(a.x,.015,a.z),N.setMatrixAt(r,In)}N.instanceMatrix.needsUpdate=!0;for(let e=0;e<28;e++){let t=Re[e],n=(qn*.7*t.v+t.t)%1,r=n*1.35,i=j.spout.y+1.2*n-2.6*n*n;$.set(Math.cos(t.a)*r,Math.max(.36,i),Math.sin(t.a)*r),In.makeTranslation($.x,$.y,$.z),Le.setMatrixAt(e,In)}Le.instanceMatrix.needsUpdate=!0,j.water.position.y=.38+Math.sin(qn*2)*.012,j.update(c?0:qn),Te.value=c?.3:qn;for(let e=0;e<9;e++){let t=ke[e],n=(c?0:qn)*t.a+t.p,r=t.hx+Math.sin(n)*t.r,i=t.hz+Math.sin(n*2*t.b+.7)*t.r*.7,a=.75+Math.sin(n*3.1)*.22+Math.sin(n*7.3)*.05,o=Math.cos(n)*t.r,s=Math.cos(n*2*t.b+.7)*t.r*.7*2*t.b;Xn.setFromAxisAngle(Zn,Math.atan2(o,s)),In.compose($.set(r,a,i),Xn,Qn),De.setMatrixAt(e,In)}if(De.instanceMatrix.needsUpdate=!0,tt.length){let e=c?1:1+Math.sin(qn*2.2)*.08;tt.forEach((t,n)=>{let r=F[t.i];r.cur?I.setMatrixAt(n,In.makeScale(e,1,e).setPosition(r.agent.x,.02,r.agent.z)):I.setMatrixAt(n,Yn)}),I.instanceMatrix.needsUpdate=!0}if(vn.length){let t=!1;for(let e=vn.length-1;e>=0;e--){let n=vn[e],i=F[n.idx].agent;i.meals>n.meals?(vn.splice(e,1),U===n.idx&&Z!==n.idx&&(U=-1),n.resolve()):i.behaviour===`EAT`&&(t=!0,n.eating||(n.eating=!0,r.onEat?.(F[n.idx].entry.id)))}t&&(Pn=Math.max(.12,Pn-e*.4)),vn.length||(Pn=0),We(Pn)}let i=ln>=0?F[ln]:void 0;if(i&&i.cur&&ln!==Z){Qe.visible=!0,Qe.position.set(i.agent.x,.025,i.agent.z),$.set(i.agent.x,1.35,i.agent.z).project(k);let e=!!fn&&$.x>-1.1&&$.x<1.1&&$.y>-1.1&&$.y<1.1;_n(e);let t=Math.round(($.x+1)/2*V),n=Math.round((1-$.y)/2*H);e&&(t!==mn||n!==hn)&&(mn=t,hn=n,D.style.transform=`translate(${t}px, ${n}px) translate(-50%, -100%)`)}else Qe.visible=!1,_n(!1);let a=Z>=0?F[Z]:void 0;if(a&&a.cur){qe.visible=!0;let e=c?1:1+Math.sin(qn*5)*.06;qe.position.set(a.agent.x,.03,a.agent.z),qe.scale.set(e,1,e),$.set(a.agent.x,1.35,a.agent.z).project(k);let t=$.x>-1.1&&$.x<1.1&&$.y>-1.1&&$.y<1.1;on(t);let n=Math.round(($.x+1)/2*V),r=Math.round((1-$.y)/2*H);t&&(n!==an||r!==Q)&&(an=n,Q=r,se.style.transform=`translate(${n}px, ${r}px) translate(-50%, -100%)`),tr(Yt,qt[a.agent.behaviour])}else qe.visible=!1}function tr(e,t){e.textContent!==t&&(e.textContent=t)}function nr(){Hn||Un||(Hn=!0,Vn=0,Bn=requestAnimationFrame($n))}function rr(){Hn=!1,cancelAnimationFrame(Bn)}return r.autoStart!==!1&&nr(),{el:p,ready:ut,get selected(){return tn},start:nr,stop:rr,select:Fn,focus(e){let t=F.findIndex(t=>t.entry.id===e);t<0||(Fn(e),U=t,Zt.textContent=`Following`,B<1.8&&Ot(2))},setZoom(e){Ot(e,!0),wt()},lookAt(e,t){At(e,t),wt()},setHighlight(e,t){ln=e?F.findIndex(t=>t.entry.id===e):-1,fn=t??(ln>=0?F[ln].entry.name:``),D.textContent=fn},refreshCard(){Z>=0&&sn(F[Z])},feed(e){let t=F.findIndex(t=>t.entry.id===e);if(t<0||Un)return Promise.resolve();let n=F[t].agent;return new Promise(e=>{vn.push({idx:t,meals:n.meals,eating:!1,resolve:e}),U=t,Pn=1,We(1);let r=j.feedSpot;cn(n,P,r.x,r.z,`EAT`,2.2)})},stats(){return{calls:T.info.render.calls,triangles:T.info.render.triangles,cats:F.length,loaded:ct,hiDetail:Jn,fps:Kn,zoom:z,pendingFrames:at.length-ot}},screenPositions(){return F.map(e=>{$.set(e.agent.x,.45,e.agent.z).project(k);let t=p.getBoundingClientRect();return{id:e.entry.id,x:t.left+($.x+1)/2*V,y:t.top+(1-$.y)/2*H,visible:!!e.cur&&Math.abs($.x)<=1&&Math.abs($.y)<=1}})},dispose(){if(!Un){Un=!0,rr();for(let e of vn.splice(0))e.resolve();Nt?.disconnect(),window.removeEventListener(`resize`,G),window.removeEventListener(`keydown`,Wt,!0);for(let e of F)e.lo?.dispose(),e.hi?.dispose();jt?.dispose(),jt=null,j.dispose(!0),M.geometry.dispose(),be.dispose(),xe.dispose(),Ce.dispose(),we.dispose(),De.dispose(),Ae.dispose(),Fe.dispose(),Ke.dispose(),Ze.dispose(),ze.dispose(),Ve.dispose(),nt.dispose(),I.dispose(),N.dispose(),Le.dispose(),Vt.abort(),T.renderLists.dispose(),T.info.reset(),T.domElement.remove(),p.remove()}}}}export{$e as A,Qe as C,Be as D,Le as E,ge as F,he as I,ye as L,me as M,be as N,Ze as O,M as P,je as S,Me as T,ft as _,At as a,it as b,Et as c,Dt as d,Ot as f,L as g,xt as h,kt as i,ve as j,Ue as k,wt as l,bt as m,Pt as n,Tt as o,St as p,G as r,W as s,Pn as t,Ct as u,dt as v,nt as w,Oe as x,at as y};