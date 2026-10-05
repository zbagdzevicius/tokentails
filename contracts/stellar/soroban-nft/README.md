# Token Tails Soroban contracts

Cargo workspace (`soroban-sdk 21.0.0`) with three NFT contracts: Cat, Blessing and Pass. Full
description, entrypoints and known issues: [docs/CONTRACTS.md](../../../docs/CONTRACTS.md).

```text
.
├── contracts
│   ├── cat        TokenTailsCat:      src/lib.rs (contract), src/test.rs (tests), Cargo.toml
│   ├── blessing   TokenTailsBlessing: src/lib.rs, src/test.rs, Cargo.toml
│   └── nft        TokenTailsPass:     src/lib.rs, src/test.rs, Cargo.toml
├── k8s-pubnet.yaml, k8s-cert.yaml   self-hosted Soroban RPC (Helm values, cert-manager issuer)
├── Cargo.toml   workspace configuration
└── README.md    this file
```

#### contracts TESTNET:
- ##### TokenTailsCat NFT: `CAJRXVUUCM7GKWM4SHAZURJDCJMWQY2OZMOJ243SNOFESW5I6LYUTGFM`
- TokenTailsBlessing NFT: not recorded (an earlier line repeated the mainnet Cat ID here)

#### contracts MAINNET:
- ##### TokenTailsCat NFT: `CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF`
- ##### TokenTailsBlessing NFT: `CDY53U64IBGRTIABOQDS3ZXAIYP3S3VY42TKOX2G65E2UVBF3YLS7NJ6`
- ##### TokenTailsPass NFT: `CBK4KAHLHNWOF4HEZFY2W57NYMSC4DLZGLGCM4HZUPAUU3PDPM3IMRS4`
- Owner public key: GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN
- explorer: https://stellar.expert/explorer

### Run tests

`cargo test`

### Build contracts

`stellar contract build`

### Add testnet network

```
stellar network add \
  --global testnet \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015"
```

### Add Gateway testnet network

```
stellar network add \
  --global testnet2 \
  --rpc-url https://soroban-rpc.testnet.stellar.gateway.fm \
  --network-passphrase "Test SDF Network ; September 2015"
```

### Add mainnet network

```
stellar network add \
  --global mainnet \
  --rpc-url https://soroban-rpc.mainnet.stellar.gateway.fm \
  --network-passphrase "Public Global Stellar Network ; September 2015"
```


### Networks

- official testnet `https://soroban-testnet.stellar.org`
Gateway provider
- public testnet `https://soroban-rpc.testnet.stellar.gateway.fm`
- public mainnet `https://soroban-rpc.mainnet.stellar.gateway.fm`

### Deploy to testnet

```
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/cat.wasm \
  --source zygis \
  --network testnet
```

### Deploy to mainnet

```
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/blessing.wasm \
  --source zygis \
  --network mainnet
```

### Contract initialization

e.g. on how to interact

```
stellar contract invoke \
  --id CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF \
  --source zygis \
  --network mainnet \
  -- \
  initialize \
  --admin GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --minters '["GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN"]' \
  --base_uri https://api.tokentails.com/cat/nft/
```
```
stellar contract invoke \
  --id CBK4KAHLHNWOF4HEZFY2W57NYMSC4DLZGLGCM4HZUPAUU3PDPM3IMRS4 \
  --source zygis \
  --network mainnet \
  -- \
  initialize \
  --admin GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --base_uri https://api.tokentails.com/cat/mint/
```

### Contract check

e.g. on how to interact

```
stellar contract invoke \
  --id CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF \
  --source zygis \
  --network mainnet \
  --send yes \
  -- \
  check
```

### Contract mint

e.g. on how to interact

```
stellar contract invoke \
  --id CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF \
  --source zygis \
  --network mainnet \
  -- \
  mint \
  --invoker GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --to GBFDHPVUCADXYGDUHJEXKO3BLV26SA5JBHV5MFQ3TH5HWVYZIP73VR4O \
  --token_id initialization_test
```

```
stellar contract invoke \
  --id CBK4KAHLHNWOF4HEZFY2W57NYMSC4DLZGLGCM4HZUPAUU3PDPM3IMRS4 \
  --source zygis \
  --network mainnet \
  -- \
  mint \
  --to GBFDHPVUCADXYGDUHJEXKO3BLV26SA5JBHV5MFQ3TH5HWVYZIP73VR4O
```


### Contract get_token_uri

e.g. on how to interact

```
stellar contract invoke \
  --id CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF \
  --source zygis \
  --network mainnet \
  -- \
  get_token_uri \
  --token_id cat_3
```

### Contract set_base_uri

e.g. on how to interact

```
stellar contract invoke \
  --id CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF \
  --source zygis \
  --network mainnet \
  -- \
  set_base_uri \
  --invoker GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --new_base_uri "api.tokentails.com/cat/nft/"
```

### Contract owner_of

e.g. on how to interact

```
stellar contract invoke \
  --id CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF \
  --source zygis \
  --network mainnet \
  -- \
  owner_of \
  --token_id cat_3
```

### Contract transfer_to

e.g. on how to interact

```
stellar contract invoke \
  --id CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF \
  --source zygis \
  --network mainnet \
  -- \
  transfer_from \
  --invoker GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --from GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --to GBFDHPVUCADXYGDUHJEXKO3BLV26SA5JBHV5MFQ3TH5HWVYZIP73VR4O \
  --token_id cat_3
```


#### Protocol 21 (Mainnet, June 18, 2024)
Kubernetes Stellar RPC deployment example 

```
    helm install stellar-rpc stellar/soroban-rpc --values pubnet.yaml
```