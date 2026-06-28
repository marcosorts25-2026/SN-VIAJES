import React from 'react'

export default function LoginPanel({ onLogin, onCreateFirstOwner, loading, loadingAction, errorText, authUnavailable, firebaseConnection, canCreateFirstOwner }) {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  const connectionStatus = String(firebaseConnection?.status || 'checking')
  const connectionMessage = String(firebaseConnection?.message || 'Comprobando conexión...')
  const statusColor = connectionStatus === 'ok' ? '#2e7d32' : (connectionStatus === 'error' ? '#c62828' : '#6b7280')
  const statusLabel = connectionStatus === 'ok' ? 'Firebase conectado' : (connectionStatus === 'error' ? 'Firebase sin conexión' : 'Comprobando Firebase')

  function submit(event) {
    event.preventDefault()
    onLogin?.({ email, password })
  }

  function createFirstOwner(event) {
    event.preventDefault()
    onCreateFirstOwner?.({ email, password })
  }

  return (
    <section className="details" style={{ maxWidth: 480, margin: '1.5rem auto' }}>
      <h2>Ingreso de usuarios</h2>
      <p>Accede con tu usuario y contraseña para usar la app.</p>

      <div style={{ border: `1px solid ${statusColor}`, background: '#ffffff', color: statusColor, borderRadius: 8, padding: '8px 10px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
        <strong>{statusLabel}</strong>
        <span style={{ opacity: 0.85 }}>{connectionMessage}</span>
      </div>

      {authUnavailable && (
        <div style={{ border: '1px solid #c62828', background: '#fff3f3', color: '#8a1c1c', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          No se pudo conectar con Firebase Authentication. Verifica public/firebase-config.json.
        </div>
      )}

      {errorText && (
        <div style={{ border: '1px solid #c62828', background: '#fff3f3', color: '#8a1c1c', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          {errorText}
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={event => setPassword(event.target.value)}
          required
        />
        <button type="submit" disabled={loading || authUnavailable}>
          {loadingAction === 'login' ? 'Ingresando...' : 'Ingresar'}
        </button>
        {canCreateFirstOwner && (
          <button type="button" onClick={createFirstOwner} disabled={loading || authUnavailable}>
            {loadingAction === 'create' ? 'Procesando...' : 'Crear primer propietario'}
          </button>
        )}
      </form>

      {canCreateFirstOwner && (
        <p style={{ marginTop: 10, opacity: 0.85 }}>
          Si eres propietario y aún no tienes usuario, crea el primer usuario desde Firebase Authentication y al primer ingreso quedará como owner automáticamente.
        </p>
      )}
    </section>
  )
}
