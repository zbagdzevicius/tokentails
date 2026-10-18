/**
 * Which shelter cats can be bought one by one, as pure predicates (no React): the client mirror of
 * `ShelterCatSaleService.check` on the server. `ShelterCatBuy` re-exports them; the `/pawlegends` host uses them
 * to pick its featured cats.
 */
import { BlessingStatus, type ICat } from "@/models/cats";

const NOT_FOR_SALE: readonly string[] = [BlessingStatus.ADOPTED, BlessingStatus.HEAVEN];

/** An unowned rescue cat with a blessing that is not ADOPTED or HEAVEN, and not a starter. */
export function isCatForSale(
  cat: Pick<ICat, "_id" | "owner" | "blessing" | "isStarter" | "isGuestStarter"> | null | undefined
): boolean {
  if (!cat?._id || !/^[0-9a-f]{24}$/i.test(cat._id) || cat.owner || !cat.blessing) return false;
  if (cat.isStarter || cat.isGuestStarter) return false;
  return !NOT_FOR_SALE.includes(String(cat.blessing.status || ""));
}

const idOf = (value: unknown): string =>
  typeof value === "string"
    ? value
    : value && typeof value === "object"
    ? String((value as { _id?: unknown })._id ?? "")
    : "";

/** The player already holds a copy (same cat, or a copy of its blessing): the server would refuse. */
export function ownsCopy(owned: ICat[] | undefined, cat: Pick<ICat, "_id" | "blessing">): boolean {
  const blessing = idOf(cat.blessing);
  return (owned || []).some(
    (mine) =>
      (!!cat._id && (mine._id === cat._id || idOf((mine as ICat & { sourceCat?: unknown }).sourceCat) === cat._id)) ||
      (!!blessing && idOf(mine.blessing) === blessing)
  );
}
