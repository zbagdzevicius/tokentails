# Source text — Game3 Grants

Captured 2026-09-27 with web fetches (text as returned by the fetch tool; check against the pages).
No personal data included: the grants contact mailbox and the imprint's named persons are left out on purpose.

## https://game3.foundation/grants

- "Our grants range from $5,000 to $50,000 depending on the project scope, complexity, and potential impact."
- Rolling applications; no closing date shown.
- Funding priorities: Blockchain gaming infrastructure · AI-powered game content generation ·
  Decentralized virtual economies · Autonomous game agents and NPCs · Cross-game identity and asset
  frameworks · Novel game mechanics enabled by web3 · Open-source gaming tools and middleware.
- "Applications are evaluated based on: Innovation and originality, Technical feasibility, Team
  experience and capabilities, Market potential and scalability, Alignment with Game3 Foundation's
  mission, Commitment to open-source and community"
- "The review process typically takes 4-6 weeks."
- Buttons: "Connect Wallet", "Apply for Grant". Footer: "© 2025 Game3 Foundation. All rights reserved."

## https://game3.foundation/grants/apply (the form)

Three steps: "Personal Info" → "Project Information" → "Additional Information". Field list and
labels are in form.md. Source code:
https://raw.githubusercontent.com/game3foundation/website/main/src/app/grants/apply/page.tsx

- No maxLength on any field.
- Submit requires a connected wallet (wagmi + RainbowKit; chains Ethereum mainnet and Polygon,
  https://raw.githubusercontent.com/game3foundation/website/main/src/providers/wallet-provider.tsx)
  that signs: "I am submitting a grant application to Game3 Foundation for the project
  "${formData.projectName}" with the wallet address ${address}."
- POST /api/submit-grant-application verifies the signature and emails the application; the code
  comments that it does not store applications in a database
  (https://raw.githubusercontent.com/game3foundation/website/main/src/app/api/submit-grant-application/route.ts).

## Activity and entity status

- Website repo https://github.com/game3foundation/website: grant form added 2025-03-17 ("feat: add
  grant form"); last design commit 2025-03-25; last commit 2025-12-19 (a Vercel bot PR fixing
  React Server Components CVEs).
- Imprint https://game3.foundation/imprint: Game3 Foundation, Vaduz, Liechtenstein, FL-0002.688.080-3.
- Fundraiso, citing the Liechtenstein commercial register publication of 2026-05-12
  (https://www.fundraiso.com/en/organisations/game3-foundation): "Löschung lt. Beschluss des
  Fürstlichen Landgerichts vom 03.03.2026 (07 KO.2026.4) infolge Abweisung des Antrages auf
  Eröffnung eines Insolvenzverfahrens mangels hinreichenden Vermögens zur Deckung der
  Verfahrenskosten." (Deleted by court order after the insolvency petition was rejected for lack
  of assets to cover the costs of the proceedings.)
- Northdata marks the entity as terminated, a board-member exit announced 2025-10-30 and a
  publication on 2026-05-13 (https://www.northdata.com/Game3%20Foundation,%20Vaduz/FL-0002.688.080-3).
- The Discord invite on the grants page (https://discord.gg/h2VMgWY) resolves to the "GameDAO.co"
  server, about 700 members and 31 online on 2026-09-27.
