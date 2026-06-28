import React from 'react'
import {
  ROLE_ADMIN,
  ROLE_LECTURA,
  ROLE_OPERADOR,
  ROLE_OPTIONS,
  listUserProfiles,
  createUserByManager,
  updateUserProfileByManager
} from './auth'

function roleLabel(role) {
  switch (String(role || '').toLowerCase()) {
    case 'owner': return 'Propietario'
    case 'admin': return 'Administrador'
    case 'operador': return 'Operador'
    default: return 'Solo lectura'
  }
}

function allowedRolesForActor(actorRole) {
  const normalized = String(actorRole || '').toLowerCase()
  if (normalized === 'owner') return ROLE_OPTIONS
  if (normalized === 'admin') return [ROLE_OPERADOR, ROLE_LECTURA]
  return []
}

export default function UserManagementPanel({ actorProfile }) {
  const [users, setUsers] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [busyUid, setBusyUid] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [errorText, setErrorText] = React.useState('')

  const [form, setForm] = React.useState({
    name: '',
    email: '',
    password: '',
    role: ROLE_OPERADOR
  })

  const actorRole = String(actorProfile?.role || '').toLowerCase()
  const allowedRoles = allowedRolesForActor(actorRole)

  async function refreshUsers() {
    setLoading(true)
    setErrorText('')
    try {
      const list = await listUserProfiles()
      setUsers(list)
    } catch (error) {
      setErrorText(error?.message || 'No se pudo cargar la lista de usuarios')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    refreshUsers()
  }, [])

  async function submitCreate(event) {
    event.preventDefault()
    setMessage('')
    setErrorText('')

    try {
      await createUserByManager(actorProfile, form)
      setMessage('Usuario creado correctamente')
      setForm({ name: '', email: '', password: '', role: ROLE_OPERADOR })
      await refreshUsers()
    } catch (error) {
      setErrorText(error?.message || 'No se pudo crear el usuario')
    }
  }

  async function updateUser(targetUid, updates) {
    setBusyUid(targetUid)
    setMessage('')
    setErrorText('')
    try {
      await updateUserProfileByManager(actorProfile, targetUid, updates)
      setMessage('Usuario actualizado')
      await refreshUsers()
    } catch (error) {
      setErrorText(error?.message || 'No se pudo actualizar el usuario')
    } finally {
      setBusyUid('')
    }
  }

  return (
    <section style={{ marginTop: '.75rem', border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
      <h3>Usuarios y roles</h3>
      <p>Crea usuarios, asigna rol y da de baja activando/desactivando acceso.</p>

      {message && <div style={{ border: '1px solid #2e7d32', background: '#f1fff3', color: '#1b5e20', borderRadius: 8, padding: 8, marginBottom: 8 }}>{message}</div>}
      {errorText && <div style={{ border: '1px solid #c62828', background: '#fff3f3', color: '#8a1c1c', borderRadius: 8, padding: 8, marginBottom: 8 }}>{errorText}</div>}

      <form onSubmit={submitCreate} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Nombre" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
          <input type="email" placeholder="Email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required />
          <input type="text" placeholder="Contraseña" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required />
          <select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}>
            {allowedRoles.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
          <button type="submit" disabled={!allowedRoles.length}>Crear usuario</button>
        </div>
      </form>

      {loading && <p>Cargando usuarios...</p>}
      {!loading && (
        <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Nombre</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Email</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Rol</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Estado</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const isSelf = user.uid === actorProfile?.uid
                const roleEditable = allowedRoles.includes(user.role)
                const canEdit = !isSelf && roleEditable
                return (
                  <tr key={user.uid}>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{user.name || '-'}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>{user.email || '-'}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                      {canEdit ? (
                        <select
                          value={user.role}
                          onChange={event => updateUser(user.uid, { role: event.target.value })}
                          disabled={busyUid === user.uid}
                        >
                          {allowedRoles.map(role => <option key={`${user.uid}-${role}`} value={role}>{roleLabel(role)}</option>)}
                        </select>
                      ) : roleLabel(user.role)}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                      {user.active ? 'Activo' : 'Inactivo'}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 6 }}>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => updateUser(user.uid, { active: !user.active })}
                          disabled={busyUid === user.uid}
                        >
                          {user.active ? 'Dar de baja' : 'Reactivar'}
                        </button>
                      )}
                      {!canEdit && <span>{isSelf ? 'Sesión actual' : 'Sin permiso'}</span>}
                    </td>
                  </tr>
                )
              })}
              {!users.length && (
                <tr>
                  <td colSpan={5} style={{ padding: 8 }}>No hay usuarios cargados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
