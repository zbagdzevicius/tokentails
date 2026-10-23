var e=Object.defineProperty,t=(t,n)=>{let r={};for(var i in t)e(r,i,{get:t[i],enumerable:!0});return n||e(r,Symbol.toStringTag,{value:`Module`}),r};(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var n=new class{h={};on(e,t){let n=this.h[e]??=[];return n.push(t),()=>{let e=n.indexOf(t);e>=0&&n.splice(e,1)}}emit(e,t){let n=this.h[e];if(n)for(let r=0;r<n.length;r++)try{n[r](t)}catch(t){console.error(`event ${e} handler failed`,t)}}},r=Object.freeze({}),i=[`meadow`,`gorge`,`sunset`,`endless`],a=[`meadow`,`gorge`,`sunset`],o=[`ground`,`bridge`,`wall`,`river`,`cloud`,`gap`],s=new Set([`gap`,`cloud`]),c={mode:`title`,stage:null,track:null},l={score:0,mult:1,maxMult:1,hearts:3,bells:Array(7).fill(!1),fish:0,meter:0,time:0,distance:0,hits:0,respawns:0,checkpoints:[0],cpIndex:0,finishS:1/0,progress:0,endless:!1,invincible:!1,seed:1},u={reducedMotion:!1,shake:1},d=null,f={master:1,sfx:1,music:.6},p=.55,m=[];function h(){if(d){d.ctx.resume();return}let e=new AudioContext,t=e.createGain();t.gain.value=p*f.master;let n=e.createDynamicsCompressor();t.connect(n).connect(e.destination);let r=e.createGain();r.gain.value=f.sfx,r.connect(t);let i=e.createGain();i.gain.value=f.music,i.connect(t);let a=e.createBuffer(1,e.sampleRate*2,e.sampleRate),o=a.getChannelData(0);for(let e=0;e<o.length;e++)o[e]=Math.random()*2-1;d={ctx:e,out:t,sfx:r,music:i,noiseBuf:a};for(let e of m)e(d)}function g(e){m.push(e),d&&e(d)}var _=()=>d;typeof document<`u`&&document.addEventListener(`visibilitychange`,()=>{d&&(document.hidden?d.ctx.suspend():d.ctx.resume())});function v(e){if(Object.assign(f,e),!d)return;let t=d.ctx.currentTime;d.out.gain.setTargetAtTime(p*f.master,t,.05),d.sfx.gain.setTargetAtTime(f.sfx,t,.05),d.music.gain.setTargetAtTime(f.music,t,.05)}function y(e,t,n,r,i){let a=i??d.ctx.currentTime;e.gain.setValueAtTime(1e-4,a),e.gain.exponentialRampToValueAtTime(Math.max(2e-4,t),a+n),e.gain.exponentialRampToValueAtTime(1e-4,a+n+r)}function b(e,t,n,r,i={}){if(!d)return;let a=d.ctx,o=i.at??a.currentTime,s=a.createOscillator();s.type=e;let c=a.sampleRate*.45;s.frequency.setValueAtTime(Math.min(t,c),o),i.to&&s.frequency.exponentialRampToValueAtTime(Math.min(i.to,c),o+n);let l=a.createGain();y(l,r,i.attack??.005,n,o),s.connect(l).connect(i.dest??d.sfx),s.start(o),s.stop(o+(i.attack??.005)+n+.05)}var x={major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10],dorian:[0,2,3,5,7,9,10],mixolydian:[0,2,4,5,7,9,10]},S={meadow:{id:`meadow`,bpm:128,root:60,scale:x.major,style:`skip`,chords:[0,4,5,3,3,4,5,4],melody:`4 . 4 5 4 2 0 2 1 - 4 - 6 5 4 - 2 . 2 4 5 - 7 5 4 - 3 2 3 - . . 5 - 5 7 5 4 3 4 4 - 1 - 4 5 6 - 7 - 6 5 4 5 7 - 8 - 7 6 4 - . .`,swing:.18},gorge:{id:`gorge`,bpm:140,root:62,scale:x.dorian,style:`quest`,chords:[0,6,3,0,2,6,3,4],melody:`0 . 4 . 7 - 6 4 6 - 5 4 2 - . 4 3 - 5 6 7 - 6 5 4 - - - 2 3 4 . 9 - 7 - 9 10 9 7 6 - 4 - 6 7 6 4 5 - 6 7 8 - 7 6 4 - - - . 4 6 7`,swing:0},sunset:{id:`sunset`,bpm:118,root:65,scale:x.major,style:`breeze`,chords:[0,2,3,4,5,3,0,4],melody:`4 - - 2 4 - 7 - 6 - - 4 2 - - . 3 - 5 - 7 - 5 3 4 - - - - - . . 5 - 7 - 9 - 7 5 3 - 5 - 7 - - . 4 - 2 - 4 5 7 - 6 - - - 4 - . .`,swing:.3},endless:{id:`endless`,bpm:150,root:57,scale:x.mixolydian,style:`dash`,chords:[0,6,3,0,3,4,6,0],melody:`0 2 4 7 - 4 6 7 6 - 4 - 3 4 6 - 3 4 5 7 - 5 4 3 4 - 2 - 0 - . . 7 - 9 - 10 9 7 - 8 - 7 - 6 4 6 - 6 - 7 8 9 - 8 7 7 - - - . . 4 6`,swing:0}},C=e=>440*2**((e-69)/12);function w(e,t,n,r=0){let i=t.length,a=Math.floor(n/i);return e+t[(n%i+i)%i]+12*(a+r)}function T(e){return e.trim().split(/\s+/).map(e=>e===`-`?`hold`:e===`.`?`rest`:Number(e))}function E(e,t){return{song:e.id,variant:t,bpm:e.bpm,swing:e.swing,echo:.18,kick:new Float32Array(128),snare:new Float32Array(128),hat:new Float32Array(128),hatOpen:new Uint8Array(128),tom:new Float32Array(128),bass:new Float32Array(128),bassDur:new Float32Array(128),bassVoice:`bassPluck`,bassVol:.45,lead:new Float32Array(128),leadDur:new Float32Array(128),leadVoice:`whistle`,leadVol:.12,chord:new Float32Array(512),chordDur:new Float32Array(128),chordVoice:`pluck`,chordVol:.06,strum:0,bell:new Float32Array(128),bellVol:.05,stab:new Float32Array(128)}}function D(e,t){let n=S[e],r=t===`chase`,i=t===`calm`,a=r?x.minor:n.scale,o=E(n,t),s=(e,t=0)=>C(w(n.root,a,e,t));o.bpm=r?Math.round(n.bpm*1.12):i?Math.round(n.bpm*.8):n.bpm,o.swing=r?0:n.swing;let c=(e,t,n,r=0,i=!1)=>{o.chord[e*4]=s(t,r),o.chord[e*4+1]=s(t+2,r),o.chord[e*4+2]=s(t+4,r),o.chord[e*4+3]=i?s(t+6,r):0,o.chordDur[e]=n},l=T(n.melody),u=-1;for(let e=0;e<l.length&&e*2<128;e++){let t=l[e],n=e*2;t===`hold`?u>=0&&(o.leadDur[u]+=2):t===`rest`?u=-1:(o.lead[n]=s(t,1),o.leadDur[n]=1.7,u=n)}for(let e=0;e<128;e++){let t=e>>4,r=e&15,i=n.chords[t],a=r%4==0;switch(n.style){case`skip`:o.echo=.14,(r===0||r===7||r===8)&&(o.kick[e]=r===7?.45:.75),(r===4||r===12)&&(o.snare[e]=.32),o.hat[e]=r%2==0?.07:.045,(r===0||r===6||r===8||r===11||r===14)&&(o.bass[e]=s(i+(r===6||r===14?4:r===11?2:0),-2),o.bassDur[e]=1.6),(r===0||r===3||r===6||r===8||r===10||r===12||r===14)&&c(e,i,1.1,0,r===0),o.chordVoice=`pluck`,o.chordVol=.07,o.strum=.012,o.leadVoice=`whistle`,o.leadVol=.11,r===0&&t%2==1&&(o.bell[e]=s(i+7,1)),r===10&&t%4==3&&(o.bell[e]=s(i+9,1)),o.bassVoice=`bassPluck`;break;case`quest`:if(o.echo=.2,a&&(o.kick[e]=r===0?.9:.6),(r===4||r===12)&&(o.snare[e]=.5),r%2==0&&(o.hat[e]=r%4==2?.11:.06),t%4==3&&r>=12&&(o.tom[e]=[196,165,147,110][r-12]),r%2==0&&(o.bass[e]=s(i+(r%8==6?4:0),-2),o.bassDur[e]=1.4),o.bassVoice=`bassSaw`,o.bassVol=.34,r%2==1){let t=[0,2,4,7,4,2,0,2];o.bell[e]=s(i+t[(r>>1)%8],0)}o.bellVol=.035,r===0&&c(e,i,15,-1),o.chordVoice=`pad`,o.chordVol=.03,o.leadVoice=`brass`,o.leadVol=.075;break;case`breeze`:o.echo=.26,(r===0||r===10)&&(o.kick[e]=.5),r===8&&(o.snare[e]=.22),r%4==2&&(o.hat[e]=.06),(r===0||r===10)&&(o.bass[e]=s(i,-2),o.bassDur[e]=r===0?7:5),r===7&&(o.bass[e]=s(i+4,-2),o.bassDur[e]=2),o.bassVoice=`bassSub`,o.bassVol=.42,r===0&&c(e,i,15,0,!0),o.chordVoice=`pad`,o.chordVol=.035,(r===4||r===12)&&c(e,i,2,1),o.leadVoice=`flute`,o.leadVol=.12,r===14&&t%2==0&&(o.bell[e]=s(i+4,2)),r===6&&t%2==1&&(o.bell[e]=s(i+2,2)),o.bellVol=.04;break;case`dash`:{o.echo=.24,a&&(o.kick[e]=.9),(r===4||r===12)&&(o.snare[e]=.55),r%4==2?(o.hat[e]=.12,o.hatOpen[e]=1):r%2==1&&(o.hat[e]=.05),r%2==0&&(o.bass[e]=s(i,r%4==0?-2:-1),o.bassDur[e]=1.3),o.bassVoice=`bassSaw`,o.bassVol=.36;let t=[0,2,4,7];o.bell[e]=s(i+t[r%4],1),o.bellVol=.025,r===0&&c(e,i,15,0),o.chordVoice=`pad`,o.chordVol=.03,o.leadVoice=`synth`,o.leadVol=.07;break}}}if(r){o.echo=.12;for(let e=0;e<128;e++){let t=e>>4,r=e&15,i=n.chords[t];o.kick[e]=r%4==0?.95:r===14?.5:0,o.snare[e]=r===4||r===12?.6:t%4==3&&r>=12?.25+(r-12)*.1:0,o.hat[e]=r%2==0?.1:.06,o.hatOpen[e]=0,o.bass[e]=s(i+(r%4==3?4:0),r%2==0?-2:-1),o.bassDur[e]=.85,o.stab[e]=r===0||r===6&&t%2==1?s(i+4,1):0,o.lead[e]>0&&(o.leadDur[e]=Math.min(o.leadDur[e],1.2)),o.tom[e]=t%2==1&&r===14?140:t%2==1&&r===15?110:0}o.bassVoice=`bassSaw`,o.bassVol=.34,o.leadVoice=n.style===`breeze`?`flute`:`brass`,o.leadVol=.08}if(i){for(let e=0;e<128;e++){let t=e&15;o.kick[e]=t===0?.2:0,o.snare[e]=0,o.tom[e]=0,o.hat[e]=t%8==4?.03:0,o.hatOpen[e]=0,t%8==0?o.bassDur[e]=7:o.bass[e]=0,t%4!=0&&(o.lead[e]=0),o.stab[e]=0}o.bassVoice=`bassSub`,o.leadVol*=.75,o.echo=Math.max(o.echo,.3)}return o}function O(e){let t=S[e],n=(e,n=0)=>w(t.root,t.scale,e,n),r=[];[0,2,4,7].forEach((e,t)=>r.push([t*.25,n(e,1),.3,`glock`])),r.push([1,n(4,1),.5,`brass`],[1.5,n(7,1),2.5,`brass`]);for(let e of[0,2,4,7])r.push([1.5,n(e,0),2.5,`pad`]);return r.push([1.5,n(0,-2),2,`bassSub`]),{bpm:140,notes:r}}function k(){return{bpm:100,notes:[[0,67,.7,`brass`],[.75,66,.7,`brass`],[1.5,65,.7,`brass`],[2.25,64,1.6,`brass`]]}}function A(){let e=x.major,t=(t,n=0)=>w(65,e,t,n),n=[4,2,0,2,4,4,4,-99,3,3,4,3,2,-99,0,2,4,7,6,4,2,0],r=[],i=0;for(let e=0;e<n.length;e++)n[e]!==-99&&r.push([i,t(n[e],1),e===n.length-1?3:.9,`glock`]),i+=e===n.length-1?0:.5;return[0,3,4,0].forEach((e,n)=>{for(let i of[0,2,4])r.push([n*2.75,t(e+i,0),2.6,`pad`]);r.push([n*2.75,t(e,-1),2.5,`bassSub`])}),{bpm:92,notes:r}}function j(e){return e&&e in S?e:`meadow`}var M=null,N=null,ee=null,P=0,te=0,ne=0,re=.14,ie=new Map;function ae(e,t){let n=`${e}:${t}`,r=ie.get(n);return r||(r=D(e,t),ie.set(n,r)),r}function oe(e){let t=e.ctx,n=t.createGain();n.gain.value=0;let r=t.createGain();r.gain.value=.9;let i=t.createBiquadFilter();i.type=`lowpass`,i.frequency.value=Math.min(18e3,t.sampleRate*.45),i.Q.value=.7;let a=t.createGain();n.connect(i),r.connect(i),i.connect(a).connect(e.music);let o=t.createGain();o.gain.value=.18;let s=t.createDelay(1);s.delayTime.value=.23;let c=t.createGain();c.gain.value=.3;let l=t.createBiquadFilter();l.type=`lowpass`,l.frequency.value=2600,o.connect(s).connect(l).connect(c).connect(s),l.connect(i);let u=t.createBiquadFilter();u.type=`highpass`,u.frequency.value=7500,u.connect(n);let d=t.createBiquadFilter();return d.type=`bandpass`,d.frequency.value=1800,d.Q.value=.7,d.connect(n),{a:e,track:n,jingle:r,lp:i,duck:a,echoIn:o,hatHP:u,snareBP:d}}function F(e,t,n,r,i,a,o,s,c,l=0){let u=e.a.ctx,d=u.createOscillator();d.type=n,d.frequency.setValueAtTime(Math.min(r,u.sampleRate*.45),i),l&&d.detune.setValueAtTime(l,i);let f=u.createGain();return f.gain.setValueAtTime(1e-4,i),f.gain.exponentialRampToValueAtTime(Math.max(2e-4,a),i+o),f.gain.setTargetAtTime(1e-4,i+o+s,c/3),d.connect(f).connect(t),d.start(i),d.stop(i+o+s+c*1.6+.05),d}function se(e,t,n,r,i,a,o=.8){let s=e.a.ctx.createBiquadFilter();return s.type=`lowpass`,s.Q.value=o,s.frequency.setValueAtTime(r,n),s.frequency.exponentialRampToValueAtTime(Math.max(40,i),n+Math.max(.01,a)),s.connect(t),s}function ce(e,t,n,r,i,a,o,s=!1){let c=s?e.a.ctx.createGain():t;switch(s&&(c.connect(t),c.connect(e.echoIn)),n){case`pluck`:{let t=se(e,c,i,4200,900,a*.8);F(e,t,`triangle`,r,i,o,.003,.02,a*.9),F(e,t,`square`,r*2,i,o*.18,.002,.01,a*.4);break}case`whistle`:{let t=F(e,c,`sine`,r,i,o,.025,a*.7,.12);t.frequency.setValueAtTime(r*.965,i),t.frequency.exponentialRampToValueAtTime(r,i+.05),F(e,c,`sine`,r*2,i,o*.07,.03,a*.6,.1);break}case`flute`:{let t=F(e,c,`sine`,r,i,o,.05,a*.75,.2);t.frequency.setValueAtTime(r*.985,i),t.frequency.exponentialRampToValueAtTime(r,i+.08),F(e,c,`triangle`,r,i,o*.3,.06,a*.7,.2,6);break}case`brass`:{let t=se(e,c,i,500,2200,.06,1.2);t.frequency.setTargetAtTime(1300,i+.08,.15),F(e,t,`sawtooth`,r,i,o,.02,a*.75,.12),F(e,t,`sawtooth`,r,i,o*.6,.025,a*.75,.12,9);break}case`synth`:{let t=se(e,c,i,3200,1400,a,2);F(e,t,`square`,r,i,o,.004,a*.6,.08),F(e,t,`sawtooth`,r*1.005,i,o*.5,.004,a*.6,.08);break}case`glock`:F(e,c,`sine`,r,i,o,.002,.01,Math.max(.3,a*1.4)),F(e,c,`sine`,r*2.76,i,o*.28,.002,.005,.25),F(e,c,`sine`,r*5.4,i,o*.1,.001,.003,.1);break;case`pad`:{let t=se(e,c,i,900,1300,a,.6),n=Math.min(.35,a*.3);F(e,t,`sawtooth`,r,i,o,n,a*.8,.4,-7),F(e,t,`sawtooth`,r,i,o,n,a*.8,.4,7);break}case`bassPluck`:{let t=se(e,c,i,1400,300,a*.7,3);F(e,t,`triangle`,r,i,o,.004,a*.4,a*.5),F(e,t,`square`,r,i,o*.25,.004,a*.2,a*.3);break}case`bassSaw`:F(e,se(e,c,i,1100,260,a*.8,5),`sawtooth`,r,i,o,.006,a*.5,a*.4),F(e,c,`sine`,r,i,o*.6,.006,a*.5,a*.4);break;case`bassSub`:F(e,c,`sine`,r,i,o,.02,a*.7,a*.4),F(e,c,`triangle`,r*2,i,o*.15,.02,a*.5,a*.3)}}function le(e,t,n,r,i){let a=e.a.ctx,o=a.createBufferSource();o.buffer=e.a.noiseBuf;let s=a.createGain();s.gain.setValueAtTime(r,n),s.gain.exponentialRampToValueAtTime(1e-4,n+i),o.connect(s).connect(t),o.start(n,Math.random()*1.5,i+.05)}function ue(e,t,n){let r=e.a.ctx,i=r.createOscillator();i.type=`sine`,i.frequency.setValueAtTime(150,t),i.frequency.exponentialRampToValueAtTime(45,t+.12);let a=r.createGain();a.gain.setValueAtTime(n,t),a.gain.exponentialRampToValueAtTime(1e-4,t+.28),i.connect(a).connect(e.track),i.start(t),i.stop(t+.3)}function de(e,t,n){le(e,e.snareBP,t,n*.85,.15);let r=e.a.ctx,i=r.createOscillator();i.type=`triangle`,i.frequency.setValueAtTime(210,t),i.frequency.exponentialRampToValueAtTime(150,t+.07);let a=r.createGain();a.gain.setValueAtTime(n*.3,t),a.gain.exponentialRampToValueAtTime(1e-4,t+.09),i.connect(a).connect(e.track),i.start(t),i.stop(t+.11)}function fe(e,t,n){let r=e.a.ctx,i=r.createOscillator();i.type=`sine`,i.frequency.setValueAtTime(n,t),i.frequency.exponentialRampToValueAtTime(n*.6,t+.18);let a=r.createGain();a.gain.setValueAtTime(.45,t),a.gain.exponentialRampToValueAtTime(1e-4,t+.25),i.connect(a).connect(e.track),i.start(t),i.stop(t+.27)}function pe(e,t,n,r){let i=60/t.bpm/4;t.kick[n]>0&&ue(e,r,t.kick[n]*.85),t.snare[n]>0&&de(e,r,t.snare[n]),t.hat[n]>0&&le(e,e.hatHP,r,t.hat[n],t.hatOpen[n]?.2:.04),t.tom[n]>0&&fe(e,r,t.tom[n]),t.bass[n]>0&&ce(e,e.track,t.bassVoice,t.bass[n],r,t.bassDur[n]*i,t.bassVol),t.lead[n]>0&&ce(e,e.track,t.leadVoice,t.lead[n],r,t.leadDur[n]*i,t.leadVol,!0),t.bell[n]>0&&ce(e,e.track,`glock`,t.bell[n],r,i*2,t.bellVol,!0),t.stab[n]>0&&(ce(e,e.track,`brass`,t.stab[n],r,i*1.5,.06),ce(e,e.track,`brass`,t.stab[n]*1.5,r,i*1.5,.045));let a=n*4;if(t.chord[a]>0){let o=t.chordDur[n]*i;for(let n=0;n<4;n++){let i=t.chord[a+n];i>0&&ce(e,e.track,t.chordVoice,i,r+n*t.strum,o,t.chordVol)}}}function me(){if(!M||!N)return;let e=M.a.ctx;if(e.state!==`running`)return;let t=e.currentTime;for(te<t-.25&&(te=t+.05);te<t+re;){!(P&15)&&ee&&(ee.song!==N.song||ee.variant!==N.variant)&&(ee.song!==N.song&&(P=0),N=ae(ee.song,ee.variant),M.echoIn.gain.setTargetAtTime(N.echo,te,.05));let e=60/N.bpm/4,t=(P&1)==1?N.swing*e*.5:0;pe(M,N,P,te+t),P=(P+1)%128,te+=e}}function he(){!ne&&typeof window<`u`&&(ne=window.setInterval(me,25))}function ge(e,t){if(ee={song:e,variant:t},!M)return;let n=M.a.ctx.currentTime;if(M.track.gain.cancelScheduledValues(n),!(N&&N.song===e&&N.variant===t)&&(!N||N.song!==e||N.variant===`calm`||t===`calm`)){let r=!N;N=ae(e,t),P=0,M.echoIn.gain.setTargetAtTime(N.echo,n,.05),M.track.gain.setTargetAtTime(0,n,.03),M.track.gain.setTargetAtTime(1,n+.12,r?.5:.1),te=n+.14}else M.track.gain.setTargetAtTime(1,n,.15);he()}function I(e=1){if(ee=null,!M)return;let t=M.a.ctx.currentTime;M.track.gain.cancelScheduledValues(t),M.track.gain.setTargetAtTime(0,t,e/4);let n=M;window.setTimeout(()=>{ee||(N=null,ne&&clearInterval(ne),ne=0,n.track.gain.cancelScheduledValues(n.a.ctx.currentTime))},e*1e3+60)}function _e(e,t=1){if(!M)return 0;let n=M,r=n.a.ctx.currentTime+.05,i=60/e.bpm,a=0;for(let[o,s,c,l]of e.notes){let e=C(s),u=l===`pad`?.04:l===`bassSub`?.35:l===`brass`?.08:.12;ce(n,n.jingle,l,e,r+o*i,c*i,u*t,l!==`bassSub`),a=Math.max(a,(o+c)*i)}return a}function ve(e=-8,t=.4){if(!M)return;let n=M.duck.gain,r=M.a.ctx.currentTime;n.cancelScheduledValues(r),n.setTargetAtTime(10**(e/20),r,.015),n.setTargetAtTime(1,r+t,.15)}function ye(e){M&&M.lp.frequency.setTargetAtTime(e?480:Math.min(18e3,M.a.ctx.sampleRate*.45),M.a.ctx.currentTime,e?.06:.12)}function L(){return{playing:!!N&&!!ee,song:N?.song??null,variant:N?.variant??null,bpm:N?.bpm??0,step:P}}var be=0,R=0,xe=!1,Se=!1,Ce=()=>j(c.stage?.music);function we(){if(xe)return;xe=!0,g(e=>{M=oe(e),ee&&ge(ee.song,ee.variant)});let e=e=>{clearTimeout(R),R=window.setTimeout(()=>{(c.mode===`over`||c.mode===`title`)&&ge(Ce(),`calm`)},e)};n.on(`stageLoad`,({stage:e})=>{clearTimeout(R),ye(!1),Se=!1,ge(j(e.music),`calm`)}),n.on(`stageStart`,({stage:e})=>{clearTimeout(R),ye(!1),Se=!1,ge(j(e.music),`level`)}),n.on(`chase`,({on:e})=>{Se=e,c.mode===`play`&&(ge(Ce(),e?`chase`:`level`),e&&ve(-6,.25))}),n.on(`respawn`,()=>{Se&&(Se=!1,ge(Ce(),`level`))}),n.on(`finishLine`,()=>{I(.5),window.setTimeout(()=>_e(O(Ce())),120)}),n.on(`stageEnd`,({result:t})=>{t.finished?c.stage?.ending?e(14e3):e(1800):(I(.4),window.setTimeout(()=>_e(k(),.9),150),e(2600))}),n.on(`setPiece`,({id:t,phase:n})=>{t===`ending`&&(n===`start`?(I(.6),clearTimeout(be),be=window.setTimeout(()=>_e(A(),1),300)):n===`end`&&e(400))}),n.on(`quit`,({stage:e})=>{ye(!1),ge(j(e.music),`calm`)}),n.on(`pause`,()=>ye(!0)),n.on(`resume`,()=>ye(!1)),n.on(`lifeLost`,()=>ve(-14,.9)),n.on(`bigHit`,({strength:e})=>ve(-9*Math.min(1,e),.35))}var Te=()=>_()?.ctx??null,Ee=1e3,De=1001,Oe=1002,ke=1003,Ae=1004,je=1005,Me=1006,Ne=1007,Pe=1008,Fe=1009,Ie=1010,Le=1011,Re=1012,ze=1013,Be=1014,Ve=1015,He=1016,Ue=1017,We=1018,Ge=1020,Ke=35902,qe=35899,Je=1021,Ye=1022,Xe=1023,Ze=1026,Qe=1027,$e=1028,et=1029,tt=1030,nt=1031,rt=1033,it=33776,at=33777,ot=33778,st=33779,ct=35840,lt=35841,ut=35842,dt=35843,ft=36196,pt=37492,mt=37496,ht=37488,gt=37489,_t=37490,vt=37491,yt=37808,bt=37809,xt=37810,St=37811,Ct=37812,wt=37813,Tt=37814,Et=37815,Dt=37816,Ot=37817,kt=37818,At=37819,jt=37820,Mt=37821,Nt=36492,Pt=36494,Ft=36495,It=36283,Lt=36284,Rt=36285,zt=36286,Bt=2300,Vt=2301,Ht=2302,Ut=2303,Wt=2400,Gt=2401,Kt=2402,qt=3200,Jt=`srgb`,Yt=`srgb-linear`,Xt=`linear`,Zt=`srgb`,Qt=7680,$t=35044,en=35048,tn=2e3;function nn(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}function rn(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function an(e){return document.createElementNS(`http://www.w3.org/1999/xhtml`,e)}function on(){let e=an(`canvas`);return e.style.display=`block`,e}var sn={};function cn(...e){let t=`THREE.`+e.shift();console.log(t,...e)}function ln(e){let t=e[0];if(typeof t==`string`&&t.startsWith(`TSL:`)){let t=e[1];t&&t.isStackTrace?e[0]+=` `+t.getLocation():e[1]=`Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.`}return e}function z(...e){e=ln(e);let t=`THREE.`+e.shift();{let n=e[0];n&&n.isStackTrace?console.warn(n.getError(t)):console.warn(t,...e)}}function B(...e){e=ln(e);let t=`THREE.`+e.shift();{let n=e[0];n&&n.isStackTrace?console.error(n.getError(t)):console.error(t,...e)}}function un(...e){let t=e.join(` `);t in sn||(sn[t]=!0,z(...e))}function dn(e,t,n){return new Promise(function(r,i){function a(){switch(e.clientWaitSync(t,e.SYNC_FLUSH_COMMANDS_BIT,0)){case e.WAIT_FAILED:i();break;case e.TIMEOUT_EXPIRED:setTimeout(a,n);break;default:r()}}setTimeout(a,n)})}var fn={0:1,2:6,4:7,3:5,1:0,6:2,7:4,5:3},pn=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){let n=this._listeners;return n!==void 0&&n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let r=n[e];if(r!==void 0){let e=r.indexOf(t);e!==-1&&r.splice(e,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let t=n.slice(0);for(let n=0,r=t.length;n<r;n++)t[n].call(this,e);e.target=null}}},mn=`00.01.02.03.04.05.06.07.08.09.0a.0b.0c.0d.0e.0f.10.11.12.13.14.15.16.17.18.19.1a.1b.1c.1d.1e.1f.20.21.22.23.24.25.26.27.28.29.2a.2b.2c.2d.2e.2f.30.31.32.33.34.35.36.37.38.39.3a.3b.3c.3d.3e.3f.40.41.42.43.44.45.46.47.48.49.4a.4b.4c.4d.4e.4f.50.51.52.53.54.55.56.57.58.59.5a.5b.5c.5d.5e.5f.60.61.62.63.64.65.66.67.68.69.6a.6b.6c.6d.6e.6f.70.71.72.73.74.75.76.77.78.79.7a.7b.7c.7d.7e.7f.80.81.82.83.84.85.86.87.88.89.8a.8b.8c.8d.8e.8f.90.91.92.93.94.95.96.97.98.99.9a.9b.9c.9d.9e.9f.a0.a1.a2.a3.a4.a5.a6.a7.a8.a9.aa.ab.ac.ad.ae.af.b0.b1.b2.b3.b4.b5.b6.b7.b8.b9.ba.bb.bc.bd.be.bf.c0.c1.c2.c3.c4.c5.c6.c7.c8.c9.ca.cb.cc.cd.ce.cf.d0.d1.d2.d3.d4.d5.d6.d7.d8.d9.da.db.dc.dd.de.df.e0.e1.e2.e3.e4.e5.e6.e7.e8.e9.ea.eb.ec.ed.ee.ef.f0.f1.f2.f3.f4.f5.f6.f7.f8.f9.fa.fb.fc.fd.fe.ff`.split(`.`),hn=Math.PI/180,gn=180/Math.PI;function _n(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0,r=Math.random()*4294967295|0;return(mn[e&255]+mn[e>>8&255]+mn[e>>16&255]+mn[e>>24&255]+`-`+mn[t&255]+mn[t>>8&255]+`-`+mn[t>>16&15|64]+mn[t>>24&255]+`-`+mn[n&63|128]+mn[n>>8&255]+`-`+mn[n>>16&255]+mn[n>>24&255]+mn[r&255]+mn[r>>8&255]+mn[r>>16&255]+mn[r>>24&255]).toLowerCase()}function vn(e,t,n){return Math.max(t,Math.min(n,e))}function yn(e,t){return(e%t+t)%t}function bn(e,t,n){return(1-n)*e+n*t}function xn(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw Error(`Invalid component type.`)}}function Sn(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw Error(`Invalid component type.`)}}var V=class e{constructor(t=0,n=0){e.prototype.isVector2=!0,this.x=t,this.y=n}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw Error(`index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw Error(`index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6],this.y=r[1]*t+r[4]*n+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=vn(this.x,e.x,t.x),this.y=vn(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=vn(this.x,e,t),this.y=vn(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(vn(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(vn(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),r=Math.sin(t),i=this.x-e.x,a=this.y-e.y;return this.x=i*n-a*r+e.x,this.y=i*r+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Cn=class{constructor(e=0,t=0,n=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=r}static slerpFlat(e,t,n,r,i,a,o){let s=n[r+0],c=n[r+1],l=n[r+2],u=n[r+3],d=i[a+0],f=i[a+1],p=i[a+2],m=i[a+3];if(u!==m||s!==d||c!==f||l!==p){let e=s*d+c*f+l*p+u*m;e<0&&(d=-d,f=-f,p=-p,m=-m,e=-e);let t=1-o;if(e<.9995){let n=Math.acos(e),r=Math.sin(n);t=Math.sin(t*n)/r,o=Math.sin(o*n)/r,s=s*t+d*o,c=c*t+f*o,l=l*t+p*o,u=u*t+m*o}else{s=s*t+d*o,c=c*t+f*o,l=l*t+p*o,u=u*t+m*o;let e=1/Math.sqrt(s*s+c*c+l*l+u*u);s*=e,c*=e,l*=e,u*=e}}e[t]=s,e[t+1]=c,e[t+2]=l,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,r,i,a){let o=n[r],s=n[r+1],c=n[r+2],l=n[r+3],u=i[a],d=i[a+1],f=i[a+2],p=i[a+3];return e[t]=o*p+l*u+s*f-c*d,e[t+1]=s*p+l*d+c*u-o*f,e[t+2]=c*p+l*f+o*d-s*u,e[t+3]=l*p-o*u-s*d-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,r){return this._x=e,this._y=t,this._z=n,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,r=e._y,i=e._z,a=e._order,o=Math.cos,s=Math.sin,c=o(n/2),l=o(r/2),u=o(i/2),d=s(n/2),f=s(r/2),p=s(i/2);switch(a){case`XYZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`YXZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`ZXY`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`ZYX`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`YZX`:this._x=d*l*u+c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u-d*f*p;break;case`XZY`:this._x=d*l*u-c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u+d*f*p;break;default:z(`Quaternion: .setFromEuler() encountered an unknown order: `+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,r=Math.sin(n);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],r=t[4],i=t[8],a=t[1],o=t[5],s=t[9],c=t[2],l=t[6],u=t[10],d=n+o+u;if(d>0){let e=.5/Math.sqrt(d+1);this._w=.25/e,this._x=(l-s)*e,this._y=(i-c)*e,this._z=(a-r)*e}else if(n>o&&n>u){let e=2*Math.sqrt(1+n-o-u);this._w=(l-s)/e,this._x=.25*e,this._y=(r+a)/e,this._z=(i+c)/e}else if(o>u){let e=2*Math.sqrt(1+o-n-u);this._w=(i-c)/e,this._x=(r+a)/e,this._y=.25*e,this._z=(s+l)/e}else{let e=2*Math.sqrt(1+u-n-o);this._w=(a-r)/e,this._x=(i+c)/e,this._y=(s+l)/e,this._z=.25*e}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(vn(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let r=Math.min(1,t/n);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x*=e,this._y*=e,this._z*=e,this._w*=e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=t._x,s=t._y,c=t._z,l=t._w;return this._x=n*l+a*o+r*c-i*s,this._y=r*l+a*s+i*o-n*c,this._z=i*l+a*c+n*s-r*o,this._w=a*l-n*o-r*s-i*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,r=-r,i=-i,a=-a,o=-o);let s=1-t;if(o<.9995){let e=Math.acos(o),c=Math.sin(e);s=Math.sin(s*e)/c,t=Math.sin(t*e)/c,this._x=this._x*s+n*t,this._y=this._y*s+r*t,this._z=this._z*s+i*t,this._w=this._w*s+a*t,this._onChangeCallback()}else this._x=this._x*s+n*t,this._y=this._y*s+r*t,this._z=this._z*s+i*t,this._w=this._w*s+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),r=Math.sqrt(1-n),i=Math.sqrt(n);return this.set(r*Math.sin(e),r*Math.cos(e),i*Math.sin(t),i*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},H=class e{constructor(t=0,n=0,r=0){e.prototype.isVector3=!0,this.x=t,this.y=n,this.z=r}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw Error(`index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw Error(`index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Tn.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Tn.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6]*r,this.y=i[1]*t+i[4]*n+i[7]*r,this.z=i[2]*t+i[5]*n+i[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=e.elements,a=1/(i[3]*t+i[7]*n+i[11]*r+i[15]);return this.x=(i[0]*t+i[4]*n+i[8]*r+i[12])*a,this.y=(i[1]*t+i[5]*n+i[9]*r+i[13])*a,this.z=(i[2]*t+i[6]*n+i[10]*r+i[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,r=this.z,i=e.x,a=e.y,o=e.z,s=e.w,c=2*(a*r-o*n),l=2*(o*t-i*r),u=2*(i*n-a*t);return this.x=t+s*c+a*u-o*l,this.y=n+s*l+o*c-i*u,this.z=r+s*u+i*l-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[4]*n+i[8]*r,this.y=i[1]*t+i[5]*n+i[9]*r,this.z=i[2]*t+i[6]*n+i[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=vn(this.x,e.x,t.x),this.y=vn(this.y,e.y,t.y),this.z=vn(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=vn(this.x,e,t),this.y=vn(this.y,e,t),this.z=vn(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(vn(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,r=e.y,i=e.z,a=t.x,o=t.y,s=t.z;return this.x=r*s-i*o,this.y=i*a-n*s,this.z=n*o-r*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return wn.copy(this).projectOnVector(e),this.sub(wn)}reflect(e){return this.sub(wn.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(vn(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,r=this.z-e.z;return t*t+n*n+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let r=Math.sin(t)*e;return this.x=r*Math.sin(n),this.y=Math.cos(t)*e,this.z=r*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},wn=new H,Tn=new Cn,En=class e{constructor(t,n,r,i,a,o,s,c,l){e.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,n,r,i,a,o,s,c,l)}set(e,t,n,r,i,a,o,s,c){let l=this.elements;return l[0]=e,l[1]=r,l[2]=o,l[3]=t,l[4]=i,l[5]=s,l[6]=n,l[7]=a,l[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[3],s=n[6],c=n[1],l=n[4],u=n[7],d=n[2],f=n[5],p=n[8],m=r[0],h=r[3],g=r[6],_=r[1],v=r[4],y=r[7],b=r[2],x=r[5],S=r[8];return i[0]=a*m+o*_+s*b,i[3]=a*h+o*v+s*x,i[6]=a*g+o*y+s*S,i[1]=c*m+l*_+u*b,i[4]=c*h+l*v+u*x,i[7]=c*g+l*y+u*S,i[2]=d*m+f*_+p*b,i[5]=d*h+f*v+p*x,i[8]=d*g+f*y+p*S,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8];return t*a*l-t*o*c-n*i*l+n*o*s+r*i*c-r*a*s}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=l*a-o*c,d=o*s-l*i,f=c*i-a*s,p=t*u+n*d+r*f;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);let m=1/p;return e[0]=u*m,e[1]=(r*c-l*n)*m,e[2]=(o*n-r*a)*m,e[3]=d*m,e[4]=(l*t-r*s)*m,e[5]=(r*i-o*t)*m,e[6]=f*m,e[7]=(n*s-c*t)*m,e[8]=(a*t-n*i)*m,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,r,i,a,o){let s=Math.cos(i),c=Math.sin(i);return this.set(n*s,n*c,-n*(s*a+c*o)+a+e,-r*c,r*s,-r*(-c*a+s*o)+o+t,0,0,1),this}scale(e,t){return this.premultiply(Dn.makeScale(e,t)),this}rotate(e){return this.premultiply(Dn.makeRotation(-e)),this}translate(e,t){return this.premultiply(Dn.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<9;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Dn=new En,On=new En().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),kn=new En().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function An(){let e={enabled:!0,workingColorSpace:Yt,spaces:{},convert:function(e,t,n){return this.enabled===!1||t===n||!t||!n||(this.spaces[t].transfer===`srgb`&&(e.r=Mn(e.r),e.g=Mn(e.g),e.b=Mn(e.b)),this.spaces[t].primaries!==this.spaces[n].primaries&&(e.applyMatrix3(this.spaces[t].toXYZ),e.applyMatrix3(this.spaces[n].fromXYZ)),this.spaces[n].transfer===`srgb`&&(e.r=Nn(e.r),e.g=Nn(e.g),e.b=Nn(e.b))),e},workingToColorSpace:function(e,t){return this.convert(e,this.workingColorSpace,t)},colorSpaceToWorking:function(e,t){return this.convert(e,t,this.workingColorSpace)},getPrimaries:function(e){return this.spaces[e].primaries},getTransfer:function(e){return e===``?Xt:this.spaces[e].transfer},getToneMappingMode:function(e){return this.spaces[e].outputColorSpaceConfig.toneMappingMode||`standard`},getLuminanceCoefficients:function(e,t=this.workingColorSpace){return e.fromArray(this.spaces[t].luminanceCoefficients)},define:function(e){Object.assign(this.spaces,e)},_getMatrix:function(e,t,n){return e.copy(this.spaces[t].toXYZ).multiply(this.spaces[n].fromXYZ)},_getDrawingBufferColorSpace:function(e){return this.spaces[e].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(e=this.workingColorSpace){return this.spaces[e].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(t,n){return un(`ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace().`),e.workingToColorSpace(t,n)},toWorkingColorSpace:function(t,n){return un(`ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking().`),e.colorSpaceToWorking(t,n)}},t=[.64,.33,.3,.6,.15,.06],n=[.2126,.7152,.0722],r=[.3127,.329];return e.define({[Yt]:{primaries:t,whitePoint:r,transfer:Xt,toXYZ:On,fromXYZ:kn,luminanceCoefficients:n,workingColorSpaceConfig:{unpackColorSpace:Jt},outputColorSpaceConfig:{drawingBufferColorSpace:Jt}},[Jt]:{primaries:t,whitePoint:r,transfer:Zt,toXYZ:On,fromXYZ:kn,luminanceCoefficients:n,outputColorSpaceConfig:{drawingBufferColorSpace:Jt}}}),e}var jn=An();function Mn(e){return e<.04045?e*.0773993808:(e*.9478672986+.0521327014)**2.4}function Nn(e){return e<.0031308?e*12.92:1.055*e**.41666-.055}var Pn,Fn=class{static getDataURL(e,t=`image/png`){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>`u`)return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{Pn===void 0&&(Pn=an(`canvas`)),Pn.width=e.width,Pn.height=e.height;let t=Pn.getContext(`2d`);e instanceof ImageData?t.putImageData(e,0,0):t.drawImage(e,0,0,e.width,e.height),n=Pn}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap){let t=an(`canvas`);t.width=e.width,t.height=e.height;let n=t.getContext(`2d`);n.drawImage(e,0,0,e.width,e.height);let r=n.getImageData(0,0,e.width,e.height),i=r.data;for(let e=0;e<i.length;e++)i[e]=Mn(i[e]/255)*255;return n.putImageData(r,0,0),t}if(e.data){let t=e.data.slice(0);for(let e=0;e<t.length;e++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[e]=Math.floor(Mn(t[e]/255)*255):t[e]=Mn(t[e]);return{data:t,width:e.width,height:e.height}}return z(`ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.`),e}},In=0,Ln=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:In++}),this.uuid=_n(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<`u`&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<`u`&&t instanceof VideoFrame?e.set(t.displayHeight,t.displayWidth,0):t===null?e.set(0,0,0):e.set(t.width,t.height,t.depth||0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:``},r=this.data;if(r!==null){let e;if(Array.isArray(r)){e=[];for(let t=0,n=r.length;t<n;t++)r[t].isDataTexture?e.push(Rn(r[t].image)):e.push(Rn(r[t]))}else e=Rn(r);n.url=e}return t||(e.images[this.uuid]=n),n}};function Rn(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap?Fn.getDataURL(e):e.data?{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name}:(z(`Texture: Unable to serialize Texture.`),{})}var zn=0,Bn=new H,Vn=class e extends pn{constructor(t=e.DEFAULT_IMAGE,n=e.DEFAULT_MAPPING,r=De,i=De,a=Me,o=Pe,s=Xe,c=Fe,l=e.DEFAULT_ANISOTROPY,u=``){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:zn++}),this.uuid=_n(),this.name=``,this.source=new Ln(t),this.mipmaps=[],this.mapping=n,this.channel=0,this.wrapS=r,this.wrapT=i,this.magFilter=a,this.minFilter=o,this.anisotropy=l,this.format=s,this.internalFormat=null,this.type=c,this.offset=new V(0,0),this.repeat=new V(1,1),this.center=new V(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new En,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(Bn).x}get height(){return this.source.getSize(Bn).y}get depth(){return this.source.getSize(Bn).z}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let n=e[t];if(n===void 0){z(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let r=this[t];r===void 0?z(`Texture.setValues(): property '${t}' does not exist.`):r&&n&&r.isVector2&&n.isVector2||r&&n&&r.isVector3&&n.isVector3||r&&n&&r.isMatrix3&&n.isMatrix3?r.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.7,type:`Texture`,generator:`Texture.toJSON`},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:`dispose`})}transformUv(e){if(this.mapping!==300)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case Ee:e.x-=Math.floor(e.x);break;case De:e.x=e.x<0?0:1;break;case Oe:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x-=Math.floor(e.x)}if(e.y<0||e.y>1)switch(this.wrapT){case Ee:e.y-=Math.floor(e.y);break;case De:e.y=e.y<0?0:1;break;case Oe:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y-=Math.floor(e.y)}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};Vn.DEFAULT_IMAGE=null,Vn.DEFAULT_MAPPING=300,Vn.DEFAULT_ANISOTROPY=1;var Hn=class e{constructor(t=0,n=0,r=0,i=1){e.prototype.isVector4=!0,this.x=t,this.y=n,this.z=r,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,r){return this.x=e,this.y=t,this.z=n,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw Error(`index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw Error(`index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w===void 0?1:e.w,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*r+a[12]*i,this.y=a[1]*t+a[5]*n+a[9]*r+a[13]*i,this.z=a[2]*t+a[6]*n+a[10]*r+a[14]*i,this.w=a[3]*t+a[7]*n+a[11]*r+a[15]*i,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,r,i,a=.01,o=.1,s=e.elements,c=s[0],l=s[4],u=s[8],d=s[1],f=s[5],p=s[9],m=s[2],h=s[6],g=s[10];if(Math.abs(l-d)<a&&Math.abs(u-m)<a&&Math.abs(p-h)<a){if(Math.abs(l+d)<o&&Math.abs(u+m)<o&&Math.abs(p+h)<o&&Math.abs(c+f+g-3)<o)return this.set(1,0,0,0),this;t=Math.PI;let e=(c+1)/2,s=(f+1)/2,_=(g+1)/2,v=(l+d)/4,y=(u+m)/4,b=(p+h)/4;return e>s&&e>_?e<a?(n=0,r=.707106781,i=.707106781):(n=Math.sqrt(e),r=v/n,i=y/n):s>_?s<a?(n=.707106781,r=0,i=.707106781):(r=Math.sqrt(s),n=v/r,i=b/r):_<a?(n=.707106781,r=.707106781,i=0):(i=Math.sqrt(_),n=y/i,r=b/i),this.set(n,r,i,t),this}let _=Math.sqrt((h-p)*(h-p)+(u-m)*(u-m)+(d-l)*(d-l));return Math.abs(_)<.001&&(_=1),this.x=(h-p)/_,this.y=(u-m)/_,this.z=(d-l)/_,this.w=Math.acos((c+f+g-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=vn(this.x,e.x,t.x),this.y=vn(this.y,e.y,t.y),this.z=vn(this.z,e.z,t.z),this.w=vn(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=vn(this.x,e,t),this.y=vn(this.y,e,t),this.z=vn(this.z,e,t),this.w=vn(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(vn(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},Un=class extends pn{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Me,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new Hn(0,0,e,t),this.scissorTest=!1,this.viewport=new Hn(0,0,e,t),this.textures=[];let r=new Vn({width:e,height:t,depth:n.depth}),i=n.count;for(let e=0;e<i;e++)this.textures[e]=r.clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview}_setTextureOptions(e={}){let t={minFilter:Me,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let e=0;e<this.textures.length;e++)this.textures[e].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let r=0,i=this.textures.length;r<i;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=n,this.textures[r].isData3DTexture!==!0&&(this.textures[r].isArrayTexture=this.textures[r].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let n=Object.assign({},e.textures[t].image);this.textures[t].source=new Ln(n)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:`dispose`})}},Wn=class extends Un{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},Gn=class extends Vn{constructor(e=null,t=1,n=1,r=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:r},this.magFilter=ke,this.minFilter=ke,this.wrapR=De,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}},Kn=class extends Vn{constructor(e=null,t=1,n=1,r=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:r},this.magFilter=ke,this.minFilter=ke,this.wrapR=De,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},qn=class e{constructor(t,n,r,i,a,o,s,c,l,u,d,f,p,m,h,g){e.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,n,r,i,a,o,s,c,l,u,d,f,p,m,h,g)}set(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h){let g=this.elements;return g[0]=e,g[4]=t,g[8]=n,g[12]=r,g[1]=i,g[5]=a,g[9]=o,g[13]=s,g[2]=c,g[6]=l,g[10]=u,g[14]=d,g[3]=f,g[7]=p,g[11]=m,g[15]=h,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new e().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinant()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinant()===0)return this.identity();let t=this.elements,n=e.elements,r=1/Jn.setFromMatrixColumn(e,0).length(),i=1/Jn.setFromMatrixColumn(e,1).length(),a=1/Jn.setFromMatrixColumn(e,2).length();return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=0,t[4]=n[4]*i,t[5]=n[5]*i,t[6]=n[6]*i,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,r=e.y,i=e.z,a=Math.cos(n),o=Math.sin(n),s=Math.cos(r),c=Math.sin(r),l=Math.cos(i),u=Math.sin(i);if(e.order===`XYZ`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=-s*u,t[8]=c,t[1]=n+r*c,t[5]=e-i*c,t[9]=-o*s,t[2]=i-e*c,t[6]=r+n*c,t[10]=a*s}else if(e.order===`YXZ`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e+i*o,t[4]=r*o-n,t[8]=a*c,t[1]=a*u,t[5]=a*l,t[9]=-o,t[2]=n*o-r,t[6]=i+e*o,t[10]=a*s}else if(e.order===`ZXY`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e-i*o,t[4]=-a*u,t[8]=r+n*o,t[1]=n+r*o,t[5]=a*l,t[9]=i-e*o,t[2]=-a*c,t[6]=o,t[10]=a*s}else if(e.order===`ZYX`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=r*c-n,t[8]=e*c+i,t[1]=s*u,t[5]=i*c+e,t[9]=n*c-r,t[2]=-c,t[6]=o*s,t[10]=a*s}else if(e.order===`YZX`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=i-e*u,t[8]=r*u+n,t[1]=u,t[5]=a*l,t[9]=-o*l,t[2]=-c*l,t[6]=n*u+r,t[10]=e-i*u}else if(e.order===`XZY`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=-u,t[8]=c*l,t[1]=e*u+i,t[5]=a*l,t[9]=n*u-r,t[2]=r*u-n,t[6]=o*l,t[10]=i*u+e}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Xn,e,Zn)}lookAt(e,t,n){let r=this.elements;return er.subVectors(e,t),er.lengthSq()===0&&(er.z=1),er.normalize(),Qn.crossVectors(n,er),Qn.lengthSq()===0&&(Math.abs(n.z)===1?er.x+=1e-4:er.z+=1e-4,er.normalize(),Qn.crossVectors(n,er)),Qn.normalize(),$n.crossVectors(er,Qn),r[0]=Qn.x,r[4]=$n.x,r[8]=er.x,r[1]=Qn.y,r[5]=$n.y,r[9]=er.y,r[2]=Qn.z,r[6]=$n.z,r[10]=er.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[4],s=n[8],c=n[12],l=n[1],u=n[5],d=n[9],f=n[13],p=n[2],m=n[6],h=n[10],g=n[14],_=n[3],v=n[7],y=n[11],b=n[15],x=r[0],S=r[4],C=r[8],w=r[12],T=r[1],E=r[5],D=r[9],O=r[13],k=r[2],A=r[6],j=r[10],M=r[14],N=r[3],ee=r[7],P=r[11],te=r[15];return i[0]=a*x+o*T+s*k+c*N,i[4]=a*S+o*E+s*A+c*ee,i[8]=a*C+o*D+s*j+c*P,i[12]=a*w+o*O+s*M+c*te,i[1]=l*x+u*T+d*k+f*N,i[5]=l*S+u*E+d*A+f*ee,i[9]=l*C+u*D+d*j+f*P,i[13]=l*w+u*O+d*M+f*te,i[2]=p*x+m*T+h*k+g*N,i[6]=p*S+m*E+h*A+g*ee,i[10]=p*C+m*D+h*j+g*P,i[14]=p*w+m*O+h*M+g*te,i[3]=_*x+v*T+y*k+b*N,i[7]=_*S+v*E+y*A+b*ee,i[11]=_*C+v*D+y*j+b*P,i[15]=_*w+v*O+y*M+b*te,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],r=e[8],i=e[12],a=e[1],o=e[5],s=e[9],c=e[13],l=e[2],u=e[6],d=e[10],f=e[14],p=e[3],m=e[7],h=e[11],g=e[15],_=s*f-c*d,v=o*f-c*u,y=o*d-s*u,b=a*f-c*l,x=a*d-s*l,S=a*u-o*l;return t*(m*_-h*v+g*y)-n*(p*_-h*b+g*x)+r*(p*v-m*b+g*S)-i*(p*y-m*x+h*S)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=e[9],d=e[10],f=e[11],p=e[12],m=e[13],h=e[14],g=e[15],_=t*o-n*a,v=t*s-r*a,y=t*c-i*a,b=n*s-r*o,x=n*c-i*o,S=r*c-i*s,C=l*m-u*p,w=l*h-d*p,T=l*g-f*p,E=u*h-d*m,D=u*g-f*m,O=d*g-f*h,k=_*O-v*D+y*E+b*T-x*w+S*C;if(k===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let A=1/k;return e[0]=(o*O-s*D+c*E)*A,e[1]=(r*D-n*O-i*E)*A,e[2]=(m*S-h*x+g*b)*A,e[3]=(d*x-u*S-f*b)*A,e[4]=(s*T-a*O-c*w)*A,e[5]=(t*O-r*T+i*w)*A,e[6]=(h*y-p*S-g*v)*A,e[7]=(l*S-d*y+f*v)*A,e[8]=(a*D-o*T+c*C)*A,e[9]=(n*T-t*D-i*C)*A,e[10]=(p*x-m*y+g*_)*A,e[11]=(u*y-l*x-f*_)*A,e[12]=(o*w-a*E-s*C)*A,e[13]=(t*E-n*w+r*C)*A,e[14]=(m*v-p*b-h*_)*A,e[15]=(l*b-u*v+d*_)*A,this}scale(e){let t=this.elements,n=e.x,r=e.y,i=e.z;return t[0]*=n,t[4]*=r,t[8]*=i,t[1]*=n,t[5]*=r,t[9]*=i,t[2]*=n,t[6]*=r,t[10]*=i,t[3]*=n,t[7]*=r,t[11]*=i,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,r))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),r=Math.sin(t),i=1-n,a=e.x,o=e.y,s=e.z,c=i*a,l=i*o;return this.set(c*a+n,c*o-r*s,c*s+r*o,0,c*o+r*s,l*o+n,l*s-r*a,0,c*s-r*o,l*s+r*a,i*s*s+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,r,i,a){return this.set(1,n,i,0,e,1,a,0,t,r,1,0,0,0,0,1),this}compose(e,t,n){let r=this.elements,i=t._x,a=t._y,o=t._z,s=t._w,c=i+i,l=a+a,u=o+o,d=i*c,f=i*l,p=i*u,m=a*l,h=a*u,g=o*u,_=s*c,v=s*l,y=s*u,b=n.x,x=n.y,S=n.z;return r[0]=(1-(m+g))*b,r[1]=(f+y)*b,r[2]=(p-v)*b,r[3]=0,r[4]=(f-y)*x,r[5]=(1-(d+g))*x,r[6]=(h+_)*x,r[7]=0,r[8]=(p+v)*S,r[9]=(h-_)*S,r[10]=(1-(d+m))*S,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,n){let r=this.elements;e.x=r[12],e.y=r[13],e.z=r[14];let i=this.determinant();if(i===0)return n.set(1,1,1),t.identity(),this;let a=Jn.set(r[0],r[1],r[2]).length(),o=Jn.set(r[4],r[5],r[6]).length(),s=Jn.set(r[8],r[9],r[10]).length();i<0&&(a=-a),Yn.copy(this);let c=1/a,l=1/o,u=1/s;return Yn.elements[0]*=c,Yn.elements[1]*=c,Yn.elements[2]*=c,Yn.elements[4]*=l,Yn.elements[5]*=l,Yn.elements[6]*=l,Yn.elements[8]*=u,Yn.elements[9]*=u,Yn.elements[10]*=u,t.setFromRotationMatrix(Yn),n.x=a,n.y=o,n.z=s,this}makePerspective(e,t,n,r,i,a,o=tn,s=!1){let c=this.elements,l=2*i/(t-e),u=2*i/(n-r),d=(t+e)/(t-e),f=(n+r)/(n-r),p,m;if(s)p=i/(a-i),m=a*i/(a-i);else if(o===2e3)p=-(a+i)/(a-i),m=-2*a*i/(a-i);else if(o===2001)p=-a/(a-i),m=-a*i/(a-i);else throw Error(`THREE.Matrix4.makePerspective(): Invalid coordinate system: `+o);return c[0]=l,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=u,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=p,c[14]=m,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,r,i,a,o=tn,s=!1){let c=this.elements,l=2/(t-e),u=2/(n-r),d=-(t+e)/(t-e),f=-(n+r)/(n-r),p,m;if(s)p=1/(a-i),m=a/(a-i);else if(o===2e3)p=-2/(a-i),m=-(a+i)/(a-i);else if(o===2001)p=-1/(a-i),m=-i/(a-i);else throw Error(`THREE.Matrix4.makeOrthographic(): Invalid coordinate system: `+o);return c[0]=l,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=u,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=p,c[14]=m,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<16;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},Jn=new H,Yn=new qn,Xn=new H(0,0,0),Zn=new H(1,1,1),Qn=new H,$n=new H,er=new H,tr=new qn,nr=new Cn,rr=class e{constructor(t=0,n=0,r=0,i=e.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=n,this._z=r,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,r=this._order){return this._x=e,this._y=t,this._z=n,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let r=e.elements,i=r[0],a=r[4],o=r[8],s=r[1],c=r[5],l=r[9],u=r[2],d=r[6],f=r[10];switch(t){case`XYZ`:this._y=Math.asin(vn(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-l,f),this._z=Math.atan2(-a,i)):(this._x=Math.atan2(d,c),this._z=0);break;case`YXZ`:this._x=Math.asin(-vn(l,-1,1)),Math.abs(l)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(s,c)):(this._y=Math.atan2(-u,i),this._z=0);break;case`ZXY`:this._x=Math.asin(vn(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(s,i));break;case`ZYX`:this._y=Math.asin(-vn(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,f),this._z=Math.atan2(s,i)):(this._x=0,this._z=Math.atan2(-a,c));break;case`YZX`:this._z=Math.asin(vn(s,-1,1)),Math.abs(s)<.9999999?(this._x=Math.atan2(-l,c),this._y=Math.atan2(-u,i)):(this._x=0,this._y=Math.atan2(o,f));break;case`XZY`:this._z=Math.asin(-vn(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,i)):(this._x=Math.atan2(-l,f),this._y=0);break;default:z(`Euler: .setFromRotationMatrix() encountered an unknown order: `+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return tr.makeRotationFromQuaternion(e),this.setFromRotationMatrix(tr,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return nr.setFromEuler(this),this.setFromQuaternion(nr,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};rr.DEFAULT_ORDER=`XYZ`;var ir=class{constructor(){this.mask=1}set(e){this.mask=1<<e>>>0}enable(e){this.mask|=1<<e}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e}disable(e){this.mask&=~(1<<e)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return!!(this.mask&1<<e)}},ar=0,or=new H,sr=new Cn,cr=new qn,lr=new H,ur=new H,dr=new H,fr=new Cn,pr=new H(1,0,0),mr=new H(0,1,0),hr=new H(0,0,1),gr={type:`added`},_r={type:`removed`},vr={type:`childadded`,child:null},yr={type:`childremoved`,child:null},br=class e extends pn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:ar++}),this.uuid=_n(),this.name=``,this.type=`Object3D`,this.parent=null,this.children=[],this.up=e.DEFAULT_UP.clone();let t=new H,n=new rr,r=new Cn,i=new H(1,1,1);function a(){r.setFromEuler(n,!1)}function o(){n.setFromQuaternion(r,void 0,!1)}n._onChange(a),r._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:n},quaternion:{configurable:!0,enumerable:!0,value:r},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new qn},normalMatrix:{value:new En}}),this.matrix=new qn,this.matrixWorld=new qn,this.matrixAutoUpdate=e.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=e.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new ir,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return sr.setFromAxisAngle(e,t),this.quaternion.multiply(sr),this}rotateOnWorldAxis(e,t){return sr.setFromAxisAngle(e,t),this.quaternion.premultiply(sr),this}rotateX(e){return this.rotateOnAxis(pr,e)}rotateY(e){return this.rotateOnAxis(mr,e)}rotateZ(e){return this.rotateOnAxis(hr,e)}translateOnAxis(e,t){return or.copy(e).applyQuaternion(this.quaternion),this.position.add(or.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(pr,e)}translateY(e){return this.translateOnAxis(mr,e)}translateZ(e){return this.translateOnAxis(hr,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(cr.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?lr.copy(e):lr.set(e,t,n);let r=this.parent;this.updateWorldMatrix(!0,!1),ur.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?cr.lookAt(ur,lr,this.up):cr.lookAt(lr,ur,this.up),this.quaternion.setFromRotationMatrix(cr),r&&(cr.extractRotation(r.matrixWorld),sr.setFromRotationMatrix(cr),this.quaternion.premultiply(sr.invert()))}add(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return e===this?(B(`Object3D.add: object can't be added as a child of itself.`,e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(gr),vr.child=e,this.dispatchEvent(vr),vr.child=null):B(`Object3D.add: object not an instance of THREE.Object3D.`,e),this)}remove(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.remove(arguments[e]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(_r),yr.child=e,this.dispatchEvent(yr),yr.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),cr.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),cr.multiply(e.parent.matrixWorld)),e.applyMatrix4(cr),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(gr),vr.child=e,this.dispatchEvent(vr),vr.child=null,this}getObjectById(e){return this.getObjectByProperty(`id`,e)}getObjectByName(e){return this.getObjectByProperty(`name`,e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,r=this.children.length;n<r;n++){let r=this.children[n].getObjectByProperty(e,t);if(r!==void 0)return r}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let r=this.children;for(let i=0,a=r.length;i<a;i++)r[i].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ur,e,dr),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ur,fr,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let t=e.x,n=e.y,r=e.z,i=this.matrix.elements;i[12]+=t-i[0]*t-i[4]*n-i[8]*r,i[13]+=n-i[1]*t-i[5]*n-i[9]*r,i[14]+=r-i[2]*t-i[6]*n-i[10]*r}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t){let n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){let e=this.children;for(let t=0,n=e.length;t<n;t++)e[t].updateWorldMatrix(!1,!0)}}toJSON(e){let t=e===void 0||typeof e==`string`,n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:`Object`,generator:`Object3D.toJSON`});let r={};r.uuid=this.uuid,r.type=this.type,this.name!==``&&(r.name=this.name),this.castShadow===!0&&(r.castShadow=!0),this.receiveShadow===!0&&(r.receiveShadow=!0),this.visible===!1&&(r.visible=!1),this.frustumCulled===!1&&(r.frustumCulled=!1),this.renderOrder!==0&&(r.renderOrder=this.renderOrder),this.static!==!1&&(r.static=this.static),Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.pivot!==null&&(r.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(r.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(r.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(r.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(r.type=`InstancedMesh`,r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type=`BatchedMesh`,r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.geometryInfo=this._geometryInfo.map(e=>({...e,boundingBox:e.boundingBox?e.boundingBox.toJSON():void 0,boundingSphere:e.boundingSphere?e.boundingSphere.toJSON():void 0})),r.instanceInfo=this._instanceInfo.map(e=>({...e})),r.availableInstanceIds=this._availableInstanceIds.slice(),r.availableGeometryIds=this._availableGeometryIds.slice(),r.nextIndexStart=this._nextIndexStart,r.nextVertexStart=this._nextVertexStart,r.geometryCount=this._geometryCount,r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.matricesTexture=this._matricesTexture.toJSON(e),r.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(r.boundingBox=this.boundingBox.toJSON()));function i(t,n){return t[n.uuid]===void 0&&(t[n.uuid]=n.toJSON(e)),n.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=i(e.geometries,this.geometry);let t=this.geometry.parameters;if(t!==void 0&&t.shapes!==void 0){let n=t.shapes;if(Array.isArray(n))for(let t=0,r=n.length;t<r;t++){let r=n[t];i(e.shapes,r)}else i(e.shapes,n)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(i(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0){if(Array.isArray(this.material)){let t=[];for(let n=0,r=this.material.length;n<r;n++)t.push(i(e.materials,this.material[n]));r.material=t}else r.material=i(e.materials,this.material)}if(this.children.length>0){r.children=[];for(let t=0;t<this.children.length;t++)r.children.push(this.children[t].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let t=0;t<this.animations.length;t++){let n=this.animations[t];r.animations.push(i(e.animations,n))}}if(t){let t=a(e.geometries),r=a(e.materials),i=a(e.textures),o=a(e.images),s=a(e.shapes),c=a(e.skeletons),l=a(e.animations),u=a(e.nodes);t.length>0&&(n.geometries=t),r.length>0&&(n.materials=r),i.length>0&&(n.textures=i),o.length>0&&(n.images=o),s.length>0&&(n.shapes=s),c.length>0&&(n.skeletons=c),l.length>0&&(n.animations=l),u.length>0&&(n.nodes=u)}return n.object=r,n;function a(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),e.pivot!==null&&(this.pivot=e.pivot.clone()),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let t=0;t<e.children.length;t++){let n=e.children[t];this.add(n.clone())}return this}};br.DEFAULT_UP=new H(0,1,0),br.DEFAULT_MATRIX_AUTO_UPDATE=!0,br.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var U=class extends br{constructor(){super(),this.isGroup=!0,this.type=`Group`}},xr={type:`move`},Sr=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new U,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new U,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new H,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new H),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new U,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new H,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new H),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:`connected`,data:e}),this}disconnect(e){return this.dispatchEvent({type:`disconnected`,data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let r=null,i=null,a=null,o=this._targetRay,s=this._grip,c=this._hand;if(e&&t.session.visibilityState!==`visible-blurred`){if(c&&e.hand){a=!0;for(let r of e.hand.values()){let e=t.getJointPose(r,n),i=this._getHandJoint(c,r);e!==null&&(i.matrix.fromArray(e.transform.matrix),i.matrix.decompose(i.position,i.rotation,i.scale),i.matrixWorldNeedsUpdate=!0,i.jointRadius=e.radius),i.visible=e!==null}let r=c.joints[`index-finger-tip`],i=c.joints[`thumb-tip`],o=r.position.distanceTo(i.position);c.inputState.pinching&&o>.025?(c.inputState.pinching=!1,this.dispatchEvent({type:`pinchend`,handedness:e.handedness,target:this})):!c.inputState.pinching&&o<=.015&&(c.inputState.pinching=!0,this.dispatchEvent({type:`pinchstart`,handedness:e.handedness,target:this}))}else s!==null&&e.gripSpace&&(i=t.getPose(e.gripSpace,n),i!==null&&(s.matrix.fromArray(i.transform.matrix),s.matrix.decompose(s.position,s.rotation,s.scale),s.matrixWorldNeedsUpdate=!0,i.linearVelocity?(s.hasLinearVelocity=!0,s.linearVelocity.copy(i.linearVelocity)):s.hasLinearVelocity=!1,i.angularVelocity?(s.hasAngularVelocity=!0,s.angularVelocity.copy(i.angularVelocity)):s.hasAngularVelocity=!1));o!==null&&(r=t.getPose(e.targetRaySpace,n),r===null&&i!==null&&(r=i),r!==null&&(o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,r.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(r.linearVelocity)):o.hasLinearVelocity=!1,r.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(r.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(xr)))}return o!==null&&(o.visible=r!==null),s!==null&&(s.visible=i!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new U;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},Cr={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},wr={h:0,s:0,l:0},Tr={h:0,s:0,l:0};function Er(e,t,n){return n<0&&(n+=1),n>1&&--n,n<1/6?e+(t-e)*6*n:n<1/2?t:n<2/3?e+(t-e)*6*(2/3-n):e}var W=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let t=e;t&&t.isColor?this.copy(t):typeof t==`number`?this.setHex(t):typeof t==`string`&&this.setStyle(t)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=Jt){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,jn.colorSpaceToWorking(this,t),this}setRGB(e,t,n,r=jn.workingColorSpace){return this.r=e,this.g=t,this.b=n,jn.colorSpaceToWorking(this,r),this}setHSL(e,t,n,r=jn.workingColorSpace){if(e=yn(e,1),t=vn(t,0,1),n=vn(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,i=2*n-r;this.r=Er(i,r,e+1/3),this.g=Er(i,r,e),this.b=Er(i,r,e-1/3)}return jn.colorSpaceToWorking(this,r),this}setStyle(e,t=Jt){function n(t){t!==void 0&&parseFloat(t)<1&&z(`Color: Alpha component of `+e+` will be ignored.`)}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let i,a=r[1],o=r[2];switch(a){case`rgb`:case`rgba`:if(i=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(255,parseInt(i[1],10))/255,Math.min(255,parseInt(i[2],10))/255,Math.min(255,parseInt(i[3],10))/255,t);if(i=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(100,parseInt(i[1],10))/100,Math.min(100,parseInt(i[2],10))/100,Math.min(100,parseInt(i[3],10))/100,t);break;case`hsl`:case`hsla`:if(i=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setHSL(parseFloat(i[1])/360,parseFloat(i[2])/100,parseFloat(i[3])/100,t);break;default:z(`Color: Unknown color model `+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){let n=r[1],i=n.length;if(i===3)return this.setRGB(parseInt(n.charAt(0),16)/15,parseInt(n.charAt(1),16)/15,parseInt(n.charAt(2),16)/15,t);if(i===6)return this.setHex(parseInt(n,16),t);z(`Color: Invalid hex color `+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=Jt){let n=Cr[e.toLowerCase()];return n===void 0?z(`Color: Unknown color `+e):this.setHex(n,t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Mn(e.r),this.g=Mn(e.g),this.b=Mn(e.b),this}copyLinearToSRGB(e){return this.r=Nn(e.r),this.g=Nn(e.g),this.b=Nn(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=Jt){return jn.workingToColorSpace(Dr.copy(this),e),Math.round(vn(Dr.r*255,0,255))*65536+Math.round(vn(Dr.g*255,0,255))*256+Math.round(vn(Dr.b*255,0,255))}getHexString(e=Jt){return(`000000`+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=jn.workingColorSpace){jn.workingToColorSpace(Dr.copy(this),t);let n=Dr.r,r=Dr.g,i=Dr.b,a=Math.max(n,r,i),o=Math.min(n,r,i),s,c,l=(o+a)/2;if(o===a)s=0,c=0;else{let e=a-o;switch(c=l<=.5?e/(a+o):e/(2-a-o),a){case n:s=(r-i)/e+(r<i?6:0);break;case r:s=(i-n)/e+2;break;case i:s=(n-r)/e+4}s/=6}return e.h=s,e.s=c,e.l=l,e}getRGB(e,t=jn.workingColorSpace){return jn.workingToColorSpace(Dr.copy(this),t),e.r=Dr.r,e.g=Dr.g,e.b=Dr.b,e}getStyle(e=Jt){jn.workingToColorSpace(Dr.copy(this),e);let t=Dr.r,n=Dr.g,r=Dr.b;return e===`srgb`?`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(r*255)})`:`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${r.toFixed(3)})`}offsetHSL(e,t,n){return this.getHSL(wr),this.setHSL(wr.h+e,wr.s+t,wr.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(wr),e.getHSL(Tr);let n=bn(wr.h,Tr.h,t),r=bn(wr.s,Tr.s,t),i=bn(wr.l,Tr.l,t);return this.setHSL(n,r,i),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,r=this.b,i=e.elements;return this.r=i[0]*t+i[3]*n+i[6]*r,this.g=i[1]*t+i[4]*n+i[7]*r,this.b=i[2]*t+i[5]*n+i[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Dr=new W;W.NAMES=Cr;var Or=class e{constructor(e,t=1,n=1e3){this.isFog=!0,this.name=``,this.color=new W(e),this.near=t,this.far=n}clone(){return new e(this.color,this.near,this.far)}toJSON(){return{type:`Fog`,name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}},kr=class extends br{constructor(){super(),this.isScene=!0,this.type=`Scene`,this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new rr,this.environmentIntensity=1,this.environmentRotation=new rr,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}},Ar=new H,jr=new H,Mr=new H,Nr=new H,Pr=new H,Fr=new H,Ir=new H,Lr=new H,Rr=new H,zr=new H,Br=new Hn,Vr=new Hn,Hr=new Hn,Ur=class e{constructor(e=new H,t=new H,n=new H){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,r){r.subVectors(n,t),Ar.subVectors(e,t),r.cross(Ar);let i=r.lengthSq();return i>0?r.multiplyScalar(1/Math.sqrt(i)):r.set(0,0,0)}static getBarycoord(e,t,n,r,i){Ar.subVectors(r,t),jr.subVectors(n,t),Mr.subVectors(e,t);let a=Ar.dot(Ar),o=Ar.dot(jr),s=Ar.dot(Mr),c=jr.dot(jr),l=jr.dot(Mr),u=a*c-o*o;if(u===0)return i.set(0,0,0),null;let d=1/u,f=(c*s-o*l)*d,p=(a*l-o*s)*d;return i.set(1-f-p,p,f)}static containsPoint(e,t,n,r){return this.getBarycoord(e,t,n,r,Nr)!==null&&Nr.x>=0&&Nr.y>=0&&Nr.x+Nr.y<=1}static getInterpolation(e,t,n,r,i,a,o,s){return this.getBarycoord(e,t,n,r,Nr)===null?(s.x=0,s.y=0,`z`in s&&(s.z=0),`w`in s&&(s.w=0),null):(s.setScalar(0),s.addScaledVector(i,Nr.x),s.addScaledVector(a,Nr.y),s.addScaledVector(o,Nr.z),s)}static getInterpolatedAttribute(e,t,n,r,i,a){return Br.setScalar(0),Vr.setScalar(0),Hr.setScalar(0),Br.fromBufferAttribute(e,t),Vr.fromBufferAttribute(e,n),Hr.fromBufferAttribute(e,r),a.setScalar(0),a.addScaledVector(Br,i.x),a.addScaledVector(Vr,i.y),a.addScaledVector(Hr,i.z),a}static isFrontFacing(e,t,n,r){return Ar.subVectors(n,t),jr.subVectors(e,t),Ar.cross(jr).dot(r)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,r){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,n,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Ar.subVectors(this.c,this.b),jr.subVectors(this.a,this.b),Ar.cross(jr).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return e.getNormal(this.a,this.b,this.c,t)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,n){return e.getBarycoord(t,this.a,this.b,this.c,n)}getInterpolation(t,n,r,i,a){return e.getInterpolation(t,this.a,this.b,this.c,n,r,i,a)}containsPoint(t){return e.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return e.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,r=this.b,i=this.c,a,o;Pr.subVectors(r,n),Fr.subVectors(i,n),Lr.subVectors(e,n);let s=Pr.dot(Lr),c=Fr.dot(Lr);if(s<=0&&c<=0)return t.copy(n);Rr.subVectors(e,r);let l=Pr.dot(Rr),u=Fr.dot(Rr);if(l>=0&&u<=l)return t.copy(r);let d=s*u-l*c;if(d<=0&&s>=0&&l<=0)return a=s/(s-l),t.copy(n).addScaledVector(Pr,a);zr.subVectors(e,i);let f=Pr.dot(zr),p=Fr.dot(zr);if(p>=0&&f<=p)return t.copy(i);let m=f*c-s*p;if(m<=0&&c>=0&&p<=0)return o=c/(c-p),t.copy(n).addScaledVector(Fr,o);let h=l*p-f*u;if(h<=0&&u-l>=0&&f-p>=0)return Ir.subVectors(i,r),o=(u-l)/(u-l+(f-p)),t.copy(r).addScaledVector(Ir,o);let g=1/(h+m+d);return a=m*g,o=d*g,t.copy(n).addScaledVector(Pr,a).addScaledVector(Fr,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},Wr=class{constructor(e=new H(1/0,1/0,1/0),t=new H(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(Kr.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(Kr.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=Kr.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute(`position`);if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let t=0,n=r.count;t<n;t++)e.isMesh===!0?e.getVertexPosition(t,Kr):Kr.fromBufferAttribute(r,t),Kr.applyMatrix4(e.matrixWorld),this.expandByPoint(Kr);else e.boundingBox===void 0?(n.boundingBox===null&&n.computeBoundingBox(),qr.copy(n.boundingBox)):(e.boundingBox===null&&e.computeBoundingBox(),qr.copy(e.boundingBox)),qr.applyMatrix4(e.matrixWorld),this.union(qr)}let r=e.children;for(let e=0,n=r.length;e<n;e++)this.expandByObject(r[e],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Kr),Kr.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(ei),ti.subVectors(this.max,ei),Jr.subVectors(e.a,ei),Yr.subVectors(e.b,ei),Xr.subVectors(e.c,ei),Zr.subVectors(Yr,Jr),Qr.subVectors(Xr,Yr),$r.subVectors(Jr,Xr);let t=[0,-Zr.z,Zr.y,0,-Qr.z,Qr.y,0,-$r.z,$r.y,Zr.z,0,-Zr.x,Qr.z,0,-Qr.x,$r.z,0,-$r.x,-Zr.y,Zr.x,0,-Qr.y,Qr.x,0,-$r.y,$r.x,0];return!ii(t,Jr,Yr,Xr,ti)||(t=[1,0,0,0,1,0,0,0,1],!ii(t,Jr,Yr,Xr,ti))?!1:(ni.crossVectors(Zr,Qr),t=[ni.x,ni.y,ni.z],ii(t,Jr,Yr,Xr,ti))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Kr).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(Kr).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()||(Gr[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Gr[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Gr[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Gr[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Gr[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Gr[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Gr[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Gr[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Gr)),this}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},Gr=[new H,new H,new H,new H,new H,new H,new H,new H],Kr=new H,qr=new Wr,Jr=new H,Yr=new H,Xr=new H,Zr=new H,Qr=new H,$r=new H,ei=new H,ti=new H,ni=new H,ri=new H;function ii(e,t,n,r,i){for(let a=0,o=e.length-3;a<=o;a+=3){ri.fromArray(e,a);let o=i.x*Math.abs(ri.x)+i.y*Math.abs(ri.y)+i.z*Math.abs(ri.z),s=t.dot(ri),c=n.dot(ri),l=r.dot(ri);if(Math.max(-Math.max(s,c,l),Math.min(s,c,l))>o)return!1}return!0}var ai=new H,oi=new V,si=0,ci=class{constructor(e,t,n=!1){if(Array.isArray(e))throw TypeError(`THREE.BufferAttribute: array should be a Typed Array.`);this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:si++}),this.name=``,this.array=e,this.itemSize=t,this.count=e===void 0?0:e.length/t,this.normalized=n,this.usage=$t,this.updateRanges=[],this.gpuType=Ve,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let r=0,i=this.itemSize;r<i;r++)this.array[e+r]=t.array[n+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)oi.fromBufferAttribute(this,t),oi.applyMatrix3(e),this.setXY(t,oi.x,oi.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)ai.fromBufferAttribute(this,t),ai.applyMatrix3(e),this.setXYZ(t,ai.x,ai.y,ai.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)ai.fromBufferAttribute(this,t),ai.applyMatrix4(e),this.setXYZ(t,ai.x,ai.y,ai.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)ai.fromBufferAttribute(this,t),ai.applyNormalMatrix(e),this.setXYZ(t,ai.x,ai.y,ai.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)ai.fromBufferAttribute(this,t),ai.transformDirection(e),this.setXYZ(t,ai.x,ai.y,ai.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=xn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=Sn(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=xn(t,this.array)),t}setX(e,t){return this.normalized&&(t=Sn(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=xn(t,this.array)),t}setY(e,t){return this.normalized&&(t=Sn(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=xn(t,this.array)),t}setZ(e,t){return this.normalized&&(t=Sn(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=xn(t,this.array)),t}setW(e,t){return this.normalized&&(t=Sn(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=Sn(t,this.array),n=Sn(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,r){return e*=this.itemSize,this.normalized&&(t=Sn(t,this.array),n=Sn(n,this.array),r=Sn(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this}setXYZW(e,t,n,r,i){return e*=this.itemSize,this.normalized&&(t=Sn(t,this.array),n=Sn(n,this.array),r=Sn(r,this.array),i=Sn(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this.array[e+3]=i,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==``&&(e.name=this.name),this.usage!==35044&&(e.usage=this.usage),e}},li=class extends ci{constructor(e,t,n){super(new Uint16Array(e),t,n)}},ui=class extends ci{constructor(e,t,n){super(new Uint32Array(e),t,n)}},G=class extends ci{constructor(e,t,n){super(new Float32Array(e),t,n)}},di=new Wr,fi=new H,pi=new H,mi=class{constructor(e=new H,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t===void 0?di.setFromPoints(e).getCenter(n):n.copy(t);let r=0;for(let t=0,i=e.length;t<i;t++)r=Math.max(r,n.distanceToSquared(e[t]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius*=e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;fi.subVectors(e,this.center);let t=fi.lengthSq();if(t>this.radius*this.radius){let e=Math.sqrt(t),n=(e-this.radius)*.5;this.center.addScaledVector(fi,n/e),this.radius+=n}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(pi.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(fi.copy(e.center).add(pi)),this.expandByPoint(fi.copy(e.center).sub(pi))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},hi=0,gi=new qn,_i=new br,vi=new H,yi=new Wr,bi=new Wr,xi=new H,Si=class e extends pn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:hi++}),this.uuid=_n(),this.name=``,this.type=`BufferGeometry`,this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return this.index=Array.isArray(e)?new(nn(e)?ui:li)(e,1):e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let t=new En().getNormalMatrix(e);n.applyNormalMatrix(t),n.needsUpdate=!0}let r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return gi.makeRotationFromQuaternion(e),this.applyMatrix4(gi),this}rotateX(e){return gi.makeRotationX(e),this.applyMatrix4(gi),this}rotateY(e){return gi.makeRotationY(e),this.applyMatrix4(gi),this}rotateZ(e){return gi.makeRotationZ(e),this.applyMatrix4(gi),this}translate(e,t,n){return gi.makeTranslation(e,t,n),this.applyMatrix4(gi),this}scale(e,t,n){return gi.makeScale(e,t,n),this.applyMatrix4(gi),this}lookAt(e){return _i.lookAt(e),_i.updateMatrix(),this.applyMatrix4(_i.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(vi).negate(),this.translate(vi.x,vi.y,vi.z),this}setFromPoints(e){let t=this.getAttribute(`position`);if(t===void 0){let t=[];for(let n=0,r=e.length;n<r;n++){let r=e[n];t.push(r.x,r.y,r.z||0)}this.setAttribute(`position`,new G(t,3))}else{let n=Math.min(e.length,t.count);for(let r=0;r<n;r++){let n=e[r];t.setXYZ(r,n.x,n.y,n.z||0)}e.length>t.count&&z(`BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.`),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Wr);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute)B(`BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.`,this),this.boundingBox.set(new H(-1/0,-1/0,-1/0),new H(1/0,1/0,1/0));else{if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];yi.setFromBufferAttribute(n),this.morphTargetsRelative?(xi.addVectors(this.boundingBox.min,yi.min),this.boundingBox.expandByPoint(xi),xi.addVectors(this.boundingBox.max,yi.max),this.boundingBox.expandByPoint(xi)):(this.boundingBox.expandByPoint(yi.min),this.boundingBox.expandByPoint(yi.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&B(`BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.`,this)}}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new mi);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute)B(`BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.`,this),this.boundingSphere.set(new H,1/0);else if(e){let n=this.boundingSphere.center;if(yi.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];bi.setFromBufferAttribute(n),this.morphTargetsRelative?(xi.addVectors(yi.min,bi.min),yi.expandByPoint(xi),xi.addVectors(yi.max,bi.max),yi.expandByPoint(xi)):(yi.expandByPoint(bi.min),yi.expandByPoint(bi.max))}yi.getCenter(n);let r=0;for(let t=0,i=e.count;t<i;t++)xi.fromBufferAttribute(e,t),r=Math.max(r,n.distanceToSquared(xi));if(t)for(let i=0,a=t.length;i<a;i++){let a=t[i],o=this.morphTargetsRelative;for(let t=0,i=a.count;t<i;t++)xi.fromBufferAttribute(a,t),o&&(vi.fromBufferAttribute(e,t),xi.add(vi)),r=Math.max(r,n.distanceToSquared(xi))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&B(`BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.`,this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){B(`BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)`);return}let n=t.position,r=t.normal,i=t.uv;this.hasAttribute(`tangent`)===!1&&this.setAttribute(`tangent`,new ci(new Float32Array(4*n.count),4));let a=this.getAttribute(`tangent`),o=[],s=[];for(let e=0;e<n.count;e++)o[e]=new H,s[e]=new H;let c=new H,l=new H,u=new H,d=new V,f=new V,p=new V,m=new H,h=new H;function g(e,t,r){c.fromBufferAttribute(n,e),l.fromBufferAttribute(n,t),u.fromBufferAttribute(n,r),d.fromBufferAttribute(i,e),f.fromBufferAttribute(i,t),p.fromBufferAttribute(i,r),l.sub(c),u.sub(c),f.sub(d),p.sub(d);let a=1/(f.x*p.y-p.x*f.y);isFinite(a)&&(m.copy(l).multiplyScalar(p.y).addScaledVector(u,-f.y).multiplyScalar(a),h.copy(u).multiplyScalar(f.x).addScaledVector(l,-p.x).multiplyScalar(a),o[e].add(m),o[t].add(m),o[r].add(m),s[e].add(h),s[t].add(h),s[r].add(h))}let _=this.groups;_.length===0&&(_=[{start:0,count:e.count}]);for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)g(e.getX(t+0),e.getX(t+1),e.getX(t+2))}let v=new H,y=new H,b=new H,x=new H;function S(e){b.fromBufferAttribute(r,e),x.copy(b);let t=o[e];v.copy(t),v.sub(b.multiplyScalar(b.dot(t))).normalize(),y.crossVectors(x,t);let n=y.dot(s[e])<0?-1:1;a.setXYZW(e,v.x,v.y,v.z,n)}for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)S(e.getX(t+0)),S(e.getX(t+1)),S(e.getX(t+2))}}computeVertexNormals(){let e=this.index,t=this.getAttribute(`position`);if(t!==void 0){let n=this.getAttribute(`normal`);if(n===void 0)n=new ci(new Float32Array(t.count*3),3),this.setAttribute(`normal`,n);else for(let e=0,t=n.count;e<t;e++)n.setXYZ(e,0,0,0);let r=new H,i=new H,a=new H,o=new H,s=new H,c=new H,l=new H,u=new H;if(e)for(let d=0,f=e.count;d<f;d+=3){let f=e.getX(d+0),p=e.getX(d+1),m=e.getX(d+2);r.fromBufferAttribute(t,f),i.fromBufferAttribute(t,p),a.fromBufferAttribute(t,m),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),o.fromBufferAttribute(n,f),s.fromBufferAttribute(n,p),c.fromBufferAttribute(n,m),o.add(l),s.add(l),c.add(l),n.setXYZ(f,o.x,o.y,o.z),n.setXYZ(p,s.x,s.y,s.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let e=0,o=t.count;e<o;e+=3)r.fromBufferAttribute(t,e+0),i.fromBufferAttribute(t,e+1),a.fromBufferAttribute(t,e+2),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),n.setXYZ(e+0,l.x,l.y,l.z),n.setXYZ(e+1,l.x,l.y,l.z),n.setXYZ(e+2,l.x,l.y,l.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)xi.fromBufferAttribute(e,t),xi.normalize(),e.setXYZ(t,xi.x,xi.y,xi.z)}toNonIndexed(){function t(e,t){let n=e.array,r=e.itemSize,i=e.normalized,a=new n.constructor(t.length*r),o=0,s=0;for(let i=0,c=t.length;i<c;i++){o=e.isInterleavedBufferAttribute?t[i]*e.data.stride+e.offset:t[i]*r;for(let e=0;e<r;e++)a[s++]=n[o++]}return new ci(a,r,i)}if(this.index===null)return z(`BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.`),this;let n=new e,r=this.index.array,i=this.attributes;for(let e in i){let a=i[e],o=t(a,r);n.setAttribute(e,o)}let a=this.morphAttributes;for(let e in a){let i=[],o=a[e];for(let e=0,n=o.length;e<n;e++){let n=o[e],a=t(n,r);i.push(a)}n.morphAttributes[e]=i}n.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let e=0,t=o.length;e<t;e++){let t=o[e];n.addGroup(t.start,t.count,t.materialIndex)}return n}toJSON(){let e={metadata:{version:4.7,type:`BufferGeometry`,generator:`BufferGeometry.toJSON`}};if(e.uuid=this.uuid,e.type=this.type,this.name!==``&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){let t=this.parameters;for(let n in t)t[n]!==void 0&&(e[n]=t[n]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let t in n){let r=n[t];e.data.attributes[t]=r.toJSON(e.data)}let r={},i=!1;for(let t in this.morphAttributes){let n=this.morphAttributes[t],a=[];for(let t=0,r=n.length;t<r;t++){let r=n[t];a.push(r.toJSON(e.data))}a.length>0&&(r[t]=a,i=!0)}i&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone());let r=e.attributes;for(let e in r){let n=r[e];this.setAttribute(e,n.clone(t))}let i=e.morphAttributes;for(let e in i){let n=[],r=i[e];for(let e=0,i=r.length;e<i;e++)n.push(r[e].clone(t));this.morphAttributes[e]=n}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let e=0,t=a.length;e<t;e++){let t=a[e];this.addGroup(t.start,t.count,t.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let s=e.boundingSphere;return s!==null&&(this.boundingSphere=s.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:`dispose`})}},Ci=class{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e===void 0?0:e.length/t,this.usage=$t,this.updateRanges=[],this.version=0,this.uuid=_n()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let r=0,i=this.stride;r<i;r++)this.array[e+r]=t.array[n+r];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=_n()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=_n()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},wi=new H,Ti=class e{constructor(e,t,n,r=!1){this.isInterleavedBufferAttribute=!0,this.name=``,this.data=e,this.itemSize=t,this.offset=n,this.normalized=r}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)wi.fromBufferAttribute(this,t),wi.applyMatrix4(e),this.setXYZ(t,wi.x,wi.y,wi.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)wi.fromBufferAttribute(this,t),wi.applyNormalMatrix(e),this.setXYZ(t,wi.x,wi.y,wi.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)wi.fromBufferAttribute(this,t),wi.transformDirection(e),this.setXYZ(t,wi.x,wi.y,wi.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=xn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=Sn(n,this.array)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=Sn(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=Sn(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=Sn(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=Sn(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=xn(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=xn(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=xn(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=xn(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=Sn(t,this.array),n=Sn(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=Sn(t,this.array),n=Sn(n,this.array),r=Sn(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=r,this}setXYZW(e,t,n,r,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=Sn(t,this.array),n=Sn(n,this.array),r=Sn(r,this.array),i=Sn(i,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=r,this.data.array[e+3]=i,this}clone(t){if(t===void 0){cn(`InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.`);let e=[];for(let t=0;t<this.count;t++){let n=t*this.data.stride+this.offset;for(let t=0;t<this.itemSize;t++)e.push(this.data.array[n+t])}return new ci(new this.array.constructor(e),this.itemSize,this.normalized)}return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new e(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){cn(`InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.`);let e=[];for(let t=0;t<this.count;t++){let n=t*this.data.stride+this.offset;for(let t=0;t<this.itemSize;t++)e.push(this.data.array[n+t])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:e,normalized:this.normalized}}return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}},Ei=0,Di=class extends pn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Ei++}),this.uuid=_n(),this.name=``,this.type=`Material`,this.blending=1,this.side=0,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=204,this.blendDst=205,this.blendEquation=100,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new W(0,0,0),this.blendAlpha=0,this.depthFunc=3,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=519,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Qt,this.stencilZFail=Qt,this.stencilZPass=Qt,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){z(`Material: parameter '${t}' has value of undefined.`);continue}let r=this[t];r===void 0?z(`Material: '${t}' is not a property of THREE.${this.type}.`):r&&r.isColor?r.set(n):r&&r.isVector3&&n&&n.isVector3?r.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e==`string`;t&&(e={textures:{},images:{}});let n={metadata:{version:4.7,type:`Material`,generator:`Material.toJSON`}};n.uuid=this.uuid,n.type=this.type,this.name!==``&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==1&&(n.blending=this.blending),this.side!==0&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==204&&(n.blendSrc=this.blendSrc),this.blendDst!==205&&(n.blendDst=this.blendDst),this.blendEquation!==100&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==3&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==519&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==7680&&(n.stencilFail=this.stencilFail),this.stencilZFail!==7680&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==7680&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==`round`&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==`round`&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function r(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}if(t){let t=r(e.textures),i=r(e.images);t.length>0&&(n.textures=t),i.length>0&&(n.images=i)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let e=t.length;n=Array(e);for(let r=0;r!==e;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:`dispose`})}set needsUpdate(e){e===!0&&this.version++}},Oi=class extends Di{constructor(e){super(),this.isSpriteMaterial=!0,this.type=`SpriteMaterial`,this.color=new W(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},ki,Ai=new H,ji=new H,Mi=new H,Ni=new V,Pi=new V,Fi=new qn,Ii=new H,Li=new H,Ri=new H,zi=new V,Bi=new V,Vi=new V,Hi=class extends br{constructor(e=new Oi){if(super(),this.isSprite=!0,this.type=`Sprite`,ki===void 0){ki=new Si;let e=new Ci(new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),5);ki.setIndex([0,1,2,0,2,3]),ki.setAttribute(`position`,new Ti(e,3,0,!1)),ki.setAttribute(`uv`,new Ti(e,2,3,!1))}this.geometry=ki,this.material=e,this.center=new V(.5,.5),this.count=1}raycast(e,t){e.camera===null&&B(`Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.`),ji.setFromMatrixScale(this.matrixWorld),Fi.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),Mi.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&ji.multiplyScalar(-Mi.z);let n=this.material.rotation,r,i;n!==0&&(i=Math.cos(n),r=Math.sin(n));let a=this.center;Ui(Ii.set(-.5,-.5,0),Mi,a,ji,r,i),Ui(Li.set(.5,-.5,0),Mi,a,ji,r,i),Ui(Ri.set(.5,.5,0),Mi,a,ji,r,i),zi.set(0,0),Bi.set(1,0),Vi.set(1,1);let o=e.ray.intersectTriangle(Ii,Li,Ri,!1,Ai);if(o===null&&(Ui(Li.set(-.5,.5,0),Mi,a,ji,r,i),Bi.set(0,1),o=e.ray.intersectTriangle(Ii,Ri,Li,!1,Ai),o===null))return;let s=e.ray.origin.distanceTo(Ai);s<e.near||s>e.far||t.push({distance:s,point:Ai.clone(),uv:Ur.getInterpolation(Ai,Ii,Li,Ri,zi,Bi,Vi,new V),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}};function Ui(e,t,n,r,i,a){Ni.subVectors(e,n).addScalar(.5).multiply(r),i===void 0?Pi.copy(Ni):(Pi.x=a*Ni.x-i*Ni.y,Pi.y=i*Ni.x+a*Ni.y),e.copy(t),e.x+=Pi.x,e.y+=Pi.y,e.applyMatrix4(Fi)}var Wi=new H,Gi=new H,Ki=new H,qi=new H,Ji=new H,Yi=new H,Xi=new H,Zi=class{constructor(e=new H,t=new H(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Wi)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=Wi.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Wi.copy(this.origin).addScaledVector(this.direction,t),Wi.distanceToSquared(e))}distanceSqToSegment(e,t,n,r){Gi.copy(e).add(t).multiplyScalar(.5),Ki.copy(t).sub(e).normalize(),qi.copy(this.origin).sub(Gi);let i=e.distanceTo(t)*.5,a=-this.direction.dot(Ki),o=qi.dot(this.direction),s=-qi.dot(Ki),c=qi.lengthSq(),l=Math.abs(1-a*a),u,d,f,p;if(l>0){if(u=a*s-o,d=a*o-s,p=i*l,u>=0){if(d>=-p){if(d<=p){let e=1/l;u*=e,d*=e,f=u*(u+a*d+2*o)+d*(a*u+d+2*s)+c}else d=i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c}else d=-i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c}else d<=-p?(u=Math.max(0,-(-a*i+o)),d=u>0?-i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c):d<=p?(u=0,d=Math.min(Math.max(-i,-s),i),f=d*(d+2*s)+c):(u=Math.max(0,-(a*i+o)),d=u>0?i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c)}else d=a>0?-i:i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),r&&r.copy(Gi).addScaledVector(Ki,d),f}intersectSphere(e,t){Wi.subVectors(e.center,this.origin);let n=Wi.dot(this.direction),r=Wi.dot(Wi)-n*n,i=e.radius*e.radius;if(r>i)return null;let a=Math.sqrt(i-r),o=n-a,s=n+a;return s<0?null:o<0?this.at(s,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,r,i,a,o,s,c=1/this.direction.x,l=1/this.direction.y,u=1/this.direction.z,d=this.origin;return c>=0?(n=(e.min.x-d.x)*c,r=(e.max.x-d.x)*c):(n=(e.max.x-d.x)*c,r=(e.min.x-d.x)*c),l>=0?(i=(e.min.y-d.y)*l,a=(e.max.y-d.y)*l):(i=(e.max.y-d.y)*l,a=(e.min.y-d.y)*l),n>a||i>r||((i>n||isNaN(n))&&(n=i),(a<r||isNaN(r))&&(r=a),u>=0?(o=(e.min.z-d.z)*u,s=(e.max.z-d.z)*u):(o=(e.max.z-d.z)*u,s=(e.min.z-d.z)*u),n>s||o>r)||((o>n||n!==n)&&(n=o),(s<r||r!==r)&&(r=s),r<0)?null:this.at(n>=0?n:r,t)}intersectsBox(e){return this.intersectBox(e,Wi)!==null}intersectTriangle(e,t,n,r,i){Ji.subVectors(t,e),Yi.subVectors(n,e),Xi.crossVectors(Ji,Yi);let a=this.direction.dot(Xi),o;if(a>0){if(r)return null;o=1}else if(a<0)o=-1,a=-a;else return null;qi.subVectors(this.origin,e);let s=o*this.direction.dot(Yi.crossVectors(qi,Yi));if(s<0)return null;let c=o*this.direction.dot(Ji.cross(qi));if(c<0||s+c>a)return null;let l=-o*qi.dot(Xi);return l<0?null:this.at(l/a,i)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Qi=class extends Di{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type=`MeshBasicMaterial`,this.color=new W(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new rr,this.combine=0,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},$i=new qn,ea=new Zi,ta=new mi,na=new H,ra=new H,ia=new H,aa=new H,oa=new H,sa=new H,ca=new H,la=new H,K=class extends br{constructor(e=new Si,t=new Qi){super(),this.isMesh=!0,this.type=`Mesh`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}getVertexPosition(e,t){let n=this.geometry,r=n.attributes.position,i=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(r,e);let o=this.morphTargetInfluences;if(i&&o){sa.set(0,0,0);for(let n=0,r=i.length;n<r;n++){let r=o[n],s=i[n];r!==0&&(oa.fromBufferAttribute(s,e),a?sa.addScaledVector(oa,r):sa.addScaledVector(oa.sub(t),r))}t.add(sa)}return t}raycast(e,t){let n=this.geometry,r=this.material,i=this.matrixWorld;r!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),ta.copy(n.boundingSphere),ta.applyMatrix4(i),ea.copy(e.ray).recast(e.near),!(ta.containsPoint(ea.origin)===!1&&(ea.intersectSphere(ta,na)===null||ea.origin.distanceToSquared(na)>(e.far-e.near)**2))&&($i.copy(i).invert(),ea.copy(e.ray).applyMatrix4($i),(n.boundingBox===null||ea.intersectsBox(n.boundingBox)!==!1)&&this._computeIntersections(e,t,ea)))}_computeIntersections(e,t,n){let r,i=this.geometry,a=this.material,o=i.index,s=i.attributes.position,c=i.attributes.uv,l=i.attributes.uv1,u=i.attributes.normal,d=i.groups,f=i.drawRange;if(o!==null){if(Array.isArray(a))for(let i=0,s=d.length;i<s;i++){let s=d[i],p=a[s.materialIndex],m=Math.max(s.start,f.start),h=Math.min(o.count,Math.min(s.start+s.count,f.start+f.count));for(let i=m,a=h;i<a;i+=3){let a=o.getX(i),d=o.getX(i+1),f=o.getX(i+2);r=da(this,p,e,n,c,l,u,a,d,f),r&&(r.faceIndex=Math.floor(i/3),r.face.materialIndex=s.materialIndex,t.push(r))}}else{let i=Math.max(0,f.start),s=Math.min(o.count,f.start+f.count);for(let d=i,f=s;d<f;d+=3){let i=o.getX(d),s=o.getX(d+1),f=o.getX(d+2);r=da(this,a,e,n,c,l,u,i,s,f),r&&(r.faceIndex=Math.floor(d/3),t.push(r))}}}else if(s!==void 0){if(Array.isArray(a))for(let i=0,o=d.length;i<o;i++){let o=d[i],p=a[o.materialIndex],m=Math.max(o.start,f.start),h=Math.min(s.count,Math.min(o.start+o.count,f.start+f.count));for(let i=m,a=h;i<a;i+=3){let a=i,s=i+1,d=i+2;r=da(this,p,e,n,c,l,u,a,s,d),r&&(r.faceIndex=Math.floor(i/3),r.face.materialIndex=o.materialIndex,t.push(r))}}else{let i=Math.max(0,f.start),o=Math.min(s.count,f.start+f.count);for(let s=i,d=o;s<d;s+=3){let i=s,o=s+1,d=s+2;r=da(this,a,e,n,c,l,u,i,o,d),r&&(r.faceIndex=Math.floor(s/3),t.push(r))}}}}};function ua(e,t,n,r,i,a,o,s){let c;if(c=t.side===1?r.intersectTriangle(o,a,i,!0,s):r.intersectTriangle(i,a,o,t.side===0,s),c===null)return null;la.copy(s),la.applyMatrix4(e.matrixWorld);let l=n.ray.origin.distanceTo(la);return l<n.near||l>n.far?null:{distance:l,point:la.clone(),object:e}}function da(e,t,n,r,i,a,o,s,c,l){e.getVertexPosition(s,ra),e.getVertexPosition(c,ia),e.getVertexPosition(l,aa);let u=ua(e,t,n,r,ra,ia,aa,ca);if(u){let e=new H;Ur.getBarycoord(ca,ra,ia,aa,e),i&&(u.uv=Ur.getInterpolatedAttribute(i,s,c,l,e,new V)),a&&(u.uv1=Ur.getInterpolatedAttribute(a,s,c,l,e,new V)),o&&(u.normal=Ur.getInterpolatedAttribute(o,s,c,l,e,new H),u.normal.dot(r.direction)>0&&u.normal.multiplyScalar(-1));let t={a:s,b:c,c:l,normal:new H,materialIndex:0};Ur.getNormal(ra,ia,aa,t.normal),u.face=t,u.barycoord=e}return u}var fa=class extends Vn{constructor(e=null,t=1,n=1,r,i,a,o,s,c=ke,l=ke,u,d){super(null,a,o,s,c,l,r,i,u,d),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},pa=class extends ci{constructor(e,t,n,r=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=r}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}},ma=new qn,ha=new qn,ga=[],_a=new Wr,va=new qn,ya=new K,ba=new mi,xa=class extends K{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new pa(new Float32Array(n*16),16),this.previousInstanceMatrix=null,this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let e=0;e<n;e++)this.setMatrixAt(e,va)}computeBoundingBox(){let e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new Wr),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,ma),_a.copy(e.boundingBox).applyMatrix4(ma),this.boundingBox.union(_a)}computeBoundingSphere(){let e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new mi),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,ma),ba.copy(e.boundingSphere).applyMatrix4(ma),this.boundingSphere.union(ba)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.previousInstanceMatrix!==null&&(this.previousInstanceMatrix=e.previousInstanceMatrix.clone()),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){let n=t.morphTargetInfluences,r=this.morphTexture.source.data.data,i=e*(n.length+1)+1;for(let e=0;e<n.length;e++)n[e]=r[i+e]}raycast(e,t){let n=this.matrixWorld,r=this.count;if(ya.geometry=this.geometry,ya.material=this.material,ya.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),ba.copy(this.boundingSphere),ba.applyMatrix4(n),e.ray.intersectsSphere(ba)!==!1))for(let i=0;i<r;i++){this.getMatrixAt(i,ma),ha.multiplyMatrices(n,ma),ya.matrixWorld=ha,ya.raycast(e,ga);for(let e=0,n=ga.length;e<n;e++){let n=ga[e];n.instanceId=i,n.object=this,t.push(n)}ga.length=0}}setColorAt(e,t){this.instanceColor===null&&(this.instanceColor=new pa(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3)}setMatrixAt(e,t){t.toArray(this.instanceMatrix.array,e*16)}setMorphAt(e,t){let n=t.morphTargetInfluences,r=n.length+1;this.morphTexture===null&&(this.morphTexture=new fa(new Float32Array(r*this.count),r,this.count,$e,Ve));let i=this.morphTexture.source.data.data,a=0;for(let e=0;e<n.length;e++)a+=n[e];let o=this.geometry.morphTargetsRelative?1:1-a,s=r*e;i[s]=o,i.set(n,s+1)}updateMorphTargets(){}dispose(){this.dispatchEvent({type:`dispose`}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}},Sa=new H,Ca=new H,wa=new En,Ta=class{constructor(e=new H(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,r){return this.normal.set(e,t,n),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let r=Sa.subVectors(n,t).cross(Ca.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){let n=e.delta(Sa),r=this.normal.dot(n);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let i=-(e.start.dot(this.normal)+this.constant)/r;return i<0||i>1?null:t.copy(e.start).addScaledVector(n,i)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||wa.getNormalMatrix(e),r=this.coplanarPoint(Sa).applyMatrix4(e),i=this.normal.applyMatrix3(n).normalize();return this.constant=-r.dot(i),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},Ea=new mi,Da=new V(.5,.5),Oa=new H,ka=class{constructor(e=new Ta,t=new Ta,n=new Ta,r=new Ta,i=new Ta,a=new Ta){this.planes=[e,t,n,r,i,a]}set(e,t,n,r,i,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(r),o[4].copy(i),o[5].copy(a),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=tn,n=!1){let r=this.planes,i=e.elements,a=i[0],o=i[1],s=i[2],c=i[3],l=i[4],u=i[5],d=i[6],f=i[7],p=i[8],m=i[9],h=i[10],g=i[11],_=i[12],v=i[13],y=i[14],b=i[15];if(r[0].setComponents(c-a,f-l,g-p,b-_).normalize(),r[1].setComponents(c+a,f+l,g+p,b+_).normalize(),r[2].setComponents(c+o,f+u,g+m,b+v).normalize(),r[3].setComponents(c-o,f-u,g-m,b-v).normalize(),n)r[4].setComponents(s,d,h,y).normalize(),r[5].setComponents(c-s,f-d,g-h,b-y).normalize();else if(r[4].setComponents(c-s,f-d,g-h,b-y).normalize(),t===2e3)r[5].setComponents(c+s,f+d,g+h,b+y).normalize();else if(t===2001)r[5].setComponents(s,d,h,y).normalize();else throw Error(`THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: `+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Ea.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Ea.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Ea)}intersectsSprite(e){return Ea.center.set(0,0,0),Ea.radius=.7071067811865476+Da.distanceTo(e.center),Ea.applyMatrix4(e.matrixWorld),this.intersectsSphere(Ea)}intersectsSphere(e){let t=this.planes,n=e.center,r=-e.radius;for(let e=0;e<6;e++)if(t[e].distanceToPoint(n)<r)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let r=t[n];if(Oa.x=r.normal.x>0?e.max.x:e.min.x,Oa.y=r.normal.y>0?e.max.y:e.min.y,Oa.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(Oa)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},Aa=class extends Di{constructor(e){super(),this.isPointsMaterial=!0,this.type=`PointsMaterial`,this.color=new W(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},ja=new qn,Ma=new Zi,Na=new mi,Pa=new H,Fa=class extends br{constructor(e=new Si,t=new Aa){super(),this.isPoints=!0,this.type=`Points`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){let n=this.geometry,r=this.matrixWorld,i=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Na.copy(n.boundingSphere),Na.applyMatrix4(r),Na.radius+=i,e.ray.intersectsSphere(Na)===!1)return;ja.copy(r).invert(),Ma.copy(e.ray).applyMatrix4(ja);let o=i/((this.scale.x+this.scale.y+this.scale.z)/3),s=o*o,c=n.index,l=n.attributes.position;if(c!==null){let n=Math.max(0,a.start),i=Math.min(c.count,a.start+a.count);for(let a=n,o=i;a<o;a++){let n=c.getX(a);Pa.fromBufferAttribute(l,n),Ia(Pa,n,s,r,e,t,this)}}else{let n=Math.max(0,a.start),i=Math.min(l.count,a.start+a.count);for(let a=n,o=i;a<o;a++)Pa.fromBufferAttribute(l,a),Ia(Pa,a,s,r,e,t,this)}}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}};function Ia(e,t,n,r,i,a,o){let s=Ma.distanceSqToPoint(e);if(s<n){let n=new H;Ma.closestPointToPoint(e,n),n.applyMatrix4(r);let c=i.ray.origin.distanceTo(n);if(c<i.near||c>i.far)return;a.push({distance:c,distanceToRay:Math.sqrt(s),point:n,index:t,face:null,faceIndex:null,barycoord:null,object:o})}}var La=class extends Vn{constructor(e=[],t=301,n,r,i,a,o,s,c,l){super(e,t,n,r,i,a,o,s,c,l),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},Ra=class extends Vn{constructor(e,t,n,r,i,a,o,s,c){super(e,t,n,r,i,a,o,s,c),this.isCanvasTexture=!0,this.needsUpdate=!0}},za=class extends Vn{constructor(e,t,n=Be,r,i,a,o=ke,s=ke,c,l=Ze,u=1){if(l!==1026&&l!==1027)throw Error(`DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat`);super({width:e,height:t,depth:u},r,i,a,o,s,l,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Ln(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},Ba=class extends za{constructor(e,t=Be,n=301,r,i,a=ke,o=ke,s,c=Ze){let l={width:e,height:e,depth:1},u=[l,l,l,l,l,l];super(e,e,t,n,r,i,a,o,s,c),this.image=u,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}},Va=class extends Vn{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}},Ha=class e extends Si{constructor(e=1,t=1,n=1,r=1,i=1,a=1){super(),this.type=`BoxGeometry`,this.parameters={width:e,height:t,depth:n,widthSegments:r,heightSegments:i,depthSegments:a};let o=this;r=Math.floor(r),i=Math.floor(i),a=Math.floor(a);let s=[],c=[],l=[],u=[],d=0,f=0;p(`z`,`y`,`x`,-1,-1,n,t,e,a,i,0),p(`z`,`y`,`x`,1,-1,n,t,-e,a,i,1),p(`x`,`z`,`y`,1,1,e,n,t,r,a,2),p(`x`,`z`,`y`,1,-1,e,n,-t,r,a,3),p(`x`,`y`,`z`,1,-1,e,t,n,r,i,4),p(`x`,`y`,`z`,-1,-1,e,t,-n,r,i,5),this.setIndex(s),this.setAttribute(`position`,new G(c,3)),this.setAttribute(`normal`,new G(l,3)),this.setAttribute(`uv`,new G(u,2));function p(e,t,n,r,i,a,p,m,h,g,_){let v=a/h,y=p/g,b=a/2,x=p/2,S=m/2,C=h+1,w=g+1,T=0,E=0,D=new H;for(let a=0;a<w;a++){let o=a*y-x;for(let s=0;s<C;s++)D[e]=(s*v-b)*r,D[t]=o*i,D[n]=S,c.push(D.x,D.y,D.z),D[e]=0,D[t]=0,D[n]=m>0?1:-1,l.push(D.x,D.y,D.z),u.push(s/h),u.push(1-a/g),T+=1}for(let e=0;e<g;e++)for(let t=0;t<h;t++){let n=d+t+C*e,r=d+t+C*(e+1),i=d+(t+1)+C*(e+1),a=d+(t+1)+C*e;s.push(n,r,a),s.push(r,i,a),E+=6}o.addGroup(f,E,_),f+=E,d+=T}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}},Ua=class e extends Si{constructor(e=1,t=1,n=4,r=8,i=1){super(),this.type=`CapsuleGeometry`,this.parameters={radius:e,height:t,capSegments:n,radialSegments:r,heightSegments:i},t=Math.max(0,t),n=Math.max(1,Math.floor(n)),r=Math.max(3,Math.floor(r)),i=Math.max(1,Math.floor(i));let a=[],o=[],s=[],c=[],l=t/2,u=Math.PI/2*e,d=t,f=2*u+d,p=n*2+i,m=r+1,h=new H,g=new H;for(let _=0;_<=p;_++){let v=0,y=0,b=0,x=0;if(_<=n){let t=_/n,r=t*Math.PI/2;y=-l-e*Math.cos(r),b=e*Math.sin(r),x=-e*Math.cos(r),v=t*u}else if(_<=n+i){let r=(_-n)/i;y=-l+r*t,b=e,x=0,v=u+r*d}else{let t=(_-n-i)/n,r=t*Math.PI/2;y=l+e*Math.sin(r),b=e*Math.cos(r),x=e*Math.sin(r),v=u+d+t*u}let S=Math.max(0,Math.min(1,v/f)),C=0;_===0?C=.5/r:_===p&&(C=-.5/r);for(let e=0;e<=r;e++){let t=e/r,n=t*Math.PI*2,i=Math.sin(n),a=Math.cos(n);g.x=-b*a,g.y=y,g.z=b*i,o.push(g.x,g.y,g.z),h.set(-b*a,x,b*i),h.normalize(),s.push(h.x,h.y,h.z),c.push(t+C,S)}if(_>0){let e=(_-1)*m;for(let t=0;t<r;t++){let n=e+t,r=e+t+1,i=_*m+t,o=_*m+t+1;a.push(n,r,i),a.push(r,o,i)}}}this.setIndex(a),this.setAttribute(`position`,new G(o,3)),this.setAttribute(`normal`,new G(s,3)),this.setAttribute(`uv`,new G(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.height,t.capSegments,t.radialSegments,t.heightSegments)}},Wa=class e extends Si{constructor(e=1,t=32,n=0,r=Math.PI*2){super(),this.type=`CircleGeometry`,this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:r},t=Math.max(3,t);let i=[],a=[],o=[],s=[],c=new H,l=new V;a.push(0,0,0),o.push(0,0,1),s.push(.5,.5);for(let i=0,u=3;i<=t;i++,u+=3){let d=n+i/t*r;c.x=e*Math.cos(d),c.y=e*Math.sin(d),a.push(c.x,c.y,c.z),o.push(0,0,1),l.x=(a[u]/e+1)/2,l.y=(a[u+1]/e+1)/2,s.push(l.x,l.y)}for(let e=1;e<=t;e++)i.push(e,e+1,0);this.setIndex(i),this.setAttribute(`position`,new G(a,3)),this.setAttribute(`normal`,new G(o,3)),this.setAttribute(`uv`,new G(s,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.segments,t.thetaStart,t.thetaLength)}},Ga=class e extends Si{constructor(e=1,t=1,n=1,r=32,i=1,a=!1,o=0,s=Math.PI*2){super(),this.type=`CylinderGeometry`,this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:r,heightSegments:i,openEnded:a,thetaStart:o,thetaLength:s};let c=this;r=Math.floor(r),i=Math.floor(i);let l=[],u=[],d=[],f=[],p=0,m=[],h=n/2,g=0;_(),a===!1&&(e>0&&v(!0),t>0&&v(!1)),this.setIndex(l),this.setAttribute(`position`,new G(u,3)),this.setAttribute(`normal`,new G(d,3)),this.setAttribute(`uv`,new G(f,2));function _(){let a=new H,_=new H,v=0,y=(t-e)/n;for(let c=0;c<=i;c++){let l=[],g=c/i,v=g*(t-e)+e;for(let e=0;e<=r;e++){let t=e/r,i=t*s+o,c=Math.sin(i),m=Math.cos(i);_.x=v*c,_.y=-g*n+h,_.z=v*m,u.push(_.x,_.y,_.z),a.set(c,y,m).normalize(),d.push(a.x,a.y,a.z),f.push(t,1-g),l.push(p++)}m.push(l)}for(let n=0;n<r;n++)for(let r=0;r<i;r++){let a=m[r][n],o=m[r+1][n],s=m[r+1][n+1],c=m[r][n+1];(e>0||r!==0)&&(l.push(a,o,c),v+=3),(t>0||r!==i-1)&&(l.push(o,s,c),v+=3)}c.addGroup(g,v,0),g+=v}function v(n){let i=p,a=new V,m=new H,_=0,v=n===!0?e:t,y=n===!0?1:-1;for(let e=1;e<=r;e++)u.push(0,h*y,0),d.push(0,y,0),f.push(.5,.5),p++;let b=p;for(let e=0;e<=r;e++){let t=e/r*s+o,n=Math.cos(t),i=Math.sin(t);m.x=v*i,m.y=h*y,m.z=v*n,u.push(m.x,m.y,m.z),d.push(0,y,0),a.x=n*.5+.5,a.y=i*.5*y+.5,f.push(a.x,a.y),p++}for(let e=0;e<r;e++){let t=i+e,r=b+e;n===!0?l.push(r,r+1,t):l.push(r+1,r,t),_+=3}c.addGroup(g,_,n===!0?1:2),g+=_}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},Ka=class e extends Ga{constructor(e=1,t=1,n=32,r=1,i=!1,a=0,o=Math.PI*2){super(0,e,t,n,r,i,a,o),this.type=`ConeGeometry`,this.parameters={radius:e,height:t,radialSegments:n,heightSegments:r,openEnded:i,thetaStart:a,thetaLength:o}}static fromJSON(t){return new e(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},qa=class e extends Si{constructor(e=[],t=[],n=1,r=0){super(),this.type=`PolyhedronGeometry`,this.parameters={vertices:e,indices:t,radius:n,detail:r};let i=[],a=[];o(r),c(n),l(),this.setAttribute(`position`,new G(i,3)),this.setAttribute(`normal`,new G(i.slice(),3)),this.setAttribute(`uv`,new G(a,2)),r===0?this.computeVertexNormals():this.normalizeNormals();function o(e){let n=new H,r=new H,i=new H;for(let a=0;a<t.length;a+=3)f(t[a+0],n),f(t[a+1],r),f(t[a+2],i),s(n,r,i,e)}function s(e,t,n,r){let i=r+1,a=[];for(let r=0;r<=i;r++){a[r]=[];let o=e.clone().lerp(n,r/i),s=t.clone().lerp(n,r/i),c=i-r;for(let e=0;e<=c;e++)e===0&&r===i?a[r][e]=o:a[r][e]=o.clone().lerp(s,e/c)}for(let e=0;e<i;e++)for(let t=0;t<2*(i-e)-1;t++){let n=Math.floor(t/2);t%2==0?(d(a[e][n+1]),d(a[e+1][n]),d(a[e][n])):(d(a[e][n+1]),d(a[e+1][n+1]),d(a[e+1][n]))}}function c(e){let t=new H;for(let n=0;n<i.length;n+=3)t.x=i[n+0],t.y=i[n+1],t.z=i[n+2],t.normalize().multiplyScalar(e),i[n+0]=t.x,i[n+1]=t.y,i[n+2]=t.z}function l(){let e=new H;for(let t=0;t<i.length;t+=3){e.x=i[t+0],e.y=i[t+1],e.z=i[t+2];let n=h(e)/2/Math.PI+.5,r=g(e)/Math.PI+.5;a.push(n,1-r)}p(),u()}function u(){for(let e=0;e<a.length;e+=6){let t=a[e+0],n=a[e+2],r=a[e+4];Math.max(t,n,r)>.9&&Math.min(t,n,r)<.1&&(t<.2&&(a[e+0]+=1),n<.2&&(a[e+2]+=1),r<.2&&(a[e+4]+=1))}}function d(e){i.push(e.x,e.y,e.z)}function f(t,n){let r=t*3;n.x=e[r+0],n.y=e[r+1],n.z=e[r+2]}function p(){let e=new H,t=new H,n=new H,r=new H,o=new V,s=new V,c=new V;for(let l=0,u=0;l<i.length;l+=9,u+=6){e.set(i[l+0],i[l+1],i[l+2]),t.set(i[l+3],i[l+4],i[l+5]),n.set(i[l+6],i[l+7],i[l+8]),o.set(a[u+0],a[u+1]),s.set(a[u+2],a[u+3]),c.set(a[u+4],a[u+5]),r.copy(e).add(t).add(n).divideScalar(3);let d=h(r);m(o,u+0,e,d),m(s,u+2,t,d),m(c,u+4,n,d)}}function m(e,t,n,r){r<0&&e.x===1&&(a[t]=e.x-1),n.x===0&&n.z===0&&(a[t]=r/2/Math.PI+.5)}function h(e){return Math.atan2(e.z,-e.x)}function g(e){return Math.atan2(-e.y,Math.sqrt(e.x*e.x+e.z*e.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.vertices,t.indices,t.radius,t.detail)}},Ja=class e extends qa{constructor(e=1,t=0){let n=(1+Math.sqrt(5))/2,r=1/n,i=[-1,-1,-1,-1,-1,1,-1,1,-1,-1,1,1,1,-1,-1,1,-1,1,1,1,-1,1,1,1,0,-r,-n,0,-r,n,0,r,-n,0,r,n,-r,-n,0,-r,n,0,r,-n,0,r,n,0,-n,0,-r,n,0,-r,-n,0,r,n,0,r];super(i,[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9],e,t),this.type=`DodecahedronGeometry`,this.parameters={radius:e,detail:t}}static fromJSON(t){return new e(t.radius,t.detail)}},Ya=class{constructor(){this.type=`Curve`,this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){z(`Curve: .getPoint() not implemented.`)}getPointAt(e,t){let n=this.getUtoTmapping(e);return this.getPoint(n,t)}getPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return t}getSpacedPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPointAt(n/e));return t}getLength(){let e=this.getLengths();return e[e.length-1]}getLengths(e=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===e+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;let t=[],n,r=this.getPoint(0),i=0;t.push(0);for(let a=1;a<=e;a++)n=this.getPoint(a/e),i+=n.distanceTo(r),t.push(i),r=n;return this.cacheArcLengths=t,t}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(e,t=null){let n=this.getLengths(),r=0,i=n.length,a;a=t||e*n[i-1];let o=0,s=i-1,c;for(;o<=s;)if(r=Math.floor(o+(s-o)/2),c=n[r]-a,c<0)o=r+1;else if(c>0)s=r-1;else{s=r;break}if(r=s,n[r]===a)return r/(i-1);let l=n[r],u=n[r+1]-l,d=(a-l)/u;return(r+d)/(i-1)}getTangent(e,t){let n=1e-4,r=e-n,i=e+n;r<0&&(r=0),i>1&&(i=1);let a=this.getPoint(r),o=this.getPoint(i),s=t||(a.isVector2?new V:new H);return s.copy(o).sub(a).normalize(),s}getTangentAt(e,t){let n=this.getUtoTmapping(e);return this.getTangent(n,t)}computeFrenetFrames(e,t=!1){let n=new H,r=[],i=[],a=[],o=new H,s=new qn;for(let t=0;t<=e;t++){let n=t/e;r[t]=this.getTangentAt(n,new H)}i[0]=new H,a[0]=new H;let c=Number.MAX_VALUE,l=Math.abs(r[0].x),u=Math.abs(r[0].y),d=Math.abs(r[0].z);l<=c&&(c=l,n.set(1,0,0)),u<=c&&(c=u,n.set(0,1,0)),d<=c&&n.set(0,0,1),o.crossVectors(r[0],n).normalize(),i[0].crossVectors(r[0],o),a[0].crossVectors(r[0],i[0]);for(let t=1;t<=e;t++){if(i[t]=i[t-1].clone(),a[t]=a[t-1].clone(),o.crossVectors(r[t-1],r[t]),o.length()>2**-52){o.normalize();let e=Math.acos(vn(r[t-1].dot(r[t]),-1,1));i[t].applyMatrix4(s.makeRotationAxis(o,e))}a[t].crossVectors(r[t],i[t])}if(t===!0){let t=Math.acos(vn(i[0].dot(i[e]),-1,1));t/=e,r[0].dot(o.crossVectors(i[0],i[e]))>0&&(t=-t);for(let n=1;n<=e;n++)i[n].applyMatrix4(s.makeRotationAxis(r[n],t*n)),a[n].crossVectors(r[n],i[n])}return{tangents:r,normals:i,binormals:a}}clone(){return new this.constructor().copy(this)}copy(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}toJSON(){let e={metadata:{version:4.7,type:`Curve`,generator:`Curve.toJSON`}};return e.arcLengthDivisions=this.arcLengthDivisions,e.type=this.type,e}fromJSON(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}},Xa=class extends Ya{constructor(e=0,t=0,n=1,r=1,i=0,a=Math.PI*2,o=!1,s=0){super(),this.isEllipseCurve=!0,this.type=`EllipseCurve`,this.aX=e,this.aY=t,this.xRadius=n,this.yRadius=r,this.aStartAngle=i,this.aEndAngle=a,this.aClockwise=o,this.aRotation=s}getPoint(e,t=new V){let n=t,r=Math.PI*2,i=this.aEndAngle-this.aStartAngle,a=Math.abs(i)<2**-52;for(;i<0;)i+=r;for(;i>r;)i-=r;i<2**-52&&(i=a?0:r),this.aClockwise===!0&&!a&&(i===r?i=-r:i-=r);let o=this.aStartAngle+e*i,s=this.aX+this.xRadius*Math.cos(o),c=this.aY+this.yRadius*Math.sin(o);if(this.aRotation!==0){let e=Math.cos(this.aRotation),t=Math.sin(this.aRotation),n=s-this.aX,r=c-this.aY;s=n*e-r*t+this.aX,c=n*t+r*e+this.aY}return n.set(s,c)}copy(e){return super.copy(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}toJSON(){let e=super.toJSON();return e.aX=this.aX,e.aY=this.aY,e.xRadius=this.xRadius,e.yRadius=this.yRadius,e.aStartAngle=this.aStartAngle,e.aEndAngle=this.aEndAngle,e.aClockwise=this.aClockwise,e.aRotation=this.aRotation,e}fromJSON(e){return super.fromJSON(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}},Za=class extends Xa{constructor(e,t,n,r,i,a){super(e,t,n,n,r,i,a),this.isArcCurve=!0,this.type=`ArcCurve`}};function Qa(){let e=0,t=0,n=0,r=0;function i(i,a,o,s){e=i,t=o,n=-3*i+3*a-2*o-s,r=2*i-2*a+o+s}return{initCatmullRom:function(e,t,n,r,a){i(t,n,a*(n-e),a*(r-t))},initNonuniformCatmullRom:function(e,t,n,r,a,o,s){let c=(t-e)/a-(n-e)/(a+o)+(n-t)/o,l=(n-t)/o-(r-t)/(o+s)+(r-n)/s;c*=o,l*=o,i(t,n,c,l)},calc:function(i){let a=i*i,o=a*i;return e+t*i+n*a+r*o}}}var $a=new H,eo=new Qa,to=new Qa,no=new Qa,ro=class extends Ya{constructor(e=[],t=!1,n=`centripetal`,r=.5){super(),this.isCatmullRomCurve3=!0,this.type=`CatmullRomCurve3`,this.points=e,this.closed=t,this.curveType=n,this.tension=r}getPoint(e,t=new H){let n=t,r=this.points,i=r.length,a=(i-+!this.closed)*e,o=Math.floor(a),s=a-o;this.closed?o+=o>0?0:(Math.floor(Math.abs(o)/i)+1)*i:s===0&&o===i-1&&(o=i-2,s=1);let c,l;this.closed||o>0?c=r[(o-1)%i]:($a.subVectors(r[0],r[1]).add(r[0]),c=$a);let u=r[o%i],d=r[(o+1)%i];if(this.closed||o+2<i?l=r[(o+2)%i]:($a.subVectors(r[i-1],r[i-2]).add(r[i-1]),l=$a),this.curveType===`centripetal`||this.curveType===`chordal`){let e=this.curveType===`chordal`?.5:.25,t=c.distanceToSquared(u)**+e,n=u.distanceToSquared(d)**+e,r=d.distanceToSquared(l)**+e;n<1e-4&&(n=1),t<1e-4&&(t=n),r<1e-4&&(r=n),eo.initNonuniformCatmullRom(c.x,u.x,d.x,l.x,t,n,r),to.initNonuniformCatmullRom(c.y,u.y,d.y,l.y,t,n,r),no.initNonuniformCatmullRom(c.z,u.z,d.z,l.z,t,n,r)}else this.curveType===`catmullrom`&&(eo.initCatmullRom(c.x,u.x,d.x,l.x,this.tension),to.initCatmullRom(c.y,u.y,d.y,l.y,this.tension),no.initCatmullRom(c.z,u.z,d.z,l.z,this.tension));return n.set(eo.calc(s),to.calc(s),no.calc(s)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(n.clone())}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let n=this.points[t];e.points.push(n.toArray())}return e.closed=this.closed,e.curveType=this.curveType,e.tension=this.tension,e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(new H().fromArray(n))}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}};function io(e,t,n,r,i){let a=(r-t)*.5,o=(i-n)*.5,s=e*e,c=e*s;return(2*n-2*r+a+o)*c+(-3*n+3*r-2*a-o)*s+a*e+n}function ao(e,t){let n=1-e;return n*n*t}function oo(e,t){return 2*(1-e)*e*t}function so(e,t){return e*e*t}function co(e,t,n,r){return ao(e,t)+oo(e,n)+so(e,r)}function lo(e,t){let n=1-e;return n*n*n*t}function uo(e,t){let n=1-e;return 3*n*n*e*t}function fo(e,t){return 3*(1-e)*e*e*t}function po(e,t){return e*e*e*t}function mo(e,t,n,r,i){return lo(e,t)+uo(e,n)+fo(e,r)+po(e,i)}var ho=class extends Ya{constructor(e=new V,t=new V,n=new V,r=new V){super(),this.isCubicBezierCurve=!0,this.type=`CubicBezierCurve`,this.v0=e,this.v1=t,this.v2=n,this.v3=r}getPoint(e,t=new V){let n=t,r=this.v0,i=this.v1,a=this.v2,o=this.v3;return n.set(mo(e,r.x,i.x,a.x,o.x),mo(e,r.y,i.y,a.y,o.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}},go=class extends Ya{constructor(e=new H,t=new H,n=new H,r=new H){super(),this.isCubicBezierCurve3=!0,this.type=`CubicBezierCurve3`,this.v0=e,this.v1=t,this.v2=n,this.v3=r}getPoint(e,t=new H){let n=t,r=this.v0,i=this.v1,a=this.v2,o=this.v3;return n.set(mo(e,r.x,i.x,a.x,o.x),mo(e,r.y,i.y,a.y,o.y),mo(e,r.z,i.z,a.z,o.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}},_o=class extends Ya{constructor(e=new V,t=new V){super(),this.isLineCurve=!0,this.type=`LineCurve`,this.v1=e,this.v2=t}getPoint(e,t=new V){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new V){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},vo=class extends Ya{constructor(e=new H,t=new H){super(),this.isLineCurve3=!0,this.type=`LineCurve3`,this.v1=e,this.v2=t}getPoint(e,t=new H){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new H){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},yo=class extends Ya{constructor(e=new V,t=new V,n=new V){super(),this.isQuadraticBezierCurve=!0,this.type=`QuadraticBezierCurve`,this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new V){let n=t,r=this.v0,i=this.v1,a=this.v2;return n.set(co(e,r.x,i.x,a.x),co(e,r.y,i.y,a.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},bo=class extends Ya{constructor(e=new H,t=new H,n=new H){super(),this.isQuadraticBezierCurve3=!0,this.type=`QuadraticBezierCurve3`,this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new H){let n=t,r=this.v0,i=this.v1,a=this.v2;return n.set(co(e,r.x,i.x,a.x),co(e,r.y,i.y,a.y),co(e,r.z,i.z,a.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},xo=class extends Ya{constructor(e=[]){super(),this.isSplineCurve=!0,this.type=`SplineCurve`,this.points=e}getPoint(e,t=new V){let n=t,r=this.points,i=(r.length-1)*e,a=Math.floor(i),o=i-a,s=r[a===0?a:a-1],c=r[a],l=r[a>r.length-2?r.length-1:a+1],u=r[a>r.length-3?r.length-1:a+2];return n.set(io(o,s.x,c.x,l.x,u.x),io(o,s.y,c.y,l.y,u.y)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(n.clone())}return this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let n=this.points[t];e.points.push(n.toArray())}return e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let n=e.points[t];this.points.push(new V().fromArray(n))}return this}},So=Object.freeze({__proto__:null,ArcCurve:Za,CatmullRomCurve3:ro,CubicBezierCurve:ho,CubicBezierCurve3:go,EllipseCurve:Xa,LineCurve:_o,LineCurve3:vo,QuadraticBezierCurve:yo,QuadraticBezierCurve3:bo,SplineCurve:xo}),Co=class extends Ya{constructor(){super(),this.type=`CurvePath`,this.curves=[],this.autoClose=!1}add(e){this.curves.push(e)}closePath(){let e=this.curves[0].getPoint(0),t=this.curves[this.curves.length-1].getPoint(1);if(!e.equals(t)){let n=e.isVector2===!0?`LineCurve`:`LineCurve3`;this.curves.push(new So[n](t,e))}return this}getPoint(e,t){let n=e*this.getLength(),r=this.getCurveLengths(),i=0;for(;i<r.length;){if(r[i]>=n){let e=r[i]-n,a=this.curves[i],o=a.getLength(),s=o===0?0:1-e/o;return a.getPointAt(s,t)}i++}return null}getLength(){let e=this.getCurveLengths();return e[e.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;let e=[],t=0;for(let n=0,r=this.curves.length;n<r;n++)t+=this.curves[n].getLength(),e.push(t);return this.cacheLengths=e,e}getSpacedPoints(e=40){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return this.autoClose&&t.push(t[0]),t}getPoints(e=12){let t=[],n;for(let r=0,i=this.curves;r<i.length;r++){let a=i[r],o=a.isEllipseCurve?e*2:a.isLineCurve||a.isLineCurve3?1:a.isSplineCurve?e*a.points.length:e,s=a.getPoints(o);for(let e=0;e<s.length;e++){let r=s[e];n&&n.equals(r)||(t.push(r),n=r)}}return this.autoClose&&t.length>1&&!t[t.length-1].equals(t[0])&&t.push(t[0]),t}copy(e){super.copy(e),this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let n=e.curves[t];this.curves.push(n.clone())}return this.autoClose=e.autoClose,this}toJSON(){let e=super.toJSON();e.autoClose=this.autoClose,e.curves=[];for(let t=0,n=this.curves.length;t<n;t++){let n=this.curves[t];e.curves.push(n.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.autoClose=e.autoClose,this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let n=e.curves[t];this.curves.push(new So[n.type]().fromJSON(n))}return this}},wo=class extends Co{constructor(e){super(),this.type=`Path`,this.currentPoint=new V,e&&this.setFromPoints(e)}setFromPoints(e){this.moveTo(e[0].x,e[0].y);for(let t=1,n=e.length;t<n;t++)this.lineTo(e[t].x,e[t].y);return this}moveTo(e,t){return this.currentPoint.set(e,t),this}lineTo(e,t){let n=new _o(this.currentPoint.clone(),new V(e,t));return this.curves.push(n),this.currentPoint.set(e,t),this}quadraticCurveTo(e,t,n,r){let i=new yo(this.currentPoint.clone(),new V(e,t),new V(n,r));return this.curves.push(i),this.currentPoint.set(n,r),this}bezierCurveTo(e,t,n,r,i,a){let o=new ho(this.currentPoint.clone(),new V(e,t),new V(n,r),new V(i,a));return this.curves.push(o),this.currentPoint.set(i,a),this}splineThru(e){let t=new xo([this.currentPoint.clone()].concat(e));return this.curves.push(t),this.currentPoint.copy(e[e.length-1]),this}arc(e,t,n,r,i,a){let o=this.currentPoint.x,s=this.currentPoint.y;return this.absarc(e+o,t+s,n,r,i,a),this}absarc(e,t,n,r,i,a){return this.absellipse(e,t,n,n,r,i,a),this}ellipse(e,t,n,r,i,a,o,s){let c=this.currentPoint.x,l=this.currentPoint.y;return this.absellipse(e+c,t+l,n,r,i,a,o,s),this}absellipse(e,t,n,r,i,a,o,s){let c=new Xa(e,t,n,r,i,a,o,s);if(this.curves.length>0){let e=c.getPoint(0);e.equals(this.currentPoint)||this.lineTo(e.x,e.y)}this.curves.push(c);let l=c.getPoint(1);return this.currentPoint.copy(l),this}copy(e){return super.copy(e),this.currentPoint.copy(e.currentPoint),this}toJSON(){let e=super.toJSON();return e.currentPoint=this.currentPoint.toArray(),e}fromJSON(e){return super.fromJSON(e),this.currentPoint.fromArray(e.currentPoint),this}},To=class extends wo{constructor(e){super(e),this.uuid=_n(),this.type=`Shape`,this.holes=[]}getPointsHoles(e){let t=[];for(let n=0,r=this.holes.length;n<r;n++)t[n]=this.holes[n].getPoints(e);return t}extractPoints(e){return{shape:this.getPoints(e),holes:this.getPointsHoles(e)}}copy(e){super.copy(e),this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){let n=e.holes[t];this.holes.push(n.clone())}return this}toJSON(){let e=super.toJSON();e.uuid=this.uuid,e.holes=[];for(let t=0,n=this.holes.length;t<n;t++){let n=this.holes[t];e.holes.push(n.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.uuid=e.uuid,this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){let n=e.holes[t];this.holes.push(new wo().fromJSON(n))}return this}};function Eo(e,t,n=2){let r=t&&t.length,i=r?t[0]*n:e.length,a=Do(e,0,i,n,!0),o=[];if(!a||a.next===a.prev)return o;let s,c,l;if(r&&(a=Po(e,t,a,n)),e.length>80*n){s=e[0],c=e[1];let t=s,r=c;for(let a=n;a<i;a+=n){let n=e[a],i=e[a+1];n<s&&(s=n),i<c&&(c=i),n>t&&(t=n),i>r&&(r=i)}l=Math.max(t-s,r-c),l=l===0?0:32767/l}return ko(a,o,n,s,c,l,0),o}function Do(e,t,n,r,i){let a;if(i===is(e,t,n,r)>0)for(let i=t;i<n;i+=r)a=ts(i/r|0,e[i],e[i+1],a);else for(let i=n-r;i>=t;i-=r)a=ts(i/r|0,e[i],e[i+1],a);return a&&qo(a,a.next)&&(ns(a),a=a.next),a}function Oo(e,t){if(!e)return e;t||=e;let n=e,r;do if(r=!1,!n.steiner&&(qo(n,n.next)||Ko(n.prev,n,n.next)===0)){if(ns(n),n=t=n.prev,n===n.next)break;r=!0}else n=n.next;while(r||n!==t);return t}function ko(e,t,n,r,i,a,o){if(!e)return;!o&&a&&zo(e,r,i,a);let s=e;for(;e.prev!==e.next;){let c=e.prev,l=e.next;if(a?jo(e,r,i,a):Ao(e))t.push(c.i,e.i,l.i),ns(e),e=l.next,s=l.next;else if(e=l,e===s){o?o===1?(e=Mo(Oo(e),t),ko(e,t,n,r,i,a,2)):o===2&&No(e,t,n,r,i,a):ko(Oo(e),t,n,r,i,a,1);break}}}function Ao(e){let t=e.prev,n=e,r=e.next;if(Ko(t,n,r)>=0)return!1;let i=t.x,a=n.x,o=r.x,s=t.y,c=n.y,l=r.y,u=Math.min(i,a,o),d=Math.min(s,c,l),f=Math.max(i,a,o),p=Math.max(s,c,l),m=r.next;for(;m!==t;){if(m.x>=u&&m.x<=f&&m.y>=d&&m.y<=p&&Wo(i,s,a,c,o,l,m.x,m.y)&&Ko(m.prev,m,m.next)>=0)return!1;m=m.next}return!0}function jo(e,t,n,r){let i=e.prev,a=e,o=e.next;if(Ko(i,a,o)>=0)return!1;let s=i.x,c=a.x,l=o.x,u=i.y,d=a.y,f=o.y,p=Math.min(s,c,l),m=Math.min(u,d,f),h=Math.max(s,c,l),g=Math.max(u,d,f),_=Vo(p,m,t,n,r),v=Vo(h,g,t,n,r),y=e.prevZ,b=e.nextZ;for(;y&&y.z>=_&&b&&b.z<=v;){if(y.x>=p&&y.x<=h&&y.y>=m&&y.y<=g&&y!==i&&y!==o&&Wo(s,u,c,d,l,f,y.x,y.y)&&Ko(y.prev,y,y.next)>=0||(y=y.prevZ,b.x>=p&&b.x<=h&&b.y>=m&&b.y<=g&&b!==i&&b!==o&&Wo(s,u,c,d,l,f,b.x,b.y)&&Ko(b.prev,b,b.next)>=0))return!1;b=b.nextZ}for(;y&&y.z>=_;){if(y.x>=p&&y.x<=h&&y.y>=m&&y.y<=g&&y!==i&&y!==o&&Wo(s,u,c,d,l,f,y.x,y.y)&&Ko(y.prev,y,y.next)>=0)return!1;y=y.prevZ}for(;b&&b.z<=v;){if(b.x>=p&&b.x<=h&&b.y>=m&&b.y<=g&&b!==i&&b!==o&&Wo(s,u,c,d,l,f,b.x,b.y)&&Ko(b.prev,b,b.next)>=0)return!1;b=b.nextZ}return!0}function Mo(e,t){let n=e;do{let r=n.prev,i=n.next.next;!qo(r,i)&&Jo(r,n,n.next,i)&&Qo(r,i)&&Qo(i,r)&&(t.push(r.i,n.i,i.i),ns(n),ns(n.next),n=e=i),n=n.next}while(n!==e);return Oo(n)}function No(e,t,n,r,i,a){let o=e;do{let e=o.next.next;for(;e!==o.prev;){if(o.i!==e.i&&Go(o,e)){let s=es(o,e);o=Oo(o,o.next),s=Oo(s,s.next),ko(o,t,n,r,i,a,0),ko(s,t,n,r,i,a,0);return}e=e.next}o=o.next}while(o!==e)}function Po(e,t,n,r){let i=[];for(let n=0,a=t.length;n<a;n++){let o=Do(e,t[n]*r,n<a-1?t[n+1]*r:e.length,r,!1);o===o.next&&(o.steiner=!0),i.push(Ho(o))}i.sort(Fo);for(let e=0;e<i.length;e++)n=Io(i[e],n);return n}function Fo(e,t){let n=e.x-t.x;return n===0&&(n=e.y-t.y,n===0&&(n=(e.next.y-e.y)/(e.next.x-e.x)-(t.next.y-t.y)/(t.next.x-t.x))),n}function Io(e,t){let n=Lo(e,t);if(!n)return t;let r=es(n,e);return Oo(r,r.next),Oo(n,n.next)}function Lo(e,t){let n=t,r=e.x,i=e.y,a=-1/0,o;if(qo(e,n))return n;do{if(qo(e,n.next))return n.next;if(i<=n.y&&i>=n.next.y&&n.next.y!==n.y){let e=n.x+(i-n.y)*(n.next.x-n.x)/(n.next.y-n.y);if(e<=r&&e>a&&(a=e,o=n.x<n.next.x?n:n.next,e===r))return o}n=n.next}while(n!==t);if(!o)return null;let s=o,c=o.x,l=o.y,u=1/0;n=o;do{if(r>=n.x&&n.x>=c&&r!==n.x&&Uo(i<l?r:a,i,c,l,i<l?a:r,i,n.x,n.y)){let t=Math.abs(i-n.y)/(r-n.x);Qo(n,e)&&(t<u||t===u&&(n.x>o.x||n.x===o.x&&Ro(o,n)))&&(o=n,u=t)}n=n.next}while(n!==s);return o}function Ro(e,t){return Ko(e.prev,e,t.prev)<0&&Ko(t.next,e,e.next)<0}function zo(e,t,n,r){let i=e;do i.z===0&&(i.z=Vo(i.x,i.y,t,n,r)),i.prevZ=i.prev,i.nextZ=i.next,i=i.next;while(i!==e);i.prevZ.nextZ=null,i.prevZ=null,Bo(i)}function Bo(e){let t,n=1;do{let r=e,i;e=null;let a=null;for(t=0;r;){t++;let o=r,s=0;for(let e=0;e<n&&(s++,o=o.nextZ,o);e++);let c=n;for(;s>0||c>0&&o;)s!==0&&(c===0||!o||r.z<=o.z)?(i=r,r=r.nextZ,s--):(i=o,o=o.nextZ,c--),a?a.nextZ=i:e=i,i.prevZ=a,a=i;r=o}a.nextZ=null,n*=2}while(t>1);return e}function Vo(e,t,n,r,i){return e=(e-n)*i|0,t=(t-r)*i|0,e=(e|e<<8)&16711935,e=(e|e<<4)&252645135,e=(e|e<<2)&858993459,e=(e|e<<1)&1431655765,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,e|t<<1}function Ho(e){let t=e,n=e;do(t.x<n.x||t.x===n.x&&t.y<n.y)&&(n=t),t=t.next;while(t!==e);return n}function Uo(e,t,n,r,i,a,o,s){return(i-o)*(t-s)>=(e-o)*(a-s)&&(e-o)*(r-s)>=(n-o)*(t-s)&&(n-o)*(a-s)>=(i-o)*(r-s)}function Wo(e,t,n,r,i,a,o,s){return(e!==o||t!==s)&&Uo(e,t,n,r,i,a,o,s)}function Go(e,t){return e.next.i!==t.i&&e.prev.i!==t.i&&!Zo(e,t)&&(Qo(e,t)&&Qo(t,e)&&$o(e,t)&&(Ko(e.prev,e,t.prev)||Ko(e,t.prev,t))||qo(e,t)&&Ko(e.prev,e,e.next)>0&&Ko(t.prev,t,t.next)>0)}function Ko(e,t,n){return(t.y-e.y)*(n.x-t.x)-(t.x-e.x)*(n.y-t.y)}function qo(e,t){return e.x===t.x&&e.y===t.y}function Jo(e,t,n,r){let i=Xo(Ko(e,t,n)),a=Xo(Ko(e,t,r)),o=Xo(Ko(n,r,e)),s=Xo(Ko(n,r,t));return!!(i!==a&&o!==s||i===0&&Yo(e,n,t)||a===0&&Yo(e,r,t)||o===0&&Yo(n,e,r)||s===0&&Yo(n,t,r))}function Yo(e,t,n){return t.x<=Math.max(e.x,n.x)&&t.x>=Math.min(e.x,n.x)&&t.y<=Math.max(e.y,n.y)&&t.y>=Math.min(e.y,n.y)}function Xo(e){return e>0?1:e<0?-1:0}function Zo(e,t){let n=e;do{if(n.i!==e.i&&n.next.i!==e.i&&n.i!==t.i&&n.next.i!==t.i&&Jo(n,n.next,e,t))return!0;n=n.next}while(n!==e);return!1}function Qo(e,t){return Ko(e.prev,e,e.next)<0?Ko(e,t,e.next)>=0&&Ko(e,e.prev,t)>=0:Ko(e,t,e.prev)<0||Ko(e,e.next,t)<0}function $o(e,t){let n=e,r=!1,i=(e.x+t.x)/2,a=(e.y+t.y)/2;do n.y>a!=n.next.y>a&&n.next.y!==n.y&&i<(n.next.x-n.x)*(a-n.y)/(n.next.y-n.y)+n.x&&(r=!r),n=n.next;while(n!==e);return r}function es(e,t){let n=rs(e.i,e.x,e.y),r=rs(t.i,t.x,t.y),i=e.next,a=t.prev;return e.next=t,t.prev=e,n.next=i,i.prev=n,r.next=n,n.prev=r,a.next=r,r.prev=a,r}function ts(e,t,n,r){let i=rs(e,t,n);return r?(i.next=r.next,i.prev=r,r.next.prev=i,r.next=i):(i.prev=i,i.next=i),i}function ns(e){e.next.prev=e.prev,e.prev.next=e.next,e.prevZ&&(e.prevZ.nextZ=e.nextZ),e.nextZ&&(e.nextZ.prevZ=e.prevZ)}function rs(e,t,n){return{i:e,x:t,y:n,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}function is(e,t,n,r){let i=0;for(let a=t,o=n-r;a<n;a+=r)i+=(e[o]-e[a])*(e[a+1]+e[o+1]),o=a;return i}var as=class{static triangulate(e,t,n=2){return Eo(e,t,n)}},os=class e{static area(e){let t=e.length,n=0;for(let r=t-1,i=0;i<t;r=i++)n+=e[r].x*e[i].y-e[i].x*e[r].y;return n*.5}static isClockWise(t){return e.area(t)<0}static triangulateShape(e,t){let n=[],r=[],i=[];ss(e),cs(n,e);let a=e.length;t.forEach(ss);for(let e=0;e<t.length;e++)r.push(a),a+=t[e].length,cs(n,t[e]);let o=as.triangulate(n,r);for(let e=0;e<o.length;e+=3)i.push(o.slice(e,e+3));return i}};function ss(e){let t=e.length;t>2&&e[t-1].equals(e[0])&&e.pop()}function cs(e,t){for(let n=0;n<t.length;n++)e.push(t[n].x),e.push(t[n].y)}var ls=class e extends Si{constructor(e=new To([new V(.5,.5),new V(-.5,.5),new V(-.5,-.5),new V(.5,-.5)]),t={}){super(),this.type=`ExtrudeGeometry`,this.parameters={shapes:e,options:t},e=Array.isArray(e)?e:[e];let n=this,r=[],i=[];for(let t=0,n=e.length;t<n;t++){let n=e[t];a(n)}this.setAttribute(`position`,new G(r,3)),this.setAttribute(`uv`,new G(i,2)),this.computeVertexNormals();function a(e){let a=[],o=t.curveSegments===void 0?12:t.curveSegments,s=t.steps===void 0?1:t.steps,c=t.depth===void 0?1:t.depth,l=t.bevelEnabled===void 0||t.bevelEnabled,u=t.bevelThickness===void 0?.2:t.bevelThickness,d=t.bevelSize===void 0?u-.1:t.bevelSize,f=t.bevelOffset===void 0?0:t.bevelOffset,p=t.bevelSegments===void 0?3:t.bevelSegments,m=t.extrudePath,h=t.UVGenerator===void 0?us:t.UVGenerator,g,_=!1,v,y,b,x;if(m){g=m.getSpacedPoints(s),_=!0,l=!1;let e=m.isCatmullRomCurve3?m.closed:!1;v=m.computeFrenetFrames(s,e),y=new H,b=new H,x=new H}l||(p=0,u=0,d=0,f=0);let S=e.extractPoints(o),C=S.shape,w=S.holes;if(!os.isClockWise(C)){C=C.reverse();for(let e=0,t=w.length;e<t;e++){let t=w[e];os.isClockWise(t)&&(w[e]=t.reverse())}}function T(e){let t=e[0];for(let n=1;n<=e.length;n++){let r=n%e.length,i=e[r],a=i.x-t.x,o=i.y-t.y,s=a*a+o*o,c=Math.max(Math.abs(i.x),Math.abs(i.y),Math.abs(t.x),Math.abs(t.y));s<=10000000000000001e-36*c*c?(e.splice(r,1),n--):t=i}}T(C),w.forEach(T);let E=w.length,D=C;for(let e=0;e<E;e++){let t=w[e];C=C.concat(t)}function O(e,t,n){return t||B(`ExtrudeGeometry: vec does not exist`),e.clone().addScaledVector(t,n)}let k=C.length;function A(e,t,n){let r,i,a,o=e.x-t.x,s=e.y-t.y,c=n.x-e.x,l=n.y-e.y,u=o*o+s*s,d=o*l-s*c;if(Math.abs(d)>2**-52){let d=Math.sqrt(u),f=Math.sqrt(c*c+l*l),p=t.x-s/d,m=t.y+o/d,h=n.x-l/f,g=n.y+c/f,_=((h-p)*l-(g-m)*c)/(o*l-s*c);r=p+o*_-e.x,i=m+s*_-e.y;let v=r*r+i*i;if(v<=2)return new V(r,i);a=Math.sqrt(v/2)}else{let e=!1;o>2**-52?c>2**-52&&(e=!0):o<-(2**-52)?c<-(2**-52)&&(e=!0):Math.sign(s)===Math.sign(l)&&(e=!0),e?(r=-s,i=o,a=Math.sqrt(u)):(r=o,i=s,a=Math.sqrt(u/2))}return new V(r/a,i/a)}let j=[];for(let e=0,t=D.length,n=t-1,r=e+1;e<t;e++,n++,r++)n===t&&(n=0),r===t&&(r=0),j[e]=A(D[e],D[n],D[r]);let M=[],N,ee=j.concat();for(let e=0,t=E;e<t;e++){let t=w[e];N=[];for(let e=0,n=t.length,r=n-1,i=e+1;e<n;e++,r++,i++)r===n&&(r=0),i===n&&(i=0),N[e]=A(t[e],t[r],t[i]);M.push(N),ee=ee.concat(N)}let P;if(p===0)P=os.triangulateShape(D,w);else{let e=[],t=[];for(let n=0;n<p;n++){let r=n/p,i=u*Math.cos(r*Math.PI/2),a=d*Math.sin(r*Math.PI/2)+f;for(let t=0,n=D.length;t<n;t++){let n=O(D[t],j[t],a);oe(n.x,n.y,-i),r===0&&e.push(n)}for(let e=0,n=E;e<n;e++){let n=w[e];N=M[e];let o=[];for(let e=0,t=n.length;e<t;e++){let t=O(n[e],N[e],a);oe(t.x,t.y,-i),r===0&&o.push(t)}r===0&&t.push(o)}}P=os.triangulateShape(e,t)}let te=P.length,ne=d+f;for(let e=0;e<k;e++){let t=l?O(C[e],ee[e],ne):C[e];_?(b.copy(v.normals[0]).multiplyScalar(t.x),y.copy(v.binormals[0]).multiplyScalar(t.y),x.copy(g[0]).add(b).add(y),oe(x.x,x.y,x.z)):oe(t.x,t.y,0)}for(let e=1;e<=s;e++)for(let t=0;t<k;t++){let n=l?O(C[t],ee[t],ne):C[t];_?(b.copy(v.normals[e]).multiplyScalar(n.x),y.copy(v.binormals[e]).multiplyScalar(n.y),x.copy(g[e]).add(b).add(y),oe(x.x,x.y,x.z)):oe(n.x,n.y,c/s*e)}for(let e=p-1;e>=0;e--){let t=e/p,n=u*Math.cos(t*Math.PI/2),r=d*Math.sin(t*Math.PI/2)+f;for(let e=0,t=D.length;e<t;e++){let t=O(D[e],j[e],r);oe(t.x,t.y,c+n)}for(let e=0,t=w.length;e<t;e++){let t=w[e];N=M[e];for(let e=0,i=t.length;e<i;e++){let i=O(t[e],N[e],r);_?oe(i.x,i.y+g[s-1].y,g[s-1].x+n):oe(i.x,i.y,c+n)}}}re(),ie();function re(){let e=r.length/3;if(l){let e=0,t=k*e;for(let e=0;e<te;e++){let n=P[e];F(n[2]+t,n[1]+t,n[0]+t)}e=s+p*2,t=k*e;for(let e=0;e<te;e++){let n=P[e];F(n[0]+t,n[1]+t,n[2]+t)}}else{for(let e=0;e<te;e++){let t=P[e];F(t[2],t[1],t[0])}for(let e=0;e<te;e++){let t=P[e];F(t[0]+k*s,t[1]+k*s,t[2]+k*s)}}n.addGroup(e,r.length/3-e,0)}function ie(){let e=r.length/3,t=0;ae(D,t),t+=D.length;for(let e=0,n=w.length;e<n;e++){let n=w[e];ae(n,t),t+=n.length}n.addGroup(e,r.length/3-e,1)}function ae(e,t){let n=e.length;for(;--n>=0;){let r=n,i=n-1;i<0&&(i=e.length-1);for(let e=0,n=s+p*2;e<n;e++){let n=k*e,a=k*(e+1);se(t+r+n,t+i+n,t+i+a,t+r+a)}}}function oe(e,t,n){a.push(e),a.push(t),a.push(n)}function F(e,t,i){ce(e),ce(t),ce(i);let a=r.length/3,o=h.generateTopUV(n,r,a-3,a-2,a-1);le(o[0]),le(o[1]),le(o[2])}function se(e,t,i,a){ce(e),ce(t),ce(a),ce(t),ce(i),ce(a);let o=r.length/3,s=h.generateSideWallUV(n,r,o-6,o-3,o-2,o-1);le(s[0]),le(s[1]),le(s[3]),le(s[1]),le(s[2]),le(s[3])}function ce(e){r.push(a[e*3+0]),r.push(a[e*3+1]),r.push(a[e*3+2])}function le(e){i.push(e.x),i.push(e.y)}}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}toJSON(){let e=super.toJSON(),t=this.parameters.shapes,n=this.parameters.options;return ds(t,n,e)}static fromJSON(t,n){let r=[];for(let e=0,i=t.shapes.length;e<i;e++){let i=n[t.shapes[e]];r.push(i)}let i=t.options.extrudePath;return i!==void 0&&(t.options.extrudePath=new So[i.type]().fromJSON(i)),new e(r,t.options)}},us={generateTopUV:function(e,t,n,r,i){let a=t[n*3],o=t[n*3+1],s=t[r*3],c=t[r*3+1],l=t[i*3],u=t[i*3+1];return[new V(a,o),new V(s,c),new V(l,u)]},generateSideWallUV:function(e,t,n,r,i,a){let o=t[n*3],s=t[n*3+1],c=t[n*3+2],l=t[r*3],u=t[r*3+1],d=t[r*3+2],f=t[i*3],p=t[i*3+1],m=t[i*3+2],h=t[a*3],g=t[a*3+1],_=t[a*3+2];return Math.abs(s-u)<Math.abs(o-l)?[new V(o,1-c),new V(l,1-d),new V(f,1-m),new V(h,1-_)]:[new V(s,1-c),new V(u,1-d),new V(p,1-m),new V(g,1-_)]}};function ds(e,t,n){if(n.shapes=[],Array.isArray(e))for(let t=0,r=e.length;t<r;t++){let r=e[t];n.shapes.push(r.uuid)}else n.shapes.push(e.uuid);return n.options=Object.assign({},t),t.extrudePath!==void 0&&(n.options.extrudePath=t.extrudePath.toJSON()),n}var fs=class e extends qa{constructor(e=1,t=0){let n=(1+Math.sqrt(5))/2,r=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1];super(r,[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1],e,t),this.type=`IcosahedronGeometry`,this.parameters={radius:e,detail:t}}static fromJSON(t){return new e(t.radius,t.detail)}},ps=class e extends Si{constructor(e=[new V(0,-.5),new V(.5,0),new V(0,.5)],t=12,n=0,r=Math.PI*2){super(),this.type=`LatheGeometry`,this.parameters={points:e,segments:t,phiStart:n,phiLength:r},t=Math.floor(t),r=vn(r,0,Math.PI*2);let i=[],a=[],o=[],s=[],c=[],l=1/t,u=new H,d=new V,f=new H,p=new H,m=new H,h=0,g=0;for(let t=0;t<=e.length-1;t++)switch(t){case 0:h=e[t+1].x-e[t].x,g=e[t+1].y-e[t].y,f.x=g*1,f.y=-h,f.z=g*0,m.copy(f),f.normalize(),s.push(f.x,f.y,f.z);break;case e.length-1:s.push(m.x,m.y,m.z);break;default:h=e[t+1].x-e[t].x,g=e[t+1].y-e[t].y,f.x=g*1,f.y=-h,f.z=g*0,p.copy(f),f.x+=m.x,f.y+=m.y,f.z+=m.z,f.normalize(),s.push(f.x,f.y,f.z),m.copy(p)}for(let i=0;i<=t;i++){let f=n+i*l*r,p=Math.sin(f),m=Math.cos(f);for(let n=0;n<=e.length-1;n++){u.x=e[n].x*p,u.y=e[n].y,u.z=e[n].x*m,a.push(u.x,u.y,u.z),d.x=i/t,d.y=n/(e.length-1),o.push(d.x,d.y);let r=s[3*n+0]*p,l=s[3*n+1],f=s[3*n+0]*m;c.push(r,l,f)}}for(let n=0;n<t;n++)for(let t=0;t<e.length-1;t++){let r=t+n*e.length,a=r,o=r+e.length,s=r+e.length+1,c=r+1;i.push(a,o,c),i.push(s,c,o)}this.setIndex(i),this.setAttribute(`position`,new G(a,3)),this.setAttribute(`uv`,new G(o,2)),this.setAttribute(`normal`,new G(c,3))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.points,t.segments,t.phiStart,t.phiLength)}},ms=class e extends Si{constructor(e=1,t=1,n=1,r=1){super(),this.type=`PlaneGeometry`,this.parameters={width:e,height:t,widthSegments:n,heightSegments:r};let i=e/2,a=t/2,o=Math.floor(n),s=Math.floor(r),c=o+1,l=s+1,u=e/o,d=t/s,f=[],p=[],m=[],h=[];for(let e=0;e<l;e++){let t=e*d-a;for(let n=0;n<c;n++){let r=n*u-i;p.push(r,-t,0),m.push(0,0,1),h.push(n/o),h.push(1-e/s)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=t+c*e,r=t+c*(e+1),i=t+1+c*(e+1),a=t+1+c*e;f.push(n,r,a),f.push(r,i,a)}this.setIndex(f),this.setAttribute(`position`,new G(p,3)),this.setAttribute(`normal`,new G(m,3)),this.setAttribute(`uv`,new G(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.widthSegments,t.heightSegments)}},hs=class e extends Si{constructor(e=.5,t=1,n=32,r=1,i=0,a=Math.PI*2){super(),this.type=`RingGeometry`,this.parameters={innerRadius:e,outerRadius:t,thetaSegments:n,phiSegments:r,thetaStart:i,thetaLength:a},n=Math.max(3,n),r=Math.max(1,r);let o=[],s=[],c=[],l=[],u=e,d=(t-e)/r,f=new H,p=new V;for(let e=0;e<=r;e++){for(let e=0;e<=n;e++){let r=i+e/n*a;f.x=u*Math.cos(r),f.y=u*Math.sin(r),s.push(f.x,f.y,f.z),c.push(0,0,1),p.x=(f.x/t+1)/2,p.y=(f.y/t+1)/2,l.push(p.x,p.y)}u+=d}for(let e=0;e<r;e++){let t=e*(n+1);for(let e=0;e<n;e++){let r=e+t,i=r,a=r+n+1,s=r+n+2,c=r+1;o.push(i,a,c),o.push(a,s,c)}}this.setIndex(o),this.setAttribute(`position`,new G(s,3)),this.setAttribute(`normal`,new G(c,3)),this.setAttribute(`uv`,new G(l,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}},gs=class e extends Si{constructor(e=1,t=32,n=16,r=0,i=Math.PI*2,a=0,o=Math.PI){super(),this.type=`SphereGeometry`,this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:r,phiLength:i,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let s=Math.min(a+o,Math.PI),c=0,l=[],u=new H,d=new H,f=[],p=[],m=[],h=[];for(let f=0;f<=n;f++){let g=[],_=f/n,v=0;f===0&&a===0?v=.5/t:f===n&&s===Math.PI&&(v=-.5/t);for(let n=0;n<=t;n++){let s=n/t;u.x=-e*Math.cos(r+s*i)*Math.sin(a+_*o),u.y=e*Math.cos(a+_*o),u.z=e*Math.sin(r+s*i)*Math.sin(a+_*o),p.push(u.x,u.y,u.z),d.copy(u).normalize(),m.push(d.x,d.y,d.z),h.push(s+v,1-_),g.push(c++)}l.push(g)}for(let e=0;e<n;e++)for(let r=0;r<t;r++){let t=l[e][r+1],i=l[e][r],o=l[e+1][r],c=l[e+1][r+1];(e!==0||a>0)&&f.push(t,i,c),(e!==n-1||s<Math.PI)&&f.push(i,o,c)}this.setIndex(f),this.setAttribute(`position`,new G(p,3)),this.setAttribute(`normal`,new G(m,3)),this.setAttribute(`uv`,new G(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}},_s=class e extends Si{constructor(e=1,t=.4,n=12,r=48,i=Math.PI*2,a=0,o=Math.PI*2){super(),this.type=`TorusGeometry`,this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:r,arc:i,thetaStart:a,thetaLength:o},n=Math.floor(n),r=Math.floor(r);let s=[],c=[],l=[],u=[],d=new H,f=new H,p=new H;for(let s=0;s<=n;s++){let m=a+s/n*o;for(let a=0;a<=r;a++){let o=a/r*i;f.x=(e+t*Math.cos(m))*Math.cos(o),f.y=(e+t*Math.cos(m))*Math.sin(o),f.z=t*Math.sin(m),c.push(f.x,f.y,f.z),d.x=e*Math.cos(o),d.y=e*Math.sin(o),p.subVectors(f,d).normalize(),l.push(p.x,p.y,p.z),u.push(a/r),u.push(s/n)}}for(let e=1;e<=n;e++)for(let t=1;t<=r;t++){let n=(r+1)*e+t-1,i=(r+1)*(e-1)+t-1,a=(r+1)*(e-1)+t,o=(r+1)*e+t;s.push(n,i,o),s.push(i,a,o)}this.setIndex(s),this.setAttribute(`position`,new G(c,3)),this.setAttribute(`normal`,new G(l,3)),this.setAttribute(`uv`,new G(u,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc)}},vs=class e extends Si{constructor(e=new bo(new H(-1,-1,0),new H(-1,1,0),new H(1,1,0)),t=64,n=1,r=8,i=!1){super(),this.type=`TubeGeometry`,this.parameters={path:e,tubularSegments:t,radius:n,radialSegments:r,closed:i};let a=e.computeFrenetFrames(t,i);this.tangents=a.tangents,this.normals=a.normals,this.binormals=a.binormals;let o=new H,s=new H,c=new V,l=new H,u=[],d=[],f=[],p=[];m(),this.setIndex(p),this.setAttribute(`position`,new G(u,3)),this.setAttribute(`normal`,new G(d,3)),this.setAttribute(`uv`,new G(f,2));function m(){for(let e=0;e<t;e++)h(e);h(i===!1?t:0),_(),g()}function h(i){l=e.getPointAt(i/t,l);let c=a.normals[i],f=a.binormals[i];for(let e=0;e<=r;e++){let t=e/r*Math.PI*2,i=Math.sin(t),a=-Math.cos(t);s.x=a*c.x+i*f.x,s.y=a*c.y+i*f.y,s.z=a*c.z+i*f.z,s.normalize(),d.push(s.x,s.y,s.z),o.x=l.x+n*s.x,o.y=l.y+n*s.y,o.z=l.z+n*s.z,u.push(o.x,o.y,o.z)}}function g(){for(let e=1;e<=t;e++)for(let t=1;t<=r;t++){let n=(r+1)*(e-1)+(t-1),i=(r+1)*e+(t-1),a=(r+1)*e+t,o=(r+1)*(e-1)+t;p.push(n,i,o),p.push(i,a,o)}}function _(){for(let e=0;e<=t;e++)for(let n=0;n<=r;n++)c.x=e/t,c.y=n/r,f.push(c.x,c.y)}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}toJSON(){let e=super.toJSON();return e.path=this.parameters.path.toJSON(),e}static fromJSON(t){return new e(new So[t.path.type]().fromJSON(t.path),t.tubularSegments,t.radius,t.radialSegments,t.closed)}};function ys(e){let t={};for(let n in e){t[n]={};for(let r in e[n]){let i=e[n][r];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(z(`UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().`),t[n][r]=null):t[n][r]=i.clone():Array.isArray(i)?t[n][r]=i.slice():t[n][r]=i}}return t}function bs(e){let t={};for(let n=0;n<e.length;n++){let r=ys(e[n]);for(let e in r)t[e]=r[e]}return t}function xs(e){let t=[];for(let n=0;n<e.length;n++)t.push(e[n].clone());return t}function Ss(e){let t=e.getRenderTarget();return t===null?e.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:jn.workingColorSpace}var Cs={clone:ys,merge:bs},ws=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Ts=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Es=class extends Di{constructor(e){super(),this.isShaderMaterial=!0,this.type=`ShaderMaterial`,this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=ws,this.fragmentShader=Ts,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=ys(e.uniforms),this.uniformsGroups=xs(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let n in this.uniforms){let r=this.uniforms[n].value;r&&r.isTexture?t.uniforms[n]={type:`t`,value:r.toJSON(e).uuid}:r&&r.isColor?t.uniforms[n]={type:`c`,value:r.getHex()}:r&&r.isVector2?t.uniforms[n]={type:`v2`,value:r.toArray()}:r&&r.isVector3?t.uniforms[n]={type:`v3`,value:r.toArray()}:r&&r.isVector4?t.uniforms[n]={type:`v4`,value:r.toArray()}:r&&r.isMatrix3?t.uniforms[n]={type:`m3`,value:r.toArray()}:r&&r.isMatrix4?t.uniforms[n]={type:`m4`,value:r.toArray()}:t.uniforms[n]={value:r}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let e in this.extensions)this.extensions[e]===!0&&(n[e]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}},Ds=class extends Es{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type=`RawShaderMaterial`}},Os=class extends Di{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type=`MeshStandardMaterial`,this.defines={STANDARD:``},this.color=new W(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new W(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new V(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new rr,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:``},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},ks=class extends Di{constructor(e){super(),this.isMeshToonMaterial=!0,this.defines={TOON:``},this.type=`MeshToonMaterial`,this.color=new W(16777215),this.map=null,this.gradientMap=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new W(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new V(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.alphaMap=null,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.gradientMap=e.gradientMap,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.alphaMap=e.alphaMap,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},As=class extends Di{constructor(e){super(),this.isMeshLambertMaterial=!0,this.type=`MeshLambertMaterial`,this.color=new W(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new W(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new V(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new rr,this.combine=0,this.reflectivity=1,this.envMapIntensity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.envMapIntensity=e.envMapIntensity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},js=class extends Di{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type=`MeshDepthMaterial`,this.depthPacking=qt,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},Ms=class extends Di{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type=`MeshDistanceMaterial`,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function Ns(e,t){return!e||e.constructor===t?e:typeof t.BYTES_PER_ELEMENT==`number`?new t(e):Array.prototype.slice.call(e)}var Ps=class{constructor(e,t,n,r){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=r===void 0?new t.constructor(n):r,this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,r=t[n],i=t[n-1];validate_interval:{seek:{let a;linear_scan:{forward_scan:if(!(e<r)){for(let a=n+2;;){if(r===void 0){if(e<i)break forward_scan;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(i=r,r=t[++n],e<r)break seek}a=t.length;break linear_scan}if(!(e>=i)){let o=t[1];e<o&&(n=2,i=o);for(let a=n-2;;){if(i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===a)break;if(r=i,i=t[--n-1],e>=i)break seek}a=n,n=0;break linear_scan}break validate_interval}for(;n<a;){let r=n+a>>>1;e<t[r]?a=r:n=r+1}if(r=t[n],i=t[n-1],i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(r===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,i,r)}return this.interpolate_(n,i,e,r)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,r=this.valueSize,i=e*r;for(let e=0;e!==r;++e)t[e]=n[i+e];return t}interpolate_(){throw Error(`call to abstract method`)}intervalChanged_(){}},Fs=class extends Ps{constructor(e,t,n,r){super(e,t,n,r),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Wt,endingEnd:Wt}}intervalChanged_(e,t,n){let r=this.parameterPositions,i=e-2,a=e+1,o=r[i],s=r[a];if(o===void 0)switch(this.getSettings_().endingStart){case Gt:i=e,o=2*t-n;break;case Kt:i=r.length-2,o=t+r[i]-r[i+1];break;default:i=e,o=n}if(s===void 0)switch(this.getSettings_().endingEnd){case Gt:a=e,s=2*n-t;break;case Kt:a=1,s=n+r[1]-r[0];break;default:a=e-1,s=t}let c=(n-t)*.5,l=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(s-n),this._offsetPrev=i*l,this._offsetNext=a*l}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,f=this._weightNext,p=(n-t)/(r-t),m=p*p,h=m*p,g=-d*h+2*d*m-d*p,_=(1+d)*h+(-1.5-2*d)*m+(-.5+d)*p+1,v=(-1-f)*h+(1.5+f)*m+.5*p,y=f*h-f*m;for(let e=0;e!==o;++e)i[e]=g*a[l+e]+_*a[c+e]+v*a[s+e]+y*a[u+e];return i}},Is=class extends Ps{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=(n-t)/(r-t),u=1-l;for(let e=0;e!==o;++e)i[e]=a[c+e]*u+a[s+e]*l;return i}},Ls=class extends Ps{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e){return this.copySampleValue_(e-1)}},Rs=class extends Ps{interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this.settings||this.DefaultSettings_,u=l.inTangents,d=l.outTangents;if(!u||!d){let e=(n-t)/(r-t),l=1-e;for(let t=0;t!==o;++t)i[t]=a[c+t]*l+a[s+t]*e;return i}let f=o*2,p=e-1;for(let l=0;l!==o;++l){let o=a[c+l],m=a[s+l],h=p*f+l*2,g=d[h],_=d[h+1],v=e*f+l*2,y=u[v],b=u[v+1],x=(n-t)/(r-t),S,C,w,T,E;for(let e=0;e<8;e++){S=x*x,C=S*x,w=1-x,T=w*w,E=T*w;let e=E*t+3*T*x*g+3*w*S*y+C*r-n;if(Math.abs(e)<1e-10)break;let i=3*T*(g-t)+6*w*x*(y-g)+3*S*(r-y);if(Math.abs(i)<1e-10)break;x-=e/i,x=Math.max(0,Math.min(1,x))}i[l]=E*o+3*T*x*_+3*w*S*b+C*m}return i}},zs=class{constructor(e,t,n,r){if(e===void 0)throw Error(`THREE.KeyframeTrack: track name is undefined`);if(t===void 0||t.length===0)throw Error(`THREE.KeyframeTrack: no keyframes in track named `+e);this.name=e,this.times=Ns(t,this.TimeBufferType),this.values=Ns(n,this.ValueBufferType),this.setInterpolation(r||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:Ns(e.times,Array),values:Ns(e.values,Array)};let t=e.getInterpolation();t!==e.DefaultInterpolation&&(n.interpolation=t)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new Ls(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new Is(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new Fs(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){let t=new Rs(this.times,this.values,this.getValueSize(),e);return this.settings&&(t.settings=this.settings),t}setInterpolation(e){let t;switch(e){case Bt:t=this.InterpolantFactoryMethodDiscrete;break;case Vt:t=this.InterpolantFactoryMethodLinear;break;case Ht:t=this.InterpolantFactoryMethodSmooth;break;case Ut:t=this.InterpolantFactoryMethodBezier}if(t===void 0){let t=`unsupported interpolation for `+this.ValueTypeName+` keyframe track named `+this.name;if(this.createInterpolant===void 0){if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw Error(t)}return z(`KeyframeTrack:`,t),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Bt;case this.InterpolantFactoryMethodLinear:return Vt;case this.InterpolantFactoryMethodSmooth:return Ht;case this.InterpolantFactoryMethodBezier:return Ut}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]*=e}return this}trim(e,t){let n=this.times,r=n.length,i=0,a=r-1;for(;i!==r&&n[i]<e;)++i;for(;a!==-1&&n[a]>t;)--a;if(++a,i!==0||a!==r){i>=a&&(a=Math.max(a,1),i=a-1);let e=this.getValueSize();this.times=n.slice(i,a),this.values=this.values.slice(i*e,a*e)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(B(`KeyframeTrack: Invalid value size in track.`,this),e=!1);let n=this.times,r=this.values,i=n.length;i===0&&(B(`KeyframeTrack: Track is empty.`,this),e=!1);let a=null;for(let t=0;t!==i;t++){let r=n[t];if(typeof r==`number`&&isNaN(r)){B(`KeyframeTrack: Time is not a valid number.`,this,t,r),e=!1;break}if(a!==null&&a>r){B(`KeyframeTrack: Out of order keys.`,this,t,r,a),e=!1;break}a=r}if(r!==void 0&&rn(r))for(let t=0,n=r.length;t!==n;++t){let n=r[t];if(isNaN(n)){B(`KeyframeTrack: Value is not a valid number.`,this,t,n),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),r=this.getInterpolation()===Ht,i=e.length-1,a=1;for(let o=1;o<i;++o){let i=!1,s=e[o];if(s!==e[o+1]&&(o!==1||s!==e[0])){if(r)i=!0;else{let e=o*n,r=e-n,a=e+n;for(let o=0;o!==n;++o){let n=t[e+o];if(n!==t[r+o]||n!==t[a+o]){i=!0;break}}}}if(i){if(o!==a){e[a]=e[o];let r=o*n,i=a*n;for(let e=0;e!==n;++e)t[i+e]=t[r+e]}++a}}if(i>0){e[a]=e[i];for(let e=i*n,r=a*n,o=0;o!==n;++o)t[r+o]=t[e+o];++a}return a===e.length?(this.times=e,this.values=t):(this.times=e.slice(0,a),this.values=t.slice(0,a*n)),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,r=new n(this.name,e,t);return r.createInterpolant=this.createInterpolant,r}};zs.prototype.ValueTypeName=``,zs.prototype.TimeBufferType=Float32Array,zs.prototype.ValueBufferType=Float32Array,zs.prototype.DefaultInterpolation=Vt;var Bs=class extends zs{constructor(e,t,n){super(e,t,n)}};Bs.prototype.ValueTypeName=`bool`,Bs.prototype.ValueBufferType=Array,Bs.prototype.DefaultInterpolation=Bt,Bs.prototype.InterpolantFactoryMethodLinear=void 0,Bs.prototype.InterpolantFactoryMethodSmooth=void 0;var Vs=class extends zs{constructor(e,t,n,r){super(e,t,n,r)}};Vs.prototype.ValueTypeName=`color`;var Hs=class extends zs{constructor(e,t,n,r){super(e,t,n,r)}};Hs.prototype.ValueTypeName=`number`;var Us=class extends Ps{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=(n-t)/(r-t),c=e*o;for(let e=c+o;c!==e;c+=4)Cn.slerpFlat(i,0,a,c-o,a,c,s);return i}},Ws=class extends zs{constructor(e,t,n,r){super(e,t,n,r)}InterpolantFactoryMethodLinear(e){return new Us(this.times,this.values,this.getValueSize(),e)}};Ws.prototype.ValueTypeName=`quaternion`,Ws.prototype.InterpolantFactoryMethodSmooth=void 0;var Gs=class extends zs{constructor(e,t,n){super(e,t,n)}};Gs.prototype.ValueTypeName=`string`,Gs.prototype.ValueBufferType=Array,Gs.prototype.DefaultInterpolation=Bt,Gs.prototype.InterpolantFactoryMethodLinear=void 0,Gs.prototype.InterpolantFactoryMethodSmooth=void 0;var Ks=class extends zs{constructor(e,t,n,r){super(e,t,n,r)}};Ks.prototype.ValueTypeName=`vector`;var qs=class extends br{constructor(e,t=1){super(),this.isLight=!0,this.type=`Light`,this.color=new W(e),this.intensity=t}dispose(){this.dispatchEvent({type:`dispose`})}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}},Js=class extends qs{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type=`HemisphereLight`,this.position.copy(br.DEFAULT_UP),this.updateMatrix(),this.groundColor=new W(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){let t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}},Ys=new qn,Xs=new H,Zs=new H,Qs=class{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new V(512,512),this.mapType=Fe,this.map=null,this.mapPass=null,this.matrix=new qn,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new ka,this._frameExtents=new V(1,1),this._viewportCount=1,this._viewports=[new Hn(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera,n=this.matrix;Xs.setFromMatrixPosition(e.matrixWorld),t.position.copy(Xs),Zs.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(Zs),t.updateMatrixWorld(),Ys.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Ys,t.coordinateSystem,t.reversedDepth),t.coordinateSystem===2001||t.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Ys)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}},$s=new H,ec=new Cn,tc=new H,nc=class extends br{constructor(){super(),this.isCamera=!0,this.type=`Camera`,this.matrixWorldInverse=new qn,this.projectionMatrix=new qn,this.projectionMatrixInverse=new qn,this.coordinateSystem=tn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose($s,ec,tc),tc.x===1&&tc.y===1&&tc.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose($s,ec,tc.set(1,1,1)).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorld.decompose($s,ec,tc),tc.x===1&&tc.y===1&&tc.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose($s,ec,tc.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},rc=new H,ic=new V,ac=new V,oc=class extends nc{constructor(e=50,t=1,n=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type=`PerspectiveCamera`,this.fov=e,this.zoom=1,this.near=n,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=gn*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(hn*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return gn*2*Math.atan(Math.tan(hn*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){rc.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(rc.x,rc.y).multiplyScalar(-e/rc.z),rc.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(rc.x,rc.y).multiplyScalar(-e/rc.z)}getViewSize(e,t){return this.getViewBounds(e,ic,ac),t.subVectors(ac,ic)}setViewOffset(e,t,n,r,i,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=i,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(hn*.5*this.fov)/this.zoom,n=2*t,r=this.aspect*n,i=-.5*r,a=this.view;if(this.view!==null&&this.view.enabled){let e=a.fullWidth,o=a.fullHeight;i+=a.offsetX*r/e,t-=a.offsetY*n/o,r*=a.width/e,n*=a.height/o}let o=this.filmOffset;o!==0&&(i+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(i,i+r,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},sc=class extends Qs{constructor(){super(new oc(90,1,.5,500)),this.isPointLightShadow=!0}},cc=class extends qs{constructor(e,t,n=0,r=2){super(e,t),this.isPointLight=!0,this.type=`PointLight`,this.distance=n,this.decay=r,this.shadow=new sc}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}},lc=class extends nc{constructor(e=-1,t=1,n=1,r=-1,i=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type=`OrthographicCamera`,this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=r,this.near=i,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,r,i,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=i,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,r=(this.top+this.bottom)/2,i=n-e,a=n+e,o=r+t,s=r-t;if(this.view!==null&&this.view.enabled){let e=(this.right-this.left)/this.view.fullWidth/this.zoom,t=(this.top-this.bottom)/this.view.fullHeight/this.zoom;i+=e*this.view.offsetX,a=i+e*this.view.width,o-=t*this.view.offsetY,s=o-t*this.view.height}this.projectionMatrix.makeOrthographic(i,a,o,s,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},uc=class extends Qs{constructor(){super(new lc(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},dc=class extends qs{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type=`DirectionalLight`,this.position.copy(br.DEFAULT_UP),this.updateMatrix(),this.target=new br,this.shadow=new uc}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}},fc=-90,pc=1,mc=class extends br{constructor(e,t,n){super(),this.type=`CubeCamera`,this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let r=new oc(fc,pc,e,t);r.layers=this.layers,this.add(r);let i=new oc(fc,pc,e,t);i.layers=this.layers,this.add(i);let a=new oc(fc,pc,e,t);a.layers=this.layers,this.add(a);let o=new oc(fc,pc,e,t);o.layers=this.layers,this.add(o);let s=new oc(fc,pc,e,t);s.layers=this.layers,this.add(s);let c=new oc(fc,pc,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,r,i,a,o,s]=t;for(let e of t)this.remove(e);if(e===2e3)n.up.set(0,1,0),n.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),i.up.set(0,0,-1),i.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),s.up.set(0,1,0),s.lookAt(0,0,-1);else if(e===2001)n.up.set(0,-1,0),n.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),i.up.set(0,0,1),i.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),s.up.set(0,-1,0),s.lookAt(0,0,-1);else throw Error(`THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: `+e);for(let e of t)this.add(e),e.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[i,a,o,s,c,l]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),p=e.xr.enabled;e.xr.enabled=!1;let m=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let h=!1;h=e.isWebGLRenderer===!0?e.state.buffers.depth.getReversed():e.reversedDepthBuffer,e.setRenderTarget(n,0,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,i),e.setRenderTarget(n,1,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,s),e.setRenderTarget(n,4,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=m,e.setRenderTarget(n,5,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(u,d,f),e.xr.enabled=p,n.texture.needsPMREMUpdate=!0}},hc=class extends oc{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}},gc=`\\[\\]\\.:\\/`,_c=RegExp(`[\\[\\]\\.:\\/]`,`g`),vc=`[^\\[\\]\\.:\\/]`,yc=`[^`+gc.replace(`\\.`,``)+`]`,bc=`((?:WC+[\\/:])*)`.replace(`WC`,vc),xc=`(WCOD+)?`.replace(`WCOD`,yc),Sc=`(?:\\.(WC+)(?:\\[(.+)\\])?)?`.replace(`WC`,vc),Cc=`\\.(WC+)(?:\\[(.+)\\])?`.replace(`WC`,vc),wc=RegExp(`^`+bc+xc+Sc+Cc+`$`),Tc=[`material`,`materials`,`bones`,`map`],Ec=class{constructor(e,t,n){let r=n||Dc.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,r)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,r=this._bindings[n];r!==void 0&&r.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let r=this._targetGroup.nCachedObjects_,i=n.length;r!==i;++r)n[r].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},Dc=class e{constructor(t,n,r){this.path=n,this.parsedPath=r||e.parseTrackName(n),this.node=e.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,n,r){return t&&t.isAnimationObjectGroup?new e.Composite(t,n,r):new e(t,n,r)}static sanitizeNodeName(e){return e.replace(/\s/g,`_`).replace(_c,``)}static parseTrackName(e){let t=wc.exec(e);if(t===null)throw Error(`PropertyBinding: Cannot parse trackName: `+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},r=n.nodeName&&n.nodeName.lastIndexOf(`.`);if(r!==void 0&&r!==-1){let e=n.nodeName.substring(r+1);Tc.indexOf(e)!==-1&&(n.nodeName=n.nodeName.substring(0,r),n.objectName=e)}if(n.propertyName===null||n.propertyName.length===0)throw Error(`PropertyBinding: can not parse propertyName from trackName: `+e);return n}static findNode(e,t){if(t===void 0||t===``||t===`.`||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(e){for(let r=0;r<e.length;r++){let i=e[r];if(i.name===t||i.uuid===t)return i;let a=n(i.children);if(a)return a}return null},r=n(e.children);if(r)return r}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)e[t++]=n[r]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let t=this.node,n=this.parsedPath,r=n.objectName,i=n.propertyName,a=n.propertyIndex;if(t||(t=e.findNode(this.rootNode,n.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){z(`PropertyBinding: No target node found for track: `+this.path+`.`);return}if(r){let e=n.objectIndex;switch(r){case`materials`:if(!t.material){B(`PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.materials){B(`PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.`,this);return}t=t.material.materials;break;case`bones`:if(!t.skeleton){B(`PropertyBinding: Can not bind to bones as node does not have a skeleton.`,this);return}t=t.skeleton.bones;for(let n=0;n<t.length;n++)if(t[n].name===e){e=n;break}break;case`map`:if(`map`in t){t=t.map;break}if(!t.material){B(`PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.map){B(`PropertyBinding: Can not bind to material.map as node.material does not have a map.`,this);return}t=t.material.map;break;default:if(t[r]===void 0){B(`PropertyBinding: Can not bind to objectName of node undefined.`,this);return}t=t[r]}if(e!==void 0){if(t[e]===void 0){B(`PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.`,this,t);return}t=t[e]}}let o=t[i];if(o===void 0){let e=n.nodeName;B(`PropertyBinding: Trying to update property for track: `+e+`.`+i+` but it wasn't found.`,t);return}let s=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?s=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(s=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(a!==void 0){if(i===`morphTargetInfluences`){if(!t.geometry){B(`PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.`,this);return}if(!t.geometry.morphAttributes){B(`PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.`,this);return}t.morphTargetDictionary[a]!==void 0&&(a=t.morphTargetDictionary[a])}c=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=a}else o.fromArray!==void 0&&o.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(c=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][s]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};Dc.Composite=Ec,Dc.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},Dc.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},Dc.prototype.GetterByBindingType=[Dc.prototype._getValue_direct,Dc.prototype._getValue_array,Dc.prototype._getValue_arrayElement,Dc.prototype._getValue_toArray],Dc.prototype.SetterByBindingTypeAndVersioning=[[Dc.prototype._setValue_direct,Dc.prototype._setValue_direct_setNeedsUpdate,Dc.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[Dc.prototype._setValue_array,Dc.prototype._setValue_array_setNeedsUpdate,Dc.prototype._setValue_array_setMatrixWorldNeedsUpdate],[Dc.prototype._setValue_arrayElement,Dc.prototype._setValue_arrayElement_setNeedsUpdate,Dc.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[Dc.prototype._setValue_fromArray,Dc.prototype._setValue_fromArray_setNeedsUpdate,Dc.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];function Oc(e,t,n,r){let i=kc(r);switch(n){case Je:return e*t;case $e:return e*t/i.components*i.byteLength;case et:return e*t/i.components*i.byteLength;case tt:return e*t*2/i.components*i.byteLength;case nt:return e*t*2/i.components*i.byteLength;case Ye:return e*t*3/i.components*i.byteLength;case Xe:return e*t*4/i.components*i.byteLength;case rt:return e*t*4/i.components*i.byteLength;case it:case at:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case ot:case st:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case lt:case dt:return Math.max(e,16)*Math.max(t,8)/4;case ct:case ut:return Math.max(e,8)*Math.max(t,8)/2;case ft:case pt:case ht:case gt:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case mt:case _t:case vt:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case yt:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case bt:return Math.floor((e+4)/5)*Math.floor((t+3)/4)*16;case xt:return Math.floor((e+4)/5)*Math.floor((t+4)/5)*16;case St:return Math.floor((e+5)/6)*Math.floor((t+4)/5)*16;case Ct:return Math.floor((e+5)/6)*Math.floor((t+5)/6)*16;case wt:return Math.floor((e+7)/8)*Math.floor((t+4)/5)*16;case Tt:return Math.floor((e+7)/8)*Math.floor((t+5)/6)*16;case Et:return Math.floor((e+7)/8)*Math.floor((t+7)/8)*16;case Dt:return Math.floor((e+9)/10)*Math.floor((t+4)/5)*16;case Ot:return Math.floor((e+9)/10)*Math.floor((t+5)/6)*16;case kt:return Math.floor((e+9)/10)*Math.floor((t+7)/8)*16;case At:return Math.floor((e+9)/10)*Math.floor((t+9)/10)*16;case jt:return Math.floor((e+11)/12)*Math.floor((t+9)/10)*16;case Mt:return Math.floor((e+11)/12)*Math.floor((t+11)/12)*16;case Nt:case Pt:case Ft:return Math.ceil(e/4)*Math.ceil(t/4)*16;case It:case Lt:return Math.ceil(e/4)*Math.ceil(t/4)*8;case Rt:case zt:return Math.ceil(e/4)*Math.ceil(t/4)*16}throw Error(`Unable to determine texture byte length for ${n} format.`)}function kc(e){switch(e){case Fe:case Ie:return{byteLength:1,components:1};case Re:case Le:case He:return{byteLength:2,components:1};case Ue:case We:return{byteLength:2,components:4};case Be:case ze:case Ve:return{byteLength:4,components:1};case Ke:case qe:return{byteLength:4,components:3}}throw Error(`Unknown texture type ${e}.`)}typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`register`,{detail:{revision:`183`}})),typeof window<`u`&&(window.__THREE__?z(`WARNING: Multiple instances of Three.js being imported.`):window.__THREE__=`183`);function Ac(){let e=null,t=!1,n=null,r=null;function i(t,a){n(t,a),r=e.requestAnimationFrame(i)}return{start:function(){t!==!0&&n!==null&&(r=e.requestAnimationFrame(i),t=!0)},stop:function(){e.cancelAnimationFrame(r),t=!1},setAnimationLoop:function(e){n=e},setContext:function(t){e=t}}}function jc(e){let t=new WeakMap;function n(t,n){let r=t.array,i=t.usage,a=r.byteLength,o=e.createBuffer();e.bindBuffer(n,o),e.bufferData(n,r,i),t.onUploadCallback();let s;if(r instanceof Float32Array)s=e.FLOAT;else if(typeof Float16Array<`u`&&r instanceof Float16Array)s=e.HALF_FLOAT;else if(r instanceof Uint16Array)s=t.isFloat16BufferAttribute?e.HALF_FLOAT:e.UNSIGNED_SHORT;else if(r instanceof Int16Array)s=e.SHORT;else if(r instanceof Uint32Array)s=e.UNSIGNED_INT;else if(r instanceof Int32Array)s=e.INT;else if(r instanceof Int8Array)s=e.BYTE;else if(r instanceof Uint8Array)s=e.UNSIGNED_BYTE;else if(r instanceof Uint8ClampedArray)s=e.UNSIGNED_BYTE;else throw Error(`THREE.WebGLAttributes: Unsupported buffer data format: `+r);return{buffer:o,type:s,bytesPerElement:r.BYTES_PER_ELEMENT,version:t.version,size:a}}function r(t,n,r){let i=n.array,a=n.updateRanges;if(e.bindBuffer(r,t),a.length===0)e.bufferSubData(r,0,i);else{a.sort((e,t)=>e.start-t.start);let t=0;for(let e=1;e<a.length;e++){let n=a[t],r=a[e];r.start<=n.start+n.count+1?n.count=Math.max(n.count,r.start+r.count-n.start):(++t,a[t]=r)}a.length=t+1;for(let t=0,n=a.length;t<n;t++){let n=a[t];e.bufferSubData(r,n.start*i.BYTES_PER_ELEMENT,i,n.start,n.count)}n.clearUpdateRanges()}n.onUploadCallback()}function i(e){return e.isInterleavedBufferAttribute&&(e=e.data),t.get(e)}function a(n){n.isInterleavedBufferAttribute&&(n=n.data);let r=t.get(n);r&&(e.deleteBuffer(r.buffer),t.delete(n))}function o(e,i){if(e.isInterleavedBufferAttribute&&(e=e.data),e.isGLBufferAttribute){let n=t.get(e);(!n||n.version<e.version)&&t.set(e,{buffer:e.buffer,type:e.type,bytesPerElement:e.elementSize,version:e.version});return}let a=t.get(e);if(a===void 0)t.set(e,n(e,i));else if(a.version<e.version){if(a.size!==e.array.byteLength)throw Error(`THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.`);r(a.buffer,e,i),a.version=e.version}}return{get:i,remove:a,update:o}}var Mc={alphahash_fragment:`#ifdef USE_ALPHAHASH
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
}`},q={common:{diffuse:{value:new W(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new En},alphaMap:{value:null},alphaMapTransform:{value:new En},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new En}},envmap:{envMap:{value:null},envMapRotation:{value:new En},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new En}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new En}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new En},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new En},normalScale:{value:new V(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new En},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new En}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new En}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new En}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new W(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new W(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new En},alphaTest:{value:0},uvTransform:{value:new En}},sprite:{diffuse:{value:new W(16777215)},opacity:{value:1},center:{value:new V(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new En},alphaMap:{value:null},alphaMapTransform:{value:new En},alphaTest:{value:0}}},Nc={basic:{uniforms:bs([q.common,q.specularmap,q.envmap,q.aomap,q.lightmap,q.fog]),vertexShader:Mc.meshbasic_vert,fragmentShader:Mc.meshbasic_frag},lambert:{uniforms:bs([q.common,q.specularmap,q.envmap,q.aomap,q.lightmap,q.emissivemap,q.bumpmap,q.normalmap,q.displacementmap,q.fog,q.lights,{emissive:{value:new W(0)},envMapIntensity:{value:1}}]),vertexShader:Mc.meshlambert_vert,fragmentShader:Mc.meshlambert_frag},phong:{uniforms:bs([q.common,q.specularmap,q.envmap,q.aomap,q.lightmap,q.emissivemap,q.bumpmap,q.normalmap,q.displacementmap,q.fog,q.lights,{emissive:{value:new W(0)},specular:{value:new W(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Mc.meshphong_vert,fragmentShader:Mc.meshphong_frag},standard:{uniforms:bs([q.common,q.envmap,q.aomap,q.lightmap,q.emissivemap,q.bumpmap,q.normalmap,q.displacementmap,q.roughnessmap,q.metalnessmap,q.fog,q.lights,{emissive:{value:new W(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Mc.meshphysical_vert,fragmentShader:Mc.meshphysical_frag},toon:{uniforms:bs([q.common,q.aomap,q.lightmap,q.emissivemap,q.bumpmap,q.normalmap,q.displacementmap,q.gradientmap,q.fog,q.lights,{emissive:{value:new W(0)}}]),vertexShader:Mc.meshtoon_vert,fragmentShader:Mc.meshtoon_frag},matcap:{uniforms:bs([q.common,q.bumpmap,q.normalmap,q.displacementmap,q.fog,{matcap:{value:null}}]),vertexShader:Mc.meshmatcap_vert,fragmentShader:Mc.meshmatcap_frag},points:{uniforms:bs([q.points,q.fog]),vertexShader:Mc.points_vert,fragmentShader:Mc.points_frag},dashed:{uniforms:bs([q.common,q.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Mc.linedashed_vert,fragmentShader:Mc.linedashed_frag},depth:{uniforms:bs([q.common,q.displacementmap]),vertexShader:Mc.depth_vert,fragmentShader:Mc.depth_frag},normal:{uniforms:bs([q.common,q.bumpmap,q.normalmap,q.displacementmap,{opacity:{value:1}}]),vertexShader:Mc.meshnormal_vert,fragmentShader:Mc.meshnormal_frag},sprite:{uniforms:bs([q.sprite,q.fog]),vertexShader:Mc.sprite_vert,fragmentShader:Mc.sprite_frag},background:{uniforms:{uvTransform:{value:new En},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Mc.background_vert,fragmentShader:Mc.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new En}},vertexShader:Mc.backgroundCube_vert,fragmentShader:Mc.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Mc.cube_vert,fragmentShader:Mc.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Mc.equirect_vert,fragmentShader:Mc.equirect_frag},distance:{uniforms:bs([q.common,q.displacementmap,{referencePosition:{value:new H},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Mc.distance_vert,fragmentShader:Mc.distance_frag},shadow:{uniforms:bs([q.lights,q.fog,{color:{value:new W(0)},opacity:{value:1}}]),vertexShader:Mc.shadow_vert,fragmentShader:Mc.shadow_frag}};Nc.physical={uniforms:bs([Nc.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new En},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new En},clearcoatNormalScale:{value:new V(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new En},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new En},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new En},sheen:{value:0},sheenColor:{value:new W(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new En},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new En},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new En},transmissionSamplerSize:{value:new V},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new En},attenuationDistance:{value:0},attenuationColor:{value:new W(0)},specularColor:{value:new W(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new En},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new En},anisotropyVector:{value:new V},anisotropyMap:{value:null},anisotropyMapTransform:{value:new En}}]),vertexShader:Mc.meshphysical_vert,fragmentShader:Mc.meshphysical_frag};var Pc={r:0,b:0,g:0},Fc=new rr,Ic=new qn;function Lc(e,t,n,r,i,a){let o=new W(0),s=i===!0?0:1,c,l,u=null,d=0,f=null;function p(e){let n=e.isScene===!0?e.background:null;if(n&&n.isTexture){let r=e.backgroundBlurriness>0;n=t.get(n,r)}return n}function m(t){let r=!1,i=p(t);i===null?g(o,s):i&&i.isColor&&(g(i,1),r=!0);let c=e.xr.getEnvironmentBlendMode();c===`additive`?n.buffers.color.setClear(0,0,0,1,a):c===`alpha-blend`&&n.buffers.color.setClear(0,0,0,0,a),(e.autoClear||r)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function h(t,n){let i=p(n);i&&(i.isCubeTexture||i.mapping===306)?(l===void 0&&(l=new K(new Ha(1,1,1),new Es({name:`BackgroundCubeMaterial`,uniforms:ys(Nc.backgroundCube.uniforms),vertexShader:Nc.backgroundCube.vertexShader,fragmentShader:Nc.backgroundCube.fragmentShader,side:1,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute(`normal`),l.geometry.deleteAttribute(`uv`),l.onBeforeRender=function(e,t,n){this.matrixWorld.copyPosition(n.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),r.update(l)),Fc.copy(n.backgroundRotation),Fc.x*=-1,Fc.y*=-1,Fc.z*=-1,i.isCubeTexture&&i.isRenderTargetTexture===!1&&(Fc.y*=-1,Fc.z*=-1),l.material.uniforms.envMap.value=i,l.material.uniforms.flipEnvMap.value=i.isCubeTexture&&i.isRenderTargetTexture===!1?-1:1,l.material.uniforms.backgroundBlurriness.value=n.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(Ic.makeRotationFromEuler(Fc)),l.material.toneMapped=jn.getTransfer(i.colorSpace)!==Zt,(u!==i||d!==i.version||f!==e.toneMapping)&&(l.material.needsUpdate=!0,u=i,d=i.version,f=e.toneMapping),l.layers.enableAll(),t.unshift(l,l.geometry,l.material,0,0,null)):i&&i.isTexture&&(c===void 0&&(c=new K(new ms(2,2),new Es({name:`BackgroundMaterial`,uniforms:ys(Nc.background.uniforms),vertexShader:Nc.background.vertexShader,fragmentShader:Nc.background.fragmentShader,side:0,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute(`normal`),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),r.update(c)),c.material.uniforms.t2D.value=i,c.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,c.material.toneMapped=jn.getTransfer(i.colorSpace)!==Zt,i.matrixAutoUpdate===!0&&i.updateMatrix(),c.material.uniforms.uvTransform.value.copy(i.matrix),(u!==i||d!==i.version||f!==e.toneMapping)&&(c.material.needsUpdate=!0,u=i,d=i.version,f=e.toneMapping),c.layers.enableAll(),t.unshift(c,c.geometry,c.material,0,0,null))}function g(t,r){t.getRGB(Pc,Ss(e)),n.buffers.color.setClear(Pc.r,Pc.g,Pc.b,r,a)}function _(){l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0),c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0)}return{getClearColor:function(){return o},setClearColor:function(e,t=1){o.set(e),s=t,g(o,s)},getClearAlpha:function(){return s},setClearAlpha:function(e){s=e,g(o,s)},render:m,addToRenderList:h,dispose:_}}function Rc(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),r={},i=f(null),a=i,o=!1;function s(n,r,i,s,c){let u=!1,f=d(n,s,i,r);a!==f&&(a=f,l(a.object)),u=p(n,s,i,c),u&&m(n,s,i,c),c!==null&&t.update(c,e.ELEMENT_ARRAY_BUFFER),(u||o)&&(o=!1,b(n,r,i,s),c!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(c).buffer))}function c(){return e.createVertexArray()}function l(t){return e.bindVertexArray(t)}function u(t){return e.deleteVertexArray(t)}function d(e,t,n,i){let a=i.wireframe===!0,o=r[t.id];o===void 0&&(o={},r[t.id]=o);let s=e.isInstancedMesh===!0?e.id:0,l=o[s];l===void 0&&(l={},o[s]=l);let u=l[n.id];u===void 0&&(u={},l[n.id]=u);let d=u[a];return d===void 0&&(d=f(c()),u[a]=d),d}function f(e){let t=[],r=[],i=[];for(let e=0;e<n;e++)t[e]=0,r[e]=0,i[e]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:t,enabledAttributes:r,attributeDivisors:i,object:e,attributes:{},index:null}}function p(e,t,n,r){let i=a.attributes,o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=i[t],r=o[t];if(r===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(r=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(r=e.instanceColor)),n===void 0||n.attribute!==r||r&&n.data!==r.data)return!0;s++}return a.attributesNum!==s||a.index!==r}function m(e,t,n,r){let i={},o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=o[t];n===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(n=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(n=e.instanceColor));let r={};r.attribute=n,n&&n.data&&(r.data=n.data),i[t]=r,s++}a.attributes=i,a.attributesNum=s,a.index=r}function h(){let e=a.newAttributes;for(let t=0,n=e.length;t<n;t++)e[t]=0}function g(e){_(e,0)}function _(t,n){let r=a.newAttributes,i=a.enabledAttributes,o=a.attributeDivisors;r[t]=1,i[t]===0&&(e.enableVertexAttribArray(t),i[t]=1),o[t]!==n&&(e.vertexAttribDivisor(t,n),o[t]=n)}function v(){let t=a.newAttributes,n=a.enabledAttributes;for(let r=0,i=n.length;r<i;r++)n[r]!==t[r]&&(e.disableVertexAttribArray(r),n[r]=0)}function y(t,n,r,i,a,o,s){s===!0?e.vertexAttribIPointer(t,n,r,a,o):e.vertexAttribPointer(t,n,r,i,a,o)}function b(n,r,i,a){h();let o=a.attributes,s=i.getAttributes(),c=r.defaultAttributeValues;for(let r in s){let i=s[r];if(i.location>=0){let s=o[r];if(s===void 0&&(r===`instanceMatrix`&&n.instanceMatrix&&(s=n.instanceMatrix),r===`instanceColor`&&n.instanceColor&&(s=n.instanceColor)),s!==void 0){let r=s.normalized,o=s.itemSize,c=t.get(s);if(c===void 0)continue;let l=c.buffer,u=c.type,d=c.bytesPerElement,f=u===e.INT||u===e.UNSIGNED_INT||s.gpuType===1013;if(s.isInterleavedBufferAttribute){let t=s.data,c=t.stride,p=s.offset;if(t.isInstancedInterleavedBuffer){for(let e=0;e<i.locationSize;e++)_(i.location+e,t.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=t.meshPerAttribute*t.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,c*d,(p+o/i.locationSize*e)*d,f)}else{if(s.isInstancedBufferAttribute){for(let e=0;e<i.locationSize;e++)_(i.location+e,s.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=s.meshPerAttribute*s.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,o*d,o/i.locationSize*e*d,f)}}else if(c!==void 0){let t=c[r];if(t!==void 0)switch(t.length){case 2:e.vertexAttrib2fv(i.location,t);break;case 3:e.vertexAttrib3fv(i.location,t);break;case 4:e.vertexAttrib4fv(i.location,t);break;default:e.vertexAttrib1fv(i.location,t)}}}}v()}function x(){T();for(let e in r){let t=r[e];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e]}}function S(e){if(r[e.id]===void 0)return;let t=r[e.id];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e.id]}function C(e){for(let t in r){let n=r[t];for(let t in n){let r=n[t];if(r[e.id]===void 0)continue;let i=r[e.id];for(let e in i)u(i[e].object),delete i[e];delete r[e.id]}}}function w(e){for(let t in r){let n=r[t],i=e.isInstancedMesh===!0?e.id:0,a=n[i];if(a!==void 0){for(let e in a){let t=a[e];for(let e in t)u(t[e].object),delete t[e];delete a[e]}delete n[i],Object.keys(n).length===0&&delete r[t]}}}function T(){E(),o=!0,a!==i&&(a=i,l(a.object))}function E(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:s,reset:T,resetDefaultState:E,dispose:x,releaseStatesOfGeometry:S,releaseStatesOfObject:w,releaseStatesOfProgram:C,initAttributes:h,enableAttribute:g,disableUnusedAttributes:v}}function zc(e,t,n){let r;function i(e){r=e}function a(t,i){e.drawArrays(r,t,i),n.update(i,r,1)}function o(t,i,a){a!==0&&(e.drawArraysInstanced(r,t,i,a),n.update(i,r,a))}function s(e,i,a){if(a===0)return;t.get(`WEBGL_multi_draw`).multiDrawArraysWEBGL(r,e,0,i,0,a);let o=0;for(let e=0;e<a;e++)o+=i[e];n.update(o,r,1)}function c(e,i,a,s){if(a===0)return;let c=t.get(`WEBGL_multi_draw`);if(c===null)for(let t=0;t<e.length;t++)o(e[t],i[t],s[t]);else{c.multiDrawArraysInstancedWEBGL(r,e,0,i,0,s,0,a);let t=0;for(let e=0;e<a;e++)t+=i[e]*s[e];n.update(t,r,1)}}this.setMode=i,this.render=a,this.renderInstances=o,this.renderMultiDraw=s,this.renderMultiDrawInstances=c}function Bc(e,t,n,r){let i;function a(){if(i!==void 0)return i;if(t.has(`EXT_texture_filter_anisotropic`)===!0){let n=t.get(`EXT_texture_filter_anisotropic`);i=e.getParameter(n.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(t){return t===1023||r.convert(t)===e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT)}function s(n){let i=n===1016&&(t.has(`EXT_color_buffer_half_float`)||t.has(`EXT_color_buffer_float`));return!(n!==1009&&r.convert(n)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE)&&n!==1015&&!i)}function c(t){if(t===`highp`){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return`highp`;t=`mediump`}return t===`mediump`&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?`mediump`:`lowp`}let l=n.precision===void 0?`highp`:n.precision,u=c(l);u!==l&&(z(`WebGLRenderer:`,l,`not supported, using`,u,`instead.`),l=u);let d=n.logarithmicDepthBuffer===!0,f=n.reversedDepthBuffer===!0&&t.has(`EXT_clip_control`),p=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),m=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),h=e.getParameter(e.MAX_TEXTURE_SIZE),g=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),_=e.getParameter(e.MAX_VERTEX_ATTRIBS),v=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),y=e.getParameter(e.MAX_VARYING_VECTORS),b=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),x=e.getParameter(e.MAX_SAMPLES),S=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:a,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:s,precision:l,logarithmicDepthBuffer:d,reversedDepthBuffer:f,maxTextures:p,maxVertexTextures:m,maxTextureSize:h,maxCubemapSize:g,maxAttributes:_,maxVertexUniforms:v,maxVaryings:y,maxFragmentUniforms:b,maxSamples:x,samples:S}}function Vc(e){let t=this,n=null,r=0,i=!1,a=!1,o=new Ta,s=new En,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(e,t){let n=e.length!==0||t||r!==0||i;return i=t,r=e.length,n},this.beginShadows=function(){a=!0,u(null)},this.endShadows=function(){a=!1},this.setGlobalState=function(e,t){n=u(e,t,0)},this.setState=function(t,o,s){let d=t.clippingPlanes,f=t.clipIntersection,p=t.clipShadows,m=e.get(t);if(!i||d===null||d.length===0||a&&!p)a?u(null):l();else{let e=a?0:r,t=e*4,i=m.clippingState||null;c.value=i,i=u(d,o,t,s);for(let e=0;e!==t;++e)i[e]=n[e];m.clippingState=i,this.numIntersection=f?this.numPlanes:0,this.numPlanes+=e}};function l(){c.value!==n&&(c.value=n,c.needsUpdate=r>0),t.numPlanes=r,t.numIntersection=0}function u(e,n,r,i){let a=e===null?0:e.length,l=null;if(a!==0){if(l=c.value,i!==!0||l===null){let t=r+a*4,i=n.matrixWorldInverse;s.getNormalMatrix(i),(l===null||l.length<t)&&(l=new Float32Array(t));for(let t=0,n=r;t!==a;++t,n+=4)o.copy(e[t]).applyMatrix4(i,s),o.normal.toArray(l,n),l[n+3]=o.constant}c.value=l,c.needsUpdate=!0}return t.numPlanes=a,t.numIntersection=0,l}}var Hc=4,Uc=[.125,.215,.35,.446,.526,.582],Wc=20,Gc=256,Kc=new lc,qc=new W,Jc=null,Yc=0,Xc=0,Zc=!1,Qc=new H,$c=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,r=100,i={}){let{size:a=256,position:o=Qc}=i;Jc=this._renderer.getRenderTarget(),Yc=this._renderer.getActiveCubeFace(),Xc=this._renderer.getActiveMipmapLevel(),Zc=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let s=this._allocateTargets();return s.depthBuffer=!0,this._sceneToCubeUV(e,n,r,s,o),t>0&&this._blur(s,0,0,t),this._applyPMREM(s),this._cleanup(s),s}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=ol(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=al(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=2**this._lodMax}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Jc,Yc,Xc),this._renderer.xr.enabled=Zc,e.scissorTest=!1,nl(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===301||e.mapping===302?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Jc=this._renderer.getRenderTarget(),Yc=this._renderer.getActiveCubeFace(),Xc=this._renderer.getActiveMipmapLevel(),Zc=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:Me,minFilter:Me,generateMipmaps:!1,type:He,format:Xe,colorSpace:Yt,depthBuffer:!1},r=tl(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=tl(e,t,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=el(r)),this._blurMaterial=il(r,e,t),this._ggxMaterial=rl(r,e,t)}return r}_compileMaterial(e){let t=new K(new Si,e);this._renderer.compile(t,Kc)}_sceneToCubeUV(e,t,n,r,i){let a=new oc(90,1,t,n),o=[1,-1,1,1,1,1],s=[1,1,1,-1,-1,-1],c=this._renderer,l=c.autoClear,u=c.toneMapping;c.getClearColor(qc),c.toneMapping=0,c.autoClear=!1,c.state.buffers.depth.getReversed()&&(c.setRenderTarget(r),c.clearDepth(),c.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new K(new Ha,new Qi({name:`PMREM.Background`,side:1,depthWrite:!1,depthTest:!1})));let d=this._backgroundBox,f=d.material,p=!1,m=e.background;m?m.isColor&&(f.color.copy(m),e.background=null,p=!0):(f.color.copy(qc),p=!0);for(let t=0;t<6;t++){let n=t%3;n===0?(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x+s[t],i.y,i.z)):n===1?(a.up.set(0,0,o[t]),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y+s[t],i.z)):(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y,i.z+s[t]));let l=this._cubeSize;nl(r,n*l,t>2?l:0,l,l),c.setRenderTarget(r),p&&c.render(d,a),c.render(e,a)}c.toneMapping=u,c.autoClear=l,e.background=m}_textureToCubeUV(e,t){let n=this._renderer,r=e.mapping===301||e.mapping===302;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=ol()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=al());let i=r?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=i;let o=i.uniforms;o.envMap.value=e;let s=this._cubeSize;nl(t,0,0,3*s,2*s),n.setRenderTarget(t),n.render(a,Kc)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let r=this._lodMeshes.length;for(let t=1;t<r;t++)this._applyGGXFilter(e,t-1,t);t.autoClear=n}_applyGGXFilter(e,t,n){let r=this._renderer,i=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let s=a.uniforms,c=n/(this._lodMeshes.length-1),l=t/(this._lodMeshes.length-1),u=Math.sqrt(c*c-l*l)*(0+c*1.25),{_lodMax:d}=this,f=this._sizeLods[n],p=3*f*(n>d-Hc?n-d+Hc:0),m=4*(this._cubeSize-f);s.envMap.value=e.texture,s.roughness.value=u,s.mipInt.value=d-t,nl(i,p,m,3*f,2*f),r.setRenderTarget(i),r.render(o,Kc),s.envMap.value=i.texture,s.roughness.value=0,s.mipInt.value=d-n,nl(e,p,m,3*f,2*f),r.setRenderTarget(e),r.render(o,Kc)}_blur(e,t,n,r,i){let a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,r,`latitudinal`,i),this._halfBlur(a,e,n,n,r,`longitudinal`,i)}_halfBlur(e,t,n,r,i,a,o){let s=this._renderer,c=this._blurMaterial;a!==`latitudinal`&&a!==`longitudinal`&&B(`blur direction must be either latitudinal or longitudinal!`);let l=this._lodMeshes[r];l.material=c;let u=c.uniforms,d=this._sizeLods[n]-1,f=isFinite(i)?Math.PI/(2*d):2*Math.PI/39,p=i/f,m=isFinite(i)?1+Math.floor(3*p):Wc;m>Wc&&z(`sigmaRadians, ${i}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${Wc}`);let h=[],g=0;for(let e=0;e<Wc;++e){let t=e/p,n=Math.exp(-t*t/2);h.push(n),e===0?g+=n:e<m&&(g+=2*n)}for(let e=0;e<h.length;e++)h[e]=h[e]/g;u.envMap.value=e.texture,u.samples.value=m,u.weights.value=h,u.latitudinal.value=a===`latitudinal`,o&&(u.poleAxis.value=o);let{_lodMax:_}=this;u.dTheta.value=f,u.mipInt.value=_-n;let v=this._sizeLods[r];nl(t,3*v*(r>_-Hc?r-_+Hc:0),4*(this._cubeSize-v),3*v,2*v),s.setRenderTarget(t),s.render(l,Kc)}};function el(e){let t=[],n=[],r=[],i=e,a=e-Hc+1+Uc.length;for(let o=0;o<a;o++){let a=2**i;t.push(a);let s=1/a;o>e-Hc?s=Uc[o-e+Hc-1]:o===0&&(s=0),n.push(s);let c=1/(a-2),l=-c,u=1+c,d=[l,l,u,l,u,u,l,l,u,u,l,u],f=new Float32Array(108),p=new Float32Array(72),m=new Float32Array(36);for(let e=0;e<6;e++){let t=e%3*2/3-1,n=e>2?0:-1,r=[t,n,0,t+2/3,n,0,t+2/3,n+1,0,t,n,0,t+2/3,n+1,0,t,n+1,0];f.set(r,18*e),p.set(d,12*e);let i=[e,e,e,e,e,e];m.set(i,6*e)}let h=new Si;h.setAttribute(`position`,new ci(f,3)),h.setAttribute(`uv`,new ci(p,2)),h.setAttribute(`faceIndex`,new ci(m,1)),r.push(new K(h,null)),i>Hc&&i--}return{lodMeshes:r,sizeLods:t,sigmas:n}}function tl(e,t,n){let r=new Wn(e,t,n);return r.texture.mapping=306,r.texture.name=`PMREM.cubeUv`,r.scissorTest=!0,r}function nl(e,t,n,r,i){e.viewport.set(t,n,r,i),e.scissor.set(t,n,r,i)}function rl(e,t,n){return new Es({name:`PMREMGGXConvolution`,defines:{GGX_SAMPLES:Gc,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:sl(),fragmentShader:`

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
		`,blending:0,depthTest:!1,depthWrite:!1})}function il(e,t,n){let r=new Float32Array(Wc),i=new H(0,1,0);return new Es({name:`SphericalGaussianBlur`,defines:{n:Wc,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:r},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:sl(),fragmentShader:`

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
		`,blending:0,depthTest:!1,depthWrite:!1})}function al(){return new Es({name:`EquirectangularToCubeUV`,uniforms:{envMap:{value:null}},vertexShader:sl(),fragmentShader:`

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
		`,blending:0,depthTest:!1,depthWrite:!1})}function ol(){return new Es({name:`CubemapToCubeUV`,uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:sl(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function sl(){return`

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
	`}var cl=class extends Wn{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},r=[n,n,n,n,n,n];this.texture=new La(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},r=new Ha(5,5,5),i=new Es({name:`CubemapFromEquirect`,uniforms:ys(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:1,blending:0});i.uniforms.tEquirect.value=t;let a=new K(r,i),o=t.minFilter;return t.minFilter===1008&&(t.minFilter=Me),new mc(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,r=!0){let i=e.getRenderTarget();for(let i=0;i<6;i++)e.setRenderTarget(this,i),e.clear(t,n,r);e.setRenderTarget(i)}};function ll(e){let t=new WeakMap,n=new WeakMap,r=null;function i(e,t=!1){return e==null?null:t?o(e):a(e)}function a(n){if(n&&n.isTexture){let r=n.mapping;if(r===303||r===304){if(t.has(n)){let e=t.get(n).texture;return s(e,n.mapping)}{let r=n.image;if(r&&r.height>0){let i=new cl(r.height);return i.fromEquirectangularTexture(e,n),t.set(n,i),n.addEventListener(`dispose`,l),s(i.texture,n.mapping)}return null}}}return n}function o(t){if(t&&t.isTexture){let i=t.mapping,a=i===303||i===304,o=i===301||i===302;if(a||o){let i=n.get(t),s=i===void 0?0:i.texture.pmremVersion;if(t.isRenderTargetTexture&&t.pmremVersion!==s)return r===null&&(r=new $c(e)),i=a?r.fromEquirectangular(t,i):r.fromCubemap(t,i),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),i.texture;if(i!==void 0)return i.texture;{let s=t.image;return a&&s&&s.height>0||o&&s&&c(s)?(r===null&&(r=new $c(e)),i=a?r.fromEquirectangular(t):r.fromCubemap(t),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),t.addEventListener(`dispose`,u),i.texture):null}}}return t}function s(e,t){return t===303?e.mapping=301:t===304&&(e.mapping=302),e}function c(e){let t=0;for(let n=0;n<6;n++)e[n]!==void 0&&t++;return t===6}function l(e){let n=e.target;n.removeEventListener(`dispose`,l);let r=t.get(n);r!==void 0&&(t.delete(n),r.dispose())}function u(e){let t=e.target;t.removeEventListener(`dispose`,u);let r=n.get(t);r!==void 0&&(n.delete(t),r.dispose())}function d(){t=new WeakMap,n=new WeakMap,r!==null&&(r.dispose(),r=null)}return{get:i,dispose:d}}function ul(e){let t={};function n(n){if(t[n]!==void 0)return t[n];let r=e.getExtension(n);return t[n]=r,r}return{has:function(e){return n(e)!==null},init:function(){n(`EXT_color_buffer_float`),n(`WEBGL_clip_cull_distance`),n(`OES_texture_float_linear`),n(`EXT_color_buffer_half_float`),n(`WEBGL_multisampled_render_to_texture`),n(`WEBGL_render_shared_exponent`)},get:function(e){let t=n(e);return t===null&&un(`WebGLRenderer: `+e+` extension not supported.`),t}}}function dl(e,t,n,r){let i={},a=new WeakMap;function o(e){let s=e.target;s.index!==null&&t.remove(s.index);for(let e in s.attributes)t.remove(s.attributes[e]);s.removeEventListener(`dispose`,o),delete i[s.id];let c=a.get(s);c&&(t.remove(c),a.delete(s)),r.releaseStatesOfGeometry(s),s.isInstancedBufferGeometry===!0&&delete s._maxInstanceCount,n.memory.geometries--}function s(e,t){return i[t.id]===!0||(t.addEventListener(`dispose`,o),i[t.id]=!0,n.memory.geometries++),t}function c(n){let r=n.attributes;for(let n in r)t.update(r[n],e.ARRAY_BUFFER)}function l(e){let n=[],r=e.index,i=e.attributes.position,o=0;if(i===void 0)return;if(r!==null){let e=r.array;o=r.version;for(let t=0,r=e.length;t<r;t+=3){let r=e[t+0],i=e[t+1],a=e[t+2];n.push(r,i,i,a,a,r)}}else{let e=i.array;o=i.version;for(let t=0,r=e.length/3-1;t<r;t+=3){let e=t+0,r=t+1,i=t+2;n.push(e,r,r,i,i,e)}}let s=new(i.count>=65535?ui:li)(n,1);s.version=o;let c=a.get(e);c&&t.remove(c),a.set(e,s)}function u(e){let t=a.get(e);if(t){let n=e.index;n!==null&&t.version<n.version&&l(e)}else l(e);return a.get(e)}return{get:s,update:c,getWireframeAttribute:u}}function fl(e,t,n){let r;function i(e){r=e}let a,o;function s(e){a=e.type,o=e.bytesPerElement}function c(t,i){e.drawElements(r,i,a,t*o),n.update(i,r,1)}function l(t,i,s){s!==0&&(e.drawElementsInstanced(r,i,a,t*o,s),n.update(i,r,s))}function u(e,i,o){if(o===0)return;t.get(`WEBGL_multi_draw`).multiDrawElementsWEBGL(r,i,0,a,e,0,o);let s=0;for(let e=0;e<o;e++)s+=i[e];n.update(s,r,1)}function d(e,i,s,c){if(s===0)return;let u=t.get(`WEBGL_multi_draw`);if(u===null)for(let t=0;t<e.length;t++)l(e[t]/o,i[t],c[t]);else{u.multiDrawElementsInstancedWEBGL(r,i,0,a,e,0,c,0,s);let t=0;for(let e=0;e<s;e++)t+=i[e]*c[e];n.update(t,r,1)}}this.setMode=i,this.setIndex=s,this.render=c,this.renderInstances=l,this.renderMultiDraw=u,this.renderMultiDrawInstances=d}function pl(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function r(t,r,i){switch(n.calls++,r){case e.TRIANGLES:n.triangles+=t/3*i;break;case e.LINES:n.lines+=t/2*i;break;case e.LINE_STRIP:n.lines+=i*(t-1);break;case e.LINE_LOOP:n.lines+=i*t;break;case e.POINTS:n.points+=i*t;break;default:B(`WebGLInfo: Unknown draw mode:`,r)}}function i(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:i,update:r}}function ml(e,t,n){let r=new WeakMap,i=new Hn;function a(a,o,s){let c=a.morphTargetInfluences,l=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,u=l===void 0?0:l.length,d=r.get(o);if(d===void 0||d.count!==u){d!==void 0&&d.texture.dispose();let e=o.morphAttributes.position!==void 0,n=o.morphAttributes.normal!==void 0,a=o.morphAttributes.color!==void 0,s=o.morphAttributes.position||[],c=o.morphAttributes.normal||[],l=o.morphAttributes.color||[],f=0;e===!0&&(f=1),n===!0&&(f=2),a===!0&&(f=3);let p=o.attributes.position.count*f,m=1;p>t.maxTextureSize&&(m=Math.ceil(p/t.maxTextureSize),p=t.maxTextureSize);let h=new Float32Array(p*m*4*u),g=new Gn(h,p,m,u);g.type=Ve,g.needsUpdate=!0;let _=f*4;for(let t=0;t<u;t++){let r=s[t],o=c[t],u=l[t],d=p*m*4*t;for(let t=0;t<r.count;t++){let s=t*_;e===!0&&(i.fromBufferAttribute(r,t),h[d+s+0]=i.x,h[d+s+1]=i.y,h[d+s+2]=i.z,h[d+s+3]=0),n===!0&&(i.fromBufferAttribute(o,t),h[d+s+4]=i.x,h[d+s+5]=i.y,h[d+s+6]=i.z,h[d+s+7]=0),a===!0&&(i.fromBufferAttribute(u,t),h[d+s+8]=i.x,h[d+s+9]=i.y,h[d+s+10]=i.z,h[d+s+11]=u.itemSize===4?i.w:1)}}d={count:u,texture:g,size:new V(p,m)},r.set(o,d);function v(){g.dispose(),r.delete(o),o.removeEventListener(`dispose`,v)}o.addEventListener(`dispose`,v)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)s.getUniforms().setValue(e,`morphTexture`,a.morphTexture,n);else{let t=0;for(let e=0;e<c.length;e++)t+=c[e];let n=o.morphTargetsRelative?1:1-t;s.getUniforms().setValue(e,`morphTargetBaseInfluence`,n),s.getUniforms().setValue(e,`morphTargetInfluences`,c)}s.getUniforms().setValue(e,`morphTargetsTexture`,d.texture,n),s.getUniforms().setValue(e,`morphTargetsTextureSize`,d.size)}return{update:a}}function hl(e,t,n,r,i){let a=new WeakMap;function o(r){let o=i.render.frame,s=r.geometry,l=t.get(r,s);if(a.get(l)!==o&&(t.update(l),a.set(l,o)),r.isInstancedMesh&&(r.hasEventListener(`dispose`,c)===!1&&r.addEventListener(`dispose`,c),a.get(r)!==o&&(n.update(r.instanceMatrix,e.ARRAY_BUFFER),r.instanceColor!==null&&n.update(r.instanceColor,e.ARRAY_BUFFER),a.set(r,o))),r.isSkinnedMesh){let e=r.skeleton;a.get(e)!==o&&(e.update(),a.set(e,o))}return l}function s(){a=new WeakMap}function c(e){let t=e.target;t.removeEventListener(`dispose`,c),r.releaseStatesOfObject(t),n.remove(t.instanceMatrix),t.instanceColor!==null&&n.remove(t.instanceColor)}return{update:o,dispose:s}}var gl={1:`LINEAR_TONE_MAPPING`,2:`REINHARD_TONE_MAPPING`,3:`CINEON_TONE_MAPPING`,4:`ACES_FILMIC_TONE_MAPPING`,6:`AGX_TONE_MAPPING`,7:`NEUTRAL_TONE_MAPPING`,5:`CUSTOM_TONE_MAPPING`};function _l(e,t,n,r,i){let a=new Wn(t,n,{type:e,depthBuffer:r,stencilBuffer:i}),o=new Wn(t,n,{type:He,depthBuffer:!1,stencilBuffer:!1}),s=new Si;s.setAttribute(`position`,new G([-1,3,0,-1,-1,0,3,-1,0],3)),s.setAttribute(`uv`,new G([0,2,0,0,2,0],2));let c=new Ds({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),l=new K(s,c),u=new lc(-1,1,1,-1,0,1),d=null,f=null,p=!1,m,h=null,g=[],_=!1;this.setSize=function(e,t){a.setSize(e,t),o.setSize(e,t);for(let n=0;n<g.length;n++){let r=g[n];r.setSize&&r.setSize(e,t)}},this.setEffects=function(e){g=e,_=g.length>0&&g[0].isRenderPass===!0;let t=a.width,n=a.height;for(let e=0;e<g.length;e++){let r=g[e];r.setSize&&r.setSize(t,n)}},this.begin=function(e,t){if(p||e.toneMapping===0&&g.length===0)return!1;if(h=t,t!==null){let e=t.width,n=t.height;(a.width!==e||a.height!==n)&&this.setSize(e,n)}return _===!1&&e.setRenderTarget(a),m=e.toneMapping,e.toneMapping=0,!0},this.hasRenderPass=function(){return _},this.end=function(e,t){e.toneMapping=m,p=!0;let n=a,r=o;for(let i=0;i<g.length;i++){let a=g[i];if(a.enabled!==!1&&(a.render(e,r,n,t),a.needsSwap!==!1)){let e=n;n=r,r=e}}if(d!==e.outputColorSpace||f!==e.toneMapping){d=e.outputColorSpace,f=e.toneMapping,c.defines={},jn.getTransfer(d)===`srgb`&&(c.defines.SRGB_TRANSFER=``);let t=gl[f];t&&(c.defines[t]=``),c.needsUpdate=!0}c.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(h),e.render(l,u),h=null,p=!1},this.isCompositing=function(){return p},this.dispose=function(){a.dispose(),o.dispose(),s.dispose(),c.dispose()}}var vl=new Vn,yl=new za(1,1),bl=new Gn,xl=new Kn,Sl=new La,Cl=[],wl=[],Tl=new Float32Array(16),El=new Float32Array(9),Dl=new Float32Array(4);function Ol(e,t,n){let r=e[0];if(r<=0||r>0)return e;let i=t*n,a=Cl[i];if(a===void 0&&(a=new Float32Array(i),Cl[i]=a),t!==0){r.toArray(a,0);for(let r=1,i=0;r!==t;++r)i+=n,e[r].toArray(a,i)}return a}function kl(e,t){if(e.length!==t.length)return!1;for(let n=0,r=e.length;n<r;n++)if(e[n]!==t[n])return!1;return!0}function Al(e,t){for(let n=0,r=t.length;n<r;n++)e[n]=t[n]}function jl(e,t){let n=wl[t];n===void 0&&(n=new Int32Array(t),wl[t]=n);for(let r=0;r!==t;++r)n[r]=e.allocateTextureUnit();return n}function Ml(e,t){let n=this.cache;n[0]!==t&&(e.uniform1f(this.addr,t),n[0]=t)}function Nl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(kl(n,t))return;e.uniform2fv(this.addr,t),Al(n,t)}}function Pl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else if(t.r!==void 0)(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b);else{if(kl(n,t))return;e.uniform3fv(this.addr,t),Al(n,t)}}function Fl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(kl(n,t))return;e.uniform4fv(this.addr,t),Al(n,t)}}function Il(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(kl(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),Al(n,t)}else{if(kl(n,r))return;Dl.set(r),e.uniformMatrix2fv(this.addr,!1,Dl),Al(n,r)}}function Ll(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(kl(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),Al(n,t)}else{if(kl(n,r))return;El.set(r),e.uniformMatrix3fv(this.addr,!1,El),Al(n,r)}}function Rl(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(kl(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),Al(n,t)}else{if(kl(n,r))return;Tl.set(r),e.uniformMatrix4fv(this.addr,!1,Tl),Al(n,r)}}function zl(e,t){let n=this.cache;n[0]!==t&&(e.uniform1i(this.addr,t),n[0]=t)}function Bl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(kl(n,t))return;e.uniform2iv(this.addr,t),Al(n,t)}}function Vl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(kl(n,t))return;e.uniform3iv(this.addr,t),Al(n,t)}}function Hl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(kl(n,t))return;e.uniform4iv(this.addr,t),Al(n,t)}}function Ul(e,t){let n=this.cache;n[0]!==t&&(e.uniform1ui(this.addr,t),n[0]=t)}function Wl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(kl(n,t))return;e.uniform2uiv(this.addr,t),Al(n,t)}}function Gl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(kl(n,t))return;e.uniform3uiv(this.addr,t),Al(n,t)}}function Kl(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(kl(n,t))return;e.uniform4uiv(this.addr,t),Al(n,t)}}function ql(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i);let a;this.type===e.SAMPLER_2D_SHADOW?(yl.compareFunction=n.isReversedDepthBuffer()?518:515,a=yl):a=vl,n.setTexture2D(t||a,i)}function Jl(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture3D(t||xl,i)}function Yl(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTextureCube(t||Sl,i)}function Xl(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture2DArray(t||bl,i)}function Zl(e){switch(e){case 5126:return Ml;case 35664:return Nl;case 35665:return Pl;case 35666:return Fl;case 35674:return Il;case 35675:return Ll;case 35676:return Rl;case 5124:case 35670:return zl;case 35667:case 35671:return Bl;case 35668:case 35672:return Vl;case 35669:case 35673:return Hl;case 5125:return Ul;case 36294:return Wl;case 36295:return Gl;case 36296:return Kl;case 35678:case 36198:case 36298:case 36306:case 35682:return ql;case 35679:case 36299:case 36307:return Jl;case 35680:case 36300:case 36308:case 36293:return Yl;case 36289:case 36303:case 36311:case 36292:return Xl}}function Ql(e,t){e.uniform1fv(this.addr,t)}function $l(e,t){let n=Ol(t,this.size,2);e.uniform2fv(this.addr,n)}function eu(e,t){let n=Ol(t,this.size,3);e.uniform3fv(this.addr,n)}function tu(e,t){let n=Ol(t,this.size,4);e.uniform4fv(this.addr,n)}function nu(e,t){let n=Ol(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function ru(e,t){let n=Ol(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function iu(e,t){let n=Ol(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function au(e,t){e.uniform1iv(this.addr,t)}function ou(e,t){e.uniform2iv(this.addr,t)}function su(e,t){e.uniform3iv(this.addr,t)}function cu(e,t){e.uniform4iv(this.addr,t)}function lu(e,t){e.uniform1uiv(this.addr,t)}function uu(e,t){e.uniform2uiv(this.addr,t)}function du(e,t){e.uniform3uiv(this.addr,t)}function fu(e,t){e.uniform4uiv(this.addr,t)}function pu(e,t,n){let r=this.cache,i=t.length,a=jl(n,i);kl(r,a)||(e.uniform1iv(this.addr,a),Al(r,a));let o;o=this.type===e.SAMPLER_2D_SHADOW?yl:vl;for(let e=0;e!==i;++e)n.setTexture2D(t[e]||o,a[e])}function mu(e,t,n){let r=this.cache,i=t.length,a=jl(n,i);kl(r,a)||(e.uniform1iv(this.addr,a),Al(r,a));for(let e=0;e!==i;++e)n.setTexture3D(t[e]||xl,a[e])}function hu(e,t,n){let r=this.cache,i=t.length,a=jl(n,i);kl(r,a)||(e.uniform1iv(this.addr,a),Al(r,a));for(let e=0;e!==i;++e)n.setTextureCube(t[e]||Sl,a[e])}function gu(e,t,n){let r=this.cache,i=t.length,a=jl(n,i);kl(r,a)||(e.uniform1iv(this.addr,a),Al(r,a));for(let e=0;e!==i;++e)n.setTexture2DArray(t[e]||bl,a[e])}function _u(e){switch(e){case 5126:return Ql;case 35664:return $l;case 35665:return eu;case 35666:return tu;case 35674:return nu;case 35675:return ru;case 35676:return iu;case 5124:case 35670:return au;case 35667:case 35671:return ou;case 35668:case 35672:return su;case 35669:case 35673:return cu;case 5125:return lu;case 36294:return uu;case 36295:return du;case 36296:return fu;case 35678:case 36198:case 36298:case 36306:case 35682:return pu;case 35679:case 36299:case 36307:return mu;case 35680:case 36300:case 36308:case 36293:return hu;case 36289:case 36303:case 36311:case 36292:return gu}}var vu=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=Zl(t.type)}},yu=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=_u(t.type)}},bu=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let r=this.seq;for(let i=0,a=r.length;i!==a;++i){let a=r[i];a.setValue(e,t[a.id],n)}}},xu=/(\w+)(\])?(\[|\.)?/g;function Su(e,t){e.seq.push(t),e.map[t.id]=t}function Cu(e,t,n){let r=e.name,i=r.length;for(xu.lastIndex=0;;){let a=xu.exec(r),o=xu.lastIndex,s=a[1],c=a[2]===`]`,l=a[3];if(c&&(s|=0),l===void 0||l===`[`&&o+2===i){Su(n,l===void 0?new vu(s,e,t):new yu(s,e,t));break}{let e=n.map[s];e===void 0&&(e=new bu(s),Su(n,e)),n=e}}}var wu=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let r=0;r<n;++r){let n=e.getActiveUniform(t,r);Cu(n,e.getUniformLocation(t,n.name),this)}let r=[],i=[];for(let t of this.seq)t.type===e.SAMPLER_2D_SHADOW||t.type===e.SAMPLER_CUBE_SHADOW||t.type===e.SAMPLER_2D_ARRAY_SHADOW?r.push(t):i.push(t);r.length>0&&(this.seq=r.concat(i))}setValue(e,t,n,r){let i=this.map[t];i!==void 0&&i.setValue(e,n,r)}setOptional(e,t,n){let r=t[n];r!==void 0&&this.setValue(e,n,r)}static upload(e,t,n,r){for(let i=0,a=t.length;i!==a;++i){let a=t[i],o=n[a.id];o.needsUpdate!==!1&&a.setValue(e,o.value,r)}}static seqWithValue(e,t){let n=[];for(let r=0,i=e.length;r!==i;++r){let i=e[r];i.id in t&&n.push(i)}return n}};function Tu(e,t,n){let r=e.createShader(t);return e.shaderSource(r,n),e.compileShader(r),r}var Eu=37297,Du=0;function Ou(e,t){let n=e.split(`
`),r=[],i=Math.max(t-6,0),a=Math.min(t+6,n.length);for(let e=i;e<a;e++){let i=e+1;r.push(`${i===t?`>`:` `} ${i}: ${n[e]}`)}return r.join(`
`)}var ku=new En;function Au(e){jn._getMatrix(ku,jn.workingColorSpace,e);let t=`mat3( ${ku.elements.map(e=>e.toFixed(4))} )`;switch(jn.getTransfer(e)){case Xt:return[t,`LinearTransferOETF`];case Zt:return[t,`sRGBTransferOETF`];default:return z(`WebGLProgram: Unsupported color space: `,e),[t,`LinearTransferOETF`]}}function ju(e,t,n){let r=e.getShaderParameter(t,e.COMPILE_STATUS),i=(e.getShaderInfoLog(t)||``).trim();if(r&&i===``)return``;let a=/ERROR: 0:(\d+)/.exec(i);if(a){let r=parseInt(a[1]);return n.toUpperCase()+`

`+i+`

`+Ou(e.getShaderSource(t),r)}return i}function Mu(e,t){let n=Au(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${n[1]}( vec4( value.rgb * ${n[0]}, value.a ) );`,`}`].join(`
`)}var Nu={1:`Linear`,2:`Reinhard`,3:`Cineon`,4:`ACESFilmic`,6:`AgX`,7:`Neutral`,5:`Custom`};function Pu(e,t){let n=Nu[t];return n===void 0?(z(`WebGLProgram: Unsupported toneMapping:`,t),`vec3 `+e+`( vec3 color ) { return LinearToneMapping( color ); }`):`vec3 `+e+`( vec3 color ) { return `+n+`ToneMapping( color ); }`}var Fu=new H;function Iu(){return jn.getLuminanceCoefficients(Fu),[`float luminance( const in vec3 rgb ) {`,`	const vec3 weights = vec3( ${Fu.x.toFixed(4)}, ${Fu.y.toFixed(4)}, ${Fu.z.toFixed(4)} );`,`	return dot( weights, rgb );`,`}`].join(`
`)}function Lu(e){return[e.extensionClipCullDistance?`#extension GL_ANGLE_clip_cull_distance : require`:``,e.extensionMultiDraw?`#extension GL_ANGLE_multi_draw : require`:``].filter(Bu).join(`
`)}function Ru(e){let t=[];for(let n in e){let r=e[n];r!==!1&&t.push(`#define `+n+` `+r)}return t.join(`
`)}function zu(e,t){let n={},r=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let i=0;i<r;i++){let r=e.getActiveAttrib(t,i),a=r.name,o=1;r.type===e.FLOAT_MAT2&&(o=2),r.type===e.FLOAT_MAT3&&(o=3),r.type===e.FLOAT_MAT4&&(o=4),n[a]={type:r.type,location:e.getAttribLocation(t,a),locationSize:o}}return n}function Bu(e){return e!==``}function Vu(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Hu(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var Uu=/^[ \t]*#include +<([\w\d./]+)>/gm;function Wu(e){return e.replace(Uu,Ku)}var Gu=new Map;function Ku(e,t){let n=Mc[t];if(n===void 0){let e=Gu.get(t);if(e!==void 0)n=Mc[e],z(`WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.`,t,e);else throw Error(`Can not resolve #include <`+t+`>`)}return Wu(n)}var qu=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Ju(e){return e.replace(qu,Yu)}function Yu(e,t,n,r){let i=``;for(let e=parseInt(t);e<parseInt(n);e++)i+=r.replace(/\[\s*i\s*\]/g,`[ `+e+` ]`).replace(/UNROLLED_LOOP_INDEX/g,e);return i}function Xu(e){let t=`precision ${e.precision} float;
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
#define LOW_PRECISION`),t}var Zu={1:`SHADOWMAP_TYPE_PCF`,3:`SHADOWMAP_TYPE_VSM`};function Qu(e){return Zu[e.shadowMapType]||`SHADOWMAP_TYPE_BASIC`}var $u={301:`ENVMAP_TYPE_CUBE`,302:`ENVMAP_TYPE_CUBE`,306:`ENVMAP_TYPE_CUBE_UV`};function ed(e){return e.envMap===!1?`ENVMAP_TYPE_CUBE`:$u[e.envMapMode]||`ENVMAP_TYPE_CUBE`}var td={302:`ENVMAP_MODE_REFRACTION`};function nd(e){return e.envMap===!1?`ENVMAP_MODE_REFLECTION`:td[e.envMapMode]||`ENVMAP_MODE_REFLECTION`}var rd={0:`ENVMAP_BLENDING_MULTIPLY`,1:`ENVMAP_BLENDING_MIX`,2:`ENVMAP_BLENDING_ADD`};function id(e){return e.envMap===!1?`ENVMAP_BLENDING_NONE`:rd[e.combine]||`ENVMAP_BLENDING_NONE`}function ad(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,r=1/t;return{texelWidth:1/(3*Math.max(2**n,112)),texelHeight:r,maxMip:n}}function od(e,t,n,r){let i=e.getContext(),a=n.defines,o=n.vertexShader,s=n.fragmentShader,c=Qu(n),l=ed(n),u=nd(n),d=id(n),f=ad(n),p=Lu(n),m=Ru(a),h=i.createProgram(),g,_,v=n.glslVersion?`#version `+n.glslVersion+`
`:``;n.isRawShaderMaterial?(g=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(Bu).join(`
`),g.length>0&&(g+=`
`),_=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(Bu).join(`
`),_.length>0&&(_+=`
`)):(g=[Xu(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.extensionClipCullDistance?`#define USE_CLIP_DISTANCE`:``,n.batching?`#define USE_BATCHING`:``,n.batchingColor?`#define USE_BATCHING_COLOR`:``,n.instancing?`#define USE_INSTANCING`:``,n.instancingColor?`#define USE_INSTANCING_COLOR`:``,n.instancingMorph?`#define USE_INSTANCING_MORPH`:``,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.map?`#define USE_MAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+u:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.displacementMap?`#define USE_DISPLACEMENTMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.mapUv?`#define MAP_UV `+n.mapUv:``,n.alphaMapUv?`#define ALPHAMAP_UV `+n.alphaMapUv:``,n.lightMapUv?`#define LIGHTMAP_UV `+n.lightMapUv:``,n.aoMapUv?`#define AOMAP_UV `+n.aoMapUv:``,n.emissiveMapUv?`#define EMISSIVEMAP_UV `+n.emissiveMapUv:``,n.bumpMapUv?`#define BUMPMAP_UV `+n.bumpMapUv:``,n.normalMapUv?`#define NORMALMAP_UV `+n.normalMapUv:``,n.displacementMapUv?`#define DISPLACEMENTMAP_UV `+n.displacementMapUv:``,n.metalnessMapUv?`#define METALNESSMAP_UV `+n.metalnessMapUv:``,n.roughnessMapUv?`#define ROUGHNESSMAP_UV `+n.roughnessMapUv:``,n.anisotropyMapUv?`#define ANISOTROPYMAP_UV `+n.anisotropyMapUv:``,n.clearcoatMapUv?`#define CLEARCOATMAP_UV `+n.clearcoatMapUv:``,n.clearcoatNormalMapUv?`#define CLEARCOAT_NORMALMAP_UV `+n.clearcoatNormalMapUv:``,n.clearcoatRoughnessMapUv?`#define CLEARCOAT_ROUGHNESSMAP_UV `+n.clearcoatRoughnessMapUv:``,n.iridescenceMapUv?`#define IRIDESCENCEMAP_UV `+n.iridescenceMapUv:``,n.iridescenceThicknessMapUv?`#define IRIDESCENCE_THICKNESSMAP_UV `+n.iridescenceThicknessMapUv:``,n.sheenColorMapUv?`#define SHEEN_COLORMAP_UV `+n.sheenColorMapUv:``,n.sheenRoughnessMapUv?`#define SHEEN_ROUGHNESSMAP_UV `+n.sheenRoughnessMapUv:``,n.specularMapUv?`#define SPECULARMAP_UV `+n.specularMapUv:``,n.specularColorMapUv?`#define SPECULAR_COLORMAP_UV `+n.specularColorMapUv:``,n.specularIntensityMapUv?`#define SPECULAR_INTENSITYMAP_UV `+n.specularIntensityMapUv:``,n.transmissionMapUv?`#define TRANSMISSIONMAP_UV `+n.transmissionMapUv:``,n.thicknessMapUv?`#define THICKNESSMAP_UV `+n.thicknessMapUv:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexColors?`#define USE_COLOR`:``,n.vertexAlphas?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.flatShading?`#define FLAT_SHADED`:``,n.skinning?`#define USE_SKINNING`:``,n.morphTargets?`#define USE_MORPHTARGETS`:``,n.morphNormals&&n.flatShading===!1?`#define USE_MORPHNORMALS`:``,n.morphColors?`#define USE_MORPHCOLORS`:``,n.morphTargetsCount>0?`#define MORPHTARGETS_TEXTURE_STRIDE `+n.morphTextureStride:``,n.morphTargetsCount>0?`#define MORPHTARGETS_COUNT `+n.morphTargetsCount:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.sizeAttenuation?`#define USE_SIZEATTENUATION`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 modelMatrix;`,`uniform mat4 modelViewMatrix;`,`uniform mat4 projectionMatrix;`,`uniform mat4 viewMatrix;`,`uniform mat3 normalMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,`#ifdef USE_INSTANCING`,`	attribute mat4 instanceMatrix;`,`#endif`,`#ifdef USE_INSTANCING_COLOR`,`	attribute vec3 instanceColor;`,`#endif`,`#ifdef USE_INSTANCING_MORPH`,`	uniform sampler2D morphTexture;`,`#endif`,`attribute vec3 position;`,`attribute vec3 normal;`,`attribute vec2 uv;`,`#ifdef USE_UV1`,`	attribute vec2 uv1;`,`#endif`,`#ifdef USE_UV2`,`	attribute vec2 uv2;`,`#endif`,`#ifdef USE_UV3`,`	attribute vec2 uv3;`,`#endif`,`#ifdef USE_TANGENT`,`	attribute vec4 tangent;`,`#endif`,`#if defined( USE_COLOR_ALPHA )`,`	attribute vec4 color;`,`#elif defined( USE_COLOR )`,`	attribute vec3 color;`,`#endif`,`#ifdef USE_SKINNING`,`	attribute vec4 skinIndex;`,`	attribute vec4 skinWeight;`,`#endif`,`
`].filter(Bu).join(`
`),_=[Xu(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.alphaToCoverage?`#define ALPHA_TO_COVERAGE`:``,n.map?`#define USE_MAP`:``,n.matcap?`#define USE_MATCAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+l:``,n.envMap?`#define `+u:``,n.envMap?`#define `+d:``,f?`#define CUBEUV_TEXEL_WIDTH `+f.texelWidth:``,f?`#define CUBEUV_TEXEL_HEIGHT `+f.texelHeight:``,f?`#define CUBEUV_MAX_MIP `+f.maxMip+`.0`:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoat?`#define USE_CLEARCOAT`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.dispersion?`#define USE_DISPERSION`:``,n.iridescence?`#define USE_IRIDESCENCE`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaTest?`#define USE_ALPHATEST`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.sheen?`#define USE_SHEEN`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexColors||n.instancingColor?`#define USE_COLOR`:``,n.vertexAlphas||n.batchingColor?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.gradientMap?`#define USE_GRADIENTMAP`:``,n.flatShading?`#define FLAT_SHADED`:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.premultipliedAlpha?`#define PREMULTIPLIED_ALPHA`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.decodeVideoTexture?`#define DECODE_VIDEO_TEXTURE`:``,n.decodeVideoTextureEmissive?`#define DECODE_VIDEO_TEXTURE_EMISSIVE`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 viewMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,n.toneMapping===0?``:`#define TONE_MAPPING`,n.toneMapping===0?``:Mc.tonemapping_pars_fragment,n.toneMapping===0?``:Pu(`toneMapping`,n.toneMapping),n.dithering?`#define DITHERING`:``,n.opaque?`#define OPAQUE`:``,Mc.colorspace_pars_fragment,Mu(`linearToOutputTexel`,n.outputColorSpace),Iu(),n.useDepthPacking?`#define DEPTH_PACKING `+n.depthPacking:``,`
`].filter(Bu).join(`
`)),o=Wu(o),o=Vu(o,n),o=Hu(o,n),s=Wu(s),s=Vu(s,n),s=Hu(s,n),o=Ju(o),s=Ju(s),n.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,g=[p,`#define attribute in`,`#define varying out`,`#define texture2D texture`].join(`
`)+`
`+g,_=[`#define varying in`,n.glslVersion===`300 es`?``:`layout(location = 0) out highp vec4 pc_fragColor;`,n.glslVersion===`300 es`?``:`#define gl_FragColor pc_fragColor`,`#define gl_FragDepthEXT gl_FragDepth`,`#define texture2D texture`,`#define textureCube texture`,`#define texture2DProj textureProj`,`#define texture2DLodEXT textureLod`,`#define texture2DProjLodEXT textureProjLod`,`#define textureCubeLodEXT textureLod`,`#define texture2DGradEXT textureGrad`,`#define texture2DProjGradEXT textureProjGrad`,`#define textureCubeGradEXT textureGrad`].join(`
`)+`
`+_);let y=v+g+o,b=v+_+s,x=Tu(i,i.VERTEX_SHADER,y),S=Tu(i,i.FRAGMENT_SHADER,b);i.attachShader(h,x),i.attachShader(h,S),n.index0AttributeName===void 0?n.morphTargets===!0&&i.bindAttribLocation(h,0,`position`):i.bindAttribLocation(h,0,n.index0AttributeName),i.linkProgram(h);function C(t){if(e.debug.checkShaderErrors){let n=i.getProgramInfoLog(h)||``,r=i.getShaderInfoLog(x)||``,a=i.getShaderInfoLog(S)||``,o=n.trim(),s=r.trim(),c=a.trim(),l=!0,u=!0;if(i.getProgramParameter(h,i.LINK_STATUS)===!1){if(l=!1,typeof e.debug.onShaderError==`function`)e.debug.onShaderError(i,h,x,S);else{let e=ju(i,x,`vertex`),n=ju(i,S,`fragment`);B(`THREE.WebGLProgram: Shader Error `+i.getError()+` - VALIDATE_STATUS `+i.getProgramParameter(h,i.VALIDATE_STATUS)+`

Material Name: `+t.name+`
Material Type: `+t.type+`

Program Info Log: `+o+`
`+e+`
`+n)}}else o===``?(s===``||c===``)&&(u=!1):z(`WebGLProgram: Program Info Log:`,o);u&&(t.diagnostics={runnable:l,programLog:o,vertexShader:{log:s,prefix:g},fragmentShader:{log:c,prefix:_}})}i.deleteShader(x),i.deleteShader(S),w=new wu(i,h),T=zu(i,h)}let w;this.getUniforms=function(){return w===void 0&&C(this),w};let T;this.getAttributes=function(){return T===void 0&&C(this),T};let E=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return E===!1&&(E=i.getProgramParameter(h,Eu)),E},this.destroy=function(){r.releaseStatesOfProgram(this),i.deleteProgram(h),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=Du++,this.cacheKey=t,this.usedTimes=1,this.program=h,this.vertexShader=x,this.fragmentShader=S,this}var sd=0,cd=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){let t=e.vertexShader,n=e.fragmentShader,r=this._getShaderStage(t),i=this._getShaderStage(n),a=this._getShaderCacheForMaterial(e);return a.has(r)===!1&&(a.add(r),r.usedTimes++),a.has(i)===!1&&(a.add(i),i.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let e of t)e.usedTimes--,e.usedTimes===0&&this.shaderCache.delete(e.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new ld(e),t.set(e,n)),n}},ld=class{constructor(e){this.id=sd++,this.code=e,this.usedTimes=0}};function ud(e,t,n,r,i,a){let o=new ir,s=new cd,c=new Set,l=[],u=new Map,d=r.logarithmicDepthBuffer,f=r.precision,p={MeshDepthMaterial:`depth`,MeshDistanceMaterial:`distance`,MeshNormalMaterial:`normal`,MeshBasicMaterial:`basic`,MeshLambertMaterial:`lambert`,MeshPhongMaterial:`phong`,MeshToonMaterial:`toon`,MeshStandardMaterial:`physical`,MeshPhysicalMaterial:`physical`,MeshMatcapMaterial:`matcap`,LineBasicMaterial:`basic`,LineDashedMaterial:`dashed`,PointsMaterial:`points`,ShadowMaterial:`shadow`,SpriteMaterial:`sprite`};function m(e){return c.add(e),e===0?`uv`:`uv${e}`}function h(i,o,l,u,h){let g=u.fog,_=h.geometry,v=i.isMeshStandardMaterial||i.isMeshLambertMaterial||i.isMeshPhongMaterial?u.environment:null,y=i.isMeshStandardMaterial||i.isMeshLambertMaterial&&!i.envMap||i.isMeshPhongMaterial&&!i.envMap,b=t.get(i.envMap||v,y),x=b&&b.mapping===306?b.image.height:null,S=p[i.type];i.precision!==null&&(f=r.getMaxPrecision(i.precision),f!==i.precision&&z(`WebGLProgram.getParameters:`,i.precision,`not supported, using`,f,`instead.`));let C=_.morphAttributes.position||_.morphAttributes.normal||_.morphAttributes.color,w=C===void 0?0:C.length,T=0;_.morphAttributes.position!==void 0&&(T=1),_.morphAttributes.normal!==void 0&&(T=2),_.morphAttributes.color!==void 0&&(T=3);let E,D,O,k;if(S){let e=Nc[S];E=e.vertexShader,D=e.fragmentShader}else E=i.vertexShader,D=i.fragmentShader,s.update(i),O=s.getVertexShaderID(i),k=s.getFragmentShaderID(i);let A=e.getRenderTarget(),j=e.state.buffers.depth.getReversed(),M=h.isInstancedMesh===!0,N=h.isBatchedMesh===!0,ee=!!i.map,P=!!i.matcap,te=!!b,ne=!!i.aoMap,re=!!i.lightMap,ie=!!i.bumpMap,ae=!!i.normalMap,oe=!!i.displacementMap,F=!!i.emissiveMap,se=!!i.metalnessMap,ce=!!i.roughnessMap,le=i.anisotropy>0,ue=i.clearcoat>0,de=i.dispersion>0,fe=i.iridescence>0,pe=i.sheen>0,me=i.transmission>0,he=le&&!!i.anisotropyMap,ge=ue&&!!i.clearcoatMap,I=ue&&!!i.clearcoatNormalMap,_e=ue&&!!i.clearcoatRoughnessMap,ve=fe&&!!i.iridescenceMap,ye=fe&&!!i.iridescenceThicknessMap,L=pe&&!!i.sheenColorMap,be=pe&&!!i.sheenRoughnessMap,R=!!i.specularMap,xe=!!i.specularColorMap,Se=!!i.specularIntensityMap,Ce=me&&!!i.transmissionMap,we=me&&!!i.thicknessMap,Te=!!i.gradientMap,Ee=!!i.alphaMap,De=i.alphaTest>0,Oe=!!i.alphaHash,ke=!!i.extensions,Ae=0;i.toneMapped&&(A===null||A.isXRRenderTarget===!0)&&(Ae=e.toneMapping);let je={shaderID:S,shaderType:i.type,shaderName:i.name,vertexShader:E,fragmentShader:D,defines:i.defines,customVertexShaderID:O,customFragmentShaderID:k,isRawShaderMaterial:i.isRawShaderMaterial===!0,glslVersion:i.glslVersion,precision:f,batching:N,batchingColor:N&&h._colorsTexture!==null,instancing:M,instancingColor:M&&h.instanceColor!==null,instancingMorph:M&&h.morphTexture!==null,outputColorSpace:A===null?e.outputColorSpace:A.isXRRenderTarget===!0?A.texture.colorSpace:Yt,alphaToCoverage:!!i.alphaToCoverage,map:ee,matcap:P,envMap:te,envMapMode:te&&b.mapping,envMapCubeUVHeight:x,aoMap:ne,lightMap:re,bumpMap:ie,normalMap:ae,displacementMap:oe,emissiveMap:F,normalMapObjectSpace:ae&&i.normalMapType===1,normalMapTangentSpace:ae&&i.normalMapType===0,metalnessMap:se,roughnessMap:ce,anisotropy:le,anisotropyMap:he,clearcoat:ue,clearcoatMap:ge,clearcoatNormalMap:I,clearcoatRoughnessMap:_e,dispersion:de,iridescence:fe,iridescenceMap:ve,iridescenceThicknessMap:ye,sheen:pe,sheenColorMap:L,sheenRoughnessMap:be,specularMap:R,specularColorMap:xe,specularIntensityMap:Se,transmission:me,transmissionMap:Ce,thicknessMap:we,gradientMap:Te,opaque:i.transparent===!1&&i.blending===1&&i.alphaToCoverage===!1,alphaMap:Ee,alphaTest:De,alphaHash:Oe,combine:i.combine,mapUv:ee&&m(i.map.channel),aoMapUv:ne&&m(i.aoMap.channel),lightMapUv:re&&m(i.lightMap.channel),bumpMapUv:ie&&m(i.bumpMap.channel),normalMapUv:ae&&m(i.normalMap.channel),displacementMapUv:oe&&m(i.displacementMap.channel),emissiveMapUv:F&&m(i.emissiveMap.channel),metalnessMapUv:se&&m(i.metalnessMap.channel),roughnessMapUv:ce&&m(i.roughnessMap.channel),anisotropyMapUv:he&&m(i.anisotropyMap.channel),clearcoatMapUv:ge&&m(i.clearcoatMap.channel),clearcoatNormalMapUv:I&&m(i.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:_e&&m(i.clearcoatRoughnessMap.channel),iridescenceMapUv:ve&&m(i.iridescenceMap.channel),iridescenceThicknessMapUv:ye&&m(i.iridescenceThicknessMap.channel),sheenColorMapUv:L&&m(i.sheenColorMap.channel),sheenRoughnessMapUv:be&&m(i.sheenRoughnessMap.channel),specularMapUv:R&&m(i.specularMap.channel),specularColorMapUv:xe&&m(i.specularColorMap.channel),specularIntensityMapUv:Se&&m(i.specularIntensityMap.channel),transmissionMapUv:Ce&&m(i.transmissionMap.channel),thicknessMapUv:we&&m(i.thicknessMap.channel),alphaMapUv:Ee&&m(i.alphaMap.channel),vertexTangents:!!_.attributes.tangent&&(ae||le),vertexColors:i.vertexColors,vertexAlphas:i.vertexColors===!0&&!!_.attributes.color&&_.attributes.color.itemSize===4,pointsUvs:h.isPoints===!0&&!!_.attributes.uv&&(ee||Ee),fog:!!g,useFog:i.fog===!0,fogExp2:!!g&&g.isFogExp2,flatShading:i.wireframe===!1&&(i.flatShading===!0||_.attributes.normal===void 0&&ae===!1&&(i.isMeshLambertMaterial||i.isMeshPhongMaterial||i.isMeshStandardMaterial||i.isMeshPhysicalMaterial)),sizeAttenuation:i.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:j,skinning:h.isSkinnedMesh===!0,morphTargets:_.morphAttributes.position!==void 0,morphNormals:_.morphAttributes.normal!==void 0,morphColors:_.morphAttributes.color!==void 0,morphTargetsCount:w,morphTextureStride:T,numDirLights:o.directional.length,numPointLights:o.point.length,numSpotLights:o.spot.length,numSpotLightMaps:o.spotLightMap.length,numRectAreaLights:o.rectArea.length,numHemiLights:o.hemi.length,numDirLightShadows:o.directionalShadowMap.length,numPointLightShadows:o.pointShadowMap.length,numSpotLightShadows:o.spotShadowMap.length,numSpotLightShadowsWithMaps:o.numSpotLightShadowsWithMaps,numLightProbes:o.numLightProbes,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:i.dithering,shadowMapEnabled:e.shadowMap.enabled&&l.length>0,shadowMapType:e.shadowMap.type,toneMapping:Ae,decodeVideoTexture:ee&&i.map.isVideoTexture===!0&&jn.getTransfer(i.map.colorSpace)===`srgb`,decodeVideoTextureEmissive:F&&i.emissiveMap.isVideoTexture===!0&&jn.getTransfer(i.emissiveMap.colorSpace)===`srgb`,premultipliedAlpha:i.premultipliedAlpha,doubleSided:i.side===2,flipSided:i.side===1,useDepthPacking:i.depthPacking>=0,depthPacking:i.depthPacking||0,index0AttributeName:i.index0AttributeName,extensionClipCullDistance:ke&&i.extensions.clipCullDistance===!0&&n.has(`WEBGL_clip_cull_distance`),extensionMultiDraw:(ke&&i.extensions.multiDraw===!0||N)&&n.has(`WEBGL_multi_draw`),rendererExtensionParallelShaderCompile:n.has(`KHR_parallel_shader_compile`),customProgramCacheKey:i.customProgramCacheKey()};return je.vertexUv1s=c.has(1),je.vertexUv2s=c.has(2),je.vertexUv3s=c.has(3),c.clear(),je}function g(t){let n=[];if(t.shaderID?n.push(t.shaderID):(n.push(t.customVertexShaderID),n.push(t.customFragmentShaderID)),t.defines!==void 0)for(let e in t.defines)n.push(e),n.push(t.defines[e]);return t.isRawShaderMaterial===!1&&(_(n,t),v(n,t),n.push(e.outputColorSpace)),n.push(t.customProgramCacheKey),n.join()}function _(e,t){e.push(t.precision),e.push(t.outputColorSpace),e.push(t.envMapMode),e.push(t.envMapCubeUVHeight),e.push(t.mapUv),e.push(t.alphaMapUv),e.push(t.lightMapUv),e.push(t.aoMapUv),e.push(t.bumpMapUv),e.push(t.normalMapUv),e.push(t.displacementMapUv),e.push(t.emissiveMapUv),e.push(t.metalnessMapUv),e.push(t.roughnessMapUv),e.push(t.anisotropyMapUv),e.push(t.clearcoatMapUv),e.push(t.clearcoatNormalMapUv),e.push(t.clearcoatRoughnessMapUv),e.push(t.iridescenceMapUv),e.push(t.iridescenceThicknessMapUv),e.push(t.sheenColorMapUv),e.push(t.sheenRoughnessMapUv),e.push(t.specularMapUv),e.push(t.specularColorMapUv),e.push(t.specularIntensityMapUv),e.push(t.transmissionMapUv),e.push(t.thicknessMapUv),e.push(t.combine),e.push(t.fogExp2),e.push(t.sizeAttenuation),e.push(t.morphTargetsCount),e.push(t.morphAttributeCount),e.push(t.numDirLights),e.push(t.numPointLights),e.push(t.numSpotLights),e.push(t.numSpotLightMaps),e.push(t.numHemiLights),e.push(t.numRectAreaLights),e.push(t.numDirLightShadows),e.push(t.numPointLightShadows),e.push(t.numSpotLightShadows),e.push(t.numSpotLightShadowsWithMaps),e.push(t.numLightProbes),e.push(t.shadowMapType),e.push(t.toneMapping),e.push(t.numClippingPlanes),e.push(t.numClipIntersection),e.push(t.depthPacking)}function v(e,t){o.disableAll(),t.instancing&&o.enable(0),t.instancingColor&&o.enable(1),t.instancingMorph&&o.enable(2),t.matcap&&o.enable(3),t.envMap&&o.enable(4),t.normalMapObjectSpace&&o.enable(5),t.normalMapTangentSpace&&o.enable(6),t.clearcoat&&o.enable(7),t.iridescence&&o.enable(8),t.alphaTest&&o.enable(9),t.vertexColors&&o.enable(10),t.vertexAlphas&&o.enable(11),t.vertexUv1s&&o.enable(12),t.vertexUv2s&&o.enable(13),t.vertexUv3s&&o.enable(14),t.vertexTangents&&o.enable(15),t.anisotropy&&o.enable(16),t.alphaHash&&o.enable(17),t.batching&&o.enable(18),t.dispersion&&o.enable(19),t.batchingColor&&o.enable(20),t.gradientMap&&o.enable(21),e.push(o.mask),o.disableAll(),t.fog&&o.enable(0),t.useFog&&o.enable(1),t.flatShading&&o.enable(2),t.logarithmicDepthBuffer&&o.enable(3),t.reversedDepthBuffer&&o.enable(4),t.skinning&&o.enable(5),t.morphTargets&&o.enable(6),t.morphNormals&&o.enable(7),t.morphColors&&o.enable(8),t.premultipliedAlpha&&o.enable(9),t.shadowMapEnabled&&o.enable(10),t.doubleSided&&o.enable(11),t.flipSided&&o.enable(12),t.useDepthPacking&&o.enable(13),t.dithering&&o.enable(14),t.transmission&&o.enable(15),t.sheen&&o.enable(16),t.opaque&&o.enable(17),t.pointsUvs&&o.enable(18),t.decodeVideoTexture&&o.enable(19),t.decodeVideoTextureEmissive&&o.enable(20),t.alphaToCoverage&&o.enable(21),e.push(o.mask)}function y(e){let t=p[e.type],n;if(t){let e=Nc[t];n=Cs.clone(e.uniforms)}else n=e.uniforms;return n}function b(t,n){let r=u.get(n);return r===void 0?(r=new od(e,n,t,i),l.push(r),u.set(n,r)):++r.usedTimes,r}function x(e){if(--e.usedTimes===0){let t=l.indexOf(e);l[t]=l[l.length-1],l.pop(),u.delete(e.cacheKey),e.destroy()}}function S(e){s.remove(e)}function C(){s.dispose()}return{getParameters:h,getProgramCacheKey:g,getUniforms:y,acquireProgram:b,releaseProgram:x,releaseShaderCache:S,programs:l,dispose:C}}function dd(){let e=new WeakMap;function t(t){return e.has(t)}function n(t){let n=e.get(t);return n===void 0&&(n={},e.set(t,n)),n}function r(t){e.delete(t)}function i(t,n,r){e.get(t)[n]=r}function a(){e=new WeakMap}return{has:t,get:n,remove:r,update:i,dispose:a}}function fd(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.material.id===t.material.id?e.materialVariant===t.materialVariant?e.z===t.z?e.id-t.id:e.z-t.z:e.materialVariant-t.materialVariant:e.material.id-t.material.id:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function pd(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.z===t.z?e.id-t.id:t.z-e.z:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function md(){let e=[],t=0,n=[],r=[],i=[];function a(){t=0,n.length=0,r.length=0,i.length=0}function o(e){let t=0;return e.isInstancedMesh&&(t+=2),e.isSkinnedMesh&&(t+=1),t}function s(n,r,i,a,s,c){let l=e[t];return l===void 0?(l={id:n.id,object:n,geometry:r,material:i,materialVariant:o(n),groupOrder:a,renderOrder:n.renderOrder,z:s,group:c},e[t]=l):(l.id=n.id,l.object=n,l.geometry=r,l.material=i,l.materialVariant=o(n),l.groupOrder=a,l.renderOrder=n.renderOrder,l.z=s,l.group=c),t++,l}function c(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.push(u):a.transparent===!0?i.push(u):n.push(u)}function l(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.unshift(u):a.transparent===!0?i.unshift(u):n.unshift(u)}function u(e,t){n.length>1&&n.sort(e||fd),r.length>1&&r.sort(t||pd),i.length>1&&i.sort(t||pd)}function d(){for(let n=t,r=e.length;n<r;n++){let t=e[n];if(t.id===null)break;t.id=null,t.object=null,t.geometry=null,t.material=null,t.group=null}}return{opaque:n,transmissive:r,transparent:i,init:a,push:c,unshift:l,finish:d,sort:u}}function hd(){let e=new WeakMap;function t(t,n){let r=e.get(t),i;return r===void 0?(i=new md,e.set(t,[i])):n>=r.length?(i=new md,r.push(i)):i=r[n],i}function n(){e=new WeakMap}return{get:t,dispose:n}}function gd(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`DirectionalLight`:n={direction:new H,color:new W};break;case`SpotLight`:n={position:new H,direction:new H,color:new W,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case`PointLight`:n={position:new H,color:new W,distance:0,decay:0};break;case`HemisphereLight`:n={direction:new H,skyColor:new W,groundColor:new W};break;case`RectAreaLight`:n={color:new W,position:new H,halfWidth:new H,halfHeight:new H}}return e[t.id]=n,n}}}function _d(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`DirectionalLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new V};break;case`SpotLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new V};break;case`PointLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new V,shadowCameraNear:1,shadowCameraFar:1e3}}return e[t.id]=n,n}}}var vd=0;function yd(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+ +!!t.map-!!e.map}function bd(e){let t=new gd,n=_d(),r={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let e=0;e<9;e++)r.probe.push(new H);let i=new H,a=new qn,o=new qn;function s(i){let a=0,o=0,s=0;for(let e=0;e<9;e++)r.probe[e].set(0,0,0);let c=0,l=0,u=0,d=0,f=0,p=0,m=0,h=0,g=0,_=0,v=0;i.sort(yd);for(let e=0,y=i.length;e<y;e++){let y=i[e],b=y.color,x=y.intensity,S=y.distance,C=null;if(y.shadow&&y.shadow.map&&(C=y.shadow.map.texture.format===1030?y.shadow.map.texture:y.shadow.map.depthTexture||y.shadow.map.texture),y.isAmbientLight)a+=b.r*x,o+=b.g*x,s+=b.b*x;else if(y.isLightProbe){for(let e=0;e<9;e++)r.probe[e].addScaledVector(y.sh.coefficients[e],x);v++}else if(y.isDirectionalLight){let e=t.get(y);if(e.color.copy(y.color).multiplyScalar(y.intensity),y.castShadow){let e=y.shadow,t=n.get(y);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,r.directionalShadow[c]=t,r.directionalShadowMap[c]=C,r.directionalShadowMatrix[c]=y.shadow.matrix,p++}r.directional[c]=e,c++}else if(y.isSpotLight){let e=t.get(y);e.position.setFromMatrixPosition(y.matrixWorld),e.color.copy(b).multiplyScalar(x),e.distance=S,e.coneCos=Math.cos(y.angle),e.penumbraCos=Math.cos(y.angle*(1-y.penumbra)),e.decay=y.decay,r.spot[u]=e;let i=y.shadow;if(y.map&&(r.spotLightMap[g]=y.map,g++,i.updateMatrices(y),y.castShadow&&_++),r.spotLightMatrix[u]=i.matrix,y.castShadow){let e=n.get(y);e.shadowIntensity=i.intensity,e.shadowBias=i.bias,e.shadowNormalBias=i.normalBias,e.shadowRadius=i.radius,e.shadowMapSize=i.mapSize,r.spotShadow[u]=e,r.spotShadowMap[u]=C,h++}u++}else if(y.isRectAreaLight){let e=t.get(y);e.color.copy(b).multiplyScalar(x),e.halfWidth.set(y.width*.5,0,0),e.halfHeight.set(0,y.height*.5,0),r.rectArea[d]=e,d++}else if(y.isPointLight){let e=t.get(y);if(e.color.copy(y.color).multiplyScalar(y.intensity),e.distance=y.distance,e.decay=y.decay,y.castShadow){let e=y.shadow,t=n.get(y);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,t.shadowCameraNear=e.camera.near,t.shadowCameraFar=e.camera.far,r.pointShadow[l]=t,r.pointShadowMap[l]=C,r.pointShadowMatrix[l]=y.shadow.matrix,m++}r.point[l]=e,l++}else if(y.isHemisphereLight){let e=t.get(y);e.skyColor.copy(y.color).multiplyScalar(x),e.groundColor.copy(y.groundColor).multiplyScalar(x),r.hemi[f]=e,f++}}d>0&&(e.has(`OES_texture_float_linear`)===!0?(r.rectAreaLTC1=q.LTC_FLOAT_1,r.rectAreaLTC2=q.LTC_FLOAT_2):(r.rectAreaLTC1=q.LTC_HALF_1,r.rectAreaLTC2=q.LTC_HALF_2)),r.ambient[0]=a,r.ambient[1]=o,r.ambient[2]=s;let y=r.hash;(y.directionalLength!==c||y.pointLength!==l||y.spotLength!==u||y.rectAreaLength!==d||y.hemiLength!==f||y.numDirectionalShadows!==p||y.numPointShadows!==m||y.numSpotShadows!==h||y.numSpotMaps!==g||y.numLightProbes!==v)&&(r.directional.length=c,r.spot.length=u,r.rectArea.length=d,r.point.length=l,r.hemi.length=f,r.directionalShadow.length=p,r.directionalShadowMap.length=p,r.pointShadow.length=m,r.pointShadowMap.length=m,r.spotShadow.length=h,r.spotShadowMap.length=h,r.directionalShadowMatrix.length=p,r.pointShadowMatrix.length=m,r.spotLightMatrix.length=h+g-_,r.spotLightMap.length=g,r.numSpotLightShadowsWithMaps=_,r.numLightProbes=v,y.directionalLength=c,y.pointLength=l,y.spotLength=u,y.rectAreaLength=d,y.hemiLength=f,y.numDirectionalShadows=p,y.numPointShadows=m,y.numSpotShadows=h,y.numSpotMaps=g,y.numLightProbes=v,r.version=vd++)}function c(e,t){let n=0,s=0,c=0,l=0,u=0,d=t.matrixWorldInverse;for(let t=0,f=e.length;t<f;t++){let f=e[t];if(f.isDirectionalLight){let e=r.directional[n];e.direction.setFromMatrixPosition(f.matrixWorld),i.setFromMatrixPosition(f.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(d),n++}else if(f.isSpotLight){let e=r.spot[c];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),e.direction.setFromMatrixPosition(f.matrixWorld),i.setFromMatrixPosition(f.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(d),c++}else if(f.isRectAreaLight){let e=r.rectArea[l];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),o.identity(),a.copy(f.matrixWorld),a.premultiply(d),o.extractRotation(a),e.halfWidth.set(f.width*.5,0,0),e.halfHeight.set(0,f.height*.5,0),e.halfWidth.applyMatrix4(o),e.halfHeight.applyMatrix4(o),l++}else if(f.isPointLight){let e=r.point[s];e.position.setFromMatrixPosition(f.matrixWorld),e.position.applyMatrix4(d),s++}else if(f.isHemisphereLight){let e=r.hemi[u];e.direction.setFromMatrixPosition(f.matrixWorld),e.direction.transformDirection(d),u++}}}return{setup:s,setupView:c,state:r}}function xd(e){let t=new bd(e),n=[],r=[];function i(e){l.camera=e,n.length=0,r.length=0}function a(e){n.push(e)}function o(e){r.push(e)}function s(){t.setup(n)}function c(e){t.setupView(n,e)}let l={lightsArray:n,shadowsArray:r,camera:null,lights:t,transmissionRenderTarget:{}};return{init:i,state:l,setupLights:s,setupLightsView:c,pushLight:a,pushShadow:o}}function Sd(e){let t=new WeakMap;function n(n,r=0){let i=t.get(n),a;return i===void 0?(a=new xd(e),t.set(n,[a])):r>=i.length?(a=new xd(e),i.push(a)):a=i[r],a}function r(){t=new WeakMap}return{get:n,dispose:r}}var Cd=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,wd=`uniform sampler2D shadow_pass;
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
}`,Td=[new H(1,0,0),new H(-1,0,0),new H(0,1,0),new H(0,-1,0),new H(0,0,1),new H(0,0,-1)],Ed=[new H(0,-1,0),new H(0,-1,0),new H(0,0,1),new H(0,0,-1),new H(0,-1,0),new H(0,-1,0)],Dd=new qn,Od=new H,kd=new H;function Ad(e,t,n){let r=new ka,i=new V,a=new V,o=new Hn,s=new js,c=new Ms,l={},u=n.maxTextureSize,d={0:1,1:0,2:2},f=new Es({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new V},radius:{value:4}},vertexShader:Cd,fragmentShader:wd}),p=f.clone();p.defines.HORIZONTAL_PASS=1;let m=new Si;m.setAttribute(`position`,new ci(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let h=new K(m,f),g=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=1;let _=this.type;this.render=function(t,n,s){if(g.enabled===!1||g.autoUpdate===!1&&g.needsUpdate===!1||t.length===0)return;this.type===2&&(z(`WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.`),this.type=1);let c=e.getRenderTarget(),l=e.getActiveCubeFace(),d=e.getActiveMipmapLevel(),f=e.state;f.setBlending(0),f.buffers.depth.getReversed()===!0?f.buffers.color.setClear(0,0,0,0):f.buffers.color.setClear(1,1,1,1),f.buffers.depth.setTest(!0),f.setScissorTest(!1);let p=_!==this.type;p&&n.traverse(function(e){e.material&&(Array.isArray(e.material)?e.material.forEach(e=>e.needsUpdate=!0):e.material.needsUpdate=!0)});for(let c=0,l=t.length;c<l;c++){let l=t[c],d=l.shadow;if(d===void 0){z(`WebGLShadowMap:`,l,`has no shadow.`);continue}if(d.autoUpdate===!1&&d.needsUpdate===!1)continue;i.copy(d.mapSize);let m=d.getFrameExtents();i.multiply(m),a.copy(d.mapSize),(i.x>u||i.y>u)&&(i.x>u&&(a.x=Math.floor(u/m.x),i.x=a.x*m.x,d.mapSize.x=a.x),i.y>u&&(a.y=Math.floor(u/m.y),i.y=a.y*m.y,d.mapSize.y=a.y));let h=e.state.buffers.depth.getReversed();if(d.camera._reversedDepth=h,d.map===null||p===!0){if(d.map!==null&&(d.map.depthTexture!==null&&(d.map.depthTexture.dispose(),d.map.depthTexture=null),d.map.dispose()),this.type===3){if(l.isPointLight){z(`WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.`);continue}d.map=new Wn(i.x,i.y,{format:tt,type:He,minFilter:Me,magFilter:Me,generateMipmaps:!1}),d.map.texture.name=l.name+`.shadowMap`,d.map.depthTexture=new za(i.x,i.y,Ve),d.map.depthTexture.name=l.name+`.shadowMapDepth`,d.map.depthTexture.format=Ze,d.map.depthTexture.compareFunction=null,d.map.depthTexture.minFilter=ke,d.map.depthTexture.magFilter=ke}else l.isPointLight?(d.map=new cl(i.x),d.map.depthTexture=new Ba(i.x,Be)):(d.map=new Wn(i.x,i.y),d.map.depthTexture=new za(i.x,i.y,Be)),d.map.depthTexture.name=l.name+`.shadowMap`,d.map.depthTexture.format=Ze,this.type===1?(d.map.depthTexture.compareFunction=h?518:515,d.map.depthTexture.minFilter=Me,d.map.depthTexture.magFilter=Me):(d.map.depthTexture.compareFunction=null,d.map.depthTexture.minFilter=ke,d.map.depthTexture.magFilter=ke);d.camera.updateProjectionMatrix()}let g=d.map.isWebGLCubeRenderTarget?6:1;for(let t=0;t<g;t++){if(d.map.isWebGLCubeRenderTarget)e.setRenderTarget(d.map,t),e.clear();else{t===0&&(e.setRenderTarget(d.map),e.clear());let n=d.getViewport(t);o.set(a.x*n.x,a.y*n.y,a.x*n.z,a.y*n.w),f.viewport(o)}if(l.isPointLight){let e=d.camera,n=d.matrix,r=l.distance||e.far;r!==e.far&&(e.far=r,e.updateProjectionMatrix()),Od.setFromMatrixPosition(l.matrixWorld),e.position.copy(Od),kd.copy(e.position),kd.add(Td[t]),e.up.copy(Ed[t]),e.lookAt(kd),e.updateMatrixWorld(),n.makeTranslation(-Od.x,-Od.y,-Od.z),Dd.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),d._frustum.setFromProjectionMatrix(Dd,e.coordinateSystem,e.reversedDepth)}else d.updateMatrices(l);r=d.getFrustum(),b(n,s,d.camera,l,this.type)}d.isPointLightShadow!==!0&&this.type===3&&v(d,s),d.needsUpdate=!1}_=this.type,g.needsUpdate=!1,e.setRenderTarget(c,l,d)};function v(n,r){let a=t.update(h);f.defines.VSM_SAMPLES!==n.blurSamples&&(f.defines.VSM_SAMPLES=n.blurSamples,p.defines.VSM_SAMPLES=n.blurSamples,f.needsUpdate=!0,p.needsUpdate=!0),n.mapPass===null&&(n.mapPass=new Wn(i.x,i.y,{format:tt,type:He})),f.uniforms.shadow_pass.value=n.map.depthTexture,f.uniforms.resolution.value=n.mapSize,f.uniforms.radius.value=n.radius,e.setRenderTarget(n.mapPass),e.clear(),e.renderBufferDirect(r,null,a,f,h,null),p.uniforms.shadow_pass.value=n.mapPass.texture,p.uniforms.resolution.value=n.mapSize,p.uniforms.radius.value=n.radius,e.setRenderTarget(n.map),e.clear(),e.renderBufferDirect(r,null,a,p,h,null)}function y(t,n,r,i){let a=null,o=r.isPointLight===!0?t.customDistanceMaterial:t.customDepthMaterial;if(o!==void 0)a=o;else if(a=r.isPointLight===!0?c:s,e.localClippingEnabled&&n.clipShadows===!0&&Array.isArray(n.clippingPlanes)&&n.clippingPlanes.length!==0||n.displacementMap&&n.displacementScale!==0||n.alphaMap&&n.alphaTest>0||n.map&&n.alphaTest>0||n.alphaToCoverage===!0){let e=a.uuid,t=n.uuid,r=l[e];r===void 0&&(r={},l[e]=r);let i=r[t];i===void 0&&(i=a.clone(),r[t]=i,n.addEventListener(`dispose`,x)),a=i}if(a.visible=n.visible,a.wireframe=n.wireframe,i===3?a.side=n.shadowSide===null?n.side:n.shadowSide:a.side=n.shadowSide===null?d[n.side]:n.shadowSide,a.alphaMap=n.alphaMap,a.alphaTest=n.alphaToCoverage===!0?.5:n.alphaTest,a.map=n.map,a.clipShadows=n.clipShadows,a.clippingPlanes=n.clippingPlanes,a.clipIntersection=n.clipIntersection,a.displacementMap=n.displacementMap,a.displacementScale=n.displacementScale,a.displacementBias=n.displacementBias,a.wireframeLinewidth=n.wireframeLinewidth,a.linewidth=n.linewidth,r.isPointLight===!0&&a.isMeshDistanceMaterial===!0){let t=e.properties.get(a);t.light=r}return a}function b(n,i,a,o,s){if(n.visible===!1)return;if(n.layers.test(i.layers)&&(n.isMesh||n.isLine||n.isPoints)&&(n.castShadow||n.receiveShadow&&s===3)&&(!n.frustumCulled||r.intersectsObject(n))){n.modelViewMatrix.multiplyMatrices(a.matrixWorldInverse,n.matrixWorld);let r=t.update(n),c=n.material;if(Array.isArray(c)){let t=r.groups;for(let l=0,u=t.length;l<u;l++){let u=t[l],d=c[u.materialIndex];if(d&&d.visible){let t=y(n,d,o,s);n.onBeforeShadow(e,n,i,a,r,t,u),e.renderBufferDirect(a,null,r,t,n,u),n.onAfterShadow(e,n,i,a,r,t,u)}}}else if(c.visible){let t=y(n,c,o,s);n.onBeforeShadow(e,n,i,a,r,t,null),e.renderBufferDirect(a,null,r,t,n,null),n.onAfterShadow(e,n,i,a,r,t,null)}}let c=n.children;for(let e=0,t=c.length;e<t;e++)b(c[e],i,a,o,s)}function x(e){e.target.removeEventListener(`dispose`,x);for(let t in l){let n=l[t],r=e.target.uuid;r in n&&(n[r].dispose(),delete n[r])}}}function jd(e,t){function n(){let t=!1,n=new Hn,r=null,i=new Hn(0,0,0,0);return{setMask:function(n){r!==n&&!t&&(e.colorMask(n,n,n,n),r=n)},setLocked:function(e){t=e},setClear:function(t,r,a,o,s){s===!0&&(t*=o,r*=o,a*=o),n.set(t,r,a,o),i.equals(n)===!1&&(e.clearColor(t,r,a,o),i.copy(n))},reset:function(){t=!1,r=null,i.set(-1,0,0,0)}}}function r(){let n=!1,r=!1,i=null,a=null,o=null;return{setReversed:function(e){if(r!==e){let n=t.get(`EXT_clip_control`);e?n.clipControlEXT(n.LOWER_LEFT_EXT,n.ZERO_TO_ONE_EXT):n.clipControlEXT(n.LOWER_LEFT_EXT,n.NEGATIVE_ONE_TO_ONE_EXT),r=e;let i=o;o=null,this.setClear(i)}},getReversed:function(){return r},setTest:function(t){t?se(e.DEPTH_TEST):ce(e.DEPTH_TEST)},setMask:function(t){i!==t&&!n&&(e.depthMask(t),i=t)},setFunc:function(t){if(r&&(t=fn[t]),a!==t){switch(t){case 0:e.depthFunc(e.NEVER);break;case 1:e.depthFunc(e.ALWAYS);break;case 2:e.depthFunc(e.LESS);break;case 3:e.depthFunc(e.LEQUAL);break;case 4:e.depthFunc(e.EQUAL);break;case 5:e.depthFunc(e.GEQUAL);break;case 6:e.depthFunc(e.GREATER);break;case 7:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}a=t}},setLocked:function(e){n=e},setClear:function(t){o!==t&&(o=t,r&&(t=1-t),e.clearDepth(t))},reset:function(){n=!1,i=null,a=null,o=null,r=!1}}}function i(){let t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null;return{setTest:function(n){t||(n?se(e.STENCIL_TEST):ce(e.STENCIL_TEST))},setMask:function(r){n!==r&&!t&&(e.stencilMask(r),n=r)},setFunc:function(t,n,o){(r!==t||i!==n||a!==o)&&(e.stencilFunc(t,n,o),r=t,i=n,a=o)},setOp:function(t,n,r){(o!==t||s!==n||c!==r)&&(e.stencilOp(t,n,r),o=t,s=n,c=r)},setLocked:function(e){t=e},setClear:function(t){l!==t&&(e.clearStencil(t),l=t)},reset:function(){t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null}}}let a=new n,o=new r,s=new i,c=new WeakMap,l=new WeakMap,u={},d={},f=new WeakMap,p=[],m=null,h=!1,g=null,_=null,v=null,y=null,b=null,x=null,S=null,C=new W(0,0,0),w=0,T=!1,E=null,D=null,O=null,k=null,A=null,j=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),M=!1,N=0,ee=e.getParameter(e.VERSION);ee.indexOf(`WebGL`)===-1?ee.indexOf(`OpenGL ES`)!==-1&&(N=parseFloat(/^OpenGL ES (\d)/.exec(ee)[1]),M=N>=2):(N=parseFloat(/^WebGL (\d)/.exec(ee)[1]),M=N>=1);let P=null,te={},ne=e.getParameter(e.SCISSOR_BOX),re=e.getParameter(e.VIEWPORT),ie=new Hn().fromArray(ne),ae=new Hn().fromArray(re);function oe(t,n,r,i){let a=new Uint8Array(4),o=e.createTexture();e.bindTexture(t,o),e.texParameteri(t,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(t,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let o=0;o<r;o++)t===e.TEXTURE_3D||t===e.TEXTURE_2D_ARRAY?e.texImage3D(n,0,e.RGBA,1,1,i,0,e.RGBA,e.UNSIGNED_BYTE,a):e.texImage2D(n+o,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,a);return o}let F={};F[e.TEXTURE_2D]=oe(e.TEXTURE_2D,e.TEXTURE_2D,1),F[e.TEXTURE_CUBE_MAP]=oe(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),F[e.TEXTURE_2D_ARRAY]=oe(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),F[e.TEXTURE_3D]=oe(e.TEXTURE_3D,e.TEXTURE_3D,1,1),a.setClear(0,0,0,1),o.setClear(1),s.setClear(0),se(e.DEPTH_TEST),o.setFunc(3),ge(!1),I(1),se(e.CULL_FACE),me(0);function se(t){u[t]!==!0&&(e.enable(t),u[t]=!0)}function ce(t){u[t]!==!1&&(e.disable(t),u[t]=!1)}function le(t,n){return d[t]!==n&&(e.bindFramebuffer(t,n),d[t]=n,t===e.DRAW_FRAMEBUFFER&&(d[e.FRAMEBUFFER]=n),t===e.FRAMEBUFFER&&(d[e.DRAW_FRAMEBUFFER]=n),!0)}function ue(t,n){let r=p,i=!1;if(t){r=f.get(n),r===void 0&&(r=[],f.set(n,r));let a=t.textures;if(r.length!==a.length||r[0]!==e.COLOR_ATTACHMENT0){for(let t=0,n=a.length;t<n;t++)r[t]=e.COLOR_ATTACHMENT0+t;r.length=a.length,i=!0}}else r[0]!==e.BACK&&(r[0]=e.BACK,i=!0);i&&e.drawBuffers(r)}function de(t){return m!==t&&(e.useProgram(t),m=t,!0)}let fe={100:e.FUNC_ADD,101:e.FUNC_SUBTRACT,102:e.FUNC_REVERSE_SUBTRACT};fe[103]=e.MIN,fe[104]=e.MAX;let pe={200:e.ZERO,201:e.ONE,202:e.SRC_COLOR,204:e.SRC_ALPHA,210:e.SRC_ALPHA_SATURATE,208:e.DST_COLOR,206:e.DST_ALPHA,203:e.ONE_MINUS_SRC_COLOR,205:e.ONE_MINUS_SRC_ALPHA,209:e.ONE_MINUS_DST_COLOR,207:e.ONE_MINUS_DST_ALPHA,211:e.CONSTANT_COLOR,212:e.ONE_MINUS_CONSTANT_COLOR,213:e.CONSTANT_ALPHA,214:e.ONE_MINUS_CONSTANT_ALPHA};function me(t,n,r,i,a,o,s,c,l,u){if(t===0)h===!0&&(ce(e.BLEND),h=!1);else if(h===!1&&(se(e.BLEND),h=!0),t!==5){if(t!==g||u!==T){if((_!==100||b!==100)&&(e.blendEquation(e.FUNC_ADD),_=100,b=100),u)switch(t){case 1:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFunc(e.ONE,e.ONE);break;case 3:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case 4:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:B(`WebGLState: Invalid blending: `,t)}else switch(t){case 1:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case 3:B(`WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true`);break;case 4:B(`WebGLState: MultiplyBlending requires material.premultipliedAlpha = true`);break;default:B(`WebGLState: Invalid blending: `,t)}v=null,y=null,x=null,S=null,C.set(0,0,0),w=0,g=t,T=u}}else a||=n,o||=r,s||=i,(n!==_||a!==b)&&(e.blendEquationSeparate(fe[n],fe[a]),_=n,b=a),(r!==v||i!==y||o!==x||s!==S)&&(e.blendFuncSeparate(pe[r],pe[i],pe[o],pe[s]),v=r,y=i,x=o,S=s),(c.equals(C)===!1||l!==w)&&(e.blendColor(c.r,c.g,c.b,l),C.copy(c),w=l),g=t,T=!1}function he(t,n){t.side===2?ce(e.CULL_FACE):se(e.CULL_FACE);let r=t.side===1;n&&(r=!r),ge(r),t.blending===1&&t.transparent===!1?me(0):me(t.blending,t.blendEquation,t.blendSrc,t.blendDst,t.blendEquationAlpha,t.blendSrcAlpha,t.blendDstAlpha,t.blendColor,t.blendAlpha,t.premultipliedAlpha),o.setFunc(t.depthFunc),o.setTest(t.depthTest),o.setMask(t.depthWrite),a.setMask(t.colorWrite);let i=t.stencilWrite;s.setTest(i),i&&(s.setMask(t.stencilWriteMask),s.setFunc(t.stencilFunc,t.stencilRef,t.stencilFuncMask),s.setOp(t.stencilFail,t.stencilZFail,t.stencilZPass)),ve(t.polygonOffset,t.polygonOffsetFactor,t.polygonOffsetUnits),t.alphaToCoverage===!0?se(e.SAMPLE_ALPHA_TO_COVERAGE):ce(e.SAMPLE_ALPHA_TO_COVERAGE)}function ge(t){E!==t&&(t?e.frontFace(e.CW):e.frontFace(e.CCW),E=t)}function I(t){t===0?ce(e.CULL_FACE):(se(e.CULL_FACE),t!==D&&(t===1?e.cullFace(e.BACK):t===2?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))),D=t}function _e(t){t!==O&&(M&&e.lineWidth(t),O=t)}function ve(t,n,r){t?(se(e.POLYGON_OFFSET_FILL),(k!==n||A!==r)&&(k=n,A=r,o.getReversed()&&(n=-n),e.polygonOffset(n,r))):ce(e.POLYGON_OFFSET_FILL)}function ye(t){t?se(e.SCISSOR_TEST):ce(e.SCISSOR_TEST)}function L(t){t===void 0&&(t=e.TEXTURE0+j-1),P!==t&&(e.activeTexture(t),P=t)}function be(t,n,r){r===void 0&&(r=P===null?e.TEXTURE0+j-1:P);let i=te[r];i===void 0&&(i={type:void 0,texture:void 0},te[r]=i),(i.type!==t||i.texture!==n)&&(P!==r&&(e.activeTexture(r),P=r),e.bindTexture(t,n||F[t]),i.type=t,i.texture=n)}function R(){let t=te[P];t!==void 0&&t.type!==void 0&&(e.bindTexture(t.type,null),t.type=void 0,t.texture=void 0)}function xe(){try{e.compressedTexImage2D(...arguments)}catch(e){B(`WebGLState:`,e)}}function Se(){try{e.compressedTexImage3D(...arguments)}catch(e){B(`WebGLState:`,e)}}function Ce(){try{e.texSubImage2D(...arguments)}catch(e){B(`WebGLState:`,e)}}function we(){try{e.texSubImage3D(...arguments)}catch(e){B(`WebGLState:`,e)}}function Te(){try{e.compressedTexSubImage2D(...arguments)}catch(e){B(`WebGLState:`,e)}}function Ee(){try{e.compressedTexSubImage3D(...arguments)}catch(e){B(`WebGLState:`,e)}}function De(){try{e.texStorage2D(...arguments)}catch(e){B(`WebGLState:`,e)}}function Oe(){try{e.texStorage3D(...arguments)}catch(e){B(`WebGLState:`,e)}}function ke(){try{e.texImage2D(...arguments)}catch(e){B(`WebGLState:`,e)}}function Ae(){try{e.texImage3D(...arguments)}catch(e){B(`WebGLState:`,e)}}function je(t){ie.equals(t)===!1&&(e.scissor(t.x,t.y,t.z,t.w),ie.copy(t))}function Me(t){ae.equals(t)===!1&&(e.viewport(t.x,t.y,t.z,t.w),ae.copy(t))}function Ne(t,n){let r=l.get(n);r===void 0&&(r=new WeakMap,l.set(n,r));let i=r.get(t);i===void 0&&(i=e.getUniformBlockIndex(n,t.name),r.set(t,i))}function Pe(t,n){let r=l.get(n).get(t);c.get(n)!==r&&(e.uniformBlockBinding(n,r,t.__bindingPointIndex),c.set(n,r))}function Fe(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),o.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),u={},P=null,te={},d={},f=new WeakMap,p=[],m=null,h=!1,g=null,_=null,v=null,y=null,b=null,x=null,S=null,C=new W(0,0,0),w=0,T=!1,E=null,D=null,O=null,k=null,A=null,ie.set(0,0,e.canvas.width,e.canvas.height),ae.set(0,0,e.canvas.width,e.canvas.height),a.reset(),o.reset(),s.reset()}return{buffers:{color:a,depth:o,stencil:s},enable:se,disable:ce,bindFramebuffer:le,drawBuffers:ue,useProgram:de,setBlending:me,setMaterial:he,setFlipSided:ge,setCullFace:I,setLineWidth:_e,setPolygonOffset:ve,setScissorTest:ye,activeTexture:L,bindTexture:be,unbindTexture:R,compressedTexImage2D:xe,compressedTexImage3D:Se,texImage2D:ke,texImage3D:Ae,updateUBOMapping:Ne,uniformBlockBinding:Pe,texStorage2D:De,texStorage3D:Oe,texSubImage2D:Ce,texSubImage3D:we,compressedTexSubImage2D:Te,compressedTexSubImage3D:Ee,scissor:je,viewport:Me,reset:Fe}}function Md(e,t,n,r,i,a,o){let s=t.has(`WEBGL_multisampled_render_to_texture`)?t.get(`WEBGL_multisampled_render_to_texture`):null,c=typeof navigator>`u`?!1:/OculusBrowser/g.test(navigator.userAgent),l=new V,u=new WeakMap,d,f=new WeakMap,p=!1;try{p=typeof OffscreenCanvas<`u`&&new OffscreenCanvas(1,1).getContext(`2d`)!==null}catch{}function m(e,t){return p?new OffscreenCanvas(e,t):an(`canvas`)}function h(e,t,n){let r=1,i=be(e);if((i.width>n||i.height>n)&&(r=n/Math.max(i.width,i.height)),r<1){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap||typeof VideoFrame<`u`&&e instanceof VideoFrame){let n=Math.floor(r*i.width),a=Math.floor(r*i.height);d===void 0&&(d=m(n,a));let o=t?m(n,a):d;return o.width=n,o.height=a,o.getContext(`2d`).drawImage(e,0,0,n,a),z(`WebGLRenderer: Texture has been resized from (`+i.width+`x`+i.height+`) to (`+n+`x`+a+`).`),o}return`data`in e&&z(`WebGLRenderer: Image in DataTexture is too big (`+i.width+`x`+i.height+`).`),e}return e}function g(e){return e.generateMipmaps}function _(t){e.generateMipmap(t)}function v(t){return t.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:t.isWebGL3DRenderTarget?e.TEXTURE_3D:t.isWebGLArrayRenderTarget||t.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}function y(n,r,i,a,o=!1){if(n!==null){if(e[n]!==void 0)return e[n];z(`WebGLRenderer: Attempt to use non-existing WebGL internal format '`+n+`'`)}let s=r;if(r===e.RED&&(i===e.FLOAT&&(s=e.R32F),i===e.HALF_FLOAT&&(s=e.R16F),i===e.UNSIGNED_BYTE&&(s=e.R8)),r===e.RED_INTEGER&&(i===e.UNSIGNED_BYTE&&(s=e.R8UI),i===e.UNSIGNED_SHORT&&(s=e.R16UI),i===e.UNSIGNED_INT&&(s=e.R32UI),i===e.BYTE&&(s=e.R8I),i===e.SHORT&&(s=e.R16I),i===e.INT&&(s=e.R32I)),r===e.RG&&(i===e.FLOAT&&(s=e.RG32F),i===e.HALF_FLOAT&&(s=e.RG16F),i===e.UNSIGNED_BYTE&&(s=e.RG8)),r===e.RG_INTEGER&&(i===e.UNSIGNED_BYTE&&(s=e.RG8UI),i===e.UNSIGNED_SHORT&&(s=e.RG16UI),i===e.UNSIGNED_INT&&(s=e.RG32UI),i===e.BYTE&&(s=e.RG8I),i===e.SHORT&&(s=e.RG16I),i===e.INT&&(s=e.RG32I)),r===e.RGB_INTEGER&&(i===e.UNSIGNED_BYTE&&(s=e.RGB8UI),i===e.UNSIGNED_SHORT&&(s=e.RGB16UI),i===e.UNSIGNED_INT&&(s=e.RGB32UI),i===e.BYTE&&(s=e.RGB8I),i===e.SHORT&&(s=e.RGB16I),i===e.INT&&(s=e.RGB32I)),r===e.RGBA_INTEGER&&(i===e.UNSIGNED_BYTE&&(s=e.RGBA8UI),i===e.UNSIGNED_SHORT&&(s=e.RGBA16UI),i===e.UNSIGNED_INT&&(s=e.RGBA32UI),i===e.BYTE&&(s=e.RGBA8I),i===e.SHORT&&(s=e.RGBA16I),i===e.INT&&(s=e.RGBA32I)),r===e.RGB&&(i===e.UNSIGNED_INT_5_9_9_9_REV&&(s=e.RGB9_E5),i===e.UNSIGNED_INT_10F_11F_11F_REV&&(s=e.R11F_G11F_B10F)),r===e.RGBA){let t=o?Xt:jn.getTransfer(a);i===e.FLOAT&&(s=e.RGBA32F),i===e.HALF_FLOAT&&(s=e.RGBA16F),i===e.UNSIGNED_BYTE&&(s=t===`srgb`?e.SRGB8_ALPHA8:e.RGBA8),i===e.UNSIGNED_SHORT_4_4_4_4&&(s=e.RGBA4),i===e.UNSIGNED_SHORT_5_5_5_1&&(s=e.RGB5_A1)}return(s===e.R16F||s===e.R32F||s===e.RG16F||s===e.RG32F||s===e.RGBA16F||s===e.RGBA32F)&&t.get(`EXT_color_buffer_float`),s}function b(t,n){let r;return t?n===null||n===1014||n===1020?r=e.DEPTH24_STENCIL8:n===1015?r=e.DEPTH32F_STENCIL8:n===1012&&(r=e.DEPTH24_STENCIL8,z(`DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.`)):n===null||n===1014||n===1020?r=e.DEPTH_COMPONENT24:n===1015?r=e.DEPTH_COMPONENT32F:n===1012&&(r=e.DEPTH_COMPONENT16),r}function x(e,t){return g(e)===!0||e.isFramebufferTexture&&e.minFilter!==1003&&e.minFilter!==1006?Math.log2(Math.max(t.width,t.height))+1:e.mipmaps!==void 0&&e.mipmaps.length>0?e.mipmaps.length:e.isCompressedTexture&&Array.isArray(e.image)?t.mipmaps.length:1}function S(e){let t=e.target;t.removeEventListener(`dispose`,S),w(t),t.isVideoTexture&&u.delete(t)}function C(e){let t=e.target;t.removeEventListener(`dispose`,C),E(t)}function w(e){let t=r.get(e);if(t.__webglInit===void 0)return;let n=e.source,i=f.get(n);if(i){let r=i[t.__cacheKey];r.usedTimes--,r.usedTimes===0&&T(e),Object.keys(i).length===0&&f.delete(n)}r.remove(e)}function T(t){let n=r.get(t);e.deleteTexture(n.__webglTexture);let i=t.source,a=f.get(i);delete a[n.__cacheKey],o.memory.textures--}function E(t){let n=r.get(t);if(t.depthTexture&&(t.depthTexture.dispose(),r.remove(t.depthTexture)),t.isWebGLCubeRenderTarget)for(let t=0;t<6;t++){if(Array.isArray(n.__webglFramebuffer[t]))for(let r=0;r<n.__webglFramebuffer[t].length;r++)e.deleteFramebuffer(n.__webglFramebuffer[t][r]);else e.deleteFramebuffer(n.__webglFramebuffer[t]);n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer[t])}else{if(Array.isArray(n.__webglFramebuffer))for(let t=0;t<n.__webglFramebuffer.length;t++)e.deleteFramebuffer(n.__webglFramebuffer[t]);else e.deleteFramebuffer(n.__webglFramebuffer);if(n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer),n.__webglMultisampledFramebuffer&&e.deleteFramebuffer(n.__webglMultisampledFramebuffer),n.__webglColorRenderbuffer)for(let t=0;t<n.__webglColorRenderbuffer.length;t++)n.__webglColorRenderbuffer[t]&&e.deleteRenderbuffer(n.__webglColorRenderbuffer[t]);n.__webglDepthRenderbuffer&&e.deleteRenderbuffer(n.__webglDepthRenderbuffer)}let i=t.textures;for(let t=0,n=i.length;t<n;t++){let n=r.get(i[t]);n.__webglTexture&&(e.deleteTexture(n.__webglTexture),o.memory.textures--),r.remove(i[t])}r.remove(t)}let D=0;function O(){D=0}function k(){let e=D;return e>=i.maxTextures&&z(`WebGLTextures: Trying to use `+e+` texture units while this GPU supports only `+i.maxTextures),D+=1,e}function A(e){let t=[];return t.push(e.wrapS),t.push(e.wrapT),t.push(e.wrapR||0),t.push(e.magFilter),t.push(e.minFilter),t.push(e.anisotropy),t.push(e.internalFormat),t.push(e.format),t.push(e.type),t.push(e.generateMipmaps),t.push(e.premultiplyAlpha),t.push(e.flipY),t.push(e.unpackAlignment),t.push(e.colorSpace),t.join()}function j(t,i){let a=r.get(t);if(t.isVideoTexture&&ye(t),t.isRenderTargetTexture===!1&&t.isExternalTexture!==!0&&t.version>0&&a.__version!==t.version){let e=t.image;if(e===null)z(`WebGLRenderer: Texture marked for update but no image data found.`);else if(e.complete===!1)z(`WebGLRenderer: Texture marked for update but image is incomplete`);else{F(a,t,i);return}}else t.isExternalTexture&&(a.__webglTexture=t.sourceTexture?t.sourceTexture:null);n.bindTexture(e.TEXTURE_2D,a.__webglTexture,e.TEXTURE0+i)}function M(t,i){let a=r.get(t);t.isRenderTargetTexture===!1&&t.version>0&&a.__version!==t.version?F(a,t,i):(t.isExternalTexture&&(a.__webglTexture=t.sourceTexture?t.sourceTexture:null),n.bindTexture(e.TEXTURE_2D_ARRAY,a.__webglTexture,e.TEXTURE0+i))}function N(t,i){let a=r.get(t);t.isRenderTargetTexture===!1&&t.version>0&&a.__version!==t.version?F(a,t,i):n.bindTexture(e.TEXTURE_3D,a.__webglTexture,e.TEXTURE0+i)}function ee(t,i){let a=r.get(t);t.isCubeDepthTexture!==!0&&t.version>0&&a.__version!==t.version?se(a,t,i):n.bindTexture(e.TEXTURE_CUBE_MAP,a.__webglTexture,e.TEXTURE0+i)}let P={[Ee]:e.REPEAT,[De]:e.CLAMP_TO_EDGE,[Oe]:e.MIRRORED_REPEAT},te={[ke]:e.NEAREST,[Ae]:e.NEAREST_MIPMAP_NEAREST,[je]:e.NEAREST_MIPMAP_LINEAR,[Me]:e.LINEAR,[Ne]:e.LINEAR_MIPMAP_NEAREST,[Pe]:e.LINEAR_MIPMAP_LINEAR},ne={512:e.NEVER,519:e.ALWAYS,513:e.LESS,515:e.LEQUAL,514:e.EQUAL,518:e.GEQUAL,516:e.GREATER,517:e.NOTEQUAL};function re(n,a){if(a.type===1015&&t.has(`OES_texture_float_linear`)===!1&&(a.magFilter===1006||a.magFilter===1007||a.magFilter===1005||a.magFilter===1008||a.minFilter===1006||a.minFilter===1007||a.minFilter===1005||a.minFilter===1008)&&z(`WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device.`),e.texParameteri(n,e.TEXTURE_WRAP_S,P[a.wrapS]),e.texParameteri(n,e.TEXTURE_WRAP_T,P[a.wrapT]),(n===e.TEXTURE_3D||n===e.TEXTURE_2D_ARRAY)&&e.texParameteri(n,e.TEXTURE_WRAP_R,P[a.wrapR]),e.texParameteri(n,e.TEXTURE_MAG_FILTER,te[a.magFilter]),e.texParameteri(n,e.TEXTURE_MIN_FILTER,te[a.minFilter]),a.compareFunction&&(e.texParameteri(n,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(n,e.TEXTURE_COMPARE_FUNC,ne[a.compareFunction])),t.has(`EXT_texture_filter_anisotropic`)===!0){if(a.magFilter===1003||a.minFilter!==1005&&a.minFilter!==1008||a.type===1015&&t.has(`OES_texture_float_linear`)===!1)return;if(a.anisotropy>1||r.get(a).__currentAnisotropy){let o=t.get(`EXT_texture_filter_anisotropic`);e.texParameterf(n,o.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(a.anisotropy,i.getMaxAnisotropy())),r.get(a).__currentAnisotropy=a.anisotropy}}}function ie(t,n){let r=!1;t.__webglInit===void 0&&(t.__webglInit=!0,n.addEventListener(`dispose`,S));let i=n.source,a=f.get(i);a===void 0&&(a={},f.set(i,a));let s=A(n);if(s!==t.__cacheKey){a[s]===void 0&&(a[s]={texture:e.createTexture(),usedTimes:0},o.memory.textures++,r=!0),a[s].usedTimes++;let i=a[t.__cacheKey];i!==void 0&&(a[t.__cacheKey].usedTimes--,i.usedTimes===0&&T(n)),t.__cacheKey=s,t.__webglTexture=a[s].texture}return r}function ae(e,t,n){return Math.floor(Math.floor(e/n)/t)}function oe(t,r,i,a){let o=t.updateRanges;if(o.length===0)n.texSubImage2D(e.TEXTURE_2D,0,0,0,r.width,r.height,i,a,r.data);else{o.sort((e,t)=>e.start-t.start);let s=0;for(let e=1;e<o.length;e++){let t=o[s],n=o[e],i=t.start+t.count,a=ae(n.start,r.width,4),c=ae(t.start,r.width,4);n.start<=i+1&&a===c&&ae(n.start+n.count-1,r.width,4)===a?t.count=Math.max(t.count,n.start+n.count-t.start):(++s,o[s]=n)}o.length=s+1;let c=e.getParameter(e.UNPACK_ROW_LENGTH),l=e.getParameter(e.UNPACK_SKIP_PIXELS),u=e.getParameter(e.UNPACK_SKIP_ROWS);e.pixelStorei(e.UNPACK_ROW_LENGTH,r.width);for(let t=0,s=o.length;t<s;t++){let s=o[t],c=Math.floor(s.start/4),l=Math.ceil(s.count/4),u=c%r.width,d=Math.floor(c/r.width),f=l;e.pixelStorei(e.UNPACK_SKIP_PIXELS,u),e.pixelStorei(e.UNPACK_SKIP_ROWS,d),n.texSubImage2D(e.TEXTURE_2D,0,u,d,f,1,i,a,r.data)}t.clearUpdateRanges(),e.pixelStorei(e.UNPACK_ROW_LENGTH,c),e.pixelStorei(e.UNPACK_SKIP_PIXELS,l),e.pixelStorei(e.UNPACK_SKIP_ROWS,u)}}function F(t,o,s){let c=e.TEXTURE_2D;(o.isDataArrayTexture||o.isCompressedArrayTexture)&&(c=e.TEXTURE_2D_ARRAY),o.isData3DTexture&&(c=e.TEXTURE_3D);let l=ie(t,o),u=o.source;n.bindTexture(c,t.__webglTexture,e.TEXTURE0+s);let d=r.get(u);if(u.version!==d.__version||l===!0){n.activeTexture(e.TEXTURE0+s);let t=jn.getPrimaries(jn.workingColorSpace),r=o.colorSpace===``?null:jn.getPrimaries(o.colorSpace),f=o.colorSpace===``||t===r?e.NONE:e.BROWSER_DEFAULT_WEBGL;e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,o.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,o.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,o.unpackAlignment),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,f);let p=h(o.image,!1,i.maxTextureSize);p=L(o,p);let m=a.convert(o.format,o.colorSpace),v=a.convert(o.type),S=y(o.internalFormat,m,v,o.colorSpace,o.isVideoTexture);re(c,o);let C,w=o.mipmaps,T=o.isVideoTexture!==!0,E=d.__version===void 0||l===!0,D=u.dataReady,O=x(o,p);if(o.isDepthTexture)S=b(o.format===Qe,o.type),E&&(T?n.texStorage2D(e.TEXTURE_2D,1,S,p.width,p.height):n.texImage2D(e.TEXTURE_2D,0,S,p.width,p.height,0,m,v,null));else if(o.isDataTexture){if(w.length>0){T&&E&&n.texStorage2D(e.TEXTURE_2D,O,S,w[0].width,w[0].height);for(let t=0,r=w.length;t<r;t++)C=w[t],T?D&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,C.width,C.height,m,v,C.data):n.texImage2D(e.TEXTURE_2D,t,S,C.width,C.height,0,m,v,C.data);o.generateMipmaps=!1}else T?(E&&n.texStorage2D(e.TEXTURE_2D,O,S,p.width,p.height),D&&oe(o,p,m,v)):n.texImage2D(e.TEXTURE_2D,0,S,p.width,p.height,0,m,v,p.data)}else if(o.isCompressedTexture){if(o.isCompressedArrayTexture){T&&E&&n.texStorage3D(e.TEXTURE_2D_ARRAY,O,S,w[0].width,w[0].height,p.depth);for(let t=0,r=w.length;t<r;t++)if(C=w[t],o.format!==1023){if(m!==null){if(T){if(D){if(o.layerUpdates.size>0){let r=Oc(C.width,C.height,o.format,o.type);for(let i of o.layerUpdates){let a=C.data.subarray(i*r/C.data.BYTES_PER_ELEMENT,(i+1)*r/C.data.BYTES_PER_ELEMENT);n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,t,0,0,i,C.width,C.height,1,m,a)}o.clearLayerUpdates()}else n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,t,0,0,0,C.width,C.height,p.depth,m,C.data)}}else n.compressedTexImage3D(e.TEXTURE_2D_ARRAY,t,S,C.width,C.height,p.depth,0,C.data,0,0)}else z(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`)}else T?D&&n.texSubImage3D(e.TEXTURE_2D_ARRAY,t,0,0,0,C.width,C.height,p.depth,m,v,C.data):n.texImage3D(e.TEXTURE_2D_ARRAY,t,S,C.width,C.height,p.depth,0,m,v,C.data)}else{T&&E&&n.texStorage2D(e.TEXTURE_2D,O,S,w[0].width,w[0].height);for(let t=0,r=w.length;t<r;t++)C=w[t],o.format===1023?T?D&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,C.width,C.height,m,v,C.data):n.texImage2D(e.TEXTURE_2D,t,S,C.width,C.height,0,m,v,C.data):m===null?z(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`):T?D&&n.compressedTexSubImage2D(e.TEXTURE_2D,t,0,0,C.width,C.height,m,C.data):n.compressedTexImage2D(e.TEXTURE_2D,t,S,C.width,C.height,0,C.data)}}else if(o.isDataArrayTexture){if(T){if(E&&n.texStorage3D(e.TEXTURE_2D_ARRAY,O,S,p.width,p.height,p.depth),D){if(o.layerUpdates.size>0){let t=Oc(p.width,p.height,o.format,o.type);for(let r of o.layerUpdates){let i=p.data.subarray(r*t/p.data.BYTES_PER_ELEMENT,(r+1)*t/p.data.BYTES_PER_ELEMENT);n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,r,p.width,p.height,1,m,v,i)}o.clearLayerUpdates()}else n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,p.width,p.height,p.depth,m,v,p.data)}}else n.texImage3D(e.TEXTURE_2D_ARRAY,0,S,p.width,p.height,p.depth,0,m,v,p.data)}else if(o.isData3DTexture)T?(E&&n.texStorage3D(e.TEXTURE_3D,O,S,p.width,p.height,p.depth),D&&n.texSubImage3D(e.TEXTURE_3D,0,0,0,0,p.width,p.height,p.depth,m,v,p.data)):n.texImage3D(e.TEXTURE_3D,0,S,p.width,p.height,p.depth,0,m,v,p.data);else if(o.isFramebufferTexture){if(E){if(T)n.texStorage2D(e.TEXTURE_2D,O,S,p.width,p.height);else{let t=p.width,r=p.height;for(let i=0;i<O;i++)n.texImage2D(e.TEXTURE_2D,i,S,t,r,0,m,v,null),t>>=1,r>>=1}}}else if(w.length>0){if(T&&E){let t=be(w[0]);n.texStorage2D(e.TEXTURE_2D,O,S,t.width,t.height)}for(let t=0,r=w.length;t<r;t++)C=w[t],T?D&&n.texSubImage2D(e.TEXTURE_2D,t,0,0,m,v,C):n.texImage2D(e.TEXTURE_2D,t,S,m,v,C);o.generateMipmaps=!1}else if(T){if(E){let t=be(p);n.texStorage2D(e.TEXTURE_2D,O,S,t.width,t.height)}D&&n.texSubImage2D(e.TEXTURE_2D,0,0,0,m,v,p)}else n.texImage2D(e.TEXTURE_2D,0,S,m,v,p);g(o)&&_(c),d.__version=u.version,o.onUpdate&&o.onUpdate(o)}t.__version=o.version}function se(t,o,s){if(o.image.length!==6)return;let c=ie(t,o),l=o.source;n.bindTexture(e.TEXTURE_CUBE_MAP,t.__webglTexture,e.TEXTURE0+s);let u=r.get(l);if(l.version!==u.__version||c===!0){n.activeTexture(e.TEXTURE0+s);let t=jn.getPrimaries(jn.workingColorSpace),r=o.colorSpace===``?null:jn.getPrimaries(o.colorSpace),d=o.colorSpace===``||t===r?e.NONE:e.BROWSER_DEFAULT_WEBGL;e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,o.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,o.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,o.unpackAlignment),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,d);let f=o.isCompressedTexture||o.image[0].isCompressedTexture,p=o.image[0]&&o.image[0].isDataTexture,m=[];for(let e=0;e<6;e++)!f&&!p?m[e]=h(o.image[e],!0,i.maxCubemapSize):m[e]=p?o.image[e].image:o.image[e],m[e]=L(o,m[e]);let v=m[0],b=a.convert(o.format,o.colorSpace),S=a.convert(o.type),C=y(o.internalFormat,b,S,o.colorSpace),w=o.isVideoTexture!==!0,T=u.__version===void 0||c===!0,E=l.dataReady,D=x(o,v);re(e.TEXTURE_CUBE_MAP,o);let O;if(f){w&&T&&n.texStorage2D(e.TEXTURE_CUBE_MAP,D,C,v.width,v.height);for(let t=0;t<6;t++){O=m[t].mipmaps;for(let r=0;r<O.length;r++){let i=O[r];o.format===1023?w?E&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,0,0,i.width,i.height,b,S,i.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,C,i.width,i.height,0,b,S,i.data):b===null?z(`WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()`):w?E&&n.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,0,0,i.width,i.height,b,i.data):n.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r,C,i.width,i.height,0,i.data)}}}else{if(O=o.mipmaps,w&&T){O.length>0&&D++;let t=be(m[0]);n.texStorage2D(e.TEXTURE_CUBE_MAP,D,C,t.width,t.height)}for(let t=0;t<6;t++)if(p){w?E&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,m[t].width,m[t].height,b,S,m[t].data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,C,m[t].width,m[t].height,0,b,S,m[t].data);for(let r=0;r<O.length;r++){let i=O[r].image[t].image;w?E&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,0,0,i.width,i.height,b,S,i.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,C,i.width,i.height,0,b,S,i.data)}}else{w?E&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,b,S,m[t]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,C,b,S,m[t]);for(let r=0;r<O.length;r++){let i=O[r];w?E&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,0,0,b,S,i.image[t]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,r+1,C,b,S,i.image[t])}}}g(o)&&_(e.TEXTURE_CUBE_MAP),u.__version=l.version,o.onUpdate&&o.onUpdate(o)}t.__version=o.version}function ce(t,i,o,c,l,u){let d=a.convert(o.format,o.colorSpace),f=a.convert(o.type),p=y(o.internalFormat,d,f,o.colorSpace),m=r.get(i),h=r.get(o);if(h.__renderTarget=i,!m.__hasExternalTextures){let t=Math.max(1,i.width>>u),r=Math.max(1,i.height>>u);l===e.TEXTURE_3D||l===e.TEXTURE_2D_ARRAY?n.texImage3D(l,u,p,t,r,i.depth,0,d,f,null):n.texImage2D(l,u,p,t,r,0,d,f,null)}n.bindFramebuffer(e.FRAMEBUFFER,t),ve(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,c,l,h.__webglTexture,0,_e(i)):(l===e.TEXTURE_2D||l>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&l<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,c,l,h.__webglTexture,u),n.bindFramebuffer(e.FRAMEBUFFER,null)}function le(t,n,r){if(e.bindRenderbuffer(e.RENDERBUFFER,t),n.depthBuffer){let i=n.depthTexture,a=i&&i.isDepthTexture?i.type:null,o=b(n.stencilBuffer,a),c=n.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;ve(n)?s.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,_e(n),o,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,_e(n),o,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,o,n.width,n.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,c,e.RENDERBUFFER,t)}else{let t=n.textures;for(let i=0;i<t.length;i++){let o=t[i],c=a.convert(o.format,o.colorSpace),l=a.convert(o.type),u=y(o.internalFormat,c,l,o.colorSpace);ve(n)?s.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,_e(n),u,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,_e(n),u,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,u,n.width,n.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function ue(t,i,o){let c=i.isWebGLCubeRenderTarget===!0;if(n.bindFramebuffer(e.FRAMEBUFFER,t),!(i.depthTexture&&i.depthTexture.isDepthTexture))throw Error(`renderTarget.depthTexture must be an instance of THREE.DepthTexture`);let l=r.get(i.depthTexture);if(l.__renderTarget=i,l.__webglTexture&&i.depthTexture.image.width===i.width&&i.depthTexture.image.height===i.height||(i.depthTexture.image.width=i.width,i.depthTexture.image.height=i.height,i.depthTexture.needsUpdate=!0),c){if(l.__webglInit===void 0&&(l.__webglInit=!0,i.depthTexture.addEventListener(`dispose`,S)),l.__webglTexture===void 0){l.__webglTexture=e.createTexture(),n.bindTexture(e.TEXTURE_CUBE_MAP,l.__webglTexture),re(e.TEXTURE_CUBE_MAP,i.depthTexture);let t=a.convert(i.depthTexture.format),r=a.convert(i.depthTexture.type),o;i.depthTexture.format===1026?o=e.DEPTH_COMPONENT24:i.depthTexture.format===1027&&(o=e.DEPTH24_STENCIL8);for(let n=0;n<6;n++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+n,0,o,i.width,i.height,0,t,r,null)}}else j(i.depthTexture,0);let u=l.__webglTexture,d=_e(i),f=c?e.TEXTURE_CUBE_MAP_POSITIVE_X+o:e.TEXTURE_2D,p=i.depthTexture.format===1027?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(i.depthTexture.format===1026)ve(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,p,f,u,0,d):e.framebufferTexture2D(e.FRAMEBUFFER,p,f,u,0);else if(i.depthTexture.format===1027)ve(i)?s.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,p,f,u,0,d):e.framebufferTexture2D(e.FRAMEBUFFER,p,f,u,0);else throw Error(`Unknown depthTexture format`)}function de(t){let i=r.get(t),a=t.isWebGLCubeRenderTarget===!0;if(i.__boundDepthTexture!==t.depthTexture){let e=t.depthTexture;if(i.__depthDisposeCallback&&i.__depthDisposeCallback(),e){let t=()=>{delete i.__boundDepthTexture,delete i.__depthDisposeCallback,e.removeEventListener(`dispose`,t)};e.addEventListener(`dispose`,t),i.__depthDisposeCallback=t}i.__boundDepthTexture=e}if(t.depthTexture&&!i.__autoAllocateDepthBuffer){if(a)for(let e=0;e<6;e++)ue(i.__webglFramebuffer[e],t,e);else{let e=t.texture.mipmaps;e&&e.length>0?ue(i.__webglFramebuffer[0],t,0):ue(i.__webglFramebuffer,t,0)}}else if(a){i.__webglDepthbuffer=[];for(let r=0;r<6;r++)if(n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer[r]),i.__webglDepthbuffer[r]===void 0)i.__webglDepthbuffer[r]=e.createRenderbuffer(),le(i.__webglDepthbuffer[r],t,!1);else{let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,a=i.__webglDepthbuffer[r];e.bindRenderbuffer(e.RENDERBUFFER,a),e.framebufferRenderbuffer(e.FRAMEBUFFER,n,e.RENDERBUFFER,a)}}else{let r=t.texture.mipmaps;if(r&&r.length>0?n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer[0]):n.bindFramebuffer(e.FRAMEBUFFER,i.__webglFramebuffer),i.__webglDepthbuffer===void 0)i.__webglDepthbuffer=e.createRenderbuffer(),le(i.__webglDepthbuffer,t,!1);else{let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,r=i.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,r),e.framebufferRenderbuffer(e.FRAMEBUFFER,n,e.RENDERBUFFER,r)}}n.bindFramebuffer(e.FRAMEBUFFER,null)}function fe(t,n,i){let a=r.get(t);n!==void 0&&ce(a.__webglFramebuffer,t,t.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),i!==void 0&&de(t)}function pe(t){let i=t.texture,s=r.get(t),c=r.get(i);t.addEventListener(`dispose`,C);let l=t.textures,u=t.isWebGLCubeRenderTarget===!0,d=l.length>1;if(d||(c.__webglTexture===void 0&&(c.__webglTexture=e.createTexture()),c.__version=i.version,o.memory.textures++),u){s.__webglFramebuffer=[];for(let t=0;t<6;t++)if(i.mipmaps&&i.mipmaps.length>0){s.__webglFramebuffer[t]=[];for(let n=0;n<i.mipmaps.length;n++)s.__webglFramebuffer[t][n]=e.createFramebuffer()}else s.__webglFramebuffer[t]=e.createFramebuffer()}else{if(i.mipmaps&&i.mipmaps.length>0){s.__webglFramebuffer=[];for(let t=0;t<i.mipmaps.length;t++)s.__webglFramebuffer[t]=e.createFramebuffer()}else s.__webglFramebuffer=e.createFramebuffer();if(d)for(let t=0,n=l.length;t<n;t++){let n=r.get(l[t]);n.__webglTexture===void 0&&(n.__webglTexture=e.createTexture(),o.memory.textures++)}if(t.samples>0&&ve(t)===!1){s.__webglMultisampledFramebuffer=e.createFramebuffer(),s.__webglColorRenderbuffer=[],n.bindFramebuffer(e.FRAMEBUFFER,s.__webglMultisampledFramebuffer);for(let n=0;n<l.length;n++){let r=l[n];s.__webglColorRenderbuffer[n]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,s.__webglColorRenderbuffer[n]);let i=a.convert(r.format,r.colorSpace),o=a.convert(r.type),c=y(r.internalFormat,i,o,r.colorSpace,t.isXRRenderTarget===!0),u=_e(t);e.renderbufferStorageMultisample(e.RENDERBUFFER,u,c,t.width,t.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+n,e.RENDERBUFFER,s.__webglColorRenderbuffer[n])}e.bindRenderbuffer(e.RENDERBUFFER,null),t.depthBuffer&&(s.__webglDepthRenderbuffer=e.createRenderbuffer(),le(s.__webglDepthRenderbuffer,t,!0)),n.bindFramebuffer(e.FRAMEBUFFER,null)}}if(u){n.bindTexture(e.TEXTURE_CUBE_MAP,c.__webglTexture),re(e.TEXTURE_CUBE_MAP,i);for(let n=0;n<6;n++)if(i.mipmaps&&i.mipmaps.length>0)for(let r=0;r<i.mipmaps.length;r++)ce(s.__webglFramebuffer[n][r],t,i,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+n,r);else ce(s.__webglFramebuffer[n],t,i,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+n,0);g(i)&&_(e.TEXTURE_CUBE_MAP),n.unbindTexture()}else if(d){for(let i=0,a=l.length;i<a;i++){let a=l[i],o=r.get(a),c=e.TEXTURE_2D;(t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(c=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(c,o.__webglTexture),re(c,a),ce(s.__webglFramebuffer,t,a,e.COLOR_ATTACHMENT0+i,c,0),g(a)&&_(c)}n.unbindTexture()}else{let r=e.TEXTURE_2D;if((t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(r=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(r,c.__webglTexture),re(r,i),i.mipmaps&&i.mipmaps.length>0)for(let n=0;n<i.mipmaps.length;n++)ce(s.__webglFramebuffer[n],t,i,e.COLOR_ATTACHMENT0,r,n);else ce(s.__webglFramebuffer,t,i,e.COLOR_ATTACHMENT0,r,0);g(i)&&_(r),n.unbindTexture()}t.depthBuffer&&de(t)}function me(e){let t=e.textures;for(let i=0,a=t.length;i<a;i++){let a=t[i];if(g(a)){let t=v(e),i=r.get(a).__webglTexture;n.bindTexture(t,i),_(t),n.unbindTexture()}}}let he=[],ge=[];function I(t){if(t.samples>0){if(ve(t)===!1){let i=t.textures,a=t.width,o=t.height,s=e.COLOR_BUFFER_BIT,l=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,u=r.get(t),d=i.length>1;if(d)for(let t=0;t<i.length;t++)n.bindFramebuffer(e.FRAMEBUFFER,u.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,null),n.bindFramebuffer(e.FRAMEBUFFER,u.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,null,0);n.bindFramebuffer(e.READ_FRAMEBUFFER,u.__webglMultisampledFramebuffer);let f=t.texture.mipmaps;f&&f.length>0?n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglFramebuffer[0]):n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglFramebuffer);for(let n=0;n<i.length;n++){if(t.resolveDepthBuffer&&(t.depthBuffer&&(s|=e.DEPTH_BUFFER_BIT),t.stencilBuffer&&t.resolveStencilBuffer&&(s|=e.STENCIL_BUFFER_BIT)),d){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,u.__webglColorRenderbuffer[n]);let t=r.get(i[n]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0)}e.blitFramebuffer(0,0,a,o,0,0,a,o,s,e.NEAREST),c===!0&&(he.length=0,ge.length=0,he.push(e.COLOR_ATTACHMENT0+n),t.depthBuffer&&t.resolveDepthBuffer===!1&&(he.push(l),ge.push(l),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,ge)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,he))}if(n.bindFramebuffer(e.READ_FRAMEBUFFER,null),n.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),d)for(let t=0;t<i.length;t++){n.bindFramebuffer(e.FRAMEBUFFER,u.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,u.__webglColorRenderbuffer[t]);let a=r.get(i[t]).__webglTexture;n.bindFramebuffer(e.FRAMEBUFFER,u.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,a,0)}n.bindFramebuffer(e.DRAW_FRAMEBUFFER,u.__webglMultisampledFramebuffer)}else if(t.depthBuffer&&t.resolveDepthBuffer===!1&&c){let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[n])}}}function _e(e){return Math.min(i.maxSamples,e.samples)}function ve(e){let n=r.get(e);return e.samples>0&&t.has(`WEBGL_multisampled_render_to_texture`)===!0&&n.__useRenderToTexture!==!1}function ye(e){let t=o.render.frame;u.get(e)!==t&&(u.set(e,t),e.update())}function L(e,t){let n=e.colorSpace,r=e.format,i=e.type;return e.isCompressedTexture===!0||e.isVideoTexture===!0||n!==`srgb-linear`&&n!==``&&(jn.getTransfer(n)===`srgb`?(r!==1023||i!==1009)&&z(`WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.`):B(`WebGLTextures: Unsupported texture color space:`,n)),t}function be(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement?(l.width=e.naturalWidth||e.width,l.height=e.naturalHeight||e.height):typeof VideoFrame<`u`&&e instanceof VideoFrame?(l.width=e.displayWidth,l.height=e.displayHeight):(l.width=e.width,l.height=e.height),l}this.allocateTextureUnit=k,this.resetTextureUnits=O,this.setTexture2D=j,this.setTexture2DArray=M,this.setTexture3D=N,this.setTextureCube=ee,this.rebindTextures=fe,this.setupRenderTarget=pe,this.updateRenderTargetMipmap=me,this.updateMultisampleRenderTarget=I,this.setupDepthRenderbuffer=de,this.setupFrameBufferTexture=ce,this.useMultisampledRTT=ve,this.isReversedDepthBuffer=function(){return n.buffers.depth.getReversed()}}function Nd(e,t){function n(n,r=``){let i,a=jn.getTransfer(r);if(n===1009)return e.UNSIGNED_BYTE;if(n===1017)return e.UNSIGNED_SHORT_4_4_4_4;if(n===1018)return e.UNSIGNED_SHORT_5_5_5_1;if(n===35902)return e.UNSIGNED_INT_5_9_9_9_REV;if(n===35899)return e.UNSIGNED_INT_10F_11F_11F_REV;if(n===1010)return e.BYTE;if(n===1011)return e.SHORT;if(n===1012)return e.UNSIGNED_SHORT;if(n===1013)return e.INT;if(n===1014)return e.UNSIGNED_INT;if(n===1015)return e.FLOAT;if(n===1016)return e.HALF_FLOAT;if(n===1021)return e.ALPHA;if(n===1022)return e.RGB;if(n===1023)return e.RGBA;if(n===1026)return e.DEPTH_COMPONENT;if(n===1027)return e.DEPTH_STENCIL;if(n===1028)return e.RED;if(n===1029)return e.RED_INTEGER;if(n===1030)return e.RG;if(n===1031)return e.RG_INTEGER;if(n===1033)return e.RGBA_INTEGER;if(n===33776||n===33777||n===33778||n===33779){if(a===`srgb`){if(i=t.get(`WEBGL_compressed_texture_s3tc_srgb`),i!==null){if(n===33776)return i.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null}else if(i=t.get(`WEBGL_compressed_texture_s3tc`),i!==null){if(n===33776)return i.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null}if(n===35840||n===35841||n===35842||n===35843){if(i=t.get(`WEBGL_compressed_texture_pvrtc`),i!==null){if(n===35840)return i.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===35841)return i.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===35842)return i.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===35843)return i.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null}if(n===36196||n===37492||n===37496||n===37488||n===37489||n===37490||n===37491){if(i=t.get(`WEBGL_compressed_texture_etc`),i!==null){if(n===36196||n===37492)return a===`srgb`?i.COMPRESSED_SRGB8_ETC2:i.COMPRESSED_RGB8_ETC2;if(n===37496)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:i.COMPRESSED_RGBA8_ETC2_EAC;if(n===37488)return i.COMPRESSED_R11_EAC;if(n===37489)return i.COMPRESSED_SIGNED_R11_EAC;if(n===37490)return i.COMPRESSED_RG11_EAC;if(n===37491)return i.COMPRESSED_SIGNED_RG11_EAC}else return null}if(n===37808||n===37809||n===37810||n===37811||n===37812||n===37813||n===37814||n===37815||n===37816||n===37817||n===37818||n===37819||n===37820||n===37821){if(i=t.get(`WEBGL_compressed_texture_astc`),i!==null){if(n===37808)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:i.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===37809)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:i.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===37810)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:i.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===37811)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:i.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===37812)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:i.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===37813)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:i.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===37814)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:i.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===37815)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:i.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===37816)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:i.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===37817)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:i.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===37818)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:i.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===37819)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:i.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===37820)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:i.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===37821)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:i.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null}if(n===36492||n===36494||n===36495){if(i=t.get(`EXT_texture_compression_bptc`),i!==null){if(n===36492)return a===`srgb`?i.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:i.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===36494)return i.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===36495)return i.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null}if(n===36283||n===36284||n===36285||n===36286){if(i=t.get(`EXT_texture_compression_rgtc`),i!==null){if(n===36283)return i.COMPRESSED_RED_RGTC1_EXT;if(n===36284)return i.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===36285)return i.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===36286)return i.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null}return n===1020?e.UNSIGNED_INT_24_8:e[n]===void 0?null:e[n]}return{convert:n}}var Pd=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Fd=`
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

}`,Id=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new Va(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new Es({vertexShader:Pd,fragmentShader:Fd,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new K(new ms(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Ld=class extends pn{constructor(e,t){super();let n=this,r=null,i=1,a=null,o=`local-floor`,s=1,c=null,l=null,u=null,d=null,f=null,p=null,m=typeof XRWebGLBinding<`u`,h=new Id,g={},_=t.getContextAttributes(),v=null,y=null,b=[],x=[],S=new V,C=null,w=new oc;w.viewport=new Hn;let T=new oc;T.viewport=new Hn;let E=[w,T],D=new hc,O=null,k=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(e){let t=b[e];return t===void 0&&(t=new Sr,b[e]=t),t.getTargetRaySpace()},this.getControllerGrip=function(e){let t=b[e];return t===void 0&&(t=new Sr,b[e]=t),t.getGripSpace()},this.getHand=function(e){let t=b[e];return t===void 0&&(t=new Sr,b[e]=t),t.getHandSpace()};function A(e){let t=x.indexOf(e.inputSource);if(t===-1)return;let n=b[t];n!==void 0&&(n.update(e.inputSource,e.frame,c||a),n.dispatchEvent({type:e.type,data:e.inputSource}))}function j(){r.removeEventListener(`select`,A),r.removeEventListener(`selectstart`,A),r.removeEventListener(`selectend`,A),r.removeEventListener(`squeeze`,A),r.removeEventListener(`squeezestart`,A),r.removeEventListener(`squeezeend`,A),r.removeEventListener(`end`,j),r.removeEventListener(`inputsourceschange`,M);for(let e=0;e<b.length;e++){let t=x[e];t!==null&&(x[e]=null,b[e].disconnect(t))}O=null,k=null,h.reset();for(let e in g)delete g[e];e.setRenderTarget(v),f=null,d=null,u=null,r=null,y=null,ae.stop(),n.isPresenting=!1,e.setPixelRatio(C),e.setSize(S.width,S.height,!1),n.dispatchEvent({type:`sessionend`})}this.setFramebufferScaleFactor=function(e){i=e,n.isPresenting===!0&&z(`WebXRManager: Cannot change framebuffer scale while presenting.`)},this.setReferenceSpaceType=function(e){o=e,n.isPresenting===!0&&z(`WebXRManager: Cannot change reference space type while presenting.`)},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(e){c=e},this.getBaseLayer=function(){return d===null?f:d},this.getBinding=function(){return u===null&&m&&(u=new XRWebGLBinding(r,t)),u},this.getFrame=function(){return p},this.getSession=function(){return r},this.setSession=async function(l){if(r=l,r!==null){if(v=e.getRenderTarget(),r.addEventListener(`select`,A),r.addEventListener(`selectstart`,A),r.addEventListener(`selectend`,A),r.addEventListener(`squeeze`,A),r.addEventListener(`squeezestart`,A),r.addEventListener(`squeezeend`,A),r.addEventListener(`end`,j),r.addEventListener(`inputsourceschange`,M),_.xrCompatible!==!0&&await t.makeXRCompatible(),C=e.getPixelRatio(),e.getSize(S),m&&`createProjectionLayer`in XRWebGLBinding.prototype){let n=null,a=null,o=null;_.depth&&(o=_.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,n=_.stencil?Qe:Ze,a=_.stencil?Ge:Be);let s={colorFormat:t.RGBA8,depthFormat:o,scaleFactor:i};u=this.getBinding(),d=u.createProjectionLayer(s),r.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),y=new Wn(d.textureWidth,d.textureHeight,{format:Xe,type:Fe,depthTexture:new za(d.textureWidth,d.textureHeight,a,void 0,void 0,void 0,void 0,void 0,void 0,n),stencilBuffer:_.stencil,colorSpace:e.outputColorSpace,samples:_.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}else{let n={antialias:_.antialias,alpha:!0,depth:_.depth,stencil:_.stencil,framebufferScaleFactor:i};f=new XRWebGLLayer(r,t,n),r.updateRenderState({baseLayer:f}),e.setPixelRatio(1),e.setSize(f.framebufferWidth,f.framebufferHeight,!1),y=new Wn(f.framebufferWidth,f.framebufferHeight,{format:Xe,type:Fe,colorSpace:e.outputColorSpace,stencilBuffer:_.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(s),c=null,a=await r.requestReferenceSpace(o),ae.setContext(r),ae.start(),n.isPresenting=!0,n.dispatchEvent({type:`sessionstart`})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return h.getDepthTexture()};function M(e){for(let t=0;t<e.removed.length;t++){let n=e.removed[t],r=x.indexOf(n);r>=0&&(x[r]=null,b[r].disconnect(n))}for(let t=0;t<e.added.length;t++){let n=e.added[t],r=x.indexOf(n);if(r===-1){for(let e=0;e<b.length;e++)if(e>=x.length){x.push(n),r=e;break}else if(x[e]===null){x[e]=n,r=e;break}if(r===-1)break}let i=b[r];i&&i.connect(n)}}let N=new H,ee=new H;function P(e,t,n){N.setFromMatrixPosition(t.matrixWorld),ee.setFromMatrixPosition(n.matrixWorld);let r=N.distanceTo(ee),i=t.projectionMatrix.elements,a=n.projectionMatrix.elements,o=i[14]/(i[10]-1),s=i[14]/(i[10]+1),c=(i[9]+1)/i[5],l=(i[9]-1)/i[5],u=(i[8]-1)/i[0],d=(a[8]+1)/a[0],f=o*u,p=o*d,m=r/(-u+d),h=m*-u;if(t.matrixWorld.decompose(e.position,e.quaternion,e.scale),e.translateX(h),e.translateZ(m),e.matrixWorld.compose(e.position,e.quaternion,e.scale),e.matrixWorldInverse.copy(e.matrixWorld).invert(),i[10]===-1)e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse);else{let t=o+m,n=s+m,i=f-h,a=p+(r-h),u=c*s/n*t,d=l*s/n*t;e.projectionMatrix.makePerspective(i,a,u,d,t,n),e.projectionMatrixInverse.copy(e.projectionMatrix).invert()}}function te(e,t){t===null?e.matrixWorld.copy(e.matrix):e.matrixWorld.multiplyMatrices(t.matrixWorld,e.matrix),e.matrixWorldInverse.copy(e.matrixWorld).invert()}this.updateCamera=function(e){if(r===null)return;let t=e.near,n=e.far;h.texture!==null&&(h.depthNear>0&&(t=h.depthNear),h.depthFar>0&&(n=h.depthFar)),D.near=T.near=w.near=t,D.far=T.far=w.far=n,(O!==D.near||k!==D.far)&&(r.updateRenderState({depthNear:D.near,depthFar:D.far}),O=D.near,k=D.far),D.layers.mask=e.layers.mask|6,w.layers.mask=D.layers.mask&-5,T.layers.mask=D.layers.mask&-3;let i=e.parent,a=D.cameras;te(D,i);for(let e=0;e<a.length;e++)te(a[e],i);a.length===2?P(D,w,T):D.projectionMatrix.copy(w.projectionMatrix),ne(e,D,i)};function ne(e,t,n){n===null?e.matrix.copy(t.matrixWorld):(e.matrix.copy(n.matrixWorld),e.matrix.invert(),e.matrix.multiply(t.matrixWorld)),e.matrix.decompose(e.position,e.quaternion,e.scale),e.updateMatrixWorld(!0),e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse),e.isPerspectiveCamera&&(e.fov=gn*2*Math.atan(1/e.projectionMatrix.elements[5]),e.zoom=1)}this.getCamera=function(){return D},this.getFoveation=function(){if(d!==null||f!==null)return s},this.setFoveation=function(e){s=e,d!==null&&(d.fixedFoveation=e),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=e)},this.hasDepthSensing=function(){return h.texture!==null},this.getDepthSensingMesh=function(){return h.getMesh(D)},this.getCameraTexture=function(e){return g[e]};let re=null;function ie(t,i){if(l=i.getViewerPose(c||a),p=i,l!==null){let t=l.views;f!==null&&(e.setRenderTargetFramebuffer(y,f.framebuffer),e.setRenderTarget(y));let i=!1;t.length!==D.cameras.length&&(D.cameras.length=0,i=!0);for(let n=0;n<t.length;n++){let r=t[n],a=null;if(f!==null)a=f.getViewport(r);else{let t=u.getViewSubImage(d,r);a=t.viewport,n===0&&(e.setRenderTargetTextures(y,t.colorTexture,t.depthStencilTexture),e.setRenderTarget(y))}let o=E[n];o===void 0&&(o=new oc,o.layers.enable(n),o.viewport=new Hn,E[n]=o),o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.quaternion,o.scale),o.projectionMatrix.fromArray(r.projectionMatrix),o.projectionMatrixInverse.copy(o.projectionMatrix).invert(),o.viewport.set(a.x,a.y,a.width,a.height),n===0&&(D.matrix.copy(o.matrix),D.matrix.decompose(D.position,D.quaternion,D.scale)),i===!0&&D.cameras.push(o)}let a=r.enabledFeatures;if(a&&a.includes(`depth-sensing`)&&r.depthUsage==`gpu-optimized`&&m){u=n.getBinding();let e=u.getDepthInformation(t[0]);e&&e.isValid&&e.texture&&h.init(e,r.renderState)}if(a&&a.includes(`camera-access`)&&m){e.state.unbindTexture(),u=n.getBinding();for(let e=0;e<t.length;e++){let n=t[e].camera;if(n){let e=g[n];e||(e=new Va,g[n]=e);let t=u.getCameraImage(n);e.sourceTexture=t}}}}for(let e=0;e<b.length;e++){let t=x[e],n=b[e];t!==null&&n!==void 0&&n.update(t,i,c||a)}re&&re(t,i),i.detectedPlanes&&n.dispatchEvent({type:`planesdetected`,data:i}),p=null}let ae=new Ac;ae.setAnimationLoop(ie),this.setAnimationLoop=function(e){re=e},this.dispose=function(){}}},Rd=new rr,zd=new qn;function Bd(e,t){function n(e,t){e.matrixAutoUpdate===!0&&e.updateMatrix(),t.value.copy(e.matrix)}function r(t,n){n.color.getRGB(t.fogColor.value,Ss(e)),n.isFog?(t.fogNear.value=n.near,t.fogFar.value=n.far):n.isFogExp2&&(t.fogDensity.value=n.density)}function i(e,t,n,r,i){t.isMeshBasicMaterial?a(e,t):t.isMeshLambertMaterial?(a(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshToonMaterial?(a(e,t),d(e,t)):t.isMeshPhongMaterial?(a(e,t),u(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshStandardMaterial?(a(e,t),f(e,t),t.isMeshPhysicalMaterial&&p(e,t,i)):t.isMeshMatcapMaterial?(a(e,t),m(e,t)):t.isMeshDepthMaterial?a(e,t):t.isMeshDistanceMaterial?(a(e,t),h(e,t)):t.isMeshNormalMaterial?a(e,t):t.isLineBasicMaterial?(o(e,t),t.isLineDashedMaterial&&s(e,t)):t.isPointsMaterial?c(e,t,n,r):t.isSpriteMaterial?l(e,t):t.isShadowMaterial?(e.color.value.copy(t.color),e.opacity.value=t.opacity):t.isShaderMaterial&&(t.uniformsNeedUpdate=!1)}function a(e,r){e.opacity.value=r.opacity,r.color&&e.diffuse.value.copy(r.color),r.emissive&&e.emissive.value.copy(r.emissive).multiplyScalar(r.emissiveIntensity),r.map&&(e.map.value=r.map,n(r.map,e.mapTransform)),r.alphaMap&&(e.alphaMap.value=r.alphaMap,n(r.alphaMap,e.alphaMapTransform)),r.bumpMap&&(e.bumpMap.value=r.bumpMap,n(r.bumpMap,e.bumpMapTransform),e.bumpScale.value=r.bumpScale,r.side===1&&(e.bumpScale.value*=-1)),r.normalMap&&(e.normalMap.value=r.normalMap,n(r.normalMap,e.normalMapTransform),e.normalScale.value.copy(r.normalScale),r.side===1&&e.normalScale.value.negate()),r.displacementMap&&(e.displacementMap.value=r.displacementMap,n(r.displacementMap,e.displacementMapTransform),e.displacementScale.value=r.displacementScale,e.displacementBias.value=r.displacementBias),r.emissiveMap&&(e.emissiveMap.value=r.emissiveMap,n(r.emissiveMap,e.emissiveMapTransform)),r.specularMap&&(e.specularMap.value=r.specularMap,n(r.specularMap,e.specularMapTransform)),r.alphaTest>0&&(e.alphaTest.value=r.alphaTest);let i=t.get(r),a=i.envMap,o=i.envMapRotation;a&&(e.envMap.value=a,Rd.copy(o),Rd.x*=-1,Rd.y*=-1,Rd.z*=-1,a.isCubeTexture&&a.isRenderTargetTexture===!1&&(Rd.y*=-1,Rd.z*=-1),e.envMapRotation.value.setFromMatrix4(zd.makeRotationFromEuler(Rd)),e.flipEnvMap.value=a.isCubeTexture&&a.isRenderTargetTexture===!1?-1:1,e.reflectivity.value=r.reflectivity,e.ior.value=r.ior,e.refractionRatio.value=r.refractionRatio),r.lightMap&&(e.lightMap.value=r.lightMap,e.lightMapIntensity.value=r.lightMapIntensity,n(r.lightMap,e.lightMapTransform)),r.aoMap&&(e.aoMap.value=r.aoMap,e.aoMapIntensity.value=r.aoMapIntensity,n(r.aoMap,e.aoMapTransform))}function o(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform))}function s(e,t){e.dashSize.value=t.dashSize,e.totalSize.value=t.dashSize+t.gapSize,e.scale.value=t.scale}function c(e,t,r,i){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.size.value=t.size*r,e.scale.value=i*.5,t.map&&(e.map.value=t.map,n(t.map,e.uvTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function l(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.rotation.value=t.rotation,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function u(e,t){e.specular.value.copy(t.specular),e.shininess.value=Math.max(t.shininess,1e-4)}function d(e,t){t.gradientMap&&(e.gradientMap.value=t.gradientMap)}function f(e,t){e.metalness.value=t.metalness,t.metalnessMap&&(e.metalnessMap.value=t.metalnessMap,n(t.metalnessMap,e.metalnessMapTransform)),e.roughness.value=t.roughness,t.roughnessMap&&(e.roughnessMap.value=t.roughnessMap,n(t.roughnessMap,e.roughnessMapTransform)),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)}function p(e,t,r){e.ior.value=t.ior,t.sheen>0&&(e.sheenColor.value.copy(t.sheenColor).multiplyScalar(t.sheen),e.sheenRoughness.value=t.sheenRoughness,t.sheenColorMap&&(e.sheenColorMap.value=t.sheenColorMap,n(t.sheenColorMap,e.sheenColorMapTransform)),t.sheenRoughnessMap&&(e.sheenRoughnessMap.value=t.sheenRoughnessMap,n(t.sheenRoughnessMap,e.sheenRoughnessMapTransform))),t.clearcoat>0&&(e.clearcoat.value=t.clearcoat,e.clearcoatRoughness.value=t.clearcoatRoughness,t.clearcoatMap&&(e.clearcoatMap.value=t.clearcoatMap,n(t.clearcoatMap,e.clearcoatMapTransform)),t.clearcoatRoughnessMap&&(e.clearcoatRoughnessMap.value=t.clearcoatRoughnessMap,n(t.clearcoatRoughnessMap,e.clearcoatRoughnessMapTransform)),t.clearcoatNormalMap&&(e.clearcoatNormalMap.value=t.clearcoatNormalMap,n(t.clearcoatNormalMap,e.clearcoatNormalMapTransform),e.clearcoatNormalScale.value.copy(t.clearcoatNormalScale),t.side===1&&e.clearcoatNormalScale.value.negate())),t.dispersion>0&&(e.dispersion.value=t.dispersion),t.iridescence>0&&(e.iridescence.value=t.iridescence,e.iridescenceIOR.value=t.iridescenceIOR,e.iridescenceThicknessMinimum.value=t.iridescenceThicknessRange[0],e.iridescenceThicknessMaximum.value=t.iridescenceThicknessRange[1],t.iridescenceMap&&(e.iridescenceMap.value=t.iridescenceMap,n(t.iridescenceMap,e.iridescenceMapTransform)),t.iridescenceThicknessMap&&(e.iridescenceThicknessMap.value=t.iridescenceThicknessMap,n(t.iridescenceThicknessMap,e.iridescenceThicknessMapTransform))),t.transmission>0&&(e.transmission.value=t.transmission,e.transmissionSamplerMap.value=r.texture,e.transmissionSamplerSize.value.set(r.width,r.height),t.transmissionMap&&(e.transmissionMap.value=t.transmissionMap,n(t.transmissionMap,e.transmissionMapTransform)),e.thickness.value=t.thickness,t.thicknessMap&&(e.thicknessMap.value=t.thicknessMap,n(t.thicknessMap,e.thicknessMapTransform)),e.attenuationDistance.value=t.attenuationDistance,e.attenuationColor.value.copy(t.attenuationColor)),t.anisotropy>0&&(e.anisotropyVector.value.set(t.anisotropy*Math.cos(t.anisotropyRotation),t.anisotropy*Math.sin(t.anisotropyRotation)),t.anisotropyMap&&(e.anisotropyMap.value=t.anisotropyMap,n(t.anisotropyMap,e.anisotropyMapTransform))),e.specularIntensity.value=t.specularIntensity,e.specularColor.value.copy(t.specularColor),t.specularColorMap&&(e.specularColorMap.value=t.specularColorMap,n(t.specularColorMap,e.specularColorMapTransform)),t.specularIntensityMap&&(e.specularIntensityMap.value=t.specularIntensityMap,n(t.specularIntensityMap,e.specularIntensityMapTransform))}function m(e,t){t.matcap&&(e.matcap.value=t.matcap)}function h(e,n){let r=t.get(n).light;e.referencePosition.value.setFromMatrixPosition(r.matrixWorld),e.nearDistance.value=r.shadow.camera.near,e.farDistance.value=r.shadow.camera.far}return{refreshFogUniforms:r,refreshMaterialUniforms:i}}function Vd(e,t,n,r){let i={},a={},o=[],s=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function c(e,t){let n=t.program;r.uniformBlockBinding(e,n)}function l(e,n){let o=i[e.id];o===void 0&&(m(e),o=u(e),i[e.id]=o,e.addEventListener(`dispose`,g));let s=n.program;r.updateUBOMapping(e,s);let c=t.render.frame;a[e.id]!==c&&(f(e),a[e.id]=c)}function u(t){let n=d();t.__bindingPointIndex=n;let r=e.createBuffer(),i=t.__size,a=t.usage;return e.bindBuffer(e.UNIFORM_BUFFER,r),e.bufferData(e.UNIFORM_BUFFER,i,a),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,n,r),r}function d(){for(let e=0;e<s;e++)if(o.indexOf(e)===-1)return o.push(e),e;return B(`WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.`),0}function f(t){let n=i[t.id],r=t.uniforms,a=t.__cache;e.bindBuffer(e.UNIFORM_BUFFER,n);for(let t=0,n=r.length;t<n;t++){let n=Array.isArray(r[t])?r[t]:[r[t]];for(let r=0,i=n.length;r<i;r++){let i=n[r];if(p(i,t,r,a)===!0){let t=i.__offset,n=Array.isArray(i.value)?i.value:[i.value],r=0;for(let a=0;a<n.length;a++){let o=n[a],s=h(o);typeof o==`number`||typeof o==`boolean`?(i.__data[0]=o,e.bufferSubData(e.UNIFORM_BUFFER,t+r,i.__data)):o.isMatrix3?(i.__data[0]=o.elements[0],i.__data[1]=o.elements[1],i.__data[2]=o.elements[2],i.__data[3]=0,i.__data[4]=o.elements[3],i.__data[5]=o.elements[4],i.__data[6]=o.elements[5],i.__data[7]=0,i.__data[8]=o.elements[6],i.__data[9]=o.elements[7],i.__data[10]=o.elements[8],i.__data[11]=0):(o.toArray(i.__data,r),r+=s.storage/Float32Array.BYTES_PER_ELEMENT)}e.bufferSubData(e.UNIFORM_BUFFER,t,i.__data)}}}e.bindBuffer(e.UNIFORM_BUFFER,null)}function p(e,t,n,r){let i=e.value,a=t+`_`+n;if(r[a]===void 0)return r[a]=typeof i==`number`||typeof i==`boolean`?i:i.clone(),!0;{let e=r[a];if(typeof i==`number`||typeof i==`boolean`){if(e!==i)return r[a]=i,!0}else if(e.equals(i)===!1)return e.copy(i),!0}return!1}function m(e){let t=e.uniforms,n=0;for(let e=0,r=t.length;e<r;e++){let r=Array.isArray(t[e])?t[e]:[t[e]];for(let e=0,t=r.length;e<t;e++){let t=r[e],i=Array.isArray(t.value)?t.value:[t.value];for(let e=0,r=i.length;e<r;e++){let r=i[e],a=h(r),o=n%16,s=o%a.boundary,c=o+s;n+=s,c!==0&&16-c<a.storage&&(n+=16-c),t.__data=new Float32Array(a.storage/Float32Array.BYTES_PER_ELEMENT),t.__offset=n,n+=a.storage}}}let r=n%16;return r>0&&(n+=16-r),e.__size=n,e.__cache={},this}function h(e){let t={boundary:0,storage:0};return typeof e==`number`||typeof e==`boolean`?(t.boundary=4,t.storage=4):e.isVector2?(t.boundary=8,t.storage=8):e.isVector3||e.isColor?(t.boundary=16,t.storage=12):e.isVector4?(t.boundary=16,t.storage=16):e.isMatrix3?(t.boundary=48,t.storage=48):e.isMatrix4?(t.boundary=64,t.storage=64):e.isTexture?z(`WebGLRenderer: Texture samplers can not be part of an uniforms group.`):z(`WebGLRenderer: Unsupported uniform value type.`,e),t}function g(t){let n=t.target;n.removeEventListener(`dispose`,g);let r=o.indexOf(n.__bindingPointIndex);o.splice(r,1),e.deleteBuffer(i[n.id]),delete i[n.id],delete a[n.id]}function _(){for(let t in i)e.deleteBuffer(i[t]);o=[],i={},a={}}return{bind:c,update:l,dispose:_}}var Hd=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),Ud=null;function Wd(){return Ud===null&&(Ud=new fa(Hd,16,16,tt,He),Ud.name=`DFG_LUT`,Ud.minFilter=Me,Ud.magFilter=Me,Ud.wrapS=De,Ud.wrapT=De,Ud.generateMipmaps=!1,Ud.needsUpdate=!0),Ud}var Gd=class{constructor(e={}){let{canvas:t=on(),context:n=null,depth:r=!0,stencil:i=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:s=!0,preserveDrawingBuffer:c=!1,powerPreference:l=`default`,failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:d=!1,outputBufferType:f=Fe}=e;this.isWebGLRenderer=!0;let p;if(n!==null){if(typeof WebGLRenderingContext<`u`&&n instanceof WebGLRenderingContext)throw Error(`THREE.WebGLRenderer: WebGL 1 is not supported since r163.`);p=n.getContextAttributes().alpha}else p=a;let m=f,h=new Set([rt,nt,et]),g=new Set([Fe,Be,Re,Ge,Ue,We]),_=new Uint32Array(4),v=new Int32Array(4),y=null,b=null,x=[],S=[],C=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=0,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let w=this,T=!1;this._outputColorSpace=Jt;let E=0,D=0,O=null,k=-1,A=null,j=new Hn,M=new Hn,N=null,ee=new W(0),P=0,te=t.width,ne=t.height,re=1,ie=null,ae=null,oe=new Hn(0,0,te,ne),F=new Hn(0,0,te,ne),se=!1,ce=new ka,le=!1,ue=!1,de=new qn,fe=new H,pe=new Hn,me={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},he=!1;function ge(){return O===null?re:1}let I=n;function _e(e,n){return t.getContext(e,n)}try{let e={alpha:!0,depth:r,stencil:i,antialias:o,premultipliedAlpha:s,preserveDrawingBuffer:c,powerPreference:l,failIfMajorPerformanceCaveat:u};if(`setAttribute`in t&&t.setAttribute(`data-engine`,`three.js r183`),t.addEventListener(`webglcontextlost`,Ye,!1),t.addEventListener(`webglcontextrestored`,Xe,!1),t.addEventListener(`webglcontextcreationerror`,Ze,!1),I===null){let t=`webgl2`;if(I=_e(t,e),I===null)throw _e(t)?Error(`Error creating WebGL context with your selected attributes.`):Error(`Error creating WebGL context.`)}}catch(e){throw B(`WebGLRenderer: `+e.message),e}let ve,ye,L,be,R,xe,Se,Ce,we,Te,Ee,De,Oe,ke,Ae,je,Me,Ne,Ie,Le,ze,Ve,Ke;function qe(){ve=new ul(I),ve.init(),ze=new Nd(I,ve),ye=new Bc(I,ve,e,ze),L=new jd(I,ve),ye.reversedDepthBuffer&&d&&L.buffers.depth.setReversed(!0),be=new pl(I),R=new dd,xe=new Md(I,ve,L,R,ye,ze,be),Se=new ll(w),Ce=new jc(I),Ve=new Rc(I,Ce),we=new dl(I,Ce,be,Ve),Te=new hl(I,we,Ce,Ve,be),Ne=new ml(I,ye,xe),Ae=new Vc(R),Ee=new ud(w,Se,ve,ye,Ve,Ae),De=new Bd(w,R),Oe=new hd,ke=new Sd(ve),Me=new Lc(w,Se,L,Te,p,s),je=new Ad(w,Te,ye),Ke=new Vd(I,be,ye,L),Ie=new zc(I,ve,be),Le=new fl(I,ve,be),be.programs=Ee.programs,w.capabilities=ye,w.extensions=ve,w.properties=R,w.renderLists=Oe,w.shadowMap=je,w.state=L,w.info=be}qe(),m!==1009&&(C=new _l(m,t.width,t.height,r,i));let Je=new Ld(w,I);this.xr=Je,this.getContext=function(){return I},this.getContextAttributes=function(){return I.getContextAttributes()},this.forceContextLoss=function(){let e=ve.get(`WEBGL_lose_context`);e&&e.loseContext()},this.forceContextRestore=function(){let e=ve.get(`WEBGL_lose_context`);e&&e.restoreContext()},this.getPixelRatio=function(){return re},this.setPixelRatio=function(e){e!==void 0&&(re=e,this.setSize(te,ne,!1))},this.getSize=function(e){return e.set(te,ne)},this.setSize=function(e,n,r=!0){Je.isPresenting?z(`WebGLRenderer: Can't change size while VR device is presenting.`):(te=e,ne=n,t.width=Math.floor(e*re),t.height=Math.floor(n*re),r===!0&&(t.style.width=e+`px`,t.style.height=n+`px`),C!==null&&C.setSize(t.width,t.height),this.setViewport(0,0,e,n))},this.getDrawingBufferSize=function(e){return e.set(te*re,ne*re).floor()},this.setDrawingBufferSize=function(e,n,r){te=e,ne=n,re=r,t.width=Math.floor(e*r),t.height=Math.floor(n*r),this.setViewport(0,0,e,n)},this.setEffects=function(e){if(m===1009)console.error(`THREE.WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.`);else{if(e){for(let t=0;t<e.length;t++)if(e[t].isOutputPass===!0){console.warn(`THREE.WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.`);break}}C.setEffects(e||[])}},this.getCurrentViewport=function(e){return e.copy(j)},this.getViewport=function(e){return e.copy(oe)},this.setViewport=function(e,t,n,r){e.isVector4?oe.set(e.x,e.y,e.z,e.w):oe.set(e,t,n,r),L.viewport(j.copy(oe).multiplyScalar(re).round())},this.getScissor=function(e){return e.copy(F)},this.setScissor=function(e,t,n,r){e.isVector4?F.set(e.x,e.y,e.z,e.w):F.set(e,t,n,r),L.scissor(M.copy(F).multiplyScalar(re).round())},this.getScissorTest=function(){return se},this.setScissorTest=function(e){L.setScissorTest(se=e)},this.setOpaqueSort=function(e){ie=e},this.setTransparentSort=function(e){ae=e},this.getClearColor=function(e){return e.copy(Me.getClearColor())},this.setClearColor=function(){Me.setClearColor(...arguments)},this.getClearAlpha=function(){return Me.getClearAlpha()},this.setClearAlpha=function(){Me.setClearAlpha(...arguments)},this.clear=function(e=!0,t=!0,n=!0){let r=0;if(e){let e=!1;if(O!==null){let t=O.texture.format;e=h.has(t)}if(e){let e=O.texture.type,t=g.has(e),n=Me.getClearColor(),r=Me.getClearAlpha(),i=n.r,a=n.g,o=n.b;t?(_[0]=i,_[1]=a,_[2]=o,_[3]=r,I.clearBufferuiv(I.COLOR,0,_)):(v[0]=i,v[1]=a,v[2]=o,v[3]=r,I.clearBufferiv(I.COLOR,0,v))}else r|=I.COLOR_BUFFER_BIT}t&&(r|=I.DEPTH_BUFFER_BIT),n&&(r|=I.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),r!==0&&I.clear(r)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener(`webglcontextlost`,Ye,!1),t.removeEventListener(`webglcontextrestored`,Xe,!1),t.removeEventListener(`webglcontextcreationerror`,Ze,!1),Me.dispose(),Oe.dispose(),ke.dispose(),R.dispose(),Se.dispose(),Te.dispose(),Ve.dispose(),Ke.dispose(),Ee.dispose(),Je.dispose(),Je.removeEventListener(`sessionstart`,st),Je.removeEventListener(`sessionend`,ct),lt.stop()};function Ye(e){e.preventDefault(),cn(`WebGLRenderer: Context Lost.`),T=!0}function Xe(){cn(`WebGLRenderer: Context Restored.`),T=!1;let e=be.autoReset,t=je.enabled,n=je.autoUpdate,r=je.needsUpdate,i=je.type;qe(),be.autoReset=e,je.enabled=t,je.autoUpdate=n,je.needsUpdate=r,je.type=i}function Ze(e){B(`WebGLRenderer: A WebGL context could not be created. Reason: `,e.statusMessage)}function Qe(e){let t=e.target;t.removeEventListener(`dispose`,Qe),$e(t)}function $e(e){tt(e),R.remove(e)}function tt(e){let t=R.get(e).programs;t!==void 0&&(t.forEach(function(e){Ee.releaseProgram(e)}),e.isShaderMaterial&&Ee.releaseShaderCache(e))}this.renderBufferDirect=function(e,t,n,r,i,a){t===null&&(t=me);let o=i.isMesh&&i.matrixWorld.determinant()<0,s=vt(e,t,n,r,i);L.setMaterial(r,o);let c=n.index,l=1;if(r.wireframe===!0){if(c=we.getWireframeAttribute(n),c===void 0)return;l=2}let u=n.drawRange,d=n.attributes.position,f=u.start*l,p=(u.start+u.count)*l;a!==null&&(f=Math.max(f,a.start*l),p=Math.min(p,(a.start+a.count)*l)),c===null?d!=null&&(f=Math.max(f,0),p=Math.min(p,d.count)):(f=Math.max(f,0),p=Math.min(p,c.count));let m=p-f;if(m<0||m===1/0)return;Ve.setup(i,r,s,n,c);let h,g=Ie;if(c!==null&&(h=Ce.get(c),g=Le,g.setIndex(h)),i.isMesh)r.wireframe===!0?(L.setLineWidth(r.wireframeLinewidth*ge()),g.setMode(I.LINES)):g.setMode(I.TRIANGLES);else if(i.isLine){let e=r.linewidth;e===void 0&&(e=1),L.setLineWidth(e*ge()),i.isLineSegments?g.setMode(I.LINES):i.isLineLoop?g.setMode(I.LINE_LOOP):g.setMode(I.LINE_STRIP)}else i.isPoints?g.setMode(I.POINTS):i.isSprite&&g.setMode(I.TRIANGLES);if(i.isBatchedMesh){if(i._multiDrawInstances!==null)un(`WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection.`),g.renderMultiDrawInstances(i._multiDrawStarts,i._multiDrawCounts,i._multiDrawCount,i._multiDrawInstances);else if(ve.get(`WEBGL_multi_draw`))g.renderMultiDraw(i._multiDrawStarts,i._multiDrawCounts,i._multiDrawCount);else{let e=i._multiDrawStarts,t=i._multiDrawCounts,n=i._multiDrawCount,a=c?Ce.get(c).bytesPerElement:1,o=R.get(r).currentProgram.getUniforms();for(let r=0;r<n;r++)o.setValue(I,`_gl_DrawID`,r),g.render(e[r]/a,t[r])}}else if(i.isInstancedMesh)g.renderInstances(f,m,i.count);else if(n.isInstancedBufferGeometry){let e=n._maxInstanceCount===void 0?1/0:n._maxInstanceCount,t=Math.min(n.instanceCount,e);g.renderInstances(f,m,t)}else g.render(f,m)};function it(e,t,n){e.transparent===!0&&e.side===2&&e.forceSinglePass===!1?(e.side=1,e.needsUpdate=!0,ht(e,t,n),e.side=0,e.needsUpdate=!0,ht(e,t,n),e.side=2):ht(e,t,n)}this.compile=function(e,t,n=null){n===null&&(n=e),b=ke.get(n),b.init(t),S.push(b),n.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(b.pushLight(e),e.castShadow&&b.pushShadow(e))}),e!==n&&e.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(b.pushLight(e),e.castShadow&&b.pushShadow(e))}),b.setupLights();let r=new Set;return e.traverse(function(e){if(!(e.isMesh||e.isPoints||e.isLine||e.isSprite))return;let t=e.material;if(t){if(Array.isArray(t))for(let i=0;i<t.length;i++){let a=t[i];it(a,n,e),r.add(a)}else it(t,n,e),r.add(t)}}),b=S.pop(),r},this.compileAsync=function(e,t,n=null){let r=this.compile(e,t,n);return new Promise(t=>{function n(){r.forEach(function(e){R.get(e).currentProgram.isReady()&&r.delete(e)}),r.size===0?t(e):setTimeout(n,10)}ve.get(`KHR_parallel_shader_compile`)===null?setTimeout(n,10):n()})};let at=null;function ot(e){at&&at(e)}function st(){lt.stop()}function ct(){lt.start()}let lt=new Ac;lt.setAnimationLoop(ot),typeof self<`u`&&lt.setContext(self),this.setAnimationLoop=function(e){at=e,Je.setAnimationLoop(e),e===null?lt.stop():lt.start()},Je.addEventListener(`sessionstart`,st),Je.addEventListener(`sessionend`,ct),this.render=function(e,t){if(t!==void 0&&t.isCamera!==!0){B(`WebGLRenderer.render: camera is not an instance of THREE.Camera.`);return}if(T===!0)return;let n=Je.enabled===!0&&Je.isPresenting===!0,r=C!==null&&(O===null||n)&&C.begin(w,O);if(e.matrixWorldAutoUpdate===!0&&e.updateMatrixWorld(),t.parent===null&&t.matrixWorldAutoUpdate===!0&&t.updateMatrixWorld(),Je.enabled===!0&&Je.isPresenting===!0&&(C===null||C.isCompositing()===!1)&&(Je.cameraAutoUpdate===!0&&Je.updateCamera(t),t=Je.getCamera()),e.isScene===!0&&e.onBeforeRender(w,e,t,O),b=ke.get(e,S.length),b.init(t),S.push(b),de.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),ce.setFromProjectionMatrix(de,tn,t.reversedDepth),ue=this.localClippingEnabled,le=Ae.init(this.clippingPlanes,ue),y=Oe.get(e,x.length),y.init(),x.push(y),Je.enabled===!0&&Je.isPresenting===!0){let e=w.xr.getDepthSensingMesh();e!==null&&ut(e,t,-1/0,w.sortObjects)}ut(e,t,0,w.sortObjects),y.finish(),w.sortObjects===!0&&y.sort(ie,ae),he=Je.enabled===!1||Je.isPresenting===!1||Je.hasDepthSensing()===!1,he&&Me.addToRenderList(y,e),this.info.render.frame++,le===!0&&Ae.beginShadows();let i=b.state.shadowsArray;if(je.render(i,e,t),le===!0&&Ae.endShadows(),this.info.autoReset===!0&&this.info.reset(),(r&&C.hasRenderPass())===!1){let n=y.opaque,r=y.transmissive;if(b.setupLights(),t.isArrayCamera){let i=t.cameras;if(r.length>0)for(let t=0,a=i.length;t<a;t++){let a=i[t];ft(n,r,e,a)}he&&Me.render(e);for(let t=0,n=i.length;t<n;t++){let n=i[t];dt(y,e,n,n.viewport)}}else r.length>0&&ft(n,r,e,t),he&&Me.render(e),dt(y,e,t)}O!==null&&D===0&&(xe.updateMultisampleRenderTarget(O),xe.updateRenderTargetMipmap(O)),r&&C.end(w),e.isScene===!0&&e.onAfterRender(w,e,t),Ve.resetDefaultState(),k=-1,A=null,S.pop(),S.length>0?(b=S[S.length-1],le===!0&&Ae.setGlobalState(w.clippingPlanes,b.state.camera)):b=null,x.pop(),y=x.length>0?x[x.length-1]:null};function ut(e,t,n,r){if(e.visible===!1)return;if(e.layers.test(t.layers)){if(e.isGroup)n=e.renderOrder;else if(e.isLOD)e.autoUpdate===!0&&e.update(t);else if(e.isLight)b.pushLight(e),e.castShadow&&b.pushShadow(e);else if(e.isSprite){if(!e.frustumCulled||ce.intersectsSprite(e)){r&&pe.setFromMatrixPosition(e.matrixWorld).applyMatrix4(de);let t=Te.update(e),i=e.material;i.visible&&y.push(e,t,i,n,pe.z,null)}}else if((e.isMesh||e.isLine||e.isPoints)&&(!e.frustumCulled||ce.intersectsObject(e))){let t=Te.update(e),i=e.material;if(r&&(e.boundingSphere===void 0?(t.boundingSphere===null&&t.computeBoundingSphere(),pe.copy(t.boundingSphere.center)):(e.boundingSphere===null&&e.computeBoundingSphere(),pe.copy(e.boundingSphere.center)),pe.applyMatrix4(e.matrixWorld).applyMatrix4(de)),Array.isArray(i)){let r=t.groups;for(let a=0,o=r.length;a<o;a++){let o=r[a],s=i[o.materialIndex];s&&s.visible&&y.push(e,t,s,n,pe.z,o)}}else i.visible&&y.push(e,t,i,n,pe.z,null)}}let i=e.children;for(let e=0,a=i.length;e<a;e++)ut(i[e],t,n,r)}function dt(e,t,n,r){let{opaque:i,transmissive:a,transparent:o}=e;b.setupLightsView(n),le===!0&&Ae.setGlobalState(w.clippingPlanes,n),r&&L.viewport(j.copy(r)),i.length>0&&pt(i,t,n),a.length>0&&pt(a,t,n),o.length>0&&pt(o,t,n),L.buffers.depth.setTest(!0),L.buffers.depth.setMask(!0),L.buffers.color.setMask(!0),L.setPolygonOffset(!1)}function ft(e,t,n,r){if((n.isScene===!0?n.overrideMaterial:null)!==null)return;if(b.state.transmissionRenderTarget[r.id]===void 0){let e=ve.has(`EXT_color_buffer_half_float`)||ve.has(`EXT_color_buffer_float`);b.state.transmissionRenderTarget[r.id]=new Wn(1,1,{generateMipmaps:!0,type:e?He:Fe,minFilter:Pe,samples:Math.max(4,ye.samples),stencilBuffer:i,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:jn.workingColorSpace})}let a=b.state.transmissionRenderTarget[r.id],o=r.viewport||j;a.setSize(o.z*w.transmissionResolutionScale,o.w*w.transmissionResolutionScale);let s=w.getRenderTarget(),c=w.getActiveCubeFace(),l=w.getActiveMipmapLevel();w.setRenderTarget(a),w.getClearColor(ee),P=w.getClearAlpha(),P<1&&w.setClearColor(16777215,.5),w.clear(),he&&Me.render(n);let u=w.toneMapping;w.toneMapping=0;let d=r.viewport;if(r.viewport!==void 0&&(r.viewport=void 0),b.setupLightsView(r),le===!0&&Ae.setGlobalState(w.clippingPlanes,r),pt(e,n,r),xe.updateMultisampleRenderTarget(a),xe.updateRenderTargetMipmap(a),ve.has(`WEBGL_multisampled_render_to_texture`)===!1){let e=!1;for(let i=0,a=t.length;i<a;i++){let{object:a,geometry:o,material:s,group:c}=t[i];if(s.side===2&&a.layers.test(r.layers)){let t=s.side;s.side=1,s.needsUpdate=!0,mt(a,n,r,o,s,c),s.side=t,s.needsUpdate=!0,e=!0}}e===!0&&(xe.updateMultisampleRenderTarget(a),xe.updateRenderTargetMipmap(a))}w.setRenderTarget(s,c,l),w.setClearColor(ee,P),d!==void 0&&(r.viewport=d),w.toneMapping=u}function pt(e,t,n){let r=t.isScene===!0?t.overrideMaterial:null;for(let i=0,a=e.length;i<a;i++){let a=e[i],{object:o,geometry:s,group:c}=a,l=a.material;l.allowOverride===!0&&r!==null&&(l=r),o.layers.test(n.layers)&&mt(o,t,n,s,l,c)}}function mt(e,t,n,r,i,a){e.onBeforeRender(w,t,n,r,i,a),e.modelViewMatrix.multiplyMatrices(n.matrixWorldInverse,e.matrixWorld),e.normalMatrix.getNormalMatrix(e.modelViewMatrix),i.onBeforeRender(w,t,n,r,e,a),i.transparent===!0&&i.side===2&&i.forceSinglePass===!1?(i.side=1,i.needsUpdate=!0,w.renderBufferDirect(n,t,r,i,e,a),i.side=0,i.needsUpdate=!0,w.renderBufferDirect(n,t,r,i,e,a),i.side=2):w.renderBufferDirect(n,t,r,i,e,a),e.onAfterRender(w,t,n,r,i,a)}function ht(e,t,n){t.isScene!==!0&&(t=me);let r=R.get(e),i=b.state.lights,a=b.state.shadowsArray,o=i.state.version,s=Ee.getParameters(e,i.state,a,t,n),c=Ee.getProgramCacheKey(s),l=r.programs;r.environment=e.isMeshStandardMaterial||e.isMeshLambertMaterial||e.isMeshPhongMaterial?t.environment:null,r.fog=t.fog;let u=e.isMeshStandardMaterial||e.isMeshLambertMaterial&&!e.envMap||e.isMeshPhongMaterial&&!e.envMap;r.envMap=Se.get(e.envMap||r.environment,u),r.envMapRotation=r.environment!==null&&e.envMap===null?t.environmentRotation:e.envMapRotation,l===void 0&&(e.addEventListener(`dispose`,Qe),l=new Map,r.programs=l);let d=l.get(c);if(d!==void 0){if(r.currentProgram===d&&r.lightsStateVersion===o)return _t(e,s),d}else s.uniforms=Ee.getUniforms(e),e.onBeforeCompile(s,w),d=Ee.acquireProgram(s,c),l.set(c,d),r.uniforms=s.uniforms;let f=r.uniforms;return(!e.isShaderMaterial&&!e.isRawShaderMaterial||e.clipping===!0)&&(f.clippingPlanes=Ae.uniform),_t(e,s),r.needsLights=bt(e),r.lightsStateVersion=o,r.needsLights&&(f.ambientLightColor.value=i.state.ambient,f.lightProbe.value=i.state.probe,f.directionalLights.value=i.state.directional,f.directionalLightShadows.value=i.state.directionalShadow,f.spotLights.value=i.state.spot,f.spotLightShadows.value=i.state.spotShadow,f.rectAreaLights.value=i.state.rectArea,f.ltc_1.value=i.state.rectAreaLTC1,f.ltc_2.value=i.state.rectAreaLTC2,f.pointLights.value=i.state.point,f.pointLightShadows.value=i.state.pointShadow,f.hemisphereLights.value=i.state.hemi,f.directionalShadowMatrix.value=i.state.directionalShadowMatrix,f.spotLightMatrix.value=i.state.spotLightMatrix,f.spotLightMap.value=i.state.spotLightMap,f.pointShadowMatrix.value=i.state.pointShadowMatrix),r.currentProgram=d,r.uniformsList=null,d}function gt(e){if(e.uniformsList===null){let t=e.currentProgram.getUniforms();e.uniformsList=wu.seqWithValue(t.seq,e.uniforms)}return e.uniformsList}function _t(e,t){let n=R.get(e);n.outputColorSpace=t.outputColorSpace,n.batching=t.batching,n.batchingColor=t.batchingColor,n.instancing=t.instancing,n.instancingColor=t.instancingColor,n.instancingMorph=t.instancingMorph,n.skinning=t.skinning,n.morphTargets=t.morphTargets,n.morphNormals=t.morphNormals,n.morphColors=t.morphColors,n.morphTargetsCount=t.morphTargetsCount,n.numClippingPlanes=t.numClippingPlanes,n.numIntersection=t.numClipIntersection,n.vertexAlphas=t.vertexAlphas,n.vertexTangents=t.vertexTangents,n.toneMapping=t.toneMapping}function vt(e,t,n,r,i){t.isScene!==!0&&(t=me),xe.resetTextureUnits();let a=t.fog,o=r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial?t.environment:null,s=O===null?w.outputColorSpace:O.isXRRenderTarget===!0?O.texture.colorSpace:Yt,c=r.isMeshStandardMaterial||r.isMeshLambertMaterial&&!r.envMap||r.isMeshPhongMaterial&&!r.envMap,l=Se.get(r.envMap||o,c),u=r.vertexColors===!0&&!!n.attributes.color&&n.attributes.color.itemSize===4,d=!!n.attributes.tangent&&(!!r.normalMap||r.anisotropy>0),f=!!n.morphAttributes.position,p=!!n.morphAttributes.normal,m=!!n.morphAttributes.color,h=0;r.toneMapped&&(O===null||O.isXRRenderTarget===!0)&&(h=w.toneMapping);let g=n.morphAttributes.position||n.morphAttributes.normal||n.morphAttributes.color,_=g===void 0?0:g.length,v=R.get(r),y=b.state.lights;if(le===!0&&(ue===!0||e!==A)){let t=e===A&&r.id===k;Ae.setState(r,e,t)}let x=!1;r.version===v.__version?v.needsLights&&v.lightsStateVersion!==y.state.version?x=!0:v.outputColorSpace===s?i.isBatchedMesh&&v.batching===!1||!i.isBatchedMesh&&v.batching===!0||i.isBatchedMesh&&v.batchingColor===!0&&i.colorTexture===null||i.isBatchedMesh&&v.batchingColor===!1&&i.colorTexture!==null||i.isInstancedMesh&&v.instancing===!1||!i.isInstancedMesh&&v.instancing===!0||i.isSkinnedMesh&&v.skinning===!1||!i.isSkinnedMesh&&v.skinning===!0||i.isInstancedMesh&&v.instancingColor===!0&&i.instanceColor===null||i.isInstancedMesh&&v.instancingColor===!1&&i.instanceColor!==null||i.isInstancedMesh&&v.instancingMorph===!0&&i.morphTexture===null||i.isInstancedMesh&&v.instancingMorph===!1&&i.morphTexture!==null?x=!0:v.envMap===l?r.fog===!0&&v.fog!==a||v.numClippingPlanes!==void 0&&(v.numClippingPlanes!==Ae.numPlanes||v.numIntersection!==Ae.numIntersection)?x=!0:v.vertexAlphas===u&&v.vertexTangents===d&&v.morphTargets===f&&v.morphNormals===p&&v.morphColors===m&&v.toneMapping===h?v.morphTargetsCount!==_&&(x=!0):x=!0:x=!0:x=!0:(x=!0,v.__version=r.version);let S=v.currentProgram;x===!0&&(S=ht(r,t,i));let C=!1,T=!1,E=!1,D=S.getUniforms(),j=v.uniforms;if(L.useProgram(S.program)&&(C=!0,T=!0,E=!0),r.id!==k&&(k=r.id,T=!0),C||A!==e){L.buffers.depth.getReversed()&&e.reversedDepth!==!0&&(e._reversedDepth=!0,e.updateProjectionMatrix()),D.setValue(I,`projectionMatrix`,e.projectionMatrix),D.setValue(I,`viewMatrix`,e.matrixWorldInverse);let t=D.map.cameraPosition;t!==void 0&&t.setValue(I,fe.setFromMatrixPosition(e.matrixWorld)),ye.logarithmicDepthBuffer&&D.setValue(I,`logDepthBufFC`,2/(Math.log(e.far+1)/Math.LN2)),(r.isMeshPhongMaterial||r.isMeshToonMaterial||r.isMeshLambertMaterial||r.isMeshBasicMaterial||r.isMeshStandardMaterial||r.isShaderMaterial)&&D.setValue(I,`isOrthographic`,e.isOrthographicCamera===!0),A!==e&&(A=e,T=!0,E=!0)}if(v.needsLights&&(y.state.directionalShadowMap.length>0&&D.setValue(I,`directionalShadowMap`,y.state.directionalShadowMap,xe),y.state.spotShadowMap.length>0&&D.setValue(I,`spotShadowMap`,y.state.spotShadowMap,xe),y.state.pointShadowMap.length>0&&D.setValue(I,`pointShadowMap`,y.state.pointShadowMap,xe)),i.isSkinnedMesh){D.setOptional(I,i,`bindMatrix`),D.setOptional(I,i,`bindMatrixInverse`);let e=i.skeleton;e&&(e.boneTexture===null&&e.computeBoneTexture(),D.setValue(I,`boneTexture`,e.boneTexture,xe))}i.isBatchedMesh&&(D.setOptional(I,i,`batchingTexture`),D.setValue(I,`batchingTexture`,i._matricesTexture,xe),D.setOptional(I,i,`batchingIdTexture`),D.setValue(I,`batchingIdTexture`,i._indirectTexture,xe),D.setOptional(I,i,`batchingColorTexture`),i._colorsTexture!==null&&D.setValue(I,`batchingColorTexture`,i._colorsTexture,xe));let M=n.morphAttributes;if((M.position!==void 0||M.normal!==void 0||M.color!==void 0)&&Ne.update(i,n,S),(T||v.receiveShadow!==i.receiveShadow)&&(v.receiveShadow=i.receiveShadow,D.setValue(I,`receiveShadow`,i.receiveShadow)),(r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial)&&r.envMap===null&&t.environment!==null&&(j.envMapIntensity.value=t.environmentIntensity),j.dfgLUT!==void 0&&(j.dfgLUT.value=Wd()),T&&(D.setValue(I,`toneMappingExposure`,w.toneMappingExposure),v.needsLights&&yt(j,E),a&&r.fog===!0&&De.refreshFogUniforms(j,a),De.refreshMaterialUniforms(j,r,re,ne,b.state.transmissionRenderTarget[e.id]),wu.upload(I,gt(v),j,xe)),r.isShaderMaterial&&r.uniformsNeedUpdate===!0&&(wu.upload(I,gt(v),j,xe),r.uniformsNeedUpdate=!1),r.isSpriteMaterial&&D.setValue(I,`center`,i.center),D.setValue(I,`modelViewMatrix`,i.modelViewMatrix),D.setValue(I,`normalMatrix`,i.normalMatrix),D.setValue(I,`modelMatrix`,i.matrixWorld),r.isShaderMaterial||r.isRawShaderMaterial){let e=r.uniformsGroups;for(let t=0,n=e.length;t<n;t++){let n=e[t];Ke.update(n,S),Ke.bind(n,S)}}return S}function yt(e,t){e.ambientLightColor.needsUpdate=t,e.lightProbe.needsUpdate=t,e.directionalLights.needsUpdate=t,e.directionalLightShadows.needsUpdate=t,e.pointLights.needsUpdate=t,e.pointLightShadows.needsUpdate=t,e.spotLights.needsUpdate=t,e.spotLightShadows.needsUpdate=t,e.rectAreaLights.needsUpdate=t,e.hemisphereLights.needsUpdate=t}function bt(e){return e.isMeshLambertMaterial||e.isMeshToonMaterial||e.isMeshPhongMaterial||e.isMeshStandardMaterial||e.isShadowMaterial||e.isShaderMaterial&&e.lights===!0}this.getActiveCubeFace=function(){return E},this.getActiveMipmapLevel=function(){return D},this.getRenderTarget=function(){return O},this.setRenderTargetTextures=function(e,t,n){let r=R.get(e);r.__autoAllocateDepthBuffer=e.resolveDepthBuffer===!1,r.__autoAllocateDepthBuffer===!1&&(r.__useRenderToTexture=!1),R.get(e.texture).__webglTexture=t,R.get(e.depthTexture).__webglTexture=r.__autoAllocateDepthBuffer?void 0:n,r.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(e,t){let n=R.get(e);n.__webglFramebuffer=t,n.__useDefaultFramebuffer=t===void 0};let xt=I.createFramebuffer();this.setRenderTarget=function(e,t=0,n=0){O=e,E=t,D=n;let r=null,i=!1,a=!1;if(e){let o=R.get(e);if(o.__useDefaultFramebuffer!==void 0){L.bindFramebuffer(I.FRAMEBUFFER,o.__webglFramebuffer),j.copy(e.viewport),M.copy(e.scissor),N=e.scissorTest,L.viewport(j),L.scissor(M),L.setScissorTest(N),k=-1;return}if(o.__webglFramebuffer===void 0)xe.setupRenderTarget(e);else if(o.__hasExternalTextures)xe.rebindTextures(e,R.get(e.texture).__webglTexture,R.get(e.depthTexture).__webglTexture);else if(e.depthBuffer){let t=e.depthTexture;if(o.__boundDepthTexture!==t){if(t!==null&&R.has(t)&&(e.width!==t.image.width||e.height!==t.image.height))throw Error(`WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.`);xe.setupDepthRenderbuffer(e)}}let s=e.texture;(s.isData3DTexture||s.isDataArrayTexture||s.isCompressedArrayTexture)&&(a=!0);let c=R.get(e).__webglFramebuffer;e.isWebGLCubeRenderTarget?(r=Array.isArray(c[t])?c[t][n]:c[t],i=!0):r=e.samples>0&&xe.useMultisampledRTT(e)===!1?R.get(e).__webglMultisampledFramebuffer:Array.isArray(c)?c[n]:c,j.copy(e.viewport),M.copy(e.scissor),N=e.scissorTest}else j.copy(oe).multiplyScalar(re).floor(),M.copy(F).multiplyScalar(re).floor(),N=se;if(n!==0&&(r=xt),L.bindFramebuffer(I.FRAMEBUFFER,r)&&L.drawBuffers(e,r),L.viewport(j),L.scissor(M),L.setScissorTest(N),i){let r=R.get(e.texture);I.framebufferTexture2D(I.FRAMEBUFFER,I.COLOR_ATTACHMENT0,I.TEXTURE_CUBE_MAP_POSITIVE_X+t,r.__webglTexture,n)}else if(a){let r=t;for(let t=0;t<e.textures.length;t++){let i=R.get(e.textures[t]);I.framebufferTextureLayer(I.FRAMEBUFFER,I.COLOR_ATTACHMENT0+t,i.__webglTexture,n,r)}}else if(e!==null&&n!==0){let t=R.get(e.texture);I.framebufferTexture2D(I.FRAMEBUFFER,I.COLOR_ATTACHMENT0,I.TEXTURE_2D,t.__webglTexture,n)}k=-1},this.readRenderTargetPixels=function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget)){B(`WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);return}let c=R.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){L.bindFramebuffer(I.FRAMEBUFFER,c);try{let o=e.textures[s],c=o.format,l=o.type;if(e.textures.length>1&&I.readBuffer(I.COLOR_ATTACHMENT0+s),!ye.textureFormatReadable(c)){B(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.`);return}if(!ye.textureTypeReadable(l)){B(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.`);return}t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i&&I.readPixels(t,n,r,i,ze.convert(c),ze.convert(l),a)}finally{let e=O===null?null:R.get(O).__webglFramebuffer;L.bindFramebuffer(I.FRAMEBUFFER,e)}}},this.readRenderTargetPixelsAsync=async function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget))throw Error(`THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);let c=R.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){if(t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i){L.bindFramebuffer(I.FRAMEBUFFER,c);let o=e.textures[s],l=o.format,u=o.type;if(e.textures.length>1&&I.readBuffer(I.COLOR_ATTACHMENT0+s),!ye.textureFormatReadable(l))throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.`);if(!ye.textureTypeReadable(u))throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.`);let d=I.createBuffer();I.bindBuffer(I.PIXEL_PACK_BUFFER,d),I.bufferData(I.PIXEL_PACK_BUFFER,a.byteLength,I.STREAM_READ),I.readPixels(t,n,r,i,ze.convert(l),ze.convert(u),0);let f=O===null?null:R.get(O).__webglFramebuffer;L.bindFramebuffer(I.FRAMEBUFFER,f);let p=I.fenceSync(I.SYNC_GPU_COMMANDS_COMPLETE,0);return I.flush(),await dn(I,p,4),I.bindBuffer(I.PIXEL_PACK_BUFFER,d),I.getBufferSubData(I.PIXEL_PACK_BUFFER,0,a),I.deleteBuffer(d),I.deleteSync(p),a}throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.`)}},this.copyFramebufferToTexture=function(e,t=null,n=0){let r=2**-n,i=Math.floor(e.image.width*r),a=Math.floor(e.image.height*r),o=t===null?0:t.x,s=t===null?0:t.y;xe.setTexture2D(e,0),I.copyTexSubImage2D(I.TEXTURE_2D,n,0,0,o,s,i,a),L.unbindTexture()};let St=I.createFramebuffer(),Ct=I.createFramebuffer();this.copyTextureToTexture=function(e,t,n=null,r=null,i=0,a=0){let o,s,c,l,u,d,f,p,m,h=e.isCompressedTexture?e.mipmaps[a]:e.image;if(n!==null)o=n.max.x-n.min.x,s=n.max.y-n.min.y,c=n.isBox3?n.max.z-n.min.z:1,l=n.min.x,u=n.min.y,d=n.isBox3?n.min.z:0;else{let t=2**-i;o=Math.floor(h.width*t),s=Math.floor(h.height*t),c=e.isDataArrayTexture?h.depth:e.isData3DTexture?Math.floor(h.depth*t):1,l=0,u=0,d=0}r===null?(f=0,p=0,m=0):(f=r.x,p=r.y,m=r.z);let g=ze.convert(t.format),_=ze.convert(t.type),v;t.isData3DTexture?(xe.setTexture3D(t,0),v=I.TEXTURE_3D):t.isDataArrayTexture||t.isCompressedArrayTexture?(xe.setTexture2DArray(t,0),v=I.TEXTURE_2D_ARRAY):(xe.setTexture2D(t,0),v=I.TEXTURE_2D),I.pixelStorei(I.UNPACK_FLIP_Y_WEBGL,t.flipY),I.pixelStorei(I.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.premultiplyAlpha),I.pixelStorei(I.UNPACK_ALIGNMENT,t.unpackAlignment);let y=I.getParameter(I.UNPACK_ROW_LENGTH),b=I.getParameter(I.UNPACK_IMAGE_HEIGHT),x=I.getParameter(I.UNPACK_SKIP_PIXELS),S=I.getParameter(I.UNPACK_SKIP_ROWS),C=I.getParameter(I.UNPACK_SKIP_IMAGES);I.pixelStorei(I.UNPACK_ROW_LENGTH,h.width),I.pixelStorei(I.UNPACK_IMAGE_HEIGHT,h.height),I.pixelStorei(I.UNPACK_SKIP_PIXELS,l),I.pixelStorei(I.UNPACK_SKIP_ROWS,u),I.pixelStorei(I.UNPACK_SKIP_IMAGES,d);let w=e.isDataArrayTexture||e.isData3DTexture,T=t.isDataArrayTexture||t.isData3DTexture;if(e.isDepthTexture){let n=R.get(e),r=R.get(t),h=R.get(n.__renderTarget),g=R.get(r.__renderTarget);L.bindFramebuffer(I.READ_FRAMEBUFFER,h.__webglFramebuffer),L.bindFramebuffer(I.DRAW_FRAMEBUFFER,g.__webglFramebuffer);for(let n=0;n<c;n++)w&&(I.framebufferTextureLayer(I.READ_FRAMEBUFFER,I.COLOR_ATTACHMENT0,R.get(e).__webglTexture,i,d+n),I.framebufferTextureLayer(I.DRAW_FRAMEBUFFER,I.COLOR_ATTACHMENT0,R.get(t).__webglTexture,a,m+n)),I.blitFramebuffer(l,u,o,s,f,p,o,s,I.DEPTH_BUFFER_BIT,I.NEAREST);L.bindFramebuffer(I.READ_FRAMEBUFFER,null),L.bindFramebuffer(I.DRAW_FRAMEBUFFER,null)}else if(i!==0||e.isRenderTargetTexture||R.has(e)){let n=R.get(e),r=R.get(t);L.bindFramebuffer(I.READ_FRAMEBUFFER,St),L.bindFramebuffer(I.DRAW_FRAMEBUFFER,Ct);for(let e=0;e<c;e++)w?I.framebufferTextureLayer(I.READ_FRAMEBUFFER,I.COLOR_ATTACHMENT0,n.__webglTexture,i,d+e):I.framebufferTexture2D(I.READ_FRAMEBUFFER,I.COLOR_ATTACHMENT0,I.TEXTURE_2D,n.__webglTexture,i),T?I.framebufferTextureLayer(I.DRAW_FRAMEBUFFER,I.COLOR_ATTACHMENT0,r.__webglTexture,a,m+e):I.framebufferTexture2D(I.DRAW_FRAMEBUFFER,I.COLOR_ATTACHMENT0,I.TEXTURE_2D,r.__webglTexture,a),i===0?T?I.copyTexSubImage3D(v,a,f,p,m+e,l,u,o,s):I.copyTexSubImage2D(v,a,f,p,l,u,o,s):I.blitFramebuffer(l,u,o,s,f,p,o,s,I.COLOR_BUFFER_BIT,I.NEAREST);L.bindFramebuffer(I.READ_FRAMEBUFFER,null),L.bindFramebuffer(I.DRAW_FRAMEBUFFER,null)}else T?e.isDataTexture||e.isData3DTexture?I.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h.data):t.isCompressedArrayTexture?I.compressedTexSubImage3D(v,a,f,p,m,o,s,c,g,h.data):I.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h):e.isDataTexture?I.texSubImage2D(I.TEXTURE_2D,a,f,p,o,s,g,_,h.data):e.isCompressedTexture?I.compressedTexSubImage2D(I.TEXTURE_2D,a,f,p,h.width,h.height,g,h.data):I.texSubImage2D(I.TEXTURE_2D,a,f,p,o,s,g,_,h);I.pixelStorei(I.UNPACK_ROW_LENGTH,y),I.pixelStorei(I.UNPACK_IMAGE_HEIGHT,b),I.pixelStorei(I.UNPACK_SKIP_PIXELS,x),I.pixelStorei(I.UNPACK_SKIP_ROWS,S),I.pixelStorei(I.UNPACK_SKIP_IMAGES,C),a===0&&t.generateMipmaps&&I.generateMipmap(v),L.unbindTexture()},this.initRenderTarget=function(e){R.get(e).__webglFramebuffer===void 0&&xe.setupRenderTarget(e)},this.initTexture=function(e){e.isCubeTexture?xe.setTextureCube(e,0):e.isData3DTexture?xe.setTexture3D(e,0):e.isDataArrayTexture||e.isCompressedArrayTexture?xe.setTexture2DArray(e,0):xe.setTexture2D(e,0),L.unbindTexture()},this.resetState=function(){E=0,D=0,O=null,L.reset(),Ve.reset()},typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}get coordinateSystem(){return tn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=jn._getDrawingBufferColorSpace(e),t.unpackColorSpace=jn._getUnpackColorSpace()}},Kd=typeof matchMedia==`function`&&matchMedia(`(pointer: coarse)`).matches,qd=new Gd({antialias:!Kd,powerPreference:`high-performance`});qd.setSize(innerWidth,innerHeight),qd.shadowMap.type=1,qd.toneMapping=4,qd.toneMappingExposure=1,qd.outputColorSpace=Jt,document.body.prepend(qd.domElement);var Jd=new kr;Jd.background=new W(9425919),Jd.fog=new Or(12576511,120,480);var Yd=new oc(62,innerWidth/innerHeight,.3,1500),Xd=new Js(14676735,6982218,1.3);Jd.add(Xd);var Zd=new dc(16773336,2.4),Qd=new H(.45,.8,-.35);Zd.shadow.mapSize.setScalar(2048),Object.assign(Zd.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:220}),Zd.shadow.bias=-6e-4,Zd.shadow.normalBias=.03,Jd.add(Zd,Zd.target),addEventListener(`resize`,()=>{qd.setSize(innerWidth,innerHeight),Yd.aspect=innerWidth/innerHeight,Yd.updateProjectionMatrix()});var $d=`auto`,ef=Kd?`low`:`high`;function tf(){let e=ef===`high`;qd.setPixelRatio(e?Math.min(devicePixelRatio,2):Math.min(devicePixelRatio,1)),qd.setSize(innerWidth,innerHeight),qd.shadowMap.enabled=e,Zd.castShadow=e,Jd.traverse(e=>{let t=e.material;if(t)for(let e of Array.isArray(t)?t:[t])e.needsUpdate=!0})}tf();function nf(e){$d=e,of(e===`auto`?Kd?`low`:`high`:e)}var rf=()=>$d,af=()=>ef;function of(e){e!==ef&&(ef=e,tf(),n.emit(`qualityChange`,{quality:e}))}var sf=0,cf=0,lf=0;function uf(e){if($d!==`auto`||ef===`low`||(sf+=e,cf++,sf<2))return;let t=cf/sf;sf=0,cf=0,lf=t<45?lf+1:0,lf>=2&&(lf=0,of(`low`))}function df(){sf=0,cf=0,lf=0}var ff={prompt:null,meterLabel:`PUFF`,ticks:[],now:0};function pf(e,t,n=1.5){ff.prompt={action:e,text:t,until:ff.now+n}}function mf(){ff.prompt=null}function hf(e,t=`good`){n.emit(`callout`,{text:e,tone:t})}function gf(e){n.emit(`react`,{mood:e})}function _f(e){ff.now+=e,ff.prompt&&ff.now>ff.prompt.until&&(ff.prompt=null)}var vf=class{kind;map=new Map;constructor(e){this.kind=e}add(e){return this.map.set(e.id,e),e}get(e){let t=this.map.get(e);if(!t)throw Error(`${this.kind} not registered: ${e}`);return t}has(e){return this.map.has(e)}all(){return[...this.map.values()]}},yf=new vf(`stage`),bf=new vf(`theme`),xf=new vf(`set piece`),Sf=new vf(`actor`);function Cf(){return yf.all().sort((e,t)=>e.index-t.index)}var wf=null;function Tf(e){wf=e}var Ef=()=>wf,Df=2e3,Of=.1,kf=(e,t)=>Math.round(e*Math.max(1,Math.min(99,t))),Af=e=>Math.min(99,Math.max(1,e)+1),jf=e=>Math.max(1,Math.floor(e/2)),Mf=e=>Math.max(0,Math.round(e*Of)),Nf=e=>Df+Math.max(0,e)*500;function Pf(e,t){return e.bellsTotal<=0?[!1,!1,!1]:[e.finished,e.finished&&e.bellCount>=e.bellsTotal,e.finished&&e.score>=t]}function Ff(e,t){let n=e.rampDist>0?Math.max(0,Math.min(1,t/e.rampDist)):1;return e.start+(e.max-e.start)*n}var If=new H(0,1,0),Lf=new H,Rf=new H,zf=new H,Bf=new H,Vf=0,Hf=0;function Uf(e,t,n,r,i){return i.set(e[t*3]+(e[n*3]-e[t*3])*r,e[t*3+1]+(e[n*3+1]-e[t*3+1])*r,e[t*3+2]+(e[n*3+2]-e[t*3+2])*r)}function Wf(){return{s:0,pos:new H,fwd:new H(0,0,1),right:new H(-1,0,0),up:new H(0,1,0),width:10,bank:0,kind:`ground`}}var Gf=class e{p=[];f=[];r=[];u=[];w=[];bk=[];k=[];base=0;segments=[];get samples(){return this.w.length}get length(){return Math.max(0,this.base+this.w.length-1)*1}get start(){return this.base*1}trimBefore(e){let t=Math.min(this.w.length-2,Math.floor(e/1)-this.base);if(t<=0)return;this.p.splice(0,t*3),this.f.splice(0,t*3),this.r.splice(0,t*3),this.u.splice(0,t*3),this.w.splice(0,t),this.bk.splice(0,t),this.k.splice(0,t),this.base+=t;let n=this.base*1,r=0;for(;r<this.segments.length-1&&this.segments[r].s1<=n;)r++;r>0&&this.segments.splice(0,r)}push(e,t,n,r,i,a){this.p.push(e,t,n),this.f.push(0,0,1),this.r.push(-1,0,0),this.u.push(0,1,0),this.w.push(r),this.bk.push(i);let s=Math.max(0,o.indexOf(a));this.k.push(s);let c=this.w.length;if(c<2)return;this.k[c-2]=s,c>=3?this.frameAt(c-2,c-3,c-1):this.frameAt(0,0,1),this.frameAt(c-1,c-2,c-1);let l=(this.base+c-2)*1,u=(this.base+c-1)*1,d=this.segments[this.segments.length-1];d&&d.kind===a?d.s1=u:this.segments.push({kind:a,s0:l,s1:u})}frameAt(e,t,n){Lf.set(this.p[n*3]-this.p[t*3],this.p[n*3+1]-this.p[t*3+1],this.p[n*3+2]-this.p[t*3+2]),Lf.lengthSq()<1e-9&&Lf.set(0,0,1),Lf.normalize(),zf.crossVectors(Lf,If),zf.lengthSq()<1e-6&&zf.set(this.r[e*3],0,this.r[e*3+2]),zf.normalize(),Bf.crossVectors(zf,Lf).normalize();let r=this.bk[e];if(r!==0){let e=Math.cos(r),t=Math.sin(r);Rf.copy(Bf).multiplyScalar(e).addScaledVector(zf,t),zf.multiplyScalar(e).addScaledVector(Bf,-t),Bf.copy(Rf)}this.f[e*3]=Lf.x,this.f[e*3+1]=Lf.y,this.f[e*3+2]=Lf.z,this.r[e*3]=zf.x,this.r[e*3+1]=zf.y,this.r[e*3+2]=zf.z,this.u[e*3]=Bf.x,this.u[e*3+1]=Bf.y,this.u[e*3+2]=Bf.z}idx(e){let t=this.w.length;if(t<2){Vf=0,Hf=0;return}let n=Math.max(0,Math.min(this.length,e)/1-this.base);Vf=Math.min(t-2,Math.floor(n)),Hf=n-Vf}sample(e,t){let n=this.w.length;if(t.s=e,n===0)return t;if(n===1)return t.pos.set(this.p[0],this.p[1],this.p[2]),t.width=this.w[0],t;this.idx(e);let r=Vf,i=Hf,a=r+1;return Uf(this.p,r,a,i,t.pos),Uf(this.f,r,a,i,t.fwd).normalize(),Uf(this.r,r,a,i,t.right).normalize(),Uf(this.u,r,a,i,t.up).normalize(),t.width=this.w[r]+(this.w[a]-this.w[r])*i,t.bank=this.bk[r]+(this.bk[a]-this.bk[r])*i,t.kind=o[this.k[r]],e>this.length?t.pos.addScaledVector(t.fwd,e-this.length):e<this.start&&t.pos.addScaledVector(t.fwd,e-this.start),t}toWorld(e,t,n,r){return this.sample(e,Kf),r.copy(Kf.pos).addScaledVector(Kf.right,t).addScaledVector(Kf.up,n)}kindAt(e){let t=this.w.length;if(t===0)return`ground`;let n=Math.max(0,Math.min(t-1,Math.floor(e/1)-this.base));return o[this.k[n]]}widthAt(e){let t=this.w.length;return t===0?10:t===1?this.w[0]:(this.idx(e),this.w[Vf]+(this.w[Vf+1]-this.w[Vf])*Hf)}segmentAt(e){let t=this.segments;if(t.length===0)return{kind:`ground`,s0:0,s1:0};let n=0,r=t.length-1;for(;n<r;){let i=n+r+1>>1;t[i].s0<=e?n=i:r=i-1}return t[n]}nextSegment(e,t){for(let n of this.segments)if(n.kind===t&&n.s0>=e)return n;return null}static fromPoints(t){let n=new e;if(t.length<2)throw Error(`Track.fromPoints needs 2+ points`);let r=new ro(t.map(e=>new H(e.x,e.y,e.z)),!1,`centripetal`),i=r.getLength(),a=Math.max(2,Math.round(i/1)+1),o=r.getLengths(t.length*50),s=new H;for(let e=0;e<a;e++){let a=Math.min(1,e*1/i);r.getPointAt(a,s);let c=a*i,l=0,u=o.length-1;for(let e=0;e<u;e++)o[e]<=c&&(l=Math.floor(e/u*(t.length-1)));let d=t[l],f=t[Math.min(t.length-1,l+1)];n.push(s.x,s.y,s.z,d.width??f.width??10,(d.bank??0)*Math.PI/180,d.kind??`ground`)}return n}},Kf=Wf(),qf=new Set,Jf={touchSteer:0,dodgeT:0,dodgeDir:0,botSteer:null,lastGesture:``},Yf=()=>{};function Xf(e){Yf(e)}function Zf(){if(Jf.botSteer!==null)return Math.max(-1,Math.min(1,Jf.botSteer));let e=0;return(qf.has(`KeyA`)||qf.has(`ArrowLeft`))&&--e,(qf.has(`KeyD`)||qf.has(`ArrowRight`))&&(e+=1),e+=Jf.touchSteer,Jf.dodgeT>0&&(e+=Jf.dodgeDir),Math.max(-1,Math.min(1,e))}function Qf(e){Jf.dodgeT>0&&(Jf.dodgeT=Math.max(0,Jf.dodgeT-e))}function $f(){qf.clear(),Jf.touchSteer=0,Jf.dodgeT=0,tp.clear()}var ep={Space:`jump`,KeyW:`jump`,ArrowUp:`jump`,KeyS:`slide`,ArrowDown:`slide`,KeyE:`ability`,ShiftLeft:`ability`,ShiftRight:`ability`,Escape:`pause`,KeyP:`pause`},tp=new Map,np=38,rp=320,ip=60,ap=14,op=260,sp=e=>e instanceof Element&&!!e.closest(`button, a, input, select, label, .ui`);function cp(e){Yf=e,addEventListener(`keydown`,t=>{h();let n=ep[t.code];n&&!(t.target instanceof HTMLInputElement)?((t.code===`Space`||t.code.startsWith(`Arrow`))&&t.preventDefault(),t.repeat||qf.add(t.code),t.repeat||e(n)):t.repeat||qf.add(t.code)}),addEventListener(`keyup`,e=>qf.delete(e.code)),addEventListener(`blur`,$f),document.addEventListener(`visibilitychange`,()=>document.hidden&&$f()),Kd&&document.body.classList.add(`touch`),addEventListener(`pointerdown`,e=>{h(),!(e.pointerType===`mouse`||sp(e.target))&&tp.set(e.pointerId,{x0:e.clientX,y0:e.clientY,t0:performance.now(),steering:!1,fired:!1})}),addEventListener(`pointermove`,t=>{let n=tp.get(t.pointerId);if(!n)return;let r=t.clientX-n.x0,i=t.clientY-n.y0,a=performance.now()-n.t0;!n.fired&&!n.steering&&a<rp&&Math.abs(i)>np&&Math.abs(i)>Math.abs(r)*1.2?(n.fired=!0,Jf.lastGesture=i<0?`swipe-up`:`swipe-down`,e(i<0?`jump`:`slide`)):(!n.fired&&Math.abs(r)>ap&&Math.abs(r)>=Math.abs(i)&&(n.steering=!0),n.steering&&(Jf.touchSteer=Math.max(-1,Math.min(1,r/ip))))});let t=t=>{let n=tp.get(t.pointerId);if(!n)return;tp.delete(t.pointerId);let r=t.clientX-n.x0,i=t.clientY-n.y0,a=performance.now()-n.t0;n.steering?(Jf.touchSteer=0,a<rp&&Math.abs(r)>np&&(Jf.dodgeDir=Math.sign(r),Jf.dodgeT=.16,Jf.lastGesture=r<0?`flick-left`:`flick-right`)):!n.fired&&t.type===`pointerup`&&a<op&&Math.hypot(r,i)<ap&&(Jf.lastGesture=`tap`,e(`ability`))};addEventListener(`pointerup`,t),addEventListener(`pointercancel`,t)}var lp={gravity:52,jumpV:16.5,pounceV:10,pounceBoost:1.45,pounceTime:.35,pounceGravity:.45,coyote:.11,buffer:.13,slideTime:.75,fastFallV:-30,latSpeed:11,latAccel:75,radius:.4,bodyH:1.1,slideH:.5,fallLimit:-7,invuln:1.4,respawnInvuln:2,hitSlow:.55,hitRecover:.9,speedFollow:6},J={s:0,x:0,y:0,vy:0,speed:0,mode:`run`,surface:`ground`,grounded:!0,sliding:!1,slideT:0,sinceLand:99,sinceJump:99,sincePounce:99,sinceHit:99,landImpact:0,airTime:0,lean:0,latVel:0,invuln:0,wet:0,ability:null,abilityT:0,coyote:0,jumpBuf:0,slideBuf:!1,pounceUsed:!1,pounceT:0,boostMul:1,boostT:0,slowMul:1,base:0,arc:{s0:0,len:1,h:0},ride:{s0:0,until:0,h:0},world:{pos:new H,fwd:new H(0,0,1),up:new H(0,1,0),right:new H(-1,0,0)}},up=()=>J.sliding?lp.slideH:lp.bodyH,dp=0;function fp(e){dp=e}var pp=()=>{};function mp(e){pp=e}var hp=[];function gp(e){return hp.push(e),()=>{let t=hp.indexOf(e);t>=0&&hp.splice(t,1)}}function _p(e=0,t=0){Object.assign(J,{s:e,x:t,y:0,vy:0,mode:`run`,grounded:!0,sliding:!1,slideT:0,sinceLand:99,sinceJump:99,sincePounce:99,sinceHit:99,landImpact:0,airTime:0,lean:0,latVel:0,invuln:0,wet:0,ability:null,abilityT:0,coyote:0,jumpBuf:0,slideBuf:!1,pounceUsed:!1,pounceT:0,boostMul:1,boostT:0,slowMul:1,base:0}),J.speed=c.stage?Ff(c.stage.speed,e):18,J.surface=c.track?c.track.kindAt(e):`ground`}function vp(e,t=0){J.ability&&n.emit(`abilityEnd`,{id:J.ability}),J.s=e,J.x=t,J.y=0,J.vy=0,J.base=0,J.mode=`run`,J.ability=null,J.abilityT=0,J.grounded=!0,J.sliding=!1,J.pounceUsed=!1}function yp(){J.mode===`finish`||J.mode===`arc`?J.jumpBuf=lp.buffer:J.grounded||J.coyote>0?bp(!J.grounded):J.pounceUsed?J.jumpBuf=lp.buffer:xp()}function bp(e){J.vy=lp.jumpV,J.grounded=!1,J.coyote=0,J.jumpBuf=0,J.sinceJump=0,J.sliding&&(J.sliding=!1,n.emit(`slide`,{on:!1})),n.emit(`jump`,{air:e})}function xp(){J.pounceUsed=!0,J.vy=Math.max(J.vy,lp.pounceV),J.pounceT=lp.pounceTime,J.sincePounce=0,n.emit(`pounce`,r)}function Sp(){J.mode!==`finish`&&(J.grounded?Cp():(J.slideBuf=!0,J.mode===`run`&&J.vy>lp.fastFallV&&(J.vy=lp.fastFallV,n.emit(`fastFall`,r))))}function Cp(){J.slideBuf=!1,J.slideT=lp.slideTime,J.sliding||(J.sliding=!0,n.emit(`slide`,{on:!0}))}function wp(){if(J.mode!==`finish`){for(let e=hp.length-1;e>=0;e--)if(hp[e]()){n.emit(`abilityPress`,{consumed:!0});return}n.emit(`abilityPress`,{consumed:!1})}}function Tp(e,t,r=`vault`){J.mode=`arc`,J.arc.s0=J.s,J.arc.len=Math.max(1,e),J.arc.h=t,J.ability=r,J.abilityT=0,J.vy=0,J.grounded=!1,J.sliding=!1,n.emit(`abilityStart`,{id:r})}function Ep(e,t,r){J.mode=`ride`,J.ride.s0=J.s,J.ride.until=t,J.ride.h=r,J.ability=e,J.abilityT=0,J.pounceUsed=!1,n.emit(`abilityStart`,{id:e})}function Dp(){if(!J.ability)return;let e=J.ability;J.y=J.base+Math.max(0,J.y-J.base),J.base=0,J.mode=`run`,J.ability=null,J.abilityT=0,J.grounded=!1,n.emit(`abilityEnd`,{id:e})}function Op(e,t){J.boostMul=e,J.boostT=t,n.emit(`boost`,{mul:e,seconds:t})}function kp(e,t=.75){J.wet=Math.max(J.wet,e),J.slowMul=t,n.emit(`wet`,{seconds:e}),gf(`scared`)}function Ap(e){return J.invuln>0||dp>0||l.invincible||J.mode===`finish`||c.mode!==`play`?!1:(l.hearts=Math.max(0,l.hearts-1),l.hits++,l.mult=jf(l.mult),n.emit(`mult`,{value:l.mult}),J.invuln=lp.invuln,J.sinceHit=0,J.grounded&&J.mode===`run`&&(J.vy=6,J.grounded=!1),n.emit(`hit`,{label:e,hearts:l.hearts}),n.emit(`bigHit`,{strength:.6}),gf(`ouch`),hf(l.hearts===1?`LAST LIFE!`:`OUCH!`,`bad`),l.hearts<=0&&pp(),!0)}function jp(e){let t=c.track,r=c.stage;if(!t||!r)return;let i=lp;J.sinceLand+=e,J.sinceJump+=e,J.sincePounce+=e,J.sinceHit+=e,J.invuln>0&&(J.invuln=Math.max(0,J.invuln-e)),dp>0&&(dp=Math.max(0,dp-e)),J.boostT>0&&(J.boostT-=e)<=0&&(J.boostMul=1),J.wet>0&&(J.wet-=e)<=0&&(J.wet=0,J.slowMul=1),J.pounceT>0&&(J.pounceT=Math.max(0,J.pounceT-e)),J.jumpBuf>0&&(J.jumpBuf=Math.max(0,J.jumpBuf-e));let a;if(J.mode===`finish`)a=0;else{let e=J.sinceHit<i.hitRecover?i.hitSlow+(1-i.hitSlow)*(J.sinceHit/i.hitRecover):1;a=Ff(r.speed,J.s)*J.boostMul*J.slowMul*e*(J.pounceT>0?i.pounceBoost:1)}let o=J.mode===`finish`?1.6:J.pounceT>0?14:i.speedFollow;J.speed+=(a-J.speed)*Math.min(1,o*e),J.s+=J.speed*e;let u=Math.max(.5,t.widthAt(J.s)/2-i.radius),d=(J.mode===`finish`?Math.max(-1,Math.min(1,-J.x)):Zf())*i.latSpeed-J.latVel,f=i.latAccel*e;J.latVel+=Math.max(-f,Math.min(f,d)),J.x+=J.latVel*e,J.x>u?(J.x=u,J.latVel=Math.min(0,J.latVel)):J.x<-u&&(J.x=-u,J.latVel=Math.max(0,J.latVel)),J.lean=J.latVel/i.latSpeed;let p=t.kindAt(J.s);if(p!==J.surface){let e=J.surface;J.surface=p,n.emit(`surface`,{kind:p,prev:e})}let m=!s.has(p);if(J.mode===`arc`){let e=(J.s-J.arc.s0)/J.arc.len;if(J.abilityT=Math.min(1,e),J.y=4*J.arc.h*e*(1-e),e>=1){let e=J.ability??`vault`;J.mode=`run`,J.ability=null,J.y=Math.max(0,J.y),J.vy=-4,J.grounded=!1,n.emit(`abilityEnd`,{id:e})}}else{if(J.mode===`ride`){J.base+=(J.ride.h-J.base)*Math.min(1,4*e);let t=Math.max(1,J.ride.until-J.ride.s0);J.abilityT=Math.min(1,Math.max(0,1-(J.ride.until-J.s)/t)),J.s>=J.ride.until&&Dp()}let r=J.mode===`ride`,a=i.gravity*(J.pounceT>0?i.pounceGravity:1);J.vy-=a*e,J.y+=J.vy*e;let o=r?J.base:m?0:-1/0;if(J.y<=o&&J.vy<=0?(J.grounded||(J.landImpact=-J.vy,J.sinceLand=0,n.emit(`land`,{impact:J.landImpact})),J.y=o,J.vy=0,J.grounded=!0,J.pounceUsed=!1,J.pounceT=0,J.slideBuf&&Cp()):J.y>o+.02&&(J.grounded=!1),J.grounded?(J.coyote=i.coyote,J.airTime=0,J.jumpBuf>0&&bp(!1)):(J.coyote=Math.max(0,J.coyote-e),J.airTime+=e),!r&&!m&&J.y<i.fallLimit){let e=t.segmentAt(J.s);n.emit(`fall`,{s:J.s});let r=e.s1,i=l.respawns;Ap(`fall`),c.mode===`play`&&l.respawns===i&&(vp(r+1.5,0),J.invuln=Math.max(J.invuln,1))}}J.sliding&&(J.slideT-=e)<=0&&(J.sliding=!1,n.emit(`slide`,{on:!1}))}var Mp=null,Np=null,Pp=Wf(),Fp=new qn,Ip=new H;function Lp(){Rp();let e=Ef();if(e)Mp=e(),Jd.add(Mp.root);else{Np=new K(new Ua(.4,.5,4,8),new Os({color:16751164})),Np.position.y=.65;let e=new U;e.add(Np),Jd.add(e)}}function Rp(){Mp&&=(Jd.remove(Mp.root),Mp.dispose?.(),null),Np&&=(Jd.remove(Np.parent),Np.geometry.dispose(),Np.material.dispose(),null)}var zp=()=>Mp;function Bp(e,t){let n=c.track;if(!n)return;n.sample(J.s,Pp),J.world.fwd.copy(Pp.fwd),J.world.up.copy(Pp.up),J.world.right.copy(Pp.right),J.world.pos.copy(Pp.pos).addScaledVector(Pp.right,J.x).addScaledVector(Pp.up,J.y);let r=Mp?Mp.root:Np?.parent;r&&(Ip.copy(Pp.right).negate(),Fp.makeBasis(Ip,Pp.up,Pp.fwd),r.quaternion.setFromRotationMatrix(Fp),r.position.copy(J.world.pos),r.visible=!(J.invuln>0&&c.mode===`play`&&Math.floor(t*12)%2==0),Mp?Mp.animate(e,t,J):Np&&(Np.scale.y=J.sliding?.5:1))}var Vp={back:7.2,height:3.1,lookAhead:13,lookHeight:1.1,baseFov:60,fovPerSpeed:.45,lagPos:7,lagLook:10},Hp=null;function Up(e){Hp=e,$p=!0}var Wp=0,Gp=0;function Kp(e){u.reducedMotion||(Wp=Math.max(Wp,e))}function qp(e){u.reducedMotion||(Gp=Math.max(Gp,e*u.shake))}n.on(`boost`,e=>Kp(6+(e.mul-1)*12)),n.on(`pounce`,()=>Kp(4)),n.on(`bigHit`,e=>qp(e.strength));var Jp=0,Yp=0,Xp=0,Zp=0;function Qp(e,t,n){Jp=e,Yp=t,Xp=n}n.on(`stageStart`,()=>Xp=Zp=0),n.on(`respawn`,()=>Xp=Zp=0);var $p=!0;function em(){$p=!0}n.on(`stageStart`,em),n.on(`respawn`,em);var tm=Wf(),nm=Wf(),rm=new H,im=new H,am=new H,om=new H,sm=new H(0,1,0),cm=0,lm=()=>cm+12,um=0,dm=0,fm=new Cn,pm=new H;function mm(e,t){let n=c.track;if(Hp){Hp(Yd,e,t);return}if(!n||n.length<2)return;let r,i=0,a=0;c.mode===`title`?(cm=(cm+e*9)%Math.max(20,Math.min(n.length-30,420)),r=cm+12):(r=J.s,i=J.x,a=J.y);let o=Yd.aspect<1,s=c.mode!==`title`&&n.kindAt(r+4)===`wall`;s&&n.sample(r+6,nm);let l=s&&Math.abs(nm.bank)>.3?1:0;l&&(dm=nm.bank),um+=(l-um)*Math.min(1,e*($p?60:2.6));let d=c.mode===`title`?0:.5*Math.max(0,J.speed)/Vp.lagPos;Xp>0&&(Xp=Math.max(0,Xp-e)),Zp+=(+(Xp>0&&c.mode===`play`)-Zp)*Math.min(1,e*(Xp>0?3.2:1.8));let f=Vp.back*(1-.3*um)-d+Jp*Zp,p=(Vp.height+(o?1.7:0))*(1-.2*um)+Yp*Zp,m=Vp.lookHeight+(o?3.4:0);n.sample(r-f,tm),n.sample(r+Vp.lookAhead,nm);let h=-Math.sign(dm)*1.6*um,g=i*.55+h;if(rm.copy(tm.pos).addScaledVector(tm.right,g).addScaledVector(tm.up,p+a*.55),im.copy(nm.pos).addScaledVector(nm.right,i*.35).addScaledVector(nm.up,m+a*.5),c.mode!==`title`&&im.lerp(J.world.pos,o?.12:.3).addScaledVector(tm.up,.4),$p?(Yd.position.copy(rm),am.copy(im),$p=!1):(Yd.position.lerp(rm,1-Math.exp(-Vp.lagPos*e)),am.lerp(im,1-Math.exp(-Vp.lagLook*e))),om.copy(sm).lerp(tm.up,.5).normalize(),um>.001){pm.copy(tm.fwd).normalize();let e=Math.max(-.38,Math.min(.38,dm*.33));fm.setFromAxisAngle(pm,e);let t=pm.set(0,1,0).applyQuaternion(fm);om.lerp(t,um).normalize()}if(Yd.up.copy(om),Yd.lookAt(am),Gp>0){let t=Gp*.35;Yd.position.x+=(Math.random()-.5)*t,Yd.position.y+=(Math.random()-.5)*t,Gp=Math.max(0,Gp-e*2.5)}Wp=Math.max(0,Wp-e*10);let _=u.reducedMotion?0:Math.max(0,J.speed-18)*Vp.fovPerSpeed,v=(Vp.baseFov+_+Wp)*(o?1.38:1);Math.abs(Yd.fov-v)>.01&&(Yd.fov=v,Yd.updateProjectionMatrix());let y=c.mode===`title`?tm.pos:J.world.pos;Zd.target.position.copy(y),Zd.position.copy(y).addScaledVector(Qd.normalize(),120),Zd.target.updateMatrixWorld()}var hm=new H;function gm(e,t=!1){let n=t?Math.round(e):kf(e,l.mult);return l.score+=n,n}function _m(){l.mult=Af(l.mult),l.maxMult=Math.max(l.maxMult,l.mult),n.emit(`mult`,{value:l.mult})}function vm(e=hm,t=50){let r=gm(t);return l.fish++,_m(),n.emit(`pickup`,{kind:`fish`,points:r,x:e.x,y:e.y,z:e.z}),r}function ym(e,t=hm,r=0,i=0,a){let o=r>0?gm(r):0;return i>0&&xm(i),n.emit(`pickup`,{kind:e,points:o,x:t.x,y:t.y,z:t.z}),a&&(hf(a),gf(`nom`)),o}function bm(e,t=hm){if(e<0||e>=7||l.bells[e])return!1;l.bells[e]=!0;let r=l.bells.filter(Boolean).length,i=gm(500);return n.emit(`pickup`,{kind:`bell`,points:i,x:t.x,y:t.y,z:t.z}),n.emit(`bell`,{index:e,count:r,total:7}),gf(`wow`),r===7&&hf(`ALL 7 BELLS!`),!0}function xm(e){l.meter=Math.max(0,Math.min(1,l.meter+e)),n.emit(`meter`,{value:l.meter})}function Sm(e){return l.meter+1e-6<e?!1:(l.meter=Math.max(0,l.meter-e),n.emit(`meter`,{value:l.meter}),!0)}function Cm(e){let t=gm(100);_m(),n.emit(`nearMiss`,{label:e,points:t}),hf(`CLOSE ONE!`)}var wm=[],Tm=.5;function Em(e){let t={shape:e.shape??`box`,s:e.s,x:e.x??0,y:e.y??0,hs:e.hs??.5,hx:e.hx??.5,h:e.h??1,r:e.r??.5,kind:e.kind,label:e.label??e.kind,once:e.once??e.kind===`trigger`,near:e.near??e.kind===`hurt`,onTouch:e.onTouch,enabled:!0,_in:!1,_hit:!1,_passed:!1,_min:1/0};return wm.push(t),t}function Dm(e){let t=wm.indexOf(e);t>=0&&wm.splice(t,1)}function Om(){wm.length=0}var km=()=>wm;function Am(e){let t=lp.radius,n=up();if(e.shape===`sphere`){let r=J.y+t,i=Math.max(r,J.y+n-t),a=Math.max(r,Math.min(i,e.y));return Math.hypot(J.s-e.s,J.x-e.x,a-e.y)-e.r-t}let r=Math.abs(J.s-e.s)-e.hs-t,i=Math.abs(J.x-e.x)-e.hx-t,a=J.y-(e.y+e.h),o=e.y-(J.y+n);return Math.max(r,i,a,o)}function jm(){if(c.mode===`play`)for(let e=0;e<wm.length;e++){let t=wm[e];if(!t.enabled)continue;let n=t.s-J.s;if(n>12||n<-12){t._in=!1;continue}let r=Am(t),i=r<0;if(t.kind===`hurt`){i&&!t._hit&&(t._hit=!0,Ap(t.label),t.onTouch?.(t),t.once&&(t.enabled=!1));let e=(t.shape===`sphere`?t.r:t.hs)+lp.radius;Math.abs(n)<=e&&(t._min=Math.min(t._min,r)),t.near&&!t._passed&&J.s-lp.radius>t.s+(t.shape===`sphere`?t.r:t.hs)&&(t._passed=!0,!t._hit&&t._min<Tm&&t._min>=0&&Cm(t.label))}else i&&!t._in&&(t.onTouch?.(t),t.once&&(t.enabled=!1));t._in=i}}var Mm=1600,Nm=new Float32Array(Mm*3),Pm=new Float32Array(Mm*3),Fm=new Float32Array(Mm),Im=new Float32Array(Mm),Lm=new Float32Array(Mm*3),Rm=new Float32Array(Mm),zm=new Float32Array(Mm),Bm=new Float32Array(Mm),Vm=new Float32Array(Mm),Hm=new Float32Array(Mm),Um=0,Wm=new Si;Wm.setAttribute(`position`,new ci(Nm,3).setUsage(en)),Wm.setAttribute(`color`,new ci(Pm,3).setUsage(en)),Wm.setAttribute(`size`,new ci(Fm,1).setUsage(en)),Wm.setAttribute(`alpha`,new ci(Im,1).setUsage(en)),Wm.boundingSphere=new mi(new H,1e6);var Gm=new Es({transparent:!0,depthWrite:!1,vertexColors:!0,uniforms:{scale:{value:600}},vertexShader:`
    attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale;
    void main() { vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float dz = -mv.z;
      // fade out close to the camera (never a screen-filling disc) and cap the sprite size
      vA *= smoothstep(2.2, 4.6, dz);
      gl_PointSize = min(size * scale / max(0.1, dz), scale * 0.07); gl_Position = projectionMatrix * mv; }`,fragmentShader:`
    varying vec3 vC; varying float vA;
    void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard;
      gl_FragColor = vec4(vC, vA * smoothstep(0.25, 0.12, r)); }`}),Km=new Fa(Wm,Gm);Km.frustumCulled=!1,Km.renderOrder=5,Jd.add(Km),addEventListener(`resize`,()=>Gm.uniforms.scale.value=innerHeight*.9),Gm.uniforms.scale.value=innerHeight*.9;var qm=new W;function Jm(e,t,n,r,i,a,o,s,c,l=0,u=1){if(af()===`low`&&(Um&1)==1){Um=(Um+1)%Mm;return}let d=Um;Um=(Um+1)%Mm,Nm[d*3]=e,Nm[d*3+1]=t,Nm[d*3+2]=n,Lm[d*3]=r,Lm[d*3+1]=i,Lm[d*3+2]=a,qm.setHex(c),Pm[d*3]=qm.r,Pm[d*3+1]=qm.g,Pm[d*3+2]=qm.b,Rm[d]=o,zm[d]=0,Bm[d]=l,Vm[d]=s,Fm[d]=s,Hm[d]=u,Im[d]=u}function Ym(e,t,n,r=4,i=.6,a=.35,o=6,s=.6){for(let c=0;c<t;c++){let t=Math.random()*Math.PI*2,c=Math.random()*2-1+s,l=r*(.4+Math.random()*.6);Jm(e.x,e.y,e.z,Math.cos(t)*l,c*l,Math.sin(t)*l,i*(.6+Math.random()*.6),a*(.7+Math.random()*.6),n,o)}}function Xm(e){if(!(e<=0)){for(let t=0;t<Mm;t++){if(Rm[t]<=0)continue;if(zm[t]+=e,zm[t]>=Rm[t]){Rm[t]=0,Im[t]=0,Fm[t]=0;continue}Lm[t*3+1]-=Bm[t]*e,Nm[t*3]+=Lm[t*3]*e,Nm[t*3+1]+=Lm[t*3+1]*e,Nm[t*3+2]+=Lm[t*3+2]*e;let n=zm[t]/Rm[t];Im[t]=Hm[t]*(1-n*n),Fm[t]=Vm[t]*(1+n*.6)}Wm.attributes.position.needsUpdate=!0,Wm.attributes.color.needsUpdate=!0,Wm.attributes.size.needsUpdate=!0,Wm.attributes.alpha.needsUpdate=!0}}function Zm(){Rm.fill(0),Im.fill(0),Fm.fill(0)}var Qm=Math.PI/180,$m=e=>e*e*(3-2*e),eh=class{track;x;y;z;heading;width;bank;constructor(e,t={x:0,y:0,z:0,heading:0}){this.track=e,this.x=t.x,this.y=t.y,this.z=t.z,this.heading=t.heading*Qm,this.width=t.width??10,this.bank=0,e.samples===0&&e.push(this.x,this.y,this.z,this.width,0,`ground`)}get s(){return this.track.length}run(e,t={}){let n=this.s,r=Math.max(1,Math.round(e/1)),i=t.kind??`ground`,a=-(t.turn??0)*Qm,o=t.rise??0,s=t.ease!==!1,c=this.width,l=t.width??c,u=this.bank,d=t.bank===void 0?u:t.bank*Qm,f=Math.max(.01,Math.min(1,t.bankIn??1)),p=this.y,m=this.heading;for(let e=1;e<=r;e++){let t=e/r,n=m+a*((e-.5)/r),h=p+o*(s?$m(t):t),g=h-this.y,_=Math.sqrt(Math.max(.04,1-g*g));this.x+=Math.sin(n)*_,this.z+=Math.cos(n)*_,this.y=h;let v=$m(t);this.width=c+(l-c)*v,this.bank=u+(d-u)*$m(Math.min(1,t/f)),this.track.push(this.x,this.y,this.z,this.width,this.bank,i)}return this.heading=m+a,{s0:n,s1:this.s}}straight(e,t=`ground`){return this.run(e,{kind:t})}gap(e,t={}){return this.run(e,{...t,kind:`gap`})}};function th(e){let t=e>>>0||2654435769;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}var nh=(e,t,n)=>t+(n-t)*e(),rh=(e,t)=>t[Math.floor(e()*t.length)%t.length],ih=new Set([`log`,`rock`,`branch`,`puddle`,`bamboo`,`driftlog`,`riverrock`,`rapid`,`edge`]),ah=new Set([`ground`,`bridge`,`river`]);function oh(e,t,n){for(let t=e-2;t<=e+24;t+=1)if(!ah.has(n(t)))return!1;for(let n of t)if(ih.has(n.type)&&n.s<=e+18&&n.s+(n.len??0)>=e-4)return!1;return!0}function sh(e,t,n,r,i=300){let a=[...new Set(e)].sort((e,t)=>e-t),o=0;for(let e=0;e<a.length&&o++<500;e++){let o=a[e],s=e+1<a.length?a[e+1]:r;if(s-o<=i)continue;let c=-1;for(let e=Math.floor(o+i);e>=o+i*.4;e-=2)if(oh(e,t,n)){c=e;break}if(c<0){for(let e=Math.floor(o+i)+2;e<s-60;e+=2)if(oh(e,t,n)){c=e;break}}c>o&&a.splice(e+1,0,c)}return a}var ch=t({CHUNK_LEN:()=>80,VIEW_AHEAD:()=>lh,frameSession:()=>$h,pause:()=>Wh,prepareStage:()=>Mh,quit:()=>Kh,rebuildScenery:()=>Bh,resume:()=>Gh,retry:()=>Uh,sessionInfo:()=>kh,startStage:()=>Hh,stepSession:()=>Qh}),lh={high:560,low:360},uh=300,dh=40,fh=12,ph=90,mh=2.2,hh=700,gh=null,_h=th(1),vh=[],yh=0,bh=[],xh=new Map,Sh=null,Ch=null,wh=0,Th=0,Eh=0,Dh=-1,Oh=new Set,kh={get live(){return bh.length},get specs(){return vh},get chunks(){return xh.size}};function Ah(e){e.traverse(e=>{let t=e.geometry;t&&!t.userData?.shared&&!e.userData.shared&&t.dispose()})}function jh(){for(let e of bh)Lh(e);bh.length=0,Om();for(let[,e]of xh)Jd.remove(e),Sh?.disposeChunk?Sh.disposeChunk(e):Ah(e);xh.clear(),Sh&&Ch&&Sh.exit?.(Ch),Sh=null,Ch=null,Rp(),Zm(),mf()}function Mh(e){jh();let t=yf.get(e);c.stage=t;let r=new Gf;c.track=r,gh=new eh(r,t.start),l.endless=!!t.chunk&&!t.build,l.seed=l.endless?(Date.now()&65535)+1:1e3+t.index*77,_h=th(l.seed),vh=[],wh=0,Dh=-1,J.s=0,t.build?(vh=t.build(gh,_h).slice(),l.finishS=r.length,gh.straight(ph)):(l.finishS=1/0,Nh(hh)),vh.sort((e,t)=>e.s-t.s);let i=[0];for(let e of vh){let t=xf.has(e.type)?xf.get(e.type):null;(e.checkpoint??t?.checkpoint??!1)&&i.push(Math.max(0,e.s-fh))}l.checkpoints=Number.isFinite(l.finishS)?sh(i,vh,e=>r.kindAt(e),l.finishS-40):[...new Set(i)].sort((e,t)=>e-t),ff.ticks=Number.isFinite(l.finishS)?l.checkpoints.slice(1).map(e=>e/l.finishS):[],Sh=bf.has(t.theme)?bf.get(t.theme):null,Ch={scene:Jd,track:r,stage:t,quality:af(),camera:Yd,sun:Zd,hemi:Xd},Sh?.enter(Ch),yh=0,Eh=0,c.mode=`title`,n.emit(`stageLoad`,{stage:t})}function Nh(e){let t=c.stage,n=c.track;if(!t?.chunk||!gh||!n)return;let r=0;for(;n.length<J.s+e&&r++<50;){let e=n.length,r=t.chunk(gh,_h,wh++);n.length<=e&&gh.straight(60);for(let e of r)Fh(e);for(let e of r){let t=xf.has(e.type)?xf.get(e.type):null;(e.checkpoint??t?.checkpoint??!1)&&l.checkpoints.push(Math.max(0,e.s-fh))}}}function Ph(){let e=0;for(;e<yh&&vh[e].s+(vh[e].len??0)<J.s-200;)e++;e>32&&(vh.splice(0,e),yh-=e);let t=l.cpIndex-1;t>8&&(l.checkpoints.splice(0,t),l.cpIndex-=t);let n=c.track;if(n){let e=Math.min(J.s-1500,(l.checkpoints[0]??0)-300);e-n.start>2e3&&n.trimBefore(e)}}function Fh(e){let t=vh.length;for(;t>0&&vh[t-1].s>e.s;)t--;vh.splice(t,0,e),t<yh&&yh++}function Ih(e){let t=c.stage,n=c.track;if(!xf.has(e.type)){Oh.has(e.type)||(Oh.add(e.type),console.warn(`set piece type not registered: ${e.type} (skipped)`));return}let r=xf.get(e.type),i=new U;i.name=`piece:${e.type}`,Jd.add(i);let a=[],o=r.create({stage:t,track:n,spec:e,group:i,quality:af(),addCollider:e=>{let t=Em(e);return a.push(t),t},removeCollider:e=>{Dm(e);let t=a.indexOf(e);t>=0&&a.splice(t,1)}});bh.push({spec:e,inst:o,group:i,cols:a})}function Lh(e){try{e.inst.dispose?.()}catch(e){console.error(`set piece dispose failed`,e)}for(let t of e.cols)Dm(t);Jd.remove(e.group),Ah(e.group)}function Rh(){for(;yh<vh.length&&vh[yh].s<J.s+uh;)Ih(vh[yh++]);for(let e=bh.length-1;e>=0;e--){let t=bh[e];t.inst.end<J.s-dh&&(Lh(t),bh.splice(e,1))}}function zh(e,t=0){let n=c.track;if(!n||!Sh||!Ch)return;let r=af()===`high`?lh.high:lh.low,i=Math.max(-1,Math.floor((e-40)/80)),a=Math.floor(Math.min(n.length,e+r)/80);for(let[e,t]of xh)(e<i||e>a+1)&&(Jd.remove(t),Sh.disposeChunk?Sh.disposeChunk(t):Ah(t),xh.delete(e));let o=t||(c.mode===`play`?1:64),s=0;for(let e=i;e<=a&&s<o;e++){if(xh.has(e))continue;let t=e*80,r=Sh.buildChunk(Ch,t,Math.min(n.length,t+80));r?(Jd.add(r),xh.set(e,r)):xh.set(e,new U),s++}}function Bh(){if(Sh&&Ch){for(let[,e]of xh)Jd.remove(e),Sh.disposeChunk?Sh.disposeChunk(e):Ah(e);xh.clear(),Sh.exit?.(Ch),Ch.quality=af(),Sh.enter(Ch),zh(c.mode===`title`?lm():J.s,64)}}n.on(`qualityChange`,()=>Bh());function Vh(){Object.assign(l,{score:0,mult:1,maxMult:1,hearts:3,bells:Array(7).fill(!1),fish:0,meter:0,time:0,distance:0,hits:0,respawns:0,cpIndex:0,progress:0}),ff.now=0,ff.prompt=null}function Hh(e,t={}){Mh(e),Vh();let r=c.stage,i=0;if(t.at&&t.at>0){let e=Number.isFinite(l.finishS)?Math.min(.999,t.at)*l.finishS:t.at*2e3;for(Number.isFinite(l.finishS)||Nh(e+hh),i=e;l.cpIndex+1<l.checkpoints.length&&l.checkpoints[l.cpIndex+1]<=i;)l.cpIndex++}for(_p(i,0),fp(i>0?lp.respawnInvuln:0),yh=0;yh<vh.length&&vh[yh].s+(vh[yh].len??0)<i-1;)yh++;Eh=i,Lp(),c.mode=`play`,Th=0,df(),zh(i),Rh(),em();try{qd.compile(Jd,Yd)}catch(e){console.warn(`shader precompile failed`,e)}n.emit(`stageStart`,{stage:r,at:i})}function Uh(){c.stage&&Hh(c.stage.id)}function Wh(){c.mode===`play`&&(c.mode=`paused`,n.emit(`pause`,r))}function Gh(){c.mode===`paused`&&(c.mode=`play`,n.emit(`resume`,r))}function Kh(){let e=c.stage;e&&(n.emit(`quit`,{stage:e}),Mh(e.id))}function qh(e){let t=c.stage,n=l.bells.filter(Boolean).length,r={stageId:t.id,finished:e,score:Math.round(l.score),bells:l.bells.slice(),bellCount:n,bellsTotal:t.bells,fish:l.fish,distance:Math.round(l.distance),time:l.time,hits:l.hits,respawns:l.respawns,hearts:l.hearts,maxMult:l.maxMult,stars:[!1,!1,!1]};return r.stars=Pf(r,t.scoreTarget),r}function Jh(e){c.mode!==`over`&&(c.mode=`over`,mf(),n.emit(`stageEnd`,{result:qh(e)}))}function Yh(){c.mode=`finish`,J.mode=`finish`,J.sliding=!1,Th=0,l.score+=Nf(l.hearts),mf(),hf(`HOME!`,`good`),gf(`happy`),n.emit(`finishLine`,{stage:c.stage})}function Xh(){let e=Mf(l.score);if(l.score-=e,l.respawns++,l.endless){Jh(!1);return}let t=l.checkpoints[l.cpIndex]??0;n.emit(`lifeLost`,{penalty:e,s:t}),Dh=t}mp(Xh);function Zh(e){l.hearts=3;for(let e of bh)Lh(e);for(bh.length=0,yh=0;yh<vh.length&&vh[yh].s+(vh[yh].len??0)<e-1;)yh++;vp(e,0),_p(e,0),J.invuln=lp.respawnInvuln,Eh=e,Rh();for(let t of bh)t.inst.onRespawn?.(e);hf(`TRY AGAIN!`,`info`),n.emit(`respawn`,{s:e})}function Qh(e,t){if(c.mode!==`play`&&c.mode!==`finish`)return;if(Dh>=0){let e=Dh;Dh=-1,Zh(e)}_f(e),c.mode===`play`&&(l.time+=e);let r=Math.max(0,J.s-Eh);Eh=J.s,l.distance+=r,c.mode===`play`&&(l.score+=r*1),l.endless&&(Nh(hh),Ph()),Rh();for(let n=0;n<bh.length;n++)bh[n].inst.update?.(e,t);for(;l.cpIndex+1<l.checkpoints.length&&J.s>=l.checkpoints[l.cpIndex+1];)l.cpIndex++,n.emit(`checkpoint`,{index:l.cpIndex,s:l.checkpoints[l.cpIndex]});l.progress=Number.isFinite(l.finishS)?Math.min(1,J.s/l.finishS):J.s%5e3/5e3,c.mode===`play`&&J.s>=l.finishS&&Yh(),c.mode===`finish`&&(Th+=e)>=mh&&Jh(!0)}function $h(e,t){c.track&&(zh(c.mode===`title`?lm():J.s),Sh&&Ch&&Sh.update?.(e,t,Ch))}typeof document<`u`&&document.addEventListener(`visibilitychange`,()=>document.hidden&&Wh());var eg=1/120,tg=[],ng=[];function rg(e,t){return e.push(t),()=>{let n=e.indexOf(t);n>=0&&e.splice(n,1)}}var ig=e=>rg(ng,e),ag={sim:0,frame:0},og=0,sg=0,cg=0;function lg(e){requestAnimationFrame(lg);let t=Math.min(.1,Math.max(0,(e-og)/1e3));og=e;let n=e/1e3;if(ag.frame++,c.mode===`play`||c.mode===`finish`){sg+=t;let e=0;for(;sg>=.008333333333333333&&e++<14;){sg-=eg,ag.sim+=eg,Qf(eg),jp(eg),Qh(eg,ag.sim),jm();for(let e=0;e<tg.length;e++)tg[e](eg,ag.sim);if(c.mode!==`play`&&c.mode!==`finish`)break}sg>.008333333333333333&&(sg=0),uf(t)}else sg=0;let r=c.mode===`paused`?0:t;$h(r,n),Bp(r,n),mm(r,n),Xm(r);for(let e=0;e<ng.length;e++)try{ng[e](r,n)}catch(t){console.error(`frame hook failed`,t),ng.splice(e--,1)}(c.mode!==`paused`||cg++%10==0)&&(c.mode!==`paused`&&(cg=0),qd.render(Jd,Yd))}function ug(){og=performance.now(),requestAnimationFrame(lg)}var dg={};function fg(e,t){let n=_();if(!n)return!1;let r=n.ctx.currentTime;return r-(dg[e]??-9)<t?!1:(dg[e]=r,!0)}function pg(e,t,n,r,i,a=1,o){let s=_();if(!s)return;let c=s.ctx,l=o??c.currentTime,u=c.createBufferSource();u.buffer=s.noiseBuf;let d=c.createBiquadFilter();d.type=n,d.Q.value=a,d.frequency.setValueAtTime(r,l),d.frequency.exponentialRampToValueAtTime(Math.max(30,i),l+e);let f=c.createGain();y(f,t,Math.min(.02,e*.2),e,l),u.connect(d).connect(f).connect(s.sfx),u.start(l,Math.random()*1.5,e+.1)}function mg(e=620,t=.36,n=`meow`,r=.16){let i=_();if(!i)return;let a=i.ctx,o=a.currentTime,s=a.createOscillator();s.type=`sawtooth`;let c=s.frequency;n===`meow`?(c.setValueAtTime(e*.8,o),c.exponentialRampToValueAtTime(e*1.15,o+t*.35),c.exponentialRampToValueAtTime(e*.7,o+t)):n===`mrrp`?(c.setValueAtTime(e*.85,o),c.exponentialRampToValueAtTime(e*1.3,o+t)):(c.setValueAtTime(e*1.2,o),c.exponentialRampToValueAtTime(e*1.35,o+t*.2),c.exponentialRampToValueAtTime(e*.55,o+t));let l=a.createGain();if(l.gain.value=1,n===`mrrp`){let e=a.createOscillator();e.frequency.value=28;let n=a.createGain();n.gain.value=.45,e.connect(n).connect(l.gain),e.start(o),e.stop(o+t+.05)}let u=a.createBiquadFilter();u.type=`bandpass`,u.Q.value=5,u.frequency.setValueAtTime(380,o),u.frequency.exponentialRampToValueAtTime(820,o+t*.5);let d=a.createBiquadFilter();d.type=`bandpass`,d.Q.value=7,d.frequency.setValueAtTime(2300,o),d.frequency.exponentialRampToValueAtTime(1150,o+t*.7);let f=a.createGain();f.gain.setValueAtTime(1e-4,o),f.gain.exponentialRampToValueAtTime(r,o+.04),f.gain.setValueAtTime(r,o+t*.6),f.gain.exponentialRampToValueAtTime(1e-4,o+t),s.connect(l),l.connect(u).connect(f),l.connect(d).connect(f),f.connect(i.sfx),s.start(o),s.stop(o+t+.05)}function hg(e=0,t=1){let n=_();if(!n)return;let r=n.ctx,i=r.currentTime+e,a=r.createOscillator();a.type=`square`,a.frequency.setValueAtTime(210*t,i),a.frequency.exponentialRampToValueAtTime(320*t,i+.04),a.frequency.exponentialRampToValueAtTime(130*t,i+.2);let o=r.createBiquadFilter();o.type=`bandpass`,o.frequency.setValueAtTime(700,i),o.frequency.exponentialRampToValueAtTime(420,i+.2),o.Q.value=2.2;let s=r.createGain();y(s,.5,.012,.22,i),a.connect(o).connect(s).connect(n.sfx),a.start(i),a.stop(i+.3),pg(.12,.12,`bandpass`,900,500,1.5,i)}function gg(e,t,n,r=.5){let i=_();if(!i)return;let a=i.ctx.currentTime;e.forEach((e,i)=>{b(`sine`,e,r,n,{at:a+i*t}),b(`sine`,e*2.76,r*.4,n*.22,{at:a+i*t})})}function _g(){let e=_();if(!e)return;let t=e.ctx,n=t.currentTime,r=t.createOscillator();r.type=`triangle`,r.frequency.setValueAtTime(140,n),r.frequency.exponentialRampToValueAtTime(620,n+.35);let i=t.createOscillator();i.frequency.setValueAtTime(22,n),i.frequency.linearRampToValueAtTime(9,n+.5);let a=t.createGain();a.gain.setValueAtTime(120,n),a.gain.exponentialRampToValueAtTime(5,n+.55),i.connect(a).connect(r.frequency);let o=t.createGain();y(o,.22,.01,.55,n),r.connect(o).connect(e.sfx),r.start(n),i.start(n),r.stop(n+.62),i.stop(n+.62)}var vg={};function yg(e,t){let n=_();if(!n||vg[e])return;let r=n.ctx.createGain();r.gain.value=0,r.connect(n.sfx),t(n,r),vg[e]={gain:r,level:0}}function bg(e){let t=e.ctx.createBufferSource();return t.buffer=e.noiseBuf,t.loop=!0,t.start(),t}function xg(){yg(`river`,(e,t)=>{let n=e.ctx,r=n.createBiquadFilter();r.type=`bandpass`,r.frequency.value=900,r.Q.value=.6;let i=n.createOscillator();i.frequency.value=.7;let a=n.createGain();a.gain.value=350,i.connect(a).connect(r.frequency),i.start(),bg(e).connect(r).connect(t);let o=n.createBiquadFilter();o.type=`highpass`,o.frequency.value=3500;let s=n.createGain();s.gain.value=.35,bg(e).connect(o).connect(s).connect(t)}),yg(`claws`,(e,t)=>{let n=e.ctx,r=n.createBiquadFilter();r.type=`bandpass`,r.frequency.value=3800,r.Q.value=1.5;let i=n.createGain();i.gain.value=.5;let a=n.createOscillator();a.type=`square`,a.frequency.value=14;let o=n.createGain();o.gain.value=.5,a.connect(o).connect(i.gain),a.start(),bg(e).connect(r).connect(i).connect(t),vg.claws={gain:t,level:0,lfo:a}}),yg(`wind`,(e,t)=>{let n=e.ctx,r=n.createBiquadFilter();r.type=`bandpass`,r.frequency.value=500,r.Q.value=.5;let i=n.createOscillator();i.frequency.value=.31;let a=n.createGain();a.gain.value=220,i.connect(a).connect(r.frequency),i.start(),bg(e).connect(r).connect(t)}),yg(`rumble`,(e,t)=>{let n=e.ctx,r=n.createBiquadFilter();r.type=`lowpass`,r.frequency.value=160,r.Q.value=2,bg(e).connect(r).connect(t);let i=n.createOscillator();i.type=`sine`,i.frequency.value=42;let a=n.createGain();a.gain.value=.5;let o=n.createOscillator();o.frequency.value=3.2;let s=n.createGain();s.gain.value=.4,o.connect(s).connect(a.gain),i.connect(a).connect(t),i.start(),o.start()})}function Sg(e,t){let n=vg[e],r=_();n&&r&&(Math.abs(n.level-t)<.015||(n.level=t,n.gain.gain.setTargetAtTime(t,r.ctx.currentTime,.08)))}var Cg=!1,wg=!1,Tg=0;function Eg(){fg(`ui`,.04)&&(b(`triangle`,1100,.05,.08,{to:700}),pg(.03,.05,`highpass`,4e3,3e3))}function Dg(){n.on(`jump`,()=>{fg(`jump`,.05)&&(b(`triangle`,330,.14,.16,{to:720}),b(`sine`,660,.08,.06,{to:1100}),pg(.08,.05,`highpass`,2500,5e3))}),n.on(`pounce`,()=>{pg(.25,.14,`bandpass`,600,3200,1.2),b(`square`,500,.12,.05,{to:1300}),fg(`meowPounce`,.6)&&mg(680+Math.random()*80,.18,`mrrp`,.11)}),n.on(`land`,e=>{if(!fg(`land`,.06))return;let t=Math.min(1,e.impact/25);J.surface===`river`?pg(.3,.14+t*.1,`bandpass`,1400,500,.8):J.ability===`cloud`?pg(.2,.08,`lowpass`,1200,200):(b(`sine`,150,.1+t*.08,.1+t*.18,{to:60}),pg(.08+t*.08,.05+t*.08,`lowpass`,1800,300),J.surface===`bridge`&&b(`square`,240,.05,.05,{to:180}))}),n.on(`slide`,e=>{e.on&&pg(.42,.12,`bandpass`,2400,700,.9)}),n.on(`fastFall`,()=>b(`sine`,900,.18,.06,{to:260})),n.on(`pickup`,e=>{let t=_();if(t){if(e.kind===`fish`){if(!fg(`fish`,.03))return;let e=Math.max(0,Og-2)%10,n=784*2**(([0,2,4,7,9][e%5]+12*Math.floor(e/5))/12);b(`square`,n,.06,.05,{to:n*1.02}),b(`sine`,n*1.5,.12,.09,{at:t.ctx.currentTime+.05})}else if(e.kind!==`bell`){if(!fg(`nom`,.08))return;for(let e=0;e<2;e++){let n=t.ctx.currentTime+e*.11,r=t.ctx.createOscillator();r.type=`sawtooth`,r.frequency.setValueAtTime(260+e*30,n),r.frequency.exponentialRampToValueAtTime(180,n+.08);let i=t.ctx.createBiquadFilter();i.type=`bandpass`,i.frequency.setValueAtTime(500,n),i.frequency.exponentialRampToValueAtTime(1100,n+.08),i.Q.value=4;let a=t.ctx.createGain();y(a,.22,.01,.09,n),r.connect(i).connect(a).connect(t.sfx),r.start(n),r.stop(n+.12)}b(`triangle`,1320,.12,.05,{at:t.ctx.currentTime+.22,to:1760})}}}),n.on(`bell`,e=>{let t=1046*2**([0,2,4,5,7,9,11][Math.min(6,e.count-1)]/12);gg([t,t*1.5,t*2],.07,.11,.9),pg(.5,.03,`highpass`,7e3,9e3),e.count===e.total&&setTimeout(()=>gg([1046,1318,1568,2093,2637],.08,.09,1),350)}),n.on(`mult`,e=>{Og=e.value,e.value>1&&e.value%10==0&&fg(`mult10`,.5)&&gg([1568,1976,2349,3136],.05,.06,.4)}),n.on(`hit`,e=>{b(`sawtooth`,220,.22,.12,{to:70}),pg(.2,.18,`lowpass`,2e3,200),e.label===`fall`?mg(700,.6,`mrow`,.14):mg(560,.3,`mrow`,.15)}),n.on(`fall`,()=>b(`sine`,900,.6,.08,{to:120})),n.on(`wet`,()=>{pg(.35,.22,`bandpass`,1800,400,.9),b(`sine`,520,.12,.06,{to:260}),setTimeout(()=>mg(760,.22,`mrow`,.1),120);let e=_();if(e)for(let t=0;t<3;t++)pg(.12,.08,`bandpass`,2600,1800,2,e.ctx.currentTime+.45+t*.16)}),n.on(`abilityStart`,e=>{e.id===`vault`?_g():e.id===`cloud`&&(pg(.6,.2,`lowpass`,2500,180,.7),gg([784,988,1175],.06,.05,.5),mg(720,.3,`meow`,.1))}),n.on(`abilityEnd`,e=>{e.id===`cloud`&&pg(.4,.12,`lowpass`,1600,200)}),n.on(`surface`,e=>{e.kind===`river`&&e.prev!==`river`&&pg(.4,.18,`bandpass`,1200,500,.7),e.kind===`wall`&&e.prev!==`wall`&&(pg(.2,.1,`highpass`,3e3,5e3),b(`square`,1400,.05,.04,{to:2200}))}),n.on(`nearMiss`,()=>{fg(`near`,.15)&&(pg(.28,.16,`bandpass`,3200,500,2.5),wg&&fg(`nearBark`,1)&&hg(.1,1.05))}),n.on(`checkpoint`,e=>{e.index>0&&gg([1318,1760],.09,.07,.45)}),n.on(`respawn`,()=>{pg(.35,.12,`bandpass`,400,2400,1.5),b(`triangle`,520,.18,.1,{to:1040})}),n.on(`lifeLost`,()=>mg(480,.55,`mrow`,.13)),n.on(`chase`,e=>{e.kind===`dog`?(wg=e.on,e.on&&(hg(0,1),hg(.25,1.08))):(e.kind===`yarn`||e.kind===`boulder`||e.kind===`hay`)&&(Cg=e.on)}),n.on(`setPiece`,e=>{e.id===`dog`&&(e.phase===`bark`||e.phase===`start`)&&hg(0,.95+Math.random()*.15)}),n.on(`finishLine`,()=>setTimeout(()=>mg(760,.5,`meow`,.14),700)),n.on(`stageStart`,()=>{wg=!1,Cg=!1,Og=1}),n.on(`quit`,()=>{wg=!1,Cg=!1}),n.on(`stageEnd`,()=>{wg=!1,Cg=!1}),n.on(`setPiece`,e=>{if(e.id===`ending`&&e.phase===`start`){let e=_();if(!e)return;let t=e.ctx,n=t.currentTime+1.2,r=t.createOscillator();r.type=`sawtooth`,r.frequency.value=26;let i=t.createBiquadFilter();i.type=`lowpass`,i.frequency.value=300;let a=t.createGain();a.gain.setValueAtTime(1e-4,n),a.gain.exponentialRampToValueAtTime(.09,n+.8),a.gain.setValueAtTime(.09,n+5),a.gain.exponentialRampToValueAtTime(1e-4,n+7),r.connect(i).connect(a).connect(e.sfx),r.start(n),r.stop(n+7.2),setTimeout(()=>mg(820,.45,`meow`,.12),600)}}),typeof document<`u`&&document.addEventListener(`pointerdown`,e=>{let t=e.target;t&&t.closest&&t.closest(`button, [role="button"], .btn`)&&Eg()},!0),ig(e=>{if(!_())return;xg();let t=(c.mode===`play`||c.mode===`finish`)&&c.mode===`play`;Sg(`river`,t&&J.surface===`river`&&J.ability!==`cloud`?J.grounded?.32:.16:0),Sg(`claws`,t&&J.surface===`wall`&&J.grounded?.16:0);let n=vg.claws;n?.lfo&&e>0&&(n.lfo.frequency.value=8+J.speed*.3);let r=t?Math.max(0,(J.speed-20)/12)*.1+(J.ability===`cloud`?.14:0)+(J.ability===`vault`?.16:0)+(J.grounded?0:.04):0;Sg(`wind`,Math.min(.3,r)),Sg(`rumble`,t&&Cg?.55:0),t&&J.surface===`bridge`&&J.grounded&&e>0&&(Tg-=e,Tg<=0&&(Tg=.11,b(`square`,200+Math.random()*40,.03,.025,{to:150})))})}var Og=1;function kg(){we(),Dg();let e=()=>{try{h()}catch(e){console.warn(`audio unavailable`,e)}};for(let t of[`pointerdown`,`keydown`,`touchend`])addEventListener(t,e,{capture:!0,passive:!0})}function Ag(e,t){let n=Math.max(0,Math.min(1,(e.speed-21)/9))*.55;return e.boostT>0&&e.boostMul>1&&(n+=.45),e.sincePounce<.35&&(n+=.45*(1-e.sincePounce/.35)),e.ability===`vault`?n+=.5:e.ability===`cloud`&&(n+=.35),e.mode===`finish`&&(n*=.3),e.sinceHit<.6&&(n*=.4),n=Math.min(1,n),t?n*.35:n}var jg=null,Mg=0;function Ng(){if(jg)return;let e=new Es({transparent:!0,depthTest:!1,depthWrite:!1,uniforms:{uTime:{value:0},uAmt:{value:0},uAspect:{value:1},uTint:{value:new W(16777215)}},vertexShader:`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,fragmentShader:`
      varying vec2 vUv; uniform float uTime; uniform float uAmt; uniform float uAspect; uniform vec3 uTint;
      float h(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        float r = length(p) / (0.5 * length(vec2(uAspect, 1.0)));
        float a = atan(p.y, p.x) / 6.28318 + 0.5;
        const float N = 90.0;
        float bin = floor(a * N);
        float f = fract(a * N);
        float rnd = h(bin);
        float rnd2 = h(bin + 31.7);
        // only some bins carry a line at any moment, and each line is thin and tapered
        float on = step(0.45, h(bin + floor(uTime * (3.0 + rnd * 4.0) + rnd2 * 9.0)));
        float width = 0.12 + rnd * 0.18;
        float line = smoothstep(width, 0.0, abs(f - 0.5));
        // a streak travels outward along r
        float head = fract(uTime * (1.6 + rnd2 * 1.8) + rnd);
        float pos = mix(0.55, 1.15, head);
        float len = 0.18 + rnd * 0.22;
        float streak = smoothstep(pos - len, pos - len * 0.4, r) * smoothstep(pos + 0.02, pos - 0.05, r);
        float edge = smoothstep(0.42 + (1.0 - uAmt) * 0.25, 0.95, r);
        float alpha = line * streak * edge * on * uAmt * 0.85;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uTint, alpha);
      }`});jg=new K(new ms(2,2),e),jg.frustumCulled=!1,jg.renderOrder=999,jg.visible=!1,jg.geometry.userData.shared=!0,Jd.add(jg),ig((t,n)=>{if(!jg)return;let r=c.mode===`play`||c.mode===`finish`,i=r?Ag(J,u.reducedMotion):0;t>0?Mg+=(i-Mg)*(1-Math.exp(-(i>Mg?10:3)*t)):r||(Mg=0),jg.visible=Mg>.02;let a=e.uniforms;a.uAmt.value=Math.min(1,Mg),a.uTime.value=n,a.uAspect.value=innerWidth/Math.max(1,innerHeight),a.uTint.value.setHex(J.ability===`cloud`?15398655:16777215)})}var Pg=()=>Mg;function Fg(e,t=!1){let n=e[0].index!==null,r=new Set(Object.keys(e[0].attributes)),i=new Set(Object.keys(e[0].morphAttributes)),a={},o={},s=e[0].morphTargetsRelative,c=new Si,l=0;for(let u=0;u<e.length;++u){let d=e[u],f=0;if(n!==(d.index!==null))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.`),null;for(let e in d.attributes){if(!r.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure "`+e+`" attribute exists among all geometries, or in none of them.`),null;a[e]===void 0&&(a[e]=[]),a[e].push(d.attributes[e]),f++}if(f!==r.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of attributes.`),null;if(s!==d.morphTargetsRelative)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. .morphTargetsRelative must be consistent throughout all geometries.`),null;for(let e in d.morphAttributes){if(!i.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`.  .morphAttributes must be consistent throughout all geometries.`),null;o[e]===void 0&&(o[e]=[]),o[e].push(d.morphAttributes[e])}if(t){let e;if(n)e=d.index.count;else if(d.attributes.position!==void 0)e=d.attributes.position.count;else return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. The geometry must have either an index or a position attribute`),null;c.addGroup(l,e,u),l+=e}}if(n){let t=0,n=[];for(let r=0;r<e.length;++r){let i=e[r].index;for(let e=0;e<i.count;++e)n.push(i.getX(e)+t);t+=e[r].attributes.position.count}c.setIndex(n)}for(let e in a){let t=Ig(a[e]);if(!t)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` attribute.`),null;c.setAttribute(e,t)}for(let e in o){let t=o[e][0].length;if(t===0)break;c.morphAttributes=c.morphAttributes||{},c.morphAttributes[e]=[];for(let n=0;n<t;++n){let t=[];for(let r=0;r<o[e].length;++r)t.push(o[e][r][n]);let r=Ig(t);if(!r)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` morphAttribute.`),null;c.morphAttributes[e].push(r)}}return c}function Ig(e){let t,n,r,i=-1,a=0;for(let o=0;o<e.length;++o){let s=e[o];if(t===void 0&&(t=s.array.constructor),t!==s.array.constructor)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.`),null;if(n===void 0&&(n=s.itemSize),n!==s.itemSize)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.`),null;if(r===void 0&&(r=s.normalized),r!==s.normalized)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.`),null;if(i===-1&&(i=s.gpuType),i!==s.gpuType)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.`),null;a+=s.count*n}let o=new t(a),s=new ci(o,n,r),c=0;for(let t=0;t<e.length;++t){let r=e[t];if(r.isInterleavedBufferAttribute){let e=c/n;for(let t=0,i=r.count;t<i;t++)for(let i=0;i<n;i++){let n=r.getComponent(t,i);s.setComponent(t+e,i,n)}}else o.set(r.array,c);c+=r.count*n}return i!==void 0&&(s.gpuType=i),s}function Lg(e){return Math.min(9.5,1.2+Math.max(0,e)*.3)}function Rg(e,t,n){let r=Math.max(0,Math.min(1,t)),i=e*Math.PI*2,a=Math.sin(i),o=Math.sin(i+Math.PI*.85),s=.95*r;return n.fl=-a*s,n.fr=-Math.sin(i+.35)*s,n.bl=-o*s,n.br=-Math.sin(i+Math.PI*.85+.35)*s,n.pitch=Math.sin(i+Math.PI*.5)*.16*r,n.bob=Math.max(0,Math.sin(i*2-.6))*.085*r,n.stretch=.5+.5*Math.sin(i-.4),n}var zg=()=>({fl:0,fr:0,bl:0,br:0,pitch:0,bob:0,stretch:0}),Bg=e=>1-(1-Math.max(0,Math.min(1,e)))**3,Vg=e=>{let t=Math.max(0,Math.min(1,e));return t*t*(3-2*t)},Hg=e=>e<=0||e>=1?0:Math.sin(e*Math.PI);function Ug(e,t){if(e<=0||t<=0)return 0;if(e>=t)return Math.PI*2;let n=e/t;return Math.PI*2*(n<.5?4*n*n*n:1-(-2*n+2)**3/2)}function Wg(e,t=9,n=6){return e<0?0:Math.exp(-n*e)*Math.cos(e*t*Math.PI*2*.25)}function Gg(e,t,n,r){let i=e[0],a=e[1],o=e[2],s=n.lift,c=n.yaw0??0,l=n.length/Math.max(1,t-1);r[0]=i,r[1]=a,r[2]=o;for(let e=1;e<t;e++){let u=e/(t-1);s+=n.curl*(.4+u*1.2),c+=Math.sin(n.phase-e*.55)*n.sway*(.5+u)+n.bend;let d=Math.cos(s);i+=Math.sin(c)*d*l,a+=Math.sin(s)*l,o-=Math.cos(c)*d*l,r[e*3]=i,r[e*3+1]=a,r[e*3+2]=o}return r}function Kg(e,t,n,r,i,a){let o=t[0]-e[0],s=t[1]-e[1],c=t[2]-e[2];for(let t=0;t<n;t++){let l=t/Math.max(1,n-1),u=Math.sin(l*Math.PI)*(r*Math.sin(i*38)+.06);a[t*3]=e[0]+o*l+u,a[t*3+1]=e[1]+s*l+Math.sin(l*Math.PI)*.12,a[t*3+2]=e[2]+c*l}return a}var qg=(e,t)=>1-Math.exp(-e*Math.max(0,t)),Jg=null;function Yg(){return Jg||(Jg=new fa(new Uint8Array([110,110,110,255,175,175,175,255,228,228,228,255,255,255,255,255]),4,1,Xe),Jg.minFilter=ke,Jg.magFilter=ke,Jg.generateMipmaps=!1,Jg.needsUpdate=!0,Jg)}var Xg=new Map;function Zg(e,t,n={}){let r=`toon:${e}`,i=Xg.get(r);return i||(i=new ks({color:t,gradientMap:Yg(),map:n.map??null}),n.emissive!==void 0&&(i.emissive.setHex(n.emissive),i.emissiveIntensity=n.emissiveIntensity??1),n.transparent&&(i.transparent=!0,i.opacity=n.opacity??1,i.depthWrite=!1),Xg.set(r,i)),i}function Qg(e,t,n=0){let r=`flat:${e}`,i=Xg.get(r);return i||(i=new Qi({color:t,side:n}),Xg.set(r,i)),i}var $g=(e=3810326)=>Qg(`outline${e}`,e,1),e_=new Map;function t_(e,t){let n=e_.get(e);return n||(n=t(),n.userData.shared=!0,e_.set(e,n)),n}var n_=()=>t_(`sphere`,()=>new gs(1,22,16)),r_=()=>t_(`sphereLo`,()=>new gs(1,12,9));function Y(e,t,n,r,i=[1,1,1],a=!0){let o=new K(e,t);return o.position.set(r[0],r[1],r[2]),o.scale.set(i[0],i[1],i[2]),o.castShadow=a,n.add(o),o}function i_(e,t=.07,n){let r=new K(e.geometry,$g(n));return r.scale.setScalar(1+t),r.castShadow=!1,r.userData.outline=!0,e.add(r),r}function a_(e,t){e.traverse(e=>{e.userData.outline&&(e.visible=t)})}var o_=new Map;function s_(e,t,n,r){let i=o_.get(e);if(i)return i;let a=document.createElement(`canvas`);return a.width=t,a.height=n,r(a.getContext(`2d`),t,n),i=new Ra(a),i.colorSpace=Jt,i.wrapS=Ee,i.anisotropy=4,o_.set(e,i),i}function c_(e){let t=e>>>0||1;return()=>(t^=t<<13,t^=t>>>17,t^=t<<5,(t>>>0)/4294967296)}function l_(){let e=new U,t=new U;e.add(t),e.scale.setScalar(.85);let n=Zg(`cloud`,16777215,{emissive:14216447,emissiveIntensity:.35}),r=Zg(`cloudShade`,14675711,{emissive:12113151,emissiveIntensity:.2}),i=n_(),a=[],o=[[0,-.32,.1,.62],[.55,-.36,.35,.45],[-.55,-.36,.35,.45],[.6,-.38,-.35,.48],[-.6,-.38,-.35,.48],[0,-.36,-.7,.5],[0,-.28,.75,.5],[.35,-.55,0,.42],[-.35,-.55,0,.42]];for(let e=0;e<o.length;e++){let[s,c,l,u]=o[e],d=Y(i,e>=7?r:n,t,[s,c,l],[u*1.15,u*.95,u*1.05]);e<7&&i_(d,.05,7049144),a.push(d)}let s=t_(`cloudEar`,()=>new Ka(.16,.34,8).translate(0,.17,0));for(let e of[-1,1]){let r=Y(s,n,t,[e*.26,.02,.88]);r.rotation.z=-e*.35,i_(r,.08,7049144)}let c=Qg(`cloudFace`,5929638),l=t_(`cloudEye`,()=>new _s(.07,.018,4,10,Math.PI));for(let e of[-1,1])Y(l,c,t,[e*.18,-.16,1.27],[1,1,1],!1).rotation.set(0,0,0);let u=Zg(`cloudBlush`,16757702);for(let e of[-1,1])Y(r_(),u,t,[e*.3,-.32,1.13],[.07,.04,.03],!1);let d=t_(`cloudSmile`,()=>new _s(.045,.014,4,10,Math.PI));for(let e of[-1,1]){let n=Y(d,c,t,[e*.045,-.3,1.29],[1,1,1],!1);n.rotation.z=Math.PI}let f=[];for(let e=0;e<4;e++){let r=e*.7;f.push(Y(i,n,t,[Math.sin(r)*.12,-.15+e*.18,-1.05-Math.cos(r)*.12-e*.05],[.2-e*.03,.2-e*.03,.2-e*.03]))}return{root:e,animate(e,n,r,i,s){for(let e=0;e<a.length;e++){let t=1+Math.sin(n*3.2+e*1.7)*.05,r=o[e][3];a[e].scale.set(r*1.15*t,r*.95*(2-t),r*1.05*t)}for(let e=0;e<f.length;e++)f[e].position.x=Math.sin(n*4-e*.8)*(.08+e*.04);let c=r;t.scale.set(1+c*.18,1-c*.25,1+c*.1),t.position.y=Math.sin(n*2.3)*.05-c*.08,t.rotation.z=-i*.22,t.rotation.x=Math.sin(n*1.7)*.03-Math.min(.12,s*.003)}}}function u_(){let e=new U,t=new U;e.add(t),i_(Y(t_(`leaf`,()=>{let e=new To;e.moveTo(0,-.85),e.bezierCurveTo(.55,-.55,.62,.35,0,.95),e.bezierCurveTo(-.62,.35,-.55,-.55,0,-.85);let t=new ls(e,{depth:.04,bevelEnabled:!0,bevelThickness:.025,bevelSize:.03,bevelSegments:2,curveSegments:16});return t.rotateX(-Math.PI/2),t.rotateY(Math.PI),t.translate(0,-.06,0),t}),Zg(`leaf`,5816890),t,[0,0,0]),.04,2054676),Y(t_(`leafRib`,()=>new Ha(.035,.02,1.55)),Zg(`leafRib`,12120186),t,[0,.005,.02],[1,1,1],!1);let n=t_(`leafVein`,()=>new Ha(.02,.015,.42));for(let e=0;e<4;e++)for(let r of[-1,1]){let i=Y(n,Zg(`leafRib`,12120186),t,[r*.16,.004,-.45+e*.32],[1,1,1],!1);i.rotation.y=r*.75}return Y(t_(`leafStalk`,()=>new Ga(.03,.04,.4,6).rotateX(Math.PI/2+.25)),Zg(`leafStalk`,4165418),t,[0,0,-1]),t.scale.setScalar(1.3),{root:e,animate(e,n,r,i){t.rotation.x=Math.sin(n*3.1)*.05-.04-Math.min(.06,i*.002),t.rotation.z=-r*.2+Math.sin(n*2.3)*.04,t.position.y=Math.sin(n*4.2)*.03}}}function d_(){let e=l_(),t=9;return{root:e.root,animate(n,r,i){i.action===`hop`&&(t=0),t+=n,e.animate(n,r,Hg(Math.min(1,t/.3)),0,i.speed)}}}function f_(){let e=u_();return{root:e.root,animate(t,n,r){e.animate(t,n,0,r.speed)}}}var p_={orange:16225594,orangeDark:13590300,white:16775148,pink:16752820,nose:16743058,eye:2759188},m_=.42,h_=16,g_=[0,.1,-.31];function __(e,t,n){let r=c_(7);e.fillStyle=`#f7953a`,e.fillRect(0,0,t,n);for(let i=0;i<2600;i++)e.fillStyle=r()<.5?`rgba(255,200,120,0.22)`:`rgba(190,90,20,0.14)`,e.fillRect(r()*t,r()*n,2,5);e.fillStyle=`#cf5f1c`;for(let i=0;i<12;i++){let a=i/12*t+r()*8,o=9+r()*7;e.beginPath(),e.moveTo(a,0);for(let t=0;t<=n*.62;t+=10)e.lineTo(a+Math.sin(t*.06+i)*7,t);for(let t=Math.floor(n*.62);t>=0;t-=10)e.lineTo(a+o*(1-t/(n*.75))+Math.sin(t*.06+i)*7,t);e.closePath(),e.fill()}let i=e.createLinearGradient(0,n*.62,0,n*.78);i.addColorStop(0,`rgba(255,247,236,0)`),i.addColorStop(1,`rgba(255,247,236,1)`),e.fillStyle=i,e.fillRect(0,n*.62,t,n*.38)}function v_(e,t,n){let r=c_(9);e.fillStyle=`#f7953a`,e.fillRect(0,0,t,n);for(let i=0;i<1800;i++)e.fillStyle=r()<.5?`rgba(255,200,120,0.22)`:`rgba(190,90,20,0.12)`,e.fillRect(r()*t,r()*n,2,5);e.fillStyle=`#cf5f1c`;let i=(t,n,r,i)=>{e.beginPath(),e.moveTo(t-i/2,n),e.quadraticCurveTo(t+i*.4,(n+r)/2,t,r),e.quadraticCurveTo(t+i*.9,(n+r)/2,t+i/2,n),e.closePath(),e.fill()};for(let e=-1;e<=1;e++)i(t*.25+e*20,n*.04,n*(e===0?.36:.3),12);for(let e=-3;e<=3;e++)i(t*.75+e*26,0,n*(.52-Math.abs(e)*.04),16);for(let r of[-1,1])for(let i=0;i<2;i++)e.fillRect(t*.25+r*(70+i*14)-4,n*(.45+i*.07),26,5);let a=e.createLinearGradient(0,n*.62,0,n*.78);a.addColorStop(0,`rgba(255,247,236,0)`),a.addColorStop(1,`rgba(255,247,236,1)`),e.fillStyle=a,e.fillRect(0,n*.62,t,n*.38)}function y_(e,t,n){let r=e.createRadialGradient(t/2,n/2,0,t/2,n/2,t/2);r.addColorStop(0,`rgba(40,30,20,0.55)`),r.addColorStop(.6,`rgba(40,30,20,0.3)`),r.addColorStop(1,`rgba(40,30,20,0)`),e.fillStyle=r,e.fillRect(0,0,t,n)}var b_=[`hipY`,`pitch`,`roll`,`yaw`,`sx`,`sy`,`sz`,`fl`,`fr`,`bl`,`br`,`splay`,`knee`,`headPitch`,`headYaw`,`headRoll`,`ears`,`tLift`,`tCurl`,`tSway`,`tBend`,`tYaw`,`tLen`,`eyeOpen`,`mouth`],x_=()=>({hipY:m_,pitch:0,roll:0,yaw:0,sx:1,sy:1,sz:1,fl:0,fr:0,bl:0,br:0,splay:0,knee:0,headPitch:0,headYaw:0,headRoll:0,ears:0,tLift:1.15,tCurl:.05,tSway:.1,tBend:0,tYaw:0,tLen:.78,eyeOpen:1,mouth:0}),S_=zg(),C_=new Float32Array(48),w_=new Float32Array(48),T_={lift:1,curl:0,sway:0,phase:0,length:.78,bend:0,yaw0:0},E_=new qn,D_=new Cn,O_=new H,k_=new H,A_=new H,j_=new H(0,0,1),M_=new H,N_=[0,0,0],P_=new W(13227238),F_=new W(16777215),I_=class{root=new U;hip=new U;head=new U;neck=new U;legs=[];ears=[];eyes=[];mouth;tail;tailOutline;blob;cloud=l_();leaf=u_();furMat;pose=x_();tgt=x_();phase=0;lastLand=99;squash=0;squashT=9;blinkT=2;moodT=9;mood=``;chase=!1;lookBackT=9;glanceT=9;flickT=9;finishT=0;plantS=0;plantX=0;vaultWas=!1;cloudHop=0;lastY=0;wetK=0;offs=[];pawW=[new H,new H,new H,new H];tailTipW=new H;stormW=new H;storm=new U;state=`run`;constructor(){let e=n_(),t=Zg(`mochiFur`,16777215,{map:s_(`mochiFur`,512,256,__)}).clone();t.userData.shared=!1,this.furMat=t;let r=Zg(`mochiOrange`,p_.orange),i=Zg(`mochiWhite`,p_.white),a=Zg(`mochiPink`,p_.pink),o=Zg(`mochiNose`,p_.nose),s=Qg(`mochiEye`,p_.eye),c=Qg(`mochiEyeHi`,16777215);this.root.add(this.hip),this.hip.position.y=m_,i_(Y(e,t,this.hip,[0,0,-.03],[.25,.23,.35]),.06),Y(e,i,this.hip,[0,-.08,.02],[.2,.15,.29]),i_(Y(e,i,this.hip,[0,.03,.22],[.17,.19,.13]),.06);for(let n of[-1,1])i_(Y(e,t,this.hip,[n*.13,-.02,-.2],[.12,.15,.15]),.08);this.neck.position.set(0,.2,.25),this.hip.add(this.neck),this.neck.add(this.head),i_(Y(e,Zg(`mochiHead`,16777215,{map:s_(`mochiHead`,512,256,v_)}),this.head,[0,.14,.03],[.34,.29,.3]),.05);for(let n of[-1,1]){Y(e,i,this.head,[n*.09,.03,.25],[.12,.09,.085]),Y(r_(),Zg(`mochiBlush`,16752562),this.head,[n*.21,.08,.2],[.055,.03,.025],!1);let r=Y(e,t,this.head,[n*.31,.03,-.01],[.09,.07,.1]);r.rotation.z=n*.6}Y(e,i,this.head,[0,-.02,.21],[.1,.07,.09]),Y(e,o,this.head,[0,.105,.335],[.04,.028,.025],!1),this.mouth=Y(e,Qg(`mochiMouth`,6954794),this.head,[0,0,.31],[.04,0,.02],!1);for(let t of[-1,1]){let n=Y(e,s,this.head,[t*.13,.165,.285],[.085,.105,.06],!1);this.eyes.push(n),Y(e,c,n,[.3,.35,.75],[.36,.3,.3],!1),Y(e,c,n,[-.25,-.4,.8],[.16,.14,.2],!1);let i=new U;i.position.set(t*.18,.35,-.01),i.rotation.z=-t*.32,this.head.add(i),i_(Y(t_(`mochiEar`,()=>new Ka(.105,.24,4).rotateY(Math.PI/4).translate(0,.1,0)),r,i,[0,0,0],[1,1,.55]),.1),Y(t_(`mochiEarIn`,()=>new Ka(.065,.16,4).rotateY(Math.PI/4).translate(0,.08,0)),a,i,[0,0,.03],[1,1,.5],!1),this.ears.push(i);for(let e=0;e<2;e++){let n=Y(t_(`whisker`,()=>new Ga(.004,.004,.22,3).rotateZ(Math.PI/2)),Qg(`whisker`,16777215),this.head,[t*.24,.05+e*.035,.27],[1,1,1],!1);n.rotation.z=t*(e-.5)*.3,n.rotation.y=-t*.25}}let l=t_(`mochiUpper`,()=>new Ga(.06,.055,.16,8).translate(0,-.08,0)),u=t_(`mochiLower`,()=>new Ga(.052,.048,.15,8).translate(0,-.075,0)),d=t_(`mochiClaws`,()=>{let e=[];for(let t=-1;t<=1;t++){let n=new Ka(.014,.07,4).rotateX(Math.PI/2+.5);n.translate(t*.03,-.02,.08),e.push(n)}return Fg(e)}),f=Qg(`claw`,16777215);for(let[n,r]of[[!0,1],[!0,-1],[!1,1],[!1,-1]]){let a=new U;a.position.set(r*(n?.1:.12),-.09,n?.18:-.2),this.hip.add(a),Y(l,t,a,[0,0,0]);let o=new U;o.position.y=-.15,a.add(o),Y(u,n?i:t,o,[0,0,0]);let s=Y(e,i,o,[0,-.15,.025],[.065,.045,.085]);i_(s,.12);let c=Y(d,f,o,[0,-.15,0],[1,1,1],!1);c.visible=!1,this.legs.push({pivot:a,knee:o,claws:c,paw:s})}let p=Zg(`mochiTail`,16777215);this.tail=new xa(r_(),p,h_),this.tail.castShadow=!0,this.tail.frustumCulled=!1;let m=new W(p_.orange),h=new W(p_.orangeDark),g=new W(p_.white);for(let e=0;e<h_;e++)this.tail.setColorAt(e,e>=13?g:e%3==2?h:m);this.tail.instanceMatrix.setUsage(en),this.hip.add(this.tail),this.tailOutline=new xa(t_(`sphereLoOut`,()=>new gs(1.16,12,9)),Qg(`outline3a2416`,3810326,1),h_),this.tailOutline.instanceMatrix=this.tail.instanceMatrix,this.tailOutline.frustumCulled=!1,this.tailOutline.userData.outline=!0,this.hip.add(this.tailOutline),this.root.add(this.cloud.root,this.leaf.root);let _=Zg(`storm`,10135226),v=Zg(`stormD`,8226972);for(let[t,n,r,i]of[[0,0,0,.22],[.2,-.03,.02,.17],[-.2,-.02,-.01,.18],[.08,.1,-.05,.16]])i_(Y(e,n>.05||t===0?_:v,this.storm,[t,n,r],[i*1.2,i*.9,i]),.08,4870754);this.storm.position.set(0,1.5,.05),this.storm.visible=!1,this.root.add(this.storm),this.cloud.root.visible=!1,this.leaf.root.visible=!1,this.blob=new K(t_(`blob`,()=>new ms(1,1).rotateX(-Math.PI/2)),new Qi({map:s_(`blob`,64,64,y_),transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-2})),this.blob.scale.set(.75,1,1.05),this.blob.renderOrder=1,this.root.add(this.blob),a_(this.root,af()===`high`),this.offs.push(n.on(`qualityChange`,e=>a_(this.root,e.quality===`high`)),n.on(`react`,e=>{this.mood=e.mood,this.moodT=0}),n.on(`chase`,e=>{this.chase=e.on,this.lookBackT=1.2}),n.on(`nearMiss`,()=>this.glanceT=0),n.on(`bell`,()=>this.glanceT=0),n.on(`react`,e=>{e.mood===`nom`&&(this.flickT=0)}),n.on(`stageStart`,()=>{this.chase=!1,this.finishT=0}))}dispose(){for(let e of this.offs)e();this.offs.length=0,this.furMat.dispose(),this.blob.material.dispose(),this.tail.dispose()}animate(e,t,n){let r=Math.min(.05,Math.max(0,e)),i=this.tgt,a=this.pose;n.sinceLand<this.lastLand&&n.sinceLand<.1&&(this.squash=Math.min(1,.25+n.landImpact/26),this.squashT=0),this.lastLand=n.sinceLand,this.squashT+=r,this.moodT+=r,this.lookBackT+=r,this.glanceT+=r,this.flickT+=r;let o=n.mode===`finish`?Math.max(0,n.speed):n.speed,s=n.surface===`wall`&&n.grounded;this.phase=(this.phase+r*Lg(o)*(s?1.35:1))%1e3;let l=Math.min(1,o/12)*(s?1.1:1);Rg(this.phase,l,S_),i.hipY=m_+S_.bob,i.pitch=S_.pitch,i.roll=n.lean*.28,i.yaw=-n.lean*.12,i.sx=1,i.sy=1-S_.stretch*.04*l,i.sz=1+S_.stretch*.06*l,i.fl=S_.fl,i.fr=S_.fr,i.bl=S_.bl,i.br=S_.br,i.splay=0,i.knee=.25*l,i.headPitch=-S_.pitch*.8+.05,i.headYaw=-n.lean*.35,i.headRoll=n.lean*.1,i.ears=.15*l,i.tLift=.7-l*.2,i.tCurl=.09,i.tSway=.08+l*.05,i.tBend=.02-n.lean*.04,i.tYaw=.95,i.tLen=.78,i.eyeOpen=1,i.mouth=0;let u=0,d=16,f=`run`,p=!1,m=!1,h=0,g=0;if(n.mode===`finish`?this.finishT+=r:this.finishT=0,n.ability===`cloud`){f=`cloud`,p=!0;let e=Math.max(0,n.y-J.base);i.hipY=.27+Math.sin(t*2.3)*.02,i.pitch=-.55,i.fl=.5,i.fr=.5,i.bl=-1.35,i.br=-1.35,i.knee=.1,i.splay=.12,i.headPitch=.42+Math.sin(t*1.3)*.05,i.headYaw=-n.lean*.5+Math.sin(t*.7)*.2,i.tLift=-.35,i.tCurl=.05,i.tBend=.16,i.tSway=.04,i.ears=0,i.roll=n.lean*.18,i.yaw=0,(e>.12||!n.grounded)&&(i.fl=-2.5+Math.sin(t*14)*.15,i.fr=-2.5-Math.sin(t*14)*.15,i.mouth=1,i.tLift=.6),this.cloudHop=Math.max(0,this.cloudHop-r*3),n.grounded&&this.lastY>J.base+.05&&(this.cloudHop=1),this.cloud.root.position.y=-e-.24,this.cloud.animate(r,t,Hg(1-this.cloudHop),n.lean,n.speed)}else if(n.ability===`vault`){f=`vault`,this.vaultWas||(this.plantS=J.arc.s0+.4,this.plantX=n.x);let e=n.abilityT;h=e<.06?Vg(e/.06):e<.42?1:1-Bg((e-.42)/.16),e<.45?(i.pitch=-.45+e*.6,i.fl=-1.3,i.fr=-1.15,i.bl=1.2,i.br=1.1,i.sz=1.15,i.sy=.92,i.headPitch=.25,i.ears=.8,i.mouth=.7):e<.82?(f=`vault-flip`,u=Ug((e-.45)/.37,1),i.fl=1.2,i.fr=1.2,i.bl=-1.4,i.br=-1.4,i.knee=1,i.sx=.92,i.sy=.9,i.sz=.88,i.headPitch=.5,i.tCurl=.4,i.tLift=-.4,d=30):(i.pitch=.15,i.fl=-.7,i.fr=-.6,i.bl=.4,i.br=.35,i.tLift=1.2,i.mouth=.4),i.eyeOpen=1.15}else if(n.surface===`river`&&n.mode===`run`){f=`surf`,m=!0;let e=Math.sin(t*2.6)*.1;i.yaw=.55,i.headYaw=-.5-n.lean*.3,i.roll=e+n.lean*.38,i.pitch=.05,i.hipY=.36+Math.sin(t*4.2)*.02,i.fl=-.45,i.fr=-.35,i.bl=.45,i.br=.4,i.splay=.22,i.knee=.45,i.tLift=.85,i.tBend=-(e+n.lean*.3)*.35,i.tSway=.18,i.ears=.3,i.headRoll=-e*.6,n.grounded||(i.fl=-1,i.fr=-1,i.mouth=.6),this.leaf.root.position.y=-n.y+.02,this.leaf.root.rotation.y=.3,this.leaf.animate(r,t,n.lean,n.speed)}else if(n.sliding)f=`slide`,i.hipY=.22,i.pitch=-.08,i.fl=-1.5,i.fr=-1.45,i.bl=1.5,i.br=1.45,i.knee=0,i.sx=1.05,i.sy=.78,i.sz=1.15,i.headPitch=-.15,i.ears=.9,i.tLift=.05,i.tCurl=-.01,i.tSway=.25,i.mouth=.3,d=24;else if(n.grounded)s&&(f=`wall`,i.hipY=.36+S_.bob,i.pitch=.12+S_.pitch,i.ears=.7,i.tLift=.55,i.tSway=.16,i.headPitch=-.1,i.mouth=.25);else{if(f=`air`,g=+(n.sincePounce<.42),g)f=`pounce`,u=Ug(n.sincePounce,.42),i.fl=1.1,i.fr=1.1,i.bl=-1.3,i.br=-1.3,i.knee=1.1,i.sx=.92,i.sy=.88,i.sz=.86,i.headPitch=.55,i.tCurl=.42,i.tLift=-.5,i.mouth=.8,d=34;else if(n.vy>0){let e=Math.min(1,n.vy/14);i.pitch=-.3*e,i.fl=-1,i.fr=-.85,i.bl=.95,i.br=.85,i.knee=.2,i.sy=1+.12*e,i.sx=1-.06*e,i.sz=1-.05*e,i.tLift=.35,i.tCurl=.08,i.headPitch=.15,i.ears=.4}else{let e=Math.min(1,-n.vy/20);i.pitch=.12*e,i.fl=-.55,i.fr=-.5,i.bl=.25,i.br=.2,i.knee=.3,i.sy=1+.1*e,i.sx=1-.05*e,i.tLift=1.3,i.tCurl=.02,i.ears=.3+.6*e,i.headPitch=-.1}d=18}if(f===`slide`||f===`pounce`||f===`vault`||f===`vault-flip`||f===`cloud`?i.tYaw=0:f===`surf`&&(i.tYaw=.2),n.mode===`finish`&&n.speed<6){f=`victory`;let e=Vg(this.finishT/.9),n=Hg(this.finishT*1.4%1*1.6);i.yaw=Math.PI*e,i.hipY=.47+n*.14*e,i.pitch=-.85*e,i.bl=-.9*e,i.br=-.9*e,i.fl=-2.4*e+Math.sin(t*13)*.35*e,i.fr=-.4*e,i.headPitch=.6*e,i.headYaw=Math.sin(t*2)*.15,i.headRoll=Math.sin(t*2.6)*.15,i.tLift=1.3,i.tSway=.25,i.mouth=.6,i.eyeOpen=.3,i.roll=0}if(n.sinceHit<.55&&n.mode!==`finish`){let e=Hg(n.sinceHit/.55);f=`hit`,i.pitch-=.6*e,i.fl=-1.6*e+i.fl*(1-e),i.fr=-1.4*e+i.fr*(1-e),i.splay=.4*e,i.ears=1,i.eyeOpen=.12,i.mouth=1,i.roll+=Math.sin(t*40)*.2*e,d=30}if(this.wetK+=(+(n.wet>0)-this.wetK)*qg(n.wet>0?8:1.5,r),this.wetK>.02){let e=+(t%.85<.32);i.sx*=1-.1*this.wetK,i.ears=Math.max(i.ears,1*this.wetK),i.tLift-=.5*this.wetK,e&&n.wet>0&&(i.headYaw+=Math.sin(t*62)*.5,i.roll+=Math.sin(t*58)*.18,i.eyeOpen=.15),f===`run`&&(f=`wet`)}if(this.furMat.color.copy(F_).lerp(P_,this.wetK*.8),this.storm.visible=this.wetK>.03,this.storm.visible){let e=this.wetK;this.storm.scale.setScalar(e*(1+Math.sin(t*6)*.04)),this.storm.position.set(Math.sin(t*2.2)*.06,1.45+Math.sin(t*3.1)*.04,.1),this.storm.rotation.z=Math.sin(t*2.7)*.08}if(this.squashT<.5){let e=Wg(this.squashT,3.2,9)*this.squash;i.sy-=e*.32,i.sx+=e*.18,i.sz+=e*.12,i.hipY-=Math.max(0,e)*.12}if(this.chase&&n.mode===`run`&&f===`run`&&(this.lookBackT>2.6&&(this.lookBackT=0),this.lookBackT<.55)){let e=Hg(this.lookBackT/.55);i.headYaw+=1.7*e,i.headRoll+=.2*e,i.eyeOpen=1.35,i.mouth=Math.max(i.mouth,.8*e),i.ears=.9}if(this.chase&&n.mode!==`finish`&&(i.ears=Math.max(i.ears,.95)),this.glanceT<.42&&n.mode!==`finish`&&f!==`victory`){let e=Hg(this.glanceT/.42);i.headYaw+=2.1*e*(n.x>0?-1:1),i.headPitch+=.25*e,i.eyeOpen=1.45,i.mouth=Math.max(i.mouth,.7*e),i.ears=Math.min(i.ears,.2)}if(this.flickT<.45){let e=Hg(this.flickT/.45);i.tLift+=.6*e,i.tSway+=.5*e,i.tCurl+=.3*e}this.moodT<.7&&((this.mood===`nom`||this.mood===`happy`||this.mood===`wow`)&&(i.eyeOpen=Math.min(i.eyeOpen,this.mood===`wow`?1.3:.3)),this.mood===`wow`&&(i.mouth=Math.max(i.mouth,.7)),this.mood===`scared`&&(i.eyeOpen=1.35,i.ears=1)),this.blinkT-=r,this.blinkT<0&&(this.blinkT=2+Math.random()*2.5),this.blinkT<.09&&(i.eyeOpen=Math.min(i.eyeOpen,.08));let _=qg(d,r);for(let e=0;e<b_.length;e++){let t=b_[e];a[t]+=(i[t]-a[t])*(t===`eyeOpen`?qg(30,r):t===`yaw`&&f===`victory`?qg(5,r):_)}if(r===0)for(let e=0;e<b_.length;e++)a[b_[e]]=i[b_[e]];let v=this.hip;v.position.y=a.hipY,v.rotation.set(a.pitch+u,a.yaw,a.roll,`YXZ`),v.scale.set(a.sx,a.sy,a.sz),this.neck.rotation.set(a.headPitch,a.headYaw,a.headRoll,`YXZ`);let y=this.legs;y[0].pivot.rotation.set(a.fl,0,-a.splay),y[1].pivot.rotation.set(a.fr,0,a.splay),y[2].pivot.rotation.set(a.bl,0,-a.splay*.7),y[3].pivot.rotation.set(a.br,0,a.splay*.7);for(let e=0;e<4;e++){let t=e<2,n=y[e].pivot.rotation.x;y[e].knee.rotation.x=t?Math.max(0,n)*.9+a.knee*.6:-Math.max(0,-n)*.4-a.knee*.3+Math.max(0,n)*.5,y[e].claws.visible=f===`wall`&&t}for(let e=0;e<2;e++){let n=this.ears[e],r=e===0?-1:1,i=Math.sin(t*2.9+e*2)>.985?.35:0;n.rotation.set(-a.ears*.9-i,0,-r*(.32+a.ears*.35))}let b=Math.max(.06,a.eyeOpen);for(let e of this.eyes)e.scale.set(.085*(b>1?1+(b-1)*.5:1),.105*b,.06);let x=Math.max(0,a.mouth);if(this.mouth.scale.set(.035+x*.015,x*.05,.02),this.mouth.visible=x>.05,T_.lift=a.tLift,T_.curl=a.tCurl,T_.sway=a.tSway,T_.bend=a.tBend,T_.length=a.tLen,T_.yaw0=a.tYaw,T_.phase=t*5.5,Gg(g_,h_,T_,C_),this.vaultWas=n.ability===`vault`,h>.001&&c.track){this.root.updateMatrixWorld(!0),c.track.toWorld(this.plantS,this.plantX,0,M_),v.worldToLocal(M_),N_[0]=M_.x,N_[1]=M_.y,N_[2]=M_.z,C_[45],C_[46],C_[47];let e=n.abilityT;Kg(g_,N_,h_,e>.42?.18*Math.max(0,1-(e-.42)*4):.05,t,w_);for(let e=0;e<48;e++)C_[e]+=(w_[e]-C_[e])*h}let S=1;h>0&&(S=1+h*.35);for(let e=0;e<h_;e++){let t=e<15?e:e-1;O_.set(C_[t*3],C_[t*3+1],C_[t*3+2]),k_.set(C_[t*3+3],C_[t*3+4],C_[t*3+5]);let n=O_.distanceTo(k_);k_.sub(O_),k_.lengthSq()<1e-8&&k_.set(0,0,-1),k_.normalize(),D_.setFromUnitVectors(j_,k_);let r=e/15,i=(.068-r*.02)*S*(r>.82?1.08:1);A_.set(i,i,Math.max(i*1.35,n*.85)),O_.set(C_[e*3],C_[e*3+1],C_[e*3+2]),E_.compose(O_,D_,A_),this.tail.setMatrixAt(e,E_)}this.tail.instanceMatrix.needsUpdate=!0,this.cloud.root.visible=p,this.leaf.root.visible=m;let C=n.surface!==`gap`&&n.surface!==`cloud`&&n.ability!==`cloud`;if(this.blob.visible=C&&n.y<6,this.blob.visible){this.blob.position.y=-n.y+.03;let e=1/(1+n.y*.35);this.blob.scale.set(.8*e,1,1.1*e),this.blob.material.opacity=Math.min(1,e*1.1)}this.lastY=n.y,this.state=f,this.root.updateMatrixWorld(!0);for(let e=0;e<4;e++)this.legs[e].paw.getWorldPosition(this.pawW[e]);O_.set(C_[45],C_[46],C_[47]),this.tailTipW.copy(O_).applyMatrix4(v.matrixWorld),this.storm.getWorldPosition(this.stormW)}};function L_(){return new I_}var R_={ground:14927771,bridge:12753510,wall:14070922,river:15268863,cloud:16777215,gap:14927771},z_={fish:[10479871,16777215,6082559],bell:[16765503,16777215,16756736],yarn:[16744099,16777215,16732038],treat:[16757596,16773577,16747069],food:[16769184,16777215,16757596]},B_=new H,V_=new H,H_=()=>c.mode===`play`||c.mode===`finish`,U_=()=>{let e=zp();return e instanceof I_?e:null};function W_(e,t,n,r,i,a,o,s=.85){let c=J.world,l=J.speed*.9;for(let u=0;u<Math.min(12,t);u++){let t=Math.random()*Math.PI*2,u=r*(.4+Math.random()*.6),d=Math.cos(t)*u,f=Math.abs(Math.sin(t))*u+.5;Jm(e.x-c.fwd.x*.3,e.y,e.z-c.fwd.z*.3,c.right.x*d+c.fwd.x*(l-1.5)+c.up.x*f,c.right.y*d+c.fwd.y*l+c.up.y*f,c.right.z*d+c.fwd.z*(l-1.5)+c.up.z*f,i*(.6+Math.random()*.6),a*(.7+Math.random()*.6),n,o,s)}}function G_(e,t,n,r=.32,i=.55){let a=J.world;for(let o=0;o<e;o++){let s=o/e*Math.PI*2+Math.random()*.4,c=Math.cos(s)*n,l=Math.sin(s)*n;Jm(a.pos.x+a.right.x*c*.05,a.pos.y+.08,a.pos.z+a.right.z*c*.05,a.right.x*c+a.fwd.x*l*.6+a.up.x*.8,a.right.y*c+a.fwd.y*l*.6+.8+Math.random(),a.right.z*c+a.fwd.z*l*.6+a.up.z*.8,.45+Math.random()*.25,r*(.7+Math.random()*.6),t,2,i)}}var K_=0,q_=0,J_=0,Y_=0,X_=0,Z_=0;function Q_(){Ng(),n.on(`land`,e=>{H_()&&(J.surface===`river`?Ym(B_.copy(J.world.pos).addScaledVector(J.world.up,.1),14,15268863,5,.5,.22,14,1.2):J.ability===`cloud`?G_(8,16777215,2.5,.5):e.impact>5&&G_(Math.min(16,5+Math.floor(e.impact/2.5)),R_[J.surface]??R_.ground,2+e.impact*.12))}),n.on(`jump`,()=>{H_()&&!J.ability&&G_(5,J.surface===`river`?15268863:R_[J.surface]??R_.ground,1.8,.26)}),n.on(`pounce`,()=>{if(!H_())return;let e=J.world,t=J.speed*.85;for(let n=0;n<10;n++){let r=n/10*Math.PI*2,i=Math.cos(r)*3.5,a=Math.sin(r)*3.5;B_.copy(e.pos).addScaledVector(e.up,.5),Jm(B_.x,B_.y,B_.z,e.right.x*i+e.fwd.x*t,a+e.fwd.y*t,e.right.z*i+e.fwd.z*t,.25,.16,16777215,0)}}),n.on(`pickup`,e=>{if(c.mode!==`play`&&c.mode!==`finish`)return;let t=z_[e.kind]??z_.treat;B_.set(e.x,e.y,e.z),B_.lengthSq()===0&&B_.copy(J.world.pos).addScaledVector(J.world.up,.8);let n=e.kind===`bell`;W_(B_,n?8:4,t[0],n?5:3,n?.6:.4,n?.14:.09,2),W_(B_,n?4:2,t[1],n?3.5:2.5,.45,.07,0)}),n.on(`abilityStart`,e=>{H_()&&(e.id===`cloud`?(B_.copy(J.world.pos).addScaledVector(J.world.up,-.2),Ym(B_,26,16777215,6,.8,.7,0,.2),Ym(B_,10,14479359,3,1,.9,0,.5)):e.id===`vault`&&G_(8,14271386,3,.26,.45))}),n.on(`abilityEnd`,e=>{H_()&&e.id===`cloud`&&Ym(B_.copy(J.world.pos),18,16777215,5,.7,.6,0,.3)}),n.on(`hit`,()=>{H_()&&(B_.copy(J.world.pos).addScaledVector(J.world.up,.9),W_(B_,10,16773242,5,.6,.16,3,.9),W_(B_,5,16777215,3,.5,.13,0,.8))}),n.on(`wet`,()=>{H_()&&W_(B_.copy(J.world.pos).addScaledVector(J.world.up,.1),10,10475775,4,.5,.13,14,.75)}),n.on(`nearMiss`,()=>{if(!H_())return;let e=J.world;for(let t=0;t<6;t++){let n=t%2?1:-1;Jm(e.pos.x+e.right.x*n*.7+e.up.x*(.3+t*.12),e.pos.y+.3+t*.12,e.pos.z+e.right.z*n*.7+e.up.z*(.3+t*.12),-e.fwd.x*14,-e.fwd.y*14,-e.fwd.z*14,.22,.18,16777215,0)}}),ig(e=>{if(e<=0||!H_())return;let t=U_(),n=J.world,r=u.reducedMotion;if(J.grounded&&J.mode!==`finish`&&J.ability!==`cloud`&&J.surface!==`river`&&J.speed>8){K_+=e;let r=J.sliding?.02:.075;for(;K_>r;){K_-=r;let e=t?Math.random()<.5?t.pawW[2]:t.pawW[3]:n.pos,i=R_[J.surface]??R_.ground,a=(Math.random()-.5)*2;Jm(e.x,e.y+.05,e.z,-n.fwd.x*2+n.right.x*a*(J.sliding?3:.8),1+Math.random()*(J.sliding?2.5:1),-n.fwd.z*2+n.right.z*a*(J.sliding?3:.8),J.sliding?.45:.4,J.sliding?.34:.22,i,3)}}if(t&&J.surface===`wall`&&J.grounded)for(q_+=e;q_>.022;){q_-=.022;let e=t.pawW[Math.random()<.5?0:1],r=J.speed*.8,i=(Math.random()-.5)*6;Jm(e.x,e.y,e.z,n.fwd.x*r+n.right.x*i+n.up.x*2.5,n.fwd.y*r+n.right.y*i+n.up.y*2.5+Math.random()*2,n.fwd.z*r+n.right.z*i+n.up.z*2.5,.22,.13,Math.random()<.45?16757575:Math.random()<.6?16774072:16777215,10),Math.random()<.35&&Jm(e.x,e.y+.03,e.z,0,0,0,.45,.07,16774880,0,.7)}if(J.wet>0){J_+=e;let r=performance.now()/1e3%.85<.32,i=r?.012:.03;for(;J_>i;)if(J_-=i,t&&Math.random()<.6){V_.copy(t.stormW).addScaledVector(n.right,(Math.random()-.5)*.45).addScaledVector(n.fwd,(Math.random()-.5)*.3),V_.y-=.12;let e=J.speed*.95;Jm(V_.x,V_.y,V_.z,n.fwd.x*e,-3,n.fwd.z*e,.3,.12,7324927,10)}else{V_.copy(n.pos).addScaledVector(n.up,.45+Math.random()*.4).addScaledVector(n.right,(Math.random()-.5)*.5);let e=r?5:.3,t=Math.random()<.5?-1:1,i=J.speed*.6;Jm(V_.x,V_.y,V_.z,n.right.x*t*e+n.fwd.x*i,r?2:0,n.right.z*t*e+n.fwd.z*i,.45,.15,9425151,18)}}if(J.sincePounce<.35&&!r)for(Z_+=e;Z_>.012;){Z_-=.012,V_.copy(n.pos).addScaledVector(n.up,.45);let e=J.speed*.7;Jm(V_.x,V_.y,V_.z,n.fwd.x*e,n.fwd.y*e,n.fwd.z*e,.18,.22,Math.random()<.5?16756838:16773856,0)}if(J.surface===`river`&&J.grounded&&J.ability!==`cloud`)for(Y_+=e;Y_>.018;){Y_-=.018;let e=Math.random()<.5?-1:1;V_.copy(n.pos).addScaledVector(n.right,e*.65).addScaledVector(n.fwd,-.3-Math.random()*.5);let t=2+Math.random()*2.5+Math.abs(J.lean)*3*(Math.sign(J.lean)===e?1:.3),r=J.speed*.55;Jm(V_.x,V_.y+.05,V_.z,n.right.x*e*t+n.fwd.x*r,2.5+Math.random()*2.5,n.right.z*e*t+n.fwd.z*r,.42,.12+Math.random()*.1,Math.random()<.7?15924735:11069183,12)}if(J.ability===`cloud`)for(X_+=e;X_>.06;){X_-=.06;let e=J.y-J.base;V_.copy(n.pos).addScaledVector(n.up,-e-.4).addScaledVector(n.fwd,-.9).addScaledVector(n.right,(Math.random()-.5)*1.4);let t=J.speed*.8;Jm(V_.x,V_.y,V_.z,n.fwd.x*t,n.fwd.y*t-.6,n.fwd.z*t,.6,.3+Math.random()*.2,16777215,.5)}})}var $_=14854234,ev=12088114,tv=16773334,nv=4860434,rv=class{root=new U;body=new U;head=new U;jaw=new U;ears=[];legs=[];tail=[];tongue;phase=0;action=`run`;actT=0;gaitT=zg();roll=0;constructor(){let e=n_(),t=Zg(`dogCoat`,$_),n=Zg(`dogDark`,ev),r=Zg(`dogCream`,tv),i=Zg(`dogNose`,2759188),a=Zg(`dogTongue`,16740238);this.root.add(this.body),this.body.position.y=1.9,i_(Y(e,t,this.body,[0,0,-.1],[.95,.9,1.55]),.04,nv),i_(Y(e,r,this.body,[0,-.15,.95],[.75,.8,.6]),.05,nv),Y(e,n,this.body,[.55,.25,-.5],[.42,.4,.5]);let o=Y(t_(`dogCollar`,()=>new _s(.62,.11,6,18)),Zg(`dogCollar`,15087942),this.body,[0,.5,1.15]);o.rotation.x=Math.PI/2+.5,i_(Y(e,Zg(`dogTag`,16765503,{emissive:6965760,emissiveIntensity:.4}),this.body,[0,-.08,1.52],[.16,.16,.06]),.12,nv),this.head.position.set(0,.85,1.45),this.body.add(this.head),i_(Y(e,t,this.head,[0,.3,.1],[.8,.72,.75]),.04,nv),i_(Y(e,r,this.head,[0,-.05,.75],[.5,.38,.55]),.05,nv),Y(e,i,this.head,[0,.12,1.25],[.2,.15,.13]),Y(e,Qg(`dogShine`,16777215),this.head,[.06,.2,1.36],[.05,.03,.02],!1);let s=Qg(`dogEyeW`,16777215),c=Qg(`dogEyeB`,1708556);for(let t of[-1,1]){Y(e,c,Y(e,s,this.head,[t*.33,.48,.66],[.2,t>0?.24:.2,.12],!1),[t>0?-.2:.3,t>0?.15:-.2,.75],[.5,.5,.4],!1);let r=Y(e,n,this.head,[t*.33,.78,.6],[.16,.05,.06],!1);r.rotation.z=t*.3}this.jaw.position.set(0,-.22,.5),this.head.add(this.jaw),Y(e,r,this.jaw,[0,-.08,.25],[.38,.14,.42]),Y(e,Zg(`dogMouth`,8003632),this.jaw,[0,.02,.3],[.32,.06,.36],!1),this.tongue=Y(e,a,this.jaw,[.15,-.12,.55],[.15,.04,.32]),i_(this.tongue,.08,9054778);for(let t of[-1,1]){let r=new U;r.position.set(t*.62,.6,-.05),this.head.add(r),i_(Y(e,n,r,[t*.12,-.42,0],[.2,.55,.36]),.06,nv),this.ears.push(r)}let l=t_(`dogLeg`,()=>new Ga(.24,.2,1.4,10).translate(0,-.7,0));for(let[n,i]of[[!0,1],[!0,-1],[!1,1],[!1,-1]]){let a=new U;a.position.set(i*.55,-.35,n?.85:-.95),this.body.add(a),i_(Y(l,t,a,[0,0,0]),.06,nv),i_(Y(e,r,a,[0,-1.48,.12],[.3,.18,.38]),.08,nv),n||Y(e,t,a,[0,-.1,-.1],[.5,.6,.6]),this.legs.push({pivot:a,front:n})}let u=this.body,d=[0,.45,-1.5];for(let n=0;n<5;n++){let i=new U;i.position.set(...d),u.add(i),Y(e,n===4?r:t,i,[0,0,0],[.2-n*.02,.2-n*.02,.26]),this.tail.push(i),u=i,d=[0,.18,-.2]}}animate(e,t,n){let r=Math.min(.05,Math.max(0,e));n.action!==this.action&&(n.action===`bark`&&this.root.parent&&r>0&&(hg(0,.95+Math.random()*.12),hg(.2,1.05+Math.random()*.1)),this.action=n.action,this.actT=0),this.actT+=r;let i=this.action,a=Math.max(0,n.speed);this.phase+=r*(.8+a*.12);let o=i===`idle`||i===`sit`?.1:Math.min(1.2,.3+a/18),s=Rg(this.phase,o,this.gaitT),c=s.pitch*1.2,l=1.9+s.bob*4,u=-s.pitch,d=.25+Math.sin(t*9)*.08,f=s.fl*.9,p=s.fr*.9,m=s.bl*.9,h=s.br*.9,g=0;if(i===`bark`){let e=Hg(Math.min(1,this.actT/.35));d=.25+.6*e,u-=.45*e,l+=.15*e}else if(i===`leap`){let e=Math.min(1,this.actT/.25);c=-.25*e,f=-1.2*e,p=-1.1*e,m=1.2*e,h=1.1*e,l=1.9+.3*e,d=.6}else i===`tumble`?(g=Math.PI*.5*Math.min(1,this.actT/.5)+Math.sin(this.actT*9)*.12,f=-1.4+Math.sin(t*18)*.5,p=-1.2-Math.sin(t*17)*.5,m=1+Math.sin(t*15)*.5,h=1.2-Math.sin(t*16)*.5,l=1.05,d=.5):(i===`sit`||i===`idle`)&&(c=i===`sit`?-.45:0,m=i===`sit`?-1.3:0,h=m,l=i===`sit`?1.5:1.9,u=.4+Math.sin(t*1.5)*.05);this.roll+=(g-this.roll)*qg(10,r),this.body.position.y=l,this.body.rotation.set(c,0,this.roll),this.head.rotation.set(u,Math.sin(t*1.3)*.12,Math.sin(t*2.1)*.1),this.jaw.rotation.x=d,this.tongue.rotation.y=Math.sin(t*14)*.4,this.tongue.position.x=.15+Math.sin(t*7)*.08;for(let e=0;e<2;e++)this.ears[e].rotation.set(-.4-s.stretch*.6*o+Math.sin(t*11+e)*.15,0,(e===0?1:-1)*(.25+Math.sin(t*9+e*2)*.2));let _=this.legs;_[0].pivot.rotation.x=f,_[1].pivot.rotation.x=p,_[2].pivot.rotation.x=m,_[3].pivot.rotation.x=h;for(let e=0;e<this.tail.length;e++)this.tail[e].rotation.set(e===0?-.8:-.15,Math.sin(t*16-e*.6)*.45,0)}},iv=()=>new rv,av=10988984,ov=16184044,sv=3814464;function cv(e,t,n){let r=c_(11);e.fillStyle=`#a7adb8`,e.fillRect(0,0,t,n);for(let i=0;i<2200;i++)e.fillStyle=r()<.5?`rgba(255,255,255,0.18)`:`rgba(60,60,80,0.12)`,e.fillRect(r()*t,r()*n,2,5);e.fillStyle=`rgba(110,116,130,0.8)`;for(let r=0;r<9;r++){let i=r/9*t;e.fillRect(i,0,7,n*.4)}let i=e.createLinearGradient(0,n*.55,0,n*.72);i.addColorStop(0,`rgba(246,242,236,0)`),i.addColorStop(1,`rgba(246,242,236,1)`),e.fillStyle=i,e.fillRect(0,n*.55,t,n*.45)}function lv(e,t,n){e.fillStyle=`#b48ad8`,e.fillRect(0,0,t,n),e.strokeStyle=`rgba(255,255,255,0.35)`,e.lineWidth=3;for(let r=4;r<n;r+=12)for(let n=0;n<t;n+=12)e.beginPath(),e.moveTo(n,r),e.lineTo(n+6,r+7),e.lineTo(n+12,r),e.stroke();e.fillStyle=`#ffd6e8`;for(let r=0;r<t;r+=24)e.fillRect(r,n-18,12,10)}var uv=class{root=new U;body=new U;head=new U;paw=new U;tail=[];eyes=[];blink=3;wave=0;constructor(){let e=n_(),t=Zg(`grandmaFur`,16777215,{map:s_(`grandmaFur`,256,128,cv)}),n=Zg(`grandmaWhite`,ov),r=Zg(`grandmaGrey`,av);this.root.add(this.body),i_(Y(e,t,this.body,[0,.55,0],[.5,.58,.45]),.04,sv),Y(e,n,this.body,[0,.55,.22],[.36,.48,.28]);for(let r of[-1,1])i_(Y(e,t,this.body,[r*.32,.28,-.02],[.24,.26,.36]),.06,sv),Y(e,n,this.body,[r*.3,.06,.32],[.13,.08,.17]);let i=t_(`shawl`,()=>new gs(1,24,12,Math.PI/2+.55,Math.PI*2-1.1,.3,.95)),a=Zg(`shawl`,16777215,{map:s_(`knit`,128,64,lv)});a.side=2,i_(Y(i,a,this.body,[0,.56,0],[.55,.63,.5]),.03,4861536);for(let e of[-1,1]){let t=Y(r_(),Zg(`bow`,16744368),this.body,[e*.09,1.02,.36],[.09,.06,.04]);t.rotation.z=e*.5}Y(r_(),Zg(`bow`,16744368),this.body,[0,1.02,.38],[.04,.04,.04]),Y(e,n,this.body,[-.17,.08,.36],[.11,.08,.15]),Y(t_(`gmaLeg`,()=>new Ga(.08,.075,.55,8).translate(0,-.27,0)),n,this.body,[-.17,.62,.33]),this.paw.position.set(.2,.75,.3),this.body.add(this.paw),Y(t_(`gmaLeg`,()=>new Ga(.08,.075,.55,8).translate(0,-.27,0)),n,this.paw,[0,0,0]),Y(e,n,this.paw,[0,-.56,.03],[.11,.08,.13]),this.paw.rotation.x=.35,this.head.position.set(0,1.35,.08),this.body.add(this.head),i_(Y(e,t,this.head,[0,0,0],[.42,.36,.38]),.04,sv);for(let t of[-1,1]){Y(e,n,this.head,[t*.11,-.1,.3],[.15,.11,.1]);let i=Y(t_(`gmaEar`,()=>new Ka(.13,.26,4).rotateY(Math.PI/4).translate(0,.11,0)),r,this.head,[t*.24,.27,-.03],[1,1,.55]);i.rotation.z=-t*.35,i_(i,.08,sv);let a=Y(e,Qg(`gmaEye`,2761256),this.head,[t*.16,.06,.33],[.06,.05,.03],!1);this.eyes.push(a),Y(r_(),Zg(`gmaBlush`,16754872),this.head,[t*.26,-.06,.26],[.06,.035,.03],!1)}Y(e,Zg(`gmaNose`,15043230),this.head,[0,-.02,.4],[.05,.035,.03],!1);let o=t_(`glass`,()=>new _s(.1,.014,6,20)),s=Zg(`gold`,14264122);for(let e of[-1,1])Y(o,s,this.head,[e*.16,.06,.39],[1,1,1],!1);let c=Y(t_(`glassBridge`,()=>new Ga(.01,.01,.12,4).rotateZ(Math.PI/2)),s,this.head,[0,.08,.4],[1,1,1],!1);c.castShadow=!1;let l=Zg(`petal`,16748472);for(let e=0;e<5;e++){let t=e/5*Math.PI*2;Y(r_(),l,this.head,[-.3+Math.cos(t)*.05,.3+Math.sin(t)*.05,.12],[.04,.04,.02],!1)}Y(r_(),Zg(`petalMid`,16769126),this.head,[-.3,.3,.13],[.03,.03,.02],!1);let u=this.body,d=[.25,.12,-.35];for(let r=0;r<8;r++){let i=new U;i.position.set(...d),u.add(i),Y(e,r>=6?n:t,i,[0,0,0],[.1-r*.006,.1-r*.006,.13]),this.tail.push(i),u=i,d=[.07,0,.12]}}animate(e,t,n){let r=Math.min(.05,Math.max(0,e));this.body.scale.set(1+Math.sin(t*1.6)*.012,1-Math.sin(t*1.6)*.012,1),this.head.rotation.set(Math.sin(t*.8)*.05,Math.sin(t*.5)*.15,Math.sin(t*.9)*.08),this.wave+=(+(n.action===`wave`)-this.wave)*qg(6,r),this.paw.rotation.set(.35-this.wave*2.75,0,this.wave*(.55+Math.sin(t*10)*.35));for(let e=0;e<this.tail.length;e++)this.tail[e].rotation.y=.25+Math.sin(t*1.8-e*.5)*.12;this.blink-=r,this.blink<0&&(this.blink=2.5+Math.random()*3);let i=this.blink<.12?.1:.85;for(let e of this.eyes)e.scale.y=.05*i}};function dv(e,t,n){let r=c_(5);e.fillStyle=`#ff5c8a`,e.fillRect(0,0,t,n);let i=[`#ff7ea3`,`#e23d6c`,`#ffa3c0`,`#c92a5a`];for(let a=0;a<6;a++){let o=a/6*Math.PI;e.save(),e.translate(t/2,n/2),e.rotate(o);for(let a=-n;a<n;a+=7)e.strokeStyle=i[Math.floor(r()*i.length)],e.lineWidth=3,e.beginPath(),e.moveTo(-t,a),e.lineTo(t,a+Math.sin(a)*2),e.stroke();e.restore()}}var fv=class{root=new U;ball=new U;spin=0;constructor(){this.root.add(this.ball),this.ball.position.y=1,i_(Y(t_(`yarnBall`,()=>new fs(1,4)),Zg(`yarn`,16777215,{map:s_(`yarn`,256,256,dv)}),this.ball,[0,0,0]),.03,6950960);let e=t_(`yarnLoop`,()=>new _s(.9,.05,5,24,Math.PI*1.1)),t=Zg(`yarnLoop`,16746155);for(let n=0;n<4;n++)Y(e,t,this.ball,[0,0,0],[1.12,1.12,1.12]).rotation.set(n*.9,n*1.3,n*.4);Y(t_(`yarnStrand`,()=>new vs(new ro([new H(0,.1,-.9),new H(.3,.04,-1.6),new H(-.2,.03,-2.4),new H(.25,.03,-3.3),new H(0,.03,-4)]),30,.05,5)),Zg(`yarnStrand`,16735370),this.root,[0,0,0])}animate(e,t,n){let r=Math.min(.05,Math.max(0,e));n.action!==`idle`&&(this.spin+=n.speed*r/Math.max(.1,this.root.scale.y)),this.ball.rotation.x=this.spin,this.ball.position.y=1+Hg(this.spin*.25%1)*.04}},pv=()=>new uv,mv=()=>new fv;function hv(){Sf.add({id:`dog`,build:iv}),Sf.add({id:`cloud`,build:d_}),Sf.add({id:`leaf`,build:f_}),Sf.add({id:`grandma`,build:pv}),Sf.add({id:`yarn`,build:mv})}function gv(){Tf(L_),hv(),kg(),Q_();let e=null,t=new Float32Array(2048);window.__catAudio={scene:Jd,rig:zp,music:L,audioCtx:Te,speedLines:Pg,level:()=>{let n=_();if(!n)return null;e||(e=n.ctx.createAnalyser(),e.fftSize=2048,n.out.connect(e)),e.getFloatTimeDomainData(t);let r=0;for(let e=0;e<t.length;e++)r+=t[e]*t[e];return Math.sqrt(r/t.length)}}}var _v=`meowrun.save`,vv=0xe8d4a51000;function yv(){return{master:1,music:.6,sfx:1,quality:`auto`,reducedMotion:!1,shake:1}}function bv(){return{v:1,stages:{},endlessBest:{score:0,distance:0},unlockAll:!1,settings:yv(),tutorialDone:!1,endingSeen:!1,totals:{runs:0,fish:0,distance:0}}}var xv=e=>typeof e==`object`&&!!e&&!Array.isArray(e);function Sv(e,t,n,r,i=!1){return typeof e!=`number`||!Number.isFinite(e)?r:Math.min(n,Math.max(t,i?Math.floor(e):e))}var Cv=(e,t)=>typeof e==`boolean`?e:t;function wv(e){if(!xv(e))return null;let t=Array.isArray(e.stars)?e.stars:[],n=[t[0]===!0,t[1]===!0,t[2]===!0],r=Cv(e.finished,!1)||n[0];return{stars:n,best:Sv(e.best,0,vv,0),bestBells:Sv(e.bestBells,0,7,0,!0),plays:Sv(e.plays,0,vv,0,!0),finished:r}}function Tv(e){try{if(typeof e==`string`)try{e=JSON.parse(e)}catch{return bv()}let t=bv();if(!xv(e))return t;let n={},r=xv(e.stages)?e.stages:{};for(let e of i){let t=wv(r[e]);t&&(n[e]=t)}let a=xv(e.settings)?e.settings:{},o=t.settings,s=xv(e.endlessBest)?e.endlessBest:{},c=xv(e.totals)?e.totals:{};return{v:1,stages:n,endlessBest:{score:Sv(s.score,0,vv,0),distance:Sv(s.distance,0,vv,0)},unlockAll:Cv(e.unlockAll,!1),settings:{master:Sv(a.master,0,1,o.master),music:Sv(a.music,0,1,o.music),sfx:Sv(a.sfx,0,1,o.sfx),quality:a.quality===`low`||a.quality===`high`||a.quality===`auto`?a.quality:o.quality,reducedMotion:Cv(a.reducedMotion,o.reducedMotion),shake:Sv(a.shake,0,1,o.shake)},tutorialDone:Cv(e.tutorialDone,!1),endingSeen:Cv(e.endingSeen,!1),totals:{runs:Sv(c.runs,0,vv,0,!0),fish:Sv(c.fish,0,vv,0,!0),distance:Sv(c.distance,0,vv,0)}}}catch{return bv()}}function Ev(e,t){if(e.unlockAll||t===`meadow`)return!0;if(t===`endless`)return!!e.stages.meadow?.finished;let n=a.indexOf(t);return n>0&&!!e.stages[a[n-1]]?.finished}function Dv(e,t){let n=Tv(JSON.parse(JSON.stringify(e))),r=i.filter(e=>Ev(n,e));n.totals.runs++,n.totals.fish+=t.fish,n.totals.distance+=t.distance;let a=!1;t.stageId===`endless`&&(a=t.score>n.endlessBest.score,n.endlessBest={score:Math.max(n.endlessBest.score,t.score),distance:Math.max(n.endlessBest.distance,t.distance)});let o=n.stages[t.stageId]??{stars:[!1,!1,!1],best:0,bestBells:0,plays:0,finished:!1};o.plays++,t.stageId!==`endless`&&(a=t.finished&&t.score>o.best),t.finished&&(o.finished=!0,o.best=Math.max(o.best,t.score),o.bestBells=Math.max(o.bestBells,t.bellCount),o.stars=[o.stars[0]||t.stars[0],o.stars[1]||t.stars[1],o.stars[2]||t.stars[2]]),n.stages[t.stageId]=o,t.stageId===`meadow`&&t.finished&&(n.tutorialDone=!0);let s=i.filter(e=>Ev(n,e)&&!r.includes(e));return{save:n,newBest:a,unlocked:s}}function Ov(){try{let e=localStorage.getItem(_v);return e?Tv(e):bv()}catch{return bv()}}function kv(e){try{return localStorage.setItem(_v,JSON.stringify(e)),!0}catch{return!1}}function Av(){try{localStorage.removeItem(_v)}catch{}}var jv=`#2a1c14`,Mv=`#ff9a3c`,Nv=`#e06a1c`,Pv=`#fff7ea`,Fv=`#ff8fab`,Iv={nom:[`#ffe680`,`#ffb52e`],wow:[`#fff3a6`,`#ffc21a`],ouch:[`#ff9aa8`,`#ff4f7b`],happy:[`#bdf0ff`,`#4cc3ff`],scared:[`#d9c8ff`,`#8a6cff`],idle:[`#c8f5b0`,`#7ccf5a`],sleepy:[`#ffd2a6`,`#ff8a5a`]};function Lv(e,t,n,r,i){let[a,o]=Iv[r];e.fillStyle=a,e.fillRect(0,0,t,n),e.save(),e.translate(t/2,n*.55),e.rotate(i*.4),e.fillStyle=o;for(let n=0;n<14;n++){e.beginPath(),e.moveTo(0,0);let r=n/14*Math.PI*2,i=r+Math.PI/14;e.lineTo(Math.cos(r)*t,Math.sin(r)*t),e.lineTo(Math.cos(i)*t,Math.sin(i)*t),e.closePath(),e.fill()}e.restore(),e.fillStyle=`rgba(42,28,20,.12)`;for(let r=0;r<n*.45;r+=t*.07)for(let n=0;n<t*.45;n+=t*.07){let i=t*.022*(1-(n+r)/(t*.9));i>.3&&(e.beginPath(),e.arc(n,r,i,0,Math.PI*2),e.fill())}}function Rv(e,t,n,r,i,a,o){if(e.lineWidth=r*.42,e.strokeStyle=jv,e.lineCap=`round`,i===`happy`||i===`nom`){e.beginPath(),e.arc(t,n+r*.35,r*.8,Math.PI*1.15,Math.PI*1.85),e.stroke();return}if(i===`ouch`){e.beginPath(),e.moveTo(t-r*.7*o,n-r*.6),e.lineTo(t+r*.5*o,n),e.lineTo(t-r*.7*o,n+r*.6),e.stroke();return}if(i===`sleepy`){e.beginPath(),e.moveTo(t-r*.8,n),e.quadraticCurveTo(t,n+r*.5,t+r*.8,n),e.stroke();return}let s=i===`wow`?1.25:i===`scared`?1.15:1,c=i===`idle`&&a%3.2>3.05?.15:1;e.fillStyle=jv,e.beginPath(),e.ellipse(t,n,r*s,r*1.15*s*c,0,0,Math.PI*2),e.fill(),!(c<1)&&(e.fillStyle=`#fff`,e.beginPath(),e.arc(t-r*.35*s,n-r*.4*s,r*.38*s,0,Math.PI*2),e.fill(),e.beginPath(),e.arc(t+r*.3*s,n+r*.35*s,r*.16*s,0,Math.PI*2),e.fill(),i===`wow`&&(e.fillStyle=`#ffe14d`,zv(e,t+r*.2,n-r*.1,r*.35,a*3)),i===`scared`&&(e.fillStyle=jv,e.beginPath(),e.arc(t,n,r*.3,0,Math.PI*2),e.fill()))}function zv(e,t,n,r,i){e.beginPath();for(let a=0;a<10;a++){let o=i+a/10*Math.PI*2,s=a%2?r*.45:r;e.lineTo(t+Math.cos(o)*s,n+Math.sin(o)*s)}e.closePath(),e.fill()}function Bv(e,t,n,r,i,a={}){e.clearRect(0,0,t,n),a.bg!==!1&&Lv(e,t,n,r,i);let o=t/100,s=r===`nom`?Math.sin(i*18)*1.5*o:r===`scared`?Math.sin(i*40)*.8*o:Math.sin(i*3)*.8*o,c=r===`happy`?Math.sin(i*4)*.08:r===`ouch`?-.12:0;e.save(),e.translate(t/2,n*.6+s),e.rotate(c),e.lineJoin=`round`,e.lineWidth=3.2*o,e.strokeStyle=jv;for(let t of[-1,1])e.fillStyle=Mv,e.beginPath(),e.moveTo(t*34*o,-14*o),e.lineTo(t*30*o,-50*o+(r===`scared`?6*o:0)),e.lineTo(t*8*o,-30*o),e.closePath(),e.fill(),e.stroke(),e.fillStyle=Fv,e.beginPath(),e.moveTo(t*28*o,-20*o),e.lineTo(t*27*o,-40*o),e.lineTo(t*15*o,-29*o),e.closePath(),e.fill();e.fillStyle=Mv,e.beginPath(),e.ellipse(0,0,40*o,33*o,0,0,Math.PI*2),e.fill(),e.fillStyle=Nv;for(let t of[-9,0,9])e.beginPath(),e.ellipse(t*o,-27*o,3*o,7*o,t*.03,0,Math.PI*2),e.fill();for(let t of[-1,1])e.beginPath(),e.ellipse(t*36*o,-2*o,5*o,2.2*o,0,0,Math.PI*2),e.fill();e.fillStyle=Pv,e.beginPath(),e.moveTo(0,-24*o),e.bezierCurveTo(10*o,-8*o,28*o,6*o,24*o,18*o),e.bezierCurveTo(14*o,34*o,-14*o,34*o,-24*o,18*o),e.bezierCurveTo(-28*o,6*o,-10*o,-8*o,0,-24*o),e.fill(),e.beginPath(),e.ellipse(0,0,40*o,33*o,0,0,Math.PI*2),e.stroke(),Rv(e,-15*o,-4*o,5.5*o,r,i,1),Rv(e,15*o,-4*o,5.5*o,r,i,-1),e.fillStyle=`rgba(255,110,140,.55)`;for(let t of[-1,1])e.beginPath(),e.ellipse(t*25*o,8*o,6*o,3.5*o,0,0,Math.PI*2),e.fill();if(e.fillStyle=Fv,e.beginPath(),e.moveTo(-4*o,5*o),e.lineTo(4*o,5*o),e.lineTo(0,9*o),e.closePath(),e.fill(),e.lineWidth=1.6*o,e.stroke(),e.lineWidth=2.4*o,e.beginPath(),r===`nom`||r===`wow`||r===`scared`){let t=r===`nom`?5+Math.abs(Math.sin(i*18))*6:r===`wow`?9:7;e.fillStyle=`#7a1f2e`,e.ellipse(0,15*o,6*o,t*o*.7,0,0,Math.PI*2),e.fill(),e.stroke(),e.fillStyle=Fv,e.beginPath(),e.ellipse(0,(15+t*.35)*o,3.5*o,2*o,0,0,Math.PI*2),e.fill()}else if(r===`ouch`){e.moveTo(-7*o,16*o);for(let t=0;t<4;t++)e.lineTo((-7+(t+.5)*3.5)*o,(t%2?16:13)*o);e.lineTo(7*o,16*o),e.stroke()}else e.moveTo(-8*o,11*o),e.quadraticCurveTo(-4*o,16*o,0,11*o),e.quadraticCurveTo(4*o,16*o,8*o,11*o),e.stroke();e.lineWidth=1.4*o;for(let t of[-1,1])for(let n of[-1,1])e.beginPath(),e.moveTo(t*20*o,(10+n*2)*o),e.lineTo(t*44*o,(8+n*6)*o),e.stroke();if(r===`nom`&&(e.fillStyle=`#7fd0ff`,e.lineWidth=2*o,e.beginPath(),e.ellipse(16*o,18*o,10*o,4.5*o,-.3,0,Math.PI*2),e.fill(),e.stroke(),e.beginPath(),e.moveTo(25*o,13*o),e.lineTo(32*o,9*o),e.lineTo(31*o,18*o),e.closePath(),e.fill(),e.stroke()),(r===`scared`||r===`ouch`)&&(e.fillStyle=`#9fe2ff`,e.lineWidth=1.6*o,e.beginPath(),e.moveTo(36*o,-26*o),e.quadraticCurveTo(43*o,-14*o,36*o,-12*o),e.quadraticCurveTo(29*o,-14*o,36*o,-26*o),e.fill(),e.stroke()),r===`ouch`){e.fillStyle=`#ffe14d`;for(let t=0;t<3;t++)zv(e,Math.cos(i*5+t*2.1)*30*o,-40*o+Math.sin(i*5+t*2.1)*5*o,5*o,i*4)}r===`sleepy`&&(e.fillStyle=jv,e.font=`900 ${14*o}px system-ui, sans-serif`,e.fillText(`z`,30*o,-36*o-i*8%10*o)),e.restore(),a.bg!==!1&&(e.lineWidth=6*o,e.strokeStyle=jv,e.strokeRect(0,0,t,n))}function Vv(e,t,n=!0){let r=document.createElement(`canvas`);r.width=r.height=Math.round(e*Math.min(2,devicePixelRatio||1)),r.style.width=r.style.height=`${e}px`;let i=r.getContext(`2d`);return i&&Bv(i,r.width,r.height,t,0,{bg:n}),r}var Hv={exterior:3.2,fadeOut:.4,interior:7.6},Uv=Hv.exterior+Hv.fadeOut+Hv.interior,Wv=new H(0,-800,0),Gv=null;function Kv(){return Gv||(Gv=new fa(new Uint8Array([90,90,90,255,180,180,180,255,255,255,255,255]),3,1,Xe),Gv.minFilter=Gv.magFilter=ke,Gv.needsUpdate=!0,qv.push(Gv),Gv)}var qv=[];function Jv(e,t={}){let n=new ks({color:e,gradientMap:Kv(),map:t.map??null,side:t.side??0});return t.emissive!==void 0&&(n.emissive=new W(t.emissive)),qv.push(n),n}function Yv(e,t,n){let r=document.createElement(`canvas`);r.width=e,r.height=t;let i=r.getContext(`2d`);i&&n(i,e,t);let a=new Ra(r);return a.colorSpace=Jt,a.anisotropy=4,qv.push(a),a}function X(e,t,n=0,r=0,i=0){qv.push(e);let a=new K(e,t);return a.position.set(n,r,i),a}function Xv(e,t,n){e.fillStyle=`#c8901c`,e.fillRect(0,0,t,n),e.fillStyle=`#ffd25a`,e.fillRect(t*.04,n*.04,t*.92,n*.92),e.fillStyle=`#8a5a14`,e.fillRect(t*.1,n*.08,t*.8,n*.84);let r=e.createRadialGradient(t/2,n*.4,10,t/2,n/2,t*.6);r.addColorStop(0,`#9fd0b8`),r.addColorStop(1,`#3f7a64`),e.fillStyle=r,e.fillRect(t*.13,n*.11,t*.74,n*.78);let i=t/100;e.save(),e.translate(t/2,n*.58),e.lineWidth=2.2*i,e.strokeStyle=`#2a1c14`,e.lineJoin=`round`,e.fillStyle=`#b44a6a`,e.beginPath(),e.ellipse(0,30*i,34*i,20*i,0,Math.PI,0),e.fill(),e.stroke();for(let t of[-1,1])e.fillStyle=`#9aa0aa`,e.beginPath(),e.moveTo(t*25*i,-14*i),e.lineTo(t*23*i,-38*i),e.lineTo(t*6*i,-24*i),e.closePath(),e.fill(),e.stroke();e.fillStyle=`#9aa0aa`,e.beginPath(),e.ellipse(0,0,29*i,25*i,0,0,Math.PI*2),e.fill(),e.stroke(),e.fillStyle=`#f2f0ea`,e.beginPath(),e.ellipse(0,10*i,17*i,12*i,0,0,Math.PI*2),e.fill(),e.strokeStyle=`#2a1c14`,e.lineWidth=1.8*i;for(let t of[-1,1])e.beginPath(),e.arc(t*11*i,-3*i,7*i,0,Math.PI*2),e.stroke(),e.beginPath(),e.arc(t*11*i,-1*i,3.5*i,Math.PI*1.1,Math.PI*1.9),e.stroke();e.beginPath(),e.moveTo(-4*i,-3*i),e.lineTo(4*i,-3*i),e.stroke(),e.fillStyle=`#ff8fab`,e.beginPath(),e.moveTo(-3*i,6*i),e.lineTo(3*i,6*i),e.lineTo(0,9*i),e.fill(),e.beginPath(),e.moveTo(-5*i,12*i),e.quadraticCurveTo(-2.5*i,15*i,0,12*i),e.quadraticCurveTo(2.5*i,15*i,5*i,12*i),e.stroke(),e.fillStyle=`#ff4f7b`,e.beginPath(),e.ellipse(-14*i,-24*i,6*i,4*i,-.5,0,Math.PI*2),e.ellipse(-4*i,-27*i,6*i,4*i,.4,0,Math.PI*2),e.fill(),e.stroke(),e.restore()}function Zv(){let e=new U,t=Jv(10133674),n=Jv(15921386),r=Jv(11815530),i=X(new gs(.55,18,14),t,0,.55,0);i.scale.set(1,1.1,.9);let a=X(new gs(.36,14,10),n,0,.65,.3),o=X(new _s(.42,.13,8,20),r,0,.95,0);o.rotation.x=Math.PI/2;let s=new U;s.position.set(0,1.25,.05),s.add(X(new gs(.38,18,14),t));let c=X(new gs(.17,12,10),n,0,-.08,.3);s.add(c);for(let e of[-1,1]){let n=X(new Ka(.13,.28,4),t,e*.22,.32,0);n.rotation.z=-e*.3,s.add(n);let r=X(new _s(.1,.02,6,16),Jv(2759700),e*.13,.05,.34);s.add(r)}let l=X(new Ua(.09,.35,4,8),t,.45,.85,.15);return e.add(i,a,o,s,l),{root:e,animate(e,t,n){s.rotation.z=Math.sin(t*1.4)*.08,l.rotation.z=n.action===`wave`?2.4+Math.sin(t*9)*.35:.3,l.position.y=n.action===`wave`?1.15:.85}}}function Qv(e){let t=new U;t.position.copy(Wv);let n=4.6,r=Yv(512,512,(e,t,n)=>{e.fillStyle=`#b5703e`,e.fillRect(0,0,t,n);for(let r=0;r<8;r++)e.fillStyle=r%2?`#a8653a`:`#bd7a46`,e.fillRect(0,r*n/8,t,n/8-4),e.fillStyle=`#7a4424`,e.fillRect(r*137%t|0,r*n/8,4,n/8)});r.wrapS=r.wrapT=Ee,r.repeat.set(3,3);let i=X(new ms(12,10),Jv(16777215,{map:r}));i.rotation.x=-Math.PI/2,t.add(i);let a=Yv(256,256,(e,t,n)=>{e.fillStyle=`#fbe4c0`,e.fillRect(0,0,t,n),e.fillStyle=`rgba(255,170,120,.35)`;for(let r=0;r<t;r+=32)for(let t=0;t<n*.62;t+=32)e.beginPath(),e.arc(r+16,t+16,3,0,Math.PI*2),e.fill();e.fillStyle=`#7fae7a`,e.fillRect(0,n*.66,t,n*.34),e.fillStyle=`#5f8e5a`;for(let r=0;r<t;r+=32)e.fillRect(r,n*.68,3,n*.32);e.fillStyle=`#4a3326`,e.fillRect(0,n*.64,t,6)});a.wrapS=Ee,a.repeat.set(3,1);let o=Jv(16777215,{map:a,side:2}),s=X(new ms(12,n),o,0,n/2,-5),c=X(new ms(10,n),o,-6,n/2,0);c.rotation.y=Math.PI/2;let l=X(new ms(10,n),o,6,n/2,0);l.rotation.y=-Math.PI/2;let u=X(new ms(12,n),o,0,n/2,5);u.rotation.y=Math.PI;let d=X(new ms(12,10),Jv(15255968,{side:2}),0,n,0);d.rotation.x=Math.PI/2,t.add(s,c,l,u,d);let f=Jv(7028514);for(let e=-2;e<=2;e++)t.add(X(new Ha(.3,.3,10),f,e*2.4,4.449999999999999,0));let p=new U;p.position.set(-5.95,0,1.6);let m=Jv(5216858),h=X(new Ha(.12,2.6,1.5),m,0,1.3,-.75),g=Jv(16765530),_=X(new gs(.07,10,8),g,.1,1.25,-1.3),v=X(new Ha(.14,.7,.9),Jv(4164170),0,1.85,-.75);p.add(h,_,v);let y=new U;y.position.set(.12,2.25,-.75);let b=X(new Ha(.02,.06,1.1),Jv(16732027),0,.05,0);y.add(b);let x=Jv(16761370,{emissive:4861952}),S=new gs(.075,12,10),C=Math.max(1,e);for(let e=0;e<C;e++){let t=new U;t.position.set(.02,-.04-e%2*.08,-.5+e/Math.max(1,C-1)*1),t.add(X(S,x));let n=X(new Ga(.006,.006,.09,4),Jv(2759700),0,.08,0);t.add(n),y.add(t)}p.add(y);let w=X(new ms(1.5,2.6),new Qi({color:16757867}),-5.98,1.3,.85);qv.push(w.material),w.rotation.y=Math.PI/2,t.add(p,w);let T=Yv(256,192,(e,t,n)=>{let r=e.createLinearGradient(0,0,0,n);r.addColorStop(0,`#6a5acd`),r.addColorStop(.55,`#ff9a6b`),r.addColorStop(1,`#ffd38a`),e.fillStyle=r,e.fillRect(0,0,t,n),e.fillStyle=`#ffe9a0`,e.beginPath(),e.arc(t*.6,n*.72,22,0,Math.PI*2),e.fill(),e.fillStyle=`#6f8f4a`,e.beginPath(),e.moveTo(0,n),e.quadraticCurveTo(t*.3,n*.66,t*.6,n*.86),e.quadraticCurveTo(t*.8,n*.96,t,n*.8),e.lineTo(t,n),e.fill(),e.strokeStyle=`#6b3f22`,e.lineWidth=12,e.strokeRect(0,0,t,n),e.beginPath(),e.moveTo(t/2,0),e.lineTo(t/2,n),e.moveTo(0,n/2),e.lineTo(t,n/2),e.stroke()}),E=X(new ms(1.8,1.35),new Qi({map:T}),3.3,2.4,-4.97);qv.push(E.material),t.add(E);for(let e of[-1,1])t.add(X(new Ha(.4,1.8,.08),Jv(16743066),3.3+e*1.05,2.4,-4.9));let D=Yv(256,320,Xv),O=X(new ms(1.3,1.62),new Qi({map:D}),-.6,2.75,-4.96);qv.push(O.material),t.add(O);let k=Yv(160,160,(e,t,n)=>Bv(e,t,n,`happy`,.4)),A=X(new ms(.6,.6),new Qi({map:k}),.75,2.45,-4.96);qv.push(A.material),t.add(A);let j=Jv(9065008),M=new U;M.position.set(-.4,0,-3.2),M.add(X(new Ga(1.15,1.15,.1,28),j,0,.9,0)),M.add(X(new Ga(1.2,1.25,.04,28),Jv(16773590),0,.96,0)),M.add(X(new Ga(.1,.16,.9,10),j,0,.45,0)),M.add(X(new Ga(.5,.55,.06,18),j,0,.03,0));let N=X(new Ga(.05,.05,.3,8),Jv(16775146),.6,1.13,-.3),ee=X(new gs(.05,8,6),new Qi({color:16765802}),.6,1.33,-.3);qv.push(ee.material),ee.scale.y=1.8,M.add(N,ee),t.add(M);let P=new U;P.position.set(1,0,-1.6);let te=[new V(0,0),new V(.32,0),new V(.4,.08),new V(.42,.22),new V(.36,.22),new V(.3,.1),new V(0,.1)];P.add(X(new ps(te,24),Jv(16732027)));let ne=new U;ne.add(X(new gs(.3,16,8,0,Math.PI*2,0,Math.PI/2),Jv(13207370),0,.1,0));let re=Jv(8376575);for(let e=0;e<3;e++){let t=new U;t.add(X(new gs(.12,10,8),re)),t.children[0].scale.set(1.6,.6,.5);let n=X(new Ka(.07,.12,4),re,-.22,0,0);n.rotation.z=Math.PI/2,t.add(n),t.position.set(Math.cos(e*2.1)*.14,.32,Math.sin(e*2.1)*.14),t.rotation.set(.3,e*2.1,.4),ne.add(t)}P.add(ne),t.add(P);let ie=X(new Wa(2.2,32),Jv(14239803),.4,.01,-1);ie.rotation.x=-Math.PI/2,ie.scale.set(1.3,1,1);let ae=X(new hs(1.7,1.9,32),Jv(16765530),.4,.015,-1);ae.rotation.x=-Math.PI/2,ae.scale.set(1.3,1,1),t.add(ie,ae);let oe=new U;oe.position.set(-2.75,0,-3.25),oe.rotation.y=.55;let F=Jv(6974160);oe.add(X(new Ha(1.5,.5,1.3),F,0,.35,0)),oe.add(X(new Ha(1.5,1.3,.3),F,0,.95,-.55));for(let e of[-1,1])oe.add(X(new Ha(.25,.75,1.3),F,e*.75,.6,0));t.add(oe);let se=null;try{se=Sf.has(`grandma`)?Sf.get(`grandma`).build():Zv()}catch{se=Zv()}se.root.position.set(0,.6,.05),oe.add(se.root);let ce=new U;ce.position.set(-4.2,0,-4.6),ce.add(X(new Ha(1.8,2.4,.6),j,0,1.2,0));let le=[16732027,5030911,16761370,8179546,11815530,16747050];for(let e=0;e<3;e++)for(let t=0;t<6;t++)ce.add(X(new Ha(.2,.5+(t*7+e)%3*.08,.4),Jv(le[(t+e)%6]),-.6+t*.24,.5+e*.72,.12));t.add(ce);let ue=X(new Ga(.3,.22,.5,12),Jv(13197370),5.2,.25,-4.4),de=X(new fs(.6,1),Jv(5216828),5.2,.95,-4.4);t.add(ue,de);let fe=new cc(16763274,30,14,1.6);fe.position.set(0,3.4,-1.2);let pe=X(new Ka(.45,.4,16,1,!0),Jv(16765530,{emissive:6965776,side:2}),0,3.6,-1.2),me=X(new gs(.12,10,8),new Qi({color:16773568}),0,3.42,-1.2);qv.push(me.material),t.add(fe,pe,me);let he=new cc(16752752,10,12,1.6);he.position.set(-4.5,1.6,1.2),t.add(he);let ge=null,I=null,_e=Ef();try{_e&&(ge=_e(),t.add(ge.root))}catch(e){console.warn(`cutscene kitten failed`,e),ge=null}return ge||(I=X(new Ua(.3,.4,4,8),Jv(16751164),0,.5,0),t.add(I)),{group:t,door:p,bells:y,bowlFood:ne,kitten:ge,kittenAlt:I,grandma:se,lamp:fe}}var $v={s:0,x:0,y:0,vy:0,speed:0,mode:`run`,surface:`ground`,grounded:!0,sliding:!1,sinceLand:9,sinceJump:9,sincePounce:9,sinceHit:9,landImpact:0,airTime:0,lean:0,invuln:0,wet:0,ability:null,abilityT:0,world:{pos:new H,fwd:new H(0,0,1),up:new H(0,1,0),right:new H(-1,0,0)}},ey=null,ty=0,ny=null,ry=!1,iy=!1,ay=null,oy=null,sy=null,cy=!1,ly=``,uy=new H,dy=new H,fy=new H,py=new H,my=new H,hy=new H,gy=new H,_y=new W(2759700),vy=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)},yy=new H(-5.6,0,.85),by=new H(.35,0,-1.25);function xy(){!iy&&ey&&(iy=!0,Jd.add(ey.group),ay={sun:Zd.intensity,hemi:Xd.intensity,fog:Jd.fog,bg:Jd.background},Jd.fog=null,Jd.background=_y)}function Sy(e,t,n){ty+=t;let r=ty;if(oy&&oy.classList.toggle(`on`,r>Hv.exterior-.1&&r<Hv.exterior+Hv.fadeOut+.05||r>Uv-.2&&r<Uv+.15&&!ry),r<Hv.exterior+Hv.fadeOut*.6&&!iy){my.copy(J.world.pos),hy.copy(J.world.fwd).setY(0).normalize(),gy.crossVectors(hy,$v.world.up).normalize();let t=vy(0,Hv.exterior+.4,r);fy.copy(my).addScaledVector(hy,-4.2).addScaledVector(gy,-1.7),fy.y+=1.3,py.copy(my).addScaledVector(hy,-7.5).addScaledVector(gy,-.6),py.y+=3.6,uy.lerpVectors(fy,py,t),fy.copy(my).addScaledVector(hy,6),fy.y+=1.4,py.copy(my).addScaledVector(hy,34),py.y+=3.2,dy.lerpVectors(fy,py,t),e.position.copy(uy),e.up.set(0,1,0),e.lookAt(dy),Cy(e,50);return}if(xy(),!ey)return;Zd.intensity=.25,Xd.intensity=.55,Jd.fog=null;let i=r-Hv.exterior-Hv.fadeOut;ey.door.rotation.y=-1.45*vy(0,.6,i)*(1-vy(2.6,3.4,i));for(let e=1;e<ey.bells.children.length;e++)ey.bells.children[e].rotation.x=Math.sin(n*9+e)*.35*(1-vy(3,5.5,i)*.7);let a=vy(.35,2.6,i);fy.lerpVectors(yy,by,a);let o=ey.kitten?.root??ey.kittenAlt,s=a>=.98&&i<5.8,c=a>=.98&&!s;if(o){o.position.copy(fy);let e=by.x-yy.x,t=by.z-yy.z;o.rotation.y=c?Math.atan2(-2.25,-4.85):a<.98?Math.atan2(e,t):Math.atan2(.65,-.35),o.rotation.x=s?Math.max(0,Math.sin(n*10))*.07:0}if(ey.kitten&&($v.speed=a>.01&&a<.98?9:0,$v.mode=c?`finish`:`run`,$v.grounded=!0,$v.world.pos.copy(fy),ey.kitten.animate(t,n,$v)),ey.bowlFood.scale.setScalar(1-vy(3.2,6.5,i)*.55),ey.grandma?.animate(t,n,{speed:0,action:i>2.4&&i<5.6?`wave`:`sit`}),ey.lamp.intensity=30+Math.sin(n*7)*1.2,sy){let e=i>5.75;e!==cy&&(cy=e,sy.textContent=e?ly:`Home for dinner!`),sy.classList.toggle(`on`,i>2.4&&i<5.55||i>5.95&&i<7.5)}let l=Wv;if(i<2.8)uy.set(1.8,1.7,3.4).add(l),fy.copy(o?o.position:by).add(l),fy.y+=.5,dy.lerp(fy,i<.05?1:1-Math.exp(-6*t));else if(i<4.6){let e=vy(2.8,3.8,i);fy.set(1.8,1.7,3.4),py.set(2.85,1.6,-2.2),uy.lerpVectors(fy,py,e).add(l);let n=o?o.rotation.y:0;fy.copy(o?o.position:by),fy.x+=Math.sin(n)*.3,fy.z+=Math.cos(n)*.3,fy.y+=.62,fy.add(l),dy.lerp(fy,1-Math.exp(-12*t))}else if(i<6){let e=vy(4.6,5.6,i);fy.set(2.85,1.6,-2.2),py.set(.4,2.1,.8),uy.lerpVectors(fy,py,e).add(l),fy.set(-1.1,2.2,-5).add(l),dy.lerp(fy,1-Math.exp(-4*t))}else if(i<=7.6){let e=vy(6,7.2,i);fy.set(.4,2.1,.8),py.set(-3.4,2,.2),uy.lerpVectors(fy,py,e).add(l),fy.set(-5.9,2.2,.85).add(l),dy.lerp(fy,1-Math.exp(-4*t))}else{let e=i-7.6,n=vy(0,1.6,e);fy.set(-3.4,2,.2),py.set(2.6+Math.sin(e*.25)*.5,2.3,3.6),uy.lerpVectors(fy,py,n).add(l),fy.set(-.6,1.3,-2.4).add(l),dy.lerp(fy,1-Math.exp(-2.5*t))}e.position.copy(uy),e.up.set(0,1,0),e.lookAt(dy),Cy(e,e.aspect<1?70:52),r>=Uv&&!ry&&wy()}function Cy(e,t){Math.abs(e.fov-t)>.01&&(e.fov=t,e.updateProjectionMatrix())}function wy(){if(ry)return;ry=!0,sy?.classList.remove(`on`),oy?.classList.remove(`on`),n.emit(`setPiece`,{id:`ending`,phase:`end`});let e=ny;ny=null,e?.()}function Ty(e,t){Oy(),oy=document.getElementById(`fade`),sy=document.getElementById(`cutCaption`),ey=Qv(e),cy=!1,ly=e>=7?`All 7 bells on the door!`:e>0?`${e}/7 bells on the door`:`Next time: find the bells!`,sy&&(sy.textContent=`Home for dinner!`),ty=0,ry=!1,iy=!1,ny=t,dy.copy(J.world.pos),Up(Sy),n.emit(`setPiece`,{id:`ending`,phase:`start`})}function Ey(){if(!ey||ry||ty<1)return;iy||xy(),ty=Uv+.01;let e=ey.kitten?.root??ey.kittenAlt;e&&e.position.copy(by),dy.set(-.6,1.3,-2.4).add(Wv),oy?.classList.remove(`on`),wy(),ty=Uv+2}var Dy=()=>!!ey;function Oy(){ey&&=(Jd.remove(ey.group),ey.kitten?.dispose?.(),ey.grandma?.dispose?.(),null);for(let e of qv)e.dispose();qv.length=0,Gv=null,ay&&=(Zd.intensity=ay.sun,Xd.intensity=ay.hemi,Jd.fog=ay.fog,Jd.background=ay.bg,null),iy=!1,ny=null,oy?.classList.remove(`on`),sy?.classList.remove(`on`),Up(null)}function ky(e){if(!Number.isFinite(e))return`0`;let t=Math.round(e),n=String(Math.abs(t)).replace(/\B(?=(\d{3})+(?!\d))/g,`,`);return t<0?`-${n}`:n}function Ay(e){(!Number.isFinite(e)||e<0)&&(e=0);let t=Math.floor(e/60),n=Math.floor(e%60);return`${t}:${String(n).padStart(2,`0`)}`}var jy=e=>`${ky(e)} m`;function My(e,t,n){return n<=0||t>=n?e:t<=0?0:e*(1-(1-t/n)**3)}var Ny=e=>e.reduce((e,t)=>e+ +!!t,0);function Py(e){let t=0;for(let n of Object.keys(e))t+=Ny(e[n]?.stars??[]);return t}function Fy(e,t,n,r){return n?`Run over!`:e?t?`Home for dinner!`:r>=3?`PURRFECT!`:r===2?`Great run!`:`Stage clear!`:`Out of hearts!`}var Iy=1300,Ly={"GO LEFT!":4,"GO RIGHT!":4,"WOOF!":4,"WOOF WOOF!":4,"GIANT YARN!":4,"OUCH!":3,"LAST LIFE!":3,"TRY AGAIN!":3,"SPLASH!":3,"HOME!":3,"ALL 7 BELLS!":3,"+1 HEART!":3,"NOM NOM!":1,"CLOSE ONE!":1,"WHOOSH!":1,"PUFF READY!":1,"TAIL READY!":1},Ry={"PURRFECT!":4,"WHOOSH!":30,"NOM NOM!":2,"CLOSE ONE!":2.5,"PUFF READY!":20,"TAIL READY!":6,"PHEW!":3},zy=new Set([`NOM NOM!`,`CLOSE ONE!`,`PUFF READY!`,`WHOOSH!`]),By=e=>Ly[e]??2,Vy=class{shownText=``;shownPrio=0;shownAt=-1e9;last=new Map;offer(e,t,n){if(n&&zy.has(e))return!1;let r=Ry[e],i=this.last.get(e);if(r!==void 0&&i!==void 0&&t-i<r*1e3)return!1;let a=By(e),o=t-this.shownAt<Iy;return o&&a<this.shownPrio||o&&e===this.shownText&&t-this.shownAt<400?!1:(this.shownText=e,this.shownPrio=a,this.shownAt=t,this.last.set(e,t),!0)}reset(){this.shownText=``,this.shownPrio=0,this.shownAt=-1e9,this.last.clear()}},Hy=e=>document.getElementById(e),Uy={jump:[`SPACE`,`SWIPE UP`],slide:[`S`,`SWIPE DOWN`],ability:[`E`,`TAP`],pause:[`ESC`,`PAUSE`]},Wy={jump:`<svg class="g" viewBox="0 0 26 26"><path d="M13 22 V6 M6 12 L13 5 L20 12" fill="none" stroke="#fff7ea" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,slide:`<svg class="g" viewBox="0 0 26 26"><path d="M13 4 V20 M6 14 L13 21 L20 14" fill="none" stroke="#fff7ea" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,ability:`<svg class="g" viewBox="0 0 26 26"><circle cx="13" cy="13" r="8" fill="#fff7ea" stroke="#2a1c14" stroke-width="2.5"/><circle cx="13" cy="13" r="3" fill="#2a1c14"/></svg>`,pause:``},Gy=`<svg class="heart" viewBox="0 0 32 30"><path class="f" d="M16 28 C4 19 1 13 2.5 8 C4 3 10 1 13 4 L16 7 L19 4 C22 1 28 3 29.5 8 C31 13 28 19 16 28Z" stroke="#2a1c14" stroke-width="2.8" stroke-linejoin="round"/><ellipse class="hl" cx="9" cy="9" rx="3.2" ry="2.2" transform="rotate(-30 9 9)"/></svg>`,Ky=`<svg class="bell" viewBox="0 0 26 26"><circle class="slot" cx="13" cy="13" r="11"/><path class="b" d="M13 5.5 C9.5 5.5 8 8 8 11 V14.5 L6.5 17 H19.5 L18 14.5 V11 C18 8 16.5 5.5 13 5.5Z M11 18.5 A2 2 0 0 0 15 18.5Z" stroke="#2a1c14" stroke-width="1.3" stroke-linejoin="round"/></svg>`,qy=16,Jy=[],Yy=0,Xy=new H;function Zy(e,t,n,r,i,a=0){if(Xy.set(n,r+.9,i).project(Yd),Xy.z>1||Xy.z<-1)return null;let o=Jy[Yy];return Yy=(Yy+1)%qy,o.x=(Xy.x+1)/2*innerWidth+a*Math.min(110,innerWidth*.12),o.y=(1-Xy.y)/2*innerHeight-(a?20:0),o.t=0,o.live=!0,o.el.className=`pp ${t}`,o.el.textContent=e,o}var Qy={pop:null,total:0,n:0,at:-1e9,side:1},$y=0;function eb(e){$y=e}function tb(){let e=Hy(`hearts`);e.innerHTML=Gy.repeat(3);let t=Hy(`bells`);t.innerHTML=Ky.repeat(7)+`<span id="bellCount">0/7</span>`;let r=[...e.children],i=[...t.querySelectorAll(`.bell`)],a=Hy(`score`),o=Hy(`mult`),s=Hy(`progFill`),u=Hy(`progKnob`),d=Hy(`progTicks`),f=Hy(`meter`),p=Hy(`meterFill`),m=Hy(`meterLabel`),h=Hy(`prompt`),g=Hy(`bellCount`),_=Hy(`vignette`),v=Hy(`flash`),y=Hy(`distVal`),b=Hy(`distBest`),x=Hy(`portrait`),S=Hy(`callouts`),C=Hy(`abilityBtn`),w=document.body;Kd&&f.querySelector(`kbd`)?.remove();let T=Hy(`popups`);for(let e=0;e<qy;e++){let e=document.createElement(`div`);e.className=`pp`,T.appendChild(e),Jy.push({el:e,t:0,x:0,y:0,live:!1})}let E=document.createElement(`canvas`);E.width=E.height=Math.round(92*Math.min(2,devicePixelRatio||1)),x.appendChild(E);let D=E.getContext(`2d`),O=`happy`,k=99,A=``,j=-1,M=-1,N=-1,ee=``,P=3,te=-1,ne=``,re=-1,ie=(e,t)=>{e.classList.remove(t),e.getBoundingClientRect(),e.classList.add(t)},ae=new Vy,oe=!1;n.on(`chase`,e=>oe=e.on),n.on(`callout`,({text:e,tone:t})=>{if(!ae.offer(e,performance.now(),oe))return;for(;S.firstElementChild;)S.firstElementChild.remove();let n=document.createElement(`div`);n.className=`callout ${t}`;let r=document.createElement(`span`);r.textContent=e,n.appendChild(r),S.appendChild(n),setTimeout(()=>n.remove(),Iy)}),n.on(`react`,e=>{O=e.mood,k=0,ie(x,`show`)}),n.on(`pickup`,e=>{if(e.points<=0&&e.kind!==`yarn`)return;let t=performance.now();if(e.kind===`fish`){let n=Qy;if(n.pop&&n.pop.live&&t-n.at<500){n.total+=e.points,n.n++,n.at=t,n.pop.el.textContent=`+${ky(n.total)} x${n.n}`,n.pop.t=Math.min(n.pop.t,.2);return}n.side=J.x>.5?-1:1,n.pop=Zy(`+${ky(e.points)}`,`fish`,J.world.pos.x,J.world.pos.y+.4,J.world.pos.z,n.side),n.total=e.points,n.n=1,n.at=t}else Zy(e.points>0?`+${ky(e.points)}`:`+PUFF`,e.kind,e.x,e.y,e.z,e.kind===`bell`?0:-Qy.side)}),n.on(`nearMiss`,e=>Zy(`+${ky(e.points)}`,`near`,J.world.pos.x,J.world.pos.y+.6,J.world.pos.z,-1)),n.on(`bell`,e=>{let t=i[e.index];t&&ie(t,`got`)}),n.on(`mult`,()=>ie(o,`bump`)),n.on(`hit`,()=>{_.classList.remove(`wet`),ie(_,`hit`)}),n.on(`wet`,()=>{_.classList.remove(`hit`),ie(_,`wet`)}),n.on(`respawn`,()=>ie(v,`on`));let F=Hy(`incoming`),se=0;n.on(`setPiece`,e=>{e.id===`yarn`&&e.phase.startsWith(`incoming`)&&(F.classList.toggle(`r`,e.phase===`incoming-right`),F.classList.toggle(`l`,e.phase===`incoming-left`),F.classList.add(`on`),clearTimeout(se),se=window.setTimeout(()=>F.classList.remove(`on`),1250))}),n.on(`lifeLost`,e=>e.penalty>0&&Zy(`-${ky(e.penalty)}`,`bad`,J.world.pos.x,J.world.pos.y+1.2,J.world.pos.z)),n.on(`checkpoint`,({index:e})=>{let t=d.children[e-1];t&&ie(t,`flash`)});let ce=()=>{w.classList.toggle(`endless`,l.endless),A=``,j=-1,P=-1,ae.reset(),oe=!1};n.on(`stageLoad`,ce),n.on(`stageStart`,ce),C.addEventListener(`pointerdown`,e=>{e.preventDefault(),Xf(`ability`)}),ig((e,t)=>{for(let t=0;t<qy;t++){let n=Jy[t];if(!n.live)continue;n.t+=e;let r=n.t/.95;if(r>=1){n.live=!1,n.el.style.opacity=`0`;continue}let i=r<.15?.6+r/.15*.6:1.2-Math.min(.2,(r-.15)*.6);n.el.style.opacity=String(r>.7?(1-r)/.3:1),n.el.style.transform=`translate(${n.x.toFixed(1)}px, ${(n.y-r*70).toFixed(1)}px) translate(-50%, -50%) scale(${i.toFixed(3)})`}if(c.mode===`title`)return;if(k<1.7&&D&&(k+=e,Bv(D,E.width,E.height,O,t)),l.hearts!==P){for(let e=0;e<r.length;e++)r[e].classList.toggle(`off`,e>=l.hearts),e===l.hearts&&l.hearts<P&&ie(r[e],`lost`);w.classList.toggle(`lastlife`,l.hearts===1),P=l.hearts}let n=0;for(let e=0;e<i.length;e++)i[e].classList.toggle(`on`,l.bells[e]),l.bells[e]&&n++;g.textContent=`${n}/7`;let _=Math.round(l.score);if(_!==M&&(_-M>=45&&M>=0&&ie(a,`bump`),a.textContent=ky(M=_)),l.mult!==N&&(o.textContent=`x${N=l.mult}`,o.classList.toggle(`hot`,l.mult>=10)),l.endless){let e=Math.round(l.distance);e!==re&&(re=e,y.textContent=jy(e),b.textContent=$y>0?e>$y?`NEW BEST!`:`BEST ${jy($y)}`:``)}else{let e=`${(l.progress*100).toFixed(2)}%`;e!==ne&&(ne=e,s.style.width=e,u.style.left=e);let t=ff.ticks.join(`,`);if(t!==A&&(A=t,j=-1,d.innerHTML=ff.ticks.map(e=>`<i style="left:${(e*100).toFixed(2)}%"></i>`).join(``)),l.cpIndex!==j){j=l.cpIndex;for(let e=0;e<d.children.length;e++)d.children[e].classList.toggle(`past`,e<l.cpIndex)}}let v=Math.round(l.meter*100);v!==te&&(te=v,p.style.width=`${v}%`,f.classList.toggle(`full`,v>=99)),m.textContent!==ff.meterLabel&&(m.textContent=ff.meterLabel);let x=ff.prompt&&c.mode===`play`?`${ff.prompt.action}|${ff.prompt.text}`:``;if(x!==ee){ee=x,h.classList.toggle(`hidden`,!x);let e=!!ff.prompt&&ff.prompt.action===`ability`&&!!x;if(w.classList.toggle(`can-ability`,e),x&&ff.prompt){let e=ff.prompt.action,t=Uy[e][+!!Kd];h.innerHTML=`${Kd?Wy[e]:``}<kbd>${t}</kbd><span>- ${nb(ff.prompt.text)}</span>`,h.classList.toggle(`ability`,e===`ability`),ie(h,`in`),Hy(`abilityTxt`).textContent=ff.prompt.text.replace(/!$/,``).split(` `).slice(-1)[0]||`TAP`}}})}function nb(e){return e.replace(/[&<>"]/g,e=>e===`&`?`&amp;`:e===`<`?`&lt;`:e===`>`?`&gt;`:`&quot;`)}function rb(){h(),_()&&(b(`triangle`,660,.06,.18,{to:880}),b(`sine`,1320,.05,.06,{at:_().ctx.currentTime+.03}))}function ib(){_()&&b(`triangle`,620,.08,.16,{to:420})}function ab(e){let t=_();if(!t)return;let n=[784,988,1175][e]??1175;b(`square`,n,.12,.07),b(`sine`,n*2,.25,.08,{at:t.ctx.currentTime+.04})}function ob(){_()&&b(`square`,1400+Math.random()*200,.02,.025)}function sb(){let e=_();if(!e)return;let t=e.ctx.currentTime;[523,659,784,1047].forEach((e,n)=>b(`triangle`,e,.18,.12,{at:t+n*.09}))}function cb(){let e=_();if(!e)return;let t=e.ctx.currentTime;[392,370,349,262].forEach((e,n)=>b(`triangle`,e,.22,.1,{at:t+n*.16}))}var lb=`title`,ub=()=>{throw Error(`settings not initialised`)},db=()=>{},fb=e=>document.getElementById(e);function pb(){let e=ub().settings;for(let t of document.querySelectorAll(`#settings input[type="range"]`)){let n=t.dataset.k,r=Math.round(e[n]*100);t.value=String(r),t.style.setProperty(`--v`,`${r}%`);let i=t.nextElementSibling;i&&(i.textContent=String(r))}for(let t of document.querySelectorAll(`#setQuality button`))t.classList.toggle(`on`,t.dataset.q===e.quality);fb(`setReduced`).classList.toggle(`on`,e.reducedMotion)}function mb(e){let t=ub();db({...t,settings:{...t.settings,...e}}),pb()}function hb(e,t){ub=e,db=t;for(let e of document.querySelectorAll(`#settings input[type="range"]`))e.addEventListener(`input`,()=>{let t=e.dataset.k;mb({[t]:Math.max(0,Math.min(1,Number(e.value)/100))})});for(let e of document.querySelectorAll(`#setQuality button`))e.addEventListener(`click`,()=>mb({quality:e.dataset.q??`auto`}));fb(`setReduced`).addEventListener(`click`,()=>mb({reducedMotion:!ub().settings.reducedMotion})),fb(`settingsDone`).addEventListener(`click`,_b),addEventListener(`keydown`,e=>{document.body.dataset.screen===`settings`&&e.code===`Escape`&&!e.repeat&&(e.stopImmediatePropagation(),_b())})}function gb(e){lb=e,pb(),document.body.dataset.screen=`settings`}function _b(){ib(),document.body.dataset.screen=lb}var vb=`#2a1c14`,yb={meadow:{sky:[`#4cb8ff`,`#c8eeff`],far:`#9cc8e8`,hill:`#86d45a`,hill2:`#5fb93c`,mesa:`#e0a964`,mesaShade:`#b97a3e`,path:`#e6bf86`,sun:`#fff6c0`},gorge:{sky:[`#5ec4ff`,`#d8f4ff`],far:`#8fb8d8`,hill:`#6cc35a`,hill2:`#3f9a46`,mesa:`#c98c56`,mesaShade:`#9a6034`,path:`#38b8e8`,sun:`#fffbe0`},sunset:{sky:[`#6a5acd`,`#ffb46b`],far:`#c48ab0`,hill:`#b6c45a`,hill2:`#7d9a3c`,mesa:`#e88a5a`,mesaShade:`#a8523a`,path:`#f0c08a`,sun:`#ffe08a`},endless:{sky:[`#3fa0ff`,`#ffe0b0`],far:`#a0b8e0`,hill:`#8ad460`,hill2:`#56ad3a`,mesa:`#d99a5c`,mesaShade:`#a96a3a`,path:`#e6bf86`,sun:`#fff0a0`}};function bb(e){let t=e>>>0||1;return()=>(t=t*1664525+1013904223>>>0)/4294967296}function xb(e,t,n,r){e.fillStyle=`rgba(255,255,255,.95)`,e.beginPath(),e.arc(t,n,r,0,Math.PI*2),e.arc(t+r*.9,n+r*.2,r*.75,0,Math.PI*2),e.arc(t-r*.9,n+r*.25,r*.7,0,Math.PI*2),e.arc(t+r*.2,n-r*.5,r*.7,0,Math.PI*2),e.fill()}function Sb(e,t,n,r,i,a){e.fillStyle=t.mesa,e.beginPath(),e.moveTo(n-i*.6,r),e.lineTo(n-i*.45,r-a),e.lineTo(n+i*.45,r-a),e.lineTo(n+i*.6,r),e.fill(),e.fillStyle=t.mesaShade,e.beginPath(),e.moveTo(n+i*.1,r-a),e.lineTo(n+i*.45,r-a),e.lineTo(n+i*.6,r),e.lineTo(n+i*.2,r),e.fill(),e.fillStyle=`#6fbf4a`,e.fillRect(n-i*.48,r-a-3,i*.96,5)}function Cb(e,t,n,r,i){e.fillStyle=`#7a4a2a`,e.fillRect(t-r*.12,n-r*.6,r*.24,r*.6),e.fillStyle=i,e.beginPath(),e.arc(t,n-r*.9,r*.55,0,Math.PI*2),e.arc(t-r*.35,n-r*.7,r*.4,0,Math.PI*2),e.arc(t+r*.35,n-r*.7,r*.4,0,Math.PI*2),e.fill()}function wb(e,t,n,r){e.fillStyle=`#fff1d6`,e.fillRect(t-r,n-r*1.1,r*2,r*1.1),e.fillStyle=`#d9483b`,e.beginPath(),e.moveTo(t-r*1.3,n-r*1.05),e.lineTo(t,n-r*2),e.lineTo(t+r*1.3,n-r*1.05),e.fill(),e.fillStyle=`#ffd36a`,e.fillRect(t-r*.7,n-r*.75,r*.45,r*.4),e.fillStyle=`#8a5a3a`,e.fillRect(t+r*.2,n-r*.75,r*.42,r*.75)}function Tb(e,t){let n=e.getContext(`2d`);if(!n)return;let r=e.width,i=e.height,a=yb[t],o=bb(t.length*977+t.charCodeAt(0)),s=n.createLinearGradient(0,0,0,i*.7);s.addColorStop(0,a.sky[0]),s.addColorStop(1,a.sky[1]),n.fillStyle=s,n.fillRect(0,0,r,i),n.fillStyle=a.sun,n.beginPath(),n.arc(r*(t===`sunset`?.62:.8),i*(t===`sunset`?.5:.18),i*.11,0,Math.PI*2),n.fill();for(let e=0;e<3;e++)xb(n,r*(.12+e*.33+o()*.1),i*(.12+o()*.15),i*(.05+o()*.03));n.fillStyle=a.far,n.beginPath(),n.moveTo(0,i*.62);for(let e=0;e<=r;e+=r/8)n.lineTo(e,i*(.5+Math.sin(e*.05+1)*.04));if(n.lineTo(r,i),n.lineTo(0,i),n.fill(),Sb(n,a,r*.15,i*.66,r*.18,i*.3),Sb(n,a,r*.86,i*.66,r*.16,i*(t===`gorge`?.42:.24)),t!==`meadow`&&Sb(n,a,r*.72,i*.66,r*.1,i*.18),n.fillStyle=a.hill,n.beginPath(),n.moveTo(0,i*.7),n.quadraticCurveTo(r*.3,i*.52,r*.6,i*.66),n.quadraticCurveTo(r*.85,i*.76,r,i*.62),n.lineTo(r,i),n.lineTo(0,i),n.fill(),n.fillStyle=a.hill2,n.beginPath(),n.moveTo(0,i*.86),n.quadraticCurveTo(r*.25,i*.74,r*.5,i*.84),n.quadraticCurveTo(r*.8,i*.94,r,i*.8),n.lineTo(r,i),n.lineTo(0,i),n.fill(),n.fillStyle=a.path,n.beginPath(),n.moveTo(r*.3,i),n.bezierCurveTo(r*.42,i*.85,r*.62,i*.8,r*.5,i*.66),n.lineTo(r*.53,i*.66),n.bezierCurveTo(r*.7,i*.8,r*.6,i*.88,r*.72,i),n.fill(),t===`gorge`){n.strokeStyle=`rgba(255,255,255,.8)`,n.lineWidth=Math.max(1,r*.008);for(let e=0;e<4;e++){n.beginPath();let t=i*(.75+e*.06);n.moveTo(r*(.46+e*.01),t),n.lineTo(r*(.54+e*.03),t+2),n.stroke()}}if(t===`sunset`&&wb(n,r*.52,i*.66,r*.035),t===`endless`){n.strokeStyle=`rgba(255,255,255,.9)`,n.lineWidth=r*.03,n.lineCap=`round`,n.beginPath();let e=r*.5,t=i*.32,a=r*.13;for(let r=0;r<=48;r++){let i=r/48*Math.PI*2,o=1+Math.sin(i)**2;n.lineTo(e+a*Math.cos(i)/o,t+a*Math.sin(i)*Math.cos(i)/o)}n.stroke(),n.strokeStyle=vb,n.lineWidth=r*.012,n.stroke()}for(let e=0;e<6;e++)Cb(n,o()<.5?r*(.02+o()*.25):r*(.75+o()*.23),i*(.72+o()*.2),i*(.1+o()*.06),t===`sunset`?`#6f8f34`:`#3f9a3c`);if(t===`meadow`||t===`endless`){n.fillStyle=`#7fbf4a`;for(let e=0;e<4;e++)n.fillRect(r*(.8+e*.03),i*.48,r*.012,i*.3)}}function Eb(e,t=240,n=150){let r=document.createElement(`canvas`),i=Math.min(2,devicePixelRatio||1);return r.width=Math.round(t*i),r.height=Math.round(n*i),Tb(r,e),r}var Db=[`steer`,`jump`,`slide`,`pounce`,`vault`],Ob={steer:7,jump:6,slide:6,pounce:5,vault:6},kb=new Set([`jump`,`slide`,`vault`]),Ab=class{done=new Set;active=null;shownFor=0;away=0;steerHeld=0;upFor={};event(e){let t=this.active;t?(t===`jump`&&e===`jump`||t===`slide`&&e===`slide`||t===`pounce`&&e===`pounce`||t===`vault`&&e===`abilityStart`)&&this.finish():e===`pounce`&&this.done.add(`pounce`)}finish(){this.active&&this.done.add(this.active),this.active=null,this.shownFor=0}start(e){this.active=e,this.shownFor=this.upFor[e]??0,this.away=0}want(e,t){switch(e){case`steer`:return t.time>.6;case`jump`:return t.promptAction===`jump`;case`slide`:return t.promptAction===`slide`;case`pounce`:return/POUNCE/i.test(t.promptText)||this.done.has(`slide`)&&t.progress>.62&&t.airborne;case`vault`:return t.promptAction===`ability`&&/VAULT/i.test(t.promptText)}}update(e,t){if(this.active){this.shownFor+=e,this.active===`steer`&&(Math.abs(t.steer)>.5&&(this.steerHeld+=e),this.steerHeld>.35&&this.finish()),this.active&&this.shownFor>Ob[this.active]&&this.finish();let n=this.active;return n&&kb.has(n)&&(this.away=this.want(n,t)?0:this.away+e,this.away>.9&&(this.upFor[n]=this.shownFor,this.active=null,this.shownFor=0)),this.active}for(let e of Db)if(!this.done.has(e)){this.want(e,t)&&this.start(e);break}if(!this.active){for(let e of Db)if(!this.done.has(e)&&e!==`steer`&&e!==`pounce`&&this.want(e,t)){this.start(e);break}}return this.active}get finished(){return this.done.size===Db.length}},jb={steer:{kb:`<kbd class="press">A</kbd><kbd class="press">D</kbd>`,tc:`<div class="finger" data-g="side"><i></i></div>`,title:[`Steer!`,`Drag to steer!`],sub:[`A / D or the arrow keys: run for the fish`,`Slide a finger left and right`]},jump:{kb:`<kbd class="press">SPACE</kbd>`,tc:`<div class="finger" data-g="up"><i></i></div>`,title:[`Jump!`,`Swipe up to jump!`],sub:[`Hop over logs and rocks`,`Hop over logs and rocks`]},slide:{kb:`<kbd class="press">S</kbd>`,tc:`<div class="finger" data-g="down"><i></i></div>`,title:[`Slide!`,`Swipe down to slide!`],sub:[`Duck under low branches`,`Duck under low branches`]},pounce:{kb:`<kbd class="press">SPACE</kbd><kbd class="press">SPACE</kbd>`,tc:`<div class="finger" data-g="up2"><i></i></div>`,title:[`Pounce!`,`Swipe up again!`],sub:[`Jump again in the air to dash forward`,`A second swipe in the air is a pounce`]},vault:{kb:`<kbd class="press">E</kbd>`,tc:`<div class="finger" data-g="tap"><i></i></div>`,title:[`Tail vault!`,`Tap to tail vault!`],sub:[`Press E at the edge: Mochi poles over on her tail`,`Tap at the edge: Mochi poles over on her tail`]}},Mb=!1,Nb=new Ab;function Pb(e){Mb=e,Nb=new Ab}function Fb(){let e=document.getElementById(`coach`),t=e.querySelector(`.art`),r=e.querySelector(`.say b`),i=e.querySelector(`.say span`),a=null,o=n=>{if(n===a||(a=n,e.classList.toggle(`hidden`,!n),!n))return;let o=jb[n],s=+!!Kd;t.innerHTML=Kd?o.tc:o.kb,r.textContent=o.title[s],i.textContent=o.sub[s],e.classList.remove(`in`),e.offsetWidth,e.classList.add(`in`)};n.on(`jump`,()=>Nb.event(`jump`)),n.on(`slide`,e=>e.on&&Nb.event(`slide`)),n.on(`pounce`,()=>Nb.event(`pounce`)),n.on(`abilityStart`,e=>e.id===`vault`&&Nb.event(`abilityStart`)),n.on(`stageStart`,()=>{Nb=new Ab,o(null)}),n.on(`finishLine`,()=>o(null)),n.on(`quit`,()=>o(null)),ig(e=>{if(!Mb||!c.stage?.tutorial||c.mode!==`play`){a&&c.mode!==`paused`&&o(null);return}let t=ff.prompt,n=Nb.update(e,{time:l.time,steer:Zf(),promptAction:t?t.action:null,promptText:t?t.text:``,progress:l.progress,airborne:!J.grounded});o(n)})}var Ib=e=>document.getElementById(e),Lb=Ov();function Rb(e){Lb=e,kv(e),Vb(),ex()}function zb(){Lb=Ov(),Vb(),ex()}var Bb=null;function Vb(){let e=Lb.settings;v({master:e.master,music:e.music,sfx:e.sfx}),e.quality!==Bb&&(Bb=e.quality,nf(e.quality)),u.reducedMotion=e.reducedMotion,u.shake=e.shake,document.body.classList.toggle(`reduced`,e.reducedMotion)}function Hb(e){document.body.dataset.screen=e}var Ub=()=>document.body.dataset.screen,Wb=`<svg class="ico star" viewBox="0 0 24 24"><path d="M12 2.2l3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.6l-6.2 3.5 1.4-6.9L2 9.4l7-.8z"/></svg>`,Gb=e=>Wb.replace(`class="ico star"`,`class="ico star ${e?`on`:`off`}"`),Kb=e=>e.map(Gb).join(``),qb=`<svg viewBox="0 0 48 48"><rect x="9" y="21" width="30" height="22" rx="5" fill="#ffc21a" stroke="#2a1c14" stroke-width="3.5"/><path d="M15 21 V15 a9 9 0 0 1 18 0 V21" fill="none" stroke="#2a1c14" stroke-width="4.5"/><circle cx="24" cy="31" r="3.5" fill="#2a1c14"/><path d="M24 33 V37" stroke="#2a1c14" stroke-width="3.5" stroke-linecap="round"/></svg>`,Jb=`<svg viewBox="0 0 24 24"><path d="M3 12 Q9 5 16 9 L21 6 L20 12 L21 18 L16 15 Q9 19 3 12Z" fill="#7fd0ff" stroke="#2a1c14" stroke-width="2" stroke-linejoin="round"/><circle cx="7.5" cy="11" r="1.3" fill="#2a1c14"/></svg>`,Yb=`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#fff7ea" stroke="#2a1c14" stroke-width="2.4"/><path d="M12 7 V12 L15.5 14" fill="none" stroke="#2a1c14" stroke-width="2.4" stroke-linecap="round"/></svg>`,Xb=`<svg viewBox="0 0 24 24"><path d="M13 2 L5 13 H11 L10 22 L19 10 H13Z" fill="#ffc21a" stroke="#2a1c14" stroke-width="2" stroke-linejoin="round"/></svg>`,Zb=`<svg viewBox="0 0 32 30"><path d="M16 28 C4 19 1 13 2.5 8 C4 3 10 1 13 4 L16 7 L19 4 C22 1 28 3 29.5 8 C31 13 28 19 16 28Z" fill="#ff2f4f" stroke="#2a1c14" stroke-width="2.8"/></svg>`,Qb={gorge:`meadow`,sunset:`gorge`,endless:`meadow`},$b=new Set;function ex(){let e=Ib(`stageList`);e.innerHTML=``;let t=0;for(let n of Cf()){let r=Ev(Lb,n.id),i=Lb.stages[n.id],a=n.id===`endless`,o=document.createElement(`button`);o.className=`stage${r?``:` locked`}${a?` endless`:``}${$b.has(n.id)&&r?` fresh`:``}`,o.dataset.id=n.id,o.disabled=!r,o.style.setProperty(`--i`,String(t++));let s=document.createElement(`div`);s.className=`thumb`,s.appendChild(Eb(n.id)),r||s.insertAdjacentHTML(`beforeend`,`<div class="lock">${qb}</div>`);let c=Qb[n.id],l=c?`Finish ${yf.has(c)?yf.get(c).name:c} to unlock`:`Locked`;if(a)o.appendChild(s),o.insertAdjacentHTML(`beforeend`,`<div class="info"><b>${n.name}</b><div class="blurb">${r?n.blurb:l}</div></div><div class="best">${r?`BEST<big>${ky(Lb.endlessBest.score)}</big>${jy(Lb.endlessBest.distance)}`:``}</div>`);else{o.insertAdjacentHTML(`afterbegin`,`<span class="num">${n.index+1}</span>`),o.appendChild(s);let e=`<b>${n.name}</b><div class="blurb">${r?n.blurb:l}</div><div class="meta"><span class="stars">${Kb(i?.stars??[!1,!1,!1])}</span><span>${i&&i.best>0?ky(i.best):``}</span></div>`;o.insertAdjacentHTML(`beforeend`,`<div class="body">${e}</div>`)}o.addEventListener(`click`,()=>{$b.delete(n.id),tx(n.id)}),e.appendChild(o)}let n=Py(Lb.stages);Ib(`selectStars`).innerHTML=`${Gb(!0)} ${n}/${a.length*3}`,Ib(`titleStars`).innerHTML=n>0?`${Gb(!0)} ${n}/${a.length*3}`:``}function tx(e,t=0){Oy(),Hb(`play`),Hh(e,{at:t})}var nx=null,rx=0,ix=0,ax=null;function ox(e,t){return`<span class="chip">${e}${t}</span>`}var sx=-1e9;function cx(e,t,n){sx=performance.now();let r=yf.get(e.stageId),i=e.stageId===`endless`,o=Ny(e.stars);Ib(`resTitle`).textContent=Fy(e.finished,!!r.ending,i,o),Ib(`resStage`).textContent=i?`${r.name} - ${jy(e.distance)}`:r.name,Ib(`resBest`).classList.toggle(`hidden`,!t),Ib(`resBells`).textContent=r.bells?`${e.bellCount}/${r.bells} bells`:jy(e.distance);let s=[`Home`,`${r.bells||7} bells`,ky(r.scoreTarget)];Ib(`resStars`).innerHTML=i?``:e.stars.map((e,t)=>`<div class="sl" style="--i:${t}">${Gb(e).replace(`<svg`,`<svg style="--i:${t}"`)}<span>${s[t]}</span></div>`).join(``);let c=[r.bells?ox(Ky.replace(`class="bell"`,`class="bell on"`),`${e.bellCount}/${r.bells}`):ox(Yb,jy(e.distance)),ox(Jb,`${e.fish}`),ox(Xb,`x${e.maxMult}`),ox(Yb,Ay(e.time)),e.hits===0&&e.finished?ox(Zb,`No hits!`):ox(Zb,`${e.hits} hit${e.hits===1?``:`s`}`)];Ib(`resChips`).innerHTML=c.join(``);let l=n.filter(e=>yf.has(e)).map(e=>yf.get(e).name);Ib(`resUnlock`).classList.toggle(`hidden`,l.length===0),Ib(`resUnlock`).textContent=l.length?`Unlocked: ${l.join(` + `)}!`:``;let d=a.indexOf(e.stageId),f=d>=0&&d+1<a.length?a[d+1]:null;Ib(`resNext`).classList.toggle(`hidden`,!f||!Ev(Lb,f));let p=!e.finished&&!i?`ouch`:o>=3?`wow`:`happy`,m=Ib(`resCat`);m.innerHTML=``;let h=Vv(110,p);h.style.width=h.style.height=`100%`,m.appendChild(h),ax={cv:h,mood:p},Hb(`results`);let g=document.querySelector(`#results .card`);g.style.animation=`none`,g.offsetWidth,g.style.animation=``,e.finished||i?sb():cb(),e.stars.forEach((e,t)=>e&&!i&&setTimeout(()=>Ub()===`results`&&ab(t),350+t*350+120)),cancelAnimationFrame(ix);let _=Ib(`resScore`),v=performance.now(),y=Math.min(1.4,.5+e.score/4e4),b=0,x=t=>{let n=(t-v)/1e3;_.textContent=ky(My(e.score,n,y)),n<y&&(t-b>55&&(b=t,ob()),ix=requestAnimationFrame(x))};u.reducedMotion?_.textContent=ky(e.score):ix=requestAnimationFrame(x)}function lx(){nx&&(Ib(`resNext`).classList.contains(`hidden`)?tx(nx.stageId):Ib(`resNext`).click())}function ux(){Vb(),ex(),Hb(`title`),hb(()=>Lb,e=>Rb(e));let e=document.createElement(`canvas`);e.width=e.height=Math.round(132*Math.min(2,devicePixelRatio||1)),Ib(`titleMascot`).appendChild(e);let t=e.getContext(`2d`);Ib(`pauseCat`).appendChild(Vv(86,`sleepy`,!0)),ig((n,r)=>{let i=Ub();if(i===`title`&&t&&Bv(t,e.width,e.height,r%6<3.5?`happy`:`idle`,r,{bg:!1}),i===`results`&&ax&&!u.reducedMotion){let e=ax.cv.getContext(`2d`);e&&Bv(e,ax.cv.width,ax.cv.height,ax.mood,r)}}),Ib(`play`).addEventListener(`click`,()=>Hb(`select`)),Ib(`titleSettings`).addEventListener(`click`,()=>gb(`title`)),Ib(`selectBack`).addEventListener(`click`,()=>{ib(),Hb(`title`)}),Ib(`pauseBtn`).addEventListener(`click`,()=>Wh()),Ib(`pauseResume`).addEventListener(`click`,()=>Gh()),Ib(`pauseRetry`).addEventListener(`click`,()=>Uh()),Ib(`pauseSettings`).addEventListener(`click`,()=>gb(`pause`)),Ib(`pauseQuit`).addEventListener(`click`,()=>{Kh(),Hb(`select`)}),Ib(`resRetry`).addEventListener(`click`,()=>nx&&tx(nx.stageId)),Ib(`resMenu`).addEventListener(`click`,()=>{Oy(),c.stage&&Kh(),Hb(`select`)}),Ib(`resNext`).addEventListener(`click`,()=>{let e=nx?a.indexOf(nx.stageId):-1;e>=0&&e+1<a.length&&tx(a[e+1])}),Ib(`cutscene`).addEventListener(`pointerdown`,e=>{e.preventDefault(),Ey()}),addEventListener(`keydown`,e=>{let t=Ub();if(!e.repeat){if(t===`title`&&(e.code===`Enter`||e.code===`Space`))rb(),Hb(`select`);else if(t===`select`)e.code===`Escape`?(ib(),Hb(`title`)):e.code===`Enter`&&!(document.activeElement instanceof HTMLButtonElement)&&tx(a.find(e=>Ev(Lb,e)&&!Lb.stages[e]?.finished)??`meadow`);else if(t===`pause`&&(e.code===`Escape`||e.code===`KeyP`)&&e.timeStamp>rx)Gh();else if(t===`results`){if(performance.now()-sx<600)return;e.code===`Enter`?lx():e.code===`Escape`?Ib(`resMenu`).click():e.code===`KeyR`&&Ib(`resRetry`).click()}else t===`cutscene`&&(e.code===`Enter`||e.code===`Space`||e.code===`Escape`)&&Ey()}}),n.on(`stageStart`,({stage:e})=>{Hb(`play`),eb(Lb.endlessBest.distance),Pb(!!e.tutorial&&!Lb.tutorialDone)}),n.on(`stageLoad`,()=>{Dy()&&Oy()}),n.on(`pause`,()=>{rx=performance.now();let e=c.stage?.bells?`${l.bells.filter(Boolean).length}/${c.stage.bells} bells`:``;Ib(`pauseSub`).textContent=[c.stage?.name??``,e].filter(Boolean).join(`  -  `),Hb(`pause`)}),n.on(`resume`,()=>Hb(`play`)),n.on(`quit`,()=>{let e=Ub();(e===`play`||e===`pause`||e===`settings`)&&Hb(`title`)}),n.on(`stageEnd`,({result:e})=>{nx=e;let t=Dv(Lb,e),n=!!c.stage?.ending&&e.finished;n&&(t.save.endingSeen=!0);for(let e of t.unlocked)$b.add(e);Rb(t.save),n?(Hb(`cutscene`),Ty(e.bellCount,()=>cx(e,t.newBest,t.unlocked))):setTimeout(()=>c.mode===`over`&&nx===e&&cx(e,t.newBest,t.unlocked),900)});let r=()=>document.body.dataset.mode=c.mode;for(let e of[`stageLoad`,`stageStart`,`pause`,`resume`,`finishLine`,`stageEnd`,`quit`])n.on(e,r);r()}var dx={unlockAll(){Rb({...Lb,unlockAll:!0})},jump(e,t=0){tx(e,t)},invincible(e=!0){l.invincible=e},reset(){Av(),zb(),Mh(`meadow`),Hb(`title`)},save(){return Ov()}},fx=Wf(),px=new qn,mx=new H,hx=new H(0,1,0),gx=new H,_x=new H;function vx(e,t,n,r=0,i=0,a=!1){return t.sample(n,fx),e.position.copy(fx.pos).addScaledVector(fx.right,r).addScaledVector(fx.up,i),a?(_x.set(fx.fwd.x,0,fx.fwd.z),_x.lengthSq()<1e-6&&_x.set(0,0,1),_x.normalize(),gx.crossVectors(_x,hx),mx.copy(gx).negate(),px.makeBasis(mx,hx,_x)):(mx.copy(fx.right).negate(),px.makeBasis(mx,fx.up,fx.fwd)),e.quaternion.setFromRotationMatrix(px),e}var yx=e=>(e.userData.shared=!0,e),bx=(e,t,n)=>{let r=e.spec.params?.[t];return typeof r==`number`?r:n},xx=(e,t,n)=>{let r=e.spec.params?.[t];return typeof r==`string`?r:n},Z=e=>{let t;return()=>t??=e()};function Sx(e,t){let n=e.index?e.toNonIndexed():e,r=new W(t),i=n.attributes.position.count,a=new Float32Array(i*3);for(let e=0;e<i;e++)a[e*3]=r.r,a[e*3+1]=r.g,a[e*3+2]=r.b;return n.setAttribute(`color`,new ci(a,3)),n.attributes.uv&&n.deleteAttribute(`uv`),n}function Cx(e){let t=Fg(e.map(([e,t])=>Sx(e,t)));return t.computeVertexNormals(),t.computeBoundingSphere(),yx(t)}function wx(e,t,n){let r=e.attributes.position,i=new H;for(let e=0;e<r.count;e++){i.fromBufferAttribute(r,e);let a=Math.sin(i.x*3.1+n)*Math.cos(i.y*2.7+n*1.7)*Math.sin(i.z*3.7+n*.3);i.multiplyScalar(1+a*t),r.setXYZ(e,i.x,i.y,i.z)}return e}function Tx(e,t,n,r,i=0,a=0,o=!1,s=!0){let c=new K(t,n);return c.castShadow=s&&e.quality===`high`,c.receiveShadow=!1,vx(c,e.track,r,i,a,o),e.group.add(c),c}var Q={vc:Z(()=>new Os({vertexColors:!0,roughness:.82,metalness:0})),vcShiny:Z(()=>new Os({vertexColors:!0,roughness:.35,metalness:.15,emissive:1122867,emissiveIntensity:.6})),gold:Z(()=>new Os({color:16761887,roughness:.28,metalness:.65,emissive:9064960,emissiveIntensity:.55})),goldGlow:Z(()=>new Qi({color:16769658,transparent:!0,opacity:.85,depthWrite:!1,blending:2})),halo:Z(()=>new Oi({map:Mx.halo(),color:16765786,transparent:!0,depthWrite:!1,blending:2,opacity:.9})),haloBlue:Z(()=>new Oi({map:Mx.halo(),color:8381439,transparent:!0,depthWrite:!1,blending:2,opacity:.55})),beam:Z(()=>new Qi({map:Mx.beam(),color:16765024,transparent:!0,opacity:.55,depthWrite:!1,blending:2,side:0})),yarn:Z(()=>new Os({map:Mx.yarn(),roughness:.95})),yarnBig:Z(()=>new Os({map:Mx.yarnBig(),roughness:.95})),bark:Z(()=>new Os({map:Mx.bark(),roughness:.95})),logEnd:Z(()=>new Os({map:Mx.rings(),roughness:.9})),foam:Z(()=>new Qi({color:16777215,transparent:!0,opacity:.85,depthWrite:!1})),warn:Z(()=>new Qi({map:Mx.chevrons(),color:16734780,transparent:!0,depthWrite:!1,opacity:0,side:2})),dots:Z(()=>new Qi({color:16773544,transparent:!0,opacity:.9,depthWrite:!1,blending:2})),pad:Z(()=>new Qi({map:Mx.paw(),color:16757575,transparent:!0,depthWrite:!1,opacity:.95}))},Ex=new Map;function Dx(e){let t=Ex.get(e);return t||Ex.set(e,t=new Os({map:Mx.sign(e),roughness:.9})),t}var Ox=new Map;function kx(e){let t=Ox.get(e);return t||Ox.set(e,t=new Os({map:Mx.banner(e),roughness:.85,side:2})),t}function Ax(e,t,n,r=!1){let i=document.createElement(`canvas`);i.width=e,i.height=t,n(i.getContext(`2d`));let a=new Ra(i);return a.colorSpace=Jt,a.anisotropy=4,r&&(a.wrapS=a.wrapT=Ee),a}function jx(e,t,n,r){e.beginPath(),e.ellipse(t,n+r*.35,r*.62,r*.5,0,0,Math.PI*2);for(let[i,a]of[[-.62,-.32],[-.22,-.72],[.22,-.72],[.62,-.32]])e.moveTo(t+i*r+r*.2,n+a*r),e.ellipse(t+i*r,n+a*r,r*.2,r*.26,0,0,Math.PI*2);e.fill()}var Mx={halo:Z(()=>Ax(64,64,e=>{let t=e.createRadialGradient(32,32,0,32,32,32);t.addColorStop(0,`rgba(255,255,255,1)`),t.addColorStop(.25,`rgba(255,255,255,0.55)`),t.addColorStop(1,`rgba(255,255,255,0)`),e.fillStyle=t,e.fillRect(0,0,64,64)})),beam:Z(()=>Ax(16,128,e=>{let t=e.createLinearGradient(0,128,0,0);t.addColorStop(0,`rgba(255,255,255,0.0)`),t.addColorStop(.15,`rgba(255,255,255,0.35)`),t.addColorStop(1,`rgba(255,255,255,0.0)`),e.fillStyle=t,e.fillRect(0,0,16,128)})),yarn:Z(()=>Ax(128,64,e=>{e.fillStyle=`#ff6fae`,e.fillRect(0,0,128,64),e.lineWidth=3;for(let t=0;t<26;t++){e.strokeStyle=t%3==0?`#ffb3d4`:t%3==1?`#e04a8c`:`#ff8cc0`,e.beginPath();let n=t*37%64;e.moveTo(0,n),e.bezierCurveTo(40,n-18,88,n+18,128,n),e.stroke()}},!0)),yarnBig:Z(()=>Ax(256,128,e=>{e.fillStyle=`#ff4f9a`,e.fillRect(0,0,256,128),e.lineWidth=5;for(let t=0;t<40;t++){e.strokeStyle=t%4==0?`#ffd1e6`:t%4==1?`#b8125f`:t%4==2?`#3fd6c8`:`#ff86bd`,e.beginPath();let n=t*29%128;e.moveTo(0,n),e.bezierCurveTo(80,n-40,170,n+40,256,n),e.stroke()}},!0)),bark:Z(()=>Ax(128,64,e=>{e.fillStyle=`#8a5a32`,e.fillRect(0,0,128,64);for(let t=0;t<40;t++)e.fillStyle=t%2?`#6e4423`:`#a0703f`,e.fillRect(t*53%128,t*17%64,3+t%4*4,2+t%3);e.strokeStyle=`#5a3519`,e.lineWidth=2;for(let t=6;t<128;t+=14)e.beginPath(),e.moveTo(t,0),e.lineTo(t+3,64),e.stroke()},!0)),rings:Z(()=>Ax(64,64,e=>{e.fillStyle=`#e8c48e`,e.fillRect(0,0,64,64),e.strokeStyle=`#b98a52`,e.lineWidth=2;for(let t=5;t<30;t+=6)e.beginPath(),e.arc(32,32,t,0,Math.PI*2),e.stroke();e.strokeStyle=`#6e4423`,e.lineWidth=6,e.beginPath(),e.arc(32,32,30,0,Math.PI*2),e.stroke()})),chevrons:Z(()=>Ax(64,64,e=>{e.clearRect(0,0,64,64),e.fillStyle=`rgba(255,255,255,0.18)`,e.fillRect(0,0,64,64),e.fillStyle=`rgba(255,255,255,0.95)`,e.beginPath(),e.moveTo(8,40),e.lineTo(32,16),e.lineTo(56,40),e.lineTo(56,54),e.lineTo(32,30),e.lineTo(8,54),e.closePath(),e.fill()},!0)),paw:Z(()=>Ax(128,128,e=>{e.clearRect(0,0,128,128),e.fillStyle=`rgba(255,255,255,0.35)`,e.beginPath(),e.arc(64,64,60,0,Math.PI*2),e.fill(),e.strokeStyle=`rgba(255,255,255,1)`,e.lineWidth=6,e.beginPath(),e.arc(64,64,56,0,Math.PI*2),e.stroke(),e.fillStyle=`rgba(255,255,255,1)`,jx(e,64,70,36)})),sign:e=>Ax(128,128,t=>{t.fillStyle=`#c98e52`,t.fillRect(0,0,128,128),t.fillStyle=`#b07a42`;for(let e=0;e<128;e+=32)t.fillRect(0,e+29,128,3);t.strokeStyle=`#6e4423`,t.lineWidth=8,t.strokeRect(4,4,120,120),t.fillStyle=e===`water`||e===`dog`||e===`yarn`||e===`warn`?`#e8432e`:`#fff6e0`,t.strokeStyle=`#3a2410`,t.lineWidth=5,t.lineJoin=`round`,(()=>{if(t.beginPath(),e===`left`||e===`right`){let n=e===`left`?-1:1;t.moveTo(64-40*n,52),t.lineTo(64+6*n,52),t.lineTo(64+6*n,28),t.lineTo(64+44*n,64),t.lineTo(64+6*n,100),t.lineTo(64+6*n,76),t.lineTo(64-40*n,76)}else e===`jump`||e===`up`?(t.moveTo(64,18),t.lineTo(104,62),t.lineTo(78,62),t.lineTo(78,108),t.lineTo(50,108),t.lineTo(50,62),t.lineTo(24,62)):e===`slide`?(t.moveTo(64,110),t.lineTo(104,66),t.lineTo(78,66),t.lineTo(78,20),t.lineTo(50,20),t.lineTo(50,66),t.lineTo(24,66)):(t.moveTo(64,14),t.lineTo(116,108),t.lineTo(12,108));t.closePath()})(),t.fill(),t.stroke(),(e===`warn`||e===`water`||e===`dog`||e===`yarn`)&&(t.fillStyle=`#fff6e0`,e===`warn`?(t.font=`bold 60px sans-serif`,t.textAlign=`center`,t.fillText(`!`,64,98)):e===`water`?(t.beginPath(),t.moveTo(64,46),t.quadraticCurveTo(84,76,64,92),t.quadraticCurveTo(44,76,64,46),t.fill()):e===`yarn`?(t.beginPath(),t.arc(64,78,18,0,Math.PI*2),t.fill()):jx(t,64,80,20)),(e===`vault`||e===`paw`)&&(t.fillStyle=`#ff8a2a`,jx(t,64,66,40))}),banner:e=>Ax(512,128,t=>{t.fillStyle=`#fff3d6`,t.fillRect(0,0,512,128);for(let e=0;e<512;e+=16)for(let n of[0,112])t.fillStyle=e/16+n/16&1?`#fff3d6`:`#e8432e`,t.fillRect(e,n,16,16);t.fillStyle=`#ff8a2a`,jx(t,50,66,26),jx(t,462,66,26),t.font=`bold 66px "Trebuchet MS", sans-serif`,t.textAlign=`center`,t.textBaseline=`middle`,t.lineWidth=10,t.strokeStyle=`#3a2410`,t.strokeText(e,256,66),t.fillStyle=`#ffd23f`,t.fillText(e,256,66)}),pennant:Z(()=>Ax(64,64,e=>{e.fillStyle=`#ff8a2a`,e.fillRect(0,0,64,64),e.fillStyle=`#fff6e0`,jx(e,22,34,12)}))},$={fish:Z(()=>{let e=new gs(.22,14,10).scale(.75,1,1.9),t=new gs(.2,12,8).scale(.7,.6,1.6).translate(0,-.06,.02),n=new Ka(.22,.34,4).scale(.25,1.4,1).rotateX(-Math.PI/2).translate(0,0,-.5),r=new Ka(.1,.22,4).scale(.2,1,1.2).translate(0,.24,-.02),i=new gs(.05,6,5).translate(.13,.06,.26),a=new gs(.05,6,5).translate(-.13,.06,.26);return Cx([[e,5224703],[t,14218495],[n,2787040],[r,2787040],[i,1056814],[a,1056814]])}),bell:Z(()=>{let e=[];for(let[t,n]of[[0,.62],[.1,.6],[.22,.52],[.3,.36],[.34,.16],[.4,.02],[.46,-.06],[.44,-.1],[.36,-.06]])e.push(new V(t,n));let t=Fg([new ps(e,20),new _s(.09,.035,6,12).translate(0,.7,0),new gs(.1,8,6).translate(0,-.1,0),new _s(.33,.03,6,20).rotateX(Math.PI/2).translate(0,.14,0)].map(e=>{let t=e.index?e.toNonIndexed():e;return t.deleteAttribute(`uv`),t}));return t.computeVertexNormals(),yx(t)}),bow:Z(()=>{let e=new Ka(.12,.24,4).rotateZ(Math.PI/2).translate(-.13,0,0),t=new Ka(.12,.24,4).rotateZ(-Math.PI/2).translate(.13,0,0),n=new gs(.06,6,5),r=new Ha(.05,.22,.02).rotateZ(.4).translate(-.06,-.14,0),i=new Ha(.05,.22,.02).rotateZ(-.4).translate(.06,-.14,0);return Cx([[e,15217198],[t,15217198],[n,12853276],[r,15217198],[i,15217198]])}),yarnBall:Z(()=>yx(new gs(.36,16,12))),yarnTail:Z(()=>yx(new vs(new ro([new H(.3,-.2,0),new H(.55,-.32,.1),new H(.75,-.3,-.1),new H(.95,-.36,0)]),12,.035,5,!1))),treat:Z(()=>{let e=new To;e.moveTo(0,-.28),e.bezierCurveTo(-.08,-.2,-.34,-.04,-.3,.12),e.bezierCurveTo(-.26,.28,-.06,.3,0,.16),e.bezierCurveTo(.06,.3,.26,.28,.3,.12),e.bezierCurveTo(.34,-.04,.08,-.2,0,-.28);let t=new ls(e,{depth:.1,bevelEnabled:!0,bevelSize:.03,bevelThickness:.03,bevelSegments:2,curveSegments:10}).translate(0,0,-.05),n=new ls(e,{depth:.02,bevelEnabled:!1,curveSegments:10}).scale(.72,.72,1).translate(0,.01,.08),r=new gs(.03,5,4).translate(-.1,.08,.11),i=new gs(.03,5,4).translate(.09,.04,.11),a=new gs(.03,5,4).translate(0,-.08,.11);return Cx([[t,14259530],[n,16748479],[r,16777215],[i,8381439],[a,16769658]])}),ring:Z(()=>yx(new _s(1.35,.13,8,32))),ringInner:Z(()=>yx(new _s(1.35,.05,6,32))),log:Z(()=>{let e=new Ga(.45,.45,1,14,1,!0).rotateZ(Math.PI/2),t=e.attributes.uv;for(let e=0;e<t.count;e++)t.setXY(e,t.getX(e)*2,t.getY(e)*1);return yx(e)}),logCap:Z(()=>yx(new Wa(.45,14))),stub:Z(()=>Cx([[new Ga(.1,.14,.5,6).rotateZ(1.1).translate(0,.2,0),8014630],[new fs(.22,0).translate(.28,.42,0),7323450]])),rocks:Z(()=>[0,1,2].map(e=>{let t=wx(new Ja(1,1),.22,e*2.3+1);t.scale(1,.78,1);let n=new W,r=t.index?t.toNonIndexed():t,i=r.attributes.position,a=new Float32Array(i.count*3);for(let e=0;e<i.count;e++){let t=i.getY(e);n.setHex(t>.42?9224010:t>.05?13215612:11044446),a[e*3]=n.r,a[e*3+1]=n.g,a[e*3+2]=n.b}return r.setAttribute(`color`,new ci(a,3)),r.computeVertexNormals(),yx(r)})),riverRock:Z(()=>{let e=wx(new Ja(1,1),.25,7).scale(1,.7,1),t=e.attributes.position,n=new Float32Array(t.count*3),r=new W;for(let e=0;e<t.count;e++)r.setHex(t.getY(e)>.35?10132108:7237222),n[e*3]=r.r,n[e*3+1]=r.g,n[e*3+2]=r.b;return e.setAttribute(`color`,new ci(n,3)),e.computeVertexNormals(),yx(e)}),foamRing:Z(()=>yx(new hs(.85,1.35,24).rotateX(-Math.PI/2))),leaves:Z(()=>{let e=[],t=[6270522,7849031,5020208];for(let n=0;n<6;n++){let r=n*1.7;e.push([wx(new fs(.42+n%3*.1,1),.15,n).translate(Math.cos(r)*.45,Math.sin(n*2.1)*.18,Math.sin(r)*.3),t[n%3]])}return Cx(e)}),trunk:Z(()=>Cx([[new Ga(.28,.4,1,8).translate(0,.5,0),8014630]])),bough:Z(()=>Cx([[new vs(new ro([new H(-.5,-.04,0),new H(-.2,.03,.02),new H(.15,.02,-.02),new H(.5,-.05,0)]),16,.17,8,!1),8409644]])),post:Z(()=>Cx([[new Ga(.09,.11,1,6).translate(0,.5,0),9067058]])),stakeStriped:Z(()=>{let e=[];for(let t=0;t<4;t++)e.push([new Ga(.08,.08,.3,6).translate(0,.15+t*.3,0),t%2?16777215:16734780]);return e.push([new gs(.11,6,5).translate(0,1.25,0),16765503]),Cx(e)}),board:Z(()=>yx(new Ha(1,1,.08))),plane:Z(()=>yx(new ms(1,1))),disc:Z(()=>yx(new Wa(1,28).rotateX(-Math.PI/2))),dot:Z(()=>yx(new gs(.12,6,5))),beam:Z(()=>yx(new Ga(.5,.5,1,12,1,!0).translate(0,.5,0))),pennant:Z(()=>{let e=new Si;return e.setAttribute(`position`,new G([0,0,0,0,-.5,0,-.9,-.25,0],3)),e.setAttribute(`uv`,new G([0,1,0,0,1,.5],2)),e.computeVertexNormals(),yx(e)}),bamboo:Z(()=>{let e=[];for(let t=0;t<7;t++)e.push([new Ga(.13,.14,.95,7).translate(0,.5+t,0),t%2?8175690:9424986]),e.push([new Ga(.16,.16,.08,7).translate(0,1+t,0),6265396]);for(let t=0;t<4;t++){let n=t*1.6;e.push([new Ka(.16,1.1,3).scale(1,1,.2).rotateZ(1.1).rotateY(n).translate(Math.cos(n)*.35,5.6+t*.4,Math.sin(n)*.35),7323450])}return Cx(e)}),hay:Z(()=>{let e=new Ga(.9,.9,1.6,14).rotateZ(Math.PI/2),t=new _s(.91,.04,4,16).rotateY(Math.PI/2).translate(.4,0,0),n=new _s(.91,.04,4,16).rotateY(Math.PI/2).translate(-.4,0,0);return Cx([[e,15254106],[t,11879722],[n,11879722]])})},Nx=Z(()=>new Es({transparent:!0,depthWrite:!1,uniforms:{time:{value:0}},vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,fragmentShader:`
        varying vec2 vUv; uniform float time;
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float r = length(p);
          float edge = smoothstep(1.0, 0.86, r);
          float rim = smoothstep(0.7, 0.92, r) * edge;
          float rip = smoothstep(0.06, 0.0, abs(fract(r * 2.2 - time * 0.6) - 0.5) - 0.38) * (1.0 - r);
          vec3 deep = vec3(0.23, 0.56, 0.86); vec3 lite = vec3(0.62, 0.86, 1.0);
          vec3 c = mix(deep, lite, rim * 0.8 + rip * 0.6);
          float hl = smoothstep(0.18, 0.0, length(p - vec2(-0.35, 0.3))) * 0.8;
          c = mix(c, vec3(1.0), hl);
          gl_FragColor = vec4(c, edge * 0.92);
        }`})),Px=Z(()=>new Es({transparent:!0,depthWrite:!1,side:2,uniforms:{time:{value:0}},vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,fragmentShader:`
        varying vec2 vUv; uniform float time;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          float v = n(vec2(vUv.x * 14.0, vUv.y * 4.0 - time * 3.0)) * 0.6 + n(vec2(vUv.x * 30.0 + time, vUv.y * 9.0 - time * 5.0)) * 0.4;
          float band = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          float a = smoothstep(0.35, 0.6, v) * band;
          gl_FragColor = vec4(mix(vec3(0.75, 0.93, 1.0), vec3(1.0), a), max(a, band * 0.35) * 0.95);
        }`})),Fx=-1;function Ix(e){e!==Fx&&(Fx=e,Lx&&(Nx().uniforms.time.value=e),Rx&&(Px().uniforms.time.value=e))}var Lx=!1,Rx=!1,zx=()=>(Lx=!0,Nx()),Bx=()=>(Rx=!0,Px()),Vx=e=>$.rocks()[Math.abs(Math.floor(e))%3],Hx={edgeOut:.4,lead:4,enterT:.9,firstBark:2.2,barkT:.8,lungeT:.5,backT:.7,tumbleT:1.3,reach:2.4,headFwd:2.2,headIn:.9,headR:1,nearMiss:1.4,minRoomToBark:50};function Ux(e,t){return t===`dog`?2.4+e*7%5*.25:[1,0,1,1,0,1][e%6]}var Wx=new H,Gx=new H,Kx=()=>Hx.lead+(Yd.aspect<1?4.5:0);function qx(e){let t=new Qi({map:Mx.chevrons(),color:16730670,transparent:!0,depthWrite:!1,opacity:0,side:2}),n=t.map.clone();n.needsUpdate=!0,n.wrapS=n.wrapT=Ee,t.map=n;let r=new K($.plane(),t);return r.renderOrder=4,r.visible=!1,e.group.add(r),{mesh:r,mat:t}}function Jx(e,t,n,r,i,a,o){vx(t,e.track,n,r,.07),t.rotateX(-Math.PI/2),t.rotateZ(Math.PI),t.scale.set(i,a,1);let s=t.material.map;s.repeat.set(Math.max(1,Math.round(i/1.6)),a/1.6),s.offset.y=-o*2.2}var Yx={id:`dog`,checkpoint:!0,create(e){let{s:t}=e.spec,r=e.spec.len??300,i=bx(e,`side`,-1)<0?-1:1,a=Sf.has(`dog`)?Sf.get(`dog`).build():null,o=a?.root??new U;o.visible=!1,o.traverse(t=>t.castShadow=e.quality===`high`),e.group.add(o);let s=qx(e),c={speed:0,action:`run`},l=e.addCollider({shape:`sphere`,s:-999,x:0,y:1,r:Hx.headR,kind:`hurt`,label:`dog`,near:!1,once:!1});l.enabled=!1;let u=`wait`,d=0,f=Hx.firstBark,p=0,m=0,h=0,g=0,_=0,v=0,y=1/0,b=!1,x=0,S=!1,C=()=>e.track.widthAt(J.s)/2,w=e=>{u=e,d=0},T=n.on(`hit`,e=>{u===`lunge`&&e.label===`dog`&&(b=!0),(u===`run`||u===`bark`||u===`back`||u===`lunge`)&&(l.enabled=!1,w(`tumble`))}),E=!1,D=e=>{E!==e&&(E=e,n.emit(`chase`,{on:e,kind:`dog`}))},O=(e,t,n)=>e+(t-e)*n;return{end:t+r+30,update(T,E){d+=T,p=J.s+m;let k=C()+Hx.edgeOut;switch(u){case`wait`:J.s>=t&&J.mode===`run`&&(w(`enter`),o.visible=!0,m=12,h=i*(k+7),D(!0),hf(`WOOF WOOF!`,`bad`),gf(`scared`),qp(.5),n.emit(`setPiece`,{id:`dog`,phase:`start`}));break;case`enter`:{let e=Math.min(1,d/Hx.enterT);m=O(12,Kx(),e),h=O(i*(k+7),i*k,e),g=Math.sin(e*Math.PI)*3,c.action=`leap`,e>=1&&(g=0,w(`run`),Wx.copy(o.position),Ym(Wx,30,7323450,7,.8,.45,10,1),qp(.4));break}case`run`:case`back`:{let e=Kx()+Math.sin(E*1.3)*.8;if(m=O(m,e,Math.min(1,T*(u===`back`?3:4))),h=O(h,i*k,Math.min(1,T*5)),g=0,_=O(_,0,Math.min(1,T*6)),c.action=`run`,u===`back`&&d>Hx.backT&&w(`run`),J.s>=t+r){w(`exit`);break}u===`run`&&(f-=T)<=0&&J.s<t+r-Hx.minRoomToBark&&(w(`bark`),x++,hf(`WOOF!`,`bad`),gf(`scared`));break}case`bark`:c.action=`bark`,m=O(m,Kx()+.5,Math.min(1,T*4)),h=O(h,i*k,Math.min(1,T*5)),_=O(_,i*.6,Math.min(1,T*6)),d>=Hx.barkT&&(w(`lunge`),y=1/0,b=!1,l.enabled=!0);break;case`lunge`:{let e=Math.min(1,d/Hx.lungeT),t=Math.sin(e*Math.PI);c.action=`leap`,m=O(m,-Hx.headFwd+.4,Math.min(1,T*10)),h=i*(k-Hx.reach*t),g=t*.6,_=i*(.25+t*.35),p=J.s+m,l.s=p+Hx.headFwd,l.x=h-i*Hx.headIn,l.y=1.1;let n=Math.abs(J.x-l.x)-Hx.headR-.4;y=Math.min(y,n),e>=1&&(l.enabled=!1,l.s=-999,!b&&y<Hx.nearMiss&&y>=0&&Cm(`dog`),w(`back`),f=Ux(x,`dog`),x%2==0&&(i=-i));break}case`tumble`:c.action=`tumble`,m=O(m,-10,Math.min(1,T*2)),g=0,d>Hx.tumbleT&&(w(`back`),f=Ux(x,`dog`)+.6),J.s>=t+r&&w(`exit`);break;case`exit`:{let e=Math.min(1,d/1.2);c.action=e<.5?`bark`:`tumble`,m=O(m,-14,Math.min(1,T*2)),h=O(h,i*(k+9),Math.min(1,T*2)),S||(S=!0,D(!1),gm(300),hf(`PHEW!`),gf(`happy`),n.emit(`setPiece`,{id:`dog`,phase:`end`})),e>=1&&(w(`gone`),o.visible=!1);break}}let A=u===`bark`||u===`lunge`&&d<Hx.lungeT*.6;if(s.mesh.visible=A,A){let t=Hx.reach+Hx.headR+.4;s.mat.opacity=u===`bark`?.5+.4*Math.abs(Math.sin(d*14)):.8,Jx(e,s.mesh,J.s+3,i*(C()-t/2),t,10,E)}if(p=J.s+m,o.visible){let t=0;if(u===`run`||u===`back`||u===`bark`)for(let n=0;n<8&&(vx(o,e.track,p,h-i*t,g,!0),Gx.copy(o.position).addScaledVector(J.world.up,1.6).project(Yd),!(Math.abs(Gx.x)<=(Yd.aspect<1?.62:.8)||Gx.z>1));n++)t+=.45;v+=(t-v)*Math.min(1,T*6),vx(o,e.track,p,h-i*v,g,!0),o.rotateY(_),c.speed=J.speed,a?.animate(T,E,c)}},dispose(){T(),D(!1),a?.dispose?.(),s.mat.map?.dispose(),s.mat.dispose()}}}},Xx=null,Zx=null,Qx=()=>(Xx||(Xx=new _s(1,.022,4,48),Xx.userData.shared=!0),Xx),$x=()=>Zx??=new Os({color:1616284,roughness:.95}),eS=null,tS=()=>eS??=new Qi({color:3804970,side:1}),nS=null;function rS(){return nS||(nS=new gs(1,28,20),nS.userData.shared=!0,nS)}var iS={id:`yarnchase`,checkpoint:!0,create(e){let{s:t}=e.spec,r=e.spec.len??400,i=bx(e,`r`,2.2),a=new U,o=new K(rS(),Q.yarnBig());o.scale.setScalar(i),o.rotation.z=Math.PI/2,o.castShadow=e.quality===`high`;let s=new K($.yarnTail(),Q.yarnBig());s.scale.setScalar(i*1.4),s.position.set(0,0,0);let c=new K(rS(),tS());c.scale.setScalar(i*1.07);let l=new U;l.add(o,s),a.add(c);for(let e=0;e<7;e++){let t=new K(Qx(),$x());t.scale.setScalar(i*(1.002+e%3*.004)),t.rotation.set(e*1.37+.3,e*2.11,e*.73),l.add(t)}a.add(l),a.visible=!1,e.group.add(a);let u=qx(e),d=e.addCollider({shape:`sphere`,s:-999,x:0,y:i*.95,r:i*.92,kind:`hurt`,label:`yarn ball`,near:!1,once:!1});d.enabled=!1;let f=`wait`,p=0,m=0,h=0,g=i,_=1,v=0,y=1/0,b=!1,x=.4,S=!1,C=e=>{S!==e&&(S=e,n.emit(`chase`,{on:e,kind:`yarn`}))},w=n.on(`hit`,e=>{e.label===`yarn ball`&&(b=!0)}),T=e=>{f=e,p=0},E=()=>e.track.widthAt(J.s)/2,D=()=>{let e=Math.max(10,J.speed)*3.4;for(let t of km())if(t.enabled&&t.label===`bell`&&t.s>J.s-2&&t.s<J.s+e)return!0;return!1};return{end:t+r+40,update(o,s){switch(p+=o,f){case`wait`:J.s>=t&&J.mode===`run`&&(C(!0),hf(`GIANT YARN!`,`bad`),gf(`scared`),qp(.6),Qp(9,3,3),x=1,n.emit(`setPiece`,{id:`yarn`,phase:`start`}),T(`rest`));break;case`rest`:if(a.visible=!1,J.s>=t+r){T(`done`),C(!1),gm(300),hf(`PHEW!`),gf(`happy`),n.emit(`setPiece`,{id:`yarn`,phase:`end`});break}p>=x&&J.s<t+r-40&&!D()&&(_=Ux(v,`yarn`)>.5?J.x>=0?1:-1:J.x>=0?-1:1,T(`warn`),hf(_>0?`GO LEFT!`:`GO RIGHT!`,`bad`),n.emit(`setPiece`,{id:`yarn`,phase:_>0?`incoming-right`:`incoming-left`}));break;case`warn`:if(p>.35&&qp(.12+p*.12),v===0){let e=Math.min(1,p/1.15);m=J.s-8+3.4*e,h=_*(E()-i+.3),g=i+Math.abs(Math.sin(p*5))*.35,l.rotation.x+=(J.speed+3.4/1.15)*o/i,a.visible=!0}p>=1.15&&(T(`pass`),m=J.s-4.6,h=_*(E()-i+.3),g=i,y=1/0,b=!1,a.visible=!0,d.enabled=!0,qp(.35));break;case`pass`:{let e=J.speed+11;m+=e*o,l.rotation.x+=e*o/i,g=i+Math.abs(Math.sin(p*5))*.35,d.s=m,d.x=h,d.y=g;let t=Math.hypot(J.s-m,J.x-h,Math.max(0,J.y+.5-g))-i*.92-.4;Math.abs(J.s-m)<i+1&&(y=Math.min(y,t)),m>J.s+i+1&&d.enabled&&(d.enabled=!1,!b&&y<1.1&&y>=0&&Cm(`yarn`)),m>J.s+16&&T(`leave`);break}case`leave`:{let e=J.speed+10;m+=e*o,l.rotation.x+=e*o/i,h+=_*o*14,g=i+Math.sin(Math.min(1,p/.5)*Math.PI)*2.5-Math.max(0,p-.5)*18,p>.18&&p-o<=.18&&(Wx.copy(a.position),Ym(Wx,26,14267002,8,.9,.5,10,.8)),p>1.2&&(a.visible=!1,v++,x=.9+v%2*.6,T(`rest`));break}}let c=f===`warn`||f===`pass`&&m<J.s;if(u.mesh.visible=c,c){u.mat.opacity=.4+.35*Math.abs(Math.sin(s*12));let t=i*2;Jx(e,u.mesh,J.s+4,_*(E()-i+.3),t,16,s)}a.visible&&vx(a,e.track,m,h,g,!0)},dispose(){w(),C(!1),u.mat.map?.dispose(),u.mat.dispose()}}}};function aS(){for(let e of[Yx,iS])xf.add(e)}var oS={x:0,y:0};function sS(e,t,n,r,i,a,o){oS.x=r,oS.y=i;let s=n>1?t/(n-1):.5;return e===`arc`?oS.y=i+a*Math.sin(Math.PI*s):e===`wave`?oS.x=r+o*Math.sin(s*Math.PI*2):e===`curve`&&(oS.x=r+o*(s*2-1)),oS}var cS={plant:4,land:4,window:30},lS=e=>4+e*.09;function uS(e,t){let n=e-cS.plant,r=e+t+cS.land;return{plant:n,land:r,height:lS(t),mid:(n+r)/2}}function dS(e,t,n){let r=uS(e,t),i=(n-r.plant)/(r.land-r.plant);return i<=0||i>=1?0:4*r.height*i*(1-i)}var fS=new H,pS=null,mS=null;function hS(){if(mS)return mS;let e=new fs(1,2);return mS=e,e.userData.shared=!0,e}var gS={h:3.3,seconds:2.2,min:30},_S=!1,vS=()=>_S&&J.ability===`cloud`;function yS(){gp(()=>{let e=c.track;if(!e||c.mode!==`play`||J.mode!==`run`||J.ability||l.meter<.99)return!1;let t=J.s+Math.max(gS.min,J.speed*gS.seconds);for(let n=0;n<160&&s.has(e.kindAt(t));n++)t+=1;return Sm(l.meter),mf(),Ep(`cloud`,t,gS.h),_S=!0,gm(150),hf(`PUFF HOVER!`),gf(`wow`),n.emit(`setPiece`,{id:`puff`,phase:`start`}),!0}),n.on(`abilityEnd`,e=>{e.id===`cloud`&&_S&&(_S=!1,n.emit(`setPiece`,{id:`puff`,phase:`end`}))}),n.on(`stageStart`,()=>_S=!1),n.on(`respawn`,()=>_S=!1);let e=!1;n.on(`meter`,({value:t})=>{t>=.99&&!e&&c.mode===`play`&&(hf(`PUFF READY!`,`info`),pf(`ability`,`PUFF HOVER!`,2.4)),e=t>=.99})}var bS={id:`cloud`,checkpoint:!0,create(e){let{s:t}=e.spec,r=t+bx(e,`gap`,30),i=bx(e,`len`,80),a=r+i+2;pS??=new Os({color:16777215,roughness:1,emissive:16773880,emissiveIntensity:.35});let o=Tx(e,$.disc(),Q.pad(),r-3,0,.06,!1,!1);o.scale.setScalar(1.8),o.renderOrder=2;let s=e.track.widthAt(r-1);for(let t of[-1,1])Tx(e,$.stakeStriped(),Q.vc(),r-.6,t*(s/2-.2),0,!0).scale.set(1.3,1.4,1.3);let c=e.quality===`high`?Math.floor(i/9):Math.floor(i/16),u=new xa(hS(),pS,Math.max(1,c*4));u.count=c*4,u.frustumCulled=!1,e.group.add(u);let d=[],f=[],p=[],m=new br;for(let t=0;t<c;t++){let n=r+6+t/Math.max(1,c)*(i-6),a=t%2?1:-1;m.position.set(0,0,0),m.quaternion.identity(),m.scale.setScalar(.9+t%3*.25),vx(m,e.track,n,a*(e.track.widthAt(n)/2+3+t%3),1.4+t%2*1.2,!0),m.updateMatrix(),d.push(m.matrix.clone()),p.push(t);for(let e=0;e<4;e++){let t=new qn().compose(fS.set((e-1.5)*.9,e%2*.35,Math.sin(e*2)*.4),new Cn,new H().setScalar(.9+e%2*.5));f.push(t)}}let h=new qn,g=new qn,_=e=>{for(let t=0;t<c;t++){g.makeTranslation(0,Math.sin(e*1.2+p[t])*.25,0);for(let e=0;e<4;e++)h.multiplyMatrices(d[t],f[t*4+e]).premultiply(g),u.setMatrixAt(t*4+e,h)}u.instanceMatrix.needsUpdate=!0};_(0);let v=!1,y=!1,b=0,x=e=>{v=!0,mf(),vS()&&(Dp(),J.y=Math.max(J.y,0)),Ep(`cloud`,a,3),n.emit(`setPiece`,{id:`cloud`,phase:`start`});let t=l.meter;if(e&&t>.05){let e=1+.35*t;Op(e,i/Math.max(10,J.speed*e)),gm(Math.round(600*t)),Sm(t),hf(t>.6?`PUFF POWER!`:`PUFF!`)}else hf(e?`PUFF!`:`PHEW!`,e?`good`:`info`);gf(`wow`),fS.copy(J.world.pos),Ym(fS,26,16777215,7,.8,.6,-1,.3)},S=gp(()=>v||J.s<t||J.s>r||J.mode!==`run`?!1:(x(!0),!0));return{end:a+4,update(e,i){!v&&(J.mode===`run`||vS())&&(J.s>=t&&J.s<r&&!vS()&&pf(`ability`,`PUFF CLOUD!`,.2),J.s>=r-1&&x(!1)),v&&!y&&J.s>=a&&(y=!0,n.emit(`setPiece`,{id:`cloud`,phase:`end`})),o.scale.setScalar(1.8+Math.sin(i*6)*.15),(b=(b+1)%4)==0&&_(i)},onRespawn(){v=y=!1},dispose(){S(),u.dispose()}}}};function xS(){xf.add(bS),yS()}var SS=new H,CS=null,wS={id:`log`,create(e){let{s:t}=e.spec,n=e.spec.x??0,r=bx(e,`w`,e.track.widthAt(t)+1),i=new U,a=new K($.log(),Q.bark());a.scale.set(r,1,1),a.castShadow=e.quality===`high`;let o=new K($.logCap(),Q.logEnd());o.rotation.y=Math.PI/2,o.position.x=r/2;let s=new K($.logCap(),Q.logEnd());s.rotation.y=-Math.PI/2,s.position.x=-r/2;let c=new K($.stub(),Q.vc());if(c.position.set(r*.18,.3,0),i.add(a,o,s,c),r>4){let e=new K($.stub(),Q.vc());e.position.set(-r*.27,.28,.05),e.rotation.y=2.4,i.add(e)}return e.group.add(i),vx(i,e.track,t,n,.45),e.addCollider({s:t,x:n,y:0,hs:.45,hx:r/2,h:.9,kind:`hurt`,label:`log`}),{end:t+1}}},TS={id:`rock`,create(e){let{s:t}=e.spec,n=e.spec.x??0,r=bx(e,`r`,.8),i=Tx(e,Vx(t*7.3),Q.vc(),t,n,r*.55,!0);i.scale.set(r,r,r*1.05),i.rotation.y=t*1.3;for(let i=0;i<2;i++){let a=t*3.1+i*2.4;Tx(e,Vx(i+1),Q.vc(),t+Math.cos(a)*r*1.1,n+Math.sin(a)*r*1.2,.08,!0,!1).scale.setScalar(.2+i*.08)}return e.addCollider({shape:`sphere`,s:t,x:n,y:r*.55,r:r*.9,kind:`hurt`,label:`rock`}),{end:t+r}}},ES={id:`branch`,create(e){let{s:t}=e.spec,n=e.track.widthAt(t)+1.6,r=new U,i=new K($.bough(),Q.vc());i.scale.set(n+1,1.15,1.15),i.position.y=1.35,i.castShadow=e.quality===`high`,r.add(i);let a=new U;a.position.y=1.35,r.add(a);for(let t=0;t<4;t++){let r=new K($.leaves(),Q.vc());r.position.set(-n/2+(t+.5)*(n/4),.35+t%2*.15,t%2*.2-.1),r.scale.setScalar(.85+t%3*.12),r.castShadow=e.quality===`high`,a.add(r)}for(let t of[-1,1]){let i=new K($.trunk(),Q.vc());i.scale.set(1.2,4.2,1.2),i.position.set(t*(n+.9)/2,-.2,0),i.castShadow=e.quality===`high`;let a=new K($.leaves(),Q.vc());a.scale.setScalar(2.4),a.position.set(t*(n+.9)/2,4.3,0),r.add(i,a)}return e.group.add(r),vx(r,e.track,t,0,0),e.addCollider({s:t,x:0,y:.75,hs:.35,hx:n/2,h:2.2,kind:`hurt`,label:`branch`}),{end:t+1,update(e,n){a.rotation.x=Math.sin(n*1.7+t)*.05}}}},DS={id:`puddle`,create(e){let{s:t}=e.spec,n=e.spec.x??0,r=bx(e,`r`,1.4),i=Tx(e,$.plane(),zx(),t,n,.05,!1,!1);return i.rotateX(-Math.PI/2),i.scale.set(r*2,r*2.8,1),i.renderOrder=2,e.addCollider({s:t,x:n,y:0,hs:r*1.2,hx:r*.85,h:.3,kind:`trigger`,label:`puddle`,onTouch:()=>{kp(1.2),SS.copy(J.world.pos),Ym(SS,9,10476799,4.5,.45,.16,14,1.2),hf(`EWW, WET!`,`info`)}}),{end:t+r*2,update:(e,t)=>Ix(t)}}},OS={id:`bamboo`,create(e){let{s:t}=e.spec,n=e.spec.x??0,r=bx(e,`n`,3),i=bx(e,`spread`,1.2),a=[];for(let o=0;o<r;o++){let s=r>1?o/(r-1)-.5:0,c=Tx(e,$.bamboo(),Q.vc(),t+Math.sin(o*2.3)*.3,n+s*i,0,!0);c.scale.set(1.7,.95+o%3*.12,1.7),c.userData.ph=o*1.3+t,c.userData.sy=c.scale.y,a.push(c)}return e.addCollider({s:t,x:n,y:0,hs:.45,hx:i/2+.25,h:8,kind:`hurt`,label:`bamboo`}),{end:t+1,update(e,n){let r=J.s>t+.6;for(let t of a){t.rotation.z=Math.sin(n*1.3+t.userData.ph)*.03;let i=t.userData.k??1,a=r?Math.max(0,i-e*9):1;a!==i&&(t.userData.k=a,t.scale.y=t.userData.sy*Math.max(.001,a),t.visible=a>0)}}}}},kS={id:`sign`,create(e){let{s:t}=e.spec,n=bx(e,`side`,1),r=e.track.widthAt(t),i=new U,a=new K($.post(),Q.vc());a.scale.set(1.3,2.3,1.3);let o=new K($.plane(),Dx(xx(e,`icon`,`warn`)));o.scale.set(1.3,1.3,1),o.position.set(0,2.3,-.06),o.rotation.y=Math.PI;let s=new K($.plane(),Q.bark());return s.scale.set(1.3,1.3,1),s.position.set(0,2.3,0),i.add(a,o,s),e.group.add(i),vx(i,e.track,t,n*(r/2+1.2),0,!0),i.rotateY(n*.35),i.traverse(t=>t.castShadow=e.quality===`high`),{end:t+1}}},AS={id:`edge`,create(e){let{s:t}=e.spec,n=e.track.widthAt(t);for(let r of[-1,1])Tx(e,$.stakeStriped(),Q.vc(),t,r*(n/2+.1),0,!0).scale.set(1.2,1.1,1.2);return{end:t+1}}},jS={id:`cpflag`,create(e){let{s:t}=e.spec,n=bx(e,`side`,-1),r=e.track.widthAt(t),i=new U,a=new K($.post(),Q.vc());a.scale.set(.9,3.2,.9),CS??=new Os({map:NS(),side:2,roughness:.8});let o=new K($.pennant(),CS);o.scale.set(1.5,1.5,1),o.position.y=3.1,o.rotation.y=n>0?0:Math.PI;let s=new K($.dot(),Q.gold());s.position.y=3.25,s.scale.setScalar(1.3),i.add(a,o,s),e.group.add(i),vx(i,e.track,t,n*(r/2+.9),0,!0);let c=!1,l=0;return{end:t+2,update(e,n){o.rotation.x=Math.sin(n*6+t)*.18,!c&&J.s>=t&&(c=!0,l=1,i.getWorldPosition(SS),SS.y+=3.2,Ym(SS,14,16761887,5,.6,.3,6,.8)),l>0&&(l=Math.max(0,l-e*2),o.scale.set(1.5+l,1.5+l,1),i.rotation.y+=e*l*10)}}}},MS=null;function NS(){if(MS)return MS;let e=document.createElement(`canvas`);e.width=e.height=64;let t=e.getContext(`2d`);t.fillStyle=`#ff8a2a`,t.fillRect(0,0,64,64),t.fillStyle=`#fff6e0`,t.beginPath(),t.arc(16,34,9,0,Math.PI*2);for(let[e,n]of[[-8,-10],[0,-14],[8,-10]])t.moveTo(16+e+4,34+n),t.arc(16+e,34+n,4,0,Math.PI*2);return t.fill(),MS=new Ra(e),MS.colorSpace=Jt,MS}var PS={id:`finish`,create(e){let{s:t}=e.spec,n=e.track.widthAt(t)+1.4,r=new U;for(let e of[-1,1]){let t=new K($.post(),Q.vc());t.scale.set(2.4,5.2,2.4),t.position.x=e*n/2;let i=new K($.hay(),Q.vc());i.position.set(e*(n+2.2)/2,.85,.4),i.rotation.y=.3*e,r.add(t,i)}let i=new K($.plane(),kx(xx(e,`text`,`FINISH!`)));i.scale.set(n*.92,n*.23,1),i.position.y=4.4,i.rotation.y=Math.PI,r.add(i);let a=[15221550,16765503,5224703,7323450],o=[];for(let e=0;e<9;e++){let t=e/8-.5,i=new K($.pennant(),new Qi({color:a[e%4],side:2}));i.rotation.z=Math.PI/2,i.scale.setScalar(.7),i.position.set(t*n,5.3-Math.cos(t*Math.PI)*.4,0),o.push(i),r.add(i)}r.traverse(t=>t.castShadow=e.quality===`high`),e.group.add(r),vx(r,e.track,t,0,0,!0);let s=!1;return{end:t+2,update(e,n){for(let e=0;e<o.length;e++)o[e].rotation.x=Math.sin(n*5+e)*.3;if(!s&&J.s>=t){s=!0;for(let e=0;e<4;e++)r.getWorldPosition(SS),SS.y+=4.5,Ym(SS,24,a[e],9,1.2,.35,8,1.2)}},dispose(){for(let e of o)e.material.dispose()}}}},FS={id:`hint`,create(e){let{s:t}=e.spec,n=e.spec.len??15,r=e.spec.params?.action??`jump`,i=String(e.spec.params?.text??`JUMP!`);return{end:t+n,update(){J.s>=t&&J.s<=t+n&&J.mode===`run`&&pf(r,i,.2)}}}};function IS(){for(let e of[wS,TS,ES,DS,OS,kS,AS,jS,PS,FS])xf.add(e)}var LS=new H,RS=new H,zS=.16;function BS(e,t){for(let n=0;n<e.length;n++){let r=e[n];if(r.t<0)continue;r.t+=t;let i=Math.min(1,r.t/zS);RS.copy(J.world.pos).addScaledVector(J.world.up,.7),r.o.position.lerp(RS,Math.min(1,i*.9+.15)),r.o.scale.setScalar(r.s0*(1+Math.sin(i*Math.PI)*.25)*(1-i*.9)),i>=1&&(r.o.visible=!1,r.t=-1)}}var VS={id:`fish`,create(e){let t=bx(e,`n`,5),n=bx(e,`gap`,3),r=xx(e,`shape`,`line`),i=bx(e,`h`,2.2),a=bx(e,`amp`,2),o=e.spec.x??0,s=e.spec.y??.75,c=[],l=[];for(let u=0;u<t;u++){let d=e.spec.s+u*n,f=sS(r,u,t,o,s,i,a),p=Tx(e,$.fish(),Q.vcShiny(),d,f.x,f.y,!0);p.scale.setScalar(1.05),p.userData.y=f.y,p.userData.ph=u*.7,c.push(p);let m={o:p,t:-1,s0:1.05};l.push(m),e.addCollider({shape:`sphere`,s:d,x:f.x,y:f.y,r:.65,kind:`trigger`,label:`fish`,onTouch:()=>{vm(p.getWorldPosition(LS)),m.t=0}})}return{end:e.spec.s+t*n,update(e,t){for(let e=0;e<c.length;e++){let n=c[e];l[e].t>=0||!n.visible||(n.rotation.y=t*2.4+n.userData.ph,n.rotation.z=Math.sin(t*7+n.userData.ph)*.25)}BS(l,e)}}}},HS={id:`bell`,create(e){let{s:t}=e.spec,n=bx(e,`index`,0);if(l.bells[n])return{end:t};let r=e.spec.x??0,i=e.spec.y??1,a=new U,o=new K($.bell(),Q.gold());o.castShadow=e.quality===`high`,o.scale.setScalar(1.35);let c=new K($.bow(),Q.vc());c.position.y=.95,c.scale.setScalar(1.3);let u=new Hi(Q.halo());u.scale.setScalar(3.2),u.position.y=.3,a.add(u,o,c);let d=[];if(!s.has(e.track.kindAt(t))){let n=Tx(e,$.disc(),Q.goldGlow(),t,r,.04,!0,!1);if(n.scale.setScalar(.9),d.push(n),i>1.8){let n=Tx(e,$.beam(),Q.beam(),t,r,0,!0,!1);n.scale.set(.9,i+1.2,.9),d.push(n)}}e.group.add(a),vx(a,e.track,t,r,i,!0);let f=a.position.clone(),p=new H(0,1,0),m={o:a,t:-1,s0:1};e.addCollider({shape:`sphere`,s:t,x:r,y:i+.2,r:i>1.8?1.2:.95,kind:`trigger`,label:`bell`,onTouch:()=>{bm(n,a.getWorldPosition(LS)),i>1.8&&!J.grounded&&l.bells.filter(Boolean).length<7&&hf(`PURRFECT!`),m.t=0;for(let e of d)e.visible=!1}});let h=[m];return{end:t+1,update(e,t){m.t<0&&a.visible&&(a.position.copy(f).addScaledVector(p,Math.sin(t*2.6+n)*.15),o.rotation.z=Math.sin(t*5+n)*.22,a.rotation.y+=e*1.2,u.material.rotation=t,u.scale.setScalar(2.4+Math.sin(t*4)*.3)),BS(h,e)}}}},US={id:`yarn`,create(e){let{s:t}=e.spec,n=e.spec.x??0,r=e.spec.y??.8,i=new U,a=new K($.yarnBall(),Q.yarn());a.castShadow=e.quality===`high`;let o=new K($.yarnTail(),Q.yarn());i.add(a,o),i.scale.setScalar(1.5);let s=new Hi(Q.haloBlue());s.scale.setScalar(2.2),i.add(s),e.group.add(i),vx(i,e.track,t,n,r,!0);let c=i.position.clone(),l={o:i,t:-1,s0:1.5};e.addCollider({shape:`sphere`,s:t,x:n,y:r,r:.75,kind:`trigger`,label:`yarn`,onTouch:()=>{ym(`yarn`,i.getWorldPosition(LS),150,.25),gf(`happy`),l.t=0}});let u=[l];return{end:t+1,update(e,n){l.t<0&&(i.position.y=c.y+Math.abs(Math.sin(n*3.2+t))*.35,a.rotation.x=n*2),BS(u,e)}}}},WS={id:`treat`,create(e){let{s:t}=e.spec,n=e.spec.x??0,r=e.spec.y??.9,i=bx(e,`heart`,0)>0,a=Tx(e,$.treat(),Q.vc(),t,n,r,!0);a.scale.setScalar(i?2.1:1.6);let o=a.position.y,s={o:a,t:-1,s0:1.6};e.addCollider({shape:`sphere`,s:t,x:n,y:r,r:.7,kind:`trigger`,label:`treat`,onTouch:()=>{i&&l.hearts<3?(l.hearts++,ym(`treat`,a.getWorldPosition(LS),150,.15),hf(`+1 HEART!`),gf(`happy`)):ym(`treat`,a.getWorldPosition(LS),150,.15,`NOM NOM!`),s.t=0}});let c=[s];return{end:t+1,update(e,n){s.t<0&&(a.rotation.y=n*2.5,a.position.y=o+Math.sin(n*3+t)*.12),BS(c,e)}}}},GS={id:`ring`,create(e){let{s:t}=e.spec,n=e.spec.x??0,r=e.spec.y??4,i=Tx(e,$.ring(),Q.gold(),t,n,r,!1),a=Tx(e,$.ringInner(),Q.goldGlow(),t,n,r,!1,!1);a.scale.setScalar(.9);let o=!1,s=0;return e.addCollider({shape:`sphere`,s:t,x:n,y:r,r:1.3,kind:`trigger`,label:`ring`,onTouch:()=>{o=!0,gm(120),ym(`ring`,i.getWorldPosition(LS),0,.08),hf(JS()>=3?`PURRFECT!`:`WHOOSH!`)}}),{end:t+1,update(e,t){if(!o)i.rotation.z=t*.8,a.scale.setScalar(.9+Math.sin(t*6)*.05);else if(s<1){s=Math.min(1,s+e*6);let t=(1+s*.35)*(1-s*.6);i.scale.setScalar(t),a.scale.setScalar(t*.9),s>=1&&(i.visible=a.visible=!1)}}}}},KS=-10,qS=0;function JS(){let e=l.time;return qS=e-KS<2.2?qS+1:1,KS=e,qS}function YS(){for(let e of[VS,HS,US,WS,GS])xf.add(e)}var XS=new H,ZS=null;function QS(){if(ZS)return ZS;let e=new Wa(1,16,.35,Math.PI*2-.5).rotateX(-Math.PI/2),t=new Float32Array(e.attributes.position.count*3).fill(0);for(let n=0;n<e.attributes.position.count;n++)t[n*3]=.36,t[n*3+1]=.72,t[n*3+2]=.27;return e.setAttribute(`color`,new ci(t,3)),e.userData.shared=!0,ZS=e,e}var $S=null;function eC(){return $S||($S=new Ka(.22,.3,6).translate(0,.15,0),$S.userData.shared=!0,$S)}var tC=null,nC={id:`river`,checkpoint:!0,create(e){let{s:t}=e.spec,r=e.spec.len??120;tC??=new Os({color:16748488,roughness:.7,emissive:5904954,emissiveIntensity:.3});let i=[],a=e.quality===`high`?Math.floor(r/8):Math.floor(r/16);for(let n=0;n<a;n++){let o=t+6+n/a*(r-10),s=n%2?1:-1,c=e.track.widthAt(o),l=new U,u=new K(QS(),Q.vc());if(u.scale.setScalar(.7+n%3*.25),l.add(u),n%3==0){let e=new K(eC(),tC);e.position.set(.2,.02,.1),l.add(e)}l.rotation.y=n*1.3,e.group.add(l),vx(l,e.track,o,s*(c/2-.6-n%2*.5),.06,!0),l.userData.y=l.position.y,l.userData.ph=n,i.push(l)}let o=!1,s=!1;return{end:t+r+2,update(e,a){!o&&J.s>=t&&(o=!0,hf(`SURF'S UP!`),n.emit(`setPiece`,{id:`river`,phase:`start`})),o&&!s&&J.s>=t+r&&(s=!0,gm(200),hf(`PURRFECT!`),n.emit(`setPiece`,{id:`river`,phase:`end`}));for(let e=0;e<i.length;e++)i[e].position.y=i[e].userData.y+Math.sin(a*2+i[e].userData.ph)*.04},onRespawn(){o=s=!1},dispose(){o&&!s&&n.emit(`setPiece`,{id:`river`,phase:`end`})}}}},rC={id:`riverrock`,create(e){let{s:t}=e.spec,n=e.spec.x??0,r=bx(e,`r`,1),i=Tx(e,$.riverRock(),Q.vc(),t,n,r*.3,!0);i.scale.set(r,r*1.1,r),i.rotation.y=t;let a=Tx(e,$.foamRing(),Q.foam(),t,n,.08,!1,!1);a.scale.setScalar(r*1.1),a.renderOrder=3;let o=a.position.clone();e.addCollider({shape:`sphere`,s:t,x:n,y:r*.45,r:r*.92,kind:`hurt`,label:`rock`});let s=0;return{end:t+r,update(e,n){a.scale.setScalar(r*(1.1+Math.sin(n*5+t)*.08));let i=t-J.s;if(i>-5&&i<45&&(s+=e)>.06){s=0;let e=Math.random()*Math.PI*2;Jm(o.x+Math.cos(e)*r,o.y+.1,o.z+Math.sin(e)*r,Math.cos(e)*1.5,2.5+Math.random()*2,Math.sin(e)*1.5,.6,.35,16777215,9)}}}}},iC={id:`driftlog`,create(e){let{s:t}=e.spec,n=e.spec.x??0,r=bx(e,`w`,4),i=new U,a=new K($.log(),Q.bark());a.scale.set(r,1,1),a.castShadow=e.quality===`high`;let o=new K($.logCap(),Q.logEnd());o.rotation.y=Math.PI/2,o.position.x=r/2;let s=new K($.logCap(),Q.logEnd());s.rotation.y=-Math.PI/2,s.position.x=-r/2;let c=new K($.stub(),Q.vc());c.position.set(r*.2,.3,0),i.add(a,o,s,c),e.group.add(i),vx(i,e.track,t,n,.3);let l=i.position.clone(),u=Tx(e,$.plane(),Q.foam(),t,n,.07,!1,!1);return u.rotateX(-Math.PI/2),u.scale.set(r+.8,1.4,1),u.renderOrder=3,e.addCollider({s:t,x:n,y:0,hs:.45,hx:r/2,h:.75,kind:`hurt`,label:`log`}),{end:t+1,update(e,n){i.position.y=l.y+Math.sin(n*2.2+t)*.08,i.rotation.z=Math.sin(n*1.4+t)*.06}}}},aC={id:`rapid`,create(e){let{s:t}=e.spec,n=e.track.widthAt(t),r=Tx(e,$.plane(),Bx(),t,0,.25,!1,!1);r.rotateX(-Math.PI/2+.5),r.scale.set(n+1,3.2,1),r.renderOrder=3;let i=Tx(e,$.plane(),Bx(),t+1.6,0,.12,!1,!1);i.rotateX(-Math.PI/2-.4),i.scale.set(n+1,2.4,1),i.renderOrder=3;let a=r.position.clone();e.addCollider({s:t+.5,x:0,y:0,hs:1.2,hx:n/2,h:.45,kind:`trigger`,label:`rapid`,onTouch:()=>{kp(.9,.8),XS.copy(J.world.pos),Ym(XS,22,15268095,7,.6,.35,12,1.4),hf(`SPLASH!`,`bad`)}});let o=0,s=!1;return{end:t+3,update(e,r){Ix(r),J.s>t-26&&J.s<t-1&&J.mode===`run`&&pf(`jump`,`JUMP THE RAPIDS!`,.2),!s&&J.s>t+2&&!J.grounded&&(s=!0,gm(100));let i=t-J.s;if(i>-4&&i<50&&(o+=e)>.035){o=0;let e=Math.random()-.5;Jm(a.x+e*n*J.world.right.x,a.y+.4,a.z+e*n*J.world.right.z,0,3+Math.random()*3,0,.7,.45,16777215,10)}}}}};function oC(){for(let e of[nC,rC,iC,aC])xf.add(e)}var sC=new H,cC=15,lC={id:`vault`,checkpoint:!0,create(e){let{s:t}=e.spec,r=t+bx(e,`gap`,30),i=bx(e,`len`,24),a=uS(r,i),o=e.track.widthAt(a.plant),s=Tx(e,$.disc(),Q.pad(),a.plant,0,.06,!1,!1);s.scale.setScalar(1.6),s.renderOrder=2;let c=Tx(e,$.disc(),Q.pad(),a.land+1,0,.06,!1,!1);c.scale.setScalar(1.3),c.renderOrder=2;for(let t of[-1,1])Tx(e,$.stakeStriped(),Q.vc(),r-.6,t*(o/2-.2),0,!0).scale.set(1.3,1.4,1.3),Tx(e,$.stakeStriped(),Q.vc(),r+i+.6,t*(e.track.widthAt(r+i+1)/2-.2),0,!0).scale.set(1.3,1.4,1.3);let l=[];for(let t=0;t<cC;t++){let n=a.plant+(t+.5)/cC*(a.land-a.plant),o=Tx(e,$.dot(),Q.dots(),n,0,dS(r,i,n)+.5,!0,!1);o.scale.setScalar(1.3),l.push(o)}let u=!1,d=!1,f=!1,p=()=>{d=!0,u=!1,mf(),Tp(Math.max(4,a.land-J.s),a.height,`vault`),n.emit(`setPiece`,{id:`vault`,phase:`start`}),sC.copy(J.world.pos),Ym(sC,8,14929828,4,.45,.2,10,.8),gf(`wow`)},m=gp(()=>d||J.mode!==`run`||J.s<t||J.s>r+1.5?!1:(J.s>=a.plant?p():u||(u=!0,mf(),hf(`TAIL READY!`,`info`)),!0));return{end:a.land+6,update(e,i){!d&&J.mode===`run`&&(u&&J.s>=a.plant?p():!u&&J.s>=t&&J.s<r&&pf(`ability`,`TAIL VAULT!`,.2)),d&&!f&&J.s>=a.land-.5&&J.mode===`run`&&(f=!0,gm(250),hf(`PURRFECT!`),n.emit(`setPiece`,{id:`vault`,phase:`end`}));for(let e=0;e<l.length;e++){let t=l[e];t.visible=!d,d||t.scale.setScalar(1+.6*Math.max(0,Math.sin(i*(u?12:6)-e*.6)))}s.scale.setScalar(1.6+Math.sin(i*6)*.12+(u?.4:0))},onRespawn(){d=u=f=!1},dispose:m}}};function uC(){xf.add(lC)}var dC=new H,fC=null;function pC(){if(fC)return fC;let e=document.createElement(`canvas`);e.width=e.height=64;let t=e.getContext(`2d`);t.clearRect(0,0,64,64),t.strokeStyle=`rgba(255,248,230,0.9)`,t.lineCap=`round`;for(let e=0;e<3;e++)t.lineWidth=5-e,t.beginPath(),t.moveTo(14+e*15,6),t.quadraticCurveTo(10+e*15,32,20+e*15,58),t.stroke();let n=new Ra(e);return n.colorSpace=Jt,fC=new Qi({map:n,transparent:!0,depthWrite:!1,opacity:.75}),fC}var mC={id:`wallrun`,checkpoint:!0,create(e){let{s:t}=e.spec,r=e.spec.len??60,i=Math.floor(r/7);for(let n=0;n<i;n++){let r=t+3+n*7+Math.sin(n*3.1)*1.5,i=e.track.widthAt(r),a=Tx(e,$.plane(),pC(),r,Math.sin(n*2.3)*(i/2-1.2),.04,!1,!1);a.rotateX(-Math.PI/2),a.rotateZ(Math.sin(n*1.7)*.4),a.scale.setScalar(1.4+n%3*.3),a.renderOrder=2}let a=!1,o=!1;return{end:t+r+2,update(){!a&&J.s>=t&&(a=!0,hf(`CLAWS OUT!`),Op(1.12,1.4),n.emit(`setPiece`,{id:`wall`,phase:`start`}),dC.copy(J.world.pos),Ym(dC,12,16774080,5,.4,.2,4,.6)),a&&!o&&J.s>=t+r&&(o=!0,gm(200),hf(`PURRFECT!`),n.emit(`setPiece`,{id:`wall`,phase:`end`}))},onRespawn(){a=o=!1},dispose(){a&&!o&&n.emit(`setPiece`,{id:`wall`,phase:`end`})}}}};function hC(){xf.add(mC)}function gC(){IS(),YS(),uC(),xS(),hC(),oC(),aS()}var _C=12,vC=class{b;pieces=[];constructor(e){this.b=e}get s(){return this.b.s}add(e,t,n={}){return this.pieces.push({type:e,s:t,...n}),this}run(e,t={}){return this.b.run(e,t).s0}fish(e,t=0,n=5,r=3,i=`line`,a={}){let o={n,gap:r,shape:i};return a.h!==void 0&&(o.h=a.h),a.amp!==void 0&&(o.amp=a.amp),this.add(`fish`,e,{x:t,y:a.y,len:n*r,params:o})}bell(e,t,n=0,r=1){return this.add(`bell`,t,{x:n,y:r,params:{index:e}})}yarn(e,t=0,n){return this.add(`yarn`,e,{x:t,y:n})}treat(e,t=0,n){return this.add(`treat`,e,{x:t,y:n})}heartTreat(e,t=0){return this.add(`treat`,e,{x:t,params:{heart:1}})}ring(e,t=0,n=4.2){return this.add(`ring`,e,{x:t,y:n})}log(e,t=0,n){return this.add(`log`,e,{x:t,params:n?{w:n}:void 0})}rock(e,t=0,n=.8){return this.add(`rock`,e,{x:t,params:{r:n}})}branch(e){return this.add(`branch`,e)}puddle(e,t=0,n=1.4){return this.add(`puddle`,e,{x:t,len:n*2,params:{r:n}})}bamboo(e,t,n=3,r=1.2){return this.add(`bamboo`,e,{x:t,params:{n,spread:r}})}driftlog(e,t=0,n=4){return this.add(`driftlog`,e,{x:t,params:{w:n}})}riverrock(e,t=0,n=1){return this.add(`riverrock`,e,{x:t,params:{r:n}})}rapid(e){return this.add(`rapid`,e,{len:3})}hint(e,t,n,r=16){return this.add(`hint`,e,{len:r,params:{action:t,text:n}})}sign(e,t,n=1){return this.add(`sign`,e,{params:{icon:t,side:n}})}flag(e,t=-1){return this.add(`cpflag`,e,{params:{side:t}})}finish(e,t=`FINISH!`){return this.add(`finish`,e,{params:{text:t}})}gapJump(e,t,n,r={}){this.run(e,{turn:r.turn});let i=this.b.gap(t).s0;return this.run(n),this.add(`edge`,i-.5),this.sign(i-26,`warn`,i%2?1:-1),r.hint!==``&&this.hint(i-24,`jump`,r.hint??`JUMP!`,20),i}vaultGap(e,t,n,r={}){this.run(e,{turn:r.turn});let i=this.b.gap(t).s0;this.run(n);let a=i-cS.window;return this.add(`vault`,a,{len:uS(i,t).land-a,params:{gap:cS.window,len:t}}),this.flag(a-_C),this.sign(a-6,`vault`,1),i}cloudRide(e,t,n,r={}){this.run(e);let i=this.run(t,{kind:`cloud`,turn:r.turn,rise:r.rise});this.run(n);let a=i-Math.min(30,e-2);return this.add(`cloud`,a,{len:t+(i-a)+4,params:{gap:i-a,len:t}}),this.flag(a-_C),i}wallRun(e,t={}){let n=this.run(e,{bankIn:Math.min(.3,30/e),...t,kind:`wall`});return this.add(`wallrun`,n,{len:e}),this.flag(n-_C),n}riverRun(e,t={}){let n=this.run(e,{width:13,...t,kind:`river`});return this.add(`river`,n,{len:e}),this.flag(n-_C),n}dogChase(e,t,n=-1){return this.flag(e-_C),this.sign(e-20,`dog`,n),this.add(`dog`,e,{len:t,params:{side:n}})}yarnChase(e,t){return this.flag(e-_C),this.sign(e-20,`yarn`,1),this.add(`yarnchase`,e,{len:t})}},yC=[[`fish`,1],[`logs`,1],[`branches`,1],[`rocks`,2],[`gap`,2],[`mixed`,3],[`vault`,3],[`river`,4],[`bamboo`,5],[`wall`,5],[`dog`,7],[`yarn`,9]],bC=new Set([`vault`,`river`,`wall`,`dog`,`yarn`]),xC=`fish`,SC=-10,CC=e=>e()<.5?-1:1,wC=[`meadow`,`gorge`,`sunset`],TC=-1,EC={id:`endless`,index:3,name:`Endless Run`,blurb:`How far can Mochi go?`,get theme(){return wC[TC%wC.length]},music:`endless`,speed:{start:19,max:30,rampDist:9e3},scoreTarget:0,bells:0,start:{x:0,y:0,z:0,heading:0,width:9},chunk(e,t,n){let r=new vC(e);if(n===0){TC++,xC=`fish`,SC=-10;let e=r.run(90,{turn:nh(t,-20,20)});return r.fish(e+24,0,8,3,`wave`,{amp:2}).yarn(e+70,2),r.pieces}let i=Math.min(1,n/30),a=rh(t,yC.filter(([e,t])=>n>=t&&e!==xC&&!(bC.has(e)&&n-SC<2)).map(([e])=>e));xC=a,bC.has(a)&&(SC=n);let o=r.run(nh(t,40,60),{turn:nh(t,-35,35),rise:nh(t,-4,4)});r.fish(o+8,nh(t,-2,2),5,3);let s=()=>nh(t,-45,45),c=(e,t)=>Math.round(e+(t-e)*i),l;switch(a){case`fish`:l=r.run(130,{turn:s(),rise:nh(t,-6,6)}),r.fish(l+6,0,10,3,`wave`,{amp:2.4}).treat(l+50,nh(t,-2,2)).yarn(l+80,nh(t,-2,2)).fish(l+96,nh(t,-2,2),8,3);break;case`logs`:{let e=c(2,4);l=r.run(40+e*32,{turn:s()});for(let n=0;n<e;n++){let e=l+20+n*32;t()<.35+i*.3?r.log(e,CC(t)*2.25,4.5):r.log(e).fish(e-8,0,6,2.6,`arc`,{h:2})}break}case`branches`:{let e=c(2,3);l=r.run(40+e*34,{turn:s()});for(let t=0;t<e;t++)r.branch(l+20+t*34).fish(l+34+t*34,0,3,2.5,`line`,{y:.45});break}case`rocks`:{let e=c(3,6);l=r.run(30+e*22,{turn:s()});let n=CC(t)*2.3;for(let i=0;i<e;i++)r.rock(l+18+i*22,n,nh(t,.8,1.1)),n=-n;r.yarn(l+10+e*11,0);break}case`mixed`:l=r.run(150,{turn:s(),rise:nh(t,-8,8)}),r.log(l+20).rock(l+50,CC(t)*2.3).branch(l+80).log(l+110,CC(t)*2.25,4.5).fish(l+124,0,6,3);break;case`bamboo`:{let e=c(3,5),n=Math.round(1.45*(EC.speed.start+(EC.speed.max-EC.speed.start)*i));l=r.run(40+e*n,{turn:s()*.5});let a=CC(t)*2.6;for(let t=0;t<e;t++)r.bamboo(l+20+t*n,a,3,2.4).fish(l+20+t*n+Math.round(n*.4),-a,3,3),a=-a;break}case`gap`:{let e=r.gapJump(36,Math.round(8+6*i),28,{hint:n<6?`JUMP!`:``});r.fish(e-5,0,7,2.6,`arc`,{h:2.2});break}case`vault`:{let e=Math.round(22+8*i),t=uS(r.vaultGap(42,e,36),e);r.treat(t.mid,0,t.height-.2);break}case`river`:{let e=Math.round(220+120*i);l=r.riverRun(e,{turn:s()}),r.fish(l+16,CC(t)*3,8,3);let n=l+56,a=CC(t)*2.6;for(;n<l+e-30;){let e=t();e<.45?r.riverrock(n,a,nh(t,.9,1.3)):e<.75?r.driftlog(n,a*.9,5):r.rapid(n).fish(n-7,0,5,3,`arc`,{h:2.2}),r.fish(n+12,-a,4,3),a=-a,n+=nh(t,34,48)}r.run(30,{width:9});break}case`wall`:{let e=Math.round(110+40*i),n=t()<.6;l=r.wallRun(e,n?{rise:nh(t,20,34),bank:CC(t)*35,turn:s()*.5}:{bank:CC(t)*55,turn:s()*.6}),r.fish(l+12,0,8,3,`wave`,{amp:2}).yarn(l+e-20,0),r.run(34,{bank:0});break}case`dog`:{let e=Math.round(280+120*i);l=r.run(e+40,{turn:s(),rise:nh(t,-8,4)}),r.dogChase(l+12,e,CC(t));for(let n=l+60;n<l+e-20;n+=nh(t,60,80))t()<.6?r.log(n):r.branch(n),r.fish(n+16,0,6,3);break}case`yarn`:{let e=Math.round(300+100*i);l=r.run(e+40,{rise:-nh(t,10,24),turn:s()}),r.yarnChase(l+14,e);for(let n=l+70;n<l+e-20;n+=nh(t,90,120))r.log(n).fish(n+14,0,6,3);break}}return r.pieces}},DC={id:`gorge`,index:1,name:`River Gorge`,blurb:`Claws out: up the cliffs and down the river.`,theme:`gorge`,music:`gorge`,speed:{start:20,max:26,rampDist:2400},scoreTarget:94e4,bells:7,start:{x:0,y:0,z:0,heading:0,width:9},build(e){let t=new vC(e),n=t.run(60);t.fish(n+18,0,8,3,`wave`,{amp:2.2}),n=t.run(170,{turn:30}),t.log(n+20).fish(n+34,-2.4,5,3).rock(n+58,2.3).rock(n+80,-2.3).yarn(n+96,0),t.log(n+120,2.25,4.5).log(n+148,-2.25,4.5).fish(n+140,2.4,3,3),n=t.run(150,{turn:-30,width:8}),t.branch(n+30).fish(n+44,0,6,3).rock(n+76,0,1.1).treat(n+96,2.2).log(n+124),n=t.wallRun(170,{rise:42,bank:-60,turn:20}),t.fish(n+14,0,8,3,`wave`,{amp:2}).bell(0,n+90,2.6,1).fish(n+112,-1.5,6,3).yarn(n+150,1.5),t.run(30,{bank:0}),n=t.run(120,{turn:-20}),t.branch(n+30).fish(n+46,0,8,3).treat(n+80,-2).rock(n+100,2.2),n=t.run(120,{rise:-38,turn:25}),t.log(n+36).fish(n+29,0,7,2.5,`arc`,{h:2.1}).yarn(n+70,-2).fish(n+86,2,6,3),n=t.riverRun(540,{turn:40}),t.fish(n+16,-3,8,3).riverrock(n+52,2.6,1.2).riverrock(n+76,-2.6).driftlog(n+112,-2.5,5),t.fish(n+126,3,6,3).rapid(n+180).bell(1,n+181,0,2.8).fish(n+196,0,6,3),t.riverrock(n+236,0,1.3).fish(n+250,0,10,3,`wave`,{amp:3}).driftlog(n+300,2.5,5),t.riverrock(n+334,-3).yarn(n+360,3.4).rapid(n+410).fish(n+403,0,5,3,`arc`,{h:2.2}),t.riverrock(n+452,2,1.2).driftlog(n+482,-2.6,5).fish(n+500,0,6,3),t.run(30,{width:9}),n=t.run(60,{kind:`bridge`,width:6}),t.fish(n+6,0,12,4).heartTreat(n+57,0),t.run(24,{width:9}),n=t.run(480,{turn:-50,rise:-6}),t.dogChase(n+12,470,1),t.fish(n+30,0,6,3).log(n+70).fish(n+63,0,6,2.5,`arc`,{h:2}),t.log(n+140,-2.25,4.5).log(n+170,2.25,4.5).treat(n+200,0).log(n+240),t.fish(n+256,0,8,3).bell(2,n+300,0,1).log(n+340).branch(n+400).fish(n+420,0,6,3),n=t.wallRun(150,{bank:58,turn:-30}),t.fish(n+16,0,8,3).bell(3,n+80,-2.6,1).fish(n+100,1.5,6,3),t.run(36,{bank:0});let r=t.vaultGap(45,30,40),i=uS(r,30);t.bell(4,i.mid,0,i.height-.3);let a=i.plant+(i.land-i.plant)*.2,o=dS(r,30,a);t.fish(a,0,4,(i.land-i.plant)*.6/3,`arc`,{y:o+.5,h:i.height-.9-o}),n=t.run(260,{turn:30,rise:5}),t.fish(n+10,0,8,3,`wave`,{amp:2.4}).rock(n+48,-2.3).rock(n+70,2.3).bell(5,n+96,-3.2,1),t.puddle(n+120,1.6).treat(n+140,-2).hint(n+150,`jump`,`GRAB IT IN THE AIR!`,18).bell(6,n+176,0,2.9),t.log(n+210).fish(n+222,0,8,3);let s=t.gapJump(36,10,24,{hint:``});return t.fish(s-5,0,7,2.6,`arc`,{h:2.3}),n=t.run(70,{kind:`bridge`,width:6}),t.fish(n+6,0,10,5),t.run(70,{width:9}),t.finish(t.s-1,`GORGE DONE!`),t.pieces}},OC={id:`meadow`,index:0,name:`Sunny Meadow Canyon`,blurb:`Dinner is at sunset. Run, Mochi, run!`,theme:`meadow`,music:`meadow`,speed:{start:18,max:23,rampDist:2200},scoreTarget:49e4,bells:7,tutorial:!0,start:{x:0,y:0,z:0,heading:0,width:9},build(e){let t=new vC(e),n=t.run(40);t.fish(n+14,0,6,3),n=t.run(130,{turn:35}),t.fish(n+8,0,9,3.2,`wave`,{amp:2.6}).yarn(n+52,2.6).fish(n+72,-2.4,6,3).treat(n+112,0),n=t.run(170,{turn:-25,rise:3}),t.sign(n+2,`jump`,1).hint(n+6,`jump`,`JUMP!`,26),t.log(n+34).fish(n+26,0,7,2.5,`arc`,{h:2}),t.log(n+72),t.log(n+110,-2.25,4.5).fish(n+104,2.4,3,3).log(n+140,2.25,4.5).fish(n+134,-2.4,3,3),n=t.run(150,{turn:30}),t.sign(n+2,`slide`,-1).hint(n+6,`slide`,`SLIDE!`,26),t.branch(n+36).fish(n+54,0,5,2.5,`line`,{y:.45}).branch(n+70).treat(n+92,-2.2).branch(n+116),n=t.run(110,{turn:-20}),t.yarn(n+12,-2).yarn(n+28,2),t.hint(n+44,`jump`,`GRAB IT IN THE AIR!`,20).bell(0,n+70,0,2.9),t.fish(n+80,0,5,3);let r=t.gapJump(40,9,24);t.fish(r-4,0,6,2.6,`arc`,{h:2.2}),n=t.run(60,{kind:`bridge`,width:6}),t.fish(n+6,0,12,4),t.run(25,{width:9}),n=t.run(270,{turn:-70,rise:-16}),t.rock(n+25,-2.3).rock(n+45,2.3).rock(n+68,0,1.05),t.fish(n+80,0,7,3,`wave`,{amp:2.2}),t.sign(n+108,`water`,1).puddle(n+130,-1.8).bell(1,n+150,3.3,1).puddle(n+172,1.8),t.rock(n+205,-2.4).rock(n+228,2.4).treat(n+250,0);let i=t.vaultGap(50,26,40),a=uS(i,26);t.bell(2,a.mid,0,a.height-.3),t.fish(i+26+10,0,6,3),n=t.run(220,{turn:40,rise:14}),t.log(n+30).branch(n+62).log(n+96,-2.25,4.5).fish(n+90,2.4,4,3).rock(n+128,2.2),t.yarn(n+150,-2).branch(n+170).fish(n+186,0,6,3);let o=t.gapJump(40,17,30,{hint:`JUMP TWICE TO POUNCE!`});t.bell(3,o+9,0,3.6),n=t.run(170,{turn:-35,rise:-4}),t.fish(n+10,2.2,8,3).rock(n+46,-2.2).rock(n+66,2.2).treat(n+84,0),t.bell(4,n+110,-3.3,1).puddle(n+130,1.6).yarn(n+152,-2);let s=t.vaultGap(45,28,40,{turn:10}),c=uS(s,28),l=c.plant+(c.land-c.plant)*.25,u=dS(s,28,l);return t.fish(l,0,6,(c.land-c.plant)*.5/5,`arc`,{y:u+.5,h:c.height-u}),t.bell(5,s+28+22,0,1),n=t.run(190,{turn:25}),t.fish(n+10,0,10,3,`wave`,{amp:2.5}).bell(6,n+64,2.8,1),t.log(n+92).fish(n+104,0,8,3).treat(n+140,-2).yarn(n+160,2),t.run(60),t.finish(t.s-1,`FINISH!`),t.pieces}},kC={id:`sunset`,index:2,name:`Sunset Hills`,blurb:`Over the big canyon to Grandma's cottage.`,theme:`sunset`,music:`sunset`,speed:{start:21,max:28,rampDist:2600},scoreTarget:86e4,bells:7,ending:!0,start:{x:0,y:0,z:0,heading:0,width:9},build(e){let t=new vC(e),n=t.run(60);t.fish(n+16,0,8,3),n=t.run(170,{turn:25,rise:8}),t.yarn(n+16,-2.2).yarn(n+40,2.2).treat(n+62,0).yarn(n+84,-2.2).log(n+110).fish(n+103,0,6,2.5,`arc`,{h:2}),t.yarn(n+140,2.2).treat(n+158,-1.5),n=t.run(150,{turn:-30,rise:-8}),t.fish(n+10,0,8,3,`wave`,{amp:2.4}).rock(n+50,-2.2).yarn(n+70,2.4).rock(n+92,2.2).treat(n+112,-2).yarn(n+132,0);let r=t.cloudRide(42,440,34,{turn:40}),i=3.8;for(let e=0;e<8;e++)t.ring(r+30+e*46,(e%3-1)*2.4,4.3+e%2*.6);t.fish(r+46,-2,6,3,`line`,{y:i}).bell(0,r+112,2.4,5),t.fish(r+150,0,8,3,`arc`,{y:i,h:1.6}).bell(1,r+232,0,5.2),t.fish(r+280,2,6,3,`line`,{y:i}).fish(r+318,-2,6,3,`line`,{y:i}),t.fish(r+366,0,6,3,`arc`,{y:i,h:1.4}).bell(2,r+398,0,5.2),n=t.run(480,{turn:-40});let a=[2.6,-2.6,0,2.6,-2.6,2.6,0,-2.6,2.6,-2.6];for(let e=0;e<a.length;e++){let r=n+30+e*36;e===3||e===7?t.branch(r):t.bamboo(r,a[e],3,a[e]===0?2.6:2.4),e%2==0&&e!==6&&t.fish(r+12,a[e]===0?2.6:-a[e],3,3)}t.bell(3,n+30+216+18,-3.3,1).yarn(n+420,0).treat(n+450,2),n=t.run(520,{rise:-30,turn:30}),t.yarnChase(n+16,480),t.fish(n+30,0,8,3).log(n+110).fish(n+140,0,8,3).fish(n+206,0,6,3).bell(4,n+230,0,1),t.log(n+290).fish(n+320,0,8,3).log(n+420).treat(n+450,0),n=t.wallRun(160,{rise:32,bank:-58,turn:-25}),t.fish(n+16,0,8,3,`wave`,{amp:2}).fish(n+100,1.5,6,3).yarn(n+140,-1.5),t.run(34,{bank:0});let o=uS(t.vaultGap(45,30,40),30);return t.bell(5,o.mid,0,o.height-.3),n=t.run(180,{turn:20}),t.sign(n+4,`water`,-1).puddle(n+26,-1.7).puddle(n+52,1.7).fish(n+70,0,6,3).puddle(n+100,-1.2).rock(n+128,2.3).treat(n+150,-2),n=t.run(700,{turn:-20,rise:-10}),t.fish(n+10,0,10,3,`wave`,{amp:2.6}).log(n+70).rock(n+100,-2.3).rock(n+122,2.3),t.fish(n+140,0,8,3).branch(n+190).fish(n+210,0,6,3).yarn(n+240,2),t.log(n+280,-2.25,4.5).log(n+310,2.25,4.5).fish(n+330,0,8,3,`wave`,{amp:2}).treat(n+370,0),t.fish(n+384,2.4,6,3).hint(n+392,`jump`,`GRAB IT IN THE AIR!`,20).bell(6,n+418,2.4,2.6),t.fish(n+440,0,12,3).treat(n+490,-2).treat(n+520,2).fish(n+560,0,12,3),t.run(40),t.pieces}};function AC(){for(let e of[OC,DC,kC,EC])yf.add(e)}function jC(){tb(),Fb(),ux(),Mh(`meadow`)}function MC(e){let t=Math.sin(e*127.1+311.7)*43758.5453;return t-Math.floor(t)}function NC(e,t){let n=Math.sin(e*127.1+t*311.7+74.7)*43758.5453;return n-Math.floor(n)}var PC=e=>e*e*(3-2*e);function FC(e,t=0){let n=Math.floor(e),r=e-n,i=NC(n,t);return i+(NC(n+1,t)-i)*PC(r)}function IC(e,t=0){return FC(e,t)*.57+FC(e*2.03+17.1,t+3)*.29+FC(e*4.11+41.3,t+7)*.14}function LC(e,t,n=0){let r=Math.floor(e),i=Math.floor(t),a=PC(e-r),o=PC(t-i),s=n*57.3,c=NC(r+s,i),l=NC(r+1+s,i),u=NC(r+s,i+1),d=NC(r+1+s,i+1);return c+(l-c)*a+(u-c)*o+(c-l-u+d)*a*o}var RC=e=>e<0?0:e>1?1:e;function zC(e,t,n){let r=RC((n-e)/(t-e));return r*r*(3-2*r)}var BC=(e,t,n)=>e+(t-e)*n;function VC(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}var HC={active:!1,pos:new H,front:new H(0,0,-1),door:new H,gate:new H,yaw:0,chimney:new H};function UC(e,t){let n=e.index?e.toNonIndexed():e;n!==e&&e.dispose();for(let e of Object.keys(n.attributes))e!==`position`&&e!==`normal`&&n.deleteAttribute(e);n.deleteAttribute(`normal`),n.computeVertexNormals();let r=new W(t),i=new Float32Array(n.attributes.position.count*3);for(let e=0;e<i.length;e+=3)i[e]=r.r,i[e+1]=r.g,i[e+2]=r.b;return n.setAttribute(`color`,new ci(i,3)),n}function WC(e,t,n,r,i,a,o,s,c=0,l=0,u=0){let d=new Ha(t,n,r);d.rotateX(u),d.rotateZ(l),d.rotateY(c),d.translate(a,o,s),e.push(UC(d,i))}function GC(e,t,n,r,i,a,o,s,c){let l=new Ga(t,n,r,i);l.translate(o,s+r/2,c),e.push(UC(l,a))}function KC(e,t,n,r,i,a,o=0){e.push(UC(new fs(t,o).translate(r,i,a),n))}function qC(e,t,n){if(!e.length)return null;let r=Fg(e,!1);for(let t of e)t.dispose();let i=new K(r,t);return i.castShadow=n,i.receiveShadow=n,i}function JC(e){let t=document.createElement(`canvas`);t.width=256,t.height=96;let n=t.getContext(`2d`);n.fillStyle=`#8a5a34`,n.fillRect(0,0,256,96),n.fillStyle=`#a8744a`;for(let e=0;e<4;e++)n.fillRect(0,6+e*24,256,10);n.strokeStyle=`#5a3a20`,n.lineWidth=8,n.strokeRect(4,4,248,88),n.font=`bold 54px "Trebuchet MS", system-ui, sans-serif`,n.textAlign=`center`,n.textBaseline=`middle`,n.fillStyle=`#fff4dc`,n.fillText(e,128,52);let r=new Ra(t);return r.colorSpace=Jt,r}var YC=Wf(),XC=new qn,ZC=new H,QC=new H(0,1,0);function $C(e,t,n,r){e.sample(t,YC);let i=new H(YC.fwd.x,0,YC.fwd.z).normalize();ZC.crossVectors(QC,i),r.makeBasis(ZC,QC,i);let a=YC.pos.clone().addScaledVector(YC.right,n);return r.setPosition(a),r}function ew(e,t,n,r,i,a){let o=new U,s=[],c=new As({vertexColors:!0}),l=new Qi({color:16765562,fog:!0});s.push(c,l);let u=e.length;e.sample(u,YC);let d=YC.pos.y,f=!a;{$C(e,u+22,0,XC);let t=new Wa(70,40).rotateX(-Math.PI/2),r=t.attributes.position.count,a=new Float32Array(r*3),c=new W,l=new W(n.grassB);for(let e=0;e<r;e++){let r=t.attributes.position.getX(e),i=t.attributes.position.getZ(e);c.setHex(n.grassA).lerp(l,.5+.5*Math.sin(r*.1)*Math.cos(i*.13)),a[e*3]=c.r,a[e*3+1]=c.g,a[e*3+2]=c.b;let o=Math.hypot(r,i);t.attributes.position.setY(e,-.12-Math.max(0,o-30)*Math.max(0,o-30)*.012)}t.setAttribute(`color`,new ci(a,3));let p=t.attributes.uv;for(let e=0;e<r;e++)p.setXY(e,t.attributes.position.getX(e)/7,t.attributes.position.getZ(e)/7);t.computeVertexNormals();let m=new K(t,i);m.applyMatrix4(XC),m.position.y=d,m.receiveShadow=f,o.add(m),s.push(t)}if(!r)return HC.active=!1,{group:o,update(){},dispose(){o.removeFromParent();for(let e of s)e.dispose()}};let p=u+16,m=[],h=[],g=4.2;WC(m,9.6,.7,7.6,12101002,0,.25,0),WC(m,9,g,7,16049864,0,2.7,0);let _=6964264;for(let e of[-9/2,-1.6,1.6,9/2])WC(m,.28,g,.2,_,e,2.7,3.55);WC(m,9.1,.3,.22,_,0,4.7,3.55),WC(m,9.1,.25,.22,_,0,.75,3.55);for(let e of[-1,1])WC(m,.2,g,.28,_,e*4.55,2.7,-7/2),WC(m,.2,.3,7.1,_,e*4.55,4.7,0),WC(m,.18,3.6,.2,_,e*(9/2-1.1),2.6,3.56,0,e*.62);let v=11883067,y=3.2,b=Math.atan2(y,4.1),x=Math.hypot(y,4.4);for(let e of[-1,1])for(let t=0;t<6;t++){let n=(t+.5)/6,r=e*4.4*(1-n),i=4.8+y*n;WC(m,10.4,.22,x/6+.12,t%2?v:12738116,0,i-.05,r,0,0,e*b)}WC(m,10.6,.35,.5,9321258,0,8.05,0);for(let e of[-1,1]){let t=new Si,n=9/2*e,r=4.8,i=e>0?[n,r,7/2,n,r,-7/2,n,8,0]:[n,r,-7/2,n,r,7/2,n,8,0];t.setAttribute(`position`,new G(i,3)),m.push(UC(t,16049864)),KC(h,.55,16765562,e*4.52,6,0,1)}WC(m,1.1,3.4,1.1,10504758,2.6,4.8+2.4,-1.2),WC(m,1.4,.3,1.4,8009768,2.6,8.95,-1.2),WC(m,1.9,3,.2,16315106,0,2.1,3.6),WC(m,1.5,2.7,.22,4165498,0,.6+1.35,3.64),KC(m,.1,16765286,.5,2,3.8),WC(m,2.4,.18,1.1,v,0,3.85,4.05,0,0,-.35);for(let e of[-1,1]){let t=e*2.9;WC(h,1.4,1.3,.1,16765562,t,2.75,3.58),WC(m,1.6,.14,.18,16315106,t,3.45,3.6),WC(m,1.6,.14,.18,16315106,t,2.05,3.6),WC(m,.1,1.3,.18,16315106,t,2.75,3.62),WC(m,1.4,.1,.16,16315106,t,2.75,3.62);for(let e of[-1,1])WC(m,.55,1.5,.1,4165498,t+e*1.05,2.75,3.6);WC(m,1.6,.4,.45,9067060,t,1.85,3.8);let n=[16739210,16765286,16752327,16777215];for(let e=0;e<6;e++)KC(m,.17,n[e%n.length],t-.65+e*.26,2.15,3.85)}GC(m,.04,.04,1.4,4,4473924,-2.8,8,0);{let e=new gs(.35,8,6).scale(1.6,.7,.25).translate(-2.8,9.4,0);m.push(UC(e,16757575));let t=new Ka(.3,.5,3).rotateZ(Math.PI/2).scale(1,1,.3).translate(-3.55,9.4,0);m.push(UC(t,16757575))}WC(m,2.6,.3,1,12101002,0,.15,4.3),WC(m,1.4,.04,.8,12597547,0,.32,4.3),KC(m,2.2,n.leafA,-9/2-3.6,4.6,-1.5,1),KC(m,1.6,n.leafB,-9/2-2.6,5.6,-.6,1),GC(m,.3,.4,3.6,6,n.trunk,-9/2-3.4,0,-1.3);for(let[e,t,r]of[[-9/2-.6,4.1,.8],[5.2,3.9,.9],[6.1,-1,1.1]])KC(m,r,n.bush,e,r*.6,t,1);let S=qC(m,c,f);S&&(S.receiveShadow=!1);let C=qC(h,l,!1);e.sample(Math.min(p,e.length),YC);let w=new H(YC.fwd.x,0,YC.fwd.z).normalize(),T=YC.pos.clone().addScaledVector(w,p-e.length+7/2+1);T.y=d-.1;let E=Math.atan2(-w.x,-w.z);for(let e of[S,C])e&&(e.position.copy(T),e.rotation.y=E,o.add(e),s.push(e.geometry));HC.active=!0,HC.pos.copy(T),HC.front.copy(w).negate(),HC.yaw=E,HC.door.copy(T).addScaledVector(HC.front,4.9),HC.chimney.set(2.6,9.2,-1.2).applyAxisAngle(QC,E).add(T);let D=[],O=[];e.sample(t,YC);let k=YC.width/2,A=k+1.8;for(let e of[-1,1]){WC(D,.7,4.6,.7,13219738,e*A,2.3,0),WC(D,.9,.3,.9,11048570,e*A,4.7,0);for(let t=0;t<4;t++)WC(D,.18,1.5,.08,16644332,e*(A-.6),.85,.35+t*.32,0,0,0);WC(D,.1,.12,1.3,16644332,e*(A-.6),1.3,.85),GC(D,.06,.06,.6,4,3355443,e*A,4.85,0),WC(O,.4,.5,.4,16765562,e*A,5.7,0),WC(D,.55,.12,.55,3355443,e*A,6,0)}WC(D,A*2+1,.4,.4,9067060,0,6.35,0);let j=JC(`HOME`),M=new As({map:j});s.push(j,M);let N=new K(new ms(3.2,1.2),M);for(let e of[-1,1]){let t=new Ka(.32,.5,3).translate(e*1.2,7.55,0);D.push(UC(t,9067060))}let ee=qC(D,c,f),P=qC(O,l,!1);$C(e,t,0,XC);for(let e of[ee,P])e&&(e.applyMatrix4(XC),o.add(e),s.push(e.geometry));N.position.set(0,7.05,-.25).applyMatrix4(XC),N.quaternion.setFromRotationMatrix(XC).multiply(new Cn().setFromAxisAngle(QC,Math.PI)),o.add(N),s.push(N.geometry),HC.gate.setFromMatrixPosition(XC);let te=[],ne=VC(8);for(let r=t+1.5;r<e.length+8;r+=.9)for(let t of[-1,1]){let i=Math.min(r,e.length);e.sample(i,YC);let a=r-i,o=YC.pos.clone().addScaledVector(YC.right,t*(YC.width/2+1.8)).addScaledVector(new H(YC.fwd.x,0,YC.fwd.z).normalize(),a),s=new Ha(.16,1.2,.08);if(s.translate(0,.6,0),s.rotateY(Math.atan2(YC.fwd.x,YC.fwd.z)),s.translate(o.x,o.y-.1,o.z),te.push(UC(s,16644332)),ne()<.5){let e=n.flowers[Math.floor(ne()*n.flowers.length)],t=new fs(.16,0).translate(o.x+(ne()-.5)*.8,o.y+.25,o.z+(ne()-.5)*.8);te.push(UC(t,e))}}for(let n of[-1,1])for(let r of[.45,.95])for(let i=t+1.5;i<e.length;i+=4){let t=new H,a=new H;e.toWorld(i,n*(k+1.8),0,t),e.toWorld(Math.min(e.length,i+4),n*(k+1.8),0,a),t.y+=r-.1,a.y+=r-.1;let o=t.distanceTo(a);if(o<.05)continue;let s=new Ha(.06,.1,o);s.lookAt(new H().subVectors(a,t)),s.translate((t.x+a.x)/2,(t.y+a.y)/2,(t.z+a.z)/2),te.push(UC(s,15854296))}let re=Math.max(2,Math.round(T.distanceTo(YC.pos)/1.6));e.sample(e.length,YC);for(let e=0;e<re;e++){let t=(e+.5)/re,n=new H().lerpVectors(YC.pos,HC.door,t),r=new Ga(.55+ne()*.15,.6,.12,7).translate(n.x+(e%2?.35:-.35),d-.02,n.z);te.push(UC(r,14208440))}let ie=qC(te,c,f);ie&&(o.add(ie),s.push(ie.geometry));let ae=0;return{group:o,update(e){ae+=e,ae>.22&&(ae=0,Jm(HC.chimney.x+(Math.random()-.5)*.4,HC.chimney.y,HC.chimney.z,.3+Math.random()*.3,1.4,.2,3.4,.9+Math.random()*.6,15920358,-.25))},dispose(){HC.active=!1,o.removeFromParent();for(let e of s)e.dispose()}}}var tw=(e,t=1)=>`rgba(${e>>16&255},${e>>8&255},${e&255},${t})`;function nw(e,t,n){let r=(e>>16&255)+((t>>16&255)-(e>>16&255))*n,i=(e>>8&255)+((t>>8&255)-(e>>8&255))*n,a=(e&255)+((t&255)-(e&255))*n;return Math.round(r)<<16|Math.round(i)<<8|Math.round(a)}function rw(e,t){let n=document.createElement(`canvas`);return n.width=e,n.height=t,[n,n.getContext(`2d`)]}function iw(e,t,n,r,i,a,o=!1){a(n,r),r-i<0&&a(n,r+t),r+i>t&&a(n,r-t),o&&(n-i<0&&a(n+e,r),n+i>e&&a(n-e,r))}function aw(e,t=!0){let n=new Ra(e);return n.colorSpace=Jt,t&&(n.wrapS=n.wrapT=Ee),n.anisotropy=4,n.needsUpdate=!0,n}function ow(e,t=!1){let[n,r]=rw(256,512),i=VC(t?77:11),a=t?nw(e.rockB,12102294,.35):e.dirt,o=t?nw(e.rockDark,9076848,.3):e.dirtDark,s=t?nw(e.rockC,15260870,.3):e.dirtLight,c=r.createLinearGradient(0,0,256,0);c.addColorStop(0,tw(o)),c.addColorStop(.16,tw(a)),c.addColorStop(.5,tw(nw(a,s,.45))),c.addColorStop(.84,tw(a)),c.addColorStop(1,tw(o)),r.fillStyle=c,r.fillRect(0,0,256,512);for(let e=0;e<70;e++){let e=i()*256,t=i()*512,n=8+i()*26,a=i()<.5?o:s;iw(256,512,e,t,n,(e,t)=>{r.fillStyle=tw(a,.12+i()*.12),r.beginPath(),r.ellipse(e,t,n*.8,n*1.6,0,0,Math.PI*2),r.fill()})}if(t){let t=0,n=[e.rockA,e.rockC,e.rockB,e.rockA,e.rockC,e.rockDark,e.rockA,e.rockC],a=0;for(;t<256;){let o=10+i()*34;r.fillStyle=tw(nw(n[a++%n.length],13154464,.15),.85),r.fillRect(t,0,o,512),r.fillStyle=tw(e.rockDark,.35),r.fillRect(t+o-2,0,2,512),t+=o}for(let t=0;t<6;t++){let t=40+i()*176,n=i()*512;for(let i=0;i<3;i++)iw(256,512,t,n,50,(t,n)=>{r.strokeStyle=tw(16774368,.4),r.lineWidth=2.5,r.beginPath(),r.moveTo(t+i*8,n),r.lineTo(t+i*8+3,n+44),r.stroke(),r.strokeStyle=tw(e.rockDark,.5),r.lineWidth=1.2,r.beginPath(),r.moveTo(t+i*8+2,n+2),r.lineTo(t+i*8+5,n+46),r.stroke()})}}else for(let e of[.36,.64])r.fillStyle=tw(s,.18),r.fillRect(e*256-10,0,20,512);for(let e=0;e<(t?40:110);e++){let e=18+i()*220,t=i()*512,n=1.5+i()*(i()<.15?6:3);iw(256,512,e,t,n+2,(e,t)=>{r.fillStyle=tw(o,.75),r.beginPath(),r.ellipse(e,t+1,n,n*.8,0,0,Math.PI*2),r.fill(),r.fillStyle=tw(nw(s,16777215,.3),.85),r.beginPath(),r.ellipse(e-n*.2,t-n*.25,n*.7,n*.5,0,0,Math.PI*2),r.fill()})}r.strokeStyle=tw(o,.5),r.lineWidth=1.5;for(let e=0;e<10;e++){let e=30+i()*196,t=i()*512;r.beginPath(),r.moveTo(e,t);for(let n=0;n<5;n++)e+=(i()-.5)*18,t+=6+i()*10,r.lineTo(e,t);r.stroke()}let l=r.getImageData(0,0,256,512),u=l.data;for(let e=0;e<512;e++){let t=e/512,n=.045+.025*Math.sin(t*Math.PI*2*3+1.3)+.018*Math.sin(t*Math.PI*2*7+.4)+.012*Math.sin(t*Math.PI*2*13),r=.045+.025*Math.sin(t*Math.PI*2*4+2.1)+.018*Math.sin(t*Math.PI*2*9+2.9)+.012*Math.sin(t*Math.PI*2*11+1);for(let t=0;t<256;t++){let i=t/256,a=Math.min(i-n,1-r-i),o=Math.max(0,Math.min(1,a*60+.5));u[(e*256+t)*4+3]=Math.round(o*255)}}r.putImageData(l,0,0);let d=aw(n);return d.wrapS=De,d}function sw(){let[e,t]=rw(256,256),n=VC(5);t.fillStyle=`#e8e8e8`,t.fillRect(0,0,256,256);for(let e=0;e<60;e++){let e=n()*256,r=n()*256,i=10+n()*30,a=n()<.5?255:205;iw(256,256,e,r,i,(e,n)=>{t.fillStyle=`rgba(${a},${a},${a},0.25)`,t.beginPath(),t.arc(e,n,i,0,Math.PI*2),t.fill()},!0)}for(let e=0;e<900;e++){let e=n()*256,r=n()*256,i=n()<.55?255:190,a=3+n()*6,o=(n()-.5)*.9;iw(256,256,e,r,a,(e,n)=>{t.strokeStyle=`rgba(${i},${i},${i},0.55)`,t.lineWidth=1.2,t.beginPath(),t.moveTo(e,n),t.lineTo(e+Math.sin(o)*a,n-Math.cos(o)*a),t.stroke()},!0)}return aw(e)}function cw(){let[e,t]=rw(256,256),n=VC(9);t.fillStyle=`#ececec`,t.fillRect(0,0,256,256);for(let e=0;e<18;e++){let e=n()*256,r=n()<.5?255:200;t.fillStyle=`rgba(${r},${r},${r},0.4)`;for(let r of[e,e-256,e+256])t.fillRect(0,r,256,2+n()*8)}t.strokeStyle=`rgba(175,175,175,0.35)`,t.lineWidth=1.2;for(let e=0;e<12;e++){let e=n()*256,r=n()*256;t.beginPath(),t.moveTo(e,r);for(let i=0;i<4;i++)e+=(n()-.5)*14,r+=8+n()*14,t.lineTo(e,r);t.stroke()}return aw(e)}function lw(e){let t=2048,[n,r]=rw(t,512);r.clearRect(0,0,t,512);let i=(e,n,i,a,o,s)=>{r.fillStyle=tw(e,s),r.beginPath(),r.moveTo(0,512);let c=VC(a),l=[c()*6,c()*6,c()*6],u=[];for(let e=0;e<o;e++)u.push({x:c()*t,w:40+c()*140,h:i*(.8+c()*1.6)});for(let e=0;e<=t;e+=4){let o=e/t*Math.PI*2,s=n-i*(.5+.3*Math.sin(o*3+l[0])+.15*Math.sin(o*7+l[1])+.08*Math.sin(o*17+l[2]));for(let r of u){let i=Math.abs(e-r.x);i=Math.min(i,t-i);let o=r.w*.5;if(i<o+14){let t=i<o?1:1-(i-o)/14;s=Math.min(s,n-r.h*t-(i<o?MC(Math.floor(e/12)+a)*3:0))}}r.lineTo(e,s)}r.lineTo(t,512),r.closePath(),r.fill()};i(e.ridgeFar,368.64,60,3,9,.85),i(nw(e.ridgeNear,e.ridgeFar,.3),382.64,44,8,7,.95),i(e.ridgeNear,398.64,26,15,5,1);let a=r.createLinearGradient(0,288.64,0,512);a.addColorStop(0,tw(e.fog,0)),a.addColorStop(.55,tw(e.fog,.55)),a.addColorStop(.8,tw(e.fog,1)),a.addColorStop(1,tw(e.fog,1)),r.globalCompositeOperation=`source-atop`,r.fillStyle=a,r.fillRect(0,0,t,512),r.globalCompositeOperation=`source-over`,r.fillStyle=tw(e.fog,1),r.fillRect(0,476.16,t,35.84);let o=aw(n);return o.wrapT=De,o}var uw=new W,dw=new W;function fw(e,t){let n=e.attributes.position,r=new Float32Array(n.count*3),i=new W;for(let e=0;e<n.count;e++)t(n.getX(e),n.getY(e),n.getZ(e),i),r[e*3]=i.r,r[e*3+1]=i.g,r[e*3+2]=i.b;return e.setAttribute(`color`,new ci(r,3)),e}function pw(e,t=!1){let n=e.index?e.toNonIndexed():e;n!==e&&e.dispose();for(let e of Object.keys(n.attributes))e!==`position`&&e!==`normal`&&e!==`color`&&n.deleteAttribute(e);return t&&(n.deleteAttribute(`normal`),n.computeVertexNormals()),n}function mw(e,t,n){let r=e.attributes.position;for(let e=0;e<r.count;e++){let i=r.getX(e),a=r.getY(e),o=r.getZ(e),s=Math.round(i*97)*.13+Math.round(a*89)*.71+Math.round(o*83)*.37+n;r.setXYZ(e,i+(MC(s)-.5)*t,a+(MC(s+9)-.5)*t,o+(MC(s+19)-.5)*t)}return e}function hw(e){let t=Fg(e.map(e=>pw(e)),!1);for(let t of e)t.dispose();return t.userData.shared=!0,t.computeBoundingSphere(),t}function gw(e,t,n,r){return dw.setHex(t),r.setHex(e).lerp(dw,Math.max(0,Math.min(1,n)))}function _w(e){let t=[],n=[],r=VC(3),i=new W(e.grassA).multiplyScalar(.92),a=new W(e.grassB).lerp(new W(16777164),.3);for(let e=0;e<7;e++){let o=e/7*Math.PI*2+r()*.6,s=.06+r()*.12,c=.32+r()*.35,l=.12+r()*.18,u=Math.cos(o)*s,d=Math.sin(o)*s,f=-Math.sin(o)*.055,p=Math.cos(o)*.055;t.push(u-f,0,d-p,u+f,0,d+p,u+Math.cos(o)*l,c,d+Math.sin(o)*l),n.push(i.r,i.g,i.b,i.r,i.g,i.b,a.r,a.g,a.b)}let o=new Si;o.setAttribute(`position`,new G(t,3)),o.setAttribute(`color`,new G(n,3));let s=new Float32Array(t.length);for(let e=0;e<s.length;e+=3)s[e+1]=1;return o.setAttribute(`normal`,new ci(s,3)),o.userData.shared=!0,o.computeBoundingSphere(),o}function vw(e,t,n,r,i,a,o=1){let s=new fs(e,i);return mw(s,e*.22,a),s.scale(1,o,1),s.translate(t,n,r),s}function yw(e){let t=[vw(.85,0,.55,0,1,1,.85),vw(.65,.7,.45,.2,1,2,.85),vw(.6,-.6,.42,-.25,1,3,.85),vw(.55,.1,.9,-.4,1,4,.85)];for(let n of t)fw(n,(t,n,r,i)=>{gw(e.leafDark,e.bush,n/1.1,i),n>1.05&&i.lerp(uw.setHex(e.leafB),.5)});return hw(t)}function bw(e,t){let n=VC(t),r=new Ga(.2,.32,3.2,6).translate(0,1.6,0);fw(r,(t,n,r,i)=>gw(e.trunk,5913124,1-n/3.2,i));let i=[r];for(let[r,a,o,s]of[[1.7,0,3.9,0],[1.25,1.2,3.4,.3],[1.2,-1.1,3.5,-.4],[1.15,.2,3.3,1.15],[1.1,-.3,3.4,-1.1],[1.15,.3,5,.1]]){let c=vw(r*(.9+n()*.2),a,o,s,1,t*7+a,.9);fw(c,(t,n,r,i)=>{gw(e.leafDark,e.leafA,(n-2.4)/2.2,i),n>4.6&&i.lerp(uw.setHex(e.leafB),Math.min(1,(n-4.6)/1.2))}),i.push(c)}return hw(i)}function xw(e){let t=VC(21),n=[],r=new W(e.bamboo),i=new W(e.bamboo).multiplyScalar(.62);for(let a=0;a<7;a++){let a=5+t()*4,o=.07+t()*.05,s=new Ga(o*.8,o,a,5,Math.round(a/.9));s.translate(0,a/2,0);let c=(t()-.5)*.12,l=(t()-.5)*.12,u=(t()-.5)*1.3,d=(t()-.5)*1.3,f=s.attributes.position;for(let e=0;e<f.count;e++){let t=f.getY(e);f.setXYZ(e,f.getX(e)+u+c*t,t,f.getZ(e)+d+l*t)}fw(s,(e,t,n,o)=>{let s=t/.9%1;o.copy(s<.12?i:r),o.multiplyScalar(.85+t/a*.25)}),n.push(s);for(let r=0;r<4;r++){let r=a*(.6+t()*.4),i=new Ka(.16,1.1,3);i.rotateZ(Math.PI/2+(t()-.5)*.6),i.rotateY(t()*Math.PI*2),i.translate(u+c*r,r,d+l*r),fw(i,(n,r,i,a)=>gw(e.leafA,e.leafB,t(),a)),n.push(i)}}return hw(n)}function Sw(e){let t=new fs(1,0);mw(t,.35,7),t.scale(1.2,.75,1),t.translate(0,.45,0);let n=t.index?t.toNonIndexed():t;n!==t&&t.dispose(),fw(n,(t,n,r,i)=>gw(e.rockB,e.rockC,(n+.3)/1.4,i).lerp(uw.setHex(10132114),.35));let r=pw(n,!0);return r.userData.shared=!0,r.computeBoundingSphere(),r}function Cw(){let e=new fs(.11,0).translate(0,.32,0);fw(e,(e,t,n,r)=>r.setHex(16777215));let t=new Ga(.015,.02,.3,3).translate(0,.15,0);return fw(t,(e,t,n,r)=>r.setHex(4885040)),hw([e,t])}function ww(e){let t=new Ga(.8,1,1,9,6);t.translate(0,.5,0),mw(t,.09,4);let n=[e.rockA,e.rockC,e.rockB,e.rockA,e.rockC,e.rockB,e.rockA],r=t.index?t.toNonIndexed():t;r!==t&&t.dispose(),fw(r,(e,t,r,i)=>{let a=Math.min(n.length-1,Math.max(0,Math.floor(t*6.5)));i.setHex(n[a]),t<.3&&i.multiplyScalar(.8+t*.6)});let i=new Ga(.86,.82,.04,9,1);i.translate(0,1,0);let a=i.index?i.toNonIndexed():i;a!==i&&i.dispose(),fw(a,(t,n,r,i)=>i.setHex(e.grassA));let o=Fg([pw(r,!0),pw(a,!0)],!1);return o.userData.shared=!0,o.computeBoundingSphere(),o}function Tw(e,t){let n=VC(t),r=[],i=6+Math.floor(n()*4);for(let e=0;e<i;e++){let t=(e/(i-1)-.5)*2.4+(n()-.5)*.3,a=.45+n()*.35+(1-Math.abs(t)/1.4)*.35,o=new fs(a,2);o.translate(t,a*.55+n()*.15,(n()-.5)*.5),r.push(o)}let a=new fs(.75,2).translate((n()-.5)*.6,.95,0);r.push(a);for(let t of r){let n=t.attributes.position;for(let e=0;e<n.count;e++)n.getY(e)<.1&&n.setY(e,.1+(n.getY(e)-.1)*.25);fw(t,(t,n,r,i)=>gw(e.cloudShade,e.cloud,(n-.05)/.9,i))}return hw(r)}var Ew=new Map;function Dw(e,t,n){e.onBeforeCompile=e=>{e.uniforms.uTime=t,e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
uniform float uTime;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 ip = vec2(0.0);
        #endif
        float sw = (sin(uTime * 1.6 + ip.x * 0.23 + ip.y * 0.19) + 0.4 * sin(uTime * 3.1 + ip.x * 0.5)) * ${n.toFixed(3)} * max(0.0, position.y);
        transformed.x += sw;
        transformed.z += sw * 0.6;`)},e.customProgramCacheKey=()=>`sway${n}`}function Ow(e,t){let n=Ew.get(e);if(n)return n;let r={value:0},i=sw(),a=cw(),o=ow(t),s=ow(t,!0),c=new As({vertexColors:!0,map:i}),l=new As({vertexColors:!0,map:a}),u=new As({map:o,alphaTest:.5,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),d=new As({map:s,alphaTest:.5,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),f=new As({vertexColors:!0}),p=new As({vertexColors:!0});Dw(p,r,.012);let m=new As({vertexColors:!0,side:2});Dw(m,r,.1);let h=new As({vertexColors:!0}),g=new As({vertexColors:!0,fog:!1,emissive:new W(t.cloud).multiplyScalar(.45)}),_=new As({vertexColors:!0}),v=new As({color:14205066}),y=new Ha(1,.14,.46);fw(y,(e,t,n,r)=>r.setHex(t>0?11106378:8016436)),y.userData.shared=!0;let b=new Ga(.11,.13,1,6).translate(0,.5,0);fw(b,(e,t,n,r)=>r.setHex(t>.9?11567184:9068346)),b.userData.shared=!0;let x=new Ga(.035,.035,1,4).translate(0,.5,0);x.userData.shared=!0;let S={tuft:_w(t),bush:yw(t),trees:[bw(t,1),bw(t,2),bw(t,3)],bamboo:xw(t),boulder:Sw(t),flower:Cw(),pillar:ww(t),clouds:[Tw(t,1),Tw(t,2),Tw(t,3),Tw(t,4)],plank:y,post:b,rope:x,ground:c,rock:l,dirt:u,wallPath:d,veg:f,vegSway:p,grass:m,solid:h,cloudMat:g,wood:_,ropeMat:v,textures:[i,a,o,s],time:r};return Ew.set(e,S),S}var kw={meadow:{zenith:3114728,skyMid:7321844,horizon:13625847,sunGlow:16774872,ridgeNear:9418708,ridgeFar:11784678,cloud:16777215,cloudShade:12176870,fog:13034226,sun:16773590,sunI:2.6,hemiSky:14085375,hemiGround:8228684,hemiI:1.55,sunDir:[.5,.78,-.38],exposure:1.05,grassA:7127610,grassB:9425482,grassDry:12110170,verge:10464856,dirt:14199922,dirtDark:12159573,dirtLight:15254670,rockA:14264682,rockB:12881749,rockC:15122310,rockDark:10120258,valley:7845962,leafA:4169269,leafB:6273854,leafDark:2914860,trunk:8016434,bamboo:9226314,bush:4629304,flowers:[16777215,16769126,16752327,16757575],waterDeep:1745863,waterShallow:6283488,foam:16056319,mix:{cliff:.36,hill:.34,drop:.3,cliffMin:9,cliffMax:26,hillAmp:7,valleyDepth:26},bambooAmt:.35},gorge:{zenith:2785248,skyMid:6861552,horizon:13297396,sunGlow:16774100,ridgeNear:8826571,ridgeFar:11324384,cloud:16777215,cloudShade:11847906,fog:12640240,sun:16773334,sunI:2.5,hemiSky:13822463,hemiGround:7307336,hemiI:1.55,sunDir:[-.42,.8,-.42],exposure:1.05,grassA:6469690,grassB:8702280,grassDry:11124054,verge:9807446,dirt:13673066,dirtDark:11567439,dirtLight:14859398,rockA:13605987,rockB:11894860,rockC:14595196,rockDark:9068346,valley:6991430,leafA:3510067,leafB:5418556,leafDark:2518570,trunk:7227950,bamboo:8831559,bush:4168246,flowers:[16777215,16773242,13150463],waterDeep:1415106,waterShallow:5430492,foam:15925247,mix:{cliff:.48,hill:.22,drop:.3,cliffMin:16,cliffMax:40,hillAmp:8,valleyDepth:30},bambooAmt:.15},sunset:{zenith:4018088,skyMid:13074352,horizon:16760454,sunGlow:16769696,ridgeNear:10779558,ridgeFar:13802152,cloud:16769224,cloudShade:13208232,fog:16103830,sun:16761477,sunI:2.5,hemiSky:16765632,hemiGround:8282192,hemiI:1.4,sunDir:[-.55,.32,-.62],exposure:1,grassA:7323466,grassB:10014552,grassDry:13156954,verge:11184218,dirt:14458986,dirtDark:12090448,dirtLight:15514246,rockA:14719586,rockB:12745292,rockC:15643260,rockDark:9721402,valley:8171084,leafA:5214004,leafB:7645756,leafDark:3828780,trunk:7226928,bamboo:10273356,bush:5937720,flowers:[16777215,16765286,16748464,16754012],waterDeep:2789311,waterShallow:8378064,foam:16774894,mix:{cliff:.24,hill:.56,drop:.2,cliffMin:8,cliffMax:20,hillAmp:8,valleyDepth:26},bambooAmt:.55}},Aw=`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`,jw=`
uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSun;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
  col = mix(col, uZenith, smoothstep(0.18, 0.75, h));
  float sd = max(dot(d, normalize(uSun)), 0.0);
  col += uGlow * (pow(sd, 6.0) * 0.35 + pow(sd, 60.0) * 0.5);
  col = mix(col, uGlow, smoothstep(0.9993, 0.9997, sd));
  if (h < 0.0) col = uHorizon;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,Mw=26,Nw=class{group=new U;dome;ridge;clouds=new U;floor;birds=new U;wings=[];flock=0;floorTex;ridgeTex;disposables=[];constructor(e,t,n,r){let i=new gs(1200,32,16),a=new Es({vertexShader:Aw,fragmentShader:jw,side:1,depthWrite:!1,fog:!1,uniforms:{uZenith:{value:new W(e.zenith)},uMid:{value:new W(e.skyMid)},uHorizon:{value:new W(e.horizon)},uGlow:{value:new W(e.sunGlow)},uSun:{value:n.clone()}}});this.dome=new K(i,a),this.dome.renderOrder=-10,this.dome.frustumCulled=!1,this.ridgeTex=lw(e),this.ridgeTex.repeat.set(2,1);let o=new Ga(1e3,1e3,520,64,1,!0);o.translate(0,70,0);let s=new Qi({map:this.ridgeTex,transparent:!0,side:1,fog:!1,depthWrite:!1});this.ridge=new K(o,s),this.ridge.renderOrder=-9,this.ridge.frustumCulled=!1;let c=VC(e.zenith&65535),l=r?9:16;for(let e=0;e<l;e++){let n=new K(t.clouds[e%t.clouds.length],t.cloudMat),r=e/l*Math.PI*2+c()*.3,i=700+c()*330,a=22+c()*26;n.position.set(Math.cos(r)*i,55+c()*110,Math.sin(r)*i),n.scale.set(a*(1.2+c()*.6),a*(.8+c()*.4),a),n.lookAt(0,n.position.y,0),n.frustumCulled=!1,this.clouds.add(n)}this.floorTex=sw(),this.floorTex.repeat.set(1900/Mw,1900/Mw);let u=new Wa(950,48).rotateX(-Math.PI/2),d=new As({color:e.valley,map:this.floorTex}),f=new W(e.grassDry),p=new W(e.leafA);d.onBeforeCompile=e=>{e.uniforms.uDry={value:f},e.uniforms.uLush={value:p},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec2 vWP;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vWP = (modelMatrix * vec4(transformed, 1.0)).xz;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
          varying vec2 vWP; uniform vec3 uDry; uniform vec3 uLush;
          float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float fn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }`).replace(`#include <color_fragment>`,`#include <color_fragment>
          float n1 = fn(vWP / 70.0);
          float n2 = fn(vWP / 19.0 + 7.0);
          diffuseColor.rgb *= mix(0.84, 1.1, n1) * mix(0.94, 1.05, n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, uDry, smoothstep(0.62, 0.82, fn(vWP / 150.0 + 3.0)) * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, uLush, smoothstep(0.66, 0.86, fn(vWP / 45.0 + 11.0)) * 0.5);`)},this.floor=new K(u,d),this.floor.receiveShadow=!1,this.floor.frustumCulled=!1;let m=new Si;m.setAttribute(`position`,new G([0,0,.35,0,0,-.35,1.6,.1,0],3)),m.computeVertexNormals();let h=new Qi({color:new W(e.ridgeNear).multiplyScalar(.45),side:2,fog:!1});for(let e=0;e<(r?3:6);e++){let e=new U;for(let t of[-1,1]){let n=new K(m,h);n.scale.x=t,n.frustumCulled=!1,e.add(n),this.wings.push(n)}e.position.set((c()-.5)*40,50+c()*14,260+c()*40),e.scale.setScalar(2.2),this.birds.add(e)}this.group.add(this.dome,this.ridge,this.clouds,this.floor,this.birds),this.disposables.push(m,h),this.disposables.push(i,a,o,s,this.ridgeTex,u,d,this.floorTex)}update(e,t,n){this.dome.position.copy(t),this.ridge.position.set(t.x,t.y*.25+n*.75,t.z),this.clouds.position.set(t.x,n,t.z),this.clouds.rotation.y+=e*.004,this.floor.position.set(t.x,n,t.z),this.flock+=e,this.birds.position.set(t.x,n,t.z),this.birds.rotation.y=this.flock*.05;for(let e=0;e<this.wings.length;e++){let t=this.wings[e],n=this.flock*7+(e>>1)*1.3;t.rotation.z=Math.sin(n)*.6*t.scale.x}let r=1/Mw;this.floorTex.offset.set(t.x*r%1,-t.z*r%1)}dispose(){this.group.removeFromParent();for(let e of this.disposables)e.dispose()}},Pw=[0,.7,1.6,2.8,4,5.2,6.5,8,9.8,12,14.8,18,22,27,33,40,48,57,67],Fw=Pw.length;function Iw(e,t,n,r,i){let a=zC(.24,.76,IC(e/170+r*.37,r)),o=t>0?1-a:a,s=n.cliff+n.hill+n.drop||1,c=n.cliff/s,l=(n.cliff+n.hill)/s,u=.05;return i.cliff=n.cliff>0?1-zC(c-u,c+u,o):0,i.drop=n.drop>0?zC(l-u,l+u,o):0,i.hill=Math.max(0,1-i.cliff-i.drop),i}var Lw={cliff:0,hill:0,drop:0},Rw=e=>e===`gap`||e===`cloud`||e===`bridge`;function zw(e,t){let{s:n,side:r,mix:i,seed:a,floorRel:o}=t;if(t.kind===`cloud`){let t=a+(r>0?101:0),i=9+7*FC(n/40,t+41),s=1+6*FC(n/55,t+43);for(let r=0;r<Fw;r++){let a=Pw[r],c=LC(n/7+t,r*1.7,13)-.5,l=BC(o-1.5,s+.08*(a-i),zC(i,i+2.2,a));a>i-1&&a<i+4&&(l+=c*2.5),l=BC(l,o-3,zC(40,66,a)),r===Fw-1&&(l=o-3),e[r]=l}return}let s=0;Rw(t.kind)&&(s=7+5*FC(n/30,a+(r>0?151:51))),Iw(n,r,i,a,Lw);let c=a+(r>0?101:0),l=BC(i.cliffMin,i.cliffMax,IC(n/90+3.1,c+11)),u=t.open??0,d=(t.kind===`river`?5:3.6)+3.2*FC(n/55,c+5)+u*10,f=FC(n/75,c+9)>.48,p=(t.kind===`river`?4.5:3)+4*FC(n/60,c+21),m=Math.abs(t.bankDeg),h=zC(10,45,m),g=h>0&&Math.sign(t.bankDeg)===-r,_=Math.tan(Math.min(m,72)*Math.PI/180);for(let r=0;r<Fw;r++){let a=Pw[r],u=LC(n/7+c,r*1.7,13)-.5,m=.12*a+.4*LC(n/13,a/5,c+2);m+=f?l*.48*zC(d,d+1.4,a)+l*.52*zC(d+6.5,d+7.9,a):l*zC(d,d+1.5,a),a>d-.2&&(m+=u*.14*l*(1-zC(d+10,d+16,a))+1.6*LC(n/30,a/9,c+4));let v=i.hillAmp*(LC(n/46,a/13,c+6)*1.25-.32)*zC(1.5,15,a)+.04*a,y=.1*a+.25*LC(n/11,a/4,c+8);y=BC(y,o-1,zC(p,p+1.6,a)),a>p&&(y+=u*1.2);let b=Lw.cliff*m+Lw.hill*v+Lw.drop*y;if(t.kind===`river`&&(a<1.2?b=-.35:a<3&&(b=Math.min(b,BC(-.35,.55,(a-1.2)/1.8)))),h>0){if(g){let e=a<3.2?a*_:3.2*_+Math.max(14,l)*zC(3.2,5,a)+u*3;b=BC(b,e,h)}else{let e=BC(-a*_,o-1,zC(.7,2.6,a))+(a>1?u*1.5:0);b=BC(b,e,h)}}a<1.61&&h===0&&(b=Math.min(b,.02+.18*a));let x=zC(38,66,a);if(b=BC(b,o-3,x),r===Fw-1&&(b=o-3),s>0){let e=1-zC(s,s+1.4,a);e>0&&(b=BC(Math.max(b,.3),o-1.5,e)+(e<1?u*1.5:0))}e[r]=b}}function Bw(e,t){if(t<=0)return e[0];for(let n=1;n<Fw;n++)if(t<=Pw[n]){let r=(t-Pw[n-1])/(Pw[n]-Pw[n-1]);return e[n-1]+(e[n]-e[n-1])*r}return e[Fw-1]}function Vw(e,t){return Math.abs(Bw(e,t+.8)-Bw(e,Math.max(0,t-.8)))/1.6}var Hw=3,Uw=Fw*2+Hw,Ww=220,Gw=new Float64Array(Ww),Kw=Array(Ww).fill(`ground`),qw=new Float32Array(Ww*Uw*3),Jw=new Float32Array(Ww*Uw*3),Yw=new Float32Array(Ww),Xw=new Float32Array(Ww),Zw=new Float32Array(440),Qw=new Float32Array(440),$w=new Uint8Array(440),eT=new Float32Array(440*Fw),tT=new Float32Array(Ww*Uw*3),nT=new Float32Array(Ww*Uw*3),rT=new Uint8Array(Ww*Uw),iT=Ww*Uw*6,aT=()=>({n:0,P:new Float32Array(iT*3),N:new Float32Array(iT*3),C:new Float32Array(iT*3),U:new Float32Array(iT*2)}),oT={g:aT(),k:aT()},sT=new Float32Array(2200),cT=[];for(let e=0;e<Ww;e++)cT.push({pos:new H,fwd:new H,right:new H,up:new H,hw:4});var lT=Wf(),uT=Wf(),dT=Wf(),fT=new Float32Array(Fw),pT={s:0,side:1,kind:`ground`,bankDeg:0,floorRel:-25,mix:null,seed:0},mT=new H,hT=new H,gT=new H,_T=new H,vT=new W,yT=new W,bT=new qn,xT=new Cn,ST=new H,CT=new H(0,1,0),wT=new H;function TT(e){return Math.atan2(e.x,e.z)}function ET(e,t,n,r){let i=[t-r];for(let e=t;e<n-.01;e+=r)i.push(e);i.push(n);for(let r of e.segments)for(let e of[r.s0])if(!(e<=t||e>n)){for(let r=i.length-1;r>=1;r--)Math.abs(i[r]-e)<.45&&i[r]!==n&&i[r]!==t&&i.splice(r,1);i.push(e-.03),e<n&&i.push(e+.03)}i.sort((e,t)=>e-t),i.push(n+r);let a=Math.min(Ww,i.length);for(let e=0;e<a;e++)Gw[e]=i[e];return a}var DT=class{sets=new Map;add(e,t,n,r,i,a,o,s,c,l,u){let d=this.sets.get(e);if(d||this.sets.set(e,d={geo:t,mat:n,m:[],c:l?[]:null,cast:c}),u){xT.setFromUnitVectors(CT,u);let e=new Cn().setFromAxisAngle(CT,i);xT.multiply(e)}else xT.setFromAxisAngle(CT,i);ST.set(a,o,s),bT.compose(r,xT,ST);for(let e=0;e<16;e++)d.m.push(bT.elements[e]);if(d.c){let e=l??vT.setRGB(1,1,1);d.c.push(e.r,e.g,e.b)}}addMatrix(e,t,n,r,i){let a=this.sets.get(e);a||this.sets.set(e,a={geo:t,mat:n,m:[],c:null,cast:i});for(let e=0;e<16;e++)a.m.push(r.elements[e])}build(e,t){for(let[,n]of this.sets){let r=n.m.length/16;if(r===0)continue;let i=new xa(n.geo,n.mat,r);i.instanceMatrix.array.set(n.m),i.instanceMatrix.needsUpdate=!0,n.c&&(i.instanceColor=new pa(new Float32Array(n.c),3)),i.castShadow=t&&n.cast,i.receiveShadow=t,i.computeBoundingSphere(),e.add(i)}}};function OT(e,t,n,r,i,a,o,s){let c=e.p,l=LC(t/16,r/16,3);s.setHex(c.grassA).lerp(yT.setHex(c.grassB),l);let u=zC(.62,.8,LC(t/45+7,r/45,5));return s.lerp(yT.setHex(c.grassDry),u*.55),n>a+7&&s.lerp(yT.setHex(c.grassB),.35),i<1.1&&s.lerp(yT.setHex(c.verge),(1.1-i)*.6),n<o+3&&s.lerp(yT.setHex(c.valley),zC(o+3,o,n)),s}var kT=[`rockA`,`rockC`,`rockB`,`rockA`,`rockC`,`rockA`,`rockB`];function AT(e,t,n,r,i,a){let o=e.p,s=(n-i)/2.3+LC((t+r)/14,n/30,9)*.9,c=(Math.floor(s)%kT.length+kT.length)%kT.length;return a.setHex(o[kT[c]]),a.multiplyScalar(.78+.22*zC(i-2,i+14,n)),a}function jT(e,t){let n=1e9,r=e.segments;for(let e=0;e<r.length;e++){let i=r[e];if(i.kind!==`gap`&&i.kind!==`bridge`)continue;let a=t<i.s0?i.s0-t:t>i.s1?t-i.s1:0;a<n&&(n=a)}return 1-zC(4,30,n)}function MT(e,t,n){let{track:r,p:i,kit:a}=e,o=e.quality===`low`,s=new U,c=ET(r,t,n,o?3:2);pT.mix=i.mix,pT.seed=e.seed;for(let t=0;t<c;t++){let n=Gw[t];r.sample(n,lT);let i=cT[t];i.pos.copy(lT.pos),i.fwd.copy(lT.fwd),i.right.copy(lT.right),i.up.copy(lT.up),i.hw=lT.width/2;let a=r.kindAt(n);Kw[t]=a;let o=e.floorAt(n);Yw[t]=o,r.sample(n-10,uT),r.sample(n+10,dT);let s=TT(dT.fwd)-TT(uT.fwd);s>Math.PI&&(s-=Math.PI*2),s<-Math.PI&&(s+=Math.PI*2);let c=Math.abs(s)/20,l=s<0?1:-1,u=i.hw;wT.set(lT.right.x,0,lT.right.z),wT.lengthSq()<1e-6&&wT.set(1,0,0),wT.normalize();for(let e=0;e<2;e++){let i=e===0?-1:1,s=i===l&&c>1e-4?Math.max(5,.8/c-u-2):999;Qw[t*2+e]=s,$w[t*2+e]=+(a===`wall`&&Math.abs(lT.bank)>.35&&Math.sign(lT.bank)===-i),mT.copy(lT.pos).addScaledVector(lT.right,i*u),a===`river`&&mT.addScaledVector(lT.up,0),Zw[t*2+e]=mT.y;let d=(t*2+e)*5;sT[d]=mT.x,sT[d+1]=mT.y,sT[d+2]=mT.z,sT[d+3]=wT.x*i,sT[d+4]=wT.z*i,pT.s=n,pT.side=i,pT.kind=a,pT.open=jT(r,n),Xw[t]=pT.open,pT.bankDeg=lT.bank*180/Math.PI,pT.floorRel=o-mT.y,zw(fT,pT),eT.set(fT,(t*2+e)*Fw);for(let e=0;e<Fw;e++){let n=i<0?Fw-1-e:Fw+Hw+e,r=s>500?Pw[e]:s*Math.tanh(Pw[e]/s),a=(t*Uw+n)*3;qw[a]=mT.x+sT[d+3]*r,qw[a+1]=mT.y+fT[e],qw[a+2]=mT.z+sT[d+4]*r}}for(let e=0;e<Hw;e++){let n=-u+2*u*(e+1)/4,r=(t*Uw+Fw+e)*3;hT.copy(lT.pos).addScaledVector(lT.right,n),Rw(a)?hT.y=o-1.5:hT.addScaledVector(lT.up,a===`river`?-.9:-.08),qw[r]=hT.x,qw[r+1]=hT.y,qw[r+2]=hT.z}}for(let e=1;e<c-1;e++){let t=Gw[e]-Gw[e-1]<.1?e:e-1,n=Gw[e+1]-Gw[e]<.1?e:e+1;for(let r=0;r<Uw;r++){let i=Math.max(0,r-1),a=Math.min(Uw-1,r+1),o=(e*Uw+i)*3,s=(e*Uw+a)*3;mT.set(qw[s]-qw[o],qw[s+1]-qw[o+1],qw[s+2]-qw[o+2]);let c=(t*Uw+r)*3,l=(n*Uw+r)*3;hT.set(qw[l]-qw[c],qw[l+1]-qw[c+1],qw[l+2]-qw[c+2]),t===n&&hT.copy(cT[e].fwd),gT.crossVectors(mT,hT),gT.lengthSq()<1e-10&&gT.set(0,1,0),gT.normalize(),gT.y<0&&gT.negate();let u=(e*Uw+r)*3;Jw[u]=gT.x,Jw[u+1]=gT.y,Jw[u+2]=gT.z}}let l=e=>e<Fw?Pw[Fw-1-e]:e>=Fw+Hw?Pw[e-Fw-Hw]:-1;for(let t=1;t<c-1;t++)for(let n=0;n<Uw;n++){let r=(t*Uw+n)*3,a=qw[r],o=qw[r+1],s=qw[r+2],c=Yw[t],u=l(n),d=n<Fw?0:1;u<0?vT.setHex(Kw[t]===`river`?i.rockB:i.verge):OT(e,a,o,s,u,Zw[t*2+d],c,vT),tT[r]=vT.r,tT[r+1]=vT.g,tT[r+2]=vT.b,AT(e,a,o,s,c,vT);let f=zC(.92,1,Xw[t]);if(f>.01&&u<14){let n=u<0?(Zw[t*2]+Zw[t*2+1])/2:Zw[t*2+d],i=zC(n-20,n-1,o),a=.22+.78*i;vT.multiplyScalar(1+(a-1)*f),vT.lerp(yT.setHex(e.p.fog),(1-i)*.25*f);let s=1+(a-1)*f;tT[r]*=s,tT[r+1]*=s,tT[r+2]*=s}nT[r]=vT.r,nT[r+1]=vT.g,nT[r+2]=vT.b,rT[t*Uw+n]=u>=0&&u<=7&&$w[t*2+d]?1:0}oT.g.n=0,oT.k.n=0;let u=(e,t,n,r,i,a)=>{let o=(e*Uw+t)*3,s=(n*Uw+r)*3,c=(i*Uw+a)*3;mT.set(qw[s]-qw[o],qw[s+1]-qw[o+1],qw[s+2]-qw[o+2]),hT.set(qw[c]-qw[o],qw[c+1]-qw[o+1],qw[c+2]-qw[o+2]),_T.crossVectors(mT,hT);let l=_T.length();if(l<1e-6)return;_T.multiplyScalar(1/l);let u=_T.y<.52||(rT[e*Uw+t]&rT[n*Uw+r]&rT[i*Uw+a])===1,d=u?oT.k:oT.g;for(let e=0;e<3;e++){let t=e===0?o:e===1?s:c,n=d.n*3,r=d.n*2,i=qw[t],a=qw[t+1],l=qw[t+2];d.P[n]=i,d.P[n+1]=a,d.P[n+2]=l,u?(d.N[n]=_T.x,d.N[n+1]=_T.y,d.N[n+2]=_T.z,d.C[n]=nT[t],d.C[n+1]=nT[t+1],d.C[n+2]=nT[t+2],d.U[r]=(i*.7+l*.7)*.11,d.U[r+1]=a*.16):(d.N[n]=Jw[t],d.N[n+1]=Jw[t+1],d.N[n+2]=Jw[t+2],d.C[n]=tT[t],d.C[n+1]=tT[t+1],d.C[n+2]=tT[t+2],d.U[r]=i/7,d.U[r+1]=l/7),d.n++}};for(let e=1;e<c-2;e++)for(let t=0;t<Uw-1;t++)u(e,t,e,t+1,e+1,t+1),u(e,t,e+1,t+1,e+1,t);let d=(e,t,n)=>{if(e.n===0)return;let r=new Si;r.setAttribute(`position`,new ci(e.P.slice(0,e.n*3),3)),r.setAttribute(`normal`,new ci(e.N.slice(0,e.n*3),3)),r.setAttribute(`color`,new ci(e.C.slice(0,e.n*3),3)),r.setAttribute(`uv`,new ci(e.U.slice(0,e.n*2),2)),r.computeBoundingSphere();let i=new K(r,t);i.receiveShadow=!o,i.castShadow=!o&&n,s.add(i)};d(oT.g,a.ground,!1),d(oT.k,a.rock,!0),NT(e,c,s,o);let f=new DT;return UT(e,t,n,f),KT(e,c,t,n,f,o),f.build(s,!o),s}function NT(e,t,n,r){let i=[],a=[],o=[],s=[],c=[],l=[],u=[],d=(e,t,n,r,i,a,o,s,c)=>{let l=cT[e],u=cT[t],d=l.hw+n,f=u.hw+n;for(let n=0;n<r;n++){let l=-1+2*n/r,u=-1+2*(n+1)/r,p=[[e,l,d],[e,u,d],[t,u,f],[t,l,f]];for(let e of[0,1,2,0,2,3]){let[t,n,r]=p[e],l=cT[t];mT.copy(l.pos).addScaledVector(l.right,n*r).addScaledVector(l.up,i),a.push(mT.x,mT.y,mT.z),c?(o.push(n*r,Gw[t]),s?.push(r)):o.push((n+1)/2,Gw[t]/12)}}},f=(e,t,n,r,i)=>{for(let[a,o]of[[-1,0],[0,1]]){let s=[[e,a],[e,o],[t,o],[t,a]];for(let e of[0,1,2,0,2,3]){let[t,a]=s[e],o=cT[t],c=Math.sin(Gw[t]*.045)*3;mT.copy(o.pos).addScaledVector(wT.set(o.right.x,0,o.right.z).normalize(),a*5+c),mT.y=Yw[t]+.4,n.push(mT.x,mT.y,mT.z),r.push(a*5,Gw[t]),i.push(5)}}};for(let n=1;n<t-2;n++){let t=e.track.kindAt((Gw[n]+Gw[n+1])/2);Gw[n+1]-Gw[n]<.1||(t===`ground`?d(n,n+1,.4,2,0,i,a,null,!1):t===`wall`?d(n,n+1,.4,2,0,o,s,null,!1):t===`river`?d(n,n+1,1.25,r?2:4,-.06,c,l,u,!0):t===`cloud`&&f(n,n+1,c,l,u))}let p=(e,t,i,a)=>{if(!e.length)return;let o=new Si;o.setAttribute(`position`,new G(e,3)),o.setAttribute(`uv`,new G(t,2)),a&&o.setAttribute(`hw`,new G(a,1)),o.computeVertexNormals(),o.computeBoundingSphere();let s=new K(o,i);s.receiveShadow=!r&&!a,n.add(s)};p(i,a,e.kit.dirt),p(o,s,e.kit.wallPath),p(c,l,e.water,u)}var PT=new qn,FT=new Cn,IT=new H,LT=new H,RT=new H,zT=new H;function BT(e,t,n,r,i){let a=[0,.33,.67,1].map(e=>new H().lerpVectors(n,r,e).addScaledVector(CT,-i*4*e*(1-e)));for(let n=0;n<3;n++){zT.subVectors(a[n+1],a[n]);let r=zT.length();FT.setFromUnitVectors(CT,zT.normalize()),IT.set(1,r,1),PT.compose(a[n],FT,IT),e.addMatrix(`rope`,t.kit.rope,t.kit.ropeMat,PT,!1)}}function VT(e,t,n,r){return wT.copy(e.right).negate(),r.makeBasis(wT,e.up,e.fwd),gT.copy(e.pos).addScaledVector(e.right,t).addScaledVector(e.up,n),r.setPosition(gT),r}var HT=Wf();function UT(e,t,n,r){let{track:i,kit:a}=e;for(let o of i.segments){if(o.kind!==`bridge`||o.s1<=t||o.s0>=n)continue;let s=Math.max(t,o.s0),c=Math.min(n,o.s1);for(let e=Math.ceil(s/.55)*.55;e<c;e+=.55){i.sample(e,HT);let t=MC(Math.round(e*10));VT(HT,(t-.5)*.15,-.075-t*.03,PT),FT.setFromAxisAngle(CT,(t-.5)*.08),PT.multiply(new qn().makeRotationFromQuaternion(FT)),PT.multiply(new qn().makeScale(HT.width+.5+t*.3,1,1)),r.addMatrix(`plank`,a.plank,a.wood,PT,!0)}for(let e=s;e<c;e+=2){i.sample(e,HT);for(let t of[-1,1]){LT.copy(HT.pos).addScaledVector(HT.right,t*(HT.width/2-.4)).addScaledVector(HT.up,-.25),i.toWorld(Math.min(c,e+2),t*(HT.width/2-.4),-.25,RT),zT.subVectors(RT,LT);let n=zT.length();n<.01||(FT.setFromUnitVectors(CT,zT.normalize()),IT.set(1.6,n,1.6),PT.compose(LT,FT,IT),r.addMatrix(`post`,a.post,a.wood,PT,!0))}}let l=Math.max(1,Math.round((o.s1-o.s0)/3.2)),u=(o.s1-o.s0)/l;for(let t=0;t<=l;t++){let n=o.s0+t*u;if(n<s-.01||n>c+.01)continue;let d=t===0||t===l;i.sample(n,HT);for(let s of[-1,1]){let c=s*(HT.width/2+.3);if(LT.copy(HT.pos).addScaledVector(HT.right,c).addScaledVector(CT,-.8),IT.set(d?1.7:1,d?2.5:2.15,d?1.7:1),PT.compose(LT,FT.identity(),IT),r.addMatrix(`post`,a.post,a.wood,PT,!0),t<l){let a=o.s0+(t+1)*u;for(let t of[1.25,.7])i.toWorld(n,c,0,LT),LT.y+=t,i.toWorld(a,c,0,RT),RT.y+=t,BT(r,e,LT,RT,t>1?.22:.12)}}}}}var WT=new H,GT=new W;function KT(e,t,n,r,i,a){let{p:o,kit:s,track:c}=e,l=VC(Math.floor(n*13.7)+e.seed*1009+7),u=a?.4:1,d=(e,t,n,r,i)=>{let a=(e*2+t)*5,o=cT[e],s=Bw(eT.subarray((e*2+t)*Fw,(e*2+t+1)*Fw),n);return i.set(sT[a]+sT[a+3]*n+o.fwd.x*r,sT[a+1]+s,sT[a+2]+sT[a+4]*n+o.fwd.z*r),s};for(let c=1;c<t-2;c++){if(Gw[c]<n||Gw[c]>=r||Gw[c+1]-Gw[c]<.1)continue;let t=Kw[c];if(Rw(t))continue;let f=Gw[c],p=Gw[c+1]-Gw[c];for(let n=0;n<2;n++){let r=n===0?-1:1,m=eT.subarray((c*2+n)*Fw,(c*2+n+1)*Fw),h=Qw[c*2+n],g=(e,t)=>e<h-1&&Vw(m,e)<t&&Bw(m,e)>m[Fw-1]+4,_=Math.round((a?1.2:3.4)*p*.5+l()*.8);for(let e=0;e<_;e++){let e=t===`river`?1.3+l()*10:.1+l()**1.7*16;if(!g(e,1.1))continue;d(c,n,e,l()*p,WT),WT.y-=.03;let r=(.5+l()*.45)*(e<2?.8:1);i.add(`tuft`,s.tuft,s.grass,WT,l()*6.28,r,r*(.7+l()*.5),r,!1)}if(t===`river`&&l()<.7*u){let e=1+l()*1.2;d(c,n,e,l()*p,WT);let t=1.1+l()*.5;i.add(`tuft`,s.tuft,s.grass,WT,l()*6.28,t,t*3.2,t,!1)}if(l()<.55*u){let e=1+Math.floor(l()*3),t=.6+l()*10,r=o.flowers[Math.floor(l()*o.flowers.length)];for(let a=0;a<e;a++){let e=t+l()*1.2;g(e,.8)&&(d(c,n,e,l()*p,WT),GT.setHex(r),i.add(`flower`,s.flower,s.veg,WT,0,1,.8+l()*.6,1,!1,GT))}}if(l()<.2*u+.05){let e=2.3+l()*18;if(g(e,.7)){d(c,n,e,l()*p,WT),WT.y-=.15;let t=.7+l()*.8;GT.setHSL(0,0,.88+l()*.2),i.add(`bush`,s.bush,s.veg,WT,l()*6.28,t,t*(.8+l()*.3),t,!0,GT)}}if(t!==`river`&&t!==`wall`&&l()<p/12*u*(a?1.25:1)){let e=1.7+l()*2.4,t=l()*p,r=2+Math.floor(l()*2);for(let a=0;a<r;a++){let r=e+(l()-.3)*1.4;if(!g(r,.9))continue;d(c,n,r,t+(l()-.5)*1.6,WT),WT.y-=.12;let a=.55+l()*.5;GT.setHSL(0,0,.86+l()*.22),i.add(`bush`,s.bush,s.veg,WT,l()*6.28,a,a*(.8+l()*.3),a,!1,GT)}}if(l()<.09*u+.02){let e=2.2+l()*12;if(g(e,1.4)){d(c,n,e,l()*p,WT),WT.y-=.2;let t=.4+l()**2*1.6;i.add(`boulder`,s.boulder,s.solid,WT,l()*6.28,t,t,t,!0)}}if(l()<.13*u+.03){let e=5+l()*30;if(g(e,.55)){d(c,n,e,l()*p,WT),WT.y-=.2;let t=.75+l()*.7,r=Math.floor(l()*s.trees.length);GT.setRGB(.88+l()*.2,.92+l()*.12,.85+l()*.15),i.add(`tree`+r,s.trees[r],s.vegSway,WT,l()*6.28,t,t*(.9+l()*.3),t,!0,GT)}}if(FC(f/85+r*9.1,e.seed+31)>1-o.bambooAmt*.7&&l()<.55*u+.1){let e=2.6+l()*12;if(g(e,.8)){d(c,n,e,l()*p,WT),WT.y-=.1;let t=.8+l()*.5;i.add(`bamboo`,s.bamboo,s.vegSway,WT,l()*6.28,t,t*(.9+l()*.4),t,!0)}}}}let f=e.floorAt((n+r)/2),p=e=>{for(let t=Math.max(0,n-320);t<Math.min(c.length,r+320);t+=6){c.sample(t,HT);let n=HT.pos.x-WT.x,r=HT.pos.z-WT.z;if(n*n+r*r<e*e)return!1}return!0},m=a?1:2;for(let t=0;t<m;t++){if(l()>(e.id===`gorge`?.55:.75))continue;let t=n+l()*(r-n);c.sample(t,HT);let a=l()<.5?-1:1,o=75+l()*230,u=7+l()*10;if(wT.set(HT.right.x,0,HT.right.z).normalize(),WT.copy(HT.pos).addScaledVector(wT,a*(HT.width/2+o)),!p(u+40))continue;let d=HT.pos.y+(l()*55-5),m=f-6,h=Math.max(20,d-m);WT.y=m,i.add(`pillar`,s.pillar,s.solid,WT,l()*6.28,u,h,u*(.85+l()*.3),!0);for(let e=0;e<3;e++){let e=l()*6.28,t=l()*u*.5;hT.set(WT.x+Math.cos(e)*t,m+h+.02,WT.z+Math.sin(e)*t);let n=2+l()*1.8;i.add(`tree0`,s.trees[0],s.vegSway,hT,l()*6.28,n,n,n,!0,GT.setRGB(1,1,1))}}let h=a?2:5;for(let e=0;e<h;e++){let e=n+l()*(r-n);c.sample(e,HT);let t=l()<.5?-1:1,a=70+l()*200;if(wT.set(HT.right.x,0,HT.right.z).normalize(),WT.copy(HT.pos).addScaledVector(wT,t*(HT.width/2+a)),!p(62))continue;let o=3+Math.floor(l()*5),u=WT.x,d=WT.z;for(let e=0;e<o;e++){WT.set(u+(l()-.5)*30,f-.3,d+(l()-.5)*30);let e=1.6+l()*1.4,t=Math.floor(l()*s.trees.length);i.add(`tree`+t,s.trees[t],s.vegSway,WT,l()*6.28,e,e,e,!1,GT.setRGB(.95,1,.95))}}}function qT(e){e.traverse(e=>{let t=e;t.geometry&&!t.geometry.userData?.shared&&t.geometry.dispose(),e.isInstancedMesh&&e.dispose()})}var JT=[`meadow`,`gorge`,`sunset`],YT=`
attribute float hw;
varying vec2 vP;
varying float vHw;
#include <common>
#include <fog_pars_vertex>
void main() {
  vP = uv;
  vHw = hw;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,XT=`
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
varying vec2 vP;
varying float vHw;
#include <common>
#include <fog_pars_fragment>
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float x = vP.x;
  float s = vP.y;
  float dEdge = vHw - abs(x);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.4, 4.5, dEdge));
  // broad flowing tone + streaks moving with the run
  float n = vn(vec2(x * 0.35, s * 0.06 - uTime * 0.7));
  col = mix(col, uShallow, (n - 0.4) * 0.5);
  float st = vn(vec2(x * 2.2 + sin(s * 0.05) * 1.5, s * 0.12 - uTime * 1.6));
#ifndef LOW
  st = st * 0.7 + 0.3 * vn(vec2(x * 4.1, s * 0.3 - uTime * 2.6));
#endif
  float streak = smoothstep(0.64, 0.68, st) * (1.0 - smoothstep(0.7, 0.75, st));
  col = mix(col, uFoam, streak * 0.75);
  col = mix(col, uDeep * 0.8, smoothstep(0.25, 0.15, st) * 0.25 * smoothstep(1.0, 3.0, dEdge));
  // foam rim along the banks
  float fw = 0.55 + 0.9 * vn(vec2(s * 0.45 - uTime * 1.3, x * 0.7));
  float rim = 1.0 - smoothstep(fw * 0.6, fw * 1.25, dEdge);
  float rimLine = smoothstep(0.08, 0.0, abs(dEdge - fw * 1.6 - 0.25 * sin(s * 0.7 + uTime * 2.0))) * 0.6;
  col = mix(col, uFoam, clamp(rim + rimLine, 0.0, 1.0) * 0.92);
#ifndef LOW
  float sp = vn(vec2(x * 6.0, s * 3.0 - uTime * 5.0));
  col += vec3(1.0) * smoothstep(0.93, 0.99, sp) * 0.45 * smoothstep(1.0, 3.0, dEdge);
#endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;function ZT(e,t,n){return new Es({vertexShader:YT,fragmentShader:XT,fog:!0,defines:t?{LOW:1}:{},polygonOffset:!0,polygonOffsetFactor:-1,polygonOffsetUnits:-1,uniforms:{...Cs.clone(q.fog),uDeep:{value:new W(e.waterDeep)},uShallow:{value:new W(e.waterShallow)},uFoam:{value:new W(e.foam)},uTime:n}})}var QT={high:{near:140,far:540},low:{near:80,far:345}},$T=Wf(),eE=new H;function tE(e,t){let n=new Map,r=r=>{let i=n.get(r);if(i!==void 0)return i;let a=r*10,o=1/0;for(let t=a-200;t<=a+120;t+=10)t<0||t>e.length||(e.sample(t,$T),$T.pos.y<o&&(o=$T.pos.y));Number.isFinite(o)||(e.sample(Math.max(0,Math.min(e.length,a)),$T),o=$T.pos.y);let s=o-t;return a+120<=e.length&&n.set(r,s),s};return e=>{let t=Math.floor(e/10),n=e/10-t;return r(t)*(1-n)+r(t+1)*n}}function nE(e){let t=kw[e],n=null,r=null,i=null,a=null,o=0,s=0,u={value:0};return{id:e,enter(s){let c=s.quality===`low`,d=Ow(e,t),f=QT[s.quality];s.scene.background=new W(t.horizon),s.scene.fog=new Or(t.fog,f.near,f.far),s.sun.color.setHex(t.sun),s.sun.intensity=t.sunI,s.hemi.color.setHex(t.hemiSky),s.hemi.groundColor.setHex(t.hemiGround),s.hemi.intensity=t.hemiI,Qd.set(t.sunDir[0],t.sunDir[1],t.sunDir[2]).normalize(),qd.toneMappingExposure=t.exposure,a=ZT(t,c,u);let p=tE(s.track,t.mix.valleyDepth);n={id:e,track:s.track,p:t,kit:d,quality:s.quality,seed:s.stage.index*17+3,water:a,floorAt:p},o=p(0),r=new Nw(t,d,Qd,c),s.scene.add(r.group),Number.isFinite(l.finishS)&&l.finishS>0&&(i=ew(s.track,l.finishS,t,!!s.stage.ending,d.ground,c),s.scene.add(i.group))},buildChunk(e,t,r){return n?MT(n,t,r):null},disposeChunk(e){qT(e)},update(e,a,d){if(!n||!r)return;n.kit.time.value=a,u.value=a;let f=c.mode===`title`?lm():J.s,p=n.floorAt(f);o+=(p-o)*Math.min(1,e*2),d.camera.getWorldPosition(eE),r.update(e,eE,o);let m=d.track;if(e>0){for(s+=e;s>.03;){s-=.03;let e=f+3+Math.random()*40;if(m.kindAt(e)!==`river`)continue;m.sample(e,$T);let n=Math.random()<.5?-1:1,r=n*($T.width/2+.2+Math.random()*.9),i=$T.pos.x+$T.right.x*r,a=$T.pos.z+$T.right.z*r;Jm(i,$T.pos.y+.05,a,$T.right.x*n*.8,2+Math.random()*2.5,$T.right.z*n*.8,.55,.25+Math.random()*.25,t.foam,9)}i&&eE.distanceToSquared(r.group.position)>=0&&Number.isFinite(l.finishS)&&l.finishS-f<420&&i.update(e,a)}},exit(e){r?.dispose(),r=null,i?.dispose(),i=null,a?.dispose(),a=null,n=null,qd.toneMappingExposure=1,e.scene.background=new W(9425919)}}}function rE(){for(let e of JT)bf.add(nE(e))}function iE(){rE()}iE(),gC(),AC(),gv(),cp(e=>{n.emit(`action`,{action:e}),e===`pause`?c.mode===`play`&&Wh():c.mode===`play`&&(e===`jump`?yp():e===`slide`?Sp():e===`ability`&&wp())}),jC(),ug(),window.__meow={get mode(){return c.mode},game:c,G:l,P:J,hud:ff,prefs:u,TUNING:lp,CAM:Vp,clock:ag,session:ch,events:n,stages:yf,themes:bf,setPieceTypes:xf,actors:Sf,colliders:km,camera:Yd,setCameraOverride:Up,press:Xf,input:Jf,keys:qf,quality:{get:af,mode:rf,set:nf},dev:dx};