const dotenv = require("dotenv");

dotenv.config();

const HELP_TEXT = `
Alchemy Token API demo

Before you run this script, please create a .env file in this folder with:
ALCHEMY_API_KEY=<my-key>

Optional overrides:
ALCHEMY_OWNER_ADDRESS=0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be
ALCHEMY_TOKEN_ADDRESS=0x607f4c5bb672230e8672085532f7e901544a7375
`;

if (process.argv.includes("--help")) {
  console.log(HELP_TEXT.trim());
  process.exit(0);
}

const apiKey = process.env.ALCHEMY_API_KEY;
const ownerAddress =
  process.env.ALCHEMY_OWNER_ADDRESS || "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be";
const tokenAddress =
  process.env.ALCHEMY_TOKEN_ADDRESS || "0x607f4c5bb672230e8672085532f7e901544a7375";

if (!apiKey) {
  console.error("Missing ALCHEMY_API_KEY.");
  console.error(
    "Please create a .env file in /workspace/alchemy-token-api with ALCHEMY_API_KEY=<my-key> before running this script."
  );
  process.exit(1);
}

const baseUrl = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;

async function callAlchemyRpc(method, params, id) {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Alchemy request failed (${response.status} ${response.statusText}): ${body}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(`Alchemy RPC error for ${method}: ${payload.error.message}`);
  }

  return payload.result;
}

function formatUnits(hexBalance, decimals = 0) {
  if (!hexBalance || hexBalance === "0x" || hexBalance === "0x0") {
    return "0";
  }

  const value = BigInt(hexBalance);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const paddedFraction = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${paddedFraction}`;
}

function formatForDisplay(value, maxLength = 120) {
  if (value === undefined || value === null || value === "") {
    return "unavailable";
  }

  const stringValue = typeof value === "string" ? value : JSON.stringify(value);
  if (stringValue.length <= maxLength) {
    return stringValue;
  }

  return `${stringValue.slice(0, maxLength)}...`;
}

async function main() {
  console.log("Using Token API base URL: https://eth-mainnet.g.alchemy.com/v2/<redacted-key>");
  console.log(`Looking up token balances for owner: ${ownerAddress}`);
  console.log(`Looking up token metadata for contract: ${tokenAddress}`);

  const balanceResult = await callAlchemyRpc(
    "alchemy_getTokenBalances",
    [ownerAddress, [tokenAddress]],
    1
  );

  const metadataResult = await callAlchemyRpc("alchemy_getTokenMetadata", [tokenAddress], 2);

  const tokenBalanceEntry = balanceResult.tokenBalances?.[0];
  const rawHexBalance = tokenBalanceEntry?.tokenBalance || "0x0";
  const decimals = metadataResult.decimals ?? 0;
  const formattedBalance = formatUnits(rawHexBalance, decimals);

  console.log("\nToken balance response");
  console.log(`- Owner: ${balanceResult.address}`);
  console.log(`- Contract: ${tokenBalanceEntry?.contractAddress || tokenAddress}`);
  console.log(`- Raw balance (hex): ${rawHexBalance}`);
  console.log(`- Balance error: ${tokenBalanceEntry?.error || "none"}`);

  console.log("\nToken metadata response");
  console.log(`- Name: ${metadataResult.name || "unavailable"}`);
  console.log(`- Symbol: ${metadataResult.symbol || "unavailable"}`);
  console.log(`- Decimals: ${decimals}`);
  console.log(`- Logo: ${formatForDisplay(metadataResult.logo)}`);

  console.log("\nCombined human-readable summary");
  console.log(`- Formatted balance: ${formattedBalance} ${metadataResult.symbol || ""}`.trim());
}

main().catch((error) => {
  console.error("\nRequest failed.");
  console.error(error.message);
  process.exit(1);
});
