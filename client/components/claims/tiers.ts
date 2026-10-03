import type { PixelIconName } from "@/components/shared/PixelIcon";
import type { FactStatus } from "@/lib/facts.generated";

/** Money evidence tiers (plan F7.2). Money figures carry one; facts carry a status instead. */
export const MONEY_TIERS = [
  "onchain-shelter-held",
  "onchain-custodial",
  "shelter-signed",
  "shelter-confirmed",
  "pledged",
  "shelter-reported",
  "in-game",
] as const;
export type MoneyTier = (typeof MONEY_TIERS)[number];

/** The extra chip a fact can carry next to its status. */
export type ChipKind = MoneyTier | FactStatus | "stale";

/**
 * Chip tones. Each pairs a text colour with a tinted fill and a border on the night panel; every
 * text colour is at least 4.5:1 on night-800 and night-900 (checked in claim-labels.test.tsx).
 * Colour is never the only signal: every chip also has its words and an icon.
 */
export const TONES = {
  green: {
    text: "#7fd66b",
    className: "text-tt-mint border-tt-mint/60 bg-tt-mint/10",
  },
  amber: {
    text: "#ffcc55",
    className: "text-tt-gold-400 border-tt-gold-400/60 bg-tt-gold-400/10",
  },
  grey: {
    text: "#9a88c9",
    className: "text-tt-muted border-tt-muted/60 bg-tt-muted/10",
  },
  blue: {
    text: "#90c5e9",
    className: "text-tt-sky border-tt-sky/60 bg-tt-sky/10",
  },
  rust: {
    text: "#ee642a",
    className: "text-tt-rust border-tt-rust/60 bg-tt-rust/10",
  },
} as const;
export type Tone = keyof typeof TONES;

export const CHIP_STYLE: Record<ChipKind, { tone: Tone; icon: PixelIconName }> =
  {
    "onchain-shelter-held": { tone: "green", icon: "key" },
    "onchain-custodial": { tone: "amber", icon: "lock" },
    "shelter-signed": { tone: "green", icon: "check" },
    "shelter-confirmed": { tone: "amber", icon: "check" },
    pledged: { tone: "grey", icon: "bookmark" },
    "shelter-reported": { tone: "grey", icon: "mail" },
    "in-game": { tone: "blue", icon: "heart" },
    verified: { tone: "green", icon: "check" },
    "company-reported": { tone: "grey", icon: "user" },
    "sei-era": { tone: "grey", icon: "bookmark" },
    live: { tone: "blue", icon: "eye" },
    stale: { tone: "rust", icon: "eye-off" },
  };

/** One label set: what each chip says and what the drawer explains. */
export interface LabelSet {
  chip: Record<ChipKind, string>;
  explain: Record<ChipKind, string>;
}
