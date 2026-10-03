import { APP_LABELS } from "./labels.app";
import { WEB_LABELS } from "./labels.web";
import type { LabelSet } from "./tiers";

/** The one place the label set is picked from the build target (plan F7.2, F11 app rules). */
export function labelSet(isApp: boolean): LabelSet {
  return isApp ? APP_LABELS : WEB_LABELS;
}

export { APP_LABELS, WEB_LABELS };
