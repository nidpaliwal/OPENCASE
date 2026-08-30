// OPENCASE App — Main application logic
// Modular version using Supabase backend, AI, and Blockchain

let problems = [];
let solvers = {};
let prefs = { solverName: '', posterName: '', aiUsage: {}, premium: false, subsCount: 0 };
let adminOk = false;
let caseFilter = 'all';
let activeScreen = 'home';
let adminTab = 'dash';

const $ = (id) => document.getElementById(id);

function showToast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.innerHTML = (err ? '<b>!</b>' : '<b>&check;</b>') + '<span>' + msg + '</span>';
  $('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, 3400);
}

function flash(el) {
  if (!el) return;
  el.classList.remove('fadein');
  void el.offsetWidth;
  el.classList.add('fadein');
}

function fmtId(id) { return 'CASE-' + String(id).padStart(4, '0'); }
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function esc(str) {
  const d = document.createElement('div'); d.textContent = str == null ? '' : String(str);
  return d.innerHTML.replace(/"/g, '&quot;');
}
function tr(str, n) { str = str || ''; return str.length > n ? str.slice(0, n - 1) + '…' : str; }
function money(n) { return '$' + Math.round(n || 0); }
function todayKey() { return new Date().toISOString().slice(0, 10); }

// ==================== SCREEN NAVIGATION ====================
function showScreen(name) {
  activeScreen = name;
  ['home', 'public', 'solver', 'admin'].forEach(s => {
    $('scr-' + s).classList.toggle('hidden', s !== name);
  });
  flash($('scr-' + name));
  if (name === 'home') updateCounts();
  if (name === 'public') { $('postName').value = prefs.posterName || ''; renderMinePrompt(); renderArchive(); }
  if (name === 'solver') { $('solverNameInput').value = prefs.solverName || ''; renderSolve(); renderFolio(); renderRanks(); }
  if (name === 'admin') {
    $('adminGate').classList.toggle('hidden', adminOk);
    $('adminShell').classList.toggle('hidden', !adminOk);
    if (adminOk) renderAdmin();
  }
  window.scrollTo(0, 0);
}

function bindTabs(attr, cb) {
  document.querySelectorAll('[' + attr + ']').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[' + attr + ']').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cb(btn.getAttribute(attr));
    });
  });
}

// ==================== AUTH UI ====================
function updateCounts() {
  const open = problems.filter(p => p.status === 'open' && !p.flagged).length;
  $('homeOpen').textContent = open;
  $('hsTotal').textContent = problems.filter(p => p.status !== 'removed').length;
  $('hsSolved').textContent = problems.filter(p => p.status === 'solved').length;
  $('hsSolvers').textContent = Object.keys(solvers).length;
  $('hsSubs').textContent = prefs.subsCount || 0;
}

function showAuthModal(mode) {
  const modal = $('authModal');
  modal.classList.remove('hidden');
  $('authTitle').textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
  $('authSubmitBtn').textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
  $('authSwitch').innerHTML = mode === 'signup'
    ? 'Already have an account? <a href="#" id="authSwitchLink">Sign in</a>'
    : 'Don\'t have an account? <a href="#" id="authSwitchLink">Create one</a>';
  $('authSwitchLink').addEventListener('click', (e) => { e.preventDefault(); showAuthModal(mode === 'signup' ? 'signin' : 'signup'); });
  $('authError').textContent = '';
  $('authEmail').value = '';
  $('authPassword').value = '';
  $('authDisplayName').value = prefs.solverName || prefs.posterName || '';
  $('authDisplayName').classList.toggle('hidden', mode === 'signin');
  $('authEmail').focus();
}

function hideAuthModal() { $('authModal').classList.add('hidden'); }

function updateAuthUI() {
  const user = Auth.getUser();
  const authBtn = $('authBtn');
  const userBadge = $('userBadge');
  if (user) {
    const name = user.user_metadata?.display_name || user.email;
    authBtn.classList.add('hidden');
    userBadge.classList.remove('hidden');
    $('userBadgeName').textContent = name;
  } else {
    authBtn.classList.remove('hidden');
    userBadge.classList.add('hidden');
  }
}

// ==================== CORE DATA LOADING ====================
async function loadAll() {
  if (SupabaseClient.available()) {
    problems = await DB.getProblems();
    const rankings = await DB.getSolverRankings();
    solvers = {};
    rankings.forEach(([name, count]) => { solvers[name] = count; });
    prefs.subsCount = problems.reduce((s, p) => s + (p.solutions_count || 0), 0);
  } else {
    try { problems = JSON.parse(localStorage.getItem('oc_opencase_problems') || '[]'); } catch { problems = []; }
    try { solvers = JSON.parse(localStorage.getItem('oc_opencase_solvers') || '{}'); } catch { solvers = {}; }
    try { const v = localStorage.getItem('oc_opencase_prefs'); if (v) prefs = Object.assign(prefs, JSON.parse(v)); } catch {}
  }
}

// ==================== PUBLIC PORTAL ====================
$('checkMatchBtn').addEventListener('click', async () => {
  const title = $('postTitle').value.trim();
  const desc = $('postDesc').value.trim();
  const area = $('matchArea');
  if (!title && !desc) {
    area.innerHTML = `<div class="match-hit warn">Type a rough title or a sentence about the problem first &mdash; then check again.</div>`;
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  area.innerHTML = `<div class="match-hit plain"><span class="spinner"></span>Checking for existing solutions...</div>`;

  const solved = problems.filter(p => p.status === 'solved');
  const matches = await AI.findSimilarSolved({ title, description: desc, category: $('postCategory').value }, solved);

  if (matches.length > 0 && matches[0].score >= 30) {
    const best = solved.find(p => p.id === matches[0].id);
    if (best) {
      area.innerHTML = `<div class="match-hit"><b>Good news &mdash; this looks solved already (${esc(fmtId(best.id))} — ${matches[0].score}% match)</b><br>${esc(best.title)}<br><span style="color:var(--steel)">Open the Solved Library tab to grab the accepted solution.</span></div>`;
    }
  } else {
    area.innerHTML = `<div class="match-hit plain">No existing fix found &mdash; yours would be a genuinely new case. File it below.</div>`;
  }
  area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

$('postDesc').addEventListener('input', () => { $('descCount').textContent = $('postDesc').value.length; });

$('submitProblemBtn').addEventListener('click', async () => {
  const title = $('postTitle').value.trim();
  const desc = $('postDesc').value.trim();
  const category = $('postCategory').value;
  const name = $('postName').value.trim() || 'Anonymous';
  const bounty = Math.max(0, parseFloat($('postBounty').value) || 0);
  const featured = $('postFeatured').checked;

  if (!title || !desc) {
    $('matchArea').innerHTML = `<div class="match-hit warn">Almost there &mdash; just add a title and a short description.</div>`;
    $('matchArea').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  const btn = $('submitProblemBtn');
  btn.disabled = true;
  btn.textContent = 'Filing...';

  const newProblem = await DB.createProblem({ title, description: desc, category, postedBy: name, bounty, featured });
  if (newProblem) {
    problems.unshift(newProblem);
    prefs.posterName = name;
    saveLocalPrefs();
    $('postTitle').value = ''; $('postDesc').value = ''; $('postBounty').value = '';
    $('postFeatured').checked = false;
    $('descCount').textContent = '0';
    let note = '';
    if (featured) note += `Priority placement active. `;
    if (bounty > 0) note += `${money(bounty)} bounty attached.`;
    $('matchArea').innerHTML = `
      <div class="success-box">
        <div class="checkmark">&check;</div>
        <h3 style="font-family:'Space Grotesk';margin:0 0 8px;font-size:21px">Case ${esc(fmtId(newProblem.id))} is live</h3>
        <p style="color:var(--steel);font-size:13px;margin:0 0 4px">${note || 'Solvers can see it right now.'}</p>
        <div class="row" style="justify-content:center">
          <button class="btn green sm" onclick="document.querySelector('[data-ptab=mine]').click()">Track this case</button>
          <button class="btn ghost sm" onclick="$('matchArea').innerHTML=''; window.scrollTo({top:0,behavior:'smooth'})">File another</button>
        </div>
      </div>`;
    showToast(`Case ${fmtId(newProblem.id)} filed &mdash; solvers notified`);
    updateCounts();
  }
  btn.disabled = false;
  btn.textContent = 'File this case — it\'s free';
});

function renderMinePrompt() { $('mineName').value = prefs.posterName || ''; }

$('mineGoBtn').addEventListener('click', async () => {
  const n = $('mineName').value.trim();
  if (!n) { showToast('Type the name you filed under first', true); $('mineName').focus(); return; }
  prefs.posterName = n;
  saveLocalPrefs();
  showToast('Tracking cases filed by ' + esc(n));
  renderMine();
});

$('mineName').addEventListener('keydown', e => { if (e.key === 'Enter') $('mineGoBtn').click(); });

async function renderMine() {
  const list = $('mineList');
  const who = (prefs.posterName || '').toLowerCase();
  if (!who) {
    list.innerHTML = `<div class="empty">Type your name above and hit Track &mdash;<br>we'll pull up everything you've filed.</div>`;
    return;
  }
  const mine = problems.filter(p => p.posted_by_name?.toLowerCase() === who && p.status !== 'removed')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (mine.length === 0) {
    list.innerHTML = `<div class="empty">No cases under "<b>${esc(prefs.posterName)}</b>" yet.<br>Your next step is one tab away &mdash; File a Problem.</div>`;
    return;
  }
  list.innerHTML = '';
  for (const p of mine) {
    const sols = (await DB.getSolutions(p.id)).filter(s => !s.removed && !s.flagged);
    const accepted = sols.find(s => s.accepted);
    const verified = accepted ? await Blockchain.isVerified(accepted.sid || accepted.id) : false;
    const card = document.createElement('div');
    card.className = 'ticket' + (p.featured ? ' feat' : '');
    const pid = p.id;
    card.innerHTML = `
      <div class="ticket-top">
        <div>
          <div class="ticket-id">${esc(fmtId(pid))} · filed ${timeAgo(new Date(p.created_at).getTime())}</div>
          <h3>${esc(p.title)}</h3>
        </div>
        <div class="stamp ${p.status === 'solved' ? 'solved' : 'open'}">${p.status === 'solved' ? 'Solved' : 'Open'}</div>
      </div>
      <span class="tag">${esc(p.category)}</span>
      ${p.featured ? '<span class="tag gold">Priority</span>' : ''}
      ${p.bounty > 0 ? `<span class="tag gold">${money(p.bounty)} bounty</span>` : ''}
      <p class="desc" style="margin-top:10px">${esc(tr(p.description, 160))}</p>
      <div class="expand">
        ${accepted
          ? `<div class="sol-item"><div class="meta"><span class="accepted-badge">Accepted solution · ${esc(accepted.solverName)}${verified ? ' · &#x1f512; Verified' : ''}</span></div>${esc(accepted.text)}</div>`
          : (sols.length
            ? sols.map(s => `
              <div class="sol-item">
                <div class="meta"><span>${esc(s.solverName)}${s.aiAssisted ? ' · AI-assisted' : ''}</span><span>${timeAgo(s.createdAt || new Date(s.created_at).getTime())}</span></div>
                <div>${esc(s.text)}</div>
                <div class="mod-actions"><button class="btn green sm" data-acc="${pid}:${s.sid || s.id}">It worked &mdash; accept this solution</button></div>
              </div>`).join('')
            : `<div class="empty" style="padding:8px 0">Waiting for solver submissions…</div>`)}
      </div>
    `;
    list.appendChild(card);
  }
  list.querySelectorAll('[data-acc]').forEach(b => {
    b.addEventListener('click', async () => {
      const [pid, sid] = b.dataset.acc.split(':').map(Number);
      await acceptSolution(pid, sid);
      renderMine();
    });
  });
}

$('archiveSearch').addEventListener('input', renderArchive);

async function renderArchive() {
  const solved = problems.filter(p => p.status === 'solved').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const list = $('archiveList');
  const q = $('archiveSearch').value.trim().toLowerCase();
  const filtered = q ? solved.filter(p => (p.title + ' ' + p.description + ' ' + p.category).toLowerCase().includes(q)) : solved;
  $('libCount').textContent = filtered.length ? `${filtered.length} proven fix${filtered.length === 1 ? '' : 'es'} available` : '';
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">${q ? `Nothing matches "${esc(q)}" yet — it might be a brand-new problem.` : 'No solved cases yet — yours could be the first.'}</div>`;
    return;
  }
  list.innerHTML = '';
  for (const p of filtered) {
    const sols = await DB.getSolutions(p.id);
    const accepted = sols.find(s => s.accepted && !s.removed);
    const verified = accepted ? await Blockchain.isVerified(accepted.sid || accepted.id) : false;
    const card = document.createElement('div');
    card.className = 'ticket';
    card.innerHTML = `
      <div class="ticket-top">
        <div>
          <div class="ticket-id">${esc(fmtId(p.id))} · ${timeAgo(new Date(p.created_at).getTime())}</div>
          <h3>${esc(p.title)}</h3>
        </div>
        <div class="stamp solved">Solved</div>
      </div>
      <span class="tag">${esc(p.category)}</span>
      <p class="desc" style="margin-top:10px">${esc(p.description)}</p>
      ${accepted ? `<div class="sol-item"><div class="meta"><span class="accepted-badge">Accepted solution · ${esc(accepted.solverName)}${verified ? ' · &#x1f512; Verified' : ''}</span></div>${esc(accepted.text)}</div>` : ''}
    `;
    list.appendChild(card);
  }
}

// ==================== SOLVER PORTAL ====================
$('solverNameBtn').addEventListener('click', async () => {
  const n = $('solverNameInput').value.trim();
  if (!n) { showToast('Pick a handle so you get credit for wins', true); $('solverNameInput').focus(); return; }
  prefs.solverName = n;
  saveLocalPrefs();
  showToast('Saved — welcome to the board, ' + esc(n));
  renderWelcomeStrip();
  renderSolve(); renderFolio(); renderRanks();
});

$('solverNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('solverNameBtn').click(); });

function renderWelcomeStrip() {
  const el = $('welcomeStrip');
  if (!el) return;
  if (prefs.solverName) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
}

async function renderSolve() {
  renderWelcomeStrip();
  const list = $('solveList');
  const open = problems.filter(p => p.status === 'open' && !p.flagged)
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || new Date(b.created_at) - new Date(a.created_at));
  if (open.length === 0) {
    list.innerHTML = `<div class="empty">The board is clear &mdash; every case so far has been solved.<br>Great time to check the Reputation tab or check back soon.</div>`;
    return;
  }
  list.innerHTML = '';
  for (const p of open) {
    const sols = await DB.getSolutions(p.id);
    const subCount = sols.filter(s => !s.removed && !s.flagged).length;
    const card = document.createElement('div');
    card.className = 'ticket' + (p.featured ? ' feat' : '');
    card.innerHTML = `
      <div class="ticket-top">
        <div>
          <div class="ticket-id">${esc(fmtId(p.id))} · filed by ${esc(p.posted_by_name)} · ${timeAgo(new Date(p.created_at).getTime())}</div>
          <h3>${esc(p.title)}</h3>
        </div>
        ${p.featured ? '<div class="stamp open">Priority</div>' : '<div class="stamp open">Open</div>'}
      </div>
      <span class="tag">${esc(p.category)}</span>
      ${p.bounty > 0 ? `<span class="tag gold">${money(p.bounty)} bounty</span>` : ''}
      <span class="tag">${subCount === 0 ? 'Be the first to solve' : subCount + ' solution' + (subCount === 1 ? '' : 's') + ' in'}</span>
      <p class="desc" style="margin-top:10px">${esc(p.description)}</p>
      <div class="row">
        <button class="btn ghost" data-open="${p.id}">Open case file</button>
      </div>
      <div class="expand" id="expand-${p.id}" style="display:none"></div>
    `;
    list.appendChild(card);
  }
  list.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => toggleCaseFile(parseInt(btn.dataset.open)));
  });
}

async function toggleCaseFile(pid) {
  const box = $('expand-' + pid);
  if (!box) return;
  if (box.style.display === 'block') { box.style.display = 'none'; return; }
  box.style.display = 'block';
  await renderCaseFile(pid);
}

async function renderCaseFile(pid) {
  const box = $('expand-' + pid);
  if (!box || box.style.display !== 'block') return;
  box.innerHTML = `<div class="empty" style="padding:12px 0"><span class="spinner"></span>loading submissions...</div>`;
  const sols = (await DB.getSolutions(pid)).filter(s => !s.removed && !s.flagged);
  const problem = problems.find(p => p.id === pid);

  const solHtml = sols.map(s => `
    <div class="sol-item">
      <div class="meta"><span>${esc(s.solverName)}${s.aiAssisted ? ' · AI-assisted draft' : ''}${s.accepted ? ' · <span class="accepted-badge">ACCEPTED</span>' : ''}</span><span>${timeAgo(s.createdAt || new Date(s.created_at).getTime())}</span></div>
      <div>${esc(s.text)}</div>
    </div>
  `).join('') || `<div class="empty" style="padding:10px 0">No submissions yet — be the first to work this case.</div>`;

  box.innerHTML = `
    ${solHtml}
    <label>Your name</label>
    <input type="text" id="solverName-${pid}" placeholder="e.g. Arjun" value="${esc(prefs.solverName)}">
    <label>Proposed solution</label>
    <textarea id="solverText-${pid}" placeholder="Write or draft your solution..."></textarea>
    <div class="row">
      <button class="btn ghost" id="aiBtn-${pid}">Draft with AI assistance</button>
      <button class="btn solid" id="submitSolBtn-${pid}">Submit solution</button>
    </div>
  `;

  $('aiBtn-' + pid).addEventListener('click', async () => {
    const aiBtn = $('aiBtn-' + pid);
    if (!prefs.premium) {
      const used = prefs.aiUsage[todayKey()] || 0;
      if (used >= CONFIG.FREE_DRAFT_LIMIT) {
        showToast(`Free drafts used up today (${CONFIG.FREE_DRAFT_LIMIT}). Upgrade in Reputation tab for unlimited.`, true);
        return;
      }
    }
    aiBtn.disabled = true;
    aiBtn.innerHTML = `<span class="spinner"></span>drafting...`;
    if (!prefs.premium) {
      prefs.aiUsage[todayKey()] = (prefs.aiUsage[todayKey()] || 0) + 1;
      saveLocalPrefs();
      if (Auth.getUser()) await DB.incrementAiUsage(Auth.getUser().id);
    }
    try {
      const draft = await AI.draftSolution(problem);
      $('solverText-' + pid).value = draft.text;
      $('solverText-' + pid).dataset.aiAssisted = draft.aiAssisted ? '1' : '0';
      showToast(draft.provider === 'fallback' ? 'Draft ready (template — configure AI key for smarter drafts)' : 'AI draft ready — edit it to make it yours');
    } catch (e) {
      $('solverText-' + pid).value = AI.draftFallback(problem);
      $('solverText-' + pid).dataset.aiAssisted = '1';
    }
    aiBtn.disabled = false;
    aiBtn.textContent = 'Draft with AI assistance';
  });

  $('submitSolBtn-' + pid).addEventListener('click', async () => {
    const name = $('solverName-' + pid).value.trim();
    const text = $('solverText-' + pid).value.trim();
    if (!name) { showToast('Add your name — it\'s how you get credited', true); $('solverName-' + pid).focus(); return; }
    if (!text) { showToast('Write (or draft) your solution first', true); $('solverText-' + pid).focus(); return; }

    const aiAssisted = $('solverText-' + pid).dataset.aiAssisted === '1';
    prefs.solverName = name;
    prefs.subsCount = (prefs.subsCount || 0) + 1;
    saveLocalPrefs();
    $('solverNameInput').value = name;

    const newSol = await DB.createSolution({ problemId: pid, solverName: name, text, aiAssisted });
    if (newSol) {
      showToast('Solution submitted — the filer will review it');
      await renderSolve();
      const box = $('expand-' + pid);
      if (box) { box.style.display = 'block'; await renderCaseFile(pid); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      renderFolio();
    }
  });
}

async function acceptSolution(pid, sid) {
  await DB.acceptSolution(pid, sid);
  // Blockchain verification
  const problem = problems.find(p => p.id === pid);
  const sols = await DB.getSolutions(pid);
  const accepted = sols.find(s => (s.sid || s.id) === sid || s.accepted);
  if (accepted) {
    await Blockchain.verifySolution(accepted.sid || accepted.id, {
      problemId: pid,
      solverName: accepted.solverName,
      text: accepted.text,
      createdAt: accepted.createdAt || Date.now()
    });
  }
  // Update local state
  if (problem) problem.status = 'solved';
  solvers[accepted?.solverName] = (solvers[accepted?.solverName] || 0) + 1;
  showToast(`Solved! ${esc(accepted?.solverName || '')} gets the credit + blockchain verification`);
  updateCounts();
}

async function renderFolio() {
  const box = $('folioList');
  const me = (prefs.solverName || '').trim();
  if (!me) {
    box.innerHTML = `<div class="empty">One quick step: add your name in the bar above.<br>Then every accepted solution lands here as permanent proof.</div>`;
    return;
  }
  const wins = [], pend = [];
  for (const p of problems) {
    if (p.status === 'removed') continue;
    const sols = await DB.getSolutions(p.id);
    sols.forEach(s => {
      if (s.solverName !== me || s.removed) return;
      if (s.accepted) wins.push({ p, s });
      else if (!s.flagged && p.status === 'open') pend.push({ p, s });
    });
  }
  let html = `<div class="section-h" style="margin-top:0">Verified wins — ${wins.length}</div>`;
  if (wins.length === 0) {
    html += `<div class="empty">No wins yet &mdash; but every case on the Open Board is a chance.<br>Accepted solutions here become recruiter-visible proof, forever.</div>`;
  } else {
    html += '<div class="case-list">';
    for (const { p, s } of wins) {
      const verified = await Blockchain.isVerified(s.sid || s.id);
      html += `
        <div class="ticket">
          <div class="ticket-top">
            <div>
              <div class="ticket-id">${esc(fmtId(p.id))} · accepted ${timeAgo(s.createdAt || new Date(s.created_at).getTime())}</div>
              <h3>${esc(p.title)}</h3>
            </div>
            <div class="stamp solved">Verified${verified ? ' &#x1f512;' : ''}</div>
          </div>
          <span class="tag">${esc(p.category)}</span>
          <div class="sol-item" style="margin-top:10px">${esc(tr(s.text, 260))}</div>
        </div>`;
    }
    html += '</div>';
  }
  html += `<div class="section-h">In play — ${pend.length} awaiting decision</div>`;
  if (pend.length === 0) {
    html += `<div class="empty" style="padding:14px 0">Nothing pending. Pick a case from the Open Board.</div>`;
  } else {
    pend.forEach(({ p }) => {
      html += `<div class="leader"><span>${esc(tr(p.title, 52))}</span><span>${esc(fmtId(p.id))}</span></div>`;
    });
  }
  box.innerHTML = html;
}

async function renderRanks() {
  const rankings = await DB.getSolverRankings();
  solvers = {};
  rankings.forEach(([n, c]) => { solvers[n] = c; });
  const board = $('leaderboard');
  const ranked = rankings;
  const me = (prefs.solverName || '').trim();
  board.innerHTML = ranked.length
    ? ranked.map(([n, c], i) => `<div class="leader top${i + 1}"><span>#${i + 1} ${esc(n)}${me && n === me ? ' — you' : ''}</span><span>${c} solved</span></div>`).join('')
    : `<div class="empty" style="padding:10px 0">No solvers on the board yet.</div>`;
  if (me && !ranked.some(([n]) => n === me)) {
    board.innerHTML += `<div class="leader"><span>${esc(me)} — you</span><span>0 solved</span></div>`;
  }
}

function renderPremium() {
  const box = $('premiumBox');
  const used = prefs.aiUsage[todayKey()] || 0;
  if (prefs.premium) {
    box.innerHTML = `
      <div class="match-hit" style="margin-top:0">
        <b>PREMIUM ACTIVE</b> — unlimited AI-assisted drafting.<br>
        <span style="color:var(--steel)">Simulated billing for this prototype.</span>
      </div>
      <div class="row"><button class="btn ghost sm" id="downgradeBtn">Cancel premium</button></div>`;
    $('downgradeBtn').addEventListener('click', async () => {
      prefs.premium = false; saveLocalPrefs(); renderPremium();
      showToast('Premium cancelled — back on the free tier');
    });
  } else {
    box.innerHTML = `
      <div class="match-hit plain" style="margin-top:0">
        Free tier: <b>${used}/${CONFIG.FREE_DRAFT_LIMIT}</b> AI drafts used today.<br>
        <span style="color:var(--steel)">Premium unlocks unlimited AI drafting — $9/mo (simulated).</span>
      </div>
      <div class="row"><button class="btn solid" id="upgradeBtn">Upgrade to Premium</button></div>`;
    $('upgradeBtn').addEventListener('click', async () => {
      prefs.premium = true; saveLocalPrefs(); renderPremium();
      showToast('Premium active — unlimited AI drafts unlocked');
    });
  }
}

// ==================== ADMIN PORTAL ====================
async function computeRevenue() {
  let rev = problems.filter(p => p.featured && p.status !== 'removed').length * CONFIG.FEATURED_FEE;
  for (const p of problems) {
    if (p.status === 'solved' && p.bounty > 0) {
      const sols = await DB.getSolutions(p.id);
      if (sols.some(s => s.accepted && !s.removed)) rev += p.bounty * CONFIG.TAKE_RATE;
    }
  }
  return rev;
}

async function renderAdmin() {
  adminTab = 'dash';
  renderDash();
}

async function renderDash() {
  const open = problems.filter(p => p.status === 'open' && !p.flagged).length;
  const solved = problems.filter(p => p.status === 'solved').length;
  const flaggedCount = problems.filter(p => p.flagged).length;
  let subs = 0;
  for (const p of problems) { subs += (await DB.getSolutions(p.id)).length; }
  const rev = await computeRevenue();

  if (problems.length === 0) {
    $('dashTiles').innerHTML = '';
    $('activityFeed').innerHTML = `
      <div class="empty">Cold start — the board is empty.<br>Seed realistic sample data to explore every portal.</div>
      <div class="row" style="justify-content:center"><button class="btn solid" id="seedBtn">Seed sample cases</button></div>`;
    $('seedBtn').addEventListener('click', seedSample);
    return;
  }

  $('dashTiles').innerHTML = `
    <div class="tile amber"><b>${open}</b><span>open cases</span></div>
    <div class="tile green"><b>${solved}</b><span>solved</span></div>
    <div class="tile red"><b>${flaggedCount}</b><span>flagged items</span></div>
    <div class="tile"><b>${subs}</b><span>live submissions</span></div>
    <div class="tile"><b>${Object.keys(solvers).length}</b><span>ranked solvers</span></div>
    <div class="tile green"><b>${money(rev)}</b><span>est. platform revenue</span></div>`;

  const acts = await DB.getActivity(9);
  $('activityFeed').innerHTML = acts.map(a =>
    `<div class="feed-item"><span>${a.k === 'ok' ? '<span style="color:var(--green)">&#x2714;</span> ' : ''}${esc(a.x)}</span><span class="when">${timeAgo(a.t)}</span></div>`
  ).join('') || '<div class="empty">No activity yet.</div>';
}

async function seedSample() {
  await DB.seedSampleData();
  await loadAll();
  showToast('Sample data seeded — explore all three portals');
  renderDash();
}

async function renderMod() {
  const flagged = [];
  problems.forEach(p => { if (p.flagged && p.status !== 'removed') flagged.push({ kind: 'problem', p }); });
  for (const p of problems) {
    const sols = await DB.getSolutions(p.id);
    sols.forEach(s => { if (s.flagged && !s.removed) flagged.push({ kind: 'solution', p, s }); });
  }
  const fl = $('flaggedList');
  if (flagged.length === 0) {
    fl.innerHTML = `<div class="empty" style="padding:14px 0">Nothing flagged. Queue is clear.</div>`;
  } else {
    fl.innerHTML = flagged.map(f => {
      if (f.kind === 'problem') {
        return `<div class="ticket removed"><div class="ticket-top"><div><div class="ticket-id">${fmtId(f.p.id)} · PROBLEM · by ${esc(f.p.posted_by_name)}</div><h3>${esc(f.p.title)}</h3></div><div class="stamp flagged">Flagged</div></div><div class="mod-actions"><button class="btn green sm" data-unflag-p="${f.p.id}">Clear flag</button><button class="btn red sm" data-remove-p="${f.p.id}">Remove</button></div></div>`;
      }
      return `<div class="sol-item"><div class="meta"><span>${fmtId(f.p.id)} · SOLUTION · by ${esc(f.s.solverName)}</span></div><div>${esc(tr(f.s.text, 200))}</div><div class="mod-actions"><button class="btn green sm" data-unflag-s="${f.p.id}:${f.s.sid || f.s.id}">Approve</button><button class="btn red sm" data-remove-s="${f.p.id}:${f.s.sid || f.s.id}">Remove</button></div></div>`;
    }).join('');
  }
  // Bind moderation buttons
  fl.querySelectorAll('[data-unflag-p]').forEach(b => b.addEventListener('click', async () => {
    await DB.updateProblem(parseInt(b.dataset.unflagP), { flagged: false });
    await loadAll(); renderMod();
  }));
  fl.querySelectorAll('[data-remove-p]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Remove this case?')) return;
    await DB.updateProblem(parseInt(b.dataset.removeP), { status: 'removed', flagged: false });
    await loadAll(); renderMod();
  }));
}

function renderCasePills() {
  $('caseFilterPills').innerHTML = [['all', 'All'], ['open', 'Open'], ['solved', 'Solved'], ['flagged', 'Flagged'], ['removed', 'Removed']]
    .map(([v, l]) => `<button class="pill ${caseFilter === v ? 'on' : ''}" data-f="${v}">${l}</button>`).join('');
  $('caseFilterPills').querySelectorAll('[data-f]').forEach(b => {
    b.addEventListener('click', () => { caseFilter = b.dataset.f; renderAllCases(); });
  });
}

async function renderAllCases() {
  renderCasePills();
  const list = $('allCasesList');
  let items = problems.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (caseFilter === 'open') items = items.filter(p => p.status === 'open' && !p.flagged);
  if (caseFilter === 'solved') items = items.filter(p => p.status === 'solved');
  if (caseFilter === 'flagged') items = items.filter(p => p.flagged);
  if (caseFilter === 'removed') items = items.filter(p => p.status === 'removed');
  if (items.length === 0) { list.innerHTML = `<div class="empty">No cases in this view.</div>`; return; }
  list.innerHTML = '';
  for (const p of items) {
    const status = p.status === 'removed' ? 'removed' : (p.flagged ? 'flagged' : p.status);
    const card = document.createElement('div');
    card.className = 'ticket' + (status === 'removed' ? ' removed' : '') + (p.featured && status !== 'removed' ? ' feat' : '');
    card.innerHTML = `
      <div class="ticket-top"><div><div class="ticket-id">${fmtId(p.id)} · by ${esc(p.posted_by_name)} · ${timeAgo(new Date(p.created_at).getTime())}</div><h3>${esc(p.title)}</h3></div><div class="stamp ${status}">${status}</div></div>
      <span class="tag">${esc(p.category)}</span>
      ${p.featured ? '<span class="tag gold">Priority</span>' : ''}
      ${p.bounty > 0 ? `<span class="tag gold">${money(p.bounty)} bounty</span>` : ''}
      <div class="mod-actions">
        ${status === 'removed' ? `<button class="btn green sm" data-a="restore" data-id="${p.id}">Restore</button>`
        : `<button class="btn ghost sm" data-a="flag" data-id="${p.id}">${p.flagged ? 'Unflag' : 'Flag'}</button><button class="btn red sm" data-a="remove" data-id="${p.id}">Remove</button>`}
      </div>`;
    list.appendChild(card);
  }
  list.querySelectorAll('[data-a]').forEach(b => {
    b.addEventListener('click', async () => {
      const pid = parseInt(b.dataset.id);
      const a = b.dataset.a;
      if (a === 'flag') { await DB.updateProblem(pid, { flagged: !problems.find(p => p.id === pid)?.flagged }); }
      if (a === 'remove') { if (!confirm('Remove this case?')) return; await DB.updateProblem(pid, { status: 'removed', flagged: false }); }
      if (a === 'restore') { await DB.updateProblem(pid, { status: 'open' }); }
      await loadAll(); renderAllCases();
    });
  });
}

async function renderInsights() {
  const cats = {};
  problems.filter(p => p.status !== 'removed' && !p.flagged).forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
  const max = Math.max(1, ...Object.values(cats));
  $('catBars').innerHTML = Object.entries(cats).sort((a, b) => b[1] - a[1]).length
    ? Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<div class="bar-row"><span class="bl">${esc(c)}</span><span class="bar"><i style="width:${Math.round(n / max * 100)}%"></i></span><span class="bv">${n}</span></div>`).join('')
    : `<div class="empty" style="padding:10px 0">No demand data yet.</div>`;
  const rankings = await DB.getSolverRankings();
  $('insightSolvers').innerHTML = rankings.length
    ? rankings.slice(0, 6).map(([n, c]) => `<div class="moneyline"><span>${esc(n)}</span><span>${c} verified win${c === 1 ? '' : 's'}</span></div>`).join('')
    : `<div class="empty" style="padding:10px 0">No solver supply yet.</div>`;
  const featuredN = problems.filter(p => p.featured && p.status !== 'removed').length;
  const rev = await computeRevenue();
  let bountyPool = 0;
  problems.forEach(p => { if (p.status !== 'removed' && p.bounty > 0 && p.status === 'open') bountyPool += p.bounty; });
  $('moneyBox').innerHTML = `
    <div class="moneyline"><span>Priority placements (${featuredN} x ${money(CONFIG.FEATURED_FEE)})</span><b>${money(featuredN * CONFIG.FEATURED_FEE)}</b></div>
    <div class="moneyline"><span>Bounty take-rate (10%)</span><b>${money(rev - featuredN * CONFIG.FEATURED_FEE)}</b></div>
    <div class="moneyline"><span>Live bounty pool</span><span>${money(bountyPool)}</span></div>
    <div class="moneyline"><span>Total est. revenue</span><b>${money(rev)}</b></div>
    <div class="hint">Simulated — no live payment processing.</div>`;
}

async function exportCsv() {
  const rows = [['type', 'ref', 'title_name', 'status', 'category', 'amount', 'created', 'text']];
  problems.forEach(p => {
    rows.push(['problem', fmtId(p.id), p.title, p.flagged ? 'flagged' : p.status, p.category, p.bounty || 0, new Date(p.created_at || 0).toISOString(), (p.description || '').replace(/"/g, "'")]);
  });
  for (const p of problems) {
    const sols = await DB.getSolutions(p.id);
    sols.forEach(s => {
      rows.push(['solution', fmtId(p.id), s.solverName, s.removed ? 'removed' : (s.flagged ? 'flagged' : (s.accepted ? 'accepted' : 'open')), '', '', new Date(s.createdAt || s.created_at || 0).toISOString(), (s.text || '').replace(/"/g, "'").replace(/\n/g, ' ')]);
    });
  }
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'opencase_dataset.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Dataset exported — check your downloads');
}

// ==================== ADMIN AUTH ====================
const ADMIN_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

$('adminLoginBtn').addEventListener('click', async () => {
  if (!(window.crypto && crypto.subtle)) {
    $('adminErr').innerHTML = `<div class="match-hit warn">This browser can't verify the passcode.</div>`;
    return;
  }
  const h = await sha256Hex($('adminPass').value);
  if (h === ADMIN_HASH) {
    adminOk = true;
    $('adminErr').innerHTML = '';
    $('adminPass').value = '';
    showToast('Console unlocked');
    showScreen('admin');
  } else {
    $('adminErr').innerHTML = `<div class="match-hit warn">Wrong passcode.</div>`;
  }
});
$('adminPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('adminLoginBtn').click(); });
$('exportCsvBtn').addEventListener('click', exportCsv);

// ==================== PREFS HELPERS ====================
function saveLocalPrefs() {
  try { localStorage.setItem('oc_opencase_prefs', JSON.stringify(prefs)); } catch {}
}

// ==================== INIT ====================
(async function init() {
  // Init backend
  SupabaseClient.init();
  await Auth.init();
  await Blockchain.init();
  updateAuthUI();

  // Load data
  await loadAll();
  showScreen('home');

  // Tab bindings
  bindTabs('data-ptab', (t) => {
    ['post', 'mine', 'lib'].forEach(x => { const el = $('pub-' + x); el.classList.toggle('hidden', x !== t); if (x === t) flash(el); });
    if (t === 'mine') renderMine();
    if (t === 'lib') renderArchive();
  });
  bindTabs('data-stab', (t) => {
    ['board', 'folio', 'ranks'].forEach(x => { const el = $('sv-' + x); el.classList.toggle('hidden', x !== t); if (x === t) flash(el); });
    if (t === 'board') renderSolve();
    if (t === 'folio') renderFolio();
    if (t === 'ranks') { renderRanks(); renderPremium(); }
  });
  bindTabs('data-atab', (t) => {
    adminTab = t;
    ['dash', 'mod', 'cases', 'insights'].forEach(x => { const el = $('ad-' + x); el.classList.toggle('hidden', x !== t); if (x === t) flash(el); });
    if (t === 'dash') renderDash();
    if (t === 'mod') renderMod();
    if (t === 'cases') renderAllCases();
    if (t === 'insights') renderInsights();
  });

  // Portal navigation
  document.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', () => showScreen(el.dataset.go));
  });

  // Auth buttons
  $('authBtn').addEventListener('click', () => showAuthModal('signin'));
  $('authLogoutBtn').addEventListener('click', async () => { await Auth.signOut(); updateAuthUI(); });
  $('authSubmitBtn').addEventListener('click', async () => {
    const email = $('authEmail').value.trim();
    const pass = $('authPassword').value;
    const name = $('authDisplayName').value.trim();
    const isSignup = $('authTitle').textContent === 'Create Account';
    if (!email || !pass) { $('authError').textContent = 'Email and password required'; return; }
    const { error } = isSignup ? await Auth.signUp(email, pass, name) : await Auth.signIn(email, pass);
    if (error) { $('authError').textContent = error.message; return; }
    hideAuthModal();
    updateAuthUI();
    await loadAll();
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest ? e.target.closest('[data-go][role="button"]') : null;
    if (card) { e.preventDefault(); card.click(); }
  });

  // Focus refresh
  window.addEventListener('focus', async () => {
    await loadAll();
    if (activeScreen === 'home') updateCounts();
    else if (activeScreen === 'public') { renderMine(); renderArchive(); }
    else if (activeScreen === 'solver') { renderSolve(); renderFolio(); renderRanks(); }
    else if (activeScreen === 'admin' && adminOk) {
      if (adminTab === 'mod') renderMod();
      else if (adminTab === 'cases') renderAllCases();
      else if (adminTab === 'insights') renderInsights();
      else renderDash();
    }
  });

  // Welcome strip focus
  $('wsFocusBtn').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('solverNameInput').focus();
  });
})();
