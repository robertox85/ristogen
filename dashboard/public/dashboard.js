/* dashboard.js – logica della dashboard Ristogen
   Separato da index.astro per mantenere il template leggibile.
   Dipende da: netlify-identity-widget (caricato prima via CDN)
*/

// ── Stato globale ─────────────────────────────────────────────
let _authToken    = null;  // JWT corrente
let _loadStarted  = false; // true non appena iniziamo a caricare la lista clienti

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
  if (b) b.textContent = n > 0 ? n + " siti" : "";
}

// ── Empty-state row ───────────────────────────────────────────
function emptyRow(msg) {
  return `<tr><td colspan="4">
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

// ── Tabella clienti ───────────────────────────────────────────
async function loadClients(token) {
  if (token) _authToken = token;
  const tok = _authToken || currentToken();
  if (!tok) return;

  // Segnala subito che il caricamento è iniziato (evita override dal retry)
  _loadStarted = true;

  const tbody = document.getElementById("clients-tbody");

  // Skeleton loader
  tbody.innerHTML = [90, 140, 110, 60]
    .map(() => '<tr>' + [90, 140, 110, 60]
      .map(w => `<td><span class="skeleton" style="width:${w}px"></span></td>`)
      .join('') + '</tr>')
    .join('');

  // Skeleton row corretto: ogni riga ha 4 colonne con larghezze diverse
  tbody.innerHTML = Array(3).fill(null).map(() =>
    `<tr>
      <td><span class="skeleton" style="width:90px"></span></td>
      <td><span class="skeleton" style="width:140px"></span></td>
      <td><span class="skeleton" style="width:110px"></span></td>
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
      tbody.innerHTML = emptyRow("Nessun sito ancora creato");
      updateCountBadge(0);
      return;
    }

    updateCountBadge(clients.length);
    tbody.innerHTML = clients.map(c => {
      const url      = c.site_url || "";
      const adminUrl = url ? url.replace(/\/$/, "") + "/admin/" : "";
      return `<tr data-slug="${c.slug}">
        <td><span class="slug-chip">${c.slug}</span></td>
        <td>${url
          ? `<a href="${url}" target="_blank" rel="noopener">${url} ↗</a>`
          : '<span style="color:var(--text-light)">—</span>'}</td>
        <td>${adminUrl
          ? `<a href="${adminUrl}" target="_blank" rel="noopener">Apri CMS ↗</a>`
          : '<span style="color:var(--text-light)">—</span>'}</td>
        <td><button class="btn-delete" data-slug="${c.slug}">Elimina</button></td>
      </tr>`;
    }).join('');

    // Gestori eliminazione
    tbody.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", async function () {
        const slug = this.dataset.slug;
        if (!confirm(`Eliminare "${slug}" da Netlify e dal repo?`)) return;
        this.disabled = true;
        this.textContent = "…";
        try {
          const dr = await fetch("/api/clients?slug=" + encodeURIComponent(slug), {
            method: "DELETE",
            headers: { Authorization: "Bearer " + _authToken },
          });
          const dj = await dr.json();
          if (!dr.ok) throw new Error(dj.error || dr.statusText);
          document.querySelector(`tr[data-slug="${slug}"]`)?.remove();
          const remaining = document.querySelectorAll("#clients-tbody tr[data-slug]").length;
          updateCountBadge(remaining);
          if (!remaining) document.getElementById("clients-tbody").innerHTML =
            emptyRow("Nessun sito ancora creato");
          showToast(`Sito "${slug}" eliminato`, "success");
        } catch (e) {
          showToast("Errore eliminazione: " + e.message, "error");
          this.disabled = false;
          this.textContent = "Elimina";
        }
      });
    });

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
}

function tryLoadClients() {
  const user = window.netlifyIdentity && window.netlifyIdentity.currentUser();
  if (!user) return;
  _loadStarted = true;
  renderUserInfo(user);
  window.netlifyIdentity.refresh()
    .then(jwt => { if (jwt) { _authToken = jwt; loadClients(jwt); } })
    .catch(() => {
      const t = user.token && user.token.access_token;
      if (t) { _authToken = t; loadClients(t); }
    });
}

function initIdentity() {
  if (!window.netlifyIdentity) {
    // Identity widget non disponibile (locale senza Netlify)
    document.getElementById("clients-tbody").innerHTML =
      emptyRow("Netlify Identity non disponibile in locale");
    return;
  }

  window.netlifyIdentity.on("init", user => {
    if (user) {
      tryLoadClients();
    } else {
      // Non loggato: mostra messaggio e aspetta login
      document.getElementById("clients-tbody").innerHTML =
        emptyRow("Accedi per vedere i siti creati");
      window.netlifyIdentity.on("login", () => document.location.reload());
    }
  });

  window.netlifyIdentity.on("logout", () => {
    renderUserInfo(null);
    document.location.reload();
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
        if (!_loadStarted) {
          document.getElementById("clients-tbody").innerHTML =
            emptyRow("Accedi per vedere i siti creati");
        }
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
      status.className = "success";
      status.innerHTML = `<span>✓</span> <span>Sito <strong>${newSlug}</strong> creato — monitoraggio deploy in corso</span>`;
      showToast(`Sito "${newSlug}" creato!`, "success");
      showNextSteps(newSlug, json.site_url || "");
      this.reset();
      document.getElementById("slug-hint").textContent = "";
      slugValid = false;
      if (json.run_id) startPolling(json.run_id, tok);
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

  document.getElementById("ns-slug").textContent  = slug;
  document.getElementById("ns-repo").textContent  = slug;
  document.getElementById("ns-admin-url").textContent = adminUrl;

  const siteLink = document.getElementById("ns-site-url");
  const cmsLink  = document.getElementById("ns-cms-url");
  if (siteUrl) { siteLink.href = siteUrl; siteLink.textContent = siteUrl; }
  cmsLink.href = adminUrl;

  box.querySelectorAll(".step-item").forEach(li => {
    li.classList.remove("done");
    li.querySelector(".step-num").textContent = li.dataset.step;
  });

  box.classList.add("visible");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.querySelectorAll(".step-check").forEach(btn => {
  btn.addEventListener("click", function () {
    const li   = this.closest(".step-item");
    const done = li.classList.toggle("done");
    li.querySelector(".step-num").textContent = done ? "✓" : li.dataset.step;
  });
});

document.getElementById("ns-dismiss").addEventListener("click", () =>
  document.getElementById("next-steps-box").classList.remove("visible")
);

// ── GitHub Actions polling ────────────────────────────────────
function startPolling(runId, authToken) {
  const box       = document.getElementById("action-box");
  const header    = document.getElementById("action-header");
  const icon      = document.getElementById("action-icon");
  const label     = document.getElementById("action-label");
  const link      = document.getElementById("action-link");
  const stepsList = document.getElementById("action-steps");
  const errorsBox = document.getElementById("action-errors");
  const errorsText = document.getElementById("action-errors-text");

  box.classList.add("visible");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });

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

    header.className    = "action-status-bar " + key;
    icon.innerHTML      = ICONS[key] ?? "❓";
    label.textContent   = LABELS[key] ?? key;
    link.href           = data.url;

    if (data.jobs && data.jobs.length > 0) {
      const steps = data.jobs[0].steps ?? [];
      stepsList.innerHTML = steps.map(s => {
        const state = s.conclusion ?? s.status ?? "";
        return `<li class="${STEP_CLASS[state] || ""}"><span class="step-dot"></span>${s.name}</li>`;
      }).join("");

      const allErrors = data.jobs.flatMap(j => j.errors ?? []).filter(Boolean);
      errorsBox.className   = allErrors.length ? "visible" : "";
      errorsText.textContent = allErrors.join("\n\n");
    }

    if (data.status === "completed") {
      const ok = data.conclusion === "success";
      showToast(ok ? "✅ Deploy completato!" : "❌ Deploy fallito", ok ? "success" : "error");
      if (ok) setTimeout(() => loadClients(), 3000);
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

// ── Bootstrap ─────────────────────────────────────────────────
// Aspetta che DOM e Identity widget siano pronti
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initIdentity);
} else {
  initIdentity();
}
