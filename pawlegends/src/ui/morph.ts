/**
 * A tiny DOM morph for menu sheets that re-render from markup (chat sheet, party chat): patch `root`'s children toward
 * the parsed `html` in place, keeping every node whose tag still matches. A focused input therefore stays the same
 * node, so a phone keeps its keyboard, the draft and the caret when a message arrives (iOS never reopens the keyboard
 * for a programmatic focus outside a tap), and a scrolled list keeps its scroll position. Index-based, no keys: fine
 * for lists of tens of rows. `fill` runs on the parsed tree first (the textContent holes), so equal content compares
 * equal and is left alone. Text-only; never used per frame.
 */
export function morphHtml(root: Element, html: string, fill?: (tree: DocumentFragment) => void): void {
  const t = root.ownerDocument.createElement('template');
  t.innerHTML = html;
  fill?.(t.content);
  morphChildren(root, t.content);
}

function morphChildren(from: Node, to: Node): void {
  const a = Array.from(from.childNodes);
  const b = Array.from(to.childNodes);
  for (let i = 0; i < b.length; i++) {
    const old = a[i];
    const nw = b[i]!;
    if (!old) {
      from.appendChild(nw);
      continue;
    }
    if (old.isEqualNode(nw)) continue;
    if (old.nodeType === 3 && nw.nodeType === 3) {
      old.textContent = nw.textContent;
      continue;
    }
    if (old.nodeType === 1 && nw.nodeType === 1 && (old as Element).tagName === (nw as Element).tagName) {
      syncAttrs(old as Element, nw as Element);
      morphChildren(old, nw);
      continue;
    }
    from.replaceChild(nw, old);
  }
  for (let i = b.length; i < a.length; i++) a[i]!.parentNode?.removeChild(a[i]!);
}

function syncAttrs(el: Element, next: Element): void {
  for (const at of Array.from(el.attributes)) if (!next.hasAttribute(at.name)) el.removeAttribute(at.name);
  for (const at of Array.from(next.attributes)) if (el.getAttribute(at.name) !== at.value) el.setAttribute(at.name, at.value);
}
