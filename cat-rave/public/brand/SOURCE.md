# Arc logo (official, unmodified)

| File | From | sha256 |
|---|---|---|
| `arc-logo-white.svg` | Circle Brand Kit, Arc logos zip: `Arc_Logos/Full Logo/SVG/Arc_Logo_White.svg` | `6ce8161c…4bf5bf4dda` |
| `arc-logo-white.png` | same zip: `Arc_Logos/Full Logo/PNG/Arc_Logo_White.png` (1000 x 342) | `b4769281…fa4a49e39` |

- Zip: https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/Brand/Arc/Arc_Logos.zip
  (linked as "Brand Kit" from https://www.circle.com/pressroom#brandkit and from the arc.network footer).
  Downloaded 2026-10-16. The zip also holds `Arc_Logo_Guidelines_08_2025.pdf` (v1.0, 08.12.25).
- Partner guidelines: https://www.arc.network/brand-guidelines-and-partner-toolkit
- Brand use policy: https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/CircleBrandUsePolicy.pdf

## Terms we follow (summary, not legal advice)

- Only for products actively building on Arc. Token Tails has ShelterSplit + DonateRouter deployed on Arc
  mainnet (chain 5042), so "Live on Arc" / "We are live on Arc" is the guidelines' own example wording.
- Never modify, recolor, distort, rotate, add effects to, or put text/graphics on top of the logo; never redraw
  or approximate it. The files here are byte-for-byte the brand-kit files. The page uses the white logo on a dark
  plate (no low-contrast backgrounds), keeps clear space around it (the inner-arch height, ~25% of the logo
  height) and shows it at least 50 px tall where it appears in the HUD.
- Token Tails / Moon Rave stays the primary brand; the Arc logo is never bigger than our own branding and does
  not imply endorsement or a formal partnership.
- Attribution: "Arc is a trademark of Circle Internet Group, Inc. and/or its affiliates." (shown in the badge's
  title/tooltip and the sponsors panel).
- Circle may review or revoke use at any time (respond within three business days): trademarks@circle.com.

# Token Tails logo (our own brand, unmodified copies)

| File | From | sha256 |
|---|---|---|
| `tokentails-logo.webp` | `client/public/logo/logo-text.webp` (600 x 337): the landing lockup, ringed cat + TOKEN TAILS wordmark, as in the site header | `779a921e765bf8fae25a1e4e11f7998a8e274ddd34d7407ee008e9a24eecc8ad` |
| `tokentails-cat.webp` | `client/public/logo/logo.webp` (240 x 280): the cat mark | `65460a32e570786a6666a8ac57ae9ef8838e29a0183b8864dd823271ac53b515` |

- Copied 2026-10-17. Used by `src/world/ttLogo.ts`: the lockup is the venue's hero sign behind the DJ booth, the cat
  mark sits on dark plates on the booth's side faces. Always shown (not tied to Arc week). If the site logo
  changes, copy the new files over these and keep the aspect constants in `src/world/ttLogoLayout.ts` in step.

# Pink Paw logo (the shelter's own logo, unmodified copy)

| File | From | sha256 |
|---|---|---|
| `pink-paw-logo.webp` | `client/public/logo/shelters/pink-paw.webp` (400 x 400, round, transparent corners; the same file `PINK_PAW_LOGO` serves from the CDN in `client/components/shelter-payouts/pinkPaw.ts`) | `665549dfffd2b2163b9fbfea3c7698c3d0aea307b62bf78e5728ad2ae7756832` |

- Copied 2026-10-17. Rožinė pėdutė (Pink Paw) is the cat shelter the rave raises money for. Used by
  `src/world/pinkPaw.ts` (a lit sign on stage left: the logo on its own white disc, a pink rim and glow, and the caption
  "ALL PROCEEDS → PINK PAW SHELTER") and `src/ui/pinkPawBadge.ts` (the line under the Add-a-cat title). Always shown.
  The logo is not recoloured or cropped.
