/**
 * The invite QR (docs/plans/moba/MULTIPLAYER.md §5.3): `qrcode-generator` (MIT) inside the party chunk only. One
 * scalable SVG path (dark modules) on a light quiet zone, so phones can scan it off a dark screen.
 */
import qrcode from 'qrcode-generator';

export interface QrMatrix {
  size: number;
  dark(row: number, col: number): boolean;
}

/** The QR matrix of `text` (error correction M, the smallest version that fits). */
export function qrMatrix(text: string): QrMatrix {
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  const size = q.getModuleCount();
  return { size, dark: (r, c) => q.isDark(r, c) };
}

/** An inline SVG of `text`'s QR, with a 4-module quiet zone; `label` is its accessible name. */
export function qrSvg(text: string, label: string): string {
  const m = qrMatrix(text);
  const quiet = 4;
  const n = m.size + quiet * 2;
  let d = '';
  for (let r = 0; r < m.size; r++) {
    let run = 0;
    for (let c = 0; c <= m.size; c++) {
      if (c < m.size && m.dark(r, c)) {
        run++;
        continue;
      }
      if (run) d += `M${c - run + quiet} ${r + quiet}h${run}v1h-${run}z`;
      run = 0;
    }
  }
  const safe = label.replace(/[&<>"']/g, '');
  return `<svg class="pp-qr-svg" viewBox="0 0 ${n} ${n}" role="img" aria-label="${safe}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#14101c"/></svg>`;
}
