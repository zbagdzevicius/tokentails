// Shared placeholder used by s1..s4 until the real scenes land. Exercises the main helpers so the
// pipeline (assets, text, sprites, clips, fx) is verified end to end. Safe to delete afterwards.
export function placeholderScene({ label, bars, color, clip, cat }) {
  return {
    draw(ctx, t, lt, E) {
      const { W, H } = E;
      // background: palette gradient + iso grid
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, E.col('skyTop')); g.addColorStop(1, E.col(color));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      E.isoGrid(ctx, { tile: 140, cols: 16, rows: 16, color: 'lavender', alpha: 0.25, reveal: E.seg(lt, 0, 0.6, 'expoOut') });
      // gameplay clip panel (diamond mask) if any clip exists
      const clips = E.assets.clipList;
      const name = clip && E.clipInfo(clip) ? clip : clips[0]?.name;
      if (name) {
        const p = E.segB(lt, 0, 1, 'backOut');
        E.diamondReveal(ctx, p, (c) => E.drawClip(c, name, lt, 1080, 180, 760, 720, { zoom: 1 + 0.1 * E.pulse(t) }), { cx: 1460, cy: 540, size: 900 });
      }
      // beat-pulsed shockwave
      const lb = E.lastCue(t, 'kick');
      if (lb != null) E.shockwave(ctx, 420, 760, E.seg(t, lb, lb + 0.45), { radius: 260, width: 18, color: 'catnip', rings: 2 });
      // sprite on the beat
      E.drawSprite(ctx, cat, 'RUNNING', E.spriteFrame(t, 12), 420, 760, 6 + 2 * E.pulse(t, { decay: 0.1 }), { anchor: 'feet' });
      // coin particles
      for (const p of E.burst({ seed: 3, count: 24, t, t0: E.lastCue(t, 'kick') ?? 0, x: 420, y: 700, speed: [300, 800], angle: [-Math.PI, 0], life: [0.4, 0.8] }))
        E.drawImg(ctx, 'coin', p.x, p.y, { w: 28, h: 28, rot: p.rot, alpha: p.alpha });
      // kinetic label
      E.drawText(ctx, label, 140, 180, {
        size: 120, align: 'left', color: 'cream', tracking: 0.04, extrude: { depth: 8, color: 'plum' },
        perChar: ({ i, n }) => { const q = E.seg(lt, i * 0.03, i * 0.03 + 0.4, 'backOut'); return { y: (1 - q) * 80, alpha: q }; },
      });
      E.drawText(ctx, `PLACEHOLDER  ${bars}`, 140, 290, { size: 30, font: 'mono', align: 'left', color: 'catnip', tracking: 0.2 });
      E.drawText(ctx, `t ${t.toFixed(3)}   lt ${lt.toFixed(3)}   bar ${E.barIndex(t) + 1}.${(E.beatIndex(t) % 4) + 1}   f${E.frame}`, 140, 340, { size: 30, font: 'mono', align: 'left', color: 'lilac' });
      // beat ticker
      for (let b = 0; b < 4; b++) {
        const on = E.beatIndex(t) % 4 === b;
        E.star(ctx, 170 + b * 70, 430, on ? 30 : 20, { fill: on ? 'coin' : 'grape', stroke: 'outline', lineWidth: 4 });
      }
      E.crt(ctx, t, { scan: 0.12, roll: 0.05, flicker: 0.03, vignette: 0 });
    },
    fx(t, lt, E) {
      const k = E.cueEnv(t, 'kick', 0.08);
      return { shake: 6 * k, aberration: 3 * k, flash: 0.25 * E.env(lt, 0, 0.1) };
    },
  };
}
