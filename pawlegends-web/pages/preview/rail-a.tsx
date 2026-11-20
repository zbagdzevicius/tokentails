import { PawlegendsPlayPage } from "@/components/pawlegends/PawlegendsPlayPage";

/**
 * Hidden founder preview (Nov 20): `/play` with the Home friends rail from `feat/friends-rail-a`, built into
 * `public/preview-rail-a/` (pawlegends: `PAWLEGENDS_BASE=/preview-rail-a/`). On pawlegends.app so the existing
 * sign-in and the API's CORS work. noindex, nofollow, linked from nowhere; removed once the founder picks a rail.
 */
export default function PreviewRailAPage() {
  return <PawlegendsPlayPage gameBase="/preview-rail-a/" preview="Preview A — Broadcast HUD" />;
}
