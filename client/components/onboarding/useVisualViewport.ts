import { useEffect, useState } from "react";

/**
 * The visible part of the viewport. On iOS Safari the software keyboard shrinks the visual
 * viewport but not the layout viewport, so a `fixed inset-0` overlay would put its bottom panel
 * (the nameplate) under the keyboard. Sizing the overlay to this box keeps it in view. In the
 * native app `@capacitor/keyboard` with `resize: 'body'` shrinks the page itself, and this box
 * then simply matches the window.
 *
 * Returns null until measured (SSR, or no `visualViewport`): callers fall back to `inset-0`.
 */
export function useVisualViewport(): { height: number; offsetTop: number } | null {
  const [box, setBox] = useState<{ height: number; offsetTop: number } | null>(null);
  useEffect(() => {
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    if (!viewport) return;
    const update = () => {
      setBox((previous) => {
        const next = { height: Math.round(viewport.height), offsetTop: Math.round(viewport.offsetTop) };
        return previous && previous.height === next.height && previous.offsetTop === next.offsetTop
          ? previous
          : next;
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}
