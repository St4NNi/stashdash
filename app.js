"use strict";

let state = loadData();

const uiState = {
  page: "dashboard",
  yarnId: null,
  tab: "stock",
  search: "",
  sort: "updated"
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
    subtitle: "Erfasse Hersteller, Farbe, Lauflänge und Lagerort."
  },
  stats: {
    title: "Statistiken",
    subtitle: "Gewicht, Lauflänge und Verteilung deines Stashs."
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
  elements.title = document.getElementById("title");
  elements.subtitle = document.getElementById("subtitle");
  elements.view = document.getElementById("view");
  elements.nav = document.querySelector("[data-nav]");
  elements.quickAdd = document.getElementById("quickAdd");
  elements.toast = document.getElementById("toast");

  elements.nav.addEventListener("click", handleNavClick);
  elements.quickAdd.addEventListener("click", () => navigate("add"));
  elements.view.addEventListener("click", handleViewClick);
  elements.view.addEventListener("submit", handleViewSubmit);
  elements.view.addEventListener("input", handleViewInput);
  elements.view.addEventListener("change", handleViewChange);
  window.addEventListener("hashchange", renderRoute);

  if (!window.location.hash) {
    replaceHash("dashboard");
    return;
  }

  renderRoute();
}

function handleNavClick(event) {
  const button = event.target.closest("button[data-page]");
  if (!button) return;
  navigate(button.dataset.page);
}

function handleViewClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;

  const { action } = actionTarget.dataset;

  if (action === "open-yarn") navigate(`yarn/${encodeURIComponent(actionTarget.dataset.id)}/stock`);
  if (action === "navigate-route") navigate(actionTarget.dataset.route);
  if (action === "back-stash") navigate("stash");
  if (action === "edit-yarn") navigate(`edit/${encodeURIComponent(actionTarget.dataset.id)}`);
  if (action === "switch-tab") navigate(`yarn/${encodeURIComponent(uiState.yarnId)}/${actionTarget.dataset.tab}`);
  if (action === "adjust-skeins") changeSkeins(Number(actionTarget.dataset.delta));
  if (action === "remove-rest") removeRestSkein(actionTarget.dataset.id);
  if (action === "delete-yarn") deleteYarn(actionTarget.dataset.id);
  if (action === "export-data") exportData();
  if (action === "clear-data") clearStash();
}

function handleViewSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.id === "yarnForm") {
    event.preventDefault();
    saveYarnFromForm(form);
  }

  if (form.id === "restForm") {
    event.preventDefault();
    addRestSkein(form);
  }
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

  if (event.target.id === "photoScan") {
    const file = event.target.files[0];
    if (file) handlePhotoScan(file);
    event.target.value = "";
  }
}

function navigate(route) {
  if (!route) return;
  const nextHash = `#${route}`;
  if (window.location.hash === nextHash) {
    renderRoute();
    return;
  }
  window.location.hash = route;
}

function replaceHash(route) {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${route}`);
  renderRoute();
}

function renderRoute() {
  const route = parseRoute();
  uiState.page = route.page;
  uiState.yarnId = route.yarnId || null;
  uiState.tab = route.tab || "stock";

  updateNav();

  if (route.page === "dashboard") renderDashboard();
  if (route.page === "stash") renderStash();
  if (route.page === "add") renderYarnForm();
  if (route.page === "edit") renderYarnForm(findYarn(route.yarnId));
  if (route.page === "yarn") renderYarn(route.yarnId, route.tab);
  if (route.page === "stats") renderStats();
  if (route.page === "settings") renderSettings();
}

function parseRoute() {
  const rawHash = window.location.hash.replace(/^#\/?/, "");
  const [rawPage, rawYarnId, rawTab] = rawHash.split("/");
  const page = decodeRoutePart(rawPage) || "dashboard";
  const yarnId = decodeRoutePart(rawYarnId);
  const tab = decodeRoutePart(rawTab);
  const allowedTabs = new Set(["stock", "history", "details"]);

  if (page === "yarn" && yarnId) {
    return {
      page: "yarn",
      yarnId,
      tab: allowedTabs.has(tab) ? tab : "stock"
    };
  }

  if (page === "edit" && yarnId) return { page: "edit", yarnId };
  if (["dashboard", "stash", "add", "stats", "settings"].includes(page)) return { page };
  return { page: "dashboard" };
}

function setHeader(title, subtitle) {
  elements.title.textContent = title;
  elements.subtitle.textContent = subtitle;
  document.title = `${title} · StashDash`;
}

function decodeRoutePart(value = "") {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return "";
  }
}

function updateNav() {
  const activePage = uiState.page === "yarn" ? "stash" : uiState.page === "edit" ? "add" : uiState.page;
  elements.nav.querySelectorAll("button[data-page]").forEach((button) => {
    const isActive = button.dataset.page === activePage;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

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
            <div>
              <p class="eyebrow">Planung</p>
              <h2>Kleinste Bestände</h2>
            </div>
          </div>
          ${renderLowStockList()}
        </article>

        <article class="card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Aktivität</p>
              <h2>Letzte Bewegungen</h2>
            </div>
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
        <input id="stashSearch" type="search" value="${escapeAttribute(uiState.search)}" placeholder="Hersteller, Farbe, Faser, Lagerort" autocomplete="off" />
      </label>

      <label class="select-field" for="stashSort">
        <span>Sortieren</span>
        <select id="stashSort">
          <option value="updated" ${uiState.sort === "updated" ? "selected" : ""}>Zuletzt geändert</option>
          <option value="name" ${uiState.sort === "name" ? "selected" : ""}>Name A-Z</option>
          <option value="weight" ${uiState.sort === "weight" ? "selected" : ""}>Gewicht</option>
          <option value="manufacturer" ${uiState.sort === "manufacturer" ? "selected" : ""}>Hersteller</option>
        </select>
      </label>
    </section>

    <div class="section-heading stash-heading">
      <div>
        <p class="eyebrow">Inventar</p>
        <h2>Garne</h2>
      </div>
      <span id="stashCount" class="pill"></span>
    </div>

    <section id="stashResults" class="stash-grid" aria-live="polite"></section>
  `;

  renderStashResults();
}

function renderStashResults() {
  const container = document.getElementById("stashResults");
  const count = document.getElementById("stashCount");
  if (!container || !count) return;

  const filteredYarns = getFilteredYarns();
  count.textContent = `${formatNumber(filteredYarns.length)} von ${formatNumber(state.yarns.length)}`;

  if (state.yarns.length === 0) {
    container.className = "stash-grid single-column";
    container.innerHTML = renderEmptyState("Noch keine Garne", "Starte mit Hersteller, Farbe und Knäuelmenge. Danach kannst du Reste und Bewegungen pflegen.", "Neues Garn", "add");
    return;
  }

  if (filteredYarns.length === 0) {
    container.className = "stash-grid single-column";
    container.innerHTML = renderEmptyState("Keine Treffer", "Passe Suche oder Sortierung an, um deinen Bestand zu finden.");
    return;
  }

  container.className = "stash-grid";
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
    manufacturer: "",
    name: "",
    color: { name: "", number: "", hex: "#c9a797" },
    fullSkeins: 1,
    weightPerSkein: 50,
    lengthPerSkein: 0,
    needleSize: "",
    fiber: "",
    location: "",
    notes: ""
  };

  if (isEdit) {
    setHeader("Garn bearbeiten", formatYarnTitle(yarn));
  } else {
    setHeader(pageMeta.add.title, pageMeta.add.subtitle);
  }

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
          <i data-lucide="scan-line" style="width:13px;height:13px" aria-hidden="true"></i>
          Aus Foto befüllen
        </div>
        <p class="photo-section-hint">Knäuel-Label fotografieren – Text und Farbton werden automatisch erkannt</p>
        <div class="photo-row">
          <label class="secondary-button" style="cursor:pointer">
            <i data-lucide="camera" style="width:14px;height:14px;flex-shrink:0" aria-hidden="true"></i>
            Foto auswählen
            <input type="file" accept="image/*" id="photoScan" class="visually-hidden">
          </label>
          <span id="ocrStatus" class="ocr-status" role="status" aria-live="polite"></span>
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
          <span>Faser</span>
          <input name="fiber" value="${escapeAttribute(draft.fiber)}" placeholder="z. B. 100% Wolle" autocomplete="off" />
        </label>

        <label>
          <span>Lagerort</span>
          <input name="location" value="${escapeAttribute(draft.location)}" placeholder="z. B. Box 2" autocomplete="off" />
        </label>
      </div>

      <label class="full-width">
        <span>Notizen</span>
        <textarea name="notes" rows="4" placeholder="Projektideen, Partienummern oder Pflegehinweise">${escapeHtml(draft.notes)}</textarea>
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
        <button class="danger-button" type="button" data-action="delete-yarn" data-id="${escapeAttribute(yarn.id)}">Löschen</button>
      </div>
    </article>

    <article class="card">
      <div class="tabs" role="tablist" aria-label="Garndetails">
        ${renderTabButton("stock", "Bestand", tab)}
        ${renderTabButton("history", "Historie", tab)}
        ${renderTabButton("details", "Details", tab)}
      </div>
      <div class="tab-panel">
        ${renderYarnTab(yarn, tab)}
      </div>
    </article>
  `;
}

function renderYarnTab(yarn, tab) {
  if (tab === "history") {
    const yarnHistory = state.history.filter((entry) => entry.yarnId === yarn.id);
    return renderHistoryList(yarnHistory, "Für dieses Garn gibt es noch keine Bewegungen.");
  }

  if (tab === "details") {
    return `
      <dl class="detail-grid">
        ${renderDetail("Hersteller", yarn.manufacturer || "-")}
        ${renderDetail("Name", yarn.name || "-")}
        ${renderDetail("Farbe", formatColorLabel(yarn))}
        ${renderDetail("Faser", yarn.fiber || "-")}
        ${renderDetail("Nadelstärke", yarn.needleSize || "-")}
        ${renderDetail("Lagerort", yarn.location || "-")}
        ${renderDetail("Gewicht/Knäuel", `${formatNumber(yarn.weightPerSkein)} g`)}
        ${renderDetail("Meter/Knäuel", formatMeters(yarn.lengthPerSkein))}
        ${renderDetail("Angelegt", formatDate(yarn.createdAt))}
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
  return `
    <button type="button" role="tab" data-action="switch-tab" data-tab="${tab}" class="${isActive ? "is-active" : ""}" aria-selected="${isActive}">
      ${label}
    </button>
  `;
}

function renderStats() {
  setHeader(pageMeta.stats.title, pageMeta.stats.subtitle);
  const stats = getInventoryStats();

  if (stats.yarnCount === 0) {
    elements.view.innerHTML = renderEmptyState("Noch keine Statistik", "Sobald du Garne anlegst, erscheinen hier Gewicht, Lauflänge und Verteilungen.", "Neues Garn", "add");
    return;
  }

  elements.view.innerHTML = `
    <section class="metrics-grid" aria-label="Statistikübersicht">
      ${renderMetric("Gesamtgewicht", formatWeight(stats.totalWeight))}
      ${renderMetric("Lauflänge", formatMeters(stats.totalMeters))}
      ${renderMetric("Reste", formatNumber(stats.restCount), "mit insgesamt", formatWeight(stats.restWeight))}
      ${renderMetric("Durchschnitt", formatWeight(stats.totalWeight / stats.yarnCount), "pro Garn")}
    </section>
  `;
}

function renderSettings() {
  setHeader(pageMeta.settings.title, pageMeta.settings.subtitle);
  const dataSize = new Blob([JSON.stringify(state)]).size;

  elements.view.innerHTML = `
    <section class="settings-grid">
      <article class="card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Backup</p>
            <h2>Daten sichern</h2>
          </div>
        </div>
        <p class="muted">Exportiere deinen Stash als JSON-Datei oder importiere ein Backup. Beim Import wird der aktuelle lokale Bestand ersetzt.</p>
        <div class="button-row">
          <button class="primary-button" type="button" data-action="export-data">JSON exportieren</button>
          <label class="secondary-button file-button" for="importFile">JSON importieren</label>
          <input id="importFile" class="visually-hidden" type="file" accept="application/json,.json" />
        </div>
      </article>

      <article class="card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Speicher</p>
            <h2>Lokale Daten</h2>
          </div>
        </div>
        <dl class="detail-grid compact">
          ${renderDetail("Speicherschlüssel", getStorageKey())}
          ${renderDetail("Version", String(state.version || 1))}
          ${renderDetail("Garne", formatNumber(state.yarns.length))}
          ${renderDetail("Historie", formatNumber(state.history.length))}
          ${renderDetail("Größe", `${formatNumber(dataSize)} Bytes`)}
        </dl>
      </article>

      <article class="card danger-zone">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Zurücksetzen</p>
            <h2>Gefahrenzone</h2>
          </div>
        </div>
        <p class="muted">Löscht nur die Daten in diesem Browser. Ein vorheriger Export ist empfohlen.</p>
        <button class="danger-button" type="button" data-action="clear-data">Alle lokalen Daten löschen</button>
      </article>
    </section>
  `;
}

function saveYarnFromForm(form) {
  const formData = new FormData(form);
  const id = form.dataset.id;
  const existing = id ? findYarn(id) : null;
  const now = new Date().toISOString();
  const manufacturer = cleanFormText(formData.get("manufacturer"));
  const name = cleanFormText(formData.get("name"));

  if (!manufacturer && !name) {
    showToast("Bitte Hersteller oder Garnnamen eintragen.");
    form.querySelector("input[name='manufacturer']").focus();
    return;
  }

  const yarn = {
    id: existing?.id || createId("yarn"),
    manufacturer,
    name,
    color: {
      name: cleanFormText(formData.get("colorName")),
      number: cleanFormText(formData.get("colorNumber")),
      hex: safeHex(formData.get("colorHex"))
    },
    fullSkeins: parseFormNumber(formData.get("fullSkeins"), 0, true),
    weightPerSkein: Math.max(parseFormNumber(formData.get("weightPerSkein"), 50), 1),
    lengthPerSkein: parseFormNumber(formData.get("lengthPerSkein"), 0),
    restSkeins: existing?.restSkeins || [],
    needleSize: cleanFormText(formData.get("needleSize")),
    fiber: cleanFormText(formData.get("fiber")),
    location: cleanFormText(formData.get("location")),
    notes: cleanFormText(formData.get("notes"), 1500),
    createdAt: existing?.createdAt || now,
    updatedAt: now
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
  const weight = parseFormNumber(formData.get("weight"), 0);
  if (weight <= 0) {
    showToast("Bitte ein Restgewicht größer als 0 eintragen.");
    return;
  }

  yarn.restSkeins.push({
    id: createId("rest"),
    weight,
    note: cleanFormText(formData.get("note"), 240)
  });
  yarn.updatedAt = new Date().toISOString();
  addHistory(yarn.id, "REST_ADD", weight, "Rest gespeichert");

  if (!persistState()) return;

  showToast("Rest gespeichert.");
  renderYarn(yarn.id, "stock");
}

function changeSkeins(delta) {
  const yarn = findYarn(uiState.yarnId);
  if (!yarn || !Number.isFinite(delta)) return;

  const nextValue = Math.max(0, yarn.fullSkeins + delta);
  const actualDelta = nextValue - yarn.fullSkeins;
  if (actualDelta === 0) return;

  yarn.fullSkeins = nextValue;
  yarn.updatedAt = new Date().toISOString();
  addHistory(
    yarn.id,
    actualDelta > 0 ? "ADD" : "REMOVE",
    actualDelta * yarn.weightPerSkein,
    actualDelta > 0 ? "Knäuel hinzugefügt" : "Knäuel entnommen"
  );

  if (!persistState()) return;

  renderYarn(yarn.id, "stock");
}

function removeRestSkein(restId) {
  const yarn = findYarn(uiState.yarnId);
  if (!yarn) return;

  const rest = yarn.restSkeins.find((item) => item.id === restId);
  if (!rest) return;

  yarn.restSkeins = yarn.restSkeins.filter((item) => item.id !== restId);
  yarn.updatedAt = new Date().toISOString();
  addHistory(yarn.id, "REST_REMOVE", -rest.weight, "Rest entfernt");

  if (!persistState()) return;

  showToast("Rest entfernt.");
  renderYarn(yarn.id, "stock");
}

function deleteYarn(yarnId) {
  const yarn = findYarn(yarnId);
  if (!yarn) return;

  const confirmed = window.confirm(`"${formatYarnTitle(yarn)}" wirklich löschen? Diese Aktion entfernt auch die Historie dieses Garns.`);
  if (!confirmed) return;

  state.yarns = state.yarns.filter((item) => item.id !== yarnId);
  state.history = state.history.filter((entry) => entry.yarnId !== yarnId);

  if (!persistState()) return;

  showToast("Garn gelöscht.");
  navigate("stash");
}

function exportData() {
  const blob = new Blob([JSON.stringify(normalizeData(state), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
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
      const confirmed = window.confirm("Dieses Backup importieren und den aktuellen lokalen Stash ersetzen?");
      if (!confirmed) return;

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

function clearStash() {
  const confirmed = window.confirm("Alle lokal gespeicherten Garne und Bewegungen löschen?");
  if (!confirmed) return;

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
  try {
    state = saveData(state);
    return true;
  } catch (error) {
    console.error(error);
    showToast("Speichern fehlgeschlagen. Browser-Speicher prüfen.");
    return false;
  }
}

function addHistory(yarnId, type, deltaWeight, description) {
  state.history.unshift({
    id: createId("history"),
    yarnId,
    type,
    deltaWeight,
    description,
    timestamp: new Date().toISOString()
  });

  state.history = state.history.slice(0, 300);
}

function getFilteredYarns() {
  const query = uiState.search.trim().toLowerCase();
  let yarns = [...state.yarns];

  if (query) {
    yarns = yarns.filter((yarn) => [
      yarn.manufacturer,
      yarn.name,
      yarn.color.name,
      yarn.color.number,
      yarn.fiber,
      yarn.location,
      yarn.notes
    ].join(" ").toLowerCase().includes(query));
  }

  yarns.sort((a, b) => {
    if (uiState.sort === "name") return formatYarnTitle(a).localeCompare(formatYarnTitle(b), "de");
    if (uiState.sort === "weight") return getYarnWeight(b) - getYarnWeight(a);
    if (uiState.sort === "manufacturer") return (a.manufacturer || "").localeCompare(b.manufacturer || "", "de");
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return yarns;
}

function getInventoryStats() {
  const manufacturers = new Set(state.yarns.map((yarn) => yarn.manufacturer).filter(Boolean));
  const fullSkeins = state.yarns.reduce((sum, yarn) => sum + yarn.fullSkeins, 0);
  const restWeight = state.yarns.reduce((sum, yarn) => sum + getRestWeight(yarn), 0);

  return {
    yarnCount: state.yarns.length,
    manufacturerCount: manufacturers.size,
    fullSkeins,
    restCount: state.yarns.reduce((sum, yarn) => sum + yarn.restSkeins.length, 0),
    restWeight,
    totalWeight: state.yarns.reduce((sum, yarn) => sum + getYarnWeight(yarn), 0),
    totalMeters: state.yarns.reduce((sum, yarn) => sum + getYarnMeters(yarn), 0)
  };
}

function aggregateBy(field) {
  const groups = new Map();

  state.yarns.forEach((yarn) => {
    const label = yarn[field] || "Nicht erfasst";
    const existing = groups.get(label) || { label, weight: 0, count: 0 };
    existing.weight += getYarnWeight(yarn);
    existing.count += 1;
    groups.set(label, existing);
  });

  return [...groups.values()].sort((a, b) => b.weight - a.weight);
}

function getYarnWeight(yarn) {
  return yarn.fullSkeins * yarn.weightPerSkein + getRestWeight(yarn);
}

function getYarnMeters(yarn) {
  if (!yarn.weightPerSkein || !yarn.lengthPerSkein) return 0;
  return yarn.fullSkeins * yarn.lengthPerSkein + (getRestWeight(yarn) / yarn.weightPerSkein) * yarn.lengthPerSkein;
}

function getRestWeight(yarn) {
  return yarn.restSkeins.reduce((sum, rest) => sum + rest.weight, 0);
}

function findYarn(id) {
  return state.yarns.find((yarn) => yarn.id === id);
}

function renderYarnCard(yarn) {
  return `
    <button class="stash-card" type="button" data-action="open-yarn" data-id="${escapeAttribute(yarn.id)}" style="--swatch: ${safeHex(yarn.color.hex)}">
      <span class="swatch" aria-hidden="true"></span>
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

function renderMetric(label, value, detail) {
  return `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function renderLowStockList() {
  const yarns = [...state.yarns]
    .filter((yarn) => getYarnWeight(yarn) > 0)
    .sort((a, b) => getYarnWeight(a) - getYarnWeight(b))
    .slice(0, 5);

  if (yarns.length === 0) return `<p class="muted">Keine Bestände mit Gewicht erfasst.</p>`;

  return `
    <div class="list-stack">
      ${yarns.map((yarn) => `
        <button class="list-row" type="button" data-action="open-yarn" data-id="${escapeAttribute(yarn.id)}">
          <span>
            <strong>${escapeHtml(formatYarnTitle(yarn))}</strong>
            <small>${escapeHtml(formatColorLabel(yarn))}</small>
          </span>
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
        <div>
          <p class="eyebrow">Reste</p>
          <h3>${formatNumber(yarn.restSkeins.length)} Einträge</h3>
        </div>
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
  const max = Math.max(...rows.map((row) => row.weight), 1);

  return `
    <div class="bar-list">
      ${rows.slice(0, 8).map((row) => `
        <div class="bar-row">
          <div class="bar-label">
            <strong>${escapeHtml(row.label)}</strong>
            <small>${formatNumber(row.count)} Garn${row.count === 1 ? "" : "e"}</small>
          </div>
          <div class="bar-track" aria-hidden="true">
            <span style="width: ${Math.max((row.weight / max) * 100, 3)}%"></span>
          </div>
          <span class="pill">${formatWeight(row.weight)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDetail(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
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

function formatYarnTitle(yarn) {
  return [yarn.manufacturer, yarn.name].filter(Boolean).join(" ") || "Unbenanntes Garn";
}

function formatColorLabel(yarn) {
  const label = [yarn.color.name, yarn.color.number].filter(Boolean).join(" · ");
  return label || "Farbe nicht erfasst";
}

function formatWeight(value) {
  if (!Number.isFinite(value)) return "0 g";
  if (Math.abs(value) >= 1000) return `${decimalFormat.format(value / 1000)} kg`;
  return `${decimalFormat.format(value)} g`;
}

function formatSignedWeight(value) {
  if (!value) return "0 g";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatWeight(value)}`;
}

function formatMeters(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 m";
  if (value >= 1000) return `${decimalFormat.format(value / 1000)} km`;
  return `${numberFormat.format(value)} m`;
}

function formatNumber(value) {
  return numberFormat.format(Number.isFinite(value) ? value : 0);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateFormat.format(date);
}

function historyLabel(type) {
  const labels = {
    CREATE: "Angelegt",
    ADD: "Hinzugefügt",
    REMOVE: "Entnommen",
    REST_ADD: "Rest gespeichert",
    REST_REMOVE: "Rest entfernt",
    EDIT: "Bearbeitet",
    NOTE: "Notiz"
  };

  return labels[type] || type;
}

function parseFormNumber(value, fallback = 0, integer = false) {
  const number = Number(String(value).replace(",", "."));
  const parsed = Number.isFinite(number) ? Math.max(number, 0) : fallback;
  return integer ? Math.round(parsed) : parsed;
}

function cleanFormText(value, maxLength = 280) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeHex(value) {
  const color = String(value ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : "#c9a797";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 3200);
}

// ---- Foto-Erkennung: OCR + Farbton ----

async function handlePhotoScan(file) {
  const statusEl = document.getElementById("ocrStatus");
  if (!statusEl) return;

  statusEl.className = "ocr-status";
  statusEl.textContent = "Bild wird geladen…";

  try {
    const [colorHex, ocrText] = await Promise.all([
      detectDominantColor(file),
      runOCR(file, (pct) => {
        if (document.getElementById("ocrStatus")) {
          statusEl.textContent = `Texterkennung … ${pct} %`;
        }
      })
    ]);

    const form = document.getElementById("yarnForm");
    if (!form) return;

    const extracted = extractYarnDataFromText(ocrText);
    let filled = 0;

    const fieldMap = {
      manufacturer: "manufacturer",
      name:         "name",
      colorNumber:  "colorNumber",
      needleSize:   "needleSize",
      fiber:        "fiber"
    };

    for (const [key, fieldName] of Object.entries(fieldMap)) {
      if (!extracted[key]) continue;
      const input = form.querySelector(`[name="${fieldName}"]`);
      if (input && !input.value.trim()) {
        input.value = extracted[key];
        filled++;
      }
    }

    if (extracted.weightPerSkein) {
      const inp = form.querySelector("[name='weightPerSkein']");
      if (inp && !inp.value.trim()) { inp.value = extracted.weightPerSkein; filled++; }
    }
    if (extracted.lengthPerSkein) {
      const inp = form.querySelector("[name='lengthPerSkein']");
      if (inp && !inp.value.trim()) { inp.value = extracted.lengthPerSkein; filled++; }
    }

    if (colorHex) {
      const colorInput = form.querySelector("[name='colorHex']");
      if (colorInput) { colorInput.value = colorHex; filled++; }
    }

    if (!document.getElementById("ocrStatus")) return;

    if (filled > 0) {
      statusEl.className = "ocr-status success";
      statusEl.textContent = `${filled} Feld${filled === 1 ? "" : "er"} bef\xFCllt`;
    } else {
      statusEl.className = "ocr-status";
      statusEl.textContent = "Keine Informationen erkannt";
    }
  } catch (err) {
    console.error(err);
    const el = document.getElementById("ocrStatus");
    if (el) {
      el.className = "ocr-status error";
      el.textContent = "Erkennung fehlgeschlagen";
    }
  }
}

async function runOCR(imageFile, onProgress) {
  if (typeof Tesseract === "undefined") {
    throw new Error("Tesseract nicht geladen");
  }
  const { data: { text } } = await Tesseract.recognize(imageFile, "eng+deu", {
    logger(m) {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress(Math.round(m.progress * 100));
      }
    }
  });
  return text;
}

function detectDominantColor(imageFile) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);
    img.onload = () => {
      const maxPx = 140;
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const counts = {};

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 200) continue;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max > 0 ? (max - min) / max : 0;
        const brightness = max / 255;
        if (brightness > 0.92 || brightness < 0.06 || saturation < 0.07) continue;
        const rq = Math.round(r / 24) * 24;
        const gq = Math.round(g / 24) * 24;
        const bq = Math.round(b / 24) * 24;
        const key = `${rq},${gq},${bq}`;
        counts[key] = (counts[key] || 0) + 1;
      }

      let bestKey = null, bestCount = 0;
      for (const [k, n] of Object.entries(counts)) {
        if (n > bestCount) { bestCount = n; bestKey = k; }
      }

      if (!bestKey) { resolve(null); return; }
      const [r, g, b] = bestKey.split(",").map(Number);
      resolve("#" + [r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join(""));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function extractYarnDataFromText(rawText) {
  const text = rawText.replace(/\r/g, "").trim();
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 1);
  const result = {};

  // Gewicht: "50 g", "100g", "50 Gramm"
  const wMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*g(?:ramm)?\b/i);
  if (wMatch) result.weightPerSkein = parseFloat(wMatch[1].replace(",", "."));

  // Lauflänge: "200 m", "400m", "200 Meter" – nicht "3,5 mm"
  const lMatch = text.match(/\b(\d{2,}(?:[.,]\d+)?)\s*m(?:eter)?\b(?!\s*m)/i);
  if (lMatch) result.lengthPerSkein = parseFloat(lMatch[1].replace(",", "."));

  // Nadelstärke: "3,5 mm", "4-5 mm", "Nadelstärke 3,5"
  const nMatch =
    text.match(/(?:nadel(?:st[äa]rke|gr[öo]sse?)?|needle)[^\d]*(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*(?:mm)?/i) ||
    text.match(/\b(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*mm\b/i);
  if (nMatch) {
    const raw = nMatch[1].replace(",", ".").trim();
    result.needleSize = raw + " mm";
  }

  // Faser: "100% Wolle", "80% Merino / 20% Polyamid"
  const fMatch = text.match(/\d+\s*%\s*[\wÀ-ɏ-]+(?:\s*[\/+]\s*\d+\s*%\s*[\wÀ-ɏ-]+)*/i);
  if (fMatch) result.fiber = fMatch[0].trim();

  // Farbnummer: "Farb-Nr. 1234", "Color No. A123", freistehende 4-5-stellige Zahl
  const cnMatch =
    text.match(/(?:farb(?:nummer|nr\.?|no\.?)|colou?r(?:\s*no\.?|\s*nr\.?)?)[:\s#]*([A-Z]?\d{3,6}[A-Z]?)/i) ||
    text.match(/(?:^|\s)([A-Z]?\d{4,5}[A-Z]?)(?:\s|$)/m);
  if (cnMatch) result.colorNumber = cnMatch[1].trim();

  // Hersteller + Garnname aus den ersten sinnvollen Zeilen
  const specRe = /\d+\s*%|\d+\s*g\b|\d+\s*m\b|\d+\s*mm\b|nadel|needle|www\.|©|®|made in/i;
  const textLines = lines.filter((l) => !specRe.test(l) && l.length > 2 && l.length < 60);
  if (textLines[0]) result.manufacturer = textLines[0];
  if (textLines[1]) result.name = textLines[1];

  return result;
}
