/* dashboard.js – Ristogen Dashboard Logic (Optimized) */

// ── 1. Stato Globale e Cache DOM ──────────────────────────────
const State = {
	authToken: null,
	loadStarted: false,
	clients: [],
	sort: { key: null, asc: true },
	activePolls: new Map(), // Registro globale per prevenire memory leak nel polling
	submitting: false,
	drawerDirty: { edit: false, create: false }
};


const TEMPLATES = [
	{ value: 'template-01', label: 'Template 01 — Dark', desc: 'Dark — ristorante moderno', thumb: '/templates/template-01.png' },
	{ value: 'template-02', label: 'Template 02 — Light', desc: 'Light — elegante e chiaro', thumb: '/templates/template-02.png' }
];

const LANG_FLAGS = { it: '🇮🇹', en: '🇬🇧' };
const PROTECTED_SLUGS = ['burger-demo'];


// ── 2. Utility e Sicurezza ────────────────────────────────────
// Fix XSS: Sanificazione estesa (copre anche apici)
function escHtml(str) {
	if (str == null) return '';
	return String(str).replace(/[&<>"']/g, m => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	})[m]);
}

// ── 3. Storage Manager (Risolve il boilerplate dei 14 try/catch) ──
const Storage = {
	get: (key, fallback = null) => {
		try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
		catch { return fallback; }
	},
	set: (key, value) => {
		try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
	},
	del: (key) => {
		try { localStorage.removeItem(key); } catch { }
	}
};

const KEYS = {
	PENDING: 'ristogen_pending_run',
	NS: 'ristogen_next_steps',
	NS_STEPS: 'ristogen_ns_steps_',
	RUN: 'ristogen_run_',
	TERM_LOG: 'ristogen_terminal_log'
};

// ── 4. Polling Manager (Risolve il memory leak dei timer orfani) ──
const Poller = {
	start: (slug, fn, delay) => {
		Poller.stop(slug);
		State.activePolls.set(slug, setTimeout(async () => {
			const continuePolling = await fn();
			if (continuePolling) Poller.start(slug, fn, delay);
			else Poller.stop(slug);
		}, delay));
	},
	stop: (slug) => {
		if (State.activePolls.has(slug)) {
			clearTimeout(State.activePolls.get(slug));
			State.activePolls.delete(slug);
		}
	}
};

// ── 5. Netlify Identity (Event-Driven, Nessun Polling) ────────

function initIdentity() {
	const ni = window.netlifyIdentity;
	if (!ni) {
		showLoginScreen();
		return;
	}

	// Gestione asincrona nativa
	ni.on("init", user => user ? tryLoadClients(user) : showLoginScreen());
	ni.on("login", user => {
		ni.close();
		State.loadStarted = false;
		tryLoadClients(user);
	});
	ni.on("logout", () => {
		renderUserInfo(null);
		showLoginScreen();
		State.loadStarted = false;
		State.authToken = null;
	});

	// Fallback se l'oggetto è già inizializzato prima dell'esecuzione dello script
	const currentUser = ni.currentUser();
	if (currentUser) {
		tryLoadClients(currentUser);
	}
}

function tryLoadClients(user) {
	if (!user) return;
	State.loadStarted = true;
	renderUserInfo(user);

	const tokenNow = user.token?.access_token;

	// Forza il refresh del token in background, ma procedi se hai già un token valido
	window.netlifyIdentity.refresh()
		.then(jwt => bootDashboard(jwt || tokenNow))
		.catch(() => bootDashboard(tokenNow));
}

function bootDashboard(token) {
	if (!token) return;
	State.authToken = token;
	loadClients(token);
	resumePendingRun(token);

	if (!Storage.get(KEYS.PENDING)) {
		restoreNextSteps();
		restoreTerminalLog();
	}
}

// ── 6. Rendering UI e Tabella (DOM Caching e Fix XSS) ─────────

// Cache dei nodi principali per evitare query ripetute
const DOM = {
	tbody: document.getElementById("clients-tbody"),
	loginScreen: document.getElementById("login-screen"),
	mainContent: document.getElementById("main-content"),
	userInfo: document.getElementById("user-info"),
	clientsCount: document.getElementById("clients-count")
};

function showApp() {
	DOM.loginScreen.style.display = 'none';
	DOM.mainContent.classList.add('active');
}

function showLoginScreen() {
	DOM.loginScreen.style.display = '';
	DOM.mainContent.classList.remove('active');
}

function renderUserInfo(user) {
	if (!user) {
		DOM.userInfo.innerHTML = "";
		return;
	}
	// Sanificazione dell'email (Fix XSS)
	DOM.userInfo.innerHTML = `<span>${escHtml(user.email)}</span><button id="logout-btn">Esci</button>`;
	document.getElementById("logout-btn").addEventListener("click", () => window.netlifyIdentity?.logout());
	showApp();
}

function renderDeployBadge(rs) {
	if (!rs) return '';
	const age = Date.now() - (rs.updated_at || 0);
	if (rs.conclusion === 'success' && age > 3600000) return ''; // 1 ora

	const MAP = {
		queued: { cls: 'running', icon: '⏳', text: 'In coda' },
		in_progress: { cls: 'running', icon: '⚙️', text: 'Deploy in corso' },
		success: { cls: 'success', icon: '✓', text: 'Pubblicato' },
		failure: { cls: 'failure', icon: '✗', text: 'Fallito' },
		cancelled: { cls: 'cancelled', icon: '■', text: 'Annullato' },
		timed_out: { cls: 'failure', icon: '⏱', text: 'Timeout' },
	};

	const key = rs.status === 'completed' ? (rs.conclusion || 'failure') : rs.status;
	const m = MAP[key];
	if (!m) return '';

	// Fix XSS: attributi protetti
	return `<span class="deploy-badge deploy-badge--${m.cls}" data-run="${escHtml(rs.run_id)}">${m.icon} ${m.text}</span>`;
}

function renderClientRows(arr) {
	if (!DOM.tbody) return;

	let sorted = [...arr];
	if (State.sort.key) {
		sorted.sort((a, b) => {
			const va = String(a[State.sort.key] || '');
			const vb = String(b[State.sort.key] || '');
			return State.sort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
		});
	}

	// Costruzione stringa massiva per singola iniezione DOM (Performance)
	DOM.tbody.innerHTML = sorted.map(c => {
		// Fix XSS: Qualsiasi dato in ingresso dall'API passa per escHtml
		const safeSlug = escHtml(c.slug);
		const safeUrl = escHtml(c.site_url || '');
		const safeName = escHtml(c.client_name || '');
		const tplLabel = escHtml((TEMPLATES.find(t => t.value === c.template) || TEMPLATES[0]).label);
		const langFlag = LANG_FLAGS[c.default_lang] || escHtml(c.default_lang);

		const rs = Storage.get(KEYS.RUN + c.slug);
		const badge = renderDeployBadge(rs);

		const urlCols = safeUrl
			? `<a href="${safeUrl}" target="_blank" rel="noopener">${safeUrl} ↗</a>
         <button class="btn-copy" data-copy="${safeUrl}" data-copy-label="URL" aria-label="Copia URL sito">⎘</button>
         <a href="${safeUrl.replace(/\/$/, '')}/admin/" target="_blank" rel="noopener" class="cms-link">CMS ↗</a>
         <button class="btn-copy" data-copy="${safeUrl.replace(/\/$/, '')}/admin/" data-copy-label="CMS" aria-label="Copia URL CMS">⎘</button>`
			: '<span style="color:var(--text-light)">—</span>';

		const deleteDisabled = PROTECTED_SLUGS.includes(c.slug) ? ' disabled title="Landing protetta"' : '';

		return `<tr data-slug="${safeSlug}" data-site-url="${safeUrl}">
      <td><span class="client-name">${safeName}</span><span class="slug-chip">${safeSlug}</span>${badge ? `<br>${badge}` : ''}</td>
      <td><span class="tpl-badge">${tplLabel}</span></td>
      <td>${langFlag}</td>
      <td>${urlCols}</td>
      <td>
        <div class="table-actions">
          <button class="btn-steps" data-slug="${safeSlug}" data-site-url="${safeUrl}" aria-label="Prossimi passi: ${safeSlug}">🚀</button>
          <button class="btn-edit" data-slug="${safeSlug}" aria-label="Modifica ${safeSlug}">Modifica</button>
          <button class="btn-delete" data-slug="${safeSlug}" aria-label="Elimina ${safeSlug}"${deleteDisabled}>Elimina</button>
        </div>
      </td>
    </tr>`;
	}).join('');

	// Aggiorna indicatori di sort visivi
	document.querySelectorAll('#clients-table th[data-sort]').forEach(th => {
		if (th.dataset.sort === State.sort.key) th.setAttribute('aria-sort', State.sort.asc ? 'ascending' : 'descending');
		else th.removeAttribute('aria-sort');
	});
}

// ── 7. Utility: Debounce ──────────────────────────────────────
function debounce(func, wait) {
	let timeout;
	return function (...args) {
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), wait);
	};
}

// ── 8. Gestore Cassetti (Drawers) Unificato ───────────────────
// Elimina la duplicazione tra openCreateDrawer e openDrawer
const DrawerManager = {
	activeTrap: null,

	open: (type) => {
		State.drawerDirty[type] = false;
		const drawer = document.getElementById(`${type}-drawer`);
		const backdrop = document.getElementById(`${type}-backdrop`);

		drawer.classList.add('open');
		if (backdrop) backdrop.classList.add('open');
		document.body.style.overflow = 'hidden';

		requestAnimationFrame(() => DrawerManager.setupFocusTrap(drawer));
	},

	close: (type) => {
		if (State.drawerDirty[type] && !confirm('Hai modifiche non salvate. Chiudere senza salvare?')) return;
		State.drawerDirty[type] = false;

		const drawer = document.getElementById(`${type}-drawer`);
		const backdrop = document.getElementById(`${type}-backdrop`);

		if (DrawerManager.activeTrap) {
			drawer.removeEventListener('keydown', DrawerManager.activeTrap);
			DrawerManager.activeTrap = null;
		}

		drawer.classList.remove('open');
		if (backdrop) backdrop.classList.remove('open');
		document.body.style.overflow = '';
	},

	setupFocusTrap: (drawer) => {
		const focusable = Array.from(drawer.querySelectorAll(
			'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		)).filter(el => !el.closest('[hidden]'));

		if (!focusable.length) return;
		focusable[0].focus();

		if (DrawerManager.activeTrap) drawer.removeEventListener('keydown', DrawerManager.activeTrap);

		DrawerManager.activeTrap = function (e) {
			if (e.key !== 'Tab') return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];

		  if (e.shiftKey && document.activeElement === first) {
			  e.preventDefault();
			  last.focus();
		  } else if (!e.shiftKey && document.activeElement === last) {
			  e.preventDefault();
			  first.focus();
		  }
		};
		drawer.addEventListener('keydown', DrawerManager.activeTrap);
  }
};

// Event Listeners globali per i Drawer
document.addEventListener('keydown', e => {
	if (e.key === 'Escape') {
		if (document.getElementById('create-drawer')?.classList.contains('open')) DrawerManager.close('create');
		else if (document.getElementById('edit-drawer')?.classList.contains('open')) DrawerManager.close('edit');
	}
});

document.getElementById('create-drawer-close')?.addEventListener('click', () => DrawerManager.close('create'));
document.getElementById('create-backdrop')?.addEventListener('click', () => DrawerManager.close('create'));
document.getElementById('btn-new-client')?.addEventListener('click', () => DrawerManager.open('create'));

document.getElementById('drawer-close')?.addEventListener('click', () => DrawerManager.close('edit'));
document.getElementById('drawer-backdrop')?.addEventListener('click', () => DrawerManager.close('edit'));

// ── 9. Validazione Slug Reattiva e Sicura (No Race Conditions) ──
const SlugValidator = {
	controller: null,
	valid: false,
	input: document.getElementById("slug"),
	hint: document.getElementById("slug-hint"),

	format: (str) => str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-'),

	setHint: (cls, text) => {
		SlugValidator.hint.className = cls;
		SlugValidator.hint.textContent = text;
	},

	check: debounce(async (val) => {
		if (!val) {
			SlugValidator.setHint("", "");
			SlugValidator.valid = false;
			return;
		}

		const RESERVED = ['admin', 'api', 'www', 'mail', 'ftp', 'blog', 'app', 'dashboard', 'static', 'assets', 'public', 'media', 'images', 'login', 'logout', 'signup', 'auth'];
		if (RESERVED.includes(val) || val.length < 3 || val.length > 50 || !/^[a-z0-9]+([a-z0-9-]*[a-z0-9]+)*$/.test(val)) {
			SlugValidator.setHint("error", "✗ Formato non valido, riservato o lunghezza errata");
			SlugValidator.valid = false;
			return;
		}

		SlugValidator.setHint("checking", "⏳ Verifica disponibilità…");

		// Annulla la richiesta di rete precedente se ancora in corso
		if (SlugValidator.controller) SlugValidator.controller.abort();
		SlugValidator.controller = new AbortController();

		try {
		  const res = await fetch("/api/validate-slug?slug=" + encodeURIComponent(val), {
			  headers: { Authorization: "Bearer " + State.authToken },
			  signal: SlugValidator.controller.signal
		  });
		  const data = await res.json();

		  if (data.valid) {
			SlugValidator.valid = true;
			SlugValidator.setHint("ok", "✓ Slug disponibile");
		} else {
			SlugValidator.valid = false;
			SlugValidator.setHint("error", "✗ " + (data.errors?.join(" — ") || data.error));
		}
	  } catch (e) {
		  if (e.name !== 'AbortError') {
			  SlugValidator.setHint("", "");
			  SlugValidator.valid = false;
		  }
		}
	}, 400) // 400ms di debounce
};

if (SlugValidator.input) {
	SlugValidator.input.addEventListener("input", function () {
		State.drawerDirty.create = true;
		const pos = this.selectionStart;
		const before = this.value;
		const after = SlugValidator.format(before);

		if (after !== before) {
			const diff = after.length - before.length;
			this.value = after;
			this.setSelectionRange(Math.max(0, pos + diff), Math.max(0, pos + diff));
		}

		SlugValidator.valid = false;
		SlugValidator.check(this.value.trim());
	});
}

// ── 10. Form Submission: Create ───────────────────────────────
const createForm = document.getElementById("onboarding-form");
if (createForm) {
	createForm.addEventListener("submit", async function (e) {
		e.preventDefault();
		if (State.submitting) return;

		if (!SlugValidator.valid) {
			SlugValidator.setHint("error", "✗ Verifica prima la disponibilità dello slug");
			SlugValidator.input.focus();
			return;
		}

		State.submitting = true;
		const btn = document.getElementById("submit-btn");
		const status = document.getElementById("status");

		btn.disabled = true;
		btn.innerHTML = '<span class="spin">⚙</span> Creazione in corso…';
		status.className = "";
		status.textContent = "";

		try {
		  const formData = new FormData(this);
		  const res = await fetch("/api/onboarding", {
			  method: "POST",
			  headers: { Authorization: "Bearer " + State.authToken },
			  body: formData,
		  });

		  const json = await res.json();
		  if (!res.ok) throw new Error(json.error || res.statusText);

		  const newSlug = formData.get("client_slug");
		  const siteUrl = json.site_url || "";

		  status.className = "success";
		  status.innerHTML = `<span>✓</span> <span>Landing <strong>${escHtml(newSlug)}</strong> creata</span>`;
		  showToast(`Landing "${newSlug}" creata!`, "success");

		  this.reset();
		  setTemplatePicker('tpicker-main', 'template-01');
		  SlugValidator.setHint("", "");
		  SlugValidator.valid = false;

		  DrawerManager.close('create');

		  if (json.run_id) {
			Storage.set(KEYS.PENDING, { run_id: json.run_id, slug: newSlug, site_url: siteUrl, started_at: Date.now() });
			// Utilizziamo il nuovo Poller invece di startPolling (che definirò nell'ultimo blocco)
			initActionPolling(json.run_id, newSlug, siteUrl);
		}
		  setTimeout(() => loadClients(State.authToken), 10000);

	  } catch (err) {
		  status.className = "error";
		  status.innerHTML = `<span>✗</span> <span>${escHtml(err.message)}</span>`;
	  } finally {
		  State.submitting = false;
		  btn.disabled = false;
		  btn.innerHTML = '✦ Crea cliente';
	  }
  });

	createForm.addEventListener('change', () => { State.drawerDirty.create = true; });
}

// ── 11. Edit Drawer: Caricamento e Salvataggio ────────────────

async function loadEditDrawer(slug) {
	const els = {
		subtitle: document.getElementById('drawer-subtitle'),
		siteUrl: document.getElementById('di-site-url'),
		cmsUrl: document.getElementById('di-cms-url'),
		slug: document.getElementById('edit-slug'),
		status: document.getElementById('edit-status'),
		name: document.getElementById('edit-name'),
		lang: document.getElementById('edit-lang'),
		domain: document.getElementById('edit-domain'),
		form: document.getElementById('edit-form'),
		rebuildNote: document.getElementById('edit-rebuild-note')
	};

	els.subtitle.textContent = escHtml(slug);
	els.siteUrl.textContent = '…'; els.siteUrl.href = '#';
	els.cmsUrl.textContent = '…'; els.cmsUrl.href = '#';
	els.slug.value = slug;
	els.status.className = ''; els.status.textContent = '';
	els.rebuildNote.classList.remove('visible');

	DrawerManager.open('edit');

	if (!State.authToken) {
		showToast('Token non disponibile', 'error');
		return;
	}

	try {
		const r = await fetch('/api/clients?slug=' + encodeURIComponent(slug), {
			headers: { Authorization: 'Bearer ' + State.authToken }
		});
		const data = await r.json();
		if (!r.ok) throw new Error(data.error || r.statusText);

		const siteUrl = data.site_url || '';
		const adminUrl = siteUrl ? siteUrl.replace(/\/$/, '') + '/admin/' : '';

		if (siteUrl) {
			els.siteUrl.href = escHtml(siteUrl);
			els.siteUrl.textContent = escHtml(siteUrl);
		} else {
			els.siteUrl.textContent = '—';
			els.siteUrl.className = 'drawer-info-value plain';
		}

		if (adminUrl) {
			els.cmsUrl.href = escHtml(adminUrl);
			els.cmsUrl.textContent = 'Apri CMS ↗';
		} else {
			els.cmsUrl.textContent = '—';
			els.cmsUrl.className = 'drawer-info-value plain';
		}

		setTemplatePicker('tpicker-edit', data.template || 'template-01');
		els.name.value = data.client_name || '';
		els.lang.value = data.default_lang || 'it';
		els.domain.value = data.custom_domain || '';

		els.form.dataset.origTemplate = data.template || 'template-01';
		els.form.dataset.origLang = data.default_lang || 'it';
		State.drawerDirty.edit = false;

	} catch (e) {
		showToast('Errore caricamento dettagli: ' + e.message, 'error');
	}
}

const editForm = document.getElementById('edit-form');
if (editForm) {
	editForm.addEventListener('submit', async function (e) {
		e.preventDefault();
		if (State.submitting) return;

		const btn = document.getElementById('edit-submit-btn');
		const status = document.getElementById('edit-status');
		status.className = ''; status.textContent = '';

		const slug = document.getElementById('edit-slug').value;
		const client_name = document.getElementById('edit-name').value.trim();
		const template = document.getElementById('edit-template').value;
		const default_lang = document.getElementById('edit-lang').value;
		const custom_domain = document.getElementById('edit-domain').value.trim();

		const origTemplate = this.dataset.origTemplate;
		const origLang = this.dataset.origLang;

		const payload = { slug, client_name, custom_domain };
		if (template !== origTemplate) payload.template = template;
		if (default_lang !== origLang) payload.default_lang = default_lang;

		State.submitting = true;
		btn.disabled = true;
		btn.innerHTML = '<span class="spin">⚙</span> Salvataggio…';

		try {
			const res = await fetch('/api/clients', {
				method: 'PATCH',
				headers: { Authorization: 'Bearer ' + State.authToken, 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || res.statusText);

			if (json.needs_rebuild && json.run_id) {
				status.className = 'success';
				status.innerHTML = '<span>✓</span> <span>Modifiche salvate — rebuild avviato</span>';
				showToast(`Rebuild avviato per "${slug}"`, 'success');

				const rebuildSiteUrl = document.getElementById('di-site-url').href;
				Storage.set(KEYS.PENDING, { run_id: json.run_id, slug, site_url: rebuildSiteUrl, started_at: Date.now() });

				initActionPolling(json.run_id, slug, rebuildSiteUrl, { template: origTemplate, default_lang: origLang });
				setTimeout(() => DrawerManager.close('edit'), 1500);
			} else {
				status.className = 'success';
				status.innerHTML = '<span>✓</span> <span>Modifiche salvate</span>';
				showToast('Landing aggiornata', 'success');
				setTimeout(() => DrawerManager.close('edit'), 1200);
			}

			this.dataset.origTemplate = template;
			this.dataset.origLang = default_lang;
			State.drawerDirty.edit = false;
			document.getElementById('edit-rebuild-note').classList.remove('visible');

		} catch (err) {
			status.className = 'error';
			status.innerHTML = `<span>✗</span> <span>${escHtml(err.message)}</span>`;
		} finally {
			State.submitting = false;
			btn.disabled = false;
			btn.innerHTML = '💾 Salva modifiche';
		}
	});

	editForm.addEventListener('input', () => { State.drawerDirty.edit = true; });
	editForm.addEventListener('change', () => {
		State.drawerDirty.edit = true;
		const changed = document.getElementById('edit-template').value !== editForm.dataset.origTemplate
			|| document.getElementById('edit-lang').value !== editForm.dataset.origLang;
		document.getElementById('edit-rebuild-note').classList.toggle('visible', changed);
	});
}

// ── 12. GitHub Actions Polling (Optimized DOM Updates) ────────

function initActionPolling(runId, slug, siteUrl, prevSettings) {
	const els = {
		box: document.getElementById("action-box"),
		header: document.getElementById("action-header"),
		icon: document.getElementById("action-icon"),
		label: document.getElementById("action-label"),
		link: document.getElementById("action-link"),
		steps: document.getElementById("action-steps"),
		body: document.querySelector('#action-box .terminal-body'),
		errorsBox: document.getElementById("action-errors"),
		errorsText: document.getElementById("action-errors-text"),
		cancelBtn: document.getElementById("btn-cancel-run")
	};

	els.box.classList.add("visible");
	els.box.scrollIntoView({ behavior: "smooth", block: "nearest" });
	Storage.del(KEYS.TERM_LOG);

	const ICONS = { queued: "⏳", in_progress: '<span class="spin">⚙</span>', success: "✅", failure: "❌", cancelled: "⚠️", timed_out: "⏱️" };
	const LABELS = { queued: "In coda…", in_progress: "Deploy in esecuzione…", success: "Deploy completato con successo", failure: "Deploy fallito", cancelled: "Annullato", timed_out: "Timeout" };
	const STEP_CLASS = { success: "step-success", failure: "step-failure", skipped: "step-skipped", in_progress: "step-in_progress" };

	// Rimuovi listener precedenti dal bottone Annulla tramite clonazione
	if (els.cancelBtn) {
		const newCancelBtn = els.cancelBtn.cloneNode(true);
		els.cancelBtn.parentNode.replaceChild(newCancelBtn, els.cancelBtn);
		els.cancelBtn = newCancelBtn;

		els.cancelBtn.addEventListener('click', async () => {
			if (!confirm('Annullare il deploy in corso?')) return;
			els.cancelBtn.disabled = true;
			els.cancelBtn.textContent = '…';
			try {
				const r = await fetch(`/api/cancel-run?run_id=${runId}${slug ? '&slug=' + encodeURIComponent(slug) : ''}`, {
					method: 'POST',
					headers: { Authorization: 'Bearer ' + State.authToken }
				});
				if (!r.ok) throw new Error(await r.text());
				showToast('⏹ Deploy annullato', 'error');
				Poller.stop(slug); // Ferma immediatamente il polling locale

				if (prevSettings && slug) {
					await fetch('/api/clients', {
						method: 'PATCH',
						headers: { Authorization: 'Bearer ' + State.authToken, 'Content-Type': 'application/json' },
						body: JSON.stringify({ slug, template: prevSettings.template, default_lang: prevSettings.default_lang, no_rebuild: true })
					});
					DrawerManager.open('edit');
					loadEditDrawer(slug);
				}
			} catch (err) {
				showToast('Errore annullamento: ' + err.message, 'error');
				els.cancelBtn.disabled = false;
				els.cancelBtn.textContent = '✕ Annulla';
			}
		});
	}


	let lastStatus = null;
	let lastStepsHash = null;

	async function pollTick() {
		try {
			const r = await fetch("/api/action-status?run_id=" + runId, {
				headers: { Authorization: "Bearer " + State.authToken },
			});
			if (!r.ok) return true; // Continua a riprovare su errori 5xx transitori

			const data = await r.json();
			const key = data.status === "completed" ? (data.conclusion ?? "failure") : data.status;

			if (key !== lastStatus) {
				Storage.set(KEYS.RUN + slug, { run_id: runId, status: data.status, conclusion: data.conclusion || null, updated_at: Date.now() });
				els.header.className = "terminal-status-line " + key;
				els.icon.innerHTML = ICONS[key] ?? "❓";
				els.label.textContent = LABELS[key] ?? key;
				document.title = `${LABELS[key] ?? key} — Ristogen`;
				els.link.href = escHtml(data.url);
				lastStatus = key;

				const cancellable = data.status === 'queued' || data.status === 'in_progress';
				els.cancelBtn.style.display = cancellable ? '' : 'none';
				els.cancelBtn.disabled = false;
				els.cancelBtn.textContent = '\u2715 Annulla';

				// Aggiorna badge in tabella senza ricreare l'intera riga
				const badgeCell = document.querySelector(`tr[data-slug="${slug}"] td:first-child`);
				if (badgeCell) {
					const oldBadge = badgeCell.querySelector('.deploy-badge');
					if (oldBadge) oldBadge.remove();
					const newBadgeHtml = renderDeployBadge(Storage.get(KEYS.RUN + slug));
					if (newBadgeHtml) badgeCell.insertAdjacentHTML('beforeend', '<br>' + newBadgeHtml);
				}
			}

			if (data.jobs?.length > 0) {
				const steps = data.jobs[0].steps ?? [];
				const currentHash = steps.map(s => s.name + (s.conclusion ?? s.status)).join('|');

				// Evita reflow del DOM se i log non sono cambiati (Performance)
				if (currentHash !== lastStepsHash) {
					els.steps.innerHTML = steps.map(s =>
						`<li class="${STEP_CLASS[s.conclusion ?? s.status ?? ""] || ""}">${escHtml(s.name)}</li>`
					).join("");
					if (els.body) els.body.scrollTop = els.body.scrollHeight;
					lastStepsHash = currentHash;
				}

				const allErrors = data.jobs.flatMap(j => j.errors ?? []).filter(Boolean);
				if (allErrors.length) {
					els.errorsBox.className = "terminal-errors visible";
					els.errorsText.textContent = allErrors.join("\n\n");
				}

				Storage.set(KEYS.TERM_LOG, {
					slug, run_id: runId, gh_url: data.url, status_key: key, saved_at: Date.now(),
					steps: steps.map(s => ({ name: s.name, state: s.conclusion ?? s.status ?? '' })),
					errors: allErrors
				});
			}

			if (data.status === "completed") {
				Storage.del(KEYS.PENDING);
				document.title = 'Ristogen — Dashboard';
				els.cancelBtn.style.display = 'none';

				const ok = data.conclusion === "success";
				showToast(ok ? "✅ Landing pubblicata!" : "❌ Deploy fallito", ok ? "success" : "error");

				if (ok) {
					Storage.del(KEYS.NS_STEPS + slug);
					showNextSteps(slug || '', siteUrl || '');
					setTimeout(() => loadClients(State.authToken), 3000);
				}
				return false; // Ferma il poller
			}
			return true; // Continua il poller
		} catch {
			return true; // Continua su network error client-side
		}
	}

	// Backoff polling controllato
	const start = Date.now();
	Poller.start(slug, pollTick, 3000); // Il primo tick partirà a 3s, la logica di backoff reale può essere implementata nel wrapper Poller se serve, qui manteniamo 3s fissi sicuri.
}

// ── 13. Event Delegation & Search ─────────────────────────────

function initTableDelegation() {
	if (!DOM.tbody) return;

	const thead = document.querySelector('#clients-table thead');
	if (thead) {
		thead.addEventListener('click', function (e) {
			const th = e.target.closest('th[data-sort]');
			if (!th || !State.clients.length) return;
			const key = th.dataset.sort;
			if (State.sort.key === key) State.sort.asc = !State.sort.asc;
			else { State.sort.key = key; State.sort.asc = true; }
			renderClientRows(State.clients);
		});
	}

	DOM.tbody.addEventListener('click', async function (e) {
		const btn = e.target.closest('button');
		if (!btn) return;
		const slug = btn.dataset.slug;

		if (btn.classList.contains('btn-steps')) {
			showNextSteps(slug, btn.dataset.siteUrl || '');
		} else if (btn.classList.contains('btn-copy')) {
			const text = btn.dataset.copy || '';
			const label = btn.dataset.copyLabel || 'testo';
			if (!text) return;
			navigator.clipboard.writeText(text).then(() => {
				const orig = btn.innerHTML;
				btn.innerHTML = '✓';
				btn.classList.add('btn-copy--ok');
				setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('btn-copy--ok'); }, 1500);
				showToast(`${label} copiato`, 'success');
			}).catch(() => showToast('Copia non riuscita', 'error'));
		} else if (btn.classList.contains('btn-edit')) {
			loadEditDrawer(slug);
		} else if (btn.classList.contains('btn-delete')) {
			if (PROTECTED_SLUGS.includes(slug)) { showToast('Landing protetta, impossibile eliminare', 'error'); return; }
			if (!confirm(`Eliminare definitivamente "${slug}"?`)) return;

			btn.disabled = true;
			btn.textContent = '…';
			try {
				const r = await fetch('/api/clients?slug=' + encodeURIComponent(slug), {
					method: 'DELETE',
					headers: { Authorization: 'Bearer ' + State.authToken }
				});
				if (!r.ok) throw new Error((await r.json()).error || r.statusText);

				document.querySelector(`tr[data-slug="${slug}"]`)?.remove();
				State.clients = State.clients.filter(c => c.slug !== slug);
				updateCountBadge(State.clients.length);

				if (!State.clients.length) DOM.tbody.innerHTML = emptyRow('Nessuna landing ancora creata', true);
				showToast(`Landing "${slug}" eliminata`, 'success');
				Storage.del(KEYS.RUN + slug);
				Storage.del(KEYS.NS_STEPS + slug);
			} catch (err) {
				showToast('Errore eliminazione: ' + err.message, 'error');
				btn.disabled = false;
				btn.textContent = 'Elimina';
			}
		}
	});
}

function initSearchFilter() {
	const input = document.getElementById('clients-search');
	if (!input) return;

	// Utilizza il debounce creato in precedenza per le performance di ricerca
	input.addEventListener('input', debounce(function () {
		const q = this.value.trim().toLowerCase();
		document.querySelectorAll('#clients-tbody tr[data-slug]').forEach(row => {
			row.style.display = !q || row.dataset.slug.includes(q) ? '' : 'none';
		});
	}, 200));
}

// ── 15. Costanti e Helper UI ──────────────────────────────────

function showToast(msg, type = "") {
	const el = document.createElement("div");
	el.className = "toast" + (type ? " " + type : "");
	el.textContent = msg;
	document.getElementById("toast-container")?.appendChild(el);
	setTimeout(() => el.remove(), 4000);
}

function updateCountBadge(n) {
	if (DOM.clientsCount) DOM.clientsCount.textContent = n > 0 ? n + " landing" : "";
}

function emptyRow(msg, withCta = false) {
	const cta = withCta
		? `<button type="button" class="btn-empty-cta" onclick="DrawerManager.open('create')">+ Crea il primo cliente</button>`
		: '';
	return `<tr><td colspan="5">
    <div class="empty-state">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <path d="M9 12h6M12 9v6"/>
      </svg>
      <p>${escHtml(msg)}</p>
      ${cta}
    </div>
  </td></tr>`;
}

// ── 16. Template Picker (Optimized con Event Delegation) ──────

function renderTemplatePicker(pickerId, hiddenName, hiddenId, defaultValue) {
	const container = document.getElementById(pickerId);
	if (!container) return;

	const val = defaultValue || TEMPLATES[0].value;
	const first = TEMPLATES.find(t => t.value === val) || TEMPLATES[0];

	container.innerHTML = `
    <button type="button" class="tpicker-btn" aria-haspopup="listbox" aria-expanded="false">
      <img class="tpicker-thumb" src="${escHtml(first.thumb)}" alt="" />
      <span class="tpicker-label">${escHtml(first.label)}</span>
      <svg class="tpicker-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"></path></svg>
    </button>
    <ul class="tpicker-list" role="listbox">
      ${TEMPLATES.map(t => `
        <li class="tpicker-item${t.value === val ? ' selected' : ''}" data-value="${escHtml(t.value)}" data-label="${escHtml(t.label)}" role="option">
          <img class="tpicker-item-thumb" src="${escHtml(t.thumb)}" alt="" />
          <div class="tpicker-item-text"><strong>${escHtml(t.label.split(' — ')[0])}</strong><em>${escHtml(t.desc)}</em></div>
          <div class="tpicker-item-preview"><img src="${escHtml(t.thumb)}" alt="Preview" /><p>${escHtml(t.label)}</p></div>
        </li>
      `).join('')}
    </ul>
    <input type="hidden" id="${escHtml(hiddenId)}" name="${escHtml(hiddenName)}" value="${escHtml(val)}" />
  `;
}

function setTemplatePicker(pickerId, value) {
	const picker = document.getElementById(pickerId);
	if (!picker) return;

	const input = picker.querySelector('input[type="hidden"]');
	const item = picker.querySelector(`.tpicker-item[data-value="${value}"]`);
	if (!item) return;

	if (input) {
		input.value = value;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}

	const label = item.dataset.label || '';
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
	renderTemplatePicker('tpicker-main', 'template', 'template', 'template-01');
	renderTemplatePicker('tpicker-edit', 'template', 'edit-template', 'template-01');

	document.querySelectorAll('.tpicker').forEach(picker => {
		const trigger = picker.querySelector('.tpicker-btn');
		const list = picker.querySelector('.tpicker-list');

		if (!trigger || !list) return;

		trigger.addEventListener('click', e => {
			e.stopPropagation();
			const isOpen = picker.classList.toggle('open');
			trigger.setAttribute('aria-expanded', String(isOpen));
		});

		// Event Delegation invece di N listener sui singoli <li>
		list.addEventListener('click', e => {
			const item = e.target.closest('.tpicker-item');
			if (!item) return;
			setTemplatePicker(picker.id, item.dataset.value);
			picker.classList.remove('open');
			trigger.setAttribute('aria-expanded', 'false');
		});
	});

	document.addEventListener('click', e => {
		document.querySelectorAll('.tpicker.open').forEach(picker => {
			if (!picker.contains(e.target)) {
				picker.classList.remove('open');
				picker.querySelector('.tpicker-btn')?.setAttribute('aria-expanded', 'false');
			}
		});
	});
}

// ── 17. Core: Caricamento Dati (loadClients) ──────────────────

async function loadClients(token) {
	if (token) State.authToken = token;
	if (!State.authToken) return;

	State.loadStarted = true;

	if (DOM.tbody) {
		DOM.tbody.innerHTML = Array(3).fill(null).map(() =>
			`<tr>
        <td><span class="skeleton" style="width:90px"></span></td>
        <td><span class="skeleton" style="width:70px"></span></td>
        <td><span class="skeleton" style="width:40px"></span></td>
        <td><span class="skeleton" style="width:140px"></span></td>
        <td><span class="skeleton" style="width:60px"></span></td>
      </tr>`
		).join('');
	}

	try {
		const r = await fetch("/api/clients", {
			headers: { Authorization: "Bearer " + State.authToken },
		});

		if (r.status === 401) {
			showToast('Sessione scaduta — effettua di nuovo il login', 'error');
			State.authToken = null;
			showLoginScreen();
			window.netlifyIdentity?.open();
			return;
		}

		if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText);

		const { clients } = await r.json();

		if (!clients || clients.length === 0) {
			if (DOM.tbody) DOM.tbody.innerHTML = emptyRow("Nessuna landing ancora creata", true);
			updateCountBadge(0);
			State.clients = [];
			return;
		}

		State.clients = clients;
		updateCountBadge(clients.length);
		renderClientRows(State.clients);

	} catch (e) {
		if (DOM.tbody) DOM.tbody.innerHTML = emptyRow("Errore caricamento: " + e.message);
		updateCountBadge(0);
	}
}

// ── 18. Pannello Next Steps (Optimized via Event Delegation) ──

function showNextSteps(slug, siteUrl) {
	const box = document.getElementById("next-steps-box");
	if (!box) return;

	const adminUrl = siteUrl ? siteUrl.replace(/\/$/, "") + "/admin/" : "/" + slug + "/admin/";

	document.getElementById("ns-slug").textContent = escHtml(slug);
	document.getElementById("ns-admin-url").textContent = escHtml(adminUrl);

	const netlifyLink = document.getElementById("ns-netlify-link");
	if (netlifyLink) {
		netlifyLink.href = `https://app.netlify.com/projects/ristogen-${escHtml(slug)}/integrations/identity`;
		netlifyLink.textContent = `pannello Netlify`;
	}

	const siteLink = document.getElementById("ns-site-url");
	if (siteLink && siteUrl) {
		siteLink.href = escHtml(siteUrl);
		siteLink.textContent = escHtml(siteUrl);
	}

	const cmsLink = document.getElementById("ns-cms-url");
	if (cmsLink) cmsLink.href = escHtml(adminUrl);

	const savedSteps = Storage.get(KEYS.NS_STEPS + slug, []);

	box.querySelectorAll(".step-item").forEach((li, i) => {
		if (savedSteps[i]) {
			li.classList.add("done");
			li.querySelector(".step-num").textContent = "✓";
		} else {
			li.classList.remove("done");
			li.querySelector(".step-num").textContent = li.dataset.step;
		}
	});

	box.classList.add("visible");
	box.scrollIntoView({ behavior: "smooth", block: "nearest" });

	Storage.set(KEYS.NS, { slug, site_url: siteUrl });
}

// Event Delegation per i check degli step (eseguito una volta sola)
document.getElementById("next-steps-box")?.addEventListener("click", function (e) {
	const checkBtn = e.target.closest('.step-check');
	if (checkBtn) {
		const li = checkBtn.closest(".step-item");
		const done = li.classList.toggle("done");
		li.querySelector(".step-num").textContent = done ? "✓" : li.dataset.step;

		const slug = document.getElementById('ns-slug')?.textContent;
		if (slug) {
			const stepsState = Array.from(this.querySelectorAll('.step-item')).map(el => el.classList.contains('done'));
			Storage.set(KEYS.NS_STEPS + slug, stepsState);
		}
		return;
	}

	const dismissBtn = e.target.closest('#ns-dismiss');
	if (dismissBtn) {
		this.classList.remove("visible");
		Storage.del(KEYS.NS);
	}
});

// ── 19. Ripristino Stato al Reload (Pending, Terminal, Next Steps) ──

function restoreNextSteps() {
	const data = Storage.get(KEYS.NS);
	if (data?.slug) showNextSteps(data.slug, data.site_url || '');
}

function resumePendingRun(authToken) {
	const data = Storage.get(KEYS.PENDING);
	if (!data || !data.run_id) return;

	// Scarta se più vecchio di 2 ore
	if (Date.now() - (data.started_at || 0) > 7200000) {
		Storage.del(KEYS.PENDING);
		return;
	}

	showToast(`↻ Monitoraggio ripreso per "${data.slug}"`, 'info');

	const nsData = Storage.get(KEYS.NS);
	if (nsData?.slug === data.slug) {
		showNextSteps(data.slug, data.site_url || '');
	}

	initActionPolling(data.run_id, data.slug, data.site_url || '');
}

function restoreTerminalLog() {
	const d = Storage.get(KEYS.TERM_LOG);
	if (!d) return;

	// TTL 24 ore
	if (Date.now() - (d.saved_at || 0) > 86400000) {
		Storage.del(KEYS.TERM_LOG);
		return;
	}

	const els = {
		box: document.getElementById('action-box'),
		header: document.getElementById('action-header'),
		icon: document.getElementById('action-icon'),
		label: document.getElementById('action-label'),
		link: document.getElementById('action-link'),
		stepsList: document.getElementById('action-steps'),
		errorsBox: document.getElementById('action-errors'),
		errorsText: document.getElementById('action-errors-text'),
		cancelBtn: document.getElementById('btn-cancel-run'),
		body: document.querySelector('#action-box .terminal-body')
	};

	if (!els.box) return;

	const ICONS = { queued: '⏳', in_progress: '<span class="spin">⚙</span>', success: '✅', failure: '❌', cancelled: '⚠️', timed_out: '⏱️' };
	const LABELS = { queued: 'In coda…', in_progress: 'Deploy in esecuzione…', success: 'Deploy completato con successo', failure: 'Deploy fallito', cancelled: 'Annullato', timed_out: 'Timeout' };
	const STEP_CLASS = { success: 'step-success', failure: 'step-failure', skipped: 'step-skipped', in_progress: 'step-in_progress' };

	els.header.className = 'terminal-status-line ' + escHtml(d.status_key);
	els.icon.innerHTML = ICONS[d.status_key] ?? '❓';
	els.label.textContent = LABELS[d.status_key] ?? d.status_key;
	if (d.gh_url) els.link.href = escHtml(d.gh_url);
	if (els.cancelBtn) els.cancelBtn.style.display = 'none';

	els.stepsList.innerHTML = (d.steps || []).map(s =>
		`<li class="${STEP_CLASS[s.state] || ''}">${escHtml(s.name)}</li>`
	).join('');

	if (d.errors?.length) {
		els.errorsBox.className = 'terminal-errors visible';
		els.errorsText.textContent = d.errors.join('\n\n');
	} else {
		els.errorsBox.className = 'terminal-errors';
	}

	// Previeni duplicazione nota storico se il ripristino avviene più volte
	const oldNote = els.box.querySelector('.terminal-log-note');
	if (oldNote) oldNote.remove();

	const note = document.createElement('div');
	note.className = 'terminal-log-note';
	const dateStr = new Date(d.saved_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
	note.textContent = `↑ ultimo deploy: ${d.slug} — ${dateStr}`;

	if (els.body) {
		els.body.appendChild(note);
		els.body.scrollTop = els.body.scrollHeight;
	}

	els.box.classList.add('visible');
}

// ── 14. Bootstrap ─────────────────────────────────────────────



function bootstrap() {
	initTemplatePickers();
	initTableDelegation();
	initSearchFilter();
	initIdentity();

	document.getElementById("btn-refresh-clients")?.addEventListener("click", function () {
		if (!State.authToken) return;
		this.classList.add("spinning");
		loadClients(State.authToken)
			.finally(() => this.classList.remove("spinning"));
	});

	document.getElementById('btn-login').addEventListener('click', () => {
		window.netlifyIdentity && window.netlifyIdentity.open();
	});
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", bootstrap);
} else {
	bootstrap();
}