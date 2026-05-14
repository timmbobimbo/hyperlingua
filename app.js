// ── helpers ───────────────────────────────────────────────────
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const tdStr = () => new Date().toISOString().slice(0,10);
const esc   = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const addDays = (ts, d) => ts + d * 86400000;

// ── storage ───────────────────────────────────────────────────
const DB = {
  islands()      { return JSON.parse(localStorage.getItem('hl_islands')  || '[]'); },
  setIslands(v)  { localStorage.setItem('hl_islands',  JSON.stringify(v)); DB._touch(); },
  settings()     { return JSON.parse(localStorage.getItem('hl_settings') || '{"newPerDay":20}'); },
  setSettings(v) { localStorage.setItem('hl_settings', JSON.stringify(v)); DB._touch(); },
  history()      { return JSON.parse(localStorage.getItem('hl_history')  || '{}'); },
  setHistory(v)  { localStorage.setItem('hl_history',  JSON.stringify(v)); DB._touch(); },
  _touch()       { localStorage.setItem('hl_updated_at', new Date().toISOString()); }
};

// ── supabase ──────────────────────────────────────────────────
const SUPA_URL = 'https://qagtilwccropnumaqzgg.supabase.co';
const SUPA_KEY = 'sb_publishable_FNp43a0gFnQshCUAZVDz1g_ZO48cnrW';
const supa = window.supabase.createClient(SUPA_URL, SUPA_KEY);
let authUser = null;

async function initAuth() {
  const { data: { session } } = await supa.auth.getSession();
  authUser = session?.user ?? null;
  updateAuthUI();
  supa.auth.onAuthStateChange((_e, session) => {
    if (_e === 'PASSWORD_RECOVERY') {
      document.getElementById('modal-recovery').classList.remove('hidden');
      document.getElementById('auth-gate').classList.add('hidden');
      return;
    }
    authUser = session?.user ?? null;
    updateAuthUI();
  });
}

function updateAuthUI() {
  const dot  = document.getElementById('auth-dot');
  const gate = document.getElementById('auth-gate');
  if (authUser) {
    gate.classList.add('hidden');
    dot.classList.remove('hidden');
    document.getElementById('auth-logged-out').classList.add('hidden');
    document.getElementById('auth-logged-in').classList.remove('hidden');
    const displayName = authUser.user_metadata?.display_name;
    const nameEl = document.getElementById('auth-user-name');
    if (displayName) { nameEl.textContent = displayName; nameEl.classList.remove('hidden'); }
    else { nameEl.classList.add('hidden'); }
    document.getElementById('auth-user-email').textContent = authUser.email;
    const nameInput = document.getElementById('auth-name-input');
    if (nameInput) nameInput.value = displayName || '';
    const ls = localStorage.getItem('hl_last_sync');
    document.getElementById('auth-last-sync').textContent =
      ls ? new Date(ls).toLocaleString('de') : 'Noch nie';
    fetchCredits();
  } else {
    gate.classList.remove('hidden');
    dot.classList.add('hidden');
    document.getElementById('auth-logged-out').classList.remove('hidden');
    document.getElementById('auth-logged-in').classList.add('hidden');
  }
}

async function fetchCredits() {
  const { data } = await supa.from('user_credits').select('balance').eq('user_id', authUser.id).maybeSingle();
  updateCreditDisplay(data?.balance ?? '–');
}

function updateCreditDisplay(balance) {
  const el = document.getElementById('credit-balance');
  if (el) el.textContent = balance + ' Credits';
}

async function callProxy(action, params) {
  const { data: { session } } = await supa.auth.getSession();
  if (!session) { document.getElementById('auth-gate').classList.remove('hidden'); throw new Error('not_logged_in'); }
  const res = await fetch(SUPA_URL + '/functions/v1/ai-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + session.access_token,
      'apikey': SUPA_KEY
    },
    body: JSON.stringify({ action, ...params })
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === 'credits_exhausted') {
      updateCreditDisplay(0);
      alert('Deine 500 kostenlosen Credits sind aufgebraucht. Bitte wende dich an den Administrator für mehr Credits.');
      throw new Error('credits_exhausted');
    }
    throw new Error(data.error || 'Proxy-Fehler ' + res.status);
  }
  if (data.balance !== undefined) updateCreditDisplay(data.balance);
  return data;
}

let gateMode = 'login';

function togglePassVis(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  const show  = input.type === 'password';
  input.type  = show ? 'text' : 'password';
  icon.innerHTML = show
    ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>`
    : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`;
}

function gateSetMode(mode) {
  gateMode = mode;
  const isLogin = mode === 'login';
  const activeClass   = 'flex-1 py-2 rounded-lg text-sm font-semibold transition-colors bg-indigo-600 text-white';
  const inactiveClass = 'flex-1 py-2 rounded-lg text-sm font-medium transition-colors text-gray-400 hover:text-gray-200';
  document.getElementById('gate-tab-login').className    = isLogin ? activeClass : inactiveClass;
  document.getElementById('gate-tab-register').className = isLogin ? inactiveClass : activeClass;
  document.getElementById('gate-submit-btn').textContent = isLogin ? 'Einloggen' : 'Konto erstellen';
  document.getElementById('gate-register-hint').classList.toggle('hidden', isLogin);
  document.getElementById('gate-name').classList.toggle('hidden', isLogin);
  document.getElementById('gate-pass-confirm-wrap').classList.toggle('hidden', isLogin);
  document.getElementById('gate-forgot-btn').classList.toggle('hidden', !isLogin);
  document.getElementById('gate-error').textContent = '';
  document.getElementById('gate-error').style.color = '';
  if (isLogin) document.getElementById('gate-pass-confirm').value = '';
}

function gateSubmit() {
  if (gateMode === 'login') gateLogin(); else gateSignup();
}

async function gateLogin() {
  const email = document.getElementById('gate-email').value.trim();
  const pass  = document.getElementById('gate-pass').value;
  const err   = document.getElementById('gate-error');
  err.style.color = ''; err.textContent = '';
  const { error } = await supa.auth.signInWithPassword({ email, password: pass });
  if (error) err.textContent = error.message;
}

async function gateSignup() {
  const name    = document.getElementById('gate-name').value.trim();
  const email   = document.getElementById('gate-email').value.trim();
  const pass    = document.getElementById('gate-pass').value;
  const confirm = document.getElementById('gate-pass-confirm').value;
  const err     = document.getElementById('gate-error');
  err.style.color = ''; err.textContent = '';
  if (!email || pass.length < 6) { err.textContent = 'E-Mail und mind. 6-stelliges Passwort eingeben.'; return; }
  if (pass !== confirm) { err.textContent = 'Passwörter stimmen nicht überein.'; return; }
  const { error } = await supa.auth.signUp({
    email, password: pass,
    options: { data: { display_name: name || email.split('@')[0] } }
  });
  if (error) { err.textContent = error.message; }
  else {
    err.style.color = '#34d399';
    err.textContent = '✓ Bestätigungs-E-Mail gesendet – bitte prüfen!';
  }
}

async function saveDisplayName() {
  const name   = document.getElementById('auth-name-input').value.trim();
  const status = document.getElementById('auth-name-status');
  status.style.color = ''; status.textContent = '';
  if (!name) { status.style.color = '#f87171'; status.textContent = 'Bitte einen Namen eingeben.'; return; }
  const { error } = await supa.auth.updateUser({ data: { display_name: name } });
  if (error) { status.style.color = '#f87171'; status.textContent = error.message; }
  else {
    authUser.user_metadata = { ...authUser.user_metadata, display_name: name };
    updateAuthUI();
    status.textContent = '✓ Gespeichert!';
    setTimeout(() => { status.textContent = ''; }, 3000);
  }
}

async function gateForgotPassword() {
  const email = document.getElementById('gate-email').value.trim();
  const err   = document.getElementById('gate-error');
  err.style.color = ''; err.textContent = '';
  if (!email) { err.textContent = 'Bitte zuerst E-Mail eingeben.'; return; }
  const { error } = await supa.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.split('#')[0]
  });
  if (error) { err.textContent = error.message; }
  else { err.style.color = '#34d399'; err.textContent = '✓ Reset-E-Mail gesendet – bitte prüfen!'; }
}

async function submitPasswordReset() {
  const pass = document.getElementById('recovery-pass').value;
  const err  = document.getElementById('recovery-error');
  err.style.color = ''; err.textContent = '';
  if (pass.length < 6) { err.textContent = 'Mind. 6 Zeichen.'; return; }
  const { error } = await supa.auth.updateUser({ password: pass });
  if (error) { err.textContent = error.message; }
  else { document.getElementById('modal-recovery').classList.add('hidden'); updateAuthUI(); }
}

async function loginUser() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  const errEl = document.getElementById('auth-error');
  const btn   = document.getElementById('auth-login-btn');
  errEl.textContent = ''; btn.disabled = true;
  const { error } = await supa.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false;
  if (error) { errEl.textContent = error.message; }
  else { closeModal('modal-auth'); }
}

async function signupUser() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.color = '';
  const { error } = await supa.auth.signUp({ email, password: pass });
  if (error) { errEl.textContent = error.message; }
  else {
    errEl.style.color = '#34d399';
    errEl.textContent = '✓ Bestätigungs-E-Mail gesendet – bitte prüfen!';
  }
}

async function logoutUser() {
  await supa.auth.signOut();
}

function setSyncStatus(text, isError) {
  const s = document.getElementById('auth-sync-status');
  s.style.color = isError ? '#f87171' : '';
  s.textContent = text;
}

async function syncUpload() {
  if (!authUser) { openModal('modal-auth'); return; }
  const btn = document.getElementById('auth-upload-btn');
  btn.disabled = true; setSyncStatus('Lädt hoch…');
  try {
    const now = new Date().toISOString();
    const { error } = await supa.from('user_data').upsert({
      id: authUser.id,
      islands:    DB.islands(),
      settings:   DB.settings(),
      history:    DB.history(),
      updated_at: now
    });
    if (error) throw error;
    localStorage.setItem('hl_updated_at', now);
    localStorage.setItem('hl_last_sync',  now);
    document.getElementById('auth-last-sync').textContent = new Date().toLocaleString('de');
    setSyncStatus('↑ Hochgeladen');
  } catch(err) {
    setSyncStatus('Fehler: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function syncDownload() {
  if (!authUser) { openModal('modal-auth'); return; }
  const btn = document.getElementById('auth-download-btn');
  btn.disabled = true; setSyncStatus('Lädt herunter…');
  try {
    const { data: remote, error } = await supa
      .from('user_data').select('*').eq('id', authUser.id).maybeSingle();
    if (error) throw error;
    if (!remote) { setSyncStatus('Kein Backup gefunden.'); btn.disabled = false; return; }
    DB.setIslands(remote.islands   || []);
    DB.setSettings(remote.settings || { newPerDay: 20 });
    DB.setHistory(remote.history   || {});
    const now = new Date().toISOString();
    localStorage.setItem('hl_updated_at', remote.updated_at);
    localStorage.setItem('hl_last_sync',  now);
    document.getElementById('auth-last-sync').textContent = new Date().toLocaleString('de');
    setSyncStatus('↓ Heruntergeladen');
    renderDashboard();
  } catch(err) {
    setSyncStatus('Fehler: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

// ── Auto-Sync (debounced, silent) ────────────────────────────
let autoSyncTimer = null;
function autoSync() {
  if (!authUser) return;
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(async () => {
    autoSyncTimer = null;
    try {
      const now = new Date().toISOString();
      const { error } = await supa.from('user_data').upsert({
        id: authUser.id,
        islands:    DB.islands(),
        settings:   DB.settings(),
        history:    DB.history(),
        updated_at: now
      });
      if (!error) {
        localStorage.setItem('hl_updated_at', now);
        localStorage.setItem('hl_last_sync',  now);
        const el = document.getElementById('auth-last-sync');
        if (el) el.textContent = new Date().toLocaleString('de');
      }
    } catch(e) { /* silent */ }
  }, 10000);
}

// ── SM-2 algorithm ────────────────────────────────────────────
const SRS0 = { state:'new', interval:0, easeFactor:2.5, repetitions:0, due:0, lapses:0 };

function sm2(raw, rating) {
  // rating: 0=Again 1=Hard 2=Good 3=Easy
  const s   = { ...SRS0, ...raw };
  const now = Date.now();

  if (s.state === 'new' || s.state === 'learning') {
    if      (rating === 0) { s.state='learning'; s.due=now+60000;  s.repetitions=0; }
    else if (rating === 1) { s.state='learning'; s.due=now+600000; }
    else if (rating === 2) { s.state='review'; s.interval=1; s.repetitions=1; s.due=addDays(now,1); }
    else                   {
      s.state='review'; s.interval=4; s.repetitions=1;
      s.easeFactor=Math.min(s.easeFactor+0.15, 4.0);
      s.due=addDays(now,4);
    }
  } else {
    // review state
    const iv = Math.max(1, s.interval);
    if (rating === 0) {
      s.state='learning'; s.due=now+60000;
      s.lapses=(s.lapses||0)+1;
      s.easeFactor=Math.max(1.3, s.easeFactor-0.2);
      s.interval=Math.max(1, Math.round(iv*0.5));
      s.repetitions=0;
    } else if (rating === 1) {
      s.interval=Math.max(1, Math.round(iv*1.2));
      s.easeFactor=Math.max(1.3, s.easeFactor-0.15);
      s.due=addDays(now, s.interval);
    } else if (rating === 2) {
      s.interval=Math.max(1, Math.round(iv*s.easeFactor));
      s.due=addDays(now, s.interval);
      s.repetitions++;
    } else {
      s.interval=Math.max(1, Math.round(iv*s.easeFactor*1.3));
      s.easeFactor=Math.min(4.0, s.easeFactor+0.15);
      s.due=addDays(now, s.interval);
      s.repetitions++;
    }
  }
  s.lastReviewed = now;
  return s;
}

function fmtInterval(srs, rating) {
  const next = sm2(srs, rating);
  if (next.state === 'learning') {
    const mins = Math.round((next.due - Date.now()) / 60000);
    return mins <= 1 ? '< 1 Min' : mins + ' Min';
  }
  const d = next.interval;
  if (d === 1)  return '1 Tag';
  if (d < 31)   return d + ' Tage';
  const m = Math.round(d/30);
  return m + ' Mon.';
}

// ── SRS stats ─────────────────────────────────────────────────
function getSRSStats(filterIslandId) {
  const islands = DB.islands();
  const now     = Date.now();
  const eod     = new Date(); eod.setHours(23,59,59,999);
  const eodMs   = eod.getTime();
  let due=0, newC=0, learning=0, newLocked=0;

  islands.forEach(island => {
    if (filterIslandId && filterIslandId !== 'all' && island.id !== filterIslandId) return;
    (island.sentences||[]).forEach(s => {
      const st = s.srs?.state || 'new';
      if      (st === 'new' &&  s.shadowedAt) newC++;
      else if (st === 'new' && !s.shadowedAt) newLocked++;
      else if (st === 'learning' && (s.srs?.due||0) <= now) learning++;
      else if (st === 'review'   && (s.srs?.due||0) <= eodMs) due++;
    });
  });
  return { due, newC, learning, newLocked };
}

// ── navigation ────────────────────────────────────────────────
let currentView = 'dashboard';

function nav(view) {
  ['dashboard','islands','shadowing','recall','dialogue'].forEach(v => {
    const el = document.getElementById('view-'+v);
    el.classList.add('hidden'); el.classList.remove('fade-up');
  });
  const el = document.getElementById('view-'+view);
  el.classList.remove('hidden');
  void el.offsetWidth;
  el.classList.add('fade-up');
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  currentView = view;
  if (view === 'dashboard')  renderDashboard();
  if (view === 'islands')    renderIslands();
  if (view === 'shadowing')  initShadowSel();
  if (view === 'recall')     initSRSSetup();
  if (view === 'dialogue')   initDialogueView();
}

// ── dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  const stats   = getSRSStats();
  const islands = DB.islands();
  const total   = stats.due + stats.learning;

  document.getElementById('dash-due').textContent    = total;
  document.getElementById('dash-new').textContent    = stats.newC;

  // streak
  const hist = DB.history();
  let streak=0; const d=new Date();
  while(true) {
    const ds=d.toISOString().slice(0,10);
    if((hist[ds]?.reviewed||0)>0){ streak++; d.setDate(d.getDate()-1); } else break;
  }
  document.getElementById('dash-streak').textContent = streak;

  // CTA
  const hasWork = total > 0 || stats.newC > 0;
  document.getElementById('dash-review-cta').classList.toggle('hidden', !hasWork);
  document.getElementById('dash-all-done').classList.toggle('hidden',  hasWork);

  document.getElementById('dash-island-count').textContent =
    islands.length + ' Island' + (islands.length!==1?'s':'') + ' · ' +
    islands.reduce((a,i)=>a+(i.sentences||[]).length,0) + ' Sätze';

  const todayHist = hist[tdStr()] || {};
  document.getElementById('dash-review-count').textContent =
    (todayHist.reviewed||0) + ' Reviews heute';

  // recent islands
  const cont = document.getElementById('dash-recent');
  if (!islands.length) {
    cont.innerHTML = '<div class="col-span-2 sm:col-span-4 text-center py-8 text-gray-600 text-sm">' +
      'Noch keine Islands. <button onclick="nav(\'islands\')" class="text-indigo-400 hover:underline">Jetzt erstellen →</button></div>';
    return;
  }
  cont.innerHTML = [...islands].reverse().slice(0,4).map(island => `
    <div onclick="navToIsland('${island.id}')"
         class="island-card cursor-pointer rounded-xl border border-gray-800 p-4 transition-all"
         style="background:#111117">
      <div class="text-xl mb-1">${islandEmoji(island.name)}</div>
      <div class="font-medium text-sm truncate">${esc(island.name)}</div>
      <div class="text-xs text-gray-600 mt-0.5">${esc(island.language||'–')}</div>
      <div class="text-xs text-gray-700 mt-1.5">${(island.sentences||[]).length} Sätze</div>
    </div>`).join('');
}

function islandEmoji(n='') {
  n=n.toLowerCase();
  if(/essen|food|restaurant/.test(n)) return '🍽️';
  if(/reise|travel|urlaub/.test(n))   return '✈️';
  if(/arbeit|work|job/.test(n))       return '💼';
  if(/begrüß|greeting|hola/.test(n))  return '👋';
  if(/familie|family/.test(n))        return '👨‍👩‍👧';
  if(/sport|fitness/.test(n))         return '💪';
  if(/musik|music/.test(n))           return '🎵';
  if(/film|movie|kino/.test(n))       return '🎬';
  if(/wetter|weather/.test(n))        return '🌤️';
  if(/einkauf|shopping/.test(n))      return '🛍️';
  return '🏝️';
}

function navToIsland(id) { nav('islands'); setTimeout(()=>showDetail(id),80); }

// ── islands ───────────────────────────────────────────────────
let activeIslandId = null;

function renderIslands() {
  closeDetail();
  const islands = DB.islands();
  const grid = document.getElementById('islands-grid');
  if (!islands.length) {
    grid.innerHTML = '<div class="col-span-2 text-center py-16 text-gray-600">' +
      '<div class="text-4xl mb-3">🏝️</div>' +
      '<p class="text-sm mb-1">Noch keine Language Islands</p>' +
      '<p class="text-xs">Erstelle deine erste thematische Sammlung</p></div>';
    return;
  }
  const now   = Date.now();
  const eodMs = (() => { const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); })();

  grid.innerHTML = islands.map(island => {
    const sents = island.sentences||[];
    const due   = sents.filter(s=>{
      const st=s.srs?.state||'new';
      return (st==='review'&&(s.srs?.due||0)<=eodMs)||(st==='learning'&&(s.srs?.due||0)<=now);
    }).length;
    return `
    <div onclick="showDetail('${island.id}')"
         class="island-card cursor-pointer rounded-xl border border-gray-800 p-5 transition-all"
         style="background:#111117">
      <div class="flex items-start justify-between mb-3">
        <span class="text-3xl">${islandEmoji(island.name)}</span>
        <div class="flex gap-1.5">
          ${due>0?`<span class="text-xs rounded-full px-2 py-0.5 bg-indigo-500/15 text-indigo-400">${due} fällig</span>`:''}
          <span class="text-xs rounded-full px-2 py-0.5 text-gray-600" style="background:#1a1a24">${sents.length} Sätze</span>
        </div>
      </div>
      <h3 class="font-semibold text-sm mb-0.5">${esc(island.name)}</h3>
      <p class="text-xs text-gray-500">${esc(island.language||'–')} · ${esc(island.ttsLang||'–')}</p>
      ${sents[0]?`<p class="text-xs text-gray-700 mt-2 truncate italic">"${esc(sents[0].target)}"</p>`:''}
    </div>`;
  }).join('');
}

function showDetail(id) {
  const island = DB.islands().find(i=>i.id===id);
  if (!island) return;
  activeIslandId = id;
  document.getElementById('islands-grid').classList.add('hidden');
  document.getElementById('island-detail').classList.remove('hidden');
  document.getElementById('detail-name').textContent = island.name;
  document.getElementById('detail-meta').textContent =
    (island.language||'–') + ' · TTS: ' + (island.ttsLang||'–');
  renderSentences(island);
}

function closeDetail() {
  activeIslandId = null;
  document.getElementById('islands-grid').classList.remove('hidden');
  document.getElementById('island-detail').classList.add('hidden');
}

function renderSentences(island) {
  const list = document.getElementById('sentences-list');
  if (!(island.sentences||[]).length) {
    list.innerHTML = '<div class="text-center py-12 text-gray-600 text-sm">Noch keine Sätze – füge den ersten hinzu!</div>';
    return;
  }
  const now   = Date.now();
  const eodMs = (() => { const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); })();

  list.innerHTML = island.sentences.map((s,i) => {
    const srs = s.srs || SRS0;
    let badge='';
    if      (srs.state==='new')                                badge='<span class="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Neu</span>';
    else if (srs.state==='learning'&&(srs.due||0)<=now)        badge='<span class="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Lernen</span>';
    else if (srs.state==='review'  &&(srs.due||0)<=eodMs)      badge='<span class="text-xs px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">Fällig</span>';
    else if (srs.state==='review') {
      const d=new Date(srs.due); badge=`<span class="text-xs text-gray-700">${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</span>`;
    }
    return `
    <div class="sentence-row px-5 py-4 group flex items-start gap-3">
      <span class="text-xs text-gray-700 font-mono mt-0.5 flex-shrink-0 w-5 text-right">${i+1}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-0.5 flex-wrap">
          <p class="text-gray-200 font-medium text-sm leading-snug">${esc(s.target)}</p>
          ${badge}
        </div>
        <p class="text-xs text-gray-500">${esc(s.native||'')}</p>
        ${s.notes?`<p class="text-xs text-gray-700 mt-0.5 italic">${esc(s.notes)}</p>`:''}
      </div>
      <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onclick="ttsPlay('${island.id}','${s.id}')"
                class="p-1.5 text-gray-600 hover:text-indigo-400 transition-colors" title="Anhören">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15.536 8.464a5 5 0 010 7.072M12 6v12M8.464 9.536a5 5 0 000 4.928"/>
          </svg>
        </button>
        <button onclick="editSentence('${island.id}','${s.id}')"
                class="p-1.5 text-gray-600 hover:text-amber-400 transition-colors" title="Bearbeiten">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>
        <button onclick="deleteSentence('${island.id}','${s.id}')"
                class="p-1.5 text-gray-600 hover:text-rose-400 transition-colors" title="Löschen">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

function openAddIsland() { openModal('modal-island'); setTimeout(()=>document.getElementById('in-island-name').focus(),60); }

function openAIIsland() {
  document.getElementById('ai-island-name').value  = '';
  document.getElementById('ai-island-lang').value  = '';
  document.getElementById('ai-island-topic').value = '';
  document.getElementById('ai-island-level').value = 'B1';
  document.getElementById('ai-island-tts').value   = 'en-US';
  document.getElementById('ai-island-status').classList.add('hidden');
  document.getElementById('ai-island-btn').disabled = false;
  openModal('modal-ai-island');
  setTimeout(()=>document.getElementById('ai-island-name').focus(), 60);
}

async function generateAIIsland() {
  const name  = document.getElementById('ai-island-name').value.trim();
  const lang  = document.getElementById('ai-island-lang').value.trim();
  const level = document.getElementById('ai-island-level').value;
  const tts   = document.getElementById('ai-island-tts').value;
  const topic = document.getElementById('ai-island-topic').value.trim();

  if (!name)  { document.getElementById('ai-island-name').focus();  return; }
  if (!lang)  { document.getElementById('ai-island-lang').focus();  return; }
  if (!topic) { document.getElementById('ai-island-topic').focus(); return; }

  document.getElementById('ai-island-btn').disabled = true;
  document.getElementById('ai-island-status').classList.remove('hidden');

  try {
    const data = await callProxy('gpt-generate', {
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content:
          'Du bist ein professioneller Sprachlehrer. Erstelle exakt 50 Sätze zum Lernen von ' + lang +
          ' auf Niveau ' + level + '. Thema: ' + topic + '. ' +
          'Gib ein JSON-Objekt zurück: { "sentences": [ { "target": "Satz in ' + lang + '", "native": "Deutsche Übersetzung", "notes": "Kontext oder Verwendungshinweis" }, ... ] }. ' +
          'Nur JSON, kein Text davor oder danach. Genau 50 Einträge.'
        },
        { role: 'user', content: 'Generiere die 50 Sätze jetzt.' }
      ]
    });
    const parsed = JSON.parse(data.choices[0].message.content);
    const sentences = parsed.sentences;
    if (!Array.isArray(sentences) || !sentences.length) throw new Error('Keine Sätze erhalten.');

    const now = Date.now();
    const island = {
      id: uid(), name, language: lang, ttsLang: tts, createdAt: now,
      sentences: sentences.map(s => ({
        id: uid(),
        target: s.target || '',
        native: s.native || '',
        notes:  s.notes  || '',
        addedAt: now,
        srs: { ...SRS0 }
      }))
    };
    const islands = DB.islands();
    islands.push(island);
    DB.setIslands(islands);
    autoSync();
    closeModal('modal-ai-island');
    renderIslands();
    showDetail(island.id);
  } catch(e) {
    document.getElementById('ai-island-status').classList.add('hidden');
    document.getElementById('ai-island-btn').disabled = false;
    alert('Fehler: ' + e.message);
  }
}

function saveIsland() {
  const name = document.getElementById('in-island-name').value.trim();
  const lang = document.getElementById('in-island-lang').value.trim();
  const tts  = document.getElementById('in-island-tts').value;
  if (!name) { document.getElementById('in-island-name').focus(); return; }
  const islands = DB.islands();
  islands.push({ id:uid(), name, language:lang||'?', ttsLang:tts, sentences:[], createdAt:Date.now() });
  DB.setIslands(islands);
  autoSync();
  closeModal('modal-island');
  renderIslands();
}

let editingSentId = null;

function openAddSentence() {
  editingSentId = null;
  document.getElementById('modal-sent-title').textContent = 'Satz hinzufügen';
  document.getElementById('in-sent-target').value = '';
  document.getElementById('in-sent-native').value = '';
  document.getElementById('in-sent-notes').value  = '';
  openModal('modal-sentence');
  setTimeout(()=>document.getElementById('in-sent-target').focus(),60);
}

function editSentence(islandId, sentId) {
  const island = DB.islands().find(i=>i.id===islandId);
  const s = island?.sentences?.find(s=>s.id===sentId);
  if (!s) return;
  editingSentId = sentId;
  document.getElementById('modal-sent-title').textContent = 'Satz bearbeiten';
  document.getElementById('in-sent-target').value = s.target || '';
  document.getElementById('in-sent-native').value = s.native || '';
  document.getElementById('in-sent-notes').value  = s.notes  || '';
  openModal('modal-sentence');
  setTimeout(()=>document.getElementById('in-sent-target').focus(),60);
}

function saveSentence() {
  const target = document.getElementById('in-sent-target').value.trim();
  const native = document.getElementById('in-sent-native').value.trim();
  const notes  = document.getElementById('in-sent-notes').value.trim();
  if (!target) { document.getElementById('in-sent-target').focus(); return; }
  const islands = DB.islands();
  const island  = islands.find(i=>i.id===activeIslandId);
  if (!island) return;
  if (!island.sentences) island.sentences=[];
  if (editingSentId) {
    const s = island.sentences.find(s=>s.id===editingSentId);
    if (s) { s.target = target; s.native = native; s.notes = notes; }
  } else {
    island.sentences.push({ id:uid(), target, native, notes, addedAt:Date.now(), srs:{...SRS0} });
  }
  DB.setIslands(islands);
  autoSync();
  closeModal('modal-sentence');
  renderSentences(island);
}

function deleteSentence(islandId, sentId) {
  const islands = DB.islands();
  const island  = islands.find(i=>i.id===islandId);
  if (!island) return;
  island.sentences = (island.sentences||[]).filter(s=>s.id!==sentId);
  DB.setIslands(islands);
  autoSync();
  renderSentences(island);
}

function deleteIsland() {
  if (!activeIslandId) return;
  if (!confirm('Island und alle Sätze wirklich löschen?')) return;
  DB.setIslands(DB.islands().filter(i=>i.id!==activeIslandId));
  autoSync();
  closeDetail(); renderIslands();
}

// ── TTS / voices ──────────────────────────────────────────────
let currentAudio = null;

function ttsPlay(islandId, sentId) {
  const island = DB.islands().find(i => i.id === islandId);
  const sent   = (island?.sentences||[]).find(s => s.id === sentId);
  if (!sent) return;
  ttsSpeak(sent.target, 1);
}

// ── Audio helpers ─────────────────────────────────────────────
async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();
  const channelData = audioBuffer.getChannelData(0);
  const numSamples  = channelData.length;
  const wavBuffer   = new ArrayBuffer(44 + numSamples * 2);
  const view        = new DataView(wavBuffer);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0,'RIFF'); view.setUint32(4, 36 + numSamples * 2, true);
  str(8,'WAVE'); str(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,16000,true); view.setUint32(28,32000,true);
  view.setUint16(32,2,true); view.setUint16(34,16,true);
  str(36,'data'); view.setUint32(40, numSamples * 2, true);
  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
  }
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

// ── Azure Pronunciation Assessment ────────────────────────────
async function azurePronounce(blob, lang, referenceText) {
  try {
    const wav   = await blobToWav(blob);
    const buf   = await wav.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary  = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64   = btoa(binary);
    const data = await callProxy('azure', {
      audioBase64: b64,
      mimeType: 'audio/wav',
      language: lang,
      referenceText
    });
    const words = data?.NBest?.[0]?.Words;
    if (!words?.length) return null;
    if (!words.some(w => w.AccuracyScore != null && w.ErrorType != null)) return null;
    return buildAzureHTML(words, data.NBest[0].PronScore);
  } catch(e) {
    if (e.message !== 'not_logged_in' && e.message !== 'credits_exhausted')
      console.warn('Azure Pronunciation:', e.message);
    return null;
  }
}

function buildAzureHTML(words, pronScore) {
  let total = 0, scoreSum = 0;
  const spans = words.map(w => {
    // REST API: AccuracyScore and ErrorType are directly on the word object
    const err = w.ErrorType || 'None';
    const acc = w.AccuracyScore ?? 0;
    if (err === 'Omission')  return `<span class="text-gray-600 line-through opacity-50">${w.Word}</span>`;
    if (err === 'Insertion') return `<span class="text-orange-400 opacity-70"><em>${w.Word}</em></span>`;
    total++; scoreSum += acc;
    if (acc >= 80) return `<span class="text-emerald-400 font-medium">${w.Word}</span>`;
    if (acc >= 50) return `<span class="text-amber-400">${w.Word}</span>`;
    return `<span class="text-rose-400 line-through opacity-70">${w.Word}</span>`;
  });
  const score = pronScore != null ? Math.round(pronScore) : (total > 0 ? Math.round(scoreSum / total) : 0);
  return { html: spans.join(' '), score };
}

// ── IPA ───────────────────────────────────────────────────────
async function getIPA(sentence, lang) {
  const cacheKey = 'hl_ipa_' + sentence;
  const cached = localStorage.getItem(cacheKey);
  if (cached !== null) return cached;
  try {
    const data = await callProxy('gpt-ipa', {
      messages: [{ role: 'user', content: `Give only the IPA phonetic transcription for this sentence in ${lang}. Reply with only the IPA surrounded by forward slashes, nothing else: "${sentence}"` }]
    });
    const ipa = data.choices?.[0]?.message?.content?.trim() || '';
    localStorage.setItem(cacheKey, ipa);
    return ipa;
  } catch { return ''; }
}

// ── shadowing ─────────────────────────────────────────────────
let shadow = { islandId:null, sentences:[], idx:0 };
let ttsPlaying=false;
let shadowRecActive = false, shadowRecStartTime = 0, shadowAutoTimer = null;

function initShadowSel() {
  const sel = document.getElementById('shadow-island-sel');
  const islands = DB.islands();
  sel.innerHTML = '<option value="">– wählen –</option>' +
    islands.map(i=>`<option value="${i.id}">${esc(i.name)} (${(i.sentences||[]).length})</option>`).join('');
  if (shadow.islandId) { sel.value=shadow.islandId; loadShadowIsland(); }
}

function loadShadowIsland() {
  const id = document.getElementById('shadow-island-sel').value;
  if (!id) {
    document.getElementById('shadow-empty').classList.remove('hidden');
    document.getElementById('shadow-player').classList.add('hidden');
    return;
  }
  const island = DB.islands().find(i=>i.id===id);
  if (!island || !(island.sentences||[]).length) {
    document.getElementById('shadow-empty').innerHTML =
      '<div class="text-4xl mb-3">📭</div><p class="text-sm">Keine Sätze in dieser Island.</p>';
    document.getElementById('shadow-empty').classList.remove('hidden');
    document.getElementById('shadow-player').classList.add('hidden');
    return;
  }
  const savedIdx = parseInt(localStorage.getItem('hl_shadow_idx_' + id)) || 0;
  shadow.islandId=id; shadow.sentences=island.sentences; shadow.idx=Math.min(savedIdx, island.sentences.length-1); shadow.ttsLang=island.ttsLang||'en-US';
  document.getElementById('shadow-empty').classList.add('hidden');
  document.getElementById('shadow-player').classList.remove('hidden');
  renderShadowCard();
}

function renderShadowCard() {
  const s = shadow.sentences[shadow.idx];
  document.getElementById('shadow-prog').textContent             = `${shadow.idx+1} / ${shadow.sentences.length}`;
  document.getElementById('shadow-sentence').textContent         = s.target;
  document.getElementById('shadow-translation-pre').textContent  = s.native || '';
  document.getElementById('shadow-translation').textContent      = s.native || '';
  document.getElementById('shadow-ipa').textContent              = '…';

  document.getElementById('shadow-translation-pre').classList.add('opacity-0');
  document.getElementById('shadow-sentence-wrap').classList.add('opacity-0');
  document.getElementById('shadow-rec-area').classList.add('hidden');
  document.getElementById('pron-text').classList.add('opacity-0');
  document.getElementById('shadow-phase12').classList.remove('hidden');
  const p3 = document.getElementById('shadow-phase3');
  p3.classList.add('hidden'); p3.classList.remove('flex');
  cancelShadowAutoAdvance();
  stopTTS();

  localStorage.setItem('hl_shadow_idx_' + shadow.islandId, shadow.idx);

  getIPA(s.target, shadow.ttsLang || 'en-US').then(ipa => {
    document.getElementById('shadow-ipa').textContent = ipa;
  });

  // Translation sofort einblenden — Deutsch sehen während Englisch spielt
  setTimeout(() => {
    document.getElementById('shadow-translation-pre').classList.remove('opacity-0');
  }, 80);

  const rate = parseFloat(document.getElementById('tts-rate').value) || 1;
  ttsSpeak(s.target, rate, () => {
    document.getElementById('shadow-sentence-wrap').classList.remove('opacity-0');
    document.getElementById('shadow-rec-area').classList.remove('hidden');
  });
}

function shadowNext() { cancelShadowAutoAdvance(); if(shadow.idx<shadow.sentences.length-1){shadow.idx++;renderShadowCard();} }
function shadowPrev() { cancelShadowAutoAdvance(); if(shadow.idx>0){shadow.idx--;renderShadowCard();} }

function stopTTS() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  window.speechSynthesis && window.speechSynthesis.cancel();
  ttsPlaying = false;
  document.getElementById('icon-play').classList.remove('hidden');
  document.getElementById('icon-stop').classList.add('hidden');
  document.getElementById('waveform').classList.add('hidden');
}

async function ttsSpeak(text, rate = 1, onComplete = null) {
  if (ttsPlaying) { stopTTS(); return; }
  const voice = document.getElementById('voice-sel')?.value || 'nova';
  ttsPlaying = true;
  document.getElementById('icon-play').classList.add('hidden');
  document.getElementById('icon-stop').classList.remove('hidden');
  document.getElementById('waveform').classList.remove('hidden');
  try {
    const data  = await callProxy('tts', { text, voice, speed: rate });
    const bytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
    const url   = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    currentAudio = new Audio(url);
    currentAudio.onended = () => { URL.revokeObjectURL(url); stopTTS(); if (onComplete) onComplete(); };
    currentAudio.onerror = stopTTS;
    await currentAudio.play();
  } catch(e) {
    stopTTS();
    if (e.message !== 'not_logged_in' && e.message !== 'credits_exhausted')
      alert('TTS Fehler: ' + e.message);
  }
}

function playShadowTTS() {
  if (ttsPlaying) { stopTTS(); return; }
  const island = DB.islands().find(i => i.id === shadow.islandId);
  if (!island) return;
  const s    = shadow.sentences[shadow.idx];
  const rate = parseFloat(document.getElementById('tts-rate').value) || 1;
  ttsSpeak(s.target, rate, () => {
    document.getElementById('shadow-sentence-wrap').classList.remove('opacity-0');
    document.getElementById('shadow-rec-area').classList.remove('hidden');
  });
}

// ── Whisper + Word-Diff ───────────────────────────────────────
let mediaRecorder = null, audioChunks = [];

async function whisperTranscribe(blob, lang) {
  const buf   = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary  = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64   = btoa(binary);
  const data = await callProxy('whisper', {
    audioBase64: b64,
    mimeType: blob.type || 'audio/webm',
    language: lang.split('-')[0]
  });
  return data.text || '';
}

function wordDiffHTML(transcript, target) {
  const norm = s => s.toLowerCase().replace(/[^\w\s']/g, '').trim();
  const tWords = norm(target).split(/\s+/);
  const gWords = norm(transcript).split(/\s+/);
  // LCS-based alignment
  const m = tWords.length, n = gWords.length;
  const dp = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = tWords[i-1] === gWords[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tWords[i-1] === gWords[j-1]) { result.unshift({word:gWords[j-1],ok:true}); i--; j--; }
    else if (i > 0 && (j === 0 || dp[i-1][j] >= dp[i][j-1])) i--;
    else { result.unshift({word:gWords[j-1],ok:false}); j--; }
  }
  const correct = result.filter(r=>r.ok).length;
  const score   = Math.round((correct / Math.max(tWords.length, 1)) * 100);
  const html    = result.map(r => r.ok
    ? `<span class="text-emerald-400 font-medium">${r.word}</span>`
    : `<span class="text-rose-400 line-through opacity-70">${r.word}</span>`
  ).join(' ');
  return { html, score };
}

// pronunciation check
async function startShadowRec(event) {
  event?.preventDefault();
  if (shadowRecActive) return;

  const island = DB.islands().find(i => i.id === shadow.islandId);
  const lang   = island?.ttsLang || 'en-US';
  const target = shadow.sentences[shadow.idx].target;

  const uiOn  = () => {
    document.getElementById('rec-dot').classList.add('animate-pulse');
    document.getElementById('rec-label').textContent = 'Aufnahme läuft…';
    document.getElementById('btn-record').classList.add('bg-rose-500/20');
  };
  const uiOff = (lbl = 'Halten zum Nachsprechen') => {
    document.getElementById('rec-dot').classList.remove('animate-pulse');
    document.getElementById('rec-label').textContent = lbl;
    document.getElementById('btn-record').classList.remove('bg-rose-500/20');
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks   = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstart = () => {
      shadowRecActive = true;
      shadowRecStartTime = Date.now();
      uiOn();
      const stopFn = () => {
        stopShadowRec();
        document.removeEventListener('mouseup', stopFn);
        document.removeEventListener('touchend', stopFn);
      };
      document.addEventListener('mouseup', stopFn);
      document.addEventListener('touchend', stopFn);
    };
    mediaRecorder.onstop = async () => {
      shadowRecActive = false;
      stream.getTracks().forEach(t => t.stop());
      uiOff('Analysiere…');
      try {
        const blob   = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const result = await azurePronounce(blob, lang, target);
        if (result) { showPronResult(result.html, result.score); }
        else {
          const transcript = await whisperTranscribe(blob, lang);
          if (transcript) { const r = wordDiffHTML(transcript, target); showPronResult(r.html, r.score); }
          else uiOff();
        }
      } catch(e) {
        if (e.message !== 'not_logged_in' && e.message !== 'credits_exhausted') alert('Fehler: ' + e.message);
        uiOff();
      }
    };
    mediaRecorder.start();
  } catch(e) {
    if (e.name === 'NotAllowedError') alert('Mikrofon-Zugriff verweigert.');
    else alert('Aufnahme-Fehler: ' + e.message);
  }
}

function stopShadowRec() {
  if (!shadowRecActive || !mediaRecorder || mediaRecorder.state === 'inactive') return;
  const elapsed = Date.now() - shadowRecStartTime;
  if (elapsed < 400) {
    setTimeout(() => { if (shadowRecActive) mediaRecorder.stop(); }, 400 - elapsed);
  } else {
    mediaRecorder.stop();
  }
}

function similarity(a,b){
  const norm=s=>s.toLowerCase().replace(/[^\w\s]/g,'').trim();
  const s1=norm(a),s2=norm(b);
  if(s1===s2)return 100; if(!s1||!s2)return 0;
  const w1=s1.split(/\s+/),w2=s2.split(/\s+/);
  let hit=0; w2.forEach(w=>{if(w1.includes(w))hit++;});
  const wS=hit/Math.max(w1.length,w2.length)*100;
  const cS=(1-lev(s1,s2)/Math.max(s1.length,s2.length))*100;
  return Math.round(wS*.6+cS*.4);
}
function lev(a,b){
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i?j?0:i:j));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j-1],dp[i-1][j],dp[i][j-1]);
  return dp[m][n];
}
function showPronResult(html, score) {
  let label, barColor, scoreClass;
  if      (score >= 85) { label = 'Ausgezeichnet! 🎉'; barColor = '#34d399'; scoreClass = 'text-emerald-400'; }
  else if (score >= 65) { label = 'Gut 👍';            barColor = '#818cf8'; scoreClass = 'text-indigo-400'; }
  else if (score >= 40) { label = 'Üb weiter 💪';      barColor = '#fbbf24'; scoreClass = 'text-amber-400'; }
  else                  { label = 'Nochmal';            barColor = '#f87171'; scoreClass = 'text-rose-400'; }

  document.getElementById('shadow-phase12').classList.add('hidden');
  const p3 = document.getElementById('shadow-phase3');
  p3.classList.remove('hidden'); p3.classList.add('flex');

  // Satz freischalten wenn ≥50% (einmalig)
  if (score >= 50) {
    const sent = shadow.sentences[shadow.idx];
    if (!sent.shadowedAt) {
      const islands = DB.islands();
      const island  = islands.find(i => i.id === shadow.islandId);
      const dbSent  = (island?.sentences || []).find(s => s.id === sent.id);
      if (dbSent) { dbSent.shadowedAt = Date.now(); DB.setIslands(islands); autoSync(); }
      sent.shadowedAt = Date.now();
    }
  }

  // Korrekter Zielsatz + deutsche Bedeutung (bereits durch renderShadowCard gesetzt)
  document.getElementById('shadow-target-p3').textContent = shadow.sentences[shadow.idx].target;

  // Erkannter Satz mit Highlighting (verzögert)
  const pText = document.getElementById('pron-text');
  pText.innerHTML = html;
  pText.classList.add('opacity-0');
  setTimeout(() => pText.classList.remove('opacity-0'), 400);

  // Score: eine Zeile, subtil
  const scoreInline = document.getElementById('pron-score-inline');
  scoreInline.textContent = label + ' · ' + score + '%';
  scoreInline.className = 'text-sm font-medium mb-2 ' + scoreClass;

  // Score-Bar
  const bar = document.getElementById('pron-bar');
  bar.style.backgroundColor = barColor;
  bar.style.width = '0%';
  setTimeout(() => bar.style.width = score + '%', 50);

  // Kontextueller Hinweis bei niedrigem Score
  const hint = document.getElementById('shadow-hint');
  if (score < 30) {
    hint.textContent = 'Zielsatz kaum erkannt — versuch ihn nochmal langsam.';
    hint.classList.remove('hidden');
  } else if (score < 50) {
    hint.textContent = 'Fast — ein Wort fehlt oder ist abgewichen.';
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }

  // Auto-Continue nur bei ≥95%, 1s Pause dann 4s Countdown
  if (score >= 95) {
    setTimeout(() => {
      let secs = 4;
      document.getElementById('shadow-auto-advance').classList.remove('hidden');
      document.getElementById('shadow-auto-countdown').textContent = secs;
      shadowAutoTimer = setInterval(() => {
        secs--;
        if (secs <= 0) { cancelShadowAutoAdvance(); shadowNext(); }
        else document.getElementById('shadow-auto-countdown').textContent = secs;
      }, 1000);
    }, 1000);
  }
}

function retryShadow() {
  cancelShadowAutoAdvance();
  const p3 = document.getElementById('shadow-phase3');
  p3.classList.add('hidden'); p3.classList.remove('flex');
  document.getElementById('shadow-phase12').classList.remove('hidden');
  document.getElementById('shadow-translation-pre').classList.remove('opacity-0');
  document.getElementById('shadow-sentence-wrap').classList.remove('opacity-0');
  document.getElementById('shadow-rec-area').classList.remove('hidden');
  document.getElementById('shadow-hint').classList.add('hidden');
  document.getElementById('rec-dot').classList.remove('animate-pulse');
  document.getElementById('rec-label').textContent = 'Halten zum Nachsprechen';
  document.getElementById('btn-record').classList.remove('bg-rose-500/20');
}

function cancelShadowAutoAdvance() {
  if (shadowAutoTimer) { clearInterval(shadowAutoTimer); shadowAutoTimer = null; }
  const el = document.getElementById('shadow-auto-advance');
  if (el) el.classList.add('hidden');
}

function toggleShadowSettings() {
  document.getElementById('shadow-settings').classList.toggle('hidden');
}

// ── SRS Review Session ────────────────────────────────────────
let srsQ = {
  queue:[], again:[], current:null, flipped:false,
  total:0, done:0,
  counts:{again:0,hard:0,good:0,easy:0}
};

function initSRSSetup() {
  const islands = DB.islands();
  const sel = document.getElementById('srs-island-sel');
  sel.innerHTML='<option value="all">Alle Islands</option>'+
    islands.map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join('');

  refreshSRSCounts();
  document.getElementById('srs-voice-row').classList.remove('hidden');

  document.getElementById('srs-setup').classList.remove('hidden');
  document.getElementById('srs-session').classList.add('hidden');
  document.getElementById('srs-complete').classList.add('hidden');
}

function refreshSRSCounts() {
  const islandId = document.getElementById('srs-island-sel')?.value || 'all';
  const stats = getSRSStats(islandId);
  document.getElementById('srs-due-count').textContent  = stats.due + stats.learning;
  document.getElementById('srs-new-count').textContent  = stats.newC;
  document.getElementById('srs-learn-count').textContent= stats.learning;

  const total = stats.due + stats.learning + stats.newC;
  document.getElementById('srs-no-cards').classList.toggle('hidden', total > 0);
  document.getElementById('srs-start-btn').disabled = total === 0;

  const lockedHint = document.getElementById('srs-locked-hint');
  if (stats.newLocked > 0) {
    document.getElementById('srs-locked-count').textContent = stats.newLocked;
    lockedHint.classList.remove('hidden');
  } else {
    lockedHint.classList.add('hidden');
  }
  document.getElementById('srs-start-btn').className = total > 0
    ? 'w-full py-3 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors'
    : 'w-full py-3 rounded-xl font-semibold bg-gray-800 text-gray-600 cursor-not-allowed';
}

document.addEventListener('change', e => {
  if (e.target.id === 'srs-island-sel') { refreshSRSCounts(); }
});

function startSRS() {
  const islands   = DB.islands();
  const islandId  = document.getElementById('srs-island-sel').value;
  const dir       = 'native';
  const settings  = DB.settings();
  const maxNew    = settings.newPerDay || 20;
  const now       = Date.now();
  const eodMs     = (() => { const d=new Date(); d.setHours(23,59,59,999); return d.getTime(); })();

  // Collect sentences with their island context
  let reviewCards=[], learningCards=[], newCards=[];
  islands.forEach(island => {
    if (islandId !== 'all' && island.id !== islandId) return;
    (island.sentences||[]).forEach(s => {
      const st=s.srs?.state||'new';
      const entry={ islandId:island.id, ttsLang:island.ttsLang, sentId:s.id };
      if      (st==='review'   && (s.srs?.due||0)<=eodMs) reviewCards.push(entry);
      else if (st==='learning' && (s.srs?.due||0)<=now)   learningCards.push(entry);
      else if (st==='new' && s.shadowedAt)                 newCards.push(entry);
    });
  });

  // Shuffle each group
  const shuf=a=>a.sort(()=>Math.random()-.5);
  shuf(reviewCards); shuf(learningCards); shuf(newCards);
  newCards=newCards.slice(0, maxNew);

  const mkCard=(entry)=>({ ...entry, dir:'native' });

  const queue=[...reviewCards,...learningCards,...newCards].map(mkCard);
  if (!queue.length) { alert('Keine fälligen Karten.'); return; }

  srsQ = { queue, again:[], current:null, flipped:false,
            total:queue.length, done:0,
            counts:{again:0,hard:0,good:0,easy:0} };

  document.getElementById('srs-setup').classList.add('hidden');
  document.getElementById('srs-session').classList.remove('hidden');
  document.getElementById('srs-complete').classList.add('hidden');

  loadNextSRSCard();
}

function loadNextSRSCard() {
  // Try main queue first; then again-cards whose due time has passed
  let entry = null;
  if (srsQ.queue.length) {
    entry = srsQ.queue.shift();
  } else if (srsQ.again.length) {
    entry = srsQ.again.shift();
  } else {
    finishSRS(); return;
  }

  // Fetch fresh sentence data
  const islands = DB.islands();
  const island  = islands.find(i=>i.id===entry.islandId);
  const sent    = (island?.sentences||[]).find(s=>s.id===entry.sentId);
  if (!sent || !island) { loadNextSRSCard(); return; }

  srsQ.current = { entry, island, sent };
  srsQ.flipped = false;

  // Stop any running TTS / recognition from previous card
  window.speechSynthesis && window.speechSynthesis.cancel();
  cancelAutoAdvance();
  if (srsRecActive && mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();

  // Reset to phase 1
  const p1 = document.getElementById('srs-phase1');
  const p2 = document.getElementById('srs-phase2');
  p1.classList.remove('hidden'); p1.classList.add('flex');
  p2.classList.add('hidden');    p2.classList.remove('flex');

  document.getElementById('srs-speech-idle').classList.remove('hidden');
  document.getElementById('srs-recording-indicator').classList.add('hidden');
  document.getElementById('srs-recording-indicator').classList.remove('flex');
  document.getElementById('srs-analyzing').classList.add('hidden');
  document.getElementById('srs-mic-label').textContent = 'Halten zum Sprechen';
  document.getElementById('srs-mic-btn').classList.remove('animate-pulse');
  document.getElementById('srs-speech-result').classList.add('hidden');
  document.getElementById('srs-auto-advance').classList.add('hidden');

  // Populate front
  const srs = sent.srs || SRS0;
  const front = entry.dir==='target' ? sent.target : (sent.native||sent.target);
  const back  = entry.dir==='target' ? (sent.native||'–') : sent.target;
  const hint  = entry.dir==='target' ? 'Was bedeutet das?' : 'Wie heißt das?';

  document.getElementById('srs-front-hint').textContent   = hint;
  document.getElementById('srs-front-text').textContent   = front;
  document.getElementById('srs-result-hint').textContent  = hint;
  document.getElementById('srs-result-front').textContent = front;
  document.getElementById('srs-back-text').textContent    = back;

  // Card type badge
  const stLabel = (srs.state==='new')?'Neu':(srs.state==='learning')?'Lernen':'Wiederholung';
  document.getElementById('srs-card-type').textContent   = stLabel;
  document.getElementById('srs-card-island').textContent = island.name;

  // Interval previews on buttons
  document.getElementById('lbl-again').textContent = fmtInterval(srs, 0);
  document.getElementById('lbl-hard').textContent  = fmtInterval(srs, 1);
  document.getElementById('lbl-good').textContent  = fmtInterval(srs, 2);
  document.getElementById('lbl-easy').textContent  = fmtInterval(srs, 3);

  // Progress
  const totalCards = srsQ.total + srsQ.again.length;
  const prog = srsQ.done / Math.max(1, srsQ.total);
  document.getElementById('srs-bar').style.width = Math.round(prog*100)+'%';
  document.getElementById('srs-prog-label').textContent =
    srsQ.done + '/' + (srsQ.total + srsQ.again.length);
}

// ── SRS speech recognition ───────────────────────────────────
let srsRecActive = false;
let srsAutoTimer = null;
let srsRecStartTime = 0;

async function startSRSSpeech(e) {
  e?.preventDefault();
  if (srsRecActive) return;

  const { island, sent } = srsQ.current;
  const lang = island.ttsLang || 'en-US';

  const showRecording = () => {
    document.getElementById('srs-speech-idle').classList.add('hidden');
    document.getElementById('srs-recording-indicator').classList.remove('hidden');
    document.getElementById('srs-recording-indicator').classList.add('flex');
  };
  const showAnalyzing = () => {
    document.getElementById('srs-recording-indicator').classList.add('hidden');
    document.getElementById('srs-recording-indicator').classList.remove('flex');
    document.getElementById('srs-analyzing').classList.remove('hidden');
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks   = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstart = () => {
      srsRecActive = true;
      srsRecStartTime = Date.now();
      showRecording();
      // document-level stop on mouseup / touchend
      const stopFn = () => {
        stopSRSSpeech();
        document.removeEventListener('mouseup', stopFn);
        document.removeEventListener('touchend', stopFn);
      };
      document.addEventListener('mouseup', stopFn);
      document.addEventListener('touchend', stopFn);
    };
    mediaRecorder.onstop = async () => {
      srsRecActive = false;
      stream.getTracks().forEach(t => t.stop());
      showAnalyzing();
      try {
        const blob   = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const result = await azurePronounce(blob, lang, sent.target);
        if (result) { showSRSSpeechResult(result.html, result.score); }
        else {
          const transcript = await whisperTranscribe(blob, lang);
          if (transcript) { const r = wordDiffHTML(transcript, sent.target); showSRSSpeechResult(r.html, r.score); }
          else showPhase2();
        }
      } catch(e) { showPhase2(); }
    };
    mediaRecorder.start();
  } catch(e) {
    if (e.name === 'NotAllowedError') alert('Mikrofon-Zugriff verweigert.');
    else showPhase2();
  }
}

function stopSRSSpeech() {
  if (!srsRecActive || !mediaRecorder || mediaRecorder.state === 'inactive') return;
  const elapsed = Date.now() - srsRecStartTime;
  if (elapsed < 400) {
    setTimeout(() => { if (srsRecActive) mediaRecorder.stop(); }, 400 - elapsed);
  } else {
    mediaRecorder.stop();
  }
}

function showSRSSpeechResult(html, score) {
  document.getElementById('srs-speech-text').innerHTML = html;

  let label, color;
  if      (score >= 90) { label = score + '% – Top! 🎉';       color = '#34d399'; }
  else if (score >= 70) { label = score + '% – Gut 👍';         color = '#818cf8'; }
  else if (score >= 45) { label = score + '% – Weiter üben 💪'; color = '#fbbf24'; }
  else                  { label = score + '% – Nochmal';         color = '#f87171'; }

  const sc = document.getElementById('srs-speech-score');
  sc.textContent = label;
  sc.style.color = color;

  const bar = document.getElementById('srs-speech-bar');
  bar.style.backgroundColor = color;
  bar.style.width = '0%';
  setTimeout(() => bar.style.width = score + '%', 50);

  showPhase2(true);

  // Auto-advance at ≥90%
  if (score >= 90) {
    let secs = 3;
    document.getElementById('srs-auto-advance').classList.remove('hidden');
    document.getElementById('srs-auto-countdown').textContent = secs;
    srsAutoTimer = setInterval(() => {
      secs--;
      if (secs <= 0) { cancelAutoAdvance(); rateSRS(2); }
      else document.getElementById('srs-auto-countdown').textContent = secs;
    }, 1000);
  }
}

function showPhase2(withResult = false) {
  document.getElementById('srs-analyzing').classList.add('hidden');
  const p1 = document.getElementById('srs-phase1');
  const p2 = document.getElementById('srs-phase2');
  p1.classList.add('hidden');    p1.classList.remove('flex');
  p2.classList.remove('hidden'); p2.classList.add('flex');
  if (withResult) document.getElementById('srs-speech-result').classList.remove('hidden');
  srsQ.flipped = true;
}

function skipSRSSpeech() {
  showPhase2(false);
}

function retrySRSSpeech() {
  cancelAutoAdvance();
  const p1 = document.getElementById('srs-phase1');
  const p2 = document.getElementById('srs-phase2');
  p2.classList.add('hidden');    p2.classList.remove('flex');
  p1.classList.remove('hidden'); p1.classList.add('flex');
  document.getElementById('srs-speech-idle').classList.remove('hidden');
  document.getElementById('srs-speech-result').classList.add('hidden');
  document.getElementById('srs-analyzing').classList.add('hidden');
  srsQ.flipped = false;
}

function cancelAutoAdvance() {
  if (srsAutoTimer) { clearInterval(srsAutoTimer); srsAutoTimer = null; }
  const el = document.getElementById('srs-auto-advance');
  if (el) el.classList.add('hidden');
}

function rateSRS(rating) {
  const { entry, island, sent } = srsQ.current;
  if (!sent) return;

  // Again: don't persist yet — keep original SRS state so the card stays
  // visible on the dashboard if the session is ended early
  if (rating === 0) {
    srsQ.counts.again++;
    document.getElementById('ss-again').textContent = srsQ.counts.again;
    srsQ.done++;
    srsQ.again.push(entry);
    loadNextSRSCard();
    return;
  }

  // Update SRS data
  const oldSrs = sent.srs || { ...SRS0 };
  const newSrs = sm2(oldSrs, rating);
  sent.srs = newSrs;

  // Persist
  const islands = DB.islands();
  const isl = islands.find(i=>i.id===island.id);
  if (isl) {
    const s = (isl.sentences||[]).find(s=>s.id===sent.id);
    if (s) s.srs = newSrs;
  }
  DB.setIslands(islands);

  // Track history
  const hist = DB.history();
  const t    = tdStr();
  if (!hist[t]) hist[t]={ reviewed:0, newLearned:0 };
  hist[t].reviewed++;
  if (oldSrs.state==='new') hist[t].newLearned++;
  DB.setHistory(hist);
  autoSync();

  // Update counts display
  const key=['hard','good','easy'][rating-1];
  srsQ.counts[key]++;
  document.getElementById('ss-again').textContent = srsQ.counts.again;
  document.getElementById('ss-hard').textContent  = srsQ.counts.hard;
  document.getElementById('ss-good').textContent  = srsQ.counts.good;
  document.getElementById('ss-easy').textContent  = srsQ.counts.easy;

  srsQ.done++;
  loadNextSRSCard();
}

function finishSRS() {
  document.getElementById('srs-session').classList.add('hidden');
  document.getElementById('srs-complete').classList.remove('hidden');
  document.getElementById('sc-again').textContent = srsQ.counts.again;
  document.getElementById('sc-hard').textContent  = srsQ.counts.hard;
  document.getElementById('sc-good').textContent  = srsQ.counts.good;
  document.getElementById('sc-easy').textContent  = srsQ.counts.easy;
}

function endSRS() { initSRSSetup(); }

// ── settings ──────────────────────────────────────────────────
async function openLibrary() {
  openModal('modal-library');
  const list = document.getElementById('library-list');
  list.innerHTML = '<p class="text-sm text-gray-500">Wird geladen…</p>';
  try {
    const res  = await fetch('islands/catalog.json');
    const catalog = await res.json();
    const existing = DB.islands().map(i => i.name);
    list.innerHTML = catalog.map(pkg => `
      <div class="rounded-xl border border-gray-800 p-4" style="background:#111117">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="font-medium text-sm">${esc(pkg.name)}</span>
              <span class="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">${esc(pkg.level)}</span>
            </div>
            <p class="text-xs text-gray-500 mb-1">${esc(pkg.description)}</p>
            <p class="text-xs text-gray-600">${pkg.sentences} Sätze · ${esc(pkg.language)}</p>
          </div>
          <button onclick="importLibraryIsland('${pkg.file}', '${esc(pkg.name)}')"
                  ${existing.includes(pkg.name) ? 'disabled' : ''}
                  class="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                         ${existing.includes(pkg.name)
                           ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                           : 'bg-indigo-600 hover:bg-indigo-500 text-white'}">
            ${existing.includes(pkg.name) ? 'Importiert ✓' : 'Importieren'}
          </button>
        </div>
      </div>
    `).join('');
  } catch(e) {
    list.innerHTML = '<p class="text-sm text-rose-400">Fehler beim Laden der Bibliothek.</p>';
  }
}

async function importLibraryIsland(file, name) {
  try {
    const res  = await fetch('islands/' + file);
    const data = await res.json();
    const now  = Date.now();
    const island = {
      id: uid(), name: data.name, language: data.language,
      ttsLang: data.ttsLang, createdAt: now,
      sentences: data.sentences.map(s => ({ ...s, id: uid(), addedAt: now, srs: { ...SRS0 } }))
    };
    const islands = DB.islands();
    islands.push(island);
    DB.setIslands(islands);
    autoSync();
    closeModal('modal-library');
    nav('islands');
    renderIslands();
  } catch(e) {
    alert('Fehler beim Importieren: ' + e.message);
  }
}


function saveSettings() {
  const n = Math.max(1, Math.min(100, parseInt(document.getElementById('set-new-per-day').value)||20));
  DB.setSettings({ newPerDay:n });
  autoSync();
  closeModal('modal-settings');
}

function exportData() {
  const blob=new Blob([JSON.stringify({
    islands:DB.islands(),settings:DB.settings(),history:DB.history(),
    exportedAt:new Date().toISOString()
  },null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=`hyperlingua-${tdStr()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}
function triggerImport() { document.getElementById('file-import').click(); }
function importData(e) {
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      if(d.islands)  DB.setIslands(d.islands);
      if(d.settings) DB.setSettings(d.settings);
      if(d.history)  DB.setHistory(d.history);
      closeModal('modal-settings'); nav('dashboard');
      alert('Import erfolgreich!');
    }catch{ alert('Fehler: ungültige JSON-Datei.'); }
  };
  r.readAsText(f);
}
function clearData() {
  if(!confirm('Wirklich ALLE Daten löschen?'))return;
  ['hl_islands','hl_settings','hl_history','hl_updated_at','hl_last_sync'].forEach(k=>localStorage.removeItem(k));
  closeModal('modal-settings'); nav('dashboard');
}

// ── modals ────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  if (id === 'modal-settings') {
    document.getElementById('set-new-per-day').value = DB.settings().newPerDay || 20;
  }
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if(e.key==='Escape')['modal-island','modal-ai-island','modal-sentence','modal-settings','modal-auth'].forEach(closeModal);
  if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)){
    if(currentView==='shadowing'&&shadow.islandId){e.preventDefault();playShadowTTS();}
    if(currentView==='recall'&&document.getElementById('srs-session').offsetParent){
      e.preventDefault();
      if (!srsQ.flipped) startSRSSpeech();
    }
  }
  if(currentView==='shadowing'){
    if(e.code==='ArrowRight')shadowNext();
    if(e.code==='ArrowLeft') shadowPrev();
  }
  if(currentView==='recall'&&srsQ.flipped){
    if(e.key==='1')rateSRS(0);
    if(e.key==='2')rateSRS(1);
    if(e.key==='3')rateSRS(2);
    if(e.key==='4')rateSRS(3);
  }
});

// ── init ──────────────────────────────────────────────────────
(function init() {
  renderDashboard();
  initAuth();
})();

// ── Dialogue ──────────────────────────────────────────────────
let dlg = { islandId: null, lang: 'en-US', history: [], micActive: false, ttsPlaying: false };

function initDialogueView() {
  const sel = document.getElementById('dlg-island-sel');
  const islands = DB.islands();
  sel.innerHTML = '<option value="">Wähle eine Insel…</option>' +
    islands.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
  if (dlg.islandId) sel.value = dlg.islandId;
  dlgSelectIsland();
}

function dlgSelectIsland() {
  const id = document.getElementById('dlg-island-sel').value;
  dlg.islandId = id;
  document.getElementById('dlg-start-area').classList.toggle('hidden', !id);
  document.getElementById('dlg-chat-area').classList.add('hidden');
}

async function gptChat(messages) {
  const data = await callProxy('gpt-dialogue', { messages });
  if (data.error) throw new Error(data.error.message || data.error);
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function startDialogue() {
  const island = DB.islands().find(i => i.id === dlg.islandId);
  if (!island) return;
  dlg.lang = island.ttsLang || 'en-US';
  dlg.history = [];

  document.getElementById('dlg-start-area').classList.add('hidden');
  document.getElementById('dlg-chat-area').classList.remove('hidden');
  document.getElementById('dlg-messages').innerHTML = '';
  document.getElementById('dlg-user-turn').classList.add('hidden');
  document.getElementById('dlg-thinking').classList.remove('hidden');

  const sentences = (island.sentences || []).slice(0, 15).map(s => `- ${s.target}`).join('\n');
  const langName = island.language || 'Englisch';

  const systemPrompt = `You are a friendly, natural conversation partner helping someone practice ${langName}.
The learner's island is called "${island.name}". These are some of their practice sentences:
${sentences}

Rules:
- Respond ONLY in ${langName}
- Keep every response to 1-2 short sentences maximum
- Naturally create situations where the learner can use their practice sentences
- Be encouraging and realistic — like a real colleague or friend
- After about 5 exchanges, wrap up the conversation naturally
- Start the conversation with a brief scenario setup (1 sentence in German in parentheses) then your first line in ${langName}`;

  dlg.history.push({ role: 'system', content: systemPrompt });

  try {
    const firstMsg = await gptChat(dlg.history);
    dlg.history.push({ role: 'assistant', content: firstMsg });

    const scenarioMatch = firstMsg.match(/\(([^)]+)\)/);
    const cleanMsg = firstMsg.replace(/\([^)]+\)\s*/,'').trim();

    if (scenarioMatch) {
      document.getElementById('dlg-scenario').textContent = '📍 ' + scenarioMatch[1];
    }

    document.getElementById('dlg-thinking').classList.add('hidden');
    appendDlgMessage('ai', cleanMsg);
    await dlgSpeak(cleanMsg);
    showDlgUserTurn();
  } catch(e) {
    document.getElementById('dlg-thinking').classList.add('hidden');
    alert('Fehler: ' + e.message);
  }
}

function appendDlgMessage(role, text, score) {
  const wrap = document.getElementById('dlg-messages');
  const div = document.createElement('div');
  div.className = role === 'ai'
    ? 'flex gap-2 items-end'
    : 'flex gap-2 items-end justify-end';

  const bubble = document.createElement('div');
  bubble.className = role === 'ai'
    ? 'max-w-xs rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-gray-100'
    : 'max-w-xs rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-gray-100';
  bubble.style.background = role === 'ai' ? '#1f1f2b' : '#3730a3';
  bubble.textContent = text;

  if (role === 'ai') div.appendChild(bubble);
  else {
    if (score != null) {
      const sc = document.createElement('div');
      sc.className = 'text-xs mb-1 ' + (score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400');
      sc.textContent = score + '%';
      const col = document.createElement('div');
      col.className = 'flex flex-col items-end';
      col.appendChild(bubble); col.appendChild(sc);
      div.appendChild(col);
    } else {
      div.appendChild(bubble);
    }
  }
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

async function dlgSpeak(text) {
  dlg.ttsPlaying = true;
  const btn = document.getElementById('dlg-mic-btn');
  if (btn) btn.disabled = true;
  try { await ttsSpeak(text, 1); } catch(e) { /* ignore */ }
  dlg.ttsPlaying = false;
  if (btn) btn.disabled = false;
}

function showDlgUserTurn() {
  document.getElementById('dlg-user-turn').classList.remove('hidden');
  document.getElementById('dlg-mic-label').textContent = 'Antworten';
  document.getElementById('dlg-mic-dot').className = 'w-2 h-2 rounded-full bg-indigo-400';
}

async function toggleDlgMic() {
  if (dlg.micActive) {
    if (mediaRecorder?.state !== 'inactive') mediaRecorder.stop();
    return;
  }
  dlg.micActive = true;
  document.getElementById('dlg-mic-label').textContent = 'Aufnahme läuft…';
  document.getElementById('dlg-mic-dot').className = 'w-2 h-2 rounded-full bg-rose-400 animate-pulse';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      dlg.micActive = false;
      stream.getTracks().forEach(t => t.stop());
      document.getElementById('dlg-mic-label').textContent = 'Analysiere…';
      document.getElementById('dlg-user-turn').classList.add('hidden');
      document.getElementById('dlg-thinking').classList.remove('hidden');
      try {
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const transcript = await whisperTranscribe(blob, dlg.lang);
        if (!transcript) { showDlgUserTurn(); document.getElementById('dlg-thinking').classList.add('hidden'); return; }

        // Pronunciation score (optional, non-blocking)
        let score = null;
        try {
          const azKey = localStorage.getItem('hl_azure_key');
          const SDK   = window.SpeechSDK;
          if (azKey && SDK) {
            const r = await azurePronounce(blob, dlg.lang, transcript);
            if (r) score = r.score;
          }
        } catch(e) { /* skip */ }

        appendDlgMessage('user', transcript, score);
        dlg.history.push({ role: 'user', content: transcript });

        const reply = await gptChat(dlg.history);
        dlg.history.push({ role: 'assistant', content: reply });
        document.getElementById('dlg-thinking').classList.add('hidden');
        appendDlgMessage('ai', reply);
        await dlgSpeak(reply);
        showDlgUserTurn();
      } catch(e) {
        document.getElementById('dlg-thinking').classList.add('hidden');
        alert('Fehler: ' + e.message);
        showDlgUserTurn();
      }
    };
    mediaRecorder.start();
  } catch(e) {
    dlg.micActive = false;
    document.getElementById('dlg-mic-label').textContent = 'Antworten';
    if (e.name === 'NotAllowedError') alert('Mikrofon-Zugriff verweigert.');
  }
}

function endDialogue() {
  if (mediaRecorder?.state !== 'inactive') mediaRecorder.stop();
  stopTTS();
  dlg.history = [];
  dlg.micActive = false;
  document.getElementById('dlg-chat-area').classList.add('hidden');
  document.getElementById('dlg-start-area').classList.remove('hidden');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
