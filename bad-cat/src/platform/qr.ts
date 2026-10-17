/**
 * QR code as an inline SVG string (save code "move to another device", GDD 13.6; streamer dare QR).
 * qrcode-generator (MIT, no deps), byte mode with UTF-8, error correction L, auto version.
 * Returns '' when the text does not fit in a version-40 code (~2,950 bytes) or anything throws.
 */
import qrcode from 'qrcode-generator';

export const QR_MAX_BYTES = 2_900;

function utf8Bytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

export function qrSvg(text: string, opts: { cellSize?: number; margin?: number; dark?: string; light?: string } = {}): string {
  try {
    if (typeof text !== 'string' || !text) return '';
    const bytes = utf8Bytes(text);
    if (bytes.length > QR_MAX_BYTES) return '';
    const qr = qrcode(0, 'L');
    // Feed raw UTF-8 bytes through the default byte converter (one char per byte).
    qr.addData(String.fromCharCode(...bytes), 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const margin = opts.margin ?? 2;
    const size = n + margin * 2;
    const dark = opts.dark ?? '#2a1a22';
    const light = opts.light ?? '#fff3dc';
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        let w = 1;
        while (c + w < n && qr.isDark(r, c + w)) w++;
        d += `M${c + margin} ${r + margin}h${w}v1h-${w}z`;
        c += w - 1;
      }
    }
    const px = opts.cellSize ? ` width="${size * opts.cellSize}" height="${size * opts.cellSize}"` : '';
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"${px} shape-rendering="crispEdges" role="img" aria-label="QR code">` +
      `<rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`
    );
  } catch {
    return '';
  }
}
