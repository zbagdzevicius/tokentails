# sFUEL faucet (SKALE Nebula)

Token Tails' sFUEL gas faucet. Forked from the SKALE recipes `starter-api-distribution-nodejs`
starter, with an `mlaccesstoken` header check, batch claims and per-address balances. It sends
0.0000005 sFUEL to addresses that hold less than 75 percent of that amount.

## Run

```console
npm install
cp .env.sample .env
npm start            # or npm run dev (nodemon)
```

Variables: `PRIVATE_KEY` (a wallet holding sFUEL on the chain at `RPC_URL`), `RPC_URL`,
`ML_ACCESS_TOKEN` (every request must send it in the `mlaccesstoken` header) and `PORT` (default 8888).

Routes: `GET /` (health), `POST /claim` with `{ addresses: [] }` (batches of 100),
`GET /claim/:address`, `GET /balance`, `GET /balance/:walletAddress`.

## Security and Liability
All SKALE Recipes and code is WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

## License

![GitHub](https://img.shields.io/github/license/skalenetwork/recipes.svg)

All contributions are made under the [MIT License](https://mit-license.org/). See [LICENSE](LICENSE).
