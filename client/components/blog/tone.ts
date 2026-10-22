// Category accents for the blog (Tailwind scans components/, so the classes live here, not in lib/).

/** Accent per category: a tinted chip with dark ink (WCAG AA on the paper and on the tint). */
export const CATEGORY_TONE: Record<string, { chip: string; dot: string; ring: string }> = {
  games: { chip: "bg-tt-pink/20 text-[#8a1640]", dot: "bg-tt-pink", ring: "ring-tt-pink/50" },
  giving: { chip: "bg-tt-mint/25 text-[#245a19]", dot: "bg-tt-mint", ring: "ring-tt-mint/60" },
  cats: { chip: "bg-tt-gold-400/30 text-[#6b3f00]", dot: "bg-tt-gold-400", ring: "ring-tt-gold-400/60" },
  build: { chip: "bg-tt-sky/30 text-[#174b70]", dot: "bg-tt-sky", ring: "ring-tt-sky/60" },
  news: { chip: "bg-tt-lilac/40 text-[#5e2380]", dot: "bg-tt-lilac", ring: "ring-tt-lilac/70" },
};

export const toneFor = (slug: string) => CATEGORY_TONE[slug] ?? CATEGORY_TONE.news;
