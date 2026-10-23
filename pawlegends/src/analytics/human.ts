/**
 * Human filter (POC.md §13): a session counts as human when it has at least 20 real (trusted) pointer, touch or key
 * events, a match of at least 60 s, and a non-headless user agent. Every analytics event carries the current
 * verdict as `human`, and gate metrics use only human sessions.
 */

export const HUMAN_MIN_INPUTS = 20;
export const HUMAN_MIN_MATCH_S = 60;

/** Headless or automated browser? (navigator.webdriver, HeadlessChrome, PhantomJS, and friends). */
export function isHeadlessAgent(ua: string, webdriver: boolean): boolean {
  return webdriver || /HeadlessChrome|PhantomJS|Puppeteer|Playwright|jsdom|HappyDOM|bot\b|crawler|spider/i.test(ua);
}

export class HumanFilter {
  private inputs = 0;
  private longestMatchS = 0;
  private readonly headless: boolean;

  constructor(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', webdriver = typeof navigator !== 'undefined' && navigator.webdriver === true) {
    this.headless = isHeadlessAgent(ua, webdriver);
  }

  /** Listen for trusted inputs on `target` (capture phase, passive). */
  install(target: Pick<EventTarget, 'addEventListener'>): void {
    const on = (e: Event): void => {
      if (e.isTrusted) this.inputs++;
    };
    for (const t of ['pointerdown', 'touchstart', 'keydown']) target.addEventListener(t, on, { capture: true, passive: true });
  }

  /** Count an input (tests, or a source that is not a DOM event). */
  input(n = 1): void {
    this.inputs += n;
  }

  match(seconds: number): void {
    this.longestMatchS = Math.max(this.longestMatchS, seconds);
  }

  get human(): boolean {
    return !this.headless && this.inputs >= HUMAN_MIN_INPUTS && this.longestMatchS >= HUMAN_MIN_MATCH_S;
  }
}
