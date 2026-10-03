import React, { useState } from "react";
import { Socials } from "./Socials";
import { cdnFile } from "@/constants/utils";
import { PixelButton } from "@/components/shared/PixelButton";
import { AnalyticsSettingsLink } from "@/components/shared/AnalyticsConsentBanner";

interface FooterProps {
  title: string;
  link: string;
  isActive?: boolean;
  onSet?: () => void;
}

const navConsts: FooterProps[] = [
  {
    title: "BLOG",
    link: "/feed",
  },
  {
    title: "CATS",
    link: "/cats",
  },
  {
    title: "IMPACT",
    link: "/impact",
  },
  {
    title: "PAYOUTS",
    link: "/shelter-payouts",
  },
];

/** The night pages' gold pill (components/shelter-payouts/ui.tsx PILL, without its import). */
const NIGHT_PILL =
  "flex min-h-11 w-full items-center justify-center rounded-full border border-tt-gold-400/60 bg-tt-night-900/70 px-4 py-2 font-primary text-p5 md:text-p4 uppercase tracking-wide text-tt-gold-400 transition hover:bg-tt-night-900/90 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-gold-400 sm:w-auto";

const LEGAL = [
  {
    title: "T&C",
    link: "https://docs.tokentails.com/community-and-social-impact/terms-and-conditions",
  },
  {
    title: "Privacy Policy",
    link: "https://docs.tokentails.com/community-and-social-impact/privacy-policy",
  },
];

/**
 * `tone="night"`: the same footer (logo, socials, links, legal) on the night palette, for the
 * night pages (the shelter payout pages) so the page does not end on a cream band. The default
 * cream footer is unchanged.
 */
export const Footer: React.FC<{ tone?: "cream" | "night" }> = ({ tone = "cream" }) => {
  const [activeTitle, setActiveTitle] = useState<string | null>(null);

  const handleTitleClick = (title: string) => {
    setActiveTitle(title === activeTitle ? null : title);
  };

  if (tone === "night") {
    // Sits on the page's own night background (no flat band, no second row of socials: the header
    // and the landing hero already carry them). Links use the pages' gold pill, as "SEE ALL IMPACT".
    return (
      <footer
        className="relative z-10 bg-gradient-to-b from-transparent to-tt-night-950/80 px-4 pb-8 pt-2 text-tt-cream md:px-8 lg:px-16"
        data-testid="site-footer"
        data-tone="night"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-8 h-px max-w-[1400px] bg-gradient-to-r from-transparent via-tt-gold-400/60 to-transparent"
        />
        <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-6 lg:flex-row lg:justify-between">
          {/* Plain anchor on purpose, as in Header: a full page load tears down Phaser on the pages that render it. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" aria-label="Token Tails home" className="shrink-0">
            <img
              draggable={false}
              className="h-16 w-auto object-contain md:h-20"
              src={cdnFile("logo/logo.webp")}
              alt="Token Tails"
            />
          </a>
          <nav aria-label="Footer" className="w-full max-w-sm sm:w-auto sm:max-w-none">
            <ul className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-center">
              {navConsts.map((navItem) => (
                <li key={navItem.title}>
                  <a href={navItem.link} className={NIGHT_PILL}>
                    {navItem.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-col items-center gap-2 text-center font-primary text-p5 text-tt-cream/80 lg:items-end lg:text-right">
            <span>© 2026 All Rights Reserved by Token Tails</span>
            <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 whitespace-nowrap">
              {LEGAL.map((l) => (
                <a
                  key={l.title}
                  href={l.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap text-tt-gold-400 underline decoration-dotted underline-offset-4 hover:text-tt-cream"
                >
                  {l.title}
                </a>
              ))}
              <AnalyticsSettingsLink className="whitespace-nowrap text-tt-gold-400 underline decoration-dotted underline-offset-4 hover:text-tt-cream" />
            </span>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <div className="z-10">
      <div className="flex justify-center items-center">
        <hr className="h-px w-full bg-gray-200 border-0" />
      </div>
      <footer className="text-center py-4 bg-tt-cream [[data-sky]_&]:text-tt-gold-ink">
        <div className="flex flex-wrap items-center container md:justify-around justify-between lg:px-24">
          <div className="flex items-center gap-4">
            <img
              draggable={false}
              className="h-24 flex-1 object-contain object-left"
              src={cdnFile("logo/logo.webp")}
              alt="logo"
            />

            <Socials />
          </div>
          <ul className="flex flex-1 justify-center font-secondary font-bold">
            <ul className="hidden lg:flex">
              {navConsts.map((navItem, index) => (
                <li key={index} className="max-lg:border-b max-lg:rounded">
                  <a
                    href={navItem.link}
                    onClick={() => handleTitleClick(navItem.title)}
                  >
                    <PixelButton as="span" text={navItem.title} size="sm" />
                  </a>
                </li>
              ))}
            </ul>
          </ul>
          <div className="flex-1 font-primary text-end whitespace-nowrap flex w-fit gap-2">
            © 2026 All Rights Reserved by Token Tails
            <a
              href="https://docs.tokentails.com/community-and-social-impact/terms-and-conditions"
              target="_blank"
              className="text-blue-700"
            >
              T&C
            </a>{" "}
            <a
              href="https://docs.tokentails.com/community-and-social-impact/privacy-policy"
              target="_blank"
              className="text-blue-700"
            >
              Privacy Policy
            </a>
            <AnalyticsSettingsLink />
          </div>
        </div>
      </footer>
    </div>
  );
};
