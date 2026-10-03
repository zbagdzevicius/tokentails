import { LAYERS } from "@/design/tokens";
import type { ReactNode } from "react";
import { CrashPanel } from "./CrashPanel";
import { FALLBACK_COPY } from "./copy";
import { CrashProbe, markCrashRecovered } from "./crash-probe";
import { ErrorBoundary } from "./ErrorBoundary";
import { reloadApp } from "./reload";

/**
 * Below the root fallback, above the page's own modals and toasts. Not on the
 * F3 scale yet (a `page-fallback` token is requested in alignment-log/1e.md),
 * so it is derived from `system`.
 */
export const Z_PAGE_FALLBACK = LAYERS.system - 10;

interface PageBoundaryProps {
  /** The route (page file path). The caller also uses it as the React key. */
  route: string;
  /** The visible path; a change clears a crash. Defaults to `route`. */
  path?: string;
  children?: ReactNode;
}

/**
 * One page's content (F9). Keyed by route in MainLayout, so navigating
 * away from a crashed page always renders the next page fresh, while the
 * providers above it (profile, cats, toasts) stay mounted.
 */
export const PageBoundary = ({ route, path, children }: PageBoundaryProps) => (
  <ErrorBoundary
    name={route === "/" ? "home" : route}
    level="page"
    resetKey={path ?? route}
    onReset={() => markCrashRecovered("page")}
    fallback={({ reset }) => (
      <CrashPanel
        variant="screen"
        zIndex={Z_PAGE_FALLBACK}
        testId="page-fallback"
        body={FALLBACK_COPY.page}
        actions={[
          { label: FALLBACK_COPY.tryAgain, primary: true, testId: "page-fallback-retry", onClick: reset },
          { label: FALLBACK_COPY.reload, testId: "page-fallback-reload", onClick: () => reloadApp() },
        ]}
      />
    )}
  >
    <CrashProbe target="page" />
    {children}
  </ErrorBoundary>
);

export default PageBoundary;
