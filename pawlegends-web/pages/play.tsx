import { PawlegendsPlayPage } from "@/components/pawlegends/PawlegendsPlayPage";

/** `/play` meta lives with the page body (components/pawlegends/PawlegendsPlayPage.tsx). */
export { PAWLEGENDS_SEO } from "@/components/pawlegends/PawlegendsPlayPage";

/** `/play` (POC.md §11.4): the live game build, `/pawlegends-game/`. */
export default function PawlegendsPage() {
  return <PawlegendsPlayPage />;
}
