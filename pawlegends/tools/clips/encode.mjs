/**
 * trailers-hq: one set of encoder settings for every trailer edit (tools/trailer30, trailer60 and the HQ concepts), so
 * gameplay goes through as few lossy generations as possible:
 *
 *   take (record.mjs: PNG at 2x, Lanczos down, x264 CRF 10)  ->  SEGMENT (cuts, grade, overlays; CRF 6)  ->  MASTER
 *
 * The round 1-4 edits re-encoded the takes at CRF 8 after a JPEG + CRF 17 (20 Mbps cap) capture, added film grain
 * (`noise=alls=3`) to the master and wrote the web copy at 1.5 Mbps / 30 fps: four lossy steps plus noise on a flat
 * toon picture. Use these instead, never grain, and scale only with `SCALE` (Lanczos, full chroma).
 */

/** Scale filter flags for any resize in an edit (punch-ins should be avoided: re-capture closer instead). */
export const SCALE = 'flags=lanczos+accurate_rnd+full_chroma_int';

const TAGS = ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];

/** Between edit steps: visually lossless x264 (about a fifth of ProRes 422 HQ on disk). */
export const SEGMENT = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '6', '-pix_fmt', 'yuv420p', '-profile:v', 'high', ...TAGS];

/** ProRes 422 HQ (10 bit) for a step that must stay near-lossless through heavy compositing (~55 MB/s at 1080p60). */
export const PRORES = ['-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-pix_fmt', 'yuv422p10le', ...TAGS];

/**
 * The master (16:9 1920x1080, 9:16 1080x1920, 1:1 1080x1080, 60 fps): x264 High 4:2:0 CRF 12, peaks capped at
 * 60 Mbps so it stays inside level 4.2; a toon picture lands near 25-45 Mbps. A keyframe a second.
 */
export function master(fps = 60) {
  return ['-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-maxrate', '60M', '-bufsize', '120M', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps), ...TAGS];
}

/** The web copy: 1080p at the master's 60 fps, CRF 19 capped at 10 Mbps (~40-70 MB a minute), +faststart. */
export function web(fps = 60) {
  return ['-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '10M', '-bufsize', '20M', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps * 2), ...TAGS, '-movflags', '+faststart'];
}

/** Audio for masters and the web copy (the score is already at -14 LUFS, <= -1 dBTP). */
export const AUDIO = ['-c:a', 'aac', '-b:a', '320k', '-ar', '48000'];
