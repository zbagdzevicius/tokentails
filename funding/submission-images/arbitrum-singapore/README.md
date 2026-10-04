# Arbitrum Open House Singapore (HackQuest): image set

Built 2026-10-04 from repo art and real screenshots only (no generated or stock images). Text matches
`funding/framework/applications/arbitrum-singapore/submission.md`. Every payout shown is a **testnet** payout and is labelled that way.

HackQuest spec: square project logo (shown at 40–80 px; use 1024 PNG). Cover field and size limit are not verified, so the 16:9 cover and the 1200x630 version are both here. Every file is under 2 MB.

| File | Size | Where it goes | Alt text / caption |
|---|---|---|---|
| `logo-1024.png` | 1024x1024, 384 KB | Project logo | Token Tails pixel cat holding a gold coin |
| `cover-1920x1080.png` | 1920x1080, 1.5 MB | Cover / banner (16:9) | ShelterSplit on Arbitrum Sepolia testnet: shelter payouts you can check. A rescue receipt shows 1 test USDC sent to Pink Paw (Rožinė pėdutė). |
| `cover-1200x630.png` | 1200x630, 677 KB | Cover if the field is 1.91:1; also the link preview for X | Same as above, short form |
| `01-receipt-arbitrum-sepolia.png` | 1920x1080, 1.4 MB | Screenshot 1 | Rescue receipt read from the chain: 1 test USDC to Pink Paw on Arbitrum Sepolia testnet (block 315450872), memo "Token Tails first payout", with an explorer link. Test coins, no real money. |
| `02-testnet-proof.png` | 1920x1080, 1.4 MB | Screenshot 2 | The payouts page's testnet proof: the same ShelterSplit contract on 6 testnets, 49 test payouts on 10 contracts. Arbitrum Sepolia (0x457c…b147, highlighted): 5 test payouts, contract balance 0. |
| `03-how-shelter-split-works.png` | 1920x1080, 917 KB | Screenshot 3 (diagram) | How ShelterSplit works: disburse(amount, memo) pulls USDC and pays each registered shelter its share in one call; the rest and rounding dust go to the treasury; Disbursed events feed the payouts page. The test payouts shown were paid by Token Tails' own wallet; sponsored game treats run on Arc testnet first. |
| `04-catnip-heist-result.png` | 1920x1080, 1.2 MB | Screenshot 4 | Catnip Heist results screen after freeing a shelter cat, with a link to the shelter payouts. Real shelter treats open with the mainnet deploy. |
| `05-pink-paw-cats.png` | 1920x1080, 1.1 MB | Screenshot 5 | "Sent to shelters" in Catnip Heist: Pink Paw (Rožinė pėdutė) and its real cats. Its wallet is held by Token Tails until handover. |
| `06-payouts-page.png` | 1920x1080, 1.6 MB | Screenshot 6 | tokentails.com/shelter-payouts: payouts read from the chain's public RPC, not our servers. Mainnet payouts are not live yet. |

Upload order if only some fit: logo, cover, 01, 02, 03, then 04–06.

## Sources and caveats

- 01, 02 and 06 were captured from the working tree on `localhost:3001` (Arbitrum receipt `chain=421614&tx=0x73cd…184d`, the `#testnet-proof` section). If the live site has not been redeployed, judges may not see the testnet proof section or the Arbitrum receipt at tokentails.com yet. Deploy before submitting, or treat 01 and 02 as previews.
- 04 is a Catnip Heist promo still (`catnip-heist/promo/reel30/assets/clips/stills/oc-results.jpg`). 05 is the live `tokentails.com/heist?payouts` modal.
- No Arbitrum or other chain logos: none exist in the repo assets.
- Rebuild: specs and the diagram page are in `src/` (`node ../_shared/render.mjs --spec src/<name>.json <name>.png`, `node ../_shared/render.mjs src/diagram.html 03-how-shelter-split-works.png 1920 1080`). `src/shots.mjs` retakes the screenshots without touching the :3001 server.
