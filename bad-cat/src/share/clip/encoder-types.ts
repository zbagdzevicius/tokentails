/** Shared shape of the two clip encoders (WebCodecs + mediabunny, MediaRecorder fallback). */
export interface EncodedClip {
  blob: Blob;
  mime: string;
  audio: boolean;
}

export interface ClipEncoder {
  readonly kind: 'webcodecs' | 'mediarecorder' | 'capture';
  /** Wrap/capture the canvas as frame `i`. Call in the same task as the draw; await for backpressure. */
  addFrame(canvas: HTMLCanvasElement, i: number): Promise<void>;
  finish(): Promise<EncodedClip>;
  cancel(): Promise<void>;
}

export class ClipAbortError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ClipAbortError';
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
