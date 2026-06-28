const BASE_URL = import.meta.env.BASE_URL || '/'
const FIREBASE_CONFIG_PATH = `${BASE_URL}firebase-config.json`
const AUTH_EMAIL_DOMAIN = 'snt.local'

let firebaseConfigPromise = null
let firebaseCorePromise = null

export const ROLE_OWNER = 'owner'
export const ROLE_ADMIN = 'admin'
export const ROLE_OPERADOR = 'operador'
export const ROLE_LECTURA = 'lectura'
export const ROLE_OPTIONS = [ROLE_OWNER, ROLE_ADMIN, ROLE_OPERADOR, ROLE_LECTURA]

function nowIso() {
  return new Date().toISOString()
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

export function isValidUsername(value) {
  const username = normalizeUsername(value)
  return /^[a-z0-9._-]{3,30}$/.test(username)
}

function usernameToAuthEmail(username) {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`
}

function authEmailToUsername(authEmail) {
  const email = String(authEmail || '').trim().toLowerCase()
  if (!email.includes('@')) return ''
  const local = email.split('@')[0]
  return normalizeUsername(local)
}

function fallbackUsername(uid, authEmail) {
  const fromEmail = authEmailToUsername(authEmail)
  if (isValidUsername(fromEmail)) return fromEmail
  const fromUid = normalizeUsername(`user-${String(uid || '').slice(0, 8)}`)
  return isValidUsername(fromUid) ? fromUid : 'user-temp'
}

async function getFirebaseConfig() {
  if (firebaseConfigPromise) return firebaseConfigPromise
  firebaseConfigPromise = (async () => {
    const response = await fetch(FIREBASE_CONFIG_PATH, { cache: 'no-store' })
    if (!response.ok) throw new Error('No se encontro firebase-config.json')
    const cfg = await response.json()
    if (!cfg || typeof cfg !== 'object' || Object.keys(cfg).length === 0) {
      throw new Error('Configuracion Firebase vacia')
    }
    return cfg
  })()
  return firebaseConfigPromise
}

async function getFirebaseCore() {
  if (firebaseCorePromise) return firebaseCorePromise
  firebaseCorePromise = (async () => {
    const cfg = await getFirebaseConfig()
    const [{ initializeApp, getApps, getApp }, { getAuth }, { getDatabase }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/database')
    ])

    const app = getApps().length ? getApp() : initializeApp(cfg)
    const auth = getAuth(app)
    const db = getDatabase(app)

    return { cfg, app, auth, db }
  })()
  return firebaseCorePromise
}

export async function isAuthConfigured() {
  try {
    await getFirebaseCore()
    return true
  } catch (e) {
    return false
  }
}

export async function checkFirebaseConnection() {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, message: 'Sin internet' }
    }

    const cfg = await getFirebaseConfig()
    const apiKey = String(cfg?.apiKey || '').trim()
    if (!apiKey) return { ok: false, message: 'Falta apiKey de Firebase' }

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'healthcheck@example.com',
        continueUri: 'https://localhost'
      })
    })

    if (response.ok) {
      return { ok: true, message: 'Conectado a Firebase' }
    }

    const payload = await response.json().catch(() => null)
    const errorCode = String(payload?.error?.message || '')
    if (errorCode.includes('PROJECT_NOT_FOUND')) return { ok: false, message: 'Proyecto Firebase no encontrado' }
    if (errorCode.includes('API_KEY_INVALID')) return { ok: false, message: 'apiKey inválida' }

    return { ok: false, message: `Firebase no responde (${response.status})` }
  } catch (error) {
    return { ok: false, message: 'Sin conexión con Firebase' }
  }
}

export async function subscribeAuthState(handler) {
  const { auth } = await getFirebaseCore()
  const { onAuthStateChanged } = await import('firebase/auth')
  return onAuthStateChanged(auth, handler)
}

export async function signInWithEmail(email, password) {
  const { auth } = await getFirebaseCore()
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  return signInWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''))
}

export async function signUpWithEmail(email, password) {
  const { auth } = await getFirebaseCore()
  const { createUserWithEmailAndPassword } = await import('firebase/auth')
  return createUserWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''))
}

async function listProfilesMap() {
  const { db } = await getFirebaseCore()
  const { ref, get } = await import('firebase/database')
  const snapshot = await get(ref(db, '/snt_users'))
  if (!snapshot.exists()) return []
  const raw = snapshot.val() || {}
  return Object.entries(raw).map(([uid, profile]) => normalizeProfile(uid, profile))
}

async function resolveProfileForUsername(username) {
  const wanted = normalizeUsername(username)
  if (!wanted) return null
  const profiles = await listProfilesMap()
  return profiles.find(profile => normalizeUsername(profile.username) === wanted) || null
}

export async function signInWithUsername(username, password) {
  const profile = await resolveProfileForUsername(username)
  if (!profile?.authEmail) {
    const error = new Error('Usuario no encontrado')
    error.code = 'auth/user-not-found'
    throw error
  }
  return signInWithEmail(profile.authEmail, password)
}

export async function signUpWithUsername(username, password) {
  const normalized = normalizeUsername(username)
  if (!isValidUsername(normalized)) {
    throw new Error('El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.')
  }
  return signUpWithEmail(usernameToAuthEmail(normalized), password)
}

export async function signOutCurrentUser() {
  const { auth } = await getFirebaseCore()
  const { signOut } = await import('firebase/auth')
  await signOut(auth)
}

function normalizeProfile(uid, raw) {
  const role = ROLE_OPTIONS.includes(String(raw?.role || '').toLowerCase()) ? String(raw.role).toLowerCase() : ROLE_LECTURA
  const authEmail = String(raw?.authEmail || raw?.email || '').trim().toLowerCase()
  const username = normalizeUsername(raw?.username) || fallbackUsername(uid, authEmail)
  return {
    uid,
    name: String(raw?.name || '').trim(),
    username,
    authEmail,
    email: String(raw?.email || '').trim(),
    role,
    active: raw?.active !== false,
    createdAt: String(raw?.createdAt || ''),
    updatedAt: String(raw?.updatedAt || ''),
    disabledAt: String(raw?.disabledAt || '')
  }
}

export async function getUserProfile(uid) {
  if (!uid) return null
  const { db } = await getFirebaseCore()
  const { ref, get } = await import('firebase/database')
  const snapshot = await get(ref(db, `/snt_users/${uid}`))
  if (!snapshot.exists()) return null
  return normalizeProfile(uid, snapshot.val())
}

export async function listUserProfiles() {
  const { db } = await getFirebaseCore()
  const { ref, get } = await import('firebase/database')
  const snapshot = await get(ref(db, '/snt_users'))
  if (!snapshot.exists()) return []
  const raw = snapshot.val() || {}
  return Object.entries(raw)
    .map(([uid, profile]) => normalizeProfile(uid, profile))
    .sort((a, b) => {
      if (a.role !== b.role) {
        const order = { owner: 1, admin: 2, operador: 3, lectura: 4 }
        return Number(order[a.role] || 99) - Number(order[b.role] || 99)
      }
      return String(a.name || a.username || '').localeCompare(String(b.name || b.username || ''), 'es')
    })
}

export async function hasAnyUserProfiles() {
  try {
    const { db } = await getFirebaseCore()
    const { ref, get } = await import('firebase/database')
    const snapshot = await get(ref(db, '/snt_users'))
    if (!snapshot.exists()) return false
    const raw = snapshot.val() || {}
    return Object.keys(raw).length > 0
  } catch (e) {
    // Ante cualquier duda de permisos/red, ocultamos el alta inicial para no exponerla.
    return true
  }
}

export async function ensureBootstrapOwner(user) {
  if (!user?.uid) return null
  const { db } = await getFirebaseCore()
  const { ref, get, set } = await import('firebase/database')

  const usersRef = ref(db, '/snt_users')
  const usersSnapshot = await get(usersRef)
  const hasUsers = usersSnapshot.exists() && Object.keys(usersSnapshot.val() || {}).length > 0

  const profileRef = ref(db, `/snt_users/${user.uid}`)
  const profileSnapshot = await get(profileRef)

  if (profileSnapshot.exists()) {
    const profile = normalizeProfile(user.uid, profileSnapshot.val())
    if (!profileSnapshot.val()?.username || !profileSnapshot.val()?.authEmail) {
      await set(profileRef, {
        ...profileSnapshot.val(),
        username: profile.username,
        authEmail: profile.authEmail || usernameToAuthEmail(profile.username),
        updatedAt: nowIso()
      })
    }
    return profile
  }

  if (!hasUsers) {
    const profile = {
      name: String(user.displayName || '').trim() || 'Propietario',
      username: fallbackUsername(user.uid, user.email),
      authEmail: String(user.email || '').trim().toLowerCase(),
      email: '',
      role: ROLE_OWNER,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    await set(profileRef, profile)
    return normalizeProfile(user.uid, profile)
  }

  return null
}

function canManageUsers(profile) {
  const role = String(profile?.role || '').toLowerCase()
  return role === ROLE_OWNER
}

function canAssignRole(actorRole, targetRole) {
  if (actorRole === ROLE_OWNER) return ROLE_OPTIONS.includes(targetRole)
  return false
}

function canModifyTarget(actor, target) {
  const actorRole = String(actor?.role || '').toLowerCase()
  if (actorRole === ROLE_OWNER) return true
  return false
}

export async function createUserByManager(actorProfile, payload) {
  if (!canManageUsers(actorProfile)) throw new Error('No tienes permisos para crear usuarios')

  const username = normalizeUsername(payload?.username)
  const password = String(payload?.password || '')
  const name = String(payload?.name || '').trim()
  const role = String(payload?.role || ROLE_OPERADOR).toLowerCase()

  if (!isValidUsername(username)) throw new Error('El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.')
  if (!password) throw new Error('Usuario y contraseña son obligatorios')
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')
  if (!canAssignRole(String(actorProfile?.role || '').toLowerCase(), role)) {
    throw new Error('No tienes permisos para asignar ese rol')
  }

  const existingProfile = await resolveProfileForUsername(username)
  if (existingProfile) throw new Error('Ese nombre de usuario ya existe')

  const core = await getFirebaseCore()
  const { initializeApp, deleteApp } = await import('firebase/app')
  const { getAuth, createUserWithEmailAndPassword, signOut } = await import('firebase/auth')
  const { ref, set } = await import('firebase/database')

  const tempAppName = `snt-user-create-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const tempApp = initializeApp(core.cfg, tempAppName)
  const tempAuth = getAuth(tempApp)

  let newUid = ''
  try {
    const authEmail = usernameToAuthEmail(username)
    const created = await createUserWithEmailAndPassword(tempAuth, authEmail, password)
    newUid = created?.user?.uid || ''
    if (!newUid) throw new Error('No se pudo obtener UID del nuevo usuario')

    const profile = {
      name: name || username,
      username,
      authEmail,
      email: '',
      role,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }

    await set(ref(core.db, `/snt_users/${newUid}`), profile)
    return normalizeProfile(newUid, profile)
  } finally {
    try { await signOut(tempAuth) } catch (e) {}
    try { await deleteApp(tempApp) } catch (e) {}
  }
}

export async function updateUserProfileByManager(actorProfile, targetUid, updates) {
  if (!canManageUsers(actorProfile)) throw new Error('No tienes permisos para editar usuarios')
  if (!targetUid) throw new Error('Usuario destino inválido')

  const current = await getUserProfile(targetUid)
  if (!current) throw new Error('El usuario no existe')
  if (!canModifyTarget(actorProfile, current)) throw new Error('No tienes permisos para editar este usuario')

  const actorRole = String(actorProfile?.role || '').toLowerCase()
  const nextRole = updates?.role ? String(updates.role).toLowerCase() : current.role
  if (!canAssignRole(actorRole, nextRole)) throw new Error('No puedes asignar ese rol')

  const next = {
    ...current,
    name: updates?.name !== undefined ? String(updates.name || '').trim() : current.name,
    role: nextRole,
    active: updates?.active !== undefined ? Boolean(updates.active) : current.active,
    updatedAt: nowIso()
  }

  if (!next.active) {
    next.disabledAt = next.disabledAt || nowIso()
  } else {
    next.disabledAt = ''
  }

  const { db } = await getFirebaseCore()
  const { ref, set } = await import('firebase/database')
  await set(ref(db, `/snt_users/${targetUid}`), {
    name: next.name,
    username: next.username,
    authEmail: next.authEmail,
    email: next.email,
    role: next.role,
    active: next.active,
    createdAt: next.createdAt,
    updatedAt: next.updatedAt,
    disabledAt: next.disabledAt
  })

  return next
}
