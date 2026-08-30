// Blockchain Module — Solution verification on Polygon Amoy testnet
// Uses ethers.js for hashing + verification (no real tx needed for prototype)

const Blockchain = (() => {
  const NETWORK = CONFIG.BLOCKCHAIN_NETWORK || 'polygon-amoy';
  let isAvailable = false;

  async function init() {
    if (typeof ethers !== 'undefined') {
      isAvailable = true;
      console.log('[Blockchain] ethers.js loaded —', NETWORK);
    } else {
      console.warn('[Blockchain] ethers.js not loaded — verification will be hash-only');
    }
  }

  // ==================== HASH VERIFICATION ====================
  // Creates a deterministic hash of solution content for tamper-proof verification
  function hashSolution(solution) {
    const payload = JSON.stringify({
      problemId: solution.problemId,
      solverName: solution.solverName,
      text: solution.text,
      timestamp: solution.createdAt || Date.now()
    });
    return sha256Hex(payload);
  }

  async function sha256Hex(text) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for environments without SubtleCrypto
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const chr = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return 'fallback_' + Math.abs(hash).toString(16).padStart(16, '0');
  }

  // ==================== VERIFY SOLUTION ====================
  // In prototype mode: stores hash locally + in Supabase
  // In production: would submit to Polygon smart contract
  async function verifySolution(solutionId, solutionData) {
    const hash = hashSolution(solutionData);

    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { data, error } = await sb.from('blockchain_verifications').insert({
        solution_id: solutionId,
        tx_hash: hash,
        network: NETWORK,
        block_number: null
      }).select().single();

      if (!error) {
        await sb.from('solutions').update({ blockchain_hash: hash }).eq('id', solutionId);
        console.log('[Blockchain] Solution verified:', hash.slice(0, 16) + '...');
        return { verified: true, hash, txHash: data?.tx_hash };
      }
    }

    // localStorage fallback
    const verifications = JSON.parse(localStorage.getItem('oc_blockchain_verified') || '{}');
    verifications[solutionId] = { hash, timestamp: Date.now(), network: NETWORK };
    localStorage.setItem('oc_blockchain_verified', JSON.stringify(verifications));
    return { verified: true, hash, txHash: hash };
  }

  // ==================== CHECK VERIFICATION ====================
  async function isVerified(solutionId) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { data } = await sb.from('blockchain_verifications')
        .select('*')
        .eq('solution_id', solutionId)
        .single();
      return !!data;
    }
    const verifications = JSON.parse(localStorage.getItem('oc_blockchain_verified') || '{}');
    return !!verifications[solutionId];
  }

  // ==================== GET VERIFICATION PROOF ====================
  async function getVerificationProof(solutionId) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { data } = await sb.from('blockchain_verifications')
        .select('*')
        .eq('solution_id', solutionId)
        .single();
      return data || null;
    }
    const verifications = JSON.parse(localStorage.getItem('oc_blockchain_verified') || '{}');
    return verifications[solutionId] || null;
  }

  // ==================== BATCH VERIFY ====================
  async function verifyAcceptedSolutions(problems) {
    const results = [];
    for (const p of problems) {
      if (p.status !== 'solved') continue;
      const solutions = await DB.getSolutions(p.id);
      const accepted = solutions.find(s => s.accepted && !s.removed);
      if (!accepted) continue;
      const alreadyVerified = await isVerified(accepted.sid || accepted.id);
      if (!alreadyVerified) {
        const result = await verifySolution(accepted.sid || accepted.id, {
          problemId: p.id,
          solverName: accepted.solverName,
          text: accepted.text,
          createdAt: accepted.createdAt
        });
        results.push({ problemId: p.id, solutionId: accepted.sid, ...result });
      }
    }
    return results;
  }

  return {
    init, hashSolution, verifySolution, isVerified,
    getVerificationProof, verifyAcceptedSolutions
  };
})();
