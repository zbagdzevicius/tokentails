# Answers — SKALE SIP-6 forum post

One `### <field id>` per field. Cite every number with [F-###] (citations are stripped from the
paste sheet). A real answer here overrides the field's form.md source; `TODO` counts as empty.

### post

SIP-6 is on Snapshot now, so this is not about the vote. It is input for the grant committee on how
the "high-throughput applications" line could be measured once the allocation is live.

Who we are: Token Tails, a cat-rescue game live on web, iOS and Android [F-015] [F-016]. Our Cat and Blessing ERC-721 contracts were deployed on SKALE Nebula, testnet and mainnet,
in 2024 [F-010]. Our production chain today is Stellar, not SKALE [F-025].

Our own numbers show why peaks are the wrong metric. On SEI, in the week of 17 November 2025, we
peaked at 875,907 transactions from 324,422 unique wallets [F-004] [F-003]. That activity ended in
March 2026 [F-006]. A grant judged on that peak would have paid for traffic that did not last.

We also know that player transactions on a zero-gas hub like Nebula do not pay fees one by one, and
this thread is about fee revenue. So consumer apps should be judged on what they bring to the
network in Credits or chain fees, not on raw transaction counts. For the grants, we would ask the
committee to:

1. Publish a definition of "high-throughput" before any grant goes out: weekly transactions from
   distinct wallets, sustained over months, excluding self-transfers and bot-farmed activity.
2. Measure it on SKALE, in public: weekly transactions, weekly active wallets, and one- and
   three-month wallet retention, with a Dune dashboard per grantee.
3. Report the fees or Credits each grantee generates, next to the SKL it received.
4. Release grants in milestones tied to those numbers, and publish what each grantee does with its
   SKL (hold, lock or sell), which answers the sell-pressure concern raised above.
5. Publish the committee's criteria and how to apply.

If the committee opens a round for consumer apps, we would apply under those rules and publish our
own dashboard from day one.

## Notes (not pasted)

- Timing: KuCoin community news, 2026-09-22 14:12, "SIP-6 is live on Snapshot"
  (https://www.kucoin.com/news/community/SKL/6ab28b0e74fd460007c4c60f). The SKALE Snapshot space
  uses a 7-day voting period, so the vote likely closes about 2026-09-29. The forum thread
  (https://forum.skale.network/t/848.json, re-read 2026-09-28) has 13 visible posts, last
  2026-09-26, and no vote link. The post is now written for the grant committee, not for the vote.
- F-003 and F-004 use the corrected values from facts/FACTS-proposed.md (weekly, week of
  2025-11-17). FACTS.md still says 659,000 / 324,000 "monthly": a person must apply those two rows
  to FACTS.md before this is posted, or `fund check` will keep warning (fact-numbers, facts-soft).
- F-006 is cited for "ended in March 2026" (last weekly-wallet row is the week of 2026-03-02 per
  FACTS-proposed). Its FACTS.md date (2026-09-25) is wrong and also needs the proposed fix.
- Removed: F-001 (542,000 registered users, unverified, company-reported), F-007 (Stellar
  invocations run through a custodial wallet per user, which contradicts point 1 and invites
  challenge), the "turns into fees" claim (false for zero-gas Nebula), and the "move back onto
  Nebula / early test case" pitch (no plan or date exists; reads as a grant grab).
- The last line is a commitment. Delete it if the team would not really publish a dashboard.
