import { isApp } from "@/models/app";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ctaFor, type CtaDef } from "./ctaCopy";
import s from "./feed.module.scss";

const CtaLink = ({ def, className, children }: { def: CtaDef; className: string; children: ReactNode }) =>
  def.hardLink ? (
    <a href={def.href} className={className} data-cta={def.key}>
      {children}
    </a>
  ) : (
    <Link href={def.href} className={className} data-cta={def.key}>
      {children}
    </Link>
  );

/**
 * A conversion card (`<!-- cta:x -->` in the body, and the closing block of every article): game art,
 * one clear sentence, one button to the real destination. On hover a pixel paw peeks over the top
 * edge (motion-safe only; with reduced motion it simply sits there). Nothing renders when the card is
 * web only and this is an app build.
 */
export const CtaCard = ({ cta, variant = "inline", appBuild = isApp }: { cta: string; variant?: "inline" | "end"; appBuild?: boolean }) => {
  const def = ctaFor(cta, appBuild);
  if (!def) return null;
  const end = variant === "end";
  return (
    <aside
      aria-label={def.title}
      className={clsx(s.cta, end ? "my-0" : "my-10 max-w-[46rem] md:my-12")}
      data-testid={`feed-cta-${def.key}`}
    >
      <img src="/logo/paw.webp" alt="" aria-hidden="true" width={160} height={162} className={s.paw} loading="lazy" decoding="async" />
      <div
        className={clsx(
          s.night,
          "relative z-0 grid overflow-hidden rounded-[1.5rem] shadow-[0_18px_40px_-24px_rgb(var(--tt-night-950)/.9)] ring-1 ring-tt-gold-400/30",
          end ? "md:grid-cols-[1.1fr_1fr]" : "sm:grid-cols-[minmax(0,15rem)_1fr]"
        )}
      >
        <div className={clsx("relative overflow-hidden bg-tt-night-800", end ? "aspect-[16/9] md:aspect-auto md:min-h-[18rem]" : "aspect-[16/9] sm:aspect-auto sm:min-h-[11rem]")}>
          <Image
            src={def.art.src}
            alt={def.art.alt}
            fill
            sizes={end ? "(min-width: 768px) 560px, 100vw" : "(min-width: 640px) 240px, 100vw"}
            className={clsx(s.ctaArt, "object-cover")}
          />
        </div>
        <div className={clsx("flex flex-col justify-center gap-3", end ? "p-6 md:p-10" : "p-5 md:p-6")}>
          <p className="font-sans text-p6 font-extrabold uppercase tracking-[0.12em] text-tt-gold-400 md:text-p5">{def.eyebrow}</p>
          <p className={clsx("font-primary uppercase leading-none text-white", end ? "text-[2rem] md:text-[2.75rem]" : "text-[1.6rem] md:text-[1.9rem]")}>{def.title}</p>
          <p className="max-w-[46ch] text-p5 leading-relaxed text-tt-cream/90 md:text-[1.05rem]">{def.body}</p>
          <CtaLink
            def={def}
            className={clsx(
              s.ctaButton,
              "mt-1 inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-xl border-4 border-tt-gold-shadow bg-tt-gold-400 px-5 font-primary text-p4 uppercase tracking-wide text-tt-gold-ink shadow-[0_0_24px_rgb(var(--tt-gold-400)/.35),0_4px_0_rgb(var(--tt-night-950))] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-cream"
            )}
          >
            {def.button}
            <ArrowRight aria-hidden="true" className="h-5 w-5" strokeWidth={3} />
          </CtaLink>
        </div>
      </div>
    </aside>
  );
};
