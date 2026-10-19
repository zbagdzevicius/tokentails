// copy-lint: web-only the hub renders the trust band only when !isApp (it names the payout ledger and contracts)
import clsx from "clsx";
import { ArrowRight, CalendarCheck, FileCode2, Receipt } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import s from "./feed.module.scss";

const POINTS: { icon: ReactNode; title: string; body: string; href: string; label: string }[] = [
  {
    icon: <Receipt aria-hidden="true" className="h-6 w-6" />,
    title: "Every payout is public",
    body: "Each ShelterSplit payout for Pink Paw is listed with a link to its transaction, so nobody has to take our word for it.",
    href: "/shelter-payouts",
    label: "Open the payout ledger",
  },
  {
    icon: <CalendarCheck aria-hidden="true" className="h-6 w-6" />,
    title: "Dated, sourced figures",
    body: "Articles link to live pages instead of printing numbers that age. Figures we report ourselves are marked company-reported.",
    href: "/impact",
    label: "See the impact page",
  },
  {
    icon: <FileCode2 aria-hidden="true" className="h-6 w-6" />,
    title: "Open-source contracts",
    body: "The contracts that split each payout are MIT-licensed and public: read them, test them, or use them for your own shelter.",
    href: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split",
    label: "Read the code",
  },
];

/** Why the blog can be trusted: three standing proofs, each with its link. Web builds only. */
export const TrustBand = () => (
  <section aria-labelledby="why-trust" className={clsx(s.night, "overflow-hidden py-16 md:py-24")} data-testid="trust-band">
    <div className={s.stars} aria-hidden="true" />
    <div className="mx-auto max-w-[80rem] px-4 md:px-8">
      <h2 id="why-trust" className="max-w-[24ch] font-primary text-[2.2rem] uppercase leading-none text-white md:text-[3rem]">
        Why you can check what you read here
      </h2>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {POINTS.map((p, i) => {
          const external = p.href.startsWith("http");
          return (
            <div key={p.title} className={clsx(s.reveal, "flex flex-col gap-3 rounded-[1.25rem] bg-tt-night-700/70 p-6 ring-1 ring-tt-cream/15")} style={{ "--i": i } as CSSProperties}>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-tt-gold-400 text-tt-gold-ink">{p.icon}</span>
              <h3 className="text-[1.3rem] font-extrabold text-white">{p.title}</h3>
              <p className="text-[1rem] leading-relaxed text-tt-cream/85">{p.body}</p>
              <a
                href={p.href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="mt-auto inline-flex min-h-11 items-center gap-2 self-start font-sans text-[1rem] font-extrabold text-tt-gold-400 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400"
              >
                {p.label}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
                {external && <span className="sr-only"> (opens in a new tab)</span>}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);
