# Notes from the AI revise step

Three things to handle before you submit:
- **Not on mainnet yet:** Summary and "On-chain proof" say ShelterSplit is live on Arc mainnet, and it isn't deployed yet. Deploy it first, or both sections make a false claim. Since 2026-10-05 the deploy is the mainnet wave: `fund a:mainnet-plan --network mainnet`, then a person runs `CONFIRM_MAINNET=yes tracks/a-build/wave/mainnet-all.sh`, which records the addresses itself (`fund a:ingest`).
- **Unverified number:** F-001 (542,000 registered users) is self-reported. Resolved: the draft no longer cites F-001 (checked 2026-10-05).
- **Claim from outside the fact base:** the line that USDC is Arc's gas token comes from Circle's public description of Arc, not the fact base. Check it's still accurate.
