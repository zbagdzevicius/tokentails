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
├── Cargo.toml -> project configuration file
└── README.md -> this file
```

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
  --network testnet
```

### Deploy to mainnet

```
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/cat.wasm \
  --source zygis \
  --network mainnet
```

### Contracts:
- Cat testnet: CDUNBRH6DPNLFQRNE3WZVMDWAFCXACDZVEMUJD7PF6KMLZDEEKGNAW5V
- Cat mainnet: CDUNBRH6DPNLFQRNE3WZVMDWAFCXACDZVEMUJD7PF6KMLZDEEKGNAW5V

- New Soroban contracts can be put in `contracts`, each in their own directory. There is already a `cat` contract in there to get you started.
- If you initialized this project with any other example contracts via `--with-example`, those contracts will be in the `contracts` directory as well.
- Contracts should have their own `Cargo.toml` files that rely on the top-level `Cargo.toml` workspace for their dependencies.
- Frontend libraries can be added to the top-level directory as well. If you initialized this project with a frontend template via `--frontend-template` you will have those files already included.

### Interaction

e.g. on how to interact

```
stellar contract invoke \
  --id CDUNBRH6DPNLFQRNE3WZVMDWAFCXACDZVEMUJD7PF6KMLZDEEKGNAW5V \
  --source zygis \
  --network testnet \
  -- \
  METHOD \
  --to RPC
```

#### Protocol 21 (Mainnet, June 18, 2024)

```
    helm install stellar-rpc stellar/soroban-rpc --values pubnet.yaml
```