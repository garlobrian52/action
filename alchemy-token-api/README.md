# Alchemy Token API starter

This is a small Node.js demo that calls Alchemy's Token API on Ethereum Mainnet using the RPC endpoint:

`https://eth-mainnet.g.alchemy.com/v2/<your-api-key>`

## 1. Create your `.env` file

Please create a `.env` file in this folder with your Alchemy key:

```bash
ALCHEMY_API_KEY=<my-key>
```

Optional overrides:

```bash
ALCHEMY_OWNER_ADDRESS=0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be
ALCHEMY_TOKEN_ADDRESS=0x607f4c5bb672230e8672085532f7e901544a7375
```

The script reads the key from `process.env.ALCHEMY_API_KEY` and never hard-codes it.

## 2. Install dependencies

```bash
npm install
```

## 3. Run the demo

```bash
npm start
```

or:

```bash
node demo-script.js
```

## What the demo does

1. Loads `ALCHEMY_API_KEY` with `dotenv`
2. Calls `alchemy_getTokenBalances` for one owner and one token contract
3. Calls `alchemy_getTokenMetadata` for that token contract
4. Prints the raw hex balance returned by the API
5. Converts the raw balance into a human-readable amount using the token's `decimals`

## How to read the response

### `alchemy_getTokenBalances`

- `address`: the wallet you queried
- `tokenBalances`: the balances Alchemy found for the requested token contracts
- `tokenBalances[0].tokenBalance`: the raw token balance in hex
- `tokenBalances[0].error`: populated if Alchemy had trouble returning that balance

### `alchemy_getTokenMetadata`

- `name`: token name
- `symbol`: token ticker
- `decimals`: number of decimal places used by the token
- `logo`: a token logo URL when available

### Human-readable balance

The script combines the raw hex balance with `decimals` to print a formatted token amount such as `123.45 RLC`.

If you want to try a different wallet or ERC-20 token, update `ALCHEMY_OWNER_ADDRESS` or `ALCHEMY_TOKEN_ADDRESS` in your `.env` file and rerun the script.
