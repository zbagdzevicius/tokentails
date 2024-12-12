# Soroban Project

## Project Structure

This repository uses the recommended structure for a Soroban project:
```text
.
├── contracts
│   └── cat
│   |   ├── src
│   |   │   ├── lib.rs -> smart contract file
│   |   │   └── test.rs -> tests file
│   |   └── Cargo.toml -> contract configuration file 
│   └── test_snapshots -> tests results file
│   └── blessing
│   |   ├── src
│   |   │   ├── lib.rs -> smart contract file
│   |   │   └── test.rs -> tests file
│   |   └── Cargo.toml -> contract configuration file 
│   └── test_snapshots -> tests results file
├── Cargo.toml -> project configuration file
└── README.md -> this file
```

#### contracts TESTNET:
- ##### TokenTailsCat NFT: `CDA7P7DZ2PTRKAQOFETKWUKVNECQSDMRNXRDMLFMKVQNAPETV5W4IYOA`
- ##### TokenTailsBlessing NFT: `CA5AVHPGJJKY7RLSXVPAQ5ZANA7OBZWXJCDWP3SZCNFRIUDAV2NDXCXM`

#### contracts PUBLIC/MAINNET:
- ##### TokenTailsCat NFT: `CC7RTEHQLWLWKU4ZIT2EWR4PO4OX5OYVOPM4LIRW7YB2EJ654CMTZVG6`
- ##### TokenTailsBlessing NFT: `CAPQCRJEVBPEXTTYXETVIYIKTGKVX65RRDNUFYGFTKHV5YTSL47XUASD`

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
Liquify provider
- public testnet `https://stellar.liquify.com/api=41EEWAH79Y5OCGI7/testnet`
- public mainnet `https://stellar-mainnet.liquify.com/api=41EEWAH79Y5OCGI7/mainnet`
Gateway provider
- public testnet `https://soroban-rpc.testnet.stellar.gateway.fm`
- public mainnet `https://soroban-rpc.mainnet.stellar.gateway.fm`

### Deploy to testnet

```
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/cat.wasm \
  --source zygis \
  --network mainnet
```

### Deploy to mainnet

```
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/cat.wasm \
  --source zygis \
  --network mainnet
```

### Contracts:
- Owner testnet public key: GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN
- Owner mainnet public key: GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN
- Cat mainnet: 
- testnet explorer: https://stellar.expert/explorer/testnet

- New Soroban contracts can be put in `contracts`, each in their own directory. There is already a `cat` contract in there to get you started.
- If you initialized this project with any other example contracts via `--with-example`, those contracts will be in the `contracts` directory as well.
- Contracts should have their own `Cargo.toml` files that rely on the top-level `Cargo.toml` workspace for their dependencies.
- Frontend libraries can be added to the top-level directory as well. If you initialized this project with a frontend template via `--frontend-template` you will have those files already included.

### Contract initialization example

e.g. on how to interact

```
stellar contract invoke \
  --id CA5AVHPGJJKY7RLSXVPAQ5ZANA7OBZWXJCDWP3SZCNFRIUDAV2NDXCXM \
  --source zygis \
  --network testnet \
  -- \
  initialize \
  --admin GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --minters '["GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN"]' \
  --base_uri https://api.tokentails.com/cat/nft/
```

### Contract mint example

e.g. on how to interact

```
stellar contract invoke \
  --id CDA7P7DZ2PTRKAQOFETKWUKVNECQSDMRNXRDMLFMKVQNAPETV5W4IYOA \
  --source zygis \
  --network testnet \
  -- \
  mint \
  --invoker GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --to GBFDHPVUCADXYGDUHJEXKO3BLV26SA5JBHV5MFQ3TH5HWVYZIP73VR4O \
  --token_id cat_3
```

### Contract get_token_uri example

e.g. on how to interact

```
stellar contract invoke \
  --id CDA7P7DZ2PTRKAQOFETKWUKVNECQSDMRNXRDMLFMKVQNAPETV5W4IYOA \
  --source zygis \
  --network testnet \
  -- \
  get_token_uri \
  --token_id cat_3
```

### Contract set_base_uri example

e.g. on how to interact

```
stellar contract invoke \
  --id CDA7P7DZ2PTRKAQOFETKWUKVNECQSDMRNXRDMLFMKVQNAPETV5W4IYOA \
  --source zygis \
  --network testnet \
  -- \
  set_base_uri \
  --invoker GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --new_base_uri "api.tokentails.com/cat/nft/"
```

### Contract owner_of example

e.g. on how to interact

```
stellar contract invoke \
  --id CDA7P7DZ2PTRKAQOFETKWUKVNECQSDMRNXRDMLFMKVQNAPETV5W4IYOA \
  --source zygis \
  --network testnet \
  -- \
  owner_of \
  --token_id cat_3
```

### Contract transfer_to example

e.g. on how to interact

```
stellar contract invoke \
  --id CDA7P7DZ2PTRKAQOFETKWUKVNECQSDMRNXRDMLFMKVQNAPETV5W4IYOA \
  --source zygis \
  --network testnet \
  -- \
  transfer_from \
  --invoker GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --from GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN \
  --to GBFDHPVUCADXYGDUHJEXKO3BLV26SA5JBHV5MFQ3TH5HWVYZIP73VR4O \
  --token_id cat_3
```


#### Protocol 21 (Mainnet, June 18, 2024)

```
    helm install stellar-rpc stellar/soroban-rpc --values pubnet.yaml
```