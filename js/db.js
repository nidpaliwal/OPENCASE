// Database Module — Supabase CRUD with localStorage fallback

const DB = (() => {
  // ==================== PROBLEMS ====================
  async function getProblems(filter = {}) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      let query = sb.from('problems').select('*');
      if (filter.status) query = query.eq('status', filter.status);
      if (filter.category) query = query.eq('category', filter.category);
      if (filter.flagged !== undefined) query = query.eq('flagged', filter.flagged);
      if (filter.postedBy) query = query.eq('posted_by_name', filter.postedBy);
      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) { console.error('[DB] getProblems error:', error); return []; }
      return data || [];
    }
    return JSON.parse(localStorage.getItem('oc_opencase_problems') || '[]');
  }

  async function getProblem(id) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { data } = await sb.from('problems').select('*').eq('id', id).single();
      return data;
    }
    const problems = JSON.parse(localStorage.getItem('oc_opencase_problems') || '[]');
    return problems.find(p => p.id === id);
  }

  async function createProblem(problem) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const user = Auth.getUser();
      const insertData = {
        title: problem.title,
        description: problem.description,
        category: problem.category,
        posted_by_name: problem.postedBy || 'Anonymous',
        featured: problem.featured || false,
        bounty: problem.bounty || 0,
        status: 'open'
      };
      if (user) insertData.posted_by = user.id;
      const { data, error } = await sb.from('problems').insert(insertData).select().single();
      if (error) { console.error('[DB] createProblem error:', error); return null; }
      await logActivity('created', 'problem', data.id, problem.postedBy, { title: problem.title });
      return data;
    }
    const problems = JSON.parse(localStorage.getItem('oc_opencase_problems') || '[]');
    const id = problems.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    const newProblem = { id, ...problem, status: 'open', createdAt: Date.now(), flagged: false };
    problems.push(newProblem);
    localStorage.setItem('oc_opencase_problems', JSON.stringify(problems));
    return newProblem;
  }

  async function updateProblem(id, updates) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { data } = await sb.from('problems').update(updates).eq('id', id).select().single();
      return data;
    }
    const problems = JSON.parse(localStorage.getItem('oc_opencase_problems') || '[]');
    const p = problems.find(x => x.id === id);
    if (p) Object.assign(p, updates);
    localStorage.setItem('oc_opencase_problems', JSON.stringify(problems));
    return p;
  }

  // ==================== SOLUTIONS ====================
  async function getSolutions(problemId) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { data } = await sb.from('solutions')
        .select('*')
        .eq('problem_id', problemId)
        .order('created_at', { ascending: true });
      return (data || []).map(s => ({
        ...s,
        sid: s.id,
        problem_id: s.problem_id,
        solverName: s.solver_name,
        aiAssisted: s.ai_assisted,
        createdAt: new Date(s.created_at).getTime()
      }));
    }
    return JSON.parse(localStorage.getItem('oc_opencase_solutions_' + problemId) || '[]');
  }

  async function createSolution(solution) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const user = Auth.getUser();
      const { data, error } = await sb.from('solutions').insert({
        problem_id: solution.problemId,
        solver_name: solution.solverName,
        text: solution.text,
        ai_assisted: solution.aiAssisted || false,
        solver_id: user?.id || null
      }).select().single();
      if (error) { console.error('[DB] createSolution error:', error); return null; }
      await logActivity('submitted', 'solution', data.id, solution.solverName, { problemId: solution.problemId });
      return data;
    }
    const solutions = JSON.parse(localStorage.getItem('oc_opencase_solutions_' + solution.problemId) || '[]');
    const newSol = {
      sid: Date.now(),
      solverName: solution.solverName,
      text: solution.text,
      aiAssisted: solution.aiAssisted || false,
      createdAt: Date.now(),
      accepted: false,
      flagged: false,
      removed: false
    };
    solutions.push(newSol);
    localStorage.setItem('oc_opencase_solutions_' + solution.problemId, JSON.stringify(solutions));
    return newSol;
  }

  async function acceptSolution(problemId, solutionId) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      await sb.from('solutions').update({ accepted: true }).eq('id', solutionId);
      await sb.from('problems').update({ status: 'solved' }).eq('id', problemId);
      const { data: sol } = await sb.from('solutions').select('solver_name, solver_id').eq('id', solutionId).single();
      if (sol) {
        await sb.from('solver_rankings').upsert({
          solver_id: sol.solver_id,
          solver_name: sol.solver_name,
          accepted_count: 1,
          total_solutions: 1
        }, { onConflict: 'solver_id', ignoreDuplicates: false });
        await sb.rpc('increment_solver_rank', { p_solver_id: sol.solver_id }).catch(() => {
          sb.from('solver_rankings').update({ accepted_count: sb.rpc ? undefined : 1 })
            .eq('solver_id', sol.solver_id);
        });
      }
      await logActivity('solved', 'problem', problemId, sol?.solver_name, { solutionId });
      return true;
    }
    const problems = JSON.parse(localStorage.getItem('oc_opencase_problems') || '[]');
    const p = problems.find(x => x.id === problemId);
    if (p) p.status = 'solved';
    localStorage.setItem('oc_opencase_problems', JSON.stringify(problems));
    const sols = JSON.parse(localStorage.getItem('oc_opencase_solutions_' + problemId) || '[]');
    const s = sols.find(x => x.sid === solutionId);
    if (s) s.accepted = true;
    localStorage.setItem('oc_opencase_solutions_' + problemId, JSON.stringify(sols));
    return true;
  }

  // ==================== SOLVERS ====================
  async function getSolverRankings() {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { data } = await sb.from('solver_rankings')
        .select('*')
        .order('accepted_count', { ascending: false });
      return (data || []).map(r => [r.solver_name, r.accepted_count]);
    }
    const solvers = JSON.parse(localStorage.getItem('oc_opencase_solvers') || '{}');
    return Object.entries(solvers).sort((a, b) => b[1] - a[1]);
  }

  // ==================== AI USAGE ====================
  async function getAiUsage(userId) {
    if (SupabaseClient.available() && userId) {
      const sb = SupabaseClient.getClient();
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await sb.from('ai_usage')
        .select('draft_count')
        .eq('user_id', userId)
        .eq('usage_date', today)
        .single();
      return data?.draft_count || 0;
    }
    const prefs = JSON.parse(localStorage.getItem('oc_opencase_prefs') || '{}');
    const today = new Date().toISOString().slice(0, 10);
    return prefs.aiUsage?.[today] || 0;
  }

  async function incrementAiUsage(userId) {
    if (SupabaseClient.available() && userId) {
      const sb = SupabaseClient.getClient();
      const today = new Date().toISOString().slice(0, 10);
      await sb.from('ai_usage').upsert({
        user_id: userId,
        usage_date: today,
        draft_count: (await getAiUsage(userId)) + 1
      }, { onConflict: 'user_id,usage_date' });
      return;
    }
    const prefs = JSON.parse(localStorage.getItem('oc_opencase_prefs') || '{}');
    const today = new Date().toISOString().slice(0, 10);
    if (!prefs.aiUsage) prefs.aiUsage = {};
    prefs.aiUsage[today] = (prefs.aiUsage[today] || 0) + 1;
    localStorage.setItem('oc_opencase_prefs', JSON.stringify(prefs));
  }

  // ==================== ACTIVITY LOG ====================
  async function logActivity(eventType, entityType, entityId, actorName, metadata = {}) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const user = Auth.getUser();
      await sb.from('activity_log').insert({
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        actor_name: actorName,
        actor_id: user?.id || null,
        metadata
      }).select();
    }
  }

  async function getActivity(limit = 20) {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { data } = await sb.from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      return (data || []).map(a => ({
        ...a,
        t: new Date(a.created_at).getTime(),
        x: `${a.entity_type === 'problem' ? fmtId(a.entity_id) : ''} ${a.event_type} by ${a.actor_name || 'unknown'}`,
        k: a.event_type === 'solved' ? 'ok' : ''
      }));
    }
    return [];
  }

  // ==================== STATS ====================
  async function getStats() {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const [problems, solvers] = await Promise.all([
        sb.from('problems').select('status, featured, bounty'),
        sb.from('solver_rankings').select('accepted_count')
      ]);
      const pList = problems.data || [];
      const sList = solvers.data || [];
      return {
        total: pList.length,
        open: pList.filter(p => p.status === 'open').length,
        solved: pList.filter(p => p.status === 'solved').length,
        flagged: pList.filter(p => p.flagged).length,
        solvers: sList.length,
        revenue: pList.filter(p => p.featured).length * CONFIG.FEATURED_FEE
          + pList.filter(p => p.status === 'solved' && p.bounty > 0).reduce((s, p) => s + p.bounty * CONFIG.TAKE_RATE, 0)
      };
    }
    return null;
  }

  // ==================== SEED ====================
  async function seedSampleData() {
    if (SupabaseClient.available()) {
      const sb = SupabaseClient.getClient();
      const { error } = await sb.rpc('seed_opencase_data');
      if (error) {
        console.warn('[DB] Seed RPC failed, using direct insert:', error.message);
        await seedDirect();
      }
      return;
    }
    await seedDirect();
  }

  async function seedDirect() {
    const problems = [
      { title: 'Neighborhood park lights out for weeks', description: 'Streetlights along the riverside park have been dark for three weeks. Residents avoid the path after sunset.', category: 'Civic / Local', postedBy: 'Priya', featured: false, bounty: 0 },
      { title: 'Family bakery drowning in order-tracking spreadsheets', description: '6-person bakery doing ~80 custom orders weekly. Orders get lost, ingredients run out mid-week.', category: 'Business / Operations', postedBy: 'Ravi', featured: true, bounty: 120 },
      { title: 'Apartment complex parking disputes', description: '40-unit building, 6 visitor spots, constant arguments. Need a fair rotation method.', category: 'Civic / Local', postedBy: 'Meera', featured: false, bounty: 25 }
    ];
    for (const p of problems) await createProblem(p);
  }

  return {
    getProblems, getProblem, createProblem, updateProblem,
    getSolutions, createSolution, acceptSolution,
    getSolverRankings, getAiUsage, incrementAiUsage,
    logActivity, getActivity, getStats, seedSampleData
  };
})();
