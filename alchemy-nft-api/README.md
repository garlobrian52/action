# Alchemy NFT API starter

Standalone Node.js script that calls Alchemy’s Ethereum Mainnet NFT API (`getNFTsForOwner`, then `getNFTMetadata` for the first returned token). It is a local demo only.

This folder is not part of the Changesets Release Action. Nothing under `.github/workflows/` installs it, runs it, or publishes it. `demo-script.js` has no exports; requiring the file runs the demo.

Behavior below matches `demo-script.js`, `package.json`, `.env.example`, and `.gitignore`.

## Requirements

- Node.js with global `fetch`. This package does not set `engines` and does not depend on `node-fetch`. Checked on Node 24.
- A network path to `eth-mainnet.g.alchemy.com`.
- An Alchemy API key. The key is sent in the URL path, not in a header.

The host is fixed:

```text
https://eth-mainnet.g.alchemy.com/nft/v3/<ALCHEMY_API_KEY>
```

There is no chain or host override.

## Setup

Run commands from this directory. `dotenv.config()` is called with no options, so it reads `path.resolve(process.cwd(), ".env")` and does not override variables already set in the environment.

```bash
cd alchemy-nft-api
npm install
```

Create `.env` here (gitignored). `.env.example` is the template:

```bash
ALCHEMY_API_KEY=your-alchemy-api-key-here
ALCHEMY_OWNER=vitalik.eth
ALCHEMY_PAGE_SIZE=3
```

| Variable | Required | When unset or `""` |
| --- | --- | --- |
| `ALCHEMY_API_KEY` | yes | exit 1 before any request |
| `ALCHEMY_OWNER` | no | `vitalik.eth` |
| `ALCHEMY_PAGE_SIZE` | no | `3` |

`npm start` and `node demo-script.js` do the same thing. `npm test` is `node demo-script.js --help`: it prints usage and exits 0. It does not call Alchemy and does not require a key. `--help` is recognized anywhere in `process.argv`, but only after `dotenv.config()` runs.

## What a run does

1. Load `.env` from the current working directory.
2. Exit 0 if `--help` is present.
3. Read the three variables above. Missing key: print the two error lines below and exit 1.
4. `GET .../getNFTsForOwner?owner=<owner>&pageSize=<pageSize>`.
5. Print `totalCount`, print `pageKey` when it is truthy, then print one block per `ownedNfts` entry.
6. If `ownedNfts[0]` has a truthy `contract.address` and a truthy `tokenId`, `GET .../getNFTMetadata?contractAddress=<address>&tokenId=<id>` and, only when that NFT’s own `tokenType` is non-empty, `&tokenType=<tokenType>`.
7. Print a short metadata summary. HTTP failures throw, the catch prints `Request failed.` plus `error.message`, and the process exits 1.

Example requests (key redacted the same way the startup log redacts it):

```text
GET /nft/v3/<redacted-key>/getNFTsForOwner?owner=vitalik.eth&pageSize=3
GET /nft/v3/<redacted-key>/getNFTMetadata?contractAddress=0xabc&tokenId=7&tokenType=ERC721
```

Query values that are `undefined`, `null`, or `""` are omitted. Every other value is stringified, including `0` and `NaN`.

The script does not follow `pageKey`, does not read a page-key variable, and does not request metadata for any NFT after the first.

## Fields the script prints

`getNFTsForOwner` summary, per item, with fallback order:

| Line | Source |
| --- | --- |
| Contract | `contract.address`, else `unknown` |
| Token ID | `tokenId`, else `unknown` |
| Name | `name`, else `title`, else `unavailable` |
| Token type | `tokenType`, else `contract.tokenType`, else `unavailable` |
| Image | `image.originalUrl`, else `image.cachedUrl`, else `raw.metadata.image`, else `unavailable` |

`totalCount` is printed even when the property is missing (`undefined`). A truthy `pageKey` is printed and then ignored. An empty or non-array `ownedNfts` prints `No NFTs were returned for this owner.` The metadata step still runs afterward and, with no usable first NFT, also prints `Skipping metadata lookup because the first NFT did not include a contract address and token ID.`

`getNFTMetadata` summary:

| Line | Source |
| --- | --- |
| Name | `name`, else `title`, else `unavailable` |
| Contract | `contract.address`, else `unknown` |
| Token ID | `tokenId`, else the id from the list item |
| Token type | `tokenType`, else `unavailable` (no `contract.tokenType` fallback) |
| Token URI | `tokenUri`, else `raw.tokenUri`, else `unavailable` |
| Image URL | `image.originalUrl`, else `image.cachedUrl`, else `raw.metadata.image`, else `unavailable` |
| Last updated | `timeLastUpdated`, else `unavailable` |

The list printer can show `contract.tokenType` (for example `ERC1155`) while the metadata request sends the top-level `tokenType` only. If the top-level field is missing, `tokenType` is left off the metadata URL even when `contract.tokenType` was displayed.

## Exit codes

| Situation | Code | What you see |
| --- | --- | --- |
| `--help` / `npm test` | 0 | Help text. No request. |
| Successful run | 0 | Startup line with `<redacted-key>`, then summaries. |
| `ALCHEMY_API_KEY` missing | 1 | `Missing ALCHEMY_API_KEY.` and a second line that always names `/workspace/alchemy-nft-api`, whatever the real checkout path is. |
| Response not OK | 1 | `Request failed.` then `Alchemy request failed (<status> <statusText>): <body>`. The response body is not redacted. |

Startup always logs `https://eth-mainnet.g.alchemy.com/nft/v3/<redacted-key>` before calling `fetch`. Non-HTTP failures print `error.message` with no extra redaction.

## Pitfalls

- **Working directory.** `node alchemy-nft-api/demo-script.js` from the repo root loads `./.env` at the root, not `alchemy-nft-api/.env`. `cd alchemy-nft-api` first (or export the variables yourself).
- **Existing environment wins.** `dotenv` is not configured with `override: true`. A key or owner already exported in the shell is kept. Dotenv prints `◇ injected env (N) from .env`, where `N` is how many keys it actually wrote, not how many lines are in the file. A missing `.env` still prints `◇ injected env (0) from .env`; the script ignores dotenv’s error and continues.
- **`pageSize` is not validated.** `""` falls back to `3`. The string `"0"` is sent as `pageSize=0`. `3abc` becomes `3` (`parseInt` base 10). `abc` becomes the query value `NaN`.
- **Falsy token id.** The metadata guard and the list printer both treat a falsy `tokenId` as missing. Numeric `0` skips metadata and prints `unknown`. The string `"0"` is kept.
- **One page, one metadata lookup.** A returned `pageKey` is only logged. Changing owner or page size means editing `.env` (or the environment) and running again. It does not walk the collection.
- **Key placement.** The key is part of the URL. Keep it in `.env` or the environment. `.env` is gitignored; do not commit a real key. `.env.example` is a placeholder.
