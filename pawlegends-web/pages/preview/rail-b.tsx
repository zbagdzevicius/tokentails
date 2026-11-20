import { PawlegendsPlayPage } from "@/components/pawlegends/PawlegendsPlayPage";

/**
 * Hidden founder preview (Nov 20): `/play` with the Home friends rail from `feat/friends-rail-b`, built into
 * `public/preview-rail-b/` (pawlegends: `PAWLEGENDS_BASE=/preview-rail-b/`). On pawlegends.app so the existing
 * sign-in and the API's CORS work. noindex, nofollow, linked from nowhere; removed once the founder picks a rail.
 */
export default function PreviewRailBPage() {
  return <PawlegendsPlayPage gameBase="/preview-rail-b/" preview="Preview B — Collar Tags" />;
}
