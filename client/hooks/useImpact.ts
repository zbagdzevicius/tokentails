import {
  baselineImpact,
  IMPACT_TIMEOUT_MS,
  ImpactResult,
  ImpactSource,
  loadImpact,
  LoadImpactOptions,
  PublicImpact,
} from "@/api/impact-api";
import { isAppBuild } from "@/components/claims/build";
import BASELINE from "@/public/impact/snapshot.json";
import { useEffect, useRef, useState } from "react";

export interface UseImpactOptions {
  /** Data a page already has (getStaticProps). Rendered at once, so server and client HTML match. */
  initial?: ImpactResult | null;
  /**
   * Fetch on mount. Default: when there is no `initial`, and always in app builds, whose baked
   * snapshot is as old as the build.
   */
  refetch?: boolean;
  /** Test seam. Read through a ref: an inline function does not re-run the fetch. */
  load?: (options: LoadImpactOptions) => Promise<ImpactResult | null>;
}

export interface UseImpactState {
  impact: PublicImpact | null;
  source: ImpactSource | null;
  loading: boolean;
}

export { baselineImpact };

/**
 * The public impact snapshot for client surfaces (plan G11): CDN impact.json, then GET /impact,
 * then the bundled baseline (public/impact/snapshot.json). Each source gets a 3 s abort and no
 * retry on 429. Unmounting aborts the request.
 */
export function useImpact(options: UseImpactOptions = {}): UseImpactState {
  const { initial = null, load = loadImpact } = options;
  const refetch = options.refetch ?? (!initial || isAppBuild());
  const [state, setState] = useState<UseImpactState>(() => ({
    impact: initial?.impact ?? null,
    source: initial?.source ?? null,
    loading: refetch,
  }));

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!refetch) return;
    const controller = new AbortController();
    loadRef.current({
      signal: controller.signal,
      timeoutMs: IMPACT_TIMEOUT_MS,
      baseline: BASELINE,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          // Never replace live data with the older baseline the page already rendered from.
          impact:
            result &&
            !(
              result.source === "baseline" &&
              prev.impact &&
              prev.source !== "baseline"
            )
              ? result.impact
              : prev.impact,
          source:
            result &&
            !(
              result.source === "baseline" &&
              prev.impact &&
              prev.source !== "baseline"
            )
              ? result.source
              : prev.source,
          loading: false,
        }));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      });
    return () => controller.abort();
  }, [refetch]);

  return state;
}

export default useImpact;
