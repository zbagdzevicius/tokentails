/** The player's cats as the Cat Yard HOME gets them (shared/home-yard.ts). */
import type { ICat } from "@/models/cats";
import type { HomeYardCat } from "@/shared-contracts/home-yard";
import { MAX_CAT_STATUS } from "@/context/CatContext";

/** EAT under the maximum: the cat can be fed (and the Phaser HOME made it meow). */
export function isHungry(cat: Pick<ICat, "status"> | null | undefined): boolean {
  return (cat?.status?.EAT ?? 0) < MAX_CAT_STATUS;
}

export function toHomeYardCat(cat: ICat, activeId: string | undefined): HomeYardCat {
  return {
    id: cat._id!,
    name: cat.name,
    sheetUrl: cat.spriteImg,
    active: !!activeId && cat._id === activeId,
    hungry: isHungry(cat),
    tier: cat.tier,
    type: cat.type,
    blessed: !!cat.blessing,
    createdAt: cat.createdAt,
  };
}

/**
 * Owned cats from `/user/cats` (else the profile's list), with the active cat taken from the
 * profile: it carries the freshest status (a feed saves it there first) and is added if missing.
 */
export function homeYardCats(
  owned: readonly ICat[] | null | undefined,
  profileCats: readonly ICat[] | null | undefined,
  active: ICat | null | undefined,
): HomeYardCat[] {
  const list = (owned && owned.length ? owned : profileCats && profileCats.length ? profileCats : []).filter(
    (c): c is ICat => !!c && !!c._id,
  );
  const activeId = active?._id;
  const merged = activeId ? list.map((c) => (c._id === activeId ? active! : c)) : [...list];
  if (active && activeId && !merged.some((c) => c._id === activeId)) merged.unshift(active);
  return merged.map((c) => toHomeYardCat(c, activeId));
}

/** The ICat behind a yard id (for SELECT). */
export function findOwnedCat(
  id: string,
  ...lists: (readonly ICat[] | null | undefined)[]
): ICat | undefined {
  for (const list of lists) {
    const hit = list?.find((c) => c?._id === id);
    if (hit) return hit;
  }
  return undefined;
}
