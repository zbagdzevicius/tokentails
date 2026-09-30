import { appPath } from "@/api/routing";
import { isApp } from "@/models/app";
import { useRouter } from "next/router";
import { useEffect } from "react";

const RESTORE_KEY = "app-route-restore";

// Capacitor answers a full page load of any extensionless path with
// index.html, so the static app export boots on "/" whatever the URL says.
// Route to the page the URL names, which covers plain anchors and
// window.location jumps. Web builds never render this.
//
// Old-form dynamic paths are rewritten to exported routes (appPath). If a
// path still cannot be served, Next falls back to a full load of the same
// URL, which boots index.html again. The session key lets each path try once,
// so that case lands on "/" instead of reloading forever.
export const AppRouteRestore = () => {
  const router = useRouter();

  useEffect(() => {
    if (!isApp || !router.isReady || router.pathname !== "/") return;
    const { pathname, search, hash } = window.location;
    if (pathname === "/" || pathname === "/index.html") return;
    const target = appPath(pathname + search + hash);
    try {
      if (sessionStorage.getItem(RESTORE_KEY) === target) {
        sessionStorage.removeItem(RESTORE_KEY);
        return;
      }
      sessionStorage.setItem(RESTORE_KEY, target);
    } catch {
      // Storage unavailable: restore without the loop guard.
    }
    // A hard navigation can resolve false before the page unloads, so the
    // key is cleared only after a client-side route change succeeded.
    router.replace(target).then((changed) => {
      if (!changed) return;
      try {
        sessionStorage.removeItem(RESTORE_KEY);
      } catch {}
    });
  }, [router]);

  return null;
};
