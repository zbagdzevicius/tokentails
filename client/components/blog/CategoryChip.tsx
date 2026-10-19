import { feedCategory } from "@/lib/feed/view";
import clsx from "clsx";
import Link from "next/link";
import { toneFor } from "./tone";

/** The category label: a tinted pill, a link to the category when `link` is set. */
export const CategoryChip = ({
  slug,
  link = false,
  surface = "paper",
  className,
}: {
  slug: string;
  link?: boolean;
  /** `night`: cream text on the dark hero (the tinted chips are for the paper). */
  surface?: "paper" | "night";
  className?: string;
}) => {
  const cat = feedCategory(slug);
  if (!cat) return null;
  const tone = toneFor(slug);
  const cls = clsx(
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-p6 font-extrabold uppercase tracking-[0.08em]",
    surface === "night" ? "bg-tt-cream/15 text-tt-cream ring-1 ring-inset ring-tt-cream/25" : tone.chip,
    link && "transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
    className
  );
  const inner = (
    <>
      <span aria-hidden="true" className={clsx("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {cat.name}
    </>
  );
  return link ? (
    <Link href={`/feed/${cat.slug}`} className={cls}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
};
