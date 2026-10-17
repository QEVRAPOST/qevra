/* ---------- controller ---------- */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STORE = 'qevra-aperture-v1';
  const ls = {
    get() { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) { /* storage can be blocked */ } }
  };
  const S = { view: 'landing', route: 'swap', stage: 0, forced: null, reviewed: null, runs: 1, runSel: 0, acts: 1, actSel: 0 };
  const scenes = {};
  const smoothOpt = () => (isReduced() ? 'auto' : 'smooth');
  const stickH = () => (parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0) + ($('#shell') ? $('#shell').offsetHeight : 0) + (($('.view:not([hidden]) .lnav, .view:not([hidden]) .apptop') || {}).offsetHeight || 0);

  function mk(key, id, opts, pointer) {
    if (scenes[key]) return scenes[key];
    const cv = document.getElementById(id); if (!cv) return null;
    const sc = new Scene(cv, drawAperture, opts);
    scenes[key] = sc;
    if (pointer) sc.bindPointer(cv);
    sc.render();
    return sc;
  }

  /* ---------- small builders ---------- */
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const ARROW = '<svg class="arrow" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 7h9M7.5 3.5L11 7l-3.5 3.5"/></svg>';

  function buildShared() {
    const st = DATA.status.map(([k, t]) => `<span class="it ${k}"><span class="mat ${k === 'exp' ? 'outline' : 'dotted'}"></span><span class="t">${esc(t)}</span></span>`).join('');
    $$('.js-status').forEach((el) => { el.innerHTML = st; });
    const cov = DATA.cov.map(([k, kind, mat, status, note]) => `<tr><td class="k">${esc(k)}</td><td class="s"><span class="chip ${kind}"><span class="mat ${mat}"></span>${esc(status)}</span></td><td class="n">${esc(note)}</td></tr>`).join('');
    $$('.js-cov').forEach((el) => { el.innerHTML = cov; });
    $('#app-mark').innerHTML = $('#view-landing .wordmark svg').outerHTML;
  }

  /* =====================================================================================
     LANDING: one pinned 3D stage, scrubbed by scroll between seven keyframes
     ===================================================================================== */
  const KEYS = Object.keys(DATA.K[0]);
  const INTRO_FROM = { explode: 1, scatter: 1, rev: 0, mis: 0, lit: 1, pq: 0, swarm: 0, tilt: .1, zoom: 1, fy: .5 };
  let frames = [], actFrame = -1, heroMis = 0, tryShown = null, hoverRing = -1, introState = 0, scrollQueued = false;

  function buildLanding() {
    $('#facts').innerHTML = DATA.facts.map(([m, t, d]) => `<li><span class="mat ${m}"></span><span><b>${esc(t)}.</b>${esc(d)}</span></li>`).join('');
    const last = DATA.steps.length - 1;
    const html = DATA.steps.map((s, i) => `<article class="frame step" data-k="${i + 1}"${s.id ? ` id="${s.id}"` : ''}><h3>${esc(s.t)}</h3>${s.core ? `<p class="corep">${esc(s.core)}</p>` : ''}<p>${esc(s.p)}</p>${s.note ? `<p class="note"><span class="mat outline"></span><span>${esc(s.note)}</span></p>` : ''}${s.path ? `<ol class="path" aria-label="Three steps">${s.path.map(([m, b, d]) => `<li><span class="mat ${m}"></span><b>${esc(b)}</b><span class="d">${esc(d)}</span></li>`).join('')}</ol>` : ''}${s.cta ? `<button class="btn ghost small" type="button" data-route-go="${s.cta[1]}">${esc(s.cta[0])}</button>` : ''}${i === last ? `<button class="btn primary" type="button" data-launch>Launch App ${ARROW}</button>` : ''}</article>`).join('');
    $('#scol').insertAdjacentHTML('beforeend', html);
    frames = $$('#scol .frame');
    $('#can').innerHTML = DATA.swarmCan.map((t) => `<li>${esc(t)}</li>`).join('');
    $('#cannot').innerHTML = DATA.swarmCannot.map((t) => `<li>${esc(t)}</li>`).join('');
  }

  const CAN_HOVER = !!(window.matchMedia && matchMedia('(hover: hover)').matches);
  function capHTML(act) {
    if (act === 0) return `<b>Figure.</b> ${tryShown == null ? DATA.caps[0] + (CAN_HOVER ? ' Move over a ring to read it.' : '') : DATA.try[tryShown]}`;
    return `<b>Step ${act} of ${DATA.steps.length}.</b> ${DATA.caps[act]}`;
  }
  function setCap(html) { const el = $('#cap'); if (el && el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; } }

  const readTop = () => (innerWidth <= 1024 ? $('#pin').getBoundingClientRect().bottom : stickH());
  function applyScroll() {
    scrollQueued = false;
    if (S.view !== 'landing') return;
    const sc = scenes.main; if (!sc || !frames.length) return;
    const vc = (readTop() + innerHeight) / 2, n = frames.length;
    const c = frames.map((e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; });
    let i = 0; for (let k = 0; k < n; k++) if (c[k] <= vc) i = k;
    let f = 0; if (i < n - 1 && vc > c[i]) f = clamp((vc - c[i]) / (c[i + 1] - c[i]));
    const t = isReduced() ? (f < .5 ? 0 : 1) : smooth(.28, .72, f);
    const act = Math.min(n - 1, f < .5 ? i : i + 1);
    if (act !== 0 && (heroMis || tryShown != null)) { heroMis = 0; tryShown = null; syncTry(); }
    const A = Object.assign({}, DATA.K[i]), B = DATA.K[Math.min(i + 1, n - 1)];
    if (i === 0) A.mis = heroMis;
    const tgt = {};
    KEYS.forEach((k) => { tgt[k] = lerp(A[k], B[k], t); });
    if (introState === 1) return;           /* the one-time intro owns the scene until it finishes */
    sc.set(tgt);
    if (act !== actFrame) {
      actFrame = act;
      frames.forEach((el, k) => el.classList.toggle('on', k === act));
      $('#tryit').classList.toggle('off', act !== 0);
      if (hoverRing < 0) setCap(capHTML(act));
    } else if (act === 0 && hoverRing < 0) setCap(capHTML(0));
  }
  function queueScroll() { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(applyScroll); } }
  function syncTry() { $$('#tryit [data-mis]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.mis === heroMis))); }

  function startIntro() {
    const sc = scenes.main; if (!sc || introState) return;
    if (isReduced() || window.scrollY > 40) { introState = 2; sc.rate = 3.4; applyScroll(); return; }
    introState = 1;
    Object.assign(sc.state, INTRO_FROM); Object.assign(sc.target, INTRO_FROM); sc.render();
    sc.rate = 1.7;
    setTimeout(() => sc.set(Object.assign({}, DATA.K[0], { scatter: 1, pq: 0, swarm: 0 })), 280);
    setTimeout(() => sc.set({ pq: 1, swarm: 1 }), 1500);
    setTimeout(() => { introState = 2; sc.rate = 3.4; applyScroll(); }, 2700);
  }

  function frameCenterScroll(k) {
    const el = frames[k]; if (!el) return;
    const r = el.getBoundingClientRect();
    const y = window.scrollY + r.top + r.height / 2 - (readTop() + innerHeight) / 2;
    window.scrollTo({ top: Math.max(0, y), behavior: smoothOpt() });
  }
  function scrollToId(id) {
    const el = document.getElementById(id); if (!el) return;
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - stickH() - 4, behavior: smoothOpt() });
  }

  function onHover(sc) {
    const h = sc.layout.hover == null ? -1 : sc.layout.hover;
    if (h === hoverRing) return;
    hoverRing = h;
    setCap(h >= 0 ? `<b>Ring ${h + 1} of 8.</b> ${esc(A_DESC[h])}` : capHTML(Math.max(0, actFrame)));
  }

  $('#tryit').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mis]'); if (!b) return;
    heroMis = +b.dataset.mis; tryShown = heroMis; syncTry(); applyScroll(); setCap(capHTML(0));
  });

  /* =====================================================================================
     APP
     ===================================================================================== */
  const ROUTES = [
    ['swap', 'Swap', 'Swap', '<path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4"/>'],
    ['wallet', 'Wallet and PQ Vault', 'Wallet', '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>'],
    ['activity', 'Activity', 'Activity', '<path d="M4 7h16M4 12h16M4 17h10"/>'],
    ['security', 'Security Swarm', 'Swarm', '<ellipse cx="12" cy="8" rx="7" ry="3"/><ellipse cx="12" cy="13" rx="8.5" ry="3.5"/><path d="M12 13v7"/>'],
    ['status', 'Status', 'Status', '<circle cx="12" cy="12" r="8" stroke-dasharray="2 2.5"/><path d="M12 8v5M12 16v.5"/>']
  ];
  const icon = (p, s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const amtVal = () => { const v = parseFloat(($('#amt').value || '').replace(/,/g, '')); return isFinite(v) && v > 0 ? v : NaN; };

  function buildAppNav() {
    $('#rail').innerHTML = ROUTES.map(([k, l, , p]) => `<li><a href="#app-${k}" data-route-go="${k}">${icon(p, 18)}<span>${l}</span></a></li>`).join('');
    $('#tabbar').innerHTML = ROUTES.map(([k, , s, p]) => `<a href="#app-${k}" data-route-go="${k}">${icon(p, 20)}<span>${s}</span></a>`).join('');
    $('#pcState').innerHTML = '<option value="">Automatic, from the setup state</option>' + DATA.bstOrder.map((k) => `<option value="${k}">${esc(DATA.bst[k].l)}</option>`).join('');
  }

  function autoState() {
    if (S.stage === 0) return 'connect';
    if (S.stage === 1) return 'account';
    if (S.stage === 2) return 'key';
    if (S.stage === 3) return 'fund';
    const a = amtVal();
    if (isNaN(a)) return 'amount';
    if (a > 100) return 'balance';
    if (S.reviewed == null) return 'review';
    return S.reviewed === a ? 'route' : 'rereview';
  }
  function renderSwap() {
    const key = S.forced || autoState(), st = DATA.bst[key], btn = $('#swapBtn');
    btn.textContent = st.l; btn.disabled = !!st.dis; btn.dataset.key = key;
    const card = $('#stateCard'); card.dataset.sev = st.sev;
    $('#sc-cause').textContent = st.cause; $('#sc-not').textContent = st.not;
    $('#pcState').value = S.forced || '';
  }
  const ROWS = [['Recipient', 'EXAMPLE'], ['Chain', '46630'], ['Tokens', 'TKN-A to TKN-B'], ['Amount', null], ['Router and allowance', 'Not configured', 'unc'], ['Slippage and minimum out', '0.5%, no quote'], ['Nonce', 'EXAMPLE'], ['Deadline', 'EXAMPLE']];
  function renderIntent() {
    const a = amtVal(), rev = S.reviewed;
    const state = rev == null ? 'none' : (isNaN(a) || a !== rev) ? 'changed' : 'ok';
    $('#itbody').innerHTML = ROWS.map((r, i) => {
      const isAmt = i === 3, unc = r[2] === 'unc';
      const reviewed = rev == null ? '—' : isAmt ? `${fmt(rev)} TKN-A` : r[1];
      const signed = isAmt ? (isNaN(a) ? '—' : `${fmt(a)} TKN-A`) : r[1];
      const chg = isAmt && state === 'changed';
      const m = rev == null ? '<span class="mat dotted"></span>Not reviewed' : chg ? '<span class="mat solid"></span>Changed' : unc ? '<span class="mat dotted"></span>Not set' : '<span class="mat outline"></span>Same';
      return `<tr class="${chg ? 'chg' : unc ? 'unc' : ''}"><td class="k">${esc(r[0])}</td><td class="v">${esc(reviewed)}</td><td class="v">${esc(signed)}</td><td class="m">${m}</td></tr>`;
    }).join('');
    const chip = $('#intentChip');
    chip.className = 'chip' + (state === 'none' ? ' unk' : state === 'changed' ? ' bad' : '');
    chip.innerHTML = state === 'none' ? '<span class="mat dotted"></span>Not reviewed yet' : state === 'changed' ? '<span class="mat solid"></span>1 detail changed' : '<span class="mat outline"></span>Matches your review';
    $('#intent-cap').innerHTML = state === 'none'
      ? (S.stage < 4 ? '<b>Nothing is reviewed yet.</b> Finish the setup to review a swap. The rings stay dark until you do.' : '<b>Nothing is reviewed yet.</b> Review the intent, and the rings light up if every detail matches.')
      : state === 'changed' ? '<b>1 detail differs from what you reviewed: Amount.</b> The light stops at that ring. QEVRA is designed to ask for a fresh review before anything is signed.'
      : '<b>Every set detail matches what you reviewed.</b> The router is not set, so there is nothing to compare there yet.';
    const g = scenes.glyph; if (g) g.set({ lit: rev == null ? 0 : 1, mis: state === 'changed' ? 1 : 0 });
  }
  function renderWallet() {
    const s = S.stage, eoa = $('#led-eoa');
    if (s === 0) {
      eoa.innerHTML = `<h3 id="led-eoa-h">Connected wallet</h3><p class="lt">External account (EOA). Your key stays with you.</p><p style="font-size:14px">No wallet is connected.</p><div class="acts-row"><button class="btn primary small" type="button" data-advance="1">Connect wallet</button></div>`;
    } else {
      eoa.innerHTML = `<h3 id="led-eoa-h">Connected wallet</h3><p class="lt">External account (EOA). Your key stays with you.</p><div class="addr"><span>EXAMPLE ADDRESS</span><span class="chip demo">DEMO DATA</span></div><dl class="kv"><div><dt>Network</dt><dd>Robinhood Testnet</dd></div><div><dt>Protection by QEVRA</dt><dd>None claimed</dd></div></dl><ul class="assets"><li><span>TKN-A</span><b>${s >= 4 ? '300.00' : '400.00'}</b></li><li><span>Gas token</span><b>0.50</b></li></ul>`;
    }
    const q = $('#led-q');
    const head = `<h3 id="led-q-h"><span class="mat outline"></span>QEVRA smart account</h3><p class="lt">PQ Vault · experimental · testnet</p>`;
    if (s < 2) {
      q.innerHTML = head + `<p style="font-size:14px">No QEVRA account yet.</p><p class="lt">Swaps use this account, not your connected wallet. It holds no assets, so none are protected by it.</p><div class="acts-row"><button class="btn ghost small" type="button" data-advance="2"${s === 0 ? ' disabled' : ''}>Create QEVRA account</button></div>${s === 0 ? '<p class="lt">Connect a wallet first.</p>' : ''}`;
    } else {
      const assets = s >= 4 ? '<li><span>TKN-A</span><b>100.00</b></li><li><span>TKN-B</span><b>0.00</b></li>' : '<li class="none"><span>No assets yet</span></li>';
      const btn = s === 2 ? '<button class="btn ghost small" type="button" data-advance="3">Register authorization key</button>' : s === 3 ? '<button class="btn ghost small" type="button" data-advance="4">Fund your QEVRA account</button>' : '';
      q.innerHTML = head + `<div class="addr"><span>EXAMPLE ACCOUNT</span><span class="chip demo">DEMO DATA</span></div><dl class="kv"><div><dt>Authorization</dt><dd>${s >= 3 ? 'ML-DSA, under evaluation' : 'No key registered'}</dd></div><div><dt>Independent audit</dt><dd>None yet</dd></div></dl><ul class="assets">${assets}</ul>${btn ? `<div class="acts-row">${btn}</div>` : ''}`;
    }
    const steps = [['Connect wallet', 'Use the wallet you already have.', ''], ['Create your QEVRA account', 'A separate smart account. Your connected wallet stays as it is.', ''], ['Register an authorization key', 'ML-DSA is under evaluation.', 'Experimental'], ['Fund your QEVRA account', 'Send assets to the account address, after checking the network.', '']];
    $('#setup').innerHTML = steps.map((x, i) => {
      const cls = s > i ? 'done' : s === i ? 'cur' : 'todo';
      const badge = s > i ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 6.4l2.6 2.6L10 3.4"/></svg>' : String(i + 1);
      return `<li class="${cls}"${s === i ? ' aria-current="step"' : ''}><span class="sb">${badge}</span><span class="st"><b style="font-weight:500">${esc(x[0])}</b><small>${esc(x[1])}</small></span><span class="tag">${x[2] || (s > i ? 'Done in this preview' : '')}</span></li>`;
    }).join('');
    const done = Math.min(4, s);
    $('#setupChip').innerHTML = `<span class="mat ${done === 4 ? 'outline' : 'dotted'}"></span>${done} of 4 done`;
    $('#setupChip').className = 'chip' + (done === 4 ? '' : ' unk');
    $('#walletBtn').textContent = s === 0 ? 'Connect wallet' : 'Example wallet';
    $('#setupmini').innerHTML = `<span>Setup: ${done} of 4</span><span class="bar" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</span>${done < 4 ? '<a href="#app-wallet" data-route-go="wallet">Continue setup</a>' : '<span>Example account funded</span>'}`;
  }
  function renderRuns() {
    const runs = $('#runs'), dr = $('#runDrawer');
    if (!S.runs) { runs.innerHTML = `<li class="empty"><b>No runs recorded yet.</b><p>This is not a statement that the system is safe. When a run is recorded, it appears here with its evidence and its limits.</p></li>`; dr.hidden = true; return; }
    dr.hidden = false;
    runs.innerHTML = DATA.runs.map((r, i) => `<li><button type="button" class="run" data-run="${i}" aria-pressed="${i === S.runSel}"><span class="rt"><span>${r.id}</span><span>${esc(r.role)}</span></span><span class="rg">${esc(r.goal)}</span><span><span class="chip ${r.k}"><span class="mat ${r.mat}"></span>${esc(r.st)}</span></span></button></li>`).join('');
    const r = DATA.runs[S.runSel];
    dr.innerHTML = `<h4>${esc(r.goal)}</h4><div class="dm"><span>${r.id}</span><span>${esc(r.role)}</span><span class="chip demo">EXAMPLE</span></div>
      <div class="tr"><b>What this shows</b><span>${esc(r.shows)}</span></div><div class="tr"><b>How it was measured</b><span>${esc(r.how)}</span></div><div class="tr"><b>What it does not show</b><span>${esc(r.not)}</span></div><div class="tr"><b>Limitation</b><span>${esc(r.lim)}</span></div><div class="tr"><b>Evidence</b><span>${esc(r.ev)}</span></div>
      ${r.withheld ? '<div class="withheld">Detail withheld. A real finding links to its responsible disclosure path here, not a blank.</div>' : ''}
      <div class="dock"><i aria-hidden="true"></i><span>Human review dock: unlit. No human review has been recorded.</span></div><p class="wrapnote">By design, a run has no access to keys, signing or funds.</p>`;
  }
  function renderActs() {
    const list = $('#acts'), dt = $('#actDetail');
    if (!S.acts) { list.innerHTML = `<li class="empty" style="margin-top:12px"><b>No transactions yet.</b><p>Your swaps appear here once you make one, each with a plain sentence and a link to the block explorer.</p></li>`; dt.hidden = true; return; }
    dt.hidden = false;
    list.innerHTML = DATA.acts.map((a, i) => `<li><button type="button" class="act" data-act="${i}" aria-pressed="${i === S.actSel}"><span class="as">${esc(a.s)}</span><span class="chip ${a.k}"><span class="mat ${a.mat}"></span>${esc(a.st)}</span><span class="am">EXAMPLE · no hash, no real time</span></button></li>`).join('');
    const a = DATA.acts[S.actSel];
    dt.innerHTML = `<h4>${esc(a.s)}</h4><p style="font-size:13.5px;color:var(--fg-2)">${esc(a.note)}</p><dl class="kv"><div><dt>State</dt><dd>${esc(a.st)}</dd></div><div><dt>Amount</dt><dd>${esc(a.amt)}</dd></div><div><dt>Slippage limit</dt><dd>0.5%</dd></div><div><dt>Account</dt><dd>EXAMPLE ACCOUNT</dd></div><div><dt>Network</dt><dd>Robinhood Testnet 46630</dd></div><div><dt>Block explorer</dt><dd>Link for a real transaction</dd></div></dl>`;
  }
  function renderPC() {
    $$('#pcStage [data-stage]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.stage === S.stage)));
    $$('[data-runs]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.runs === S.runs)));
    $$('[data-acts]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.acts === S.acts)));
  }
  function renderApp() { renderWallet(); renderSwap(); renderIntent(); renderRuns(); renderActs(); renderPC(); saveApp(); }
  function saveApp() { ls.set({ stage: S.stage, runs: S.runs, acts: S.acts }); }

  function setRoute(r, quiet) {
    if (!ROUTES.some((x) => x[0] === r)) r = 'swap';
    S.route = r;
    $$('#view-app [data-route]').forEach((el) => { el.hidden = el.dataset.route !== r; });
    $$('#rail a, #tabbar a').forEach((a) => { if (a.dataset.routeGo === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (!quiet) window.scrollTo({ top: 0, behavior: 'instant' });
    if (r === 'swap' && scenes.glyph) requestAnimationFrame(() => { scenes.glyph._resize(); scenes.glyph.render(); });
  }

  $('#view-app').addEventListener('click', (e) => {
    const t = e.target; let el;
    if ((el = t.closest('[data-route-go]'))) { e.preventDefault(); go('app', el.dataset.routeGo); return; }
    if ((el = t.closest('#pcStage [data-stage]'))) { S.stage = +el.dataset.stage; S.forced = null; if (S.stage < 4) S.reviewed = null; renderApp(); return; }
    if ((el = t.closest('[data-advance]'))) { S.stage = Math.max(S.stage, +el.dataset.advance); S.forced = null; renderApp(); return; }
    if ((el = t.closest('#walletBtn'))) { if (S.stage === 0) { S.stage = 1; S.forced = null; renderApp(); } return; }
    if ((el = t.closest('#swapBtn'))) {
      if (S.forced) return;
      const k = autoState();
      if (k === 'connect') S.stage = 1; else if (k === 'account') S.stage = 2; else if (k === 'key') S.stage = 3; else if (k === 'fund') S.stage = 4;
      else if (k === 'review' || k === 'rereview') S.reviewed = amtVal();
      renderApp(); return;
    }
    if ((el = t.closest('[data-runs]'))) { S.runs = +el.dataset.runs; renderRuns(); renderPC(); saveApp(); return; }
    if ((el = t.closest('[data-acts]'))) { S.acts = +el.dataset.acts; renderActs(); renderPC(); saveApp(); return; }
    if ((el = t.closest('[data-run]'))) { S.runSel = +el.dataset.run; renderRuns(); return; }
    if ((el = t.closest('[data-act]'))) { S.actSel = +el.dataset.act; renderActs(); return; }
    if ((el = t.closest('#pcBtn'))) { const p = $('#pcPanel'); p.hidden = !p.hidden; el.setAttribute('aria-expanded', String(!p.hidden)); return; }
    if ((el = t.closest('#pcReset'))) { S.stage = 0; S.forced = null; S.reviewed = null; S.runs = 1; S.acts = 1; $('#amt').value = '100'; renderApp(); return; }
  });
  $('#amt').addEventListener('input', () => { S.forced = null; renderSwap(); renderIntent(); });
  $('#pcState').addEventListener('change', (e) => { S.forced = e.target.value || null; renderSwap(); });

  /* =====================================================================================
     DESIGN SYSTEM
     ===================================================================================== */
  const LAB_SLIDERS = [['explode', 0, 1, .01], ['scatter', 0, 1, .01], ['rev', 0, 1, .01], ['mis', 0, 1, .01], ['tilt', -.1, .3, .01], ['zoom', 1, 1.6, .01], ['fy', 0, 1, .01], ['pq', 0, 1, .01], ['swarm', 0, 1, .01], ['lit', 0, 1, .01]];
  function buildDesign() {
    const bg = '#0C0D0F', fg = '#ECE8DF';
    $('#swatches').innerHTML = DATA.colors.map(([name, tok, hex, kind, role]) => {
      let cr = 'Not used for text';
      if (kind === 'text') { const r = ratio(hex, bg); cr = `${r.toFixed(1)}:1 on the page${r >= 4.5 ? '' : ' (decorative)'}`; }
      else if (kind === 'surface') { cr = `${ratio(fg, hex).toFixed(1)}:1 for text on it`; }
      return `<div class="sw"><div class="chipc" style="background:${hex}"></div><div class="meta"><b>${esc(name)}</b><code>${hex} · ${tok}</code><small>${esc(role)}</small><span class="cr">${cr}</span></div></div>`;
    }).join('');
    $('#tscale').innerHTML = DATA.typeScale.map(([n, fam, spec, use, cls]) => `<div class="tr"><div class="smp ${cls}">${cls.startsWith('d-') ? 'Authorize every detail' : cls.startsWith('mono') ? 'CHAIN ID 46630 · EXAMPLE ADDR' : 'A swap is a set of promises, and each one is reviewed.'}</div><div class="meta"><b>${n}</b><span>${fam}</span><span>${spec}</span><span>${use}</span></div></div>`).join('');
    $('#spacebars').innerHTML = DATA.tokens.space.map(([t, v]) => `<div><span>${t}</span><span>${v}</span><i style="width:${parseInt(v, 10) * 2}px"></i></div>`).join('');
    $('#radtab').innerHTML = DATA.tokens.radius.map(([a, b, c]) => `<tr><td class="m">${a}</td><td class="m">${b}</td><td>${esc(c)}</td></tr>`).join('');
    $('#mottab').innerHTML = DATA.tokens.motion.map(([a, b, c]) => `<tr><td class="m">${a}</td><td class="m">${b}</td><td>${esc(c)}</td></tr>`).join('');
    $('#ringtab').innerHTML = DATA.rings.map(([i, n, , r, t]) => `<tr><td class="m">${i}</td><td>${esc(n)}</td><td class="m">${r}</td><td class="m">${t === 'A' ? 'cool' : 'warm'}</td></tr>`).join('');
    $('#keytab').innerHTML = DATA.keyNames.map((n, i) => `<tr><td class="m"><button class="btn ghost small" type="button" data-key="${i}" style="min-height:28px;padding:0 10px">K${i}</button></td><td>${esc(n)}</td></tr>`).join('');
    $('#sliders').innerHTML = LAB_SLIDERS.map(([k, a, b, st]) => `<label>${k}<input type="range" min="${a}" max="${b}" step="${st}" value="${DATA.K[0][k]}" data-k="${k}" aria-label="${k}"><output id="o-${k}">${DATA.K[0][k]}</output></label>`).join('') + '<div class="btnrow"><button class="btn ghost small" type="button" id="labHero">Hero state</button></div>';
  }
  function labSet(patch) {
    const sc = scenes.lab; if (!sc) return;
    sc.set(patch, true);
    for (const k in patch) { const i = $(`#sliders [data-k="${k}"]`); if (i) { i.value = patch[k]; $('#o-' + k).textContent = (+patch[k]).toFixed(2); } }
  }
  $('#view-design').addEventListener('input', (e) => { const i = e.target.closest('#sliders [data-k]'); if (!i) return; labSet({ [i.dataset.k]: +i.value }); });
  $('#view-design').addEventListener('click', (e) => {
    let el;
    if ((el = e.target.closest('[data-key]'))) { labSet(DATA.K[+el.dataset.key]); return; }
    if ((el = e.target.closest('#labHero'))) { labSet(DATA.K[0]); return; }
    if ((el = e.target.closest('[data-ds]'))) { e.preventDefault(); const t = document.getElementById(el.dataset.ds); if (t) window.scrollTo({ top: window.scrollY + t.getBoundingClientRect().top - ($('#shell').offsetHeight + 8), behavior: smoothOpt() }); }
  });

  /* =====================================================================================
     NAVIGATION
     ===================================================================================== */
  const built = {};
  function parseHash() {
    const h = (location.hash || '').replace(/^#/, '');
    if (h === 'landing' || h === 'design') return { view: h };
    const m = /^app(?:-(swap|wallet|activity|security|status))?$/.exec(h);
    return m ? { view: 'app', route: m[1] || 'swap' } : null;
  }
  function writeHash() {
    const h = S.view === 'app' ? 'app-' + S.route : S.view;
    try { history.replaceState(null, '', '#' + h); } catch (e) { /* not allowed in some frames */ }
  }
  function ensureView() {
    if (S.view === 'landing' && !built.landing) {
      built.landing = true;
      const sc = new Scene($('#cv-main'), drawAperture, { mode: 'hero', state: Object.assign({}, INTRO_FROM), rate: 3.4, onRender: onHover });
      scenes.main = sc; sc.bindPointer($('#cv-main')); sc.render();
      setCap(capHTML(0));
      requestAnimationFrame(() => { applyScroll(); startIntro(); });
    }
    if (S.view === 'app' && !built.app) {
      built.app = true;
      mk('glyph', 'cv-glyph', { mode: 'glyph', state: { explode: 0, mis: 0, swarm: 0, pq: 1, lit: 0, scatter: 0, rev: 1 }, fitExplode: 0 });
      renderApp();
    }
    if (S.view === 'design' && !built.design) {
      built.design = true;
      mk('lab', 'cv-lab', { mode: 'hero', state: Object.assign({}, DATA.K[0]), rate: 8 }, true);
    }
    const sc = { landing: scenes.main, app: scenes.glyph, design: scenes.lab }[S.view];
    if (sc) { sc._resize(); sc.render(); }
    if (S.view === 'landing') queueScroll();
  }
  function render(keepScroll) {
    $$('#shell [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === S.view)));
    ['landing', 'app', 'design'].forEach((v) => { $('#view-' + v).hidden = S.view !== v; });
    if (S.view === 'app') setRoute(S.route, true);
    if (!keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
    ensureView();
    requestAnimationFrame(ensureView);
    writeHash();
  }
  function go(view, route, keepScroll) {
    if (view) S.view = view;
    if (view === 'app' && route) S.route = route;
    render(keepScroll);
  }
  $$('#shell [data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  $$('#shell [role="tablist"]').forEach((tl) => tl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = $$('[role="tab"]', tl), i = tabs.indexOf(document.activeElement); if (i < 0) return;
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click(); e.preventDefault();
  }));

  /* Launch App: a circular curtain grows from the button, the view swaps underneath, then it fades */
  const curtain = $('#curtain');
  function launch(btn) {
    if (isReduced() || !curtain) { go('app', 'swap'); return; }
    const r = btn.getBoundingClientRect();
    curtain.style.setProperty('--cx', (r.left + r.width / 2) + 'px'); curtain.style.setProperty('--cy', (r.top + r.height / 2) + 'px');
    curtain.classList.add('on');
    setTimeout(() => {
      go('app', 'swap'); curtain.classList.add('off');
      setTimeout(() => { curtain.style.transition = 'none'; curtain.className = ''; void curtain.offsetWidth; curtain.style.transition = ''; }, 460);
    }, 640);
  }
  document.addEventListener('click', (e) => {
    const t = e.target; let el;
    if ((el = t.closest('[data-launch]'))) { launch(el); return; }
    if ((el = t.closest('[data-goto-top]'))) { window.scrollTo({ top: 0, behavior: smoothOpt() }); return; }
    if ((el = t.closest('[data-view-go]'))) { go(el.dataset.viewGo); return; }
    if ((el = t.closest('#view-landing [data-step]'))) { e.preventDefault(); frameCenterScroll(+el.dataset.step + 1); return; }
    if ((el = t.closest('#view-landing [data-scroll]'))) { e.preventDefault(); scrollToId(el.dataset.scroll); return; }
    if ((el = t.closest('#view-landing [data-route-go]'))) { go('app', el.dataset.routeGo); return; }
  });
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', queueScroll);
  window.addEventListener('hashchange', () => { const h = parseHash(); if (h) { if (h.route) S.route = h.route; go(h.view, h.route); } });

  /* ---------- start ---------- */
  buildShared(); buildLanding(); buildAppNav(); buildDesign();
  const saved = ls.get();
  if (saved) { if (saved.stage >= 0 && saved.stage <= 4) S.stage = saved.stage; if (saved.runs === 0) S.runs = 0; if (saved.acts === 0) S.acts = 0; }
  const start = parseHash();
  if (start) { S.view = start.view; if (start.route) S.route = start.route; }
  render(true);
})();
