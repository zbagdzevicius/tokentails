import { PRIVACY } from "./copy";
import { CAPTION } from "./ui";

/** S1-P "How we handle your photo": an inline expandable panel (also in docs/YOURCAT.md §Privacy). */
export function PrivacyPanel({ open, id }: { open: boolean; id: string }) {
  if (!open) return null;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-3 rounded-xl border-2 border-tt-cream/40 bg-tt-night-800/80 p-4 text-left">
      <h2 id={`${id}-title`} className="font-primary text-p4 md:text-p3 text-tt-gold-400">
        {PRIVACY.title}
      </h2>
      <ul className="mt-2 flex list-disc flex-col gap-2 pl-5">
        {PRIVACY.paragraphs.map((paragraph) => (
          <li key={paragraph} className={CAPTION}>
            {paragraph}
          </li>
        ))}
      </ul>
    </section>
  );
}
