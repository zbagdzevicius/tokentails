/**
 * Pre-renders every share card variant before any tap can need it (docs/plans/yourcat-v2.md §5.3):
 * story and post, each with and without the Pink Paw panel (two variants when no shelter cat
 * qualifies). All of them are rendered again when the pixel portrait arrives or the name changes;
 * switching format or shelter only swaps to a file that already exists.
 */
import { reportAppError } from "@/analytics";
import { useEffect, useRef, useState } from "react";
import type { CardFormat } from "./cardLayout";
import type { PinkPawCandidate } from "./pinkPawPick";
import { cardFileName, renderShareCard } from "./shareCard";

export type VariantKey = `${CardFormat}-${"panel" | "plain"}`;

export interface CardVariant {
  file: File;
  url: string;
  /** The name this card was drawn with ("" for none): the share text uses the same one. */
  name: string;
}

export interface ShareCardsInput {
  recordId: string;
  /** The card name ("" while the cat has no name). */
  name: string;
  familyLabel: string;
  avatarUrl: string | null;
  spriteImg: string;
  shelter: PinkPawCandidate | null;
  /** Rendered first, so the visible variant is ready soonest. */
  preferred: VariantKey;
}

export const variantKey = (format: CardFormat, panel: boolean): VariantKey => `${format}-${panel ? "panel" : "plain"}`;

export function variantOrder(preferred: VariantKey, withShelter: boolean): VariantKey[] {
  const all: VariantKey[] = withShelter ? ["story-panel", "post-panel", "story-plain", "post-plain"] : ["story-plain", "post-plain"];
  return [preferred, ...all.filter((key) => key !== preferred)].filter((key) => all.includes(key));
}

export function useShareCards(input: ShareCardsInput | null) {
  const [variants, setVariants] = useState<Partial<Record<VariantKey, CardVariant>>>({});
  const [failed, setFailed] = useState(false);
  const urlsRef = useRef<string[]>([]);
  const preferredRef = useRef<VariantKey>(input?.preferred ?? "story-plain");
  const preferred = input?.preferred;
  useEffect(() => {
    if (preferred) preferredRef.current = preferred;
  }, [preferred]);

  const recordId = input?.recordId;
  const name = input?.name ?? "";
  const familyLabel = input?.familyLabel ?? "";
  const avatarUrl = input?.avatarUrl ?? null;
  const spriteImg = input?.spriteImg ?? "";
  const shelterName = input?.shelter?.name;
  const shelterImage = input?.shelter?.image;

  useEffect(() => {
    if (!recordId) return;
    let cancelled = false;
    // A new generation: the old files show the old name or portrait, so none of them is shareable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVariants({});
    setFailed(false);
    const created: string[] = [];
    void (async () => {
      for (const key of variantOrder(preferredRef.current, !!shelterName)) {
        if (cancelled) return;
        const [format, panel] = key.split("-") as [CardFormat, "panel" | "plain"];
        try {
          const blob = await renderShareCard({
            format,
            name,
            familyLabel,
            hasShelterCat: panel === "panel",
            shelterName: panel === "panel" ? shelterName : undefined,
            shelterImage: panel === "panel" ? shelterImage : undefined,
            avatarUrl,
            spriteImg,
            seed: recordId,
          });
          if (cancelled) return;
          const file = new File([blob], cardFileName(name || `${familyLabel} cat`, format), { type: "image/png" });
          const url = URL.createObjectURL(file);
          created.push(url);
          urlsRef.current.push(url);
          setVariants((current) => ({ ...current, [key]: { file, url, name } }));
        } catch (error) {
          if (cancelled) return;
          setFailed(true);
          reportAppError("yourcat-card", error, { format });
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
      // The previews of this generation stay on screen until the next one lands, then go.
      const stale = created.slice();
      setTimeout(() => stale.forEach((url) => URL.revokeObjectURL(url)), 30_000);
    };
  }, [recordId, name, familyLabel, avatarUrl, spriteImg, shelterName, shelterImage]);

  useEffect(
    () => () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    },
    [],
  );

  return { variants, failed };
}
