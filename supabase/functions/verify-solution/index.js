// Supabase Edge Function: verify-solution
// Signs and submits a verification transaction to Polygon Amoy
// Deployed via: supabase functions deploy verify-solution
// Secrets: supabase secrets set WALLET_PRIVATE_KEY=<key>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONTRACT_ADDRESS = Deno.env.get("BLOCKCHAIN_CONTRACT_ADDRESS") || "";
const RPC_URL = "https://rpc-amoy.polygon.technology";
const EXPLORER_BASE = "https://amoy.polygonscan.com/tx/";

const CONTRACT_ABI = [
  "function verifySolution(uint256 solutionId, bytes32 solutionHash) external",
  "function getVerification(uint256 solutionId) view returns (bool exists, bytes32 solutionHash, uint256 timestamp)",
  "function getVerificationCount() view returns (uint256)",
  "event SolutionVerified(uint256 indexed solutionId, bytes32 indexed solutionHash, address indexed verifier, uint256 timestamp)"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { action, solutionId, solutionHash } = await req.json();

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Wallet setup
    const privateKey = Deno.env.get("WALLET_PRIVATE_KEY");
    if (!privateKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    if (!CONTRACT_ADDRESS) {
      return new Response(JSON.stringify({ error: "Contract not deployed" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

    if (action === "verify") {
      // Record solution hash on-chain
      const tx = await contract.verifySolution(
        BigInt(solutionId),
        solutionHash
      );
      const receipt = await tx.wait();

      // Save to database
      const sb = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      await sb.from("blockchain_verifications").insert({
        solution_id: solutionId,
        tx_hash: receipt.hash,
        block_number: Number(receipt.blockNumber),
        network: "polygon-amoy",
      });

      await sb.from("solutions").update({ blockchain_hash: receipt.hash }).eq("id", solutionId);

      return new Response(JSON.stringify({
        success: true,
        txHash: receipt.hash,
        blockNumber: Number(receipt.blockNumber),
        explorerUrl: `${EXPLORER_BASE}${receipt.hash}`,
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (action === "check") {
      const [exists, hash, timestamp] = await contract.getVerification(BigInt(solutionId));
      return new Response(JSON.stringify({
        exists,
        hash: exists ? hash : null,
        timestamp: exists ? Number(timestamp) : null,
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (action === "count") {
      const count = await contract.getVerificationCount();
      return new Response(JSON.stringify({ count: Number(count) }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Edge Function error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
