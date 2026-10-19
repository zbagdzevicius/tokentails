/**
 * Renderer + scene (GDD 12): DPR governor (start 1.5 on iOS, 1.25 elsewhere on touch, cap 2; step down 0.25 after
 * 2 s under 45 fps), sRGB output, and WebGL context-loss handling (reload on restore).
 */
import { Scene, SRGBColorSpace, WebGLRenderer } from 'three';

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  dpr: number;
  private slow = 0;
  private fpsAvg = 60;

  constructor(readonly host: HTMLElement) {
    const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.renderer = new WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.dpr = Math.min(2, window.devicePixelRatio || 1, touch ? (ios ? 1.5 : 1.25) : 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.domElement.className = 'fm-canvas';
    host.appendChild(this.renderer.domElement);
    const c = this.renderer.domElement;
    c.addEventListener('webglcontextlost', (e) => e.preventDefault());
    c.addEventListener('webglcontextrestored', () => location.reload());
    this.resize();
  }

  get aspect(): number {
    return this.host.clientWidth / Math.max(1, this.host.clientHeight);
  }

  resize(): void {
    this.renderer.setSize(this.host.clientWidth, this.host.clientHeight, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
  }

  /** Called once per frame with the real frame time. */
  govern(dt: number): void {
    if (dt <= 0 || dt > 0.5) return;
    this.fpsAvg += (1 / dt - this.fpsAvg) * 0.05;
    if (this.fpsAvg < 45) this.slow += dt;
    else this.slow = 0;
    if (this.slow > 2 && this.dpr > 0.75) {
      this.dpr = Math.max(0.75, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
      this.slow = 0;
    }
  }
}
