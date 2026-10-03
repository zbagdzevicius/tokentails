import { cdnFile } from "@/constants/utils";
import type { ReactNode } from "react";

// The landing's visual language for the payout pages (pages/index.tsx, ProofSection): night
// background, the pixel star art with fades, cream-framed glass panels, glowing gold figures.

/** Landing block: cream frame on dark glass. */
export const PANEL =
  "w-full rounded-2xl border-4 border-tt-cream/70 bg-black/35 p-4 md:p-6 lg:p-8 text-tt-cream backdrop-blur-[2px]";

/** Landing stat card (the reach cards): brighter frame, night fill. */
export const CARD =
  "rounded-2xl border-4 border-tt-cream/80 bg-tt-night-900/75 p-4 md:p-5 text-tt-cream";

/** Section headline, as on the landing blocks. */
export const HEADLINE =
  "mt-2 font-primary text-h6 md:text-h4 lg:text-h3 font-bold uppercase leading-none text-white drop-shadow-lg text-balance";

/** The glowing gold figure of the landing stats. */
export const FIGURE =
  "font-primary leading-none text-tt-gold-400 [text-shadow:0_0_5px_#ffe89a,0_0_12px_#ffcf66]";

/** Night pill with gold text (the landing's Heist pill). */
export const PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-tt-gold-400/50 bg-tt-night-900/70 px-4 py-2 font-primary text-p5 md:text-p4 uppercase tracking-wide text-tt-gold-400 shadow-[0_0_18px_rgb(var(--tt-gold-400)/.25)] backdrop-blur-sm transition hover:bg-tt-night-900/90 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-gold-400";

/** Solid gold CTA (the landing's closing "Meet your cat" button). */
export const GOLD_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-4 border-tt-gold-shadow bg-tt-gold-400 px-5 py-2 font-primary text-p4 md:text-p3 uppercase tracking-wide text-tt-gold-ink shadow-[0_0_24px_rgb(var(--tt-gold-400)/.45),0_4px_0_rgb(var(--tt-night-950))] transition hover:brightness-105 motion-safe:hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-cream disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100";

/** Small cream chip for labels (memos, chains, states). */
export const CHIP =
  "inline-flex items-center gap-1 rounded-lg border-2 border-tt-cream/60 bg-tt-cream/10 px-2 py-0.5 font-primary text-p6 md:text-p5 uppercase tracking-wide text-tt-cream";

/** Memo label: body font, as typed on-chain. */
export const MEMO =
  "inline-flex items-center rounded-lg border-2 border-tt-cream/50 bg-tt-cream/10 px-2 py-0.5 text-p6 md:text-p5 text-tt-cream break-all";

/** Same markup as the landing's Kicker (the Rescue Mission Hub badge). */
export const Kicker = ({ children }: { children: ReactNode }) => (
  <div className="inline-flex items-center gap-2 rounded-xl border-2 border-tt-cream bg-tt-cream/20 px-3 py-1 font-primary text-p6 md:text-p5 uppercase tracking-wide text-tt-cream">
    <img src={cdnFile("icons/check.webp")} alt="" className="h-4 w-4 object-contain" />
    {children}
  </div>
);

/** The Pink Paw pixel cat (the landing's shelter art). Decorative. */
export const PinkCat = ({ className = "", lick = false }: { className?: string; lick?: boolean }) => (
  <img
    src={cdnFile(lick ? "cats/pinkie/pink-lamiendo-ropa.gif" : "cats/pinkie/pink-respirando-ropa.gif")}
    alt=""
    aria-hidden="true"
    draggable={false}
    className={`pixelated select-none ${className}`}
  />
);

/**
 * The page shell: night background with the landing's pixel star art and matching fades, so
 * every payout page sits in the same world as the landing.
 */
export const NightStage = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`relative w-full overflow-hidden bg-tt-night-900 ${className}`}>
    <img
      src={cdnFile("landing/card-bg.webp")}
      alt=""
      aria-hidden="true"
      className="pixelated pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/55" />
    <div className="pointer-events-none absolute inset-x-0 top-0 h-32 md:h-48 bg-gradient-to-b from-tt-night-900 to-transparent" />
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 md:h-48 bg-gradient-to-b from-transparent to-tt-night-900" />
    <div className="relative z-10">{children}</div>
  </div>
);
