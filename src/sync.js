// Módulo de sincronización: intenta usar Firebase Realtime Database si existe
// Si no hay configuración disponible, fallback a localStorage.
const BASE_URL = import.meta.env.BASE_URL || '/'
const FIREBASE_CONFIG_PATH = `${BASE_URL}firebase-config.json`
const DATA_KEY = 'snt_data'
const BACKUPS_KEY = 'snt_data_backups'
const MAX_BACKUPS = 15

function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    empresas: Array.isArray(raw.empresas) ? raw.empresas : [],
    vehiculos: Array.isArray(raw.vehiculos) ? raw.vehiculos : [],
    rutas: Array.isArray(raw.rutas) ? raw.rutas : []
  }
}

function dataScore(d) {
  if (!d) return 0
  return (d.empresas?.length || 0) + (d.vehiculos?.length || 0) + (d.rutas?.length || 0)
}

function loadBackups() {
  try {
    const raw = localStorage.getItem(BACKUPS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

function saveBackup(data) {
  try {
    const normalized = normalizeData(data)
    if (!normalized) return
    const backups = loadBackups()
    backups.unshift({ ts: Date.now(), data: normalized })
    const trimmed = backups.slice(0, MAX_BACKUPS)
    localStorage.setItem(BACKUPS_KEY, JSON.stringify(trimmed))
  } catch (e) {
    // ignore backup errors
  }
}

async function fetchFirebaseConfig() {
  try {
    const r = await fetch(FIREBASE_CONFIG_PATH, { cache: 'no-store' })
    if (!r.ok) return null
    const cfg = await r.json()
    if (!cfg || Object.keys(cfg).length === 0) return null
    return cfg
  } catch (e) {
    return null
  }
}

let firebaseApp = null
let firebaseDb = null
let initialized = false

async function initFirebase() {
  if (initialized) return (firebaseDb ? { app: firebaseApp, db: firebaseDb } : null)
  initialized = true
  const cfg = await fetchFirebaseConfig()
  if (!cfg) return null
  try {
    const { initializeApp } = await import('firebase/app')
    const { getDatabase } = await import('firebase/database')
    firebaseApp = initializeApp(cfg)
    firebaseDb = getDatabase(firebaseApp)
    return { app: firebaseApp, db: firebaseDb }
  } catch (e) {
    console.warn('Firebase init failed', e)
    return null
  }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (!raw) return null
    return normalizeData(JSON.parse(raw))
  } catch (e) {
    return null
  }
}

function saveLocal(obj) {
  try {
    const normalized = normalizeData(obj)
    if (!normalized) return
    const current = loadLocal()
    if (current && JSON.stringify(current) !== JSON.stringify(normalized)) {
      saveBackup(current)
    }
    localStorage.setItem(DATA_KEY, JSON.stringify(normalized))
  } catch(e) {}
}

export function restoreLatestBackup() {
  const backups = loadBackups()
  if (!backups.length) return null
  const latest = normalizeData(backups[0].data)
  if (!latest) return null
  saveLocal(latest)
  return latest
}

export async function loadData() {
  // 1) local cache first (never overwrite user edits with static data)
  const local = loadLocal()

  // 2) optional remote (Firebase)
  let remote = null
  try {
    const fb = await initFirebase()
    if (fb && fb.db) {
      const { ref, get } = await import('firebase/database')
      const snap = await get(ref(fb.db, '/snt_data'))
      if (snap && snap.exists()) remote = normalizeData(snap.val())
    }
  } catch (e) {
    console.warn('firebase read failed', e)
  }

  // if both exist, keep the richest dataset
  if (local && remote) {
    const chosen = dataScore(remote) > dataScore(local) ? remote : local
    saveLocal(chosen)
    return chosen
  }
  if (remote) {
    saveLocal(remote)
    return remote
  }
  if (local) return local

  // 3) static seed only as last fallback
  try {
    const r = await fetch(`${BASE_URL}data.json`)
    if (r.ok) {
      const json = normalizeData(await r.json())
      return json
    }
  } catch (e) {}

  return null
}

export async function saveData(obj) {
  const normalized = normalizeData(obj)
  if (!normalized) return false
  // always persist locally
  saveLocal(normalized)
  // try remote
  try {
    const fb = await initFirebase()
    if (fb && fb.db) {
      const { ref, set } = await import('firebase/database')
      await set(ref(fb.db, '/snt_data'), normalized)
      return true
    }
  } catch (e) {
    console.warn('firebase write failed', e)
  }
  return false
}

export async function isRemoteAvailable() {
  try {
    const fb = await initFirebase()
    return !!fb
  } catch (e) { return false }
}
