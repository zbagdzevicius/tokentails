var e=Object.defineProperty,t=(t,n)=>{let r={};for(var i in t)e(r,i,{get:t[i],enumerable:!0});return n||e(r,Symbol.toStringTag,{value:`Module`}),r};(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var n=class{kind;map=new Map;constructor(e){this.kind=e}add(e){return this.map.set(e.id,e),e}get(e){let t=this.map.get(e);if(!t)throw Error(`${this.kind} not registered: ${e}`);return t}has(e){return this.map.has(e)}all(){return[...this.map.values()]}},r=new n(`level`),i=new n(`cat`),a=new n(`enemy`);function o(){return r.all().sort((e,t)=>e.index-t.index)}var s={sky:13225169,fogNear:180,fogFar:760,hemiSky:15265525,hemiGround:7037528,hemiIntensity:1.4,sunColor:16773597,sunIntensity:2.2,exposure:1.05,ground:5592924,sidewalk:11118498,grass:7313994,dash:15913546,palette:[14208960,12761256,12166282,10134445,9080726,13482138,11038549,14998735,8226708,12559754],windowLit:.18,windowGlass:8491170,windowGlow:16773060,night:!1,taxiColor:16761370,taxiShare:.7,carColors:[14240314,3829721,15658734,2829099]},c={sky:15771257,fogNear:160,fogFar:720,hemiSky:16764838,hemiGround:4864582,hemiIntensity:1.25,sunColor:16751186,sunIntensity:2.1,exposure:1.02,ground:4867656,sidewalk:10261124,grass:8030794,dash:16765514,palette:[10504238,3108723,14207136,7307146,9062968,12089674,5923952,13218954],windowLit:.38,windowGlass:5133416,windowGlow:16760946,night:!1,taxiColor:16761370,taxiShare:.25,carColors:[2781145,15262424,3815994,13125162,4880970]},l={sky:10475775,fogNear:220,fogFar:900,hemiSky:16777215,hemiGround:8034906,hemiIntensity:1.5,sunColor:16774880,sunIntensity:2.5,exposure:1.08,ground:6119784,sidewalk:14999248,grass:8176726,dash:16777215,palette:[16181192,16042191,13165300,14872772,16448250,16176802,14208240,12576988],windowLit:.08,windowGlass:7312312,windowGlow:16773320,night:!1,taxiColor:16761370,taxiShare:.08,carColors:[8376575,16752560,16777215,10477706,16765567,12624127]},u={sky:1708080,fogNear:110,fogFar:640,hemiSky:8021759,hemiGround:2757680,hemiIntensity:1.15,sunColor:12618495,sunIntensity:1.05,exposure:1.2,ground:1907238,sidewalk:3617610,grass:2378046,dash:16727712,palette:[3946072,2964064,4861522,2765385,4276574,5911124,3163994],windowLit:.55,windowGlass:1383475,windowGlow:4641535,night:!0,taxiColor:16727712,taxiShare:.45,carColors:[8384767,16765514,11111423,2236962,16777215]},d={sky:14076836,fogNear:200,fogFar:820,hemiSky:16773320,hemiGround:6969914,hemiIntensity:1.35,sunColor:16769704,sunIntensity:2.35,exposure:1.04,ground:7104602,sidewalk:12035452,grass:9214546,dash:16777215,palette:[6978122,9079396,5925458,10522736,7568732,10259554],windowLit:.12,windowGlass:6253154,windowGlow:16773312,night:!1,taxiColor:16761370,taxiShare:0,carColors:[4872762,5925450,3820074,6974042,8022600]},f={glow2:s.windowGlow,emit:0,water:3114696,foam:15267583,wood:9071178,containers:[14239019,2781145,15900708,3119706,15262416,2068378,11545178,15913530],roofs:[11553338,8014394,4872826,9067082,5921370,4155994],signs:[16727712,4124927,16765502,5963658,11561727,16747070],accent:[14711327,13120042,15909424],concrete:11052188},p=new Map([[s,f],[c,{...f,glow2:16767392,emit:.35,water:2912154,foam:16765608,wood:8018494,concrete:10130054}],[l,{...f,water:4180208,foam:16777215,accent:[16734842,3842303,16765502,5951610],concrete:14078144}],[u,{...f,glow2:16732088,emit:.55,water:1714778,foam:16743120,concrete:3814992}],[d,{...f,glow2:16773312,emit:0,accent:[9083482,14205562,13120042],roofs:[5925442,6978122,8025176,4872762],concrete:10262664}]]);function m(e){return p.get(e)??f}var h=e=>({seed:7,layout:`downtown`,n:9,block:100,street:26,parkChance:.1,heightBase:20,heightRand:40,centreBoost:40,centreRand:70,valueBase:.12,valueRand:.25,theme:s,...e}),g=[{id:`meowhattan`,index:0,name:`Meowhattan`,tagline:`The city that never sleeps. Neither do you, until 4 pm.`,duration:90,frenzyAt:10,valueMul:1,world:h({}),enemies:[{type:`heli`,delay:12,every:9,minEvery:3,everyRamp:1,max:1,maxRamp:15}],fishTrucks:3,cars:90,people:420,wanted:{first:5,every:20,bonus:50,timeBonus:2,minHeight:28},objectives:[{kind:`damage`,target:800,label:`Cause $800M of damage`},{kind:`landmarks`,target:3,label:`Topple 3 WANTED landmarks`},{kind:`kills`,enemy:`heli`,target:6,label:`Swat 6 spray-bottle helicopters`}],unlockStars:0,catnipBase:40,music:{bpm:120,root:50,scale:`mixolydian`,style:`swing`},tutorial:!0},{id:`docks`,index:1,name:`Catfish Wharf`,tagline:`Smells like fish. Guarded by fire trucks. Do not fall in.`,duration:90,frenzyAt:10,valueMul:1.2,world:h({seed:21,layout:`docks`,n:10,parkChance:.04,heightBase:26,heightRand:26,centreBoost:20,centreRand:30,valueBase:.2,valueRand:.3,theme:c}),enemies:[{type:`cannonTruck`,delay:14,every:15,minEvery:8,everyRamp:1,max:1,maxRamp:30},{type:`heli`,delay:14,every:12,minEvery:5,everyRamp:1,max:1,maxRamp:30}],fishTrucks:4,cars:70,people:340,wanted:{first:5,every:20,bonus:60,timeBonus:2,minHeight:21},objectives:[{kind:`damage`,target:900,label:`Cause $900M of damage`},{kind:`kills`,enemy:`cannonTruck`,target:4,label:`Flip 4 water-cannon trucks`},{kind:`patience`,target:50,label:`Finish with 50+ patience (stay out of the harbour)`}],unlockStars:1,catnipBase:60,music:{bpm:140,root:45,scale:`dorian`,style:`surf`},tutorial:!1},{id:`suburbia`,index:2,name:`Purrburbia`,tagline:`Lawns. Pools. A robot dog that thinks it is in charge.`,duration:100,frenzyAt:10,valueMul:1.6,world:h({seed:33,layout:`suburbia`,n:9,parkChance:.12,heightBase:10,heightRand:14,centreBoost:10,centreRand:20,valueBase:.14,valueRand:.16,theme:l}),enemies:[{type:`vacuum`,delay:6,every:8,minEvery:4,everyRamp:.5,max:3,maxRamp:25},{type:`cucumberTower`,delay:15,every:18,minEvery:10,everyRamp:1,max:2,maxRamp:40}],boss:{type:`mechaDog`,at:40,endsLevel:!1},fishTrucks:3,cars:50,people:300,wanted:{first:5,every:18,bonus:50,timeBonus:2,minHeight:14},objectives:[{kind:`damage`,target:1e3,label:`Cause $1B of damage`},{kind:`kills`,enemy:`mechaDog`,target:1,label:`Scrap the Mecha-Dog`},{kind:`kills`,enemy:`vacuum`,target:6,label:`Unplug 6 robot vacuums`}],unlockStars:3,catnipBase:80,music:{bpm:110,root:53,scale:`major`,style:`suburb`},tutorial:!1},{id:`nekotown`,index:3,name:`Nekotown`,tagline:`Neon, noodles and nine-storey signs. Mostly signs, soon.`,duration:90,frenzyAt:10,valueMul:1.4,world:h({seed:47,layout:`neon`,n:10,parkChance:.06,heightBase:24,heightRand:40,centreBoost:45,centreRand:70,valueBase:.04,valueRand:.08,theme:u}),enemies:[{type:`heli`,delay:8,every:8,minEvery:3,everyRamp:1,max:1,maxRamp:12},{type:`cucumberTower`,delay:10,every:15,minEvery:8,everyRamp:1,max:2,maxRamp:30},{type:`cannonTruck`,delay:12,every:14,minEvery:7,everyRamp:1,max:2,maxRamp:30},{type:`vacuum`,delay:20,every:10,minEvery:5,everyRamp:.5,max:2,maxRamp:30}],fishTrucks:3,cars:90,people:420,wanted:{first:5,every:16,bonus:60,timeBonus:2,minHeight:35},objectives:[{kind:`damage`,target:1800,label:`Cause $1.8B of damage`},{kind:`landmarks`,target:4,label:`Topple 4 WANTED landmarks`},{kind:`combo`,target:250,label:`Hit a 250-hit combo`}],unlockStars:5,catnipBase:100,music:{bpm:128,root:45,scale:`minor`,style:`synthwave`},tutorial:!1},{id:`base`,index:4,name:`Fort Fluffington`,tagline:`The army built a vacuum the size of a stadium. Go say hi.`,duration:150,frenzyAt:10,valueMul:1.5,world:h({seed:59,layout:`base`,n:10,parkChance:.08,heightBase:12,heightRand:24,centreBoost:10,centreRand:20,valueBase:.7,valueRand:.6,theme:d}),enemies:[{type:`heli`,delay:10,every:13,minEvery:6,everyRamp:.6,max:1,maxRamp:50},{type:`vacuum`,delay:12,every:14,minEvery:7,everyRamp:.5,max:2,maxRamp:60},{type:`cannonTruck`,delay:15,every:20,minEvery:10,everyRamp:.6,max:1,maxRamp:60},{type:`cucumberJet`,delay:25,every:20,minEvery:11,everyRamp:.6,max:1,maxRamp:0}],boss:{type:`roombaPrime`,at:70,endsLevel:!0},fishTrucks:4,cars:40,people:200,wanted:{first:5,every:25,bonus:60,timeBonus:2,minHeight:20},objectives:[{kind:`boss`,target:1,label:`Defeat Roomba Prime`},{kind:`damage`,target:2e3,label:`Cause $2B of damage`},{kind:`patience`,target:30,label:`Finish with 30+ patience`}],unlockStars:8,catnipBase:150,music:{bpm:132,root:43,scale:`phrygian`,style:`march`},tutorial:!1}],_=1e3,v=1001,y=1002,b=1003,x=1004,S=1005,C=1006,w=1007,T=1008,E=1009,D=1010,O=1011,ee=1012,te=1013,ne=1014,k=1015,re=1016,ie=1017,ae=1018,oe=1020,se=35902,ce=35899,le=1021,ue=1022,de=1023,fe=1026,pe=1027,me=1028,he=1029,ge=1030,_e=1031,ve=1033,ye=33776,be=33777,xe=33778,Se=33779,Ce=35840,we=35841,Te=35842,Ee=35843,De=36196,Oe=37492,ke=37496,Ae=37488,je=37489,Me=37490,Ne=37491,A=37808,Pe=37809,Fe=37810,Ie=37811,j=37812,Le=37813,M=37814,Re=37815,ze=37816,Be=37817,Ve=37818,He=37819,Ue=37820,We=37821,Ge=36492,Ke=36494,qe=36495,Je=36283,Ye=36284,Xe=36285,Ze=36286,Qe=2300,$e=2301,et=2302,tt=2303,nt=2400,rt=2401,it=2402,at=3200,ot=`srgb`,st=`srgb-linear`,ct=`linear`,lt=`srgb`,ut=7680,dt=35044,ft=35048,pt=2e3;function mt(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}function ht(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function gt(e){return document.createElementNS(`http://www.w3.org/1999/xhtml`,e)}function _t(){let e=gt(`canvas`);return e.style.display=`block`,e}var vt={};function yt(...e){let t=`THREE.`+e.shift();console.log(t,...e)}function bt(e){let t=e[0];if(typeof t==`string`&&t.startsWith(`TSL:`)){let t=e[1];t&&t.isStackTrace?e[0]+=` `+t.getLocation():e[1]=`Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.`}return e}function N(...e){e=bt(e);let t=`THREE.`+e.shift();{let n=e[0];n&&n.isStackTrace?console.warn(n.getError(t)):console.warn(t,...e)}}function P(...e){e=bt(e);let t=`THREE.`+e.shift();{let n=e[0];n&&n.isStackTrace?console.error(n.getError(t)):console.error(t,...e)}}function xt(...e){let t=e.join(` `);t in vt||(vt[t]=!0,N(...e))}function St(e,t,n){return new Promise(function(r,i){function a(){switch(e.clientWaitSync(t,e.SYNC_FLUSH_COMMANDS_BIT,0)){case e.WAIT_FAILED:i();break;case e.TIMEOUT_EXPIRED:setTimeout(a,n);break;default:r()}}setTimeout(a,n)})}var Ct={0:1,2:6,4:7,3:5,1:0,6:2,7:4,5:3},wt=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){let n=this._listeners;return n!==void 0&&n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let r=n[e];if(r!==void 0){let e=r.indexOf(t);e!==-1&&r.splice(e,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let t=n.slice(0);for(let n=0,r=t.length;n<r;n++)t[n].call(this,e);e.target=null}}},Tt=`00.01.02.03.04.05.06.07.08.09.0a.0b.0c.0d.0e.0f.10.11.12.13.14.15.16.17.18.19.1a.1b.1c.1d.1e.1f.20.21.22.23.24.25.26.27.28.29.2a.2b.2c.2d.2e.2f.30.31.32.33.34.35.36.37.38.39.3a.3b.3c.3d.3e.3f.40.41.42.43.44.45.46.47.48.49.4a.4b.4c.4d.4e.4f.50.51.52.53.54.55.56.57.58.59.5a.5b.5c.5d.5e.5f.60.61.62.63.64.65.66.67.68.69.6a.6b.6c.6d.6e.6f.70.71.72.73.74.75.76.77.78.79.7a.7b.7c.7d.7e.7f.80.81.82.83.84.85.86.87.88.89.8a.8b.8c.8d.8e.8f.90.91.92.93.94.95.96.97.98.99.9a.9b.9c.9d.9e.9f.a0.a1.a2.a3.a4.a5.a6.a7.a8.a9.aa.ab.ac.ad.ae.af.b0.b1.b2.b3.b4.b5.b6.b7.b8.b9.ba.bb.bc.bd.be.bf.c0.c1.c2.c3.c4.c5.c6.c7.c8.c9.ca.cb.cc.cd.ce.cf.d0.d1.d2.d3.d4.d5.d6.d7.d8.d9.da.db.dc.dd.de.df.e0.e1.e2.e3.e4.e5.e6.e7.e8.e9.ea.eb.ec.ed.ee.ef.f0.f1.f2.f3.f4.f5.f6.f7.f8.f9.fa.fb.fc.fd.fe.ff`.split(`.`),Et=Math.PI/180,Dt=180/Math.PI;function Ot(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0,r=Math.random()*4294967295|0;return(Tt[e&255]+Tt[e>>8&255]+Tt[e>>16&255]+Tt[e>>24&255]+`-`+Tt[t&255]+Tt[t>>8&255]+`-`+Tt[t>>16&15|64]+Tt[t>>24&255]+`-`+Tt[n&63|128]+Tt[n>>8&255]+`-`+Tt[n>>16&255]+Tt[n>>24&255]+Tt[r&255]+Tt[r>>8&255]+Tt[r>>16&255]+Tt[r>>24&255]).toLowerCase()}function kt(e,t,n){return Math.max(t,Math.min(n,e))}function At(e,t){return(e%t+t)%t}function jt(e,t,n){return(1-n)*e+n*t}function Mt(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw Error(`Invalid component type.`)}}function Nt(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw Error(`Invalid component type.`)}}var F=class e{constructor(t=0,n=0){e.prototype.isVector2=!0,this.x=t,this.y=n}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw Error(`index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw Error(`index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6],this.y=r[1]*t+r[4]*n+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=kt(this.x,e.x,t.x),this.y=kt(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=kt(this.x,e,t),this.y=kt(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(kt(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(kt(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),r=Math.sin(t),i=this.x-e.x,a=this.y-e.y;return this.x=i*n-a*r+e.x,this.y=i*r+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Pt=class{constructor(e=0,t=0,n=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=r}static slerpFlat(e,t,n,r,i,a,o){let s=n[r+0],c=n[r+1],l=n[r+2],u=n[r+3],d=i[a+0],f=i[a+1],p=i[a+2],m=i[a+3];if(u!==m||s!==d||c!==f||l!==p){let e=s*d+c*f+l*p+u*m;e<0&&(d=-d,f=-f,p=-p,m=-m,e=-e);let t=1-o;if(e<.9995){let n=Math.acos(e),r=Math.sin(n);t=Math.sin(t*n)/r,o=Math.sin(o*n)/r,s=s*t+d*o,c=c*t+f*o,l=l*t+p*o,u=u*t+m*o}else{s=s*t+d*o,c=c*t+f*o,l=l*t+p*o,u=u*t+m*o;let e=1/Math.sqrt(s*s+c*c+l*l+u*u);s*=e,c*=e,l*=e,u*=e}}e[t]=s,e[t+1]=c,e[t+2]=l,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,r,i,a){let o=n[r],s=n[r+1],c=n[r+2],l=n[r+3],u=i[a],d=i[a+1],f=i[a+2],p=i[a+3];return e[t]=o*p+l*u+s*f-c*d,e[t+1]=s*p+l*d+c*u-o*f,e[t+2]=c*p+l*f+o*d-s*u,e[t+3]=l*p-o*u-s*d-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,r){return this._x=e,this._y=t,this._z=n,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,r=e._y,i=e._z,a=e._order,o=Math.cos,s=Math.sin,c=o(n/2),l=o(r/2),u=o(i/2),d=s(n/2),f=s(r/2),p=s(i/2);switch(a){case`XYZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`YXZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`ZXY`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`ZYX`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`YZX`:this._x=d*l*u+c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u-d*f*p;break;case`XZY`:this._x=d*l*u-c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u+d*f*p;break;default:N(`Quaternion: .setFromEuler() encountered an unknown order: `+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,r=Math.sin(n);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],r=t[4],i=t[8],a=t[1],o=t[5],s=t[9],c=t[2],l=t[6],u=t[10],d=n+o+u;if(d>0){let e=.5/Math.sqrt(d+1);this._w=.25/e,this._x=(l-s)*e,this._y=(i-c)*e,this._z=(a-r)*e}else if(n>o&&n>u){let e=2*Math.sqrt(1+n-o-u);this._w=(l-s)/e,this._x=.25*e,this._y=(r+a)/e,this._z=(i+c)/e}else if(o>u){let e=2*Math.sqrt(1+o-n-u);this._w=(i-c)/e,this._x=(r+a)/e,this._y=.25*e,this._z=(s+l)/e}else{let e=2*Math.sqrt(1+u-n-o);this._w=(a-r)/e,this._x=(i+c)/e,this._y=(s+l)/e,this._z=.25*e}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(kt(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let r=Math.min(1,t/n);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x*=e,this._y*=e,this._z*=e,this._w*=e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=t._x,s=t._y,c=t._z,l=t._w;return this._x=n*l+a*o+r*c-i*s,this._y=r*l+a*s+i*o-n*c,this._z=i*l+a*c+n*s-r*o,this._w=a*l-n*o-r*s-i*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,r=-r,i=-i,a=-a,o=-o);let s=1-t;if(o<.9995){let e=Math.acos(o),c=Math.sin(e);s=Math.sin(s*e)/c,t=Math.sin(t*e)/c,this._x=this._x*s+n*t,this._y=this._y*s+r*t,this._z=this._z*s+i*t,this._w=this._w*s+a*t,this._onChangeCallback()}else this._x=this._x*s+n*t,this._y=this._y*s+r*t,this._z=this._z*s+i*t,this._w=this._w*s+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),r=Math.sqrt(1-n),i=Math.sqrt(n);return this.set(r*Math.sin(e),r*Math.cos(e),i*Math.sin(t),i*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},I=class e{constructor(t=0,n=0,r=0){e.prototype.isVector3=!0,this.x=t,this.y=n,this.z=r}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw Error(`index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw Error(`index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(It.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(It.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6]*r,this.y=i[1]*t+i[4]*n+i[7]*r,this.z=i[2]*t+i[5]*n+i[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=e.elements,a=1/(i[3]*t+i[7]*n+i[11]*r+i[15]);return this.x=(i[0]*t+i[4]*n+i[8]*r+i[12])*a,this.y=(i[1]*t+i[5]*n+i[9]*r+i[13])*a,this.z=(i[2]*t+i[6]*n+i[10]*r+i[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,r=this.z,i=e.x,a=e.y,o=e.z,s=e.w,c=2*(a*r-o*n),l=2*(o*t-i*r),u=2*(i*n-a*t);return this.x=t+s*c+a*u-o*l,this.y=n+s*l+o*c-i*u,this.z=r+s*u+i*l-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[4]*n+i[8]*r,this.y=i[1]*t+i[5]*n+i[9]*r,this.z=i[2]*t+i[6]*n+i[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=kt(this.x,e.x,t.x),this.y=kt(this.y,e.y,t.y),this.z=kt(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=kt(this.x,e,t),this.y=kt(this.y,e,t),this.z=kt(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(kt(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,r=e.y,i=e.z,a=t.x,o=t.y,s=t.z;return this.x=r*s-i*o,this.y=i*a-n*s,this.z=n*o-r*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Ft.copy(this).projectOnVector(e),this.sub(Ft)}reflect(e){return this.sub(Ft.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(kt(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,r=this.z-e.z;return t*t+n*n+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let r=Math.sin(t)*e;return this.x=r*Math.sin(n),this.y=Math.cos(t)*e,this.z=r*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Ft=new I,It=new Pt,Lt=class e{constructor(t,n,r,i,a,o,s,c,l){e.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,n,r,i,a,o,s,c,l)}set(e,t,n,r,i,a,o,s,c){let l=this.elements;return l[0]=e,l[1]=r,l[2]=o,l[3]=t,l[4]=i,l[5]=s,l[6]=n,l[7]=a,l[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[3],s=n[6],c=n[1],l=n[4],u=n[7],d=n[2],f=n[5],p=n[8],m=r[0],h=r[3],g=r[6],_=r[1],v=r[4],y=r[7],b=r[2],x=r[5],S=r[8];return i[0]=a*m+o*_+s*b,i[3]=a*h+o*v+s*x,i[6]=a*g+o*y+s*S,i[1]=c*m+l*_+u*b,i[4]=c*h+l*v+u*x,i[7]=c*g+l*y+u*S,i[2]=d*m+f*_+p*b,i[5]=d*h+f*v+p*x,i[8]=d*g+f*y+p*S,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8];return t*a*l-t*o*c-n*i*l+n*o*s+r*i*c-r*a*s}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=l*a-o*c,d=o*s-l*i,f=c*i-a*s,p=t*u+n*d+r*f;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);let m=1/p;return e[0]=u*m,e[1]=(r*c-l*n)*m,e[2]=(o*n-r*a)*m,e[3]=d*m,e[4]=(l*t-r*s)*m,e[5]=(r*i-o*t)*m,e[6]=f*m,e[7]=(n*s-c*t)*m,e[8]=(a*t-n*i)*m,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,r,i,a,o){let s=Math.cos(i),c=Math.sin(i);return this.set(n*s,n*c,-n*(s*a+c*o)+a+e,-r*c,r*s,-r*(-c*a+s*o)+o+t,0,0,1),this}scale(e,t){return this.premultiply(Rt.makeScale(e,t)),this}rotate(e){return this.premultiply(Rt.makeRotation(-e)),this}translate(e,t){return this.premultiply(Rt.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<9;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Rt=new Lt,zt=new Lt().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Bt=new Lt().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Vt(){let e={enabled:!0,workingColorSpace:st,spaces:{},convert:function(e,t,n){return this.enabled===!1||t===n||!t||!n||(this.spaces[t].transfer===`srgb`&&(e.r=Ut(e.r),e.g=Ut(e.g),e.b=Ut(e.b)),this.spaces[t].primaries!==this.spaces[n].primaries&&(e.applyMatrix3(this.spaces[t].toXYZ),e.applyMatrix3(this.spaces[n].fromXYZ)),this.spaces[n].transfer===`srgb`&&(e.r=Wt(e.r),e.g=Wt(e.g),e.b=Wt(e.b))),e},workingToColorSpace:function(e,t){return this.convert(e,this.workingColorSpace,t)},colorSpaceToWorking:function(e,t){return this.convert(e,t,this.workingColorSpace)},getPrimaries:function(e){return this.spaces[e].primaries},getTransfer:function(e){return e===``?ct:this.spaces[e].transfer},getToneMappingMode:function(e){return this.spaces[e].outputColorSpaceConfig.toneMappingMode||`standard`},getLuminanceCoefficients:function(e,t=this.workingColorSpace){return e.fromArray(this.spaces[t].luminanceCoefficients)},define:function(e){Object.assign(this.spaces,e)},_getMatrix:function(e,t,n){return e.copy(this.spaces[t].toXYZ).multiply(this.spaces[n].fromXYZ)},_getDrawingBufferColorSpace:function(e){return this.spaces[e].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(e=this.workingColorSpace){return this.spaces[e].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(t,n){return xt(`ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace().`),e.workingToColorSpace(t,n)},toWorkingColorSpace:function(t,n){return xt(`ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking().`),e.colorSpaceToWorking(t,n)}},t=[.64,.33,.3,.6,.15,.06],n=[.2126,.7152,.0722],r=[.3127,.329];return e.define({[st]:{primaries:t,whitePoint:r,transfer:ct,toXYZ:zt,fromXYZ:Bt,luminanceCoefficients:n,workingColorSpaceConfig:{unpackColorSpace:ot},outputColorSpaceConfig:{drawingBufferColorSpace:ot}},[ot]:{primaries:t,whitePoint:r,transfer:lt,toXYZ:zt,fromXYZ:Bt,luminanceCoefficients:n,outputColorSpaceConfig:{drawingBufferColorSpace:ot}}}),e}var Ht=Vt();function Ut(e){return e<.04045?e*.0773993808:(e*.9478672986+.0521327014)**2.4}function Wt(e){return e<.0031308?e*12.92:1.055*e**.41666-.055}var Gt,Kt=class{static getDataURL(e,t=`image/png`){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>`u`)return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{Gt===void 0&&(Gt=gt(`canvas`)),Gt.width=e.width,Gt.height=e.height;let t=Gt.getContext(`2d`);e instanceof ImageData?t.putImageData(e,0,0):t.drawImage(e,0,0,e.width,e.height),n=Gt}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap){let t=gt(`canvas`);t.width=e.width,t.height=e.height;let n=t.getContext(`2d`);n.drawImage(e,0,0,e.width,e.height);let r=n.getImageData(0,0,e.width,e.height),i=r.data;for(let e=0;e<i.length;e++)i[e]=Ut(i[e]/255)*255;return n.putImageData(r,0,0),t}if(e.data){let t=e.data.slice(0);for(let e=0;e<t.length;e++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[e]=Math.floor(Ut(t[e]/255)*255):t[e]=Ut(t[e]);return{data:t,width:e.width,height:e.height}}return N(`ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.`),e}},qt=0,Jt=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:qt++}),this.uuid=Ot(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<`u`&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<`u`&&t instanceof VideoFrame?e.set(t.displayHeight,t.displayWidth,0):t===null?e.set(0,0,0):e.set(t.width,t.height,t.depth||0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:``},r=this.data;if(r!==null){let e;if(Array.isArray(r)){e=[];for(let t=0,n=r.length;t<n;t++)r[t].isDataTexture?e.push(Yt(r[t].image)):e.push(Yt(r[t]))}else e=Yt(r);n.url=e}return t||(e.images[this.uuid]=n),n}};function Yt(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap?Kt.getDataURL(e):e.data?{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name}:(N(`Texture: Unable to serialize Texture.`),{})}var Xt=0,Zt=new I,Qt=class e extends wt{constructor(t=e.DEFAULT_IMAGE,n=e.DEFAULT_MAPPING,r=v,i=v,a=C,o=T,s=de,c=E,l=e.DEFAULT_ANISOTROPY,u=``){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Xt++}),this.uuid=Ot(),this.name=``,this.source=new Jt(t),this.mipmaps=[],this.mapping=n,this.channel=0,this.wrapS=r,this.wrapT=i,this.magFilter=a,this.minFilter=o,this.anisotropy=l,this.format=s,this.internalFormat=null,this.type=c,this.offset=new F(0,0),this.repeat=new F(1,1),this.center=new F(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Lt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(Zt).x}get height(){return this.source.getSize(Zt).y}get depth(){return this.source.getSize(Zt).z}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let n=e[t];if(n===void 0){N(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let r=this[t];r===void 0?N(`Texture.setValues(): property '${t}' does not exist.`):r&&n&&r.isVector2&&n.isVector2||r&&n&&r.isVector3&&n.isVector3||r&&n&&r.isMatrix3&&n.isMatrix3?r.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.7,type:`Texture`,generator:`Texture.toJSON`},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:`dispose`})}transformUv(e){if(this.mapping!==300)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case _:e.x-=Math.floor(e.x);break;case v:e.x=e.x<0?0:1;break;case y:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x-=Math.floor(e.x)}if(e.y<0||e.y>1)switch(this.wrapT){case _:e.y-=Math.floor(e.y);break;case v:e.y=e.y<0?0:1;break;case y:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y-=Math.floor(e.y)}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};Qt.DEFAULT_IMAGE=null,Qt.DEFAULT_MAPPING=300,Qt.DEFAULT_ANISOTROPY=1;var $t=class e{constructor(t=0,n=0,r=0,i=1){e.prototype.isVector4=!0,this.x=t,this.y=n,this.z=r,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,r){return this.x=e,this.y=t,this.z=n,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw Error(`index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw Error(`index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w===void 0?1:e.w,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*r+a[12]*i,this.y=a[1]*t+a[5]*n+a[9]*r+a[13]*i,this.z=a[2]*t+a[6]*n+a[10]*r+a[14]*i,this.w=a[3]*t+a[7]*n+a[11]*r+a[15]*i,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,r,i,a=.01,o=.1,s=e.elements,c=s[0],l=s[4],u=s[8],d=s[1],f=s[5],p=s[9],m=s[2],h=s[6],g=s[10];if(Math.abs(l-d)<a&&Math.abs(u-m)<a&&Math.abs(p-h)<a){if(Math.abs(l+d)<o&&Math.abs(u+m)<o&&Math.abs(p+h)<o&&Math.abs(c+f+g-3)<o)return this.set(1,0,0,0),this;t=Math.PI;let e=(c+1)/2,s=(f+1)/2,_=(g+1)/2,v=(l+d)/4,y=(u+m)/4,b=(p+h)/4;return e>s&&e>_?e<a?(n=0,r=.707106781,i=.707106781):(n=Math.sqrt(e),r=v/n,i=y/n):s>_?s<a?(n=.707106781,r=0,i=.707106781):(r=Math.sqrt(s),n=v/r,i=b/r):_<a?(n=.707106781,r=.707106781,i=0):(i=Math.sqrt(_),n=y/i,r=b/i),this.set(n,r,i,t),this}let _=Math.sqrt((h-p)*(h-p)+(u-m)*(u-m)+(d-l)*(d-l));return Math.abs(_)<.001&&(_=1),this.x=(h-p)/_,this.y=(u-m)/_,this.z=(d-l)/_,this.w=Math.acos((c+f+g-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=kt(this.x,e.x,t.x),this.y=kt(this.y,e.y,t.y),this.z=kt(this.z,e.z,t.z),this.w=kt(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=kt(this.x,e,t),this.y=kt(this.y,e,t),this.z=kt(this.z,e,t),this.w=kt(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(kt(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},en=class extends wt{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:C,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new $t(0,0,e,t),this.scissorTest=!1,this.viewport=new $t(0,0,e,t),this.textures=[];let r=new Qt({width:e,height:t,depth:n.depth}),i=n.count;for(let e=0;e<i;e++)this.textures[e]=r.clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview}_setTextureOptions(e={}){let t={minFilter:C,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let e=0;e<this.textures.length;e++)this.textures[e].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let r=0,i=this.textures.length;r<i;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=n,this.textures[r].isData3DTexture!==!0&&(this.textures[r].isArrayTexture=this.textures[r].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let n=Object.assign({},e.textures[t].image);this.textures[t].source=new Jt(n)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:`dispose`})}},tn=class extends en{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},nn=class extends Qt{constructor(e=null,t=1,n=1,r=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:r},this.magFilter=b,this.minFilter=b,this.wrapR=v,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}},rn=class extends Qt{constructor(e=null,t=1,n=1,r=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:r},this.magFilter=b,this.minFilter=b,this.wrapR=v,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},an=class e{constructor(t,n,r,i,a,o,s,c,l,u,d,f,p,m,h,g){e.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,n,r,i,a,o,s,c,l,u,d,f,p,m,h,g)}set(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h){let g=this.elements;return g[0]=e,g[4]=t,g[8]=n,g[12]=r,g[1]=i,g[5]=a,g[9]=o,g[13]=s,g[2]=c,g[6]=l,g[10]=u,g[14]=d,g[3]=f,g[7]=p,g[11]=m,g[15]=h,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new e().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinant()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinant()===0)return this.identity();let t=this.elements,n=e.elements,r=1/on.setFromMatrixColumn(e,0).length(),i=1/on.setFromMatrixColumn(e,1).length(),a=1/on.setFromMatrixColumn(e,2).length();return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=0,t[4]=n[4]*i,t[5]=n[5]*i,t[6]=n[6]*i,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,r=e.y,i=e.z,a=Math.cos(n),o=Math.sin(n),s=Math.cos(r),c=Math.sin(r),l=Math.cos(i),u=Math.sin(i);if(e.order===`XYZ`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=-s*u,t[8]=c,t[1]=n+r*c,t[5]=e-i*c,t[9]=-o*s,t[2]=i-e*c,t[6]=r+n*c,t[10]=a*s}else if(e.order===`YXZ`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e+i*o,t[4]=r*o-n,t[8]=a*c,t[1]=a*u,t[5]=a*l,t[9]=-o,t[2]=n*o-r,t[6]=i+e*o,t[10]=a*s}else if(e.order===`ZXY`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e-i*o,t[4]=-a*u,t[8]=r+n*o,t[1]=n+r*o,t[5]=a*l,t[9]=i-e*o,t[2]=-a*c,t[6]=o,t[10]=a*s}else if(e.order===`ZYX`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=r*c-n,t[8]=e*c+i,t[1]=s*u,t[5]=i*c+e,t[9]=n*c-r,t[2]=-c,t[6]=o*s,t[10]=a*s}else if(e.order===`YZX`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=i-e*u,t[8]=r*u+n,t[1]=u,t[5]=a*l,t[9]=-o*l,t[2]=-c*l,t[6]=n*u+r,t[10]=e-i*u}else if(e.order===`XZY`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=-u,t[8]=c*l,t[1]=e*u+i,t[5]=a*l,t[9]=n*u-r,t[2]=r*u-n,t[6]=o*l,t[10]=i*u+e}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(cn,e,ln)}lookAt(e,t,n){let r=this.elements;return fn.subVectors(e,t),fn.lengthSq()===0&&(fn.z=1),fn.normalize(),un.crossVectors(n,fn),un.lengthSq()===0&&(Math.abs(n.z)===1?fn.x+=1e-4:fn.z+=1e-4,fn.normalize(),un.crossVectors(n,fn)),un.normalize(),dn.crossVectors(fn,un),r[0]=un.x,r[4]=dn.x,r[8]=fn.x,r[1]=un.y,r[5]=dn.y,r[9]=fn.y,r[2]=un.z,r[6]=dn.z,r[10]=fn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[4],s=n[8],c=n[12],l=n[1],u=n[5],d=n[9],f=n[13],p=n[2],m=n[6],h=n[10],g=n[14],_=n[3],v=n[7],y=n[11],b=n[15],x=r[0],S=r[4],C=r[8],w=r[12],T=r[1],E=r[5],D=r[9],O=r[13],ee=r[2],te=r[6],ne=r[10],k=r[14],re=r[3],ie=r[7],ae=r[11],oe=r[15];return i[0]=a*x+o*T+s*ee+c*re,i[4]=a*S+o*E+s*te+c*ie,i[8]=a*C+o*D+s*ne+c*ae,i[12]=a*w+o*O+s*k+c*oe,i[1]=l*x+u*T+d*ee+f*re,i[5]=l*S+u*E+d*te+f*ie,i[9]=l*C+u*D+d*ne+f*ae,i[13]=l*w+u*O+d*k+f*oe,i[2]=p*x+m*T+h*ee+g*re,i[6]=p*S+m*E+h*te+g*ie,i[10]=p*C+m*D+h*ne+g*ae,i[14]=p*w+m*O+h*k+g*oe,i[3]=_*x+v*T+y*ee+b*re,i[7]=_*S+v*E+y*te+b*ie,i[11]=_*C+v*D+y*ne+b*ae,i[15]=_*w+v*O+y*k+b*oe,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],r=e[8],i=e[12],a=e[1],o=e[5],s=e[9],c=e[13],l=e[2],u=e[6],d=e[10],f=e[14],p=e[3],m=e[7],h=e[11],g=e[15],_=s*f-c*d,v=o*f-c*u,y=o*d-s*u,b=a*f-c*l,x=a*d-s*l,S=a*u-o*l;return t*(m*_-h*v+g*y)-n*(p*_-h*b+g*x)+r*(p*v-m*b+g*S)-i*(p*y-m*x+h*S)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=e[9],d=e[10],f=e[11],p=e[12],m=e[13],h=e[14],g=e[15],_=t*o-n*a,v=t*s-r*a,y=t*c-i*a,b=n*s-r*o,x=n*c-i*o,S=r*c-i*s,C=l*m-u*p,w=l*h-d*p,T=l*g-f*p,E=u*h-d*m,D=u*g-f*m,O=d*g-f*h,ee=_*O-v*D+y*E+b*T-x*w+S*C;if(ee===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let te=1/ee;return e[0]=(o*O-s*D+c*E)*te,e[1]=(r*D-n*O-i*E)*te,e[2]=(m*S-h*x+g*b)*te,e[3]=(d*x-u*S-f*b)*te,e[4]=(s*T-a*O-c*w)*te,e[5]=(t*O-r*T+i*w)*te,e[6]=(h*y-p*S-g*v)*te,e[7]=(l*S-d*y+f*v)*te,e[8]=(a*D-o*T+c*C)*te,e[9]=(n*T-t*D-i*C)*te,e[10]=(p*x-m*y+g*_)*te,e[11]=(u*y-l*x-f*_)*te,e[12]=(o*w-a*E-s*C)*te,e[13]=(t*E-n*w+r*C)*te,e[14]=(m*v-p*b-h*_)*te,e[15]=(l*b-u*v+d*_)*te,this}scale(e){let t=this.elements,n=e.x,r=e.y,i=e.z;return t[0]*=n,t[4]*=r,t[8]*=i,t[1]*=n,t[5]*=r,t[9]*=i,t[2]*=n,t[6]*=r,t[10]*=i,t[3]*=n,t[7]*=r,t[11]*=i,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,r))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),r=Math.sin(t),i=1-n,a=e.x,o=e.y,s=e.z,c=i*a,l=i*o;return this.set(c*a+n,c*o-r*s,c*s+r*o,0,c*o+r*s,l*o+n,l*s-r*a,0,c*s-r*o,l*s+r*a,i*s*s+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,r,i,a){return this.set(1,n,i,0,e,1,a,0,t,r,1,0,0,0,0,1),this}compose(e,t,n){let r=this.elements,i=t._x,a=t._y,o=t._z,s=t._w,c=i+i,l=a+a,u=o+o,d=i*c,f=i*l,p=i*u,m=a*l,h=a*u,g=o*u,_=s*c,v=s*l,y=s*u,b=n.x,x=n.y,S=n.z;return r[0]=(1-(m+g))*b,r[1]=(f+y)*b,r[2]=(p-v)*b,r[3]=0,r[4]=(f-y)*x,r[5]=(1-(d+g))*x,r[6]=(h+_)*x,r[7]=0,r[8]=(p+v)*S,r[9]=(h-_)*S,r[10]=(1-(d+m))*S,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,n){let r=this.elements;e.x=r[12],e.y=r[13],e.z=r[14];let i=this.determinant();if(i===0)return n.set(1,1,1),t.identity(),this;let a=on.set(r[0],r[1],r[2]).length(),o=on.set(r[4],r[5],r[6]).length(),s=on.set(r[8],r[9],r[10]).length();i<0&&(a=-a),sn.copy(this);let c=1/a,l=1/o,u=1/s;return sn.elements[0]*=c,sn.elements[1]*=c,sn.elements[2]*=c,sn.elements[4]*=l,sn.elements[5]*=l,sn.elements[6]*=l,sn.elements[8]*=u,sn.elements[9]*=u,sn.elements[10]*=u,t.setFromRotationMatrix(sn),n.x=a,n.y=o,n.z=s,this}makePerspective(e,t,n,r,i,a,o=pt,s=!1){let c=this.elements,l=2*i/(t-e),u=2*i/(n-r),d=(t+e)/(t-e),f=(n+r)/(n-r),p,m;if(s)p=i/(a-i),m=a*i/(a-i);else if(o===2e3)p=-(a+i)/(a-i),m=-2*a*i/(a-i);else if(o===2001)p=-a/(a-i),m=-a*i/(a-i);else throw Error(`THREE.Matrix4.makePerspective(): Invalid coordinate system: `+o);return c[0]=l,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=u,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=p,c[14]=m,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,r,i,a,o=pt,s=!1){let c=this.elements,l=2/(t-e),u=2/(n-r),d=-(t+e)/(t-e),f=-(n+r)/(n-r),p,m;if(s)p=1/(a-i),m=a/(a-i);else if(o===2e3)p=-2/(a-i),m=-(a+i)/(a-i);else if(o===2001)p=-1/(a-i),m=-i/(a-i);else throw Error(`THREE.Matrix4.makeOrthographic(): Invalid coordinate system: `+o);return c[0]=l,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=u,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=p,c[14]=m,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<16;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},on=new I,sn=new an,cn=new I(0,0,0),ln=new I(1,1,1),un=new I,dn=new I,fn=new I,pn=new an,mn=new Pt,hn=class e{constructor(t=0,n=0,r=0,i=e.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=n,this._z=r,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,r=this._order){return this._x=e,this._y=t,this._z=n,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let r=e.elements,i=r[0],a=r[4],o=r[8],s=r[1],c=r[5],l=r[9],u=r[2],d=r[6],f=r[10];switch(t){case`XYZ`:this._y=Math.asin(kt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-l,f),this._z=Math.atan2(-a,i)):(this._x=Math.atan2(d,c),this._z=0);break;case`YXZ`:this._x=Math.asin(-kt(l,-1,1)),Math.abs(l)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(s,c)):(this._y=Math.atan2(-u,i),this._z=0);break;case`ZXY`:this._x=Math.asin(kt(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(s,i));break;case`ZYX`:this._y=Math.asin(-kt(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,f),this._z=Math.atan2(s,i)):(this._x=0,this._z=Math.atan2(-a,c));break;case`YZX`:this._z=Math.asin(kt(s,-1,1)),Math.abs(s)<.9999999?(this._x=Math.atan2(-l,c),this._y=Math.atan2(-u,i)):(this._x=0,this._y=Math.atan2(o,f));break;case`XZY`:this._z=Math.asin(-kt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,i)):(this._x=Math.atan2(-l,f),this._y=0);break;default:N(`Euler: .setFromRotationMatrix() encountered an unknown order: `+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return pn.makeRotationFromQuaternion(e),this.setFromRotationMatrix(pn,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return mn.setFromEuler(this),this.setFromQuaternion(mn,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};hn.DEFAULT_ORDER=`XYZ`;var gn=class{constructor(){this.mask=1}set(e){this.mask=1<<e>>>0}enable(e){this.mask|=1<<e}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e}disable(e){this.mask&=~(1<<e)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return!!(this.mask&1<<e)}},_n=0,vn=new I,yn=new Pt,bn=new an,xn=new I,Sn=new I,Cn=new I,wn=new Pt,Tn=new I(1,0,0),En=new I(0,1,0),Dn=new I(0,0,1),On={type:`added`},kn={type:`removed`},An={type:`childadded`,child:null},jn={type:`childremoved`,child:null},Mn=class e extends wt{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:_n++}),this.uuid=Ot(),this.name=``,this.type=`Object3D`,this.parent=null,this.children=[],this.up=e.DEFAULT_UP.clone();let t=new I,n=new hn,r=new Pt,i=new I(1,1,1);function a(){r.setFromEuler(n,!1)}function o(){n.setFromQuaternion(r,void 0,!1)}n._onChange(a),r._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:n},quaternion:{configurable:!0,enumerable:!0,value:r},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new an},normalMatrix:{value:new Lt}}),this.matrix=new an,this.matrixWorld=new an,this.matrixAutoUpdate=e.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=e.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new gn,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return yn.setFromAxisAngle(e,t),this.quaternion.multiply(yn),this}rotateOnWorldAxis(e,t){return yn.setFromAxisAngle(e,t),this.quaternion.premultiply(yn),this}rotateX(e){return this.rotateOnAxis(Tn,e)}rotateY(e){return this.rotateOnAxis(En,e)}rotateZ(e){return this.rotateOnAxis(Dn,e)}translateOnAxis(e,t){return vn.copy(e).applyQuaternion(this.quaternion),this.position.add(vn.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(Tn,e)}translateY(e){return this.translateOnAxis(En,e)}translateZ(e){return this.translateOnAxis(Dn,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(bn.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?xn.copy(e):xn.set(e,t,n);let r=this.parent;this.updateWorldMatrix(!0,!1),Sn.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?bn.lookAt(Sn,xn,this.up):bn.lookAt(xn,Sn,this.up),this.quaternion.setFromRotationMatrix(bn),r&&(bn.extractRotation(r.matrixWorld),yn.setFromRotationMatrix(bn),this.quaternion.premultiply(yn.invert()))}add(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return e===this?(P(`Object3D.add: object can't be added as a child of itself.`,e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(On),An.child=e,this.dispatchEvent(An),An.child=null):P(`Object3D.add: object not an instance of THREE.Object3D.`,e),this)}remove(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.remove(arguments[e]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(kn),jn.child=e,this.dispatchEvent(jn),jn.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),bn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),bn.multiply(e.parent.matrixWorld)),e.applyMatrix4(bn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(On),An.child=e,this.dispatchEvent(An),An.child=null,this}getObjectById(e){return this.getObjectByProperty(`id`,e)}getObjectByName(e){return this.getObjectByProperty(`name`,e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,r=this.children.length;n<r;n++){let r=this.children[n].getObjectByProperty(e,t);if(r!==void 0)return r}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let r=this.children;for(let i=0,a=r.length;i<a;i++)r[i].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Sn,e,Cn),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Sn,wn,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let t=e.x,n=e.y,r=e.z,i=this.matrix.elements;i[12]+=t-i[0]*t-i[4]*n-i[8]*r,i[13]+=n-i[1]*t-i[5]*n-i[9]*r,i[14]+=r-i[2]*t-i[6]*n-i[10]*r}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t){let n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){let e=this.children;for(let t=0,n=e.length;t<n;t++)e[t].updateWorldMatrix(!1,!0)}}toJSON(e){let t=e===void 0||typeof e==`string`,n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:`Object`,generator:`Object3D.toJSON`});let r={};r.uuid=this.uuid,r.type=this.type,this.name!==``&&(r.name=this.name),this.castShadow===!0&&(r.castShadow=!0),this.receiveShadow===!0&&(r.receiveShadow=!0),this.visible===!1&&(r.visible=!1),this.frustumCulled===!1&&(r.frustumCulled=!1),this.renderOrder!==0&&(r.renderOrder=this.renderOrder),this.static!==!1&&(r.static=this.static),Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.pivot!==null&&(r.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(r.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(r.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(r.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(r.type=`InstancedMesh`,r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type=`BatchedMesh`,r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.geometryInfo=this._geometryInfo.map(e=>({...e,boundingBox:e.boundingBox?e.boundingBox.toJSON():void 0,boundingSphere:e.boundingSphere?e.boundingSphere.toJSON():void 0})),r.instanceInfo=this._instanceInfo.map(e=>({...e})),r.availableInstanceIds=this._availableInstanceIds.slice(),r.availableGeometryIds=this._availableGeometryIds.slice(),r.nextIndexStart=this._nextIndexStart,r.nextVertexStart=this._nextVertexStart,r.geometryCount=this._geometryCount,r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.matricesTexture=this._matricesTexture.toJSON(e),r.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(r.boundingBox=this.boundingBox.toJSON()));function i(t,n){return t[n.uuid]===void 0&&(t[n.uuid]=n.toJSON(e)),n.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=i(e.geometries,this.geometry);let t=this.geometry.parameters;if(t!==void 0&&t.shapes!==void 0){let n=t.shapes;if(Array.isArray(n))for(let t=0,r=n.length;t<r;t++){let r=n[t];i(e.shapes,r)}else i(e.shapes,n)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(i(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0){if(Array.isArray(this.material)){let t=[];for(let n=0,r=this.material.length;n<r;n++)t.push(i(e.materials,this.material[n]));r.material=t}else r.material=i(e.materials,this.material)}if(this.children.length>0){r.children=[];for(let t=0;t<this.children.length;t++)r.children.push(this.children[t].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let t=0;t<this.animations.length;t++){let n=this.animations[t];r.animations.push(i(e.animations,n))}}if(t){let t=a(e.geometries),r=a(e.materials),i=a(e.textures),o=a(e.images),s=a(e.shapes),c=a(e.skeletons),l=a(e.animations),u=a(e.nodes);t.length>0&&(n.geometries=t),r.length>0&&(n.materials=r),i.length>0&&(n.textures=i),o.length>0&&(n.images=o),s.length>0&&(n.shapes=s),c.length>0&&(n.skeletons=c),l.length>0&&(n.animations=l),u.length>0&&(n.nodes=u)}return n.object=r,n;function a(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),e.pivot!==null&&(this.pivot=e.pivot.clone()),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let t=0;t<e.children.length;t++){let n=e.children[t];this.add(n.clone())}return this}};Mn.DEFAULT_UP=new I(0,1,0),Mn.DEFAULT_MATRIX_AUTO_UPDATE=!0,Mn.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var L=class extends Mn{constructor(){super(),this.isGroup=!0,this.type=`Group`}},Nn={type:`move`},Pn=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new L,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new L,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new I,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new I),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new L,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new I,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new I),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:`connected`,data:e}),this}disconnect(e){return this.dispatchEvent({type:`disconnected`,data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let r=null,i=null,a=null,o=this._targetRay,s=this._grip,c=this._hand;if(e&&t.session.visibilityState!==`visible-blurred`){if(c&&e.hand){a=!0;for(let r of e.hand.values()){let e=t.getJointPose(r,n),i=this._getHandJoint(c,r);e!==null&&(i.matrix.fromArray(e.transform.matrix),i.matrix.decompose(i.position,i.rotation,i.scale),i.matrixWorldNeedsUpdate=!0,i.jointRadius=e.radius),i.visible=e!==null}let r=c.joints[`index-finger-tip`],i=c.joints[`thumb-tip`],o=r.position.distanceTo(i.position);c.inputState.pinching&&o>.025?(c.inputState.pinching=!1,this.dispatchEvent({type:`pinchend`,handedness:e.handedness,target:this})):!c.inputState.pinching&&o<=.015&&(c.inputState.pinching=!0,this.dispatchEvent({type:`pinchstart`,handedness:e.handedness,target:this}))}else s!==null&&e.gripSpace&&(i=t.getPose(e.gripSpace,n),i!==null&&(s.matrix.fromArray(i.transform.matrix),s.matrix.decompose(s.position,s.rotation,s.scale),s.matrixWorldNeedsUpdate=!0,i.linearVelocity?(s.hasLinearVelocity=!0,s.linearVelocity.copy(i.linearVelocity)):s.hasLinearVelocity=!1,i.angularVelocity?(s.hasAngularVelocity=!0,s.angularVelocity.copy(i.angularVelocity)):s.hasAngularVelocity=!1));o!==null&&(r=t.getPose(e.targetRaySpace,n),r===null&&i!==null&&(r=i),r!==null&&(o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,r.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(r.linearVelocity)):o.hasLinearVelocity=!1,r.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(r.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(Nn)))}return o!==null&&(o.visible=r!==null),s!==null&&(s.visible=i!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new L;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},Fn={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},In={h:0,s:0,l:0},Ln={h:0,s:0,l:0};function Rn(e,t,n){return n<0&&(n+=1),n>1&&--n,n<1/6?e+(t-e)*6*n:n<1/2?t:n<2/3?e+(t-e)*6*(2/3-n):e}var R=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let t=e;t&&t.isColor?this.copy(t):typeof t==`number`?this.setHex(t):typeof t==`string`&&this.setStyle(t)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=ot){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,Ht.colorSpaceToWorking(this,t),this}setRGB(e,t,n,r=Ht.workingColorSpace){return this.r=e,this.g=t,this.b=n,Ht.colorSpaceToWorking(this,r),this}setHSL(e,t,n,r=Ht.workingColorSpace){if(e=At(e,1),t=kt(t,0,1),n=kt(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,i=2*n-r;this.r=Rn(i,r,e+1/3),this.g=Rn(i,r,e),this.b=Rn(i,r,e-1/3)}return Ht.colorSpaceToWorking(this,r),this}setStyle(e,t=ot){function n(t){t!==void 0&&parseFloat(t)<1&&N(`Color: Alpha component of `+e+` will be ignored.`)}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let i,a=r[1],o=r[2];switch(a){case`rgb`:case`rgba`:if(i=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(255,parseInt(i[1],10))/255,Math.min(255,parseInt(i[2],10))/255,Math.min(255,parseInt(i[3],10))/255,t);if(i=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(100,parseInt(i[1],10))/100,Math.min(100,parseInt(i[2],10))/100,Math.min(100,parseInt(i[3],10))/100,t);break;case`hsl`:case`hsla`:if(i=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setHSL(parseFloat(i[1])/360,parseFloat(i[2])/100,parseFloat(i[3])/100,t);break;default:N(`Color: Unknown color model `+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){let n=r[1],i=n.length;if(i===3)return this.setRGB(parseInt(n.charAt(0),16)/15,parseInt(n.charAt(1),16)/15,parseInt(n.charAt(2),16)/15,t);if(i===6)return this.setHex(parseInt(n,16),t);N(`Color: Invalid hex color `+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=ot){let n=Fn[e.toLowerCase()];return n===void 0?N(`Color: Unknown color `+e):this.setHex(n,t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Ut(e.r),this.g=Ut(e.g),this.b=Ut(e.b),this}copyLinearToSRGB(e){return this.r=Wt(e.r),this.g=Wt(e.g),this.b=Wt(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=ot){return Ht.workingToColorSpace(zn.copy(this),e),Math.round(kt(zn.r*255,0,255))*65536+Math.round(kt(zn.g*255,0,255))*256+Math.round(kt(zn.b*255,0,255))}getHexString(e=ot){return(`000000`+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=Ht.workingColorSpace){Ht.workingToColorSpace(zn.copy(this),t);let n=zn.r,r=zn.g,i=zn.b,a=Math.max(n,r,i),o=Math.min(n,r,i),s,c,l=(o+a)/2;if(o===a)s=0,c=0;else{let e=a-o;switch(c=l<=.5?e/(a+o):e/(2-a-o),a){case n:s=(r-i)/e+(r<i?6:0);break;case r:s=(i-n)/e+2;break;case i:s=(n-r)/e+4}s/=6}return e.h=s,e.s=c,e.l=l,e}getRGB(e,t=Ht.workingColorSpace){return Ht.workingToColorSpace(zn.copy(this),t),e.r=zn.r,e.g=zn.g,e.b=zn.b,e}getStyle(e=ot){Ht.workingToColorSpace(zn.copy(this),e);let t=zn.r,n=zn.g,r=zn.b;return e===`srgb`?`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(r*255)})`:`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${r.toFixed(3)})`}offsetHSL(e,t,n){return this.getHSL(In),this.setHSL(In.h+e,In.s+t,In.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(In),e.getHSL(Ln);let n=jt(In.h,Ln.h,t),r=jt(In.s,Ln.s,t),i=jt(In.l,Ln.l,t);return this.setHSL(n,r,i),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,r=this.b,i=e.elements;return this.r=i[0]*t+i[3]*n+i[6]*r,this.g=i[1]*t+i[4]*n+i[7]*r,this.b=i[2]*t+i[5]*n+i[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},zn=new R;R.NAMES=Fn;var Bn=class e{constructor(e,t=1,n=1e3){this.isFog=!0,this.name=``,this.color=new R(e),this.near=t,this.far=n}clone(){return new e(this.color,this.near,this.far)}toJSON(){return{type:`Fog`,name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}},Vn=class extends Mn{constructor(){super(),this.isScene=!0,this.type=`Scene`,this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new hn,this.environmentIntensity=1,this.environmentRotation=new hn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}},Hn=new I,Un=new I,Wn=new I,Gn=new I,Kn=new I,qn=new I,Jn=new I,Yn=new I,Xn=new I,Zn=new I,Qn=new $t,$n=new $t,er=new $t,tr=class e{constructor(e=new I,t=new I,n=new I){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,r){r.subVectors(n,t),Hn.subVectors(e,t),r.cross(Hn);let i=r.lengthSq();return i>0?r.multiplyScalar(1/Math.sqrt(i)):r.set(0,0,0)}static getBarycoord(e,t,n,r,i){Hn.subVectors(r,t),Un.subVectors(n,t),Wn.subVectors(e,t);let a=Hn.dot(Hn),o=Hn.dot(Un),s=Hn.dot(Wn),c=Un.dot(Un),l=Un.dot(Wn),u=a*c-o*o;if(u===0)return i.set(0,0,0),null;let d=1/u,f=(c*s-o*l)*d,p=(a*l-o*s)*d;return i.set(1-f-p,p,f)}static containsPoint(e,t,n,r){return this.getBarycoord(e,t,n,r,Gn)!==null&&Gn.x>=0&&Gn.y>=0&&Gn.x+Gn.y<=1}static getInterpolation(e,t,n,r,i,a,o,s){return this.getBarycoord(e,t,n,r,Gn)===null?(s.x=0,s.y=0,`z`in s&&(s.z=0),`w`in s&&(s.w=0),null):(s.setScalar(0),s.addScaledVector(i,Gn.x),s.addScaledVector(a,Gn.y),s.addScaledVector(o,Gn.z),s)}static getInterpolatedAttribute(e,t,n,r,i,a){return Qn.setScalar(0),$n.setScalar(0),er.setScalar(0),Qn.fromBufferAttribute(e,t),$n.fromBufferAttribute(e,n),er.fromBufferAttribute(e,r),a.setScalar(0),a.addScaledVector(Qn,i.x),a.addScaledVector($n,i.y),a.addScaledVector(er,i.z),a}static isFrontFacing(e,t,n,r){return Hn.subVectors(n,t),Un.subVectors(e,t),Hn.cross(Un).dot(r)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,r){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,n,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Hn.subVectors(this.c,this.b),Un.subVectors(this.a,this.b),Hn.cross(Un).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return e.getNormal(this.a,this.b,this.c,t)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,n){return e.getBarycoord(t,this.a,this.b,this.c,n)}getInterpolation(t,n,r,i,a){return e.getInterpolation(t,this.a,this.b,this.c,n,r,i,a)}containsPoint(t){return e.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return e.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,r=this.b,i=this.c,a,o;Kn.subVectors(r,n),qn.subVectors(i,n),Yn.subVectors(e,n);let s=Kn.dot(Yn),c=qn.dot(Yn);if(s<=0&&c<=0)return t.copy(n);Xn.subVectors(e,r);let l=Kn.dot(Xn),u=qn.dot(Xn);if(l>=0&&u<=l)return t.copy(r);let d=s*u-l*c;if(d<=0&&s>=0&&l<=0)return a=s/(s-l),t.copy(n).addScaledVector(Kn,a);Zn.subVectors(e,i);let f=Kn.dot(Zn),p=qn.dot(Zn);if(p>=0&&f<=p)return t.copy(i);let m=f*c-s*p;if(m<=0&&c>=0&&p<=0)return o=c/(c-p),t.copy(n).addScaledVector(qn,o);let h=l*p-f*u;if(h<=0&&u-l>=0&&f-p>=0)return Jn.subVectors(i,r),o=(u-l)/(u-l+(f-p)),t.copy(r).addScaledVector(Jn,o);let g=1/(h+m+d);return a=m*g,o=d*g,t.copy(n).addScaledVector(Kn,a).addScaledVector(qn,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},nr=class{constructor(e=new I(1/0,1/0,1/0),t=new I(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(ir.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(ir.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=ir.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute(`position`);if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let t=0,n=r.count;t<n;t++)e.isMesh===!0?e.getVertexPosition(t,ir):ir.fromBufferAttribute(r,t),ir.applyMatrix4(e.matrixWorld),this.expandByPoint(ir);else e.boundingBox===void 0?(n.boundingBox===null&&n.computeBoundingBox(),ar.copy(n.boundingBox)):(e.boundingBox===null&&e.computeBoundingBox(),ar.copy(e.boundingBox)),ar.applyMatrix4(e.matrixWorld),this.union(ar)}let r=e.children;for(let e=0,n=r.length;e<n;e++)this.expandByObject(r[e],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,ir),ir.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(fr),pr.subVectors(this.max,fr),or.subVectors(e.a,fr),sr.subVectors(e.b,fr),cr.subVectors(e.c,fr),lr.subVectors(sr,or),ur.subVectors(cr,sr),dr.subVectors(or,cr);let t=[0,-lr.z,lr.y,0,-ur.z,ur.y,0,-dr.z,dr.y,lr.z,0,-lr.x,ur.z,0,-ur.x,dr.z,0,-dr.x,-lr.y,lr.x,0,-ur.y,ur.x,0,-dr.y,dr.x,0];return!gr(t,or,sr,cr,pr)||(t=[1,0,0,0,1,0,0,0,1],!gr(t,or,sr,cr,pr))?!1:(mr.crossVectors(lr,ur),t=[mr.x,mr.y,mr.z],gr(t,or,sr,cr,pr))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,ir).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(ir).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()||(rr[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),rr[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),rr[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),rr[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),rr[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),rr[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),rr[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),rr[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(rr)),this}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},rr=[new I,new I,new I,new I,new I,new I,new I,new I],ir=new I,ar=new nr,or=new I,sr=new I,cr=new I,lr=new I,ur=new I,dr=new I,fr=new I,pr=new I,mr=new I,hr=new I;function gr(e,t,n,r,i){for(let a=0,o=e.length-3;a<=o;a+=3){hr.fromArray(e,a);let o=i.x*Math.abs(hr.x)+i.y*Math.abs(hr.y)+i.z*Math.abs(hr.z),s=t.dot(hr),c=n.dot(hr),l=r.dot(hr);if(Math.max(-Math.max(s,c,l),Math.min(s,c,l))>o)return!1}return!0}var _r=new I,vr=new F,yr=0,br=class{constructor(e,t,n=!1){if(Array.isArray(e))throw TypeError(`THREE.BufferAttribute: array should be a Typed Array.`);this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:yr++}),this.name=``,this.array=e,this.itemSize=t,this.count=e===void 0?0:e.length/t,this.normalized=n,this.usage=dt,this.updateRanges=[],this.gpuType=k,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let r=0,i=this.itemSize;r<i;r++)this.array[e+r]=t.array[n+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)vr.fromBufferAttribute(this,t),vr.applyMatrix3(e),this.setXY(t,vr.x,vr.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)_r.fromBufferAttribute(this,t),_r.applyMatrix3(e),this.setXYZ(t,_r.x,_r.y,_r.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)_r.fromBufferAttribute(this,t),_r.applyMatrix4(e),this.setXYZ(t,_r.x,_r.y,_r.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)_r.fromBufferAttribute(this,t),_r.applyNormalMatrix(e),this.setXYZ(t,_r.x,_r.y,_r.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)_r.fromBufferAttribute(this,t),_r.transformDirection(e),this.setXYZ(t,_r.x,_r.y,_r.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=Mt(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=Nt(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Mt(t,this.array)),t}setX(e,t){return this.normalized&&(t=Nt(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Mt(t,this.array)),t}setY(e,t){return this.normalized&&(t=Nt(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Mt(t,this.array)),t}setZ(e,t){return this.normalized&&(t=Nt(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Mt(t,this.array)),t}setW(e,t){return this.normalized&&(t=Nt(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=Nt(t,this.array),n=Nt(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,r){return e*=this.itemSize,this.normalized&&(t=Nt(t,this.array),n=Nt(n,this.array),r=Nt(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this}setXYZW(e,t,n,r,i){return e*=this.itemSize,this.normalized&&(t=Nt(t,this.array),n=Nt(n,this.array),r=Nt(r,this.array),i=Nt(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this.array[e+3]=i,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==``&&(e.name=this.name),this.usage!==35044&&(e.usage=this.usage),e}},xr=class extends br{constructor(e,t,n){super(new Uint16Array(e),t,n)}},Sr=class extends br{constructor(e,t,n){super(new Uint32Array(e),t,n)}},Cr=class extends br{constructor(e,t,n){super(new Float32Array(e),t,n)}},wr=new nr,Tr=new I,Er=new I,Dr=class{constructor(e=new I,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t===void 0?wr.setFromPoints(e).getCenter(n):n.copy(t);let r=0;for(let t=0,i=e.length;t<i;t++)r=Math.max(r,n.distanceToSquared(e[t]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius*=e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Tr.subVectors(e,this.center);let t=Tr.lengthSq();if(t>this.radius*this.radius){let e=Math.sqrt(t),n=(e-this.radius)*.5;this.center.addScaledVector(Tr,n/e),this.radius+=n}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Er.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Tr.copy(e.center).add(Er)),this.expandByPoint(Tr.copy(e.center).sub(Er))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},Or=0,kr=new an,Ar=new Mn,jr=new I,Mr=new nr,Nr=new nr,Pr=new I,Fr=class e extends wt{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Or++}),this.uuid=Ot(),this.name=``,this.type=`BufferGeometry`,this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return this.index=Array.isArray(e)?new(mt(e)?Sr:xr)(e,1):e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let t=new Lt().getNormalMatrix(e);n.applyNormalMatrix(t),n.needsUpdate=!0}let r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return kr.makeRotationFromQuaternion(e),this.applyMatrix4(kr),this}rotateX(e){return kr.makeRotationX(e),this.applyMatrix4(kr),this}rotateY(e){return kr.makeRotationY(e),this.applyMatrix4(kr),this}rotateZ(e){return kr.makeRotationZ(e),this.applyMatrix4(kr),this}translate(e,t,n){return kr.makeTranslation(e,t,n),this.applyMatrix4(kr),this}scale(e,t,n){return kr.makeScale(e,t,n),this.applyMatrix4(kr),this}lookAt(e){return Ar.lookAt(e),Ar.updateMatrix(),this.applyMatrix4(Ar.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(jr).negate(),this.translate(jr.x,jr.y,jr.z),this}setFromPoints(e){let t=this.getAttribute(`position`);if(t===void 0){let t=[];for(let n=0,r=e.length;n<r;n++){let r=e[n];t.push(r.x,r.y,r.z||0)}this.setAttribute(`position`,new Cr(t,3))}else{let n=Math.min(e.length,t.count);for(let r=0;r<n;r++){let n=e[r];t.setXYZ(r,n.x,n.y,n.z||0)}e.length>t.count&&N(`BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.`),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new nr);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute)P(`BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.`,this),this.boundingBox.set(new I(-1/0,-1/0,-1/0),new I(1/0,1/0,1/0));else{if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];Mr.setFromBufferAttribute(n),this.morphTargetsRelative?(Pr.addVectors(this.boundingBox.min,Mr.min),this.boundingBox.expandByPoint(Pr),Pr.addVectors(this.boundingBox.max,Mr.max),this.boundingBox.expandByPoint(Pr)):(this.boundingBox.expandByPoint(Mr.min),this.boundingBox.expandByPoint(Mr.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&P(`BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.`,this)}}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Dr);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute)P(`BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.`,this),this.boundingSphere.set(new I,1/0);else if(e){let n=this.boundingSphere.center;if(Mr.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];Nr.setFromBufferAttribute(n),this.morphTargetsRelative?(Pr.addVectors(Mr.min,Nr.min),Mr.expandByPoint(Pr),Pr.addVectors(Mr.max,Nr.max),Mr.expandByPoint(Pr)):(Mr.expandByPoint(Nr.min),Mr.expandByPoint(Nr.max))}Mr.getCenter(n);let r=0;for(let t=0,i=e.count;t<i;t++)Pr.fromBufferAttribute(e,t),r=Math.max(r,n.distanceToSquared(Pr));if(t)for(let i=0,a=t.length;i<a;i++){let a=t[i],o=this.morphTargetsRelative;for(let t=0,i=a.count;t<i;t++)Pr.fromBufferAttribute(a,t),o&&(jr.fromBufferAttribute(e,t),Pr.add(jr)),r=Math.max(r,n.distanceToSquared(Pr))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&P(`BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.`,this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){P(`BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)`);return}let n=t.position,r=t.normal,i=t.uv;this.hasAttribute(`tangent`)===!1&&this.setAttribute(`tangent`,new br(new Float32Array(4*n.count),4));let a=this.getAttribute(`tangent`),o=[],s=[];for(let e=0;e<n.count;e++)o[e]=new I,s[e]=new I;let c=new I,l=new I,u=new I,d=new F,f=new F,p=new F,m=new I,h=new I;function g(e,t,r){c.fromBufferAttribute(n,e),l.fromBufferAttribute(n,t),u.fromBufferAttribute(n,r),d.fromBufferAttribute(i,e),f.fromBufferAttribute(i,t),p.fromBufferAttribute(i,r),l.sub(c),u.sub(c),f.sub(d),p.sub(d);let a=1/(f.x*p.y-p.x*f.y);isFinite(a)&&(m.copy(l).multiplyScalar(p.y).addScaledVector(u,-f.y).multiplyScalar(a),h.copy(u).multiplyScalar(f.x).addScaledVector(l,-p.x).multiplyScalar(a),o[e].add(m),o[t].add(m),o[r].add(m),s[e].add(h),s[t].add(h),s[r].add(h))}let _=this.groups;_.length===0&&(_=[{start:0,count:e.count}]);for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)g(e.getX(t+0),e.getX(t+1),e.getX(t+2))}let v=new I,y=new I,b=new I,x=new I;function S(e){b.fromBufferAttribute(r,e),x.copy(b);let t=o[e];v.copy(t),v.sub(b.multiplyScalar(b.dot(t))).normalize(),y.crossVectors(x,t);let n=y.dot(s[e])<0?-1:1;a.setXYZW(e,v.x,v.y,v.z,n)}for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)S(e.getX(t+0)),S(e.getX(t+1)),S(e.getX(t+2))}}computeVertexNormals(){let e=this.index,t=this.getAttribute(`position`);if(t!==void 0){let n=this.getAttribute(`normal`);if(n===void 0)n=new br(new Float32Array(t.count*3),3),this.setAttribute(`normal`,n);else for(let e=0,t=n.count;e<t;e++)n.setXYZ(e,0,0,0);let r=new I,i=new I,a=new I,o=new I,s=new I,c=new I,l=new I,u=new I;if(e)for(let d=0,f=e.count;d<f;d+=3){let f=e.getX(d+0),p=e.getX(d+1),m=e.getX(d+2);r.fromBufferAttribute(t,f),i.fromBufferAttribute(t,p),a.fromBufferAttribute(t,m),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),o.fromBufferAttribute(n,f),s.fromBufferAttribute(n,p),c.fromBufferAttribute(n,m),o.add(l),s.add(l),c.add(l),n.setXYZ(f,o.x,o.y,o.z),n.setXYZ(p,s.x,s.y,s.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let e=0,o=t.count;e<o;e+=3)r.fromBufferAttribute(t,e+0),i.fromBufferAttribute(t,e+1),a.fromBufferAttribute(t,e+2),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),n.setXYZ(e+0,l.x,l.y,l.z),n.setXYZ(e+1,l.x,l.y,l.z),n.setXYZ(e+2,l.x,l.y,l.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Pr.fromBufferAttribute(e,t),Pr.normalize(),e.setXYZ(t,Pr.x,Pr.y,Pr.z)}toNonIndexed(){function t(e,t){let n=e.array,r=e.itemSize,i=e.normalized,a=new n.constructor(t.length*r),o=0,s=0;for(let i=0,c=t.length;i<c;i++){o=e.isInterleavedBufferAttribute?t[i]*e.data.stride+e.offset:t[i]*r;for(let e=0;e<r;e++)a[s++]=n[o++]}return new br(a,r,i)}if(this.index===null)return N(`BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.`),this;let n=new e,r=this.index.array,i=this.attributes;for(let e in i){let a=i[e],o=t(a,r);n.setAttribute(e,o)}let a=this.morphAttributes;for(let e in a){let i=[],o=a[e];for(let e=0,n=o.length;e<n;e++){let n=o[e],a=t(n,r);i.push(a)}n.morphAttributes[e]=i}n.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let e=0,t=o.length;e<t;e++){let t=o[e];n.addGroup(t.start,t.count,t.materialIndex)}return n}toJSON(){let e={metadata:{version:4.7,type:`BufferGeometry`,generator:`BufferGeometry.toJSON`}};if(e.uuid=this.uuid,e.type=this.type,this.name!==``&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){let t=this.parameters;for(let n in t)t[n]!==void 0&&(e[n]=t[n]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let t in n){let r=n[t];e.data.attributes[t]=r.toJSON(e.data)}let r={},i=!1;for(let t in this.morphAttributes){let n=this.morphAttributes[t],a=[];for(let t=0,r=n.length;t<r;t++){let r=n[t];a.push(r.toJSON(e.data))}a.length>0&&(r[t]=a,i=!0)}i&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone());let r=e.attributes;for(let e in r){let n=r[e];this.setAttribute(e,n.clone(t))}let i=e.morphAttributes;for(let e in i){let n=[],r=i[e];for(let e=0,i=r.length;e<i;e++)n.push(r[e].clone(t));this.morphAttributes[e]=n}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let e=0,t=a.length;e<t;e++){let t=a[e];this.addGroup(t.start,t.count,t.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let s=e.boundingSphere;return s!==null&&(this.boundingSphere=s.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:`dispose`})}},Ir=0,Lr=class extends wt{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Ir++}),this.uuid=Ot(),this.name=``,this.type=`Material`,this.blending=1,this.side=0,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=204,this.blendDst=205,this.blendEquation=100,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new R(0,0,0),this.blendAlpha=0,this.depthFunc=3,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=519,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=ut,this.stencilZFail=ut,this.stencilZPass=ut,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){N(`Material: parameter '${t}' has value of undefined.`);continue}let r=this[t];r===void 0?N(`Material: '${t}' is not a property of THREE.${this.type}.`):r&&r.isColor?r.set(n):r&&r.isVector3&&n&&n.isVector3?r.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e==`string`;t&&(e={textures:{},images:{}});let n={metadata:{version:4.7,type:`Material`,generator:`Material.toJSON`}};n.uuid=this.uuid,n.type=this.type,this.name!==``&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==1&&(n.blending=this.blending),this.side!==0&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==204&&(n.blendSrc=this.blendSrc),this.blendDst!==205&&(n.blendDst=this.blendDst),this.blendEquation!==100&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==3&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==519&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==7680&&(n.stencilFail=this.stencilFail),this.stencilZFail!==7680&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==7680&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==`round`&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==`round`&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function r(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}if(t){let t=r(e.textures),i=r(e.images);t.length>0&&(n.textures=t),i.length>0&&(n.images=i)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let e=t.length;n=Array(e);for(let r=0;r!==e;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:`dispose`})}set needsUpdate(e){e===!0&&this.version++}},Rr=new I,zr=new I,Br=new I,Vr=new I,Hr=new I,Ur=new I,Wr=new I,Gr=class{constructor(e=new I,t=new I(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Rr)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=Rr.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Rr.copy(this.origin).addScaledVector(this.direction,t),Rr.distanceToSquared(e))}distanceSqToSegment(e,t,n,r){zr.copy(e).add(t).multiplyScalar(.5),Br.copy(t).sub(e).normalize(),Vr.copy(this.origin).sub(zr);let i=e.distanceTo(t)*.5,a=-this.direction.dot(Br),o=Vr.dot(this.direction),s=-Vr.dot(Br),c=Vr.lengthSq(),l=Math.abs(1-a*a),u,d,f,p;if(l>0){if(u=a*s-o,d=a*o-s,p=i*l,u>=0){if(d>=-p){if(d<=p){let e=1/l;u*=e,d*=e,f=u*(u+a*d+2*o)+d*(a*u+d+2*s)+c}else d=i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c}else d=-i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c}else d<=-p?(u=Math.max(0,-(-a*i+o)),d=u>0?-i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c):d<=p?(u=0,d=Math.min(Math.max(-i,-s),i),f=d*(d+2*s)+c):(u=Math.max(0,-(a*i+o)),d=u>0?i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c)}else d=a>0?-i:i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),r&&r.copy(zr).addScaledVector(Br,d),f}intersectSphere(e,t){Rr.subVectors(e.center,this.origin);let n=Rr.dot(this.direction),r=Rr.dot(Rr)-n*n,i=e.radius*e.radius;if(r>i)return null;let a=Math.sqrt(i-r),o=n-a,s=n+a;return s<0?null:o<0?this.at(s,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,r,i,a,o,s,c=1/this.direction.x,l=1/this.direction.y,u=1/this.direction.z,d=this.origin;return c>=0?(n=(e.min.x-d.x)*c,r=(e.max.x-d.x)*c):(n=(e.max.x-d.x)*c,r=(e.min.x-d.x)*c),l>=0?(i=(e.min.y-d.y)*l,a=(e.max.y-d.y)*l):(i=(e.max.y-d.y)*l,a=(e.min.y-d.y)*l),n>a||i>r||((i>n||isNaN(n))&&(n=i),(a<r||isNaN(r))&&(r=a),u>=0?(o=(e.min.z-d.z)*u,s=(e.max.z-d.z)*u):(o=(e.max.z-d.z)*u,s=(e.min.z-d.z)*u),n>s||o>r)||((o>n||n!==n)&&(n=o),(s<r||r!==r)&&(r=s),r<0)?null:this.at(n>=0?n:r,t)}intersectsBox(e){return this.intersectBox(e,Rr)!==null}intersectTriangle(e,t,n,r,i){Hr.subVectors(t,e),Ur.subVectors(n,e),Wr.crossVectors(Hr,Ur);let a=this.direction.dot(Wr),o;if(a>0){if(r)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Vr.subVectors(this.origin,e);let s=o*this.direction.dot(Ur.crossVectors(Vr,Ur));if(s<0)return null;let c=o*this.direction.dot(Hr.cross(Vr));if(c<0||s+c>a)return null;let l=-o*Vr.dot(Wr);return l<0?null:this.at(l/a,i)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Kr=class extends Lr{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type=`MeshBasicMaterial`,this.color=new R(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new hn,this.combine=0,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},qr=new an,Jr=new Gr,Yr=new Dr,Xr=new I,Zr=new I,Qr=new I,$r=new I,ei=new I,ti=new I,ni=new I,ri=new I,z=class extends Mn{constructor(e=new Fr,t=new Kr){super(),this.isMesh=!0,this.type=`Mesh`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}getVertexPosition(e,t){let n=this.geometry,r=n.attributes.position,i=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(r,e);let o=this.morphTargetInfluences;if(i&&o){ti.set(0,0,0);for(let n=0,r=i.length;n<r;n++){let r=o[n],s=i[n];r!==0&&(ei.fromBufferAttribute(s,e),a?ti.addScaledVector(ei,r):ti.addScaledVector(ei.sub(t),r))}t.add(ti)}return t}raycast(e,t){let n=this.geometry,r=this.material,i=this.matrixWorld;r!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Yr.copy(n.boundingSphere),Yr.applyMatrix4(i),Jr.copy(e.ray).recast(e.near),!(Yr.containsPoint(Jr.origin)===!1&&(Jr.intersectSphere(Yr,Xr)===null||Jr.origin.distanceToSquared(Xr)>(e.far-e.near)**2))&&(qr.copy(i).invert(),Jr.copy(e.ray).applyMatrix4(qr),(n.boundingBox===null||Jr.intersectsBox(n.boundingBox)!==!1)&&this._computeIntersections(e,t,Jr)))}_computeIntersections(e,t,n){let r,i=this.geometry,a=this.material,o=i.index,s=i.attributes.position,c=i.attributes.uv,l=i.attributes.uv1,u=i.attributes.normal,d=i.groups,f=i.drawRange;if(o!==null){if(Array.isArray(a))for(let i=0,s=d.length;i<s;i++){let s=d[i],p=a[s.materialIndex],m=Math.max(s.start,f.start),h=Math.min(o.count,Math.min(s.start+s.count,f.start+f.count));for(let i=m,a=h;i<a;i+=3){let a=o.getX(i),d=o.getX(i+1),f=o.getX(i+2);r=ai(this,p,e,n,c,l,u,a,d,f),r&&(r.faceIndex=Math.floor(i/3),r.face.materialIndex=s.materialIndex,t.push(r))}}else{let i=Math.max(0,f.start),s=Math.min(o.count,f.start+f.count);for(let d=i,f=s;d<f;d+=3){let i=o.getX(d),s=o.getX(d+1),f=o.getX(d+2);r=ai(this,a,e,n,c,l,u,i,s,f),r&&(r.faceIndex=Math.floor(d/3),t.push(r))}}}else if(s!==void 0){if(Array.isArray(a))for(let i=0,o=d.length;i<o;i++){let o=d[i],p=a[o.materialIndex],m=Math.max(o.start,f.start),h=Math.min(s.count,Math.min(o.start+o.count,f.start+f.count));for(let i=m,a=h;i<a;i+=3){let a=i,s=i+1,d=i+2;r=ai(this,p,e,n,c,l,u,a,s,d),r&&(r.faceIndex=Math.floor(i/3),r.face.materialIndex=o.materialIndex,t.push(r))}}else{let i=Math.max(0,f.start),o=Math.min(s.count,f.start+f.count);for(let s=i,d=o;s<d;s+=3){let i=s,o=s+1,d=s+2;r=ai(this,a,e,n,c,l,u,i,o,d),r&&(r.faceIndex=Math.floor(s/3),t.push(r))}}}}};function ii(e,t,n,r,i,a,o,s){let c;if(c=t.side===1?r.intersectTriangle(o,a,i,!0,s):r.intersectTriangle(i,a,o,t.side===0,s),c===null)return null;ri.copy(s),ri.applyMatrix4(e.matrixWorld);let l=n.ray.origin.distanceTo(ri);return l<n.near||l>n.far?null:{distance:l,point:ri.clone(),object:e}}function ai(e,t,n,r,i,a,o,s,c,l){e.getVertexPosition(s,Zr),e.getVertexPosition(c,Qr),e.getVertexPosition(l,$r);let u=ii(e,t,n,r,Zr,Qr,$r,ni);if(u){let e=new I;tr.getBarycoord(ni,Zr,Qr,$r,e),i&&(u.uv=tr.getInterpolatedAttribute(i,s,c,l,e,new F)),a&&(u.uv1=tr.getInterpolatedAttribute(a,s,c,l,e,new F)),o&&(u.normal=tr.getInterpolatedAttribute(o,s,c,l,e,new I),u.normal.dot(r.direction)>0&&u.normal.multiplyScalar(-1));let t={a:s,b:c,c:l,normal:new I,materialIndex:0};tr.getNormal(Zr,Qr,$r,t.normal),u.face=t,u.barycoord=e}return u}var oi=class extends Qt{constructor(e=null,t=1,n=1,r,i,a,o,s,c=b,l=b,u,d){super(null,a,o,s,c,l,r,i,u,d),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},si=class extends br{constructor(e,t,n,r=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=r}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}},ci=new an,li=new an,ui=[],di=new nr,fi=new an,pi=new z,mi=new Dr,hi=class extends z{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new si(new Float32Array(n*16),16),this.previousInstanceMatrix=null,this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let e=0;e<n;e++)this.setMatrixAt(e,fi)}computeBoundingBox(){let e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new nr),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,ci),di.copy(e.boundingBox).applyMatrix4(ci),this.boundingBox.union(di)}computeBoundingSphere(){let e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new Dr),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,ci),mi.copy(e.boundingSphere).applyMatrix4(ci),this.boundingSphere.union(mi)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.previousInstanceMatrix!==null&&(this.previousInstanceMatrix=e.previousInstanceMatrix.clone()),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){let n=t.morphTargetInfluences,r=this.morphTexture.source.data.data,i=e*(n.length+1)+1;for(let e=0;e<n.length;e++)n[e]=r[i+e]}raycast(e,t){let n=this.matrixWorld,r=this.count;if(pi.geometry=this.geometry,pi.material=this.material,pi.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),mi.copy(this.boundingSphere),mi.applyMatrix4(n),e.ray.intersectsSphere(mi)!==!1))for(let i=0;i<r;i++){this.getMatrixAt(i,ci),li.multiplyMatrices(n,ci),pi.matrixWorld=li,pi.raycast(e,ui);for(let e=0,n=ui.length;e<n;e++){let n=ui[e];n.instanceId=i,n.object=this,t.push(n)}ui.length=0}}setColorAt(e,t){this.instanceColor===null&&(this.instanceColor=new si(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3)}setMatrixAt(e,t){t.toArray(this.instanceMatrix.array,e*16)}setMorphAt(e,t){let n=t.morphTargetInfluences,r=n.length+1;this.morphTexture===null&&(this.morphTexture=new oi(new Float32Array(r*this.count),r,this.count,me,k));let i=this.morphTexture.source.data.data,a=0;for(let e=0;e<n.length;e++)a+=n[e];let o=this.geometry.morphTargetsRelative?1:1-a,s=r*e;i[s]=o,i.set(n,s+1)}updateMorphTargets(){}dispose(){this.dispatchEvent({type:`dispose`}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}},gi=new I,_i=new I,vi=new Lt,yi=class{constructor(e=new I(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,r){return this.normal.set(e,t,n),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let r=gi.subVectors(n,t).cross(_i.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){let n=e.delta(gi),r=this.normal.dot(n);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let i=-(e.start.dot(this.normal)+this.constant)/r;return i<0||i>1?null:t.copy(e.start).addScaledVector(n,i)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||vi.getNormalMatrix(e),r=this.coplanarPoint(gi).applyMatrix4(e),i=this.normal.applyMatrix3(n).normalize();return this.constant=-r.dot(i),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},bi=new Dr,xi=new F(.5,.5),Si=new I,Ci=class{constructor(e=new yi,t=new yi,n=new yi,r=new yi,i=new yi,a=new yi){this.planes=[e,t,n,r,i,a]}set(e,t,n,r,i,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(r),o[4].copy(i),o[5].copy(a),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=pt,n=!1){let r=this.planes,i=e.elements,a=i[0],o=i[1],s=i[2],c=i[3],l=i[4],u=i[5],d=i[6],f=i[7],p=i[8],m=i[9],h=i[10],g=i[11],_=i[12],v=i[13],y=i[14],b=i[15];if(r[0].setComponents(c-a,f-l,g-p,b-_).normalize(),r[1].setComponents(c+a,f+l,g+p,b+_).normalize(),r[2].setComponents(c+o,f+u,g+m,b+v).normalize(),r[3].setComponents(c-o,f-u,g-m,b-v).normalize(),n)r[4].setComponents(s,d,h,y).normalize(),r[5].setComponents(c-s,f-d,g-h,b-y).normalize();else if(r[4].setComponents(c-s,f-d,g-h,b-y).normalize(),t===2e3)r[5].setComponents(c+s,f+d,g+h,b+y).normalize();else if(t===2001)r[5].setComponents(s,d,h,y).normalize();else throw Error(`THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: `+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),bi.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),bi.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(bi)}intersectsSprite(e){return bi.center.set(0,0,0),bi.radius=.7071067811865476+xi.distanceTo(e.center),bi.applyMatrix4(e.matrixWorld),this.intersectsSphere(bi)}intersectsSphere(e){let t=this.planes,n=e.center,r=-e.radius;for(let e=0;e<6;e++)if(t[e].distanceToPoint(n)<r)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let r=t[n];if(Si.x=r.normal.x>0?e.max.x:e.min.x,Si.y=r.normal.y>0?e.max.y:e.min.y,Si.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(Si)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},wi=class extends Qt{constructor(e=[],t=301,n,r,i,a,o,s,c,l){super(e,t,n,r,i,a,o,s,c,l),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},Ti=class extends Qt{constructor(e,t,n,r,i,a,o,s,c){super(e,t,n,r,i,a,o,s,c),this.isCanvasTexture=!0,this.needsUpdate=!0}},Ei=class extends Qt{constructor(e,t,n=ne,r,i,a,o=b,s=b,c,l=fe,u=1){if(l!==1026&&l!==1027)throw Error(`DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat`);super({width:e,height:t,depth:u},r,i,a,o,s,l,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Jt(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},Di=class extends Ei{constructor(e,t=ne,n=301,r,i,a=b,o=b,s,c=fe){let l={width:e,height:e,depth:1},u=[l,l,l,l,l,l];super(e,e,t,n,r,i,a,o,s,c),this.image=u,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}},Oi=class extends Qt{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}},ki=class e extends Fr{constructor(e=1,t=1,n=1,r=1,i=1,a=1){super(),this.type=`BoxGeometry`,this.parameters={width:e,height:t,depth:n,widthSegments:r,heightSegments:i,depthSegments:a};let o=this;r=Math.floor(r),i=Math.floor(i),a=Math.floor(a);let s=[],c=[],l=[],u=[],d=0,f=0;p(`z`,`y`,`x`,-1,-1,n,t,e,a,i,0),p(`z`,`y`,`x`,1,-1,n,t,-e,a,i,1),p(`x`,`z`,`y`,1,1,e,n,t,r,a,2),p(`x`,`z`,`y`,1,-1,e,n,-t,r,a,3),p(`x`,`y`,`z`,1,-1,e,t,n,r,i,4),p(`x`,`y`,`z`,-1,-1,e,t,-n,r,i,5),this.setIndex(s),this.setAttribute(`position`,new Cr(c,3)),this.setAttribute(`normal`,new Cr(l,3)),this.setAttribute(`uv`,new Cr(u,2));function p(e,t,n,r,i,a,p,m,h,g,_){let v=a/h,y=p/g,b=a/2,x=p/2,S=m/2,C=h+1,w=g+1,T=0,E=0,D=new I;for(let a=0;a<w;a++){let o=a*y-x;for(let s=0;s<C;s++)D[e]=(s*v-b)*r,D[t]=o*i,D[n]=S,c.push(D.x,D.y,D.z),D[e]=0,D[t]=0,D[n]=m>0?1:-1,l.push(D.x,D.y,D.z),u.push(s/h),u.push(1-a/g),T+=1}for(let e=0;e<g;e++)for(let t=0;t<h;t++){let n=d+t+C*e,r=d+t+C*(e+1),i=d+(t+1)+C*(e+1),a=d+(t+1)+C*e;s.push(n,r,a),s.push(r,i,a),E+=6}o.addGroup(f,E,_),f+=E,d+=T}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}},Ai=class e extends Fr{constructor(e=1,t=1,n=4,r=8,i=1){super(),this.type=`CapsuleGeometry`,this.parameters={radius:e,height:t,capSegments:n,radialSegments:r,heightSegments:i},t=Math.max(0,t),n=Math.max(1,Math.floor(n)),r=Math.max(3,Math.floor(r)),i=Math.max(1,Math.floor(i));let a=[],o=[],s=[],c=[],l=t/2,u=Math.PI/2*e,d=t,f=2*u+d,p=n*2+i,m=r+1,h=new I,g=new I;for(let _=0;_<=p;_++){let v=0,y=0,b=0,x=0;if(_<=n){let t=_/n,r=t*Math.PI/2;y=-l-e*Math.cos(r),b=e*Math.sin(r),x=-e*Math.cos(r),v=t*u}else if(_<=n+i){let r=(_-n)/i;y=-l+r*t,b=e,x=0,v=u+r*d}else{let t=(_-n-i)/n,r=t*Math.PI/2;y=l+e*Math.sin(r),b=e*Math.cos(r),x=e*Math.sin(r),v=u+d+t*u}let S=Math.max(0,Math.min(1,v/f)),C=0;_===0?C=.5/r:_===p&&(C=-.5/r);for(let e=0;e<=r;e++){let t=e/r,n=t*Math.PI*2,i=Math.sin(n),a=Math.cos(n);g.x=-b*a,g.y=y,g.z=b*i,o.push(g.x,g.y,g.z),h.set(-b*a,x,b*i),h.normalize(),s.push(h.x,h.y,h.z),c.push(t+C,S)}if(_>0){let e=(_-1)*m;for(let t=0;t<r;t++){let n=e+t,r=e+t+1,i=_*m+t,o=_*m+t+1;a.push(n,r,i),a.push(r,o,i)}}}this.setIndex(a),this.setAttribute(`position`,new Cr(o,3)),this.setAttribute(`normal`,new Cr(s,3)),this.setAttribute(`uv`,new Cr(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.height,t.capSegments,t.radialSegments,t.heightSegments)}},ji=class e extends Fr{constructor(e=1,t=1,n=1,r=32,i=1,a=!1,o=0,s=Math.PI*2){super(),this.type=`CylinderGeometry`,this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:r,heightSegments:i,openEnded:a,thetaStart:o,thetaLength:s};let c=this;r=Math.floor(r),i=Math.floor(i);let l=[],u=[],d=[],f=[],p=0,m=[],h=n/2,g=0;_(),a===!1&&(e>0&&v(!0),t>0&&v(!1)),this.setIndex(l),this.setAttribute(`position`,new Cr(u,3)),this.setAttribute(`normal`,new Cr(d,3)),this.setAttribute(`uv`,new Cr(f,2));function _(){let a=new I,_=new I,v=0,y=(t-e)/n;for(let c=0;c<=i;c++){let l=[],g=c/i,v=g*(t-e)+e;for(let e=0;e<=r;e++){let t=e/r,i=t*s+o,c=Math.sin(i),m=Math.cos(i);_.x=v*c,_.y=-g*n+h,_.z=v*m,u.push(_.x,_.y,_.z),a.set(c,y,m).normalize(),d.push(a.x,a.y,a.z),f.push(t,1-g),l.push(p++)}m.push(l)}for(let n=0;n<r;n++)for(let r=0;r<i;r++){let a=m[r][n],o=m[r+1][n],s=m[r+1][n+1],c=m[r][n+1];(e>0||r!==0)&&(l.push(a,o,c),v+=3),(t>0||r!==i-1)&&(l.push(o,s,c),v+=3)}c.addGroup(g,v,0),g+=v}function v(n){let i=p,a=new F,m=new I,_=0,v=n===!0?e:t,y=n===!0?1:-1;for(let e=1;e<=r;e++)u.push(0,h*y,0),d.push(0,y,0),f.push(.5,.5),p++;let b=p;for(let e=0;e<=r;e++){let t=e/r*s+o,n=Math.cos(t),i=Math.sin(t);m.x=v*i,m.y=h*y,m.z=v*n,u.push(m.x,m.y,m.z),d.push(0,y,0),a.x=n*.5+.5,a.y=i*.5*y+.5,f.push(a.x,a.y),p++}for(let e=0;e<r;e++){let t=i+e,r=b+e;n===!0?l.push(r,r+1,t):l.push(r+1,r,t),_+=3}c.addGroup(g,_,n===!0?1:2),g+=_}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},Mi=class e extends ji{constructor(e=1,t=1,n=32,r=1,i=!1,a=0,o=Math.PI*2){super(0,e,t,n,r,i,a,o),this.type=`ConeGeometry`,this.parameters={radius:e,height:t,radialSegments:n,heightSegments:r,openEnded:i,thetaStart:a,thetaLength:o}}static fromJSON(t){return new e(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},Ni=class e extends Fr{constructor(e=[],t=[],n=1,r=0){super(),this.type=`PolyhedronGeometry`,this.parameters={vertices:e,indices:t,radius:n,detail:r};let i=[],a=[];o(r),c(n),l(),this.setAttribute(`position`,new Cr(i,3)),this.setAttribute(`normal`,new Cr(i.slice(),3)),this.setAttribute(`uv`,new Cr(a,2)),r===0?this.computeVertexNormals():this.normalizeNormals();function o(e){let n=new I,r=new I,i=new I;for(let a=0;a<t.length;a+=3)f(t[a+0],n),f(t[a+1],r),f(t[a+2],i),s(n,r,i,e)}function s(e,t,n,r){let i=r+1,a=[];for(let r=0;r<=i;r++){a[r]=[];let o=e.clone().lerp(n,r/i),s=t.clone().lerp(n,r/i),c=i-r;for(let e=0;e<=c;e++)e===0&&r===i?a[r][e]=o:a[r][e]=o.clone().lerp(s,e/c)}for(let e=0;e<i;e++)for(let t=0;t<2*(i-e)-1;t++){let n=Math.floor(t/2);t%2==0?(d(a[e][n+1]),d(a[e+1][n]),d(a[e][n])):(d(a[e][n+1]),d(a[e+1][n+1]),d(a[e+1][n]))}}function c(e){let t=new I;for(let n=0;n<i.length;n+=3)t.x=i[n+0],t.y=i[n+1],t.z=i[n+2],t.normalize().multiplyScalar(e),i[n+0]=t.x,i[n+1]=t.y,i[n+2]=t.z}function l(){let e=new I;for(let t=0;t<i.length;t+=3){e.x=i[t+0],e.y=i[t+1],e.z=i[t+2];let n=h(e)/2/Math.PI+.5,r=g(e)/Math.PI+.5;a.push(n,1-r)}p(),u()}function u(){for(let e=0;e<a.length;e+=6){let t=a[e+0],n=a[e+2],r=a[e+4];Math.max(t,n,r)>.9&&Math.min(t,n,r)<.1&&(t<.2&&(a[e+0]+=1),n<.2&&(a[e+2]+=1),r<.2&&(a[e+4]+=1))}}function d(e){i.push(e.x,e.y,e.z)}function f(t,n){let r=t*3;n.x=e[r+0],n.y=e[r+1],n.z=e[r+2]}function p(){let e=new I,t=new I,n=new I,r=new I,o=new F,s=new F,c=new F;for(let l=0,u=0;l<i.length;l+=9,u+=6){e.set(i[l+0],i[l+1],i[l+2]),t.set(i[l+3],i[l+4],i[l+5]),n.set(i[l+6],i[l+7],i[l+8]),o.set(a[u+0],a[u+1]),s.set(a[u+2],a[u+3]),c.set(a[u+4],a[u+5]),r.copy(e).add(t).add(n).divideScalar(3);let d=h(r);m(o,u+0,e,d),m(s,u+2,t,d),m(c,u+4,n,d)}}function m(e,t,n,r){r<0&&e.x===1&&(a[t]=e.x-1),n.x===0&&n.z===0&&(a[t]=r/2/Math.PI+.5)}function h(e){return Math.atan2(e.z,-e.x)}function g(e){return Math.atan2(-e.y,Math.sqrt(e.x*e.x+e.z*e.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.vertices,t.indices,t.radius,t.detail)}},Pi=class{constructor(){this.type=`Curve`,this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){N(`Curve: .getPoint() not implemented.`)}getPointAt(e,t){let n=this.getUtoTmapping(e);return this.getPoint(n,t)}getPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return t}getSpacedPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPointAt(n/e));return t}getLength(){let e=this.getLengths();return e[e.length-1]}getLengths(e=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===e+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;let t=[],n,r=this.getPoint(0),i=0;t.push(0);for(let a=1;a<=e;a++)n=this.getPoint(a/e),i+=n.distanceTo(r),t.push(i),r=n;return this.cacheArcLengths=t,t}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(e,t=null){let n=this.getLengths(),r=0,i=n.length,a;a=t||e*n[i-1];let o=0,s=i-1,c;for(;o<=s;)if(r=Math.floor(o+(s-o)/2),c=n[r]-a,c<0)o=r+1;else if(c>0)s=r-1;else{s=r;break}if(r=s,n[r]===a)return r/(i-1);let l=n[r],u=n[r+1]-l,d=(a-l)/u;return(r+d)/(i-1)}getTangent(e,t){let n=1e-4,r=e-n,i=e+n;r<0&&(r=0),i>1&&(i=1);let a=this.getPoint(r),o=this.getPoint(i),s=t||(a.isVector2?new F:new I);return s.copy(o).sub(a).normalize(),s}getTangentAt(e,t){let n=this.getUtoTmapping(e);return this.getTangent(n,t)}computeFrenetFrames(e,t=!1){let n=new I,r=[],i=[],a=[],o=new I,s=new an;for(let t=0;t<=e;t++){let n=t/e;r[t]=this.getTangentAt(n,new I)}i[0]=new I,a[0]=new I;let c=Number.MAX_VALUE,l=Math.abs(r[0].x),u=Math.abs(r[0].y),d=Math.abs(r[0].z);l<=c&&(c=l,n.set(1,0,0)),u<=c&&(c=u,n.set(0,1,0)),d<=c&&n.set(0,0,1),o.crossVectors(r[0],n).normalize(),i[0].crossVectors(r[0],o),a[0].crossVectors(r[0],i[0]);for(let t=1;t<=e;t++){if(i[t]=i[t-1].clone(),a[t]=a[t-1].clone(),o.crossVectors(r[t-1],r[t]),o.length()>2**-52){o.normalize();let e=Math.acos(kt(r[t-1].dot(r[t]),-1,1));i[t].applyMatrix4(s.makeRotationAxis(o,e))}a[t].crossVectors(r[t],i[t])}if(t===!0){let t=Math.acos(kt(i[0].dot(i[e]),-1,1));t/=e,r[0].dot(o.crossVectors(i[0],i[e]))>0&&(t=-t);for(let n=1;n<=e;n++)i[n].applyMatrix4(s.makeRotationAxis(r[n],t*n)),a[n].crossVectors(r[n],i[n])}return{tangents:r,normals:i,binormals:a}}clone(){return new this.constructor().copy(this)}copy(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}toJSON(){let e={metadata:{version:4.7,type:`Curve`,generator:`Curve.toJSON`}};return e.arcLengthDivisions=this.arcLengthDivisions,e.type=this.type,e}fromJSON(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}},Fi=class extends Pi{constructor(e=0,t=0,n=1,r=1,i=0,a=Math.PI*2,o=!1,s=0){super(),this.isEllipseCurve=!0,this.type=`EllipseCurve`,this.aX=e,this.aY=t,this.xRadius=n,this.yRadius=r,this.aStartAngle=i,this.aEndAngle=a,this.aClockwise=o,this.aRotation=s}getPoint(e,t=new F){let n=t,r=Math.PI*2,i=this.aEndAngle-this.aStartAngle,a=Math.abs(i)<2**-52;for(;i<0;)i+=r;for(;i>r;)i-=r;i<2**-52&&(i=a?0:r),this.aClockwise===!0&&!a&&(i===r?i=-r:i-=r);let o=this.aStartAngle+e*i,s=this.aX+this.xRadius*Math.cos(o),c=this.aY+this.yRadius*Math.sin(o);if(this.aRotation!==0){let e=Math.cos(this.aRotation),t=Math.sin(this.aRotation),n=s-this.aX,r=c-this.aY;s=n*e-r*t+this.aX,c=n*t+r*e+this.aY}return n.set(s,c)}copy(e){return super.copy(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}toJSON(){let e=super.toJSON();return e.aX=this.aX,e.aY=this.aY,e.xRadius=this.xRadius,e.yRadius=this.yRadius,e.aStartAngle=this.aStartAngle,e.aEndAngle=this.aEndAngle,e.aClockwise=this.aClockwise,e.aRotation=this.aRotation,e}fromJSON(e){return super.fromJSON(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}},Ii=class extends Fi{constructor(e,t,n,r,i,a){super(e,t,n,n,r,i,a),this.isArcCurve=!0,this.type=`ArcCurve`}};function Li(){let e=0,t=0,n=0,r=0;function i(i,a,o,s){e=i,t=o,n=-3*i+3*a-2*o-s,r=2*i-2*a+o+s}return{initCatmullRom:function(e,t,n,r,a){i(t,n,a*(n-e),a*(r-t))},initNonuniformCatmullRom:function(e,t,n,r,a,o,s){let c=(t-e)/a-(n-e)/(a+o)+(n-t)/o,l=(n-t)/o-(r-t)/(o+s)+(r-n)/s;c*=o,l*=o,i(t,n,c,l)},calc:function(i){let a=i*i,o=a*i;return e+t*i+n*a+r*o}}}var Ri=new I,zi=new Li,Bi=new Li,Vi=new Li,Hi=class extends Pi{constructor(e=[],t=!1,n=`centripetal`,r=.5){super(),this.isCatmullRomCurve3=!0,this.type=`CatmullRomCurve3`,this.points=e,this.closed=t,this.curveType=n,this.tension=r}getPoint(e,t=new I){let n=t,r=this.points,i=r.length,a=(i-+!this.closed)*e,o=Math.floor(a),s=a-o;this.closed?o+=o>0?0:(Math.floor(Math.abs(o)/i)+1)*i:s===0&&o===i-1&&(o=i-2,s=1);let c,l;this.closed||o>0?c=r[(o-1)%i]:(Ri.subVectors(r[0],r[1]).add(r[0]),c=Ri);let u=r[o%i],d=r[(o+1)%i];if(this.closed||o+2<i?l=r[(o+2)%i]:(Ri.subVectors(r[i-1],r[i-2]).add(r[i-1]),l=Ri),this.curveType===`centripetal`||this.curveType===`chordal`){let e=this.curveType===`chordal`?.5:.25,t=c.distanceToSquared(u)**+e,n=u.distanceToSquared(d)**+e,r=d.distanceToSquared(l)**+e;n<1e-4&&(n=1),t<1e-4&&(t=n),r<1e-4&&(r=n),zi.initNonuniformCatmullRom(c.x,u.x,d.x,l.x,t,n,r),Bi.initNonuniformCatmullRom(c.y,u.y,d.y,l.y,t,n,r),Vi.initNonuniformCatmullRom(c.z,u.z,d.z,l.z,t,n,r)}else this.curveType===`catmullrom`&&(zi.initCatmullRom(c.x,u.x,d.x,l.x,this.tension),Bi.initCatmullRom(c.y,u.y,d.y,l.y,this.tension),Vi.initCatmullRom(c.z,u.z,d.z,l.z,this.tension));return n.set(zi.calc(s),Bi.calc(s),Vi.calc(s)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(n.clone())}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let n=this.points[t];e.points.push(n.toArray())}return e.closed=this.closed,e.curveType=this.curveType,e.tension=this.tension,e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(new I().fromArray(n))}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}};function Ui(e,t,n,r,i){let a=(r-t)*.5,o=(i-n)*.5,s=e*e,c=e*s;return(2*n-2*r+a+o)*c+(-3*n+3*r-2*a-o)*s+a*e+n}function Wi(e,t){let n=1-e;return n*n*t}function Gi(e,t){return 2*(1-e)*e*t}function Ki(e,t){return e*e*t}function qi(e,t,n,r){return Wi(e,t)+Gi(e,n)+Ki(e,r)}function Ji(e,t){let n=1-e;return n*n*n*t}function Yi(e,t){let n=1-e;return 3*n*n*e*t}function Xi(e,t){return 3*(1-e)*e*e*t}function Zi(e,t){return e*e*e*t}function Qi(e,t,n,r,i){return Ji(e,t)+Yi(e,n)+Xi(e,r)+Zi(e,i)}var $i=class extends Pi{constructor(e=new F,t=new F,n=new F,r=new F){super(),this.isCubicBezierCurve=!0,this.type=`CubicBezierCurve`,this.v0=e,this.v1=t,this.v2=n,this.v3=r}getPoint(e,t=new F){let n=t,r=this.v0,i=this.v1,a=this.v2,o=this.v3;return n.set(Qi(e,r.x,i.x,a.x,o.x),Qi(e,r.y,i.y,a.y,o.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}},ea=class extends Pi{constructor(e=new I,t=new I,n=new I,r=new I){super(),this.isCubicBezierCurve3=!0,this.type=`CubicBezierCurve3`,this.v0=e,this.v1=t,this.v2=n,this.v3=r}getPoint(e,t=new I){let n=t,r=this.v0,i=this.v1,a=this.v2,o=this.v3;return n.set(Qi(e,r.x,i.x,a.x,o.x),Qi(e,r.y,i.y,a.y,o.y),Qi(e,r.z,i.z,a.z,o.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}},ta=class extends Pi{constructor(e=new F,t=new F){super(),this.isLineCurve=!0,this.type=`LineCurve`,this.v1=e,this.v2=t}getPoint(e,t=new F){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new F){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},na=class extends Pi{constructor(e=new I,t=new I){super(),this.isLineCurve3=!0,this.type=`LineCurve3`,this.v1=e,this.v2=t}getPoint(e,t=new I){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new I){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},ra=class extends Pi{constructor(e=new F,t=new F,n=new F){super(),this.isQuadraticBezierCurve=!0,this.type=`QuadraticBezierCurve`,this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new F){let n=t,r=this.v0,i=this.v1,a=this.v2;return n.set(qi(e,r.x,i.x,a.x),qi(e,r.y,i.y,a.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},ia=class extends Pi{constructor(e=new I,t=new I,n=new I){super(),this.isQuadraticBezierCurve3=!0,this.type=`QuadraticBezierCurve3`,this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new I){let n=t,r=this.v0,i=this.v1,a=this.v2;return n.set(qi(e,r.x,i.x,a.x),qi(e,r.y,i.y,a.y),qi(e,r.z,i.z,a.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},aa=class extends Pi{constructor(e=[]){super(),this.isSplineCurve=!0,this.type=`SplineCurve`,this.points=e}getPoint(e,t=new F){let n=t,r=this.points,i=(r.length-1)*e,a=Math.floor(i),o=i-a,s=r[a===0?a:a-1],c=r[a],l=r[a>r.length-2?r.length-1:a+1],u=r[a>r.length-3?r.length-1:a+2];return n.set(Ui(o,s.x,c.x,l.x,u.x),Ui(o,s.y,c.y,l.y,u.y)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(n.clone())}return this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let n=this.points[t];e.points.push(n.toArray())}return e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(new F().fromArray(n))}return this}},oa=Object.freeze({__proto__:null,ArcCurve:Ii,CatmullRomCurve3:Hi,CubicBezierCurve:$i,CubicBezierCurve3:ea,EllipseCurve:Fi,LineCurve:ta,LineCurve3:na,QuadraticBezierCurve:ra,QuadraticBezierCurve3:ia,SplineCurve:aa}),sa=class extends Pi{constructor(){super(),this.type=`CurvePath`,this.curves=[],this.autoClose=!1}add(e){this.curves.push(e)}closePath(){let e=this.curves[0].getPoint(0),t=this.curves[this.curves.length-1].getPoint(1);if(!e.equals(t)){let n=e.isVector2===!0?`LineCurve`:`LineCurve3`;this.curves.push(new oa[n](t,e))}return this}getPoint(e,t){let n=e*this.getLength(),r=this.getCurveLengths(),i=0;for(;i<r.length;){if(r[i]>=n){let e=r[i]-n,a=this.curves[i],o=a.getLength(),s=o===0?0:1-e/o;return a.getPointAt(s,t)}i++}return null}getLength(){let e=this.getCurveLengths();return e[e.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;let e=[],t=0;for(let n=0,r=this.curves.length;n<r;n++)t+=this.curves[n].getLength(),e.push(t);return this.cacheLengths=e,e}getSpacedPoints(e=40){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return this.autoClose&&t.push(t[0]),t}getPoints(e=12){let t=[],n;for(let r=0,i=this.curves;r<i.length;r++){let a=i[r],o=a.isEllipseCurve?e*2:a.isLineCurve||a.isLineCurve3?1:a.isSplineCurve?e*a.points.length:e,s=a.getPoints(o);for(let e=0;e<s.length;e++){let r=s[e];n&&n.equals(r)||(t.push(r),n=r)}}return this.autoClose&&t.length>1&&!t[t.length-1].equals(t[0])&&t.push(t[0]),t}copy(e){super.copy(e),this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let n=e.curves[t];this.curves.push(n.clone())}return this.autoClose=e.autoClose,this}toJSON(){let e=super.toJSON();e.autoClose=this.autoClose,e.curves=[];for(let t=0,n=this.curves.length;t<n;t++){let n=this.curves[t];e.curves.push(n.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.autoClose=e.autoClose,this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let n=e.curves[t];this.curves.push(new oa[n.type]().fromJSON(n))}return this}},ca=class extends sa{constructor(e){super(),this.type=`Path`,this.currentPoint=new F,e&&this.setFromPoints(e)}setFromPoints(e){this.moveTo(e[0].x,e[0].y);for(let t=1,n=e.length;t<n;t++)this.lineTo(e[t].x,e[t].y);return this}moveTo(e,t){return this.currentPoint.set(e,t),this}lineTo(e,t){let n=new ta(this.currentPoint.clone(),new F(e,t));return this.curves.push(n),this.currentPoint.set(e,t),this}quadraticCurveTo(e,t,n,r){let i=new ra(this.currentPoint.clone(),new F(e,t),new F(n,r));return this.curves.push(i),this.currentPoint.set(n,r),this}bezierCurveTo(e,t,n,r,i,a){let o=new $i(this.currentPoint.clone(),new F(e,t),new F(n,r),new F(i,a));return this.curves.push(o),this.currentPoint.set(i,a),this}splineThru(e){let t=new aa([this.currentPoint.clone()].concat(e));return this.curves.push(t),this.currentPoint.copy(e[e.length-1]),this}arc(e,t,n,r,i,a){let o=this.currentPoint.x,s=this.currentPoint.y;return this.absarc(e+o,t+s,n,r,i,a),this}absarc(e,t,n,r,i,a){return this.absellipse(e,t,n,n,r,i,a),this}ellipse(e,t,n,r,i,a,o,s){let c=this.currentPoint.x,l=this.currentPoint.y;return this.absellipse(e+c,t+l,n,r,i,a,o,s),this}absellipse(e,t,n,r,i,a,o,s){let c=new Fi(e,t,n,r,i,a,o,s);if(this.curves.length>0){let e=c.getPoint(0);e.equals(this.currentPoint)||this.lineTo(e.x,e.y)}this.curves.push(c);let l=c.getPoint(1);return this.currentPoint.copy(l),this}copy(e){return super.copy(e),this.currentPoint.copy(e.currentPoint),this}toJSON(){let e=super.toJSON();return e.currentPoint=this.currentPoint.toArray(),e}fromJSON(e){return super.fromJSON(e),this.currentPoint.fromArray(e.currentPoint),this}},la=class extends ca{constructor(e){super(e),this.uuid=Ot(),this.type=`Shape`,this.holes=[]}getPointsHoles(e){let t=[];for(let n=0,r=this.holes.length;n<r;n++)t[n]=this.holes[n].getPoints(e);return t}extractPoints(e){return{shape:this.getPoints(e),holes:this.getPointsHoles(e)}}copy(e){super.copy(e),this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){let n=e.holes[t];this.holes.push(n.clone())}return this}toJSON(){let e=super.toJSON();e.uuid=this.uuid,e.holes=[];for(let t=0,n=this.holes.length;t<n;t++){let n=this.holes[t];e.holes.push(n.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.uuid=e.uuid,this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){let n=e.holes[t];this.holes.push(new ca().fromJSON(n))}return this}};function ua(e,t,n=2){let r=t&&t.length,i=r?t[0]*n:e.length,a=da(e,0,i,n,!0),o=[];if(!a||a.next===a.prev)return o;let s,c,l;if(r&&(a=va(e,t,a,n)),e.length>80*n){s=e[0],c=e[1];let t=s,r=c;for(let a=n;a<i;a+=n){let n=e[a],i=e[a+1];n<s&&(s=n),i<c&&(c=i),n>t&&(t=n),i>r&&(r=i)}l=Math.max(t-s,r-c),l=l===0?0:32767/l}return pa(a,o,n,s,c,l,0),o}function da(e,t,n,r,i){let a;if(i===Ha(e,t,n,r)>0)for(let i=t;i<n;i+=r)a=za(i/r|0,e[i],e[i+1],a);else for(let i=n-r;i>=t;i-=r)a=za(i/r|0,e[i],e[i+1],a);return a&&ja(a,a.next)&&(Ba(a),a=a.next),a}function fa(e,t){if(!e)return e;t||=e;let n=e,r;do if(r=!1,!n.steiner&&(ja(n,n.next)||Aa(n.prev,n,n.next)===0)){if(Ba(n),n=t=n.prev,n===n.next)break;r=!0}else n=n.next;while(r||n!==t);return t}function pa(e,t,n,r,i,a,o){if(!e)return;!o&&a&&Ca(e,r,i,a);let s=e;for(;e.prev!==e.next;){let c=e.prev,l=e.next;if(a?ha(e,r,i,a):ma(e))t.push(c.i,e.i,l.i),Ba(e),e=l.next,s=l.next;else if(e=l,e===s){o?o===1?(e=ga(fa(e),t),pa(e,t,n,r,i,a,2)):o===2&&_a(e,t,n,r,i,a):pa(fa(e),t,n,r,i,a,1);break}}}function ma(e){let t=e.prev,n=e,r=e.next;if(Aa(t,n,r)>=0)return!1;let i=t.x,a=n.x,o=r.x,s=t.y,c=n.y,l=r.y,u=Math.min(i,a,o),d=Math.min(s,c,l),f=Math.max(i,a,o),p=Math.max(s,c,l),m=r.next;for(;m!==t;){if(m.x>=u&&m.x<=f&&m.y>=d&&m.y<=p&&Oa(i,s,a,c,o,l,m.x,m.y)&&Aa(m.prev,m,m.next)>=0)return!1;m=m.next}return!0}function ha(e,t,n,r){let i=e.prev,a=e,o=e.next;if(Aa(i,a,o)>=0)return!1;let s=i.x,c=a.x,l=o.x,u=i.y,d=a.y,f=o.y,p=Math.min(s,c,l),m=Math.min(u,d,f),h=Math.max(s,c,l),g=Math.max(u,d,f),_=Ta(p,m,t,n,r),v=Ta(h,g,t,n,r),y=e.prevZ,b=e.nextZ;for(;y&&y.z>=_&&b&&b.z<=v;){if(y.x>=p&&y.x<=h&&y.y>=m&&y.y<=g&&y!==i&&y!==o&&Oa(s,u,c,d,l,f,y.x,y.y)&&Aa(y.prev,y,y.next)>=0||(y=y.prevZ,b.x>=p&&b.x<=h&&b.y>=m&&b.y<=g&&b!==i&&b!==o&&Oa(s,u,c,d,l,f,b.x,b.y)&&Aa(b.prev,b,b.next)>=0))return!1;b=b.nextZ}for(;y&&y.z>=_;){if(y.x>=p&&y.x<=h&&y.y>=m&&y.y<=g&&y!==i&&y!==o&&Oa(s,u,c,d,l,f,y.x,y.y)&&Aa(y.prev,y,y.next)>=0)return!1;y=y.prevZ}for(;b&&b.z<=v;){if(b.x>=p&&b.x<=h&&b.y>=m&&b.y<=g&&b!==i&&b!==o&&Oa(s,u,c,d,l,f,b.x,b.y)&&Aa(b.prev,b,b.next)>=0)return!1;b=b.nextZ}return!0}function ga(e,t){let n=e;do{let r=n.prev,i=n.next.next;!ja(r,i)&&Ma(r,n,n.next,i)&&Ia(r,i)&&Ia(i,r)&&(t.push(r.i,n.i,i.i),Ba(n),Ba(n.next),n=e=i),n=n.next}while(n!==e);return fa(n)}function _a(e,t,n,r,i,a){let o=e;do{let e=o.next.next;for(;e!==o.prev;){if(o.i!==e.i&&ka(o,e)){let s=Ra(o,e);o=fa(o,o.next),s=fa(s,s.next),pa(o,t,n,r,i,a,0),pa(s,t,n,r,i,a,0);return}e=e.next}o=o.next}while(o!==e)}function va(e,t,n,r){let i=[];for(let n=0,a=t.length;n<a;n++){let o=da(e,t[n]*r,n<a-1?t[n+1]*r:e.length,r,!1);o===o.next&&(o.steiner=!0),i.push(Ea(o))}i.sort(ya);for(let e=0;e<i.length;e++)n=ba(i[e],n);return n}function ya(e,t){let n=e.x-t.x;return n===0&&(n=e.y-t.y,n===0&&(n=(e.next.y-e.y)/(e.next.x-e.x)-(t.next.y-t.y)/(t.next.x-t.x))),n}function ba(e,t){let n=xa(e,t);if(!n)return t;let r=Ra(n,e);return fa(r,r.next),fa(n,n.next)}function xa(e,t){let n=t,r=e.x,i=e.y,a=-1/0,o;if(ja(e,n))return n;do{if(ja(e,n.next))return n.next;if(i<=n.y&&i>=n.next.y&&n.next.y!==n.y){let e=n.x+(i-n.y)*(n.next.x-n.x)/(n.next.y-n.y);if(e<=r&&e>a&&(a=e,o=n.x<n.next.x?n:n.next,e===r))return o}n=n.next}while(n!==t);if(!o)return null;let s=o,c=o.x,l=o.y,u=1/0;n=o;do{if(r>=n.x&&n.x>=c&&r!==n.x&&Da(i<l?r:a,i,c,l,i<l?a:r,i,n.x,n.y)){let t=Math.abs(i-n.y)/(r-n.x);Ia(n,e)&&(t<u||t===u&&(n.x>o.x||n.x===o.x&&Sa(o,n)))&&(o=n,u=t)}n=n.next}while(n!==s);return o}function Sa(e,t){return Aa(e.prev,e,t.prev)<0&&Aa(t.next,e,e.next)<0}function Ca(e,t,n,r){let i=e;do i.z===0&&(i.z=Ta(i.x,i.y,t,n,r)),i.prevZ=i.prev,i.nextZ=i.next,i=i.next;while(i!==e);i.prevZ.nextZ=null,i.prevZ=null,wa(i)}function wa(e){let t,n=1;do{let r=e,i;e=null;let a=null;for(t=0;r;){t++;let o=r,s=0;for(let e=0;e<n&&(s++,o=o.nextZ,o);e++);let c=n;for(;s>0||c>0&&o;)s!==0&&(c===0||!o||r.z<=o.z)?(i=r,r=r.nextZ,s--):(i=o,o=o.nextZ,c--),a?a.nextZ=i:e=i,i.prevZ=a,a=i;r=o}a.nextZ=null,n*=2}while(t>1);return e}function Ta(e,t,n,r,i){return e=(e-n)*i|0,t=(t-r)*i|0,e=(e|e<<8)&16711935,e=(e|e<<4)&252645135,e=(e|e<<2)&858993459,e=(e|e<<1)&1431655765,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,e|t<<1}function Ea(e){let t=e,n=e;do(t.x<n.x||t.x===n.x&&t.y<n.y)&&(n=t),t=t.next;while(t!==e);return n}function Da(e,t,n,r,i,a,o,s){return(i-o)*(t-s)>=(e-o)*(a-s)&&(e-o)*(r-s)>=(n-o)*(t-s)&&(n-o)*(a-s)>=(i-o)*(r-s)}function Oa(e,t,n,r,i,a,o,s){return(e!==o||t!==s)&&Da(e,t,n,r,i,a,o,s)}function ka(e,t){return e.next.i!==t.i&&e.prev.i!==t.i&&!Fa(e,t)&&(Ia(e,t)&&Ia(t,e)&&La(e,t)&&(Aa(e.prev,e,t.prev)||Aa(e,t.prev,t))||ja(e,t)&&Aa(e.prev,e,e.next)>0&&Aa(t.prev,t,t.next)>0)}function Aa(e,t,n){return(t.y-e.y)*(n.x-t.x)-(t.x-e.x)*(n.y-t.y)}function ja(e,t){return e.x===t.x&&e.y===t.y}function Ma(e,t,n,r){let i=Pa(Aa(e,t,n)),a=Pa(Aa(e,t,r)),o=Pa(Aa(n,r,e)),s=Pa(Aa(n,r,t));return!!(i!==a&&o!==s||i===0&&Na(e,n,t)||a===0&&Na(e,r,t)||o===0&&Na(n,e,r)||s===0&&Na(n,t,r))}function Na(e,t,n){return t.x<=Math.max(e.x,n.x)&&t.x>=Math.min(e.x,n.x)&&t.y<=Math.max(e.y,n.y)&&t.y>=Math.min(e.y,n.y)}function Pa(e){return e>0?1:e<0?-1:0}function Fa(e,t){let n=e;do{if(n.i!==e.i&&n.next.i!==e.i&&n.i!==t.i&&n.next.i!==t.i&&Ma(n,n.next,e,t))return!0;n=n.next}while(n!==e);return!1}function Ia(e,t){return Aa(e.prev,e,e.next)<0?Aa(e,t,e.next)>=0&&Aa(e,e.prev,t)>=0:Aa(e,t,e.prev)<0||Aa(e,e.next,t)<0}function La(e,t){let n=e,r=!1,i=(e.x+t.x)/2,a=(e.y+t.y)/2;do n.y>a!=n.next.y>a&&n.next.y!==n.y&&i<(n.next.x-n.x)*(a-n.y)/(n.next.y-n.y)+n.x&&(r=!r),n=n.next;while(n!==e);return r}function Ra(e,t){let n=Va(e.i,e.x,e.y),r=Va(t.i,t.x,t.y),i=e.next,a=t.prev;return e.next=t,t.prev=e,n.next=i,i.prev=n,r.next=n,n.prev=r,a.next=r,r.prev=a,r}function za(e,t,n,r){let i=Va(e,t,n);return r?(i.next=r.next,i.prev=r,r.next.prev=i,r.next=i):(i.prev=i,i.next=i),i}function Ba(e){e.next.prev=e.prev,e.prev.next=e.next,e.prevZ&&(e.prevZ.nextZ=e.nextZ),e.nextZ&&(e.nextZ.prevZ=e.prevZ)}function Va(e,t,n){return{i:e,x:t,y:n,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}function Ha(e,t,n,r){let i=0;for(let a=t,o=n-r;a<n;a+=r)i+=(e[o]-e[a])*(e[a+1]+e[o+1]),o=a;return i}var Ua=class{static triangulate(e,t,n=2){return ua(e,t,n)}},Wa=class e{static area(e){let t=e.length,n=0;for(let r=t-1,i=0;i<t;r=i++)n+=e[r].x*e[i].y-e[i].x*e[r].y;return n*.5}static isClockWise(t){return e.area(t)<0}static triangulateShape(e,t){let n=[],r=[],i=[];Ga(e),Ka(n,e);let a=e.length;t.forEach(Ga);for(let e=0;e<t.length;e++)r.push(a),a+=t[e].length,Ka(n,t[e]);let o=Ua.triangulate(n,r);for(let e=0;e<o.length;e+=3)i.push(o.slice(e,e+3));return i}};function Ga(e){let t=e.length;t>2&&e[t-1].equals(e[0])&&e.pop()}function Ka(e,t){for(let n=0;n<t.length;n++)e.push(t[n].x),e.push(t[n].y)}var qa=class e extends Fr{constructor(e=new la([new F(.5,.5),new F(-.5,.5),new F(-.5,-.5),new F(.5,-.5)]),t={}){super(),this.type=`ExtrudeGeometry`,this.parameters={shapes:e,options:t},e=Array.isArray(e)?e:[e];let n=this,r=[],i=[];for(let t=0,n=e.length;t<n;t++){let n=e[t];a(n)}this.setAttribute(`position`,new Cr(r,3)),this.setAttribute(`uv`,new Cr(i,2)),this.computeVertexNormals();function a(e){let a=[],o=t.curveSegments===void 0?12:t.curveSegments,s=t.steps===void 0?1:t.steps,c=t.depth===void 0?1:t.depth,l=t.bevelEnabled===void 0||t.bevelEnabled,u=t.bevelThickness===void 0?.2:t.bevelThickness,d=t.bevelSize===void 0?u-.1:t.bevelSize,f=t.bevelOffset===void 0?0:t.bevelOffset,p=t.bevelSegments===void 0?3:t.bevelSegments,m=t.extrudePath,h=t.UVGenerator===void 0?Ja:t.UVGenerator,g,_=!1,v,y,b,x;if(m){g=m.getSpacedPoints(s),_=!0,l=!1;let e=m.isCatmullRomCurve3?m.closed:!1;v=m.computeFrenetFrames(s,e),y=new I,b=new I,x=new I}l||(p=0,u=0,d=0,f=0);let S=e.extractPoints(o),C=S.shape,w=S.holes;if(!Wa.isClockWise(C)){C=C.reverse();for(let e=0,t=w.length;e<t;e++){let t=w[e];Wa.isClockWise(t)&&(w[e]=t.reverse())}}function T(e){let t=e[0];for(let n=1;n<=e.length;n++){let r=n%e.length,i=e[r],a=i.x-t.x,o=i.y-t.y,s=a*a+o*o,c=Math.max(Math.abs(i.x),Math.abs(i.y),Math.abs(t.x),Math.abs(t.y));s<=10000000000000001e-36*c*c?(e.splice(r,1),n--):t=i}}T(C),w.forEach(T);let E=w.length,D=C;for(let e=0;e<E;e++){let t=w[e];C=C.concat(t)}function O(e,t,n){return t||P(`ExtrudeGeometry: vec does not exist`),e.clone().addScaledVector(t,n)}let ee=C.length;function te(e,t,n){let r,i,a,o=e.x-t.x,s=e.y-t.y,c=n.x-e.x,l=n.y-e.y,u=o*o+s*s,d=o*l-s*c;if(Math.abs(d)>2**-52){let d=Math.sqrt(u),f=Math.sqrt(c*c+l*l),p=t.x-s/d,m=t.y+o/d,h=n.x-l/f,g=n.y+c/f,_=((h-p)*l-(g-m)*c)/(o*l-s*c);r=p+o*_-e.x,i=m+s*_-e.y;let v=r*r+i*i;if(v<=2)return new F(r,i);a=Math.sqrt(v/2)}else{let e=!1;o>2**-52?c>2**-52&&(e=!0):o<-(2**-52)?c<-(2**-52)&&(e=!0):Math.sign(s)===Math.sign(l)&&(e=!0),e?(r=-s,i=o,a=Math.sqrt(u)):(r=o,i=s,a=Math.sqrt(u/2))}return new F(r/a,i/a)}let ne=[];for(let e=0,t=D.length,n=t-1,r=e+1;e<t;e++,n++,r++)n===t&&(n=0),r===t&&(r=0),ne[e]=te(D[e],D[n],D[r]);let k=[],re,ie=ne.concat();for(let e=0,t=E;e<t;e++){let t=w[e];re=[];for(let e=0,n=t.length,r=n-1,i=e+1;e<n;e++,r++,i++)r===n&&(r=0),i===n&&(i=0),re[e]=te(t[e],t[r],t[i]);k.push(re),ie=ie.concat(re)}let ae;if(p===0)ae=Wa.triangulateShape(D,w);else{let e=[],t=[];for(let n=0;n<p;n++){let r=n/p,i=u*Math.cos(r*Math.PI/2),a=d*Math.sin(r*Math.PI/2)+f;for(let t=0,n=D.length;t<n;t++){let n=O(D[t],ne[t],a);de(n.x,n.y,-i),r===0&&e.push(n)}for(let e=0,n=E;e<n;e++){let n=w[e];re=k[e];let o=[];for(let e=0,t=n.length;e<t;e++){let t=O(n[e],re[e],a);de(t.x,t.y,-i),r===0&&o.push(t)}r===0&&t.push(o)}}ae=Wa.triangulateShape(e,t)}let oe=ae.length,se=d+f;for(let e=0;e<ee;e++){let t=l?O(C[e],ie[e],se):C[e];_?(b.copy(v.normals[0]).multiplyScalar(t.x),y.copy(v.binormals[0]).multiplyScalar(t.y),x.copy(g[0]).add(b).add(y),de(x.x,x.y,x.z)):de(t.x,t.y,0)}for(let e=1;e<=s;e++)for(let t=0;t<ee;t++){let n=l?O(C[t],ie[t],se):C[t];_?(b.copy(v.normals[e]).multiplyScalar(n.x),y.copy(v.binormals[e]).multiplyScalar(n.y),x.copy(g[e]).add(b).add(y),de(x.x,x.y,x.z)):de(n.x,n.y,c/s*e)}for(let e=p-1;e>=0;e--){let t=e/p,n=u*Math.cos(t*Math.PI/2),r=d*Math.sin(t*Math.PI/2)+f;for(let e=0,t=D.length;e<t;e++){let t=O(D[e],ne[e],r);de(t.x,t.y,c+n)}for(let e=0,t=w.length;e<t;e++){let t=w[e];re=k[e];for(let e=0,i=t.length;e<i;e++){let i=O(t[e],re[e],r);_?de(i.x,i.y+g[s-1].y,g[s-1].x+n):de(i.x,i.y,c+n)}}}ce(),le();function ce(){let e=r.length/3;if(l){let e=0,t=ee*e;for(let e=0;e<oe;e++){let n=ae[e];fe(n[2]+t,n[1]+t,n[0]+t)}e=s+p*2,t=ee*e;for(let e=0;e<oe;e++){let n=ae[e];fe(n[0]+t,n[1]+t,n[2]+t)}}else{for(let e=0;e<oe;e++){let t=ae[e];fe(t[2],t[1],t[0])}for(let e=0;e<oe;e++){let t=ae[e];fe(t[0]+ee*s,t[1]+ee*s,t[2]+ee*s)}}n.addGroup(e,r.length/3-e,0)}function le(){let e=r.length/3,t=0;ue(D,t),t+=D.length;for(let e=0,n=w.length;e<n;e++){let n=w[e];ue(n,t),t+=n.length}n.addGroup(e,r.length/3-e,1)}function ue(e,t){let n=e.length;for(;--n>=0;){let r=n,i=n-1;i<0&&(i=e.length-1);for(let e=0,n=s+p*2;e<n;e++){let n=ee*e,a=ee*(e+1);pe(t+r+n,t+i+n,t+i+a,t+r+a)}}}function de(e,t,n){a.push(e),a.push(t),a.push(n)}function fe(e,t,i){me(e),me(t),me(i);let a=r.length/3,o=h.generateTopUV(n,r,a-3,a-2,a-1);he(o[0]),he(o[1]),he(o[2])}function pe(e,t,i,a){me(e),me(t),me(a),me(t),me(i),me(a);let o=r.length/3,s=h.generateSideWallUV(n,r,o-6,o-3,o-2,o-1);he(s[0]),he(s[1]),he(s[3]),he(s[1]),he(s[2]),he(s[3])}function me(e){r.push(a[e*3+0]),r.push(a[e*3+1]),r.push(a[e*3+2])}function he(e){i.push(e.x),i.push(e.y)}}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}toJSON(){let e=super.toJSON(),t=this.parameters.shapes,n=this.parameters.options;return Ya(t,n,e)}static fromJSON(t,n){let r=[];for(let e=0,i=t.shapes.length;e<i;e++){let i=n[t.shapes[e]];r.push(i)}let i=t.options.extrudePath;return i!==void 0&&(t.options.extrudePath=new oa[i.type]().fromJSON(i)),new e(r,t.options)}},Ja={generateTopUV:function(e,t,n,r,i){let a=t[n*3],o=t[n*3+1],s=t[r*3],c=t[r*3+1],l=t[i*3],u=t[i*3+1];return[new F(a,o),new F(s,c),new F(l,u)]},generateSideWallUV:function(e,t,n,r,i,a){let o=t[n*3],s=t[n*3+1],c=t[n*3+2],l=t[r*3],u=t[r*3+1],d=t[r*3+2],f=t[i*3],p=t[i*3+1],m=t[i*3+2],h=t[a*3],g=t[a*3+1],_=t[a*3+2];return Math.abs(s-u)<Math.abs(o-l)?[new F(o,1-c),new F(l,1-d),new F(f,1-m),new F(h,1-_)]:[new F(s,1-c),new F(u,1-d),new F(p,1-m),new F(g,1-_)]}};function Ya(e,t,n){if(n.shapes=[],Array.isArray(e))for(let t=0,r=e.length;t<r;t++){let r=e[t];n.shapes.push(r.uuid)}else n.shapes.push(e.uuid);return n.options=Object.assign({},t),t.extrudePath!==void 0&&(n.options.extrudePath=t.extrudePath.toJSON()),n}var Xa=class e extends Ni{constructor(e=1,t=0){let n=(1+Math.sqrt(5))/2,r=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1];super(r,[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1],e,t),this.type=`IcosahedronGeometry`,this.parameters={radius:e,detail:t}}static fromJSON(t){return new e(t.radius,t.detail)}},Za=class e extends Fr{constructor(e=1,t=1,n=1,r=1){super(),this.type=`PlaneGeometry`,this.parameters={width:e,height:t,widthSegments:n,heightSegments:r};let i=e/2,a=t/2,o=Math.floor(n),s=Math.floor(r),c=o+1,l=s+1,u=e/o,d=t/s,f=[],p=[],m=[],h=[];for(let e=0;e<l;e++){let t=e*d-a;for(let n=0;n<c;n++){let r=n*u-i;p.push(r,-t,0),m.push(0,0,1),h.push(n/o),h.push(1-e/s)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=t+c*e,r=t+c*(e+1),i=t+1+c*(e+1),a=t+1+c*e;f.push(n,r,a),f.push(r,i,a)}this.setIndex(f),this.setAttribute(`position`,new Cr(p,3)),this.setAttribute(`normal`,new Cr(m,3)),this.setAttribute(`uv`,new Cr(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.widthSegments,t.heightSegments)}},Qa=class e extends Fr{constructor(e=.5,t=1,n=32,r=1,i=0,a=Math.PI*2){super(),this.type=`RingGeometry`,this.parameters={innerRadius:e,outerRadius:t,thetaSegments:n,phiSegments:r,thetaStart:i,thetaLength:a},n=Math.max(3,n),r=Math.max(1,r);let o=[],s=[],c=[],l=[],u=e,d=(t-e)/r,f=new I,p=new F;for(let e=0;e<=r;e++){for(let e=0;e<=n;e++){let r=i+e/n*a;f.x=u*Math.cos(r),f.y=u*Math.sin(r),s.push(f.x,f.y,f.z),c.push(0,0,1),p.x=(f.x/t+1)/2,p.y=(f.y/t+1)/2,l.push(p.x,p.y)}u+=d}for(let e=0;e<r;e++){let t=e*(n+1);for(let e=0;e<n;e++){let r=e+t,i=r,a=r+n+1,s=r+n+2,c=r+1;o.push(i,a,c),o.push(a,s,c)}}this.setIndex(o),this.setAttribute(`position`,new Cr(s,3)),this.setAttribute(`normal`,new Cr(c,3)),this.setAttribute(`uv`,new Cr(l,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}},$a=class e extends Fr{constructor(e=1,t=32,n=16,r=0,i=Math.PI*2,a=0,o=Math.PI){super(),this.type=`SphereGeometry`,this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:r,phiLength:i,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let s=Math.min(a+o,Math.PI),c=0,l=[],u=new I,d=new I,f=[],p=[],m=[],h=[];for(let f=0;f<=n;f++){let g=[],_=f/n,v=0;f===0&&a===0?v=.5/t:f===n&&s===Math.PI&&(v=-.5/t);for(let n=0;n<=t;n++){let s=n/t;u.x=-e*Math.cos(r+s*i)*Math.sin(a+_*o),u.y=e*Math.cos(a+_*o),u.z=e*Math.sin(r+s*i)*Math.sin(a+_*o),p.push(u.x,u.y,u.z),d.copy(u).normalize(),m.push(d.x,d.y,d.z),h.push(s+v,1-_),g.push(c++)}l.push(g)}for(let e=0;e<n;e++)for(let r=0;r<t;r++){let t=l[e][r+1],i=l[e][r],o=l[e+1][r],c=l[e+1][r+1];(e!==0||a>0)&&f.push(t,i,c),(e!==n-1||s<Math.PI)&&f.push(i,o,c)}this.setIndex(f),this.setAttribute(`position`,new Cr(p,3)),this.setAttribute(`normal`,new Cr(m,3)),this.setAttribute(`uv`,new Cr(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}},eo=class e extends Fr{constructor(e=1,t=.4,n=12,r=48,i=Math.PI*2,a=0,o=Math.PI*2){super(),this.type=`TorusGeometry`,this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:r,arc:i,thetaStart:a,thetaLength:o},n=Math.floor(n),r=Math.floor(r);let s=[],c=[],l=[],u=[],d=new I,f=new I,p=new I;for(let s=0;s<=n;s++){let m=a+s/n*o;for(let a=0;a<=r;a++){let o=a/r*i;f.x=(e+t*Math.cos(m))*Math.cos(o),f.y=(e+t*Math.cos(m))*Math.sin(o),f.z=t*Math.sin(m),c.push(f.x,f.y,f.z),d.x=e*Math.cos(o),d.y=e*Math.sin(o),p.subVectors(f,d).normalize(),l.push(p.x,p.y,p.z),u.push(a/r),u.push(s/n)}}for(let e=1;e<=n;e++)for(let t=1;t<=r;t++){let n=(r+1)*e+t-1,i=(r+1)*(e-1)+t-1,a=(r+1)*(e-1)+t,o=(r+1)*e+t;s.push(n,i,o),s.push(i,a,o)}this.setIndex(s),this.setAttribute(`position`,new Cr(c,3)),this.setAttribute(`normal`,new Cr(l,3)),this.setAttribute(`uv`,new Cr(u,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc)}};function to(e){let t={};for(let n in e){t[n]={};for(let r in e[n]){let i=e[n][r];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(N(`UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().`),t[n][r]=null):t[n][r]=i.clone():Array.isArray(i)?t[n][r]=i.slice():t[n][r]=i}}return t}function no(e){let t={};for(let n=0;n<e.length;n++){let r=to(e[n]);for(let e in r)t[e]=r[e]}return t}function ro(e){let t=[];for(let n=0;n<e.length;n++)t.push(e[n].clone());return t}function io(e){let t=e.getRenderTarget();return t===null?e.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:Ht.workingColorSpace}var ao={clone:to,merge:no},oo=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,so=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,co=class extends Lr{constructor(e){super(),this.isShaderMaterial=!0,this.type=`ShaderMaterial`,this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=oo,this.fragmentShader=so,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=to(e.uniforms),this.uniformsGroups=ro(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let n in this.uniforms){let r=this.uniforms[n].value;r&&r.isTexture?t.uniforms[n]={type:`t`,value:r.toJSON(e).uuid}:r&&r.isColor?t.uniforms[n]={type:`c`,value:r.getHex()}:r&&r.isVector2?t.uniforms[n]={type:`v2`,value:r.toArray()}:r&&r.isVector3?t.uniforms[n]={type:`v3`,value:r.toArray()}:r&&r.isVector4?t.uniforms[n]={type:`v4`,value:r.toArray()}:r&&r.isMatrix3?t.uniforms[n]={type:`m3`,value:r.toArray()}:r&&r.isMatrix4?t.uniforms[n]={type:`m4`,value:r.toArray()}:t.uniforms[n]={value:r}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let e in this.extensions)this.extensions[e]===!0&&(n[e]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}},lo=class extends co{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type=`RawShaderMaterial`}},B=class extends Lr{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type=`MeshStandardMaterial`,this.defines={STANDARD:``},this.color=new R(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new R(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new F(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new hn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:``},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},uo=class extends Lr{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type=`MeshDepthMaterial`,this.depthPacking=at,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},fo=class extends Lr{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type=`MeshDistanceMaterial`,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function po(e,t){return!e||e.constructor===t?e:typeof t.BYTES_PER_ELEMENT==`number`?new t(e):Array.prototype.slice.call(e)}var mo=class{constructor(e,t,n,r){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=r===void 0?new t.constructor(n):r,this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,r=t[n],i=t[n-1];validate_interval:{seek:{let a;linear_scan:{forward_scan:if(!(e<r)){for(let a=n+2;;){if(r===void 0){if(e<i)break forward_scan;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(i=r,r=t[++n],e<r)break seek}a=t.length;break linear_scan}if(!(e>=i)){let o=t[1];e<o&&(n=2,i=o);for(let a=n-2;;){if(i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===a)break;if(r=i,i=t[--n-1],e>=i)break seek}a=n,n=0;break linear_scan}break validate_interval}for(;n<a;){let r=n+a>>>1;e<t[r]?a=r:n=r+1}if(r=t[n],i=t[n-1],i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(r===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,i,r)}return this.interpolate_(n,i,e,r)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,r=this.valueSize,i=e*r;for(let e=0;e!==r;++e)t[e]=n[i+e];return t}interpolate_(){throw Error(`call to abstract method`)}intervalChanged_(){}},ho=class extends mo{constructor(e,t,n,r){super(e,t,n,r),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:nt,endingEnd:nt}}intervalChanged_(e,t,n){let r=this.parameterPositions,i=e-2,a=e+1,o=r[i],s=r[a];if(o===void 0)switch(this.getSettings_().endingStart){case rt:i=e,o=2*t-n;break;case it:i=r.length-2,o=t+r[i]-r[i+1];break;default:i=e,o=n}if(s===void 0)switch(this.getSettings_().endingEnd){case rt:a=e,s=2*n-t;break;case it:a=1,s=n+r[1]-r[0];break;default:a=e-1,s=t}let c=(n-t)*.5,l=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(s-n),this._offsetPrev=i*l,this._offsetNext=a*l}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,f=this._weightNext,p=(n-t)/(r-t),m=p*p,h=m*p,g=-d*h+2*d*m-d*p,_=(1+d)*h+(-1.5-2*d)*m+(-.5+d)*p+1,v=(-1-f)*h+(1.5+f)*m+.5*p,y=f*h-f*m;for(let e=0;e!==o;++e)i[e]=g*a[l+e]+_*a[c+e]+v*a[s+e]+y*a[u+e];return i}},go=class extends mo{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=(n-t)/(r-t),u=1-l;for(let e=0;e!==o;++e)i[e]=a[c+e]*u+a[s+e]*l;return i}},_o=class extends mo{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e){return this.copySampleValue_(e-1)}},vo=class extends mo{interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this.settings||this.DefaultSettings_,u=l.inTangents,d=l.outTangents;if(!u||!d){let e=(n-t)/(r-t),l=1-e;for(let t=0;t!==o;++t)i[t]=a[c+t]*l+a[s+t]*e;return i}let f=o*2,p=e-1;for(let l=0;l!==o;++l){let o=a[c+l],m=a[s+l],h=p*f+l*2,g=d[h],_=d[h+1],v=e*f+l*2,y=u[v],b=u[v+1],x=(n-t)/(r-t),S,C,w,T,E;for(let e=0;e<8;e++){S=x*x,C=S*x,w=1-x,T=w*w,E=T*w;let e=E*t+3*T*x*g+3*w*S*y+C*r-n;if(Math.abs(e)<1e-10)break;let i=3*T*(g-t)+6*w*x*(y-g)+3*S*(r-y);if(Math.abs(i)<1e-10)break;x-=e/i,x=Math.max(0,Math.min(1,x))}i[l]=E*o+3*T*x*_+3*w*S*b+C*m}return i}},yo=class{constructor(e,t,n,r){if(e===void 0)throw Error(`THREE.KeyframeTrack: track name is undefined`);if(t===void 0||t.length===0)throw Error(`THREE.KeyframeTrack: no keyframes in track named `+e);this.name=e,this.times=po(t,this.TimeBufferType),this.values=po(n,this.ValueBufferType),this.setInterpolation(r||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:po(e.times,Array),values:po(e.values,Array)};let t=e.getInterpolation();t!==e.DefaultInterpolation&&(n.interpolation=t)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new _o(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new go(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new ho(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){let t=new vo(this.times,this.values,this.getValueSize(),e);return this.settings&&(t.settings=this.settings),t}setInterpolation(e){let t;switch(e){case Qe:t=this.InterpolantFactoryMethodDiscrete;break;case $e:t=this.InterpolantFactoryMethodLinear;break;case et:t=this.InterpolantFactoryMethodSmooth;break;case tt:t=this.InterpolantFactoryMethodBezier}if(t===void 0){let t=`unsupported interpolation for `+this.ValueTypeName+` keyframe track named `+this.name;if(this.createInterpolant===void 0){if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw Error(t)}return N(`KeyframeTrack:`,t),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Qe;case this.InterpolantFactoryMethodLinear:return $e;case this.InterpolantFactoryMethodSmooth:return et;case this.InterpolantFactoryMethodBezier:return tt}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]*=e}return this}trim(e,t){let n=this.times,r=n.length,i=0,a=r-1;for(;i!==r&&n[i]<e;)++i;for(;a!==-1&&n[a]>t;)--a;if(++a,i!==0||a!==r){i>=a&&(a=Math.max(a,1),i=a-1);let e=this.getValueSize();this.times=n.slice(i,a),this.values=this.values.slice(i*e,a*e)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(P(`KeyframeTrack: Invalid value size in track.`,this),e=!1);let n=this.times,r=this.values,i=n.length;i===0&&(P(`KeyframeTrack: Track is empty.`,this),e=!1);let a=null;for(let t=0;t!==i;t++){let r=n[t];if(typeof r==`number`&&isNaN(r)){P(`KeyframeTrack: Time is not a valid number.`,this,t,r),e=!1;break}if(a!==null&&a>r){P(`KeyframeTrack: Out of order keys.`,this,t,r,a),e=!1;break}a=r}if(r!==void 0&&ht(r))for(let t=0,n=r.length;t!==n;++t){let n=r[t];if(isNaN(n)){P(`KeyframeTrack: Value is not a valid number.`,this,t,n),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),r=this.getInterpolation()===et,i=e.length-1,a=1;for(let o=1;o<i;++o){let i=!1,s=e[o];if(s!==e[o+1]&&(o!==1||s!==e[0])){if(r)i=!0;else{let e=o*n,r=e-n,a=e+n;for(let o=0;o!==n;++o){let n=t[e+o];if(n!==t[r+o]||n!==t[a+o]){i=!0;break}}}}if(i){if(o!==a){e[a]=e[o];let r=o*n,i=a*n;for(let e=0;e!==n;++e)t[i+e]=t[r+e]}++a}}if(i>0){e[a]=e[i];for(let e=i*n,r=a*n,o=0;o!==n;++o)t[r+o]=t[e+o];++a}return a===e.length?(this.times=e,this.values=t):(this.times=e.slice(0,a),this.values=t.slice(0,a*n)),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,r=new n(this.name,e,t);return r.createInterpolant=this.createInterpolant,r}};yo.prototype.ValueTypeName=``,yo.prototype.TimeBufferType=Float32Array,yo.prototype.ValueBufferType=Float32Array,yo.prototype.DefaultInterpolation=$e;var bo=class extends yo{constructor(e,t,n){super(e,t,n)}};bo.prototype.ValueTypeName=`bool`,bo.prototype.ValueBufferType=Array,bo.prototype.DefaultInterpolation=Qe,bo.prototype.InterpolantFactoryMethodLinear=void 0,bo.prototype.InterpolantFactoryMethodSmooth=void 0;var xo=class extends yo{constructor(e,t,n,r){super(e,t,n,r)}};xo.prototype.ValueTypeName=`color`;var So=class extends yo{constructor(e,t,n,r){super(e,t,n,r)}};So.prototype.ValueTypeName=`number`;var Co=class extends mo{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=(n-t)/(r-t),c=e*o;for(let e=c+o;c!==e;c+=4)Pt.slerpFlat(i,0,a,c-o,a,c,s);return i}},wo=class extends yo{constructor(e,t,n,r){super(e,t,n,r)}InterpolantFactoryMethodLinear(e){return new Co(this.times,this.values,this.getValueSize(),e)}};wo.prototype.ValueTypeName=`quaternion`,wo.prototype.InterpolantFactoryMethodSmooth=void 0;var To=class extends yo{constructor(e,t,n){super(e,t,n)}};To.prototype.ValueTypeName=`string`,To.prototype.ValueBufferType=Array,To.prototype.DefaultInterpolation=Qe,To.prototype.InterpolantFactoryMethodLinear=void 0,To.prototype.InterpolantFactoryMethodSmooth=void 0;var Eo=class extends yo{constructor(e,t,n,r){super(e,t,n,r)}};Eo.prototype.ValueTypeName=`vector`;var Do=class extends Mn{constructor(e,t=1){super(),this.isLight=!0,this.type=`Light`,this.color=new R(e),this.intensity=t}dispose(){this.dispatchEvent({type:`dispose`})}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}},Oo=class extends Do{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type=`HemisphereLight`,this.position.copy(Mn.DEFAULT_UP),this.updateMatrix(),this.groundColor=new R(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){let t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}},ko=new an,Ao=new I,jo=new I,Mo=class{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new F(512,512),this.mapType=E,this.map=null,this.mapPass=null,this.matrix=new an,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Ci,this._frameExtents=new F(1,1),this._viewportCount=1,this._viewports=[new $t(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera,n=this.matrix;Ao.setFromMatrixPosition(e.matrixWorld),t.position.copy(Ao),jo.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(jo),t.updateMatrixWorld(),ko.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(ko,t.coordinateSystem,t.reversedDepth),t.coordinateSystem===2001||t.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(ko)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}},No=new I,Po=new Pt,Fo=new I,Io=class extends Mn{constructor(){super(),this.isCamera=!0,this.type=`Camera`,this.matrixWorldInverse=new an,this.projectionMatrix=new an,this.projectionMatrixInverse=new an,this.coordinateSystem=pt,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(No,Po,Fo),Fo.x===1&&Fo.y===1&&Fo.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(No,Po,Fo.set(1,1,1)).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorld.decompose(No,Po,Fo),Fo.x===1&&Fo.y===1&&Fo.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(No,Po,Fo.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},Lo=new I,Ro=new F,zo=new F,Bo=class extends Io{constructor(e=50,t=1,n=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type=`PerspectiveCamera`,this.fov=e,this.zoom=1,this.near=n,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=Dt*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(Et*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Dt*2*Math.atan(Math.tan(Et*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){Lo.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Lo.x,Lo.y).multiplyScalar(-e/Lo.z),Lo.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Lo.x,Lo.y).multiplyScalar(-e/Lo.z)}getViewSize(e,t){return this.getViewBounds(e,Ro,zo),t.subVectors(zo,Ro)}setViewOffset(e,t,n,r,i,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=i,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(Et*.5*this.fov)/this.zoom,n=2*t,r=this.aspect*n,i=-.5*r,a=this.view;if(this.view!==null&&this.view.enabled){let e=a.fullWidth,o=a.fullHeight;i+=a.offsetX*r/e,t-=a.offsetY*n/o,r*=a.width/e,n*=a.height/o}let o=this.filmOffset;o!==0&&(i+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(i,i+r,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},Vo=class extends Io{constructor(e=-1,t=1,n=1,r=-1,i=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type=`OrthographicCamera`,this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=r,this.near=i,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,r,i,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=i,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,r=(this.top+this.bottom)/2,i=n-e,a=n+e,o=r+t,s=r-t;if(this.view!==null&&this.view.enabled){let e=(this.right-this.left)/this.view.fullWidth/this.zoom,t=(this.top-this.bottom)/this.view.fullHeight/this.zoom;i+=e*this.view.offsetX,a=i+e*this.view.width,o-=t*this.view.offsetY,s=o-t*this.view.height}this.projectionMatrix.makeOrthographic(i,a,o,s,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},Ho=class extends Mo{constructor(){super(new Vo(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},Uo=class extends Do{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type=`DirectionalLight`,this.position.copy(Mn.DEFAULT_UP),this.updateMatrix(),this.target=new Mn,this.shadow=new Ho}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}},Wo=-90,Go=1,Ko=class extends Mn{constructor(e,t,n){super(),this.type=`CubeCamera`,this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let r=new Bo(Wo,Go,e,t);r.layers=this.layers,this.add(r);let i=new Bo(Wo,Go,e,t);i.layers=this.layers,this.add(i);let a=new Bo(Wo,Go,e,t);a.layers=this.layers,this.add(a);let o=new Bo(Wo,Go,e,t);o.layers=this.layers,this.add(o);let s=new Bo(Wo,Go,e,t);s.layers=this.layers,this.add(s);let c=new Bo(Wo,Go,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,r,i,a,o,s]=t;for(let e of t)this.remove(e);if(e===2e3)n.up.set(0,1,0),n.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),i.up.set(0,0,-1),i.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),s.up.set(0,1,0),s.lookAt(0,0,-1);else if(e===2001)n.up.set(0,-1,0),n.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),i.up.set(0,0,1),i.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),s.up.set(0,-1,0),s.lookAt(0,0,-1);else throw Error(`THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: `+e);for(let e of t)this.add(e),e.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[i,a,o,s,c,l]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),p=e.xr.enabled;e.xr.enabled=!1;let m=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let h=!1;h=e.isWebGLRenderer===!0?e.state.buffers.depth.getReversed():e.reversedDepthBuffer,e.setRenderTarget(n,0,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,i),e.setRenderTarget(n,1,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,s),e.setRenderTarget(n,4,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=m,e.setRenderTarget(n,5,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(u,d,f),e.xr.enabled=p,n.texture.needsPMREMUpdate=!0}},qo=class extends Bo{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}},Jo=`\\[\\]\\.:\\/`,Yo=RegExp(`[\\[\\]\\.:\\/]`,`g`),Xo=`[^\\[\\]\\.:\\/]`,Zo=`[^`+Jo.replace(`\\.`,``)+`]`,Qo=`((?:WC+[\\/:])*)`.replace(`WC`,Xo),$o=`(WCOD+)?`.replace(`WCOD`,Zo),es=`(?:\\.(WC+)(?:\\[(.+)\\])?)?`.replace(`WC`,Xo),ts=`\\.(WC+)(?:\\[(.+)\\])?`.replace(`WC`,Xo),ns=RegExp(`^`+Qo+$o+es+ts+`$`),rs=[`material`,`materials`,`bones`,`map`],is=class{constructor(e,t,n){let r=n||as.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,r)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,r=this._bindings[n];r!==void 0&&r.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let r=this._targetGroup.nCachedObjects_,i=n.length;r!==i;++r)n[r].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},as=class e{constructor(t,n,r){this.path=n,this.parsedPath=r||e.parseTrackName(n),this.node=e.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,n,r){return t&&t.isAnimationObjectGroup?new e.Composite(t,n,r):new e(t,n,r)}static sanitizeNodeName(e){return e.replace(/\s/g,`_`).replace(Yo,``)}static parseTrackName(e){let t=ns.exec(e);if(t===null)throw Error(`PropertyBinding: Cannot parse trackName: `+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},r=n.nodeName&&n.nodeName.lastIndexOf(`.`);if(r!==void 0&&r!==-1){let e=n.nodeName.substring(r+1);rs.indexOf(e)!==-1&&(n.nodeName=n.nodeName.substring(0,r),n.objectName=e)}if(n.propertyName===null||n.propertyName.length===0)throw Error(`PropertyBinding: can not parse propertyName from trackName: `+e);return n}static findNode(e,t){if(t===void 0||t===``||t===`.`||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(e){for(let r=0;r<e.length;r++){let i=e[r];if(i.name===t||i.uuid===t)return i;let a=n(i.children);if(a)return a}return null},r=n(e.children);if(r)return r}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)e[t++]=n[r]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let t=this.node,n=this.parsedPath,r=n.objectName,i=n.propertyName,a=n.propertyIndex;if(t||(t=e.findNode(this.rootNode,n.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){N(`PropertyBinding: No target node found for track: `+this.path+`.`);return}if(r){let e=n.objectIndex;switch(r){case`materials`:if(!t.material){P(`PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.materials){P(`PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.`,this);return}t=t.material.materials;break;case`bones`:if(!t.skeleton){P(`PropertyBinding: Can not bind to bones as node does not have a skeleton.`,this);return}t=t.skeleton.bones;for(let n=0;n<t.length;n++)if(t[n].name===e){e=n;break}break;case`map`:if(`map`in t){t=t.map;break}if(!t.material){P(`PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.map){P(`PropertyBinding: Can not bind to material.map as node.material does not have a map.`,this);return}t=t.material.map;break;default:if(t[r]===void 0){P(`PropertyBinding: Can not bind to objectName of node undefined.`,this);return}t=t[r]}if(e!==void 0){if(t[e]===void 0){P(`PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.`,this,t);return}t=t[e]}}let o=t[i];if(o===void 0){let e=n.nodeName;P(`PropertyBinding: Trying to update property for track: `+e+`.`+i+` but it wasn't found.`,t);return}let s=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?s=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(s=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(a!==void 0){if(i===`morphTargetInfluences`){if(!t.geometry){P(`PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.`,this);return}if(!t.geometry.morphAttributes){P(`PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.`,this);return}t.morphTargetDictionary[a]!==void 0&&(a=t.morphTargetDictionary[a])}c=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=a}else o.fromArray!==void 0&&o.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(c=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][s]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};as.Composite=is,as.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},as.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},as.prototype.GetterByBindingType=[as.prototype._getValue_direct,as.prototype._getValue_array,as.prototype._getValue_arrayElement,as.prototype._getValue_toArray],as.prototype.SetterByBindingTypeAndVersioning=[[as.prototype._setValue_direct,as.prototype._setValue_direct_setNeedsUpdate,as.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[as.prototype._setValue_array,as.prototype._setValue_array_setNeedsUpdate,as.prototype._setValue_array_setMatrixWorldNeedsUpdate],[as.prototype._setValue_arrayElement,as.prototype._setValue_arrayElement_setNeedsUpdate,as.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[as.prototype._setValue_fromArray,as.prototype._setValue_fromArray_setNeedsUpdate,as.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];function os(e,t,n,r){let i=ss(r);switch(n){case le:return e*t;case me:return e*t/i.components*i.byteLength;case he:return e*t/i.components*i.byteLength;case ge:return e*t*2/i.components*i.byteLength;case _e:return e*t*2/i.components*i.byteLength;case ue:return e*t*3/i.components*i.byteLength;case de:return e*t*4/i.components*i.byteLength;case ve:return e*t*4/i.components*i.byteLength;case ye:case be:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case xe:case Se:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case we:case Ee:return Math.max(e,16)*Math.max(t,8)/4;case Ce:case Te:return Math.max(e,8)*Math.max(t,8)/2;case De:case Oe:case Ae:case je:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case ke:case Me:case Ne:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case A:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case Pe:return Math.floor((e+4)/5)*Math.floor((t+3)/4)*16;case Fe:return Math.floor((e+4)/5)*Math.floor((t+4)/5)*16;case Ie:return Math.floor((e+5)/6)*Math.floor((t+4)/5)*16;case j:return Math.floor((e+5)/6)*Math.floor((t+5)/6)*16;case Le:return Math.floor((e+7)/8)*Math.floor((t+4)/5)*16;case M:return Math.floor((e+7)/8)*Math.floor((t+5)/6)*16;case Re:return Math.floor((e+7)/8)*Math.floor((t+7)/8)*16;case ze:return Math.floor((e+9)/10)*Math.floor((t+4)/5)*16;case Be:return Math.floor((e+9)/10)*Math.floor((t+5)/6)*16;case Ve:return Math.floor((e+9)/10)*Math.floor((t+7)/8)*16;case He:return Math.floor((e+9)/10)*Math.floor((t+9)/10)*16;case Ue:return Math.floor((e+11)/12)*Math.floor((t+9)/10)*16;case We:return Math.floor((e+11)/12)*Math.floor((t+11)/12)*16;case Ge:case Ke:case qe:return Math.ceil(e/4)*Math.ceil(t/4)*16;case Je:case Ye:return Math.ceil(e/4)*Math.ceil(t/4)*8;case Xe:case Ze:return Math.ceil(e/4)*Math.ceil(t/4)*16}throw Error(`Unable to determine texture byte length for ${n} format.`)}function ss(e){switch(e){case E:case D:return{byteLength:1,components:1};case ee:case O:case re:return{byteLength:2,components:1};case ie:case ae:return{byteLength:2,components:4};case ne:case te:case k:return{byteLength:4,components:1};case se:case ce:return{byteLength:4,components:3}}throw Error(`Unknown texture type ${e}.`)}typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`register`,{detail:{revision:`183`}})),typeof window<`u`&&(window.__THREE__?N(`WARNING: Multiple instances of Three.js being imported.`):window.__THREE__=`183`);function cs(){let e=null,t=!1,n=null,r=null;function i(t,a){n(t,a),r=e.requestAnimationFrame(i)}return{start:function(){t!==!0&&n!==null&&(r=e.requestAnimationFrame(i),t=!0)},stop:function(){e.cancelAnimationFrame(r),t=!1},setAnimationLoop:function(e){n=e},setContext:function(t){e=t}}}function ls(e){let t=new WeakMap;function n(t,n){let r=t.array,i=t.usage,a=r.byteLength,o=e.createBuffer();e.bindBuffer(n,o),e.bufferData(n,r,i),t.onUploadCallback();let s;if(r instanceof Float32Array)s=e.FLOAT;else if(typeof Float16Array<`u`&&r instanceof Float16Array)s=e.HALF_FLOAT;else if(r instanceof Uint16Array)s=t.isFloat16BufferAttribute?e.HALF_FLOAT:e.UNSIGNED_SHORT;else if(r instanceof Int16Array)s=e.SHORT;else if(r instanceof Uint32Array)s=e.UNSIGNED_INT;else if(r instanceof Int32Array)s=e.INT;else if(r instanceof Int8Array)s=e.BYTE;else if(r instanceof Uint8Array)s=e.UNSIGNED_BYTE;else if(r instanceof Uint8ClampedArray)s=e.UNSIGNED_BYTE;else throw Error(`THREE.WebGLAttributes: Unsupported buffer data format: `+r);return{buffer:o,type:s,bytesPerElement:r.BYTES_PER_ELEMENT,version:t.version,size:a}}function r(t,n,r){let i=n.array,a=n.updateRanges;if(e.bindBuffer(r,t),a.length===0)e.bufferSubData(r,0,i);else{a.sort((e,t)=>e.start-t.start);let t=0;for(let e=1;e<a.length;e++){let n=a[t],r=a[e];r.start<=n.start+n.count+1?n.count=Math.max(n.count,r.start+r.count-n.start):(++t,a[t]=r)}a.length=t+1;for(let t=0,n=a.length;t<n;t++){let n=a[t];e.bufferSubData(r,n.start*i.BYTES_PER_ELEMENT,i,n.start,n.count)}n.clearUpdateRanges()}n.onUploadCallback()}function i(e){return e.isInterleavedBufferAttribute&&(e=e.data),t.get(e)}function a(n){n.isInterleavedBufferAttribute&&(n=n.data);let r=t.get(n);r&&(e.deleteBuffer(r.buffer),t.delete(n))}function o(e,i){if(e.isInterleavedBufferAttribute&&(e=e.data),e.isGLBufferAttribute){let n=t.get(e);(!n||n.version<e.version)&&t.set(e,{buffer:e.buffer,type:e.type,bytesPerElement:e.elementSize,version:e.version});return}let a=t.get(e);if(a===void 0)t.set(e,n(e,i));else if(a.version<e.version){if(a.size!==e.array.byteLength)throw Error(`THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.`);r(a.buffer,e,i),a.version=e.version}}return{get:i,remove:a,update:o}}var us={alphahash_fragment:`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,alphahash_pars_fragment:`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,alphamap_fragment:`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,alphamap_pars_fragment:`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,alphatest_fragment:`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,alphatest_pars_fragment:`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,aomap_fragment:`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,aomap_pars_fragment:`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,batching_pars_vertex:`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,batching_vertex:`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,begin_vertex:`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,beginnormal_vertex:`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,bsdfs:`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,iridescence_fragment:`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,bumpmap_pars_fragment:`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,clipping_planes_fragment:`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,clipping_planes_pars_fragment:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,clipping_planes_pars_vertex:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,clipping_planes_vertex:`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,color_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,color_pars_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,color_pars_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,color_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,common:`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,cube_uv_reflection_fragment:`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,defaultnormal_vertex:`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,displacementmap_pars_vertex:`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,displacementmap_vertex:`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,emissivemap_fragment:`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,emissivemap_pars_fragment:`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,colorspace_fragment:`gl_FragColor = linearToOutputTexel( gl_FragColor );`,colorspace_pars_fragment:`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,envmap_fragment:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,envmap_common_pars_fragment:`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,envmap_pars_fragment:`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,envmap_pars_vertex:`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,envmap_physical_pars_fragment:`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,envmap_vertex:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,fog_vertex:`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,fog_pars_vertex:`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fog_fragment:`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fog_pars_fragment:`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,gradientmap_pars_fragment:`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,lightmap_pars_fragment:`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,lights_lambert_fragment:`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lights_lambert_pars_fragment:`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,lights_pars_begin:`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,lights_toon_fragment:`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,lights_toon_pars_fragment:`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lights_phong_fragment:`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,lights_phong_pars_fragment:`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,lights_physical_fragment:`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,lights_physical_pars_fragment:`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return v;
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,lights_fragment_begin:`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,lights_fragment_maps:`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,lights_fragment_end:`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,logdepthbuf_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,logdepthbuf_pars_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_pars_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,map_fragment:`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,map_pars_fragment:`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,map_particle_fragment:`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,map_particle_pars_fragment:`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,metalnessmap_fragment:`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,metalnessmap_pars_fragment:`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,morphinstance_vertex:`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,morphcolor_vertex:`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,morphnormal_vertex:`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,morphtarget_pars_vertex:`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,morphtarget_vertex:`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,normal_fragment_begin:`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,normal_fragment_maps:`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,normal_pars_fragment:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_pars_vertex:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_vertex:`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,normalmap_pars_fragment:`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,clearcoat_normal_fragment_begin:`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,clearcoat_normal_fragment_maps:`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,clearcoat_pars_fragment:`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,iridescence_pars_fragment:`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,opaque_fragment:`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,packing:`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,premultiplied_alpha_fragment:`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,project_vertex:`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dithering_fragment:`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,dithering_pars_fragment:`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,roughnessmap_fragment:`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,roughnessmap_pars_fragment:`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,shadowmap_pars_fragment:`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,shadowmap_pars_vertex:`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,shadowmap_vertex:`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,shadowmask_pars_fragment:`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,skinbase_vertex:`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,skinning_pars_vertex:`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,skinning_vertex:`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,skinnormal_vertex:`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,specularmap_fragment:`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,specularmap_pars_fragment:`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,tonemapping_fragment:`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,tonemapping_pars_fragment:`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,transmission_fragment:`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,transmission_pars_fragment:`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,uv_pars_fragment:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_pars_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,worldpos_vertex:`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,depth_frag:`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,distance_vert:`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,distance_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,linedashed_frag:`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,meshbasic_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,meshbasic_frag:`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshlambert_vert:`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshmatcap_vert:`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,meshmatcap_frag:`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshnormal_vert:`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshphysical_vert:`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,meshphysical_frag:`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshtoon_vert:`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,points_vert:`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,points_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,shadow_vert:`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,sprite_vert:`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sprite_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`},V={common:{diffuse:{value:new R(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Lt},alphaMap:{value:null},alphaMapTransform:{value:new Lt},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Lt}},envmap:{envMap:{value:null},envMapRotation:{value:new Lt},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Lt}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Lt}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Lt},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Lt},normalScale:{value:new F(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Lt},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Lt}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Lt}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Lt}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new R(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new R(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Lt},alphaTest:{value:0},uvTransform:{value:new Lt}},sprite:{diffuse:{value:new R(16777215)},opacity:{value:1},center:{value:new F(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Lt},alphaMap:{value:null},alphaMapTransform:{value:new Lt},alphaTest:{value:0}}},ds={basic:{uniforms:no([V.common,V.specularmap,V.envmap,V.aomap,V.lightmap,V.fog]),vertexShader:us.meshbasic_vert,fragmentShader:us.meshbasic_frag},lambert:{uniforms:no([V.common,V.specularmap,V.envmap,V.aomap,V.lightmap,V.emissivemap,V.bumpmap,V.normalmap,V.displacementmap,V.fog,V.lights,{emissive:{value:new R(0)},envMapIntensity:{value:1}}]),vertexShader:us.meshlambert_vert,fragmentShader:us.meshlambert_frag},phong:{uniforms:no([V.common,V.specularmap,V.envmap,V.aomap,V.lightmap,V.emissivemap,V.bumpmap,V.normalmap,V.displacementmap,V.fog,V.lights,{emissive:{value:new R(0)},specular:{value:new R(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:us.meshphong_vert,fragmentShader:us.meshphong_frag},standard:{uniforms:no([V.common,V.envmap,V.aomap,V.lightmap,V.emissivemap,V.bumpmap,V.normalmap,V.displacementmap,V.roughnessmap,V.metalnessmap,V.fog,V.lights,{emissive:{value:new R(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:us.meshphysical_vert,fragmentShader:us.meshphysical_frag},toon:{uniforms:no([V.common,V.aomap,V.lightmap,V.emissivemap,V.bumpmap,V.normalmap,V.displacementmap,V.gradientmap,V.fog,V.lights,{emissive:{value:new R(0)}}]),vertexShader:us.meshtoon_vert,fragmentShader:us.meshtoon_frag},matcap:{uniforms:no([V.common,V.bumpmap,V.normalmap,V.displacementmap,V.fog,{matcap:{value:null}}]),vertexShader:us.meshmatcap_vert,fragmentShader:us.meshmatcap_frag},points:{uniforms:no([V.points,V.fog]),vertexShader:us.points_vert,fragmentShader:us.points_frag},dashed:{uniforms:no([V.common,V.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:us.linedashed_vert,fragmentShader:us.linedashed_frag},depth:{uniforms:no([V.common,V.displacementmap]),vertexShader:us.depth_vert,fragmentShader:us.depth_frag},normal:{uniforms:no([V.common,V.bumpmap,V.normalmap,V.displacementmap,{opacity:{value:1}}]),vertexShader:us.meshnormal_vert,fragmentShader:us.meshnormal_frag},sprite:{uniforms:no([V.sprite,V.fog]),vertexShader:us.sprite_vert,fragmentShader:us.sprite_frag},background:{uniforms:{uvTransform:{value:new Lt},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:us.background_vert,fragmentShader:us.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Lt}},vertexShader:us.backgroundCube_vert,fragmentShader:us.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:us.cube_vert,fragmentShader:us.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:us.equirect_vert,fragmentShader:us.equirect_frag},distance:{uniforms:no([V.common,V.displacementmap,{referencePosition:{value:new I},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:us.distance_vert,fragmentShader:us.distance_frag},shadow:{uniforms:no([V.lights,V.fog,{color:{value:new R(0)},opacity:{value:1}}]),vertexShader:us.shadow_vert,fragmentShader:us.shadow_frag}};ds.physical={uniforms:no([ds.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Lt},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Lt},clearcoatNormalScale:{value:new F(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Lt},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Lt},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Lt},sheen:{value:0},sheenColor:{value:new R(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Lt},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Lt},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Lt},transmissionSamplerSize:{value:new F},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Lt},attenuationDistance:{value:0},attenuationColor:{value:new R(0)},specularColor:{value:new R(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Lt},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Lt},anisotropyVector:{value:new F},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Lt}}]),vertexShader:us.meshphysical_vert,fragmentShader:us.meshphysical_frag};var fs={r:0,b:0,g:0},ps=new hn,ms=new an;function hs(e,t,n,r,i,a){let o=new R(0),s=i===!0?0:1,c,l,u=null,d=0,f=null;function p(e){let n=e.isScene===!0?e.background:null;if(n&&n.isTexture){let r=e.backgroundBlurriness>0;n=t.get(n,r)}return n}function m(t){let r=!1,i=p(t);i===null?g(o,s):i&&i.isColor&&(g(i,1),r=!0);let c=e.xr.getEnvironmentBlendMode();c===`additive`?n.buffers.color.setClear(0,0,0,1,a):c===`alpha-blend`&&n.buffers.color.setClear(0,0,0,0,a),(e.autoClear||r)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function h(t,n){let i=p(n);i&&(i.isCubeTexture||i.mapping===306)?(l===void 0&&(l=new z(new ki(1,1,1),new co({name:`BackgroundCubeMaterial`,uniforms:to(ds.backgroundCube.uniforms),vertexShader:ds.backgroundCube.vertexShader,fragmentShader:ds.backgroundCube.fragmentShader,side:1,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute(`normal`),l.geometry.deleteAttribute(`uv`),l.onBeforeRender=function(e,t,n){this.matrixWorld.copyPosition(n.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),r.update(l)),ps.copy(n.backgroundRotation),ps.x*=-1,ps.y*=-1,ps.z*=-1,i.isCubeTexture&&i.isRenderTargetTexture===!1&&(ps.y*=-1,ps.z*=-1),l.material.uniforms.envMap.value=i,l.material.uniforms.flipEnvMap.value=i.isCubeTexture&&i.isRenderTargetTexture===!1?-1:1,l.material.uniforms.backgroundBlurriness.value=n.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(ms.makeRotationFromEuler(ps)),l.material.toneMapped=Ht.getTransfer(i.colorSpace)!==lt,(u!==i||d!==i.version||f!==e.toneMapping)&&(l.material.needsUpdate=!0,u=i,d=i.version,f=e.toneMapping),l.layers.enableAll(),t.unshift(l,l.geometry,l.material,0,0,null)):i&&i.isTexture&&(c===void 0&&(c=new z(new Za(2,2),new co({name:`BackgroundMaterial`,uniforms:to(ds.background.uniforms),vertexShader:ds.background.vertexShader,fragmentShader:ds.background.fragmentShader,side:0,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute(`normal`),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),r.update(c)),c.material.uniforms.t2D.value=i,c.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,c.material.toneMapped=Ht.getTransfer(i.colorSpace)!==lt,i.matrixAutoUpdate===!0&&i.updateMatrix(),c.material.uniforms.uvTransform.value.copy(i.matrix),(u!==i||d!==i.version||f!==e.toneMapping)&&(c.material.needsUpdate=!0,u=i,d=i.version,f=e.toneMapping),c.layers.enableAll(),t.unshift(c,c.geometry,c.material,0,0,null))}function g(t,r){t.getRGB(fs,io(e)),n.buffers.color.setClear(fs.r,fs.g,fs.b,r,a)}function _(){l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0),c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0)}return{getClearColor:function(){return o},setClearColor:function(e,t=1){o.set(e),s=t,g(o,s)},getClearAlpha:function(){return s},setClearAlpha:function(e){s=e,g(o,s)},render:m,addToRenderList:h,dispose:_}}function gs(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),r={},i=f(null),a=i,o=!1;function s(n,r,i,s,c){let u=!1,f=d(n,s,i,r);a!==f&&(a=f,l(a.object)),u=p(n,s,i,c),u&&m(n,s,i,c),c!==null&&t.update(c,e.ELEMENT_ARRAY_BUFFER),(u||o)&&(o=!1,b(n,r,i,s),c!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(c).buffer))}function c(){return e.createVertexArray()}function l(t){return e.bindVertexArray(t)}function u(t){return e.deleteVertexArray(t)}function d(e,t,n,i){let a=i.wireframe===!0,o=r[t.id];o===void 0&&(o={},r[t.id]=o);let s=e.isInstancedMesh===!0?e.id:0,l=o[s];l===void 0&&(l={},o[s]=l);let u=l[n.id];u===void 0&&(u={},l[n.id]=u);let d=u[a];return d===void 0&&(d=f(c()),u[a]=d),d}function f(e){let t=[],r=[],i=[];for(let e=0;e<n;e++)t[e]=0,r[e]=0,i[e]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:t,enabledAttributes:r,attributeDivisors:i,object:e,attributes:{},index:null}}function p(e,t,n,r){let i=a.attributes,o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=i[t],r=o[t];if(r===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(r=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(r=e.instanceColor)),n===void 0||n.attribute!==r||r&&n.data!==r.data)return!0;s++}return a.attributesNum!==s||a.index!==r}function m(e,t,n,r){let i={},o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=o[t];n===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(n=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(n=e.instanceColor));let r={};r.attribute=n,n&&n.data&&(r.data=n.data),i[t]=r,s++}a.attributes=i,a.attributesNum=s,a.index=r}function h(){let e=a.newAttributes;for(let t=0,n=e.length;t<n;t++)e[t]=0}function g(e){_(e,0)}function _(t,n){let r=a.newAttributes,i=a.enabledAttributes,o=a.attributeDivisors;r[t]=1,i[t]===0&&(e.enableVertexAttribArray(t),i[t]=1),o[t]!==n&&(e.vertexAttribDivisor(t,n),o[t]=n)}function v(){let t=a.newAttributes,n=a.enabledAttributes;for(let r=0,i=n.length;r<i;r++)n[r]!==t[r]&&(e.disableVertexAttribArray(r),n[r]=0)}function y(t,n,r,i,a,o,s){s===!0?e.vertexAttribIPointer(t,n,r,a,o):e.vertexAttribPointer(t,n,r,i,a,o)}function b(n,r,i,a){h();let o=a.attributes,s=i.getAttributes(),c=r.defaultAttributeValues;for(let r in s){let i=s[r];if(i.location>=0){let s=o[r];if(s===void 0&&(r===`instanceMatrix`&&n.instanceMatrix&&(s=n.instanceMatrix),r===`instanceColor`&&n.instanceColor&&(s=n.instanceColor)),s!==void 0){let r=s.normalized,o=s.itemSize,c=t.get(s);if(c===void 0)continue;let l=c.buffer,u=c.type,d=c.bytesPerElement,f=u===e.INT||u===e.UNSIGNED_INT||s.gpuType===1013;if(s.isInterleavedBufferAttribute){let t=s.data,c=t.stride,p=s.offset;if(t.isInstancedInterleavedBuffer){for(let e=0;e<i.locationSize;e++)_(i.location+e,t.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=t.meshPerAttribute*t.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,c*d,(p+o/i.locationSize*e)*d,f)}else{if(s.isInstancedBufferAttribute){for(let e=0;e<i.locationSize;e++)_(i.location+e,s.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=s.meshPerAttribute*s.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,o*d,o/i.locationSize*e*d,f)}}else if(c!==void 0){let t=c[r];if(t!==void 0)switch(t.length){case 2:e.vertexAttrib2fv(i.location,t);break;case 3:e.vertexAttrib3fv(i.location,t);break;case 4:e.vertexAttrib4fv(i.location,t);break;default:e.vertexAttrib1fv(i.location,t)}}}}v()}function x(){T();for(let e in r){let t=r[e];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e]}}function S(e){if(r[e.id]===void 0)return;let t=r[e.id];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e.id]}function C(e){for(let t in r){let n=r[t];for(let t in n){let r=n[t];if(r[e.id]===void 0)continue;let i=r[e.id];for(let e in i)u(i[e].object),delete i[e];delete r[e.id]}}}function w(e){for(let t in r){let n=r[t],i=e.isInstancedMesh===!0?e.id:0,a=n[i];if(a!==void 0){for(let e in a){let t=a[e];for(let e in t)u(t[e].object),delete t[e];delete a[e]}delete n[i],Object.keys(n).length===0&&delete r[t]}}}function T(){E(),o=!0,a!==i&&(a=i,l(a.object))}function E(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:s,reset:T,resetDefaultState:E,dispose:x,releaseStatesOfGeometry:S,releaseStatesOfObject:w,releaseStatesOfProgram:C,initAttributes:h,enableAttribute:g,disableUnusedAttributes:v}}function _s(e,t,n){let r;function i(e){r=e}function a(t,i){e.drawArrays(r,t,i),n.update(i,r,1)}function o(t,i,a){a!==0&&(e.drawArraysInstanced(r,t,i,a),n.update(i,r,a))}function s(e,i,a){if(a===0)return;t.get(`WEBGL_multi_draw`).multiDrawArraysWEBGL(r,e,0,i,0,a);let o=0;for(let e=0;e<a;e++)o+=i[e];n.update(o,r,1)}function c(e,i,a,s){if(a===0)return;let c=t.get(`WEBGL_multi_draw`);if(c===null)for(let t=0;t<e.length;t++)o(e[t],i[t],s[t]);else{c.multiDrawArraysInstancedWEBGL(r,e,0,i,0,s,0,a);let t=0;for(let e=0;e<a;e++)t+=i[e]*s[e];n.update(t,r,1)}}this.setMode=i,this.render=a,this.renderInstances=o,this.renderMultiDraw=s,this.renderMultiDrawInstances=c}function vs(e,t,n,r){let i;function a(){if(i!==void 0)return i;if(t.has(`EXT_texture_filter_anisotropic`)===!0){let n=t.get(`EXT_texture_filter_anisotropic`);i=e.getParameter(n.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(t){return t===1023||r.convert(t)===e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT)}function s(n){let i=n===1016&&(t.has(`EXT_color_buffer_half_float`)||t.has(`EXT_color_buffer_float`));return!(n!==1009&&r.convert(n)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE)&&n!==1015&&!i)}function c(t){if(t===`highp`){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return`highp`;t=`mediump`}return t===`mediump`&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?`mediump`:`lowp`}let l=n.precision===void 0?`highp`:n.precision,u=c(l);u!==l&&(N(`WebGLRenderer:`,l,`not supported, using`,u,`instead.`),l=u);let d=n.logarithmicDepthBuffer===!0,f=n.reversedDepthBuffer===!0&&t.has(`EXT_clip_control`),p=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),m=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),h=e.getParameter(e.MAX_TEXTURE_SIZE),g=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),_=e.getParameter(e.MAX_VERTEX_ATTRIBS),v=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),y=e.getParameter(e.MAX_VARYING_VECTORS),b=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),x=e.getParameter(e.MAX_SAMPLES),S=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:a,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:s,precision:l,logarithmicDepthBuffer:d,reversedDepthBuffer:f,maxTextures:p,maxVertexTextures:m,maxTextureSize:h,maxCubemapSize:g,maxAttributes:_,maxVertexUniforms:v,maxVaryings:y,maxFragmentUniforms:b,maxSamples:x,samples:S}}function ys(e){let t=this,n=null,r=0,i=!1,a=!1,o=new yi,s=new Lt,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(e,t){let n=e.length!==0||t||r!==0||i;return i=t,r=e.length,n},this.beginShadows=function(){a=!0,u(null)},this.endShadows=function(){a=!1},this.setGlobalState=function(e,t){n=u(e,t,0)},this.setState=function(t,o,s){let d=t.clippingPlanes,f=t.clipIntersection,p=t.clipShadows,m=e.get(t);if(!i||d===null||d.length===0||a&&!p)a?u(null):l();else{let e=a?0:r,t=e*4,i=m.clippingState||null;c.value=i,i=u(d,o,t,s);for(let e=0;e!==t;++e)i[e]=n[e];m.clippingState=i,this.numIntersection=f?this.numPlanes:0,this.numPlanes+=e}};function l(){c.value!==n&&(c.value=n,c.needsUpdate=r>0),t.numPlanes=r,t.numIntersection=0}function u(e,n,r,i){let a=e===null?0:e.length,l=null;if(a!==0){if(l=c.value,i!==!0||l===null){let t=r+a*4,i=n.matrixWorldInverse;s.getNormalMatrix(i),(l===null||l.length<t)&&(l=new Float32Array(t));for(let t=0,n=r;t!==a;++t,n+=4)o.copy(e[t]).applyMatrix4(i,s),o.normal.toArray(l,n),l[n+3]=o.constant}c.value=l,c.needsUpdate=!0}return t.numPlanes=a,t.numIntersection=0,l}}var bs=4,xs=[.125,.215,.35,.446,.526,.582],Ss=20,Cs=256,ws=new Vo,Ts=new R,Es=null,Ds=0,Os=0,ks=!1,As=new I,js=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,r=100,i={}){let{size:a=256,position:o=As}=i;Es=this._renderer.getRenderTarget(),Ds=this._renderer.getActiveCubeFace(),Os=this._renderer.getActiveMipmapLevel(),ks=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let s=this._allocateTargets();return s.depthBuffer=!0,this._sceneToCubeUV(e,n,r,s,o),t>0&&this._blur(s,0,0,t),this._applyPMREM(s),this._cleanup(s),s}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Rs(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Ls(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=2**this._lodMax}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Es,Ds,Os),this._renderer.xr.enabled=ks,e.scissorTest=!1,Ps(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===301||e.mapping===302?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Es=this._renderer.getRenderTarget(),Ds=this._renderer.getActiveCubeFace(),Os=this._renderer.getActiveMipmapLevel(),ks=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:C,minFilter:C,generateMipmaps:!1,type:re,format:de,colorSpace:st,depthBuffer:!1},r=Ns(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Ns(e,t,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=Ms(r)),this._blurMaterial=Is(r,e,t),this._ggxMaterial=Fs(r,e,t)}return r}_compileMaterial(e){let t=new z(new Fr,e);this._renderer.compile(t,ws)}_sceneToCubeUV(e,t,n,r,i){let a=new Bo(90,1,t,n),o=[1,-1,1,1,1,1],s=[1,1,1,-1,-1,-1],c=this._renderer,l=c.autoClear,u=c.toneMapping;c.getClearColor(Ts),c.toneMapping=0,c.autoClear=!1,c.state.buffers.depth.getReversed()&&(c.setRenderTarget(r),c.clearDepth(),c.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new z(new ki,new Kr({name:`PMREM.Background`,side:1,depthWrite:!1,depthTest:!1})));let d=this._backgroundBox,f=d.material,p=!1,m=e.background;m?m.isColor&&(f.color.copy(m),e.background=null,p=!0):(f.color.copy(Ts),p=!0);for(let t=0;t<6;t++){let n=t%3;n===0?(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x+s[t],i.y,i.z)):n===1?(a.up.set(0,0,o[t]),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y+s[t],i.z)):(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y,i.z+s[t]));let l=this._cubeSize;Ps(r,n*l,t>2?l:0,l,l),c.setRenderTarget(r),p&&c.render(d,a),c.render(e,a)}c.toneMapping=u,c.autoClear=l,e.background=m}_textureToCubeUV(e,t){let n=this._renderer,r=e.mapping===301||e.mapping===302;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=Rs()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Ls());let i=r?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=i;let o=i.uniforms;o.envMap.value=e;let s=this._cubeSize;Ps(t,0,0,3*s,2*s),n.setRenderTarget(t),n.render(a,ws)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let r=this._lodMeshes.length;for(let t=1;t<r;t++)this._applyGGXFilter(e,t-1,t);t.autoClear=n}_applyGGXFilter(e,t,n){let r=this._renderer,i=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let s=a.uniforms,c=n/(this._lodMeshes.length-1),l=t/(this._lodMeshes.length-1),u=Math.sqrt(c*c-l*l)*(0+c*1.25),{_lodMax:d}=this,f=this._sizeLods[n],p=3*f*(n>d-bs?n-d+bs:0),m=4*(this._cubeSize-f);s.envMap.value=e.texture,s.roughness.value=u,s.mipInt.value=d-t,Ps(i,p,m,3*f,2*f),r.setRenderTarget(i),r.render(o,ws),s.envMap.value=i.texture,s.roughness.value=0,s.mipInt.value=d-n,Ps(e,p,m,3*f,2*f),r.setRenderTarget(e),r.render(o,ws)}_blur(e,t,n,r,i){let a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,r,`latitudinal`,i),this._halfBlur(a,e,n,n,r,`longitudinal`,i)}_halfBlur(e,t,n,r,i,a,o){let s=this._renderer,c=this._blurMaterial;a!==`latitudinal`&&a!==`longitudinal`&&P(`blur direction must be either latitudinal or longitudinal!`);let l=this._lodMeshes[r];l.material=c;let u=c.uniforms,d=this._sizeLods[n]-1,f=isFinite(i)?Math.PI/(2*d):2*Math.PI/39,p=i/f,m=isFinite(i)?1+Math.floor(3*p):Ss;m>Ss&&N(`sigmaRadians, ${i}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${Ss}`);let h=[],g=0;for(let e=0;e<Ss;++e){let t=e/p,n=Math.exp(-t*t/2);h.push(n),e===0?g+=n:e<m&&(g+=2*n)}for(let e=0;e<h.length;e++)h[e]=h[e]/g;u.envMap.value=e.texture,u.samples.value=m,u.weights.value=h,u.latitudinal.value=a===`latitudinal`,o&&(u.poleAxis.value=o);let{_lodMax:_}=this;u.dTheta.value=f,u.mipInt.value=_-n;let v=this._sizeLods[r];Ps(t,3*v*(r>_-bs?r-_+bs:0),4*(this._cubeSize-v),3*v,2*v),s.setRenderTarget(t),s.render(l,ws)}};function Ms(e){let t=[],n=[],r=[],i=e,a=e-bs+1+xs.length;for(let o=0;o<a;o++){let a=2**i;t.push(a);let s=1/a;o>e-bs?s=xs[o-e+bs-1]:o===0&&(s=0),n.push(s);let c=1/(a-2),l=-c,u=1+c,d=[l,l,u,l,u,u,l,l,u,u,l,u],f=new Float32Array(108),p=new Float32Array(72),m=new Float32Array(36);for(let e=0;e<6;e++){let t=e%3*2/3-1,n=e>2?0:-1,r=[t,n,0,t+2/3,n,0,t+2/3,n+1,0,t,n,0,t+2/3,n+1,0,t,n+1,0];f.set(r,18*e),p.set(d,12*e);let i=[e,e,e,e,e,e];m.set(i,6*e)}let h=new Fr;h.setAttribute(`position`,new br(f,3)),h.setAttribute(`uv`,new br(p,2)),h.setAttribute(`faceIndex`,new br(m,1)),r.push(new z(h,null)),i>bs&&i--}return{lodMeshes:r,sizeLods:t,sigmas:n}}function Ns(e,t,n){let r=new tn(e,t,n);return r.texture.mapping=306,r.texture.name=`PMREM.cubeUv`,r.scissorTest=!0,r}function Ps(e,t,n,r,i){e.viewport.set(t,n,r,i),e.scissor.set(t,n,r,i)}function Fs(e,t,n){return new co({name:`PMREMGGXConvolution`,defines:{GGX_SAMPLES:Cs,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:zs(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Is(e,t,n){let r=new Float32Array(Ss),i=new I(0,1,0);return new co({name:`SphericalGaussianBlur`,defines:{n:Ss,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:r},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:zs(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Ls(){return new co({name:`EquirectangularToCubeUV`,uniforms:{envMap:{value:null}},vertexShader:zs(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Rs(){return new co({name:`CubemapToCubeUV`,uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:zs(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function zs(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}var Bs=class extends tn{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},r=[n,n,n,n,n,n];this.texture=new wi(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},r=new ki(5,5,5),i=new co({name:`CubemapFromEquirect`,uniforms:to(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:1,blending:0});i.uniforms.tEquirect.value=t;let a=new z(r,i),o=t.minFilter;return t.minFilter===1008&&(t.minFilter=C),new Ko(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,r=!0){let i=e.getRenderTarget();for(let i=0;i<6;i++)e.setRenderTarget(this,i),e.clear(t,n,r);e.setRenderTarget(i)}};function Vs(e){let t=new WeakMap,n=new WeakMap,r=null;function i(e,t=!1){return e==null?null:t?o(e):a(e)}function a(n){if(n&&n.isTexture){let r=n.mapping;if(r===303||r===304){if(t.has(n)){let e=t.get(n).texture;return s(e,n.mapping)}{let r=n.image;if(r&&r.height>0){let i=new Bs(r.height);return i.fromEquirectangularTexture(e,n),t.set(n,i),n.addEventListener(`dispose`,l),s(i.texture,n.mapping)}return null}}}return n}function o(t){if(t&&t.isTexture){let i=t.mapping,a=i===303||i===304,o=i===301||i===302;if(a||o){let i=n.get(t),s=i===void 0?0:i.texture.pmremVersion;if(t.isRenderTargetTexture&&t.pmremVersion!==s)return r===null&&(r=new js(e)),i=a?r.fromEquirectangular(t,i):r.fromCubemap(t,i),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),i.texture;if(i!==void 0)return i.texture;{let s=t.image;return a&&s&&s.height>0||o&&s&&c(s)?(r===null&&(r=new js(e)),i=a?r.fromEquirectangular(t):r.fromCubemap(t),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),t.addEventListener(`dispose`,u),i.texture):null}}}return t}function s(e,t){return t===303?e.mapping=301:t===304&&(e.mapping=302),e}function c(e){let t=0;for(let n=0;n<6;n++)e[n]!==void 0&&t++;return t===6}function l(e){let n=e.target;n.removeEventListener(`dispose`,l);let r=t.get(n);r!==void 0&&(t.delete(n),r.dispose())}function u(e){let t=e.target;t.removeEventListener(`dispose`,u);let r=n.get(t);r!==void 0&&(n.delete(t),r.dispose())}function d(){t=new WeakMap,n=new WeakMap,r!==null&&(r.dispose(),r=null)}return{get:i,dispose:d}}function Hs(e){let t={};function n(n){if(t[n]!==void 0)return t[n];let r=e.getExtension(n);return t[n]=r,r}return{has:function(e){return n(e)!==null},init:function(){n(`EXT_color_buffer_float`),n(`WEBGL_clip_cull_distance`),n(`OES_texture_float_linear`),n(`EXT_color_buffer_half_float`),n(`WEBGL_multisampled_render_to_texture`),n(`WEBGL_render_shared_exponent`)},get:function(e){let t=n(e);return t===null&&xt(`WebGLRenderer: `+e+` extension not supported.`),t}}}function Us(e,t,n,r){let i={},a=new WeakMap;function o(e){let s=e.target;s.index!==null&&t.remove(s.index);for(let e in s.attributes)t.remove(s.attributes[e]);s.removeEventListener(`dispose`,o),delete i[s.id];let c=a.get(s);c&&(t.remove(c),a.delete(s)),r.releaseStatesOfGeometry(s),s.isInstancedBufferGeometry===!0&&delete s._maxInstanceCount,n.memory.geometries--}function s(e,t){return i[t.id]===!0||(t.addEventListener(`dispose`,o),i[t.id]=!0,n.memory.geometries++),t}function c(n){let r=n.attributes;for(let n in r)t.update(r[n],e.ARRAY_BUFFER)}function l(e){let n=[],r=e.index,i=e.attributes.position,o=0;if(i===void 0)return;if(r!==null){let e=r.array;o=r.version;for(let t=0,r=e.length;t<r;t+=3){let r=e[t+0],i=e[t+1],a=e[t+2];n.push(r,i,i,a,a,r)}}else{let e=i.array;o=i.version;for(let t=0,r=e.length/3-1;t<r;t+=3){let e=t+0,r=t+1,i=t+2;n.push(e,r,r,i,i,e)}}let s=new(i.count>=65535?Sr:xr)(n,1);s.version=o;let c=a.get(e);c&&t.remove(c),a.set(e,s)}function u(e){let t=a.get(e);if(t){let n=e.index;n!==null&&t.version<n.version&&l(e)}else l(e);return a.get(e)}return{get:s,update:c,getWireframeAttribute:u}}function Ws(e,t,n){let r;function i(e){r=e}let a,o;function s(e){a=e.type,o=e.bytesPerElement}function c(t,i){e.drawElements(r,i,a,t*o),n.update(i,r,1)}function l(t,i,s){s!==0&&(e.drawElementsInstanced(r,i,a,t*o,s),n.update(i,r,s))}function u(e,i,o){if(o===0)return;t.get(`WEBGL_multi_draw`).multiDrawElementsWEBGL(r,i,0,a,e,0,o);let s=0;for(let e=0;e<o;e++)s+=i[e];n.update(s,r,1)}function d(e,i,s,c){if(s===0)return;let u=t.get(`WEBGL_multi_draw`);if(u===null)for(let t=0;t<e.length;t++)l(e[t]/o,i[t],c[t]);else{u.multiDrawElementsInstancedWEBGL(r,i,0,a,e,0,c,0,s);let t=0;for(let e=0;e<s;e++)t+=i[e]*c[e];n.update(t,r,1)}}this.setMode=i,this.setIndex=s,this.render=c,this.renderInstances=l,this.renderMultiDraw=u,this.renderMultiDrawInstances=d}function Gs(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function r(t,r,i){switch(n.calls++,r){case e.TRIANGLES:n.triangles+=t/3*i;break;case e.LINES:n.lines+=t/2*i;break;case e.LINE_STRIP:n.lines+=i*(t-1);break;case e.LINE_LOOP:n.lines+=i*t;break;case e.POINTS:n.points+=i*t;break;default:P(`WebGLInfo: Unknown draw mode:`,r)}}function i(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:i,update:r}}function Ks(e,t,n){let r=new WeakMap,i=new $t;function a(a,o,s){let c=a.morphTargetInfluences,l=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,u=l===void 0?0:l.length,d=r.get(o);if(d===void 0||d.count!==u){d!==void 0&&d.texture.dispose();let e=o.morphAttributes.position!==void 0,n=o.morphAttributes.normal!==void 0,a=o.morphAttributes.color!==void 0,s=o.morphAttributes.position||[],c=o.morphAttributes.normal||[],l=o.morphAttributes.color||[],f=0;e===!0&&(f=1),n===!0&&(f=2),a===!0&&(f=3);let p=o.attributes.position.count*f,m=1;p>t.maxTextureSize&&(m=Math.ceil(p/t.maxTextureSize),p=t.maxTextureSize);let h=new Float32Array(p*m*4*u),g=new nn(h,p,m,u);g.type=k,g.needsUpdate=!0;let _=f*4;for(let t=0;t<u;t++){let r=s[t],o=c[t],u=l[t],d=p*m*4*t;for(let t=0;t<r.count;t++){let s=t*_;e===!0&&(i.fromBufferAttribute(r,t),h[d+s+0]=i.x,h[d+s+1]=i.y,h[d+s+2]=i.z,h[d+s+3]=0),n===!0&&(i.fromBufferAttribute(o,t),h[d+s+4]=i.x,h[d+s+5]=i.y,h[d+s+6]=i.z,h[d+s+7]=0),a===!0&&(i.fromBufferAttribute(u,t),h[d+s+8]=i.x,h[d+s+9]=i.y,h[d+s+10]=i.z,h[d+s+11]=u.itemSize===4?i.w:1)}}d={count:u,texture:g,size:new F(p,m)},r.set(o,d);function v(){g.dispose(),r.delete(o),o.removeEventListener(`dispose`,v)}o.addEventListener(`dispose`,v)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)s.getUniforms().setValue(e,`morphTexture`,a.morphTexture,n);else{let t=0;for(let e=0;e<c.length;e++)t+=c[e];let n=o.morphTargetsRelative?1:1-t;s.getUniforms().setValue(e,`morphTargetBaseInfluence`,n),s.getUniforms().setValue(e,`morphTargetInfluences`,c)}s.getUniforms().setValue(e,`morphTargetsTexture`,d.texture,n),s.getUniforms().setValue(e,`morphTargetsTextureSize`,d.size)}return{update:a}}function qs(e,t,n,r,i){let a=new WeakMap;function o(r){let o=i.render.frame,s=r.geometry,l=t.get(r,s);if(a.get(l)!==o&&(t.update(l),a.set(l,o)),r.isInstancedMesh&&(r.hasEventListener(`dispose`,c)===!1&&r.addEventListener(`dispose`,c),a.get(r)!==o&&(n.update(r.instanceMatrix,e.ARRAY_BUFFER),r.instanceColor!==null&&n.update(r.instanceColor,e.ARRAY_BUFFER),a.set(r,o))),r.isSkinnedMesh){let e=r.skeleton;a.get(e)!==o&&(e.update(),a.set(e,o))}return l}function s(){a=new WeakMap}function c(e){let t=e.target;t.removeEventListener(`dispose`,c),r.releaseStatesOfObject(t),n.remove(t.instanceMatrix),t.instanceColor!==null&&n.remove(t.instanceColor)}return{update:o,dispose:s}}var Js={1:`LINEAR_TONE_MAPPING`,2:`REINHARD_TONE_MAPPING`,3:`CINEON_TONE_MAPPING`,4:`ACES_FILMIC_TONE_MAPPING`,6:`AGX_TONE_MAPPING`,7:`NEUTRAL_TONE_MAPPING`,5:`CUSTOM_TONE_MAPPING`};function Ys(e,t,n,r,i){let a=new tn(t,n,{type:e,depthBuffer:r,stencilBuffer:i}),o=new tn(t,n,{type:re,depthBuffer:!1,stencilBuffer:!1}),s=new Fr;s.setAttribute(`position`,new Cr([-1,3,0,-1,-1,0,3,-1,0],3)),s.setAttribute(`uv`,new Cr([0,2,0,0,2,0],2));let c=new lo({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),l=new z(s,c),u=new Vo(-1,1,1,-1,0,1),d=null,f=null,p=!1,m,h=null,g=[],_=!1;this.setSize=function(e,t){a.setSize(e,t),o.setSize(e,t);for(let n=0;n<g.length;n++){let r=g[n];r.setSize&&r.setSize(e,t)}},this.setEffects=function(e){g=e,_=g.length>0&&g[0].isRenderPass===!0;let t=a.width,n=a.height;for(let e=0;e<g.length;e++){let r=g[e];r.setSize&&r.setSize(t,n)}},this.begin=function(e,t){if(p||e.toneMapping===0&&g.length===0)return!1;if(h=t,t!==null){let e=t.width,n=t.height;(a.width!==e||a.height!==n)&&this.setSize(e,n)}return _===!1&&e.setRenderTarget(a),m=e.toneMapping,e.toneMapping=0,!0},this.hasRenderPass=function(){return _},this.end=function(e,t){e.toneMapping=m,p=!0;let n=a,r=o;for(let i=0;i<g.length;i++){let a=g[i];if(a.enabled!==!1&&(a.render(e,r,n,t),a.needsSwap!==!1)){let e=n;n=r,r=e}}if(d!==e.outputColorSpace||f!==e.toneMapping){d=e.outputColorSpace,f=e.toneMapping,c.defines={},Ht.getTransfer(d)===`srgb`&&(c.defines.SRGB_TRANSFER=``);let t=Js[f];t&&(c.defines[t]=``),c.needsUpdate=!0}c.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(h),e.render(l,u),h=null,p=!1},this.isCompositing=function(){return p},this.dispose=function(){a.dispose(),o.dispose(),s.dispose(),c.dispose()}}var Xs=new Qt,Zs=new Ei(1,1),Qs=new nn,$s=new rn,ec=new wi,tc=[],nc=[],rc=new Float32Array(16),ic=new Float32Array(9),ac=new Float32Array(4);function oc(e,t,n){let r=e[0];if(r<=0||r>0)return e;let i=t*n,a=tc[i];if(a===void 0&&(a=new Float32Array(i),tc[i]=a),t!==0){r.toArray(a,0);for(let r=1,i=0;r!==t;++r)i+=n,e[r].toArray(a,i)}return a}function sc(e,t){if(e.length!==t.length)return!1;for(let n=0,r=e.length;n<r;n++)if(e[n]!==t[n])return!1;return!0}function cc(e,t){for(let n=0,r=t.length;n<r;n++)e[n]=t[n]}function lc(e,t){let n=nc[t];n===void 0&&(n=new Int32Array(t),nc[t]=n);for(let r=0;r!==t;++r)n[r]=e.allocateTextureUnit();return n}function uc(e,t){let n=this.cache;n[0]!==t&&(e.uniform1f(this.addr,t),n[0]=t)}function dc(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(sc(n,t))return;e.uniform2fv(this.addr,t),cc(n,t)}}function fc(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else if(t.r!==void 0)(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b);else{if(sc(n,t))return;e.uniform3fv(this.addr,t),cc(n,t)}}function pc(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(sc(n,t))return;e.uniform4fv(this.addr,t),cc(n,t)}}function mc(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(sc(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),cc(n,t)}else{if(sc(n,r))return;ac.set(r),e.uniformMatrix2fv(this.addr,!1,ac),cc(n,r)}}function hc(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(sc(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),cc(n,t)}else{if(sc(n,r))return;ic.set(r),e.uniformMatrix3fv(this.addr,!1,ic),cc(n,r)}}function gc(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(sc(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),cc(n,t)}else{if(sc(n,r))return;rc.set(r),e.uniformMatrix4fv(this.addr,!1,rc),cc(n,r)}}function _c(e,t){let n=this.cache;n[0]!==t&&(e.uniform1i(this.addr,t),n[0]=t)}function vc(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(sc(n,t))return;e.uniform2iv(this.addr,t),cc(n,t)}}function yc(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(sc(n,t))return;e.uniform3iv(this.addr,t),cc(n,t)}}function bc(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(sc(n,t))return;e.uniform4iv(this.addr,t),cc(n,t)}}function xc(e,t){let n=this.cache;n[0]!==t&&(e.uniform1ui(this.addr,t),n[0]=t)}function Sc(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(sc(n,t))return;e.uniform2uiv(this.addr,t),cc(n,t)}}function Cc(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(sc(n,t))return;e.uniform3uiv(this.addr,t),cc(n,t)}}function wc(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(sc(n,t))return;e.uniform4uiv(this.addr,t),cc(n,t)}}function Tc(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i);let a;this.type===e.SAMPLER_2D_SHADOW?(Zs.compareFunction=n.isReversedDepthBuffer()?518:515,a=Zs):a=Xs,n.setTexture2D(t||a,i)}function Ec(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture3D(t||$s,i)}function Dc(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTextureCube(t||ec,i)}function Oc(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture2DArray(t||Qs,i)}function kc(e){switch(e){case 5126:return uc;case 35664:return dc;case 35665:return fc;case 35666:return pc;case 35674:return mc;case 35675:return hc;case 35676:return gc;case 5124:case 35670:return _c;case 35667:case 35671:return vc;case 35668:case 35672:return yc;case 35669:case 35673:return bc;case 5125:return xc;case 36294:return Sc;case 36295:return Cc;case 36296:return wc;case 35678:case 36198:case 36298:case 36306:case 35682:return Tc;case 35679:case 36299:case 36307:return Ec;case 35680:case 36300:case 36308:case 36293:return Dc;case 36289:case 36303:case 36311:case 36292:return Oc}}function Ac(e,t){e.uniform1fv(this.addr,t)}function jc(e,t){let n=oc(t,this.size,2);e.uniform2fv(this.addr,n)}function Mc(e,t){let n=oc(t,this.size,3);e.uniform3fv(this.addr,n)}function Nc(e,t){let n=oc(t,this.size,4);e.uniform4fv(this.addr,n)}function Pc(e,t){let n=oc(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function Fc(e,t){let n=oc(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function Ic(e,t){let n=oc(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function Lc(e,t){e.uniform1iv(this.addr,t)}function Rc(e,t){e.uniform2iv(this.addr,t)}function zc(e,t){e.uniform3iv(this.addr,t)}function Bc(e,t){e.uniform4iv(this.addr,t)}function Vc(e,t){e.uniform1uiv(this.addr,t)}function Hc(e,t){e.uniform2uiv(this.addr,t)}function Uc(e,t){e.uniform3uiv(this.addr,t)}function Wc(e,t){e.uniform4uiv(this.addr,t)}function Gc(e,t,n){let r=this.cache,i=t.length,a=lc(n,i);sc(r,a)||(e.uniform1iv(this.addr,a),cc(r,a));let o;o=this.type===e.SAMPLER_2D_SHADOW?Zs:Xs;for(let e=0;e!==i;++e)n.setTexture2D(t[e]||o,a[e])}function Kc(e,t,n){let r=this.cache,i=t.length,a=lc(n,i);sc(r,a)||(e.uniform1iv(this.addr,a),cc(r,a));for(let e=0;e!==i;++e)n.setTexture3D(t[e]||$s,a[e])}function qc(e,t,n){let r=this.cache,i=t.length,a=lc(n,i);sc(r,a)||(e.uniform1iv(this.addr,a),cc(r,a));for(let e=0;e!==i;++e)n.setTextureCube(t[e]||ec,a[e])}function Jc(e,t,n){let r=this.cache,i=t.length,a=lc(n,i);sc(r,a)||(e.uniform1iv(this.addr,a),cc(r,a));for(let e=0;e!==i;++e)n.setTexture2DArray(t[e]||Qs,a[e])}function Yc(e){switch(e){case 5126:return Ac;case 35664:return jc;case 35665:return Mc;case 35666:return Nc;case 35674:return Pc;case 35675:return Fc;case 35676:return Ic;case 5124:case 35670:return Lc;case 35667:case 35671:return Rc;case 35668:case 35672:return zc;case 35669:case 35673:return Bc;case 5125:return Vc;case 36294:return Hc;case 36295:return Uc;case 36296:return Wc;case 35678:case 36198:case 36298:case 36306:case 35682:return Gc;case 35679:case 36299:case 36307:return Kc;case 35680:case 36300:case 36308:case 36293:return qc;case 36289:case 36303:case 36311:case 36292:return Jc}}var Xc=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=kc(t.type)}},Zc=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Yc(t.type)}},Qc=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let r=this.seq;for(let i=0,a=r.length;i!==a;++i){let a=r[i];a.setValue(e,t[a.id],n)}}},$c=/(\w+)(\])?(\[|\.)?/g;function el(e,t){e.seq.push(t),e.map[t.id]=t}function tl(e,t,n){let r=e.name,i=r.length;for($c.lastIndex=0;;){let a=$c.exec(r),o=$c.lastIndex,s=a[1],c=a[2]===`]`,l=a[3];if(c&&(s|=0),l===void 0||l===`[`&&o+2===i){el(n,l===void 0?new Xc(s,e,t):new Zc(s,e,t));break}{let e=n.map[s];e===void 0&&(e=new Qc(s),el(n,e)),n=e}}}var nl=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let r=0;r<n;++r){let n=e.getActiveUniform(t,r);tl(n,e.getUniformLocation(t,n.name),this)}let r=[],i=[];for(let t of this.seq)t.type===e.SAMPLER_2D_SHADOW||t.type===e.SAMPLER_CUBE_SHADOW||t.type===e.SAMPLER_2D_ARRAY_SHADOW?r.push(t):i.push(t);r.length>0&&(this.seq=r.concat(i))}setValue(e,t,n,r){let i=this.map[t];i!==void 0&&i.setValue(e,n,r)}setOptional(e,t,n){let r=t[n];r!==void 0&&this.setValue(e,n,r)}static upload(e,t,n,r){for(let i=0,a=t.length;i!==a;++i){let a=t[i],o=n[a.id];o.needsUpdate!==!1&&a.setValue(e,o.value,r)}}static seqWithValue(e,t){let n=[];for(let r=0,i=e.length;r!==i;++r){let i=e[r];i.id in t&&n.push(i)}return n}};function rl(e,t,n){let r=e.createShader(t);return e.shaderSource(r,n),e.compileShader(r),r}var il=37297,al=0;function ol(e,t){let n=e.split(`
`),r=[],i=Math.max(t-6,0),a=Math.min(t+6,n.length);for(let e=i;e<a;e++){let i=e+1;r.push(`${i===t?`>`:` `} ${i}: ${n[e]}`)}return r.join(`
`)}var sl=new Lt;function cl(e){Ht._getMatrix(sl,Ht.workingColorSpace,e);let t=`mat3( ${sl.elements.map(e=>e.toFixed(4))} )`;switch(Ht.getTransfer(e)){case ct:return[t,`LinearTransferOETF`];case lt:return[t,`sRGBTransferOETF`];default:return N(`WebGLProgram: Unsupported color space: `,e),[t,`LinearTransferOETF`]}}function ll(e,t,n){let r=e.getShaderParameter(t,e.COMPILE_STATUS),i=(e.getShaderInfoLog(t)||``).trim();if(r&&i===``)return``;let a=/ERROR: 0:(\d+)/.exec(i);if(a){let r=parseInt(a[1]);return n.toUpperCase()+`

`+i+`

`+ol(e.getShaderSource(t),r)}return i}function ul(e,t){let n=cl(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${n[1]}( vec4( value.rgb * ${n[0]}, value.a ) );`,`}`].join(`
`)}var dl={1:`Linear`,2:`Reinhard`,3:`Cineon`,4:`ACESFilmic`,6:`AgX`,7:`Neutral`,5:`Custom`};function fl(e,t){let n=dl[t];return n===void 0?(N(`WebGLProgram: Unsupported toneMapping:`,t),`vec3 `+e+`( vec3 color ) { return LinearToneMapping( color ); }`):`vec3 `+e+`( vec3 color ) { return `+n+`ToneMapping( color ); }`}var pl=new I;function ml(){return Ht.getLuminanceCoefficients(pl),[`float luminance( const in vec3 rgb ) {`,`	const vec3 weights = vec3( ${pl.x.toFixed(4)}, ${pl.y.toFixed(4)}, ${pl.z.toFixed(4)} );`,`	return dot( weights, rgb );`,`}`].join(`
`)}function hl(e){return[e.extensionClipCullDistance?`#extension GL_ANGLE_clip_cull_distance : require`:``,e.extensionMultiDraw?`#extension GL_ANGLE_multi_draw : require`:``].filter(vl).join(`
`)}function gl(e){let t=[];for(let n in e){let r=e[n];r!==!1&&t.push(`#define `+n+` `+r)}return t.join(`
`)}function _l(e,t){let n={},r=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let i=0;i<r;i++){let r=e.getActiveAttrib(t,i),a=r.name,o=1;r.type===e.FLOAT_MAT2&&(o=2),r.type===e.FLOAT_MAT3&&(o=3),r.type===e.FLOAT_MAT4&&(o=4),n[a]={type:r.type,location:e.getAttribLocation(t,a),locationSize:o}}return n}function vl(e){return e!==``}function yl(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function bl(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var xl=/^[ \t]*#include +<([\w\d./]+)>/gm;function Sl(e){return e.replace(xl,wl)}var Cl=new Map;function wl(e,t){let n=us[t];if(n===void 0){let e=Cl.get(t);if(e!==void 0)n=us[e],N(`WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.`,t,e);else throw Error(`Can not resolve #include <`+t+`>`)}return Sl(n)}var Tl=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function El(e){return e.replace(Tl,Dl)}function Dl(e,t,n,r){let i=``;for(let e=parseInt(t);e<parseInt(n);e++)i+=r.replace(/\[\s*i\s*\]/g,`[ `+e+` ]`).replace(/UNROLLED_LOOP_INDEX/g,e);return i}function Ol(e){let t=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision===`highp`?t+=`
#define HIGH_PRECISION`:e.precision===`mediump`?t+=`
#define MEDIUM_PRECISION`:e.precision===`lowp`&&(t+=`
#define LOW_PRECISION`),t}var kl={1:`SHADOWMAP_TYPE_PCF`,3:`SHADOWMAP_TYPE_VSM`};function Al(e){return kl[e.shadowMapType]||`SHADOWMAP_TYPE_BASIC`}var jl={301:`ENVMAP_TYPE_CUBE`,302:`ENVMAP_TYPE_CUBE`,306:`ENVMAP_TYPE_CUBE_UV`};function Ml(e){return e.envMap===!1?`ENVMAP_TYPE_CUBE`:jl[e.envMapMode]||`ENVMAP_TYPE_CUBE`}var Nl={302:`ENVMAP_MODE_REFRACTION`};function Pl(e){return e.envMap===!1?`ENVMAP_MODE_REFLECTION`:Nl[e.envMapMode]||`ENVMAP_MODE_REFLECTION`}var Fl={0:`ENVMAP_BLENDING_MULTIPLY`,1:`ENVMAP_BLENDING_MIX`,2:`ENVMAP_BLENDING_ADD`};function Il(e){return e.envMap===!1?`ENVMAP_BLENDING_NONE`:Fl[e.combine]||`ENVMAP_BLENDING_NONE`}function Ll(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,r=1/t;return{texelWidth:1/(3*Math.max(2**n,112)),texelHeight:r,maxMip:n}}function Rl(e,t,n,r){let i=e.getContext(),a=n.defines,o=n.vertexShader,s=n.fragmentShader,c=Al(n),l=Ml(n),u=Pl(n),d=Il(n),f=Ll(n),p=hl(n),m=gl(a),h=i.createProgram(),g,_,v=n.glslVersion?`#version `+n.glslVersion+`
`:``;n.isRawShaderMaterial?(g=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(vl).join(`
`),g.length>0&&(g+=`
`),_=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(vl).join(`
`),_.length>0&&(_+=`
`)):(g=[Ol(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.extensionClipCullDistance?`#define USE_CLIP_DISTANCE`:``,n.batching?`#define USE_BATCHING`:``,n.batchingColor?`#define USE_BATCHING_COLOR`:``,n.instancing?`#define USE_INSTANCING`:``,n.instancingColor?`#define USE_INSTANCING_COLOR`:``,n.instancingMorph?`#define USE_INSTANCING_MORPH`:``,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.map?`#define USE_MAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+u:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.displacementMap?`#define USE_DISPLACEMENTMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.mapUv?`#define MAP_UV `+n.mapUv:``,n.alphaMapUv?`#define ALPHAMAP_UV `+n.alphaMapUv:``,n.lightMapUv?`#define LIGHTMAP_UV `+n.lightMapUv:``,n.aoMapUv?`#define AOMAP_UV `+n.aoMapUv:``,n.emissiveMapUv?`#define EMISSIVEMAP_UV `+n.emissiveMapUv:``,n.bumpMapUv?`#define BUMPMAP_UV `+n.bumpMapUv:``,n.normalMapUv?`#define NORMALMAP_UV `+n.normalMapUv:``,n.displacementMapUv?`#define DISPLACEMENTMAP_UV `+n.displacementMapUv:``,n.metalnessMapUv?`#define METALNESSMAP_UV `+n.metalnessMapUv:``,n.roughnessMapUv?`#define ROUGHNESSMAP_UV `+n.roughnessMapUv:``,n.anisotropyMapUv?`#define ANISOTROPYMAP_UV `+n.anisotropyMapUv:``,n.clearcoatMapUv?`#define CLEARCOATMAP_UV `+n.clearcoatMapUv:``,n.clearcoatNormalMapUv?`#define CLEARCOAT_NORMALMAP_UV `+n.clearcoatNormalMapUv:``,n.clearcoatRoughnessMapUv?`#define CLEARCOAT_ROUGHNESSMAP_UV `+n.clearcoatRoughnessMapUv:``,n.iridescenceMapUv?`#define IRIDESCENCEMAP_UV `+n.iridescenceMapUv:``,n.iridescenceThicknessMapUv?`#define IRIDESCENCE_THICKNESSMAP_UV `+n.iridescenceThicknessMapUv:``,n.sheenColorMapUv?`#define SHEEN_COLORMAP_UV `+n.sheenColorMapUv:``,n.sheenRoughnessMapUv?`#define SHEEN_ROUGHNESSMAP_UV `+n.sheenRoughnessMapUv:``,n.specularMapUv?`#define SPECULARMAP_UV `+n.specularMapUv:``,n.specularColorMapUv?`#define SPECULAR_COLORMAP_UV `+n.specularColorMapUv:``,n.specularIntensityMapUv?`#define SPECULAR_INTENSITYMAP_UV `+n.specularIntensityMapUv:``,n.transmissionMapUv?`#define TRANSMISSIONMAP_UV `+n.transmissionMapUv:``,n.thicknessMapUv?`#define THICKNESSMAP_UV `+n.thicknessMapUv:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexColors?`#define USE_COLOR`:``,n.vertexAlphas?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.flatShading?`#define FLAT_SHADED`:``,n.skinning?`#define USE_SKINNING`:``,n.morphTargets?`#define USE_MORPHTARGETS`:``,n.morphNormals&&n.flatShading===!1?`#define USE_MORPHNORMALS`:``,n.morphColors?`#define USE_MORPHCOLORS`:``,n.morphTargetsCount>0?`#define MORPHTARGETS_TEXTURE_STRIDE `+n.morphTextureStride:``,n.morphTargetsCount>0?`#define MORPHTARGETS_COUNT `+n.morphTargetsCount:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.sizeAttenuation?`#define USE_SIZEATTENUATION`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 modelMatrix;`,`uniform mat4 modelViewMatrix;`,`uniform mat4 projectionMatrix;`,`uniform mat4 viewMatrix;`,`uniform mat3 normalMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,`#ifdef USE_INSTANCING`,`	attribute mat4 instanceMatrix;`,`#endif`,`#ifdef USE_INSTANCING_COLOR`,`	attribute vec3 instanceColor;`,`#endif`,`#ifdef USE_INSTANCING_MORPH`,`	uniform sampler2D morphTexture;`,`#endif`,`attribute vec3 position;`,`attribute vec3 normal;`,`attribute vec2 uv;`,`#ifdef USE_UV1`,`	attribute vec2 uv1;`,`#endif`,`#ifdef USE_UV2`,`	attribute vec2 uv2;`,`#endif`,`#ifdef USE_UV3`,`	attribute vec2 uv3;`,`#endif`,`#ifdef USE_TANGENT`,`	attribute vec4 tangent;`,`#endif`,`#if defined( USE_COLOR_ALPHA )`,`	attribute vec4 color;`,`#elif defined( USE_COLOR )`,`	attribute vec3 color;`,`#endif`,`#ifdef USE_SKINNING`,`	attribute vec4 skinIndex;`,`	attribute vec4 skinWeight;`,`#endif`,`
`].filter(vl).join(`
`),_=[Ol(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.alphaToCoverage?`#define ALPHA_TO_COVERAGE`:``,n.map?`#define USE_MAP`:``,n.matcap?`#define USE_MATCAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+l:``,n.envMap?`#define `+u:``,n.envMap?`#define `+d:``,f?`#define CUBEUV_TEXEL_WIDTH `+f.texelWidth:``,f?`#define CUBEUV_TEXEL_HEIGHT `+f.texelHeight:``,f?`#define CUBEUV_MAX_MIP `+f.maxMip+`.0`:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoat?`#define USE_CLEARCOAT`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.dispersion?`#define USE_DISPERSION`:``,n.iridescence?`#define USE_IRIDESCENCE`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaTest?`#define USE_ALPHATEST`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.sheen?`#define USE_SHEEN`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexColors||n.instancingColor?`#define USE_COLOR`:``,n.vertexAlphas||n.batchingColor?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.gradientMap?`#define USE_GRADIENTMAP`:``,n.flatShading?`#define FLAT_SHADED`:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.premultipliedAlpha?`#define PREMULTIPLIED_ALPHA`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.decodeVideoTexture?`#define DECODE_VIDEO_TEXTURE`:``,n.decodeVideoTextureEmissive?`#define DECODE_VIDEO_TEXTURE_EMISSIVE`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 viewMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,n.toneMapping===0?``:`#define TONE_MAPPING`,n.toneMapping===0?``:us.tonemapping_pars_fragment,n.toneMapping===0?``:fl(`toneMapping`,n.toneMapping),n.dithering?`#define DITHERING`:``,n.opaque?`#define OPAQUE`:``,us.colorspace_pars_fragment,ul(`linearToOutputTexel`,n.outputColorSpace),ml(),n.useDepthPacking?`#define DEPTH_PACKING `+n.depthPacking:``,`
`].filter(vl).join(`
`)),o=Sl(o),o=yl(o,n),o=bl(o,n),s=Sl(s),s=yl(s,n),s=bl(s,n),o=El(o),s=El(s),n.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,g=[p,`#define attribute in`,`#define varying out`,`#define texture2D texture`].join(`
`)+`
`+g,_=[`#define varying in`,n.glslVersion===`300 es`?``:`layout(location = 0) out highp vec4 pc_fragColor;`,n.glslVersion===`300 es`?``:`#define gl_FragColor pc_fragColor`,`#define gl_FragDepthEXT gl_FragDepth`,`#define texture2D texture`,`#define textureCube texture`,`#define texture2DProj textureProj`,`#define texture2DLodEXT textureLod`,`#define texture2DProjLodEXT textureProjLod`,`#define textureCubeLodEXT textureLod`,`#define texture2DGradEXT textureGrad`,`#define texture2DProjGradEXT textureProjGrad`,`#define textureCubeGradEXT textureGrad`].join(`
`)+`
`+_);let y=v+g+o,b=v+_+s,x=rl(i,i.VERTEX_SHADER,y),S=rl(i,i.FRAGMENT_SHADER,b);i.attachShader(h,x),i.attachShader(h,S),n.index0AttributeName===void 0?n.morphTargets===!0&&i.bindAttribLocation(h,0,`position`):i.bindAttribLocation(h,0,n.index0AttributeName),i.linkProgram(h);function C(t){if(e.debug.checkShaderErrors){let n=i.getProgramInfoLog(h)||``,r=i.getShaderInfoLog(x)||``,a=i.getShaderInfoLog(S)||``,o=n.trim(),s=r.trim(),c=a.trim(),l=!0,u=!0;if(i.getProgramParameter(h,i.LINK_STATUS)===!1){if(l=!1,typeof e.debug.onShaderError==`function`)e.debug.onShaderError(i,h,x,S);else{let e=ll(i,x,`vertex`),n=ll(i,S,`fragment`);P(`THREE.WebGLProgram: Shader Error `+i.getError()+` - VALIDATE_STATUS `+i.getProgramParameter(h,i.VALIDATE_STATUS)+`

Material Name: `+t.name+`
Material Type: `+t.type+`

Program Info Log: `+o+`
`+e+`
`+n)}}else o===``?(s===``||c===``)&&(u=!1):N(`WebGLProgram: Program Info Log:`,o);u&&(t.diagnostics={runnable:l,programLog:o,vertexShader:{log:s,prefix:g},fragmentShader:{log:c,prefix:_}})}i.deleteShader(x),i.deleteShader(S),w=new nl(i,h),T=_l(i,h)}let w;this.getUniforms=function(){return w===void 0&&C(this),w};let T;this.getAttributes=function(){return T===void 0&&C(this),T};let E=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return E===!1&&(E=i.getProgramParameter(h,il)),E},this.destroy=function(){r.releaseStatesOfProgram(this),i.deleteProgram(h),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=al++,this.cacheKey=t,this.usedTimes=1,this.program=h,this.vertexShader=x,this.fragmentShader=S,this}var zl=0,Bl=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){let t=e.vertexShader,n=e.fragmentShader,r=this._getShaderStage(t),i=this._getShaderStage(n),a=this._getShaderCacheForMaterial(e);return a.has(r)===!1&&(a.add(r),r.usedTimes++),a.has(i)===!1&&(a.add(i),i.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let e of t)e.usedTimes--,e.usedTimes===0&&this.shaderCache.delete(e.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new Vl(e),t.set(e,n)),n}},Vl=class{constructor(e){this.id=zl++,this.code=e,this.usedTimes=0}};function Hl(e,t,n,r,i,a){let o=new gn,s=new Bl,c=new Set,l=[],u=new Map,d=r.logarithmicDepthBuffer,f=r.precision,p={MeshDepthMaterial:`depth`,MeshDistanceMaterial:`distance`,MeshNormalMaterial:`normal`,MeshBasicMaterial:`basic`,MeshLambertMaterial:`lambert`,MeshPhongMaterial:`phong`,MeshToonMaterial:`toon`,MeshStandardMaterial:`physical`,MeshPhysicalMaterial:`physical`,MeshMatcapMaterial:`matcap`,LineBasicMaterial:`basic`,LineDashedMaterial:`dashed`,PointsMaterial:`points`,ShadowMaterial:`shadow`,SpriteMaterial:`sprite`};function m(e){return c.add(e),e===0?`uv`:`uv${e}`}function h(i,o,l,u,h){let g=u.fog,_=h.geometry,v=i.isMeshStandardMaterial||i.isMeshLambertMaterial||i.isMeshPhongMaterial?u.environment:null,y=i.isMeshStandardMaterial||i.isMeshLambertMaterial&&!i.envMap||i.isMeshPhongMaterial&&!i.envMap,b=t.get(i.envMap||v,y),x=b&&b.mapping===306?b.image.height:null,S=p[i.type];i.precision!==null&&(f=r.getMaxPrecision(i.precision),f!==i.precision&&N(`WebGLProgram.getParameters:`,i.precision,`not supported, using`,f,`instead.`));let C=_.morphAttributes.position||_.morphAttributes.normal||_.morphAttributes.color,w=C===void 0?0:C.length,T=0;_.morphAttributes.position!==void 0&&(T=1),_.morphAttributes.normal!==void 0&&(T=2),_.morphAttributes.color!==void 0&&(T=3);let E,D,O,ee;if(S){let e=ds[S];E=e.vertexShader,D=e.fragmentShader}else E=i.vertexShader,D=i.fragmentShader,s.update(i),O=s.getVertexShaderID(i),ee=s.getFragmentShaderID(i);let te=e.getRenderTarget(),ne=e.state.buffers.depth.getReversed(),k=h.isInstancedMesh===!0,re=h.isBatchedMesh===!0,ie=!!i.map,ae=!!i.matcap,oe=!!b,se=!!i.aoMap,ce=!!i.lightMap,le=!!i.bumpMap,ue=!!i.normalMap,de=!!i.displacementMap,fe=!!i.emissiveMap,pe=!!i.metalnessMap,me=!!i.roughnessMap,he=i.anisotropy>0,ge=i.clearcoat>0,_e=i.dispersion>0,ve=i.iridescence>0,ye=i.sheen>0,be=i.transmission>0,xe=he&&!!i.anisotropyMap,Se=ge&&!!i.clearcoatMap,Ce=ge&&!!i.clearcoatNormalMap,we=ge&&!!i.clearcoatRoughnessMap,Te=ve&&!!i.iridescenceMap,Ee=ve&&!!i.iridescenceThicknessMap,De=ye&&!!i.sheenColorMap,Oe=ye&&!!i.sheenRoughnessMap,ke=!!i.specularMap,Ae=!!i.specularColorMap,je=!!i.specularIntensityMap,Me=be&&!!i.transmissionMap,Ne=be&&!!i.thicknessMap,A=!!i.gradientMap,Pe=!!i.alphaMap,Fe=i.alphaTest>0,Ie=!!i.alphaHash,j=!!i.extensions,Le=0;i.toneMapped&&(te===null||te.isXRRenderTarget===!0)&&(Le=e.toneMapping);let M={shaderID:S,shaderType:i.type,shaderName:i.name,vertexShader:E,fragmentShader:D,defines:i.defines,customVertexShaderID:O,customFragmentShaderID:ee,isRawShaderMaterial:i.isRawShaderMaterial===!0,glslVersion:i.glslVersion,precision:f,batching:re,batchingColor:re&&h._colorsTexture!==null,instancing:k,instancingColor:k&&h.instanceColor!==null,instancingMorph:k&&h.morphTexture!==null,outputColorSpace:te===null?e.outputColorSpace:te.isXRRenderTarget===!0?te.texture.colorSpace:st,alphaToCoverage:!!i.alphaToCoverage,map:ie,matcap:ae,envMap:oe,envMapMode:oe&&b.mapping,envMapCubeUVHeight:x,aoMap:se,lightMap:ce,bumpMap:le,normalMap:ue,displacementMap:de,emissiveMap:fe,normalMapObjectSpace:ue&&i.normalMapType===1,normalMapTangentSpace:ue&&i.normalMapType===0,metalnessMap:pe,roughnessMap:me,anisotropy:he,anisotropyMap:xe,clearcoat:ge,clearcoatMap:Se,clearcoatNormalMap:Ce,clearcoatRoughnessMap:we,dispersion:_e,iridescence:ve,iridescenceMap:Te,iridescenceThicknessMap:Ee,sheen:ye,sheenColorMap:De,sheenRoughnessMap:Oe,specularMap:ke,specularColorMap:Ae,specularIntensityMap:je,transmission:be,transmissionMap:Me,thicknessMap:Ne,gradientMap:A,opaque:i.transparent===!1&&i.blending===1&&i.alphaToCoverage===!1,alphaMap:Pe,alphaTest:Fe,alphaHash:Ie,combine:i.combine,mapUv:ie&&m(i.map.channel),aoMapUv:se&&m(i.aoMap.channel),lightMapUv:ce&&m(i.lightMap.channel),bumpMapUv:le&&m(i.bumpMap.channel),normalMapUv:ue&&m(i.normalMap.channel),displacementMapUv:de&&m(i.displacementMap.channel),emissiveMapUv:fe&&m(i.emissiveMap.channel),metalnessMapUv:pe&&m(i.metalnessMap.channel),roughnessMapUv:me&&m(i.roughnessMap.channel),anisotropyMapUv:xe&&m(i.anisotropyMap.channel),clearcoatMapUv:Se&&m(i.clearcoatMap.channel),clearcoatNormalMapUv:Ce&&m(i.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:we&&m(i.clearcoatRoughnessMap.channel),iridescenceMapUv:Te&&m(i.iridescenceMap.channel),iridescenceThicknessMapUv:Ee&&m(i.iridescenceThicknessMap.channel),sheenColorMapUv:De&&m(i.sheenColorMap.channel),sheenRoughnessMapUv:Oe&&m(i.sheenRoughnessMap.channel),specularMapUv:ke&&m(i.specularMap.channel),specularColorMapUv:Ae&&m(i.specularColorMap.channel),specularIntensityMapUv:je&&m(i.specularIntensityMap.channel),transmissionMapUv:Me&&m(i.transmissionMap.channel),thicknessMapUv:Ne&&m(i.thicknessMap.channel),alphaMapUv:Pe&&m(i.alphaMap.channel),vertexTangents:!!_.attributes.tangent&&(ue||he),vertexColors:i.vertexColors,vertexAlphas:i.vertexColors===!0&&!!_.attributes.color&&_.attributes.color.itemSize===4,pointsUvs:h.isPoints===!0&&!!_.attributes.uv&&(ie||Pe),fog:!!g,useFog:i.fog===!0,fogExp2:!!g&&g.isFogExp2,flatShading:i.wireframe===!1&&(i.flatShading===!0||_.attributes.normal===void 0&&ue===!1&&(i.isMeshLambertMaterial||i.isMeshPhongMaterial||i.isMeshStandardMaterial||i.isMeshPhysicalMaterial)),sizeAttenuation:i.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:ne,skinning:h.isSkinnedMesh===!0,morphTargets:_.morphAttributes.position!==void 0,morphNormals:_.morphAttributes.normal!==void 0,morphColors:_.morphAttributes.color!==void 0,morphTargetsCount:w,morphTextureStride:T,numDirLights:o.directional.length,numPointLights:o.point.length,numSpotLights:o.spot.length,numSpotLightMaps:o.spotLightMap.length,numRectAreaLights:o.rectArea.length,numHemiLights:o.hemi.length,numDirLightShadows:o.directionalShadowMap.length,numPointLightShadows:o.pointShadowMap.length,numSpotLightShadows:o.spotShadowMap.length,numSpotLightShadowsWithMaps:o.numSpotLightShadowsWithMaps,numLightProbes:o.numLightProbes,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:i.dithering,shadowMapEnabled:e.shadowMap.enabled&&l.length>0,shadowMapType:e.shadowMap.type,toneMapping:Le,decodeVideoTexture:ie&&i.map.isVideoTexture===!0&&Ht.getTransfer(i.map.colorSpace)===`srgb`,decodeVideoTextureEmissive:fe&&i.emissiveMap.isVideoTexture===!0&&Ht.getTransfer(i.emissiveMap.colorSpace)===`srgb`,premultipliedAlpha:i.premultipliedAlpha,doubleSided:i.side===2,flipSided:i.side===1,useDepthPacking:i.depthPacking>=0,depthPacking:i.depthPacking||0,index0AttributeName:i.index0AttributeName,extensionClipCullDistance:j&&i.extensions.clipCullDistance===!0&&n.has(`WEBGL_clip_cull_distance`),extensionMultiDraw:(j&&i.extensions.multiDraw===!0||re)&&n.has(`WEBGL_multi_draw`),rendererExtensionParallelShaderCompile:n.has(`KHR_parallel_shader_compile`),customProgramCacheKey:i.customProgramCacheKey()};return M.vertexUv1s=c.has(1),M.vertexUv2s=c.has(2),M.vertexUv3s=c.has(3),c.clear(),M}function g(t){let n=[];if(t.shaderID?n.push(t.shaderID):(n.push(t.customVertexShaderID),n.push(t.customFragmentShaderID)),t.defines!==void 0)for(let e in t.defines)n.push(e),n.push(t.defines[e]);return t.isRawShaderMaterial===!1&&(_(n,t),v(n,t),n.push(e.outputColorSpace)),n.push(t.customProgramCacheKey),n.join()}function _(e,t){e.push(t.precision),e.push(t.outputColorSpace),e.push(t.envMapMode),e.push(t.envMapCubeUVHeight),e.push(t.mapUv),e.push(t.alphaMapUv),e.push(t.lightMapUv),e.push(t.aoMapUv),e.push(t.bumpMapUv),e.push(t.normalMapUv),e.push(t.displacementMapUv),e.push(t.emissiveMapUv),e.push(t.metalnessMapUv),e.push(t.roughnessMapUv),e.push(t.anisotropyMapUv),e.push(t.clearcoatMapUv),e.push(t.clearcoatNormalMapUv),e.push(t.clearcoatRoughnessMapUv),e.push(t.iridescenceMapUv),e.push(t.iridescenceThicknessMapUv),e.push(t.sheenColorMapUv),e.push(t.sheenRoughnessMapUv),e.push(t.specularMapUv),e.push(t.specularColorMapUv),e.push(t.specularIntensityMapUv),e.push(t.transmissionMapUv),e.push(t.thicknessMapUv),e.push(t.combine),e.push(t.fogExp2),e.push(t.sizeAttenuation),e.push(t.morphTargetsCount),e.push(t.morphAttributeCount),e.push(t.numDirLights),e.push(t.numPointLights),e.push(t.numSpotLights),e.push(t.numSpotLightMaps),e.push(t.numHemiLights),e.push(t.numRectAreaLights),e.push(t.numDirLightShadows),e.push(t.numPointLightShadows),e.push(t.numSpotLightShadows),e.push(t.numSpotLightShadowsWithMaps),e.push(t.numLightProbes),e.push(t.shadowMapType),e.push(t.toneMapping),e.push(t.numClippingPlanes),e.push(t.numClipIntersection),e.push(t.depthPacking)}function v(e,t){o.disableAll(),t.instancing&&o.enable(0),t.instancingColor&&o.enable(1),t.instancingMorph&&o.enable(2),t.matcap&&o.enable(3),t.envMap&&o.enable(4),t.normalMapObjectSpace&&o.enable(5),t.normalMapTangentSpace&&o.enable(6),t.clearcoat&&o.enable(7),t.iridescence&&o.enable(8),t.alphaTest&&o.enable(9),t.vertexColors&&o.enable(10),t.vertexAlphas&&o.enable(11),t.vertexUv1s&&o.enable(12),t.vertexUv2s&&o.enable(13),t.vertexUv3s&&o.enable(14),t.vertexTangents&&o.enable(15),t.anisotropy&&o.enable(16),t.alphaHash&&o.enable(17),t.batching&&o.enable(18),t.dispersion&&o.enable(19),t.batchingColor&&o.enable(20),t.gradientMap&&o.enable(21),e.push(o.mask),o.disableAll(),t.fog&&o.enable(0),t.useFog&&o.enable(1),t.flatShading&&o.enable(2),t.logarithmicDepthBuffer&&o.enable(3),t.reversedDepthBuffer&&o.enable(4),t.skinning&&o.enable(5),t.morphTargets&&o.enable(6),t.morphNormals&&o.enable(7),t.morphColors&&o.enable(8),t.premultipliedAlpha&&o.enable(9),t.shadowMapEnabled&&o.enable(10),t.doubleSided&&o.enable(11),t.flipSided&&o.enable(12),t.useDepthPacking&&o.enable(13),t.dithering&&o.enable(14),t.transmission&&o.enable(15),t.sheen&&o.enable(16),t.opaque&&o.enable(17),t.pointsUvs&&o.enable(18),t.decodeVideoTexture&&o.enable(19),t.decodeVideoTextureEmissive&&o.enable(20),t.alphaToCoverage&&o.enable(21),e.push(o.mask)}function y(e){let t=p[e.type],n;if(t){let e=ds[t];n=ao.clone(e.uniforms)}else n=e.uniforms;return n}function b(t,n){let r=u.get(n);return r===void 0?(r=new Rl(e,n,t,i),l.push(r),u.set(n,r)):++r.usedTimes,r}function x(e){if(--e.usedTimes===0){let t=l.indexOf(e);l[t]=l[l.length-1],l.pop(),u.delete(e.cacheKey),e.destroy()}}function S(e){s.remove(e)}function C(){s.dispose()}return{getParameters:h,getProgramCacheKey:g,getUniforms:y,acquireProgram:b,releaseProgram:x,releaseShaderCache:S,programs:l,dispose:C}}function Ul(){let e=new WeakMap;function t(t){return e.has(t)}function n(t){let n=e.get(t);return n===void 0&&(n={},e.set(t,n)),n}function r(t){e.delete(t)}function i(t,n,r){e.get(t)[n]=r}function a(){e=new WeakMap}return{has:t,get:n,remove:r,update:i,dispose:a}}function Wl(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.material.id===t.material.id?e.materialVariant===t.materialVariant?e.z===t.z?e.id-t.id:e.z-t.z:e.materialVariant-t.materialVariant:e.material.id-t.material.id:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function Gl(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.z===t.z?e.id-t.id:t.z-e.z:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function Kl(){let e=[],t=0,n=[],r=[],i=[];function a(){t=0,n.length=0,r.length=0,i.length=0}function o(e){let t=0;return e.isInstancedMesh&&(t+=2),e.isSkinnedMesh&&(t+=1),t}function s(n,r,i,a,s,c){let l=e[t];return l===void 0?(l={id:n.id,object:n,geometry:r,material:i,materialVariant:o(n),groupOrder:a,renderOrder:n.renderOrder,z:s,group:c},e[t]=l):(l.id=n.id,l.object=n,l.geometry=r,l.material=i,l.materialVariant=o(n),l.groupOrder=a,l.renderOrder=n.renderOrder,l.z=s,l.group=c),t++,l}function c(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.push(u):a.transparent===!0?i.push(u):n.push(u)}function l(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.unshift(u):a.transparent===!0?i.unshift(u):n.unshift(u)}function u(e,t){n.length>1&&n.sort(e||Wl),r.length>1&&r.sort(t||Gl),i.length>1&&i.sort(t||Gl)}function d(){for(let n=t,r=e.length;n<r;n++){let t=e[n];if(t.id===null)break;t.id=null,t.object=null,t.geometry=null,t.material=null,t.group=null}}return{opaque:n,transmissive:r,transparent:i,init:a,push:c,unshift:l,finish:d,sort:u}}function ql(){let e=new WeakMap;function t(t,n){let r=e.get(t),i;return r===void 0?(i=new Kl,e.set(t,[i])):n>=r.length?(i=new Kl,r.push(i)):i=r[n],i}function n(){e=new WeakMap}return{get:t,dispose:n}}function Jl(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`DirectionalLight`:n={direction:new I,color:new R};break;case`SpotLight`:n={position:new I,direction:new I,color:new R,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case`PointLight`:n={position:new I,color:new R,distance:0,decay:0};break;case`HemisphereLight`:n={direction:new I,skyColor:new R,groundColor:new R};break;case`RectAreaLight`:n={color:new R,position:new I,halfWidth:new I,halfHeight:new I}}return e[t.id]=n,n}}}function Yl(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`DirectionalLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new F};break;case`SpotLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new F};break;case`PointLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new F,shadowCameraNear:1,shadowCameraFar:1e3}}return e[t.id]=n,n}}}var Xl=0;function Zl(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+ +!!t.map-!!e.map}function Ql(e){let t=new Jl,n=Yl(),r={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let e=0;e<9;e++)r.probe.push(new I);let i=new I,a=new an,o=new an;function s(i){let a=0,o=0,s=0;for(let e=0;e<9;e++)r.probe[e].set(0,0,0);let c=0,l=0,u=0,d=0,f=0,p=0,m=0,h=0,g=0,_=0,v=0;i.sort(Zl);for(let e=0,y=i.length;e<y;e++){let y=i[e],b=y.color,x=y.intensity,S=y.distance,C=null;if(y.shadow&&y.shadow.map&&(C=y.shadow.map.texture.format===1030?y.shadow.map.texture:y.shadow.map.depthTexture||y.shadow.map.texture),y.isAmbientLight)a+=b.r*x,o+=b.g*x,s+=b.b*x;else if(y.isLightProbe){for(let e=0;e<9;e++)r.probe[e].addScaledVector(y.sh.coefficients[e],x);v++}else if(y.isDirectionalLight){let e=t.get(y);if(e.color.copy(y.color).multiplyScalar(y.intensity),y.castShadow){let e=y.shadow,t=n.get(y);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,r.directionalShadow[c]=t,r.directionalShadowMap[c]=C,r.directionalShadowMatrix[c]=y.shadow.matrix,p++}r.directional[c]=e,c++}else if(y.isSpotLight){let e=t.get(y);e.position.setFromMatrixPosition(y.matrixWorld),e.color.copy(b).multiplyScalar(x),e.distance=S,e.coneCos=Math.cos(y.angle),e.penumbraCos=Math.cos(y.angle*(1-y.penumbra)),e.decay=y.decay,r.spot[u]=e;let i=y.shadow;if(y.map&&(r.spotLightMap[g]=y.map,g++,i.updateMatrices(y),y.castShadow&&_++),r.spotLightMatrix[u]=i.matrix,y.castShadow){let e=n.get(y);e.shadowIntensity=i.intensity,e.shadowBias=i.bias,e.shadowNormalBias=i.normalBias,e.shadowRadius=i.radius,e.shadowMapSize=i.mapSize,r.spotShadow[u]=e,r.spotShadowMap[u]=C,h++}u++}else if(y.isRectAreaLight){let e=t.get(y);e.color.copy(b).multiplyScalar(x),e.halfWidth.set(y.width*.5,0,0),e.halfHeight.set(0,y.height*.5,0),r.rectArea[d]=e,d++}else if(y.isPointLight){let e=t.get(y);if(e.color.copy(y.color).multiplyScalar(y.intensity),e.distance=y.distance,e.decay=y.decay,y.castShadow){let e=y.shadow,t=n.get(y);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,t.shadowCameraNear=e.camera.near,t.shadowCameraFar=e.camera.far,r.pointShadow[l]=t,r.pointShadowMap[l]=C,r.pointShadowMatrix[l]=y.shadow.matrix,m++}r.point[l]=e,l++}else if(y.isHemisphereLight){let e=t.get(y);e.skyColor.copy(y.color).multiplyScalar(x),e.groundColor.copy(y.groundColor).multiplyScalar(x),r.hemi[f]=e,f++}}d>0&&(e.has(`OES_texture_float_linear`)===!0?(r.rectAreaLTC1=V.LTC_FLOAT_1,r.rectAreaLTC2=V.LTC_FLOAT_2):(r.rectAreaLTC1=V.LTC_HALF_1,r.rectAreaLTC2=V.LTC_HALF_2)),r.ambient[0]=a,r.ambient[1]=o,r.ambient[2]=s;let y=r.hash;(y.directionalLength!==c||y.pointLength!==l||y.spotLength!==u||y.rectAreaLength!==d||y.hemiLength!==f||y.numDirectionalShadows!==p||y.numPointShadows!==m||y.numSpotShadows!==h||y.numSpotMaps!==g||y.numLightProbes!==v)&&(r.directional.length=c,r.spot.length=u,r.rectArea.length=d,r.point.length=l,r.hemi.length=f,r.directionalShadow.length=p,r.directionalShadowMap.length=p,r.pointShadow.length=m,r.pointShadowMap.length=m,r.spotShadow.length=h,r.spotShadowMap.length=h,r.directionalShadowMatrix.length=p,r.pointShadowMatrix.length=m,r.spotLightMatrix.length=h+g-_,r.spotLightMap.length=g,r.numSpotLightShadowsWithMaps=_,r.numLightProbes=v,y.directionalLength=c,y.pointLength=l,y.spotLength=u,y.rectAreaLength=d,y.hemiLength=f,y.numDirectionalShadows=p,y.numPointShadows=m,y.numSpotShadows=h,y.numSpotMaps=g,y.numLightProbes=v,r.version=Xl++)}function c(e,t){let n=0,s=0,c=0,l=0,u=0,d=t.matrixWorldInverse;for(let t=0,f=e.length;t<f;t++){let f=e[t];if(f.isDirectionalLight){let e=r.directional[n];e.direction.setFromMatrixPosition(f.matrixWorld),i.setFromMatrixPosition(f.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(d),n++}else if(f.isSpotLight){let e=r.spot[c];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),e.direction.setFromMatrixPosition(f.matrixWorld),i.setFromMatrixPosition(f.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(d),c++}else if(f.isRectAreaLight){let e=r.rectArea[l];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),o.identity(),a.copy(f.matrixWorld),a.premultiply(d),o.extractRotation(a),e.halfWidth.set(f.width*.5,0,0),e.halfHeight.set(0,f.height*.5,0),e.halfWidth.applyMatrix4(o),e.halfHeight.applyMatrix4(o),l++}else if(f.isPointLight){let e=r.point[s];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),s++}else if(f.isHemisphereLight){let e=r.hemi[u];e.direction.setFromMatrixPosition(f.matrixWorld),e.direction.transformDirection(d),u++}}}return{setup:s,setupView:c,state:r}}function $l(e){let t=new Ql(e),n=[],r=[];function i(e){l.camera=e,n.length=0,r.length=0}function a(e){n.push(e)}function o(e){r.push(e)}function s(){t.setup(n)}function c(e){t.setupView(n,e)}let l={lightsArray:n,shadowsArray:r,camera:null,lights:t,transmissionRenderTarget:{}};return{init:i,state:l,setupLights:s,setupLightsView:c,pushLight:a,pushShadow:o}}function eu(e){let t=new WeakMap;function n(n,r=0){let i=t.get(n),a;return i===void 0?(a=new $l(e),t.set(n,[a])):r>=i.length?(a=new $l(e),i.push(a)):a=i[r],a}function r(){t=new WeakMap}return{get:n,dispose:r}}var tu=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,nu=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,ru=[new I(1,0,0),new I(-1,0,0),new I(0,1,0),new I(0,-1,0),new I(0,0,1),new I(0,0,-1)],iu=[new I(0,-1,0),new I(0,-1,0),new I(0,0,1),new I(0,0,-1),new I(0,-1,0),new I(0,-1,0)],au=new an,ou=new I,su=new I;function cu(e,t,n){let r=new Ci,i=new F,a=new F,o=new $t,s=new uo,c=new fo,l={},u=n.maxTextureSize,d={0:1,1:0,2:2},f=new co({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new F},radius:{value:4}},vertexShader:tu,fragmentShader:nu}),p=f.clone();p.defines.HORIZONTAL_PASS=1;let m=new Fr;m.setAttribute(`position`,new br(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let h=new z(m,f),g=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=1;let _=this.type;this.render=function(t,n,s){if(g.enabled===!1||g.autoUpdate===!1&&g.needsUpdate===!1||t.length===0)return;this.type===2&&(N(`WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.`),this.type=1);let c=e.getRenderTarget(),l=e.getActiveCubeFace(),d=e.getActiveMipmapLevel(),f=e.state;f.setBlending(0),f.buffers.depth.getReversed()===!0?f.buffers.color.setClear(0,0,0,0):f.buffers.color.setClear(1,1,1,1),f.buffers.depth.setTest(!0),f.setScissorTest(!1);let p=_!==this.type;p&&n.traverse(function(e){e.material&&(Array.isArray(e.material)?e.material.forEach(e=>e.needsUpdate=!0):e.material.needsUpdate=!0)});for(let c=0,l=t.length;c<l;c++){let l=t[c],d=l.shadow;if(d===void 0){N(`WebGLShadowMap:`,l,`has no shadow.`);continue}if(d.autoUpdate===!1&&d.needsUpdate===!1)continue;i.copy(d.mapSize);let m=d.getFrameExtents();i.multiply(m),a.copy(d.mapSize),(i.x>u||i.y>u)&&(i.x>u&&(a.x=Math.floor(u/m.x),i.x=a.x*m.x,d.mapSize.x=a.x),i.y>u&&(a.y=Math.floor(u/m.y),i.y=a.y*m.y,d.mapSize.y=a.y));let h=e.state.buffers.depth.getReversed();if(d.camera._reversedDepth=h,d.map===null||p===!0){if(d.map!==null&&(d.map.depthTexture!==null&&(d.map.depthTexture.dispose(),d.map.depthTexture=null),d.map.dispose()),this.type===3){if(l.isPointLight){N(`WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.`);continue}d.map=new tn(i.x,i.y,{format:ge,type:re,minFilter:C,magFilter:C,generateMipmaps:!1}),d.map.texture.name=l.name+`.shadowMap`,d.map.depthTexture=new Ei(i.x,i.y,k),d.map.depthTexture.name=l.name+`.shadowMapDepth`,d.map.depthTexture.format=fe,d.map.depthTexture.compareFunction=null,d.map.depthTexture.minFilter=b,d.map.depthTexture.magFilter=b}else l.isPointLight?(d.map=new Bs(i.x),d.map.depthTexture=new Di(i.x,ne)):(d.map=new tn(i.x,i.y),d.map.depthTexture=new Ei(i.x,i.y,ne)),d.map.depthTexture.name=l.name+`.shadowMap`,d.map.depthTexture.format=fe,this.type===1?(d.map.depthTexture.compareFunction=h?518:515,d.map.depthTexture.minFilter=C,d.map.depthTexture.magFilter=C):(d.map.depthTexture.compareFunction=null,d.map.depthTexture.minFilter=b,d.map.depthTexture.magFilter=b);d.camera.updateProjectionMatrix()}let g=d.map.isWebGLCubeRenderTarget?6:1;for(let t=0;t<g;t++){if(d.map.isWebGLCubeRenderTarget)e.setRenderTarget(d.map,t),e.clear();else{t===0&&(e.setRenderTarget(d.map),e.clear());let n=d.getViewport(t);o.set(a.x*n.x,a.y*n.y,a.x*n.z,a.y*n.w),f.viewport(o)}if(l.isPointLight){let e=d.camera,n=d.matrix,r=l.distance||e.far;r!==e.far&&(e.far=r,e.updateProjectionMatrix()),ou.setFromMatrixPosition(l.matrixWorld),e.position.copy(ou),su.copy(e.position),su.add(ru[t]),e.up.copy(iu[t]),e.lookAt(su),e.updateMatrixWorld(),n.makeTranslation(-ou.x,-ou.y,-ou.z),au.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),d._frustum.setFromProjectionMatrix(au,e.coordinateSystem,e.reversedDepth)}else d.updateMatrices(l);r=d.getFrustum(),x(n,s,d.camera,l,this.type)}d.isPointLightShadow!==!0&&this.type===3&&v(d,s),d.needsUpdate=!1}_=this.type,g.needsUpdate=!1,e.setRenderTarget(c,l,d)};function v(n,r){let a=t.update(h);f.defines.VSM_SAMPLES!==n.blurSamples&&(f.defines.VSM_SAMPLES=n.blurSamples,p.defines.VSM_SAMPLES=n.blurSamples,f.needsUpdate=!0,p.needsUpdate=!0),n.mapPass===null&&(n.mapPass=new tn(i.x,i.y,{format:ge,type:re})),f.uniforms.shadow_pass.value=n.map.depthTexture,f.uniforms.resolution.value=n.mapSize,f.uniforms.radius.value=n.radius,e.setRenderTarget(n.mapPass),e.clear(),e.renderBufferDirect(r,null,a,f,h,null),p.uniforms.shadow_pass.value=n.mapPass.texture,p.uniforms.resolution.value=n.mapSize,p.uniforms.radius.value=n.radius,e.setRenderTarget(n.map),e.clear(),e.renderBufferDirect(r,null,a,p,h,null)}function y(t,n,r,i){let a=null,o=r.isPointLight===!0?t.customDistanceMaterial:t.customDepthMaterial;if(o!==void 0)a=o;else if(a=r.isPointLight===!0?c:s,e.localClippingEnabled&&n.clipShadows===!0&&Array.isArray(n.clippingPlanes)&&n.clippingPlanes.length!==0||n.displacementMap&&n.displacementScale!==0||n.alphaMap&&n.alphaTest>0||n.map&&n.alphaTest>0||n.alphaToCoverage===!0){let e=a.uuid,t=n.uuid,r=l[e];r===void 0&&(r={},l[e]=r);let i=r[t];i===void 0&&(i=a.clone(),r[t]=i,n.addEventListener(`dispose`,S)),a=i}if(a.visible=n.visible,a.wireframe=n.wireframe,i===3?a.side=n.shadowSide===null?n.side:n.shadowSide:a.side=n.shadowSide===null?d[n.side]:n.shadowSide,a.alphaMap=n.alphaMap,a.alphaTest=n.alphaToCoverage===!0?.5:n.alphaTest,a.map=n.map,a.clipShadows=n.clipShadows,a.clippingPlanes=n.clippingPlanes,a.clipIntersection=n.clipIntersection,a.displacementMap=n.displacementMap,a.displacementScale=n.displacementScale,a.displacementBias=n.displacementBias,a.wireframeLinewidth=n.wireframeLinewidth,a.linewidth=n.linewidth,r.isPointLight===!0&&a.isMeshDistanceMaterial===!0){let t=e.properties.get(a);t.light=r}return a}function x(n,i,a,o,s){if(n.visible===!1)return;if(n.layers.test(i.layers)&&(n.isMesh||n.isLine||n.isPoints)&&(n.castShadow||n.receiveShadow&&s===3)&&(!n.frustumCulled||r.intersectsObject(n))){n.modelViewMatrix.multiplyMatrices(a.matrixWorldInverse,n.matrixWorld);let r=t.update(n),c=n.material;if(Array.isArray(c)){let t=r.groups;for(let l=0,u=t.length;l<u;l++){let u=t[l],d=c[u.materialIndex];if(d&&d.visible){let t=y(n,d,o,s);n.onBeforeShadow(e,n,i,a,r,t,u),e.renderBufferDirect(a,null,r,t,n,u),n.onAfterShadow(e,n,i,a,r,t,u)}}}else if(c.visible){let t=y(n,c,o,s);n.onBeforeShadow(e,n,i,a,r,t,null),e.renderBufferDirect(a,null,r,t,n,null),n.onAfterShadow(e,n,i,a,r,t,null)}}let c=n.children;for(let e=0,t=c.length;e<t;e++)x(c[e],i,a,o,s)}function S(e){e.target.removeEventListener(`dispose`,S);for(let t in l){let n=l[t],r=e.target.uuid;r in n&&(n[r].dispose(),delete n[r])}}}function lu(e,t){function n(){let t=!1,n=new $t,r=null,i=new $t(0,0,0,0);return{setMask:function(n){r!==n&&!t&&(e.colorMask(n,n,n,n),r=n)},setLocked:function(e){t=e},setClear:function(t,r,a,o,s){s===!0&&(t*=o,r*=o,a*=o),n.set(t,r,a,o),i.equals(n)===!1&&(e.clearColor(t,r,a,o),i.copy(n))},reset:function(){t=!1,r=null,i.set(-1,0,0,0)}}}function r(){let n=!1,r=!1,i=null,a=null,o=null;return{setReversed:function(e){if(r!==e){let n=t.get(`EXT_clip_control`);e?n.clipControlEXT(n.LOWER_LEFT_EXT,n.ZERO_TO_ONE_EXT):n.clipControlEXT(n.LOWER_LEFT_EXT,n.NEGATIVE_ONE_TO_ONE_EXT),r=e;let i=o;o=null,this.setClear(i)}},getReversed:function(){return r},setTest:function(t){t?pe(e.DEPTH_TEST):me(e.DEPTH_TEST)},setMask:function(t){i!==t&&!n&&(e.depthMask(t),i=t)},setFunc:function(t){if(r&&(t=Ct[t]),a!==t){switch(t){case 0:e.depthFunc(e.NEVER);break;case 1:e.depthFunc(e.ALWAYS);break;case 2:e.depthFunc(e.LESS);break;case 3:e.depthFunc(e.LEQUAL);break;case 4:e.depthFunc(e.EQUAL);break;case 5:e.depthFunc(e.GEQUAL);break;case 6:e.depthFunc(e.GREATER);break;case 7:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}a=t}},setLocked:function(e){n=e},setClear:function(t){o!==t&&(o=t,r&&(t=1-t),e.clearDepth(t))},reset:function(){n=!1,i=null,a=null,o=null,r=!1}}}function i(){let t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null;return{setTest:function(n){t||(n?pe(e.STENCIL_TEST):me(e.STENCIL_TEST))},setMask:function(r){n!==r&&!t&&(e.stencilMask(r),n=r)},setFunc:function(t,n,o){(r!==t||i!==n||a!==o)&&(e.stencilFunc(t,n,o),r=t,i=n,a=o)},setOp:function(t,n,r){(o!==t||s!==n||c!==r)&&(e.stencilOp(t,n,r),o=t,s=n,c=r)},setLocked:function(e){t=e},setClear:function(t){l!==t&&(e.clearStencil(t),l=t)},reset:function(){t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null}}}let a=new n,o=new r,s=new i,c=new WeakMap,l=new WeakMap,u={},d={},f=new WeakMap,p=[],m=null,h=!1,g=null,_=null,v=null,y=null,b=null,x=null,S=null,C=new R(0,0,0),w=0,T=!1,E=null,D=null,O=null,ee=null,te=null,ne=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),k=!1,re=0,ie=e.getParameter(e.VERSION);ie.indexOf(`WebGL`)===-1?ie.indexOf(`OpenGL ES`)!==-1&&(re=parseFloat(/^OpenGL ES (\d)/.exec(ie)[1]),k=re>=2):(re=parseFloat(/^WebGL (\d)/.exec(ie)[1]),k=re>=1);let ae=null,oe={},se=e.getParameter(e.SCISSOR_BOX),ce=e.getParameter(e.VIEWPORT),le=new $t().fromArray(se),ue=new $t().fromArray(ce);function de(t,n,r,i){let a=new Uint8Array(4),o=e.createTexture();e.bindTexture(t,o),e.texParameteri(t,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(t,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let o=0;o<r;o++)t===e.TEXTURE_3D||t===e.TEXTURE_2D_ARRAY?e.texImage3D(n,0,e.RGBA,1,1,i,0,e.RGBA,e.UNSIGNED_BYTE,a):e.texImage2D(n+o,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,a);return o}let fe={};fe[e.TEXTURE_2D]=de(e.TEXTURE_2D,e.TEXTURE_2D,1),fe[e.TEXTURE_CUBE_MAP]=de(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),fe[e.TEXTURE_2D_ARRAY]=de(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),fe[e.TEXTURE_3D]=de(e.TEXTURE_3D,e.TEXTURE_3D,1,1),a.setClear(0,0,0,1),o.setClear(1),s.setClear(0),pe(e.DEPTH_TEST),o.setFunc(3),Se(!1),Ce(1),pe(e.CULL_FACE),be(0);function pe(t){u[t]!==!0&&(e.enable(t),u[t]=!0)}function me(t){u[t]!==!1&&(e.disable(t),u[t]=!1)}function he(t,n){return d[t]!==n&&(e.bindFramebuffer(t,n),d[t]=n,t===e.DRAW_FRAMEBUFFER&&(d[e.FRAMEBUFFER]=n),t===e.FRAMEBUFFER&&(d[e.DRAW_FRAMEBUFFER]=n),!0)}function ge(t,n){let r=p,i=!1;if(t){r=f.get(n),r===void 0&&(r=[],f.set(n,r));let a=t.textures;if(r.length!==a.length||r[0]!==e.COLOR_ATTACHMENT0){for(let t=0,n=a.length;t<n;t++)r[t]=e.COLOR_ATTACHMENT0+t;r.length=a.length,i=!0}}else r[0]!==e.BACK&&(r[0]=e.BACK,i=!0);i&&e.drawBuffers(r)}function _e(t){return m!==t&&(e.useProgram(t),m=t,!0)}let ve={100:e.FUNC_ADD,101:e.FUNC_SUBTRACT,102:e.FUNC_REVERSE_SUBTRACT};ve[103]=e.MIN,ve[104]=e.MAX;let ye={200:e.ZERO,201:e.ONE,202:e.SRC_COLOR,204:e.SRC_ALPHA,210:e.SRC_ALPHA_SATURATE,208:e.DST_COLOR,206:e.DST_ALPHA,203:e.ONE_MINUS_SRC_COLOR,205:e.ONE_MINUS_SRC_ALPHA,209:e.ONE_MINUS_DST_COLOR,207:e.ONE_MINUS_DST_ALPHA,211:e.CONSTANT_COLOR,212:e.ONE_MINUS_CONSTANT_COLOR,213:e.CONSTANT_ALPHA,214:e.ONE_MINUS_CONSTANT_ALPHA};function be(t,n,r,i,a,o,s,c,l,u){if(t===0)h===!0&&(me(e.BLEND),h=!1);else if(h===!1&&(pe(e.BLEND),h=!0),t!==5){if(t!==g||u!==T){if((_!==100||b!==100)&&(e.blendEquation(e.FUNC_ADD),_=100,b=100),u)switch(t){case 1:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFunc(e.ONE,e.ONE);break;case 3:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case 4:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:P(`WebGLState: Invalid blending: `,t)}else switch(t){case 1:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case 3:P(`WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true`);break;case 4:P(`WebGLState: MultiplyBlending requires material.premultipliedAlpha = true`);break;default:P(`WebGLState: Invalid blending: `,t)}v=null,y=null,x=null,S=null,C.set(0,0,0),w=0,g=t,T=u}}else a||=n,o||=r,s||=i,(n!==_||a!==b)&&(e.blendEquationSeparate(ve[n],ve[a]),_=n,b=a),(r!==v||i!==y||o!==x||s!==S)&&(e.blendFuncSeparate(ye[r],ye[i],ye[o],ye[s]),v=r,y=i,x=o,S=s),(c.equals(C)===!1||l!==w)&&(e.blendColor(c.r,c.g,c.b,l),C.copy(c),w=l),g=t,T=!1}function xe(t,n){t.side===2?me(e.CULL_FACE):pe(e.CULL_FACE);let r=t.side===1;n&&(r=!r),Se(r),t.blending===1&&t.transparent===!1?be(0):be(t.blending,t.blendEquation,t.blendSrc,t.blendDst,t.blendEquationAlpha,t.blendSrcAlpha,t.blendDstAlpha,t.blendColor,t.blendAlpha,t.premultipliedAlpha),o.setFunc(t.depthFunc),o.setTest(t.depthTest),o.setMask(t.depthWrite),a.setMask(t.colorWrite);let i=t.stencilWrite;s.setTest(i),i&&(s.setMask(t.stencilWriteMask),s.setFunc(t.stencilFunc,t.stencilRef,t.stencilFuncMask),s.setOp(t.stencilFail,t.stencilZFail,t.stencilZPass)),Te(t.polygonOffset,t.polygonOffsetFactor,t.polygonOffsetUnits),t.alphaToCoverage===!0?pe(e.SAMPLE_ALPHA_TO_COVERAGE):me(e.SAMPLE_ALPHA_TO_COVERAGE)}function Se(t){E!==t&&(t?e.frontFace(e.CW):e.frontFace(e.CCW),E=t)}function Ce(t){t===0?me(e.CULL_FACE):(pe(e.CULL_FACE),t!==D&&(t===1?e.cullFace(e.BACK):t===2?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))),D=t}function we(t){t!==O&&(k&&e.lineWidth(t),O=t)}function Te(t,n,r){t?(pe(e.POLYGON_OFFSET_FILL),(ee!==n||te!==r)&&(ee=n,te=r,o.getReversed()&&(n=-n),e.polygonOffset(n,r))):me(e.POLYGON_OFFSET_FILL)}function Ee(t){t?pe(e.SCISSOR_TEST):me(e.SCISSOR_TEST)}function De(t){t===void 0&&(t=e.TEXTURE0+ne-1),ae!==t&&(e.activeTexture(t),ae=t)}function Oe(t,n,r){r===void 0&&(r=ae===null?e.TEXTURE0+ne-1:ae);let i=oe[r];i===void 0&&(i={type:void 0,texture:void 0},oe[r]=i),(i.type!==t||i.texture!==n)&&(ae!==r&&(e.activeTexture(r),ae=r),e.bindTexture(t,n||fe[t]),i.type=t,i.texture=n)}function ke(){let t=oe[ae];t!==void 0&&t.type!==void 0&&(e.bindTexture(t.type,null),t.type=void 0,t.texture=void 0)}function Ae(){try{e.compressedTexImage2D(...arguments)}catch(e){P(`WebGLState:`,e)}}function je(){try{e.compressedTexImage3D(...arguments)}catch(e){P(`WebGLState:`,e)}}function Me(){try{e.texSubImage2D(...arguments)}catch(e){P(`WebGLState:`,e)}}function Ne(){try{e.texSubImage3D(...arguments)}catch(e){P(`WebGLState:`,e)}}function A(){try{e.compressedTexSubImage2D(...arguments)}catch(e){P(`WebGLState:`,e)}}function Pe(){try{e.compressedTexSubImage3D(...arguments)}catch(e){P(`WebGLState:`,e)}}function Fe(){try{e.texStorage2D(...arguments)}catch(e){P(`WebGLState:`,e)}}function Ie(){try{e.texStorage3D(...arguments)}catch(e){P(`WebGLState:`,e)}}function j(){try{e.texImage2D(...arguments)}catch(e){P(`WebGLState:`,e)}}function Le(){try{e.texImage3D(...arguments)}catch(e){P(`WebGLState:`,e)}}function M(t){le.equals(t)===!1&&(e.scissor(t.x,t.y,t.z,t.w),le.copy(t))}function Re(t){ue.equals(t)===!1&&(e.viewport(t.x,t.y,t.z,t.w),ue.copy(t))}function ze(t,n){let r=l.get(n);r===void 0&&(r=new WeakMap,l.set(n,r));let i=r.get(t);i===void 0&&(i=e.getUniformBlockIndex(n,t.name),r.set(t,i))}function Be(t,n){let r=l.get(n).get(t);c.get(n)!==r&&(e.uniformBlockBinding(n,r,t.__bindingPointIndex),c.set(n,r))}function Ve(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),o.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),u={},ae=null,oe={},d={},f=new WeakMap,p=[],m=null,h=!1,g=null,_=null,v=null,y=null,b=null,x=null,S=null,C=new R(0,0,0),w=0,T=!1,E=null,D=null,O=null,ee=null,te=null,le.set(0,0,e.canvas.width,e.canvas.height),ue.set(0,0,e.canvas.width,e.canvas.height),a.reset(),o.reset(),s.reset()}return{buffers:{color:a,depth:o,stencil:s},enable:pe,disable:me,bindFramebuffer:he,drawBuffers:ge,useProgram:_e,setBlending:be,setMaterial:xe,setFlipSided:Se,setCullFace:Ce,setLineWidth:we,setPolygonOffset:Te,setScissorTest:Ee,activeTexture:De,bindTexture:Oe,unbindTexture:ke,compressedTexImage2D:Ae,compressedTexImage3D:je,texImage2D:j,texImage3D:Le,updateUBOMapping:ze,uniformBlockBinding:Be,texStorage2D:Fe,texStorage3D:Ie,texSubImage2D:Me,texSubImage3D:Ne,compressedTexSubImage2D:A,compressedTexSubImage3D:Pe,scissor:M,viewport:Re,reset:Ve}}function uu(e,t,n,r,i,a,o){let s=t.has(`WEBGL_multisampled_render_to_texture`)?t.get(`WEBGL_multisampled_render_to_texture`):null,c=typeof navigator>`u`?!1:/OculusBrowser/g.test(navigator.userAgent),l=new F,u=new WeakMap,d,f=new WeakMap,p=!1;try{p=typeof OffscreenCanvas<`u`&&new OffscreenCanvas(1,1).getContext(`2d`)!==null}catch{}function m(e,t){return p?new OffscreenCanvas(e,t):gt(`canvas`)}function h(e,t,n){let r=1,i=j(e);if((i.width>n||i.height>n)&&(r=n/Math.max(i.width,i.height)),r<1){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap||typeof VideoFrame<`u`&&e instanceof VideoFrame){let n=Math.floor(r*i.width),a=Math.floor(r*i.height);d===void 0&&(d=m(n,a));let o=t?m(n,a):d;return o.width=n,o.height=a,o.getContext(`2d`).drawImage(e,0,0,n,a),N(`WebGLRenderer: Texture has been resized from (`+i.width+`x`+i.height+`) to (`+n+`x`+a+`).`),o}return`data`in e&&N(`WebGLRenderer: Image in DataTexture is too big (`+i.width+`x`+i.height+`).`),e}return e}function g(e){return e.generateMipmaps}function E(t){e.generateMipmap(t)}function D(t){return t.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:t.isWebGL3DRenderTarget?e.TEXTURE_3D:t.isWebGLArrayRenderTarget||t.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}function O(n,r,i,a,o=!1){if(n!==null){if(e[n]!==void 0)return e[n];N(`WebGLRenderer: Attempt to use non-existing WebGL internal format '`+n+`'`)}let s=r;if(r===e.RED&&(i===e.FLOAT&&(s=e.R32F),i===e.HALF_FLOAT&&(s=e.R16F),i===e.UNSIGNED_BYTE&&(s=e.R8)),r===e.RED_INTEGER&&(i===e.UNSIGNED_BYTE&&(s=e.R8UI),i===e.UNSIGNED_SHORT&&(s=e.R16UI),i===e.UNSIGNED_INT&&(s=e.R32UI),i===e.BYTE&&(s=e.R8I),i===e.SHORT&&(s=e.R16I),i===e.INT&&(s=e.R32I)),r===e.RG&&(i===e.FLOAT&&(s=e.RG32F),i===e.HALF_FLOAT&&(s=e.RG16F),i===e.UNSIGNED_BYTE&&(s=e.RG8)),r===e.RG_INTEGER&&(i===e.UNSIGNED_BYTE&&(s=e.RG8UI),i===e.UNSIGNED_SHORT&&(s=e.RG16UI),i===e.UNSIGNED_INT&&(s=e.RG32UI),i===e.BYTE&&(s=e.RG8I),i===e.SHORT&&(s=e.RG16I),i===e.INT&&(s=e.RG32I)),r===e.RGB_INTEGER&&(i===e.UNSIGNED_BYTE&&(s=e.RGB8UI),i===e.UNSIGNED_SHORT&&(s=e.RGB16UI),i===e.UNSIGNED_INT&&(s=e.RGB32UI),i===e.BYTE&&(s=e.RGB8I),i===e.SHORT&&(s=e.RGB16I),i===e.INT&&(s=e.RGB32I)),r===e.RGBA_INTEGER&&(i===e.UNSIGNED_BYTE&&(s=e.RGBA8UI),i===e.UNSIGNED_SHORT&&(s=e.RGBA16UI),i===e.UNSIGNED_INT&&(s=e.RGBA32UI),i===e.BYTE&&(s=e.RGBA8I),i===e.SHORT&&(s=e.RGBA16I),i===e.INT&&(s=e.RGBA32I)),r===e.RGB&&(i===e.UNSIGNED_INT_5_9_9_9_REV&&(s=e.RGB9_E5),i===e.UNSIGNED_INT_10F_11F_11F_REV&&(s=e.R11F_G11F_B10F)),r===e.RGBA){let t=o?ct:Ht.getTransfer(a);i===e.FLOAT&&(s=e.RGBA32F),i===e.HALF_FLOAT&&(s=e.RGBA16F),i===e.UNSIGNED_BYTE&&(s=t===`srgb`?e.SRGB8_ALPHA8:e.RGBA8),i===e.UNSIGNED_SHORT_4_4_4_4&&(s=e.RGBA4),i===e.UNSIGNED_SHORT_5_5_5_1&&(s=e.RGB5_A1)}return(s===e.R16F||s===e.R32F||s===e.RG16F||s===e.RG32F||s===e.RGBA16F||s===e.RGBA32F)&&t.get(`EXT_color_buffer_float`),s}function ee(t,n){let r;return t?n===null||n===1014||n===1020?r=e.DEPTH24_STENCIL8:n===1015?r=e.DEPTH32F_STENCIL8:n===1012&&(r=e.DEPTH24_STENCIL8,N(`DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.`)):n===null||n===1014||n===1020?r=e.DEPTH_COMPONENT24:n===1015?r=e.DEPTH_COMPONENT32F:n===1012&&(r=e.DEPTH_COMPONENT16),r}function te(e,t){return g(e)===!0||e.isFramebufferTexture&&e.minFilter!==1003&&e.minFilter!==1006?Math.log2(Math.max(t.width,t.height))+1:e.mipmaps!==void 0&&e.mipmaps.length>0?e.mipmaps.length:e.isCompressedTexture&&Array.isArray(e.image)?t.mipmaps.length:1}function ne(e){let t=e.target;t.removeEventListener(`dispose`,ne),re(t),t.isVideoTexture&&u.delete(t)}function k(e){let t=e.target;t.removeEventListener(`dispose`,k),ae(t)}function re(e){let t=r.get(e);if(t.__webglInit===void 0)return;let n=e.source,i=f.get(n);if(i){let r=i[t.__cacheKey];r.usedTimes--,r.usedTimes===0&&ie(e),Object.keys(i).length===0&&f.delete(n)}r.remove(e)}function ie(t){let n=r.get(t);e.deleteTexture(n.__webglTexture);let i=t.source,a=f.get(i);delete a[n.__cacheKey],o.memory.textures--}function ae(t){let n=r.get(t);if(t.depthTexture&&(t.depthTexture.dispose(),r.remove(t.depthTexture)),t.isWebGLCubeRenderTarget)for(let t=0;t<6;t++){if(Array.isArray(n.__webglFramebuffer[t]))for(let r=0;r<n.__webglFramebuffer[t].length;r++)e.deleteFramebuffer(n.__webglFramebuffer[t][r]);else e.deleteFramebuffer(n.__webglFramebuffer[t]);n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer[t])}else{if(Array.isArray(n.__webglFramebuffer))for(let t=0;t<n.__webglFramebuffer.length;t++)e.deleteFramebuffer(n.__webglFramebuffer[t]);else e.deleteFramebuffer(n.__webglFramebuffer);if(n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer),n.__webglMultisampledFramebuffer&&e.deleteFramebuffer(n.__webglMultisampledFramebuffer),n.__webglColorRenderbuffer)for(let t=0;t<n.__webglColorRenderbuffer.length;t++)n.__webglColorRenderbuffer[t]&&e.deleteRenderbuffer(n.__webglColorRenderbuffer[t]);n.__webglDepthRenderbuffer&&e.deleteRenderbuffer(n.__webglDepthRenderbuffer)}let i=t.textures;for(let t=0,n=i.length;t<n;t++){let n=r.get(i[t]);n.__webglTexture&&(e.deleteTexture(n.__webglTexture),o.memory.textures--),r.remove(i[t])}r.remove(t)}let oe=0;function se(){oe=0}function ce(){let e=oe;return e>=i.maxTextures&&N(`WebGLTextures: Trying to use `+e+` texture units while this GPU supports only `+i.maxTextures),oe+=1,e}function le(e){let t=[];return t.push(e.wrapS),t.push(e.wrapT),t.push(e.wrapR||0),t.push(e.magFilter),t.push(e.minFilter),t.push(e.anisotropy),t.push(e.internalFormat),t.push(e.format),t.push(e.type),t.push(e.generateMipmaps),t.push(e.premultiplyAlpha),t.push(e.flipY),t.push(e.unpackAlignment),t.push(e.colorSpace),t.join()}function ue(t,i){let a=r.get(t);if(t.isVideoTexture&&Fe(t),t.isRenderTargetTexture===!1&&t.isExternalTexture!==!0&&t.version>0&&a.__version!==t.version){let e=t.image;if(e===null)N(`WebGLRenderer: Texture marked for update but no image data found.`);else if(e.complete===!1)N(`WebGLRenderer: Texture marked for update but image is incomplete`);else{Se(a,t,i);return}}else t.isExternalTexture&&(a.__webglTexture=t.sourceTexture?t.sourceTexture:null);n.bindTexture(e.TEXTURE_2D,a.__webglTexture,e.TEXTURE0+i)}function de(t,i){let a=r.get(t);t.isRenderTargetTexture===!1&&t.version>0&&a.__version!==t.version?Se(a,t,i):(t.isExternalTexture&&(a.__webglTexture=t.sourceTexture?t.sourceTexture:null),n.bindTexture(e.TEXTURE_2D_ARRAY,a.__webglTexture,e.TEXTURE0+i))}function fe(t,i){let a=r.get(t);t.isRenderTargetTexture===!1&&t.version>0&&a.__version!==t.version?Se(a,t,i):n.bindTexture(e.TEXTURE_3D,a.__webglTexture,e.TEXTURE0+i)}function me(t,i){let a=r.get(t);t.isCubeDepthTexture!==!0&&t.version>0&&a.__version!==t.version?Ce(a,t,i):n.bindTexture(e.TEXTURE_CUBE_MAP,a.__webglTexture,e.TEXTURE0+i)}let he={[_]:e.REPEAT,[v]:e.CLAMP_TO_EDGE,[y]:e.MIRRORED_REPEAT},ge={[b]:e.NEAREST,[x]:e.NEAREST_MIPMAP_NEAREST,[S]:e.NEAREST_MIPMAP_LINEAR,[C]:e.LINEAR,[w]:e.LINEAR_MIPMAP_NEAREST,[T]:e.LINEAR_MIPMAP_LINEAR},_e={512:e.NEVER,519:e.ALWAYS,513:e.LESS,515:e.LEQUAL,514:e.EQUAL,518:e.GEQUAL,516:e.GREATER,517:e.NOTEQUAL};function ve(n,a){if(a.type===1015&&t.has(`OES_texture_float_linear`)===!1&&(a.magFilter===1006||a.magFilter===1007||a.magFilter===1005||a.magFilter===1008||a.minFilter===1006||a.minFilter===1007||a.minFilter===1005||a.minFilter===1008)&&N(`WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device.`),e.texParameteri(n,e.TEXTURE_WRAP_S,he[a.wrapS]),e.texParameteri(n,e.TEXTURE_WRAP_T,he[a.wrapT]),(n===e.TEXTURE_3D||n===e.TEXTURE_2D_ARRAY)&&e.texParameteri(n,e.TEXTURE_WRAP_R,he[a.wrapR]),e.texParameteri(n,e.TEXTURE_MAG_FILTER,ge[a.magFilter]),e.texParameteri(n,e.TEXTURE_MIN_FILTER,ge[a.minFilter]),a.compareFunction&&(e.texParameteri(n,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(n,e.TEXTURE_COMPARE_FUNC,_e[a.compareFunction])),t.has(`EXT_texture_filter_anisotropic`)===!0){if(a.magFilter===1003||a.minFilter!==1005&&a.minFilter!==1008||a.type===1015&&t.has(`OES_texture_float_linear`)===!1)return;if(a.anisotropy>1||r.get(a).__currentAnisotropy){let o=t.get(`EXT_texture_filter_anisotropic`);e.texParameterf(n,o.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(a.anisotropy,i.getMaxAnisotropy())),r.get(a).__currentAnisotropy=a.anisotropy}}}function ye(t,n){let r=!1;t.__webglInit===void 0&&(t.__webglInit=!0,n.addEventListener(`dispose`,ne));let i=n.source,a=f.get(i);a===void 0&&(a={},f.set(i,a));let s=le(n);if(s!==t.__cacheKey){a[s]===void 0&&(a[s]={texture:e.createTexture(),usedTimes:0},o.memory.textures++,r=!0),a[s].usedTimes++;let i=a[t.__cacheKey];i!==void 0&&(a[t.__cacheKey].usedTimes--,i.usedTimes===0&&ie(n)),t.__cacheKey=s,t.__webglTexture=a[s].texture}return r}function be(e,t,n){return Math.floor(Math.floor(e/n)/t)}function xe(t,r,i,a){let o=t.updateRanges;if(o.length===0)n.texSubImage2D(e.TEXTURE_2D,0,0,0,r.width,r.height,i,a,r.data);else{o.sort((e,t)=>e.start-t.start);let s=0;for(let e=1;e<o.length;e++){let t=o[s],n=o[e],i=t.start+t.count,a=be(n.start,r.width,4),c=be(t.start,r.width,4);n.start<=i+1&&a===c&&be(n.start+n.count-1,r.width,4)===a?t.count=Math.max(t.count,n.start+n.count-t.start):(++s,o[s]=n)}o.length=s+1;let c=e.getParameter(e.UNPACK_ROW_LENGTH),l=e.getParameter(e.UNPACK_SKIP_PIXELS),u=e.getParameter(e.UNPACK_SKIP_ROWS);e.pixelStorei(e.UNPACK_ROW_LENGTH,r.width);for(let t=0,s=o.length;t<s;t++){let s=o[t],c=Math.floor(s.start/4),l=Math.ceil(s.count/4),u=c%r.width,d=Math.floor(c/r.width),f=l;e.pixelStorei(e.UNPACK_SKIP_PIXELS,u),e.pixelStorei(e.UNPACK_SKIP_ROWS,d),n.texSubImage2D(e.TEXTURE_2D,0,u,d,f,1,i,a,r.data)}t.clearUpdateRanges(),e.pixelStorei(e.UNPACK_ROW_LENGTH,c),e.pixelStorei(e.UNPACK_SKIP_PIXELS,l),e.pixelStorei(e.UNPACK_SKIP_ROWS,u)}}function Se(t,o,s){let c=e.TEXTURE_2D;(o.isDataArrayTexture||o.isCompressedArrayTexture)&&(c=e.TEXTURE_2D_ARRAY),o.isData3DTexture&&(c=e.TEXTURE_3D);let l=ye(t,o),u=o.source;n.bindTexture(c,t.__webglTexture,e.TEXTURE0+s);let d=r.get(u);if(u.version!==d.__version||l===!0){n.activeTexture(e.TEXTURE0+s);let t=Ht.getPrimaries(Ht.workingColorSpace),r=o.colorSpace===``?null:Ht.getPrimaries(o.colorSpace),f=o.colorSpace===``||t===r?e.NONE:e.BROWSER_DEFAULT_WEBGL;e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,o.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,o.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,o.unpackAlignment),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,f);let p=h(o.image,!1,i.maxTextureSize);p=Ie(o,p);let m=a.convert(o.format,o.colorSpace),_=a.convert(o.type),v=O(o.internalFormat,m,_,o.colorSpace,o.isVideoTexture);ve(c,o);let y,b=o.mipmaps,x=o.isVideoTexture!==!0,S=d.__version===void 0||l===!0,C=u.dataReady,w=te(o,p);if(o.isDepthTexture)v=ee(o.format===pe,o.type),S&&(x?n.texStorage2D(e.TEXTURE_2D,1,v,p.width,p.height):n.texImage2D(e.TEXTURE_2D,0,v,p.width,p.height,0,m,_,null));else if(o.isDataTexture){if(b.length>0){x&&S&&n.texStorage2D(e.TEXTURE_2D,w,v,b[0].width,b[0].height);for(let t=0,r=b.length;t<r;t++)y=b[t],x?C&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,y.width,y.height,m,_,y.data):n.texImage2D(e.TEXTURE_2D,t,v,y.width,y.height,0,m,_,y.data);o.generateMipmaps=!1}else x?(S&&n.texStorage2D(e.TEXTURE_2D,w,v,p.width,p.height),C&&xe(o,p,m,_)):n.texImage2D(e.TEXTURE_2D,0,v,p.width,p.height,0,m,_,p.data)}else if(o.isCompressedTexture){if(o.isCompressedArrayTexture){x&&S&&n.texStorage3D(e.TEXTURE_2D_ARRAY,w,v,b[0].width,b[0].height,p.depth);for(let t=0,r=b.length;t<r;t++)if(y=b[t],o.format!==1023){if(m!==null){if(x){if(C){if(o.layerUpdates.size>0){let r=os(y.width,y.height,o.format,o.type);for(let i of o.layerUpdates){let a=y.data.subarray(i*r/y.data.BYTES_PER_ELEMENT,(i+1)*r/y.data.BYTES_PER_ELEMENT);n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,t,0,0,i,y.width,y.height,1,m,a)}o.clearLayerUpdates()}else n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,t,0,0,0,y.width,y.height,p.depth,m,y.data)}}else n.compressedTexImage3D(e.TEXTURE_2D_ARRAY,t,v,y.width,y.height,p.depth,0,y.data,0,0)}else N(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`)}else x?C&&n.texSubImage3D(e.TEXTURE_2D_ARRAY,t,0,0,0,y.width,y.height,p.depth,m,_,y.data):n.texImage3D(e.TEXTURE_2D_ARRAY,t,v,y.width,y.height,p.depth,0,m,_,y.data)}else{x&&S&&n.texStorage2D(e.TEXTURE_2D,w,v,b[0].width,b[0].height);for(let t=0,r=b.length;t<r;t++)y=b[t],o.format===1023?x?C&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,y.width,y.height,m,_,y.data):n.texImage2D(e.TEXTURE_2D,t,v,y.width,y.height,0,m,_,y.data):m===null?N(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`):x?C&&n.compressedTexSubImage2D(e.TEXTURE_2D,t,0,0,y.width,y.height,m,y.data):n.compressedTexImage2D(e.TEXTURE_2D,t,v,y.width,y.height,0,y.data)}}else if(o.isDataArrayTexture){if(x){if(S&&n.texStorage3D(e.TEXTURE_2D_ARRAY,w,v,p.width,p.height,p.depth),C){if(o.layerUpdates.size>0){let t=os(p.width,p.height,o.format,o.type);for(let r of o.layerUpdates){let i=p.data.subarray(r*t/p.data.BYTES_PER_ELEMENT,(r+1)*t/p.data.BYTES_PER_ELEMENT);n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,r,p.width,p.height,1,m,_,i)}o.clearLayerUpdates()}else n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,p.width,p.height,p.depth,m,_,p.data)}}else n.texImage3D(e.TEXTURE_2D_ARRAY,0,v,p.width,p.height,p.depth,0,m,_,p.data)}else if(o.isData3DTexture)x?(S&&n.texStorage3D(e.TEXTURE_3D,w,v,p.width,p.height,p.depth),C&&n.texSubImage3D(e.TEXTURE_3D,0,0,0,0,p.width,p.height,p.depth,m,_,p.data)):n.texImage3D(e.TEXTURE_3D,0,v,p.width,p.height,p.depth,0,m,_,p.data);else if(o.isFramebufferTexture){if(S){if(x)n.texStorage2D(e.TEXTURE_2D,w,v,p.width,p.height);else{let t=p.width,r=p.height;for(let i=0;i<w;i++)n.texImage2D(e.TEXTURE_2D,i,v,t,r,0,m,_,null),t>>=1,r>>=1}}}else if(b.length>0){if(x&&S){let t=j(b[0]);n.texStorage2D(e.TEXTURE_2D,w,v,t.width,t.height)}for(let t=0,r=b.length;t<r;t++)y=b[t],x?C&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,m,_,y):n.texImage2D(e.TEXTURE_2D,t,v,m,_,y);o.generateMipmaps=!1}else if(x){if(S){let t=j(p);n.texStorage2D(e.TEXTURE_2D,w,v,t.width,t.height)}C&&n.texSubImage2D(e.TEXTURE_2D,0,0,0,m,_,p)}else n.texImage2D(e.TEXTURE_2D,0,v,m,_,p);g(o)&&E(c),d.__version=u.version,o.onUpdate&&o.onUpdate(o)}t.__version=o.version}function Ce(t,o,s){if(o.image.length!==6)return;let c=ye(t,o),l=o.source;n.bindTexture(e.TEXTURE_CUBE_MAP,t.__webglTexture,e.TEXTURE0+s);let u=r.get(l);if(l.version!==u.__version||c===!0){n.activeTexture(e.TEXTURE0+s);let t=Ht.getPrimaries(Ht.workingColorSpace),r=o.colorSpace===``?null:Ht.getPrimaries(o.colorSpace),d=o.colorSpace===``||t===r?e.NONE:e.BROWSER_DEFAULT_WEBGL;e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,o.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,o.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,o.unpackAlignment),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,d);let f=o.isCompressedTexture||o.image[0].isCompressedTexture,p=o.image[0]&&o.image[0].isDataTexture,m=[];for(let e=0;e<6;e++)!f&&!p?m[e]=h(o.image[e],!0,i.maxCubemapSize):m[e]=p?o.image[e].image:o.image[e],m[e]=Ie(o,m[e]);let _=m[0],v=a.convert(o.format,o.colorSpace),y=a.convert(o.type),b=O(o.internalFormat,v,y,o.colorSpace),x=o.isVideoTexture!==!0,S=u.__version===void 0||c===!0,C=l.dataReady,w=te(o,_);ve(e.TEXTURE_CUBE_MAP,o);let T;if(f){x&&S&&n.texStorage2D(e.TEXTURE_CUBE_MAP,w,b,_.width,_.height);for(let t=0;t<6;t++){T=m[t].mipmaps;for(let r=0;r<T.length;r++){let i=T[r];o.format===1023?x?C&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,0,0,i.width,i.height,v,y,i.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,b,i.width,i.height,0,v,y,i.data):v===null?N(`WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()`):x?C&&n.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,0,0,i.width,i.height,v,i.data):n.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,b,i.width,i.height,0,i.data)}}}else{if(T=o.mipmaps,x&&S){T.length>0&&w++;let t=j(m[0]);n.texStorage2D(e.TEXTURE_CUBE_MAP,w,b,t.width,t.height)}for(let t=0;t<6;t++)if(p){x?C&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,m[t].width,m[t].height,v,y,m[t].data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,b,m[t].width,m[t].height,0,v,y,m[t].data);for(let r=0;r<T.length;r++){let i=T[r].image[t].image;x?C&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,0,0,i.width,i.height,v,y,i.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,b,i.width,i.height,0,v,y,i.data)}}else{x?C&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,v,y,m[t]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,b,v,y,m[t]);for(let r=0;r<T.length;r++){let i=T[r];x?C&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,0,0,v,y,i.image[t]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,b,v,y,i.image[t])}}}g(o)&&E(e.TEXTURE_CUBE_MAP),u.__version=l.version,o.onUpdate&&o.onUpdate(o)}t.__version=o.version}function we(t,i,o,c,l,u){let d=a.convert(o.format,o.colorSpace),f=a.convert(o.type),p=O(o.internalFormat,d,f,o.colorSpace),m=r.get(i),h=r.get(o);if(h.__renderTarget=i,!m.__hasExternalTextures){let t=Math.max(1,i.width>>u),r=Math.max(1,i.height>>u);l===e.TEXTURE_3D||l===e.TEXTURE_2D_ARRAY?n.texImage3D(l,u,p,t,r,i.depth,0,d,f,null):n.texImage2D(l,u,p,t,r,0,d,f,null)}n.bindFramebuffer(e.FRAMEBUFFER,t),Pe(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,c,l,h.__webglTexture,0,A(i)):(l===e.TEXTURE_2D||l>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&l<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,c,l,h.__webglTexture,u),n.bindFramebuffer(e.FRAMEBUFFER,null)}function Te(t,n,r){if(e.bindRenderbuffer(e.RENDERBUFFER,t),n.depthBuffer){let i=n.depthTexture,a=i&&i.isDepthTexture?i.type:null,o=ee(n.stencilBuffer,a),c=n.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;Pe(n)?s.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,A(n),o,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,A(n),o,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,o,n.width,n.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,c,e.RENDERBUFFER,t)}else{let t=n.textures;for(let i=0;i<t.length;i++){let o=t[i],c=a.convert(o.format,o.colorSpace),l=a.convert(o.type),u=O(o.internalFormat,c,l,o.colorSpace);Pe(n)?s.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,A(n),u,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,A(n),u,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,u,n.width,n.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function Ee(t,i,o){let c=i.isWebGLCubeRenderTarget===!0;if(n.bindFramebuffer(e.FRAMEBUFFER,t),!(i.depthTexture&&i.depthTexture.isDepthTexture))throw Error(`renderTarget.depthTexture must be an instance of THREE.DepthTexture`);let l=r.get(i.depthTexture);if(l.__renderTarget=i,l.__webglTexture&&i.depthTexture.image.width===i.width&&i.depthTexture.image.height===i.height||(i.depthTexture.image.width=i.width,i.depthTexture.image.height=i.height,i.depthTexture.needsUpdate=!0),c){if(l.__webglInit===void 0&&(l.__webglInit=!0,i.depthTexture.addEventListener(`dispose`,ne)),l.__webglTexture===void 0){l.__webglTexture=e.createTexture(),n.bindTexture(e.TEXTURE_CUBE_MAP,l.__webglTexture),ve(e.TEXTURE_CUBE_MAP,i.depthTexture);let t=a.convert(i.depthTexture.format),r=a.convert(i.depthTexture.type),o;i.depthTexture.format===1026?o=e.DEPTH_COMPONENT24:i.depthTexture.format===1027&&(o=e.DEPTH24_STENCIL8);for(let n=0;n<6;n++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+n,0,o,i.width,i.height,0,t,r,null)}}else ue(i.depthTexture,0);let u=l.__webglTexture,d=A(i),f=c?e.TEXTURE_CUBE_MAP_POSITIVE_X+o:e.TEXTURE_2D,p=i.depthTexture.format===1027?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(i.depthTexture.format===1026)Pe(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,p,f,u,0,d):e.framebufferTexture2D(e.FRAMEBUFFER,p,f,u,0);else if(i.depthTexture.format===1027)Pe(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,p,f,u,0,d):e.framebufferTexture2D(e.FRAMEBUFFER,p,f,u,0);else throw Error(`Unknown depthTexture format`)}function De(t){let i=r.get(t),a=t.isWebGLCubeRenderTarget===!0;if(i.__boundDepthTexture!==t.depthTexture){let e=t.depthTexture;if(i.__depthDisposeCallback&&i.__depthDisposeCallback(),e){let t=()=>{delete i.__boundDepthTexture,delete i.__depthDisposeCallback,e.removeEventListener(`dispose`,t)};e.addEventListener(`dispose`,t),i.__depthDisposeCallback=t}i.__boundDepthTexture=e}if(t.depthTexture&&!i.__autoAllocateDepthBuffer){if(a)for(let e=0;e<6;e++)Ee(i.__webglFramebuffer[e],t,e);else{let e=t.texture.mipmaps;e&&e.length>0?Ee(i.__webglFramebuffer[0],t,0):Ee(i.__webglFramebuffer,t,0)}}else if(a){i.__webglDepthbuffer=[];for(let r=0;r<6;r++)if(n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer[r]),i.__webglDepthbuffer[r]===void 0)i.__webglDepthbuffer[r]=e.createRenderbuffer(),Te(i.__webglDepthbuffer[r],t,!1);else{let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,a=i.__webglDepthbuffer[r];e.bindRenderbuffer(e.RENDERBUFFER,a),e.framebufferRenderbuffer(e.FRAMEBUFFER,n,e.RENDERBUFFER,a)}}else{let r=t.texture.mipmaps;if(r&&r.length>0?n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer[0]):n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer),i.__webglDepthbuffer===void 0)i.__webglDepthbuffer=e.createRenderbuffer(),Te(i.__webglDepthbuffer,t,!1);else{let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,r=i.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,r),e.framebufferRenderbuffer(e.FRAMEBUFFER,n,e.RENDERBUFFER,r)}}n.bindFramebuffer(e.FRAMEBUFFER,null)}function Oe(t,n,i){let a=r.get(t);n!==void 0&&we(a.__webglFramebuffer,t,t.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),i!==void 0&&De(t)}function ke(t){let i=t.texture,s=r.get(t),c=r.get(i);t.addEventListener(`dispose`,k);let l=t.textures,u=t.isWebGLCubeRenderTarget===!0,d=l.length>1;if(d||(c.__webglTexture===void 0&&(c.__webglTexture=e.createTexture()),c.__version=i.version,o.memory.textures++),u){s.__webglFramebuffer=[];for(let t=0;t<6;t++)if(i.mipmaps&&i.mipmaps.length>0){s.__webglFramebuffer[t]=[];for(let n=0;n<i.mipmaps.length;n++)s.__webglFramebuffer[t][n]=e.createFramebuffer()}else s.__webglFramebuffer[t]=e.createFramebuffer()}else{if(i.mipmaps&&i.mipmaps.length>0){s.__webglFramebuffer=[];for(let t=0;t<i.mipmaps.length;t++)s.__webglFramebuffer[t]=e.createFramebuffer()}else s.__webglFramebuffer=e.createFramebuffer();if(d)for(let t=0,n=l.length;t<n;t++){let n=r.get(l[t]);n.__webglTexture===void 0&&(n.__webglTexture=e.createTexture(),o.memory.textures++)}if(t.samples>0&&Pe(t)===!1){s.__webglMultisampledFramebuffer=e.createFramebuffer(),s.__webglColorRenderbuffer=[],n.bindFramebuffer(e.FRAMEBUFFER,s.__webglMultisampledFramebuffer);for(let n=0;n<l.length;n++){let r=l[n];s.__webglColorRenderbuffer[n]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,s.__webglColorRenderbuffer[n]);let i=a.convert(r.format,r.colorSpace),o=a.convert(r.type),c=O(r.internalFormat,i,o,r.colorSpace,t.isXRRenderTarget===!0),u=A(t);e.renderbufferStorageMultisample(e.RENDERBUFFER,u,c,t.width,t.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+n,e.RENDERBUFFER,s.__webglColorRenderbuffer[n])}e.bindRenderbuffer(e.RENDERBUFFER,null),t.depthBuffer&&(s.__webglDepthRenderbuffer=e.createRenderbuffer(),Te(s.__webglDepthRenderbuffer,t,!0)),n.bindFramebuffer(e.FRAMEBUFFER,null)}}if(u){n.bindTexture(e.TEXTURE_CUBE_MAP,c.__webglTexture),ve(e.TEXTURE_CUBE_MAP,i);for(let n=0;n<6;n++)if(i.mipmaps&&i.mipmaps.length>0)for(let r=0;r<i.mipmaps.length;r++)we(s.__webglFramebuffer[n][r],t,i,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+n,r);else we(s.__webglFramebuffer[n],t,i,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+n,0);g(i)&&E(e.TEXTURE_CUBE_MAP),n.unbindTexture()}else if(d){for(let i=0,a=l.length;i<a;i++){let a=l[i],o=r.get(a),c=e.TEXTURE_2D;(t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(c=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(c,o.__webglTexture),ve(c,a),we(s.__webglFramebuffer,t,a,e.COLOR_ATTACHMENT0+i,c,0),g(a)&&E(c)}n.unbindTexture()}else{let r=e.TEXTURE_2D;if((t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(r=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(r,c.__webglTexture),ve(r,i),i.mipmaps&&i.mipmaps.length>0)for(let n=0;n<i.mipmaps.length;n++)we(s.__webglFramebuffer[n],t,i,e.COLOR_ATTACHMENT0,r,n);else we(s.__webglFramebuffer,t,i,e.COLOR_ATTACHMENT0,r,0);g(i)&&E(r),n.unbindTexture()}t.depthBuffer&&De(t)}function Ae(e){let t=e.textures;for(let i=0,a=t.length;i<a;i++){let a=t[i];if(g(a)){let t=D(e),i=r.get(a).__webglTexture;n.bindTexture(t,i),E(t),n.unbindTexture()}}}let je=[],Me=[];function Ne(t){if(t.samples>0){if(Pe(t)===!1){let i=t.textures,a=t.width,o=t.height,s=e.COLOR_BUFFER_BIT,l=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,u=r.get(t),d=i.length>1;if(d)for(let t=0;t<i.length;t++)n.bindFramebuffer(e.FRAMEBUFFER,u.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,null),n.bindFramebuffer(e.FRAMEBUFFER,u.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,null,0);n.bindFramebuffer(e.READ_FRAMEBUFFER,u.__webglMultisampledFramebuffer);let f=t.texture.mipmaps;f&&f.length>0?n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglFramebuffer[0]):n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglFramebuffer);for(let n=0;n<i.length;n++){if(t.resolveDepthBuffer&&(t.depthBuffer&&(s|=e.DEPTH_BUFFER_BIT),t.stencilBuffer&&t.resolveStencilBuffer&&(s|=e.STENCIL_BUFFER_BIT)),d){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,u.__webglColorRenderbuffer[n]);let t=r.get(i[n]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0)}e.blitFramebuffer(0,0,a,o,0,0,a,o,s,e.NEAREST),c===!0&&(je.length=0,Me.length=0,je.push(e.COLOR_ATTACHMENT0+n),t.depthBuffer&&t.resolveDepthBuffer===!1&&(je.push(l),Me.push(l),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,Me)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,je))}if(n.bindFramebuffer(e.READ_FRAMEBUFFER,null),n.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),d)for(let t=0;t<i.length;t++){n.bindFramebuffer(e.FRAMEBUFFER,u.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,u.__webglColorRenderbuffer[t]);let a=r.get(i[t]).__webglTexture;n.bindFramebuffer(e.FRAMEBUFFER,u.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,a,0)}n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglMultisampledFramebuffer)}else if(t.depthBuffer&&t.resolveDepthBuffer===!1&&c){let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[n])}}}function A(e){return Math.min(i.maxSamples,e.samples)}function Pe(e){let n=r.get(e);return e.samples>0&&t.has(`WEBGL_multisampled_render_to_texture`)===!0&&n.__useRenderToTexture!==!1}function Fe(e){let t=o.render.frame;u.get(e)!==t&&(u.set(e,t),e.update())}function Ie(e,t){let n=e.colorSpace,r=e.format,i=e.type;return e.isCompressedTexture===!0||e.isVideoTexture===!0||n!==`srgb-linear`&&n!==``&&(Ht.getTransfer(n)===`srgb`?(r!==1023||i!==1009)&&N(`WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.`):P(`WebGLTextures: Unsupported texture color space:`,n)),t}function j(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement?(l.width=e.naturalWidth||e.width,l.height=e.naturalHeight||e.height):typeof VideoFrame<`u`&&e instanceof VideoFrame?(l.width=e.displayWidth,l.height=e.displayHeight):(l.width=e.width,l.height=e.height),l}this.allocateTextureUnit=ce,this.resetTextureUnits=se,this.setTexture2D=ue,this.setTexture2DArray=de,this.setTexture3D=fe,this.setTextureCube=me,this.rebindTextures=Oe,this.setupRenderTarget=ke,this.updateRenderTargetMipmap=Ae,this.updateMultisampleRenderTarget=Ne,this.setupDepthRenderbuffer=De,this.setupFrameBufferTexture=we,this.useMultisampledRTT=Pe,this.isReversedDepthBuffer=function(){return n.buffers.depth.getReversed()}}function du(e,t){function n(n,r=``){let i,a=Ht.getTransfer(r);if(n===1009)return e.UNSIGNED_BYTE;if(n===1017)return e.UNSIGNED_SHORT_4_4_4_4;if(n===1018)return e.UNSIGNED_SHORT_5_5_5_1;if(n===35902)return e.UNSIGNED_INT_5_9_9_9_REV;if(n===35899)return e.UNSIGNED_INT_10F_11F_11F_REV;if(n===1010)return e.BYTE;if(n===1011)return e.SHORT;if(n===1012)return e.UNSIGNED_SHORT;if(n===1013)return e.INT;if(n===1014)return e.UNSIGNED_INT;if(n===1015)return e.FLOAT;if(n===1016)return e.HALF_FLOAT;if(n===1021)return e.ALPHA;if(n===1022)return e.RGB;if(n===1023)return e.RGBA;if(n===1026)return e.DEPTH_COMPONENT;if(n===1027)return e.DEPTH_STENCIL;if(n===1028)return e.RED;if(n===1029)return e.RED_INTEGER;if(n===1030)return e.RG;if(n===1031)return e.RG_INTEGER;if(n===1033)return e.RGBA_INTEGER;if(n===33776||n===33777||n===33778||n===33779){if(a===`srgb`){if(i=t.get(`WEBGL_compressed_texture_s3tc_srgb`),i!==null){if(n===33776)return i.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null}else if(i=t.get(`WEBGL_compressed_texture_s3tc`),i!==null){if(n===33776)return i.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null}if(n===35840||n===35841||n===35842||n===35843){if(i=t.get(`WEBGL_compressed_texture_pvrtc`),i!==null){if(n===35840)return i.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===35841)return i.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===35842)return i.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===35843)return i.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null}if(n===36196||n===37492||n===37496||n===37488||n===37489||n===37490||n===37491){if(i=t.get(`WEBGL_compressed_texture_etc`),i!==null){if(n===36196||n===37492)return a===`srgb`?i.COMPRESSED_SRGB8_ETC2:i.COMPRESSED_RGB8_ETC2;if(n===37496)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:i.COMPRESSED_RGBA8_ETC2_EAC;if(n===37488)return i.COMPRESSED_R11_EAC;if(n===37489)return i.COMPRESSED_SIGNED_R11_EAC;if(n===37490)return i.COMPRESSED_RG11_EAC;if(n===37491)return i.COMPRESSED_SIGNED_RG11_EAC}else return null}if(n===37808||n===37809||n===37810||n===37811||n===37812||n===37813||n===37814||n===37815||n===37816||n===37817||n===37818||n===37819||n===37820||n===37821){if(i=t.get(`WEBGL_compressed_texture_astc`),i!==null){if(n===37808)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:i.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===37809)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:i.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===37810)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:i.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===37811)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:i.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===37812)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:i.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===37813)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:i.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===37814)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:i.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===37815)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:i.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===37816)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:i.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===37817)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:i.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===37818)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:i.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===37819)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:i.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===37820)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:i.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===37821)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:i.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null}if(n===36492||n===36494||n===36495){if(i=t.get(`EXT_texture_compression_bptc`),i!==null){if(n===36492)return a===`srgb`?i.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:i.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===36494)return i.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===36495)return i.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null}if(n===36283||n===36284||n===36285||n===36286){if(i=t.get(`EXT_texture_compression_rgtc`),i!==null){if(n===36283)return i.COMPRESSED_RED_RGTC1_EXT;if(n===36284)return i.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===36285)return i.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===36286)return i.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null}return n===1020?e.UNSIGNED_INT_24_8:e[n]===void 0?null:e[n]}return{convert:n}}var fu=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,pu=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,mu=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new Oi(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new co({vertexShader:fu,fragmentShader:pu,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new z(new Za(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},hu=class extends wt{constructor(e,t){super();let n=this,r=null,i=1,a=null,o=`local-floor`,s=1,c=null,l=null,u=null,d=null,f=null,p=null,m=typeof XRWebGLBinding<`u`,h=new mu,g={},_=t.getContextAttributes(),v=null,y=null,b=[],x=[],S=new F,C=null,w=new Bo;w.viewport=new $t;let T=new Bo;T.viewport=new $t;let D=[w,T],O=new qo,ee=null,te=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(e){let t=b[e];return t===void 0&&(t=new Pn,b[e]=t),t.getTargetRaySpace()},this.getControllerGrip=function(e){let t=b[e];return t===void 0&&(t=new Pn,b[e]=t),t.getGripSpace()},this.getHand=function(e){let t=b[e];return t===void 0&&(t=new Pn,b[e]=t),t.getHandSpace()};function k(e){let t=x.indexOf(e.inputSource);if(t===-1)return;let n=b[t];n!==void 0&&(n.update(e.inputSource,e.frame,c||a),n.dispatchEvent({type:e.type,data:e.inputSource}))}function re(){r.removeEventListener(`select`,k),r.removeEventListener(`selectstart`,k),r.removeEventListener(`selectend`,k),r.removeEventListener(`squeeze`,k),r.removeEventListener(`squeezestart`,k),r.removeEventListener(`squeezeend`,k),r.removeEventListener(`end`,re),r.removeEventListener(`inputsourceschange`,ie);for(let e=0;e<b.length;e++){let t=x[e];t!==null&&(x[e]=null,b[e].disconnect(t))}ee=null,te=null,h.reset();for(let e in g)delete g[e];e.setRenderTarget(v),f=null,d=null,u=null,r=null,y=null,ge.stop(),n.isPresenting=!1,e.setPixelRatio(C),e.setSize(S.width,S.height,!1),n.dispatchEvent({type:`sessionend`})}this.setFramebufferScaleFactor=function(e){i=e,n.isPresenting===!0&&N(`WebXRManager: Cannot change framebuffer scale while presenting.`)},this.setReferenceSpaceType=function(e){o=e,n.isPresenting===!0&&N(`WebXRManager: Cannot change reference space type while presenting.`)},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(e){c=e},this.getBaseLayer=function(){return d===null?f:d},this.getBinding=function(){return u===null&&m&&(u=new XRWebGLBinding(r,t)),u},this.getFrame=function(){return p},this.getSession=function(){return r},this.setSession=async function(l){if(r=l,r!==null){if(v=e.getRenderTarget(),r.addEventListener(`select`,k),r.addEventListener(`selectstart`,k),r.addEventListener(`selectend`,k),r.addEventListener(`squeeze`,k),r.addEventListener(`squeezestart`,k),r.addEventListener(`squeezeend`,k),r.addEventListener(`end`,re),r.addEventListener(`inputsourceschange`,ie),_.xrCompatible!==!0&&await t.makeXRCompatible(),C=e.getPixelRatio(),e.getSize(S),m&&`createProjectionLayer`in XRWebGLBinding.prototype){let n=null,a=null,o=null;_.depth&&(o=_.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,n=_.stencil?pe:fe,a=_.stencil?oe:ne);let s={colorFormat:t.RGBA8,depthFormat:o,scaleFactor:i};u=this.getBinding(),d=u.createProjectionLayer(s),r.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),y=new tn(d.textureWidth,d.textureHeight,{format:de,type:E,depthTexture:new Ei(d.textureWidth,d.textureHeight,a,void 0,void 0,void 0,void 0,void 0,void 0,n),stencilBuffer:_.stencil,colorSpace:e.outputColorSpace,samples:_.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}else{let n={antialias:_.antialias,alpha:!0,depth:_.depth,stencil:_.stencil,framebufferScaleFactor:i};f=new XRWebGLLayer(r,t,n),r.updateRenderState({baseLayer:f}),e.setPixelRatio(1),e.setSize(f.framebufferWidth,f.framebufferHeight,!1),y=new tn(f.framebufferWidth,f.framebufferHeight,{format:de,type:E,colorSpace:e.outputColorSpace,stencilBuffer:_.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(s),c=null,a=await r.requestReferenceSpace(o),ge.setContext(r),ge.start(),n.isPresenting=!0,n.dispatchEvent({type:`sessionstart`})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return h.getDepthTexture()};function ie(e){for(let t=0;t<e.removed.length;t++){let n=e.removed[t],r=x.indexOf(n);r>=0&&(x[r]=null,b[r].disconnect(n))}for(let t=0;t<e.added.length;t++){let n=e.added[t],r=x.indexOf(n);if(r===-1){for(let e=0;e<b.length;e++)if(e>=x.length){x.push(n),r=e;break}else if(x[e]===null){x[e]=n,r=e;break}if(r===-1)break}let i=b[r];i&&i.connect(n)}}let ae=new I,se=new I;function ce(e,t,n){ae.setFromMatrixPosition(t.matrixWorld),se.setFromMatrixPosition(n.matrixWorld);let r=ae.distanceTo(se),i=t.projectionMatrix.elements,a=n.projectionMatrix.elements,o=i[14]/(i[10]-1),s=i[14]/(i[10]+1),c=(i[9]+1)/i[5],l=(i[9]-1)/i[5],u=(i[8]-1)/i[0],d=(a[8]+1)/a[0],f=o*u,p=o*d,m=r/(-u+d),h=m*-u;if(t.matrixWorld.decompose(e.position,e.quaternion,e.scale),e.translateX(h),e.translateZ(m),e.matrixWorld.compose(e.position,e.quaternion,e.scale),e.matrixWorldInverse.copy(e.matrixWorld).invert(),i[10]===-1)e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse);else{let t=o+m,n=s+m,i=f-h,a=p+(r-h),u=c*s/n*t,d=l*s/n*t;e.projectionMatrix.makePerspective(i,a,u,d,t,n),e.projectionMatrixInverse.copy(e.projectionMatrix).invert()}}function le(e,t){t===null?e.matrixWorld.copy(e.matrix):e.matrixWorld.multiplyMatrices(t.matrixWorld,e.matrix),e.matrixWorldInverse.copy(e.matrixWorld).invert()}this.updateCamera=function(e){if(r===null)return;let t=e.near,n=e.far;h.texture!==null&&(h.depthNear>0&&(t=h.depthNear),h.depthFar>0&&(n=h.depthFar)),O.near=T.near=w.near=t,O.far=T.far=w.far=n,(ee!==O.near||te!==O.far)&&(r.updateRenderState({depthNear:O.near,depthFar:O.far}),ee=O.near,te=O.far),O.layers.mask=e.layers.mask|6,w.layers.mask=O.layers.mask&-5,T.layers.mask=O.layers.mask&-3;let i=e.parent,a=O.cameras;le(O,i);for(let e=0;e<a.length;e++)le(a[e],i);a.length===2?ce(O,w,T):O.projectionMatrix.copy(w.projectionMatrix),ue(e,O,i)};function ue(e,t,n){n===null?e.matrix.copy(t.matrixWorld):(e.matrix.copy(n.matrixWorld),e.matrix.invert(),e.matrix.multiply(t.matrixWorld)),e.matrix.decompose(e.position,e.quaternion,e.scale),e.updateMatrixWorld(!0),e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse),e.isPerspectiveCamera&&(e.fov=Dt*2*Math.atan(1/e.projectionMatrix.elements[5]),e.zoom=1)}this.getCamera=function(){return O},this.getFoveation=function(){if(d!==null||f!==null)return s},this.setFoveation=function(e){s=e,d!==null&&(d.fixedFoveation=e),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=e)},this.hasDepthSensing=function(){return h.texture!==null},this.getDepthSensingMesh=function(){return h.getMesh(O)},this.getCameraTexture=function(e){return g[e]};let me=null;function he(t,i){if(l=i.getViewerPose(c||a),p=i,l!==null){let t=l.views;f!==null&&(e.setRenderTargetFramebuffer(y,f.framebuffer),e.setRenderTarget(y));let i=!1;t.length!==O.cameras.length&&(O.cameras.length=0,i=!0);for(let n=0;n<t.length;n++){let r=t[n],a=null;if(f!==null)a=f.getViewport(r);else{let t=u.getViewSubImage(d,r);a=t.viewport,n===0&&(e.setRenderTargetTextures(y,t.colorTexture,t.depthStencilTexture),e.setRenderTarget(y))}let o=D[n];o===void 0&&(o=new Bo,o.layers.enable(n),o.viewport=new $t,D[n]=o),o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.quaternion,o.scale),o.projectionMatrix.fromArray(r.projectionMatrix),o.projectionMatrixInverse.copy(o.projectionMatrix).invert(),o.viewport.set(a.x,a.y,a.width,a.height),n===0&&(O.matrix.copy(o.matrix),O.matrix.decompose(O.position,O.quaternion,O.scale)),i===!0&&O.cameras.push(o)}let a=r.enabledFeatures;if(a&&a.includes(`depth-sensing`)&&r.depthUsage==`gpu-optimized`&&m){u=n.getBinding();let e=u.getDepthInformation(t[0]);e&&e.isValid&&e.texture&&h.init(e,r.renderState)}if(a&&a.includes(`camera-access`)&&m){e.state.unbindTexture(),u=n.getBinding();for(let e=0;e<t.length;e++){let n=t[e].camera;if(n){let e=g[n];e||(e=new Oi,g[n]=e);let t=u.getCameraImage(n);e.sourceTexture=t}}}}for(let e=0;e<b.length;e++){let t=x[e],n=b[e];t!==null&&n!==void 0&&n.update(t,i,c||a)}me&&me(t,i),i.detectedPlanes&&n.dispatchEvent({type:`planesdetected`,data:i}),p=null}let ge=new cs;ge.setAnimationLoop(he),this.setAnimationLoop=function(e){me=e},this.dispose=function(){}}},gu=new hn,_u=new an;function vu(e,t){function n(e,t){e.matrixAutoUpdate===!0&&e.updateMatrix(),t.value.copy(e.matrix)}function r(t,n){n.color.getRGB(t.fogColor.value,io(e)),n.isFog?(t.fogNear.value=n.near,t.fogFar.value=n.far):n.isFogExp2&&(t.fogDensity.value=n.density)}function i(e,t,n,r,i){t.isMeshBasicMaterial?a(e,t):t.isMeshLambertMaterial?(a(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshToonMaterial?(a(e,t),d(e,t)):t.isMeshPhongMaterial?(a(e,t),u(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshStandardMaterial?(a(e,t),f(e,t),t.isMeshPhysicalMaterial&&p(e,t,i)):t.isMeshMatcapMaterial?(a(e,t),m(e,t)):t.isMeshDepthMaterial?a(e,t):t.isMeshDistanceMaterial?(a(e,t),h(e,t)):t.isMeshNormalMaterial?a(e,t):t.isLineBasicMaterial?(o(e,t),t.isLineDashedMaterial&&s(e,t)):t.isPointsMaterial?c(e,t,n,r):t.isSpriteMaterial?l(e,t):t.isShadowMaterial?(e.color.value.copy(t.color),e.opacity.value=t.opacity):t.isShaderMaterial&&(t.uniformsNeedUpdate=!1)}function a(e,r){e.opacity.value=r.opacity,r.color&&e.diffuse.value.copy(r.color),r.emissive&&e.emissive.value.copy(r.emissive).multiplyScalar(r.emissiveIntensity),r.map&&(e.map.value=r.map,n(r.map,e.mapTransform)),r.alphaMap&&(e.alphaMap.value=r.alphaMap,n(r.alphaMap,e.alphaMapTransform)),r.bumpMap&&(e.bumpMap.value=r.bumpMap,n(r.bumpMap,e.bumpMapTransform),e.bumpScale.value=r.bumpScale,r.side===1&&(e.bumpScale.value*=-1)),r.normalMap&&(e.normalMap.value=r.normalMap,n(r.normalMap,e.normalMapTransform),e.normalScale.value.copy(r.normalScale),r.side===1&&e.normalScale.value.negate()),r.displacementMap&&(e.displacementMap.value=r.displacementMap,n(r.displacementMap,e.displacementMapTransform),e.displacementScale.value=r.displacementScale,e.displacementBias.value=r.displacementBias),r.emissiveMap&&(e.emissiveMap.value=r.emissiveMap,n(r.emissiveMap,e.emissiveMapTransform)),r.specularMap&&(e.specularMap.value=r.specularMap,n(r.specularMap,e.specularMapTransform)),r.alphaTest>0&&(e.alphaTest.value=r.alphaTest);let i=t.get(r),a=i.envMap,o=i.envMapRotation;a&&(e.envMap.value=a,gu.copy(o),gu.x*=-1,gu.y*=-1,gu.z*=-1,a.isCubeTexture&&a.isRenderTargetTexture===!1&&(gu.y*=-1,gu.z*=-1),e.envMapRotation.value.setFromMatrix4(_u.makeRotationFromEuler(gu)),e.flipEnvMap.value=a.isCubeTexture&&a.isRenderTargetTexture===!1?-1:1,e.reflectivity.value=r.reflectivity,e.ior.value=r.ior,e.refractionRatio.value=r.refractionRatio),r.lightMap&&(e.lightMap.value=r.lightMap,e.lightMapIntensity.value=r.lightMapIntensity,n(r.lightMap,e.lightMapTransform)),r.aoMap&&(e.aoMap.value=r.aoMap,e.aoMapIntensity.value=r.aoMapIntensity,n(r.aoMap,e.aoMapTransform))}function o(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform))}function s(e,t){e.dashSize.value=t.dashSize,e.totalSize.value=t.dashSize+t.gapSize,e.scale.value=t.scale}function c(e,t,r,i){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.size.value=t.size*r,e.scale.value=i*.5,t.map&&(e.map.value=t.map,n(t.map,e.uvTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function l(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.rotation.value=t.rotation,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function u(e,t){e.specular.value.copy(t.specular),e.shininess.value=Math.max(t.shininess,1e-4)}function d(e,t){t.gradientMap&&(e.gradientMap.value=t.gradientMap)}function f(e,t){e.metalness.value=t.metalness,t.metalnessMap&&(e.metalnessMap.value=t.metalnessMap,n(t.metalnessMap,e.metalnessMapTransform)),e.roughness.value=t.roughness,t.roughnessMap&&(e.roughnessMap.value=t.roughnessMap,n(t.roughnessMap,e.roughnessMapTransform)),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)}function p(e,t,r){e.ior.value=t.ior,t.sheen>0&&(e.sheenColor.value.copy(t.sheenColor).multiplyScalar(t.sheen),e.sheenRoughness.value=t.sheenRoughness,t.sheenColorMap&&(e.sheenColorMap.value=t.sheenColorMap,n(t.sheenColorMap,e.sheenColorMapTransform)),t.sheenRoughnessMap&&(e.sheenRoughnessMap.value=t.sheenRoughnessMap,n(t.sheenRoughnessMap,e.sheenRoughnessMapTransform))),t.clearcoat>0&&(e.clearcoat.value=t.clearcoat,e.clearcoatRoughness.value=t.clearcoatRoughness,t.clearcoatMap&&(e.clearcoatMap.value=t.clearcoatMap,n(t.clearcoatMap,e.clearcoatMapTransform)),t.clearcoatRoughnessMap&&(e.clearcoatRoughnessMap.value=t.clearcoatRoughnessMap,n(t.clearcoatRoughnessMap,e.clearcoatRoughnessMapTransform)),t.clearcoatNormalMap&&(e.clearcoatNormalMap.value=t.clearcoatNormalMap,n(t.clearcoatNormalMap,e.clearcoatNormalMapTransform),e.clearcoatNormalScale.value.copy(t.clearcoatNormalScale),t.side===1&&e.clearcoatNormalScale.value.negate())),t.dispersion>0&&(e.dispersion.value=t.dispersion),t.iridescence>0&&(e.iridescence.value=t.iridescence,e.iridescenceIOR.value=t.iridescenceIOR,e.iridescenceThicknessMinimum.value=t.iridescenceThicknessRange[0],e.iridescenceThicknessMaximum.value=t.iridescenceThicknessRange[1],t.iridescenceMap&&(e.iridescenceMap.value=t.iridescenceMap,n(t.iridescenceMap,e.iridescenceMapTransform)),t.iridescenceThicknessMap&&(e.iridescenceThicknessMap.value=t.iridescenceThicknessMap,n(t.iridescenceThicknessMap,e.iridescenceThicknessMapTransform))),t.transmission>0&&(e.transmission.value=t.transmission,e.transmissionSamplerMap.value=r.texture,e.transmissionSamplerSize.value.set(r.width,r.height),t.transmissionMap&&(e.transmissionMap.value=t.transmissionMap,n(t.transmissionMap,e.transmissionMapTransform)),e.thickness.value=t.thickness,t.thicknessMap&&(e.thicknessMap.value=t.thicknessMap,n(t.thicknessMap,e.thicknessMapTransform)),e.attenuationDistance.value=t.attenuationDistance,e.attenuationColor.value.copy(t.attenuationColor)),t.anisotropy>0&&(e.anisotropyVector.value.set(t.anisotropy*Math.cos(t.anisotropyRotation),t.anisotropy*Math.sin(t.anisotropyRotation)),t.anisotropyMap&&(e.anisotropyMap.value=t.anisotropyMap,n(t.anisotropyMap,e.anisotropyMapTransform))),e.specularIntensity.value=t.specularIntensity,e.specularColor.value.copy(t.specularColor),t.specularColorMap&&(e.specularColorMap.value=t.specularColorMap,n(t.specularColorMap,e.specularColorMapTransform)),t.specularIntensityMap&&(e.specularIntensityMap.value=t.specularIntensityMap,n(t.specularIntensityMap,e.specularIntensityMapTransform))}function m(e,t){t.matcap&&(e.matcap.value=t.matcap)}function h(e,n){let r=t.get(n).light;e.referencePosition.value.setFromMatrixPosition(r.matrixWorld),e.nearDistance.value=r.shadow.camera.near,e.farDistance.value=r.shadow.camera.far}return{refreshFogUniforms:r,refreshMaterialUniforms:i}}function yu(e,t,n,r){let i={},a={},o=[],s=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function c(e,t){let n=t.program;r.uniformBlockBinding(e,n)}function l(e,n){let o=i[e.id];o===void 0&&(m(e),o=u(e),i[e.id]=o,e.addEventListener(`dispose`,g));let s=n.program;r.updateUBOMapping(e,s);let c=t.render.frame;a[e.id]!==c&&(f(e),a[e.id]=c)}function u(t){let n=d();t.__bindingPointIndex=n;let r=e.createBuffer(),i=t.__size,a=t.usage;return e.bindBuffer(e.UNIFORM_BUFFER,r),e.bufferData(e.UNIFORM_BUFFER,i,a),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,n,r),r}function d(){for(let e=0;e<s;e++)if(o.indexOf(e)===-1)return o.push(e),e;return P(`WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.`),0}function f(t){let n=i[t.id],r=t.uniforms,a=t.__cache;e.bindBuffer(e.UNIFORM_BUFFER,n);for(let t=0,n=r.length;t<n;t++){let n=Array.isArray(r[t])?r[t]:[r[t]];for(let r=0,i=n.length;r<i;r++){let i=n[r];if(p(i,t,r,a)===!0){let t=i.__offset,n=Array.isArray(i.value)?i.value:[i.value],r=0;for(let a=0;a<n.length;a++){let o=n[a],s=h(o);typeof o==`number`||typeof o==`boolean`?(i.__data[0]=o,e.bufferSubData(e.UNIFORM_BUFFER,t+r,i.__data)):o.isMatrix3?(i.__data[0]=o.elements[0],i.__data[1]=o.elements[1],i.__data[2]=o.elements[2],i.__data[3]=0,i.__data[4]=o.elements[3],i.__data[5]=o.elements[4],i.__data[6]=o.elements[5],i.__data[7]=0,i.__data[8]=o.elements[6],i.__data[9]=o.elements[7],i.__data[10]=o.elements[8],i.__data[11]=0):(o.toArray(i.__data,r),r+=s.storage/Float32Array.BYTES_PER_ELEMENT)}e.bufferSubData(e.UNIFORM_BUFFER,t,i.__data)}}}e.bindBuffer(e.UNIFORM_BUFFER,null)}function p(e,t,n,r){let i=e.value,a=t+`_`+n;if(r[a]===void 0)return r[a]=typeof i==`number`||typeof i==`boolean`?i:i.clone(),!0;{let e=r[a];if(typeof i==`number`||typeof i==`boolean`){if(e!==i)return r[a]=i,!0}else if(e.equals(i)===!1)return e.copy(i),!0}return!1}function m(e){let t=e.uniforms,n=0;for(let e=0,r=t.length;e<r;e++){let r=Array.isArray(t[e])?t[e]:[t[e]];for(let e=0,t=r.length;e<t;e++){let t=r[e],i=Array.isArray(t.value)?t.value:[t.value];for(let e=0,r=i.length;e<r;e++){let r=i[e],a=h(r),o=n%16,s=o%a.boundary,c=o+s;n+=s,c!==0&&16-c<a.storage&&(n+=16-c),t.__data=new Float32Array(a.storage/Float32Array.BYTES_PER_ELEMENT),t.__offset=n,n+=a.storage}}}let r=n%16;return r>0&&(n+=16-r),e.__size=n,e.__cache={},this}function h(e){let t={boundary:0,storage:0};return typeof e==`number`||typeof e==`boolean`?(t.boundary=4,t.storage=4):e.isVector2?(t.boundary=8,t.storage=8):e.isVector3||e.isColor?(t.boundary=16,t.storage=12):e.isVector4?(t.boundary=16,t.storage=16):e.isMatrix3?(t.boundary=48,t.storage=48):e.isMatrix4?(t.boundary=64,t.storage=64):e.isTexture?N(`WebGLRenderer: Texture samplers can not be part of an uniforms group.`):N(`WebGLRenderer: Unsupported uniform value type.`,e),t}function g(t){let n=t.target;n.removeEventListener(`dispose`,g);let r=o.indexOf(n.__bindingPointIndex);o.splice(r,1),e.deleteBuffer(i[n.id]),delete i[n.id],delete a[n.id]}function _(){for(let t in i)e.deleteBuffer(i[t]);o=[],i={},a={}}return{bind:c,update:l,dispose:_}}var bu=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),xu=null;function Su(){return xu===null&&(xu=new oi(bu,16,16,ge,re),xu.name=`DFG_LUT`,xu.minFilter=C,xu.magFilter=C,xu.wrapS=v,xu.wrapT=v,xu.generateMipmaps=!1,xu.needsUpdate=!0),xu}var Cu=class{constructor(e={}){let{canvas:t=_t(),context:n=null,depth:r=!0,stencil:i=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:s=!0,preserveDrawingBuffer:c=!1,powerPreference:l=`default`,failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:d=!1,outputBufferType:f=E}=e;this.isWebGLRenderer=!0;let p;if(n!==null){if(typeof WebGLRenderingContext<`u`&&n instanceof WebGLRenderingContext)throw Error(`THREE.WebGLRenderer: WebGL 1 is not supported since r163.`);p=n.getContextAttributes().alpha}else p=a;let m=f,h=new Set([ve,_e,he]),g=new Set([E,ne,ee,oe,ie,ae]),_=new Uint32Array(4),v=new Int32Array(4),y=null,b=null,x=[],S=[],C=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=0,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let w=this,D=!1;this._outputColorSpace=ot;let O=0,te=0,k=null,se=-1,ce=null,le=new $t,ue=new $t,de=null,fe=new R(0),pe=0,me=t.width,ge=t.height,ye=1,be=null,xe=null,Se=new $t(0,0,me,ge),Ce=new $t(0,0,me,ge),we=!1,Te=new Ci,Ee=!1,De=!1,Oe=new an,ke=new I,Ae=new $t,je={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Me=!1;function Ne(){return k===null?ye:1}let A=n;function Pe(e,n){return t.getContext(e,n)}try{let e={alpha:!0,depth:r,stencil:i,antialias:o,premultipliedAlpha:s,preserveDrawingBuffer:c,powerPreference:l,failIfMajorPerformanceCaveat:u};if(`setAttribute`in t&&t.setAttribute(`data-engine`,`three.js r183`),t.addEventListener(`webglcontextlost`,it,!1),t.addEventListener(`webglcontextrestored`,at,!1),t.addEventListener(`webglcontextcreationerror`,ct,!1),A===null){let t=`webgl2`;if(A=Pe(t,e),A===null)throw Pe(t)?Error(`Error creating WebGL context with your selected attributes.`):Error(`Error creating WebGL context.`)}}catch(e){throw P(`WebGLRenderer: `+e.message),e}let Fe,Ie,j,Le,M,Re,ze,Be,Ve,He,Ue,We,Ge,Ke,qe,Je,Ye,Xe,Ze,Qe,$e,et,tt;function nt(){Fe=new Hs(A),Fe.init(),$e=new du(A,Fe),Ie=new vs(A,Fe,e,$e),j=new lu(A,Fe),Ie.reversedDepthBuffer&&d&&j.buffers.depth.setReversed(!0),Le=new Gs(A),M=new Ul,Re=new uu(A,Fe,j,M,Ie,$e,Le),ze=new Vs(w),Be=new ls(A),et=new gs(A,Be),Ve=new Us(A,Be,Le,et),He=new qs(A,Ve,Be,et,Le),Xe=new Ks(A,Ie,Re),qe=new ys(M),Ue=new Hl(w,ze,Fe,Ie,et,qe),We=new vu(w,M),Ge=new ql,Ke=new eu(Fe),Ye=new hs(w,ze,j,He,p,s),Je=new cu(w,He,Ie),tt=new yu(A,Le,Ie,j),Ze=new _s(A,Fe,Le),Qe=new Ws(A,Fe,Le),Le.programs=Ue.programs,w.capabilities=Ie,w.extensions=Fe,w.properties=M,w.renderLists=Ge,w.shadowMap=Je,w.state=j,w.info=Le}nt(),m!==1009&&(C=new Ys(m,t.width,t.height,r,i));let rt=new hu(w,A);this.xr=rt,this.getContext=function(){return A},this.getContextAttributes=function(){return A.getContextAttributes()},this.forceContextLoss=function(){let e=Fe.get(`WEBGL_lose_context`);e&&e.loseContext()},this.forceContextRestore=function(){let e=Fe.get(`WEBGL_lose_context`);e&&e.restoreContext()},this.getPixelRatio=function(){return ye},this.setPixelRatio=function(e){e!==void 0&&(ye=e,this.setSize(me,ge,!1))},this.getSize=function(e){return e.set(me,ge)},this.setSize=function(e,n,r=!0){rt.isPresenting?N(`WebGLRenderer: Can't change size while VR device is presenting.`):(me=e,ge=n,t.width=Math.floor(e*ye),t.height=Math.floor(n*ye),r===!0&&(t.style.width=e+`px`,t.style.height=n+`px`),C!==null&&C.setSize(t.width,t.height),this.setViewport(0,0,e,n))},this.getDrawingBufferSize=function(e){return e.set(me*ye,ge*ye).floor()},this.setDrawingBufferSize=function(e,n,r){me=e,ge=n,ye=r,t.width=Math.floor(e*r),t.height=Math.floor(n*r),this.setViewport(0,0,e,n)},this.setEffects=function(e){if(m===1009)console.error(`THREE.WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.`);else{if(e){for(let t=0;t<e.length;t++)if(e[t].isOutputPass===!0){console.warn(`THREE.WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.`);break}}C.setEffects(e||[])}},this.getCurrentViewport=function(e){return e.copy(le)},this.getViewport=function(e){return e.copy(Se)},this.setViewport=function(e,t,n,r){e.isVector4?Se.set(e.x,e.y,e.z,e.w):Se.set(e,t,n,r),j.viewport(le.copy(Se).multiplyScalar(ye).round())},this.getScissor=function(e){return e.copy(Ce)},this.setScissor=function(e,t,n,r){e.isVector4?Ce.set(e.x,e.y,e.z,e.w):Ce.set(e,t,n,r),j.scissor(ue.copy(Ce).multiplyScalar(ye).round())},this.getScissorTest=function(){return we},this.setScissorTest=function(e){j.setScissorTest(we=e)},this.setOpaqueSort=function(e){be=e},this.setTransparentSort=function(e){xe=e},this.getClearColor=function(e){return e.copy(Ye.getClearColor())},this.setClearColor=function(){Ye.setClearColor(...arguments)},this.getClearAlpha=function(){return Ye.getClearAlpha()},this.setClearAlpha=function(){Ye.setClearAlpha(...arguments)},this.clear=function(e=!0,t=!0,n=!0){let r=0;if(e){let e=!1;if(k!==null){let t=k.texture.format;e=h.has(t)}if(e){let e=k.texture.type,t=g.has(e),n=Ye.getClearColor(),r=Ye.getClearAlpha(),i=n.r,a=n.g,o=n.b;t?(_[0]=i,_[1]=a,_[2]=o,_[3]=r,A.clearBufferuiv(A.COLOR,0,_)):(v[0]=i,v[1]=a,v[2]=o,v[3]=r,A.clearBufferiv(A.COLOR,0,v))}else r|=A.COLOR_BUFFER_BIT}t&&(r|=A.DEPTH_BUFFER_BIT),n&&(r|=A.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),r!==0&&A.clear(r)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener(`webglcontextlost`,it,!1),t.removeEventListener(`webglcontextrestored`,at,!1),t.removeEventListener(`webglcontextcreationerror`,ct,!1),Ye.dispose(),Ge.dispose(),Ke.dispose(),M.dispose(),ze.dispose(),He.dispose(),et.dispose(),tt.dispose(),Ue.dispose(),rt.dispose(),rt.removeEventListener(`sessionstart`,gt),rt.removeEventListener(`sessionend`,vt),bt.stop()};function it(e){e.preventDefault(),yt(`WebGLRenderer: Context Lost.`),D=!0}function at(){yt(`WebGLRenderer: Context Restored.`),D=!1;let e=Le.autoReset,t=Je.enabled,n=Je.autoUpdate,r=Je.needsUpdate,i=Je.type;nt(),Le.autoReset=e,Je.enabled=t,Je.autoUpdate=n,Je.needsUpdate=r,Je.type=i}function ct(e){P(`WebGLRenderer: A WebGL context could not be created. Reason: `,e.statusMessage)}function lt(e){let t=e.target;t.removeEventListener(`dispose`,lt),ut(t)}function ut(e){dt(e),M.remove(e)}function dt(e){let t=M.get(e).programs;t!==void 0&&(t.forEach(function(e){Ue.releaseProgram(e)}),e.isShaderMaterial&&Ue.releaseShaderCache(e))}this.renderBufferDirect=function(e,t,n,r,i,a){t===null&&(t=je);let o=i.isMesh&&i.matrixWorld.determinant()<0,s=jt(e,t,n,r,i);j.setMaterial(r,o);let c=n.index,l=1;if(r.wireframe===!0){if(c=Ve.getWireframeAttribute(n),c===void 0)return;l=2}let u=n.drawRange,d=n.attributes.position,f=u.start*l,p=(u.start+u.count)*l;a!==null&&(f=Math.max(f,a.start*l),p=Math.min(p,(a.start+a.count)*l)),c===null?d!=null&&(f=Math.max(f,0),p=Math.min(p,d.count)):(f=Math.max(f,0),p=Math.min(p,c.count));let m=p-f;if(m<0||m===1/0)return;et.setup(i,r,s,n,c);let h,g=Ze;if(c!==null&&(h=Be.get(c),g=Qe,g.setIndex(h)),i.isMesh)r.wireframe===!0?(j.setLineWidth(r.wireframeLinewidth*Ne()),g.setMode(A.LINES)):g.setMode(A.TRIANGLES);else if(i.isLine){let e=r.linewidth;e===void 0&&(e=1),j.setLineWidth(e*Ne()),i.isLineSegments?g.setMode(A.LINES):i.isLineLoop?g.setMode(A.LINE_LOOP):g.setMode(A.LINE_STRIP)}else i.isPoints?g.setMode(A.POINTS):i.isSprite&&g.setMode(A.TRIANGLES);if(i.isBatchedMesh){if(i._multiDrawInstances!==null)xt(`WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection.`),g.renderMultiDrawInstances(i._multiDrawStarts,i._multiDrawCounts,i._multiDrawCount,i._multiDrawInstances);else if(Fe.get(`WEBGL_multi_draw`))g.renderMultiDraw(i._multiDrawStarts,i._multiDrawCounts,i._multiDrawCount);else{let e=i._multiDrawStarts,t=i._multiDrawCounts,n=i._multiDrawCount,a=c?Be.get(c).bytesPerElement:1,o=M.get(r).currentProgram.getUniforms();for(let r=0;r<n;r++)o.setValue(A,`_gl_DrawID`,r),g.render(e[r]/a,t[r])}}else if(i.isInstancedMesh)g.renderInstances(f,m,i.count);else if(n.isInstancedBufferGeometry){let e=n._maxInstanceCount===void 0?1/0:n._maxInstanceCount,t=Math.min(n.instanceCount,e);g.renderInstances(f,m,t)}else g.render(f,m)};function ft(e,t,n){e.transparent===!0&&e.side===2&&e.forceSinglePass===!1?(e.side=1,e.needsUpdate=!0,Ot(e,t,n),e.side=0,e.needsUpdate=!0,Ot(e,t,n),e.side=2):Ot(e,t,n)}this.compile=function(e,t,n=null){n===null&&(n=e),b=Ke.get(n),b.init(t),S.push(b),n.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(b.pushLight(e),e.castShadow&&b.pushShadow(e))}),e!==n&&e.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(b.pushLight(e),e.castShadow&&b.pushShadow(e))}),b.setupLights();let r=new Set;return e.traverse(function(e){if(!(e.isMesh||e.isPoints||e.isLine||e.isSprite))return;let t=e.material;if(t){if(Array.isArray(t))for(let i=0;i<t.length;i++){let a=t[i];ft(a,n,e),r.add(a)}else ft(t,n,e),r.add(t)}}),b=S.pop(),r},this.compileAsync=function(e,t,n=null){let r=this.compile(e,t,n);return new Promise(t=>{function n(){r.forEach(function(e){M.get(e).currentProgram.isReady()&&r.delete(e)}),r.size===0?t(e):setTimeout(n,10)}Fe.get(`KHR_parallel_shader_compile`)===null?setTimeout(n,10):n()})};let mt=null;function ht(e){mt&&mt(e)}function gt(){bt.stop()}function vt(){bt.start()}let bt=new cs;bt.setAnimationLoop(ht),typeof self<`u`&&bt.setContext(self),this.setAnimationLoop=function(e){mt=e,rt.setAnimationLoop(e),e===null?bt.stop():bt.start()},rt.addEventListener(`sessionstart`,gt),rt.addEventListener(`sessionend`,vt),this.render=function(e,t){if(t!==void 0&&t.isCamera!==!0){P(`WebGLRenderer.render: camera is not an instance of THREE.Camera.`);return}if(D===!0)return;let n=rt.enabled===!0&&rt.isPresenting===!0,r=C!==null&&(k===null||n)&&C.begin(w,k);if(e.matrixWorldAutoUpdate===!0&&e.updateMatrixWorld(),t.parent===null&&t.matrixWorldAutoUpdate===!0&&t.updateMatrixWorld(),rt.enabled===!0&&rt.isPresenting===!0&&(C===null||C.isCompositing()===!1)&&(rt.cameraAutoUpdate===!0&&rt.updateCamera(t),t=rt.getCamera()),e.isScene===!0&&e.onBeforeRender(w,e,t,k),b=Ke.get(e,S.length),b.init(t),S.push(b),Oe.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),Te.setFromProjectionMatrix(Oe,pt,t.reversedDepth),De=this.localClippingEnabled,Ee=qe.init(this.clippingPlanes,De),y=Ge.get(e,x.length),y.init(),x.push(y),rt.enabled===!0&&rt.isPresenting===!0){let e=w.xr.getDepthSensingMesh();e!==null&&Ct(e,t,-1/0,w.sortObjects)}Ct(e,t,0,w.sortObjects),y.finish(),w.sortObjects===!0&&y.sort(be,xe),Me=rt.enabled===!1||rt.isPresenting===!1||rt.hasDepthSensing()===!1,Me&&Ye.addToRenderList(y,e),this.info.render.frame++,Ee===!0&&qe.beginShadows();let i=b.state.shadowsArray;if(Je.render(i,e,t),Ee===!0&&qe.endShadows(),this.info.autoReset===!0&&this.info.reset(),(r&&C.hasRenderPass())===!1){let n=y.opaque,r=y.transmissive;if(b.setupLights(),t.isArrayCamera){let i=t.cameras;if(r.length>0)for(let t=0,a=i.length;t<a;t++){let a=i[t];Tt(n,r,e,a)}Me&&Ye.render(e);for(let t=0,n=i.length;t<n;t++){let n=i[t];wt(y,e,n,n.viewport)}}else r.length>0&&Tt(n,r,e,t),Me&&Ye.render(e),wt(y,e,t)}k!==null&&te===0&&(Re.updateMultisampleRenderTarget(k),Re.updateRenderTargetMipmap(k)),r&&C.end(w),e.isScene===!0&&e.onAfterRender(w,e,t),et.resetDefaultState(),se=-1,ce=null,S.pop(),S.length>0?(b=S[S.length-1],Ee===!0&&qe.setGlobalState(w.clippingPlanes,b.state.camera)):b=null,x.pop(),y=x.length>0?x[x.length-1]:null};function Ct(e,t,n,r){if(e.visible===!1)return;if(e.layers.test(t.layers)){if(e.isGroup)n=e.renderOrder;else if(e.isLOD)e.autoUpdate===!0&&e.update(t);else if(e.isLight)b.pushLight(e),e.castShadow&&b.pushShadow(e);else if(e.isSprite){if(!e.frustumCulled||Te.intersectsSprite(e)){r&&Ae.setFromMatrixPosition(e.matrixWorld).applyMatrix4(Oe);let t=He.update(e),i=e.material;i.visible&&y.push(e,t,i,n,Ae.z,null)}}else if((e.isMesh||e.isLine||e.isPoints)&&(!e.frustumCulled||Te.intersectsObject(e))){let t=He.update(e),i=e.material;if(r&&(e.boundingSphere===void 0?(t.boundingSphere===null&&t.computeBoundingSphere(),Ae.copy(t.boundingSphere.center)):(e.boundingSphere===null&&e.computeBoundingSphere(),Ae.copy(e.boundingSphere.center)),Ae.applyMatrix4(e.matrixWorld).applyMatrix4(Oe)),Array.isArray(i)){let r=t.groups;for(let a=0,o=r.length;a<o;a++){let o=r[a],s=i[o.materialIndex];s&&s.visible&&y.push(e,t,s,n,Ae.z,o)}}else i.visible&&y.push(e,t,i,n,Ae.z,null)}}let i=e.children;for(let e=0,a=i.length;e<a;e++)Ct(i[e],t,n,r)}function wt(e,t,n,r){let{opaque:i,transmissive:a,transparent:o}=e;b.setupLightsView(n),Ee===!0&&qe.setGlobalState(w.clippingPlanes,n),r&&j.viewport(le.copy(r)),i.length>0&&Et(i,t,n),a.length>0&&Et(a,t,n),o.length>0&&Et(o,t,n),j.buffers.depth.setTest(!0),j.buffers.depth.setMask(!0),j.buffers.color.setMask(!0),j.setPolygonOffset(!1)}function Tt(e,t,n,r){if((n.isScene===!0?n.overrideMaterial:null)!==null)return;if(b.state.transmissionRenderTarget[r.id]===void 0){let e=Fe.has(`EXT_color_buffer_half_float`)||Fe.has(`EXT_color_buffer_float`);b.state.transmissionRenderTarget[r.id]=new tn(1,1,{generateMipmaps:!0,type:e?re:E,minFilter:T,samples:Math.max(4,Ie.samples),stencilBuffer:i,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Ht.workingColorSpace})}let a=b.state.transmissionRenderTarget[r.id],o=r.viewport||le;a.setSize(o.z*w.transmissionResolutionScale,o.w*w.transmissionResolutionScale);let s=w.getRenderTarget(),c=w.getActiveCubeFace(),l=w.getActiveMipmapLevel();w.setRenderTarget(a),w.getClearColor(fe),pe=w.getClearAlpha(),pe<1&&w.setClearColor(16777215,.5),w.clear(),Me&&Ye.render(n);let u=w.toneMapping;w.toneMapping=0;let d=r.viewport;if(r.viewport!==void 0&&(r.viewport=void 0),b.setupLightsView(r),Ee===!0&&qe.setGlobalState(w.clippingPlanes,r),Et(e,n,r),Re.updateMultisampleRenderTarget(a),Re.updateRenderTargetMipmap(a),Fe.has(`WEBGL_multisampled_render_to_texture`)===!1){let e=!1;for(let i=0,a=t.length;i<a;i++){let{object:a,geometry:o,material:s,group:c}=t[i];if(s.side===2&&a.layers.test(r.layers)){let t=s.side;s.side=1,s.needsUpdate=!0,Dt(a,n,r,o,s,c),s.side=t,s.needsUpdate=!0,e=!0}}e===!0&&(Re.updateMultisampleRenderTarget(a),Re.updateRenderTargetMipmap(a))}w.setRenderTarget(s,c,l),w.setClearColor(fe,pe),d!==void 0&&(r.viewport=d),w.toneMapping=u}function Et(e,t,n){let r=t.isScene===!0?t.overrideMaterial:null;for(let i=0,a=e.length;i<a;i++){let a=e[i],{object:o,geometry:s,group:c}=a,l=a.material;l.allowOverride===!0&&r!==null&&(l=r),o.layers.test(n.layers)&&Dt(o,t,n,s,l,c)}}function Dt(e,t,n,r,i,a){e.onBeforeRender(w,t,n,r,i,a),e.modelViewMatrix.multiplyMatrices(n.matrixWorldInverse,e.matrixWorld),e.normalMatrix.getNormalMatrix(e.modelViewMatrix),i.onBeforeRender(w,t,n,r,e,a),i.transparent===!0&&i.side===2&&i.forceSinglePass===!1?(i.side=1,i.needsUpdate=!0,w.renderBufferDirect(n,t,r,i,e,a),i.side=0,i.needsUpdate=!0,w.renderBufferDirect(n,t,r,i,e,a),i.side=2):w.renderBufferDirect(n,t,r,i,e,a),e.onAfterRender(w,t,n,r,i,a)}function Ot(e,t,n){t.isScene!==!0&&(t=je);let r=M.get(e),i=b.state.lights,a=b.state.shadowsArray,o=i.state.version,s=Ue.getParameters(e,i.state,a,t,n),c=Ue.getProgramCacheKey(s),l=r.programs;r.environment=e.isMeshStandardMaterial||e.isMeshLambertMaterial||e.isMeshPhongMaterial?t.environment:null,r.fog=t.fog;let u=e.isMeshStandardMaterial||e.isMeshLambertMaterial&&!e.envMap||e.isMeshPhongMaterial&&!e.envMap;r.envMap=ze.get(e.envMap||r.environment,u),r.envMapRotation=r.environment!==null&&e.envMap===null?t.environmentRotation:e.envMapRotation,l===void 0&&(e.addEventListener(`dispose`,lt),l=new Map,r.programs=l);let d=l.get(c);if(d!==void 0){if(r.currentProgram===d&&r.lightsStateVersion===o)return At(e,s),d}else s.uniforms=Ue.getUniforms(e),e.onBeforeCompile(s,w),d=Ue.acquireProgram(s,c),l.set(c,d),r.uniforms=s.uniforms;let f=r.uniforms;return(!e.isShaderMaterial&&!e.isRawShaderMaterial||e.clipping===!0)&&(f.clippingPlanes=qe.uniform),At(e,s),r.needsLights=Nt(e),r.lightsStateVersion=o,r.needsLights&&(f.ambientLightColor.value=i.state.ambient,f.lightProbe.value=i.state.probe,f.directionalLights.value=i.state.directional,f.directionalLightShadows.value=i.state.directionalShadow,f.spotLights.value=i.state.spot,f.spotLightShadows.value=i.state.spotShadow,f.rectAreaLights.value=i.state.rectArea,f.ltc_1.value=i.state.rectAreaLTC1,f.ltc_2.value=i.state.rectAreaLTC2,f.pointLights.value=i.state.point,f.pointLightShadows.value=i.state.pointShadow,f.hemisphereLights.value=i.state.hemi,f.directionalShadowMatrix.value=i.state.directionalShadowMatrix,f.spotLightMatrix.value=i.state.spotLightMatrix,f.spotLightMap.value=i.state.spotLightMap,f.pointShadowMatrix.value=i.state.pointShadowMatrix),r.currentProgram=d,r.uniformsList=null,d}function kt(e){if(e.uniformsList===null){let t=e.currentProgram.getUniforms();e.uniformsList=nl.seqWithValue(t.seq,e.uniforms)}return e.uniformsList}function At(e,t){let n=M.get(e);n.outputColorSpace=t.outputColorSpace,n.batching=t.batching,n.batchingColor=t.batchingColor,n.instancing=t.instancing,n.instancingColor=t.instancingColor,n.instancingMorph=t.instancingMorph,n.skinning=t.skinning,n.morphTargets=t.morphTargets,n.morphNormals=t.morphNormals,n.morphColors=t.morphColors,n.morphTargetsCount=t.morphTargetsCount,n.numClippingPlanes=t.numClippingPlanes,n.numIntersection=t.numClipIntersection,n.vertexAlphas=t.vertexAlphas,n.vertexTangents=t.vertexTangents,n.toneMapping=t.toneMapping}function jt(e,t,n,r,i){t.isScene!==!0&&(t=je),Re.resetTextureUnits();let a=t.fog,o=r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial?t.environment:null,s=k===null?w.outputColorSpace:k.isXRRenderTarget===!0?k.texture.colorSpace:st,c=r.isMeshStandardMaterial||r.isMeshLambertMaterial&&!r.envMap||r.isMeshPhongMaterial&&!r.envMap,l=ze.get(r.envMap||o,c),u=r.vertexColors===!0&&!!n.attributes.color&&n.attributes.color.itemSize===4,d=!!n.attributes.tangent&&(!!r.normalMap||r.anisotropy>0),f=!!n.morphAttributes.position,p=!!n.morphAttributes.normal,m=!!n.morphAttributes.color,h=0;r.toneMapped&&(k===null||k.isXRRenderTarget===!0)&&(h=w.toneMapping);let g=n.morphAttributes.position||n.morphAttributes.normal||n.morphAttributes.color,_=g===void 0?0:g.length,v=M.get(r),y=b.state.lights;if(Ee===!0&&(De===!0||e!==ce)){let t=e===ce&&r.id===se;qe.setState(r,e,t)}let x=!1;r.version===v.__version?v.needsLights&&v.lightsStateVersion!==y.state.version?x=!0:v.outputColorSpace===s?i.isBatchedMesh&&v.batching===!1||!i.isBatchedMesh&&v.batching===!0||i.isBatchedMesh&&v.batchingColor===!0&&i.colorTexture===null||i.isBatchedMesh&&v.batchingColor===!1&&i.colorTexture!==null||i.isInstancedMesh&&v.instancing===!1||!i.isInstancedMesh&&v.instancing===!0||i.isSkinnedMesh&&v.skinning===!1||!i.isSkinnedMesh&&v.skinning===!0||i.isInstancedMesh&&v.instancingColor===!0&&i.instanceColor===null||i.isInstancedMesh&&v.instancingColor===!1&&i.instanceColor!==null||i.isInstancedMesh&&v.instancingMorph===!0&&i.morphTexture===null||i.isInstancedMesh&&v.instancingMorph===!1&&i.morphTexture!==null?x=!0:v.envMap===l?r.fog===!0&&v.fog!==a||v.numClippingPlanes!==void 0&&(v.numClippingPlanes!==qe.numPlanes||v.numIntersection!==qe.numIntersection)?x=!0:v.vertexAlphas===u&&v.vertexTangents===d&&v.morphTargets===f&&v.morphNormals===p&&v.morphColors===m&&v.toneMapping===h?v.morphTargetsCount!==_&&(x=!0):x=!0:x=!0:x=!0:(x=!0,v.__version=r.version);let S=v.currentProgram;x===!0&&(S=Ot(r,t,i));let C=!1,T=!1,E=!1,D=S.getUniforms(),O=v.uniforms;if(j.useProgram(S.program)&&(C=!0,T=!0,E=!0),r.id!==se&&(se=r.id,T=!0),C||ce!==e){j.buffers.depth.getReversed()&&e.reversedDepth!==!0&&(e._reversedDepth=!0,e.updateProjectionMatrix()),D.setValue(A,`projectionMatrix`,e.projectionMatrix),D.setValue(A,`viewMatrix`,e.matrixWorldInverse);let t=D.map.cameraPosition;t!==void 0&&t.setValue(A,ke.setFromMatrixPosition(e.matrixWorld)),Ie.logarithmicDepthBuffer&&D.setValue(A,`logDepthBufFC`,2/(Math.log(e.far+1)/Math.LN2)),(r.isMeshPhongMaterial||r.isMeshToonMaterial||r.isMeshLambertMaterial||r.isMeshBasicMaterial||r.isMeshStandardMaterial||r.isShaderMaterial)&&D.setValue(A,`isOrthographic`,e.isOrthographicCamera===!0),ce!==e&&(ce=e,T=!0,E=!0)}if(v.needsLights&&(y.state.directionalShadowMap.length>0&&D.setValue(A,`directionalShadowMap`,y.state.directionalShadowMap,Re),y.state.spotShadowMap.length>0&&D.setValue(A,`spotShadowMap`,y.state.spotShadowMap,Re),y.state.pointShadowMap.length>0&&D.setValue(A,`pointShadowMap`,y.state.pointShadowMap,Re)),i.isSkinnedMesh){D.setOptional(A,i,`bindMatrix`),D.setOptional(A,i,`bindMatrixInverse`);let e=i.skeleton;e&&(e.boneTexture===null&&e.computeBoneTexture(),D.setValue(A,`boneTexture`,e.boneTexture,Re))}i.isBatchedMesh&&(D.setOptional(A,i,`batchingTexture`),D.setValue(A,`batchingTexture`,i._matricesTexture,Re),D.setOptional(A,i,`batchingIdTexture`),D.setValue(A,`batchingIdTexture`,i._indirectTexture,Re),D.setOptional(A,i,`batchingColorTexture`),i._colorsTexture!==null&&D.setValue(A,`batchingColorTexture`,i._colorsTexture,Re));let ee=n.morphAttributes;if((ee.position!==void 0||ee.normal!==void 0||ee.color!==void 0)&&Xe.update(i,n,S),(T||v.receiveShadow!==i.receiveShadow)&&(v.receiveShadow=i.receiveShadow,D.setValue(A,`receiveShadow`,i.receiveShadow)),(r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial)&&r.envMap===null&&t.environment!==null&&(O.envMapIntensity.value=t.environmentIntensity),O.dfgLUT!==void 0&&(O.dfgLUT.value=Su()),T&&(D.setValue(A,`toneMappingExposure`,w.toneMappingExposure),v.needsLights&&Mt(O,E),a&&r.fog===!0&&We.refreshFogUniforms(O,a),We.refreshMaterialUniforms(O,r,ye,ge,b.state.transmissionRenderTarget[e.id]),nl.upload(A,kt(v),O,Re)),r.isShaderMaterial&&r.uniformsNeedUpdate===!0&&(nl.upload(A,kt(v),O,Re),r.uniformsNeedUpdate=!1),r.isSpriteMaterial&&D.setValue(A,`center`,i.center),D.setValue(A,`modelViewMatrix`,i.modelViewMatrix),D.setValue(A,`normalMatrix`,i.normalMatrix),D.setValue(A,`modelMatrix`,i.matrixWorld),r.isShaderMaterial||r.isRawShaderMaterial){let e=r.uniformsGroups;for(let t=0,n=e.length;t<n;t++){let n=e[t];tt.update(n,S),tt.bind(n,S)}}return S}function Mt(e,t){e.ambientLightColor.needsUpdate=t,e.lightProbe.needsUpdate=t,e.directionalLights.needsUpdate=t,e.directionalLightShadows.needsUpdate=t,e.pointLights.needsUpdate=t,e.pointLightShadows.needsUpdate=t,e.spotLights.needsUpdate=t,e.spotLightShadows.needsUpdate=t,e.rectAreaLights.needsUpdate=t,e.hemisphereLights.needsUpdate=t}function Nt(e){return e.isMeshLambertMaterial||e.isMeshToonMaterial||e.isMeshPhongMaterial||e.isMeshStandardMaterial||e.isShadowMaterial||e.isShaderMaterial&&e.lights===!0}this.getActiveCubeFace=function(){return O},this.getActiveMipmapLevel=function(){return te},this.getRenderTarget=function(){return k},this.setRenderTargetTextures=function(e,t,n){let r=M.get(e);r.__autoAllocateDepthBuffer=e.resolveDepthBuffer===!1,r.__autoAllocateDepthBuffer===!1&&(r.__useRenderToTexture=!1),M.get(e.texture).__webglTexture=t,M.get(e.depthTexture).__webglTexture=r.__autoAllocateDepthBuffer?void 0:n,r.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(e,t){let n=M.get(e);n.__webglFramebuffer=t,n.__useDefaultFramebuffer=t===void 0};let F=A.createFramebuffer();this.setRenderTarget=function(e,t=0,n=0){k=e,O=t,te=n;let r=null,i=!1,a=!1;if(e){let o=M.get(e);if(o.__useDefaultFramebuffer!==void 0){j.bindFramebuffer(A.FRAMEBUFFER,o.__webglFramebuffer),le.copy(e.viewport),ue.copy(e.scissor),de=e.scissorTest,j.viewport(le),j.scissor(ue),j.setScissorTest(de),se=-1;return}if(o.__webglFramebuffer===void 0)Re.setupRenderTarget(e);else if(o.__hasExternalTextures)Re.rebindTextures(e,M.get(e.texture).__webglTexture,M.get(e.depthTexture).__webglTexture);else if(e.depthBuffer){let t=e.depthTexture;if(o.__boundDepthTexture!==t){if(t!==null&&M.has(t)&&(e.width!==t.image.width||e.height!==t.image.height))throw Error(`WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.`);Re.setupDepthRenderbuffer(e)}}let s=e.texture;(s.isData3DTexture||s.isDataArrayTexture||s.isCompressedArrayTexture)&&(a=!0);let c=M.get(e).__webglFramebuffer;e.isWebGLCubeRenderTarget?(r=Array.isArray(c[t])?c[t][n]:c[t],i=!0):r=e.samples>0&&Re.useMultisampledRTT(e)===!1?M.get(e).__webglMultisampledFramebuffer:Array.isArray(c)?c[n]:c,le.copy(e.viewport),ue.copy(e.scissor),de=e.scissorTest}else le.copy(Se).multiplyScalar(ye).floor(),ue.copy(Ce).multiplyScalar(ye).floor(),de=we;if(n!==0&&(r=F),j.bindFramebuffer(A.FRAMEBUFFER,r)&&j.drawBuffers(e,r),j.viewport(le),j.scissor(ue),j.setScissorTest(de),i){let r=M.get(e.texture);A.framebufferTexture2D(A.FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_CUBE_MAP_POSITIVE_X+t,r.__webglTexture,n)}else if(a){let r=t;for(let t=0;t<e.textures.length;t++){let i=M.get(e.textures[t]);A.framebufferTextureLayer(A.FRAMEBUFFER,A.COLOR_ATTACHMENT0+t,i.__webglTexture,n,r)}}else if(e!==null&&n!==0){let t=M.get(e.texture);A.framebufferTexture2D(A.FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_2D,t.__webglTexture,n)}se=-1},this.readRenderTargetPixels=function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget)){P(`WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);return}let c=M.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){j.bindFramebuffer(A.FRAMEBUFFER,c);try{let o=e.textures[s],c=o.format,l=o.type;if(e.textures.length>1&&A.readBuffer(A.COLOR_ATTACHMENT0+s),!Ie.textureFormatReadable(c)){P(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.`);return}if(!Ie.textureTypeReadable(l)){P(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.`);return}t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i&&A.readPixels(t,n,r,i,$e.convert(c),$e.convert(l),a)}finally{let e=k===null?null:M.get(k).__webglFramebuffer;j.bindFramebuffer(A.FRAMEBUFFER,e)}}},this.readRenderTargetPixelsAsync=async function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget))throw Error(`THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);let c=M.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){if(t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i){j.bindFramebuffer(A.FRAMEBUFFER,c);let o=e.textures[s],l=o.format,u=o.type;if(e.textures.length>1&&A.readBuffer(A.COLOR_ATTACHMENT0+s),!Ie.textureFormatReadable(l))throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.`);if(!Ie.textureTypeReadable(u))throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.`);let d=A.createBuffer();A.bindBuffer(A.PIXEL_PACK_BUFFER,d),A.bufferData(A.PIXEL_PACK_BUFFER,a.byteLength,A.STREAM_READ),A.readPixels(t,n,r,i,$e.convert(l),$e.convert(u),0);let f=k===null?null:M.get(k).__webglFramebuffer;j.bindFramebuffer(A.FRAMEBUFFER,f);let p=A.fenceSync(A.SYNC_GPU_COMMANDS_COMPLETE,0);return A.flush(),await St(A,p,4),A.bindBuffer(A.PIXEL_PACK_BUFFER,d),A.getBufferSubData(A.PIXEL_PACK_BUFFER,0,a),A.deleteBuffer(d),A.deleteSync(p),a}throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.`)}},this.copyFramebufferToTexture=function(e,t=null,n=0){let r=2**-n,i=Math.floor(e.image.width*r),a=Math.floor(e.image.height*r),o=t===null?0:t.x,s=t===null?0:t.y;Re.setTexture2D(e,0),A.copyTexSubImage2D(A.TEXTURE_2D,n,0,0,o,s,i,a),j.unbindTexture()};let Pt=A.createFramebuffer(),Ft=A.createFramebuffer();this.copyTextureToTexture=function(e,t,n=null,r=null,i=0,a=0){let o,s,c,l,u,d,f,p,m,h=e.isCompressedTexture?e.mipmaps[a]:e.image;if(n!==null)o=n.max.x-n.min.x,s=n.max.y-n.min.y,c=n.isBox3?n.max.z-n.min.z:1,l=n.min.x,u=n.min.y,d=n.isBox3?n.min.z:0;else{let t=2**-i;o=Math.floor(h.width*t),s=Math.floor(h.height*t),c=e.isDataArrayTexture?h.depth:e.isData3DTexture?Math.floor(h.depth*t):1,l=0,u=0,d=0}r===null?(f=0,p=0,m=0):(f=r.x,p=r.y,m=r.z);let g=$e.convert(t.format),_=$e.convert(t.type),v;t.isData3DTexture?(Re.setTexture3D(t,0),v=A.TEXTURE_3D):t.isDataArrayTexture||t.isCompressedArrayTexture?(Re.setTexture2DArray(t,0),v=A.TEXTURE_2D_ARRAY):(Re.setTexture2D(t,0),v=A.TEXTURE_2D),A.pixelStorei(A.UNPACK_FLIP_Y_WEBGL,t.flipY),A.pixelStorei(A.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.premultiplyAlpha),A.pixelStorei(A.UNPACK_ALIGNMENT,t.unpackAlignment);let y=A.getParameter(A.UNPACK_ROW_LENGTH),b=A.getParameter(A.UNPACK_IMAGE_HEIGHT),x=A.getParameter(A.UNPACK_SKIP_PIXELS),S=A.getParameter(A.UNPACK_SKIP_ROWS),C=A.getParameter(A.UNPACK_SKIP_IMAGES);A.pixelStorei(A.UNPACK_ROW_LENGTH,h.width),A.pixelStorei(A.UNPACK_IMAGE_HEIGHT,h.height),A.pixelStorei(A.UNPACK_SKIP_PIXELS,l),A.pixelStorei(A.UNPACK_SKIP_ROWS,u),A.pixelStorei(A.UNPACK_SKIP_IMAGES,d);let w=e.isDataArrayTexture||e.isData3DTexture,T=t.isDataArrayTexture||t.isData3DTexture;if(e.isDepthTexture){let n=M.get(e),r=M.get(t),h=M.get(n.__renderTarget),g=M.get(r.__renderTarget);j.bindFramebuffer(A.READ_FRAMEBUFFER,h.__webglFramebuffer),j.bindFramebuffer(A.DRAW_FRAMEBUFFER,g.__webglFramebuffer);for(let n=0;n<c;n++)w&&(A.framebufferTextureLayer(A.READ_FRAMEBUFFER,A.COLOR_ATTACHMENT0,M.get(e).__webglTexture,i,d+n),A.framebufferTextureLayer(A.DRAW_FRAMEBUFFER,A.COLOR_ATTACHMENT0,M.get(t).__webglTexture,a,m+n)),A.blitFramebuffer(l,u,o,s,f,p,o,s,A.DEPTH_BUFFER_BIT,A.NEAREST);j.bindFramebuffer(A.READ_FRAMEBUFFER,null),j.bindFramebuffer(A.DRAW_FRAMEBUFFER,null)}else if(i!==0||e.isRenderTargetTexture||M.has(e)){let n=M.get(e),r=M.get(t);j.bindFramebuffer(A.READ_FRAMEBUFFER,Pt),j.bindFramebuffer(A.DRAW_FRAMEBUFFER,Ft);for(let e=0;e<c;e++)w?A.framebufferTextureLayer(A.READ_FRAMEBUFFER,A.COLOR_ATTACHMENT0,n.__webglTexture,i,d+e):A.framebufferTexture2D(A.READ_FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_2D,n.__webglTexture,i),T?A.framebufferTextureLayer(A.DRAW_FRAMEBUFFER,A.COLOR_ATTACHMENT0,r.__webglTexture,a,m+e):A.framebufferTexture2D(A.DRAW_FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_2D,r.__webglTexture,a),i===0?T?A.copyTexSubImage3D(v,a,f,p,m+e,l,u,o,s):A.copyTexSubImage2D(v,a,f,p,l,u,o,s):A.blitFramebuffer(l,u,o,s,f,p,o,s,A.COLOR_BUFFER_BIT,A.NEAREST);j.bindFramebuffer(A.READ_FRAMEBUFFER,null),j.bindFramebuffer(A.DRAW_FRAMEBUFFER,null)}else T?e.isDataTexture||e.isData3DTexture?A.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h.data):t.isCompressedArrayTexture?A.compressedTexSubImage3D(v,a,f,p,m,o,s,c,g,h.data):A.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h):e.isDataTexture?A.texSubImage2D(A.TEXTURE_2D,a,f,p,o,s,g,_,h.data):e.isCompressedTexture?A.compressedTexSubImage2D(A.TEXTURE_2D,a,f,p,h.width,h.height,g,h.data):A.texSubImage2D(A.TEXTURE_2D,a,f,p,o,s,g,_,h);A.pixelStorei(A.UNPACK_ROW_LENGTH,y),A.pixelStorei(A.UNPACK_IMAGE_HEIGHT,b),A.pixelStorei(A.UNPACK_SKIP_PIXELS,x),A.pixelStorei(A.UNPACK_SKIP_ROWS,S),A.pixelStorei(A.UNPACK_SKIP_IMAGES,C),a===0&&t.generateMipmaps&&A.generateMipmap(v),j.unbindTexture()},this.initRenderTarget=function(e){M.get(e).__webglFramebuffer===void 0&&Re.setupRenderTarget(e)},this.initTexture=function(e){e.isCubeTexture?Re.setTextureCube(e,0):e.isData3DTexture?Re.setTexture3D(e,0):e.isDataArrayTexture||e.isCompressedArrayTexture?Re.setTexture2DArray(e,0):Re.setTexture2D(e,0),j.unbindTexture()},this.resetState=function(){O=0,te=0,k=null,j.reset(),et.reset()},typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}get coordinateSystem(){return pt}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=Ht._getDrawingBufferColorSpace(e),t.unpackColorSpace=Ht._getUnpackColorSpace()}},wu=null,Tu={master:1,sfx:1,music:.6},Eu=.55,Du=[];function Ou(){if(wu){wu.ctx.resume();return}let e=new AudioContext,t=e.createGain();t.gain.value=Eu*Tu.master;let n=e.createDynamicsCompressor();t.connect(n).connect(e.destination);let r=e.createGain();r.gain.value=Tu.sfx,r.connect(t);let i=e.createGain();i.gain.value=Tu.music,i.connect(t);let a=e.createBuffer(1,e.sampleRate*2,e.sampleRate),o=a.getChannelData(0);for(let e=0;e<o.length;e++)o[e]=Math.random()*2-1;wu={ctx:e,out:t,sfx:r,music:i,noiseBuf:a};for(let e of Du)e(wu)}function ku(e){Du.push(e),wu&&e(wu)}var Au=()=>wu;typeof document<`u`&&document.addEventListener(`visibilitychange`,()=>{wu&&(document.hidden?wu.ctx.suspend():wu.ctx.resume())});function ju(e){if(Object.assign(Tu,e),!wu)return;let t=wu.ctx.currentTime;wu.out.gain.setTargetAtTime(Eu*Tu.master,t,.05),wu.sfx.gain.setTargetAtTime(Tu.sfx,t,.05),wu.music.gain.setTargetAtTime(Tu.music,t,.05)}function Mu(e){let t=wu.ctx,n=t.createBufferSource();return n.buffer=wu.noiseBuf,n.loop=!0,n.start(t.currentTime,Math.random(),e+.1),n.stop(t.currentTime+e+.1),n}function Nu(e,t,n,r,i){let a=i??wu.ctx.currentTime;e.gain.setValueAtTime(1e-4,a),e.gain.exponentialRampToValueAtTime(Math.max(2e-4,t),a+n),e.gain.exponentialRampToValueAtTime(1e-4,a+n+r)}function H(e,t,n,r,i={}){if(!wu)return;let a=wu.ctx,o=i.at??a.currentTime,s=a.createOscillator();s.type=e,s.frequency.setValueAtTime(t,o),i.to&&s.frequency.exponentialRampToValueAtTime(i.to,o+n);let c=a.createGain();Nu(c,r,i.attack??.005,n,o),s.connect(c).connect(i.dest??wu.sfx),s.start(o),s.stop(o+(i.attack??.005)+n+.05)}var Pu=null,Fu=null;function Iu(e=1){let t=Au();if(!t)return;let n=t.ctx,r=n.currentTime,i=n.createOscillator();i.frequency.setValueAtTime(70+20*e,r),i.frequency.exponentialRampToValueAtTime(32,r+.35);let a=n.createGain();Nu(a,.5*e,.005,.4),i.connect(a).connect(t.sfx),i.start(r),i.stop(r+.5);let o=Mu(.3),s=n.createBiquadFilter();s.type=`lowpass`,s.frequency.value=220;let c=n.createGain();Nu(c,.35*e,.005,.25),o.connect(s).connect(c).connect(t.sfx)}var Lu=0;function Ru(e=1){let t=Au();if(!t)return;let n=t.ctx,r=n.currentTime;if(r-Lu<.05)return;Lu=r;let i=Mu(.9),a=n.createBiquadFilter();a.type=`bandpass`,a.frequency.setValueAtTime(900+Math.random()*500,r),a.frequency.exponentialRampToValueAtTime(180,r+.8),a.Q.value=.8;let o=n.createGain();Nu(o,Math.min(.7,.3*e),.005,.7+.2*e),i.connect(a).connect(o).connect(t.sfx);for(let i=0;i<3+e*2;i++){let e=n.createOscillator();e.type=`triangle`,e.frequency.value=2500+Math.random()*3e3;let i=n.createGain(),a=r+Math.random()*.4;i.gain.setValueAtTime(1e-4,a),i.gain.exponentialRampToValueAtTime(.05,a+.005),i.gain.exponentialRampToValueAtTime(1e-4,a+.15),e.connect(i).connect(t.sfx),e.start(a),e.stop(a+.2)}}function zu(){let e=Au();if(!e)return;let t=e.ctx.currentTime,n=Mu(.25),r=e.ctx.createBiquadFilter();r.type=`bandpass`,r.frequency.setValueAtTime(300,t),r.frequency.exponentialRampToValueAtTime(2200,t+.2),r.Q.value=2;let i=e.ctx.createGain();Nu(i,.25,.04,.18),n.connect(r).connect(i).connect(e.sfx)}function Bu(e=`short`,t=1){let n=Au();if(!n)return;let r=n.ctx,i=r.currentTime,a=e===`ultra`?1.3:e===`sad`?1.1:.6,o=(e===`ultra`?240:e===`sad`?300:420)*t,s=r.createOscillator();s.type=`sawtooth`,s.frequency.setValueAtTime(o,i),s.frequency.linearRampToValueAtTime(o*1.8,i+a*.3),s.frequency.linearRampToValueAtTime(o*(e===`sad`?.8:1.1),i+a);let c=r.createOscillator();c.frequency.value=7;let l=r.createGain();l.gain.value=o*.03,c.connect(l).connect(s.frequency);let u=r.createBiquadFilter();u.type=`bandpass`,u.Q.value=4,u.frequency.setValueAtTime(700,i),u.frequency.linearRampToValueAtTime(1900,i+a*.35),u.frequency.linearRampToValueAtTime(900,i+a);let d=r.createGain();if(d.gain.setValueAtTime(1e-4,i),d.gain.exponentialRampToValueAtTime(e===`ultra`?.9:.6,i+.06),d.gain.setValueAtTime(e===`ultra`?.9:.6,i+a*.7),d.gain.exponentialRampToValueAtTime(1e-4,i+a),s.connect(u).connect(d).connect(n.sfx),e===`ultra`){let e=r.createWaveShaper(),t=new Float32Array(256);for(let e=0;e<256;e++){let n=e/128-1;t[e]=Math.tanh(n*4)}e.curve=t;let i=r.createGain();i.gain.value=.25,u.connect(e).connect(i).connect(n.sfx)}s.start(i),s.stop(i+a+.05),c.start(i),c.stop(i+a+.05)}function Vu(){let e=Au();if(!e)return;let t=Mu(.6),n=e.ctx.createBiquadFilter();n.type=`highpass`,n.frequency.value=3e3;let r=e.ctx.createGain();Nu(r,.3,.03,.55),t.connect(n).connect(r).connect(e.sfx)}function Hu(){let e=Au();if(e)for(let t=0;t<3;t++){let n=e.ctx.currentTime+t*.11,r=e.ctx.createOscillator();r.type=`square`,r.frequency.setValueAtTime(300+t*80,n),r.frequency.exponentialRampToValueAtTime(150,n+.08);let i=e.ctx.createGain();i.gain.setValueAtTime(1e-4,n),i.gain.exponentialRampToValueAtTime(.15,n+.01),i.gain.exponentialRampToValueAtTime(1e-4,n+.09),r.connect(i).connect(e.sfx),r.start(n),r.stop(n+.1)}}function Uu(){let e=Au();if(!e)return;let t=e.ctx.currentTime,n=e.ctx.createOscillator();n.type=`triangle`;let r=700+Math.random()*500;n.frequency.setValueAtTime(r,t),n.frequency.linearRampToValueAtTime(r*1.3,t+.15),n.frequency.linearRampToValueAtTime(r*.9,t+.5);let i=e.ctx.createGain();Nu(i,.04,.03,.45),n.connect(i).connect(e.sfx),n.start(t),n.stop(t+.55)}function Wu(){Au()&&(Iu(1.6),Ru(2))}ku(e=>{let t=e.ctx,n=t.createBufferSource();n.buffer=e.noiseBuf,n.loop=!0;let r=t.createBiquadFilter();r.type=`lowpass`,r.frequency.value=400;let i=t.createGain();i.gain.value=.5;let a=t.createOscillator();a.frequency.value=13;let o=t.createGain();o.gain.value=.5,a.connect(o).connect(i.gain),Pu=t.createGain(),Pu.gain.value=0,n.connect(r).connect(i).connect(Pu).connect(e.sfx),n.start(),a.start()}),ku(e=>{let t=e.ctx,n=t.createOscillator();n.type=`sawtooth`,n.frequency.value=110;let r=t.createOscillator();r.type=`square`,r.frequency.value=221;let i=t.createOscillator();i.frequency.value=9;let a=t.createGain();a.gain.value=18,i.connect(a).connect(n.frequency),a.connect(r.frequency);let o=t.createBiquadFilter();o.type=`lowpass`,o.frequency.value=1400,Fu=t.createGain(),Fu.gain.value=0,n.connect(o),r.connect(o),o.connect(Fu).connect(e.sfx),n.start(),r.start(),i.start()});function Gu(e){let t=Au();Pu&&t&&Pu.gain.setTargetAtTime(Math.min(.35,e),t.ctx.currentTime,.1)}function Ku(e){let t=Au();Fu&&t&&Fu.gain.setTargetAtTime(e?.22:0,t.ctx.currentTime,.05)}var qu=[`meowhattan`,`docks`,`suburbia`,`nekotown`,`base`],Ju=[`tabby`,`chonk`,`shadow`,`siamese`],Yu=[`power`,`speed`,`fur`,`ultra`],U=new class{h={};on(e,t){let n=this.h[e]??=[];return n.push(t),()=>{let e=n.indexOf(t);e>=0&&n.splice(e,1)}}emit(e,t){let n=this.h[e];if(n)for(let r=0;r<n.length;r++)try{n[r](t)}catch(t){console.error(`event ${e} handler failed`,t)}}},Xu=Object.freeze({}),Zu={segs:4200,trees:600,cars:90,people:420,fish:4},W={mode:`title`,level:null,cat:null,ability:null,rig:null,intro:0,overAt:0,camYaw:0},G={time:90,damage:0,combo:0,maxCombo:0,comboT:0,patience:100,ultra:0,ultraT:0,buildings:0,helis:0,taxis:0,fish:0,hitStop:0,trauma:0,elapsed:0,zapComboT:0,zap:0,frenzy:!1,blockedT:0,bonkT:0,wanted:0,timeFrozen:!1,bossDefeated:!1,kills:{}},K={pos:new I,y:0,vy:0,heading:0,speed:0,vel:new I,air:!1,swipeCd:0,pounceCd:0,wet:0,stun:0,tugX:0,tugZ:0,slow:1,fwd:new I(0,0,1),right:new I(-1,0,0)},Qu={bi:-1,t:0,next:5,orig:[]},q={walk:34,zoom:62,turn:7,radius:13,headY:46,scale:1,swatCd:.32,swatReach:26,swatRadius:17,swatPower:1,pounceCd:2,pounceR:32,pounceJump:95,pounceFwd:85,patienceMax:100,wetResist:1,stunResist:1,ultraCharge:1,ultraTime:7},$u={master:1,music:.6,sfx:1,shake:1,quality:`high`},ed=new Set,td=matchMedia(`(pointer: coarse)`).matches,nd=new Cu({antialias:!td,powerPreference:`high-performance`});nd.setPixelRatio(Math.min(devicePixelRatio,td?1.5:2)),nd.setSize(innerWidth,innerHeight),nd.shadowMap.enabled=!0,nd.shadowMap.type=1,nd.toneMapping=4,nd.toneMappingExposure=1.05,document.body.prepend(nd.domElement);var J=new Vn,rd=13225169;J.background=new R(rd),J.fog=new Bn(rd,180,760);var id=new Bo(55,innerWidth/innerHeight,1,2e3),ad=new Oo(15265525,7037528,1.4);J.add(ad);var od=new Uo(16773597,2.2);od.castShadow=!0,od.shadow.mapSize.setScalar(td?1024:2048),Object.assign(od.shadow.camera,{left:-220,right:220,top:220,bottom:-220,near:10,far:600}),od.shadow.bias=-8e-4,J.add(od,od.target),addEventListener(`resize`,()=>{nd.setSize(innerWidth,innerHeight),id.aspect=innerWidth/innerHeight,id.updateProjectionMatrix()});var sd=`high`;function cd(e){e!==sd&&(sd=e,nd.setPixelRatio(e===`low`?1:Math.min(devicePixelRatio,td?1.5:2)),nd.setSize(innerWidth,innerHeight),nd.shadowMap.enabled=e===`high`,od.castShadow=e===`high`,J.traverse(e=>{let t=e.material;if(t)for(let e of Array.isArray(t)?t:[t])e.needsUpdate=!0}))}var ld=function(e){return e[e.Static=0]=`Static`,e[e.Flying=1]=`Flying`,e[e.Resting=2]=`Resting`,e[e.Gone=3]=`Gone`,e[e.Kinematic=4]=`Kinematic`,e}({}),ud=-70,dd=new an,fd=new Pt,pd=new hn,md=new I,hd=new I,gd=new Pt,_d=class{cap;mesh;n=0;pos;vel;ang;rot;size;state;timer;dirty=!0;onLand=null;constructor(e,t,n){this.cap=n,this.mesh=new hi(e,t,n),this.mesh.instanceMatrix.setUsage(ft),this.mesh.castShadow=!0,this.mesh.receiveShadow=!0,this.mesh.frustumCulled=!1,this.pos=new Float32Array(n*3),this.vel=new Float32Array(n*3),this.ang=new Float32Array(n*3),this.rot=new Float32Array(n*4),this.size=new Float32Array(n*3),this.state=new Uint8Array(n),this.timer=new Float32Array(n),this.mesh.count=0}add(e,t,n,r,i,a,o,s=0){let c=this.n++,l=c*3;return this.pos[l]=e,this.pos[l+1]=t,this.pos[l+2]=n,this.size[l]=r,this.size[l+1]=i,this.size[l+2]=a,fd.setFromEuler(pd.set(0,s,0)),fd.toArray(this.rot,c*4),this.state[c]=0,this.mesh.setColorAt(c,o),this.mesh.count=this.n,this.write(c),c}write(e){let t=this.state[e];if(fd.fromArray(this.rot,e*4),md.fromArray(this.pos,e*3),hd.fromArray(this.size,e*3),t===3)hd.setScalar(0);else if(t===2&&this.timer[e]>3){let t=Math.max(0,1-(this.timer[e]-3)/1.5);hd.multiplyScalar(t)}dd.compose(md,fd,hd),this.mesh.setMatrixAt(e,dd),this.dirty=!0}launch(e,t,n,r,i=3){if(this.state[e]===3)return;this.state[e]=1,this.timer[e]=0;let a=e*3;this.vel[a]=t,this.vel[a+1]=n,this.vel[a+2]=r,this.ang[a]=(Math.random()-.5)*i,this.ang[a+1]=(Math.random()-.5)*i,this.ang[a+2]=(Math.random()-.5)*i}step(e){for(let t=0;t<this.n;t++){let n=this.state[t];if(n===1){let n=t*3;this.vel[n+1]+=ud*e,this.pos[n]+=this.vel[n]*e,this.pos[n+1]+=this.vel[n+1]*e,this.pos[n+2]+=this.vel[n+2]*e,pd.set(this.ang[n]*e,this.ang[n+1]*e,this.ang[n+2]*e),fd.fromArray(this.rot,t*4).multiply(gd.setFromEuler(pd)).normalize(),fd.toArray(this.rot,t*4);let r=Math.min(this.size[n],this.size[n+1],this.size[n+2])*.5;if(this.pos[n+1]<r){this.pos[n+1]=r;let e=-this.vel[n+1];e>12&&this.onLand&&this.onLand(t,e),this.vel[n+1]=e*.25,this.vel[n]*=.55,this.vel[n+2]*=.55,this.ang[n]*=.5,this.ang[n+1]*=.5,this.ang[n+2]*=.5,e<8&&(this.state[t]=2,this.timer[t]=0)}this.timer[t]+=e,this.timer[t]>8&&(this.state[t]=2,this.timer[t]=0),this.write(t)}else n===2&&(this.timer[t]+=e,this.timer[t]>4.5&&(this.state[t]=3),this.timer[t]>3&&this.write(t),this.state[t]===3&&this.write(t))}this.dirty&&=(this.mesh.instanceMatrix.needsUpdate=!0,!1)}},vd=class{cap;mesh;pos;vel;life;max;size;grow;grav;n=0;next=0;colDirty=!1;col=new R;constructor(e,t,n){this.cap=n,this.mesh=new hi(e,t,n),this.mesh.instanceMatrix.setUsage(ft),this.mesh.frustumCulled=!1,this.pos=new Float32Array(n*3),this.vel=new Float32Array(n*3),this.life=new Float32Array(n),this.max=new Float32Array(n).fill(1),this.size=new Float32Array(n),this.grow=new Float32Array(n),this.grav=new Float32Array(n),dd.makeScale(0,0,0);for(let e=0;e<n;e++)this.mesh.setMatrixAt(e,dd),this.mesh.setColorAt(e,this.col.set(16777215));this.mesh.instanceColor.setUsage(ft),this.mesh.count=0}alive(){return this.n}spawn(e,t,n,r,i,a,o,s,c,l=-30,u=0){let d;this.n<this.cap?d=this.n++:(d=this.next,this.next=(this.next+1)%this.cap);let f=d*3;this.pos[f]=e,this.pos[f+1]=t,this.pos[f+2]=n,this.vel[f]=r,this.vel[f+1]=i,this.vel[f+2]=a,this.life[d]=o,this.max[d]=o,this.size[d]=s,this.grow[d]=u,this.grav[d]=l,this.mesh.setColorAt(d,this.col.set(c)),this.colDirty=!0}clear(){this.life.fill(0),this.n=0,this.next=0,this.mesh.count=0}writeM(e){let t=e*3,n=Math.max(0,this.life[e]/this.max[e]),r=this.life[e]<=0?0:this.size[e]*(1+this.grow[e]*(1-n))*Math.min(1,n*3);dd.makeScale(r,r,r),dd.setPosition(this.pos[t],this.pos[t+1],this.pos[t+2]),this.mesh.setMatrixAt(e,dd)}kill(e){let t=--this.n;if(this.next>this.n&&(this.next=0),e===t)return;let n=e*3,r=t*3;this.pos[n]=this.pos[r],this.pos[n+1]=this.pos[r+1],this.pos[n+2]=this.pos[r+2],this.vel[n]=this.vel[r],this.vel[n+1]=this.vel[r+1],this.vel[n+2]=this.vel[r+2],this.life[e]=this.life[t],this.max[e]=this.max[t],this.size[e]=this.size[t],this.grow[e]=this.grow[t],this.grav[e]=this.grav[t],this.mesh.getColorAt(t,this.col),this.mesh.setColorAt(e,this.col),this.colDirty=!0,this.writeM(e)}step(e){for(let t=this.n-1;t>=0;t--){if(this.life[t]-=e,this.life[t]<=0){this.kill(t);continue}let n=t*3;this.vel[n+1]+=this.grav[t]*e,this.vel[n]*=1-e*.8,this.vel[n+2]*=1-e*.8,this.pos[n]+=this.vel[n]*e,this.pos[n+1]+=this.vel[n+1]*e,this.pos[n+2]+=this.vel[n+2]*e,this.pos[n+1]<.3&&(this.pos[n+1]=.3,this.vel[n+1]*=-.3),this.writeM(t)}let t=this.n;if(this.mesh.count=t,t===0)return;let n=this.mesh.instanceMatrix;if(n.clearUpdateRanges(),n.addUpdateRange(0,t*16),n.needsUpdate=!0,this.colDirty&&this.mesh.instanceColor){let e=this.mesh.instanceColor;e.clearUpdateRanges(),e.addUpdateRange(0,t*3),e.needsUpdate=!0,this.colDirty=!1}}},yd=new Xa(1,1),bd=new vd(new Xa(1,1),new Kr({color:16777215,transparent:!0,opacity:.45,depthWrite:!1}),1400),xd=new vd(new ki(1,1,1),new B({color:16777215,roughness:1}),700),Sd=new vd(yd,new Kr({color:16777215,transparent:!0,opacity:.75}),700),Cd=new vd(yd,new Kr({color:16777215}),500);J.add(bd.mesh,xd.mesh,Sd.mesh,Cd.mesh);var wd=e=>new Kr({color:e,transparent:!0,depthWrite:!1,depthTest:!1,blending:2,side:2}),Td=new L,Ed=new z(new Qa(18,26,24,1,Math.PI*1.5-1.1,2.2),wd(16777215));Ed.rotation.x=-Math.PI/2,Td.add(Ed),Td.visible=!1,Ed.renderOrder=10,J.add(Td);var Dd=new z(new Qa(.85,1,48),wd(16773597));Dd.rotation.x=-Math.PI/2,Dd.visible=!1,J.add(Dd);var Od={swat:0,shock:0,fov:0};function kd(e){G.trauma=Math.min(1,G.trauma+e*$u.shake)}function Ad(e,t,n,r,i=14273716){for(let a=0;a<r;a++){for(let r=0;r<2;r++)bd.spawn(e+(Math.random()-.5)*10,t*.5+Math.random()*3,n+(Math.random()-.5)*10,(Math.random()-.5)*26,Math.random()*8,(Math.random()-.5)*26,.9,1.1+Math.random()*.8,i,1,1.6);xd.spawn(e,t,n,(Math.random()-.5)*50,10+Math.random()*40,(Math.random()-.5)*50,1.4,.6+Math.random()*1.2,Math.random()<.5?10130570:6121072,-70)}}function jd(){bd.clear(),xd.clear(),Sd.clear(),Cd.clear()}function Md(e){bd.step(e),xd.step(e),Sd.step(e),Cd.step(e)}function Nd(e,t){Od.swat=Math.max(0,Od.swat-e/.15),Td.visible=Od.swat>0,Td.visible&&(Td.position.set(K.pos.x,30+K.y,K.pos.z),Td.rotation.y=K.heading+t*.25,Td.scale.setScalar(.6+(1-Od.swat)*.7),Ed.material.opacity=Od.swat),Od.shock=Math.max(0,Od.shock-e/.4),Dd.visible=Od.shock>0,Dd.visible&&(Dd.scale.setScalar(5+(1-Od.shock)*55),Dd.material.opacity=.8*Od.shock)}function Pd(){let e=new la;e.moveTo(-.5,-.5),e.lineTo(.5,-.5),e.lineTo(0,.5),e.closePath();let t=new qa(e,{depth:1,bevelEnabled:!1});return t.translate(0,0,-.5),t.computeVertexNormals(),t}function Fd(){let e=new ji(.5,.5,1,14,1,!1,-Math.PI/2,Math.PI);return e.rotateX(-Math.PI/2),e.scale(1,2,1),e.translate(0,-.5,0),e}function Id(){return new ji(.5,.5,1,20)}var Ld=[`box`,`disc`],Rd=class{items=[];reset(){this.items.length=0}box(e,t,n,r,i,a,o,s=0){this.items.push({shape:`box`,glow:!1,x:e,y:t,z:n,sx:r,sy:i,sz:a,c:o,yaw:s})}glowBox(e,t,n,r,i,a,o,s=0){this.items.push({shape:`box`,glow:!0,x:e,y:t,z:n,sx:r,sy:i,sz:a,c:o,yaw:s})}disc(e,t,n,r,i,a){this.items.push({shape:`disc`,glow:!1,x:e,y:t,z:n,sx:r,sy:i,sz:r,c:a,yaw:0})}flush(e){let t=new an,n=new Pt,r=new I,i=new I,a=new hn,o=new R;for(let s of Ld)for(let c of[!1,!0]){let l=this.items.filter(e=>e.shape===s&&e.glow===c);if(!l.length)continue;let u=new hi(s===`box`?new ki(1,1,1):Id(),c?new Kr({color:16777215,toneMapped:!1}):new B({color:16777215,roughness:.95}),l.length);l.forEach((e,s)=>{t.compose(r.set(e.x,e.y,e.z),n.setFromEuler(a.set(0,e.yaw,0)),i.set(e.sx,e.sy,e.sz)),u.setMatrixAt(s,t),u.setColorAt(s,o.setHex(e.c))}),u.receiveShadow=!c,u.castShadow=!1,u.instanceMatrix.needsUpdate=!0,u.instanceColor&&(u.instanceColor.needsUpdate=!0),e.add(u)}this.items.length=0}},zd={value:0};function Bd(e,t){let n=new B({color:e,roughness:.25,metalness:.15,transparent:!1}),r={value:new R(t)};return n.onBeforeCompile=e=>{e.uniforms.uTime=zd,e.uniforms.uFoam=r,e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vWP;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
        #ifdef USE_INSTANCING
          vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vWP; uniform float uTime; uniform vec3 uFoam;`).replace(`#include <color_fragment>`,`#include <color_fragment>
        float wv = sin(vWP.x * 0.045 + uTime * 0.9) + sin(vWP.z * 0.06 - uTime * 1.3) + sin((vWP.x + vWP.z) * 0.11 + uTime * 2.1) * 0.5;
        float ripple = sin(vWP.x * 0.31 + vWP.z * 0.17 + uTime * 2.6 + wv * 2.0);
        float glint = smoothstep(0.93, 1.0, ripple) * smoothstep(0.4, 1.6, wv);
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.92 + 0.05 * wv), uFoam, glint * 0.4);`)},n}var Vd={box:0,glow:1,gable:2,arch:3,disc:4},Hd=3200,Ud=class{sets;groups=[];partSet=new Uint8Array(Hd);partIdx=new Int32Array(Hd);partLx=new Float32Array(Hd);partLz=new Float32Array(Hd);partQ=new Float32Array(Hd*4);parts=0;spinners=[];cur=null;q=new Pt;e=new hn;col=new R;constructor(e){let t=(e=.7)=>new B({color:16777215,roughness:e,metalness:.1});this.sets=[new _d(new ki(1,1,1),t(),1700),new _d(new ki(1,1,1),new Kr({color:16777215,toneMapped:!1}),1400),new _d(Pd(),t(.85),700),new _d(Fd(),t(.5),160),new _d(Id(),t(.4),160)],this.sets[1].mesh.castShadow=!1;for(let t of this.sets)e.add(t.mesh)}set(e){return this.sets[Vd[e]]}reset(){for(let e of this.sets)e.n=0,e.mesh.count=0;this.groups.length=0,this.spinners.length=0,this.parts=0,this.cur=null}room(e,t){let n=this.set(e);return n.n+t<=n.cap&&this.parts+t<=Hd}begin(e,t,n,r,i,a={}){let o={x:e,z:t,r:n,top:0,value:r,label:i,anchor:a.anchor??-1,trample:!!a.trample,spin:a.spin??0,kind:a.kind??``,broken:!1,p0:this.parts,pn:0};return this.cur=o,o}part(e,t,n,r,i,a,o,s,c=0,l=0,u=0){let d=this.cur,f=this.set(e);if(!d||f.n>=f.cap||this.parts>=Hd)return!1;let p=f.add(t,n,r,i,a,o,this.col.setHex(s),c);(l||u)&&(this.q.setFromEuler(this.e.set(l,c,u,`YXZ`)),f.rot[p*4]=this.q.x,f.rot[p*4+1]=this.q.y,f.rot[p*4+2]=this.q.z,f.rot[p*4+3]=this.q.w,f.write(p));let m=this.parts++;return this.partSet[m]=Vd[e],this.partIdx[m]=p,this.partLx[m]=t-d.x,this.partLz[m]=r-d.z,this.partQ[m*4]=f.rot[p*4],this.partQ[m*4+1]=f.rot[p*4+1],this.partQ[m*4+2]=f.rot[p*4+2],this.partQ[m*4+3]=f.rot[p*4+3],d.pn++,d.top=Math.max(d.top,n+a/2),!0}end(){let e=this.cur;this.cur=null,e&&e.pn!==0&&(this.groups.push(e),e.spin&&this.spinners.push(e))}finish(){for(let e of this.sets)e.mesh.count=e.n,e.mesh.instanceMatrix.needsUpdate=!0,e.mesh.instanceColor&&(e.mesh.instanceColor.needsUpdate=!0)}},Wd=class{c;w;rnd;N;B;S;H;lot;x;plans=[];col=new R;constructor(e,t,n){this.c=e,this.w=t,this.rnd=n,this.N=t.n,this.B=t.block,this.S=t.street,this.H=e.half,this.lot=t.block-t.street,this.x=m(t.theme)}lc(e){return this.c.streetAt(e)+this.B/2}pick(e){return e[Math.floor(this.rnd()*e.length)%e.length]}range(e,t){return e+this.rnd()*(t-e)}int(e,t){return Math.floor(e+this.rnd()*(t-e+1))}value(e=1){return(this.w.valueBase+this.rnd()*this.w.valueRand)*e}centre(e,t){return Math.max(0,1-Math.hypot(e,t)/(this.H*1.2))}floors(e,t,n=1){let r=this.w,i=r.heightBase+this.rnd()*r.heightRand+this.centre(e,t)*(r.centreBoost+this.rnd()*r.centreRand);return Math.max(1,Math.round(i*n/7))}plan(e){let t={value:this.value(),lj:(this.rnd()-.5)*.08,setback:999,min:1,...e};return this.plans.push(t),t}tree(e,t,n,r,i=.55,a=1){r===null?this.col.setHSL(.27+this.rnd()*.06,.45,.32+this.rnd()*.1):this.col.setHex(r).offsetHSL((this.rnd()-.5)*.03,0,(this.rnd()-.5)*.08),this.c.addTree(e,t,n,this.col,a,i)}};function Gd(e,t,n=1){let r=new z(new Za(4e3,4e3),new B({color:t,roughness:n}));r.rotation.x=-Math.PI/2,r.receiveShadow=!0,e.c.dyn.add(r)}function Kd(e,t,n,r){let i=e.c.decor;for(let a=0;a<=e.N;a++){let o=e.c.streetAt(a);for(let a=-e.H;a<e.H;a+=16){let e=a+4;r?.(o,e)||(n?i.glowBox:i.box).call(i,o,.05,e,.8,.1,7,t),r?.(e,o)||(n?i.glowBox:i.box).call(i,e,.05,o,7,.1,.8,t)}}}function qd(e){let t=Zu.segs-e.c.segs.n,n=0;for(let t of e.plans)n+=t.count;let r=n>t?t/n*.995:1;for(let t of e.plans){let n=t.count;r<1&&(n=Math.max(Math.min(t.min,t.count),Math.floor(t.count*r)));let i=t.setback<999?Math.max(1,Math.round(t.setback*(n/t.count))):999,a=t.colors,o=t.lj,s=e.c.addBuilding(t.x,t.z,t.hx,t.hz,n,t.value,t.style,(e,t)=>t.setHex(a[e%a.length]).offsetHSL(0,0,o),i);s>=0&&t.after&&t.after(s)}e.plans.length=0}function Jd(e,t,n,r,i){let a=Math.cos(i),o=Math.sin(i);return[e+n*a+r*o,t-n*o+r*a]}function Yd(e,t,n,r,i){let a=e.c.buildings[t],o=a.count*7,s=Math.min(9,Math.min(a.hx,a.hz)*.85),c=e.c.props;if(!c.room(`gable`,1))return;c.begin(a.x,a.z,Math.max(a.hx,a.hz),0,``,{anchor:a.first+a.count-1});let l=r?a.hz*2+1.6:a.hx*2+1.6,u=r?a.hx*2+1.6:a.hz*2+1.6;c.part(`gable`,a.x,o+s/2,a.z,l,s,u,n,r?Math.PI/2:0),i&&c.part(`box`,a.x+(r?a.hx*.45:a.hx*.35),o+s*.55,a.z+(r?a.hz*.3:a.hz*.45),2.4,s*1.1,2.4,9062970),c.end()}function Xd(e,t,n,r){let i=e.c.buildings[t],a=e.c.props,o=i.count*7,s=Math.min(16,i.hx*.55);a.room(`arch`,1)&&(a.begin(i.x,i.z,Math.max(i.hx,i.hz),0,``,{anchor:i.first+i.count-1}),a.part(`arch`,i.x,o+s/2,i.z,i.hx*2+1,s,i.hz*2+1,n),a.end()),i.count>=2&&a.room(`box`,2)&&(a.begin(i.x,i.z+r*i.hz,4,0,``,{anchor:i.first+1}),a.part(`box`,i.x,6.5,i.z+r*(i.hz+.35),i.hx*1.4,12.5,.7,3421486),a.part(`box`,i.x,13.4,i.z+r*(i.hz+.5),i.hx*1.5,1.2,1,14205562),a.end())}function Zd(e,t,n){let r=e.c.buildings[t],i=e.c.props,a=Math.min(n,r.count)-1;if(a<2||!i.room(`glow`,4))return;let o=Math.min(a,e.int(2,4)),s=Math.max(1,a-o-e.int(0,Math.max(0,a-o-1))),c=Math.min(a,s+o-1),l=s*7+1,u=(c+1)*7-1-l,d=e.int(0,3),f=d<2,p=d%2==0?1:-1,m=Math.min(12,(f?r.hz:r.hx)*1.5),h=(e.rnd()-.5)*Math.max(0,(f?r.hz:r.hx)*2-m),g=f?r.x+p*(r.hx+1.2):r.x+h,_=f?r.z+h:r.z+p*(r.hz+1.2),v=e.pick(e.x.signs),y=e.pick(e.x.signs);i.begin(g,_,m,.3,`NEON `,{anchor:r.first+c,kind:`spark`}),i.part(`box`,g,l+u/2,_,f?1.2:m+1.2,u+1.2,f?m+1.2:1.2,1052696);let b=Math.max(2,Math.min(4,Math.floor(u/5))),x=u/b;for(let t=0;t<b;t++){let n=m*(.55+e.rnd()*.35),r=l+x*(t+.5),a=p*.5;i.part(`glow`,f?g+a:g,r,f?_:_+a,f?.6:n,x*.7,f?n:.6,t%2?y:v)}i.end()}function Qd(e,t){let n=e.c.buildings[t],r=e.c.props;if(!r.room(`glow`,2)||!r.room(`box`,2))return;let i=n.count*7,a=e.rnd()<.5,o=(a?n.hx:n.hz)*1.7;r.begin(n.x,n.z,Math.max(n.hx,n.hz),.6,`BILLBOARD `,{anchor:n.first+n.count-1,kind:`spark`}),r.part(`box`,n.x,i+2,n.z,a?o*.6:1.2,4,a?1.2:o*.6,1381660),r.part(`glow`,n.x,i+8,n.z,a?o:1,8,a?1:o,e.pick(e.x.signs)),r.end()}function $d(e,t,n){let r=e.c.buildings[t],i=e.c.props;if(!i.room(`glow`,1))return;let a=r.count*7,o=e.range(10,22);i.begin(r.x,r.z,2,0,``,{anchor:r.first+r.count-1}),i.part(`box`,r.x+r.hx*.3*n,a+o/2,r.z,.9,o,.9,9079446),i.part(`glow`,r.x+r.hx*.3*n,a+o+.8,r.z,1.8,1.8,1.8,16724032),i.end()}function ef(e,t){let n=e.c.buildings[t],r=e.c.props;if(!r.room(`disc`,2))return;let i=n.count*7;r.begin(n.x,n.z,10,2.5,`RADAR `,{anchor:n.first+n.count-1,spin:1.1+e.rnd()*.6}),r.part(`disc`,n.x,i+1,n.z,9,2,9,6975078),r.part(`box`,n.x,i+5,n.z,1.6,8,1.6,5593167),r.part(`disc`,n.x,i+11,n.z,26,1.6,26,15263452,0,1.05),r.part(`box`,n.x,i+11,n.z,1,1,12,3815990,0,1.05),r.end()}function tf(e,t,n,r,i){let a=e.c.props;if(a.room(`box`,14)){a.begin(t,n+9,22,4,`CRANE `,{kind:`spark`});for(let e of[-12,12])for(let r of[0,18])a.part(`box`,t+e,24,n+r,2.4,48,2.4,i);a.part(`box`,t,48,n,27,2.8,2.8,i),a.part(`box`,t,48,n+18,27,2.8,2.8,i);for(let e of[-12,12])a.part(`box`,t+e,20.16,n+9,1.6,1.6,18,i);a.part(`box`,t,51.2,n+r*.35,4.4,3.4,r+34,i),a.part(`box`,t,46.5,n+25,6,5,6,15921126),a.part(`box`,t,51.5,n-15,8,7,8,4144964),a.part(`box`,t,36,n+r*.85,.5,26,.5,2236966),a.part(`box`,t,22,n+r*.85,2.6,2.6,2.6,15909424),a.end()}}function nf(e,t,n,r){let i=e.c.props;if(!i.room(`box`,12))return;let a=9081496,o=(e,a,o,s,c,l,u,d=0)=>{let[f,p]=Jd(t,n,e,o,r);i.part(`box`,f,a,p,s,c,l,u,r+d)};i.begin(t,n,12,3,`JET `,{kind:`fire`}),o(0,3.6,0,3.4,3.4,22,a),o(0,3.6,12.6,2.2,2.2,4,6975606),o(0,5.6,5,2,1.6,5.5,2375774),o(-5.6,3.1,-2,9.5,.7,8,a,.32),o(5.6,3.1,-2,9.5,.7,8,a,-.32),o(0,7.4,-8.5,.6,6.2,4.2,7568258),o(0,3.8,-10,9,.5,3,a),o(0,3.6,-11.6,2.4,2.4,1.2,2763306),o(0,1,6,.7,2.6,.7,3355443),o(-3,1,-2,.7,2.6,.7,3355443),o(3,1,-2,.7,2.6,.7,3355443),i.end()}function rf(e,t,n){let r=e.c.props;if(!r.room(`box`,14))return;let i=10133642;r.begin(t,n,26,8,`CARGO JET `,{kind:`fire`}),r.part(`box`,t,8,n,48,8,8,i),r.part(`box`,t+26,7.5,n,5,6,6,8028268),r.part(`box`,t+22,10.5,n,4,2,6.4,2375774),r.part(`box`,t+2,11.5,n,10,1.3,58,i),r.part(`box`,t-22,16,n,7,13,1.1,8028268),r.part(`box`,t-23,10,n,5,1,22,i);for(let e of[-1,1])for(let i of[10,20])r.part(`box`,t+3,9.3,n+e*i,7,3,3,5922386);r.part(`box`,t+14,2,n,1,4,1,3355443),r.part(`box`,t-4,2,n-4,1,4,1,3355443),r.part(`box`,t-4,2,n+4,1,4,1,3355443),r.end()}function af(e,t,n,r){let i=e.c.props;if(i.room(`box`,6)&&i.room(`disc`,2)){i.begin(t,n,10,2.5,`WATER TOWER `,{kind:`splash`});for(let e of[-5,5])for(let r of[-5,5])i.part(`box`,t+e,13,n+r,1.2,26,1.2,9079434);i.part(`disc`,t,31,n,17,11,17,r),i.part(`disc`,t,37.5,n,12,2,12,15921906),i.end()}}function of(e,t,n,r,i){let a=e.c.props;a.room(`disc`,2)&&(a.begin(t,n,r/2+1,1.5,`FUEL `,{kind:`fire`}),a.part(`disc`,t,i/2,n,r,i,r,14210244),a.part(`disc`,t,i*.55,n,r+.4,1.4,r+.4,13120042),a.end())}function sf(e,t,n,r,i){let a=e.c.props;a.room(`box`,1)&&(a.begin(t,n,r/2,.03,`HEDGE `,{trample:!0}),a.part(`box`,t,1.8,n,i?r:2.8,3.4,i?2.8:r,4160050),a.end())}function cf(e,t,n){let r=e.c.props;if(!r.room(`box`,9))return;let i=e.x.accent;r.begin(t,n,10,.5,`PLAYGROUND `,{trample:!0}),r.part(`box`,t-4,3,n,3,6,3,i[0]),r.part(`box`,t+1,3,n,2.6,.5,11,i[1],Math.PI/2,.5),r.part(`box`,t-4,6.4,n,3.6,.6,3.6,i[2]);for(let e of[-1,1])r.part(`box`,t+e*5,3.5,n+7,.6,7,.6,i[3]??i[0]);r.part(`box`,t,7,n+7,10.6,.6,.6,i[3]??i[0]),r.part(`box`,t-2,3,n+7,1.6,.4,1,3355443),r.part(`box`,t+2,3,n+7,1.6,.4,1,3355443),r.end()}function lf(e,t){let n=Bd(e.x.water,e.x.foam),r=new z(new Za(4e3,2400),n);r.rotation.x=-Math.PI/2,r.position.set(0,.3,t+1200),r.receiveShadow=!0,e.c.dyn.add(r)}function uf(e,t){if(!t.length)return;let n=new hi(new Za(1,1).rotateX(-Math.PI/2),Bd(e.x.water,e.x.foam),t.length),r=new an;t.forEach((t,i)=>{r.makeScale(t.x1-t.x0,1,t.z1-t.z0).setPosition((t.x0+t.x1)/2,1.22,(t.z0+t.z1)/2),n.setMatrixAt(i,r),e.c.decor.box((t.x0+t.x1)/2,.95,(t.z0+t.z1)/2,t.x1-t.x0+2.4,.3,t.z1-t.z0+2.4,16052970)}),n.instanceMatrix.needsUpdate=!0,n.receiveShadow=!0,e.c.dyn.add(n)}function df(e){let{c:t,N:n,S:r,H:i,lot:a,x:o}=e,s=e.w.theme;Gd(e,s.ground);let c=n-1,l=t.streetAt(c)+r/2;lf(e,l),t.terrain.waterName=`EW, HARBOUR!`,t.terrain.water.push({x0:-3e3,z0:l,x1:3e3,z1:3e3});for(let e=0;e<=n;e++){let n=t.streetAt(e),a=i+r/2-l;t.decor.box(n,.25,l+a/2,r,.4,a,o.wood),t.terrain.dry.push({x0:n-r/2,z0:l-1,x1:n+r/2,z1:i+r/2});for(let e=l+16;e<i-8;e+=36)for(let i of[-1,1])t.decor.box(n+i*(r/2-1),.9,e,1.6,1,1.6,14205024)}t.decor.box(0,.25,i,2*i+r,.4,r,o.wood),t.terrain.dry.push({x0:-i-r,z0:i-r/2,x1:i+r,z1:i+r/2});let u=o.containers,d=!1;for(let r=0;r<n;r++)for(let i=0;i<n;i++){let f=e.lc(r),p=e.lc(i);if(i===c){let i=e.rnd();if(!d&&r===n-1){d=!0,t.decor.disc(f+10,.4,p+10,30,.8,9078138),t.terrain.dry.push({x0:f-4,z0:p-4,x1:f+24,z1:p+24}),e.plan({x:f+10,z:p+10,hx:5.5,hz:5.5,count:13,style:jf.stripe,colors:[16052972,16052972,13120042],value:e.value(1.6),min:8,after:t=>ff(e,t)});continue}let s=i<.75;if(s&&(t.decor.box(f,.25,l+11,a+2,.4,22,o.wood),t.terrain.dry.push({x0:f-a/2,z0:l-1,x1:f+a/2,z1:l+22}),tf(e,f+e.range(-10,10),l+2,56,e.pick(o.accent))),i<.6||!s)hf(e,f,p+(s?12:2),u);else for(let t=0;t<3;t++)gf(e,f+(t-1)*22,p+14+e.range(-4,4));continue}t.decor.box(f,.4,p,a,.8,a,s.sidewalk);let m=i===c-1,h=e.rnd();if(!m&&h<e.w.parkChance){t.decor.box(f,.5,p,a-6,1,a-6,s.grass);for(let t=0;t<12;t++)e.tree(f+(e.rnd()-.5)*(a-14),p+(e.rnd()-.5)*(a-14),e.range(9,15),null)}else if(m?h<.6:h<.38)pf(e,f,p);else if(m||h<.72)mf(e,f,p,u);else if(h<.9)for(let t of[-1,1]){let n=e.floors(f,p);e.plan({x:f+t*a*.25,z:p,hx:a*.22,hz:a*.42,count:Math.max(4,n),style:jf.office,colors:[e.pick(s.palette)],min:4})}else{let t=e.plan({x:f,z:p-6,hx:a*.44,hz:a*.3,count:2,style:jf.house,colors:[14215406,3832488]});t.after=t=>Yd(e,t,2779802,!0,!1);for(let t=0;t<4;t++)e.plan({x:f-24+t*16,z:p+28,hx:5,hz:4,count:1,style:jf.container,colors:[e.pick(u)]})}}qd(e),Kd(e,s.dash,!1,(e,t)=>t>l-2)}function ff(e,t){let n=e.c.buildings[t],r=e.c.props,i=n.count*7;r.room(`glow`,3)&&(r.begin(n.x,n.z,8,2,`LIGHTHOUSE `,{anchor:n.first+n.count-1,spin:1.4}),r.part(`box`,n.x,i+.6,n.z,15,1.2,15,2763310),r.part(`glow`,n.x,i+4,n.z,7,6,7,16773280),r.part(`gable`,n.x,i+9,n.z,9.5,4,9.5,13120042),r.part(`glow`,n.x,i+4,n.z,110,.9,1.6,16774856),r.end())}function pf(e,t,n){let{lot:r}=e,i=e.w.theme,a=e.rnd()<.55?[[t,n-r/4,r/2-3,r/4-3],[t,n+r/4,r/2-3,r/4-3]]:[[t,n,r/2-3,r/2-6]];for(let[t,n,r,o]of a){let a=e.pick(e.x.roofs);e.plan({x:t,z:n,hx:r,hz:o,count:e.int(3,4),style:jf.industrial,colors:[e.pick(i.palette)],min:2,after:t=>Yd(e,t,a,!0,!1)})}}function mf(e,t,n,r){let{lot:i}=e;e.c.decor.box(t,.85,n,i-4,.1,i-4,e.x.concrete);for(let i=0;i<3;i++)for(let a=0;a<2;a++){if(e.rnd()<.12)continue;let o=[],s=e.int(1,5);for(let t=0;t<s;t++)o.push(e.pick(r));e.plan({x:t+(i-1)*23,z:n+(a-.5)*32,hx:5.6,hz:13,count:s,style:jf.container,colors:o,value:e.value(.9),lj:0})}}function hf(e,t,n,r){let i=e.pick([10103330,2306634,2763310,3103290]),a=e.rnd()<.5?1:-1;e.plan({x:t-a*26,z:n,hx:6,hz:8,count:4,style:jf.house,colors:[i,15921384,15921384,15921384],value:e.value(1.3),min:3});for(let o=0;o<3;o++){let s=[i],c=e.int(2,4);for(let t=1;t<c;t++)s.push(e.pick(r));e.plan({x:t-a*(12-o*12.5),z:n,hx:6,hz:8,count:c,style:jf.container,colors:s,value:e.value(1.2),lj:0})}e.plan({x:t+a*29,z:n,hx:5,hz:5.6,count:1,style:jf.plain,colors:[i],value:e.value(1.2)})}function gf(e,t,n){e.plan({x:t,z:n,hx:7,hz:3.2,count:1,style:jf.plain,colors:[e.pick([15921384,2781145,13120042])],value:e.value(.8)})}function _f(e){let{c:t,N:n,lot:r}=e,i=e.w.theme;Gd(e,i.ground),t.terrain.waterName=`NOT THE POOL!`;let a=[],o=Math.floor(n/2),s=0;for(let c=0;c<n;c++)for(let l=0;l<n;l++){let n=e.lc(c),u=e.lc(l);if(t.decor.box(n,.4,u,r,.8,r,i.sidewalk),t.decor.box(n,.85,u,r-7,.3,r-7,i.grass),c===o&&l===o)yf(e,n,u);else if(c===o+1&&l===o-1)e.plan({x:n,z:u-8,hx:r*.42,hz:r*.24,count:3,style:jf.office,colors:[13138522],value:e.value(1.2),min:2,after:t=>Yd(e,t,5921370,!0,!1)}),e.c.decor.box(n,.95,u+22,r-12,.15,22,13134410),cf(e,n-16,u+22);else if(e.rnd()<e.w.parkChance){t.decor.disc(n,1.05,u,r-10,.2,9426024);for(let t=0;t<14;t++){let i=t/14*Math.PI*2;e.tree(n+Math.cos(i)*(r/2-9),u+Math.sin(i)*(r/2-9),e.range(10,16),null,.7)}s<3&&e.rnd()<.6?(s++,af(e,n+8,u-6,e.pick([10473712,15773888,15921906]))):(t.decor.disc(n+8,1.05,u-6,15,.2,14210248),a.push({x0:n+3,z0:u-11,x1:n+13,z1:u-1})),cf(e,n-12,u+10)}else vf(e,n,u,a)}for(;s<2;s++)af(e,e.lc(s?n-1:0)+24,e.lc(s?0:n-1)-24,10473712);qd(e),uf(e,a);for(let e of a)t.terrain.water.push(e);Kd(e,i.dash,!1)}function vf(e,t,n,r){let{lot:i}=e,a=e.w.theme,o=i/4,s=e.rnd(),c=s<.55?[[-o,-o],[o,-o],[-o,o],[o,o]]:s<.8?[[-o,-o],[o,-o],[0,o]]:[[-o,0],[o,0]],l=[];for(let[r,o]of c){if(e.rnd()<.1)continue;let s=e.range(7.5,c.length===2?13:11),u=e.range(6.5,c.length===2?14:10),d=t+r+e.range(-2,2),f=n+o+e.range(-2,2),p=e.rnd(),m=p<.25?2:p<.8?3:4,h=e.pick(a.palette),g=e.pick(e.x.roofs),_=s>u,v=e.rnd()<.5;e.plan({x:d,z:f,hx:s,hz:u,count:m,style:jf.house,colors:[h],value:e.value(),after:t=>Yd(e,t,g,_,v),min:2}),l.push([d,f,s,u]);let y=o<0?-1:1,b=i/2-Math.abs(o)-u+2;b>2&&e.c.decor.box(d+s*.5,1.02,f+y*(u+b/2),6,.1,b,12433580)}for(let r=0;r<6;r++){let r=t+(e.rnd()-.5)*(i-10),a=n+(e.rnd()-.5)*(i-10);l.some(([e,t,n,i])=>Math.abs(r-e)<n+4&&Math.abs(a-t)<i+4)||e.tree(r,a,e.range(9,15),null,.75)}let u=e.int(1,2);for(let r=0;r<u;r++){let r=e.int(0,3),a=r<2,o=(r%2?-1:1)*(i/2-4);for(let r of[-1,1])sf(e,a?t+r*19:t+o,a?n+o:n+r*19,24,a)}if(e.rnd()<.35){let i=t+e.range(-6,6),a=n+e.range(-6,6),o=4.5;l.some(([e,t,n,r])=>Math.abs(i-e)<n+7+1&&Math.abs(a-t)<r+o+1)||r.push({x0:i-7,z0:a-o,x1:i+7,z1:a+o})}}function yf(e,t,n){e.plan({x:t-4,z:n,hx:12,hz:22,count:4,style:jf.house,colors:[16052972],value:e.value(1.4),min:3,after:t=>Yd(e,t,5917274,!1,!1)}),e.plan({x:t-4,z:n-27,hx:5,hz:5,count:10,style:jf.stripe,colors:[16052972],value:e.value(1.6),min:6,after:t=>{let n=e.c.buildings[t],r=e.c.props;r.room(`gable`,1)&&(r.begin(n.x,n.z,6,0,``,{anchor:n.first+n.count-1}),r.part(`gable`,n.x,n.count*7+7,n.z,11,14,11,5917274),r.part(`box`,n.x,n.count*7+16,n.z,.8,5,.8,15913530),r.part(`box`,n.x,n.count*7+16.5,n.z,3.4,.8,.8,15913530),r.end())}}),e.c.decor.box(t+22,1,n,18,.15,60,12433580)}function bf(e){let{c:t,N:n,lot:r}=e,i=e.w.theme;Gd(e,i.ground,.6);for(let a=0;a<n;a++)for(let o=0;o<n;o++){let n=e.lc(a),s=e.lc(o);t.decor.box(n,.4,s,r,.8,r,i.sidewalk);let c=(a+o)%2?4124927:16727712;for(let e of[-1,1])t.decor.glowBox(n+e*(r/2-.4),.9,s,.6,.2,r,c),t.decor.glowBox(n,.9,s+e*(r/2-.4),r,.2,.6,c);let l=e.rnd();if(l<e.w.parkChance&&Math.hypot(n,s)>e.B){t.decor.box(n,.55,s,r-6,.5,r-6,i.grass);for(let t=0;t<12;t++)e.tree(n+(e.rnd()-.5)*(r-16),s+(e.rnd()-.5)*(r-16),e.range(10,16),16751312,.8);xf(e,n,s);continue}let u=l<.32?9:l<.82?4:1,d=[];if(u===1)d.push([n,s,r/2-6,r/2-6]);else{let e=u===9?3:2,t=r/e;for(let i=0;i<e;i++)for(let a=0;a<e;a++)d.push([n-r/2+t*(i+.5),s-r/2+t*(a+.5),t/2-2.5,t/2-2.5])}for(let[t,n,r,a]of d){let o=r*e.range(.75,1),s=a*e.range(.75,1),c=u===1,l=Math.max(5,e.floors(t,n,c?1.35:u===9?.85:1)),d=l>9&&e.rnd()<.7?Math.floor(l*e.range(.5,.75)):999,f=e.pick(i.palette),p=e.rnd()<(u===9?.45:.75),m=e.rnd()<.18,h=!m&&l>14&&e.rnd()<.5;e.plan({x:t,z:n,hx:o,hz:s,count:l,style:jf.tower,colors:[f],setback:d,min:4,value:e.value(),after:t=>{let n=e.c.buildings[t],r=d<999?Math.max(1,Math.round(d*(n.count/l))):n.count;p&&Zd(e,t,r),p&&(c||e.rnd()<.3)&&Zd(e,t,r),m&&r>=n.count&&Qd(e,t),h&&$d(e,t,r<n.count?.72:1)}})}}qd(e),Kd(e,i.dash,!0)}function xf(e,t,n){let r=e.c.props;r.room(`glow`,4)&&(r.begin(t,n,10,1,`GATE `,{kind:`spark`}),r.part(`glow`,t-8,8,n,1.8,16,1.8,16727626),r.part(`glow`,t+8,8,n,1.8,16,1.8,16727626),r.part(`glow`,t,16.5,n,24,1.6,2.4,16727626),r.part(`glow`,t,13,n,19,1,1.4,16727626),r.end())}function Sf(e){let{c:t,N:n,H:r,lot:i}=e,a=e.w.theme;Gd(e,a.ground);let o=n-3,s=e.lc(o),c=i+4;t.decor.box(0,.07,s,2*r+80,.14,c,3552826);for(let e=-r+20;e<r-20;e+=34)t.decor.box(e,.2,s,14,.06,1.4,16053488);for(let e of[-1,1]){t.decor.box(0,.2,s+e*(c/2-3),2*r,.06,1,16053488);for(let n=0;n<8;n++)t.decor.box(e*(r-22),.2,s-c/2+8+n*((c-16)/7),28,.06,2.4,16053488);for(let n=-r;n<=r;n+=30)t.decor.glowBox(n,.6,s+e*(c/2+.5),1.2,1.2,1.2,n%60?16773824:5963658)}[1,3,5,7].filter(e=>e<n).forEach((t,n)=>{let r=e.lc(t);n===1?rf(e,r,s):nf(e,r+e.range(-8,8),s+e.range(-14,14),e.rnd()<.5?Math.PI/2:-Math.PI/2)});let l=new Set([`1,1`,`${n-2},${Math.max(0,o-3)}`,`${Math.floor(n/2)},${n-1}`]);for(let r=0;r<n;r++)for(let s=0;s<n;s++){if(s===o)continue;let n=e.lc(r),c=e.lc(s);t.decor.box(n,.4,c,i,.8,i,a.sidewalk);let u=s===o-1?1:s===o+1?-1:e.rnd()<.5?1:-1;if(l.has(`${r},${s}`)){Df(e,n,c);continue}if(s===o-1&&r===2){Of(e,n,c);continue}let d=e.rnd();s===o-1||s===o+1||d<.3?Cf(e,n,c,u):d<.48?wf(e,n,c):d<.68?Tf(e,n,c):d<.8?Ef(e,n,c):d<.88?Df(e,n,c):kf(e,n,c)}qd(e),Kd(e,a.dash,!1,(e,t)=>Math.abs(t-s)<c/2+1)}function Cf(e,t,n,r){let i=e.w.theme,a=e.range(28,34),o=e.range(24,30),s=e.pick(e.x.roofs);e.plan({x:t,z:n,hx:a,hz:o,count:e.int(3,4),style:jf.industrial,colors:[e.pick(i.palette)],value:e.value(1.1),min:2,after:t=>Xd(e,t,s,r)})}function wf(e,t,n){for(let r of[-1,1])for(let i of[-1,1])e.rnd()<.2||e.plan({x:t+r*17,z:n+i*17,hx:e.range(8,11),hz:e.range(6,9),count:2,style:jf.bunker,colors:[e.pick([10262664,9078390,11051152])],value:e.value(1.2)});let r=e.c.props;if(r.room(`box`,6)){r.begin(t,n,7,.05,`SANDBAGS `,{trample:!0});for(let e=0;e<6;e++){let i=e/6*Math.PI*2;r.part(`box`,t+Math.cos(i)*6,1.4,n+Math.sin(i)*6,5,2.8,2.4,12101754,-i)}r.end()}}function Tf(e,t,n){for(let r of[-1,1]){let i=e.pick(e.x.roofs);e.plan({x:t,z:n+r*18,hx:e.range(28,33),hz:e.range(8,11),count:e.int(2,3),style:jf.house,colors:[e.pick([14207130,13154442,12103818])],value:e.value(),after:t=>Yd(e,t,i,!0,!1)})}let r=e.c.props;r.room(`box`,2)&&(r.begin(t+28,n,3,.4,`FLAG `,{trample:!0}),r.part(`box`,t+28,11,n,.6,22,.6,15263976),r.part(`box`,t+28,19.5,n+3.4,.3,4,6.4,16747050),r.end())}function Ef(e,t,n){for(let r=0;r<3;r++)for(let i=0;i<2;i++)of(e,t+(r-1)*22,n+(i-.5)*30,16,e.range(10,15))}function Df(e,t,n){e.plan({x:t,z:n,hx:3.6,hz:3.6,count:e.int(8,11),style:jf.plain,colors:[10133140],value:e.value(1.4),min:6,after:t=>ef(e,t)}),e.plan({x:t+22,z:n+18,hx:9,hz:7,count:2,style:jf.bunker,colors:[10262664],value:e.value()})}function Of(e,t,n){e.plan({x:t,z:n+10,hx:6,hz:6,count:10,style:jf.office,colors:[14209728],value:e.value(1.5),min:6,after:t=>{let n=e.c.buildings[t],r=e.c.props;if(!r.room(`box`,3))return;let i=n.count*7;r.begin(n.x,n.z,8,2,`TOWER CAB `,{anchor:n.first+n.count-1}),r.part(`box`,n.x,i+.5,n.z,16,1,16,4868678),r.part(`box`,n.x,i+4,n.z,14,6,14,3828362),r.part(`box`,n.x,i+7.6,n.z,16,1.2,16,4868678),r.end(),$d(e,t,1)}}),e.plan({x:t,z:n-20,hx:26,hz:9,count:2,style:jf.office,colors:[13157040],value:e.value()})}function kf(e,t,n){let r=e.c.decor;r.disc(t,.95,n,46,.2,9079428),r.box(t-6,1.1,n,2.4,.06,16,16053488),r.box(t+6,1.1,n,2.4,.06,16,16053488),r.box(t,1.1,n,12,.06,2.4,16053488)}function Af(e,t,n){let r=new Wd(e,t,n);t.layout===`docks`?df(r):t.layout===`suburbia`?_f(r):t.layout===`neon`?bf(r):Sf(r),e.spawn={x:e.streetAt(Math.min(4,t.n)),z:e.streetAt(1)+20,heading:0}}var jf={office:0,container:1,house:2,industrial:3,tower:4,bunker:5,plain:6,stripe:7};function Mf(e){let t=new B({color:16777215,roughness:.75,metalness:.05});return t.onBeforeCompile=t=>{Object.assign(t.uniforms,e),t.vertexShader=t.vertexShader.replace(`#include <common>`,`#include <common>
attribute float aStyle;
varying vec3 vWin; varying vec3 vWinN; varying float vStyle;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
        vec3 iscale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vWin = position * iscale; vWinN = normal; vStyle = aStyle;`),t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vWin; varying vec3 vWinN; varying float vStyle;
uniform float uLit; uniform vec3 uGlass; uniform vec3 uGlow; uniform vec3 uGlow2; uniform float uEmit;`).replace(`#include <color_fragment>`,`#include <color_fragment>
        float wLit = 0.0;
        float wHue = 0.0;
        if (abs(vWinN.y) < 0.5) {
          float h = abs(vWinN.x) > 0.5 ? vWin.z : vWin.x;
          if (vStyle < 0.5) {
            // office: the POC window grid
            float u = fract(h / 3.6 + 0.5);
            float vv = fract(vWin.y / 3.5 + 0.5);
            float win = step(0.22, u) * step(u, 0.78) * step(0.28, vv) * step(vv, 0.86);
            vec2 cell = floor(vec2(h / 3.6, vWin.y / 3.5));
            float lit = step(1.0 - uLit, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
            vec3 glass = mix(uGlass, uGlow, lit);
            diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.9);
            wLit = win * lit;
            wHue = fract(sin(dot(cell, vec2(39.3468, 11.135))) * 24634.6345);
          } else if (vStyle < 1.5) {
            // shipping container: corrugated ribs, dark seams between boxes, no windows
            float rib = step(0.5, fract(h / 1.15));
            diffuseColor.rgb *= 0.84 + 0.16 * rib;
            diffuseColor.rgb *= 1.0 - 0.45 * step(3.05, abs(vWin.y));
          } else if (vStyle < 2.5) {
            // house: one row of framed windows per floor, wide spacing
            float u = fract(h / 6.5 + 0.5);
            float vv = fract(vWin.y / 7.0 + 0.5);
            float win = step(0.32, u) * step(u, 0.68) * step(0.36, vv) * step(vv, 0.74);
            float frame = step(0.27, u) * step(u, 0.73) * step(0.31, vv) * step(vv, 0.79) - win;
            vec2 cell = floor(vec2(h / 6.5 + 0.5, vWin.y / 7.0 + 0.5));
            float lit = step(1.0 - uLit, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.96, 0.92), frame * 0.95);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(uGlass, uGlow, lit), win * 0.92);
            wLit = win * lit;
          } else if (vStyle < 3.5) {
            // warehouse / hangar: ribbed cladding, a high strip of clerestory windows
            float panel = step(0.5, fract(h / 1.6));
            diffuseColor.rgb *= 0.86 + 0.14 * panel;
            float vv = fract(vWin.y / 7.0 + 0.5);
            float u = fract(h / 5.0 + 0.5);
            float win = step(0.74, vv) * step(vv, 0.9) * step(0.08, u) * step(u, 0.92);
            vec2 cell = floor(vec2(h / 5.0 + 0.5, vWin.y / 7.0 + 0.5));
            float lit = step(1.0 - uLit, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(uGlass, uGlow, lit), win * 0.85);
            wLit = win * lit;
          } else if (vStyle < 4.5) {
            // neon tower: a dense grid of small windows, many lit; each tower leans cyan or pink
            float bseed = fract(dot(diffuseColor.rgb, vec3(91.7, 47.3, 13.1)));
            float u = fract(h / 2.4 + 0.5);
            float vv = fract(vWin.y / 2.333 + 0.5);
            float win = step(0.16, u) * step(u, 0.84) * step(0.22, vv) * step(vv, 0.84);
            vec2 cell = floor(vec2(h / 2.4 + 0.5, vWin.y / 2.333 + 0.5));
            float lit = step(1.0 - uLit, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(uGlass, uGlow, lit), win * 0.9);
            wLit = win * lit;
            wHue = fract(bseed + 0.3 * fract(sin(dot(floor(cell / vec2(4.0, 6.0)), vec2(39.3468, 11.135))) * 24634.6345));
          } else if (vStyle < 5.5) {
            // bunker: rough concrete with one gun slit
            float vv = fract(vWin.y / 7.0 + 0.5);
            float u = fract(h / 9.0 + 0.5);
            float slit = step(0.6, vv) * step(vv, 0.7) * step(0.3, u) * step(u, 0.7);
            diffuseColor.rgb *= 0.92 + 0.08 * step(0.5, fract(h / 2.0 + vWin.y / 3.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05), slit * 0.9);
          } else if (vStyle < 6.5) {
            // lattice mast: cross bracing, no windows
            float d1 = abs(fract((h + vWin.y) / 5.0) - 0.5);
            float d2 = abs(fract((h - vWin.y) / 5.0) - 0.5);
            float brace = max(step(0.42, d1), step(0.42, d2));
            diffuseColor.rgb *= 0.62 + 0.38 * brace;
          } else {
            // painted stripes (lighthouse, chimneys): a plain coat with a soft band per floor
            diffuseColor.rgb *= 0.92 + 0.08 * step(0.5, fract(vWin.y / 7.0 + 0.5));
          }
        } else {
          diffuseColor.rgb *= 0.78;
        }`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
        totalEmissiveRadiance += mix(uGlow, uGlow2, step(0.62, wHue)) * wLit * uEmit;`)},t}var Nf=class{segs;trees;buildings=[];segBuilding;group=new L;totalSegs=0;n=9;block=100;street=26;half=450;spawn={x:0,z:0,heading:0};win={uLit:{value:.18},uGlass:{value:new R(.22,.28,.36)},uGlow:{value:new R(1,.86,.55)},uGlow2:{value:new R(1,.86,.55)},uEmit:{value:0}};layout=`downtown`;props;decor=new Rd;terrain={water:[],dry:[],waterName:`WATER`};dyn=new L;style;constructor(e){let t=new ki(1,1,1);this.style=new si(new Float32Array(Zu.segs),1),t.setAttribute(`aStyle`,this.style),this.segs=new _d(t,Mf(this.win),Zu.segs),this.segBuilding=new Int32Array(Zu.segs);let n=new Mi(.5,1,7).translate(0,0,0);this.trees=new _d(n,new B({color:16777215,roughness:1}),Zu.trees),e.add(this.group),this.group.add(this.segs.mesh,this.trees.mesh,this.dyn),this.props=new Ud(this.group)}streetAt(e){return-this.half+e*this.block}addBuilding(e,t,n,r,i,a,o,s,c=999,l=.72){if(i<1||this.segs.n+i>Zu.segs)return-1;let u=this.buildings.length,d={x:e,z:t,hx:n,hz:r,first:this.segs.n,count:i,value:a},f=Pf;for(let a=0;a<i;a++){let i=a>=c?l:1,d=typeof s==`function`?s(a,f):s,p=this.segs.add(e,7*(a+.5),t,n*2*i,7,r*2*i,d);this.segBuilding[p]=u,this.style.setX(p,o)}return this.buildings.push(d),u}addTree(e,t,n,r,i=1,a=.55){return this.trees.n>=Zu.trees?!1:(this.trees.add(e,n/2+i,t,n*a,n,n*a,r),!0)}build(e){for(let e of[...this.dyn.children]){this.dyn.remove(e);let t=e;t.geometry?.dispose(),t.material?.dispose()}this.segs.n=0,this.segs.mesh.count=0,this.trees.n=0,this.trees.mesh.count=0,this.buildings=[],this.style.array.fill(0),this.props.reset(),this.decor.reset(),this.terrain={water:[],dry:[],waterName:`WATER`},this.layout=e.layout;let{n:t,block:n}=e;this.n=t,this.block=n,this.street=e.street,this.half=t*n/2;let r=Ff(e.seed);e.layout===`downtown`?this.buildDowntown(e,r):Af(this,e,r),this.decor.flush(this.dyn),this.props.finish(),this.style.needsUpdate=!0,this.totalSegs=this.segs.n,this.segs.mesh.instanceColor&&(this.segs.mesh.instanceColor.needsUpdate=!0),this.trees.mesh.instanceColor&&(this.trees.mesh.instanceColor.needsUpdate=!0),this.segs.mesh.instanceMatrix.needsUpdate=!0,this.trees.mesh.instanceMatrix.needsUpdate=!0}buildDowntown(e,t){let{n,block:r,street:i,theme:a}=e,o=this.half,s=e=>this.streetAt(e),c=Zu.segs,l=new z(new Za(4e3,4e3),new B({color:a.ground,roughness:1}));l.rotation.x=-Math.PI/2,l.receiveShadow=!0,this.dyn.add(l);let u=new hi(new ki(1,1,1),new B({color:a.sidewalk,roughness:1}),n*n),d=new B({color:a.grass,roughness:1}),f=new hi(new Za(1,1),new Kr({color:a.dash}),Math.ceil(2*(n+1)*(n*r/16+1))),p=0,m=new an,h=new R,g=a.palette,_=0;for(let a=0;a<n;a++)for(let l=0;l<n;l++){let n=s(a)+r/2,f=s(l)+r/2,p=r-i;m.compose(new I(n,.4,f),new Pt,new I(p,.8,p)),u.setMatrixAt(_++,m),u.receiveShadow=!0;let v=1-Math.hypot(n,f)/(o*1.2);if(t()<e.parkChance&&!(Math.abs(n)<r&&Math.abs(f)<r)){let e=new z(new ki(p-6,1,p-6),d);e.position.set(n,.5,f),e.receiveShadow=!0,this.dyn.add(e);for(let e=0;e<22;e++){let e=9+t()*8;if(this.trees.n>=Zu.trees)break;this.trees.add(n+(t()-.5)*(p-14),e/2+1,f+(t()-.5)*(p-14),e*.55,e,e*.55,h.setHSL(.27+t()*.06,.45,.32+t()*.1))}continue}let y=t()<.25?1:t()<.5?2:4,b=[];if(y===1)b.push([n,f,p/2-3,p/2-3]);else if(y===2){let e=p/4;t()<.5?b.push([n-e,f,e-3,p/2-3],[n+e,f,e-3,p/2-3]):b.push([n,f-e,p/2-3,e-3],[n,f+e,p/2-3,e-3])}else{let e=p/4;for(let t of[-1,1])for(let r of[-1,1])b.push([n+t*e,f+r*e,e-3,e-3])}for(let[n,r,i,a]of b){let o=i*(.8+t()*.2),s=a*(.8+t()*.2),l=e.heightBase+t()*e.heightRand+Math.max(0,v)*(e.centreBoost+t()*e.centreRand),u=Math.max(3,Math.round(l/7));if(this.segs.n+u>c)continue;h.setHex(g[Math.floor(t()*g.length)]).offsetHSL(0,0,(t()-.5)*.08);let d=e.valueBase+t()*e.valueRand,f=u>10&&t()<.6?Math.floor(u*(.55+t()*.2)):999;this.addBuilding(n,r,o,s,u,d,jf.office,h,f)}}u.instanceMatrix.needsUpdate=!0,this.dyn.add(u);for(let e=0;e<=n;e++){let t=s(e);for(let e=-o;e<o&&!(p+2>f.count);e+=16)m.compose(new I(t,.05,e+4),new Pt().setFromEuler(new hn(-Math.PI/2,0,0)),new I(.8,7,1)),f.setMatrixAt(p++,m),m.compose(new I(e+4,.05,t),new Pt().setFromEuler(new hn(-Math.PI/2,0,Math.PI/2)),new I(.8,7,1)),f.setMatrixAt(p++,m)}f.count=p,this.dyn.add(f),this.spawn={x:s(Math.min(4,n)),z:s(1)+20,heading:0}}standing(e){let t=0;for(let n=0;n<e.count&&this.segs.state[e.first+n]===ld.Static;n++)t=(n+1)*7;return t}knock(e,t,n,r){if(this.segs.state[e]!==ld.Static)return 0;let i=this.buildings[this.segBuilding[e]],a=e-i.first,o=0;for(let e=a;e<i.count;e++){let s=i.first+e;if(this.segs.state[s]!==ld.Static)continue;let c=e===a?1:.25+.5/(1+(e-a)),l=.35;this.segs.launch(s,t*c*(1+(Math.random()-.5)*l),n*c+Math.random()*6,r*c*(1+(Math.random()-.5)*l),e===a?4:1.5),o++}return o}},Pf=new R;function Ff(e){let t=e;return()=>{t|=0,t=t+1831565813|0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}var If=[[0,`Lap Kitten`],[60,`Curtain Climber`],[200,`Vase Assassin`],[600,`Alley Menace`],[1500,`CAT-ASTROPHE`],[3e3,`ULTRA CAT`]];function Lf(e){return 1+Math.min(4,Math.floor(e/8))}function Rf(e,t){return(1+e/45)*(t?3:1)}function zf(e,t=1){return Math.min(e,3)*t}function Bf(e){return e>=1e3?`$${(e/1e3).toFixed(2)}B`:e>=1?`$${e.toFixed(1)}M`:e<=0?`$0`:`$${Math.round(e*1e3)}K`}function Vf(e,t=If){let n=0;return t.forEach(([t],r)=>{e>=t&&(n=r)}),n}var Y=new Nf(J),Hf=new I;Y.segs.onLand=(e,t)=>{if(Math.random()<.5){let n=e*3;Ad(Y.segs.pos[n],1,Y.segs.pos[n+2],t>30?3:1)}t>25&&Math.random()<.3&&Ru(.6)};function Uf(e,t,n){let r=Math.max(0,Math.abs(t-e.x)-e.hx),i=Math.max(0,Math.abs(n-e.z)-e.hz);return Math.hypot(r,i)}function Wf(e){return Rf(G.elapsed,e===Qu.bi)}function Gf(e){ed.has(e)||(ed.add(e),G.buildings++,U.emit(`buildingWrecked`,{index:e,total:G.buildings}))}function Kf(e,t,n,r,i,a){let o=0,s=Y.segs;for(let c=0;c<Y.buildings.length;c++){let l=Y.buildings[c];if(Uf(l,e,t)>n)continue;let u=-1,d=0;for(let e=0;e<l.count;e++){let t=l.first+e;if(s.state[t]!==ld.Static)continue;let n=7*(e+.5);n<r||n>i||(u<0&&(u=e),a(s.pos[t*3],n,s.pos[t*3+2],Hf),s.launch(t,Hf.x,Hf.y,Hf.z,5),d++)}if(!(u<0)){for(let e=u;e<l.count;e++){let t=l.first+e;if(s.state[t]===ld.Static){a(s.pos[t*3],7*(e+.5),s.pos[t*3+2],Hf),d+=Y.knock(t,Hf.x*.3,4,Hf.z*.3);break}}o+=d*l.value*Wf(c),Gf(c),Ad(Math.max(l.x-l.hx,Math.min(l.x+l.hx,e)),r+4,Math.max(l.z-l.hz,Math.min(l.z+l.hz,t)),3,14078150)}}return o>0&&Ru(Math.min(2.5,o)),o}function qf(e,t,n,r,i=0){return(a,o,s,c)=>{let l=a-e,u=s-t,d=Math.hypot(l,u)||1;c.set(l/d*n,r+Math.random()*i,u/d*n)}}function Jf(e){let t=0;for(let n=0;n<e.count;n++)Y.segs.state[e.first+n]===ld.Static&&t++;return t}function Yf(){let e=0;for(let t=0;t<Y.segs.n;t++)Y.segs.state[t]!==ld.Static&&e++;return Y.totalSegs?e/Y.totalSegs*100:0}function Xf(e){let t=Y.n;for(let n=0;n<30;n++){let n=new I(Y.streetAt(1+Math.floor(Math.random()*(t-1))),0,Y.streetAt(1+Math.floor(Math.random()*(t-1))));if(!e||n.distanceTo(e)>160)return n}return new I(Y.streetAt(2),0,Y.streetAt(2))}var Zf=[],Qf=[],$f=new I;function ep(){let e=new L,t=new z(new ki(5,5,11),new B({color:16777215}));t.position.y=3.2;let n=new z(new ki(5.1,1.2,11.1),new B({color:2785279}));n.position.y=3.6;let r=new L,i=new z(new $a(1,16,12),new B({color:8378623,metalness:.4,roughness:.3}));i.scale.set(2.2,3.2,7);let a=new z(new Mi(3.2,4,4),i.material);a.rotation.x=-Math.PI/2,a.position.z=-8,a.scale.x=.3;let o=new z(new $a(.7,8,6),new Kr({color:1118481}));o.position.set(1.8,.8,4.5),r.add(i,a,o),r.position.y=62,r.scale.setScalar(3);let s=new z(new eo(13,1,8,40),new Kr({color:6283519,transparent:!0,opacity:.6}));s.rotation.x=Math.PI/2,s.position.y=.6;let c=new z(new ji(4,4,120,12,1,!0),new Kr({color:6283519,transparent:!0,opacity:.35,depthWrite:!1,side:2}));return c.position.y=60,e.add(t,n,r,s),e.traverse(e=>e.castShadow=!0),e.add(c),J.add(e),{g:e,fish:r,ring:s,respawn:0}}function tp(){let e=Math.min(Zu.fish,W.level.fishTrucks);for(;Qf.length<e;)Qf.push(ep());Zf.length=0;for(let t=0;t<Qf.length;t++){let n=Qf[t];n.g.visible=t<e,!(t>=e)&&(n.g.position.copy(Xf(K.pos)),n.respawn=0,Zf.push(n))}}function np(e,t){for(let n of Zf)n.g.visible?(n.fish.position.y=62+Math.sin(t*3)*3,n.fish.rotation.y=t,n.ring.scale.setScalar(1+Math.sin(t*5)*.08),W.mode===`play`&&Math.hypot(n.g.position.x-K.pos.x,n.g.position.z-K.pos.z)<18&&!K.air&&(n.g.visible=!1,n.respawn=7,G.fish++,G.patience=Math.min(q.patienceMax,G.patience+35),G.ultra=Math.min(100,G.ultra+25),Hu(),Ep(`NOM NOM!`,$f.set(K.pos.x,55,K.pos.z),`#ffffff`,44).el.classList.add(`nom`),U.emit(`fishEaten`,{count:G.fish}))):(n.respawn-=e,n.respawn<=0&&(n.g.position.copy(Xf(K.pos)),n.g.visible=!0))}var rp=e=>document.getElementById(e),ip=rp(`dmgv`),ap=rp(`combo`),op=document.createTextNode(``),sp=document.createElement(`b`);ap.replaceChildren(op,sp);var cp=rp(`timer`),lp=rp(`pat`).firstElementChild,up=rp(`ult`).firstElementChild,dp=rp(`ult`),fp=rp(`banner`),pp=rp(`flash`),mp=rp(`pops`),hp=rp(`tbUltra`),gp=rp(`cbar`).firstElementChild,_p=rp(`cbar`),vp=rp(`zap`),yp=rp(`wet`),bp=rp(`pat`),xp=rp(`wantedArrow`),Sp=rp(`fishArrow`),Cp=[],wp=new I,Tp=new I;function Ep(e,t,n=`#fff6e6`,r=22,i=``,a=0){let o=document.createElement(`div`);o.className=`pop txt`,o.textContent=e,o.style.color=n,o.style.fontSize=`${innerWidth<600?Math.min(r,30):r}px`,mp.appendChild(o);let s={el:o,p:t.clone(),age:0,ox:(Math.random()-.5)*120,oy:(Math.random()-.5)*50,key:i,val:a,w:0};return Cp.push(s),Cp.length>8&&Cp.shift().el.remove(),s}function Dp(e,t,n){let r=t>8,i=`m:${e}`,a=Cp.find(e=>e.key===i&&e.age<.35);a?(a.val+=t,a.el.textContent=`${e}+${Bf(a.val)}`,a.el.style.fontSize=`${Math.min(innerWidth<600?30:46,18+a.val*1.2)}px`,a.w=0,a.val>8&&(a.el.style.color=`#ffd24a`)):Ep(`${e}+${Bf(t)}`,n,r?`#ffd24a`:`#fff6e6`,Math.min(44,18+t*1.2),i,t)}var Op=0,kp=0;function Ap(e,t=`#ffd24a`,n=0){let r=performance.now();r<Op&&n<kp||(kp=n,Op=n>0?r+2e3:0,fp.textContent=e,fp.style.color=t,fp.animate([{opacity:0,transform:`translate(-50%,-50%) scale(2.2) rotate(-8deg)`},{opacity:1,transform:`translate(-50%,-50%) scale(1) rotate(-3deg)`,offset:.15},{opacity:1,transform:`translate(-50%,-50%) scale(1.05) rotate(-3deg)`,offset:.75},{opacity:0,transform:`translate(-50%,-60%) scale(0.9) rotate(-3deg)`}],{duration:1400,easing:`ease-out`}))}function jp(e=.6){pp.animate([{opacity:e},{opacity:0}],{duration:260})}function Mp(){Lp();for(let e of Cp)e.el.remove();Cp.length=0}function Np(){cp.textContent=`0`,_p.style.opacity=`0`,xp.style.display=`none`,Sp.style.display=`none`}var Pp=0;function Fp(e){for(let t=Cp.length-1;t>=0;t--){let n=Cp[t];if(n.age+=e,wp.copy(n.p),wp.y+=n.age*20,wp.project(id),n.w===0){let e=n.el.offsetWidth,t=innerWidth-24;e>t&&(n.el.style.fontSize=`${Math.floor(parseFloat(n.el.style.fontSize)*t/e)}px`,e=t),n.w=e*.5+8}let r=Math.min(innerWidth*.5,n.w),i=Math.max(r,Math.min(innerWidth-r,(wp.x*.5+.5)*innerWidth+n.ox)),a=Math.max(innerWidth<600?330:170,Math.min(innerHeight-40,(-wp.y*.5+.5)*innerHeight+n.oy));n.el.style.transform=`translate(-50%,-50%) translate(${i}px, ${a}px) scale(${1+Math.max(0,.3-n.age)*2})`,n.el.style.opacity=String(n.age<.7?1:Math.max(0,1-(n.age-.7)/.5)),(n.age>1.2||wp.z>1)&&(n.el.remove(),Cp.splice(t,1))}if(Pp+=(+!!K.wet-Pp)*Math.min(1,e*6),yp.style.opacity=String(Pp),W.mode!==`play`){W.mode!==`paused`&&(xp.style.display=Sp.style.display=`none`,vp.style.opacity=`0`);return}if(G.damage!==Ip.dmg){Ip.dmg=G.damage;let e=Bf(G.damage);e!==Ip.dmgS&&(ip.textContent=Ip.dmgS=e)}let t=(1+Math.min(4,Math.floor(G.combo/8)))*(G.frenzy?2:1);(G.combo!==Ip.combo||t!==Ip.mlt)&&(Ip.combo=G.combo,Ip.mlt=t,op.data=G.combo>1?`${G.combo} HITS `:``,sp.textContent=G.combo>1&&t>1?`×${t}`:``,_p.style.opacity=G.combo>1?`1`:`0`);let n=G.comboT>1.85;if(n!==Ip.big&&(Ip.big=n,ap.style.transform=n?`scale(1.15)`:`scale(1)`),G.combo>1||Ip.cbar!==0){let e=Math.round(Math.max(0,G.comboT)/2*100)/100;e!==Ip.cbar&&(Ip.cbar=e,gp.style.transform=`scaleX(${e})`)}G.zap!==Ip.zap&&(G.zap>0!=Ip.zap>0&&(vp.style.opacity=G.zap>0?`1`:`0`),Ip.zap=G.zap,G.zap>0&&(vp.textContent=`${W.ability?.tallyLabel??`ZAP`} +${Bf(G.zap)}`));let r=Math.max(0,Math.ceil(G.time));r!==Ip.sec&&(Ip.sec=r,cp.textContent=String(r),cp.classList.toggle(`hurry`,G.time<W.level.frenzyAt));let i=Math.round(Math.max(0,G.patience)/q.patienceMax*200)/200;i!==Ip.pat&&(Ip.pat=i,lp.style.transform=`scaleX(${i})`,bp.classList.toggle(`low`,i<.3)),zp(xp,Qu.bi>=0?wp.set(Y.buildings[Qu.bi].x,Y.standing(Y.buildings[Qu.bi])+10,Y.buildings[Qu.bi].z):null,!0);let a=null;if(G.patience<q.patienceMax*.75){let e=1e9;for(let t of Zf){let n=t.g.visible?t.g.position.distanceTo(K.pos):1e9;n<e&&(e=n,a=Tp.copy(t.g.position).setY(60))}}zp(Sp,a,!1);let o=!!a&&G.patience<q.patienceMax*.4;o!==Ip.thirsty&&(Ip.thirsty=o,Sp.classList.toggle(`pulse`,o));let s=Math.round((G.ultraT>0?G.ultraT/q.ultraTime:G.ultra/100)*200)/200;s!==Ip.ult&&(Ip.ult=s,up.style.transform=`scaleX(${s})`);let c=G.ultra>=100;c!==Ip.full&&(Ip.full=c,dp.classList.toggle(`full`,c),hp.classList.toggle(`ready`,c))}var Ip={dmg:-1,dmgS:``,combo:-1,mlt:-1,big:!1,cbar:-1,zap:-1,sec:-1,pat:-1,ult:-1,full:!1,thirsty:!1};function Lp(){Ip.dmg=Ip.combo=Ip.mlt=Ip.cbar=Ip.zap=Ip.sec=Ip.pat=Ip.ult=-1,Ip.dmgS=``,Ip.big=Ip.full=!1,dp.classList.remove(`full`),hp.classList.remove(`ready`)}var Rp=new I;function zp(e,t,n){if(!t){e.style.display=`none`;return}Rp.copy(t).project(id);let r=Rp.x,i=Rp.y,a=Rp.z>1;a&&(r=-r,i=-i);let o=!a&&Math.abs(r)<.9&&Math.abs(i)<.85;if(o&&!n){e.style.display=`none`;return}e.style.display=`block`;let s=Math.PI;if(!o){s=Math.atan2(-i,r)+Math.PI/2;let e=.86/Math.max(Math.abs(r),Math.abs(i)/.9,.001);r*=e,i*=e,a&&Math.abs(i)<.3&&(i=-.86)}let c=innerWidth,l=innerHeight,u=Math.max(44,Math.min(c-44,(r*.5+.5)*c)),d=(-i*.5+.5)*l;if(!o){let e=c<600?340:230,t=document.body.classList.contains(`touch`);d=Math.max(e,Math.min(l-(t?70:90),d)),t&&u>c-250&&d>l-280&&(d=l-280),t&&u<c*.3&&d>l-120&&(d=l-120)}e.style.transform=`translate(${u}px, ${d}px)`,e.firstElementChild.style.transform=`translate(-50%,-50%) rotate(${s}rad)`;let f=u<110?`l`:u>c-110?`r`:`c`;e.dataset.side!==f&&(e.dataset.side=f,e.lastElementChild.style.transform=f===`l`?`translate(-24px, -64px)`:f===`r`?`translate(calc(-100% + 24px), -64px)`:``)}function Bp(){return Lf(G.combo)}function Vp(){G.combo++,G.combo>G.maxCombo&&(G.maxCombo=G.combo),G.comboT=2,U.emit(`comboHit`,{combo:G.combo})}function Hp(e,t,n=``,r=!0){if(W.mode!==`play`)return;let i=e*Bp()*(G.frenzy?2:1)*W.level.valueMul;G.damage+=i,r&&e>=.1&&Vp(),G.ultraT<=0&&(G.ultra=Math.min(100,G.ultra+zf(e,q.ultraCharge))),!(!t||i<=.05)&&(U.emit(`damage`,{amount:i,label:n,x:t.x,y:t.y,z:t.z}),W.rig.look=-Math.max(-1,Math.min(1,((t.x-K.pos.x)*K.right.x+(t.z-K.pos.z)*K.right.z)/40)),n===`ZAP `&&G.ultraT>0?G.zap+=i:Dp(n,i,t))}function Up(e){if(W.mode!==`play`)return 0;let t=e*Bp()*(G.frenzy?2:1);return G.damage+=t,Vp(),t}function Wp(e,t=!1){let n=e[0].index!==null,r=new Set(Object.keys(e[0].attributes)),i=new Set(Object.keys(e[0].morphAttributes)),a={},o={},s=e[0].morphTargetsRelative,c=new Fr,l=0;for(let u=0;u<e.length;++u){let d=e[u],f=0;if(n!==(d.index!==null))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.`),null;for(let e in d.attributes){if(!r.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure "`+e+`" attribute exists among all geometries, or in none of them.`),null;a[e]===void 0&&(a[e]=[]),a[e].push(d.attributes[e]),f++}if(f!==r.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of attributes.`),null;if(s!==d.morphTargetsRelative)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. .morphTargetsRelative must be consistent throughout all geometries.`),null;for(let e in d.morphAttributes){if(!i.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`.  .morphAttributes must be consistent throughout all geometries.`),null;o[e]===void 0&&(o[e]=[]),o[e].push(d.morphAttributes[e])}if(t){let e;if(n)e=d.index.count;else if(d.attributes.position!==void 0)e=d.attributes.position.count;else return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. The geometry must have either an index or a position attribute`),null;c.addGroup(l,e,u),l+=e}}if(n){let t=0,n=[];for(let r=0;r<e.length;++r){let i=e[r].index;for(let e=0;e<i.count;++e)n.push(i.getX(e)+t);t+=e[r].attributes.position.count}c.setIndex(n)}for(let e in a){let t=Gp(a[e]);if(!t)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` attribute.`),null;c.setAttribute(e,t)}for(let e in o){let t=o[e][0].length;if(t===0)break;c.morphAttributes=c.morphAttributes||{},c.morphAttributes[e]=[];for(let n=0;n<t;++n){let t=[];for(let r=0;r<o[e].length;++r)t.push(o[e][r][n]);let r=Gp(t);if(!r)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` morphAttribute.`),null;c.morphAttributes[e].push(r)}}return c}function Gp(e){let t,n,r,i=-1,a=0;for(let o=0;o<e.length;++o){let s=e[o];if(t===void 0&&(t=s.array.constructor),t!==s.array.constructor)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.`),null;if(n===void 0&&(n=s.itemSize),n!==s.itemSize)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.`),null;if(r===void 0&&(r=s.normalized),r!==s.normalized)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.`),null;if(i===-1&&(i=s.gpuType),i!==s.gpuType)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.`),null;a+=s.count*n}let o=new t(a),s=new br(o,n,r),c=0;for(let t=0;t<e.length;++t){let r=e[t];if(r.isInterleavedBufferAttribute){let e=c/n;for(let t=0,i=r.count;t<i;t++)for(let i=0;i<n;i++){let n=r.getComponent(t,i);s.setComponent(t+e,i,n)}}else o.set(r.array,c);c+=r.count*n}return i!==void 0&&(s.gpuType=i),s}function Kp(){let e=(e,t,n,r,i,a)=>{let o=new ki(e,t,n).translate(0,r,i),s=new R(a),c=new Float32Array(o.attributes.position.count*3);for(let e=0;e<c.length;e+=3)c.set([s.r,s.g,s.b],e);return o.setAttribute(`color`,new br(c,3)),o};return Wp([e(3.4,1.8,7.4,.4,0,16777215),e(3,1.4,3.8,2,-.3,3159098),e(1.4,.6,.6,3,-.3,16777215)])}var X=new _d(Kp(),new B({vertexColors:!0,roughness:.5}),Zu.cars);J.add(X.mesh);var qp=new Uint8Array(Zu.cars),Jp=new Int8Array(Zu.cars),Yp=new Float32Array(Zu.cars),Xp=new Float32Array(Zu.cars),Zp=new R,Qp=new I;X.onLand=(e,t)=>{t>18&&(Ru(.4),Ad(X.pos[e*3],1,X.pos[e*3+2],2,14540253))};function $p(e,t,n,r){let i=X.state[e];return i!==ld.Kinematic&&i!==ld.Resting?!1:(X.launch(e,t,n,r,9),i===ld.Kinematic&&(G.taxis++,Hp(.04,Qp.fromArray(X.pos,e*3),`TAXI `)),!0)}function em(e,t,n,r){let i=0;for(let a=0;a<X.n;a++){let o=a*3,s=X.pos[o]-e,c=X.pos[o+2]-t,l=Math.hypot(s,c)||1;l<n&&(r(s,c,l,Qp),$p(a,Qp.x,Qp.y,Qp.z)&&i++)}return i}function tm(){let e=Y.n,t=Y.half,n=W.level.world.theme,r=Math.min(Zu.cars,W.level.cars);X.n=0;for(let i=0;i<r;i++){qp[i]=Math.random()<.5?0:1,Jp[i]=Math.random()<.5?-1:1,Xp[i]=Jp[i]*4.5,Yp[i]=16+Math.random()*10;let r=Y.streetAt(Math.floor(Math.random()*(e+1))),a=(Math.random()-.5)*2*(t-10),o=qp[i]===0?r+Xp[i]:a,s=qp[i]===0?a:r+Xp[i],c=Math.random()<n.taxiShare;X.add(o,.5,s,1,1,1,Zp.set(c?n.taxiColor:n.carColors[i%n.carColors.length]),qp[i]===0?Jp[i]>0?0:Math.PI:Jp[i]>0?Math.PI/2:-Math.PI/2),X.state[i]=ld.Kinematic}X.mesh.count=X.n,X.mesh.instanceColor&&(X.mesh.instanceColor.needsUpdate=!0)}function nm(e){let t=Y.n,n=Y.half,r=Y.block;for(let i=0;i<X.n;i++){if(X.state[i]!==ld.Kinematic)continue;let a=i*3,o=Math.hypot(X.pos[a]-K.pos.x,X.pos[a+2]-K.pos.z)<90,s=Yp[i]*(o?1.8:1)*e*Jp[i],c=qp[i]===0?2:0,l=X.pos[a+c];X.pos[a+c]+=s;let u=X.pos[a+c];for(let e=1;e<t;e++){let t=Y.streetAt(e);if((l-t)*(u-t)<=0&&Math.random()<.35){let e=qp[i]^1;qp[i]=e,Jp[i]=Math.random()<.5?-1:1,Xp[i]=Jp[i]*4.5,e===0?X.pos[a]=t+Xp[i]:X.pos[a+2]=t+Xp[i];break}}let d=n-6;if(Math.abs(X.pos[a+(qp[i]===0?2:0)])>d){Jp[i]=-Jp[i],Xp[i]=-Xp[i];let e=qp[i]===0?0:2;X.pos[a+e]=Math.round((X.pos[a+e]+n)/r)*r-n+Xp[i],X.pos[a+(qp[i]===0?2:0)]=Math.sign(X.pos[a+(qp[i]===0?2:0)])*(d-1)}let f=qp[i]===0?Jp[i]>0?0:Math.PI:Jp[i]>0?Math.PI/2:-Math.PI/2;X.rot[i*4]=0,X.rot[i*4+1]=Math.sin(f/2),X.rot[i*4+2]=0,X.rot[i*4+3]=Math.cos(f/2),X.write(i)}X.step(e)}var rm=Zu.people,im=new hi(new Ai(.8,1.6,2,6),new B({roughness:1}),rm);im.frustumCulled=!1,J.add(im);var am=new Float32Array(rm*3),om=new Float32Array(rm*3),sm=new Float32Array(rm),cm=rm,lm=new R,um=new an,dm=new an().makeRotationX(.35);function fm(){cm=Math.min(rm,W.level.people),im.count=cm;let e=Y.n,t=Y.half,n=Y.street;lm.set(0);for(let r=0;r<cm;r++){let i=Math.floor(Math.random()*(e+1)),a=(Math.random()-.5)*2*t,o=(Math.random()<.5?-1:1)*(n/2-2-Math.random()*4),s=Math.random()<.5,c=Y.streetAt(i)+o;am[r*3]=s?c:a,am[r*3+1]=0,am[r*3+2]=s?a:c,om.fill(0,r*3,r*3+3),sm[r]=Math.random()*10,im.setColorAt(r,lm.setHSL(Math.random(),.6,.45+Math.random()*.2))}im.instanceColor&&(im.instanceColor.needsUpdate=!0)}function pm(e,t,n,r,i=0){for(let a=0;a<cm;a++){let o=a*3;Math.hypot(am[o]-e,am[o+2]-t)<n&&am[o+1]<1&&(om[o+1]=r+Math.random()*i)}}var mm=0;function hm(e,t){let n=0,r=Y.block,i=Y.half,a=(r-Y.street)/2;for(let o=0;o<cm;o++){let s=o*3,c=am[s]-K.pos.x,l=am[s+2]-K.pos.z,u=Math.hypot(c,l)||1,d=om[s],f=om[s+2];u<120?(n++,d+=(c/u*13-d)*e*3,f+=(l/u*13-f)*e*3):(d*=1-e,f*=1-e),am[s]+=d*e,am[s+2]+=f*e,om[s+1]-=50*e,am[s+1]=Math.max(0,am[s+1]+om[s+1]*e),am[s+1]===0&&(om[s+1]=0);let p=((am[s]+i)%r+r)%r-r/2,m=((am[s+2]+i)%r+r)%r-r/2;Math.abs(p)<a&&Math.abs(m)<a&&(a-Math.abs(p)<a-Math.abs(m)?am[s]+=Math.sign(p)*a-p:am[s+2]+=Math.sign(m)*a-m);let h=i-2;am[s]=Math.max(-h,Math.min(h,am[s])),am[s+2]=Math.max(-h,Math.min(h,am[s+2])),om[s]=d,om[s+2]=f;let g=Math.hypot(d,f)>3,_=g?Math.abs(Math.sin(t*14+sm[o]))*.8:0;um.makeRotationY(Math.atan2(d,f)),g&&um.multiply(dm),um.setPosition(am[s],am[s+1]+1.6+_,am[s+2]),im.setMatrixAt(o,um)}im.instanceMatrix.needsUpdate=!0,mm-=e,n>10&&mm<0&&W.mode===`play`&&(Uu(),mm=.4+Math.random()*1.2)}var gm=!1,_m=[];function vm(){if(!gm){gm=!0;for(let e of a.all())e.init()}}function ym(e){vm();for(let e of a.all())e.clear();_m.length=0;for(let t of e.enemies){if(!a.has(t.type))continue;let n=a.get(t.type);n.begin(t,e),_m.includes(n)||_m.push(n)}if(e.boss&&a.has(e.boss.type)){let t=a.get(e.boss.type);_m.includes(t)||(t.begin(null,e),_m.push(t))}}function bm(){for(let e of a.all())e.clear();_m.length=0}function xm(){return _m}function Sm(e,t){for(let n=0;n<_m.length;n++)_m[n].update(e,t)}function Cm(e){for(let t=0;t<_m.length;t++)_m[t].onSwat?.(e)}function wm(e,t){for(let n=0;n<_m.length;n++)_m[n].onPounceAir?.(e,t)}function Tm(e,t,n){for(let r=0;r<_m.length;r++)_m[r].onPounceLand?.(e,t,n)}function Em(e,t){for(let n=0;n<_m.length;n++)_m[n].onLaser?.(e,t)}function Dm(e,t,n){for(let r=0;r<_m.length;r++)_m[r].onLaserSweep?.(e,t,n)}function Om(e){for(let t=0;t<_m.length;t++)_m[t].onBlast?.(e)}function km(){for(let e=0;e<_m.length;e++)_m[e].onFrenzy?.()}function Am(e,t,n=!1){G.kills[e]=(G.kills[e]??0)+1,e===`heli`&&(G.helis++,U.emit(`heliSwatted`,{count:G.helis})),U.emit(`enemyKilled`,{type:e,boss:n,x:t.x,y:t.y,z:t.z,count:G.kills[e]}),n&&(G.bossDefeated=!0,U.emit(`bossDefeated`,{type:e}))}var jm=new Set,Mm={x:0,y:0,active:!1,id:-1,ox:0,oy:0},Nm={zoom:!1},Pm=e=>document.getElementById(e);function Fm(){Mm.active=!1,Mm.x=Mm.y=0,Pm(`knob`).style.display=`none`}function Im(){Nm.zoom=!1,Fm(),jm.clear()}function Lm(e){let t=0,n=0;(jm.has(`KeyW`)||jm.has(`ArrowUp`))&&(n+=1),(jm.has(`KeyS`)||jm.has(`ArrowDown`))&&--n,(jm.has(`KeyA`)||jm.has(`ArrowLeft`))&&--t,(jm.has(`KeyD`)||jm.has(`ArrowRight`))&&(t+=1),Mm.active&&(t+=Mm.x,n-=Mm.y),e.x=t,e.z=n}var Rm=()=>jm.has(`ShiftLeft`)||jm.has(`ShiftRight`)||Nm.zoom;function zm(e){addEventListener(`keydown`,t=>{t.repeat||(jm.add(t.code),Ou(),(t.code===`KeyJ`||t.code===`KeyF`)&&e.swat(),(t.code===`Space`||t.code===`KeyK`)&&(t.preventDefault(),e.pounce()),(t.code===`KeyE`||t.code===`KeyL`||t.code===`KeyQ`)&&e.ultra())}),addEventListener(`keyup`,e=>jm.delete(e.code)),nd.domElement.addEventListener(`pointerdown`,t=>{Ou(),t.pointerType===`mouse`&&(t.button===0&&e.swat(),t.button===2&&e.pounce())}),nd.domElement.addEventListener(`contextmenu`,e=>e.preventDefault()),td&&document.body.classList.add(`touch`);let t=Pm(`stick`),n=Pm(`knob`);t.addEventListener(`pointerdown`,e=>{Ou(),Mm.active=!0,Mm.id=e.pointerId,Mm.ox=e.clientX,Mm.oy=e.clientY,n.style.display=`block`,n.style.left=`${e.clientX}px`,n.style.top=`${e.clientY-t.getBoundingClientRect().top}px`;try{t.setPointerCapture(e.pointerId)}catch{}}),t.addEventListener(`pointermove`,e=>{if(!Mm.active||e.pointerId!==Mm.id)return;let t=e.clientX-Mm.ox,r=e.clientY-Mm.oy,i=Math.hypot(t,r),a=Math.min(1,i/55)/(i||1);Mm.x=t*a,Mm.y=r*a,n.firstElementChild.style.transform=`translate(${Mm.x*35}px, ${Mm.y*35}px)`}),t.addEventListener(`pointerup`,Fm),t.addEventListener(`pointercancel`,Fm);let r=(e,t)=>Pm(e).addEventListener(`pointerdown`,e=>{e.preventDefault(),Ou(),t()});r(`tbSwat`,e.swat),r(`tbPounce`,e.pounce),r(`tbUltra`,e.ultra);let i=Pm(`tbZoom`);i.addEventListener(`pointerdown`,e=>{Nm.zoom=!0;try{i.setPointerCapture(e.pointerId)}catch{}});for(let e of[`pointerup`,`pointerleave`,`pointercancel`])i.addEventListener(e,()=>Nm.zoom=!1);addEventListener(`blur`,Im),document.addEventListener(`visibilitychange`,()=>document.hidden&&Im())}var Bm=new I,Vm=new I,Hm=new I,Um={x:0,z:0},Wm={x:0,z:0,strike:Hm,fwd:K.fwd,right:K.right,side:1,radius:17,power:1},Gm=new Map,Km=0,qm=!1,Jm=!1;function Ym(e){let t=Gm.get(e.id);t||(t=e.build(),Gm.set(e.id,t)),W.rig&&W.rig!==t&&J.remove(W.rig.root),t.root.parent||J.add(t.root),W.rig=t,W.cat=e,W.ability=e.ultra,t.root.scale.setScalar(q.scale)}function Xm(){K.pos.set(Y.spawn.x,0,Y.spawn.z),K.heading=Y.spawn.heading,K.speed=0,K.vel.set(0,0,0),K.air=!1,K.y=0,K.vy=0,K.stun=0,nh=-1,eh=0,th=0,K.wet=0,K.tugX=K.tugZ=0,K.slow=1,K.swipeCd=K.pounceCd=0,W.camYaw=K.heading,W.rig&&(W.rig.ultra=!1)}var Zm={amount:0,source:``},Qm=9,$m=18,eh=0,th=0,nh=-1,rh=1.5;function ih(e,t=`water`){if(W.mode!==`play`||G.bossDefeated&&W.level.boss?.endsLevel)return;G.elapsed<th&&(th=G.elapsed),eh=Math.max(0,eh-(G.elapsed-th)*Qm),th=G.elapsed;let n=e*q.wetResist,r=Math.max(0,$m-eh);n>r&&(n=r+(n-r)*.35),eh+=n,G.patience-=n,K.wet=1,Zm.amount=n,Zm.source=t,U.emit(`patienceHit`,Zm)}function ah(e,t=`cucumber`){if(W.mode!==`play`)return;let n=e*q.stunResist;n<=K.stun||K.stun<=0&&G.elapsed>=nh-.01&&G.elapsed<nh+rh&&nh>=0||(K.stun=n,nh=G.elapsed+n,W.rig.scare=1,Vu(),U.emit(`startled`,{seconds:n,source:t}))}function oh(e,t){K.tugX+=e,K.tugZ+=t}function sh(e){K.slow=Math.min(K.slow,e)}function ch(){if(K.swipeCd>0||W.mode!==`play`||K.stun>0)return;let e=W.rig,t=K.fwd,n=K.right;K.swipeCd=G.frenzy?q.swatCd*.5:q.swatCd,Od.swat=1,e.swipeSide=-e.swipeSide,e.swipe=1,zu();let r=e.swipeSide,i=K.pos.x+t.x*q.swatReach+n.x*r*9,a=K.pos.z+t.z*q.swatReach+n.z*r*9,o=Hm.set(i,30+K.y,a),s=Kf(i,a,q.swatRadius,5+K.y,52+K.y,(e,i,a,o)=>o.set(t.x*70-n.x*r*35+(Math.random()-.5)*20,22+Math.random()*18,t.z*70-n.z*r*35+(Math.random()-.5)*20))*q.swatPower;s>0&&(Hp(s,o),kd(.25),G.hitStop=.035,Iu(.5),jp(.25)),em(i,a,20,(e,i,a,o)=>o.set(t.x*80-n.x*r*30,40,t.z*80-n.z*r*30)),pm(i,a,18,18),Wm.x=i,Wm.z=a,Wm.side=r,Wm.radius=q.swatRadius,Wm.power=q.swatPower,Cm(Wm),W.cat.hooks?.onSwat?.(i,a),U.emit(`swat`,{x:i,z:a,hit:s>0})}function lh(){K.pounceCd>0||K.air||W.mode!==`play`||K.stun>0||(K.pounceCd=G.frenzy?q.pounceCd*.35:q.pounceCd,K.air=!0,K.vy=q.pounceJump,K.vel.copy(K.fwd).multiplyScalar(q.pounceFwd),Bu(`short`,W.cat.voice),U.emit(`pounce`,Xu))}function uh(){K.air=!1,K.y=0,K.vy=0;let e=W.rig;e.squash=1,kd(.7),G.hitStop=.07,Iu(1.8),Od.shock=1,Od.fov=1;let t=K.pos.x,n=K.pos.z,r=q.pounceR/32;Dd.position.set(t,1.2,n);let i=Kf(t,n,q.pounceR,0,80,qf(t,n,55,30,25))*q.swatPower;i>0&&Hp(i,Vm.set(t,40,n),`POUNCE `);for(let e=0;e<26;e++){let r=e/26*Math.PI*2;bd.spawn(t+Math.cos(r)*14,1.5,n+Math.sin(r)*14,Math.cos(r)*70,3,Math.sin(r)*70,1.2,4,13222582,0,1.5)}em(t,n,55*r,(e,t,n,r)=>r.set(e/n*40,45+Math.random()*20,t/n*40)),pm(t,n,70*r,22,10);let a=Y.trees;for(let e=0;e<a.n;e++){let i=e*3,o=a.pos[i]-t,s=a.pos[i+2]-n,c=Math.hypot(o,s)||1;c<45*r&&a.state[e]===ld.Static&&a.launch(e,o/c*40,35,s/c*40,6)}Tm(t,n,q.pounceR),W.cat.hooks?.onPounceLand?.(t,n),U.emit(`pounceLand`,{x:t,z:n,money:i}),U.emit(`bigHit`,{strength:.7})}function dh(){if(G.ultra<100||G.ultraT>0||W.mode!==`play`||!W.ability)return;let e=W.ability;G.ultra=0,G.ultraT=q.ultraTime,G.zap=0,W.rig.ultra=!0,Bu(`ultra`,W.cat.voice),e.start(),Ap(e.name,e.color),jp(.8),kd(.5),U.emit(`ultraStart`,{ability:e.id})}function fh(){let e=W.ability,t=G.ultraT>0||W.rig?.ultra;if(G.ultraT=0,W.rig&&(W.rig.ultra=!1),!e||!t)return;e.stop();let n=G.zap;G.zap=0,U.emit(`ultraEnd`,{ability:e.id,tally:n})}function ph(e,t){G.ultraT<=0||(G.ultraT-=e,G.zapComboT-=e,G.ultraT<=0||W.mode!==`play`?fh():W.ability.update(e,t))}function mh(e){let t=W.rig,n=K.fwd,r=K.right,i=W.mode===`play`;Um.x=0,Um.z=0,i&&K.stun<=0&&Lm(Um);let a=Um.x,o=Um.z;K.stun=Math.max(0,K.stun-e);let s=Math.min(1,Math.hypot(a,o)),c=i&&K.stun<=0&&Rm();c!==qm&&i&&(qm=c,U.emit(`zoomies`,{on:c}));let l=(c?q.zoom:q.walk)*(G.ultraT>0&&W.ability?W.ability.moveMul:1)*K.slow;if(K.air)K.vy-=190*e,K.y+=K.vy*e,Vm.set(K.pos.x,q.headY+K.y,K.pos.z),wm(Vm,35),K.y<=0&&uh();else{if(s>.1){let t=W.camYaw,n=Math.sin(t)*o-Math.cos(t)*a,r=Math.cos(t)*o+Math.sin(t)*a,i=Math.atan2(n,r)-K.heading;i=Math.atan2(Math.sin(i),Math.cos(i)),K.heading+=Math.sign(i)*Math.min(Math.abs(i),q.turn*e),K.speed+=(l*s-K.speed)*Math.min(1,e*5)}else K.speed+=(0-K.speed)*Math.min(1,e*6);W.mode===`title`&&(K.speed=9,K.heading=0,K.pos.z>Y.spawn.z+480&&(K.pos.z=Y.spawn.z)),n.set(Math.sin(K.heading),0,Math.cos(K.heading)),K.vel.copy(n).multiplyScalar(K.speed)}n.set(Math.sin(K.heading),0,Math.cos(K.heading)),r.set(-n.z,0,n.x),K.pos.addScaledVector(K.vel,e),K.pos.x+=K.tugX*e,K.pos.z+=K.tugZ*e,K.tugX=K.tugZ=0,K.slow=1,i&&!K.air&&K.speed>2&&(Km+=K.speed*e,Km>q.walk&&(Km=0,U.emit(`moved`,{distance:q.walk})));let u=q.radius,d=!1;G.bonkT-=e;for(let e of Y.buildings){if(Uf(e,K.pos.x,K.pos.z)>u)continue;let r=Y.standing(e);if(r<=14||K.y>r)continue;if(c&&K.speed>q.walk+5||K.air){let e=Kf(K.pos.x,K.pos.z,u+2,0,40+K.y,(e,t,r,i)=>i.set(n.x*60+(Math.random()-.5)*30,25+Math.random()*20,n.z*60+(Math.random()-.5)*30));e>0&&(Hp(e,Vm.set(K.pos.x,30,K.pos.z),`ZOOM `),kd(.2));continue}if(d=!0,K.speed>20&&G.bonkT<=0&&i){G.bonkT=.4;let e=Kf(K.pos.x,K.pos.z,u+2,0,14,(e,t,r,i)=>i.set(n.x*45+(Math.random()-.5)*20,18+Math.random()*10,n.z*45+(Math.random()-.5)*20));e>0&&(Hp(e,Vm.set(K.pos.x+n.x*14,24,K.pos.z+n.z*14),`BONK `),kd(.15),t.squash=.4)}let a=Math.max(e.x-e.hx,Math.min(e.x+e.hx,K.pos.x)),o=Math.max(e.z-e.hz,Math.min(e.z+e.hz,K.pos.z)),s=K.pos.x-a,l=K.pos.z-o,f=Math.hypot(s,l);f<.001&&(s=K.pos.x-e.x,l=K.pos.z-e.z,f=Math.hypot(s,l)||1),K.pos.x=a+s/f*u,K.pos.z=o+l/f*u}let f=Y.half;if(i&&(G.blockedT=d?G.blockedT+e:Math.max(0,G.blockedT-e*2),G.blockedT>1&&!Jm&&(Jm=!0,Ap(document.body.classList.contains(`touch`)?`HOLD ZOOM TO BULLDOZE`:`HOLD SHIFT TO BULLDOZE`,`#4cc3ff`)),Math.max(Math.abs(K.pos.x),Math.abs(K.pos.z))>f-52)){let t=Math.hypot(K.pos.x,K.pos.z)||1;K.pos.x-=K.pos.x/t*20*e,K.pos.z-=K.pos.z/t*20*e}let p=f-12;K.pos.x=Math.max(-p,Math.min(p,K.pos.x)),K.pos.z=Math.max(-p,Math.min(p,K.pos.z)),K.speed>8&&!K.air&&hh();let m=Y.trees;for(let e=0;e<m.n;e++){if(m.state[e]!==ld.Static)continue;let t=e*3;Math.hypot(m.pos[t]-K.pos.x,m.pos[t+2]-K.pos.z)<u+3&&(m.launch(e,n.x*40,25,n.z*40,6),Hp(.01,null))}t.root.position.set(K.pos.x,K.y,K.pos.z),t.root.rotation.y=K.heading,t.shake=Math.max(t.shake,K.wet),t.animate(e,performance.now()/1e3,K.air?0:K.speed,K.air),K.swipeCd-=e,K.pounceCd-=e}function hh(){let e=K.fwd;for(let t=0;t<X.n;t++){let n=t*3;Math.hypot(X.pos[n]-K.pos.x-e.x*12,X.pos[n+2]-K.pos.z-e.z*12)<13&&X.pos[n+1]<3&&$p(t,e.x*(40+K.speed)+(Math.random()-.5)*30,28+K.speed*.4,e.z*(40+K.speed)+(Math.random()-.5)*30)&&Iu(.3)}}function gh(e,t,n,r,i,a=`ultra`,o=r){let s=Kf(e,t,n,0,90,qf(e,t,55*r,30,25))*r;return s>0&&Hp(s,Bm.set(e,40,t),i),em(e,t,n*1.6,(e,t,n,i)=>i.set(e/n*45*r,45+Math.random()*20,t/n*45*r)),pm(e,t,n*2,22,10),Om({x:e,z:t,r:n,power:o,source:a}),s}var _h=e=>`#${e.toString(16).padStart(6,`0`)}`;function vh(e){let t=m(e);J.background.setHex(e.sky);let n=J.fog;n.color.setHex(e.sky),n.near=e.fogNear,n.far=e.fogFar,ad.color.setHex(e.hemiSky),ad.groundColor.setHex(e.hemiGround),ad.intensity=e.hemiIntensity,od.color.setHex(e.sunColor),od.intensity=e.sunIntensity,nd.toneMappingExposure=e.exposure,Y.win.uLit.value=e.windowLit,Y.win.uGlass.value.setHex(e.windowGlass),Y.win.uGlow.value.setHex(e.windowGlow),Y.win.uGlow2.value.setHex(t.glow2),Y.win.uEmit.value=t.emit,document.querySelector(`meta[name="theme-color"]`)?.setAttribute(`content`,_h(e.sky)),document.body.style.background=_h(e.sky)}var yh=new I,bh=new I,xh=new I,Sh=new I,Ch=new I,wh=.45,Th={x:0,z:0,want:0,w:0},Eh=55;function Dh(e){let t=W.mode;if(t===`play`&&!K.air){let t=K.heading-W.camYaw;t=Math.atan2(Math.sin(t),Math.cos(t)),W.camYaw+=t*Math.min(1,e*(K.speed>2?G.ultraT>0?1.4:2.2:.6))}t===`play`&&(W.intro=Math.min(1,W.intro+e*.8));let n=W.intro,r=n*n*(3-2*n),i=W.camYaw,a=q.scale,o=G.ultraT>0&&!!W.ability?.camWide,s=o?70:85,c=yh.set(K.pos.x+Math.sin(i)*s,(o?30:45)*(id.aspect<1?.2:1)*a+K.y*.6,K.pos.z+Math.cos(i)*s),l=t===`over`?Math.min(1,(performance.now()-W.overAt)/1600):0,u=id.aspect<1;Th.w+=(Th.want-Th.w)*Math.min(1,e*2.5),Th.want=0;let d=t===`play`||t===`over`?Th.w:0;d>.001&&(c.x+=(Th.x-c.x)*.45*d,c.z+=(Th.z-c.z)*.45*d);let f=((o?120:110)*a+l*90+d*70)*(u?1.3:1);wh+=((o?u?.5:.8:u?.18:.45)-wh)*Math.min(1,e*3);let p=i+wh;bh.set(K.pos.x-Math.sin(p)*f,(o?115:105)*a+K.y*.5+l*80+d*60,K.pos.z-Math.cos(p)*f);let m=performance.now()/1e3;xh.set(K.pos.x+Math.sin(K.heading)*95*a+Math.sin(m*.3)*8,5,K.pos.z+Math.cos(K.heading)*95*a),Sh.set(K.pos.x,40*a,K.pos.z),id.position.lerpVectors(xh,bh,r),Ch.lerpVectors(Sh,c,r);let h=G.trauma*G.trauma;id.position.x+=(Math.random()-.5)*h*6,id.position.y+=(Math.random()-.5)*h*6,id.position.z+=(Math.random()-.5)*h*6,id.lookAt(Ch);let g=t===`play`&&K.speed>q.walk+5;Eh+=((g?63:55)+(id.aspect<1?16:0)-Eh)*Math.min(1,e*4),Od.fov=Math.max(0,Od.fov-e*4),id.fov=Eh+Math.sin(Od.fov*Math.PI)*7,id.updateProjectionMatrix(),G.trauma=Math.max(0,G.trauma-e*1.6),od.position.set(K.pos.x+80,160,K.pos.z+50),od.target.position.set(K.pos.x,0,K.pos.z)}var Oh=[];function kh(e){return Oh.push(e),()=>{let t=Oh.indexOf(e);t>=0&&Oh.splice(t,1)}}var Ah=performance.now(),jh=0,Mh=0;function Nh(e){requestAnimationFrame(Nh);let t=Math.min(.05,(e-Ah)/1e3);Ah=e;let n=e/1e3;if(W.mode===`paused`){for(let e=0;e<Oh.length;e++)Oh[e](0,n);(jh++<2||jh%15==0)&&nd.render(J,id)}else{jh=0,G.hitStop>0&&(G.hitStop-=t,t*=.08),n_(t),mh(t),nm(t),hm(t,n),K.wet=0,Sm(t,n),K.wet&&Math.random()<.6&&Sd.spawn(K.pos.x+(Math.random()-.5)*24,30+Math.random()*20,K.pos.z+(Math.random()-.5)*30,0,-5,0,.8,1.2,4175103,-60,0),np(t,n),ph(t,n),Wg(t,n),Y.segs.step(t),Y.trees.step(t),Md(t),Dh(t),Fp(t),Nd(t,W.rig.swipeSide);for(let e=0;e<Oh.length;e++)Oh[e](t,n);(W.mode!==`title`||Mh++%2!=1)&&nd.render(J,id)}}function Ph(){Ah=performance.now(),requestAnimationFrame(Nh)}var Fh=null,Ih=null,Lh=null,Rh=null,zh=null,Bh={siren:0,hose:0,vac:0,vacPitch:1};ku(e=>{let t=e.ctx,n=t.createOscillator();n.type=`square`,n.frequency.value=700;let r=t.createOscillator();r.type=`square`,r.frequency.value=1.6;let i=t.createGain();i.gain.value=140,r.connect(i).connect(n.frequency);let a=t.createBiquadFilter();a.type=`bandpass`,a.frequency.value=1100,a.Q.value=1.2,Fh=t.createGain(),Fh.gain.value=0,n.connect(a).connect(Fh).connect(e.sfx),n.start(),r.start()}),ku(e=>{let t=e.ctx,n=t.createBufferSource();n.buffer=e.noiseBuf,n.loop=!0;let r=t.createBiquadFilter();r.type=`bandpass`,r.frequency.value=1800,r.Q.value=.7,Ih=t.createGain(),Ih.gain.value=0,n.connect(r).connect(Ih).connect(e.sfx),n.start()}),ku(e=>{let t=e.ctx;Rh=t.createOscillator(),Rh.type=`sawtooth`,Rh.frequency.value=520,zh=t.createOscillator(),zh.type=`sawtooth`,zh.frequency.value=527;let n=t.createBiquadFilter();n.type=`lowpass`,n.frequency.value=2400;let r=t.createGain();r.gain.value=.25;let i=t.createBufferSource();i.buffer=e.noiseBuf,i.loop=!0;let a=t.createBiquadFilter();a.type=`highpass`,a.frequency.value=900,Lh=t.createGain(),Lh.gain.value=0,Rh.connect(n),zh.connect(n),n.connect(r).connect(Lh),i.connect(a).connect(Lh),Lh.connect(e.sfx),Rh.start(),zh.start(),i.start()});function Vh(e,t,n,r){let i=Au(),a=Math.max(0,Math.min(n,t));!e||!i||Math.abs(a-Bh[r])<.004||(Bh[r]=a,e.gain.setTargetAtTime(a,i.ctx.currentTime,.12))}var Hh=e=>Vh(Fh,e*.07,.07,`siren`),Uh=e=>Vh(Ih,e*.12,.12,`hose`);function Wh(e,t=1){Vh(Lh,e*.09,.09,`vac`);let n=Au();!n||!Rh||!zh||Math.abs(t-Bh.vacPitch)<.01||(Bh.vacPitch=t,Rh.frequency.setTargetAtTime(520*t,n.ctx.currentTime,.2),zh.frequency.setTargetAtTime(527*t,n.ctx.currentTime,.2))}function Gh(){let e=Au();if(!e)return;H(`square`,180,.12,.12,{to:900});let t=Mu(.12),n=e.ctx.createBiquadFilter();n.type=`bandpass`,n.frequency.setValueAtTime(600,e.ctx.currentTime),n.frequency.exponentialRampToValueAtTime(3e3,e.ctx.currentTime+.1);let r=e.ctx.createGain();Nu(r,.18,.005,.1),t.connect(n).connect(r).connect(e.sfx)}function Kh(e=1.1){Au()&&H(`sine`,1900,e,.05,{to:700,attack:.1})}function qh(e=1){let t=Au();if(!t)return;let n=t.ctx,r=n.currentTime,i=n.createOscillator();i.type=`sine`,i.frequency.setValueAtTime(220*e,r),i.frequency.exponentialRampToValueAtTime(520*e,r+.08),i.frequency.exponentialRampToValueAtTime(260*e,r+.35);let a=n.createOscillator();a.frequency.value=22;let o=n.createGain();o.gain.value=40*e,a.connect(o).connect(i.frequency);let s=n.createGain();Nu(s,.22,.005,.38),i.connect(s).connect(t.sfx),i.start(r),i.stop(r+.45),a.start(r),a.stop(r+.45)}function Jh(e=1){let t=Au();if(!t)return;let n=t.ctx,r=Mu(.3),i=n.createBiquadFilter();i.type=`lowpass`,i.frequency.setValueAtTime(2400,n.currentTime),i.frequency.exponentialRampToValueAtTime(200,n.currentTime+.25);let a=n.createGain();Nu(a,Math.min(.5,.25*e),.003,.25),r.connect(i).connect(a).connect(t.sfx),H(`sine`,140,.15,.2*e,{to:60})}function Yh(e=1){if(Au()){for(let t of[1200,1730,2650])H(`triangle`,t*e*(.97+Math.random()*.06),.25,.06);H(`square`,160*e,.08,.1,{to:90})}}function Xh(){let e=Au();if(!e)return;let t=e.ctx;for(let n=0;n<2;n++){let r=t.currentTime+n*.18,i=t.createOscillator();i.type=`sawtooth`,i.frequency.setValueAtTime(320,r),i.frequency.exponentialRampToValueAtTime(140,r+.14);let a=t.createBiquadFilter();a.type=`bandpass`,a.Q.value=3,a.frequency.setValueAtTime(1400,r),a.frequency.exponentialRampToValueAtTime(500,r+.14);let o=t.createOscillator();o.type=`square`,o.frequency.value=70;let s=t.createGain();s.gain.value=0,o.connect(s.gain);let c=t.createGain();Nu(c,.5,.01,.16,r),i.connect(a).connect(s).connect(c).connect(e.sfx),i.start(r),i.stop(r+.22),o.start(r),o.stop(r+.22)}}function Zh(e=.7){Au()&&(H(`sawtooth`,70,e,.18,{to:120,attack:.08}),H(`square`,52,e,.08,{to:80,attack:.08}))}function Qh(){let e=Au();if(!e)return;let t=e.ctx.currentTime;for(let e=0;e<3;e++)H(`square`,520,.22,.1,{at:t+e*.5}),H(`square`,390,.22,.1,{at:t+e*.5+.25})}function $h(){Au()&&(H(`sawtooth`,900,1.6,.16,{to:40}),H(`square`,450,1.4,.06,{to:30}))}function eg(){Au()&&(H(`square`,1200,.35,.08,{to:120}),H(`sine`,300,.2,.15,{to:80}))}function tg(){let e=Au();if(!e)return;let t=e.ctx,n=Mu(1.6),r=t.createBiquadFilter();r.type=`bandpass`,r.Q.value=.9,r.frequency.setValueAtTime(400,t.currentTime),r.frequency.exponentialRampToValueAtTime(2200,t.currentTime+.8),r.frequency.exponentialRampToValueAtTime(300,t.currentTime+1.6);let i=t.createGain();i.gain.setValueAtTime(1e-4,t.currentTime),i.gain.exponentialRampToValueAtTime(.25,t.currentTime+.7),i.gain.exponentialRampToValueAtTime(1e-4,t.currentTime+1.6),n.connect(r).connect(i).connect(e.sfx)}function ng(e=3){Au()&&H(`sawtooth`,200,e,.08,{to:900,attack:.3})}function rg(){let e=Au();if(!e)return;let t=e.ctx.currentTime;H(`square`,330,.15,.08,{at:t}),H(`square`,247,.4,.08,{at:t+.17,to:180})}var ig={n:0,dt:1/60},ag={siren:0,hose:0,vac:0,vacPitch:1,vacBest:0};function og(e,t){e>ag.vacBest&&(ag.vacBest=e,ag.vacPitch=t),ag.vac=Math.max(ag.vac,e)}kh(e=>{ig.n++,e>0&&(ig.dt=e);let t=W.mode===`play`;Hh(t?ag.siren:0),Uh(t?ag.hose:0),Wh(t?ag.vac:0,ag.vacPitch),ag.siren=ag.hose=ag.vac=ag.vacBest=0});var sg={nx:0,nz:1,d:0};function cg(e,t){let n=Math.hypot(e,t);return sg.d=n,n>1e-4?(sg.nx=e/n,sg.nz=t/n):(sg.nx=K.fwd.x,sg.nz=K.fwd.z),n}function lg(e,t,n,r,i,a=34){return cg(t-e.x,r-e.z)>e.radius+i?!1:Math.abs(n-e.strike.y)<a+i||n<e.strike.y}function ug(e,t,n,r){let i=cg(t-e.x,n-e.z);return!(i>e.r+r||e.cone!==void 0&&e.dirX!==void 0&&e.dirZ!==void 0&&i>r&&sg.nx*e.dirX+sg.nz*e.dirZ<e.cone)}function dg(e,t,n,r,i,a){return cg(r-e,i-t)<=n+a}function fg(e,t,n,r,i){let a=e.x-t,o=e.y-n,s=e.z-r;return a*a+o*o+s*s>i*i?!1:(cg(t-K.pos.x,r-K.pos.z),!0)}function pg(e,t,n,r,i,a,o){let s=cg(r-e,i-t);return s>a||s<1?!1:Math.sin(n)*sg.nx+Math.cos(n)*sg.nz>o}function mg(e,t,n){return K.air||K.speed<=q.walk+5||W.mode!==`play`?!1:cg(e-K.pos.x,t-K.pos.z)<q.radius+n}function hg(e,t,n,r,i,a){let o=e.x-n,s=e.y-r,c=e.z-i;return o*o+s*s+c*c<(t+a)*(t+a)}function gg(e,t,n,r=1,i=_g){let a=Math.round(18*r);for(let o=0;o<a;o++)Cd.spawn(e,t,n,(Math.random()-.5)*50*r,Math.random()*40*r,(Math.random()-.5)*50*r,.7+Math.random()*.4,(1.6+Math.random()*2)*Math.sqrt(r),i[o%i.length],-12,1.6);for(let i=0;i<a/2;i++)xd.spawn(e,t,n,(Math.random()-.5)*60*r,20+Math.random()*40*r,(Math.random()-.5)*60*r,1.6,.8+Math.random()*1.5*r,i%2?3816772:9080729,-70);Ad(e,Math.max(2,t*.3),n,Math.round(3*r),12235430),kd(Math.min(1,.25*r)),r>=1&&Wu()}var _g=[16765514,16747050,16727614],vg=[16774048,10479871,16777215];function yg(e,t,n,r=10,i=vg){for(let a=0;a<r;a++)Cd.spawn(e,t,n,(Math.random()-.5)*60,10+Math.random()*40,(Math.random()-.5)*60,.35+Math.random()*.25,.6+Math.random()*.6,i[a%i.length],-80,.3)}function bg(e,t,n,r=16,i=40,a=4175103){for(let o=0;o<r;o++){let s=o/r*Math.PI*2;Sd.spawn(e,t,n,Math.cos(s)*i*(.7+Math.random()*.6),20+Math.random()*30,Math.sin(s)*i*(.7+Math.random()*.6),.6,1.4+Math.random(),a,-80,.6)}bd.spawn(e,t+1,n,0,2,0,.5,6,12576511,0,2.5)}function xg(){let e=W.cat?.color&&Number.parseInt(W.cat.color.replace(`#`,``),16)||16751164;for(let t=0;t<14;t++){let n=t/14*Math.PI*2;bd.spawn(K.pos.x+Math.cos(n)*10,q.headY*.6+K.y,K.pos.z+Math.sin(n)*10,Math.cos(n)*30,10+Math.random()*10,Math.sin(n)*30,.6,2.2,e,0,1.4)}}function Sg(e,t,n,r=4){let i=Y.buildings;for(let a=0;a<i.length;a++){let o=i[a];if(!(Math.abs(e-o.x)>o.hx+n||Math.abs(t-o.z)>o.hz+n)&&Y.segs.state[o.first]===ld.Static&&Y.standing(o)>r)return!0}return!1}function Cg(e,t,n,r){let i=Y.half-8,a=Math.max(-i,Math.min(i,e.x+t)),o=Math.max(-i,Math.min(i,e.z+n));if(!Sg(a,o,r)){e.x=a,e.z=o;return}if(!Sg(a,e.z,r)){e.x=a;return}if(!Sg(e.x,o,r)){e.z=o;return}let s=Y.streetAt(Math.max(0,Math.min(Y.n,Math.round((e.x+Y.half)/Y.block))));e.x+=Math.sign(s-e.x)*Math.min(Math.abs(s-e.x),Math.hypot(t,n)+.5)}function wg(e,t,n){let r=-1e9,i=Y.n;for(let a=0;a<24;a++){let a=Y.streetAt(1+Math.floor(Math.random()*(i-1))),o=Y.streetAt(1+Math.floor(Math.random()*(i-1))),s=Math.hypot(a-K.pos.x,o-K.pos.z),c=-Math.abs(s-t)+(Math.abs(s-t)<n?100:0)+Math.random()*20;c>r&&(r=c,e.set(a,0,o))}return e}function Tg(e,t,n,r){if(K.air||r<=0)return!1;let i=K.pos.x-e,a=K.pos.z-t,o=Math.hypot(i,a)||1,s=n+q.radius-o;return s<=0?!1:(K.tugX+=i/o*s/r,K.tugZ+=a/o*s/r,!0)}var Eg=e=>Y.standing(e),Dg={x:0,z:0,fx:0,fz:0,out:60},Og=(e,t,n,r)=>{let i=e-Dg.x,a=n-Dg.z,o=Math.hypot(i,a)||1;r.set(Dg.fx*Dg.out+i/o*Dg.out*.5,22+Math.random()*22,Dg.fz*Dg.out+a/o*Dg.out*.5)};function kg(e,t,n,r,i,a,o=60){return Dg.x=e,Dg.z=t,Dg.fx=i,Dg.fz=a,Dg.out=o,Kf(e,t,n,0,r,Og)}function Ag(e,t,n,r){let i=Y.buildings,a=-1,o=0;for(let s=0;s<i.length;s++){let c=i[s],l=Math.hypot(c.x-K.pos.x,c.z-K.pos.z);l<e||l>t||r(s)||Eg(c)<n||c.hx<6||c.hz<6||(o++,Math.random()*o<1&&(a=s))}return a}function jg(e,t){return Math.atan2(Math.sin(t-e),Math.cos(t-e))}function Mg(e,t,n,r){let i=jg(e,t);return e+Math.sign(i)*Math.min(Math.abs(i),n*r)}var Ng=()=>W.mode!==`play`||G.timeFrozen||G.frenzy||Fg.final,Pg=()=>Ng()||Fg.up,Fg={up:!1,final:!1},Ig=new z(new eo(1,.05,8,48),new Kr({color:16722490,transparent:!0,opacity:.8}));Ig.rotation.x=Math.PI/2;var Lg=new z(new ji(1,1,1,16,1,!0),new Kr({color:16722490,transparent:!0,opacity:.4,depthWrite:!1,side:2}));Ig.visible=Lg.visible=!1,J.add(Ig,Lg);var Rg=new R(16719920),zg=new R,Bg=new I;function Vg(){if(Qu.bi>=0&&Qu.bi<Y.buildings.length){let e=Y.buildings[Qu.bi];for(let t=0;t<e.count;t++)Y.segs.mesh.setColorAt(e.first+t,Qu.orig[t]);Y.segs.mesh.instanceColor&&(Y.segs.mesh.instanceColor.needsUpdate=!0)}Qu.bi=-1,Ig.visible=Lg.visible=!1}function Hg(){Qu.bi=-1,Qu.next=W.level.wanted.first,Ig.visible=Lg.visible=!1}function Ug(){Vg();let e=-1,t=0,n=W.level.wanted.minHeight;for(let r=0;r<2&&e<0;r++)for(let i=0;i<Y.buildings.length;i++){let a=Y.buildings[i],o=Math.hypot(a.x-K.pos.x,a.z-K.pos.z);if(r===0&&(o<120||o>300))continue;let s=Y.standing(a);s>t&&s>n&&(t=s,e=i)}if(e<0)return;Qu.bi=e,Qu.t=W.level.wanted.every;let r=Y.buildings[e];Qu.orig=[];for(let e=0;e<r.count;e++){let t=new R;Y.segs.mesh.getColorAt(r.first+e,t),Qu.orig.push(t)}let i=Math.hypot(r.hx,r.hz)+6;Ig.scale.set(i,i,1),Ig.position.set(r.x,1.5,r.z),Lg.scale.set(7,260,7),Lg.position.set(r.x,130,r.z),Ig.visible=Lg.visible=!0,Fg.up||Ap(`WANTED: KNOCK IT DOWN`,`#ff4a4a`),Vu(),U.emit(`wantedPicked`,{index:e})}function Wg(e,t){if(W.mode!==`play`)return;let n=W.level.wanted;if(G.timeFrozen||(Qu.next-=e),Qu.bi>=0){Qu.t-=e;let r=Y.buildings[Qu.bi];if(Jf(r)<=r.count*.2){let e=Up(n.bonus);G.time+=n.timeBonus,G.wanted++,Ep(`LANDMARK! +${Bf(e)}  +${n.timeBonus}s`,Bg.set(r.x,60,r.z),`#ff4a4a`,40),Ap(`LANDMARK TOPPLED! +${n.timeBonus}s`,`#ff4a4a`),jp(.4),kd(.5),Bu(`short`),U.emit(`landmarkToppled`,{index:Qu.bi,count:G.wanted,bonus:e}),Vg(),Qu.next=Math.min(Qu.next,3)}else if(Qu.t<=0)Vg(),Qu.next=0;else{let e=.35+.25*Math.sin(t*8);for(let t=0;t<r.count;t++)Y.segs.mesh.setColorAt(r.first+t,zg.copy(Qu.orig[t]).lerp(Rg,e));Y.segs.mesh.instanceColor&&(Y.segs.mesh.instanceColor.needsUpdate=!0),Ig.material.opacity=.55+.35*Math.sin(t*8)}}Qu.next<=0&&G.time>4&&(Qu.next=n.every,Ug())}var Gg=t({C:()=>K,beginPlay:()=>Xg,currentCat:()=>i_,currentLevel:()=>r_,endLevel:()=>Qg,isPlaying:()=>a_,pause:()=>e_,prepareLevel:()=>Yg,quitLevel:()=>$g,resume:()=>t_,runResult:()=>Jg,startLevel:()=>Zg,tickSession:()=>n_}),Kg=!1,qg=-1;function Jg(e){return{levelId:W.level.id,catId:W.cat.id,why:e,damage:G.damage,buildings:G.buildings,landmarks:G.wanted,kills:{...G.kills},taxis:G.taxis,fish:G.fish,maxCombo:G.maxCombo,patience:e===`wet`?0:Math.max(0,G.patience),destroyedPct:Yf(),bossDefeated:G.bossDefeated,elapsed:G.elapsed}}function Yg(e,t,n,a={}){let o=r.get(e),s=i.get(t);fh(),Vg(),bm(),W.level=o,vh(o.world.theme),Y.build(o.world),Hg(),Object.assign(q,n??s.base),Ym(s),Xm(),tm(),fm(),tp(),ed.clear(),Object.assign(G,{time:o.duration,damage:0,combo:0,maxCombo:0,comboT:0,patience:q.patienceMax,ultra:0,ultraT:0,buildings:0,helis:0,taxis:0,fish:0,elapsed:0,hitStop:0,trauma:0,zapComboT:0,zap:0,frenzy:!1,blockedT:0,bonkT:0,wanted:0,timeFrozen:!1,bossDefeated:!1,kills:{}}),qg=-1,Kg=!1,Mp(),jd(),a.keepCamera||(W.intro=0),W.mode=`title`,document.body.dataset.mode=`title`,U.emit(`levelLoad`,{level:o,cat:s})}function Xg(){Im(),ym(W.level),W.mode=`play`,document.body.dataset.mode=`play`,Ap(`RAMPAGE!`),Bu(`short`,W.cat.voice),U.emit(`levelStart`,{level:W.level,cat:W.cat})}function Zg(e,t,n,r={}){Yg(e,t,n,r),Xg()}function Qg(e){if(W.mode!==`play`&&W.mode!==`paused`)return;W.mode=`over`,document.body.dataset.mode=`over`,W.overAt=performance.now(),fh(),G.hitStop=.6,Gu(0),Im(),Vg(),Np();let t=Jg(e);U.emit(`levelEnd`,{result:t}),Bu(e===`wet`?`sad`:`short`,W.cat.voice)}function $g(){if(W.mode!==`play`&&W.mode!==`paused`&&W.mode!==`over`)return;let e=W.mode!==`over`;fh(),bm(),Vg(),Gu(0),Im(),Np(),W.mode=`title`,document.body.dataset.mode=`title`,e&&U.emit(`levelEnd`,{result:Jg(`quit`)})}function e_(){W.mode===`play`&&(W.mode=`paused`,document.body.dataset.mode=`paused`,Im(),Gu(0),Ku(!1),U.emit(`pause`,Xu))}function t_(){W.mode===`paused`&&(W.mode=`play`,document.body.dataset.mode=`play`,G.ultraT>0&&W.ability?.id===`laser`&&Ku(!0),U.emit(`resume`,Xu))}function n_(e){if(W.mode!==`play`)return;let t=W.level;G.timeFrozen||(G.time-=e,G.elapsed+=e),G.comboT-=e,G.comboT<=0&&(G.combo=0),!G.frenzy&&G.time<t.frenzyAt&&(G.frenzy=!0,Ap(`FINAL FRENZY! x2`,`#ff3e7a`),jp(.5),Bu(`ultra`,W.cat.voice),km(),U.emit(`frenzy`,Xu)),G.ultra>=100&&!Kg&&G.ultraT<=0&&(Kg=!0,Ap(document.body.classList.contains(`touch`)?`ULTRA READY: TAP ULTRA`:`ULTRA READY: PRESS E`,`#ff3e7a`),U.emit(`ultraReady`,Xu)),G.ultra<100&&(Kg=!1),G.bossDefeated&&t.boss?.endsLevel?(G.timeFrozen=!0,qg<0&&(qg=5),qg-=e,qg<=0&&Qg(`boss`)):G.time<=0?Qg(`time`):G.patience<=0&&Qg(`wet`)}var r_=()=>W.level,i_=()=>W.cat,a_=()=>W.mode===`play`,o_=new class{screens=new Map;cur=null;stack=[];register(e){this.screens.set(e.id,e)}show(e,t){let n=this.screens.get(e);if(!n)throw Error(`screen not registered: ${e}`);for(let t of this.screens.values())t.id!==e&&(t.el.classList.contains(`hidden`)||(t.el.classList.add(`hidden`),t.onHide?.()));this.cur&&this.cur!==e&&this.stack.push(this.cur),this.stack.length>20&&this.stack.shift(),this.cur=e,n.el.classList.remove(`hidden`),document.body.dataset.screen=e,n.onShow?.(t)}hideAll(){for(let e of this.screens.values())e.el.classList.contains(`hidden`)||(e.el.classList.add(`hidden`),e.onHide?.());this.cur&&this.stack.push(this.cur),this.cur=null,document.body.dataset.screen=``}back(){let e=this.stack.pop();e&&(this.show(e),this.stack.pop())}current(){return this.cur}},s_=new I,c_=new Pt,l_=new Pt,u_=new I(0,1,0),d_=new R,f_=new R,p_=new R(1709088),m_=!1,h_=!1,g_=!1,__=0,v_=0,y_=-1;function b_(e,t,n,r,i,a,o){if(e.broken)return;e.broken=!0;let s=Y.props;for(let c=e.p0;c<e.p0+e.pn;c++){let e=s.sets[s.partSet[c]],l=s.partIdx[c];if(e.state[l]!==ld.Static)continue;let u=e.pos[l*3],d=e.pos[l*3+2],f=u-i,p=d-a,m=Math.hypot(f,p)||1;e.launch(l,t+f/m*o*(.6+Math.random()*.8),n+Math.random()*14,r+p/m*o*(.6+Math.random()*.8),7)}let c=Math.min(60,e.top*.7+4);if(e.kind===`splash`){for(let t=0;t<46;t++)Sd.spawn(e.x,c,e.z,(Math.random()-.5)*70,10+Math.random()*40,(Math.random()-.5)*70,1.4,2.2,7327999,-60,.4);Math.hypot(e.x-K.pos.x,e.z-K.pos.z)<45&&W.mode===`play`&&(ih(10,`splash`),Ep(`SPLASH! HISSS`,s_.set(K.pos.x,60,K.pos.z),`#6fd0ff`,34),Vu())}else if(e.kind===`fire`){for(let t=0;t<26;t++)Cd.spawn(e.x,4+Math.random()*6,e.z,(Math.random()-.5)*40,14+Math.random()*26,(Math.random()-.5)*40,.9,2.6,Math.random()<.5?16756800:16734762,10,.6);Wu(),kd(.25)}else if(e.kind===`spark`)for(let t=0;t<12;t++)xd.spawn(e.x,c,e.z,(Math.random()-.5)*50,10+Math.random()*25,(Math.random()-.5)*50,1.1,.9,Math.random()<.5?16777215:10482943,-50,0);e.trample||Ru(Math.min(2,.5+e.value*.3)),e.value>0&&W.mode===`play`&&(h_=!0,Hp(e.value*(1+G.elapsed/45),s_.set(e.x,c,e.z),e.label),h_=!1)}function x_(e,t,n,r,i,a,o){let s=Y.props.groups;for(let c=0;c<s.length;c++){let l=s[c];l.broken||l.anchor>=0||l.top<r||Math.hypot(l.x-e,l.z-t)>l.r+n||b_(l,a*i,18*i,o*i,e,t,30*i)}}function S_(e){let t=Y.props,n=t.spinners;for(let r=0;r<n.length;r++){let i=n[r];if(i.broken)continue;let a=e*i.spin,o=Math.cos(a),s=Math.sin(a);c_.setFromAxisAngle(u_,a);for(let e=i.p0;e<i.p0+i.pn;e++){let n=t.sets[t.partSet[e]],r=t.partIdx[e];if(n.state[r]!==ld.Static)continue;let a=t.partLx[e],c=t.partLz[e];n.pos[r*3]=i.x+a*o+c*s,n.pos[r*3+2]=i.z-a*s+c*o,l_.fromArray(t.partQ,e*4).premultiply(c_),l_.toArray(n.rot,r*4),n.write(r)}}}function C_(e,t){let n=Y.props;S_(t);let r=n.groups,i=Y.segs,a=W.mode===`play`,o=K.speed>3||K.air,s=K.speed>q.walk+5;for(let e=0;e<r.length;e++){let t=r[e];if(!t.broken){if(t.anchor>=0){if(i.state[t.anchor]!==ld.Static){let e=t.anchor*3;b_(t,i.vel[e]*.9,i.vel[e+1]*.9+6,i.vel[e+2]*.9,t.x,t.z,8)}}else!a||!o||K.y>t.top||Math.hypot(t.x-K.pos.x,t.z-K.pos.z)<t.r+q.radius*.8&&b_(t,K.fwd.x*(s?70:45),22,K.fwd.z*(s?70:45),K.pos.x,K.pos.z,18)}}for(let t=0;t<n.sets.length;t++)n.sets[t].step(e)}function w_(e,t,n,r){for(let i=0;i<e.length;i++){let a=e[i];if(t>a.x0-r&&t<a.x1+r&&n>a.z0-r&&n<a.z1+r)return!0}return!1}function T_(e,t,n){for(let r=0;r<e.length;r++){let i=e[r];if(t>i.x0-2&&t<i.x1+2&&n>i.z0-2&&n<i.z1+2)return i}return null}function E_(e){let t=Y.terrain;if(W.mode!==`play`||!t.water.length||K.air){g_=!1;return}let n=K.pos.x,r=K.pos.z;if(!w_(t.water,n,r,2)||w_(t.dry,n,r,-q.radius*.5)){g_=!1;return}ih(7*e,`water`),sh(.7);let i=T_(t.water,n,r);if(i){let e=n-i.x0,t=i.x1-n,a=r-i.z0,o=i.z1-r,s=Math.min(e,t,a,o);s===e?oh(-14,0):s===t?oh(14,0):s===a?oh(0,-14):oh(0,14)}if(!g_){Vu();for(let e=0;e<18;e++)Sd.spawn(n+(Math.random()-.5)*20,2,r+(Math.random()-.5)*20,(Math.random()-.5)*30,20+Math.random()*25,(Math.random()-.5)*30,1,1.8,8378623,-60,0)}g_=!0,__-=e,__<=0&&(__=2.4,Ep(t.waterName,s_.set(n,62,r),`#7fd8ff`,34)),K.speed>4&&Math.random()<.5&&Sd.spawn(n+(Math.random()-.5)*22,1.5,r+(Math.random()-.5)*22,(Math.random()-.5)*16,12+Math.random()*12,(Math.random()-.5)*16,.7,1.4,10478847,-60,0)}function D_(){if(W.mode!==`play`||K.air||Y.layout===`downtown`)return;let e=q.radius*.9,t=Y.buildings,n=Y.segs;for(let r=0;r<t.length;r++){let i=t[r];if(Uf(i,K.pos.x,K.pos.z)>e||n.state[i.first]!==ld.Static)continue;let a=Y.standing(i);if(a===0||a>14)continue;let o=Y.knock(i.first,K.fwd.x*40+(Math.random()-.5)*20,16,K.fwd.z*40+(Math.random()-.5)*20);o&&(Gf(r),Ad(i.x,3,i.z,3,14078150),Ru(.5),Hp(o*i.value*Wf(r),s_.set(i.x,12,i.z),`STOMP `))}}function O_(e){if(Y.layout!==`neon`||(v_-=e,v_>0))return;v_=.06+Math.random()*.1;let t=Y.props.sets[1];if(y_>=0&&y_<t.n&&t.mesh.setColorAt(y_,f_),y_=-1,t.n&&Math.random()<.7){let e=Math.floor(Math.random()*t.n);t.state[e]===ld.Static&&(t.mesh.getColorAt(e,f_),t.mesh.setColorAt(e,d_.copy(f_).lerp(p_,.75)),y_=e)}t.mesh.instanceColor&&(t.mesh.instanceColor.needsUpdate=!0)}function k_(){m_||(m_=!0,U.on(`levelLoad`,()=>{g_=!1,y_=-1}),U.on(`swat`,e=>{x_(e.x,e.z,q.swatRadius,K.y,1,K.fwd.x*60,K.fwd.z*60)}),U.on(`pounceLand`,e=>{x_(e.x,e.z,q.pounceR,0,1.3,0,0)}),U.on(`damage`,e=>{h_||x_(e.x,e.z,14,e.y-25,.9,0,0)}),kh((e,t)=>{zd.value=t,e!==0&&(E_(e),D_(),C_(e,t),O_(e))}))}function A_(){for(let e of g)r.add(e);k_()}function j_(e,t,n){let r=t>0?e/t:0,i=1;for(let e of n)r<e&&i++;return i}var M_={swat:2,pounce:4,laser:.15,blast:4,ball:3,dizzyMul:1},N_={swat:2,pounce:8,pounceDizzy:12,laser:.2,blast:5,ball:3,dizzyMul:2};function P_(e,t,n={}){if(n.shield)return 0;let r=n.dizzy?e.dizzyMul:1;switch(t){case`swat`:return e.swat*(n.power??1)*r;case`pounce`:return n.dizzy&&e.pounceDizzy!==void 0?e.pounceDizzy:e.pounce*r;case`laser`:return e.laser*(n.frames??1)*r;case`blast`:return e.blast*(n.power??1)*r;case`ball`:return e.ball*r}}function F_(e,t){return Math.max(0,e-Math.max(0,t))}function I_(e,t,n,r,i,a){let o=Math.max(.05,r);a.x=e/o,a.z=n/o,a.y=(t-.5*i*o*o)/o}function L_(e,t,n=6){let r=-e*t;return r<n?0:r}var R_=(e,t)=>-e.half+t*e.block;function z_(e,t){return Math.max(0,Math.min(e.n,Math.round((t+e.half)/e.block)))}function B_(e,t){t.axis===0?t.x=R_(e,z_(e,t.x))+t.dir*t.lane:t.z=R_(e,z_(e,t.z))+t.dir*t.lane}function V_(e,t,n,r,i,a){let o=e.half-6,s=t.axis===0?t.z:t.x,c=s+n*t.dir,l=!1,u=NaN;for(let t=0;t<=e.n;t++){let n=R_(e,t);if((s-n)*(c-n)<=0&&s!==n){u=n;break}}if(t.axis===0?t.z=c:t.x=c,!Number.isNaN(u)){let n=a?-1:1,o=(r-t.x)*n,s=(i-t.z)*n,c=t.axis===0?s:o,d=t.axis===0?o:s,f=Math.abs(d)>Math.abs(c)+8?+(t.axis===0):t.axis;if(f!==t.axis){let e=u;t.axis=f,t.dir=d>=0?1:-1,t.axis===0?t.x=e+t.dir*t.lane:t.z=e+t.dir*t.lane,l=!0}else Math.abs(c)>4&&Math.sign(c)!==t.dir&&(t.dir=t.dir===1?-1:1,t.axis===0?t.x=R_(e,z_(e,t.x))+t.dir*t.lane:t.z=R_(e,z_(e,t.z))+t.dir*t.lane,l=!0)}let d=t.axis===0?t.z:t.x;if(Math.abs(d)>o){let n=Math.sign(d)*o;t.axis===0?t.z=n:t.x=n,t.dir=d>0?-1:1,t.axis===0?t.x=R_(e,z_(e,t.x))+t.dir*t.lane:t.z=R_(e,z_(e,t.z))+t.dir*t.lane,l=!0}return l}function H_(e){return e.axis===0?e.dir>0?0:Math.PI:e.dir>0?Math.PI/2:-Math.PI/2}function U_(e,t){return Math.max(e.minEvery,e.every-Math.max(0,t)/10*e.everyRamp)}function W_(e,t){return e.max+(e.maxRamp>0?Math.floor(Math.max(0,t)/e.maxRamp):0)}function G_(e,t,n){let r=e?.params?.[t];return typeof r==`number`&&Number.isFinite(r)?r:n}var K_=class{spec=null;next=1/0;reset(e){this.spec=e,this.next=e?e.delay:1/0}tick(e,t,n){let r=this.spec;return!r||n||e<this.next||t>=W_(r,e)?!1:(this.next=e+U_(r,e),!0)}},q_=8,J_=1.5,Y_=1,X_=55,Z_=7.6,Q_=[],$_=new K_,ev=null,tv=!1,nv=new B({color:14165547,roughness:.45}),rv=new B({color:16052714,roughness:.5}),iv=new B({color:13225686,roughness:.25,metalness:.6}),av=new B({color:14263098,roughness:.3,metalness:.5}),ov=new B({color:8374015,roughness:.1}),sv=new B({color:2237480,roughness:.9}),cv=new B({color:16722474,emissive:16711680,emissiveIntensity:1}),lv=new B({color:2780159,emissive:16639,emissiveIntensity:0}),uv=new ki(1,1,1),dv=new ji(1.9,1.9,1.4,12).rotateZ(Math.PI/2),fv=new ji(.7,1.1,8,10).rotateX(Math.PI/2).translate(0,0,4),pv=new ji(2.2,2.6,2,12),mv={n:9,block:100,half:450},hv=new I,gv=new I,_v={x:0,y:0,z:0},vv=new I;function yv(e,t,n,r,i,a,o,s,c=uv){let l=new z(c,t);return l.scale.set(n,r,i),l.position.set(a,o,s),l.castShadow=!0,e.add(l),l}function bv(){let e=new L,t=new L;t.position.y=0,e.add(t),yv(t,nv,7,4.2,15,0,4.4,-2.5),yv(t,rv,7.1,.8,15.1,0,3.6,-2.5),yv(t,nv,7,6,5.5,0,5.2,7.2),yv(t,ov,6.2,2.4,.4,0,6.6,10),yv(t,iv,7.4,1.2,.8,0,2.6,10.1),yv(t,iv,.4,.5,13,-2.6,7.3,-3),yv(t,iv,.4,.5,13,2.6,7.3,-3);for(let e=0;e<5;e++)yv(t,iv,5.2,.3,.4,0,7.3,-8.5+e*2.7);yv(t,cv,1.6,.9,1.2,-1.8,8.6,7.2),yv(t,lv,1.6,.9,1.2,1.8,8.6,7.2);for(let e of[-7.5,-2.5,7])for(let n of[-3.6,3.6])yv(t,sv,1,1,1,n,1.9,e,dv);let n=new L;n.position.set(0,7.6,2.5),yv(n,iv,1,1,1,0,0,0,pv);let r=new L;r.position.y=1,yv(r,av,1,1,1,0,0,0,fv);let i=new Mn;return i.position.set(0,0,8.5),r.add(i),n.add(r),t.add(n),e.scale.setScalar(J_),e.visible=!1,J.add(e),{g:e,turret:n,barrel:r,nozzle:i,m:{x:0,z:0,axis:0,dir:1,lane:6},state:`dead`,t:0,cool:0,yaw:0,vel:new I,spin:0,y:0,ax:0,az:0,live:!1}}var xv=new I;function Sv(){let e=Q_.find(e=>!e.live);if(!e)return;e.live=!0,e.state=`drive`,e.t=0,e.cool=1+Math.random(),e.y=0,wg(xv,240,70);let t=K.pos.x-xv.x,n=K.pos.z-xv.z;e.m.axis=+(Math.abs(t)>Math.abs(n)),e.m.dir=(e.m.axis===1?t:n)>=0?1:-1,e.m.x=xv.x,e.m.z=xv.z,B_(mv,e.m),e.yaw=H_(e.m),e.g.rotation.set(0,e.yaw,0),e.g.position.set(e.m.x,0,e.m.z),e.turret.rotation.set(0,0,0),e.turret.position.y=Z_,e.barrel.rotation.set(0,0,0),e.g.visible=!0,tv||(tv=!0,Ap(innerWidth<600?`FIRE TRUCKS!`:`WATER-CANNON TRUCKS INCOMING`,`#ff5a4a`))}var Cv=e=>e.live&&(e.state===`drive`||e.state===`spray`||e.state===`flee`||e.state===`retreat`);function wv(e,t,n,r=`FLIP! `){Cv(e)&&(e.state=`flip`,e.t=0,e.vel.set(t*40,55,n*40),e.spin=(Math.random()<.5?-1:1)*(5+Math.random()*3),e.g.getWorldPosition(vv),vv.y=14,Am(`cannonTruck`,vv),Hp(G_(ev,`value`,4),vv,r),Ep(`HOSED!`,vv.setY(30),`#ff5a4a`,26),rg(),Iu(.8),G.hitStop=.05)}function Tv(e,t){mv.n=Y.n,mv.block=Y.block,mv.half=Y.half,$_.tick(G.elapsed,Ev.alive(),Pg())&&Sv();let n=W.mode===`play`,r=G_(ev,`speed`,30),i=G_(ev,`range`,90),a=G_(ev,`spray`,6),o=G_(ev,`push`,15),s=Y_+G_(ev,`burst`,2.5),c=G_(ev,`cool`,3.5),l=K.speed>q.walk+5&&!K.air;hv.set(K.pos.x,q.headY+K.y,K.pos.z);let u=Math.sin(t*12)>0;cv.emissiveIntensity=u?1.4:.05,lv.emissiveIntensity=u?.05:1.6;let d=1e9,f=0;for(let u of Q_){if(!u.live)continue;let p=u.g,m=K.pos.x-u.m.x,h=K.pos.z-u.m.z,g=Math.hypot(m,h)||1;switch(u.cool-=e,u.t+=e,u.state){case`drive`:case`flee`:case`retreat`:{Fg.up&&u.state!==`retreat`&&(u.state=`retreat`,u.t=0);let t=u.state!==`drive`;u.state===`drive`&&l&&g<220?u.state=`flee`:u.state===`flee`&&!l&&(u.state=`drive`);let a=(t?r*1.5:r)*(g<i*1.3&&!t?.6:1);if(u.state===`drive`&&g<i&&u.cool<=0&&n&&!Fg.up){u.state=`spray`,u.t=0,u.ax=u.m.x+m*.6,u.az=u.m.z+h*.6,Vu();break}if(u.state===`drive`&&g<i*.7)break;V_(mv,u.m,a*e,K.pos.x,K.pos.z,t),u.yaw=Mg(u.yaw,H_(u.m),6,e),u.state===`retreat`&&(u.t>2.5&&(u.y-=e*8),u.y<-12&&(u.live=!1,p.visible=!1)),u.turret.rotation.y=Mg(u.turret.rotation.y,0,2,e);break}case`spray`:{let t=K.pos.x-u.ax,r=K.pos.z-u.az,d=Math.hypot(t,r);if(d>.01){let n=Math.min(d,X_*e);u.ax+=t/d*n,u.az+=r/d*n}let p=u.ax-u.m.x,_=u.az-u.m.z,v=Math.hypot(p,_)||1,y=Math.atan2(p,_)-u.yaw;if(u.turret.rotation.y=Mg(u.turret.rotation.y,Math.atan2(Math.sin(y),Math.cos(y)),5,e),u.barrel.rotation.x=-.35-Math.min(.4,v/400),u.nozzle.getWorldPosition(gv),u.t<Y_){let e=u.t/Y_;u.turret.position.y=Z_+e*2+Math.sin(u.t*60)*.15,Math.random()<.5&&Sd.spawn(gv.x,gv.y,gv.z,(Math.random()-.5)*6,4+Math.random()*4,(Math.random()-.5)*6,.5,1.2+e,5817599,-60,.2)}else if(n){let t=Math.max(.35,v/130);for(let e=0;e<4;e++)I_(u.ax-gv.x,hv.y-gv.y,u.az-gv.z,t,-60,_v),Sd.spawn(gv.x,gv.y,gv.z,_v.x*1.35+(Math.random()-.5)*8,_v.y+(Math.random()-.5)*8,_v.z*1.35+(Math.random()-.5)*8,t+.15,1.8+Math.random(),5817599,-60,.6);u.t>Y_+t&&d<q.radius+10&&g<i*1.4&&(ih(a*e,`cannonTruck`),oh(m/g*o,h/g*o),f=Math.max(f,1-g/(i*1.4)))}(u.t>s||g>i*1.5||l&&g<220||!n||Fg.up)&&(u.state=Fg.up?`retreat`:l?`flee`:`drive`,u.t=0,u.cool=c,u.turret.position.y=Z_);break}case`flip`:u.vel.y-=90*e,u.m.x+=u.vel.x*e,u.m.z+=u.vel.z*e,u.y+=u.vel.y*e,p.rotation.z+=u.spin*e,u.y<=0&&u.t>.2&&(u.y=0,p.rotation.z=Math.PI,u.state=`burn`,u.t=0,gg(u.m.x,6,u.m.z,.9));break;case`burn`:Math.random()<.8&&Cd.spawn(u.m.x+(Math.random()-.5)*8,6+Math.random()*3,u.m.z+(Math.random()-.5)*12,(Math.random()-.5)*6,14+Math.random()*10,(Math.random()-.5)*6,.8,2+Math.random()*2,Math.random()<.6?16747050:4473924,8,1.6),u.t>2.2&&(u.y-=e*6),u.y<-10&&(u.live=!1,u.state=`dead`,p.visible=!1)}u.state!==`flip`&&u.state!==`burn`&&p.rotation.set(0,u.yaw,0),Cv(u)&&mg(u.m.x,u.m.z,13)&&wv(u,sg.nx,sg.nz,`BULLDOZED! `),p.position.set(u.m.x,u.y+(u.state===`burn`?9*J_:0),u.m.z),(u.state===`drive`||u.state===`spray`||u.state===`flee`)&&(p.position.y+=Math.abs(Math.sin(t*9+u.m.x))*.25,d=Math.min(d,g))}n&&(ag.siren=Math.max(ag.siren,Math.max(0,1-d/320)),ag.hose=Math.max(ag.hose,f))}var Ev={id:`cannonTruck`,init(){for(let e=0;e<q_;e++)Q_.push(bv())},begin(e){ev=e,$_.reset(e),tv=!1},update:Tv,clear(){for(let e of Q_)e.live=!1,e.state=`dead`,e.g.visible=!1;ev=null,$_.reset(null)},alive(){let e=0;for(let t of Q_)Cv(t)&&t.state!==`retreat`&&e++;return e},onSwat(e){for(let t of Q_)Cv(t)&&lg(e,t.m.x,6,t.m.z,14)&&wv(t,e.fwd.x,e.fwd.z,`SWAT! `)},onPounceLand(e,t,n){for(let r of Q_)Cv(r)&&dg(e,t,n,r.m.x,r.m.z,12)&&wv(r,sg.nx,sg.nz,`POUNCE! `)},onLaser(e){for(let t of Q_)Cv(t)&&fg(e,t.m.x,6,t.m.z,15)&&wv(t,sg.nx,sg.nz,`ZAPPED! `)},onBlast(e){for(let t of Q_)Cv(t)&&ug(e,t.m.x,t.m.z,12)&&wv(t,sg.nx,sg.nz)},onFrenzy(){for(let e of Q_)Cv(e)&&(e.state=`retreat`,e.t=0)}},Dv=()=>Q_.filter(e=>e.live).map(e=>({x:e.m.x,z:e.m.z,state:e.state}));function Ov(e,t,n){let r=-1;for(let i of Q_){if(!i.live||i.state!==`drive`&&i.state!==`spray`)continue;let a=(i.m.x-e)**2+(i.m.z-t)**2;(r<0||a<r)&&(r=a,n.set(i.m.x,8,i.m.z))}return r}var kv={type:`mechaDog`,hp:0,maxHp:0},Av=class{type;name;cuts;phaseNames;hp=0;maxHp=1;phase=0;up=!1;dead=!1;invuln=0;flashT=0;spawnAt=1/0;spawned=!1;laserFrame=-1;popT=0;popN=0;lastPop=null;lastLabel=``;mats=[];baseEmissive=[];constructor(e,t,n,r){this.type=e,this.name=t,this.cuts=n,this.phaseNames=r}flashOn(...e){for(let t of e)this.mats.push(t),this.baseEmissive.push(t.emissiveIntensity)}begin(e,t,n){this.reset(),this.spawnAt=t.boss?.type===this.type?t.boss.at:e?e.delay:n}reset(){Fg.up=Fg.final=!1,this.up=!1,this.dead=!1,this.spawned=!1,this.phase=0,this.flashT=0,this.spawnAt=1/0}spawn(e,t=2){this.maxHp=e,this.hp=e,this.up=!0,this.dead=!1,this.spawned=!0,this.invuln=t,this.phase=1,Fg.up=!0,Fg.final=!!W.level?.boss?.endsLevel&&W.level.boss.type===this.type,U.emit(`bossSpawn`,{type:this.type,name:this.name,maxHp:e}),this.emitHp(),U.emit(`bossPhase`,{type:this.type,phase:1,name:this.phaseNames[0]??``})}emitHp(){kv.type=this.type,kv.hp=this.hp,kv.maxHp=this.maxHp,U.emit(`bossHp`,kv)}laserOnce(){return this.laserFrame!==ig.n&&(this.laserFrame=ig.n,!0)}hit(e,t,n=`CLANK!`,r=!0){if(!this.up||this.dead||this.invuln>0||W.mode!==`play`||e<=0)return`none`;let i=this.phase-1<this.cuts.length?this.cuts[this.phase-1]*this.maxHp:0;if(this.hp=Math.max(F_(this.hp,e),i>0?i-.001:0),this.flashT=r?.14:Math.max(this.flashT,.05),this.emitHp(),r?(Yh(this.type===`roombaPrime`?.7:1),yg(t.x,t.y,t.z,12),Hp(.6,t,`CLANK `)):Math.random()<.3&&yg(t.x,t.y,t.z,2),r&&this.popT>0&&this.lastPop&&this.lastLabel===n?(this.popN++,this.lastPop.el.textContent=`${n} x${this.popN}`,this.popT=.5):(this.popT<=0||r)&&(this.lastPop=Ep(n,t,`#ffe36a`,r?30:20),this.lastLabel=n,this.popN=1,this.popT=.5),this.hp<=0)return this.dead=!0,Fg.up=Fg.final=!1,`dead`;let a=j_(this.hp,this.maxHp,this.cuts);return a===this.phase?`hit`:(this.phase=a,this.invuln=Math.max(this.invuln,jv),U.emit(`bossPhase`,{type:this.type,phase:a,name:this.phaseNames[a-1]??``}),`phase`)}blocked(e){this.popT>0||(this.popT=.4,Yh(1.6),yg(e.x,e.y,e.z,6,Mv),Ep(`SHIELD!`,e,`#7fe8ff`,24))}focus(e,t,n=1){Th.x=e,Th.z=t,Th.want=Math.max(Th.want,n)}tick(e){this.invuln=Math.max(0,this.invuln-e),this.popT-=e,this.flashT=Math.max(0,this.flashT-e);let t=+(this.flashT>0);for(let e=0;e<this.mats.length;e++){let n=this.mats[e];n.emissive.setHex(t?16777215:n.userData.emissive??0),n.emissiveIntensity=t?.9:this.baseEmissive[e]}}setHpFrac(e){if(!this.up)return;this.hp=Math.max(.01,Math.min(1,e))*this.maxHp,this.emitHp();let t=j_(this.hp,this.maxHp,this.cuts);t!==this.phase&&(this.phase=t,U.emit(`bossPhase`,{type:this.type,phase:t,name:this.phaseNames[t-1]??``}))}},jv=1.5,Mv=[8382719,16777215,5030911];function Nv(e){return e.userData.emissive=e.emissive.getHex(),e}var Pv={x:0,z:0,t:0,T:1};function Fv(e,t,n=.45){Pv.x=e,Pv.z=t,Pv.t=n,Pv.T=n}kh(e=>{if(Pv.t<=0||e<=0)return;if(W.mode!==`play`){Pv.t=0;return}Pv.t-=e;let t=Math.max(0,Pv.t/Pv.T);K.tugX+=Pv.x*t,K.tugZ+=Pv.z*t});var Iv=36,Lv=[],Rv=!1,zv=-1,Bv=new B({color:4168250,roughness:.6}),Vv=new B({color:2779944,roughness:.7}),Hv=new B({color:6274890,roughness:.4,emissive:1127185}),Uv=new B({color:9080985,roughness:.5,metalness:.3}),Wv=new B({color:14217290,roughness:.9}),Gv=new Kr({color:16777215}),Kv=new Kr({color:8257386,transparent:!0,opacity:.6,depthWrite:!1,side:2}),qv=new Ai(1.8,8,4,10),Jv=new $a(.5,6,4),Yv=new ki(.3,2.6,2.4),Xv=new $a(4,14,10),Zv=new eo(4.02,.25,4,24),Qv=new Qa(9,12,28),$v={x:0,y:0,z:0},ey=new I;function ty(){if(!Rv){Rv=!0;for(let e=0;e<Iv;e++){let e=new L,t=new L,n=new z(qv,Bv);n.rotation.x=Math.PI/2,t.add(n);for(let e=0;e<6;e++){let n=new z(Jv,Vv),r=e*2.1;n.position.set(Math.cos(r)*1.7,Math.sin(r)*1.7,-4+e*1.6),t.add(n)}let r=new L,i=new z(qv,Hv);i.rotation.x=Math.PI/2,i.scale.set(1.3,.8,1.3),r.add(i);for(let e=0;e<4;e++){let t=new z(Yv,Uv);t.position.z=-5,t.rotation.z=e*Math.PI/2,t.position.x=Math.cos(e*Math.PI/2)*1.6,t.position.y=Math.sin(e*Math.PI/2)*1.6,r.add(t)}let a=new L;a.add(new z(Xv,Wv));let o=new z(Zv,Gv);o.rotation.x=1.1,a.add(o),e.add(t,r,a),e.traverse(e=>e.castShadow=!0),e.visible=!1,J.add(e);let s=new z(Qv,Kv);s.rotation.x=-Math.PI/2,s.visible=!1,J.add(s),Lv.push({g:e,parts:{cuke:t,bomb:r,ball:a},marker:s,kind:`cuke`,active:!1,back:!1,pos:new I,vel:new I,grav:-90,t:0,spin:0,owner:-1,onBack:null,tx:0,ty:0,tz:0,bounces:0})}}}function ny(){ty();for(let e of Lv)if(!e.active)return e;return null}function ry(e){e.active=!1,e.g.visible=!1,e.marker.visible=!1}function iy(e,t,n,r,i,a,o,s,c=-1,l=null,u=-90){let d=ny();if(!d)return!1;d.active=!0,d.back=!1,d.kind=e,d.owner=c,d.onBack=l,d.grav=u,d.t=0,d.bounces=0,d.spin=(Math.random()<.5?-1:1)*(4+Math.random()*4),d.pos.set(t,n,r),I_(i-t,a-n,o-r,s,u,$v),d.vel.set($v.x,$v.y,$v.z);for(let t of[`cuke`,`bomb`,`ball`])d.parts[t].visible=t===e;return d.g.visible=!0,d.g.position.copy(d.pos),d.marker.visible=e!==`ball`,Kv.color.setHex(e===`bomb`?16738890:8257386),d.marker.position.set(i,1.3,o),d.marker.scale.setScalar(e===`bomb`?1.8:1.2),!0}function ay(e,t,n,r,i,a,o,s){let c=ny();if(!c)return!1;c.active=!0,c.back=!1,c.kind=`ball`,c.owner=o,c.onBack=s,c.grav=-150,c.t=0,c.bounces=0,c.spin=8;let l=r-e,u=i-n,d=Math.hypot(l,u)||1;return c.pos.set(e,t,n),c.vel.set(l/d*a,40,u/d*a),c.parts.cuke.visible=c.parts.bomb.visible=!1,c.parts.ball.visible=!0,c.g.visible=!0,c.marker.visible=!1,!0}function oy(e,t){let n=0;for(let r of Lv){if(!r.active||r.back)continue;let i=r.pos.x-e.strike.x,a=r.pos.z-e.strike.z,o=Math.hypot(i,a)<e.radius+18&&r.pos.y<e.strike.y+45,s=Math.hypot(r.pos.x-K.pos.x,r.pos.z-K.pos.z)<q.radius+20&&r.pos.y<q.headY+K.y+20&&(r.pos.x-K.pos.x)*e.fwd.x+(r.pos.z-K.pos.z)*e.fwd.z>-4;if(o||s){if(r.back=!0,r.marker.visible=!1,r.t=0,r.owner>=0&&t(r.owner,r.kind,ey)){let e=ey.distanceTo(r.pos),t=Math.max(.5,Math.min(1.6,e/160));r.grav=-90,I_(ey.x-r.pos.x,ey.y-r.pos.y,ey.z-r.pos.z,t,r.grav,$v),r.vel.set($v.x,$v.y,$v.z),r.tx=ey.x,r.ty=ey.y,r.tz=ey.z}else r.owner=-1,r.vel.set(e.fwd.x*120,70,e.fwd.z*120),r.grav=-90;r.spin=20,qh(r.kind===`ball`?.8:1.2),Hp(.5,r.pos,r.kind===`ball`?`FETCH! `:`NOPE! `),Ep(r.kind===`ball`?`FETCH!`:`NOPE!`,r.pos,`#7dff6a`,30),n++}}return n}function sy(e,t,n,r){for(let i of Lv){if(!i.active||i.back)continue;let a=i.pos.x-e,o=i.pos.y-t,s=i.pos.z-n;if(!(a*a+o*o+s*s>r*r)){for(let e=0;e<6;e++)Cd.spawn(i.pos.x,i.pos.y,i.pos.z,(Math.random()-.5)*30,Math.random()*20,(Math.random()-.5)*30,.4,1.5,8257386,-20,1);ry(i)}}}function cy(e){e.kind===`cuke`?(ah(1.2,`cucumber`),Jh(1),xg(),Ep(`!`,ey.set(K.pos.x,q.headY+K.y+18,K.pos.z),`#7dff6a`,64)):e.kind===`bomb`?(ah(1.5,`cucumber`),ih(6,`bomb`),xg(),Ep(`!!`,ey.set(K.pos.x,q.headY+K.y+18,K.pos.z),`#7dff6a`,64)):(ah(.6,`ball`),qh(.7),Ep(`!`,ey.set(K.pos.x,q.headY+K.y+18,K.pos.z),`#d8f04a`,48))}function ly(e,t){if(zv===ig.n||(zv=ig.n,!Rv))return;let n=W.mode===`play`;for(let r of Lv){if(!r.active)continue;r.t+=e,r.vel.y+=r.grav*e,r.pos.addScaledVector(r.vel,e);let i=r.g;if(i.position.copy(r.pos),r.kind===`ball`?(i.rotation.x+=r.spin*e,i.rotation.z+=r.spin*.6*e):(i.lookAt(r.pos.x+r.vel.x,r.pos.y+r.vel.y,r.pos.z+r.vel.z),i.rotateZ(t*r.spin)),r.marker.visible){let e=(r.kind===`bomb`?1.8:1.2)*(1+Math.sin(t*14)*.12);r.marker.scale.setScalar(e)}if(r.kind!==`ball`&&Math.random()<.4&&bd.spawn(r.pos.x,r.pos.y,r.pos.z,0,0,0,.35,1.2,14349776,0,1.2),r.back){if(r.owner>=0&&r.onBack){let e=r.pos.x-r.tx,t=r.pos.y-r.ty,n=r.pos.z-r.tz;if(e*e+t*t+n*n<256||r.t>1.8){let t=r.onBack;ry(r),(r.t<=1.8||e*e+n*n<900)&&t(r.owner,r.pos);continue}}(r.pos.y<0||r.t>4)&&(r.pos.y<0&&bg(r.pos.x,1,r.pos.z,8,25,8257386),ry(r));continue}let a=r.pos.x-K.pos.x,o=r.pos.z-K.pos.z,s=r.kind===`bomb`?22:r.kind===`ball`?q.radius+4:14;if(n&&Math.hypot(a,o)<s&&r.pos.y<q.headY+K.y+6&&r.pos.y>K.y-6&&(r.kind!==`bomb`||r.pos.y<8))cy(r),r.kind===`bomb`?bg(r.pos.x,2,r.pos.z,24,60):r.kind===`cuke`&&bg(r.pos.x,r.pos.y,r.pos.z,10,30,8257386),ry(r);else if(r.pos.y<=(r.kind===`ball`?4:0)){if(r.kind===`ball`){r.pos.y=4,r.vel.y=L_(r.vel.y,.62,10)||0,r.vel.y>0&&(r.bounces++,r.bounces<6&&qh(1.4-r.bounces*.1)),r.vel.x*=.985,r.vel.z*=.985,r.t>5&&(bd.spawn(r.pos.x,3,r.pos.z,0,4,0,.6,6,14217290,0,1.5),ry(r));continue}r.kind===`bomb`?(Jh(1.6),bg(r.pos.x,1,r.pos.z,26,65),n&&Math.hypot(a,o)<26&&cy(r)):(Jh(.6),bg(r.pos.x,1,r.pos.z,8,25,8257386),n&&Math.hypot(a,o)<14&&cy(r)),ry(r)}else r.t>8&&ry(r)}}function uy(){for(let e of Lv)ry(e)}function dy(e){let t=0;for(let n of Lv)n.active&&!n.back&&n.kind===e&&t++;return t}var fy=new Av(`mechaDog`,`MECHA-DOG`,[.5],[`GOOD BOY?`,`BAD DOG!`]),py=null,my=!1,hy=20,gy=26,_y=Nv(new B({color:15002095,roughness:.3,metalness:.12})),vy=Nv(new B({color:5923180,roughness:.45,metalness:.15})),yy=Nv(new B({color:16724016,emissive:16715792,emissiveIntensity:1.6})),by=new B({color:14165547,roughness:.5}),xy=new B({color:16763955,roughness:.3,metalness:.7}),Sy=new B({color:1382170,roughness:.2}),Cy=new B({color:5635959,emissive:2293589,emissiveIntensity:1.2}),wy=new ki(1,1,1),Ty=new ji(1,1,1,12),Ey=new $a(1,14,10),Dy=new Mi(1,1,4),Oy=wd(16773544),ky=new Qa(.8,1,24,1,Math.PI/2-.65,1.3),Z={g:new L,body:new L,head:new L,jaw:new Mn,tail:new L,cannon:new Mn,legs:[],rings:[],ringT:[0,0,0],pos:new I,yaw:0,vy:0,state:`off`,t:0,barkT:4,step:0,cdx:0,cdz:1,chargeHit:!1,balls:0,headVel:new I,headSpin:0,boomT:0,plough:0},Ay=new I,jy=new I;function My(e,t,n,r,i,a,o,s,c){let l=new z(t,n);return l.scale.set(r,i,a),l.position.set(o,s,c),l.castShadow=!0,e.add(l),l}function Ny(){if(my)return;my=!0;let{g:e,body:t,head:n,tail:r}=Z;e.add(t),My(t,wy,_y,16,13,32,0,26,0),My(t,wy,vy,16.4,3,30,0,21,0),My(t,wy,vy,10,2,20,0,33,-2);let i=new L;i.position.set(0,36,-6),My(i,Ty,vy,3.2,10,3.2,0,4,0).rotation.x=0;let a=My(i,Ty,_y,2.6,12,2.6,0,6,4);a.rotation.x=Math.PI/2-.5;let o=new Mn;o.position.set(0,10,9),i.add(o),Z.cannon=o,t.add(i);let s=My(t,Ty,by,9.5,3,9.5,0,31,15);s.rotation.x=Math.PI/2-.4,My(t,Ty,xy,2.4,.6,2.4,0,26,19.5).rotation.x=Math.PI/2,n.position.set(0,36,19),My(n,wy,_y,13,11,12,0,2,0),My(n,wy,_y,8,6,10,0,-.5,9),My(n,Ey,Sy,2,1.6,1.6,0,1.5,14);let c=new L;c.position.set(0,-3.5,4),My(c,wy,vy,7,2,10,0,0,5),n.add(c),Z.jaw=c;for(let e of[-1,1]){My(n,wy,yy,2.6,1.6,.6,e*3.4,4,6.1);let t=My(n,Dy,vy,3.4,8,2,e*4.6,10.5,-2);t.rotation.z=-e*.35}t.add(n);for(let[e,n]of[[-6.5,11],[6.5,11],[-6.5,-11],[6.5,-11]]){let r=new L;r.position.set(e,21,n),My(r,Ty,vy,3,16,3,0,-8,0),My(r,wy,_y,6,4,8,0,-17,1.5),t.add(r),Z.legs.push(r)}r.position.set(0,30,-16),My(r,Ty,vy,.6,16,.6,0,8,0),My(r,Ey,Cy,2,2,2,0,16.5,0),r.rotation.x=-.5,t.add(r),e.traverse(e=>e.castShadow=!0),e.visible=!1,J.add(e);for(let e=0;e<3;e++){let e=new z(ky,Oy.clone());e.rotation.x=-Math.PI/2,e.renderOrder=9,e.visible=!1,J.add(e),Z.rings.push(e)}fy.flashOn(_y,vy)}function Py(e){Z.state=e,Z.t=0}function Fy(){Ny(),wg(Z.pos,230,60),Z.pos.y=320,Z.vy=-40,Z.yaw=Math.atan2(K.pos.x-Z.pos.x,K.pos.z-Z.pos.z),Z.barkT=3,Z.g.visible=!0,Z.g.position.copy(Z.pos),Z.body.rotation.set(0,0,0),Z.head.position.set(0,36,19),Z.head.rotation.set(0,0,0),Z.head.parent!==Z.body&&Z.body.add(Z.head),fy.spawn(G_(py,`hp`,80),3),Py(`drop`),Qh(),Ap(`MECHA-DOG!`,`#ff3e3e`,2)}function Iy(e,t,n){let r=K.pos.x-e,i=K.pos.z-t,a=Math.hypot(r,i)||1;Fv(r/a*n,i/a*n)}function Ly(e,t,n=!0){let r=fy.hit(e,t,`CLANK!`,n);r===`phase`?(Ap(`BAD DOG!`,`#ff3e3e`,2),Xh(),Qh(),jp(.4),kd(.5),Py(`aim`)):r===`dead`&&Ry()}function Ry(){Py(`dying`),Z.boomT=0;for(let e of Z.rings)e.visible=!1;Ay.set(Z.pos.x,gy,Z.pos.z),Hp(120,Ay,`MECHA-DOG `),Ap(`GOOD BOY. NOT.`,`#ffd24a`,2),$h(),Bu(`ultra`,W.cat.voice),Am(`mechaDog`,Ay,!0),G.hitStop=.25,jp(.7),kd(1)}function zy(){Z.cannon.getWorldPosition(jy),ay(jy.x,jy.y,jy.z,K.pos.x+K.vel.x*.8,K.pos.z+K.vel.z*.8,70,0,By)&&(Gh(),Iu(.4))}function By(){fy.up&&!fy.dead&&(Ay.set(Z.pos.x,32,Z.pos.z),Ly(P_(M_,`ball`),Ay))}function Vy(e,t,n){return t!==`ball`||!fy.up||fy.dead?!1:(n.set(Z.pos.x,32,Z.pos.z),!0)}function Hy(){Xh(),kd(.25);for(let e=0;e<3;e++)Z.ringT[e]=-e*.12;let e=K.pos.x-Z.pos.x,t=K.pos.z-Z.pos.z,n=Math.hypot(e,t)||1,r=Math.sin(Z.yaw),i=Math.cos(Z.yaw);W.mode===`play`&&n<130&&(e*r+t*i)/n>.75&&(ah(.8,`bark`),ih(8,`bark`),xg(),Iy(Z.pos.x,Z.pos.z,70))}function Uy(e,t){if(!fy.spawned&&W.mode===`play`&&G.elapsed>=fy.spawnAt&&Fy(),ly(e,t),Z.state===`off`)return;fy.tick(e),Z.t+=e;let n=W.mode===`play`,r=K.pos.x-Z.pos.x,i=K.pos.z-Z.pos.z,a=Math.hypot(r,i)||1,o=Math.atan2(r,i),s=G_(py,`speed`,22),c=G_(py,`charge`,120),l=0,u=0;switch(Z.state){case`drop`:if(Z.vy-=160*e,Z.pos.y+=Z.vy*e,Z.yaw=o,Z.pos.y<=0){Z.pos.y=0,Iu(2),gg(Z.pos.x,4,Z.pos.z,1.2,Wy),kg(Z.pos.x,Z.pos.z,30,40,0,0,40),kd(.9);for(let e=0;e<30;e++){let t=e/30*Math.PI*2;bd.spawn(Z.pos.x+Math.cos(t)*20,2,Z.pos.z+Math.sin(t)*20,Math.cos(t)*80,4,Math.sin(t)*80,1.2,5,13222582,0,1.5)}Xh(),Py(`chase`)}break;case`chase`:Z.yaw=Mg(Z.yaw,o,2.2,e),l=a>60?s*(a>200?1.6:1):0,u=l>0?1:.2,Z.barkT-=e,n&&Z.barkT<=0&&a<150&&(Py(`bark`),Zh(.6)),fy.phase>=2&&Z.t>2.5&&n&&Py(`aim`);break;case`bark`:Z.yaw=Mg(Z.yaw,o,3,e),Z.head.rotation.x=-Math.min(.5,Z.t*1.2),Z.jaw.rotation.x=Math.min(.6,Z.t),yy.emissiveIntensity=1.6+Math.sin(t*40)*1.2,Z.t>.6&&(Hy(),Z.head.rotation.x=.25,Z.barkT=G_(py,`bark`,4)*(fy.phase>=2?.8:1),Py(`chase`));break;case`aim`:Z.yaw=Mg(Z.yaw,o,4,e),Z.body.position.y=-2.5*Math.min(1,Z.t*3),yy.emissiveIntensity=2.5+Math.sin(t*30)*1.5,Math.random()<.5&&bd.spawn(Z.pos.x+Math.sin(Z.yaw)*10,1,Z.pos.z+Math.cos(Z.yaw)*10,-Math.sin(Z.yaw)*40,10,-Math.cos(Z.yaw)*40,.6,3,13222582,0,1.5),Z.t>.15&&Z.t-e<=.15&&Zh(.8),Z.t>.9&&(Z.cdx=Math.sin(Z.yaw),Z.cdz=Math.cos(Z.yaw),Z.chargeHit=!1,Z.body.position.y=0,zu(),Py(`charge`));break;case`charge`:{l=c,u=2.2;let e=kg(Z.pos.x+Z.cdx*16,Z.pos.z+Z.cdz*16,20,60,Z.cdx,Z.cdz,70);e>0&&(Hp(e,Ay.set(Z.pos.x,30,Z.pos.z),`DOG DID IT `,!1),kd(.15)),!Z.chargeHit&&n&&a<hy+q.radius+6&&!K.air&&(Z.chargeHit=!0,ah(.6,`charge`),ih(6,`charge`),xg(),Fv(Z.cdx*140+r/a*60,Z.cdz*140+i/a*60,.5),Iu(1.4),kd(.6)),(Z.t>2.2||Math.abs(Z.pos.x+Z.cdx*30)>Y.half-20||Math.abs(Z.pos.z+Z.cdz*30)>Y.half-20)&&Py(`skid`);break}case`skid`:l=c*Math.max(0,1-Z.t/.6),u=.3,Math.random()<.8&&bd.spawn(Z.pos.x,2,Z.pos.z,(Math.random()-.5)*30,8,(Math.random()-.5)*30,.8,5,13222582,0,1.5),Z.t>.6&&(Z.balls=0,Py(`fetch`));break;case`fetch`:Z.yaw=Mg(Z.yaw,o,3,e),n&&Z.balls<3&&Z.t>.3+Z.balls*.35&&(zy(),Z.balls++),Z.t>1.6&&Py(`chase`);break;case`dying`:Z.body.rotation.z=Math.min(Math.PI/2,Z.t*1.2)*.9,Z.body.position.y=-Math.min(6,Z.t*4),Z.boomT-=e,Z.boomT<=0&&Z.t<1.6&&(Z.boomT=.22,gg(Z.pos.x+(Math.random()-.5)*30,15+Math.random()*20,Z.pos.z+(Math.random()-.5)*30,1)),Z.t>.15&&Z.head.parent===Z.body&&(Z.head.getWorldPosition(jy),Z.body.remove(Z.head),Z.head.position.copy(jy),Z.head.rotation.set(0,Z.yaw,0),J.add(Z.head),Z.headVel.set((Math.random()-.5)*50,80,(Math.random()-.5)*50),Z.headSpin=8,qh(.6)),Z.head.parent===J&&(Z.headVel.y-=120*e,Z.head.position.addScaledVector(Z.headVel,e),Z.head.rotation.x+=Z.headSpin*e,Z.head.position.y<6&&Z.headVel.y<0&&(Z.head.position.y=6,Z.headVel.y=Math.abs(Z.headVel.y)*.5,Z.headVel.x*=.6,Z.headVel.z*=.6,Z.headSpin*=.5,Z.headVel.y>12&&qh(.5))),Z.t>1.6&&Z.t-e<=1.6&&(gg(Z.pos.x,20,Z.pos.z,3),jp(.6)),Z.t>1.6&&Math.random()<.7&&Cd.spawn(Z.pos.x+(Math.random()-.5)*20,10,Z.pos.z+(Math.random()-.5)*20,0,18,0,1.2,3+Math.random()*3,Math.random()<.3?16747050:4868682,4,2),Z.t>6&&Py(`wreck`);break;case`wreck`:Z.body.position.y-=e*5,Z.head.parent===J&&(Z.head.position.y-=e*5),Z.t>3&&(Z.g.visible=!1,Z.head.parent===J&&J.remove(Z.head),Z.body.add(Z.head),Z.state=`off`,fy.up=!1)}if(Z.state!==`aim`&&Z.state!==`bark`&&Z.state!==`dying`&&Z.state!==`wreck`&&(yy.emissiveIntensity=1.6,Z.head.rotation.x*=Math.max(0,1-e*6),Z.jaw.rotation.x*=Math.max(0,1-e*6)),l>0){let t=Z.state===`charge`||Z.state===`skid`?Z.cdx:Math.sin(Z.yaw),n=Z.state===`charge`||Z.state===`skid`?Z.cdz:Math.cos(Z.yaw),r=Y.half-25;if(Z.pos.x=Math.max(-r,Math.min(r,Z.pos.x+t*l*e)),Z.pos.z=Math.max(-r,Math.min(r,Z.pos.z+n*l*e)),Z.state===`chase`&&(Z.plough-=e,Z.plough<=0)){Z.plough=.15;let e=kg(Z.pos.x+t*12,Z.pos.z+n*12,14,22,t,n,30);e>0&&Hp(e,Ay.set(Z.pos.x,20,Z.pos.z),`DOG DID IT `,!1)}}Z.step+=e*(u>0?4+u*4:0);for(let e=0;e<4;e++)Z.legs[e].rotation.x=u>0?Math.sin(Z.step+(e===0||e===3?0:Math.PI))*.45*Math.min(1,u):0;Z.tail.rotation.z=Math.sin(t*(fy.phase>=2?14:8))*.5,Cy.emissiveIntensity=Math.sin(t*6)>0?1.6:.2,Z.state!==`dying`&&Z.state!==`wreck`&&(Z.body.position.y=Z.state===`aim`?Z.body.position.y:Math.abs(Math.sin(Z.step))*1.2*Math.min(1,u)),Z.state!==`drop`&&(a<200||Z.state===`dying`)&&fy.focus(Z.pos.x,Z.pos.z,Z.state===`dying`?1:Math.min(1,(200-a)/80)),Z.g.position.copy(Z.pos),Z.g.rotation.y=Z.state===`charge`||Z.state===`skid`?Math.atan2(Z.cdx,Z.cdz):Z.yaw,Z.state!==`drop`&&Z.state!==`dying`&&Z.state!==`wreck`&&Tg(Z.pos.x,Z.pos.z,18,e);for(let t=0;t<3;t++){let n=Z.rings[t];if(Z.ringT[t]===0&&!n.visible)continue;Z.ringT[t]+=e;let r=Z.ringT[t];r<0||(r>.5?(n.visible=!1,Z.ringT[t]=0):(n.visible=!0,n.position.set(Z.pos.x+Math.sin(Z.yaw)*20,18-r*24,Z.pos.z+Math.cos(Z.yaw)*20),n.rotation.set(-Math.PI/2,0,Z.yaw+Math.PI),n.scale.setScalar(20+r*220),n.material.opacity=.9*(1-r/.5)))}}var Wy=[14078150,12235430,16765514],Gy=()=>fy.up&&!fy.dead&&Z.state!==`off`&&Z.state!==`drop`,Ky={id:`mechaDog`,boss:!0,init(){Ny()},begin(e,t){py=e,fy.begin(e,t,40)},update:Uy,clear(){fy.reset(),py=null,Z.state=`off`,Z.g.visible=!1,Z.head.parent===J&&(J.remove(Z.head),Z.body.add(Z.head));for(let e of Z.rings)e.visible=!1;Z.ringT.fill(0)},alive(){return+!!Gy()},onSwat(e){oy(e,Vy),Gy()&&lg(e,Z.pos.x,gy,Z.pos.z,hy,40)&&Ly(P_(M_,`swat`,{power:e.power}),Ay.set(e.strike.x,e.strike.y,e.strike.z))},onPounceLand(e,t,n){Gy()&&dg(e,t,n,Z.pos.x,Z.pos.z,hy)&&(Ly(P_(M_,`pounce`),Ay.set(Z.pos.x,36,Z.pos.z)),Z.body.position.y=-3)},onLaser(e){Gy()&&fg(e,Z.pos.x,gy,Z.pos.z,24)&&fy.laserOnce()&&(Ly(P_(M_,`laser`,{frames:ig.dt*60}),Ay.copy(e),!1),Math.random()<.5&&Cd.spawn(e.x,e.y,e.z,(Math.random()-.5)*20,20,(Math.random()-.5)*20,.5,2.5,16747050,-10,1))},onBlast(e){Gy()&&ug(e,Z.pos.x,Z.pos.z,hy)&&Ly(P_(M_,`blast`,{power:e.power}),Ay.set(Z.pos.x,34,Z.pos.z))}};function qy(e){fy.setHpFrac(e),fy.phase>=2&&Z.state===`chase`&&Py(`aim`)}var Jy=()=>({state:Z.state,hp:fy.hp,maxHp:fy.maxHp,phase:fy.phase,x:Z.pos.x,z:Z.pos.z});function Yy(e){return Gy()?(e.set(Z.pos.x,30,Z.pos.z),!0):!1}var Xy=4,Zy=[],Qy=new K_,$y=null,eb=!1,tb=560,nb=160,rb=new B({color:10134445,roughness:.4,metalness:.3,side:2}),ib=new B({color:5989229,roughness:.5,metalness:.3}),ab=new B({color:8312575,roughness:.05,metalness:.2}),ob=new B({color:6274890,roughness:.4}),sb=new Kr({color:16756810,transparent:!0,opacity:.85}),cb=new B({color:6274890,roughness:.5}),lb=(()=>{let e=new Fr,t=new Float32Array([0,0,12,-14,0,-10,14,0,-10,0,0,12,14,0,-10,-14,0,-10]);return e.setAttribute(`position`,new br(t,3)),e.computeVertexNormals(),e})(),ub=new ji(1.4,2.4,24,10).rotateX(Math.PI/2),db=new Mi(1.4,6,10).rotateX(Math.PI/2).translate(0,0,15),fb=new $a(1.6,10,8),pb=new ki(.5,6,6),mb=new Ai(1.2,4,3,8).rotateX(Math.PI/2),hb=new Mi(1.8,7,8).rotateX(-Math.PI/2).translate(0,0,-15.5),gb=new I,_b=new I;function vb(){let e=new L,t=new z(lb,rb),n=new z(ub,ib),r=new z(db,cb),i=new z(fb,ab);i.scale.set(1,.8,2.2),i.position.set(0,1.4,5);let a=new z(pb,ib);a.position.set(0,3.2,-8),a.rotation.x=-.4;let o=new z(hb,sb);e.add(t,n,r,i,a,o);let s=[];for(let t of[-6,0,6]){let n=new z(mb,ob);n.position.set(t,-1.8,-2),e.add(n),s.push(n)}return e.traverse(e=>e.castShadow=!0),e.visible=!1,J.add(e),{g:e,bombs:s,flame:o,state:`off`,ax:0,az:0,dx:1,dz:0,s:0,pass:0,dropped:0,roared:!1,pos:new I,vel:new I,spin:0,bank:0}}function yb(e,t){e.dx=Math.sin(t),e.dz=Math.cos(t);let n=1.2;e.ax=K.pos.x+K.vel.x*n,e.az=K.pos.z+K.vel.z*n,e.s=-560,e.dropped=0,e.roared=!1;for(let t of e.bombs)t.visible=!0}function bb(){Zy.length||Tb.init();let e=Zy.find(e=>e.state===`off`);return e?(e.state=`fly`,e.pass=0,e.bank=0,yb(e,Math.random()*Math.PI*2),e.g.visible=!0,eb||(eb=!0,Ap(innerWidth<600?`CUCUMBER JETS!`:`CUCUMBER JETS! POUNCE THEM LOW`,`#7dff6a`)),!0):!1}function xb(e,t,n=`JET! `){e.state===`fly`&&(e.state=`fall`,e.vel.set(e.dx*70+(Math.random()-.5)*30,15,e.dz*70+(Math.random()-.5)*30),e.spin=10,t&&(gb.copy(e.pos),Am(`cucumberJet`,gb),Hp(G_($y,`value`,8),gb,n),Ep(`SPLASHED DOWN!`,gb,`#7dff6a`,28),Bu(`short`,W.cat.voice),kd(.4),G.hitStop=.08))}function Sb(e,t){Qy.tick(G.elapsed,Tb.alive(),Ng())&&bb();let n=W.mode===`play`,r=G_($y,`speed`,130),i=G_($y,`alt`,120),a=G_($y,`low`,70),o=G_($y,`passes`,3);for(let t of Zy){if(t.state===`off`)continue;let s=t.g;if(t.state===`fly`){t.s+=r*e;let c=Math.max(0,1-Math.abs(t.s)/nb),l=c*c*(3-2*c);if(t.pos.set(t.ax+t.dx*t.s,i-(i-a)*l,t.az+t.dz*t.s),!t.roared&&t.s>-288&&(t.roared=!0,tg()),n&&t.dropped<3){let e=(t.dropped-1)*30,n=1.15;t.s>=e-r*.35*n&&(_b.set(t.ax+t.dx*e,0,t.az+t.dz*e),iy(`bomb`,t.pos.x,t.pos.y-3,t.pos.z,_b.x,0,_b.z,n,-1,null,-90)&&(Kh(n),t.bombs[t.dropped].visible=!1),t.dropped++)}if(t.s>tb){if(t.pass++,t.pass>=o||!n){t.state=`off`,s.visible=!1;continue}yb(t,Math.atan2(t.dx,t.dz)+Math.PI+(Math.random()-.5)*1.2),t.pos.set(t.ax+t.dx*t.s,i,t.az+t.dz*t.s)}t.bank+=((t.s<-160?.25:t.s>nb?-.3:0)-t.bank)*Math.min(1,e*2),s.position.copy(t.pos),s.rotation.set(0,Math.atan2(t.dx,t.dz),0),s.rotateX(t.s<0&&l>0?.25*l:-.2*l),s.rotateZ(t.bank),t.flame.scale.set(1,1,.8+Math.random()*.5),Math.random()<.5&&Cd.spawn(t.pos.x-t.dx*18,t.pos.y,t.pos.z-t.dz*18,0,0,0,.3,1.4,14540253,0,1.8)}else if(t.vel.y-=70*e,t.pos.addScaledVector(t.vel,e),s.position.copy(t.pos),s.rotation.y+=t.spin*e,s.rotation.z+=3*e,Cd.spawn(t.pos.x,t.pos.y,t.pos.z,0,4,0,.6,1.8,Math.random()<.5?16747050:5592405,6,1.5),t.pos.y<3){t.state=`off`,s.visible=!1,gg(t.pos.x,4,t.pos.z,1.4),jp(.3);let e=Kf(t.pos.x,t.pos.z,22,0,60,qf(t.pos.x,t.pos.z,45,40));e>0&&Hp(e,t.pos,`CRASH `)}}ly(e,t)}var Cb=e=>e.state===`fly`,wb=()=>!1,Tb={id:`cucumberJet`,init(){if(!Zy.length)for(let e=0;e<Xy;e++)Zy.push(vb())},begin(e){$y=e,Qy.reset(e),eb=!1},update:Sb,clear(){for(let e of Zy)e.state=`off`,e.g.visible=!1;uy(),$y=null,Qy.reset(null)},alive(){let e=0;for(let t of Zy)Cb(t)&&e++;return e},onSwat(e){oy(e,wb);for(let t of Zy)Cb(t)&&t.pos.y<95&&lg(e,t.pos.x,t.pos.y,t.pos.z,16,40)&&xb(t,!0,`SWAT! `)},onPounceAir(e,t){for(let n of Zy)Cb(n)&&n.pos.y<100&&hg(e,t,n.pos.x,n.pos.y,n.pos.z,12)&&xb(n,!0,`POUNCE! `)},onLaser(e){sy(e.x,e.y,e.z,8);for(let t of Zy)Cb(t)&&fg(e,t.pos.x,t.pos.y,t.pos.z,16)&&xb(t,!0,`ZAPPED! `)},onLaserSweep(e,t,n){for(let r of Zy)Cb(r)&&pg(e,t,n,r.pos.x,r.pos.z,230,.86)&&xb(r,!0,`ZAPPED! `)},onBlast(e){for(let t of Zy)Cb(t)&&t.pos.y<110&&ug(e,t.pos.x,t.pos.z,30)&&xb(t,!0)},onFrenzy(){for(let e of Zy)xb(e,!1)}},Eb=()=>Zy.filter(e=>e.state!==`off`).map(e=>({x:e.pos.x,y:e.pos.y,z:e.pos.z,s:e.s,state:e.state})),Db=14,Ob=1.6,kb=6*Ob,Ab=[],jb=new K_,Mb=null,Nb=!1,Pb=new B({color:15330543,roughness:.35,metalness:.1}),Fb=new B({color:2830134,roughness:.3,metalness:.4}),Ib=new B({color:1382170,roughness:.9}),Lb=new B({color:16719920,emissive:16711696,emissiveIntensity:1.5}),Rb=new B({color:1382170}),zb=new B({color:5030911,roughness:.8}),Bb=new ji(6,6.2,2.2,24),Vb=new ji(4.6,5.4,.8,24),Hb=new eo(6.1,.7,6,24,Math.PI*1.1).rotateX(Math.PI/2).rotateY(-Math.PI*.05-Math.PI/2+Math.PI*.5),Ub=new $a(1,10,8),Wb=new ki(3.2,.5,.6),Gb=new ki(4.5,.25,.4).translate(2.2,0,0),Kb=new ji(.15,.15,3,4).translate(0,1.5,0),qb=new $a(.5,8,6),Jb=new I,Yb=new I,Xb={x:0,z:0,n:0};function Zb(){let e=new L,t=new z(Bb,Pb);t.position.y=1.6;let n=new z(Vb,Fb);n.position.y=3;let r=new z(Hb,Ib);r.position.y=1.4;let i=new z(Ub,Lb);i.position.set(0,2.9,4.4);let a=new z(Wb,Rb);a.position.set(0,4,4.1),a.rotation.z=.25;let o=new L;o.position.set(4.6,.5,4.2);for(let e=0;e<3;e++){let t=new z(Gb,zb);t.rotation.y=e*Math.PI*2/3,o.add(t)}let s=new z(Kb,Ib);s.position.set(-2.5,3.2,-2.5),s.rotation.z=.3;let c=new z(qb,Lb);return c.position.set(-3.3,6,-2.5),e.add(t,n,r,i,a,o,s,c),e.traverse(e=>e.castShadow=!0),e.visible=!1,J.add(e),e.scale.setScalar(Ob),{g:e,brush:o,pos:new I,vel:new I,yaw:0,state:`off`,t:0,scale:1,minion:!1,stuck:0,detour:0}}function Qb(e,t,n=!1,r=0,i=0){Ab.length||nx.init();let a=Ab.find(e=>e.state===`off`);return a?(a.state=`chase`,a.t=0,a.stuck=0,a.detour=0,a.minion=n,a.pos.set(e,n?10:0,t),a.vel.set(r,n?30:0,i),a.yaw=Math.atan2(K.pos.x-e,K.pos.z-t),a.scale=1,a.g.scale.setScalar(Ob),a.g.rotation.set(0,a.yaw,0),a.g.position.copy(a.pos),a.g.visible=!0,!0):!1}var $b=e=>e.state===`chase`||e.state===`retreat`;function ex(e,t,n,r=`UNPLUGGED! `){$b(e)&&(e.state=`pop`,e.t=0,e.vel.set(t*30,60,n*30),Yb.set(e.pos.x,8,e.pos.z),Am(`vacuum`,Yb),Hp(G_(Mb,`value`,3),Yb,r),Ep(`UNPLUGGED!`,Yb.setY(26),`#4cc3ff`,26),eg(),yg(e.pos.x,4,e.pos.z,14))}function tx(e,t){jb.tick(G.elapsed,nx.alive(),Ng())&&(wg(Jb,230,70),Qb(Jb.x,Jb.z),Nb||(Nb=!0,Ap(innerWidth<600?`VACUUMS!`:`ROBOT VACUUMS! KEEP MOVING`,`#4cc3ff`)));let n=W.mode===`play`,r=G_(Mb,`speed`,26),i=G_(Mb,`range`,40),a=G_(Mb,`tug`,18),o=G_(Mb,`slow`,.7),s=G_(Mb,`soak`,3);Xb.x=Xb.z=0,Xb.n=0;let c=1e9;Lb.emissiveIntensity=Math.sin(t*7)>-.6?1.6:.1;for(let o of Ab){if(o.state===`off`)continue;o.t+=e;let l=o.g,u=K.pos.x-o.pos.x,d=K.pos.z-o.pos.z,f=Math.hypot(u,d)||1;if(o.state===`chase`||o.state===`retreat`){if(o.pos.y>0||o.vel.y>0)o.vel.y-=120*e,o.pos.addScaledVector(o.vel,e),o.pos.y<=0&&(o.pos.y=0,o.vel.set(0,0,0),bd.spawn(o.pos.x,1,o.pos.z,0,3,0,.5,5,14078150,0,1.5));else{let t=o.state===`retreat`,c=t?Math.atan2(-u,-d):Math.atan2(u,d);o.detour!==0&&(c+=Math.sign(o.detour)*Math.PI*.5,o.detour-=Math.sign(o.detour)*e,Math.abs(o.detour)<e&&(o.detour=0)),o.yaw=Mg(o.yaw,c,t?6:5,e);let p=!t&&f<q.radius+kb,m=(t?r*1.5:r)*+!p*(n||t?1:.3),h=o.pos.x,g=o.pos.z;if(Cg(o.pos,Math.sin(o.yaw)*m*e,Math.cos(o.yaw)*m*e,10.600000000000001),!t&&!p&&n&&m>0&&e>0&&(o.stuck=Math.hypot(o.pos.x-h,o.pos.z-g)<m*e*.35?o.stuck+e:Math.max(0,o.stuck-e*2),o.stuck>.5&&o.detour===0&&(o.detour=(Math.random()<.5?-1:1)*1.2),o.stuck>4&&(wg(Jb,180,60),o.pos.set(Jb.x,0,Jb.z),o.stuck=0,o.detour=0,bd.spawn(o.pos.x,1,o.pos.z,0,3,0,.5,5,14078150,0,1.5))),t&&o.t>2.5){if(o.scale-=e*1.5,o.scale<=.05){o.state=`off`,l.visible=!1;continue}l.scale.setScalar(o.scale*Ob)}if(!t&&n&&f<i&&!K.air){let t=1-f/(i*1.2);if(Xb.x-=u/f*a*t,Xb.z-=d/f*a*t,Xb.n++,ih(s*e,`vacuum`),Math.random()<.5){let e=q.radius*(.5+Math.random()),t=Math.random()*Math.PI*2,n=K.pos.x+Math.cos(t)*e,r=K.pos.z+Math.sin(t)*e;bd.spawn(n,1+Math.random()*10,r,(o.pos.x-n)*2.2,-2,(o.pos.z-r)*2.2,.45,1.4,14735044,0,-.5)}}mg(o.pos.x,o.pos.z,kb)&&ex(o,sg.nx,sg.nz,`BULLDOZED! `)}l.position.set(o.pos.x,o.pos.y+Math.abs(Math.sin(t*20+o.pos.x))*.3,o.pos.z),l.rotation.set(0,o.yaw,0),o.brush.rotation.y+=e*25,o.state===`chase`&&(c=Math.min(c,f))}else o.state===`pop`&&(o.vel.y-=120*e,o.pos.addScaledVector(o.vel,e),l.position.copy(o.pos),l.rotation.x+=e*12,l.rotation.z+=e*7,Math.random()<.6&&yg(o.pos.x,o.pos.y+2,o.pos.z,1),o.pos.y<=0&&o.t>.2&&(gg(o.pos.x,3,o.pos.z,.5),o.state=`off`,l.visible=!1))}if(Xb.n>0){let e=Math.hypot(Xb.x,Xb.z),t=a*1.6,n=e>t?t/e:1;oh(Xb.x*n,Xb.z*n),sh(o)}n&&c<1e8&&og(Math.max(0,1-c/200),1)}var nx={id:`vacuum`,init(){if(!Ab.length)for(let e=0;e<Db;e++)Ab.push(Zb())},begin(e){Mb=e,jb.reset(e),Nb=!1},update:tx,clear(){for(let e of Ab)e.state=`off`,e.g.visible=!1;Mb=null,jb.reset(null)},alive(){let e=0;for(let t of Ab)t.state===`chase`&&!t.minion&&e++;return e},onSwat(e){for(let t of Ab)$b(t)&&lg(e,t.pos.x,t.pos.y+3,t.pos.z,10.600000000000001)&&ex(t,e.fwd.x,e.fwd.z,`SWAT! `)},onPounceLand(e,t,n){for(let r of Ab)$b(r)&&dg(e,t,n,r.pos.x,r.pos.z,kb)&&ex(r,sg.nx,sg.nz,`SQUASH! `)},onLaser(e){for(let t of Ab)$b(t)&&fg(e,t.pos.x,t.pos.y+3,t.pos.z,12.600000000000001)&&ex(t,sg.nx,sg.nz,`ZAPPED! `)},onBlast(e){for(let t of Ab)$b(t)&&ug(e,t.pos.x,t.pos.z,kb)&&ex(t,sg.nx,sg.nz)},onFrenzy(){for(let e of Ab)e.state===`chase`&&(e.state=`retreat`,e.t=0)}},rx=()=>Ab.filter(e=>e.state!==`off`).map(e=>({x:e.pos.x,z:e.pos.z,state:e.state,minion:e.minion}));function ix(e,t,n){let r=-1;for(let i of Ab){if(i.state!==`chase`)continue;let a=(i.pos.x-e)**2+(i.pos.z-t)**2;(r<0||a<r)&&(r=a,n.set(i.pos.x,6,i.pos.z))}return r}var ax=new Av(`roombaPrime`,`ROOMBA PRIME`,[.7,.42],[`SUCTION MODE`,`SPIN CYCLE`,`TANK MODE`]),ox=null,sx=!1,cx=1.75,lx=30,ux=12,dx=lx*cx,fx=ux*cx,px=10*cx,mx=Nv(new B({color:3817288,roughness:.3,metalness:.5})),hx=Nv(new B({color:14278373,roughness:.25,metalness:.5})),gx=new B({color:1382170,roughness:.9}),_x=new B({color:10476799,roughness:.05,metalness:.1,transparent:!0,opacity:.45}),vx=new B({color:2788607,roughness:.2,transparent:!0,opacity:.8}),yx=new B({color:724240,roughness:.2}),bx=new B({color:16722474,emissive:16715792,emissiveIntensity:2}),xx=new B({color:5030911,roughness:.8}),Sx=new B({color:7131391,emissive:1731839,emissiveIntensity:.3,metalness:.4}),Cx=new B({color:2369582,roughness:.9}),wx=wd(8382719);wx.opacity=.22;var Tx=wd(5817599),Ex=new ki(1,1,1),Dx=new ji(1,1,1,40),Ox=new $a(1,28,14,0,Math.PI*2,0,Math.PI/2),kx=new eo(30.8,1.8,6,40,Math.PI*.9).rotateX(Math.PI/2).rotateY(Math.PI*.05+Math.PI),Ax=new ki(14,.6,1.2).translate(7,0,0),jx=new ji(1,1.6,4,8).rotateZ(Math.PI/2),Mx=new $a(39,28,14,0,Math.PI*2,0,Math.PI/2),Nx=new Qa(.94,1,64),Q={g:new L,body:new L,brushes:[],eyes:[],mouth:null,water:null,dome:null,shield:null,nozzles:new L,treads:new L,ring:null,pos:new I,yaw:0,spinA:0,state:`off`,t:0,dropT:8,ringT:3,jetT:6,ringR:0,ringOn:!1,ringHit:!1,spinHit:0,boomT:0,plough:0,ringHinted:!1,dizzyHinted:!1},Px=new I;function Fx(e,t,n,r,i,a,o,s,c){let l=new z(t,n);return l.scale.set(r,i,a),l.position.set(o,s,c),l.castShadow=!0,e.add(l),l}function Ix(){if(sx)return;sx=!0;let{g:e,body:t}=Q;e.add(t),Fx(t,Dx,mx,lx,ux,lx,0,7.5,0),Fx(t,Dx,hx,27,1.2,27,0,13.6,0),Fx(t,Dx,mx,24,1.4,24,0,14.4,0);let n=new z(kx,gx);n.position.y=5.5,t.add(n),Fx(t,Ex,yx,22,7,2,0,8,28.8);for(let e of[-1,1])Q.eyes.push(Fx(t,Ex,bx,5,1.4,.6,e*5,9.5,29.9));Q.mouth=Fx(t,Ex,bx,9,1,.6,0,6,29.9),Q.dome=Fx(t,Ox,_x,16,13,16,0,15,-4),Q.water=Fx(t,Dx,vx,15,6,15,0,18,-4);for(let e of[-1,1]){let n=new L;n.position.set(e*24,1.5,22);for(let e=0;e<5;e++){let t=new z(Ax,xx);t.rotation.y=e*Math.PI*2/5,n.add(t)}t.add(n),Q.brushes.push(n)}for(let e=0;e<8;e++){let t=e/8*Math.PI*2,n=new z(jx,Sx);n.position.set(Math.cos(t)*31,11,Math.sin(t)*31),n.rotation.y=-t,Q.nozzles.add(n)}Q.nozzles.visible=!1,t.add(Q.nozzles);for(let e of[-1,1])Fx(Q.treads,Ex,Cx,8,6,lx*1.6,e*26,2,0);Q.treads.visible=!1,e.add(Q.treads),t.scale.setScalar(cx),Q.treads.scale.setScalar(cx),Q.shield=new z(Mx,wx),Q.shield.renderOrder=8,Q.shield.visible=!1,Q.shield.scale.setScalar(cx),e.add(Q.shield),e.traverse(e=>e.castShadow=e!==Q.shield),e.visible=!1,J.add(e),Q.ring=new z(Nx,Tx),Q.ring.rotation.x=-Math.PI/2,Q.ring.renderOrder=9,Q.ring.visible=!1,J.add(Q.ring),ax.flashOn(mx,hx)}function Lx(e){Q.state=e,Q.t=0}function Rx(){Ix(),wg(Q.pos,330,80),Q.yaw=Math.atan2(K.pos.x-Q.pos.x,K.pos.z-Q.pos.z),Q.dropT=6,Q.ringT=3,Q.jetT=5,Q.ringOn=!1,Q.ring.visible=!1,Q.g.visible=!0,Q.body.rotation.set(0,0,0),Q.body.position.set(0,0,0),Q.nozzles.visible=!1,Q.treads.visible=!1,Q.dome.visible=!0,Q.water.visible=!0,Q.ringHinted=Q.dizzyHinted=!1,ax.spawn(G_(ox,`hp`,135),3),Lx(`enter`),Qh(),Ap(`ROOMBA PRIME!`,`#ff3e3e`,2),jp(.4)}var zx=()=>Q.state===`dizzy`,Bx=()=>ax.phase===2&&!zx();function Vx(e,t,n=!0){if(Bx()){ax.blocked(t),wx.opacity=.6;return}let r=ax.hit(e,t,zx()?`CRIT!`:`CLANK!`,n);if(r===`phase`){let e=ax.phase;Ap(e===2?`SPIN CYCLE!`:`TANK MODE!`,`#ff3e3e`,2),Qh(),jp(.5),kd(.6),e===2||(Q.nozzles.visible=!0,Q.treads.visible=!0,Q.body.position.y=4*cx,Q.ringT=1.5),Lx(`roam`)}else r===`dead`&&Hx()}function Hx(){Lx(`dying`),Q.boomT=0,Q.ring.visible=!1,Q.ringOn=!1,Q.shield.visible=!1,Px.set(Q.pos.x,30,Q.pos.z),Hp(500,Px,`ROOMBA PRIME `),Ap(`ROOMBA PRIME: UNPLUGGED!`,`#ffd24a`,2),$h(),Bu(`ultra`,W.cat.voice),Am(`roombaPrime`,Px,!0),G.hitStop=.5,jp(.8),kd(1)}function Ux(e){return!xm().includes(e)}function Wx(e){let[t,n]=Q.eyes;if(zx())t.rotation.z=e*9,n.rotation.z=-e*9,bx.emissive.setHex(16765514),bx.color.setHex(16765514);else{t.rotation.z=-.4,n.rotation.z=.4;let e=Q.state===`spin`||Q.state===`spinUp`;bx.emissive.setHex(e?16747008:16715792),bx.color.setHex(e?16747008:16722474)}Q.mouth.scale.x=ax.phase>=3?12:9,bx.emissiveIntensity=Q.state===`dying`||Q.state===`wreck`?Math.random()*.6:1.6+Math.sin(e*8)*.4}function Gx(e,t){if(!ax.spawned&&W.mode===`play`&&G.elapsed>=ax.spawnAt&&Rx(),Ux(nx)&&nx.update(e,t),Ux(Tb)&&Tb.update(e,t),Q.state===`off`)return;ax.tick(e),Q.t+=e;let n=W.mode===`play`,r=K.pos.x-Q.pos.x,i=K.pos.z-Q.pos.z,a=Math.hypot(r,i)||1,o=Math.atan2(r,i),s=G_(ox,`speed`,16)*(ax.phase>=3?1.3:1),c=0,l=0,u=10;switch(Q.state){case`enter`:Q.yaw=Mg(Q.yaw,o,1,e),c=45,l=.5,(Q.t>2.5||a<160)&&Lx(`roam`);break;case`roam`:Q.yaw=Mg(Q.yaw,o,ax.phase>=3?1.3:.9,e),c=a>dx+q.radius+4?s:0,l=ax.phase===2?.65:1,n&&ax.phase===2&&Q.t>4&&(Lx(`spinUp`),ng(3.6)),n&&ax.phase>=3&&(Q.ringT-=e,Q.ringT<=0&&Lx(`ringUp`));break;case`spinUp`:u=40,Q.spinA+=e*Q.t*20,Q.t>.6&&(Q.spinHit=0,Lx(`spin`));break;case`spin`:{u=60,Q.spinA+=e*22,Q.yaw=Mg(Q.yaw,o,1.4,e),c=62;for(let e=0;e<2;e++){let e=Math.random()*Math.PI*2;Sd.spawn(Q.pos.x+Math.cos(e)*dx,8,Q.pos.z+Math.sin(e)*dx,Math.cos(e)*70,20+Math.random()*15,Math.sin(e)*70,.6,2,5817599,-60,.5)}let t=kg(Q.pos.x,Q.pos.z,54.5,30,Math.sin(Q.yaw),Math.cos(Q.yaw),80);t>0&&Hp(t,Px.set(Q.pos.x,25,Q.pos.z),`ROOMBA DID IT `,!1),Q.spinHit-=e,n&&Q.spinHit<=0&&a<dx+q.radius+4&&!K.air&&(Q.spinHit=1,ah(.8,`spin`),ih(10,`spin`),xg(),Fv(r/a*160,i/a*160,.5),Iu(1.5),kd(.6)),Q.t>3&&(Lx(`dizzy`),qh(.5),Q.dizzyHinted||(Q.dizzyHinted=!0,Ap(innerWidth<600?`DIZZY! POUNCE IT!`:`DIZZY! POUNCE ON IT NOW!`,`#ffd24a`,2)));break}case`dizzy`:if(u=1,Q.body.rotation.z=Math.sin(Q.t*6)*.06,Q.body.rotation.x=Math.cos(Q.t*6)*.06,Math.random()<.6){let e=t*5+Math.random()*.3;Cd.spawn(Q.pos.x+Math.cos(e)*30,53+Math.sin(t*3)*2,Q.pos.z+Math.sin(e)*30,0,0,0,.4,2.2,16769898,0,0)}Q.t>3&&(Q.body.rotation.set(0,0,0),Lx(`roam`));break;case`ringUp`:Sx.emissiveIntensity=1+Math.sin(t*40)*.8,Q.t>.05&&Q.t-e<=.05&&Vu(),Q.t>.8&&(Sx.emissiveIntensity=.3,Q.ringOn=!0,Q.ringR=54.5,Q.ringHit=!1,Q.ringT=5,Jh(2),Q.ringHinted||(Q.ringHinted=!0,Ap(innerWidth<600?`JUMP THE RING!`:`WATER RING! POUNCE OVER IT`,`#58c4ff`,2)),Lx(`roam`));break;case`dying`:u=0,Q.body.rotation.z=Math.sin(Q.t*30)*.03*(1-Q.t/2),Q.boomT-=e,Q.boomT<=0&&Q.t<2&&(Q.boomT=.2,gg(Q.pos.x+(Math.random()-.5)*50,8+Math.random()*14,Q.pos.z+(Math.random()-.5)*50,1.1)),Q.t>.6&&Q.dome.visible&&(Q.dome.visible=!1,Q.water.visible=!1,bg(Q.pos.x,29,Q.pos.z,60,90),Jh(2.5)),Q.t>2&&Q.t-e<=2&&(gg(Q.pos.x,15,Q.pos.z,3.5),jp(.7)),Q.t>2&&Math.random()<.8&&Cd.spawn(Q.pos.x+(Math.random()-.5)*40,12,Q.pos.z+(Math.random()-.5)*40,0,20,0,1.3,3+Math.random()*4,Math.random()<.3?16747050:4868682,4,2),Q.t>6&&Lx(`wreck`);break;case`wreck`:Q.body.position.y-=e*4,Q.t>4&&(Q.g.visible=!1,Q.state=`off`,ax.up=!1)}let d=Q.state!==`dying`&&Q.state!==`wreck`;if(c>0){let t=Y.half-dx-4;if(Q.pos.x=Math.max(-t,Math.min(t,Q.pos.x+Math.sin(Q.yaw)*c*e)),Q.pos.z=Math.max(-t,Math.min(t,Q.pos.z+Math.cos(Q.yaw)*c*e)),Q.state!==`spin`&&(Q.plough-=e,Q.plough<=0)){Q.plough=.12;let e=kg(Q.pos.x+Math.sin(Q.yaw)*10,Q.pos.z+Math.cos(Q.yaw)*10,48.5,16,Math.sin(Q.yaw),Math.cos(Q.yaw),40);e>0&&Hp(e,Px.set(Q.pos.x,18,Q.pos.z),`ROOMBA DID IT `,!1)}}let f=G_(ox,`range`,140);if(d&&n&&l>0&&a<f&&!K.air&&!zx()){let t=Math.max(.35,1-a/(f*1.15))*l,n=G_(ox,`suck`,30)*t;oh(-r/a*n,-i/a*n),sh(.85),ih(G_(ox,`soak`,4.5)*l*e,`roombaPrime`);for(let e=0;e<2;e++){let e=Math.random()*Math.PI*2,t=a*(.4+Math.random()*.7),n=Q.pos.x+r/a*t+Math.cos(e)*20,o=Q.pos.z+i/a*t+Math.sin(e)*20;bd.spawn(n,2+Math.random()*12,o,(Q.pos.x-n)*1.6,-2,(Q.pos.z-o)*1.6,.6,1.6,14735044,0,-.4)}}if(d&&n&&Q.state!==`enter`){if(Q.dropT-=e,Q.dropT<=0&&ax.phase!==2){Q.dropT=ax.phase>=3?14:10;let e=Q.pos.x-Math.sin(Q.yaw)*56.5,t=Q.pos.z-Math.cos(Q.yaw)*56.5;for(let n=0;n<2;n++){let r=n?1:-1;Qb(e+Math.cos(Q.yaw)*r*10,t-Math.sin(Q.yaw)*r*10,!0,Math.cos(Q.yaw)*r*25-Math.sin(Q.yaw)*20,-Math.sin(Q.yaw)*r*25-Math.cos(Q.yaw)*20)}qh(1.2),Ep(`MINIONS!`,Px.set(e,30,t),`#4cc3ff`,24)}ax.phase>=3&&(Q.jetT-=e,Q.jetT<=0&&(Q.jetT=12,Tb.alive()<2&&bb()&&Ap(`AIR SUPPORT!`,`#7dff6a`)))}if(Q.ringOn){Q.ringR+=110*e;let t=Q.ringR;Q.ring.visible=!0,Q.ring.position.set(Q.pos.x,1.5,Q.pos.z),Q.ring.scale.setScalar(t),Q.ring.material.opacity=Math.max(0,.9*(1-t/230));for(let e=0;e<8;e++){let e=Math.random()*Math.PI*2;Sd.spawn(Q.pos.x+Math.cos(e)*t,2,Q.pos.z+Math.sin(e)*t,Math.cos(e)*30,18+Math.random()*16,Math.sin(e)*30,.4,2.2,5817599,-80,.4)}n&&!Q.ringHit&&Math.abs(a-t)<10&&K.y<9&&(Q.ringHit=!0,ih(G_(ox,`ring`,15),`ring`),Fv(r/a*60,i/a*60,.35),Vu(),bg(K.pos.x,4,K.pos.z,18,50)),t>230&&(Q.ringOn=!1,Q.ring.visible=!1)}Q.shield.visible=d&&Bx()&&Q.state!==`enter`,Q.shield.visible&&(wx.opacity+=(.22+Math.sin(t*4)*.05-wx.opacity)*Math.min(1,e*6),Q.shield.rotation.y+=e*.5);for(let t of Q.brushes)t.rotation.y+=e*u*(t.position.x>0?-1:1);Q.water.position.y=18+Math.sin(t*3)*.6,Q.water.rotation.z=Math.sin(t*2)*.05,Wx(t),Q.g.position.set(Q.pos.x,0,Q.pos.z),Q.g.rotation.y=Q.state===`spin`||Q.state===`spinUp`?Q.spinA:Q.yaw,Q.state!==`spin`&&Q.state!==`spinUp`&&(Q.spinA=Q.yaw),d&&Q.state!==`enter`&&Tg(Q.pos.x,Q.pos.z,50.5,e),Q.state===`dying`?ax.focus(Q.pos.x,Q.pos.z,1):d&&a<260&&ax.focus(Q.pos.x,Q.pos.z,Math.min(1,(260-a)/90)),d&&n&&og(Math.max(.25,1-a/400),Q.state===`spin`?.7:.42)}var Kx=()=>ax.up&&!ax.dead&&Q.state!==`off`,qx=()=>Kx()&&Q.state!==`enter`,Jx={id:`roombaPrime`,boss:!0,init(){Ix()},begin(e,t){ox=e,ax.begin(e,t,20)},update:Gx,clear(){ax.reset(),ox=null,Q.state=`off`,Q.g.visible=!1,Q.ring.visible=!1,Q.ringOn=!1},alive(){return+!!Kx()},onSwat(e){Ux(nx)&&nx.onSwat?.(e),Ux(Tb)&&Tb.onSwat?.(e),qx()&&lg(e,Q.pos.x,px,Q.pos.z,dx,40)&&Vx(P_(N_,`swat`,{power:e.power,dizzy:zx()}),Px.set(e.strike.x,Math.min(e.strike.y,25),e.strike.z))},onPounceAir(e,t){Ux(Tb)&&Tb.onPounceAir?.(e,t)},onPounceLand(e,t,n){if(Ux(nx)&&nx.onPounceLand?.(e,t,n),qx()){if(dg(e,t,6,Q.pos.x,Q.pos.z,dx)){let n=P_(N_,`pounce`,{dizzy:zx()});Bx()||(Ep(zx()?`WEAK SPOT x2!`:`WEAK SPOT!`,Px.set(Q.pos.x,40,Q.pos.z),`#ffd24a`,34),yg(e,25,t,20)),Vx(n,Px.set(e,27,t)),Fv(-Math.sin(Q.yaw)*30+(e-Q.pos.x)*1.5,-Math.cos(Q.yaw)*30+(t-Q.pos.z)*1.5,.4)}else dg(e,t,n,Q.pos.x,Q.pos.z,dx)&&Vx(P_(N_,`swat`,{dizzy:zx()}),Px.set(e,fx,t))}},onLaser(e,t){Ux(nx)&&nx.onLaser?.(e,t),Ux(Tb)&&Tb.onLaser?.(e,t),qx()&&fg(e,Q.pos.x,px,Q.pos.z,54.5)&&ax.laserOnce()&&Vx(P_(N_,`laser`,{frames:ig.dt*60,dizzy:zx()}),Px.copy(e),!1)},onLaserSweep(e,t,n){Ux(Tb)&&Tb.onLaserSweep?.(e,t,n)},onBlast(e){Ux(nx)&&nx.onBlast?.(e),Ux(Tb)&&Tb.onBlast?.(e),qx()&&ug(e,Q.pos.x,Q.pos.z,dx)&&Vx(P_(N_,`blast`,{power:e.power,dizzy:zx()}),Px.set(Q.pos.x,25.5,Q.pos.z))},onFrenzy(){Ux(nx)&&nx.onFrenzy?.(),Ux(Tb)&&Tb.onFrenzy?.()}};function Yx(e){let t=ax.phase;ax.setHpFrac(e),ax.phase!==t&&ax.phase>=3&&(Q.nozzles.visible=!0,Q.treads.visible=!0,Q.body.position.y=4*cx,Q.ringT=1),Q.state!==`enter`&&Q.state!==`off`&&Q.state!==`dying`&&Lx(`roam`)}function Xx(e){Q.state!==`off`&&Q.state!==`dying`&&Lx(e)}var Zx=()=>({state:Q.state,hp:ax.hp,maxHp:ax.maxHp,phase:ax.phase,x:Q.pos.x,z:Q.pos.z,shield:Bx()});function Qx(e){return Kx()?(e.set(Q.pos.x,20,Q.pos.z),!0):!1}function $x(e,t,n,r,i){if(Qx(r))return`ROOMBA PRIME`;if(Yy(r))return`MECHA-DOG`;let a=n*n,o=Ov(e,t,r),s=ix(e,t,i);return s>=0&&s<a&&(o<0||s<o)?(r.copy(i),`VACUUM`):o>=0&&o<a?`FIRE TRUCK`:``}var eS=null;function tS(){if(eS)return eS;eS=new Float32Array(256);for(let e=0;e<256;e++)eS[e]=Math.tanh((e/128-1)*5);return eS}function nS(e=1){let t=Au();if(!t)return;let n=t.ctx,r=n.currentTime;H(`sine`,110,.6,.7*e,{to:28}),H(`triangle`,70,.45,.35*e,{to:30,at:r+.01});let i=Mu(.35),a=n.createBiquadFilter();a.type=`bandpass`,a.frequency.setValueAtTime(1800,r),a.frequency.exponentialRampToValueAtTime(300,r+.3),a.Q.value=1.2;let o=n.createGain();Nu(o,.5*e,.003,.28),i.connect(a).connect(o).connect(t.sfx);for(let t=0;t<3;t++)H(`sine`,180-t*30,.12,.18*e,{to:90,at:r+.12+t*.09})}function rS(){Au()&&(H(`square`,160,.25,.08,{to:520}),H(`sine`,220,.3,.14,{to:660}))}function iS(){let e=Au();if(!e)return;let t=e.ctx,n=t.currentTime,r=Mu(.4),i=t.createBiquadFilter();i.type=`bandpass`,i.frequency.setValueAtTime(4500,n),i.frequency.exponentialRampToValueAtTime(260,n+.32),i.Q.value=3;let a=t.createGain();Nu(a,.45,.01,.32),r.connect(i).connect(a).connect(e.sfx),H(`sawtooth`,900,.22,.05,{to:90}),H(`sine`,60,.3,.25,{to:35,at:n+.04})}function aS(){Au()&&(H(`sine`,55,.9,.25,{to:110,attack:.15}),H(`triangle`,880,.6,.04,{to:220,attack:.05}))}function oS(e=1.3,t=0){let n=Au();if(!n)return;let r=n.ctx,i=r.currentTime,a=.42,o=330*e*(t%2?1.12:1),s=r.createOscillator();s.type=`sawtooth`,s.frequency.setValueAtTime(o,i),s.frequency.linearRampToValueAtTime(o*1.6,i+a*.35),s.frequency.linearRampToValueAtTime(o*1.15,i+a);let c=r.createOscillator();c.frequency.value=11;let l=r.createGain();l.gain.value=o*.06,c.connect(l).connect(s.frequency);let u=r.createBiquadFilter();u.type=`bandpass`,u.Q.value=3,u.frequency.setValueAtTime(900,i),u.frequency.linearRampToValueAtTime(2400,i+a*.4),u.frequency.linearRampToValueAtTime(1100,i+a);let d=r.createWaveShaper();d.curve=tS();let f=r.createGain();Nu(f,.32,.03,a),s.connect(u).connect(d).connect(f).connect(n.sfx),s.start(i),s.stop(i+a+.08),c.start(i),c.stop(i+a+.08),H(`sine`,90,.25,.3,{to:40})}function sS(e=1){Au()&&H(`triangle`,900*e,.08,.06,{to:1400*e})}var cS=class{slots=[];next=0;constructor(e,t,n,r=!1){for(let i=0;i<n;i++){let n=wd(t);n.opacity=0;let i=new z(e,n);i.renderOrder=9,i.visible=!1,i.frustumCulled=!1,r&&(i.rotation.x=-Math.PI/2),J.add(i),this.slots.push({mesh:i,mat:n,age:0,life:1,r0:1,r1:1,h:1,peak:1})}kh(e=>this.step(e))}fire(e,t,n,r,i,a,o=.9,s=0,c=1){let l=this.slots[this.next];return this.next=(this.next+1)%this.slots.length,l.age=0,l.life=a,l.r0=r,l.r1=i,l.h=c,l.peak=o,l.mesh.position.set(e,t,n),l.mesh.rotation.x===0?l.mesh.rotation.y=s:l.mesh.rotation.z=s,l.mesh.visible=!0,this.apply(l),l.mesh}clear(){for(let e of this.slots)e.age=e.life,e.mesh.visible=!1}apply(e){let t=Math.min(1,e.age/e.life),n=1-(1-t)*(1-t),r=e.r0+(e.r1-e.r0)*n;e.mesh.rotation.x===0?e.mesh.scale.set(r,e.h,r):e.mesh.scale.set(r,r,1),e.mat.opacity=e.peak*(1-t)*(1-t*.5)}step(e){for(let t=0;t<this.slots.length;t++){let n=this.slots[t];n.mesh.visible&&(n.age+=e,n.age>=n.life?n.mesh.visible=!1:this.apply(n))}}},lS=3,uS=90,dS=1.45,fS=3,pS=160,mS=140,hS=105,gS=.08,_S=null,vS=null,yS=0,bS=0,xS=!1,SS=0,CS=1,wS=!1,TS=new I,ES=new I,DS=new I;function OS(){_S||(_S=new cS(new Qa(.86,1,64),16773597,4,!0),vS=new cS(new Qa(.5,1,48),16754250,4,!0),kh(()=>{xS&&!K.air&&(xS=!1,W.mode===`play`&&AS())}),U.on(`levelLoad`,()=>{xS=!1,_S.clear(),vS.clear()}))}function kS(){if(yS--,xS=!0,K.air=!0,K.y=Math.max(K.y,.01),K.vy=mS,K.vel.copy(K.fwd).multiplyScalar(hS),yS<2&&$x(K.pos.x,K.pos.z,pS,ES,DS)){let e=ES.x-K.pos.x,t=ES.z-K.pos.z,n=Math.hypot(e,t);if(n<220){let r=Math.min(hS*1.4,n/1.4);K.vel.set(e/(n||1)*r,0,t/(n||1)*r),K.heading=Math.atan2(e,t)}}K.stun=0,W.rig.squash=.6,rS();for(let e=0;e<10;e++){let t=e/10*Math.PI*2;bd.spawn(K.pos.x+Math.cos(t)*10,1.5,K.pos.z+Math.sin(t)*10,Math.cos(t)*30,4,Math.sin(t)*30,.7,3,14273716,0,1.2)}}function AS(){let e=K.pos.x,t=K.pos.z;SS++;let n=G.damage;gh(e,t,uS,dS,SS>=lS?`MEGA FLOP! `:`FLOP! `,`ultra`,fS),G.ultraT>0&&(G.zap+=G.damage-n),_S.fire(e,1.4,t,10,uS*1.7,.75,1),_S.fire(e,1.6,t,6,uS*1.1,.5,.8),vS.fire(e,1.2,t,4,uS*.8,.35,.9);for(let n=0;n<44;n++){let r=n/44*Math.PI*2,i=90+Math.random()*40;bd.spawn(e+Math.cos(r)*18,2,t+Math.sin(r)*18,Math.cos(r)*i,6+Math.random()*8,Math.sin(r)*i,1.4,5+Math.random()*3,14208960,0,1.8)}for(let n=0;n<24;n++)xd.spawn(e+(Math.random()-.5)*40,3,t+(Math.random()-.5)*40,(Math.random()-.5)*120,50+Math.random()*70,(Math.random()-.5)*120,1.6,1+Math.random()*2,Math.random()<.5?10130570:6121072,-90);W.rig.squash=1,kd(1),jp(.3),G.hitStop=.1,nS(SS>=lS?1.4:1),U.emit(`bigHit`,{strength:1})}var jS={id:`bellyFlop`,name:`BELLY FLOP!`,color:`#ffb35a`,tallyLabel:`FLOP`,moveMul:1,camWide:!0,start(){OS(),wS=!0,CS=q.wetResist,yS=lS,SS=0,bS=K.air?0:.12},update(e){!K.air&&!xS&&yS>0&&(bS-=e,bS<=0&&(kS(),bS=gS)),q.wetResist=K.air?0:CS},stop(){wS&&(wS=!1,q.wetResist=CS,yS=0,W.mode!==`play`&&(xS=!1),G.zap>0&&W.mode===`play`&&(Dp(`FLOP TOTAL `,G.zap,TS.set(K.pos.x,80,K.pos.z)),SS>=lS&&Ap(`MAXIMUM CHONK`,`#ffb35a`)))}},MS=new Kr({color:16719695,transparent:!0,opacity:.8,depthWrite:!1,depthTest:!1,blending:2}),NS=new Kr({color:16773364,transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),PS=[0,1].map(()=>{let e=new L,t=new z(new ji(6,6,1,10,1,!0).translate(0,.5,0).rotateX(Math.PI/2),MS),n=new z(new ji(2.2,2.2,1,6).translate(0,.5,0).rotateX(Math.PI/2),NS);return t.renderOrder=n.renderOrder=10,e.add(t,n),e.visible=!1,J.add(e),e}),FS=new z(new Qa(4,10,32),wd(16727674));FS.rotation.x=-Math.PI/2,FS.renderOrder=10,FS.visible=!1,J.add(FS);var IS=[new I,new I],LS=new I,RS=new I,zS=new I,BS=new I,VS=new Pt,HS=new I(0,0,1);function US(){for(let e of PS)e.visible=!1;FS.visible=!1}var WS={id:`laser`,name:`LASER EYES!`,color:`#ff3e7a`,tallyLabel:`ZAP`,moveMul:.6,camWide:!0,start(){Ku(!0)},stop(){Ku(!1),US(),G.zap>0&&W.mode===`play`&&Dp(`LASER TOTAL `,G.zap,BS.set(K.pos.x,70,K.pos.z))},update(e,t){W.rig.eyes(IS);let n=Math.sin(t*2.6)*.35,r=K.heading+n,i=LS.set(K.pos.x+Math.sin(r)*170,0,K.pos.z+Math.cos(r)*170),a=0;for(let e=0;e<2;e++){let n=IS[e],o=RS.copy(i).sub(n),s=o.length();o.normalize();for(let e=6;e<s;e+=3){let t=n.x+o.x*e,r=n.y+o.y*e,i=n.z+o.z*e;for(let e=0;e<Y.buildings.length;e++){let n=Y.buildings[e];if(Math.abs(t-n.x)>n.hx||Math.abs(i-n.z)>n.hz)continue;let s=Math.floor(r/7);if(s<0||s>=n.count)continue;let c=n.first+s;if(Y.segs.state[c]!==ld.Static)continue;let l=Y.knock(c,o.x*50+(Math.random()-.5)*20,30,o.z*50+(Math.random()-.5)*20);a+=l*n.value*Wf(e),Gf(e);for(let e=0;e<3;e++)Cd.spawn(t,r,i,(Math.random()-.5)*30,Math.random()*30,(Math.random()-.5)*30,.6,1.5+Math.random()*2,e?16747050:16765514,-20,1)}Em(zS.set(t,r,i),o);for(let e=0;e<X.n;e++){let n=e*3;Math.abs(X.pos[n]-t)<5&&Math.abs(X.pos[n+2]-i)<5&&r<6&&$p(e,o.x*40,50,o.z*40)}}i.set(K.pos.x+Math.sin(r)*170,0,K.pos.z+Math.cos(r)*170);let c=PS[e];c.visible=!0,c.position.copy(n),VS.setFromUnitVectors(HS,o),c.quaternion.copy(VS);let l=1+Math.sin(t*50+e)*.25;c.scale.set(l,l,s),Cd.spawn(i.x,2,i.z,0,0,0,.12,16+Math.random()*3,16756936,0,0),Math.random()<.7&&Cd.spawn(i.x,1,i.z,(Math.random()-.5)*40,20+Math.random()*20,(Math.random()-.5)*40,.5,2.5,16727674,-40,1)}FS.visible=!0,FS.position.set(i.x,1.5,i.z),FS.scale.setScalar(1+Math.sin(t*30)*.2),Dm(K.pos.x,K.pos.z,r),a>0&&(Hp(a,BS.set(i.x,30,i.z),`ZAP `,!1),G.zapComboT<=0&&(G.zapComboT=.25,Vp()),kd(.08))}},GS=.6,KS=120,qS=.11,JS=18,YS=9,XS=2.5,ZS=12,QS=4,$S=[.17,.5,.83],eC=[],tC=0,nC=new Map,rC=!1,iC=!1,aC=0,oC=!1,sC=0,cC=0,lC=0,uC=new I,dC=new I,fC=new I,pC={wet:1,stun:1},mC={x:0,z:0,r:22,power:2,dirX:0,dirZ:0,source:`ultra`},hC=(e,t,n,r)=>{let i=(e-uC.x)*-dC.z+(n-uC.z)*dC.x>=0?1:-1;r.set(dC.x*70-dC.z*i*45+(Math.random()-.5)*20,25+Math.random()*25,dC.z*70+dC.x*i*45+(Math.random()-.5)*20)},gC=(e,t,n,r)=>r.set(dC.x*90+(Math.random()-.5)*40,50+Math.random()*20,dC.z*90+(Math.random()-.5)*40);function _C(e){let t=nC.get(e);if(t)return t;e.root.updateMatrixWorld(!0);let n=new an().copy(e.root.matrixWorld).invert(),r=new an,i=[];e.root.traverse(e=>{let t=e;if(!t.isMesh||t.material.transparent)return;let a=new Fr;a.setAttribute(`position`,t.geometry.getAttribute(`position`).clone()),a.setAttribute(`normal`,t.geometry.getAttribute(`normal`).clone());let o=t.geometry.getIndex();o&&a.setIndex(o.clone()),a.applyMatrix4(r.multiplyMatrices(n,t.matrixWorld)),i.push(o?a:a.toNonIndexed())});let a=Wp(i.filter(e=>e.getIndex()),!1)??new $a(20);for(let e of i)e.dispose();return nC.set(e,a),a}function vC(){if(!rC){rC=!0;for(let e=0;e<ZS;e++){let e=new Kr({color:7027967,transparent:!0,opacity:0,depthWrite:!1}),t=new z(new Fr,e);t.visible=!1,t.frustumCulled=!1,t.renderOrder=8,J.add(t),eC.push({mesh:t,mat:e,age:0,life:1,peak:0})}kh(e=>{for(let t=0;t<eC.length;t++){let n=eC[t];if(!n.mesh.visible)continue;n.age+=e;let r=n.age/n.life;r>=1?n.mesh.visible=!1:(n.mat.opacity=n.peak*(1-r),n.mesh.position.y+=e*6)}}),U.on(`levelLoad`,()=>{for(let e of eC)e.mesh.visible=!1;oC=!1})}}function yC(e,t,n,r,i){let a=eC[tC];tC=(tC+1)%ZS,a.mesh.geometry=_C(W.rig),a.mesh.position.set(e,K.y,t),a.mesh.rotation.set(0,n,0),a.mesh.scale.setScalar(q.scale),a.mesh.visible=!0,a.age=0,a.life=i,a.peak=r,a.mat.opacity=r}function bC(){let e=Y.half-14;for(let t=0;t<2;t++){dC.set(Math.sin(K.heading),0,Math.cos(K.heading));let t=KS;if(dC.x>1e-4&&(t=Math.min(t,(e-K.pos.x)/dC.x)),dC.x<-1e-4&&(t=Math.min(t,(-e-K.pos.x)/dC.x)),dC.z>1e-4&&(t=Math.min(t,(e-K.pos.z)/dC.z)),dC.z<-1e-4&&(t=Math.min(t,(-e-K.pos.z)/dC.z)),cC=Math.max(0,t),cC>30)break;K.heading+=Math.PI,W.camYaw=K.heading}uC.copy(K.pos),oC=!0,sC=0,lC=0,yC(K.pos.x,K.pos.z,K.heading,.42,.55),iS()}function xC(e){let t=0;for(let n=lC;n<e;n+=YS){let e=uC.x+dC.x*n,r=uC.z+dC.z*n;t+=Kf(e,r,JS,0,90,hC),em(e,r,22,gC);for(let t=0;t<3;t++)bd.spawn(e+(Math.random()-.5)*16,6+Math.random()*30,r+(Math.random()-.5)*16,(Math.random()-.5)*10,4,(Math.random()-.5)*10,.7,3+Math.random()*2,2759242,0,1.4)}lC=Math.max(lC,e),t>0&&(Hp(t*XS,fC.set(K.pos.x,30,K.pos.z),G.ultraT>0?`ZAP `:`DASH `,!1),kd(.2))}function SC(){oC=!1,xC(cC+.01),mC.dirX=dC.x,mC.dirZ=dC.z;for(let e of $S)mC.x=uC.x+dC.x*cC*e,mC.z=uC.z+dC.z*cC*e,mC.r=Math.max(22,cC/6+4),Om(mC);pm(uC.x+dC.x*cC*.5,uC.z+dC.z*cC*.5,cC*.6,26,10);for(let e=1;e<QS;e++){let t=e/QS;yC(uC.x+dC.x*cC*t,uC.z+dC.z*cC*t,K.heading,.14+t*.22,.4+t*.2)}Vp(),W.rig.squash=.5,jp(.15)}var CC={id:`shadowDash`,name:`SHADOW DASH!`,color:`#a98bff`,tallyLabel:`DASH`,moveMul:1.15,camWide:!1,start(){vC(),iC=!0,pC.wet=q.wetResist,pC.stun=q.stunResist,q.wetResist=0,q.stunResist=0,K.stun=0,aC=.15,_C(W.rig),aS()},update(e){if(K.stun=0,oC){sC+=e;let t=Math.min(1,sC/qS),n=cC*t;K.pos.set(uC.x+dC.x*n,K.pos.y,uC.z+dC.z*n),W.rig.root.position.set(K.pos.x,K.y,K.pos.z),xC(n),t>=1&&SC()}else aC-=e,aC<=0&&!K.air&&(aC=GS,bC())},stop(){iC&&(iC=!1,oC&&W.mode===`play`&&(K.pos.set(uC.x+dC.x*cC,K.pos.y,uC.z+dC.z*cC),SC()),oC=!1,q.wetResist=pC.wet,q.stunResist=pC.stun,G.zap>0&&W.mode===`play`&&Dp(`DASH TOTAL `,G.zap,fC.set(K.pos.x,70,K.pos.z)))}},wC=.5,TC=220,EC=.5,DC=Math.PI/6,OC=Math.cos(DC),kC=14,AC=6,jC=1.6,MC=[0,1,2].map(()=>({on:!1,ox:0,oz:0,dx:0,dz:1,age:0,r:0,hit:!1})),NC=0,PC=null,FC=null,IC=null,LC=!1,RC=0,zC=0,BC=new I,VC={x:0,z:0,r:TC,power:1.5,dirX:0,dirZ:1,cone:OC,source:`ultra`},HC=e=>{let t=Math.min(1,e/EC);return kC+206*(1-(1-t)*(1-t))};function UC(){if(PC)return;let e=e=>new ji(1,1,e,28,1,!0,-DC,DC*2).translate(0,e/2,0);PC=new cS(e(1),8381439,4),FC=new cS(e(1),15268863,8),IC=new cS(new Qa(.9,1,28,1,Math.PI/2-DC,DC*2),8381439,4,!0),kh(e=>{if(!(e<=0))for(let t=0;t<MC.length;t++)MC[t].on&&GC(MC[t],e)}),U.on(`levelLoad`,()=>{for(let e of MC)e.on=!1;PC.clear(),FC.clear(),IC.clear()})}function WC(){let e=MC[NC];NC=(NC+1)%MC.length;let t=q.scale;e.dx=Math.sin(K.heading),e.dz=Math.cos(K.heading),e.ox=K.pos.x+e.dx*26*t,e.oz=K.pos.z+e.dz*26*t,e.age=0,e.r=kC,e.hit=!1,e.on=!0;let n=q.headY*.9+K.y;PC.fire(e.ox,0,e.oz,kC,TC,EC,.42,K.heading,n+30),FC.fire(e.ox,n-4,e.oz,kC,TC,EC,1,K.heading,8),FC.fire(e.ox,n*.45,e.oz,kC*.8,TC*.94,EC,.8,K.heading,5),IC.fire(e.ox,1.2,e.oz,kC,TC*1.02,EC*1.1,.9,K.heading-Math.PI),VC.x=e.ox,VC.z=e.oz,VC.dirX=e.dx,VC.dirZ=e.dz,Om(VC),oS(W.cat.voice,zC++),kd(.3),W.rig.look=0}function GC(e,t){e.age+=t;let n=e.r,r=HC(e.age);if(e.r=r,e.age>=EC&&(e.on=!1),W.mode!==`play`)return;let i=Y.segs,a=0;for(let t=0;t<Y.buildings.length;t++){let o=Y.buildings[t],s=o.x-e.ox,c=o.z-e.oz,l=Math.hypot(s,c);if(l<n||l>=r)continue;let u=Math.max(o.hx,o.hz);if(l>1&&(s*e.dx+c*e.dz)/l<Math.cos(DC+Math.atan(u/l)))continue;let d=l>1?s/l:e.dx,f=l>1?c/l:e.dz,p=1-l/TC*.6,m=Math.max(1,Math.round(AC*p)),h=0,g=0;for(let e=o.count-1;e>=0&&m>0;e--){let t=o.first+e;if(i.state[t]!==ld.Static)continue;g===0&&(g=7*(e+.5));let n=60+50*p;i.launch(t,d*n+(Math.random()-.5)*25,45+Math.random()*35+m*6,f*n+(Math.random()-.5)*25,6),m--,h++}h&&(a+=h*o.value*Wf(t),Gf(t),Ad(o.x-d*o.hx,g,o.z-f*o.hz,2,14087423))}for(let t=0;t<X.n;t++){let i=t*3;if(X.pos[i+1]>3)continue;let a=X.pos[i]-e.ox,o=X.pos[i+2]-e.oz,s=Math.hypot(a,o);s<n||s>=r||s<1||(a*e.dx+o*e.dz)/s<OC||$p(t,a/s*70,55+Math.random()*20,o/s*70)}let o=(n+r)*.5;pm(e.ox+e.dx*o,e.oz+e.dz*o,Math.max(30,(r-n)*.5+o*.5),30,12),Math.random()<.5&&bd.spawn(e.ox+e.dx*o,2,e.oz+e.dz*o,e.dx*60,6,e.dz*60,.6,4,14087423,0,1.5),a>0&&(Hp(a*jC,BC.set(e.ox+e.dx*o,40,e.oz+e.dz*o),G.ultraT>0?`ZAP `:`YOWL `,!1),Ru(Math.min(2.5,a)),e.hit||(e.hit=!0,Vp()))}var KC={id:`sonicYowl`,name:`SONIC YOWL!`,color:`#7fe3ff`,tallyLabel:`YOWL`,moveMul:.75,camWide:!0,start(){UC(),LC=!0,RC=.08,zC=0},update(e){RC-=e,RC<=0&&(RC=wC,WC())},stop(){LC&&(LC=!1,G.zap>0&&W.mode===`play`&&Dp(`YOWL TOTAL `,G.zap,BC.set(K.pos.x,70,K.pos.z)))}};function qC(e){let t=document.createElement(`canvas`);t.width=512,t.height=256,e(t.getContext(`2d`),512,256);let n=new Ti(t);return n.colorSpace=ot,n.wrapS=_,n}function JC(e,t,n,r=4e3){for(let i=0;i<r;i++)e.fillStyle=Math.random()<.5?t:n,e.fillRect(Math.random()*512,Math.random()*256,2,6)}function YC(e,t){let n=e.createLinearGradient(0,170,0,256);n.addColorStop(0,`rgba(${t},0)`),n.addColorStop(1,`rgba(${t},1)`),e.fillStyle=n,e.fillRect(0,170,512,86)}var XC=e=>{e.fillStyle=`#f08a2c`,e.fillRect(0,0,512,256),JC(e,`rgba(255,190,110,0.25)`,`rgba(170,80,20,0.18)`),e.fillStyle=`#b5521a`;for(let t=0;t<14;t++){let n=t/14*512+Math.random()*10,r=8+Math.random()*10;e.beginPath(),e.moveTo(n,0);for(let r=0;r<=256;r+=16)e.lineTo(n+Math.sin(r*.05+t)*8,r);for(let i=256;i>=0;i-=16)e.lineTo(n+r+Math.sin(i*.05+t)*8,i);e.closePath(),e.fill()}YC(e,`255,236,205`)},ZC=e=>{e.fillStyle=`#fff4e6`,e.fillRect(0,0,512,256),JC(e,`rgba(255,255,255,0.35)`,`rgba(210,180,150,0.14)`,3e3);let t=(t,n,r,i)=>{for(let a of[-512,0,512])e.beginPath(),e.ellipse(t+a,n,r,i,0,0,Math.PI*2),e.fill()};e.fillStyle=`#f29a40`,t(60,40,70,46),t(200,70,56,52),t(330,30,90,40),t(450,85,50,40),e.fillStyle=`#d97a24`;for(let t=0;t<9;t++){let n=t*57+10;e.fillRect(n,10+t%3*12,9,50)}YC(e,`255,250,244`)},QC=e=>{e.fillStyle=`#2b2836`,e.fillRect(0,0,512,256),JC(e,`rgba(150,140,200,0.18)`,`rgba(0,0,0,0.3)`,5e3);let t=e.createLinearGradient(0,30,0,120);t.addColorStop(0,`rgba(140,130,200,0)`),t.addColorStop(.5,`rgba(140,130,200,0.18)`),t.addColorStop(1,`rgba(140,130,200,0)`),e.fillStyle=t,e.fillRect(0,30,512,90)},$C=e=>{e.fillStyle=`#f2e3c8`,e.fillRect(0,0,512,256),JC(e,`rgba(255,250,236,0.3)`,`rgba(170,130,90,0.12)`,3e3);for(let t of[128,384]){let n=e.createRadialGradient(t,128,10,t,128,150);n.addColorStop(0,`rgba(120,80,50,0.55)`),n.addColorStop(1,`rgba(120,80,50,0)`),e.fillStyle=n,e.fillRect(t-160,0,320,256)}let t=e.createLinearGradient(0,0,0,80);t.addColorStop(0,`rgba(150,110,70,0.35)`),t.addColorStop(1,`rgba(150,110,70,0)`),e.fillStyle=t,e.fillRect(0,0,512,80),YC(e,`255,248,236`)},ew={paint:XC,muzzle:16772301,bib:null,socks:16772301,leg:null,ear:null,earInner:16748456,earScale:1,tail:null,tailTip:10241301,mask:null,nose:16748456,body:[13,12,22],bodyY:26,chest:[9,9,8],head:[0,40,21],headScale:1,headShape:[13.5,11.5,11.5],legLen:20,legR:1,hipX:7.5,hipZ:[13,-12],haunch:1,tailN:15,tailR:3.5,tailTaper:.11,tailStep:[1.3,2.2],tailLift:-.11,sclera:16777215,eyeScale:[5.4,6,3.9],pupilScale:[3,3.9],slit:!1,crossEyed:0,lids:!1,glow:16719952,aura:null,whisker:16777215,roughness:.9},tw={tabby:ew,chonk:{...ew,paint:ZC,muzzle:16777215,socks:16777215,leg:16774374,tailTip:15899200,body:[19,15,23],bodyY:20,chest:[13,10,9],head:[0,31,22],headScale:.68,legLen:9,legR:1.25,hipX:11,hipZ:[13,-12],haunch:1.25,tailN:9,tailR:4.2,tailTaper:.12,tailStep:[1,2.6],tailLift:-.05,eyeScale:[5.2,5.4,3.9],pupilScale:[2.6,3.2],lids:!0,glow:16752672,aura:5908992},shadow:{...ew,paint:QC,muzzle:3814982,socks:3025720,leg:2828342,earInner:5913173,earScale:1.25,tailTip:1052694,nose:3811893,body:[10.5,10.5,23],bodyY:29,chest:[7,8,7],head:[0,43,22],headScale:.92,headShape:[12.5,11.5,12],legLen:24,legR:.75,hipX:6,hipZ:[14,-13],haunch:.85,tailN:22,tailR:2.2,tailTaper:.055,tailStep:[1.4,2.3],tailLift:-.085,sclera:16765466,eyeScale:[5.8,6.4,3.9],pupilScale:[1.2,4.6],slit:!0,glow:11563263,aura:2756704,whisker:9078432,roughness:.55},siamese:{...ew,paint:$C,muzzle:4861984,bib:16511454,socks:3941912,leg:9069640,ear:3941912,earInner:6965818,earScale:1.3,tail:4861984,tailTip:3021842,mask:5913126,nose:3021842,body:[12,11.5,22],bodyY:27,chest:[8,8.5,7.5],head:[0,41.5,21],headScale:.95,headShape:[12.5,11.5,12],legLen:21,legR:.85,hipX:7,tailN:17,tailR:2.8,tailTaper:.08,sclera:6210815,eyeScale:[5.6,5,3.9],pupilScale:[2.4,3.2],crossEyed:1.4,glow:6349055,aura:null,whisker:15918024,roughness:.8}},nw=class{lk;root=new L;body=new L;head=new L;legs=[];tail=[];pupils=[];eyeGlow=[];lids=[];mouth;earL;earR;pupilMat=new B({color:1118481,roughness:.3});furMat;glowMat;walkPhase=0;swipe=0;swipeSide=1;shake=0;squash=0;scare=0;ultra=!1;look=0;lookS=0;ultraS=0;pupilBase=[];tailFluff=[];constructor(e=ew){this.lk=e;let t=e,n=new B({map:qC(t.paint),roughness:t.roughness});this.furMat=n;let r=(e,n=t.roughness)=>new B({color:e,roughness:n}),i=r(t.muzzle),a=t.socks===t.muzzle?i:r(t.socks),o=r(t.earInner,.6),s=r(t.nose,.6),c=new B({color:16777215,roughness:.2}),l=t.sclera===16777215?c:new B({color:t.sclera,roughness:.2,emissive:t.sclera,emissiveIntensity:.25}),u=t.leg===null?n:r(t.leg),d=t.ear===null?n:r(t.ear),f=t.tail===null?n:r(t.tail),p=new $a(1,28,20);this.glowMat=new Kr({color:t.glow,transparent:!0,opacity:0,depthWrite:!1});let m=(e,t,n,r,i=[1,1,1])=>{let a=new z(e,t);return a.position.set(...r),a.scale.set(...i),a.castShadow=!0,n.add(a),a};this.root.add(this.body),m(p,n,this.body,[0,t.bodyY,0],t.body),m(p,t.bib===null?i:r(t.bib),this.body,[0,t.bodyY-2,t.body[2]-8],t.chest),this.head.position.set(...t.head),this.head.scale.setScalar(t.headScale),this.body.add(this.head),m(p,n,this.head,[0,2,0],t.headShape),t.mask!==null&&m(p,r(t.mask),this.head,[0,.5,6.2],[8.6,8.2,6]),m(p,i,this.head,[-4.2,-2.2,8.5],[5.2,4.2,3.8]),m(p,i,this.head,[4.2,-2.2,8.5],[5.2,4.2,3.8]),m(p,s,this.head,[0,.4,11.4],[1.6,1.1,1]),this.mouth=m(p,new B({color:5909024}),this.head,[0,-3.6,11.2],[1.4,.9,.6]);let h=new $a(1,20,10,0,Math.PI*2,0,Math.PI/2),g=new Kr({color:t.whisker}),_=new ji(.12,.12,12,4),v=new Mi(4.6,9,4),y=new Mi(2.8,6,4),[b,x,S]=t.eyeScale;for(let e of[-1,1]){let r=m(p,l,this.head,[e*6.4,4,8.6],t.eyeScale);r.castShadow=!1;let i=e*6.6+(e>0?.7:-.4)-e*t.crossEyed,a=m(p,this.pupilMat,this.head,[i,3.6+(e>0?.6:-.3),8.6+S*.9],[t.pupilScale[0],t.pupilScale[1],1.2]);if(this.pupils.push(a),this.pupilBase.push(a.position.x),m(p,c,this.head,[e*6.4+1.2,4+x*.3,8.6+S*1.1],[.9,.9,.45]),t.lids){let t=m(h,n,this.head,[e*6.4,4,8.6],[b*1.08,x*1.08,S*1.12]);t.rotation.x=.9,this.lids.push(t)}let s=new z(p,this.glowMat);s.position.set(e*6.4,3.8,8.6+S*.87),s.scale.set(6.5,6.5,2.5),this.head.add(s),this.eyeGlow.push(s);let u=new L;u.position.set(e*7.5,11,-1),u.rotation.z=-e*.35,u.scale.setScalar(t.earScale),this.head.add(u),m(v,d,u,[0,3.5,0]).rotation.y=Math.PI/4,m(y,o,u,[0,3,1.2]).rotation.y=Math.PI/4,e<0?this.earL=u:this.earR=u;for(let t=0;t<3;t++){let n=new z(_,g);n.position.set(e*10,-3+t*1.1,9),n.rotation.z=Math.PI/2+e*(t-1)*.18,n.rotation.y=e*.25,this.head.add(n)}}let C=t.legLen,w=new ji(3.6*t.legR,3.2*t.legR,C,12);for(let[e,r]of[[!0,-1],[!0,1],[!1,-1],[!1,1]]){let i=new L;i.position.set(r*t.hipX,C+1,e?t.hipZ[0]:t.hipZ[1]),this.body.add(i),m(w,u,i,[0,-C/2,0]),m(p,a,i,[0,-C+.5,1.2],[4.6*t.legR,3,5.6*t.legR]),e||m(p,n,i,[0,-2,-1],[6*t.haunch,8*t.haunch,7*t.haunch]),this.legs.push({pivot:i,front:e,side:r})}let T=this.body,E=[0,t.bodyY+t.body[1]*5/12,-(t.body[2]-2)],D=t.tailN,O=r(t.tailTip);for(let e=0;e<D;e++){let n=new L;n.position.set(...E),T.add(n);let r=t.tailR-e*t.tailTaper;this.tailFluff.push(m(p,e>=D-2?O:f,n,[0,0,0],[r,r,r*1.3])),this.tail.push(n),T=n,E=[0,t.tailStep[0],-t.tailStep[1]]}this.root.traverse(e=>{e.isMesh&&(e.receiveShadow=!1)})}animate(e,t,n,r){let i=this.lk;this.ultraS+=(+!!this.ultra-this.ultraS)*Math.min(1,e*8);let a=this.ultraS,o=this.scare,s=o>0?Math.min(1,o*2):0;this.walkPhase+=e*(n*.16+(n>1?2:0));let c=Math.min(1,n/30)*.65,l=i===tw.chonk&&r&&this.ultra;for(let e of this.legs){let t=(e.front?0:Math.PI)+(e.side>0?Math.PI:0),n=Math.sin(this.walkPhase+t)*c,i=0;if(r&&(n=e.front?-1.1:.9),l&&(n=e.front?-1.5:1.4,i=e.side*.7),s>0&&(n*=1-s,i+=e.side*.22*s),e.front&&e.side===this.swipeSide&&this.swipe>0){let t=Math.sin(this.swipe*Math.PI);n=-2.3*t,i=-e.side*.6*t}e.pivot.rotation.x=n,e.pivot.rotation.z=i}let u=Math.abs(Math.sin(this.walkPhase))*c*2.5;this.body.position.y=u-this.squash*8+Math.sin(Math.min(1,o)*Math.PI)*6+s*3;let d=1+s*.14;this.body.scale.set((1+this.squash*.25)*d,(1-this.squash*.25)*(1+s*.18),(1+this.squash*.1)*(1-s*.06)),this.body.rotation.z=Math.sin(this.walkPhase)*c*.04+(this.swipe>0?this.swipeSide*.12*Math.sin(this.swipe*Math.PI):0),this.body.rotation.x=l?.15:r?-.25:0,this.shake>0?(this.body.rotation.z+=Math.sin(t*60)*.12*this.shake,this.head.rotation.y=Math.sin(t*70)*.4*this.shake):this.head.rotation.y=Math.sin(t*.7)*.25*(1-a*.7);let f=i===tw.siamese?a:0;this.head.rotation.x=this.ultra?f>0?-.28*f+Math.sin(t*30)*.03:.18:Math.sin(t*1.1)*.06,this.head.rotation.z=Math.sin(t*.9)*.08;let p=Math.max(f*(.8+Math.sin(t*18)*.2),s*.6,i===tw.chonk?a*.5:0);this.mouth.scale.set(1.4+p*1.8,.9+p*3.2,.6+p*.4),this.mouth.position.y=-3.6-p*1.4;let m=Math.sin(t*3.1)>.97?.4:0,h=Math.max(s,i===tw.shadow?a:0);this.earL.rotation.x=-m-h*.9,this.earR.rotation.x=(Math.sin(t*2.3)>.98?-.4:0)-h*.9;let g=this.tail.length;for(let e=0;e<g;e++){let n=this.tail[e];n.rotation.y=Math.sin(t*2.2-e*.3)*.13*(1-s),n.rotation.x=i.tailLift+Math.sin(t*1.4-e*.24)*.036-s*(e===0?.9:.02)+(i===tw.shadow?a*.08:0);let r=this.lk.tailR-e*this.lk.tailTaper,o=r*(1+s*.7);this.tailFluff[e].scale.set(o,o,r*1.3)}let _=this.ultra?.85+Math.sin(t*40)*.15:0;this.glowMat.opacity=_,i.aura!==null&&(this.furMat.emissive.setHex(i.aura),this.furMat.emissiveIntensity=a*(.7+Math.sin(t*12)*.3)),this.pupilMat.color.setHex(this.ultra?i.glow:1118481);for(let e=0;e<this.lids.length;e++)this.lids[e].rotation.x=.9-Math.max(a,s)*1.5;this.lookS+=(this.look-this.lookS)*Math.min(1,e*8),this.look*=Math.max(0,1-e*.8);let v=i.pupilScale[0],y=i.pupilScale[1];for(let e=0;e<this.pupils.length;e++){let n=this.pupils[e],r=s>0?v*(1+s*.6):this.ultra?Math.min(v,1.3):v;n.scale.x=i.slit&&s<=0?v*(this.ultra?.6:1):r,n.scale.y=y*(1+s*.2),n.position.x=this.pupilBase[e]+this.lookS*1.6+Math.sin(t*9+e*2)*.35}this.swipe=Math.max(0,this.swipe-e*4),this.shake=Math.max(0,this.shake-e*1.5),this.squash=Math.max(0,this.squash-e*3),this.scare=Math.max(0,this.scare-e*1.5)}eyes(e){this.root.updateMatrixWorld(!0);for(let t=0;t<this.eyeGlow.length;t++)this.eyeGlow[t].getWorldPosition(e[t])}},rw={tabby:0,chonk:300,shadow:600,siamese:900},iw=[40,80,140,220,320],aw={tabby:1,chonk:1.2,shadow:1.4,siamese:1.6};function ow(e,t,n){if(e.why===`quit`)return 0;let r=e.why!==`wet`,i=Number.isFinite(e.damage)?Math.max(0,e.damage):0,a=Math.min(150,Math.round(i/20)),o=r?t.catnipBase:Math.floor(t.catnipBase/3),s=Number.isFinite(n)?Math.max(0,Math.floor(n)):0;return a+o+30*s}var sw=e=>rw[e];function cw(e,t,n){let r=Number.isFinite(n)?Math.max(0,Math.floor(n)):0;return r>=5?null:Math.round(iw[r]*aw[e])}function lw(e,t){let n=e.cats[t];return!!n&&!n.owned&&e.catnip>=rw[t]}function uw(e,t){return lw(e,t)?{...e,catnip:e.catnip-rw[t],cats:{...e.cats,[t]:{...e.cats[t],owned:!0}}}:e}function dw(e,t,n){let r=e.cats[t];if(!r||!r.owned)return!1;let i=cw(t,n,r.upgrades[n]);return i!==null&&e.catnip>=i}function fw(e,t,n){if(!dw(e,t,n))return e;let r=e.cats[t],i=cw(t,n,r.upgrades[n]);return{...e,catnip:e.catnip-i,cats:{...e.cats,[t]:{...r,upgrades:{...r.upgrades,[n]:r.upgrades[n]+1}}}}}var pw={walk:34,zoom:62,turn:7,radius:13,headY:46,scale:1,swatCd:.32,swatReach:26,swatRadius:17,swatPower:1,pounceCd:2,pounceR:32,pounceJump:95,pounceFwd:85,patienceMax:100,wetResist:1,stunResist:1,ultraCharge:1,ultraTime:7},mw=e=>typeof e==`number`&&Number.isFinite(e)?Math.max(0,Math.min(5,Math.floor(e))):0,hw={power:{swatPower:.08,swatRadius:.04,pounceR:.04},speed:{walk:.05,zoom:.05,turn:.04},fur:{patienceMax:8,wetResist:-.06,stunResist:-.06},ultra:{ultraCharge:.08,ultraTime:.4}};function gw(e,t){let n={...e},r=mw(t?.power),i=mw(t?.speed),a=mw(t?.fur),o=mw(t?.ultra),s=hw;return n.swatPower*=1+s.power.swatPower*r,n.swatRadius*=1+s.power.swatRadius*r,n.pounceR*=1+s.power.pounceR*r,n.walk*=1+s.speed.walk*i,n.zoom*=1+s.speed.zoom*i,n.turn*=1+s.speed.turn*i,n.patienceMax+=s.fur.patienceMax*a,n.wetResist*=1+s.fur.wetResist*a,n.stunResist*=1+s.fur.stunResist*a,n.ultraCharge*=1+s.ultra.ultraCharge*o,n.ultraTime+=s.ultra.ultraTime*o,n}var _w=e=>({...pw,...e}),vw={tabby:{id:`tabby`,name:`Marmalade`,blurb:`Orange tabby. One brain cell, two laser eyes.`,ultraName:`LASER`,voice:1,color:`#ff8a2a`,cost:rw.tabby,base:_w({}),passive:`Lasers lock on to helicopters.`},chonk:{id:`chonk`,name:`Big Biscuit`,blurb:`A loaf of pure mass. Every swat is a small earthquake.`,ultraName:`FLOP`,voice:.7,color:`#ffb35a`,cost:rw.chonk,base:_w({walk:28,zoom:52,turn:5.5,radius:16,headY:56,scale:1.25,swatCd:.4,swatRadius:20,swatPower:1.25,pounceCd:2.4,pounceR:44,patienceMax:130,wetResist:.8,stunResist:1.2,ultraCharge:.9,ultraTime:5}),passive:`Swats shake the ground.`},shadow:{id:`shadow`,name:`Midnight`,blurb:`Black cat. Bad luck for buildings. Gone before the water lands.`,ultraName:`DASH`,voice:1.1,color:`#a98bff`,cost:rw.shadow,base:_w({walk:40,zoom:74,turn:9,radius:12,swatCd:.26,swatRadius:15,swatPower:.9,pounceCd:1.6,patienceMax:85,wetResist:1.1,stunResist:.7,ultraCharge:1.15,ultraTime:6}),passive:`Every swat is a tiny lunge.`},siamese:{id:`siamese`,name:`Duchess`,blurb:`Siamese. Has opinions. Shares them at 140 decibels.`,ultraName:`YOWL`,voice:1.3,color:`#7fe3ff`,cost:rw.siamese,base:_w({walk:36,zoom:64,turn:7.5,swatCd:.3,swatReach:28,stunResist:.5,ultraCharge:1.1,ultraTime:6}),passive:`People scatter twice as far.`}};Ju.map(e=>vw[e]);var yw=e=>{let t=vw[e];return{id:t.id,name:t.name,blurb:t.blurb,ultraName:t.ultraName,voice:t.voice,color:t.color,cost:t.cost,base:t.base}},bw=[{...yw(`tabby`),build:()=>new nw(tw.tabby),ultra:WS},{...yw(`chonk`),build:()=>new nw(tw.chonk),ultra:jS,hooks:{onSwat(){kd(.12),pm(K.pos.x,K.pos.z,55,14,8);for(let e=0;e<8;e++){let t=e/8*Math.PI*2;bd.spawn(K.pos.x+Math.cos(t)*16,1.5,K.pos.z+Math.sin(t)*16,Math.cos(t)*40,2,Math.sin(t)*40,.6,3,14273716,0,1.2)}}}},{...yw(`shadow`),build:()=>new nw(tw.shadow),ultra:CC,hooks:{onSwat(){if(!(K.air||K.stun>0)){K.pos.addScaledVector(K.fwd,6);for(let e=0;e<3;e++)bd.spawn(K.pos.x-K.fwd.x*10,8+Math.random()*20,K.pos.z-K.fwd.z*10,-K.fwd.x*20,2,-K.fwd.z*20,.4,2.5,2759242,0,1.2)}}}},{...yw(`siamese`),build:()=>new nw(tw.siamese),ultra:KC,hooks:{onSwat(e,t){pm(e,t,48,30,14),Math.random()<.35&&sS(W.cat.voice)}}}];function xw(){for(let e of bw)i.add(e)}var Sw=6,Cw=1.6,ww=[],Tw=new K_,Ew=null,Dw=!1,Ow=new B({color:4168250,roughness:.55}),kw=new B({color:2382882,roughness:.7}),Aw=new B({color:8160399,roughness:.5,metalness:.4}),jw=new B({color:11039802,roughness:.9}),Mw=new B({color:10354554,emissive:4521762,emissiveIntensity:0}),Nw=new ki(1,1,1),Pw=new Ai(2.6,11,4,12).rotateX(Math.PI/2).translate(0,0,4),Fw=new eo(2.7,.6,6,16).translate(0,0,0),Iw=new Ai(1.2,5,3,8).rotateZ(Math.PI/2),Lw=new ji(.6,.6,6,6),Rw=new I,zw=new I;function Bw(){let e=new L,t=new z(Nw,Aw);t.scale.set(11,1.6,11),t.position.y=.8,e.add(t);for(let t of[-1,1]){let n=new z(Lw,Aw);n.position.set(t*3,4,0),e.add(n)}let n=new z(Nw,jw);n.scale.set(6,3,4),n.position.set(-5,2.6,-4),e.add(n);for(let t=0;t<3;t++){let n=new z(Iw,Ow);n.position.set(-5+(t-1)*1.6,4.6,-4+(t-1)*.6),n.rotation.y=.3*t,e.add(n)}let r=new L;r.position.y=7.5;let i=new L,a=new z(Pw,Ow);i.add(a);for(let e=0;e<5;e++){let t=new z(Nw,kw);t.scale.set(.6,.6,9);let n=e*1.25;t.position.set(Math.cos(n)*2.5,Math.sin(n)*2.5,4),i.add(t)}let o=Mw.clone(),s=new z(Fw,o);return s.position.z=11.5,i.add(s),r.add(i),e.add(r),e.traverse(e=>e.castShadow=!0),e.visible=!1,J.add(e),{g:e,pivot:r,barrel:i,bi:-1,seg:-1,pos:new I,vy:0,state:`off`,t:0,fireT:0,far:0,glow:o,dead:!1}}var Vw=e=>{for(let t of ww)if(t.state!==`off`&&t.bi===e)return!0;return!1};function Hw(){let e=ww.find(e=>e.state===`off`);if(!e)return!1;let t=Ag(150,300,14,Vw);if(t<0&&(t=Ag(110,380,7,Vw)),t<0)return!1;let n=Y.buildings[t],r=Y.standing(n);return e.bi=t,e.seg=n.first+Math.round(r/7)-1,e.pos.set(n.x,r,n.z),e.state=`rise`,e.t=0,e.fireT=1.5+Math.random(),e.far=0,e.vy=0,e.dead=!1,e.g.position.copy(e.pos),e.g.rotation.set(0,0,0),e.g.scale.setScalar(.01),e.g.visible=!0,Dw||(Dw=!0,Ap(innerWidth<600?`CUCUMBERS!`:`CUCUMBER TOWERS ON THE ROOFS!`,`#7dff6a`)),!0}var Uw=e=>e.state===`rise`||e.state===`idle`;function Ww(e,t,n=`CUKE TOWER! `){Uw(e)&&(e.dead=!0,Rw.set(e.pos.x,e.pos.y+8,e.pos.z),Am(`cucumberTower`,Rw),Hp(G_(Ew,`value`,5),Rw,n),Ep(`PICKLED!`,Rw.setY(e.pos.y+24),`#7dff6a`,28),t?(e.state=`fall`,e.t=0,e.vy=10):Gw(e))}function Gw(e){gg(e.pos.x,e.pos.y+5*Cw,e.pos.z,.9,Kw),bg(e.pos.x,e.pos.y+4,e.pos.z,16,45,8257386),Jh(1.5),e.state=`off`,e.g.visible=!1}var Kw=[8257386,4168250,16765514];function qw(e){let t=ww[e];t&&Uw(t)&&Ww(t,!1,`RETURN TO SENDER! `)}function Jw(e,t,n){let r=ww[e];return!r||!Uw(r)?!1:(n.set(r.pos.x,r.pos.y+7*Cw,r.pos.z),!0)}function Yw(e,t){Tw.tick(G.elapsed,Xw.alive(),Pg())&&(Hw()||(Tw.next=G.elapsed+2));let n=W.mode===`play`,r=G_(Ew,`fire`,3),i=G_(Ew,`range`,360),a=G_(Ew,`lead`,.85);for(let o=0;o<ww.length;o++){let s=ww[o];if(s.state===`off`)continue;s.t+=e;let c=s.g;Uw(s)&&Y.segs.state[s.seg]!==ld.Static&&Ww(s,!0,`TOPPLED! `);let l=K.pos.x-s.pos.x,u=K.pos.z-s.pos.z,d=Math.hypot(l,u)||1;switch(s.state){case`rise`:c.scale.setScalar(Cw*Math.min(1,s.t/.5)*(1+Math.sin(Math.min(1,s.t/.5)*Math.PI)*.25)),s.t>.5&&(s.state=`idle`,c.scale.setScalar(Cw),qh(1.6));break;case`idle`:{s.pivot.rotation.y=Math.atan2(l,u);let c=-.5-Math.min(.5,d/700);s.fireT-=e;let f=s.fireT<.6&&s.fireT>0;if(s.glow.emissiveIntensity=f?1.2+Math.sin(t*40)*.6:s.glow.emissiveIntensity*Math.max(0,1-e*6),s.barrel.rotation.x=c+(f?Math.sin(t*50)*.04:0),s.barrel.position.z+=(0-s.barrel.position.z)*Math.min(1,e*8),s.fireT<=0&&(s.fireT=r*(.9+Math.random()*.2),n&&d<i)){let e=1.5+d/300;s.barrel.updateWorldMatrix(!0,!1),zw.set(0,0,13).applyMatrix4(s.barrel.matrixWorld);let t=K.pos.x+K.vel.x*e*a,n=K.pos.z+K.vel.z*e*a;iy(`cuke`,zw.x,zw.y,zw.z,t,18,n,e,o,qw)&&(Gh(),Kh(e),s.barrel.position.z=-3)}s.far=d>i+60?s.far+e:0,s.far>6&&(s.state=`sink`,s.t=0);break}case`fall`:s.vy-=80*e,s.pos.y+=s.vy*e,c.rotation.x+=e*3,c.rotation.z+=e*2,s.pos.y<=2&&Gw(s);break;case`sink`:c.scale.setScalar(Cw*Math.max(.01,1-s.t/.6)),s.t>.6&&(s.state=`off`,c.visible=!1)}s.state!==`off`&&c.position.copy(s.pos)}ly(e,t)}var Xw={id:`cucumberTower`,init(){for(let e=0;e<Sw;e++)ww.push(Bw())},begin(e){Ew=e,Tw.reset(e),Dw=!1},update:Yw,clear(){for(let e of ww)e.state=`off`,e.g.visible=!1;uy(),Ew=null,Tw.reset(null)},alive(){let e=0;for(let t of ww)Uw(t)&&e++;return e},onSwat(e){oy(e,Jw);for(let t of ww)Uw(t)&&lg(e,t.pos.x,t.pos.y+6*Cw,t.pos.z,9*Cw,30)&&Ww(t,!1,`SWAT! `)},onPounceLand(e,t,n){for(let r of ww)Uw(r)&&r.pos.y<60&&dg(e,t,n,r.pos.x,r.pos.z,6)&&Ww(r,!1,`POUNCE! `)},onLaser(e){sy(e.x,e.y,e.z,8);for(let t of ww)Uw(t)&&fg(e,t.pos.x,t.pos.y+6*Cw,t.pos.z,9*Cw)&&Ww(t,!1,`ZAPPED! `)},onLaserSweep(e,t,n){for(let r of ww)Uw(r)&&pg(e,t,n,r.pos.x,r.pos.z,200,.93)&&Ww(r,!1,`ZAPPED! `)},onBlast(e){for(let t of ww)Uw(t)&&ug(e,t.pos.x,t.pos.z,8)&&Ww(t,!1)},onFrenzy(){for(let e of ww)Uw(e)&&(e.state=`sink`,e.t=0)}},Zw=()=>ww.filter(e=>e.state!==`off`).map(e=>({x:e.pos.x,y:e.pos.y,z:e.pos.z,state:e.state,bi:e.bi})),Qw=[],$w=1,eT=null,tT=12,nT=new B({color:14169132,roughness:.4}),rT=new B({color:15921906,roughness:.4}),iT=new B({color:9425151,roughness:.1}),aT=new B({color:5030911}),oT=new $a(1,16,12),sT=new ji(.5,1,9,8),cT=new ki(.4,3,1.6),lT=new ki(22,.25,1),uT=new ki(.5,.5,8),dT=new ji(.5,.8,3,8),fT=new I,pT=new I,mT=new I,hT=new I;function gT(){let e=new L,t=new z(oT,nT);t.scale.set(3.2,3,5.4);let n=new z(oT,rT);n.scale.set(3.25,1,5.3);let r=new z(oT,iT);r.scale.set(2.4,2,2.4),r.position.set(0,.6,3.6);let i=new z(sT,nT);i.rotation.x=Math.PI/2,i.position.set(0,.8,-8);let a=new z(cT,rT);a.position.set(0,2.2,-12);let o=new L;o.position.y=3.6;for(let e of[0,Math.PI/2]){let t=new z(lT,nT);t.rotation.y=e,o.add(t)}for(let t of[-1,1]){let n=new z(uT,nT);n.position.set(t*2.4,-3.4,0),e.add(n)}let s=new z(dT,aT);return s.rotation.x=Math.PI/2,s.position.set(0,-1.6,5.6),e.add(t,n,r,i,a,o,s),e.traverse(e=>e.castShadow=!0),J.add(e),$w=-$w,{g:e,rotor:o,state:`orbit`,t:0,ang:0,side:$w,aim:0,vel:new I,spin:0}}var _T=e=>e.state===`orbit`||e.state===`attack`;function vT(e,t){_T(e)&&(e.state=`fall`,e.vel.copy(t).multiplyScalar(55).setY(25),e.spin=14,Am(`heli`,e.g.position),Bu(`short`),Hp(6,e.g.position,`SWAT! `),Ap(`SWAT!`),kd(.4),G.hitStop=.08)}function yT(e,t){return eT?.params?.[e]??t}var bT={id:`heli`,init(){},begin(e){eT=e,tT=e?.delay??12},clear(){for(let e of Qw)J.remove(e.g);Qw.length=0,eT=null},alive(){let e=0;for(let t of Qw)t.state!==`dead`&&e++;return e},update(e){if(W.mode===`play`&&eT&&!G.timeFrozen){tT-=e;let t=eT.max+(eT.maxRamp>0?Math.floor(G.elapsed/eT.maxRamp):0);if(tT<=0&&this.alive()<(Fg.up?Math.min(1,t):t)&&!G.frenzy){let e=gT();e.ang=Math.random()*Math.PI*2,e.g.position.set(K.pos.x+Math.cos(e.ang)*300,70,K.pos.z+Math.sin(e.ang)*300),e.t=3+Math.random()*3,Qw.push(e),tT=Math.max(eT.minEvery,eT.every-G.elapsed/10*eT.everyRamp),G.elapsed<20&&Ap(innerWidth<600?`SPRAY BOTTLES!`:`INCOMING SPRAY BOTTLES`,`#4cc3ff`)}}let t=999,n=pT.set(K.pos.x,q.headY+K.y,K.pos.z),r=yT(`spray`,7.5);for(let i of Qw){let a=i.g;if(i.rotor.rotation.y+=e*30,_T(i)){i.t-=e;let t;if(i.state===`orbit`){i.ang+=e*.45,t=fT.set(K.pos.x+Math.cos(i.ang)*80,85,K.pos.z+Math.sin(i.ang)*80);let n=Math.hypot(t.x-id.position.x,t.z-id.position.z);n<60&&(t.y+=60-n),i.t<=0&&W.mode===`play`&&(i.state=`attack`,i.t=5,i.aim=K.heading+i.side*1.2,Vu())}else{if(t=fT.set(K.pos.x+Math.sin(i.aim)*55,64+K.y*.5,K.pos.z+Math.cos(i.aim)*55),a.position.distanceTo(t)<25){a.localToWorld(mT.set(0,-1.6,7));for(let e=0;e<6;e++){let e=hT.copy(n).sub(mT).normalize().multiplyScalar(80);Sd.spawn(mT.x,mT.y,mT.z,e.x+(Math.random()-.5)*10,e.y+(Math.random()-.5)*10,e.z+(Math.random()-.5)*10,.6,1.6+Math.random()*.8,4175103,-20,.5)}ih(r*e,`heli`)}i.t<=0&&(i.state=`orbit`,i.t=4+Math.random()*4)}a.position.lerp(t,Math.min(1,e*1.2)),a.lookAt(n.x,a.position.y,n.z),a.rotateX(.15)}else if(i.state===`fall`&&(i.vel.y-=60*e,a.position.addScaledVector(i.vel,e),a.rotation.y+=i.spin*e,a.rotation.z+=2*e,Cd.spawn(a.position.x,a.position.y,a.position.z,0,4,0,.6,1.6,Math.random()<.5?16747050:5592405,6,1.5),a.position.y<3)){i.state=`dead`,a.visible=!1,Wu(),jp(.35),kd(.5);for(let e=0;e<40;e++)Cd.spawn(a.position.x,4,a.position.z,(Math.random()-.5)*60,Math.random()*50,(Math.random()-.5)*60,.9,2+Math.random()*2.5,[16765514,16747050,16727614][e%3],-10,1.6);Ad(a.position.x,3,a.position.z,8);let e=Kf(a.position.x,a.position.z,20,0,60,qf(a.position.x,a.position.z,45,40));e>0&&Hp(e,a.position,`CRASH `)}i.state!==`dead`&&(t=Math.min(t,a.position.distanceTo(id.position)))}for(let e=Qw.length-1;e>=0;e--)Qw[e].state===`dead`&&(J.remove(Qw[e].g),Qw.splice(e,1));Gu(W.mode===`over`||W.mode===`paused`?0:Math.max(0,1-t/260)*.35)},onSwat(e){for(let t of Qw){if(!_T(t))continue;let n=t.g.position.x-K.pos.x,r=t.g.position.z-K.pos.z,i=Math.hypot(n,r)||1,a=(n*e.fwd.x+r*e.fwd.z)/i;(i<75&&a>.78&&t.g.position.y<100+K.y||t.g.position.distanceTo(e.strike)<22)&&vT(t,fT.copy(e.fwd).addScaledVector(e.right,-e.side*.5).normalize())}},onPounceAir(e,t){for(let n of Qw)_T(n)&&n.g.position.distanceTo(e)<t&&vT(n,K.fwd)},onLaser(e,t){for(let n of Qw)n.g.position.distanceTo(e)<12&&vT(n,t)},onLaserSweep(e,t,n){for(let r of Qw){if(!_T(r))continue;let i=r.g.position.x-e,a=r.g.position.z-t,o=Math.hypot(i,a)||1;o<130&&i/o*Math.sin(n)+a/o*Math.cos(n)>.85&&vT(r,hT.set(i/o,0,a/o))}},onBlast(e){for(let t of Qw){if(!_T(t))continue;let n=t.g.position.x-e.x,r=t.g.position.z-e.z,i=Math.hypot(n,r)||1;i>e.r+30||e.cone!==void 0&&e.dirX!==void 0&&e.dirZ!==void 0&&(n*e.dirX+r*e.dirZ)/i<e.cone||vT(t,hT.set(n/i,0,r/i))}},onFrenzy(){for(let e of Qw)_T(e)&&(e.state=`fall`,e.vel.set((Math.random()-.5)*40,10,(Math.random()-.5)*40),e.spin=10)}};function xT(){for(let e of[bT,Ev,Xw,Tb,nx,Ky,Jx])a.add(e);window.__enemies={debugDog:qy,dogState:Jy,debugRoomba:Yx,debugRoombaState:Xx,roombaState:Zx,spawnVacuum:Qb,spawnJet:bb,trucks:Dv,vacuums:rx,towers:Zw,jets:Eb,cukes:()=>dy(`cuke`)}}var ST={major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10],dorian:[0,2,3,5,7,9,10],mixolydian:[0,2,4,5,7,9,10],pentatonic:[0,2,4,7,9],phrygian:[0,1,3,5,7,8,10]},CT={swing:[0,3,6,4],surf:[0,0,3,4],suburb:[0,4,5,3],synthwave:[0,5,2,6],march:[0,1,0,6],boss:[0,0,1,0]},wT=64,TT=e=>440*2**((e-69)/12);function ET(e){let t=e>>>0||1;return()=>(t^=t<<13,t^=t>>>17,t^=t<<5,(t>>>0)/4294967296)}function DT(e,t){let n=t===`boss`?`boss`:e.style,r=t===`menu`,i=ST[e.scale]??ST.major,a=i.length,o=e.root,s=(e,t=0)=>{let n=Math.floor(e/a),r=(e%a+a)%a;return TT(o+i[r]+12*(n+t))},c=CT[n],l=ET(e.root*7919+e.bpm*131+n.length*17),u={bpm:t===`boss`?Math.min(172,e.bpm*1.15):r?Math.round(e.bpm*.78):e.bpm,vol:r?.5:.8,swing:0,kick:new Float32Array(wT),snare:new Float32Array(wT),hat:new Float32Array(wT),hatOpen:new Uint8Array(wT),bass:new Float32Array(wT),bassDur:new Float32Array(wT),bassType:`triangle`,bassVol:.5,bassCut:900,lead:new Float32Array(wT),leadDur:new Float32Array(wT),leadType:`square`,leadVol:.12,leadCut:3e3,leadTrem:!1,chord:new Float32Array(256),chordDur:new Float32Array(wT),chordType:`triangle`,chordVol:.08,chordStrum:0,chordCut:2400,alarm:new Float32Array(wT),echo:.15},d=(e,t,n,r=0,i=!1)=>{u.chord[e*4]=s(t,r),u.chord[e*4+1]=s(t+2,r),u.chord[e*4+2]=s(t+4,r),u.chord[e*4+3]=i?s(t+7,r):0,u.chordDur[e]=n},f=[];for(let e=0;e<16;e++)f.push(l()<.35?-99:[0,2,4,7,4,2][Math.floor(l()*6)]);for(let e=0;e<wT;e++){let t=e>>4,r=e&15,i=c[t],a=r%4==0;switch(n){case`swing`:if(u.swing=.66,u.echo=.12,(r===0||r===8)&&(u.kick[e]=.8),r===10&&t%2==1&&(u.kick[e]=.4),(r===4||r===12)&&(u.snare[e]=.35),(a||r%4==2)&&(u.hat[e]=a?.18:.12),r===14&&t===3&&(u.hatOpen[e]=1),a){let t=[0,2,4,6][r>>2];u.bass[e]=s(i+t,-2),u.bassDur[e]=3.5}if((r===6||r===14)&&d(e,i,1.5,0,!0),u.chordType=`square`,u.chordVol=.05,u.chordCut=1800,r%2==0){let n=f[(r>>1)+t%2*8];n>-99&&(t%2==0||r<8)&&(u.lead[e]=s(i+n+ +(t===2),1),u.leadDur[e]=1.6)}u.leadType=`triangle`,u.leadVol=.16;break;case`surf`:if(u.echo=.3,(r===0||r===6||r===8||r===14&&t===3)&&(u.kick[e]=.85),(r===4||r===12)&&(u.snare[e]=.5),r%2==0&&(u.hat[e]=r%4==2?.16:.1),r%2==0){let t=[0,0,4,0,7,0,4,2];u.bass[e]=s(i+t[r>>1],-2),u.bassDur[e]=1.6}if(u.bassType=`sawtooth`,u.bassCut=700,u.bassVol=.38,r%4==0){let n=f[(r>>2)+t*4]??0;u.lead[e]=s(i+(n>-99?n:4),1),u.leadDur[e]=4}u.leadTrem=!0,u.leadType=`sawtooth`,u.leadVol=.07,u.leadCut=2600;break;case`suburb`:if(u.echo=.14,(r===0||r===8)&&(u.kick[e]=.6),(r===4||r===12)&&(u.snare[e]=.22),u.hat[e]=r%2==0?.07:.04,(r===0||r===6||r===8||r===14)&&(u.bass[e]=s(i+(r===6||r===14?4:0),-2),u.bassDur[e]=2),(r===0||r===3||r===6||r===8||r===10||r===12||r===14)&&d(e,i,1.2,0,!0),u.chordType=`triangle`,u.chordVol=.09,u.chordStrum=.014,u.chordCut=3200,r===0||r===8){let n=f[t*2+(r>>3)];u.lead[e]=s(i+(n>-99?n:2),2),u.leadDur[e]=6}u.leadType=`sine`,u.leadVol=.11;break;case`synthwave`:u.echo=.32,a&&(u.kick[e]=.95),(r===4||r===12)&&(u.snare[e]=.6),r%4==2&&(u.hat[e]=.14,u.hatOpen[e]=1),r%2==0&&(u.bass[e]=s(i,r%4==0?-2:-1),u.bassDur[e]=1.5),u.bassType=`sawtooth`,u.bassCut=520,u.bassVol=.42,r===0&&d(e,i,15,0,!0),u.chordType=`sawtooth`,u.chordVol=.035,u.chordCut=1200;{let t=[0,2,4,7];u.lead[e]=s(i+t[r%4],1),u.leadDur[e]=.8}u.leadType=`square`,u.leadVol=.045,u.leadCut=2200;break;case`march`:if(u.echo=.1,(r===0||r===8)&&(u.kick[e]=.9),(r===4||r===12)&&(u.snare[e]=.5),t===3&&r>=12&&(u.snare[e]=.18+(r-12)*.08),(r===15||r===7)&&(u.snare[e]=Math.max(u.snare[e],.2)),r%2==0&&(u.hat[e]=.06),(r===0||r===8)&&(u.bass[e]=s(i,-2),u.bassDur[e]=2),(r===4||r===12)&&(u.bass[e]=s(i+4,-2),u.bassDur[e]=2),(r===2||r===6||r===10||r===14)&&d(e,i,1,0),u.chordType=`square`,u.chordVol=.04,u.chordCut=1400,r%4==0||r%4==3&&l()<.5){let n=f[(r>>1)+t%2*8];u.lead[e]=s(i+(n>-99?n:4),1),u.leadDur[e]=r%4==0?2.5:.8}u.leadType=`sawtooth`,u.leadVol=.07,u.leadCut=1500;break;case`boss`:u.echo=.18,(a||r===14||r===7)&&(u.kick[e]=1),(r===4||r===12)&&(u.snare[e]=.7),u.hat[e]=r%2==0?.14:.08,u.bass[e]=s(i+ +(r===14),-2),u.bassDur[e]=.9,u.bassType=`sawtooth`,u.bassCut=800,u.bassVol=.36,r===0&&(u.alarm[e]=s(0,2),u.alarm[e+4]=s(1,2)),(r===8||r===10)&&(u.lead[e]=s(i+(r===8?4:5),1),u.leadDur[e]=2),u.leadType=`square`,u.leadVol=.07,u.leadCut=2e3}}if(r){for(let e=0;e<wT;e++)u.kick[e]=e&15?0:.25,u.snare[e]=0,u.hat[e]*=e&3?0:.5,u.hatOpen[e]=0,e&7?u.bass[e]=0:u.bassDur[e]=7,((e&1)==1||l()<.4)&&(u.lead[e]=0);u.leadTrem=!1,u.leadCut=Math.min(u.leadCut,1600),u.bassType=`triangle`,u.bassCut=600,u.echo=Math.max(u.echo,.28)}return u}var OT=null,kT=null,AT=null,jT=``,MT=0,NT=0,PT=0,FT=0,IT=.14;function LT(e){let t=e.ctx,n=t.createGain();n.gain.value=0;let r=t.createBiquadFilter();r.type=`lowpass`,r.frequency.value=18e3,r.Q.value=.7;let i=t.createGain();n.connect(r).connect(i).connect(e.music);let a=t.createGain();a.gain.value=.15;let o=t.createDelay(1);o.delayTime.value=.21;let s=t.createGain();s.gain.value=.32;let c=t.createBiquadFilter();c.type=`lowpass`,c.frequency.value=2400,a.connect(o).connect(c).connect(s).connect(o),c.connect(r);let l=t.createBiquadFilter();l.type=`highpass`,l.frequency.value=7e3,l.connect(n);let u=t.createBiquadFilter();return u.type=`bandpass`,u.frequency.value=1900,u.Q.value=.8,u.connect(n),{a:e,track:n,lp:r,duck:i,echoIn:a,hatHP:l,snareBP:u}}function RT(e,t,n,r,i,a,o,s=.005,c=!1){let l=e.a.ctx,u=l.createOscillator();u.type=t,u.frequency.setValueAtTime(n,r);let d=l.createBiquadFilter();d.type=`lowpass`,d.frequency.setValueAtTime(o,r);let f=l.createGain();f.gain.setValueAtTime(1e-4,r),f.gain.exponentialRampToValueAtTime(Math.max(2e-4,a),r+s),f.gain.setTargetAtTime(1e-4,r+s+i*.4,i*.35),u.connect(d).connect(f).connect(e.track),c&&f.connect(e.echoIn),u.start(r),u.stop(r+s+i*1.6+.05)}function zT(e,t,n,r,i){let a=e.a.ctx,o=a.createBufferSource();o.buffer=e.a.noiseBuf;let s=a.createGain();s.gain.setValueAtTime(r,n),s.gain.exponentialRampToValueAtTime(1e-4,n+i),o.connect(s).connect(t),o.start(n,Math.random()*1.5,i+.05)}function BT(e,t,n){let r=e.a.ctx,i=r.createOscillator();i.type=`sine`,i.frequency.setValueAtTime(140,t),i.frequency.exponentialRampToValueAtTime(42,t+.14);let a=r.createGain();a.gain.setValueAtTime(n,t),a.gain.exponentialRampToValueAtTime(1e-4,t+.3),i.connect(a).connect(e.track),i.start(t),i.stop(t+.32)}function VT(e,t,n){zT(e,e.snareBP,t,n*.9,.16);let r=e.a.ctx,i=r.createOscillator();i.type=`triangle`,i.frequency.setValueAtTime(200,t),i.frequency.exponentialRampToValueAtTime(140,t+.08);let a=r.createGain();a.gain.setValueAtTime(n*.35,t),a.gain.exponentialRampToValueAtTime(1e-4,t+.1),i.connect(a).connect(e.track),i.start(t),i.stop(t+.12)}function HT(e,t,n,r){let i=60/t.bpm/4,a=t.vol;t.kick[n]>0&&BT(e,r,t.kick[n]*a),t.snare[n]>0&&VT(e,r,t.snare[n]*a);let o=t.hat[n];FT>0&&o===0&&UT()!==`menu`&&(o=.06),o>0&&zT(e,e.hatHP,r,o*a,t.hatOpen[n]?.22:.045),t.bass[n]>0&&RT(e,t.bassType,t.bass[n],r,t.bassDur[n]*i,t.bassVol*a,t.bassCut,.008);let s=t.lead[n];if(s>0){let o=FT>0?s*2:s;if(t.leadTrem){let s=Math.max(1,Math.round(t.leadDur[n]));for(let n=0;n<s;n++)RT(e,t.leadType,o,r+n*i,i*.7,t.leadVol*a*(n===0?1.2:.85),t.leadCut,.003,!0)}else RT(e,t.leadType,o,r,t.leadDur[n]*i,t.leadVol*a,t.leadCut,.01,!0)}let c=n*4;if(t.chord[c]>0){let o=t.chordDur[n]*i,s=o>i*4;for(let n=0;n<4;n++){let i=t.chord[c+n];i>0&&RT(e,t.chordType,i,r+n*t.chordStrum,o,t.chordVol*a,t.chordCut,s?.25:.004,s)}}t.alarm[n]>0&&RT(e,`square`,t.alarm[n],r,i*3,.06*a,3500,.004,!0)}var UT=()=>AT?.variant??`menu`;function WT(){if(!OT||!kT)return;let e=OT.a.ctx;if(e.state!==`running`)return;let t=e.currentTime;NT<t-.25&&(NT=t+.05);let n=60/kT.bpm/4;for(;NT<t+IT;){let e=(MT&3)==2?kT.swing*n:0;HT(OT,kT,MT,NT+e),MT=(MT+1)%wT,NT+=n}}function GT(){if(!OT||!AT)return;let e=`${AT.variant}:${AT.spec.style}:${AT.spec.bpm}:${AT.spec.root}:${AT.spec.scale}`,t=OT.a.ctx.currentTime;if(e===jT&&kT){OT.track.gain.cancelScheduledValues(t),OT.track.gain.setTargetAtTime(1,t,.2);return}jT=e;let n=!kT;kT=DT(AT.spec,AT.variant),OT.echoIn.gain.setTargetAtTime(kT.echo,t,.05),OT.track.gain.cancelScheduledValues(t),OT.track.gain.setTargetAtTime(0,t,.04),OT.track.gain.setTargetAtTime(1,t+.18,n?.6:.12),MT=0,NT=t+.2,PT||=window.setInterval(WT,25)}function KT(e,t){AT={spec:e,variant:t},t!==`level`&&(FT=0),GT()}function qT(e=1.2){if(AT=null,!OT)return;let t=OT.a.ctx.currentTime;OT.track.gain.cancelScheduledValues(t),OT.track.gain.setTargetAtTime(0,t,e/4);let n=OT;window.setTimeout(()=>{AT||(kT=null,jT=``,PT&&clearInterval(PT),PT=0,n.track.gain.cancelScheduledValues(n.a.ctx.currentTime))},e*1e3+50)}function JT(e=-8,t=.4){if(!OT)return;let n=OT.duck.gain,r=OT.a.ctx.currentTime;n.cancelScheduledValues(r),n.setTargetAtTime(10**(e/20),r,.015),n.setTargetAtTime(1,r+t,.12)}function YT(e){OT&&OT.lp.frequency.setTargetAtTime(e?520:18e3,OT.a.ctx.currentTime,e?.06:.12)}function XT(e){FT=e}var ZT=!1;function QT(){ZT||(ZT=!0,ku(e=>{OT=LT(e),AT&&GT()}),U.on(`levelLoad`,({level:e})=>{YT(!1),KT(e.music,`menu`)}),U.on(`levelStart`,({level:e})=>{YT(!1),KT(e.music,`level`)}),U.on(`bossSpawn`,()=>{W.level&&KT(W.level.music,`boss`),JT()}),U.on(`bossDefeated`,()=>{JT(-12,.8),W.level&&!W.level.boss?.endsLevel&&W.mode===`play`&&KT(W.level.music,`level`)}),U.on(`bossPhase`,()=>JT()),U.on(`levelEnd`,()=>qT(1.4)),U.on(`frenzy`,()=>XT(1)),U.on(`pause`,()=>YT(!0)),U.on(`resume`,()=>YT(!1)),U.on(`ultraStart`,()=>JT()),U.on(`bigHit`,({strength:e})=>{e>=.5&&JT(-8*Math.min(1,e),.4)}))}var $T=()=>Au()?.ctx.currentTime??0,eE=(e,t)=>e*2**(t/12);function tE(){Au()&&(H(`triangle`,660,.05,.18,{to:520}),H(`sine`,1320,.03,.05))}function nE(){Au()&&H(`sine`,880,.03,.06)}function rE(){Au()&&H(`triangle`,520,.07,.15,{to:330})}function iE(){if(!Au())return;let e=$T();H(`square`,150,.09,.1,{at:e}),H(`square`,120,.12,.1,{at:e+.1})}function aE(e=0){if(!Au())return;let t=$T(),n=eE(1046,[0,4,7][Math.max(0,Math.min(2,e))]);H(`sine`,n,.6,.22,{at:t}),H(`sine`,n*2.01,.35,.07,{at:t}),H(`triangle`,n*3,.15,.04,{at:t+.01})}function oE(){Au()&&H(`square`,1800+Math.random()*200,.015,.03)}function sE(){if(!Au())return;let e=$T();[0,4,7,12].forEach((t,n)=>{H(`triangle`,eE(784,t),.25,.16,{at:e+n*.06}),H(`sine`,eE(784,t)*2,.18,.05,{at:e+n*.06})})}function cE(){if(!Au())return;let e=$T();for(let[t,n,r]of[[0,0,.12],[0,.13,.12],[0,.26,.12],[5,.39,.3],[9,.72,.18],[12,.92,.6]])H(`sawtooth`,eE(523,t),r,.07,{at:e+n,attack:.02}),H(`square`,eE(523,t-12),r,.04,{at:e+n,attack:.02});H(`triangle`,eE(523,16),.8,.06,{at:e+.92})}function lE(e){if(!Au())return;let t=$T();e?[0,4,7,11,12].forEach((e,n)=>H(`triangle`,eE(392,e),.3,.12,{at:t+n*.09})):(H(`triangle`,392,.5,.12,{at:t,to:196}),H(`triangle`,330,.7,.1,{at:t+.45,to:147}))}function uE(){if(!Au())return;let e=$T();H(`sine`,880,.12,.12,{at:e}),H(`sine`,1320,.2,.1,{at:e+.08})}function dE(e,t){switch(e.kind){case`damage`:return t.damage;case`landmarks`:return t.landmarks;case`kills`:return e.enemy?t.kills[e.enemy]??0:Object.values(t.kills).reduce((e,t)=>e+(t??0),0);case`patience`:return t.patience;case`destroyedPct`:return t.destroyedPct;case`combo`:return t.maxCombo;case`fish`:return t.fish;case`buildings`:return t.buildings;case`boss`:return+!!t.bossDefeated}}function fE(e,t){return t.why===`quit`||e.kind===`patience`&&t.why===`wet`?!1:dE(e,t)>=e.target}function pE(e,t){let n=e.objectives.map(e=>fE(e,t));return{met:n,stars:n.filter(Boolean).length}}function mE(e){let t=0;for(let n of Object.values(e.levels))t+=n?.stars??0;return t}function hE(e,t,n){if(e.index===0)return!0;let r=n.find(t=>t.index===e.index-1);return r?(t.levels[r.id]?.stars??0)>=1&&mE(t)>=e.unlockStars:!1}var $=e=>document.getElementById(e),gE=e=>e.replace(/[&<>"']/g,e=>`&#${e.charCodeAt(0)};`),_E={star:(e,t=``)=>`<svg class="ico star ${e?`on`:`off`} ${t}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2l2.95 6.1 6.7.9-4.9 4.6 1.2 6.6L12 17.2l-5.95 3.2 1.2-6.6-4.9-4.6 6.7-.9z"/></svg>`,leaf:()=>`<svg class="ico leaf" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 3C10 3 4 8 4 15c0 2 .6 3.6 1.4 4.8L3.5 21.6l1 1 2-1.9C7.7 21.5 9.3 22 11 22c7 0 11-7 9-19zM8 18c2-4 5-7 9-9-3 3-6 6-9 9z"/></svg>`,lock:()=>`<svg class="ico lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0110 0v3h1.5a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 20.5v-9A1.5 1.5 0 015.5 10H7zm2.5 0h5V7a2.5 2.5 0 00-5 0v3z"/></svg>`,cog:()=>`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 00-1.7-1L15 3.2h-4l-.4 2.7a7.6 7.6 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 001.7 1l.4 2.7h4l.4-2.7a7.6 7.6 0 001.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" transform="translate(-1 0)"/></svg>`,pause:()=>`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>`,back:()=>`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4L7 12l8.5 8 2-2-6.4-6 6.4-6z"/></svg>`,paw:()=>`<svg class="ico paw" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16" rx="5.2" ry="4.4"/><ellipse cx="5.2" cy="10" rx="2.1" ry="2.7"/><ellipse cx="9.2" cy="5.8" rx="2.1" ry="2.8"/><ellipse cx="14.8" cy="5.8" rx="2.1" ry="2.8"/><ellipse cx="18.8" cy="10" rx="2.1" ry="2.7"/></svg>`,check:()=>`<svg class="ico check" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 16.2L5.3 12l-2 2 6.2 6.2L21 8.7l-2-2z"/></svg>`};function vE(e,t=`#ffd24a`,n=``){return`<svg class="face ${n}" viewBox="0 0 64 56" aria-hidden="true">
    <path d="M8 22 L6 2 L24 14 Q32 11 40 14 L58 2 L56 22 Q60 30 58 38 Q52 54 32 54 Q12 54 6 38 Q4 30 8 22z" fill="${e}" stroke="#241a16" stroke-width="3" stroke-linejoin="round"/>
    <path d="M11 8 L20 14 L12 18z M53 8 L44 14 L52 18z" fill="#ffb3c7" opacity=".8"/>
    <ellipse cx="22" cy="31" rx="5.5" ry="6.5" fill="${t}" stroke="#241a16" stroke-width="2"/><ellipse cx="42" cy="31" rx="5.5" ry="6.5" fill="${t}" stroke="#241a16" stroke-width="2"/>
    <ellipse cx="22.6" cy="31.5" rx="1.8" ry="4.6" fill="#241a16"/><ellipse cx="42.6" cy="31.5" rx="1.8" ry="4.6" fill="#241a16"/>
    <path d="M29 40 L35 40 L32 43.5z" fill="#ff7aa0" stroke="#241a16" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M32 43.5 Q29 47.5 25 45.5 M32 43.5 Q35 47.5 39 45.5" fill="none" stroke="#241a16" stroke-width="2" stroke-linecap="round"/>
    <path d="M4 38 L16 39 M4 44 L16 42 M60 38 L48 39 M60 44 L48 42" stroke="#241a16" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`}function yE(e,t,n=tE){e.addEventListener(`click`,r=>{Ou(),e.getAttribute(`aria-disabled`)!==`true`&&n&&n(),t(r)})}var bE=[];function xE(e,t){bE.push({el:e,onClose:t,returnFocus:document.activeElement}),e.classList.remove(`hidden`),document.body.classList.add(`modal-open`),OE(e)}function SE(){let e=bE.pop();return e?(e.el.classList.add(`hidden`),bE.length||document.body.classList.remove(`modal-open`),e.onClose?.(),e.returnFocus instanceof HTMLElement&&document.contains(e.returnFocus)&&e.returnFocus.focus({preventScroll:!0}),!0):!1}var CE=()=>bE.length>0,wE=()=>bE[bE.length-1]?.el??null;function TE(){let e=wE();if(e)return e;let t=o_.current();return t?document.getElementById(t):null}function EE(e){if(e.offsetParent===null&&getComputedStyle(e).position!==`fixed`)return!1;let t=e.getBoundingClientRect();return t.width>0&&t.height>0}function DE(e){return[...e.querySelectorAll(`button, input, [data-focus]`)].filter(e=>!e.disabled&&EE(e))}function OE(e){let t=e.querySelector(`[data-primary]`);(t&&EE(t)?t:DE(e)[0])?.focus({preventScroll:!1})}function kE(e,t){let n=TE();if(!n)return;let r=DE(n);if(!r.length)return;let i=document.activeElement;if(!i||!n.contains(i)||!r.includes(i)){OE(n);return}let a=i.getBoundingClientRect(),o=a.left+a.width/2,s=a.top+a.height/2,c=null,l=1/0;for(let n of r){if(n===i)continue;let r=n.getBoundingClientRect(),a=r.left+r.width/2,u=r.top+r.height/2,d=a-o,f=u-s,p=d*e+f*t;if(p<=4)continue;let m=p+Math.abs(d*t-f*e)*2.2;m<l&&(l=m,c=n)}c&&(c.focus({preventScroll:!1}),c.scrollIntoView?.({block:`nearest`,inline:`nearest`}),nE())}function AE(e,t,n){let r=performance.now(),i=0,a=!0,o=()=>{if(!a)return;let s=Math.min(1,(performance.now()-r)/e);t(1-(1-s)**3),s<1?i=requestAnimationFrame(o):n?.()};return o(),()=>{a=!1,cancelAnimationFrame(i)}}function jE(e,t=1800){let n=$(`toast`);n&&(n.textContent=e,n.classList.remove(`hidden`),n.getAnimations().forEach(e=>e.cancel()),n.animate([{opacity:0,transform:`translate(-50%, 20px)`},{opacity:1,transform:`translate(-50%, 0)`,offset:.12},{opacity:1,transform:`translate(-50%, 0)`,offset:.85},{opacity:0,transform:`translate(-50%, 10px)`}],{duration:t,easing:`ease-out`,fill:`forwards`}))}function ME(e){e.animate([{transform:`translateX(0)`},{transform:`translateX(-8px)`},{transform:`translateX(7px)`},{transform:`translateX(-4px)`},{transform:`translateX(0)`}],{duration:300})}var NE=`ultracat.save`,PE=9999999,FE=1e9,IE=0xe8d4a51000,LE=()=>{try{return typeof matchMedia==`function`&&matchMedia(`(pointer: coarse)`).matches}catch{return!1}};function RE(){return{master:1,music:.6,sfx:1,shake:1,quality:LE()?`low`:`high`}}function zE(){let e={};for(let t of Ju)e[t]={owned:t===`tabby`,upgrades:{power:0,speed:0,fur:0,ultra:0}};return{v:1,catnip:0,selectedCat:`tabby`,cats:e,levels:{},settings:RE(),tutorialDone:!1,totals:{runs:0,damage:0,catnipEarned:0}}}var BE=e=>typeof e==`object`&&!!e&&!Array.isArray(e);function VE(e,t,n,r,i=!1){return typeof e!=`number`||!Number.isFinite(e)?r:Math.min(n,Math.max(t,i?Math.floor(e):e))}var HE=(e,t)=>typeof e==`boolean`?e:t;function UE(e){let t=RE();return BE(e)?{master:VE(e.master,0,1,t.master),music:VE(e.music,0,1,t.music),sfx:VE(e.sfx,0,1,t.sfx),shake:VE(e.shake,0,1,t.shake),quality:e.quality===`low`||e.quality===`high`?e.quality:t.quality}:t}function WE(e,t){let n={power:0,speed:0,fur:0,ultra:0},r=e===`tabby`?!0:BE(t)?HE(t.owned,!1):!1;if(BE(t)&&BE(t.upgrades))for(let e of Yu)n[e]=VE(t.upgrades[e],0,5,0,!0);return{owned:r,upgrades:n}}var GE=e=>e.reduce((e,t)=>e+ +!!t,0);function KE(e){if(!BE(e))return null;let t=Array.isArray(e.objectives)?e.objectives:[],n=[t[0]===!0,t[1]===!0,t[2]===!0];return{stars:Math.max(VE(e.stars,0,3,0,!0),GE(n)),objectives:n,best:VE(e.best,0,IE,0),plays:VE(e.plays,0,FE,0,!0)}}function qE(e){try{if(typeof e==`string`)try{e=JSON.parse(e)}catch{return zE()}let t=zE();if(!BE(e))return t;let n={},r=BE(e.cats)?e.cats:{};for(let e of Ju)n[e]=WE(e,r[e]);let i={},a=BE(e.levels)?e.levels:{};for(let e of qu){let t=KE(a[e]);t&&(i[e]=t)}let o=e.selectedCat,s=typeof o==`string`&&Ju.includes(o)&&n[o].owned?o:`tabby`,c=BE(e.totals)?e.totals:{};return{v:1,catnip:VE(e.catnip,0,PE,0,!0),selectedCat:s,cats:n,levels:i,settings:UE(e.settings),tutorialDone:HE(e.tutorialDone,!1),totals:{runs:VE(c.runs,0,FE,0,!0),damage:VE(c.damage,0,IE,0),catnipEarned:VE(c.catnipEarned,0,FE,0,!0)}}}catch{return zE()}}function JE(){try{let e=localStorage.getItem(NE);return e?qE(e):zE()}catch{return zE()}}function YE(e){try{return localStorage.setItem(NE,JSON.stringify(e)),!0}catch{return!1}}var XE=JE(),ZE=!0,QE={get:()=>XE,set(e){XE=e,ZE=YE(e)},persisted:()=>ZE};addEventListener(`storage`,e=>{e.key===`ultracat.save`&&e.newValue&&(XE=JE())});function $E(){let e=XE;return i.has(e.selectedCat)&&e.cats[e.selectedCat]?.owned?e.selectedCat:`tabby`}function eD(e){return gw(i.get(e).base,XE.cats[e].upgrades)}var tD=$(`cats`),nD=$(`catTabs`),rD=$(`catPanel`),iD=`tabby`,aD={power:[`POWER`,`Harder swats, bigger pounce`],speed:[`SPEED`,`Faster paws and zoomies`],fur:[`FUR`,`More patience, shrugs off water`],ultra:[`ULTRA`,`Charges faster, lasts longer`]},oD=[[`SPEED`,e=>e.walk+e.zoom*.3],[`SWAT`,e=>e.swatPower*e.swatRadius/e.swatCd],[`POUNCE`,e=>e.pounceR/Math.sqrt(e.pounceCd)],[`PATIENCE`,e=>e.patienceMax/e.wetResist],[`ULTRA`,e=>e.ultraCharge*e.ultraTime]],sD={power:5,speed:5,fur:5,ultra:5};function cD(){let e=Ju.filter(e=>i.has(e)).map(e=>gw(i.get(e).base,sD));return oD.map(([,t])=>Math.max(...e.map(t)))}var lD={tabby:`#9be36a`,chonk:`#ffd24a`,shadow:`#ffe14a`,siamese:`#5cc8ff`};function uD(){let e=QE.get(),t=$E();nD.innerHTML=Ju.filter(e=>i.has(e)).map(n=>{let r=i.get(n),a=e.cats[n].owned,o=n===t?`SELECTED`:a?`OWNED`:`${_E.leaf()} ${sw(n)}`;return`<button class="ctab ${n===iD?`on`:``} ${a?``:`locked`} ${lw(e,n)?`afford`:``}" data-id="${n}" style="--c:${r.color}">
        ${vE(a?r.color:`#6b625a`,a?lD[n]??`#ffd24a`:`#3a332e`)}
        <b class="txt">${gE(r.name)}</b><small>${o}</small></button>`}).join(``),nD.querySelectorAll(`.ctab`).forEach(e=>{let t=e.dataset.id;yE(e,()=>fD(t,!0)),e.addEventListener(`focus`,()=>fD(t,!1))})}function dD(){let e=QE.get(),t=i.get(iD),n=e.cats[iD],r=n.owned,a=$E()===iD,o=gw(t.base,n.upgrades),s=cD(),c=oD.map(([e,n],r)=>{let i=n(o)/s[r];return`<div class="stat"><span>${e}</span><i><em style="transform:scaleX(${(n(gw(t.base,{}))/s[r]).toFixed(3)})"></em><u style="transform:scaleX(${i.toFixed(3)})"></u></i></div>`}).join(``),l=sw(iD),u=r?a?`<button class="go small sel" id="catAct" data-primary>${_E.check()} SELECTED</button>`:`<button class="go small" id="catAct" data-primary>SELECT</button>`:`<button class="go small buy" id="catAct" data-primary ${lw(e,iD)?``:`aria-disabled="true"`}>BUY ${_E.leaf()} ${l}</button>`,d=!r&&!lw(e,iD)?`<div class="need">${l-e.catnip} more catnip. Wreck cities to earn it.</div>`:``,f=Yu.map(t=>{let i=n.upgrades[t],a=cw(iD,t,i),o=dw(e,iD,t),s=Array.from({length:5},(e,t)=>`<i class="${t<i?`on`:``}"></i>`).join(``),c=a===null?`<button class="ubtn max" aria-disabled="true" data-up="${t}">MAX</button>`:`<button class="ubtn" data-up="${t}" ${o?``:`aria-disabled="true"`}>${_E.leaf()} ${a}</button>`;return`<div class="up ${r?``:`dim`}"><div class="uname"><b>${aD[t][0]}</b><small>${aD[t][1]}</small></div><div class="pips">${s}</div>${c}</div>`}).join(``);rD.innerHTML=`
    <div class="cinfo" style="--c:${t.color}">
      <div class="chead"><b class="txt">${gE(t.name)}</b><span class="ult">ULTRA: ${gE(t.ultraName)}</span></div>
      <p class="blurb">${gE(t.blurb)}</p>
      <div class="stats2">${c}</div>
      <div class="cact">${u}${d}</div>
    </div>
    <div class="ups">${r?``:`<div class="uphint">Buy this cat to upgrade it</div>`}${f}</div>`,yE($(`catAct`),()=>mD($(`catAct`)),null),rD.querySelectorAll(`.ubtn`).forEach(e=>yE(e,()=>hD(e.dataset.up,e),null)),$(`catNip`).innerHTML=`${_E.leaf()} ${e.catnip}`}function fD(e,t){(iD!==e||t)&&(iD=e,nD.querySelectorAll(`.ctab`).forEach(t=>t.classList.toggle(`on`,t.dataset.id===e)),dD())}function pD(e){W.mode===`title`&&W.level&&Yg(W.level.id,e,eD(e))}function mD(e){let t=QE.get();if(!t.cats[iD].owned){if(!lw(t,iD)){iE(),ME(e);return}QE.set({...uw(t,iD),selectedCat:iD}),sE(),setTimeout(cE,250),jE(`${i.get(iD).name} joins the rampage!`),pD(iD)}else if($E()!==iD)tE(),QE.set({...t,selectedCat:iD}),pD(iD);else return;uD(),dD(),$(`catAct`).focus({preventScroll:!0})}function hD(e,t){let n=QE.get();if(!dw(n,iD,e)){iE(),ME(t);return}QE.set(fw(n,iD,e)),sE(),uD(),dD();let r=rD.querySelector(`.ubtn[data-up="${e}"]`);r?.focus({preventScroll:!0});let i=r?.parentElement?.querySelectorAll(`.pips i.on`);i?.[i.length-1]?.animate([{transform:`scale(2.2)`},{transform:`scale(1)`}],{duration:300,easing:`cubic-bezier(.2,1.6,.4,1)`})}function gD(){o_.register({id:`cats`,el:tD,onShow:()=>{iD=$E(),uD(),dD(),$(`catAct`)?.focus({preventScroll:!0})}}),yE($(`catsBack`),()=>o_.back(),rE)}var _D={heli:[`Spray-bottle heli`,`Helis`],cannonTruck:[`Water-cannon truck`,`Fire trucks`],cucumberTower:[`Cucumber tower`,`Cucumber towers`],cucumberJet:[`Cucumber jet`,`Jets`],vacuum:[`Robot vacuum`,`Vacuums`],mechaDog:[`Mecha-Dog`,`Mecha-Dog`],roombaPrime:[`Roomba Prime`,`Roomba Prime`]};function vD(e){let t=[];for(let n of e.enemies){let e=_D[n.type]?.[1];e&&!t.includes(e)&&t.push(e)}return e.boss&&t.push(`BOSS: ${_D[e.boss.type]?.[0]??e.boss.type}`),t}var yD=e=>e>=1e3?`$${+(e/1e3).toFixed(2)}B`:Number.isInteger(e)?`$${e}M`:Bf(e),bD=(e,t,n=!1)=>e.kind===`damage`?n?yD(t):Bf(t):e.kind===`destroyedPct`?`${Math.floor(t)}%`:String(Math.floor(t));function xD(e,t,n=!0){let r=dE(e,t),i=n?Math.min(r,e.target):r;return e.kind===`boss`?r>=1?`DOWN`:`not yet`:e.kind===`patience`?`${Math.floor(r)} / ${e.target}`:`${bD(e,i)} / ${bD(e,e.target,!0)}`}function SD(e){switch(e.kind){case`damage`:return`Damage`;case`landmarks`:return`Landmarks`;case`kills`:return e.enemy?_D[e.enemy][1]:`Kills`;case`patience`:return`Keep patience`;case`destroyedPct`:return`City wrecked`;case`combo`:return`Best combo`;case`fish`:return`Fish trucks`;case`buildings`:return`Buildings`;case`boss`:return e.enemy?_D[e.enemy][0]:`Boss`}}function CD(e,t){let n=dE(e,t);return e.target>0?Math.max(0,Math.min(1,n/e.target)):+(n>0)}var wD=(e,t)=>dE(e,t)>=e.target,TD={title:()=>{},map:e=>{},cats:()=>{},intro:e=>{},play:()=>{},retry:()=>{},pause:()=>{},resume:()=>{},quitToMap:()=>{},settings:()=>{}},ED={levelId:`meowhattan`,catId:`tabby`},DD=$(`objTrack`),OD=$(`bossBar`),kD=$(`bossName`),AD=$(`bossPhase`),jD=$(`bossFill`),MD=$(`bossLag`),ND=$(`tbUltra`),PD=$(`hint`),FD=[],ID=0,LD=0,RD=0,zD=!1;function BD(e){DD.innerHTML=e.objectives.map(e=>`<div class="orow"><span class="ostar">${_E.star(!1)}</span><span class="olab">${gE(SD(e))}</span><span class="oval"></span><i><u></u></i></div>`).join(``),FD=[...DD.querySelectorAll(`.orow`)].map(e=>({el:e,txt:e.querySelector(`.oval`),bar:e.querySelector(`u`),met:!1}))}function VD(){let e=W.level;if(!e||FD.length!==e.objectives.length)return;let t=Jg(`time`);e.objectives.forEach((e,n)=>{let r=FD[n];r.txt.textContent=xD(e,t),r.bar.style.transform=`scaleX(${CD(e,t).toFixed(3)})`;let i=wD(e,t);i!==r.met&&(r.met=i,r.el.classList.toggle(`met`,i),r.el.querySelector(`.ostar`).innerHTML=_E.star(i),i&&e.kind!==`patience`&&(aE(n),r.el.animate([{transform:`scale(1.25)`},{transform:`scale(1)`}],{duration:380,easing:`cubic-bezier(.2,1.6,.4,1)`})))})}function HD(e=0){e||document.body.classList.remove(`bossup`),e?LD=window.setTimeout(()=>{OD.classList.add(`hidden`),document.body.classList.remove(`bossup`)},e):(clearTimeout(LD),OD.classList.add(`hidden`))}function UD(){let e=W.cat;e&&(ND.textContent=e.ultraName,PD.textContent=`WASD move · J / click swat · SPACE pounce · SHIFT zoomies · E ${e.ultraName} when full · ESC pause`)}function WD(){U.on(`levelLoad`,({level:e})=>{BD(e),HD(),OD.classList.remove(`dead`),UD()}),U.on(`levelStart`,()=>{VD(),UD(),clearTimeout(RD),zD=!1,PD.classList.remove(`faded`),QE.get().tutorialDone&&(RD=window.setTimeout(()=>PD.classList.add(`faded`),15e3))}),U.on(`bossSpawn`,({name:e,maxHp:t})=>{clearTimeout(LD),kD.textContent=e,AD.textContent=``,jD.style.transform=MD.style.transform=`scaleX(1)`,OD.dataset.max=String(t),OD.classList.remove(`hidden`,`dead`),document.body.classList.add(`bossup`),OD.animate([{transform:`translateX(-50%) scale(1.6)`,opacity:0},{transform:`translateX(-50%) scale(1)`,opacity:1}],{duration:400,easing:`cubic-bezier(.2,1.5,.4,1)`})}),U.on(`bossHp`,({hp:e,maxHp:t})=>{let n=Math.max(0,Math.min(1,e/(t||1)));jD.style.transform=`scaleX(${n.toFixed(3)})`,MD.style.transform=`scaleX(${n.toFixed(3)})`,OD.classList.remove(`hit`),OD.offsetWidth,OD.classList.add(`hit`)}),U.on(`bossPhase`,({phase:e,name:t})=>{AD.textContent=`PHASE ${e}${t?`: ${t}`:``}`,AD.animate([{transform:`scale(1.8)`,opacity:0},{transform:`scale(1)`,opacity:1}],{duration:350})}),U.on(`bossDefeated`,()=>{jD.style.transform=MD.style.transform=`scaleX(0)`,AD.textContent=`DEFEATED!`,OD.classList.add(`dead`),HD(1800)}),U.on(`levelEnd`,()=>HD()),U.on(`pause`,VD);let e=$(`pauseBtn`);e.innerHTML=_E.pause(),e.addEventListener(`pointerdown`,e=>{e.preventDefault(),e.stopPropagation(),TD.pause()}),td&&document.body.classList.add(`touch`),kh(e=>{W.mode===`play`&&(!zD&&G.patience<q.patienceMax*.5&&G.fish===0&&(zD=!0,Ap(innerWidth<600?`GRAB A FISH!`:`SOGGY! GRAB A FISH TRUCK!`,`#4cc3ff`)),ID+=e,!(ID<.25)&&(ID=0,VD()))})}var GD=$(`intro`),KD=`meowhattan`;function qD(){let e=r.get(KD),t=QE.get(),n=t.levels[e.id],a=i.get(ED.catId),s=o().length,c=e.objectives.map((e,t)=>{let r=!!n?.objectives[t];return`<li class="${r?`done`:``}">${_E.star(r)}<span>${gE(e.label)}</span>${r?`<em>earned</em>`:``}</li>`}).join(``),l=vD(e),u=t.cats[ED.catId]?.upgrades,d=e.boss?.endsLevel&&(u?.fur??0)<2&&ED.catId!==`chonk`?`<b>TOUGH FIGHT</b> Recommended: Big Biscuit, or FUR level 2 (CATS).`:``;$(`introBody`).innerHTML=`
    <div class="ilabel txt">CITY ${e.index+1} OF ${s} · ${e.duration} SECONDS</div>
    <h2 class="iname txt">${gE(e.name)}</h2>
    <p class="itag">${gE(e.tagline)}</p>
    <ul class="iobj">${c}</ul>
    ${l.length?`<div class="ithreat"><b>WATCH OUT</b> ${l.map(e=>`<span>${gE(e)}</span>`).join(``)}</div>`:``}
    <div class="ifish"><b>FISH TRUCKS</b> refill patience: follow the blue FISH arrow when you get wet.</div>
    ${d?`<div class="irec">${d}</div>`:``}
    ${n?.plays?`<div class="ibest">Best ${Bf(n.best)}</div>`:``}
    <button class="icat" id="introCat" style="--c:${a.color}">${vE(a.color)}<span><b>${gE(a.name)}</b><small>ULTRA: ${gE(a.ultraName)} · change</small></span></button>`,yE($(`introCat`),()=>TD.cats())}function JD(){o_.register({id:`intro`,el:GD,onShow:e=>{e&&(KD=e),ED.levelId=KD,ED.catId=$E(),Yg(KD,ED.catId,eD(ED.catId)),qD(),$(`introPlay`).focus({preventScroll:!0})}}),yE($(`introPlay`),()=>TD.play()),yE($(`introBack`),()=>TD.map(KD))}var YD=$(`map`),XD=$(`mapBoard`),ZD=$(`mapDetail`),QD=`meowhattan`,$D=e=>`#${e.toString(16).padStart(6,`0`)}`;function eO(e,t){let n=QE.get(),r=t.find(t=>t.index===e.index-1),i=[];r&&(n.levels[r.id]?.stars??0)<1&&i.push(`1★ in ${r.name}`);let a=mE(n);return a<e.unlockStars&&i.push(`${e.unlockStars}★ total (you have ${a})`),i.length?`Needs ${i.join(` and `)}`:``}var tO=e=>`${_E.star(e>=1)}${_E.star(e>=2)}${_E.star(e>=3)}`;function nO(e,t,n){let r=t>1?e/(t-1):.5;return n?[e%2?.7:.3,.9-.8*r]:[.09+.82*r,e%2?.3:.7]}function rO(){let e=QE.get(),t=o(),n=XD.clientWidth||1,r=XD.clientHeight||1,i=n/r<1.05,a=t.map((e,n)=>nO(n,t.length,i)),s=``;for(let i=0;i<t.length-1;i++){let[o,c]=a[i],[l,u]=a[i+1],d=o*n,f=c*r,p=l*n,m=u*r,h=(d+p)/2+(m-f)*.18,g=(f+m)/2-(p-d)*.18,_=Math.hypot(p-d,m-f),v=Math.max(3,Math.min(9,Math.floor(_/46))),y=hE(t[i+1],e,t);for(let e=1;e<=v;e++){let t=.14+.72*(e-1)/Math.max(1,v-1),n=(1-t)*(1-t)*d+2*(1-t)*t*h+t*t*p,r=(1-t)*(1-t)*f+2*(1-t)*t*g+t*t*m,i=2*(1-t)*(h-d)+2*t*(p-h),a=2*(1-t)*(g-f)+2*t*(m-g),o=Math.atan2(a,i),c=e%2?7:-7,l=-Math.sin(o)*c,u=Math.cos(o)*c;s+=`<i class="print ${y?`open`:``}" style="transform:translate(${(n+l).toFixed(1)}px,${(r+u).toFixed(1)}px) rotate(${(o+Math.PI/2).toFixed(2)}rad)">${_E.paw()}</i>`}}t.forEach((n,r)=>{let i=e.levels[n.id],o=hE(n,e,t),[c,l]=a[r],u=o&&!i?.plays;s+=`<button class="node ${o?``:`locked`} ${n.id===QD?`sel`:``} ${u?`fresh`:``}" data-id="${n.id}" ${o?``:`aria-disabled="true"`}
      style="left:${(c*100).toFixed(2)}%;top:${(l*100).toFixed(2)}%;--c:${$D(n.world.theme.sky)};--g:${$D(n.world.theme.palette[0]??8947848)}"
      aria-label="${gE(n.name)}">
      <span class="disc txt">${o?r+1:_E.lock()}</span>
      <span class="nname txt">${gE(n.name)}</span>
      <span class="nstars">${tO(i?.stars??0)}</span>
      ${u?`<span class="here txt">${r===0?`START HERE`:`NEW!`}</span>`:``}
    </button>`}),XD.innerHTML=s,XD.querySelectorAll(`.node`).forEach(e=>{let t=e.dataset.id;e.addEventListener(`focus`,()=>aO(t,!1)),yE(e,()=>{QD===t?oO(t,e):aO(t,!0)})}),iO(),$(`mapNip`).innerHTML=`${_E.leaf()} ${e.catnip}`,$(`mapStars`).innerHTML=`${_E.star(!0)} ${mE(e)} / ${t.length*3}`}function iO(){let e=QE.get(),t=o(),n=t.find(e=>e.id===QD)??t[0],r=hE(n,e,t),i=e.levels[n.id];ZD.innerHTML=`
    <div class="dhead"><b class="txt">${gE(n.name)}</b><span class="dstars">${tO(i?.stars??0)}</span></div>
    <div class="dtag">${gE(n.tagline)}</div>
    <div class="dmeta">${i?.plays?`Best ${Bf(i.best)} · played ${i.plays}×`:`Not played yet`} · ${n.duration} s</div>
    ${r?`<button class="go small" id="mapGo" data-primary>RAMPAGE HERE</button>`:`<div class="dlock">${_E.lock()} ${gE(eO(n,t))}</div>`}`;let a=document.getElementById(`mapGo`);a&&yE(a,()=>TD.intro(n.id))}function aO(e,t){QD!==e&&(QD=e,XD.querySelectorAll(`.node`).forEach(t=>t.classList.toggle(`sel`,t.dataset.id===e)),iO(),t&&XD.querySelector(`.node[data-id="${e}"]`)?.focus({preventScroll:!0}))}function oO(e,t){let n=o();hE(n.find(t=>t.id===e),QE.get(),n)?TD.intro(e):(iE(),ME(t))}function sO(){let e=QE.get(),t=o(),n=t[0].id;for(let r of t)hE(r,e,t)&&(e.levels[r.id]?.stars??0)<3&&(n=r.id);return n}function cO(){o_.register({id:`map`,el:YD,onShow:e=>{QD=e??sO(),rO(),requestAnimationFrame(()=>{rO(),XD.querySelector(`.node.sel`)?.focus({preventScroll:!0})})}}),yE($(`mapBack`),()=>TD.title()),yE($(`mapCats`),()=>TD.cats()),addEventListener(`resize`,()=>o_.current()===`map`&&rO())}var lO=$(`pause`),uO=[`The cat is pretending this was intentional.`,`Grooming break. Do not disturb.`,`Staring at a wall. Back soon.`,`Loafing. Professionally.`];function dO(){let e=W.level;if(!e)return;let t=Jg(`time`);$(`pauseObj`).innerHTML=e.objectives.map(e=>{let n=wD(e,t);return`<li class="${n?`met`:``}">${_E.star(n)}<span>${gE(e.label)}</span><b>${gE(xD(e,t))}</b></li>`}).join(``),$(`pauseSub`).textContent=`${e.name} · ${Math.ceil(Math.max(0,W.mode===`paused`?t.elapsed:0))} s in · ${uO[Math.floor(Math.random()*uO.length)]}`}function fO(){o_.register({id:`pause`,el:lO,onShow:()=>{dO(),$(`pauseResume`).focus({preventScroll:!0})}}),yE($(`pauseResume`),()=>TD.resume()),yE($(`pauseRestart`),()=>TD.retry()),yE($(`pauseSettings`),()=>TD.settings()),yE($(`pauseQuit`),()=>TD.quitToMap())}var pO=e=>e.reduce((e,t)=>e+ +!!t,0);function mO(e,t,n){let r=e.levels[t]?.objectives??[!1,!1,!1],i=[n.met[0]&&!r[0],n.met[1]&&!r[1],n.met[2]&&!r[2]],a=e.levels[t]?.stars??0,o=pO([r[0]||n.met[0],r[1]||n.met[1],r[2]||n.met[2]]);return{fresh:i,count:Math.max(0,o-a)}}function hO(e,t,n,r){if(t.why===`quit`)return e;let i=t.levelId,a=e.levels[i]??{stars:0,objectives:[!1,!1,!1],best:0,plays:0},o=[a.objectives[0]||n.met[0],a.objectives[1]||n.met[1],a.objectives[2]||n.met[2]],s=Number.isFinite(t.damage)?Math.max(0,t.damage):0,c=Number.isFinite(r)?Math.max(0,Math.floor(r)):0;return{...e,catnip:Math.min(PE,e.catnip+c),levels:{...e.levels,[i]:{stars:Math.max(a.stars,n.stars,pO(o)),objectives:o,best:Math.max(a.best,s),plays:a.plays+1}},totals:{runs:e.totals.runs+1,damage:e.totals.damage+s,catnipEarned:e.totals.catnipEarned+c}}}function gO(e,t,n){return Ju.filter(r=>!t.cats[r].owned&&t.catnip>=n(r)&&e.catnip<n(r))}var _O=$(`results`),vO={time:`TIME'S UP`,wet:`TOO WET. NAP TIME.`,boss:`BOSS DOWN!`,quit:``},yO={time:[`The city has been knocked off the table.`,`Somebody is going to have to sweep that up.`,`Not sorry.`],wet:[`Cats and water: a love story it is not.`,`Retreating to a sunbeam to dry off.`,`This never happened.`],boss:[`The vacuum menace is unplugged forever.`,`Good kitty. Terrible for property values.`,`Victory nap earned.`],quit:[``]};function bO(e,t){let n=t.cats[e.catId]?.upgrades.fur??0;return e.fish===0?`<b>TIP</b> Fish trucks refill patience. Follow the blue FISH arrow when you get wet.`:n<2?`<b>TIP</b> FUR upgrades add patience and soak less. Spend catnip in CATS.`:e.catId!==`chonk`&&!t.cats.chonk?.owned?`<b>TIP</b> Big Biscuit has 130 patience and soaks 20% less. Find him in CATS.`:`<b>TIP</b> Keep moving: trucks wind up before they spray, and you can walk out of the stream.`}var xO=[],SO=null,CO=0,wO=null,TO=null,EO={met:[],prev:[],catnip:0,total:0};function DO(){xO.forEach(clearTimeout),xO=[],SO?.(),SO=null}var OO=(e,t)=>xO.push(window.setTimeout(t,e));function kO(e){if(e.why===`quit`)return;DO();let t=r.get(e.levelId),n=o(),a=QE.get(),s=pE(t,e),c=mO(a,t.id,s),l=ow(e,t,c.count),u=hO(a,e,s,l);QE.set(u);let d=a.levels[t.id]?.best??0,f=e.damage>d&&(a.levels[t.id]?.plays??0)>0,p=n.filter(e=>!hE(e,a,n)&&hE(e,u,n)),m=gO(a,u,sw).filter(e=>i.has(e)),h=n.find(e=>e.index===t.index+1);wO=h&&hE(h,u,n)?h.id:null,TO=p[0]?.id??t.id;let g=Vf(e.damage),_=If[g+1],v=yO[e.why][Math.floor(Math.random()*yO[e.why].length)],y=a.levels[t.id]?.objectives??[!1,!1,!1];EO={met:s.met,prev:y,catnip:l,total:u.catnip};let b=t.objectives.map((t,n)=>{let r=t.kind===`boss`?dE(t,e)>=1?`done`:`missed`:xD(t,e,!1);return`<li class="${s.met[n]?`met`:y[n]?`old`:`miss`}" data-i="${n}"><span class="rstar">${_E.star(!1)}</span><span class="rl">${gE(t.label)}</span><span class="rv">${gE(r)}</span>${c.fresh[n]?`<em class="newtag">NEW</em>`:``}</li>`}).join(``),x=Object.values(e.kills).reduce((e,t)=>e+(t??0),0),S=e.why===`wet`?bO(e,u):``,C=[...p.map(e=>`<div class="unlock city txt">NEW CITY! ${gE(e.name)}</div>`),...m.map(e=>`<div class="unlock cat txt" style="--c:${i.get(e).color}">${gE(i.get(e).name)} affordable!</div>`)].join(``);$(`resBody`).innerHTML=`
    <h2 class="rwhy txt ${e.why}">${vO[e.why]}</h2>
    <div class="rquip">${gE(v)}</div>
    <div class="rdmg txt" id="resDmg">$0</div>
    <div class="rrank txt" id="resRank">${gE(If[g][1])}</div>
    <div class="rnext">${f?`<b>NEW BEST!</b> · `:``}${_?`Next rank: ${gE(_[1])} at ${Bf(_[0])}`:`Top rank. The city never stood a chance.`}</div>
    <ul class="robj">${b}</ul>
    <div class="rnip txt" id="resNip">${_E.leaf()} +0</div>
    ${c.count?`<div class="rnipx">incl. +${30*c.count} for ${c.count} new ${c.count>1?`stars`:`star`}</div>`:``}
    ${S?`<div class="rtip">${S}</div>`:``}
    <div class="runlocks" id="resUnlocks">${C}</div>
    <div class="rstats">
      <span>Buildings</span><b>${e.buildings}</b><span>Landmarks</span><b>${e.landmarks}</b>
      <span>Enemies</span><b>${x}</b><span>Taxis punted</span><b>${e.taxis}</b>
      <span>Fish eaten</span><b>${e.fish}</b><span>City wrecked</span><b>${Math.round(e.destroyedPct)}%</b>
    </div>`;let w=$(`resNext`);w.classList.toggle(`hidden`,!wO),w.textContent=p.some(e=>e.id===wO)?`NEXT: ${h?.name??``}`:`NEXT CITY`,w.toggleAttribute(`data-primary`,!!wO),$(`resRetry`).toggleAttribute(`data-primary`,!wO),QE.persisted()||$(`resBody`).insertAdjacentHTML(`beforeend`,`<div class="rwarn">Progress could not be saved (storage is blocked).</div>`),OO(900,()=>{if(W.mode!==`over`)return;o_.show(`results`),CO=performance.now(),_O.classList.remove(`revealed`),lE(e.why!==`wet`),_O.querySelector(`[data-primary]`)?.focus({preventScroll:!0});let t=$(`resDmg`);t.dataset.final=Bf(e.damage);let n=0;SO=AE(1300,r=>{t.textContent=Bf(e.damage*r);let i=performance.now();r<1&&i-n>70&&(n=i,oE())}),OO(1350,()=>{let e=$(`resRank`);e.classList.add(`on`),e.animate([{transform:`rotate(-3deg) scale(2.4)`,opacity:0},{transform:`rotate(-3deg) scale(1)`,opacity:1}],{duration:320,easing:`cubic-bezier(.2,1.6,.4,1)`}),Iu(1.2)});let r=1750,i=0;_O.querySelectorAll(`.robj li`).forEach(e=>{let t=Number(e.dataset.i),n=s.met[t]||y[t];OO(r,()=>{e.classList.add(`shown`),n&&(e.querySelector(`.rstar`).innerHTML=_E.star(!0,s.met[t]?``:`old`),e.querySelector(`.rstar`).animate([{transform:`scale(2.6) rotate(-40deg)`,opacity:0},{transform:`scale(1) rotate(0)`,opacity:1}],{duration:360,easing:`cubic-bezier(.2,1.6,.4,1)`}),s.met[t]&&aE(i++))}),r+=420}),OO(r+100,()=>{let e=$(`resNip`);e.classList.add(`on`),SO=AE(700,t=>e.innerHTML=`${_E.leaf()} +${Math.round(l*t)} <small>catnip · ${u.catnip} total</small>`)}),OO(r+900,()=>{_O.classList.add(`revealed`);let e=$(`resUnlocks`);e.children.length&&(e.classList.add(`on`),cE())})})}function AO(){if(_O.classList.contains(`revealed`))return;DO(),_O.classList.add(`revealed`),_O.querySelectorAll(`.robj li`).forEach(e=>{let t=Number(e.dataset.i);e.classList.add(`shown`),(EO.met[t]||EO.prev[t])&&(e.querySelector(`.rstar`).innerHTML=_E.star(!0,EO.met[t]?``:`old`))}),$(`resRank`).classList.add(`on`),$(`resNip`).classList.add(`on`),$(`resNip`).innerHTML=`${_E.leaf()} +${EO.catnip} <small>catnip · ${EO.total} total</small>`;let e=$(`resDmg`);e.textContent=e.dataset.final??e.textContent,$(`resUnlocks`).classList.add(`on`)}var jO=()=>o_.current()===`results`&&performance.now()-CO>350;function MO(){o_.register({id:`results`,el:_O,onHide:DO}),yE($(`resNext`),()=>wO&&TD.intro(wO)),yE($(`resRetry`),()=>TD.retry()),yE($(`resMap`),()=>TD.map(TO??W.level?.id)),yE($(`resCats`),()=>{TD.map(TO??W.level?.id),TD.cats()}),$(`resBody`).addEventListener(`click`,AO),U.on(`levelEnd`,({result:e})=>kO(e))}var NO=$(`settings`),PO=$(`confirm`);function FO(e){Object.assign($u,e),ju({master:e.master,music:e.music,sfx:e.sfx}),cd(e.quality)}function IO(e,t,n){let r=QE.get(),i={...r.settings,[e]:t};FO(i),n&&QE.set({...r,settings:i})}function LO(){let e=QE.get().settings;for(let t of[`master`,`music`,`sfx`,`shake`]){let n=$(`set_${t}`);n.value=String(Math.round(e[t]*100)),$(`val_${t}`).textContent=`${n.value}%`}$(`setLow`).classList.toggle(`on`,e.quality===`low`),$(`setHigh`).classList.toggle(`on`,e.quality===`high`),$(`setLow`).setAttribute(`aria-pressed`,String(e.quality===`low`)),$(`setHigh`).setAttribute(`aria-pressed`,String(e.quality===`high`)),$(`setTut`).textContent=QE.get().tutorialDone?`REPLAY TUTORIAL`:`TUTORIAL: ON NEXT RUN`}function RO(){LO(),xE(NO)}function zO(e,t){return new Promise(n=>{$(`confirmText`).textContent=e;let r=$(`confirmYes`),i=$(`confirmNo`);r.textContent=t;let a=!1,o=(e,t=!1)=>{a||(a=!0,r.onclick=i.onclick=null,t||SE(),n(e))};r.onclick=()=>{tE(),o(!0)},i.onclick=()=>{rE(),o(!1)},xE(PO,()=>o(!1,!0))})}var BO=0,VO=0,HO=0,UO=0,WO=!1;function GO(){U.on(`levelStart`,()=>{BO=VO=HO=0,UO=0}),kh(()=>{if(WO||W.mode!==`play`||QE.get().settings.quality!==`high`)return;let e=performance.now();if(UO){let t=e-UO;t<250&&(HO+=t,VO++,BO+=t/1e3)}UO=e,!(BO<3)&&(WO=!0,HO/VO>22&&(IO(`quality`,`low`,!0),jE(`Switched to LOW quality for a smoother rampage (Settings to change)`)))})}function KO(){GO();for(let e of[`master`,`music`,`sfx`,`shake`]){let t=$(`set_${e}`);t.addEventListener(`input`,()=>{$(`val_${e}`).textContent=`${t.value}%`,IO(e,Number(t.value)/100,!1)}),t.addEventListener(`change`,()=>{IO(e,Number(t.value)/100,!0),(e===`sfx`||e===`master`)&&tE()})}yE($(`setLow`),()=>{IO(`quality`,`low`,!0),LO()}),yE($(`setHigh`),()=>{IO(`quality`,`high`,!0),LO()}),yE($(`setTut`),()=>{QE.set({...QE.get(),tutorialDone:!1}),LO(),jE(W.mode===`paused`?`The tutorial plays the next time you start Meowhattan`:`The tutorial plays on your next Meowhattan run`)}),yE($(`setReset`),async()=>{if(!await zO(`Erase all stars, catnip, cats and upgrades? Your settings stay.`,`YES, ERASE`))return;let e=QE.get().settings;QE.set({...zE(),settings:e}),SE(),jE(`Fresh start. The city has forgotten you.`),TD.title()}),yE($(`setClose`),()=>SE(),rE),NO.addEventListener(`pointerdown`,e=>{e.target===NO&&SE()})}var qO=new I,JO=new I;function YO(){let e=$(`threatArrow`),t=e.querySelector(`span`),n=``,r=0,i=()=>{zp(e,null,!1),n=``};U.on(`levelLoad`,i),U.on(`levelEnd`,i),kh(a=>{if(W.mode!==`play`){n&&i();return}r-=a;let o=$x(K.pos.x,K.pos.z,420,qO,JO);o?(o!==n&&r<=0&&(t.textContent=o,n=o,r=.5),Math.hypot(qO.x-K.pos.x,qO.z-K.pos.z)<70?n&&i():zp(e,qO,!1)):n&&i()})}var XO=[{title:`WALK AROUND`,kbd:`Hold <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys`,touch:`Drag anywhere on the left side`,glow:`stick`},{title:`SWAT A BUILDING`,kbd:`Walk up to a building, press <kbd>J</kbd> or click`,touch:`Walk up to a building, tap SWAT`,glow:`tbSwat`},{title:`POUNCE!`,kbd:`Press <kbd>SPACE</kbd> or right-click to leap and smash`,touch:`Tap POUNCE to leap and smash`,glow:`tbPounce`},{title:`ULTRA IS FULL`,kbd:`Press <kbd>E</kbd> to unleash it`,touch:`Tap the glowing ULTRA button`,glow:`tbUltra`}],ZO=$(`tut`),QO=!1,$O=0,ek=!1,tk=0,nk=0,rk=0,ik=[!1,!1,!1,!1];function ak(e){for(let t of[`stick`,`tbSwat`,`tbPounce`,`tbUltra`])$(t).classList.toggle(`tut-glow`,t===e)}function ok(){let e=XO[$O],t=td||document.body.classList.contains(`touch`),n=$O===3&&W.cat?W.cat.ultraName:``;$(`tutTitle`).textContent=$O===3&&n?`${n} IS READY`:e.title,$(`tutSub`).innerHTML=t?e.touch:e.kbd,$(`tutDots`).innerHTML=XO.map((e,t)=>`<i class="${t<$O?`done`:t===$O?`on`:``}"></i>`).join(``),ak(t?e.glow:null),ZO.classList.remove(`nice`),ZO.animate([{transform:`translateX(-50%) scale(.85)`,opacity:0},{transform:`translateX(-50%) scale(1)`,opacity:1}],{duration:260,easing:`cubic-bezier(.2,1.5,.4,1)`}),$O===3&&(G.ultra=100)}function sk(){if(!QO||ek)return;ek=!0,ik[$O]=!0,uE(),ZO.classList.add(`nice`),$(`tutTitle`).textContent=[`NICE PAWS!`,`CRASH! NICE.`,`BOOM!`,``][$O]||`NICE!`;let e=nk;rk=window.setTimeout(()=>{if(e===nk&&(ek=!1,QO)){for($O++;$O<XO.length&&ik[$O];)$O++;$O>=XO.length?lk(!1):ok()}},$O===3?0:700)}function ck(e){QO&&(e===$O&&!ek?sk():(e>$O||ek)&&(ik[e]=!0))}function lk(e){QO&&(QO=!1,G.timeFrozen=!1,ak(null),QE.set({...QE.get(),tutorialDone:!0}),document.body.classList.remove(`tutorial`),e?(ZO.classList.add(`hidden`),Ap(`RAMPAGE!`)):($(`tutTitle`).textContent=`RAMPAGE!`,$(`tutSub`).innerHTML=`${W.level?.duration??90} seconds. Knock it all off the table.`,$(`tutDots`).innerHTML=``,ZO.classList.add(`nice`),clearTimeout(tk),tk=window.setTimeout(()=>ZO.classList.add(`hidden`),2600)))}function uk(){nk++,clearTimeout(rk),QO&&(QO=!1,ek=!1,ak(null),ZO.classList.add(`hidden`),document.body.classList.remove(`tutorial`))}function dk(){clearTimeout(tk),clearTimeout(rk),nk++,QO=!0,$O=0,ik.fill(!1),ek=!1,G.timeFrozen=!0,ZO.classList.remove(`hidden`),document.body.classList.add(`tutorial`),ok()}var fk=()=>QO,pk=()=>lk(!0);function mk(){U.on(`levelStart`,({level:e})=>{uk(),clearTimeout(tk),ZO.classList.add(`hidden`),e.tutorial&&!QE.get().tutorialDone&&dk()}),U.on(`levelLoad`,uk),U.on(`levelEnd`,uk),U.on(`moved`,()=>ck(0)),U.on(`swat`,({hit:e})=>{e?ck(1):QO&&$O===1&&!ek&&($(`tutSub`).innerHTML=`Missed! <b>Get closer</b> to a building, then swat`)}),U.on(`pounceLand`,()=>ck(2)),U.on(`ultraStart`,()=>ck(3)),yE($(`tutSkip`),()=>pk()),$(`tutSkip`).addEventListener(`pointerdown`,e=>e.stopPropagation())}function hk(){let e=QE.get(),t=o();$(`titleMeta`).innerHTML=e.totals.runs?`<span aria-label="stars">${_E.star(!0)} ${mE(e)} / ${t.length*3}</span><span aria-label="catnip">${_E.leaf()} ${e.catnip} catnip</span><span>${e.totals.runs} rampage${e.totals.runs===1?``:`s`}</span>`:`<span>Five cities. Ninety seconds each. Zero remorse.</span>`,$(`play`).textContent=e.totals.runs?`PLAY`:`RAMPAGE`}function gk(e){let t=r.has(e)?e:`meowhattan`,n=$E();Yg(t,n,eD(n))}function _k(){TD.title=()=>{W.mode!==`title`&&gk(`meowhattan`),hk(),o_.show(`title`)},TD.map=e=>{W.mode!==`title`&&gk(W.level?.id??`meowhattan`),o_.show(`map`,e)},TD.cats=()=>{W.mode!==`title`&&gk(W.level?.id??`meowhattan`),o_.show(`cats`)},TD.intro=e=>o_.show(`intro`,e),TD.play=()=>{W.mode===`title`&&((W.level?.id!==ED.levelId||W.cat?.id!==ED.catId)&&Yg(ED.levelId,ED.catId,eD(ED.catId)),o_.hideAll(),Xg())},TD.retry=()=>{CE()&&SE(),o_.hideAll(),ED.catId=QE.get().cats[ED.catId]?.owned?ED.catId:$E(),Zg(ED.levelId,ED.catId,eD(ED.catId),{keepCamera:!0})},TD.pause=()=>{W.mode===`play`&&(e_(),o_.show(`pause`))},TD.resume=()=>{if(W.mode===`paused`){for(;CE();)SE();o_.hideAll(),t_()}},TD.quitToMap=()=>{for(;CE();)SE();let e=W.level?.id??`meowhattan`;$g(),gk(e),o_.show(`map`,e)},TD.settings=()=>RO()}function vk(){let e=o_.current();if(e===`map`)TD.title();else if(e===`cats`)o_.back();else if(e===`intro`)TD.map(ED.levelId);else if(e===`results`)TD.map(W.level?.id);else return;rE()}function yk(e){let t=e.code,n=t.startsWith(`Arrow`);if(e.repeat&&!n)return;if(document.body.classList.add(`kbd`),W.mode===`play`){t===`Escape`||t===`KeyP`?(e.preventDefault(),TD.pause()):t===`Enter`&&fk()&&pk();return}if(CE()){if(t===`Escape`){e.preventDefault(),SE(),rE();return}}else if(W.mode===`paused`){if(t===`Escape`||t===`KeyP`){e.preventDefault(),TD.resume();return}}else if(t===`Escape`){e.preventDefault(),vk();return}if(W.mode===`over`&&o_.current()===`results`){if(!jO())return;if(!document.getElementById(`results`).classList.contains(`revealed`)&&(t===`Enter`||t===`Space`)){e.preventDefault(),AO();return}if(t===`KeyR`)return TD.retry()}let r=document.activeElement;if(n){if(r instanceof HTMLInputElement&&r.type===`range`&&(t===`ArrowLeft`||t===`ArrowRight`))return;e.preventDefault();let n={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[t]??[0,0];kE(n[0],n[1])}else if(t===`Enter`||t===`Space`||t===`NumpadEnter`){let n=TE();if(!n)return;let i=r&&n.contains(r)&&DE(n).includes(r)?r:null;if(i&&t===`Enter`&&i instanceof HTMLButtonElement)return;e.preventDefault();let a=i??n.querySelector(`[data-primary]:not(.hidden)`)??DE(n)[0];a&&!(a instanceof HTMLInputElement)&&a.click()}}function bk(){FO(QE.get().settings),QT(),o_.register({id:`title`,el:$(`title`),onShow:()=>$(`play`).focus({preventScroll:!0})}),_k(),cO(),gD(),JD(),fO(),MO(),KO(),WD(),mk(),YO(),$(`titleCog`).innerHTML=$(`mapCog`).innerHTML=_E.cog(),$(`mapBack`).innerHTML=$(`catsBack`).innerHTML=_E.back(),yE($(`play`),()=>TD.map()),yE($(`titleCog`),()=>TD.settings()),yE($(`mapCog`),()=>TD.settings()),addEventListener(`keydown`,yk),addEventListener(`pointerdown`,()=>{document.body.classList.remove(`kbd`),Ou()},{capture:!0}),document.addEventListener(`visibilitychange`,()=>document.hidden&&TD.pause()),addEventListener(`blur`,()=>TD.pause()),gk(`meowhattan`),hk(),o_.show(`title`)}function xk(){bk()}function Sk(e=5e4){let t=QE.get(),n={...t,catnip:Math.max(t.catnip,e),tutorialDone:!0,cats:{...t.cats},levels:{...t.levels}};for(let e of Ju)n.cats[e]={...n.cats[e],owned:!0};for(let e of qu){let t=n.levels[e];n.levels[e]={stars:3,objectives:[!0,!0,!0],best:t?.best??0,plays:t?.plays??0}}return QE.set(n),(o_.current()===`map`||o_.current()===`title`)&&TD.map(),n}function Ck(e=`meowhattan`,t){if(!r.has(e))throw Error(`unknown level ${e}; one of ${qu.join(`, `)}`);let n=t&&i.has(t)?t:$E();for(;CE();)SE();o_.hideAll(),ED.levelId=e,ED.catId=n,Zg(e,n,eD(n))}function wk(){let e=W.level?.boss;if(!e||W.mode!==`play`)return;let t=Math.max(0,e.at-2-G.elapsed);G.elapsed+=t,G.time=Math.max(G.time-t,W.level.frenzyAt+5)}function Tk(){QE.set({...zE(),settings:QE.get().settings}),TD.title()}var Ek={unlockAll:Sk,jump:Ck,boss:wk,reset:Tk,save:()=>QE.get()};A_(),xw(),xT(),vm(),zm({swat:ch,pounce:lh,ultra:dh}),xk(),Ph(),window.__ultra={G,C:K,game:W,get mode(){return W.mode},startGame:()=>Zg(W.level?.id??`meowhattan`,W.cat?.id??`tabby`),session:Gg,doSwipe:ch,doPounce:lh,doUltra:dh,city:Y,destroyedPct:Yf,keys:jm,camera:id,beams:PS,helis:{get length(){return a.get(`heli`).alive()}},enemyTypes:a,dev:Ek};