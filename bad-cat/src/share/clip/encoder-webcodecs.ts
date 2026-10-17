/**
 * WebCodecs H.264 encoder muxed to MP4 with mediabunny (GDD 7.3). Loaded lazily (dynamic import from
 * share/index.ts); mediabunny itself is imported dynamically here too, so it lands in its own chunk.
 *
 * - Probes VideoEncoder.isConfigSupported down AVC_CODECS.
 * - `new VideoFrame(canvas)` happens synchronously at the start of addFrame (same task as the draw).
 * - Every VideoFrame is closed right after encode(); addFrame waits while encodeQueueSize > 4.
 * - Audio: an AudioBuffer (from AudioEngine.renderOffline) is AAC-encoded when AudioEncoder can do it, else silent.
 */
import type { ClipEncoder, EncodedClip } from './encoder-types';
import { ClipAbortError, sleep } from './encoder-types';

export const AVC_CODECS = ['avc1.42001f', 'avc1.42e01f', 'avc1.4d401f', 'avc1.42002a', 'avc1.640028'] as const;
export const CLIP_BITRATE = 2_500_000;
export const KEYFRAME_EVERY = 30;
export const MAX_QUEUE = 4;

export function webCodecsAvailable(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/** First supported AVC config for w × h at 30 fps, or null. */
export async function probeAvc(w: number, h: number, fps = 30): Promise<VideoEncoderConfig | null> {
  if (!webCodecsAvailable()) return null;
  for (const codec of AVC_CODECS) {
    const cfg: VideoEncoderConfig = {
      codec,
      width: w,
      height: h,
      bitrate: CLIP_BITRATE,
      framerate: fps,
      avc: { format: 'avc' },
      latencyMode: 'quality',
    };
    try {
      const res = await VideoEncoder.isConfigSupported(cfg);
      if (res.supported) return res.config ?? cfg;
    } catch {
      /* try the next profile */
    }
  }
  return null;
}

export interface WebCodecsOptions {
  width: number;
  height: number;
  fps: number;
  audio?: AudioBuffer | null;
  /** Clip time (s) where the audio buffer starts (the game part starts at 2 s). */
  audioStartSec?: number;
}

/** Returns null when no AVC config is supported (caller falls back to MediaRecorder). */
export async function createWebCodecsEncoder(o: WebCodecsOptions): Promise<ClipEncoder | null> {
  const config = await probeAvc(o.width, o.height, o.fps);
  if (!config) return null;
  const mb = await import('mediabunny');

  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const videoSource = new mb.EncodedVideoPacketSource('avc');
  output.addVideoTrack(videoSource, { frameRate: o.fps });

  let audioSource: InstanceType<typeof mb.AudioBufferSource> | null = null;
  if (o.audio && typeof AudioEncoder !== 'undefined') {
    try {
      const ok = await mb.canEncodeAudio('aac', {
        numberOfChannels: o.audio.numberOfChannels,
        sampleRate: o.audio.sampleRate,
        bitrate: 128_000,
      });
      if (ok) {
        audioSource = new mb.AudioBufferSource({ codec: 'aac', bitrate: 128_000 }, { startTimestamp: o.audioStartSec ?? 0 });
        output.addAudioTrack(audioSource);
      }
    } catch {
      audioSource = null;
    }
  }

  await output.start();

  let failure: unknown = null;
  let muxChain: Promise<void> = Promise.resolve();
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const packet = mb.EncodedPacket.fromEncodedChunk(chunk);
      muxChain = muxChain.then(() => videoSource.add(packet, meta)).catch((e) => {
        failure = failure ?? e;
      });
    },
    error: (e) => {
      failure = failure ?? e;
    },
  });
  try {
    encoder.configure(config);
  } catch {
    // configure can still throw after isConfigSupported said yes: release the muxer, let the caller fall back
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      /* ignore */
    }
    await output.cancel().catch(() => undefined);
    return null;
  }

  const frameUs = Math.round(1_000_000 / o.fps);
  let closed = false;

  return {
    kind: 'webcodecs',
    async addFrame(canvas: HTMLCanvasElement, i: number): Promise<void> {
      if (failure) throw failure;
      // Same task as the draw: wrap before any await.
      const frame = new VideoFrame(canvas, { timestamp: i * frameUs, duration: frameUs });
      try {
        encoder.encode(frame, { keyFrame: i % KEYFRAME_EVERY === 0 });
      } finally {
        frame.close();
      }
      let guard = 0;
      while (encoder.encodeQueueSize > MAX_QUEUE && guard++ < 500) await sleep(4);
      if (failure) throw failure;
    },
    async finish(): Promise<EncodedClip> {
      if (failure) throw failure;
      await encoder.flush();
      encoder.close();
      closed = true;
      await muxChain;
      if (failure) throw failure;
      let hasAudio = false;
      if (audioSource && o.audio) {
        try {
          await audioSource.add(o.audio);
          hasAudio = true;
        } catch {
          hasAudio = false;
        }
      }
      await output.finalize();
      const buf = target.buffer;
      if (!buf) throw new ClipAbortError('mux produced no data');
      return { blob: new Blob([buf], { type: 'video/mp4' }), mime: 'video/mp4', audio: hasAudio };
    },
    async cancel(): Promise<void> {
      try {
        if (!closed && encoder.state !== 'closed') encoder.close();
      } catch {
        /* already closed */
      }
      closed = true;
      try {
        await output.cancel();
      } catch {
        /* ignore */
      }
    },
  };
}
