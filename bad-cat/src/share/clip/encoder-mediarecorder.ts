/**
 * Fallback 1 (GDD 7.3): real-time MediaRecorder on canvas.captureStream(), ~12 s to record. Frames are pushed
 * with requestFrame() and paced at the clip frame rate. Audio (FULL build): the AudioEngine's captureStream()
 * track is recorded with the canvas track, and `onFirstFrame` (called right after frame 0 is requested) schedules
 * the clip's SFX/music in real time with AudioEngine.scheduleClip, aligned to clip time 2.0 s.
 */
import type { ClipEncoder, EncodedClip } from './encoder-types';
import { ClipAbortError, sleep } from './encoder-types';

export const RECORDER_MIMES = [
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01F',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const;

export function pickRecorderMime(isSupported: (m: string) => boolean = (m) => MediaRecorder.isTypeSupported(m)): string | null {
  for (const m of RECORDER_MIMES) {
    try {
      if (isSupported(m)) return m;
    } catch {
      /* next */
    }
  }
  return null;
}

export function mediaRecorderAvailable(canvas?: HTMLCanvasElement): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  const c = canvas ?? (typeof document !== 'undefined' ? document.createElement('canvas') : null);
  return !!c && typeof (c as HTMLCanvasElement).captureStream === 'function';
}

/** Does this recorder MIME carry an audio track? Explicit codec lists must name one; a bare container may. */
export function mimeTakesAudio(mime: string): boolean {
  if (!/codecs=/.test(mime)) return true;
  return /mp4a|opus|vorbis|aac/i.test(mime);
}

export async function createMediaRecorderEncoder(o: {
  canvas: HTMLCanvasElement;
  fps: number;
  audioStream?: MediaStream | null;
  /** Called once, right after frame 0 is requested; may return a cancel function (stops scheduled audio). */
  onFirstFrame?: () => (() => void) | void;
}): Promise<ClipEncoder | null> {
  if (!mediaRecorderAvailable(o.canvas)) return null;
  const mime = pickRecorderMime();
  if (!mime) return null;
  const stream = o.canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
  let hasAudio = false;
  const audioTrack = o.audioStream?.getAudioTracks()[0];
  if (audioTrack && mimeTakesAudio(mime)) {
    stream.addTrack(audioTrack);
    hasAudio = true;
  }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  let failure: unknown = null;
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  rec.onerror = (e) => {
    failure = failure ?? e;
  };
  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });
  rec.start(250);

  const frameMs = 1000 / o.fps;
  let next = performance.now();
  let started = false;
  let cancelAudio: (() => void) | null = null;
  const stop = () => {
    stream.getTracks().forEach((t) => {
      if (t !== audioTrack) t.stop();
    });
  };

  return {
    kind: 'mediarecorder',
    async addFrame(): Promise<void> {
      if (failure) throw failure;
      track?.requestFrame?.();
      if (!started) {
        started = true;
        next = performance.now();
        try {
          cancelAudio = (hasAudio && o.onFirstFrame?.()) || null;
        } catch {
          cancelAudio = null;
        }
      }
      next += frameMs;
      const wait = next - performance.now();
      if (wait > 0) await sleep(wait);
      else next = performance.now(); // fell behind: do not try to catch up
    },
    async finish(): Promise<EncodedClip> {
      if (rec.state !== 'inactive') rec.stop();
      await stopped;
      stop();
      if (failure) throw failure;
      if (!chunks.length) throw new ClipAbortError('recorder produced no data');
      const type = mime.split(';')[0];
      return { blob: new Blob(chunks, { type }), mime: type, audio: hasAudio };
    },
    async cancel(): Promise<void> {
      try {
        cancelAudio?.();
      } catch {
        /* ignore */
      }
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch {
        /* ignore */
      }
      stop();
    },
  };
}
