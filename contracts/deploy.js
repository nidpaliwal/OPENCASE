// Deploy OpenCaseVerifier to Polygon Amoy testnet
// Usage: WALLET_PRIVATE_KEY=<key> npx hardhat run deploy.js --network amoy

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const provider = new ethers.JsonRpcProvider("https://rpc-amoy.polygon.technology");

  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Set WALLET_PRIVATE_KEY environment variable");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("Deploying from:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "POL");

  if (balance === 0n) {
    console.error("Insufficient balance. Get testnet POL from https://faucet.polygon.technology");
    process.exit(1);
  }

  // Read compiled contract
  const artifactPath = path.join(__dirname, "artifacts", "OpenCaseVerifier.sol", "OpenCaseVerifier.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("Contract not compiled. Run: npx hardhat compile");
    process.exit(1);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n=== DEPLOYED ===");
  console.log("Contract address:", address);
  console.log("Explorer:", `https://amoy.polygonscan.com/address/${address}`);
  console.log("\nNext steps:");
  console.log("1. Copy the contract address into js/config.js → BLOCKCHAIN_CONTRACT_ADDRESS");
  console.log("2. Deploy the Supabase Edge Function");
  console.log("3. Set WALLET_PRIVATE_KEY in Supabase secrets");

  // Save deployment info
  const deployment = {
    network: "polygon-amoy",
    chainId: 80002,
    contractAddress: address,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
    explorer: `https://amoy.polygonscan.com/address/${address}`
  };
  fs.writeFileSync(
    path.join(__dirname, "deployment.json"),
    JSON.stringify(deployment, null, 2)
  );
  console.log("\nDeployment info saved to contracts/deployment.json");
}

main().catch(console.error);
