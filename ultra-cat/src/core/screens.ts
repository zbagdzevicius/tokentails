// DOM screen manager. FROZEN. meta-ui registers every menu screen here and drives the flow.
// A screen is any element with class "screen"; hidden screens carry the "hidden" class.

export interface Screen {
  id: string;
  el: HTMLElement;
  onShow?(params?: unknown): void;
  onHide?(): void;
}

class ScreenManager {
  private screens = new Map<string, Screen>();
  private cur: string | null = null;
  private stack: string[] = [];

  register(s: Screen): void {
    this.screens.set(s.id, s);
  }

  /** Show one screen, hide every other registered screen. */
  show(id: string, params?: unknown): void {
    const s = this.screens.get(id);
    if (!s) throw new Error(`screen not registered: ${id}`);
    for (const o of this.screens.values()) {
      if (o.id === id) continue;
      if (!o.el.classList.contains('hidden')) {
        o.el.classList.add('hidden');
        o.onHide?.();
      }
    }
    if (this.cur && this.cur !== id) this.stack.push(this.cur);
    if (this.stack.length > 20) this.stack.shift();
    this.cur = id;
    s.el.classList.remove('hidden');
    document.body.dataset.screen = id;
    s.onShow?.(params);
  }

  /** Hide every screen (gameplay). */
  hideAll(): void {
    for (const o of this.screens.values()) {
      if (!o.el.classList.contains('hidden')) {
        o.el.classList.add('hidden');
        o.onHide?.();
      }
    }
    if (this.cur) this.stack.push(this.cur);
    this.cur = null;
    document.body.dataset.screen = '';
  }

  /** Go back to the previous screen, if any. */
  back(): void {
    const prev = this.stack.pop();
    if (prev) {
      this.show(prev);
      this.stack.pop(); // show() pushed the one we left
    }
  }

  current(): string | null {
    return this.cur;
  }
}

export const screens = new ScreenManager();
