const STORAGE_KEY = "yarnstash_v1";

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);

  const initial = {
    yarns: [],
    history: []
  };

  saveData(initial);
  return initial;
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
