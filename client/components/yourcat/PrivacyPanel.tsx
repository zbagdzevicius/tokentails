import { CAPTION, H2, PANEL } from "./brand";
import { PRIVACY } from "./copy";

/**
 * S1-P "How we handle your photo": an inline expandable panel in the landing `PANEL` (also in
 * docs/YOURCAT.md §Privacy). No stage and no prices.
 */
export function PrivacyPanel({ open, id }: { open: boolean; id: string }) {
  if (!open) return null;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`${PANEL} mt-3 text-left`} data-testid="yourcat-privacy">
      <h2 id={`${id}-title`} className={H2}>
        {PRIVACY.title}
      </h2>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 marker:text-tt-gold-400">
        {PRIVACY.paragraphs.map((paragraph) => (
          <li key={paragraph} className={CAPTION}>
            {paragraph}
          </li>
        ))}
      </ul>
    </section>
  );
}
