/**
 * Pre-renders every share card variant before any tap can need it (docs/plans/yourcat-v2.md §5.3,
 * polish §9): story and post, each with and without the Pink Paw panel (two variants when no shelter
 * cat qualifies). All of them are rendered again when the pixel portrait arrives or the text changes;
 * switching format or shelter only swaps to a file that already exists.
 *
 * The strings come from `textFor(withShelter)` (copy.ts `cardText`), so the card never builds copy.
 * `useCardPreload(sent)` warms the same-origin card art once the upload body has left (S2).
 */
import { reportAppError } from "@/analytics";
import { useEffect, useRef, useState } from "react";
import type { CardFormat, CardText } from "./cardLayout";
import type { PinkPawCandidate } from "./pinkPawPick";
import { cardFileName, preloadCardImages, renderShareCard } from "./shareCard";

export type VariantKey = `${CardFormat}-${"panel" | "plain"}`;

export interface CardVariant {
  file: File;
  url: string;
  /** The name this card was drawn with ("" for none): the share text uses the same one. */
  name: string;
}

export interface ShareCardsInput {
  recordId: string;
  /** The card name ("" while the cat has no name). Names the file and the variant. */
  name: string;
  familyLabel: string;
  avatarUrl: string | null;
  spriteImg: string;
  shelter: PinkPawCandidate | null;
  /** Rendered first, so the visible variant is ready soonest. */
  preferred: VariantKey;
  /** The card strings, with the shelter panel or solo. */
  textFor(withShelter: boolean): CardText;
}

export const variantKey = (format: CardFormat, panel: boolean): VariantKey => `${format}-${panel ? "panel" : "plain"}`;

export function variantOrder(preferred: VariantKey, withShelter: boolean): VariantKey[] {
  const all: VariantKey[] = withShelter ? ["story-panel", "post-panel", "story-plain", "post-plain"] : ["story-plain", "post-plain"];
  return [preferred, ...all.filter((key) => key !== preferred)].filter((key) => all.includes(key));
}

/** Starts loading the card art once, the first time `sent` is true (polish §9.3). */
export function useCardPreload(sent: boolean): void {
  const done = useRef(false);
  useEffect(() => {
    if (!sent || done.current) return;
    done.current = true;
    preloadCardImages();
  }, [sent]);
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
  // `textFor` is usually a new function each render: the strings themselves are the dependency.
  const solo = input ? input.textFor(false) : null;
  const withPanel = input && shelterName ? input.textFor(true) : null;
  const textKey = JSON.stringify([solo, withPanel]);

  useEffect(() => {
    if (!recordId) return;
    let cancelled = false;
    const [soloText, panelText] = JSON.parse(textKey) as [CardText | null, CardText | null];
    if (!soloText) return;
    const panelOk = !!shelterName && !!panelText?.panel;
    // A new generation: the old files show the old name or portrait, so none of them is shareable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVariants({});
    setFailed(false);
    const created: string[] = [];
    void (async () => {
      for (const key of variantOrder(preferredRef.current, panelOk)) {
        if (cancelled) return;
        const [format, panel] = key.split("-") as [CardFormat, "panel" | "plain"];
        try {
          const blob = await renderShareCard({
            format,
            text: panel === "panel" && panelText ? panelText : soloText,
            soloText,
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
  }, [recordId, name, familyLabel, avatarUrl, spriteImg, shelterName, shelterImage, textKey]);

  useEffect(
    () => () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    },
    [],
  );

  return { variants, failed };
}
