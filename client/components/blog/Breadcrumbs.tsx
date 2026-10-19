import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

export interface BreadcrumbItem {
  name: string;
  path: string;
}

/** Breadcrumb trail (the BreadcrumbList JSON-LD carries the same items). The last item is the page itself. */
export const Breadcrumbs = ({ items, surface = "paper", style }: { items: BreadcrumbItem[]; surface?: "paper" | "night"; style?: CSSProperties }) => (
  <nav aria-label="Breadcrumb" style={style}>
    <ol className={clsx("flex flex-wrap items-center gap-x-1 gap-y-1 text-p5 font-bold md:text-[0.95rem]", surface === "night" ? "text-tt-cream/75" : "text-[rgb(var(--muted))]")}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <li key={item.path} className={clsx("inline-flex min-w-0 items-center gap-1", last && "hidden sm:inline-flex")}>
            {last ? (
              <span aria-current="page" className="max-w-[28ch] truncate">
                {item.name}
              </span>
            ) : (
              <Link
                href={item.path}
                className={clsx("rounded underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2", surface === "night" ? "hover:text-tt-cream focus-visible:outline-tt-gold-400" : "hover:text-[rgb(var(--ink))]")}
              >
                {item.name}
              </Link>
            )}
            {!last && <ChevronRight aria-hidden="true" className={clsx("h-4 w-4 shrink-0 opacity-60", i === items.length - 2 && "hidden sm:block")} />}
          </li>
        );
      })}
    </ol>
  </nav>
);
