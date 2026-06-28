import React from 'react'
import QuoteEngine from './QuoteEngine'
import AdminPanel from './AdminPanel'
import GeneralQuote from './GeneralQuote'
import ExpressSearch from './ExpressSearch'
import visualLogo from './assets/somos-noche-logo.svg'
import LoginPanel from './LoginPanel'
import UserManagementPanel from './UserManagementPanel'
import {
  checkFirebaseConnection,
  hasAnyUserProfiles,
  ROLE_ADMIN,
  ROLE_LECTURA,
  ROLE_OWNER,
  ROLE_OPERADOR,
  ensureBootstrapOwner,
  getUserProfile,
  isValidUsername,
  isAuthConfigured,
  signInWithUsername,
  signUpWithUsername,
  signOutCurrentUser,
  subscribeAuthState
} from './auth'

class LazyViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('Lazy view render failed', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '0.75rem', border: '1px solid #ddd', borderRadius: 8 }}>
          <p>No se pudo cargar esta vista. Puede ser una actualizacion pendiente de la app instalada.</p>
          <button onClick={() => window.location.reload()}>Recargar aplicacion</button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [deferredPrompt, setDeferredPrompt] = React.useState(null)
  const [view, setView] = React.useState(null) // null | 'pc' | 'mobile'
  const [theme, setTheme] = React.useState(() => {
    try {
      const saved = localStorage.getItem('snt_theme')
      return saved === 'light' ? 'light' : 'dark'
    } catch (e) {
      return 'dark'
    }
  })
  const isHomeView = view === null
  const [authConfigured, setAuthConfigured] = React.useState(true)
  const [authReady, setAuthReady] = React.useState(false)
  const [authAction, setAuthAction] = React.useState('')
  const [authError, setAuthError] = React.useState('')
  const [currentUser, setCurrentUser] = React.useState(null)
  const [currentProfile, setCurrentProfile] = React.useState(null)
  const [firebaseConnection, setFirebaseConnection] = React.useState({
    status: 'checking',
    message: 'Comprobando conexión...'
  })
  const [canCreateFirstOwner, setCanCreateFirstOwner] = React.useState(false)
  const [adminSegment, setAdminSegment] = React.useState('operations')
  const authBusy = Boolean(authAction)

  const currentRole = String(currentProfile?.role || '').toLowerCase()

  const canAccessAdmin = [ROLE_OWNER, ROLE_ADMIN].includes(currentRole)
  const isOwner = currentRole === ROLE_OWNER
  const canManageOperationData = [ROLE_OWNER, ROLE_ADMIN].includes(currentRole)
  const canManagePassengerSheets = [ROLE_OWNER, ROLE_ADMIN, ROLE_OPERADOR].includes(currentRole)
  const canEditPassengerDemand = [ROLE_OWNER, ROLE_ADMIN, ROLE_OPERADOR].includes(currentRole)
  const canEditPassengerPricing = [ROLE_OWNER, ROLE_ADMIN].includes(currentRole)
  const isReadOnlyRole = currentRole === ROLE_LECTURA

  function normalizeUsernameInput(value) {
    return String(value || '').trim().toLowerCase()
  }

  async function withTimeout(promise, ms = 15000) {
    let timer = null
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('auth-timeout')), ms)
        })
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  React.useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  React.useEffect(() => {
    let mounted = true
    let unsubscribe = null

    ;(async () => {
      try {
        const configured = await isAuthConfigured()
        if (!mounted) return
        setAuthConfigured(configured)

        if (!configured) {
          setAuthReady(true)
          setAuthError('Firebase Authentication no esta configurado.')
          return
        }

        const hasUsers = await hasAnyUserProfiles()
        if (!mounted) return
        setCanCreateFirstOwner(!hasUsers)

        unsubscribe = await subscribeAuthState(async firebaseUser => {
          if (!mounted) return

          if (!firebaseUser) {
            setCurrentUser(null)
            setCurrentProfile(null)
            setAuthReady(true)
            return
          }

          try {
            const bootstrapProfile = await ensureBootstrapOwner(firebaseUser)
            const profile = bootstrapProfile || await getUserProfile(firebaseUser.uid)

            if (!mounted) return

            if (!profile) {
              setCurrentUser(firebaseUser)
              setCurrentProfile(null)
              setAuthError('Tu usuario no tiene perfil ni permisos en esta app. Contacta al propietario.')
              setAuthReady(true)
              return
            }

            if (profile.active === false) {
              await signOutCurrentUser()
              if (!mounted) return
              setAuthError('Tu usuario fue dado de baja y no tiene acceso.')
              setCurrentUser(null)
              setCurrentProfile(null)
              setAuthReady(true)
              return
            }

            setAuthError('')
            setCurrentUser(firebaseUser)
            setCurrentProfile({ ...profile, uid: firebaseUser.uid })
            setAuthReady(true)
          } catch (error) {
            if (!mounted) return
            setAuthError(error?.message || 'No se pudo validar tu usuario.')
            setCurrentUser(null)
            setCurrentProfile(null)
            setAuthReady(true)
          }
        })
      } catch (error) {
        if (!mounted) return
        setAuthConfigured(false)
        setAuthReady(true)
        setAuthError(error?.message || 'No se pudo iniciar autenticacion.')
      }
    })()

    return () => {
      mounted = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  React.useEffect(() => {
    let mounted = true
    let timer = null

    const runCheck = async () => {
      const result = await checkFirebaseConnection()
      if (!mounted) return
      setFirebaseConnection({
        status: result.ok ? 'ok' : 'error',
        message: result.message || (result.ok ? 'Conectado a Firebase' : 'Sin conexión con Firebase')
      })
    }

    runCheck()
    timer = setInterval(runCheck, 15000)

    return () => {
      mounted = false
      if (timer) clearInterval(timer)
    }
  }, [])

  const installApp = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    console.log('Install choice', choice)
    setDeferredPrompt(null)
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Copiado al portapapeles')
    } catch (err) {
      console.error('Clipboard error', err)
      alert('No se pudo copiar. Copia manualmente.')
    }
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
  const rightsText = 'Derechos de autor y dueño de la app: Marcos Orts | Contacto: 3583596542'

  const hydrateSignedUser = async (firebaseUser) => {
    if (!firebaseUser?.uid) throw new Error('Usuario autenticado inválido')
    const bootstrapProfile = await withTimeout(ensureBootstrapOwner(firebaseUser), 12000)
    const profile = bootstrapProfile || await withTimeout(getUserProfile(firebaseUser.uid), 12000)

    if (!profile) throw new Error('Tu usuario no tiene perfil ni permisos en esta app. Contacta al propietario.')
    if (profile.active === false) {
      await signOutCurrentUser()
      throw new Error('Tu usuario fue dado de baja y no tiene acceso.')
    }

    setCurrentUser(firebaseUser)
    setCurrentProfile({ ...profile, uid: firebaseUser.uid })
    setAuthReady(true)
    setAuthError('')
    return profile
  }

  const doLogin = async ({ username, password }) => {
    const cleanUsername = normalizeUsernameInput(username)
    const cleanPassword = String(password || '')
    if (!isValidUsername(cleanUsername)) {
      setAuthError('Ingresa un usuario válido (3 a 30 caracteres, letras, números, punto, guion o guion bajo).')
      return
    }
    if (!cleanPassword) {
      setAuthError('Ingresa tu contraseña.')
      return
    }

    setAuthAction('login')
    setAuthError('')
    try {
      const credential = await withTimeout(signInWithUsername(cleanUsername, cleanPassword))
      await hydrateSignedUser(credential?.user)
    } catch (error) {
      const code = String(error?.code || '')
      const msg = String(error?.message || '')
      if (msg.includes('auth-timeout')) {
        setAuthError('No hubo respuesta de Firebase. Verifica internet y vuelve a intentar.')
      } else if (code.includes('configuration-not-found')) {
        setAuthError('Firebase Authentication no esta habilitado para este proyecto. Debes activar Email/Password en Firebase Console > Authentication > Sign-in method.')
      } else if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
        setAuthError('Nombre de usuario o contraseña incorrectos.')
      } else {
        setAuthError(error?.message || 'No se pudo iniciar sesión.')
      }
    } finally {
      setAuthAction('')
    }
  }

  const doCreateFirstOwner = async ({ username, password }) => {
    const cleanUsername = normalizeUsernameInput(username)
    const cleanPassword = String(password || '')
    if (!isValidUsername(cleanUsername)) {
      setAuthError('Ingresa un usuario válido (3 a 30 caracteres, letras, números, punto, guion o guion bajo).')
      return
    }
    if (!cleanPassword) {
      setAuthError('Ingresa una contraseña para crear el propietario.')
      return
    }

    setAuthAction('create')
    setAuthError('')
    try {
      const credential = await withTimeout(signUpWithUsername(cleanUsername, cleanPassword))
      await hydrateSignedUser(credential?.user)
    } catch (error) {
      const code = String(error?.code || '')
      const msg = String(error?.message || '')
      if (msg.includes('auth-timeout')) {
        setAuthError('No hubo respuesta de Firebase. Verifica internet y vuelve a intentar.')
      } else if (code.includes('configuration-not-found')) {
        setAuthError('Firebase Authentication no esta habilitado para este proyecto. Debes activar Email/Password en Firebase Console > Authentication > Sign-in method.')
      } else if (code.includes('email-already-in-use')) {
        try {
          const credential = await withTimeout(signInWithUsername(cleanUsername, cleanPassword))
          await hydrateSignedUser(credential?.user)
        } catch (loginError) {
          const loginCode = String(loginError?.code || '')
          if (loginCode.includes('invalid-credential') || loginCode.includes('wrong-password')) {
            setAuthError('Ese usuario ya existe, pero la contraseña no coincide. Usa Ingresar con la contraseña correcta.')
          } else {
            setAuthError('Ese usuario ya existe. Usa Ingresar con ese usuario.')
          }
        }
      } else if (code.includes('weak-password')) {
        setAuthError('La contraseña es muy débil. Usa al menos 6 caracteres.')
      } else {
        setAuthError(error?.message || 'No se pudo crear el primer propietario.')
      }
    } finally {
      setAuthAction('')
    }
  }

  React.useEffect(() => {
    if (!authAction) return
    const timer = setTimeout(() => {
      setAuthError('La operación tardó demasiado y se destrabó automáticamente. Intenta de nuevo.')
      setAuthAction('')
    }, 12000)
    return () => clearTimeout(timer)
  }, [authAction])

  const doLogout = async () => {
    setAuthError('')
    await signOutCurrentUser()
    setView(null)
  }

  React.useEffect(() => {
    try {
      localStorage.setItem('snt_theme', theme)
    } catch (e) {}
  }, [theme])

  return (
    <div className={`${isHomeView ? 'app app--home' : 'app app--inner'} theme-${theme}`}>
      <header className="app-header">
        <div className="header-logo-wrap" aria-hidden="true">
          <img className="header-logo" src={visualLogo} alt="Logo Somos Noche" />
        </div>
        <div className="theme-toggle-wrap">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>
        <h1>SOMOS NOCHE TRANSPORTE</h1>
        <p className="subtitle">Gestión premium de rutas, reservas y cotizaciones en una sola plataforma</p>
        {currentUser && currentProfile && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            <span>Usuario: <strong>{currentProfile.name || currentProfile.username || currentUser.email}</strong></span>
            <span>Rol: <strong>{String(currentProfile.role || '').toUpperCase()}</strong></span>
            <button type="button" onClick={doLogout}>Cerrar sesión</button>
          </div>
        )}
      </header>

      <div className="global-watermark" aria-hidden="true">
        <img src={visualLogo} alt="" />
      </div>

      <main className="app-main">
        {!authReady && (
          <section className="details">
            <h2>Iniciando sesión segura...</h2>
            <p>Estamos validando el acceso.</p>
          </section>
        )}

        {authReady && !currentUser && (
          <LoginPanel
            onLogin={doLogin}
            onCreateFirstOwner={doCreateFirstOwner}
            loading={authBusy}
            loadingAction={authAction}
            errorText={authError}
            authUnavailable={!authConfigured}
            firebaseConnection={firebaseConnection}
            canCreateFirstOwner={canCreateFirstOwner}
          />
        )}

        {authReady && currentUser && !currentProfile && (
          <section className="details" style={{ maxWidth: 560, margin: '1.5rem auto' }}>
            <h2>Sin permisos de acceso</h2>
            <p>{authError || 'Tu cuenta no tiene permisos asignados en esta app.'}</p>
            <button onClick={doLogout}>Cerrar sesión</button>
          </section>
        )}

        {authReady && currentUser && currentProfile && (
          <>
        {deferredPrompt && (
          <button className="install-btn" onClick={installApp}>Instalar aplicación</button>
        )}

        {!view && (
          <div className="home-stack">
            <section className="hero-panel">
              <img className="hero-main-logo" src={visualLogo} alt="Logo oficial Somos Noche" />
              <p className="eyebrow">SOMOS NOCHE TRANSPORTE</p>
              <div className="hero-badges" aria-label="Beneficios principales">
                <span>Reservas centralizadas</span>
                <span>Cotización inmediata</span>
                <span>Administración confiable</span>
              </div>
              <div className="hero-actions">
                <button className="hero-button" onClick={() => setView('cotizador-general')} aria-label="Abrir Cotización General">
                  Ver reservas por pueblo
                </button>
                <button className="hero-button" onClick={() => setView('express')} aria-label="Abrir búsqueda express">
                  Búsqueda express
                </button>
                {canAccessAdmin && (
                  <button className="hero-button" onClick={() => setView('admin')} aria-label="Abrir Admin">
                    Abrir administración
                  </button>
                )}
              </div>
            </section>

            <div className="quick-access-note" aria-label="Accesos rápidos de plataforma">
              <span>Acceso rápido:</span>
              <button className="quick-link" onClick={() => setView('pc')} aria-label="Instrucciones PC">PC</button>
              <button className="quick-link" onClick={() => setView('mobile')} aria-label="Instrucciones celular">Celular</button>
            </div>
            <div className="section-rights">{rightsText}</div>
          </div>
        )}

        {view === 'pc' && (
          <section className="details">
            <button className="back" onClick={() => setView(null)}>← Volver</button>
            <h2>Acceso desde PC</h2>
            <ol>
              <li>Abre una terminal en la carpeta del proyecto.</li>
              <li>Instala dependencias si todavía no lo hiciste: <code>npm install</code></li>
              <li>Inicia el entorno local con red visible: <code>npm run dev -- --host</code></li>
              <li>Abre la dirección local en el navegador del equipo: <a href="http://localhost:5173">http://localhost:5173</a></li>
              <li>Para abrirlo desde otro dispositivo, usa la IP que muestra la terminal.</li>
            </ol>
            <div style={{display: 'flex', gap: '0.5rem'}}>
              <button onClick={() => copyToClipboard('npm run dev -- --host')}>Copiar comando</button>
              <button onClick={() => window.open('http://localhost:5173', '_blank')}>Abrir en PC</button>
            </div>
            <div className="section-rights">{rightsText}</div>
          </section>
        )}

        {view === 'mobile' && (
          <section className="details">
            <button className="back" onClick={() => setView(null)}>← Volver</button>
            <h2>Acceso móvil</h2>
            <p><strong>URL actual:</strong> {currentUrl}</p>
            <ol>
              <li>Asegúrate de que el teléfono esté en la misma red Wi‑Fi que el PC.</li>
              <li>Abre la URL en <strong>Safari</strong> o en tu navegador habitual si usas Android.</li>
              <li>Para instalar en la pantalla de inicio, usa la opción de compartir y añade el acceso directo.</li>
              <li>Si necesitas HTTPS, publícalo o usa un túnel temporal.</li>
            </ol>
            <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
              <button onClick={() => copyToClipboard(currentUrl)}>Copiar URL actual</button>
              {deferredPrompt && (
                <button onClick={installApp}>Instalar (Android/Chrome)</button>
              )}
            </div>
            <p style={{marginTop: '0.75rem', color: '#666'}}>Nota: En iPhone la instalación se hace desde Safari → Compartir → Añadir a pantalla de inicio. El botón de "Instalar" integrado solo funciona en navegadores que soportan el evento <code>beforeinstallprompt</code> (generalmente Chrome/Android).</p>
            <div className="section-rights">{rightsText}</div>
          </section>
        )}

        {view === 'cotizador' && (
          <section className="details">
            <button className="back" onClick={() => setView(null)}>← Volver</button>
            <h2>Cotizador</h2>
            <p>Motor de cotización integrado para calcular precios con rapidez y mantener una operación más ordenada.</p>
            <div style={{marginTop: '1rem'}}>
              <LazyViewErrorBoundary>
                <QuoteEngine key="quote-engine-v2" />
              </LazyViewErrorBoundary>
            </div>
            <div className="section-rights">{rightsText}</div>
          </section>
        )}

        {view === 'cotizador-general' && (
          <section className="details">
            <button className="back" onClick={() => setView(null)}>← Volver</button>
            <h2>Reservas por pueblo</h2>
            <div style={{marginTop: '1rem'}}>
              <LazyViewErrorBoundary>
                <GeneralQuote
                  canManageSheets={canManagePassengerSheets}
                  canEditDemand={canEditPassengerDemand}
                  canEditPricing={canEditPassengerPricing}
                  readOnly={isReadOnlyRole}
                />
              </LazyViewErrorBoundary>
            </div>
            <div className="section-rights">{rightsText}</div>
          </section>
        )}

        {view === 'express' && (
          <LazyViewErrorBoundary>
            <ExpressSearch onBack={() => setView(null)} />
          </LazyViewErrorBoundary>
        )}

        {view === 'admin' && (
          <section className="details">
            <button className="back" onClick={() => setView(null)}>← Volver</button>
            <h2>Administración</h2>
            <p>Gestión de datos, rutas y vehículos con una interfaz más estable y clara.</p>
            {canAccessAdmin ? (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setAdminSegment('operations')}
                    style={{ opacity: adminSegment === 'operations' ? 1 : 0.75 }}
                  >
                    Configuración de rutas y transporte
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setAdminSegment('access')}
                      style={{ opacity: adminSegment === 'access' ? 1 : 0.75 }}
                    >
                      Accesos y usuarios
                    </button>
                  )}
                </div>

                {adminSegment === 'operations' && canManageOperationData && <AdminPanel />}
                {adminSegment === 'access' && isOwner && <UserManagementPanel actorProfile={currentProfile} />}
              </>
            ) : (
              <p>No tienes permisos para ingresar al panel de administración.</p>
            )}
            <div className="section-rights">{rightsText}</div>
          </section>
        )}

          </>
        )}

      </main>

      <footer className="app-footer">
        <small>Diseñado para una operación moderna y profesional</small>
        <small className="creator-credit">Derechos de autor y dueño de la app: Marcos Orts | Contacto: 3583596542</small>
      </footer>
    </div>
  )
}
