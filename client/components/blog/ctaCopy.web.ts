// copy-lint: web-only blog cards for payments, coins and the payout ledger; ctaFor() never returns them in app builds
import { PackType, packPrices } from "@/models/order";
import type { CtaDef } from "./ctaCopy";

// No sale prices here: articles are static pages, and a dated sale line would outlive the sale.
// /packs shows the live price (models/order.ts packPriceUsd).
const packsBody = `Starter, Influencer and Legendary packs of digital pixel cats for the games, from $${packPrices[PackType.STARTER]}.`;

export const WEB_CTAS: Record<string, CtaDef> = {
  rave: {
    key: "rave",
    href: "/rave",
    // A static build served by a rewrite: not a Next page.
    hardLink: true,
    eyebrow: "$1 = 1 cat",
    title: "Join the Moon Rave",
    body: "Add a cat to the dance floor for $1, by card or in USDC on Arc. By card, Token Tails pays the full $1 out to Pink Paw on-chain; in USDC, the full $1 goes from your wallet straight to the Pink Paw split.",
    button: "Join the rave",
    art: { src: "/game-select/rave-preview@2x.webp", width: 624, height: 436, alt: "Pixel cats dancing under a full moon at the Moon Rave" },
    webOnly: true,
  },
  badcat: {
    key: "badcat",
    href: "/badcat",
    hardLink: true,
    eyebrow: "New every day",
    title: "Play Bad Cat Daily",
    body: "Cats are chaos. Snap your own cat and wreck today's room.",
    button: "Play Bad Cat Daily",
    art: { src: "/game-select/badcat-preview@2x.webp", width: 624, height: 436, alt: "A cat knocks things off a shelf in Bad Cat Daily" },
    webOnly: true,
  },
  give: {
    key: "give",
    href: "/shelter-payouts/give",
    eyebrow: "Free · one tap",
    title: "Send Pink Paw a free treat",
    // The treat's size lives on /shelter-payouts/give (C-004), never printed here.
    body: "Tap and Token Tails sends Pink Paw a small stablecoin treat, split on-chain by ShelterSplit. It costs you nothing.",
    button: "Send a free treat",
    art: { src: "/logo/shelter.webp", width: 800, height: 735, alt: "Pixel art of a cosy cat shelter" },
    webOnly: true,
  },
  payouts: {
    key: "payouts",
    href: "/shelter-payouts",
    eyebrow: "Check it yourself",
    title: "See every payout",
    body: "Every ShelterSplit payout for Pink Paw is listed with a link to its transaction on a public block explorer.",
    button: "Open the payout ledger",
    art: { src: "/logo/shelter.webp", width: 800, height: 735, alt: "Pixel art of a cosy cat shelter" },
    webOnly: true,
  },
  packs: {
    key: "packs",
    href: "/packs",
    eyebrow: "Digital pixel cats",
    title: "Get a cat pack",
    body: packsBody,
    button: "See the packs",
    art: { src: "/cards/packs/packs-bg.webp", width: 1703, height: 594, alt: "Starter, Influencer and Legendary cat packs" },
    webOnly: true,
  },
};
