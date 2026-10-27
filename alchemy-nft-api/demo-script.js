const dotenv = require("dotenv");

dotenv.config();

const HELP_TEXT = `
Alchemy NFT API demo

Before you run this script, please create a .env file in this folder with:
ALCHEMY_API_KEY=<my-key>

Optional overrides:
ALCHEMY_OWNER=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
ALCHEMY_PAGE_SIZE=100
ALCHEMY_WITH_METADATA=true
ALCHEMY_DISPLAY_LIMIT=10
`;

if (process.argv.includes("--help")) {
  console.log(HELP_TEXT.trim());
  process.exit(0);
}

const apiKey = process.env.ALCHEMY_API_KEY;
const owner = process.env.ALCHEMY_OWNER || "vitalik.eth";
const pageSize = parsePositiveInteger(process.env.ALCHEMY_PAGE_SIZE, 3);
const withMetadata = parseBoolean(process.env.ALCHEMY_WITH_METADATA, true);
const displayLimit = parseNonNegativeInteger(process.env.ALCHEMY_DISPLAY_LIMIT, 10);

if (!apiKey) {
  console.error("Missing ALCHEMY_API_KEY.");
  console.error(
    "Please create a .env file in /workspace/alchemy-nft-api with ALCHEMY_API_KEY=<my-key> before running this script."
  );
  process.exit(1);
}

const baseUrl = `https://eth-mainnet.g.alchemy.com/nft/v3/${apiKey}`;

function parseBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  return value.trim().toLowerCase() === "true";
}

function parsePositiveInteger(value, defaultValue) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseNonNegativeInteger(value, defaultValue) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
}

async function fetchJson(path, query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const url = `${baseUrl}/${path}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Alchemy request failed (${response.status} ${response.statusText}): ${body}`);
  }

  return response.json();
}

function printOwnedNftSummary(nfts, maxToDisplay) {
  if (!Array.isArray(nfts) || nfts.length === 0) {
    console.log("No NFTs were returned for this owner.");
    return;
  }

  const displayCount = Math.min(nfts.length, maxToDisplay);
  console.log(`Displaying ${displayCount} of ${nfts.length} NFTs returned in this page.`);

  for (const [index, nft] of nfts.slice(0, displayCount).entries()) {
    console.log(`\nNFT ${index + 1}`);
    console.log(`- Contract: ${nft.contract?.address || "unknown"}`);
    console.log(`- Token ID: ${nft.tokenId || "unknown"}`);
    console.log(`- Name: ${nft.name || nft.title || "unavailable"}`);
    console.log(`- Token type: ${nft.tokenType || nft.contract?.tokenType || "unavailable"}`);
    console.log(
      `- Image: ${formatForDisplay(
        nft.image?.originalUrl || nft.image?.cachedUrl || nft.raw?.metadata?.image || "unavailable"
      )}`
    );
  }

  if (nfts.length > displayCount) {
    console.log(`\n...${nfts.length - displayCount} more NFTs omitted from console output.`);
  }
}

function formatForDisplay(value, maxLength = 120) {
  if (value === undefined || value === null) {
    return "unavailable";
  }

  const stringValue = typeof value === "string" ? value : JSON.stringify(value);

  if (stringValue.length <= maxLength) {
    return stringValue;
  }

  return `${stringValue.slice(0, maxLength)}...`;
}

async function main() {
  console.log(`Using NFT API base URL: https://eth-mainnet.g.alchemy.com/nft/v3/<redacted-key>`);
  console.log(`Fetching up to ${pageSize} NFTs for owner: ${owner}`);
  console.log(`Displaying up to ${displayLimit} NFT summaries in the console.`);
  console.log(
    `Equivalent request: /getNFTsForOwner?owner=${owner}&withMetadata=${withMetadata}&pageSize=${pageSize}`
  );

  const ownedNftsResponse = await fetchJson("getNFTsForOwner", {
    owner,
    withMetadata,
    pageSize,
  });

  console.log(`\nTotal NFTs reported by Alchemy: ${ownedNftsResponse.totalCount}`);
  if (ownedNftsResponse.pageKey) {
    console.log(`Pagination key returned: ${ownedNftsResponse.pageKey}`);
  } else {
    console.log("No pagination key returned for this page.");
  }

  printOwnedNftSummary(ownedNftsResponse.ownedNfts, displayLimit);

  const firstNft = ownedNftsResponse.ownedNfts?.[0];
  if (!firstNft?.contract?.address || !firstNft?.tokenId) {
    console.log("\nSkipping metadata lookup because the first NFT did not include a contract address and token ID.");
    return;
  }

  console.log("\nFetching metadata for the first returned NFT...");
  const metadataResponse = await fetchJson("getNFTMetadata", {
    contractAddress: firstNft.contract.address,
    tokenId: firstNft.tokenId,
    tokenType: firstNft.tokenType,
  });

  console.log("\nMetadata response summary");
  console.log(`- Name: ${metadataResponse.name || metadataResponse.title || "unavailable"}`);
  console.log(`- Contract: ${metadataResponse.contract?.address || "unknown"}`);
  console.log(`- Token ID: ${metadataResponse.tokenId || firstNft.tokenId}`);
  console.log(`- Token type: ${metadataResponse.tokenType || "unavailable"}`);
  console.log(`- Token URI: ${formatForDisplay(metadataResponse.tokenUri || metadataResponse.raw?.tokenUri)}`);
  console.log(
    `- Image URL: ${
      formatForDisplay(
        metadataResponse.image?.originalUrl ||
          metadataResponse.image?.cachedUrl ||
          metadataResponse.raw?.metadata?.image
      )
    }`
  );
  console.log(`- Last updated: ${metadataResponse.timeLastUpdated || "unavailable"}`);
}

main().catch((error) => {
  console.error("\nRequest failed.");
  console.error(error.message);
  process.exit(1);
});
