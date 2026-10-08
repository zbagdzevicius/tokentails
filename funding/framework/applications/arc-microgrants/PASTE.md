# Arc Microgrants — PASTE (DoraHacks, form order)

Form: https://dorahacks.io/hackathon/arc-microgrants · closes Oct 14 23:59 ET (Oct 15 06:59 Vilnius) · rolling review, so earlier is better.
Generated 2026-10-08 from dorahacks-answers.md (edit that file, not this one). Copy the text inside each box.

Before you press submit (2 min):
- [ ] https://api.tokentails.com/shelter/donate/status still shows `enabled: true` for chainId 5042 (Q8 says players send treats).
- [ ] Optional but strong: send the first real treat on https://tokentails.com/shelter-payouts and add its receipt link (`https://tokentails.com/shelter-payouts/receipt?chain=5042&tx=<hash>`) as one more Q12 line.
- [ ] If a Tameion prize has been paid by then, say so in Q12.

## Q1–Q3 — YOU FILL

Basics the form asks first (not recorded in our files). Suggestions:

```
Token Tails — ShelterSplit
```

```
Shelter payouts in native USDC on Arc, with a public receipt for every payout.
```

Logo or cover, if asked: the Token Tails logo.

## Q4 — Builder profile (GitHub, X or Farcaster)

```
https://github.com/zbagdzevicius
```

## Q5 — Link to your live deployment on Arc mainnet

```
https://tokentails.com/shelter-payouts
```

## Q6 — Arc mainnet contract address or a transaction hash we can verify

```
ShelterSplit (USDC): 0x457c89e10a6e66633eda5bf82fd086febb5db147
Proof payout (Disbursed, 0.1 USDC to Pink Paw): 0xd26f6e938afe5e6b8204c816a91927b19f73e0837ff376f06bb05659b260d68d
```

## Q7 — Public repo

```
https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split
```

## Q8 — In two sentences, what does your project do?

```
ShelterSplit is a contract on Arc mainnet that splits native USDC as it arrives and pays each registered animal shelter in the same transaction, with a public receipt for every payout. Verified players of our cat-rescue game can send its first shelter, Pink Paw (wallet held by Token Tails until handover), a 0.01 USDC treat that Token Tails pays for, with one tap and no wallet or gas.
```

## Q9 — What does it use Arc for?

```
USDC is Arc's gas token, so a donor or our treat wallet sends plain USDC to donate(memo) or receive() and the split pays the shelter with no approve step and no second token.
Arc's fast finality lets the receipt page show the payout seconds after the gift lands.
A DonateRouter (0x937f13ce28294011567615330dbcb859a06a0bba) takes one-signature EIP-3009 USDC gifts, and a second instance pays in EURC (split 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052, router 0x683d66d89eaa7460d3a12337cdf8185fae37dfbd).
```

## Q10 — Deployed before? (Mainnet / Testnet / No)

```
Testnet
```

## Q11 — Already funded by a Circle or Arc program?

```
No
```

## Q12 — Anything else (optional)

```
- Arc mainnet (5042): USDC split 0x457c89e10a6e66633eda5bf82fd086febb5db147 (proof payout 0xd26f6e938afe5e6b8204c816a91927b19f73e0837ff376f06bb05659b260d68d) and EURC split 0xb3adf1220d7d3835c2af1c194ff745d0d33bd052 (proof payout 0x56d7f37ba0608f7c610d45e4c1bca9d961218aa49f99fbcd095f635b9c62481f); DonateRouters 0x937f13ce28294011567615330dbcb859a06a0bba (USDC) and 0x683d66d89eaa7460d3a12337cdf8185fae37dfbd (EURC). All four are source verified on Sourcify (exact match).
- Receipt read straight from Arc: https://tokentails.com/shelter-payouts/receipt?chain=5042&tx=0xd26f6e938afe5e6b8204c816a91927b19f73e0837ff376f06bb05659b260d68d
- Sponsored treats are live on Arc mainnet: 0.01 USDC each, one per verified player per day, up to 100 a day; the treat wallet 0x8D03d8295892F7dE2B7cE57585Aa45Dd4B3C2ba0 holds a float for about 300 treats plus gas. Each treat calls donate('tt:<source>:<random id>'); no personal data on-chain.
- Earlier versions ran on Arc testnet (5042002) from Oct 2, with DonateRouter, a gasless try-it flow and EURC; Q10 refers to those.
- Tests: 149/149 Foundry tests pass (unit, fuzz, invariant, reentrancy), including an Arc test for USDC's native and ERC-20 balance being one; MIT.
- Custody: Pink Paw's wallet 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37 is held by Token Tails until the shelter takes it over; wallet gifts through the router and the agent endpoint open only after that handover. Every payout into it is public before and after.
- Disclosure: we are also entering this work in the Tameion Agents Hackathon (Canteen x Circle x Arc, closes Oct 17). No Circle or Arc program has funded it; we will tell Arc if a Tameion prize is paid before the Arc decision.
```

## Payee wallet — YOU FILL

Wherever the form or the post-selection verification asks: an Arc address the team controls that can receive USDC.
Not the treasury (0x7b13…9A), not Pink Paw's wallet (0xE299…0f37), not the treat hot wallet (0x8D03…2ba0).

```
0x… (YOU FILL)
```
