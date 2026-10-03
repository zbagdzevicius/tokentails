// Shared placeholder for s1..s8 until the real scenes land. Each one prints its section name and
// exercises one group of helpers, so the whole pipeline (manifests, clips, community footage,
// sprites, ledger motif, fx) is verified end to end. Replace a scene file to retire its placeholder.
export function placeholderScene({ name, demo, color = 'plum', clip, cat = 'albertino' }) {
  return {
    draw(ctx, t, lt, E) {
      const { W, H } = E;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, E.col('night')); g.addColorStop(1, E.col(color));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const DEMOS = { clip: demoClip, levels: demoLevels, ledger: demoLedger, receipt: demoReceipt, community: demoCommunity, end: demoEnd };
      (DEMOS[demo] || demoClip)(ctx, t, lt, E, { clip, cat });

      // section title (kinetic, per-letter stagger)
      const label = E.SECTIONS[name] || name.toUpperCase();
      E.drawText(ctx, label, 120, 130, {
        size: 96, align: 'left', color: 'cream', tracking: 0.04, extrude: { depth: 8, color: 'outline' },
        perChar: ({ i }) => { const q = E.seg(lt, i * 0.025, i * 0.025 + 0.4, 'backOut'); return { y: (1 - q) * 70, alpha: q }; },
      });
      E.drawText(ctx, `${name.toUpperCase()}  PLACEHOLDER  ${demo}`, 124, 210, { size: 26, font: 'mono', align: 'left', color: 'catnip', tracking: 0.2 });
      E.drawText(ctx, `t ${t.toFixed(3)}  lt ${lt.toFixed(3)}  bar ${E.barIndex(t) + 1}.${(E.beatIndex(t) % 4) + 1}  f${E.frame}`, 124, 250, { size: 24, font: 'mono', align: 'left', color: 'lilac' });
      for (let b = 0; b < 4; b++) {
        const on = E.beatIndex(t) % 4 === b;
        E.star(ctx, 150 + b * 56, 310, on ? 24 : 15, { fill: on ? 'coin' : 'grape', stroke: 'outline', lineWidth: 3 });
      }
    },
    fx(t, lt, E) {
      const k = E.cueEnv(t, 'kick', 0.08);
      return { shake: 5 * k, aberration: 2.5 * k, flash: 0.3 * E.env(lt, 0, 0.08) };
    },
  };
}

function demoClip(ctx, t, lt, E, { clip, cat }) {
  const name = clip && E.clipInfo(clip) ? clip : E.clipList[0]?.name;
  const p = E.segB(lt, 0, 1, 'backOut');
  E.diamondReveal(ctx, p, (c) => E.drawClip(c, name || 'none', lt, 960, 200, 860, 720, { zoom: 1 + 0.08 * E.pulse(t) }), { cx: 1390, cy: 560, size: 1000 });
  const lb = E.lastCue(t, 'kick');
  if (lb != null) E.shockwave(ctx, 420, 820, E.seg(t, lb, lb + 0.45), { radius: 240, width: 16, color: 'catnip', rings: 2 });
  E.drawSprite(ctx, cat, 'RUNNING', E.spriteFrame(t, 12), 420, 820, 7 + 2 * E.pulse(t, { decay: 0.1 }), { anchor: 'feet' });
  for (const q of E.burst({ seed: 3, count: 20, t, t0: lb ?? 0, x: 420, y: 760, speed: [300, 800], angle: [-Math.PI, 0], life: [0.4, 0.8] }))
    E.drawImg(ctx, 'catnip', q.x, q.y, { w: 40, h: 40, rot: q.rot, alpha: q.alpha });
}

function demoLevels(ctx, t, lt, E) {
  // 8 heists as a 4x2 grid of clip tiles, cascading in
  const list = E.clipList;
  for (let i = 0; i < 8; i++) {
    const q = E.stagger(lt, i, 8, { start: 0.1, spread: 0.8, dur: 0.4, e: 'expoOut' });
    if (q <= 0) continue;
    const x = 120 + (i % 4) * 430, y = 400 + Math.floor(i / 4) * 300;
    const c = list.length ? list[i % list.length].name : 'none';
    E.mask(ctx, (cc) => E.path.roundRect(cc, x, y + (1 - q) * 80, 400, 260 * q, 18), (cc) => E.drawClip(cc, c, lt, x, y, 400, 260, { loop: true }));
    E.drawText(ctx, `HEIST ${String(i + 1).padStart(2, '0')}`, x + 18, y + 236, { size: 26, font: 'mono', align: 'left', color: 'cream', alpha: q });
  }
}

function demoLedger(ctx, t, lt, E) {
  E.hashStream(ctx, t, { alpha: 0.28, size: 20, density: 0.5 });
  E.blockChain(ctx, 4, { x: 330, y: 620, dx: 420, w: 340, h: 230, p: E.seg(lt, 0.1, 2.6), link: { links: 3, color: 'lavender', width: 6 }, pulse: E.fract(lt * 0.8) * 3 });
  for (let i = 0; i < 3; i++) E.isoBlock(ctx, 1500 + i * 120, 330 - i * 60, 150, { p: E.seg(lt, 0.3 + i * 0.25, 0.9 + i * 0.25), color: i === 1 ? 'catnipDeep' : 'grape', edge: 'cream', seed: i });
  E.checkmark(ctx, 1700, 900, 70, E.seg(lt, 2.4, 3.3), { color: 'vaultOpen' });
  E.drawText(ctx, E.hashResolve(E.fullHash('demo', 1).slice(0, 34), E.seg(lt, 0.5, 2.5), 4), 960, 960, { size: 30, font: 'mono', color: 'catnip' });
}

function demoReceipt(ctx, t, lt, E) {
  E.hashStream(ctx, t, { alpha: 0.18, size: 18, density: 0.4, color: 'lavender' });
  E.receiptCard(ctx, 1300, 120, 520, 820, {
    p: E.seg(lt, 0.1, 2.4), title: 'RESCUE RECEIPT', sub: 'placeholder copy',
    lines: [['MISSION', 'HEIST 01'], ['CAT', 'FREED'], ['STATUS', 'LOGGED']], total: ['RECORD', 'ON-CHAIN'],
    stamp: 'VERIFIED', stampP: E.seg(lt, 2.5, 3.1), rot: 0.03,
  });
  E.ledgerBlock(ctx, 560, 640, 620, 380, { p: E.seg(lt, 0.3, 1.8), index: 42, rows: [['EVENT', 'RESCUE'], ['SHELTER', 'PAYOUT']], verified: E.seg(lt, 1.8, 2.6), glow: E.pulse(t) });
}

function demoCommunity(ctx, t, lt, E) {
  const ugc = E.communityOf('ugc').map((c) => `community/${c.name}`);
  const paris = E.communityOf('paris').map((c) => `community/${c.name}`);
  const names = ugc.length ? ugc : ['community/none-a', 'community/none-b', 'community/none-c'];
  E.reelStrip(ctx, names, t, { y: 680, h: 560, speed: 260, rot: -0.06 });
  const big = paris[0] || names[0];
  E.phoneClip(ctx, big, lt, 1560, 560, 820, { rot: 0.08 * E.backOut(E.seg(lt, 0, 0.6)), tilt: -0.3, clip: { fit: 'contain', bg: 'blur' } });
}

function demoEnd(ctx, t, lt, E) {
  const q = E.seg(lt, 0, 0.6, 'backOut');
  E.drawImg(ctx, 'logo', 960, 560, { w: 900 * q, alpha: E.clamp01(q) });
  E.speedLines(ctx, t, { inner: 520, alpha: 0.25, color: 'cream' });
  E.lightLeak(ctx, t, { intensity: 0.25 });
}
