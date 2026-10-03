// s7: THE ON-CHAIN MISSION (bars 13-14, 22.500-26.250 s, b48-b55).
// Round 2: four steps at two beats each (0.9375 s), not eight one-beat blocks. Each step is one big
// "screen" card (~61% of frame width) that lands on its beat with the screen ALREADY on (power-on runs
// 0.10-0.02 s before the beat), cuts to a second real capture on the off-bar kick, and pushes the
// camera in a further 4% per step. Older steps recede left toward a vanishing point; a chain link
// snaps from the previous card to the new one and a gold packet runs it on every kick. One centred,
// readable caption per step (Passion One, highlight words in Cat Paw), held the full two beats.
// No hashes, no "block #", no fake records: the labels are STEP 1/4 ... 4/4. Copy is the game's /
// site's own wording only (tools/onchain-text.json). The last step is the qualifier
// "FIRST PAYOUTS LAND SOON", on screen ~0.85 s before the chain implodes into s8's logo hit.

const T0 = 22.5, B = 0.46875, END = 26.25;
const N = 4;
const BT = Array.from({ length: N }, (_, i) => T0 + i * 2 * B); // 22.5, 23.4375, 24.375, 25.3125
const MID = BT.map((b) => b + B);                               // in-card cut on the off-bar kick
const KICKS = Array.from({ length: 8 }, (_, i) => T0 + i * B);
const GLITCH = [[22.5, 0.12], [24.375, 0.06]];
const ROLL = [25.78125, 25.898438, 26.015625, 26.074219, 26.132813, 26.191406];

const HERO = { x: 960, y: 462 };    // newest card centre (screen, before cam push)
const PIV = { x: 960, y: 470 };     // camera push pivot
const VP = { x: -170, y: 250 };     // vanishing point the older cards recede toward
const BW = 780, BH = 470;           // card size (local units)
const SCR = { x: -370, y: -183, w: 740, h: 360 }; // screen inset (aspect 2.056)
const HS = 1.5;                     // hero scale: 1170 px = 61% of frame width
const OVER = { x0: 330, dx: 420, y: 452, s: 0.46 }; // final overview row
const PILL = { x: 40, y: 22, h: 54, size: 30 }; // round 3: tucked into the corner, clear of the card header
const PASSION = '"Passion One", "Arial Black", sans-serif';
const NUNITO = 'Nunito, "Helvetica Neue", sans-serif';

const STILLS = {};
const STILL_FILES = {
  give: 'assets/clips/stills/oc-web-give-top.jpg',
  modal: 'assets/clips/stills/oc-payouts-modal.jpg',
  top: 'assets/clips/stills/oc-web-payouts-top.jpg',
  mid: 'assets/clips/stills/oc-web-payouts-mid.jpg',
};

// Two real captures per step (screen ids, see drawScreen), cut on the off-bar kick.
const SCREENS = [[0, 1], [2, 4], [8, 5], [6, 7]]; // round 3: step 3 opens on the give page's 'every payout is public' box
const TAGS = ['IN THE GAME', 'TOKENTAILS.COM', 'TOKENTAILS.COM', 'TOKENTAILS.COM'];
const CHIPS = ['PLAY', 'TAP', 'PUBLIC', 'OPENS SOON'];

// Caption copy, all from the game / site (tools/onchain-text.json). hl = words in gold Cat Paw.
const CAPS = [
  { text: 'FREE THE SHELTER CAT IN A HEIST.', hl: ['SHELTER', 'CAT'], sub: 'Every heist ends with a rescue.' },
  { text: 'TAP THE RESCUE TREAT.', hl: ['RESCUE', 'TREAT.'], sub: 'Token Tails sends Pink Paw a small treat.' },
  { text: 'EVERY PAYOUT IS PUBLIC, ON-CHAIN.', hl: ['PUBLIC,', 'ON-CHAIN.'], sub: 'Read live from the chain, not from our servers.', band: true },
  { text: 'FIRST PAYOUTS LAND SOON', hl: ['SOON'], sub: 'Showcase shelter: Pink Paw (Rožinė Pėdutė)', gold: true },
];
// "Every heist ends with a rescue" is the game's loop (README: free the shelter cat, escape); the rest
// is verbatim site / modal copy, re-cased.

// ------------------------------------------------------------------------------------------ timing
function focus(t, E) { // 0..3: which card is the hero; anticipates each landing
  let f = 0;
  for (let j = 1; j < N; j++) f += E.Ease.anticipate(E.seg(t, BT[j] - 0.07, BT[j] + 0.12)); // round 3: old card holds until the new one is in
  return f;
}
const camPush = (t, E) => 1 + 0.04 * focus(t, E);
const overviewP = (t, E) => E.expoInOut(E.seg(t, 25.89, 26.0));
const implodeP = (t, E) => { const u = E.seg(t, 26.04, 26.13); return u <= 0 ? 0 : E.cubicIn(u); };
const capOutP = (t, E) => { const u = E.seg(t, 26.16, END); return u <= 0 ? 0 : E.cubicIn(u); };

function poseOf(i, t, E) {
  let x, y, s, a = 1, rot = 0, sx = 1, sy = 1, falling = 0, d = 0;
  if (t < BT[i]) { // falls in from above, squashed long, during the last 0.14 s before its beat
    const u = E.seg(t, BT[i] - 0.14, BT[i]);
    const cu = E.cubicIn(u);
    x = HERO.x + 60 * (1 - cu); y = HERO.y - 620 * (1 - cu); // round 3: shorter drop, the card is on screen from -0.1 s
    s = 1.1 - 0.1 * cu; sx = 0.93; sy = 1.1; a = E.clamp01(u * 3); falling = 1 - u;
    rot = 0.05 * (1 - cu);
  } else {
    d = focus(t, E) - i;
    const s0 = 1 / (1 + 0.95 * d);
    x = VP.x + (HERO.x - VP.x) * s0; y = VP.y + (HERO.y - VP.y) * s0; s = s0;
    a = E.clamp01(1.35 - d * 0.2);
    if (d > 0.3) y += 7 * s0 * Math.sin(t * 2.3 + i * 1.7);
    const tl = t - BT[i], def = Math.exp(-tl * 13) * Math.cos(tl * 34);
    const tm = t - MID[i], def2 = tm >= 0 ? 0.45 * Math.exp(-tm * 16) * Math.cos(tm * 40) : 0; // bump on the in-card cut
    sy = 1 - 0.15 * def - 0.05 * def2; sx = 1 + 0.11 * def + 0.04 * def2;
    rot = -0.014 * Math.min(d, 3);
  }
  const cz = camPush(t, E);
  x = PIV.x + (x - PIV.x) * cz; y = PIV.y + (y - PIV.y) * cz; s *= cz * HS;
  const P = overviewP(t, E);
  if (P > 0) {
    const ox = OVER.x0 + i * OVER.dx, oy = OVER.y - (i - 1.5) * 12;
    x = E.lerp(x, ox, P); y = E.lerp(y, oy, P); s = E.lerp(s, OVER.s, P); a = E.lerp(a, 1, P); rot *= 1 - P;
    d = E.lerp(d, 0, P);
  }
  const I = implodeP(t, E);
  if (I > 0) { x = E.lerp(x, 960, I); y = E.lerp(y, 540, I); s *= 1 - 0.85 * I; rot += I * (i - 1.5) * 0.4; }
  return { x, y, s, a, rot, sx, sy, falling, d };
}

// --------------------------------------------------------------------------------------- helpers
function still(ctx, E, key, cr, x, y, w, h, zoom = 1, fx = 0.5, fy = 0.5) {
  const b = STILLS[key];
  if (!b) { E.placeholder(ctx, x, y, w, h, key); return; }
  const rx = cr[0] * b.width, ry = cr[1] * b.height, rw = cr[2] * b.width, rh = cr[3] * b.height;
  const s = E.cover(rw, rh, w, h, fx, fy, zoom);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(b, rx + s.sx, ry + s.sy, s.sw, s.sh, x, y, w, h);
  ctx.restore();
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// One capture, drawn into the screen rect (local units). tl = time since this capture came up.
// Crops are the vetted ones from round 1 (no ticker, no amounts, no wallet address).
function drawScreen(ctx, E, sid, tl, x, y, w, h) {
  tl = Math.max(0, tl);
  const drift = 1 + 0.05 * E.clamp01(tl / 1.2); // never static
  switch (sid) {
    case 0: // Juniper's rescue, heist-05 (RESCUE at file 34)
      E.drawClip(ctx, 'h05-rescue-exit', 27 / 30 + Math.min(tl * 1.15, 32 / 30), x, y, w, h,
        { crop: [0.25, 0.27, 0.5, 0.43], zoom: drift });
      break;
    case 1: // HEIST COMPLETE! win card
      E.drawClip(ctx, 'oc-results-rescue', 8 / 30 + Math.min(tl * 2.6, 31 / 30), x, y, w, h,
        { crop: [0.30, 0.05, 0.40, 0.345], zoom: drift });
      break;
    case 2: // give page: JUNIPER IS SAFE! / SEND A TREAT TO PINK PAW
      still(ctx, E, 'give', [0.355, 0.335, 0.29, 0.251], x, y, w, h, drift, 0.5, 0.35); // round 3: tight on JUNIPER IS SAFE! / SEND A TREAT
      break;
    case 3: { // payouts modal, HOW IT WORKS box
      ctx.fillStyle = '#100a1c'; ctx.fillRect(x, y, w, h);
      const pop = E.lerp(0.9, 1, E.backOut(E.seg(tl, 0, 0.14), 2.2));
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2); ctx.scale(pop * drift, pop * drift);
      still(ctx, E, 'modal', [0.297, 0.42, 0.233, 0.20], -w / 2, -h / 2, w, h);
      ctx.restore();
      break;
    }
    case 4: { // showcase shelter: portrait + title rows (Goal line excluded)
      const hero = E.img('payoutsHero');
      if (hero) { const s = E.cover(hero.width, hero.height, w, h, 0.5, 0.6, drift); ctx.drawImage(hero, s.sx, s.sy, s.sw, s.sh, x, y, w, h); }
      ctx.fillStyle = 'rgba(13,6,22,0.35)'; ctx.fillRect(x, y, w, h);
      const ps = 236 * (1 + 0.04 * Math.sin(tl * 6)), px = x + 70, py = y + (h - ps) / 2;
      const pin = E.backOut(E.seg(tl, 0, 0.14), 2.4);
      ctx.save(); ctx.translate(px + ps / 2, py + ps / 2); ctx.scale(pin, pin); ctx.rotate(-0.04 * (1 - pin));
      ctx.shadowColor = 'rgba(255,122,162,0.8)'; ctx.shadowBlur = 30;
      rr(ctx, -ps / 2 - 6, -ps / 2 - 6, ps + 12, ps + 12, 18); ctx.fillStyle = '#ff7aa2'; ctx.fill(); ctx.shadowBlur = 0;
      rr(ctx, -ps / 2, -ps / 2, ps, ps, 14); ctx.save(); ctx.clip();
      still(ctx, E, 'give', [0.455, 0.17, 0.09, 0.16], -ps / 2, -ps / 2, ps, ps);
      ctx.restore(); ctx.restore();
      const bw = 380, cr = [0.536, 0.455, 0.155, 0.075], bh = bw * (cr[3] * 1080) / (cr[2] * 1920);
      const bin = E.expoOut(E.seg(tl, 0.03, 0.2));
      ctx.save(); ctx.globalAlpha *= bin; ctx.translate((1 - bin) * 60, 0);
      rr(ctx, x + w - bw - 50, y + (h - bh) / 2 - 8, bw + 16, bh + 16, 12); ctx.fillStyle = '#2a0f1f'; ctx.fill();
      ctx.strokeStyle = '#ff7aa2'; ctx.lineWidth = 3; ctx.stroke();
      still(ctx, E, 'modal', cr, x + w - bw - 42, y + (h - bh) / 2, bw, bh);
      ctx.restore();
      break;
    }
    case 5: // /shelter-payouts showcase: heading + "split on-chain, every payout is public" (amount box excluded)
      still(ctx, E, 'mid', [0.18, 0.09, 0.33, 0.285], x, y, w, h, drift, 0.5, 0.4);
      break;
    case 6: // /shelter-payouts hero: LIVE FROM THE CHAIN / SHELTER PAYOUTS / First payout soon
      still(ctx, E, 'top', [0.30, 0.09, 0.40, 0.346], x, y, w, h, drift, 0.5, 0.4);
      { // round 3: fade the small body line under the headline
        const fg = ctx.createLinearGradient(0, y + h * 0.72, 0, y + h);
        fg.addColorStop(0, 'rgba(8,4,20,0)'); fg.addColorStop(1, 'rgba(8,4,20,0.92)');
        ctx.fillStyle = fg; ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
      }
      break;
    case 8: // round 3: give page footer box: "...split to it on-chain, and every payout is public." + SEE EVERY PAYOUT button
      still(ctx, E, 'give', [0.375, 0.80, 0.25, 0.20], x, y, w, h, drift, 0.5, 0.5);
      break;
    case 7: { // modal header: PUBLIC, ON-CHAIN / SENT TO SHELTERS / First payouts land soon
      still(ctx, E, 'modal', [0.355, 0.235, 0.29, 0.251], x, y, w, h, drift); // round 3: tight on the pill + SENT TO SHELTERS + First payouts land soon
      const g = 0.5 + 0.5 * Math.sin(tl * 14);
      const rg = ctx.createRadialGradient(x + w / 2, y + h * 0.6, 10, x + w / 2, y + h * 0.6, w * 0.45);
      rg.addColorStop(0, `rgba(255,201,60,${0.28 * g})`); rg.addColorStop(1, 'rgba(255,201,60,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rg; ctx.fillRect(x, y, w, h); ctx.restore();
      break;
    }
  }
}

// One step card, centred at (0,0) in local units.
function drawBlock(ctx, E, i, t, pose, glow) {
  const tl = t - BT[i];
  const detail = pose.s > 0.45;
  ctx.save();
  ctx.translate(pose.x, pose.y + (BH / 2) * pose.s);
  ctx.rotate(pose.rot);
  ctx.scale(pose.s * pose.sx, pose.s * pose.sy);
  ctx.translate(0, -BH / 2);
  ctx.globalAlpha *= pose.a;

  if (pose.falling > 0) { // fall smear: ghost silhouettes trailing above
    for (let k = 1; k <= 3; k++) {
      ctx.save(); ctx.globalAlpha *= 0.16 * pose.falling * (1 - k / 4);
      rr(ctx, -BW / 2, -BH / 2 - k * 150 * pose.falling, BW, BH, 22); ctx.fillStyle = '#d5f4e5'; ctx.fill(); ctx.restore();
    }
  }
  // extruded slab
  rr(ctx, -BW / 2 + 16, -BH / 2 + 20, BW, BH, 22); ctx.fillStyle = '#040209'; ctx.fill();
  rr(ctx, -BW / 2 + 8, -BH / 2 + 10, BW, BH, 22); ctx.fillStyle = '#3a1f5e'; ctx.fill();
  const gl = E.clamp01(glow);
  if (gl > 0.02) { ctx.save(); ctx.shadowColor = `rgba(255,201,60,${0.85 * gl})`; ctx.shadowBlur = 40 * gl; }
  rr(ctx, -BW / 2, -BH / 2, BW, BH, 22);
  const bg = ctx.createLinearGradient(0, -BH / 2, 0, BH / 2);
  bg.addColorStop(0, '#2c1748'); bg.addColorStop(1, '#140a22');
  ctx.fillStyle = bg; ctx.fill();
  if (gl > 0.02) ctx.restore();
  ctx.lineWidth = 4; ctx.strokeStyle = E.mix('#9fdfba', '#ffc93c', gl); ctx.stroke();

  // header: STEP n/4 + where the capture is from
  ctx.textBaseline = 'middle';
  if (detail) { // round 3: no STEP label here (the top-right counter is the only step index)
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(213,244,229,0.75)'; ctx.font = `700 19px ${E.FONTS.mono}`;
    ctx.fillText(TAGS[i], -BW / 2 + 26, -BH / 2 + 27);
  }
  for (let k = 0; k < 3; k++) { // status LEDs, blink on kicks
    const on = k === 0 ? 1 : E.cueEnv(t, 'kick', 0.1) > 0.3 && E.rand('led', i, k, E.beatIndex(t)) > 0.4 ? 1 : 0.25;
    ctx.fillStyle = k === 2 ? `rgba(255,201,60,${on})` : `rgba(99,185,141,${on})`;
    ctx.fillRect(BW / 2 - 66 + k * 18, -BH / 2 + 20, 11, 14);
  }

  // screen: CRT power-on finishes BEFORE the beat, so the landing frame already shows the capture
  const open = E.expoOut(E.seg(tl, -0.10, -0.02));
  const sh = Math.max(4, SCR.h * open);
  ctx.save();
  rr(ctx, SCR.x, SCR.y + (SCR.h - sh) / 2, SCR.w, sh, 10); ctx.clip();
  ctx.fillStyle = '#05030a'; ctx.fillRect(SCR.x, SCR.y, SCR.w, SCR.h);
  const second = t >= MID[i];
  const sid = SCREENS[i][second ? 1 : 0];
  drawScreen(ctx, E, sid, second ? t - MID[i] : tl + 0.08, SCR.x, SCR.y, SCR.w, SCR.h);
  if (detail) { // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let yy = SCR.y; yy < SCR.y + SCR.h; yy += 5) ctx.fillRect(SCR.x, yy, SCR.w, 2);
  }
  const dim = Math.min(0.55, Math.max(0, pose.d) * 0.3);
  if (dim > 0) { ctx.fillStyle = `rgba(13,6,22,${dim})`; ctx.fillRect(SCR.x, SCR.y, SCR.w, SCR.h); }
  // short warm flash just before the beat (power-on) and on the in-card cut; never a blank beat frame
  const flashOn = 0.55 * E.env(tl, -0.03, 0.05) + 0.4 * E.env(t, MID[i], 0.05);
  if (flashOn > 0.01) { ctx.fillStyle = `rgba(255,243,208,${Math.min(0.6, flashOn)})`; ctx.fillRect(SCR.x, SCR.y, SCR.w, SCR.h); }
  // in-card cut: the new capture wipes over from the right with a bright edge
  const wp = E.seg(t, MID[i] - 0.05, MID[i]);
  if (wp > 0 && wp < 1) {
    const ex = SCR.x + SCR.w * (1 - E.expoIn(wp));
    ctx.save(); ctx.beginPath(); ctx.rect(ex, SCR.y, SCR.x + SCR.w - ex, SCR.h); ctx.clip();
    drawScreen(ctx, E, SCREENS[i][1], 0, SCR.x, SCR.y, SCR.w, SCR.h); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(ex - 3, SCR.y, 6, SCR.h);
  }
  // glare sweep after landing and after the cut
  for (const [g0] of [[tl], [t - MID[i]]]) {
    const gs = E.seg(g0, 0.02, 0.36);
    if (gs > 0 && gs < 1) {
      const gx = SCR.x - 300 + (SCR.w + 600) * E.cubicInOut(gs);
      const gg = ctx.createLinearGradient(gx - 140, 0, gx + 140, 0);
      gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.5, 'rgba(255,255,255,0.16)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.transform(1, 0, -0.45, 1, 0, 0); ctx.fillStyle = gg; ctx.fillRect(SCR.x - 400, SCR.y, SCR.w + 800, SCR.h); ctx.restore();
    }
  }
  ctx.restore();
  if (sh < SCR.h) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(SCR.x, SCR.y + SCR.h / 2 - 2, SCR.w, 4); }
  ctx.strokeStyle = 'rgba(159,223,186,0.4)'; ctx.lineWidth = 2;
  rr(ctx, SCR.x, SCR.y, SCR.w, SCR.h, 10); ctx.stroke();

  // footer: 4-segment progress bar + chip
  for (let k = 0; k < N; k++) {
    ctx.fillStyle = k <= i ? (k === i ? '#ffc93c' : '#63b98d') : 'rgba(153,102,204,0.35)';
    rr(ctx, -BW / 2 + 26 + k * 58, BH / 2 - 35, 48, 12, 6); ctx.fill();
  }
  const chip = CHIPS[i], gold = i === N - 1;
  ctx.font = `800 19px ${E.FONTS.mono}`;
  const cw = ctx.measureText(chip).width + 30;
  if (gold) { // round 3: OPENS SOON springs 1 -> 1.08 on every kick (replaces the 'done' tick)
    let k = 0; for (const kt of KICKS) if (t >= kt && kt >= BT[i]) k = E.spring ? Math.max(0, Math.exp(-(t - kt) * 9) * Math.cos((t - kt) * 30)) : E.env(t, kt, 0.15);
    const cs = 1 + 0.08 * k + 0.08 * E.env(t, BT[i] + 0.02, 0.2);
    const ccx = BW / 2 - 26 - cw / 2, ccy = BH / 2 - 29;
    ctx.translate(ccx, ccy); ctx.scale(cs, cs); ctx.translate(-ccx, -ccy);
  }
  rr(ctx, BW / 2 - 26 - cw, BH / 2 - 45, cw, 32, 16);
  ctx.fillStyle = gold ? 'rgba(255,201,60,0.18)' : 'rgba(99,185,141,0.18)'; ctx.fill();
  ctx.strokeStyle = gold ? '#ffc93c' : '#63b98d'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = gold ? '#ffc93c' : '#9fdfba'; ctx.textAlign = 'center';
  ctx.fillText(chip, BW / 2 - 26 - cw / 2, BH / 2 - 28);
  ctx.restore();
}

// Data floor: perspective grid flowing out of the vanishing point (camera truck feel).
function drawFloor(ctx, E, t) {
  const hz = 640, vx = 760;
  ctx.save();
  const fg = ctx.createLinearGradient(0, hz, 0, 1080);
  fg.addColorStop(0, 'rgba(111,45,168,0)'); fg.addColorStop(1, 'rgba(111,45,168,0.24)');
  ctx.fillStyle = fg; ctx.fillRect(0, hz, 1920, 1080 - hz);
  ctx.strokeStyle = 'rgba(170,120,220,0.26)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = -14; k <= 14; k++) { ctx.moveTo(vx + k * 18, hz); ctx.lineTo(vx + k * 260, 1080); }
  const ph = E.fract((t - T0) * 1.6);
  for (let k = 0; k < 12; k++) {
    const z = (k + 1 - ph) / 12;
    const yy = hz + (1080 - hz) * Math.pow(z, 2.2);
    ctx.moveTo(0, yy); ctx.lineTo(1920, yy);
  }
  ctx.stroke();
  const hg = ctx.createLinearGradient(0, hz - 30, 0, hz + 30);
  hg.addColorStop(0, 'rgba(255,201,60,0)'); hg.addColorStop(0.5, 'rgba(255,201,60,0.16)'); hg.addColorStop(1, 'rgba(255,201,60,0)');
  ctx.fillStyle = hg; ctx.fillRect(0, hz - 30, 1920, 60);
  ctx.restore();
}

// Centred caption: words slam in (Passion One; highlight words in gold Cat Paw), held to the next step.
function drawCaption(ctx, E, i, t, xform) {
  const c = CAPS[i];
  const t0 = BT[i] - 0.07;
  const t1 = i === N - 1 ? END + 1 : BT[i + 1] - 0.03;
  if (t < t0 || t >= t1) return;
  const lt = t - t0;
  const out = i === N - 1 ? 0 : E.expoIn(E.seg(t, t1 - 0.07, t1));
  const size = c.gold ? 80 : 68, Y = 940;
  ctx.save();
  xform(ctx);
  // scrim for legibility over the cards and floor
  const sg = ctx.createLinearGradient(0, 820, 0, 1080);
  sg.addColorStop(0, 'rgba(8,4,20,0)'); sg.addColorStop(0.45, 'rgba(8,4,20,0.62)'); sg.addColorStop(1, 'rgba(8,4,20,0.78)');
  ctx.fillStyle = sg; ctx.fillRect(-60, 820, 2040, 320);

  // round 3: no STEP kicker; on the band step the band itself is the headline (only the sub shows here)
  const words = c.band ? [] : c.text.split(' ');
  // round 3: Passion One everywhere (Cat Paw misread PUBLIC / SHELTER); highlight = colour only
  const fontOf = () => PASSION;
  const sizeOf = () => size;
  const space = size * 0.26;
  // Cat Paw glyphs overhang their advance width: pad highlight words so they never touch neighbours
  const ws = words.map((w) => E.measureText(ctx, w, { size: sizeOf(w), font: fontOf(w), weight: 700, tracking: 0.02 }));
  const total = ws.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let x = 960 - total / 2;
  words.forEach((w, k) => {
    const q = E.backOut(E.seg(lt, k * 0.025, k * 0.025 + 0.12), 2.2);
    if (q <= 0) { x += ws[k] + space; return; }
    const hl = c.hl.includes(w);
    const cx = x + ws[k] / 2;
    const sc = 1.35 - 0.35 * q;
    ctx.save();
    ctx.translate(cx, Y - out * 30 + (1 - q) * 40); ctx.scale(sc, sc);
    E.drawText(ctx, w, 0, 0, {
      size: sizeOf(w), font: fontOf(w), weight: 700, tracking: 0.02,
      color: hl ? (c.gold ? 'coin' : 'coin') : (c.gold ? 'coin' : 'cream'),
      alpha: E.clamp01(q * 2.5) * (1 - out),
      extrude: { depth: Math.round(size * 0.07), color: 'outline', dark: 0.4 },
      glow: hl || c.gold ? { color: 'rgba(255,201,60,0.6)', blur: c.gold ? 30 : 18 } : undefined,
    });
    ctx.restore();
    x += ws[k] + space;
  });
  if (c.sub) { // round 3: 36 px, in fully by +0.08 s and held to the next step (no typewriter)
    const sq = E.expoOut(E.seg(lt, 0.02, 0.1));
    E.drawText(ctx, c.sub, 960, (c.band ? Y - 10 : Y + size * 0.5 + 36) + (1 - sq) * 16, {
      size: c.band ? 44 : 36, font: NUNITO, weight: 800, color: c.band ? 'cream' : 'mint', alpha: sq * (1 - out),
      shadow: { color: 'rgba(0,0,0,0.6)', blur: 10, y: 3 },
    });
  }
  ctx.restore();
}

// "PUBLIC, ON-CHAIN": slams across centre as a full-width band (letters drop in, no hex), then the
// band morphs into a docked pill top-left.
function drawTitle(ctx, E, t) {
  // round 3: the band lands ONCE, as the step-3 payoff (24.375), holds, then docks into the corner pill
  const TB = BT[2];
  if (t < TB - 0.04) return;
  const TXT = 'PUBLIC, ON-CHAIN';
  const dock = E.Ease.backIn ? E.backIn(E.seg(t, TB + 0.6, TB + 0.8)) : E.expoInOut(E.seg(t, TB + 0.6, TB + 0.8));
  const dk = E.clamp01(dock);
  const size = E.lerp(150, PILL.size, dk);
  ctx.save();
  const open = E.expoOut(E.seg(t, TB - 0.04, TB + 0.06));
  const pw = E.measureText(ctx, TXT, { size: PILL.size, font: PASSION, weight: 700, tracking: 0.06 }) * 1.05 + 80;
  const bx = E.lerp(960 - 960 * open, PILL.x, dock), bw = E.lerp(1920 * open, pw, dock);
  const by = E.lerp(540 - 185, PILL.y, dock), bh = Math.max(8, E.lerp(310, PILL.h, dock)); // round 3: taller band holds the kicker too
  const rad = E.lerp(0, PILL.h / 2, dk);
  ctx.save();
  rr(ctx, bx, by, bw, bh, rad);
  ctx.fillStyle = `rgba(11,8,32,${E.lerp(0.88, 0.9, dock)})`; ctx.fill();
  // smear frame while docking
  if (dock > 0.05 && dock < 0.95) { ctx.save(); ctx.globalAlpha *= 0.25; rr(ctx, bx + 60, by + 10, bw, bh, rad); ctx.fillStyle = '#ffc93c'; ctx.fill(); ctx.restore(); }
  if (dock > 0.5) { ctx.lineWidth = 3; ctx.strokeStyle = '#ffc93c'; ctx.stroke(); }
  else { ctx.fillStyle = '#ffc93c'; ctx.fillRect(bx, by, bw, 4); ctx.fillRect(bx, by + bh - 4, bw, 4); }
  ctx.restore();
  const dotX = bx + E.lerp(60, 26, dock), cy = by + bh / 2;
  const blink = 0.45 + 0.55 * Math.max(E.cueEnv(t, 'kick', 0.18), dock < 1 ? 1 : 0);
  ctx.beginPath(); ctx.arc(dotX, cy, E.lerp(12, 7, dock), 0, E.TAU); ctx.fillStyle = `rgba(99,185,141,${blink})`; ctx.fill();
  ctx.beginPath(); ctx.arc(dotX, cy, E.lerp(12, 7, dock) + 8 * E.cueEnv(t, 'kick', 0.25), 0, E.TAU);
  ctx.strokeStyle = `rgba(182,243,106,${0.6 * E.cueEnv(t, 'kick', 0.25)})`; ctx.lineWidth = 2; ctx.stroke();
  // kicker above the band word: EVERY PAYOUT IS
  const kq = E.backOut(E.seg(t, TB - 0.02, TB + 0.1), 2) * (1 - E.seg(t, TB + 0.56, TB + 0.62));
  if (kq > 0) E.drawText(ctx, 'EVERY PAYOUT IS', 960, 540 - 145 + (1 - kq) * 30, { size: 56, font: PASSION, weight: 700, color: 'mint', tracking: 0.12, alpha: E.clamp01(kq), shadow: { color: 'rgba(0,0,0,0.7)', blur: 14, y: 4 } });
  const cx = E.lerp(960, bx + bw / 2 + 16, dock);
  E.drawText(ctx, TXT, cx, cy + size * 0.04, {
    size: Math.max(8, size), font: PASSION, weight: 700, color: 'cream', tracking: 0.06,
    glow: { color: 'rgba(255,201,60,0.7)', blur: E.lerp(40, 10, dk) },
    extrude: dk < 0.6 ? { depth: Math.round(E.lerp(12, 0, dk)), color: 'outline', dark: 0.4 } : undefined,
    perChar: ({ i: k, n }) => {
      if (dock > 0) return { color: k >= 8 ? 'coin' : undefined };
      const q = E.stagger(t - (TB - 0.04), k, n, { spread: 0.06, dur: 0.12, e: 'backOut' });
      return { y: (1 - q) * -120, scale: 1.6 - 0.6 * q, alpha: E.clamp01(q * 3), color: k >= 8 ? 'coin' : undefined };
    },
  });
  ctx.restore();
}

function drawHUD(ctx, E, t, xform) {
  let n = 0; for (const b of BT) if (t >= b) n++;
  if (n === 0) return;
  const k = E.env(t, BT[n - 1], 0.12);
  ctx.save(); xform(ctx);
  E.drawText(ctx, 'STEP', 1700, 58, { size: 19, font: 'mono', weight: 700, align: 'right', color: 'catnipLight', tracking: 0.25 });
  E.drawText(ctx, `/0${N}`, 1850, 112, { size: 40, font: PASSION, weight: 700, align: 'right', color: 'lavender' });
  const flip = E.backOut(E.seg(t, BT[n - 1], BT[n - 1] + 0.16), 2.4);
  E.drawText(ctx, `0${n}`, 1782, 104, {
    size: 84, font: PASSION, weight: 700, align: 'right', color: 'coin',
    glow: { color: 'rgba(255,201,60,0.6)', blur: 20 * (0.4 + k) },
    perChar: () => ({ sy: flip, scale: 1 + 0.18 * k }),
  });
  for (let j = 0; j < N; j++) {
    const on = j < n;
    ctx.fillStyle = on ? '#ffc93c' : 'rgba(153,102,204,0.35)';
    const hh = on && j === n - 1 ? 10 + 14 * k : 10;
    ctx.fillRect(1640 + j * 54, 150 - hh / 2, 46, hh);
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------ scene
export default {
  start: 22.36, end: END - 2 / 60, // round 3: hard cut away 2 frames before the slam (crack only on 1573-1574)

  async init(E) {
    await Promise.all(Object.entries(STILL_FILES).map(async ([k, url]) => {
      try { const r = await fetch(url); if (r.ok) STILLS[k] = await createImageBitmap(await r.blob()); } catch { /* placeholder */ }
    }));
    const fonts = [
      ['Passion One', 'assets/sprites/fonts/passion-one-latin-700-normal.woff2', { weight: '700' }],
      ['Passion One', 'assets/sprites/fonts/passion-one-latin-ext-700-normal.woff2', { weight: '700' }],
      ['Nunito', 'assets/sprites/fonts/nunito-latin-wght-normal.woff2', { weight: '200 1000' }],
      ['Nunito', 'assets/sprites/fonts/nunito-latin-ext-wght-normal.woff2', { weight: '200 1000' }],
    ];
    for (const [fam, url, desc] of fonts) {
      try { const ff = new FontFace(fam, `url(${url})`, desc); await ff.load(); document.fonts.add(ff); } catch { /* fallback */ }
    }
  },

  draw(ctx, t, lt, E) {
    const { W, H } = E;
    const pre = t < T0;
    const I = implodeP(t, E);
    const P = overviewP(t, E);
    const Ic = capOutP(t, E);
    const xform = (c) => { if (Ic > 0) { c.translate(960, 540); c.scale(1 - 0.9 * Ic, 1 - 0.9 * Ic); c.rotate(Ic * 0.4); c.translate(-960, -540); c.globalAlpha *= 1 - Ic; } };

    if (pre) { // bleed over s6: card #1 falls in (round 3: no hex rain, no pre-roll band)
      drawBlock(ctx, E, 0, t, poseOf(0, t, E), 0.6);
      return;
    }

    // ---- background (lifted ~15% vs round 1)
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#150c33'); bg.addColorStop(0.55, '#1f1140'); bg.addColorStop(1, '#2c1450');
    ctx.fillStyle = bg; ctx.fillRect(-60, -60, W + 120, H + 120);
    const vg = ctx.createRadialGradient(HERO.x, HERO.y, 60, HERO.x, HERO.y, 1000);
    vg.addColorStop(0, `rgba(140,70,200,${0.42 + 0.14 * E.cueEnv(t, 'kick', 0.15)})`); vg.addColorStop(1, 'rgba(111,45,168,0)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    drawFloor(ctx, E, t);

    // ---- cards, oldest (furthest) first
    const poses = BT.map((b, i) => (t >= b - 0.14 ? poseOf(i, t, E) : null));
    let nLanded = 0; for (const b of BT) if (t >= b) nLanded++;
    const race = E.seg(t, 25.96, 26.06);
    for (let i = 0; i < N; i++) {
      const p = poses[i]; if (!p) continue;
      const hero = i === nLanded - 1;
      let glow = hero ? 0.5 + 0.5 * E.env(t, BT[i], 0.25) + 0.4 * E.env(t, MID[i], 0.2) : 0;
      if (race > 0) glow = Math.max(glow, E.env(t, 25.96 + (i / 3) * 0.1, 0.12) + 0.4 * (race * 3 >= i ? 1 : 0));
      if (P > 0.3) glow = Math.max(glow, 0.3 + 0.5 * E.cueEnv(t, 'snare', 0.06));
      drawBlock(ctx, E, i, t, p, glow);
    }

    // ---- links on top: snap from the previous card to the new one on landing, packet on every kick
    for (let i = 1; i < N; i++) {
      const a = poses[i - 1], b = poses[i];
      if (!a || !b || t < BT[i] - 0.03) continue;
      // from the visible (left) part of the older card to the new card's left edge, mid-height
      const bx = b.x - (BW / 2) * b.s, by = b.y + 20 * b.s;
      const ax = Math.min(a.x, (a.x - (BW / 2) * a.s + bx) / 2), ay = a.y + 20 * a.s;
      const gp = E.expoOut(E.seg(t, BT[i] - 0.03, BT[i] + 0.06));
      let pulse = null;
      for (const kt of KICKS) if (t >= kt && t < kt + 0.2 && kt >= BT[i]) pulse = E.expoInOut(E.seg(t, kt, kt + 0.18));
      if (race > 0) { const pos = race * 3; pulse = pos >= i - 1 && pos < i ? pos - (i - 1) : null; }
      const sw = Math.max(4, 9 * Math.min(a.s, b.s));
      E.chainLink(ctx, ax, ay, bx, by, gp, {
        color: race > 0 && race * 3 >= i ? 'coin' : 'catnipLight', width: sw, links: 4, pulse, pulseColor: 'coin', alpha: Math.min(1, b.a),
      });
      // snap spark where the link lands
      const sp = E.env(t, BT[i] + 0.04, 0.1);
      if (sp > 0.02) {
        const rg = ctx.createRadialGradient(bx, by, 0, bx, by, 80);
        rg.addColorStop(0, `rgba(255,243,208,${sp})`); rg.addColorStop(1, 'rgba(255,201,60,0)');
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rg; ctx.fillRect(bx - 80, by - 80, 160, 160); ctx.restore();
      }
    }

    // ---- landing FX: floor shockwave + glyph dust
    for (let i = 0; i < N; i++) {
      const tl = t - BT[i];
      if (tl < 0 || tl > 0.7 || !poses[i]) continue;
      const p = poses[i];
      const fx = p.x, fy = p.y + (BH / 2) * p.s + 10;
      ctx.save(); ctx.translate(fx, fy); ctx.scale(1, 0.24);
      E.shockwave(ctx, 0, 0, E.seg(tl, 0, 0.5), { radius: 640 * p.s / HS, width: 30, color: i === N - 1 ? 'coin' : 'catnipLight', rings: 2 });
      ctx.restore();
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const parts = E.burst({ seed: 700 + i, count: 34, t, t0: BT[i], x: fx, y: fy - 10, speed: [320, 980], angle: [-Math.PI * 0.97, -Math.PI * 0.03], gravity: 1500, drag: 1.2, life: [0.3, 0.6], size: [18, 30] });
      for (const q of parts) { // round 3: pixel sparks + hearts, no hex glyphs
        ctx.globalAlpha = q.alpha;
        if (q.r(3) < 0.12) { E.drawImg(ctx, 'heart', q.x, q.y, { w: q.size * 1.2, pixel: true }); continue; }
        ctx.fillStyle = q.r(1) > 0.7 ? '#ffc93c' : '#9fdfba';
        const sz = Math.round(q.size * 0.45); ctx.fillRect(Math.round(q.x - sz / 2), Math.round(q.y - sz / 2), sz, sz);
      }
      ctx.restore();
    }

    // ---- last card: the public tick
    // round 3: no 'done' tick on the SOON step (it read as already paid); the OPENS SOON chip pulses instead
    // race packet head in the overview
    if (race > 0 && race < 1 && poses[0] && poses[N - 1]) {
      const pos = race * 3, k = Math.min(2, Math.floor(pos)), u = pos - k;
      const a = poses[k], b = poses[k + 1];
      const hx = E.lerp(a.x, b.x, u), hy = E.lerp(a.y, b.y, u);
      const rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 70);
      rg.addColorStop(0, 'rgba(255,243,208,1)'); rg.addColorStop(0.3, 'rgba(255,201,60,0.7)'); rg.addColorStop(1, 'rgba(255,201,60,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rg; ctx.fillRect(hx - 70, hy - 70, 140, 140);
      const tg = ctx.createLinearGradient(hx - 360, 0, hx, 0);
      tg.addColorStop(0, 'rgba(255,201,60,0)'); tg.addColorStop(1, 'rgba(255,220,120,0.85)');
      ctx.fillStyle = tg;
      for (let k2 = 0; k2 < 5; k2++) { const oy = (k2 - 2) * 9 + 4 * Math.sin(t * 90 + k2); const ln = 360 * (0.5 + 0.5 * E.rand('trl', k2, E.frame)); ctx.fillRect(hx - ln, hy + oy - 1.5, ln, 3); }
      ctx.restore();
    }

    // ---- implosion: the chain collapses into one white-hot cube at centre (s8 cracks it open)
    if (I > 0.004) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      E.zoomBlur(ctx, { cx: 960, cy: 540, strength: 0.2 * I + 0.08 * Ic, samples: 8 });
      let roll = 0; for (const r of ROLL) roll = Math.max(roll, E.env(t, r, 0.05));
      const r = 90 + 420 * I + 60 * roll;
      const rg = ctx.createRadialGradient(960, 540, 0, 960, 540, r);
      rg.addColorStop(0, `rgba(255,255,255,${0.85 * I})`); rg.addColorStop(0.35, `rgba(255,201,60,${0.5 * I})`); rg.addColorStop(1, 'rgba(255,201,60,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      const cs = 190 * Math.sqrt(I) * (1 + 0.12 * roll);
      ctx.translate(960, 540); ctx.rotate(0.03 * Math.sin(t * 70)); ctx.translate(-960, -540);
      E.isoBlock(ctx, 960, 515, cs, { p: 1, color: 'grape', edge: 'coin', glow: I, glyphs: false, seed: 8, t });
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let k = 0; k < 28; k++) {
        const ang = E.rand('well', k) * E.TAU, ph = E.fract(E.rand('well', k, 1) + (t - 26.04) * 5);
        const r0 = 900 * (1 - ph) + 60, r1 = r0 + 140 * (1 - ph);
        ctx.strokeStyle = `rgba(255,220,140,${0.55 * I * ph})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(960 + Math.cos(ang) * r1, 540 + Math.sin(ang) * r1 * 0.75); ctx.lineTo(960 + Math.cos(ang) * r0, 540 + Math.sin(ang) * r0 * 0.75); ctx.stroke();
      }
      ctx.restore();
    }

    // ---- type
    for (let i = 0; i < N; i++) drawCaption(ctx, E, i, t, xform);
    drawTitle(ctx, E, t);
    drawHUD(ctx, E, t, xform);

    E.lightLeak(ctx, t, { seed: 17, intensity: 0.08 + 0.05 * E.env(t, T0, 0.3), colors: ['#ffc93c', '#ff7aa2', '#63b98d'], speed: 0.5 });
    E.scanlines(ctx, { alpha: 0.05 });
  },

  fx(t, lt, E) {
    if (t < T0) return { aberration: 4 * E.seg(t, 22.4, T0) };
    const imp = E.env(t, T0, 0.12);
    let land = 0; for (let j = 1; j < N; j++) land += E.env(t, BT[j], 0.09);
    let cut = 0; for (const m of MID) cut += E.env(t, m, 0.06);
    let g = 0; for (const [gt, dur] of GLITCH) if (t >= gt) g = Math.max(g, E.env(t, gt, dur));
    let roll = 0; for (const r of ROLL) roll = Math.max(roll, E.env(t, r, 0.05));
    const I = implodeP(t, E);
    return {
      shake: 12 * imp + 6 * land + 3 * cut + 3 * roll + 6 * I,
      zoom: 1 + 0.012 * E.cueEnv(t, 'kick', 0.1) + 0.05 * I,
      aberration: 2.5 * E.cueEnv(t, 'snare', 0.08) + 5 * imp + 3 * land + 2 * roll + 10 * I,
      glitch: 0.3 * g,
      flash: Math.max(0.3 * E.env(t, T0, 0.04), 0.35 * E.env(t, BT[2], 0.05)),
      flashColor: '#ffffff',
      grain: 0.035,
    };
  },
};
