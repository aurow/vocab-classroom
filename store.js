import { computeReview, isDue, firstLetter, todayStr } from './srs.js';

const DB_NAME = 'vocab-classroom';
const DB_VERSION = 1;
const STORE = 'vocab';
const META = 'meta';
const BUNDLE_URL = './data/vocab-bundle.json';

let _db = null;
let _cache = null; // Map<id, record>

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) { return _db.transaction(store, mode).objectStore(store); }

function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadBundleIfNeeded() {
  const loaded = await reqP(tx(META, 'readonly').get('bundleLoaded'));
  if (loaded && loaded.value) return;
  const res = await fetch(BUNDLE_URL);
  const bundle = await res.json();
  const storeTx = _db.transaction(STORE, 'readwrite');
  const objStore = storeTx.objectStore(STORE);
  for (const it of bundle.items) {
    objStore.put({ ...it, interval: 0, next_review_date: null, proficiency: 'normal' });
  }
  await new Promise((resolve, reject) => {
    storeTx.oncomplete = resolve;
    storeTx.onerror = () => reject(storeTx.error);
  });
  await reqP(_db.transaction(META, 'readwrite').objectStore(META)
    .put({ key: 'bundleLoaded', value: true, version: bundle.version }));
}

async function buildCache() {
  const all = await reqP(tx(STORE, 'readonly').getAll());
  _cache = new Map(all.map((r) => [r.id, r]));
}

export async function init() {
  _db = await openDB();
  await loadBundleIfNeeded();
  await buildCache();
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch (_) { /* best effort */ }
  }
  if (!(await getMeta('firstUseAt'))) await setMeta('firstUseAt', todayStr());
}

function card(r) { return { id: r.id, word: r.word, meaning: r.meaning, source: r.source }; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function all() { return [..._cache.values()]; }

async function getMeta(key) {
  const row = await reqP(tx(META, 'readonly').get(key));
  return row ? row.value : undefined;
}
async function setMeta(key, value) {
  await reqP(tx(META, 'readwrite').put({ key, value }));
}

export async function listSources() {
  return [...new Set(all().map((r) => r.source))];
}

export async function search(query, source) {
  const q = (query || '').trim().toLowerCase();
  let rows = all();
  if (source) rows = rows.filter((r) => r.source === source);
  if (q) rows = rows.filter((r) => (r.word || '').toLowerCase().includes(q));
  return rows.slice(0, 50).map(card);
}

export async function getById(id) {
  const r = _cache.get(id);
  return r ? { ...card(r), interval: r.interval, next_review_date: r.next_review_date, proficiency: r.proficiency } : null;
}

function matchLetter(r, letter) {
  return !letter || firstLetter(r.word) === letter.toUpperCase();
}

export async function getDue({ source, letter, proficiency } = {}) {
  const today = todayStr();
  let rows = all().filter((r) => isDue(r.next_review_date, today));
  if (source) rows = rows.filter((r) => r.source === source);
  if (letter) rows = rows.filter((r) => matchLetter(r, letter));
  if (proficiency) rows = rows.filter((r) => r.proficiency === proficiency);
  return shuffle(rows).map(card);
}

export async function alphabetStats(source, letter) {
  const rows = all().filter((r) => r.source === source && matchLetter(r, letter));
  const c = { total: rows.length, mastered: 0, normal: 0, unfamiliar: 0 };
  for (const r of rows) c[r.proficiency] += 1;
  return c;
}

export async function alphabetPractice({ source, letter, proficiency, order = 'alphabetical' }) {
  let rows = all().filter((r) => r.source === source && matchLetter(r, letter));
  if (proficiency) rows = rows.filter((r) => r.proficiency === proficiency);
  if (order === 'random') rows = shuffle(rows.slice());
  else rows = rows.slice().sort((a, b) => (a.word || '').toLowerCase().localeCompare((b.word || '').toLowerCase()) || a.id - b.id);
  return rows.map(card);
}

export async function unfamiliarSources() {
  const counts = new Map();
  for (const r of all()) if (r.proficiency === 'unfamiliar') counts.set(r.source, (counts.get(r.source) || 0) + 1);
  return [...counts.entries()].map(([source, count]) => ({ source, count }));
}

export async function randomUnfamiliar(source) {
  let rows = all().filter((r) => r.proficiency === 'unfamiliar');
  if (source) rows = rows.filter((r) => r.source === source);
  if (!rows.length) return null;
  return card(rows[Math.floor(Math.random() * rows.length)]);
}

export async function review(id, rating) {
  const r = _cache.get(id);
  if (!r) return null;
  const change = computeReview(r.interval || 0, rating, todayStr());
  const updated = { ...r, ...change };
  _cache.set(id, updated);
  try {
    await reqP(tx(STORE, 'readwrite').put(updated));
  } catch (e) {
    _cache.set(id, r);
    throw e;
  }
  return { id, interval: updated.interval, next_review_date: updated.next_review_date, proficiency: updated.proficiency };
}

export async function exportData() {
  const items = all();
  const payload = { version: 1, exportedAt: todayStr(), items };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export async function markBackedUp() {
  await setMeta('lastBackupAt', todayStr());
}

export async function backupReminder() {
  const ref = (await getMeta('lastBackupAt')) || (await getMeta('firstUseAt'));
  if (!ref) return { show: false, days: 0 };
  const days = Math.floor((Date.parse(todayStr()) - Date.parse(ref)) / 86400000);
  return { show: days >= 7, days };
}

export async function importData(jsonText) {
  const data = JSON.parse(jsonText);
  if (!data || !Array.isArray(data.items)) throw new Error('invalid backup file');
  const store = _db.transaction(STORE, 'readwrite').objectStore(STORE);
  for (const it of data.items) store.put(it);
  await new Promise((res, rej) => { store.transaction.oncomplete = res; store.transaction.onerror = () => rej(store.transaction.error); });
  await buildCache();
  return { count: data.items.length };
}
