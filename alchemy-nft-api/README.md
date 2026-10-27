# Alchemy NFT API starter

This is a small Node.js demo that calls Alchemy's NFT API on Ethereum Mainnet using the product-specific endpoint from Alchemy's quickstart documentation:

`https://eth-mainnet.g.alchemy.com/nft/v3/<your-api-key>`

## 1. Create your `.env` file

Please create a `.env` file in this folder with your Alchemy key:

```bash
ALCHEMY_API_KEY=<my-key>
```

If you want to match the request shape you pasted exactly, use:

```bash
ALCHEMY_OWNER=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
ALCHEMY_PAGE_SIZE=100
ALCHEMY_WITH_METADATA=true
ALCHEMY_DISPLAY_LIMIT=10
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
2. Calls `getNFTsForOwner` for an owner such as `vitalik.eth` or `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`
3. Prints a short summary of the returned NFTs, capped by `ALCHEMY_DISPLAY_LIMIT` for readability
4. Calls `getNFTMetadata` for the first NFT in that list
5. Prints key metadata fields such as the NFT name, token type, token URI, image URL, and last-updated timestamp
6. Prints the equivalent `getNFTsForOwner` request path so you can compare it directly with the Alchemy docs or your saved URL

## How to read the response

### `getNFTsForOwner`

- `totalCount`: total number of NFTs Alchemy found for that owner
- `ownedNfts`: the NFT records for the current page
- `pageKey`: a pagination token you can pass into a later request if you want more results
- `withMetadata=true`: includes metadata fields in each returned NFT item
- `ALCHEMY_DISPLAY_LIMIT`: controls how many NFT summaries are printed from the page so `pageSize=100` stays readable in the terminal

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
