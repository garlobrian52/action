# Alchemy Ethereum JSON-RPC starter

This is a small Node.js demo that calls Alchemy's Ethereum Mainnet JSON-RPC endpoint:

`https://eth-mainnet.g.alchemy.com/v2/<your-api-key>`

## 1. Create your `.env` file

Please create a `.env` file in this folder with your Alchemy key:

```bash
ALCHEMY_API_KEY=<my-key>
```

Optional override:

```bash
ALCHEMY_WALLET_ADDRESS=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
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
2. Calls `eth_blockNumber` to get the latest block height
3. Calls `eth_getBlockByNumber` to fetch summary data for that latest block
4. Calls `eth_getBalance` to fetch the ETH balance of a wallet
5. Converts the raw Wei balance into a human-readable ETH amount

## How to read the response

### Latest block

- `Block number (hex)`: the latest block number in JSON-RPC hex format
- `Block number (decimal)`: the same block number converted to base-10 for readability
- `Block hash`: the unique hash for that block
- `Parent hash`: the previous block's hash
- `Timestamp (hex)`: when the block was mined, in hex
- `Transaction count`: how many transaction hashes were returned for that block

### Wallet balance

- `Address`: the wallet you queried
- `Raw balance (wei, hex)`: the on-chain balance in JSON-RPC hex format
- `Balance (ETH)`: the same value converted from Wei into ETH

If you want to inspect a different wallet, update `ALCHEMY_WALLET_ADDRESS` in your `.env` file and rerun the script.
