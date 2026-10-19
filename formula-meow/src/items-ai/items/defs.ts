/** Registered items. v1 core ships Catnip only; the items-ai lane registers Hairball … Laser Dot here. */
import { catnip, registerItem } from './registry';

let done = false;
export function registerDefaultItems(): void {
  if (done) return;
  done = true;
  registerItem(catnip);
}
