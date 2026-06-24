import React from 'react'
import QuoteEngine from './QuoteEngine'
import AdminPanel from './AdminPanel'
import GeneralQuote from './GeneralQuote'
import ExpressSearch from './ExpressSearch'
import visualLogo from './assets/somos-noche-logo.svg'

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

  React.useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
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
      </header>

      <div className="global-watermark" aria-hidden="true">
        <img src={visualLogo} alt="" />
      </div>

      <main className="app-main">
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
                <button className="hero-button" onClick={() => setView('admin')} aria-label="Abrir Admin">
                  Abrir administración
                </button>
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
                <GeneralQuote />
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
            <AdminPanel />
            <div className="section-rights">{rightsText}</div>
          </section>
        )}

      </main>

      <footer className="app-footer">
        <small>Diseñado para una operación moderna y profesional</small>
        <small className="creator-credit">Derechos de autor y dueño de la app: Marcos Orts | Contacto: 3583596542</small>
      </footer>
    </div>
  )
}
