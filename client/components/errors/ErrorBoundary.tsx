import { reportAppError } from "@/analytics";
import type { AppErrorLevel } from "@/analytics/events";
import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * The one error-boundary class every F9 boundary is built on. It reports a
 * scrubbed `app_error` (code `<level>_crash:<name>`) and renders `fallback`
 * until `reset()` runs or `resetKey` changes.
 */

export interface FallbackArgs {
  error: unknown;
  reset: () => void;
}

export interface ErrorBoundaryProps {
  /** Stable, non-personal name, e.g. `match_3`, `profile_modal`. */
  name: string;
  level: Exclude<AppErrorLevel, "none">;
  fallback: (args: FallbackArgs) => ReactNode;
  /** Any change clears the error, e.g. the route or the game type. */
  resetKey?: unknown;
  onReset?: () => void;
  children?: ReactNode;
}

interface ErrorBoundaryState {
  error: unknown;
  hasError: boolean;
}

/** `boundary-name` → `boundary_name`, safe for the telemetry code. */
export function boundaryCode(level: string, name: string): string {
  const slug = String(name || "unnamed")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `${level}_crash:${slug || "unnamed"}`;
}

/** The component that threw, from React's component stack. */
function throwingComponent(info?: ErrorInfo): string | null {
  const match = info?.componentStack?.match(/^\s*(?:at\s+)?([A-Z][\w$]*)/m);
  return match ? match[1] : null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Errors raised to show a fallback for something the crash guard has
    // already reported (a stall) are not counted twice.
    if ((error as { alreadyReported?: boolean } | null)?.alreadyReported) return;
    const { level, name } = this.props;
    reportAppError(boundaryCode(level, name), error, {
      source: "boundary",
      level,
      boundary: name,
      component: throwingComponent(info),
    });
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.hasError && !Object.is(prev.resetKey, this.props.resetKey)) {
      this.reset();
    }
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null, hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }
    return this.props.children ?? null;
  }
}
