// 2D canvas painters for Wardrobe items (no DOM: they only draw on a context you pass). The portrait
// (src/ui/portrait.ts) draws hats and scarves with these in its face space: origin = the centre of the head, u = one
// hundredth of the portrait width, the head is a 40u x 33u ellipse and the ear tips sit at (+-30u, -50u). The
// Wardrobe tiles use the FX icons.
import { css, shade } from './color';

const INK = '#2a1c14';

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, inner = 0.45): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * inner : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.3, y, x - s * 0.7, y - s * 0.9, x, y - s * 0.3);
  c.bezierCurveTo(x + s * 0.7, y - s * 0.9, x + s * 1.3, y, x, y + s * 0.9);
  c.closePath();
}

const fillStroke = (c: CanvasRenderingContext2D, fill: string | CanvasGradient, lw: number) => {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = INK;
  c.stroke();
};

/** a hat on the portrait head (drawn after the head) */
export function drawHat2D(c: CanvasRenderingContext2D, id: string, C: readonly number[], u: number, t: number): void {
  const lw = 2.4 * u;
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  switch (id) {
    case 'bow': {
      c.translate(20 * u, -30 * u);
      c.rotate(0.35);
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(s * 9 * u, -10 * u, s * 13 * u, -2 * u);
        c.quadraticCurveTo(s * 11 * u, 8 * u, 0, 0);
        fillStroke(c, css(C[0]), lw * 0.8);
      }
      c.beginPath();
      c.arc(0, 0, 3.4 * u, 0, Math.PI * 2);
      fillStroke(c, css(C[1]), lw * 0.7);
      break;
    }
    case 'beanie': {
      c.beginPath();
      c.moveTo(-23 * u, -25 * u);
      c.bezierCurveTo(-22 * u, -52 * u, 22 * u, -52 * u, 23 * u, -25 * u);
      c.closePath();
      fillStroke(c, css(C[0]), lw);
      c.strokeStyle = css(C[2], 0.8);
      c.lineWidth = 1.6 * u;
      for (const x of [-12, -4, 4, 12]) {
        c.beginPath();
        c.moveTo(x * u, -28 * u);
        c.lineTo(x * 0.8 * u, -44 * u);
        c.stroke();
      }
      c.beginPath();
      c.roundRect(-25 * u, -30 * u, 50 * u, 8 * u, 3 * u);
      fillStroke(c, css(C[2]), lw * 0.8);
      c.beginPath();
      c.arc(0, -51 * u, 6 * u, 0, Math.PI * 2);
      fillStroke(c, css(C[1]), lw * 0.8);
      break;
    }
    case 'party': {
      c.translate(-4 * u, -28 * u);
      c.rotate(-0.25);
      c.beginPath();
      c.moveTo(-12 * u, 0);
      c.lineTo(0, -32 * u);
      c.lineTo(12 * u, 0);
      c.closePath();
      c.save();
      c.clip();
      c.fillStyle = css(C[0]);
      c.fillRect(-14 * u, -34 * u, 28 * u, 36 * u);
      c.fillStyle = css(C[1]);
      for (const y of [-6, -18]) c.fillRect(-14 * u, (y - 4) * u, 28 * u, 5 * u);
      c.restore();
      c.lineWidth = lw * 0.9;
      c.strokeStyle = INK;
      c.stroke();
      c.beginPath();
      c.arc(0, -33 * u, 4.2 * u, 0, Math.PI * 2);
      fillStroke(c, css(C[2]), lw * 0.7);
      break;
    }
    case 'flowers': {
      for (let i = 0; i < 7; i++) {
        const a = -0.95 + (i / 6) * 1.9;
        const x = Math.sin(a) * 26 * u;
        const y = -24 * u - Math.cos(a) * 9 * u;
        if (i < 6) {
          c.fillStyle = css(C[4]);
          c.beginPath();
          c.ellipse(x + 4 * u, y + 1.5 * u, 3.4 * u, 1.6 * u, a, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = css(C[i % 3]);
        for (let k = 0; k < 5; k++) {
          const b = (k / 5) * Math.PI * 2 + i;
          c.beginPath();
          c.arc(x + Math.cos(b) * 2.8 * u, y + Math.sin(b) * 2.8 * u, 2.4 * u, 0, Math.PI * 2);
          c.fill();
        }
        c.lineWidth = 0.9 * u;
        c.strokeStyle = 'rgba(42,28,20,.55)';
        c.beginPath();
        c.arc(x, y, 5 * u, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = css(C[3]);
        c.beginPath();
        c.arc(x, y, 1.9 * u, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'chef': {
      c.beginPath();
      c.moveTo(-15 * u, -27 * u);
      c.lineTo(-17 * u, -38 * u);
      c.lineTo(17 * u, -38 * u);
      c.lineTo(15 * u, -27 * u);
      c.closePath();
      fillStroke(c, css(C[1]), lw * 0.9);
      c.beginPath();
      c.arc(-11 * u, -44 * u, 9 * u, Math.PI * 0.6, Math.PI * 1.75);
      c.arc(0, -50 * u, 10.5 * u, Math.PI * 1.1, Math.PI * 1.9);
      c.arc(11 * u, -44 * u, 9 * u, Math.PI * 1.25, Math.PI * 0.4);
      c.closePath();
      fillStroke(c, css(C[0]), lw * 0.9);
      break;
    }
    case 'propeller': {
      c.beginPath();
      c.moveTo(-20 * u, -27 * u);
      c.bezierCurveTo(-19 * u, -47 * u, 19 * u, -47 * u, 20 * u, -27 * u);
      c.closePath();
      c.save();
      c.clip();
      c.fillStyle = css(C[0]);
      c.fillRect(-22 * u, -50 * u, 22 * u, 26 * u);
      c.fillStyle = css(C[1]);
      c.fillRect(0, -50 * u, 22 * u, 26 * u);
      c.restore();
      c.lineWidth = lw * 0.9;
      c.strokeStyle = INK;
      c.stroke();
      c.beginPath();
      c.ellipse(-2 * u, -26 * u, 20 * u, 4 * u, 0, 0, Math.PI);
      fillStroke(c, css(C[2]), lw * 0.7);
      c.lineWidth = 1.6 * u;
      c.beginPath();
      c.moveTo(0, -43 * u);
      c.lineTo(0, -49 * u);
      c.stroke();
      const spin = Math.cos(t * 9);
      for (const s of [-1, 1]) {
        c.beginPath();
        c.ellipse(s * 7 * u * spin, -50 * u, 7.5 * u * Math.abs(spin) + 0.5 * u, 2.4 * u, 0, 0, Math.PI * 2);
        fillStroke(c, css(s < 0 ? C[2] : C[3]), lw * 0.6);
      }
      break;
    }
    case 'crown': {
      c.beginPath();
      c.moveTo(-18 * u, -26 * u);
      c.lineTo(-20 * u, -44 * u);
      c.lineTo(-10 * u, -34 * u);
      c.lineTo(0, -48 * u);
      c.lineTo(10 * u, -34 * u);
      c.lineTo(20 * u, -44 * u);
      c.lineTo(18 * u, -26 * u);
      c.closePath();
      const g = c.createLinearGradient(0, -48 * u, 0, -26 * u);
      g.addColorStop(0, css(shade(C[0], 0.35)));
      g.addColorStop(1, css(C[1]));
      fillStroke(c, g, lw * 0.9);
      for (const [x, y] of [
        [-20, -45],
        [0, -49],
        [20, -45],
      ]) {
        c.beginPath();
        c.arc(x * u, y * u, 2.4 * u, 0, Math.PI * 2);
        fillStroke(c, css(C[0]), lw * 0.4);
      }
      c.beginPath();
      c.arc(0, -31 * u, 3 * u, 0, Math.PI * 2);
      fillStroke(c, css(C[2]), lw * 0.5);
      for (const s of [-1, 1]) {
        c.beginPath();
        c.arc(s * 10 * u, -30 * u, 2.2 * u, 0, Math.PI * 2);
        fillStroke(c, css(C[3]), lw * 0.4);
      }
      c.fillStyle = 'rgba(255,255,255,.85)';
      star(c, -6 * u, -40 * u, 2.6 * u * (0.7 + 0.3 * Math.sin(t * 4)), t);
      c.fill();
      break;
    }
    case 'witch': {
      c.translate(0, -29 * u);
      c.rotate(0.12);
      c.beginPath();
      c.ellipse(0, 0, 27 * u, 5.5 * u, 0, 0, Math.PI * 2);
      fillStroke(c, css(C[0]), lw * 0.8);
      c.beginPath();
      c.moveTo(-14 * u, -1 * u);
      c.quadraticCurveTo(-8 * u, -20 * u, -2 * u, -30 * u);
      c.quadraticCurveTo(8 * u, -36 * u, 16 * u, -30 * u);
      c.quadraticCurveTo(6 * u, -24 * u, 14 * u, -1 * u);
      c.closePath();
      fillStroke(c, css(C[1]), lw * 0.9);
      c.beginPath();
      c.moveTo(-14 * u, -2 * u);
      c.lineTo(14 * u, -2 * u);
      c.lineTo(12.6 * u, -7 * u);
      c.lineTo(-12.4 * u, -7 * u);
      c.closePath();
      fillStroke(c, css(C[2]), lw * 0.5);
      break;
    }
  }
  c.restore();
}

/** a scarf on the portrait: behind = the part drawn before the head (the cape), else the part over the chin */
export function drawScarf2D(c: CanvasRenderingContext2D, id: string, C: readonly number[], u: number, t: number, behind: boolean): void {
  const lw = 2.4 * u;
  c.save();
  c.lineJoin = 'round';
  if (behind) {
    if (id === 'cape') {
      const flap = Math.sin(t * 3) * 2 * u;
      c.beginPath();
      c.moveTo(-30 * u, 20 * u);
      c.quadraticCurveTo(-52 * u - flap, 34 * u, -48 * u, 46 * u);
      c.lineTo(48 * u, 46 * u);
      c.quadraticCurveTo(52 * u + flap, 34 * u, 30 * u, 20 * u);
      c.closePath();
      fillStroke(c, css(C[0]), lw);
      c.strokeStyle = css(C[2], 0.7);
      c.lineWidth = 1.6 * u;
      for (const x of [-28, 28]) {
        c.beginPath();
        c.moveTo(x * 0.7 * u, 26 * u);
        c.quadraticCurveTo(x * 1.2 * u, 36 * u, x * 1.3 * u, 46 * u);
        c.stroke();
      }
    }
    c.restore();
    return;
  }
  const band = (h: number, col: string) => {
    c.beginPath();
    c.moveTo(-27 * u, 23 * u);
    c.quadraticCurveTo(0, 36 * u, 27 * u, 23 * u);
    c.lineTo(27 * u, 23 * u + h * u);
    c.quadraticCurveTo(0, (36 + h) * u, -27 * u, 23 * u + h * u);
    c.closePath();
    fillStroke(c, col, lw * 0.8);
  };
  switch (id) {
    case 'red': {
      c.beginPath();
      c.moveTo(16 * u, 30 * u);
      c.lineTo(26 * u, 46 * u);
      c.lineTo(17 * u, 47 * u);
      c.lineTo(9 * u, 32 * u);
      c.closePath();
      fillStroke(c, css(C[0]), lw * 0.8);
      band(8, css(C[0]));
      c.strokeStyle = css(C[1], 0.9);
      c.lineWidth = 1.6 * u;
      for (const x of [-16, -6, 4]) {
        c.beginPath();
        c.moveTo(x * u, 26 * u + Math.abs(x) * 0.12 * u + 2 * u);
        c.lineTo((x + 3) * u, 34 * u + Math.abs(x) * 0.12 * u);
        c.stroke();
      }
      break;
    }
    case 'bell':
      band(4, css(C[0]));
      c.beginPath();
      c.arc(0, 34.5 * u, 5 * u, 0, Math.PI * 2);
      fillStroke(c, css(C[1]), lw * 0.7);
      c.fillStyle = INK;
      c.fillRect(-3 * u, 34.5 * u, 6 * u, 1.2 * u);
      c.beginPath();
      c.arc(0, 37 * u, 1.1 * u, 0, Math.PI * 2);
      c.fill();
      break;
    case 'bandana':
      c.beginPath();
      c.moveTo(-18 * u, 29 * u);
      c.lineTo(18 * u, 29 * u);
      c.lineTo(0, 45 * u);
      c.closePath();
      fillStroke(c, css(C[0]), lw * 0.8);
      c.fillStyle = css(C[1]);
      for (const [x, y] of [
        [-8, 33],
        [6, 32],
        [-1, 39],
      ]) {
        c.beginPath();
        c.arc(x * u, y * u, 1.6 * u, 0, Math.PI * 2);
        c.fill();
      }
      band(4, css(C[0]));
      break;
    case 'bowtie':
      band(3, css(C[0]));
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(0, 33 * u);
        c.lineTo(s * 11 * u, 27 * u);
        c.lineTo(s * 11 * u, 39 * u);
        c.closePath();
        fillStroke(c, css(C[1]), lw * 0.7);
      }
      c.beginPath();
      c.arc(0, 33 * u, 3 * u, 0, Math.PI * 2);
      fillStroke(c, css(C[1]), lw * 0.6);
      break;
    case 'cape':
      band(4, css(C[1]));
      c.beginPath();
      c.arc(0, 32 * u, 3.6 * u, 0, Math.PI * 2);
      fillStroke(c, css(C[1]), lw * 0.6);
      break;
  }
  c.restore();
}

/** a Wardrobe tile icon for a trail FX (w x h, transparent background) */
export function drawFxIcon(c: CanvasRenderingContext2D, id: string, C: readonly number[], w: number, _h: number): void {
  const u = w / 100;
  c.save();
  c.lineJoin = 'round';
  // a little running paw trail swoosh for context
  c.strokeStyle = 'rgba(42,28,20,.18)';
  c.lineWidth = 3 * u;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(12 * u, 78 * u);
  c.quadraticCurveTo(50 * u, 40 * u, 88 * u, 62 * u);
  c.stroke();
  switch (id) {
    case 'none':
      c.strokeStyle = 'rgba(42,28,20,.45)';
      c.lineWidth = 5 * u;
      c.beginPath();
      c.arc(50 * u, 50 * u, 22 * u, 0, Math.PI * 2);
      c.moveTo(34 * u, 66 * u);
      c.lineTo(66 * u, 34 * u);
      c.stroke();
      break;
    case 'sparkles':
      for (const [x, y, r, k] of [
        [30, 40, 13, 0],
        [62, 30, 9, 2],
        [70, 62, 11, 1],
        [44, 68, 6, 0],
      ]) {
        star(c, x * u, y * u, r * u, 0.3 + k, 0.32);
        fillStroke(c, css(C[k % C.length]), 1.6 * u);
      }
      break;
    case 'hearts':
      for (const [x, y, s, k] of [
        [34, 46, 13, 0],
        [66, 34, 9, 1],
        [64, 66, 8, 0],
      ]) {
        heart(c, x * u, y * u, s * u);
        fillStroke(c, css(C[k]), 1.8 * u);
      }
      break;
    case 'rainbow': {
      const n = C.length;
      for (let i = 0; i < n; i++) {
        c.strokeStyle = css(C[i]);
        c.lineWidth = 6 * u;
        c.beginPath();
        c.arc(50 * u, 78 * u, (40 - i * 5.5) * u, Math.PI * 1.08, Math.PI * 1.92);
        c.stroke();
      }
      break;
    }
    case 'bubbles':
      for (const [x, y, r] of [
        [36, 60, 15],
        [64, 40, 11],
        [58, 72, 7],
        [30, 30, 6],
      ]) {
        c.beginPath();
        c.arc(x * u, y * u, r * u, 0, Math.PI * 2);
        fillStroke(c, css(C[0], 0.75), 1.8 * u);
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc((x - r * 0.35) * u, (y - r * 0.35) * u, r * 0.25 * u, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 'leaves':
      for (const [x, y, r, k] of [
        [34, 40, 0.6, 0],
        [64, 56, -0.5, 1],
        [44, 72, 2.2, 2],
        [70, 28, 1.2, 3],
      ]) {
        c.save();
        c.translate(x * u, y * u);
        c.rotate(r);
        c.beginPath();
        c.moveTo(-13 * u, 0);
        c.quadraticCurveTo(0, -10 * u, 13 * u, 0);
        c.quadraticCurveTo(0, 10 * u, -13 * u, 0);
        c.closePath();
        fillStroke(c, css(C[k % C.length]), 1.6 * u);
        c.strokeStyle = 'rgba(42,28,20,.5)';
        c.lineWidth = 1.2 * u;
        c.beginPath();
        c.moveTo(-11 * u, 0);
        c.lineTo(11 * u, 0);
        c.stroke();
        c.restore();
      }
      break;
  }
  c.restore();
}
