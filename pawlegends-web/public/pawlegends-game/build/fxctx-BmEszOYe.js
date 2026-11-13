import{n as e}from"./heroes-DmDidokZ.js";import{C as t,c as n,s as r}from"./coords-CBCGys0y.js";import{S as i,_ as a,c as o}from"./charMaterial-DsO6iBdV.js";import{rt as s,vt as c,yt as l}from"./three-DRa3Sk-w.js";import{Bt as u,E as d,I as f,K as p,Mt as m,St as h,Xt as g,an as _,ft as v,g as y,jt as ee,nt as te,o as ne,un as b}from"./domino-x0f0c80P.js";import{a as x,r as S}from"./palette-DLfQiEGN.js";import{n as C}from"./api-RCWwCQSx.js";import{c as re,n as ie}from"./talents-G6FzqPtR.js";import{K as ae,M as oe,P as w,R as T,U as se,z as E}from"./world-CV0Kk1Gs.js";import{c as ce}from"./index-CowvXU-l.js";import{G as D,H as O,I as k,O as le,U as A,V as j,h as M,m as ue,t as N}from"./rig-BaeBj4Z2.js";var P=2759202,de=16777215,F=16748465,I=Math.PI/2,fe=Object.freeze({clem:(M.clem+.15)/1.62,sage:(M.sage+.15)/1.62,brutus:(M.brutus+.15)/1.62,cacklejaw:(M.cacklejaw+.15)/1.62,lambo:(M.lambo+.15)/1.62,aviete:(M.aviete+.15)/1.62,bengas:(M.bengas+.15)/1.62,gabe:(M.gabe+.15)/1.62,meatball:(M.meatball+.15)/1.62,pixel:(M.pixel+.15)/1.62,duchess:(M.duchess+.15)/1.62,stilts:(M.stilts+ee)/1.62,nugget:(M.nugget+.15)/1.62,marshmallow:(M.marshmallow+.15)/1.62,bravo:(M.bravo+.15)/1.62,chili:(M.chili+.15)/1.62,howler:(M.howler+.15)/1.62,rocket:(M.rocket+.15)/1.62,frankie:(M.frankie+.15)/1.62,domino:(M.domino+.15)/1.62}),L=Object.freeze({clem:b.clem.ring,sage:b.sage.ring,brutus:b.brutus.ring,cacklejaw:b.cacklejaw.ring,lambo:b.lambo.ring,aviete:b.aviete.ring,bengas:b.bengas.ring,gabe:b.gabe.ring,meatball:_,pixel:g,duchess:u,stilts:m,nugget:h,marshmallow:v,bravo:te,chili:p,howler:f,rocket:d,frankie:y,domino:ne});function pe(e,t){let n=x[t],r=10119738;e.box(1.1,.25,.7,r,{at:[0,.35,0]}),e.box(1,.08,.76,n.main,{at:[0,.5,0]});for(let t of[-.38,.38])for(let n of[-.4,.4])e.cyl(.18,.18,.08,5913122,{at:[t,.18,n],rot:[I,0,0]},10);if(t===0)e.box(.08,.7,.08,r,{at:[-.1,.85,0],rot:[0,0,.6]}),e.sphere(.32,16740241,{at:[-.35,1.18,0]},12),e.torus(.3,.025,13191794,{at:[-.35,1.18,0],rot:[.5,.3,0]}),e.torus(.3,.025,13191794,{at:[-.35,1.18,0],rot:[1.4,.9,0]});else{e.box(.9,.12,.12,16774108,{at:[0,.78,0]});for(let t of[-.46,.46])for(let n of[-.07,.07])e.sphere(.1,16774108,{at:[t,.78,n]},8);e.box(.3,.35,.5,n.second,{at:[.45,.65,0]})}}function me(e,t){if(e!==`siege`)return ue(t,e===`ranged`);let n=new N;return pe(n,t),n.build()}function he(){let e=new N;e.sphere(1,9210516,{at:[0,.32,0],scale:[.42,.28,.28]},12),e.sphere(.2,9210516,{at:[.38,.42,0],scale:[1.3,.9,.9]},10),e.sphere(.04,F,{at:[.64,.42,0]},6);for(let t of[-1,1])e.sphere(.11,16757704,{at:[.3,.6,t*.14],scale:[.4,1,1]},8),e.sphere(.035,P,{at:[.55,.48,t*.08]},6);for(let t=0;t<6;t++)e.sphere(.035,16757704,{at:[-.4-t*.1,.3+Math.sin(t*.8)*.05,Math.sin(t)*.06]},5);return e.build()}function ge(){let e=new N;e.cyl(1.7,2.1,2.2,16769696,{at:[0,1.1,0]},24),e.cyl(1.72,1.72,.35,11887901,{at:[0,2.3,0]},24);for(let t=0;t<10;t++){let n=t/10*Math.PI*2;e.sphere(.32,11887901,{at:[Math.cos(n)*1.62,2,Math.sin(n)*1.62],scale:[.7,1.4,.7]},8)}e.sphere(.35,16775404,{at:[0,2.6,0]},12),e.sphere(.22,15026253,{at:[0,2.95,0]},10),e.cyl(.02,.02,.3,5216842,{at:[.05,3.2,0],rot:[0,0,-.3]},4);for(let t of[-1,1])e.sphere(.2,P,{at:[1.72,1.3,t*.45],scale:[.4,1.3,1]},10),e.sphere(.07,de,{at:[1.82,1.42,t*.42]},6),e.sphere(.2,16752311,{at:[1.68,.95,t*.85],scale:[.3,.6,1]},8);return e.torus(.18,.04,P,{at:[1.78,.98,0],rot:[0,I,Math.PI]},Math.PI),e.build()}function _e(e,t){if(t===`hearth`)return ve(e);let n=new N,r=x[e],i=t===`inner`?.9:t===`gate`?1.6:0;if(t===`gate`){let t=e===0?15128248:8021064;n.cyl(2,2.2,.5,t,{at:[0,.25,0]},12);for(let e=0;e<4;e++){let r=e/4*Math.PI*2+Math.PI/4;n.box(.5,1.5,.7,t,{at:[Math.cos(r)*1.35,.75,Math.sin(r)*1.35],rot:[0,-r,0]})}n.cyl(1.25,1.25,.12,16765773,{at:[0,1.9,0]},12)}let a=e===0?15985368:10126182,o=e===0?15128248:8021064;n.cyl(1.6,1.8,.6,o,{at:[0,.3,0]},12),n.cyl(1.05,1.3,3+i,a,{at:[0,2.1+i/2,0]},12);for(let e of[1.2,2.6+i])n.cyl(1.18,1.18,.18,r.main,{at:[0,e,0]},12);for(let e=0;e<4;e++){let t=e/4*Math.PI*2+.4;n.box(.08,.5,.3,2759202,{at:[Math.cos(t)*1.08,2+i,Math.sin(t)*1.08],rot:[0,-t,0]})}if(e===0){n.cone(1.45,1.6,r.main,{at:[0,4.4+i,0]},12),n.sphere(.45,16765562,{at:[0,5.45+i,0]},12),n.torus(.43,.04,16752506,{at:[0,5.45+i,0],rot:[.7,0,.3]}),n.torus(.43,.04,16752506,{at:[0,5.45+i,0],rot:[1.6,.6,0]});for(let e of[-1,1])n.cone(.28,.5,r.main,{at:[0,4+i,e*1.1],rot:[e*.4,0,0]},6)}else{n.sphere(1.25,r.second,{at:[0,3.65+i,0],scale:[1,.75,1]},14),n.cyl(.08,.08,.9,r.second,{at:[0,4.9+i,0]},6),n.box(.7,.14,.14,16774108,{at:[0,5.4+i,0]});for(let e of[-.35,.35])for(let t of[-.08,.08])n.sphere(.11,16774108,{at:[e,5.4+i,t]},8)}return(t===`inner`||t===`gate`)&&n.cyl(1.22,1.22,.12,16765773,{at:[0,3.45+i,0]},12),n.build()}function ve(e){let t=new N,n=x[e],r=e===0?15985368:10126182,i=e===0?15128248:8021064;t.cyl(1.9,2.1,.6,i,{at:[0,.3,0]},14),t.cyl(1.45,1.65,2.4,r,{at:[0,1.8,0]},14),t.cyl(1.55,1.55,.2,n.main,{at:[0,1.4,0]},14);for(let e=0;e<8;e++){let n=e/8*Math.PI*2;t.box(.4,.45,.4,r,{at:[Math.cos(n)*1.4,3.2,Math.sin(n)*1.4],rot:[0,-n,0]})}if(t.cyl(1.5,1.5,.14,16765773,{at:[0,3,0]},14),e===0){t.cyl(.42,.5,.9,7227950,{at:[0,3.5,0]},8),t.sphere(.55,16762731,{at:[0,4.25,0]},12),t.cone(.6,.6,n.main,{at:[0,4.95,0]},8);for(let e of[-1,1])t.cone(.16,.32,n.main,{at:[0,5.15,e*.32],rot:[e*.4,0,0]},6)}else{t.cyl(.7,.45,.6,5125412,{at:[0,3.4,0]},10),t.sphere(.5,16751165,{at:[0,3.9,0],scale:[1,1.3,1]},10),t.box(1.5,.16,.16,16774108,{at:[0,4.65,0]});for(let e of[-.75,.75])for(let n of[-.09,.09])t.sphere(.13,16774108,{at:[e,4.65,n]},8)}return t.build()}function ye(){let e=new N;e.sphere(1,13214330,{at:[0,.42,0],scale:[.55,.42,.45]},14);for(let t=0;t<22;t++){let n=t/22*Math.PI*2*2.618,r=.25+t*7%11/11,i=-.12+Math.cos(r)*Math.cos(n)*.42,a=Math.cos(r)*Math.sin(n)*.38,o=.42+Math.sin(r)*.36;e.cone(.07,.42,t%3?7227950:13132842,{at:[i,o,a],rot:[Math.sin(n)*.9,0,-Math.cos(n)*.9-.4]},5)}e.sphere(.22,15190436,{at:[.5,.4,0],scale:[1.4,.9,.9]},10),e.sphere(.06,P,{at:[.8,.42,0]},6);for(let t of[-1,1])e.sphere(.05,P,{at:[.6,.52,t*.12]},6);return e.build()}function be(){let e=new N;e.sphere(1,3091258,{at:[0,.7,0],scale:[.5,.45,.38]},14),e.sphere(.27,3814728,{at:[.36,1.15,0]},12),e.cone(.1,.38,14921803,{at:[.66,1.12,0],rot:[0,0,-I]},6),e.torus(.08,.02,14263361,{at:[.56,1.22,.12],rot:[0,I,0]}),e.sphere(.04,16771496,{at:[.6,1.22,.12]},6),e.sphere(.04,P,{at:[.56,1.22,-.12]},6);for(let t of[-1,1])e.box(.6,.08,.34,2367534,{at:[-.06,.8,t*.38],rot:[t*.35,0,-.2]});return e.box(.4,.06,.26,2367534,{at:[-.5,.75,0],rot:[0,0,.25]}),e.cyl(.03,.03,.4,14921803,{at:[.05,.2,.12]},4),e.cyl(.03,.03,.4,14921803,{at:[.05,.2,-.12]},4),e.torus(.24,.05,9054778,{at:[.25,.95,0],rot:[0,I,.4]}),e.build()}function xe(){let e=new N;e.sphere(1,8037978,{at:[0,.3,0],scale:[.5,.3,.45]},12),e.sphere(1,15261864,{at:[.12,.22,0],scale:[.38,.18,.34]},10);for(let t of[-1,1])e.sphere(.12,8037978,{at:[.28,.55,t*.18]},8),e.sphere(.06,P,{at:[.36,.58,t*.2]},6),e.sphere(.13,6986314,{at:[-.2,.15,t*.42],scale:[1.4,.6,.8]},8);return e.cyl(.3,.3,.03,5216842,{at:[0,.62,0]},12),e.build()}function Se(){let e=new N,t=8221824;e.sphere(1,11022906,{at:[0,.75,0],scale:[.62,.62,.55]},16),e.sphere(1,14263361,{at:[.02,.6,0],scale:[.64,.08,.57]},14),e.sphere(1,t,{at:[.5,1.25,0],scale:[.4,.34,.34]},14),e.sphere(.2,t,{at:[.88,1.18,0],scale:[1.4,.8,.8]},10),e.sphere(.07,F,{at:[1.13,1.2,0]},6);for(let t of[-1,1])e.sphere(.18,16757704,{at:[.36,1.58,t*.26],scale:[.4,1,1]},8);e.sphere(.06,P,{at:[.84,1.36,.14]},6),e.box(.04,.16,.18,1709080,{at:[.84,1.36,-.14]}),e.box(.02,.03,.5,1709080,{at:[.72,1.42,-.05],rot:[.5,0,0]}),e.cyl(.5,.55,.1,2038306,{at:[.45,1.62,0]},3),e.cyl(.26,.32,.32,2038306,{at:[.45,1.8,0]},10),e.cyl(.33,.33,.05,14263361,{at:[.45,1.7,0]},10),e.sphere(.07,16774108,{at:[.75,1.82,0]},6),e.box(.08,.08,.3,5913122,{at:[.55,.85,.62],rot:[I,0,0]}),e.box(.95,.06,.18,16765773,{at:[1.05,.95,.62],rot:[0,0,.35]});for(let t=0;t<3;t++)e.sphere(.04,14725168,{at:[.85+t*.22,.92+t*.07,.72]},5);for(let t of[-1,1])e.cyl(.08,.06,.4,7227950,{at:[.05,.18,t*.25]},6);for(let t=0;t<8;t++)e.sphere(.06,16757704,{at:[-.62-t*.12,.45+Math.sin(t*.8)*.08,Math.sin(t)*.08]},5);return e.build()}function Ce(e){let t=new N,n=x[e];if(t.cyl(3.2,3.6,.8,e===0?15985368:5125412,{at:[0,.4,0]},20),t.cyl(3.25,3.25,.16,e===0?n.main:14263361,{at:[0,.85,0]},20),e===0){t.sphere(2.2,16740241,{at:[0,3.1,0]},20);for(let e=0;e<5;e++)t.torus(2.18,.07,13191794,{at:[0,3.1,0],rot:[e*.7,e*1.1,e*.3]});t.cyl(.12,.12,2.2,13191794,{at:[1.8,1.6,1.2],rot:[.6,0,1.1]},6)}else{t.box(3.6,2.6,3.2,n.main,{at:[0,2.15,0]}),t.cone(2.9,1.9,n.deep,{at:[0,4.4,0],rot:[0,Math.PI/4,0],scale:[1.05,1,.95]},4),t.box(1.2,1.6,.1,3810324,{at:[1.81,1.65,0],rot:[0,I,0]}),t.box(2.4,.4,.4,14263361,{at:[0,5.7,0]});for(let e of[-1.25,1.25])for(let n of[-.25,.25])t.sphere(.36,14263361,{at:[e,5.7,n]},10)}let r=t.build();return r.scale(.72,.72,.72),r}function we(e){let t=new N,n=x[e];return t.torus(4,.28,e===0?15985368:12889738,{at:[0,.12,0],rot:[Math.PI/2,0,0]}),t.cyl(3.85,3.85,.04,9426687,{at:[0,.03,0]},28),t.cyl(.22,.32,.9,n.second,{at:[-1.2,.45,0]},8),t.sphere(.34,n.main,{at:[-1.2,1.05,0]},10),t.cyl(.6,.6,.06,9426687,{at:[-1.2,.8,0]},12),t.build()}var R=Object.freeze({low:Object.freeze({particles:800,countScale:.6,trailHz:15,debris:.45,extras:!1,lightning:5,cracks:0}),med:Object.freeze({particles:1600,countScale:1,trailHz:30,debris:.8,extras:!0,lightning:8,cracks:2}),high:Object.freeze({particles:2e3,countScale:1,trailHz:45,debris:1,extras:!0,lightning:12,cracks:4})}),z=Object.freeze([4,7,10]);function B(e){let t=0;for(let n of z)e>=n&&t++;return t}function Te(e,t){return t<0||t>3?1:1+.18*Math.max(0,ie(e,t)-1)}var Ee=(e,t)=>t>=0&&t<=3&&ie(e,t)>=re(t);function V(e){return Math.min(2.4,Math.max(.5,Math.sqrt(Math.max(0,e)/120)))}function De(e,t,n){return n?e>=260||e>=150&&t>0&&e*100>=t*16:!1}var H=t=>i[e[t].element],Oe=t=>e[t].base.range<=2e3;function U(e,t){let n=H(e);return!t&&o(n)?a(n,16777215,.7):n}var W=[`grass`,`dirt`,`water`,`wood`,`stone`],ke=Object.freeze({grass:Object.freeze({chip:7323477,shape:D.FEATHER,dust:12904102,dustAlpha:.45}),dirt:Object.freeze({chip:12753500,shape:D.SHARD,dust:15389600,dustAlpha:.6}),water:Object.freeze({chip:10476799,shape:D.DROPLET,dust:15924223,dustAlpha:.6}),wood:Object.freeze({chip:10119742,shape:D.SHARD,dust:14268810,dustAlpha:.5}),stone:Object.freeze({chip:11775138,shape:D.SHARD,dust:15262422,dustAlpha:.55})}),G=Math.round(E.width/1e3),K=Math.round(E.height/1e3),q=null,J=null;function Ae(e,t,n,r,i,a){let o=i-n,s=a-r,c=Math.max(0,Math.min(1,((e-n)*o+(t-r)*s)/(o*o+s*s||1)));return Math.hypot(e-(n+o*c),t-(r+s*c))}function je(){if(G=Math.round(E.width/1e3),K=Math.round(E.height/1e3),E.point===1)return Me();let e=new Uint8Array(G*K),t=E.width/1e3,n=[];for(let e of[`sunny`,`puddle`]){let r=T[e].map(([e,t])=>[e/1e3,t/1e3]),i=[...r,...r.map(([e,n])=>[t-e,n]).reverse().slice(1)];n.push(i.flat())}let r=E.laneWidth/2e3,[i,a]=[E.riverX[0]/1e3,E.riverX[1]/1e3],[o,s,c,l]=se.base.map(e=>e/1e3),u=[ae.x/1e3,ae.y/1e3];for(let d=0;d<K;d++)for(let f=0;f<G;f++){let p=f+.5,m=d+.5,h=!1;for(let e of n){for(let t=0;t+3<e.length&&!h;t+=2)Ae(p,m,e[t],e[t+1],e[t+2],e[t+3])<=r&&(h=!0);if(h)break}let g=`grass`;p>=i&&p<=a?g=h?`wood`:`water`:p>=o&&p<=c&&m>=s&&m<=l||t-p>=o&&t-p<=c&&m>=s&&m<=l?g=`stone`:(h||Math.hypot(p-u[0],m-u[1])<=5.5||Math.hypot(t-p-u[0],m-u[1])<=5.5)&&(g=`dirt`),e[d*G+f]=W.indexOf(g)}return e}function Me(){let e=new Uint8Array(G*K),t=E.width/1e3,n=E.height/1e3,r=[],i=Object.keys(T);for(let e of i){let i=T[e].map(([e,t])=>[e/1e3,t/1e3]);r.push([...i,...i.map(([e,r])=>[t-e,n-r]).reverse().slice(1)].flat())}let a=E.laneWidth/2e3,o=[[w.x/1e3,w.y/1e3,w.radius/1e3+1.5],[oe.x/1e3,oe.y/1e3,6]];for(let i=0;i<K;i++)for(let s=0;s<G;s++){let c=s+.5,l=i+.5,u=!1;for(let e of r){for(let t=0;t+3<e.length&&!u;t+=2)Ae(c,l,e[t],e[t+1],e[t+2],e[t+3])<=a&&(u=!0);if(u)break}let d=`grass`;Math.abs(c+l-t)<=7.07?d=u?`wood`:`water`:o.some(([e,r,i])=>Math.hypot(c-e,l-r)<=i||Math.hypot(t-c-e,n-l-r)<=i)?d=`stone`:u&&(d=`dirt`),e[i*G+s]=W.indexOf(d)}return e}function Ne(e,t){J!==E&&(q=null,J=E),q??=je();let n=Math.floor(e),r=Math.floor(-t);return n<0||r<0||n>=G||r>=K?`grass`:W[q[r*G+n]]}var Pe=class{additive=!1;n=6;exact=!1;shape=D.SOFT;color=16777215;intensity=1;size=[.1,.2];sizeEnd=1;life=[.3,.5];speed=[1,2];dir=void 0;spread=Math.PI;gravity=0;drag=0;spin=0;stretch=1;fade=O.LINEAR;grow=A.LINEAR;jitter=0;up=0;floor=!1;alpha=1;tint=0;bounce=.3;r0=.2;y=.05;reset(){return this.additive=!1,this.n=6,this.exact=!1,this.shape=D.SOFT,this.color=16777215,this.intensity=1,this.sizes(.1,.2),this.sizeEnd=1,this.lives(.3,.5),this.speeds(1,2),this.dir=void 0,this.spread=Math.PI,this.gravity=0,this.drag=0,this.spin=0,this.stretch=1,this.fade=O.LINEAR,this.grow=A.LINEAR,this.jitter=0,this.up=0,this.floor=!1,this.alpha=1,this.tint=0,this.bounce=.3,this.r0=.2,this.y=.05,this}sizes(e,t){return this.size[0]=e,this.size[1]=t,this}lives(e,t){return this.life[0]=e,this.life[1]=t,this}speeds(e,t){return this.speed[0]=e,this.speed[1]=t,this}},Fe=class{shape=D.SOFT;color=16777215;intensity=1;size0=.5;size1=.5;life=.2;grow=A.OUT;fade=O.LINEAR;rot=0;spin=0;alpha=1;vx=0;vy=0;vz=0;additive=!0;reset(){return this.shape=D.SOFT,this.color=16777215,this.intensity=1,this.size0=this.size1=.5,this.life=.2,this.grow=A.OUT,this.fade=O.LINEAR,this.rot=this.spin=0,this.alpha=1,this.vx=this.vy=this.vz=0,this.additive=!0,this}},Y=new c,Ie=new c,X=new c,Le=new c(0,1,0),Re={},Z=e=>Re[e]??=`#`+e.toString(16).padStart(6,`0`),ze=6,Be=48,Ve=16743112,He=class{particles;shock;tier=R.med;tierName=`med`;reduced=!1;auras=new k(j(),12,{additive:!0,y:.042,renderOrder:1,name:`level-aura`});sugar=new k(j(),Be,{additive:!0,y:.043,renderOrder:1,name:`sugar-rush`});peak=0;time=0;moteT=new Float32Array(ze);o=new Pe;s=new Fe;constructor(e,t){this.particles=e,this.shock=t}setTier(e,t=this.reduced){this.tier=R[e],this.tierName=e,this.reduced=t,this.particles.setBudget(this.tier.particles),this.particles.setTier({countScale:this.tier.countScale*(t?ce:1),flat:e===`low`||t})}get scale(){return this.tier.countScale*(this.reduced?ce:1)}rnd(){return this.particles.rng()}impact(e,t,n,r,i){let a=V(t),o=this.o.reset();o.additive=!0,o.n=Math.round(4+6*a),o.shape=D.SPARK,o.color=n,o.intensity=1.8+.2*a,o.sizes(.07,.12+.04*a),o.lives(.16,.26+.05*a),o.speeds(2.5+a,5+2.5*a),o.stretch=2.6,o.drag=4,o.gravity=6,this.particles.burst(e,o);let s=this.s.reset();if(s.shape=D.STAR4,s.color=16774874,s.intensity=2,s.size0=.45+.35*a,s.size1=.1,s.life=.12+.02*a,s.rot=this.rnd()*3,this.particles.single(e,s),r||a>1.3){let t=this.s.reset();t.shape=D.RING,t.color=n,t.intensity=1.5,t.size0=.3,t.size1=1.1+.6*a,t.life=.22,t.alpha=.85,this.particles.single(e,t)}i&&this.bigHit(e,n)}bigHit(e,t){let n=this.s.reset();n.shape=D.STAR8,n.color=t,n.intensity=2.2,n.size0=2.2,n.size1=.4,n.life=.2,n.rot=this.rnd()*6,n.spin=this.reduced?0:4,this.particles.single(e,n);let r=this.s.reset();r.shape=D.STAR4,r.color=16777215,r.intensity=2.6,r.size0=1.5,r.size1=.2,r.life=.14,this.particles.single(e,r);let i=this.o.reset();i.additive=!0,i.n=10,i.shape=D.STAR4,i.color=t,i.intensity=2,i.sizes(.16,.26),i.lives(.25,.4),i.speeds(4,7),i.drag=5,i.up=.5,this.particles.burst(e,i)}slash(e,t,n,r,i,o,s,c=1,l=1.1){let u=Math.max(5,Math.round(9*c*this.scale)),d=a(o,16777215,.55),f=this.reduced?0:3*c;for(let a=0;a<u;a++){let p=a/(u-1),m=n+s*(p-.5)*i,h=Math.cos(m),g=-Math.sin(m),_=Math.sin(p*Math.PI);Y.set(e+h*r,l+p*.3,t+g*r);let v=this.s.reset();v.shape=D.SOFT,v.color=o,v.intensity=1.3,v.size0=(.6+.5*_)*c,v.size1=.1,v.life=.12+p*.12,v.alpha=.55,v.vx=-g*s*f,v.vz=h*s*f,this.particles.single(Y,v),Y.set(e+h*(r+.15*c),l+p*.3,t+g*(r+.15*c));let y=this.s.reset();y.shape=D.SOFT,y.color=d,y.intensity=2,y.size0=(.28+.22*_)*c,y.size1=.05,y.life=.1+p*.1,y.alpha=.95,y.vx=v.vx,y.vz=v.vz,this.particles.single(Y,y)}let p=n+s*.5*i;Y.set(e+Math.cos(p)*r,l+.3,t-Math.sin(p)*r);let m=this.s.reset();m.shape=D.STAR4,m.color=16777215,m.intensity=2,m.size0=.5*c,m.size1=.05,m.life=.16,m.rot=this.rnd()*3,this.particles.single(Y,m)}trail(e,t,n,r){let i=this.o.reset();i.additive=!0,i.n=1,i.exact=!0,i.shape=D.SOFT,i.color=t,i.intensity=1.5,i.sizes(n,n*1.4),i.sizeEnd=.2,i.lives(.18,.3),i.speeds(.1,.4),this.particles.burst(e,i),r&&this.tier.extras&&!this.reduced&&(i.shape=D.SPARK,i.color=a(t,16777215,.4),i.intensity=2,i.sizes(.05,.09),i.sizeEnd=1,i.lives(.25,.4),i.speeds(.6,1.4),i.gravity=4,i.stretch=2,this.particles.burst(e,i))}dash(e,t,n,r,i,a=1){let o=Math.hypot(n-e,r-t);if(!(o>.05))return;X.set((n-e)/o,0,(r-t)/o);let s=Math.max(4,Math.round(10*this.scale)),c=this.o.reset();c.additive=!0,c.n=1,c.exact=!0,c.shape=D.SPARK,c.color=i,c.intensity=2,c.sizes(.1*a,.16*a),c.lives(.2,.3),c.speeds(this.reduced?1:7,this.reduced?2:10),c.dir=X,c.spread=.06,c.stretch=3.5,c.drag=7;for(let o=0;o<s;o++){let l=o/(s-1);Y.set(e+(n-e)*l,.6+this.rnd()*.6,t+(r-t)*l),this.particles.burst(Y,c);let u=this.s.reset();u.shape=D.SOFT,u.color=i,u.intensity=1.2,u.size0=1.1*a,u.size1=.2,u.life=.2+l*.15,u.alpha=.5,Y.y=.9,this.particles.single(Y,u)}this.debris(e,t,.7*a)}debris(e,t,n=1){if(this.tier.debris<=0)return;let r=Ne(e,t),i=ke[r];Y.set(e,.15,t);let a=this.o.reset();a.n=Math.max(1,Math.round((3+5*n)*this.tier.debris)),a.shape=i.shape,a.color=i.chip,a.tint=.2,a.sizes(.07+.02*n,.13+.04*n),a.lives(.5,.85),a.speeds(1.4,2.6+1.4*n),a.dir=Le,a.spread=1.2,a.up=1.5+n,a.gravity=r===`water`?10:13,a.drag=.4,a.spin=r===`grass`?6:10,a.fade=O.HOLD,a.floor=!0,a.bounce=r===`water`?0:.35,a.jitter=.25,this.particles.burst(Y,a);let o=this.o.reset();if(o.n=Math.max(1,Math.round((2+3*n)*this.tier.debris)),o.shape=D.PUFF,o.color=i.dust,o.alpha=i.dustAlpha,o.sizes(.3,.5),o.sizeEnd=2,o.lives(.35,.6),o.speeds(.6,1.6),o.up=.4,o.drag=3,o.jitter=.3,Y.y=.2,this.particles.burst(Y,o),r===`water`){let e=this.s.reset();e.shape=D.RING,e.color=15399167,e.intensity=1.2,e.size0=.4,e.size1=1.8+n,e.life=.35,e.alpha=.7,Y.y=.08,this.particles.single(Y,e)}}pillar(e,t,n,r=1){Y.set(e,.2,t);let i=this.o.reset();i.additive=!0,i.n=Math.round(14*r),i.shape=D.SOFT,i.color=n,i.intensity=1.8,i.sizes(.5*r,.9*r),i.sizeEnd=.3,i.lives(.45,.75),i.speeds(this.reduced?2:5,this.reduced?3:9),i.dir=Le,i.spread=.12,i.drag=2.2,i.jitter=.35,this.particles.burst(Y,i),Y.y=3.6*r;let o=this.s.reset();o.shape=D.STAR8,o.color=a(n,16777215,.4),o.intensity=2.2,o.size0=.4,o.size1=2.2*r,o.life=.4,o.fade=O.POP,o.spin=this.reduced?0:2,this.particles.single(Y,o)}ultimateMark(e,t,n,r){Y.set(e,0,t),this.shock.start(Y,{r1:3.2,dur:.38,color:Z(r),height:.8,intensity:1.4}),Y.set(e,.15,t);let i=this.o.reset();i.additive=!0,i.n=14,i.shape=D.STAR4,i.color=n,i.intensity=1.6,i.sizes(.25,.4),i.sizeEnd=1,i.lives(.35,.55),i.speeds(3,5),i.up=1.2,i.drag=3,i.r0=.5,i.alpha=.9,this.particles.ring(Y,i)}ultimate(e,t,n,r,i,a=1){Y.set(e,0,t);let o=Math.min(9,Math.max(3.5,i))*(.85+.15*a);this.shock.start(Y,{r1:o,dur:.45,color:Z(r),height:1.1,intensity:1.6}),this.shock.start(Y,{r1:o*.6,dur:.3,color:Z(n),height:.6}),this.pillar(e,t,n,1+.25*(a-1)),Y.set(e,.15,t);let s=this.o.reset();s.additive=!0,s.n=Math.round(24*a),s.shape=D.STAR4,s.color=n,s.intensity=1.8,s.sizes(.3,.5),s.sizeEnd=1,s.lives(.45,.7),s.speeds(4,7),s.up=1.4,s.drag=3,s.r0=.6,s.alpha=.95,this.particles.ring(Y,s);let c=this.reduced?0:this.tier.cracks;for(let e=0;e<c;e++){let t=e/c*Math.PI*2+this.rnd()*.6;X.set(Math.cos(t),0,Math.sin(t)),this.shock.crack(Y,X,{length:o*.55,width:.7,color:Z(n),travel:.14,life:.5})}this.debris(e,t,1.6)}lightning(e,t,n,r,i,a,o){let s=this.tier.lightning,c=r-e,l=i-t,u=a-n,d=Math.sqrt(c*c+l*l+u*u);if(!(d>.1))return;X.set(a-n,0,-(r-e)),X.lengthSq()<1e-6&&X.set(1,0,0),X.normalize();let f=Math.min(.9,d*.12),p=e,m=t,h=n,g=this.reduced?.22:.14;for(let c=1;c<=s;c++){let l=c/s,u=c===s?0:(this.rnd()*2-1)*f,d=e+(r-e)*l+X.x*u,_=t+(i-t)*l+(this.rnd()-.5)*f*.5,v=n+(a-n)*l+X.z*u;for(let e=0;e<3;e++){let t=(e+.5)/3;Y.set(p+(d-p)*t,m+(_-m)*t,h+(v-h)*t);let n=this.s.reset();n.shape=D.SOFT,n.color=o,n.intensity=2.2,n.size0=.42,n.size1=.12,n.life=g+this.rnd()*.05,n.fade=this.reduced?O.LINEAR:O.TWINKLE,this.particles.single(Y,n);let r=this.s.reset();r.shape=D.SOFT,r.color=16777215,r.intensity=2.6,r.size0=.16,r.size1=.05,r.life=g,this.particles.single(Y,r)}p=d,m=_,h=v}Ie.set(r,i,a);let _=this.s.reset();_.shape=D.STAR8,_.color=o,_.intensity=2.4,_.size0=1.4,_.size1=.2,_.life=.18,this.particles.single(Ie,_)}levelSpike(e,t,n,r){let i=B(n);if(i===0||!z.includes(n))return;let a=.8+.2*i;Y.set(e,0,t),this.shock.start(Y,{r1:3+i,dur:.45,color:Z(r),height:.5+.2*i}),this.pillar(e,t,r,a),Y.set(e,.4,t);let o=this.o.reset();o.additive=!0,o.n=10+6*i,o.shape=D.STAR5,o.color=r,o.intensity=2,o.sizes(.2,.34),o.lives(.6,1),o.speeds(2,4),o.up=4.5,o.gravity=6,this.particles.burst(Y,o)}rankFlourish(e,t,n){Y.set(e,.3,t);let r=this.o.reset();r.additive=!0,r.n=12,r.shape=D.STAR4,r.color=a(n,16777215,.35),r.intensity=2,r.sizes(.16,.26),r.sizeEnd=.4,r.lives(.35,.55),r.speeds(1.6,2.6),r.up=1.6,r.drag=2,r.r0=.5,r.alpha=1,this.particles.ring(Y,r)}update(e,t,i){this.time+=e;let a=this.particles.live;a>this.peak&&(this.peak=a);let o=this.auras;o.begin();let s=this.sugar;s.begin();let c=0;for(let a=0;a<t.length;a++){let l=t[a];if(c<Be&&l.state!==`dead`&&(l.buffs&(C.SugarRush|C.Sugared))!==0){let e=l.kind===`hero`&&l.hero!==void 0,t=e?L[l.hero]*1.6:.85,i=this.reduced?0:Math.sin(this.time*4+l.id);s.add(r(l.fx),n(l.fy),t*(1+.04*i),Ve,e?.55+.1*i:.35),c++}if(l.kind!==`hero`||!l.hero||l.state===`dead`||(l.buffs&C.Stealth)!==0)continue;let u=B(l.level??1);if(u===0)continue;let d=r(l.fx),f=n(l.fy),p=U(l.hero,l.id===i),m=L[l.hero]*1.32,h=this.reduced?0:Math.sin(this.time*(2+u)+l.id);if(o.add(d,f,m*(1+.03*h),p,.22+.12*u+.05*h),u>=2&&o.add(d,f,m*(1.12+(this.reduced?0:(this.time*.6+l.id*.17)%1*.25)),p,.18+.06*u),!this.tier.extras||this.reduced||u<2||l.id<0||l.id>=ze||(this.moteT[l.id]-=e,this.moteT[l.id]>0))continue;this.moteT[l.id]=u>=3?.18:.32;let g=this.rnd()*Math.PI*2;Y.set(d+Math.cos(g)*m*.5,.2,f+Math.sin(g)*m*.5);let _=this.s.reset();_.shape=D.STAR4,_.color=p,_.intensity=1.6,_.size0=.16,_.size1=.06,_.life=.7,_.vy=1.6,_.fade=O.IN_OUT,this.particles.single(Y,_)}o.end(),s.end()}dispose(){this.auras.dispose(),this.sugar.dispose()}},Ue=Object.freeze({crescent:0,arc:1,ring:2,dome:3,wall:4,beam:5,pillar:6,twister:7,curtain:8,heart:9,chain:10,meteor:11,glow:12,crackStar:20,crackLine:21,scorch:22,scratches:23,crater:24,petals:25}),We=`
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
}`,Ge=`
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
}`;function Ke(){return{uTime:{value:0},uTele:{value:Array.from({length:4},()=>new l)},uFadeOwn:{value:1}}}function qe(e,t){let n=new s({uniforms:e,vertexShader:We,fragmentShader:Ge,transparent:!0,depthWrite:!1,side:2,blending:t===`add`?5:1});return t===`add`&&(n.blendSrc=201,n.blendDst=205,n.blendEquation=100),n.name=`fx-${t}`,n}var Je=Object.freeze({own:S.self,ally:S.ally,enemy:S.danger});function Ye(e,t,n,r){let i=0;for(let a=0;a<e.length&&i<4;a++){let o=e[a],s=t(o.src);if(!s||s.team===n)continue;let c=o.x/1e3,l=-o.y/1e3,u=(s.x+c)*.5,d=(s.z+l)*.5,f=Math.hypot(c-s.x,l-s.z)*.5+2.2;r[i++].set(u,d,f,1)}for(let e=i;e<r.length;e++)r[e].w=0;return i}var Xe=Object.freeze({low:.2,med:.3,high:.3});function Ze(e,t,n){if(!(t>0))return 1;let r=e/t,i=Xe[n];return r<=i?1:Math.max(.5,1-(r-i)/i*.5)}var Q=Object.freeze({whooshS:[`dash`,1.45,.35],whooshM:[`dash`,1.1,.45],whooshL:[`dash`,.8,.55],flip:[`dash`,1.25,.45],land:[`slam`,1.5,.35],bodyThud:[`slam`,.9,.55],clang:[`hit`,1.7,.6],tingParry:[`coin`,1.6,.6],crackle:[`magic`,1.7,.45],zap:[`towerShot`,.8,.5],sizzle:[`magic`,.7,.45],fwoomp:[`ult`,1.4,.45],pop:[`poof`,1.1,.55],balloon:[`pickup`,.8,.45],chain:[`hit`,2.1,.4],lightsJingle:[`coin`,1.2,.5],flutter:[`swipe`,1.6,.35],kiss:[`pickup`,1.6,.45],drum:[`slam`,1.2,.5],curtain:[`swipe`,.6,.45],gong:[`horn`,1.6,.5]}),Qe=class{win=-1;n=0;time=0;tick(e){this.time+=e}cue(e,n,r=1){let i=Q[e]??Q[`whoosh${e}`];if(!i)return;let a=Math.floor(this.time*10);a!==this.win&&(this.win=a,this.n=0),!(this.n>=3)&&(this.n++,t.play(i[0],{rate:i[1],vol:i[2]*r,at:n}))}},$=new c,$e=Object.freeze({}),et=class{mesh;ribbons;linger;particles;shock;cam;juice;sfx;lookup;tier=`med`;reduced=!1;constructor(e,t,n,r,i,a,o,s,c){this.mesh=e,this.ribbons=t,this.linger=n,this.particles=r,this.shock=i,this.cam=a,this.juice=o,this.sfx=s,this.lookup=c}relation(e){return e===this.lookup.mySlot?`own`:this.lookup.teamOf(e)===this.lookup.myTeam?`ally`:`enemy`}rim(e){return Je[this.relation(e)]}abil(e,t){let n=this.lookup.heroOf(e);return n?le(n,t,this.lookup.talentsOf(e),this.lookup.branchOf(e)):$e}heroPos(e,t){return this.lookup.posOf(e,t)}card(e){return this.lookup.card?.(e)??null}ents=null;projs=null;status(e,t){let n=this.ents?.get(e);return n?(t.buffs=n.buffs,t.shield=n.shield,t.hp=n.hp??0,t.maxHp=n.maxHp??0,!0):!1}facing(e,t){let n=this.lookup.yawOf?.(e)??NaN;return n===n&&(t.x=Math.cos(n),t.y=0,t.z=-Math.sin(n),!0)}projPos(e,t){let n=this.projs;if(!n)return!1;for(let r=0;r<n.length;r++)if(n[r].index===e)return t.x=n[r].fx/1e3,t.y=.6,t.z=-n[r].fy/1e3,!0;return!1}bonePos(e,t,n){let r=this.lookup.bone(e,t===`weaponTip`?`weapon`:t);return r?(r.updateWorldMatrix(!0,!1),t===`weaponTip`?$.set(0,tt,0).applyMatrix4(r.matrixWorld):$.setFromMatrixPosition(r.matrixWorld),n.x=$.x,n.y=$.y,n.z=$.z,!0):!1}},tt=.5;export{Se as C,he as D,ge as E,xe as O,we as S,me as T,Te as _,Ze as a,Ce as b,qe as c,U as d,H as f,Ee as g,Oe as h,tt as i,_e as k,Ke as l,De as m,Qe as n,Ye as o,V as p,et as r,Ue as s,Q as t,He as u,L as v,ye as w,be as x,fe as y};