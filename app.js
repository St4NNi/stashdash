"use strict";

let state = loadData();

const uiState = { page:"dashboard", yarnId:null, tab:"stock", search:"", sort:"manufacturer", sortDir:"asc", chartRange:"all" };

const pageMeta = {
  dashboard: { title:"Dashboard",      subtitle:"Bestand im Überblick." },
  stash:     { title:"Stash",          subtitle:"Suchen und verwalten." },
  add:       { title:"Neues Garn",     subtitle:"Garndaten erfassen." },
  stats:     { title:"Statistiken",    subtitle:"Bestand und Verlauf." },
  settings:  { title:"Einstellungen",  subtitle:"Backup und Speicher." }
};

const elements = {};
const numFmt  = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const decFmt  = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle:"medium", timeStyle:"short" });
let toastTimer = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  elements.title    = document.getElementById("title");
  elements.subtitle = document.getElementById("subtitle");
  elements.view     = document.getElementById("view");
  elements.nav      = document.querySelector("[data-nav]");
  elements.quickAdd = document.getElementById("quickAdd");
  elements.toast    = document.getElementById("toast");
  elements.mainNav  = document.getElementById("main-nav");

  elements.nav.addEventListener("click", handleNavClick);
  elements.quickAdd.addEventListener("click", () => navigate("add"));
  elements.view.addEventListener("click",  handleViewClick);
  elements.view.addEventListener("submit", handleViewSubmit);
  elements.view.addEventListener("input",  handleViewInput);
  elements.view.addEventListener("change", handleViewChange);
  window.addEventListener("hashchange", renderRoute);

  if (window.visualViewport) {
    const vp = window.visualViewport;
    const pinNav = () => {
      const nav = elements.mainNav;
      if (!nav) return;
      const ty = Math.max(0, window.innerHeight - vp.height - vp.offsetTop);
      nav.style.left      = vp.offsetLeft + "px";
      nav.style.width     = vp.width + "px";
      nav.style.right     = "auto";
      nav.style.transform = ty ? `translateY(${-ty}px)` : "";
    };
    vp.addEventListener("resize", pinNav);
    vp.addEventListener("scroll", pinNav);
  }

  if (!window.location.hash) { replaceHash("dashboard"); return; }
  renderRoute();
}

function icons() { if (window.lucide) lucide.createIcons(); }

// ── Event handlers ─────────────────────────────────────────────────────────

function handleNavClick(e) {
  const btn = e.target.closest("button[data-page]");
  if (btn) navigate(btn.dataset.page);
}

function handleViewClick(e) {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const a = t.dataset.action;
  if (a === "open-yarn")      navigate(`yarn/${enc(t.dataset.id)}/stock`);
  if (a === "navigate-route") navigate(t.dataset.route);
  if (a === "back-stash")     navigate("stash");
  if (a === "edit-yarn")      navigate(`edit/${enc(t.dataset.id)}`);
  if (a === "switch-tab")     navigate(`yarn/${enc(uiState.yarnId)}/${t.dataset.tab}`);
  if (a === "adjust-skeins")  changeSkeins(Number(t.dataset.delta));
  if (a === "remove-rest")    removeRestSkein(t.dataset.id);
  if (a === "delete-yarn")    deleteYarn(t.dataset.id);
  if (a === "export-data")    exportData();
  if (a === "clear-data")     clearStash();
  if (a === "add-fiber")       addFiberRow();
  if (a === "remove-fiber")    t.closest(".fiber-row")?.remove();
  if (a === "add-rest-row")    addRestFormRow();
  if (a === "remove-rest-row") t.closest(".rest-init-row")?.remove();
  if (a === "toggle-sort-dir") { uiState.sortDir=uiState.sortDir==="asc"?"desc":"asc"; renderStash(); }
  if (a === "set-chart-range") { uiState.chartRange=t.dataset.range; renderStats(); }
  if (a === "field-inc") {
    const inp = document.querySelector(`[name="${t.dataset.target}"]`);
    if (inp) { const s=parseFloat(inp.step)||1, mx=inp.max?parseFloat(inp.max):Infinity; inp.value=Math.min(mx,parseFloat(inp.value||0)+s); }
  }
  if (a === "field-dec") {
    const inp = document.querySelector(`[name="${t.dataset.target}"]`);
    if (inp) { const s=parseFloat(inp.step)||1, mn=parseFloat(inp.min)||0; inp.value=Math.max(mn,parseFloat(inp.value||0)-s); }
  }
}

function handleViewSubmit(e) {
  const f = e.target;
  if (!(f instanceof HTMLFormElement)) return;
  if (f.id === "yarnForm") { e.preventDefault(); saveYarnFromForm(f); }
  if (f.id === "restForm") { e.preventDefault(); addRestSkein(f); }
}

function handleViewInput(e) {
  if (e.target.id !== "stashSearch") return;
  uiState.search = e.target.value;
  renderStashResults();
}

function handleViewChange(e) {
  const id = e.target.id;
  if (id === "stashSort")     { uiState.sort = e.target.value; renderStashResults(); }
  if (id === "importFile")    { importData(e.target.files[0]); e.target.value=""; }
  if (id === "csvImportFile") {
    const file = e.target.files[0]; if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx")||name.endsWith(".xls")) importExcel(file);
    else importCSV(file);
    e.target.value = "";
  }
  if (id === "photoScan") { const f=e.target.files[0]; if (f) handlePhotoScan(f); e.target.value=""; }
}

// ── Routing ────────────────────────────────────────────────────────────────

function navigate(route) {
  if (!route) return;
  if (window.location.hash === `#${route}`) { renderRoute(); return; }
  window.location.hash = route;
}

function replaceHash(route) {
  window.history.replaceState(null, "", `${location.pathname}${location.search}#${route}`);
  renderRoute();
}

function renderRoute() {
  if (elements.view) elements.view.scrollTop = 0;
  const r = parseRoute();
  uiState.page=r.page; uiState.yarnId=r.yarnId||null; uiState.tab=r.tab||"stock";
  updateNav();
  if (r.page==="dashboard") renderDashboard();
  if (r.page==="stash")     renderStash();
  if (r.page==="add")       renderYarnForm();
  if (r.page==="edit")      renderYarnForm(findYarn(r.yarnId));
  if (r.page==="yarn")      renderYarn(r.yarnId, r.tab);
  if (r.page==="stats")     renderStats();
  if (r.page==="settings")  renderSettings();
}

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/,"");
  const [p,y,t] = hash.split("/");
  const page=dec(p)||"dashboard", yarnId=dec(y), tab=dec(t);
  const tabs=new Set(["stock","history","details"]);
  if (page==="yarn"&&yarnId) return {page:"yarn",yarnId,tab:tabs.has(tab)?tab:"stock"};
  if (page==="edit"&&yarnId) return {page:"edit",yarnId};
  if (["dashboard","stash","add","stats","settings"].includes(page)) return {page};
  return {page:"dashboard"};
}

function enc(v="") { return encodeURIComponent(v); }
function dec(v="") { try { return decodeURIComponent(v); } catch { return ""; } }

function setHeader(title, subtitle) {
  elements.title.textContent=title; elements.subtitle.textContent=subtitle;
  document.title=`${title} · StashDash`;
}

function updateNav() {
  const active = uiState.page==="yarn"?"stash":uiState.page==="edit"?"add":uiState.page;
  elements.quickAdd.classList.toggle("hidden", active==="add");
  elements.nav.querySelectorAll("button[data-page]").forEach((btn) => {
    const on = btn.dataset.page===active;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-current", on?"page":"false");
  });
}

// ── Pages ──────────────────────────────────────────────────────────────────

function renderDashboard() {
  setHeader(pageMeta.dashboard.title, pageMeta.dashboard.subtitle);
  const s = getInventoryStats();
  elements.view.innerHTML = `
    <div class="grid grid-cols-2 gap-3 mb-4">
      ${metricCard("Gesamtgewicht",     formatWeight(s.totalWeight))}
      ${metricCard("Gesamtlauflänge",   formatMeters(s.totalMeters))}
      ${metricCard("Garnsorten",        fmtN(s.yarnCount))}
      ${metricCard("50g Knäuel Gesamt", fmtN(Math.round(s.totalWeight/50)))}
    </div>
    ${s.yarnCount===0 ? emptyState("Dein Stash ist leer","Lege dein erstes Garn an.","Neues Garn","add") : `
      <div class="crd">
        <h2 class="text-base font-semibold text-fore mb-2">Letzte Bewegungen</h2>
        ${renderHistoryList(state.history.slice(0,5), "Noch keine Bewegungen.", true)}
      </div>`}`;
  icons();
}

function metricCard(label, value) {
  return `<article class="rounded-xl border border-accent/10 bg-surface p-4 min-w-0">
    <p class="text-[11px] font-semibold uppercase tracking-wider text-fore-muted whitespace-nowrap overflow-hidden text-ellipsis">${escH(label)}</p>
    <p class="text-3xl font-bold text-fore leading-none mt-2">${escH(value)}</p>
  </article>`;
}

function renderStash() {
  setHeader(pageMeta.stash.title, pageMeta.stash.subtitle);
  elements.view.innerHTML = `
    <div class="flex gap-3 flex-wrap items-end mb-4">
      <label class="flex-1 min-w-36">
        <span class="fld-lbl">Suchen</span>
        <input id="stashSearch" type="search" class="fld bg-surface" value="${escA(uiState.search)}" placeholder="Hersteller, Farbe, Faser …" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" />
      </label>
      <div class="flex gap-2 items-end min-w-36">
        <label class="flex-1">
          <span class="fld-lbl">Sortieren</span>
          <select id="stashSort" class="fld-sel bg-surface">
            <option value="manufacturer" ${uiState.sort==="manufacturer"?"selected":""}>Hersteller</option>
            <option value="name"         ${uiState.sort==="name"        ?"selected":""}>Name</option>
            <option value="weight"       ${uiState.sort==="weight"      ?"selected":""}>Gewicht</option>
            <option value="meters"       ${uiState.sort==="meters"      ?"selected":""}>Lauflänge</option>
            <option value="updated"      ${uiState.sort==="updated"     ?"selected":""}>Zuletzt geändert</option>
          </select>
        </label>
        <button type="button" class="btn-icon flex-shrink-0" data-action="toggle-sort-dir" title="${uiState.sortDir==="asc"?"Aufsteigend":"Absteigend"}">${uiState.sortDir==="asc"?"↑":"↓"}</button>
      </div>
    </div>
    <div class="flex items-center justify-between mb-2 px-1">
      <p class="eyebrow">Inventar</p>
      <span id="stashCount" class="pill-sm"></span>
    </div>
    <div id="stashResults" aria-live="polite"></div>`;
  renderStashResults();
  icons();
}

function renderStashResults() {
  const container = document.getElementById("stashResults");
  const countEl   = document.getElementById("stashCount");
  if (!container||!countEl) return;
  const yarns = getFilteredYarns();
  countEl.textContent = `${fmtN(yarns.length)} / ${fmtN(state.yarns.length)}`;
  if (!state.yarns.length) { container.innerHTML=emptyState("Noch keine Garne","Starte mit deinem ersten Garn.","Neues Garn","add"); return; }
  if (!yarns.length)       { container.innerHTML=emptyState("Keine Treffer","Passe Suche oder Sortierung an."); return; }
  container.innerHTML = yarns.map(renderYarnCard).join("");
  icons();
}

function renderYarnForm(yarn=null) {
  if (uiState.page==="edit"&&!yarn) {
    setHeader("Nicht gefunden","");
    elements.view.innerHTML=emptyState("Garn nicht gefunden","Der Eintrag wurde gelöscht.","Zurück","stash");
    icons();
    return;
  }
  const isEdit = Boolean(yarn);
  const d = yarn||{manufacturer:"",name:"",color:{name:"",number:"",hex:"#c9a797"},fullSkeins:1,weightPerSkein:50,lengthPerSkein:0,needleSize:"",gauge:"",fibers:[],fiber:"",notes:""};
  if (isEdit) setHeader("Bearbeiten", formatYarnTitle(yarn));
  else        setHeader(pageMeta.add.title, pageMeta.add.subtitle);
  const df = Array.isArray(d.fibers)&&d.fibers.length>0 ? d.fibers : parseFiberString(d.fiber||"");

  elements.view.innerHTML = `
    <form id="yarnForm" class="crd" data-id="${escA(d.id||"")}">
      <div class="mb-5 p-3.5 rounded-lg border border-dashed border-accent/30 bg-background">
        <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent mb-1">
          <i data-lucide="pipette" style="width:11px;height:11px" aria-hidden="true"></i>
          Farbton aus Foto
        </div>
        <p class="text-xs text-fore-subtle mb-3">Foto des Garns auswählen – der Farbton wird automatisch erkannt</p>
        <div class="flex items-center gap-3 flex-wrap">
          <label class="btn-s text-xs py-1.5 px-3 cursor-pointer">
            <i data-lucide="camera" style="width:13px;height:13px;flex-shrink:0" aria-hidden="true"></i>
            Foto auswählen
            <input type="file" accept="image/*" id="photoScan" class="sr-only">
          </label>
          <span id="colorStatus" class="text-xs text-fore-muted" role="status" aria-live="polite"></span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-4">
        <label><span class="fld-lbl">Hersteller</span><input class="fld" name="manufacturer" value="${escA(d.manufacturer)}" placeholder="z. B. Sandnes Garn" autocomplete="organization" /></label>
        <label><span class="fld-lbl">Name</span><input class="fld" name="name" value="${escA(d.name)}" placeholder="z. B. Peer Gynt" autocomplete="off" /></label>
        <label><span class="fld-lbl">Farbname</span><input class="fld" name="colorName" value="${escA(d.color.name)}" placeholder="z. B. Natur" autocomplete="off" /></label>
        <label><span class="fld-lbl">Farbnummer</span><input class="fld" name="colorNumber" value="${escA(d.color.number)}" placeholder="z. B. 1012" autocomplete="off" /></label>
        <label><span class="fld-lbl">Farbton</span><input class="fld-color" name="colorHex" type="color" value="${safeHex(d.color.hex)}" /></label>
        <div><span class="fld-lbl">Volle Knäuel</span>${stepperInp("fullSkeins",d.fullSkeins,0,"",1)}</div>
        <div><span class="fld-lbl">Gramm pro Knäuel</span>${stepperInp("weightPerSkein",d.weightPerSkein,1,"",1)}</div>
        <div><span class="fld-lbl">Meter pro Knäuel</span>${stepperInp("lengthPerSkein",d.lengthPerSkein,0,"",1)}</div>
        <label><span class="fld-lbl">Nadelstärke</span><input class="fld" name="needleSize" value="${escA(d.needleSize)}" placeholder="z. B. 4 mm" autocomplete="off" /></label>
        <label><span class="fld-lbl">Maschenprobe</span><input class="fld" name="gauge" value="${escA(d.gauge||"")}" placeholder="z. B. 20 M × 28 R" autocomplete="off" /></label>
      </div>

      <div class="mb-4">
        <span class="fld-lbl">Faserzusammensetzung</span>
        <div id="fiberList" class="flex flex-col gap-2 mb-2">${renderFiberRows(df)}</div>
        <button type="button" class="btn-s text-xs py-1.5 px-3" data-action="add-fiber">+ Bestandteil hinzufügen</button>
      </div>

      <label class="block mb-4">
        <span class="fld-lbl">Notizen</span>
        <textarea name="notes" rows="3" class="fld-ta" placeholder="Projektideen, Partienummern oder Pflegehinweise">${escH(d.notes)}</textarea>
      </label>

      ${!isEdit ? `<div class="mb-4">
        <span class="fld-lbl">Anfangs-Reste (optional)</span>
        <div id="restInitList" class="flex flex-col gap-2 mb-2"></div>
        <button type="button" class="btn-s text-xs py-1.5 px-3" data-action="add-rest-row">+ Rest hinzufügen</button>
      </div>` : ""}

      <div class="flex items-center gap-3 flex-wrap">
        <button class="btn-p" type="submit">${isEdit?"Änderungen speichern":"Garn speichern"}</button>
        <button class="btn-s" type="button" data-action="${isEdit?"open-yarn":"back-stash"}" data-id="${escA(d.id||"")}">Abbrechen</button>
      </div>
    </form>`;
  icons();
}

function stepperInp(name, value, min, max, step) {
  const mx = max ? `max="${max}"` : "";
  return `<div class="flex rounded-lg border border-accent/20 overflow-hidden h-9">
    <button type="button" class="stepper-btn" data-action="field-dec" data-target="${name}">−</button>
    <input name="${name}" type="number" min="${min}" ${mx} step="${step}" value="${escA(String(value))}" inputmode="numeric"
      class="stepper-input flex-1 min-w-0 h-9 text-center bg-background border-x border-accent/20 text-sm text-fore focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-dim" />
    <button type="button" class="stepper-btn" data-action="field-inc" data-target="${name}">+</button>
  </div>`;
}

function renderYarn(yarnId, tab="stock") {
  const yarn = findYarn(yarnId);
  if (!yarn) { setHeader("Nicht gefunden",""); elements.view.innerHTML=emptyState("Garn nicht gefunden","Der Eintrag wurde gelöscht.","Zurück","stash"); icons(); return; }
  setHeader("Garndetail", formatYarnTitle(yarn));
  elements.view.innerHTML = `
    <div class="crd mb-3">
      <div class="flex gap-4 items-start">
        <div class="w-14 h-14 rounded-xl flex-shrink-0 border border-white/10" style="background:${safeHex(yarn.color.hex)}"></div>
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-semibold text-fore leading-tight">${escH(formatYarnTitle(yarn))}</h2>
          <p class="text-sm text-fore-muted mt-0.5">${escH(formatColorLabel(yarn))}</p>
          <div class="flex flex-wrap gap-1.5 mt-2">
            <span class="badge">${formatWeight(getYarnWeight(yarn))}</span>
            <span class="badge">${formatMeters(getYarnMeters(yarn))}</span>
            <span class="badge">${fmtN(yarn.fullSkeins)} Knäuel</span>
          </div>
        </div>
      </div>
      <div class="flex gap-2 mt-4">
        <button class="btn-icon" type="button" data-action="back-stash" aria-label="Zurück" title="Zurück"><i data-lucide="arrow-left" style="width:16px;height:16px" aria-hidden="true"></i></button>
        <button class="btn-s flex-1 justify-center" type="button" data-action="edit-yarn" data-id="${escA(yarn.id)}">Bearbeiten</button>
        <button class="btn-icon !border-red-900/40 !text-red-400 hover:!bg-red-950/30" type="button" data-action="delete-yarn" data-id="${escA(yarn.id)}" aria-label="Löschen" title="Löschen"><i data-lucide="trash-2" style="width:16px;height:16px" aria-hidden="true"></i></button>
      </div>
    </div>

    <div class="crd">
      <div class="flex -mx-5 px-5 mb-4 border-b border-accent/10" role="tablist">
        ${tabBtn("stock","Bestand",tab)} ${tabBtn("history","Historie",tab)} ${tabBtn("details","Details",tab)}
      </div>
      ${renderYarnTab(yarn, tab)}
    </div>`;
  icons();
}

function tabBtn(t, label, active) {
  return `<button type="button" role="tab" data-action="switch-tab" data-tab="${t}" class="tab-btn${t===active?" is-active":""}" aria-selected="${t===active}">${label}</button>`;
}

function renderYarnTab(yarn, tab) {
  if (tab==="history") return renderHistoryList(state.history.filter((e)=>e.yarnId===yarn.id), "Noch keine Bewegungen für dieses Garn.");
  if (tab==="details") {
    const fd = formatFibersString(yarn.fibers)||yarn.fiber||"-";
    return `<dl class="grid grid-cols-2 gap-3">
      ${det("Hersteller",yarn.manufacturer||"-")} ${det("Name",yarn.name||"-")}
      ${det("Farbe",formatColorLabel(yarn))} ${det("Faser",fd)}
      ${det("Nadelstärke",yarn.needleSize||"-")} ${det("Maschenprobe",yarn.gauge||"-")}
      ${det("g / Knäuel",`${fmtN(yarn.weightPerSkein)} g`)} ${det("m / Knäuel",formatMeters(yarn.lengthPerSkein))}
      ${det("Angelegt",formatDate(yarn.createdAt))} ${det("Aktualisiert",formatDate(yarn.updatedAt))}
    </dl>
    ${yarn.notes?`<div class="mt-4 p-3 rounded-lg bg-background border border-accent/10">
      <p class="text-xs text-fore-subtle uppercase tracking-wider mb-1">Notizen</p>
      <p class="text-sm text-fore-muted whitespace-pre-wrap">${escH(yarn.notes)}</p></div>`:""}`;
  }
  return `
    <div class="flex gap-3 mb-4">
      <div class="flex-1 flex flex-col items-center gap-1 p-4 rounded-lg bg-background border border-accent/10 text-center">
        <span class="text-xs text-fore-muted">Volle Knäuel</span>
        <strong class="text-3xl font-bold text-fore leading-none">${fmtN(yarn.fullSkeins)}</strong>
        <div class="flex gap-2 mt-1">
          <button class="btn-s px-3 py-1 text-xs" type="button" data-action="adjust-skeins" data-delta="-1">−1</button>
          <button class="btn-s px-3 py-1 text-xs" type="button" data-action="adjust-skeins" data-delta="1">+1</button>
        </div>
      </div>
      <div class="flex-1 flex flex-col items-center gap-1 p-4 rounded-lg bg-background border border-accent/10 text-center">
        <span class="text-xs text-fore-muted">Gesamtbestand</span>
        <strong class="text-2xl font-bold text-fore leading-none">${formatWeight(getYarnWeight(yarn))}</strong>
        <small class="text-xs text-fore-muted">${formatMeters(getYarnMeters(yarn))}</small>
      </div>
    </div>
    <form id="restForm" class="flex gap-2 flex-wrap items-end mb-4" data-yarn-id="${escA(yarn.id)}">
      <label class="flex-1 min-w-24"><span class="fld-lbl">Rest in Gramm</span><input name="weight" type="number" min="1" step="0.1" inputmode="decimal" placeholder="z. B. 18" required class="fld" /></label>
      <label class="flex-1 min-w-24"><span class="fld-lbl">Notiz</span><input name="note" placeholder="optional" autocomplete="off" class="fld" /></label>
      <button class="btn-p" type="submit">Rest speichern</button>
    </form>
    ${renderRestList(yarn)}`;
}

function renderStats() {
  setHeader(pageMeta.stats.title, pageMeta.stats.subtitle);
  const s = getInventoryStats();
  if (!s.yarnCount) { elements.view.innerHTML=emptyState("Noch keine Statistik","Lege Garne an, um Auswertungen zu sehen.","Neues Garn","add"); icons(); return; }
  const range = uiState.chartRange || "all";
  const pts = buildSkeinTimeline(range);
  elements.view.innerHTML = `
    <div class="grid grid-cols-2 gap-3 mb-4">
      ${metricCard("Gesamtgewicht",   formatWeight(s.totalWeight))}
      ${metricCard("Gesamtlauflänge", formatMeters(s.totalMeters))}
    </div>
    <div class="crd mb-3">
      <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h2 class="text-base font-semibold text-fore">Knäuelbestand</h2>
        <div class="flex gap-1">
          ${["all","6m","30d"].map((r)=>`<button type="button" class="text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${range===r?"border-accent/40 bg-elevated text-fore font-medium":"border-accent/15 text-fore-muted hover:text-fore"}" data-action="set-chart-range" data-range="${r}">${r==="all"?"Gesamt":r==="6m"?"6 Monate":"30 Tage"}</button>`).join("")}
        </div>
      </div>
      ${renderSkeinChart(pts, range)}
    </div>
    <div class="crd mb-3">
      <h2 class="text-base font-semibold text-fore mb-3">Nach Hersteller</h2>
      ${renderBars(aggregateBy("manufacturer"))}
    </div>
    <div class="crd">
      <h2 class="text-base font-semibold text-fore mb-3">Nach Faserart</h2>
      ${renderBars(aggregateFibers())}
    </div>`;
}

function renderSettings() {
  setHeader(pageMeta.settings.title, pageMeta.settings.subtitle);
  const sz = new Blob([JSON.stringify(state)]).size;
  elements.view.innerHTML = `
    <div class="flex flex-col gap-3">
      <div class="crd">
        <h2 class="text-base font-semibold text-fore mb-2">JSON-Sicherung</h2>
        <p class="text-sm text-fore-muted mb-4">Exportiere deinen Stash oder importiere ein Backup. Beim Import wird der aktuelle Bestand ersetzt.</p>
        <div class="flex gap-2 flex-wrap">
          <button class="btn-p" type="button" data-action="export-data">JSON exportieren</button>
          <label class="btn-s cursor-pointer" for="importFile">JSON importieren</label>
          <input id="importFile" class="sr-only" type="file" accept="application/json,.json" />
        </div>
      </div>

      <div class="crd">
        <h2 class="text-base font-semibold text-fore mb-2">Stash aus Tabelle importieren</h2>
        <p class="text-sm text-fore-muted mb-2">Importiere Garne aus einer CSV- oder Excel-Datei (.xlsx). Bestehende Einträge bleiben erhalten.</p>
        <p class="text-xs text-fore-subtle font-mono mb-4 leading-relaxed">Hersteller · Name · Farbname · Farbnummer · Farbton · Knäuel · Gramm · Meter · Nadelstärke · Maschenprobe · Faser · Notizen</p>
        <label class="btn-s cursor-pointer" for="csvImportFile">CSV / Excel importieren</label>
        <input id="csvImportFile" class="sr-only" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      </div>

      <div class="crd">
        <h2 class="text-base font-semibold text-fore mb-3">Lokale Daten</h2>
        <dl class="grid grid-cols-2 gap-2">
          ${det("Schlüssel",getStorageKey())} ${det("Version",String(state.version||1))}
          ${det("Garne",fmtN(state.yarns.length))} ${det("Historie",fmtN(state.history.length))}
          ${det("Größe",`${fmtN(sz)} Bytes`)}
        </dl>
      </div>

      <div class="crd !border-red-400/25">
        <h2 class="text-base font-semibold text-red-400 mb-2">Gefahrenzone</h2>
        <p class="text-sm text-fore-muted mb-4">Löscht alle lokalen Daten. Vorheriger Export empfohlen.</p>
        <button class="btn-d" type="button" data-action="clear-data">Alle Daten löschen</button>
      </div>
    </div>`;
}

// ── Data mutations ─────────────────────────────────────────────────────────

function saveYarnFromForm(form) {
  const fd=new FormData(form), id=form.dataset.id, existing=id?findYarn(id):null, now=new Date().toISOString();
  const manufacturer=cleanTxt(fd.get("manufacturer")), name=cleanTxt(fd.get("name"));
  if (!manufacturer&&!name) { showToast("Bitte Hersteller oder Name eintragen."); return; }
  const fiberPcts=fd.getAll("fiberPct"), fiberTypes=fd.getAll("fiberType");
  const fibers=fiberPcts.map((p,i)=>({pct:parseNum(p,0,true),type:cleanTxt(fiberTypes[i]||"")})).filter((f)=>f.type&&f.pct>0);
  let restSkeins = existing?.restSkeins || [];
  if (!existing) {
    const rWeights=fd.getAll("initRestWeight"), rNotes=fd.getAll("initRestNote");
    restSkeins=rWeights.map((w,i)=>({id:createId("rest"),weight:parseNum(w,0),note:cleanTxt(rNotes[i]||"",240)})).filter((r)=>r.weight>0);
  }
  const yarn={
    id:existing?.id||createId("yarn"), manufacturer, name,
    color:{name:cleanTxt(fd.get("colorName")),number:cleanTxt(fd.get("colorNumber")),hex:safeHex(fd.get("colorHex"))},
    fullSkeins:parseNum(fd.get("fullSkeins"),0,true), weightPerSkein:Math.max(parseNum(fd.get("weightPerSkein"),50),1),
    lengthPerSkein:parseNum(fd.get("lengthPerSkein"),0), restSkeins,
    needleSize:cleanTxt(fd.get("needleSize")), gauge:cleanTxt(fd.get("gauge")),
    fibers, fiber:formatFibersString(fibers), notes:cleanTxt(fd.get("notes"),1500),
    createdAt:existing?.createdAt||now, updatedAt:now
  };
  if (existing) { Object.assign(existing,yarn); addHistory(yarn.id,"EDIT",0,"Garndaten aktualisiert"); }
  else { state.yarns.unshift(yarn); addHistory(yarn.id,"CREATE",getYarnWeight(yarn),"Garn angelegt"); }
  if (!persist()) return;
  showToast(existing?"Garn aktualisiert.":"Garn gespeichert.");
  navigate(`yarn/${enc(yarn.id)}/stock`);
}

function addRestSkein(form) {
  const yarn=findYarn(form.dataset.yarnId); if (!yarn) return;
  const fd=new FormData(form), weight=parseNum(fd.get("weight"),0);
  if (weight<=0) { showToast("Bitte Restgewicht > 0 eingeben."); return; }
  yarn.restSkeins.push({id:createId("rest"),weight,note:cleanTxt(fd.get("note"),240)});
  yarn.updatedAt=new Date().toISOString();
  addHistory(yarn.id,"REST_ADD",weight,"Rest gespeichert");
  if (!persist()) return;
  showToast("Rest gespeichert."); renderYarn(yarn.id,"stock");
}

function changeSkeins(delta) {
  const yarn=findYarn(uiState.yarnId); if (!yarn||!Number.isFinite(delta)) return;
  const next=Math.max(0,yarn.fullSkeins+delta), actual=next-yarn.fullSkeins;
  if (!actual) return;
  yarn.fullSkeins=next; yarn.updatedAt=new Date().toISOString();
  addHistory(yarn.id,actual>0?"ADD":"REMOVE",actual*yarn.weightPerSkein,actual>0?"Knäuel hinzugefügt":"Knäuel entnommen");
  if (!persist()) return;
  renderYarn(yarn.id,"stock");
}

function removeRestSkein(restId) {
  const yarn=findYarn(uiState.yarnId); if (!yarn) return;
  const rest=yarn.restSkeins.find((r)=>r.id===restId); if (!rest) return;
  yarn.restSkeins=yarn.restSkeins.filter((r)=>r.id!==restId); yarn.updatedAt=new Date().toISOString();
  addHistory(yarn.id,"REST_REMOVE",-rest.weight,"Rest entfernt");
  if (!persist()) return;
  showToast("Rest entfernt."); renderYarn(yarn.id,"stock");
}

function deleteYarn(yarnId) {
  const yarn=findYarn(yarnId); if (!yarn) return;
  if (!confirm(`"${formatYarnTitle(yarn)}" wirklich löschen?`)) return;
  state.yarns=state.yarns.filter((y)=>y.id!==yarnId);
  state.history=state.history.filter((e)=>e.yarnId!==yarnId);
  if (!persist()) return;
  showToast("Garn gelöscht."); navigate("stash");
}

function exportData() {
  const blob=new Blob([JSON.stringify(normalizeData(state),null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=`stashdash-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
  showToast("Backup exportiert.");
}

function importData(file) {
  if (!file) return;
  const r=new FileReader();
  r.onload=()=>{ try { const imp=normalizeData(JSON.parse(String(r.result))); if (!confirm("Backup importieren und lokalen Stash ersetzen?")) return; state=saveData(imp); uiState.search=""; showToast("Backup importiert."); navigate("dashboard"); } catch { showToast("Import fehlgeschlagen."); } };
  r.onerror=()=>showToast("Datei konnte nicht gelesen werden.");
  r.readAsText(file);
}

function importCSV(file) {
  if (!file) return;
  const r=new FileReader();
  r.onload=()=>{ try { processImportRows(parseCSV(String(r.result))); } catch(err) { console.error(err); showToast("CSV-Import fehlgeschlagen."); } };
  r.onerror=()=>showToast("Datei konnte nicht gelesen werden.");
  r.readAsText(file,"utf-8");
}

function importExcel(file) {
  if (!file) { showToast("Excel-Import nicht verfügbar."); return; }
  if (typeof XLSX==="undefined") { showToast("Excel-Bibliothek nicht geladen."); return; }
  const r=new FileReader();
  r.onload=(e)=>{ try { const wb=XLSX.read(e.target.result,{type:"array"}); processImportRows(parseCSV(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]],{blankrows:false}))); } catch(err) { console.error(err); showToast("Excel-Import fehlgeschlagen."); } };
  r.onerror=()=>showToast("Datei konnte nicht gelesen werden.");
  r.readAsArrayBuffer(file);
}

function splitColorField(str) {
  if (!str) return {name:"",number:""};
  str = str.trim();
  // Extract first digit sequence as the color number
  const numMatch = str.match(/\d+/);
  const number = numMatch ? numMatch[0] : "";
  // Remove digits and all non-letter chars (separators, #, /, -, etc.) to get the name
  const name = str.replace(/\d+/g, "").replace(/[^A-Za-zÄÖÜäöüß\s]/g, " ").replace(/\s+/g, " ").trim();
  return {name, number};
}

// Match a column header against aliases, with fallback for slash-combined headers
// e.g. "farbe/farbnummer" has parts ["farbe","farbnummer"] — matches both colorName and colorNumber aliases
function findColIdx(nh, aliases) {
  const exact = aliases.reduce((f,k) => f>=0 ? f : nh.indexOf(k), -1);
  if (exact >= 0) return exact;
  for (let i=0; i<nh.length; i++) {
    const parts = nh[i].split(/\s*\/\s*/);
    if (parts.length > 1 && aliases.some((a) => parts.includes(a))) return i;
  }
  return -1;
}

function processImportRows(rows) {
  if (!rows.length) { showToast("Keine Daten gefunden."); return; }
  const colMap={
    manufacturer:  ["hersteller","manufacturer","marke","brand"],
    name:          ["name","garnname","yarn name","produktname"],
    colorName:     ["farbname","farbe","color name","colour name","color"],
    colorNumber:   ["farbnummer","farb-nr","color number","colour number"],
    colorHex:      ["farbton","hex","hex code","color hex","colour hex"],
    fullSkeins:    ["knäuel","knauel","volle knäuel","skeins","anzahl"],
    weightPerSkein:["gramm","gramm/knäuel","g/knäuel","weight","g per skein","gramm pro knäuel"],
    lengthPerSkein:["meter","meter/knäuel","m/knäuel","length","meters","meter pro knäuel"],
    needleSize:    ["nadelstärke","nadel","needle size","needle"],
    gauge:         ["maschenprobe","gauge","tension"],
    fiber:         ["faser","faserzusammensetzung","fiber","fibre","material"],
    notes:         ["notizen","notiz","notes","note","anmerkungen"],
    restWeight:    ["rest","reste","restgewicht","rest (g)","rest g"]
  };
  const hdr=rows[0], nh=hdr.map((h)=>h.toLowerCase().trim());
  const idx=Object.fromEntries(Object.entries(colMap).map(([k,ks])=>[k,findColIdx(nh,ks)]));
  const get=(row,key)=>idx[key]>=0?(row[idx[key]]||"").trim():"";
  const now=new Date().toISOString(); let added=0;
  for (const row of rows.slice(1)) {
    const mfr=get(row,"manufacturer"), nm=get(row,"name");
    if (!mfr&&!nm) continue;
    let cName=get(row,"colorName"), cNum=get(row,"colorNumber");
    // Same column mapped to both → combined field, always split
    if (idx.colorName>=0 && idx.colorName===idx.colorNumber) {
      const sp=splitColorField(cName); cName=sp.name; cNum=sp.number;
    } else if (cName && !cNum) {
      const sp=splitColorField(cName); if (sp.number) { cName=sp.name; cNum=sp.number; }
    } else if (!cName && cNum) {
      const sp=splitColorField(cNum); if (sp.name) { cName=sp.name; cNum=sp.number; }
    }
    const fibers=parseFiberString(get(row,"fiber"));
    const restW=parseNum(get(row,"restWeight"),0);
    const restSkeins=restW>0?[{id:createId("rest"),weight:restW,note:""}]:[];
    const yarn={
      id:createId("yarn"), manufacturer:mfr, name:nm,
      color:{name:cName, number:cNum, hex:safeHex(get(row,"colorHex")||"#c9a797")},
      fullSkeins:parseNum(get(row,"fullSkeins"),0,true), weightPerSkein:Math.max(parseNum(get(row,"weightPerSkein"),50),1),
      lengthPerSkein:parseNum(get(row,"lengthPerSkein"),0), restSkeins,
      needleSize:get(row,"needleSize"), gauge:get(row,"gauge"),
      fibers, fiber:formatFibersString(fibers)||get(row,"fiber"),
      notes:get(row,"notes").slice(0,1500), createdAt:now, updatedAt:now
    };
    state.yarns.push(yarn);
    addHistory(yarn.id,"CREATE",getYarnWeight(yarn),"Import");
    added++;
  }
  if (!added) { showToast("Keine neuen Garne erkannt."); return; }
  if (!persist()) return;
  showToast(`${added} Garn${added===1?"":"e"} importiert.`); navigate("stash");
}

function parseCSV(text) {
  const lines=text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n");
  const sep=text.includes(";")?";":",";
  return lines.filter((l)=>l.trim()).map((line)=>{
    const cells=[]; let cur="",inQ=false;
    for (let i=0;i<line.length;i++) {
      const ch=line[i];
      if (ch==='"') { if (inQ&&line[i+1]==='"') {cur+='"';i++;} else inQ=!inQ; }
      else if (ch===sep&&!inQ) { cells.push(cur); cur=""; }
      else cur+=ch;
    }
    cells.push(cur); return cells;
  });
}

function clearStash() {
  if (!confirm("Alle lokalen Daten löschen?")) return;
  try { state=resetData(); uiState.search=""; showToast("Stash gelöscht."); navigate("dashboard"); }
  catch { showToast("Löschen fehlgeschlagen."); }
}

function persist() { try { state=saveData(state); return true; } catch { showToast("Speichern fehlgeschlagen."); return false; } }

function addHistory(yarnId,type,deltaWeight,description) {
  state.history.unshift({id:createId("history"),yarnId,type,deltaWeight,description,timestamp:new Date().toISOString()});
  state.history=state.history.slice(0,300);
}

// ── Queries ────────────────────────────────────────────────────────────────

function getFilteredYarns() {
  const q=uiState.search.trim().toLowerCase();
  let yarns=[...state.yarns];
  if (q) yarns=yarns.filter((y)=>[y.manufacturer,y.name,y.color.name,y.color.number,y.fiber,y.needleSize,y.gauge,y.notes].join(" ").toLowerCase().includes(q));
  const dir = uiState.sortDir==="desc" ? -1 : 1;
  yarns.sort((a,b)=>{
    let cmp = 0;
    if      (uiState.sort==="name")    cmp = (a.name||"").localeCompare(b.name||"","de");
    else if (uiState.sort==="weight")  cmp = getYarnWeight(a)-getYarnWeight(b);
    else if (uiState.sort==="meters")  cmp = getYarnMeters(a)-getYarnMeters(b);
    else if (uiState.sort==="updated") cmp = new Date(a.updatedAt)-new Date(b.updatedAt);
    else { cmp=(a.manufacturer||"").localeCompare(b.manufacturer||"","de"); if (!cmp) cmp=(a.name||"").localeCompare(b.name||"","de"); }
    return cmp * dir;
  });
  return yarns;
}

function getInventoryStats() {
  const mfrs=new Set(state.yarns.map((y)=>y.manufacturer).filter(Boolean));
  return {
    yarnCount:state.yarns.length, manufacturerCount:mfrs.size,
    fullSkeins:state.yarns.reduce((s,y)=>s+y.fullSkeins,0),
    restCount:state.yarns.reduce((s,y)=>s+y.restSkeins.length,0),
    restWeight:state.yarns.reduce((s,y)=>s+getRestWeight(y),0),
    totalWeight:state.yarns.reduce((s,y)=>s+getYarnWeight(y),0),
    totalMeters:state.yarns.reduce((s,y)=>s+getYarnMeters(y),0)
  };
}

function aggregateBy(field) {
  const g=new Map();
  state.yarns.forEach((y)=>{ const l=y[field]||"Nicht erfasst",e=g.get(l)||{label:l,weight:0,count:0}; e.weight+=getYarnWeight(y); e.count++; g.set(l,e); });
  return [...g.values()].sort((a,b)=>b.weight-a.weight);
}

function aggregateFibers() {
  const g=new Map();
  state.yarns.forEach((y)=>{
    const fs=Array.isArray(y.fibers)&&y.fibers.length>0?y.fibers:parseFiberString(y.fiber||"");
    if (!fs.length) { const e=g.get("Nicht erfasst")||{label:"Nicht erfasst",weight:0,count:0}; e.weight+=getYarnWeight(y); e.count++; g.set("Nicht erfasst",e); }
    else fs.forEach((f)=>{ const e=g.get(f.type)||{label:f.type,weight:0,count:0}; e.weight+=getYarnWeight(y)*(f.pct/100); e.count++; g.set(f.type,e); });
  });
  return [...g.values()].sort((a,b)=>b.weight-a.weight);
}

function getYarnWeight(y) { return y.fullSkeins*y.weightPerSkein+getRestWeight(y); }
function getYarnMeters(y) { return (!y.weightPerSkein||!y.lengthPerSkein)?0:y.fullSkeins*y.lengthPerSkein+(getRestWeight(y)/y.weightPerSkein)*y.lengthPerSkein; }
function getRestWeight(y) { return y.restSkeins.reduce((s,r)=>s+r.weight,0); }
function findYarn(id)     { return state.yarns.find((y)=>y.id===id); }

// ── Fiber helpers ──────────────────────────────────────────────────────────

function renderFiberRows(fibers) {
  if (!fibers||!fibers.length) return fiberRow("","100");
  return fibers.map((f)=>fiberRow(f.type,String(f.pct))).join("");
}

function fiberRow(type, pct) {
  return `<div class="fiber-row flex items-center gap-2">
    <input type="number" name="fiberPct" min="1" max="100" value="${escA(pct)}" placeholder="%" inputmode="numeric"
      class="h-9 w-16 rounded-lg border border-accent/20 bg-background px-2 text-center text-sm text-fore placeholder:text-fore-subtle focus:outline-none focus:ring-2 focus:ring-accent-dim flex-shrink-0 stepper-input" />
    <span class="text-fore-subtle text-sm flex-shrink-0">%</span>
    <input type="text" name="fiberType" value="${escA(type)}" placeholder="z. B. Schurwolle" autocomplete="off" class="fld flex-1" />
    <button type="button" class="btn-icon flex-shrink-0" data-action="remove-fiber" aria-label="Entfernen">×</button>
  </div>`;
}

function addFiberRow() {
  const list=document.getElementById("fiberList"); if (!list) return;
  const div=document.createElement("div"); div.innerHTML=fiberRow("",""); list.appendChild(div.firstElementChild);
}

function restFormRow() {
  return `<div class="rest-init-row flex items-end gap-2">
    <label class="flex-1"><span class="fld-lbl">Restgewicht (g)</span><input type="number" name="initRestWeight" min="0.1" step="0.1" inputmode="decimal" placeholder="z. B. 18" class="fld" /></label>
    <label class="flex-1"><span class="fld-lbl">Notiz</span><input type="text" name="initRestNote" placeholder="optional" autocomplete="off" class="fld" /></label>
    <button type="button" class="btn-icon flex-shrink-0 self-end" data-action="remove-rest-row" aria-label="Entfernen">×</button>
  </div>`;
}

function addRestFormRow() {
  const list=document.getElementById("restInitList"); if (!list) return;
  const div=document.createElement("div"); div.innerHTML=restFormRow(); list.appendChild(div.firstElementChild);
}

function formatFibersString(fibers) {
  if (!Array.isArray(fibers)||!fibers.length) return "";
  return fibers.map((f)=>`${f.pct}% ${f.type}`).join(" / ");
}

function parseFiberString(str) {
  if (!str||typeof str!=="string") return [];
  return str.split(/\s*[\/+,]\s*/).map((p)=>{ const m=p.match(/^(\d+(?:[.,]\d+)?)\s*%\s*(.+)$/); return m?{pct:parseInt(m[1]),type:m[2].trim()}:null; }).filter(Boolean);
}

// ── Chart ──────────────────────────────────────────────────────────────────

function buildSkeinTimeline(range) {
  range = range || "all";
  const evs=[...state.history].filter((e)=>["CREATE","ADD","REMOVE"].includes(e.type)).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
  const now=new Date(), todayKey=now.toISOString().slice(0,10);
  const currentTotal=state.yarns.reduce((s,y)=>s+y.fullSkeins,0);

  let running=0;
  const dailyMap=new Map();
  for (const ev of evs) {
    const yarn=findYarn(ev.yarnId), wps=yarn?.weightPerSkein||50;
    running=Math.max(0,running+Math.round(ev.deltaWeight/wps));
    dailyMap.set(new Date(ev.timestamp).toISOString().slice(0,10), running);
  }
  dailyMap.set(todayKey, currentTotal);

  const allDays=[...dailyMap.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([dk,s])=>({dateKey:dk,date:new Date(dk+"T12:00:00Z"),skeins:s}));

  if (range==="30d") {
    const cutoff=new Date(now); cutoff.setDate(cutoff.getDate()-30);
    const cutKey=cutoff.toISOString().slice(0,10);
    const before=allDays.filter((p)=>p.dateKey<cutKey);
    const startVal=before.length?before[before.length-1].skeins:0;
    let inRange=allDays.filter((p)=>p.dateKey>=cutKey);
    if (!inRange.length||inRange[0].dateKey!==cutKey) inRange=[{dateKey:cutKey,date:new Date(cutKey+"T12:00:00Z"),skeins:startVal},...inRange];
    if (inRange.length<2) inRange=[{dateKey:"start",date:new Date(inRange[0].date.getTime()-86400000),skeins:0},...inRange];
    return inRange;
  }

  const monthMap=new Map();
  for (const p of allDays) { const mk=p.dateKey.slice(0,7); monthMap.set(mk,p.skeins); }
  let monthPts=[...monthMap.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([mk,s])=>({dateKey:mk,date:new Date(`${mk}-01T12:00:00Z`),skeins:s}));

  if (range==="6m") {
    const cutoff=new Date(now); cutoff.setMonth(cutoff.getMonth()-6);
    const cutKey=`${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,"0")}`;
    const before=monthPts.filter((p)=>p.dateKey<cutKey);
    const startVal=before.length?before[before.length-1].skeins:0;
    monthPts=monthPts.filter((p)=>p.dateKey>=cutKey);
    if (!monthPts.length||monthPts[0].dateKey!==cutKey) monthPts=[{dateKey:cutKey,date:new Date(`${cutKey}-01T12:00:00Z`),skeins:startVal},...monthPts];
  }

  if (monthPts.length===0) return [];
  if (monthPts.length===1) {
    const prev=new Date(monthPts[0].date); prev.setMonth(prev.getMonth()-1);
    const pk=`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,"0")}`;
    monthPts=[{dateKey:pk,date:new Date(`${pk}-01T12:00:00Z`),skeins:0},...monthPts];
  }
  return monthPts;
}

function renderSkeinChart(pts, range) {
  if (!pts||pts.length<2) return `<p class="text-xs text-fore-subtle">Noch zu wenig Verlaufsdaten.</p>`;
  const W=560,H=150,PL=36,PR=8,PT=8,PB=24,cW=W-PL-PR,cH=H-PT-PB;
  const minT=pts[0].date.getTime(),maxT=pts[pts.length-1].date.getTime(),maxV=Math.max(...pts.map((p)=>p.skeins),1),span=maxT-minT||1;
  const toX=(d)=>PL+((d.getTime()-minT)/span)*cW, toY=(v)=>PT+cH-(v/maxV)*cH;
  const lp=pts.map((p,i)=>`${i===0?"M":"L"}${toX(p.date).toFixed(1)},${toY(p.skeins).toFixed(1)}`).join(" ");
  const ap=`${lp} L${toX(pts[pts.length-1].date).toFixed(1)},${(PT+cH).toFixed(1)} L${PL},${(PT+cH).toFixed(1)} Z`;
  const fd=range==="30d"?(d)=>d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}):(d)=>d.toLocaleDateString("de-DE",{month:"short",year:"2-digit"});
  const yL=[0,Math.round(maxV/2),maxV].filter((v,i,a)=>a.indexOf(v)===i);
  const xN=Math.min(4,pts.length), xL=Array.from({length:xN},(_,i)=>pts[Math.round((pts.length-1)*(i/(xN-1)))]);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible" aria-hidden="true">
    ${yL.map((v)=>`<line x1="${PL}" y1="${toY(v).toFixed(1)}" x2="${W-PR}" y2="${toY(v).toFixed(1)}" stroke="rgba(170,201,140,.15)" stroke-width="1"/>`).join("")}
    <path d="${ap}" fill="rgba(170,201,140,.18)"/>
    <path d="${lp}" fill="none" stroke="#aac98c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${toX(pts[0].date).toFixed(1)}" cy="${toY(pts[0].skeins).toFixed(1)}" r="3.5" fill="#6e9672"/>
    <circle cx="${toX(pts[pts.length-1].date).toFixed(1)}" cy="${toY(pts[pts.length-1].skeins).toFixed(1)}" r="3.5" fill="#aac98c"/>
    ${yL.map((v)=>`<text x="${PL-4}" y="${(toY(v)+3).toFixed(1)}" text-anchor="end" font-size="10" fill="#b6ccbd">${v}</text>`).join("")}
    ${xL.map((p,i)=>{ const x=toX(p.date),anch=i===0?"start":i===xN-1?"end":"middle"; return `<text x="${x.toFixed(1)}" y="${H-4}" text-anchor="${anch}" font-size="10" fill="#b6ccbd">${fd(p.date)}</text>`; }).join("")}
    <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+cH}" stroke="rgba(170,201,140,.35)" stroke-width="1"/>
    <line x1="${PL}" y1="${PT+cH}" x2="${W-PR}" y2="${PT+cH}" stroke="rgba(170,201,140,.35)" stroke-width="1"/>
  </svg>`;
}

// ── Render helpers ─────────────────────────────────────────────────────────

function renderYarnCard(yarn) {
  return `<button class="flex items-center gap-3 w-full rounded-xl border border-accent/10 bg-surface p-4 mb-2 text-left cursor-pointer transition-all hover:bg-elevated hover:border-accent/20"
    type="button" data-action="open-yarn" data-id="${escA(yarn.id)}">
    <span class="w-11 h-11 rounded-lg flex-shrink-0 border border-white/10" style="background:${safeHex(yarn.color.hex)}"></span>
    <span class="flex-1 min-w-0">
      <span class="block text-sm font-semibold text-fore truncate">${escH(formatYarnTitle(yarn))}</span>
      <span class="block text-xs text-fore-muted">${escH(formatColorLabel(yarn))}</span>
      <span class="flex flex-wrap gap-1 mt-1.5">
        <span class="badge">${formatWeight(getYarnWeight(yarn))}</span>
        <span class="badge">${formatMeters(getYarnMeters(yarn))}</span>
        ${yarn.restSkeins.length?`<span class="badge">${fmtN(yarn.restSkeins.length)} Rest${yarn.restSkeins.length===1?"":"e"}</span>`:""}
      </span>
    </span>
    <i data-lucide="chevron-right" class="text-fore-subtle flex-shrink-0" style="width:16px;height:16px"></i>
  </button>`;
}

function renderHistoryList(items, empty="Noch keine Bewegungen.", compact=false) {
  if (!items.length) return `<p class="text-sm text-fore-muted">${escH(empty)}</p>`;
  if (compact) return `<div>${items.map((ev)=>{
    const y=findYarn(ev.yarnId);
    return `<div class="flex items-center justify-between gap-2 py-1.5 border-b border-accent/10 last:border-0">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-fore truncate">${escH(histLabel(ev.type))} · ${escH(y?formatYarnTitle(y):"Gelöschtes Garn")}</p>
        <p class="text-[10px] text-fore-subtle">${escH(formatDate(ev.timestamp))}</p>
      </div>
      ${ev.deltaWeight?`<span class="pill-sm flex-shrink-0 ${ev.deltaWeight<0?"!text-red-400":""}">${fmtSignedW(ev.deltaWeight)}</span>`:""}
    </div>`;
  }).join("")}</div>`;
  return `<div>${items.map((ev)=>{
    const y=findYarn(ev.yarnId);
    return `<div class="flex items-start justify-between gap-2 py-2.5 border-b border-accent/10 last:border-0">
      <div>
        <p class="text-sm font-medium text-fore">${escH(histLabel(ev.type))}</p>
        <p class="text-xs text-fore-muted">${escH(y?formatYarnTitle(y):"Gelöschtes Garn")} · ${escH(formatDate(ev.timestamp))}</p>
        ${ev.description?`<p class="text-xs text-fore-subtle">${escH(ev.description)}</p>`:""}
      </div>
      ${ev.deltaWeight?`<span class="pill-sm flex-shrink-0 ${ev.deltaWeight<0?"!text-red-400":""}">${fmtSignedW(ev.deltaWeight)}</span>`:""}
    </div>`;
  }).join("")}</div>`;
}

function renderRestList(yarn) {
  if (!yarn.restSkeins.length) return `<p class="text-sm text-fore-muted">Noch keine Reste.</p>`;
  return `<div>
    <p class="text-xs font-semibold uppercase tracking-wider text-fore-muted mb-2">${fmtN(yarn.restSkeins.length)} Rest${yarn.restSkeins.length===1?"":"e"}</p>
    <div class="flex flex-col gap-2">${yarn.restSkeins.map((r)=>`
      <div class="flex items-center justify-between gap-2 p-3 rounded-lg bg-background border border-accent/10">
        <span class="text-sm font-medium text-fore">${formatWeight(r.weight)}${r.note?`<span class="text-xs text-fore-muted ml-2">${escH(r.note)}</span>`:""}</span>
        <button class="btn-s text-xs py-1 px-2.5" type="button" data-action="remove-rest" data-id="${escA(r.id)}">Entfernen</button>
      </div>`).join("")}</div></div>`;
}

function renderBars(rows) {
  if (!rows.length) return `<p class="text-sm text-fore-muted">Keine Daten.</p>`;
  const max=Math.max(...rows.map((r)=>r.weight),1);
  return `<div class="flex flex-col gap-3">${rows.slice(0,8).map((r)=>`
    <div>
      <div class="flex justify-between items-center mb-1">
        <span class="text-sm font-medium text-fore">${escH(r.label)}</span>
        <div class="flex items-center gap-2">
          <span class="text-xs text-fore-subtle">${fmtN(r.count)} Garn${r.count===1?"":"e"}</span>
          <span class="pill-sm">${formatWeight(r.weight)}</span>
        </div>
      </div>
      <div class="h-1.5 rounded-full bg-background overflow-hidden">
        <div class="h-full rounded-full bg-accent-dim" style="width:${Math.max((r.weight/max)*100,3).toFixed(1)}%"></div>
      </div>
    </div>`).join("")}</div>`;
}

function det(label, value) {
  return `<div><dt class="text-xs text-fore-subtle uppercase tracking-wider">${escH(label)}</dt><dd class="text-sm font-medium text-fore mt-0.5">${escH(value)}</dd></div>`;
}

function emptyState(title, text, actionLabel="", route="") {
  return `<div class="flex flex-col items-center justify-center py-16 text-center gap-3">
    <div class="w-14 h-14 rounded-full bg-surface flex items-center justify-center mb-1">
      <i data-lucide="package-open" class="text-accent" style="width:24px;height:24px" aria-hidden="true"></i>
    </div>
    <h2 class="text-base font-semibold text-fore">${escH(title)}</h2>
    <p class="text-sm text-fore-muted max-w-xs">${escH(text)}</p>
    ${actionLabel&&route?`<button class="btn-p mt-2" type="button" data-action="navigate-route" data-route="${escA(route)}">${escH(actionLabel)}</button>`:""}
  </div>`;
}

// ── Formatters ─────────────────────────────────────────────────────────────

function formatYarnTitle(y) { return [y.manufacturer,y.name].filter(Boolean).join(" ")||"Unbenanntes Garn"; }
function formatColorLabel(y) { return [y.color.name,y.color.number].filter(Boolean).join(" · ")||"Farbe nicht erfasst"; }
function formatWeight(v) { if (!Number.isFinite(v)) return "0 g"; if (Math.abs(v)>=1000) return `${decFmt.format(v/1000)} kg`; return `${decFmt.format(v)} g`; }
function fmtSignedW(v)  { return (v>0?"+":"")+formatWeight(v||0); }
function formatMeters(v) { if (!Number.isFinite(v)||v<=0) return "0 m"; if (v>=1000) return `${decFmt.format(v/1000)} km`; return `${numFmt.format(v)} m`; }
function fmtN(v)         { return numFmt.format(Number.isFinite(v)?v:0); }
function formatDate(v)   { const d=new Date(v); return Number.isNaN(d.getTime())?"-":dateFmt.format(d); }
function histLabel(t)    { return {CREATE:"Angelegt",ADD:"Hinzugefügt",REMOVE:"Entnommen",REST_ADD:"Rest gespeichert",REST_REMOVE:"Rest entfernt",EDIT:"Bearbeitet",NOTE:"Notiz"}[t]||t; }
function parseNum(v,fb=0,int=false) { const n=Number(String(v).replace(",",".")); const p=Number.isFinite(n)?Math.max(n,0):fb; return int?Math.round(p):p; }
function cleanTxt(v,mx=280) { return String(v??"").trim().slice(0,mx); }
function safeHex(v) { const c=String(v??"").trim().toLowerCase(); return /^#[0-9a-f]{6}$/.test(c)?c:"#c9a797"; }
function escH(v) { return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
function escA(v) { return escH(v); }

function showToast(msg) {
  const base="bottom:calc(4rem + env(safe-area-inset-bottom));";
  elements.toast.textContent=msg;
  elements.toast.style.cssText=base+"opacity:1;transform:translateX(-50%) translateY(0)";
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ elements.toast.style.cssText=base+"opacity:0;transform:translateX(-50%) translateY(10px)"; },3200);
}

// ── Color detection ────────────────────────────────────────────────────────

async function handlePhotoScan(file) {
  const el=document.getElementById("colorStatus"); if (!el) return;
  el.textContent="Farbe wird erkannt…"; el.className="text-xs text-fore-muted";
  try {
    const hex=await detectDominantColor(file);
    const form=document.getElementById("yarnForm"); if (!form) return;
    if (hex) { form.querySelector("[name='colorHex']").value=hex; el.textContent="Farbton erkannt"; el.className="text-xs text-accent"; }
    else { el.textContent="Kein Farbton erkannt"; }
  } catch { el.textContent="Erkennung fehlgeschlagen"; el.className="text-xs text-red-400"; }
}

function detectDominantColor(imageFile) {
  return new Promise((resolve)=>{
    const img=new Image(), url=URL.createObjectURL(imageFile);
    img.onload=()=>{
      const scale=Math.min(1,200/Math.max(img.width,img.height));
      const cv=document.createElement("canvas"); cv.width=Math.round(img.width*scale); cv.height=Math.round(img.height*scale);
      cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
      URL.revokeObjectURL(url);
      const {data}=cv.getContext("2d").getImageData(0,0,cv.width,cv.height);
      const W={};
      for (let i=0;i<data.length;i+=4) {
        const [r,g,b,a]=[data[i],data[i+1],data[i+2],data[i+3]];
        if (a<200) continue;
        const mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=mx>0?(mx-mn)/mx:0,bri=mx/255;
        if (bri>0.90||bri<0.05||sat<0.08) continue;
        const k=`${Math.round(r/16)*16},${Math.round(g/16)*16},${Math.round(b/16)*16}`;
        W[k]=(W[k]||0)+sat**1.5;
      }
      let best=null,bestW=0;
      for (const [k,w] of Object.entries(W)) if (w>bestW){bestW=w;best=k;}
      if (!best){resolve(null);return;}
      const [r,g,b]=best.split(",").map(Number);
      resolve("#"+[r,g,b].map((v)=>Math.min(255,v).toString(16).padStart(2,"0")).join(""));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);resolve(null);};
    img.src=url;
  });
}
