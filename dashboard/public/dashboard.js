/* dashboard.js – logica della dashboard Ristogen
   Separato da index.astro per mantenere il template leggibile.
   Dipende da: netlify-identity-widget (caricato prima via CDN)
*/

// ── Stato globale ─────────────────────────────────────────────
let _authToken    = null;  // JWT corrente
let _loadStarted  = false; // true non appena iniziamo a caricare la lista clienti

// ── Persistenza deploy in corso (sopravvive al refresh) ───────
const PENDING_KEY = 'ristogen_pending_run';

function savePendingRun(runId, slug, siteUrl) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({
      run_id: runId, slug, site_url: siteUrl, started_at: Date.now()
    }));
  } catch { /* storage non disponibile */ }
}

function clearPendingRun() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

// ── Persistenza "Prossimi passi" (sopravvive al refresh) ──────
const NS_KEY = 'ristogen_next_steps';       // {slug, site_url} — pannello attivo
const NS_STEPS_PREFIX = 'ristogen_ns_steps_';        // per-slug check states

function _getStepsForSlug(slug) {
	try { return JSON.parse(localStorage.getItem(NS_STEPS_PREFIX + slug) || 'null'); } catch { return null; }
}

function saveNextStepsState() {
  const box = document.getElementById('next-steps-box');
  if (!box || !box.classList.contains('visible')) return;
  const slug    = document.getElementById('ns-slug')?.textContent || '';
  const siteUrl = document.getElementById('ns-site-url')?.href    || '';
  const steps   = Array.from(document.querySelectorAll('.step-item'))
                       .map(li => li.classList.contains('done'));
	try {
		localStorage.setItem(NS_KEY, JSON.stringify({ slug, site_url: siteUrl }));
		localStorage.setItem(NS_STEPS_PREFIX + slug, JSON.stringify(steps));
	} catch { }
}

function clearNextStepsState() {
	// Rimuoviamo solo il pannello attivo — i check per-slug restano
  try { localStorage.removeItem(NS_KEY); } catch {}
}

function clearStepsForSlug(slug) {
	try { localStorage.removeItem(NS_STEPS_PREFIX + slug); } catch { }
}

function restoreNextSteps() {
  let d;
  try { d = JSON.parse(localStorage.getItem(NS_KEY) || 'null'); } catch {}
  if (!d?.slug) return;
	showNextSteps(d.slug, d.site_url || '');
}

function resumePendingRun(authToken) {
  let data;
  try { data = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch {}
  if (!data || !data.run_id) return;
  // Scarta se più vecchio di 2 ore
  if (Date.now() - (data.started_at || 0) > 2 * 60 * 60 * 1000) {
    clearPendingRun();
    return;
  }
  showToast(`↻ Monitoraggio ripreso per "${data.slug}"`, '');
	// Ripristina se era già visibile
  let _nsData;
  try { _nsData = JSON.parse(localStorage.getItem(NS_KEY) || 'null'); } catch {}
  if (_nsData?.slug === data.slug) {
	  showNextSteps(data.slug, data.site_url || '');
  }
  startPolling(data.run_id, authToken, data.slug, data.site_url || '');
}

// ── Login / App screen ───────────────────────────────────────
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-content').classList.add('active');
}
function showLoginScreen() {
  document.getElementById('login-screen').style.display = '';
  document.getElementById('main-content').classList.remove('active');
}

// ── Helpers: token corrente ───────────────────────────────────
function currentToken() {
  if (_authToken) return _authToken;
  const u = window.netlifyIdentity && window.netlifyIdentity.currentUser();
  return u && u.token && u.token.access_token || null;
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = "") {
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Badge contatore ───────────────────────────────────────────
function updateCountBadge(n) {
  const b = document.getElementById("clients-count");
  if (b) b.textContent = n > 0 ? n + " landing" : "";
}

// ── Empty-state row ───────────────────────────────────────────
const TABLE_COLS = 5;
function emptyRow(msg) {
  return `<tr><td colspan="${TABLE_COLS}">
    <div class="empty-state">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <path d="M9 12h6M12 9v6"/>
      </svg>
      <p>${msg}</p>
    </div>
  </td></tr>`;
}

// ── Template Picker — data & renderer ─────────────────────────
const TEMPLATES = [
  { value: 'template-01', label: 'Template 01 — Dark', desc: 'Dark — ristorante moderno', thumb: '/templates/template-01.png' },
  { value: 'template-02', label: 'Template 02 — Light', desc: 'Light — elegante e chiaro', thumb: '/templates/template-02.png' }
];
const LANG_FLAGS = { it: '🇮🇹', en: '🇬🇧' };

function renderTemplatePicker(pickerId, hiddenName, hiddenId, defaultValue) {
  const container = document.getElementById(pickerId);
  if (!container) return;
  const val = defaultValue || TEMPLATES[0].value;
  const first = TEMPLATES.find(t => t.value === val) || TEMPLATES[0];
  container.innerHTML = `
    <button type="button" class="tpicker-btn" aria-haspopup="listbox" aria-expanded="false">
      <img class="tpicker-thumb" src="${first.thumb}" alt="" />
      <span class="tpicker-label">${first.label}</span>
      <svg class="tpicker-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"></path></svg>
    </button>
    <ul class="tpicker-list" role="listbox">
      ${TEMPLATES.map(t => `
        <li class="tpicker-item${t.value === val ? ' selected' : ''}" data-value="${t.value}" data-label="${t.label}" role="option">
          <img class="tpicker-item-thumb" src="${t.thumb}" alt="" />
          <div class="tpicker-item-text"><strong>${t.label.split(' — ')[0]}</strong><em>${t.desc}</em></div>
          <div class="tpicker-item-preview"><img src="${t.thumb}" alt="Preview ${t.label}" /><p>${t.label}</p></div>
        </li>
      `).join('')}
    </ul>
    <input type="hidden" id="${hiddenId}" name="${hiddenName}" value="${val}" />
  `;
}

// ── Tabella clienti ───────────────────────────────────────────
async function loadClients(token) {
  if (token) _authToken = token;
  const tok = _authToken || currentToken();
  if (!tok) return;

  // Segnala subito che il caricamento è iniziato (evita override dal retry)
  _loadStarted = true;

  const tbody = document.getElementById("clients-tbody");

  // Skeleton loader
  tbody.innerHTML = Array(3).fill(null).map(() =>
    `<tr>
      <td><span class="skeleton" style="width:90px"></span></td>
      <td><span class="skeleton" style="width:70px"></span></td>
      <td><span class="skeleton" style="width:40px"></span></td>
      <td><span class="skeleton" style="width:140px"></span></td>
      <td><span class="skeleton" style="width:60px"></span></td>
    </tr>`
  ).join('');

  try {
    const r = await fetch("/api/clients", {
      headers: { Authorization: "Bearer " + tok },
    });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText);
    const { clients } = await r.json();

    if (!clients || clients.length === 0) {
      tbody.innerHTML = emptyRow("Nessuna landing ancora creata");
      updateCountBadge(0);
      return;
    }

    updateCountBadge(clients.length);
    tbody.innerHTML = clients.map(c => {
      const url      = c.site_url || "";
      const tpl      = c.template || 'template-01';
      const lang     = c.default_lang || 'it';
      const tplLabel = (TEMPLATES.find(t => t.value === tpl) || TEMPLATES[0]).label;
      const langFlag = LANG_FLAGS[lang] || lang;
      return `<tr data-slug="${c.slug}" data-site-url="${url}">
        <td><span class="slug-chip">${c.slug}</span></td>
        <td><span class="tpl-badge">${tplLabel}</span></td>
        <td>${langFlag}</td>
        <td>${url
          ? `<a href="${url}" target="_blank" rel="noopener">${url} \u2197</a>`
          : '<span style="color:var(--text-light)">\u2014</span>'}</td>
        <td>
        <div class="table-actions">
          <button class="btn-steps" data-slug="${c.slug}" data-site-url="${url}" title="Prossimi passi">\ud83d\ude80</button>
          <button class="btn-edit" data-slug="${c.slug}">Modifica</button>
          <button class="btn-delete" data-slug="${c.slug}">Elimina</button>
        </div>
      </td>
      </tr>`;
    }).join('');

  } catch (e) {
    tbody.innerHTML = emptyRow("Errore caricamento: " + e.message);
    updateCountBadge(0);
  }
}

// ── Netlify Identity ──────────────────────────────────────────
function renderUserInfo(user) {
  const info = document.getElementById("user-info");
  if (!user) { info.innerHTML = ""; return; }
  info.innerHTML = `<span>${user.email || ""}</span>
    <button id="logout-btn">Esci</button>`;
  document.getElementById("logout-btn").addEventListener("click", () =>
    window.netlifyIdentity && window.netlifyIdentity.logout()
  );
  showApp();
}

function tryLoadClients() {
  const user = window.netlifyIdentity && window.netlifyIdentity.currentUser();
  if (!user) return;
  _loadStarted = true;
  renderUserInfo(user);

  // Tenta prima un refresh; se già fresco usa il token attuale
  const tokenNow = user.token && user.token.access_token;
  window.netlifyIdentity.refresh()
    .then(jwt => {
      const tok = jwt || tokenNow;
      if (tok) {
        _authToken = tok;
        loadClients(tok);
        resumePendingRun(tok);
        if (!localStorage.getItem(PENDING_KEY)) restoreNextSteps();
      }
    })
    .catch(() => {
      if (tokenNow) {
        _authToken = tokenNow;
        loadClients(tokenNow);
        resumePendingRun(tokenNow);
        if (!localStorage.getItem(PENDING_KEY)) restoreNextSteps();
      }
    });
}

function initIdentity() {
  if (!window.netlifyIdentity) {
    // Identity widget non disponibile (locale senza Netlify)
    showLoginScreen();
    return;
  }

  window.netlifyIdentity.on("init", user => {
    if (user) {
      tryLoadClients();
    } else {
      showLoginScreen();
    }
  });

  // Login: carica direttamente senza reload
  window.netlifyIdentity.on("login", user => {
    window.netlifyIdentity.close();
    _loadStarted = false; // resetta per permettere un caricamento fresco
    tryLoadClients();
  });

  window.netlifyIdentity.on("logout", () => {
    renderUserInfo(null);
    showLoginScreen();
    _loadStarted = false;
    _authToken = null;
  });

  // Fallback sincrono: se Identity è già pronto al momento dell'esecuzione
  if (window.netlifyIdentity.currentUser()) {
    tryLoadClients();
  } else if (!_loadStarted) {
    // Retry loop: on("init") è asincrono; polling per max 6s
    const MAX = 12, INTERVAL = 500;
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const u = window.netlifyIdentity && window.netlifyIdentity.currentUser();
      if (u) {
        clearInterval(poll);
        tryLoadClients();
      } else if (attempts >= MAX) {
        clearInterval(poll);
        if (!_loadStarted) showLoginScreen();
      }
    }, INTERVAL);
  }
}

// ── Refresh button ────────────────────────────────────────────
document.getElementById("btn-refresh-clients").addEventListener("click", function () {
  this.classList.add("spinning");
  const done = () => this.classList.remove("spinning");
  loadClients().then(done).catch(done);
});

// ── Validazione slug real-time ────────────────────────────────
let slugValid = false;
let slugTimer = null;

document.getElementById("slug").addEventListener("input", function () {
  const hint = document.getElementById("slug-hint");
  const val  = this.value.trim();
  slugValid  = false;
  clearTimeout(slugTimer);

  if (!val) { hint.className = ""; hint.textContent = ""; return; }

  if (!/^[a-z0-9]+([a-z0-9-]*[a-z0-9]+)*$/.test(val)) {
    hint.className = "error";
    hint.textContent = "✗ Formato non valido — solo minuscole, numeri e trattini";
    return;
  }

  hint.className = "checking";
  hint.textContent = "⏳ Verifica disponibilità…";

  slugTimer = setTimeout(async () => {
    const tok = currentToken();
    if (!tok) { hint.className = ""; hint.textContent = ""; return; }
    try {
      const r    = await fetch("/api/validate-slug?slug=" + encodeURIComponent(val), {
        headers: { Authorization: "Bearer " + tok },
      });
      const data = await r.json();
      if (data.valid) {
        slugValid = true;
        hint.className = "ok";
        hint.textContent = "✓ Slug disponibile";
      } else {
        slugValid = false;
        hint.className = "error";
        hint.textContent = "✗ " + (data.errors ? data.errors.join(" — ") : data.error);
      }
    } catch {
      hint.className = ""; hint.textContent = "";
    }
  }, 600);
});

// ── Form submit ───────────────────────────────────────────────
document.getElementById("onboarding-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const btn     = document.getElementById("submit-btn");
  const btnIcon = document.getElementById("submit-icon");
  const btnText = document.getElementById("submit-text");
  const status  = document.getElementById("status");
  status.className = ""; status.textContent = "";

  const tok = currentToken();
  if (!tok) { window.netlifyIdentity && window.netlifyIdentity.open(); return; }
  _authToken = tok;

  const hint = document.getElementById("slug-hint");
  if (!slugValid) {
    hint.className = "error";
    hint.textContent = "✗ Verifica prima la disponibilità dello slug";
    document.getElementById("slug").focus();
    return;
  }

  btn.disabled = true;
  btnIcon.innerHTML = '<span class="spin">⚙</span>';
  btnText.textContent = "Creazione in corso…";

  const formData = new FormData(this);

  try {
    const res  = await fetch("/api/onboarding", {
      method: "POST",
      headers: { Authorization: "Bearer " + tok },
      body: formData,
    });
    const json = await res.json();

    if (res.ok) {
      const newSlug = formData.get("client_slug");
      const siteUrl = json.site_url || "";
      status.className = "success";
      status.innerHTML = `<span>\u2713</span> <span>Landing <strong>${newSlug}</strong> creata \u2014 monitoraggio deploy in corso</span>`;
      showToast(`Landing "${newSlug}" creata!`, "success");
      this.reset();
      document.getElementById("slug-hint").textContent = "";
      slugValid = false;
      if (json.run_id) {
        savePendingRun(json.run_id, newSlug, siteUrl);
        startPolling(json.run_id, tok, newSlug, siteUrl);
      }
      setTimeout(() => loadClients(), 10000);
    } else {
      status.className = "error";
      status.innerHTML = `<span>✗</span> <span>${json.error || res.statusText}</span>`;
    }
  } catch (err) {
    status.className = "error";
    status.innerHTML = `<span>✗</span> <span>Errore di rete: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btnIcon.textContent = "✦";
    btnText.textContent = "Crea cliente";
  }
});

// ── Next Steps panel ──────────────────────────────────────────
function showNextSteps(slug, siteUrl) {
  const box      = document.getElementById("next-steps-box");
  const adminUrl = siteUrl
    ? siteUrl.replace(/\/$/, "") + "/admin/"
    : "/" + slug + "/admin/";

	document.getElementById("ns-slug").textContent = slug;
  document.getElementById("ns-admin-url").textContent = adminUrl;

  // Link diretto alla pagina del progetto su Netlify
  const netlifyLink = document.getElementById("ns-netlify-link");
  if (netlifyLink) {
	  netlifyLink.href = `https://app.netlify.com/projects/ristogen-${slug}/integrations/identity`;
	  netlifyLink.textContent = `pannello Netlify`;
  }

  const siteLink = document.getElementById("ns-site-url");
  const cmsLink  = document.getElementById("ns-cms-url");
  if (siteUrl) { siteLink.href = siteUrl; siteLink.textContent = siteUrl; }
  cmsLink.href = adminUrl;

	// Reset e poi ripristina check salvati per questo slug
	const saved = _getStepsForSlug(slug);
	box.querySelectorAll(".step-item").forEach((li, i) => {
		if (saved && saved[i]) {
			li.classList.add("done");
			li.querySelector(".step-num").textContent = "✓";
		} else {
			li.classList.remove("done");
			li.querySelector(".step-num").textContent = li.dataset.step;
	}
  });

  box.classList.add("visible");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  saveNextStepsState();
}

document.querySelectorAll(".step-check").forEach(btn => {
  btn.addEventListener("click", function () {
    const li   = this.closest(".step-item");
    const done = li.classList.toggle("done");
    li.querySelector(".step-num").textContent = done ? "✓" : li.dataset.step;
    saveNextStepsState();
  });
});

document.getElementById("ns-dismiss").addEventListener("click", () => {
  document.getElementById("next-steps-box").classList.remove("visible");
  clearNextStepsState();
});

// ── Edit Drawer ──────────────────────────────────────────────
function openDrawer() {
	document.getElementById('edit-drawer').classList.add('open');
	document.getElementById('drawer-backdrop').classList.add('open');
	document.body.style.overflow = 'hidden';
}
function closeDrawer() {
	document.getElementById('edit-drawer').classList.remove('open');
	document.getElementById('drawer-backdrop').classList.remove('open');
	document.body.style.overflow = '';
}

document.getElementById('drawer-close').addEventListener('click', closeDrawer);
document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

async function loadEditDrawer(slug) {
	// Reset
	document.getElementById('drawer-subtitle').textContent = slug;
	document.getElementById('di-site-url').textContent = '…';
	document.getElementById('di-site-url').href = '#';
	document.getElementById('di-cms-url').textContent = '…';
	document.getElementById('di-cms-url').href = '#';
	document.getElementById('edit-slug').value = slug;
	document.getElementById('edit-status').className = '';
	document.getElementById('edit-status').textContent = '';
	document.getElementById('edit-rebuild-note').classList.remove('visible');
	openDrawer();

	const tok = currentToken();
	if (!tok) { showToast('Token non disponibile', 'error'); return; }

	try {
		const r = await fetch('/api/clients?slug=' + encodeURIComponent(slug), {
			headers: { Authorization: 'Bearer ' + tok }
		});
		const data = await r.json();
		if (!r.ok) throw new Error(data.error || r.statusText);

		// Popola info
		const siteUrl = data.site_url || '';
		const adminUrl = siteUrl ? siteUrl.replace(/\/$/, '') + '/admin/' : '';
		const urlEl = document.getElementById('di-site-url');
		const cmsEl = document.getElementById('di-cms-url');
		if (siteUrl) { urlEl.href = siteUrl; urlEl.textContent = siteUrl; }
		else { urlEl.textContent = '—'; urlEl.className = 'drawer-info-value plain'; }
		if (adminUrl) { cmsEl.href = adminUrl; cmsEl.textContent = 'Apri CMS ↗'; }
		else { cmsEl.textContent = '—'; cmsEl.className = 'drawer-info-value plain'; }

		// Popola form
		setTemplatePicker('tpicker-edit', data.template || 'template-01');
		document.getElementById('edit-lang').value = data.default_lang || 'it';
		document.getElementById('edit-domain').value = data.custom_domain || '';

		// Salva valori originali per confronto
		document.getElementById('edit-form').dataset.origTemplate = data.template || 'template-01';
		document.getElementById('edit-form').dataset.origLang = data.default_lang || 'it';

	} catch (e) {
		showToast('Errore caricamento dettagli: ' + e.message, 'error');
	}
}

document.getElementById('edit-form').addEventListener('submit', async function (e) {
	e.preventDefault();
	const btn = document.getElementById('edit-submit-btn');
	const icon = document.getElementById('edit-submit-icon');
	const text = document.getElementById('edit-submit-text');
	const status = document.getElementById('edit-status');
	status.className = ''; status.textContent = '';

	const tok = currentToken();
	if (!tok) { window.netlifyIdentity && window.netlifyIdentity.open(); return; }

	const slug = document.getElementById('edit-slug').value;
	const template = document.getElementById('edit-template').value;
	const default_lang = document.getElementById('edit-lang').value;
	const custom_domain = document.getElementById('edit-domain').value.trim();
	const origTemplate = this.dataset.origTemplate;
	const origLang = this.dataset.origLang;

	// Invia solo i campi effettivamente cambiati
	const payload = { slug };
	if (template !== origTemplate) payload.template = template;
	if (default_lang !== origLang) payload.default_lang = default_lang;
	payload.custom_domain = custom_domain; // invia sempre (può essere svuotato)

	btn.disabled = true;
	icon.innerHTML = '<span class="spin">⚙</span>';
	text.textContent = 'Salvataggio…';

	try {
		const res = await fetch('/api/clients', {
			method: 'PATCH',
			headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const json = await res.json();
		if (!res.ok) throw new Error(json.error || res.statusText);

		if (json.needs_rebuild && json.run_id) {
			status.className = 'success';
			status.innerHTML = '<span>✓</span> <span>Modifiche salvate — rebuild avviato</span>';
			showToast(`Rebuild avviato per "${slug}"`, 'success');
			const rebuildSiteUrl = document.getElementById('di-site-url').href;
			savePendingRun(json.run_id, slug, rebuildSiteUrl);
			startPolling(json.run_id, tok, slug, rebuildSiteUrl);
			setTimeout(closeDrawer, 1500);
		} else {
			status.className = 'success';
			status.innerHTML = '<span>✓</span> <span>Modifiche salvate</span>';
			showToast('Dominio aggiornato', 'success');
			setTimeout(closeDrawer, 1200);
		}
		// Aggiorna valori originali
		this.dataset.origTemplate = template;
		this.dataset.origLang = default_lang;
		document.getElementById('edit-rebuild-note').classList.remove('visible');

	} catch (err) {
		status.className = 'error';
		status.innerHTML = '<span>✗</span> <span>' + err.message + '</span>';
	} finally {
		btn.disabled = false;
		icon.textContent = '💾';
		text.textContent = 'Salva modifiche';
	}
});

// ── GitHub Actions polling ────────────────────────────────────
function startPolling(runId, authToken, slug, siteUrl) {
	const box = document.getElementById("action-box");
	const header = document.getElementById("action-header");
	const icon = document.getElementById("action-icon");
	const label = document.getElementById("action-label");
	const link = document.getElementById("action-link");
	const stepsList = document.getElementById("action-steps");
	const errorsBox = document.getElementById("action-errors");
  const errorsText = document.getElementById("action-errors-text");
	const cancelBtn = document.getElementById("btn-cancel-run");

  box.classList.add("visible");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });

	// ─ Cancel handler ──────────────────────────────────────
	let cancelListener = null;
	function attachCancel() {
		if (cancelListener) cancelBtn.removeEventListener('click', cancelListener);
		cancelListener = async function () {
			if (!confirm('Annullare il deploy in corso?')) return;
			cancelBtn.disabled = true;
			cancelBtn.textContent = '…';
			try {
				const r = await fetch('/api/cancel-run?run_id=' + runId, {
					method: 'POST',
					headers: { Authorization: 'Bearer ' + authToken }
				});
				const j = await r.json();
				if (!r.ok) throw new Error(j.error || r.statusText);
				showToast('⏹ Deploy annullato', 'error');
			} catch (err) {
				showToast('Errore annullamento: ' + err.message, 'error');
				cancelBtn.disabled = false;
				cancelBtn.textContent = '✕ Annulla';
			}
		};
		cancelBtn.addEventListener('click', cancelListener);
	}
	attachCancel();

  const ICONS = {
    queued:     "⏳",
    in_progress:'<span class="spin">⚙</span>',
    success:    "✅",
    failure:    "❌",
    cancelled:  "⚠️",
    timed_out:  "⏱️",
  };
  const LABELS = {
    queued:     "In coda…",
    in_progress:"Deploy in esecuzione…",
    success:    "Deploy completato con successo",
    failure:    "Deploy fallito",
    cancelled:  "Annullato",
    timed_out:  "Timeout",
  };
  const STEP_CLASS = {
    success:    "step-success",
    failure:    "step-failure",
    skipped:    "step-skipped",
    in_progress:"step-in_progress",
  };

  function render(data) {
    const key = data.status === "completed"
      ? (data.conclusion ?? "failure")
      : data.status;

	  // Mostra/nascondi pulsante annulla
	  const cancellable = data.status === 'queued' || data.status === 'in_progress';
	  cancelBtn.style.display = cancellable ? '' : 'none';
	  cancelBtn.disabled = false;
	  cancelBtn.textContent = '\u2715 Annulla';

	  header.className = "terminal-status-line " + key;
    icon.innerHTML      = ICONS[key] ?? "❓";
    label.textContent   = LABELS[key] ?? key;
    link.href           = data.url;

    if (data.jobs && data.jobs.length > 0) {
      const steps = data.jobs[0].steps ?? [];
      stepsList.innerHTML = steps.map(s => {
        const state = s.conclusion ?? s.status ?? "";
		  return `<li class="${STEP_CLASS[state] || ""}">${s.name}</li>`;
      }).join("");

      const allErrors = data.jobs.flatMap(j => j.errors ?? []).filter(Boolean);
		errorsBox.className = "terminal-errors" + (allErrors.length ? " visible" : "");
      errorsText.textContent = allErrors.join("\n\n");
    }

    if (data.status === "completed") {
      clearPendingRun();
		cancelBtn.style.display = 'none';
      const ok = data.conclusion === "success";
      showToast(ok ? "✅ Landing pubblicata!" : "❌ Deploy fallito", ok ? "success" : "error");
      if (ok) {
        // Mostra prossimi passi solo a deploy riuscito, con step azzerati
		  clearStepsForSlug(slug || '');
		  showNextSteps(slug || '', siteUrl || '');
        setTimeout(() => loadClients(), 3000);
      }
    }
  }

  const interval = setInterval(async () => {
    try {
      const r = await fetch("/api/action-status?run_id=" + runId, {
        headers: { Authorization: "Bearer " + authToken },
      });
      if (!r.ok) return;
      const data = await r.json();
      render(data);
      if (data.status === "completed") clearInterval(interval);
    } catch { /* ignora errori transitori */ }
  }, 4000);
}

// ── Template Picker personalizzato ────────────────────────────
function setTemplatePicker(pickerId, value) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  const input  = picker.querySelector('input[type="hidden"]');
  const item   = picker.querySelector(`.tpicker-item[data-value="${value}"]`);
  if (!item) return;
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const label   = item.dataset.label || '';
  const thumbSrc = item.querySelector('.tpicker-item-thumb')?.src || '';
  const trigger = picker.querySelector('.tpicker-btn');
  if (trigger) {
    trigger.querySelector('.tpicker-label').textContent = label;
    const t = trigger.querySelector('.tpicker-thumb');
    if (t && thumbSrc) t.src = thumbSrc;
  }
  picker.querySelectorAll('.tpicker-item').forEach(i => i.classList.toggle('selected', i === item));
}

function initTemplatePickers() {
  // Render dynamic picker HTML
  renderTemplatePicker('tpicker-main', 'template', 'template', 'template-01');
  renderTemplatePicker('tpicker-edit', 'template', 'edit-template', 'template-01');

	// Mostra nota rebuild quando template o lang cambiano (deve stare qui perché
	// #edit-template viene creato da renderTemplatePicker appena sopra)
	['edit-template', 'edit-lang'].forEach(id => {
		const el = document.getElementById(id);
		if (!el) return;
		el.addEventListener('change', function () {
			const form = document.getElementById('edit-form');
			const changed = form.querySelector('#edit-template').value !== form.dataset.origTemplate
				|| form.querySelector('#edit-lang').value !== form.dataset.origLang;
			document.getElementById('edit-rebuild-note').classList.toggle('visible', changed);
		});
	});

  document.querySelectorAll('.tpicker').forEach(picker => {
    const trigger = picker.querySelector('.tpicker-btn');
    const list    = picker.querySelector('.tpicker-list');
    const input   = picker.querySelector('input[type="hidden"]');
    if (!trigger || !list) return;

    // Apri/chiudi al click sul trigger
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = picker.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(isOpen));
    });

    // Selezione opzione
    list.querySelectorAll('.tpicker-item').forEach(item => {
      item.addEventListener('click', () => {
        setTemplatePicker(picker.id, item.dataset.value);
        picker.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      });
    });

    // Chiudi cliccando fuori
    document.addEventListener('click', e => {
      if (!picker.contains(e.target)) {
        picker.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    // Stato iniziale
    const initVal = input?.value || list.querySelector('.tpicker-item')?.dataset.value;
    if (initVal) {
      list.querySelectorAll('.tpicker-item').forEach(i =>
        i.classList.toggle('selected', i.dataset.value === initVal)
      );
    }
  });
}

// ── Event delegation su tbody ─────────────────────────────────
function initTableDelegation() {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;
  tbody.addEventListener('click', async function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const slug = btn.dataset.slug;

    if (btn.classList.contains('btn-steps')) {
      showNextSteps(slug, btn.dataset.siteUrl || '');
    } else if (btn.classList.contains('btn-edit')) {
      loadEditDrawer(slug);
    } else if (btn.classList.contains('btn-delete')) {
      if (!confirm(`Eliminare "${slug}" da Netlify e dal repo?`)) return;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const dr = await fetch('/api/clients?slug=' + encodeURIComponent(slug), {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + _authToken }
        });
        const dj = await dr.json();
        if (!dr.ok) throw new Error(dj.error || dr.statusText);
        document.querySelector(`tr[data-slug="${slug}"]`)?.remove();
        const remaining = document.querySelectorAll('#clients-tbody tr[data-slug]').length;
        updateCountBadge(remaining);
        if (!remaining) document.getElementById('clients-tbody').innerHTML =
          emptyRow('Nessuna landing ancora creata');
        showToast(`Landing "${slug}" eliminata`, 'success');
      } catch (err) {
        showToast('Errore eliminazione: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Elimina';
      }
    }
  });
}

// ── Search / filter ───────────────────────────────────────────
function initSearchFilter() {
  const input = document.getElementById('clients-search');
  if (!input) return;
  input.addEventListener('input', function () {
    const q = this.value.trim().toLowerCase();
    document.querySelectorAll('#clients-tbody tr[data-slug]').forEach(row => {
      row.style.display = !q || row.dataset.slug.includes(q) ? '' : 'none';
    });
  });
}
// ── Pulsante login nella login-screen ────────────────────────
document.getElementById('btn-login').addEventListener('click', () => {
  window.netlifyIdentity && window.netlifyIdentity.open();
});
// ── Bootstrap ─────────────────────────────────────────────
// Aspetta che DOM e Identity widget siano pronti
function bootstrap() {
  initTemplatePickers();
  initTableDelegation();
  initSearchFilter();
  initIdentity();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
