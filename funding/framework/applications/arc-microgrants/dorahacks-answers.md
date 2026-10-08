# Arc Microgrants — DoraHacks answer sheet (12 questions)

Written 2026-10-08 from draft.md, deployments.json and router-deployments.json (RULES-COMPLIANCE §2.1, action A3).
Submit at https://dorahacks.io/hackathon/arc-microgrants. One submission per project. Search this file for "{" before
pasting: nothing should be left open except the optional demo.

Q1–Q3 are not recorded in our files (project name, contact and similar basics): fill them from the form.
Project name: Token Tails — ShelterSplit.

## Q4 Builder profile (GitHub, X or Farcaster)
https://github.com/zbagdzevicius

## Q5 Live deployment on Arc mainnet
https://tokentails.com/shelter-payouts (Arc mainnet cards: the USDC and EURC splits, their proof payouts and explorer links)

## Q6 Arc mainnet contract address or transaction hash
ShelterSplit (USDC): 0x457c89e10a6e66633eda5bf82fd086febb5db147
Proof payout (Disbursed, 0.1 USDC to Pink Paw): 0xd26f6e938afe5e6b8204c816a91927b19f73e0837ff376f06bb05659b260d68d

## Q7 Public repo
https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split

## Q8 In two sentences, what does your project do?
ShelterSplit splits native USDC on Arc as it arrives and pays each registered animal shelter in the same transaction, with a public receipt for every payout. It is live on Arc mainnet with proof payouts to its first shelter, Pink Paw, whose wallet Token Tails holds until handover.

<!-- Add "Players send a sponsored one-tap gift after a game." only once
https://api.tokentails.com/shelter/donate/status shows enabled:true for chain 5042. -->

## Q9 What does it use Arc for?
USDC is Arc's gas token, so a donor sends plain USDC to donate(memo) or receive() and the split pays the shelter with no approve step and no second token.
Arc's fast finality lets the receipt page show the payout as soon as the gift lands.
A DonateRouter (0x937f13ce28294011567615330dbcb859a06a0bba) takes one-signature EIP-3009 USDC gifts, and a second instance pays in EURC (split 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052, router 0x683d66d89eaa7460d3a12337cdf8185fae37dfbd).

## Q10 Deployed before?
Testnet

## Q11 Already funded by a Circle or Arc program?
No

## Q12 Anything else
- Arc mainnet: USDC split 0x457c…b147 (proof payout 0xd26f…d68d) and EURC split 0xb3ad…d052 (proof payout 0x56d7f37ba0608f7c610d45e4c1bca9d961218aa49f99fbcd095f635b9c62481f); DonateRouters for both, source verified on Sourcify (exact match).
- Earlier versions of this project ran on Arc testnet (5042002) from Oct 3, with DonateRouter, a gasless try-it flow and EURC; Q10 refers to those.
- Tests: Foundry fuzz and invariant suites for ShelterSplit and DonateRouter; MIT.
- Custody: Pink Paw's wallet 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37 is held by Token Tails until the shelter takes it over; public wallet gifts and the agent endpoint open only after that handover. Every payout into it is public before and after.
- Disclosure: we are also entering this work in the Tameion Agents Hackathon (Canteen x Circle x Arc, closes Oct 17). No Circle or Arc program has funded it; we will tell Arc if a Tameion prize is paid before the Arc decision.
- Demo video (optional): {DEMO_URL}
