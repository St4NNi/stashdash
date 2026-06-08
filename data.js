"use strict";

const STORAGE_KEY = "yarnstash_v1";
const DATA_VERSION = 2;

function createId(prefix = "id") {
  const randomId = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}_${randomId}`;
}

function createEmptyData() {
  return {
    version: DATA_VERSION,
    yarns: [],
    history: []
  };
}

function getStorageKey() {
  return STORAGE_KEY;
}

function loadData() {
  let raw = null;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Local storage is unavailable. Data will only live in memory.", error);
    return createEmptyData();
  }

  if (!raw) {
    const initial = createEmptyData();
    try {
      saveData(initial);
    } catch (error) {
      console.warn("Initial data could not be persisted.", error);
    }
    return initial;
  }

  try {
    const normalized = normalizeData(JSON.parse(raw));
    try {
      saveData(normalized);
    } catch (storageError) {
      console.warn("Normalized stash data could not be written back.", storageError);
    }
    return normalized;
  } catch (error) {
    console.warn("Stored stash data was invalid and has been reset.", error);
    try {
      localStorage.setItem(`${STORAGE_KEY}_invalid_${Date.now()}`, raw);
      localStorage.removeItem(STORAGE_KEY);
    } catch (storageError) {
      console.warn("Invalid stash backup could not be written.", storageError);
    }

    const fallback = createEmptyData();
    try {
      saveData(fallback);
    } catch (storageError) {
      console.warn("Fallback data could not be persisted.", storageError);
    }
    return fallback;
  }
}

function saveData(data) {
  const normalized = normalizeData(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function resetData() {
  return saveData(createEmptyData());
}

function normalizeData(data) {
  const source = data && typeof data === "object" ? data : {};

  return {
    version: DATA_VERSION,
    yarns: Array.isArray(source.yarns) ? source.yarns.map(normalizeYarn) : [],
    history: Array.isArray(source.history)
      ? source.history
        .map(normalizeHistory)
        .filter(Boolean)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      : []
  };
}

function normalizeYarn(yarn) {
  const source = yarn && typeof yarn === "object" ? yarn : {};
  const createdAt = normalizeDate(source.createdAt) || new Date().toISOString();

  return {
    id: cleanText(source.id) || createId("yarn"),
    manufacturer: cleanText(source.manufacturer),
    name: cleanText(source.name),
    color: {
      name: cleanText(source.color?.name ?? source.colorName),
      number: cleanText(source.color?.number ?? source.colorNumber),
      hex: normalizeHex(source.color?.hex ?? source.colorHex)
    },
    fullSkeins: clampNumber(source.fullSkeins, 0, 9999, true),
    weightPerSkein: clampNumber(source.weightPerSkein, 1, 10000, false, 50),
    lengthPerSkein: clampNumber(source.lengthPerSkein, 0, 100000, false, 0),
    restSkeins: Array.isArray(source.restSkeins) ? source.restSkeins.map(normalizeRestSkein).filter(Boolean) : [],
    needleSize: cleanText(source.needleSize),
    fiber: cleanText(source.fiber),
    location: cleanText(source.location),
    notes: cleanText(source.notes, 1500),
    createdAt,
    updatedAt: normalizeDate(source.updatedAt) || createdAt
  };
}

function normalizeRestSkein(rest) {
  const source = rest && typeof rest === "object" ? rest : {};
  const weight = clampNumber(source.weight, 0, 10000, false, 0);

  if (weight <= 0) return null;

  return {
    id: cleanText(source.id) || createId("rest"),
    weight,
    note: cleanText(source.note, 240)
  };
}

function normalizeHistory(history) {
  const source = history && typeof history === "object" ? history : {};
  const yarnId = cleanText(source.yarnId);

  if (!yarnId) return null;

  return {
    id: cleanText(source.id) || createId("history"),
    yarnId,
    type: cleanText(source.type) || "NOTE",
    deltaWeight: finiteNumber(source.deltaWeight, 0),
    description: cleanText(source.description, 500),
    timestamp: normalizeDate(source.timestamp) || new Date().toISOString()
  };
}

function cleanText(value, maxLength = 280) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max, integer = false, fallback = min) {
  const number = finiteNumber(value, fallback);
  const clamped = Math.min(Math.max(number, min), max);
  return integer ? Math.round(clamped) : clamped;
}

function normalizeHex(value) {
  const color = cleanText(value).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : "#c9a797";
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
