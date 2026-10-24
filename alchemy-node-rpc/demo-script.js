const dotenv = require("dotenv");

dotenv.config();

const HELP_TEXT = `
Alchemy Ethereum JSON-RPC demo

Before you run this script, please create a .env file in this folder with:
ALCHEMY_API_KEY=<my-key>

Optional override:
ALCHEMY_WALLET_ADDRESS=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
`;

if (process.argv.includes("--help")) {
  console.log(HELP_TEXT.trim());
  process.exit(0);
}

const apiKey = process.env.ALCHEMY_API_KEY;
const walletAddress =
  process.env.ALCHEMY_WALLET_ADDRESS || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

if (!apiKey) {
  console.error("Missing ALCHEMY_API_KEY.");
  console.error(
    "Please create a .env file in /workspace/alchemy-node-rpc with ALCHEMY_API_KEY=<my-key> before running this script."
  );
  process.exit(1);
}

const baseUrl = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;

async function callRpc(method, params, id) {
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

function hexToDecimalString(hexValue) {
  return BigInt(hexValue).toString(10);
}

function formatWeiAsEth(hexWei) {
  const value = BigInt(hexWei);
  const whole = value / 10n ** 18n;
  const fraction = value % 10n ** 18n;

  if (fraction === 0n) {
    return whole.toString();
  }

  const paddedFraction = fraction.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole.toString()}.${paddedFraction}`;
}

async function main() {
  console.log("Using Ethereum Mainnet RPC URL: https://eth-mainnet.g.alchemy.com/v2/<redacted-key>");
  console.log(`Looking up balance for wallet: ${walletAddress}`);

  const latestBlockHex = await callRpc("eth_blockNumber", [], 1);
  const latestBlock = await callRpc("eth_getBlockByNumber", [latestBlockHex, false], 2);
  const walletBalanceWei = await callRpc("eth_getBalance", [walletAddress, "latest"], 3);

  console.log("\nLatest block");
  console.log(`- Block number (hex): ${latestBlockHex}`);
  console.log(`- Block number (decimal): ${hexToDecimalString(latestBlockHex)}`);
  console.log(`- Block hash: ${latestBlock.hash}`);
  console.log(`- Parent hash: ${latestBlock.parentHash}`);
  console.log(`- Timestamp (hex): ${latestBlock.timestamp}`);
  console.log(`- Transaction count: ${latestBlock.transactions?.length || 0}`);

  console.log("\nWallet balance");
  console.log(`- Address: ${walletAddress}`);
  console.log(`- Raw balance (wei, hex): ${walletBalanceWei}`);
  console.log(`- Balance (ETH): ${formatWeiAsEth(walletBalanceWei)}`);
}

main().catch((error) => {
  console.error("\nRequest failed.");
  console.error(error.message);
  process.exit(1);
});
