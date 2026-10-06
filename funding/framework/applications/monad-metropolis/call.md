---
program: Monad Metropolis online hackathon (Consumer Products & Payments track)
track: A
status: researching
frame: payout-rail
deadline: 2026-10-13
url: "https://monad.xyz/developers/hackathons/metropolis"
next: Log in at hackathon.monad.xyz to confirm the year, the deadline time zone, the rules (mainnet or testnet, excluded countries, KYC) and the prize currency. ShelterSplit and DonateRouter are live on Monad testnet (10143, Oct 4); if the rules need mainnet, deploy Monad 143 in the mainnet wave, then fund fill monad-metropolis --write
created: 2026-09-30
profile: monad-metropolis
chain: monad
mainnet_required: false
repo: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split"
demo: ""
build_window_start: 2026-09-01
build_window_end: 2026-10-13
---
# Monad Metropolis online hackathon (Consumer Products & Payments track) — call rules

Track A fields: `chain` is a key in `tracks/a-build/chains.json` (or a list, any of which counts),
`mainnet_required: true` makes `fund check` demand a recorded mainnet deployment on that chain,
`repo` must be the public repo URL before `ready`. `profile` names `tracks/a-build/programs/<profile>.json`
(submission sections and limits); if that file does not exist the draft sections are used as-is.

## Scoring criteria

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|
| C1 | Consumer products and payments (track brief, not the judging rubric) | not stated | "Onchain rails can make financial products feel instant, programmable, and invisible to the end user." |

The judging rubric is not on the public page (rules behind the hackathon.monad.xyz login). C1 is the track brief, used until the rubric is known.

## Limits

Not stated on the public page.

## Mandatory annexes

## Exclusions

## Eligibility gates

- New work only: "what you show on 13 Oct should have been built during the six weeks" (build window 1 Sep to 13 Oct; year not shown on the page).
- Required: working product with a public project profile, demo video, short written description, code link.
- Country restrictions are in the official rules behind the login. UNVERIFIED: mainnet vs testnet, KYC, deadline time zone.

## Chain facts (checked on-chain 2026-10-04, see tracks/a-build/chains.json)

- Monad mainnet: chain 143, Circle USDC 0x754704Bc059F8C67012fEd69BC8A327a5aafb603 (6 decimals), gas MON, explorer https://monadvision.com. No deployment yet (mainnet wave).
- Monad testnet: chain 10143, Circle USDC 0x534b2f3A21130d7a60830c2Df862319e593943A3 (6 decimals, EIP-712 version "2", EIP-3009), explorer https://testnet.monadvision.com.
- Testnet proof: ShelterSplit 0x457c89e10a6e66633eda5bf82fd086febb5db147 (Sourcify verified) and DonateRouter 0xe271131be71e29f83084fd34aa6c70d50a2aea71 (Sourcify verified); 1 USDC proof payout, 0.01 MON native gift and a one-signature 0.1 USDC router gift, all paid to Pink Paw (the USDC proof and router gift hashes are in deployments.json and router-deployments.json; the native gift hash is only in draft.md's header comment).
