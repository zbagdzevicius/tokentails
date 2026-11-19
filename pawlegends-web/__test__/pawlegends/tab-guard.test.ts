/**
 * @jest-environment jsdom
 */
import { installTabGuard, tabKeepsFocusMove } from "@/components/pawlegends/tabGuard";

const tab = (target: Element): KeyboardEvent => {
  const e = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

describe("/play Tab guard", () => {
  it("cancels Tab on buttons and links, keeps it in text fields", () => {
    document.body.innerHTML = '<button id="b">x</button><a id="a" href="#">y</a><input id="i" type="email"><input id="c" type="checkbox">';
    const off = installTabGuard(window);
    expect(tab(document.getElementById("b")!).defaultPrevented).toBe(true);
    expect(tab(document.getElementById("a")!).defaultPrevented).toBe(true);
    expect(tab(document.getElementById("c")!).defaultPrevented).toBe(true);
    expect(tab(document.getElementById("i")!).defaultPrevented).toBe(false);
    expect(tab(document.body).defaultPrevented).toBe(true);
    off();
    expect(tab(document.getElementById("b")!).defaultPrevented).toBe(false);
  });

  it("knows text fields", () => {
    expect(tabKeepsFocusMove(document.createElement("textarea"))).toBe(true);
    expect(tabKeepsFocusMove(document.createElement("select"))).toBe(true);
    expect(tabKeepsFocusMove(document.createElement("button"))).toBe(false);
    expect(tabKeepsFocusMove(null)).toBe(false);
  });
});
