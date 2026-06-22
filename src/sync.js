// Módulo de sincronización: intenta usar Firebase Realtime Database si existe
// Si no hay configuración disponible, fallback a localStorage.
const FIREBASE_CONFIG_PATH = '/firebase-config.json'

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
    const raw = localStorage.getItem('snt_data')
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function saveLocal(obj) {
  try { localStorage.setItem('snt_data', JSON.stringify(obj)) } catch(e) {}
}

export async function loadData() {
  // prefer public data.json if present (static file)
  try {
    const r = await fetch('/data.json')
    if (r.ok) {
      const json = await r.json()
      // save to local as well
      try { localStorage.setItem('snt_data', JSON.stringify(json)) } catch (e) {}
      return json
    }
  } catch (e) {}

  // try firebase
  try {
    const fb = await initFirebase()
    if (fb && fb.db) {
      const { ref, get } = await import('firebase/database')
      const snap = await get(ref(fb.db, '/snt_data'))
      if (snap && snap.exists()) return snap.val()
    }
  } catch (e) {
    console.warn('firebase read failed', e)
  }

  // fallback local
  const local = loadLocal()
  if (local) return local
  return null
}

export async function saveData(obj) {
  // always persist locally
  saveLocal(obj)
  // try remote
  try {
    const fb = await initFirebase()
    if (fb && fb.db) {
      const { ref, set } = await import('firebase/database')
      await set(ref(fb.db, '/snt_data'), obj)
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
