let state = loadData();
let currentYarnId = null;

function navigate(page) {
  if (page === "dashboard") renderDashboard();
  if (page === "stash") renderStash();
  if (page === "add") renderAdd();
  if (page === "stats") renderStats();
  if (page === "settings") renderSettings();
}

function colorBadge(c) {
  if (!c) return "";
  return `
    <span>
      <span class="color-box" style="background:${c.hex || '#ccc'}"></span>
      ${c.name || ""} (${c.number || ""})
    </span>
  `;
}

function renderDashboard() {
  title.innerText = "🧶 Dashboard";

  const totalWeight = state.yarns.reduce((s,y)=>{
    const rest = (y.restSkeins||[]).reduce((a,r)=>a+r.weight,0);
    return s + (y.fullSkeins*y.weightPerSkein)+rest;
  },0);

  const totalMeters = state.yarns.reduce((s,y)=>{
    const rest = (y.restSkeins||[]).reduce((a,r)=>a+r.weight,0);
    return s + (y.fullSkeins*y.lengthPerSkein)+((rest/y.weightPerSkein)*y.lengthPerSkein);
  },0);

  view.innerHTML = `
    <div class="card">
      <h2>${(totalWeight/50).toFixed(1)} Lagen (50g)</h2>
      <p>${totalWeight.toFixed(0)} g</p>
      <p>${totalMeters.toFixed(0)} m</p>
      <p>${state.yarns.length} Garne</p>
    </div>
  `;
}

function renderStash() {
  title.innerText = "🧶 Stash";

  view.innerHTML = state.yarns.map(y=>`
    <div class="card" onclick="openYarn('${y.id}')">
      <b>${y.manufacturer || ''} ${y.name || ''}</b><br>
      ${colorBadge(y.color)}<br>
      ${(y.fullSkeins||0)} Knäuel
    </div>
  `).join("");
}

function openYarn(id) {
  currentYarnId = id;
  renderYarn("stock");
}

function renderYarn(tab) {
  const y = state.yarns.find(x=>x.id===currentYarnId);
  if(!y) return;

  title.innerText = y.name || "Garn";

  const rest = (y.restSkeins||[]).reduce((a,r)=>a+r.weight,0);
  const total = (y.fullSkeins*y.weightPerSkein)+rest;

  view.innerHTML = `
    <div class="card">
      <h3>${y.manufacturer || ''} ${y.name || ''}</h3>
      ${colorBadge(y.color)}

      <div class="tabs">
        <button onclick="renderYarn('stock')">Bestand</button>
        <button onclick="renderYarn('history')">Historie</button>
        <button onclick="renderYarn('details')">Details</button>
      </div>

      ${tabContent(y, tab, total)}
    </div>
  `;
}

function tabContent(y, tab, total) {

  if(tab==="stock"){
    return `
      <p>Knäuel: ${y.fullSkeins||0}</p>
      <button onclick="changeSkeins(1)">+</button>
      <button onclick="changeSkeins(-1)">-</button>

      <h4>Reste</h4>
      ${(y.restSkeins||[]).map(r=>`
        <div>${r.weight}g</div>
      `).join("")}

      <button onclick="addRest()">+ Rest</button>

      <p>Gesamt: ${total}g</p>
    `;
  }

  if(tab==="history"){
    return (state.history||[])
      .filter(h=>h.yarnId===y.id)
      .map(h=>`<div>${h.type} (${h.deltaWeight||0}g)</div>`)
      .join("");
  }

  if(tab==="details"){
    return `
      <p>Nadel: ${y.needleSize||""}</p>
      <p>Projekt: ${y.project?.name||"-"}</p>
    `;
  }

  return "";
}

function changeSkeins(delta){
  const y = state.yarns.find(x=>x.id===currentYarnId);
  if(!y) return;

  y.fullSkeins = (y.fullSkeins||0) + delta;
  if(y.fullSkeins<0) y.fullSkeins=0;

  state.history.push({
    id: crypto.randomUUID(),
    yarnId: y.id,
    type: delta>0?"ADD":"REMOVE",
    deltaWeight: delta*(y.weightPerSkein||50),
    timestamp: new Date().toISOString()
  });

  saveData(state);
  renderYarn("stock");
}

function addRest(){
  const y = state.yarns.find(x=>x.id===currentYarnId);
  if(!y) return;

  const w = prompt("Gewicht?");
  if(!w) return;

  y.restSkeins = y.restSkeins||[];
  y.restSkeins.push({id:crypto.randomUUID(),weight:+w});

  saveData(state);
  renderYarn("stock");
}

function renderAdd(){
  title.innerText="➕ Neu";
  view.innerHTML=`<div class="card">OCR kommt später</div>`;
}

function renderStats(){
  title.innerText="📊 Statistiken";
  view.innerHTML=`<div class="card">Charts später</div>`;
}

function renderSettings(){
  title.innerText="⚙️ Settings";

  view.innerHTML=`
    <div class="card">
      <button onclick="exportData()">Backup Export</button>
      <button onclick="importData()">Import</button>
    </div>
  `;
}

function exportData(){
  const blob = new Blob([JSON.stringify(state)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url;
  a.download="stash.json";
  a.click();
}

function importData(){
  const input=document.createElement("input");
  input.type="file";

  input.onchange=e=>{
    const f=e.target.files[0];
    const r=new FileReader();
    r.onload=ev=>{
      state=JSON.parse(ev.target.result);
      saveData(state);
      renderDashboard();
    };
    r.readAsText(f);
  };

  input.click();
}

navigate("dashboard");
