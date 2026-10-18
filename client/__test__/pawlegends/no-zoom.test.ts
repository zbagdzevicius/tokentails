/**
 * @jest-environment jsdom
 */
/**
 * The `/pawlegends` host page zoom lock: pinch gestures and two-finger moves are blocked, `<html>`/`<body>` pan
 * only, and unmount puts everything back (other pages keep pinch zoom).
 */
import { lockPageZoom, PAWLEGENDS_VIEWPORT } from "@/components/pawlegends/noZoom";

function fire(type: string, touches = 0): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", { value: Array.from({ length: touches }, () => ({})) });
  document.body.dispatchEvent(e);
  return e;
}

/** jsdom's CSSStyleDeclaration drops `touch-action`, so `<html>`/`<body>` get a Map-backed style. */
function fakeStyle(el: HTMLElement): void {
  const m = new Map<string, string>();
  const style = {
    getPropertyValue: (p: string) => m.get(p) ?? "",
    setProperty: (p: string, v: string) => void m.set(p, v),
    removeProperty: (p: string) => void m.delete(p),
  };
  Object.defineProperty(el, "style", { value: style, configurable: true });
}

describe("lockPageZoom", () => {
  it("blocks pinch and restores the page on unlock", () => {
    fakeStyle(document.documentElement);
    fakeStyle(document.body);
    document.body.style.setProperty("touch-action", "auto");
    const unlock = lockPageZoom(document);
    const touchAction = (el: HTMLElement) => el.style.getPropertyValue("touch-action");
    expect(touchAction(document.documentElement)).toBe("pan-x pan-y");
    expect(touchAction(document.body)).toBe("pan-x pan-y");
    for (const g of ["gesturestart", "gesturechange", "gestureend"]) expect(fire(g).defaultPrevented).toBe(true);
    expect(fire("touchmove", 2).defaultPrevented).toBe(true);
    expect(fire("touchmove", 1).defaultPrevented).toBe(false);
    unlock();
    expect(fire("gesturestart").defaultPrevented).toBe(false);
    expect(fire("touchmove", 2).defaultPrevented).toBe(false);
    expect(touchAction(document.documentElement)).toBe("");
    expect(touchAction(document.body)).toBe("auto");
  });

  it("locks the viewport scale", () => {
    expect(PAWLEGENDS_VIEWPORT).toContain("maximum-scale=1");
    expect(PAWLEGENDS_VIEWPORT).toContain("user-scalable=no");
    expect(PAWLEGENDS_VIEWPORT).toContain("viewport-fit=cover");
  });
});
