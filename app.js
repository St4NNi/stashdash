"use strict";

let state = loadData();

const uiState = {
  page: "dashboard",
  yarnId: null,
  tab: "stock",
  search: "",
  sort: "manufacturer"
};

const pageMeta = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Überblick über Bestand, Reste und letzte Bewegungen."
  },
  stash: {
    title: "Stash",
    subtitle: "Durchsuche, sortiere und verwalte deinen Wollvorrat."
  },
  add: {
    title: "Neues Garn",
    subtitle: "Erfasse Hersteller, Farbe, Lauflänge und Maschenprobe."
  },
  stats: {
    title: "Statistiken",
    subtitle: "Gewicht, Lauflänge und Verlauf deines Stashs."
  },
  settings: {
    title: "Setup",
    subtitle: "Backups, Import und lokaler Speicher."
  }
};

const elements = {};
const numberFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });
let toastTimer = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  elements.title    = document.getElementById("title");
  elements.subtitle = document.getElementById("subtitle");
  elements.view     = document.getElementById("view");
  elements.nav      = document.querySelector("[data-nav]");
  elements.quickAdd = document.getElementById("quickAdd");
  elements.toast    = document.getElementById("toast");

  elements.nav.addEventListener("click", handleNavClick);
  elements.quickAdd.addEventListener("click", () => navigate("add"));
  elements.view.addEventListener("click", handleViewClick);
  elements.view.addEventListener("submit", handleViewSubmit);
  elements.view.addEventListener("input", handleViewInput);
  elements.view.addEventListener("change", handleViewChange);
  window.addEventListener("hashchange", renderRoute);

  if (!window.location.hash) { replaceHash("dashboard"); return; }
  renderRoute();
}

// ---- Event handlers ----

function handleNavClick(event) {
  const button = event.target.closest("button[data-page]");
  if (!button) return;
  navigate(button.dataset.page);
}

function handleViewClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action } = target.dataset;

  if (action === "open-yarn")      navigate(`yarn/${encodeURIComponent(target.dataset.id)}/stock`);
  if (action === "navigate-route") navigate(target.dataset.route);
  if (action === "back-stash")     navigate("stash");
  if (action === "edit-yarn")      navigate(`edit/${encodeURIComponent(target.dataset.id)}`);
  if (action === "switch-tab")     navigate(`yarn/${encodeURIComponent(uiState.yarnId)}/${target.dataset.tab}`);
  if (action === "adjust-skeins")  changeSkeins(Number(target.dataset.delta));
  if (action === "remove-rest")    removeRestSkein(target.dataset.id);
  if (action === "delete-yarn")    deleteYarn(target.dataset.id);
  if (action === "export-data")    exportData();
  if (action === "clear-data")     clearStash();
  if (action === "add-fiber")      addFiberRow();
  if (action === "remove-fiber")   target.closest(".fiber-row")?.remove();
}

function handleViewSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === "yarnForm") { event.preventDefault(); saveYarnFromForm(form); }
  if (form.id === "restForm") { event.preventDefault(); addRestSkein(form); }
}

function handleViewInput(event) {
  if (event.target.id !== "stashSearch") return;
  uiState.search = event.target.value;
  renderStashResults();
}

function handleViewChange(event) {
  if (event.target.id === "stashSort") {
    uiState.sort = event.target.value;
    renderStashResults();
  }
  if (event.target.id === "importFile") {
    importData(event.target.files[0]);
    event.target.value = "";
  }
  if (event.target.id === "csvImportFile") {
    importCSV(event.target.files[0]);
    event.target.value = "";
  }
  if (event.target.id === "photoScan") {
    const file = event.target.files[0];
    if (file) handlePhotoScan(file);
    event.target.value = "";
  }
}

// ---- Routing ----

function navigate(route) {
  if (!route) return;
  const nextHash = `#${route}`;
  if (window.location.hash === nextHash) { renderRoute(); return; }
  window.location.hash = route;
}

function replaceHash(route) {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${route}`);
  renderRoute();
}

function renderRoute() {
  const route = parseRoute();
  uiState.page   = route.page;
  uiState.yarnId = route.yarnId || null;
  uiState.tab    = route.tab || "stock";
  updateNav();

  if (route.page === "dashboard") renderDashboard();
  if (route.page === "stash")     renderStash();
  if (route.page === "add")       renderYarnForm();
  if (route.page === "edit")      renderYarnForm(findYarn(route.yarnId));
  if (route.page === "yarn")      renderYarn(route.yarnId, route.tab);
  if (route.page === "stats")     renderStats();
  if (route.page === "settings")  renderSettings();
}

function parseRoute() {
  const rawHash = window.location.hash.replace(/^#\/?/, "");
  const [rawPage, rawYarnId, rawTab] = rawHash.split("/");
  const page  = decodeRoutePart(rawPage) || "dashboard";
  const yarnId = decodeRoutePart(rawYarnId);
  const tab    = decodeRoutePart(rawTab);
  const allowedTabs = new Set(["stock", "history", "details"]);

  if (page === "yarn" && yarnId) return { page: "yarn", yarnId, tab: allowedTabs.has(tab) ? tab : "stock" };
  if (page === "edit" && yarnId) return { page: "edit", yarnId };
  if (["dashboard", "stash", "add", "stats", "settings"].includes(page)) return { page };
  return { page: "dashboard" };
}

function setHeader(title, subtitle) {
  elements.title.textContent    = title;
  elements.subtitle.textContent = subtitle;
  document.title = `${title} · StashDash`;
}

function decodeRoutePart(value = "") {
  try { return decodeURIComponent(value); } catch { return ""; }
}

function updateNav() {
  const activePage = uiState.page === "yarn" ? "stash" : uiState.page === "edit" ? "add" : uiState.page;
  elements.nav.querySelectorAll("button[data-page]").forEach((btn) => {
    const isActive = btn.dataset.page === activePage;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

// ---- Page renders ----

function renderDashboard() {
  setHeader(pageMeta.dashboard.title, pageMeta.dashboard.subtitle);
  const stats = getInventoryStats();

  elements.view.innerHTML = `
    <section class="metrics-grid" aria-label="Bestandsübersicht">
      ${renderMetric("Gesamtgewicht", formatWeight(stats.totalWeight), `${formatNumber(stats.fullSkeins)} volle Knäuel`)}
      ${renderMetric("Lauflänge", formatMeters(stats.totalMeters), `${formatNumber(stats.restCount)} Reste erfasst`)}
      ${renderMetric("Garne", formatNumber(stats.yarnCount), `${formatNumber(stats.manufacturerCount)} Hersteller`)}
      ${renderMetric("50g-Lagen", decimalFormat.format(stats.totalWeight / 50), "Planungswert für Projekte")}
    </section>

    ${stats.yarnCount === 0 ? renderEmptyState("Dein Stash ist noch leer", "Lege dein erstes Garn an. Alle Daten werden automatisch im Browser gespeichert.", "Neues Garn", "add") : `
      <section class="content-grid">
        <article class="card">
          <div class="section-heading">
            <div><p class="eyebrow">Planung</p><h2>Kleinste Bestände</h2></div>
          </div>
          ${renderLowStockList()}
        </article>
        <article class="card">
          <div class="section-heading">
            <div><p class="eyebrow">Aktivität</p><h2>Letzte Bewegungen</h2></div>
          </div>
          ${renderHistoryList(state.history.slice(0, 6))}
        </article>
      </section>
    `}
  `;
}

function renderStash() {
  setHeader(pageMeta.stash.title, pageMeta.stash.subtitle);

  elements.view.innerHTML = `
    <section class="card toolbar" aria-label="Stash filtern">
      <label class="search-field" for="stashSearch">
        <span>Suchen</span>
        <input id="stashSearch" type="search" value="${escapeAttribute(uiState.search)}" placeholder="Hersteller, Farbe, Faser …" autocomplete="off" />
      </label>
      <label class="select-field" for="stashSort">
        <span>Sortieren</span>
        <select id="stashSort">
          <option value="manufacturer" ${uiState.sort === "manufacturer" ? "selected" : ""}>Hersteller A-Z</option>
          <option value="name"         ${uiState.sort === "name"         ? "selected" : ""}>Name A-Z</option>
          <option value="weight"       ${uiState.sort === "weight"       ? "selected" : ""}>Gewicht</option>
          <option value="updated"      ${uiState.sort === "updated"      ? "selected" : ""}>Zuletzt geändert</option>
        </select>
      </label>
    </section>

    <div class="section-heading stash-heading">
      <div><p class="eyebrow">Inventar</p><h2>Garne</h2></div>
      <span id="stashCount" class="pill"></span>
    </div>

    <section id="stashResults" class="stash-grid" aria-live="polite"></section>
  `;

  renderStashResults();
}

function renderStashResults() {
  const container = document.getElementById("stashResults");
  const count     = document.getElementById("stashCount");
  if (!container || !count) return;

  const filteredYarns = getFilteredYarns();
  count.textContent = `${formatNumber(filteredYarns.length)} von ${formatNumber(state.yarns.length)}`;

  if (state.yarns.length === 0) {
    container.innerHTML = renderEmptyState("Noch keine Garne", "Starte mit Hersteller, Farbe und Knäuelmenge.", "Neues Garn", "add");
    return;
  }
  if (filteredYarns.length === 0) {
    container.innerHTML = renderEmptyState("Keine Treffer", "Passe Suche oder Sortierung an.");
    return;
  }

  container.innerHTML = filteredYarns.map(renderYarnCard).join("");
}

function renderYarnForm(yarn = null) {
  if (uiState.page === "edit" && !yarn) {
    setHeader("Garn nicht gefunden", "Der Eintrag wurde gelöscht oder die Adresse ist ungültig.");
    renderNotFound("Dieses Garn existiert nicht mehr.");
    return;
  }

  const isEdit = Boolean(yarn);
  const draft = yarn || {
    manufacturer: "", name: "",
    color: { name: "", number: "", hex: "#c9a797" },
    fullSkeins: 1, weightPerSkein: 50, lengthPerSkein: 0,
    needleSize: "", gauge: "", fibers: [], fiber: "", notes: ""
  };

  if (isEdit) setHeader("Garn bearbeiten", formatYarnTitle(yarn));
  else        setHeader(pageMeta.add.title, pageMeta.add.subtitle);

  const draftFibers = Array.isArray(draft.fibers) && draft.fibers.length > 0
    ? draft.fibers
    : parseFiberString(draft.fiber || "");

  elements.view.innerHTML = `
    <form id="yarnForm" class="card form-card" data-id="${escapeAttribute(draft.id || "")}">
      <div class="section-heading">
        <div>
          <p class="eyebrow">${isEdit ? "Bearbeiten" : "Anlegen"}</p>
          <h2>${isEdit ? "Garndaten aktualisieren" : "Garndaten erfassen"}</h2>
        </div>
      </div>

      <div class="photo-section">
        <div class="photo-section-header">
          <i data-lucide="pipette" style="width:13px;height:13px" aria-hidden="true"></i>
          Farbton aus Foto
        </div>
        <p class="photo-section-hint">Foto des Garns auswählen – der Farbton wird automatisch erkannt</p>
        <div class="photo-row">
          <label class="secondary-button" style="cursor:pointer">
            <i data-lucide="camera" style="width:14px;height:14px;flex-shrink:0" aria-hidden="true"></i>
            Foto auswählen
            <input type="file" accept="image/*" id="photoScan" class="visually-hidden">
          </label>
          <span id="colorStatus" class="ocr-status" role="status" aria-live="polite"></span>
        </div>
      </div>

      <div class="form-grid">
        <label>
          <span>Hersteller</span>
          <input name="manufacturer" value="${escapeAttribute(draft.manufacturer)}" placeholder="z. B. Sandnes Garn" autocomplete="organization" />
        </label>
        <label>
          <span>Name</span>
          <input name="name" value="${escapeAttribute(draft.name)}" placeholder="z. B. Peer Gynt" autocomplete="off" />
        </label>
        <label>
          <span>Farbname</span>
          <input name="colorName" value="${escapeAttribute(draft.color.name)}" placeholder="z. B. Natur" autocomplete="off" />
        </label>
        <label>
          <span>Farbnummer</span>
          <input name="colorNumber" value="${escapeAttribute(draft.color.number)}" placeholder="z. B. 1012" autocomplete="off" />
        </label>
        <label>
          <span>Farbton</span>
          <input name="colorHex" type="color" value="${safeHex(draft.color.hex)}" />
        </label>
        <label>
          <span>Volle Knäuel</span>
          <input name="fullSkeins" type="number" min="0" step="1" inputmode="numeric" value="${escapeAttribute(draft.fullSkeins)}" />
        </label>
        <label>
          <span>Gramm pro Knäuel</span>
          <input name="weightPerSkein" type="number" min="1" step="0.1" inputmode="decimal" value="${escapeAttribute(draft.weightPerSkein)}" required />
        </label>
        <label>
          <span>Meter pro Knäuel</span>
          <input name="lengthPerSkein" type="number" min="0" step="0.1" inputmode="decimal" value="${escapeAttribute(draft.lengthPerSkein)}" />
        </label>
        <label>
          <span>Nadelstärke</span>
          <input name="needleSize" value="${escapeAttribute(draft.needleSize)}" placeholder="z. B. 4 mm" autocomplete="off" />
        </label>
        <label>
          <span>Maschenprobe</span>
          <input name="gauge" value="${escapeAttribute(draft.gauge || "")}" placeholder="z. B. 20 M × 28 R" autocomplete="off" />
        </label>
      </div>

      <div class="fiber-section">
        <span class="fiber-section-label">Faserzusammensetzung</span>
        <div id="fiberList" class="fiber-list">
          ${renderFiberRows(draftFibers)}
        </div>
        <button type="button" class="secondary-button" data-action="add-fiber" style="font-size:12px;padding:0.3rem 0.7rem">
          + Bestandteil hinzufügen
        </button>
      </div>

      <label class="full-width">
        <span>Notizen</span>
        <textarea name="notes" rows="3" placeholder="Projektideen, Partienummern oder Pflegehinweise">${escapeHtml(draft.notes)}</textarea>
      </label>

      <div class="button-row form-actions">
        <button class="primary-button" type="submit">${isEdit ? "Änderungen speichern" : "Garn speichern"}</button>
        <button class="secondary-button" type="button" data-action="${isEdit ? "open-yarn" : "back-stash"}" data-id="${escapeAttribute(draft.id || "")}">Abbrechen</button>
      </div>
    </form>
  `;

  if (window.lucide) lucide.createIcons();
}

function renderYarn(yarnId, tab = "stock") {
  const yarn = findYarn(yarnId);
  if (!yarn) {
    setHeader("Garn nicht gefunden", "Der Eintrag wurde gelöscht oder die Adresse ist ungültig.");
    renderNotFound("Dieses Garn konnte nicht gefunden werden.");
    return;
  }

  setHeader(formatYarnTitle(yarn), `${formatColorLabel(yarn)} · ${formatWeight(getYarnWeight(yarn))}`);

  elements.view.innerHTML = `
    <article class="card yarn-hero" style="--swatch: ${safeHex(yarn.color.hex)}">
      <div class="large-swatch" aria-hidden="true"></div>
      <div class="yarn-hero-copy">
        <p class="eyebrow">Garndetail</p>
        <h2>${escapeHtml(formatYarnTitle(yarn))}</h2>
        <p>${escapeHtml(formatColorLabel(yarn))}</p>
        <div class="tag-row">
          <span class="tag">${formatWeight(getYarnWeight(yarn))}</span>
          <span class="tag">${formatMeters(getYarnMeters(yarn))}</span>
          <span class="tag">${formatNumber(yarn.fullSkeins)} Knäuel</span>
        </div>
      </div>
      <div class="button-row yarn-actions">
        <button class="secondary-button" type="button" data-action="back-stash">Zurück</button>
        <button class="secondary-button" type="button" data-action="edit-yarn" data-id="${escapeAttribute(yarn.id)}">Bearbeiten</button>
        <button class="danger-button"    type="button" data-action="delete-yarn" data-id="${escapeAttribute(yarn.id)}">Löschen</button>
      </div>
    </article>

    <article class="card">
      <div class="tabs" role="tablist" aria-label="Garndetails">
        ${renderTabButton("stock",   "Bestand", tab)}
        ${renderTabButton("history", "Historie", tab)}
        ${renderTabButton("details", "Details",  tab)}
      </div>
      <div class="tab-panel">
        ${renderYarnTab(yarn, tab)}
      </div>
    </article>
  `;
}

function renderYarnTab(yarn, tab) {
  if (tab === "history") {
    const yarnHistory = state.history.filter((e) => e.yarnId === yarn.id);
    return renderHistoryList(yarnHistory, "Für dieses Garn gibt es noch keine Bewegungen.");
  }

  if (tab === "details") {
    const fiberDisplay = formatFibersString(yarn.fibers) || yarn.fiber || "-";
    return `
      <dl class="detail-grid">
        ${renderDetail("Hersteller",   yarn.manufacturer || "-")}
        ${renderDetail("Name",         yarn.name || "-")}
        ${renderDetail("Farbe",        formatColorLabel(yarn))}
        ${renderDetail("Faser",        fiberDisplay)}
        ${renderDetail("Nadelstärke",  yarn.needleSize || "-")}
        ${renderDetail("Maschenprobe", yarn.gauge || "-")}
        ${renderDetail("Gewicht/Knäuel", `${formatNumber(yarn.weightPerSkein)} g`)}
        ${renderDetail("Meter/Knäuel", formatMeters(yarn.lengthPerSkein))}
        ${renderDetail("Angelegt",     formatDate(yarn.createdAt))}
        ${renderDetail("Aktualisiert", formatDate(yarn.updatedAt))}
      </dl>
      ${yarn.notes ? `<div class="note-box"><h3>Notizen</h3><p>${escapeHtml(yarn.notes)}</p></div>` : ""}
    `;
  }

  return `
    <div class="stock-layout">
      <div class="counter-card">
        <span>Volle Knäuel</span>
        <strong>${formatNumber(yarn.fullSkeins)}</strong>
        <div class="stepper">
          <button class="secondary-button" type="button" data-action="adjust-skeins" data-delta="-1">-1</button>
          <button class="secondary-button" type="button" data-action="adjust-skeins" data-delta="1">+1</button>
        </div>
      </div>
      <div class="counter-card">
        <span>Gesamtbestand</span>
        <strong>${formatWeight(getYarnWeight(yarn))}</strong>
        <small>${formatMeters(getYarnMeters(yarn))}</small>
      </div>
    </div>

    <form id="restForm" class="inline-form" data-yarn-id="${escapeAttribute(yarn.id)}">
      <label>
        <span>Rest in Gramm</span>
        <input name="weight" type="number" min="1" step="0.1" inputmode="decimal" placeholder="z. B. 18" required />
      </label>
      <label>
        <span>Notiz</span>
        <input name="note" placeholder="optional" autocomplete="off" />
      </label>
      <button class="primary-button" type="submit">Rest speichern</button>
    </form>

    ${renderRestList(yarn)}
  `;
}

function renderTabButton(tab, label, activeTab) {
  const isActive = tab === activeTab;
  return `<button type="button" role="tab" data-action="switch-tab" data-tab="${tab}" class="${isActive ? "is-active" : ""}" aria-selected="${isActive}">${label}</button>`;
}

function renderStats() {
  setHeader(pageMeta.stats.title, pageMeta.stats.subtitle);
  const stats = getInventoryStats();

  if (stats.yarnCount === 0) {
    elements.view.innerHTML = renderEmptyState("Noch keine Statistik", "Sobald du Garne anlegst, erscheinen hier Auswertungen.", "Neues Garn", "add");
    return;
  }

  const timeline = buildSkeinTimeline();
  const byManufacturer = aggregateBy("manufacturer");
  const fiberGroups    = aggregateFibers();

  elements.view.innerHTML = `
    <section class="metrics-grid" aria-label="Statistikübersicht">
      ${renderMetric("Gesamtgewicht", formatWeight(stats.totalWeight), `${formatNumber(stats.fullSkeins)} volle Knäuel`)}
      ${renderMetric("Lauflänge",     formatMeters(stats.totalMeters), "")}
      ${renderMetric("Reste",         formatNumber(stats.restCount), formatWeight(stats.restWeight))}
      ${renderMetric("Durchschnitt",  formatWeight(stats.totalWeight / stats.yarnCount), "pro Garn")}
    </section>

    <article class="card chart-card">
      <p class="chart-title">Knäuelbestand – Verlauf</p>
      <div class="chart-wrap">
        ${renderSkeinChart(timeline)}
      </div>
    </article>

    <article class="card">
      <div class="section-heading">
        <div><p class="eyebrow">Verteilung</p><h2>Nach Hersteller</h2></div>
      </div>
      ${renderBars(byManufacturer)}
    </article>

    <article class="card">
      <div class="section-heading">
        <div><p class="eyebrow">Verteilung</p><h2>Nach Faserart</h2></div>
      </div>
      ${renderBars(fiberGroups)}
    </article>
  `;
}

function renderSettings() {
  setHeader(pageMeta.settings.title, pageMeta.settings.subtitle);
  const dataSize = new Blob([JSON.stringify(state)]).size;

  elements.view.innerHTML = `
    <section class="settings-grid">
      <article class="card">
        <div class="section-heading">
          <div><p class="eyebrow">Backup</p><h2>JSON-Sicherung</h2></div>
        </div>
        <p class="muted">Exportiere deinen Stash als JSON-Datei oder importiere ein Backup. Beim Import wird der aktuelle lokale Bestand ersetzt.</p>
        <div class="button-row" style="margin-top:0.75rem">
          <button class="primary-button" type="button" data-action="export-data">JSON exportieren</button>
          <label class="secondary-button file-button" for="importFile">JSON importieren</label>
          <input id="importFile" class="visually-hidden" type="file" accept="application/json,.json" />
        </div>
      </article>

      <article class="card">
        <div class="section-heading">
          <div><p class="eyebrow">CSV-Import</p><h2>Bestehenden Stash importieren</h2></div>
        </div>
        <p class="muted">Importiere Garne aus einer CSV-Datei. Bestehende Einträge bleiben erhalten – neue werden hinzugefügt.</p>
        <p class="muted" style="margin-top:0.4rem;font-size:11px;color:var(--text-tertiary)">
          Spalten (Kopfzeile erforderlich): Hersteller, Name, Farbname, Farbnummer, Farbton, Knäuel, Gramm, Meter, Nadelstärke, Maschenprobe, Faser, Notizen
        </p>
        <div class="button-row" style="margin-top:0.75rem">
          <label class="secondary-button file-button" for="csvImportFile">CSV importieren</label>
          <input id="csvImportFile" class="visually-hidden" type="file" accept=".csv,text/csv" />
        </div>
      </article>

      <article class="card">
        <div class="section-heading">
          <div><p class="eyebrow">Speicher</p><h2>Lokale Daten</h2></div>
        </div>
        <dl class="detail-grid compact">
          ${renderDetail("Speicherschlüssel", getStorageKey())}
          ${renderDetail("Version",  String(state.version || 1))}
          ${renderDetail("Garne",    formatNumber(state.yarns.length))}
          ${renderDetail("Historie", formatNumber(state.history.length))}
          ${renderDetail("Größe",    `${formatNumber(dataSize)} Bytes`)}
        </dl>
      </article>

      <article class="card danger-zone">
        <div class="section-heading">
          <div><p class="eyebrow">Zurücksetzen</p><h2>Gefahrenzone</h2></div>
        </div>
        <p class="muted">Löscht nur die Daten in diesem Browser. Ein vorheriger Export ist empfohlen.</p>
        <button class="danger-button" type="button" data-action="clear-data" style="margin-top:0.75rem">Alle lokalen Daten löschen</button>
      </article>
    </section>
  `;
}

// ---- Data mutations ----

function saveYarnFromForm(form) {
  const formData    = new FormData(form);
  const id          = form.dataset.id;
  const existing    = id ? findYarn(id) : null;
  const now         = new Date().toISOString();
  const manufacturer = cleanFormText(formData.get("manufacturer"));
  const name        = cleanFormText(formData.get("name"));

  if (!manufacturer && !name) {
    showToast("Bitte Hersteller oder Garnnamen eintragen.");
    form.querySelector("input[name='manufacturer']").focus();
    return;
  }

  const fiberPcts  = formData.getAll("fiberPct");
  const fiberTypes = formData.getAll("fiberType");
  const fibers = fiberPcts
    .map((pct, i) => ({ pct: parseFormNumber(pct, 0, true), type: cleanFormText(fiberTypes[i] || "") }))
    .filter((f) => f.type && f.pct > 0);

  const yarn = {
    id:             existing?.id || createId("yarn"),
    manufacturer,
    name,
    color: {
      name:   cleanFormText(formData.get("colorName")),
      number: cleanFormText(formData.get("colorNumber")),
      hex:    safeHex(formData.get("colorHex"))
    },
    fullSkeins:     parseFormNumber(formData.get("fullSkeins"), 0, true),
    weightPerSkein: Math.max(parseFormNumber(formData.get("weightPerSkein"), 50), 1),
    lengthPerSkein: parseFormNumber(formData.get("lengthPerSkein"), 0),
    restSkeins:     existing?.restSkeins || [],
    needleSize:     cleanFormText(formData.get("needleSize")),
    gauge:          cleanFormText(formData.get("gauge")),
    fibers,
    fiber:          formatFibersString(fibers),
    notes:          cleanFormText(formData.get("notes"), 1500),
    createdAt:      existing?.createdAt || now,
    updatedAt:      now
  };

  if (existing) {
    Object.assign(existing, yarn);
    addHistory(yarn.id, "EDIT", 0, "Garndaten aktualisiert");
  } else {
    state.yarns.unshift(yarn);
    addHistory(yarn.id, "CREATE", getYarnWeight(yarn), "Garn angelegt");
  }

  if (!persistState()) return;
  showToast(existing ? "Garn aktualisiert." : "Garn gespeichert.");
  navigate(`yarn/${encodeURIComponent(yarn.id)}/stock`);
}

function addRestSkein(form) {
  const yarn = findYarn(form.dataset.yarnId);
  if (!yarn) return;
  const formData = new FormData(form);
  const weight   = parseFormNumber(formData.get("weight"), 0);
  if (weight <= 0) { showToast("Bitte ein Restgewicht größer als 0 eintragen."); return; }

  yarn.restSkeins.push({ id: createId("rest"), weight, note: cleanFormText(formData.get("note"), 240) });
  yarn.updatedAt = new Date().toISOString();
  addHistory(yarn.id, "REST_ADD", weight, "Rest gespeichert");
  if (!persistState()) return;
  showToast("Rest gespeichert.");
  renderYarn(yarn.id, "stock");
}

function changeSkeins(delta) {
  const yarn = findYarn(uiState.yarnId);
  if (!yarn || !Number.isFinite(delta)) return;
  const nextValue  = Math.max(0, yarn.fullSkeins + delta);
  const actualDelta = nextValue - yarn.fullSkeins;
  if (actualDelta === 0) return;
  yarn.fullSkeins = nextValue;
  yarn.updatedAt  = new Date().toISOString();
  addHistory(yarn.id, actualDelta > 0 ? "ADD" : "REMOVE", actualDelta * yarn.weightPerSkein,
    actualDelta > 0 ? "Knäuel hinzugefügt" : "Knäuel entnommen");
  if (!persistState()) return;
  renderYarn(yarn.id, "stock");
}

function removeRestSkein(restId) {
  const yarn = findYarn(uiState.yarnId);
  if (!yarn) return;
  const rest = yarn.restSkeins.find((r) => r.id === restId);
  if (!rest) return;
  yarn.restSkeins = yarn.restSkeins.filter((r) => r.id !== restId);
  yarn.updatedAt  = new Date().toISOString();
  addHistory(yarn.id, "REST_REMOVE", -rest.weight, "Rest entfernt");
  if (!persistState()) return;
  showToast("Rest entfernt.");
  renderYarn(yarn.id, "stock");
}

function deleteYarn(yarnId) {
  const yarn = findYarn(yarnId);
  if (!yarn) return;
  if (!window.confirm(`"${formatYarnTitle(yarn)}" wirklich löschen? Diese Aktion entfernt auch die Historie dieses Garns.`)) return;
  state.yarns   = state.yarns.filter((y) => y.id !== yarnId);
  state.history = state.history.filter((e) => e.yarnId !== yarnId);
  if (!persistState()) return;
  showToast("Garn gelöscht.");
  navigate("stash");
}

function exportData() {
  const blob = new Blob([JSON.stringify(normalizeData(state), null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `stashdash-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast("Backup exportiert.");
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = normalizeData(JSON.parse(String(reader.result)));
      if (!window.confirm("Dieses Backup importieren und den aktuellen lokalen Stash ersetzen?")) return;
      state = saveData(imported);
      uiState.search = "";
      showToast("Backup importiert.");
      navigate("dashboard");
    } catch (error) {
      console.error(error);
      showToast("Import fehlgeschlagen. Bitte JSON-Datei prüfen.");
    }
  };
  reader.onerror = () => showToast("Import fehlgeschlagen. Datei konnte nicht gelesen werden.");
  reader.readAsText(file);
}

function importCSV(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows    = parseCSV(String(reader.result));
      if (rows.length === 0) { showToast("Keine Daten in der CSV-Datei gefunden."); return; }

      const colMap = {
        manufacturer: ["hersteller", "manufacturer", "marke", "brand"],
        name:         ["name", "garnname", "yarn name", "produktname"],
        colorName:    ["farbname", "farbe", "color name", "colour name", "color"],
        colorNumber:  ["farbnummer", "farb-nr", "color number", "colour number", "color no"],
        colorHex:     ["farbton", "hex", "hex code", "color hex", "colour hex"],
        fullSkeins:   ["knäuel", "knauel", "volle knäuel", "skeins", "anzahl"],
        weightPerSkein: ["gramm", "gramm/knäuel", "g/knäuel", "weight", "g per skein", "gramm pro knäuel"],
        lengthPerSkein: ["meter", "meter/knäuel", "m/knäuel", "length", "meters", "meter pro knäuel"],
        needleSize:   ["nadelstärke", "nadel", "needle size", "needle"],
        gauge:        ["maschenprobe", "gauge", "tension"],
        fiber:        ["faser", "faserzusammensetzung", "fiber", "fibre", "material"],
        notes:        ["notizen", "notiz", "notes", "note", "anmerkungen"]
      };

      const headers = rows[0];
      const normH   = headers.map((h) => h.toLowerCase().trim());
      const getCol  = (keys) => keys.reduce((found, k) => found >= 0 ? found : normH.indexOf(k), -1);
      const colIdx  = Object.fromEntries(Object.entries(colMap).map(([k, keys]) => [k, getCol(keys)]));

      const now    = new Date().toISOString();
      const added  = [];

      for (const row of rows.slice(1)) {
        const get = (key) => colIdx[key] >= 0 ? (row[colIdx[key]] || "").trim() : "";
        const manufacturer = get("manufacturer");
        const name         = get("name");
        if (!manufacturer && !name) continue;

        const fibers     = parseFiberString(get("fiber"));
        const fiberStr   = formatFibersString(fibers) || get("fiber");
        const fullSkeins = parseFormNumber(get("fullSkeins"), 0, true);
        const wps        = Math.max(parseFormNumber(get("weightPerSkein"), 50), 1);
        const lps        = parseFormNumber(get("lengthPerSkein"), 0);
        const hexVal     = get("colorHex");

        const yarn = {
          id:             createId("yarn"),
          manufacturer,
          name,
          color: {
            name:   get("colorName"),
            number: get("colorNumber"),
            hex:    safeHex(hexVal || "#c9a797")
          },
          fullSkeins,
          weightPerSkein: wps,
          lengthPerSkein: lps,
          restSkeins:     [],
          needleSize:     get("needleSize"),
          gauge:          get("gauge"),
          fibers,
          fiber:          fiberStr,
          notes:          get("notes").slice(0, 1500),
          createdAt:      now,
          updatedAt:      now
        };

        state.yarns.push(yarn);
        addHistory(yarn.id, "CREATE", getYarnWeight(yarn), "CSV-Import");
        added.push(yarn.id);
      }

      if (added.length === 0) { showToast("Keine neuen Garne erkannt."); return; }
      if (!persistState()) return;
      showToast(`${added.length} Garn${added.length === 1 ? "" : "e"} importiert.`);
      navigate("stash");
    } catch (err) {
      console.error(err);
      showToast("CSV-Import fehlgeschlagen. Format prüfen.");
    }
  };
  reader.onerror = () => showToast("Datei konnte nicht gelesen werden.");
  reader.readAsText(file, "utf-8");
}

function parseCSV(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const sep   = text.includes(";") ? ";" : ",";

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) {
        cells.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

function clearStash() {
  if (!window.confirm("Alle lokal gespeicherten Garne und Bewegungen löschen?")) return;
  try {
    state = resetData();
    uiState.search = "";
    showToast("Lokaler Stash wurde gelöscht.");
    navigate("dashboard");
  } catch (error) {
    console.error(error);
    showToast("Daten konnten nicht gelöscht werden.");
  }
}

function persistState() {
  try { state = saveData(state); return true; }
  catch (error) {
    console.error(error);
    showToast("Speichern fehlgeschlagen. Browser-Speicher prüfen.");
    return false;
  }
}

function addHistory(yarnId, type, deltaWeight, description) {
  state.history.unshift({
    id: createId("history"), yarnId, type, deltaWeight, description,
    timestamp: new Date().toISOString()
  });
  state.history = state.history.slice(0, 300);
}

// ---- Queries / helpers ----

function getFilteredYarns() {
  const query = uiState.search.trim().toLowerCase();
  let yarns = [...state.yarns];

  if (query) {
    yarns = yarns.filter((yarn) =>
      [yarn.manufacturer, yarn.name, yarn.color.name, yarn.color.number,
       yarn.fiber, yarn.needleSize, yarn.gauge, yarn.notes]
        .join(" ").toLowerCase().includes(query));
  }

  yarns.sort((a, b) => {
    if (uiState.sort === "name")         return formatYarnTitle(a).localeCompare(formatYarnTitle(b), "de");
    if (uiState.sort === "weight")       return getYarnWeight(b) - getYarnWeight(a);
    if (uiState.sort === "updated")      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    // default: manufacturer A-Z, then name A-Z
    const mCmp = (a.manufacturer || "").localeCompare(b.manufacturer || "", "de");
    return mCmp !== 0 ? mCmp : (a.name || "").localeCompare(b.name || "", "de");
  });

  return yarns;
}

function getInventoryStats() {
  const manufacturers = new Set(state.yarns.map((y) => y.manufacturer).filter(Boolean));
  const fullSkeins    = state.yarns.reduce((sum, y) => sum + y.fullSkeins, 0);
  const restWeight    = state.yarns.reduce((sum, y) => sum + getRestWeight(y), 0);
  return {
    yarnCount:         state.yarns.length,
    manufacturerCount: manufacturers.size,
    fullSkeins,
    restCount:  state.yarns.reduce((sum, y) => sum + y.restSkeins.length, 0),
    restWeight,
    totalWeight: state.yarns.reduce((sum, y) => sum + getYarnWeight(y), 0),
    totalMeters: state.yarns.reduce((sum, y) => sum + getYarnMeters(y), 0)
  };
}

function aggregateBy(field) {
  const groups = new Map();
  state.yarns.forEach((yarn) => {
    const label    = yarn[field] || "Nicht erfasst";
    const existing = groups.get(label) || { label, weight: 0, count: 0 };
    existing.weight += getYarnWeight(yarn);
    existing.count  += 1;
    groups.set(label, existing);
  });
  return [...groups.values()].sort((a, b) => b.weight - a.weight);
}

function aggregateFibers() {
  const groups = new Map();
  state.yarns.forEach((yarn) => {
    const fibers = Array.isArray(yarn.fibers) && yarn.fibers.length > 0
      ? yarn.fibers
      : parseFiberString(yarn.fiber || "");
    if (fibers.length === 0) {
      const key = "Nicht erfasst";
      const e   = groups.get(key) || { label: key, weight: 0, count: 0 };
      e.weight += getYarnWeight(yarn); e.count += 1;
      groups.set(key, e);
    } else {
      fibers.forEach((f) => {
        const key = f.type || "Unbekannt";
        const e   = groups.get(key) || { label: key, weight: 0, count: 0 };
        e.weight += getYarnWeight(yarn) * (f.pct / 100);
        e.count  += 1;
        groups.set(key, e);
      });
    }
  });
  return [...groups.values()].sort((a, b) => b.weight - a.weight);
}

function getYarnWeight(yarn)  { return yarn.fullSkeins * yarn.weightPerSkein + getRestWeight(yarn); }
function getYarnMeters(yarn)  {
  if (!yarn.weightPerSkein || !yarn.lengthPerSkein) return 0;
  return yarn.fullSkeins * yarn.lengthPerSkein + (getRestWeight(yarn) / yarn.weightPerSkein) * yarn.lengthPerSkein;
}
function getRestWeight(yarn)  { return yarn.restSkeins.reduce((s, r) => s + r.weight, 0); }
function findYarn(id)         { return state.yarns.find((y) => y.id === id); }

// ---- Fiber helpers ----

function renderFiberRows(fibers) {
  if (!fibers || fibers.length === 0) {
    return `<div class="fiber-row">
      <input type="number" name="fiberPct" class="fiber-pct" min="1" max="100" value="100" placeholder="%" inputmode="numeric" />
      <span class="fiber-sep">%</span>
      <input type="text" name="fiberType" class="fiber-type" value="" placeholder="z. B. Schurwolle" autocomplete="off" />
      <button type="button" class="icon-btn danger" data-action="remove-fiber" aria-label="Entfernen">×</button>
    </div>`;
  }
  return fibers.map((f) => `
    <div class="fiber-row">
      <input type="number" name="fiberPct" class="fiber-pct" min="1" max="100" value="${escapeAttribute(String(f.pct))}" placeholder="%" inputmode="numeric" />
      <span class="fiber-sep">%</span>
      <input type="text" name="fiberType" class="fiber-type" value="${escapeAttribute(f.type)}" placeholder="z. B. Schurwolle" autocomplete="off" />
      <button type="button" class="icon-btn danger" data-action="remove-fiber" aria-label="Entfernen">×</button>
    </div>
  `).join("");
}

function addFiberRow() {
  const list = document.getElementById("fiberList");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "fiber-row";
  row.innerHTML = `
    <input type="number" name="fiberPct" class="fiber-pct" min="1" max="100" value="" placeholder="%" inputmode="numeric" />
    <span class="fiber-sep">%</span>
    <input type="text" name="fiberType" class="fiber-type" value="" placeholder="z. B. Schurwolle" autocomplete="off" />
    <button type="button" class="icon-btn danger" data-action="remove-fiber" aria-label="Entfernen">×</button>
  `;
  list.appendChild(row);
}

function formatFibersString(fibers) {
  if (!Array.isArray(fibers) || fibers.length === 0) return "";
  return fibers.map((f) => `${f.pct}% ${f.type}`).join(" / ");
}

function parseFiberString(str) {
  if (!str || typeof str !== "string") return [];
  return str.split(/\s*[\/+,]\s*/)
    .map((p) => { const m = p.match(/^(\d+(?:[.,]\d+)?)\s*%\s*(.+)$/); return m ? { pct: parseInt(m[1]), type: m[2].trim() } : null; })
    .filter(Boolean);
}

// ---- Chart ----

function buildSkeinTimeline() {
  const events = [...state.history]
    .filter((e) => ["CREATE", "ADD", "REMOVE"].includes(e.type))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (events.length === 0) return [];

  let running = 0;
  const raw   = [];

  for (const event of events) {
    const yarn = findYarn(event.yarnId);
    const wps  = yarn?.weightPerSkein || 50;
    const delta = Math.round(event.deltaWeight / wps);
    running = Math.max(0, running + delta);
    raw.push({ date: new Date(event.timestamp), skeins: running });
  }

  // Group by day, keep last value per day
  const byDay = new Map();
  for (const pt of raw) {
    byDay.set(pt.date.toISOString().slice(0, 10), pt.skeins);
  }

  // Add current totals as final point
  const today         = new Date().toISOString().slice(0, 10);
  const currentSkeins = state.yarns.reduce((s, y) => s + y.fullSkeins, 0);
  byDay.set(today, currentSkeins);

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, skeins]) => ({ date: new Date(date), skeins }));
}

function renderSkeinChart(points) {
  if (points.length < 2) {
    return `<p class="muted" style="font-size:13px">Noch zu wenig Verlaufsdaten. Knäuelmengen über Zeit werden hier angezeigt, sobald Bewegungen erfasst wurden.</p>`;
  }

  const W = 560, H = 150, PL = 36, PR = 8, PT = 8, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;

  const minT   = points[0].date.getTime();
  const maxT   = points[points.length - 1].date.getTime();
  const maxV   = Math.max(...points.map((p) => p.skeins), 1);
  const span   = maxT - minT || 1;

  const toX = (d) => PL + ((d.getTime() - minT) / span) * cW;
  const toY = (v) => PT + cH - (v / maxV) * cH;

  const linePath  = points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.date).toFixed(1)},${toY(p.skeins).toFixed(1)}`).join(" ");
  const areaPath  = `${linePath} L${toX(points[points.length - 1].date).toFixed(1)},${(PT + cH).toFixed(1)} L${PL},${(PT + cH).toFixed(1)} Z`;

  const fmtDate = (d) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });

  // Y-axis: 0 and max
  const yLabels = [0, Math.round(maxV / 2), maxV].filter((v, i, a) => a.indexOf(v) === i);

  // X-axis: evenly distributed date labels (max 4)
  const xCount  = Math.min(4, points.length);
  const xLabels = Array.from({ length: xCount }, (_, i) => points[Math.round((points.length - 1) * (i / (xCount - 1)))]);

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible" aria-hidden="true">
      <!-- grid lines -->
      ${yLabels.map((v) => `<line x1="${PL}" y1="${toY(v).toFixed(1)}" x2="${W - PR}" y2="${toY(v).toFixed(1)}" stroke="var(--border-subtle)" stroke-width="1"/>`).join("")}
      <!-- area -->
      <path d="${areaPath}" fill="var(--accent-glow)" />
      <!-- line -->
      <path d="${linePath}" fill="none" stroke="var(--accent-dim)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <!-- dots at first and last -->
      <circle cx="${toX(points[0].date).toFixed(1)}" cy="${toY(points[0].skeins).toFixed(1)}" r="3" fill="var(--accent-dim)"/>
      <circle cx="${toX(points[points.length-1].date).toFixed(1)}" cy="${toY(points[points.length-1].skeins).toFixed(1)}" r="3" fill="var(--accent)"/>
      <!-- Y labels -->
      ${yLabels.map((v) => `<text x="${PL - 4}" y="${(toY(v) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-tertiary)">${v}</text>`).join("")}
      <!-- X labels -->
      ${xLabels.map((p, i) => {
        const x   = toX(p.date);
        const anchor = i === 0 ? "start" : i === xCount - 1 ? "end" : "middle";
        return `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="${anchor}" font-size="9" fill="var(--text-tertiary)">${fmtDate(p.date)}</text>`;
      }).join("")}
      <!-- axes -->
      <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT + cH}" stroke="var(--border-default)" stroke-width="1"/>
      <line x1="${PL}" y1="${PT + cH}" x2="${W - PR}" y2="${PT + cH}" stroke="var(--border-default)" stroke-width="1"/>
    </svg>
  `;
}

// ---- Render helpers ----

function renderYarnCard(yarn) {
  return `
    <button class="card stash-card" type="button" data-action="open-yarn" data-id="${escapeAttribute(yarn.id)}" style="--swatch: ${safeHex(yarn.color.hex)}">
      <span class="yarn-swatch" aria-hidden="true"></span>
      <span class="stash-card-body">
        <span class="stash-title">${escapeHtml(formatYarnTitle(yarn))}</span>
        <span class="muted">${escapeHtml(formatColorLabel(yarn))}</span>
        <span class="tag-row">
          <span class="tag">${formatWeight(getYarnWeight(yarn))}</span>
          <span class="tag">${formatMeters(getYarnMeters(yarn))}</span>
          <span class="tag">${formatNumber(yarn.restSkeins.length)} Reste</span>
        </span>
      </span>
    </button>
  `;
}

function renderMetric(label, value, detail = "") {
  return `
    <article class="metric-card">
      <span class="metric-label">${escapeHtml(label)}</span>
      <strong class="metric-value">${escapeHtml(value)}</strong>
      ${detail ? `<small class="metric-sub">${escapeHtml(detail)}</small>` : ""}
    </article>
  `;
}

function renderLowStockList() {
  const yarns = [...state.yarns]
    .filter((y) => getYarnWeight(y) > 0)
    .sort((a, b) => getYarnWeight(a) - getYarnWeight(b))
    .slice(0, 5);
  if (yarns.length === 0) return `<p class="muted">Keine Bestände mit Gewicht erfasst.</p>`;
  return `
    <div class="list-stack">
      ${yarns.map((yarn) => `
        <button class="list-row" type="button" data-action="open-yarn" data-id="${escapeAttribute(yarn.id)}">
          <span><strong>${escapeHtml(formatYarnTitle(yarn))}</strong><small>${escapeHtml(formatColorLabel(yarn))}</small></span>
          <span class="pill">${formatWeight(getYarnWeight(yarn))}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderHistoryList(historyItems, emptyText = "Noch keine Bewegungen erfasst.") {
  if (!historyItems.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `
    <div class="list-stack">
      ${historyItems.map((entry) => {
        const yarn = findYarn(entry.yarnId);
        return `
          <div class="history-row">
            <span>
              <strong>${escapeHtml(historyLabel(entry.type))}</strong>
              <small>${escapeHtml(yarn ? formatYarnTitle(yarn) : "Gelöschtes Garn")} · ${escapeHtml(formatDate(entry.timestamp))}</small>
              ${entry.description ? `<small>${escapeHtml(entry.description)}</small>` : ""}
            </span>
            <span class="pill ${entry.deltaWeight < 0 ? "negative" : ""}">${formatSignedWeight(entry.deltaWeight)}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderRestList(yarn) {
  if (!yarn.restSkeins.length) return `<p class="muted">Noch keine Reste gespeichert.</p>`;
  return `
    <div class="rest-list">
      <div class="section-heading compact-heading">
        <div><p class="eyebrow">Reste</p><h3>${formatNumber(yarn.restSkeins.length)} Einträge</h3></div>
      </div>
      ${yarn.restSkeins.map((rest) => `
        <div class="rest-row">
          <span>
            <strong>${formatWeight(rest.weight)}</strong>
            ${rest.note ? `<small>${escapeHtml(rest.note)}</small>` : ""}
          </span>
          <button class="secondary-button" type="button" data-action="remove-rest" data-id="${escapeAttribute(rest.id)}">Entfernen</button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderBars(rows) {
  if (!rows.length) return `<p class="muted">Keine Daten vorhanden.</p>`;
  const max = Math.max(...rows.map((r) => r.weight), 1);
  return `
    <div class="bar-list">
      ${rows.slice(0, 8).map((row) => `
        <div class="bar-row">
          <div class="bar-label">
            <strong>${escapeHtml(row.label)}</strong>
            <small>${formatNumber(row.count)} Garn${row.count === 1 ? "" : "e"}</small>
          </div>
          <div class="bar-track" aria-hidden="true">
            <span style="width:${Math.max((row.weight / max) * 100, 3).toFixed(1)}%"></span>
          </div>
          <span class="pill">${formatWeight(row.weight)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDetail(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderEmptyState(title, text, actionLabel = "", route = "") {
  return `
    <section class="empty-state">
      <div class="empty-orb" aria-hidden="true"></div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
      ${actionLabel && route ? `<button class="primary-button" type="button" data-action="navigate-route" data-route="${escapeAttribute(route)}">${escapeHtml(actionLabel)}</button>` : ""}
    </section>
  `;
}

function renderNotFound(message) {
  elements.view.innerHTML = `
    <section class="empty-state">
      <h2>Nicht gefunden</h2>
      <p>${escapeHtml(message)}</p>
      <button class="primary-button" type="button" data-action="back-stash">Zurück zum Stash</button>
    </section>
  `;
}

// ---- Formatters ----

function formatYarnTitle(yarn) {
  return [yarn.manufacturer, yarn.name].filter(Boolean).join(" ") || "Unbenanntes Garn";
}
function formatColorLabel(yarn) {
  return [yarn.color.name, yarn.color.number].filter(Boolean).join(" · ") || "Farbe nicht erfasst";
}
function formatWeight(value) {
  if (!Number.isFinite(value)) return "0 g";
  if (Math.abs(value) >= 1000) return `${decimalFormat.format(value / 1000)} kg`;
  return `${decimalFormat.format(value)} g`;
}
function formatSignedWeight(value) {
  if (!value) return "0 g";
  return (value > 0 ? "+" : "") + formatWeight(value);
}
function formatMeters(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 m";
  if (value >= 1000) return `${decimalFormat.format(value / 1000)} km`;
  return `${numberFormat.format(value)} m`;
}
function formatNumber(value) { return numberFormat.format(Number.isFinite(value) ? value : 0); }
function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : dateFormat.format(d);
}
function historyLabel(type) {
  return { CREATE: "Angelegt", ADD: "Hinzugefügt", REMOVE: "Entnommen",
           REST_ADD: "Rest gespeichert", REST_REMOVE: "Rest entfernt", EDIT: "Bearbeitet", NOTE: "Notiz" }[type] || type;
}
function parseFormNumber(value, fallback = 0, integer = false) {
  const n = Number(String(value).replace(",", "."));
  const p = Number.isFinite(n) ? Math.max(n, 0) : fallback;
  return integer ? Math.round(p) : p;
}
function cleanFormText(value, maxLength = 280) { return String(value ?? "").trim().slice(0, maxLength); }
function safeHex(value) {
  const c = String(value ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(c) ? c : "#c9a797";
}
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeAttribute(value) { return escapeHtml(value); }

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

// ---- Foto-Farberkennung ----

async function handlePhotoScan(file) {
  const statusEl = document.getElementById("colorStatus");
  if (!statusEl) return;
  statusEl.className = "ocr-status";
  statusEl.textContent = "Farbe wird erkannt…";

  try {
    const colorHex = await detectDominantColor(file);
    const form = document.getElementById("yarnForm");
    if (!form) return;

    if (colorHex) {
      form.querySelector("[name='colorHex']").value = colorHex;
      statusEl.className   = "ocr-status success";
      statusEl.textContent = `Farbton erkannt`;
    } else {
      statusEl.className   = "ocr-status";
      statusEl.textContent = "Kein dominanter Farbton gefunden";
    }
  } catch (err) {
    console.error(err);
    const el = document.getElementById("colorStatus");
    if (el) { el.className = "ocr-status error"; el.textContent = "Erkennung fehlgeschlagen"; }
  }
}

function detectDominantColor(imageFile) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);
    img.onload = () => {
      const maxPx = 200;
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const weights  = {};

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 200) continue;
        const max  = Math.max(r, g, b);
        const min  = Math.min(r, g, b);
        const sat  = max > 0 ? (max - min) / max : 0;
        const bri  = max / 255;
        // Skip near-white, near-black, and unsaturated (gray/beige background)
        if (bri > 0.90 || bri < 0.05 || sat < 0.08) continue;
        // Weight by saturation^1.5 — vivid pixels dominate
        const w  = sat ** 1.5;
        const rq = Math.round(r / 16) * 16;
        const gq = Math.round(g / 16) * 16;
        const bq = Math.round(b / 16) * 16;
        const key = `${rq},${gq},${bq}`;
        weights[key] = (weights[key] || 0) + w;
      }

      let bestKey = null, bestW = 0;
      for (const [k, w] of Object.entries(weights)) {
        if (w > bestW) { bestW = w; bestKey = k; }
      }

      if (!bestKey) { resolve(null); return; }
      const [r, g, b] = bestKey.split(",").map(Number);
      resolve("#" + [r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join(""));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
