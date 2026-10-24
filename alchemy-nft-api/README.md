# Alchemy NFT API starter

This is a small Node.js demo that calls Alchemy's NFT API on Ethereum Mainnet using the product-specific endpoint from Alchemy's quickstart documentation:

`https://eth-mainnet.g.alchemy.com/nft/v3/<your-api-key>`

## 1. Create your `.env` file

Please create a `.env` file in this folder with your Alchemy key:

```bash
ALCHEMY_API_KEY=<my-key>
```

Optional overrides:

```bash
ALCHEMY_OWNER=vitalik.eth
ALCHEMY_PAGE_SIZE=3
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
2. Calls `getNFTsForOwner` for an owner such as `vitalik.eth`
3. Prints a short summary of the returned NFTs
4. Calls `getNFTMetadata` for the first NFT in that list
5. Prints key metadata fields such as the NFT name, token type, token URI, image URL, and last-updated timestamp

## How to read the response

### `getNFTsForOwner`

- `totalCount`: total number of NFTs Alchemy found for that owner
- `ownedNfts`: the NFT records for the current page
- `pageKey`: a pagination token you can pass into a later request if you want more results

Each item in `ownedNfts` commonly includes:

- `contract.address`: the NFT contract
- `tokenId`: the token identifier within that contract
- `name`: the NFT name when metadata is available
- `tokenType`: usually `ERC721` or `ERC1155`
- `image`: image URLs when Alchemy was able to resolve them

### `getNFTMetadata`

This endpoint returns the richer metadata for one NFT, including:

- `name`
- `tokenType`
- `tokenUri`
- `image`
- `timeLastUpdated`

If you want to try a different wallet, update `ALCHEMY_OWNER` in your `.env` file and rerun the script.
