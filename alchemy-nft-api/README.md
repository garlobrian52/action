# Alchemy NFT API starter

Standalone Node.js script that calls Alchemy’s Ethereum Mainnet NFT API. It requests one page of `getNFTsForOwner`, prints that page, then calls `getNFTMetadata` for the first returned token when that token has a contract address and a truthy token id.

This folder is a local demo. Nothing under `.github/workflows/` installs it, runs it, or publishes it. `demo-script.js` has no exports; loading the file runs the demo. The notes below match `demo-script.js`, `package.json`, `.env.example`, and `.gitignore` on Node 24 with `dotenv@18.0.9`.

## Requirements

- Node.js with global `fetch`. This package does not set `engines` and does not depend on `node-fetch`.
- A network path to `eth-mainnet.g.alchemy.com`.
- An Alchemy API key. The key is a path segment.

The host is fixed to Ethereum Mainnet.

```text
https://eth-mainnet.g.alchemy.com/nft/v3/<ALCHEMY_API_KEY>
```

Startup always logs that URL with the key replaced by `<redacted-key>` before `fetch`.

## Setup

Run commands from this directory. `dotenv.config()` is called with no options, so it reads `path.resolve(process.cwd(), ".env")`.

```bash
cd alchemy-nft-api
npm install
```

`.env` is gitignored. `.env.example` is the template:

```bash
ALCHEMY_API_KEY=your-alchemy-api-key-here
ALCHEMY_OWNER=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
ALCHEMY_PAGE_SIZE=100
ALCHEMY_WITH_METADATA=true
```

| Variable | Required | When unset |
| --- | --- | --- |
| `ALCHEMY_API_KEY` | yes | exit 1 before any request |
| `ALCHEMY_OWNER` | no | `vitalik.eth` |
| `ALCHEMY_PAGE_SIZE` | no | `3` |
| `ALCHEMY_WITH_METADATA` | no | `true` |

Help text and `.env.example` show one sample request (that owner address, page size `100`, `withMetadata=true`). They are sample values. Omitting `ALCHEMY_OWNER` or `ALCHEMY_PAGE_SIZE` still uses `vitalik.eth` and `3`. An empty string for either of those two also uses the default, because the script applies `||`.

`npm start` and `node demo-script.js` do the same thing. `npm test` is `node demo-script.js --help`: it prints usage and exits 0. It does not call Alchemy and does not require a key. `--help` is recognized anywhere in `process.argv`, after `dotenv.config()` runs.

Copying `.env.example` and filling in a real key produces this owner query:

```text
GET /nft/v3/<key>/getNFTsForOwner?owner=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&withMetadata=true&pageSize=100
```

With only `ALCHEMY_API_KEY` set, the same call is:

```text
GET /nft/v3/<key>/getNFTsForOwner?owner=vitalik.eth&withMetadata=true&pageSize=3
```

## `ALCHEMY_WITH_METADATA`

`parseBoolean` returns the default only when the variable is `undefined`. Any set value is true only when `trim().toLowerCase()` is exactly `true`.

| Value | Sent as |
| --- | --- |
| unset | `withMetadata=true` |
| `true`, `TRUE`, ` true ` | `withMetadata=true` |
| `false`, `1`, `yes`, `""`, other text | `withMetadata=false` |

The flag is sent only on `getNFTsForOwner`. `false` is still sent; empty query values are dropped, and the boolean `false` stringifies to `"false"`, which is kept. The script then still calls `getNFTMetadata` for the first NFT when `contract.address` and `tokenId` are both truthy. List printing uses the same fallbacks either way. When the owner response omits name or image fields, those lines print `unavailable`.

There is no `ALCHEMY_PAGE_KEY`. A returned `pageKey` is printed and left unused. The next run sends `owner`, `withMetadata`, and `pageSize` again.

## What a run does

1. Load `.env` from the current working directory.
2. Exit 0 when `--help` is present.
3. Read the four variables above. A missing key prints the two error lines in the exit table and exits 1.
4. Log the redacted base URL, the owner and page size, and an equivalent-request line.
5. `GET .../getNFTsForOwner` with `owner`, `withMetadata`, and `pageSize`, in that order.
6. Print `totalCount`, then either `Pagination key returned: ...` or `No pagination key returned for this page.`
7. Print one block per `ownedNfts` entry.
8. When the first item has a truthy `contract.address` and a truthy `tokenId`, `GET .../getNFTMetadata?contractAddress=<address>&tokenId=<id>` and, when that item’s own `tokenType` is non-empty, `&tokenType=<tokenType>`.
9. Print the metadata summary. A non-OK response throws. The catch prints `Request failed.` plus `error.message` and exits 1.

Query values that are `undefined`, `null`, or `""` are omitted. Every other value is stringified, including `0` and `NaN`.

The equivalent-request line interpolates the three values as a path and leaves the owner raw. The real request uses `URLSearchParams`, which encodes the owner. An owner value `a b&c` is logged as `owner=a b&c&withMetadata=true&pageSize=3` and requested as `owner=a+b%26c&withMetadata=true&pageSize=3`.

Example metadata request when the first NFT has top-level `tokenType`:

```text
GET /nft/v3/<redacted-key>/getNFTMetadata?contractAddress=0xabc&tokenId=7&tokenType=ERC721
```

## Fields the script prints

`getNFTsForOwner` summary, per item:

| Line | Source |
| --- | --- |
| Contract | `contract.address`, else `unknown` |
| Token ID | `tokenId`, else `unknown` |
| Name | `name`, else `title`, else `unavailable` |
| Token type | `tokenType`, else `contract.tokenType`, else `unavailable` |
| Image | `image.originalUrl`, else `image.cachedUrl`, else `raw.metadata.image`, else `unavailable` |

`totalCount` is printed even when the property is missing (`undefined`). An empty or non-array `ownedNfts` prints `No NFTs were returned for this owner.` The metadata step still runs and, with no usable first NFT, also prints `Skipping metadata lookup because the first NFT did not include a contract address and token ID.`

`getNFTMetadata` summary:

| Line | Source |
| --- | --- |
| Name | `name`, else `title`, else `unavailable` |
| Contract | `contract.address`, else `unknown` |
| Token ID | `tokenId`, else the id from the list item |
| Token type | `tokenType`, else `unavailable` |
| Token URI | `tokenUri`, else `raw.tokenUri`, else `unavailable` |
| Image URL | `image.originalUrl`, else `image.cachedUrl`, else `raw.metadata.image`, else `unavailable` |
| Last updated | `timeLastUpdated`, else `unavailable` |

The list printer can show `contract.tokenType` (for example `ERC1155`) while the metadata request sends the top-level `tokenType` only. When the top-level field is missing or `""`, `tokenType` is left off the metadata URL.

Image lines, the metadata token URI, and the metadata image URL go through `formatForDisplay`. Strings longer than 120 characters are cut to 120 characters and suffixed with `...`. Non-strings are `JSON.stringify`’d first (`{"nested":true}`). Name, contract, token id, token type, and last-updated lines are printed in full. A `JSON.stringify` throw fails the run with `Request failed.`

## Exit codes

| Situation | Code | What you see |
| --- | --- | --- |
| `--help` / `npm test` | 0 | Help text. No request. |
| Successful run | 0 | Redacted base URL, equivalent-request line, then summaries. |
| `ALCHEMY_API_KEY` missing | 1 | `Missing ALCHEMY_API_KEY.` and a second line that always names `/workspace/alchemy-nft-api`, whatever the real checkout path is. |
| Response not OK | 1 | `Request failed.` then `Alchemy request failed (<status> <statusText>): <body>`. The response body is not redacted. |

Non-HTTP failures print `error.message` with no extra redaction. The key can still appear in a response body.

## Pitfalls

- **Working directory.** `node alchemy-nft-api/demo-script.js` from the repo root loads `<repo>/.env`. The demo’s own `.env` is read only when the current directory is `alchemy-nft-api`. `cd alchemy-nft-api` first, or export the variables yourself.
- **Existing environment wins by default.** `dotenv.config()` does not pass `override: true`. A key or owner already exported in the shell is kept. The log `◇ injected env (N) from .env` counts keys actually written. A missing `.env` still prints `◇ injected env (0) from .env`; the script ignores dotenv’s error and continues. `DOTENV_OVERRIDE=true` or `DOTENV_CONFIG_OVERRIDE=true` overwrites the shell, because this script does not pass `override: false`.
- **`pageSize` is not validated.** `""` falls back to `3`. The string `"0"` is sent as `pageSize=0`. `3abc` becomes `3` (`parseInt` base 10). `abc` becomes the query value `NaN`, and the log says `Fetching up to NaN`.
- **`withMetadata` is stricter than the other optional variables.** An empty `ALCHEMY_WITH_METADATA` is `""`, which parses to `false`. It does not fall back to `true`. `1` and `yes` also send `false`.
- **Falsy token id.** The metadata guard and the list printer both treat a falsy `tokenId` as missing. Numeric `0` prints `unknown` and skips metadata. The string `"0"` is requested.
- **One page, one metadata lookup.** Changing owner, page size, or `withMetadata` means editing the environment and running again. The script does not walk `pageKey` and does not request metadata for later NFTs.
- **Key placement.** The key is part of the URL. Keep it in `.env` or the environment. `.env.example` is a placeholder.
