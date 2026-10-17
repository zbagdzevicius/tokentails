/**
 * WebGL context loss (GDD 11.2): in-app browsers drop the context when backgrounded. We prevent the
 * default (so the browser may restore it), tell listeners `true` on loss and `false` on restore.
 * three.js re-uploads geometry and textures by itself after a restore; the Renderer re-renders and
 * the UI pauses the sim and resumes on tap. During the clip pass a loss aborts the encode.
 */
export class ContextLossWatcher {
  private cbs: ((lost: boolean) => void)[] = [];
  lost = false;
  /** Incremented on every loss (the clip pass compares it to detect a loss mid-pass). */
  epoch = 0;
  private readonly onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.epoch++;
    this.emit(true);
  };
  private readonly onRestored = () => {
    this.lost = false;
    this.emit(false);
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('webglcontextlost', this.onLost, false);
    canvas.addEventListener('webglcontextrestored', this.onRestored, false);
  }

  on(cb: (lost: boolean) => void): void {
    this.cbs.push(cb);
  }

  private emit(lost: boolean): void {
    for (const cb of this.cbs.slice()) {
      try {
        cb(lost);
      } catch {
        /* a listener must not break the others */
      }
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored, false);
    this.cbs = [];
  }
}
