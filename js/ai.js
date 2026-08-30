// AI Module — Enhanced AI features for OPENCASE
// Supports: draft generation, semantic matching, categorization, solver-case matching
// Uses free tiers: Gemini (Google) or browser-native fallback

const AI = (() => {
  const GEMINI_KEY = ''; // User provides in settings
  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  let provider = CONFIG.AI_PROVIDER || 'auto';

  // ==================== DRAFT SOLUTION ====================
  async function draftSolution(problem) {
    const prompt = buildDraftPrompt(problem);
    try {
      const text = await callAI(prompt, 800);
      return { text, aiAssisted: true, provider: 'ai' };
    } catch (e) {
      console.warn('[AI] Draft failed, using fallback:', e.message);
      return { text: draftFallback(problem), aiAssisted: false, provider: 'fallback' };
    }
  }

  // ==================== SEMANTIC MATCHING ====================
  async function findSimilarSolved(newProblem, solvedProblems) {
    if (!solvedProblems.length) return [];
    const prompt = `You are a problem-matching engine. Given a new problem and a list of solved problems, rank the solved problems by relevance (0-100 score). Return ONLY a JSON array of objects with "id" and "score" keys, sorted by score descending. Return at most 3 matches with score >= 30.

NEW PROBLEM:
Title: ${newProblem.title}
Category: ${newProblem.category}
Description: ${newProblem.description}

SOLVED PROBLEMS:
${solvedProblems.map(p => `[ID:${p.id}] ${p.title} (${p.category}): ${p.description?.slice(0, 120)}`).join('\n')}

Return JSON only, no explanation.`;

    try {
      const response = await callAI(prompt, 400);
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn('[AI] Semantic match failed, using keyword fallback');
    }
    return keywordMatch(newProblem, solvedProblems);
  }

  function keywordMatch(newProblem, solvedProblems) {
    const words = (newProblem.title + ' ' + newProblem.description).toLowerCase().split(/\W+/).filter(w => w.length > 3);
    return solvedProblems.map(p => {
      const hay = (p.title + ' ' + p.description).toLowerCase();
      const score = words.filter(w => hay.includes(w)).length / words.length * 100;
      return { id: p.id, score: Math.round(score) };
    }).filter(m => m.score >= 20).sort((a, b) => b.score - a.score).slice(0, 3);
  }

  // ==================== AUTO-CATEGORIZE ====================
  async function categorizeProblem(title, description) {
    const prompt = `Categorize this problem into exactly one category. Return ONLY the category name, nothing else.

Categories: Civic / Local, Business / Operations, Technical, Personal, Healthcare, Education, Environment, Other

Problem: ${title}
Description: ${description?.slice(0, 200)}

Category:`;

    try {
      const result = await callAI(prompt, 50);
      const categories = ['Civic / Local', 'Business / Operations', 'Technical', 'Personal', 'Healthcare', 'Education', 'Environment', 'Other'];
      const match = categories.find(c => result.toLowerCase().includes(c.toLowerCase()));
      return match || 'Other';
    } catch {
      return 'Other';
    }
  }

  // ==================== SOLVER-CASE MATCHING ====================
  async function matchSolversToCase(problem, solverProfiles) {
    if (!solverProfiles.length) return [];
    const prompt = `Match solvers to a problem based on their skills and the problem requirements. Return a JSON array of objects with "solver_id" and "match_score" (0-100), sorted by score descending. Return at most 5 matches.

PROBLEM:
Title: ${problem.title}
Category: ${problem.category}
Description: ${problem.description?.slice(0, 200)}

AVAILABLE SOLVERS:
${solverProfiles.map(s => `[ID:${s.id}] ${s.display_name} - Skills: ${s.skills?.join(', ') || 'none'}`).join('\n')}

Return JSON only.`;

    try {
      const response = await callAI(prompt, 400);
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn('[AI] Solver matching failed');
    }
    return solverProfiles.map(s => ({ solver_id: s.id, match_score: 50 }));
  }

  // ==================== QUALITY SCORING ====================
  async function scoreSolutionQuality(solutionText, problem) {
    const prompt = `Score this solution from 1-10 based on: specificity, actionability, completeness, and practicality. Return ONLY the number.

Problem: ${problem.title} - ${problem.description?.slice(0, 150)}
Solution: ${solutionText?.slice(0, 300)}

Score (1-10):`;

    try {
      const result = await callAI(prompt, 20);
      const num = parseInt(result.match(/\d+/)?.[0]);
      return (num >= 1 && num <= 10) ? num : 5;
    } catch {
      return 5;
    }
  }

  // ==================== AI CORE ====================
  async function callAI(prompt, maxTokens = 500) {
    if (GEMINI_KEY) {
      return callGemini(prompt, maxTokens);
    }
    if (typeof CONFIG.SUPABASE_URL !== 'undefined' && SupabaseClient.available()) {
      return callViaEdgeFunction(prompt, maxTokens);
    }
    throw new Error('No AI provider configured');
  }

  async function callGemini(prompt, maxTokens) {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
      })
    });
    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  async function callViaEdgeFunction(prompt, maxTokens) {
    const sb = SupabaseClient.getClient();
    const { data, error } = await sb.functions.invoke('ai-proxy', {
      body: { prompt, max_tokens: maxTokens }
    });
    if (error) throw error;
    return data?.text || '';
  }

  // ==================== PROMPTS ====================
  function buildDraftPrompt(problem) {
    return `You are an expert problem-solver on a public marketplace. A community member filed this real-world problem:

Title: ${problem.title}
Category: ${problem.category}
Description: ${problem.description}

Draft a concrete, actionable solution. Be specific — include steps, tools, resources, or frameworks where applicable. Keep it under 200 words. No preamble, just the solution.`;
  }

  function draftFallback(problem) {
    return [
      `Proposed approach for "${problem.title}" (${problem.category}):`,
      ``,
      `1. Scope — Reproduce or observe the problem once end-to-end and write down exactly where it breaks and who is affected.`,
      `2. Quick win — Identify the cheapest change that reduces the pain this week, even partially.`,
      `3. Root fix — Based on what the quick win reveals, propose the durable fix: process change, tooling, or escalation to the right owner.`,
      `4. Verification — Define how we'll know it worked (metric, checklist, or before/after comparison).`,
      ``,
      `Original context: ${(problem.description || '').slice(0, 140)}`
    ].join('\n');
  }

  // ==================== SETTINGS ====================
  function setProvider(p) { provider = p; }
  function setGeminiKey(key) { GEMINI_KEY = key; }
  function getProvider() { return GEMINI_KEY ? 'gemini' : 'fallback'; }

  return {
    draftSolution, findSimilarSolved, categorizeProblem,
    matchSolversToCase, scoreSolutionQuality,
    setProvider, setGeminiKey, getProvider, draftFallback
  };
})();
