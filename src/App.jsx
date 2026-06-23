import React from 'react'
const CotizadorLazy = React.lazy(() => import('./QuoteEngine'))
const AdminLazy = React.lazy(() => import('./AdminPanel'))
const GeneralQuoteLazy = React.lazy(() => import('./GeneralQuote'))

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

  return (
    <div className="app">
      <header className="app-header">
        <h1>SOMOS NOCHE TRANSPORTE</h1>
        <p className="subtitle">PWA responsive — Funciona en celular y PC</p>
      </header>

      <main className="app-main">
        {deferredPrompt && (
          <button className="install-btn" onClick={installApp}>Instalar aplicación</button>
        )}

        {!view && (
          <div className="cards">
            <button className="card" onClick={() => setView('pc')} aria-label="Instrucciones PC">
              <h3>Usar en PC</h3>
              <p>Ejecuta <code>npm run dev -- --host</code> y abre la URL en tu navegador.</p>
            </button>

            <button className="card" onClick={() => setView('mobile')} aria-label="Instrucciones celular">
              <h3>Usar en celular</h3>
              <p>Abre la misma URL (IP del PC) desde tu celular en la misma red.</p>
            </button>

            <button className="card" onClick={() => setView('cotizador')} aria-label="Abrir Cotizador">
              <h3>Cotizador</h3>
              <p>Calcula precios según modalidad y capacidad. Prueba con datos de ejemplo.</p>
            </button>

            <button className="card" onClick={() => setView('cotizador-general')} aria-label="Abrir Cotización General">
              <h3>Cotización general</h3>
              <p>Agrega reservas desde varias localidades y asigna transportes automáticamente.</p>
            </button>

            <button className="card" onClick={() => setView('admin')} aria-label="Abrir Admin">
              <h3>Admin</h3>
              <p>Panel para exportar/importar datos JSON y restaurar valores de ejemplo.</p>
            </button>
          </div>
        )}

        {view === 'pc' && (
          <section className="details">
            <button className="back" onClick={() => setView(null)}>← Volver</button>
            <h2>Instrucciones para PC</h2>
            <ol>
              <li>Abre una terminal en la carpeta del proyecto.</li>
              <li>Instala dependencias si no lo hiciste: <code>npm install</code></li>
              <li>Inicia el servidor dev (exponer a la red): <code>npm run dev -- --host</code></li>
              <li>Abre en el navegador del PC: <a href="http://localhost:5173">http://localhost:5173</a></li>
              <li>Si quieres acceder desde otro dispositivo en la misma red, usa la IP que aparece en la terminal (ej. <code>http://192.168.18.82:5173</code>).</li>
            </ol>
            <div style={{display: 'flex', gap: '0.5rem'}}>
              <button onClick={() => copyToClipboard('npm run dev -- --host')}>Copiar comando</button>
              <button onClick={() => window.open('http://localhost:5173', '_blank')}>Abrir en PC</button>
            </div>
          </section>
        )}

        {view === 'mobile' && (
          <section className="details">
            <button className="back" onClick={() => setView(null)}>← Volver</button>
            <h2>Instrucciones para celular</h2>
            <p><strong>URL actual:</strong> {currentUrl}</p>
            <ol>
              <li>Asegúrate de que tu iPhone esté en la misma red Wi‑Fi que el PC (si usas IP local).</li>
              <li>Abre la URL en <strong>Safari</strong> (muy importante).</li>
              <li>Para instalar en pantalla de inicio: toca <em>Compartir</em> → <em>Añadir a pantalla de inicio</em> → <em>Añadir</em>.</li>
              <li>Si necesitas HTTPS (service worker), usa un túnel o publica la web (ngrok, vercel, netlify).</li>
            </ol>
            <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
              <button onClick={() => copyToClipboard(currentUrl)}>Copiar URL actual</button>
              {deferredPrompt && (
                <button onClick={installApp}>Instalar (Android/Chrome)</button>
              )}
            </div>
            <p style={{marginTop: '0.75rem', color: '#666'}}>Nota: En iPhone la instalación se hace desde Safari → Compartir → Añadir a pantalla de inicio. El botón de "Instalar" integrado solo funciona en navegadores que soportan el evento <code>beforeinstallprompt</code> (generalmente Chrome/Android).</p>
          </section>
        )}

        {view === 'cotizador' && (
          <section className="details">
            <button className="back" onClick={() => setView(null)}>← Volver</button>
            <h2>Cotizador</h2>
            <p>Motor de cotización básico integrado. Usa datos de ejemplo; luego puedo conectarlo a una base de datos real.</p>
            <div style={{marginTop: '1rem'}}>
              <LazyViewErrorBoundary>
                <React.Suspense fallback={<div>Cargando cotizador...</div>}>
                  <CotizadorLazy />
                </React.Suspense>
              </LazyViewErrorBoundary>
            </div>
          </section>
        )}

        {view === 'cotizador-general' && (
          <section className="details">
            <button className="back" onClick={() => setView(null)}>← Volver</button>
            <h2>Cotización general</h2>
            <div style={{marginTop: '1rem'}}>
              <LazyViewErrorBoundary>
                <React.Suspense fallback={<div>Cargando cotización general...</div>}>
                  <GeneralQuoteLazy />
                </React.Suspense>
              </LazyViewErrorBoundary>
            </div>
          </section>
        )}

        {view === 'admin' && (
          <section className="details">
            <button className="back" onClick={() => setView(null)}>← Volver</button>
            <h2>Panel Admin</h2>
            <p>Gestión básica de datos (localStorage).</p>
            <React.Suspense fallback={<div>Cargando admin...</div>}>
              <AdminLazy />
            </React.Suspense>
          </section>
        )}

      </main>

      <footer className="app-footer">
        <small>Hecho con Vite + React — PWA</small>
      </footer>
    </div>
  )
}
