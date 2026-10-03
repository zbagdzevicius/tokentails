import type { ReactNode } from "react";
import { CrashProbe } from "./crash-probe";
import { ErrorBoundary } from "./ErrorBoundary";

interface SectionBoundaryProps {
  /** Stable section name for telemetry, e.g. `proof`, `team`. */
  name: string;
  children?: ReactNode;
  /** Rendered instead of the section after a crash. Default: nothing. */
  fallback?: ReactNode;
}

/**
 * Silent boundary for landing sections (F9): a broken section reports and
 * disappears, and the rest of the page keeps working. It never shows an
 * error panel to a visitor.
 */
export const SectionBoundary = ({ name, children, fallback = null }: SectionBoundaryProps) => (
  <ErrorBoundary name={name} level="section" fallback={() => fallback}>
    <CrashProbe target="section" />
    {children}
  </ErrorBoundary>
);

export default SectionBoundary;
