// Blockchain Module — Solution verification on Polygon Amoy testnet
// Calls Supabase Edge Function which signs and sends txs server-side
// Fallback: local SHA-256 hash if Edge Function unavailable

const Blockchain = (() => {
  const NETWORK = CONFIG.BLOCKCHAIN_NETWORK || 'polygon-amoy';
  let isAvailable = false;

  async function init() {
    if (typeof ethers !== 'undefined') {
      isAvailable = true;
      console.log('[Blockchain] ethers.js loaded —', NETWORK);
    } else {
      console.warn('[Blockchain] ethers.js not loaded — using hash-only verification');
    }
  }

  // ==================== HASH ====================
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
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const chr = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return 'fallback_' + Math.abs(hash).toString(16).padStart(16, '0');
  }

  // ==================== VERIFY VIA EDGE FUNCTION ====================
  async function verifySolution(solutionId, solutionData) {
    const hash = hashSolution(solutionData);

    // Try Edge Function first (real on-chain tx)
    if (SupabaseClient.available() && typeof supabase !== 'undefined') {
      try {
        const sb = SupabaseClient.getClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
          console.warn('[Blockchain] No auth session — falling back to hash-only');
          return await hashOnlyVerify(solutionId, hash);
        }

        const response = await sb.functions.invoke('verify-solution', {
          body: {
            action: 'verify',
            solutionId: solutionId,
            solutionHash: '0x' + hash
          }
        });

        if (response.error) throw response.error;
        if (response.data?.success) {
          console.log('[Blockchain] On-chain verified:', response.data.explorerUrl);
          return {
            verified: true,
            hash,
            txHash: response.data.txHash,
            blockNumber: response.data.blockNumber,
            explorerUrl: response.data.explorerUrl,
            onChain: true
          };
        }
      } catch (e) {
        console.warn('[Blockchain] Edge Function call failed:', e.message || e);
      }
    }

    // Fallback: hash-only verification
    return await hashOnlyVerify(solutionId, hash);
  }

  async function hashOnlyVerify(solutionId, hash) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { error } = await sb.from('blockchain_verifications').insert({
        solution_id: solutionId,
        tx_hash: hash,
        network: NETWORK,
        block_number: null
      });
      if (!error) {
        await sb.from('solutions').update({ blockchain_hash: hash }).eq('id', solutionId);
      }
    } else {
      const verifications = JSON.parse(localStorage.getItem('oc_blockchain_verified') || '{}');
      verifications[solutionId] = { hash, timestamp: Date.now(), network: NETWORK };
      localStorage.setItem('oc_blockchain_verified', JSON.stringify(verifications));
    }
    return { verified: true, hash, txHash: hash, onChain: false };
  }

  // ==================== CHECK VERIFICATION ====================
  async function isVerified(solutionId) {
    // Try Edge Function check first
    if (SupabaseClient.available() && typeof supabase !== 'undefined') {
      try {
        const sb = SupabaseClient.getClient();
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
          const response = await sb.functions.invoke('verify-solution', {
            body: { action: 'check', solutionId }
          });
          if (response.data?.exists) return true;
        }
      } catch (e) { /* fall through */ }
    }

    // Fallback: check database
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

  // ==================== GET PROOF ====================
  async function getVerificationProof(solutionId) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { data } = await sb.from('blockchain_verifications')
        .select('*')
        .eq('solution_id', solutionId)
        .single();
      if (data) {
        return {
          ...data,
          explorerUrl: data.tx_hash && data.tx_hash.startsWith('0x') && data.tx_hash.length === 64
            ? `https://amoy.polygonscan.com/tx/${data.tx_hash}`
            : null
        };
      }
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
