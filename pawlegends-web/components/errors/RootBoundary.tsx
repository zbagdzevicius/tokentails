import { LAYERS } from "@/design/tokens";
import type { ReactNode } from "react";
import { CrashPanel } from "./CrashPanel";
import { FALLBACK_COPY } from "./copy";
import { CrashProbe, markCrashRecovered } from "./crash-probe";
import { ErrorBoundary } from "./ErrorBoundary";
import { reloadApp } from "./reload";

/** The F3 `system` layer: above every modal, toast and reveal. */
export const Z_SYSTEM = LAYERS.system;

/**
 * The outermost boundary (F9). It sits outside every provider, so its
 * fallback uses no context and only inline styles: when a provider throws,
 * the player still gets a way out instead of a blank page.
 */
export const RootBoundary = ({ children }: { children?: ReactNode }) => (
  <ErrorBoundary
    name="app"
    level="root"
    onReset={() => markCrashRecovered("root")}
    fallback={({ reset }) => (
      <CrashPanel
        variant="screen"
        zIndex={Z_SYSTEM}
        testId="root-fallback"
        body={FALLBACK_COPY.root}
        actions={[
          { label: FALLBACK_COPY.reload, primary: true, testId: "root-fallback-reload", onClick: () => reloadApp() },
          { label: FALLBACK_COPY.tryAgain, testId: "root-fallback-retry", onClick: reset },
        ]}
      />
    )}
  >
    <CrashProbe target="root" />
    {children}
  </ErrorBoundary>
);

export default RootBoundary;
