import SAMPLE from './data/sampleData'

// Módulo de sincronización: intenta usar Firebase Realtime Database si existe
// Si no hay configuración disponible, fallback a localStorage.
const BASE_URL = import.meta.env.BASE_URL || '/'
const FIREBASE_CONFIG_PATH = `${BASE_URL}firebase-config.json`
const DATA_KEY = 'snt_data'
const ROUTE_SHEETS_KEY = 'snt_route_sheets_v1'
const BACKUPS_KEY = 'snt_data_backups'
const SYNC_META_KEY = 'snt_sync_meta_v1'
const PENDING_WRITE_KEY = 'snt_pending_write_v1'
const SHEETS_SYNC_META_KEY = 'snt_route_sheets_sync_meta_v1'
const SHEETS_PENDING_WRITE_KEY = 'snt_route_sheets_pending_write_v1'
const DEVICE_ID_KEY = 'snt_device_id_v1'
const MAX_BACKUPS = 15

function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    empresas: Array.isArray(raw.empresas) ? raw.empresas : [],
    vehiculos: Array.isArray(raw.vehiculos) ? raw.vehiculos : [],
    rutas: Array.isArray(raw.rutas) ? raw.rutas : []
  }
}

function normalizeRouteSheets(raw) {
  if (!Array.isArray(raw)) return []
  return raw.filter(item => item && typeof item === 'object')
}

function dataScore(d) {
  if (!d) return 0
  return (d.empresas?.length || 0) + (d.vehiculos?.length || 0) + (d.rutas?.length || 0)
}

function dataSignature(raw) {
  const normalized = normalizeData(raw)
  return normalized ? JSON.stringify(normalized) : ''
}

const SAMPLE_DATA_SIGNATURE = dataSignature(SAMPLE)
const LEGACY_DEMO_COMPANY_IDS = new Set(['EMP-01', 'EMP-02', 'EMP-03'])
const LEGACY_DEMO_VEHICLE_IDS = new Set(['V-001', 'V-002', 'V-003'])
const LEGACY_DEMO_ROUTE_PREFIXES = ['RT-1', 'RT-2', 'RT-3']

function isExactSampleData(raw) {
  return Boolean(SAMPLE_DATA_SIGNATURE) && dataSignature(raw) === SAMPLE_DATA_SIGNATURE
}

function isLegacyDemoData(raw) {
  const normalized = normalizeData(raw)
  if (!normalized) return false
  const companyIds = new Set(normalized.empresas.map(item => item?.ID_Empresa).filter(Boolean))
  const vehicleIds = new Set(normalized.vehiculos.map(item => item?.ID_Vehiculo).filter(Boolean))
  const routeIds = normalized.rutas.map(item => String(item?.ID_Ruta || '')).filter(Boolean)
  const hasLegacyCompanies = [...LEGACY_DEMO_COMPANY_IDS].every(id => companyIds.has(id))
  const hasLegacyVehicles = [...LEGACY_DEMO_VEHICLE_IDS].every(id => vehicleIds.has(id))
  const hasLegacyRoutes = routeIds.length >= 6 && routeIds.every(id => LEGACY_DEMO_ROUTE_PREFIXES.some(prefix => id.startsWith(prefix)))
  return hasLegacyCompanies && hasLegacyVehicles && hasLegacyRoutes
}

function isManualSeedData(raw) {
  const normalized = normalizeData(raw)
  if (!normalized) return false
  if (normalized.empresas.length !== 1 || normalized.vehiculos.length || normalized.rutas.length) return false
  const company = normalized.empresas[0] || {}
  const id = String(company.id || company.ID_Empresa || '').trim().toLowerCase()
  const name = String(company.nombre || company.Nombre_Empresa || '').trim().toLowerCase()
  return id === 'demo' && name === 'demo'
}

function isBlockedSeedData(raw) {
  return isExactSampleData(raw) || isLegacyDemoData(raw) || isManualSeedData(raw)
}

function nowVersion() {
  // Usa timestamp en ms con pequeño jitter para evitar colisiones de versión.
  return Date.now() * 1000 + Math.floor(Math.random() * 1000)
}

function getDeviceId() {
  try {
    const saved = localStorage.getItem(DEVICE_ID_KEY)
    if (saved) return saved
    const generated = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(DEVICE_ID_KEY, generated)
    return generated
  } catch (e) {
    return 'dev-unknown'
  }
}

function readSyncMeta() {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY)
    if (!raw) return { version: 0, updatedAt: '', deviceId: '' }
    const parsed = JSON.parse(raw)
    return {
      version: Number(parsed?.version || 0),
      updatedAt: String(parsed?.updatedAt || ''),
      deviceId: String(parsed?.deviceId || '')
    }
  } catch (e) {
    return { version: 0, updatedAt: '', deviceId: '' }
  }
}

function readSheetsSyncMeta() {
  try {
    const raw = localStorage.getItem(SHEETS_SYNC_META_KEY)
    if (!raw) return { version: 0, updatedAt: '', deviceId: '' }
    const parsed = JSON.parse(raw)
    return {
      version: Number(parsed?.version || 0),
      updatedAt: String(parsed?.updatedAt || ''),
      deviceId: String(parsed?.deviceId || '')
    }
  } catch (e) {
    return { version: 0, updatedAt: '', deviceId: '' }
  }
}

function writeSyncMeta(meta) {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({
      version: Number(meta?.version || 0),
      updatedAt: String(meta?.updatedAt || ''),
      deviceId: String(meta?.deviceId || '')
    }))
  } catch (e) {}
}

function writeSheetsSyncMeta(meta) {
  try {
    localStorage.setItem(SHEETS_SYNC_META_KEY, JSON.stringify({
      version: Number(meta?.version || 0),
      updatedAt: String(meta?.updatedAt || ''),
      deviceId: String(meta?.deviceId || '')
    }))
  } catch (e) {}
}

function readPendingWrite() {
  try {
    const raw = localStorage.getItem(PENDING_WRITE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!normalizeData(parsed.data)) return null
    return {
      version: Number(parsed.version || 0),
      updatedAt: String(parsed.updatedAt || ''),
      deviceId: String(parsed.deviceId || ''),
      data: normalizeData(parsed.data)
    }
  } catch (e) {
    return null
  }
}

function readSheetsPendingWrite() {
  try {
    const raw = localStorage.getItem(SHEETS_PENDING_WRITE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      version: Number(parsed.version || 0),
      updatedAt: String(parsed.updatedAt || ''),
      deviceId: String(parsed.deviceId || ''),
      sheets: normalizeRouteSheets(parsed.sheets)
    }
  } catch (e) {
    return null
  }
}

function writePendingWrite(payload) {
  try {
    if (!payload) {
      localStorage.removeItem(PENDING_WRITE_KEY)
      return
    }
    localStorage.setItem(PENDING_WRITE_KEY, JSON.stringify(payload))
  } catch (e) {}
}

function writeSheetsPendingWrite(payload) {
  try {
    if (!payload) {
      localStorage.removeItem(SHEETS_PENDING_WRITE_KEY)
      return
    }
    localStorage.setItem(SHEETS_PENDING_WRITE_KEY, JSON.stringify(payload))
  } catch (e) {}
}

function toRemoteEnvelope(data, version, updatedAt, deviceId) {
  return {
    version: Number(version || 0),
    updatedAt: String(updatedAt || ''),
    deviceId: String(deviceId || ''),
    data: normalizeData(data)
  }
}

function toRouteSheetsEnvelope(sheets, version, updatedAt, deviceId) {
  return {
    version: Number(version || 0),
    updatedAt: String(updatedAt || ''),
    deviceId: String(deviceId || ''),
    sheets: normalizeRouteSheets(sheets)
  }
}

function parseRemoteEnvelope(raw) {
  if (!raw || typeof raw !== 'object') return null

  // Formato nuevo: envelope con metadatos de sync.
  if (raw.data && typeof raw.data === 'object') {
    const normalized = normalizeData(raw.data)
    if (!normalized) return null
    return {
      version: Number(raw.version || 0),
      updatedAt: String(raw.updatedAt || ''),
      deviceId: String(raw.deviceId || ''),
      data: normalized
    }
  }

  // Formato legado: solo dataset.
  const legacy = normalizeData(raw)
  if (!legacy) return null
  return {
    version: 0,
    updatedAt: '',
    deviceId: '',
    data: legacy
  }
}

function parseRouteSheetsEnvelope(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    version: Number(raw.version || 0),
    updatedAt: String(raw.updatedAt || ''),
    deviceId: String(raw.deviceId || ''),
    sheets: normalizeRouteSheets(raw.sheets)
  }
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

function loadLocalSheets() {
  try {
    const raw = localStorage.getItem(ROUTE_SHEETS_KEY)
    if (!raw) return []
    return normalizeRouteSheets(JSON.parse(raw))
  } catch (e) {
    return []
  }
}

function saveLocal(obj, meta = null) {
  try {
    const normalized = normalizeData(obj)
    if (!normalized) return
    if (isBlockedSeedData(normalized)) {
      console.warn('Se omitio guardar datos demo o semilla de prueba.')
      return
    }
    const current = loadLocal()
    if (current && JSON.stringify(current) !== JSON.stringify(normalized)) {
      saveBackup(current)
    }
    localStorage.setItem(DATA_KEY, JSON.stringify(normalized))
    if (meta && Number(meta.version || 0) > 0) {
      writeSyncMeta({
        version: Number(meta.version || 0),
        updatedAt: String(meta.updatedAt || new Date().toISOString()),
        deviceId: String(meta.deviceId || getDeviceId())
      })
    }
  } catch(e) {}
}

function saveLocalSheets(sheets, meta = null) {
  try {
    const normalized = normalizeRouteSheets(sheets)
    localStorage.setItem(ROUTE_SHEETS_KEY, JSON.stringify(normalized))
    if (meta && Number(meta.version || 0) > 0) {
      writeSheetsSyncMeta({
        version: Number(meta.version || 0),
        updatedAt: String(meta.updatedAt || new Date().toISOString()),
        deviceId: String(meta.deviceId || getDeviceId())
      })
    }
  } catch (e) {}
}

async function readRemoteEnvelope() {
  try {
    const fb = await initFirebase()
    if (!fb || !fb.db) return null
    const { ref, get } = await import('firebase/database')
    const snap = await get(ref(fb.db, '/snt_data'))
    if (!snap || !snap.exists()) return null
    return parseRemoteEnvelope(snap.val())
  } catch (e) {
    console.warn('firebase read failed', e)
    return null
  }
}

async function writeRemoteEnvelope(envelope) {
  const normalized = parseRemoteEnvelope(envelope)
  if (!normalized) return false
  try {
    const fb = await initFirebase()
    if (!fb || !fb.db) return false
    const { ref, update } = await import('firebase/database')
    await update(ref(fb.db, '/snt_data'), normalized)
    return true
  } catch (e) {
    console.warn('firebase write failed', e)
    return false
  }
}

async function readRemoteRouteSheetsEnvelope() {
  try {
    const fb = await initFirebase()
    if (!fb || !fb.db) return null
    const { ref, get } = await import('firebase/database')
    const snap = await get(ref(fb.db, '/snt_data/routeSheets'))
    if (!snap || !snap.exists()) return null
    return parseRouteSheetsEnvelope(snap.val())
  } catch (e) {
    console.warn('firebase sheets read failed', e)
    return null
  }
}

async function writeRemoteRouteSheetsEnvelope(envelope) {
  const normalized = parseRouteSheetsEnvelope(envelope)
  if (!normalized) return false
  try {
    const fb = await initFirebase()
    if (!fb || !fb.db) return false
    const { ref, set } = await import('firebase/database')
    await set(ref(fb.db, '/snt_data/routeSheets'), normalized)
    return true
  } catch (e) {
    console.warn('firebase sheets write failed', e)
    return false
  }
}

export async function flushPendingWrites() {
  const pending = readPendingWrite()
  if (!pending) return true
  const ok = await writeRemoteEnvelope(pending)
  if (ok) {
    writePendingWrite(null)
    writeSyncMeta({
      version: pending.version,
      updatedAt: pending.updatedAt,
      deviceId: pending.deviceId
    })
    return true
  }
  return false
}

export async function flushPendingRouteSheets() {
  const pending = readSheetsPendingWrite()
  if (!pending) return true
  const ok = await writeRemoteRouteSheetsEnvelope(pending)
  if (ok) {
    writeSheetsPendingWrite(null)
    writeSheetsSyncMeta({
      version: pending.version,
      updatedAt: pending.updatedAt,
      deviceId: pending.deviceId
    })
    return true
  }
  return false
}

let autoSyncStarted = false
function ensureAutoSync() {
  if (autoSyncStarted || typeof window === 'undefined') return
  autoSyncStarted = true
  window.addEventListener('online', () => {
    flushPendingWrites().catch(() => {})
    flushPendingRouteSheets().catch(() => {})
  })

  // Reintento liviano para sincronizar cola si hay conectividad intermitente.
  window.setInterval(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    flushPendingWrites().catch(() => {})
    flushPendingRouteSheets().catch(() => {})
  }, 15000)
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
  ensureAutoSync()

  // 1) local cache first (never overwrite user edits with static data)
  const local = loadLocal()
  const localMeta = readSyncMeta()

  // 2) optional remote (Firebase)
  let remoteEnvelope = await readRemoteEnvelope()
  let remote = remoteEnvelope?.data || null

  if (remote && isBlockedSeedData(remote)) {
    const localHasRealData = local && dataScore(local) > 0 && !isBlockedSeedData(local)
    if (localHasRealData) {
      const pending = toRemoteEnvelope(
        local,
        Number(localMeta?.version || nowVersion()),
        localMeta?.updatedAt || new Date().toISOString(),
        localMeta?.deviceId || getDeviceId()
      )
      writePendingWrite(pending)
      await flushPendingWrites()
      return local
    }
    remoteEnvelope = null
    remote = null
  }

  // Si hay cambios pendientes locales, intentamos subirlos al reconectar.
  await flushPendingWrites()

  // Si ambos existen, prioriza versión más nueva; en empate, dataset más completo.
  if (local && remote) {
    const remoteVersion = Number(remoteEnvelope?.version || 0)
    const localVersion = Number(localMeta?.version || 0)

    if (remoteVersion > localVersion) {
      saveLocal(remote, {
        version: remoteVersion,
        updatedAt: remoteEnvelope?.updatedAt || new Date().toISOString(),
        deviceId: remoteEnvelope?.deviceId || ''
      })
      return remote
    }

    if (localVersion > remoteVersion) {
      // Local más nuevo: se mantiene local y se encola push remoto.
      const pending = toRemoteEnvelope(
        local,
        localVersion,
        localMeta?.updatedAt || new Date().toISOString(),
        localMeta?.deviceId || getDeviceId()
      )
      writePendingWrite(pending)
      await flushPendingWrites()
      return local
    }

    const chosen = dataScore(remote) > dataScore(local) ? remote : local
    saveLocal(chosen, {
      version: localVersion,
      updatedAt: localMeta?.updatedAt || new Date().toISOString(),
      deviceId: localMeta?.deviceId || getDeviceId()
    })
    return chosen
  }

  if (remote) {
    saveLocal(remote, {
      version: Number(remoteEnvelope?.version || 0),
      updatedAt: remoteEnvelope?.updatedAt || new Date().toISOString(),
      deviceId: remoteEnvelope?.deviceId || ''
    })
    return remote
  }

  if (local) return local

  // 3) static seed only as last fallback
  try {
    const r = await fetch(`${BASE_URL}data.json`)
    if (r.ok) {
      const json = normalizeData(await r.json())
      if (!isBlockedSeedData(json)) {
        saveLocal(json, {
          version: nowVersion(),
          updatedAt: new Date().toISOString(),
          deviceId: getDeviceId()
        })
      }
      return json
    }
  } catch (e) {}

  return null
}

export async function saveData(obj) {
  ensureAutoSync()

  const normalized = normalizeData(obj)
  if (!normalized) return false
  if (isBlockedSeedData(normalized)) {
    console.warn('Se bloqueo una escritura demo para proteger datos reales.')
    return false
  }

  const deviceId = getDeviceId()
  const version = nowVersion()
  const updatedAt = new Date().toISOString()
  const envelope = toRemoteEnvelope(normalized, version, updatedAt, deviceId)

  // Siempre persistir local y encolar para eventual subida remota.
  saveLocal(normalized, { version, updatedAt, deviceId })
  writePendingWrite(envelope)

  // Intentar flush inmediato; si falla queda en cola para próximo online/load.
  return await flushPendingWrites()
}

export async function loadRouteSheets() {
  ensureAutoSync()

  const local = loadLocalSheets()
  const localMeta = readSheetsSyncMeta()
  const remoteEnvelope = await readRemoteRouteSheetsEnvelope()
  const remote = remoteEnvelope?.sheets || []

  await flushPendingRouteSheets()

  if (local.length && remote.length) {
    const remoteVersion = Number(remoteEnvelope?.version || 0)
    const localVersion = Number(localMeta?.version || 0)

    if (remoteVersion > localVersion) {
      saveLocalSheets(remote, {
        version: remoteVersion,
        updatedAt: remoteEnvelope?.updatedAt || new Date().toISOString(),
        deviceId: remoteEnvelope?.deviceId || ''
      })
      return remote
    }

    if (localVersion > remoteVersion) {
      const pending = toRouteSheetsEnvelope(
        local,
        localVersion,
        localMeta?.updatedAt || new Date().toISOString(),
        localMeta?.deviceId || getDeviceId()
      )
      writeSheetsPendingWrite(pending)
      await flushPendingRouteSheets()
      return local
    }

    return local.length >= remote.length ? local : remote
  }

  if (remote.length) {
    saveLocalSheets(remote, {
      version: Number(remoteEnvelope?.version || 0),
      updatedAt: remoteEnvelope?.updatedAt || new Date().toISOString(),
      deviceId: remoteEnvelope?.deviceId || ''
    })
    return remote
  }

  if (local.length) return local
  return []
}

export async function saveRouteSheets(sheets) {
  ensureAutoSync()

  const normalized = normalizeRouteSheets(sheets)
  if (!normalized.length) return false

  const deviceId = getDeviceId()
  const version = nowVersion()
  const updatedAt = new Date().toISOString()
  const envelope = toRouteSheetsEnvelope(normalized, version, updatedAt, deviceId)

  saveLocalSheets(normalized, { version, updatedAt, deviceId })
  writeSheetsPendingWrite(envelope)

  return await flushPendingRouteSheets()
}

export async function isRemoteAvailable() {
  try {
    const fb = await initFirebase()
    return !!fb
  } catch (e) { return false }
}
