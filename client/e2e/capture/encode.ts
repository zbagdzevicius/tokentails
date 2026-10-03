import type { Browser } from "@playwright/test";
import sharp from "sharp";

/**
 * WebM encoding without ffmpeg (task 6d: no new dependencies): the captured frames are drawn onto
 * a canvas in a clean page (no fake clock) at the clip's frame rate, and `MediaRecorder` records
 * `canvas.captureStream(0)` with one `requestFrame()` per frame. The bitrate is picked from the
 * size budget and lowered until the clip fits.
 */
export interface EncodeOptions {
  fps: number;
  width: number;
  height: number;
  maxBytes: number;
}

async function toJpegDataUrls(frames: Buffer[], width: number, height: number): Promise<string[]> {
  const out: string[] = [];
  for (const frame of frames) {
    const jpeg = await sharp(frame).resize(width, height, { fit: "cover", kernel: "nearest" }).jpeg({ quality: 92 }).toBuffer();
    out.push(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
  }
  return out;
}

export async function encodeWebm(browser: Browser, frames: Buffer[], options: EncodeOptions): Promise<{ bytes: Buffer; bitrate: number; mimeType: string }> {
  const urls = await toJpegDataUrls(frames, options.width, options.height);
  const page = await browser.newPage();
  try {
    await page.setContent("<!doctype html><canvas id=c></canvas>");
    const durationSec = frames.length / options.fps;
    let bitrate = Math.floor(((options.maxBytes * 0.85) * 8) / durationSec);
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await page.evaluate(
        async ({ urls, fps, width, height, bitrate }) => {
          const canvas = document.getElementById("c") as HTMLCanvasElement;
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d")!;
          ctx.imageSmoothingEnabled = false;
          const images = await Promise.all(
            urls.map(
              (src) =>
                new Promise<HTMLImageElement>((resolve, reject) => {
                  const img = new Image();
                  img.onload = () => resolve(img);
                  img.onerror = reject;
                  img.src = src;
                }),
            ),
          );
          const stream = canvas.captureStream(0);
          const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
          const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";
          const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
          const chunks: Blob[] = [];
          recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
          const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
          ctx.drawImage(images[0], 0, 0);
          recorder.start();
          const frameMs = 1000 / fps;
          const t0 = performance.now();
          for (let i = 0; i < images.length; i++) {
            ctx.drawImage(images[i], 0, 0);
            track.requestFrame();
            const due = t0 + (i + 1) * frameMs;
            await new Promise((resolve) => setTimeout(resolve, Math.max(0, due - performance.now())));
          }
          recorder.stop();
          await stopped;
          const blob = new Blob(chunks, { type: "video/webm" });
          const buffer = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode.apply(null, Array.from(buffer.subarray(i, i + 0x8000)));
          return { base64: btoa(binary), mimeType };
        },
        { urls, fps: options.fps, width: options.width, height: options.height, bitrate },
      );
      const bytes = Buffer.from(result.base64, "base64");
      if (bytes.length <= options.maxBytes) return { bytes, bitrate, mimeType: result.mimeType };
      bitrate = Math.floor(bitrate * (options.maxBytes / bytes.length) * 0.85);
    }
    throw new Error(`could not fit the clip under ${options.maxBytes} bytes`);
  } finally {
    await page.close();
  }
}
